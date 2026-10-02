-- ═════════════════════════════════════════════════
--  011 · 공연 모드 — 체크인 도장 · 응원 한마디 · 앵콜 투표 · 오늘 공연 방명록   (2026-10-02)
-- ------------------------------------------------------------------
--  형님 요청(2026-10-02) — "콘서트 때 QR 코드로 들어와 회원가입도 하고 글도 쓰고 재미난 요소로.
--  핸드폰에서 정말 완벽하게." 고른 재미 요소 넷:
--    ① 공연 체크인 도장 — 한 번 누르면 '○○ 공연 다녀옴'이 내 정보에 남고, '오늘 N명'이 실제 숫자로
--    ② 응원 한마디     — 정해진 문구를 누르면 즉시 쌓이고 문구별 숫자가 보인다(자유 입력 없음)
--    ③ 앵콜·신청곡 투표 — 운영자가 고른 후보 중 한 곡, 언제든 바꾸거나 취소
--    ④ 오늘 공연 방명록 — '공연·방송 후기' 게시판 글에 그날 공연이 붙는다
--  공개 규칙(형님 답 없음 → 기본값): 방명록 글은 010 규칙 그대로(새싹은 운영자 확인 뒤, 정회원은 즉시).
--  체크인·응원·투표는 '위험할 수 없는' 것(글자가 없다)이라 누르는 즉시 반영한다.
--
--  QR 주소는 하나: https://insooni.com/live?e=<공연코드 5자>. 코드는 헷갈리는 글자(0·O·1·I·L)를 뺀 31자.
--
--  지킨 것
--    · 010 은 고치지 않는다. 010 의 함수는 다시 정의하지 않는다 — 바꾸는 기존 함수는 rate_ok 하나뿐(시그니처 그대로).
--    · 새 표는 전부 잠근다(RLS + revoke). 읽기도 쓰기도 함수로만. 정책은 만들지 않는다.
--    · 공개되는 숫자는 count(*) 그대로다. 0 이면 0 이라고 말한다 — 지어내지도, 빼지도 않는다.
--    · 누가 왔는지·누가 무엇을 눌렀는지는 어느 함수로도 나가지 않는다. 나가는 것은 합계와 '내 것'뿐.
--    · 탈퇴하면 도장·응원·투표가 함께 지워진다(members 에 on delete cascade — 010 의 두 탈퇴 경로 모두).
--    · song_requests 에 사람 칸을 붙이지 않는다 — 001 이 그 표를 공개 읽기로 열어 두었다.
--    · 이름은 gig_ 로 시작한다. 이미 있는 check_live_*·live-*.json(라이브 사이트·수집 공연)과 헷갈리지 않게.
--
--  고치는 결함 하나(2026-10-02 실측)
--    · 001 이 rate_ok·req_ip_hash 를 anon·authenticated 에게서만 거뒀고 PUBLIC 에는 남아 있어,
--      운영에서 공개 키로 req_ip_hash 를 부르면 200 이 나왔다. 여기서 PUBLIC 까지 거둔다.
--    · rate_ok 의 기준을 '로그인했으면 회원, 아니면 IP'로 바꾼다. 공연장 와이파이·통신사 공유 IP 에서는
--      수백 명이 한 IP 로 보여, 가입(시간당 10)·글쓰기(20)가 10~20명째부터 막혔다.
--
--  안전합니다.
--    · 전체가 한 묶음(begin … commit). 하나라도 실패하면 아무것도 안 바뀝니다.
--    · 맨 끝 안전장치가 공개 키·로그인 권한으로 직접 불러 봐서, 표가 열려 있거나
--      막혀야 할 함수가 불리면 스스로 전체를 취소합니다.
--    · 여러 번 실행해도 결과가 같습니다(만든 공연·도장·숫자·바꾼 설정값은 그대로 둡니다).
--
--  실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
--  성공하면 결과 창에 ✅ 표가 뜹니다.
-- ═════════════════════════════════════════════════

begin;

-- ── 1. 공연 ────────────────────────────────────────────────────
--  시간 네 개로 단계를 정한다: opens_at 전 = before · closes_at 까지 = open(도장·응원·투표)
--  · guest_until 까지 = after(방명록만) · 그 뒤 = closed.
--  override 는 운영자가 현장에서 시간을 무시하고 열거나 닫는 손잡이다(공연이 늦게 끝나는 날을 위해).
create table if not exists public.gig_events (
  id           bigint generated always as identity primary key,
  code         text not null unique,
  title_ko     text not null,
  title_en     text,
  venue_ko     text,
  venue_en     text,
  starts_at    timestamptz not null,
  opens_at     timestamptz not null,
  closes_at    timestamptz not null,
  guest_until  timestamptz not null,
  status       text not null default 'draft',
  override     text,
  vote_open    boolean not null default true,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint ge_code_ok     check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$'),
  constraint ge_title_len   check (char_length(title_ko) between 2 and 60
                                   and (title_en is null or char_length(title_en) <= 80)),
  constraint ge_venue_len   check ((venue_ko is null or char_length(venue_ko) <= 60)
                                   and (venue_en is null or char_length(venue_en) <= 80)),
  constraint ge_status_ok   check (status in ('draft', 'published', 'archived')),
  constraint ge_override_ok check (override is null or override in ('open', 'closed')),
  constraint ge_time_ok     check (opens_at < closes_at and closes_at <= guest_until)
);
alter table public.gig_events enable row level security;
revoke all on public.gig_events from anon, authenticated;


-- ── 2. 응원 문구 (모든 공연 공통) ───────────────────────────────
--  자유 입력이 아니라 고르기만 한다 — 검수 없이 즉시 보여도 위험할 수 없는 이유가 이것이다.
--  문구는 형님 확정 전 기본값. 바꾸려면 Table Editor 에서 ko·en 만 고치고, 내리려면 active 를 끈다
--  (지우지 않는다 — 이미 눌린 응원이 이 번호를 가리킨다).
create table if not exists public.gig_phrases (
  k       smallint primary key,
  ko      text not null,
  en      text not null,
  sort    smallint not null,
  active  boolean not null default true,
  constraint gp_k_ok   check (k between 1 and 8),
  constraint gp_ko_len check (char_length(ko) between 1 and 30),
  constraint gp_en_len check (char_length(en) between 1 and 40)
);
insert into public.gig_phrases (k, ko, en, sort) values
  (1, '사랑해요',             'We love you',               1),
  (2, '앵콜!',                'Encore!',                   2),
  (3, '오늘 정말 멋졌어요',    'You were amazing tonight',  3),
  (4, '건강하세요',           'Stay well',                 4),
  (5, '오래오래 노래해 주세요', 'Keep singing for us',       5),
  (6, '또 올게요',            'I''ll be back',             6)
