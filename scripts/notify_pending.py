#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""사랑방 검수 대기 알림 — 건수만, 형님 텔레그램으로.

형님 맥의 OpenClaw 정기 작업 두 개가 부른다. 이 스크립트가 stdout 에 쓴 글을
OpenClaw 가 텔레그램으로 보낸다. 아무것도 안 쓰면 아무것도 안 간다.

  insooni-pending-am  매일 09:00  --slot morning
      대기가 1건이라도 있으면 보낸다 (종류별 건수 · 가장 오래 기다린 글이 들어온 때)
      월요일에 대기 0건이면 '정상 작동' 한 줄만 보낸다
  insooni-pending-pm  매일 19:00  --slot evening
      오늘 09시 이후 새로 들어온 대기가 있을 때만 보낸다

왜 이렇게 나눴나
  · 매번 같은 내용이 울리면 3주 뒤엔 알림을 안 본다. 저녁은 '새 글'일 때만.
  · 그런데 '대기 0건'과 '알림이 죽음'은 둘 다 조용해서 구분되지 않는다.
    그래서 월요일 아침 한 번만, 대기가 없어도 살아 있다는 한 줄을 보낸다.
  · 슬롯은 정기 작업이 정해 준다(--slot). 실행 시각으로 추측하지 않는다. 맥이 자다 깨면
    OpenClaw 가 놓친 작업을 몇 시간 늦게 돌린다(2026-10-01: 09:00 작업이 11:03 에).
    시각으로 추측하면 오후에 늦게 돈 아침 작업이 저녁 규칙을 써서 밤사이 글을 놓친다.
  · 상태 파일 없이 매번 서버에서 다시 센다. 어떤 회차가 끝내 배달되지 않아도
    대기 글은 그대로 있으니 다음 아침에 다시 잡힌다.

배달 실패 — OpenClaw 는 전송이 일시적으로 실패하면 30초·1분·5분 뒤 작업을 다시 돌린다.
단 best-effort 로 등록하면 이 재시도가 꺼진다. 2026-10-01 11:03 에 맥이 깨어난 직후
'sendMessage failed' 로 두 건이 사라진 것이 그 때문이다. 그래서 이 작업은 best-effort
없이 등록한다. 다시 돌 때 이 스크립트가 새로 센다.

글 내용·이름은 가져오지 않는다. 서버 함수(supabase/009·010)가 애초에 건수와
시(時) 단위로 내린 시각만 내준다. 공개키로 부른다 — 비밀 키가 필요 없다.

실패를 조용히 넘기지 않는다. 서버에 못 닿으면 정해진 시간(--deadline) 안에서 몇 번
다시 해 보고, 그래도 안 되면 '확인하지 못했다'는 글을 남긴다. 종료코드는 0/1 뿐이고
정기 작업은 `|| true` 로 감싼다 — OpenClaw 는 종료코드가 아니라 출력 유무로 보낼지 정한다.

stderr 에는 아무것도 쓰지 않는다. OpenClaw 는 stdout 이 비면 stderr 를 그대로 보낸다.

실행:  python3 scripts/notify_pending.py --slot morning|evening [--now ISO] [--test]
       (--slot auto 는 손으로 돌릴 때만 — 09~19시면 아침 규칙)
