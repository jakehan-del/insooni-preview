-- ═════════════════════════════════════════════════
--  013 · 마이페이지 · 가입 질문 '내 노래'   (2026-10-03)
-- ------------------------------------------------------------------
--  형님 결정(2026-10-02)
--    ① 가입을 마칠 때 질문 하나 — '인순이 노래 중 가장 좋아하는 곡'. songs.json 정본 103곡에서 고른다.
--       답은 선택(건너뛰어도 가입된다). 내 정보에 '내 노래'로 남고 언제든 바꾸거나 지울 수 있다.
--       운영 화면 회원 탭에서도 보인다(등업 참고). 다른 회원·공개 화면에는 나가지 않는다.
--    ② 마이페이지 — 내가 쓴 글(확인 중·공개·내려짐 · 게시판 · 댓글 수) · 내 댓글(어느 글에 단 것인지 · 상태) ·
--       등업 진행(공개된 글 n/기준 · 댓글 n/기준 — 기준은 board_settings 값 그대로) · 다녀온 공연 도장 · 내 노래.
--
--  지킨 것
--    · 010·011 은 고치지 않는다. 010·011 의 함수는 다시 정의하지 않는다(시그니처·몸통 모두 그대로).
--      가입(member_join)도 그대로 두고 노래는 따로 저장한다(member_set_song) — 이미 운영 중인 가입 화면이
--      013 전후 어느 쪽에서도 똑같이 움직이게.
--    · 새 표 둘(노래 목록 · 내 노래)은 잠근다(RLS + revoke, 정책 없음). 읽기도 쓰기도 함수로만.
--    · 서버는 songs.json 을 읽지 못한다 — 103곡 정본(k·제목·연도)을 이 파일에 그대로 옮겨 실었다.
--      그 밖의 이름은 받지 않는다. 맨 끝 안전장치가 목록의 지문(md5)을 대조해, 한 글자라도 다르면 전체를 취소한다.
--    · 등업 숫자는 010 의 member_recheck 와 '같은 셈'이다 — 공개된(approved) 글·댓글만, 기준은 board_settings.
--      지어내지도, 확인 중인 글을 미리 세지도 않는다. 마이페이지를 열 때 기준을 다시 센다(기준값이 낮아진 뒤
--      아직 새싹으로 남은 사람이 '3/3 인데 새싹'으로 보이지 않게 — 010 의 같은 규칙으로 올린다).
--    · 남의 것은 어느 함수로도 나가지 않는다. 마이페이지는 로그인한 본인 것만, 노래 명단은 운영자만.
--    · 내려진(rejected)·확인 중인 남의 글에 단 내 댓글은 '어느 글인지'의 제목을 싣지 않는다(볼 수 없는 글이다).
--    · 탈퇴하면 내 노래가 함께 지워진다(members 에 on delete cascade — 010 의 두 탈퇴 경로 모두).
--    · 011(공연 모드)이 없어도 실패하지 않는다. 011 이 있으면 '다녀온 공연 도장'(011 의 gig_my_stamps)과
--      방명록 글의 공연 꼬리표를 싣고, 없으면 그 칸만 비운다. 011 을 나중에 실행해도 013 을 다시 돌릴 필요가 없다.
--    · 010 이 없으면 시작하자마자 분명한 오류로 멈춘다(아무것도 바뀌지 않는다).
--
--  안전합니다.
--    · 전체가 한 묶음(begin … commit). 하나라도 실패하면 아무것도 안 바뀝니다.
--    · 맨 끝 안전장치가 공개 키·로그인 권한으로 직접 불러 봐서, 표가 열려 있거나
--      막혀야 할 함수가 불리면 스스로 전체를 취소합니다.
--    · 여러 번 실행해도 결과가 같습니다(회원이 고른 노래는 그대로 둡니다).
--
--  실행 순서: 011(공연 모드) → 012(진해 공연 등록) → 013(이 파일).
--  실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
--  성공하면 결과 창에 ✅ 표가 뜹니다.
-- ═════════════════════════════════════════════════

begin;

-- ── 0. 앞선 파일 확인 — 010 이 있어야 한다 ─────────────────────
do $pre$
begin
  if to_regclass('public.members') is null or to_regclass('public.board_posts') is null
     or to_regclass('public.board_comments') is null or to_regclass('public.board_settings') is null
     or to_regprocedure('public.member_recheck(uuid)') is null or to_regprocedure('public.bs(text,integer)') is null
     or to_regprocedure('public.rate_ok(text,integer)') is null or to_regprocedure('public.is_admin()') is null then
    raise exception '013 앞에 010(회원과 게시판)을 먼저 실행해야 합니다 — 아무것도 바뀌지 않았습니다';
  end if;
