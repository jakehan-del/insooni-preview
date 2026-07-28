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
        '<div class="event-info"><span class="badge badge--' + (ev.kind === "공연" ? "gold" : "wine") + '">' + esc(kindLabel(ev.kind)) + "</span> <h3>" + esc(tr(ev, "title")) + '</h3><p class="where">' + esc(tr(ev, "place")) + (ev.note ? " · " + esc(ev.note) : "") + "</p></div>" +
        eventCta(ev);
      list.appendChild(row);
    });
  }

  /* ---------- 6. 아카이브: 타임라인 / 디스코그래피 / 영상 ---------- */
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
  function renderDiscography() {
    var box = $("#discography");
    if (!box || !D.albums) return;
    /* 전체 인덱스: 상세 자료 없는 릴리즈는 타이포 한 줄로 */
    var idx = $("#disco-index");
    var rich = [], plain = [];
    D.albums.forEach(function (a) { (a.tracks && a.tracks.length ? rich : plain).push(a); });
    if (idx) {
      plain.forEach(function (a) {
        var r = el("p", "di-row");
        var lk = (a.links || []).map(function (l) {
          return '<a class="di-link" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + "</a>";
        }).join("");
        if (!lk) {
          var su = "https://music.youtube.com/search?q=" + encodeURIComponent("인순이 " + a.title.replace(/\s*\(.*\)$/, ""));
          lk = '<a class="di-link" href="' + esc(su) + '" target="_blank" rel="noopener">' + t("rel.find", "듣기") + "</a>";
        }
        r.innerHTML = '<span class="di-year">' + esc(a.year) + "</span>" +
          '<span class="di-title">' + esc(a.title) + "</span>" +
          (lk ? '<span class="di-links">' + lk + "</span>" : '<span class="di-kind">' + esc(a.kind || "") + "</span>");
        idx.appendChild(r);
      });
    }
    var list = idx ? rich : D.albums;
    list.forEach(function (a, i) {
      var row = el("button", "album-row");
      row.type = "button";
      row.setAttribute("aria-expanded", "false");
      row.innerHTML =
        (a.art ? '<img class="a-art" src="' + esc(a.art) + '" alt="" loading="lazy">' : '<span class="a-art a-art--empty" aria-hidden="true"></span>') +
        '<span class="a-year">' + esc(a.year) + "</span>" +
        '<div><span class="a-title">' + esc(a.title) + '</span><span class="a-note">' + esc(a.note || "") + "</span></div>" +
        '<span class="a-kind">' + esc(a.kind || "앨범") + "</span>";
      var detail = el("div", "album-detail");
      detail.hidden = true;
      var artistQ = ((a.kind || "") + (a.title || "")).indexOf("희자매") >= 0 || a.kind === "그룹" ? "희자매" : (a.kind === "골든걸스" ? "골든걸스" : "인순이");
      var tracksHtml = (a.tracks && a.tracks.length)
        ? '<ol class="a-tracks">' + a.tracks.map(function (trk) {
            var q = "https://music.youtube.com/search?q=" + encodeURIComponent(artistQ + " " + trk.replace(/\s*\((Inst\.|경음악|MR)\)$/, ""));
            return '<li><a class="tr-link" href="' + esc(q) + '" target="_blank" rel="noopener"><span class="tr-name">' + esc(trk) + '</span><span class="tr-play" aria-hidden="true">듣기 ▶</span></a></li>';
          }).join("") + "</ol>"
        : "<p>" + t("rel.tbd", "공식 자료 확인 중입니다.") + "</p>";
      var creditsHtml = a.credits
        ? '<p class="a-credits">' + esc(a.credits) + "</p>"
        : "<p>" + t("rel.tbd", "공식 자료 확인 중입니다.") + "</p>";
      var searchUrl = "https://music.youtube.com/search?q=" + encodeURIComponent("인순이 " + a.title.replace(/\s*\(.*\)$/, ""));
      var linksHtml = (a.links && a.links.length)
        ? '<p class="a-links">' + a.links.map(function (l) {
            return '<a class="a-link" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + ' <span aria-hidden="true">↗</span></a>';
          }).join("") + "</p>"
        : '<p class="a-links"><a class="a-link" href="' + esc(searchUrl) + '" target="_blank" rel="noopener">' + t("rel.search", "YouTube Music에서 찾기") + ' <span aria-hidden="true">↗</span></a></p>';
      detail.innerHTML =
        "<div><h4>" + t("rel.tracks", "수록곡") + "</h4>" + tracksHtml + "</div>" +
        "<div><h4>" + t("rel.credits", "크레딧") + "</h4>" + creditsHtml + "</div>" +
        "<div><h4>" + t("rel.listen", "감상") + "</h4>" + linksHtml + "</div>";
      row.addEventListener("click", function () {
        var open = detail.hidden;
        detail.hidden = !open;
        row.setAttribute("aria-expanded", String(open));
      });
      box.appendChild(row);
      box.appendChild(detail);
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
      box.appendChild(c);
    });
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
      html += '<div class="recap-video recap-video--embed"><iframe id="recap-clip-frame" src="https://www.youtube-nocookie.com/embed/' + esc(r.clips[0].id) + '?rel=0&modestbranding=1" title="' + esc(tr(r.clips[0], "title") || r.title) + '" allow="autoplay; encrypted-media; fullscreen" allowfullscreen loading="lazy"></iframe></div>';
      if (r.clips.length > 1) {
        html += '<div class="recap-clips" role="group" aria-label="' + t("recap.clips", "무대 클립 선택") + '">';
        r.clips.forEach(function (cl, ci) {
          html += '<button type="button" class="recap-clip' + (ci === 0 ? " is-on" : "") + '" data-cid="' + esc(cl.id) + '" data-ct="' + esc(tr(cl, "title")) + '">' + esc(tr(cl, "title")) + "</button>";
        });
        html += "</div>";
      }
    } else if (r.youtubeId) {
      html += '<div class="recap-video recap-video--embed"><iframe src="https://www.youtube-nocookie.com/embed/' + esc(r.youtubeId) + '?rel=0&modestbranding=1" title="' + esc(r.title) + '" allow="encrypted-media; fullscreen" allowfullscreen loading="lazy"></iframe></div>';
    } else if (r.video) {
      html += '<div class="recap-video"><video src="' + esc(r.video) + '"' + (r.poster ? ' poster="' + esc(r.poster) + '"' : "") + " controls playsinline preload=\"metadata\"></video></div>";
    }
    inner.innerHTML = html;
    /* 클립 선택 → 임베드 교체 */
    var clipBtns = inner.querySelectorAll(".recap-clip");
    if (clipBtns.length) {
      var clipFrame = inner.querySelector("#recap-clip-frame");
      clipBtns.forEach(function (b) {
        b.addEventListener("click", function () {
          inner.querySelectorAll(".recap-clip.is-on").forEach(function (x) { x.classList.remove("is-on"); });
          b.classList.add("is-on");
          clipFrame.src = "https://www.youtube-nocookie.com/embed/" + b.getAttribute("data-cid") + "?rel=0&modestbranding=1&autoplay=1";
          clipFrame.title = b.getAttribute("data-ct");
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
          '<span class="arch-cap">' + esc(a.year) + " · " + esc(kindCat(a.cat)) + "</span>";
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
      $(".lightbox-frame", lightboxEl).innerHTML = "";
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
    return lightboxEl;
  }
  function openLightbox(videoId, title, opener) {
    var box = ensureLightbox();
    box.dataset.mode = "video";
    $(".lb-prev", box).hidden = true;
    $(".lb-next", box).hidden = true;
    lightboxOpener = opener || null;
    box.setAttribute("aria-label", title + " 영상 재생");
    $(".lightbox-caption", box).textContent = title + " · INSOONI OFFICIAL";
    $(".lightbox-frame", box).innerHTML =
      '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(videoId) + '?autoplay=1&rel=0&modestbranding=1" title="' + esc(title) + '" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
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
    var box = $("#poll");
    if (!box || !D.poll) return;
    var KEY = "insooni_poll_" + D.poll.id;
    function draw() {
      box.innerHTML = "";
      var votedIdx = store(KEY);
      var counts = D.poll.options.map(function (o, i) {
        return o.base + (votedIdx === i ? 1 : 0);
      });
      var total = counts.reduce(function (a, b) { return a + b; }, 0);
      D.poll.options.forEach(function (o, i) {
        var wrap = el("div", "poll-option");
        if (votedIdx === null || votedIdx === undefined) {
          var b = el("button", "", esc(o.label));
          b.type = "button";
          b.addEventListener("click", function () { store(KEY, i); draw(); });
          wrap.appendChild(b);
        } else {
          var pct = total ? Math.round(counts[i] / total * 100) : 0;
          wrap.innerHTML =
            '<div class="bar-wrap"><span class="bar" style="width:' + pct + '%"></span>' +
            '<span class="bar-label"><span>' + esc(o.label) + (votedIdx === i ? " ✓" : "") + "</span><strong>" + pct + "%</strong></span></div>";
        }
        box.appendChild(wrap);
      });
      var note = $("#poll-note");
      if (note) note.textContent = (votedIdx === null || votedIdx === undefined)
        ? t("dyn.pollHint", "보기를 누르면 바로 투표됩니다. (1인 1표)")
        : t("dyn.pollThanks", "투표해 주셔서 감사합니다! 총 ") + total + "명 참여 (데모 수치)";
    }
    draw();
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
      function drawStamp() {
        var s = store(SKEY);
        if (s && s.last === today()) {
          stampBtn.disabled = true;
          stampBtn.textContent = t("comm.stampDone", "오늘 문안 인사를 드렸습니다");
          stampState.textContent = t("dyn.streakA", "연속 ") + s.streak + t("dyn.streakB", "일째 · 지금까지 ") + s.total + t("dyn.streakC", "번 다녀가셨어요");
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

  /* ---------- 언어 전환 (한/영) ---------- */
  function initLang() {
    var dict = window.I18N_EN || {};
    var btn = $(".lang-toggle");
    if (!btn) return;
    function apply(lang) {
      document.documentElement.setAttribute("lang", lang);
      btn.textContent = lang === "ko" ? "EN" : "한국어";
      btn.setAttribute("aria-label", lang === "ko" ? "Switch to English" : "한국어로 보기");
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
      var koIds = ["home-news", "home-schedule", "home-videos", "news-list", "event-list", "cal-grid", "disco-index", "discography", "videos", "letter-list", "board-list", "poll"];
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
      store("insooni_lang", lang);
    }
    btn.addEventListener("click", function () {
      apply(document.documentElement.getAttribute("lang") === "ko" ? "en" : "ko");
      /* 데이터 렌더 콘텐츠까지 완전 전환: 저장 후 재로드 */
      location.reload();
    });
    if (store("insooni_lang") === "en") apply("en");
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
        setTimeout(function () { if (box.parentNode) box.remove(); }, 1650);
      }
    }, 300);
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

  /* ---------- 부팅 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initLang();
    renderEventList();
    initIntro();
    initLoader();
    initStrip();
    initVhero();
    renderArchive();
    renderPastRecaps();
    initVideoButtons();
    initNav();
    initScrollState();
    initReveal();
    renderNewsPage();
    renderCalendar();
    renderTimeline();
    renderDiscography();
    initLetters();
    initBoard();
    initPoll();
    initSarangbang();
    initSubscribe();
    initAdmin();
  });
})();
