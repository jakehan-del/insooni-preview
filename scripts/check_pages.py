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
                overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
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

    # 폭 × 글자 × 언어 행렬(검토 4바퀴 6번) — 영어 음악 페이지가 320~375 × 21px 에서만 옆으로 넘쳤다
    # ('Studio album no.13' 모노 한 줄이 앨범 줄 오른쪽 칸을 차지). 한국어 같은 크기는 0 이라 한 언어만 재면 못 잡는다.
    # 넘침(scrollWidth − clientWidth)은 0 이어야 하고, 헤더 ☰ 는 화면 안(오른쪽 끝 ≤ 폭)에 있어야 한다. 잰 장면 수를 함께 단언한다.
    # innerWidth 와 견주면 안 된다 — 폰 흉내에서는 내용이 넘치면 크로뮴이 화면을 축소해 innerWidth 가 내용 폭(441)까지 늘어나
    # 넘쳐도 0 이 나왔다(이 파일의 뮤테이션이 처음에 못 잡은 이유). 그래서 innerWidth 가 요청한 폭 그대로인지도 본다
    n = 0
    for lang in ("ko", "en"):
        for fs_i, fs in ((0, 17), (2, 21)):
            for vw in (320, 360, 375, 390):
                ctx = b.new_context(viewport={"width": vw, "height": 740}, is_mobile=True, has_touch=True, device_scale_factor=1)
                ctx.add_init_script("try{localStorage.setItem('insooni_fs','%d');localStorage.setItem('insooni_lang',JSON.stringify('%s'));sessionStorage.setItem('insooni_intro','1')}catch(e){}" % (fs_i, lang))
                pg = ctx.new_page()
                errs = []
                pg.on("pageerror", lambda e: errs.append(str(e)[:110]))
                for name in PAGES:
                    del errs[:]
                    pg.goto(B + name + ".html", wait_until="networkidle", timeout=60000)
                    if name == "index":
                        # 홈 도입부 동안은 상표가 크고 헤더를 누를 수 없다(.is-intro .site-header{pointer-events:none}) — 끝난 뒤의 헤더를 잰다
                        pg.wait_for_function("!document.documentElement.classList.contains('is-intro')", timeout=20000)
                    pg.wait_for_timeout(700)
                    d = pg.evaluate("""() => { const tg = document.querySelector('.site-header .nav-toggle'); const r = tg ? tg.getBoundingClientRect() : null;
                      return {over: document.documentElement.scrollWidth - document.documentElement.clientWidth, lang: document.documentElement.lang,
                              tg: r && r.width ? Math.round(r.right * 10) / 10 : 0, iw: document.documentElement.clientWidth, inner: innerWidth}; }""")
                    n += 1
                    bad = []
                    if d["lang"] != lang: bad.append("언어 %s" % d["lang"])
                    if d["over"] > 0: bad.append("가로넘침 %dpx" % d["over"])
                    if d["tg"] > d["iw"]: bad.append("☰ right %.1f > %d" % (d["tg"], d["iw"]))
                    if d["inner"] != vw: bad.append("화면 축소(innerWidth %d ≠ %d)" % (d["inner"], vw))
                    if errs: bad.append("JS오류 " + errs[0])
                    if bad:
                        fails.append(("%s %d×%dpx" % (lang, vw, fs), name, bad))
                        print("  ✗ %s %d×%dpx %-10s %s" % (lang, vw, fs, name, " · ".join(bad)))
                ctx.close()
    if n != 2 * 2 * 4 * len(PAGES):
        fails.append(("행렬", "장면 수", [str(n)]))
    # 뮤테이션 — 옛 앨범 줄(종류가 오른쪽 칸 한 줄)을 되살리면 영어 360×21 음악에서 넘침이 잡혀야 한다(검사가 살아 있는가)
    ctx = b.new_context(viewport={"width": 360, "height": 740}, is_mobile=True, has_touch=True, device_scale_factor=1)
    ctx.add_init_script("try{localStorage.setItem('insooni_fs','2');localStorage.setItem('insooni_lang',JSON.stringify('en'))}catch(e){}")
    pg = ctx.new_page()
    pg.goto(B + "music.html", wait_until="networkidle", timeout=60000)
    pg.wait_for_timeout(800)
    pg.add_style_tag(content="@media (max-width:640px){.album-row{grid-template-columns:56px 1fr auto!important;gap:1.6rem!important}.album-row>div{min-width:auto!important}"
                             ".album-row .a-art,.album-row .a-art--empty{grid-row:auto!important}.album-row .a-kind{grid-column:auto!important;white-space:nowrap!important}}")
    pg.wait_for_timeout(500)
    mo = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    ctx.close()
    print("뮤테이션(옛 앨범 줄) 영어 360×21 음악 넘침 %dpx — %s" % (mo, "잡음" if mo > 0 else "못 잡음"))
    if mo <= 0:
        fails.append(("뮤테이션", "music", ["옛 앨범 줄을 되살려도 넘침 0 — 검사가 죽었다"]))
    print("폭(320·360·375·390) × 글자(17·21) × 언어(ko·en) × %d페이지 = %d장면" % (len(PAGES), n))
    b.close()
print("실패 %d건" % len(fails))
sys.exit(1 if fails else 0)