end
$pre$;


-- ── 1. 노래 목록 — songs.json 의 정본 103곡 ─────────────────────
--  k 는 songs.json 의 k(제목에서 띄어쓰기·기호를 빼고 소문자로), title 은 화면에 보이는 정본 제목, sort 는 songs.json 순서.
--  여러 번 실행하면 이 파일의 값으로 되돌린다(누가 표를 손으로 고쳤어도 정본으로).
create table if not exists public.member_song_choices (
  k      text primary key,
  title  text not null,
  year   smallint not null,
  sort   smallint not null,
  constraint msc_title_uq  unique (title),
  constraint msc_k_len     check (char_length(k) between 1 and 80),
  constraint msc_title_len check (char_length(title) between 1 and 80),
  constraint msc_year_ok   check (year between 1970 and 2100)
);
alter table public.member_song_choices enable row level security;
revoke all on public.member_song_choices from anon, authenticated;

insert into public.member_song_choices (sort, k, title, year) values
  (  1, '실버들', '실버들', 1978),
  (  2, '꿈이였나봐', '꿈이였나봐', 1980),
  (  3, '내마음흔들려', '내마음 흔들려', 1980),
  (  4, '복돌이', '복돌이', 1980),
  (  5, '빨간마후라', '빨간 마후라', 1980),
  (  6, '웃어주세요', '웃어주세요', 1980),
  (  7, '인연', '인연', 1980),
  (  8, '재수생', '재수생', 1980),
  (  9, '정말로모르시나', '정말로 모르시나', 1980),
  ( 10, '조용한이별', '조용한 이별', 1980),
  ( 11, '가야지', '가야지', 1981),
  ( 12, '누가', '누가', 1981),
  ( 13, '다시말해요', '다시 말해요', 1981),
  ( 14, '달님아', '달님아', 1981),
  ( 15, '떠나야할그사람', '떠나야할 그사람', 1981),
  ( 16, '봄비', '봄비', 1981),
  ( 17, '빗방울', '빗방울', 1981),
  ( 18, '석양', '석양', 1981),
  ( 19, '오솔길을따라서', '오솔길을 따라서', 1981),
  ( 20, '추억', '추억', 1981),
  ( 21, '가신님그리워', '가신 님 그리워', 1982),
  ( 22, '너와나의사랑노래', '너와 나의 사랑 노래', 1982),
  ( 23, '말없이', '말없이', 1982),
  ( 24, '미워미워미워', '미워 미워 미워', 1982),
  ( 25, '바보같은내마음', '바보같은 내 마음', 1982),
  ( 26, '슬픔만남아있어요', '슬픔만 남아 있어요', 1982),
  ( 27, '연락선은떠나가네', '연락선은 떠나가네', 1982),
  ( 28, '울지도못합니다', '울지도 못합니다', 1982),
  ( 29, '이몸이늙어', '이 몸이 늙어', 1982),
  ( 30, '이젠', '이젠', 1982),
  ( 31, '잊으려네잊으려네', '잊으려네 잊으려네', 1982),
  ( 32, '잊을수없어', '잊을 수 없어', 1982),
  ( 33, '고독', '고독', 1983),
  ( 34, '그리운내사랑아', '그리운 내사랑아', 1983),
  ( 35, '내고향집', '내 고향집', 1983),
  ( 36, '다른사람말처럼들리네', '다른 사람 말처럼 들리네', 1983),
  ( 37, '밤이면밤마다', '밤이면 밤마다', 1983),
  ( 38, '손모아마음모아', '손모아 마음모아', 1983),
  ( 39, '슬픈아침', '슬픈 아침', 1983),
  ( 40, '왜나를떠나셨나요', '왜 나를 떠나셨나요', 1983),
  ( 41, '욕망', '욕망', 1983),
  ( 42, '한밤중', '한밤중', 1983),
  ( 43, '길섶에핀꽃', '길섶에 핀꽃', 1984),
  ( 44, '너와나', '너와 나', 1984),
  ( 45, '아름다운우리나라', '아름다운 우리나라', 1984),
  ( 46, '야속한내님', '야속한 내님', 1984),
  ( 47, '여기가어디냐', '여기가 어디냐', 1984),
  ( 48, '이별의눈동자', '이별의 눈동자', 1984),
  ( 49, '흔들리는갈대', '흔들리는 갈대', 1984),
  ( 50, '겨울찬가', '겨울 찬가', 1987),
  ( 51, '밤은모든것을기억한다', '밤은 모든 것을 기억한다', 1987),
  ( 52, '비닐장판위의딱정벌레', '비닐장판위의 딱정벌레', 1987),
  ( 53, '비와개구리', '비와 개구리', 1987),
  ( 54, '사랑그에필로그', '사랑, 그 에필로그', 1987),
  ( 55, '에레나라불리운여인', '에레나라 불리운 여인', 1987),
  ( 56, '장미들의합창', '장미들의 합창', 1987),
  ( 57, '혼자사는여자', '혼자 사는 여자', 1987),
  ( 58, 'miss나비를찾아서', 'Miss나비를 찾아서', 1987),
  ( 59, 'lastnightinmydream', 'Last Night In My Dream', 1988),
  ( 60, '이별연습', '이별연습', 1989),
  ( 61, '잠깐', '잠깐', 1991),
  ( 62, '그대가말하는사랑', '그대가 말하는 사랑', 1996),
  ( 63, '너의곁에나', '너의 곁에 나', 1996),
  ( 64, '또', '또', 1996),
  ( 65, '밀애', '밀애', 1996),
  ( 66, '이별을준비할꺼야', '이별을 준비할꺼야', 1996),
  ( 67, '혼자가아닌나', '혼자가 아닌 나', 1996),
  ( 68, '사랑가', '사랑가', 2001),
  ( 69, 'allthethingsyouare', 'All The Things You Are', 2003),
  ( 70, 'autumnleaves', 'Autumn Leaves', 2003),
  ( 71, 'caravan', 'Caravan', 2003),
  ( 72, 'love', 'Love', 2003),
  ( 73, 'lullabybirdland', 'Lullaby Birdland', 2003),
  ( 74, 'mylove', 'My Love', 2003),
  ( 75, 'sasulnanbongga', 'Sasul Nanbong Ga', 2003),
  ( 76, 'smile', 'Smile', 2003),
  ( 77, '비상', '비상', 2004),
  ( 78, '비에스친날들', '비에 스친 날들', 2004),
  ( 79, '여자이니까', '여자이니까', 2004),
  ( 80, '여정', '여정', 2004),
  ( 81, '연가', '연가', 2004),
  ( 82, '연인', '연인', 2004),
  ( 83, '웃고있지만', '웃고 있지만', 2004),
  ( 84, '친구여', '친구여', 2004),
  ( 85, 'higher', 'Higher', 2004),
  ( 86, 'mylife', 'My Life', 2004),
  ( 87, 'swingmybaby', 'Swing My Baby', 2004),
  ( 88, 'tonight', 'Tonight', 2004),
  ( 89, '거위의꿈', '거위의 꿈', 2007),
  ( 90, '기회', '기회', 2009),
  ( 91, '나무', '나무', 2009),
  ( 92, '딸에게', '딸에게', 2009),
  ( 93, '아버지', '아버지', 2009),
  ( 94, '일어나', '일어나', 2009),
  ( 95, '향수', '향수', 2009),
  ( 96, 'cry', 'Cry', 2009),
  ( 97, 'fantasia', 'Fantasia', 2009),
  ( 98, 'merrymerry', 'Merry Merry', 2009),
  ( 99, '행복', '행복', 2019),
  (100, '너의이름을세상이부를때', '너의 이름을 세상이 부를 때', 2024),
  (101, '토닥토닥', '토닥토닥', 2024),
  (102, '그래도꿈은흐른다', '그래도 꿈은 흐른다', 2025),
  (103, '바보멍청이똥개', '바보 멍청이 똥개', 2025)
