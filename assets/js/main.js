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
    var label = ev.kind === "공연" ? "예매 안내" : "자세히";
    if (ev.link && ev.link !== "#") {
      return '<a class="btn btn--ghost btn--sm" href="' + esc(ev.link) + '">' + label + "</a>";
    }
    return '<button type="button" class="btn btn--ghost btn--sm" disabled>' + label + " [준비 중]</button>";
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  /* ---------- 1. 글자 크기 조절 (시니어 접근성) ---------- */
  function initFontSize() {
    var saved = store("insooni_fs") || "1";
    document.documentElement.setAttribute("data-fs", saved);
    $all(".fs-toggle button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.dataset.fs === saved));
      btn.addEventListener("click", function () {
        document.documentElement.setAttribute("data-fs", btn.dataset.fs);
        store("insooni_fs", btn.dataset.fs);
        $all(".fs-toggle button").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
      });
    });
  }

  /* ---------- 2. 모바일 내비게이션 ---------- */
  function initNav() {
    var toggle = $(".nav-toggle"), nav = $(".main-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "메뉴 열기");
        toggle.focus();
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
  function newsCard(item) {
    var a = el("a", "news-item");
    a.href = "news.html";
    a.innerHTML =
      "<time datetime=\"" + esc(item.date) + '">' + fmtDate(item.date) + "</time>" +
      '<span class="badge badge--' + (item.type === "공지" ? "gold" : "wine") + '">' + esc(item.type) + "</span>" +
      "<div><h3>" + esc(item.title) + '</h3><p class="excerpt">' + esc(item.excerpt) + "</p></div>";
    return a;
  }
  function sortedNews() {
    return D.news.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function renderHomeNews() {
    var box = $("#home-news");
    if (!box || !D.news) return;
    sortedNews().slice(0, 4).forEach(function (n) { box.appendChild(newsCard(n)); });
  }
  function renderNewsPage() {
    var box = $("#news-list"), bar = $("#news-filter");
    if (!box || !D.news) return;
    function draw(type) {
      box.innerHTML = "";
      var items = sortedNews().filter(function (n) { return type === "전체" || n.type === type; });
      if (!items.length) { box.appendChild(el("p", "empty-note", "해당 분류의 소식이 아직 없습니다.")); return; }
      items.forEach(function (n) { box.appendChild(newsCard(n)); });
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
  function renderUpcoming() {
    var box = $("#home-schedule");
    if (!box || !D.events) return;
    var now = new Date();
    var todayISO = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    var upcoming = D.events.filter(function (e) { return e.date >= todayISO; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; }).slice(0, 3);
    if (!upcoming.length) { box.appendChild(el("p", "empty-note", "예정된 일정이 곧 공지됩니다.")); return; }
    upcoming.forEach(function (ev) {
      var d = new Date(ev.date + "T00:00:00");
      var row = el("div", "event-row");
      row.innerHTML =
        '<div class="event-date"><span class="d">' + d.getDate() + '</span><span class="m">' + d.getFullYear() + "년 " + (d.getMonth() + 1) + '월</span></div>' +
        '<div class="event-info"><span class="badge badge--' + (ev.kind === "공연" ? "wine" : "gold") + '">' + esc(ev.kind) + "</span> <h3>" + esc(ev.title) + '</h3><p class="where">' + esc(ev.place) + "</p></div>" +
        eventCta(ev);
      box.appendChild(row);
    });
  }

  /* 월간 캘린더 (schedule.html) */
  function renderCalendar() {
    var grid = $("#cal-grid"), title = $("#cal-title");
    if (!grid || !D.events) return;
    var cur = { y: 2026, m: 8 }; // 데모 기준: 2026년 8월 (일정 데이터가 있는 달)
    function draw() {
      grid.innerHTML = "";
      ["일", "월", "화", "수", "목", "금", "토"].forEach(function (d) {
        grid.appendChild(el("div", "dow", d));
      });
      title.textContent = cur.y + "년 " + cur.m + "월";
      var first = new Date(cur.y, cur.m - 1, 1);
      var start = first.getDay();
      var days = new Date(cur.y, cur.m, 0).getDate();
      var prevDays = new Date(cur.y, cur.m - 1, 0).getDate();
      for (var i = 0; i < 42; i++) {
        var cell = el("div", "cal-cell"), num, iso = null;
        if (i < start) { cell.classList.add("other"); num = prevDays - start + 1 + i; }
        else if (i - start + 1 > days) { cell.classList.add("other"); num = i - start + 1 - days; }
        else {
          num = i - start + 1;
          iso = cur.y + "-" + String(cur.m).padStart(2, "0") + "-" + String(num).padStart(2, "0");
          if (i % 7 === 0) cell.classList.add("sun");
        }
        cell.appendChild(el("span", "num", String(num)));
        if (iso) {
          D.events.filter(function (e) { return e.date === iso; }).forEach(function (e) {
            var real = e.link && e.link !== "#";
            var tag = el(real ? "a" : "span", "cal-event" + (e.kind !== "공연" ? " cal-event--gold" : ""), esc(e.title));
            if (real) tag.href = e.link;
            tag.title = e.title + " · " + e.place;
            cell.appendChild(tag);
          });
        }
        grid.appendChild(cell);
      }
    }
    $("#cal-prev").addEventListener("click", function () { cur.m--; if (cur.m < 1) { cur.m = 12; cur.y--; } draw(); });
    $("#cal-next").addEventListener("click", function () { cur.m++; if (cur.m > 12) { cur.m = 1; cur.y++; } draw(); });
    draw();

    var list = $("#event-list");
    if (list) {
      D.events.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (ev) {
        var d = new Date(ev.date + "T00:00:00");
        var row = el("div", "event-row");
        row.innerHTML =
          '<div class="event-date"><span class="d">' + d.getDate() + '</span><span class="m">' + d.getFullYear() + "년 " + (d.getMonth() + 1) + '월</span></div>' +
          '<div class="event-info"><span class="badge badge--' + (ev.kind === "공연" ? "wine" : "gold") + '">' + esc(ev.kind) + "</span> <h3>" + esc(ev.title) + '</h3><p class="where">' + esc(ev.place) + (ev.note ? " · " + esc(ev.note) : "") + "</p></div>" +
          eventCta(ev);
        list.appendChild(row);
      });
    }
  }

  /* ---------- 6. 아카이브: 타임라인 / 디스코그래피 / 영상 ---------- */
  function renderTimeline() {
    var box = $("#timeline");
    if (!box || !D.timeline) return;
    D.timeline.forEach(function (t) {
      var li = el("li", t.milestone ? "milestone" : "");
      li.innerHTML = '<span class="year">' + esc(t.year) + '</span><span class="evt">' + esc(t.event) + "</span>" +
        (t.note ? '<span class="note">' + esc(t.note) + "</span>" : "");
      box.appendChild(li);
    });
  }
  function renderDiscography() {
    var box = $("#discography");
    if (!box || !D.albums) return;
    D.albums.forEach(function (a) {
      var row = el("article", "album-row");
      row.innerHTML =
        '<span class="a-year">' + esc(a.year) + "</span>" +
        '<div><h3 class="a-title">' + esc(a.title) + '</h3><p class="a-note">' + esc(a.note || "") + "</p></div>" +
        '<span class="a-kind">' + esc(a.kind || "앨범") + "</span>";
      box.appendChild(row);
    });
  }
  function renderVideos() {
    var box = $("#videos") || $("#home-videos");
    if (!box || !D.videos) return;
    var items = box.id === "home-videos" ? D.videos.slice(0, 3) : D.videos;
    items.forEach(function (v) {
      var c = el("article", "stage-tile");
      if (v.youtubeId) {
        c.innerHTML =
          '<div class="thumb-embed"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/' + esc(v.youtubeId) + '" title="' + esc(v.title) + '" allowfullscreen></iframe></div>';
      } else {
        c.innerHTML =
          '<span class="t-year">' + esc(v.year || "") + "</span>" +
          '<h3 class="t-title">' + esc(v.title) + "</h3>" +
          '<p class="t-desc">' + esc(v.desc || "") + "</p>" +
          '<p class="t-note">공식 영상 게재 예정</p>';
      }
      box.appendChild(c);
    });
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
      if (!letters.length) { listBox.appendChild(el("p", "empty-note", "첫 번째 편지의 주인공이 되어 주세요.")); return; }
      letters.slice(0, 6).forEach(function (L) {
        var p = el("article", "post");
        p.innerHTML =
          '<div class="post-head"><span class="avatar" aria-hidden="true">' + esc(firstChar(L.name)) + '</span>' +
          '<span class="who">' + esc(L.name || "익명 팬") + '</span><span class="when">' + esc(L.date || "") + "</span></div>" +
          '<p class="post-body">' + esc(L.body) + "</p>";
        listBox.appendChild(p);
      });
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("#letter-name").value.trim() || "익명 팬";
      var body = $("#letter-body").value.trim();
      if (!body) { $("#letter-body").focus(); return; }
      var letters = store(KEY) || [];
      var now = new Date();
      letters.unshift({ name: name, body: body, date: now.getFullYear() + ". " + (now.getMonth() + 1) + ". " + now.getDate() + "." });
      store(KEY, letters);
      form.reset();
      var okMsg = $("#letter-ok");
      if (okMsg) { okMsg.hidden = false; setTimeout(function () { okMsg.hidden = true; }, 4000); }
      draw();
    });
    draw();
  }

  /* ---------- 8. 사랑방: 게시판 ---------- */
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
          '<div class="post-head"><span class="avatar" aria-hidden="true">' + esc(P.artist ? "仁" : firstChar(P.name)) + "</span>" +
          '<span class="who">' + esc(P.name) + "</span>" +
          (P.artist ? '<span class="badge badge--gold">공식</span>' : "") +
          '<span class="when">' + esc(P.date || "") + "</span></div>" +
          '<p class="post-body">' + esc(P.body) + "</p>" +
          '<div class="post-actions">' +
          '<button type="button" data-like="' + esc(id) + '" aria-pressed="' + liked + '">응원 ' + likes + "</button>" +
          '<button type="button" data-report="' + esc(id) + '">신고</button></div>';
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
        alert("신고가 접수되었습니다. 운영진 검토 후 처리됩니다.\n(프로토타입 데모: 실제 서비스에서는 신고 사유 선택 후 관리자 큐로 전송됩니다)");
      }
    });
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var name = $("#post-name").value.trim() || "익명 팬";
        var body = $("#post-body").value.trim();
        if (!body) { $("#post-body").focus(); return; }
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
        ? "보기를 누르면 바로 투표됩니다. (1인 1표)"
        : "투표해 주셔서 감사합니다! 총 " + total + "명 참여 (데모 수치)";
    }
    draw();
  }

  /* ---------- 10. 구독 폼 (데모) ---------- */
  function initSubscribe() {
    $all(".subscribe form").forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var input = form.querySelector("input[type=email]");
        var msg = form.parentElement.querySelector(".subscribe-ok");
        if (msg) { msg.hidden = false; }
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
    $all("[data-approve]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest("tr");
        row.querySelector(".badge").outerHTML = '<span class="badge badge--ok">게시 승인</span>';
        btn.closest("td").innerHTML = '<span class="badge badge--ok">처리 완료</span>';
      });
    });
    $all("[data-reject]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest("tr");
        row.querySelector(".badge").outerHTML = '<span class="badge badge--danger">숨김 처리</span>';
        btn.closest("td").innerHTML = '<span class="badge badge--danger">처리 완료</span>';
      });
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
    });
    if (store("insooni_lang") === "en") apply("en");
  }

  /* ---------- 부팅 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    initFontSize();
    initLang();
    initNav();
    initScrollState();
    initReveal();
    renderHomeNews();
    renderNewsPage();
    renderUpcoming();
    renderCalendar();
    renderTimeline();
    renderDiscography();
    renderVideos();
    initLetters();
    initBoard();
    initPoll();
    initSubscribe();
    initAdmin();
  });
})();
