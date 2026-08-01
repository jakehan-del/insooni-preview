#!/usr/bin/env node
/* 그 해의 자리 — assets/data/years.json
 *
 * 팬이 "88년 결혼식 날…"이라고 쓰면 방이 1988년의 자리를 찾아 준다.
 * 그 자리에 무엇이 있는지를 미리 계산해 둔 파일이다.
 *
 * ── 새 사실을 만들지 않는다 ────────────────────────────────
 * 전부 이미 검증된 자료에서 뽑는다.
 *   songs.json           곡 (검증 연도)
 *   SITE_DATA.albums     앨범
 *   SITE_DATA.timeline   연혁
 *   SITE_DATA.milestones 기념일
 *   SITE_DATA.archive    사진
 *   SITE_DATA.pastShows  지난 공연
 * 여기에 없는 해는 **없는 채로 남긴다.** 그럴듯하게 채우지 않는다.
 *
 * ── 왜 '곡이 있는 해'가 아니라 '자리가 있는 해'인가 ────────
 * 곡만 기준으로 하면 49년 중 19년만 산다. 여섯 가지를 합치면 41년이 산다.
 * 팬이 말한 해에 곡이 없어도 사진 한 장이나 연혁 한 줄이 있으면
 * "그 자리가 있습니다"라고 말할 수 있다. 없으면 없다고 말한다.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const BASE = path.resolve(__dirname, "..");
global.window = {};
require(path.join(BASE, "assets/js/data.js"));

const D = window.SITE_DATA;
const SONGS = JSON.parse(fs.readFileSync(path.join(BASE, "assets/data/songs.json"), "utf8")).songs;

const FIRST = 1957, LAST = 2026;
const years = {};
const put = (y, key, val) => {
  const n = parseInt(String(y || "").slice(0, 4), 10);
  if (!n || n < FIRST || n > LAST) return;
  const k = String(n);
  years[k] = years[k] || { songs: [], album: null, life: [], photo: null, show: null };
  if (key === "songs") years[k].songs.push(val);
  else if (key === "life") years[k].life.push(val);
  else if (!years[k][key]) years[k][key] = val;
};

/* 곡 — 그 해에 나온 곡. 연표에 못박힌 대표곡을 앞에 둔다. */
SONGS.slice()
  .sort((a, b) => (a.why === "연표" || a.why === "기념일" ? -1 : 1))
  .forEach((s) => {
    if (s.y) put(s.y, "songs", { k: s.k, t: s.t, art: s.art || null, u: s.u || null, alNo: s.alNo || null });
  });

/* 앨범 */
(D.albums || []).forEach((a) => {
  if (a.year && a.title) put(a.year, "album", { title: a.title, kind: a.kind || "", art: a.art || null });
});

/* 연혁 · 기념일 — 그 해에 실제로 있었던 일 한 줄 */
(D.timeline || []).forEach((r) => {
  if (r.year && r.event) put(r.year, "life", { text: r.event, note: r.note || "" });
});
(D.milestones || []).forEach((r) => {
  if (r.y && r.ko) put(r.y, "life", { text: r.ko, note: "" });
});

/* 사진 — 연도가 붙어 있는 것만 */
(D.archive || []).forEach((a) => {
  if (a.year && /^\d{4}$/.test(a.year) && a.img) {
    put(a.year, "photo", { img: a.img, caption: a.caption || "", w: a.w, h: a.h });
  }
});

/* 지난 공연 */
(D.pastShows || []).forEach((s) => {
  const y = String(s.date || s.year || "").slice(0, 4);
  if (y) put(y, "show", { title: s.title || s.venue || "", date: s.date || "" });
});

/* 빈 해는 넣지 않는다. 대신 어느 해가 비었는지는 기록해 둔다 —
   "1993년에 나온 노래는 이 방에 없습니다"를 사실대로 말하기 위해서. */
const have = Object.keys(years).map(Number).sort((a, b) => a - b);
const empty = [];
for (let y = 1978; y <= LAST; y++) if (!years[String(y)]) empty.push(y);

const doc = {
  note:
    "그 해의 자리. songs.json 과 data.js(albums/timeline/milestones/archive/pastShows)에서만 뽑는다. " +
    "새 사실을 만들지 않는다. 자료가 없는 해는 없는 채로 남긴다.",
  first: FIRST, last: LAST,
  filled: have.length,
  empty: empty,
  years: years,
};
fs.writeFileSync(path.join(BASE, "assets/data/years.json"), JSON.stringify(doc));

const withSong = have.filter((y) => years[String(y)].songs.length).length;
console.log("자리가 있는 해 %d개 (1957~2026 중)", have.length);
console.log("  그중 곡이 있는 해 %d개", withSong);
console.log("데뷔(1978) 이후 비어 있는 해 %d개: %s", empty.length, empty.join(", ") || "없음");
console.log("파일 %d KB", Math.round(fs.statSync(path.join(BASE, "assets/data/years.json")).size / 1024));