"""
import argparse, json, os, re, sys, time, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9), "KST")
URL = os.environ.get("INSOONI_SUPABASE_URL", "https://vxrazyiqvdwgvgpkkitm.supabase.co")
# 공개키다. 브라우저에도 그대로 들어 있고, 공개되는 것이 정상이다(keepalive.py 와 같은 키).
KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY",
                     "sb_publishable_HSy_9JL7qeWLRMHt8OZ0dg_Owu_JwwP")
ADMIN = "insooni.com/admin"
MORNING, EVENING = 9, 19
HEARTBEAT_WEEKDAY = 0      # 월요일
TRY_TIMEOUT = 20           # 한 번 시도의 상한(초)
DEADLINE = 140             # 전체 상한(초) — 정기 작업 제한 180초 안에서 실패 글까지 쓸 여유
KINDS = (("bpost", "게시판 글"), ("comment", "댓글"), ("note", "한 줄"), ("dream", "꿈"), ("letter", "편지"), ("post", "옛 게시글"))


def fetch(since, tries, wait, deadline):
    """(요약, None) 또는 (None, 사유). 404 는 다시 해 봐야 소용없으니 바로 끝낸다."""
    end = time.monotonic() + deadline
    body = json.dumps({"p_since": since.isoformat() if since else None}).encode()
    why = "알 수 없음"
    for i in range(tries):
        left = end - time.monotonic()
        if left < 1:
            why += " · 시간 상한 %d초" % deadline
            break
        req = urllib.request.Request(
            URL + "/rest/v1/rpc/pending_summary", data=body, method="POST",
            headers={"apikey": KEY, "Authorization": "Bearer " + KEY,
                     "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=min(TRY_TIMEOUT, left)) as r:
                data = json.loads(r.read().decode("utf-8"))
            if isinstance(data, dict) and data.get("ok") is True and isinstance(data.get("total"), int):
                return data, None
            why = "서버 응답 모양이 다릅니다"
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None, "서버에 알림 함수가 없습니다(supabase/009 미적용)"
            why = "HTTP %d" % e.code
        except urllib.error.URLError as e:
            why = "연결 실패 — %s" % str(getattr(e, "reason", e))[:60]
        except Exception as e:  # 시간 초과·JSON 깨짐 등 — 사유만 남기고 다시 해 본다
            why = type(e).__name__
        if i < tries - 1:
            time.sleep(max(0.0, min(wait * (i + 1), end - time.monotonic() - 1)))
    return None, why


def parse_ts(v):
    """PostgreSQL 은 소수점 끝의 0을 지워 내보낸다(.12345). 파이썬 3.10 의 fromisoformat 은
    3·6자리만 읽으므로 6자리로 맞춘 뒤 읽는다. Z 도 +00:00 으로."""
    v = v.replace("Z", "+00:00")
    v = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], v, count=1)
    return datetime.fromisoformat(v)


def day_word(t, now):
    d = (now.date() - t.date()).days
    return "오늘" if d == 0 else "어제" if d == 1 else t.strftime("%m/%d")


def kinds(s):
    return " · ".join("%s %d" % (label, s[k]) for k, label in KINDS if s.get(k))


def window(slot, now):
    """'새 글'의 기준 시각. 아침은 전날 19시, 저녁은 그날 09시(그 전이면 전날 09시).
    정기 작업이 늦게 돌아도 기준은 정해진 슬롯 시각이라 빈틈이 없다."""
    if slot == "morning":
        return now.replace(hour=EVENING, minute=0, second=0, microsecond=0) - timedelta(days=1)
    base = now.replace(hour=MORNING, minute=0, second=0, microsecond=0)
    return base - timedelta(days=1) if now < base else base


def compose(slot, s, now, base):
    """보낼 글. 보낼 것이 없으면 빈 문자열."""
    stamp = "(insooni 사랑방 · %s KST 기준)" % now.strftime("%m/%d %H:%M")
    total = s["total"]
    since_txt = "%s %02d시 이후" % (day_word(base, now), base.hour)
    if slot == "morning":
        if total <= 0:
            if now.weekday() == HEARTBEAT_WEEKDAY:
                return "✅ 사랑방 검수 대기 0건 — 알림은 정상 작동 중입니다 (월요일마다 한 번)\n" + stamp
            return ""
        lines = ["💌 사랑방 검수 대기 %d건 — %s" % (total, kinds(s))]
        if s.get("oldest_at"):
            o = parse_ts(s["oldest_at"]).astimezone(KST)   # 서버가 시 단위로 내려 보낸다
            lines.append("가장 오래 기다린 글: %s %02d시대에 들어옴" % (day_word(o, now), o.hour))
        if s.get("since"):
            lines.append("%s 새로 들어온 글 %d건" % (since_txt, s["since"]))
    else:
        new = s.get("since") or 0
        if new <= 0:
            return ""
        lines = ["💌 %s 새로 들어온 글 %d건 — 검수 대기 전체 %d건 (%s)" % (since_txt, new, total, kinds(s))]
    lines += ["→ " + ADMIN, stamp]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description="사랑방 검수 대기 알림")
    ap.add_argument("--slot", choices=("auto", "morning", "evening"), default="auto",
                    help="정기 작업은 morning/evening 을 명시한다. auto 는 손으로 돌릴 때만")
    ap.add_argument("--now", help="시험용 현재 시각 (ISO, 오프셋 포함)")
    ap.add_argument("--tries", type=int, default=4)
    ap.add_argument("--wait", type=float, default=10.0, help="재시도 간격 기본값(초) — n번째는 n배")
    ap.add_argument("--deadline", type=float, default=DEADLINE, help="전체 시간 상한(초)")
    ap.add_argument("--test", action="store_true",
                    help="연결 시험 — 실제 서버에서 센 건수로 시험 한 줄을 늘 보낸다(등록 직후 배달 확인용)")
    a = ap.parse_args(argv)

    now = datetime.fromisoformat(a.now).astimezone(KST) if a.now else datetime.now(KST)
    slot = a.slot if a.slot != "auto" else ("morning" if MORNING <= now.hour < EVENING else "evening")
    base = window(slot, now)
    s, why = fetch(base, max(1, a.tries), max(0.0, a.wait), max(1.0, a.deadline))
    if s is None:
        print("⚠️ 사랑방 검수 알림 — 대기 건수를 확인하지 못했습니다 (%s).\n"
              "이번 알림이 빠졌을 수 있습니다. → %s 에서 직접 확인해 주세요.\n"
              "(insooni 사랑방 · %s KST)" % (why, ADMIN, now.strftime("%m/%d %H:%M")))
        return 1
    if a.test:
        print("🔔 사랑방 검수 알림 — 연결 시험입니다. 지금 검수 대기 %d건.\n"
              "앞으로 매일 09시(대기가 있을 때)·19시(새 글이 있을 때)에 알려 드립니다.\n"
              "(insooni 사랑방 · %s KST 기준)" % (s["total"], now.strftime("%m/%d %H:%M")))
        return 0
    msg = compose(slot, s, now, base)
    if msg:
        print(msg)
    return 0


if __name__ == "__main__":
    # stderr 로 새는 것이 없게 한다 — 예상 못 한 예외도 stdout 한 줄로.
    try:
        code = main()
    except SystemExit as e:
        code = 0 if e.code in (0, None) else 1   # 종료코드는 0/1 만 — argparse 의 2 도 1 로
    except Exception as e:
        print("⚠️ 사랑방 검수 알림 — 스크립트 오류 (%s). → %s 에서 직접 확인해 주세요."
              % (type(e).__name__, ADMIN))
        code = 1
    sys.stdout.flush()
    sys.exit(code)
