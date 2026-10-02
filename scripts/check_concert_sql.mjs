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

async function suite(db, sql011, stopEarly = false) {
  const R = [];
  const t = (name, ok, info = "") => {
    let s; try { s = typeof info === "string" ? info : JSON.stringify(info); } catch { s = String(info); }
    R.push({ name, ok: !!ok, info: s || "" });
    if (stopEarly && !ok) throw new Caught(name);
  };
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const one = async (sql, p = []) => { const r = (await db.query(sql, p)).rows[0]; return r ? Object.values(r)[0] : undefined; };
  const setWin = (id, w) => db.exec(`update public.gig_events set ${WIN[w]} where id = ${Number(id)}`);
  // 한 트랜잭션 안에서 시각을 now() 기준으로 정확히 맞춰 단계를 본다(now() 가 같은 값이라 경계를 그대로 잰다)
  const phaseAt = async (id, set) => {
    await db.exec("begin");
    try {
      await db.exec(`update public.gig_events set ${set} where id = ${Number(id)}`);
      return (await db.query(`select public.gig_phase(g) as p from public.gig_events g where g.id = ${Number(id)}`)).rows[0].p;
    } catch (e) { return "ERR " + String(e.message || e); }
    finally { await db.exec("rollback"); }
  };
  const save = (who, obj) => call(db, who, "admin_gig_save", [JSON.stringify(obj)]);
  const base = () => ({ title_ko: "시험 공연 — 서울", title_en: "Test concert — Seoul", venue_ko: "시험 홀", venue_en: "Test Hall",
                        starts_at: iso(0.5 * H), opens_at: iso(-1 * H), closes_at: iso(2 * H), guest_until: iso(24 * H),
                        songs: ["거위의 꿈", "아버지", "친구여"] });
  const reasonsOf = async (who, list, ip) => { const out = []; for (const [fn, args] of list) out.push([fn, (await call(db, who, fn, args, ip))?.reason ?? null]); return out; };
  let v, w;

  // ── A. 설치 · 잠금 ──────────────────────────────────────────
  const rep = db.__report || [];
  t("확인표 ✅ 10 · ❌ 0", rep.filter(r => r["결과"] === "✅").length === 10 && !rep.some(r => r["결과"] === "❌"), rep);
  t("확인표 ℹ️: 간격 15초 · 공연 0개(공개 0)", rep.some(r => r["결과"] === "ℹ️" && r["점검"].includes("15초 · 공연 0개(공개 0)")), rep);

  for (const tb of ["gig_events", "gig_phrases", "gig_vote_songs", "gig_checkins", "gig_cheers", "gig_votes"]) {
    const privs = ["SELECT", "INSERT", "UPDATE", "DELETE"];
    const r = (await q(`select c.relrowsecurity as rls,
        (select count(*) from pg_policy p where p.polrelid = c.oid)::int as pol,
        ${privs.map(p => `has_table_privilege('anon', 'public.${tb}', '${p}')`).join(" or ")} as anon_any,
        ${privs.map(p => `has_table_privilege('authenticated', 'public.${tb}', '${p}')`).join(" or ")} as auth_any
      from pg_class c where c.oid = 'public.${tb}'::regclass`))[0];
    t(`${tb}: RLS 켜짐 · 정책 0 · 공개/로그인 표 권한 0`, r && r.rls && r.pol === 0 && !r.anon_any && !r.auth_any, r);
    const ra = await as(db, ANON, `select * from public.${tb} limit 1`);
    const rk = await as(db, KA, `select * from public.${tb} limit 1`);
    t(`${tb}: 공개 키·로그인 회원 모두 직접 읽기 막힘`, /permission denied/.test(ra.err || "") && /permission denied/.test(rk.err || ""), [ra.err || ra.rows, rk.err || rk.rows]);
  }

  // 함수 권한 행렬 [시그니처, 공개 키, 로그인] — PUBLIC 은 언제나 막혀야 한다(001 의 결함이 PUBLIC 이었다)
  const FN = [
    ["gig_event(text)", true, true], ["gig_pulse(text)", true, true], ["gig_now()", true, true],
    ["gig_guestbook(text,bigint,integer)", true, true], ["post_gigs(bigint[])", true, true],
    ["gig_checkin(text)", false, true], ["gig_cheer(text,smallint,boolean)", false, true],
    ["gig_vote(text,text)", false, true], ["gig_guestbook_write(text,text)", false, true],
    ["gig_my_stamps()", false, true], ["admin_gig_list()", false, true], ["admin_gig_save(jsonb)", false, true],
    ["admin_gig_set(bigint,text,boolean)", false, true],
    ["gig_phase(public.gig_events)", false, false], ["gig_find(text)", false, false], ["gig_tally(bigint)", false, false],
    ["rate_ok(text,integer)", false, false], ["req_ip_hash()", false, false],
  ];
  for (const [sig, a, u] of FN) {
    const r = (await q(`select has_function_privilege('anon', 'public.${sig}', 'EXECUTE') as a,
                               has_function_privilege('authenticated', 'public.${sig}', 'EXECUTE') as u,
                               has_function_privilege('public', 'public.${sig}', 'EXECUTE') as p`))[0];
    t(`권한 ${sig}: 공개 ${a ? "열림" : "막힘"} · 로그인 ${u ? "열림" : "막힘"} · PUBLIC 막힘`, r && r.a === a && r.u === u && r.p === false, r);
  }
  const defs = await q(`select p.proname, p.prosecdef, coalesce(array_to_string(p.proconfig, ';'), '') as cfg
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'gig\\_%' or p.proname like 'admin\\_gig\\_%' or p.proname in ('post_gigs', 'rate_ok'))`);
  t("공연 함수 17개 전부 security definer + search_path=public, pg_temp", defs.length === 17 && defs.every(d => d.prosecdef && d.cfg === "search_path=public, pg_temp"),
    defs.filter(d => !(d.prosecdef && d.cfg === "search_path=public, pg_temp")).map(d => d.proname).concat([`n=${defs.length}`]));
  t("song_requests 에 user_id 칸 없음(공개 표라 누가 골랐는지 드러남)",
    (await one(`select count(*)::int from information_schema.columns where table_schema = 'public' and table_name = 'song_requests' and column_name = 'user_id'`)) === 0);
  const fkGig = await q(`select c.confdeltype from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
                          where c.contype = 'f' and c.conrelid = 'public.board_posts'::regclass and a.attname = 'gig_id'`);
  t("board_posts.gig_id FK 하나 · 공연을 지워도 글은 남음(set null)", fkGig.length === 1 && fkGig[0].confdeltype === "n", fkGig);
  const fkMem = await q(`select c.conrelid::regclass::text as t, c.confdeltype from pg_constraint c
                          where c.contype = 'f' and c.confrelid = 'public.members'::regclass
                            and c.conrelid in ('public.gig_checkins'::regclass, 'public.gig_cheers'::regclass, 'public.gig_votes'::regclass)`);
  t("도장·응원·투표 → 회원 FK 3개 모두 cascade(탈퇴하면 함께)", fkMem.length === 3 && fkMem.every(x => x.confdeltype === "c"), fkMem);
  const ph = await q(`select k, ko, en from public.gig_phrases where active order by sort`);
  t("응원 문구 6개 · 계약의 순서·문구", ph.length === 6 && ph.map(x => x.ko).join("|") === "사랑해요|앵콜!|오늘 정말 멋졌어요|건강하세요|오래오래 노래해 주세요|또 올게요"
    && ph.map(x => x.en).join("|") === "We love you|Encore!|You were amazing tonight|Stay well|Keep singing for us|I'll be back", ph);
  t("설정 gig_poll_s = 15", (await one(`select value from public.board_settings where key = 'gig_poll_s'`)) === 15);

  // ── B. 가입 — 공연장 와이파이(같은 IP)에서 여럿이 ──────────────────
  t("카카오 회원 가입(새싹)", (await call(db, KA, "member_join", ["홍천팬", true, true]))?.ok === true);
  t("이메일 회원 가입", (await call(db, ML, "member_join", ["서울팬", true, true]))?.ok === true);
  t("운영자 가입", (await call(db, ADM, "member_join", ["사랑방지기", true, true]))?.ok === true);
  t("차단될 회원 가입", (await call(db, BL, "member_join", ["막힌팬", true, true]))?.ok === true);
  t("이메일 회원 → 정회원", (await call(db, ADM, "admin_set_level", [MAIL, "member"]))?.ok === true);
  t("차단", (await call(db, ADM, "admin_set_level", [BLOCK, "blocked"]))?.ok === true);
  const HALL = "198.51.100.77";
  const joins = [];
  for (let i = 0; i < CR.length; i++) joins.push(await call(db, CR[i], "member_join", [`객석${i + 1}`, true, true], HALL));
  t("공연장 와이파이(같은 IP)에서 12명 가입 → 12명 모두 ok (010 의 가입 한도 10 은 이제 사람마다)",
    joins.every(x => x && x.ok === true), joins.map((x, i) => `${i + 1}:${x?.ok ? "ok" : x?.reason}`));

  // ── C. 공연이 없을 때 ───────────────────────────────────────
  v = await call(db, ANON, "gig_now");
  t("공연 없음: gig_now → ok · event null", v && v.ok === true && v.event === null && keys(v) === "event,ok", v);
  t("없는 코드 gig_event → not_found", (await call(db, ANON, "gig_event", ["ZZZZZ"]))?.reason === "not_found");
  t("없는 코드 gig_pulse → not_found", (await call(db, ANON, "gig_pulse", ["ZZZZZ"]))?.reason === "not_found");
  t("없는 코드 방명록 → not_found", (await call(db, ANON, "gig_guestbook", ["ZZZZZ", null, 5]))?.reason === "not_found");
  t("코드 없이(열린 공연 없음) → not_found", (await call(db, ANON, "gig_event", [null]))?.reason === "not_found");
  v = await call(db, ANON, "post_gigs", ["{}"]);
  t("post_gigs 빈 배열 → ok · map {}", v?.ok === true && JSON.stringify(v.map) === "{}", v);
  t("post_gigs null → ok · map {}", JSON.stringify((await call(db, ANON, "post_gigs", [null]))?.map) === "{}");
  t("post_gigs 50개 → ok", (await call(db, ANON, "post_gigs", ["{" + Array.from({ length: 50 }, (_, i) => i + 1).join(",") + "}"]))?.ok === true);
  t("post_gigs 51개 → too_many", (await call(db, ANON, "post_gigs", ["{" + Array.from({ length: 51 }, (_, i) => i + 1).join(",") + "}"]))?.reason === "too_many");

  // ── D. 공연 저장 검증 · 운영자만 ─────────────────────────────
  const nEv0 = await one("select count(*)::int from public.gig_events");
  for (const [name, mod, why] of [
    ["제목 1자", o => { o.title_ko = "가"; }, "bad_title"],
    ["제목 61자", o => { o.title_ko = "가".repeat(61); }, "bad_title"],
    ["제목 빈칸만", o => { o.title_ko = "    "; }, "bad_title"],
    ["제목 없음", o => { delete o.title_ko; }, "bad_title"],
    ["영문 제목 81자", o => { o.title_en = "a".repeat(81); }, "bad_title"],
    ["장소 61자", o => { o.venue_ko = "가".repeat(61); }, "bad_venue"],
    ["열림 = 닫힘", o => { o.closes_at = o.opens_at; }, "bad_time"],
    ["닫힘 > 방명록 끝", o => { o.guest_until = iso(1 * H); }, "bad_time"],
    ["시각이 글자", o => { o.starts_at = "내일 저녁"; }, "bad_time"],
    ["방명록 끝 없음", o => { delete o.guest_until; }, "bad_time"],
    ["상태가 엉뚱함", o => { o.status = "live"; }, "bad_status"],
    ["후보 9곡", o => { o.songs = Array.from({ length: 9 }, (_, i) => `곡${i}`); }, "too_many_songs"],
    ["후보에 빈 곡", o => { o.songs = ["거위의 꿈", "  "]; }, "bad_song"],
    ["후보 중복(빈칸만 다름)", o => { o.songs = ["거위의 꿈", "거위의 꿈 "]; }, "bad_song"],
    ["후보 81자", o => { o.songs = ["가".repeat(81)]; }, "bad_song"],
    ["후보가 배열 아님", o => { o.songs = "거위의 꿈"; }, "bad_song"],
    ["후보가 숫자", o => { o.songs = [1]; }, "bad_song"],
    ["없는 공연 고치기", o => { o.id = 999999; }, "not_found"],
  ]) {
    const o = base(); mod(o);
    v = await save(ADM, o);
    t(`공연 저장 검증: ${name} → ${why}`, v?.reason === why, v);
  }
  t("검증에 걸린 저장은 아무것도 만들지 않음", (await one("select count(*)::int from public.gig_events")) === nEv0);
  for (const [who, nm] of [[ML, "정회원"], [KA, "새싹"], [NJ, "가입 전 계정"], [NOTOKEN, "토큰 없음"]]) {
    const rs = [await call(db, who, "admin_gig_list"), await save(who, base()), await call(db, who, "admin_gig_set", [1, "open", true])];
    t(`${nm}: 공연 관리 세 함수 모두 forbidden`, rs.every(x => x?.reason === "forbidden"), rs);
  }
  t("공개 키: 공연 관리 세 함수 자체가 막힘",
    denied(await call(db, ANON, "admin_gig_list")) && denied(await save(ANON, base())) && denied(await call(db, ANON, "admin_gig_set", [1, "open", true])));

  // ── E. 만들기 → 미리보기 → 코드 다시 → 공개 ───────────────────
  v = await save(ADM, base());
  const E1 = v?.id;
  let CODE = v?.code;
  t("공연 만들기 → ok · 코드 5자(0·O·1·I·L 없음)", v?.ok === true && keys(v) === "code,id,ok" && CODE_RE.test(CODE || ""), v);
  const e1 = (await q(`select status, created_by::text as cb, override, vote_open from public.gig_events where id = $1`, [E1]))[0];
  t("새 공연: 공개 전(draft) · 만든 사람 기록 · 손잡이 없음 · 투표 열림", e1?.status === "draft" && e1.cb === ADMIN && e1.override === null && e1.vote_open === true, e1);
  const vs0 = await q(`select song, sort from public.gig_vote_songs where event_id = $1 order by sort`, [E1]);
  t("후보곡 3곡이 순서대로", vs0.map(x => `${x.sort}:${x.song}`).join(",") === "1:거위의 꿈,2:아버지,3:친구여", vs0);
  t("공개 전: 공개 키로 못 찾음", (await call(db, ANON, "gig_event", [CODE]))?.reason === "not_found");
  t("공개 전: 회원도 못 찾음", (await call(db, KA, "gig_event", [CODE]))?.reason === "not_found");
  t("공개 전: 숫자·방명록도 not_found",
    (await call(db, ANON, "gig_pulse", [CODE]))?.reason === "not_found" && (await call(db, ANON, "gig_guestbook", [CODE, null, 5]))?.reason === "not_found");
  v = await call(db, ADM, "gig_event", [CODE]);
  t("공개 전: 운영자는 미리보기(preview true · 단계 open)", v?.ok === true && v.event?.preview === true && v.event.phase === "open", v?.event);
  t("공개 전: 운영자의 me = 정회원·staff", v?.me?.joined === true && v.me.level === "member" && v.me.staff === true, v?.me);
  t("공개 전 공연은 gig_now 에 안 뜸", (await call(db, ANON, "gig_now"))?.event === null);
  t("공개 전 공연은 코드 없이도 안 뜸(운영자도)", (await call(db, ADM, "gig_event", [""]))?.reason === "not_found");
  t("공개 전: 회원 체크인 → not_found", (await call(db, KA, "gig_checkin", [CODE]))?.reason === "not_found");
  v = await save(ADM, { ...base(), songs: undefined, id: E1, regen_code: true });
  t("공개 전 코드 다시 만들기 → 새 코드", v?.ok === true && v.id === E1 && v.code !== CODE && CODE_RE.test(v.code || ""), { old: CODE, v });
  const OLD = CODE; CODE = v?.code;
  t("옛 코드는 운영자도 못 찾음", (await call(db, ADM, "gig_event", [OLD]))?.reason === "not_found");
  t("후보 키를 빼고 저장하면 후보곡은 그대로", (await one(`select count(*)::int from public.gig_vote_songs where event_id = $1`, [E1])) === 3);
  v = await save(ADM, { ...base(), songs: undefined, id: E1, status: "published" });
  t("공개 → 코드 그대로", v?.ok === true && v.code === CODE, v);
  v = await save(ADM, { ...base(), songs: undefined, id: E1, regen_code: true });
  t("공개된 공연의 코드 다시 만들기 → code_locked", v?.reason === "code_locked", v);
  t("code_locked 뒤 코드·상태 그대로", (await one(`select code || '/' || status from public.gig_events where id = $1`, [E1])) === `${CODE}/published`);

  v = await call(db, ANON, "gig_event", [CODE]);
  t("공개 후: 공개 키로 공연 정보(preview false · open · 투표 열림)", v?.ok === true && v.event?.code === CODE && v.event.preview === false && v.event.phase === "open" && v.event.vote_open === true, v?.event);
  t("gig_event 칸이 계약과 같다", keys(v) === ks(["ok", "now", "poll_s", "event", "phrases", "songs", "counts", "me"])
    && keys(v?.event) === ks(["code", "title_ko", "title_en", "venue_ko", "venue_en", "starts_at", "opens_at", "closes_at", "guest_until", "phase", "vote_open", "preview"])
    && keys(v?.counts) === ks(["checkins", "cheers", "votes", "at"]), [keys(v), keys(v?.event), keys(v?.counts)]);
  t("공개 키: me null · 간격 15초", v?.me === null && v?.poll_s === 15, [v?.me, v?.poll_s]);
  t("문구 6개 순서대로 · k·ko·en 만", v?.phrases?.length === 6 && v.phrases.map(p => p.k).join() === "1,2,3,4,5,6" && keys(v.phrases[0]) === "en,k,ko", v?.phrases);
  t("후보곡 3곡 순서대로 · song·sort", v?.songs?.map(s => s.song).join("|") === "거위의 꿈|아버지|친구여" && keys(v.songs[0]) === "song,sort", v?.songs);
  t("숫자: 도장 0 · 응원 6문구 모두 0 · 투표 3곡 모두 0 (0 도 빠짐없이)",
    v?.counts?.checkins === 0 && v.counts.cheers.length === 6 && v.counts.cheers.every(c => c.n === 0)
    && v.counts.votes.length === 3 && v.counts.votes.every(c => c.n === 0), v?.counts);
  t("코드를 소문자·빈칸 섞어 쳐도 찾는다", (await call(db, ANON, "gig_event", ["  " + CODE.toLowerCase() + " "]))?.event?.code === CODE);
  t("코드 없이(null·'') → 지금 열린 공개 공연",
    (await call(db, ANON, "gig_event", [null]))?.event?.code === CODE && (await call(db, ANON, "gig_event", [""]))?.event?.code === CODE);
  v = await call(db, ANON, "gig_now");
  t("gig_now → 이 공연 · open · 도장 0 · 계약 칸", v?.event?.code === CODE && v.event.phase === "open" && v.event.checkins === 0
    && keys(v.event) === ks(["code", "title_ko", "title_en", "venue_ko", "venue_en", "starts_at", "phase", "checkins"]), v);

  // ── F. 문지기: 로그인 → 명부 → 차단 → 공연 ───────────────────
  const PRESS = code => [["gig_checkin", [code]], ["gig_cheer", [code, 1, true]], ["gig_vote", [code, "아버지"]],
                         ["gig_guestbook_write", [code, "문지기 시험 글입니다"]], ["gig_my_stamps", []]];
  for (const [who, nm, why] of [[NOTOKEN, "토큰 없음", "not_logged_in"], [NJ, "가입 전 계정", "not_member"], [BL, "차단 회원", "blocked"]]) {
    const rs = await reasonsOf(who, PRESS(CODE));
    t(`${nm}: 도장·응원·투표·방명록·내 도장 모두 ${why}`, rs.every(([, r]) => r === why), rs);
  }
  {
    const rs = await reasonsOf(KA, PRESS("ZZZZZ").slice(0, 4));
    t("회원이 없는 코드로 → 넷 다 not_found", rs.every(([, r]) => r === "not_found"), rs);
    const ds = []; for (const [fn, args] of PRESS(CODE)) ds.push([fn, denied(await call(db, ANON, fn, args))]);
    t("공개 키: 누르는 함수 다섯 개 자체가 막힘", ds.every(([, d]) => d), ds);
  }
  v = await call(db, NJ, "gig_event", [CODE]);
  t("가입 전 로그인: me.joined false · 나머지 빈 값(가입 시트를 띄울 수 있게)",
    v?.me?.joined === false && v.me.checked === false && v.me.posted === 0 && v.me.vote === null && JSON.stringify(v.me.cheers) === "[]"
    && keys(v.me) === ks(["joined", "level", "staff", "checked", "checked_at", "cheers", "vote", "posted"]), v?.me);
  t("문지기에서 멈춘 요청은 아무것도 남기지 않음",
    (await one(`select ((select count(*) from public.gig_checkins) + (select count(*) from public.gig_cheers)
                       + (select count(*) from public.gig_votes) + (select count(*) from public.board_posts where gig_id is not null))::int`)) === 0);

  // ── G. 체크인 도장 ─────────────────────────────────────────
  v = await call(db, KA, "gig_checkin", [CODE]);
  const kaAt = v?.at;
  t("도장 → ok · 처음 · 오늘 1명 · 계약 칸", v?.ok === true && v.already === false && v.checkins === 1 && !!v.at && keys(v) === "already,at,checkins,ok", v);
  v = await call(db, KA, "gig_checkin", [CODE]);
  t("도장 두 번 → already · 처음 시각 그대로 · 여전히 1명", v?.ok === true && v.already === true && v.checkins === 1 && v.at === kaAt, v);
  t("표에도 1행뿐(한 사람 한 번)", (await one(`select count(*)::int from public.gig_checkins where user_id = $1`, [KAKAO])) === 1);
  t("다른 회원 도장 → 오늘 2명", (await call(db, ML, "gig_checkin", [CODE]))?.checkins === 2);
  v = await call(db, KA, "gig_event", [CODE]);
  t("내 정보: 가입·새싹·staff 아님·도장 찍음·처음 시각", v?.me?.joined === true && v.me.level === "sprout" && v.me.staff === false
    && v.me.checked === true && v.me.checked_at === kaAt && v.counts.checkins === 2, v?.me);
  v = await call(db, KA, "gig_my_stamps");
  t("내 도장 모음 → 1개 · 공연 이름·코드 · 계약 칸", v?.ok === true && v.rows?.length === 1 && v.rows[0].code === CODE && v.rows[0].title_ko === "시험 공연 — 서울"
    && keys(v.rows[0]) === ks(["code", "title_ko", "title_en", "venue_ko", "venue_en", "starts_at", "at"]), v);
  t("도장 없는 회원 → 빈 목록", JSON.stringify((await call(db, CR[0], "gig_my_stamps"))?.rows) === "[]");

  // ── H. 응원 한마디 ─────────────────────────────────────────
  for (const [k, nm] of [[99, "없는 번호 99"], [7, "시드에 없는 7"], [null, "번호 없음"]]) {
    t(`응원 ${nm} → bad_phrase`, (await call(db, KA, "gig_cheer", [CODE, k, true]))?.reason === "bad_phrase");
  }
  await db.exec(`update public.gig_phrases set active = false where k = 6`);
  v = await call(db, KA, "gig_cheer", [CODE, 6, true]);
  w = await call(db, ANON, "gig_event", [CODE]);
  t("꺼진 문구 → bad_phrase · 화면 목록·숫자에서도 빠짐", v?.reason === "bad_phrase" && w?.phrases?.length === 5 && w.counts.cheers.length === 5, [v, w?.phrases?.length]);
  await db.exec(`update public.gig_phrases set active = true where k = 6`);
  v = await call(db, KA, "gig_cheer", [CODE, 1, true]);
  t("응원 1 켜기 → n 1 · 계약 칸", v?.ok === true && v.k === 1 && v.on === true && v.n === 1 && keys(v) === "at,k,n,ok,on", v);
  t("같은 응원 또 켜기 → 여전히 1(한 사람 한 문구 한 번)", (await call(db, KA, "gig_cheer", [CODE, 1, true]))?.n === 1);
  t("다른 회원 응원 1 → 2", (await call(db, ML, "gig_cheer", [CODE, 1, true]))?.n === 2);
  t("응원 1 끄기 → 1", (await call(db, KA, "gig_cheer", [CODE, 1, false]))?.n === 1);
  t("이미 끈 응원 또 끄기 → 1 그대로", (await call(db, KA, "gig_cheer", [CODE, 1, false]))?.n === 1);
  v = await call(db, KA, "gig_cheer", [CODE, 2, true]);
  w = await call(db, KA, "gig_cheer", [CODE, 2, false]);
  t("응원 켬 → 끔 → 0", v?.n === 1 && w?.n === 0 && w.on === false, [v, w]);
  v = await call(db, KA, "gig_cheer", [CODE, 4, null]);
  t("켜기·끄기 값이 비면 켜기", v?.on === true && v.n === 1, v);
  await call(db, KA, "gig_cheer", [CODE, 4, false]);
  await call(db, KA, "gig_cheer", [CODE, 3, true]);
  await call(db, KA, "gig_cheer", [CODE, 1, true]);
  t("내 응원 = [1,3]", JSON.stringify((await call(db, KA, "gig_event", [CODE]))?.me?.cheers) === "[1,3]");
  t("다른 회원의 내 응원 = [1](남의 것이 안 섞임)", JSON.stringify((await call(db, ML, "gig_event", [CODE]))?.me?.cheers) === "[1]");
  v = await call(db, ANON, "gig_pulse", [CODE]);
  t("숫자: 응원 1 → 2 · 3 → 1 · 나머지 0", v?.cheers?.map(c => `${c.k}:${c.n}`).join() === "1:2,2:0,3:1,4:0,5:0,6:0", v?.cheers);

  // ── I. 앵콜·신청곡 투표 ────────────────────────────────────
  t("후보에 없는 곡 → bad_song", (await call(db, KA, "gig_vote", [CODE, "없는 노래"]))?.reason === "bad_song");
  t("빈 곡 이름 → bad_song", (await call(db, KA, "gig_vote", [CODE, "  "]))?.reason === "bad_song");
  v = await call(db, KA, "gig_vote", [CODE, "거위의 꿈"]);
  t("첫 표 → n 1 · prev 없음 · 계약 칸", v?.ok === true && v.song === "거위의 꿈" && v.n === 1 && v.prev === null && v.prev_n === null && keys(v) === "at,n,ok,prev,prev_n,song", v);
  t("다른 회원 같은 곡 → 2", (await call(db, ML, "gig_vote", [CODE, "거위의 꿈"]))?.n === 2);
  v = await call(db, KA, "gig_vote", [CODE, "아버지"]);
  t("표 옮기기 → 새 곡 1 · 옛 곡 2→1", v?.song === "아버지" && v.n === 1 && v.prev === "거위의 꿈" && v.prev_n === 1, v);
  t("한 사람 표는 1행(옮겨도)", (await one(`select count(*)::int from public.gig_votes where user_id = $1`, [KAKAO])) === 1);
  v = await call(db, KA, "gig_vote", [CODE, " 아버지 "]);
  t("같은 곡 다시(앞뒤 빈칸) → 그대로 1", v?.n === 1 && v.prev === "아버지" && v.prev_n === 1, v);
  v = await call(db, KA, "gig_vote", [CODE, null]);
  t("표 취소(null) → song·n null · 옛 곡 0", v?.ok === true && v.song === null && v.n === null && v.prev === "아버지" && v.prev_n === 0, v);
  t("취소 뒤 내 표 0행", (await one(`select count(*)::int from public.gig_votes where user_id = $1`, [KAKAO])) === 0);
  await call(db, KA, "gig_vote", [CODE, "친구여"]);
  t("내 표 = 친구여", (await call(db, KA, "gig_event", [CODE]))?.me?.vote === "친구여");
  v = await call(db, ADM, "admin_gig_set", [E1, null, false]);
  t("운영자가 투표 닫기 → vote_open false · 단계 그대로 open · 계약 칸", v?.ok === true && v.vote_open === false && v.phase === "open" && keys(v) === "ok,phase,vote_open", v);
  t("투표 닫힘 → vote_closed", (await call(db, ML, "gig_vote", [CODE, "아버지"]))?.reason === "vote_closed");
  t("투표 닫힘이 숫자 화면에 보임", (await call(db, ANON, "gig_pulse", [CODE]))?.vote_open === false);
  t("투표가 닫혀도 도장은 된다", (await call(db, CR[0], "gig_checkin", [CODE]))?.ok === true);
  t("투표 값을 비우면(null) 그대로 둔다", (await call(db, ADM, "admin_gig_set", [E1, null, null]))?.vote_open === false);
  await call(db, ADM, "admin_gig_set", [E1, null, true]);
  v = await save(ADM, { ...base(), id: E1, songs: ["아버지", "거위의 꿈"] });
  w = await call(db, ANON, "gig_pulse", [CODE]);
  t("후보 고치기 → 빠진 곡(친구여) 표만 지워짐 · 남는 곡 표 그대로 · 새 순서",
    v?.ok === true && w?.votes?.map(x => `${x.song}:${x.n}`).join() === "아버지:0,거위의 꿈:1", w?.votes);
  t("빠진 곡에 표를 둔 회원은 표 없음", (await call(db, KA, "gig_event", [CODE]))?.me?.vote === null);
  v = await save(ADM, { ...base(), id: E1, songs: ["아버지", "거위의 꿈", ...Array.from({ length: 6 }, (_, i) => `후보${i + 3}`)] });
  t("후보 8곡까지는 된다", v?.ok === true && (await one(`select count(*)::int from public.gig_vote_songs where event_id = $1`, [E1])) === 8, v);
  await save(ADM, { ...base(), id: E1, songs: ["아버지", "거위의 꿈", "친구여"] });
  t("다시 3곡 · 남은 표 그대로(거위의 꿈 1)",
    (await call(db, ANON, "gig_pulse", [CODE]))?.votes?.map(x => `${x.song}:${x.n}`).join() === "아버지:0,거위의 꿈:1,친구여:0");

  // ── J. 단계 — 시간 창 · 운영자 손잡이 ─────────────────────────
  const PRESS4 = who => [["gig_checkin", [CODE]], ["gig_cheer", [CODE, 2, true]], ["gig_vote", [CODE, "아버지"]], ["gig_guestbook_write", [CODE, "단계 시험 글입니다"]]];
  await setWin(E1, "before");
  t("열리기 전 → phase before", (await call(db, ANON, "gig_event", [CODE]))?.event?.phase === "before");
  {
    const rs = await reasonsOf(KA, PRESS4());
    t("열리기 전: 도장·응원·투표·방명록 모두 not_open", rs.every(([, r]) => r === "not_open"), rs);
  }
  t("열리기 전 공연은 코드 없이 안 뜸 · gig_now 에도 안 뜸",
    (await call(db, ANON, "gig_event", [null]))?.reason === "not_found" && (await call(db, ANON, "gig_now"))?.event === null);
  await setWin(E1, "after");
  t("공연 끝 · 방명록 시간 → phase after", (await call(db, ANON, "gig_pulse", [CODE]))?.phase === "after");
  {
    const rs = await reasonsOf(KA, PRESS4().slice(0, 3));
    t("방명록 시간: 도장·응원·투표는 not_open", rs.every(([, r]) => r === "not_open"), rs);
  }
  v = await call(db, ADM, "gig_guestbook_write", [CODE, "방명록 시간에 남기는 운영자 인사"]);
  const ADMPOST = v?.id;
  t("방명록 시간: 방명록은 된다(운영자 → 바로 공개)", v?.ok === true && v.status === "approved", v);
  t("방명록 시간 공연은 gig_now 에 뜬다(after)", (await call(db, ANON, "gig_now"))?.event?.phase === "after");
  t("방명록 시간 공연은 코드 없이 부르면 안 뜸(열린 공연만)", (await call(db, ANON, "gig_event", [""]))?.reason === "not_found");
  await setWin(E1, "closed");
  t("방명록 시간도 지남 → closed · 공연 정보는 계속 읽힘", (await call(db, ANON, "gig_event", [CODE]))?.event?.phase === "closed");
  t("closed: 방명록도 not_open", (await call(db, ML, "gig_guestbook_write", [CODE, "늦은 방명록입니다"]))?.reason === "not_open");
  t("closed 공연은 gig_now 에 안 뜸", (await call(db, ANON, "gig_now"))?.event === null);
  v = await call(db, ADM, "admin_gig_set", [E1, "open", null]);
  t("시간이 지났어도 운영자가 열기 → open · 도장 됨", v?.phase === "open" && (await call(db, CR[1], "gig_checkin", [CODE]))?.ok === true, v);
  await setWin(E1, "open");
  v = await call(db, ADM, "admin_gig_set", [E1, "closed", null]);
  t("열린 시간에 운영자가 닫기 → after(방명록만)", v?.phase === "after", v);
  t("운영자가 닫은 뒤 도장 → not_open", (await call(db, CR[2], "gig_checkin", [CODE]))?.reason === "not_open");
  await setWin(E1, "closed");
  t("닫기 + 방명록 시간도 지남 → closed", (await call(db, ANON, "gig_pulse", [CODE]))?.phase === "closed");
  t("손잡이 값이 엉뚱함 → bad_override", (await call(db, ADM, "admin_gig_set", [E1, "maybe", null]))?.reason === "bad_override");
  t("없는 공연 손잡이 → not_found", (await call(db, ADM, "admin_gig_set", [999999, null, null]))?.reason === "not_found");
  v = await call(db, ADM, "admin_gig_set", [E1, "", null]);
  await setWin(E1, "open");
  t("손잡이를 비우면('' 도) 시간대로 → open", v?.ok === true && (await one(`select override from public.gig_events where id = $1`, [E1])) === null
    && (await call(db, ANON, "gig_pulse", [CODE]))?.phase === "open", v);
  for (const [nm, set, want] of [
    ["열림 = 지금 → open", "override = null, opens_at = now(), closes_at = now() + interval '1 hour', guest_until = now() + interval '2 hours'", "open"],
    ["열림 = 지금 + 1ms → before", "override = null, opens_at = now() + interval '1 millisecond', closes_at = now() + interval '1 hour', guest_until = now() + interval '2 hours'", "before"],
    ["닫힘 = 지금 → 아직 open", "override = null, opens_at = now() - interval '1 hour', closes_at = now(), guest_until = now() + interval '1 hour'", "open"],
    ["닫힘 = 지금 - 1ms → after", "override = null, opens_at = now() - interval '1 hour', closes_at = now() - interval '1 millisecond', guest_until = now() + interval '1 hour'", "after"],
    ["방명록 끝 = 지금 → 아직 after", "override = null, opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour', guest_until = now()", "after"],
    ["방명록 끝 = 지금 - 1ms → closed", "override = null, opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour', guest_until = now() - interval '1 millisecond'", "closed"],
    ["닫기 손잡이 + 방명록 끝 = 지금 → after", "override = 'closed', opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour', guest_until = now()", "after"],
    ["닫기 손잡이 + 방명록 끝 - 1ms → closed", "override = 'closed', opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour', guest_until = now() - interval '1 millisecond'", "closed"],
    ["닫기 손잡이 + 열리기 전 → after(방명록만)", "override = 'closed', opens_at = now() + interval '1 hour', closes_at = now() + interval '2 hours', guest_until = now() + interval '3 hours'", "after"],
    ["열기 손잡이 + 시간 전부 지남 → open", "override = 'open', opens_at = now() - interval '3 days', closes_at = now() - interval '2 days', guest_until = now() - interval '1 day'", "open"],
    ["열기 손잡이 + 열리기 전 → open", "override = 'open', opens_at = now() + interval '1 hour', closes_at = now() + interval '2 hours', guest_until = now() + interval '3 hours'", "open"],
  ]) {
    const got = await phaseAt(E1, set);
    t(`단계 경계: ${nm}`, got === want, got);
  }

  // ── K. 오늘 공연 방명록 ────────────────────────────────────
  for (const [nm, body, why] of [["빈칸만", "     ", "empty"], ["줄바꿈만", "\n\n", "empty"], ["한 글자", "가", "empty"],
                                 ["줄바꿈 사이 한 글자", "\n가\n", "empty"], ["501자", "가".repeat(501), "too_long"]]) {
    t(`방명록 ${nm} → ${why}`, (await call(db, KA, "gig_guestbook_write", [CODE, body]))?.reason === why);
  }
  t("방명록 500자는 된다(정회원 아님 → 확인 대기)", (await call(db, CR[11], "gig_guestbook_write", [CODE, "다".repeat(500)]))?.status === "pending");
  await db.exec(`delete from public.board_posts where user_id = '${CROWD[11]}'`);
  t("검증에 걸린 방명록은 글을 만들지 않음", (await one(`select count(*)::int from public.board_posts where gig_id = $1`, [E1])) === 1);
  v = await call(db, KA, "gig_guestbook_write", [CODE, "  오늘 공연 정말 좋았어요.\n\n다음에 또 올게요  "]);
  const GK = v?.id;
  t("새싹 방명록 → pending(운영자 확인 뒤 공개) · board_write 응답 그대로", v?.ok === true && v.status === "pending" && keys(v) === "id,ok,status", v);
  const gk = (await q(`select board, title, body, gig_id::int as gig_id, status from public.board_posts where id = $1`, [GK]))[0];
  t("방명록 = 후기 게시판 글 · 공연 칸 · 제목은 본문을 한 줄로",
    gk?.board === "review" && gk.gig_id === E1 && gk.title === "오늘 공연 정말 좋았어요. 다음에 또 올게요" && gk.body === "오늘 공연 정말 좋았어요.\n\n다음에 또 올게요", gk);
  t("내 정보: 이 공연 방명록 1편", (await call(db, KA, "gig_event", [CODE]))?.me?.posted === 1);
  v = await call(db, ANON, "gig_guestbook", [CODE, null, 20]);
  t("공개 키: 확인 전 방명록은 안 보임(운영자 글만) · 칸", v?.ok === true && v.rows?.length === 1 && v.rows[0].id === ADMPOST && v.more === false && keys(v) === "more,ok,rows", v);
  v = await call(db, KA, "gig_guestbook", [CODE, null, 20]);
  w = v?.rows?.find(r => r.id === GK);
  t("쓴 사람에게는 확인 중인 내 글이 보임(mine · pending)", w && w.mine === true && w.status === "pending" && v.rows.length === 2, v);
  t("남의 확인 중인 방명록은 안 보임", !((await call(db, ML, "gig_guestbook", [CODE, null, 20]))?.rows || [{ id: GK }]).some(r => r.id === GK));
  t("알림: 새싹 방명록이 대기로 잡힘", (await call(db, ANON, "pending_summary", [null]))?.bpost === 1);
  v = await call(db, ADM, "admin_list", ["pending", 50]);
  t("운영 화면 대기 목록에 방명록이 후기 글로", (v?.rows || []).some(r => r.kind === "bpost" && r.id === GK && r.board === "review"), v?.rows?.length);

  const B50 = "가나다라마바사아자차".repeat(5);
  v = await call(db, ML, "gig_guestbook_write", [CODE, B50]);
  const M1 = v?.id;
  t("정회원 방명록 → 바로 공개 · 본문 41자 넘으면 제목 = 앞 40자 + …",
    v?.status === "approved" && (await one(`select title from public.board_posts where id = $1`, [M1])) === B50.slice(0, 40) + "…", v);
  const B40 = "라".repeat(40);
  v = await call(db, ML, "gig_guestbook_write", [CODE, B40]);
  const M2 = v?.id;
  t("본문 정확히 40자 → 제목에 … 없음", (await one(`select title from public.board_posts where id = $1`, [M2])) === B40);
  v = await call(db, ML, "gig_guestbook_write", [CODE, "세 번째 방명록입니다"]);
  const M3 = v?.id;
  t("공연 하나에 세 편까지 → 세 번째 ok", v?.ok === true, v);
  t("네 번째 → gig_limit", (await call(db, ML, "gig_guestbook_write", [CODE, "네 번째는 막혀야 합니다"]))?.reason === "gig_limit");
  t("공연 제한은 다른 게시판 글과 상관없음", (await call(db, ML, "board_write", ["free", "자유 글입니다", "공연 제한과 별개"]))?.ok === true);
  v = await call(db, ANON, "gig_guestbook", [CODE, null, 20]);
  t("공개 방명록: 운영자 1 + 정회원 3 · 최신순", v?.rows?.map(r => r.id).join() === [M3, M2, M1, ADMPOST].join(), v?.rows?.map(r => r.id));
  t("방명록 줄 칸이 계약과 같다(계정 정보 없음)", keys(v?.rows?.[0]) === ks(["id", "body", "nickname", "level", "staff", "created_at", "mine", "status"]), keys(v?.rows?.[0]));
  t("운영자 글은 staff · 정회원은 member · 공개 키에겐 mine 없음",
    v?.rows?.find(r => r.id === ADMPOST)?.staff === true && v.rows.find(r => r.id === M1)?.level === "member"
    && v.rows.find(r => r.id === M1)?.staff === false && v.rows.every(r => r.mine === false));
  t("쓴 사람에게는 mine", (await call(db, ML, "gig_guestbook", [CODE, null, 20]))?.rows?.filter(r => r.mine).length === 3);
  v = await call(db, ANON, "gig_guestbook", [CODE, null, 2]);
  w = await call(db, ANON, "gig_guestbook", [CODE, v?.rows?.[1]?.id ?? null, 2]);
  t("쪽 넘기기: 2편 · more → 다음 쪽 2편 · 끝", v?.rows?.length === 2 && v.more === true && w?.rows?.length === 2 && w.more === false && w.rows[0].id === M1, [v?.rows?.map(r => r.id), w?.rows?.map(r => r.id)]);
  t("한 쪽 크기는 1~30 으로 자른다(0 → 1)",
    (await call(db, ANON, "gig_guestbook", [CODE, null, 0]))?.rows?.length === 1 && (await call(db, ANON, "gig_guestbook", [CODE, null, 1000]))?.rows?.length === 4);
  v = await approveB(db, GK);
  t("운영자가 새싹 방명록 올리기 → ok", v?.ok === true, v);
  v = await call(db, ANON, "gig_guestbook", [CODE, null, 20]);
  t("올린 뒤 공개 방명록 5편", v?.rows?.length === 5 && v.rows.some(r => r.id === GK && r.status === "approved"), v?.rows?.map(r => r.id));
  const FREE = (await call(db, ADM, "board_write", ["free", "공연과 상관없는 글", "본문입니다"]))?.id;
  const PEND = (await call(db, CR[3], "gig_guestbook_write", [CODE, "새싹의 확인 전 방명록"]))?.id;
  v = await call(db, ANON, "post_gigs", [`{${GK},${M1},${FREE},${PEND},999999}`]);
  t("post_gigs: 공개된 공연 글만 꼬리표(일반 글·확인 전 글·없는 글 제외)",
    v?.ok === true && keys(v.map) === ks([String(GK), String(M1)]) && v.map[String(GK)]?.code === CODE
    && keys(v.map[String(GK)]) === ks(["code", "title_ko", "title_en", "venue_ko", "venue_en", "starts_at"]), v);
  v = await call(db, ANON, "board_list", ["review", null, 20]);
  t("방명록은 후기 게시판 목록에도 그대로 · 010 목록 칸 무변경",
    (v?.rows || []).some(r => r.id === GK) && keys(v.rows[0]) === "board,comments,created_at,cut,edited_at,excerpt,id,level,mine,nickname,staff,title", keys(v?.rows?.[0]));
  t("방명록 글 보기(010 board_read) 그대로", (await call(db, ANON, "board_read", [GK]))?.post?.board === "review");
  for (const i of [4, 5, 6, 7]) await call(db, ADM, "admin_set_level", [CROWD[i], "member"]);
  const LONG = "노래".repeat(225);
  const L1 = (await call(db, CR[4], "gig_guestbook_write", [CODE, LONG]))?.id;
  for (const i of [5, 6, 7]) await call(db, CR[i], "gig_guestbook_write", [CODE, `객석${i + 1}의 방명록입니다`]);

  // ── L. 숫자 정직성 · 새는 것 없음 ────────────────────────────
  v = await call(db, ANON, "gig_pulse", [CODE]);
  t("pulse 칸이 계약과 같다", keys(v) === ks(["ok", "now", "phase", "vote_open", "checkins", "cheers", "votes", "guest", "at"]) && keys(v?.guest) === "approved,latest", keys(v));
  t("pulse 도장 수 = 표의 count(*)", v?.checkins === (await one(`select count(*)::int from public.gig_checkins where event_id = $1`, [E1])), v?.checkins);
  const ownCh = await q(`select p.k, (select count(*) from public.gig_cheers c where c.event_id = $1 and c.k = p.k)::int as n
                           from public.gig_phrases p where p.active order by p.sort`, [E1]);
  t("pulse 응원 수 = 표의 count(*)(문구마다, 0 포함)", v?.cheers?.map(c => `${c.k}:${c.n}`).join() === ownCh.map(c => `${c.k}:${c.n}`).join(), [v?.cheers, ownCh]);
  const ownV = await q(`select s.song, (select count(*) from public.gig_votes x where x.event_id = $1 and x.song = s.song)::int as n
                          from public.gig_vote_songs s where s.event_id = $1 order by s.sort`, [E1]);
  t("pulse 투표 수 = 표의 count(*)(후보마다, 0 포함)", v?.votes?.map(c => `${c.song}:${c.n}`).join() === ownV.map(c => `${c.song}:${c.n}`).join(), [v?.votes, ownV]);
  const ownAp = await one(`select count(*)::int from public.board_posts where gig_id = $1 and status = 'approved'`, [E1]);
  const top5 = (await q(`select id::int as id from public.board_posts where gig_id = $1 and status = 'approved' order by id desc limit 5`, [E1])).map(r => r.id);
  t("pulse 방명록 공개 수 = count(*) · 최근 다섯 줄", v?.guest?.approved === ownAp && v.guest.latest.length === 5 && v.guest.latest.map(r => r.id).join() === top5.join(), [v?.guest?.approved, ownAp]);
  t("pulse 최근 줄 칸(계정 정보 없음)", keys(v?.guest?.latest?.[0]) === ks(["id", "body", "nickname", "level", "staff", "created_at"]), keys(v?.guest?.latest?.[0]));
  t("pulse 최근 줄 본문은 앞 300자 · 방명록 목록은 전문(450자)",
    v?.guest?.latest?.find(r => r.id === L1)?.body?.length === 300
    && (await call(db, ANON, "gig_guestbook", [CODE, null, 30]))?.rows?.find(r => r.id === L1)?.body?.length === 450);
  const outs = {
    "gig_event(회원)": await call(db, KA, "gig_event", [CODE]),
    "gig_event(공개 키)": await call(db, ANON, "gig_event", [CODE]),
    "gig_pulse": await call(db, ANON, "gig_pulse", [CODE]),
    "gig_guestbook(회원)": await call(db, KA, "gig_guestbook", [CODE, null, 30]),
    "gig_now": await call(db, ANON, "gig_now"),
    "post_gigs": await call(db, ANON, "post_gigs", [`{${GK},${M1}}`]),
    "gig_my_stamps": await call(db, KA, "gig_my_stamps"),
    "admin_gig_list": await call(db, ADM, "admin_gig_list"),
  };
  for (const [nm, o] of Object.entries(outs)) {
    const s = JSON.stringify(o);
    t(`${nm}: user_id·계정 아이디·이메일이 어디에도 없음`, o?.ok === true && !/user_id/.test(s) && !UIDS.some(u => s.includes(u)) && !s.includes("@test.local"), s.slice(0, 160));
  }

  // ── M. 운영 목록 ───────────────────────────────────────────
  v = await call(db, ADM, "admin_gig_list");
  const row = v?.rows?.find(r => r.id === E1);
  const oc = (await q(`select (select count(*) from public.gig_checkins where event_id = $1)::int as ck,
                              (select count(*) from public.gig_cheers   where event_id = $1)::int as ch,
                              (select count(*) from public.gig_votes    where event_id = $1)::int as vo,
                              (select count(*) from public.board_posts  where gig_id = $1 and status = 'pending')::int  as gp,
                              (select count(*) from public.board_posts  where gig_id = $1 and status = 'approved')::int as ga`, [E1]))[0];
  t("운영 목록 칸이 계약과 같다", keys(row) === ks(["id", "code", "title_ko", "title_en", "venue_ko", "venue_en", "starts_at", "opens_at", "closes_at", "guest_until",
                                                  "status", "override", "vote_open", "phase", "songs", "checkins", "cheers", "votes", "gb_pending", "gb_approved"]), keys(row));
  t("운영 목록 숫자 = 표의 count(*) (확인 대기 1)", row && row.checkins === oc.ck && row.cheers === oc.ch && row.votes === oc.vo
    && row.gb_pending === oc.gp && row.gb_approved === oc.ga && oc.gp === 1, [row, oc]);
  t("운영 목록 후보곡 = 문자열 배열(순서대로) · 상태·단계", JSON.stringify(row?.songs) === '["아버지","거위의 꿈","친구여"]' && row.status === "published" && row.phase === "open", row);

  // ── N. 속도 제한 — 회원이면 회원, 아니면 IP ───────────────────
  t("속도 제한 열쇠 = 회원(날짜 섞은 해시) · 아이디 원문은 남지 않음",
    (await one(`select count(*)::int from public.rate_counter where bucket = 'gcheck'
                  and ip_hash = encode(sha256(convert_to('u|' || $1 || '|' || to_char(now(), 'YYYY-MM-DD'), 'UTF8')), 'hex')`, [KAKAO])) === 1
    && (await one(`select count(*)::int from public.rate_counter where ip_hash like '%' || $1 || '%'`, [KAKAO])) === 0);
  {
    const res = [];
    for (let i = 1; i <= 31; i++) res.push(await call(db, CR[8], "gig_checkin", [CODE], `192.0.2.${i}`));
    t("한 회원이 IP 를 바꿔 가며 도장 → 30번까지 ok · 31번째 rate_limited",
      res.slice(0, 30).every(x => x?.ok === true) && res[30]?.reason === "rate_limited", res.map(x => x?.ok ? "ok" : x?.reason).slice(25));
    t("같은 IP 의 다른 회원은 막히지 않음", (await call(db, CR[9], "gig_checkin", [CODE], "192.0.2.31"))?.ok === true);
    const a = [];
    for (let i = 0; i < 41; i++) a.push(await call(db, ANON, "request_song", ["거위의 꿈"], "203.0.113.200"));
    const other = await call(db, ANON, "request_song", ["거위의 꿈"], "203.0.113.201");
    t("공개 키(신청곡)는 그대로 IP 기준: 같은 IP 41번째 막힘 · 다른 IP 는 됨",
      a.slice(0, 40).every(x => x?.ok === true) && a[40]?.reason === "rate_limited" && other?.ok === true, [a[39], a[40], other]);
  }

  // ── O. 탈퇴 — 두 경로 모두 함께 지워진다 ──────────────────────
  await call(db, KA, "gig_vote", [CODE, "아버지"]);
  const rowsOf = async uid => (await q(`select (select count(*) from public.gig_checkins where user_id = $1)::int as ck,
                                               (select count(*) from public.gig_cheers   where user_id = $1)::int as ch,
                                               (select count(*) from public.gig_votes    where user_id = $1)::int as vo,
                                               (select count(*) from public.board_posts  where user_id = $1)::int as bp,
                                               (select count(*) from auth.users where id = $1)::int as u`, [uid]))[0];
  const kb = await rowsOf(KAKAO);
  t("탈퇴 전 카카오 회원: 도장 1 · 응원 2 · 표 1 · 방명록 1", kb.ck === 1 && kb.ch === 2 && kb.vo === 1 && kb.bp === 1, kb);
  const before = await call(db, ANON, "gig_pulse", [CODE]);
  v = await call(db, KA, "member_leave");
  const ka = await rowsOf(KAKAO);
  t("탈퇴(계정 삭제 경로) → 도장·응원·투표·방명록·계정 모두 0", v?.ok === true && !v.partial && ka.ck + ka.ch + ka.vo + ka.bp + ka.u === 0, { v, ka });
  const after = await call(db, ANON, "gig_pulse", [CODE]);
  const nk = (p, k) => p?.cheers?.find(c => c.k === k)?.n;
  const ns = (p, s) => p?.votes?.find(c => c.song === s)?.n;
  t("탈퇴하면 공개 숫자도 그만큼 줄어듦(도장 -1 · 응원1 -1 · 응원3 -1 · 아버지 -1 · 방명록 -1)",
    after?.checkins === before.checkins - 1 && nk(after, 1) === nk(before, 1) - 1 && nk(after, 3) === nk(before, 3) - 1
    && ns(after, "아버지") === ns(before, "아버지") - 1 && after.guest.approved === before.guest.approved - 1, [before, after].map(p => [p?.checkins, p?.cheers, p?.votes, p?.guest?.approved]));
  // auth.users 를 지울 권한이 없는 설정(010 의 partial 경로)을 실제로 만들어 본다
  await db.exec(`create function public.__deny_del() returns trigger language plpgsql as $$ begin raise exception 'no' using errcode = '42501'; end $$;
                 create trigger __deny before delete on auth.users for each row when (old.id = '${MAIL}') execute function public.__deny_del();`);
  const mb = await rowsOf(MAIL);
  v = await call(db, ML, "member_leave");
  const ml = await rowsOf(MAIL);
  t("탈퇴(명부만 지우는 partial 경로) → 도장·응원·투표·방명록 0 · 계정 행은 남음",
    mb.ck + mb.ch + mb.vo > 0 && v?.ok === true && v.partial === true && ml.ck + ml.ch + ml.vo + ml.bp === 0 && ml.u === 1, { mb, v, ml });
  await db.exec(`drop trigger __deny on auth.users; drop function public.__deny_del();`);

  v = await save(ADM, { ...base(), title_ko: "지울 공연", status: "published", songs: ["아버지"] });
  const E2 = v?.id, C2 = v?.code;
  const gp = (await call(db, ADM, "gig_guestbook_write", [C2, "지울 공연의 방명록"]))?.id;
  await call(db, CR[5], "gig_checkin", [C2]);
  await call(db, CR[5], "gig_vote", [C2, "아버지"]);
  await call(db, CR[5], "gig_cheer", [C2, 1, true]);
  await db.exec(`delete from public.gig_events where id = ${Number(E2)}`);
  const lf = (await q(`select (select gig_id from public.board_posts where id = $1) as g, (select count(*) from public.board_posts where id = $1)::int as n,
                              (select count(*) from public.gig_vote_songs where event_id = $2)::int as vs, (select count(*) from public.gig_votes where event_id = $2)::int as vo,
                              (select count(*) from public.gig_checkins where event_id = $2)::int as ck, (select count(*) from public.gig_cheers where event_id = $2)::int as ch`, [gp, E2]))[0];
  t("공연을 지우면 도장·응원·후보·표는 함께, 방명록 글은 남는다(공연 칸만 비움)", gp && lf.n === 1 && lf.g === null && lf.vs + lf.vo + lf.ck + lf.ch === 0, lf);

  // ── Q. 지금 공연 고르기 · 보관 ───────────────────────────────
  await setWin(E1, "closed");
  const E3 = await save(ADM, { ...base(), title_ko: "방명록 시간 공연", status: "published", starts_at: iso(-2 * H), opens_at: iso(-3 * H), closes_at: iso(-1 * H), guest_until: iso(24 * H) });
  const E4 = await save(ADM, { ...base(), title_ko: "늦게 시작하는 공연", status: "published", starts_at: iso(5 * H), opens_at: iso(-1 * H), closes_at: iso(6 * H), guest_until: iso(24 * H) });
  await save(ADM, { ...base(), title_ko: "공개 전 공연", starts_at: iso(0), opens_at: iso(-1 * H), closes_at: iso(2 * H), guest_until: iso(24 * H) });
  v = await call(db, ANON, "gig_now");
  t("gig_now: open·after 공개 공연 중 시작이 가장 가까운 것(공개 전·closed 제외)", v?.event?.code === E3?.code && v.event.phase === "after", [v?.event, E3?.code]);
  t("코드 없이: 열린(open) 공개 공연만 → 늦게 시작하는 공연", (await call(db, ANON, "gig_event", [null]))?.event?.code === E4?.code);
  const E6 = await save(ADM, { ...base(), title_ko: "곧 시작하는 공연", status: "published", starts_at: iso(1 * H), opens_at: iso(-1 * H), closes_at: iso(3 * H), guest_until: iso(24 * H) });
  t("열린 공개 공연이 둘이면 시작이 더 가까운 쪽", (await call(db, ANON, "gig_event", [""]))?.event?.code === E6?.code);
  await call(db, CR[0], "gig_checkin", [E6?.code]);
  v = await call(db, CR[0], "gig_my_stamps");
  t("보관 전 내 도장 2개(시작이 늦은 공연 먼저)", v?.rows?.map(r => r.code).join() === [E6?.code, CODE].join(), v);
  v = await save(ADM, { ...base(), id: E6?.id, title_ko: "곧 시작하는 공연", status: "archived", starts_at: iso(1 * H), opens_at: iso(-1 * H), closes_at: iso(3 * H), guest_until: iso(24 * H) });
  t("보관한 공연은 코드로도 못 찾음(운영자도)", v?.ok === true && (await call(db, ADM, "gig_event", [E6?.code]))?.reason === "not_found"
    && (await call(db, ANON, "gig_pulse", [E6?.code]))?.reason === "not_found");
  t("보관해도 내 도장은 남는다", (await call(db, CR[0], "gig_my_stamps"))?.rows?.length === 2);
  t("운영 목록에는 보관 공연도 보인다", (await call(db, ADM, "admin_gig_list"))?.rows?.some(r => r.id === E6?.id && r.status === "archived"));

  // ── P. 운영 중 다시 실행 ────────────────────────────────────
  await db.exec(`update public.board_settings set value = 30 where key = 'gig_poll_s'; update public.gig_phrases set ko = '사랑합니다' where k = 1;`);
  const snap = async () => (await q(`select (select count(*) from public.gig_events)::int as e, (select count(*) from public.gig_checkins)::int as c,
      (select count(*) from public.gig_cheers)::int as ch, (select count(*) from public.gig_votes)::int as vo,
      (select count(*) from public.gig_vote_songs)::int as vs, (select count(*) from public.gig_phrases)::int as ph,
      (select count(*) from public.board_posts where gig_id is not null)::int as bp,
      (select string_agg(code || status, ',' order by id) from public.gig_events) as codes`))[0];
  const s1 = await snap();
  let rerun;
  try { const r = await db.exec(sql011); rerun = r[r.length - 1].rows; } catch (e) { rerun = { err: String(e.message || e).slice(0, 200) }; }
  const s2 = await snap();
  t("운영 중 다시 실행(데이터 있음) → 성공 · ✅ 10", Array.isArray(rerun) && rerun.filter(r => r["결과"] === "✅").length === 10 && !rerun.some(r => r["결과"] === "❌"), rerun);
  t("다시 실행해도 공연·도장·응원·투표·후보·방명록 그대로", JSON.stringify(s1) === JSON.stringify(s2), [s1, s2]);
  t("다시 실행해도 바꾼 설정값(30초)·고친 문구 그대로", (await call(db, ANON, "gig_event", [E4?.code]))?.poll_s === 30
    && (await one(`select ko from public.gig_phrases where k = 1`)) === "사랑합니다");
  t("ℹ️ 줄: 간격 30초 · 공연 개수", Array.isArray(rerun) && rerun.some(r => r["결과"] === "ℹ️" && r["점검"].includes("30초") && r["점검"].includes(`공연 ${s2.e}개`)), rerun);
  t("다시 실행해도 게시판 공연 칸 FK 는 하나",
    (await one(`select count(*)::int from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
                 where c.contype = 'f' and c.conrelid = 'public.board_posts'::regclass and a.attname = 'gig_id'`)) === 1);
  return R;
}

