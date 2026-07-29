#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""배포용 파일 만들기 — 사람이 읽는 원본은 그대로 두고, 브라우저용만 줄인다.

원본(style.css, main.js …)은 계속 고쳐 나가는 파일이다.
여기서는 그 사본을 만들어 주석과 공백을 걷어낸다.
HTML은 줄어든 사본(.min)을 가리키게 된다.
"""
import io, os, re, glob, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")


def minify_css(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)          # 주석
    s = re.sub(r"\s+", " ", s)                           # 연속 공백
    s = re.sub(r"\s*([{}:;,>~+])\s*", r"\1", s)
    s = re.sub(r";}", "}", s)
    return s.strip()


def minify_js(s):
    """보수적으로만 줄인다 — 문자열·정규식을 건드리면 안 되므로 줄 단위로 처리."""
    out = []
    in_block = False
    for line in s.split("\n"):
        t = line
        if in_block:
            end = t.find("*/")
            if end < 0:
                continue
            t = t[end + 2:]
            in_block = False
        # 줄 안의 블록 주석 (한 줄에서 닫히는 것만)
        while True:
            a = t.find("/*")
            if a < 0:
                break
            # 문자열 안의 /* 는 건드리지 않는다
            if t[:a].count('"') % 2 or t[:a].count("'") % 2:
                break
            b = t.find("*/", a + 2)
            if b < 0:
                t = t[:a]
                in_block = True
                break
            t = t[:a] + t[b + 2:]
        # 줄 주석: 따옴표·URL 밖일 때만
        a = t.find("//")
        while a >= 0:
            head = t[:a]
            if head.count('"') % 2 == 0 and head.count("'") % 2 == 0 and not head.rstrip().endswith(":"):
                t = head
                break
            a = t.find("//", a + 2)
        t = t.strip()
        if t:
            out.append(t)
    return "\n".join(out)


def split_fonts():
    """폰트 CSS를 본문용과 제목용으로 가른다.

    fonts.css는 압축 후에도 90KB인데 통째로 렌더링을 막는다.
    본문 글꼴(Pretendard)만 먼저 깔고 제목용 서체는 화면이 뜬 뒤 들여온다.
    모두 font-display:swap이라 늦게 와도 글자는 먼저 보인다.
    """
    src_path = os.path.join(ROOT, "assets/fonts/fonts.css")
    if not os.path.exists(src_path):
        return
    css = io.open(src_path, encoding="utf-8").read()
    body, disp = [], []
    for blk in re.findall(r"@font-face\s*\{[^}]*\}", css):
        fam = re.search(r"font-family:\s*['\"]([^'\"]+)", blk)
        (body if fam and "Pretendard" in fam.group(1) else disp).append(blk)
    for name, blocks in (("body.css", body), ("display.css", disp)):
        out = os.path.join(ROOT, "assets/fonts", name)
        io.open(out, "w", encoding="utf-8").write(minify_css("\n".join(blocks)))
        print("  %-26s %6.1f KB  (%d faces)" % (name, os.path.getsize(out) / 1024, len(blocks)))


def run():
    split_fonts()
    made = []
    css = os.path.join(ROOT, "assets/css/style.css")
    dst = os.path.join(ROOT, "assets/css/style.min.css")
    src = io.open(css, encoding="utf-8").read()
    io.open(dst, "w", encoding="utf-8").write(minify_css(src))
    made.append((css, dst))

    for js in sorted(glob.glob(os.path.join(ROOT, "assets/js/*.js"))):
        if js.endswith(".min.js"):
            continue
        d = js[:-3] + ".min.js"
        io.open(d, "w", encoding="utf-8").write(minify_js(io.open(js, encoding="utf-8").read()))
        made.append((js, d))

    tot_a = tot_b = 0
    for a, b in made:
        sa, sb = os.path.getsize(a), os.path.getsize(b)
        tot_a += sa
        tot_b += sb
        print("  %-26s %6.1f KB → %6.1f KB" % (os.path.basename(a), sa / 1024, sb / 1024))
    print("합계 %.1f KB → %.1f KB (%.0f%% 절감)" % (tot_a / 1024, tot_b / 1024, 100 * (1 - tot_b / tot_a)))


if __name__ == "__main__":
    run()
