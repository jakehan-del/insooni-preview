// 실행: 아무 빈 폴더에서 `npm i @electric-sql/pglite` 한 뒤
//       node <이 파일> <저장소>/supabase            (전부: 본 검사 + 011 전 결함 재현 + 010 검사 재실행 + 뮤테이션)
//       node <이 파일> <저장소>/supabase --quick    (010 검사 재실행과 뮤테이션을 건너뛴다)
//
// 011(공연 모드) 검증 — 실제 PostgreSQL(PGlite)에 001~010 을 순서대로 깔고 011 을 두 번 실행(멱등)한 뒤,
// 운영자·카카오 새싹·이메일 정회원·가입 안 한 계정·차단 회원·객석 12명·공개 키(익명)로
// 공연 만들기 → 공개 → 도장·응원·투표·방명록 → 단계(시간 창·손잡이) → 속도 제한 → 탈퇴 → 다시 실행까지 돌린다.
// 숫자는 '함수가 준 값 = 표의 count(*)'로만 판정한다(지어낸 숫자를 잡으려고).
// 이어서 010 검사(check_board_sql.mjs)를 011 을 얹은 상태로 다시 돌려 010 계약이 그대로인지 본다.
// 마지막에 일부러 망가뜨린 011 로 다시 돌려, 테스트(또는 SQL 의 안전장치)가 잡는지 본다.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SUPA = process.argv[2];
const QUICK = process.argv.includes("--quick");
if (!SUPA) { console.error("사용법: node check_concert_sql.mjs <저장소>/supabase [--quick]"); process.exit(1); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALL = fs.readdirSync(SUPA).filter(f => /^0\d\d.*\.sql$/.test(f)).sort();
const UPTO10 = ALL.filter(f => /^0(0[1-9]|10)/.test(f));
const F011 = ALL.find(f => /^011/.test(f));
const F013 = ALL.find(f => /^013/.test(f));
const F014 = ALL.find(f => /^014/.test(f));
if (UPTO10.length !== 10 || !F011) { console.error("001~010 과 011 을 찾지 못했습니다:", ALL); process.exit(1); }
const read = f => fs.readFileSync(path.join(SUPA, f), "utf8");

// Supabase 흉내 — check_board_sql.mjs 와 같다(새 함수가 anon·authenticated 에게 자동으로 열린다)
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

const ADMIN  = "11111111-1111-4111-8111-111111111111";
const KAKAO  = "22222222-2222-4222-8222-222222222222";
const MAIL   = "33333333-3333-4333-8333-333333333333";
const NOJOIN = "44444444-4444-4444-8444-444444444444";
const BLOCK  = "55555555-5555-4555-8555-555555555555";
const CROWD  = Array.from({ length: 12 }, (_, i) => `66666666-6666-4666-8666-${String(i + 1).padStart(12, "0")}`);
const UIDS = [ADMIN, KAKAO, MAIL, NOJOIN, BLOCK, ...CROWD];

async function seedUsers(db) {
  await db.exec(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
    ('${ADMIN}', 'jake@test.local', '{"provider":"email"}', '{}'),
    ('${KAKAO}', null, '{"provider":"kakao"}', '{"nickname":"홍천팬"}'),
    ('${MAIL}',  'abcdef@test.local', '{"provider":"email"}', '{}'),
    ('${NOJOIN}', 'nojoin@test.local', '{"provider":"email"}', '{}'),
    ('${BLOCK}', 'block@test.local', '{"provider":"email"}', '{}'),
    ${CROWD.map(u => `('${u}', null, '{"provider":"kakao"}', '{}')`).join(",\n    ")};
    insert into public.admins (user_id, email, memo) values ('${ADMIN}', 'jake@test.local', '시험');`);
}

async function base10() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  for (const f of UPTO10) await db.exec(read(f));
  await seedUsers(db);
  // 운영 DB 처럼 기존 대기 글이 있는 상태 — 010 안전장치가 0=0 으로 지나가지 않게(010 검사와 같은 이유)
  await db.exec(`insert into public.notes (body, status) values ('기존 대기 한 줄', 'pending');`);
  return db;
}

async function build(sql011) {
  const db = await base10();
  await db.exec(sql011);
  const r2 = await db.exec(sql011);                       // 두 번 — 멱등성
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
const BL  = { role: "authenticated", sub: BLOCK, email: "block@test.local" };
const CR  = CROWD.map(sub => ({ role: "authenticated", sub }));
const j = r => (r.rows && r.rows[0]) ? Object.values(r.rows[0])[0] : (r.err ? { __err: r.err } : null);
const call = async (db, who, fn, args = [], ip) => j(await as(db, who, `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as v`, args, ip));
const denied = r => !!(r && r.__err && /permission denied/.test(r.__err));
const keys = o => (o && typeof o === "object") ? Object.keys(o).sort().join(",") : String(o);
const ks = list => [...list].sort().join(",");
const verOf = async (db, id) => (await db.query("select coalesce(edited_at, created_at)::text as v from public.board_posts where id = $1", [id])).rows[0]?.v ?? null;
const approveB = async (db, id) => call(db, ADM, "admin_set_status", ["bpost", id, "approved", await verOf(db, id)]);

const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;
const H = 3600e3;
const iso = ms => new Date(Date.now() + ms).toISOString();
const WIN = {
  open:   "opens_at = now() - interval '1 hour', closes_at = now() + interval '2 hours', guest_until = now() + interval '1 day'",
  before: "opens_at = now() + interval '1 hour', closes_at = now() + interval '3 hours', guest_until = now() + interval '1 day'",
  after:  "opens_at = now() - interval '3 hours', closes_at = now() - interval '1 hour', guest_until = now() + interval '1 day'",
  closed: "opens_at = now() - interval '3 days', closes_at = now() - interval '2 days', guest_until = now() - interval '1 day'",
};

class Caught extends Error {}


let pass = 0, fail = 0;
const t = (name, ok, info) => { if (ok) pass++; else fail++; console.log((ok ? "  ✓ " : "  ✗ ") + name + (ok ? "" : "   ← " + JSON.stringify(info).slice(0, 200))); };
async function world(with014) {
  const db = await base10();
  await db.exec(read(F011));
  await db.exec(read(F013));
  // 회원: 카카오 새싹 · 이메일 새싹 · 차단
  for (const [who, nick] of [[KA, "홍천팬"], [{ role: "authenticated", sub: MAIL }, "메일팬"], [{ role: "authenticated", sub: BLOCK }, "차단팬"]])
    await call(db, who, "member_join", [nick, true, true]);
  await db.exec(`update public.members set level = 'blocked' where user_id = '${BLOCK}'`);
  // 014 전: 새싹 글 하나는 대기, 하나는 운영자가 내림
  const p1 = await call(db, KA, "board_write", ["hello", "오늘 진해 콘서트 기대돼요", "014 전에 쓴 가입인사"]);
  const p2 = await call(db, KA, "board_write", ["free", "내려질 글입니다", "광고성 글"]);
  await call(db, ADM, "admin_set_status", ["bpost", p2.id, "rejected"]);
  const p3 = await call(db, KA, "board_write", ["free", "운영자가 올린 글", "댓글을 받을 글"]);
  await call(db, ADM, "admin_set_status", ["bpost", p3.id, "approved", (await db.query("select coalesce(edited_at, created_at) v from public.board_posts where id = $1", [p3.id])).rows[0].v]);
  const c1 = await call(db, { role: "authenticated", sub: MAIL }, "comment_write", [p3.id, "014 전 댓글"]);
  // 오늘 열린 공연
  await db.exec(`insert into public.gig_events (code, title_ko, venue_ko, starts_at, opens_at, closes_at, guest_until, status)
     values ('5UYX8', '진해 시험 공연', '진해아트홀', now() + interval '1 hour', now() - interval '1 hour', now() + interval '3 hours', now() + interval '3 days', 'published')`);
  if (with014) { const s = read(F014); await db.exec(s); const r2 = await db.exec(s); db.__report = r2[r2.length - 1].rows; }
  return { db, p1, p2, c1 };
}
const W = await world(true);
const db = W.db;
t("014 두 번 실행 — 확인표 한 줄 · 남은 대기 글 0 · 댓글 0", db.__report && db.__report.length === 1 && Number(db.__report[0]["남은 확인 대기 글"]) === 0 && Number(db.__report[0]["남은 확인 대기 댓글"]) === 0, db.__report);
const st = async id => (await db.query("select status from public.board_posts where id = $1", [id])).rows[0]?.status;
t("014 전 대기 글 → 공개", W.p1.status === "pending" && await st(W.p1.id) === "approved", [W.p1, await st(W.p1.id)]);
t("운영자가 내린 글은 그대로 내린 채", await st(W.p2.id) === "rejected", await st(W.p2.id));
t("014 전 대기 댓글 → 공개", W.c1.status === "pending" && (await db.query("select status from public.board_comments where id = $1", [W.c1.id])).rows[0].status === "approved", W.c1);
const n1 = await call(db, KA, "board_write", ["free", "새싹 새 글", "쓰자마자 보여야 한다"]);
t("새싹 새 글 → status approved", n1.ok && n1.status === "approved", n1);
const lst = await call(db, ANON, "board_list", [null, null, 20]);
t("익명 목록에 바로 보임(새 글 + 014 전 글)", lst.ok && lst.rows.some(r => r.id === n1.id) && lst.rows.some(r => r.id === W.p1.id), lst.rows?.map(r => r.id));
t("내린 글은 익명 목록에 없음", !lst.rows.some(r => r.id === W.p2.id), null);
const cm = await call(db, KA, "comment_write", [n1.id, "새싹 댓글"]);
t("새싹 댓글 → approved", cm.ok && cm.status === "approved", cm);
const gb = await call(db, { role: "authenticated", sub: MAIL }, "gig_guestbook_write", ["5UYX8", "공연장에서 남기는 방명록"]);
const gbl = await call(db, ANON, "gig_guestbook", ["5UYX8", null, 20]);
t("새싹 공연 방명록 → 바로 공개(익명 방명록 목록에 보임)", gb.ok && JSON.stringify(gbl).includes("공연장에서 남기는 방명록"), [gb, JSON.stringify(gbl).slice(0, 160)]);
const bl = await call(db, { role: "authenticated", sub: BLOCK }, "board_write", ["free", "차단 회원 글", "막혀야 한다"]);
t("차단 회원 → blocked(공개로 새지 않음)", bl.ok === false && bl.reason === "blocked", bl);
const an = await as(db, ANON, "select public.board_write('free', '익명', '익명 글')");
t("익명 → 권한 없음", !!an.err && /permission denied/.test(an.err), an);
const ed = await call(db, KA, "board_edit", [n1.id, null, "새싹 새 글(고침)", "고친 본문"]);
t("새싹이 고친 공개 글 → 공개 그대로", ed.ok && await st(n1.id) === "approved", [ed, await st(n1.id)]);
const ed2 = await call(db, KA, "board_edit", [W.p2.id, null, "내려진 글 고침", "다시 올려 달라"]);
t("내린 글을 고쳐도 내린 채", await st(W.p2.id) === "rejected", [ed2, await st(W.p2.id)]);
let rl = null;
for (let i = 0; i < 6; i++) rl = await call(db, KA, "board_write", ["free", "연속 글 " + i, "속도 제한 시험 " + i]);
t("속도 제한 그대로(한 시간 5개)", rl.ok === false && rl.reason === "rate_limited", rl);
// 뮤테이션 — 014 를 망가뜨리면 검사가 잡는가
const muts = [
  ["새 글을 여전히 대기로", s => s.replace("v_status := 'approved';   -- 014: 모든 회원의 글이", "v_status := case when v_level = 'member' or public.is_admin() then 'approved' else 'pending' end; -- ")],
  ["기다리던 글을 안 올림", s => s.replace("update public.board_posts    set status = 'approved' where status = 'pending';", "")],
  ["내린 글까지 올림", s => s.replace("where status = 'pending';\nupdate public.board_comments", "where status in ('pending','rejected');\nupdate public.board_comments")],
  ["익명에게 열어 줌", s => s.replace("from public, anon;\nrevoke all on function public.board_edit", "from public;\ngrant execute on function public.board_write(text, text, text) to anon;\nrevoke all on function public.board_edit")],
];
let caught = 0;
for (const [name, f] of muts) {
  const src2 = f(read(F014));
  if (src2 === read(F014)) { console.log("  ? 뮤테이션 적용 실패: " + name); continue; }
  const d2 = await base10(); await d2.exec(read(F011)); await d2.exec(read(F013));
  for (const [who, nick] of [[KA, "홍천팬"]]) await call(d2, who, "member_join", [nick, true, true]);
  const a = await call(d2, KA, "board_write", ["hello", "014 전 인사", "014 전에 쓴 글"]);
  const b = await call(d2, KA, "board_write", ["free", "내릴 글", "광고"]); await call(d2, ADM, "admin_set_status", ["bpost", b.id, "rejected"]);
  let err = null; try { await d2.exec(src2); } catch (e) { err = String(e.message || e); try { await d2.exec("rollback"); } catch (e2) {} }
  const s1 = (await d2.query("select status from public.board_posts where id = $1", [a.id])).rows[0].status;
  const s2 = (await d2.query("select status from public.board_posts where id = $1", [b.id])).rows[0].status;
  const n = await call(d2, KA, "board_write", ["free", "새 글입니다", "본문입니다"]);
  const bad = !!err || s1 !== "approved" || s2 !== "rejected" || n.status !== "approved";
  caught += bad ? 1 : 0;
  console.log("  " + (bad ? "잡음" : "★못 잡음") + " — " + name + (err ? " (안전장치: " + err.slice(0, 50) + ")" : ""));
}
console.log(`\n본 검사: ${pass}/${pass + fail} 통과\n뮤테이션: ${caught}/${muts.length} 잡음`);
process.exit(fail || caught !== muts.length ? 1 : 0);