// ── 011 전: 운영 결함이 실제로 있었는지(테스트가 헛것을 고치는 게 아닌지) ──
async function preDefects() {
  const R = [];
  const db = await base10();
  const p = (await db.query(`select has_function_privilege('anon', 'public.req_ip_hash()', 'EXECUTE') as a,
                                    has_function_privilege('anon', 'public.rate_ok(text,integer)', 'EXECUTE') as b`)).rows[0];
  const callIp = await call(db, ANON, "req_ip_hash");
  R.push({ name: "011 전(결함 재현): 공개 키가 req_ip_hash·rate_ok 를 PUBLIC 경유로 실행할 수 있었다", ok: p.a === true && p.b === true && typeof callIp === "string", info: JSON.stringify([p, callIp]) });
  const joins = [];
  for (let i = 0; i < CR.length; i++) joins.push(await call(db, CR[i], "member_join", [`객석${i + 1}`, true, true], "198.51.100.77"));
  R.push({ name: "011 전(결함 재현): 같은 IP 의 11번째 가입이 막혔다", ok: joins.slice(0, 10).every(x => x?.ok) && joins[10]?.reason === "rate_limited",
           info: JSON.stringify(joins.map(x => x?.ok ? "ok" : x?.reason)) });
  return R;
}

// ── 010 검사(check_board_sql.mjs)를 011 을 얹은 상태로 다시 ─────
function boardWith011() {
  const src = path.join(SUPA, "..", "scripts", "check_board_sql.mjs");
  if (!fs.existsSync(src)) return { ok: false, line: `찾지 못함: ${src}` };
  const anchor = "db.__report = r2[r2.length - 1].rows;";
  const text = fs.readFileSync(src, "utf8");
  if (!text.includes(anchor)) return { ok: false, line: "check_board_sql.mjs 의 끼울 자리를 찾지 못함(구조가 바뀜)" };
  const patched = text.replace(anchor, anchor + "\n  await db.exec(fs.readFileSync(process.env.SQL011, \"utf8\"));  // 011 을 얹는다");
  const tmp = path.join(HERE, ".check_board_with_011.mjs");
  fs.writeFileSync(tmp, patched);
  try {
    const r = spawnSync(process.execPath, [tmp, SUPA], { env: { ...process.env, SQL011: path.join(SUPA, F011) }, encoding: "utf8", maxBuffer: 64 << 20 });
    const out = (r.stdout || "") + (r.stderr || "");
    const main = out.match(/본 검사: (\d+)\/(\d+) 통과/);
    const mut = out.match(/뮤테이션: (\d+)\/(\d+) 잡음/);
    const ok = r.status === 0 && main && main[1] === main[2] && mut && mut[1] === mut[2];
    const bad = out.split("\n").filter(l => /✗|★못 잡음|적용 실패/.test(l)).slice(0, 10).join("\n");
    return { ok, line: `본 검사 ${main ? main[1] + "/" + main[2] : "?"} · 뮤테이션 ${mut ? mut[1] + "/" + mut[2] : "?"} · 종료코드 ${r.status}` + (bad ? "\n" + bad : "") };
  } finally { fs.rmSync(tmp, { force: true }); }
}

