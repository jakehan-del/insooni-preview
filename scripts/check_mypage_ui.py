# 실행: 사이트 루트를 http://127.0.0.1:8908 로 띄운 뒤 playwright 파이썬으로 `python scripts/check_mypage_ui.py`
#       (`--quick` 이면 뮤테이션을 건너뛴다 · 'S4 S8' 처럼 장면만 골라 돌릴 수 있다)
# 내 정보(마이페이지 community.html#me) · 가입 질문 '좋아하는 인순이 노래' · 운영 화면 회원 탭의 '내 노래' —
# 실제 브라우저로 사람처럼 끝까지 눌러 본다(2026-10-03, 진해아트홀 공연 당일).
# Supabase 로 가는 요청은 전부 가짜 서버가 받는다 — check_board_ui.Fake(010) 위에 check_concert_ui.GigFake(011),
# 그 위에 013 함수(member_page·member_my_posts·member_my_comments·member_set_song·admin_member_songs)를 흉내 낸다.
# 운영 DB·카카오·메일로 새는 것이 없다. 가짜 서버가 처리하지 못한 요청이 하나라도 있으면 실패다.
# 마지막에 board.js(·style.css·admin.js)를 일부러 망가뜨린 사본으로 해당 장면을 다시 돌려, 검사가 잡는지 본다(뮤테이션).
import json, re, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
_ARGV = sys.argv[:]
sys.argv = sys.argv[:1]          # 아래 두 모듈은 import 할 때 sys.argv 로 자기 장면을 고른다 — 섞이지 않게
import check_board_ui as M       # 가짜 Supabase(010) + 013 흉내 — __main__ 가드라 import 해도 돌지 않는다
import check_cafe_v4 as V        # 화면 측정 JS(채운 단추·한글 모노·대비·점선·넘침) — 같은 기준을 쓴다
import check_concert_ui as C     # GigFake(011) · seed · ctx_of(/live 를 live.html 로)
sys.argv = _ARGV
from playwright.sync_api import sync_playwright

B = M.B
QUICK = "--quick" in sys.argv
ONLY = {a for a in sys.argv[1:] if not a.startswith("--")} or None
BOARD_SRC = (ROOT / "assets/js/board.js").read_text(encoding="utf-8")
ADMIN_SRC = (ROOT / "assets/js/admin.js").read_text(encoding="utf-8")
ON = "{board: true, kakao: true, live: true, mypage: true}"       # 013 이 운영에 올라간 뒤
OFF = "{board: true, kakao: true, live: true}"                    # 지금 운영(스위치 꺼짐 — config.js 기본값)
R = []


def t(name, ok, info=""):
    R.append((name, bool(ok), str(info)[:260]))
    print(("  ✓ " if ok else "  ✗ ") + name + ("" if ok else "   ← " + str(info)[:260]), flush=True)


class MeFake(C.GigFake):
    """GigFake(010+011) — 공연 방명록 글의 공연 꼬리표만 013 member_my_posts 처럼 붙인다."""

    def _gig_of_post(self, p):
        e = next((x for x in self.events if x["id"] == p.get("gig_id")), None)
        return e and {"code": e["code"], "title_ko": e["title_ko"], "title_en": e["title_en"]}


def seed(f):
    """운영자 · 정회원 2 · 새싹(자동) · 쉬는 중 · 카카오(가입 전) · 공개 공연 K7Q2M(지금 열림, C.seed) 위에 내 정보 자료."""
    w = C.seed(f)
    sp, mem = w["sprout"], w["mem"]
    ids = {}
    for i, (key, st) in enumerate([("ok", "approved"), ("wait", "pending"), ("down", "rejected")]):
        pid = f.nid()
        f.posts.append({"id": pid, "uid": sp, "board": ("free", "hello", "free")[i], "title": "새싹의 %s 글" % ("공개된", "확인 중인", "내려진")[i],
                        "body": "본문", "status": st, "created_at": "2026-09-2%dT01:00:00Z" % (i + 1)})
        ids[key] = pid
    gp = f.nid()
    f.posts.append({"id": gp, "uid": sp, "board": "review", "title": "부산 공연 방명록", "body": "최고", "status": "approved",
                    "created_at": "2026-09-25T01:00:00Z", "gig_id": w["ev"]["id"]})
    ids["gig"] = gp
    op = f.nid()
    f.posts.append({"id": op, "uid": mem, "board": "free", "title": "홍천에서 인사드립니다", "body": "x", "status": "approved",
                    "created_at": "2026-09-20T00:00:00Z"})
    gone = f.nid()
    f.posts.append({"id": gone, "uid": mem, "board": "free", "title": "남의 내려간 글", "body": "x", "status": "rejected",
                    "created_at": "2026-09-20T00:30:00Z"})
    ids["op"], ids["gone"] = op, gone
    cm = []
    for body, post, st in [("반갑습니다 홍천 이웃님", op, "approved"), ("저도 다녀왔어요", ids["ok"], "approved"),
                           ("내려간 글에 남긴 댓글", gone, "approved"), ("확인 기다리는 댓글", op, "pending")]:
        cid = f.nid()
        f.comments.append({"id": cid, "post": post, "uid": sp, "body": body, "status": st, "created_at": "2026-09-26T0%d:00:00Z" % (len(cm) + 1)})
        cm.append(cid)
    ids["cm"] = cm
    f.checkins[(w["ev"]["id"], sp)] = "2026-10-18T10:05:00.000Z"
    staff = f.add_user("staffset@test.local", "pw", confirmed=True)
    f.members[staff] = {"nickname": "정해진새싹", "level": "sprout", "level_by": "admin"}
    w["staffset"] = staff
    many = f.add_user("many@test.local", "pw", confirmed=True)
    f.members[many] = {"nickname": "글많은팬", "level": "member", "level_by": "auto"}
    for i in range(25):
        f.posts.append({"id": f.nid(), "uid": many, "board": "free", "title": "많은 글 %02d" % i, "body": "b", "status": "approved",
                        "created_at": "2026-08-%02dT01:00:00Z" % (i + 1)})
    w["many"] = many
    w["ids"] = ids
    return w


def ctx(br, f, w=375, h=812, conf=ON, fs=17, who=None, lang=None, src=None, css=None, admin_src=None, admin_who=None, vv=None):
    """C.ctx_of 위에 — board.js 사본(뮤테이션) · 덧댄 CSS(뮤테이션) · 자판(visualViewport) 흉내."""
    extra = ""
    if css:
        extra += "document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = %s; document.head.appendChild(s); });" % json.dumps(css)
    if vv:
        extra += ("Object.defineProperty(window, 'visualViewport', {configurable: true, get: () => ({height: %d, offsetTop: 0, width: %d,"
                  " addEventListener() {}, removeEventListener() {}})});" % (vv, w))
    c = C.ctx_of(br, f, w, h, conf=conf, fs=fs, session=C.sess(f, who) if who else None, lang=lang,
                 admin_session=C.admin_session(f, admin_who) if admin_who else None, init_extra=extra)
    # 사본은 이 맥락에 묶어 둔다(C.BOARD_SRC 는 요청 때 읽는 전역이라 돌려놓으면 빈 응답이 된다 — 대조군이 잡았다)
    # (playwright 는 인자 둘인 처리기에 request 를 넘긴다 — 기본값 인자로 묶지 말고 닫힘으로)
    def serve(body):
        return lambda r: r.fulfill(status=200, content_type="text/javascript", body=body)
    if src is not None:
        c.route(re.compile(r".*/assets/js/board\.min\.js.*"), serve(src))
    if admin_src is not None:
        c.route(re.compile(r".*/assets/js/admin\.min\.js.*"), serve(admin_src))
    return c


class Page:
    """한 장의 페이지 + 오류·콘솔·404 기록"""

    def __init__(self, c):
        self.c = c
        self.pg = c.new_page()
        self.pg.set_default_timeout(6000)
        self.errs, self.cons, self.r404, self.dialogs = [], [], [], []
        # 'Transition was aborted … ViewTransition opt-in disabled' 은 크로뮴이 문서를 새로 여는 이동마다(소식 → 사랑방
        # location.href 한 줄로도) 내는 것이다 — style.css 의 @view-transition { navigation: auto } 때문이고 사이트 JS 와 무관하다.
        # 공연 화면 ↔ 내 정보는 문서를 새로 여는 이동이라 이것만 걸러 낸다(다른 오류는 그대로 센다)
        self.pg.on("pageerror", lambda e: None if "ViewTransition opt-in disabled" in str(e) else self.errs.append(str(e)[:160]))
        # 콘솔 오류 중 서버 함수가 없어서(404) 생긴 것 — 스위치(config.mypage)가 막아야 하는 바로 그것
        self.pg.on("console", lambda m: self.cons.append(m.text[:160]) if m.type == "error" and "404" in m.text else None)
        self.pg.on("response", lambda r: self.r404.append(r.url) if r.status == 404 and "/rest/v1/" in r.url else None)
        self.dismiss_next = 0
        self.pg.on("dialog", self._dialog)

    def _dialog(self, d):
        self.dialogs.append(d.message)
        if self.dismiss_next:
            self.dismiss_next -= 1
            d.dismiss()
        else:
            d.accept()

    def go(self, url, wait=1500):
        self.pg.goto("about:blank")
        self.pg.goto(B + url, wait_until="load")
        self.pg.wait_for_timeout(wait)

    def txt(self, sel):
        return self.pg.inner_text(sel) if self.pg.locator(sel).count() and self.pg.is_visible(sel) else ""

    def js(self, code, arg=None):
        return self.pg.evaluate(code, arg) if arg is not None else self.pg.evaluate(code)


