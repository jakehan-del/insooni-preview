# 실행: 사이트 루트를 http://127.0.0.1:8908 로 띄운 뒤 playwright 파이썬으로 `python scripts/check_board_ui.py`
#       (`--quick` 이면 뮤테이션을 건너뛴다)
# 사랑방 회원·게시판(board.js) + 운영 화면 회원 탭 — 실제 브라우저로 사람처럼 끝까지 눌러 본다.
# Supabase 로 가는 요청은 전부 가짜 서버가 받는다(인증·RPC·뷰). 운영 DB·카카오·메일로 새는 것이 없다.
# 가짜 서버가 처리하지 못한 요청은 막고 기록한다 — 하나라도 있으면 실패다.
# 마지막에 board.js 를 일부러 망가뜨린 사본으로 같은 검사를 다시 돌려, 검사가 잡는지 본다(뮤테이션).
import base64, hashlib, json, re, sys, time, uuid
from urllib.parse import urlparse, parse_qs
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
B = "http://127.0.0.1:8908/"
SUPA = "vxrazyiqvdwgvgpkkitm.supabase.co"
BOARD_SRC = (ROOT / "assets/js/board.js").read_text(encoding="utf-8")
RESERVED = ("인순이", "인순", "김인순", "insooni", "운영자", "관리자", "공식", "admin", "official")


def norm(s):
    return re.sub(r"[^0-9A-Za-z가-힣]", "", s or "").lower()