const sql = read(F011);
let fail = 0, total = 0;

console.log("── 011 전: 고치려는 결함이 실제로 있었나");
for (const r of await preDefects()) { total++; if (!r.ok) fail++; console.log(`${r.ok ? "  ✓" : "  ✗"} ${r.name}${r.ok ? "" : "  ← " + r.info.slice(0, 300)}`); }

console.log("\n── 001~010 → 011 ×2 → 공연 모드 전 과정");
let res;
try { res = await suite(await build(sql), sql); }
catch (e) { res = [{ name: "검사 실행 자체가 실패", ok: false, info: String(e.stack || e).slice(0, 600) }]; }
for (const r of res) { total++; if (!r.ok) fail++; console.log(`${r.ok ? "  ✓" : "  ✗"} ${r.name}${r.ok ? "" : "  ← " + r.info.slice(0, 300)}`); }
console.log(`\n본 검사: ${total - fail}/${total} 통과`);

let boardOk = true;
if (!QUICK) {
  console.log("\n── 010 검사(check_board_sql.mjs)를 011 을 얹은 상태로 다시");
  const b = boardWith011();
  boardOk = b.ok;
  console.log(`  ${b.ok ? "✓" : "✗"} ${b.line}`);
}

const MUT = [
  ["체크인 표를 공개 키에 엶", s => s.replace("revoke all on public.gig_checkins from anon, authenticated;", "grant select on public.gig_checkins to anon;")],
  ["체크인 기본키 없음(두 번 누르면 두 줄)", s => s.replace("  constraint gig_checkins_pk primary key (event_id, user_id),\n", "")],
  ["1인 1표가 아님(기본키에 곡까지)", s => s.replace("constraint gig_votes_pk primary key (event_id, user_id),", "constraint gig_votes_pk primary key (event_id, user_id, song),")],
  ["단계 비교 뒤집기(열리기 전)", s => s.replace("if now() < e.opens_at then", "if now() > e.opens_at then")],
  ["닫힘 경계 하나 어긋남(<=  → <)", s => s.replace("elsif now() <= e.closes_at then", "elsif now() < e.closes_at then")],
  ["닫기 손잡이가 방명록 시간을 무시", s => s.replace("return case when now() <= e.guest_until then 'after' else 'closed' end;", "return 'closed';")],
  ["속도 제한을 IP 기준으로 되돌림", s => s.replace(/h    text := case when auth\.uid\(\) is not null[\s\S]*?else public\.req_ip_hash\(\) end;/, "h    text := public.req_ip_hash();")],
  ["속도 제한 열쇠 조건 뒤집기(정의엔 auth.uid 남음)", s => s.replace("h    text := case when auth.uid() is not null", "h    text := case when auth.uid() is null")],
  ["rate_ok 의 PUBLIC 회수 빠짐(001 결함 그대로)", s => s.replace("revoke execute on function public.rate_ok(text, int)                     from public, anon, authenticated;", "revoke execute on function public.rate_ok(text, int)                     from anon, authenticated;")],
  ["공연 찾기 도우미를 밖에 열어 둠", s => s.replace("revoke execute on function public.gig_find(text)                         from public, anon, authenticated;\n", "")],
  ["탈퇴 연결 cascade → restrict(도장)", s => s.replace("constraint gig_checkins_member_fk foreign key (user_id) references public.members (user_id) on delete cascade", "constraint gig_checkins_member_fk foreign key (user_id) references public.members (user_id) on delete restrict")],
  ["탈퇴 연결 빠짐(응원 · no action)", s => s.replace("constraint gig_cheers_member_fk foreign key (user_id) references public.members (user_id) on delete cascade", "constraint gig_cheers_member_fk foreign key (user_id) references public.members (user_id)")],
  ["공연 칸 FK 가 cascade(공연 지우면 팬 글도 사라짐)", s => s.replace("foreign key (gig_id) references public.gig_events (id) on delete set null;", "foreign key (gig_id) references public.gig_events (id) on delete cascade;")],
  ["pulse 에 user_id 실음", s => s.replace("    select p.id, left(p.body, 300) as body, m.nickname, m.level,", "    select p.id, p.user_id, left(p.body, 300) as body, m.nickname, m.level,")],
  ["도장 수를 부풀림(+1)", s => s.replace("'checkins', (select count(*) from public.gig_checkins c where c.event_id = p_id),", "'checkins', (select count(*) + 1 from public.gig_checkins c where c.event_id = p_id),")],
  ["0 인 문구를 숫자에서 뺌(inner join)", s => s.replace("        left join (select ch.k, count(*) as n", "        join (select ch.k, count(*) as n")],
  ["체크인을 공개 키에 엶", s => s.replace("grant execute on function public.gig_checkin(text)                       to authenticated;", "grant execute on function public.gig_checkin(text)                       to anon, authenticated;")],
  ["차단 회원도 도장", s => s.replace("  if v_lv = 'blocked' then\n    return json_build_object('ok', false, 'reason', 'blocked');\n  end if;\n  e := public.gig_find(p_code);", "  e := public.gig_find(p_code);")],
  ["방명록 시간에도 도장", s => s.replace("if public.gig_phase(e) <> 'open' then", "if public.gig_phase(e) not in ('open', 'after') then")],
  ["closed 에도 방명록", s => s.replace("if public.gig_phase(e) not in ('open', 'after') then", "if public.gig_phase(e) not in ('open', 'after', 'closed') then")],
  ["꺼진 응원 문구도 받음", s => s.replace("where p.k = p_k and p.active)", "where p.k = p_k)")],
  ["응원 끄기가 안 지움", s => s.replace("    delete from public.gig_cheers ch where ch.event_id = e.id and ch.user_id = v_uid and ch.k = p_k;", "    null;")],
  ["투표 닫힘 무시", s => s.replace("  if not e.vote_open then\n    return json_build_object('ok', false, 'reason', 'vote_closed');", "  if false then\n    return json_build_object('ok', false, 'reason', 'vote_closed');")],
  ["후보 고치면 남는 곡 표도 사라짐", s => s.replace("delete from public.gig_vote_songs s where s.event_id = v_id and not (s.song = any (v_songs));", "delete from public.gig_vote_songs s where s.event_id = v_id;")],
  ["방명록에 공연 칸을 안 붙임", s => s.replace("    update public.board_posts set gig_id = e.id where id = (v ->> 'id')::bigint;", "    null;")],
  ["공연당 세 편 제한 없음", s => s.replace("bp.user_id = v_uid) >= 3 then", "bp.user_id = v_uid) >= 300 then")],
  ["제목 말줄임표 빠짐", s => s.replace("rtrim(left(v_flat, 40)) || '…'", "rtrim(left(v_flat, 40))")],
  ["남의 확인 중 방명록이 보임", s => s.replace("       and (p.status = 'approved' or (p.status = 'pending' and p.user_id = v_uid))\n       and (p_before", "       and (p.status = 'approved' or p.status = 'pending')\n       and (p_before")],
  ["post_gigs 가 확인 전 글에도 꼬리표", s => s.replace("   where p.id = any (coalesce(p_ids, '{}'::bigint[]))\n     and p.status = 'approved'\n", "   where p.id = any (coalesce(p_ids, '{}'::bigint[]))\n")],
  ["내 응원에 남의 것까지", s => s.replace("from public.gig_cheers ch where ch.event_id = e.id and ch.user_id = v_uid),", "from public.gig_cheers ch where ch.event_id = e.id),")],
  ["내 도장에 남의 것까지", s => s.replace("     where c.user_id = v_uid\n  ) x;", "  ) x;")],
  ["운영자 아닌 사람도 공개 전 공연을 찾음", s => s.replace("and (g.status = 'published' or (v_admin and g.status = 'draft'))", "and g.status in ('published', 'draft')")],
  ["보관한 공연도 찾음", s => s.replace("and (g.status = 'published' or (v_admin and g.status = 'draft'))", "and (g.status in ('published', 'archived') or (v_admin and g.status = 'draft'))")],
  ["공개된 공연 코드도 다시 만듦", s => s.replace("if not v_new and v_regen and v_old.status <> 'draft' then", "if false then")],
  ["운영 목록이 운영자를 안 봄", s => s.replace("  if not public.is_admin() then\n    return json_build_object('ok', false, 'reason', 'forbidden');\n  end if;\n  select coalesce(json_agg(x order by x.starts_at desc", "  select coalesce(json_agg(x order by x.starts_at desc")],
  ["공연 시간 검증 빠짐", s => s.replace("\n     or not (v_opens < v_closes and v_closes <= v_guest) then", " then")],
];

