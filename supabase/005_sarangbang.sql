-- ============================================================
-- 005 — 사랑방 소식(회차) · 접수증 · 문구 칩 즉시 게시
--
-- 지금까지 사랑방은 방명록이었다. 팬이 한 줄 남기고 → 며칠 기다리고 →
-- 올라간다. 끝. 자기 글이 어디쯤 있는지 알 방법이 없었다.
--
-- 이 마이그레이션이 바꾸는 것 셋.
--
--  ① 접수증 — 확인번호를 받고, 언제든 상태를 조회할 수 있다.
--     받음 → 사람이 읽음 → 올라감 → 제N신에 실림. 끝을 알 수 있다.
--
--  ② 회차 — 승인된 줄이 매월 1일 자동으로 묶여 나간다.
--     **스케줄러도 비밀키도 관리자 조작도 없다.** 뷰가 날짜에서 계산한다.
--     8월에 쓴 줄은 9월 1일이 되는 순간 제(8월)신에 실린다.
--     아무도 안 누른다. 운영자가 3주 손을 놔도 발행은 멈추지 않는다.
--
--  ③ 문구 칩 즉시 게시 — 사이트가 제시한 고정 문구를 그대로 보내면
--     검수 없이 바로 오른다. 자유 문장은 지금처럼 검수를 거친다.
--     그래야 검수가 밀려도 줄기가 죽지 않는다.
--     자유 텍스트를 인자로 받지 않으므로 이 통로로는 아무 말도 넣을 수 없다.
--
-- 001/003/004 의 보안 원칙 그대로.
-- 여러 번 실행해도 안전하다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. notes 에 칸 추가 (전부 nullable — 기존 행 무손상)
-- ------------------------------------------------------------
alter table public.notes add column if not exists kind    text;   -- 'line' | 'question'
alter table public.notes add column if not exists city    text;   -- '안동' 같은 지역 (선택)
alter table public.notes add column if not exists read_at timestamptz;  -- 사람이 실제로 연 시각
alter table public.notes add column if not exists preset  int;    -- 고정 문구로 올라온 줄

alter table public.notes drop constraint if exists notes_kind_ok;
alter table public.notes add  constraint notes_kind_ok
  check (kind is null or kind in ('line', 'question'));

-- ------------------------------------------------------------
-- 2. 회차 — 뷰가 날짜에서 계산한다. 발행 작업이 없다.
-- ------------------------------------------------------------
-- 제1신 = 2026년 8월분(2026-09-01 발행). 그 달에 오른 줄이 없으면
-- 그 호는 애초에 존재하지 않는다 — 빈 호가 생길 수 없는 구조다.
create or replace function public.issue_of(p_when timestamptz)
returns int language sql immutable
set search_path = public, pg_temp
as $fn$
  select greatest(1,
    (extract(year  from (p_when at time zone 'Asia/Seoul'))::int - 2026) * 12
  + (extract(month from (p_when at time zone 'Asia/Seoul'))::int) - 7)
$fn$;

-- 이번 달은 아직 발행 전이다. 지난달까지만 실린다.
create or replace view public.issue_notes
with (security_invoker = on) as
  select public.issue_of(created_at) as issue_no,
         id, song_key, song_title, song_year, name, city, body, kind, created_at
  from public.notes
  where status = 'approved'
    and date_trunc('month', created_at at time zone 'Asia/Seoul')
        < date_trunc('month', now()      at time zone 'Asia/Seoul')
  order by issue_no desc, created_at;

-- 호 목록 (발행일과 실린 줄 수). 줄이 0인 달은 아예 안 나온다.
create or replace view public.public_issues
with (security_invoker = on) as
  select issue_no,
         (date_trunc('month', min(created_at) at time zone 'Asia/Seoul')
           + interval '1 month')::date as published_on,
         count(*)::int as lines
  from public.issue_notes
  group by issue_no
  order by issue_no desc;

-- ------------------------------------------------------------
-- 3. 문구 칩 즉시 게시
--    자유 텍스트 인자가 없다. 칩 번호와 곡만 받는다.
--    그래서 이 통로로는 어떤 문장도 새로 넣을 수 없다.
-- ------------------------------------------------------------
create table if not exists public.presets (
  n     int primary key,
  ko    text not null,
  en    text not null
);

