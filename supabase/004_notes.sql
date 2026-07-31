-- ============================================================
-- 004 — 한 줄 남기기
--
-- 사이트 전체의 자유 입력칸을 하나로 합친다.
-- 지금까지 편지·게시판·꿈으로 셋이었고, 방문자는 어디에 무엇을 써야
-- 하는지 알 수 없었다. 이제 곡 하나를 앞에 두고 한 줄만 남긴다.
--
-- 001/003 의 보안 원칙을 그대로 따른다.
--   · anon 은 표에 직접 쓰지 못한다. 쓰기는 security definer 함수로만
--   · status 는 함수가 'pending' 으로 못박는다. 인자로 받지 않는다
--   · 읽기는 승인된 행만 보이는 뷰로만
--   · search_path 를 잠근다
--
-- ── 이번에 새로 필요한 것: 취소 ──────────────────────────
-- 화면에서 "지금 지울 수 있어요"라고 말하려면 지울 수단이 있어야 한다.
-- 순번 id 로는 안 된다 — 남의 글도 지울 수 있게 된다.
-- 그래서 랜덤 uuid 토큰을 발급해 글쓴이에게만 돌려주고,
-- **어떤 공개 뷰에도 토큰을 넣지 않는다.**
-- 승인이 끝난 뒤에는 취소를 거절하고 그 사실을 사실대로 답한다.
--
-- 여러 번 실행해도 안전하다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 표
-- ------------------------------------------------------------
create table if not exists public.notes (
  id          bigint generated always as identity primary key,
  token       uuid not null default gen_random_uuid(),
  song_key    text,                              -- songs.json 의 k. 곡 없이 남길 수도 있다
  song_title  text,                              -- 그때 화면에 보이던 제목 (곡 목록이 바뀌어도 남게)
  song_year   text,
  name        text,
  body        text not null,
  status      text not null default 'pending',
  ai_verdict  text,
  ai_reason   text,
  ai_at       timestamptz,
  created_at  timestamptz not null default now(),
  constraint notes_status_ok check (status in ('pending', 'approved', 'rejected')),
  constraint notes_body_len  check (char_length(body) between 2 and 200)
);

alter table public.notes enable row level security;
revoke all on public.notes from anon, authenticated;

create unique index if not exists notes_token_uniq   on public.notes (token);
create index        if not exists notes_status_song  on public.notes (status, song_key);
create index        if not exists notes_status_made  on public.notes (status, created_at desc);