on conflict (k) do update
  set title = excluded.title, year = excluded.year, sort = excluded.sort
  where (public.member_song_choices.title, public.member_song_choices.year, public.member_song_choices.sort)
        is distinct from (excluded.title, excluded.year, excluded.sort);


-- ── 2. 내 노래 — 회원 한 사람에 한 곡 ───────────────────────────
--  기본키가 '한 사람 한 곡'을 지킨다. 탈퇴하면 함께 지워진다(members on delete cascade).
--  노래 칸은 목록(k)만 가리킨다 — 목록에 없는 이름은 표에 들어갈 수조차 없다.
create table if not exists public.member_songs (
  user_id  uuid not null,
  k        text not null,
  at       timestamptz not null default now(),
  constraint member_songs_pk        primary key (user_id),
  constraint member_songs_member_fk foreign key (user_id) references public.members (user_id) on delete cascade,
  constraint member_songs_song_fk   foreign key (k) references public.member_song_choices (k) on update cascade
);
create index if not exists member_songs_k on public.member_songs (k);
alter table public.member_songs enable row level security;
revoke all on public.member_songs from anon, authenticated;


-- ── 3. 안쪽 도우미 (밖에서 못 부른다) ──────────────────────────
--  011(공연 모드)이 깔려 있나 — 공연 표와 게시판 글의 공연 칸이 둘 다 있어야 '예'.
create or replace function public.member_gigs_ready()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select to_regclass('public.gig_events') is not null
     and exists (select 1 from pg_attribute a
                  where a.attrelid = to_regclass('public.board_posts') and a.attname = 'gig_id' and not a.attisdropped);
