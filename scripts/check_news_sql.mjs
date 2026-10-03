// 실행: 아무 빈 폴더에서 `npm i @electric-sql/pglite` 한 뒤
//       node <이 파일> <저장소>/supabase
//
// 015(회원 소식 메일 동의) 검증 — 실제 PostgreSQL(PGlite)에 001~014 를 순서대로 깔고 015 를 두 번 실행(멱등)한 뒤,
// 카카오 회원·이메일 회원·가입 안 한 계정·차단 회원·객석 12명(같은 와이파이)·공개 키(익명)로
// 받기 → 다시 받기 → 주소 바꾸기 → 그만 받기 → 속도 제한 → 탈퇴까지 돌린다.
// 마지막에 일부러 망가뜨린 015 로 다시 돌려, 테스트(또는 SQL 의 안전장치)가 잡는지 본다.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

const SUPA = process.argv[2];
if (!SUPA) { console.error("사용법: node check_news_sql.mjs <저장소>/supabase"); process.exit(1); }
const ALL = fs.readdirSync(SUPA).filter(f => /^0\d\d.*\.sql$/.test(f)).sort();
const BEFORE = ALL.filter(f => /^0(0[1-9]|1[0-4])/.test(f));
const F015 = ALL.find(f => /^015/.test(f));
if (BEFORE.length !== 14 || !F015) { console.error("001~014 와 015 를 찾지 못했습니다:", ALL); process.exit(1); }
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

let pass = 0, fail = 0;
const t = (name, ok, info) => { if (ok) pass++; else fail++; console.log((ok ? "  ✓ " : "  ✗ ") + name + (ok ? "" : "   ← " + JSON.stringify(info).slice(0, 200))); };

async function world(src015) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  for (const f of BEFORE) {
    // 012 는 운영 공연 등록 — 시험 DB 에는 없어도 된다(있어도 무해). 001~014 그대로 깐다
    await db.exec(read(f));
  }
  await seedUsers(db);
  // 가입은 IP 마다 따로(010 의 가입 속도 제한에 걸리지 않게 — 여기서 보는 것은 015 다)
  const joiners = [[KA, "홍천팬"], [ML, "메일팬"], [BL, "차단팬"], ...CR.map((c, i) => [c, "객석" + (i + 1)])];
  for (let i = 0; i < joiners.length; i++) {
    const r = await call(db, joiners[i][0], "member_join", [joiners[i][1], true, true], "192.0.2." + (i + 10));
    if (!r || !r.ok) throw new Error("시험 회원 가입 실패: " + JSON.stringify(r));
  }
  await db.exec(`update public.members set level = 'blocked' where user_id = '${BLOCK}'`);
  let err = null;
  try { await db.exec(src015); const r2 = await db.exec(src015); db.__report = r2[r2.length - 1].rows; }
  catch (e) { err = String(e.message || e); try { await db.exec("rollback"); } catch (e2) {} }
  db.__err = err;
  return db;
}
const rows = async (db, sql, p = []) => (await db.query(sql, p)).rows;