let caught = 0, applied = 0;
if (!QUICK) {
  console.log("\n── 뮤테이션(일부러 망가뜨린 011) — 각각 잡혀야 한다");
  for (const [name, mut] of MUT) {
    const m = mut(sql);
    if (m === sql) { console.log(`  ? 뮤테이션 적용 실패: ${name}`); continue; }
    applied++;
    let hit = null, built = null;
    try { built = await build(m); }
    catch (e) { hit = `안전장치가 전체 취소: ${String(e.message || e).split("\n")[0].slice(0, 70)}`; }
    if (built) {
      try {
        const broke = (await suite(built, m, true)).filter(x => !x.ok);
        if (broke.length) hit = broke[0].name;
      } catch (e) {
        hit = e instanceof Caught ? e.message : `검사 중 예외(망가진 응답): ${String(e.message || e).slice(0, 70)}`;
      }
    }
    if (hit) caught++;
    console.log(`  ${hit ? "잡음" : "★못 잡음"} — ${name}${hit ? "  (" + hit + ")" : ""}`);
  }
  console.log(`뮤테이션: ${caught}/${MUT.length} 잡음`);
}

const ok = fail === 0 && boardOk && (QUICK || (applied === MUT.length && caught === MUT.length));
console.log(ok ? "\n전부 통과" : "\n실패 있음");
process.exit(ok ? 0 : 1);
