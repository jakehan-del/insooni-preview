// 실행: 아무 빈 폴더에서 `npm i @electric-sql/pglite` 한 뒤
//       node <이 파일> <저장소>/supabase
// 009 검증 — 실제 PostgreSQL(PGlite)에 001~009 를 그대로 깔고, 공개 키(anon) 권한으로
// pending_summary 를 부른다. 마지막에 일부러 망가뜨린 009 로 다시 돌려 테스트가 잡는지 본다.
// 흉내 내는 Supabase 기본값은 check_admin_sql.mjs 와 같다(새 함수가 anon 에게 자동으로 열린다).
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

const SUPA = process.argv[2];
const BASE = fs.readdirSync(SUPA).filter(f => /^00[1-8].*\.sql$/.test(f)).sort();
const F009 = fs.readdirSync(SUPA).find(f => /^009.*\.sql$/.test(f));

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
alter default privileges in schema public grant execute on functions to anon, authenticated;
grant usage on schema public to anon, authenticated;
`;

// 대기 글을 미리 넣어 둔 채로 009 를 깔 수도 있게 한다 — 안전장치의 '운영자 건수 = 공개 키 건수'
// 대조는 대기가 0건이면 0 = 0 으로 늘 통과해 버린다. 운영 DB 처럼 대기가 있는 상태에서도 깐다.
async function build(sql009, preseed = false) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(STUB);
  for (const f of BASE) await db.exec(fs.readFileSync(path.join(SUPA, f), "utf8"));
  if (preseed) await seed(db);
  await db.exec(sql009);
  const res2 = await db.exec(sql009);                       // 두 번 — 멱등성
  db.__report = res2[res2.length - 1].rows;
  db.__seeded = preseed;
  return db;
}

async function asAnon(db, sql, params = []) {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    await db.query("select set_config('request.headers', $1, true)", [JSON.stringify({ "x-forwarded-for": "203.0.113.7" })]);
    await db.exec("set local role anon");
    const r = await db.query(sql, params);
    await db.exec("commit");
    return { rows: r.rows };
  } catch (e) {
    await db.exec("rollback");
    return { err: String(e.message || e) };
  }
}
const j = r => (r.rows && r.rows[0]) ? Object.values(r.rows[0])[0] : null;
const summary = async (db, since = null) =>
  j(await asAnon(db, "select public.pending_summary($1::timestamptz) as s", [since]));
const isHour = iso => { const d = new Date(iso); return d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0; };

async function seed(db) {
  // 운영자(postgres)로 직접 넣는다 — 상태와 시각을 마음대로 정하기 위해.
  // 대기: 한 줄 4 · 꿈 1 · 편지 1 · 게시글 1 = 7
  //   종류마다 1건 이상 두어야 '한 종류를 빠뜨리는' 고장이 드러난다(첫 실행에서 놓쳤다).
  //   '경계' 한 줄은 지난 시(時)의 한가운데 — 기준을 그 시의 끝(59분)으로 줘도 시 단위로
  //   내리면 포함되고, 내리지 않으면 빠진다. 시 단위 내림이 실제로 걸렸는지 가른다.
  // 대기 아님: 승인 한 줄·내린 꿈·승인 편지·승인 게시글·승인 응원 — 하나도 세면 안 된다
  await db.exec(`
    insert into public.notes (body, status, created_at) values
      ('대기1', 'pending', now() - interval '3 days'),
      ('대기2', 'pending', now() - interval '2 hours'),
      ('대기3', 'pending', now() - interval '10 minutes'),
      ('경계 대기', 'pending', date_trunc('hour', now()) - interval '30 minutes'),
      ('승인',  'approved', now() - interval '1 hour');
    insert into public.dreams (text, status, created_at) values
      ('꿈대기', 'pending', now() - interval '5 hours'),
      ('꿈내림', 'rejected', now() - interval '1 hour');
    insert into public.letters (body, status, created_at) values
      ('편지 대기 본문', 'pending', now() - interval '30 minutes'),
      ('편지 승인 본문', 'approved', now() - interval '30 minutes');
    insert into public.posts (body, status, created_at) values
      ('게시 대기 본문', 'pending', now() - interval '20 hours'),
      ('게시 승인 본문', 'approved', now() - interval '20 hours');
    insert into public.cheers (text, status) values ('응원', 'approved');
  `);
}

async function suite(db) {
  const R = [];
  const t = (name, ok, info = "") => R.push({ name, ok: !!ok, info });

  let s = await summary(db);
  t("공개 키로 부를 수 있다", s && s.ok === true, JSON.stringify(s));
  if (!db.__seeded) {
    t("빈 DB → total 0 · oldest_at 없음", s && s.total === 0 && s.oldest_at === null, JSON.stringify(s));
    await seed(db);
    s = await summary(db);
  }
  t("대기 7건만 센다(승인·내림·응원 제외)", s && s.total === 7, JSON.stringify(s));
  t("종류별: 한 줄 4 · 꿈 1 · 편지 1 · 게시글 1",
    s && s.note === 4 && s.dream === 1 && s.letter === 1 && s.post === 1, JSON.stringify(s));
  const ageH = s && (Date.parse(s.at) - Date.parse(s.oldest_at)) / 3600e3;
  t("가장 오래 기다린 글 = 3일 전 것 (시 단위 내림이라 72~73시간)", ageH >= 72 && ageH < 73.01, String(ageH));
  t("oldest_at 은 시 단위로만 내준다(분·초 0)", s && s.oldest_at && isHour(s.oldest_at), s && s.oldest_at);
  t("기준 시각 없으면 since 는 null", s && s.since === null, JSON.stringify(s));

  const since = await summary(db, new Date(Date.now() - 3 * 3600e3).toISOString());
  t("3시간 안팎 대기 = 4건(한 줄 3 · 편지 1)", since && since.since === 4, JSON.stringify(since));
  const future = await summary(db, new Date(Date.now() + 3600e3).toISOString());
  t("미래 기준 → since 0, total 그대로", future && future.since === 0 && future.total === 7, JSON.stringify(future));

  // 시 단위 내림: 지난 시의 시작과 끝(59분 59초)을 기준으로 주면 결과가 같아야 한다
  const hr = Math.floor(Date.now() / 3600e3) * 3600e3 - 3600e3;
  const a = await summary(db, new Date(hr).toISOString());
  const b = await summary(db, new Date(hr + 3599e3).toISOString());
  t("기준을 같은 시 안에서 옮겨도 since 가 같다(분 단위 정찰 불가)", a && b && a.since === b.since, `${a && a.since} vs ${b && b.since}`);

  const keys = s ? Object.keys(s).sort().join(",") : "";
  t("내주는 칸은 건수·시각 9개뿐(본문·이름 없음)",
    keys === "at,dream,letter,note,ok,oldest_at,post,since,total", keys);
  const txt = JSON.stringify(s) + JSON.stringify(since);
  t("응답 어디에도 글 본문이 없다", !/대기1|경계 대기|편지 대기 본문|꿈대기|게시 대기 본문/.test(txt), txt.slice(0, 120));

  // 기존 문은 그대로 닫혀 있다
  const tok = await asAnon(db, "select token from public.notes limit 1");
  t("공개 키로 토큰은 여전히 못 읽는다", tok.err && /permission denied/.test(tok.err), tok.err || JSON.stringify(tok.rows));
  const adm = await asAnon(db, "select public.admin_list('pending', 1)");
  t("공개 키로 운영자 함수는 여전히 못 부른다", adm.err && /permission denied/.test(adm.err), adm.err || "열림");
  const raw = await asAnon(db, "select count(*) from public.notes where status = 'pending'");
  t("공개 키로 대기 글을 직접 세지는 못한다(함수만이 창구)",
    raw.err || Number(j(raw)) === 0, raw.err || String(j(raw)));

  const rep = db.__report || [];
  t("확인표 ✅ 5 · ❌ 0", rep.filter(r => r["결과"] === "✅").length === 5 && !rep.some(r => r["결과"] === "❌"),
    JSON.stringify(rep));
  return R;
}

const sql = fs.readFileSync(path.join(SUPA, F009), "utf8");
let fail = 0, total = 0;
for (const pre of [false, true]) {
  console.log(pre ? "\n── 대기 글이 이미 있는 DB 에 깔았을 때(운영과 같은 상황)" : "── 빈 DB 에 깔았을 때");
  const res = await suite(await build(sql, pre));
  for (const r of res) { total++; if (!r.ok) fail++; console.log(`${r.ok ? "  ✓" : "  ✗"} ${r.name}${r.ok ? "" : "  ← " + r.info}`); }
}
console.log(`\n본 검사: ${total - fail}/${total} 통과`);

// ── 뮤테이션 — 일부러 망가뜨려도 테스트(또는 SQL 의 안전장치)가 잡는가 ──
const MUT = [
  ["승인 글까지 센다", s => s.replace("from public.notes   where status = 'pending'", "from public.notes   where status <> 'rejected'")],
  ["게시글을 빠뜨린다", s => s.replace(/\s+union all\s+select 'post',\s+created_at from public\.posts\s+where status = 'pending'/, "")],
  ["본문 칸을 하나 더 내준다", s => s.replace("'at',        now());", "'at', now(), 'latest', (select body from public.notes order by id desc limit 1));")],
  ["since 기준을 무시한다", s => s.replace("where created_at >= date_trunc('hour', p_since)", "where true")],
  ["기준 시각을 시 단위로 내리지 않는다", s => s.replace("where created_at >= date_trunc('hour', p_since)", "where created_at >= p_since")],
  ["oldest_at 을 정확한 시각으로 내준다", s => s.replace("date_trunc('hour', min(created_at))", "min(created_at)")],
  ["공개 키에 열지 않는다", s => s.replace("grant  execute on function public.pending_summary(timestamptz) to anon, authenticated;",
                                            "select 1;")],
  ["security definer 를 뺐다(공개 키엔 늘 0건)", s => s.replace("stable\nsecurity definer", "stable\nsecurity invoker")],
];
let caught = 0;
for (const [name, mut] of MUT) {
  const m = mut(sql);
  if (m === sql) { console.log(`  ? 뮤테이션 적용 실패: ${name}`); continue; }
  let hit = null;
  for (const pre of [false, true]) {
    let built;
    try { built = await build(m, pre); }
    catch (e) { hit = `안전장치가 전체 취소: ${String(e.message || e).split("\n")[0].slice(0, 70)}`; break; }
    const broke = (await suite(built)).filter(x => !x.ok).map(x => x.name);
    if (broke.length) { hit = broke[0]; break; }
  }
  if (hit) caught++;
  console.log(`  ${hit ? "잡음" : "★못 잡음"} — ${name}${hit ? "  (" + hit + ")" : ""}`);
}
console.log(`뮤테이션: ${caught}/${MUT.length} 잡음`);
process.exit(fail || caught !== MUT.length ? 1 : 0);
