-- ═════════════════════════════════════════════════
--  015 · 회원 소식 메일 동의(선택)   (2026-10-03)
-- ------------------------------------------------------------------
--  형님 결정(2026-10-03, 공연 담당 피드백): 공연 화면에서 가입할 때 '인순이 새 공연·방송 소식을 이메일로 먼저'를
--  선택 동의로 받는다. 체크하지 않아도 가입은 된다.
--
--  왜 001 의 subscribe() 를 쓰지 않나
--    · subscribe 는 익명 함수라 같은 IP 에서 한 시간에 5번까지만 받는다(rate_ok). 공연장 와이파이 하나에
--      수백 명이 붙으면 여섯 번째부터 빠진다.
--    · 회원과 묶이지 않아 탈퇴해도 주소가 남고, 본인이 '그만 받기'를 할 길이 없다.
--  그래서 회원 한 명당 한 줄(member_news)로 받는다 — 로그인한 본인 것만 넣고·보고·지운다. 탈퇴하면 함께 지워진다.
--
--  지킨 것
--    · 001~014 의 함수·표는 고치지 않는다. subscribers(옛 구독 명단)도 그대로 둔다.
--    · 새 표는 잠근다(RLS + revoke, 정책 없음). 읽기도 쓰기도 함수로만. 남의 주소는 어느 함수로도 나가지 않는다.
--    · 메일을 보내는 코드는 없다(이메일 발송은 시스템이 실행 경로를 갖지 않는다 — C 등급).
--      명단은 운영자가 SQL Editor 에서 꺼낸다:  select email, agreed_at, source from public.member_news;
--    · 동의 시각(agreed_at)과 어디서 동의했는지(source — 'gig:5UYX8' · 'join' · 'me')를 남긴다(동의 증빙).
--    · 그만 받기는 언제나 된다(차단 회원도, 속도 제한 없이).
--    · 한 회원이 주소를 마구 바꿔 남의 주소를 넣지 못하게 — 회원별로 한 시간 10번(011 의 rate_ok 가 로그인한
--      사람은 회원 기준으로 센다. 공연장 와이파이 하나를 여럿이 써도 서로 막지 않는다. 원본 아이디는 남지 않는다).
--
--  안전합니다.
--    · 전체가 한 묶음(begin … commit). 하나라도 실패하면 아무것도 안 바뀝니다.
--    · 맨 끝 안전장치가 공개 키·로그인 권한으로 직접 불러 봐서, 표가 열려 있거나
--      막혀야 할 함수가 불리면 스스로 전체를 취소합니다.
--    · 여러 번 실행해도 결과가 같습니다(이미 동의한 회원의 주소는 그대로 둡니다).
--
--  실행 순서: 010(회원과 게시판) → 011(공연 모드) 뒤면 됩니다. 012~014 와는 순서 상관없음.
--  실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
--  성공하면 결과 창에 ✅ 표가 뜹니다.
-- ═════════════════════════════════════════════════

begin;

-- ── 0. 앞선 파일 확인 — 010 · 011 이 있어야 한다 ─────────────────
--  011 이 rate_ok 를 '로그인한 사람은 회원 기준'으로 바꿨다. 그 전(001)의 rate_ok 는 IP 기준이라
--  공연장 와이파이에서 열 번째 사람부터 막힌다 — 그래서 011 을 요구한다.
do $pre$
begin
  if to_regclass('public.members') is null or to_regprocedure('public.rate_ok(text,integer)') is null then
    raise exception '015 앞에 010(회원과 게시판)을 먼저 실행해야 합니다 — 아무것도 바뀌지 않았습니다';
  end if;
  if to_regclass('public.gig_events') is null then
    raise exception '015 앞에 011(공연 모드)을 먼저 실행해야 합니다 — 아무것도 바뀌지 않았습니다';
  end if;
end
$pre$;


-- ── 1. 표 — 회원 한 명당 한 줄 ─────────────────────────────────
--  members 에 on delete cascade — 탈퇴하면(010 의 두 탈퇴 경로 모두) 주소가 함께 지워진다(개인정보 파기).
create table if not exists public.member_news (
  user_id    uuid primary key references public.members (user_id) on delete cascade,
  email      text not null,
  source     text,
  agreed_at  timestamptz not null default now(),
  constraint member_news_email_ok  check (email ~* '^[^@\s]+@[^@\s.]+\.[^@\s]+$'),
  constraint member_news_email_len check (char_length(email) <= 254),
  constraint member_news_source_ok check (source is null or source ~ '^[a-z]{2,8}(:[A-Z0-9]{1,12})?$')
);
alter table public.member_news enable row level security;
revoke all on public.member_news from public, anon, authenticated;


