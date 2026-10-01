-- ═════════════════════════════════════════════════
--  009 · 검수 대기 알림 — 건수만 알려 주는 함수   (2026-10-02)
-- ------------------------------------------------------------------
--  왜: 팬이 글을 남기면 화면은 "사람이 읽고 올립니다"라고 약속하는데,
--  지금은 누가 /admin 에 들어가 보기 전까지 아무도 모른다.
--  형님 텔레그램으로 "대기 N건"을 하루 두 번 알리려면, 비밀 키 없이
--  대기 건수만 셀 수 있는 창구가 하나 필요하다(scripts/notify_pending.py).
--
--  무엇을 내주나 — 숫자와 '시 단위로 내린' 시각뿐이다.
--    total · note · dream · letter · post (종류별 대기 건수)
--    oldest_at (가장 오래 기다린 글이 들어온 시각 — 시 단위로 내림)
--    since     (p_since 를 시 단위로 내린 뒤 그 이후 들어온 대기 건수)
--    at        (서버가 센 시각)
--  글 내용·이름·토큰·AI 소견은 내주지 않는다.
--
--  왜 시 단위로 내리나 — 기준 시각을 마이크로초까지 받으면, 누구든 기준을 조금씩
--  옮겨 가며 불러 대기 글 하나하나가 들어온 정확한 시각을 알아낼 수 있다(검토에서
--  PGlite 로 재현: 3건에 134번). 알림은 09:00·19:00 정각만 쓰므로 결과가 같다.
--
--  공개 키로 불릴 수 있는 이유 — 알림 스크립트가 형님 맥의 정기 작업에서
--  돈다. 비밀 키를 맥이나 GitHub 에 두면 DB 전체 권한이 거기 놓인다.
--  대기 '건수'는 누가 알아도 해가 없지만 비밀 키는 그렇지 않다.
--
--  셈의 기준은 운영 화면(008 admin_list)과 같다 — 4종의 status = 'pending'.
--  응원(cheers)은 들어오는 즉시 approved 라 검수 대상이 아니므로 세지 않는다.
--
--  안전합니다.
--    · 전체가 한 묶음(begin … commit). 하나라도 실패하면 아무것도 안 바뀝니다.
--    · 표·기존 함수는 건드리지 않습니다. 함수 하나를 더할 뿐입니다.
--    · 맨 끝 안전장치가 공개 키 권한으로 직접 불러, 칸이 정해진 9개뿐인지와
--      운영자가 센 건수와 같은지 확인합니다. 아니면 전체를 취소합니다.
--    · 여러 번 실행해도 결과가 같습니다.
--
--  실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
--  성공하면 결과 창에 ✅ 표가 뜹니다.
-- ═════════════════════════════════════════════════

begin;

-- ── 1. 대기 건수 ─────────────────────────────────────────────
--  stable: 읽기만 한다. 속도 제한(rate_ok)은 걸지 않는다 — rate_ok 는 부를 때마다
--  기록을 쓰는데, 세기만 하는 함수가 쓰기를 남길 이유가 없다. 표 넷이 작아 비싸지도 않다.
--  security definer: 공개 키(anon)에게는 RLS 가 승인된 글만 보여 준다. 대기 글을 세려면
--  표 주인 권한으로 돌아야 한다 — 008 admin_list 가 운영에서 이미 쓰는 방식이다.
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
    select 'dream',  created_at from public.dreams  where status = 'pending'
    union all
    select 'letter', created_at from public.letters where status = 'pending'
    union all
    select 'post',   created_at from public.posts   where status = 'pending'
  )
  select json_build_object(
    'ok',        true,
    'total',     (select count(*) from p),
    'note',      (select count(*) from p where kind = 'note'),
    'dream',     (select count(*) from p where kind = 'dream'),
    'letter',    (select count(*) from p where kind = 'letter'),
    'post',      (select count(*) from p where kind = 'post'),
    'oldest_at', (select date_trunc('hour', min(created_at)) from p),
    'since',     case when p_since is null then null
                      else (select count(*) from p where created_at >= date_trunc('hour', p_since)) end,
    'at',        now());
$fn$;


