"""라이브 insooni.com 사랑방 카페 — 팬이 폰으로 처음 들어와 보는 그대로. 읽기만 한다.
실행: playwright 가 있는 파이썬으로 `python scripts/check_live_fan.py`

운영 DB 에 아무것도 쓰지 않는다(로그인·글쓰기 없음). 쓰기 흐름은 가짜 서버로
check_board_ui.py 가 본다 — 라이브에서 시험 글을 쓰면 실제 팬 목록·알림에 섞인다.

(2026-10-02 이전 이 파일은 '한 줄 남기기'를 실제로 쓰고 지웠다. 카페 게시판으로 바뀌며 그 기능이 없어졌다.)

보는 것: 카페 탭 6개 · 인순이의 편지 2편이 열림 · 뒤로 가기 · 스위치 상태에 맞는 화면
(꺼짐 = 닫힘 안내, 켜짐 = 서버 목록과 회원·글 숫자) · 글쓰기 → 회원 창 · JS 오류·실패 요청 0.
"""
import sys
from playwright.sync_api import sync_playwright

B = "https://insooni.com/"
R = []


def t(name, ok, info=""):
    R.append((name, bool(ok), str(info)[:160]))


with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, has_touch=True, locale="ko-KR")
    pg = ctx.new_page()
    pg.set_default_timeout(10000)
    errs, bad = [], []
    pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    pg.on("console", lambda m: m.type == "error" and errs.append("console: " + m.text[:140]))
    pg.on("requestfailed", lambda r: bad.append(r.url[:100]))
    pg.on("response", lambda r: r.status >= 400 and bad.append("%d %s" % (r.status, r.url[:100])))
    pg.goto(B + "community", wait_until="load")
    pg.wait_for_timeout(2500)

    on = pg.evaluate("!!(window.INSOONI_CONFIG || {}).board")
    tabs = pg.evaluate("[...document.querySelectorAll('.cafe-menu a')].map(a => a.textContent.trim())")
    t("1 카페 탭 6개", tabs == ["전체글", "공지", "인순이의 편지", "가입인사", "자유게시판", "공연·방송 후기"], tabs)
    t("2 옛 '한 줄 남기기'가 남아 있지 않음", pg.locator("#sb-today, #sb-stream, #sb-fold").count() == 0)
    t("3 전체글 위에 '인순이의 편지' 고정 줄", "인순이가 팬들에게" in pg.inner_text("#bd-pins"), pg.inner_text("#bd-pins")[:60])
    if on:
        t("4 (스위치 켜짐) 닫힘 안내 없음 · 글쓰기 버튼", not pg.is_visible("#cafe-closed") and pg.is_visible("#bd-write-btn"))
        stat = pg.inner_text("#cafe-stat")
        t("5 (스위치 켜짐) 회원·글 숫자가 서버에서 옴", "회원" in stat and "명" in stat, stat)
        pg.click("#bd-write-btn")
        pg.wait_for_timeout(800)
        sh = pg.inner_text("#bd-sheet") if pg.is_visible("#bd-sheet") else ""
        kk = pg.evaluate("(window.INSOONI_CONFIG || {}).kakao === true")
        if kk:
            t("6 (스위치 켜짐) 로그인 전 글쓰기 → 회원 창(카카오·이메일)", "카카오로 시작하기" in sh and "처음 가입" in sh, sh[:80])
        else:   # config.kakao=false — 카카오 동의항목이 덜 끝난 동안 버튼을 숨긴다
            t("6 (스위치 켜짐·카카오 숨김) 로그인 전 글쓰기 → 회원 창(이메일만, 카카오 버튼 없음)",
              "카카오로 시작하기" not in sh and "처음 가입" in sh and "로그인" in sh, sh[:80])
        pg.keyboard.press("Escape")
    else:
        t("4 (스위치 꺼짐) 닫힘 안내 · 글쓰기 버튼 없음", pg.is_visible("#cafe-closed") and not pg.is_visible("#bd-write-btn"))
    pg.evaluate("document.getElementById('main').__keep = 1")
    pg.click(".cafe-menu a[data-b=letters]")
    pg.wait_for_timeout(800)
    t("7 '인순이의 편지' 두 편", pg.locator("#bd-list .cafe-row").count() == 2)
    pg.click("#bd-list .cafe-row >> nth=0 >> a")
    pg.wait_for_timeout(800)
    t("8 편지가 열림(원문 손글씨)", len(pg.inner_text("#cafe-post .letter-body")) > 20)
    pg.go_back()
    pg.wait_for_timeout(800)
    t("9 뒤로 가기 → 편지 목록 · 본문을 새로 받지 않음", pg.is_visible("#cafe-list")
      and pg.evaluate("document.getElementById('main').__keep") == 1, pg.evaluate("location.hash"))
    over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    t("10 폰에서 가로 넘침 없음", over <= 1, over)
    t("11 JS 오류 0", not errs, errs[:3])
    t("12 실패한 요청 0", not bad, bad[:4])
    print("스위치:", "켜짐" if on else "꺼짐")
    br.close()

fail = 0
for n, ok, info in R:
    fail += not ok
    print(("  ✓ " if ok else "  ✗ ") + n + ("" if ok else "   ← " + info))
print("\n%d/%d 통과" % (len(R) - fail, len(R)))
sys.exit(1 if fail else 0)
