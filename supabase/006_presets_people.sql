-- ══════════════════════════════════════════════════════════════════
-- 006 · 칩 문구를 사람의 인사말로
-- ------------------------------------------------------------------
-- 사랑방에서 '오늘의 곡'을 걷어냈다. 곡을 듣고 고르는 일은 음악 페이지가
-- 한다 — 사랑방에서 또 하면 사랑방이 음악 페이지의 그림자가 된다.
--
-- 그런데 칩 문구 넷 중 셋이 노래 이야기였다("이 노래를 오래 좋아했습니다",
-- "오늘 처음 들었습니다", "다음 무대에서 듣고 싶어요"). 곡이 없는 화면에서
-- 이 문구들은 무엇을 가리키는지 알 수 없는 말이 된다.
--
-- 문구는 화면이 아니라 여기(DB)가 갖고 있다. submit_preset 은 번호만 받고
-- 문구는 서버에서 찾아 넣기 때문이다. 그래서 이 파일 하나만 실행하면
-- 코드를 고치지 않아도 화면이 함께 바뀐다.
-- (화면은 이제 이 표를 읽어 그린다 — 보이는 말과 저장되는 말이 갈라지지 않는다.)
--
-- 이미 올라온 줄의 문구는 건드리지 않는다. 그건 그때 그 사람이 남긴
-- 실제 기록이다.
--
-- 실행: Supabase 대시보드 → SQL Editor → 붙여넣고 Run.
--       여러 번 실행해도 안전하다.
-- ══════════════════════════════════════════════════════════════════

update public.presets set
  ko = '그냥 인사드리러 왔습니다.',
  en = 'Just stopping by to say hello.'
where n = 1;

update public.presets set
  ko = '오늘도 건강하세요.',
  en = 'Wishing you good health today.'
where n = 2;

update public.presets set
  ko = '늘 응원하고 있습니다.',
  en = 'Always cheering for you.'
where n = 3;

update public.presets set
  ko = '여기 와서 좋았습니다.',
  en = 'Glad I came by.'
where n = 4;

-- 넷이 다 있는지 확인한다. 없으면 만든다(005 를 안 돌린 경우).
insert into public.presets (n, ko, en)
select v.n, v.ko, v.en
from (values
  (1, '그냥 인사드리러 왔습니다.', 'Just stopping by to say hello.'),
  (2, '오늘도 건강하세요.',       'Wishing you good health today.'),
  (3, '늘 응원하고 있습니다.',     'Always cheering for you.'),
  (4, '여기 와서 좋았습니다.',     'Glad I came by.')
) as v(n, ko, en)
where not exists (select 1 from public.presets p where p.n = v.n);

-- 확인용 — 실행하면 아래 넷이 그대로 나와야 한다.
select n, ko, en from public.presets order by n;
