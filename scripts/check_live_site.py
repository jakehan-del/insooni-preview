"""라이브 insooni.com 을 사람처럼 훑는다 — 읽기만 한다(폼 제출·클릭 없음).
실행: playwright 가 있는 파이썬으로 `python scripts/check_live_site.py` (서버 띄울 필요 없음)
검사기 자체 확인(2026-10-01): 깨진 이미지·404·콘솔 오류·예외·가로 넘침을 일부러 심었을 때 5종 모두 잡았다.

페이지마다 폰(375)·데스크톱(1280)으로 열고 끝까지 천천히 내려
lazy 이미지를 깨운 뒤 확인한다:
  콘솔 오류 · 페이지 예외 · 4xx/5xx 응답 · 깨진 이미지 · 가로 넘침
그리고 모든 내부 링크를 한 번씩 요청해 죽은 링크를 찾는다.
"""
import json, sys, urllib.request, urllib.error
from urllib.parse import urljoin, urlparse
from playwright.sync_api import sync_playwright

BASE = "https://insooni.com/"
PAGES = ["", "about.html", "music.html", "schedule.html", "news.html", "archive.html",
         "community.html", "haemil.html", "privacy.html", "terms.html", "admin.html", "404.html"]
VIEWS = {"폰": dict(viewport={"width": 375, "height": 812}, is_mobile=True, has_touch=True,
                   device_scale_factor=2),
         "PC": dict(viewport={"width": 1280, "height": 800})}

problems, links = [], set()

def note(view, page, kind, detail):
    problems.append((view, page or "index", kind, detail))

with sync_playwright() as p:
    br = p.chromium.launch()
    for vname, opts in VIEWS.items():
        ctx = br.new_context(locale="ko-KR", **opts)
        for path in PAGES:
            pg = ctx.new_page()
            url = BASE + path
            pg.on("console", lambda m, v=vname, pa=path:
                  m.type == "error" and note(v, pa, "콘솔", m.text[:160]))
            pg.on("pageerror", lambda e, v=vname, pa=path: note(v, pa, "예외", str(e)[:160]))
            def on_resp(r, v=vname, pa=path):
                # 404.html 자체는 404 가 정상이다
                if r.status >= 400 and not (pa == "404.html" and r.url.rstrip("/").endswith("404.html")):
                    note(v, pa, "HTTP %d" % r.status, r.url[:140])
            pg.on("response", on_resp)
            pg.on("requestfailed", lambda r, v=vname, pa=path:
                  note(v, pa, "요청실패", "%s %s" % (r.failure, r.url[:120])))
            try:
                pg.goto(url, wait_until="networkidle", timeout=45000)
            except Exception as e:
                note(vname, path, "열기실패", type(e).__name__); pg.close(); continue
            # 끝까지 천천히 내려 lazy 이미지를 깨운다
            h = pg.evaluate("document.documentElement.scrollHeight")
            y = 0
            while y < h:
                y += 600
                pg.evaluate("window.scrollTo(0, %d)" % y)
                pg.wait_for_timeout(120)
                h = pg.evaluate("document.documentElement.scrollHeight")
            pg.wait_for_timeout(1500)
            info = pg.evaluate("""() => {
              const broken = [...document.images]
                .filter(i => i.complete && i.naturalWidth === 0 && i.currentSrc)
                .map(i => i.currentSrc);
              const de = document.documentElement;
              const over = de.scrollWidth - de.clientWidth;
              // 넘친 범인 찾기: 화면 밖으로 나간 보이는 요소
              const culprits = over > 1 ? [...document.querySelectorAll('body *')].filter(e => {
                const r = e.getBoundingClientRect();
                return r.width > 0 && r.right > de.clientWidth + 1 && getComputedStyle(e).position !== 'fixed';
              }).slice(0, 3).map(e => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '')) : [];
              const hrefs = [...document.querySelectorAll('a[href]')].map(a => a.href);
              return {broken, over, culprits, hrefs, title: document.title};
            }""")
            for b in info["broken"]:
                note(vname, path, "깨진이미지", b[:140])
            if info["over"] > 1:
                note(vname, path, "가로넘침 %dpx" % info["over"], ", ".join(info["culprits"]))
            for hr in info["hrefs"]:
                u = urlparse(hr)
                if u.netloc in ("insooni.com", "www.insooni.com"):
                    links.add(hr.split("#")[0])
            pg.close()
        ctx.close()
    br.close()

# 내부 링크 전수 확인
dead = []
for l in sorted(links):
    req = urllib.request.Request(l, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            code = r.status
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception as e:
        code = type(e).__name__
    if code != 200:
        dead.append((code, l))

print("페이지 %d × 화면 %d · 내부 링크 %d개 확인" % (len(PAGES), len(VIEWS), len(links)))
seen = set()
for v, pa, k, d in problems:
    key = (pa, k, d)
    tag = "폰+PC" if any(x == (o, pa, k, d) for o in VIEWS for x in [(o, pa, k, d)] if (o, pa, k, d) in [(q[0], q[1], q[2], q[3]) for q in problems] and o != v) else v
    if key in seen: continue
    seen.add(key)
    print("  ✗ [%s] %-14s %-12s %s" % (tag, pa, k, d))
for c, l in dead:
    print("  ✗ 죽은링크 %s  %s" % (c, l))
if not problems and not dead:
    print("  ✓ 문제 0")
sys.exit(1 if (problems or dead) else 0)
