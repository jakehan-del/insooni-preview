# 실행: 사이트 루트에서 `python3 -m http.server 8908` 을 띄운 뒤 playwright 파이썬으로.
# Supabase 요청은 전부 가짜 서버가 받는다 — 운영 DB 에 글이 들어가지 않는다.
# 사랑방 '내 글 지우기' + 운영자 화면 — 실제 브라우저로 눌러 본다.
# Supabase 로 가는 요청은 전부 가짜 서버가 받는다. 운영 DB 에 테스트 글이 들어가면 안 된다.
# 가짜 서버가 처리하지 못한 요청은 막고(abort) 기록한다 — 하나라도 있으면 실패다.
import json, sys, time
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

B = "http://127.0.0.1:8908/"
SUPA = "vxrazyiqvdwgvgpkkitm.supabase.co"
R = []
def check(name, ok, info=""):
    R.append((name, bool(ok), info))

class Fake:
    """사랑방과 운영 화면이 부르는 Supabase 를 흉내 낸다."""
    def __init__(self, withdraw_404=False, admin=True, list_status=200, whoami_status=200):
        self.notes = {}          # token -> status
        self.seq = 0
        self.calls = []          # (name, body)
        self.unhandled = []
        self.withdraw_404 = withdraw_404
        self.admin = admin
        self.list_status = list_status
        self.whoami_status = whoami_status
        self.rows = [
            {"kind": "note", "id": 11, "name": "<b>홍천</b>", "content": "<img src=x onerror=\"window.__xss=1\">오늘도 건강하세요",
             "status": "pending", "ai_verdict": "ok", "ai_reason": "평범한 응원", "created_at": "2026-10-01T05:10:00Z",
             "preset": None, "song_title": None},
            {"kind": "dream", "id": 7, "name": None, "content": "무대에서 노래하기", "status": "pending",
             "ai_verdict": "review", "ai_reason": "판단이 갈림", "created_at": "2026-09-30T02:00:00Z",
             "preset": None, "song_title": None},
        ]

    def handle(self, route):
        req = route.request
        u = urlparse(req.url)
        path = u.path
        body = {}
        try:
            body = json.loads(req.post_data or "{}")
        except Exception:
            pass
        auth = req.headers.get("authorization", "")
        J = lambda obj, status=200: route.fulfill(status=status, content_type="application/json", body=json.dumps(obj))

        # ── 인증 ──
        if path == "/auth/v1/token":
            gt = parse_qs(u.query).get("grant_type", [""])[0]
            self.calls.append(("auth:" + gt, {k: ("***" if k == "password" else v) for k, v in body.items()}))
            if gt == "password":
                if body.get("password") == "right-pass":
                    return J({"access_token": "AT", "refresh_token": "RT", "expires_in": 3600,
                              "user": {"email": body.get("email")}})
                return J({"error": "invalid_grant", "error_description": "Invalid login credentials"}, 400)
            if gt == "refresh_token":
                return J({"access_token": "AT2", "refresh_token": "RT2", "expires_in": 3600, "user": {"email": "m@x"}})
        if path == "/auth/v1/logout":
            self.calls.append(("auth:logout", {}))
            return route.fulfill(status=204, body="")

        # ── RPC ──
        if path.startswith("/rest/v1/rpc/"):
            name = path.rsplit("/", 1)[1]
            self.calls.append((name, body))
            if name == "submit_note":
                self.seq += 1; tok = "tok-%d" % self.seq; self.notes[tok] = "pending"
                return J({"ok": True, "token": tok})
            if name == "submit_preset":
                self.seq += 1; tok = "tok-%d" % self.seq; self.notes[tok] = "approved"
                return J({"ok": True, "token": tok, "instant": True})
            if name == "withdraw_note":
                if self.withdraw_404:
                    return J({"code": "PGRST202", "message": "Could not find the function"}, 404)
                tok = body.get("p_token")
                if tok in self.notes:
                    was = self.notes.pop(tok); return J({"ok": True, "was": was})
                return J({"ok": False, "reason": "not_found"})
            if name == "cancel_note":
                tok = body.get("p_token")
                if self.notes.get(tok) == "pending":
                    self.notes.pop(tok); return J({"ok": True})
                if tok in self.notes: return J({"ok": False, "reason": "already_published"})
                return J({"ok": False, "reason": "not_found"})
            if name == "note_status":
                tok = body.get("p_token")
                if tok in self.notes: return J({"ok": True, "status": self.notes[tok]})
                return J({"ok": False, "reason": "not_found"})
            # 운영자 함수 — 로그인 토큰이 없으면 Supabase 처럼 거절
            if name.startswith("admin_"):
                if not auth.startswith("Bearer AT"):
                    return J({"message": "permission denied"}, 401)
                if name == "admin_whoami":
                    if self.whoami_status != 200: return J({"code": "PGRST202"}, self.whoami_status)
                    return J({"ok": True, "signed_in": True, "admin": self.admin, "email": "manager@test.local"})
                if not self.admin:
                    return J({"ok": False, "reason": "forbidden"})
                if name == "admin_list":
                    if self.list_status != 200: return J({"message": "JWT expired"}, self.list_status)
                    st = body.get("p_status")
                    rows = [r for r in self.rows if r["status"] == st]
                    cnt = {s: sum(1 for r in self.rows if r["status"] == s) for s in ("pending", "approved", "rejected")}
                    return J({"ok": True, "rows": rows, "counts": cnt})
                if name == "admin_set_status":
                    for r in self.rows:
                        if r["kind"] == body.get("p_kind") and r["id"] == body.get("p_id"):
                            frm = r["status"]; r["status"] = body.get("p_status")
                            return J({"ok": True, "from": frm, "status": r["status"]})
                    return J({"ok": False, "reason": "not_found"})
            self.unhandled.append(req.method + " " + path)
            return route.abort()

        # ── 공개 뷰 읽기 ──
        if path.startswith("/rest/v1/"):
            view = path.rsplit("/", 1)[1]
            self.calls.append(("view:" + view, {}))
            if view == "presets":
                return J([{"n": 1, "ko": "오늘도 건강하세요", "en": "Stay well"},
                          {"n": 2, "ko": "멀리서 응원합니다", "en": "Cheering from afar"}])
            return J([])

        self.unhandled.append(req.method + " " + path)
        return route.abort()


