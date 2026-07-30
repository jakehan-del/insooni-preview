-- ============================================================
-- 003 — 꿈의 비행
--
-- 사랑방의 「꿈의 비행」이 쓰는 표. 방문자가 한 줄로 남긴 꿈을
-- 검수한 뒤 밤하늘에 띄운다.
--
-- 001_init.sql 의 보안 원칙을 그대로 따른다.
--   · anon 은 표에 직접 쓰지 못한다. 쓰기는 security definer 함수로만.
--   · status 는 함수가 'pending' 으로 못박는다. 인자로 받지 않는다.
--     (받으면 아무나 자기 글을 approved 로 넣을 수 있다)
--   · 읽기는 승인된 행만 보이는 뷰로만.
--   · search_path 를 잠근다.
--
-- 여러 번 실행해도 안전하다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 표
-- ------------------------------------------------------------
create table if not exists public.dreams (
  id          bigint generated always as identity primary key,
  name        text,
  text        text not null,
  status      text not null default 'pending',   -- 자유 입력이므로 반드시 검수를 거친다
  ai_verdict  text,                              -- AI 검수 도우미가 채운다: ok / review / spam
  ai_reason   text,                              -- 그렇게 본 이유 한 줄
  ai_at       timestamptz,
  created_at  timestamptz not null default now(),
  constraint dreams_status_ok check (status in ('pending', 'approved', 'rejected')),
  constraint dreams_text_len  check (char_length(text) between 2 and 70)
);

alter table public.dreams enable row level security;
revoke all on public.dreams from anon, authenticated;

-- ------------------------------------------------------------
-- 2. 검수 도우미가 쓸 칸을 기존 표에도 추가
-- ------------------------------------------------------------
alter table public.letters add column if not exists ai_verdict text;
alter table public.letters add column if not exists ai_reason  text;
alter table public.letters add column if not exists ai_at      timestamptz;
alter table public.posts   add column if not exists ai_verdict text;
alter table public.posts   add column if not exists ai_reason  text;
alter table public.posts   add column if not exists ai_at      timestamptz;

-- ------------------------------------------------------------
-- 3. 쓰기 — 함수로만
-- ------------------------------------------------------------
create or replace function public.submit_dream(p_name text, p_text text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_text text;
begin
  v_text := btrim(coalesce(p_text, ''));

  if char_length(v_text) < 2 then
    return json_build_object('ok', false, 'reason', 'empty');
  end if;
  if char_length(v_text) > 70 then
    return json_build_object('ok', false, 'reason', 'too_long');
  end if;
  if not public.rate_ok('dream', 10) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- status 를 여기서 못박는다. 호출자가 정할 수 없다.
  insert into public.dreams (name, text, status)
  values (nullif(btrim(left(coalesce(p_name, ''), 20)), ''), v_text, 'pending');

  return json_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- 4. 읽기 — 승인된 것만
-- ------------------------------------------------------------
-- 비행 한 번에 하늘을 채울 만큼만 준다. 최신순으로 주되
-- 화면에서 섞어 띄우므로 오래된 꿈도 계속 날아다닌다.
create or replace view public.public_dreams
with (security_invoker = on) as
  select id, name, text, created_at
  from public.dreams
  where status = 'approved'
  order by created_at desc
  limit 80;

drop policy if exists "승인된 꿈만 공개" on public.dreams;
create policy "승인된 꿈만 공개" on public.dreams
  for select to anon, authenticated using (status = 'approved');

grant select  on public.dreams          to anon, authenticated;
grant select  on public.public_dreams   to anon, authenticated;
grant execute on function public.submit_dream(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. 검수 목록에 꿈을 추가 (운영자 전용)
-- ------------------------------------------------------------
-- 칸 이름이 바뀌므로(body → text) 교체가 아니라 다시 만든다.
-- create or replace 로는 기존 뷰의 칸 이름을 못 바꾼다.
drop view if exists public.moderation_queue;

create view public.moderation_queue as
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

-- ------------------------------------------------------------
-- 6. 인덱스
-- ------------------------------------------------------------
create index if not exists dreams_status_created on public.dreams (status, created_at desc);

-- ============================================================
-- 확인용
--
--   select * from public.moderation_queue;              -- 검수 대기 (AI 소견 포함)
--   select count(*) from public.dreams;                 -- 전체
--   select status, count(*) from public.dreams group by status;
--
-- 승인하려면 Table Editor 에서 dreams 의 status 를 approved 로.
-- ============================================================
