// 실행: 아무 빈 폴더에서 `npm i @electric-sql/pglite` 한 뒤
//       node <이 파일> <저장소>/supabase
// 010 검증 — 실제 PostgreSQL(PGlite)에 001~010 을 그대로 깔고, 운영자·카카오 회원·이메일 회원·
// 가입 안 한 사람·공개 키(익명) 다섯 사람으로 회원·등업·게시판·댓글·탈퇴를 끝까지 돌린다.
// 009 를 건너뛰고 010 만 깐 경우(형님이 010 하나만 실행하는 경우)도 똑같이 돌린다.
// 마지막에 일부러 망가뜨린 010 으로 다시 돌려, 테스트(또는 SQL 의 안전장치)가 잡는지 본다.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

const SUPA = process.argv[2];
const ALL = fs.readdirSync(SUPA).filter(f => /^0\d\d.*\.sql$/.test(f)).sort();
const UPTO8 = ALL.filter(f => /^00[1-8]/.test(f));
const F009 = ALL.find(f => /^009/.test(f));
const F010 = ALL.find(f => /^010/.test(f));

const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text,
  raw_app_meta_data jsonb not null default '{}', raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
grant usage on schema public to anon, authenticated;
`;

const ADMIN = "11111111-1111-4111-8111-111111111111";
const KAKAO = "22222222-2222-4222-8222-222222222222";
const MAIL  = "33333333-3333-4333-8333-333333333333";
const NOJOIN = "44444444-4444-4444-8444-444444444444";

async function build(sql010, with009) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  for (const f of UPTO8) await db.exec(fs.readFileSync(path.join(SUPA, f), "utf8"));
  if (with009) await db.exec(fs.readFileSync(path.join(SUPA, F009), "utf8"));
  await db.exec(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
    ('${ADMIN}', 'jake@test.local', '{"provider":"email"}', '{}'),
    ('${KAKAO}', null, '{"provider":"kakao"}', '{"nickname":"홍천팬","name":"홍길동"}'),
    ('${MAIL}',  'abcdef@test.local', '{"provider":"email"}', '{}'),
    ('${NOJOIN}', 'nojoin@test.local', '{"provider":"email"}', '{}');
    insert into public.admins (user_id, email, memo) values ('${ADMIN}', 'jake@test.local', '시험');`);
  // 운영 DB 처럼 기존 대기 글이 있는 상태에서 깐다 — 안전장치의 '운영자 건수 = 공개 키 건수'가 0=0 으로 지나가지 않게
  await db.exec(`insert into public.notes (body, status) values ('기존 대기 한 줄', 'pending');`);
  await db.exec(sql010);
  const r2 = await db.exec(sql010);                          // 두 번 — 멱등성
  db.__report = r2[r2.length - 1].rows;
  return db;
}

// PostgREST 흉내: 한 트랜잭션 안에서 역할과 클레임을 걸고 부른다
async function as(db, who, sql, params = [], ip = "203.0.113.7") {
  const claims = who.sub ? { sub: who.sub, email: who.email || "", role: who.role } : { role: who.role };
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [who.sub || ""]);
    await db.query("select set_config('request.headers', $1, true)", [JSON.stringify({ "x-forwarded-for": ip })]);
    await db.exec(`set local role ${who.role}`);
    const r = await db.query(sql, params);
    await db.exec("commit");
    return { rows: r.rows };
  } catch (e) {
    await db.exec("rollback");
    return { err: String(e.message || e) };
  }
}
const ANON = { role: "anon" };
const NOTOKEN = { role: "authenticated" };
const ADM = { role: "authenticated", sub: ADMIN, email: "jake@test.local" };
const KA  = { role: "authenticated", sub: KAKAO };
const ML  = { role: "authenticated", sub: MAIL, email: "abcdef@test.local" };
const NJ  = { role: "authenticated", sub: NOJOIN, email: "nojoin@test.local" };
const j = r => (r.rows && r.rows[0]) ? Object.values(r.rows[0])[0] : (r.err ? { __err: r.err } : null);
const call = async (db, who, fn, args = [], ip) => j(await as(db, who, `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as v`, args, ip));
const denied = r => r && r.__err && /permission denied/.test(r.__err);
// 게시판 글 승인은 운영자가 본 판(ver)을 함께 보낸다(010 — 바꿔치기 막기). 지금 판을 읽어 그대로 보낸다.
const verOf = async (db, id) => (await db.query("select coalesce(edited_at, created_at)::text as v from public.board_posts where id = $1", [id])).rows[0]?.v ?? null;
const approveB = async (db, id) => call(db, ADM, "admin_set_status", ["bpost", id, "approved", await verOf(db, id)]);

