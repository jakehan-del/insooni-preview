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

    # ④ 폰 'TOP' 은 글줄·줄 끝 링크와 겹치지 않는다(검토 4바퀴 3번) — 상자 없는 글자라 스크롤하는 동안 글줄과 ↗ 가
    #    그 밑으로 지나가 글자끼리 겹쳤다. 폰에서는 꼬리말이 그 자리를 덮을 때(문서 끝)만 보인다.
    #    보일 때마다 TOP 상자 ∩ (보이는 글자 줄 · 누르는 것) = 0 인지 잰다. 문서 끝에서 실제로 보였는가도 단언(0 은 성공처럼 생겼다)
    OVL = """() => { const t = document.querySelector('.back-to-top'); if (!t) return {vis: false};
      const cs = getComputedStyle(t); const vis = t.classList.contains('show') && cs.visibility === 'visible' && +cs.opacity > .5;
      if (!vis) return {vis: false}; const R = t.getBoundingClientRect(); const hit = [];
      const inter = (r) => r.width > 0 && r.height > 0 && r.left < R.right && r.right > R.left && r.top < R.bottom && r.bottom > R.top;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { if (!n.nodeValue.trim()) continue; const e = n.parentElement; if (!e || t.contains(e) || e.closest('.sr-only,[hidden]')) continue;
        if (!e.checkVisibility({checkVisibilityCSS: true, checkOpacity: true})) continue;
        const rg = document.createRange(); rg.selectNodeContents(n); for (const r of rg.getClientRects()) if (inter(r)) { hit.push(n.nodeValue.trim().slice(0, 16)); break; } }
      for (const e of document.querySelectorAll('a[href], button, input, select, textarea, [role=button]')) { if (e === t || !e.checkVisibility({checkVisibilityCSS: true})) continue;
        if (inter(e.getBoundingClientRect())) hit.push('<' + e.tagName + ' ' + (e.textContent || '').trim().slice(0, 12) + '>'); }
      return {vis: true, hit: hit}; }"""
    def top_scan(mut):
        bad, shown, scenes = [], 0, 0
        for (vw, vh, fs) in ((375, 812, 0), (360, 640, 2)):
            ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=True, has_touch=True, device_scale_factor=1)
            ctx.add_init_script("try{localStorage.setItem('insooni_fs','%d')}catch(e){}" % fs)
            pg2 = ctx.new_page()
            for name in ("about", "music", "schedule", "archive", "community", "news"):
                pg2.goto(B + name + ".html", wait_until="networkidle", timeout=60000)
                pg2.wait_for_timeout(1200)
                if not pg2.evaluate("!!document.querySelector('.back-to-top')"):
                    bad.append((name, vw, fs, "TOP 없음")); continue
                if mut:
                    pg2.add_style_tag(content=".back-to-top{opacity:1!important;visibility:visible!important}")
                    pg2.evaluate("document.querySelector('.back-to-top').classList.add('show')")
                hgt = pg2.evaluate("document.documentElement.scrollHeight - innerHeight")
                ys = list(range(0, max(0, hgt), 260)) + [hgt]
                seen_bottom = False
                for y in ys:
                    pg2.evaluate("scrollTo(0, %d)" % y); pg2.wait_for_timeout(90)
                    if mut:
                        pg2.evaluate("document.querySelector('.back-to-top').classList.add('show')")
                    d = pg2.evaluate(OVL); scenes += 1
                    if d["vis"]:
                        shown += 1
                        if y == hgt: seen_bottom = True
                        if d["hit"]:
                            bad.append((name, vw, fs, y, d["hit"][:3]))
                if hgt > 700 and not seen_bottom and not mut:
                    bad.append((name, vw, fs, "문서 끝에서 TOP 이 보이지 않음"))
            ctx.close()
        return bad, shown, scenes
    tb, tshown, tscenes = top_scan(False)
    tbm, _, _ = top_scan(True)
    ok = not tb and tshown >= 6 and len(tbm) > 0
    print("폰 TOP 겹침: %d장면 중 보인 곳 %d · 겹침 %s · 뮤테이션(늘 보이게) 겹침 %d건 %s" % (tscenes, tshown, tb[:3] or "0", len(tbm), "✓" if ok else "✗"))
    if not ok: fails.append("폰 TOP 겹침")

    # ⑤ 홈 폰 '옆으로 넘겨 보세요 →' — 사진 밝은 부분 위 대비(검토 4바퀴 8번).
    #    글리프 자리: 글자를 자홍(#f0f)·그림자 없이 그린 화면에서 자홍이 뚜렷한 픽셀(R−G·B−G > 110 — 위를 덮는 그늘이 있어도 고른다).
    #    글자색: 실제로 그려진 화면의 그 픽셀(그 위를 덮는 층까지 포함 — 예전에는 꼬리말 그늘이 글자 위를 덮어 아이보리가 회색으로 눌렸다).
    #    배경: 글자만 투명하게, 그림자는 그대로 둔 화면의 그 픽셀. 그 픽셀들의 대비 하위 10% ≥ 4.5 를 360·375·390 에서,
    #    필름스트립이 움직이므로 1.5초 간격 세 번 재서 가장 나쁜 값으로. 뮤테이션: 옛 모양(모노·.72·그림자 한 겹·<main> 안 = 그늘 밑)
    HC = """async ([m, z, a]) => { const load = (u) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
      const im = await load(m), iz = await load(z), ia = await load(a); const W = im.width, H = im.height;
      const cv = (i) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, W, H).data; };
      const Mk = cv(im), Z = cv(iz), A = cv(ia);
      const L = (r, g, b) => { const f = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
      const out = [];
      for (let k = 0; k < Mk.length; k += 4) { if (Mk[k] - Mk[k + 1] < 110 || Mk[k + 2] - Mk[k + 1] < 110) continue;
        const a = L(A[k], A[k + 1], A[k + 2]), b = L(Z[k], Z[k + 1], Z[k + 2]); out.push((Math.max(a, b) + .05) / (Math.min(a, b) + .05)); }
      out.sort((p, q) => p - q); return {n: out.length, min: out[0] || 0, p10: out[Math.floor(out.length / 10)] || 0, med: out[Math.floor(out.length / 2)] || 0}; }"""
    import base64
    def hint_cr(vw, vh, mut):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=True, has_touch=True, device_scale_factor=1)
        ctx.add_init_script("try{sessionStorage.setItem('insooni_intro','1')}catch(e){}")
        pg2 = ctx.new_page(); pg2.goto(B + "index.html", wait_until="load", timeout=60000)
        try:
            pg2.wait_for_function("!document.documentElement.classList.contains('is-intro')", timeout=20000)
        except Exception:
            pass
        pg2.wait_for_timeout(2500)
        pg2.add_style_tag(content="*{transition:none!important;animation:none!important}")
        if mut:
            pg2.add_style_tag(content=".strip-hint{font-family:var(--font-mono)!important;font-size:.76rem!important;font-weight:400!important;color:rgba(243,239,231,.72)!important;text-shadow:0 1px 10px rgba(8,8,8,.9)!important}")
            pg2.evaluate("document.querySelector('.strip').appendChild(document.querySelector('.strip-hint'))")
        worst = None
        for k in range(3):
            if k:
                pg2.wait_for_timeout(1500)
            r = pg2.evaluate("(() => { const e = document.querySelector('.strip-hint'); if (!e || !e.checkVisibility()) return null; const q = e.getBoundingClientRect(); return {x: q.left - 4, y: q.top - 4, width: q.width + 8, height: q.height + 8}; })()")
            if not r:
                ctx.close(); return None
            # 세 장을 한 프레임에 가깝게 — 필름스트립을 잠시 멈춘다(사진이 움직이면 세 장의 배경이 달라진다)
            pg2.evaluate("document.querySelectorAll('.strip-track').forEach(t => { t.__tf = t.style.transform; t.style.transform = getComputedStyle(t).transform; })")
            shot = lambda: "data:image/png;base64," + base64.b64encode(pg2.screenshot(clip=r, animations="disabled")).decode()
            a = shot()
            s1 = pg2.add_style_tag(content=".strip-hint, .strip-hint *{color:transparent!important}")
            pg2.wait_for_timeout(80); z = shot()
            s2 = pg2.add_style_tag(content=".strip-hint, .strip-hint *{color:#ff00ff!important;text-shadow:none!important}")
            pg2.wait_for_timeout(80); m = shot()
            pg2.evaluate("(els) => els.forEach(e => e.remove())", [s1, s2])
            d = pg2.evaluate(HC, [m, z, a])
            if worst is None or d["p10"] < worst["p10"]:
                worst = d
        ctx.close()
        return worst
    hres = {(vw, vh): hint_cr(vw, vh, False) for (vw, vh) in ((360, 640), (375, 812), (390, 844))}
    hmut = hint_cr(375, 812, True)
    ok = all(v and v["n"] > 60 and v["p10"] >= 4.5 for v in hres.values()) and hmut and hmut["n"] > 60 and hmut["p10"] < 4.5
    print("홈 넘김 안내 대비(글리프 하위10%%·최저·픽셀 수, 세 번 중 최악): %s · 뮤테이션(옛 모양·그늘 밑) %s %s" % (
        {"%dx%d" % k: (v and round(v["p10"], 2), v and round(v["min"], 2), v and v["n"]) for k, v in hres.items()}, hmut and (round(hmut["p10"], 2), hmut["n"]), "✓" if ok else "✗"))
    if not ok: fails.append("홈 넘김 안내 대비")
    b.close()
print("\n실패:", fails or "없음")
raise SystemExit(1 if fails else 0)
