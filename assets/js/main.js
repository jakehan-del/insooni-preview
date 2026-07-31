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

    /* 열고 닫는 길이 세 군데(버튼·ESC·바깥 클릭)로 흩어져 있으면
       한 곳을 고칠 때 나머지를 빠뜨린다. 한 곳으로 모은다. */
    function setOpen(open) {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? t("aria.menuClose", "메뉴 닫기") : t("aria.menuOpen", "메뉴 열기"));
      /* 메뉴가 화면을 덮은 동안 뒤 내용이 따라 움직이면, 닫았을 때 엉뚱한 곳에 와 있다.
         스크롤 위치를 붙잡아 두고 닫을 때 그대로 돌려놓는다. */
      if (open) {
        document.body.dataset.scrollY = String(window.scrollY);
        document.body.classList.add("nav-open");
      } else if (document.body.classList.contains("nav-open")) {
        document.body.classList.remove("nav-open");
        var y = parseInt(document.body.dataset.scrollY || "0", 10);
        delete document.body.dataset.scrollY;
        window.scrollTo(0, y);
      }
    }

    toggle.addEventListener("click", function () {
      setOpen(!nav.classList.contains("open"));
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        setOpen(false);
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
        setOpen(false);
      }
    });
    /* 메뉴에서 다른 페이지로 넘어갈 때도 잠금을 반드시 푼다 */
    nav.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("a[href]")) setOpen(false);
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
    /* 자동 수집 기사는 사이트를 떠나지 않고 이 안에서 펼쳐 본다(버튼 → 리더 패널).
       큐레이션 소식은 기존 그대로. */
    var isAuto = item.auto && item.url;
    var a = el(isAuto ? "button" : (asLink ? "a" : "article"), "news-item" + (isAuto ? " news-item--auto" : ""));
    if (isAuto) {
      a.type = "button";
      a.setAttribute("aria-haspopup", "dialog");
      a.addEventListener("click", function () { openNewsReader(item, a); });
    } else if (asLink) a.href = "news.html";
    var body = "<div><h3>" + esc(tr(item, "title")) + "</h3>";
    if (isAuto) {
      body += '<p class="excerpt news-src">' + esc(t("dyn.newsAuto", "자동 수집 소식")) +
        (item.source ? " · " + esc(item.source) : "") + "</p>";
    } else {
      body += '<p class="excerpt">' + esc(tr(item, "excerpt")) + "</p>";
    }
    body += "</div>";
    a.innerHTML =
      "<time datetime=\"" + esc(item.date) + '">' + fmtDate(item.date) + "</time>" +
      '<span class="badge badge--' + (item.type === "공지" ? "gold" : "wine") + '">' + esc(kindLabel(item.type)) + "</span>" +
      body;
    return a;
  }

  /* ---------- 소식 리더 (사이트 안에서 보기) ----------
     기사를 누르면 밖으로 나가지 않고 이 패널이 열린다. 팬이 사이트에 머문 채
     제목·매체·날짜를 확인하고, 전문을 읽고 싶을 때만 원문으로 나간다.
     기사 본문은 언론사의 저작물이라 이곳에 옮겨 싣지 않는다. */
  var newsEl = null, newsOpener = null;
  function ensureNewsReader() {
    if (newsEl) return newsEl;
    newsEl = el("div", "news-reader");
    newsEl.setAttribute("role", "dialog");
    newsEl.setAttribute("aria-modal", "true");
    newsEl.hidden = true;
    newsEl.innerHTML =
      '<button type="button" class="lightbox-close nr-close" aria-label="닫기" data-i18n-aria="aria.close">×</button>' +
      '<article class="nr-card"><div class="nr-body"></div></article>';
    document.body.appendChild(newsEl);
    function close() {
      newsEl.hidden = true;
      document.body.style.overflow = "";
      if (newsOpener) { newsOpener.focus(); newsOpener = null; }
    }
    $(".nr-close", newsEl).addEventListener("click", close);
    newsEl.addEventListener("click", function (e) { if (e.target === newsEl) close(); });
    document.addEventListener("keydown", function (e) {
      if (!newsEl.hidden && e.key === "Escape") close();
    });
    applyLang(curLang());
    return newsEl;
  }
  function openNewsReader(item, opener) {
    var box = ensureNewsReader();
    newsOpener = opener || null;
    var outlet = item.source || "";
    box.setAttribute("aria-label", tr(item, "title"));
    $(".nr-body", box).innerHTML =
      '<span class="nr-kicker">' + esc(kindLabel(item.type)) + " · " + esc(fmtDate(item.date)) + "</span>" +
      "<h2>" + esc(tr(item, "title")) + "</h2>" +
      (outlet ? '<p class="nr-outlet">' + esc(t("dyn.newsBy", "보도")) + " · " + esc(outlet) + "</p>" : "") +
      '<p class="nr-note">' + esc(t("dyn.newsNote",
        "기사 전문은 해당 언론사에 저작권이 있어 이곳에 옮겨 싣지 않습니다. 아래에서 원문을 확인하실 수 있습니다.")) + "</p>" +
      '<p class="nr-actions"><a class="btn btn--gold btn--sm" href="' + esc(item.url) + '" target="_blank" rel="noopener">' +
        esc(t("dyn.newsOpen", "원문 보기")) + ' <span aria-hidden="true">↗</span></a></p>';
    box.hidden = false;
    document.body.style.overflow = "hidden";
    $(".nr-close", box).focus();
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
     검증된 연대기에서 '오늘 날짜에 실제로 있었던 일'만 'N년 전 오늘'로 비춘다.
     미래를 예측해 카운트다운하지 않는다 — 확정되지 않은 일정을 앞당겨 보여주지 않기 위해서.
     오늘이 아무 기념일도 아니면 배너 자체를 숨긴다. 모든 날짜는 앨범 크레딧·보도로 확인된 것. */
  function renderAnniversary() {
    var sec = $("#anniv"), card = $("#anniv-card");
    if (!sec || !card || !D.milestones || !D.milestones.length) return;
    sec.hidden = true;
    var isEN = document.documentElement.getAttribute("lang") === "en";
    var pick = function (o) { return (isEN && o.en) ? o.en : o.ko; };
    var now = new Date();
    var todayKey = String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    var todays = D.milestones.filter(function (m) { return m.d === todayKey; });
    if (!todays.length) return;                       /* 오늘이 기념일이 아니면 아무것도 안 보인다 */
    todays.sort(function (a, b) { return a.y - b.y; });
    var m = todays[0];
    var years = now.getFullYear() - m.y;
    var head = isEN ? (years + " year" + (years === 1 ? "" : "s") + " ago today")
                    : (years + "년 전 오늘");
    card.innerHTML =
      '<span class="anniv-kicker">' + esc(isEN ? "ON THIS DAY" : "오늘의 기념일") + "</span>" +
      '<p class="anniv-head">' + esc(head) + "</p>" +
      '<p class="anniv-body">' + esc(pick(m)) + "</p>";
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
        "<div><h3 class=\"a-sub\">" + t("rel.tracks", "수록곡") + "</h3>" + tracksHtml + "</div>" +
        "<div><h3 class=\"a-sub\">" + t("rel.credits", "크레딧") + "</h3>" + creditsHtml + "</div>" +
        "<div><h3 class=\"a-sub\">" + t("rel.listen", "감상") + "</h3>" + linksHtml + "</div>";
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
          html += '<button type="button" class="recap-clip' + (ci === 0 ? " is-on" : "") + '" aria-pressed="' + (ci === 0) + '" data-cid="' + esc(cl.id) + '" data-ct="' + esc(tr(cl, "title")) + '">' + esc(tr(cl, "title")) + "</button>";
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
          inner.querySelectorAll(".recap-clip.is-on").forEach(function (x) { x.classList.remove("is-on"); x.setAttribute("aria-pressed", "false"); });
          b.classList.add("is-on");
          b.setAttribute("aria-pressed", "true");
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

  /* ---------- 6.5 백엔드 연결 상태 ----------
     키가 채워져 있으면 서버로 보내고, 없으면 지금까지의 '이 기기에만 저장'을 쓴다.
     둘 사이를 오갈 때 문구가 사실과 어긋나지 않게, 판단을 한 곳에서만 한다. */
  function BE() {
    return (window.INSOONI_BACKEND && window.INSOONI_BACKEND.isReady())
      ? window.INSOONI_BACKEND : null;
  }
  /* 서버가 거절/실패한 이유를 사람 말로 옮긴다. 성공으로 둘러대지 않는다. */
  function beWhy(res) {
    var r = res && res.reason;
    if (r === "rate_limited") return t("be.rate", "잠시 뒤에 다시 보내 주세요. 짧은 시간에 너무 많이 보냈습니다.");
    if (r === "too_long")     return t("be.long", "글이 너무 깁니다. 조금 줄여 주세요.");
    if (r === "empty")        return t("be.empty", "내용을 입력해 주세요.");
    if (r === "bad_email")    return t("be.email", "이메일 주소를 다시 확인해 주세요.");
    if (r === "timeout" || r === "network")
      return t("be.net", "지금 보내지 못했습니다. 연결을 확인하고 다시 시도해 주세요.");
    return t("be.fail", "지금 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }
  /* 서버에서 받은 날짜를 화면용으로 */
  function beDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + ". " + (d.getMonth() + 1) + ". " + d.getDate() + ".";
  }

  /* ---------- 6.8 이 노래, 아시죠 ----------
     사랑방의 첫 문. 정답을 고르는 것이 아니라 '언제 알아보셨는지'만 잰다.
     틀릴 수가 없으므로 누구도 머뭇거리지 않는다.

     지키는 것
       · 화면에 큰 버튼이 언제나 하나만 보인다
       · 점수·순위·평균을 만들지 않는다. 남기는 기록도 없다
       · 곡 정보(제목·앨범·연도)는 previews.json에서만 가져온다.
         이 연도는 정규 1~18집 자료와 대조해 96곡 전부 일치를 확인했다

  /* ---------- 6.9 꿈의 비행 ----------
     한 손으로 하는 게임. 누르면 오르고 놓으면 활공한다.

     기러기·거위가 V자로 나는 이유는 앞선 새가 만든 상승기류(upwash) 덕분에
     뒤에 선 새의 힘이 11~20% 덜 들기 때문이다. 그리고 맨 앞이 가장 힘들어서
     선두는 돌아가며 선다. 이 사실 하나를 그대로 조작으로 옮겼다.

       · 앞서 나는 거위의 '비스듬히 뒤'에 고도를 맞춰 들어가면 몸이 가벼워진다
       · 그 자리를 잠깐 지키면 그 거위가 품은 꿈이 열린다
       · 끝나면 이번엔 내가 앞에 선다 — 내 꿈을 한 줄 남기면 다음 사람이 그 뒤에 붙는다

     지키는 것
       · 죽지 않는다. 부딪히는 것이 없고 물에 닿아도 튕겨 오른다
       · 점수·순위·기록을 만들지 않는다. '몇 개를 따라 날았는지'만 센다
       · 못해도 된다 — '지켜보기'를 누르면 저절로 난다
       · 하늘에 처음부터 떠 있는 금빛은 인순이의 실제 연혁이다(data.js timeline).
         팬이 남긴 꿈은 흰빛. 검수를 통과한 것만 올라온다
       · 가사는 한 줄도 쓰지 않는다 (저작권)
       · 꿈 글자는 캔버스가 아니라 HTML로 띄운다 — 읽고 번역하고 낭독할 수 있게 */
  function initFlight() {
    var stage = $("#flight");
    if (!stage) return;
    var canvas = $("#fl-canvas");
    if (!canvas || !canvas.getContext) return;

    var ctx = canvas.getContext("2d");
    var elIntro = $("#fl-intro"), elHud = $("#fl-hud"), elEnd = $("#fl-end");
    var elCaption = $("#fl-caption"), elCount = $("#fl-count"), elLog = $("#fl-log");
    var btnFly = $("#fl-start"), btnWatch = $("#fl-watch"), btnLand = $("#fl-land");
    var btnAgain = $("#fl-again");
    var msg = $("#fl-msg");

    var en = function () { return document.documentElement.getAttribute("lang") === "en"; };

    /* ---- 하늘에 띄울 것 모으기 ---- */
    /* 금빛 = 검증된 연혁. 흰빛 = 검수를 통과한 팬의 꿈. */
    function herLights() {
      var tl = (D && D.timeline) || [];
      return tl.map(function (r) {
        var ev = en() && r.en && r.en.event ? r.en.event : r.event;
        return { kind: "her", label: r.year, text: ev };
      });
    }
    var lights = [];          /* 이번 비행에 등장할 빛 */
    var dreamsLoaded = false;

    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), t2 = a[i]; a[i] = a[j]; a[j] = t2;
      }
      return a;
    }

    function buildLights(dreams) {
      var her = herLights();
      var fan = (dreams || []).map(function (d) {
        return { kind: "fan", label: d.name ? String(d.name) : t("fl.someone", "어느 팬"), text: d.body };
      });
      /* 그의 연혁이 앞에 서고, 팬들의 꿈이 그 사이사이에 붙는다.
         팬 꿈이 아직 없으면 하늘은 그의 발자취만으로도 가득 찬다. */
      shuffle(fan);
      var out = [], hi = 0, fi = 0;
      while (hi < her.length || fi < fan.length) {
        if (hi < her.length) out.push(her[hi++]);
        var take = fan.length > her.length ? Math.ceil(fan.length / her.length) : 1;
        for (var k = 0; k < take && fi < fan.length; k++) out.push(fan[fi++]);
      }
      return out;
    }

    /* ---- 화면 크기 ---- */
    /* 물리는 '높이 600'인 가상 공간에서 계산하고, 그릴 때만 실제 크기로 늘린다.
       그래야 폰이든 데스크톱이든 조작감이 같다. */
    var VH = 600, VW = 900, scale = 1, dpr = 1;
    function resize() {
      var r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      scale = r.height / VH;
      VW = r.width / scale;
      return true;
    }

    /* ---- 상태 ---- */
    var STATE = "idle";       /* idle | fly | end */
    var raf = 0, last = 0, acc = 0;
    var holding = false, watchMode = false;
    var goose, world, trail, passed, stars, everStarted = false;

    var GRAV = 1500;          /* 아래로 */
    var LIFT = -3400;         /* 누르는 동안 위로 */
    var VYMAX = 780;
    var SCROLL = 210;         /* 세상이 왼쪽으로 흐르는 속도 */
    var GAP = 330;            /* 빛 사이 간격 */
    var GX = 0.27;            /* 내 거위의 가로 위치 (화면 비율) */
    var WATER = VH - 74;      /* 수면 */
    var SKYTOP = 58;

    function reset() {
      goose = { y: VH * 0.45, vy: 0, flap: 0, boost: 0 };
      trail = [];
      passed = 0;
      world = lights.map(function (L, i) {
        return {
          src: L,
          x: VW + 260 + i * GAP,
          /* 고도를 오르내리게 배치해 계속 조작하게 만든다 */
          y: VH * 0.30 + Math.sin(i * 0.9) * VH * 0.17 + (i % 3) * 14,
          hold: 0, done: false, flap: Math.random() * 6
        };
      });
      stars = [];
      for (var i = 0; i < 90; i++) {
        stars.push({ x: Math.random() * VW, y: Math.random() * (WATER - 20),
                     r: Math.random() * 1.5 + 0.4, tw: Math.random() * 6, d: 0.25 + Math.random() * 0.6 });
      }
      if (elLog) elLog.innerHTML = "";
      setCount(0);
      say("");
    }

    function setCount(n) {
      if (!elCount) return;
      elCount.textContent = en()
        ? (n + (n === 1 ? " dream" : " dreams"))
        : (n + "개의 꿈");
    }
    function say(html) {
      if (!elCaption) return;
      elCaption.innerHTML = html || "";
      elCaption.classList.toggle("on", !!html);
    }

    /* 따라 난 꿈은 아래 목록에 남는다 — 날면서 못 읽어도 나중에 읽게 */
    function logDream(L) {
      if (!elLog) return;
      var li = el("li", "fl-log-item");
      li.innerHTML = '<span class="fl-log-tag' + (L.kind === "her" ? " is-her" : "") + '">' +
        esc(L.label) + "</span> " + esc(L.text);
      elLog.appendChild(li);
    }

    /* ---- 조작 ---- */
    function down(e) {
      if (STATE !== "fly" || watchMode) return;
      holding = true;
      if (e && e.cancelable) e.preventDefault();
    }
    function up() { holding = false; }

    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    canvas.addEventListener("keydown", function (e) {
      if (e.key === " " || e.key === "Enter") { down(e); }
    });
    canvas.addEventListener("keyup", function (e) {
      if (e.key === " " || e.key === "Enter") up();
    });

    /* ---- 한 걸음 ---- */
    function step(dt) {
      /* 자동 비행: 가장 가까운 앞 거위의 상승기류 자리로 고도를 맞춘다.
         쫓던 거위는 완전히 지나갈 때까지(dx > -30) 놓지 않는다.
         코앞에서 다음 거위로 목표를 바꾸면 정작 자리에 머무는 순간에 흔들린다.
         제어는 속도까지 보는 PD식 — 그냥 '위/아래'로만 하면 목표 주변에서 떤다. */
      if (watchMode) {
        var tgt = null, best = 1e9;
        for (var i = 0; i < world.length; i++) {
          if (world[i].done) continue;
          var d = world[i].x - VW * GX;
          if (d > -30 && d < best) { best = d; tgt = world[i]; }
        }
        var want = tgt ? tgt.y + 48 : VH * 0.45;
        holding = (goose.y - want) + goose.vy * 0.28 > 0;
      }

      goose.vy += (holding ? LIFT + GRAV : GRAV) * dt;
      /* 상승기류 안에 있으면 몸이 가벼워진다 — 실제 11~20% 절감을 조작으로 */
      if (goose.boost > 0) { goose.vy -= GRAV * 0.34 * dt; goose.boost -= dt; }
      if (goose.vy > VYMAX) goose.vy = VYMAX;
      if (goose.vy < -VYMAX) goose.vy = -VYMAX;
      goose.y += goose.vy * dt;

      /* 죽지 않는다 — 물에 닿으면 튕기고 천장에서는 눕는다 */
      if (goose.y > WATER - 16) { goose.y = WATER - 16; if (goose.vy > 0) goose.vy = -goose.vy * 0.45; }
      if (goose.y < SKYTOP)     { goose.y = SKYTOP;     if (goose.vy < 0) goose.vy = 0; }

      goose.flap += dt * (holding ? 17 : 6);

      /* 세상이 흐른다 */
      var mx = VW * GX, alive = 0;
      for (var j = 0; j < world.length; j++) {
        var w = world[j];
        w.flap += dt * 7;

        /* 따라잡은 거위는 흘러가지 않는다 — 내 뒤로 붙어 V자를 이룬다.
           앞선 새 덕분에 뒤가 편해지는 그 대형을, 이번엔 내가 앞에 서서 만든다. */
        if (w.inTrail) {
          var k = w.slot;
          var sx = mx - 56 - k * 42;
          var sy = goose.y + ((k % 2) ? -1 : 1) * (22 + Math.floor(k / 2) * 17);
          var ease = Math.min(1, dt * 3.4);
          w.x += (sx - w.x) * ease;
          w.y += (sy - w.y) * ease;
          continue;
        }

        w.x -= SCROLL * dt;
        if (w.x > -220) alive++;

        if (!w.done) {
          /* 상승기류 자리 = 앞서 있고(dx), 정확히 뒤가 아니라 비스듬히(dy).
             폭을 넉넉히 잡는다 — 210 단위를 흐르는 데 1초쯤 걸리니
             0.4초를 버티면 열린다. (처음엔 0.63초 창에 0.55초를 요구해
             사람도 자동비행도 한 번을 못 붙었다) */
          var dx = w.x - mx, dy = w.y - goose.y;
          var inZone = dx > 40 && dx < 250 && Math.abs(dy) > 6 && Math.abs(dy) < 92;
          if (inZone) {
            w.hold += dt;
            goose.boost = 0.22;
            if (w.hold > 0.4) {
              w.done = true;
              w.inTrail = true;
              w.slot = trail.length;
              trail.push(w);
              passed++;
              setCount(passed);
              logDream(w.src);
              say('<span class="fl-cap-tag' + (w.src.kind === "her" ? " is-her" : "") + '">' +
                  esc(w.src.label) + "</span>" + esc(w.src.text));
            }
          } else if (w.hold > 0) {
            w.hold = Math.max(0, w.hold - dt * 1.6);
          }
        }
      }
      if (!alive) land();
    }

    /* ---- 그리기 ---- */
    function gooseShape(c, x, y, size, flap, color, alpha) {
      c.save();
      c.globalAlpha = alpha == null ? 1 : alpha;
      c.translate(x, y);
      c.scale(size / 120, size / 120);
      c.fillStyle = color; c.strokeStyle = color;
      /* 몸통 */
      c.save(); c.translate(48, 46); c.rotate(-7 * Math.PI / 180);
      c.beginPath(); c.ellipse(0, 0, 27, 11.5, 0, 0, Math.PI * 2); c.fill(); c.restore();
      /* 목·머리·부리 */
      c.lineWidth = 8; c.lineCap = "round";
      c.beginPath(); c.moveTo(66, 41); c.bezierCurveTo(78, 36, 87, 30, 94, 23); c.stroke();
      c.beginPath(); c.arc(96, 21, 5.4, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(100, 18.5); c.lineTo(111, 21); c.lineTo(100, 24.5); c.closePath(); c.fill();
      /* 날개 — 위아래로 접힌다 */
      var w = Math.sin(flap);
      c.save(); c.translate(50, 38); c.rotate(w * 0.5 - 0.12); c.translate(-50, -38);
      c.beginPath(); c.moveTo(45, 38);
      c.bezierCurveTo(36, 24 - w * 12, 34, 13 - w * 16, 41, 6 - w * 18);
      c.bezierCurveTo(48, 12 - w * 12, 55, 27 - w * 5, 57, 37);
      c.bezierCurveTo(53, 38.5, 49, 38.7, 45, 38); c.closePath(); c.fill();
      c.restore();
      /* 꼬리 */
      c.beginPath(); c.moveTo(24, 42); c.lineTo(10, 37); c.lineTo(22, 50); c.closePath(); c.fill();
      c.restore();
    }

    function draw(tms) {
      var W = VW, H = VH;
      ctx.save();
      ctx.scale(dpr * scale, dpr * scale);

      /* 밤하늘 */
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "#070707"); g.addColorStop(0.58, "#0e0d0c"); g.addColorStop(1, "#151412");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      /* 별 — 멀수록 천천히 흐른다 */
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.x -= SCROLL * s.d * 0.0166;
        if (s.x < -4) { s.x = W + 4; s.y = Math.random() * (WATER - 20); }
        ctx.globalAlpha = 0.35 + Math.abs(Math.sin(tms * 0.0009 + s.tw)) * 0.5;
        ctx.fillStyle = "#F3EFE7";
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      /* 수면 */
      var wg = ctx.createLinearGradient(0, WATER, 0, H);
      wg.addColorStop(0, "rgba(243,239,231,0.10)"); wg.addColorStop(1, "rgba(8,8,8,0)");
      ctx.fillStyle = wg; ctx.fillRect(0, WATER, W, H - WATER);
      ctx.strokeStyle = "rgba(243,239,231,0.18)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, WATER); ctx.lineTo(W, WATER); ctx.stroke();

      /* 앞서 나는 거위들 */
      var mx = W * GX;
      for (var j = 0; j < world.length; j++) {
        var w2 = world[j];
        if (w2.x < -220 || w2.x > W + 240) continue;
        var her = w2.src.kind === "her";
        var col = her ? "#F3EFE7" : "#a99f93";

        /* 상승기류 — 자리에 들어가면 눈에 보인다 */
        if (w2.hold > 0 && !w2.done) {
          ctx.save();
          ctx.globalAlpha = Math.min(w2.hold / 0.55, 1) * 0.55;
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([5, 7]);
          ctx.beginPath(); ctx.moveTo(mx + 16, goose.y); ctx.lineTo(w2.x - 10, w2.y + 6); ctx.stroke();
          ctx.restore();
        }
        /* 빛 — 대형에 붙은 거위는 은은하게. 17마리가 다 환하면 눈이 아프다 */
        var rad = w2.inTrail ? 12 : (w2.done ? 26 : 17);
        var lg = ctx.createRadialGradient(w2.x, w2.y, 0, w2.x, w2.y, rad * 2.4);
        lg.addColorStop(0, her ? "rgba(243,239,231,0.50)" : "rgba(169,159,147,0.42)");
        lg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(w2.x, w2.y, rad * 2.4, 0, Math.PI * 2); ctx.fill();

        gooseShape(ctx, w2.x - 26, w2.y - 20, 52, w2.flap, col, w2.done ? 1 : 0.78);
      }

      /* 내 거위 */
      if (goose.boost > 0) {
        var bg = ctx.createRadialGradient(mx + 14, goose.y + 4, 0, mx + 14, goose.y + 4, 62);
        bg.addColorStop(0, "rgba(243,239,231,0.26)"); bg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(mx + 14, goose.y + 4, 62, 0, Math.PI * 2); ctx.fill();
      }
      /* 내 거위는 남들보다 크게. 후광 달린 무리 속에서 '나'로 읽혀야 한다 */
      ctx.save();
      ctx.translate(mx, goose.y);
      ctx.rotate(Math.max(-0.34, Math.min(0.42, goose.vy / 1500)));
      ctx.shadowColor = "rgba(8,8,8,0.9)"; ctx.shadowBlur = 14;
      gooseShape(ctx, -38, -30, 78, goose.flap, "#ffffff", 1);
      ctx.restore();

      ctx.restore();
    }

    /* ---- 회전 ---- */
    function loop(tms) {
      /* 라우터가 <main>을 갈아 끼우면 캔버스가 문서에서 떨어진다.
         그때 멈추지 않으면 보이지 않는 루프가 계속 돈다. */
      if (!canvas.isConnected) { raf = 0; return; }
      raf = requestAnimationFrame(loop);
      if (!last) last = tms;
      var dt = Math.min((tms - last) / 1000, 0.05);
      last = tms;
      if (STATE === "fly") {
        acc += dt;
        while (acc > 1 / 120) { step(1 / 120); acc -= 1 / 120; }
      }
      draw(tms);
    }
    function start(watch) {
      if (!resize()) return;
      /* 하늘에 아무것도 없으면 날려 보내지 않는다.
         (예전에 이 자리가 비면 첫 프레임에 곧바로 착륙해 버렸다 —
          '아무 일도 안 일어나는' 고장이라 눈에 띄지 않는다) */
      if (!lights.length) {
        var note0 = $("#fl-sky-note");
        if (note0) note0.textContent = t("fl.empty", "지금은 하늘을 띄우지 못했습니다. 새로고침해 주세요.");
        return;
      }
      watchMode = !!watch;
      everStarted = true;
      reset();
      STATE = "fly";
      last = 0; acc = 0;
      if (elIntro) elIntro.hidden = true;
      if (elEnd) elEnd.hidden = true;
      if (elHud) elHud.hidden = false;
      stage.classList.add("is-flying");
      if (!raf) raf = requestAnimationFrame(loop);
      if (!watchMode) { try { canvas.focus(); } catch (e) {} }
    }
    function land() {
      if (STATE !== "fly") return;
      STATE = "end";
      holding = false;
      stage.classList.remove("is-flying");
      if (elHud) elHud.hidden = true;
      if (elEnd) elEnd.hidden = false;
      say("");
      var head = $("#fl-end-head");
      if (head) {
        head.textContent = passed === 0
          ? t("fl.none", "이번엔 한 마리도 따라잡지 못했어요. 괜찮습니다.")
          : (en() ? ("You flew behind " + passed + (passed === 1 ? " dream." : " dreams."))
                  : ("당신은 " + passed + "개의 꿈을 따라 날았습니다."));
      }
    }

    if (btnFly)   btnFly.addEventListener("click", function () { start(false); });
    if (btnWatch) btnWatch.addEventListener("click", function () { start(true); });
    if (btnLand)  btnLand.addEventListener("click", land);
    if (btnAgain) btnAgain.addEventListener("click", function () { start(watchMode); });

    /* ---- 마무리: 사랑방의 글칸으로 ----
       사이트의 자유 입력칸은 하나뿐이다. 여기서 또 받지 않고 그 자리로 보낸다. */
    var btnToNote = $("#fl-tonote");
    if (btnToNote) {
      btnToNote.addEventListener("click", function () {
        var box = $("#sb-write-box"), wr = $("#sb-write");
        if (wr) wr.click();
        if (box) {
          box.hidden = false;
          box.scrollIntoView({ block: "center", behavior: "smooth" });
          var i2 = $("#sb-body");
          if (i2) setTimeout(function () { try { i2.focus(); } catch (e) {} }, 300);
        }
      });
    }
    function note(text, ok) {
      if (!msg) return;
      msg.textContent = text;
      msg.className = "fl-msg" + (ok === true ? " is-ok" : ok === false ? " is-bad" : "");
    }

    /* ---- 눈에 안 보이면 멈춘다 (배터리·성능) ---- */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && STATE === "fly") land();
    });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting && STATE === "fly") land();
      }, { threshold: 0.15 }).observe(stage);
    }
    window.addEventListener("resize", function () { if (everStarted) resize(); });

    /* 움직임을 줄이도록 설정한 분에게는 '지켜보기'를 먼저 권한다.
       직접 나는 길도 그대로 열어 둔다 — 고르는 것은 본인이다. */
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (btnWatch && btnFly) {
          btnWatch.classList.remove("btn--ghost", "btn--sm", "fl-alt");
          btnWatch.classList.add("btn--gold", "fl-big");
          btnFly.classList.remove("btn--gold", "fl-big");
          btnFly.classList.add("btn--ghost", "btn--sm", "fl-alt");
          elIntro.insertBefore(btnWatch, btnFly);
        }
      }
    } catch (e) {}

    /* 받을 곳이 없으면 '한 줄 남기기'를 권하지 않는다 */
    if (!BE() && btnToNote) {
      btnToNote.hidden = true;
      note(t("fl.off", "지금은 글을 받을 수 없습니다. 잠시 뒤 다시 시도해 주세요."), false);
    }

    /* ---- 하늘 채우기 ---- */
    lights = buildLights([]);          /* 먼저 그의 연혁만으로 띄울 준비 */
    var be0 = BE();
    if (be0) {
      be0.listNotes().then(function (res) {
        dreamsLoaded = true;
        if (res && res.ok && res.rows && res.rows.length) {
          lights = buildLights(res.rows);
        }
        var n = $("#fl-sky-note");
        if (n) {
          var c = (res && res.rows) ? res.rows.length : 0;
          n.textContent = c
            ? (en() ? ("Tonight's sky carries " + c + " dreams left by others, and her own record.")
                    : ("오늘 밤하늘에는 다른 분들이 남긴 꿈 " + c + "개와 인순이의 발자취가 함께 떠 있습니다."))
            : t("fl.skyher", "지금 하늘에는 인순이의 발자취가 떠 있습니다. 첫 번째 꿈을 남겨 주세요.");
        }
      });
    }
  }

  /* ---------- 7. 사랑방 ----------
     사랑방은 인순이의 48년이 한 줄기로 흐르는 방이고,
     팬이 남긴 한 줄은 그 줄기의 같은 자리에 같은 자격으로 선다.

     전에는 여기에 섹션이 일곱 개 있었다 — 게임·노래 맞히기·편지·게시판·
     신청곡·이웃 링크·구독. 서로 아무 관계가 없어서 방이 아니라
     부스가 늘어선 복도였다. 글 쓰는 칸만 셋이라 어디에 무엇을 써야
     하는지도 알 수 없었다.

     지금은 둘이다.
       오늘의 자리  — 오늘의 곡 하나, 큰 버튼 두 개 (듣기 / 남기기)
       줄기        — 연혁 16 + 정규앨범 18 + 승인된 팬의 한 줄

     ── 이 설계에서 가장 중요한 한 줄 ─────────────────────────
     팬 줄의 정렬 키는 '남긴 날'이 아니라 **그 곡의 연도**다.
     남긴 날로 잡으면 팬 줄이 전부 맨 위에 몰리고 연혁·앨범이 아래로 밀려
     결국 '팬 글 목록'과 '아카이브 목록' 두 개로 도로 갈라진다.
     곡 연도를 키로 쓰면 1957~2026 사이에 팬의 줄이 끼어 들어가고,
     줄이 늘수록 특정 연도가 두꺼워진다 — 숫자 없이 밀도가 보이고,
     아무도 부풀릴 수 없다. */

  /* 한국 날짜. 브라우저 시간대와 무관해야 한다.
     로컬 날짜를 쓰면 "오늘 이 방에 온 모두에게 같은 곡"이 거짓말이 된다. */
  function kstNow() {
    var d = new Date();
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000 + 9 * 3600000);
  }
  var NIGHT_ONE = Date.UTC(2026, 6, 31);        /* 2026-07-31 이 제1밤 */
  function nightNo() {
    var k = kstNow();
    var today = Date.UTC(k.getFullYear(), k.getMonth(), k.getDate());
    return Math.max(1, Math.round((today - NIGHT_ONE) / 86400000) + 1);
  }
  function kstLabel() {
    var k = kstNow();
    var days = ["일", "월", "화", "수", "목", "금", "토"];
    if (document.documentElement.getAttribute("lang") === "en") {
      var mn = ["January","February","March","April","May","June",
                "July","August","September","October","November","December"];
      return mn[k.getMonth()] + " " + k.getDate();
    }
    return (k.getMonth() + 1) + "월 " + k.getDate() + "일 " + days[k.getDay()] + "요일";
  }

  var SONGS = null;                              /* songs.json (곡 앵커) */
  function loadSongs() {
    if (SONGS) return Promise.resolve(SONGS);
    return fetch("assets/data/songs.json")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { SONGS = (d && d.songs) || []; return SONGS; })
      .catch(function () { SONGS = []; return SONGS; });
  }

  /* ---------- 7.1 오늘의 자리 ----------
     첫 3초에 누를 것 하나. 틀릴 수 있는 것이 화면에 없다.

     버튼 둘을 처음부터 나란히 둔다. 같은 자리 버튼이 '듣기'였다가
     '남기기'로 변신하는 것은 어르신에게 최악의 패턴이고,
     소리가 안 나는 환경에서는 30초짜리 관문이 되어 버린다. */
  function initToday() {
    var sec = $("#sb-today");
    if (!sec) return;

    var elNight = $("#sb-night"), elArt = $("#sb-art"), elBlur = $("#sb-art-blur"), elCap = $("#sb-art-cap");
    var elSong = $("#sb-song"), elWhy = $("#sb-why");
    var btnPlay = $("#sb-play"), btnWrite = $("#sb-write"), btnOther = $("#sb-other");
    var elState = $("#sb-play-state"), elBar = $("#sb-bar");
    var form = $("#sb-form"), input = $("#sb-body"), nameIn = $("#sb-name");
    var msg = $("#sb-msg"), done = $("#sb-done"), chips = $("#sb-chips");
    var btnCancel = $("#sb-cancel"), btnCard = $("#sb-card");

    var en = function () { return document.documentElement.getAttribute("lang") === "en"; };
    var song = null, photo = null;
    var audio = null, timer = null;
    var TOKKEY = "insooni_note_token";

    if (elNight) {
      elNight.textContent = (en() ? ("Night " + nightNo() + " · ") : ("제" + nightNo() + "밤 · ")) + kstLabel();
    }

    /* 재킷이 없는 4곡을 위한 사진 (가로 사진만 — 세로는 이 자리에서 잘린다) */
    var wide = (D.archive || []).filter(function (a) { return a.img && a.w > a.h; });

    /* 오늘의 이미지. 곡의 재킷이 있으면 재킷을 쓴다 — 그래야 그림과 노래가
       따로 놀지 않는다. 재킷은 정사각이고 이 자리는 가로로 넓으므로,
       같은 이미지를 흐리게 깐 위에 원본을 통째로 얹는다(자르지 않는다).
       CSS의 상대 경로로 배경을 걸면 assets/css/ 기준이 되어 404가 난다 —
       실제로 그런 적이 있어 자바스크립트로 직접 넣는다. */
    function showArt(s2) {
      if (!elArt) return;
      var src = s2 && s2.art;
      var cap = "";
      if (src) {
        /* 앨범명은 바로 아래 곡 줄에 이미 있다. 캡션을 또 달면 같은 말이 두 번 나온다. */
        cap = "";
        elArt.alt = (s2.t || "") + " 앨범 재킷";
        elArt.classList.remove("is-photo");
      } else if (wide.length) {
        photo = wide[nightNo() % wide.length];
        src = photo.img;
        cap = t("sb.todayPhoto", "오늘의 사진") + (tr(photo, "caption") ? (" · " + tr(photo, "caption")) : "");
        elArt.alt = cap || "인순이";
        elArt.classList.add("is-photo");
      }
      if (!src) return;
      elArt.src = src;
      if (elBlur) elBlur.style.backgroundImage = 'url("' + src + '")';
      if (elCap) elCap.textContent = cap;
    }

    function songLine(s) {
      if (!s) return "";
      var al = "";
      if (s.alNo && s.alTitle) al = " · " + s.alNo + "집 《" + s.alTitle + "》";
      else if (s.alTitle) al = " · 《" + s.alTitle + "》";
      return "「" + s.t + "」" + al + (s.y ? (" · " + s.y) : "");
    }

    function showSong(s) {
      song = s;
      showArt(s);
      if (elSong) elSong.textContent = songLine(s);
      if (elWhy) {
        elWhy.textContent = s && s.amb
          ? t("sb.whyAmb", "이 곡은 여러 앨범에 실렸습니다. 처음 수록된 앨범을 적었습니다.")
          : t("sb.whyDay", "오늘 이 방에 온 모두에게 같은 곡이 걸립니다.");
      }
      if (btnPlay) btnPlay.disabled = !(s && s.u);
      say("");
    }

    function say(text, bad) {
      if (!elState) return;
      elState.textContent = text || "";
      elState.className = "sb-play-state" + (bad ? " is-bad" : "");
    }

    /* 곡 고르기.
       ① 인순이가 직접 골라 둔 밤이 있으면 그 곡
       ② 없으면 날짜에서 뽑는다 — 다만 연표에 못박힌 대표곡(거위의 꿈·아버지·
          친구여 같은)이 앞쪽에 오게 한다. 처음 온 사람이 이름도 못 들어 본
          수록곡을 만나면 첫인상이 약하다. 뒤이어 나머지 곡이 돈다. */
    var rotation = null;
    function buildRotation(list) {
      var playable = list.filter(function (s) { return s.u; });
      var pool = playable.length ? playable : list;
      var known = pool.filter(function (s) { return s.why === "연표" || s.why === "기념일"; });
      var rest = pool.filter(function (s) { return !(s.why === "연표" || s.why === "기념일"); });
      return known.concat(rest);
    }
    function pickSong(list) {
      if (!list.length) return null;
      if (!rotation) rotation = buildRotation(list);
      return rotation[(nightNo() - 1) % rotation.length];
    }

    /* 인순이가 걸어 둔 밤이 있으면 그것이 이긴다. 파일이 없거나 비어도 정상. */
    function chosenSong(list) {
      return fetch("assets/data/nights.json")
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          var k = kstNow();
          var ymd = k.getFullYear() + "-" +
                    ("0" + (k.getMonth() + 1)).slice(-2) + "-" + ("0" + k.getDate()).slice(-2);
          var hit = ((d && d.nights) || []).filter(function (n) { return n.d === ymd; })[0];
          if (!hit) return null;
          return list.filter(function (s) { return s.k === hit.k; })[0] || null;
        })
        .catch(function () { return null; });
    }

    /* ---- 30초 듣기 ---- */
    function stopAudio() {
      if (timer) { clearInterval(timer); timer = null; }
      if (audio) {
        /* 듣기를 멈출 때 남은 이벤트가 뒤늦게 울려 화면을 덮어쓴 적이 있다.
           반드시 먼저 떼고 멈춘다. src를 ""로 바꾸지 않는다(유령 오류가 난다). */
        audio.onended = null; audio.onerror = null; audio.ontimeupdate = null;
        try { audio.pause(); } catch (e) {}
        audio = null;
      }
      if (elBar) elBar.style.width = "0%";
      sec.classList.remove("is-playing");
      if (btnPlay) btnPlay.textContent = t("sb.play", "30초 들어보기");
    }

    function play() {
      if (audio) { stopAudio(); say(""); return; }
      if (!song || !song.u) { say(t("sb.noaudio", "이 곡은 지금 소리가 나지 않습니다."), true); return; }
      audio = new Audio(song.u);
      audio.preload = "auto";
      sec.classList.add("is-playing");
      if (btnPlay) btnPlay.textContent = t("sb.stop", "그만 듣기");
      say(t("sb.playing", "노래가 흐르고 있습니다. 소리가 들리지 않으면 무음 스위치를 확인해 주세요."));
      audio.onerror = function () {
        stopAudio();
        say(t("sb.failed", "이 곡은 지금 소리가 나지 않습니다. 다른 곡으로 바꿔 보세요."), true);
      };
      audio.onended = function () { stopAudio(); say(t("sb.ended", "여기까지가 30초입니다.")); };
      audio.ontimeupdate = function () {
        if (!elBar || !audio || !audio.duration) return;
        elBar.style.width = Math.min(100, (audio.currentTime / audio.duration) * 100) + "%";
      };
      var p = audio.play();
      if (p && p.catch) {
        p.catch(function () {
          stopAudio();
          say(t("sb.blocked", "브라우저가 소리를 막았습니다. 버튼을 한 번 더 눌러 주세요."), true);
        });
      }
    }

    /* ---- 한 줄 남기기 ---- */
    function note(text, kind) {
      if (!msg) return;
      msg.textContent = text || "";
      msg.className = "sb-msg" + (kind ? " is-" + kind : "");
    }

    function showDone(token) {
      if (!done) return;
      done.hidden = false;
      if (token) { try { localStorage.setItem(TOKKEY, token); } catch (e) {} }
      if (btnCancel) btnCancel.hidden = !token;
      if (btnCard) btnCard.hidden = false;
    }

    if (chips) {
      /* 사실 주장이 없는 고정 문구. 누르면 입력칸에 들어가고 커서가 그 뒤에 선다.
         대체가 아니라 시작이다 — 그대로 보내도 되고, 지우고 다시 써도 된다. */
      var PRESETS = [
        ["이 노래를 오래 좋아했습니다.", "I've loved this one for a long time."],
        ["오늘 처음 들었습니다.", "I heard this for the first time today."],
        ["다음 무대에서 듣고 싶어요.", "I'd love to hear this live."],
        ["그냥 인사드리러 왔습니다.", "Just stopping by to say hello."]
      ];
      PRESETS.forEach(function (p) {
        var b = el("button", "sb-chip", esc(en() ? p[1] : p[0]));
        b.type = "button";
        b.addEventListener("click", function () {
          if (!input) return;
          input.value = en() ? p[1] : p[0];
          input.focus();
          try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
        });
        chips.appendChild(b);
      });
    }

    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var body = (input && input.value || "").trim();
        if (body.length < 2) { note(t("sb.need", "한 줄만 적어 주세요."), "bad"); return; }
        var be = BE();
        if (!be) { note(t("sb.off", "지금은 글을 받을 수 없습니다. 잠시 뒤 다시 시도해 주세요."), "bad"); return; }
        var btn = form.querySelector("button[type=submit]");
        if (btn) btn.disabled = true;
        note(t("sb.sending", "보내는 중…"));
        be.submitNote({
          songKey: song && song.k, songTitle: song && song.t, songYear: song && song.y,
          name: (nameIn && nameIn.value || "").trim(), body: body
        }).then(function (res) {
          if (btn) btn.disabled = false;
          if (res && res.ok) {
            note("");
            showDone(res.token);
            if (input) input.value = "";
          } else {
            note(beWhy(res), "bad");
          }
        });
      });
    }

    if (btnCancel) {
      btnCancel.addEventListener("click", function () {
        var be = BE(), tok = null;
        try { tok = localStorage.getItem(TOKKEY); } catch (e) {}
        if (!be || !tok) { note(t("sb.nocancel", "지울 글을 찾지 못했습니다."), "bad"); return; }
        btnCancel.disabled = true;
        be.cancelNote(tok).then(function (res) {
          btnCancel.disabled = false;
          if (res && res.ok) {
            try { localStorage.removeItem(TOKKEY); } catch (e) {}
            if (done) done.hidden = true;
            note(t("sb.cancelled", "지웠습니다."), "ok");
          } else if (res && res.reason === "already_published") {
            /* 이미 올라간 뒤다. 지운 척하지 않는다. */
            note(t("sb.tooLate", "이미 사랑방에 올라간 글입니다. 내리시려면 아래 공식 채널로 알려 주세요."), "bad");
            btnCancel.hidden = true;
          } else {
            note(beWhy(res), "bad");
          }
        });
      });
    }

    /* ---- 내 카드 저장 ----
       자체 호스팅 사진만 그린다. 애플 재킷을 캔버스에 그리면
       CORS로 오염되어 저장 자체가 실패한다. */
    if (btnCard) {
      btnCard.addEventListener("click", function () {
        var body = (input && input.value || "").trim();
        makeCard(body).then(function (blob) {
          if (!blob) { note(t("sb.cardFail", "이미지를 만들지 못했습니다."), "bad"); return; }
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "insooni-night" + nightNo() + ".png";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        });
      });
    }

    function makeCard(body) {
      return new Promise(function (resolve) {
        var W = 1080, H = 1350;
        var c = document.createElement("canvas");
        c.width = W; c.height = H;
        var x = c.getContext("2d");
        x.fillStyle = "#080808"; x.fillRect(0, 0, W, H);

        function finish() {
          x.fillStyle = "#F3EFE7";
          x.textAlign = "center";
          x.font = "500 34px 'Pretendard Variable', Pretendard, sans-serif";
          x.fillText((en() ? "Night " : "제") + nightNo() + (en() ? "" : "밤"), W / 2, 940);
          x.font = "600 46px 'Pretendard Variable', Pretendard, sans-serif";
          x.fillText(song ? ("「" + song.t + "」") : "", W / 2, 1010);
          if (song && song.y) {
            x.fillStyle = "#b3a99c";
            x.font = "400 30px 'Pretendard Variable', Pretendard, sans-serif";
            x.fillText(song.y, W / 2, 1056);
          }
          if (body) {
            x.fillStyle = "#F3EFE7";
            x.font = "400 36px 'Pretendard Variable', Pretendard, sans-serif";
            /* 두 줄까지만 — 넘치면 말줄임 */
            var words = body.split(" "), line = "", lines = [];
            words.forEach(function (w) {
              var test = line ? line + " " + w : w;
              if (x.measureText(test).width > W - 160 && line) { lines.push(line); line = w; }
              else line = test;
            });
            if (line) lines.push(line);
            lines.slice(0, 2).forEach(function (ln, i) {
              var out = (i === 1 && lines.length > 2) ? ln + "…" : ln;
              x.fillText(out, W / 2, 1140 + i * 50);
            });
          }
          x.fillStyle = "#8b8175";
          x.font = "400 24px 'Pretendard Variable', Pretendard, sans-serif";
          x.fillText("INSOONI · 사랑방", W / 2, 1290);
          c.toBlob(resolve, "image/png");
        }

        if (!photo) { finish(); return; }
        var im = new Image();
        im.onload = function () {
          /* 위 880px을 사진으로 채운다 (잘리지 않게 비율 유지) */
          var r = Math.max(W / im.width, 880 / im.height);
          var w = im.width * r, h = im.height * r;
          x.drawImage(im, (W - w) / 2, (880 - h) / 2, w, h);
          var g = x.createLinearGradient(0, 600, 0, 900);
          g.addColorStop(0, "rgba(8,8,8,0)"); g.addColorStop(1, "#080808");
          x.fillStyle = g; x.fillRect(0, 600, W, 300);
          finish();
        };
        im.onerror = function () { finish(); };
        im.src = photo.img;
      });
    }

    /* ---- 다른 곡으로 바꾸기 ---- */
    if (btnOther) {
      btnOther.addEventListener("click", function () {
        var box = $("#sb-picker");
        if (!box) return;
        box.hidden = !box.hidden;
        if (!box.hidden) {
          renderPicker("");
          var q = $("#sb-q"); if (q) q.focus();
        }
      });
    }
    function renderPicker(q) {
      var list = $("#sb-picklist");
      if (!list || !SONGS) return;
      var qq = (q || "").trim().toLowerCase();
      var hit = SONGS.filter(function (s) {
        return !qq || s.t.toLowerCase().indexOf(qq) >= 0 || (s.y || "").indexOf(qq) >= 0;
      }).slice(0, 40);
      list.innerHTML = "";
      hit.forEach(function (s) {
        var b = el("button", "sb-pick", esc(s.t) + '<span class="sb-pick-y">' + esc(s.y || "") + "</span>");
        b.type = "button";
        b.addEventListener("click", function () {
          stopAudio(); showSong(s);
          var box = $("#sb-picker"); if (box) box.hidden = true;
        });
        list.appendChild(b);
      });
      if (!hit.length) list.innerHTML = '<p class="form-hint">' + esc(t("sb.nohit", "그런 제목의 곡을 찾지 못했습니다.")) + "</p>";
    }
    var qIn = $("#sb-q");
    if (qIn) qIn.addEventListener("input", function () { renderPicker(qIn.value); });

    if (btnPlay) btnPlay.addEventListener("click", play);
    if (btnWrite) {
      btnWrite.addEventListener("click", function () {
        var f = $("#sb-write-box");
        if (!f) return;
        f.hidden = false;
        f.scrollIntoView({ block: "center", behavior: "smooth" });
        if (input) setTimeout(function () { try { input.focus(); } catch (e) {} }, 260);
      });
    }
    document.addEventListener("visibilitychange", function () { if (document.hidden) stopAudio(); });

    /* 받을 곳이 없으면 글을 달라고 하지 않는다 */
    if (!BE()) {
      if (btnWrite) btnWrite.hidden = true;
      var wb = $("#sb-write-box"); if (wb) wb.hidden = true;
      var offNote = $("#sb-offline"); if (offNote) offNote.hidden = false;
    }

    loadSongs().then(function (list) {
      if (!list.length) {
        if (elSong) elSong.textContent = t("sb.nosongs", "곡 목록을 불러오지 못했습니다.");
        if (btnPlay) btnPlay.disabled = true;
        return;
      }
      chosenSong(list).then(function (chosen) {
        showSong(chosen || pickSong(list));
        if (chosen && elWhy) elWhy.textContent = t("sb.whyHer", "인순이가 이 밤에 걸어 둔 노래입니다.");
      });
      /* 어제 남긴 글이 올라왔는지 조용히 확인한다 */
      var be = BE(), tok = null;
      try { tok = localStorage.getItem(TOKKEY); } catch (e) {}
      if (be && tok) {
        be.noteStatus(tok).then(function (res) {
          if (!res || !res.ok) {
            if (res && res.reason === "not_found") { try { localStorage.removeItem(TOKKEY); } catch (e) {} }
            return;
          }
          if (res.status === "approved") {
            var up = $("#sb-uplifted");
            if (up) { up.hidden = false; }
            try { localStorage.removeItem(TOKKEY); } catch (e) {}
          } else if (res.status === "pending") {
            showDone(tok);
          }
        });
      }
    });
  }

  /* ---------- 7.2 사랑방의 줄기 ----------
     연혁 16 + 정규앨범 18 + 승인된 팬의 한 줄이 한 줄기에 선다.
     팬이 0명이어도 34칸이 이미 서 있다 — 빈 화면이 나오지 않는 이유다. */
  function initStream() {
    var box = $("#sb-stream");
    if (!box) return;
    var list = $("#sb-rows"), more = $("#sb-more"), head = $("#sb-filled");
    if (!list) return;

    var PAGE = 12, shown = 0, rows = [];

    function addRow(r) {
      var li = el("li", "sb-row is-" + r.kind);
      var art = r.art
        ? '<span class="sb-row-art"><img src="' + esc(r.art) + '" alt="" loading="lazy" decoding="async"></span>'
        : "";
      li.innerHTML =
        '<span class="sb-row-y">' + esc(r.y || "") + "</span>" +
        art +
        '<span class="sb-row-b">' +
          '<span class="sb-row-t">' + esc(r.text) + "</span>" +
          (r.sub ? '<span class="sb-row-s">' + esc(r.sub) + "</span>" : "") +
        "</span>";
      list.appendChild(li);
    }

    function draw() {
      var next = rows.slice(shown, shown + PAGE);
      next.forEach(addRow);
      shown += next.length;
      if (more) more.hidden = shown >= rows.length;
    }

    function build(notes) {
      rows = [];
      (D.timeline || []).forEach(function (r) {
        rows.push({ y: r.year, kind: "life", text: tr(r, "event"), sub: tr(r, "note") || "" });
      });
      var titleByYear = {};
      (D.albums || []).forEach(function (a) { if (a.year && a.title) titleByYear[a.year] = titleByYear[a.year] || a.title; });
      (window.REG_ALBUMS || []).forEach(function (a) {
        rows.push({
          y: String(a.year), kind: "album", art: a.art || null,
          /* '인순이 (17집)' 처럼 제목에 이미 집 번호가 든 경우가 있다.
             아래 줄에서 '정규 17집'을 또 말하므로 괄호를 떼어 낸다. */
          text: (titleByYear[a.year]
                  ? ("《" + String(titleByYear[a.year]).replace(/\s*\(\s*\d+\s*집\s*\)\s*$/, "") + "》")
                  : ("정규 " + a.no + "집")),
          sub: (document.documentElement.getAttribute("lang") === "en"
                 ? ("Studio album no." + a.no) : ("정규 " + a.no + "집"))
        });
      });
      (notes || []).forEach(function (n) {
        rows.push({
          y: n.song_year || "", kind: "note", text: n.body,
          sub: (n.name ? (n.name + " · ") : "") + (n.song_title ? ("「" + n.song_title + "」") : "")
        });
      });
      /* 최근이 위로. 연도가 없는 줄(곡을 고르지 않은 글)은 맨 위에 둔다. */
      rows.sort(function (a, b) { return (b.y || "9999").localeCompare(a.y || "9999"); });
      list.innerHTML = ""; shown = 0;
      draw();
    }

    function setFilled(n) {
      if (!head) return;
      var total = (SONGS && SONGS.length) || 103;
      head.textContent = n
        ? (document.documentElement.getAttribute("lang") === "en"
            ? (n + " of " + total + " songs carry a memory.")
            : (total + "곡 중 " + n + "곡에 기억이 붙었습니다."))
        : t("sb.firstLine", "아직 아무 곡에도 기억이 붙지 않았습니다. 첫 줄을 기다립니다.");
    }

    if (more) more.addEventListener("click", draw);

    build([]);
    setFilled(0);

    var be = BE();
    if (be) {
      be.listNotes().then(function (res) {
        if (res && res.ok && res.rows && res.rows.length) build(res.rows);
      });
      be.notesFilled().then(function (res) {
        if (res && res.ok && res.rows && res.rows.length) setFilled(res.rows[0].songs || 0);
      });
    }
  }

  /* ---------- 7. 사랑방: 마음 전하기 ----------
     편지는 이 기기의 편지함에만 남는다. 서버가 없으니 그 이상은 할 수 없고,
     할 수 없는 일을 한 것처럼 말하지 않는다. 대신 실제로 닿는 공식 창구로 이어 준다.

  /* ---------- 8. 팬 게시판 ----------
     서버가 붙어 있을 때만 나타난다. 백엔드 없이 '모두의 게시판'은 만들 수 없고,

  /* ---------- 8.5 소식지 구독 ----------
     받을 수단이 있을 때만 주소를 여쭙는다. 서버가 없으면 폼을 숨긴 채 둔다. */
  function initSubscribe() {
    var form = $("#sub-form"), msg = $("#sub-msg"), note = $("#sub-note");
    if (!form) return;
    var be = BE();
    if (!be) return;                 /* 폼은 hidden 그대로, 공식 채널 링크만 보인다 */
    form.hidden = false;
    if (note) note.textContent = t("sub.noteLive",
      "이메일은 소식 발송에만 쓰이며, 언제든 해지하실 수 있습니다.");

    var okT = null;
    function say(text, good) {
      if (!msg) return;
      msg.textContent = text;
      msg.className = good ? "form-ok" : "form-hint";
      msg.hidden = false;
      if (okT) clearTimeout(okT);
      okT = setTimeout(function () { msg.hidden = true; }, 6000);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = $("#sub-email");
      var btn = form.querySelector("[type=submit]");
      var email = (input.value || "").trim();
      if (!email) { input.focus(); return; }
      if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = t("dyn.sending", "보내는 중…"); }
      be.subscribe(email).then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || t("sub.btn", "소식지 신청"); }
        if (res && res.ok) {
          form.reset();
          /* 아직 첫 소식지를 보내지 않았다. '보내드립니다'가 아니라 사실대로. */
          say(t("dyn.subOk", "신청을 받았습니다. 소식지가 준비되면 이 주소로 보내드리겠습니다."), true);
        } else {
          say(beWhy(res), false);
        }
      });
    });
  }


  /* ---------- 9.5 사랑방: 인순이의 편지 + 오늘의 문안 인사 ----------
     리서치 근거: 위버스 모먼트(편지 UI)·팬카페 출석 문화·버블의 짧은 답장 구조·토스 시니어 UT
     (타이핑 대신 선택, 라벨 있는 큰 버튼, 행동마다 명확한 완료 피드백) */
  function initArtistLetter() {
    /* 인순이의 편지 */
    var alBody = $("#al-body");
    var alSec = $("#artist-letter");
    if (alBody && D.artistLetter && D.artistLetter.body) {
      if (alSec) alSec.hidden = false;
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
    }
  }

  /* ---------- 9.4 사랑방: 팬 번호증 ----------
     방문자를 '사랑방의 한 사람'으로 맞이하는 소장용 카드. 이름·번호·가입일이
     이 기기에만 저장되고, 다시 오면 이름으로 반긴다. 실제 회원 DB가 아니라


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

  /* ---------- 10. (삭제) 이메일 구독 폼 ----------
     메일링 시스템이 없으니 '신청되었습니다'는 거짓말이다.
     실제로 구독이 되는 곳(공식 유튜브·인스타그램)으로 바로 보낸다. */



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
    function pickSource() {
      var src = v.querySelector("source");
      if (!src || v.dataset.picked || !src.getAttribute("data-src")) return;
      var conn = navigator.connection || {};
      var small = window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
      var saver = conn.saveData === true || /(^|-)?[23]g$/.test(conn.effectiveType || "");
      /* 작은 화면·데이터 절약 모드에서는 배경 영상을 아예 받지 않는다.
         1MB짜리 영상을 알리지도 않고 내려받는 것은 휴대폰 데이터를 쓰는 분들께
         할 일이 아니고, 대표 이미지가 뜨는 시각도 그만큼 늦어진다.
         같은 장면의 포스터가 이미 떠 있고, 바로 옆에 공식 MV 버튼이 있다. */
      if (small || saver) {
        v.remove();
        /* 영상이 없으면 일시정지 버튼도 있을 이유가 없다 (눌러도 아무 일 없는 버튼) */
        var pb = $(".strip-pause");
        if (pb) pb.remove();
        return;
      }
      v.dataset.picked = "1";
      src.setAttribute("src", src.getAttribute("data-src"));
      v.load();
      tryPlay();
    }
    /* 포스터가 먼저 뜨는 것이 영상보다 중요하다. 첫 화면이 다 그려지고 나서
       한가한 틈에 영상을 받는다 — 안 그러면 몇 MB짜리 영상이 대표 이미지의
       표시 시각을 통째로 늦춘다. */
    /* 포스터가 먼저 뜨는 것이 중요하지만, 너무 오래 미루면 이번엔 영상이
       '가장 큰 그림'으로 늦게 잡혀 체감 로딩이 되레 나빠진다.
       첫 화면이 그려진 직후(다음 프레임)에 바로 받기 시작한다. */
    function later(fn) {
      if (document.readyState === "complete") soon(fn);
      else window.addEventListener("load", function () { soon(fn); }, { once: true });
      function soon(f) { requestAnimationFrame(function () { setTimeout(f, 0); }); }
    }
    /* 실제 프레임이 흐르기 시작하면 포스터 위로 영상이 피어난다 */
    var stage = v.closest(".strip-item--video") || v.parentNode;
    v.addEventListener("playing", function () { if (stage) stage.classList.add("is-playing"); });
    function tryPlay() {
      if (!v.dataset.picked) return;
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* 자동재생 차단 시 포스터 유지 */ });
    }
    later(pickSource);
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
    /* 입장 액션은 사이트에 들어올 때마다 재생한다.
       페이지 사이 이동은 라우터가 <main>만 갈아끼우므로 이 함수가 다시 돌지 않는다.
       즉 '진짜로 사이트를 새로 열었을 때'만 보인다. */

    /* 휴대폰에서는 장수를 줄인다. 2.5초짜리 입장 액션을 위해 전면 사진 여덟 장을
       모바일 데이터로 받게 하는 것은 과하고, 이 사진들이 곧 '가장 큰 그림'으로
       잡혀 체감 로딩까지 늦춘다. 큰 화면에서는 여덟 장 그대로 간다. */
    /* 한 장이 두 겹(흐린 배경 + 잘리지 않은 사진)이라 벗겨내는 대상은
       사진이 아니라 겹 전체다. */
    /* 화면 방향에 맞는 세트만 남긴다.
       가로 화면에 세로 사진을 채우면 58%가 잘리고, 여백을 두면 42%만 찬다.
       (둘 다 실측값) 어느 쪽도 좋지 않으니 애초에 맞는 사진만 보여 준다.
       쓰지 않는 세트는 src를 붙이지 않으므로 내려받지도 않는다. */
    var portrait = window.innerWidth < window.innerHeight;
    var want = portrait ? "port" : "land";
    $all(".ld-shot", box).forEach(function (sh) {
      if (sh.getAttribute("data-orient") !== want) { sh.remove(); return; }
      var im = sh.querySelector("img");
      var d = im && im.getAttribute("data-src");
      if (d && !im.getAttribute("src")) im.setAttribute("src", d);
    });
    var frames = $all(".ld-shot", box);

    /* 안전망: 초광폭 모니터처럼 방향이 맞아도 비율 차가 큰 경우에만 전체를 보여 준다 */
    function fitShots() {
      var va = window.innerWidth / window.innerHeight;
      frames.forEach(function (sh) {
        var im = sh.querySelector("img");
        if (!im || !im.naturalWidth) return;
        var ia = im.naturalWidth / im.naturalHeight;
        var lost = ia > va ? 1 - va / ia : 1 - ia / va;
        var needContain = lost > 0.34;
        sh.classList.toggle("is-contain", needContain);
        /* 여백이 생기는 경우에만 흐린 배경을 만든다 (그전엔 내려받지 않는다) */
        if (needContain && !sh.querySelector(".ld-blur")) {
          var url = sh.getAttribute("data-blur");
          if (url) {
            var bl = document.createElement("span");
            bl.className = "ld-blur";
            bl.style.backgroundImage = 'url("' + url + '")';
            sh.insertBefore(bl, sh.firstChild);
          }
        }
      });
    }
    frames.forEach(function (sh) {
      var im = sh.querySelector("img");
      if (!im) return;
      if (im.complete) fitShots();
      else im.addEventListener("load", fitShots, { once: true });
    });
    fitShots();

    var i = 0;
    var started = false;
    function start() {
      if (started) return;
      started = true;
      run();
    }
    /* 첫 두 장만 기다린다. 나머지는 액션이 도는 동안 따라 들어온다 —
       여덟 장을 모두 기다리면 그만큼 화면이 늦게 열린다. */
    var cap = setTimeout(start, 600);
    Promise.all(frames.slice(0, 2).map(function (sh) {
      var im = sh.querySelector("img");
      return (im && im.decode) ? im.decode().catch(function () {}) : Promise.resolve();
    })).then(function () { clearTimeout(cap); start(); });
    function run() {
    var iv = setInterval(function () {
      if (i < frames.length) {
        /* 마지막 장까지 전부 벗겨 검은 화면과 거위를 드러낸다 */
        frames[i].classList.add("gone"); i++;
      } else {
        clearInterval(iv);
        /* 피날레: 거위가 날갯짓하며 잠시 머문 뒤 화면이 사방으로 갈라지며 열린다 */
        setTimeout(function () { box.classList.add("split"); }, 420);
        setTimeout(function () { if (box.parentNode) box.remove(); }, 1350);
      }
    }, 500);   /* 한 장이 머무는 시간. 전환(0.36s)보다 길어야 사진이 보인다 */
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
      strip.classList.add("is-touched");   /* 한 번 넘기면 안내 문구를 거둔다 */
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
     renderTimeline, renderAnniversary, renderDiscography, initToday, initStream, initFlight, initSubscribe,
     initArtistLetter, initRise].forEach(safe);
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
    /* 인순이 관련 좋은 소식 자동 수집(Google News 일일) 병합 — 소식 페이지·홈에 반영 */
    if (!window.__newsMerged) {
      window.__newsMerged = true;
      fetch("assets/data/live-news.json?" + Date.now())
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.items || !d.items.length) return;
          var have = {};
          (D.news || []).forEach(function (n) { have[norm(tr(n, "title"))] = 1; });
          var added = 0;
          d.items.forEach(function (it) {
            var k = norm(it.title || "");
            if (!k || have[k]) return;
            have[k] = 1;
            D.news.push({
              date: it.date, type: it.type || "소식", title: it.title,
              excerpt: "", source: it.source || "", url: it.url || "", auto: true
            });
            added++;
          });
          if (added) safe(renderNewsPage);
        })
        .catch(function () {});
    }
  }

  function norm(s) { return String(s || "").replace(/[\s'"`·.,!?()\[\]/\-]/g, "").toLowerCase(); }

  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(pageInit);

  function boot() { globalInit(); pageInit(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