class Fake:
    """사랑방이 부르는 Supabase(인증 + RPC + 공개 뷰)를 흉내 낸다. 규칙은 supabase/010 과 같게."""

    def __init__(self):
        self.users = {}       # uid -> {email, pw, confirmed, provider, meta}
        self.tokens = {}      # access -> uid
        self.refresh = {}     # refresh -> uid
        self.challenges = {}  # uid -> (challenge, method)
        self.codes = {}       # code -> uid
        self.members = {}     # uid -> {nickname, level, level_by}
        self.admins = set()
        self.posts = []
        self.comments = []
        self.seq = 0
        self.fail = {}        # rpc 이름 -> 한 번 돌려줄 응답
        self.not_ready = False
        self.settings = {"external": {"email": True, "kakao": True}, "disable_signup": False}
        self.calls = []
        self.unhandled = []
        self.hashes = {}      # token_hash -> (uid, type)
        self.edits = 0

    # ── 도구 ──
    def nid(self):
        self.seq += 1
        return self.seq

    def session(self, uid):
        at, rt = "at-" + uuid.uuid4().hex, "rt-" + uuid.uuid4().hex
        self.tokens[at] = uid
        self.refresh[rt] = uid
        u = self.users[uid]
        return {"access_token": at, "refresh_token": rt, "expires_in": 3600, "expires_at": int(time.time()) + 3600,
                "token_type": "bearer", "user": {"id": uid, "email": u.get("email")}}

    def add_user(self, email=None, pw=None, provider="email", meta=None, confirmed=False):
        uid = str(uuid.uuid4())
        self.users[uid] = {"email": email, "pw": pw, "confirmed": confirmed, "provider": provider, "meta": meta or {}}
        return uid

    def uid_by_email(self, email):
        for k, u in self.users.items():
            if u.get("email") == email:
                return k
        return None

    def issue_code(self, uid):
        code = "code-" + uuid.uuid4().hex[:12]
        self.codes[code] = uid
        return code

    def issue_hash(self, uid, typ):
        h = "th-" + uuid.uuid4().hex[:12]
        self.hashes[h] = (uid, typ)
        return h

    def level(self, uid):
        m = self.members.get(uid)
        return m and m["level"]

    def counts(self, uid):
        return (sum(1 for p in self.posts if p["uid"] == uid and p["status"] == "approved"),
                sum(1 for c in self.comments if c["uid"] == uid and c["status"] == "approved"))

    def row(self, p, uid):
        m = self.members[p["uid"]]
        return {"id": p["id"], "board": p.get("board", "free"), "title": p["title"], "excerpt": p["body"][:140], "cut": len(p["body"]) > 140,
                "nickname": m["nickname"], "level": m["level"], "staff": p["uid"] in self.admins,
                "created_at": p["created_at"], "edited_at": p.get("edited_at"),
                "comments": sum(1 for c in self.comments if c["post"] == p["id"] and c["status"] == "approved"),
                "mine": p["uid"] == uid}

    def nick_reason(self, n):
        s = re.sub(r"\s+", " ", (n or "").strip())
        if len(s) < 2 or len(s) > 12 or len(norm(s)) < 2:
            return "bad_nick_len"
        if not re.fullmatch(r"[0-9A-Za-z가-힣 _.\-]+", s):
            return "bad_nick_char"
        nn = norm(s)
        if nn in ("인순이", "인순", "김인순", "insooni") or re.search(r"(운영자|관리자|공식|admin|official|staff)", nn):
            return "reserved_nick"
        return None

    # ── 요청 처리 ──
    def handle(self, route):
        req = route.request
        u = urlparse(req.url)
        path, q = u.path, parse_qs(u.query)
        try:
            body = json.loads(req.post_data or "{}")
        except Exception:
            body = {}
        bearer = (req.headers.get("authorization") or "").replace("Bearer ", "")

        def J(obj, status=200):
            return route.fulfill(status=status, content_type="application/json", body=json.dumps(obj, ensure_ascii=False))

        if req.method == "OPTIONS":
            return route.fulfill(status=204, body="")

        # ── 인증 ──
        if path == "/auth/v1/settings":
            return J(self.settings)
        if path == "/auth/v1/token":
            gt = q.get("grant_type", [""])[0]
            self.calls.append(("auth:" + gt, {k: ("***" if "password" in k else v) for k, v in body.items()}))
            if gt == "password":
                uid = self.uid_by_email(body.get("email"))
                if uid and self.users[uid]["pw"] == body.get("password"):
                    if not self.users[uid]["confirmed"]:
                        return J({"error_code": "email_not_confirmed", "msg": "Email not confirmed"}, 400)
                    return J(self.session(uid))
                return J({"error_code": "invalid_credentials", "msg": "Invalid login credentials"}, 400)
            if gt == "refresh_token":
                uid = self.refresh.pop(body.get("refresh_token"), None)
                if uid and uid in self.users:
                    return J(self.session(uid))
                return J({"error_code": "refresh_token_not_found"}, 400)
            if gt == "pkce":
                uid = self.codes.pop(body.get("auth_code"), None)
                ch = self.challenges.get(uid)
                v = body.get("code_verifier") or ""
                calc = base64.urlsafe_b64encode(hashlib.sha256(v.encode()).digest()).decode().rstrip("=")
                if uid and ch and ((ch[1] == "s256" and calc == ch[0]) or (ch[1] == "plain" and v == ch[0])):
                    self.users[uid]["confirmed"] = True
                    return J(self.session(uid))
                return J({"error_code": "bad_code_verifier", "msg": "code challenge does not match"}, 400)
        if path == "/auth/v1/signup":
            self.calls.append(("auth:signup", {"email": body.get("email"), "redirect_to": q.get("redirect_to", [""])[0]}))
            if len(body.get("password") or "") < 8:
                return J({"error_code": "weak_password", "msg": "Password should be at least 8 characters"}, 422)
            uid = self.uid_by_email(body.get("email")) or self.add_user(body.get("email"), body.get("password"))
            self.challenges[uid] = (body.get("code_challenge"), body.get("code_challenge_method"))
            return J({"id": uid, "email": body.get("email")})
        if path == "/auth/v1/recover":
            self.calls.append(("auth:recover", {"email": body.get("email")}))
            uid = self.uid_by_email(body.get("email"))
            if uid:
                self.challenges[uid] = (body.get("code_challenge"), body.get("code_challenge_method"))
            return J({})
        if path == "/auth/v1/verify" and req.method == "POST":
            self.calls.append(("auth:verify", {"type": body.get("type")}))
            hit = self.hashes.pop(body.get("token_hash"), None)
            if hit and hit[0] in self.users and hit[1] == body.get("type"):
                self.users[hit[0]]["confirmed"] = True
                return J(self.session(hit[0]))
            return J({"error_code": "otp_expired", "msg": "Email link is invalid or has expired"}, 403)
        if path == "/auth/v1/user" and req.method == "GET":
            uid = self.tokens.get(bearer)
            self.calls.append(("auth:getuser", {"ok": bool(uid)}))
            return J({"id": uid, "email": self.users[uid].get("email")}) if uid else J({"msg": "invalid JWT"}, 401)
        if path == "/auth/v1/user" and req.method == "PUT":
            uid = self.tokens.get(bearer)
            if not uid:
                return J({"msg": "invalid JWT"}, 401)
            self.users[uid]["pw"] = body.get("password")
            self.calls.append(("auth:setpw", {}))
            return J({"id": uid})
        if path == "/auth/v1/logout":
            self.tokens.pop(bearer, None)
            self.calls.append(("auth:logout", {}))
            return route.fulfill(status=204, body="")
        if path == "/auth/v1/authorize":
            # 카카오 왕복: 카카오 계정 하나를 만들고 일회용 코드를 실어 돌려보낸다
            self.calls.append(("auth:authorize", {"provider": q.get("provider", [""])[0],
                                                  "method": q.get("code_challenge_method", [""])[0]}))
            uid = None
            for k, uu in self.users.items():
                if uu["provider"] == "kakao":
                    uid = k
            if not uid:
                uid = self.add_user(None, None, "kakao", {"nickname": "카카오별명"}, True)
            self.challenges[uid] = (q.get("code_challenge", [""])[0], q.get("code_challenge_method", [""])[0])
            code = self.issue_code(uid)
            back = q.get("redirect_to", [B + "community.html"])[0]
            # GoTrue 처럼 주소를 해석해 code 를 붙인다(돌아올 주소에 이미 ?bd=kakao 가 있다)
            return route.fulfill(status=302, headers={"Location": back + ("&" if "?" in back else "?") + "code=" + code}, body="")

        # ── 공개 뷰(사랑방의 다른 섹션) — 빈 목록 ──
        if path.startswith("/rest/v1/") and not path.startswith("/rest/v1/rpc/") and req.method == "GET":
            return J([])

        # ── RPC ──
        if path.startswith("/rest/v1/rpc/"):
            name = path.rsplit("/", 1)[1]
            self.calls.append((name, body))
            if bearer and bearer.startswith("at-") and bearer not in self.tokens:
                return J({"code": "PGRST301", "message": "JWT expired"}, 401)
            uid = self.tokens.get(bearer)
            if name in self.fail:
                return J(self.fail.pop(name))
            board_fns = ("member_", "board_", "comment_")
            if self.not_ready and name.startswith(board_fns):
                return J({"code": "PGRST202", "message": "Could not find the function"}, 404)
            fn = getattr(self, "rpc_" + name, None)
            if fn:
                return J(fn(uid, body))
            if name in ("note_status", "withdraw_note", "cancel_note", "submit_note", "submit_preset", "request_song"):
                return J({"ok": False, "reason": "not_found"})
        self.unhandled.append(req.method + " " + req.url)
        return route.abort()

    # ── 회원 ──
    def rpc_member_me(self, uid, b):
        if not uid:
            return {"ok": False, "reason": "not_logged_in"}
        u, m = self.users[uid], self.members.get(uid)
        if not m:
            meta = u["meta"]
            return {"ok": True, "joined": False, "provider": u["provider"],
                    "suggest": (meta.get("nickname") or "")[:12], "admin": uid in self.admins}
        np, nc = self.counts(uid)
        return {"ok": True, "joined": True, "nickname": m["nickname"], "level": m["level"], "admin": uid in self.admins,
                "provider": u["provider"], "posts_ok": np, "comments_ok": nc,
                "posts_pending": sum(1 for p in self.posts if p["uid"] == uid and p["status"] == "pending"),
                "auto_up": m["level_by"] == "auto",
                "need_posts": 3, "need_comments": 5, "joined_at": "2026-10-02T00:00:00Z"}

    def rpc_member_join(self, uid, b):
        if not uid:
            return {"ok": False, "reason": "not_logged_in"}
        if uid in self.members:
            return {"ok": False, "reason": "already"}
        if b.get("p_agree") is not True:
            return {"ok": False, "reason": "need_agree"}
        if b.get("p_age14") is not True:
            return {"ok": False, "reason": "need_age"}
        r = self.nick_reason(b.get("p_nickname"))
        if r:
            return {"ok": False, "reason": r}
        n = re.sub(r"\s+", " ", b["p_nickname"].strip())
        if any(norm(m["nickname"]) == norm(n) for m in self.members.values()):
            return {"ok": False, "reason": "nick_taken"}
        adm = uid in self.admins
        self.members[uid] = {"nickname": n, "level": "member" if adm else "sprout", "level_by": "admin" if adm else "auto"}
        return {"ok": True}

    def rpc_member_rename(self, uid, b):
        if not uid:
            return {"ok": False, "reason": "not_logged_in"}
        r = self.nick_reason(b.get("p_nickname"))
        if r:
            return {"ok": False, "reason": r}
        n = re.sub(r"\s+", " ", b["p_nickname"].strip())
        if any(k != uid and norm(m["nickname"]) == norm(n) for k, m in self.members.items()):
            return {"ok": False, "reason": "nick_taken"}
        self.members[uid]["nickname"] = n
        return {"ok": True, "nickname": n}

    def rpc_member_leave(self, uid, b):
        if not uid:
            return {"ok": False, "reason": "not_logged_in"}
        if uid in self.admins:
            return {"ok": False, "reason": "admin_cannot_leave"}
        self.posts = [p for p in self.posts if p["uid"] != uid]
        self.comments = [c for c in self.comments if c["uid"] != uid]
        self.members.pop(uid, None)
        self.users.pop(uid, None)
        return {"ok": True}

    # ── 게시판 ──
    def rpc_board_list(self, uid, b):
        bd = b.get("p_board")
        if bd not in (None, "notice", "hello", "free", "review"):
            return {"ok": False, "reason": "bad_board"}
        rows = [p for p in sorted(self.posts, key=lambda p: -p["id"]) if p["status"] == "approved"
                and (b.get("p_before") is None or p["id"] < b["p_before"])
                and ((p.get("board", "free") != "notice") if bd is None else (p.get("board", "free") == bd))]
        lim = b.get("p_limit") or 20
        pins = []
        if bd is None and b.get("p_before") is None:
            pins = [self.row(p, uid) for p in sorted(self.posts, key=lambda p: -p["id"])
                    if p["status"] == "approved" and p.get("board") == "notice"][:3]
        return {"ok": True, "rows": [self.row(p, uid) for p in rows[:lim]], "notices": pins, "more": len(rows) > lim}

    def rpc_cafe_info(self, uid, b):
        return {"ok": True, "members": sum(1 for m in self.members.values() if m["level"] != "blocked"),
                "posts": sum(1 for p in self.posts if p["status"] == "approved")}

    def rpc_board_read(self, uid, b):
        p = next((p for p in self.posts if p["id"] == b.get("p_id")), None)
        if not p or (p["status"] != "approved" and p["uid"] != uid):
            return {"ok": False, "reason": "not_found"}
        m = self.members[p["uid"]]
        cm = [{"id": c["id"], "body": c["body"], "status": c["status"], "created_at": c["created_at"],
               "nickname": self.members[c["uid"]]["nickname"], "level": self.members[c["uid"]]["level"],
               "staff": c["uid"] in self.admins, "mine": c["uid"] == uid}
              for c in self.comments if c["post"] == p["id"] and (c["status"] == "approved" or c["uid"] == uid)]
        return {"ok": True, "post": {"id": p["id"], "board": p.get("board", "free"), "title": p["title"], "body": p["body"], "status": p["status"],
                                     "created_at": p["created_at"], "edited_at": p.get("edited_at"),
                                     "nickname": m["nickname"], "level": m["level"], "staff": p["uid"] in self.admins,
                                     "mine": p["uid"] == uid}, "comments": cm}

    def rpc_board_mine(self, uid, b):
        if not uid:
            return {"ok": False, "reason": "not_logged_in"}
        return {"ok": True, "rows": [{"id": p["id"], "board": p.get("board", "free"), "title": p["title"], "status": p["status"], "created_at": p["created_at"],
                                      "comments": 0} for p in sorted(self.posts, key=lambda p: -p["id"]) if p["uid"] == uid]}

    def _writer(self, uid):
        if not uid:
            return None, {"ok": False, "reason": "not_logged_in"}
        if uid not in self.members:
            return None, {"ok": False, "reason": "not_member"}
        if self.members[uid]["level"] == "blocked":
            return None, {"ok": False, "reason": "blocked"}
        return self.members[uid], None

    def rpc_board_write(self, uid, b):
        m, err = self._writer(uid)
        if err:
            return err
        t, bd = (b.get("p_title") or "").strip(), (b.get("p_body") or "").strip()
        board = b.get("p_board") or "free"
        if board not in ("notice", "hello", "free", "review") or (board == "notice" and uid not in self.admins):
            return {"ok": False, "reason": "bad_board"}
        if len(t) < 2:
            return {"ok": False, "reason": "title_empty"}
        if len(bd) < 2:
            return {"ok": False, "reason": "empty"}
        st = "approved" if (m["level"] == "member" or uid in self.admins) else "pending"
        p = {"id": self.nid(), "uid": uid, "board": board, "title": t, "body": bd, "status": st, "created_at": "2026-10-02T03:00:00Z"}
        self.posts.append(p)
        return {"ok": True, "id": p["id"], "status": st}

    def rpc_board_edit(self, uid, b):
        p = next((p for p in self.posts if p["id"] == b.get("p_id") and p["uid"] == uid), None)
        if not p:
            return {"ok": False, "reason": "not_found"}
        m = self.members[uid]
        self.edits += 1
        p["title"], p["body"], p["edited_at"] = b["p_title"].strip(), b["p_body"].strip(), "2026-10-02T04:%02d:00Z" % self.edits
        if b.get("p_board"):
            p["board"] = b["p_board"]
        if not (m["level"] == "member" or uid in self.admins):
            p["status"] = "pending"
        return {"ok": True, "status": p["status"]}

    def rpc_board_delete(self, uid, b):
        p = next((p for p in self.posts if p["id"] == b.get("p_id") and p["uid"] == uid), None)
        if not p:
            return {"ok": False, "reason": "not_found"}
        self.posts.remove(p)
        self.comments = [c for c in self.comments if c["post"] != p["id"]]
        return {"ok": True, "was": p["status"]}

    def rpc_comment_write(self, uid, b):
        m, err = self._writer(uid)
        if err:
            return err
        if not (b.get("p_body") or "").strip():
            return {"ok": False, "reason": "empty"}
        if not any(p["id"] == b.get("p_post_id") and p["status"] == "approved" for p in self.posts):
            return {"ok": False, "reason": "not_found"}
        st = "approved" if (m["level"] == "member" or uid in self.admins) else "pending"
        c = {"id": self.nid(), "post": b["p_post_id"], "uid": uid, "body": b["p_body"].strip(), "status": st,
             "created_at": "2026-10-02T03:10:00Z"}
        self.comments.append(c)
        return {"ok": True, "id": c["id"], "status": st}

    def rpc_comment_delete(self, uid, b):
        c = next((c for c in self.comments if c["id"] == b.get("p_id") and c["uid"] == uid), None)
        if not c:
            return {"ok": False, "reason": "not_found"}
        self.comments.remove(c)
        return {"ok": True, "was": c["status"]}

    # ── 운영자(운영 화면 시험용) ──
    def rpc_admin_whoami(self, uid, b):
        return {"ok": True, "signed_in": bool(uid), "admin": uid in self.admins, "email": uid and self.users[uid].get("email")}

    def rpc_admin_list(self, uid, b):
        if uid not in self.admins:
            return {"ok": False, "reason": "forbidden"}
        st = b.get("p_status")
        rows = []
        for p in self.posts:
            if p["status"] == st:
                m = self.members[p["uid"]]
                rows.append({"kind": "bpost", "id": p["id"], "name": m["nickname"], "content": p["body"], "status": st,
                             "ai_verdict": None, "ai_reason": None, "created_at": p["created_at"], "preset": None,
                             "song_title": None, "title": p["title"], "post_id": None, "level": m["level"],
                             "ver": p.get("edited_at") or p["created_at"]})
        for c in self.comments:
            if c["status"] == st:
                m = self.members[c["uid"]]
                pt = next((p["title"] for p in self.posts if p["id"] == c["post"]), "")
                rows.append({"kind": "comment", "id": c["id"], "name": m["nickname"], "content": c["body"], "status": st,
                             "ai_verdict": None, "ai_reason": None, "created_at": c["created_at"], "preset": None,
                             "song_title": None, "title": pt, "post_id": c["post"], "level": m["level"]})
        cnt = {s: sum(1 for x in self.posts + self.comments if x["status"] == s) for s in ("pending", "approved", "rejected")}
        return {"ok": True, "rows": rows, "counts": cnt}

    def rpc_admin_set_status(self, uid, b):
        if uid not in self.admins:
            return {"ok": False, "reason": "forbidden"}
        pool = self.posts if b["p_kind"] == "bpost" else self.comments
        x = next((x for x in pool if x["id"] == b["p_id"]), None)
        if not x:
            return {"ok": False, "reason": "not_found"}
        if b["p_kind"] == "bpost" and b["p_status"] == "approved" and b.get("p_ver") != (x.get("edited_at") or x["created_at"]):
            return {"ok": False, "reason": "changed"}
        frm = x["status"]
        x["status"] = b["p_status"]
        up = False
        m = self.members.get(x["uid"])
        if b["p_status"] == "approved" and m and m["level"] == "sprout" and m["level_by"] == "auto":
            np, nc = self.counts(x["uid"])
            if np >= 3 and nc >= 5:
                m["level"] = "member"
                up = True
        return {"ok": True, "kind": b["p_kind"], "id": b["p_id"], "from": frm, "status": b["p_status"], "levelup": up}

    def rpc_admin_members(self, uid, b):
        if uid not in self.admins:
            return {"ok": False, "reason": "forbidden"}
        rows = []
        for k, m in self.members.items():
            np, nc = self.counts(k)
            e = self.users[k].get("email") or ""
            rows.append({"user_id": k, "nickname": m["nickname"], "level": m["level"], "level_by": m["level_by"],
                         "joined_at": "2026-10-02T00:00:00Z", "provider": self.users[k]["provider"],
                         "email_masked": re.sub(r"^(.{1,2})[^@]*(@.*)$", r"\1***\2", e) if e else "",
                         "staff": k in self.admins, "posts_ok": np, "comments_ok": nc, "waiting": 0})
        q = (b.get("p_q") or "").strip()
        if q:
            rows = [r for r in rows if q in r["nickname"]]
        c = {"total": len(self.members), "sprout": sum(1 for m in self.members.values() if m["level"] == "sprout"),
             "member": sum(1 for m in self.members.values() if m["level"] == "member"),
             "blocked": sum(1 for m in self.members.values() if m["level"] == "blocked")}
        return {"ok": True, "rows": rows, "counts": c, "need_posts": 3, "need_comments": 5}

    def rpc_admin_set_level(self, uid, b):
        if uid not in self.admins:
            return {"ok": False, "reason": "forbidden"}
        if b.get("p_user") in self.admins:
            return {"ok": False, "reason": "staff"}
        m = self.members.get(b.get("p_user"))
        if not m:
            return {"ok": False, "reason": "not_found"}
        frm = m["level"]
        m["level"], m["level_by"] = b["p_level"], "admin"
        return {"ok": True, "from": frm, "level": b["p_level"]}


