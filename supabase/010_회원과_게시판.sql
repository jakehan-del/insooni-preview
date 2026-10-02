-- ═════════════════════════════════════════════════
--  010 · 회원 · 등업 · 게시판 · 댓글   (2026-10-02)
-- ------------------------------------------------------------------
--  매니저 요청(2026-10-01) — "팬카페는 운영자가 지정되어 있고, 일정 활동
--  (글 작성·댓글)을 남겨야 등업이 돼서 팬카페 활동을 할 수 있다."
--  형님 결정(2026-10-02):
--    · 로그인: 카카오 + 이메일 둘 다 (Supabase 인증이 맡는다 — 이 파일은 회원 '명부'만 만든다)
--    · 등업: 운영자가 올린 글 3개 + 댓글 5개 → 자동으로 정회원. 운영자는 언제든 직접 올리고 내린다
--    · 정회원의 글·댓글은 검수 없이 바로 공개. 새싹의 글·댓글은 운영자가 올려야 보인다
--    · 로그인 없는 '한 줄 남기기'는 그대로 둔다
--
--  ⓘ 009 를 아직 실행하지 않았어도 이 파일 하나면 된다. 009 의 알림 함수(pending_summary)를
--    게시판 글·댓글까지 세도록 새로 정의한다.
--
--  지킨 것
--    · 표는 전부 잠근다. 읽기도 쓰기도 함수로만 — 남의 글을 고치거나 스스로 등업할 길이 없다.
--    · 이메일·카카오 계정 정보는 공개 목록에 나오지 않는다. 공개되는 것은 별명과 등급뿐이다.
--    · '인순이'·'운영자'·'관리자'·'공식' 같은 별명은 쓸 수 없다 — 공식 사이트에서 사칭은 치명적이다.
--    · 탈퇴하면 그 사람의 글·댓글·명부가 함께 지워진다(개인정보 파기). 운영자 계정은 여기서 탈퇴하지 않는다.
--    · 운영자 '내리기'는 지우지 않는다(status 만 바꾼다). 지우는 것은 쓴 사람 자신뿐이다.
--    · 기존 표·함수 중 바꾸는 것은 운영자 목록(admin_list)·상태 바꾸기(admin_set_status)·
--      알림(pending_summary) 셋뿐이고, 008 의 규칙(read_at 손대지 않기·기록 남기기)을 그대로 잇는다.
--
--  안전합니다.
--    · 전체가 한 묶음(begin … commit). 하나라도 실패하면 아무것도 안 바뀝니다.
--    · 맨 끝 안전장치가 공개 키·로그인 권한으로 직접 불러 봐서, 표가 하나라도 열려 있거나
--      막혀야 할 함수가 불리면 스스로 전체를 취소합니다.
--    · 여러 번 실행해도 결과가 같습니다.
--
--  실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
--  성공하면 결과 창에 ✅ 표가 뜹니다.
-- ═════════════════════════════════════════════════

begin;

-- ── 1. 회원 명부 ───────────────────────────────────────────────
--  로그인 계정(auth.users) 하나에 회원 한 줄. 로그인만 하고 가입(별명·동의)을 안 마친
--  계정은 명부에 없다 — 글을 쓸 수 없다.
--  level: sprout(새싹) · member(정회원) · blocked(차단)
--  level_by: auto(기준을 채워 저절로) · admin(운영자가 정함 — 그 뒤로는 자동이 덮어쓰지 않는다)
create table if not exists public.members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null,
  level      text not null default 'sprout',
  level_by   text not null default 'auto',
  level_at   timestamptz not null default now(),
  joined_at  timestamptz not null default now(),
  agreed_at  timestamptz not null,
  constraint members_level_ok    check (level in ('sprout', 'member', 'blocked')),
  constraint members_level_by_ok check (level_by in ('auto', 'admin')),
  constraint members_nick_len    check (char_length(nickname) between 2 and 12)
);

-- 별명 비교용 — 띄어쓰기·기호를 빼고 소문자로. '인 순 이'와 '인순이'를 같은 이름으로 본다.
create or replace function public.nick_norm(p text)
returns text
language sql
immutable
as $fn$
  select lower(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z가-힣]', '', 'g'));
$fn$;

create unique index if not exists members_nick_uq on public.members (public.nick_norm(nickname));

alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;


-- ── 2. 게시판 글 · 댓글 ────────────────────────────────────────
create table if not exists public.board_posts (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.members (user_id) on delete cascade,
  title       text not null,
  body        text not null,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  constraint bp_status_ok check (status in ('pending', 'approved', 'rejected')),
  constraint bp_title_len check (char_length(title) between 2 and 60),
  constraint bp_body_len  check (char_length(body) between 2 and 4000)
);
create index if not exists bp_status_id on public.board_posts (status, id desc);
create index if not exists bp_user      on public.board_posts (user_id);

create table if not exists public.board_comments (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.board_posts (id) on delete cascade,
  user_id     uuid not null references public.members (user_id) on delete cascade,
  body        text not null,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  constraint bc_status_ok check (status in ('pending', 'approved', 'rejected')),
  constraint bc_body_len  check (char_length(body) between 1 and 1000)
);
create index if not exists bc_post on public.board_comments (post_id, id);
create index if not exists bc_user on public.board_comments (user_id);

