/* ============================================================
   http 로 들어온 요청을 https 로 올려보낸다.

   왜 Worker 에서 하는가 —
   Cloudflare 의 zone 설정 "Always Use HTTPS" 는 Worker 커스텀 도메인에서
   동작하지 않는다. 켜 둔 상태로 실측했는데, 한 번도 요청된 적 없는 경로
   (캐시가 있을 수 없는 경로)조차 http 로 그대로 응답했다:

       http://insooni.com/zz-15874-227  →  404, Location 헤더 없음

   Redirect Rules 도 같은 이유로 안 먹는다. 그래서 여기서 직접 한다.

   왜 이 사이트에 https 강제가 필요한가 —
   사랑방은 팬들이 편지를 쓰는 곳이다. 평문으로 오가면 중간에서 읽힌다.
   그리고 canonical·sitemap 이 전부 https 를 정본으로 선언해 두었는데
   http 로도 같은 내용이 200 으로 열리면 검색엔진 입장에서 같은 페이지가
   두 개가 된다.
   ============================================================ */

/** 들어온 요청이 http 였는지 판정한다.
 *
 *  확실한 근거가 있을 때만 "http" 라고 답한다. 애매하면 "unknown" 을 돌려
 *  리다이렉트하지 않는다 — 오판하면 https 요청을 다시 https 로 넘겨보내는
 *  무한 루프가 되고, 네 도메인이 한꺼번에 죽는다.
 *  못 알아보는 쪽으로 실패하면 최악이 "지금과 같음"이다.
 */
function detectScheme(request) {
  const v = request.headers.get("cf-visitor");
  if (v) {
    try {
      const s = JSON.parse(v).scheme;
      if (s === "http" || s === "https") return s;
    } catch (e) {
      /* 헤더 형식이 바뀌었을 수 있다 — 아래 방법으로 넘어간다 */
    }
  }
  const p = new URL(request.url).protocol;
  if (p === "http:") return "http";
  if (p === "https:") return "https";
  return "unknown";
}

export default {
  async fetch(request, env) {
    const scheme = detectScheme(request);

    if (scheme === "http") {
      const url = new URL(request.url);
      url.protocol = "https:";
      /* 301 — 검색엔진에 "영구히 이쪽" 이라고 알린다.
         302 로 두면 옛 http 주소가 계속 정본 후보로 남는다. */
      return Response.redirect(url.toString(), 301);
    }

    const res = await env.ASSETS.fetch(request);

    /* 판정 근거를 응답에 남긴다. 나중에 리다이렉트가 안 되거나
       반대로 루프가 나면, 이 헤더 하나로 원인을 바로 안다. */
    const out = new Response(res.body, res);
    out.headers.set("x-scheme-seen", scheme);
    return out;
  },
};
