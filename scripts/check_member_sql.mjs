// 실행: 아무 빈 폴더에서 `npm i @electric-sql/pglite` 한 뒤
//       node <이 파일> <저장소>/supabase            (전부: 본 검사 + 순서 검사 + 010·011 검사 재실행 + 뮤테이션)
//       node <이 파일> <저장소>/supabase --quick    (010·011 검사 재실행과 뮤테이션을 건너뛴다)
//
// 013(마이페이지 · 가입 질문 '내 노래') 검증 — 실제 PostgreSQL(PGlite)에 001~012 를 순서대로 깔고 013 을 두 번(멱등) 실행한 뒤,
// 운영자·카카오 새싹·이메일 새싹·가입 안 한 계정·차단 회원·자연 등업 회원·글 많은 회원·공개 키(익명)로
// 가입 → 노래 고르기/바꾸기/지우기 → 글·댓글 상태 → 등업 진행 → 공연 도장 → 차단 → 속도 제한 → 탈퇴 → 다시 실행까지 돌린다.
// 숫자는 '함수가 준 값 = 표의 count(*)·board_settings 값'으로만 판정한다(지어낸 숫자를 잡으려고).
// 노래 목록은 assets/data/songs.json 과 한 칸씩 대조한다(지어낸 곡·빠진 곡·오타를 잡으려고).
// 011 이 없는 서버(001~010 → 013)와, 순서가 뒤바뀐 경우(010 → 013 → 011 → 012 → 013)·010 이 없는 경우도 돌린다.
// 이어서 010 검사(check_board_sql.mjs)·011 검사(check_concert_sql.mjs --quick)를 013 을 얹은 상태로 다시 돌린다.
// 마지막에 일부러 망가뜨린 013 으로 다시 돌려, 테스트(또는 SQL 의 안전장치)가 잡는지 본다.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SUPA = process.argv[2];
const QUICK = process.argv.includes("--quick");
if (!SUPA) { console.error("사용법: node check_member_sql.mjs <저장소>/supabase [--quick]"); process.exit(1); }
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALL = fs.readdirSync(SUPA).filter(f => /^0\d\d.*\.sql$/.test(f)).sort();
const UPTO9 = ALL.filter(f => /^00[1-9]/.test(f));
const UPTO10 = ALL.filter(f => /^0(0[1-9]|10)/.test(f));
const F011 = ALL.find(f => /^011/.test(f));
const F012 = ALL.find(f => /^012/.test(f));
const F013 = ALL.find(f => /^013/.test(f));
if (UPTO10.length !== 10 || !F011 || !F012 || !F013) { console.error("001~010 · 011 · 012 · 013 을 찾지 못했습니다:", ALL); process.exit(1); }
const read = f => fs.readFileSync(path.join(SUPA, f), "utf8");
const SONGS_PATH = path.join(SUPA, "..", "assets", "data", "songs.json");
const SONGS = JSON.parse(fs.readFileSync(SONGS_PATH, "utf8")).songs;

// Supabase 흉내 — check_board_sql.mjs · check_concert_sql.mjs 와 같다(새 함수가 anon·authenticated 에게 자동으로 열린다)
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
const OTHER  = "77777777-7777-4777-8777-777777777777";
const PAGER  = "88888888-8888-4888-8888-888888888888";
const RATE1  = "99999999-9999-4999-8999-000000000001";
const RATE2  = "99999999-9999-4999-8999-000000000002";

async function seedUsers(db) {
  await db.exec(`insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
    ('${ADMIN}', 'jake@test.local', '{"provider":"email"}', '{}'),
    ('${KAKAO}', null, '{"provider":"kakao"}', '{"nickname":"홍천팬"}'),
    ('${MAIL}',  'abcdef@test.local', '{"provider":"email"}', '{}'),
    ('${NOJOIN}', 'nojoin@test.local', '{"provider":"email"}', '{}'),
    ('${BLOCK}', 'block@test.local', '{"provider":"email"}', '{}'),
    ('${OTHER}', null, '{"provider":"kakao"}', '{}'),
    ('${PAGER}', null, '{"provider":"kakao"}', '{}'),
    ('${RATE1}', null, '{"provider":"kakao"}', '{}'),
    ('${RATE2}', null, '{"provider":"kakao"}', '{}');
    insert into public.admins (user_id, email, memo) values ('${ADMIN}', 'jake@test.local', '시험');`);
}

async function fresh(files) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  for (const f of files) await db.exec(read(f));
  return db;
}

