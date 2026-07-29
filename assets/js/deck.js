/* ============================================================
   INSOONI DECK · 광고 없는 연속 믹스
   ------------------------------------------------------------
   Apple이 공식 제공하는 무광고 음원으로 곡과 곡을 겹쳐 넘긴다.
   두 개의 데크가 번갈아 돌고, 실시간 주파수를 읽어 파형을 그린다.
   전곡 감상은 각 곡의 '전곡 듣기'로 공식 채널에 연결된다.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "insooni_deck";
  var TRACKS = null, queue = [], pos = 0, shuffled = false;
  var ctx = null, decks = [], cur = 0, analyser = null, raf = null;
  var XFADE = 3.2;          /* 겹쳐 넘기는 시간(초) */
  var loaded = false, armed = false;

  function isEN() { return document.documentElement.getAttribute("lang") === "en"; }
  function T(ko, en) { return isEN() ? en : ko; }

  /* ---------- 데크 구성 ---------- */
  function makeDeck() {
    var a = new Audio();
    a.crossOrigin = "anonymous";
    a.preload = "auto";
    a.playsInline = true;
    return { el: a, gain: null, src: null };
  }

  function ensureAudio() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    analyser.connect(ctx.destination);
    decks = [makeDeck(), makeDeck()];
    decks.forEach(function (d) {
      d.src = ctx.createMediaElementSource(d.el);
      /* 저역 셸빙: 두 곡이 겹칠 때 베이스가 뭉개지지 않게 들어오는 쪽 저역을 눌렀다 올린다 */
      d.bass = ctx.createBiquadFilter();
      d.bass.type = "lowshelf";
      d.bass.frequency.value = 190;
      d.bass.gain.value = 0;
      d.gain = ctx.createGain();
      d.gain.gain.value = 0;
      /* 데크별 분석기: 나가는 곡의 비트를 읽어 전환 시점을 잡는다 */
      d.an = ctx.createAnalyser();
      d.an.fftSize = 256;
      d.an.smoothingTimeConstant = 0.1;
      d.src.connect(d.bass);
      d.bass.connect(d.gain);
      d.gain.connect(d.an);
      d.an.connect(analyser);
      d.beats = [];        /* 최근 비트 시각 */
      d.period = 0;        /* 추정된 한 박 길이(초) */
      d.lastPeak = 0;
      d.energy = 0;
      d.bins = new Uint8Array(d.an.frequencyBinCount);
      d.el.addEventListener("error", function () { next(); });
    });
  }

  /* ---------- 비트 추적: 저역 에너지의 급상승을 박으로 본다 ---------- */
  function trackBeat(d) {
    if (!d.an || d.el.paused) return;
    d.an.getByteFrequencyData(d.bins);
    var e = 0;
    for (var i = 1; i < 6; i++) e += d.bins[i];      /* 킥이 사는 대역 */
    e /= 5;
    var avg = d.energy = d.energy * 0.92 + e * 0.08;
    var now = ctx.currentTime;
    if (e > avg * 1.38 && e > 26 && now - d.lastPeak > 0.26) {
      d.lastPeak = now;
      d.beats.push(now);
      if (d.beats.length > 14) d.beats.shift();
      if (d.beats.length >= 6) {
        var gaps = [];
        for (var j = 1; j < d.beats.length; j++) {
          var g = d.beats[j] - d.beats[j - 1];
          if (g > 0.28 && g < 1.2) gaps.push(g);      /* 50~210 BPM 범위 */
        }
        if (gaps.length >= 4) {
          gaps.sort(function (a, b) { return a - b; });
          d.period = gaps[Math.floor(gaps.length / 2)];   /* 중앙값이 흔들림에 강하다 */
        }
      }
    }
  }

  /* 다음 박이 오는 시각 (박을 못 읽었으면 지금) */
  function nextBeatTime(d) {
    if (!d.period || !d.lastPeak) return ctx.currentTime;
    var t = d.lastPeak, now = ctx.currentTime;
    while (t < now + 0.06) t += d.period;
    return t;
  }

  /* 등파워 곡선: 선형으로 섞으면 가운데서 소리가 꺼진 듯 얇아진다 */
  function equalPower(rising) {
    var n = 64, arr = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = i / (n - 1);
      arr[i] = rising ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2);
    }
    return arr;
  }

  /* ---------- 목록 ---------- */
  var LISTS = {
    all: { ko: "전곡 믹스", en: "Full mix", f: function () { return true; } },
    d80: { ko: "1980년대", en: "The 1980s", f: function (s) { return s.y >= "1980" && s.y < "1990"; } },
    d90: { ko: "1990년대", en: "The 1990s", f: function (s) { return s.y >= "1990" && s.y < "2000"; } },
    d00: { ko: "2000년 이후", en: "2000 onward", f: function (s) { return s.y >= "2000"; } },
    jazz: { ko: "재즈 15집", en: "The Jazz album", f: function (s) { return s.no === 15; } },
    gospel: { ko: "가스펠 12집", en: "The gospel album", f: function (s) { return s.no === 12; } },
    today: { ko: "오늘의 날씨", en: "Today's weather", f: null }
  };
  var kind = "all";

  function norm(s) { return String(s).toLowerCase().replace(/[\s'"`·.,!?()[\]/-]/g, ""); }
  function todayFilter(list) {
    var moods = window.SONG_MOODS || {}, want = {};
    Object.keys(moods).forEach(function (k) { moods[k].forEach(function (s) { want[norm(s.title)] = 1; }); });
    var hit = list.filter(function (s) { return want[norm(s.t)]; });
    return hit.length ? hit : list;
  }
  function shuffleArr(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = r[i]; r[i] = r[j]; r[j] = t; }
    return r;
  }
  function build(k) {
    var list = k === "today" ? todayFilter(TRACKS) : TRACKS.filter(LISTS[k].f);
    if (!list.length) list = TRACKS;
    return shuffled ? shuffleArr(list) : list;
  }

  /* ---------- 재생 ---------- */
  function other() { return cur === 0 ? 1 : 0; }

  function playAt(i, fade, at) {
    if (!queue.length) return;
    pos = (i + queue.length) % queue.length;
    var track = queue[pos];
    var d = decks[cur];
    d.el.src = track.u;
    d.el.currentTime = 0;
    d.beats = []; d.period = 0; d.lastPeak = 0; d.energy = 0;
    var now = at && at > ctx.currentTime ? at : ctx.currentTime;
    d.gain.gain.cancelScheduledValues(ctx.currentTime);
    d.bass.gain.cancelScheduledValues(ctx.currentTime);
    if (fade) {
      d.gain.gain.setValueAtTime(0, ctx.currentTime);
      d.gain.gain.setValueCurveAtTime(equalPower(true), now, XFADE);
      /* 들어오는 곡의 저역을 눌렀다가 절반 지점부터 되살린다 (베이스 스왑) */
      d.bass.gain.setValueAtTime(-16, ctx.currentTime);
      d.bass.gain.setValueAtTime(-16, now + XFADE * 0.45);
      d.bass.gain.linearRampToValueAtTime(0, now + XFADE);
    } else {
      d.gain.gain.setValueAtTime(1, ctx.currentTime);
      d.bass.gain.setValueAtTime(0, ctx.currentTime);
    }
    var p = d.el.play();
    if (p && p.catch) p.catch(function () {});
    paint(track);
    armed = false;
    save();
  }

  function next(onBeat) {
    var from = decks[cur];
    if (!ctx) return;
    /* 박자에 걸어 전환한다 — 박을 못 읽었으면 즉시 */
    var at = onBeat ? nextBeatTime(from) : ctx.currentTime;
    from.gain.gain.cancelScheduledValues(ctx.currentTime);
    from.gain.gain.setValueAtTime(from.gain.gain.value, ctx.currentTime);
    from.gain.gain.setValueCurveAtTime(equalPower(false), at, XFADE);
    /* 나가는 곡의 저역을 먼저 빼서 자리를 비워 준다 */
    from.bass.gain.cancelScheduledValues(ctx.currentTime);
    from.bass.gain.setValueAtTime(from.bass.gain.value, ctx.currentTime);
    from.bass.gain.linearRampToValueAtTime(-16, at + XFADE * 0.5);
    setTimeout(function () { try { from.el.pause(); } catch (e) {} },
               (at - ctx.currentTime + XFADE) * 1000 + 150);
    cur = other();
    playAt(pos + 1, true, at);
  }
  function prev() {
    var from = decks[cur];
    try { from.el.pause(); } catch (e) {}
    if (ctx) { from.gain.gain.cancelScheduledValues(ctx.currentTime); from.gain.gain.value = 0; }
    cur = other();
    playAt(pos - 1, false);
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    var d = decks[cur];
    trackBeat(d);
    /* 끝나기 전 여유를 두고, 다음 박에 맞춰 겹쳐 넘긴다 */
    if (!armed && d.el.duration && d.el.currentTime > 0 && !d.el.paused &&
        d.el.duration - d.el.currentTime <= XFADE + 0.9) {
      armed = true;
      next(true);
    }
    draw();
  }

  /* ---------- 비주얼 ---------- */
  var canvas = null, cctx = null, bins = null;
  function draw() {
    if (!canvas || !analyser) return;
    if (!bins) bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    var w = canvas.width, h = canvas.height;
    cctx.clearRect(0, 0, w, h);
    var n = 28, step = Math.floor(bins.length / n), bw = w / n;
    for (var i = 0; i < n; i++) {
      var v = bins[i * step] / 255;
      var bh = Math.max(2, v * h * 0.92);
      var g = cctx.createLinearGradient(0, h, 0, h - bh);
      g.addColorStop(0, "rgba(212,175,55,.95)");
      g.addColorStop(1, "rgba(243,239,231,.35)");
      cctx.fillStyle = g;
      cctx.fillRect(i * bw + bw * 0.22, h - bh, bw * 0.56, bh);
    }
  }

  /* ---------- UI ---------- */
  function bar() {
    var b = document.getElementById("deck");
    if (b) return b;
    b = document.createElement("div");
    b.id = "deck";
    b.className = "deck";
    b.hidden = true;
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", T("인순이 믹스 재생기", "Insooni mix player"));
    b.innerHTML =
      '<div class="dk-inner">' +
        '<div class="dk-disc" id="dk-disc"><img alt="" id="dk-art"><span class="dk-spindle"></span></div>' +
        '<div class="dk-now">' +
          '<span class="dk-kicker">INSOONI MIX · <b id="dk-list"></b></span>' +
          '<span class="dk-title" id="dk-title"></span>' +
          '<span class="dk-meta" id="dk-meta"></span>' +
        "</div>" +
        '<canvas class="dk-viz" id="dk-viz" width="240" height="42" aria-hidden="true"></canvas>' +
        '<div class="dk-controls">' +
          '<button type="button" id="dk-prev" aria-label="' + T("이전 곡", "Previous") + '">◀◀</button>' +
          '<button type="button" id="dk-play" class="dk-play" aria-label="' + T("재생 또는 일시정지", "Play or pause") + '">❚❚</button>' +
          '<button type="button" id="dk-next" aria-label="' + T("다음 곡", "Next") + '">▶▶</button>' +
          '<button type="button" id="dk-shuffle" aria-pressed="false" aria-label="' + T("무작위", "Shuffle") + '">⤫</button>' +
          '<a id="dk-full" class="dk-full" target="_blank" rel="noopener">' + T("전곡 듣기", "FULL SONG") + "</a>" +
        "</div>" +
        '<button type="button" class="dk-close" id="dk-close" aria-label="' + T("닫기", "Close") + '">×</button>' +
      "</div>";
    document.body.appendChild(b);
    canvas = document.getElementById("dk-viz");
    cctx = canvas.getContext("2d");
    document.getElementById("dk-play").addEventListener("click", toggle);
    document.getElementById("dk-next").addEventListener("click", function () { next(); });
    document.getElementById("dk-prev").addEventListener("click", prev);
    document.getElementById("dk-close").addEventListener("click", close);
    document.getElementById("dk-shuffle").addEventListener("click", function () {
      shuffled = !shuffled;
      this.setAttribute("aria-pressed", String(shuffled));
      var here = queue[pos];
      queue = build(kind);
      var i = queue.findIndex(function (s) { return s.t === (here && here.t); });
      pos = i < 0 ? 0 : i;
    });
    return b;
  }

  /* 앨범명은 우리 기록(정규 번호) 기준을 우선한다 — 스토어 표기와 다를 수 있어서 */
  function albumName(track) {
    var D = window.SITE_DATA || {};
    var hit = null;
    (D.albums || []).forEach(function (x) {
      var m = (x.kind || "").match(/정규\s*(\d+)집/);
      var n = m ? +m[1] : (x.kind === "솔로 1집" ? 1 : ((x.kind === "정규" && x.year === "2009") ? 17 : null));
      if (n && n === track.no) hit = x.title;
    });
    if (hit) return hit + (track.no ? " · 정규 " + track.no + "집" : "");
    return track.al || "";
  }

  function paint(track) {
    document.getElementById("dk-title").textContent = track.t;
    document.getElementById("dk-meta").textContent = [albumName(track), track.y].filter(Boolean).join(" · ");
    document.getElementById("dk-list").textContent = isEN() ? LISTS[kind].en : LISTS[kind].ko;
    var art = document.getElementById("dk-art");
    if (track.art) { art.src = track.art; art.hidden = false; } else { art.hidden = true; }
    var full = document.getElementById("dk-full");
    var links = window.TRACK_LINKS || {};
    var id = links["인순이|" + track.t];
    full.href = id ? "https://www.youtube.com/watch?v=" + id
                   : "https://www.youtube.com/results?search_query=" + encodeURIComponent("인순이 " + track.t);
    document.body.classList.add("has-deck", "deck-playing");
  }

  function toggle() {
    var d = decks[cur];
    if (d.el.paused) {
      if (ctx.state === "suspended") ctx.resume();
      d.el.play();
      document.body.classList.add("deck-playing");
      document.getElementById("dk-play").textContent = "❚❚";
      if (!raf) tick();
    } else {
      d.el.pause();
      document.body.classList.remove("deck-playing");
      document.getElementById("dk-play").textContent = "▶";
      cancelAnimationFrame(raf); raf = null;
    }
  }
  function close() {
    decks.forEach(function (d) { try { d.el.pause(); } catch (e) {} });
    cancelAnimationFrame(raf); raf = null;
    bar().hidden = true;
    document.body.classList.remove("has-deck", "deck-playing");
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }
  function save() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ k: kind, t: queue[pos] && queue[pos].t, sh: shuffled, at: Date.now() }));
    } catch (e) {}
  }

  function load() {
    if (loaded) return Promise.resolve();
    return fetch("assets/data/previews.json?" + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.tracks || !d.tracks.length) throw new Error("no tracks");
        TRACKS = d.tracks;
        loaded = true;
      });
  }

  function start(k, resumeTitle) {
    kind = k || "all";
    load().then(function () {
      ensureAudio();
      if (ctx.state === "suspended") ctx.resume();
      queue = build(kind);
      var i = 0;
      if (resumeTitle) {
        var f = queue.findIndex(function (s) { return s.t === resumeTitle; });
        if (f >= 0) i = f;
      }
      bar().hidden = false;
      cur = 0;
      playAt(i, false);
      if (!raf) tick();
      document.getElementById("dk-play").textContent = "❚❚";
    }).catch(function () { /* 프리뷰를 못 받으면 조용히 아무것도 하지 않는다 */ });
  }

  /* ---------- 진입점 ---------- */
  function bindLauncher() {
    var box = document.getElementById("deck-launch");
    if (!box || box.dataset.bound) return;
    box.dataset.bound = "1";
    Object.keys(LISTS).forEach(function (k) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = isEN() ? LISTS[k].en : LISTS[k].ko;
      b.addEventListener("click", function () { start(k); });
      box.appendChild(b);
    });
  }
  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(bindLauncher);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindLauncher);
  else bindLauncher();
  window.addEventListener("pagehide", save);
})();
