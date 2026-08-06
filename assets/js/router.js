/* ============================================================
   INSOONI · 페이지 전환 라우터
   ------------------------------------------------------------
   같은 사이트 안의 이동은 문서를 새로 띄우지 않고 <main>만 갈아끼운다.
   덕분에 (1) 라디오가 끊기지 않고 (2) 전환이 영화처럼 이어진다.
   JS가 없거나 실패하면 평범한 링크 이동으로 되돌아간다.
   ============================================================ */
(function () {
  "use strict";
  if (!window.fetch || !window.history || !window.DOMParser) return;

  var BUSY = false;
  var cache = {};

  function samePage(a, b) {
    return a.pathname === b.pathname && a.search === b.search;
  }
  function internal(url) {
    return url.origin === location.origin && /\.html$|\/$/.test(url.pathname);
  }

  /* 확장자를 떼고 비교한다.
     호스팅(Cloudflare)이 /about.html 을 /about 으로 넘겨보내므로, 주소창으로
     직접 열린 페이지의 pathname 에는 .html 이 없다. 반면 헤더 링크는 여전히
     "about.html" 이다(라우터가 .html 만 가로채기 때문에 그대로 둔다).
     그냥 비교하면 직접 열린 페이지에서 현재 메뉴 표시가 하나도 안 켜진다. */
  function norm(s) {
    return (s || "").replace(/\.html$/, "") || "index";
  }

  function setActive(path) {
    var file = norm(path.split("/").pop() || "index.html");
    document.querySelectorAll(".site-header a[href]").forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href || href.indexOf("http") === 0) return;
      if (norm(href) === file) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function swap(html, url) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var nextMain = doc.getElementById("main");
    var curMain = document.getElementById("main");
    if (!nextMain || !curMain) { location.href = url.href; return false; }
    document.title = doc.title;
    curMain.replaceWith(nextMain);
    /* 홈 전용 클래스 (필름스트립·코너 푸터) 동기화 */
    document.body.className = doc.body.className;
    /* 푸터도 페이지마다 다를 수 있어 교체 */
    var nf = doc.querySelector(".footer-min"), cf = document.querySelector(".footer-min");
    if (nf && cf) cf.replaceWith(nf);
    setActive(url.pathname);
    /* 각 모듈이 등록한 페이지 초기화 훅 재실행 */
    (window.INSOONI_PAGE_INIT || []).forEach(function (fn) {
      try { fn(); } catch (e) {}
    });
    window.scrollTo(0, 0);
    /* 새 콘텐츠에 포커스를 옮겨 스크린리더에 전환을 알린다 */
    var h = document.querySelector("#main h1, #main h2");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    return true;
  }

  function go(url, push) {
    if (BUSY) return;
    BUSY = true;
    document.documentElement.classList.add("is-navigating");
    var p = cache[url.href]
      ? Promise.resolve(cache[url.href])
      : fetch(url.href, { credentials: "same-origin" }).then(function (r) {
          if (!r.ok) throw new Error("bad status");
          return r.text();
        }).then(function (t) { cache[url.href] = t; return t; });

    p.then(function (html) {
      function apply() { swap(html, url); }
      if (document.startViewTransition) {
        document.startViewTransition(apply).finished.finally(done);
      } else { apply(); done(); }
      if (push) history.pushState({ url: url.href }, "", url.href);
    }).catch(function () {
      location.href = url.href;
    });

    function done() {
      BUSY = false;
      document.documentElement.classList.remove("is-navigating");
    }
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    var url;
    try { url = new URL(a.href); } catch (err) { return; }
    if (!internal(url)) return;
    if (samePage(url, location)) return;           /* 같은 페이지 앵커는 브라우저에 맡긴다 */
    if (url.hash && url.pathname === location.pathname) return;
    e.preventDefault();
    go(url, true);
  });

  window.addEventListener("popstate", function () {
    go(new URL(location.href), false);
  });

  /* 마우스를 올린 링크를 미리 받아 두면 전환이 즉시 일어난다 */
  document.addEventListener("pointerover", function (e) {
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var url;
    try { url = new URL(a.href); } catch (err) { return; }
    if (!internal(url) || cache[url.href] || samePage(url, location)) return;
    fetch(url.href, { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (t) { if (t) cache[url.href] = t; })
      .catch(function () {});
  }, { passive: true });
})();
