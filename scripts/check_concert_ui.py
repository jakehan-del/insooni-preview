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


def _tpos_ok(tpos, pad):
    """트랙(background-position-y)이 'calc(100% - Npx)' 이고 N 이 줄의 아래 여백과 같은가(±1px) — 막대와 트랙이 겹친다"""
    m = re.match(r"calc\(100% - ([\d.]+)px\)", tpos or "")
    return bool(m) and abs(float(m.group(1)) - pad) <= 1


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
           reduced=False, hold=None, gig_src=None, qr_src=None, admin_session=None, init_extra="", pop=False):
    mobile = w < 768
    c = br.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, locale="ko-KR",
                       device_scale_factor=1, reduced_motion="reduce" if reduced else "no-preference")
    init = ("window.INSOONI_CONFIG = %s;" % conf) if conf is not None else ""
    init += "try{localStorage.setItem('insooni_fs', '%d');sessionStorage.setItem('insooni_intro','1')}catch(e){}" % {17: 0, 19: 1, 21: 2}[fs]
    # 가입 창 자동 팝업(gig.js autoPop)은 탭마다 한 번 — 다른 검사가 그 창에 가로막히지 않게 기본은 '이미 봤음'.
    # 팝업 자체를 보는 검사만 pop=True
    if not pop:
        init += "try{sessionStorage.setItem('insooni_gig_pop','1')}catch(e){}"
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
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth, hm: document.querySelectorAll('.gig-head .hm:not([hidden])').length}; }"""


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

    if want("L2") or want("L0"):
        # L0 — 8초 뒤 '연결이 느립니다.' + 다시 불러오기
        f, uid, url, conf, hold = setup("L0")
        c = ctx_of(br, f, hold=hold, gig_src=gig_src); pg = c.new_page(); fresh(pg, url, 600)
        early = pg.is_visible("#gig-slow")
        busy0 = pg.evaluate("document.getElementById('main').getAttribute('aria-busy')")
        pg.wait_for_timeout(8200)
        late = pg.evaluate("""[document.getElementById('gig-slow').checkVisibility(), document.getElementById('gig-phase').textContent,
          document.getElementById('gig-retry').getBoundingClientRect().height, document.getElementById('main').getAttribute('aria-busy'),
          document.getElementById('gig-phase').getAttribute('role')]""")
        t("L0 8초 전엔 글자만(aria-busy) · 8초 뒤 상태 줄(role=status) '연결이 느립니다. 아래 '다시 불러오기'…' · aria-busy 풀림 · [다시 불러오기](≥48px)",
          not early and busy0 == "true" and late[0] and late[1] == "연결이 느립니다. 아래 '다시 불러오기'를 눌러 주세요." and late[2] >= 48
          and late[3] is None and late[4] == "status", (early, busy0, late))
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
          return {p: b.getAttribute('aria-pressed'), n: +b.querySelector('.gig-n').textContent, msg: document.getElementById('gig-cheer-msg').textContent,
                  top: document.getElementById('gig-msg').textContent}; }""")
        t("L6c 서버 500 → 원래대로(눌리지 않음 · 96) · 응원 칸 아래(#gig-cheer-msg) 실패 문구 · 위쪽 #gig-msg 는 비어 있음(한 자리)",
          d["p"] == "false" and d["n"] == 96 and "저장되지 않았습니다" in d["msg"] and d["top"] == "", d)
        lab = pg.get_attribute('.gig-chip[data-k="2"]', "aria-label")
        t("L6d 응원 칸 이름표 '{문구}, {n}명' · 칸 높이 ≥ 64px", lab == "앵콜!, 96명" and pg.evaluate("document.querySelector('.gig-chip').getBoundingClientRect().height") >= 64, lab)
        c.close()
        # 로그아웃 상태에서 누르면 회원 창(공연 문맥) + 이어서 할 일
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.click('.gig-chip[data-k="3"]'); pg.wait_for_timeout(900)
        nk = pg.evaluate("JSON.parse(localStorage.getItem('insooni_board_next') || 'null')")
        h = pg.evaluate("(document.querySelector('#bd-sheet .bd-sheet-h') || {}).textContent")
        lede = pg.evaluate("(document.getElementById('bd-sheet-lede') || {}).textContent || ''")
        t("L6e 로그아웃 상태에서 응원 → 회원 창 '응원을 보내려면 회원으로 들어와 주세요' · 소개 '누르신 응원이 바로 더해지고 … 도장도 함께' · 이어서 할 일 {cheer,k:3}",
          pg.is_visible("#bd-sheet") and h == "응원을 보내려면 회원으로 들어와 주세요" and lede.startswith("가입을 마치면 누르신 응원이 바로 더해지고, 오늘 공연 도장도 함께 찍힙니다.")
          and nk and nk.get("what") == "cheer" and nk.get("k") == 3, (h, lede, nk))
        # Esc 로 닫으면 초점이 누른 응원 칸으로(아래 '도장 찍기'로 튀지 않게, 검토 3바퀴 20번)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        fk = pg.evaluate("(() => { const a = document.activeElement; return a ? (a.getAttribute('data-k') || a.id || a.className) : ''; })()")
        pg.click('.gig-song[data-song="친구여"]'); pg.wait_for_timeout(900)
        hv = pg.evaluate("(document.querySelector('#bd-sheet .bd-sheet-h') || {}).textContent")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        fs_ = pg.evaluate("(() => { const a = document.activeElement; return a ? (a.getAttribute('data-song') || a.id || a.className) : ''; })()")
        t("L6f 시트를 Esc 로 닫으면 초점이 누른 칸으로(응원 '3' · 투표 '친구여') · 투표를 누른 사람에게는 '투표하려면 회원으로 들어와 주세요'",
          fk == "3" and fs_ == "친구여" and hv == "투표하려면 회원으로 들어와 주세요", (fk, fs_, hv))
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
        t("L7b 내 선택을 다시 누르면 그대로(취소되지 않음) · 안내는 투표 줄 아래(#gig-vote-msg)", b2 == b and "이미 고르셨습니다" in pg.evaluate("document.getElementById('gig-vote-msg').textContent"), b2)
        bar = pg.evaluate("() => { const b = document.querySelector('.gig-song[data-song=\"밤이면 밤마다\"] .gig-bar-f'); return [b.style.width, getComputedStyle(b).height, getComputedStyle(b).backgroundColor]; }")
        # 막대 4px + 전체 폭 트랙(줄 테두리 대신) · 내 선택 줄도 막대 시작이 같은 x(검토 10·41번)
        tr = pg.evaluate("""() => { const rows = [...document.querySelectorAll('.gig-song')];
          const pb = b => parseFloat(getComputedStyle(b).paddingBottom);
          return {bg: rows.map(b => getComputedStyle(b).backgroundImage.indexOf('gradient') >= 0), bb: rows.map(b => getComputedStyle(b).borderBottomWidth),
                  x: [...new Set(rows.map(b => Math.round(b.querySelector('.gig-bar-f').getBoundingClientRect().left)))],
                  pressed: rows.filter(b => b.getAttribute('aria-pressed') === 'true').length,
                  /* 막대 아랫변 = 줄 아랫변 − 아래 여백(트랙 자리) · 그 여백 ≥ 12px(다음 줄과 경계선으로 읽히지 않게) */
                  gap: rows.map(b => Math.round(b.getBoundingClientRect().bottom - b.querySelector('.gig-bar-f').getBoundingClientRect().bottom)),
                  pad: rows.map(b => Math.round(pb(b))),
                  tpos: getComputedStyle(rows[0]).backgroundPositionY}; }""")
        t("L7c 막대 2px · .55 · 가장 많은 곡 100% · 줄마다 트랙(테두리 0) · 막대 아랫변이 줄 바닥에서 ≥12px 띄워져 트랙과 같은 높이 · 막대 시작 x 하나",
          float(bar[0].rstrip("%")) == 100 and bar[1] == "2px" and bar[2] == "rgba(243, 239, 231, 0.55)" and all(tr["bg"]) and set(tr["bb"]) == {"0px"}
          and len(tr["x"]) == 1 and tr["pressed"] == 1 and all(g >= 12 and abs(g - p) <= 1 for g, p in zip(tr["gap"], tr["pad"]))
          and _tpos_ok(tr["tpos"], tr["pad"][0]), (bar, tr))
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
        # 카카오를 끈 배포(KOE 가 다시 나 kakao=false 로 되돌린 경우) — 이메일 '처음 가입'이 열리고 없는 카카오를 권하지 않는다(검토 26·33·49번).
        # config.js 의 기본값이 kakao=true 로 바뀌었으므로(2f99dab) 끔을 명시한다
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, 375, 812, conf="{board: true, live: true, kakao: false}", gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        note = pg.evaluate("(() => { const n = document.getElementById('gig-mailnote'); return n.checkVisibility() ? n.textContent : ''; })()")
        pg.click("#gig-go"); pg.wait_for_timeout(1100)
        d = pg.evaluate("""() => { const s = document.getElementById('bd-sheet');
          return {tabs: [...s.querySelectorAll('.bd-tab')].map(b => b.textContent), kakao: s.querySelectorAll('.bd-kakao').length,
                  txt: s.innerText, pressed: (s.querySelector('.bd-tab[aria-pressed=true]') || {}).textContent || ''}; }""")
        t("L14a conf {board, live, kakao:false} — L5 아래 '가입은 이메일로' 한 줄 · 회원 창에 '처음 가입' 탭(먼저 열림) · 카카오 단추 0 · '카카오' 문구 0",
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
        # 카카오 화면에서 코드 없이 돌아왔다(동의 화면에서 뒤로 · 인앱 창 닫고 QR 다시) — 원인을 단정하지 않는다.
        # KOE 가 고쳐진 오늘은 망설이다 뒤로 간 사람이 대부분이다: 공연 화면에서는 노란 '카카오로 시작하기'가 그대로 맨 위,
        # 혹시 KOE 였을 때를 위해 접힌 이메일 칸에 '처음 가입'도 연다. 10분 내림(insooni_kakao_fail_at)은 걸지 않는다(검토 3바퀴 35번)
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, 375, 812, gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.evaluate("localStorage.setItem('insooni_pkce', JSON.stringify({v: 'x', p: 'kakao', at: Date.now()}))")
        fresh(pg, "live?e=K7Q2M", 1800)
        d = pg.evaluate("""() => { const s = document.getElementById('bd-sheet'); if (!s || s.hidden) return null; const k = s.querySelector('.bd-kakao');
          const det = s.querySelector('details.bd-mail'); if (det) det.open = true;
          return {h: s.querySelector('.bd-sheet-h').textContent, al: [...s.querySelectorAll('[role=alert]')].map(a => a.textContent),
                  foc: document.activeElement && document.activeElement.className, low: !!k && k.classList.contains('bd-kakao--low'),
                  yellow: !!k && getComputedStyle(k).backgroundColor === 'rgb(254, 229, 0)', ktxt: k ? k.textContent : '',
                  tabs: [...s.querySelectorAll('.bd-tab')].map(b => b.textContent), mark: sessionStorage.getItem('insooni_kakao_fail_at'),
                  pk: localStorage.getItem('insooni_pkce')}; }""")
        t("L14d /live 카카오에서 코드 없이 돌아옴 — 공연 제목 · 안내 1개('끝나지 않았습니다 … KOE') · 첫 초점 안내 · 노란 '카카오로 시작하기' 그대로 · 접힌 이메일에 '처음 가입' · 10분 내림 없음 · 검증값 지움",
          d is not None and d["h"] == "도장을 남기려면 회원으로 들어와 주세요" and len(d["al"]) == 1 and "끝나지 않았습니다" in d["al"][0] and "KOE" in d["al"][0]
          and d["foc"] == "bd-alert" and not d["low"] and d["yellow"] and d["ktxt"] == "카카오로 시작하기" and "처음 가입" in d["tabs"]
          and d["mark"] is None and d["pk"] is None, d)
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
        ph = pg.evaluate("document.getElementById('gig-phase').textContent")
        # 인사와 한 일은 한 자리(#gig-phase)에 한 문장 — #gig-msg 의 인사를 도장이 13ms 만에 지우고 같은 말이 두 영역에서
        # 이어서 낭독되던 것(검토 4바퀴 15번). #gig-msg 는 비어 있어야 한다
        t("L15 응원 '사랑해요' → 가입 마치고 도장 찍기 → 도장 1 · 응원 1 · #gig-phase '응원먼저 님, 어서 오세요. 도장을 찍고 「사랑해요」 응원을 보냈습니다.' · #gig-msg 비어 있음",
          jb == "가입 마치고 도장 찍기" and chk and ch and ph == "응원먼저 님, 어서 오세요. 도장을 찍고 「사랑해요」 응원을 보냈습니다." and msg == "", (jb, chk, ch, ph, msg))
        c.close()
        # 낭독 기록 — 가입을 마친 뒤 두 polite 영역(#gig-phase · #gig-msg)에 쓰인 글을 시간 순서로. 같은 말('도장을 찍')이 두 번 나오면 안 된다
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312, {1: 128})
        c = ctx_of(br, f, session=sess(f, w["kakao"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.evaluate("""() => { window.__said = []; const rec = (id) => new MutationObserver(() => { const tx = document.getElementById(id).textContent; if (tx) window.__said.push(id + ':' + tx); })
          .observe(document.getElementById(id), {childList: true, characterData: true, subtree: true}); rec('gig-phase'); rec('gig-msg'); }""")
        pg.click('.gig-chip[data-k="1"]'); pg.wait_for_timeout(900)
        pg.fill("#bd-jn", "가입관객"); pg.check("#bd-jall")
        pg.click("#bd-sheet form .btn--solid"); pg.wait_for_timeout(2600)
        said = pg.evaluate("window.__said")
        stamped = [x for x in said if "도장을 찍" in x]
        hello = [x for x in said if "어서 오세요" in x]
        t("L15b 가입 전 카카오 회원 응원 → 가입 — 낭독 영역에 '도장을 찍…' 한 번 · 인사 한 번(같은 문장 안) · #gig-msg 에는 아무것도 쓰지 않음 %s" % said,
          len(stamped) == 1 and len(hello) == 1 and stamped[0] == hello[0] and stamped[0].startswith("gig-phase:") and not [x for x in said if x.startswith("gig-msg:")], said)
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

    if want("L17"):
        print("── L17 실패 문구는 누른 자리 곁에 — 낮은 폰 · 인앱 크기에서도 보인다(검토 3바퀴 10·17번)")
        # 붐비는 LTE 에서 도장·투표·응원이 실패했을 때, 문구가 화면 밖(위 500px)이나 고정 하단 바 뒤(보이는 픽셀 0)에
        # 뜨면 어르신 눈에는 아무 일도 없다. 문구의 '보이는 높이'가 문구 높이와 같아야 한다(머리 아래 ~ 바 위, 바 안이면 화면 안)
        MV = """(want) => { const spots = [...document.querySelectorAll('#gig-msg, #gig-bar-msg, .gig-act-msg')].filter(n => n.textContent.indexOf(want) >= 0);
          if (spots.length !== 1) return {n: spots.length};
          const m = spots[0], r = m.getBoundingClientRect(), bar = document.getElementById('gig-bar');
          const hb = document.querySelector('.gig-head').getBoundingClientRect().bottom, inBar = bar.contains(m);
          const barOn = bar.checkVisibility() && getComputedStyle(bar).position === 'fixed';
          const lim = inBar || !barOn ? innerHeight : bar.getBoundingClientRect().top;
          const vis = Math.max(0, Math.min(r.bottom, lim) - Math.max(r.top, hb));
          const hit = document.elementFromPoint(r.left + Math.min(24, r.width / 2), r.top + r.height / 2);
          return {n: 1, id: m.id, h: Math.round(r.height), vis: Math.round(vis), hit: !!hit && (hit === m || m.contains(hit)), top: Math.round(r.top)}; }"""
        bad, seen = [], 0
        for (wd, ht, fs) in ((375, 560, 17), (360, 600, 17), (390, 664, 17), (375, 667, 21), (360, 640, 21)):
            for act in ("checkin", "vote", "cheer"):
                f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312, {1: 128, 2: 96}, {"거위의 꿈": 58})
                if act != "checkin":
                    f.checkins[(w["ev"]["id"], w["mem"])] = iso(f.now)
                c = ctx_of(br, f, wd, ht, fs=fs, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
                f.http_fail["gig_" + act] = 1
                if act == "checkin":
                    pg.click("#gig-go")
                elif act == "vote":
                    pg.click('.gig-song[data-song="친구여"]')
                else:
                    pg.click('.gig-chip[data-k="2"]')
                pg.wait_for_timeout(1300)
                d = pg.evaluate(MV, "저장되지 않았습니다")
                seen += 1
                if not (d.get("n") == 1 and d["h"] > 0 and d["vis"] >= d["h"] - 1 and d["hit"]):
                    bad.append((wd, ht, fs, act, d))
                c.close()
        t("L17 5화면(375×560·360×600·390×664 /17 · 375×667·360×640 /21) × 도장·투표·응원 500 — 실패 문구가 한 자리에 · 보이는 높이 = 문구 높이 · 가려지지 않음 (%d장면)" % seen,
          not bad and seen == 15, bad[:4])

    if want("L18"):
        print("── L18 방명록 — 빈 칸 오류는 '남기기' 바로 위 · 자판이 올라와도 '남기기'가 보인다(검토 3바퀴 11·17번)")
        bad = []
        for (wd, ht, fs) in ((390, 664, 17), (375, 667, 21), (360, 640, 21)):
            f = GigFake(); w = seed(f); f.checkins[(w["ev"]["id"], w["mem"])] = iso(f.now)
            c = ctx_of(br, f, wd, ht, fs=fs, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
            pg.evaluate("document.getElementById('gig-gb-go').scrollIntoView({block: 'center'})"); pg.wait_for_timeout(200)
            pg.click("#gig-gb-go"); pg.wait_for_timeout(600)
            d = pg.evaluate("""() => { const e = document.getElementById('gig-gb-err'), r = e.getBoundingClientRect(), ta = document.getElementById('gig-gb-ta');
              const hb = document.querySelector('.gig-head').getBoundingClientRect().bottom;
              const hit = document.elementFromPoint(r.left + 24, r.top + r.height / 2);
              return {txt: e.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), hb: Math.round(hb), ih: innerHeight,
                      hit: !!hit && (hit === e || e.contains(hit)), inv: ta.getAttribute('aria-invalid'), db: ta.getAttribute('aria-describedby') || '',
                      foc: document.activeElement && document.activeElement.id, top2: document.getElementById('gig-msg').textContent}; }""")
            pg.type("#gig-gb-ta", "좋")
            d2 = pg.evaluate("[document.getElementById('gig-gb-ta').getAttribute('aria-invalid'), document.getElementById('gig-gb-err').textContent]")
            if not (d["txt"] == "두 글자 이상 적어 주세요." and d["top"] >= d["hb"] and d["bottom"] <= d["ih"] and d["hit"] and d["inv"] == "true"
                    and "gig-gb-err" in d["db"] and "gig-gb-hint" in d["db"] and d["foc"] == "gig-gb-ta" and d["top2"] == "" and d2 == [None, ""]):
                bad.append((wd, ht, fs, d, d2))
            c.close()
        t("L18a 390×664/17 · 375×667/21 · 360×640/21 빈 칸 '남기기' → '두 글자 이상…'이 #gig-gb-err(화면 안·가려지지 않음) · aria-invalid · describedby(err+hint) · 초점 글칸 · 치면 풀림",
          not bad, bad[:3])
        def kb(wd, ht, fs, vvh):
            f = GigFake(); w = seed(f); f.checkins[(w["ev"]["id"], w["mem"])] = iso(f.now)
            c = ctx_of(br, f, wd, ht, fs=fs, session=sess(f, w["mem"]), gig_src=gig_src,
                       init_extra="Object.defineProperty(window, 'visualViewport', {configurable: true, get: () => ({height: %d, offsetTop: 0, width: %d})});" % (vvh, wd))
            pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
            pg.evaluate("document.getElementById('gig-gb-ta').scrollIntoView({block: 'start'})"); pg.wait_for_timeout(150)
            pg.focus("#gig-gb-ta"); pg.wait_for_timeout(500)
            d = pg.evaluate("""() => { const g = document.getElementById('gig-gb-go').getBoundingClientRect(), ta = document.getElementById('gig-gb-ta').getBoundingClientRect(),
              hint = document.getElementById('gig-gb-hint').getBoundingClientRect();
              return {go: Math.round(g.bottom), taB: Math.round(ta.bottom), taT: Math.round(ta.top), hintAbove: hint.bottom <= ta.top,
                      gap: Math.round(g.bottom - ta.bottom)}; }""")
            c.close()
            return d
        badk = []
        for (wd, ht, fs) in ((390, 664, 17), (375, 667, 21)):
            d = kb(wd, ht, fs, 330)
            if not (d["go"] <= 330 and d["taB"] > 56 and d["hintAbove"]):
                badk.append((wd, ht, fs, d))
        t("L18b 390×664/17 · 375×667/21 · 자판(보이는 높이 330) + 글칸 초점 → '남기기' bottom ≤ 330 · 글칸이 머리 아래에 보임 · 등급 문장은 글칸 위", not badk, badk)

    if want("L19"):
        print("── L19 상태 줄(role=status)은 같은 글이면 다시 쓰지 않는다(검토 3바퀴 19번)")
        f = GigFake(); w = seed(f); f.poll_s = 5
        c = ctx_of(br, f, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M", 900)
        pg.evaluate("""() => { window.__ph = 0; new MutationObserver(m => { window.__ph += m.length; })
          .observe(document.getElementById('gig-phase'), {childList: true, characterData: true, subtree: true}); }""")
        k0 = len(rpc_calls(c, "gig_pulse"))
        pg.wait_for_timeout((f.poll_s * 2 + 4) * 1000)
        k1 = len(rpc_calls(c, "gig_pulse")) - k0
        n = pg.evaluate("window.__ph")
        t("L19 L7 poll_s 5 × 2회 이상(gig_pulse %d회) 동안 #gig-phase 변이 %d — 0이어야 한다" % (k1, n), k1 >= 2 and n == 0, (k1, n))
        c.close()

    if want("L20"):
        print("── L20 공연 가입 시트 — 동의 없이 '가입 마치고 도장 찍기' → 동의 칸 바로 아래 문구(검토 3바퀴 18번)")
        bad = []
        for (wd, ht, fs) in ((360, 640, 21), (375, 667, 21), (320, 568, 21)):
            f = GigFake(); w = seed(f)
            c = ctx_of(br, f, wd, ht, fs=fs, session=sess(f, w["kakao"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
            pg.click("#gig-go"); pg.wait_for_timeout(900)
            pg.click("#bd-sheet form .btn--solid"); pg.wait_for_timeout(600)
            d = pg.evaluate("""() => { const e = document.getElementById('bd-jerr'); if (!e) return null; const r = e.getBoundingClientRect();
              const c1 = document.getElementById('bd-ja'), hit = document.elementFromPoint(r.left + 24, r.top + r.height / 2);
              const vv = window.visualViewport ? visualViewport.height : innerHeight;
              return {txt: e.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: Math.round(vv), hit: !!hit && (hit === e || e.contains(hit)),
                      inv: c1.getAttribute('aria-invalid'), db: c1.getAttribute('aria-describedby'), foc: document.activeElement && document.activeElement.id,
                      c1top: Math.round(c1.getBoundingClientRect().top)}; }""")
            if not (d and d["txt"] == "위의 '모두 동의합니다'를 눌러 주세요." and d["top"] >= 0 and d["bottom"] <= d["vh"] and d["hit"]
                    and d["inv"] == "true" and d["db"] == "bd-jerr" and d["foc"] == "bd-ja" and 0 <= d["c1top"] <= d["vh"]):
                bad.append((wd, ht, fs, d))
            c.close()
        t("L20 /live 가입 시트 360×640·375×667·320×568 × 21px — 동의 없이 주 단추 → \"위의 '모두 동의합니다'를 눌러 주세요.\"가 화면 안(가려지지 않음) · 초점 동의 칸(화면 안) · aria-invalid · describedby", not bad, bad)

    if want("L21"):
        print("── L21 공연 머리 · 누르는 칸 테두리 · 정직성 문구 크기")
        bad = []
        for wd in (320, 360, 375, 390):
            for fs in (17, 21):
                for who, lg in (("out", None), ("mem", None), ("out", "en"), ("mem", "en")):
                    f = GigFake(); w = seed(f)
                    c = ctx_of(br, f, wd, 700, fs=fs, lang=lg, session=sess(f, w["mem"]) if who == "mem" else None, gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M", 1500 if lg else 1300)
                    d = pg.evaluate("""() => { const tools = [...document.querySelectorAll('.gig-head .header-tools > *')].filter(e => e.checkVisibility());
                      const lt = document.querySelector('.gig-head .lang-toggle'), ltOn = lt && lt.checkVisibility();
                      return {right: Math.max(...tools.map(e => e.getBoundingClientRect().right)), iw: innerWidth,
                              lang: ltOn ? parseFloat(getComputedStyle(lt).fontSize) : 0, root: parseFloat(getComputedStyle(document.documentElement).fontSize),
                              tail: document.querySelector('.gig-tail-lang').checkVisibility(), brandGap: Math.round(Math.min(...tools.map(e => e.getBoundingClientRect().left)) - document.querySelector('.gig-brand').getBoundingClientRect().right)}; }""")
                    why = []
                    if d["right"] > d["iw"] - 8: why.append("도구 right %.1f" % d["right"])
                    if d["lang"] and abs(d["lang"] - .74 * d["root"]) > .2: why.append("EN %.2fpx" % d["lang"])
                    if not d["lang"] and not d["tail"]: why.append("EN 이 어디에도 없음")
                    if d["brandGap"] < 8: why.append("상표 간격 %d" % d["brandGap"])
                    if why:
                        bad.append((wd, fs, who, lg, " · ".join(why)))
                    c.close()
        t("L21a /live 머리 320·360·375·390 × 17/21 × 로그아웃·회원 × 한국어·영어 — 도구 right ≤ 폭−8 · 상표 간격 ≥8 · EN 글자 .74rem(글자 크기를 따른다) · EN 이 숨으면 꼬리에 'English'", not bad, bad[:4])
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312, {1: 3})
        c = ctx_of(br, f, 375, 812, session=sess(f, w["sprout"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        d = pg.evaluate("""() => { const cs = q => getComputedStyle(document.querySelector(q)); const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
          const starts = [...document.querySelectorAll('.gig-start')].map(b => Math.round(b.getBoundingClientRect().width));
          return {chip: cs('.gig-chip:not([aria-pressed="true"])').borderTopColor, start: cs('.gig-start').borderTopColor, starts: starts,
                  note: [cs('#gig-count-note').color, parseFloat(cs('#gig-count-note').fontSize) / root, cs('#gig-vote-n').color, parseFloat(cs('#gig-vote-n').fontSize) / root],
                  fsb: cs('.gig-head .fs-toggle .fs-b').opacity}; }""")
        t("L21b 누르는 칸 테두리 .42(응원 칸·시작 문장) · 시작 문장 3칸 같은 폭 · 정직성 문구 .95rem·muted · [가] 작은 글자 불투명도 .8",
          d["chip"] == "rgba(243, 239, 231, 0.42)" and d["start"] == "rgba(243, 239, 231, 0.42)" and len(set(d["starts"])) == 1 and len(d["starts"]) == 3
          and d["note"][0] == "rgb(179, 169, 156)" and abs(d["note"][1] - .95) < .01 and d["note"][2] == "rgb(179, 169, 156)" and abs(d["note"][3] - .95) < .01
          and d["fsb"] == "0.8", d)
        c.close()

    if want("L22"):
        print("── L22 공연장 한 바퀴 — QR → 카카오 가입 → 도장 → 응원 → 투표 → 방명록 (360×640 × 17/21 · 느린 회선 · 자판)")
        # 오늘(10/3 진해) 관객의 실제 순서를 사람처럼 끝까지. 단계마다 '누를 것이 화면 안에 보이는가'를 잰다.
        # 자판은 visualViewport 높이를 흉내(방명록 단계에서만 330 — 회원 창 단계에서 줄이면 시트도 줄어든다)
        VVJS = "window.__vvh = 0; Object.defineProperty(window, 'visualViewport', {configurable: true, get: () => ({height: window.__vvh || innerHeight, offsetTop: 0, width: innerWidth})});"
        INV = """(sel) => { const e = document.querySelector(sel); if (!e || !e.checkVisibility()) return false; const r = e.getBoundingClientRect();
          const vh = window.visualViewport ? visualViewport.height : innerHeight; if (r.top < 0 || r.bottom > vh) return false;
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === e || e.contains(hit)); }"""
        bad = []
        for fs in (17, 21):
            f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312, {1: 128}, {"거위의 꿈": 30})
            nk = f.add_user(None, None, "kakao", {"nickname": "진해관객"}, True)     # 명부에 없는 카카오 계정(처음 온 관객)
            c = ctx_of(br, f, 360, 640, fs=fs, gig_src=gig_src, init_extra=VVJS); pg = c.new_page(); E = V.errs_of(pg)
            cdp = c.new_cdp_session(pg)
            cdp.send("Network.enable")
            cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 200, "downloadThroughput": 1.2e6 / 8, "uploadThroughput": 0.6e6 / 8})
            steps = []
            def step(name, ok, info=None):
                steps.append((name, bool(ok), info))
            fresh(pg, "live?e=K7Q2M", 2500)
            step("1 도장 찍기 보임", pg.evaluate(INV, "#gig-go") and pg.evaluate("document.getElementById('gig-go').textContent") == "도장 찍기")
            pg.click("#gig-go"); pg.wait_for_timeout(1500)
            step("2 회원 창 · 노란 카카오 보임", pg.evaluate(INV, "#bd-sheet .bd-kakao"))
            with pg.expect_navigation(timeout=15000):
                pg.click("#bd-sheet .bd-kakao")
            pg.wait_for_timeout(3500)
            step("3 돌아오면 '가입 마치고 도장 찍기'", pg.evaluate("(document.querySelector('#bd-sheet form .btn--solid') || {}).textContent || ''") == "가입 마치고 도장 찍기")
            pg.check("#bd-jall")
            pg.evaluate("document.querySelector('#bd-sheet form .btn--solid').scrollIntoView({block: 'nearest'})"); pg.wait_for_timeout(200)
            step("4 주 단추 보임", pg.evaluate(INV, "#bd-sheet form .btn--solid"))
            pg.click("#bd-sheet form .btn--solid"); pg.wait_for_timeout(4000)
            d = pg.evaluate(GIG)
            step("5 도장 찍힘(L8) · 313", d["stamp"] and d["L"] == "L8" and d["n"] == "313", d)
            step("6 바 '응원 보내기' 보임", pg.evaluate(INV, "#gig-go") and pg.evaluate("document.getElementById('gig-go').textContent") == "응원 보내기")
            pg.click("#gig-go"); pg.wait_for_timeout(900)
            pg.click('.gig-chip[data-k="1"]'); pg.wait_for_timeout(1500)
            step("7 응원 '사랑해요' 눌림", pg.get_attribute('.gig-chip[data-k="1"]', "aria-pressed") == "true")
            pg.evaluate("document.querySelector('.gig-song[data-song=\"거위의 꿈\"]').scrollIntoView({block: 'center'})"); pg.wait_for_timeout(200)
            pg.click('.gig-song[data-song="거위의 꿈"]'); pg.wait_for_timeout(1500)
            step("8 투표 '거위의 꿈' 눌림", pg.get_attribute('.gig-song[data-song="거위의 꿈"]', "aria-pressed") == "true")
            pg.evaluate("scrollTo(0, 0)"); pg.wait_for_timeout(300)
            step("9 바 '방명록 남기기' 보임", pg.evaluate(INV, "#gig-go") and pg.evaluate("document.getElementById('gig-go').textContent") == "방명록 남기기")
            pg.evaluate("window.__vvh = 330")       # 자판이 올라온다
            pg.click("#gig-go"); pg.wait_for_timeout(1200)
            pg.keyboard.type("진해에서 처음 봤어요. 고맙습니다")
            pg.wait_for_timeout(300)
            step("10 글칸 초점 · 자판 위로 '남기기' 보임", pg.evaluate("document.activeElement && document.activeElement.id") == "gig-gb-ta" and pg.evaluate(INV, "#gig-gb-go"),
                 pg.evaluate("Math.round(document.getElementById('gig-gb-go').getBoundingClientRect().bottom)"))
            pg.click("#gig-gb-go"); pg.wait_for_timeout(2500)
            pg.evaluate("window.__vvh = 0; document.activeElement && document.activeElement.blur()"); pg.wait_for_timeout(400)
            done = pg.evaluate("document.getElementById('gig-gb-done').textContent")
            step("11 방명록 '받았습니다. 확인한 뒤 올라갑니다.'", done == "받았습니다. 확인한 뒤 올라갑니다.", done)
            ev = w["ev"]["id"]
            uid = [nk] if nk in f.members else []
            srv = {"checkin": bool(uid) and (ev, uid[0]) in f.checkins, "cheer": bool(uid) and (ev, uid[0], 1) in f.cheers,
                   "vote": bool(uid) and f.votes.get((ev, uid[0])) == "거위의 꿈",
                   "post": bool(uid) and any(p.get("gig_id") == ev and p["uid"] == uid[0] and p["status"] == "pending" for p in f.posts)}
            step("12 서버: 도장·응원·투표·방명록(확인 중) 각 1 · JS 오류 0 · 못 받은 요청 0", all(srv.values()) and not E and not f.unhandled, (srv, E[:2], f.unhandled[:2]))
            fails = [x for x in steps if not x[1]]
            if fails or len(steps) != 12:
                bad.append((fs, fails[:3], len(steps)))
            c.close()
        t("L22 공연장 한 바퀴 360×640 × 17/21 (1.2Mbps·RTT 200ms · 자판 330) — 12단계 모두 화면 안에서 눌리고 서버에 남는다", not bad, bad)

    if want("L23"):
        print("── L23 검토 4바퀴 — 숫자 안내 · 꺼짐 링크 · 창 제목 · 키보드 초점 · 카카오 토큰 실패 · 시작 전 가입 · 도장 줄 · 글자 · 언어 · 자판")
        # 자판 흉내 — 보이는 화면(visualViewport)을 줄이고 resize 를 쏜다(iOS·안드로이드 크롬처럼 innerHeight 는 그대로)
        VVE = """(() => { const et = new EventTarget(); window.__vvH = null;
          const o = { get height() { return window.__vvH || window.innerHeight; }, get width() { return window.innerWidth; }, offsetTop: 0, offsetLeft: 0, pageTop: 0, scale: 1,
            addEventListener: (a, b, c) => et.addEventListener(a, b, c), removeEventListener: (a, b, c) => et.removeEventListener(a, b, c) };
          Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => o });
          window.__kb = (h) => { window.__vvH = h; et.dispatchEvent(new Event('resize')); }; })();"""
        # a — 도장 마감 뒤(after)에는 '몇 초마다 새로 셉니다'라고 하지 않는다(검토 4바퀴 7·22번)
        notes = {}
        for state in ("L7", "L9", "L10"):
            f, uid, url, conf, hold = setup(state)
            c = ctx_of(br, f, conf=conf, session=sess(f, uid) if uid else None, gig_src=gig_src); pg = c.new_page(); fresh(pg, url)
            notes[state] = pg.evaluate("(() => { const n = document.getElementById('gig-count-note'); return n.checkVisibility() ? n.textContent : null; })()")
            c.close()
        t("L23a 숫자 안내 — L7 '15초마다' · L9 '도장 찍기가 끝난 뒤의 숫자입니다.'('15초' 없음) · L10 '최종 숫자'",
          notes["L7"] and "15초마다" in notes["L7"] and notes["L9"] == "도장 찍기가 끝난 뒤의 숫자입니다." and notes["L10"] == "공연이 끝난 뒤의 최종 숫자입니다.", notes)
        # b — 스위치 꺼짐: '사랑방으로' 링크는 하나(같은 이름·같은 곳이 연달아 두 번 보이고 두 번 읽혔다, 검토 4바퀴 24·27번)
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, conf="{board: true, kakao: true}", gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        d = pg.evaluate("""() => [...document.querySelectorAll('#main a')].filter(a => a.checkVisibility({checkVisibilityCSS: true})).map(a => a.textContent.trim())""")
        t("L23b live 꺼짐 — 보이는 링크 중 '사랑방으로' 정확히 1개 %s" % d, d.count("사랑방으로") == 1 and len(d) == 3, d)
        c.close()
        # c — 로그아웃 회원 창의 제목·첫 문장이 창을 연 목적·지금 단계와 맞다(검토 4바퀴 12번)
        sh = {}
        for state, sel in (("L9", "#gig-gb-login"), ("L9", "#hm"), ("L10", "#hm"), ("L4", "#hm"), ("L5", "#gig-gb-login")):
            f, uid, url, conf, hold = setup(state)
            c = ctx_of(br, f, conf=conf, gig_src=gig_src); pg = c.new_page(); fresh(pg, url)
            pg.click(sel); pg.wait_for_timeout(900)
            sh[state + sel] = pg.evaluate("""() => { const s = document.getElementById('bd-sheet'); if (!s || s.hidden) return null;
              return [s.querySelector('.bd-sheet-h').textContent, (document.getElementById('bd-sheet-lede') || {}).textContent || '']; }""")
            c.close()
        ok = (sh["L9#gig-gb-login"] and sh["L9#gig-gb-login"][0] == "방명록을 남기려면 회원으로 들어와 주세요" and sh["L9#gig-gb-login"][1].startswith("가입을 마치면 이 화면에서 바로 한 줄 남길 수 있습니다.")
              and sh["L5#gig-gb-login"] and sh["L5#gig-gb-login"][0] == "방명록을 남기려면 회원으로 들어와 주세요"
              and all(sh[k] and sh[k][0] == "로그인 · 회원가입" for k in ("L9#hm", "L10#hm", "L4#hm"))
              and all("도장" not in sh[k][1] for k in ("L9#gig-gb-login", "L9#hm", "L10#hm"))
              and sh["L4#hm"][1].startswith("미리 가입해 두시면 도장이 열릴 때"))
        t("L23c 로그아웃 창 — 방명록 단추(L9·L5) '방명록을 남기려면…' · 머리 입구 L9·L10·L4 '로그인 · 회원가입'(도장 없음) · L9·L10 첫 문장에 '도장' 없음 · L4 '미리 가입해 두시면…'", ok, sh)
        # d — 키보드로 '도장 찍기'·'남기기'를 누르면 초점이 그 자리에 남는다(문서로 떨어지지 않는다, 검토 4바퀴 13번)
        foc = {}
        for fail in (False, True):
            f, uid, url, conf, hold = setup("L7")
            if fail:
                f.http_fail["gig_checkin"] = 1
            c = ctx_of(br, f, conf=conf, session=sess(f, uid), gig_src=gig_src); pg = c.new_page(); fresh(pg, url)
            pg.focus("#gig-go"); pg.keyboard.press("Enter")
            seen = []
            for ms_ in (30, 170, 600, 700):
                pg.wait_for_timeout(ms_)
                seen.append(pg.evaluate("document.activeElement === document.body ? 'BODY' : (document.activeElement.id || document.activeElement.tagName)"))
            foc["fail" if fail else "ok"] = (seen, pg.evaluate(GIG)["stamp"])
            c.close()
        f, uid, url, conf, hold = setup("L8")
        c = ctx_of(br, f, conf=conf, session=sess(f, uid), gig_src=gig_src); pg = c.new_page(); fresh(pg, url)
        pg.fill("#gig-gb-ta", "키보드로 남깁니다")
        pg.focus("#gig-gb-go"); pg.keyboard.press("Enter"); pg.wait_for_timeout(1500)
        foc["gb"] = pg.evaluate("document.activeElement === document.body ? 'BODY' : (document.activeElement.id || document.activeElement.tagName)")
        c.close()
        t("L23d Enter 로 '도장 찍기'(성공·서버 500) → 30ms~1.5s 내내 초점 #gig-go · 방명록 '남기기' Enter → 초점 '한 줄 더 남기기'",
          all(x == "gig-go" for x in foc["ok"][0]) and foc["ok"][1] and all(x == "gig-go" for x in foc["fail"][0]) and not foc["fail"][1] and foc["gb"] == "gig-gb-again-b", foc)
        # e — 카카오 왕복 뒤 토큰 교환 실패(429 요청 한도 · 500) — 카카오 사람의 말 · 카카오 단추가 주 단추(검토 4바퀴 26번)
        class TokFake(GigFake):
            mode = "429"
            def handle(self, route):
                u = urlparse(route.request.url)
                if u.path == "/auth/v1/token" and parse_qs(u.query).get("grant_type", [""])[0] == "pkce":
                    self.calls.append(("auth:pkce", self.mode))
                    if self.mode == "429":
                        return route.fulfill(status=429, content_type="application/json",
                                             body=json.dumps({"code": 429, "error_code": "over_request_rate_limit", "msg": "Request rate limit reached"}))
                    return route.fulfill(status=500, content_type="application/json", body='{"message":"boom"}')
                return super().handle(route)
        tok = {}
        for mode in ("429", "500"):
            f = TokFake(); f.mode = mode; w = seed(f)
            c = ctx_of(br, f, gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
            pg.click("#gig-go"); pg.wait_for_timeout(900)
            with pg.expect_navigation(timeout=10000):
                pg.click("#bd-sheet .bd-kakao")
            pg.wait_for_timeout(2500)
            tok[mode] = pg.evaluate("""() => { const s = document.getElementById('bd-sheet'); if (!s || s.hidden) return null; const k = s.querySelector('.bd-kakao');
              return {al: [...s.querySelectorAll('[role=alert]')].map(a => a.textContent), txt: s.innerText,
                      low: !!k && k.classList.contains('bd-kakao--low'), yellow: !!k && getComputedStyle(k).backgroundColor === 'rgb(254, 229, 0)'}; }""")
            c.close()
        ok = all(tok[m] and tok[m]["al"] == ["카카오 로그인을 마치지 못했습니다. 잠시 뒤 카카오로 다시 시작해 주세요."] and not tok[m]["low"] and tok[m]["yellow"]
                 and "메일을 보낼" not in tok[m]["txt"] and "링크가 만료" not in tok[m]["txt"] for m in tok)
        t("L23e 카카오 → token 429·500 — 안내 '카카오 로그인을 마치지 못했습니다…' 하나 · 메일 문구 없음 · 노란 카카오 단추(내리지 않음)", ok,
          {m: (tok[m] or {}).get("al") for m in tok})
        # f — 도장 열리기 전(L4) 가입: 단추는 '가입 마치기', 마치면 언제 찍을 수 있는지 말한다 · 도장 0(검토 4바퀴 18번)
        f = GigFake(now=datetime(2026, 10, 18, 6, 0, tzinfo=UTC)); w = seed(f, open_event=False)
        e = f.add_event(starts=datetime(2026, 10, 18, 9, 30, tzinfo=UTC))
        c = ctx_of(br, f, session=sess(f, w["kakao"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        pg.click("#hm"); pg.wait_for_timeout(900)
        jb = pg.evaluate("(document.querySelector('#bd-sheet form .btn--solid') || {}).textContent || ''")
        pg.fill("#bd-jn", "일찍온팬"); pg.check("#bd-jall")
        pg.click("#bd-sheet form .btn--solid"); pg.wait_for_timeout(2200)
        d = pg.evaluate("[document.getElementById('gig-msg').textContent, INSOONI_GIG.state().L]")
        n_chk = sum(1 for (a, u) in f.checkins if a == e["id"])
        # L4 로그아웃 — 아래 큰 단추 '미리 가입해 두기' → 회원 창(카카오) · 도장 요청 0 (형님 10/03 'QR → 로그인 → 공연 화면')
        f2 = GigFake(now=datetime(2026, 10, 18, 6, 0, tzinfo=UTC)); seed(f2, open_event=False)
        f2.add_event(starts=datetime(2026, 10, 18, 9, 30, tzinfo=UTC))
        c2 = ctx_of(br, f2, gig_src=gig_src); p2 = c2.new_page(); fresh(p2, "live?e=K7Q2M")
        bar = p2.evaluate("[!document.getElementById('gig-bar').hidden, document.getElementById('gig-go').textContent, document.getElementById('gig-go').getAttribute('data-act')]")
        p2.click("#gig-go"); p2.wait_for_timeout(900)
        sh = p2.evaluate("(function(){ var s = document.getElementById('bd-sheet'); return s && !s.hidden ? s.innerText : ''; })()")
        t("L23e L4 로그아웃 — 하단 '미리 가입해 두기' → 회원 창('미리 가입해 두시면…') · 도장 요청 0",
          bar == [True, "미리 가입해 두기", "early"] and "미리 가입해 두시면" in sh and not rpc_calls(c2, "gig_checkin"), (bar, sh[:80]))
        c2.close()
        t("L23f L4 가입 — 단추 '가입 마치기' · 마치면 '일찍온팬 님, 가입을 마쳤습니다. 도장은 10월 18일 오후 4시 30분부터 … 「도장 찍기」가 나타납니다.' · 도장 0",
          jb == "가입 마치기" and d[0] == "일찍온팬 님, 가입을 마쳤습니다. 도장은 10월 18일 오후 4시 30분부터 찍을 수 있습니다 — 이 화면을 열어 두시면 그때 「도장 찍기」가 나타납니다."
          and d[1] == "L4" and n_chk == 0, (jb, d, n_chk))
        c.close()
        # g — 낮은 폰·큰 글자의 가로 도장: 공연장 이름과 '다녀옴'이 한 줄(다녀옴만 떨어지지 않는다, 검토 4바퀴 23번)
        stp = {}
        for (wd, ht, fs) in ((360, 740, 21), (360, 640, 21), (320, 568, 21), (375, 812, 17)):
            f = GigFake(); w = seed(f); f.checkins[(w["ev"]["id"], w["mem"])] = iso(f.now)
            c = ctx_of(br, f, wd, ht, fs=fs, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
            stp[(wd, ht, fs)] = pg.evaluate("""() => { const v = document.getElementById('gig-stamp-v').getBoundingClientRect(), w = document.getElementById('gig-stamp-w').getBoundingClientRect(),
              f = document.getElementById('gig-stamp').getBoundingClientRect();
              return {same: Math.abs((v.top + v.bottom) / 2 - (w.top + w.bottom) / 2) < 8 && w.left >= v.right - 1, stacked: w.top >= v.bottom - 2,
                      inside: w.right <= f.right + 1 && v.left >= f.left - 1, over: document.documentElement.scrollWidth - document.documentElement.clientWidth}; }""")
            c.close()
        ok = all(stp[k]["same"] and stp[k]["inside"] and stp[k]["over"] == 0 for k in ((360, 740, 21), (360, 640, 21), (320, 568, 21))) and stp[(375, 812, 17)]["stacked"]
        t("L23g 도장 — 가로 표(360×740·360×640·320×568 × 21px)에서 '진해아트홀 다녀옴'처럼 한 줄 · 표 안 · 넘침 0 · 정사각(375×812)은 세로", ok, stp)
        # h — 글자 크기·누르는 칸: 방명록 입구·다시 불러오기 1rem · 꼬리 줄 .9rem · 영어 꼬리도 48×48(검토 4바퀴 1·17번)
        sz = {}
        f, uid, url, conf, hold = setup("L5")
        c = ctx_of(br, f, conf=conf, gig_src=gig_src); pg = c.new_page(); fresh(pg, url)
        sz["ko"] = pg.evaluate("""() => ({login: parseFloat(getComputedStyle(document.getElementById('gig-gb-login')).fontSize),
          retry: parseFloat(getComputedStyle(document.getElementById('gig-retry')).fontSize),
          tail: [...document.querySelectorAll('.gig-tail a')].map(a => parseFloat(getComputedStyle(a).fontSize))})""")
        c.close()
        small = []
        for (wd, ht, fs) in ((360, 640, 17), (1280, 860, 17), (320, 640, 21)):
            f, uid, url, conf, hold = setup("L5")
            c = ctx_of(br, f, wd, ht, fs=fs, conf=conf, lang="en", gig_src=gig_src); pg = c.new_page(); fresh(pg, url, 1800)
            small += pg.evaluate("""() => [...document.querySelectorAll('.gig-tail a, .gig-tail button')].filter(e => e.checkVisibility({checkVisibilityCSS: true}))
              .map(e => [e.textContent, Math.round(e.getBoundingClientRect().width * 10) / 10, Math.round(e.getBoundingClientRect().height)]).filter(x => x[1] < 48 || x[2] < 48)""")
            c.close()
        t("L23h 17px — '로그인하고 방명록 남기기'·'다시 불러오기' 17px(1rem) · 꼬리 줄 15.3px(.9rem) · 영어 꼬리 줄 360·1280×17 · 320×21 모두 ≥48×48",
          sz["ko"]["login"] == 17 and sz["ko"]["retry"] == 17 and sz["ko"]["tail"] and all(abs(x - 15.3) < .05 for x in sz["ko"]["tail"]) and not small, (sz, small))
        # i — 언어 단추: 보이는 글자의 언어를 lang 으로 · 이름표도 그 언어 · 한글('한국어')은 본문 서체·자간 0(검토 4바퀴 16번)
        lg = {}
        for lang in (None, "en"):
            f, uid, url, conf, hold = setup("L5")
            c = ctx_of(br, f, conf=conf, lang=lang, gig_src=gig_src); pg = c.new_page(); fresh(pg, url, 1800)
            lg[lang or "ko"] = pg.evaluate("""() => [...document.querySelectorAll('.lang-toggle')].map(b => [b.textContent, b.getAttribute('lang'), b.getAttribute('aria-label'),
              getComputedStyle(b).fontFamily.split(',')[0].replace(/["']/g, '').trim(), getComputedStyle(b).letterSpacing])""")
            c.close()
        ok = (all(x[1] == "en" and x[2] == "View in English" for x in lg["ko"]) and len(lg["ko"]) == 2
              and all(x[0] == "한국어" and x[1] == "ko" and x[2] == "한국어로 보기" and "JetBrains" not in x[3] and x[4] in ("normal", "0px") for x in lg["en"]) and len(lg["en"]) == 2)
        t("L23i 언어 단추 — 한국어 화면 lang=en · 'View in English' / 영어 화면 '한국어' lang=ko · '한국어로 보기' · 본문 서체 · 자간 0", ok, lg)
        # j — 자판: 공연 코드 칸 + '열기', 방명록 글칸 + '남기기' — 한 글자 더 쳐도 칸 윗변 ≥ 머리 아래 · 단추 아랫변 ≤ 보이는 화면 − 8(검토 4바퀴 11·14번)
        KBM = """([fid, bid]) => { const f = document.querySelector(fid), b = document.querySelector(bid), hb = document.querySelector('.gig-head').getBoundingClientRect().bottom;
          return {ft: Math.round(f.getBoundingClientRect().top * 10) / 10, bb: Math.round(b.getBoundingClientRect().bottom * 10) / 10, hb: Math.round(hb * 10) / 10, vv: window.visualViewport.height,
                  foc: document.activeElement === f, ekh: f.getAttribute('enterkeyhint'), sp: getComputedStyle(document.documentElement).scrollPaddingTop}; }"""
        kbad, kn = [], 0
        for (wd, ht, fs, vvh) in ((360, 640, 17, 330), (360, 640, 21, 330), (390, 844, 21, 470), (320, 568, 21, 260)):
            for kind in ("code", "gb"):
                if kind == "code":
                    f, uid, url, conf, hold = setup("L2")
                    fid, bid, typ = "#gig-code-in", "#gig-code-go", "5U"
                else:
                    f, uid, url, conf, hold = setup("L8")
                    fid, bid, typ = "#gig-gb-ta", "#gig-gb-go", "오늘 정말"
                c = ctx_of(br, f, wd, ht, fs=fs, conf=conf, session=sess(f, uid) if uid else None, gig_src=gig_src, init_extra=VVE); pg = c.new_page(); fresh(pg, url)
                pg.locator(fid).scroll_into_view_if_needed(); pg.wait_for_timeout(120)
                pg.click(fid); pg.wait_for_timeout(200)
                pg.keyboard.type(typ)
                pg.evaluate("(h) => window.__kb(h)", vvh); pg.wait_for_timeout(500)
                d1 = pg.evaluate(KBM, [fid, bid])
                pg.keyboard.type("Y" if kind == "code" else " 좋았어요"); pg.wait_for_timeout(400)
                d2 = pg.evaluate(KBM, [fid, bid])
                kn += 1
                ok = all(d["foc"] and d["ft"] >= d["hb"] and d["bb"] <= d["vv"] - 7.5 for d in (d1, d2))
                if kind == "code":
                    ok = ok and d1["ekh"] == "go"
                else:
                    ok = ok and d1["sp"] == "%gpx" % (57 + fs * .5)
                if not ok:
                    kbad.append((kind, wd, ht, fs, vvh, d1, d2))
                c.close()
        # k — 사랑방 '오늘 공연' 줄: 도장 받는 중에는 도장이 아니라 응원·방명록으로(집에서 도장을 권하지 않는다, 검토 4바퀴 19번)
        today = {}
        for state in ("L7", "L9"):
            f, uid, url, conf, hold = setup(state)
            c = ctx_of(br, f, conf=conf, gig_src=gig_src); pg = c.new_page(); fresh(pg, "community.html", 1800)
            today[state] = pg.evaluate("""() => { const a = document.getElementById('cafe-today'); if (!a || a.hidden) return null;
              return {t: a.textContent, href: a.getAttribute('href')}; }""")
            c.close()
        t("L23k 사랑방 '오늘 공연' — 도장 받는 중: '오늘 공연 응원·방명록 보기 →'(href …#gig-cheers, '도장 찍으러' 없음) · 숫자는 '도장 N명' 그대로 · 방명록만: '공연 방명록 보러 가기 →'",
          today["L7"] and today["L7"]["href"] == "/live?e=K7Q2M#gig-cheers" and today["L7"]["t"].endswith("오늘 공연 응원·방명록 보기 →") and "도장 찍으러" not in today["L7"]["t"]
          and "도장 312명" in today["L7"]["t"] and today["L9"] and today["L9"]["href"] == "/live?e=K7Q2M" and today["L9"]["t"].endswith("공연 방명록 보러 가기 →"), today)
        # l — '가입 마치고 방명록 남기기' → 가입 → 도장은 찍지 않고(약속하지 않았다) 방명록 글칸으로(검토 4바퀴 12번)
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312)
        c = ctx_of(br, f, session=sess(f, w["kakao"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        gl = pg.evaluate("document.getElementById('gig-gb-login').textContent")
        pg.click("#gig-gb-login"); pg.wait_for_timeout(900)
        jb = pg.evaluate("(document.querySelector('#bd-sheet form .btn--solid') || {}).textContent || ''")
        pg.fill("#bd-jn", "방명록먼저"); pg.check("#bd-jall")
        pg.click("#bd-sheet form .btn--solid"); pg.wait_for_timeout(2600)
        d = pg.evaluate("[document.activeElement && document.activeElement.id, document.getElementById('gig-gb-form').checkVisibility(), document.getElementById('gig-msg').textContent]")
        uid = [u for u, m in f.members.items() if m["nickname"] == "방명록먼저"]
        stamped = bool(uid) and (w["ev"]["id"], uid[0]) in f.checkins
        t("L23l L6 '가입 마치고 방명록 남기기' → 회원 창 단추도 같은 말 → 가입 → 초점 방명록 글칸 · 도장 없음 · 인사 '방명록먼저 님, 어서 오세요.'",
          gl == "가입 마치고 방명록 남기기" and jb == "가입 마치고 방명록 남기기" and d[0] == "gig-gb-ta" and d[1] and not stamped and d[2] == "방명록먼저 님, 어서 오세요.", (gl, jb, d, stamped))
        c.close()
        t("L23j 자판 흉내 %d장면(360×640·17/21 · 390×844·21 · 320×568·21) — 코드 칸+'열기'·방명록 글칸+'남기기': 한 글자 더 쳐도 칸 top ≥ 머리 · 단추 bottom ≤ 보이는 높이−8 · 코드 칸 enterkeyhint=go · 글칸 초점 중 scroll-padding-top 57px+.5rem" % kn,
          not kbad and kn == 8, kbad[:3])

    if want("L12"):
        print("── L12 · 320×21")
        f = GigFake(); w = seed(f); fill_counts(f, w["ev"], 312, {1: 128})
        c = ctx_of(br, f, 320, 640, fs=21, session=sess(f, w["mem"]), gig_src=gig_src); pg = c.new_page(); fresh(pg, "live?e=K7Q2M")
        d = pg.evaluate("""() => ({cols: getComputedStyle(document.getElementById('gig-chips')).gridTemplateColumns.split(' ').length,
          fs: parseFloat(getComputedStyle(document.getElementById('gig-n')).fontSize), over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
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
        # 도장 받는 중이면 응원·방명록으로(#gig-cheers) — 집에서 도장을 권하지 않는다(검토 4바퀴 19번, L23k)
        t("LXd 사랑방 '오늘 공연' 줄 → /live?e=K7Q2M#gig-cheers (라우터 끔) · 실측 '도장 313명' · 공연 방명록 글에 '10.18 부산 KBS홀 공연'",
          d["vis"] and d["href"] == "/live?e=K7Q2M#gig-cheers" and d["router"] == "off" and "도장 313명" in d["txt"] and d["gig"] == "10.18 부산 KBS홀 공연", d)
        # 2026-10-03: 헤더의 '내 정보' → 내 정보 화면(#me) — 다녀온 공연이 거기 있다
        pg.click("#hm"); pg.wait_for_timeout(1500)
        st = pg.evaluate("[...document.querySelectorAll('#cafe-me .bd-stamp-mini')].map(x => x.textContent)")
        t("LXe 내 정보(#me) '다녀온 공연' 미니 도장 — '2026.10.18' + 장소", st == ["2026.10.18부산 KBS홀"]
          and pg.evaluate("location.hash") == "#me", st)
        c.close()
        # 탈퇴하면 도장·응원·투표가 함께 지워진다(서버 계약을 가짜 서버가 흉내 — 화면은 탈퇴 경고 문구로 말한다)
        f = GigFake(); w = seed(f)
        c = ctx_of(br, f, session=sess(f, w["sprout"])); pg = c.new_page(); fresh(pg, "news.html")
        pg.click("#hm"); pg.wait_for_timeout(1500)
        warn = pg.evaluate("(document.querySelector('#cafe-me .bd-leave-note') || {}).textContent || ''")
        t("LXf 공연 모드가 켜지면 탈퇴 경고가 '글·댓글·도장·응원·투표 기록이 함께 지워집니다'", warn == "탈퇴하면 글·댓글·도장·응원·투표 기록이 함께 지워집니다.", warn)
        c.close()

    if want("L24"):
        # 2026-10-03 공연 담당 피드백 — QR 로 들어온 관객에게 가입 창을 한 번 먼저 · 가입 때 소식 메일(선택)
        print("── L24 가입 창 자동 팝업 · 소식 메일 동의")
        SHEET = """() => { const s = document.getElementById('bd-sheet'); const open = !!s && !s.hidden;
          return {open, h: open ? (s.querySelector('.bd-sheet-h') || {}).textContent : '', txt: open ? s.innerText : '',
                  perks: open ? [...s.querySelectorAll('.bd-perks li')].map(x => x.textContent) : [],
                  kakao: open && !!s.querySelector('.bd-kakao'), news: open && !!s.querySelector('#bd-jnews'),
                  newsOn: open && !!(s.querySelector('#bd-jnews') || {}).checked,
                  box: open && !!s.querySelector('.bd-news-b') && !s.querySelector('.bd-news-b').hidden,
                  pop: sessionStorage.getItem('insooni_gig_pop'), over: document.documentElement.scrollWidth - document.documentElement.clientWidth}; }"""
        # a — 도장 받는 중 · 로그아웃: 0.7초 뒤 한 번 뜬다 · 제목 · '회원이 되면' 세 줄 · 카카오 단추 · 닫으면 다시 안 뜬다
        f, uid, url, conf, hold = setup("L5")
        c = ctx_of(br, f, conf=conf, gig_src=gig_src, pop=True); pg = c.new_page()
        pg.goto("about:blank"); pg.goto(B + url, wait_until="load"); pg.wait_for_timeout(300)
        early = pg.evaluate(SHEET)["open"]
        pg.wait_for_timeout(1800)
        a1 = pg.evaluate(SHEET)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        foc = pg.evaluate("document.activeElement && document.activeElement.id")
        pg.reload(wait_until="load"); pg.wait_for_timeout(2200)
        a2 = pg.evaluate(SHEET)
        t("L24a 도장 받는 중·로그아웃 → 화면이 먼저 그려진 뒤(0.3초엔 아직) 가입 창 · '회원으로 오늘 공연을 함께해 주세요' · '회원이 되면' 3줄(소식 메일 포함) · 카카오 단추 · 넘침 0",
          not early and a1["open"] and a1["h"] == "회원으로 오늘 공연을 함께해 주세요" and len(a1["perks"]) == 3
          and "이메일로 먼저" in a1["perks"][2] and a1["kakao"] and a1["over"] == 0, (early, a1))
        t("L24b 닫으면 초점이 아래 '도장 찍기' · 새로 고쳐도 다시 안 뜸(탭마다 한 번)", foc == "gig-go" and not a2["open"] and a2["pop"] == "1", (foc, a2))
        c.close()
        # c — 띄우지 않는 때: 가입을 마친 회원 · 방명록만(L9) · 바로가기(#gig-vote) · 시작 전(L4)은 띄운다
        res = {}
        for key, st, who, frag in (("joined", "L7", "mem", ""), ("L9", "L9", None, ""), ("hash", "L5", None, "#gig-vote"), ("L4", "L4", None, "")):
            f, uid, url, conf, hold = setup(st)
            w2 = {"mem": uid}
            c = ctx_of(br, f, conf=conf, session=sess(f, uid) if who else None, gig_src=gig_src, pop=True); pg = c.new_page()
            pg.goto("about:blank"); pg.goto(B + url + frag, wait_until="load"); pg.wait_for_timeout(2300)
            res[key] = pg.evaluate(SHEET)
            c.close()
        t("L24c 띄우지 않음 — 가입 마친 회원 · 방명록만 남은 단계 · #gig-vote 바로가기", not res["joined"]["open"] and not res["L9"]["open"] and not res["hash"]["open"],
          {k: (v["open"], v["h"]) for k, v in res.items()})
        t("L24d 시작 전(L4)·로그아웃은 띄움 — 첫 문장 '미리 가입해 두시면…' · 도장 줄 포함", res["L4"]["open"] and "미리 가입해 두시면" in res["L4"]["txt"]
          and any("도장" in x for x in res["L4"]["perks"]), res["L4"])

        def join_case(news=None, email=None, no015=False, nick="객석의팬", prefill=None):
            f = GigFake(); w = seed(f)
            f.no015 = no015
            c = ctx_of(br, f, session=sess(f, w["kakao"]), gig_src=gig_src, pop=True); pg = c.new_page()
            pg.goto("about:blank"); pg.goto(B + "live?e=K7Q2M", wait_until="load"); pg.wait_for_timeout(2300)
            d0 = pg.evaluate(SHEET)
            if news:
                pg.check("#bd-jnews"); pg.wait_for_timeout(150)
            d1 = pg.evaluate(SHEET)
            if prefill:   # 카카오 이메일이 미리 채워진 칸(로그인 열쇠의 email) — 체크하지 않았으면 보내면 안 된다
                pg.evaluate("v => { document.getElementById('bd-jne').value = v; }", prefill)
            if email is not None:
                pg.fill("#bd-jne", email)
            pg.fill("#bd-jn", nick); pg.check("#bd-jall")
            pg.click("#bd-sheet form .btn--solid"); pg.wait_for_timeout(2400)
            out = {"d0": d0, "d1": d1, "joined": w["kakao"] in f.members, "news": dict(f.news), "subs": list(f.subs),
                   "set": len(rpc_calls(c, "member_news_set")), "sub": len(rpc_calls(c, "subscribe")),
                   "stamped": any(u == w["kakao"] for (e, u) in f.checkins),
                   "msg": pg.evaluate("document.getElementById('gig-msg').textContent + ' | ' + document.getElementById('gig-phase').textContent"),
                   "err": pg.evaluate("(document.getElementById('bd-jne-err') || {}).textContent || ''"),
                   "inv": pg.evaluate("(document.getElementById('bd-jne') || {getAttribute(){return null}}).getAttribute('aria-invalid')"),
                   "kid": w["kakao"]}
            c.close()
            return out
        j1 = join_case(news=True, email="fan@example.com")
        t("L24e 카카오 가입 전(L6) → 가입 마치기 창이 뜸 · 소식 칸 체크 전엔 주소 칸 닫힘 · 체크하면 열림",
          j1["d0"]["open"] and j1["d0"]["h"] == "가입 마치기" and j1["d0"]["news"] and not j1["d0"]["newsOn"] and not j1["d0"]["box"] and j1["d1"]["box"], (j1["d0"], j1["d1"]))
        t("L24f 체크 + 주소 → 가입 · 소식 저장(fan@example.com · gig:K7Q2M) · 이어서 도장까지 · 인사 끝에 '소식 메일은 fan@example.com 로 보내 드립니다.'",
          j1["joined"] and j1["news"].get(j1["kid"]) == {"email": "fan@example.com", "source": "gig:K7Q2M"} and j1["stamped"]
          and "소식 메일은 fan@example.com 로 보내 드립니다." in j1["msg"], j1)
        j2 = join_case(news=False, prefill="kakao@example.com")
        t("L24g 체크하지 않으면 → 가입은 되고 소식 요청 0(미리 채워진 카카오 이메일도 보내지 않는다)", j2["joined"] and j2["set"] == 0 and j2["sub"] == 0 and not j2["news"], j2)
        j3 = join_case(news=True, email="not-an-email")
        t("L24h 체크했는데 주소가 틀리면 → 가입 전에 멈춤(가입 0) · 칸 아래 안내 · aria-invalid",
          not j3["joined"] and j3["set"] == 0 and "이메일 주소를 다시 확인해 주세요" in j3["err"] and j3["inv"] == "true", j3)
        j4 = join_case(news=True, email="old@example.com", no015=True)
        t("L24i 015 전(소식 함수 404) → 001 구독 명단(subscribe)으로 · 가입은 그대로", j4["joined"] and j4["subs"] == ["old@example.com"] and j4["sub"] == 1, j4)
        # j — 내 정보의 소식 메일: 받는 중 → 그만 받기 → 다시 받기(꼬리표 me) · 015 전이면 칸이 없다
        f = GigFake(); w = seed(f)
        f.news[w["mem"]] = {"email": "home@example.com", "source": "gig:K7Q2M"}
        c = ctx_of(br, f, session=sess(f, w["mem"])); pg = c.new_page(); fresh(pg, "community.html#me", 2200)
        m1 = pg.evaluate("(() => { const s = document.querySelector('#cafe-me .me-news'); return s && !s.hidden ? s.innerText : null; })()")
        lv1 = pg.evaluate("(document.querySelector('#cafe-me .bd-leave-note') || {}).textContent || ''")
        pg.click("#cafe-me .me-news-b"); pg.wait_for_timeout(700)
        m2 = pg.evaluate("[document.querySelector('#cafe-me .me-news').innerText, document.activeElement && document.activeElement.textContent]")
        gone = w["mem"] not in f.news
        pg.fill("#me-news-e", "again@example.com"); pg.click("#cafe-me .me-news-b"); pg.wait_for_timeout(700)
        m3 = pg.evaluate("document.querySelector('#cafe-me .me-news').innerText")
        c.close()
        f2 = GigFake(); w2 = seed(f2); f2.no015 = True
        c = ctx_of(br, f2, session=sess(f2, w2["mem"])); pg = c.new_page(); fresh(pg, "community.html#me", 2200)
        m4 = pg.evaluate("(() => { const s = document.querySelector('#cafe-me .me-news'); return s ? !s.hidden : false; })()")
        c.close()
        t("L24j 내 정보 '소식 메일' — 받는 중 · home@example.com → 그만 받기(주소 지움 · 초점 '소식 받기') → 다시 받기(again@example.com · 꼬리표 me) · 015 전이면 칸 없음 · 받는 중이면 탈퇴 경고에 '소식 메일 주소도 함께 지웁니다.'",
          m1 and "받는 중" in m1 and "home@example.com" in m1 and gone and "받지 않습니다" in m2[0] and m2[1] == "소식 받기"
          and f.news.get(w["mem"]) == {"email": "again@example.com", "source": "me"} and "again@example.com" in m3 and m4 is False
          and lv1.endswith(" 소식 메일 주소도 함께 지웁니다."), (m1, m2, m3, m4, lv1))


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
         [("if (S.busy.checkin) return;\nif (needMember", "if (needMember"), ('go.setAttribute("aria-disabled", "true");', "")], None, ["L4"]),
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
        ("공연 문맥에서 카카오가 없어도 이메일 '처음 가입'을 숨김", "board", "!(gig && conf().liveEmail !== true && kakaoTop && !opts.kakaoBack)", "!(gig && conf().liveEmail !== true)", ["L14"]),
        ("카카오에서 돌아온 공연 관객에게 노란 단추를 내림(원인 단정)", "board", "kakaoFail: false, kakaoBack: true", "kakaoFail: true, kakaoBack: true", ["L14"]),
        ("결과 문구를 #gig-msg 한 곳에만(누른 자리 곁 무시)", "gig", "var to = s ? msgSpot(near) : null;", 'var to = s ? byId("gig-msg") : null;', ["L17"]),
        ("자판이 올라와도 '남기기'를 맞추지 않음", "gig", 'M.kbFit(byId("gig-gb-ta"), function () { return byId("gig-gb-go"); });', "", ["L18", "L22"]),
        ("같은 글도 상태 줄(role=status)에 다시 씀", "gig", "if (n && n.textContent !== s) n.textContent = s;", "if (n) n.textContent = s;", ["L19"]),
        ("가입 동의 오류를 주 단추 아래(m)에", "board", 'agErr.textContent = why(!c1.checked ? "need_agree" : "need_age");', 'say(m, why(!c1.checked ? "need_agree" : "need_age"), "bad");', ["L20"]),
        ("시트를 닫으면 초점이 누른 칸이 아니라 '도장 찍기'로", "gig", 'M.openSheet(me ? "join" : "start", from || go, null, { ctx: "gig", why: next && next.what });', 'M.openSheet(me ? "join" : "start", go, null, { ctx: "gig", why: next && next.what });', ["L6"]),
        # 검토 4바퀴 — 새 단언(L23)이 살아 있는지
        ("도장 마감 뒤에도 '15초마다 새로 셉니다'", "gig", 'txt("gig-count-note", S.phase === "open" || S.phase === "before"', 'txt("gig-count-note", S.phase !== "closed"', ["L23"]),
        ("꺼짐 상태에서 꼬리 '사랑방으로'도 보임(같은 링크 두 번)", "gig", 'show(byId("gig-t1"), false);', "", ["L23"]),
        ("도장 단추를 disabled 로 잠금(초점이 문서로 떨어짐)", "gig", 'go.setAttribute("aria-disabled", "true");', "go.disabled = true;", ["L23"]),
        ("공연 단계와 무관하게 '도장을 남기려면'", "board", ': ph && ph !== "open" ? t("bd.sheetH"', ': false ? t("bd.sheetH"', ["L23"]),
        ("카카오 토큰 실패에 이메일 사람의 말", "board", 'if (cb.purpose === "kakao" && ((cb.kind', 'if (false && ((cb.kind', ["L23"]),
        ("자판 맞춤이 글칸을 줄이지 않음(아주 좁은 폰에서 단추가 자판 뒤)", "board", "var h = Math.max(Math.ceil(lh + pad), Math.floor(nat - (span - room)));", "var h = nat;", ["L23"]),
        ("느릴 때 aria-busy 를 풀지 않음", "gig", 'document.getElementById("main").removeAttribute("aria-busy");\nsetPhase(t("gig.slowPhase"', 'setPhase(t("gig.slowPhase"', ["L0"]),
        # (형식 비트의 정정 수준만 틀리게 적는 뮤테이션은 macOS Vision 이 수준을 바꿔 가며 읽어 내 잡히지 않는다 — 실측.
        #  그래서 해독기가 되살릴 수 없는 '마스크 번호' 를 틀리게 적는다)
        # 2026-10-03 — 가입 창 자동 팝업 · 소식 메일
        ("자동 팝업을 탭마다 한 번으로 묶지 않음", "gig", 'try { sessionStorage.setItem(POP_KEY, "1"); } catch (e) {}', "", ["L24"]),
        ("가입을 마친 회원에게도 팝업", "gig", 'if (!(L === "L4" || L === "L5" || L === "L6") || (me && me.joined)) return;', 'if (!(L === "L4" || L === "L5" || L === "L6" || L === "L7")) return;', ["L24"]),
        ("소식 칸을 체크하지 않아도 주소를 보냄", "board", "if (!c.checked) return \"\";", "if (!c.checked) return inp.value.trim();", ["L24"]),
        ("주소가 틀려도 가입을 진행", "board", "if (news === null) return;", "if (news === null) news = \"\";", ["L24"]),
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