insert into public.presets (n, ko, en) values
  (1, '이 노래를 오래 좋아했습니다.', 'I''ve loved this one for a long time.'),
  (2, '오늘 처음 들었습니다.',        'I heard this for the first time today.'),
  (3, '다음 무대에서 듣고 싶어요.',   'I''d love to hear this live.'),
  (4, '그냥 인사드리러 왔습니다.',    'Just stopping by to say hello.')
on conflict (n) do update set ko = excluded.ko, en = excluded.en;

alter table public.presets enable row level security;
drop policy if exists "문구는 누구나 읽는다" on public.presets;
create policy "문구는 누구나 읽는다" on public.presets
  for select to anon, authenticated using (true);
grant select on public.presets to anon, authenticated;

create or replace function public.submit_preset(
  p_chip int, p_song_key text, p_song_title text, p_song_year text, p_name text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_text  text;
  v_token uuid;
begin
  -- 사이트가 가진 문구만. 목록에 없는 번호는 아무것도 만들지 못한다.
  select ko into v_text from public.presets where n = p_chip;
  if v_text is null then
    return json_build_object('ok', false, 'reason', 'bad_chip');
  end if;
  if not public.rate_ok('preset', 12) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- 검수를 건너뛰는 유일한 통로다. 사람이 쓴 문장이 아니라
  -- 사이트가 제시한 문구이므로 그럴 수 있다.
  insert into public.notes (song_key, song_title, song_year, name, body, status, preset, kind)
  values (nullif(btrim(left(coalesce(p_song_key, ''), 80)), ''),
          nullif(btrim(left(coalesce(p_song_title, ''), 120)), ''),
          nullif(btrim(left(coalesce(p_song_year, ''), 8)), ''),
          nullif(btrim(left(coalesce(p_name, ''), 20)), ''),
          v_text, 'approved', p_chip, 'line')
  returning token into v_token;

  return json_build_object('ok', true, 'token', v_token, 'instant', true);
end;
$fn$;

-- ------------------------------------------------------------
-- 4. 접수증 — 상태를 사실대로 알려 준다
-- ------------------------------------------------------------
create or replace function public.note_status(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r record;
begin
  if p_token is null then
    return json_build_object('ok', false, 'reason', 'bad_token');
  end if;
  if not public.rate_ok('nstat', 60) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select status, created_at, read_at,
         public.issue_of(created_at) as issue_no,
         (date_trunc('month', created_at at time zone 'Asia/Seoul')
           + interval '1 month')::date as issue_on
    into r
  from public.notes where token = p_token;

  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- 본문·이름은 돌려주지 않는다. 상태와 날짜만.
  return json_build_object(
    'ok', true,
    'status',  r.status,
    'made_at', r.created_at,
    'read_at', r.read_at,
    'issue',   r.issue_no,
    'issue_on', r.issue_on,
    'published', (r.status = 'approved'
                  and date_trunc('month', r.created_at at time zone 'Asia/Seoul')
                      < date_trunc('month', now() at time zone 'Asia/Seoul'))
  );
end;
$fn$;

-- ------------------------------------------------------------
-- 5. 사랑방의 상태 — 화면 문구가 실측에서 자동으로 바뀌게
--    사람이 손대야 정직해지는 화면은, 운영이 멈추는 순간 거짓말이 된다.
-- ------------------------------------------------------------
create or replace view public.sarangbang_state
with (security_invoker = on) as
  select
    (select max(read_at) from public.notes)                        as last_read_at,
    (select max(issue_no) from public.public_issues)               as last_issue,
    (select published_on from public.public_issues
       order by issue_no desc limit 1)                             as last_issue_on,
    (date_trunc('month', now() at time zone 'Asia/Seoul')
       + interval '1 month')::date                                 as next_issue_on,
    (select count(*)::int from public.notes where status = 'approved') as approved,
    (select count(distinct song_key)::int from public.notes
       where status = 'approved' and song_key is not null)         as songs;

-- ------------------------------------------------------------
-- 6. 권한
-- ------------------------------------------------------------
grant select on public.issue_notes, public.public_issues, public.sarangbang_state
  to anon, authenticated;
grant execute on function public.issue_of(timestamptz) to anon, authenticated;
grant execute on function public.submit_preset(int, text, text, text, text)
  to anon, authenticated;

-- ============================================================
-- 확인용
--
--   select * from public.sarangbang_state;
--   select * from public.public_issues;
--   select issue_no, count(*) from public.issue_notes group by issue_no;
--
-- 발행은 아무도 누르지 않는다. 달이 바뀌면 저절로 실린다.
-- ============================================================
