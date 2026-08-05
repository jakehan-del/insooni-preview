#!/usr/bin/env python3
"""번역 사전 무결성 검사.

왜 필요한가 — applyLang 은 사전에 키가 없으면 **조용히 한국어를 그대로 둔다.**
오류도 경고도 없다. 그래서 사람이 EN 화면을 눈으로 훑기 전까지 아무도 모른다.
실제로 이 검사기를 처음 돌렸을 때 t() 키 9개가 사라진 채 배포돼 있었다.

또 하나 — JS 객체 리터럴의 중복 키는 문법 오류가 아니라 **뒤 값이 이긴다.**
node 문법 검사로는 절대 안 잡힌다. 실제로 3건이 틀린 값으로 이기고 있었다.

종료코드: 문제 있으면 1, 없으면 0.
"""
import collections
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ATTRS = ["data-i18n", "data-i18n-aria", "data-i18n-alt", "data-i18n-ph", "data-i18n-roledesc"]
KEY_RE = re.compile(r'^\s*"([\w.\-]+)"\s*:', re.M)


def main():
    i18n_path = ROOT / "assets/js/i18n.js"
    src = i18n_path.read_text(encoding="utf-8")
    all_keys = KEY_RE.findall(src)
    keys = set(all_keys)

    problems = []

    # 1) 중복 키 — 나중 정의가 이기므로 앞의 (대개 옳은) 값이 죽는다
    for k, n in collections.Counter(all_keys).items():
        if n > 1:
            problems.append("중복 키 %r (%d회) — 뒤 정의가 앞을 덮는다" % (k, n))

    # 2) JS 의 t("키", "한국어 폴백") 중 사전에 없는 키
    for f in sorted((ROOT / "assets/js").glob("*.js")):
        if f.name.endswith(".min.js") or f.name == "i18n.js":
            continue
        s = f.read_text(encoding="utf-8")
        for m in re.finditer(r'\bt\(\s*"([\w.\-]+)"\s*,\s*"([^"]*)"', s):
            key, ko = m.group(1), m.group(2)
            if key not in keys and re.search(r"[가-힣]", ko):
                line = s[: m.start()].count("\n") + 1
                problems.append("%s:%d  t(%r) 키 없음 → EN 에서 한국어로 남는다" % (f.name, line, key))

    # 3) HTML 의 data-i18n* 속성 중 사전에 없는 키
    for f in sorted(ROOT.glob("*.html")):
        s = f.read_text(encoding="utf-8")
        for attr in ATTRS:
            for m in re.finditer(attr + r'="([\w.\-]+)"', s):
                if m.group(1) not in keys:
                    line = s[: m.start()].count("\n") + 1
                    problems.append("%s:%d  %s=%r 키 없음" % (f.name, line, attr, m.group(1)))

    if problems:
        print("번역 사전 문제 %d건" % len(problems))
        for p in problems:
            print("  -", p)
        return 1
    print("번역 사전 정상 — 키 %d개, 누락 0, 중복 0" % len(keys))
    return 0


if __name__ == "__main__":
    sys.exit(main())
