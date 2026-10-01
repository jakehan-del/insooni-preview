-- ════════════════════════════════════════════════════════════════
--  008 · 운영자 화면 + 내 글 지우기   (2판 — 2026-10-01)
-- ------------------------------------------------------------------
--  ⚠️ 1판을 받으셨다면 그 파일은 쓰지 마세요. 이 2판만 실행하세요.
--     1판 실행 뒤 실서버를 점검하니 새 표·함수가 하나도 생기지 않았고,
--     그 과정에서 더 중요한 구멍을 찾았습니다(아래 0번).
--
--  매니저 요청(2026-10-01): "운영자가 지정되어 있어야 하고,
--  회원가입이 어렵다면 최소한 글 삭제 기능은 있어야 한다."
--
--  0. 공개 키로 원본 표가 통째로 읽히던 것을 칸 단위로 좁힌다 — 먼저.
--     004 가 notes 표에 select 를 통째로 열어 두었다(공개 뷰가 '부르는 사람
--     권한'으로 읽는 방식이라 표 권한이 필요했다). 그 바람에 승인된 글의
--     지우기용 토큰과 AI 검수 소견까지 공개 키로 읽혔다(실서버 실측).
--     기존 취소 함수는 '검수 전' 글만 지워서 지금까지는 해가 없었지만,
--     아래 7번(올라간 글도 지우기)이 켜지는 순간 누구든 남의 글을 지울 수 있게 된다.
--     그래서 7번보다 먼저, 같은 묶음 안에서 닫는다.
--
--  ① 운영자 — 사이트 안 관리 화면(/admin)에서 승인·내리기를 한다.
--     로그인은 Supabase 인증(이메일 + 비밀번호), 아래 운영자 명단에 있는
--     사람만 통과한다. 명단에 없는 계정은 로그인해도 아무것도 못 본다.
--  ② 내 글 지우기 — 쓴 사람이 자기 한 줄을 언제든 지운다(쓴 기기의 토큰으로).
--
--  안전합니다.
--    · 전체가 한 묶음(begin … commit)입니다. 중간에 하나라도 실패하면
--      아무것도 바뀌지 않습니다.
--    · 맨 끝의 안전장치가 공개 키 권한으로 모든 공개 뷰를 실제로 읽어 봅니다.
--      화면이 하나라도 깨지거나 토큰이 아직 읽히면 스스로 전체를 취소합니다.
--    · 기존 함수는 고치지 않습니다(cancel_note 는 옛 화면을 캐시한 기기용으로 둡니다).
--    · 여러 번 실행해도 결과가 같습니다.
--
--  실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
--  성공하면 아래쪽 결과 창에 ✅ 표가 뜹니다. 그 화면을 보내 주세요.
--  그다음 맨 아래 「운영자 등록」을 이메일만 바꿔서 따로 실행하세요.
-- ════════════════════════════════════════════════════════════════

begin;


-- ── 0. 원본 표는 칸 단위로만 연다 ──────────────────────────────
--  공개 뷰가 실제로 쓰는 칸만 연다(뷰 정의에서 뽑았다). 닫는 칸:
--    notes   — token(지우기 열쇠) · ai_verdict · ai_reason · ai_at · preset
--    letters · posts · dreams — ai_verdict · ai_reason · ai_at
--  '마지막으로 읽은 날'(read_at)은 이미 공개 문구라 연다(sarangbang_state 가 쓴다).
revoke select on public.notes   from anon, authenticated;
grant  select (id, song_key, song_title, song_year, name, city, body, kind,
               status, created_at, read_at)
       on public.notes   to anon, authenticated;

revoke select on public.letters from anon, authenticated;
grant  select (id, name, category, body, status, created_at)
       on public.letters to anon, authenticated;

revoke select on public.posts   from anon, authenticated;
grant  select (id, name, body, status, created_at)
       on public.posts   to anon, authenticated;

revoke select on public.dreams  from anon, authenticated;
grant  select (id, name, text, status, created_at)
       on public.dreams  to anon, authenticated;


-- ── 1. 운영자 명단 ─────────────────────────────────────────────
--  사람 단위로 넣고 뺀다. 공용 암호 하나를 나눠 쓰면 한 사람을 빼려고
--  모두의 암호를 바꿔야 하고, 누가 무엇을 승인했는지도 남지 않는다.
create table if not exists public.admins (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  email     text not null,
  memo      text,
  added_at  timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;


-- ── 2. 처리 기록 ───────────────────────────────────────────────
--  누가 언제 무엇을 올리고 내렸는지. 운영자가 둘 이상이 되는 순간 필요하다.
--  본문은 적지 않는다 — 번호와 상태만. 팬이 지운 글의 내용이 여기 남으면
--  '지웠다'는 말이 거짓이 된다.
create table if not exists public.moderation_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  user_id      uuid,                 -- 팬이 스스로 지웠으면 비어 있다
  email        text,
  kind         text not null,        -- note · dream · letter · post
  item_id      bigint not null,
  from_status  text,
  to_status    text not null         -- pending · approved · rejected · withdrawn
);
alter table public.moderation_log enable row level security;
revoke all on public.moderation_log from anon, authenticated;


-- ── 3. 지금 로그인한 사람이 운영자인가 ─────────────────────────
--  auth.uid() 는 Supabase 가 서명을 검증한 로그인 토큰에서 읽는다.
--  공개 키만 가진 요청에는 값이 없으므로 여기서 false 가 된다.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select auth.uid() is not null
     and exists (select 1 from public.admins where user_id = auth.uid());
$fn$;


-- ── 4. 관리 화면 첫 화면 — 나는 누구인가 ──────────────────────
create or replace function public.admin_whoami()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  return json_build_object(
    'ok',        true,
    'signed_in', auth.uid() is not null,
    'admin',     public.is_admin(),
    'email',     coalesce(auth.jwt() ->> 'email', ''));
end;
$fn$;


-- ── 5. 목록 — 네 표를 한 줄로 ─────────────────────────────────
--  사랑방의 한 줄(notes)·꿈(dreams)·옛 편지(letters)·옛 글(posts).
--  표마다 본문 칸 이름이 달라(body / text) 여기서 content 로 맞춘다.
create or replace function public.admin_list(
  p_status text default 'pending',
  p_limit  int  default 200)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_limit  int := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_rows   json;
  v_counts json;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'rejected') then
    return json_build_object('ok', false, 'reason', 'bad_status');
  end if;

  select coalesce(json_agg(r), '[]'::json) into v_rows
  from (
    select 'note'::text as kind, id, name, body as content, status,
           ai_verdict, ai_reason, created_at, preset, song_title
      from public.notes   where status = p_status
    union all
    select 'dream',  id, name, text, status, ai_verdict, ai_reason, created_at, null::int, null::text
      from public.dreams  where status = p_status
    union all
    select 'letter', id, name, body, status, ai_verdict, ai_reason, created_at, null::int, null::text
      from public.letters where status = p_status
    union all
    select 'post',   id, name, body, status, ai_verdict, ai_reason, created_at, null::int, null::text
      from public.posts   where status = p_status
    order by created_at desc
    limit v_limit
  ) r;

  -- 탭 머리의 숫자. 세 상태를 한 번에 센다.
  select json_build_object(
    'pending',  (select count(*) from public.notes   where status = 'pending')
              + (select count(*) from public.dreams  where status = 'pending')
              + (select count(*) from public.letters where status = 'pending')
              + (select count(*) from public.posts   where status = 'pending'),
    'approved', (select count(*) from public.notes   where status = 'approved')
              + (select count(*) from public.dreams  where status = 'approved')
              + (select count(*) from public.letters where status = 'approved')
              + (select count(*) from public.posts   where status = 'approved'),
    'rejected', (select count(*) from public.notes   where status = 'rejected')
              + (select count(*) from public.dreams  where status = 'rejected')
              + (select count(*) from public.letters where status = 'rejected')
              + (select count(*) from public.posts   where status = 'rejected'))
  into v_counts;

  return json_build_object('ok', true, 'rows', v_rows, 'counts', v_counts);
