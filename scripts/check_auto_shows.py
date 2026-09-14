# 실행: 사이트 루트에서 `python3 -m http.server 8908` → playwright 파이썬으로 실행.
# 지난 공연 자동 합류 검증: 방송 클립 신규 항목·수동 항목에 붙이기·중복 없음·리캡·EN.
from playwright.sync_api import sync_playwright
fails=[]
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width":1400,"height":900})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
    pg.goto("http://127.0.0.1:8908/schedule.html", wait_until="networkidle", timeout=45000)
    pg.wait_for_timeout(3000)
    d = pg.evaluate("""() => {
      const cells=[...document.querySelectorAll('#past-recaps .show-cell')];
      const txt=c=>c.textContent.replace(/\\s+/g,' ').trim();
      const first6 = cells.slice(0,6).map(txt);
      const gayo = cells.find(c=>txt(c).includes('가요무대'));
      const killit = cells.filter(c=>txt(c).includes('킬잇'));
      return { total: cells.length, first6,
               gayo: gayo? {text: txt(gayo), hasRecap: !!gayo.querySelector('.show-cta'), tag: gayo.tagName} : null,
               killitCount: killit.length,
               stageBgCount: document.querySelectorAll('.stage-bg').length,
               dup729: cells.some(c=>txt(c).startsWith('2026. 7. 29')) };
    }""")
    print("셀 총수:", d["total"], "| 배경 요소:", d["stageBgCount"])
    for t in d["first6"]: print("   ", t[:70])
    ok = d["gayo"] and d["gayo"]["hasRecap"] and d["gayo"]["text"].startswith("2026. 8. 3")
    print("8/3 가요무대:", d["gayo"], "✓" if ok else "✗"); ok or fails.append("가요무대 셀")
    print("킬잇 셀 수:", d["killitCount"], "(1이어야) · 7/29 별건 생성:", d["dup729"], "✓" if d["killitCount"]==1 and not d["dup729"] else "✗")
    (d["killitCount"]==1 and not d["dup729"]) or fails.append("중복 판정")
    d["stageBgCount"]==1 or fails.append("stage-bg 중복 %d"%d["stageBgCount"])
    # 리캡 열기
    pg.evaluate("""() => { const c=[...document.querySelectorAll('#past-recaps .show-cell')].find(c=>c.textContent.includes('가요무대')); c.scrollIntoView(); c.click(); }""")
    pg.wait_for_timeout(1500)
    r = pg.evaluate("""() => { const p=document.querySelector('.recap-panel');
      if(!p) return {open:false};
      const vis = getComputedStyle(p).visibility!=='hidden' && getComputedStyle(p).opacity!=='0';
      return {open: vis, title: (p.querySelector('h2,h3,.recap-title')||{}).textContent||'',
              host: !!p.querySelector('#recap-clip-host'), clipBtns: p.querySelectorAll('.recap-clip').length,
              desc: (p.querySelector('.recap-desc, p')||{}).textContent||''}; }""")
    print("리캡 패널:", r, "✓" if r.get("open") else "✗"); r.get("open") or fails.append("리캡 열림")
    pg.screenshot(path="auto-shows-recap.png")
    # 킬잇 수동 항목 클립 수 (7/29 클립 붙었는지)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    k = pg.evaluate("""() => { const c=[...document.querySelectorAll('#past-recaps .show-cell')].find(c=>c.textContent.includes('킬잇')); c.click();
      return new Promise(res=>setTimeout(()=>{ const p=document.querySelector('.recap-panel');
        res(p? p.querySelectorAll('.recap-clip').length : -1); },1200)); }""")
    print("킬잇 리캡 클립 수 (수동 2 + 자동 1 = 3 기대):", k, "✓" if k==3 else "✗"); k==3 or fails.append("클립 붙이기")
    pg.keyboard.press("Escape")
    # EN 표기
    pg.evaluate("localStorage.setItem('insooni_lang', JSON.stringify('en'))")
    pg.goto("http://127.0.0.1:8908/schedule.html", wait_until="networkidle", timeout=45000)
    pg.wait_for_timeout(3000)
    en = pg.evaluate("""() => { const c=[...document.querySelectorAll('#past-recaps .show-cell')].find(c=>/Music Stage/.test(c.textContent)); return c? c.textContent.replace(/\\s+/g,' ').trim(): null; }""")
    print("EN:", en, "✓" if en else "✗"); en or fails.append("EN 표기")
    pg.evaluate("localStorage.removeItem('insooni_lang')")
    print("JS 오류:", errs or "없음"); (not errs) or fails.append("JS오류")
    b.close()
print("\n실패:", fails or "없음")