// 본 검사 — 한 묶음으로 돌리고, 뮤테이션 때도 같은 묶음을 다시 돌린다(무엇이 깨졌는지 이름으로 남긴다)
async function suite(db, say) {
  const bad = [];
  const ok = (name, cond, info) => { if (!cond) bad.push(name); if (say) t(name, cond, info); };
  ok("015 두 번 실행 — 오류 없음", !db.__err, db.__err);
  if (db.__err) return bad;
  const rep = db.__report || [];
  ok("확인표 1~5 전부 ✅", rep.filter(r => r["결과"] === "✅").length === 5 && !rep.some(r => r["결과"] === "❌"), rep);
  ok("익명 → 받기 함수 권한 없음", denied(await call(db, ANON, "member_news_set", [true, "a@example.com", "join"])), null);
  ok("익명 → 보기 함수 권한 없음", denied(await call(db, ANON, "member_news_get")), null);
  ok("익명 → 표 직접 읽기 권한 없음", /permission denied/.test((await as(db, ANON, "select * from public.member_news")).err || ""), null);
  ok("로그인 권한 → 표 직접 읽기 권한 없음", /permission denied/.test((await as(db, KA, "select * from public.member_news")).err || ""), null);
  ok("토큰 없는 로그인 권한 → not_logged_in", (await call(db, NOTOKEN, "member_news_set", [true, "a@example.com", "join"]))?.reason === "not_logged_in", null);
  ok("가입 안 한 계정 → not_member", (await call(db, NJ, "member_news_set", [true, "nojoin@test.local", "join"]))?.reason === "not_member", null);

  const a = await call(db, KA, "member_news_set", [true, " fan@example.com ", "gig:5UYX8"]);
  ok("카카오 회원 받기 → ok · 주소 앞뒤 빈칸은 걷음", a?.ok && a.on === true && a.email === "fan@example.com", a);
  const r1 = await rows(db, "select email, source, agreed_at::text at from public.member_news where user_id = $1", [KAKAO]);
  ok("표에 한 줄 · 꼬리표 gig:5UYX8", r1.length === 1 && r1[0].email === "fan@example.com" && r1[0].source === "gig:5UYX8", r1);
  const g = await call(db, KA, "member_news_get");
  ok("내 동의 보기 → 받는 중 · 내 주소", g?.ok && g.on === true && g.email === "fan@example.com", g);
  const g2 = await call(db, ML, "member_news_get");
  ok("다른 회원의 보기에는 남의 주소가 안 나옴", g2?.ok && g2.on === false && !JSON.stringify(g2).includes("fan@example.com"), g2);
  await call(db, KA, "member_news_set", [true, "fan@example.com", "me"]);
  const r2 = await rows(db, "select agreed_at::text at, source from public.member_news where user_id = $1", [KAKAO]);
  ok("같은 주소로 다시 → 동의 시각·꼬리표 그대로", r2[0].at === r1[0].at && r2[0].source === "gig:5UYX8", [r1, r2]);
  const b = await call(db, KA, "member_news_set", [true, "not-an-email", "me"]);
  ok("주소 모양이 틀리면 bad_email · 표는 그대로", b?.reason === "bad_email" && (await rows(db, "select email from public.member_news where user_id = $1", [KAKAO]))[0].email === "fan@example.com", b);
  const s = await call(db, ML, "member_news_set", [true, "mail@example.com", "x'; drop table--"]);
  ok("이상한 꼬리표 → 받되 꼬리표는 남기지 않음", s?.ok && (await rows(db, "select source from public.member_news where user_id = $1", [MAIL]))[0].source === null, s);
  const bl = await call(db, BL, "member_news_set", [true, "block@test.local", "join"]);
  ok("차단 회원 받기 → blocked", bl?.reason === "blocked", bl);
  const bl2 = await call(db, BL, "member_news_set", [false, null, null]);
  ok("차단 회원도 그만 받기는 됨", bl2?.ok && bl2.on === false, bl2);
  const off = await call(db, ML, "member_news_set", [false, null, null]);
  ok("그만 받기 → 표에서 지워짐", off?.ok && (await rows(db, "select 1 from public.member_news where user_id = $1", [MAIL])).length === 0, off);
  // 같은 와이파이(같은 IP)의 객석 12명 — 서로 막지 않는다
  let crowdOk = 0;
  for (let i = 0; i < CR.length; i++) {
    const r = await call(db, CR[i], "member_news_set", [true, `seat${i + 1}@example.com`, "gig:5UYX8"], "198.51.100.9");
    if (r?.ok) crowdOk++;
  }
  ok("같은 IP 객석 12명 모두 받기 ok", crowdOk === 12, crowdOk);
  // 한 회원이 주소를 계속 바꾸면 막힌다
  let last = null;
  for (let i = 0; i < 12; i++) last = await call(db, CR[0], "member_news_set", [true, `swap${i}@example.com`, "me"]);
  ok("한 회원이 주소를 열두 번 바꾸면 rate_limited", last?.reason === "rate_limited", last);
  ok("막힌 뒤에도 그만 받기는 됨", (await call(db, CR[0], "member_news_set", [false, null, null]))?.ok === true, null);
  // 탈퇴 → 주소도 사라진다
  const lv = await call(db, KA, "member_leave");
  ok("탈퇴 → 소식 주소도 지워짐", lv?.ok && (await rows(db, "select 1 from public.member_news where user_id = $1", [KAKAO])).length === 0, lv);
  // 옛 구독 명단·공개 목록은 그대로
  const bl3 = await call(db, ANON, "board_list", [null, null, 5]);
  ok("공개 게시판 목록에 주소가 섞이지 않음", bl3?.ok && !JSON.stringify(bl3).includes("@example.com"), null);
  return bad;
}