end;
$fn$;


-- ── 6. 올리기 · 내리기 ─────────────────────────────────────────
--  표 이름을 문자열로 받아 SQL 에 끼워 넣지 않는다(동적 SQL 을 쓰지 않는다).
--  정해진 네 가지만 갈래로 나눠 적는다 — 그 밖의 값은 bad_kind 로 끝난다.
--
--  read_at 은 건드리지 않는다. 사랑방에 '마지막으로 읽은 날'로 공개되는
--  칸이다. 매니저가 승인한 날이 인순이가 읽은 날로 둔갑하면 안 된다.
create or replace function public.admin_set_status(
  p_kind   text,
  p_id     bigint,
  p_status text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from text;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_status is null or p_status not in ('pending', 'approved', 'rejected') then
    return json_build_object('ok', false, 'reason', 'bad_status');
  end if;
  if p_id is null then
    return json_build_object('ok', false, 'reason', 'bad_id');
  end if;

  if p_kind = 'note' then
    select status into v_from from public.notes where id = p_id for update;
    if found then update public.notes set status = p_status where id = p_id; end if;
  elsif p_kind = 'dream' then
    select status into v_from from public.dreams where id = p_id for update;
    if found then update public.dreams set status = p_status where id = p_id; end if;
  elsif p_kind = 'letter' then
    select status into v_from from public.letters where id = p_id for update;
    if found then update public.letters set status = p_status where id = p_id; end if;
  elsif p_kind = 'post' then
    select status into v_from from public.posts where id = p_id for update;
    if found then update public.posts set status = p_status where id = p_id; end if;
  else
    return json_build_object('ok', false, 'reason', 'bad_kind');
  end if;

  if v_from is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.moderation_log (user_id, email, kind, item_id, from_status, to_status)
  values (auth.uid(), auth.jwt() ->> 'email', p_kind, p_id, v_from, p_status);

  return json_build_object('ok', true, 'kind', p_kind, 'id', p_id,
                           'from', v_from, 'status', p_status);
end;
$fn$;


-- ── 7. 내 글 지우기 — 쓴 사람이, 상태와 관계없이 ────────────────
--  토큰은 쓴 기기의 브라우저에만 있고 어떤 공개 뷰에도 나오지 않는다.
--  난수 122비트라 맞혀 볼 수 없지만, 무차별로 넣어 보는 것은 속도 제한으로 막는다.
--  운영자 '내리기'와 달리 이것은 실제로 지운다 — 팬이 자기 말을 거두는 것이므로
--  이름·본문이 서버에 남아 있으면 안 된다. 기록에는 번호와 상태만 남는다.
create or replace function public.withdraw_note(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id     bigint;
  v_status text;
begin
  if p_token is null then
    return json_build_object('ok', false, 'reason', 'bad_token');
  end if;
  if not public.rate_ok('withdraw', 20) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  delete from public.notes where token = p_token
    returning id, status into v_id, v_status;

  if v_id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.moderation_log (kind, item_id, from_status, to_status)
  values ('note', v_id, v_status, 'withdrawn');

  return json_build_object('ok', true, 'was', v_status);
end;
$fn$;


-- ── 8. 누가 무엇을 부를 수 있나 ────────────────────────────────
--  Supabase 는 public 스키마의 새 함수를 anon·authenticated 에게 자동으로 연다.
--  그래서 운영자 함수는 명시적으로 닫고, 로그인한 사람에게만 다시 연다.
--  (로그인했어도 명단에 없으면 함수 안에서 forbidden 으로 끝난다 — 문이 두 겹이다)
revoke execute on function public.is_admin()                            from public, anon, authenticated;
revoke execute on function public.admin_whoami()                        from public, anon;
revoke execute on function public.admin_list(text, int)                 from public, anon;
revoke execute on function public.admin_set_status(text, bigint, text)  from public, anon;
grant  execute on function public.admin_whoami()                        to authenticated;
grant  execute on function public.admin_list(text, int)                 to authenticated;
grant  execute on function public.admin_set_status(text, bigint, text)  to authenticated;
grant  execute on function public.withdraw_note(uuid)                   to anon, authenticated;


-- ── 9. 안전장치 — 공개 키 권한으로 실제로 읽어 본다 ─────────────
--  하나라도 실패하면 예외가 나고, 위의 모든 변경이 함께 취소된다.
do $chk$
begin
  set local role anon;

  -- 화면이 쓰는 공개 뷰는 전부 그대로 읽혀야 한다
  perform * from public.public_notes     limit 1;
  perform * from public.notes_filled     limit 1;
  perform * from public.issue_notes      limit 1;
  perform * from public.public_issues    limit 1;
  perform * from public.sarangbang_state limit 1;
  perform * from public.public_letters   limit 1;
  perform * from public.public_posts     limit 1;
  perform * from public.public_dreams    limit 1;
  perform * from public.public_cheers    limit 1;
  perform * from public.song_tally       limit 1;
  perform * from public.presets          limit 1;

  -- 지우기 열쇠(토큰)는 읽히면 안 된다
  begin
    perform token from public.notes limit 1;
    raise exception '안전장치: 공개 키로 토큰 칸이 아직 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null;
  end;
  -- AI 검수 소견도
  begin
    perform ai_reason from public.notes limit 1;
    raise exception '안전장치: 공개 키로 AI 소견이 아직 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null;
  end;
  -- 운영자 함수는 공개 키로 불리면 안 된다
  begin
    perform public.admin_list('pending', 1);
    raise exception '안전장치: 공개 키로 운영자 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null;
  end;

  reset role;
end
$chk$;

-- 사이트(PostgREST)가 새 함수·표를 바로 알아보게 한다.
-- 1판 실행 뒤 '찾을 수 없음'이 났던 원인 후보 하나를 여기서 지운다.
notify pgrst, 'reload schema';

commit;


-- ── 10. 확인표 — 결과 창에 뜬다 ──────────────────────────────
select 점검, 결과 from (
  select 번호, 점검, case when 결과 then '✅' else '❌' end as 결과
  from (values
    (1, '운영자 명단 표가 생겼다',                    to_regclass('public.admins') is not null),
    (2, '처리 기록 표가 생겼다',                      to_regclass('public.moderation_log') is not null),
    (3, '공개 키로 지우기 토큰을 못 읽는다',           not has_column_privilege('anon', 'public.notes', 'token', 'SELECT')),
    (4, '공개 키로 AI 검수 소견을 못 읽는다',          not has_column_privilege('anon', 'public.notes', 'ai_reason', 'SELECT')),
    (5, '공개 키로 운영자 함수를 못 부른다',           not has_function_privilege('anon', 'public.admin_list(text, integer)', 'EXECUTE')),
    (6, '로그인한 사람은 운영자 함수를 부를 수 있다',   has_function_privilege('authenticated', 'public.admin_list(text, integer)', 'EXECUTE')),
    (7, '팬은 내 글 지우기를 부를 수 있다',             has_function_privilege('anon', 'public.withdraw_note(uuid)', 'EXECUTE')),
    (8, '사랑방 공개 뷰는 그대로 읽힌다',              has_table_privilege('anon', 'public.public_notes', 'SELECT'))
  ) as t(번호, 점검, 결과)
  union all
  select 9, '등록된 운영자 ' || (select count(*) from public.admins)::text || '명 (0명이면 아래 「운영자 등록」을 실행)', 'ℹ️'
) x
order by 번호;


-- ════════════════════════════════════════════════════════════════
--  운영자 등록 — 위를 실행한 뒤, 사람마다 한 번씩
-- ------------------------------------------------------------------
--  1) 대시보드 → Authentication → Users → Add user → Create new user
--     이메일과 비밀번호를 넣고 「Auto Confirm User」를 체크합니다.
--     (확인 메일을 보내지 않고 바로 쓸 수 있는 계정이 됩니다)
--  2) 아래 줄의 이메일만 바꿔서 실행합니다.
--
--  insert into public.admins (user_id, email, memo)
--  select id, email, '매니저' from auth.users where email = 'manager@example.com'
--  on conflict (user_id) do nothing;
--
--  운영자에서 빼기 (계정은 남고 관리 권한만 사라집니다):
--  delete from public.admins where email = 'manager@example.com';
--
--  권장: Authentication → Sign In / Providers 에서 「Allow new users to sign up」을
--  끄세요. 꺼 두지 않아도 명단에 없는 사람은 아무것도 못 하지만, 문을 하나 더 잠급니다.
-- ════════════════════════════════════════════════════════════════