def calls(f, name):
    return [c for c in f.calls if c[0] == name]


F013 = M.F013
ME = "#cafe-me"


# ═══ 장면 ═══════════════════════════════════════════════════════════════
def s1(br, src=None, css=None):
    """헤더의 '내 정보'(모든 페이지) → 내 정보 화면(#me) — 라우터로(<main> 만), 창이 아니다"""
    f = MeFake(); w = seed(f)
    c = ctx(br, f, 375, 812, who=w["sprout"], src=src, css=css); P = Page(c); pg = P.pg
    P.go("news.html")
    pop0 = P.js("document.getElementById('hm').getAttribute('aria-haspopup')")
    P.js("window.__keep = 1")
    pg.click(".nav-toggle"); pg.wait_for_timeout(600)
    pg.click(".nav-member-b"); pg.wait_for_timeout(1600)
    d = P.js("""() => ({url: location.pathname + location.hash, keep: window.__keep === 1, sheet: !!document.querySelector('#bd-sheet:not([hidden])'),
      me: document.getElementById('cafe-me') && !document.getElementById('cafe-me').hidden, isMe: document.getElementById('board').classList.contains('is-me'),
      tabs: document.querySelector('.cafe-menu').checkVisibility(), write: document.getElementById('bd-write-btn').checkVisibility(),
      h: (document.querySelector('#cafe-me .me-h') || {}).textContent || '', focus: document.activeElement && document.activeElement.className,
      top: Math.round(document.getElementById('cafe-me').getBoundingClientRect().top), hb: Math.round(document.querySelector('.site-header').getBoundingClientRect().bottom)})""")
    t("S1a 소식(폰) → 메뉴의 회원 입구 → community.html#me · 라우터(<main> 만, 문서 그대로) · 창 아님 · 탭·글쓰기 숨김 · 제목 '내 정보 대전 아줌마' · 초점 제목 · 헤더 바로 아래(+8±4)",
      d["url"] == "/community.html#me" and d["keep"] and not d["sheet"] and d["me"] and d["isMe"] and not d["tabs"] and not d["write"]
      and d["h"] == "내 정보대전 아줌마" and "me-h" in (d["focus"] or "") and abs(d["top"] - d["hb"] - 8) <= 4 and pop0 is None, (d, pop0))
    c.close()
    # 1280 — 헤더 입구를 바로 누름 · 로그아웃한 사람의 입구는 '창을 엽니다'(aria-haspopup=dialog) 그대로
    c = ctx(br, f, 1280, 860, who=w["mem"], src=src, css=css); P = Page(c); pg = P.pg
    P.go("about.html")
    pg.click("#hm"); pg.wait_for_timeout(1600)
    d = P.js("({url: location.pathname + location.hash, h: (document.querySelector('#cafe-me .me-h') || {}).textContent || '', sheet: !!document.querySelector('#bd-sheet:not([hidden])')})")
    c.close()
    c = ctx(br, f, 1280, 860, src=src, css=css); P2 = Page(c)
    P2.go("about.html")
    pop1 = P2.js("document.getElementById('hm').getAttribute('aria-haspopup')")
    c.close()
    t("S1b 1280 이야기 → 헤더 '내 정보' → #me '홍천팬' · 로그아웃한 사람의 입구만 aria-haspopup=dialog",
      d["url"] == "/community.html#me" and d["h"] == "내 정보홍천팬" and not d["sheet"] and pop1 == "dialog", (d, pop1))
    t("S1z 오류 0 · 가짜 서버 밖 요청 0", not (P.errs or P2.errs) and not f.unhandled, (P.errs, P2.errs, f.unhandled[:2]))


def s2(br, src=None, css=None):
    """등업 진행 · 내가 쓴 글(상태) · 내 댓글(어느 글) · 다녀온 공연 — 숫자는 서버가 센 그대로"""
    f = MeFake(); w = seed(f); sp, ids = w["sprout"], w["ids"]
    c = ctx(br, f, 375, 812, who=sp, src=src, css=css); P = Page(c)
    P.go("community.html#me", 1800)
    np, nc = f.counts(sp)
    d = P.js("""() => { const q = s => [...document.querySelectorAll(s)];
      return {prog: q('#cafe-me .me-prog-i').map(li => [li.querySelector('.me-prog-l').textContent, li.querySelector('.me-prog-n').textContent]),
        line: (document.querySelector('#cafe-me .me-lv .me-line') || {}).textContent || '', hint: (document.querySelector('#cafe-me .me-lv .form-hint') || {}).textContent || '',
        since: (document.querySelector('#cafe-me .me-since') || {}).textContent || '',
        postsH: (document.querySelector('#cafe-me .me-posts .me-sec-h') || {}).textContent || '',
        posts: q('#cafe-me .me-posts .me-row').map(li => ({id: +li.dataset.id, href: (li.querySelector('a') || {}).getAttribute?.('href'),
          title: li.querySelector('.cafe-title').textContent, st: li.querySelector('.me-st').textContent, gig: (li.querySelector('.cafe-gig') || {}).textContent || ''})),
        cmtsH: (document.querySelector('#cafe-me .me-cmts .me-sec-h') || {}).textContent || '',
        cmts: q('#cafe-me .me-cmts .me-row').map(li => ({tag: li.firstElementChild.tagName, href: li.firstElementChild.getAttribute('href'),
          body: li.querySelector('.cafe-title').textContent, on: li.querySelector('.me-on').textContent, st: li.querySelector('.me-st').textContent})),
        stamps: q('#cafe-me .bd-stamp-mini').map(x => x.textContent)}; }""")
    t("S2a 새싹 등업 진행 — '공개된 글 %d / 3' · '공개된 댓글 %d / 5'(서버가 센 공개된 것만) · 확인 기다리는 글 1개 안내" % (np, nc),
      d["prog"] == [["공개된 글", "%d / 3" % np], ["공개된 댓글", "%d / 5" % nc]] and "정회원" in d["line"] and "3개와 댓글 5개" in d["line"]
      and d["hint"] == "확인을 기다리는 글 1개는 공개되면 셉니다.", d)
    t("S2b 등급 줄 — '새싹' · '이메일 계정 · 2026.10.02 가입'", d["since"].startswith("새싹") and "이메일 계정" in d["since"] and "2026.10.02 가입" in d["since"], d["since"])
    want = {p["id"]: p["status"] for p in f.posts if p["uid"] == sp}
    lab = {"approved": "공개", "pending": "확인 중", "rejected": "내려짐"}
    ok_rows = len(d["posts"]) == len(want) and all(r["st"] == lab[want[r["id"]]] and r["href"] == "#p%d" % r["id"] for r in d["posts"]) \
        and [r["id"] for r in d["posts"]] == sorted(want, reverse=True)
    t("S2c 내가 쓴 글 %d — 최신순 · 상태 '공개·확인 중·내려짐'이 서버 상태 그대로 · 누르면 그 글(#p…) · 제목 옆 숫자 = 서버 건수" % len(want),
      ok_rows and d["postsH"] == "내가 쓴 글 %d" % len(want), d["posts"])
    gr = [r for r in d["posts"] if r["id"] == ids["gig"]]
    t("S2d 공연 방명록 글에 공연 이름 꼬리표", gr and gr[0]["gig"] == "인순이 콘서트 〈거위의 꿈〉 부산", gr)
    cm = d["cmts"]
    gone = [x for x in cm if x["body"] == "내려간 글에 남긴 댓글"]
    vis = [x for x in cm if x["body"] == "반갑습니다 홍천 이웃님"]
    t("S2e 내 댓글 4 — 볼 수 있는 글은 링크('‘홍천에서 인사드립니다’에 단 댓글') · 남의 내려간 글은 링크 없음('지금은 볼 수 없는 글에 단 댓글') · 확인 중 표시",
      d["cmtsH"] == "내 댓글 4" and len(cm) == 4 and vis and vis[0]["tag"] == "A" and vis[0]["href"] == "#p%d" % ids["op"]
      and vis[0]["on"] == "‘홍천에서 인사드립니다’에 단 댓글" and gone and gone[0]["tag"] == "DIV" and gone[0]["href"] is None
      and gone[0]["on"] == "지금은 볼 수 없는 글에 단 댓글" and any(x["st"] == "확인 중" and x["body"] == "확인 기다리는 댓글" for x in cm), cm)
    t("S2f 다녀온 공연 — '2026.10.18부산 KBS홀'", d["stamps"] == ["2026.10.18부산 KBS홀"], d["stamps"])
    t("S2g 서버 왕복 한 번(member_page 1) · 첫 쪽에 다음 쪽 요청 없음", len(calls(f, "member_page")) == 1
      and not calls(f, "member_my_posts") and not calls(f, "board_mine"), [c[0] for c in f.calls if c[0].startswith(("member_", "board_mine", "gig_my"))])
    t("S2z 오류 0 · 콘솔 오류 0 · 404 0 · 가짜 서버 밖 요청 0", not P.errs and not P.cons and not P.r404 and not f.unhandled, (P.errs, P.cons[:2], P.r404[:2], f.unhandled[:2]))
    c.close()


