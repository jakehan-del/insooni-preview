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
    document.addEventListener("pointermove", function (e) {
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

  function boot() { initReveal(); initParallax(); }
  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(boot);
  function bootOnce() { initCursor(); initMagnetic(); boot(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootOnce);
  else bootOnce();
})();
