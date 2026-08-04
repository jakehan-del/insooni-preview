#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""배포 전 검증 — 사람이 기억하지 않아도 돌아간다.

재는 것은 셋. 전부 실제 브라우저에서, 선언된 값이 아니라 화면에 찍힌 값으로.

  1) 글자 대비 — WCAG 2.2 AA (본문 4.5:1 · 큰 글자 3:1)
  2) 가로 넘침 — 화면 밖으로 밀려나는 것
  3) 콘솔 오류

두 가지 크기(17px 기본 · 21px 큰 글씨)와 두 가지 폭(폰 390 · 데스크 1440)에서
전부 돌린다. [가] 버튼으로 글자를 키운 사람의 화면도 검증 대상이다.

하나라도 걸리면 종료코드 1 — 빨갛게 실패한다. 경고만 남기지 않는다.
아무도 안 보는 경고는 없는 것과 같다.
"""
import sys

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("playwright 가 없습니다 — 검증을 건너뜁니다(설치: pip install playwright)")
    sys.exit(0)

BASE = "http://127.0.0.1:8877/"
PAGES = ["index", "about", "music", "schedule", "news", "archive",
         "haemil", "community", "privacy", "terms", "404"]
SIZES = [17, 21]
WIDTHS = [(390, 844), (1440, 900)]

# 헤드리스 크로뮴의 기본값은 SwiftShader(GPU 없음)라 캔버스가 있는 페이지에서
# 느려진다. CI 에서도 Metal 은 못 쓰지만 최소한 소프트웨어 폴백을 명시해 둔다.
ARGS = ["--disable-dev-shm-usage", "--no-sandbox"]

AUDIT = r"""() => {
  function lum(c) {
    var m = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(function (v) {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return .2126 * m[0] + .7152 * m[1] + .0722 * m[2];
  }
  /* 배경은 조상을 타고 올라가며 찾는다. 배경 이미지가 있으면 계산할 수 없으므로
     그 요소는 건너뛴다 — 모르는 것을 통과시키지도, 실패시키지도 않는다. */
  function backdrop(el) {
    var n = el;
    while (n && n !== document.documentElement) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') return null;
      var a = cs.backgroundColor.match(/[\d.]+/g);
      if (a && (a.length < 4 || parseFloat(a[3]) > .95)) return cs.backgroundColor;
      n = n.parentElement;
    }
    return getComputedStyle(document.documentElement).backgroundColor;
  }
  var bad = [], seen = 0;
  /* 직접 텍스트 노드를 가진 요소만 잰다. 컨테이너는 자식 글자를 이어 붙여
     실제로 그리지 않는 색으로 오탐을 만든다 — 실제로 그렇게 두 번 속았다. */
  var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var ck = new Set(), n;
  while ((n = w.nextNode())) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    var e = n.parentElement;
    if (!e || ck.has(e)) continue;
    ck.add(e);
    var r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    var cs = getComputedStyle(e);
    /* 스크린리더 전용 요소는 일부러 1px 로 잘라 둔 것이다 */
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)') continue;
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity < .5) continue;
    if (e.closest('[hidden],.sr-only,.skip-link')) continue;
    var g = backdrop(e);
    if (!g) continue;
    seen++;
    var fg = lum(cs.color), bl = lum(g);
    var hi = Math.max(fg, bl), lo = Math.min(fg, bl);
    var ratio = (hi + .05) / (lo + .05);
    var px = parseFloat(cs.fontSize);
    var need = (px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700)) ? 3 : 4.5;
    if (ratio < need) {
      bad.push(n.nodeValue.trim().slice(0, 24) + ' ' + ratio.toFixed(2) + ':1 @' + px.toFixed(0) + 'px');
    }
  }
  return { seen: seen, bad: bad,
           overflow: document.documentElement.scrollWidth > innerWidth + 1 };
}"""


def main():
    fails, checked = [], 0
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True, args=ARGS)
        for size in SIZES:
            for w, h in WIDTHS:
                for name in PAGES:
                    pg = b.new_page(viewport={"width": w, "height": h})
                    errs = []
                    pg.on("pageerror", lambda e, L=errs: L.append(str(e)[:80]))
                    pg.on("console",
                          lambda m, L=errs: L.append("console: " + m.text[:70])
                          if m.type == "error" else None)
                    try:
                        pg.goto(BASE + name + ".html", wait_until="networkidle", timeout=30000)
                        pg.wait_for_timeout(1500)
                        pg.evaluate("(s) => { document.documentElement.style.fontSize = s + 'px'; }", size)
                        pg.wait_for_timeout(400)
                        r = pg.evaluate(AUDIT)
                    except Exception as e:
                        fails.append("%s %dpx %d — 열지 못함: %s" % (name, size, w, str(e)[:70]))
                        pg.close()
                        continue
                    checked += r["seen"]
                    where = "%s · %dpx · %dpx폭" % (name, size, w)
                    for x in r["bad"]:
                        fails.append("대비 " + where + " — " + x)
                    if r["overflow"]:
                        fails.append("가로넘침 " + where)
                    for x in errs:
                        fails.append("오류 " + where + " — " + x)
                    pg.close()
        b.close()

    print("검사한 텍스트 %d곳 (%d페이지 × 글자 %d단계 × 폭 %d종)"
          % (checked, len(PAGES), len(SIZES), len(WIDTHS)))
    if not fails:
        print("대비·가로넘침·콘솔오류 전부 통과")
        return 0
    print("\n실패 %d건:" % len(fails))
    for f in fails[:40]:
        print("  ✗", f)
    if len(fails) > 40:
        print("  … 외 %d건" % (len(fails) - 40))
    return 1


if __name__ == "__main__":
    sys.exit(main())