async function suite(db) {
  const R = [];
  const t = (name, ok, info = "") => R.push({ name, ok: !!ok, info: typeof info === "string" ? info : JSON.stringify(info) });
  let v;

  // ── 공개 키(익명) ─────────────────────────────────────────
  v = await call(db, ANON, "board_list", [null, 20]);
  t("익명: 게시판 읽기 됨(빈 목록)", v && v.ok && Array.isArray(v.rows) && v.rows.length === 0, v);
  t("익명: 글쓰기 함수 자체가 막힘", denied(await call(db, ANON, "board_write", ["제목", "본문"])));
  t("익명: 회원 함수 막힘", denied(await call(db, ANON, "member_me")));
  for (const tb of ["members", "board_posts", "board_comments", "board_settings", "member_level_log"]) {
    const r = await as(db, ANON, `select * from public.${tb} limit 1`);
    t(`익명: ${tb} 원본 표 막힘`, r.err && /permission denied/.test(r.err), r.err || r.rows);
  }
  v = await call(db, NOTOKEN, "member_me");
  t("토큰 없는 로그인 역할: not_logged_in", v && v.reason === "not_logged_in", v);

  // ── 가입 ─────────────────────────────────────────────────
  v = await call(db, KA, "member_me");
  t("카카오: 가입 전 → joined false · 카카오 별명 미리 채움", v && v.ok && v.joined === false && v.suggest === "홍천팬" && v.provider === "kakao", v);
  t("가입 전 글쓰기 → not_member", (await call(db, KA, "board_write", ["제목입니다", "본문입니다"]))?.reason === "not_member");
  t("동의 안 함 → need_agree", (await call(db, KA, "member_join", ["홍천팬", false, true]))?.reason === "need_agree");
  t("14세 확인 안 함 → need_age", (await call(db, KA, "member_join", ["홍천팬", true, false]))?.reason === "need_age");
  for (const [nick, why] of [["인순이", "reserved_nick"], ["인 순 이", "reserved_nick"], ["INSOONI", "reserved_nick"],
                             ["운영자하나", "reserved_nick"], ["공식팬", "reserved_nick"], ["Admin7", "reserved_nick"],
                             ["가수 인순이", "reserved_nick"], ["인순이 본인", "reserved_nick"], ["인순이1", "reserved_nick"],
                             ["lNSOONI", "reserved_nick"], ["ins00ni", "reserved_nick"], ["1nsooni", "reserved_nick"],
                             ["가", "bad_nick_len"], ["열세글자를넘는아주아주긴별명", "bad_nick_len"],
                             ["<b>팬</b>", "bad_nick_char"], ["홍천😀팬", "bad_nick_char"]]) {
    v = await call(db, KA, "member_join", [nick, true, true]);
    t(`별명 '${nick}' → ${why}`, v && v.reason === why, v);
  }
  v = await call(db, KA, "member_join", ["  홍천팬  ", true, true]);
  t("카카오: '홍천팬' 가입 → ok", v && v.ok, v);
  t("두 번 가입 → already", (await call(db, KA, "member_join", ["다른이름", true, true]))?.reason === "already");
  t("이메일: '홍 천팬'(띄어쓰기만 다름) → nick_taken", (await call(db, ML, "member_join", ["홍 천팬", true, true]))?.reason === "nick_taken");
  t("이메일: '서울팬' 가입 → ok", (await call(db, ML, "member_join", ["서울팬", true, true]))?.ok === true);
  t("운영자: '사랑방지기' 가입 → ok", (await call(db, ADM, "member_join", ["사랑방지기", true, true]))?.ok === true);
  v = await call(db, ADM, "member_me");
  t("운영자는 처음부터 정회원·admin true", v && v.level === "member" && v.admin === true, v);
  v = await call(db, KA, "member_me");
  t("카카오 회원은 새싹 · 기준 글 3 댓글 5 · 자동 등업 걸림", v && v.level === "sprout" && v.need_posts === 3 && v.need_comments === 5 && v.auto_up === true, v);

  // ── 새싹 글 → 검수 대기 ───────────────────────────────────
  t("제목 1자 → title_empty", (await call(db, KA, "board_write", ["가", "본문입니다"]))?.reason === "title_empty");
  t("제목 61자 → title_long", (await call(db, KA, "board_write", ["가".repeat(61), "본문입니다"]))?.reason === "title_long");
  t("본문 4001자 → too_long", (await call(db, KA, "board_write", ["제목입니다", "가".repeat(4001)]))?.reason === "too_long");
  v = await call(db, KA, "board_write", ["첫 인사드립니다", "홍천에서 왔습니다.\n늘 건강하세요."]);
  const p1 = v && v.id;
  t("새싹 글 → pending", v && v.ok && v.status === "pending", v);
  v = await call(db, ANON, "pending_summary", [null]);
  t("알림: 새싹 글이 대기로 잡힌다(게시판 글 1 · 전체 2)", v && v.bpost === 1 && v.total === 2, v);
  v = await call(db, ANON, "board_list", [null, 20]);
  t("검수 전 새싹 글은 공개 목록에 없다", v && v.rows && v.rows.length === 0, v);
  v = await call(db, KA, "board_read", [p1]);
  t("쓴 사람은 검수 중인 자기 글을 본다(mine·pending)", v && v.ok && v.post.mine === true && v.post.status === "pending", v);
  t("남은 검수 중인 글을 못 본다", (await call(db, ML, "board_read", [p1]))?.reason === "not_found");
  t("익명도 검수 중인 글을 못 본다", (await call(db, ANON, "board_read", [p1]))?.reason === "not_found");
  t("검수 중인 글에는 댓글 불가", (await call(db, ML, "comment_write", [p1, "반갑습니다"]))?.reason === "not_found");

  // ── 운영자 ───────────────────────────────────────────────
  v = await call(db, ML, "admin_list", ["pending", 50]);
  t("운영자 아닌 회원 → admin_list forbidden", v && v.reason === "forbidden", v);
  v = await call(db, ADM, "admin_list", ["pending", 50]);
  const row = v && v.rows && v.rows.find(r => r.kind === "bpost" && r.id === p1);
  t("운영자 목록에 게시판 글이 제목·별명·등급과 함께", row && row.title === "첫 인사드립니다" && row.name === "홍천팬" && row.level === "sprout", row || v);
  t("운영자 목록 대기 수 = 한 줄 1 + 글 1", v && v.counts && v.counts.pending === 2, v && v.counts);
  // ── 바꿔치기: 운영자가 목록을 본 뒤 새싹이 고치면, 본 판으로는 승인되지 않는다 ──
  const seen = row && row.ver;
  t("운영자 목록의 게시판 글에 판(ver)이 있다", !!seen, row);
  v = await call(db, KA, "board_edit", [p1, "첫 인사드립니다", "바꿔치기한 본문"]);
  t("검수 중에 새싹이 고침 → 계속 pending", v && v.status === "pending", v);
  v = await call(db, ADM, "admin_set_status", ["bpost", p1, "approved", seen]);
  t("운영자가 본 옛 판으로 올리기 → changed 로 거절(공개 안 됨)", v && v.reason === "changed", v);
  t("거절된 뒤 공개 목록에 없음", ((await call(db, ANON, "board_list", [null, 20]))?.rows || []).length === 0);
  t("판 없이 올리기도 거절", (await call(db, ADM, "admin_set_status", ["bpost", p1, "approved"]))?.reason === "changed");
  await call(db, KA, "board_edit", [p1, "첫 인사드립니다", "홍천에서 왔습니다.\n늘 건강하세요."]);
  v = await approveB(db, p1);
  t("운영자 올리기(지금 판) → ok · 아직 등업 아님", v && v.ok && v.levelup === false, v);
  v = await call(db, ANON, "board_list", [null, 20]);
  t("올린 뒤 공개 목록에 보임", v && v.rows && v.rows.length === 1 && v.rows[0].id === p1 && v.rows[0].nickname === "홍천팬", v);
  t("공개 목록 칸에 계정 정보 없음", v && v.rows[0] && Object.keys(v.rows[0]).sort().join(",") ===
    "comments,created_at,cut,edited_at,excerpt,id,level,mine,nickname,staff,title", v && v.rows[0] && Object.keys(v.rows[0]));
  v = await call(db, ADM, "board_write", ["공지 — 사랑방 이용 안내", "서로 아껴 주세요."]);
  const pA = v && v.id;
  t("운영자 글 → 바로 공개", v && v.status === "approved", v);
  v = await call(db, ANON, "board_list", [null, 20]);
  t("운영자 글은 staff 표시", v && (v.rows || []).find(r => r.id === pA)?.staff === true, v);

  // ── 등업 경계값: 글 3 · 댓글 5 ─────────────────────────────
  const ids = [];
  for (let i = 2; i <= 3; i++) { v = await call(db, KA, "board_write", [`두 번째부터 ${i}`, "본문입니다"]); ids.push(v && v.id); }
  for (const id of ids) await approveB(db, id);
  const cids = [];
  for (let i = 1; i <= 5; i++) { v = await call(db, KA, "comment_write", [pA, `댓글 ${i}`]); cids.push(v && v.id); }
  t("새싹 댓글 → pending", v && v.status === "pending", v);
  let up = null;
  for (let i = 0; i < 4; i++) up = await call(db, ADM, "admin_set_status", ["comment", cids[i], "approved"]);
  v = await call(db, KA, "member_me");
  t("글 3 + 댓글 4 → 아직 새싹", v && v.level === "sprout" && v.posts_ok === 3 && v.comments_ok === 4 && up && up.levelup === false, v);
  up = await call(db, ADM, "admin_set_status", ["comment", cids[4], "approved"]);
  v = await call(db, KA, "member_me");
  t("댓글 5번째 승인 → 자동 정회원", up && up.levelup === true && v && v.level === "member", { up, v });
  v = await call(db, KA, "board_write", ["정회원이 되었어요", "감사합니다"]);
  const pMem = v && v.id;
  t("정회원 글 → 바로 공개", v && v.status === "approved", v);
  v = await call(db, KA, "comment_write", [pA, "정회원 댓글"]);
  t("정회원 댓글 → 바로 공개", v && v.status === "approved", v);

  // ── 이메일 회원 · 댓글 · 남의 글 ──────────────────────────
  v = await call(db, ML, "comment_write", [pMem, "축하드려요"]);
  const cML = v && v.id;
  t("이메일(새싹) 댓글 → pending", v && v.status === "pending", v);
  v = await call(db, ML, "board_read", [pMem]);
  t("내 대기 댓글은 나에게만 보인다", v && (v.comments || []).some(c => c.id === cML && c.mine && c.status === "pending"), v);
  v = await call(db, ANON, "board_read", [pMem]);
  t("익명에게 대기 댓글은 안 보인다", v && v.ok && !(v.comments || []).some(c => c.id === cML), v);
  t("남의 글 고치기 → not_found", (await call(db, ML, "board_edit", [pMem, "바꿔치기", "바꿔치기"]))?.reason === "not_found");
  t("남의 글 지우기 → not_found", (await call(db, ML, "board_delete", [pMem]))?.reason === "not_found");
  t("남의 댓글 지우기 → not_found", (await call(db, KA, "comment_delete", [cML]))?.reason === "not_found");
  v = await call(db, KA, "board_read", [pMem]);
  t("남의 글을 못 지웠다(그대로 있음)", v && v.ok, v);

  // ── 운영자 등급 조정 ─────────────────────────────────────
  t("운영자 아닌 사람 → admin_members forbidden", (await call(db, ML, "admin_members", [null, 50]))?.reason === "forbidden");
  t("운영자 아닌 사람 → admin_set_level forbidden", (await call(db, ML, "admin_set_level", [KAKAO, "blocked"]))?.reason === "forbidden");
  v = await call(db, ADM, "admin_members", [null, 50]);
  const mML = v && v.rows && v.rows.find(r => r.nickname === "서울팬");
  t("회원 명단: 이메일은 가려서(ab***@…)", mML && mML.email_masked === "ab***@test.local", mML);
  t("회원 명단 어디에도 원래 이메일이 없다", v && !JSON.stringify(v).includes("abcdef@"), "");
  t("회원 명단 집계: 3명(새싹 1·정회원 2)", v && v.counts.total === 3 && v.counts.sprout === 1 && v.counts.member === 2, v && v.counts);
  t("운영자 계정 등급은 못 바꾼다 → staff", (await call(db, ADM, "admin_set_level", [ADMIN, "sprout"]))?.reason === "staff");
  v = await call(db, ADM, "admin_set_level", [KAKAO, "sprout"]);
  t("운영자가 정회원을 새싹으로", v && v.ok && v.from === "member", v);
  v = await call(db, KA, "board_write", ["새싹으로 돌아감", "본문입니다"]);
  t("새싹으로 내린 뒤 글 → 다시 pending", v && v.status === "pending", v);
  up = await approveB(db, v && v.id);
  v = await call(db, KA, "member_me");
  t("운영자가 정한 새싹은 기준을 채워도 자동 등업 안 됨 · auto_up false", up && up.levelup === false && v && v.level === "sprout" && v.auto_up === false, { up, v });
  v = await call(db, KA, "board_edit", [ids[0], "고친 제목입니다", "고친 본문"]);
  t("새싹이 올라간 글을 고치면 다시 검수(pending)", v && v.status === "pending", v);
  await call(db, ADM, "admin_set_level", [KAKAO, "member"]);
  await call(db, ADM, "admin_set_status", ["bpost", ids[0], "rejected"]);
  v = await call(db, KA, "board_edit", [ids[0], "내린 글 고침", "다시 올라가려 함"]);
  t("정회원이 내려간 글을 고쳐도 다시 안 올라감(rejected 유지)", v && v.status === "rejected", v);
  v = await call(db, KA, "board_edit", [pMem, "정회원 글 고침", "본문 고침"]);
  t("정회원 글 고치기 → 공개 유지", v && v.status === "approved", v);
  v = await call(db, ADM, "admin_set_level", [MAIL, "blocked"]);
  t("차단", v && v.ok, v);
  t("차단된 회원 글쓰기 → blocked", (await call(db, ML, "board_write", ["차단 후", "본문입니다"]))?.reason === "blocked");
  t("차단된 회원 댓글 → blocked", (await call(db, ML, "comment_write", [pMem, "차단 후"]))?.reason === "blocked");
  t("차단된 회원 별명 바꾸기 → blocked", (await call(db, ML, "member_rename", ["차단후새이름"]))?.reason === "blocked");
  for (const nn of ["홍천팬가", "홍천팬나", "홍천팬다"]) await call(db, KA, "member_rename", [nn], "192.0.2." + nn.length);
  v = await call(db, KA, "member_rename", ["홍천팬라"], "192.0.2.99");
  t("별명은 하루 세 번까지(IP 를 바꿔도) → rate_limited", v && v.reason === "rate_limited", v);
  const nl = (await db.query(`select from_name, to_name from public.member_name_log where target = '${KAKAO}' order by id`)).rows;
  t("별명 바꾼 기록이 남는다(옛 이름 → 새 이름)", nl.length === 3 && nl[0].from_name === "홍천팬" && nl[2].to_name === "홍천팬다", nl);
  t("익명: 별명 기록 표 막힘", denied(j(await as(db, ANON, "select * from public.member_name_log limit 1")) || { __err: (await as(db, ANON, "select * from public.member_name_log limit 1")).err }));
  const old3 = (await db.query("select to_regprocedure('public.admin_set_status(text,bigint,text)') is null as gone")).rows[0].gone;
  t("008 의 세 인자 상태 바꾸기는 지워짐(PostgREST 혼동 방지)", old3 === true);

  // ── 알림 · 내 글 ─────────────────────────────────────────
  v = await call(db, ANON, "pending_summary", [null]);
  t("알림: 게시판 글·댓글 칸이 있다", v && "bpost" in v && "comment" in v && Object.keys(v).length === 11, v);
  t("알림: 대기 = 한 줄 1 + 댓글 1(서울팬)", v && v.note === 1 && v.comment === 1 && v.bpost === 0 && v.total === 2, v);
  v = await call(db, KA, "board_mine");
  t("내 글 목록: 내려간 글까지 보인다", v && v.ok && (v.rows || []).some(r => r.id === ids[0] && r.status === "rejected"), v);

  // ── 지우기 ───────────────────────────────────────────────
  v = await call(db, ML, "comment_delete", [cML]);
  t("내 댓글 지우기 → ok", v && v.ok && v.was === "pending", v);
  v = await call(db, KA, "board_delete", [pMem]);
  t("내 글 지우기 → ok", v && v.ok, v);
  t("지운 글은 읽을 수 없다", (await call(db, ANON, "board_read", [pMem]))?.reason === "not_found");

  // ── 속도 제한(회원당 시간당 글 5개) ────────────────────────
  let last = null;
  for (let i = 0; i < 6; i++) last = await call(db, KA, "board_write", [`연속 글 ${i}`, "본문입니다"], "198.51.100." + (10 + i));
  t("한 시간에 6번째 글 → rate_limited (IP 를 바꿔도)", last && last.reason === "rate_limited", last);

  // ── 탈퇴 ─────────────────────────────────────────────────
  t("운영자는 여기서 탈퇴 불가", (await call(db, ADM, "member_leave"))?.reason === "admin_cannot_leave");
  v = await call(db, KA, "member_leave");
  t("카카오 회원 탈퇴 → ok", v && v.ok, v);
  const left = (await db.query(`select
      (select count(*) from auth.users where id = '${KAKAO}')::int as u,
      (select count(*) from public.members where user_id = '${KAKAO}')::int as m,
      (select count(*) from public.board_posts where user_id = '${KAKAO}')::int as p,
      (select count(*) from public.board_comments where user_id = '${KAKAO}')::int as c,
      (select count(*) from public.member_level_log where target = '${KAKAO}')::int as l`)).rows[0];
  t("탈퇴 → 계정·명부·글·댓글·등급기록 전부 파기", left.u + left.m + left.p + left.c + left.l === 0, left);
  v = await call(db, NJ, "board_write", ["가입 안 함", "본문입니다"]);
  t("가입 안 한 계정 글쓰기 → not_member", v && v.reason === "not_member", v);

  // ── 확인표 ───────────────────────────────────────────────
  const rep = db.__report || [];
  t("확인표 ✅ 9 · ❌ 0", rep.filter(r => r["결과"] === "✅").length === 9 && !rep.some(r => r["결과"] === "❌"), rep);
  return R;
}