//  g=true: 001~012(운영과 같은 순서) → 013 ×2 · g=false: 001~010 → 013 ×2(011 없음)
async function build(sql013, g = true) {
  const db = await fresh(g ? [...UPTO10, F011, F012] : UPTO10);
  await seedUsers(db);
  // 운영 DB 처럼 기존 대기 글이 있는 상태(010·011 검사와 같은 이유)
  await db.exec(`insert into public.notes (body, status) values ('기존 대기 한 줄', 'pending');`);
  await db.exec(sql013);
  const r2 = await db.exec(sql013);                       // 두 번 — 멱등성
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
const OT  = { role: "authenticated", sub: OTHER };
const PG  = { role: "authenticated", sub: PAGER };
const R1  = { role: "authenticated", sub: RATE1 };
const R2  = { role: "authenticated", sub: RATE2 };
const j = r => (r.rows && r.rows[0]) ? Object.values(r.rows[0])[0] : (r.err ? { __err: r.err } : null);
const call = async (db, who, fn, args = [], ip) => j(await as(db, who, `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as v`, args, ip));
const denied = r => !!(r && r.__err && /permission denied/.test(r.__err));
const ks = o => (o && typeof o === "object") ? Object.keys(o).sort().join(",") : String(o);
const kl = list => [...list].sort().join(",");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const verOf = async (db, id) => (await db.query("select coalesce(edited_at, created_at)::text as v from public.board_posts where id = $1", [id])).rows[0]?.v ?? null;
const approveB = async (db, id) => call(db, ADM, "admin_set_status", ["bpost", id, "approved", await verOf(db, id)]);
const rejectB  = async (db, id) => call(db, ADM, "admin_set_status", ["bpost", id, "rejected", null]);
const approveC = async (db, id) => call(db, ADM, "admin_set_status", ["comment", id, "approved", null]);
const rejectC  = async (db, id) => call(db, ADM, "admin_set_status", ["comment", id, "rejected", null]);
const H = 3600e3;
const iso = ms => new Date(Date.now() + ms).toISOString();

// 화면 구현자와 맞춘 칸 — 바뀌면 화면이 깨지므로 정확히 대조한다
const PAGE_KEYS = kl(["ok", "joined", "nickname", "level", "admin", "auto_up", "levelup", "provider", "joined_at",
  "posts_ok", "comments_ok", "posts_pending", "need_posts", "need_comments", "song", "counts", "posts", "comments", "gigs", "stamps"]);
const POST_KEYS = kl(["id", "board", "title", "status", "created_at", "edited_at", "comments", "gig"]);
const CMT_KEYS  = kl(["id", "body", "status", "created_at", "post_id", "post_visible", "post_title", "post_board", "post_mine"]);
const SONG_KEYS = kl(["k", "title", "year", "at"]);
const ADM_ROW_KEYS = kl(["user_id", "nickname", "level", "k", "title", "year", "at"]);
// 010 이 정한 공개 칸(013 이 아무것도 더하지 않았는지)
const BL_ROW_KEYS = kl(["id", "board", "title", "excerpt", "cut", "nickname", "level", "staff", "created_at", "edited_at", "comments", "mine"]);
const BR_POST_KEYS = kl(["id", "board", "title", "body", "status", "created_at", "edited_at", "nickname", "level", "staff", "mine"]);
const BR_CMT_KEYS = kl(["id", "body", "status", "created_at", "nickname", "level", "staff", "mine"]);
const ME_SHARED = ["joined", "nickname", "level", "admin", "auto_up", "provider", "posts_ok", "comments_ok", "posts_pending", "need_posts", "need_comments", "joined_at"];

class Caught extends Error {}

async function suite(db, { g = true, stopEarly = false } = {}) {
  const R = [];
  const t = (name, ok, info = "") => {
    let s; try { s = typeof info === "string" ? info : JSON.stringify(info); } catch { s = String(info); }
    R.push({ name: (g ? "" : "[011 없음] ") + name, ok: !!ok, info: s || "" });
    if (stopEarly && !ok) throw new Caught((g ? "" : "[011 없음] ") + name);
  };
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const one = async (sql, p = []) => { const r = (await db.query(sql, p)).rows[0]; return r ? Object.values(r)[0] : undefined; };
  const join = (who, nick, n) => call(db, who, "member_join", [nick, true, true], `198.51.100.${n}`);
  const page = who => call(db, who, "member_page");
  const setSong = (who, s, ip) => call(db, who, "member_set_song", [s], ip);
  const truth = async uid => (await q(`select
      (select count(*) from public.board_posts    where user_id = $1 and status = 'approved')::int as po,
      (select count(*) from public.board_comments where user_id = $1 and status = 'approved')::int as co,
      (select count(*) from public.board_posts    where user_id = $1 and status = 'pending')::int  as pp,
      (select value from public.board_settings where key = 'levelup_posts')    as np,
      (select value from public.board_settings where key = 'levelup_comments') as nc`, [uid]))[0];
  const honest = (p, tr) => p && p.posts_ok === tr.po && p.comments_ok === tr.co && p.posts_pending === tr.pp
                             && p.need_posts === tr.np && p.need_comments === tr.nc;
  const countsTruth = async uid => {
    const c = async (tb, st) => one(`select count(*)::int from public.${tb} where user_id = $1${st ? " and status = '" + st + "'" : ""}`, [uid]);
    return { posts: { total: await c("board_posts"), pending: await c("board_posts", "pending"), approved: await c("board_posts", "approved"), rejected: await c("board_posts", "rejected") },
             comments: { total: await c("board_comments"), pending: await c("board_comments", "pending"), approved: await c("board_comments", "approved"), rejected: await c("board_comments", "rejected") } };
  };
  const songRow = async uid => (await q(`select k from public.member_songs where user_id = $1`, [uid]));
  const postById = (p, id) => p?.posts?.rows?.find(r => r.id === id);
  const cmtById = (p, id) => p?.comments?.rows?.find(r => r.id === id);
  let v, w;

  // ── A. 설치 · 잠금 ──────────────────────────────────────────
  const rep = db.__report || [];
  t("확인표 ✅ 8 · ❌ 0", rep.filter(r => r["결과"] === "✅").length === 8 && !rep.some(r => r["결과"] === "❌"), rep);
  t(g ? "확인표 ℹ️: 다녀온 공연 도장 011 연결됨" : "확인표 ℹ️: 011 이 아직 없어 도장 칸만 비어 있음",
    rep.some(r => r["결과"] === "ℹ️" && r["점검"].includes(g ? "011 연결됨" : "011 이 아직 없어")), rep);
  t("확인표 ℹ️: 내 노래를 고른 회원 0명 · 회원 0명(실제 수)", rep.some(r => r["결과"] === "ℹ️" && r["점검"] === "내 노래를 고른 회원 0명 · 회원 0명"), rep);

  for (const tb of ["member_song_choices", "member_songs"]) {
    const privs = ["SELECT", "INSERT", "UPDATE", "DELETE"];
    const r = (await q(`select c.relrowsecurity as rls,
        (select count(*) from pg_policy p where p.polrelid = c.oid)::int as pol,
        ${privs.map(p => `has_table_privilege('anon', 'public.${tb}', '${p}')`).join(" or ")} as anon_any,
        ${privs.map(p => `has_table_privilege('authenticated', 'public.${tb}', '${p}')`).join(" or ")} as auth_any
      from pg_class c where c.oid = 'public.${tb}'::regclass`))[0];
    t(`${tb}: RLS 켜짐 · 정책 0 · 공개/로그인 표 권한 0`, r && r.rls && r.pol === 0 && !r.anon_any && !r.auth_any, r);
  }

  // 함수 권한 행렬 [시그니처, 공개 키, 로그인] — PUBLIC 은 언제나 막혀야 한다
  const FN = [
    ["member_page()", false, true], ["member_set_song(text)", false, true],
    ["member_my_posts(bigint,integer)", false, true], ["member_my_comments(bigint,integer)", false, true],
    ["admin_member_songs(integer)", false, true], ["member_gigs_ready()", false, false],
  ];
  for (const [sig, a, u] of FN) {
    const r = (await q(`select has_function_privilege('anon', 'public.${sig}', 'EXECUTE') as a,
                               has_function_privilege('authenticated', 'public.${sig}', 'EXECUTE') as u,
                               has_function_privilege('public', 'public.${sig}', 'EXECUTE') as p`))[0];
    t(`권한 ${sig}: 공개 ${a ? "열림" : "막힘"} · 로그인 ${u ? "열림" : "막힘"} · PUBLIC 막힘`, r && r.a === a && r.u === u && r.p === false, r);
  }
  const defs = await q(`select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ';'), '') as cfg
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('member_page', 'member_set_song', 'member_my_posts', 'member_my_comments', 'admin_member_songs', 'member_gigs_ready')`);
  t("새 함수 6개 전부 security definer + search_path=public, pg_temp · 한 판씩",
    defs.length === 6 && defs.every(d => d.prosecdef && d.cfg === "search_path=public, pg_temp"), defs);
  t("010 가입 함수 member_join 은 인자 셋 한 판 그대로(로그인 열림 · 공개 막힘)",
    (await one(`select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname = 'member_join'`)) === 1
    && (await one(`select has_function_privilege('authenticated', 'public.member_join(text,boolean,boolean)', 'EXECUTE')
                      and not has_function_privilege('anon', 'public.member_join(text,boolean,boolean)', 'EXECUTE')`)) === true);
  if (g) t("011 내 도장 함수 gig_my_stamps() 그대로 한 판", (await one(`select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace and proname = 'gig_my_stamps'`)) === 1);

  // 노래 목록 = songs.json (한 칸씩)
  const choices = await q(`select k, title, year::int as year, sort::int as sort from public.member_song_choices order by sort`);
  const want = SONGS.map((s, i) => ({ k: s.k, title: s.t, year: Number(s.y), sort: i + 1 }));
  const diff = [];
  for (let i = 0; i < Math.max(choices.length, want.length); i++) if (!same(choices[i], want[i])) diff.push([choices[i], want[i]]);
  t(`노래 목록 = songs.json ${want.length}곡(k·제목·연도·순서 한 칸씩)`, want.length === 103 && choices.length === 103 && diff.length === 0, diff.slice(0, 3));
  if (g) {
    const off = await q(`select song from public.gig_vote_songs where song not in (select title from public.member_song_choices)`);
    const n012 = await one(`select count(*)::int from public.gig_vote_songs v join public.gig_events e on e.id = v.event_id where e.code = '5UYX8'`);
    t("012 진해 공연 투표 후보 6곡이 모두 정본 목록 안에(같은 songs.json 에서 나왔는지)", n012 === 6 && off.length === 0, { n012, off });
  }
  const fk = await q(`select c.conname, c.confrelid::regclass::text as ref, c.confdeltype, c.confupdtype from pg_constraint c
                       where c.contype = 'f' and c.conrelid = 'public.member_songs'::regclass order by c.conname`);
  t("내 노래 FK: 회원 on delete cascade · 노래 목록 on update cascade(지우기는 막힘) — 각 하나",
    fk.length === 2 && fk.some(f => f.ref === "members" && f.confdeltype === "c") && fk.some(f => f.ref === "member_song_choices" && f.confdeltype === "a" && f.confupdtype === "c"), fk);

  // ── B. 공개 키 ─────────────────────────────────────────────
  const anonCalls = [["member_page", []], ["member_set_song", ["거위의 꿈"]], ["member_my_posts", [null, 5]],
                     ["member_my_comments", [null, 5]], ["admin_member_songs", [10]], ["member_gigs_ready", []]];
  for (const [fn, args] of anonCalls) t(`공개 키 ${fn} → permission denied`, denied(await call(db, ANON, fn, args)));
  for (const tb of ["member_song_choices", "member_songs"]) {
    const ra = await as(db, ANON, `select * from public.${tb} limit 1`);
    t(`공개 키로 ${tb} 직접 읽기 막힘`, /permission denied/.test(ra.err || ""), ra.err || ra.rows);
  }

  // ── C. 로그인 역할 · 토큰 없음 ─────────────────────────────
  t("토큰 없음: member_page → not_logged_in", (await call(db, NOTOKEN, "member_page"))?.reason === "not_logged_in");
  t("토큰 없음: member_set_song → not_logged_in", (await call(db, NOTOKEN, "member_set_song", ["거위의 꿈"]))?.reason === "not_logged_in");
  t("토큰 없음: member_my_posts → not_logged_in", (await call(db, NOTOKEN, "member_my_posts", [null, 5]))?.reason === "not_logged_in");
  t("토큰 없음: member_my_comments → not_logged_in", (await call(db, NOTOKEN, "member_my_comments", [null, 5]))?.reason === "not_logged_in");
  t("토큰 없음: admin_member_songs → forbidden", (await call(db, NOTOKEN, "admin_member_songs", [10]))?.reason === "forbidden");
  t("토큰 없음: 도우미 member_gigs_ready → permission denied", denied(await call(db, NOTOKEN, "member_gigs_ready")));

  // ── D. 로그인했지만 가입 전 ─────────────────────────────────
  t("가입 전: member_page → not_member", (await page(NJ))?.reason === "not_member");
  t("가입 전: member_set_song → not_member(표에 아무것도 안 생김)", (await setSong(NJ, "거위의 꿈"))?.reason === "not_member"
    && (await songRow(NOJOIN)).length === 0);
  t("가입 전: member_my_posts · member_my_comments → not_member",
    (await call(db, NJ, "member_my_posts", [null, 5]))?.reason === "not_member" && (await call(db, NJ, "member_my_comments", [null, 5]))?.reason === "not_member");

  // ── E. 가입 → 첫 마이페이지 ─────────────────────────────────
  t("카카오 새싹 가입(010 member_join 인자 셋 그대로)", (await join(KA, "홍천팬", 1))?.ok === true);
  t("운영자 · 이메일 · 차단될 · 등업될 · 글 많은 회원 가입",
    [await join(ADM, "사랑방지기", 2), await join(ML, "메일팬", 3), await join(BL, "차단될팬", 4), await join(OT, "등업될팬", 5), await join(PG, "많이쓴팬", 6)].every(x => x?.ok === true));
  v = await page(KA);
  t("첫 마이페이지: 칸이 정해진 20개", ks(v) === PAGE_KEYS, ks(v));
  t("첫 마이페이지: 새싹 · 자동 등업 대상 · 카카오 · 운영자 아님 · 방금 등업 아님",
    v?.ok === true && v.joined === true && v.nickname === "홍천팬" && v.level === "sprout" && v.auto_up === true && v.levelup === false
    && v.provider === "kakao" && v.admin === false, v);
  t("첫 마이페이지: 내 노래 없음(null) · 글·댓글 0 · 더 보기 없음",
    v?.song === null && same(v.posts, { ok: true, rows: [], more: false }) && same(v.comments, { ok: true, rows: [], more: false }), [v?.song, v?.posts, v?.comments]);
  t("첫 마이페이지: 건수 전부 0", same(v?.counts, { posts: { total: 0, pending: 0, approved: 0, rejected: 0 }, comments: { total: 0, pending: 0, approved: 0, rejected: 0 } }), v?.counts);
  t("첫 마이페이지: 등업 진행 0/3 · 0/5 — board_settings 그대로", honest(v, await truth(KAKAO)) && v.need_posts === 3 && v.need_comments === 5, v);
  t(g ? "첫 마이페이지: 공연 연결됨 · 도장 = gig_my_stamps 그대로(빈 목록)" : "첫 마이페이지: 공연 칸 false · 도장 null",
    g ? (v?.gigs === true && same(v.stamps, { ok: true, rows: [] })) : (v?.gigs === false && v?.stamps === null), [v?.gigs, v?.stamps]);
  w = await call(db, KA, "member_me");
  t("마이페이지의 공통 칸 = member_me(010) 와 같은 값", ME_SHARED.every(k => same(v?.[k], w?.[k])), ME_SHARED.filter(k => !same(v?.[k], w?.[k])).map(k => [k, v?.[k], w?.[k]]));
  v = await page(ADM);
  t("운영자 마이페이지: 정회원 · 운영자 · 자동 등업 대상 아님", v?.level === "member" && v.admin === true && v.auto_up === false && v.provider === "email", v);

  // ── F. 내 노래 고르기 · 바꾸기 · 지우기 ──────────────────────
  v = await setSong(KA, "거위의 꿈");
  t("정본 제목으로 고르기 → {k, title, year}", v?.ok === true && same(v.song, { k: "거위의꿈", title: "거위의 꿈", year: 2007 }), v);
  v = await setSong(KA, "밤이면밤마다");
  t("k 로 고르기 → 정본 제목으로 돌려줌", v?.ok === true && v.song?.title === "밤이면 밤마다" && v.song?.k === "밤이면밤마다" && v.song?.year === 1983, v);
  v = await setSong(KA, "  Last   Night In My Dream ");
  t("앞뒤 빈칸·겹친 빈칸은 하나로 → 정본 제목", v?.ok === true && v.song?.title === "Last Night In My Dream", v);
  v = await setSong(KA, "Miss나비를 찾아서");
  w = await setSong(KA, "사랑, 그 에필로그");
  t("영문 섞인 제목 · 쉼표 든 제목도 그대로", v?.song?.k === "miss나비를찾아서" && w?.ok === true && w.song?.k === "사랑그에필로그", [v, w]);
  t("여러 번 바꿔도 한 사람 한 줄", (await songRow(KAKAO)).length === 1 && (await songRow(KAKAO))[0].k === "사랑그에필로그");
  const BAD = ["거위의 꿈2", "거위의꿈!", "Let It Be", "인순이", "LASTNIGHTINMYDREAM", "x".repeat(81), "'; drop table public.member_songs; --", "거위", "꿈"];
  const bad = [];
  for (const s of BAD) bad.push((await setSong(KA, s))?.reason ?? "ok?");
  t("목록 밖 이름 9가지 → 전부 bad_song(비슷한 곡으로 바꿔 넣지 않음)", bad.every(r => r === "bad_song"), bad);
  t("틀린 이름 뒤에도 내 노래는 그대로", (await songRow(KAKAO))[0]?.k === "사랑그에필로그"
    && (await one(`select count(*)::int from public.member_song_choices`)) === 103);
  v = await setSong(KA, "");
  t("빈 값 → 지움(답은 선택)", v?.ok === true && v.song === null && (await songRow(KAKAO)).length === 0, v);
  await setSong(KA, "아버지");
  v = await setSong(KA, null);
  t("null → 지움", v?.ok === true && v.song === null && (await songRow(KAKAO)).length === 0, v);
  v = await setSong(KA, "  ");
  t("빈칸만 → 지움(이미 없어도 ok)", v?.ok === true && v.song === null, v);
  await setSong(KA, "거위의 꿈");
  v = await page(KA);
  t("마이페이지 내 노래 = {k, title, year, at}", ks(v?.song) === SONG_KEYS && v.song.title === "거위의 꿈" && v.song.k === "거위의꿈" && v.song.year === 2007
    && typeof v.song.at === "string", v?.song);
  t("이메일 회원 · 차단될 회원도 고름", (await setSong(ML, "거위의 꿈"))?.ok === true && (await setSong(BL, "아버지"))?.ok === true);

  // ── G. 운영자 — 회원별 내 노래 ───────────────────────────────
  t("회원이 운영자 노래 명단 → forbidden", (await call(db, KA, "admin_member_songs", [100]))?.reason === "forbidden");
  v = await call(db, ADM, "admin_member_songs", [100]);
  const truthRows = await q(`select s.user_id::text as user_id, s.k from public.member_songs s order by s.user_id`);
  t("운영자 명단: 고른 회원만 · 실제 표와 같은 사람·같은 곡", v?.ok === true && same(v.rows.map(r => [r.user_id, r.k]).sort(), truthRows.map(r => [r.user_id, r.k]).sort())
    && v.rows.length === 3 && !v.rows.some(r => [ADMIN, OTHER, PAGER].includes(r.user_id)), v?.rows);
  t("운영자 명단 행 칸: user_id·별명·등급·k·제목·연도·시각", v?.rows?.every(r => ks(r) === ADM_ROW_KEYS)
    && v.rows.find(r => r.user_id === KAKAO)?.nickname === "홍천팬" && v.rows.find(r => r.user_id === KAKAO)?.title === "거위의 꿈", v?.rows?.[0]);
  t("운영자 집계 tally = 곡별 count(*) · 많은 순(거위의 꿈 2 · 아버지 1)",
    same(v?.tally, [{ k: "거위의꿈", title: "거위의 꿈", n: 2 }, { k: "아버지", title: "아버지", n: 1 }]), v?.tally);
  t("운영자 counts = 회원 수 · 고른 수(count(*))",
    v?.counts?.members === await one(`select count(*)::int from public.members`) && v?.counts?.with_song === await one(`select count(*)::int from public.member_songs`), v?.counts);
  t("운영자 명단 p_limit 1 → 한 줄(최대치를 지킴)", (await call(db, ADM, "admin_member_songs", [1]))?.rows?.length === 1);

  // ── H. 글 상태 · 댓글 · 남의 것 ─────────────────────────────
  const wr = async (who, title, ip) => (await call(db, who, "board_write", ["free", title, "본문입니다 " + title], ip))?.id;
  const p1 = await wr(KA, "첫 글"), p2 = await wr(KA, "둘째 글"), p3 = await wr(KA, "셋째 글");
  await approveB(db, p1); await rejectB(db, p2);
  const mp1 = await wr(ML, "메일팬의 글"); await approveB(db, mp1);
  const ap1 = await wr(ADM, "사랑방지기의 글");
  t("글 준비(새싹 셋 · 이메일 하나 · 운영자 하나)", [p1, p2, p3, mp1, ap1].every(Boolean), [p1, p2, p3, mp1, ap1]);
  v = await page(KA);
  t("내 글 상태: 공개 · 내려짐 · 확인 중 그대로", postById(v, p1)?.status === "approved" && postById(v, p2)?.status === "rejected" && postById(v, p3)?.status === "pending", v?.posts);
  t("내 글 행 칸: id·게시판·제목·상태·시각·고친 시각·댓글 수·공연", v?.posts?.rows?.length === 3 && v.posts.rows.every(r => ks(r) === POST_KEYS), v?.posts?.rows?.[0]);
  t("내 글은 최신순 · 내 것만", same(v?.posts?.rows?.map(r => r.id), [p3, p2, p1]) && postById(v, p1)?.board === "free" && postById(v, p1)?.title === "첫 글");
  t("내 글 건수 = count(*)(전체 3 · 확인 중 1 · 공개 1 · 내려짐 1)", same(v?.counts, await countsTruth(KAKAO)) && v.counts.posts.total === 3 && v.counts.posts.rejected === 1, v?.counts);
  t("등업 진행 정직: 공개된 글만 1/3(확인 중·내려짐은 세지 않음)", honest(v, await truth(KAKAO)) && v.posts_ok === 1 && v.posts_pending === 1, v);

  const c1 = (await call(db, KA, "comment_write", [mp1, "메일팬 글에 단 댓글"]))?.id;
  const c2 = (await call(db, KA, "comment_write", [ap1, "운영자 글에 단 댓글"]))?.id;
  const c3 = (await call(db, KA, "comment_write", [p1, "내 글에 단 댓글"]))?.id;
  await approveC(db, c1); await approveC(db, c3);
  v = await page(KA);
  t("내 댓글 행 칸: id·본문·상태·시각·글 번호·볼 수 있나·글 제목·게시판·내 글인가", v?.comments?.rows?.length === 3 && v.comments.rows.every(r => ks(r) === CMT_KEYS), v?.comments?.rows?.[0]);
  t("내 댓글: 어느 글에 단 것인지(제목) · 상태", cmtById(v, c1)?.post_title === "메일팬의 글" && cmtById(v, c1)?.post_id === mp1 && cmtById(v, c1)?.status === "approved"
    && cmtById(v, c2)?.status === "pending" && cmtById(v, c2)?.post_title === "사랑방지기의 글" && cmtById(v, c3)?.post_mine === true && cmtById(v, c1)?.post_mine === false
    && cmtById(v, c1)?.body === "메일팬 글에 단 댓글", v?.comments?.rows);
  t("내 댓글은 최신순", same(v?.comments?.rows?.map(r => r.id), [c3, c2, c1]));
  t("등업 진행 정직: 공개된 댓글만 2/5", honest(v, await truth(KAKAO)) && v.comments_ok === 2, v);
  const mc = (await call(db, ML, "comment_write", [p1, "메일팬이 홍천팬 글에"]))?.id;
  v = await page(KA);
  t("내 글의 댓글 수 = 공개된 댓글만(남의 확인 중 댓글은 세지 않음)", postById(v, p1)?.comments === 1
    && postById(v, p1)?.comments === await one(`select count(*)::int from public.board_comments where post_id = $1 and status = 'approved'`, [p1]), postById(v, p1));
  await approveC(db, mc);
  t("남의 댓글이 공개되면 댓글 수 +1", postById(await page(KA), p1)?.comments === 2);
  await call(db, ML, "board_edit", [mp1, "free", "메일팬의 고친 글", "고친 본문입니다"]);
  v = await page(KA);
  t("남의 글이 고쳐져 다시 확인 중 → 내 댓글에 제목·게시판을 싣지 않음(본문·상태는 그대로)",
    cmtById(v, c1)?.post_visible === false && cmtById(v, c1)?.post_title === null && cmtById(v, c1)?.post_board === null
    && cmtById(v, c1)?.body === "메일팬 글에 단 댓글" && cmtById(v, c1)?.status === "approved" && cmtById(v, c1)?.post_id === mp1, cmtById(v, c1));
  await rejectB(db, mp1);
  t("남의 글이 내려짐 → 여전히 제목 없음", (await page(KA)) && cmtById(await page(KA), c1)?.post_visible === false && cmtById(await page(KA), c1)?.post_title === null);
  await approveB(db, mp1);
  t("다시 공개 → 고친 제목이 보임", cmtById(await page(KA), c1)?.post_visible === true && cmtById(await page(KA), c1)?.post_title === "메일팬의 고친 글");
  await rejectB(db, p1);
  v = await page(KA);
  t("내 글이 내려져도 거기 단 내 댓글은 제목이 보임(내 글이니까)", cmtById(v, c3)?.post_visible === true && cmtById(v, c3)?.post_title === "첫 글" && postById(v, p1)?.status === "rejected", [cmtById(v, c3), postById(v, p1)]);
  await rejectC(db, c2);
  v = await page(KA);
  t("내 댓글 건수 = count(*)(공개 1 · 내려짐 1 …)", same(v?.counts, await countsTruth(KAKAO)) && v.counts.comments.rejected === 1, v?.counts);
  t("내 글이 내려지면 등업 숫자도 그만큼(0/3)", honest(v, await truth(KAKAO)) && v.posts_ok === 0, v);

  // 남의 것
  const idsOf = async (tb, uid) => (await q(`select id::int as id from public.${tb} where user_id = $1 order by id desc`, [uid])).map(r => r.id);
  v = await page(KA);
  t("홍천팬 마이페이지: 글·댓글이 전부 내 것(표의 내 id 와 같음)", same(v?.posts?.rows?.map(r => r.id), await idsOf("board_posts", KAKAO))
    && same(v?.comments?.rows?.map(r => r.id), await idsOf("board_comments", KAKAO)));
  w = await page(ML);
  t("메일팬 마이페이지: 내 것만 · 홍천팬 것 없음 · 내 노래는 메일팬 것", same(w?.posts?.rows?.map(r => r.id), await idsOf("board_posts", MAIL))
    && same(w?.comments?.rows?.map(r => r.id), await idsOf("board_comments", MAIL)) && w?.song?.k === "거위의꿈"
    && !w.posts.rows.some(r => [p1, p2, p3].includes(r.id)), [w?.posts, w?.comments]);
  w = await page(ADM);
  t("운영자 마이페이지도 운영자 것만(남의 글·노래 없음)", same(w?.posts?.rows?.map(r => r.id), [ap1]) && w?.comments?.rows?.length === 0 && w?.song === null, w);
  w = await page(OT);
  t("노래를 안 고른 회원의 마이페이지 → song null(남의 노래가 새지 않음)", w?.ok === true && w.song === null, w?.song);
  t("member_my_posts · member_my_comments 단독 = 마이페이지의 첫 쪽",
    same(await call(db, KA, "member_my_posts", [null, 20]), (await page(KA))?.posts) && same(await call(db, KA, "member_my_comments", [null, 20]), (await page(KA))?.comments));

  // 공개 화면에는 아무것도 더해지지 않았다(내 노래는 공개되지 않는다)
  v = await call(db, ANON, "board_list", [null, null, 50]);
  t("공개 board_list 칸 그대로(010) · 노래 칸 없음", ks(v) === "more,notices,ok,rows" && v.rows.length > 0 && v.rows.every(r => ks(r) === BL_ROW_KEYS)
    && !/"(song|k|year)"\s*:/.test(JSON.stringify(v)), v?.rows?.[0]);
  v = await call(db, ANON, "board_read", [mp1]);
  t("공개 board_read 칸 그대로(010) · 노래 칸 없음", v?.ok === true && ks(v.post) === BR_POST_KEYS && v.comments.length > 0 && v.comments.every(c => ks(c) === BR_CMT_KEYS)
    && !/"(song|k|year)"\s*:/.test(JSON.stringify(v)), v);
  t("공개 cafe_info 칸 그대로(010)", ks(await call(db, ANON, "cafe_info")) === "members,ok,posts");

  // ── I. 등업 진행 — 숫자는 표와 기준값 그대로 ─────────────────
  await approveB(db, p1);
  v = await page(KA);
  t("기준 못 채움(1/3 · 2/5) → 마이페이지를 열어도 새싹 그대로", v?.level === "sprout" && v.levelup === false && honest(v, await truth(KAKAO)) && v.posts_ok === 1 && v.comments_ok === 2, v);
  await db.exec(`update public.board_settings set value = 7 where key = 'levelup_posts'`);
  v = await page(KA);
  t("기준값을 7 로 바꾸면 화면도 1/7(지어내지 않고 board_settings 를 읽음)", v?.need_posts === 7 && honest(v, await truth(KAKAO)), v);
  await db.exec(`update public.board_settings set value = 1 where key = 'levelup_posts'; update public.board_settings set value = 2 where key = 'levelup_comments';`);
  const logBefore = await one(`select count(*)::int from public.member_level_log where target = $1`, [KAKAO]);
  v = await page(KA);
  t("기준을 낮춰 이미 채운 새싹 → 마이페이지를 열면 010 규칙으로 정회원(levelup true · 기록 1줄 auto)",
    v?.level === "member" && v.levelup === true && v.auto_up === true
    && (await one(`select count(*)::int from public.member_level_log where target = $1 and why = 'auto' and to_level = 'member'`, [KAKAO])) === logBefore + 1, v);
  w = await page(KA);
  t("한 번 더 열면 levelup false(두 번 올리지 않음) · 기록도 그대로", w?.level === "member" && w.levelup === false
    && (await one(`select count(*)::int from public.member_level_log where target = $1`, [KAKAO])) === logBefore + 1, w);
  t("member_me(010) 도 같은 등급", (await call(db, KA, "member_me"))?.level === "member");
  // 운영자가 정한 등급은 자동이 덮어쓰지 않는다
  await call(db, ADM, "admin_set_level", [MAIL, "sprout"]);
  await db.exec(`update public.board_settings set value = 1 where key = 'levelup_comments'`);
  v = await page(ML);
  t("운영자가 정한 새싹(level_by=admin) → 기준을 채워도 그대로 · auto_up false", v?.level === "sprout" && v.auto_up === false && v.levelup === false
    && v.posts_ok >= 1 && v.comments_ok >= 1 && honest(v, await truth(MAIL)), v);
  await db.exec(`update public.board_settings set value = 3 where key = 'levelup_posts'; update public.board_settings set value = 5 where key = 'levelup_comments';`);
  // 자연 등업: 공개된 글 3 + 댓글 5
  const op = [];
  for (let i = 0; i < 3; i++) { const id = await wr(OT, `등업될팬 글 ${i + 1}`); op.push(id); await approveB(db, id); }
  const oc = [];
  for (let i = 0; i < 5; i++) oc.push((await call(db, OT, "comment_write", [ap1, `등업될팬 댓글 ${i + 1}`]))?.id);
  for (let i = 0; i < 4; i++) await approveC(db, oc[i]);
  v = await page(OT);
  t("자연 등업 전: 3/3 · 4/5 · 새싹(하나 모자라면 올리지 않음)", v?.level === "sprout" && v.posts_ok === 3 && v.comments_ok === 4 && v.need_posts === 3 && v.need_comments === 5
    && honest(v, await truth(OTHER)) && v.levelup === false, v);
  w = await approveC(db, oc[4]);
  v = await page(OT);
  t("다섯째 댓글 공개 → 010 이 올림 · 마이페이지 3/3 · 5/5 · 정회원(levelup 은 이미 올라 false)", w?.levelup === true && v?.level === "member" && v.posts_ok === 3
    && v.comments_ok === 5 && v.levelup === false && honest(v, await truth(OTHER)), [w, v]);

  // ── J. 공연 도장 · 방명록 꼬리표 ───────────────────────────
  if (g) {
    v = await call(db, ADM, "admin_gig_save", [JSON.stringify({ title_ko: "시험 공연 — 서울", title_en: "Test concert — Seoul", venue_ko: "시험 홀", venue_en: "Test Hall",
      starts_at: iso(0.5 * H), opens_at: iso(-1 * H), closes_at: iso(2 * H), guest_until: iso(24 * H), status: "published", songs: ["거위의 꿈", "아버지"] })]);
    const code = v?.code;
    t("시험 공연 만들기(011)", v?.ok === true && /^[2-9A-HJ-NP-Z]{5}$/.test(code || ""), v);
    t("홍천팬 도장(011 gig_checkin)", (await call(db, KA, "gig_checkin", [code]))?.ok === true);
    const gp = (await call(db, KA, "gig_guestbook_write", [code, "오늘 공연 정말 좋았어요"]))?.id;
    v = await page(KA);
    const direct = await call(db, KA, "gig_my_stamps");
    t("마이페이지 도장 = gig_my_stamps() 그대로 · 시험 공연 하나(012 진해 공연은 안 찍음)", v?.gigs === true && same(v.stamps, direct) && direct?.ok === true
      && direct.rows.length === 1 && direct.rows[0].code === code, [v?.stamps, direct]);
    t("방명록으로 쓴 글에 공연 꼬리표 {code, title_ko, title_en} · 다른 글은 null",
      postById(v, gp)?.gig?.code === code && ks(postById(v, gp)?.gig) === "code,title_en,title_ko" && postById(v, gp)?.gig?.title_ko === "시험 공연 — 서울"
      && postById(v, gp)?.board === "review" && postById(v, p1)?.gig === null, postById(v, gp));
    t("남의 마이페이지에는 내 도장이 없다", (await page(OT))?.stamps?.rows?.length === 0);
  } else {
    v = await page(KA);
    t("011 없음: gigs false · stamps null · 글의 공연 칸 null", v?.gigs === false && v?.stamps === null && v.posts.rows.every(r => r.gig === null), [v?.gigs, v?.stamps]);
  }

  // ── K. 차단 ─────────────────────────────────────────────────
  const bp = await wr(BL, "차단될팬의 글");
  t("차단 처리(010 admin_set_level)", (await call(db, ADM, "admin_set_level", [BLOCK, "blocked"]))?.ok === true);
  t("차단 회원 노래 바꾸기 → blocked · 그대로 아버지", (await setSong(BL, "친구여"))?.reason === "blocked" && (await songRow(BLOCK))[0]?.k === "아버지");
  t("차단 회원 노래 지우기 → blocked · 그대로", (await setSong(BL, ""))?.reason === "blocked" && (await songRow(BLOCK)).length === 1);
  v = await page(BL);
  t("차단 회원 마이페이지: 내 글은 보인다(010 board_mine 과 같이) · 등급 blocked · 내 노래 그대로",
    v?.ok === true && v.level === "blocked" && v.posts.rows.some(r => r.id === bp) && v.song?.k === "아버지" && v.levelup === false, v);
  t(g ? "차단 회원 도장 칸 = gig_my_stamps 가 주는 blocked 그대로" : "차단 회원 도장 칸 null(011 없음)",
    g ? same(v?.stamps, { ok: false, reason: "blocked" }) : v?.stamps === null, v?.stamps);

  // ── L. 더 보기(쪽 넘기기) ───────────────────────────────────
  await db.exec(`insert into public.board_posts (user_id, board, title, body, status)
                 select '${PAGER}', 'free', '페이지 글 ' || n, '본문입니다', (array['pending', 'approved', 'rejected'])[1 + n % 3]
                   from generate_series(1, 55) n;
                 insert into public.board_comments (post_id, user_id, body, status)
                 select ${Number(ap1)}, '${PAGER}', '페이지 댓글 ' || n, 'approved' from generate_series(1, 23) n;`);
  const all = []; const mores = []; let before = null;
  for (let i = 0; i < 5; i++) {
    const r = await call(db, PG, "member_my_posts", [before, 20]);
    if (!r?.ok) { mores.push(r); break; }
    all.push(...r.rows.map(x => x.id)); mores.push(r.more);
    if (!r.more) break;
    before = Math.min(...r.rows.map(x => x.id));
  }
  t("글 55개 → 20 · 20 · 15 쪽, more true·true·false, 빠짐·겹침 없이 최신순", same(mores, [true, true, false]) && all.length === 55 && new Set(all).size === 55
    && all.every((x, i) => i === 0 || all[i - 1] > x) && same(all, await idsOf("board_posts", PAGER)), { mores, n: all.length });
  t("한 쪽 최대 50 · 0 이나 음수는 1 · null 은 20",
    (await call(db, PG, "member_my_posts", [null, 999]))?.rows?.length === 50 && (await call(db, PG, "member_my_posts", [null, 0]))?.rows?.length === 1
    && (await call(db, PG, "member_my_posts", [null, -3]))?.rows?.length === 1 && (await call(db, PG, "member_my_posts", [null, null]))?.rows?.length === 20);
  const cAll = []; const cM = []; before = null;
  for (let i = 0; i < 4; i++) {
    const r = await call(db, PG, "member_my_comments", [before, 20]);
    if (!r?.ok) { cM.push(r); break; }
    cAll.push(...r.rows.map(x => x.id)); cM.push(r.more);
    if (!r.more) break;
    before = Math.min(...r.rows.map(x => x.id));
  }
  t("댓글 23개 → 20 · 3 쪽, more true·false", same(cM, [true, false]) && cAll.length === 23 && new Set(cAll).size === 23 && same(cAll, await idsOf("board_comments", PAGER)), { cM, n: cAll.length });
  v = await page(PG);
  t("마이페이지 첫 쪽 20 · more true · 건수는 전부(55 · 23)", v?.posts?.rows?.length === 20 && v.posts.more === true && v.comments.rows.length === 20 && v.comments.more === true
    && same(v.counts, await countsTruth(PAGER)) && v.counts.posts.total === 55 && v.counts.comments.total === 23, v?.counts);
  t("검수를 거치지 않고 기준을 채운 새싹(표에 직접 들어간 글) → 마이페이지가 010 규칙으로 올림", v?.level === "member" && v.levelup === true && honest(v, await truth(PAGER)), v);

  // ── M. 속도 제한 ────────────────────────────────────────────
  t("속도 제한 회원 둘 가입", (await join(R1, "노래팬일", 7))?.ok === true && (await join(R2, "노래팬이", 8))?.ok === true);
  const rr = [];
  for (let i = 0; i < 31; i++) rr.push((await setSong(R1, i % 2 ? "거위의 꿈" : "아버지", "192.0.2.10"))?.ok === true ? "ok" : "x");
  const last = await setSong(R1, "친구여", "192.0.2.10");
  t("한 시간 30번까지 · 31번째부터 rate_limited", rr.slice(0, 30).every(x => x === "ok") && rr[30] === "x" && last?.reason === "rate_limited", [rr.join(""), last]);
  t("막혀도 내 노래는 마지막으로 성공한 곡 그대로", (await songRow(RATE1))[0]?.k === "거위의꿈");
  if (g) {
    t("011 의 회원 기준: IP 를 바꿔도 같은 사람은 막힘", (await setSong(R1, "친구여", "192.0.2.99"))?.reason === "rate_limited");
    t("011 의 회원 기준: 같은 IP 의 다른 사람은 됨(공연장 와이파이)", (await setSong(R2, "친구여", "192.0.2.10"))?.ok === true);
  } else {
    t("011 없음(IP 기준): 다른 IP 는 됨", (await setSong(R2, "친구여", "192.0.2.77"))?.ok === true);
  }
  const bb = [];
  for (let i = 0; i < 35; i++) bb.push((await setSong(R2, "없는 노래 " + i, "192.0.2.78"))?.reason);
  t("틀린 이름은 횟수를 쓰지 않음(35번 bad_song 뒤에도 고르기 됨)", bb.every(r => r === "bad_song") && (await setSong(R2, "아버지", "192.0.2.78"))?.ok === true, bb.slice(-3));

  // ── N. 탈퇴 — 두 경로 모두 내 노래가 함께 지워진다 ───────────
  const admBefore = await call(db, ADM, "admin_member_songs", [100]);
  v = await call(db, KA, "member_leave");
  t("탈퇴(계정 삭제 경로) → 내 노래 · 명부 · 계정 0", v?.ok === true && !v.partial && (await songRow(KAKAO)).length === 0
    && (await one(`select count(*)::int from public.members where user_id = $1`, [KAKAO])) === 0 && (await one(`select count(*)::int from auth.users where id = $1`, [KAKAO])) === 0, v);
  const admAfter = await call(db, ADM, "admin_member_songs", [100]);
  const nG = x => x?.tally?.find(r => r.k === "거위의꿈")?.n;
  t("운영자 명단에서도 빠지고 숫자가 1 줄어듦", admAfter?.counts?.with_song === admBefore.counts.with_song - 1 && admAfter.counts.members === admBefore.counts.members - 1
    && nG(admAfter) === nG(admBefore) - 1 && !admAfter.rows.some(r => r.user_id === KAKAO), [admBefore?.counts, admAfter?.counts]);
  await db.exec(`create function public.__deny_del() returns trigger language plpgsql as $$ begin raise exception 'no' using errcode = '42501'; end $$;
                 create trigger __deny before delete on auth.users for each row when (old.id = '${MAIL}') execute function public.__deny_del();`);
  const mlHad = (await songRow(MAIL)).length;
  v = await call(db, ML, "member_leave");
  t("탈퇴(명부만 지우는 partial 경로) → 내 노래 0 · 계정 행은 남음", mlHad === 1 && v?.ok === true && v.partial === true && (await songRow(MAIL)).length === 0
    && (await one(`select count(*)::int from auth.users where id = $1`, [MAIL])) === 1, { mlHad, v });
  await db.exec(`drop trigger __deny on auth.users; drop function public.__deny_del();`);
  t("탈퇴한 뒤(계정만 남음) 마이페이지 · 노래 → not_member", (await page(ML))?.reason === "not_member" && (await setSong(ML, "아버지"))?.reason === "not_member");

  // ── O. 운영 중 다시 실행 ─────────────────────────────────────
  const snap = async () => (await q(`select (select string_agg(user_id::text || ':' || k || ':' || at::text, ',' order by user_id) from public.member_songs) as s,
                                            (select count(*) from public.members)::int as m`))[0];
  const s1 = await snap();
  await db.exec(`update public.member_song_choices set title = '거위의 꿈(손으로 고침)' where k = '거위의꿈';
                 delete from public.member_song_choices where k = '실버들';`);
  let rerun;
  try { const r = await db.exec(db.__sql); rerun = r[r.length - 1].rows; }
  catch (e) { rerun = { err: String(e.message || e).slice(0, 200) }; try { await db.exec("rollback"); } catch {} }
  const s2 = await snap();
  t("운영 중 다시 실행(데이터 있음 · 목록을 손으로 고쳐 둠) → 성공 · ✅ 8", Array.isArray(rerun) && rerun.filter(r => r["결과"] === "✅").length === 8 && !rerun.some(r => r["결과"] === "❌"), rerun);
  const ch2 = await q(`select k, title, year::int as year, sort::int as sort from public.member_song_choices order by sort`);
  t("다시 실행하면 노래 목록이 songs.json 정본으로 돌아옴(고친 제목 · 지운 곡)", same(ch2, SONGS.map((s, i) => ({ k: s.k, title: s.t, year: Number(s.y), sort: i + 1 }))), ch2.slice(0, 2));
  t("다시 실행해도 회원이 고른 노래 · 시각 그대로", s1.s === s2.s && s1.m === s2.m, [s1, s2]);
  const infoLine = `내 노래를 고른 회원 ${await one(`select count(*)::int from public.member_songs`)}명 · 회원 ${await one(`select count(*)::int from public.members`)}명`;
  t("ℹ️ 줄: 고른 회원 · 회원 수 = 실제 count(*)", Array.isArray(rerun) && rerun.some(r => r["결과"] === "ℹ️" && r["점검"] === infoLine), [infoLine, rerun]);
  return R;
}

// ── 순서 — 010 없이 · 011 보다 먼저 ─────────────────────────────
async function orderPaths(sql013, stopEarly = false) {
  const R = [];
  const t = (name, ok, info = "") => { R.push({ name, ok: !!ok, info: typeof info === "string" ? info : JSON.stringify(info) }); if (stopEarly && !ok) throw new Caught(name); };
  {
    const db = await fresh(UPTO9);
    let err = null;
    try { await db.exec(sql013); } catch (e) { err = String(e.message || e); try { await db.exec("rollback"); } catch {} }
    const clean = (await db.query(`select to_regclass('public.member_song_choices') is null and to_regclass('public.member_songs') is null
                                          and to_regprocedure('public.member_page()') is null as c`)).rows[0].c;
    t("010 없이 013 → '010 을 먼저 실행' 오류로 멈춤 · 아무것도 안 남음", !!err && err.includes("010(회원과 게시판)을 먼저 실행해야 합니다") && clean, err || "오류 없음");
  }
  {
    const db = await fresh(UPTO10);
    await seedUsers(db);
    const res = [];
    for (const [label, sql] of [["013", sql013], ["011", read(F011)], ["012", read(F012)], ["013", sql013]]) {
      try { const r = await db.exec(sql); res.push([label, r[r.length - 1].rows]); }
      catch (e) { res.push([label, { err: String(e.message || e).slice(0, 160) }]); try { await db.exec("rollback"); } catch {} }
    }
    const ok = (rows, n) => Array.isArray(rows) && rows.filter(r => r["결과"] === "✅").length === n && !rows.some(r => r["결과"] === "❌");
    t("010 → 013 → 011 → 012 → 013: 각각 성공(013 ✅8 · 011 ✅10 · 012 진해 공연 · 013 ✅8 + 011 연결됨)",
      ok(res[0][1], 8) && res[0][1].some(r => r["점검"].includes("011 이 아직 없어")) && ok(res[1][1], 10)
      && Array.isArray(res[2][1]) && res[2][1][0]?.code === "5UYX8" && ok(res[3][1], 8) && res[3][1].some(r => r["점검"].includes("011 연결됨")),
      res.map(([l, r]) => [l, Array.isArray(r) ? r.map(x => x["결과"] || x.code).join("") : r]));
    db.__report = res[3][1];
    db.__sql = sql013;
    if (!stopEarly) {
      const sub = await suite(db, { g: true });
      const bad = sub.filter(x => !x.ok);
      t(`010 → 013 → 011 → 012 → 013 위에서 본 검사 전체(${sub.length}개)`, bad.length === 0, bad.slice(0, 3));
    }
  }
  return R;
}

// ── 010 · 011 검사를 013 을 얹은 상태로 다시 ───────────────────
function rerunWith013(file, extraArgs, anchor) {
  const src = path.join(SUPA, "..", "scripts", file);
  if (!fs.existsSync(src)) return { ok: false, line: `찾지 못함: ${src}` };
  const text = fs.readFileSync(src, "utf8");
  if (!text.includes(anchor)) return { ok: false, line: `${file} 의 끼울 자리를 찾지 못함(구조가 바뀜)` };
  const patched = text.replace(anchor, anchor + "\n  await db.exec(fs.readFileSync(process.env.SQL013, \"utf8\"));  // 013 을 얹는다");
  const tmp = path.join(HERE, `.${file.replace(/\.mjs$/, "")}_with_013.mjs`);
  fs.writeFileSync(tmp, patched);
  try {
    const r = spawnSync(process.execPath, [tmp, SUPA, ...extraArgs], { env: { ...process.env, SQL013: path.join(SUPA, F013) }, encoding: "utf8", maxBuffer: 64 << 20 });
    const out = (r.stdout || "") + (r.stderr || "");
    const main = out.match(/본 검사: (\d+)\/(\d+) 통과/);
    const mut = out.match(/뮤테이션: (\d+)\/(\d+) 잡음/);
    const needMut = !extraArgs.includes("--quick");
    const ok = r.status === 0 && main && main[1] === main[2] && (!needMut || (mut && mut[1] === mut[2]));
    const bad = out.split("\n").filter(l => /✗|★못 잡음|적용 실패/.test(l)).slice(0, 10).join("\n");
    return { ok, line: `${file}${extraArgs.length ? " " + extraArgs.join(" ") : ""}: 본 검사 ${main ? main[1] + "/" + main[2] : "?"}` + (needMut ? ` · 뮤테이션 ${mut ? mut[1] + "/" + mut[2] : "?"}` : "") + ` · 종료코드 ${r.status}` + (bad ? "\n" + bad : "") };
  } finally { fs.rmSync(tmp, { force: true }); }
}

const sql = read(F013);
let fail = 0, total = 0;
const show = r => { total++; if (!r.ok) fail++; console.log(`${r.ok ? "  ✓" : "  ✗"} ${r.name}${r.ok ? "" : "  ← " + String(r.info).slice(0, 300)}`); };

console.log("── 001~012 → 013 ×2 → 마이페이지 · 내 노래 전 과정");
for (const g of [true, false]) {
  if (!g) console.log("\n── 001~010 → 013 ×2 (011 없는 서버)");
  let res;
  try { const db = await build(sql, g); db.__sql = sql; res = await suite(db, { g }); }
  catch (e) { res = [{ name: "검사 실행 자체가 실패", ok: false, info: String(e.stack || e).slice(0, 600) }]; }
  res.forEach(show);
}
console.log("\n── 순서: 010 없이 · 011 보다 먼저");
try { (await orderPaths(sql)).forEach(show); }
catch (e) { show({ name: "순서 검사 실행 자체가 실패", ok: false, info: String(e.stack || e).slice(0, 600) }); }
console.log(`\n본 검사: ${total - fail}/${total} 통과`);

let regOk = true;
if (!QUICK) {
  console.log("\n── 010 검사(check_board_sql.mjs) · 011 검사(check_concert_sql.mjs --quick)를 013 을 얹은 상태로 다시");
  for (const [file, args] of [["check_board_sql.mjs", []], ["check_concert_sql.mjs", ["--quick"]]]) {
    const b = rerunWith013(file, args, "db.__report = r2[r2.length - 1].rows;");
    if (!b.ok) regOk = false;
    console.log(`  ${b.ok ? "✓" : "✗"} ${b.line}`);
  }
}

const once = (a, b) => s => { const i = s.indexOf(a); return i < 0 ? s : s.slice(0, i) + b + s.slice(i + a.length); };
const every = (a, b) => s => s.split(a).join(b);
const MUT = [
  ["내 노래 표를 공개 키에 엶", once("revoke all on public.member_songs from anon, authenticated;", "grant select on public.member_songs to anon;")],
  ["노래 목록 표를 로그인에 엶", once("revoke all on public.member_song_choices from anon, authenticated;", "grant select on public.member_song_choices to authenticated;")],
  ["탈퇴 연결 cascade 빠짐", once("constraint member_songs_member_fk foreign key (user_id) references public.members (user_id) on delete cascade,", "constraint member_songs_member_fk foreign key (user_id) references public.members (user_id),")],
  ["한 사람 한 곡 기본키 없음", once("  constraint member_songs_pk        primary key (user_id),\n", "")],
  ["비슷한 곡으로 바꿔 넣음(첫 글자 일치)", once("   where s.title = v_in or s.k = v_in\n", "   where s.title = v_in or s.k = v_in or s.title like left(v_in, 1) || '%'\n")],
  ["정본 한 곡 빠짐(바보 멍청이 똥개)", once(",\n  (103, '바보멍청이똥개', '바보 멍청이 똥개', 2025)", "")],
  ["정본 제목 오타(거위의꿈)", once("'거위의꿈', '거위의 꿈', 2007", "'거위의꿈', '거위의꿈', 2007")],
  ["지문 검사를 끄고 오타", s => once("'거위의꿈', '거위의 꿈', 2007", "'거위의꿈', '거위의꿈', 2007")(once("if n <> 103 or fp is distinct from 'b36163446428965122918984415071b9' then", "if false then")(s))],
  ["다시 실행해도 정본으로 안 돌아옴(do nothing)", once("on conflict (k) do update\n  set title = excluded.title, year = excluded.year, sort = excluded.sort\n  where (public.member_song_choices.title, public.member_song_choices.year, public.member_song_choices.sort)\n        is distinct from (excluded.title, excluded.year, excluded.sort);", "on conflict (k) do nothing;")],
  ["마이페이지에 남의 글", every("       where p.user_id = v_uid and (p_before is null or p.id < p_before)", "       where (p_before is null or p.id < p_before)")],
  ["내 댓글에 남의 댓글", once("     where c.user_id = v_uid and (p_before is null or c.id < p_before)", "     where (p_before is null or c.id < p_before)")],
  ["내려진 남의 글 제목이 보임", once("case when p.status = 'approved' or p.user_id = v_uid then p.title end as post_title", "p.title as post_title")],
  ["볼 수 없는 글도 visible", once("(p.status = 'approved' or p.user_id = v_uid) as post_visible", "true as post_visible")],
  ["확인 중인 글도 등업 숫자에 셈", once("select count(*) into v_np from public.board_posts    where user_id = v_uid and status = 'approved';", "select count(*) into v_np from public.board_posts    where user_id = v_uid and status in ('approved', 'pending');")],
  ["확인 중인 댓글도 등업 숫자에 셈", once("select count(*) into v_nc from public.board_comments where user_id = v_uid and status = 'approved';", "select count(*) into v_nc from public.board_comments where user_id = v_uid;")],
  ["등업 기준을 지어냄(3 고정)", once("'need_posts', public.bs('levelup_posts', 3)", "'need_posts', 3")],
  ["마이페이지가 기준을 다시 세지 않음", once("v_up := public.member_recheck(v_uid);", "v_up := false;")],
  ["댓글 수에 확인 중 댓글까지", every("where c.post_id = p.id and c.status = 'approved') as comments", "where c.post_id = p.id) as comments")],
  ["건수에서 내려진 글을 뺌", once("'rejected', (select count(*) from public.board_posts where user_id = v_uid and status = 'rejected')),", "'rejected', 0),")],
  ["차단 회원도 노래를 바꿈", once("  if v_lv = 'blocked' then\n    return json_build_object('ok', false, 'reason', 'blocked');\n  end if;\n  if v_in = '' then", "  if v_in = '' then")],
  ["운영자 명단이 운영자를 안 봄", once("  if not public.is_admin() then\n    return json_build_object('ok', false, 'reason', 'forbidden');\n  end if;\n  select coalesce(json_agg(x order by x.at desc", "  select coalesce(json_agg(x order by x.at desc")],
  ["운영자 집계 부풀림(+1)", once("select c.k, c.title, c.sort, count(*) as n", "select c.k, c.title, c.sort, count(*) + 1 as n")],
  ["마이페이지를 공개 키에 엶", once("grant execute on function public.member_page()                          to authenticated;", "grant execute on function public.member_page()                          to anon, authenticated;")],
  ["노래 고르기의 PUBLIC 회수 빠짐", once("revoke execute on function public.member_set_song(text)                 from public, anon, authenticated;", "revoke execute on function public.member_set_song(text)                 from anon, authenticated;")],
  ["도우미를 밖에 열어 둠", once("revoke execute on function public.member_gigs_ready()                   from public, anon, authenticated;\n", "")],
  ["도장을 싣지 않음", once("    v_st := public.gig_my_stamps();", "    v_st := null;")],
  ["011 감지 뒤집기(늘 연결됨)", once("'gigs', v_stfn and public.member_gigs_ready(),", "'gigs', true,")],
  ["방명록 꼬리표 빠짐", once("(select json_build_object('code', g.code, 'title_ko', g.title_ko, 'title_en', g.title_en)\n                from public.gig_events g where g.id = p.gig_id) as gig", "null::json as gig")],
  ["더 보기가 늘 false", once("'more', v_min is not null and exists (select 1 from public.board_posts where user_id = v_uid and id < v_min));", "'more', false);")],
  ["한 쪽 50 상한 없음", once("v_lim  int := least(greatest(coalesce(p_limit, 20), 1), 50);", "v_lim  int := greatest(coalesce(p_limit, 20), 1);")],
  ["노래를 지워도 남음", once("    delete from public.member_songs where user_id = v_uid;\n", "")],
  ["가입 안 한 사람도 마이페이지(ok)", once("  if not exists (select 1 from public.members where user_id = v_uid) then\n    return json_build_object('ok', false, 'reason', 'not_member');\n  end if;\n  -- 010 과 같은 규칙으로", "  -- 010 과 같은 규칙으로")],
  ["내 노래에 남의 노래", once("    from public.member_songs s join public.member_song_choices c on c.k = s.k\n   where s.user_id = v_uid;", "    from public.member_songs s join public.member_song_choices c on c.k = s.k;")],
  ["노래 속도 제한 없음", once("  if not public.rate_ok('song', 30) then\n    return json_build_object('ok', false, 'reason', 'rate_limited');\n  end if;\n  insert into public.member_songs", "  insert into public.member_songs")],
  ["틀린 이름도 횟수를 씀(검증 앞에 속도 제한)", once("  select s.k, s.title, s.year into c\n", "  if not public.rate_ok('song', 30) then\n    return json_build_object('ok', false, 'reason', 'rate_limited');\n  end if;\n  select s.k, s.title, s.year into c\n")],
  ["010 확인 없음", once("    raise exception '013 앞에 010(회원과 게시판)을 먼저 실행해야 합니다 — 아무것도 바뀌지 않았습니다';", "    null;")],
];

let caught = 0, applied = 0;
if (!QUICK) {
  console.log("\n── 뮤테이션(일부러 망가뜨린 013) — 각각 잡혀야 한다");
  for (const [name, mut] of MUT) {
    const m = mut(sql);
    if (m === sql) { console.log(`  ? 뮤테이션 적용 실패: ${name}`); continue; }
    applied++;
    let hit = null;
    for (const g of [true, false]) {
      let built = null;
      try { built = await build(m, g); built.__sql = m; }
      catch (e) { hit = `안전장치가 전체 취소: ${String(e.message || e).split("\n")[0].slice(0, 70)}`; break; }
      try {
        const broke = (await suite(built, { g, stopEarly: true })).filter(x => !x.ok);
        if (broke.length) { hit = broke[0].name; break; }
      } catch (e) {
        hit = e instanceof Caught ? e.message : `검사 중 예외(망가진 응답): ${String(e.message || e).slice(0, 70)}`;
        break;
      }
    }
    if (!hit) {
      try { await orderPaths(m, true); } catch (e) { hit = e instanceof Caught ? "순서: " + e.message : `순서 검사 중 예외: ${String(e.message || e).slice(0, 70)}`; }
    }
    if (hit) caught++;
    console.log(`  ${hit ? "잡음" : "★못 잡음"} — ${name}${hit ? "  (" + hit + ")" : ""}`);
  }
  console.log(`뮤테이션: ${caught}/${MUT.length} 잡음`);
}

const ok = fail === 0 && regOk && (QUICK || (applied === MUT.length && caught === MUT.length));
console.log(ok ? "\n전부 통과" : "\n실패 있음");
process.exit(ok ? 0 : 1);
