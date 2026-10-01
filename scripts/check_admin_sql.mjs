// 실행: 아무 빈 폴더에서 `npm i @electric-sql/pglite` 한 뒤
//       node <이 파일> <저장소>/supabase
// 왜 저장소에 두나: 임시 폴더의 검사기는 두 번 증발했다(check_pages·check_polish 와 같은 이유).
// 008 마이그레이션 검증 — 실제 PostgreSQL(PGlite)에 001~008 을 그대로 깔고 돌린다.
// Supabase 가 해 주는 것(anon/authenticated 역할, auth.uid(), 요청 헤더)을 흉내 내고
// PostgREST 처럼 SET LOCAL ROLE + JWT 클레임을 걸어 함수를 부른다.
// 마지막에 일부러 망가뜨린 008 로 다시 돌려, 테스트가 그 망가짐을 잡는지 본다(뮤테이션).
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

const SUPA = process.argv[2];
const FILES = fs.readdirSync(SUPA).filter(f => /^00[1-7].*\.sql$/.test(f)).sort();
const F008  = fs.readdirSync(SUPA).find(f => /^008.*\.sql$/.test(f));

const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
-- Supabase 기본값 흉내: public 스키마의 새 함수는 anon·authenticated 에게 자동으로 열린다
alter default privileges in schema public grant execute on functions to anon, authenticated;
grant usage on schema public to anon, authenticated;
`;

const ADMIN = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const GHOST = "33333333-3333-4333-8333-333333333333";   // auth.users 에도 없다

async function build(sql008) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  for (const f of FILES) await db.exec(fs.readFileSync(path.join(SUPA, f), "utf8"));
  await db.exec(sql008);
  const res2 = await db.exec(sql008);                      // 두 번 — 멱등성
  db.__report = res2[res2.length - 1].rows;
  await db.exec(`insert into auth.users values ('${ADMIN}','admin@test.local'),('${OTHER}','other@test.local')`);
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
const ANON  = { role: "anon" };
const USER  = { role: "authenticated", sub: OTHER, email: "other@test.local" };
const GHST  = { role: "authenticated", sub: GHOST, email: "ghost@test.local" };
const ADM   = { role: "authenticated", sub: ADMIN, email: "admin@test.local" };
const j = r => (r.rows && r.rows[0]) ? Object.values(r.rows[0])[0] : null;

async function suite(db) {
  const R = [];
  const t = (name, ok, info = "") => R.push({ name, ok: !!ok, info });

  // ── 공개 키(anon)로는 운영자 함수에 손도 못 댄다 ─────────────
  for (const [fn, call] of [["admin_list", "select public.admin_list('pending', 10)"],
                            ["admin_set_status", "select public.admin_set_status('note', 1, 'approved')"],
                            ["admin_whoami", "select public.admin_whoami()"],
                            ["is_admin", "select public.is_admin()"]]) {
    const r = await as(db, ANON, call);
    t(`anon → ${fn} 거부(권한 없음)`, r.err && /permission denied/.test(r.err), r.err || JSON.stringify(r.rows));
  }
  for (const tb of ["admins", "moderation_log"]) {
    const r = await as(db, ANON, `select * from public.${tb}`);
    t(`anon → ${tb} 표 읽기 거부`, r.err && /permission denied/.test(r.err), r.err || "읽혔다");
    const r2 = await as(db, USER, `select * from public.${tb}`);
    t(`로그인 사용자 → ${tb} 표 읽기 거부`, r2.err && /permission denied/.test(r2.err), r2.err || "읽혔다");
  }

  // ── 로그인했어도 명단에 없으면 forbidden ─────────────────────
  for (const [lbl, who] of [["명단 밖 계정", USER], ["auth.users 에도 없는 토큰", GHST]]) {
    const a = j(await as(db, who, "select public.admin_list('pending', 10)"));
    t(`${lbl} → admin_list forbidden`, a && a.ok === false && a.reason === "forbidden", JSON.stringify(a));
    const b = j(await as(db, who, "select public.admin_set_status('note', 1, 'approved')"));
    t(`${lbl} → admin_set_status forbidden`, b && b.ok === false && b.reason === "forbidden", JSON.stringify(b));
  }
  const w0 = j(await as(db, USER, "select public.admin_whoami()"));
  t("명단 밖 계정 → whoami admin:false", w0 && w0.signed_in === true && w0.admin === false, JSON.stringify(w0));

  // ── 운영자 등록 → 통과 ───────────────────────────────────────
  await db.exec(`insert into public.admins (user_id, email) values ('${ADMIN}', 'admin@test.local')`);
  const w1 = j(await as(db, ADM, "select public.admin_whoami()"));
  t("운영자 → whoami admin:true·이메일", w1 && w1.admin === true && w1.email === "admin@test.local", JSON.stringify(w1));

  // ── 실제 글을 공개 통로로 넣는다 ─────────────────────────────
  const n1 = j(await as(db, ANON, "select public.submit_note(null,null,null,'홍천에서','오늘도 건강하세요')"));
  const pr = await db.query("select n from public.presets order by n limit 1");
  const chip = pr.rows.length ? pr.rows[0].n : null;
  const p1 = chip ? j(await as(db, ANON, `select public.submit_preset(${chip},null,null,null,'안동')`)) : null;
  const d1 = j(await as(db, ANON, "select public.submit_dream('꿈','무대에서 노래하기')"));
  await db.exec("insert into public.letters (name, body) values ('옛편지','오래전 편지입니다')");
  await db.exec("insert into public.posts (name, body) values ('옛글','오래전 글입니다')");
  t("공개 통로로 글이 들어간다(note·preset·dream)", n1?.ok && p1?.ok && d1?.ok,
    JSON.stringify({ n1, p1, d1 }));

  // ── 목록 ─────────────────────────────────────────────────────
  const L = j(await as(db, ADM, "select public.admin_list('pending', 50)"));
  const kinds = (L?.rows || []).map(x => x.kind).sort().join(",");
  t("운영자 → 대기 목록에 네 종류가 다 온다", L?.ok && kinds === "dream,letter,note,post", kinds);
  t("목록 본문이 content 로 맞춰져 있다", (L?.rows || []).every(x => typeof x.content === "string" && x.content.length > 1));
  t("대기 개수 4", L?.counts?.pending === 4, JSON.stringify(L?.counts));

  // ── 올리기 — read_at 은 건드리지 않는다 ─────────────────────
  const nid = (await db.query("select id from public.notes where body = '오늘도 건강하세요'")).rows[0].id;
  const s1 = j(await as(db, ADM, `select public.admin_set_status('note', ${nid}, 'approved')`));
  const after = (await db.query(`select status, read_at from public.notes where id = ${nid}`)).rows[0];
  t("운영자 → 올리기 ok (pending→approved)", s1?.ok && s1.from === "pending" && after.status === "approved", JSON.stringify(s1));
  t("올리기가 read_at('마지막으로 읽은 날')을 건드리지 않는다", after.read_at === null, String(after.read_at));
  const log1 = (await db.query(`select user_id, email, from_status, to_status from public.moderation_log where item_id = ${nid} and kind = 'note' order by id desc limit 1`)).rows[0];
  t("처리 기록에 누가·무엇을 남긴다", log1 && log1.user_id === ADMIN && log1.email === "admin@test.local"
    && log1.from_status === "pending" && log1.to_status === "approved", JSON.stringify(log1));

  const pub1 = (await db.query(`select count(*)::int c from public.public_notes where body = '오늘도 건강하세요'`)).rows[0].c;
  t("올린 글이 공개 뷰에 보인다", pub1 === 1, String(pub1));
  const s2 = j(await as(db, ADM, `select public.admin_set_status('note', ${nid}, 'rejected')`));
  const pub2 = (await db.query(`select count(*)::int c from public.public_notes where body = '오늘도 건강하세요'`)).rows[0].c;
  t("내리면 공개 뷰에서 사라지고 행은 남는다(되돌릴 수 있다)", s2?.ok && pub2 === 0
    && (await db.query(`select count(*)::int c from public.notes where id = ${nid}`)).rows[0].c === 1);

  // ── 잘못된 입력 ──────────────────────────────────────────────
  const e1 = j(await as(db, ADM, "select public.admin_set_status('note', 999999, 'approved')"));
  t("없는 번호 → not_found", e1?.reason === "not_found", JSON.stringify(e1));
  const e2 = j(await as(db, ADM, "select public.admin_set_status('notes; drop table public.notes; --', 1, 'approved')"));
  t("엉뚱한 종류(주입 시도) → bad_kind, 표 무사", e2?.reason === "bad_kind"
    && (await db.query("select to_regclass('public.notes') r")).rows[0].r !== null, JSON.stringify(e2));
  const e3 = j(await as(db, ADM, `select public.admin_set_status('note', ${nid}, 'deleted')`));
  t("엉뚱한 상태 → bad_status", e3?.reason === "bad_status", JSON.stringify(e3));
  const e4 = j(await as(db, ADM, "select public.admin_list('everything', 10)"));
  t("목록 엉뚱한 상태 → bad_status", e4?.reason === "bad_status", JSON.stringify(e4));

  // ── 내 글 지우기 ─────────────────────────────────────────────
  const n2 = j(await as(db, ANON, "select public.submit_note(null,null,null,null,'지울 글입니다')"));
  const w2 = j(await as(db, ANON, "select public.withdraw_note($1::uuid)", [n2.token]));
  const gone2 = (await db.query("select count(*)::int c from public.notes where body = '지울 글입니다'")).rows[0].c;
  t("검수 전 글 → 토큰으로 지운다", w2?.ok && w2.was === "pending" && gone2 === 0, JSON.stringify(w2));

  if (p1?.token) {
    const pubBefore = (await db.query("select count(*)::int c from public.public_notes where name = '안동'")).rows[0].c;
    const w3 = j(await as(db, ANON, "select public.withdraw_note($1::uuid)", [p1.token]));
    const pubAfter = (await db.query("select count(*)::int c from public.public_notes where name = '안동'")).rows[0].c;
    t("이미 올라간 글(칩) → 토큰으로 지운다 · 공개 뷰에서도 사라짐",
      pubBefore === 1 && w3?.ok && w3.was === "approved" && pubAfter === 0, JSON.stringify({ pubBefore, w3, pubAfter }));
  }
  const w4 = j(await as(db, ANON, "select public.withdraw_note('44444444-4444-4444-8444-444444444444'::uuid)"));
  t("남의/없는 토큰 → not_found", w4?.reason === "not_found", JSON.stringify(w4));
  const w5 = j(await as(db, ANON, "select public.withdraw_note(null)"));
  t("빈 토큰 → bad_token", w5?.reason === "bad_token", JSON.stringify(w5));
  const wl = (await db.query("select * from public.moderation_log where to_status = 'withdrawn' order by id")).rows;
  t("지운 기록은 번호·상태만, 사람·본문 없음", wl.length >= 1 && wl.every(x => x.user_id === null)
    && !Object.keys(wl[0]).some(k => /body|content|name|text/.test(k)), JSON.stringify(wl[0]));

  // ── 기존 동작 회귀: cancel_note 는 그대로 ───────────────────
  const n3 = j(await as(db, ANON, "select public.submit_note(null,null,null,null,'취소 회귀 확인')"));
  const c3 = j(await as(db, ANON, "select public.cancel_note($1::uuid)", [n3.token]));
  t("기존 cancel_note — 검수 전 글은 여전히 지운다", c3?.ok === true, JSON.stringify(c3));
  if (chip) {
    const p4 = j(await as(db, ANON, `select public.submit_preset(${chip},null,null,null,'회귀')`));
    const c4 = j(await as(db, ANON, "select public.cancel_note($1::uuid)", [p4.token]));
    t("기존 cancel_note — 올라간 글은 여전히 사실대로 거절", c4?.reason === "already_published", JSON.stringify(c4));
  }

  // ── 0번: 원본 표는 칸 단위로만 ──────────────────────────────
  for (const [who, lbl] of [[ANON, "공개 키"], [USER, "로그인만 한 사람"]]) {
    for (const [tb, col] of [["notes","token"],["notes","ai_reason"],["letters","ai_reason"],["posts","ai_verdict"],["dreams","ai_reason"]]) {
      const r = await as(db, who, `select ${col} from public.${tb} limit 1`);
      t(`${lbl} → ${tb}.${col} 못 읽음`, r.err && /permission denied/.test(r.err), r.err || "읽혔다");
    }
    const r2 = await as(db, who, "select * from public.notes limit 1");
    t(`${lbl} → notes 통째(select *) 못 읽음`, r2.err && /permission denied/.test(r2.err), r2.err || "읽혔다");
  }
  // 승인된 글을 하나 세워 두고 공개 뷰가 실제로 그 글을 내주는지 본다
  const nv = j(await as(db, ANON, "select public.submit_note(null,null,null,'뷰확인','공개 뷰 확인용')"));
  await db.exec("update public.notes set status='approved', read_at=now() where body='공개 뷰 확인용'");
  await db.exec("update public.notes set created_at = now() - interval '40 days' where body='공개 뷰 확인용'");
  await db.exec("insert into public.dreams (name, text, status) values ('뷰확인','공개 꿈', 'approved')");
  for (const v of ["public_notes","notes_filled","issue_notes","public_issues","sarangbang_state",
                   "public_letters","public_posts","public_dreams","public_cheers","song_tally","presets"]) {
    const r = await as(db, ANON, `select * from public.${v}`);
    t(`공개 키 → ${v} 그대로 읽힘`, !r.err, r.err || "");
  }
  const pn = await as(db, ANON, "select * from public.public_notes where body='공개 뷰 확인용'");
  t("공개 뷰가 승인된 글을 실제로 내준다", pn.rows && pn.rows.length === 1 && !("token" in pn.rows[0]), JSON.stringify(pn));
  const sb = await as(db, ANON, "select approved, last_read_at from public.sarangbang_state");
  t("사랑방 상태(승인 수·마지막으로 읽은 날)가 계산된다", sb.rows && sb.rows[0].approved >= 1 && sb.rows[0].last_read_at, JSON.stringify(sb));
  const iss = await as(db, ANON, "select * from public.issue_notes where body='공개 뷰 확인용'");
  t("지난 회차(issue_notes)에도 나온다", iss.rows && iss.rows.length === 1, JSON.stringify(iss.rows || iss.err));
  const own = await as(db, ANON, "select id, body from public.notes where body='공개 뷰 확인용'");
  t("원본 표의 공개 칸(id·body)은 승인 글만 읽힌다", own.rows && own.rows.length === 1, JSON.stringify(own));
  const pend = j(await as(db, ANON, "select public.submit_note(null,null,null,null,'검수 전 비공개')"));
  const own2 = await as(db, ANON, "select id from public.notes where body='검수 전 비공개'");
  t("검수 전 글은 원본 표로도 안 보인다", own2.rows && own2.rows.length === 0, JSON.stringify(own2));
  t("확인표 1~8 전부 ✅", (db.__report || []).filter(r => r.결과 === "✅").length === 8, JSON.stringify(db.__report));

  // ── 무차별 대입 막기 ─────────────────────────────────────────
  let last = null;
  for (let i = 0; i < 22; i++) {
    last = j(await as(db, ANON, "select public.withdraw_note(gen_random_uuid())", [], "198.51.100.9"));
  }
  t("한 IP 에서 시간당 20회를 넘기면 rate_limited", last?.reason === "rate_limited", JSON.stringify(last));

  return R;
}

const sql = fs.readFileSync(path.join(SUPA, F008), "utf8");
const db = await build(sql);
const res = await suite(db);
let fail = 0;
for (const r of res) { if (!r.ok) fail++; console.log(`${r.ok ? "  ✓" : "  ✗"} ${r.name}${r.ok ? "" : "  ← " + r.info}`); }
console.log(`\n본 검사: ${res.length - fail}/${res.length} 통과`);

// ── 뮤테이션 — 일부러 망가뜨려도 테스트가 잡는가 ───────────────
const MUT = [
  ["is_admin 이 항상 참",
    s => s.replace(/select auth\.uid\(\) is not null\s+and exists \(select 1 from public\.admins where user_id = auth\.uid\(\)\);/,
                   "select true;")],
  ["admin_list 를 anon 에게 열어 둠",
    s => s.replace("revoke execute on function public.admin_list(text, int)                 from public, anon;",
                   "grant execute on function public.admin_list(text, int) to anon;")],
  ["승인이 read_at 을 찍음",
    s => s.replace("if found then update public.notes set status = p_status where id = p_id; end if;",
                   "if found then update public.notes set status = p_status, read_at = now() where id = p_id; end if;")],
  ["withdraw_note 가 속도 제한을 건너뜀",
    s => s.replace("if not public.rate_ok('withdraw', 20) then", "if false then")],
  ["처리 기록을 남기지 않음",
    s => s.replace(/insert into public\.moderation_log \(user_id, email, kind, item_id, from_status, to_status\)\s+values \(auth\.uid\(\), auth\.jwt\(\) ->> 'email', p_kind, p_id, v_from, p_status\);/, "")],
];
MUT.push(
  ["토큰 칸을 닫지 않음(0번 통째 생략)",
    s => s.replace(/revoke select on public\.notes   from anon, authenticated;\s*grant  select \(id, song_key[^;]+;/, "")],
  ["공개 칸에서 body 를 빠뜨림(화면이 깨질 실수)",
    s => s.replace("name, city, body, kind,", "name, city, kind,")],
);
let caught = 0;
for (const [name, mut] of MUT) {
  const m = mut(sql);
  if (m === sql) { console.log(`  ? 뮤테이션 적용 실패: ${name}`); continue; }
  let built;
  try { built = await build(m); }
  catch (e) {
    caught++;
    const why = String(e.message || e).split("\n")[0].slice(0, 70);
    console.log(`  잡음 — ${name}  (안전장치가 전체 취소: ${why})`);
    continue;
  }
  const r = await suite(built);
  const broke = r.filter(x => !x.ok).map(x => x.name);
  if (broke.length) caught++;
  console.log(`  ${broke.length ? "잡음" : "★못 잡음"} — ${name}${broke.length ? "  (" + broke[0] + ")" : ""}`);
}
console.log(`뮤테이션: ${caught}/${MUT.length} 잡음`);
process.exit(fail || caught !== MUT.length ? 1 : 0);
