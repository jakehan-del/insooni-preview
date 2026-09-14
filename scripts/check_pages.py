# 실행: 사이트 루트에서 `python3 -m http.server 8908` 을 띄운 뒤
#       playwright 가 있는 파이썬으로 이 파일을 돌린다 (scripts/verify.py 와 같은 환경).
# 왜 저장소에 두나: 임시 폴더에 두었던 검사기가 두 달 사이 두 번 증발했다.
# 전수 검사 (재작성 2026-09-14, 메모리 사양 그대로):
# 5뷰포트 x 10페이지 — 헤더 거위 수 규칙 · 로더 정리 · is-intro 해제 ·
# 가로넘침 · 헤더 불투명 · JS 오류
import sys
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8908/"
PAGES = ["index","about","music","schedule","news","archive","haemil","community","privacy","terms"]
VIEWS = [("데스크톱",1440,900),("노트북",1280,800),("태블릿",900,1200),("폰",375,812),("작은폰",320,640)]
fails = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for vname, vw, vh in VIEWS:
        pg = b.new_page(viewport={"width":vw,"height":vh})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:110]))
        for name in PAGES:
            del errs[:]
            pg.goto(B+name+".html", wait_until="networkidle", timeout=60000)
            pg.wait_for_timeout(9600 if name == "index" else 2600)
            d = pg.evaluate("""() => {
              const seen = el => { if (!el) return false;
                const r = el.getBoundingClientRect();
                if (r.width < 1 || r.height < 1) return false;
                return el.checkVisibility ? el.checkVisibility({checkVisibilityCSS:true}) : true; };
              const nav = document.querySelector('.site-header .mark-goose');
              const brand = document.querySelector('.site-header .brand-mark');
              return { geese: [nav,brand].filter(seen).length,
                nav: seen(nav), brand: seen(brand),
                loaderGone: !document.querySelector('#loader'),
                birdsGone: document.querySelectorAll('.ld-goose').length === 0,
                isIntro: document.documentElement.classList.contains('is-intro'),
                overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
                headerOp: getComputedStyle(document.querySelector('.site-header')).opacity };
            }""")
            bad = []
            if d["geese"] != (0 if vw <= 720 else 1): bad.append("헤더 거위 %d" % d["geese"])
            if not d["loaderGone"]: bad.append("로더 잔존")
            if not d["birdsGone"]: bad.append("연출 거위 잔존")
            if d["isIntro"]: bad.append("is-intro 안 풀림")
            if d["overflow"] > 1: bad.append("가로넘침 %dpx" % d["overflow"])
            if float(d["headerOp"]) < 0.99: bad.append("헤더 투명")
            if errs: bad.append("JS오류 " + errs[0])
            if vw > 1080 and not d["nav"]: bad.append("정중앙 거위 없음")
            if 720 < vw <= 1080 and not d["brand"]: bad.append("좌측 거위 없음")
            if bad:
                fails.append((vname, name, bad))
                print("  ✗ %-6s %-10s %s" % (vname, name, " · ".join(bad)))
        pg.close()
    b.close()
print("실패 %d건" % len(fails))
sys.exit(1 if fails else 0)
