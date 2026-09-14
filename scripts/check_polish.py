# 실행: 사이트 루트에서 `python3 -m http.server 8908` 을 띄운 뒤
#       playwright 가 있는 파이썬으로 이 파일을 돌린다 (scripts/verify.py 와 같은 환경).
# 왜 저장소에 두나: 임시 폴더에 두었던 검사기가 두 달 사이 두 번 증발했다.
# v3 (2026-09-14): 스포트라이트·샤인·커서·자석은 걷었으므로 '없음'을 검사한다.
#   남긴 기능(카운트업·액자 진행선)과 홈 리드 페어·조용한 크롬을 확인한다.
import time
from playwright.sync_api import sync_playwright
B = "http://127.0.0.1:8908/"
fails = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width":1440,"height":900})

    # ① 아카이브: 카운트업은 실측값으로 끝난다
    pg.goto(B+"archive.html", wait_until="networkidle", timeout=45000)
    pg.wait_for_timeout(2500)
    pg.evaluate("document.querySelector('[data-countup]')?.scrollIntoView({block:'center'})")
    pg.wait_for_timeout(1600)
    cu = pg.evaluate("""() => { const el=document.querySelector('[data-countup]');
      return el ? {target: el.getAttribute('data-countup'), now: el.textContent} : null; }""")
    ok = bool(cu) and cu["target"] == cu["now"]
    print("카운트업: %s %s" % (cu, "✓" if ok else "✗"))
    if not ok: fails.append("카운트업")

    # ② 서브페이지 진행선은 하나(.frame-progress), 2px 금선(#scroll-progress)은 없다
    pg.goto(B+"about.html", wait_until="networkidle", timeout=45000)
    pg.wait_for_timeout(800)
    pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    pg.wait_for_timeout(500)
    pr = pg.evaluate("""() => { const b=document.querySelector('.frame-progress');
      return {one: document.querySelectorAll('.frame-progress').length, old: !!document.getElementById('scroll-progress'),
              sx: b ? getComputedStyle(b).transform : null, cursor: !!document.querySelector('.cursor-ring'),
              spot: !!document.querySelector('.card::after')}; }""")
    ok = pr["one"] == 1 and not pr["old"] and not pr["cursor"] and pr["sx"] and "matrix(1," in pr["sx"]
    print("진행선/커서: %s %s" % (pr, "✓" if ok else "✗"))
    if not ok: fails.append("진행선 또는 커서")

    # ③ 홈: 리드 페어가 첫 화면에 함께 서고, 사진 위 텍스트 층·상자가 없다
    pg.goto(B+"index.html", wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(8500)
    h = pg.evaluate("""() => { const q=s=>document.querySelector(s); const r=e=>e?e.getBoundingClientRect():null;
      const f=r(q('.strip-item--first')), l=r(q('.strip-item--lead'));
      return {first: f && f.left===0 && f.width>0, leadVisible: l && l.left < innerWidth*0.6,
              caption: !!q('.strip-caption'), pauseInFooter: !!q('.footer-min .strip-pause'),
              fsBorder: getComputedStyle(q('.fs-toggle')).borderTopWidth, progress: !q('.frame-progress') || getComputedStyle(q('.frame-progress')).display==='none',
              grain: getComputedStyle(document.body,'::after').content, geese: [...document.querySelectorAll('.site-header svg')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})).length}; }""")
    ok = h["first"] and h["leadVisible"] and not h["caption"] and h["pauseInFooter"] and h["fsBorder"]=="0px" and h["progress"] and h["grain"] in ("none","normal") and h["geese"]==1
    print("홈 리드 페어/조용한 크롬: %s %s" % (h, "✓" if ok else "✗"))
    if not ok: fails.append("홈 v3")
    b.close()
print("\n실패:", fails or "없음")
raise SystemExit(1 if fails else 0)