def s2x(br, src=None, css=None):
    """팬이 쓴 글·댓글·별명은 신뢰할 수 없는 입력 — 내 정보의 제목·댓글·별명에 태그가 있어도 글자로만"""
    f = MeFake(); w = seed(f); u = w["mem2"]
    f.members[u]["nickname"] = "<i>부산</i>"
    xp = f.nid()
    f.posts.append({"id": xp, "uid": u, "board": "free", "title": '<img src=x onerror="window.__xss=1">태그 제목', "body": "b",
                    "status": "approved", "created_at": "2026-09-19T01:00:00Z"})
    f.comments.append({"id": f.nid(), "post": xp, "uid": u, "body": "<b>굵은</b> 댓글<script>window.__xss=2</script>", "status": "approved",
                       "created_at": "2026-09-19T02:00:00Z"})
    c = ctx(br, f, 375, 812, who=u, src=src, css=css); P = Page(c)
    P.go("community.html#me", 1800)
    d = P.js("""() => ({el: document.querySelectorAll('#cafe-me img, #cafe-me b, #cafe-me i, #cafe-me script').length, x: window.__xss || 0,
      t: document.getElementById('cafe-me').innerText})""")
    t("S2x 태그가 든 글 제목·댓글·별명 → 요소 0 · 실행 0 · '<img'·'<b>굵은</b>'·'<i>부산</i>' 글자 그대로",
      d["el"] == 0 and not d["x"] and "<img" in d["t"] and "<b>굵은</b>" in d["t"] and "<i>부산</i>" in d["t"], (d["el"], d["x"]))
    c.close()