-- ── 2. 받기 · 그만 받기 ───────────────────────────────────────
create or replace function public.member_news_set(p_on boolean, p_email text, p_source text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_lv  text;
  v_em  text := btrim(coalesce(p_email, ''));
  v_src text := btrim(coalesce(p_source, ''));
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select level into v_lv from public.members where user_id = v_uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  -- 그만 받기 — 언제나 된다
  if not coalesce(p_on, false) then
    delete from public.member_news where user_id = v_uid;
    return json_build_object('ok', true, 'on', false);
  end if;
  if v_lv = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  if v_em = '' or char_length(v_em) > 254 or v_em !~* '^[^@\s]+@[^@\s.]+\.[^@\s]+$' then
    return json_build_object('ok', false, 'reason', 'bad_email');
  end if;
  -- 꼬리표는 정해진 모양만 — 아니면 남기지 않는다(자유 글을 받지 않는다)
  if v_src !~ '^[a-z]{2,8}(:[A-Z0-9]{1,12})?$' then
    v_src := null;
  end if;
  -- 같은 주소를 다시 보내면 그대로(동의 시각도 그대로). 바꿀 때만 센다
  if exists (select 1 from public.member_news where user_id = v_uid and email = v_em) then
    return json_build_object('ok', true, 'on', true, 'email', v_em);
  end if;
  -- 회원별로 센다(011 의 rate_ok — 로그인한 사람은 회원 기준)
  if not public.rate_ok('news', 10) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.member_news (user_id, email, source, agreed_at)
  values (v_uid, v_em, v_src, now())
  on conflict (user_id) do update
     set email = excluded.email, source = excluded.source, agreed_at = excluded.agreed_at;
  return json_build_object('ok', true, 'on', true, 'email', v_em);
end;
$fn$;


-- ── 3. 내 동의 보기 — 본인 것만 ──────────────────────────────
create or replace function public.member_news_get()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  r     record;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  if not exists (select 1 from public.members where user_id = v_uid) then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  select email, agreed_at into r from public.member_news where user_id = v_uid;
  if not found then
    return json_build_object('ok', true, 'on', false);
  end if;
  return json_build_object('ok', true, 'on', true, 'email', r.email, 'agreed_at', r.agreed_at);
end;
$fn$;


-- ── 4. 권한 — 로그인한 사람만(안에서 다시 '회원인가'를 본다) ────────
revoke execute on function public.member_news_set(boolean, text, text) from public, anon, authenticated;
revoke execute on function public.member_news_get()                    from public, anon, authenticated;
grant  execute on function public.member_news_set(boolean, text, text) to authenticated;
grant  execute on function public.member_news_get()                    to authenticated;


-- ── 5. 안전장치 — 공개 키·로그인 권한으로 실제로 불러 본다 ──────
--  하나라도 어긋나면 예외가 나고, 위의 모든 변경이 함께 취소된다.
do $chk$
begin
  set local role anon;
  begin perform public.member_news_set(true, 'a@example.com', 'join');
    raise exception '안전장치: 공개 키로 소식 동의 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.member_news_get();
    raise exception '안전장치: 공개 키로 내 소식 동의 보기가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.member_news limit 1;
    raise exception '안전장치: 공개 키로 소식 명단 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  reset role;

  set local role authenticated;
  begin perform * from public.member_news limit 1;
    raise exception '안전장치: 로그인 권한으로 소식 명단 표가 통째로 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  reset role;

  if (select count(*) from pg_constraint c
       where c.contype = 'f' and c.conrelid = 'public.member_news'::regclass
         and c.confrelid = 'public.members'::regclass and c.confdeltype = 'c') <> 1 then
    raise exception '안전장치: 탈퇴할 때 소식 주소가 함께 지워지지 않습니다 — 전체를 취소합니다';
  end if;
end
$chk$;

notify pgrst, 'reload schema';

commit;


-- ── 6. 확인표 — 결과 창에 뜬다 ─────────────────────────────
select 점검, 결과 from (
  select 번호, 점검, case when 결과 then '✅' else '❌' end as 결과
  from (values
    (1, '소식 동의 표가 생겼다', to_regclass('public.member_news') is not null),
    (2, '공개 키·로그인 권한으로 소식 명단을 통째로 못 읽는다',
        not has_table_privilege('anon', 'public.member_news', 'SELECT')
        and not has_table_privilege('authenticated', 'public.member_news', 'SELECT')),
    (3, '공개 키로 소식 동의 함수를 못 부른다',
        not has_function_privilege('anon', 'public.member_news_set(boolean, text, text)', 'EXECUTE')
        and not has_function_privilege('anon', 'public.member_news_get()', 'EXECUTE')),
    (4, '로그인한 사람은 소식 받기·그만 받기를 부를 수 있다',
        has_function_privilege('authenticated', 'public.member_news_set(boolean, text, text)', 'EXECUTE')
        and has_function_privilege('authenticated', 'public.member_news_get()', 'EXECUTE')),
    (5, '탈퇴하면 소식 주소도 함께 지워진다',
        (select count(*) from pg_constraint c
          where c.contype = 'f' and c.conrelid = 'public.member_news'::regclass
            and c.confrelid = 'public.members'::regclass and c.confdeltype = 'c') = 1)
  ) as t(번호, 점검, 결과)
  union all
  select 6, '소식 메일 동의 회원 ' || (select count(*) from public.member_news) || '명 · 회원 '
            || (select count(*) from public.members) || '명', 'ℹ️'
) x
order by 번호;
