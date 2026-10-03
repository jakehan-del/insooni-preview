-- ═════════════════════════════════════════════════
--  014 · 모든 글 바로 공개   (2026-10-03)
-- ------------------------------------------------------------------
--  형님 결정(10/03 오전, 공연 당일): "모든 글 바로 공개" — 새싹 회원의 글·댓글·공연 방명록도 쓰자마자 모두에게 보인다.
--  문제 글은 운영자가 insooni.com/admin 에서 '내리기'(숨김). 지우는 것은 쓴 사람 자신뿐 — 010 그대로.
--
--  바꾸는 것: 010 의 함수 세 개에서 '공개 여부'를 정하는 한 줄씩만.
--    · board_write   — 새 글: 새싹이면 pending 이던 것을 approved 로   (011 의 공연 방명록도 이 함수를 쓴다)
--    · comment_write — 새 댓글: 같다
--    · board_edit    — 고친 글: 새싹이 고치면 pending 으로 돌리던 것을 지금 상태 그대로(내린 글은 고쳐도 내린 채)
--  함수 시그니처·권한·속도 제한·차단·별명 규칙은 한 글자도 바꾸지 않는다(010 원문을 그대로 옮기고 그 줄만 고침).
--  그리고 지금 확인을 기다리는 회원 글·댓글을 모두 공개로 올린다(그 사이 운영자가 내린 것은 그대로).
--  등급(새싹 → 정회원: 공개된 글 3·댓글 5)은 그대로 — 이제 글을 쓰면 바로 세어진다.
--
--  되돌리려면: 010 을 다시 실행하면 세 함수가 원래대로 돌아간다(표·자료는 그대로).
--  실행: Supabase → SQL Editor → 전체 붙여넣기 → Run. 맨 아래 확인표가 뜨면 성공. 실패하면 전체가 취소된다.
-- ═════════════════════════════════════════════════

begin;

create or replace function public.board_write(p_board text, p_title text, p_body text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_level  text;
  v_board  text := coalesce(nullif(btrim(coalesce(p_board, '')), ''), 'free');
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
  if v_board not in ('notice', 'hello', 'free', 'review') or (v_board = 'notice' and not public.is_admin()) then
    return json_build_object('ok', false, 'reason', 'bad_board');
  end if;
  if char_length(v_title) < 2 then return json_build_object('ok', false, 'reason', 'title_empty'); end if;
  if char_length(v_title) > 60 then return json_build_object('ok', false, 'reason', 'title_long'); end if;
  if char_length(v_body) < 2 then return json_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(v_body) > 4000 then return json_build_object('ok', false, 'reason', 'too_long'); end if;
  if not public.rate_ok('bwrite', 20)
     or (select count(*) from public.board_posts where user_id = v_uid and created_at > now() - interval '1 hour') >= 5 then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  v_status := 'approved';   -- 014: 모든 회원의 글이 바로 공개된다(형님 2026-10-03). 차단 회원은 위에서 이미 막혔다
  insert into public.board_posts (user_id, board, title, body, status)
  values (v_uid, v_board, v_title, v_body, v_status)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'status', v_status);
end;
$fn$;

create or replace function public.board_edit(p_id bigint, p_board text, p_title text, p_body text)
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
  v_board  text := nullif(btrim(coalesce(p_board, '')), '');
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
  if v_board is not null and (v_board not in ('notice', 'hello', 'free', 'review')
                              or (v_board = 'notice' and not public.is_admin())) then
    return json_build_object('ok', false, 'reason', 'bad_board');
  end if;
  if not public.rate_ok('bedit', 30) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  v_new := v_status;          -- 014: 고쳐도 지금 상태 그대로(공개는 공개, 운영자가 내린 글은 내린 채로)
  update public.board_posts
     set title = v_title, body = v_body, edited_at = now(), status = v_new,
         board = coalesce(v_board, board)
   where id = p_id;
  return json_build_object('ok', true, 'status', v_new);
end;
$fn$;

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
  v_status := 'approved';   -- 014: 댓글도 바로 공개
  insert into public.board_comments (post_id, user_id, body, status)
  values (p_post_id, v_uid, v_body, v_status)
  returning id into v_id;
  return json_build_object('ok', true, 'id', v_id, 'status', v_status);
end;
$fn$;

-- 기다리던 회원 글·댓글을 올린다(운영자가 내린 rejected 는 건드리지 않는다)
update public.board_posts    set status = 'approved' where status = 'pending';
update public.board_comments set status = 'approved' where status = 'pending';

-- 권한은 010 과 같게(create or replace 는 권한을 지우지 않지만, 처음 보는 사람이 읽기 쉽게 다시 적는다)
revoke all on function public.board_write(text, text, text)        from public, anon;
revoke all on function public.board_edit(bigint, text, text, text) from public, anon;
revoke all on function public.comment_write(bigint, text)          from public, anon;
grant execute on function public.board_write(text, text, text)        to authenticated;
grant execute on function public.board_edit(bigint, text, text, text) to authenticated;
grant execute on function public.comment_write(bigint, text)          to authenticated;

-- 안전장치: 익명은 여전히 못 부른다
do $chk$
begin
  if has_function_privilege('anon', 'public.board_write(text, text, text)', 'execute') then
    raise exception '014 안전장치: 익명이 board_write 를 부를 수 있다 — 전체 취소';
  end if;
  if has_function_privilege('anon', 'public.comment_write(bigint, text)', 'execute') then
    raise exception '014 안전장치: 익명이 comment_write 를 부를 수 있다 — 전체 취소';
  end if;
end
$chk$;

commit;

select '✅ 014 모든 글 바로 공개' as "확인",
       (select count(*) from public.board_posts    where status = 'pending') as "남은 확인 대기 글",
       (select count(*) from public.board_comments where status = 'pending') as "남은 확인 대기 댓글",
       (select count(*) from public.board_posts    where status = 'approved') as "공개된 글";