alter table public.board_posts    enable row level security;
alter table public.board_comments enable row level security;
revoke all on public.board_posts    from anon, authenticated;
revoke all on public.board_comments from anon, authenticated;


-- ── 3. 등업 기준 · 등급 기록 ───────────────────────────────────
--  기준 숫자는 여기 한 곳에만 있다. 바꾸려면 Table Editor 에서 board_settings 의 value 만 고친다.
create table if not exists public.board_settings (
  key    text primary key,
  value  int  not null,
  note   text
);
insert into public.board_settings (key, value, note) values
  ('levelup_posts',    3, '정회원이 되려면 운영자가 올린(또는 바로 공개된) 글이 몇 개 있어야 하나'),
  ('levelup_comments', 5, '정회원이 되려면 공개된 댓글이 몇 개 있어야 하나')
on conflict (key) do nothing;
alter table public.board_settings enable row level security;
revoke all on public.board_settings from anon, authenticated;

--  별명을 바꾼 기록 — 공개된 글의 작성자 이름이 조용히 바뀌는 것을 운영자가 볼 수 있게(검토 지적).
create table if not exists public.member_name_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  target     uuid not null references public.members (user_id) on delete cascade,
  from_name  text,
  to_name    text not null
);
alter table public.member_name_log enable row level security;
revoke all on public.member_name_log from anon, authenticated;

--  누가 언제 누구의 등급을 바꿨나. 탈퇴하면 그 사람에 관한 기록도 함께 지워진다.
create table if not exists public.member_level_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  by_user     uuid,                -- 비어 있으면 자동 등업
  by_email    text,
  target      uuid not null references public.members (user_id) on delete cascade,
  from_level  text,
  to_level    text not null,
  why         text not null        -- auto · admin
);
alter table public.member_level_log enable row level security;
revoke all on public.member_level_log from anon, authenticated;


