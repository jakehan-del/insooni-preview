/* ============================================================
   INSOONI · 모션 레이어 (v3, 2026-09-14)
   ------------------------------------------------------------
   - 페이지 제목이 마스크 뒤에서 한 줄씩 떠오른다 (편집물의 등장)
   - 액자 진행선(서브페이지) · 카운트업(실측값만)
   커서 링·자석 버튼·패럴랙스·스포트라이트·샤인은 걷었다.
   비욘세 사이트의 힘은 '아무것도 움직이지 않는 사진'에 있다 — 장식 모션은
   사진을 가리는 소음이었고(링 58px 가 내비 글자를 덮었다), 매 pointermove
   마다 레이아웃을 읽었다. 모션 민감 환경에서는 전부 꺼진다.
   ============================================================ */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. 제목 마스크 리빌 — 페이지 제목 하나만 ---------- */
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
      inner.style.transitionDelay = (i * 24) + "ms";
      mask.appendChild(inner);
      el.appendChild(mask);
    });
  }

  function initReveal() {
    if (reduce || !("IntersectionObserver" in window)) return;
    /* 섹션 제목(.section-head h2)은 뺐다 — 부모 .rise 와 겹쳐 같은 글자가
       두 번 움직였고, 14px 라벨에 마스크 리빌은 과했다. */
    var targets = document.querySelectorAll(".page-hero h1");
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

  /* ---------- 2. 액자 진행선 ----------
     서브페이지에서만. 홈은 한 화면이라 진행이라는 개념이 없다.
     상시 액자(.site-frame)의 윗변과 같은 자리에 눕는 1px 선 하나뿐이다. */
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

  /* ---------- 3. 카운트업 ----------
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

  function boot() { initReveal(); initFrameProgress(); initCountUp(); }
  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(boot);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
