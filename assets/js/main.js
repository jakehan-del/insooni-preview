/* ============================================================
   INSOONI 공식 팬 플랫폼 공통 스크립트
   - 내비게이션 / 글자 크기 / 데이터 렌더링 / 커뮤니티 데모
   - 데이터는 assets/js/data.js 의 SITE_DATA 전역에서 읽는다.
   ============================================================ */
(function () {
  "use strict";

  document.documentElement.classList.add("js-anim");

  var D = window.SITE_DATA || {};

  /* ---------- 유틸 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function firstChar(name) {
    return Array.from(name || "팬")[0];
  }
  function fmtDate(iso) {
    var d = new Date(iso + "T00:00:00");
    return d.getFullYear() + ". " + (d.getMonth() + 1) + ". " + d.getDate() + ".";
  }
  function eventCta(ev) {
    var st = ev.status || ((ev.link && ev.link !== "#") ? "onsale" : "soon");
    if (st === "onsale" && ev.link && ev.link !== "#") {
      return '<a class="btn btn--gold btn--sm" href="' + esc(ev.link) + '">' + t("st.onsale", "예매하기") + "</a>";
    }
    if (st === "soldout") return '<span class="badge badge--danger">' + t("st.soldout", "매진") + "</span>";
    if (st === "broadcast") return '<span class="badge badge--gold">' + t("st.broadcast", "방송") + "</span>";
    return '<button type="button" class="btn btn--ghost btn--sm" disabled>' + t("st.soon", "예매 오픈 예정") + "</button>";
  }
  /* 데이터 필드 이중 언어: obj.en[field]가 있으면 EN 모드에서 사용 */
  function tr(o, f) {
    if (document.documentElement.getAttribute("lang") === "en" && o && o.en && o.en[f]) return o.en[f];
    return o ? o[f] : "";
  }
  /* 유형 배지 이중 언어 */
  function kindCat(c) {
    var map = { "무대": "STAGE", "포트레이트": "PORTRAIT", "화보": "EDITORIAL", "자켓": "ALBUM ART", "뮤지컬": "MUSICAL", "기록": "MEMORIES", "비하인드": "BEHIND" };
    return document.documentElement.getAttribute("lang") === "en" && map[c] ? map[c] : c;
  }
  function kindLabel(k) {
    var map = { "공지": "Notice", "공연": "Show", "방송": "Broadcast", "발매": "Release", "수상": "Award", "행사": "Event", "보도": "Press" };
    return document.documentElement.getAttribute("lang") === "en" && map[k] ? map[k] : k;
  }
  /* 동적 문자열 이중 언어 헬퍼 */
  function t(key, ko) {
    var d = window.I18N_EN || {};
    return document.documentElement.getAttribute("lang") === "en" && d[key] ? d[key] : ko;
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  /* ---------- 2. 모바일 내비게이션 ---------- */
  function initNav() {
    var toggle = $(".nav-toggle"), nav = $(".main-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? t("aria.menuClose", "메뉴 닫기") : t("aria.menuOpen", "메뉴 열기"));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", t("aria.menuOpen", "메뉴 열기"));
        toggle.focus();
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Tab" || !nav.classList.contains("open")) return;
      var items = [$(".brand")].concat($all("a", nav)).concat([$(".lang-toggle"), toggle]).filter(Boolean);
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("open") && !nav.contains(e.target) && !toggle.contains(e.target)) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", t("aria.menuOpen", "메뉴 열기"));
      }
    });
  }

  /* ---------- 3. 맨 위로 버튼 ---------- */
  /* 스크롤 상태: 리스너 대신 상단 센티널을 관찰 (프레임당 비용 0) */
  function initScrollState() {
    var header = $(".site-header");
    var btn = $(".back-to-top");
    var topSentinel = el("div");
    topSentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:90px;pointer-events:none;";
    var farSentinel = el("div");
    farSentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:640px;pointer-events:none;";
    document.body.prepend(topSentinel);
    document.body.prepend(farSentinel);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        if (header) header.classList.toggle("scrolled", !entries[0].isIntersecting);
      }).observe(topSentinel);
      new IntersectionObserver(function (entries) {
        if (btn) btn.classList.toggle("show", !entries[0].isIntersecting);
      }).observe(farSentinel);
    } else if (header) {
      header.classList.add("scrolled");
    }
    if (btn) {
      btn.addEventListener("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  /* 스크롤 리빌 */
  function initReveal() {
    var targets = $all(".reveal");
    if (!targets.length) return;
    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (t) { t.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ---------- 4. 뉴스 렌더링 ---------- */
  function newsCard(item, asLink) {
    var a = el(asLink ? "a" : "article", "news-item");
    if (asLink) a.href = "news.html";
    a.innerHTML =
      "<time datetime=\"" + esc(item.date) + '">' + fmtDate(item.date) + "</time>" +
      '<span class="badge badge--' + (item.type === "공지" ? "gold" : "wine") + '">' + esc(kindLabel(item.type)) + "</span>" +
      "<div><h3>" + esc(tr(item, "title")) + '</h3><p class="excerpt">' + esc(tr(item, "excerpt")) + "</p></div>";
    return a;
  }
  function sortedNews() {
    return D.news.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function renderNewsPage() {
    var box = $("#news-list"), bar = $("#news-filter");
    if (!box || !D.news) return;
    function draw(type) {
      box.innerHTML = "";
      var items = sortedNews().filter(function (n) { return type === "전체" || n.type === type; });
      var st = $("#news-status");
      if (st) st.textContent = items.length + t("dyn.newsCount", "건의 소식 표시 중");
      if (!items.length) { box.appendChild(el("p", "empty-note", t("dyn.noCat", "해당 분류의 소식이 아직 없습니다."))); return; }
      items.forEach(function (n) { box.appendChild(newsCard(n, false)); });
    }
    if (bar) {
      bar.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        $all("button", bar).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        draw(b.dataset.type);
      });
    }
    draw("전체");
  }

  /* ---------- 5. 일정 ---------- */

  /* 월간 캘린더 (schedule.html) */
  function renderCalendar() {
    var grid = $("#cal-grid"), title = $("#cal-title");
    if (!grid || !title) return;
    var events = (D.events || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var cur = { y: 2026, m: 8 };
    var minM = cur.y * 12 + cur.m - 1 - 12, maxM = cur.y * 12 + cur.m - 1 + 12;
    if (events.length) {
      var f = events[0].date.split("-"), l = events[events.length - 1].date.split("-");
      minM = (+f[0]) * 12 + (+f[1]) - 1 - 12;
      maxM = (+l[0]) * 12 + (+l[1]) - 1 + 12;
    }
    function monthTitle(y, m) {
      if (document.documentElement.getAttribute("lang") === "en") {
        var names = (window.I18N_EN && window.I18N_EN["dyn.months"] || "").split(",");
        if (names.length === 12) return names[m - 1] + " " + y;
      }
      return y + "년 " + m + "월";
    }
    function draw() {
      grid.innerHTML = "";
      var dows = t("dyn.dow", "일,월,화,수,목,금,토").split(",");
      dows.forEach(function (d) { grid.appendChild(el("div", "dow", d)); });
      title.textContent = monthTitle(cur.y, cur.m);
      var first = new Date(cur.y, cur.m - 1, 1);
      var startDow = first.getDay();
      var days = new Date(cur.y, cur.m, 0).getDate();
      var prevDays = new Date(cur.y, cur.m - 1, 0).getDate();
      var monthHasEvent = false;
      for (var i = 0; i < 42; i++) {
        var cell = el("div", "cal-cell"), num, iso = null;
        if (i < startDow) { cell.classList.add("other"); num = prevDays - startDow + 1 + i; }
        else if (i - startDow + 1 > days) { cell.classList.add("other"); num = i - startDow + 1 - days; }
        else {
          num = i - startDow + 1;
          iso = cur.y + "-" + String(cur.m).padStart(2, "0") + "-" + String(num).padStart(2, "0");
          if (i % 7 === 0) cell.classList.add("sun");
        }
        cell.appendChild(el("span", "num", String(num)));
        if (iso) {
          events.filter(function (e) { return e.date === iso; }).forEach(function (e) {
            monthHasEvent = true;
            var real = e.link && e.link !== "#";
            var tag = el(real ? "a" : "span", "cal-event" + (e.kind !== "공연" ? " cal-event--gold" : ""), esc(e.title));
            if (real) tag.href = e.link;
            tag.title = e.title + " · " + e.place;
            tag.setAttribute("aria-label", e.title + ", " + e.place);
            cell.appendChild(tag);
          });
        }
        grid.appendChild(cell);
      }
      var note = $("#cal-empty");
      if (!note) {
        note = el("p", "empty-note", "");
        note.id = "cal-empty";
        grid.parentNode.appendChild(note);
      }
      note.textContent = monthHasEvent ? "" : t("dyn.noMonth", "이 달에는 등록된 일정이 없습니다.");
      var idx = cur.y * 12 + cur.m - 1;
      $("#cal-prev").disabled = idx <= minM;
      $("#cal-next").disabled = idx >= maxM;
    }
    $("#cal-prev").addEventListener("click", function () { cur.m--; if (cur.m < 1) { cur.m = 12; cur.y--; } draw(); });
    $("#cal-next").addEventListener("click", function () { cur.m++; if (cur.m > 12) { cur.m = 1; cur.y++; } draw(); });
    draw();

  }

  /* 전체 일정 레저 — 달력과 독립 (달력 없어도 렌더) */
  function renderEventList() {
    var list = $("#event-list");
    if (!list || !D.events) return;
    list.innerHTML = "";
    /* 진행 중인 것만: 지난 날짜는 숨기고(지난 공연 그리드가 담당), 상시 방송은 유지 */
    var now = new Date();
    var todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    var events = D.events.slice()
      .filter(function (ev) { return ev.recurring || (ev.date && ev.date >= todayStr); })
      .sort(function (a, b) {
        if (a.recurring) return 1;
        if (b.recurring) return -1;
        return a.date < b.date ? -1 : 1;
      });
    var en = document.documentElement.getAttribute("lang") === "en";
    if (!events.length) {
      list.appendChild(el("p", "empty-note", t("dyn.noEvents", "확정된 예정 일정이 없습니다. 새 공연이 공지되는 대로 이곳에 게재됩니다.")));
      return;
    }
    events.forEach(function (ev) {
      var dateHtml;
      if (ev.recurring) {
        dateHtml = '<div class="event-date"><span class="d">TV</span><span class="m">' + esc(tr(ev, "rlabel")) + "</span></div>";
      } else {
        var d = new Date(ev.date + "T00:00:00");
        var mono = en ? (d.toLocaleString("en", { month: "short" }) + " " + d.getFullYear()) : (d.getFullYear() + "년 " + (d.getMonth() + 1) + "월");
        dateHtml = '<div class="event-date"><span class="d">' + d.getDate() + '</span><span class="m">' + mono + "</span></div>";
      }
      var row = el("div", "event-row");
      row.innerHTML =
        dateHtml +
        '<div class="event-info"><span class="badge badge--' + (ev.kind === "공연" ? "gold" : "wine") + '">' + esc(kindLabel(ev.kind)) + "</span> " +
        (ev.verified === false ? "" : '<span class="badge badge--verify" title="' + t("vf.tip", "소속사 소솝이 직접 확인한 정보입니다") + '">' + t("vf.badge", "소솝 확인") + "</span> ") +
        "<h3>" + esc(tr(ev, "title")) + '</h3><p class="where">' + esc(tr(ev, "place")) + (ev.note ? " · " + esc(ev.note) : "") + "</p></div>" +
        eventCta(ev);
      list.appendChild(row);
    });
  }

  /* ---------- 6. 아카이브: 타임라인 / 디스코그래피 / 영상 ---------- */
  /* ---------- 오늘의 기념일 ----------
     검증된 연대기에서 오늘 날짜에 걸리는 일이 있으면 'N년 전 오늘'로 비추고,
     없으면 다음 기념일까지 남은 날을 센다. 팬에게 이 방이 살아 있는 달력처럼
     느껴지게 하는 장치 — 모든 날짜는 앨범 크레딧·보도로 확인된 것이다. */
  function renderAnniversary() {
    var sec = $("#anniv"), card = $("#anniv-card");
    if (!sec || !card || !D.milestones || !D.milestones.length) return;
    var isEN = document.documentElement.getAttribute("lang") === "en";
    var pick = function (o) { return (isEN && o.en) ? o.en : o.ko; };   /* 평면 {ko,en} 선택 */
    var ord = function (n) {                                            /* 1st·2nd·3rd·Nth */
      var s = ["th", "st", "nd", "rd"], v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    var now = new Date();
    var mm = String(now.getMonth() + 1).padStart(2, "0");
    var dd = String(now.getDate()).padStart(2, "0");
    var todayKey = mm + "-" + dd;
    var thisYear = now.getFullYear();

    var todays = D.milestones.filter(function (m) { return m.d === todayKey; });
    if (todays.length) {
      /* 오늘이 기념일 — 가장 오래된(가장 뜻깊은) 것을 앞세운다 */
      todays.sort(function (a, b) { return a.y - b.y; });
      var m = todays[0];
      var years = thisYear - m.y;
      var head = isEN ? (years + " year" + (years === 1 ? "" : "s") + " ago today")
                        : (years + "년 전 오늘");
      card.innerHTML =
        '<span class="anniv-kicker">' + esc(isEN ? "ON THIS DAY" : "오늘의 기념일") + "</span>" +
        '<p class="anniv-head">' + esc(head) + "</p>" +
        '<p class="anniv-body">' + esc(pick(m)) + "</p>";
      sec.hidden = false;
      return;
    }

    /* 오늘이 아니면 다음 기념일까지 카운트다운 */
    function nextDate(m) {
      var parts = m.d.split("-");
      var d = new Date(thisYear, +parts[0] - 1, +parts[1]);
      if (d < new Date(thisYear, now.getMonth(), now.getDate())) d.setFullYear(thisYear + 1);
      return d;
    }
    var upcoming = D.milestones.map(function (m) { return { m: m, when: nextDate(m) }; })
      .sort(function (a, b) { return a.when - b.when; })[0];
    if (!upcoming) return;
    var days = Math.round((upcoming.when - new Date(thisYear, now.getMonth(), now.getDate())) / 86400000);
    var willBe = upcoming.when.getFullYear() - upcoming.m.y;
    var countLabel = isEN
      ? (days === 0 ? "today" : days + " day" + (days === 1 ? "" : "s") + " to go")
      : (days === 0 ? "오늘" : days + "일 남음");
    var anniLabel = isEN ? (ord(willBe) + " anniversary") : (willBe + "주년");
    card.innerHTML =
      '<span class="anniv-kicker">' + esc(isEN ? "COMING UP" : "다가오는 기념일") + "</span>" +
      '<p class="anniv-head">' + esc(pick(upcoming.m)) + "</p>" +
      '<p class="anniv-body"><b>' + esc(countLabel) + "</b> · " + esc(anniLabel) + "</p>";
    sec.hidden = false;
  }

  function renderTimeline() {
    var box = $("#timeline");
    if (!box || !D.timeline) return;
    D.timeline.forEach(function (t) {
      var li = el("li", t.milestone ? "milestone" : "");
      li.innerHTML = '<span class="year">' + esc(t.year) + '</span><span class="evt">' + esc(tr(t, "event")) + "</span>" +
        (t.note ? '<span class="note">' + esc(tr(t, "note")) + "</span>" : "");
      box.appendChild(li);
    });
  }
  /* 음반 한 줄 정보의 영문판을 고른다.
     영문이 없으면 한국어를 그대로 둔다 — 반쯤 번역된 문장을 만들지 않는다.
     정규 1~18집 크레딧은 형식이 일정해 규칙으로 옮긴다. */
  function albEN(a, field) {
    var ko = a[field] || "";
    if (document.documentElement.getAttribute("lang") !== "en") return ko;
    var e = (window.ALBUMS_EN || {})[a.title];
    if (e && e[field]) return e[field];
    if (field === "credits" && /^정규\s*\d+집\s·/.test(ko) && window.regCreditsEN) {
      return window.regCreditsEN(ko);
    }
    return ko;
  }

  function renderDiscography() {
    var box = $("#discography");
    if (!box || !D.albums) return;
    /* 정규 1~18집 전체 수록곡 병합 (albums-full.js — maniadb 전수 파싱) */
    function regNo(a) {
      var m = (a.kind || "").match(/정규\s*(\d+)집/);
      if (m) return +m[1];
      if (a.kind === "솔로 1집") return 1;
      if (a.kind === "정규" && a.year === "2009") return 17;
      return null;
    }
    (window.REG_ALBUMS || []).forEach(function (r) {
      var hit = null;
      D.albums.forEach(function (a) { if (regNo(a) === r.no) hit = a; });
      if (!hit) return;
      if (!hit.tracks || !hit.tracks.length) hit.tracks = r.tracks;
      if (!hit.art) hit.art = r.art;
      if (!hit.credits) hit.credits = r.credits;
    });
    /* 전체 인덱스: 상세 자료 없는 릴리즈는 타이포 한 줄로 */
    var idx = $("#disco-index");
    var regBox = $("#disco-regular");
    function isReg(a) { return /정규|솔로 1집/.test(a.kind || ""); }
    var regs = [], rich = [], plain = [];
    D.albums.forEach(function (a) {
      if (regBox && isReg(a)) { regs.push(a); return; }
      (a.tracks && a.tracks.length ? rich : plain).push(a);
    });
    /* 정규는 최신 → 1집 순으로 전부 상세 행 (수록곡 없는 앨범도 앨범으로 보이게) */
    /* 시간순: 1집 → 18집 → 2025 (섹션 제목의 흐름과 일치) */
    regs.sort(function (a, b) {
      var y = String(a.year).localeCompare(String(b.year));
      return y !== 0 ? y : (regNo(a) || 99) - (regNo(b) || 99);
    });
    rich.sort(function (a, b) { return String(a.year).localeCompare(String(b.year)); });
    plain.sort(function (a, b) { return String(a.year).localeCompare(String(b.year)); });
    if (idx) {
      plain.forEach(function (a) {
        var r = el("p", "di-row");
        var lk = (a.links || []).map(function (l) {
          return '<a class="di-link" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + "</a>";
        }).join("");
        if (!lk) {
          var su = "https://www.youtube.com/results?search_query=" + encodeURIComponent("인순이 " + a.title.replace(/\s*\(.*\)$/, ""));
          lk = '<a class="di-link" href="' + esc(su) + '" target="_blank" rel="noopener">' + t("rel.find", "듣기") + "</a>";
        }
        r.innerHTML = '<span class="di-year">' + esc(a.year) + "</span>" +
          '<span class="di-title">' + esc(a.title) + "</span>" +
          (lk ? '<span class="di-links">' + lk + "</span>" : '<span class="di-kind">' + esc(albEN(a, "kind")) + "</span>");
        idx.appendChild(r);
      });
    }
    var list = idx ? regs.concat(rich) : D.albums;
    list.forEach(function (a, i) {
      var row = el("button", "album-row");
      row.type = "button";
      row.setAttribute("aria-expanded", "false");
      row.innerHTML =
        (a.art ? '<img class="a-art" src="' + esc(a.art) + '" alt="" loading="lazy">' : '<span class="a-art a-art--empty" aria-hidden="true"></span>') +
        '<span class="a-year">' + esc(a.year) + "</span>" +
        '<div><span class="a-title">' + esc(a.title) + '</span><span class="a-note">' + esc(albEN(a, "note")) + "</span></div>" +
        '<span class="a-kind">' + esc(albEN(a, "kind") || t("rel.album", "앨범")) + "</span>";
      var detail = el("div", "album-detail");
      detail.hidden = true;
      var artistQ = ((a.kind || "") + (a.title || "")).indexOf("희자매") >= 0 || a.kind === "그룹" ? "희자매" : (a.kind === "골든걸스" ? "골든걸스" : "인순이");
      var tracksHtml = (a.tracks && a.tracks.length)
        ? '<ol class="a-tracks">' + a.tracks.map(function (trk) {
            var base = trk.replace(/\s*\((Inst\.|경음악|MR)\)$/, "").replace(/\s*\[[^\]]+\]$/, "");
            /* 공식 음원 직결 (- Topic 아트 트랙, oEmbed 검증) — 없으면 검색 폴백 */
            var direct = (window.TRACK_LINKS || {})[artistQ + "|" + base];
            var q = direct
              ? "https://www.youtube.com/watch?v=" + direct
              : "https://www.youtube.com/results?search_query=" + encodeURIComponent(artistQ + " " + base);
            return '<li><a class="tr-link" href="' + esc(q) + '" target="_blank" rel="noopener"><span class="tr-name">' + esc(trk) + '</span><span class="tr-play" aria-hidden="true">' + t("rel.play", "듣기 ▶") + "</span></a></li>";
          }).join("") + "</ol>"
        : "<p>" + t("rel.tbd", "수록곡은 곧 더해집니다.") + "</p>";
      var creditsText = albEN(a, "credits");
      var creditsHtml = creditsText
        ? '<p class="a-credits">' + esc(creditsText) + "</p>"
        : "<p>" + t("rel.tbd", "수록곡은 곧 더해집니다.") + "</p>";
      var searchUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent("인순이 " + a.title.replace(/\s*\(.*\)$/, ""));
      var linksHtml = (a.links && a.links.length)
        ? '<p class="a-links">' + a.links.map(function (l) {
            return '<a class="a-link" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + ' <span aria-hidden="true">↗</span></a>';
          }).join("") + "</p>"
        : '<p class="a-links"><a class="a-link" href="' + esc(searchUrl) + '" target="_blank" rel="noopener">' + t("rel.search", "YouTube에서 찾기") + ' <span aria-hidden="true">↗</span></a></p>';
      detail.innerHTML =
        "<div><h4>" + t("rel.tracks", "수록곡") + "</h4>" + tracksHtml + "</div>" +
        "<div><h4>" + t("rel.credits", "크레딧") + "</h4>" + creditsHtml + "</div>" +
        "<div><h4>" + t("rel.listen", "감상") + "</h4>" + linksHtml + "</div>";
      row.addEventListener("click", function () {
        var open = detail.hidden;
        detail.hidden = !open;
        row.setAttribute("aria-expanded", String(open));
      });
      var target = (regBox && isReg(a)) ? regBox : box;
      if (regBox && isReg(a)) { row.id = "alb-" + (regNo(a) || a.year); }
      target.appendChild(row);
      target.appendChild(detail);
    });
    buildAlbumWall(regs, regNo);
  }

  /* 앨범 월: 정규 자켓을 한눈에 — 누르면 해당 앨범이 열린다 */
  function buildAlbumWall(regs, regNo) {
    var wall = $("#album-wall");
    if (!wall || !regs || !regs.length) return;
    regs.forEach(function (a) {
      if (!a.art) return;
      var b = el("button", "aw-cell");
      b.type = "button";
      b.setAttribute("role", "listitem");
      var no = regNo(a);
      /* 앨범 제목은 고유명사라 그대로 두고, 붙는 말만 언어를 따른다 */
      var label = (no ? t("dyn.albNo", no + "집").replace("{n}", no) : a.year) + " " + a.title;
      b.setAttribute("aria-label", label);
      b.innerHTML =
        '<img src="' + esc(a.art) + '" alt="" loading="lazy">' +
        '<span class="aw-no">' + esc(no ? String(no) : a.year) + "</span>" +
        '<span class="aw-cap"><em>' + esc(a.title) + "</em><i>" + esc(a.year) + "</i></span>";
      b.addEventListener("click", function () {
        var row = document.getElementById("alb-" + (no || a.year));
        if (!row) return;
        var detail = row.nextElementSibling;
        if (detail && detail.hidden) { row.click(); }
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.focus({ preventScroll: true });
      });
      wall.appendChild(b);
    });
  }
  /* 지난 무대 리캡: 타일 → VIEW RECAP 패널 (사진 갤러리 + 영상) */
  function renderPastRecaps() {
    var box = $("#past-recaps");
    if (!box) return;
    var items = D.recaps || [];
    if (!items.length && D.videos) {
      buildVideoTiles(box, D.videos.filter(function (v) { return v.youtubeId; }).slice(1));
      return;
    }
    box.classList.add("shows-grid");
    /* 자료 있는 리캡 + 기록만 있는 지난 공연을 하나의 문양 그리드로 */
    var shows = [];
    items.forEach(function (r) { shows.push({ recap: r, date: r.date || r.year || "", city: tr(r, "city") || tr(r, "place"), title: tr(r, "title") }); });
    function fmtShow(d) {
      if (!d) return "";
      var parts = String(d).split("-");
      if (parts[0] === "1999") return "1999";
      return parts[0] + ". " + (parts[1] ? parseInt(parts[1], 10) + "." : "") + (parts[2] ? " " + parseInt(parts[2], 10) + "." : "");
    }
    (D.pastShows || []).forEach(function (p) {
      var cell = { date: fmtShow(p.date), city: tr(p, "city"), venue: tr(p, "venue"), title: tr(p, "title") };
      if (p.recap || p.poster) {
        /* 공연 항목이 자체 리캡(클립·사진)을 갖거나, 포스터만 있어도 열람 가능 */
        var rc = p.recap ? Object.assign({}, p.recap) : {};
        if (!rc.title) rc.title = tr(p, "title");
        if (!rc.year) rc.year = String(p.date || "").slice(0, 4);
        if (!rc.place) rc.place = [tr(p, "venue"), tr(p, "city")].filter(Boolean).join(" · ");
        if (p.recap && p.recap.en) rc.en = p.recap.en;
        if (p.poster) {
          rc.photos = (rc.photos || []).concat([{ img: p.poster, w: p.pw || 700, h: p.phh || 1000, caption: t("recap.poster", "공연 포스터") }]);
        }
        cell.recap = rc;
      }
      shows.push(cell);
    });
    /* 최신순 통합 정렬 (리캡+공연) */
    function sk(v) {
      var m = String(v || "").match(/(\d{4})\D*(\d{1,2})?\D*(\d{1,2})?/);
      if (!m) return 0;
      return (+m[1]) * 10000 + (+(m[2] || 0)) * 100 + (+(m[3] || 0));
    }
    shows.forEach(function (sh) { sh._k = sk(sh.recap && sh.recap.date ? sh.recap.date : sh.date); });
    shows.sort(function (a, b) { return b._k - a._k; });
    initStageBg(box);
    shows.forEach(function (sh) {
      var c;
      if (sh.recap) {
        c = el("button", "show-cell");
        c.type = "button";
        c.setAttribute("aria-haspopup", "dialog");
        c.setAttribute("aria-label", sh.title + " " + t("dyn.recapOpen", "리캡 열기"));
      } else {
        c = el("div", "show-cell");
      }
      c.innerHTML =
        '<span class="show-mark" aria-hidden="true"><svg viewBox="0 0 120 72" focusable="false"><g fill="currentColor"><ellipse cx="48" cy="46" rx="27" ry="11.5" transform="rotate(-7 48 46)"/><path d="M66 41 C78 36 87 30 94 23" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><circle cx="96" cy="21" r="5.4"/><path d="M100 18.5 L111 21 L100 24.5 Z"/><path d="M45 38 C36 24 34 13 41 6 C48 12 55 27 57 37 C53 38.5 49 38.7 45 38 Z"/><path d="M24 42 L10 37 L22 50 Z"/></g></svg></span>' +
        '<span class="show-date">' + esc(sh.date) + "</span>" +
        '<span class="show-city">' + esc(sh.title) + (sh.city ? " · " + esc(sh.city) : "") + "</span>" +
        (sh.recap ? '<span class="show-cta">VIEW RECAP</span>' : "");
      if (sh.recap) c.addEventListener("click", function () { openRecap(sh.recap, c); });
      /* 대표 사진이 있으면 호버 시 전체 화면 배경으로 떠오른다 */
      /* 포스터는 밝고 그래픽이 강해 배경으로 쓰면 글자를 덮는다 — 실제 무대 사진만 쓴다 */
      var bgSrc = sh.recap && sh.recap.bg;
      if (bgSrc) {
        c.setAttribute("data-bg", bgSrc);
        c.setAttribute("data-name", sh.title);
        c.setAttribute("data-when", sh.date || "");
        if (sh.recap.video) c.setAttribute("data-video", sh.recap.video);
      }
      box.appendChild(c);
    });
  }

  /* 공연 그리드 포커스 연출: 한 공연에 머무르면 그 밤이 화면 전체로 떠오른다
     (사진 또는 실황 영상 + 대형 제목. 요소는 각 1개만 두고 소스만 교체한다) */
  function initStageBg(grid) {
    if (!window.matchMedia || !window.matchMedia("(hover: hover)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var bg = el("div", "stage-bg");
    bg.setAttribute("aria-hidden", "true");
    bg.innerHTML = '<video class="sbg-video" muted loop playsinline preload="none"></video><div class="sbg-scrim"></div>';
    var cap = el("div", "stage-title");
    cap.setAttribute("aria-hidden", "true");
    cap.innerHTML = '<span class="st-when"></span><span class="st-name"></span>';
    document.body.appendChild(bg);
    document.body.appendChild(cap);
    var vid = bg.querySelector(".sbg-video");
    var timer = null, curKey = "";

    function show(cell) {
      var src = cell && cell.getAttribute("data-bg");
      if (!src) return;
      var vsrc = cell.getAttribute("data-video") || "";
      var key = src + "|" + vsrc;
      clearTimeout(timer);
      if (key !== curKey) {
        curKey = key;
        bg.style.backgroundImage = 'url("' + src + '")';
        if (vsrc) {
          if (vid.getAttribute("src") !== vsrc) { vid.setAttribute("src", vsrc); vid.load(); }
          vid.classList.add("is-on");
          var pr = vid.play();
          if (pr && pr.catch) pr.catch(function () {});
        } else {
          vid.classList.remove("is-on");
          vid.removeAttribute("src");
        }
        cap.querySelector(".st-when").textContent = cell.getAttribute("data-when") || "";
        cap.querySelector(".st-name").textContent = cell.getAttribute("data-name") || "";
      }
      grid.classList.add("is-focusing");
      bg.classList.add("is-on");
      cap.classList.add("is-on");
    }
    function hide() {
      grid.classList.remove("is-focusing");
      cap.classList.remove("is-on");
      timer = setTimeout(function () {
        bg.classList.remove("is-on");
        if (!vid.paused) vid.pause();
      }, 140);
    }
    grid.addEventListener("pointerover", function (e) {
      var c = e.target.closest ? e.target.closest(".show-cell") : null;
      if (c) show(c);
    });
    grid.addEventListener("pointerleave", hide);
    grid.addEventListener("focusin", function (e) {
      var c = e.target.closest ? e.target.closest(".show-cell") : null;
      if (c) show(c);
    });
    grid.addEventListener("focusout", hide);
  }

  /* ---------- 최근 공식 영상 (자동 수집 live-shows.json — GitHub Actions 일일 갱신) ---------- */
  function initFreshVideos() {
    var box = $("#fresh-videos");
    if (!box) return;
    fetch("assets/data/live-shows.json?" + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var wrap = $("#fresh-wrap");
        var cut = new Date(); cut.setFullYear(cut.getFullYear() - 1);
        var cutStr = cut.toISOString().slice(0, 10);
        var items = ((d && d.items) || []).filter(function (v) { return v.date >= cutStr; });
        if (!items.length) return; /* 신선한 게 없으면 섹션 자체를 숨긴 채 둔다 */
        if (wrap) wrap.hidden = false;
        items.slice(0, 8).forEach(function (v) {
          var title = v.title.replace(/#\S+/g, "").replace(/\s+/g, " ").trim() || v.title;
          var b = el("button", "fresh-row");
          b.type = "button";
          b.setAttribute("aria-haspopup", "dialog");
          b.innerHTML =
            '<span class="fr-date">' + esc(v.date) + "</span>" +
            '<span class="fr-title">' + esc(title) + "</span>" +
            '<span class="fr-ch">' + esc(v.channel) + "</span>";
          b.addEventListener("click", function () {
            if (window.INSOONI_DECK) window.INSOONI_DECK.pause();
            openLightbox(v.id, title, b);
          });
          box.appendChild(b);
        });
      })
      .catch(function () { /* 파일 미존재 시 조용히 생략 */ });
  }

  /* ---------- 리캡 패널 (beyonce.com/tour VIEW RECAP 문법) ---------- */
  var recapEl = null, recapOpener = null;
  function ensureRecapPanel() {
    if (recapEl) return recapEl;
    recapEl = el("div", "recap-panel");
    recapEl.setAttribute("role", "dialog");
    recapEl.setAttribute("aria-modal", "true");
    recapEl.hidden = true;
    recapEl.innerHTML =
      '<button type="button" class="lightbox-close recap-close" aria-label="닫기" data-i18n-aria="aria.close">×</button>' +
      '<div class="recap-inner"></div>';
    document.body.appendChild(recapEl);
    $(".recap-close", recapEl).addEventListener("click", closeRecap);
    recapEl.addEventListener("click", function (e) { if (e.target === recapEl) closeRecap(); });
    document.addEventListener("keydown", function (e) {
      if (recapEl.hidden) return;
      if (lightboxEl && !lightboxEl.hidden) return; /* 이미지 뷰어가 위에 열려 있으면 그쪽 우선 */
      if (e.key === "Escape") { closeRecap(); return; }
      if (e.key === "Tab") {
        var f = recapEl.querySelectorAll("button, iframe, video, a[href]");
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    /* 이 창은 첫 클릭 때 만들어진다 — 번역은 이미 끝난 뒤라 여기서 직접 건다 */
    applyLang(curLang());
    return recapEl;
  }
  function closeRecap() {
    if (!recapEl || recapEl.hidden) return;
    recapEl.hidden = true;
    $(".recap-inner", recapEl).innerHTML = ""; /* 영상·iframe 정지 겸 정리 */
    document.body.style.overflow = "";
    if (recapOpener) { recapOpener.focus(); recapOpener = null; }
  }
  function openRecap(r, opener) {
    /* 무대 영상이 열리면 흐르던 믹스를 멈춘다 — 소리가 겹치지 않게 */
    if (window.INSOONI_DECK) window.INSOONI_DECK.pause();
    var box = ensureRecapPanel();
    recapOpener = opener || null;
    box.setAttribute("aria-label", tr(r, "title") + " " + t("recap.label", "리캡"));
    var inner = $(".recap-inner", box);
    var metaLine = [r.year, tr(r, "place")].filter(Boolean).join(" · ");
    var html =
      '<header class="recap-head">' +
      '<span class="recap-kicker">RECAP</span>' +
      "<h2>" + esc(tr(r, "title")) + "</h2>" +
      (metaLine ? '<p class="recap-meta">' + esc(metaLine) + "</p>" : "") +
      (r.desc ? '<p class="recap-desc">' + esc(tr(r, "desc")) + "</p>" : "") +
      "</header>";
    if (r.clips && r.clips.length) {
      /* 무대별 유튜브 클립 여러 개: 첫 클립 재생 + 곡 선택 버튼 */
      html += '<div class="recap-video recap-video--embed" id="recap-clip-host"></div>';
      if (r.clips.length > 1) {
        html += '<div class="recap-clips" role="group" aria-label="' + t("recap.clips", "무대 클립 선택") + '">';
        r.clips.forEach(function (cl, ci) {
          html += '<button type="button" class="recap-clip' + (ci === 0 ? " is-on" : "") + '" data-cid="' + esc(cl.id) + '" data-ct="' + esc(tr(cl, "title")) + '">' + esc(tr(cl, "title")) + "</button>";
        });
        html += "</div>";
      }
    } else if (r.youtubeId) {
      html += '<div class="recap-video recap-video--embed" id="recap-clip-host"></div>';
    } else if (r.video) {
      html += '<div class="recap-video"><video src="' + esc(r.video) + '"' + (r.poster ? ' poster="' + esc(r.poster) + '"' : "") + " controls playsinline preload=\"metadata\"></video></div>";
    }
    inner.innerHTML = html;
    /* 첫 클립을 HD로 붙인다 (자동재생 없이 — 사용자가 눌러 재생) */
    var clipHost = inner.querySelector("#recap-clip-host");
    if (clipHost) {
      var first = (r.clips && r.clips[0]) || (r.youtubeId ? { id: r.youtubeId, title: r.title } : null);
      if (first) mountHDVideo(clipHost, first.id, tr(first, "title") || r.title, false);
    }
    /* 클립 선택 → HD 임베드 교체 (자동재생) */
    var clipBtns = inner.querySelectorAll(".recap-clip");
    if (clipBtns.length && clipHost) {
      clipBtns.forEach(function (b) {
        b.addEventListener("click", function () {
          inner.querySelectorAll(".recap-clip.is-on").forEach(function (x) { x.classList.remove("is-on"); });
          b.classList.add("is-on");
          mountHDVideo(clipHost, b.getAttribute("data-cid"), b.getAttribute("data-ct"), true);
        });
      });
    }
    var photos = (r.photos || []).slice();
    if (photos.length) {
      inner.appendChild(el("h3", "recap-sub", t("recap.gallery", "현장 기록")));
      var grid = el("div", "recap-grid");
      photos.forEach(function (p, i) {
        var b = el("button", "arch-item recap-item");
        b.type = "button";
        b.setAttribute("aria-haspopup", "dialog");
        b.setAttribute("aria-label", (p.caption || r.title) + " 크게 보기");
        b.innerHTML = '<img src="' + esc(p.img) + '" alt="' + esc(p.caption || "") + '" width="' + p.w + '" height="' + p.h + '" loading="lazy">';
        b.addEventListener("click", function () {
          archView.list = photos;
          openImageViewer(i, b);
        });
        grid.appendChild(b);
      });
      inner.appendChild(grid);
    }
    var mem = el("p", "recap-mem");
    mem.innerHTML = '<a class="btn btn--ghost btn--sm" href="community.html#letter">' + t("recap.mem", "이 공연에 다녀오셨나요? 추억을 보내주세요") + "</a>";
    inner.appendChild(mem);
    box.hidden = false;
    document.body.style.overflow = "hidden";
    $(".recap-close", box).focus();
  }

  /* ---------- 시각 아카이브: 마스너리 + 뷰어 ---------- */
  var archView = { list: [], idx: 0 };
  function renderArchive() {
    var grid = $("#arch-grid"), bar = $("#arch-filter");
    if (!grid || !D.archive) return;
    function draw(cat) {
      grid.innerHTML = "";
      var items = D.archive.filter(function (a) { return cat === "전체" || a.cat === cat; })
        .slice().sort(function (a, b) {
          var ya = parseInt(String(a.year).replace(/\D.*$/, ""), 10) || 9999;
          var yb = parseInt(String(b.year).replace(/\D.*$/, ""), 10) || 9999;
          return ya - yb;
        });
      var viewables = items.filter(function (a) { return !a.placeholder; });
      archView.list = viewables;
      var st = $("#arch-status");
      if (st) st.textContent = viewables.length + t("dyn.archCount", "장의 기록 표시 중");
      if (!items.length) { grid.appendChild(el("p", "empty-note", t("dyn.noCat", "해당 분류의 기록이 아직 없습니다."))); return; }
      items.forEach(function (a) {
        if (a.placeholder) {
          var ph = el("div", "arch-item arch-item--ph");
          ph.innerHTML = '<p class="frame-note">' + esc(tr(a, "caption")) + "</p>";
          grid.appendChild(ph);
          return;
        }
        var i = viewables.indexOf(a);
        var b = el("button", "arch-item");
        b.type = "button";
        b.setAttribute("aria-haspopup", "dialog");
        b.setAttribute("aria-label", tr(a, "caption") + " " + t("aria.zoom", "크게 보기"));
        b.innerHTML = '<img src="' + esc(a.img) + '" alt="' + esc(tr(a, "caption")) + '" width="' + a.w + '" height="' + a.h + '" loading="lazy">' +
          '<span class="arch-cap">' + esc(tr(a, "year")) + " · " + esc(kindCat(a.cat)) + "</span>";
        b.addEventListener("click", function () { openImageViewer(i, b); });
        grid.appendChild(b);
      });
    }
    if (bar) {
      bar.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        $all("button", bar).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        draw(b.dataset.cat);
      });
    }
    draw("전체");
  }
  function viewerShow() {
    var box = ensureLightbox();
    var a = archView.list[archView.idx];
    if (!a) return;
    box.setAttribute("aria-label", tr(a, "caption"));
    $(".lightbox-frame", box).innerHTML = '<img class="lb-img" src="' + esc(a.img) + '" alt="' + esc(tr(a, "caption")) + '">';
    $(".lightbox-caption", box).textContent = [tr(a, "caption"), a.year, kindCat(a.cat)].filter(Boolean).join(" · ");
    var multi = archView.list.length > 1;
    $(".lb-prev", box).hidden = !multi;
    $(".lb-next", box).hidden = !multi;
  }
  function openImageViewer(idx, opener) {
    var box = ensureLightbox();
    archView.idx = idx;
    lightboxOpener = opener || null;
    box.dataset.mode = "image";
    viewerShow();
    box.hidden = false;
    document.body.style.overflow = "hidden";
    $(".lightbox-close", box).focus();
  }

  /* ---------- 6b. 영상 라이트박스 (View Recap 오버레이) ---------- */
  var lightboxEl = null, lightboxOpener = null;
  function ensureLightbox() {
    if (lightboxEl) return lightboxEl;
    lightboxEl = el("div", "lightbox");
    lightboxEl.setAttribute("role", "dialog");
    lightboxEl.setAttribute("aria-modal", "true");
    lightboxEl.hidden = true;
    lightboxEl.innerHTML =
      '<button type="button" class="lightbox-close" aria-label="닫기" data-i18n-aria="aria.close">×</button>' +
      '<button type="button" class="lb-nav lb-prev" aria-label="이전" hidden>←</button>' +
      '<div class="lightbox-frame"></div>' +
      '<button type="button" class="lb-nav lb-next" aria-label="다음" hidden>→</button>' +
      '<p class="lightbox-caption"></p>';
    $(".lb-prev", lightboxEl).addEventListener("click", function () {
      archView.idx = (archView.idx - 1 + archView.list.length) % archView.list.length; viewerShow();
    });
    $(".lb-next", lightboxEl).addEventListener("click", function () {
      archView.idx = (archView.idx + 1) % archView.list.length; viewerShow();
    });
    document.body.appendChild(lightboxEl);
    function close() {
      lightboxEl.hidden = true;
      $(".lightbox-frame", lightboxEl).innerHTML = "";   /* iframe 제거 = 재생 정지 */
      /* 리캡 패널이 아래에 열려 있으면 배경 스크롤 잠금 유지 */
      document.body.style.overflow = (recapEl && !recapEl.hidden) ? "hidden" : "";
      if (lightboxOpener) { lightboxOpener.focus(); lightboxOpener = null; }
    }
    $(".lightbox-close", lightboxEl).addEventListener("click", close);
    lightboxEl.addEventListener("click", function (e) { if (e.target === lightboxEl) close(); });
    document.addEventListener("keydown", function (e) {
      if (lightboxEl.hidden) return;
      if (e.key === "Escape") { close(); return; }
      if (lightboxEl.dataset.mode === "image" && archView.list.length > 1) {
        if (e.key === "ArrowLeft") { archView.idx = (archView.idx - 1 + archView.list.length) % archView.list.length; viewerShow(); return; }
        if (e.key === "ArrowRight") { archView.idx = (archView.idx + 1) % archView.list.length; viewerShow(); return; }
      }
      if (e.key === "Tab") {
        var focusables = lightboxEl.querySelectorAll("button:not([hidden]), iframe");
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    /* 위와 같은 이유 — 늦게 태어난 요소에도 언어를 입힌다 */
    applyLang(curLang());
    return lightboxEl;
  }
  /* ---------- 유튜브 HD 임베드 (파사드 방식) ----------
     유튜브 화질 API(setPlaybackQuality·vq=hd1080)는 2019년 이후 동작하지 않는다.
     선명해 보이게 하는 진짜 방법은 세 가지다:
       ① 클릭 전에는 원본 고해상 썸네일(maxresdefault)을 보여 준다 — 즉시 '고화질'로 읽힌다
       ② 플레이어를 크게(≥720px) 띄우면 유튜브가 알아서 높은 화질을 고른다
       ③ 유튜브 껍데기(빨간 로고·추천영상)를 벗겨 우리 영상처럼 보이게 한다
     그래서 iframe을 미리 심지 않고, 썸네일을 깔았다가 누르면 그때 크게 붙인다. */
  var YT_PARAMS = "rel=0&playsinline=1&color=white&iv_load_policy=3&modestbranding=1";
  function ytIframe(videoId, title, extra) {
    return '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(videoId) +
      "?" + YT_PARAMS + (extra || "") +
      '" title="' + esc(title) + '" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
  }
  /* maxresdefault가 없는 영상이 있어 로드 실패 시 hqdefault로 되돌린다 */
  function ytPoster(videoId) {
    return "https://i.ytimg.com/vi/" + videoId + "/maxresdefault.jpg";
  }
  /* host에 파사드를 심는다. autoplay=true면 바로 큰 플레이어를 붙인다(이미 사용자가
     한 번 눌러 들어온 라이트박스 등). false면 썸네일→클릭→재생. */
  function mountHDVideo(host, videoId, title, autoplay) {
    host._hd = (host._hd || 0) + 1;
    if (autoplay) { host.innerHTML = ytIframe(videoId, title, "&autoplay=1&controls=1"); return; }
    var btn = el("button", "yt-facade");
    btn.type = "button";
    btn.setAttribute("aria-label", title + t("aria.lbVideoSuffix", " 영상 재생"));
    var img = new Image();
    img.className = "yt-facade-poster";
    img.alt = "";
    img.loading = "lazy";
    img.onerror = function () { if (img.src.indexOf("maxres") >= 0) img.src = "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"; };
    img.src = ytPoster(videoId);
    btn.appendChild(img);
    var play = el("span", "yt-facade-play");
    play.setAttribute("aria-hidden", "true");
    play.innerHTML = "&#9658;";
    btn.appendChild(play);
    btn.addEventListener("click", function () {
      if (window.INSOONI_DECK) window.INSOONI_DECK.pause();
      host.innerHTML = ytIframe(videoId, title, "&autoplay=1&controls=1");
    });
    host.innerHTML = "";
    host.appendChild(btn);
  }

  function openLightbox(videoId, title, opener) {
    if (window.INSOONI_DECK) window.INSOONI_DECK.pause();
    var box = ensureLightbox();
    box.dataset.mode = "video";
    $(".lb-prev", box).hidden = true;
    $(".lb-next", box).hidden = true;
    lightboxOpener = opener || null;
    box.setAttribute("aria-label", title + t("aria.lbVideoSuffix", " 영상 재생"));
    $(".lightbox-caption", box).textContent = title + " · INSOONI OFFICIAL";
    mountHDVideo($(".lightbox-frame", box), videoId, title, true);
    box.hidden = false;
    document.body.style.overflow = "hidden";
    $(".lightbox-close", box).focus();
  }

  /* ---------- 7. 사랑방: 팬레터 ---------- */
  function initLetters() {
    var form = $("#letter-form"), listBox = $("#letter-list");
    if (!form) return;
    var KEY = "insooni_letters";
    function draw() {
      if (!listBox) return;
      listBox.innerHTML = "";
      var letters = (store(KEY) || []).concat(D.sampleLetters || []);
      if (!letters.length) { listBox.appendChild(el("p", "empty-note", t("dyn.firstLetter", "첫 번째 편지의 주인공이 되어 주세요."))); return; }
      letters.slice(0, 6).forEach(function (L) {
        var p = el("article", "post");
        p.innerHTML =
          '<div class="post-head"><span class="avatar" aria-hidden="true">' + esc(firstChar(L.name)) + '</span>' +
          '<span class="who">' + esc(L.name || t("dyn.anon", "익명 팬")) + '</span><span class="when">' + esc(L.date || "") + "</span></div>" +
          '<p class="post-body">' + esc(L.body) + "</p>";
        listBox.appendChild(p);
      });
    }
    var okTimer = null;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector("[type=submit]");
      if (btn && btn.disabled) return;
      var name = $("#letter-name").value.trim() || t("dyn.anon", "익명 팬");
      var body = $("#letter-body").value.trim();
      if (!body) { $("#letter-body").focus(); return; }
      if (btn) { btn.disabled = true; setTimeout(function () { btn.disabled = false; }, 800); }
      var letters = store(KEY) || [];
      var now = new Date();
      letters.unshift({ name: name, body: body, date: now.getFullYear() + ". " + (now.getMonth() + 1) + ". " + now.getDate() + "." });
      store(KEY, letters);
      form.reset();
      var okMsg = $("#letter-ok");
      if (okMsg) {
        okMsg.hidden = false;
        if (okTimer) clearTimeout(okTimer);
        okTimer = setTimeout(function () { okMsg.hidden = true; }, 4000);
      }
      draw();
    });
    draw();
  }

  /* ---------- 8. 사랑방: 게시판 ---------- */
  var GOOSE_AVATAR = '<svg viewBox="0 0 120 72" aria-hidden="true" focusable="false" style="width:20px;height:auto"><g fill="currentColor"><ellipse cx="48" cy="46" rx="27" ry="11.5" transform="rotate(-7 48 46)"/><path d="M66 41 C78 36 87 30 94 23" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><circle cx="96" cy="21" r="5.4"/><path d="M100 18.5 L111 21 L100 24.5 Z"/><path d="M45 38 C36 24 34 13 41 6 C48 12 55 27 57 37 C53 38.5 49 38.7 45 38 Z"/><path d="M24 42 L10 37 L22 50 Z"/></g></svg>';
  function initBoard() {
    var listBox = $("#board-list"), form = $("#board-form");
    if (!listBox) return;
    /* 이달의 이야기: 달마다 다른 실마리 한 줄. 누르면 이야기 칸으로 옮겨 준다. */
    var promptBtn = $("#board-prompt");
    if (promptBtn && D.boardPrompts && D.boardPrompts.length) {
      var bpEN = document.documentElement.getAttribute("lang") === "en";
      var now = new Date();
      var idx = (now.getFullYear() * 12 + now.getMonth()) % D.boardPrompts.length;
      var pr = D.boardPrompts[idx];
      var prText = (bpEN && pr.en) ? pr.en : pr.ko;
      promptBtn.innerHTML = '<span class="bp-kicker">' +
        (bpEN ? "THIS MONTH'S STORY" : "이달의 이야기") +
        '</span><span class="bp-text"></span>';
      promptBtn.querySelector(".bp-text").textContent = prText;
      promptBtn.hidden = false;
      promptBtn.addEventListener("click", function () {
        var ta = $("#post-body");
        if (ta) { ta.value = prText + "\n\n"; ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollIntoView({ block: "center", behavior: "smooth" }); }
      });
    }
    var KEY = "insooni_posts";
    function likeKey(id) { return "insooni_like_" + id; }
    function draw() {
      listBox.innerHTML = "";
      var posts = (store(KEY) || []).concat(D.samplePosts || []);
      posts.forEach(function (P, idx) {
        var id = P.id || "u" + idx;
        var liked = !!store(likeKey(id));
        var likes = (P.likes || 0) + (liked ? 1 : 0);
        var article = el("article", "post" + (P.artist ? " post--artist" : ""));
        article.innerHTML =
          '<div class="post-head"><span class="avatar" aria-hidden="true">' + (P.artist ? GOOSE_AVATAR : esc(firstChar(P.name))) + "</span>" +
          '<span class="who">' + esc(P.name) + "</span>" +
          (P.artist ? '<span class="badge badge--gold">공식</span>' : "") +
          '<span class="when">' + esc(P.date || "") + "</span></div>" +
          '<p class="post-body">' + esc(P.body) + "</p>" +
          '<div class="post-actions">' +
          '<button type="button" data-like="' + esc(id) + '" aria-pressed="' + liked + '">응원 ' + likes + "</button>" +
          '<button type="button" data-report="' + esc(id) + '"' + (store("insooni_report_" + id) ? ' disabled>' + t("dyn.reportedBtn", "신고 접수됨") : ">" + t("dyn.report", "신고")) + "</button></div>";
        listBox.appendChild(article);
      });
    }
    listBox.addEventListener("click", function (e) {
      var likeBtn = e.target.closest("[data-like]");
      var reportBtn = e.target.closest("[data-report]");
      if (likeBtn) {
        var id = likeBtn.getAttribute("data-like");
        store(likeKey(id), store(likeKey(id)) ? null : true);
        if (store(likeKey(id)) === null) localStorage.removeItem("insooni_like_" + id);
        draw();
      }
      if (reportBtn) {
        var rid = reportBtn.getAttribute("data-report");
        if (store("insooni_report_" + rid)) return;
        store("insooni_report_" + rid, true);
        reportBtn.disabled = true;
        reportBtn.textContent = t("dyn.reportedBtn", "신고 접수됨");
        var post = reportBtn.closest(".post");
        var msg = el("p", "form-hint", t("dyn.reported", "신고가 접수되었습니다. 운영진이 검토합니다."));
        msg.setAttribute("role", "status");
        post.appendChild(msg);
        setTimeout(function () { msg.remove(); }, 4000);
      }
    });
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var btn = form.querySelector("[type=submit]");
        if (btn && btn.disabled) return;
        var name = $("#post-name").value.trim() || t("dyn.anon", "익명 팬");
        var body = $("#post-body").value.trim();
        if (!body) { $("#post-body").focus(); return; }
        if (btn) { btn.disabled = true; setTimeout(function () { btn.disabled = false; }, 800); }
        var posts = store(KEY) || [];
        var now = new Date();
        posts.unshift({ id: "p" + Date.now(), name: name, body: body, likes: 0, date: now.getFullYear() + ". " + (now.getMonth() + 1) + ". " + now.getDate() + "." });
        store(KEY, posts);
        form.reset();
        draw();
      });
    }
    draw();
  }

  /* ---------- 9. 사랑방: 투표 ---------- */
  function initPoll() {
    /* 신청곡: 258곡 전체에서 검색해 신청하고, 많이 신청된 순으로 보여준다 */
    var input = $("#req-q");
    if (!input) return;
    var out = $("#req-results"), note = $("#req-note"), rank = $("#req-rank");
    var KEY = "insooni_requests";
    var CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    function toCho(x) {
      return String(x).replace(/[가-힣]/g, function (c) { return CHO[Math.floor((c.charCodeAt(0) - 0xac00) / 588)]; });
    }
    function nm(x) { return String(x).toLowerCase().replace(/[\s'"`·.,!?()\[\]/-]/g, ""); }

    var songs = [];
    (function build() {
      var D2 = window.SITE_DATA || {}, seen = {};
      function add(title, album, year) {
        var base = String(title).replace(/\s*\((Inst\.|경음악|MR)\)$/, "").replace(/\s*\[[^\]]+\]$/, "");
        var k = nm(base);
        if (!k || seen[k]) return;
        seen[k] = 1;
        songs.push({ t: base, al: album, y: String(year || ""), c: toCho(base), n: k });
      }
      (window.REG_ALBUMS || []).forEach(function (a) {
        var meta = null;
        (D2.albums || []).forEach(function (x) {
          var m = (x.kind || "").match(/정규\s*(\d+)집/);
          var no = m ? +m[1] : (x.kind === "솔로 1집" ? 1 : ((x.kind === "정규" && x.year === "2009") ? 17 : null));
          if (no === a.no) meta = x;
        });
        (a.tracks || []).forEach(function (t2) { add(t2, meta ? meta.title : a.no + "집", a.year); });
      });
      (D2.albums || []).forEach(function (a) {
        if (a.tracks && a.tracks.length) a.tracks.forEach(function (t2) { add(t2, a.title, a.year); });
        else add(a.title, a.title, a.year);
      });
    })();

    function counts() {
      var base = {};
      (D.requestSeed || []).forEach(function (r) { base[r.t] = r.n; });
      var mine = store(KEY) || {};
      Object.keys(mine).forEach(function (k) { base[k] = (base[k] || 0) + 1; });
      return base;
    }
    function drawRank() {
      var c = counts();
      var list = Object.keys(c).map(function (k) { return { t: k, n: c[k] }; })
        .sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
      var max = list.length ? list[0].n : 1;
      rank.innerHTML = "";
      var mine = store(KEY) || {};
      list.forEach(function (r, i) {
        var row = el("div", "rk-row" + (mine[r.t] ? " is-mine" : ""));
        row.innerHTML =
          '<span class="rk-no">' + (i + 1) + "</span>" +
          '<span class="rk-name"></span>' +
          '<span class="rk-bar"><i style="width:' + Math.round(r.n / max * 100) + '%"></i></span>' +
          '<span class="rk-n">' + r.n + "</span>";
        row.querySelector(".rk-name").textContent = r.t;
        rank.appendChild(row);
      });
    }
    function request(title) {
      var mine = store(KEY) || {};
      if (mine[title]) {
        note.textContent = t("dyn.reqDup", "이미 신청하신 곡입니다.");
        return;
      }
      mine[title] = 1;
      store(KEY, mine);
      note.textContent = "\u2018" + title + "\u2019 " + t("dyn.reqOk", "신청이 접수되었습니다. 공연 준비에 참고자료로 전달됩니다.");
      input.value = "";
      out.innerHTML = "";
      drawRank();
    }
    function search() {
      var raw = input.value.trim();
      out.innerHTML = "";
      if (!raw) { note.textContent = ""; return; }
      var isCho = /^[ㄱ-ㅎ\s]+$/.test(raw) && /[ㄱ-ㅎ]/.test(raw);
      var q = isCho ? raw.replace(/\s/g, "") : nm(raw);
      var hits = songs.filter(function (s2) {
        return isCho ? s2.c.replace(/\s/g, "").indexOf(q) >= 0
                     : (s2.n.indexOf(q) >= 0 || nm(s2.al).indexOf(q) >= 0);
      }).slice(0, 8);
      note.textContent = hits.length ? "" : t("dyn.reqNone", "찾는 곡이 없습니다. 제목 일부로 다시 찾아보세요.");
      hits.forEach(function (s2) {
        var b = el("button", "req-hit");
        b.type = "button";
        b.innerHTML = '<span class="rh-t"></span><span class="rh-m"></span><span class="rh-go">' + t("dyn.reqBtn", "신청") + "</span>";
        b.querySelector(".rh-t").textContent = s2.t;
        b.querySelector(".rh-m").textContent = [s2.al, s2.y].filter(Boolean).join(" · ");
        b.addEventListener("click", function () { request(s2.t); });
        out.appendChild(b);
      });
    }
    input.addEventListener("input", search);
    drawRank();
  }

  /* ---------- 9.5 사랑방: 인순이의 편지 + 오늘의 문안 인사 ----------
     리서치 근거: 위버스 모먼트(편지 UI)·팬카페 출석 문화·버블의 짧은 답장 구조·토스 시니어 UT
     (타이핑 대신 선택, 라벨 있는 큰 버튼, 행동마다 명확한 완료 피드백) */
  function initSarangbang() {
    /* 인순이의 편지 */
    var alBody = $("#al-body");
    if (alBody && D.artistLetter) {
      var AL = D.artistLetter;
      alBody.textContent = tr(AL, "body");
      $("#al-date").textContent = AL.date;
      $("#al-sign").textContent = tr(AL, "sign");
      /* 친필 사인 이미지가 준비되면 서명란에 실제 사인이 들어온다 */
      var sigBox = $("#al-signature");
      if (sigBox && AL.signature) {
        var im = new Image();
        im.alt = tr(AL, "sign");
        im.className = "sig-img";
        im.onload = function () { sigBox.innerHTML = ""; sigBox.appendChild(im); sigBox.hidden = false; };
        im.src = AL.signature;
      }
      var fBtn = $("#al-flower"), fN = $("#al-flower-n");
      var FKEY = "insooni_flower_letter";
      function drawFlower() {
        var mine = !!store(FKEY);
        fN.textContent = String((AL.flowers || 0) + (mine ? 1 : 0));
        fBtn.setAttribute("aria-pressed", String(mine));
      }
      fBtn.addEventListener("click", function () {
        if (store(FKEY)) { localStorage.removeItem(FKEY); } else { store(FKEY, true); }
        drawFlower();
      });
      drawFlower();
    }

    /* 오늘의 문안 인사: 출석 도장 */
    var stampBtn = $("#stamp-btn"), stampState = $("#stamp-state");
    if (stampBtn) {
      var SKEY = "insooni_stamp";
      function today() {
        var n = new Date();
        return n.getFullYear() + "-" + (n.getMonth() + 1) + "-" + n.getDate();
      }
      function yesterday() {
        var n = new Date(); n.setDate(n.getDate() - 1);
        return n.getFullYear() + "-" + (n.getMonth() + 1) + "-" + n.getDate();
      }
      /* 꾸준함을 조용히 알아봐 준다 — 순위·점수 없이 따뜻한 인사만.
         지긋한 팬층에 맞춰 경쟁이 아니라 '알아봐 드림'으로 다가간다. */
      function milestone(streak) {
        var en = document.documentElement.getAttribute("lang") === "en";
        if (streak >= 100) return en ? "  A hundred days — thank you for being here." : "  백 일째예요. 곁에 계셔 주셔서 고맙습니다.";
        if (streak >= 30) return en ? "  A whole month of visits. It means the world." : "  한 달 내내 찾아주셨네요. 큰 힘이 됩니다.";
        if (streak >= 7) return en ? "  A week straight — we noticed." : "  일주일 내내 함께해 주셨어요.";
        return "";
      }
      function drawStamp() {
        var s = store(SKEY);
        if (s && s.last === today()) {
          stampBtn.disabled = true;
          stampBtn.textContent = t("comm.stampDone", "오늘 문안 인사를 드렸습니다");
          stampState.textContent = t("dyn.streakA", "연속 ") + s.streak + t("dyn.streakB", "일째 · 지금까지 ") + s.total + t("dyn.streakC", "번 다녀가셨어요") + milestone(s.streak);
        } else {
          stampBtn.disabled = false;
          stampBtn.textContent = t("comm.stampBtn", "오늘 도장 찍기");
          stampState.textContent = s ? t("dyn.stampBack", "다시 오셨네요. 도장 한 번이면 인사 완료!") : "";
        }
      }
      stampBtn.addEventListener("click", function () {
        var s = store(SKEY) || { last: "", streak: 0, total: 0 };
        if (s.last === today()) return;
        s.streak = (s.last === yesterday()) ? s.streak + 1 : 1;
        s.total += 1; s.last = today();
        store(SKEY, s);
        drawStamp();
      });
      drawStamp();
    }

    /* 한 줄 응원: 선택형 문구 + 응원 벽 */
    var chipsBox = $("#cheer-chips"), wall = $("#cheer-wall");
    if (chipsBox && wall && D.cheerPresets) {
      var CKEY = "insooni_cheers";
      var isEN = document.documentElement.getAttribute("lang") === "en";
      var presetEN = {};
      D.cheerPresets.forEach(function (p) { if (p.en) presetEN[p.ko] = p.en; });
      function drawWall() {
        wall.innerHTML = "";
        var mine = store(CKEY) || [];
        var all = mine.concat(D.sampleCheers || []).slice(0, 7);
        all.forEach(function (c) {
          var row = el("div", "cheer-item");
          var text = isEN && presetEN[c.text] ? presetEN[c.text] : c.text;
          var who = c.name === "익명 팬" ? t("dyn.anon", "익명 팬") : c.name;
          row.innerHTML = "<span>" + esc(text) + '</span><span class="cw-who">' + esc(who) + " · " + esc(c.date) + "</span>";
          wall.appendChild(row);
        });
      }
      D.cheerPresets.forEach(function (p) {
        var b = el("button", "", isEN && p.en ? p.en : p.ko);
        b.type = "button";
        b.addEventListener("click", function () {
          var mine = store(CKEY) || [];
          var n = new Date();
          mine.unshift({ name: t("dyn.anon", "익명 팬"), text: isEN && p.en ? p.en : p.ko, date: n.getFullYear() + ". " + (n.getMonth() + 1) + ". " + n.getDate() + "." });
          store(CKEY, mine.slice(0, 20));
          drawWall();
          var prev = b.textContent;
          b.disabled = true;
          b.textContent = t("dyn.cheerOk", "남겨졌습니다!");
          setTimeout(function () { b.disabled = false; b.textContent = prev; }, 1600);
        });
        chipsBox.appendChild(b);
      });
      drawWall();
    }
  }

  /* ---------- 9.7 거위의 꿈 응원 카드 (Canvas — 가사 원문 미사용, 자체 작문 문구) ---------- */
  /* 거위 엠블럼을 캔버스에 그린다 (번호증·응원카드 공용) */
  function drawGooseEmblem(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(size / 120, size / 120);
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.save(); ctx.translate(48, 46); ctx.rotate(-7 * Math.PI / 180);
    ctx.beginPath(); ctx.ellipse(0, 0, 27, 11.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(66, 41); ctx.bezierCurveTo(78, 36, 87, 30, 94, 23); ctx.stroke();
    ctx.beginPath(); ctx.arc(96, 21, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(100, 18.5); ctx.lineTo(111, 21); ctx.lineTo(100, 24.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(45, 38); ctx.bezierCurveTo(36, 24, 34, 13, 41, 6);
    ctx.bezierCurveTo(48, 12, 55, 27, 57, 37); ctx.bezierCurveTo(53, 38.5, 49, 38.7, 45, 38); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(24, 42); ctx.lineTo(10, 37); ctx.lineTo(22, 50); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* ---------- 9.4 사랑방: 팬 번호증 ----------
     방문자를 '사랑방의 한 사람'으로 맞이하는 소장용 카드. 이름·번호·가입일이
     이 기기에만 저장되고, 다시 오면 이름으로 반긴다. 실제 회원 DB가 아니라
     간직하는 기념물임을 문구로 분명히 한다(가짜 시스템 아님). */
  function initMemberCard() {
    var canvas = $("#mc-canvas"), nameIn = $("#mc-name"), makeBtn = $("#mc-make");
    if (!canvas || !nameIn || !makeBtn) return;
    var MKEY = "insooni_member";
    var en = document.documentElement.getAttribute("lang") === "en";

    /* 이름에서 늘 같은 번호를 만든다 (안정적 해시) */
    function serial(name) {
      var h = 5381;
      for (var i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
      var base = (h % 90000 + 10000);          /* 5자리 */
      return "IS-" + base;
    }
    function fmtDate(iso) {
      var p = iso.split("-");
      return en ? (p[0] + ". " + p[1] + ". " + p[2]) : (p[0] + ". " + p[1] + ". " + p[2] + ".");
    }

    function draw(m) {
      var ctx = canvas.getContext("2d");
      var W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      /* 배경 — 웜 블랙 + 미세한 세로 그라디언트 */
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#111"); g.addColorStop(1, "#080808");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "rgba(212,175,55,.85)"; ctx.lineWidth = 3; ctx.strokeRect(40, 40, W - 80, H - 80);
      ctx.strokeStyle = "rgba(212,175,55,.26)"; ctx.lineWidth = 1; ctx.strokeRect(56, 56, W - 112, H - 112);
      var mono = "'Space Mono', monospace";
      var ko = '"Pretendard Variable", "Apple SD Gothic Neo", sans-serif';
      /* 상단 라벨 */
      ctx.textAlign = "left"; ctx.fillStyle = "rgba(212,175,55,.95)";
      ctx.font = "700 26px " + mono;
      ctx.fillText(en ? "INSOONI  ·  SARANGBANG" : "인순이 공식 팬  ·  사랑방", 96, 128);
      drawGooseEmblem(ctx, W - 220, 84, 120, "#e8d9a0");
      /* 이름 */
      ctx.fillStyle = "#f3efe7"; ctx.font = "600 78px " + ko;
      ctx.fillText(m.name, 96, 380);
      ctx.fillStyle = "rgba(243,239,231,.5)"; ctx.font = "500 26px " + ko;
      ctx.fillText(en ? "MEMBER OF THE FAN ROOM" : "사랑방의 한 사람", 98, 428);
      /* 번호 + 가입일 */
      ctx.fillStyle = "rgba(243,239,231,.9)"; ctx.font = "700 40px " + mono;
      ctx.fillText((en ? "FAN No. " : "회원번호  ") + m.serial, 96, 560);
      ctx.fillStyle = "rgba(243,239,231,.55)"; ctx.font = "500 28px " + mono;
      ctx.fillText((en ? "SINCE  " : "함께한 날  ") + fmtDate(m.since), 96, 612);
      /* 하단 서명 */
      ctx.fillStyle = "rgba(212,175,55,.9)"; ctx.font = "40px 'Nanum Pen Script', cursive";
      ctx.textAlign = "right";
      ctx.fillText(en ? "With love, Insooni" : "인순이 사랑방 드림", W - 96, H - 110);
    }

    function ready(m) {
      (document.fonts && document.fonts.ready) ? document.fonts.ready.then(function () { draw(m); }) : draw(m);
      draw(m);
      $("#mc-actions").hidden = false;
      canvas.classList.add("is-ready");
    }

    var stored = store(MKEY);
    if (stored && stored.name) {
      nameIn.value = stored.name;
      $("#mc-welcome").textContent = (en ? "Welcome back, " : "다시 오셨네요, ") + stored.name + (en ? "." : " 님.");
      ready(stored);
    }

    makeBtn.addEventListener("click", function () {
      var nm2 = (nameIn.value || "").trim();
      if (!nm2) { nameIn.focus(); return; }
      var prev = store(MKEY);
      var since = (prev && prev.name === nm2 && prev.since) ? prev.since
                : new Date().toISOString().slice(0, 10);
      var m = { name: nm2, serial: serial(nm2), since: since };
      store(MKEY, m);
      $("#mc-welcome").textContent = (en ? "Welcome to the fan room, " : "사랑방에 오신 것을 환영합니다, ") + nm2 + (en ? "." : " 님.");
      ready(m);
    });

    $("#mc-save").addEventListener("click", function () {
      canvas.toBlob(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "insooni-fan-card.png";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      }, "image/png");
    });
    $("#mc-share").addEventListener("click", function () {
      canvas.toBlob(function (blob) {
        var file = new File([blob], "insooni-fan-card.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: t("mc.t", "사랑방 팬 번호증") }).catch(function () {});
        } else { $("#mc-save").click(); }
      }, "image/png");
    });
  }

  function initCheerCard() {
    var canvas = $("#cc-canvas");
    if (!canvas) return;
    var SITS = [
      { key: "dream", ko: "꿈을 향해 가는 분께", en: "Chasing a dream" },
      { key: "start", ko: "새 출발 하는 분께", en: "A fresh start" },
      { key: "heal", ko: "회복 중인 분께", en: "On the mend" },
      { key: "tired", ko: "오늘 지친 분께", en: "A long day" },
      { key: "birth", ko: "생일 맞은 분께", en: "A birthday" }
    ];
    var PHRASES = {
      dream: [
        "남들이 늦었다 말해도, 당신의 계절은 지금 오고 있어요.",
        "벽 앞에 선 오늘도, 날개는 조용히 자라고 있습니다.",
        "그 꿈, 혼자 꾸게 두지 않을게요. 우리가 곁에서 부를게요.",
        "높이 나는 날보다, 포기하지 않은 오늘이 더 빛납니다."
      ],
      start: [
        "처음이라 떨리는 그 길, 첫걸음이 이미 절반입니다.",
        "새 문 앞에 선 당신에게, 바람이 등을 밀어주기를.",
        "어제의 용기가 오늘의 시작을 만들었어요. 잘하고 있어요."
      ],
      heal: [
        "서두르지 않아도 괜찮아요. 쉬어 가는 것도 나는 법이니까.",
        "비 온 뒤 하늘이 맑게 개듯, 좋은 날이 오고 있습니다.",
        "오늘 하루를 버틴 당신이, 이미 충분히 강한 사람입니다."
      ],
      tired: [
        "오늘 하루, 정말 수고 많았어요. 내일은 조금 더 가벼울 거예요.",
        "지친 어깨 위에도 별은 뜹니다. 푹 쉬어요, 우리.",
        "잠시 멈춰도 꿈은 어디 가지 않아요. 오늘은 쉬어 가요."
      ],
      birth: [
        "태어나 줘서 고마워요. 당신의 새해가 노래처럼 흐르기를.",
        "오늘만큼은 주인공! 촛불보다 환하게 웃는 하루 되세요.",
        "한 살의 무게만큼 더 단단해진 당신을 축하합니다."
      ]
    };
    var state = { sit: "dream", name: "", phrase: null };
    var chipsBox = $("#cc-situations");
    var isEN = document.documentElement.getAttribute("lang") === "en";
    SITS.forEach(function (s2, i) {
      var b = el("button", i === 0 ? "is-on" : "", isEN ? s2.en : s2.ko);
      b.type = "button";
      b.addEventListener("click", function () {
        chipsBox.querySelectorAll(".is-on").forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        state.sit = s2.key;
      });
      chipsBox.appendChild(b);
    });
    function pickPhrase() {
      var pool = PHRASES[state.sit];
      var next = pool[Math.floor(Math.random() * pool.length)];
      if (pool.length > 1) { while (next === state.phrase) { next = pool[Math.floor(Math.random() * pool.length)]; } }
      return next;
    }
    function wrapText(ctx, text, maxW) {
      var words = text.split(" "), lines = [], line = "";
      words.forEach(function (w) {
        var trial = line ? line + " " + w : w;
        if (ctx.measureText(trial).width > maxW && line) { lines.push(line); line = w; }
        else { line = trial; }
      });
      if (line) lines.push(line);
      return lines;
    }
    function drawGoose(ctx, x, y, w, color) {
      var sc = w / 120;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      ctx.fillStyle = color; ctx.strokeStyle = color;
      ctx.save(); ctx.translate(48, 46); ctx.rotate(-7 * Math.PI / 180);
      ctx.beginPath(); ctx.ellipse(0, 0, 27, 11.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.lineWidth = 8; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(66, 41); ctx.bezierCurveTo(78, 36, 87, 30, 94, 23); ctx.stroke();
      ctx.beginPath(); ctx.arc(96, 21, 5.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(100, 18.5); ctx.lineTo(111, 21); ctx.lineTo(100, 24.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(45, 38); ctx.bezierCurveTo(36, 24, 34, 13, 41, 6);
      ctx.bezierCurveTo(48, 12, 55, 27, 57, 37); ctx.bezierCurveTo(53, 38.5, 49, 38.7, 45, 38); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(24, 42); ctx.lineTo(10, 37); ctx.lineTo(22, 50); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    function draw() {
      var ctx = canvas.getContext("2d");
      var W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, W, H);
      /* 금색 이중 프레임 */
      ctx.strokeStyle = "rgba(212,175,55,.85)"; ctx.lineWidth = 3;
      ctx.strokeRect(46, 46, W - 92, H - 92);
      ctx.strokeStyle = "rgba(212,175,55,.28)"; ctx.lineWidth = 1;
      ctx.strokeRect(64, 64, W - 128, H - 128);
      drawGoose(ctx, W / 2 - 90, 150, 180, "#e8d9a0");
      var koFont = '"Pretendard Variable", "Apple SD Gothic Neo", sans-serif';
      /* 받는 분 */
      ctx.textAlign = "center"; ctx.fillStyle = "#f3efe7";
      if (state.name) {
        ctx.font = "600 52px " + koFont;
        ctx.fillText(state.name + (isEN ? "" : " 님께"), W / 2, 380);
      }
      /* 응원 문구 */
      ctx.font = "500 58px " + koFont;
      var lines = wrapText(ctx, state.phrase, W - 260);
      var y = 560;
      lines.forEach(function (ln) { ctx.fillText(ln, W / 2, y); y += 92; });
      /* 하단 서명 */
      ctx.fillStyle = "rgba(212,175,55,.95)";
      ctx.font = "44px 'Nanum Pen Script', cursive";
      ctx.fillText(t("cc.sign", "거위의 꿈을 아는, 인순이 사랑방 드림"), W / 2, H - 210);
      ctx.fillStyle = "rgba(243,239,231,.45)";
      ctx.font = "600 24px " + koFont;
      ctx.fillText("I N S O O N I · O F F I C I A L · F A N · P L A T F O R M", W / 2, H - 130);
    }
    function make() {
      state.name = ($("#cc-name").value || "").trim();
      state.phrase = pickPhrase();
      document.fonts && document.fonts.ready
        ? document.fonts.ready.then(draw)
        : draw();
      draw();
      $("#cc-actions").hidden = false;
      canvas.classList.add("is-ready");
    }
    $("#cc-make").addEventListener("click", make);
    $("#cc-again").addEventListener("click", make);
    $("#cc-save").addEventListener("click", function () {
      canvas.toBlob(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "insooni-cheer-card.png";
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      }, "image/png");
    });
    $("#cc-share").addEventListener("click", function () {
      canvas.toBlob(function (blob) {
        var file = new File([blob], "insooni-cheer-card.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: t("cc.t", "거위의 꿈 응원 카드") }).catch(function () {});
        } else {
          $("#cc-save").click();
        }
      }, "image/png");
    });
  }

  /* ---------- 9.8 인순이가 답합니다: 질문 보내기 → 팬레터 폼 '질문' 분류 선택 ---------- */
  function initQna() {
    var ask = $("#qna-ask");
    if (!ask) return;
    ask.addEventListener("click", function () {
      var sel = $("#letter-cat");
      if (sel) sel.value = "질문";
      var body = $("#letter-body");
      if (body) setTimeout(function () { body.focus(); }, 400);
    });
  }

  /* ---------- 9.9 스크롤 리빌 (시네마틱 등장) ---------- */
  function initRise() {
    if (!("IntersectionObserver" in window)) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var targets = $all("main .section > .container, main .section-head, .letter-corner, .qna-item");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    targets.forEach(function (el2) { el2.classList.add("rise"); io.observe(el2); });
    /* 안전망: 관측기가 어떤 이유로든 못 돌면 콘텐츠가 영영 안 보이므로 강제 노출 */
    setTimeout(function () { targets.forEach(function (el2) { el2.classList.add("in"); }); }, 4000);
  }

  /* ---------- 10. 구독 폼 (데모) ---------- */
  function initSubscribe() {
    $all(".subscribe form").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = form.querySelector("input[type=email]");
        var msg = form.parentElement.querySelector(".subscribe-ok");
        if (msg) { msg.hidden = false; setTimeout(function () { msg.hidden = true; }, 4000); }
        form.reset();
        if (input) input.blur();
      });
    });
  }

  /* ---------- 11. 관리자 대시보드 (데모) ---------- */
  function initAdmin() {
    if (!$("#admin-root")) return;
    var letters = (store("insooni_letters") || []).length;
    var posts = (store("insooni_posts") || []).length;
    var elLetters = $("#stat-letters"), elPosts = $("#stat-posts");
    if (elLetters) elLetters.textContent = String(1284 + letters);
    if (elPosts) elPosts.textContent = String(3492 + posts);
    function decPending() {
      var b = $("#pending-badge");
      if (!b) return;
      var n = Math.max(0, (parseInt(b.textContent, 10) || 0) - 1);
      b.textContent = n + "건";
      if (n === 0) { b.className = "badge badge--ok"; b.textContent = "완료"; }
    }
    function resolveRow(btn, cls, rowLabel, doneLabel) {
      var row = btn.closest("tr");
      row.querySelector(".badge").outerHTML = '<span class="badge ' + cls + '">' + rowLabel + "</span>";
      var td = btn.closest("td");
      td.innerHTML = '<span class="badge ' + cls + '" tabindex="-1">' + doneLabel + "</span>";
      td.firstChild.focus();
      decPending();
    }
    $all("[data-approve]").forEach(function (btn) {
      btn.addEventListener("click", function () { resolveRow(btn, "badge--ok", "게시 승인", "처리 완료"); });
    });
    $all("[data-reject]").forEach(function (btn) {
      btn.addEventListener("click", function () { resolveRow(btn, "badge--danger", "숨김 처리", "처리 완료"); });
    });
  }

  /* ---------- 언어 전환 (한/영) ----------
     번역은 문서마다 한 번이 아니라 **화면이 바뀔 때마다** 다시 걸어야 한다.
     라우터가 <main>만 갈아끼우기 때문에, 새로 들어온 마크업은 아직 한국어다.
     그래서 적용부(applyLang)를 따로 떼어 pageInit에서 매번 부른다. */
  function applyLang(lang) {
    var dict = window.I18N_EN || {};
    var btn = $(".lang-toggle");
    {
      document.documentElement.setAttribute("lang", lang);
      if (btn) {
        btn.textContent = lang === "ko" ? "EN" : "한국어";
        /* 영어로 보고 있는 사람에게는 설명도 영어여야 한다 */
        btn.setAttribute("aria-label", lang === "ko" ? "Switch to English" : "Switch to Korean");
      }
      $all("[data-i18n]").forEach(function (n) {
        var key = n.getAttribute("data-i18n");
        if (lang === "en") {
          if (n.dataset.ko === undefined) n.dataset.ko = n.innerHTML;
          if (dict[key]) n.innerHTML = dict[key];
        } else if (n.dataset.ko !== undefined) {
          n.innerHTML = n.dataset.ko;
        }
      });
      $all("[data-i18n-aria]").forEach(function (n) {
        var key = n.getAttribute("data-i18n-aria");
        if (lang === "en") {
          if (n.dataset.koAria === undefined) n.dataset.koAria = n.getAttribute("aria-label") || "";
          if (dict[key]) n.setAttribute("aria-label", dict[key]);
        } else if (n.dataset.koAria !== undefined) {
          n.setAttribute("aria-label", n.dataset.koAria);
        }
      });
      /* 원래 한국어인 것들 — 곡명·공식 영상 제목·팬이 쓴 글.
         번역하지 않고 한국어임을 표시만 해, 화면 낭독기가 올바른 발음으로 읽게 한다. */
      var koIds = ["home-news", "home-schedule", "home-videos", "news-list", "event-list", "cal-grid",
                   "disco-index", "discography", "videos", "letter-list", "board-list", "poll",
                   "fresh-videos", "cheer-wall", "req-rank"];
      koIds.forEach(function (id) {
        var n = document.getElementById(id);
        if (!n) return;
        if (lang === "en") n.setAttribute("lang", "ko");
        else n.removeAttribute("lang");
      });
      $all("[data-i18n-ph]").forEach(function (n) {
        var key = n.getAttribute("data-i18n-ph");
        if (lang === "en") {
          if (n.dataset.koPh === undefined) n.dataset.koPh = n.placeholder;
          if (dict[key]) n.placeholder = dict[key];
        } else if (n.dataset.koPh !== undefined) {
          n.placeholder = n.dataset.koPh;
        }
      });
      /* 사진 설명(alt)도 언어를 따른다.
         화면에는 안 보이지만 화면 낭독기를 쓰는 분에게는 이게 사진의 전부다. */
      $all("[data-i18n-alt]").forEach(function (n) {
        var key = n.getAttribute("data-i18n-alt");
        if (lang === "en") {
          if (n.dataset.koAlt === undefined) n.dataset.koAlt = n.getAttribute("alt") || "";
          if (dict[key]) n.setAttribute("alt", dict[key]);
        } else if (n.dataset.koAlt !== undefined) {
          n.setAttribute("alt", n.dataset.koAlt);
        }
      });
      /* 탭 제목도 언어를 따른다. 라우터가 새 문서의 한국어 제목을 걸어 두므로 여기서 덮는다. */
      var page = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
      if (lang === "en" && dict["title." + page]) document.title = dict["title." + page];
      store("insooni_lang", lang);
    }
  }

  /* 지금 걸려 있는 언어 — 저장값이 정본이다 */
  function curLang() { return store("insooni_lang") === "en" ? "en" : "ko"; }

  /* 토글 버튼은 헤더에 있어 라우터가 갈아끼우지 않는다. 한 번만 묶는다. */
  function initLang() {
    var btn = $(".lang-toggle");
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", function () {
      applyLang(curLang() === "ko" ? "en" : "ko");
      /* 데이터 렌더 콘텐츠까지 완전 전환: 저장 후 재로드 */
      location.reload();
    });
    applyLang(curLang());
  }

  /* ---------- 비디오 히어로: 네이티브 루프 (모션 민감 시 제거) ---------- */
  function initVhero() {
    var v = $(".vhero-video");
    if (!v) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.remove();
      var pb = $(".strip-pause");
      if (pb) pb.remove();
      return;
    }
    /* 화질과 데이터 사이의 균형. 소스를 HTML에 박아 두면 preload가 큰 파일을
       먼저 받아 버리므로, 여기서 화면·연결을 보고 골라 넣는다.
       큰 화면·좋은 연결은 1080p, 작은 화면이나 데이터 절약 모드는 720p 경량본. */
    (function pickSource() {
      var src = v.querySelector("source");
      if (!src || v.dataset.picked || !src.getAttribute("data-src")) return;
      v.dataset.picked = "1";
      var conn = navigator.connection || {};
      var small = window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
      var saver = conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType || "");
      var lite = src.getAttribute("data-lite");
      src.setAttribute("src", (lite && (small || saver)) ? lite : src.getAttribute("data-src"));
      v.load();
    })();
    /* 실제 프레임이 흐르기 시작하면 포스터 위로 영상이 피어난다 */
    var stage = v.closest(".strip-item--video") || v.parentNode;
    v.addEventListener("playing", function () { if (stage) stage.classList.add("is-playing"); });
    function tryPlay() {
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* 자동재생 차단 시 포스터 유지 */ });
    }
    tryPlay();
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && v.paused && v.dataset.userPaused !== "1") tryPlay();
    });
    document.addEventListener("pointerdown", function once() {
      document.removeEventListener("pointerdown", once);
      if (v.paused) tryPlay();
    });
  }

  /* ---------- 스포트라이트 ---------- */

  /* ---------- 뮤직 에라 (대표 릴리즈 가로 갤러리) ---------- */

  /* ---------- 라이트박스 범용 바인더 ---------- */
  function initVideoButtons() {
    $all("[data-lightbox-video]").forEach(function (b) {
      b.addEventListener("click", function () {
        openLightbox(b.getAttribute("data-lightbox-video"), b.getAttribute("data-video-title") || "영상", b);
      });
    });
  }

  /* ---------- 홈 입장 로더: 사진이 층층이 벗겨지는 액션 (세션당 1회) ---------- */
  function initLoader() {
    var box = $("#loader");
    if (!box) return;
    /* 비욘세 문법: 입장 액션은 매 진입마다 재생 (모션 민감 시에만 스킵) */
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { box.remove(); return; }
    var frames = $all("img", box);
    var i = 0;
    var started = false;
    function start() {
      if (started) return;
      started = true;
      run();
    }
    var cap = setTimeout(start, 900);
    Promise.all(frames.map(function (im) {
      return im.decode ? im.decode().catch(function () {}) : Promise.resolve();
    })).then(function () { clearTimeout(cap); start(); });
    function run() {
    var iv = setInterval(function () {
      if (i < frames.length) {
        /* 마지막 장까지 전부 벗겨 검은 화면과 거위를 드러낸다 */
        frames[i].classList.add("gone"); i++;
      } else {
        clearInterval(iv);
        /* 피날레: 거위가 날갯짓하며 잠시 머문 뒤 화면이 사방으로 갈라지며 열린다 */
        setTimeout(function () { box.classList.add("split"); }, 620);
        setTimeout(function () { if (box.parentNode) box.remove(); }, 1800);
      }
    }, 265);
    }
  }

  /* ---------- 홈 무한 가로 필름스트립 (드래그·휠·키보드, 이음매 없는 루프) ---------- */
  function initStrip() {
    var strip = $("#strip"), track = $("#strip-track");
    if (!strip || !track) return;
    /* 복제분으로 무한 루프 구성 (복제는 보조기기에서 숨김) */
    var originals = $all(".strip-item", track);
    originals.forEach(function (item) {
      var c = item.cloneNode(true);
      c.setAttribute("aria-hidden", "true");
      c.setAttribute("tabindex", "-1");
      if (c.tagName === "A") c.removeAttribute("href");
      var v = c.querySelector("video");
      if (v) v.remove(); /* 복제 영상은 정지 이미지(포스터)로 대체 */
      track.appendChild(c);
    });
    var pos = 0, vel = 0, dragging = false, lastX = 0, moved = 0, half = 0, raf = null;
    function measure() { half = track.scrollWidth / 2; }
    function apply() {
      if (half > 1) pos = ((pos % half) + half) % half;
      track.style.transform = "translate3d(" + (-pos) + "px,0,0)";
    }
    function tick() {
      raf = null;
      if (!dragging && Math.abs(vel) > 0.08) {
        pos += vel; vel *= 0.94; apply();
        raf = requestAnimationFrame(tick);
      }
    }
    function glide() { if (!raf) raf = requestAnimationFrame(tick); }
    function remeasure() { measure(); apply(); }
    measure();
    window.addEventListener("resize", remeasure);
    $all("img", track).forEach(function (im) {
      if (!im.complete) im.addEventListener("load", remeasure, { once: true });
    });
    /* 포커스 자동 스크롤 흡수: overflow hidden 컨테이너의 scrollLeft를 transform pos로 이관 */
    strip.addEventListener("scroll", function () {
      if (strip.scrollLeft) { pos += strip.scrollLeft; strip.scrollLeft = 0; apply(); }
    });
    /* 키보드 포커스 항목을 화면 중앙으로 */
    track.addEventListener("focusin", function (e) {
      var item = e.target.closest(".strip-item");
      if (!item) return;
      var target = item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2;
      pos = target; vel = 0; apply();
    });
    strip.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      dragging = true; moved = 0; lastX = e.clientX; vel = 0;
      strip.classList.add("dragging");
    });
    strip.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX; lastX = e.clientX;
      moved += Math.abs(dx);
      /* 실제 드래그로 판정된 순간에만 캡처 — 단순 클릭은 자식 링크에 정상 전달 */
      if (moved > 8 && !strip.hasPointerCapture(e.pointerId)) {
        try { strip.setPointerCapture(e.pointerId); } catch (err) {}
      }
      pos -= dx; vel = -dx;
      apply();
    });
    function release() {
      if (!dragging) return;
      dragging = false; strip.classList.remove("dragging"); glide();
      setTimeout(function () { moved = 0; }, 0);
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    /* 드래그였다면 클릭 취소 */
    track.addEventListener("click", function (e) {
      if (moved > 8 && e.detail > 0) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    strip.addEventListener("wheel", function (e) {
      e.preventDefault();
      pos += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      vel = 0; apply();
    }, { passive: false });
    strip.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); vel = 34; glide(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); vel = -34; glide(); }
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { vel = 0; }
    });
    var pauseBtn = $(".strip-pause"), bgv = $(".vhero-video", track);
    var allVids = $all(".strip-item video", track);
    if (pauseBtn && bgv) {
      pauseBtn.addEventListener("click", function () {
        var paused = bgv.paused;
        if (paused) { delete bgv.dataset.userPaused; allVids.forEach(function (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }); }
        else { bgv.dataset.userPaused = "1"; allVids.forEach(function (v) { v.pause(); }); }
        pauseBtn.setAttribute("aria-pressed", String(!paused));
        pauseBtn.setAttribute("aria-label", !paused ? t("aria.playVideo", "배경 영상 재생") : t("aria.pauseVideo", "배경 영상 일시정지"));
        pauseBtn.querySelector("span").textContent = !paused ? "▶" : "⏸";
      });
    } else if (pauseBtn) {
      pauseBtn.remove();
    }
    apply();
  }

  /* ---------- 입장 인트로 (세션당 1회) ---------- */
  function initIntro() {
    var intro = $("#intro");
    if (!intro) return;
    var seen = false;
    try { seen = sessionStorage.getItem("insooni_intro") === "1"; } catch (e) {}
    if (seen || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      intro.remove();
      return;
    }
    try { sessionStorage.setItem("insooni_intro", "1"); } catch (e) {}
    setTimeout(function () { intro.remove(); }, 2600);
  }

  /* ---------- 가로 갤러리: 드래그 + 화살표 + 진행선 ---------- */

  /* ---------- 히어로 우측 사진 슬라이더 (옆으로 흐르는 무한 루프) ---------- */

  /* ---------- 부팅 ----------
     라우터가 <main>을 갈아끼울 때마다 pageInit()만 다시 돈다.
     헤더·전역 리스너에 붙는 것들은 최초 1회만 실행한다. */
  var GLOBAL_DONE = false;

  /* 상단 진행선: 문서를 얼마나 읽었는지 얇은 금선으로 보여 준다.
     고급 사이트의 절제된 신호 — 헤더에 한 번만 붙이고 스크롤에 맞춰 채운다. */
  function initScrollProgress() {
    if (document.getElementById("scroll-progress")) return;
    var bar = el("div", "");
    bar.id = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    var ticking = false;
    function paint() {
      ticking = false;
      var h = document.documentElement;
      var max = (h.scrollHeight - h.clientHeight) || 1;
      var p = Math.min(1, Math.max(0, (h.scrollTop || window.pageYOffset) / max));
      bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
    }, { passive: true });
    paint();
  }

  function globalInit() {
    if (GLOBAL_DONE) return;
    GLOBAL_DONE = true;
    initLang();
    initNav();
    initScrollState();
    initScrollProgress();
    initLoader();
    initIntro();
  }

  /* 렌더러 하나가 예외를 던져도 나머지가 멈추지 않게 각각 격리해 실행한다.
     (한 함수의 오류가 페이지 전체를 비우던 사고를 막는다) */
  function safe(fn) {
    try { fn(); } catch (e) { if (window.console) console.error("[pageInit]", e); }
  }
  function pageInit() {
    [renderEventList, initStrip, initVhero, renderArchive, renderPastRecaps,
     initFreshVideos, initVideoButtons, initReveal, renderNewsPage, renderCalendar,
     renderTimeline, renderAnniversary, renderDiscography, initLetters, initBoard,
     initPoll, initSarangbang, initMemberCard, initCheerCard, initQna, initRise,
     initSubscribe, initAdmin].forEach(safe);
    /* 마지막에 번역을 건다 — 위 렌더러들이 만들어 낸 요소까지 함께 잡기 위해서.
       라우터로 페이지를 옮겨도 새 <main>이 영어로 칠해진다. */
    applyLang(curLang());
    /* 자동 수집 예정 공연(플레이DB 일일 수집) 병합 — 도착 시 일정 재렌더 */
    if (!window.__eventsMerged) {
      window.__eventsMerged = true;
      fetch("assets/data/live-events.json?" + Date.now())
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.items || !d.items.length) return;
          var have = {};
          (D.events || []).forEach(function (ev) { have[(ev.date || "") + (ev.title || "")] = 1; });
          var added = 0;
          d.items.forEach(function (it) {
            if (have[it.start + it.title]) return;
            D.events.push({
              date: it.start, kind: "공연", status: "onsale", verified: false,
              title: it.title, place: it.place,
              note: t("dyn.autoSrc", "자동 수집") + " · " + it.src,
              link: it.url
            });
            added++;
          });
          if (added) renderEventList();
        })
        .catch(function () {});
    }
  }

  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(pageInit);

  function boot() { globalInit(); pageInit(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