-- ------------------------------------------------------------
-- 2. 쓰기 — 함수로만. 토큰을 돌려준다.
-- ------------------------------------------------------------
create or replace function public.submit_note(
  p_song_key text, p_song_title text, p_song_year text, p_name text, p_body text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_body  text;
  v_token uuid;
begin
  v_body := btrim(coalesce(p_body, ''));

  if char_length(v_body) < 2 then
    return json_build_object('ok', false, 'reason', 'empty');
  end if;
  if char_length(v_body) > 200 then
    return json_build_object('ok', false, 'reason', 'too_long');
  end if;
  if not public.rate_ok('note', 10) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- status 를 여기서 못박는다. 호출자가 정할 수 없다.
  insert into public.notes (song_key, song_title, song_year, name, body, status)
  values (nullif(btrim(left(coalesce(p_song_key, ''), 80)), ''),
          nullif(btrim(left(coalesce(p_song_title, ''), 120)), ''),
          nullif(btrim(left(coalesce(p_song_year, ''), 8)), ''),
          nullif(btrim(left(coalesce(p_name, ''), 20)), ''),
          v_body, 'pending')
  returning token into v_token;

  return json_build_object('ok', true, 'token', v_token);
end;
$fn$;

-- 취소 — 아직 검수 전인 내 글만 지운다.
-- 이미 올라간 글은 지우지 않고 그 사실을 사실대로 답한다
-- (조용히 성공했다고 하면 화면이 거짓말을 하게 된다).
create or replace function public.cancel_note(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status text;
begin
  if p_token is null then
    return json_build_object('ok', false, 'reason', 'bad_token');
  end if;
  -- 토큰을 무차별로 넣어 보는 것을 막는다
  if not public.rate_ok('cancel', 20) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select status into v_status from public.notes where token = p_token;

  if v_status is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_status <> 'pending' then
    return json_build_object('ok', false, 'reason', 'already_published');
  end if;

  delete from public.notes where token = p_token and status = 'pending';
  return json_build_object('ok', true);
end;
$fn$;

-- 상태 조회 — 상태만 돌려준다. 본문·이름은 돌려주지 않는다.
-- ("어제 남기신 줄이 올라왔습니다"를 띄우기 위한 최소한의 창구다)
create or replace function public.note_status(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status text;
begin
  if p_token is null then
    return json_build_object('ok', false, 'reason', 'bad_token');
  end if;
  if not public.rate_ok('nstat', 60) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select status into v_status from public.notes where token = p_token;
  if v_status is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  return json_build_object('ok', true, 'status', v_status);
end;
$fn$;

-- ------------------------------------------------------------
-- 3. 읽기 — 승인된 것만. 토큰은 절대 내보내지 않는다.
-- ------------------------------------------------------------
create or replace view public.public_notes
with (security_invoker = on) as
  select id, song_key, song_title, song_year, name, body, created_at
  from public.notes
  where status = 'approved'
  order by created_at desc
  limit 200;

-- 몇 곡에 기억이 붙었는지. 곡별 개수는 내보내지 않는다
-- (개수를 곡마다 보여 주면 로그인 없는 사이트에서 곧 부풀리기 대상이 된다).
create or replace view public.notes_filled
with (security_invoker = on) as
  select count(distinct song_key)::int as songs
  from public.notes
  where status = 'approved' and song_key is not null;

drop policy if exists "승인된 줄만 공개" on public.notes;
create policy "승인된 줄만 공개" on public.notes
  for select to anon, authenticated using (status = 'approved');

grant select  on public.notes         to anon, authenticated;
grant select  on public.public_notes  to anon, authenticated;
grant select  on public.notes_filled  to anon, authenticated;
grant execute on function public.submit_note(text, text, text, text, text) to anon, authenticated;
grant execute on function public.cancel_note(uuid)  to anon, authenticated;
grant execute on function public.note_status(uuid)  to anon, authenticated;

-- ------------------------------------------------------------
-- 4. 검수 목록에 notes 를 추가 (운영자 전용)
-- ------------------------------------------------------------
drop view if exists public.moderation_queue;

create view public.moderation_queue as
  select 'note'   as kind, id, name, body as text, ai_verdict, ai_reason, created_at
    from public.notes   where status = 'pending'
  union all
  select 'letter' as kind, id, name, body as text, ai_verdict, ai_reason, created_at
    from public.letters where status = 'pending'
  union all
  select 'post'   as kind, id, name, body as text, ai_verdict, ai_reason, created_at
    from public.posts   where status = 'pending'
  union all
  select 'dream'  as kind, id, name, text,         ai_verdict, ai_reason, created_at
    from public.dreams  where status = 'pending'
  order by created_at;

revoke all on public.moderation_queue from anon, authenticated;

-- ============================================================
-- 확인용
--
--   select * from public.moderation_queue;            -- 검수 대기
--   select * from public.notes_filled;                -- 기억이 붙은 곡 수
--   select status, count(*) from public.notes group by status;
--
-- 검수가 얼마나 밀렸는지 (중앙값이 72시간을 넘으면 운영을 손봐야 한다):
--   select kind, now() - created_at as 기다린시간
--     from public.moderation_queue order by created_at;
--
-- 승인은 Table Editor 에서 notes 의 status 를 approved 로.
-- ============================================================
