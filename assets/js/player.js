/* ============================================================
   INSOONI RADIO · 공식 음원 연속 재생기
   ------------------------------------------------------------
   - 검증된 공식 음원(YouTube 공식/Topic 채널)만 재생 목록에 넣는다
   - 시대·장르·오늘의 날씨로 목록을 고르고, 끝나면 자동으로 다음 곡
   - 페이지를 옮겨도 재생 위치를 이어받는다 (sessionStorage + startSeconds)
   외부 라이브러리 없음. YouTube IFrame Player API만 사용.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "insooni_radio";
  var player = null, ready = false, queue = [], pos = 0, shuffled = false, wantPlay = false;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function norm(s) { return String(s).toLowerCase().replace(/[\s'"`·.,!?()[\]/-]/g, ""); }
  function isEN() { return document.documentElement.getAttribute("lang") === "en"; }

  /* ---------- 재생 목록 구성 (공식 음원 직결분만) ---------- */
  function catalog() {
    var links = window.TRACK_LINKS || {};
    var D = window.SITE_DATA || {};
    var out = [], seen = {};
    function push(title, album, year, no) {
      var key = "인순이|" + title;
      var id = links[key];
      if (!id || seen[id]) return;
      seen[id] = 1;
      out.push({ id: id, title: title, album: album, year: String(year || ""), no: no || null });
    }
    (window.REG_ALBUMS || []).forEach(function (a) {
      var meta = null;
      (D.albums || []).forEach(function (x) {
        var m = (x.kind || "").match(/정규\s*(\d+)집/);
        var n = m ? +m[1] : (x.kind === "솔로 1집" ? 1 : ((x.kind === "정규" && x.year === "2009") ? 17 : null));
        if (n === a.no) meta = x;
      });
      (a.tracks || []).forEach(function (t) {
        var base = t.replace(/\s*\((Inst\.|경음악|MR)\)$/, "").replace(/\s*\[[^\]]+\]$/, "");
        if (/inst\.|경음악|prologue|epilogue|monologue/i.test(t)) return; /* 연주·간주 제외 */
        push(base, meta ? meta.title : a.no + "집", a.year, a.no);
      });
    });
    (D.albums || []).forEach(function (a) {
      if (!a.tracks || !a.tracks.length) push(a.title, a.title, a.year, null);
    });
    return out;
  }

  var LISTS = {
    all: { ko: "전곡", en: "Everything", filter: function () { return true; } },
    d80: { ko: "1980년대", en: "The 1980s", filter: function (s) { return s.year >= "1980" && s.year < "1990"; } },
    d90: { ko: "1990년대", en: "The 1990s", filter: function (s) { return s.year >= "1990" && s.year < "2000"; } },
    d00: { ko: "2000년 이후", en: "2000 onward", filter: function (s) { return s.year >= "2000"; } },
    jazz: { ko: "재즈 15집", en: "The Jazz album", filter: function (s) { return s.no === 15; } },
    gospel: { ko: "가스펠 12집", en: "The gospel album", filter: function (s) { return s.no === 12; } },
    today: { ko: "오늘의 날씨", en: "Today's weather", filter: null }
  };

  function todayList(all) {
    var moods = window.SONG_MOODS || {};
    var wanted = {};
    Object.keys(moods).forEach(function (k) {
      moods[k].forEach(function (s) { wanted[norm(s.title)] = 1; });
    });
    return all.filter(function (s) { return wanted[norm(s.title)]; });
  }

  function buildQueue(kind) {
    var all = catalog();
    var list = kind === "today" ? todayList(all) : all.filter(LISTS[kind].filter);
    if (!list.length) list = all;
    return list;
  }

  function shuffle(a) {
    var arr = a.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* ---------- UI ---------- */
  function bar() {
    var b = document.getElementById("radio");
    if (b) return b;
    b = document.createElement("div");
    b.id = "radio";
    b.className = "radio";
    b.hidden = true;
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", isEN() ? "Insooni Radio player" : "인순이 라디오 재생기");
    b.innerHTML =
      '<div class="rd-inner">' +
        '<div class="rd-screen"><div id="rd-frame"></div></div>' +
        '<div class="rd-now">' +
          '<span class="rd-kicker">INSOONI RADIO · <b id="rd-list"></b></span>' +
          '<span class="rd-title" id="rd-title"></span>' +
          '<span class="rd-meta" id="rd-meta"></span>' +
        "</div>" +
        '<div class="rd-controls">' +
          '<button type="button" id="rd-prev" aria-label="' + (isEN() ? "Previous track" : "이전 곡") + '">◀◀</button>' +
          '<button type="button" id="rd-play" class="rd-play" aria-label="' + (isEN() ? "Play or pause" : "재생 또는 일시정지") + '">▶</button>' +
          '<button type="button" id="rd-next" aria-label="' + (isEN() ? "Next track" : "다음 곡") + '">▶▶</button>' +
          '<button type="button" id="rd-shuffle" aria-pressed="false" aria-label="' + (isEN() ? "Shuffle" : "무작위 재생") + '">⤫</button>' +
        "</div>" +
        '<button type="button" class="rd-close" id="rd-close" aria-label="' + (isEN() ? "Close player" : "재생기 닫기") + '">×</button>' +
      "</div>";
    document.body.appendChild(b);
    document.getElementById("rd-play").addEventListener("click", toggle);
    document.getElementById("rd-next").addEventListener("click", function () { step(1); });
    document.getElementById("rd-prev").addEventListener("click", function () { step(-1); });
    document.getElementById("rd-close").addEventListener("click", close);
    document.getElementById("rd-shuffle").addEventListener("click", function () {
      shuffled = !shuffled;
      this.setAttribute("aria-pressed", String(shuffled));
      var cur = queue[pos];
      queue = shuffled ? shuffle(queue) : buildQueue(currentKind);
      pos = Math.max(0, queue.findIndex(function (s) { return s.id === (cur && cur.id); }));
      paint();
    });
    return b;
  }

  var currentKind = "all";

  function paint() {
    var s = queue[pos];
    if (!s) return;
    document.getElementById("rd-title").textContent = s.title;
    document.getElementById("rd-meta").textContent = [s.album, s.year].filter(Boolean).join(" · ");
    document.getElementById("rd-list").textContent = isEN() ? LISTS[currentKind].en : LISTS[currentKind].ko;
    document.body.classList.add("has-radio");
  }

  function save() {
    try {
      var s = queue[pos];
      if (!s) return;
      var t = player && player.getCurrentTime ? Math.floor(player.getCurrentTime()) : 0;
      sessionStorage.setItem(KEY, JSON.stringify({ kind: currentKind, id: s.id, t: t, sh: shuffled, at: Date.now() }));
    } catch (e) {}
  }

  function loadAt(i, seconds) {
    pos = (i + queue.length) % queue.length;
    paint();
    if (!ready || !player) { wantPlay = true; return; }
    player.loadVideoById({ videoId: queue[pos].id, startSeconds: seconds || 0 });
  }
  function step(d) { loadAt(pos + d, 0); }
  function toggle() {
    if (!player || !ready) return;
    var st = player.getPlayerState();
    if (st === 1) { player.pauseVideo(); } else { player.playVideo(); }
  }
  function close() {
    save();
    if (player && player.stopVideo) player.stopVideo();
    bar().hidden = true;
    document.body.classList.remove("has-radio");
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }

  function ensureAPI(cb) {
    if (window.YT && window.YT.Player) { cb(); return; }
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () { if (prev) prev(); cb(); };
    if (!document.getElementById("yt-api")) {
      var t = document.createElement("script");
      t.id = "yt-api";
      t.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(t);
    }
  }

  function start(kind, resume) {
    currentKind = kind || "all";
    queue = buildQueue(currentKind);
    if (shuffled) queue = shuffle(queue);
    if (!queue.length) return;
    var startIdx = 0, startAt = 0;
    if (resume) {
      var i = queue.findIndex(function (s) { return s.id === resume.id; });
      if (i >= 0) { startIdx = i; startAt = resume.t || 0; }
    }
    pos = startIdx;
    bar().hidden = false;
    paint();
    ensureAPI(function () {
      if (player) { loadAt(pos, startAt); return; }
      player = new YT.Player("rd-frame", {
        height: "112", width: "200",
        videoId: queue[pos].id,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, start: startAt },
        events: {
          onReady: function () {
            ready = true;
            if (wantPlay || !resume) player.playVideo();
          },
          onStateChange: function (e) {
            var btn = document.getElementById("rd-play");
            if (e.data === 1) { btn.textContent = "❚❚"; document.body.classList.add("radio-playing"); }
            else { btn.textContent = "▶"; document.body.classList.remove("radio-playing"); }
            if (e.data === 0) step(1);           /* 끝나면 다음 곡 */
            if (e.data === 1 || e.data === 2) save();
          },
          onError: function () { step(1); }      /* 임베드 불가 곡은 건너뛴다 */
        }
      });
    });
  }

  /* ---------- 진입점 ---------- */
  function bindLauncher() {
    var launcher = document.getElementById("radio-launch");
    if (launcher && !launcher.dataset.bound) {
      launcher.dataset.bound = "1";
      Object.keys(LISTS).forEach(function (k) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = isEN() ? LISTS[k].en : LISTS[k].ko;
        b.addEventListener("click", function () { start(k); });
        launcher.appendChild(b);
      });
    }
  }

  function init() {
    bindLauncher();
    /* 이전 방문에서 듣던 중이면 이어서 (전체 새로고침 시) */
    try {
      var raw = sessionStorage.getItem(KEY);
      if (raw) {
        var st = JSON.parse(raw);
        if (st && st.id && Date.now() - (st.at || 0) < 1000 * 60 * 30) {
          shuffled = !!st.sh;
          start(st.kind, st);
        }
      }
    } catch (e) {}
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", function () { if (document.hidden) save(); });
  }

  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(bindLauncher);   /* 페이지 전환 시 런처만 다시 연결 */
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