-- ── 4. 안쪽 도우미 (밖에서 못 부른다) ──────────────────────────
create or replace function public.bs(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce((select value from public.board_settings where key = p_key), p_default);
$fn$;

-- 별명이 쓸 수 없는 이유 — 쓸 수 있으면 null
create or replace function public.nick_reason(p text)
returns text
language plpgsql
immutable
as $fn$
declare
  s text := btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'));
  n text := public.nick_norm(p);
  -- 닮은 글자를 접는다: lNSOONI·ins00ni·1nsooni 가 INSOONI 로 보이는 것을 막으려고(검토에서 재현)
  f text := translate(public.nick_norm(p), 'l10', 'iio');
begin
  if char_length(s) < 2 or char_length(s) > 12 or char_length(n) < 2 then
    return 'bad_nick_len';
  end if;
  if s !~ '^[0-9A-Za-z가-힣 _.-]+$' then
    return 'bad_nick_char';
  end if;
  -- 아티스트 이름은 '들어 있기만 해도' 막는다 — '가수 인순이'·'인순이 본인'·'인순이1' 이 통과했다(검토).
  -- '인순이팬' 같은 팬 이름도 함께 막힌다. 공식 사이트에서 사칭 하나가 팬 이름 하나보다 훨씬 비싸다.
  if f ~ '(인순이|김인순|insooni|insoon|kiminsoon|해밀학교)'
     or regexp_replace(n, '[0-9]', '', 'g') in ('인순', '해밀') then
    return 'reserved_nick';
  end if;
  if n ~ '(운영자|관리자|운영진|운영팀|관리팀|공식|스태프|admin|official|staff|manager|매니저)' then
    return 'reserved_nick';
  end if;
  return null;
end;
$fn$;

-- 기준을 채운 새싹을 정회원으로. 운영자가 한 번 등급을 정한 사람(level_by=admin)은 건드리지 않는다.
create or replace function public.member_recheck(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_level text;
  v_by    text;
  v_np    int;
  v_nc    int;
begin
  select level, level_by into v_level, v_by from public.members where user_id = p_user for update;
  if not found or v_level <> 'sprout' or v_by <> 'auto' then
    return false;
  end if;
  select count(*) into v_np from public.board_posts    where user_id = p_user and status = 'approved';
  select count(*) into v_nc from public.board_comments where user_id = p_user and status = 'approved';
  if v_np >= public.bs('levelup_posts', 3) and v_nc >= public.bs('levelup_comments', 5) then
    update public.members set level = 'member', level_at = now() where user_id = p_user;
    insert into public.member_level_log (target, from_level, to_level, why)
    values (p_user, 'sprout', 'member', 'auto');
    return true;
  end if;
  return false;
end;
$fn$;


-- ── 5. 나 — 로그인한 사람의 회원 상태 ─────────────────────────
create or replace function public.member_me()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_app  jsonb;
  v_meta jsonb;
  m      public.members%rowtype;
  v_np   int;
  v_nc   int;
  v_pp   int;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select raw_app_meta_data, raw_user_meta_data into v_app, v_meta from auth.users where id = v_uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select * into m from public.members where user_id = v_uid;
  if not found then
    -- 로그인은 했지만 가입(별명·동의) 전. 카카오 별명이 있으면 미리 채워 줄 수 있게 돌려준다.
    return json_build_object(
      'ok', true, 'joined', false,
      'provider', coalesce(v_app ->> 'provider', 'email'),
      'suggest',  left(btrim(coalesce(v_meta ->> 'nickname', v_meta ->> 'name', v_meta ->> 'full_name',
                                      v_meta ->> 'preferred_username', v_meta ->> 'user_name', '')), 12),
      'admin',    public.is_admin());
  end if;
  select count(*) into v_np from public.board_posts    where user_id = v_uid and status = 'approved';
  select count(*) into v_nc from public.board_comments where user_id = v_uid and status = 'approved';
  select count(*) into v_pp from public.board_posts    where user_id = v_uid and status = 'pending';
  return json_build_object(
    'ok', true, 'joined', true,
    'nickname', m.nickname, 'level', m.level, 'admin', public.is_admin(),
    'auto_up', m.level_by = 'auto',
    'provider', coalesce(v_app ->> 'provider', 'email'),
    'posts_ok', v_np, 'comments_ok', v_nc, 'posts_pending', v_pp,
    'need_posts', public.bs('levelup_posts', 3), 'need_comments', public.bs('levelup_comments', 5),
    'joined_at', m.joined_at);
end;
$fn$;


-- ── 6. 가입 · 별명 바꾸기 · 탈퇴 ──────────────────────────────
create or replace function public.member_join(p_nickname text, p_agree boolean, p_age14 boolean)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_nick   text := btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
  v_why    text;
  v_admin  boolean;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  if exists (select 1 from public.members where user_id = v_uid) then
    return json_build_object('ok', false, 'reason', 'already');
  end if;
  if p_agree is not true then
    return json_build_object('ok', false, 'reason', 'need_agree');
  end if;
  if p_age14 is not true then
    return json_build_object('ok', false, 'reason', 'need_age');
  end if;
  v_why := public.nick_reason(v_nick);
  if v_why is not null then
    return json_build_object('ok', false, 'reason', v_why);
  end if;
  if not public.rate_ok('join', 10) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  v_admin := public.is_admin();
  begin
    insert into public.members (user_id, nickname, level, level_by, agreed_at)
    values (v_uid, v_nick,
            case when v_admin then 'member' else 'sprout' end,
            case when v_admin then 'admin'  else 'auto'   end,
            now());
  exception when unique_violation then
    return json_build_object('ok', false, 'reason', 'nick_taken');
  end;
  return json_build_object('ok', true);
end;
$fn$;

create or replace function public.member_rename(p_nickname text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_nick text := btrim(regexp_replace(coalesce(p_nickname, ''), '\s+', ' ', 'g'));
  v_why  text;
  v_old  text;
  v_lv   text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select nickname, level into v_old, v_lv from public.members where user_id = v_uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  -- 차단된 회원이 별명을 바꿔 공개 중인 옛 글의 작성자 이름을 바꾸지 못하게
  if v_lv = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  v_why := public.nick_reason(v_nick);
  if v_why is not null then
    return json_build_object('ok', false, 'reason', v_why);
  end if;
  if not public.rate_ok('rename', 5)
     or (select count(*) from public.member_name_log where target = v_uid and at > now() - interval '1 day') >= 3 then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  begin
    update public.members set nickname = v_nick where user_id = v_uid;
  exception when unique_violation then
    return json_build_object('ok', false, 'reason', 'nick_taken');
  end;
  if v_old is distinct from v_nick then
    insert into public.member_name_log (target, from_name, to_name) values (v_uid, v_old, v_nick);
  end if;
  return json_build_object('ok', true, 'nickname', v_nick);
end;
$fn$;

-- 탈퇴 — 로그인 계정을 지우면 명부·글·댓글·등급 기록이 줄줄이 함께 지워진다(on delete cascade).
-- 운영자 계정은 여기서 지우지 않는다. 잘못 눌러 운영자가 사라지는 일을 막는다.
create or replace function public.member_leave()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  if public.is_admin() then
    return json_build_object('ok', false, 'reason', 'admin_cannot_leave');
  end if;
  if not public.rate_ok('leave', 5) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  begin
    delete from auth.users where id = v_uid;
  exception when insufficient_privilege then
    -- 로그인 계정을 지울 권한이 없는 설정이면, 글·댓글·명부만이라도 지우고 그 사실을 그대로 알린다.
    delete from public.members where user_id = v_uid;
    return json_build_object('ok', true, 'partial', true);
  end;
  return json_build_object('ok', true);
end;
$fn$;


-- ── 7. 게시판 읽기 (누구나) ───────────────────────────────────
--  공개되는 것: 제목·본문·별명·등급·운영자 여부·시각·댓글 수. 계정 정보는 나가지 않는다.
create or replace function public.board_list(p_before bigint default null, p_limit int default 20)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_lim  int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows json;
  v_min  bigint;
begin
  select coalesce(json_agg(x order by x.id desc), '[]'::json), min(x.id) into v_rows, v_min
  from (
    select p.id, p.title, left(p.body, 140) as excerpt, char_length(p.body) > 140 as cut,
           m.nickname, m.level,
           exists (select 1 from public.admins a where a.user_id = p.user_id) as staff,
           p.created_at, p.edited_at,
           (select count(*) from public.board_comments c where c.post_id = p.id and c.status = 'approved') as comments,
           coalesce(p.user_id = auth.uid(), false) as mine
      from public.board_posts p
      join public.members m on m.user_id = p.user_id
     where p.status = 'approved' and (p_before is null or p.id < p_before)
     order by p.id desc
     limit v_lim
  ) x;
  return json_build_object(
    'ok', true, 'rows', v_rows,
    'more', v_min is not null and exists (select 1 from public.board_posts where status = 'approved' and id < v_min));
end;
$fn$;

--  글 한 편 + 댓글. 남의 글은 공개된 것만, 내 글은 검수 중이어도 보인다(기다리는 중임을 알 수 있게).
create or replace function public.board_read(p_id bigint)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  r      record;
  v_cmts json;
begin
  select p.id, p.user_id, p.title, p.body, p.status, p.created_at, p.edited_at, m.nickname, m.level,
         exists (select 1 from public.admins a where a.user_id = p.user_id) as staff
    into r
    from public.board_posts p join public.members m on m.user_id = p.user_id
   where p.id = p_id;
  if not found or (r.status <> 'approved' and r.user_id is distinct from v_uid) then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  select coalesce(json_agg(c order by c.id), '[]'::json) into v_cmts
  from (
    select bc.id, bc.body, bc.status, bc.created_at, m.nickname, m.level,
           exists (select 1 from public.admins a where a.user_id = bc.user_id) as staff,
           coalesce(bc.user_id = v_uid, false) as mine
      from public.board_comments bc join public.members m on m.user_id = bc.user_id
     where bc.post_id = p_id and (bc.status = 'approved' or bc.user_id = v_uid)
  ) c;
  return json_build_object(
    'ok', true,
    'post', json_build_object('id', r.id, 'title', r.title, 'body', r.body, 'status', r.status,
                              'created_at', r.created_at, 'edited_at', r.edited_at,
                              'nickname', r.nickname, 'level', r.level, 'staff', r.staff,
                              'mine', coalesce(r.user_id = v_uid, false)),
    'comments', v_cmts);
end;
$fn$;

--  내 글 — 검수 중·내려간 것까지. 나만 본다.
create or replace function public.board_mine()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_rows json;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select coalesce(json_agg(x order by x.id desc), '[]'::json) into v_rows
  from (
    select p.id, p.title, p.status, p.created_at,
           (select count(*) from public.board_comments c where c.post_id = p.id and c.status = 'approved') as comments
      from public.board_posts p
     where p.user_id = v_uid
     order by p.id desc
     limit 100
  ) x;
  return json_build_object('ok', true, 'rows', v_rows);
end;
$fn$;


-- ── 8. 게시판 쓰기 (로그인한 회원) ────────────────────────────
--  정회원·운영자의 글은 바로 공개, 새싹의 글은 검수 대기. 차단된 회원은 쓸 수 없다.
create or replace function public.board_write(p_title text, p_body text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_level  text;
  v_title  text := btrim(coalesce(p_title, ''));
  v_body   text := btrim(coalesce(p_body, ''));
  v_status text;
  v_id     bigint;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select level into v_level from public.members where user_id = v_uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if v_level = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  if char_length(v_title) < 2 then return json_build_object('ok', false, 'reason', 'title_empty'); end if;
  if char_length(v_title) > 60 then return json_build_object('ok', false, 'reason', 'title_long'); end if;
  if char_length(v_body) < 2 then return json_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(v_body) > 4000 then return json_build_object('ok', false, 'reason', 'too_long'); end if;
  if not public.rate_ok('bwrite', 20)
     or (select count(*) from public.board_posts where user_id = v_uid and created_at > now() - interval '1 hour') >= 5 then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  v_status := case when v_level = 'member' or public.is_admin() then 'approved' else 'pending' end;
  insert into public.board_posts (user_id, title, body, status)
  values (v_uid, v_title, v_body, v_status)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'status', v_status);
end;
$fn$;

--  고치기 — 내 글만. 새싹이 고치면 다시 검수를 받는다(올라간 뒤 내용을 바꿔치기하지 못하게).
--  정회원은 상태를 그대로 둔다 — 운영자가 내린 글을 고친다고 다시 올라가지는 않는다.
create or replace function public.board_edit(p_id bigint, p_title text, p_body text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_status text;
  v_level  text;
  v_title  text := btrim(coalesce(p_title, ''));
  v_body   text := btrim(coalesce(p_body, ''));
  v_new    text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select p.user_id, p.status into v_owner, v_status from public.board_posts p where p.id = p_id for update;
  if not found or v_owner is distinct from v_uid then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  select level into v_level from public.members where user_id = v_uid;
  if v_level = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  if char_length(v_title) < 2 then return json_build_object('ok', false, 'reason', 'title_empty'); end if;
  if char_length(v_title) > 60 then return json_build_object('ok', false, 'reason', 'title_long'); end if;
  if char_length(v_body) < 2 then return json_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(v_body) > 4000 then return json_build_object('ok', false, 'reason', 'too_long'); end if;
  if not public.rate_ok('bedit', 30) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  v_new := case when v_level = 'member' or public.is_admin() then v_status else 'pending' end;
  update public.board_posts set title = v_title, body = v_body, edited_at = now(), status = v_new where id = p_id;
  return json_build_object('ok', true, 'status', v_new);
end;
$fn$;

--  지우기 — 쓴 사람만, 정말로 지운다(댓글도 함께). 기록에는 번호와 상태만 남긴다.
create or replace function public.board_delete(p_id bigint)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  delete from public.board_posts where id = p_id and user_id = v_uid returning status into v_status;
  if v_status is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into public.moderation_log (kind, item_id, from_status, to_status)
  values ('bpost', p_id, v_status, 'withdrawn');
  return json_build_object('ok', true, 'was', v_status);
end;
$fn$;

--  댓글 — 공개된 글에만 단다.
create or replace function public.comment_write(p_post_id bigint, p_body text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_level  text;
  v_body   text := btrim(coalesce(p_body, ''));
  v_status text;
  v_id     bigint;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select level into v_level from public.members where user_id = v_uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if v_level = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  if char_length(v_body) < 1 then return json_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(v_body) > 1000 then return json_build_object('ok', false, 'reason', 'too_long'); end if;
  if not exists (select 1 from public.board_posts where id = p_post_id and status = 'approved') then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not public.rate_ok('cwrite', 60)
     or (select count(*) from public.board_comments where user_id = v_uid and created_at > now() - interval '1 hour') >= 20 then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  v_status := case when v_level = 'member' or public.is_admin() then 'approved' else 'pending' end;
  insert into public.board_comments (post_id, user_id, body, status)
  values (p_post_id, v_uid, v_body, v_status)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'status', v_status);
end;
$fn$;

create or replace function public.comment_delete(p_id bigint)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  delete from public.board_comments where id = p_id and user_id = v_uid returning status into v_status;
  if v_status is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into public.moderation_log (kind, item_id, from_status, to_status)
  values ('comment', p_id, v_status, 'withdrawn');
  return json_build_object('ok', true, 'was', v_status);
end;
$fn$;


-- ── 9. 운영자 — 목록·상태 바꾸기에 게시판 글·댓글을 더한다 ─────
--  008 의 정의를 그대로 잇고 두 갈래(bpost · comment)만 더한다.
--  행에 title(글 제목 — 댓글이면 달린 글의 제목)·post_id·level(쓴 사람 등급) 칸이 늘었다.
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
           ai_verdict, ai_reason, created_at, preset, song_title,
           null::text as title, null::bigint as post_id, null::text as level, null::timestamptz as ver
      from public.notes   where status = p_status
    union all
    select 'dream',  id, name, text, status, ai_verdict, ai_reason, created_at, null::int, null::text,
           null::text, null::bigint, null::text, null::timestamptz
      from public.dreams  where status = p_status
    union all
    select 'letter', id, name, body, status, ai_verdict, ai_reason, created_at, null::int, null::text,
           null::text, null::bigint, null::text, null::timestamptz
      from public.letters where status = p_status
    union all
    select 'post',   id, name, body, status, ai_verdict, ai_reason, created_at, null::int, null::text,
           null::text, null::bigint, null::text, null::timestamptz
      from public.posts   where status = p_status
    union all
    select 'bpost', bp.id, m.nickname, bp.body, bp.status, null::text, null::text, bp.created_at, null::int, null::text,
           bp.title, null::bigint, m.level, coalesce(bp.edited_at, bp.created_at)
      from public.board_posts bp join public.members m on m.user_id = bp.user_id
     where bp.status = p_status
    union all
    select 'comment', bc.id, m.nickname, bc.body, bc.status, null::text, null::text, bc.created_at, null::int, null::text,
           bp.title, bc.post_id, m.level, null::timestamptz
      from public.board_comments bc
      join public.members m on m.user_id = bc.user_id
      join public.board_posts bp on bp.id = bc.post_id
     where bc.status = p_status
    order by created_at desc
    limit v_limit
  ) r;

  select json_build_object(
    'pending',  (select count(*) from public.notes   where status = 'pending')
              + (select count(*) from public.dreams  where status = 'pending')
              + (select count(*) from public.letters where status = 'pending')
              + (select count(*) from public.posts   where status = 'pending')
              + (select count(*) from public.board_posts    where status = 'pending')
              + (select count(*) from public.board_comments where status = 'pending'),
    'approved', (select count(*) from public.notes   where status = 'approved')
              + (select count(*) from public.dreams  where status = 'approved')
              + (select count(*) from public.letters where status = 'approved')
              + (select count(*) from public.posts   where status = 'approved')
              + (select count(*) from public.board_posts    where status = 'approved')
              + (select count(*) from public.board_comments where status = 'approved'),
    'rejected', (select count(*) from public.notes   where status = 'rejected')
              + (select count(*) from public.dreams  where status = 'rejected')
              + (select count(*) from public.letters where status = 'rejected')
              + (select count(*) from public.posts   where status = 'rejected')
              + (select count(*) from public.board_posts    where status = 'rejected')
              + (select count(*) from public.board_comments where status = 'rejected'))
  into v_counts;

  return json_build_object('ok', true, 'rows', v_rows, 'counts', v_counts);
end;
$fn$;

--  read_at 은 여전히 건드리지 않는다(008 과 같은 이유).
--  게시판 글·댓글을 올리면 쓴 사람의 등업 기준을 다시 센다.
--  게시판 글을 올릴 때는 운영자가 화면에서 본 판(p_ver = 고친 시각 또는 쓴 시각)을 함께 받는다.
--  그사이 쓴 사람이 고쳤으면 'changed' 로 거절한다 — 운영자가 보지 못한 내용이 올라가지 않게(검토에서 재현).
--  인자가 하나 늘어 008 의 세 인자 판은 지운다(같은 이름 두 판이 있으면 PostgREST 가 헷갈린다).
drop function if exists public.admin_set_status(text, bigint, text);
create or replace function public.admin_set_status(
  p_kind   text,
  p_id     bigint,
  p_status text,
  p_ver    timestamptz default null)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from text;
  v_user uuid;
  v_ver  timestamptz;
  v_up   boolean := false;
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
  elsif p_kind = 'bpost' then
    select status, user_id, coalesce(edited_at, created_at) into v_from, v_user, v_ver
      from public.board_posts where id = p_id for update;
    if found and p_status = 'approved' and (p_ver is null or p_ver is distinct from v_ver) then
      return json_build_object('ok', false, 'reason', 'changed');
    end if;
    if found then update public.board_posts set status = p_status where id = p_id; end if;
  elsif p_kind = 'comment' then
    select status, user_id into v_from, v_user from public.board_comments where id = p_id for update;
    if found then update public.board_comments set status = p_status where id = p_id; end if;
  else
    return json_build_object('ok', false, 'reason', 'bad_kind');
  end if;

  if v_from is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.moderation_log (user_id, email, kind, item_id, from_status, to_status)
  values (auth.uid(), auth.jwt() ->> 'email', p_kind, p_id, v_from, p_status);

  if v_user is not null and p_status = 'approved' then
    v_up := public.member_recheck(v_user);
  end if;

  return json_build_object('ok', true, 'kind', p_kind, 'id', p_id,
                           'from', v_from, 'status', p_status, 'levelup', v_up);
end;
$fn$;

--  회원 명단 — 운영자만. 이메일은 가려서 보여 준다(누구인지 가늠만 되게).
create or replace function public.admin_members(p_q text default null, p_limit int default 300)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_lim    int := least(greatest(coalesce(p_limit, 300), 1), 1000);
  v_q      text := nullif(btrim(coalesce(p_q, '')), '');
  v_rows   json;
  v_counts json;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select coalesce(json_agg(x order by x.joined_at desc), '[]'::json) into v_rows
  from (
    select m.user_id, m.nickname, m.level, m.level_by, m.level_at, m.joined_at,
           coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider,
           case when u.email is null or u.email = '' then ''
                else regexp_replace(u.email, '^(.{1,2})[^@]*(@.*)$', '\1***\2') end as email_masked,
           exists (select 1 from public.admins a where a.user_id = m.user_id) as staff,
           (select count(*) from public.board_posts p    where p.user_id = m.user_id and p.status = 'approved') as posts_ok,
           (select count(*) from public.board_comments c where c.user_id = m.user_id and c.status = 'approved') as comments_ok,
           (select count(*) from public.board_posts p    where p.user_id = m.user_id and p.status = 'pending')
         + (select count(*) from public.board_comments c where c.user_id = m.user_id and c.status = 'pending') as waiting
      from public.members m
      left join auth.users u on u.id = m.user_id
     where v_q is null or m.nickname ilike '%' || v_q || '%'
     order by m.joined_at desc
     limit v_lim
  ) x;
  select json_build_object(
    'total',   (select count(*) from public.members),
    'sprout',  (select count(*) from public.members where level = 'sprout'),
    'member',  (select count(*) from public.members where level = 'member'),
    'blocked', (select count(*) from public.members where level = 'blocked'))
  into v_counts;
  return json_build_object('ok', true, 'rows', v_rows, 'counts', v_counts,
                           'need_posts', public.bs('levelup_posts', 3),
                           'need_comments', public.bs('levelup_comments', 5));
end;
$fn$;

--  등급 바꾸기 — 운영자만. 한 번 운영자가 정하면 자동 등업이 덮어쓰지 않는다.
--  운영자 계정의 등급은 여기서 바꾸지 않는다(운영자 지정은 명단 SQL 로만 — 문은 하나만 둔다).
create or replace function public.admin_set_level(p_user uuid, p_level text)
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
  if p_level is null or p_level not in ('sprout', 'member', 'blocked') then
    return json_build_object('ok', false, 'reason', 'bad_level');
  end if;
  if exists (select 1 from public.admins where user_id = p_user) then
    return json_build_object('ok', false, 'reason', 'staff');
  end if;
  select level into v_from from public.members where user_id = p_user for update;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  update public.members set level = p_level, level_by = 'admin', level_at = now() where user_id = p_user;
  insert into public.member_level_log (by_user, by_email, target, from_level, to_level, why)
  values (auth.uid(), auth.jwt() ->> 'email', p_user, v_from, p_level, 'admin');
  return json_build_object('ok', true, 'from', v_from, 'level', p_level);
end;
$fn$;


-- ── 10. 검수 대기 알림 — 게시판 글·댓글까지 센다 (009 를 대신한다) ─
--  공개 키로 '건수'만. 시각은 시 단위로 내린다 — 기준 시각을 옮겨 가며 불러
--  개별 글이 들어온 시각을 알아내지 못하게(009 검토에서 재현된 정찰).
create or replace function public.pending_summary(p_since timestamptz default null)
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with p as (
    select 'note'::text as kind, created_at from public.notes   where status = 'pending'
    union all
    select 'dream',   created_at from public.dreams         where status = 'pending'
    union all
    select 'letter',  created_at from public.letters        where status = 'pending'
    union all
    select 'post',    created_at from public.posts          where status = 'pending'
    union all
    select 'bpost',   created_at from public.board_posts    where status = 'pending'
    union all
    select 'comment', created_at from public.board_comments where status = 'pending'
  )
  select json_build_object(
    'ok',        true,
    'total',     (select count(*) from p),
    'note',      (select count(*) from p where kind = 'note'),
    'dream',     (select count(*) from p where kind = 'dream'),
    'letter',    (select count(*) from p where kind = 'letter'),
    'post',      (select count(*) from p where kind = 'post'),
    'bpost',     (select count(*) from p where kind = 'bpost'),
    'comment',   (select count(*) from p where kind = 'comment'),
    'oldest_at', (select date_trunc('hour', min(created_at)) from p),
    'since',     case when p_since is null then null
                      else (select count(*) from p where created_at >= date_trunc('hour', p_since)) end,
    'at',        now());
$fn$;


-- ── 11. 누가 무엇을 부를 수 있나 ───────────────────────────────
--  Supabase 는 public 스키마의 새 함수를 anon·authenticated 에게 '직접' 연다.
--  그래서 전부 한 번 닫고, 필요한 역할에만 다시 연다.
revoke execute on function public.nick_norm(text)                        from public, anon, authenticated;
revoke execute on function public.nick_reason(text)                      from public, anon, authenticated;
revoke execute on function public.bs(text, int)                          from public, anon, authenticated;
revoke execute on function public.member_recheck(uuid)                   from public, anon, authenticated;
revoke execute on function public.member_me()                            from public, anon, authenticated;
revoke execute on function public.member_join(text, boolean, boolean)    from public, anon, authenticated;
revoke execute on function public.member_rename(text)                    from public, anon, authenticated;
revoke execute on function public.member_leave()                         from public, anon, authenticated;
revoke execute on function public.board_list(bigint, int)                from public, anon, authenticated;
revoke execute on function public.board_read(bigint)                     from public, anon, authenticated;
revoke execute on function public.board_mine()                           from public, anon, authenticated;
revoke execute on function public.board_write(text, text)                from public, anon, authenticated;
revoke execute on function public.board_edit(bigint, text, text)         from public, anon, authenticated;
revoke execute on function public.board_delete(bigint)                   from public, anon, authenticated;
revoke execute on function public.comment_write(bigint, text)            from public, anon, authenticated;
revoke execute on function public.comment_delete(bigint)                 from public, anon, authenticated;
revoke execute on function public.admin_members(text, int)               from public, anon, authenticated;
revoke execute on function public.admin_set_level(uuid, text)            from public, anon, authenticated;
revoke execute on function public.admin_list(text, int)                  from public, anon;
revoke execute on function public.admin_set_status(text, bigint, text, timestamptz) from public, anon;
revoke execute on function public.pending_summary(timestamptz)           from public, anon, authenticated;

--  누구나: 게시판 읽기 · 알림 건수
grant execute on function public.board_list(bigint, int)                 to anon, authenticated;
grant execute on function public.board_read(bigint)                      to anon, authenticated;
grant execute on function public.pending_summary(timestamptz)            to anon, authenticated;
--  로그인한 사람: 나·가입·쓰기·지우기 (안에서 다시 '회원인가·차단인가'를 본다)
grant execute on function public.member_me()                             to authenticated;
grant execute on function public.member_join(text, boolean, boolean)     to authenticated;
grant execute on function public.member_rename(text)                     to authenticated;
grant execute on function public.member_leave()                          to authenticated;
grant execute on function public.board_mine()                            to authenticated;
grant execute on function public.board_write(text, text)                 to authenticated;
grant execute on function public.board_edit(bigint, text, text)          to authenticated;
grant execute on function public.board_delete(bigint)                    to authenticated;
grant execute on function public.comment_write(bigint, text)             to authenticated;
grant execute on function public.comment_delete(bigint)                  to authenticated;
--  운영자 함수는 로그인한 사람에게 열되, 안에서 운영자 명단을 본다(문이 두 겹)
grant execute on function public.admin_members(text, int)                to authenticated;
grant execute on function public.admin_set_level(uuid, text)             to authenticated;
grant execute on function public.admin_list(text, int)                   to authenticated;
grant execute on function public.admin_set_status(text, bigint, text, timestamptz) to authenticated;


-- ── 12. 안전장치 — 공개 키·로그인 권한으로 실제로 불러 본다 ──────
--  하나라도 어긋나면 예외가 나고, 위의 모든 변경이 함께 취소된다.
do $chk$
declare
  v       json;
  keys    text[];
  owner_n int;
begin
  owner_n := (public.pending_summary(null) ->> 'total')::int;

  -- (가) 공개 키
  set local role anon;

  v := public.pending_summary(null);
  select array_agg(k order by k) into keys from json_object_keys(v) k;
  if keys is distinct from array['at','bpost','comment','dream','letter','note','ok','oldest_at','post','since','total'] then
    raise exception '안전장치: 알림 함수의 칸이 정해진 11개와 다릅니다 % — 전체를 취소합니다', keys;
  end if;
  if (v ->> 'total')::int is distinct from owner_n then
    raise exception '안전장치: 공개 키로 센 대기(%)가 운영자가 센 대기(%)와 다릅니다 — 전체를 취소합니다', v ->> 'total', owner_n;
  end if;

  v := public.board_list(null, 1);
  if (v ->> 'ok') is distinct from 'true' then
    raise exception '안전장치: 공개 키로 게시판을 읽지 못합니다 — 전체를 취소합니다';
  end if;
  v := public.board_read(-1);
  if (v ->> 'reason') is distinct from 'not_found' then
    raise exception '안전장치: 없는 글 읽기가 not_found 가 아닙니다 — 전체를 취소합니다';
  end if;

  begin perform * from public.members limit 1;
    raise exception '안전장치: 공개 키로 회원 명부가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.board_posts limit 1;
    raise exception '안전장치: 공개 키로 게시판 원본 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.board_comments limit 1;
    raise exception '안전장치: 공개 키로 댓글 원본 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.member_level_log limit 1;
    raise exception '안전장치: 공개 키로 등급 기록이 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.member_name_log limit 1;
    raise exception '안전장치: 공개 키로 별명 기록이 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_set_status('bpost', 1, 'approved', null);
    raise exception '안전장치: 공개 키로 상태 바꾸기가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.board_write('제목', '본문');
    raise exception '안전장치: 공개 키로 글쓰기 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.member_me();
    raise exception '안전장치: 공개 키로 회원 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_members(null, 1);
    raise exception '안전장치: 공개 키로 회원 명단 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.member_recheck(null);
    raise exception '안전장치: 공개 키로 등업 도우미가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform token from public.notes limit 1;
    raise exception '안전장치: 공개 키로 토큰 칸이 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_list('pending', 1);
    raise exception '안전장치: 공개 키로 운영자 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;

  reset role;

  -- (나) 로그인 역할이지만 로그인 토큰이 없는 상태 — 함수 안의 문지기가 막아야 한다
  set local role authenticated;
  v := public.member_me();
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 member_me 가 not_logged_in 이 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.board_write('제목입니다', '본문입니다');
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 글쓰기가 막히지 않습니다 — 전체를 취소합니다';
  end if;
  v := public.admin_members(null, 1);
  if (v ->> 'reason') is distinct from 'forbidden' then
    raise exception '안전장치: 운영자 아닌 사람에게 회원 명단이 열립니다 — 전체를 취소합니다';
  end if;
  v := public.admin_set_level(null, 'member');
  if (v ->> 'reason') is distinct from 'forbidden' then
    raise exception '안전장치: 운영자 아닌 사람이 등급을 바꿀 수 있습니다 — 전체를 취소합니다';
  end if;
  begin perform * from public.members limit 1;
    raise exception '안전장치: 로그인 역할로 회원 명부가 직접 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.board_posts limit 1;
    raise exception '안전장치: 로그인 역할로 게시판 원본 표가 직접 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  reset role;
end
$chk$;

notify pgrst, 'reload schema';

commit;


-- ── 13. 확인표 — 결과 창에 뜬다 ─────────────────────────────
select 점검, 결과 from (
  select 번호, 점검, case when 결과 then '✅' else '❌' end as 결과
  from (values
    (1,  '회원 명부·게시판·댓글 표가 생겼다',
         to_regclass('public.members') is not null and to_regclass('public.board_posts') is not null
         and to_regclass('public.board_comments') is not null),
    (2,  '공개 키로 회원 명부를 못 읽는다',            not has_table_privilege('anon', 'public.members', 'SELECT')),
    (3,  '공개 키로 게시판을 읽을 수 있다(함수로)',      has_function_privilege('anon', 'public.board_list(bigint, integer)', 'EXECUTE')),
    (4,  '공개 키로 글을 쓸 수 없다',                   not has_function_privilege('anon', 'public.board_write(text, text)', 'EXECUTE')),
    (5,  '로그인한 사람은 가입·글쓰기를 할 수 있다',     has_function_privilege('authenticated', 'public.member_join(text, boolean, boolean)', 'EXECUTE')
                                                      and has_function_privilege('authenticated', 'public.board_write(text, text)', 'EXECUTE')),
    (6,  '등업 도우미는 밖에서 못 부른다',               not has_function_privilege('authenticated', 'public.member_recheck(uuid)', 'EXECUTE')),
    (7,  '알림 함수가 게시판 글·댓글까지 센다',          (select count(*) from json_object_keys(public.pending_summary(null))) = 11),
    (8,  '공개 키로 지우기 토큰은 여전히 못 읽는다',     not has_column_privilege('anon', 'public.notes', 'token', 'SELECT')),
    (9,  '등업 기준이 들어 있다(글·댓글)',              (select count(*) from public.board_settings where key in ('levelup_posts', 'levelup_comments')) = 2)
  ) as t(번호, 점검, 결과)
  union all
  select 10, '등업 기준: 글 ' || public.bs('levelup_posts', 3) || '개 + 댓글 ' || public.bs('levelup_comments', 5) || '개', 'ℹ️'
  union all
  select 11, '회원 ' || (select count(*) from public.members) || '명 · 운영자 ' || (select count(*) from public.admins) || '명', 'ℹ️'
) x
order by 번호;
