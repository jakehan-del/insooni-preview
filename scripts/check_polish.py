# 실행: 사이트 루트에서 `python3 -m http.server 8908` 을 띄운 뒤
#       playwright 가 있는 파이썬으로 이 파일을 돌린다 (scripts/verify.py 와 같은 환경).
# 왜 저장소에 두나: 임시 폴더에 두었던 검사기가 두 달 사이 두 번 증발했다.
# v3 (2026-09-14): 스포트라이트·샤인·커서·자석은 걷었으므로 '없음'을 검사한다.
#   남긴 기능(카운트업·액자 진행선)과 홈 리드 페어·조용한 크롬을 확인한다.
#   ④ (2026-10-03) 한국어 화면의 한글에 고정폭 서체 0 — 모든 쪽, 숨은 패널·검색 결과·사진 뷰어·리캡 포함.
#     다른 서버를 재려면 INSOONI_BASE=http://127.0.0.1:8931/ 처럼 준다(기본 8908).
import os, time
from playwright.sync_api import sync_playwright
B = os.environ.get("INSOONI_BASE", "http://127.0.0.1:8908/")
fails = []

# 한글이 든 '직접' 텍스트 노드의 계산된 첫 서체가 모노인가 — 컨테이너를 재면 자식 글자를 이어 붙여 오탐이 난다.
# 숨은 패널(앨범 상세 등)도 잰다: 펼치는 순간 모노로 나오면 같은 결함이다. 화면 낭독기 전용(.sr-only)만 뺀다.
MONO_HAN = r"""() => { const out = []; let tot = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    const t = n.nodeValue.trim(); if (!/[가-힣]/.test(t)) continue;
    const e = n.parentElement; if (!e || e.closest('script,style,noscript,template,.sr-only')) continue;
    const cs = getComputedStyle(e); if (cs.clip === 'rect(0px, 0px, 0px, 0px)') continue;
    tot++;
    if (/^\s*"?(JetBrains Mono|Space Mono|IBM Plex Mono|SF Mono|monospace)/i.test(cs.fontFamily))
      out.push((e.className || e.tagName) + ': ' + t.slice(0, 14));
  }
  return {tot, bad: out}; }"""
# 상태를 열어 가며 잰다(검색 결과 · 사진 뷰어 · 리캡 · 기사 목록) — 처음 화면만 재면 열리는 칸이 빠진다
MONO_STEPS = {
    "index": [], "about": [], "haemil": [], "community": [], "privacy": [], "terms": [], "404": [],
    "music": ["(()=>{const i=document.getElementById('song-q'); if(i){i.value='거위'; i.dispatchEvent(new Event('input',{bubbles:true}));}})()"],
    "archive": ["document.querySelector('.arch-item') && document.querySelector('.arch-item').click()"],
    "schedule": ["document.querySelector('button.show-cell') && document.querySelector('button.show-cell').click()"],
    "news": ["document.querySelectorAll('.nw-more').forEach(b=>b.click())"],
}
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

    # ④ 한글에 고정폭 서체 0 (한국어 폰 375 · PC 1280 · 영어 폰 375 — 영어 화면에도 번역 없는 곡명·채널명이 한글로 남는다)
    #    모노의 띄어쓰기는 한 칸(.6em)이라 「걸어온  길」「258곡이  담겨  있습니다」처럼 낱말 사이가 2.5배로 벌어졌다.
    total, bad_all = 0, []
    for (lang, vw, vh) in [("ko", 375, 812), ("ko", 1280, 860), ("en", 375, 812)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=vw < 700, has_touch=vw < 700)
        ctx.add_init_script("try{sessionStorage.setItem('insooni_intro','1');localStorage.setItem('insooni_lang','\"%s\"')}catch(e){}" % lang)
        ctx.route("**/*", lambda r: r.abort() if "127.0.0.1" not in r.request.url and "localhost" not in r.request.url else r.continue_())
        mp = ctx.new_page()
        for name, steps in MONO_STEPS.items():
            mp.goto(B + name + ".html", wait_until="load", timeout=45000)
            mp.wait_for_timeout(1300)
            mp.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
            mp.wait_for_timeout(400)
            for st in steps:
                try:
                    mp.evaluate(st); mp.wait_for_timeout(600)
                except Exception as e:
                    bad_all.append("%s %s %d 상태 열기 실패 %s" % (lang, name, vw, str(e)[:60]))
            r = mp.evaluate(MONO_HAN)
            total += r["tot"]
            if r["bad"]:
                bad_all.append("%s %s %d: %d개 %s" % (lang, name, vw, len(r["bad"]), r["bad"][:3]))
        # 감사기를 의심한다 — 일부러 모노를 심으면 잡혀야 한다(마지막 쪽 = 소식)
        mp.add_style_tag(content=".news .nw-title{font-family:'JetBrains Mono',monospace!important}")
        mp.wait_for_timeout(80)
        mu = mp.evaluate(MONO_HAN)
        if len(mu["bad"]) < 5:
            bad_all.append("뮤테이션(소식 제목 모노)을 못 잡음 %d" % len(mu["bad"]))
        ctx.close()
    ok = not bad_all and total >= 3000
    print("한글 모노: 한글 노드 %d개를 쟀다 · 위반 %s %s" % (total, bad_all[:4] or "0", "✓" if ok else "✗"))
    if not ok: fails.append("한글 모노")
    b.close()
print("\n실패:", fails or "없음")
raise SystemExit(1 if fails else 0)
