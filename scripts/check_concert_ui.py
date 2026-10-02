# 실행: 사이트 루트를 http://127.0.0.1:8908 로 띄운 뒤 playwright 파이썬으로
#       `python scripts/check_concert_ui.py`            (전부 + 뮤테이션)
#       `python scripts/check_concert_ui.py --quick`    (뮤테이션 건너뜀)
#       `python scripts/check_concert_ui.py L A`        (묶음만 — L 공연 화면 · A 운영 화면)
#       `python scripts/check_concert_ui.py L10 L11`    (시나리오만 — L1~L12 · LX · A1 · L11 은 A 묶음)
# 공연 모드(live.html · gig.js · 운영 화면 공연 탭 · qr.js) — 설계서 합격 기준 L1~L12 · A1 · C7/C8/C17/C18(공연 화면 몫)을
# 실제 브라우저로 사람처럼 끝까지 눌러 본다. Supabase 로 가는 요청은 전부 가짜 서버(GigFake — 011 함수를 흉내)가 받는다.
# 운영 DB·카카오·메일로 새는 것이 없다. 가짜 서버가 처리하지 못한 요청이 하나라도 있으면 실패다.
# '0건이면 통과' 검사(대비·넘침·채운 단추)는 잰 요소 수를 함께 단언한다 — 0 은 성공처럼 생겼다(메모리 contrast-audit-traps).
# 마지막에 gig.js · qr.js 를 일부러 망가뜨린 사본으로 해당 시나리오를 다시 돌려, 검사가 잡는지 본다(뮤테이션).
# 로컬 http.server 는 /live 를 모른다(라이브는 Cloudflare 가 /live → live.html). 그래서 /live 요청은 live.html 로 답한다.
import gzip, json, re, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import check_board_ui as M      # 가짜 Supabase(인증·게시판) — __main__ 가드라 import 해도 돌지 않는다
import check_cafe_v4 as V       # 화면 측정 JS(채운 단추·한글 모노·대비) — 같은 기준을 쓴다

B = M.B
SUPA = M.SUPA
UTC = timezone.utc
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
QUICK = "--quick" in sys.argv
GROUPS = {a[0] for a in ARGS} or {"L", "A"}
ONLY = {a for a in ARGS if len(a) > 1} or None     # 'L10 A1' 처럼 시나리오만 골라 돌릴 때
LIVE_RE = re.compile(r"^http://127\.0\.0\.1:8908/live(\?[^#]*)?$")
R = []
BOARD_SRC = None     # 뮤테이션 때 board.min.js 를 바꿔 끼운다(회원 창의 공연 문맥 규칙은 board.js 에 있다)

PHRASES = [(1, "사랑해요", "We love you"), (2, "앵콜!", "Encore!"), (3, "오늘 정말 멋졌어요", "You were amazing tonight"),
           (4, "건강하세요", "Stay well"), (5, "오래오래 노래해 주세요", "Keep singing for us"), (6, "또 올게요", "I'll be back")]
SONGS = ["거위의 꿈", "밤이면 밤마다", "친구여", "아버지"]


def t(name, ok, info=""):
    R.append((name, bool(ok), str(info)[:260]))
    print(("  ✓ " if ok else "  ✗ ") + name + ("" if ok else "   ← " + str(info)[:260]), flush=True)


