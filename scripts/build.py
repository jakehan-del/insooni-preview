#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""배포용 파일 만들기 — 사람이 읽는 원본은 그대로 두고, 브라우저용만 줄인다.

원본(style.css, main.js …)은 계속 고쳐 나가는 파일이다.
여기서는 그 사본을 만들어 주석과 공백을 걷어낸다.
HTML은 줄어든 사본(.min)을 가리키게 된다.
"""
import io, os, re, glob, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

# ============================================================
# 배포 주소 — 도메인을 옮길 때 이 한 줄만 바꾸면 됩니다.
#
#   지금:   https://jakehan-del.github.io/insooni-preview
#   나중에: https://insooni.com
#
# canonical / og:url / og:image / 구조화 데이터 / sitemap.xml / robots.txt 가
# 전부 이 값으로 다시 쓰입니다. 한 곳이라도 옛 주소가 남으면 검색엔진에
# "진짜 페이지는 옛 주소다"라고 알려 주는 셈이 되어 새 도메인이 손해를 봅니다.
# ============================================================
SITE_URL = "https://jakehan-del.github.io/insooni-preview"

# 과거에 쓴 적 있는 주소들. 어느 것이 남아 있어도 SITE_URL로 바꾼다(여러 번 실행해도 안전).
KNOWN_BASES = [
    "https://jakehan-del.github.io/insooni-preview",
    "https://insooni.com",
    "https://www.insooni.com",
]


def minify_css(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)          # 주석
    s = re.sub(r"\s+", " ", s)                           # 연속 공백
    # + 는 절대 붙이면 안 된다.
    # CSS 명세상 calc() 안의 +, - 는 양옆 공백이 필수라서
    # calc(96px + 1.2rem) 을 calc(96px+1.2rem) 으로 줄이면
    # 브라우저가 그 선언을 통째로 버린다.
    # 실제로 그랬다 — 라디오 바가 떠 있을 때 '맨 위로' 버튼이 겹쳐 있었다
    # (style.css 의 body.has-radio/.has-deck .back-to-top 두 규칙).
    # 인접 형제 결합자(.a + .b)는 공백이 남아도 유효하므로 손해는 몇 바이트뿐이다.
    s = re.sub(r"\s*([{}:;,>~])\s*", r"\1", s)
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


def restamp_site_url():
    """모든 절대 주소를 SITE_URL로 다시 쓴다.

    HTML에 박힌 canonical·og·구조화 데이터, sitemap.xml, robots.txt를 한 번에 맞춘다.
    도메인 이전에서 가장 흔한 사고가 "일부만 바꾸는 것"이라 통째로 다시 쓴다.
    """
    base = SITE_URL.rstrip("/")
    targets = sorted(glob.glob(os.path.join(ROOT, "*.html")))
    targets += [os.path.join(ROOT, "sitemap.xml"), os.path.join(ROOT, "robots.txt")]
    changed = 0
    for f in targets:
        if not os.path.exists(f):
            continue
        src = io.open(f, encoding="utf-8").read()
        out = src
        for old in KNOWN_BASES:
            if old.rstrip("/") != base:
                out = out.replace(old.rstrip("/"), base)
        if out != src:
            io.open(f, "w", encoding="utf-8").write(out)
            changed += 1
    print("  배포 주소 %s (%d개 파일 갱신)" % (base, changed))



def restamp_cache_bust():
    """캐시 무효화 값을 내용 해시로 바꾼다.

    전에는 HTML 마다 ?v124 를 손으로 올렸다. build.py 는 이 번호를 올려 주지
    않으므로, 빠뜨리면 고친 것이 라이브에 하나도 안 보인다 — 파일은 바뀌었는데
    브라우저가 옛 것을 계속 쓴다. 실제로 매번 이 순서를 지켜야 했다.

    번호를 없애면 빠뜨릴 수도 없다. 파생본(.min)의 내용을 해시해 그 값을 쓴다.
    바뀌지 않은 파일은 값도 그대로라 캐시가 그대로 살아 있고,
    바뀐 파일만 새 값을 받는다. 사람이 기억할 것이 하나 줄어든다.
    """
    import hashlib, re
    keys = ["assets/css/style.min.css", "assets/js/main.min.js",
            "assets/js/i18n.min.js", "assets/js/data.min.js"]
    h = hashlib.sha1()
    for k in keys:
        f = os.path.join(ROOT, k)
        if os.path.exists(f):
            h.update(io.open(f, "rb").read())
    stamp = h.hexdigest()[:8]

    n = 0
    for html in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
        s = io.open(html, encoding="utf-8").read()
        # ?v123 같은 옛 번호도, 이전 해시도 모두 새 해시로 바꾼다
        s2 = re.sub(r"\?v[0-9a-f]{2,10}(?=[\"'])", "?v" + stamp, s)
        if s2 != s:
            io.open(html, "w", encoding="utf-8").write(s2)
            n += 1
    print("캐시 무효화: ?v%s (%d개 파일)" % (stamp, n))


def run():
    restamp_site_url()
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

    # 파생본을 다 만든 뒤에 해시를 찍는다 — 순서가 뒤바뀌면 옛 내용으로 해시한다
    restamp_cache_bust()


if __name__ == "__main__":
    run()