$fn$;


-- ── 4. 내 노래 고르기 · 바꾸기 · 지우기 (로그인한 회원) ─────────────
--  p_song: 정본 제목('거위의 꿈') 또는 k('거위의꿈'). 띄어쓰기가 여럿이어도 하나로 본다.
--  빈 값·null 이면 지운다(답은 선택). 목록에 없는 이름은 bad_song — 비슷한 곡으로 바꿔 넣지 않는다.
create or replace function public.member_set_song(p_song text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_lv  text;
  v_in  text := btrim(regexp_replace(coalesce(p_song, ''), '\s+', ' ', 'g'));
  c     record;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select level into v_lv from public.members where user_id = v_uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  -- 차단된 회원은 별명과 같이 내 정보도 바꾸지 못한다(010 member_rename 과 같은 규칙)
  if v_lv = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  if v_in = '' then
    if not public.rate_ok('song', 30) then
      return json_build_object('ok', false, 'reason', 'rate_limited');
    end if;
    delete from public.member_songs where user_id = v_uid;
    return json_build_object('ok', true, 'song', null);
  end if;
  select s.k, s.title, s.year into c
    from public.member_song_choices s
   where s.title = v_in or s.k = v_in
   order by (s.title = v_in) desc
   limit 1;
  if not found then
    return json_build_object('ok', false, 'reason', 'bad_song');
  end if;
  if not public.rate_ok('song', 30) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.member_songs (user_id, k) values (v_uid, c.k)
  on conflict (user_id) do update set k = excluded.k, at = now();
  return json_build_object('ok', true, 'song', json_build_object('k', c.k, 'title', c.title, 'year', c.year));
end;
$fn$;


-- ── 5. 내가 쓴 글 · 내 댓글 (나만 본다 — 더 보기는 p_before 로) ─────
--  글: 상태(pending 확인 중 · approved 공개 · rejected 내려짐)·게시판·댓글 수(공개된 댓글만 — 남들이 보는 숫자)·
--      공연 꼬리표(011 이 있고 방명록으로 쓴 글만). 본문은 싣지 않는다(목록이다 — 열면 board_read).
--  한 번에 최대 50개. more 가 true 면 마지막 id 를 p_before 로 다시 부른다.
create or replace function public.member_my_posts(p_before bigint default null, p_limit int default 20)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_lim  int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows json;
  v_min  bigint;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  if not exists (select 1 from public.members where user_id = v_uid) then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if public.member_gigs_ready() then
    select coalesce(json_agg(x order by x.id desc), '[]'::json), min(x.id) into v_rows, v_min
    from (
      select p.id, p.board, p.title, p.status, p.created_at, p.edited_at,
             (select count(*) from public.board_comments c where c.post_id = p.id and c.status = 'approved') as comments,
             (select json_build_object('code', g.code, 'title_ko', g.title_ko, 'title_en', g.title_en)
                from public.gig_events g where g.id = p.gig_id) as gig
        from public.board_posts p
       where p.user_id = v_uid and (p_before is null or p.id < p_before)
       order by p.id desc
       limit v_lim
    ) x;
  else
    select coalesce(json_agg(x order by x.id desc), '[]'::json), min(x.id) into v_rows, v_min
    from (
      select p.id, p.board, p.title, p.status, p.created_at, p.edited_at,
             (select count(*) from public.board_comments c where c.post_id = p.id and c.status = 'approved') as comments,
             null::json as gig
        from public.board_posts p
       where p.user_id = v_uid and (p_before is null or p.id < p_before)
       order by p.id desc
       limit v_lim
    ) x;
  end if;
  return json_build_object('ok', true, 'rows', v_rows,
    'more', v_min is not null and exists (select 1 from public.board_posts where user_id = v_uid and id < v_min));
end;
$fn$;

--  댓글: 본문(내 글이니 전부)·상태·어느 글에 달았나. 그 글이 지금 볼 수 있는 글(공개 또는 내 글)일 때만
--  제목·게시판을 싣는다. 내려졌거나 쓴 사람이 고쳐 다시 확인 중인 남의 글은 post_visible=false · 제목 null.
create or replace function public.member_my_comments(p_before bigint default null, p_limit int default 20)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_lim  int := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows json;
  v_min  bigint;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  if not exists (select 1 from public.members where user_id = v_uid) then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  select coalesce(json_agg(x order by x.id desc), '[]'::json), min(x.id) into v_rows, v_min
  from (
    select c.id, c.body, c.status, c.created_at, c.post_id,
           (p.status = 'approved' or p.user_id = v_uid) as post_visible,
           case when p.status = 'approved' or p.user_id = v_uid then p.title end as post_title,
           case when p.status = 'approved' or p.user_id = v_uid then p.board end as post_board,
           (p.user_id = v_uid) as post_mine
      from public.board_comments c
      join public.board_posts p on p.id = c.post_id
     where c.user_id = v_uid and (p_before is null or c.id < p_before)
     order by c.id desc
     limit v_lim
  ) x;
  return json_build_object('ok', true, 'rows', v_rows,
    'more', v_min is not null and exists (select 1 from public.board_comments where user_id = v_uid and id < v_min));
end;
$fn$;


-- ── 6. 마이페이지 한 번에 ───────────────────────────────────────
--  010 의 member_me 와 같은 칸(별명·등급·운영자·자동 등업·가입 경로·공개된 글/댓글 수·기준)에
--  내 노래 · 건수 · 첫 쪽 글 20 · 첫 쪽 댓글 20 · 다녀온 공연 도장을 더한다(느린 LTE 에서 왕복 한 번).
--  부를 때 010 의 member_recheck 로 등업 기준을 다시 센다 — 그래서 stable 이 아니다(POST 로만 부른다).
create or replace function public.member_page()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_nick   text;
  v_level  text;
  v_by     text;
  v_joined timestamptz;
  v_prov   text;
  v_up     boolean := false;
  v_np     int;
  v_nc     int;
  v_pp     int;
  v_song   json;
  v_cnt    json;
  v_st     json;
  v_stfn   boolean := to_regprocedure('public.gig_my_stamps()') is not null;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  if not exists (select 1 from public.members where user_id = v_uid) then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  -- 010 과 같은 규칙으로 다시 센다(새싹 · 자동 등업 대상일 때만 바뀐다 — 운영자가 정한 등급은 건드리지 않는다)
  v_up := public.member_recheck(v_uid);
  select m.nickname, m.level, m.level_by, m.joined_at into v_nick, v_level, v_by, v_joined
    from public.members m where m.user_id = v_uid;
  select coalesce(u.raw_app_meta_data ->> 'provider', 'email') into v_prov from auth.users u where u.id = v_uid;
  -- 등업 숫자 — member_recheck · member_me 와 같은 셈(공개된 것만)
  select count(*) into v_np from public.board_posts    where user_id = v_uid and status = 'approved';
  select count(*) into v_nc from public.board_comments where user_id = v_uid and status = 'approved';
  select count(*) into v_pp from public.board_posts    where user_id = v_uid and status = 'pending';
  select json_build_object('k', c.k, 'title', c.title, 'year', c.year, 'at', s.at) into v_song
    from public.member_songs s join public.member_song_choices c on c.k = s.k
   where s.user_id = v_uid;
  select json_build_object(
    'posts', json_build_object(
      'total',    (select count(*) from public.board_posts where user_id = v_uid),
      'pending',  (select count(*) from public.board_posts where user_id = v_uid and status = 'pending'),
      'approved', (select count(*) from public.board_posts where user_id = v_uid and status = 'approved'),
      'rejected', (select count(*) from public.board_posts where user_id = v_uid and status = 'rejected')),
    'comments', json_build_object(
      'total',    (select count(*) from public.board_comments where user_id = v_uid),
      'pending',  (select count(*) from public.board_comments where user_id = v_uid and status = 'pending'),
      'approved', (select count(*) from public.board_comments where user_id = v_uid and status = 'approved'),
      'rejected', (select count(*) from public.board_comments where user_id = v_uid and status = 'rejected')))
    into v_cnt;
  -- 다녀온 공연 도장 — 011 의 gig_my_stamps 를 그대로(차단 회원이면 그 함수가 주는 blocked 도 그대로)
  if v_stfn then
    v_st := public.gig_my_stamps();
  end if;
  return json_build_object(
    'ok', true, 'joined', true,
    'nickname', v_nick, 'level', v_level, 'admin', public.is_admin(),
    'auto_up', v_by = 'auto', 'levelup', v_up,
    'provider', v_prov, 'joined_at', v_joined,
    'posts_ok', v_np, 'comments_ok', v_nc, 'posts_pending', v_pp,
    'need_posts', public.bs('levelup_posts', 3), 'need_comments', public.bs('levelup_comments', 5),
    'song', v_song,
    'counts', v_cnt,
    'posts', public.member_my_posts(null::bigint, 20),
    'comments', public.member_my_comments(null::bigint, 20),
    'gigs', v_stfn and public.member_gigs_ready(),
    'stamps', v_st);
end;
$fn$;


-- ── 7. 운영 — 회원별 내 노래 (운영자만) ─────────────────────────
--  회원 탭이 010 의 admin_members 행에 user_id 로 붙여 쓴다(010 함수는 고치지 않는다).
--  tally 는 곡별 실제 count(*) — 고른 사람이 있는 곡만.
create or replace function public.admin_member_songs(p_limit int default 2000)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_lim   int := least(greatest(coalesce(p_limit, 2000), 1), 5000);
  v_rows  json;
  v_tally json;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select coalesce(json_agg(x order by x.at desc, x.user_id), '[]'::json) into v_rows
  from (
    select s.user_id, m.nickname, m.level, c.k, c.title, c.year, s.at
      from public.member_songs s
      join public.members m on m.user_id = s.user_id
      join public.member_song_choices c on c.k = s.k
     order by s.at desc, s.user_id
     limit v_lim
  ) x;
  select coalesce(json_agg(json_build_object('k', t.k, 'title', t.title, 'n', t.n) order by t.n desc, t.sort), '[]'::json)
    into v_tally
  from (
    select c.k, c.title, c.sort, count(*) as n
      from public.member_songs s join public.member_song_choices c on c.k = s.k
     group by c.k, c.title, c.sort
  ) t;
  return json_build_object('ok', true, 'rows', v_rows, 'tally', v_tally,
    'counts', json_build_object('members',   (select count(*) from public.members),
                                'with_song', (select count(*) from public.member_songs)));
end;
$fn$;


-- ── 8. 누가 무엇을 부를 수 있나 ────────────────────────────────
--  Supabase 는 public 스키마의 새 함수를 anon·authenticated 에게 '직접' 열고, Postgres 는 PUBLIC 에게도 연다.
--  그래서 셋 다에서 닫고, 필요한 역할에만 다시 연다(011 과 같은 방식).
revoke execute on function public.member_gigs_ready()                   from public, anon, authenticated;
revoke execute on function public.member_set_song(text)                 from public, anon, authenticated;
revoke execute on function public.member_my_posts(bigint, int)          from public, anon, authenticated;
revoke execute on function public.member_my_comments(bigint, int)       from public, anon, authenticated;
revoke execute on function public.member_page()                         from public, anon, authenticated;
revoke execute on function public.admin_member_songs(int)               from public, anon, authenticated;

--  로그인한 사람: 마이페이지·노래 (안에서 다시 '회원인가·차단인가'를 본다)
grant execute on function public.member_set_song(text)                  to authenticated;
grant execute on function public.member_my_posts(bigint, int)           to authenticated;
grant execute on function public.member_my_comments(bigint, int)        to authenticated;
grant execute on function public.member_page()                          to authenticated;
--  운영 함수는 로그인한 사람에게 열되, 안에서 운영자 명단을 본다(문이 두 겹)
grant execute on function public.admin_member_songs(int)                to authenticated;


-- ── 9. 안전장치 — 공개 키·로그인 권한으로 실제로 불러 본다 ──────
--  하나라도 어긋나면 예외가 나고, 위의 모든 변경이 함께 취소된다.
do $chk$
declare
  v    json;
  keys text[];
  n    int;
  fp   text;
begin
  -- (가) 공개 키 — 새 함수는 하나도 못 부르고, 새 표는 하나도 못 읽는다
  set local role anon;

  begin perform public.member_page();
    raise exception '안전장치: 공개 키로 마이페이지 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.member_set_song('거위의 꿈');
    raise exception '안전장치: 공개 키로 노래 고르기 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.member_my_posts(null::bigint, 1);
    raise exception '안전장치: 공개 키로 내 글 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.member_my_comments(null::bigint, 1);
    raise exception '안전장치: 공개 키로 내 댓글 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_member_songs(1);
    raise exception '안전장치: 공개 키로 회원 노래 명단이 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.member_gigs_ready();
    raise exception '안전장치: 공개 키로 도우미 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.member_songs limit 1;
    raise exception '안전장치: 공개 키로 회원별 노래 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.member_song_choices limit 1;
    raise exception '안전장치: 공개 키로 노래 목록 원본 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;

  -- 010 의 공개 함수는 칸이 그대로다(내 노래가 공개 목록으로 새지 않는다)
  v := public.board_list(null, null, 1);
  select array_agg(k order by k) into keys from json_object_keys(v) k;
  if keys is distinct from array['more','notices','ok','rows'] then
    raise exception '안전장치: 게시판 목록(010)의 칸이 바뀌었습니다 % — 전체를 취소합니다', keys;
  end if;
  v := public.cafe_info();
  select array_agg(k order by k) into keys from json_object_keys(v) k;
  if keys is distinct from array['members','ok','posts'] then
    raise exception '안전장치: 카페 숫자(010)의 칸이 바뀌었습니다 % — 전체를 취소합니다', keys;
  end if;

  reset role;

  -- (나) 로그인 역할이지만 로그인 토큰이 없는 상태 — 함수 안의 문지기가 막아야 한다
  set local role authenticated;
  v := public.member_page();
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 마이페이지가 not_logged_in 이 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.member_set_song('거위의 꿈');
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 노래 고르기가 not_logged_in 이 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.member_my_posts(null::bigint, 1);
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 내 글이 not_logged_in 이 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.member_my_comments(null::bigint, 1);
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 내 댓글이 not_logged_in 이 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.admin_member_songs(1);
  if (v ->> 'reason') is distinct from 'forbidden' then
    raise exception '안전장치: 운영자 아닌 사람에게 회원 노래 명단이 열립니다 — 전체를 취소합니다';
  end if;
  begin perform * from public.member_songs limit 1;
    raise exception '안전장치: 로그인 역할로 회원별 노래 표가 직접 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.member_song_choices limit 1;
    raise exception '안전장치: 로그인 역할로 노래 목록 원본 표가 직접 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.member_gigs_ready();
    raise exception '안전장치: 로그인 역할로 도우미 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  -- 010 의 가입은 그대로 움직인다
  v := public.member_join('시험별명', true, true);
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 가입 함수(010)가 다르게 움직입니다 — 전체를 취소합니다';
  end if;
  reset role;

  -- (다) 소유자 — 구조 점검
  -- 정본 103곡의 지문(songs.json 의 k|제목|연도를 순서대로 줄바꿈으로 이은 것의 md5)
  select count(*), md5(string_agg(k || '|' || title || '|' || year::text, E'\n' order by sort))
    into n, fp from public.member_song_choices;
  if n <> 103 or fp is distinct from 'b36163446428965122918984415071b9' then
    raise exception '안전장치: 노래 목록이 songs.json 정본 103곡과 다릅니다(%곡 · 지문 %) — 전체를 취소합니다', n, fp;
  end if;
  select count(*) into n from pg_constraint c
   where c.contype = 'f' and c.conrelid = 'public.member_songs'::regclass
     and c.confrelid = 'public.members'::regclass and c.confdeltype = 'c';
  if n <> 1 then
    raise exception '안전장치: 탈퇴하면 내 노래가 함께 지워지는 연결이 1개가 아니라 %개입니다 — 전체를 취소합니다', n;
  end if;
  select count(*) into n from pg_constraint c
   where c.contype = 'f' and c.conrelid = 'public.member_songs'::regclass
     and c.confrelid = 'public.member_song_choices'::regclass;
  if n <> 1 then
    raise exception '안전장치: 내 노래가 노래 목록만 가리키는 연결이 1개가 아니라 %개입니다 — 전체를 취소합니다', n;
  end if;
  select count(*) into n from pg_class c
   where c.oid in ('public.member_songs'::regclass, 'public.member_song_choices'::regclass)
     and c.relrowsecurity
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
  if n <> 2 then
    raise exception '안전장치: 새 표 둘이 잠겨 있지 않습니다(RLS 켜짐 · 정책 없음이 %개) — 전체를 취소합니다', n;
  end if;
  select count(*) into n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('member_gigs_ready', 'member_set_song', 'member_my_posts', 'member_my_comments',
                       'member_page', 'admin_member_songs')
     and p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=public, pg_temp';
  if n <> 6 then
    raise exception '안전장치: 새 함수 6개가 전부 security definer · search_path 고정이 아닙니다(%개) — 전체를 취소합니다', n;
  end if;
  -- 010 의 가입 함수는 인자 셋 한 판뿐이다(같은 이름 두 판이 있으면 PostgREST 가 헷갈린다)
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'member_join';
  if n <> 1 or to_regprocedure('public.member_join(text,boolean,boolean)') is null
     or not has_function_privilege('authenticated', 'public.member_join(text,boolean,boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.member_join(text,boolean,boolean)', 'EXECUTE') then
    raise exception '안전장치: 가입 함수(010)의 모양이나 권한이 바뀌었습니다 — 전체를 취소합니다';
  end if;
  -- 011 이 있으면 마이페이지가 그대로 부르는 도장 함수가 있어야 한다
  if public.member_gigs_ready() and to_regprocedure('public.gig_my_stamps()') is null then
    raise exception '안전장치: 공연 표는 있는데 내 도장 함수(011 gig_my_stamps)가 없습니다 — 전체를 취소합니다';
  end if;
end
$chk$;

notify pgrst, 'reload schema';

commit;


-- ── 10. 확인표 — 결과 창에 뜬다 ─────────────────────────────
select 점검, 결과 from (
  select 번호, 점검, case when 결과 then '✅' else '❌' end as 결과
  from (values
    (1,  '노래 목록 표 · 내 노래 표가 생겼다',
         to_regclass('public.member_song_choices') is not null and to_regclass('public.member_songs') is not null),
    (2,  '노래 목록 = songs.json 정본 103곡',
         (select count(*) = 103
                 and md5(string_agg(k || '|' || title || '|' || year::text, E'\n' order by sort)) = 'b36163446428965122918984415071b9'
            from public.member_song_choices)),
    (3,  '공개 키로 내 노래 · 노래 목록 원본을 못 읽는다',
         not has_table_privilege('anon', 'public.member_songs', 'SELECT')
         and not has_table_privilege('anon', 'public.member_song_choices', 'SELECT')
         and not has_table_privilege('authenticated', 'public.member_songs', 'SELECT')),
    (4,  '공개 키로 마이페이지 · 노래 고르기를 못 부른다',
         not has_function_privilege('anon', 'public.member_page()', 'EXECUTE')
         and not has_function_privilege('anon', 'public.member_set_song(text)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.member_my_posts(bigint, integer)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.member_my_comments(bigint, integer)', 'EXECUTE')),
    (5,  '로그인한 사람은 마이페이지 · 노래 고르기를 부를 수 있다',
         has_function_privilege('authenticated', 'public.member_page()', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.member_set_song(text)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.member_my_posts(bigint, integer)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.member_my_comments(bigint, integer)', 'EXECUTE')),
    (6,  '탈퇴하면 내 노래도 함께 지워진다',
         (select count(*) from pg_constraint c
           where c.contype = 'f' and c.conrelid = 'public.member_songs'::regclass
             and c.confrelid = 'public.members'::regclass and c.confdeltype = 'c') = 1),
    (7,  '회원별 노래 명단은 공개 키가 못 부른다(운영자만)',
         not has_function_privilege('anon', 'public.admin_member_songs(integer)', 'EXECUTE')),
    (8,  '가입 함수(010)는 그대로 — 인자 셋 한 판',
         (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'member_join') = 1
         and to_regprocedure('public.member_join(text,boolean,boolean)') is not null)
  ) as t(번호, 점검, 결과)
  union all
  select 9, case when public.member_gigs_ready() and to_regprocedure('public.gig_my_stamps()') is not null
                 then '다녀온 공연 도장: 011 연결됨'
                 else '다녀온 공연 도장: 011 이 아직 없어 그 칸만 비어 있음(011 을 실행하면 바로 채워집니다)' end, 'ℹ️'
  union all
  select 10, '내 노래를 고른 회원 ' || (select count(*) from public.member_songs) || '명 · 회원 '
             || (select count(*) from public.members) || '명', 'ℹ️'
) x
order by 번호;