const db = await world(read(F015));
await suite(db, true);

// 뮤테이션 — 015 를 망가뜨리면 검사(또는 안전장치)가 잡는가
const muts = [
  ["익명에게 열어 줌", s => s.replace("grant  execute on function public.member_news_get()                    to authenticated;", "grant  execute on function public.member_news_get()                    to authenticated;\ngrant execute on function public.member_news_set(boolean, text, text) to anon;")],
  ["탈퇴해도 주소가 남음", s => s.replace("references public.members (user_id) on delete cascade,", "references public.members (user_id),").replace("c.confdeltype = 'c') <> 1 then", "c.confdeltype = 'a') <> 1 then")],
  ["속도 제한을 뺌(남의 주소를 마구 넣을 수 있음)", s => s.replace("if not public.rate_ok('news', 10) then", "if false then")],
  ["차단 회원은 그만 받기도 못 함", s => s.replace("  -- 그만 받기 — 언제나 된다\n", "  if v_lv = 'blocked' then return json_build_object('ok', false, 'reason', 'blocked'); end if;\n")],
  ["차단 회원도 받음", s => s.replace("if v_lv = 'blocked' then\n    return json_build_object('ok', false, 'reason', 'blocked');\n  end if;\n  if v_em = ''", "if v_em = ''")],
  ["같은 주소에 동의 시각을 새로 씀", s => s.replace("if exists (select 1 from public.member_news where user_id = v_uid and email = v_em) then", "if false then")],
  ["표를 로그인 권한에 열어 줌", s => s.replace("revoke all on public.member_news from public, anon, authenticated;", "revoke all on public.member_news from public, anon;\ngrant select on public.member_news to authenticated;").replace("begin perform * from public.member_news limit 1;\n    raise exception '안전장치: 로그인 권한으로", "begin perform 1;\n    raise exception '안전장치: 로그인 권한으로").replace("raise exception '안전장치: 로그인 권한으로 소식 명단 표가 통째로 읽힙니다 — 전체를 취소합니다';\n  exception when insufficient_privilege then null; end;", "exception when insufficient_privilege then null; end;")],
];
let caught = 0;
for (const [name, f] of muts) {
  const src2 = f(read(F015));
  if (src2 === read(F015)) { console.log("  ? 뮤테이션 적용 실패: " + name); continue; }
  const d2 = await world(src2);
  const bad = await suite(d2, false);
  const got = bad.length > 0;
  caught += got ? 1 : 0;
  console.log("  " + (got ? "잡음" : "★못 잡음") + " — " + name + (got ? " (" + bad[0].slice(0, 40) + (d2.__err ? " · 안전장치: " + d2.__err.slice(0, 40) : "") + ")" : ""));
}
console.log(`\n본 검사: ${pass}/${pass + fail} 통과\n뮤테이션: ${caught}/${muts.length} 잡음`);
process.exit(fail || caught !== muts.length ? 1 : 0);
