-- ═════════════════════════════════════════════════
--  012 · 2026-10-03 진해아트홀 개관기념 '인순이 스페셜 콘서트' 등록   (2026-10-02)
-- ------------------------------------------------------------------
--  011(공연 모드)을 먼저 실행한 뒤에 실행합니다. 운영 화면에 '공연' 탭이 생기기 전이라 SQL 로 넣는다.
--
--  출처(날짜·시간·장소): 뉴스경남 2026-09-28 "진해아트홀 개관기념 특별공연 '인순이 스페셜 콘서트'
--  10월 3일 개최" — 10월 3일(토) 오후 5시, 진해아트홀 공연장.
--
--  QR 주소: https://insooni.com/live?e=5UYX8   ← 포스터·스크린 QR 이 이 주소를 담는다. 코드를 바꾸면 QR 도 다시.
--
--  시간 (모두 한국 시간)
--    도장·응원·투표 열림  10/3 14:00  — 로비에 QR 포스터가 붙는 시각부터
--    공연 시작            10/3 17:00
--    도장·응원·투표 닫힘  10/3 21:00  — 공연이 늦게 끝나면 운영 화면의 '지금 열기'로 연장
--    방명록 마감          10/6 23:59  — 다녀온 분들이 집에 가서도 남길 수 있게
--
--  앵콜 투표 후보 6곡은 songs.json 의 정본 제목(형님 확정 전 기본값 — 운영 화면에서 바꿀 수 있다).
--  여러 번 실행해도 같다(이미 있으면 그대로 둔다).
-- ═════════════════════════════════════════════════

begin;

insert into public.gig_events
  (code, title_ko, title_en, venue_ko, venue_en, starts_at, opens_at, closes_at, guest_until, status)
values
  ('5UYX8',
   '진해아트홀 개관기념 인순이 스페셜 콘서트',
   'INSOONI Special Concert — Jinhae Art Hall Opening',
   '진해아트홀', 'Jinhae Art Hall',
   '2026-10-03 17:00+09', '2026-10-03 14:00+09', '2026-10-03 21:00+09', '2026-10-06 23:59+09',
   'published')
on conflict (code) do nothing;

insert into public.gig_vote_songs (event_id, song, sort)
select e.id, s.song, s.sort
  from public.gig_events e
  cross join (values ('거위의 꿈', 1), ('밤이면 밤마다', 2), ('아버지', 3),
                     ('친구여', 4), ('아름다운 우리나라', 5), ('그래도 꿈은 흐른다', 6)) as s(song, sort)
 where e.code = '5UYX8'
on conflict (event_id, song) do nothing;

commit;

-- 확인표 — 결과 창에 이 한 줄이 뜨면 성공입니다.
select e.code, e.title_ko, e.venue_ko, e.status,
       to_char(e.starts_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') as "공연(한국)",
       to_char(e.opens_at  at time zone 'Asia/Seoul', 'MM/DD HH24:MI') as "열림",
       to_char(e.closes_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') as "닫힘",
       (select count(*) from public.gig_vote_songs v where v.event_id = e.id) as "투표 후보곡",
       'https://insooni.com/live?e=' || e.code as "QR 주소"
  from public.gig_events e
 where e.code = '5UYX8';
