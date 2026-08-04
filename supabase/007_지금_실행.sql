-- ══════════════════════════════════════════════════════════════════
--  지금 한 번만 실행하시면 됩니다
-- ------------------------------------------------------------------
--  두 가지를 합니다.
--    ① 사랑방 칩 문구를 노래 이야기 → 사람 인사말로 바꿉니다.
--    ② 점검용 테스트 글(점검A)을 사랑방에서 내립니다. 지우지 않습니다.
--
--  안전합니다.
--    · 지우는(delete) 문장이 하나도 없습니다.
--    · 여러 번 실행해도 결과가 같습니다.
--    · 둘 다 되돌릴 수 있습니다(맨 아래에 되돌리는 법을 적어 두었습니다).
--
--  실행하는 곳: Supabase 대시보드 → 왼쪽 메뉴 SQL Editor → 붙여넣고 Run
-- ══════════════════════════════════════════════════════════════════


-- ── ① 칩 문구 ─────────────────────────────────────────────────────
--  사랑방에서 '오늘의 곡'을 걷어냈는데 칩 넷 중 셋이 아직 노래 이야기입니다
--  ("이 노래를 오래 좋아했습니다" 등). 곡이 없는 화면에서 그 말들은
--  무엇을 가리키는지 알 수 없습니다.
--
--  문구는 화면이 아니라 여기(DB)가 갖고 있습니다 — 팬이 칩을 누르면
--  번호만 서버로 오고, 문구는 이 표에서 찾아 저장됩니다.
--  그래서 이 파일만 실행하면 코드를 안 고쳐도 화면이 함께 바뀝니다.

update public.presets set ko = '그냥 인사드리러 왔습니다.', en = 'Just stopping by to say hello.' where n = 1;
update public.presets set ko = '오늘도 건강하세요.',       en = 'Wishing you good health today.' where n = 2;
update public.presets set ko = '늘 응원하고 있습니다.',     en = 'Always cheering for you.'       where n = 3;
update public.presets set ko = '여기 와서 좋았습니다.',     en = 'Glad I came by.'                where n = 4;

-- 네 개가 다 없으면 만들어 둡니다(앞 단계를 건너뛴 경우 대비)
insert into public.presets (n, ko, en)
select v.n, v.ko, v.en
from (values
  (1, '그냥 인사드리러 왔습니다.', 'Just stopping by to say hello.'),
  (2, '오늘도 건강하세요.',       'Wishing you good health today.'),
  (3, '늘 응원하고 있습니다.',     'Always cheering for you.'),
  (4, '여기 와서 좋았습니다.',     'Glad I came by.')
) as v(n, ko, en)
where not exists (select 1 from public.presets p where p.n = v.n);


-- ── ② 점검용 글 내리기 ────────────────────────────────────────────
--  지금 사랑방 「남기신 줄」에 서 있는 단 한 줄이 이름 '점검A' 인
--  시험용 글입니다. 진짜 팬이 남긴 글이 아닙니다.
--
--  지우지 않고 status 만 'approved' → 'pending' 으로 되돌립니다.
--  · 지우면 되돌릴 수 없지만, status 는 언제든 다시 바꿀 수 있습니다.
--  · 이 줄이 내려가면 사랑방은 승인 글 0건이 되고,
--    「남기신 줄」 섹션이 통째로 사라져 글칸 하나만 남습니다.
--  · 진짜 팬 글은 건드리지 않습니다 — 이름이 정확히 '점검A' 인 것만 봅니다.

update public.notes
   set status = 'pending'
 where name = '점검A'
   and status = 'approved';


-- ── ③ 확인 ────────────────────────────────────────────────────────
--  Run 하면 아래 두 표가 결과 창에 나옵니다. 이렇게 나오면 성공입니다.
--    첫째 표: 새 인사말 네 줄
--    둘째 표: 비어 있음 (사랑방에 올라온 글이 0건)

select n as 번호, ko as 칩문구 from public.presets order by n;

select name as 이름, body as 내용 from public.notes where status = 'approved';


-- ══════════════════════════════════════════════════════════════════
--  되돌리고 싶으시면
-- ------------------------------------------------------------------
--  ① 칩 문구를 예전으로:
--       update public.presets set ko='이 노래를 오래 좋아했습니다.' where n=1;
--       update public.presets set ko='오늘 처음 들었습니다.'       where n=2;
--       update public.presets set ko='다음 무대에서 듣고 싶어요.'   where n=3;
--
--  ② 점검용 글을 다시 올리기:
--       update public.notes set status='approved' where name='점검A';
-- ══════════════════════════════════════════════════════════════════