on conflict (k) do nothing;
alter table public.gig_phrases enable row level security;
revoke all on public.gig_phrases from anon, authenticated;


-- ── 3. 투표 후보곡 (공연마다 최대 8곡) ──────────────────────────
--  곡 이름은 songs.json 의 정본 제목 — 운영 화면이 목록에서만 고르게 한다(오타 곡이 생기지 않게).
create table if not exists public.gig_vote_songs (
  event_id  bigint not null references public.gig_events (id) on delete cascade,
  song      text not null,
  sort      smallint not null,
  constraint gvs_pk       primary key (event_id, song),
  constraint gvs_song_len check (char_length(song) between 1 and 80)
);
alter table public.gig_vote_songs enable row level security;
revoke all on public.gig_vote_songs from anon, authenticated;


-- ── 4. 도장 · 응원 · 투표 ───────────────────────────────────────
--  셋 다 '한 사람 한 번'을 기본키가 지킨다 — 함수가 실수해도 숫자가 부풀 수 없다.
--  일련번호 칸을 두지 않는다: 'N번째로 왔다'는 정보가 남으면 도착 순서가 드러난다.
--  회원(members)에 on delete cascade — 탈퇴하면 함께 사라진다(개인정보: '어느 공연에 왔다'는 기록이다).
create table if not exists public.gig_checkins (
  event_id  bigint not null references public.gig_events (id) on delete cascade,
  user_id   uuid not null,
  at        timestamptz not null default now(),
  constraint gig_checkins_pk primary key (event_id, user_id),
  constraint gig_checkins_member_fk foreign key (user_id) references public.members (user_id) on delete cascade
);
create index if not exists gig_checkins_user on public.gig_checkins (user_id);
alter table public.gig_checkins enable row level security;
revoke all on public.gig_checkins from anon, authenticated;

create table if not exists public.gig_cheers (
  event_id  bigint not null references public.gig_events (id) on delete cascade,
  user_id   uuid not null,
  k         smallint not null references public.gig_phrases (k),
  at        timestamptz not null default now(),
  constraint gig_cheers_pk primary key (event_id, user_id, k),
  constraint gig_cheers_member_fk foreign key (user_id) references public.members (user_id) on delete cascade
);
create index if not exists gig_cheers_event_k on public.gig_cheers (event_id, k);
create index if not exists gig_cheers_user    on public.gig_cheers (user_id);
alter table public.gig_cheers enable row level security;
revoke all on public.gig_cheers from anon, authenticated;

--  후보에서 빠진 곡의 표는 함께 지워진다(복합 FK cascade) — 없는 곡에 표가 남아 숫자가 맞지 않는 일이 없게.
create table if not exists public.gig_votes (
  event_id  bigint not null,
  user_id   uuid not null,
  song      text not null,
  at        timestamptz not null default now(),
  constraint gig_votes_pk primary key (event_id, user_id),
  constraint gig_votes_song_fk foreign key (event_id, song)
    references public.gig_vote_songs (event_id, song) on delete cascade,
  constraint gig_votes_member_fk foreign key (user_id) references public.members (user_id) on delete cascade
);
create index if not exists gig_votes_event_song on public.gig_votes (event_id, song);
create index if not exists gig_votes_user       on public.gig_votes (user_id);
alter table public.gig_votes enable row level security;
revoke all on public.gig_votes from anon, authenticated;


-- ── 5. 게시판 글에 공연 칸 · 설정값 ─────────────────────────────
--  방명록 글은 '공연·방송 후기' 게시판의 보통 글이다(검수·탈퇴·지우기가 010 그대로 통한다).
--  공연을 지워도 글은 남는다(set null) — 팬이 쓴 글을 운영 정리 때문에 잃지 않게.
--  FK 를 칸 정의 안에 넣지 않고 따로 거는 이유: 두 번째 실행 때 판(PG 버전)에 따라 FK 가 겹으로 생길 수 있어서
--  010 의 bp_board_ok 와 같은 '지우고 다시 건다' 방식으로 한 개를 보장한다.
alter table public.board_posts add column if not exists gig_id bigint;
alter table public.board_posts drop constraint if exists bp_gig_fk;
alter table public.board_posts add constraint bp_gig_fk
  foreign key (gig_id) references public.gig_events (id) on delete set null;
create index if not exists board_posts_gig on public.board_posts (gig_id, status, id desc);

insert into public.board_settings (key, value, note) values
  ('gig_poll_s', 15, '공연 화면이 숫자를 새로 세는 간격(초). 부하가 크면 30')
on conflict (key) do nothing;