def names(f): return [c[0] for c in f.calls]

with sync_playwright() as p:
    br = p.chromium.launch()

    # ════════════ A. 사랑방 — 내 글 지우기 ════════════
    def community(fake, prep=None):
        ctx = br.new_context(viewport={"width": 390, "height": 844})
        errs = []
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route("**://%s/**" % SUPA, fake.handle)
        if prep: pg.add_init_script(prep)
        pg.goto(B + "community.html", wait_until="load")
        pg.wait_for_timeout(1500)
        return ctx, pg, errs

    def open_fold(pg):
        pg.evaluate("document.querySelector('#sb-fold').open = true")
        pg.wait_for_timeout(200)

    def send(pg, text):
        pg.fill("#sb-body", text)
        pg.click("#sb-form button[type=submit]")
        pg.wait_for_timeout(800)

    f = Fake()
    ctx, pg, errs = community(f)
    pg.on("dialog", lambda d: d.accept())                          # 확인창에서 '확인'
    open_fold(pg)
    send(pg, "테스트 한 줄입니다")
    check("A1 글 보낸 뒤 '지금 지우기' 보임", pg.is_visible("#sb-cancel"))
    check("A2 '내가 남긴 글' 목록에 1개", pg.is_visible("#sb-mine") and pg.locator("#sb-mine-list li").count() == 1,
          pg.inner_text("#sb-mine") if pg.is_visible("#sb-mine") else "숨음")
    stored = pg.evaluate("localStorage.getItem('insooni_my_notes')")
    check("A3 토큰과 첫머리가 기기에 남음", stored and "tok-1" in stored and "테스트 한 줄" in stored, stored)
    pg.click("#sb-cancel"); pg.wait_for_timeout(800)
    check("A4 지우기 → withdraw_note(tok-1) 호출", ("withdraw_note", {"p_token": "tok-1"}) in f.calls, names(f))
    check("A5 지운 뒤 '지웠습니다' 안내·목록 비움", "지웠습니다" in pg.inner_text("#sb-msg") and pg.is_hidden("#sb-mine"),
          pg.inner_text("#sb-msg"))

    # 칩(바로 오르는 글)도 지울 수 있다 — 예전엔 단추를 숨겼다
    send(pg, "오늘도 건강하세요")
    check("A6 칩으로 바로 오른 글에도 '지금 지우기' 보임", pg.is_visible("#sb-cancel"))
    reloads_before = names(f).count("view:public_notes")
    pg.click("#sb-mine summary"); pg.wait_for_timeout(200)
    pg.click("#sb-mine-list li button"); pg.wait_for_timeout(1000)
    check("A7 목록에서 지우기 → 올라간 글도 지움, '사랑방에서도 사라졌습니다'",
          "사라졌습니다" in pg.inner_text("#sb-mine-msg"), pg.inner_text("#sb-mine-msg"))
    check("A8 올라간 글을 지우면 줄기를 바로 다시 읽음", names(f).count("view:public_notes") > reloads_before,
          "%d→%d" % (reloads_before, names(f).count("view:public_notes")))
    check("A9 지운 글은 서버에도 없음", not f.notes, json.dumps(f.notes))

    ctx.close()

    # 확인창에서 '취소'하면 아무 일도 없다

    f2 = Fake()
    ctx, pg, errs2 = community(f2)
    pg.on("dialog", lambda d: d.dismiss())                         # 확인창에서 '취소'
    open_fold(pg); send(pg, "취소 확인용 글")
    n0 = names(f2).count("withdraw_note")
    pg.click("#sb-cancel"); pg.wait_for_timeout(600)
    check("A10 확인창에서 취소 → 서버 호출 없음·단추 다시 눌림",
          names(f2).count("withdraw_note") == n0 and pg.is_enabled("#sb-cancel") and "tok-1" in f2.notes)
    ctx.close()

    # 008 이 아직 서버에 없을 때(404) — 예전 통로로 물러난다
    f3 = Fake(withdraw_404=True)
    ctx, pg, errs3 = community(f3)
    pg.on("dialog", lambda d: d.accept())
    open_fold(pg); send(pg, "아직 검수 전 글")
    pg.click("#sb-cancel"); pg.wait_for_timeout(800)
    check("A11 서버 준비 전(404) → cancel_note 로 물러나 검수 전 글은 지움",
          "cancel_note" in names(f3) and "tok-1" not in f3.notes and "지웠습니다" in pg.inner_text("#sb-msg"),
          names(f3))
    send(pg, "오늘도 건강하세요"); pg.click("#sb-cancel"); pg.wait_for_timeout(800)
    check("A12 서버 준비 전 + 올라간 글 → 지운 척하지 않고 사실대로 안내",
          "이미 사랑방에 올라간" in pg.inner_text("#sb-msg") and "tok-2" in f3.notes, pg.inner_text("#sb-msg"))
    ctx.close()

    # 예전 방식으로 남은 토큰 하나 → 목록으로 옮겨진다 / 서버에 없으면 정리된다
    f4 = Fake(); f4.notes["old-tok"] = "approved"
    ctx, pg, errs4 = community(f4, "localStorage.setItem('insooni_note_token','old-tok')")
    pg.wait_for_timeout(600)
    check("A13 옛 토큰이 '내가 남긴 글'로 옮겨짐", pg.is_visible("#sb-mine")
          and "이전에 남긴 글" in (pg.text_content("#sb-mine-list") or ""), pg.text_content("#sb-mine"))
    ctx.close()

    # 남이 지웠거나 이미 없는 글 / 글 내용에 태그가 들어 있어도 글자로만
    f5 = Fake()
    ctx, pg, errs5 = community(f5, "localStorage.setItem('insooni_my_notes', JSON.stringify([{t:'gone-tok',b:'<img src=x onerror=window.__xss=1>',at:'2026-09-30T00:00:00Z'}]))")
    pg.on("dialog", lambda d: d.accept())
    pg.wait_for_timeout(400)
    check("A14 목록의 글 내용은 글자로만(태그 실행 안 됨)",
          pg.locator("#sb-mine-list img").count() == 0 and not pg.evaluate("window.__xss"))
    pg.click("#sb-mine summary"); pg.wait_for_timeout(200)
    pg.click("#sb-mine-list li button"); pg.wait_for_timeout(800)
    check("A15 서버에 없는 글 → '찾을 수 없는 글' 안내·목록에서 걷음",
          "찾을 수 없는" in pg.inner_text("#sb-mine-msg") and pg.is_hidden("#sb-mine"), pg.inner_text("#sb-mine-msg"))
    ctx.close()

    allerr = errs + errs2 + errs3 + errs4 + errs5
    check("A16 사랑방 화면 JS 오류 0", not allerr, allerr[:2])
    leak = f.unhandled + f2.unhandled + f3.unhandled + f4.unhandled + f5.unhandled
    check("A17 가짜 서버가 못 받은 요청 0 (운영 DB 로 새는 것 없음)", not leak, leak[:4])

    # ════════════ B. 운영자 화면 ════════════
    def admin(fake, w=390, h=844):
        ctx = br.new_context(viewport={"width": w, "height": h})
        errs = []
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route("**://%s/**" % SUPA, fake.handle)
        pg.goto(B + "admin.html", wait_until="load")
        pg.wait_for_timeout(500)
        return ctx, pg, errs

    def login(pg, pw):
        pg.fill("#adm-email", "manager@test.local")
        pg.fill("#adm-pw", pw)
        pg.click("#adm-login-btn")
        pg.wait_for_timeout(900)

    g = Fake()
    ctx, pg, eb = admin(g)
    check("B1 처음엔 로그인 화면", pg.is_visible("#adm-login") and pg.is_hidden("#adm-app"))
    login(pg, "wrong")
    check("B2 틀린 비밀번호 → 안내·비밀번호칸 비움",
          "맞지 않습니다" in pg.inner_text("#adm-login-msg") and pg.input_value("#adm-pw") == "",
          pg.inner_text("#adm-login-msg"))
    login(pg, "right-pass")
    check("B3 맞으면 운영 화면·이메일 표시", pg.is_visible("#adm-app") and "manager@test.local" in pg.inner_text("#adm-who"))
    check("B4 대기 개수 2 · 목록 2", pg.inner_text("[data-n=pending]") == "2" and pg.locator("#adm-list .adm-item").count() == 2,
          pg.inner_text("[data-n=pending]"))
    first = pg.inner_text("#adm-list .adm-item >> nth=0")
    check("B5 팬 글 속 태그는 글자로만(실행·요소 생성 없음)",
          pg.locator("#adm-list img, #adm-list b").count() == 0 and not pg.evaluate("window.__xss")
          and "<img" in first and "<b>홍천</b>" in first, first[:80])
    check("B6 AI 소견 표시", "괜찮아 보임" in first and "평범한 응원" in first)
    stores = pg.evaluate("JSON.stringify({s: sessionStorage, l: localStorage})")
    check("B7 비밀번호가 어디에도 저장되지 않음", "right-pass" not in stores, stores[:120])
    pg.click("#adm-list .adm-item >> nth=0 >> text=올리기"); pg.wait_for_timeout(700)
    sent = [c for c in g.calls if c[0] == "admin_set_status"]
    check("B8 올리기 → admin_set_status(note, 11, approved)",
          sent and sent[-1][1] == {"p_kind": "note", "p_id": 11, "p_status": "approved"}, sent)
    check("B9 처리한 글은 목록에서 빠지고 숫자가 바뀜",
          pg.locator("#adm-list .adm-item").count() == 1 and pg.inner_text("[data-n=pending]") == "1"
          and pg.inner_text("[data-n=approved]") == "1")
    pg.click(".adm-tab[data-status=approved]"); pg.wait_for_timeout(600)
    lst = [c for c in g.calls if c[0] == "admin_list"]
    check("B10 '올라간 글' 탭 → approved 목록·'내리기'만", lst[-1][1].get("p_status") == "approved"
          and pg.locator("#adm-list .adm-item button").count() == 1
          and pg.inner_text("#adm-list .adm-item button") == "내리기")
    check("B11 '지우기' 단추는 어디에도 없음", pg.locator("button", has_text="지우기").count() == 0)
    pg.click("#adm-out"); pg.wait_for_timeout(500)
    check("B12 로그아웃 → 세션 비움·서버 세션도 닫음",
          pg.is_visible("#adm-login") and pg.evaluate("sessionStorage.getItem('insooni_admin_session')") is None
          and "auth:logout" in names(g))
    ctx.close()

    g2 = Fake(admin=False)
    ctx, pg, eb2 = admin(g2); login(pg, "right-pass")
    check("B13 명단에 없는 계정 → 운영 화면 안 열림·'등록되어 있지 않습니다'",
          pg.is_hidden("#adm-app") and "등록되어 있지 않습니다" in pg.inner_text("#adm-login-msg"),
          pg.inner_text("#adm-login-msg"))
    ctx.close()

    g3 = Fake(list_status=401)
    ctx, pg, eb3 = admin(g3); login(pg, "right-pass")
    check("B14 세션 만료(401) → 로그인으로·'로그인이 끝났습니다'",
          pg.is_visible("#adm-login") and "로그인이 끝났습니다" in pg.inner_text("#adm-login-msg"))
    ctx.close()

    g4 = Fake(whoami_status=404)
    ctx, pg, eb4 = admin(g4); login(pg, "right-pass")
    check("B15 서버 준비 전(404) → '008 이 아직 실행되지 않았습니다'",
          pg.is_visible("#adm-sys") and "008" in pg.inner_text("#adm-sys"), pg.inner_text("#adm-sys") if pg.is_visible("#adm-sys") else "")
    ctx.close()

    g5 = Fake()
    ctx, pg, eb5 = admin(g5, 1280, 800); login(pg, "right-pass")
    pass  # 스크린숏은 필요할 때만
    ctx.close()

    berr = eb + eb2 + eb3 + eb4 + eb5
    check("B16 운영 화면 JS 오류 0", not berr, berr[:2])
    leak = g.unhandled + g2.unhandled + g3.unhandled + g4.unhandled + g5.unhandled
    check("B17 가짜 서버가 못 받은 요청 0", not leak, leak[:4])
    br.close()

fail = 0
for n, ok, info in R:
    if not ok: fail += 1
    print(("  ✓ " if ok else "  ✗ ") + n + ("" if ok else "   ← " + str(info)[:160]))
print("\n%d/%d 통과" % (len(R) - fail, len(R)))
sys.exit(1 if fail else 0)
