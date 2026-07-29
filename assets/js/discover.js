/* ============================================================
   INSOONI OFFICIAL · 곡 찾기 & 오늘의 노래
   ------------------------------------------------------------
   - 218곡 전곡 즉시 검색 (제목·앨범·연도, 한글 초성 지원)
   - 오늘의 날씨·계절·시간에 맞춘 곡 추천 (Open-Meteo, 키 불필요)
   외부 라이브러리 없음. 실패 시 조용히 계절 추천으로 대체된다.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 한글 초성 (ㄱㅇㅇㄲ → 거위의 꿈) ---------- */
  var CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
             "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  function toCho(s) {
    return String(s).replace(/[가-힣]/g, function (c) {
      return CHO[Math.floor((c.charCodeAt(0) - 0xac00) / 588)];
    });
  }
  function isChoQuery(q) {
    return /^[ㄱ-ㅎ\s]+$/.test(q) && /[ㄱ-ㅎ]/.test(q);
  }
  function norm(s) {
    return String(s).toLowerCase().replace(/[\s'"`·.,!?()[\]/-]/g, "");
  }

  /* ---------- 곡 색인: 정규 전집 + 대표곡을 하나의 목록으로 ---------- */
  function buildIndex() {
    var D = window.SITE_DATA || {};
    var links = window.TRACK_LINKS || {};
    var seen = {};
    var idx = [];
    function add(title, albumTitle, year, kind) {
      var base = String(title)
        .replace(/\s*\((Inst\.|경음악|MR)\)$/, "")
        .replace(/\s*\[[^\]]+\]$/, "");
      var artist = /희자매/.test(kind || "") ? "희자매" : (kind === "골든걸스" ? "골든걸스" : "인순이");
      var key = artist + "|" + base;
      var dedupe = norm(base) + "|" + norm(albumTitle);
      if (seen[dedupe]) return;
      seen[dedupe] = 1;
      idx.push({
        title: base,
        album: albumTitle,
        year: String(year || ""),
        kind: kind || "",
        cho: toCho(base),
        n: norm(base),
        url: links[key] ? "https://www.youtube.com/watch?v=" + links[key] : null,
        q: "https://www.youtube.com/results?search_query=" + encodeURIComponent(artist + " " + base)
      });
    }
    (window.REG_ALBUMS || []).forEach(function (a) {
      var meta = null;
      (D.albums || []).forEach(function (x) {
        var m = (x.kind || "").match(/정규\s*(\d+)집/);
        var no = m ? +m[1] : (x.kind === "솔로 1집" ? 1 : ((x.kind === "정규" && x.year === "2009") ? 17 : null));
        if (no === a.no) meta = x;
      });
      var name = meta ? meta.title : (a.no + "집");
      (a.tracks || []).forEach(function (t) { add(t, name, a.year, "정규 " + a.no + "집"); });
    });
    (D.albums || []).forEach(function (a) {
      if (a.tracks && a.tracks.length) {
        a.tracks.forEach(function (t) { add(t, a.title, a.year, a.kind); });
      } else {
        add(a.title, a.title, a.year, a.kind);
      }
    });
    return idx;
  }

  var INDEX = null;
  function index() {
    if (!INDEX) INDEX = buildIndex();
    return INDEX;
  }

  /* ---------- 곡 찾기 ---------- */
  function initSearch() {
    var input = document.getElementById("song-q");
    if (!input) return;
    var out = document.getElementById("song-results");
    var count = document.getElementById("song-count");
    var isEN = document.documentElement.getAttribute("lang") === "en";
    var T = isEN
      ? { hit: " songs found", none: "No match. Try part of the title or an album year.", all: " songs in the catalog. Type to search.", play: "PLAY", find: "FIND" }
      : { hit: "곡을 찾았습니다", none: "찾는 곡이 없습니다. 제목 일부나 발매 연도로도 찾아보세요.", all: "곡이 담겨 있습니다. 제목을 입력해 보세요.", play: "듣기", find: "찾아보기" };

    function render(list, q) {
      out.innerHTML = "";
      if (!q) {
        count.textContent = index().length + T.all;
        return;
      }
      count.textContent = list.length ? list.length + T.hit : T.none;
      list.slice(0, 40).forEach(function (s) {
        var a = document.createElement("a");
        a.className = "sr-row";
        a.href = s.url || s.q;
        a.target = "_blank";
        a.rel = "noopener";
        a.innerHTML =
          '<span class="sr-title"></span>' +
          '<span class="sr-meta"></span>' +
          '<span class="sr-play">' + (s.url ? T.play : T.find) + " ▶</span>";
        a.querySelector(".sr-title").textContent = s.title;
        a.querySelector(".sr-meta").textContent = [s.album, s.year].filter(Boolean).join(" · ");
        out.appendChild(a);
      });
    }

    function search() {
      var raw = input.value.trim();
      if (!raw) { render([], ""); return; }
      var list;
      if (isChoQuery(raw)) {
        var cq = raw.replace(/\s/g, "");
        list = index().filter(function (s) { return s.cho.replace(/\s/g, "").indexOf(cq) >= 0; });
      } else {
        var nq = norm(raw);
        list = index().filter(function (s) {
          return s.n.indexOf(nq) >= 0 || norm(s.album).indexOf(nq) >= 0 || s.year.indexOf(raw) >= 0;
        });
        /* 제목 앞부분 일치를 위로 */
        list.sort(function (a, b) {
          var ai = a.n.indexOf(nq), bi = b.n.indexOf(nq);
          return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
        });
      }
      render(list, raw);
    }

    input.addEventListener("input", search);
    var chips = document.getElementById("song-chips");
    if (chips) {
      chips.addEventListener("click", function (e) {
        var b = e.target.closest("[data-q]");
        if (!b) return;
        input.value = b.getAttribute("data-q");
        search();
        input.focus();
      });
    }
    render([], "");
  }

  /* ---------- 오늘, 이 노래 ---------- */
  var WMO = {
    rain: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82],
    snow: [71, 73, 75, 77, 85, 86],
    fog: [45, 48],
    storm: [95, 96, 99],
    cloudy: [2, 3]
  };
  function specialKey(month, day) {
    if (month === 12 && day >= 20 && day <= 26) return "christmas";
    if (month === 4) return "spring-flower";
    return null;
  }
  function weatherKey(code, temp, isDay, month, hour, wind, day) {
    if (WMO.snow.indexOf(code) >= 0) return "snow";
    if (WMO.storm.indexOf(code) >= 0) return "windy";
    if (WMO.rain.indexOf(code) >= 0) return (month >= 6 && month <= 7) ? "monsoon" : "rain";
    if (WMO.fog.indexOf(code) >= 0) return "fog";
    if (temp >= 31) return "hot";
    if (temp <= 0) return "cold-winter";
    if (wind >= 28) return "windy";
    var sp = specialKey(month, day);
    if (sp && isDay) return sp;
    if (WMO.cloudy.indexOf(code) >= 0) return "cloudy";
    if (!isDay) return hour >= 4 && hour < 6 ? "dawn" : "night";
    if (hour < 11) return "morning";
    if (month >= 3 && month <= 5) return "clear-spring";
    if (month >= 6 && month <= 8) return "clear-summer";
    if (month >= 9 && month <= 11) return "clear-autumn";
    return "cold-winter";
  }
  function seasonKey(month, hour, isDay) {
    if (!isDay) return hour >= 4 && hour < 6 ? "dawn" : "night";
    if (month === 12 || month <= 2) return "cold-winter";
    if (month <= 5) return "clear-spring";
    if (month <= 8) return "clear-summer";
    return "clear-autumn";
  }

  function initToday() {
    var box = document.getElementById("today-song");
    if (!box) return;
    var rules = window.SONG_MOODS || {};
    var isEN = document.documentElement.getAttribute("lang") === "en";
    var line = document.getElementById("today-line");
    var listBox = document.getElementById("today-list");

    function pick(key) {
      var songs = rules[key] || rules["clear-spring"] || [];
      /* 날마다 다른 곡이 앞에 오도록 날짜 기반 회전 (같은 날은 항상 같은 추천) */
      var d = new Date();
      var seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
      var rotated = songs.slice(seed % Math.max(songs.length, 1)).concat(songs.slice(0, seed % Math.max(songs.length, 1)));
      return rotated.slice(0, 2);
    }
    function findSong(title) {
      var n = norm(title);
      var hit = null;
      index().forEach(function (s) { if (!hit && s.n === n && s.url) hit = s; });
      if (!hit) index().forEach(function (s) { if (!hit && s.n === n) hit = s; });
      return hit;
    }
    function paint(key, headline) {
      var picks = pick(key);
      if (!picks.length) { box.hidden = true; return; }
      line.textContent = headline;
      listBox.innerHTML = "";
      picks.forEach(function (p) {
        var s = findSong(p.title);
        var a = document.createElement("a");
        a.className = "ts-row";
        a.href = s ? (s.url || s.q) : ("https://www.youtube.com/results?search_query=" + encodeURIComponent("인순이 " + p.title));
        a.target = "_blank";
        a.rel = "noopener";
        a.innerHTML =
          '<span class="ts-title"></span>' +
          '<span class="ts-why"></span>' +
          '<span class="ts-play">' + (isEN ? "PLAY" : "듣기") + " ▶</span>";
        a.querySelector(".ts-title").textContent = p.title + (s && s.year ? "  " + s.year : "");
        a.querySelector(".ts-why").textContent = isEN && p.en ? p.en : p.reason;
        listBox.appendChild(a);
      });
      box.hidden = false;
    }

    var now = new Date();
    var month = now.getMonth() + 1, hour = now.getHours();
    var LABEL = isEN
      ? { snow: "Snow over Seoul", windy: "A windy day", rain: "Rain today", monsoon: "Monsoon rain", fog: "Morning fog",
          christmas: "The Christmas season", "spring-flower": "April, in bloom",
          hot: "A hot day", "cold-winter": "A cold day", cloudy: "An overcast sky", dawn: "Before dawn", night: "Tonight",
          morning: "This morning", "clear-spring": "A clear spring day", "clear-summer": "A bright summer day", "clear-autumn": "A clear autumn day" }
      : { snow: "눈 내리는 오늘", windy: "바람 부는 오늘", rain: "비 오는 오늘", monsoon: "장맛비 내리는 오늘", fog: "안개 낀 아침",
          christmas: "성탄의 계절", "spring-flower": "꽃 피는 사월",
          hot: "무더운 오늘", "cold-winter": "추운 오늘", cloudy: "흐린 하늘", dawn: "새벽녘", night: "오늘 밤",
          morning: "오늘 아침", "clear-spring": "맑은 봄날", "clear-summer": "환한 여름날", "clear-autumn": "맑은 가을날" };

    /* 날씨를 못 받아도 계절 추천은 반드시 뜬다 */
    var fallbackKey = specialKey(month, now.getDate()) || seasonKey(month, hour, hour >= 6 && hour < 20);
    paint(fallbackKey, LABEL[fallbackKey] || "");

    fetch("https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=temperature_2m,weather_code,is_day,wind_speed_10m&timezone=Asia%2FSeoul")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.current) return;
        var c = d.current;
        var key = weatherKey(c.weather_code, c.temperature_2m, c.is_day === 1, month, hour, c.wind_speed_10m || 0, now.getDate());
        var temp = Math.round(c.temperature_2m);
        var head = (LABEL[key] || "") + (isEN ? " · Seoul " + temp + "°C" : " · 서울 " + temp + "°C");
        paint(key, head);
      })
      .catch(function () { /* 계절 추천 유지 */ });
  }

  function boot() { INDEX = null; initSearch(); initToday(); }
  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(boot);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
