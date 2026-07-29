-- ============================================================
-- 인순이 공식 팬 플랫폼 · 백엔드 초기 설정
-- Supabase(Postgres) SQL Editor에 전문을 붙여넣고 한 번 실행하면 됩니다.
-- 두 번 실행해도 안전합니다(모두 if not exists / or replace).
-- ------------------------------------------------------------
-- 설계 원칙
--
--  1) 웹사이트가 들고 다니는 키(anon key)는 공개 저장소에 들어간다.
--     즉 "키를 가진 사람 = 인터넷의 아무나"로 보고 설계한다.
--
--  2) 그래서 테이블에 직접 쓰거나 읽는 권한을 anon에게 주지 않는다.
--     쓰기는 전부 함수(RPC)를 통하고, 읽기는 전부 뷰를 통한다.
--     함수와 뷰가 허용하는 것 외에는 아무것도 할 수 없다.
--
--  3) 팬이 쓴 글은 기본이 '검수 대기'다. 승인은 운영자만 할 수 있고,
--     승인되지 않은 글은 아무도 읽을 수 없다.
--
--  4) 구독 이메일은 어떤 경로로도 읽히지 않는다. 읽기 뷰를 만들지 않는다.
--     "이미 구독한 이메일인지"조차 알아낼 수 없게 한다(중복도 성공으로 응답).
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. 테이블
-- ------------------------------------------------------------

-- 팬레터
create table if not exists public.letters (
  id          bigint generated always as identity primary key,
  name        text,
  category    text,
  body        text not null,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  constraint letters_status_ok check (status in ('pending', 'approved', 'rejected')),
  constraint letters_body_len check (char_length(body) between 2 and 1000),
  constraint letters_name_len check (name is null or char_length(name) <= 20)
);

-- 팬 게시판
create table if not exists public.posts (
  id          bigint generated always as identity primary key,
  name        text,
  body        text not null,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  constraint posts_status_ok check (status in ('pending', 'approved', 'rejected')),
  constraint posts_body_len check (char_length(body) between 2 and 600),
  constraint posts_name_len check (name is null or char_length(name) <= 20)
);

-- 한 줄 응원 (사이트가 제공한 문구 중에서 고르는 방식이라 자유 입력이 아니다)
create table if not exists public.cheers (
  id          bigint generated always as identity primary key,
  name        text,
  text        text not null,
  status      text not null default 'approved',   -- 정해진 문구 중 선택이므로 바로 공개
  created_at  timestamptz not null default now(),
  constraint cheers_status_ok check (status in ('pending', 'approved', 'rejected')),
  constraint cheers_text_len check (char_length(text) between 1 and 60)
);

-- 신청곡
create table if not exists public.song_requests (
  id          bigint generated always as identity primary key,
  title       text not null,
  created_at  timestamptz not null default now(),
  constraint song_title_len check (char_length(title) between 1 and 80)
);

-- 소식지 구독 (개인정보. 절대 읽기 경로를 만들지 않는다)
create table if not exists public.subscribers (
  id          bigint generated always as identity primary key,
  email       text not null,
  created_at  timestamptz not null default now(),
  constraint subscribers_email_ok check (email ~* '^[^@\s]+@[^@\s.]+\.[^@\s]+$'),
  constraint subscribers_email_len check (char_length(email) <= 254)
);
-- 중복 방지는 하되, 클라이언트에는 절대 오류로 알리지 않는다(2번 함수 참고).
create unique index if not exists subscribers_email_uniq on public.subscribers (lower(email));

-- 도배 방지용 카운터.
-- 원본 IP를 저장하지 않는다 — 날짜 소금을 섞어 해시만 남긴다.
-- 하루가 지나면 같은 IP도 다른 해시가 되어 추적에 쓸 수 없다.
create table if not exists public.rate_counter (
  bucket      text not null,
  ip_hash     text not null,
  hour_slot   timestamptz not null,
  hits        int not null default 0,
  primary key (bucket, ip_hash, hour_slot)
);

-- ------------------------------------------------------------
-- 2. 권한: 기본적으로 전부 막는다
-- ------------------------------------------------------------
alter table public.letters        enable row level security;
alter table public.posts          enable row level security;
alter table public.cheers         enable row level security;
alter table public.song_requests  enable row level security;
alter table public.subscribers    enable row level security;
alter table public.rate_counter   enable row level security;

-- RLS를 켜고 정책을 하나도 만들지 않으면 anon은 아무것도 못 한다.
-- 여기서는 정책을 만들지 않는다. 접근은 전부 아래 함수/뷰로만 열어 준다.
revoke all on public.letters       from anon, authenticated;
revoke all on public.posts         from anon, authenticated;
revoke all on public.cheers        from anon, authenticated;
revoke all on public.song_requests from anon, authenticated;
revoke all on public.subscribers   from anon, authenticated;
revoke all on public.rate_counter  from anon, authenticated;

