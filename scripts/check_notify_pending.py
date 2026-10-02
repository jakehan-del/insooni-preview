#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""notify_pending.py 검사 — 가짜 Supabase 를 띄우고 진짜 스크립트를 하위 프로세스로 돌린다.

실행:  python3 scripts/check_notify_pending.py      (네트워크·키 필요 없음, 약 1분)

본 검사 뒤에 스크립트를 일부러 망가뜨린 사본으로 같은 검사를 다시 돌려,
검사가 그 망가짐을 잡는지 본다(뮤테이션). 하나라도 못 잡으면 실패다.
날짜: 2026-10-02 은 금요일, 2026-10-05 는 월요일.
"""
import importlib.util, json, os, re, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "notify_pending.py")
SRC = open(TARGET, encoding="utf-8").read()


class Stub(BaseHTTPRequestHandler):
    plan = []          # 차례로 돌려줄 (상태코드, 본문) 또는 ("sleep", 초, 본문). 다 쓰면 마지막 것을 반복
    seen = []          # 받은 요청

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        Stub.seen.append({"path": self.path, "body": json.loads(self.rfile.read(n) or b"{}"),
                          "apikey": self.headers.get("apikey")})
        step = Stub.plan.pop(0) if len(Stub.plan) > 1 else Stub.plan[0]
        if step[0] == "sleep":
            time.sleep(step[1])
            code, body = 200, step[2]
        else:
            code, body = step
        raw = json.dumps(body).encode() if not isinstance(body, bytes) else body
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        except OSError:
            pass       # 시간 상한 시험 — 클라이언트가 먼저 끊고 떠났다

    def log_message(self, *a):
        pass


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, *a):
        pass


srv = Server(("127.0.0.1", 0), Stub)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:%d" % srv.server_port
ERRS = []


def S(total=0, note=0, dream=0, letter=0, post=0, oldest=None, since=None, bpost=0, comment=0):
    return {"ok": True, "total": total, "note": note, "dream": dream, "letter": letter,
            "post": post, "bpost": bpost, "comment": comment,
            "oldest_at": oldest, "since": since, "at": "2026-10-02T00:00:00+00:00"}


def run(script, plan, now=None, slot="auto", tries=3, base=BASE, extra=(), record=True):
    Stub.plan, Stub.seen = list(plan), []
    env = dict(os.environ, INSOONI_SUPABASE_URL=base)
    cmd = [sys.executable, script, "--slot", slot, "--tries", str(tries), "--wait", "0"] + list(extra)
    if now:
        cmd += ["--now", now]
    t0 = time.monotonic()
    p = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=90)
    if record:
        ERRS.append(p.stderr)
    return p.returncode, p.stdout, p.stderr, list(Stub.seen), time.monotonic() - t0


def since_of(seen):
    return seen[0]["body"]["p_since"] if seen else None


def suite(script):
    R = []
    del ERRS[:]
    t = lambda name, ok, info="": R.append((name, bool(ok), info))
    FRI_AM, FRI_PM, MON_AM, MON_PM = ("2026-10-02T09:00:00+09:00", "2026-10-02T19:00:00+09:00",
                                      "2026-10-05T09:00:00+09:00", "2026-10-05T19:00:00+09:00")

    # 1) 대기 0건 — 조용하다. 단 월요일 아침만 '살아 있다' 한 줄
    for now, slot in ((FRI_AM, "morning"), (FRI_PM, "evening"), (MON_PM, "evening")):
        c, out, err, seen, _ = run(script, [(200, S())], now, slot)
        t("대기 0건 %s %s → 아무것도 안 보냄" % (now[5:10], slot), c == 0 and out == "", repr(out))
    c, out, err, seen, _ = run(script, [(200, S())], MON_AM, "morning")
    t("월요일 아침 대기 0건 → '정상 작동' 한 줄", c == 0 and "정상 작동" in out and "대기 0건" in out
      and out.count("\n") == 2, repr(out))

    # 2) 아침 — 대기가 있으면 종류별 건수·들어온 때·새 글·링크·기준 시각
    c, out, err, seen, _ = run(script, [(200, S(4, note=3, letter=1, oldest="2026-09-29T23:00:00.12345+00:00",
                                               since=2))], FRI_AM, "morning")
    t("아침 대기 4건 → 보냄", c == 0 and "검수 대기 4건" in out, out)
    t("종류별은 0인 종류를 빼고 적는다", "한 줄 3 · 편지 1" in out and "꿈" not in out.split("\n")[0], out)
    t("가장 오래 기다린 글: 09/30 08시대 (UTC→KST · 끝자리 5자리 시각도 읽음)", "09/30 08시대에 들어옴" in out, out)
    t("새 글 문구가 실제 기준을 말한다: 어제 19시 이후 2건", "어제 19시 이후 새로 들어온 글 2건" in out, out)
    t("운영 화면 주소가 있다", "insooni.com/admin" in out, out)
    t("기준 시각(KST)이 적힌다", "10/02 09:00 KST 기준" in out, out)
    t("아침의 기준 = 전날 19:00 KST", since_of(seen) == "2026-10-01T19:00:00+09:00", since_of(seen))
    t("공개키로 부른다(apikey 헤더)", seen and (seen[0]["apikey"] or "").startswith("sb_publishable_"), "")
    t("부르는 함수 = pending_summary", seen and seen[0]["path"] == "/rest/v1/rpc/pending_summary", seen and seen[0]["path"])
    c, out, err, seen, _ = run(script, [(200, S(3, bpost=2, comment=1, oldest="2026-10-01T13:00:00+00:00"))], FRI_AM, "morning")
    t("게시판 글·댓글도 종류별로 센다(010)", "게시판 글 2 · 댓글 1" in out, out)
    c, out, err, seen, _ = run(script, [(200, S(1, dream=1, oldest="2026-10-01T13:00:00+00:00"))], FRI_AM, "morning")
    t("어젯밤 들어온 글 → '어제 22시대에 들어옴'", "어제 22시대에 들어옴" in out, out)

    # 3) 저녁 — 09시 이후 새 글이 없으면 조용, 있으면 보냄
    c, out, err, seen, _ = run(script, [(200, S(4, note=4, since=0))], FRI_PM, "evening")
    t("저녁: 대기 4건이어도 09시 이후 새 글 0 → 조용", c == 0 and out == "", repr(out))
    t("저녁의 기준 = 그날 09:00 KST", since_of(seen) == "2026-10-02T09:00:00+09:00", since_of(seen))
    c, out, err, seen, _ = run(script, [(200, S(5, note=4, dream=1, since=2))], FRI_PM, "evening")
    t("저녁: '오늘 09시 이후 새로 들어온 글 2건 — 전체 5건'",
      "오늘 09시 이후 새로 들어온 글 2건" in out and "전체 5건" in out and "한 줄 4 · 꿈 1" in out, out)

    # 4) 정기 작업이 늦게 돈 경우 — 슬롯은 작업이 정한 대로
    c, out, err, seen, _ = run(script, [(200, S(1, post=1, oldest="2026-10-01T17:00:00+00:00", since=1))],
                               "2026-10-03T15:00:00+09:00", "morning")
    t("아침 작업이 15:00 에 늦게 돌아도 아침 규칙(밤사이 글을 알림)", "검수 대기 1건" in out
      and since_of(seen) == "2026-10-02T19:00:00+09:00", out)
    c, out, err, seen, _ = run(script, [(200, S(1, post=1, since=0))], "2026-10-03T20:30:00+09:00", "morning")
    t("아침 작업이 20:30 에 밀려 돌아도 아침 규칙(새 글 0이어도 전체 대기를 알림)", "검수 대기 1건" in out, out)
    c, out, err, seen, _ = run(script, [(200, S(1, note=1, since=1))], "2026-10-03T00:30:00+09:00", "evening")
    t("저녁 작업이 자정 넘어 00:30 에 돌면 → 어제 09시 이후 기준 · 문구도 '어제'",
      "어제 09시 이후 새로 들어온 글 1건" in out and since_of(seen) == "2026-10-02T09:00:00+09:00", out)

    # 5) 손으로 돌릴 때(auto) — 09~19시 아침, 그 밖 저녁
    for now, want, want_since in (("2026-10-02T08:59:00+09:00", "evening", "2026-10-01T09:00:00+09:00"),
                                  ("2026-10-02T09:00:00+09:00", "morning", "2026-10-01T19:00:00+09:00"),
                                  ("2026-10-02T18:59:00+09:00", "morning", "2026-10-01T19:00:00+09:00"),
                                  ("2026-10-02T19:00:00+09:00", "evening", "2026-10-02T09:00:00+09:00"),
                                  ("2026-10-03T00:30:00+09:00", "evening", "2026-10-02T09:00:00+09:00")):
        c, out, err, seen, _ = run(script, [(200, S())], now, "auto")
        t("auto %s → %s 규칙" % (now[11:16], want), since_of(seen) == want_since, since_of(seen))

    # 6) 실패는 조용히 넘기지 않는다
    c, out, err, seen, _ = run(script, [(404, {"code": "PGRST202"})], FRI_AM, "morning")
    t("404(009 미적용) → 사유를 적어 보냄 · 종료코드 1", c == 1 and "009 미적용" in out and "확인하지 못했습니다" in out, out)
    t("404 는 다시 해 봐야 소용없으니 한 번만 부른다", len(seen) == 1, len(seen))
    c, out, err, seen, _ = run(script, [(500, {}), (503, {}), (200, S(2, dream=2, oldest="2026-10-01T23:00:00Z"))],
                               FRI_AM, "morning")
    t("일시 장애 두 번 뒤 성공 → 정상 알림", c == 0 and "검수 대기 2건" in out and len(seen) == 3, "%d회 %r" % (len(seen), out))
    c, out, err, seen, _ = run(script, [(500, {})], FRI_AM, "morning", tries=3)
    t("계속 500 → 3번 시도 후 실패 알림", c == 1 and len(seen) == 3 and "HTTP 500" in out, "%d회 %r" % (len(seen), out))
    c, out, err, seen, _ = run(script, [(200, {"message": "unexpected"})], FRI_AM, "morning", tries=2)
    t("엉뚱한 응답 모양 → 실패 알림(0건으로 착각하지 않음)", c == 1 and "모양" in out, out)
    c, out, err, seen, _ = run(script, [(200, S())], FRI_AM, "morning", tries=2, base="http://127.0.0.1:9")
    t("서버에 닿지 못함 → 실패 알림", c == 1 and "연결 실패" in out, out)
    c, out, err, seen, _ = run(script, [(200, b"<html>not json")], FRI_AM, "morning", tries=2)
    t("JSON 이 아닌 응답 → 실패 알림", c == 1 and "확인하지 못했습니다" in out, out)

    # 7) 전체 시간 상한 — 응답이 6초 걸리는 서버, 상한 3초
    c, out, err, seen, el = run(script, [("sleep", 6, S(1, note=1))], FRI_AM, "morning", tries=4,
                                extra=["--deadline", "3"])
    t("시간 상한 3초 → 6초짜리 응답을 기다리지 않고 실패 알림", c == 1 and "확인하지 못했습니다" in out and el < 5.5,
      "%.1f초 %r" % (el, out))
    spec = importlib.util.spec_from_file_location("np_mod", script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    t("기본 상한 %s초 ≤ 150 (정기 작업 제한 180초 안에서 실패 글까지)" % getattr(mod, "DEADLINE", "?"),
      getattr(mod, "DEADLINE", 999) <= 150, "")

    # 8) 실제 시계로 — 기준 시각이 KST 정각(09·19시)으로 나간다
    c, out, err, seen, _ = run(script, [(200, S())], None, "auto")
    t("실제 시계 실행 → 기준 시각이 KST 09:00 또는 19:00",
      bool(re.search(r"T(09|19):00:00\+09:00$", since_of(seen) or "")), since_of(seen))

    # 9) 연결 시험 — 대기 0건이어도 실제 건수로 한 줄을 늘 보낸다. 실패면 시험 문구 대신 실패 알림
    c, out, err, seen, _ = run(script, [(200, S())], FRI_PM, "evening", extra=["--test"])
    t("--test 대기 0건 → 시험 한 줄(실제 건수 0)", c == 0 and "연결 시험" in out and "검수 대기 0건" in out, repr(out))
    c, out, err, seen, _ = run(script, [(404, {})], FRI_PM, "evening", extra=["--test"])
    t("--test 인데 서버 함수 없음 → 시험 성공처럼 굴지 않고 실패 알림", c == 1 and "연결 시험" not in out
      and "009 미적용" in out, repr(out))

    # 10) stderr 로는 아무것도 새지 않는다 (OpenClaw 는 stdout 이 비면 stderr 를 보낸다)
    t("모든 경우(%d회) stderr 비어 있음" % len(ERRS), not any(ERRS), repr([e for e in ERRS if e][:1]))
    c, out, err, seen, _ = run(script, [(200, S())], FRI_AM, "noon", record=False)
    t("잘못된 인자 → 종료코드 1 (0/1 만)", c == 1, c)
    return R


def broken(R):
    return [r for r in R if not r[1]]


if __name__ == "__main__":
    R = suite(TARGET)
    for name, ok, info in R:
        print(("  ✓ " if ok else "  ✗ ") + name + ("" if ok else "   ← " + str(info)[:160]))
    fail = len(broken(R))
    print("\n본 검사: %d/%d 통과" % (len(R) - fail, len(R)))

    MUT = [
        ("저녁에도 대기만 있으면 보냄", 'new = s.get("since") or 0', 'new = s.get("total") or 0'),
        ("월요일 아닌 날도 0건 신호", "            if now.weekday() == HEARTBEAT_WEEKDAY:", "            if True:"),
        ("월요일 신호 없음", "            if now.weekday() == HEARTBEAT_WEEKDAY:", "            if False:"),
        ("404 를 0건으로 착각", 'return None, "서버에 알림 함수가 없습니다(supabase/009 미적용)"',
         'return {"ok": True, "total": 0}, None'),
        ("재시도 안 함", "    for i in range(tries):", "    for i in range(1):"),
        ("저녁 기준을 지금 시각으로", "base = now.replace(hour=MORNING, minute=0, second=0, microsecond=0)", "base = now"),
        ("auto 경계를 14시로(옛 규칙)", "MORNING <= now.hour < EVENING", "now.hour < 14"),
        ("정해 준 슬롯을 무시하고 시각으로 추측", 'slot = a.slot if a.slot != "auto" else (', "slot = ("),
        ("응답 모양 검사 생략",
         'if isinstance(data, dict) and data.get("ok") is True and isinstance(data.get("total"), int):', "if True:"),
        ("실패를 stderr 로", 'print("⚠️ 사랑방 검수 알림 — 대기 건수를',
         'print(file=sys.stderr); print("⚠️ 사랑방 검수 알림 — 대기 건수를'),
        ("시간 상한 무시", "timeout=min(TRY_TIMEOUT, left)", "timeout=TRY_TIMEOUT"),
        ("저녁 문구를 늘 '오늘'로", 'since_txt = "%s %02d시 이후" % (day_word(base, now), base.hour)',
         'since_txt = "오늘 %02d시 이후" % base.hour'),
        ("시험 모드가 실패를 덮음", "    if s is None:\n", "    if s is None and not a.test:\n"),
        ("들어온 때를 UTC 그대로 표시", 'o = parse_ts(s["oldest_at"]).astimezone(KST)', 'o = parse_ts(s["oldest_at"])'),
    ]
    caught = 0
    with tempfile.TemporaryDirectory() as d:
        for name, a, b in MUT:
            if SRC.count(a) != 1:
                print("  ? 뮤테이션 적용 실패: " + name)
                continue
            p = os.path.join(d, "notify_pending.py")
            open(p, "w", encoding="utf-8").write(SRC.replace(a, b))
            bad = broken(suite(p))
            caught += bool(bad)
            print("  %s — %s%s" % ("잡음" if bad else "★못 잡음", name, ("  (" + bad[0][0] + ")") if bad else ""))
    print("뮤테이션: %d/%d 잡음" % (caught, len(MUT)))
    srv.shutdown()
    sys.exit(1 if fail or caught != len(MUT) else 0)
