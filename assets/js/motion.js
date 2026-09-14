/* ============================================================
   INSOONI · 모션 레이어
   ------------------------------------------------------------
   - 제목이 마스크 뒤에서 한 줄씩 떠오른다 (편집물의 등장)
   - 데스크톱 전용 커서: 링크 위에서 부풀고, 버튼은 자석처럼 끌린다
   - 사진은 스크롤에 따라 아주 미세하게 밀린다
   전부 순수 CSS/JS. 모션 민감·터치 환경에서는 전부 꺼진다.
   ============================================================ */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- 1. 제목 마스크 리빌 ---------- */
  function splitLines(el) {
    if (el.dataset.split) return;
    var text = el.textContent.trim();
    if (!text || text.length > 90 || el.querySelector("img, svg, button, a")) return;
    el.dataset.split = "1";
    /* 단어 단위로 감싸 마스크 안에서 올라오게 한다 (한글은 어절 단위가 자연스럽다) */
    var words = text.split(/(\s+)/);
    el.textContent = "";
    words.forEach(function (w, i) {
      if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(" ")); return; }
      var mask = document.createElement("span");
      mask.className = "rv-mask";
      var inner = document.createElement("span");
      inner.className = "rv-word";
      inner.textContent = w;
      inner.style.transitionDelay = (i * 34) + "ms";
      mask.appendChild(inner);
      el.appendChild(mask);
    });
  }

  function initReveal() {
    if (reduce || !("IntersectionObserver" in window)) return;
    var targets = document.querySelectorAll(".page-hero h1, #h-profile, .section-head h2");
    if (!targets.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add("rv-in");
        io.unobserve(en.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.15 });
    targets.forEach(function (el) {
      splitLines(el);
      if (!el.dataset.split) return;
      el.classList.add("rv");
      io.observe(el);
    });
    /* 안전망: 관측기가 못 돌아도 글이 사라져 있으면 안 된다 */
    setTimeout(function () {
      targets.forEach(function (el) { el.classList.add("rv-in"); });
    }, 3500);
  }

  /* ---------- 2. 커서 ---------- */
  function initCursor() {
    if (reduce || !fine) return;
    var dot = document.createElement("div");
    dot.className = "cursor-dot";
    var ring = document.createElement("div");
    ring.className = "cursor-ring";
    document.body.appendChild(dot);
    document.body.appendChild(ring);
    document.documentElement.classList.add("has-cursor");
    var mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    /* 마우스가 움직이기 전에는 보이지 않아야 한다.
       그러지 않으면 페이지를 연 순간 화면 한가운데에 동그라미가 덩그러니 떠 있다. */
    dot.style.opacity = "0"; ring.style.opacity = "0";
    document.addEventListener("pointermove", function (e) {
      if (dot.style.opacity === "0") { dot.style.opacity = ""; ring.style.opacity = ""; }
      mx = e.clientX; my = e.clientY;
      dot.style.transform = "translate(" + mx + "px," + my + "px)";
    }, { passive: true });
    (function loop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = "translate(" + rx + "px," + ry + "px)";
      requestAnimationFrame(loop);
    })();
    var HOT = "a, button, .show-cell, .aw-cell, .arch-item, input, select, textarea, summary";
    document.addEventListener("pointerover", function (e) {
      if (e.target.closest && e.target.closest(HOT)) ring.classList.add("is-hot");
    }, { passive: true });
    document.addEventListener("pointerout", function (e) {
      if (e.target.closest && e.target.closest(HOT)) ring.classList.remove("is-hot");
    }, { passive: true });
    /* 터치가 한 번이라도 감지되면 커서는 거둔다 —
       터치 되는 노트북·태블릿처럼 두 입력을 다 가진 기기를 위한 안전장치.
       (순수 터치 기기는 위의 pointer:fine 조건에서 이미 제외된다) */
    window.addEventListener("touchstart", function once() {
      window.removeEventListener("touchstart", once);
      dot.remove(); ring.remove();
      document.documentElement.classList.remove("has-cursor");
    }, { passive: true, once: true });
    document.addEventListener("pointerdown", function () { ring.classList.add("is-down"); }, { passive: true });
    document.addEventListener("pointerup", function () { ring.classList.remove("is-down"); }, { passive: true });
  }

  /* ---------- 3. 자석 버튼 ---------- */
  function initMagnetic() {
    if (reduce || !fine) return;
    document.addEventListener("pointermove", function (e) {
      var b = e.target.closest ? e.target.closest(".btn, .aw-cell, .cheer-chips button") : null;
      if (!b) return;
      var r = b.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
      var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
      b.style.transform = "translate(" + (dx * 7).toFixed(1) + "px," + (dy * 6).toFixed(1) + "px)";
      b.dataset.mag = "1";
    }, { passive: true });
    document.addEventListener("pointerout", function (e) {
      var b = e.target.closest ? e.target.closest(".btn, .aw-cell, .cheer-chips button") : null;
      if (b && b.dataset.mag) { b.style.transform = ""; delete b.dataset.mag; }
    }, { passive: true });
  }

  /* ---------- 4. 사진 미세 패럴랙스 ---------- */
  function initParallax() {
    if (reduce || !("IntersectionObserver" in window)) return;
    var els = [].slice.call(document.querySelectorAll(".frame img, .thumb img, .hero-figure img"));
    if (!els.length) return;
    var active = [];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { if (active.indexOf(en.target) < 0) active.push(en.target); }
        else { var i = active.indexOf(en.target); if (i >= 0) active.splice(i, 1); }
      });
    }, { rootMargin: "20% 0px" });
    els.forEach(function (el) { io.observe(el); el.style.willChange = "transform"; });
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var vh = innerHeight;
        active.forEach(function (el) {
          var r = el.getBoundingClientRect();
          var p = (r.top + r.height / 2 - vh / 2) / vh;   /* -1 ~ 1 */
          el.style.transform = "scale(1.06) translateY(" + (p * -14).toFixed(1) + "px)";
        });
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- 5. 카드 스포트라이트 좌표 ----------
     빛의 위치만 JS 가 쓴다. 그리는 건 CSS(::after 라디얼)가 한다.
     위임 한 개로 끝나 카드가 몇 백 개여도 리스너는 하나다. */
  var SPOT = ".card, .arch-item, .show-cell, .aw-cell, .old-card, .recap-item";
  function initSpotlight() {
    if (!fine) return;
    document.addEventListener("pointermove", function (e) {
      var c = e.target.closest ? e.target.closest(SPOT) : null;
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty("--sx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
      c.style.setProperty("--sy", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
    }, { passive: true });
  }

  /* ---------- 6. 액자 진행선 ----------
     서브페이지에서만. 홈은 한 화면이라 진행이라는 개념이 없다. */
  function initFrameProgress() {
    if (document.body.classList.contains("home")) return;
    if (document.querySelector(".frame-progress")) return;
    var bar = document.createElement("div");
    bar.className = "frame-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    var ticking = false;
    function draw() {
      var h = document.documentElement.scrollHeight - innerHeight;
      var p = h > 0 ? Math.min(1, Math.max(0, (scrollY || document.documentElement.scrollTop) / h)) : 0;
      bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (ticking) return; ticking = true; requestAnimationFrame(draw);
    }, { passive: true });
    draw();
  }

  /* ---------- 7. 카운트업 ----------
     data-countup 의 값은 항상 데이터 실측값이다 — 여기서는 숫자를
     만들지 않고 굴리기만 한다. 모션이 꺼져 있으면 즉시 최종값. */
  function initCountUp() {
    var els = [].slice.call(document.querySelectorAll("[data-countup]:not([data-cu-done])"));
    if (!els.length) return;
    function settle(el) { el.textContent = el.getAttribute("data-countup"); el.dataset.cuDone = "1"; }
    if (reduce || !("IntersectionObserver" in window)) { els.forEach(settle); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var el = en.target, target = parseInt(el.getAttribute("data-countup"), 10);
        if (!isFinite(target)) { settle(el); return; }
        el.dataset.cuDone = "1";
        var t0 = null;
        function step(now) {
          if (!t0) t0 = now;
          var u = Math.min(1, (now - t0) / 900);
          var e2 = 1 - Math.pow(1 - u, 3);
          el.textContent = String(Math.round(target * e2));
          if (u < 1) requestAnimationFrame(step); else settle(el);
        }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    els.forEach(function (el) { io.observe(el); });
    /* 안전망 — 관측이 어긋나도 숫자는 반드시 온전해야 한다 */
    setTimeout(function () { els.forEach(function (el) { if (!el.dataset.cuDone) settle(el); }); }, 4000);
  }

  /* ---------- 8. 신곡 제목 샤인 — 단 한 번 ---------- */
  function initSheen() {
    if (reduce) return;
    var t = document.querySelector("body.home .sc-title");
    if (!t || t.dataset.sheen) return;
    t.dataset.sheen = "1";
    /* 도입부가 끝나 화면이 드러난 뒤에 지나가야 보인다 */
    var delay = document.documentElement.classList.contains("is-intro") ? 9000 : 600;
    setTimeout(function () { t.classList.add("sheen-once"); }, delay);
    /* 한 번 지나가면 클래스를 거둔다 — background-clip 을 평소엔 두지 않는다 */
    setTimeout(function () { t.classList.remove("sheen-once"); }, delay + 2600);
  }

  function boot() { initReveal(); initParallax(); initFrameProgress(); initCountUp(); initSheen(); }
  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(boot);
  function bootOnce() { initCursor(); initMagnetic(); initSpotlight(); boot(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootOnce);
  else bootOnce();
})();
