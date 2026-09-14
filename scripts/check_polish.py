# 실행: 사이트 루트에서 `python3 -m http.server 8908` 을 띄운 뒤
#       playwright 가 있는 파이썬으로 이 파일을 돌린다 (scripts/verify.py 와 같은 환경).
# 왜 저장소에 두나: 임시 폴더에 두었던 검사기가 두 달 사이 두 번 증발했다.
# 폴리시 v2 기능 프로브 — 스포트라이트·진행선·카운트업·샤인
import time
from playwright.sync_api import sync_playwright
fails = []
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width":1280,"height":800})

    # ① 아카이브: 카운트업
    pg.goto("http://127.0.0.1:8908/archive.html", wait_until="networkidle", timeout=45000)
    pg.wait_for_timeout(2500)
    d = pg.evaluate("""() => {
      const el = document.querySelector('[data-countup]');
      if (!el) return {no: true};
      el.scrollIntoView({block:'center'});
      return {target: el.getAttribute('data-countup'), now: el.textContent};
    }""")
    if d.get("no"): fails.append("카운트업 요소 없음"); print("✗ 카운트업 요소 없음")
    else:
        pg.wait_for_timeout(400)
        mid = pg.evaluate("document.querySelector('[data-countup]').textContent")
        pg.wait_for_timeout(1400)
        fin = pg.evaluate("document.querySelector('[data-countup]').textContent")
        rolled = mid != fin or int(mid) < int(d["target"])
        ok = fin == d["target"]
        print("카운트업: 목표 %s · 중간 %s · 최종 %s %s" % (d["target"], mid, fin, "✓" if ok else "✗"))
        if not ok: fails.append("카운트업 최종값 불일치")

    # ② 진행선 (서브페이지)
    p0 = pg.evaluate("""() => { const b=document.querySelector('.frame-progress');
      return b ? getComputedStyle(b).transform : null; }""")
    pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    pg.wait_for_timeout(500)
    p1 = pg.evaluate("""() => { const b=document.querySelector('.frame-progress');
      const m=(b.style.transform.match(/scaleX\\(([\\d.]+)\\)/)||[])[1]; return +m; }""")
    print("진행선: 존재 %s · 바닥에서 scaleX=%s %s" % (bool(p0), p1, "✓" if p1 and p1 > 0.95 else "✗"))
    if not (p1 and p1 > 0.95): fails.append("진행선")

    # ③ 스포트라이트 좌표 (about 의 .card 위에서 pointermove)
    pg.goto("http://127.0.0.1:8908/about.html", wait_until="networkidle", timeout=45000)
    pg.wait_for_timeout(2200)
    d = pg.evaluate("""() => {
      const c = document.querySelector('.card');
      if (!c) return {no:true};
      c.scrollIntoView({block:'center'});
      const r = c.getBoundingClientRect();
      const ev = new PointerEvent('pointermove', {clientX:r.left+r.width*0.3, clientY:r.top+r.height*0.6, bubbles:true});
      c.dispatchEvent(ev);
      return {sx: c.style.getPropertyValue('--sx'), sy: c.style.getPropertyValue('--sy'),
              hasAfter: !!getComputedStyle(c, '::after').background.includes('radial')};
    }""")
    ok = (not d.get("no")) and d.get("sx") and d.get("hasAfter")
    print("스포트라이트: --sx=%s --sy=%s 라디얼=%s %s" % (d.get("sx"), d.get("sy"), d.get("hasAfter"), "✓" if ok else "✗"))
    if not ok: fails.append("스포트라이트")

    # ③b 홈에는 진행선 없어야
    pg.goto("http://127.0.0.1:8908/index.html", wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(1500)
    disp = pg.evaluate("""() => { const b=document.querySelector('.frame-progress');
      return b ? getComputedStyle(b).display : '요소없음'; }""")
    print("홈 진행선: %s %s" % (disp, "✓" if disp in ("none","요소없음") else "✗"))
    if disp not in ("none","요소없음"): fails.append("홈 진행선 노출")

    # ④ 샤인 — 도입부 뒤 sc-title 에 1회
    t0 = time.time()
    seen = False
    while time.time() - t0 < 13:
        has = pg.evaluate("""() => { const t=document.querySelector('.sc-title');
          return t ? t.classList.contains('sheen-once') : null; }""")
        if has: seen = True; break
        time.sleep(0.5)
    pg.wait_for_timeout(2800)
    gone = pg.evaluate("!document.querySelector('.sc-title').classList.contains('sheen-once')")
    print("샤인: 1회 등장 %s · 제거 %s %s" % (seen, gone, "✓" if seen and gone else "✗"))
    if not (seen and gone): fails.append("샤인")
    b.close()
print("\n실패:", fails or "없음")