-- ------------------------------------------------------------
-- 3. 도배 방지 헬퍼
-- ------------------------------------------------------------
-- 요청 헤더에서 접속자 구분값을 얻어 해시한다.
-- 헤더가 없으면(직접 DB 접속 등) 'unknown'으로 묶는다.
create or replace function public.req_ip_hash()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  raw text;
begin
  begin
    raw := coalesce(
      split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1),
      ''
    );
  exception when others then
    raw := '';
  end;
  if raw = '' then raw := 'unknown'; end if;
  -- 날짜를 섞어 하루 단위로만 유효한 해시를 만든다
  return encode(digest(raw || '|' || to_char(now(), 'YYYY-MM-DD'), 'sha256'), 'hex');
end;
$$;

-- 시간당 허용 횟수를 넘으면 false를 돌려준다.
create or replace function public.rate_ok(p_bucket text, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  slot timestamptz := date_trunc('hour', now());
  h    text := public.req_ip_hash();
  cur  int;
begin
  insert into public.rate_counter (bucket, ip_hash, hour_slot, hits)
  values (p_bucket, h, slot, 1)
  on conflict (bucket, ip_hash, hour_slot)
    do update set hits = public.rate_counter.hits + 1
  returning hits into cur;

  -- 오래된 기록은 조금씩 걷어낸다(별도 작업 없이 유지되게)
  if random() < 0.02 then
    delete from public.rate_counter where hour_slot < now() - interval '2 days';
  end if;

  return cur <= p_limit;
end;
$$;

-- ------------------------------------------------------------
-- 4. 쓰기: 함수로만
-- ------------------------------------------------------------

-- 팬레터 접수. 언제나 'pending'으로 들어간다 — 스스로 승인할 방법이 없다.
create or replace function public.submit_letter(
  p_name text, p_category text, p_body text
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id bigint;
begin
  if p_body is null or char_length(btrim(p_body)) < 2 then
    return json_build_object('ok', false, 'reason', 'empty');
  end if;
  if char_length(p_body) > 1000 then
    return json_build_object('ok', false, 'reason', 'too_long');
  end if;
  if not public.rate_ok('letter', 5) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.letters (name, category, body, status)
  values (nullif(btrim(left(coalesce(p_name, ''), 20)), ''),
          nullif(btrim(left(coalesce(p_category, ''), 20)), ''),
          btrim(p_body),
          'pending')                       -- 여기서 고정. 인자로 받지 않는다
  returning id into new_id;

  return json_build_object('ok', true, 'id', new_id, 'status', 'pending');
end;
$$;

-- 게시글 작성. 역시 검수 대기로만 들어간다.
create or replace function public.submit_post(p_name text, p_body text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id bigint;
begin
  if p_body is null or char_length(btrim(p_body)) < 2 then
    return json_build_object('ok', false, 'reason', 'empty');
  end if;
  if char_length(p_body) > 600 then
    return json_build_object('ok', false, 'reason', 'too_long');
  end if;
  if not public.rate_ok('post', 5) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.posts (name, body, status)
  values (nullif(btrim(left(coalesce(p_name, ''), 20)), ''), btrim(p_body), 'pending')
  returning id into new_id;

  return json_build_object('ok', true, 'id', new_id, 'status', 'pending');
end;
$$;

-- 한 줄 응원. 사이트가 제시한 문구만 받는다(자유 입력이 아니라 검수 없이 공개).
create or replace function public.submit_cheer(p_name text, p_text text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_text is null or char_length(btrim(p_text)) = 0 then
    return json_build_object('ok', false, 'reason', 'empty');
  end if;
  if char_length(p_text) > 60 then
    return json_build_object('ok', false, 'reason', 'too_long');
  end if;
  if not public.rate_ok('cheer', 20) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.cheers (name, text, status)
  values (nullif(btrim(left(coalesce(p_name, ''), 20)), ''), btrim(p_text), 'approved');

  return json_build_object('ok', true);
end;
$$;

-- 신청곡
create or replace function public.request_song(p_title text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_title is null or char_length(btrim(p_title)) = 0 then
    return json_build_object('ok', false, 'reason', 'empty');
  end if;
  if not public.rate_ok('song', 40) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.song_requests (title) values (btrim(left(p_title, 80)));
  return json_build_object('ok', true);
end;
$$;

-- 소식지 구독.
-- 이미 있는 주소여도 성공으로 응답한다. 그렇지 않으면
-- "이 이메일이 구독자인지"를 아무나 확인할 수 있는 조회 창구가 되어 버린다.
create or replace function public.subscribe(p_email text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return json_build_object('ok', false, 'reason', 'bad_email');
  end if;
  if not public.rate_ok('subscribe', 5) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.subscribers (email)
  values (btrim(left(p_email, 254)))
  on conflict do nothing;                  -- 중복은 조용히 넘긴다

  return json_build_object('ok', true);     -- 신규든 중복이든 같은 응답
end;
$$;

-- ------------------------------------------------------------
-- 5. 읽기: 뷰로만. 승인된 것만 보인다.
-- ------------------------------------------------------------
create or replace view public.public_letters
with (security_invoker = on) as
  select id, name, category, body, created_at
  from public.letters
  where status = 'approved'
  order by created_at desc
  limit 50;

create or replace view public.public_posts
with (security_invoker = on) as
  select id, name, body, created_at
  from public.posts
  where status = 'approved'
  order by created_at desc
  limit 50;

create or replace view public.public_cheers
with (security_invoker = on) as
  select id, name, text, created_at
  from public.cheers
  where status = 'approved'
  order by created_at desc
  limit 30;

-- 신청곡 집계. 개별 요청 기록은 보이지 않고 곡별 합계만 보인다.
create or replace view public.song_tally
with (security_invoker = on) as
  select title, count(*)::int as n
  from public.song_requests
  group by title
  order by count(*) desc, title
  limit 20;

-- security_invoker = on 이면 뷰도 호출자 권한으로 동작한다.
-- 그런데 anon에게는 테이블 권한이 없으므로 그대로는 아무것도 못 읽는다.
-- 그래서 뷰가 볼 수 있게 '승인된 행만' 읽는 정책을 테이블에 붙인다.
drop policy if exists "승인된 편지만 공개" on public.letters;
create policy "승인된 편지만 공개" on public.letters
  for select to anon, authenticated using (status = 'approved');

drop policy if exists "승인된 글만 공개" on public.posts;
create policy "승인된 글만 공개" on public.posts
  for select to anon, authenticated using (status = 'approved');

drop policy if exists "승인된 응원만 공개" on public.cheers;
create policy "승인된 응원만 공개" on public.cheers
  for select to anon, authenticated using (status = 'approved');

drop policy if exists "신청곡 집계용 읽기" on public.song_requests;
create policy "신청곡 집계용 읽기" on public.song_requests
  for select to anon, authenticated using (true);

-- subscribers 에는 select 정책을 만들지 않는다. 따라서 읽기 불가.
-- rate_counter 에도 만들지 않는다.

-- 테이블 select 권한(정책과 별개로 GRANT도 필요하다)
grant select on public.letters, public.posts, public.cheers, public.song_requests to anon, authenticated;
grant select on public.public_letters, public.public_posts, public.public_cheers, public.song_tally to anon, authenticated;

-- 함수 실행 권한
grant execute on function public.submit_letter(text, text, text) to anon, authenticated;
grant execute on function public.submit_post(text, text)          to anon, authenticated;
grant execute on function public.submit_cheer(text, text)         to anon, authenticated;
grant execute on function public.request_song(text)               to anon, authenticated;
grant execute on function public.subscribe(text)                  to anon, authenticated;

-- 내부 함수는 클라이언트가 직접 부를 이유가 없다
revoke execute on function public.rate_ok(text, int)  from anon, authenticated;
revoke execute on function public.req_ip_hash()       from anon, authenticated;

-- ------------------------------------------------------------
-- 6. 운영자용 검수 목록
--    Supabase 대시보드 SQL Editor에서 아래를 실행해 확인하고,
--    Table Editor에서 status를 approved / rejected 로 바꾸면 됩니다.
-- ------------------------------------------------------------
create or replace view public.moderation_queue as
  select 'letter' as kind, id, name, body, created_at from public.letters where status = 'pending'
  union all
  select 'post'  as kind, id, name, body, created_at from public.posts   where status = 'pending'
  order by created_at;

-- 검수 목록은 운영자만 본다. anon에게 주지 않는다.
revoke all on public.moderation_queue from anon, authenticated;

-- ------------------------------------------------------------
-- 7. 인덱스
-- ------------------------------------------------------------
create index if not exists letters_status_created on public.letters (status, created_at desc);
create index if not exists posts_status_created   on public.posts   (status, created_at desc);
create index if not exists cheers_status_created  on public.cheers  (status, created_at desc);
create index if not exists song_requests_title    on public.song_requests (title);

-- ============================================================
-- 확인용 — 아래를 실행하면 anon이 무엇을 할 수 있는지 한눈에 보입니다.
--
--   select table_name, privilege_type
--   from information_schema.role_table_grants
--   where grantee = 'anon' and table_schema = 'public'
--   order by table_name;
--
-- subscribers 가 이 목록에 나오면 안 됩니다.
-- ============================================================