def s3(br, src=None, css=None):
    """내 정보에서 글을 열고 '← 내 정보로' — 다시 받지 않고 보던 자리로"""
    f = MeFake(); w = seed(f); ids = w["ids"]
    c = ctx(br, f, 375, 812, who=w["sprout"], src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html#me", 1800)
    a = pg.locator('#cafe-me .me-posts .me-row[data-id="%d"] a' % ids["wait"])
    a.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    y0 = P.js("scrollY")
    n0 = len(calls(f, "member_page"))
    a.click(); pg.wait_for_timeout(1300)
    d = P.js("""() => ({hash: location.hash, title: (document.querySelector('#cafe-post .cafe-post-title') || {}).textContent || '',
      back: [...document.querySelectorAll('#cafe-post .cafe-back')].map(x => x.textContent), me: !document.getElementById('cafe-me').hidden})""")
    t("S3a 내 정보의 '확인 중' 글 → 그 글이 열림(쓴 사람은 볼 수 있다) · 위·아래 '← 내 정보로'",
      d["hash"] == "#p%d" % ids["wait"] and d["title"] == "새싹의 확인 중인 글" and d["back"] == ["← 내 정보로", "← 내 정보로"] and not d["me"], d)
    pg.click("#cafe-post .cafe-back >> nth=0"); pg.wait_for_timeout(1200)
    d2 = P.js("({hash: location.hash, y: scrollY, rows: document.querySelectorAll('#cafe-me .me-posts .me-row').length})")
    t("S3b '← 내 정보로' → #me · 다시 받지 않음(member_page %d→%d) · 보던 자리(y %d → %d, ±40)" % (n0, len(calls(f, "member_page")), y0, d2["y"]),
      d2["hash"] == "#me" and len(calls(f, "member_page")) == n0 and abs(d2["y"] - y0) <= 40 and y0 > 300 and d2["rows"] == 4, (d2, y0))
    # 그 글에서 댓글을 남기고 돌아오면 — 받아 둔 목록은 낡았다: 다시 받아 새 댓글이 보이고, 자리는 그대로
    a = pg.locator('#cafe-me .me-cmts .me-row a[href="#p%d"] >> nth=0' % ids["op"])
    a.scroll_into_view_if_needed(); pg.wait_for_timeout(200)
    y1 = P.js("scrollY")
    a.click(); pg.wait_for_timeout(1300)
    pg.fill("#cafe-post .bd-ctext", "돌아와서 보일 댓글"); pg.click("#cafe-post .bd-cform button[type=submit]"); pg.wait_for_timeout(1200)
    pg.click("#cafe-post .cafe-back >> nth=0"); pg.wait_for_timeout(1500)
    d3 = P.js("({hash: location.hash, y: scrollY, h: (document.querySelector('#cafe-me .me-cmts .me-sec-h') || {}).textContent, first: (document.querySelector('#cafe-me .me-cmts .me-row .cafe-title') || {}).textContent})")
    t("S3c 내 댓글의 글 → 댓글 올림 → '← 내 정보로' → 다시 받음(member_page %d) · '내 댓글 5' 맨 위에 새 댓글 · 자리 그대로(y %d → %d)" % (len(calls(f, "member_page")), y1, d3["y"]),
      d3["hash"] == "#me" and len(calls(f, "member_page")) == n0 + 1 and d3["h"] == "내 댓글 5" and d3["first"] == "돌아와서 보일 댓글"
      and abs(d3["y"] - y1) <= 40, d3)
    t("S3z 오류 0", not P.errs and not f.unhandled, P.errs)
    c.close()


def s4(br, src=None, css=None):
    """내 노래 — 고르기(Enter)·바꾸기(누름)·지우기 · 목록 밖 이름은 고를 수 없음"""
    f = MeFake(); w = seed(f); sp = w["sprout"]
    c = ctx(br, f, 375, 812, who=sp, src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html#me", 1800)
    t("S4a 처음 — '아직 고르지 않았습니다.' · '노래 고르기'", "아직 고르지 않았습니다." in P.txt("#cafe-me .me-song")
      and P.txt("#cafe-me .me-song-b") == "노래 고르기" and not pg.is_visible("#me-song-q"), P.txt("#cafe-me .me-song"))
    pg.click("#cafe-me .me-song-b"); pg.wait_for_timeout(300)
    foc = P.js("document.activeElement && document.activeElement.id")
    pg.keyboard.type("zzzz"); pg.wait_for_timeout(400)
    none = (P.txt("#me-song-q-s"), pg.locator("#me-song-q-r button").count())
    pg.fill("#me-song-q", ""); pg.keyboard.type("거위"); pg.wait_for_timeout(500)
    res = P.js("[...document.querySelectorAll('#me-song-q-r button')].map(b => b.textContent)")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(900)
    s1_ = dict(f.songs)
    cur = P.txt("#cafe-me .me-song-cur")
    t("S4b 고르기 → 찾기 칸에 초점 · 'zzzz' → '목록에 없는 제목' · 결과 0 · '거위' → '거위의 꿈2007' · Enter → 서버 '거위의꿈' · 「거위의 꿈」2007 · '저장했습니다'",
      foc == "me-song-q" and none[1] == 0 and "목록에 없는 제목" in none[0] and res == ["거위의 꿈2007"]
      and s1_.get(sp, {}).get("k") == "거위의꿈" and cur == "「거위의 꿈」2007" and "저장했습니다" in P.txt("#cafe-me .me-song"), (foc, none, res, s1_, cur))
    pg.click("#cafe-me .me-song-b"); pg.wait_for_timeout(300)
    pg.keyboard.type("아버지"); pg.wait_for_timeout(500)
    pg.click("#me-song-q-r button >> nth=0"); pg.wait_for_timeout(900)
    k2 = f.songs.get(sp, {}).get("k")
    t("S4c '다른 노래로 바꾸기' → '아버지' 누름 → 서버 바뀜 · 화면 「아버지」", k2 == "아버지" and P.txt("#cafe-me .me-song-cur").startswith("「아버지」"), (k2, P.txt("#cafe-me .me-song-cur")))
    pg.click("#cafe-me .me-song-clr"); pg.wait_for_timeout(900)
    t("S4d '지우기' → 서버에서 지움 · '아직 고르지 않았습니다.' · '내 노래를 지웠습니다.'", sp not in f.songs
      and "아직 고르지 않았습니다." in P.txt("#cafe-me .me-song") and "내 노래를 지웠습니다." in P.txt("#cafe-me .me-song"), P.txt("#cafe-me .me-song"))
    sets = [c_[1].get("p_song") for c_ in calls(f, "member_set_song")]
    t("S4e 서버로 간 것은 정본 제목뿐(자유 입력 0): %s" % sets, sets == ["거위의 꿈", "아버지", ""], sets)
    t("S4z 오류 0", not P.errs and not f.unhandled, P.errs)
    c.close()


def s5(br, src=None, css=None):
    """별명 바꾸기 — 막힌 별명 · 바뀐 별명이 제목·헤더에"""
    f = MeFake(); w = seed(f); sp = w["sprout"]
    c = ctx(br, f, 1280, 860, who=sp, src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html#me", 1800)
    dis = P.js("document.querySelector('#cafe-me .me-nickf button[type=submit]').disabled")
    pg.fill("#bd-mn", "운영자님"); pg.click("#cafe-me .me-nickf button[type=submit]"); pg.wait_for_timeout(600)
    e1 = P.txt("#cafe-me .me-nickx")
    pg.fill("#bd-mn", "대전  언니"); pg.click("#cafe-me .me-nickf button[type=submit]"); pg.wait_for_timeout(1200)
    d = P.js("({h: document.querySelector('#cafe-me .me-h').textContent, hm: document.getElementById('hm').getAttribute('aria-label'), v: document.getElementById('bd-mn').value})")
    t("S5 별명 — 처음엔 '별명 저장' 잠김 · '운영자님' 막힘 · '대전  언니' → 서버 '대전 언니' · 제목·헤더·칸이 함께",
      dis and "쓸 수 없습니다" in e1 and f.members[sp]["nickname"] == "대전 언니" and d["h"] == "내 정보대전 언니" and "대전 언니" in d["hm"] and d["v"] == "대전 언니", (dis, e1[-40:], d))
    t("S5z 오류 0", not P.errs and not f.unhandled, P.errs)
    c.close()


def s6(br, src=None, css=None):
    """'더 보기' — 013 은 서버에 다음 쪽(p_before), 스위치 꺼짐(010 board_mine)은 받아 둔 것에서 20개씩"""
    for conf, name in ((ON, "013"), (OFF, "010")):
        f = MeFake(); w = seed(f)
        c = ctx(br, f, 375, 812, who=w["many"], conf=conf, src=src, css=css); P = Page(c); pg = P.pg
        P.go("community.html#me", 1800)
        n1 = pg.locator("#cafe-me .me-posts .me-row").count()
        last = P.js("+[...document.querySelectorAll('#cafe-me .me-posts .me-row')].pop().dataset.id")
        mv = pg.is_visible("#cafe-me .me-posts .me-more")
        pg.click("#cafe-me .me-posts .me-more"); pg.wait_for_timeout(900)
        n2 = pg.locator("#cafe-me .me-posts .me-row").count()
        ids = P.js("[...document.querySelectorAll('#cafe-me .me-posts .me-row')].map(li => +li.dataset.id)")
        mv2 = pg.is_visible("#cafe-me .me-posts .me-more")
        foc = P.js("document.activeElement && document.activeElement.closest('.me-row') && +document.activeElement.closest('.me-row').dataset.id")
        mp = calls(f, "member_my_posts")
        srv = (len(mp) == 1 and mp[0][1].get("p_before") == last) if name == "013" else not mp
        t("S6 %s '내가 쓴 글 25' — 첫 20 · '더 보기' → 25(겹침 0·최신순) · 단추 사라짐 · 새로 온 첫 줄에 초점 · 서버 다음 쪽 %s" % (name, "p_before=20번째" if name == "013" else "요청 없음"),
          n1 == 20 and mv and n2 == 25 and len(set(ids)) == 25 and ids == sorted(ids, reverse=True) and not mv2 and foc == ids[20] and srv
          and P.txt("#cafe-me .me-posts .me-sec-h") == "내가 쓴 글 25", (n1, mv, n2, mv2, foc, mp))
        c.close()


def s7(br, src=None, css=None):
    """로그인 전 #me → '로그인 · 회원가입' → 이메일 로그인 → 내 정보로 돌아옴"""
    f = MeFake(); w = seed(f)
    c = ctx(br, f, 375, 812, src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html#me", 1500)
    g = P.txt("#cafe-me")
    filled = P.js(V.FILLED_JS)
    pg.click("#cafe-me .me-gate-b"); pg.wait_for_timeout(800)
    sh = P.txt("#bd-sheet")
    tb = pg.locator("#bd-sheet .bd-tab >> text=로그인")
    if tb.count():
        tb.click(); pg.wait_for_timeout(200)
    pg.fill("#bd-ie", "mem@test.local"); pg.fill("#bd-ip", "pw"); pg.click("#bd-sheet .bd-aform button[type=submit]"); pg.wait_for_timeout(2000)
    d = P.js("""({hash: location.hash, h: (document.querySelector('#cafe-me .me-h') || {}).textContent || '', msg: document.getElementById('bd-msg').textContent,
      sheet: !!document.querySelector('#bd-sheet:not([hidden])'), next: localStorage.getItem('insooni_board_next')})""")
    # 이어서 할 일('내 정보')은 꺼내 쓰고 지운다 — 남아 있으면 30분 안의 다음 로그인이 엉뚱하게 내 정보로 끌려간다
    t("S7 로그인 전 #me — 안내 + 채운 단추 하나('로그인 · 회원가입') → 회원 창 → 이메일 로그인 → #me '홍천팬' · '어서 오세요' · 이어서 할 일 지워짐",
      "회원으로 들어오면 보입니다" in g and len(filled) == 1 and "로그인" in sh and d["hash"] == "#me" and d["h"] == "내 정보홍천팬"
      and "어서 오세요" in d["msg"] and not d["sheet"] and d["next"] is None, (g[:60], filled, d))
    t("S7z 오류 0", not P.errs and not f.unhandled, P.errs)
    c.close()


def s8(br, src=None, css=None):
    """가입 마치기(사랑방) — 노래 질문(펼침) · Enter 는 고르기만 · 가입 뒤에 저장 · 내 정보에 '내 노래'"""
    f = MeFake(); w = seed(f); kk = w["kakao"]
    c = ctx(br, f, 375, 812, who=kk, src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html#me", 1500)
    g = P.txt("#cafe-me")
    pg.click("#cafe-me .me-gate-b"); pg.wait_for_timeout(900)
    d0 = P.js("""() => { const q = document.querySelector('#bd-sheet .bd-songq'); return {h: (document.querySelector('#bd-sheet .bd-sheet-h') || {}).textContent,
      q: !!q, details: !!(q && q.tagName === 'DETAILS'), lab: (document.querySelector('#bd-sheet label[for=bd-js]') || {}).textContent || '',
      order: [...document.querySelectorAll('#bd-sheet form > *')].map(e => ' ' + e.className + ' ')}; }""")
    ix = lambda k: next((i for i, cl in enumerate(d0["order"]) if (" %s " % k) in cl), -1)
    pg.fill("#bd-js", "거위"); pg.wait_for_timeout(500)
    pg.keyboard.press("Enter"); pg.wait_for_timeout(500)
    d1 = P.js("({c: (document.querySelector('#bd-sheet .bd-songq-c') || {}).textContent || '', err: document.getElementById('bd-jerr').textContent, sheet: !!document.querySelector('#bd-sheet:not([hidden])')})")
    joins0 = len(calls(f, "member_join"))
    t("S8a 가입 전 #me → '가입 마치기' 창 · 노래 질문 '좋아하는 인순이 노래 (선택)'(펼침) · 별명 다음·주 단추 앞 · '거위' Enter → '고른 노래「거위의 꿈」2007' · 폼은 안 보냄",
      "가입을 마치면" in g and d0["h"] == "가입 마치기" and d0["q"] and not d0["details"] and d0["lab"] == "좋아하는 인순이 노래 (선택)"
      and 0 <= ix("bd-nickf") < ix("bd-songq") < ix("bd-jfoot")
      and d1["c"].startswith("고른 노래「거위의 꿈」2007") and d1["err"] == "" and d1["sheet"] and joins0 == 0, (d0, d1, joins0))
    pg.check("#bd-jall"); pg.click("#bd-sheet button[type=submit]"); pg.wait_for_timeout(2200)
    d2 = P.js("({hash: location.hash, song: (document.querySelector('#cafe-me .me-song-cur') || {}).textContent || '', msg: document.getElementById('bd-msg').textContent})")
    order = [c_[0] for c_ in f.calls if c_[0] in ("member_join", "member_set_song")]
    t("S8b 가입 마치기 → member_join 다음에 member_set_song('거위의 꿈') · 서버 노래 '거위의꿈' · #me 로 돌아와 「거위의 꿈」 · '가입을 마쳤습니다'",
      order == ["member_join", "member_set_song"] and calls(f, "member_set_song")[0][1] == {"p_song": "거위의 꿈"}
      and f.songs.get(kk, {}).get("k") == "거위의꿈" and d2["hash"] == "#me" and d2["song"] == "「거위의 꿈」2007" and "가입을 마쳤습니다" in d2["msg"], (order, d2))
    t("S8z 오류 0", not P.errs and not f.unhandled, P.errs)
    c.close()
    # 건너뛰기 — 노래를 고르지 않으면 member_set_song 을 부르지 않는다
    f = MeFake(); w = seed(f); kk = w["kakao"]
    c = ctx(br, f, 375, 812, who=kk, src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html", 1500)
    pg.click("#hm"); pg.wait_for_timeout(800)
    pg.check("#bd-jall"); pg.click("#bd-sheet button[type=submit]"); pg.wait_for_timeout(1800)
    t("S8c 노래 질문 건너뛰기 → 가입됨 · member_set_song 0 · 서버 노래 없음", kk in f.members and not calls(f, "member_set_song") and kk not in f.songs,
      [c_[0] for c_ in f.calls if c_[0].startswith("member_")])
    c.close()


def s9(br, src=None, css=None):
    """공연장(/live) 가입 — 노래 질문은 접혀 있다(두 번 누르면 끝: 모두 동의 → 가입 마치고 도장 찍기)"""
    f = MeFake(); w = seed(f); kk = w["kakao"]
    c = ctx(br, f, 375, 812, who=kk, src=src, css=css); P = Page(c); pg = P.pg
    P.go("live?e=K7Q2M", 2200)
    pg.click("#gig-go"); pg.wait_for_timeout(900)
    d = P.js("""() => { const q = document.querySelector('#bd-sheet .bd-songq'); return {details: !!q && q.tagName === 'DETAILS', open: !!(q && q.open),
      sum: (document.querySelector('#bd-sheet summary.bd-songq-h') || {}).textContent || '', input: !!document.getElementById('bd-js') && document.getElementById('bd-js').checkVisibility(),
      go: (document.querySelector('#bd-sheet button[type=submit]') || {}).textContent || ''}; }""")
    pg.check("#bd-jall"); pg.click("#bd-sheet button[type=submit]"); pg.wait_for_timeout(2500)
    stamped = (w["ev"]["id"], kk) in f.checkins
    t("S9a /live 가입 창 — 노래 질문은 접힌 <details>('좋아하는 인순이 노래도 알려 주실래요? (선택)') · 찾기 칸 안 보임 · 두 번 눌러 가입+도장 · member_set_song 0",
      d["details"] and not d["open"] and d["sum"] == "좋아하는 인순이 노래도 알려 주실래요? (선택)" and not d["input"] and d["go"] == "가입 마치고 도장 찍기"
      and kk in f.members and stamped and not calls(f, "member_set_song"), (d, stamped))
    c.close()
    k2 = f.add_user(None, None, "kakao", {"nickname": "객석의팬"}, True)
    c = ctx(br, f, 375, 812, who=k2, src=src, css=css); P = Page(c); pg = P.pg
    P.go("live?e=K7Q2M", 2200)
    pg.click("#gig-go"); pg.wait_for_timeout(900)
    pg.click("#bd-sheet summary.bd-songq-h"); pg.wait_for_timeout(300)
    pg.fill("#bd-js", "밤이면"); pg.wait_for_timeout(500)
    pg.click("#bd-js-r button >> nth=0"); pg.wait_for_timeout(300)
    pg.check("#bd-jall"); pg.click("#bd-sheet button[type=submit]"); pg.wait_for_timeout(2500)
    t("S9b /live 접힌 질문을 펼쳐 '밤이면 밤마다' 고름 → 가입 + 도장 + 노래 저장", (w["ev"]["id"], k2) in f.checkins
      and f.songs.get(k2, {}).get("k") == "밤이면밤마다", (f.songs.get(k2), [c_[0] for c_ in f.calls if c_[0].startswith(("member_", "gig_checkin"))][-4:]))
    t("S9z 오류 0", not P.errs and not f.unhandled, (P.errs, f.unhandled[:2]))
    c.close()


def s10(br, src=None, css=None):
    """자판이 올라와도 '가입 마치기'가 보인다 — 별명 칸 · 노래 찾기 칸(결과 첫 줄까지)"""
    bad = []
    for (w_, h_, fs, vvh, page) in ((360, 640, 21, 330, "community.html"), (320, 568, 21, 260, "community.html"),
                                   (375, 812, 17, 420, "community.html"), (360, 640, 21, 330, "live?e=K7Q2M")):
        f = MeFake(); w = seed(f)
        c = ctx(br, f, w_, h_, fs=fs, who=w["kakao"], vv=vvh, src=src, css=css); P = Page(c); pg = P.pg
        P.go(page, 2000)
        pg.click("#gig-go" if page.startswith("live") else "#hm"); pg.wait_for_timeout(900)
        if page.startswith("live"):
            pg.click("#bd-sheet summary.bd-songq-h"); pg.wait_for_timeout(300)
        for fid in ("#bd-jn", "#bd-js"):
            pg.focus(fid); pg.wait_for_timeout(400)
            if fid == "#bd-js":
                pg.keyboard.type("사랑"); pg.wait_for_timeout(600)
            d = P.js("""([fid, vv]) => { const f = document.querySelector(fid).getBoundingClientRect(), b = document.querySelector('#bd-sheet button[type=submit]'),
                br = b.getBoundingClientRect(), hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2),
                ft = document.querySelector('#bd-sheet .bd-jfoot').getBoundingClientRect().top, r0 = document.querySelector('#bd-js-r button');
              const rr = r0 && r0.getBoundingClientRect();
              return {ftop: Math.round(f.top), fbot: Math.round(f.bottom), btop: Math.round(br.top), bbot: Math.round(br.bottom), hit: hit === b || b.contains(hit),
                      foot: Math.round(ft), r0: rr ? [Math.round(rr.top), Math.round(rr.bottom)] : null}; }""", [fid, vvh])
            ok = d["ftop"] >= 0 and d["fbot"] <= d["foot"] and d["btop"] >= 0 and d["bbot"] <= vvh and d["hit"]
            if fid == "#bd-js":
                ok = ok and d["r0"] and d["r0"][1] <= d["foot"]
            if not ok:
                bad.append((w_, h_, fs, vvh, page, fid, d))
        c.close()
    t("S10 자판(보이는 화면 420·330·260 · 17/21px · 사랑방·공연장) — 별명 칸·노래 찾기 칸(+첫 결과)이 단추 띠 위에 보이고 '가입 마치기'가 자판 위에서 눌린다",
      not bad, bad[:3])


def s11(br, src=None, css=None):
    """스위치 꺼짐(config.mypage 없음 — 지금 운영) — 013 을 한 번도 부르지 않는다(404 가 콘솔에 남지 않게)"""
    f = MeFake(); w = seed(f); sp = w["sprout"]
    c = ctx(br, f, 375, 812, conf=OFF, who=sp, src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html#me", 1800)
    d = P.js("""() => ({rows: [...document.querySelectorAll('#cafe-me .me-posts .me-row')].map(li => li.querySelector('.me-st').textContent),
      head: (document.querySelector('#cafe-me .me-posts .me-sec-h') || {}).textContent || '', song: !!document.querySelector('#cafe-me .me-song'),
      cmts: !!document.querySelector('#cafe-me .me-cmts'), soon: (document.querySelector('#cafe-me .me-soon') || {}).textContent || '',
      prog: [...document.querySelectorAll('#cafe-me .me-prog-n')].map(x => x.textContent), stamps: document.querySelectorAll('#cafe-me .bd-stamp-mini').length})""")
    np, nc = f.counts(sp)
    t("S11a 꺼짐 — 010 의 내가 쓴 글 4(상태 그대로) · 등업 %d / 3 · %d / 5 · 도장(011) · 내 노래·내 댓글 칸 없음 · '준비하고 있습니다' 한 줄" % (np, nc),
      len(d["rows"]) == 4 and d["head"] == "내가 쓴 글 4" and sorted(d["rows"]) == sorted(["공개", "확인 중", "내려짐", "공개"])
      and d["prog"] == ["%d / 3" % np, "%d / 5" % nc] and d["stamps"] == 1 and not d["song"] and not d["cmts"]
      and d["soon"] == "내 댓글 모아 보기와 '내 노래' 고르기는 준비하고 있습니다.", d)
    c.close()
    c = ctx(br, f, 375, 812, conf=OFF, who=w["kakao"], src=src, css=css); P2 = Page(c); pg = P2.pg
    P2.go("community.html", 1500)
    pg.click("#hm"); pg.wait_for_timeout(800)
    q = pg.locator("#bd-sheet .bd-songq").count()
    pg.check("#bd-jall"); pg.click("#bd-sheet button[type=submit]"); pg.wait_for_timeout(1800)
    used = [c_[0] for c_ in f.calls if c_[0] in M.F013]
    t("S11b 꺼짐 — 가입 창에 노래 질문 없음 · 가입됨 · 013 함수 요청 0 · 404 0 · 콘솔 오류 0",
      q == 0 and w["kakao"] in f.members and not used and not P.r404 and not P2.r404 and not P.cons and not P2.cons, (q, used, P.r404[:2], P.cons[:2], P2.cons[:2]))
    t("S11z 오류 0", not P.errs and not P2.errs and not f.unhandled, (P.errs, P2.errs))
    c.close()


def s12(br, src=None, css=None):
    """스위치는 켰는데 013 이 서버에 없다(404) — 내 정보는 010 갈래로 서고, 가입은 그대로, 노래 실패는 정직하게"""
    f = MeFake(); w = seed(f); f.no013 = True
    c = ctx(br, f, 375, 812, who=w["sprout"], src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html#me", 2000)
    d = P.js("""() => ({rows: document.querySelectorAll('#cafe-me .me-posts .me-row').length, soon: !!document.querySelector('#cafe-me .me-soon'),
      song: !!document.querySelector('#cafe-me .me-song'), gate: !!document.querySelector('#cafe-me .me-gate-t')})""")
    pg.click("#cafe-me .cafe-back"); pg.wait_for_timeout(700)
    pg.evaluate("location.hash = '#me'"); pg.wait_for_timeout(1200)
    n = len(calls(f, "member_page"))
    t("S12a 013 없음(404) — 내가 쓴 글 4(010) · '준비하고 있습니다' · 노래 칸 없음 · 막힘 화면 아님 · 다시 열어도 member_page 를 또 부르지 않음(%d)" % n,
      d["rows"] == 4 and d["soon"] and not d["song"] and not d["gate"] and n == 1 and pg.locator("#cafe-me .me-posts .me-row").count() == 4, d)
    c.close()
    kk = w["kakao"]
    c = ctx(br, f, 375, 812, who=kk, src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html", 1500)
    pg.click("#hm"); pg.wait_for_timeout(800)
    pg.fill("#bd-js", "친구여"); pg.wait_for_timeout(500); pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
    pg.check("#bd-jall"); pg.click("#bd-sheet button[type=submit]"); pg.wait_for_timeout(2000)
    msg = P.txt("#bd-msg")
    t("S12b 013 없음 — 노래를 고르고 가입 → 가입은 그대로 · '좋아하는 노래는 저장하지 못했습니다. 내 정보에서 다시 고를 수 있습니다.'",
      kk in f.members and "좋아하는 노래는 저장하지 못했습니다. 내 정보에서 다시 고를 수 있습니다." in msg and "어서 오세요" in msg, msg)
    t("S12z JS 오류 0 · 가짜 서버 밖 요청 0", not P.errs and not f.unhandled, (P.errs, f.unhandled[:2]))
    c.close()


def s13(br, src=None, css=None):
    """로그아웃 · 탈퇴(확인 두 번 — 첫 확인을 물리면 아무 일 없음) · 운영자 · 운영자가 정한 새싹 · 쉬는 중"""
    f = MeFake(); w = seed(f); sp = w["sprout"]
    f.songs[sp] = {"k": "거위의꿈", "at": "2026-10-03T00:00:00Z"}
    c = ctx(br, f, 375, 812, who=sp, src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html#me", 1800)
    note = P.txt("#cafe-me .bd-leave-note")
    P.dismiss_next = 1
    pg.click("#cafe-me .bd-leave"); pg.wait_for_timeout(500)
    a = (len(P.dialogs), sp in f.members, len(calls(f, "member_leave")))
    pg.click("#cafe-me .bd-leave"); pg.wait_for_timeout(1500)
    d = P.js("({hash: location.hash, msg: document.getElementById('bd-msg').textContent, list: document.getElementById('cafe-list').checkVisibility()})")
    d["hm"] = P.pg.inner_text("#hm")
    t("S13a 탈퇴 — 경고 '…기록과 내 노래가 함께 지워집니다' · 첫 확인을 물리면 서버에 안 감 · 두 번 확인 → 회원·노래 삭제 · 목록 '탈퇴했습니다' · 헤더 '로그인·가입'",
      note == "탈퇴하면 글·댓글·도장·응원·투표 기록과 내 노래가 함께 지워집니다." and a == (1, True, 0) and len(P.dialogs) == 3
      and sp not in f.members and sp not in f.songs and d["hash"].startswith("#b=") and "탈퇴했습니다" in d["msg"] and d["hm"] == "로그인·가입" and d["list"],
      (note, a, len(P.dialogs), d))
    c.close()
    c = ctx(br, f, 375, 812, who=w["adm"], src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html#me", 1800)
    d = P.js("({leave: document.querySelectorAll('#cafe-me .bd-leave').length, adm: (document.querySelector('#cafe-me .me-go[href=\"admin.html\"]') || {}).textContent || '', line: (document.querySelector('#cafe-me .me-lv .me-line') || {}).textContent || '', prog: document.querySelectorAll('#cafe-me .me-prog').length})")
    t("S13b 운영자 — 탈퇴 링크 없음 · '운영 화면 열기' · 진행 막대 없음", d["leave"] == 0 and d["adm"] == "운영 화면 열기" and d["prog"] == 0 and "운영자" in d["line"], d)
    pg.click("#cafe-me .bd-me-acts >> text=로그아웃"); pg.wait_for_timeout(900)
    d = P.js("({hash: location.hash, msg: document.getElementById('bd-msg').textContent, s: localStorage.getItem('insooni_member_session')})")
    t("S13c 내 정보에서 로그아웃 → 세션 지움 · 목록 '로그아웃했습니다.'", d["s"] is None and d["hash"].startswith("#b=") and "로그아웃했습니다." in d["msg"], d)
    c.close()
    for who, want, name in ((w["staffset"], "새싹 회원입니다. 등급은 운영자가 정합니다.", "운영자가 정한 새싹"), (w["blocked"], "지금은 글을 쓸 수 없습니다", "쉬는 중")):
        c = ctx(br, f, 375, 812, who=who, src=src, css=css); P = Page(c)
        P.go("community.html#me", 1800)
        d = P.js("({line: (document.querySelector('#cafe-me .me-lv .me-line') || {}).textContent || '', prog: document.querySelectorAll('#cafe-me .me-prog').length, txt: document.getElementById('cafe-me').innerText})")
        t("S13d %s — '%s' · 몇 개 더 같은 숫자 없음" % (name, want[:20]), want in d["line"] and d["prog"] == 0 and "/ 3" not in d["txt"] and "채웠습니다" not in d["txt"], d["line"])
        c.close()
    t("S13z 오류 0", not P.errs and not f.unhandled, P.errs)


def s14(br, src=None, css=None, admin_src=None):
    """운영 화면 회원 탭 — 내 노래(스위치 켜짐) · 꺼짐이면 묻지 않음"""
    for conf, name in ((ON, "켜짐"), (OFF, "꺼짐")):
        f = MeFake(); w = seed(f)
        f.songs[w["sprout"]] = {"k": "거위의꿈", "at": "2026-10-03T00:00:00Z"}
        f.songs[w["mem"]] = {"k": "거위의꿈", "at": "2026-10-03T00:00:00Z"}
        f.songs[w["mem2"]] = {"k": "아버지", "at": "2026-10-03T00:00:00Z"}
        c = ctx(br, f, 1280, 860, conf=conf, admin_who=w["adm"], src=src, css=css, admin_src=admin_src); P = Page(c); pg = P.pg
        P.go("admin.html", 1200)
        pg.click('.adm-tab[data-status="members"]'); pg.wait_for_timeout(1200)
        item = pg.locator("#adm-list .adm-item", has_text="대전 아줌마").inner_text() if pg.locator("#adm-list .adm-item", has_text="대전 아줌마").count() else ""
        none = pg.locator("#adm-list .adm-item", has_text="글많은팬").inner_text() if pg.locator("#adm-list .adm-item", has_text="글많은팬").count() else ""
        note = P.txt("#adm-mnote")
        asked = calls(f, "admin_member_songs")
        if name == "켜짐":
            t("S14a 운영 화면 회원 탭(켜짐) — '대전 아줌마 … 내 노래 「거위의 꿈」' · 고르지 않은 회원엔 없음 · 머리 '내 노래를 고른 회원 3명(전체 %d명) · 많이 고른 노래: 거위의 꿈 2 · 아버지 1'" % len(f.members),
              "내 노래 「거위의 꿈」" in item and "내 노래" not in none and len(asked) == 1
              and ("내 노래를 고른 회원 3명(전체 %d명) · 많이 고른 노래: 거위의 꿈 2 · 아버지 1." % len(f.members)) in note, (item[-60:], none[-40:], note[-90:]))
        else:
            t("S14b 운영 화면 회원 탭(꺼짐) — admin_member_songs 요청 0 · 내 노래 표시 0 · 404 0", not asked and "내 노래" not in item and not P.r404, (asked, item[-40:]))
        t("S14z %s 오류 0" % name, not P.errs and not f.unhandled, (P.errs, f.unhandled[:2]))
        c.close()


def s15(br, src=None, css=None):
    """공연 화면에서 '내 정보' → 내 정보 맨 위 '← 공연 화면으로' → 그 공연으로"""
    f = MeFake(); w = seed(f)
    c = ctx(br, f, 375, 812, who=w["sprout"], src=src, css=css); P = Page(c); pg = P.pg
    P.go("live?e=K7Q2M", 2200)
    pg.click("#hm"); pg.wait_for_timeout(2200)
    d = P.js("""() => { const a = document.querySelector('#cafe-me .cafe-back'); return {url: location.pathname + location.hash, txt: a && a.textContent, href: a && a.getAttribute('href'),
      router: a && a.getAttribute('data-router'), stamps: [...document.querySelectorAll('#cafe-me .bd-stamp-mini')].map(x => x.textContent)}; }""")
    pg.click("#cafe-me .cafe-back"); pg.wait_for_timeout(1800)
    back = P.js("location.pathname + location.search")
    t("S15 /live → 헤더 '내 정보' → community.html#me · '← 공연 화면으로'(/live?e=K7Q2M, 라우터 끔) · 다녀온 공연 도장 · 누르면 그 공연 화면",
      d["url"] == "/community.html#me" and d["txt"] == "← 공연 화면으로" and d["href"] == "/live?e=K7Q2M" and d["router"] == "off"
      and d["stamps"] == ["2026.10.18부산 KBS홀"] and back == "/live?e=K7Q2M", (d, back))
    t("S15z 오류 0", not P.errs and not f.unhandled, P.errs)
    c.close()


QUALITY_TAP = """() => { const out = []; let n = 0;
  for (const e of document.querySelectorAll('#cafe-me a, #cafe-me button, #cafe-me input, #cafe-me summary')) {
    if (!e.checkVisibility({checkVisibilityCSS: true})) continue; const r = e.getBoundingClientRect(); if (!r.width) continue; n++;
    if (r.height < 44 || (r.width < 44 && e.tagName !== 'INPUT')) out.push((e.textContent || e.id || e.tagName).trim().slice(0, 14) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); }
  return {n, out}; }"""
QUALITY_TEXT = """() => { const out = [], ls = []; let n = 0; const w = document.createTreeWalker(document.getElementById('cafe-me'), NodeFilter.SHOW_TEXT); let x;
  while ((x = w.nextNode())) { if (!x.nodeValue.trim()) continue; const e = x.parentElement; if (!e.checkVisibility({checkVisibilityCSS: true})) continue;
    if (e.closest('.sr-only')) continue; n++; const cs = getComputedStyle(e);
    if (parseFloat(cs.fontSize) < 12) out.push(x.nodeValue.trim().slice(0, 12) + ' ' + cs.fontSize);
    if (/[가-힣]/.test(x.nodeValue) && cs.letterSpacing !== 'normal' && parseFloat(cs.letterSpacing) !== 0) ls.push(x.nodeValue.trim().slice(0, 12) + ' ' + cs.letterSpacing); }
  return {n, out, ls}; }"""


def audit_scroll(P, scope):
    """화면을 위에서 아래로 한 화면씩 내리며 대비를 잰다(화면 밖 글자는 V.AUDIT_JS 가 건너뛴다)"""
    pg = P.pg
    seen, bad = 0, []
    top = P.js("(s) => document.querySelector(s).getBoundingClientRect().top + scrollY", scope)
    end = P.js("(s) => document.querySelector(s).getBoundingClientRect().bottom + scrollY", scope)
    y = max(0, top - 80)
    while y < end:
        pg.evaluate("(y) => window.scrollTo(0, y)", y); pg.wait_for_timeout(120)
        r = P.js(V.AUDIT_JS, scope)
        seen += r["seen"]
        bad += r["bad"]
        y += int(P.js("innerHeight")) - 120
    return seen, bad


def s16(br, src=None, css=None):
    """화면 품질 — 320·375(21px)·1280: 넘침 0 · 한글 모노 0 · 채운 단추 ≤1 · 점선 0 · 누르는 칸 ≥44 · 12px 미만 0 · 한글 자간 0 · 대비 4.5:1(위→아래 전부)"""
    f = MeFake(); w = seed(f); sp = w["sprout"]
    f.songs[sp] = {"k": "거위의꿈", "at": "2026-10-03T00:00:00Z"}
    bad = []
    seen_all, bad_c = 0, []
    for (w_, fs) in ((320, 21), (375, 21), (375, 17), (1280, 17)):
        c = ctx(br, f, w_, 812 if w_ < 700 else 860, fs=fs, who=sp, src=src, css=css); P = Page(c); pg = P.pg
        P.go("community.html#me", 1800)
        pg.click("#cafe-me .me-song-b"); pg.wait_for_timeout(200); pg.keyboard.type("사"); pg.wait_for_timeout(500)   # 노래 찾기 칸·결과까지 펼친 채
        pg.add_style_tag(content="*{transition:none!important;animation:none!important}")
        o = P.js(V.OVER_JS)
        mono = P.js(V.MONO_JS, ME)
        fl = P.js(V.FILLED_JS)
        da = P.js(V.DASH_JS)
        tap = P.js(QUALITY_TAP)
        tx = P.js(QUALITY_TEXT)
        why = []
        if o > 0: why.append("넘침 %d" % o)
        if mono["out"] or mono["seen"] < 20: why.append("모노 %s/%d" % (mono["out"][:2], mono["seen"]))
        if len(fl) > 1: why.append("채운 단추 %s" % fl)
        if da: why.append("점선 %s" % da[:2])
        if tap["out"] or tap["n"] < 15: why.append("누르는 칸 %s/%d" % (tap["out"][:3], tap["n"]))
        if tx["out"] or tx["ls"] or tx["n"] < 30: why.append("글자 %s %s/%d" % (tx["out"][:2], tx["ls"][:2], tx["n"]))
        if why:
            bad.append((w_, fs, " · ".join(why)))
        s_, b_ = audit_scroll(P, ME)
        seen_all += s_
        bad_c += [(w_, fs, x) for x in b_]
        c.close()
    t("S16a 내 정보 320·375×21 · 375×17 · 1280 — 넘침 0 · 한글 모노 0 · 채운 단추 ≤1 · 점선 0 · 누르는 칸 ≥44 · 12px 미만 0 · 한글 자간 0", not bad, bad[:3])
    t("S16b 내 정보 대비 4.5:1 — 위에서 아래까지 한 화면씩(잰 글자 %d)" % seen_all, not bad_c and seen_all >= 200, bad_c[:4])
    # 가입 창(노래 질문 펼침·고른 뒤) 320×21
    f2 = MeFake(); w2 = seed(f2)
    c = ctx(br, f2, 320, 640, fs=21, who=w2["kakao"], src=src, css=css); P = Page(c); pg = P.pg
    P.go("community.html", 1500)
    pg.click("#hm"); pg.wait_for_timeout(800)
    pg.fill("#bd-js", "사랑"); pg.wait_for_timeout(500)
    pg.add_style_tag(content="*{transition:none!important;animation:none!important}")
    sw = P.js("(() => { const b = document.querySelector('#bd-sheet .bd-sheet-box'); return b.scrollWidth - b.clientWidth; })()")
    mono = P.js(V.MONO_JS, "#bd-sheet")
    tap = P.js(QUALITY_TAP.replace("#cafe-me", "#bd-sheet .bd-songq"))
    P.js("document.querySelector('#bd-sheet .bd-songq').scrollIntoView({block: 'start'})"); pg.wait_for_timeout(150)
    r_ = P.js(V.AUDIT_JS, "#bd-sheet .bd-songq")
    s_, b_ = r_["seen"], r_["bad"]
    t("S16c 가입 창 320×21 노래 질문 — 창 가로 넘침 0 · 한글 모노 0 · 결과 단추 ≥44 · 대비 4.5:1(잰 글자 %d)" % s_,
      sw <= 0 and not mono["out"] and not tap["out"] and tap["n"] >= 3 and not b_ and s_ >= 4, (sw, mono["out"][:2], tap, b_[:3]))
    c.close()


def s17(br, src=None, css=None):
    """영어 — 내 정보의 머리말·칸 이름이 영어"""
    f = MeFake(); w = seed(f)
    c = ctx(br, f, 375, 812, who=w["sprout"], lang="en", src=src, css=css); P = Page(c)
    P.go("community.html#me", 2200)
    d = P.js("""() => ({kick: (document.querySelector('#cafe-me .me-kick') || {}).textContent, secs: [...document.querySelectorAll('#cafe-me .me-sec-h')].map(h => h.firstChild.textContent.trim()),
      back: (document.querySelector('#cafe-me .cafe-back') || {}).textContent, st: [...document.querySelectorAll('#cafe-me .me-st')].map(x => x.textContent)})""")
    t("S17 영어 — 'My page' · Level · Shows you attended · My song · My posts · My replies · News emails · Change nickname · 상태 Public/Being checked/Taken down",
      d["kick"] == "My page" and d["secs"] == ["Level", "Shows you attended", "My song", "My posts", "My replies", "News emails", "Change nickname"]
      and d["back"] == "← Back to the Fan Room" and set(d["st"]) <= {"Public", "Being checked", "Taken down"} and "Being checked" in d["st"], d)
    t("S17z 오류 0", not P.errs and not f.unhandled, P.errs)
    c.close()


SCENES = [("S1", s1), ("S2", s2), ("S2x", s2x), ("S3", s3), ("S4", s4), ("S5", s5), ("S6", s6), ("S7", s7), ("S8", s8), ("S9", s9),
          ("S10", s10), ("S11", s11), ("S12", s12), ("S13", s13), ("S14", s14), ("S15", s15), ("S16", s16), ("S17", s17)]

# 뮤테이션 — (이름, 파일, 찾을 것, 바꿀 것, 다시 돌릴 장면). 파일 'css' 는 덧댄 CSS(찾을 것 없음)
MUT = [
    ("팬 글을 innerHTML 로(el)", "board",
     "    if (text !== undefined && text !== null) n.textContent = text;", "    if (text !== undefined && text !== null) n.innerHTML = text;", "S2x"),
    ("헤더 '내 정보'가 라우터 대신 문서를 새로 읽음", "board",
     '    if (!(window.INSOONI_ROUTER && window.INSOONI_ROUTER.go && window.INSOONI_ROUTER.go(href))) location.href = href;',
     '    location.href = href;', "S1"),
    ("상태 이름이 어긋남('확인 중'을 '공개'로)", "board",
     'return st === "pending" ? t("bd.st.pending", "확인 중")', 'return st === "pending" ? t("bd.st.approved", "공개")', "S2"),
    ("볼 수 없는 글에 단 댓글에도 링크", "board",
     '    var a = el(x.post_visible ? "a" : "div", x.post_visible ? "cafe-link" : "cafe-link me-gone");\n    if (x.post_visible) a.href = "#p" + x.post_id;',
     '    var a = el("a", "cafe-link");\n    a.href = "#p" + x.post_id;', "S2"),
    ("글을 보고 돌아오면 다시 받고 맨 위로", "board",
     '    if (ME.back && ME.data && Date.now() - ME.at < 10 * 60e3) {', '    if (false) {', "S3"),
    ("댓글을 쓰고 돌아와도 낡은 내 정보를 그대로", "board",
     '        if (/^(comment_(write|delete)|board_(write|edit|delete))$/.test(name)) ME.data = null;\n', '', "S3"),
    ("노래 찾기의 Enter 가 가입 폼을 보냄", "board",
     '      e.preventDefault();                 /* 가입 폼을 보내지 않는다 */\n', '', "S8"),
    ("가입 뒤 고른 노래를 저장하지 않음", "board",
     '          if (!(r && r.ok && pick)) return r;', '          return r;', "S8"),
    ("공연장에서도 노래 질문을 펼쳐 둠", "board",
     '      var songQ = mypageOn() ? songQuestion(gig) : null;', '      var songQ = mypageOn() ? songQuestion(false) : null;', "S9"),
    ("로그인 뒤 내 정보로 돌아오지 않음", "board",
     '    if (n.what === "me") {\n      if (!sec) return;', '    if (false) {\n      if (!sec) return;', "S7"),
    ("주 단추가 창 아래에 붙지 않음(sticky 해제)", "css", None, ".bd-sheet .bd-jfoot{position:static!important}", "S10"),
    ("스위치를 무시하고 013 을 부름", "board",
     '  function mypageOn() { return boardOn() && conf().mypage === true && S.mp !== false; }',
     '  function mypageOn() { return boardOn() && S.mp !== false; }', "S11"),
    ("013 이 없으면(404) 내 정보가 막힘", "board",
     '        if (r && r.reason === "not_ready") { S.mp = false; return fetchMe(); }\n', '', "S12"),
    ("노래 저장 실패를 조용히 삼킴", "board",
     '            if (!(sr && sr.ok)) S.songNote = ', '            if (false) S.songNote = ', "S12"),
    ("탈퇴 확인이 한 번뿐", "board",
     '        if (!window.confirm(t("bd.leaveQ2", "정말 탈퇴할까요? 이 확인이 마지막입니다."))) return;\n', '', "S13"),
    ("운영자가 정한 새싹에게도 '몇 개 더' 숫자", "board",
     '    if (p.auto_up === false) { line.textContent = t("bd.me.byStaff", "새싹 회원입니다. 등급은 운영자가 정합니다."); return s; }\n', '', "S13"),
    ("운영 화면이 내 노래를 그리지 않음", "admin",
     '    if (song) line += " · 내 노래 「" + song.title + "」";\n', '', "S14"),
    ("공연 화면에서 온 길을 잊음", "board",
     '    if (ME.from) {', '    if (false) {', "S15"),
    ("내 정보 글자 대비 낮춤(.me-on·.me-since #555)", "css", None, "#cafe-me .me-on, #cafe-me .me-since, #cafe-me .me-line{color:#555!important}", "S16"),
    ("한글에 모노 서체(내 노래 제목)", "css", None, ".me-song-t{font-family:var(--font-mono)!important}", "S16"),
]


def run(br, only=None, src=None, css=None, admin_src=None):
    for key, fn in SCENES:
        if only and key not in only:
            continue
        print("── " + key + " " + (fn.__doc__ or "").strip().splitlines()[0][:70], flush=True)
        try:
            if fn is s14:
                fn(br, src, css, admin_src)
            else:
                fn(br, src, css)
        except Exception as e:
            import traceback
            fr = [x for x in traceback.extract_tb(e.__traceback__) if x.name == fn.__name__]
            t("%s 흐름이 멈춤(줄 %s)" % (key, fr[-1].lineno if fr else "?"), False, str(e).splitlines()[0][:150])


if __name__ == "__main__":
    with sync_playwright() as p:
        br = p.chromium.launch()
        run(br, ONLY)
        fail = [r for r in R if not r[1]]
        print("\n본 검사: %d/%d 통과" % (len(R) - len(fail), len(R)))
        caught, tried = 0, 0
        ctrl_bad = []
        if not QUICK and not ONLY:
            # 대조군 — 망가뜨리지 않은 소스(board.js·admin.js 원본)를 같은 길로 실어 모든 장면이 통과해야 한다.
            # 이게 실패하면 뮤테이션이 '잡은 것'은 사본을 싣는 길이 고장 난 것일 수 있다(실제로 한 번 그랬다)
            print("\n── 대조군(원본 소스를 뮤테이션과 같은 길로)")
            n0 = len(R)
            import io
            quiet = sys.stdout
            sys.stdout = io.StringIO()
            try:
                run(br, None, BOARD_SRC, None, ADMIN_SRC)
            finally:
                sys.stdout = quiet
            ctrl_bad = [r for r in R[n0:] if not r[1]]
            print("  대조군: %d/%d 통과" % (len(R) - n0 - len(ctrl_bad), len(R) - n0) + ("" if not ctrl_bad else "   ← " + ctrl_bad[0][0] + " " + ctrl_bad[0][2][:100]))
            del R[n0:]
            print("\n── 뮤테이션(일부러 망가뜨린 사본으로 해당 장면을 다시 — 잡아야 한다)")
            for name, kind, a, b, scene in MUT:
                src = css = admin_src = None
                if kind == "board":
                    if BOARD_SRC.count(a) != 1:
                        print("  ? 뮤테이션 적용 실패(찾을 것 %d개): %s" % (BOARD_SRC.count(a), name)); tried += 1; continue
                    src = BOARD_SRC.replace(a, b)
                elif kind == "admin":
                    if ADMIN_SRC.count(a) != 1:
                        print("  ? 뮤테이션 적용 실패(찾을 것 %d개): %s" % (ADMIN_SRC.count(a), name)); tried += 1; continue
                    admin_src = ADMIN_SRC.replace(a, b)
                else:
                    css = b
                tried += 1
                n0 = len(R)
                quiet = sys.stdout
                import io
                sys.stdout = io.StringIO()
                try:
                    run(br, {scene}, src, css, admin_src)
                finally:
                    sys.stdout = quiet
                got = [r for r in R[n0:] if not r[1]]
                del R[n0:]
                caught += bool(got)
                print("  %s — %s%s" % ("잡음" if got else "★못 잡음", name, ("  (" + got[0][0][:60] + ")") if got else ""), flush=True)
            print("뮤테이션: %d/%d 잡음" % (caught, tried))
        br.close()
    sys.exit(1 if fail or ctrl_bad or caught != tried else 0)
