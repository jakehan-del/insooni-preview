"""라이브 insooni.com 사랑방 — 팬이 하는 그대로 한 바퀴. 스스로 치운다.
실행: playwright 가 있는 파이썬으로 `python scripts/check_live_fan.py`
⚠️ 운영 DB 에 검수 대기 글 1줄을 실제로 쓰고 몇 초 안에 지운다(같은 토큰 재시도 = not_found 로 확인).
   공개 줄기에는 한 번도 오르지 않는다. 자유글만 쓴다 — 칩 문구는 즉시 공개되므로 쓰지 않는다.

폰 화면에서: 접힘 열기 → 자유글(칩 문구 아님 = 검수 대기, 공개 안 됨) 남기기
→ 완료 상자 확인 → 「내가 남긴 글」 확인 → 지금 지우기 → 확인창 수락
→ 서버 응답 was=pending 확인 → 같은 토큰으로 다시 지우기 = not_found (행이 정말 없다)
→ 공개 줄기에 시험 글이 한 번도 나타나지 않았는지 확인.
"""
import json, sys, time
from playwright.sync_api import sync_playwright

URL = "https://insooni.com/community.html"
STAMP = time.strftime("%H%M%S")
BODY = "자동 점검 %s — 곧 스스로 지워지는 시험 글입니다" % STAMP
R, rpc_log = [], []

def chk(name, ok, info=""):
    R.append((name, bool(ok), info))

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={"width": 375, "height": 812}, is_mobile=True, has_touch=True,
                         device_scale_factor=2, locale="ko-KR")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text[:120]))

    def on_resp(r):
        if "/rest/v1/rpc/" in r.url:
            try: body = r.json()
            except Exception: body = None
            rpc_log.append((r.url.rsplit("/", 1)[-1], r.status, body))
    pg.on("response", on_resp)
    dialogs = []
    pg.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))

    pg.goto(URL, wait_until="networkidle", timeout=45000)
    pg.evaluate("document.getElementById('sb-fold').open = true")
    pg.locator("#sb-body").fill(BODY)
    pg.locator("#sb-name").fill("점검")
    pg.locator("#sb-form button[type=submit]").click()
    pg.wait_for_selector("#sb-done:not([hidden])", timeout=20000)

    sub = [x for x in rpc_log if x[0] in ("submit_note", "submit_preset")]
    chk("자유글은 submit_note 로 간다(칩 아님)", sub and sub[-1][0] == "submit_note", sub[-1][:2] if sub else "없음")
    res = sub[-1][2] if sub else {}
    token = (res or {}).get("token")
    chk("서버 접수 ok · 즉시공개 아님", res and res.get("ok") and not res.get("instant"), json.dumps(res, ensure_ascii=False)[:120])
    chk("완료 상자 문구", pg.locator("#sb-done-head").inner_text().strip(), pg.locator("#sb-done-head").inner_text()[:60])
    chk("지금 지우기 버튼 보임", pg.locator("#sb-cancel").is_visible())
    mine = json.loads(pg.evaluate("localStorage.getItem('insooni_my_notes') || '[]'"))
    chk("이 기기 목록에 저장(토큰 일치)", any(m.get("t") == token for m in mine), "%d개" % len(mine))
    chk("「내가 남긴 글」 나타남", pg.locator("#sb-mine").is_visible(), pg.locator("#sb-mine-n").inner_text())
    stream_before = pg.locator("#sb-rows").inner_text()

    pg.locator("#sb-cancel").click()
    pg.wait_for_timeout(4000)
    wd = [x for x in rpc_log if x[0] == "withdraw_note"]
    chk("확인창이 먼저 뜸", dialogs, dialogs[-1][:40] if dialogs else "")
    chk("withdraw_note HTTP 200", wd and wd[-1][1] == 200, wd[-1][:2] if wd else "호출 없음")
    chk("지운 것 = 검수 대기 글", wd and (wd[-1][2] or {}).get("was") == "pending", json.dumps(wd[-1][2] if wd else None, ensure_ascii=False))
    chk("완료 상자 닫힘", not pg.locator("#sb-done").is_visible())
    mine2 = json.loads(pg.evaluate("localStorage.getItem('insooni_my_notes') || '[]'"))
    chk("이 기기 목록에서도 빠짐", not any(m.get("t") == token for m in mine2), "%d개" % len(mine2))
    msg = pg.evaluate("(document.getElementById('sb-msg').textContent + ' | ' + document.getElementById('sb-mine-msg').textContent).trim()")

    # 서버에 행이 정말 없는가 — 같은 토큰으로 한 번 더 (지울 것이 없으면 not_found)
    again = pg.evaluate("""async (tok) => {
      const c = window.INSOONI_CONFIG || {};
      const r = await fetch(c.url + '/rest/v1/rpc/withdraw_note', {method:'POST',
        headers:{apikey:c.anonKey, 'Content-Type':'application/json'}, body: JSON.stringify({p_token: tok})});
      return [r.status, await r.json()];
    }""", token)
    chk("같은 토큰 재시도 → not_found (행 없음)", again[1].get("reason") == "not_found", json.dumps(again, ensure_ascii=False)[:100])

    pg.reload(wait_until="networkidle")
    pg.wait_for_timeout(2500)
    stream_after = pg.locator("#sb-rows").inner_text()
    chk("공개 줄기에 시험 글이 나타난 적 없음", STAMP not in stream_before and STAMP not in stream_after)
    chk("페이지 오류 0", not errs, "; ".join(errs[:3]))
    br.close()

for n, ok, info in R:
    print(("  ✓ " if ok else "  ✗ ") + n + (("  — " + str(info)) if info not in ("", None) else ""))
print("안내문:", msg if 'msg' in dir() else "")
print("통과 %d/%d" % (sum(1 for x in R if x[1]), len(R)))
sys.exit(0 if all(x[1] for x in R) else 1)
