-- ============================================================
-- 002 · 도배 방지 함수 수정 (필수)
--
-- 001을 실행한 뒤 편지 접수를 시도하면 이런 오류가 납니다.
--   function digest(text, unknown) does not exist
--
-- 원인: Supabase는 pgcrypto 확장을 public이 아니라 extensions 스키마에 설치합니다.
--       보안을 위해 함수의 search_path를 public으로 잠가 두었기 때문에
--       거기 있는 digest()를 찾지 못합니다.
--       (search_path를 넓히는 것은 보안상 좋지 않으니 그 방향으로 풀지 않습니다)
--
-- 해결: Postgres 11부터 기본으로 들어 있는 sha256()을 씁니다.
--       확장에 의존하지 않으므로 이 문제가 다시 생기지 않습니다.
--
-- SQL Editor에 이 파일 전문을 붙여넣고 Run 하시면 됩니다.
-- ============================================================

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

  -- 원본 IP는 저장하지 않는다. 날짜를 섞어 하루 단위로만 유효한 해시를 만든다.
  -- sha256()은 Postgres 내장이라 확장 설치와 무관하게 동작한다.
  return encode(sha256(convert_to(raw || '|' || to_char(now(), 'YYYY-MM-DD'), 'UTF8')), 'hex');
end;
$$;

revoke execute on function public.req_ip_hash() from anon, authenticated;

-- 확인: 아래를 실행하면 편지 한 통이 들어가고 {"ok": true, ...} 가 나옵니다.
--
--   select public.submit_letter('점검', '팬레터', '연결 점검용입니다');
--
-- 확인 후 그 줄은 지우셔도 됩니다.
--
--   delete from public.letters where name = '점검';