-- ── 2. 권한 ─────────────────────────────────────────────────
--  Supabase 는 public 스키마의 새 함수를 anon·authenticated 에게 '직접' 열어 준다.
--  그래서 public 만 닫으면 닫힌 게 아니다(008 과 같은 이유). 셋 다 닫은 뒤 다시 연다.
revoke execute on function public.pending_summary(timestamptz) from public, anon, authenticated;
grant  execute on function public.pending_summary(timestamptz) to anon, authenticated;


-- ── 3. 안전장치 — 공개 키 권한으로 실제로 불러 본다 ─────────────
do $chk$
declare
  v       json;
  keys    text[];
  owner_n int;
begin
  -- 운영자(표 주인)가 센 건수 — 공개 키로 센 것과 같아야 한다.
  -- 누가 나중에 security definer 를 빼면 공개 키에게는 RLS 때문에 늘 0건이 보이고,
  -- 알림은 영영 울리지 않는다. 그 조용한 고장을 여기서 막는다.
  owner_n := (public.pending_summary(null) ->> 'total')::int;

  set local role anon;

  v := public.pending_summary(null);
  select array_agg(k order by k) into keys from json_object_keys(v) k;
  if keys is distinct from array['at','dream','letter','note','ok','oldest_at','post','since','total'] then
    raise exception '안전장치: 알림 함수가 정해진 칸 말고 다른 것을 내줍니다 % — 전체를 취소합니다', keys;
  end if;
  if json_typeof(v -> 'total') is distinct from 'number' or json_typeof(v -> 'note') is distinct from 'number'
     or json_typeof(v -> 'dream') is distinct from 'number' or json_typeof(v -> 'letter') is distinct from 'number'
     or json_typeof(v -> 'post') is distinct from 'number' then
    raise exception '안전장치: 건수 칸이 숫자가 아닙니다 — 전체를 취소합니다';
  end if;
  if (v ->> 'total')::int is distinct from owner_n then
    raise exception '안전장치: 공개 키로 센 대기(%)가 운영자가 센 대기(%)와 다릅니다 — 전체를 취소합니다',
      v ->> 'total', owner_n;
  end if;
  if (v ->> 'since') is not null then
    raise exception '안전장치: 기준 시각 없이 부르면 since 는 비어 있어야 합니다 — 전체를 취소합니다';
  end if;
  v := public.pending_summary(now() - interval '1 day');
  if json_typeof(v -> 'since') is distinct from 'number' then
    raise exception '안전장치: 기준 시각을 주면 since 가 숫자여야 합니다 — 전체를 취소합니다';
  end if;

  -- 008 에서 닫은 문은 그대로 닫혀 있어야 한다
  begin
    perform token from public.notes limit 1;
    raise exception '안전장치: 공개 키로 토큰 칸이 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_list('pending', 1);
    raise exception '안전장치: 공개 키로 운영자 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null;
  end;

  reset role;
end
$chk$;

notify pgrst, 'reload schema';

commit;


-- ── 4. 확인표 — 결과 창에 뜬다 ──────────────────────────────
select 점검, 결과 from (
  select 번호, 점검, case when 결과 then '✅' else '❌' end as 결과
  from (values
    (1, '알림 함수가 생겼다',                    to_regprocedure('public.pending_summary(timestamptz)') is not null),
    (2, '공개 키로 대기 건수를 셀 수 있다',       has_function_privilege('anon', 'public.pending_summary(timestamptz)', 'EXECUTE')),
    (3, '내주는 것은 건수·시각 9칸뿐이다',        (select array_agg(k order by k) from json_object_keys(public.pending_summary(null)) k)
                                                = array['at','dream','letter','note','ok','oldest_at','post','since','total']),
    (4, '공개 키로 지우기 토큰은 여전히 못 읽는다', not has_column_privilege('anon', 'public.notes', 'token', 'SELECT')),
    (5, '공개 키로 운영자 함수는 여전히 못 부른다', not has_function_privilege('anon', 'public.admin_list(text, integer)', 'EXECUTE'))
  ) as t(번호, 점검, 결과)
  union all
  select 6, '지금 검수 대기 ' || (public.pending_summary(null) ->> 'total') || '건', 'ℹ️'
) x
order by 번호;