const sql = fs.readFileSync(path.join(SUPA, F010), "utf8");
let fail = 0, total = 0;
for (const w9 of [false, true]) {
  console.log(w9 ? "\n── 009 를 먼저 실행한 뒤 010" : "── 010 하나만 실행(009 건너뜀)");
  const res = await suite(await build(sql, w9));
  for (const r of res) { total++; if (!r.ok) fail++; if (!r.ok || !w9) console.log(`${r.ok ? "  ✓" : "  ✗"} ${r.name}${r.ok ? "" : "  ← " + r.info.slice(0, 300)}`); }
  if (w9) console.log(`  (009 다음 실행: ${res.filter(r => r.ok).length}/${res.length})`);
}
console.log(`\n본 검사: ${total - fail}/${total} 통과`);

const MUT = [
  ["새싹 글도 바로 공개", s => s.replace("v_status := case when v_level = 'member' or public.is_admin() then 'approved' else 'pending' end;\n  insert into public.board_posts", "v_status := 'approved';\n  insert into public.board_posts")],
  ["회원 명부를 공개 키에 엶", s => s.replace("revoke all on public.members from anon, authenticated;", "grant select on public.members to anon;")],
  ["운영자가 정한 등급도 자동이 덮어씀", s => s.replace("if not found or v_level <> 'sprout' or v_by <> 'auto' then", "if not found or v_level <> 'sprout' then")],
  ["공개 목록에 검수 전 글이 샘", s => s.replace("where p.status = 'approved' and (p_before is null or p.id < p_before)", "where (p_before is null or p.id < p_before)")],
  ["남의 검수 중인 글이 보임", s => s.replace("if not found or (r.status <> 'approved' and r.user_id is distinct from v_uid) then", "if not found then")],
  ["'인순이' 별명 허용", s => s.replace("if f ~ '(인순이|김인순|insooni|insoon|kiminsoon|해밀학교)'", "if false")],
  ["새싹이 고쳐도 검수 안 거침", s => s.replace("v_new := case when v_level = 'member' or public.is_admin() then v_status else 'pending' end;", "v_new := v_status;")],
  ["회원 명단에 원래 이메일", s => s.replace("regexp_replace(u.email, '^(.{1,2})[^@]*(@.*)$', '\\1***\\2')", "u.email")],
  ["운영자도 탈퇴됨", s => s.replace("  if public.is_admin() then\n    return json_build_object('ok', false, 'reason', 'admin_cannot_leave');", "  if false then\n    return json_build_object('ok', false, 'reason', 'admin_cannot_leave');")],
  ["검수 중인 글에 댓글 허용", s => s.replace("if not exists (select 1 from public.board_posts where id = p_post_id and status = 'approved') then", "if not exists (select 1 from public.board_posts where id = p_post_id) then")],
  ["남의 글도 지워짐", s => s.replace("delete from public.board_posts where id = p_id and user_id = v_uid returning status into v_status;", "delete from public.board_posts where id = p_id returning status into v_status;")],
  ["글쓰기를 공개 키에 엶", s => s.replace("grant execute on function public.board_write(text, text)                 to authenticated;", "grant execute on function public.board_write(text, text)                 to anon, authenticated;")],
  ["등업 경계 하나 어긋남(>)", s => s.replace("if v_np >= public.bs('levelup_posts', 3) and v_nc >= public.bs('levelup_comments', 5) then", "if v_np >= public.bs('levelup_posts', 3) and v_nc > public.bs('levelup_comments', 5) then")],
  ["운영자 계정 등급도 바뀜", s => s.replace("  if exists (select 1 from public.admins where user_id = p_user) then\n    return json_build_object('ok', false, 'reason', 'staff');", "  if false then\n    return json_build_object('ok', false, 'reason', 'staff');")],
  ["차단 회원도 글을 씀", s => s.replace("  if v_level = 'blocked' then\n    return json_build_object('ok', false, 'reason', 'blocked');\n  end if;\n  if char_length(v_title) < 2 then return json_build_object('ok', false, 'reason', 'title_empty'); end if;\n  if char_length(v_title) > 60 then return json_build_object('ok', false, 'reason', 'title_long'); end if;\n  if char_length(v_body) < 2 then return json_build_object('ok', false, 'reason', 'empty'); end if;\n  if char_length(v_body) > 4000 then return json_build_object('ok', false, 'reason', 'too_long'); end if;\n  if not public.rate_ok('bwrite', 20)", "  if char_length(v_title) < 2 then return json_build_object('ok', false, 'reason', 'title_empty'); end if;\n  if char_length(v_title) > 60 then return json_build_object('ok', false, 'reason', 'title_long'); end if;\n  if char_length(v_body) < 2 then return json_build_object('ok', false, 'reason', 'empty'); end if;\n  if char_length(v_body) > 4000 then return json_build_object('ok', false, 'reason', 'too_long'); end if;\n  if not public.rate_ok('bwrite', 20)")],
  ["알림이 게시판을 안 셈", s => s.replace("    union all\n    select 'bpost',   created_at from public.board_posts    where status = 'pending'", "")],
  ["바꿔치기한 글도 승인", s => s.replace("if found and p_status = 'approved' and (p_ver is null or p_ver is distinct from v_ver) then", "if false then")],
  ["차단 회원도 별명을 바꿈", s => s.replace("  if v_lv = 'blocked' then\n    return json_build_object('ok', false, 'reason', 'blocked');", "  if false then\n    return json_build_object('ok', false, 'reason', 'blocked');")],
  ["닮은 글자를 접지 않음(lNSOONI 통과)", s => s.replace("f text := translate(public.nick_norm(p), 'l10', 'iio');", "f text := public.nick_norm(p);")],
  ["별명 횟수 제한 없음", s => s.replace("(select count(*) from public.member_name_log where target = v_uid and at > now() - interval '1 day') >= 3", "false")],
];
let caught = 0;
for (const [name, mut] of MUT) {
  const m = mut(sql);
  if (m === sql) { console.log(`  ? 뮤테이션 적용 실패: ${name}`); continue; }
  let hit = null, built = null;
  try { built = await build(m, false); }
  catch (e) { hit = `안전장치가 전체 취소: ${String(e.message || e).split("\n")[0].slice(0, 60)}`; }
  if (built) {
    try {
      const broke = (await suite(built)).filter(x => !x.ok);
      if (broke.length) hit = broke[0].name;
    } catch (e) { hit = `검사 중 예외(망가진 응답): ${String(e.message || e).slice(0, 60)}`; }
  }
  if (hit) caught++;
  console.log(`  ${hit ? "잡음" : "★못 잡음"} — ${name}${hit ? "  (" + hit + ")" : ""}`);
}
console.log(`뮤테이션: ${caught}/${MUT.length} 잡음`);
process.exit(fail || caught !== MUT.length ? 1 : 0);