def iso(dt):
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (dt.microsecond // 1000)


def live_html():
    return (ROOT / "live.html").read_text(encoding="utf-8")


# ═══ 가짜 서버 — supabase/011 의 공연 함수 ═══════════════════════════════
class GigFake(M.Fake):
    """M.Fake(010 회원·게시판) 위에 011 공연 함수를 얹는다. 규칙은 011 과 같게(문지기 순서·단계·0 포함 합계)."""

    def __init__(self, now=None):
        super().__init__()
        self.now = now or datetime(2026, 10, 18, 10, 30, tzinfo=UTC)      # 19:30 KST — 공연 중
        self.events = []
        self.vsongs = {}       # event id -> [song, …] (운영자 순서)
        self.checkins = {}     # (eid, uid) -> iso
        self.cheers = set()    # (eid, uid, k)
        self.votes = {}        # (eid, uid) -> song
        self.poll_s = 15
        self.tick = 0
        self.http_fail = {}    # rpc 이름 -> 남은 500 응답 수
        self.stale_next = None  # 다음 gig_pulse 하나를 '더 이른 시각의 옛 숫자'로
        self.eseq = 0

    def clock(self):
        """서버 시각 — 응답마다 1ms 씩 늘어난다(더 늦게 센 값이 무엇인지 화면이 가릴 수 있게)."""
        self.tick += 1
        return self.now + timedelta(milliseconds=self.tick)

    def add_event(self, code="K7Q2M", title="인순이 콘서트 〈거위의 꿈〉 부산", venue="부산 KBS홀", starts=None,
                  status="published", songs=tuple(SONGS), override=None, vote_open=True,
                  title_en="Insooni in Concert — Busan", venue_en="KBS Hall Busan", opens=None, closes=None, guest=None):
        starts = starts or datetime(2026, 10, 18, 10, 0, tzinfo=UTC)       # 19:00 KST
        opens = opens or starts - timedelta(hours=2)
        closes = closes or starts + timedelta(hours=4)
        guest = guest or closes + timedelta(hours=72)
        self.eseq += 1
        e = {"id": self.eseq, "code": code, "title_ko": title, "title_en": title_en, "venue_ko": venue, "venue_en": venue_en,
             "starts_at": starts, "opens_at": opens, "closes_at": closes, "guest_until": guest,
             "status": status, "override": override, "vote_open": vote_open}
        self.events.append(e)
        self.vsongs[e["id"]] = list(songs)
        return e

    def phase(self, e):
        n = self.now
        if e["override"] == "closed":
            return "after" if n <= e["guest_until"] else "closed"
        if e["override"] == "open":
            return "open"
        if n < e["opens_at"]:
            return "before"
        if n <= e["closes_at"]:
            return "open"
        if n <= e["guest_until"]:
            return "after"
        return "closed"

    def find(self, code, uid):
        adm = uid in self.admins
        c = (code or "").strip().upper()
        if not c:
            cands = [e for e in self.events if e["status"] == "published" and self.phase(e) == "open"]
            cands.sort(key=lambda e: abs((e["starts_at"] - self.now).total_seconds()))
            return cands[0] if cands else None
        for e in self.events:
            if e["code"] == c and (e["status"] == "published" or (adm and e["status"] == "draft")):
                return e
        return None

    def tally(self, e):
        eid = e["id"]
        return {"checkins": sum(1 for (a, _u) in self.checkins if a == eid),
                "cheers": [{"k": k, "n": sum(1 for (a, _u, kk) in self.cheers if a == eid and kk == k)} for k, _, _ in PHRASES],
                "votes": [{"song": s, "n": sum(1 for (a, _u), ss in self.votes.items() if a == eid and ss == s)} for s in self.vsongs[eid]],
                "at": iso(self.clock())}

    def ev_json(self, e):
        d = {k: (iso(e[k]) if isinstance(e[k], datetime) else e[k])
             for k in ("code", "title_ko", "title_en", "venue_ko", "venue_en", "starts_at", "opens_at", "closes_at", "guest_until", "vote_open")}
        d["phase"] = self.phase(e)
        d["preview"] = e["status"] == "draft"
        return d

    def gate(self, uid):
        if not uid:
            return {"ok": False, "reason": "not_logged_in"}
        m = self.members.get(uid)
        if not m:
            return {"ok": False, "reason": "not_member"}
        if m["level"] == "blocked":
            return {"ok": False, "reason": "blocked"}
        return None

    def gbrow(self, p, uid):
        m = self.members[p["uid"]]
        return {"id": p["id"], "body": p["body"][:300], "nickname": m["nickname"], "level": m["level"],
                "staff": p["uid"] in self.admins, "created_at": p["created_at"], "mine": p["uid"] == uid, "status": p["status"]}

    # ── 누구나 ──
    def rpc_gig_event(self, uid, b):
        e = self.find(b.get("p_code"), uid)
        if not e:
            return {"ok": False, "reason": "not_found"}
        me = None
        if uid:
            m = self.members.get(uid)
            if not m:
                me = {"joined": False, "level": None, "staff": uid in self.admins, "checked": False, "checked_at": None,
                      "cheers": [], "vote": None, "posted": 0}
            else:
                ca = self.checkins.get((e["id"], uid))
                me = {"joined": True, "level": m["level"], "staff": uid in self.admins, "checked": ca is not None, "checked_at": ca,
                      "cheers": sorted(k for (a, u, k) in self.cheers if a == e["id"] and u == uid),
                      "vote": self.votes.get((e["id"], uid)),
                      "posted": sum(1 for p in self.posts if p.get("gig_id") == e["id"] and p["uid"] == uid)}
        return {"ok": True, "now": iso(self.clock()), "poll_s": max(5, self.poll_s), "event": self.ev_json(e),
                "phrases": [{"k": k, "ko": ko, "en": en} for k, ko, en in PHRASES],
                "songs": [{"song": s, "sort": i + 1} for i, s in enumerate(self.vsongs[e["id"]])],
                "counts": self.tally(e), "me": me}

    def rpc_gig_pulse(self, uid, b):
        e = self.find(b.get("p_code"), uid)
        if not e:
            return {"ok": False, "reason": "not_found"}
        tl = self.tally(e)
        rows = [p for p in sorted(self.posts, key=lambda p: -p["id"]) if p.get("gig_id") == e["id"] and p["status"] == "approved"]
        latest = [{k: v for k, v in self.gbrow(p, None).items() if k not in ("mine", "status")} for p in rows[:5]]
        r = {"ok": True, "now": tl["at"], "phase": self.phase(e), "vote_open": e["vote_open"], "checkins": tl["checkins"],
             "cheers": tl["cheers"], "votes": tl["votes"], "guest": {"approved": len(rows), "latest": latest}, "at": tl["at"]}
        if self.stale_next:
            r.update(self.stale_next)
            self.stale_next = None
        return r

    def rpc_gig_now(self, uid, b):
        cands = [e for e in self.events if e["status"] == "published" and self.phase(e) in ("open", "after")]
        cands.sort(key=lambda e: abs((e["starts_at"] - self.now).total_seconds()))
        if not cands:
            return {"ok": True, "event": None}
        e = cands[0]
        d = {k: v for k, v in self.ev_json(e).items() if k in ("code", "title_ko", "title_en", "venue_ko", "venue_en", "starts_at", "phase")}
        d["checkins"] = self.tally(e)["checkins"]
        return {"ok": True, "event": d}

    def rpc_gig_guestbook(self, uid, b):
        e = self.find(b.get("p_code"), uid)
        if not e:
            return {"ok": False, "reason": "not_found"}
        lim = max(1, min(30, b.get("p_limit") or 20))
        rows = [p for p in sorted(self.posts, key=lambda p: -p["id"]) if p.get("gig_id") == e["id"]
                and (p["status"] == "approved" or (p["status"] == "pending" and p["uid"] == uid))
                and (b.get("p_before") is None or p["id"] < b["p_before"])]
        return {"ok": True, "rows": [self.gbrow(p, uid) for p in rows[:lim]], "more": len(rows) > lim}

    def rpc_post_gigs(self, uid, b):
        ids = b.get("p_ids") or []
        if len(ids) > 50:
            return {"ok": False, "reason": "too_many"}
        mp = {}
        for p in self.posts:
            if p["id"] in ids and p["status"] == "approved" and p.get("gig_id"):
                e = next(x for x in self.events if x["id"] == p["gig_id"])
                if e["status"] != "draft":
                    mp[str(p["id"])] = {k: v for k, v in self.ev_json(e).items() if k in ("code", "title_ko", "title_en", "venue_ko", "venue_en", "starts_at")}
        return {"ok": True, "map": mp}

    # ── 로그인한 회원 ──
    def _ev_open(self, uid, b, kind="open"):
        err = self.gate(uid)
        if err:
            return None, err
        e = self.find(b.get("p_code"), uid)
        if not e:
            return None, {"ok": False, "reason": "not_found"}
        ph = self.phase(e)
        if (kind == "open" and ph != "open") or (kind == "gb" and ph not in ("open", "after")):
            return None, {"ok": False, "reason": "not_open"}
        return e, None

    def rpc_gig_checkin(self, uid, b):
        e, err = self._ev_open(uid, b)
        if err:
            return err
        key = (e["id"], uid)
        already = key in self.checkins
        if not already:
            self.checkins[key] = iso(self.clock())
        return {"ok": True, "already": already, "at": self.checkins[key], "checkins": self.tally(e)["checkins"]}

    def rpc_gig_cheer(self, uid, b):
        e, err = self._ev_open(uid, b)
        if err:
            return err
        k = b.get("p_k")
        if k not in [x[0] for x in PHRASES]:
            return {"ok": False, "reason": "bad_phrase"}
        key = (e["id"], uid, k)
        if b.get("p_on"):
            self.cheers.add(key)
        else:
            self.cheers.discard(key)
        return {"ok": True, "k": k, "on": bool(b.get("p_on")), "n": sum(1 for (a, _u, kk) in self.cheers if a == e["id"] and kk == k),
                "at": iso(self.clock())}

    def rpc_gig_vote(self, uid, b):
        e, err = self._ev_open(uid, b)
        if err:
            return err
        if not e["vote_open"]:
            return {"ok": False, "reason": "vote_closed"}
        song = b.get("p_song")
        if song is not None and song not in self.vsongs[e["id"]]:
            return {"ok": False, "reason": "bad_song"}
        prev = self.votes.get((e["id"], uid))
        if song is None:
            self.votes.pop((e["id"], uid), None)
        else:
            self.votes[(e["id"], uid)] = song

        def n(s):
            return sum(1 for (a, _u), ss in self.votes.items() if a == e["id"] and ss == s)
        return {"ok": True, "song": song, "n": n(song) if song else None, "prev": prev, "prev_n": n(prev) if prev else None,
                "at": iso(self.clock())}

    def rpc_gig_guestbook_write(self, uid, b):
        e, err = self._ev_open(uid, b, "gb")
        if err:
            return err
        body = (b.get("p_body") or "").strip()
        if len(body) < 2:
            return {"ok": False, "reason": "empty"}
        if len(body) > 500:
            return {"ok": False, "reason": "too_long"}
        if sum(1 for p in self.posts if p.get("gig_id") == e["id"] and p["uid"] == uid) >= 3:
            return {"ok": False, "reason": "gig_limit"}
        flat = re.sub(r"\s+", " ", body)
        title = flat[:40].rstrip() + "…" if len(flat) > 40 else flat
        r = self.rpc_board_write(uid, {"p_board": "review", "p_title": title, "p_body": body})
        if r.get("ok"):
            for p in self.posts:
                if p["id"] == r["id"]:
                    p["gig_id"] = e["id"]
        return r

    def rpc_gig_my_stamps(self, uid, b):
        err = self.gate(uid)
        if err:
            return err
        rows = []
        for (eid, u), at in self.checkins.items():
            if u == uid:
                e = next(x for x in self.events if x["id"] == eid)
                d = {k: v for k, v in self.ev_json(e).items() if k in ("code", "title_ko", "title_en", "venue_ko", "venue_en", "starts_at")}
                d["at"] = at
                rows.append(d)
        rows.sort(key=lambda x: x["starts_at"], reverse=True)
        return {"ok": True, "rows": rows}

    def rpc_member_leave(self, uid, b):
        r = super().rpc_member_leave(uid, b)
        if r.get("ok"):     # 011: members 행이 지워지면 도장·응원·투표도 cascade
            self.checkins = {k: v for k, v in self.checkins.items() if k[1] != uid}
            self.cheers = {k for k in self.cheers if k[1] != uid}
            self.votes = {k: v for k, v in self.votes.items() if k[1] != uid}
        return r

    # ── 운영 ──
    def rpc_admin_gig_list(self, uid, b):
        if uid not in self.admins:
            return {"ok": False, "reason": "forbidden"}
        rows = []
        for e in sorted(self.events, key=lambda e: e["starts_at"], reverse=True):
            d = self.ev_json(e)
            tl = self.tally(e)
            d.update({"id": e["id"], "status": e["status"], "override": e["override"], "songs": list(self.vsongs[e["id"]]),
                      "checkins": tl["checkins"], "cheers": sum(x["n"] for x in tl["cheers"]), "votes": sum(x["n"] for x in tl["votes"]),
                      "gb_pending": sum(1 for p in self.posts if p.get("gig_id") == e["id"] and p["status"] == "pending"),
                      "gb_approved": sum(1 for p in self.posts if p.get("gig_id") == e["id"] and p["status"] == "approved")})
            d.pop("preview", None)
            rows.append(d)
        return {"ok": True, "rows": rows}

    def rpc_admin_gig_save(self, uid, b):
        if uid not in self.admins:
            return {"ok": False, "reason": "forbidden"}
        p = b.get("p") or {}
        tk = (p.get("title_ko") or "").strip()
        if not (2 <= len(tk) <= 60):
            return {"ok": False, "reason": "bad_title"}
        try:
            ts = {k: datetime.fromisoformat(p[k]) for k in ("starts_at", "opens_at", "closes_at", "guest_until")}
        except Exception:
            return {"ok": False, "reason": "bad_time"}
        if not (ts["opens_at"] < ts["closes_at"] <= ts["guest_until"]):
            return {"ok": False, "reason": "bad_time"}
        songs = p.get("songs")
        if songs is not None and len(songs) > 8:
            return {"ok": False, "reason": "too_many_songs"}
        if p.get("id"):
            e = next((x for x in self.events if x["id"] == p["id"]), None)
            if not e:
                return {"ok": False, "reason": "not_found"}
            if p.get("regen_code") and e["status"] != "draft":
                return {"ok": False, "reason": "code_locked"}
        else:
            alpha = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
            code = "".join(alpha[(self.eseq * 7 + i * 13) % 31] for i in range(5))
            e = self.add_event(code=code, title=tk, songs=())
        e.update({"title_ko": tk, "title_en": (p.get("title_en") or "").strip() or None, "venue_ko": (p.get("venue_ko") or "").strip() or None,
                  "venue_en": (p.get("venue_en") or "").strip() or None, "status": p.get("status") or e["status"]})
        e.update({"starts_at": ts["starts_at"], "opens_at": ts["opens_at"], "closes_at": ts["closes_at"], "guest_until": ts["guest_until"]})
        if songs is not None:
            gone = [s for s in self.vsongs[e["id"]] if s not in songs]
            self.votes = {k: v for k, v in self.votes.items() if not (k[0] == e["id"] and v in gone)}
            self.vsongs[e["id"]] = list(songs)
        if p.get("regen_code"):
            e["code"] = "".join(reversed(e["code"]))
        return {"ok": True, "id": e["id"], "code": e["code"]}

    def rpc_admin_gig_set(self, uid, b):
        if uid not in self.admins:
            return {"ok": False, "reason": "forbidden"}
        ov = (b.get("p_override") or "").strip() or None
        if ov not in (None, "open", "closed"):
            return {"ok": False, "reason": "bad_override"}
        e = next((x for x in self.events if x["id"] == b.get("p_id")), None)
        if not e:
            return {"ok": False, "reason": "not_found"}
        e["override"] = ov
        if b.get("p_vote_open") is not None:
            e["vote_open"] = bool(b["p_vote_open"])
        return {"ok": True, "phase": self.phase(e), "vote_open": e["vote_open"]}

    def handle(self, route):
        u = urlparse(route.request.url)
        if u.path.startswith("/rest/v1/rpc/"):
            name = u.path.rsplit("/", 1)[1]
            if self.http_fail.get(name, 0) > 0:
                self.http_fail[name] -= 1
                self.calls.append((name, "500"))
                return route.fulfill(status=500, content_type="application/json", body='{"message":"boom"}')
        if u.path == "/auth/v1/authorize":
            # 카카오 왕복 — M.Fake 는 302 로 돌려보내는데, 브라우저가 따라가는 302 는 가로채기(route)를 거치지 않는다.
            # 로컬 서버는 /live 를 모르므로(라이브는 Cloudflare 가 live.html 로) 302 를 '새 이동'으로 바꿔 가로채기를 타게 한다
            box = {}

            class Cap:
                request = route.request

                def fulfill(self, **kw):
                    box.update(kw)

                def abort(self, *a, **k):
                    box["abort"] = True
            super().handle(Cap())
            loc = (box.get("headers") or {}).get("Location")
            if box.get("status") == 302 and loc:
                return route.fulfill(status=200, content_type="text/html; charset=utf-8",
                                     body="<!doctype html><script>location.replace(%s)</script>" % json.dumps(loc))
            return route.abort()
        return super().handle(route)


def seed(f, open_event=True):
    """운영자 1 · 정회원 2 · 새싹 1 · 쉬는 중 1 · 카카오(가입 전) 1, 공개 공연 K7Q2M(지금 열림)."""
    adm = f.add_user("op@test.local", "op-pass", confirmed=True)
    f.admins.add(adm)
    f.members[adm] = {"nickname": "사랑방지기", "level": "member", "level_by": "admin"}
    who = {"adm": adm}
    for key, nick, lv in [("mem", "홍천팬", "member"), ("mem2", "부산 갈매기", "member"), ("sprout", "대전 아줌마", "sprout"),
                          ("blocked", "잠시쉼", "blocked")]:
        u = f.add_user(key + "@test.local", "pw", confirmed=True)
        f.members[u] = {"nickname": nick, "level": lv, "level_by": "auto"}
        who[key] = u
    who["kakao"] = f.add_user(None, None, "kakao", {"nickname": "카카오별명"}, True)
    if open_event:
        e = f.add_event()
        who["ev"] = e
    return who


def fill_counts(f, e, checkins=0, cheers=None, votes=None):
    """다른 관객의 숫자 — 명부에 없는 가짜 회원 번호로 채운다(합계만 보이므로 충분하다)."""
    for i in range(checkins):
        f.checkins[(e["id"], "x-%d" % i)] = iso(f.now - timedelta(minutes=30))
    for k, n in (cheers or {}).items():
        for i in range(n):
            f.cheers.add((e["id"], "x-%d" % i, k))
    for s, n in (votes or {}).items():
        for i in range(n):
            f.votes[(e["id"], "v-%s-%d" % (s, i))] = s


def sess(f, uid):
    s = f.session(uid)
    return {"at": s["access_token"], "rt": s["refresh_token"], "exp": int(time.time() * 1000) + 3600e3}


def ctx_of(br, f, w=375, h=812, conf="{board: true, kakao: true, live: true}", fs=17, session=None, lang=None,
           reduced=False, hold=None, gig_src=None, qr_src=None, admin_session=None, init_extra=""):
    mobile = w < 768
    c = br.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, locale="ko-KR",
                       device_scale_factor=1, reduced_motion="reduce" if reduced else "no-preference")
    init = ("window.INSOONI_CONFIG = %s;" % conf) if conf is not None else ""
    init += "try{localStorage.setItem('insooni_fs', '%d');sessionStorage.setItem('insooni_intro','1')}catch(e){}" % {17: 0, 19: 1, 21: 2}[fs]
    if lang:
        init += "try{localStorage.setItem('insooni_lang', JSON.stringify('%s'))}catch(e){}" % lang
    if session:
        init += "try{if(!localStorage.getItem('insooni_member_session'))localStorage.setItem('insooni_member_session', %s)}catch(e){}" % json.dumps(json.dumps(session))
    if admin_session:
        init += "try{sessionStorage.setItem('insooni_admin_session', %s)}catch(e){}" % json.dumps(json.dumps(admin_session))
    init += init_extra
    c.add_init_script(init)
    calls, held = [], []

    def supa(route):
        calls.append(route.request.url)
        if hold and ("/rpc/" + hold) in route.request.url:
            held.append(route)       # 답하지 않는다 — '불러오는 중' 장면
            return
        return f.handle(route)
    c.route(re.compile(r"https://%s/.*" % re.escape(SUPA)), supa)
    c.route(re.compile(r"https://(?!%s).*" % re.escape(SUPA)), lambda r: r.abort())
    c.route(LIVE_RE, lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8", body=live_html()))
    if gig_src is not None:
        c.route(re.compile(r".*/assets/js/gig\.min\.js.*"), lambda r: r.fulfill(status=200, content_type="text/javascript", body=gig_src))
    if BOARD_SRC is not None:
        c.route(re.compile(r".*/assets/js/board\.min\.js.*"), lambda r: r.fulfill(status=200, content_type="text/javascript", body=BOARD_SRC))
    if qr_src is not None:
        c.route(re.compile(r".*/assets/js/qr\.min\.js.*"), lambda r: r.fulfill(status=200, content_type="text/javascript", body=qr_src))
    c.calls = calls
    c.held = held
    return c


def fresh(pg, url, wait=1300):
    pg.goto("about:blank")
    pg.goto(B + url, wait_until="load")
    pg.wait_for_timeout(wait)


def rpc_calls(c, name):
    return [u for u in c.calls if ("/rpc/" + name) in u]


GIG = """() => { const g = window.INSOONI_GIG && INSOONI_GIG.state(); const bar = document.getElementById('gig-bar');
  const go = document.getElementById('gig-go'); const vis = (e) => !!e && e.checkVisibility({checkVisibilityCSS: true});
  return {L: g && g.L, phase: (document.getElementById('gig-phase') || {}).textContent || '',
          title: (document.getElementById('gig-title') || {}).textContent || '',
          bar: vis(bar) && vis(go) ? go.textContent : null, stamp: vis(document.getElementById('gig-stamp')),
          code: vis(document.getElementById('gig-code')), preview: vis(document.getElementById('gig-preview')),
          n: (document.getElementById('gig-n') || {}).textContent, msg: (document.getElementById('gig-msg') || {}).textContent || '',
          over: document.documentElement.scrollWidth - innerWidth, hm: document.querySelectorAll('.gig-head .hm:not([hidden])').length}; }"""


# ═══ 상태표 — 설계서 §6.4 ═══════════════════════════════════════════
STATE_TEXT = {
    "L0": ("공연 정보를 불러오고 있습니다", None),
    "L1": ("공연 화면은 곧 열립니다.", None),
    "L2": ("공연장 QR 아래에 적힌 코드를 넣어 주세요.", None),
    "L3": ("이 공연을 찾지 못했습니다. QR 아래 다섯 글자를 다시 확인해 주세요.", None),
    "L4": ("도장은 10월 18일 오후 4시 30분부터 찍을 수 있습니다.", None),
    # 도장이 무엇을 남기는지 함께 말한다(검토 43번)
    "L5": ("지금 도장을 찍을 수 있습니다. 찍으면 오늘 다녀온 공연이 내 정보에 기록으로 남습니다.", "도장 찍기"),
    "L6": ("지금 도장을 찍을 수 있습니다. 찍으면 오늘 다녀온 공연이 내 정보에 기록으로 남습니다.", "가입 마치고 도장 찍기"),
    "L7": ("지금 도장을 찍을 수 있습니다. 찍으면 오늘 다녀온 공연이 내 정보에 기록으로 남습니다.", "도장 찍기"),
    # 도장 뒤 주 단추는 한 번 누르면 끝나는 응원부터(검토 36번) — 응원·투표를 한 번 하면 '방명록 남기기'
    "L8": ("이미 도장을 찍으셨습니다 (19:00).", "응원 보내기"),
    "L9": ("도장 찍기는 끝났습니다. 방명록은 10월 21일까지 남길 수 있습니다.", "방명록 남기기"),
    "L10": ("이 공연은 끝났습니다. 함께해 주셔서 고맙습니다.", None),
    "L11": ("지금은 도장·응원·방명록을 쓸 수 없습니다. 운영자에게 문의해 주세요.", None),
    "L12": ("지금 도장을 찍을 수 있습니다. 찍으면 오늘 다녀온 공연이 내 정보에 기록으로 남습니다.", "도장 찍기"),
}


def setup(state):
    """상태 하나를 만드는 가짜 서버·세션·주소·스위치. 반환: (fake, uid|None, url, conf, hold)"""
    on = "{board: true, kakao: true, live: true}"
    if state == "L4":
        # 공연 18:30 KST → 도장 16:30 KST 부터. 지금 15:00 KST
        f = GigFake(now=datetime(2026, 10, 18, 6, 0, tzinfo=UTC))
        w = seed(f, open_event=False)
        f.add_event(starts=datetime(2026, 10, 18, 9, 30, tzinfo=UTC))
        return f, w["mem"], "live?e=K7Q2M", on, None
    if state == "L9":
        f = GigFake(now=datetime(2026, 10, 18, 15, 0, tzinfo=UTC))       # 닫힘(23:00 KST) 한 시간 뒤
        w = seed(f)
        fill_counts(f, w["ev"], 120, {1: 40}, {"거위의 꿈": 30})
        return f, w["mem"], "live?e=K7Q2M", on, None
    if state == "L10":
        f = GigFake(now=datetime(2026, 10, 25, 0, 0, tzinfo=UTC))
        w = seed(f)
        fill_counts(f, w["ev"], 120, {1: 40}, {"거위의 꿈": 30})
        return f, None, "live?e=K7Q2M", on, None
    f = GigFake()
    w = seed(f, open_event=state not in ("L2", "L12"))
    if state == "L12":
        f.add_event(status="draft")
        return f, w["adm"], "live?e=K7Q2M", on, None
    if "ev" in w:
        fill_counts(f, w["ev"], 312, {1: 128, 2: 96, 3: 40}, {"거위의 꿈": 58, "밤이면 밤마다": 21})
    if state == "L0":
        return f, None, "live?e=K7Q2M", on, "gig_event"
    if state == "L1":
        return f, None, "live?e=K7Q2M", "{board: true, kakao: true}", None
    if state == "L2":
        return f, None, "live", on, None
    if state == "L3":
        return f, None, "live?e=ZZZZZ", on, None
    if state == "L5":
        return f, None, "live?e=K7Q2M", on, None
    if state == "L6":
        return f, w["kakao"], "live?e=K7Q2M", on, None
    if state == "L7":
        return f, w["mem"], "live?e=K7Q2M", on, None
    if state == "L8":
        f.checkins[(w["ev"]["id"], w["mem"])] = "2026-10-18T10:00:00.000Z"
        return f, w["mem"], "live?e=K7Q2M", on, None
    if state == "L11":
        return f, w["blocked"], "live?e=K7Q2M", on, None
    raise ValueError(state)


# ═══ L — 공연 화면 ═══════════════════════════════════════════════
def group_l(br, gig_src=None, only=None):
    """only: 뮤테이션 때 돌릴 시나리오 이름 목록(없으면 전부). 반환값 없음 — R 에 쌓는다."""
    def want(k):
        return only is None or k in only

    if want("L1"):
        print("── L1 스위치 꺼짐")
        f = GigFake(); w = seed(f)
        for who in (None, w["mem"]):
            c = ctx_of(br, f, conf="{board: true, kakao: true}", session=sess(f, who) if who else None, gig_src=gig_src)
            pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
            d = pg.evaluate(GIG)
            t("L1 live 꺼짐(%s) → '공연 화면은 곧 열립니다.' · supabase 요청 0 · 헤더 입구 없음" % ("로그인" if who else "로그아웃"),
              d["phase"] == "공연 화면은 곧 열립니다." and not c.calls and d["hm"] == 0, (d["phase"], c.calls[:2], d["hm"]))
            c.close()

    if want("L2"):
        print("── L2 상태표 L0~L12 × 폭 × 글자")
        bad, seen, filled_bad, mono_bad, mono_seen, over_bad = [], 0, [], [], 0, []
        for state in ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9", "L10", "L11", "L12"]:
            for (wd, ht) in ((375, 812), (1280, 860), (320, 640)):
                for fs in (17, 21):
                    if wd == 320 and fs == 17:
                        continue
                    f, uid, url, conf, hold = setup(state)
                    c = ctx_of(br, f, wd, ht, conf=conf, fs=fs, session=sess(f, uid) if uid else None, hold=hold, gig_src=gig_src)
                    pg = c.new_page(); E = V.errs_of(pg)
                    fresh(pg, url, 1500)
                    d = pg.evaluate(GIG)
                    want_p, want_b = STATE_TEXT[state]
                    ok = d["phase"] == want_p and d["bar"] == want_b
                    if state == "L8":
                        ok = ok and d["stamp"]
                    if state in ("L2", "L3"):
                        ok = ok and d["code"]
                    if state == "L12":
                        ok = ok and d["preview"]
                    if state not in ("L0", "L1", "L2", "L3") and wd == 375 and fs == 17:
                        ok = ok and d["hm"] == 1
                    if E:
                        ok = False
                    seen += 1
                    if not ok:
                        bad.append((state, wd, fs, d["phase"][:30], d["bar"], d["stamp"], E[:1]))
                    if d["over"] != 0:
                        over_bad.append((state, wd, fs, d["over"]))
                    if state in ("L4", "L5", "L6", "L7", "L8", "L9", "L10") and wd != 320:
                        for y in (0, 900, 2000, 99999):
                            pg.evaluate("scrollTo(0, %d)" % y); pg.wait_for_timeout(120)
                            fl = pg.evaluate(V.FILLED_JS)
                            if len(fl) > 1:
                                filled_bad.append((state, wd, fs, y, fl))
                        pg.evaluate("scrollTo(0, 0)")
                    m = pg.evaluate(V.MONO_JS, "#main")
                    mono_seen += m["seen"]
                    if m["out"]:
                        mono_bad.append((state, wd, fs, m["out"][:2]))
                    c.close()
        t("L2 상태표 13상태 × (375·1280 × 17·21 + 320×21) — #gig-phase · 하단 바 문구가 표와 같다 (%d장면)" % seen, not bad and seen == 65, bad[:4])
        t("C17 /live 전 장면 가로 넘침 0 (320×21 포함)", not over_bad, over_bad[:4])
        t("C7 /live L4~L10 — 화면 안에 보이는 채운 단추(아이보리 바탕) 1개 이하 (스크롤 4곳씩)", not filled_bad, filled_bad[:3])
        t("C8 /live 한글 텍스트에 모노 서체 0 (잰 한글 노드 %d)" % mono_seen, not mono_bad and mono_seen > 300, mono_bad[:3])

        # L0 — 8초 뒤 '연결이 느립니다.' + 다시 불러오기
        f, uid, url, conf, hold = setup("L0")
        c = ctx_of(br, f, hold=hold, gig_src=gig_src); pg = c.new_page(); fresh(pg, url, 600)
        early = pg.is_visible("#gig-slow")
        pg.wait_for_timeout(8200)
        late = pg.evaluate("[document.getElementById('gig-slow').checkVisibility(), document.getElementById('gig-slow-t').textContent, document.getElementById('gig-retry').getBoundingClientRect().height]")
        t("L0 8초 전엔 글자만 · 8초 뒤 '연결이 느립니다.' + [다시 불러오기](≥48px)", not early and late[0] and late[1] == "연결이 느립니다." and late[2] >= 48, (early, late))
        c.close()

    if want("L3"):
        print("── L3 느린 회선 · 전송량")
        js = sum(len(gzip.compress((ROOT / p).read_bytes(), 9)) for p in ("assets/js/config.js", "assets/js/board.min.js", "assets/js/gig.min.js"))
        t("L3a 글꼴을 뺀 JS 전송량(config+board+gig, gzip) %.1fKB ≤ 60KB" % (js / 1024), js <= 60 * 1024, js)
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312)
        c = ctx_of(br, f, gig_src=gig_src); pg = c.new_page()
        cdp = c.new_cdp_session(pg)
        cdp.send("Network.enable")
        cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
        cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 200, "downloadThroughput": 1.2e6 / 8, "uploadThroughput": 0.6e6 / 8})
        pg.goto("about:blank")
        t0 = time.time()
        pg.goto(B + "live?e=K7Q2M", wait_until="commit")
        pg.wait_for_function("""() => { const h = document.getElementById('gig-title'), g = document.getElementById('gig-go');
          return h && h.textContent.indexOf('부산') >= 0 && g && g.checkVisibility({checkVisibilityCSS: true}) && g.getBoundingClientRect().height > 40; }""", timeout=15000, polling=50)
        dt = time.time() - t0
        t("L3b 1.2Mbps·RTT 200ms(로컬 8908) 첫 방문 — 공연 이름(h1)과 '도장 찍기'가 %.2f초 ≤ 3.5초" % dt, dt <= 3.5, dt)
        c.close()

    if want("L4"):
        print("── L4 도장")
        init = "document.addEventListener('animationstart', function (e) { if (e.target && e.target.id === 'gig-stamp') window.__anim = (window.__anim || 0) + 1; }, true);"
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312)
        s = sess(f, w["mem"])
        c = ctx_of(br, f, session=s, gig_src=gig_src, init_extra=init); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.evaluate("() => { const g = document.getElementById('gig-go'); g.click(); g.click(); g.click(); }")   # 성급한 세 번
        pg.wait_for_timeout(1200)
        d = pg.evaluate(GIG)
        rows = sum(1 for (a, u) in f.checkins if u == w["mem"])
        n_calls = len(rpc_calls(c, "gig_checkin"))
        anim = pg.evaluate("window.__anim || 0")
        t("L4a 도장 단추를 연달아 세 번 → 서버 요청 1 · 행 1 · 도장 보임 · #gig-n 313 · 등장 모션 정확히 1회",
          n_calls == 1 and rows == 1 and d["stamp"] and d["n"] == "313" and anim == 1, (n_calls, rows, d["stamp"], d["n"], anim))
        again = pg.evaluate("() => INSOONI_MEMBER.rpc('gig_checkin', {p_code: 'K7Q2M'}, true)")
        rows2 = sum(1 for (a, u) in f.checkins if u == w["mem"])
        t("L4b 두 번째 도장 요청 → already=true · 서버 행 여전히 1", again.get("ok") and again.get("already") is True and rows2 == 1, (again, rows2))
        fresh(pg, "live?e=K7Q2M")
        d2 = pg.evaluate(GIG)
        t("L4c 다시 열면 도장은 보이고 등장 모션 0회 · '이미 도장을 찍으셨습니다'", d2["stamp"] and pg.evaluate("window.__anim || 0") == 0 and d2["phase"].startswith("이미 도장을"), (d2, pg.evaluate("window.__anim || 0")))
        lab = pg.evaluate("document.getElementById('gig-stamp').getAttribute('aria-label')")
        t("L4d 도장 figure role=img · 이름표 '2026년 10월 18일 … 도장'", lab.startswith("2026년 10월 18일 ") and lab.endswith(" 도장"), lab)
        c.close()
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, session=sess(f, w["mem2"]), reduced=True, gig_src=gig_src, init_extra=init); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.click("#gig-go"); pg.wait_for_timeout(900)
        t("L4e 동작 줄이기(prefers-reduced-motion) → 도장은 보이고 등장 모션 0회", pg.evaluate(GIG)["stamp"] and pg.evaluate("window.__anim || 0") == 0,
          pg.evaluate("window.__anim || 0"))
        c.close()

    if want("L5"):
        print("── L5 숫자 새로 세기")
        f = GigFake(); w = seed(f); f.poll_s = 5
        fill_counts(f, w["ev"], 312)
        c = ctx_of(br, f, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M", 900)
        pg.evaluate("""() => { window.__ns = []; const n = document.getElementById('gig-n');
          new MutationObserver(() => window.__ns.push(n.textContent)).observe(n, {childList: true, characterData: true, subtree: true}); }""")
        first = pg.evaluate("document.getElementById('gig-n').textContent")
        for i in range(3):
            f.checkins[(w["ev"]["id"], "late-%d" % i)] = iso(f.now)
        t0 = time.time()
        pg.wait_for_function("document.getElementById('gig-n').textContent === '315'", timeout=(f.poll_s + 5) * 1000)
        dt = time.time() - t0
        ns = set(pg.evaluate("window.__ns"))
        t("L5a 서버 312 → 315 — %.1f초 안에 #gig-n 315 (poll_s %d + 5초 이내) · 화면에 나온 숫자는 서버 값뿐 %s" % (dt, f.poll_s, sorted(ns)),
          first == "312" and dt <= f.poll_s + 5 and ns <= {"312", "315"}, (first, dt, ns))
        k0 = len(rpc_calls(c, "gig_pulse"))
        f.stale_next = {"checkins": 300, "at": "2026-01-01T00:00:00.000Z", "now": "2026-01-01T00:00:00.000Z"}
        pg.wait_for_function("(k) => performance.getEntriesByType('resource').filter(e => e.name.indexOf('/rpc/gig_pulse') >= 0).length > k", arg=k0, timeout=12000)
        pg.wait_for_timeout(300)
        t("L5b 더 이른 시각(at)의 옛 응답(300)은 숫자를 되돌리지 않는다", pg.evaluate("document.getElementById('gig-n').textContent") == "315",
          pg.evaluate("document.getElementById('gig-n').textContent"))
        c.close()

    if want("L6"):
        print("── L6 응원 한마디")
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 10, {1: 128, 2: 96})
        c = ctx_of(br, f, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        d = pg.evaluate("""async () => { const b = document.querySelector('.gig-chip[data-k="1"]'); const n0 = +b.querySelector('.gig-n').textContent;
          b.click(); await new Promise(r => setTimeout(r, 100));
          return {p: b.getAttribute('aria-pressed'), d: +b.querySelector('.gig-n').textContent - n0, n0: n0, ck: b.querySelector('.gig-chk').checkVisibility()}; }""")
        pg.wait_for_timeout(700)
        srv = sum(1 for (a, u, k) in f.cheers if k == 1)
        shown = pg.evaluate("+document.querySelector('.gig-chip[data-k=\"1\"] .gig-n').textContent")
        t("L6a 누르면 100ms 안에 aria-pressed=true · +1 · ✓ 표시 → 응답 뒤 서버 숫자(%d)" % srv, d["p"] == "true" and d["d"] == 1 and d["ck"] and shown == srv == 129, (d, shown, srv))
        pg.click('.gig-chip[data-k="1"]'); pg.wait_for_timeout(700)
        t("L6b 다시 누르면 거둔다 → aria-pressed=false · 128", pg.get_attribute('.gig-chip[data-k="1"]', "aria-pressed") == "false"
          and pg.evaluate("+document.querySelector('.gig-chip[data-k=\"1\"] .gig-n').textContent") == 128 and (w["ev"]["id"], w["mem"], 1) not in f.cheers)
        f.http_fail["gig_cheer"] = 1
        pg.click('.gig-chip[data-k="2"]'); pg.wait_for_timeout(900)
        d = pg.evaluate("""() => { const b = document.querySelector('.gig-chip[data-k="2"]');
          return {p: b.getAttribute('aria-pressed'), n: +b.querySelector('.gig-n').textContent, msg: document.getElementById('gig-msg').textContent}; }""")
        t("L6c 서버 500 → 원래대로(눌리지 않음 · 96) · #gig-msg 실패 문구", d["p"] == "false" and d["n"] == 96 and "저장되지 않았습니다" in d["msg"], d)
        lab = pg.get_attribute('.gig-chip[data-k="2"]', "aria-label")
        t("L6d 응원 칸 이름표 '{문구}, {n}명' · 칸 높이 ≥ 64px", lab == "앵콜!, 96명" and pg.evaluate("document.querySelector('.gig-chip').getBoundingClientRect().height") >= 64, lab)
        c.close()
        # 로그아웃 상태에서 누르면 회원 창(공연 문맥) + 이어서 할 일
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.click('.gig-chip[data-k="3"]'); pg.wait_for_timeout(900)
        nk = pg.evaluate("JSON.parse(localStorage.getItem('insooni_board_next') || 'null')")
        h = pg.evaluate("(document.querySelector('#bd-sheet .bd-sheet-h') || {}).textContent")
        t("L6e 로그아웃 상태에서 응원 → 회원 창 '도장을 남기려면 회원으로 들어와 주세요' · 이어서 할 일 {cheer,k:3}",
          pg.is_visible("#bd-sheet") and h == "도장을 남기려면 회원으로 들어와 주세요" and nk and nk.get("what") == "cheer" and nk.get("k") == 3, (h, nk))
        c.close()

    if want("L7"):
        print("── L7 앵콜 투표")
        # 숫자순(밤이면 밤마다 5 > 거위의 꿈 2)과 운영자 순서(거위의 꿈 먼저)를 일부러 다르게 — 다시 줄 세우면 잡힌다
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 10, None, {"거위의 꿈": 2, "밤이면 밤마다": 5})
        c = ctx_of(br, f, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        rd = "() => [...document.querySelectorAll('.gig-song')].map(b => [b.dataset.song, +b.querySelector('.gig-song-n').textContent, b.getAttribute('aria-pressed')])"
        pg.click('.gig-song[data-song="밤이면 밤마다"]'); pg.wait_for_timeout(700)
        a = pg.evaluate(rd)
        pg.click('.gig-song[data-song="친구여"]'); pg.wait_for_timeout(700)
        b = pg.evaluate(rd)
        order_ok = [x[0] for x in a] == SONGS and [x[0] for x in b] == SONGS
        t("L7a 투표: 밤이면 밤마다 5→6 · 옮기면 6→5(prev_n) · 친구여 0→1 · 줄 순서는 운영자 순서 그대로(숫자순 아님)",
          a[1][1] == 6 and a[1][2] == "true" and b[1][1] == 5 and b[2][1] == 1 and b[2][2] == "true" and b[1][2] == "false" and order_ok, (a, b))
        pg.click('.gig-song[data-song="친구여"]'); pg.wait_for_timeout(400)
        b2 = pg.evaluate(rd)
        t("L7b 내 선택을 다시 누르면 그대로(취소되지 않음) · 안내", b2 == b and "이미 고르셨습니다" in pg.evaluate("document.getElementById('gig-msg').textContent"), b2)
        bar = pg.evaluate("() => { const b = document.querySelector('.gig-song[data-song=\"밤이면 밤마다\"] .gig-bar-f'); return [b.style.width, getComputedStyle(b).height]; }")
        # 막대 4px + 전체 폭 트랙(줄 테두리 대신) · 내 선택 줄도 막대 시작이 같은 x(검토 10·41번)
        tr = pg.evaluate("""() => { const rows = [...document.querySelectorAll('.gig-song')];
          return {bg: rows.map(b => getComputedStyle(b).backgroundImage.indexOf('gradient') >= 0), bb: rows.map(b => getComputedStyle(b).borderBottomWidth),
                  x: [...new Set(rows.map(b => Math.round(b.querySelector('.gig-bar-f').getBoundingClientRect().left)))],
                  pressed: rows.filter(b => b.getAttribute('aria-pressed') === 'true').length}; }""")
        t("L7c 막대 4px · 가장 많은 곡 100% · 줄마다 트랙(테두리 0) · 막대 시작 x 하나(내 선택 줄 포함)",
          float(bar[0].rstrip("%")) == 100 and bar[1] == "4px" and all(tr["bg"]) and set(tr["bb"]) == {"0px"} and len(tr["x"]) == 1 and tr["pressed"] == 1, (bar, tr))
        f.events[0]["vote_open"] = False
        fresh(pg, "live?e=K7Q2M")
        pg.click('.gig-song[data-song="거위의 꿈"]', force=True); pg.wait_for_timeout(500)
        d = pg.evaluate("[document.getElementById('gig-vote-d').textContent, document.querySelector('.gig-song').getAttribute('aria-disabled')]")
        t("L7d 투표 닫힘 → '투표가 닫혔습니다.' · aria-disabled · 눌러도 요청 없음", d == ["투표가 닫혔습니다.", "true"] and len(rpc_calls(c, "gig_vote")) == 2, (d, len(rpc_calls(c, "gig_vote"))))
        c.close()

    if want("L8"):
        print("── L8 화면이 숨으면 멈추고, 실패하면 간격을 늘린다(가짜 시계)")
        f = GigFake(); w = seed(f); f.poll_s = 5
        rec = "(function(){var F=window.fetch;window.__pulses=[];window.fetch=function(u,o){if(String(u).indexOf('/rpc/gig_pulse')>=0)window.__pulses.push(Date.now());return F.apply(this,arguments);};})();"
        c = ctx_of(br, f, session=sess(f, w["mem"]), gig_src=gig_src, init_extra=rec); pg = c.new_page()
        pg.clock.install(time=datetime(2026, 10, 18, 10, 30, tzinfo=UTC))
        pg.goto(B + "live?e=K7Q2M", wait_until="load")
        pg.wait_for_function("window.INSOONI_GIG && INSOONI_GIG.state().phase === 'open'", timeout=8000)
        for _ in range(12):
            pg.clock.run_for(1000); pg.wait_for_timeout(60)
        n0 = pg.evaluate("window.__pulses.length")
        pg.evaluate("""() => { Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
          Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); document.dispatchEvent(new Event('visibilitychange')); }""")
        for _ in range(60):
            pg.clock.run_for(1000); pg.wait_for_timeout(15)
        n1 = pg.evaluate("window.__pulses.length")
        pg.evaluate("""() => { Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'visible'});
          Object.defineProperty(document, 'hidden', {configurable: true, get: () => false}); document.dispatchEvent(new Event('visibilitychange')); }""")
        pg.wait_for_timeout(1000)
        n2 = pg.evaluate("window.__pulses.length")
        t("L8a 숨은 60초 동안 gig_pulse 0회 · 다시 보이면 1초 안에 1회 (전 %d · 숨김 %d · 보임 %d)" % (n0, n1 - n0, n2 - n1), n0 >= 1 and n1 == n0 and n2 == n1 + 1, (n0, n1, n2))
        f.http_fail["gig_pulse"] = 1000
        start = pg.evaluate("window.__pulses.length")
        for _ in range(520):
            pg.clock.run_for(1000); pg.wait_for_timeout(25)
        ts = pg.evaluate("window.__pulses")[start - 1:]
        gaps = [round((b - a) / 1000) for a, b in zip(ts, ts[1:])]
        # gaps[0] 은 마지막 성공 뒤의 보통 간격(poll_s + 0~3초 흔들림). 실패 뒤부터: 2×poll_s, 그다음 두 배씩, 120초에서 멈춘다
        fg = gaps[1:]
        ok = len(fg) >= 6 and abs(fg[0] - 2 * f.poll_s) <= 1 and all(g <= 121 for g in gaps) and fg[-1] >= 118 \
            and all(abs(b - min(120, 2 * a)) <= 2 for a, b in zip(fg, fg[1:]))
        t("L8b 실패가 이어지면 간격이 2배씩(최대 120초) — %s초" % gaps, ok, gaps)
        c.close()

    if want("L9"):
        print("── L9 하단 바")
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.evaluate("scrollTo(0, document.documentElement.scrollHeight)"); pg.wait_for_timeout(300)
        d = pg.evaluate("""() => { const bar = document.getElementById('gig-bar'), last = [...document.querySelectorAll('.gig-tail a')].pop();
          const r = last.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {pad: parseFloat(getComputedStyle(document.body).paddingBottom), bar: bar.getBoundingClientRect().height,
                  pos: getComputedStyle(bar).position, free: hit === last || last.contains(hit), top: document.querySelectorAll('.back-to-top').length,
                  goH: document.getElementById('gig-go').getBoundingClientRect().height}; }""")
        t("L9a 375×812 로그아웃 — 바 고정 · 몸 아래 여백(%.0f) ≥ 바 높이(%.0f) · 마지막 꼬리 링크가 바에 안 가림 · TOP 0 · 단추 ≥56px" % (d["pad"], d["bar"]),
          d["pos"] == "fixed" and d["pad"] >= d["bar"] and d["free"] and d["top"] == 0 and d["goH"] >= 56, d)
        c.close()
        f = GigFake(); w = seed(f)
        f.checkins[(w["ev"]["id"], w["mem"])] = iso(f.now)
        c = ctx_of(br, f, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        lab0 = pg.evaluate("document.getElementById('gig-go').textContent")
        pg.click("#gig-go"); pg.wait_for_timeout(900)
        d0 = pg.evaluate("""() => { const a = document.activeElement, h = document.querySelector('.gig-head').getBoundingClientRect().bottom;
          return {chip: !!a && a.classList.contains('gig-chip'), top: Math.round(document.getElementById('gig-cheers').getBoundingClientRect().top - h)}; }""")
        pg.click('.gig-chip[data-k="2"]'); pg.wait_for_timeout(700)
        lab1 = pg.evaluate("document.getElementById('gig-go').textContent")
        t("L9b0 L8 첫 주 단추 '응원 보내기' → 응원 칸이 머리 아래(±16) · 첫 칸 초점 → 응원 한 번 뒤 '방명록 남기기'",
          lab0 == "응원 보내기" and d0["chip"] and abs(d0["top"] - 8) <= 16 and lab1 == "방명록 남기기", (lab0, d0, lab1))
        before = pg.is_visible("#gig-go")
        pg.click("#gig-go"); pg.wait_for_timeout(900)
        foc = pg.evaluate("document.activeElement && document.activeElement.id")
        bar_now = pg.evaluate("getComputedStyle(document.getElementById('gig-bar')).display")
        t("L9b L8 '방명록 남기기' → 쓰기 칸으로 스크롤·초점 · 칸이 보이고 글을 치는 동안 바 display:none",
          before and foc == "gig-gb-ta" and bar_now == "none", (before, foc, bar_now))
        pg.evaluate("scrollTo(0, 0)"); pg.wait_for_timeout(500)
        typing = pg.evaluate("[document.activeElement && document.activeElement.id, getComputedStyle(document.getElementById('gig-bar')).display]")
        t("L9c 쓰기 칸에 초점이 있는 채로 위로 올려도(자판이 떠 있는 동안) 바는 내려가 있다", typing == ["gig-gb-ta", "none"], typing)
        pg.evaluate("document.activeElement.blur()"); pg.wait_for_timeout(700)
        t("L9d 초점이 빠지고(자판이 내려가고) 쓰기 칸도 화면 밖이면 바가 다시 선다", pg.is_visible("#gig-go"))
        c.close()

    if want("L10"):
        print("── L10 카카오 왕복 → 가입 → 도장(이어서 할 일)")
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312)
        c = ctx_of(br, f, conf="{board: true, kakao: true, live: true}", gig_src=gig_src); pg = c.new_page()
        E = V.errs_of(pg)
        fresh(pg, "live?e=K7Q2M")
        pg.click("#gig-go"); pg.wait_for_timeout(1000)
        sh = pg.evaluate("[document.querySelector('#bd-sheet .bd-sheet-h').textContent, !!document.querySelector('#bd-sheet .bd-kakao')]")
        with pg.expect_navigation(timeout=10000):
            pg.click("#bd-sheet .bd-kakao")
        pg.wait_for_timeout(1800)
        auth = [u for u in c.calls if "/auth/v1/authorize" in u]
        rt = parse_qs(urlparse(auth[0]).query).get("redirect_to", [""])[0] if auth else ""
        jb = pg.evaluate("(document.querySelector('#bd-sheet form .btn--solid') || {}).textContent || ''")
        t("L10a 공연 문맥 회원 창 · 카카오 redirect_to 가 '/live?e=K7Q2M&bd=kakao' 로 끝남 · 돌아오면 '가입 마치고 도장 찍기'",
          sh[0] == "도장을 남기려면 회원으로 들어와 주세요" and sh[1] and rt.endswith("/live?e=K7Q2M&bd=kakao") and jb == "가입 마치고 도장 찍기", (sh, rt, jb))
        pg.fill("#bd-jn", "공연장팬")
        pg.check("#bd-jall")
        pg.click("#bd-sheet form .btn--solid"); pg.wait_for_timeout(2500)
        d = pg.evaluate(GIG)
        loc = pg.evaluate("location.search")
        ncheck = len(rpc_calls(c, "gig_checkin"))
        nk = pg.evaluate("localStorage.getItem('insooni_board_next')")
        t("L10b 가입을 마치면 도장이 저절로 정확히 1번 · 주소 '?e=K7Q2M' · 이어서 할 일 지워짐 · JS 오류 0",
          d["stamp"] and loc == "?e=K7Q2M" and ncheck == 1 and nk is None and not E and d["n"] == "313", (d["stamp"], loc, ncheck, nk, E, d["n"]))
        t("L10c 가짜 서버가 못 받은 요청 0", not f.unhandled, f.unhandled[:3])
        c.close()

    if want("L13"):
        print("── L13 도장 직후(L8) 낮은 폰 — 숫자·도장이 하단 바 뒤로 숨지 않는다")
        # 카카오톡 인앱(세로 600~700)·21px 에서 정사각 도장과 5rem 숫자가 바 뒤에 숨었다(검토 2·24번).
        # 같은 장면을 '접기 규칙을 무력화한 스타일'로 한 번 더 재서, 검사가 살아 있는지도 본다(뮤테이션).
        UNDO = ("body[data-gig] .gig-stamp{width:9.5rem!important;height:9.5rem!important;flex-direction:column!important;transform:rotate(-3deg)!important}"
                "body[data-gig] #gig-n{font-size:clamp(3.2rem,18vw,5rem)!important} body[data-gig] .gig-count-note{display:block!important}")
        def l8_box(wd, ht, fs, undo):
            f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312, {1: 128})
            c = ctx_of(br, f, wd, ht, fs=fs, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
            if undo:
                pg.add_style_tag(content=UNDO)
            pg.click("#gig-go"); pg.wait_for_timeout(1300)
            pg.evaluate("scrollTo(0, 0)"); pg.wait_for_timeout(300)
            d = pg.evaluate("""() => { const r = id => document.getElementById(id).getBoundingClientRect();
              return {L: document.body.getAttribute('data-gig'), row: Math.round(r('gig-count-row').bottom), stamp: Math.round(r('gig-stamp').bottom),
                      bar: Math.round(r('gig-bar').top), title: Math.round(r('gig-title').top)}; }""")
            c.close()
            return d
        bad, bad_m = [], []
        for (wd, ht) in ((360, 640), (375, 635)):
            for fs in (17, 21):
                d = l8_box(wd, ht, fs, False)
                if not (d["L"] == "L8" and d["row"] <= d["bar"] - 8 and d["stamp"] <= d["bar"] and d["title"] >= 56):
                    bad.append((wd, ht, fs, d))
                dm = l8_box(wd, ht, fs, True)
                if not (dm["row"] <= dm["bar"] - 8 and dm["stamp"] <= dm["bar"]):
                    bad_m.append((wd, ht, fs))
        t("L13 360×640·375×635 × 17/21 도장 직후 — 숫자 줄 bottom ≤ 바 top−8 · 도장 bottom ≤ 바 top", not bad, bad[:3])
        t("L13b 뮤테이션(정사각 도장·5rem 숫자로 되돌림) → 위 검사가 잡는다(%d/4 장면)" % len(bad_m), len(bad_m) >= 2, bad_m)
        # 키 큰 폰은 정사각 도장 그대로
        f = GigFake(); w = seed(f); f.checkins[(w["ev"]["id"], w["mem"])] = iso(f.now)
        c = ctx_of(br, f, 375, 812, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        sq_ = pg.evaluate("(() => { const r = document.getElementById('gig-stamp').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()")
        t("L13c 375×812 은 정사각 도장 그대로(접지 않는다)", abs(sq_[0] - sq_[1]) <= 12 and sq_[0] >= 150, sq_)
        c.close()

    if want("L14"):
        print("── L14 카카오 꺼짐·실패 + 공연 켜짐 — 처음 온 관객이 가입할 길")
        # {board, live} 만 켠 배포(카카오 기본 false) — 이메일 '처음 가입'이 열리고 없는 카카오를 권하지 않는다(검토 26·33·49번)
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, 375, 812, conf="{board: true, live: true}", gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        note = pg.evaluate("(() => { const n = document.getElementById('gig-mailnote'); return n.checkVisibility() ? n.textContent : ''; })()")
        pg.click("#gig-go"); pg.wait_for_timeout(1100)
        d = pg.evaluate("""() => { const s = document.getElementById('bd-sheet');
          return {tabs: [...s.querySelectorAll('.bd-tab')].map(b => b.textContent), kakao: s.querySelectorAll('.bd-kakao').length,
                  txt: s.innerText, pressed: (s.querySelector('.bd-tab[aria-pressed=true]') || {}).textContent || ''}; }""")
        t("L14a conf {board, live} — L5 아래 '가입은 이메일로' 한 줄 · 회원 창에 '처음 가입' 탭(먼저 열림) · 카카오 단추 0 · '카카오' 문구 0",
          "이메일" in note and "처음 가입" in d["tabs"] and d["pressed"] == "처음 가입" and d["kakao"] == 0 and "카카오" not in d["txt"], (note, d))
        c.close()
        # 카카오가 방금(10분 안) 실패 — 노란 단추를 다시 권하지 않고 이메일 가입을 연다
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, 375, 812, gig_src=gig_src, init_extra="try{sessionStorage.setItem('insooni_kakao_fail_at', JSON.stringify(Date.now()))}catch(e){}")
        pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.click("#gig-go"); pg.wait_for_timeout(1100)
        d = pg.evaluate("""() => { const s = document.getElementById('bd-sheet'), k = s.querySelector('.bd-kakao');
          return {tabs: [...s.querySelectorAll('.bd-tab')].map(b => b.textContent), low: !!k && k.classList.contains('bd-kakao--low'),
                  yellow: !!k && getComputedStyle(k).backgroundColor === 'rgb(254, 229, 0)'}; }""")
        t("L14b 카카오 방금 실패 + 공연 — '처음 가입' 열림 · 카카오는 노랑 없는 테두리 단추", "처음 가입" in d["tabs"] and d["low"] and not d["yellow"], d)
        c.close()
        # 카카오가 있으면 — 이메일은 접혀 있고 노란 단추가 엄지 자리(아래)에 온다(검토 37번)
        bad = []
        for (wd, ht, fs) in ((375, 812, 17), (375, 812, 21), (320, 568, 21)):
            f = GigFake(); w = seed(f)
            c = ctx_of(br, f, wd, ht, fs=fs, gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
            pg.click("#gig-go"); pg.wait_for_timeout(1100)
            d = pg.evaluate("""() => { const s = document.getElementById('bd-sheet'), k = s.querySelector('.bd-kakao'), det = s.querySelector('details.bd-mail');
              return {top: k ? Math.round(k.getBoundingClientRect().top) : -1, ih: innerHeight, det: !!det && !det.open,
                      foc: document.activeElement === k}; }""")
            if not (d["top"] >= 0.55 * d["ih"] and d["det"] and d["foc"]):
                bad.append((wd, ht, fs, d))
            c.close()
        t("L14c 공연 문맥 + 카카오 — 이메일 접힘 · 노란 단추 top ≥ 0.55×화면 높이 · 첫 초점 카카오 (375×812·17/21, 320×568·21)", not bad, bad)
        # 카카오(KOE205)에서 막혀 인앱 창을 닫고 QR 을 다시 찍었다 — 공연 문맥 그대로 안내, 첫 초점은 안내문,
        # 노란 단추 대신 이메일 '처음 가입'(검토 29·32번)
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, 375, 812, gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.evaluate("localStorage.setItem('insooni_pkce', JSON.stringify({v: 'x', p: 'kakao', at: Date.now()}))")
        fresh(pg, "live?e=K7Q2M", 1800)
        d = pg.evaluate("""() => { const s = document.getElementById('bd-sheet'); if (!s || s.hidden) return null; const k = s.querySelector('.bd-kakao');
          return {h: s.querySelector('.bd-sheet-h').textContent, al: [...s.querySelectorAll('[role=alert]')].map(a => a.textContent),
                  foc: document.activeElement && document.activeElement.className, low: !!k && k.classList.contains('bd-kakao--low'),
                  tabs: [...s.querySelectorAll('.bd-tab')].map(b => b.textContent)}; }""")
        t("L14d /live 에서 카카오 막힘 → 다시 열기 — 공연 제목 · 안내 1개('지금 되지 않습니다') · 첫 초점 안내 · 카카오 테두리 단추 · '처음 가입'",
          d is not None and d["h"] == "도장을 남기려면 회원으로 들어와 주세요" and len(d["al"]) == 1 and "지금 되지 않습니다" in d["al"][0]
          and d["foc"] == "bd-alert" and d["low"] and "처음 가입" in d["tabs"], d)
        c.close()

    if want("L15"):
        print("── L15 응원부터 누른 로그아웃 관객 → 카카오 → 가입 → 도장 + 응원")
        # 단추가 '가입 마치고 도장 찍기'를 약속했으니 도장이 찍혀야 하고, 한 일을 모두 말해야 한다(검토 35번)
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312, {1: 128})
        c = ctx_of(br, f, conf="{board: true, kakao: true, live: true}", gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.click('.gig-chip[data-k="1"]'); pg.wait_for_timeout(1000)
        with pg.expect_navigation(timeout=10000):
            pg.click("#bd-sheet .bd-kakao")
        pg.wait_for_timeout(1800)
        jb = pg.evaluate("(document.querySelector('#bd-sheet form .btn--solid') || {}).textContent || ''")
        pg.fill("#bd-jn", "응원먼저")
        pg.check("#bd-jall")
        pg.click("#bd-sheet form .btn--solid"); pg.wait_for_timeout(2600)
        uid = [u for u, m in f.members.items() if m["nickname"] == "응원먼저"]
        ev = w["ev"]["id"]
        chk = bool(uid) and (ev, uid[0]) in f.checkins
        ch = bool(uid) and (ev, uid[0], 1) in f.cheers
        msg = pg.evaluate("document.getElementById('gig-msg').textContent")
        t("L15 응원 '사랑해요' → 가입 마치고 도장 찍기 → 도장 1 · 응원 1 · '도장을 찍고 「사랑해요」 응원을 보냈습니다.'",
          jb == "가입 마치고 도장 찍기" and chk and ch and msg == "도장을 찍고 「사랑해요」 응원을 보냈습니다.", (jb, chk, ch, msg))
        c.close()

    if want("L16"):
        print("── L16 누르는 칸 48px · 헤더 도구 간격 8px · 초점이 하단 바에 가리지 않음")
        TAP = """() => { const out = [], seen = [];
          for (const e of document.querySelectorAll('.gig-head a, .gig-head button, #main a, #main button, #main input, #main textarea, #main summary')) {
            if (!e.checkVisibility({checkVisibilityCSS: true})) continue;
            const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
            seen.push(1);
            if (r.height < 48 || r.width < 48) out.push([e.id || e.className || e.tagName, Math.round(r.width), Math.round(r.height)]); }
          const tools = [...document.querySelectorAll('.gig-head .header-tools > *')].filter(e => e.checkVisibility()).map(e => e.getBoundingClientRect());
          const gaps = tools.slice(1).map((r, i) => Math.round(r.left - tools[i].right));
          return {small: out, n: seen.length, gaps: gaps}; }"""
        bad, gapbad, seen = [], [], 0
        for state in ("L5", "L7", "L8", "L9"):
            f, uid, url, conf, hold = setup(state)
            c = ctx_of(br, f, 360, 640, conf=conf, session=sess(f, uid) if uid else None, gig_src=gig_src); pg = c.new_page(); fresh(pg, url, 1500)
            d = pg.evaluate(TAP)
            seen += d["n"]
            bad += [(state,) + tuple(x) for x in d["small"]]
            if not d["gaps"] or min(d["gaps"]) < 8:
                gapbad.append((state, d["gaps"]))
            c.close()
        t("L16a /live L5·L7·L8·L9 360×640 — 누르는 칸 48×48 미만 0 (잰 칸 %d) · 헤더 도구 간격 ≥8px" % seen, not bad and not gapbad and seen > 30, (bad[:5], gapbad))
        f, uid, url, conf, hold = setup("L7")
        c = ctx_of(br, f, 360, 640, conf=conf, session=sess(f, uid), gig_src=gig_src); pg = c.new_page(); fresh(pg, url, 1300)
        hb = pg.evaluate("[getComputedStyle(document.querySelector('.gig-head')).backgroundColor, getComputedStyle(document.getElementById('gig-when')).color]")
        t("L16d 공연 머리 바탕 불투명 #080808(지나가는 글자가 비치지 않게) · 날짜 줄 --muted", hb == ["rgb(8, 8, 8)", "rgb(179, 169, 156)"], hb)
        c.close()
        # Tab 으로 옮긴 초점이 하단 바(#gig-bar) 뒤에 숨지 않는다(WCAG 2.4.11) — 응원 칸·투표 줄·꼬리 링크
        def hidden_focus(fs, mut):
            f, uid, url, conf, hold = setup("L7")
            c = ctx_of(br, f, 360, 640, fs=fs, conf=conf, session=sess(f, uid), gig_src=gig_src); pg = c.new_page(); fresh(pg, url, 1500)
            if mut:
                pg.add_style_tag(content="html{scroll-padding-bottom:0!important}")
            hid, n = [], 0
            for i in range(40):
                pg.keyboard.press("Tab"); pg.wait_for_timeout(60)
                r = pg.evaluate("""() => { const a = document.activeElement; if (!a || a === document.body) return null;
                  const bar = document.getElementById('gig-bar'); if (!bar || !bar.checkVisibility()) return {skip: 1};
                  if (bar.contains(a)) return {skip: 1};
                  const r = a.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
                  if (y > innerHeight || y < 0) return {id: a.id || a.className, off: 1};
                  const hit = document.elementFromPoint(x, y);
                  return {id: a.id || a.className, under: !!hit && bar.contains(hit)}; }""")
                if not r or r.get("skip"):
                    continue
                n += 1
                if r.get("under") or r.get("off"):
                    hid.append(r["id"])
            c.close()
            return hid, n
        h17, n17 = hidden_focus(17, False)
        h21, n21 = hidden_focus(21, False)
        hm_, _ = hidden_focus(21, True)
        t("L16b 360×640 × 17/21 Tab 초점이 하단 바 뒤에 숨은 횟수 0 (잰 초점 %d·%d)" % (n17, n21), not h17 and not h21 and n17 > 10 and n21 > 10, (h17, h21))
        t("L16c 뮤테이션(scroll-padding-bottom 0) → 위 검사가 잡는다", len(hm_) > 0, hm_[:3])

    if want("L12"):
        print("── L12 · 320×21")
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312, {1: 128})
        c = ctx_of(br, f, 320, 640, fs=21, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        d = pg.evaluate("""() => ({cols: getComputedStyle(document.getElementById('gig-chips')).gridTemplateColumns.split(' ').length,
          fs: parseFloat(getComputedStyle(document.getElementById('gig-n')).fontSize), over: document.documentElement.scrollWidth - innerWidth,
          hdr: [...document.querySelectorAll('.gig-head .header-tools > *')].filter(e => e.checkVisibility()).map(e => Math.round(e.getBoundingClientRect().right)),
          brand: Math.round(document.querySelector('.gig-brand').getBoundingClientRect().right),
          tailLang: document.querySelector('.gig-tail-lang').checkVisibility()})""")
        t("L12 320×21 — 응원 2열 · #gig-n %.0fpx ≥ 48 · 가로 넘침 0 · 헤더 도구가 화면 안 · 꼬리에 'English'" % d["fs"],
          d["cols"] == 2 and d["fs"] >= 48 and d["over"] == 0 and all(x <= 320 for x in d["hdr"]) and d["tailLang"], d)
        c.close()

    if want("LX"):
        print("── LX 방명록 · 영어 · 대비 · 사랑방 연결")
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, session=sess(f, w["sprout"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        hint = pg.evaluate("document.getElementById('gig-gb-hint').textContent")
        pg.click(".gig-start >> nth=0")
        pg.type("#gig-gb-ta", "정말 행복한 밤이었습니다")
        pg.click("#gig-gb-go"); pg.wait_for_timeout(1200)
        d = pg.evaluate("""() => ({msg: document.getElementById('gig-msg').textContent,
          items: [...document.querySelectorAll('.gig-gb-item')].map(li => li.textContent), ta: document.getElementById('gig-gb-ta').value})""")
        post = [p for p in f.posts if p.get("gig_id")]
        t("LXa 새싹 방명록 → '받았습니다. 확인한 뒤 올라갑니다.' · 나에게만 '확인 중'으로 보임 · 후기 게시판 글 · 제목=본문 앞부분",
          "새싹 회원의 글은 운영자가 확인한 뒤" in hint and d["msg"] == "받았습니다. 확인한 뒤 올라갑니다." and d["items"] and "확인 중" in d["items"][0]
          and len(post) == 1 and post[0]["board"] == "review" and post[0]["status"] == "pending" and post[0]["title"].startswith("오늘 처음 왔어요."), (hint, d, post[:1]))
        # 올린 뒤 — 폼을 접고 그 자리에 결과 + '한 줄 더'(빈 글칸·'남기기'가 남아 한 번 더 누르던 것, 검토 40번)
        g = pg.evaluate("""() => { const v = id => document.getElementById(id).checkVisibility();
          const dn = document.getElementById('gig-gb-done'), r = dn.getBoundingClientRect();
          return {form: v('gig-gb-form'), done: dn.textContent, doneIn: r.top >= 0 && r.bottom <= innerHeight, again: v('gig-gb-again'),
                  live: dn.getAttribute('role') || ''}; }""")
        pg.click("#gig-gb-again-b"); pg.wait_for_timeout(500)
        g2 = pg.evaluate("[document.getElementById('gig-gb-form').checkVisibility(), document.activeElement && document.activeElement.id]")
        t("LXa2 올린 뒤 폼 접힘 · 그 자리에 '받았습니다…'(화면 안) · '한 줄 더 남기기' → 폼·글칸 초점 · 낭독은 #gig-msg 하나",
          not g["form"] and g["done"] == "받았습니다. 확인한 뒤 올라갑니다." and g["doneIn"] and g["again"] and g["live"] == "" and g2 == [True, "gig-gb-ta"], (g, g2))
        # 시작 문장 — 테두리 칸(밑줄 링크 아님) · '+ ' · 안내 한 줄(검토 42번)
        sb = pg.evaluate("""() => [...document.querySelectorAll('.gig-start')].map(b => [b.textContent.slice(0, 2), getComputedStyle(b).textDecorationLine,
          getComputedStyle(b).borderTopWidth, Math.round(b.getBoundingClientRect().height)])""")
        sh2 = pg.evaluate("document.getElementById('gig-starts-h').textContent")
        t("LXa3 시작 문장 3개 — '+ ' · 밑줄 없음 · 1px 테두리 · ≥48px · '누르면 글칸에 이어 붙습니다'",
          len(sb) == 3 and all(x[0] == "+ " and x[1] == "none" and x[2] == "1px" and x[3] >= 48 for x in sb) and sh2 == "누르면 글칸에 이어 붙습니다", (sb, sh2))
        c.close()
        f2 = GigFake(); w2 = seed(f2)
        c = ctx_of(br, f2, session=sess(f2, w2["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.fill("#gig-gb-ta", "앵콜 거위의 꿈에서 다 같이 울었어요")
        pg.click("#gig-gb-go"); pg.wait_for_timeout(1200)
        d = pg.evaluate("[document.getElementById('gig-msg').textContent, [...document.querySelectorAll('.gig-gb-item')].length, (document.getElementById('gig-bar').hidden)]")
        t("LXb 정회원 방명록 → '올라갔습니다.' · 목록에 바로 보임 · (도장 전이므로 바는 그대로 '도장 찍기')", d[0] == "올라갔습니다." and d[1] == 1 and d[2] is False, d)
        c.close()
        # 영어
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312, {1: 128})
        c = ctx_of(br, f, lang="en", gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M", 1800)
        d = pg.evaluate(GIG)
        ko = pg.evaluate("""() => { const out = []; const w = document.createTreeWalker(document.querySelector('.gig-id'), NodeFilter.SHOW_TEXT); let n;
          while ((n = w.nextNode())) if (/[가-힣]/.test(n.nodeValue) && n.parentElement.checkVisibility()) out.push(n.nodeValue.trim()); return out; }""")
        t("LXc 영어 — 'Stamping is open now. …' · 바 'Get my stamp' · 이름표 영어 제목 · 헤더 'Sign in·Join'",
          d["phase"] == "Stamping is open now. Your stamp records tonight's show on your page." and d["bar"] == "Get my stamp"
          and d["title"] == "Insooni in Concert — Busan" and not ko
          and pg.evaluate("document.querySelector('.gig-head .hm .hm-short').textContent") == "Sign in·Join", (d, ko))
        c.close()
        # 대비 + 뮤테이션
        def audit(mut):
            out, counts = [], []
            for state, need in (("L5", 25), ("L8", 25), ("L9", 20), ("L3", 4)):
                f, uid, url, conf, hold = setup(state)
                c = ctx_of(br, f, conf=conf, session=sess(f, uid) if uid else None, gig_src=gig_src); pg = c.new_page(); fresh(pg, url, 1500)
                if mut:
                    pg.add_style_tag(content=":root{--faint:#555 !important}")
                pg.add_style_tag(content="*{transition:none!important;animation:none!important}")
                seen = 0
                for y in (0, 700, 1400, 2100, 99999):
                    pg.evaluate("scrollTo(0, %d)" % y); pg.wait_for_timeout(80)
                    r = pg.evaluate(V.AUDIT_JS, "body")
                    seen += r["seen"]
                    out += [(state, b) for b in r["bad"][:2]]
                counts.append((state, seen))
                if seen < need:
                    out.append((state, "잰 글자 %d — 화면이 비었나?" % seen))
                c.close()
            return out, counts
        bad, counts = audit(False)
        t("C18 /live 대비 4.5:1 (잰 글자 %s)" % counts, not bad, bad[:5])
        bad_m, _ = audit(True)
        t("C18b 뮤테이션 --faint #555 → /live 대비 검사가 잡는다", len(bad_m) > 0, bad_m[:2])
        # 사랑방 — 오늘 공연 줄 · 공연 방명록 글의 공연 이름 · 내 정보의 다녀온 공연
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312)
        f.checkins[(w["ev"]["id"], w["mem"])] = "2026-10-18T10:05:00.000Z"
        f.rpc_gig_guestbook_write(w["mem"], {"p_code": "K7Q2M", "p_body": "부산 공연 최고였습니다"})
        c = ctx_of(br, f, 1280, 860, session=sess(f, w["mem"])); pg = c.new_page(); fresh(pg, "community.html", 1800)
        d = pg.evaluate("""() => { const a = document.getElementById('cafe-today');
          return {vis: a.checkVisibility(), href: a.getAttribute('href'), txt: a.textContent, router: a.getAttribute('data-router'),
                  gig: (document.querySelector('.cafe-gig') || {}).textContent || ''}; }""")
        t("LXd 사랑방 '오늘 공연' 줄 → /live?e=K7Q2M (라우터 끔) · 실측 '도장 313명' · 공연 방명록 글에 '10.18 부산 KBS홀 공연'",
          d["vis"] and d["href"] == "/live?e=K7Q2M" and d["router"] == "off" and "도장 313명" in d["txt"] and d["gig"] == "10.18 부산 KBS홀 공연", d)
        pg.click("#hm"); pg.wait_for_timeout(1200)
        st = pg.evaluate("[...document.querySelectorAll('#bd-sheet .bd-stamp-mini')].map(x => x.textContent)")
        t("LXe 내 정보 '다녀온 공연' 미니 도장 — '2026.10.18' + 장소", st == ["2026.10.18부산 KBS홀"], st)
        c.close()
        # 탈퇴하면 도장·응원·투표가 함께 지워진다(서버 계약을 가짜 서버가 흉내 — 화면은 탈퇴 경고 문구로 말한다)
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, session=sess(f, w["sprout"])); pg = c.new_page(); fresh(pg, "news.html")
        pg.click("#hm"); pg.wait_for_timeout(1000)
        warn = pg.evaluate("(document.querySelector('#bd-sheet .bd-leave-note') || {}).textContent || ''")
        t("LXf 공연 모드가 켜지면 탈퇴 경고가 '글·댓글·도장·응원·투표 기록이 함께 지워집니다'", warn == "탈퇴하면 글·댓글·도장·응원·투표 기록이 함께 지워집니다.", warn)
        c.close()


# ═══ A — 운영 화면 공연 탭 · QR ═════════════════════════════════════
def admin_session(f, uid):
    s = f.session(uid)
    return {"at": s["access_token"], "rt": s["refresh_token"], "exp": int(time.time() * 1000) + 3600e3, "email": "op@test.local"}


QR_DECODE = """async () => { const svg = document.querySelector('#gg-qr-box svg'); if (!svg) return {err: 'svg 없음'};
  const xml = new XMLSerializer().serializeToString(svg); const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = 600; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 600, 600);
  const det = await new BarcodeDetector({formats: ['qr_code']}).detect(c);
  const vb = svg.getAttribute('viewBox').split(' ').map(Number), d = svg.querySelector('path').getAttribute('d');
  const xs = [...d.matchAll(/M(\\d+),(\\d+)/g)].map(m => [+m[1], +m[2]]);
  return {got: det.map(x => x.rawValue), n: vb[2], minX: Math.min(...xs.map(p => p[0])), minY: Math.min(...xs.map(p => p[1])),
          maxX: Math.max(...xs.map(p => p[0])), maxY: Math.max(...xs.map(p => p[1])),
          bg: svg.querySelector('rect').getAttribute('fill'), fg: svg.querySelector('path').getAttribute('fill')}; }"""


def group_a(br, qr_src=None, only=None):
    def want(k):
        return only is None or k in only
    if want("L11"):
        print("── L11 QR")
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, 1280, 860, conf="{board: true}", admin_session=admin_session(f, w["adm"]), qr_src=qr_src, init_extra="")
        c2 = c
        pg = c.new_page(); E = V.errs_of(pg)
        fresh(pg, "admin.html", 1200)
        pg.click('.adm-tab[data-status="gigs"]'); pg.wait_for_timeout(900)
        pg.click('.gg-row[data-gig="%d"] .btn >> nth=0' % w["ev"]["id"]); pg.wait_for_timeout(600)
        d = pg.evaluate(QR_DECODE)
        url = "https://insooni.com/live?e=K7Q2M"
        t("L11a 운영 화면 QR(SVG) → 다른 해독기(BarcodeDetector·macOS Vision)로 읽으면 '%s' 와 정확히 같다 · 여백 ≥4칸 · 흰 바탕 검은 칸" % url,
          d.get("got") == [url] and d["minX"] >= 4 and d["minY"] >= 4 and d["n"] - 1 - d["maxX"] >= 4 and d["n"] - 1 - d["maxY"] >= 4
          and d["bg"].upper() == "#FFFFFF" and d["fg"] == "#000000", d)
        with pg.expect_download() as dl:
            pg.click("#gg-svg")
        p1 = dl.value
        svg_txt = Path(p1.path()).read_text(encoding="utf-8")
        with pg.expect_download() as dl2:
            pg.click("#gg-png")
        p2 = dl2.value
        png = Path(p2.path()).read_bytes()
        wpx = int.from_bytes(png[16:20], "big") if png[:8] == b"\x89PNG\r\n\x1a\n" else 0
        dd = pg.evaluate("""async (s) => { const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); await img.decode();
          const c = document.createElement('canvas'); c.width = c.height = 800; c.getContext('2d').drawImage(img, 0, 0, 800, 800);
          return (await new BarcodeDetector({formats: ['qr_code']}).detect(c)).map(x => x.rawValue); }""", svg_txt)
        t("L11b 내려받기 — insooni-live-K7Q2M.svg(읽힘) · insooni-live-K7Q2M.png 2048px",
          p1.suggested_filename == "insooni-live-K7Q2M.svg" and dd == [url] and p2.suggested_filename == "insooni-live-K7Q2M.png" and wpx == 2048,
          (p1.suggested_filename, dd, p2.suggested_filename, wpx))
        t("L11c JS 오류 0", not E, E[:2])
        c2.close()

    if want("A1"):
        print("── A1 운영 화면 공연 탭")
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312, {1: 128, 2: 30}, {"거위의 꿈": 58})
        f.posts.append({"id": f.nid(), "uid": w["sprout"], "board": "review", "title": "대기 글", "body": "대기 글 본문", "status": "pending",
                        "created_at": "2026-10-18T10:40:00Z", "gig_id": w["ev"]["id"]})
        c = ctx_of(br, f, 375, 812, conf="{board: true}", admin_session=admin_session(f, w["adm"]), qr_src=qr_src)
        pg = c.new_page(); E = V.errs_of(pg)
        fresh(pg, "admin.html", 1200)
        pg.click('.adm-tab[data-status="gigs"]'); pg.wait_for_timeout(900)
        nums = pg.evaluate("[...document.querySelectorAll('.gg-row[data-gig=\"%d\"] .gg-n')].map(b => +b.textContent)" % w["ev"]["id"])
        lst = f.rpc_admin_gig_list(w["adm"], {})["rows"][0]
        t("A1a 목록 숫자 = admin_gig_list (도장·응원·투표·방명록 대기 %s)" % nums, nums == [lst["checkins"], lst["cheers"], lst["votes"], lst["gb_pending"]] == [312, 158, 58, 1], (nums, lst))
        pg.click('.gg-row[data-gig="%d"] .btn >> nth=0' % w["ev"]["id"]); pg.wait_for_timeout(600)
        hs = pg.evaluate("[...document.querySelectorAll('.gg-knobs .btn')].map(b => [b.textContent, Math.round(b.getBoundingClientRect().height)])")
        t("A1b 375×812 [지금 도장 열기]·[도장 닫기]·[시간대로] 각 ≥56px", len(hs) == 3 and all(h >= 56 for _, h in hs), hs)
        # 지금 상태는 채우지 않는다(주 행동으로 오인) — ✓ + 안쪽 테두리 · '지금: …' 한 줄 · 한글 단어 가운데 줄바꿈 금지(검토 17번)
        kn = pg.evaluate("""() => { const p = document.querySelector('.gg-knobs .btn[aria-pressed=true]');
          return {txt: p ? p.textContent : '', bg: p ? getComputedStyle(p).backgroundColor : '', now: document.getElementById('gg-knob-now').textContent,
                  wb: getComputedStyle(document.body).wordBreak}; }""")
        t("A1b2 눌린 손잡이 '✓ 시간대로' · 바탕 투명 · '지금: 시간대로' · 본문 keep-all",
          kn["txt"] == "✓ 시간대로" and kn["bg"] in ("rgba(0, 0, 0, 0)", "transparent") and kn["now"] == "지금: 시간대로" and kn["wb"] == "keep-all", kn)
        pg.click('.gg-knobs .btn[data-ov="closed"]'); pg.wait_for_timeout(900)
        st = (f.events[0]["override"], pg.get_attribute('.gg-knobs .btn[data-ov="closed"]', "aria-pressed"))
        pg.click("#gg-vote-t"); pg.wait_for_timeout(900)
        t("A1c [도장 닫기] → override closed · 눌린 표시 · [앵콜 투표 닫기] → vote_open false(override 유지)",
          st == ("closed", "true") and f.events[0]["vote_open"] is False and f.events[0]["override"] == "closed", (st, f.events[0]["vote_open"], f.events[0]["override"]))
        # 새 공연 — 기본 시각 · 노래 찾기 · 저장
        pg.click("#gg-new"); pg.wait_for_timeout(300)
        pg.fill("#gg-tko", "인순이 콘서트 서울")
        pg.fill("#gg-vko", "세종문화회관")
        pg.fill("#gg-start", "2026-11-07T19:00")
        pg.dispatch_event("#gg-start", "change")
        dv = pg.evaluate("[document.getElementById('gg-open').value, document.getElementById('gg-close').value, document.getElementById('gg-guest').value]")
        pg.fill("#gg-sq", "거위"); pg.wait_for_timeout(700)
        pg.click("#gg-opts button >> nth=0"); pg.wait_for_timeout(200)
        pg.click("#gg-save"); pg.wait_for_timeout(1200)
        ne = [e for e in f.events if e["title_ko"] == "인순이 콘서트 서울"]
        ok = dv == ["2026-11-07T17:00", "2026-11-07T23:00", "2026-11-10T23:00"] and ne and re.fullmatch(r"[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}", ne[0]["code"]) \
            and ne[0]["starts_at"] == datetime(2026, 11, 7, 10, 0, tzinfo=UTC) and f.vsongs[ne[0]["id"]] == ["거위의 꿈"] and ne[0]["status"] == "draft"
        t("A1d 새 공연 — 시작 19:00 → 도장 17:00 · 닫힘 23:00 · 방명록 +72h(한국 시각 그대로 저장) · 후보곡 · 코드 5자 · 준비 상태",
          ok, (dv, ne and (ne[0]["code"], ne[0]["starts_at"], f.vsongs[ne[0]["id"]], ne[0]["status"])))
        chk = pg.evaluate("[document.querySelectorAll('#gg-check input').length, document.querySelector('.gg-check .gg-hint').textContent]")
        t("A1e 공연 전 점검표 8줄(가입할 길 하나는 있다 포함) · '이 기기에만 저장되는 점검표'", chk[0] == 8 and "이 기기에만 저장되는 점검표" in chk[1], chk)
        t("A1f JS 오류 0 · 가짜 서버가 못 받은 요청 0", not E and not f.unhandled, (E[:2], f.unhandled[:2]))
        c.close()
        # 운영자가 아니면
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, 375, 812, conf="{board: true}", admin_session=admin_session(f, w["mem"]))
        pg = c.new_page(); fresh(pg, "admin.html", 1200)
        d = pg.evaluate("[document.getElementById('adm-app').hidden, document.getElementById('adm-login-msg').textContent, document.getElementById('gg').hidden]")
        t("A1g 운영자가 아니면 공연 탭 없이 forbidden 안내만", d[0] is True and "운영자로 등록되어 있지 않습니다" in d[1] and d[2] is True, d)
        c.close()


# ═══ 뮤테이션 — 검사가 살아 있는지 ════════════════════════════════════
def mutations(br):
    gig = (ROOT / "assets/js/gig.min.js").read_text(encoding="utf-8")
    qr = (ROOT / "assets/js/qr.min.js").read_text(encoding="utf-8")
    MUT = [
        ("도장 단추 잠금 제거(연타가 두 번 요청 — 처리 중 표시·단추 잠금 둘 다)", "gig",
         [("if (S.busy.checkin) return;\nif (needMember", "if (needMember"), ("go.disabled = true;", "")], None, ["L4"]),
        ("숫자 '더 늦게 센 값만' 규칙 제거", "gig", "if (cur && a < cur.at) return;", "", ["L5"]),
        ("숨은 화면에서도 숫자 새로 세기(두 겹의 문 모두)", "gig", [('if (!pollable() || document.visibilityState === "hidden") return;\nvar g = ++pulseGen', "if (!pollable()) return;\nvar g = ++pulseGen"),
                                                         ('if (document.visibilityState === "hidden") { clearTimeout(pollT); pulseGen++; return; }', 'if (document.visibilityState === "hidden") { return; }'),
                                                         ('if (pollable() && document.visibilityState !== "hidden") pollT = setTimeout(pulse, gap());', 'if (pollable()) pollT = setTimeout(pulse, gap());')], None, ["L8"]),
        ("실패해도 간격을 늘리지 않음", "gig", "if (failN) return Math.min(MAX_GAP, base * Math.pow(2, failN));", "", ["L8"]),
        ("다시 열 때마다 도장 등장 모션", "gig", 'show(f, on);\nif (!on) return;', 'show(f, on);\nif (!on) return;\nstampMoment();', ["L4"]),
        ("응원 실패를 되돌리지 않음", "gig", 'if (S.want.cheer[k] !== had) bump("cheers", k, had ? 1 : -1);', "", ["L6"]),
        ("투표 줄을 숫자순으로 다시 세움", "gig", "if (box.children.length !== S.songs.length) {", "S.songs.sort(function (a, b) { return nOf(\"votes\", b.song) - nOf(\"votes\", a.song); });\nbox.textContent = \"\";\nif (true) {", ["L7"]),
        ("글을 치는 동안에도 하단 바", "gig", 'document.body.classList.add("is-typing");', "", ["L9"]),
        ("가입 뒤 이어서 할 일(도장)을 하지 않음", "gig", "var n = M.takeNext(NEXTS);", "var n = null;", ["L10"]),
        ("공연 스위치를 무시(꺼져도 서버에 묻는다)", "gig", "return configured() && conf().board === true && conf().live === true;", "return configured();", ["L1"]),
        ("응원부터 누른 관객에게 도장을 먼저 찍지 않음", "gig", 'var stampFirst = S.phase === "open" && !S.me.checked;', "var stampFirst = false;", ["L15"]),
        ("L8 주 단추가 응원을 건너뛰고 방명록으로", "gig", 'if (S.phrases.length && !touched()) return ["cheers"', 'if (false) return ["cheers"', ["L2"]),
        ("공연 문맥에서 카카오가 없어도 이메일 '처음 가입'을 숨김", "board", "!(gig && conf().liveEmail !== true && kakaoTop)", "!(gig && conf().liveEmail !== true)", ["L14"]),
        # (형식 비트의 정정 수준만 틀리게 적는 뮤테이션은 macOS Vision 이 수준을 바꿔 가며 읽어 내 잡히지 않는다 — 실측.
        #  그래서 해독기가 되살릴 수 없는 '마스크 번호' 를 틀리게 적는다)
        ("QR 형식 비트의 마스크 번호 틀림", "qr", "applyMask(best);\nformat(best);", "applyMask(best);\nformat((best + 1) % 8);", ["L11"]),
    ]
    caught = 0
    board = (ROOT / "assets/js/board.min.js").read_text(encoding="utf-8")
    global BOARD_SRC
    for name, which, a, b, scen in MUT:
        src = gig if which == "gig" else qr if which == "qr" else board
        pairs = a if isinstance(a, list) else [(a, b)]
        bad, skip = src, False
        for aa, bb in pairs:
            n = bad.count(aa)
            if n != 1:
                print("  ⚠ 뮤테이션 '%s' 앵커가 %d번 — 검사기를 고칠 것: %s" % (name, n, aa[:50]))
                skip = True
                break
            bad = bad.replace(aa, bb)
        if skip:
            R.append(("뮤테이션 앵커 " + name, False, "앵커 없음"))
            continue
        before = len(R)
        if which == "gig":
            group_l(br, gig_src=bad, only=set(scen))
        elif which == "board":
            BOARD_SRC = bad
            try:
                group_l(br, only=set(scen))
            finally:
                BOARD_SRC = None
        else:
            group_a(br, qr_src=bad, only=set(scen))
        got = [r for r in R[before:] if not r[1]]
        del R[before:]
        hit = len(got) > 0
        caught += hit
        print(("  ✓ 뮤테이션 잡음: " if hit else "  ✗ 뮤테이션 못 잡음: ") + name + (" ← " + got[0][0] if hit else ""), flush=True)
    return caught, len(MUT)


if __name__ == "__main__":
    t0 = time.time()
    with sync_playwright() as p:
        br = p.chromium.launch()
        try:
            if "L" in GROUPS:
                group_l(br, only=ONLY)
            if "A" in GROUPS or (ONLY and "L11" in ONLY):
                group_a(br, only=ONLY)
            fail = [r for r in R if not r[1]]
            print("\n본 검사: %d/%d 통과 (%.0f초)" % (len(R) - len(fail), len(R), time.time() - t0))
            caught = total = 0
            if not QUICK and not fail:
                print("\n── 뮤테이션")
                caught, total = mutations(br)
                print("뮤테이션: %d/%d 잡음" % (caught, total))
        finally:
            br.close()
    sys.exit(1 if fail or caught != total else 0)
