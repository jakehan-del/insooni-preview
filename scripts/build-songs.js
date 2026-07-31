#!/usr/bin/env node
/* 곡 앵커 만들기 — assets/data/songs.json
 *
 * 사랑방의 모든 것이 '곡'에 걸린다. 오늘의 곡도, 팬이 남긴 한 줄도,
 * 줄기에 서는 자리도 전부 곡 하나를 가리킨다.
 *
 * ── 연도를 어디서 가져오는가 (이게 이 파일의 전부다) ──────────────
 *
 * previews.json 의 y·al 은 **쓰지 않는다.** 애플 메타데이터라 컴필레이션·
 * 재발매 연도가 섞여 있다. 실측하면 이렇다.
 *
 *     친구여            previews y=1997  ← 검증 연표는 2004년 16집
 *     거위의 꿈          previews y=(없음)
 *     16집 A TO Z      같은 앨범이 1991·1997·2004 로 흩어짐
 *
 * 그래서 근거를 이 순서로 둔다.
 *
 *   1) 검증 연표·기념일(SITE_DATA.timeline / milestones)에 못박힌 곡
 *   2) 앨범 자료(SITE_DATA.albums + REG_ALBUMS)에서 연도가 하나로 나오는 곡
 *   3) 여러 앨범에 걸친 곡 → 가장 이른 것(첫 수록). amb:true 로 표시하고
 *      화면에서는 '발표'가 아니라 '수록'이라고 쓴다
 *
 * previews.json 에서 가져오는 것은 **미리듣기 URL 하나뿐**이다.
 *
 * ── 재킷 ──────────────────────────────────────────────────
 * 자체 호스팅 이미지만 art 에 넣는다(파일 존재를 확인한다).
 * 애플 쪽 재킷(artRemote)은 작은 썸네일 전용이고, 실패하면 조용히 숨긴다.
 * **캔버스에는 절대 그리지 않는다** — CORS로 오염되어 이미지 저장이 실패한다.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const BASE = path.resolve(__dirname, "..");
global.window = {};
require(path.join(BASE, "assets/js/data.js"));
require(path.join(BASE, "assets/js/albums-full.js"));

const D = window.SITE_DATA;
const REG = window.REG_ALBUMS;
const PREV = JSON.parse(fs.readFileSync(path.join(BASE, "assets/data/previews.json"), "utf8")).tracks;

const norm = (t) =>
  (t || "").replace(/\([^)]*\)/g, "").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();

/* ── 1) 검증 연표·기념일에서 못박힌 곡 ─────────────────────────
   사이트가 이미 공표하고 있는 사실이다. 가장 센 근거로 둔다. */
const PINNED = {};
function pin(title, year, why) {
  const k = norm(title);
  if (k && !PINNED[k]) PINNED[k] = { y: String(year), why: why };
}
(D.timeline || []).forEach((r) => {
  const text = (r.event || "") + " " + (r.note || "");
  // '밤이면 밤마다' 발표 / 《인연》 / 'One Last Time' 같은 인용 부호 안의 제목
  const re = /['‘’"“”]([^'‘’"“”]{2,30})['‘’"“”]|《([^》]{2,30})》/g;
  let m;
  while ((m = re.exec(text))) pin(m[1] || m[2], r.year, "연표");
});
(D.milestones || []).forEach((r) => {
  const re = /['‘’"“”]([^'‘’"“”]{2,30})['‘’"“”]|《([^》]{2,30})》/g;
  let m;
  while ((m = re.exec(r.ko || ""))) pin(m[1] || m[2], r.y, "기념일");
});