-- ── 6. 속도 제한 — 회원이면 회원 기준, 아니면 IP 기준 (001 정의를 바꾼다) ──
--  rate_counter 의 ip_hash 칸에 회원 열쇠도 함께 담는다(칸 이름만 옛것). 원본 아이디는 남기지 않고
--  날짜를 섞은 해시만 — 하루가 지나면 같은 사람도 다른 값이 된다(001 의 IP 해시와 같은 이유).
create or replace function public.rate_ok(p_bucket text, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  slot timestamptz := date_trunc('hour', now());
  h    text := case when auth.uid() is not null
                    then encode(sha256(convert_to('u|' || auth.uid()::text || '|' || to_char(now(), 'YYYY-MM-DD'), 'UTF8')), 'hex')
                    else public.req_ip_hash() end;
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
$fn$;


-- ── 7. 안쪽 도우미 (밖에서 못 부른다) ──────────────────────────
--  지금 단계. 운영자가 '닫기'를 누르면 방명록 시간(after)으로 넘어가고, 방명록 시간도 지났으면 closed.
create or replace function public.gig_phase(e public.gig_events)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
begin
  if e.override = 'closed' then
    return case when now() <= e.guest_until then 'after' else 'closed' end;
  end if;
  if e.override = 'open' then
    return 'open';
  end if;
  if now() < e.opens_at then
    return 'before';
  elsif now() <= e.closes_at then
    return 'open';
  elsif now() <= e.guest_until then
    return 'after';
  end if;
  return 'closed';
end;
$fn$;

--  코드로 공연 찾기. QR 을 손으로 옮겨 치는 사람을 위해 대소문자·앞뒤 빈칸을 봐준다.
--  코드가 비었으면 '지금 열려 있는 공개 공연' 중 시작 시각이 가장 가까운 하나(QR 없이 /live 로 온 사람).
--  운영자는 공개 전(draft) 공연도 찾는다 — 미리보기. 보관(archived) 공연은 누구도 찾지 못한다.
--  못 찾으면 모든 칸이 빈 행을 돌려준다(부르는 쪽이 e.id is null 로 본다).
create or replace function public.gig_find(p_code text)
returns public.gig_events
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_admin boolean := public.is_admin();
  e       public.gig_events;
begin
  if v_code = '' then
    select g.* into e
      from public.gig_events g
     where g.status = 'published' and public.gig_phase(g) = 'open'
     order by abs(extract(epoch from (g.starts_at - now()))), g.id desc
     limit 1;
  else
    select g.* into e
      from public.gig_events g
     where g.code = v_code
       and (g.status = 'published' or (v_admin and g.status = 'draft'))
     limit 1;
  end if;
  return e;
end;
$fn$;

--  공연 숫자 — 공개 화면 두 곳(gig_event·gig_pulse)이 같은 셈을 쓰게 한 곳에 둔다.
--  문구·후보곡은 0 표까지 전부 싣는다(left join): '아직 0'도 정직한 숫자다.
create or replace function public.gig_tally(p_id bigint)
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select json_build_object(
    'checkins', (select count(*) from public.gig_checkins c where c.event_id = p_id),
    'cheers', (
      select coalesce(json_agg(json_build_object('k', p.k, 'n', coalesce(c.n, 0)) order by p.sort, p.k), '[]'::json)
        from public.gig_phrases p
        left join (select ch.k, count(*) as n from public.gig_cheers ch where ch.event_id = p_id group by ch.k) c
          on c.k = p.k
       where p.active),
    'votes', (
      select coalesce(json_agg(json_build_object('song', s.song, 'n', coalesce(v.n, 0)) order by s.sort, s.song), '[]'::json)
        from public.gig_vote_songs s
        left join (select gv.song, count(*) as n from public.gig_votes gv where gv.event_id = p_id group by gv.song) v
          on v.song = s.song
       where s.event_id = p_id),
    'at', now());
$fn$;


-- ── 8. 공연 읽기 (누구나) ──────────────────────────────────────
--  QR 로 들어온 첫 화면이 한 번에 그릴 수 있게 다 싣는다(느린 LTE 에서 왕복을 줄이려고).
--  me 는 로그인한 사람 자신의 것만 — 남의 도장·응원·표는 합계로만 보인다.
create or replace function public.gig_event(p_code text)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid    uuid := auth.uid();
  v_admin  boolean := public.is_admin();
  e        public.gig_events;
  v_lv     text;
  v_cat    timestamptz;
  v_me     json := null;
begin
  e := public.gig_find(p_code);
  if e.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_uid is not null then
    select level into v_lv from public.members where user_id = v_uid;
    if not found then
      -- 로그인은 했지만 가입(별명·동의) 전 — 화면이 가입 시트를 띄울 수 있게 알려 준다
      v_me := json_build_object('joined', false, 'level', null, 'staff', v_admin,
                                'checked', false, 'checked_at', null, 'cheers', '[]'::json,
                                'vote', null, 'posted', 0);
    else
      select c.at into v_cat from public.gig_checkins c where c.event_id = e.id and c.user_id = v_uid;
      v_me := json_build_object(
        'joined', true, 'level', v_lv, 'staff', v_admin,
        'checked', v_cat is not null, 'checked_at', v_cat,
        'cheers', (select coalesce(json_agg(ch.k order by ch.k), '[]'::json)
                     from public.gig_cheers ch where ch.event_id = e.id and ch.user_id = v_uid),
        'vote',   (select gv.song from public.gig_votes gv where gv.event_id = e.id and gv.user_id = v_uid),
        'posted', (select count(*) from public.board_posts bp where bp.gig_id = e.id and bp.user_id = v_uid));
    end if;
  end if;
  return json_build_object(
    'ok', true,
    'now', now(),
    'poll_s', greatest(public.bs('gig_poll_s', 15), 5),
    'event', json_build_object(
      'code', e.code, 'title_ko', e.title_ko, 'title_en', e.title_en,
      'venue_ko', e.venue_ko, 'venue_en', e.venue_en,
      'starts_at', e.starts_at, 'opens_at', e.opens_at, 'closes_at', e.closes_at, 'guest_until', e.guest_until,
      'phase', public.gig_phase(e), 'vote_open', e.vote_open,
      'preview', e.status = 'draft'),
    'phrases', (select coalesce(json_agg(json_build_object('k', p.k, 'ko', p.ko, 'en', p.en) order by p.sort, p.k), '[]'::json)
                  from public.gig_phrases p where p.active),
    'songs',   (select coalesce(json_agg(json_build_object('song', s.song, 'sort', s.sort) order by s.sort, s.song), '[]'::json)
                  from public.gig_vote_songs s where s.event_id = e.id),
    'counts',  public.gig_tally(e.id),
    'me',      v_me);
end;
$fn$;

--  공연 중 몇 초마다 부르는 가벼운 숫자. 방명록은 공개된 것의 수와 최근 다섯 줄(앞 300자)만.
create or replace function public.gig_pulse(p_code text)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  e        public.gig_events;
  t        json;
  v_latest json;
begin
  e := public.gig_find(p_code);
  if e.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  t := public.gig_tally(e.id);
  select coalesce(json_agg(x order by x.id desc), '[]'::json) into v_latest
  from (
    select p.id, left(p.body, 300) as body, m.nickname, m.level,
           exists (select 1 from public.admins a where a.user_id = p.user_id) as staff,
           p.created_at
      from public.board_posts p
      join public.members m on m.user_id = p.user_id
     where p.gig_id = e.id and p.status = 'approved'
     order by p.id desc
     limit 5
  ) x;
  return json_build_object(
    'ok', true, 'now', now(), 'phase', public.gig_phase(e), 'vote_open', e.vote_open,
    'checkins', t -> 'checkins', 'cheers', t -> 'cheers', 'votes', t -> 'votes',
    'guest', json_build_object(
      'approved', (select count(*) from public.board_posts p where p.gig_id = e.id and p.status = 'approved'),
      'latest', v_latest),
    'at', now());
end;
$fn$;

--  사이트 어디서든 '지금 공연 중' 띠를 띄울지 — 열려 있거나 방명록 시간인 공개 공연 하나.
create or replace function public.gig_now()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  e public.gig_events;
begin
  select g.* into e
    from public.gig_events g
   where g.status = 'published' and public.gig_phase(g) in ('open', 'after')
   order by abs(extract(epoch from (g.starts_at - now()))), g.id desc
   limit 1;
  if e.id is null then
    return json_build_object('ok', true, 'event', null);
  end if;
  return json_build_object('ok', true, 'event', json_build_object(
    'code', e.code, 'title_ko', e.title_ko, 'title_en', e.title_en,
    'venue_ko', e.venue_ko, 'venue_en', e.venue_en, 'starts_at', e.starts_at,
    'phase', public.gig_phase(e),
    'checkins', (select count(*) from public.gig_checkins c where c.event_id = e.id)));
end;
$fn$;

--  그 공연의 방명록. 남의 글은 공개된 것만, 내 글은 확인 중이어도 보인다(기다리는 중임을 알 수 있게).
create or replace function public.gig_guestbook(p_code text, p_before bigint default null, p_limit int default 20)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_lim  int := least(greatest(coalesce(p_limit, 20), 1), 30);
  e      public.gig_events;
  v_rows json;
  v_min  bigint;
begin
  e := public.gig_find(p_code);
  if e.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  select coalesce(json_agg(x order by x.id desc), '[]'::json), min(x.id) into v_rows, v_min
  from (
    select p.id, p.body, m.nickname, m.level,
           exists (select 1 from public.admins a where a.user_id = p.user_id) as staff,
           p.created_at, coalesce(p.user_id = v_uid, false) as mine, p.status
      from public.board_posts p
      join public.members m on m.user_id = p.user_id
     where p.gig_id = e.id
       and (p.status = 'approved' or (p.status = 'pending' and p.user_id = v_uid))
       and (p_before is null or p.id < p_before)
     order by p.id desc
     limit v_lim
  ) x;
  return json_build_object(
    'ok', true, 'rows', v_rows,
    'more', v_min is not null and exists (
      select 1 from public.board_posts p
       where p.gig_id = e.id and p.id < v_min
         and (p.status = 'approved' or (p.status = 'pending' and p.user_id = v_uid))));
end;
$fn$;

--  카페 목록의 글 옆에 '○○ 공연에서' 꼬리표를 붙이려고. 공개된 글만, 공개 전(draft) 공연은 빼고.
create or replace function public.post_gigs(p_ids bigint[])
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_map json;
begin
  if coalesce(cardinality(p_ids), 0) > 50 then
    return json_build_object('ok', false, 'reason', 'too_many');
  end if;
  select coalesce(json_object_agg(p.id::text, json_build_object(
           'code', g.code, 'title_ko', g.title_ko, 'title_en', g.title_en,
           'venue_ko', g.venue_ko, 'venue_en', g.venue_en, 'starts_at', g.starts_at)), '{}'::json)
    into v_map
    from public.board_posts p
    join public.gig_events g on g.id = p.gig_id
   where p.id = any (coalesce(p_ids, '{}'::bigint[]))
     and p.status = 'approved'
     and g.status <> 'draft';
  return json_build_object('ok', true, 'map', v_map);
end;
$fn$;


-- ── 9. 공연장에서 누르기 (로그인한 회원) ────────────────────────
--  문지기 순서는 모두 같다: 로그인 → 명부 → 차단 → 공연 → 단계 → 속도.
--  화면이 이 순서대로 안내한다(로그인해 주세요 → 별명 정하기 → … → 지금은 닫혀 있어요).

--  ① 체크인 도장 — 두 번 눌러도 한 번(기본키). 이미 찍었으면 already 와 처음 찍은 시각을 돌려준다.
create or replace function public.gig_checkin(p_code text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_lv      text;
  e         public.gig_events;
  v_at      timestamptz;
  v_already boolean := false;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select level into v_lv from public.members where user_id = v_uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if v_lv = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  e := public.gig_find(p_code);
  if e.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if public.gig_phase(e) <> 'open' then
    return json_build_object('ok', false, 'reason', 'not_open');
  end if;
  if not public.rate_ok('gcheck', 30) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.gig_checkins (event_id, user_id) values (e.id, v_uid)
  on conflict do nothing
  returning at into v_at;
  if v_at is null then
    v_already := true;
    select c.at into v_at from public.gig_checkins c where c.event_id = e.id and c.user_id = v_uid;
  end if;
  return json_build_object('ok', true, 'already', v_already, 'at', v_at,
    'checkins', (select count(*) from public.gig_checkins c where c.event_id = e.id));
end;
$fn$;

--  ② 응원 한마디 — 문구마다 켜고 끈다(한 사람이 한 문구를 여러 번 세지 못한다).
create or replace function public.gig_cheer(p_code text, p_k smallint, p_on boolean)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_lv  text;
  v_on  boolean := coalesce(p_on, true);
  e     public.gig_events;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select level into v_lv from public.members where user_id = v_uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if v_lv = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  e := public.gig_find(p_code);
  if e.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if public.gig_phase(e) <> 'open' then
    return json_build_object('ok', false, 'reason', 'not_open');
  end if;
  if p_k is null or not exists (select 1 from public.gig_phrases p where p.k = p_k and p.active) then
    return json_build_object('ok', false, 'reason', 'bad_phrase');
  end if;
  if not public.rate_ok('gcheer', 120) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  if v_on then
    insert into public.gig_cheers (event_id, user_id, k) values (e.id, v_uid, p_k)
    on conflict do nothing;
  else
    delete from public.gig_cheers ch where ch.event_id = e.id and ch.user_id = v_uid and ch.k = p_k;
  end if;
  return json_build_object('ok', true, 'k', p_k, 'on', v_on,
    'n', (select count(*) from public.gig_cheers ch where ch.event_id = e.id and ch.k = p_k),
    'at', now());
end;
$fn$;

--  ③ 앵콜·신청곡 투표 — 한 사람 한 곡. 다른 곡을 누르면 옮기고, null 이면 취소.
--  옮긴 경우 화면이 두 숫자를 함께 고칠 수 있게 옛 곡의 숫자(prev_n)도 돌려준다.
create or replace function public.gig_vote(p_code text, p_song text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_lv   text;
  e      public.gig_events;
  v_song text := btrim(p_song);
  v_prev text;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select level into v_lv from public.members where user_id = v_uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if v_lv = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  e := public.gig_find(p_code);
  if e.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if public.gig_phase(e) <> 'open' then
    return json_build_object('ok', false, 'reason', 'not_open');
  end if;
  if not e.vote_open then
    return json_build_object('ok', false, 'reason', 'vote_closed');
  end if;
  if v_song is not null
     and not exists (select 1 from public.gig_vote_songs s where s.event_id = e.id and s.song = v_song) then
    return json_build_object('ok', false, 'reason', 'bad_song');
  end if;
  if not public.rate_ok('gvote', 60) then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  select gv.song into v_prev from public.gig_votes gv where gv.event_id = e.id and gv.user_id = v_uid for update;
  if v_song is null then
    delete from public.gig_votes gv where gv.event_id = e.id and gv.user_id = v_uid;
  else
    insert into public.gig_votes (event_id, user_id, song) values (e.id, v_uid, v_song)
    on conflict (event_id, user_id) do update set song = excluded.song, at = now();
  end if;
  return json_build_object('ok', true, 'song', v_song,
    'n',      case when v_song is null then null
                   else (select count(*) from public.gig_votes gv where gv.event_id = e.id and gv.song = v_song) end,
    'prev',   v_prev,
    'prev_n', case when v_prev is null then null
                   else (select count(*) from public.gig_votes gv where gv.event_id = e.id and gv.song = v_prev) end,
    'at', now());
end;
$fn$;

--  ④ 오늘 공연 방명록 — 010 의 board_write 를 그대로 부른다. 그래서 등급별 공개(새싹은 확인 뒤)·
--  시간당 5편·속도 제한·탈퇴 시 삭제가 게시판 글과 똑같이 적용된다. 공연 하나에 한 사람 세 편까지.
--  제목 칸은 화면에 없다 — 본문 앞 40자를 한 줄로 펴서 제목으로 쓴다(어르신이 칸 두 개를 채우지 않게).
create or replace function public.gig_guestbook_write(p_code text, p_body text)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_lv    text;
  e       public.gig_events;
  -- btrim 은 띄어쓰기만 지운다 — 줄바꿈만 있는 글이 '두 글자'로 통과하지 않게 모든 공백을 지운다
  v_body  text := regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
  v_flat  text;
  v_title text;
  v       json;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select level into v_lv from public.members where user_id = v_uid for update;  -- 같은 사람의 동시 쓰기를 줄 세운다(세 편 제한)
  if not found then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if v_lv = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  e := public.gig_find(p_code);
  if e.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if public.gig_phase(e) not in ('open', 'after') then
    return json_build_object('ok', false, 'reason', 'not_open');
  end if;
  if char_length(v_body) < 2 then return json_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(v_body) > 500 then return json_build_object('ok', false, 'reason', 'too_long'); end if;
  if (select count(*) from public.board_posts bp where bp.gig_id = e.id and bp.user_id = v_uid) >= 3 then
    return json_build_object('ok', false, 'reason', 'gig_limit');
  end if;
  v_flat := regexp_replace(v_body, '\s+', ' ', 'g');
  v_title := case when char_length(v_flat) > 40 then rtrim(left(v_flat, 40)) || '…' else v_flat end;
  v := public.board_write('review', v_title, v_body);
  if coalesce((v ->> 'ok')::boolean, false) then
    update public.board_posts set gig_id = e.id where id = (v ->> 'id')::bigint;
  end if;
  return v;
end;
$fn$;

--  내 도장 모음 — 내 정보 화면에 '다녀온 공연'으로. 보관된 공연의 도장도 남는다(내 기록이니까).
create or replace function public.gig_my_stamps()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_lv   text;
  v_rows json;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'reason', 'not_logged_in');
  end if;
  select level into v_lv from public.members where user_id = v_uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if v_lv = 'blocked' then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;
  select coalesce(json_agg(x order by x.starts_at desc, x.at desc), '[]'::json) into v_rows
  from (
    select g.code, g.title_ko, g.title_en, g.venue_ko, g.venue_en, g.starts_at, c.at
      from public.gig_checkins c
      join public.gig_events g on g.id = c.event_id
     where c.user_id = v_uid
  ) x;
  return json_build_object('ok', true, 'rows', v_rows);
end;
$fn$;


-- ── 10. 운영 — 공연 만들기·고치기·현장 손잡이 (운영자만) ─────────
create or replace function public.admin_gig_list()
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rows json;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select coalesce(json_agg(x order by x.starts_at desc, x.id desc), '[]'::json) into v_rows
  from (
    select g.id, g.code, g.title_ko, g.title_en, g.venue_ko, g.venue_en,
           g.starts_at, g.opens_at, g.closes_at, g.guest_until,
           g.status, g.override, g.vote_open, public.gig_phase(g) as phase,
           (select coalesce(json_agg(s.song order by s.sort, s.song), '[]'::json)
              from public.gig_vote_songs s where s.event_id = g.id) as songs,
           (select count(*) from public.gig_checkins c where c.event_id = g.id) as checkins,
           (select count(*) from public.gig_cheers ch where ch.event_id = g.id) as cheers,
           (select count(*) from public.gig_votes gv where gv.event_id = g.id) as votes,
           (select count(*) from public.board_posts p where p.gig_id = g.id and p.status = 'pending')  as gb_pending,
           (select count(*) from public.board_posts p where p.gig_id = g.id and p.status = 'approved') as gb_approved
      from public.gig_events g
     order by g.starts_at desc, g.id desc
     limit 200
  ) x;
  return json_build_object('ok', true, 'rows', v_rows);
end;
$fn$;

--  만들기(id 없음)·고치기(id 있음). 키: id · title_ko · title_en · venue_ko · venue_en · starts_at · opens_at ·
--  closes_at · guest_until · status · songs(문자열 배열, 최대 8 — 빼면 후보를 건드리지 않는다) · regen_code.
--  코드 다시 만들기는 공개 전(draft)일 때만 — QR 을 인쇄한 뒤 코드가 바뀌면 객석의 QR 이 전부 죽는다.
--  후보곡을 고치면 남는 곡의 표는 그대로, 빠진 곡의 표만 함께 지워진다(운영 화면이 저장 전에 묻는다).
create or replace function public.admin_gig_save(p jsonb)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c_alpha    constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   -- 0·O·1·I·L 을 뺀 31자
  v_new      boolean := true;
  v_id       bigint;
  v_old      public.gig_events;
  v_title_ko text := btrim(coalesce(p ->> 'title_ko', ''));
  v_title_en text := nullif(btrim(coalesce(p ->> 'title_en', '')), '');
  v_venue_ko text := nullif(btrim(coalesce(p ->> 'venue_ko', '')), '');
  v_venue_en text := nullif(btrim(coalesce(p ->> 'venue_en', '')), '');
  v_starts   timestamptz;
  v_opens    timestamptz;
  v_closes   timestamptz;
  v_guest    timestamptz;
  v_status   text;
  v_has_song boolean := false;
  v_songs    text[] := '{}';
  v_regen    boolean := coalesce(p -> 'regen_code' = 'true'::jsonb, false);
  v_code     text;
  v_try      int;
  i          int;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if nullif(p ->> 'id', '') is not null then
    begin
      v_id := (p ->> 'id')::bigint;
    exception when others then
      return json_build_object('ok', false, 'reason', 'not_found');
    end;
    select * into v_old from public.gig_events where id = v_id for update;
    if not found then
      return json_build_object('ok', false, 'reason', 'not_found');
    end if;
    v_new := false;
  end if;

  if char_length(v_title_ko) < 2 or char_length(v_title_ko) > 60 or coalesce(char_length(v_title_en), 0) > 80 then
    return json_build_object('ok', false, 'reason', 'bad_title');
  end if;
  if coalesce(char_length(v_venue_ko), 0) > 60 or coalesce(char_length(v_venue_en), 0) > 80 then
    return json_build_object('ok', false, 'reason', 'bad_venue');
  end if;
  begin
    v_starts := (p ->> 'starts_at')::timestamptz;
    v_opens  := (p ->> 'opens_at')::timestamptz;
    v_closes := (p ->> 'closes_at')::timestamptz;
    v_guest  := (p ->> 'guest_until')::timestamptz;
  exception when others then
    return json_build_object('ok', false, 'reason', 'bad_time');
  end;
  if v_starts is null or v_opens is null or v_closes is null or v_guest is null
     or not (v_opens < v_closes and v_closes <= v_guest) then
    return json_build_object('ok', false, 'reason', 'bad_time');
  end if;
  v_status := coalesce(nullif(p ->> 'status', ''), case when v_new then 'draft' else v_old.status end);
  if v_status not in ('draft', 'published', 'archived') then
    return json_build_object('ok', false, 'reason', 'bad_status');
  end if;

  if p ? 'songs' and jsonb_typeof(p -> 'songs') <> 'null' then
    v_has_song := true;
    if jsonb_typeof(p -> 'songs') <> 'array' then
      return json_build_object('ok', false, 'reason', 'bad_song');
    end if;
    if jsonb_array_length(p -> 'songs') > 8 then
      return json_build_object('ok', false, 'reason', 'too_many_songs');
    end if;
    if exists (select 1 from jsonb_array_elements(p -> 'songs') x
                where jsonb_typeof(x) <> 'string' or char_length(btrim(x #>> '{}')) not between 1 and 80) then
      return json_build_object('ok', false, 'reason', 'bad_song');
    end if;
    select coalesce(array_agg(btrim(x) order by o), '{}') into v_songs
      from jsonb_array_elements_text(p -> 'songs') with ordinality t(x, o);
    if (select count(distinct s) from unnest(v_songs) s) <> cardinality(v_songs) then
      return json_build_object('ok', false, 'reason', 'bad_song');
    end if;
  end if;

  if not v_new and v_regen and v_old.status <> 'draft' then
    return json_build_object('ok', false, 'reason', 'code_locked');
  end if;

  if v_new then
    for v_try in 1..5 loop
      v_code := '';
      for i in 1..5 loop
        v_code := v_code || substr(c_alpha, 1 + floor(random() * 31)::int, 1);
      end loop;
      continue when v_code = 'ZZZZZ';   -- 맨 끝 안전장치가 '없는 공연'으로 쓰는 코드
      begin
        insert into public.gig_events (code, title_ko, title_en, venue_ko, venue_en,
                                       starts_at, opens_at, closes_at, guest_until, status, created_by)
        values (v_code, v_title_ko, v_title_en, v_venue_ko, v_venue_en,
                v_starts, v_opens, v_closes, v_guest, v_status, auth.uid())
        returning id into v_id;
        exit;
      exception when unique_violation then
        v_id := null;
      end;
    end loop;
    if v_id is null then
      return json_build_object('ok', false, 'reason', 'code_busy');
    end if;
  else
    update public.gig_events
       set title_ko = v_title_ko, title_en = v_title_en, venue_ko = v_venue_ko, venue_en = v_venue_en,
           starts_at = v_starts, opens_at = v_opens, closes_at = v_closes, guest_until = v_guest,
           status = v_status
     where id = v_id;
    if v_regen then
      v_code := null;
      for v_try in 1..5 loop
        v_code := '';
        for i in 1..5 loop
          v_code := v_code || substr(c_alpha, 1 + floor(random() * 31)::int, 1);
        end loop;
        if v_code = 'ZZZZZ' or v_code = v_old.code then
          v_code := null;
          continue;
        end if;
        begin
          update public.gig_events set code = v_code where id = v_id;
          exit;
        exception when unique_violation then
          v_code := null;
        end;
      end loop;
      if v_code is null then
        return json_build_object('ok', false, 'reason', 'code_busy');
      end if;
    end if;
  end if;

  if v_has_song then
    delete from public.gig_vote_songs s where s.event_id = v_id and not (s.song = any (v_songs));
    insert into public.gig_vote_songs (event_id, song, sort)
    select v_id, u.s, u.o::smallint from unnest(v_songs) with ordinality u(s, o)
    on conflict (event_id, song) do update set sort = excluded.sort;
  end if;

  select code into v_code from public.gig_events where id = v_id;
  return json_build_object('ok', true, 'id', v_id, 'code', v_code);
end;
$fn$;

--  현장 손잡이 — 시간을 무시하고 열기(open)·닫기(closed)·시간대로(null), 투표 열고 닫기.
--  p_vote_open 이 null 이면 투표 상태는 그대로 둔다.
create or replace function public.admin_gig_set(p_id bigint, p_override text, p_vote_open boolean)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_ov text := nullif(btrim(coalesce(p_override, '')), '');
  e    public.gig_events;
begin
  if not public.is_admin() then
    return json_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if v_ov is not null and v_ov not in ('open', 'closed') then
    return json_build_object('ok', false, 'reason', 'bad_override');
  end if;
  update public.gig_events
     set override = v_ov, vote_open = coalesce(p_vote_open, vote_open)
   where id = p_id
  returning * into e;
  if e.id is null then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  return json_build_object('ok', true, 'phase', public.gig_phase(e), 'vote_open', e.vote_open);
end;
$fn$;


-- ── 11. 누가 무엇을 부를 수 있나 ───────────────────────────────
--  Supabase 는 public 스키마의 새 함수를 anon·authenticated 에게 '직접' 열고, Postgres 는 PUBLIC 에게도 연다.
--  그래서 셋 다에서 닫고, 필요한 역할에만 다시 연다(001 은 PUBLIC 을 빠뜨려 결함이 됐다).
revoke execute on function public.rate_ok(text, int)                     from public, anon, authenticated;
revoke execute on function public.req_ip_hash()                          from public, anon, authenticated;
revoke execute on function public.gig_phase(public.gig_events)           from public, anon, authenticated;
revoke execute on function public.gig_find(text)                         from public, anon, authenticated;
revoke execute on function public.gig_tally(bigint)                      from public, anon, authenticated;
revoke execute on function public.gig_event(text)                        from public, anon, authenticated;
revoke execute on function public.gig_pulse(text)                        from public, anon, authenticated;
revoke execute on function public.gig_now()                              from public, anon, authenticated;
revoke execute on function public.gig_guestbook(text, bigint, int)       from public, anon, authenticated;
revoke execute on function public.post_gigs(bigint[])                    from public, anon, authenticated;
revoke execute on function public.gig_checkin(text)                      from public, anon, authenticated;
revoke execute on function public.gig_cheer(text, smallint, boolean)     from public, anon, authenticated;
revoke execute on function public.gig_vote(text, text)                   from public, anon, authenticated;
revoke execute on function public.gig_guestbook_write(text, text)        from public, anon, authenticated;
revoke execute on function public.gig_my_stamps()                        from public, anon, authenticated;
revoke execute on function public.admin_gig_list()                       from public, anon, authenticated;
revoke execute on function public.admin_gig_save(jsonb)                  from public, anon, authenticated;
revoke execute on function public.admin_gig_set(bigint, text, boolean)   from public, anon, authenticated;

--  누구나: 공연 정보·숫자·방명록 읽기 (QR 을 찍고 로그인하기 전에도 화면이 살아 있게)
grant execute on function public.gig_event(text)                         to anon, authenticated;
grant execute on function public.gig_pulse(text)                         to anon, authenticated;
grant execute on function public.gig_now()                               to anon, authenticated;
grant execute on function public.gig_guestbook(text, bigint, int)        to anon, authenticated;
grant execute on function public.post_gigs(bigint[])                     to anon, authenticated;
--  로그인한 사람: 누르기·쓰기 (안에서 다시 '회원인가·차단인가·열려 있나'를 본다)
grant execute on function public.gig_checkin(text)                       to authenticated;
grant execute on function public.gig_cheer(text, smallint, boolean)      to authenticated;
grant execute on function public.gig_vote(text, text)                    to authenticated;
grant execute on function public.gig_guestbook_write(text, text)         to authenticated;
grant execute on function public.gig_my_stamps()                         to authenticated;
--  운영 함수는 로그인한 사람에게 열되, 안에서 운영자 명단을 본다(문이 두 겹)
grant execute on function public.admin_gig_list()                        to authenticated;
grant execute on function public.admin_gig_save(jsonb)                   to authenticated;
grant execute on function public.admin_gig_set(bigint, text, boolean)    to authenticated;


-- ── 12. 안전장치 — 공개 키·로그인 권한으로 실제로 불러 본다 ──────
--  하나라도 어긋나면 예외가 나고, 위의 모든 변경이 함께 취소된다.
do $chk$
declare
  v    json;
  keys text[];
  n    int;
begin
  -- (가) 공개 키
  set local role anon;

  v := public.gig_event('ZZZZZ');
  if (v ->> 'reason') is distinct from 'not_found' then
    raise exception '안전장치: 공개 키로 없는 공연을 부른 결과가 not_found 가 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.gig_pulse('ZZZZZ');
  if (v ->> 'reason') is distinct from 'not_found' then
    raise exception '안전장치: 공개 키로 없는 공연의 숫자를 부른 결과가 not_found 가 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.gig_now();
  if (v ->> 'ok') is distinct from 'true' then
    raise exception '안전장치: 공개 키로 지금 공연(gig_now)을 읽지 못합니다 — 전체를 취소합니다';
  end if;
  v := public.gig_guestbook('ZZZZZ', null, 5);
  if (v ->> 'reason') is distinct from 'not_found' then
    raise exception '안전장치: 공개 키로 없는 공연의 방명록 결과가 not_found 가 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.post_gigs(array[]::bigint[]);
  if (v ->> 'ok') is distinct from 'true' then
    raise exception '안전장치: 공개 키로 글 꼬리표(post_gigs)를 읽지 못합니다 — 전체를 취소합니다';
  end if;

  begin perform * from public.gig_events limit 1;
    raise exception '안전장치: 공개 키로 공연 원본 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.gig_phrases limit 1;
    raise exception '안전장치: 공개 키로 응원 문구 원본 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.gig_vote_songs limit 1;
    raise exception '안전장치: 공개 키로 투표 후보 원본 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.gig_checkins limit 1;
    raise exception '안전장치: 공개 키로 체크인(누가 왔는지) 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.gig_cheers limit 1;
    raise exception '안전장치: 공개 키로 응원(누가 눌렀는지) 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform * from public.gig_votes limit 1;
    raise exception '안전장치: 공개 키로 투표(누가 골랐는지) 표가 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;

  begin perform public.gig_checkin('ZZZZZ');
    raise exception '안전장치: 공개 키로 체크인 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.gig_cheer('ZZZZZ', 1::smallint, true);
    raise exception '안전장치: 공개 키로 응원 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.gig_vote('ZZZZZ', null::text);
    raise exception '안전장치: 공개 키로 투표 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.gig_guestbook_write('ZZZZZ', '본문입니다');
    raise exception '안전장치: 공개 키로 방명록 쓰기 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.gig_my_stamps();
    raise exception '안전장치: 공개 키로 내 도장 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_gig_list();
    raise exception '안전장치: 공개 키로 공연 관리 목록이 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_gig_save('{}'::jsonb);
    raise exception '안전장치: 공개 키로 공연 저장 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_gig_set(0::bigint, null::text, null::boolean);
    raise exception '안전장치: 공개 키로 공연 손잡이 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.rate_ok('x', 1);
    raise exception '안전장치: 공개 키로 속도 제한 함수가 불립니다(남의 칸을 채워 막을 수 있음) — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.req_ip_hash();
    raise exception '안전장치: 공개 키로 IP 해시 함수가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.gig_find('ZZZZZ');
    raise exception '안전장치: 공개 키로 공연 찾기 도우미가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  begin perform public.gig_tally(0::bigint);
    raise exception '안전장치: 공개 키로 숫자 도우미가 불립니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;

  v := public.board_list(null, null, 1);
  select array_agg(k order by k) into keys from json_object_keys(v) k;
  if keys is distinct from array['more','notices','ok','rows'] then
    raise exception '안전장치: 게시판 목록(010)의 칸이 바뀌었습니다 % — 전체를 취소합니다', keys;
  end if;

  reset role;

  -- (나) 로그인 역할이지만 로그인 토큰이 없는 상태 — 함수 안의 문지기가 막아야 한다
  set local role authenticated;
  v := public.gig_checkin('ZZZZZ');
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 체크인이 not_logged_in 이 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.gig_cheer('ZZZZZ', 1::smallint, true);
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 응원이 not_logged_in 이 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.gig_vote('ZZZZZ', null::text);
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 투표가 not_logged_in 이 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.gig_guestbook_write('ZZZZZ', '본문입니다');
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 방명록 쓰기가 not_logged_in 이 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.gig_my_stamps();
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 토큰 없는 내 도장이 not_logged_in 이 아닙니다 — 전체를 취소합니다';
  end if;
  v := public.admin_gig_list();
  if (v ->> 'reason') is distinct from 'forbidden' then
    raise exception '안전장치: 운영자 아닌 사람에게 공연 관리 목록이 열립니다 — 전체를 취소합니다';
  end if;
  v := public.admin_gig_save('{}'::jsonb);
  if (v ->> 'reason') is distinct from 'forbidden' then
    raise exception '안전장치: 운영자 아닌 사람이 공연을 저장할 수 있습니다 — 전체를 취소합니다';
  end if;
  begin perform * from public.gig_checkins limit 1;
    raise exception '안전장치: 로그인 역할로 체크인 표가 직접 읽힙니다 — 전체를 취소합니다';
  exception when insufficient_privilege then null; end;
  v := public.member_join('시험별명', true, true);
  if (v ->> 'reason') is distinct from 'not_logged_in' then
    raise exception '안전장치: 속도 제한을 바꾼 뒤 가입 함수(010)가 다르게 움직입니다 — 전체를 취소합니다';
  end if;
  reset role;

  -- (다) 소유자 — 구조 점검
  select count(*) into n
    from pg_constraint c
   where c.contype = 'f'
     and c.confrelid = 'public.members'::regclass
     and c.conrelid in ('public.gig_checkins'::regclass, 'public.gig_cheers'::regclass, 'public.gig_votes'::regclass)
     and c.confdeltype = 'c';
  if n <> 3 then
    raise exception '안전장치: 탈퇴하면 함께 지워지는 연결(도장·응원·투표)이 3개가 아니라 %개입니다 — 전체를 취소합니다', n;
  end if;
  select count(*) into n
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.contype = 'f' and c.conrelid = 'public.board_posts'::regclass and a.attname = 'gig_id';
  if n <> 1 or not exists (
      select 1 from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f' and c.conrelid = 'public.board_posts'::regclass and a.attname = 'gig_id'
         and c.confdeltype = 'n') then
    raise exception '안전장치: 게시판 글의 공연 칸 연결이 "공연을 지워도 글은 남김" 하나가 아닙니다 — 전체를 취소합니다';
  end if;
  select count(*) into n from json_object_keys(public.pending_summary(null));
  if n <> 11 then
    raise exception '안전장치: 알림 함수(010)의 칸이 11개가 아닙니다 — 전체를 취소합니다';
  end if;
  if position('auth.uid()' in pg_get_functiondef('public.rate_ok(text,integer)'::regprocedure)) = 0 then
    raise exception '안전장치: 속도 제한이 회원 기준이 아닙니다 — 전체를 취소합니다';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'song_requests' and column_name = 'user_id') then
    raise exception '안전장치: 공개 표 song_requests 에 사람 칸이 있습니다(누가 무엇을 골랐는지 공개됨) — 전체를 취소합니다';
  end if;
  if has_function_privilege('anon', 'public.req_ip_hash()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.req_ip_hash()', 'EXECUTE') then
    raise exception '안전장치: IP 해시 함수가 밖에 열려 있습니다 — 전체를 취소합니다';
  end if;
  if has_function_privilege('anon', 'public.rate_ok(text,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.rate_ok(text,integer)', 'EXECUTE') then
    raise exception '안전장치: 속도 제한 함수가 밖에 열려 있습니다 — 전체를 취소합니다';
  end if;
  if has_function_privilege('authenticated', 'public.gig_phase(public.gig_events)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.gig_find(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.gig_tally(bigint)', 'EXECUTE') then
    raise exception '안전장치: 공연 도우미 함수가 밖에 열려 있습니다 — 전체를 취소합니다';
  end if;
end
$chk$;

notify pgrst, 'reload schema';

commit;


-- ── 13. 확인표 — 결과 창에 뜬다 ─────────────────────────────
select 점검, 결과 from (
  select 번호, 점검, case when 결과 then '✅' else '❌' end as 결과
  from (values
    (1,  '공연 표 6개가 생겼다',
         to_regclass('public.gig_events') is not null and to_regclass('public.gig_phrases') is not null
         and to_regclass('public.gig_vote_songs') is not null and to_regclass('public.gig_checkins') is not null
         and to_regclass('public.gig_cheers') is not null and to_regclass('public.gig_votes') is not null),
    (2,  '공개 키로 도장·응원·투표 원본을 못 읽는다',
         not has_table_privilege('anon', 'public.gig_checkins', 'SELECT')
         and not has_table_privilege('anon', 'public.gig_cheers', 'SELECT')
         and not has_table_privilege('anon', 'public.gig_votes', 'SELECT')),
    (3,  '공개 키로 공연 정보·숫자는 읽힌다(함수로)',
         has_function_privilege('anon', 'public.gig_event(text)', 'EXECUTE')
         and has_function_privilege('anon', 'public.gig_pulse(text)', 'EXECUTE')),
    (4,  '공개 키로 도장·응원·투표·방명록을 못 한다',
         not has_function_privilege('anon', 'public.gig_checkin(text)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.gig_cheer(text, smallint, boolean)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.gig_vote(text, text)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.gig_guestbook_write(text, text)', 'EXECUTE')),
    (5,  '로그인한 사람은 도장·응원·투표·방명록을 할 수 있다',
         has_function_privilege('authenticated', 'public.gig_checkin(text)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.gig_cheer(text, smallint, boolean)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.gig_vote(text, text)', 'EXECUTE')
         and has_function_privilege('authenticated', 'public.gig_guestbook_write(text, text)', 'EXECUTE')),
    (6,  '공연 관리 함수는 공개 키가 못 부른다',
         not has_function_privilege('anon', 'public.admin_gig_list()', 'EXECUTE')
         and not has_function_privilege('anon', 'public.admin_gig_save(jsonb)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.admin_gig_set(bigint, text, boolean)', 'EXECUTE')),
    (7,  '탈퇴하면 도장·응원·투표가 함께 지워진다',
         (select count(*) from pg_constraint c
           where c.contype = 'f' and c.confrelid = 'public.members'::regclass and c.confdeltype = 'c'
             and c.conrelid in ('public.gig_checkins'::regclass, 'public.gig_cheers'::regclass, 'public.gig_votes'::regclass)) = 3),
    (8,  '응원 문구 6개',                                (select count(*) from public.gig_phrases where active) = 6),
    (9,  '속도 제한이 회원 기준이고, 밖에서 못 부른다',
         position('auth.uid()' in pg_get_functiondef('public.rate_ok(text,integer)'::regprocedure)) > 0
         and not has_function_privilege('anon', 'public.rate_ok(text,integer)', 'EXECUTE')
         and not has_function_privilege('anon', 'public.req_ip_hash()', 'EXECUTE')),
    (10, '게시판 글에 공연 칸이 있다',
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'board_posts' and column_name = 'gig_id'))
  ) as t(번호, 점검, 결과)
  union all
  select 11, '새로 세는 간격 ' || public.bs('gig_poll_s', 15) || '초 · 공연 '
             || (select count(*) from public.gig_events) || '개(공개 '
             || (select count(*) from public.gig_events where status = 'published') || ')', 'ℹ️'
) x
order by 번호;