def suite(br, board_src=None, quick_errs=None, R=None):
    """한 바퀴. board_src 가 있으면 board.min.js 대신 그 소스를 싣는다(뮤테이션).
    R 을 넘기면 흐름이 중간에 멈춰도 거기까지의 결과가 남는다."""
    R = [] if R is None else R

    def t(name, ok, info=""):
        R.append((name, bool(ok), str(info)[:200]))

    fake = Fake()
    errs = []

    def mk(on=True, mobile=True):
        c = br.new_context(viewport={"width": 375, "height": 812}, is_mobile=mobile, has_touch=mobile, locale="ko-KR")
        if on:   # 스위치를 켠 상태(config.js 는 정해진 값이 있으면 손대지 않는다)
            c.add_init_script("window.INSOONI_CONFIG = {board: true};")
        c.route(re.compile(r"https://%s/.*" % re.escape(SUPA)), fake.handle)
        if board_src is not None:
            c.route(re.compile(r".*/assets/js/board\.min\.js.*"),
                    lambda r: r.fulfill(status=200, content_type="text/javascript", body=board_src))
        return c

    ctx = mk()
    pg = ctx.new_page()
    pg.set_default_timeout(6000)
    pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    dialogs = []
    pg.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))

    def go(url="community.html"):
        # '#' 만 다른 주소로의 goto 는 같은 문서 안 이동이라 새로 싣지 않는다 — 늘 새로 싣는다
        pg.goto("about:blank")
        pg.goto(B + url, wait_until="load")
        pg.wait_for_timeout(1300)

    def txt(sel):
        return pg.inner_text(sel) if pg.locator(sel).count() else ""

    def tc(sel):   # 버튼은 CSS 로 대문자 — 원문으로 본다
        return pg.evaluate("(document.querySelector(%r) || {}).textContent || ''" % sel)

    def sheet():
        return txt("#bd-sheet") if pg.is_visible("#bd-sheet") else ""

    def h():
        return pg.evaluate("location.hash")

    FAN = "fan@test.local"

    # ── A. 카페 모양 ─────────────────────────────────────────
    go()
    pg.wait_for_timeout(1200)   # 제목 글꼴(display.css)이 늦게 들어와 줄 높이가 바뀐 뒤에 잰다
    lay = pg.evaluate("""() => {
      const y = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + scrollY : -1; };
      const wb = document.querySelector('#bd-write-btn').getBoundingClientRect().bottom + scrollY;
      return {cafe: y('#board'), write: wb, setlist: y('#setlist'), doors: y('#sb-doors'),
              gone: ['#sb-today', '#sb-stream', '#artist-letter', '#sb-fold'].filter(s => document.querySelector(s)),
              tabs: [...document.querySelectorAll('.cafe-menu a')].map(a => a.textContent.trim()),
              over: document.documentElement.scrollWidth - document.documentElement.clientWidth};
    }""")
    t("A1 한 줄 남기기·남기신 줄·위쪽 편지 섹션이 사라짐", not lay["gone"], lay["gone"])
    t("A2 게시판 탭 6개(전체글·공지·인순이의 편지·가입인사·자유게시판·공연·방송 후기)",
      lay["tabs"] == ["전체글", "공지", "인순이의 편지", "가입인사", "자유게시판", "공연·방송 후기"], lay["tabs"])
    t("A3 '글쓰기' 버튼 아래 끝까지 폰 첫 화면 안", 0 < lay["write"] < 812, lay)
    t("A4 순서: 카페 → 신청곡 → 나가는 길", 0 < lay["cafe"] < lay["setlist"] < lay["doors"], lay)
    t("A5 폰에서 가로 넘침 없음", lay["over"] <= 1, lay["over"])
    t("A6 전체글 위에 '인순이의 편지' 고정 줄", "인순이가 팬들에게 직접 남긴 편지 2편" in txt("#bd-pins"), txt("#bd-pins"))
    t("A7 카페 숫자(회원·글)가 실제 값으로", "회원 0명 · 글 0개" in txt("#cafe-stat"), txt("#cafe-stat"))
    pg.evaluate("document.getElementById('main').__keep = 1")
    pg.click(".cafe-menu a[data-b=letters]")
    pg.wait_for_timeout(600)
    t("A8 '인순이의 편지' 게시판: 두 편 · 쓰기 버튼 없음", pg.locator("#bd-list .cafe-row").count() == 2
      and not pg.is_visible("#bd-write-btn") and h() == "#b=letters", (pg.locator("#bd-list .cafe-row").count(), h()))
    pg.click("#bd-list .cafe-row >> nth=0 >> a")
    pg.wait_for_timeout(600)
    t("A9 편지 보기: 원문 손글씨 · 당시 조회수 · 목록으로", len(txt("#cafe-post .letter-body")) > 20 and "당시 조회" in txt("#cafe-post")
      and pg.locator("#cafe-post .cafe-back").count() == 2 and not pg.is_visible("#cafe-list"), txt("#cafe-post")[:80])
    pg.go_back()
    pg.wait_for_timeout(500)
    t("A10 폰의 '뒤로 가기' → 편지 목록으로", pg.is_visible("#cafe-list") and h() == "#b=letters", h())
    t("A11 카페 안 이동·뒤로 가기에 페이지 본문을 새로 받지 않음(라우터)", pg.evaluate("document.getElementById('main').__keep") == 1)
    pg.click(".cafe-menu a[data-b=all]")
    pg.wait_for_timeout(500)

    # ── B. 로그인 전 글쓰기 → 회원 창 ─────────────────────────
    go("music.html")
    pg.click("a[href='community.html#write=free']")
    pg.wait_for_timeout(1500)
    t("B0 신청곡 페이지 '사연 보내기' → 사랑방으로 와서 회원 창(라우터가 주소를 먼저 바꿈)",
      "/community" in pg.url and "카카오로 시작하기" in sheet(), (pg.url, sheet()[:40]))
    pg.keyboard.press("Escape")
    go()
    pg.click("#bd-write-btn")
    pg.wait_for_timeout(500)
    s = sheet()
    t("B1 로그인 전 '글쓰기' → 회원 창(카카오·이메일)", "카카오로 시작하기" in s and "로그인" in s and "처음 가입" in s, s[:120])
    t("B2 회원 창이 이유를 말함", "글을 쓰려면 먼저 회원으로" in s, s[:80])
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(200)
    t("B3 Esc 로 닫힘", not pg.is_visible("#bd-sheet"))

    # ── C. 이메일 가입 → 메일 링크 → 별명 → 이어서 글쓰기 ──────
    pg.click("#bd-write-btn")
    pg.wait_for_timeout(400)
    pg.click("#bd-sheet .bd-tab >> text=처음 가입")
    pg.fill("#bd-ue", FAN)
    pg.fill("#bd-up", "goodpass123")
    pg.fill("#bd-up2", "goodpass124")
    pg.click("#bd-sheet button[type=submit]")
    pg.wait_for_timeout(200)
    t("C1 비밀번호 두 칸이 다르면 막음", "서로 다릅니다" in sheet(), sheet()[-80:])
    pg.fill("#bd-up", "goodpass123")
    pg.fill("#bd-up2", "goodpass123")
    pg.click("#bd-sheet button[type=submit]")
    pg.wait_for_timeout(700)
    t("C2 가입 → '메일을 확인해 주세요' + 메일이 안 올 때의 길", "메일을 확인해 주세요" in sheet() and "로그인하기" in sheet()
      and "이미 가입하신 주소라면" in sheet(), sheet()[:160])
    su = [c for c in fake.calls if c[0] == "auth:signup"]
    t("C3 돌아올 주소에 하던 일(bd=signup)", su and su[-1][1]["redirect_to"].endswith("/community.html?bd=signup"), su[-1:])
    pk = pg.evaluate("JSON.parse(localStorage.getItem('insooni_pkce') || 'null')")
    t("C4 일회용 검증값은 이 기기에만(서버로는 해시만)", pk and pk.get("p") == "signup"
      and fake.challenges[fake.uid_by_email(FAN)][0] != pk.get("v") and fake.challenges[fake.uid_by_email(FAN)][1] == "s256", pk)
    t("C5 비밀번호가 어디에도 저장되지 않음", "goodpass123" not in pg.evaluate("JSON.stringify({l: localStorage, s: sessionStorage})"))
    go("community.html?bd=signup&code=" + fake.issue_code(fake.uid_by_email(FAN)))
    t("C6 돌아온 뒤 주소창에서 코드가 지워짐", "code=" not in pg.url, pg.url)
    t("C7 메일 링크로 돌아오면 '가입 마치기' 창", "가입 마치기" in sheet(), sheet()[:80])
    pg.fill("#bd-jn", "인순이")
    pg.check("#bd-ja"); pg.check("#bd-jg")
    pg.click("#bd-sheet button[type=submit]")
    pg.wait_for_timeout(500)
    t("C8 '인순이' 별명은 막힘", "쓸 수 없습니다" in sheet(), sheet()[-100:])
    pg.uncheck("#bd-ja")
    pg.fill("#bd-jn", "홍천팬")
    pg.click("#bd-sheet button[type=submit]")
    pg.wait_for_timeout(300)
    t("C9 약관 동의 없이는 못 마침", "동의해 주세요" in sheet())
    pg.check("#bd-ja")
    pg.click("#bd-sheet button[type=submit]")
    pg.wait_for_timeout(1300)
    t("C10 가입 마침 → 아까 누른 '글쓰기'가 이어서 열림", not pg.is_visible("#bd-sheet") and pg.is_visible("#bd-form")
      and h().startswith("#write"), (sheet()[:60], h()))
    opts = pg.evaluate("[...document.querySelectorAll('#bd-boardsel option')].map(o => o.value)")
    t("C11 회원 글쓰기 게시판: 가입인사·자유·후기(공지는 없음)", opts == ["hello", "free", "review"], opts)
    t("C12 위쪽에 '홍천팬 · 새싹' · 정회원까지 글 3·댓글 5", "홍천팬" in txt("#bd-who") and "새싹" in txt("#bd-who"), txt("#bd-who"))

    # ── D. 쓰던 글 자동 저장 ─────────────────────────────────
    pg.select_option("#bd-boardsel", "hello")
    pg.fill("#bd-title", "첫 인사드립니다")
    pg.fill("#bd-body", "홍천에서 왔습니다.\n둘째 줄입니다.")
    pg.wait_for_timeout(700)
    pg.reload(wait_until="load")
    pg.wait_for_timeout(1500)
    t("D1 새로고침해도 쓰던 글·게시판이 돌아옴", pg.input_value("#bd-title") == "첫 인사드립니다"
      and "둘째 줄" in pg.input_value("#bd-body") and pg.input_value("#bd-boardsel") == "hello"
      and "불러왔습니다" in txt("#bd-msg"), (txt("#bd-msg"), h()))
    t("D2 글자 수 표시", "/ 4,000" in txt("#bd-count"), txt("#bd-count"))

    # ── E. 새싹 글 → 대기 ────────────────────────────────────
    pg.click("#bd-go")
    pg.wait_for_timeout(1300)
    t("E1 새싹 글 → 그 게시판 목록으로 + '운영자가 확인한 뒤 올라갑니다'", "운영자가 확인한 뒤" in txt("#bd-msg") and h() == "#b=hello",
      (txt("#bd-msg"), h()))
    t("E2 '확인을 기다리는 내 글 1'이 펼쳐져 '확인 중'", pg.is_visible("#bd-mine") and txt("#bd-mine-n") == "1"
      and pg.evaluate("document.querySelector('#bd-mine').open") and "확인 중" in pg.inner_text("#bd-mine-list"), txt("#bd-mine"))
    t("E3 공개 목록에는 아직 없음", pg.locator("#bd-list .cafe-row").count() == 0 and pg.is_visible("#bd-empty"))
    t("E4 다 올린 뒤 초안은 지워짐", pg.evaluate("localStorage.getItem('insooni_board_draft')") is None)
    pg.click("#bd-write-btn")
    pg.wait_for_timeout(500)
    t("E5 가입인사 게시판에서 글쓰기 → 게시판이 미리 골라짐", pg.input_value("#bd-boardsel") == "hello", pg.input_value("#bd-boardsel"))
    pg.select_option("#bd-boardsel", "free")
    pg.fill("#bd-title", '<img src=x onerror="window.__xss=1">위험한 제목')
    pg.fill("#bd-body", '<b>굵게</b><script>window.__xss=2</script>')
    pg.click("#bd-go")
    pg.wait_for_timeout(1100)
    for p in fake.posts:
        p["status"] = "approved"     # 운영자가 올렸다
    go("community.html#b=all")
    rows = pg.locator("#bd-list .cafe-row")
    t("F1 운영자가 올린 뒤 전체글에 2편(게시판 이름과 함께)", rows.count() == 2 and "[가입인사]" not in txt("#bd-list")
      and "가입인사" in txt("#bd-list") and "자유게시판" in txt("#bd-list"), txt("#bd-list")[:120])
    t("F2 제목 속 태그는 글자로만(요소·실행 없음)", pg.locator("#bd-list img, #bd-list b, #bd-list script").count() == 0
      and not pg.evaluate("window.__xss") and "<img" in pg.inner_text("#bd-list"), pg.inner_text("#bd-list")[:80])
    t("F2b 카페 숫자 갱신(회원 1 · 글 2)", "회원 1명 · 글 2개" in txt("#cafe-stat"), txt("#cafe-stat"))
    pg.click("#bd-list .cafe-row >> nth=1 >> a")
    pg.wait_for_timeout(900)
    pid1 = int(re.sub(r"\D", "", h()) or 0)
    t("F3 목록에서 누르면 글 보기 화면(#p번호) · 본문 줄바꿈 그대로", h().startswith("#p") and not pg.is_visible("#cafe-list")
      and "홍천에서 왔습니다.\n둘째 줄입니다." in txt("#cafe-post .bd-body"), (h(), txt("#cafe-post .bd-body")))
    pg.fill("#cafe-post textarea", "반갑습니다!")
    pg.click("#cafe-post .bd-cform button")
    pg.wait_for_timeout(1000)
    post = txt("#cafe-post")
    t("F4 새싹 댓글 → '운영자가 확인한 뒤 모두에게' · 나에겐 '확인 중'", "운영자가 확인한 뒤 모두에게" in post
      and "반갑습니다!" in post and "확인 중" in post, post[-160:])
    pg.fill("#cafe-post textarea", "쓰다 만 댓글")
    pg.click("#cafe-post .cafe-back >> nth=0")
    pg.wait_for_timeout(700)
    t("F5 '← 목록으로' → 목록", pg.is_visible("#cafe-list") and h().startswith("#b="), h())
    pg.go_back()
    pg.wait_for_timeout(1000)
    t("F6 다시 그 글로(뒤로 가기) → 쓰던 댓글은 그대로", pg.input_value("#cafe-post textarea") == "쓰다 만 댓글",
      pg.input_value("#cafe-post textarea") if pg.locator("#cafe-post textarea").count() else h())

    # ── G. 운영자가 정한 새싹 · 남의 링크 · 정회원 · 고치기 · 지우기 ──
    fake.members[fake.uid_by_email(FAN)]["level_by"] = "admin"
    go("community.html#b=all")
    t("G0 운영자가 정한 새싹에게는 남은 숫자 대신 '운영자가 정했습니다'", "운영자가 정했습니다" in txt("#bd-note")
      and "남았습니다" not in txt("#bd-note"), txt("#bd-note"))
    before = pg.evaluate("localStorage.getItem('insooni_member_session')")
    atk = fake.add_user("attacker@test.local", "x", confirmed=True)
    fake.members[atk] = {"nickname": "남의계정", "level": "member", "level_by": "auto"}
    go("community.html#access_token=" + fake.session(atk)["access_token"] + "&expires_in=3600&type=recovery")
    t("G0b 남의 진짜 열쇠를 실은 링크로도 지금 세션이 바뀌지 않음", pg.evaluate("localStorage.getItem('insooni_member_session')") == before
      and "홍천팬" in txt("#bd-who") and "새 비밀번호" not in sheet(), txt("#bd-who"))
    fake.members[fake.uid_by_email(FAN)].update(level="member", level_by="auto")
    go("community.html#b=free")
    t("G1 정회원 안내", "정회원입니다" in txt("#bd-note"), txt("#bd-note"))
    pg.click("#bd-write-btn")
    pg.wait_for_timeout(400)
    pg.fill("#bd-title", "정회원 첫 글")
    pg.fill("#bd-body", "바로 올라가나요?")
    fake.fail["board_write"] = {"ok": False, "reason": "rate_limited"}
    pg.click("#bd-go")
    pg.wait_for_timeout(700)
    t("G2 서버가 거절하면 이유를 말하고 쓴 글은 그대로", "잠시 뒤에 다시 올려" in txt("#bd-msg")
      and pg.input_value("#bd-title") == "정회원 첫 글" and pg.input_value("#bd-body") == "바로 올라가나요?", txt("#bd-msg"))
    pg.click("#bd-go")
    pg.wait_for_timeout(1300)
    t("G3 정회원 글 → 바로 공개 · 그 글 보기로", "바로 보입니다" in txt("#bd-msg") and h().startswith("#p")
      and "정회원 첫 글" in txt("#cafe-post .cafe-post-title"), (txt("#bd-msg"), h()))
    pg.click("#cafe-post .bd-acts >> text=고치기")
    pg.wait_for_timeout(800)
    t("G4 '고치기' → 같은 칸에 원래 글(#edit)", pg.input_value("#bd-body") == "바로 올라가나요?" and "글 고치기" in txt("#bd-form-h")
      and h().startswith("#edit="), h())
    pg.fill("#bd-body", "고친 본문입니다.")
    pg.select_option("#bd-boardsel", "review")
    pg.click("#bd-go")
    pg.wait_for_timeout(1300)
    t("G5 고친 내용·게시판 반영 → 공개 유지 · 글 보기로", "고친 내용을 올렸습니다" in txt("#bd-msg")
      and any(p["body"] == "고친 본문입니다." and p["status"] == "approved" and p.get("board") == "review" for p in fake.posts)
      and "공연·방송 후기" in txt("#cafe-post .cafe-post-board"), txt("#bd-msg"))
    t("G6 고치는 동안의 글은 새 글 초안을 덮지 않음", pg.evaluate("localStorage.getItem('insooni_board_draft')") is None)
    pg.click("#cafe-post .bd-acts >> text=고치기")
    pg.wait_for_timeout(700)
    t("G8 고치는 중엔 '고치지 않고 닫기'", "고치지 않고 닫기" in tc("#bd-cancel"))
    pg.fill("#bd-body", "고치다 만 내용")
    nd = len(dialogs)
    pg.click("#bd-cancel")
    pg.wait_for_timeout(700)
    t("G9 고친 내용이 있으면 버리기 전에 묻고 → 글 보기로", len(dialogs) > nd and "버리고" in dialogs[-1]
      and h().startswith("#p"), (dialogs[-1:], h()))
    n0 = len(fake.posts)
    pg.click("#cafe-post .bd-acts >> text=지우기")
    pg.wait_for_timeout(1200)
    t("G7 '지우기'(확인창 수락) → 서버에서 사라지고 목록으로", len(fake.posts) == n0 - 1 and "지웠습니다" in txt("#bd-msg")
      and pg.is_visible("#cafe-list"), (txt("#bd-msg"), h()))

    # ── H. 내 정보 · 별명 · 로그아웃(초안 치우기) ───────────────
    pg.click("#bd-who .bd-me")
    pg.wait_for_timeout(400)
    t("H1 내 정보 창", "내 정보" in sheet() and "정회원" in sheet(), sheet()[:60])
    pg.fill("#bd-mn", "운영자님")
    pg.click("#bd-sheet form button[type=submit]")
    pg.wait_for_timeout(500)
    t("H2 '운영자' 들어간 별명은 막힘", "쓸 수 없습니다" in sheet(), sheet()[-80:])
    pg.fill("#bd-mn", "홍천팬2")
    pg.click("#bd-sheet form button[type=submit]")
    pg.wait_for_timeout(900)
    t("H3 별명 바꾸기", "바꿨습니다" in sheet() and fake.members[fake.uid_by_email(FAN)]["nickname"] == "홍천팬2")
    pg.keyboard.press("Escape")
    pg.click("#bd-write-btn"); pg.wait_for_timeout(400)
    pg.fill("#bd-title", "공용 기기 초안"); pg.fill("#bd-body", "다음 사람에게 보이면 안 됨"); pg.wait_for_timeout(700)
    pg.click("#bd-who .bd-me"); pg.wait_for_timeout(300)
    pg.click("#bd-sheet .bd-me-acts >> text=로그아웃")
    pg.wait_for_timeout(800)
    t("H4 로그아웃 → 세션 지움 · '로그인 · 가입'", pg.evaluate("localStorage.getItem('insooni_member_session')") is None
      and "로그인 · 가입" in txt("#bd-who") and any(c[0] == "auth:logout" for c in fake.calls), txt("#bd-who"))
    t("H5 로그아웃하면 이 기기의 쓰던 글을 치움(공용 기기)", pg.evaluate("localStorage.getItem('insooni_board_draft')") is None
      and pg.input_value("#bd-title") == "" and pg.input_value("#bd-body") == "" and not pg.is_visible("#bd-form"))

    # ── I. 카카오 왕복 · 탈퇴 ────────────────────────────────
    pg.click("#bd-who button")
    pg.wait_for_timeout(400)
    pg.click("#bd-sheet .bd-kakao")
    pg.wait_for_timeout(2200)
    az = [c for c in fake.calls if c[0] == "auth:authorize"]
    t("I1 카카오 → PKCE(s256)로 나갔다 코드로 돌아옴", az and az[-1][1] == {"provider": "kakao", "method": "s256"}
      and "code=" not in pg.url, (az[-1:], pg.url))
    t("I2 카카오 별명이 미리 채워진 '가입 마치기'", "가입 마치기" in sheet()
      and pg.input_value("#bd-jn") == "카카오별명", pg.input_value("#bd-jn") if pg.locator("#bd-jn").count() else sheet()[:60])
    pg.check("#bd-ja"); pg.check("#bd-jg")
    pg.click("#bd-sheet button[type=submit]")
    pg.wait_for_timeout(1200)
    t("I3 카카오 회원 가입 → 환영 인사", "카카오별명" in txt("#bd-who") and "어서 오세요" in txt("#bd-msg"), txt("#bd-msg"))
    pg.click("#bd-who .bd-me")
    pg.wait_for_timeout(300)
    pg.click("#bd-sheet .bd-leave")
    pg.wait_for_timeout(1200)
    t("I4 탈퇴(확인 두 번) → 서버에서 지워지고 로그아웃", not any(u["provider"] == "kakao" for u in fake.users.values())
      and "탈퇴했습니다" in txt("#bd-msg") and pg.evaluate("localStorage.getItem('insooni_member_session')") is None, txt("#bd-msg"))

    # ── J. 비밀번호 · 다른 브라우저 · 만료 링크 · token_hash ───
    pg.click("#bd-who button")
    pg.wait_for_timeout(300)
    pg.click("#bd-sheet .bd-link >> text=비밀번호를 잊으셨나요?")
    pg.fill("#bd-re", FAN)
    pg.click("#bd-sheet button[type=submit]")
    pg.wait_for_timeout(700)
    t("J1 비밀번호 메일 → '메일을 확인해 주세요'", "메일을 확인해 주세요" in sheet())
    go("community.html?bd=recover&code=" + fake.issue_code(fake.uid_by_email(FAN)))
    t("J2 메일 링크로 돌아오면 '새 비밀번호' 창", "새 비밀번호" in sheet(), sheet()[:60])
    pg.fill("#bd-np", "newpass456"); pg.fill("#bd-np2", "newpass456")
    pg.click("#bd-sheet button[type=submit]")
    pg.wait_for_timeout(1300)
    t("J3 새 비밀번호 저장 → 로그인된 상태", fake.users[fake.uid_by_email(FAN)]["pw"] == "newpass456"
      and "새 비밀번호를 저장했습니다" in txt("#bd-msg"), txt("#bd-msg"))
    pg.evaluate("localStorage.removeItem('insooni_pkce'); localStorage.removeItem('insooni_member_session')")
    go("community.html?bd=signup&code=lost-on-another-device")
    t("J4 다른 기기에서 연 가입 메일 → '메일 확인이 끝났습니다. 로그인해 주세요'", "메일 확인이 끝났습니다" in sheet(), sheet()[:80])
    pg.keyboard.press("Escape")
    go("community.html?bd=recover&code=lost-reset-link")
    t("J5 비밀번호 링크를 다른 브라우저에서 열면 → '요청한 브라우저' 안내 + 다시 요청 창",
      "요청한 브라우저" in sheet() and pg.locator("#bd-re").count() == 1, sheet()[:100])
    pg.keyboard.press("Escape")
    go("community.html?bd=signup&error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")
    t("J6 만료된 가입 링크 → '만료' + 다시 받는 법", "만료" in sheet() and "처음 가입" in sheet(), sheet()[:120])
    pg.keyboard.press("Escape")
    other = mk()   # 메일 앱 안의 브라우저 — 저장된 것이 하나도 없다
    op = other.new_page()
    op.on("pageerror", lambda e: errs.append(str(e)[:160]))
    op.goto(B + "community.html?token_hash=" + fake.issue_hash(fake.uid_by_email(FAN), "recovery") + "&type=recovery", wait_until="load")
    op.wait_for_timeout(1500)
    osh = op.inner_text("#bd-sheet") if op.is_visible("#bd-sheet") else ""
    t("J7 메일 앱 안(다른 브라우저)에서 연 비밀번호 링크도 token_hash 로 이어짐", "새 비밀번호" in osh and "token_hash" not in op.url, osh[:60])
    op.fill("#bd-np", "inapp789"); op.fill("#bd-np2", "inapp789")
    op.click("#bd-sheet button[type=submit]"); op.wait_for_timeout(1200)
    t("J8 그 브라우저에서 새 비밀번호 저장까지", fake.users[fake.uid_by_email(FAN)]["pw"] == "inapp789")
    other.close()
    fake.users[fake.uid_by_email(FAN)]["pw"] = "newpass456"

    # ── K. 세션이 서버에서 끝났을 때 · 영어 · 서버 준비 전 ──────
    pg.click("#bd-who button")
    pg.wait_for_timeout(300)
    pg.fill("#bd-ie", FAN)
    pg.fill("#bd-ip", "newpass456")
    pg.click("#bd-sheet button[type=submit]")
    pg.wait_for_timeout(1200)
    fake.tokens.clear()      # 서버가 세션을 끝냈다
    go()
    t("K1 서버가 세션을 끝냈으면 조용히 로그아웃 상태로(오류 없이)", "로그인 · 가입" in txt("#bd-who")
      and pg.evaluate("localStorage.getItem('insooni_member_session')") is None, txt("#bd-who"))
    pg.click(".lang-toggle")
    pg.wait_for_timeout(1500)
    t("K2 영어로 바꾸면 카페도 영어", tc("#bd-write-btn") == "Write a post" and "Sarangbang Café" in tc("#h-board")
      and "Sign in" in tc("#bd-who") and "Notices" in tc(".cafe-menu"), (tc("#bd-write-btn"), tc(".cafe-menu")))
    pg.click(".lang-toggle")
    pg.wait_for_timeout(1200)
    fake.not_ready = True
    go()
    t("K3 서버에 010 이 없으면: 닫힘 안내 · 편지 고정 · 쓰기 버튼 없음", pg.is_visible("#cafe-closed") and not pg.is_visible("#bd-write-btn")
      and "인순이가 팬들에게" in txt("#bd-pins") and not pg.is_visible("#bd-who"), txt("#cafe-closed")[:40])
    fake.not_ready = False

    # ── N. 운영자 공지 ──────────────────────────────────────
    adm = fake.add_user("jake@test.local", "admin-pass", confirmed=True)
    fake.admins.add(adm)
    fake.members[adm] = {"nickname": "사랑방지기", "level": "member", "level_by": "admin"}
    pg.evaluate("localStorage.removeItem('insooni_member_session')")
    go("community.html#b=notice")
    t("N0 공지 게시판엔 일반 방문자에게 쓰기 버튼 없음", not pg.is_visible("#bd-write-btn"))
    pg.click("#bd-who button"); pg.wait_for_timeout(300)
    pg.fill("#bd-ie", "jake@test.local"); pg.fill("#bd-ip", "admin-pass")
    pg.click("#bd-sheet button[type=submit]"); pg.wait_for_timeout(1300)
    t("N1 운영자는 공지 게시판에 쓰기 버튼", pg.is_visible("#bd-write-btn"))
    pg.click("#bd-write-btn"); pg.wait_for_timeout(500)
    opts = pg.evaluate("[...document.querySelectorAll('#bd-boardsel option')].map(o => o.value)")
    t("N2 운영자 글쓰기엔 '공지'가 있고 미리 골라짐", opts[0] == "notice" and pg.input_value("#bd-boardsel") == "notice", opts)
    pg.fill("#bd-title", "사랑방 카페 이용 안내"); pg.fill("#bd-body", "서로 아껴 주세요.")
    pg.click("#bd-go"); pg.wait_for_timeout(1200)
    go("community.html#b=all")
    t("N3 전체글 맨 위에 공지 고정 · 목록에는 안 섞임", "사랑방 카페 이용 안내" in txt("#bd-pins")
      and "사랑방 카페 이용 안내" not in txt("#bd-list") and "운영자" in txt("#bd-pins"), txt("#bd-pins")[:80])
    pg.evaluate("localStorage.removeItem('insooni_member_session')")

    # ── L. 운영 화면 — 게시판 글·댓글 · 회원 탭 ─────────────
    sprout = fake.add_user("sprout@test.local", "x", confirmed=True)
    fake.members[sprout] = {"nickname": "새싹님", "level": "sprout", "level_by": "auto"}
    for i in range(3):
        fake.posts.append({"id": fake.nid(), "uid": sprout, "board": "free", "title": "새싹 글 %d" % i, "body": "본문",
                           "status": "approved" if i < 2 else "pending", "created_at": "2026-10-02T01:00:00Z"})
    pid = fake.posts[-1]["id"]
    for i in range(5):
        fake.comments.append({"id": fake.nid(), "post": fake.posts[-3]["id"], "uid": sprout, "body": "댓글%d" % i,
                              "status": "approved", "created_at": "2026-10-02T01:10:00Z"})
    ap = ctx.new_page()
    ap.set_default_timeout(6000)
    ap.on("pageerror", lambda e: errs.append(str(e)[:160]))
    ap.on("dialog", lambda d: d.accept())
    ap.goto(B + "admin.html", wait_until="load")
    ap.wait_for_timeout(500)
    ap.fill("#adm-email", "jake@test.local")
    ap.fill("#adm-pw", "admin-pass")
    ap.click("#adm-login-btn")
    ap.wait_for_timeout(1200)
    lst = ap.inner_text("#adm-list") if ap.locator("#adm-list").count() else ""
    t("L1 검수 목록에 게시판 글이 제목·등급과 함께", "게시판 글" in lst and "새싹 글 2" in lst and "새싹" in lst, lst[:160])
    t("L2 게시판 글에는 'AI 소견' 줄을 그리지 않음", "AI 소견" not in lst, lst[:160])
    tgt = next(p for p in fake.posts if p["id"] == pid)
    tgt["body"], tgt["edited_at"] = "운영자가 보지 못한 바꿔치기", "2026-10-02T05:00:00Z"
    ap.click("#adm-list .adm-item >> nth=0 >> text=올리기")
    ap.wait_for_timeout(1100)
    t("L2b 보는 사이 고쳐진 글은 올라가지 않고, 고친 내용을 다시 띄움", tgt["status"] == "pending"
      and "고쳤습니다" in ap.inner_text("#adm-msg") and "바꿔치기" in ap.inner_text("#adm-list"), ap.inner_text("#adm-msg"))
    ap.click("#adm-list .adm-item >> nth=0 >> text=올리기")
    ap.wait_for_timeout(900)
    t("L3 다시 본 뒤 올리기 → 기준을 채운 새싹이 정회원으로(알림 문구)", fake.members[sprout]["level"] == "member"
      and "정회원이 되었습니다" in ap.inner_text("#adm-toast"), ap.inner_text("#adm-toast"))
    ap.click(".adm-tab[data-status=members]")
    ap.wait_for_timeout(900)
    ml = ap.inner_text("#adm-list")
    t("L4 회원 탭: 별명·가입 방법·가린 이메일", "새싹님" in ml and "sp***@test.local" in ml and "sprout@test.local" not in ml, ml[:200])
    t("L5 운영자 계정에는 등급 단추가 없음", "사랑방지기" in ml and
      ap.locator("#adm-list .adm-item", has_text="사랑방지기").locator("button").count() == 0)
    ap.locator("#adm-list .adm-item", has_text="새싹님").locator("button", has_text="쉬게 하기").click()
    ap.wait_for_timeout(900)
    t("L6 '쉬게 하기'(확인 수락) → 서버 등급 blocked · 운영자 지정", fake.members[sprout]["level"] == "blocked"
      and fake.members[sprout]["level_by"] == "admin")
    ap.fill("#adm-q", "새싹")
    ap.click("#adm-search button")
    ap.wait_for_timeout(700)
    t("L7 별명으로 찾기", ap.locator("#adm-list .adm-item").count() == 1, ap.locator("#adm-list .adm-item").count())
    ap.close()

    # ── Y. 스위치가 꺼져 있으면(010 확인 전 배포 상태) ─────────
    off = mk(on=False)
    f_calls0 = len(fake.calls)
    op = off.new_page()
    op.on("pageerror", lambda e: errs.append(str(e)[:160]))
    op.goto(B + "community.html", wait_until="load")
    op.wait_for_timeout(1500)
    asked = [c for c in fake.calls[f_calls0:] if c[0].startswith(("auth:", "member_", "board_", "comment_", "cafe_"))]
    t("Y1 스위치가 꺼져 있으면 카페 틀·닫힘 안내·편지만 보이고 서버에 묻지 않음", op.is_visible("#board") and op.is_visible("#cafe-closed")
      and "인순이가 팬들에게" in op.inner_text("#bd-pins") and not op.is_visible("#bd-write-btn") and not asked, asked[:3])
    op.click(".cafe-menu a[data-b=letters]"); op.wait_for_timeout(500)
    op.click("#bd-list .cafe-row >> nth=1 >> a"); op.wait_for_timeout(600)
    t("Y2 스위치가 꺼져 있어도 '인순이의 편지'는 읽힘", len(op.inner_text("#cafe-post .letter-body")) > 10)
    off.close()

    t("Z1 JS 오류 0", not errs, errs[:3])
    t("Z2 가짜 서버가 못 받은 요청 0(운영 DB·외부로 새는 것 없음)", not fake.unhandled, fake.unhandled[:4])
    ctx.close()
    return R