/* ── 2) 앨범 자료에서 후보 모으기 ───────────────────────────── */
const cand = new Map();
const add = (k, o) => {
  if (!k) return;
  if (!cand.has(k)) cand.set(k, []);
  cand.get(k).push(o);
};
REG.forEach((a) =>
  a.tracks.forEach((t) => add(norm(t), { y: String(a.year), no: a.no, art: a.art }))
);
(D.albums || []).forEach((a) => {
  const label = a.kind && /정규/.test(a.kind) ? a.kind : null;
  const no = label ? parseInt(String(label).replace(/\D/g, ""), 10) : null;
  if (a.tracks && a.tracks.length) {
    a.tracks.forEach((t) => add(norm(t), { y: String(a.year), no: no, title: a.title, art: a.art }));
  } else {
    // 싱글·EP·OST 는 앨범 제목이 곧 곡 제목이다
    add(norm(a.title), { y: String(a.year), no: no, title: a.title, kind: a.kind, art: a.art });
  }
});

const exists = (p) => !!p && fs.existsSync(path.join(BASE, p));

const songs = [];
const seen = new Set();
let nPinned = 0, nOne = 0, nAmb = 0, nNone = 0;

PREV.forEach((t) => {
  const title = (t.t || "").trim();
  const k = norm(title);
  if (!title || !k || seen.has(k)) return;
  seen.add(k);

  const cs = cand.get(k) || [];
  const years = [...new Set(cs.map((c) => c.y))].sort();

  let y = null, amb = false, why = null;
  if (PINNED[k]) {
    y = PINNED[k].y; why = PINNED[k].why; nPinned++;
  } else if (years.length === 1) {
    y = years[0]; why = "앨범"; nOne++;
  } else if (years.length > 1) {
    y = years[0]; amb = true; why = "첫 수록"; nAmb++;   // 가장 이른 것
  } else {
    nNone++;
  }

  // 재킷·앨범표시는 확정된 연도의 후보에서만 가져온다
  const pick = cs.filter((c) => c.y === y);
  const withArt = pick.find((c) => exists(c.art));
  const withNo = pick.find((c) => c.no);
  const withTitle = pick.find((c) => c.title);

  songs.push({
    k: k,
    t: title,
    y: y,
    amb: amb || undefined,
    why: why || undefined,
    alNo: withNo ? withNo.no : undefined,
    alTitle: withTitle ? withTitle.title : undefined,
    art: withArt ? withArt.art : null,
    artRemote: t.art || null,
    u: t.u || null,
  });
});

songs.sort((a, b) => (a.y || "9999").localeCompare(b.y || "9999") || a.t.localeCompare(b.t, "ko"));

const doc = {
  note:
    "사랑방의 곡 앵커. 연도 근거 순서 — 검증 연표·기념일 > 앨범 자료(연도 하나) > 여러 앨범이면 첫 수록(amb:true). " +
    "previews.json 에서는 미리듣기 URL 만 가져온다(그쪽 연도·앨범명은 애플 메타데이터라 재발매 연도가 섞여 있다). " +
    "art 는 자체 호스팅 파일만. artRemote 는 작은 썸네일 전용이며 캔버스에 그리지 않는다.",
  count: songs.length,
  songs: songs,
};
fs.writeFileSync(path.join(BASE, "assets/data/songs.json"), JSON.stringify(doc, null, 1));

console.log(
  "곡 %d개 — 연표에서 확정 %d · 앨범에서 확정 %d · 여러 앨범(첫 수록) %d · 연도 미상 %d",
  songs.length, nPinned, nOne, nAmb, nNone
);
console.log("자체 재킷 있는 곡: %d", songs.filter((s) => s.art).length);
const ambList = songs.filter((s) => s.amb);
if (ambList.length) {
  console.log("\n여러 앨범에 걸쳐 '첫 수록' 연도를 쓴 곡 %d개:", ambList.length);
  ambList.forEach((s) =>
    console.log("   %s  %s   (후보: %s)", s.y, s.t, [...new Set((cand.get(s.k) || []).map((c) => c.y))].join(", "))
  );
}
const noYear = songs.filter((s) => !s.y);
if (noYear.length) {
  console.log("\n연도를 못 정한 곡 %d개:", noYear.length);
  noYear.forEach((s) => console.log("   ·", s.t));
}
if (songs.length < 90) {
  console.error("!! 곡이 너무 적습니다.");
  process.exit(1);
}