def broken(R):
    return [r for r in R if not r[1]]


if __name__ == "__main__":
    with sync_playwright() as p:
        br = p.chromium.launch()
        R = []
        try:
            suite(br, R=R)
        except Exception as e:
            import traceback
            fr = [f for f in traceback.extract_tb(e.__traceback__) if f.name == "suite"]
            R.append(("흐름이 멈춤(줄 %s)" % (fr[-1].lineno if fr else "?"), False, str(e).splitlines()[0][:150]))
        for n, ok, info in R:
            print(("  ✓ " if ok else "  ✗ ") + n + ("" if ok else "   ← " + info))
        fail = len(broken(R))
        print("\n본 검사: %d/%d 통과" % (len(R) - fail, len(R)))
        caught, MUT = 0, []
        if "--quick" not in sys.argv:
            MUT = [
                ("팬 글을 innerHTML 로", "    if (text !== undefined && text !== null) n.textContent = text;",
                 "    if (text !== undefined && text !== null) n.innerHTML = text;"),
                ("쓰던 글을 저장하지 않음", "  function draftSave() {\n", "  function draftSave() { return;\n"),
                ("주소창에 코드를 남김", '      try { history.replaceState(null, "", location.pathname + "#board"); } catch (e) {}\n', ""),
                ("닫힌 카페가 서버에 물음", "  function live() { return S.open && S.ready; }", "  function live() { return true; }"),
                ("공지를 맨 위에 안 그림", "        (r.notices || []).forEach(function (n) { pins.appendChild(row(n, true)); });\n", ""),
                ("뒤로 가기가 카페 안에서 안 통함", '      window.addEventListener("hashchange", function () { if (sec && document.body.contains(sec)) route(); });\n', ""),
                ("로그인 뒤 하던 일을 잊음", "  function continueNext() {\n", "  function continueNext() { return;\n"),
                ("실패해도 쓴 글을 비움", "      if (!res || !res.ok) { handleWriteFail(res, msg); return; }   /* 실패하면 쓴 글을 그대로 둔다 */",
                 "      if (!res || !res.ok) { ti.value = \"\"; bo.value = \"\"; handleWriteFail(res, msg); return; }"),
                ("Esc 로 안 닫힘", '      if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet();', '      if (false) closeSheet();'),
                ("PKCE 대신 검증값을 그대로 보냄", '      return { c: b64url(new Uint8Array(d)), m: "s256", v: v, p: purpose };', '      return { c: v, m: "s256", v: v, p: purpose };'),
                ("남의 해시 링크로 세션을 바꿈", "        if (getS()) return Promise.resolve(null);\n", ""),
                ("쓰던 댓글을 다시 그릴 때 잃음", '      ta.value = S.cdraft[p.id] || "";', '      ta.value = "";'),
                ("로그아웃해도 초안을 남김", "  function forgetDevice() {\n", "  function forgetDevice() { return;\n"),
                ("token_hash 링크를 못 받음", "      if (th) {\n", "      if (false) {\n"),
                ("만료된 세션을 붙들고 있음", "        if (r.status === 401 && at) { clearS(); return { ok: false, reason: \"expired\" }; }",
                 "        if (r.status === 401 && at) { return { ok: false, reason: \"expired\" }; }"),
            ]
            for name, a, b in MUT:
                if BOARD_SRC.count(a) != 1:
                    print("  ? 뮤테이션 적용 실패: " + name)
                    continue
                try:
                    bad = broken(suite(br, BOARD_SRC.replace(a, b)))
                except Exception as e:   # 고장 때문에 사용 흐름이 멈췄다 — 잡은 것이다
                    bad = [("흐름이 멈춤: " + str(e).splitlines()[0][:70], False, "")]
                caught += bool(bad)
                print("  %s — %s%s" % ("잡음" if bad else "★못 잡음", name, ("  (" + bad[0][0] + ")") if bad else ""))
            print("뮤테이션: %d/%d 잡음" % (caught, len(MUT)))
        br.close()
    sys.exit(1 if fail or caught != len(MUT) else 0)
