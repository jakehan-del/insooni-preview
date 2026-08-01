#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""검수 도우미.

사랑방에 들어온 편지·게시글·꿈을 AI가 먼저 읽고 소견을 남긴다.
형님의 하루 검수를 몇 분에서 몇십 초로 줄이는 것이 목적이다.

── 절대 하지 않는 것 ────────────────────────────────────
게시하지 않는다. status 칸은 건드리지 않는다.
AI는 ai_verdict / ai_reason / ai_at 세 칸만 채운다.
승인과 거절은 사람이 한다. 자동 게시를 넣는 순간
'검수를 거칩니다'라는 사이트의 약속이 거짓이 된다.

── 판정 ────────────────────────────────────────────────
  ok      그대로 올려도 좋아 보임
  review  사람이 봐야 함 (개인정보·연락처·판단이 갈리는 내용)
  spam    광고·도배·욕설

── 필요한 것 (전부 GitHub Actions secret) ───────────────
  SUPABASE_URL           https://xxxx.supabase.co
  SUPABASE_SECRET_KEY    sb_secret_...  검수 대기열은 공개키로 못 읽는다
  ANTHROPIC_API_KEY

키를 코드에 적지 않는다. 하나라도 없으면 아무 일도 하지 않고 끝난다.
"""
import json, os, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone

MODEL = "claude-haiku-4-5-20251001"
KINDS = {"note": "notes", "letter": "letters", "post": "posts", "dream": "dreams"}
BATCH = 40

SYSTEM = """당신은 가수 인순이의 공식 홈페이지에 들어온 팬 글을 1차로 살펴보는 사람이다.
최종 결정은 운영자가 한다. 당신은 소견만 낸다.

각 글에 하나를 준다.
  ok      그대로 공개해도 문제없어 보인다
  review  사람이 직접 봐야 한다
  spam    광고·도배·욕설·명백한 악의

review 로 보내야 하는 것
  · 전화번호, 이메일, 주소, 계좌번호 등 개인정보가 담긴 글
  · 제3자를 특정해 비난하는 내용
  · 의료·법률·금전 조언으로 읽힐 수 있는 내용
  · 뜻을 알 수 없거나 판단이 갈리는 글
  · 홈페이지 운영진에게 답을 요구하는 민원성 글

관대하게 보라. 맞춤법이 틀렸거나 짧거나 투박한 글은 ok 다.
나이 드신 분들이 많이 쓰신다. 서툰 것은 문제가 아니다.

이유는 한국어 한 줄로 25자 이내. 아래 JSON만 출력한다.
{"verdicts":[{"i":0,"v":"ok","why":"평범한 응원 글"}]}"""


def env(name):
    return (os.environ.get(name) or "").strip()


def post_json(url, headers, payload, timeout=90):
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                 headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode("utf-8")
    return json.loads(body) if body.strip() else None


def sb_get(base, key, path):
    req = urllib.request.Request(base + "/rest/v1/" + path,
                                 headers={"apikey": key, "Authorization": "Bearer " + key})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def sb_patch(base, key, path, payload):
    req = urllib.request.Request(
        base + "/rest/v1/" + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"apikey": key, "Authorization": "Bearer " + key,
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="PATCH")
    with urllib.request.urlopen(req, timeout=60) as r:
        r.read()


def ask(key, rows):
    listing = "\n".join(
        "%d. [%s] %s" % (i, r["kind"], (r.get("text") or "").replace("\n", " ")[:400])
        for i, r in enumerate(rows))
    res = post_json("https://api.anthropic.com/v1/messages",
                    {"content-type": "application/json", "x-api-key": key,
                     "anthropic-version": "2023-06-01"},
                    {"model": MODEL, "max_tokens": 2000, "system": SYSTEM,
                     "messages": [{"role": "user", "content": listing}]})
    text = "".join(b.get("text", "") for b in (res or {}).get("content", [])
                   if b.get("type") == "text")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        doc = json.loads(m.group(0))
    except ValueError:
        return None
    return doc.get("verdicts") if isinstance(doc.get("verdicts"), list) else None


def main():
    base, skey, akey = env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), env("ANTHROPIC_API_KEY")
    missing = [n for n, v in (("SUPABASE_URL", base), ("SUPABASE_SECRET_KEY", skey),
                              ("ANTHROPIC_API_KEY", akey)) if not v]
    if missing:
        print("건너뜁니다 — 없는 설정:", ", ".join(missing))
        return 0
    base = base.rstrip("/")

    try:
        rows = sb_get(base, skey, "moderation_queue?select=*&ai_verdict=is.null&limit=%d" % BATCH)
    except urllib.error.HTTPError as e:
        print("검수 대기열을 읽지 못했습니다 — HTTP", e.code)
        return 1
    except Exception as e:
        print("검수 대기열을 읽지 못했습니다 —", type(e).__name__)
        return 1

    if not rows:
        print("소견을 달 새 글이 없습니다.")
        return 0
    print("새 글 %d건에 소견을 답니다." % len(rows))

    verdicts = ask(akey, rows)
    if not verdicts:
        print("AI 응답을 쓰지 못했습니다. 대기열은 그대로 두었습니다.")
        return 0

    now = datetime.now(timezone.utc).isoformat()
    counts, done = {"ok": 0, "review": 0, "spam": 0}, 0
    for v in verdicts:
        if not isinstance(v, dict):
            continue
        i, verdict = v.get("i"), v.get("v")
        if not isinstance(i, int) or not (0 <= i < len(rows)):
            continue
        if verdict not in counts:
            continue
        row = rows[i]
        table = KINDS.get(row.get("kind"))
        if not table:
            continue
        why = str(v.get("why") or "")[:80]
        try:
            # status 는 손대지 않는다. 게시 여부는 사람이 정한다.
            sb_patch(base, skey, "%s?id=eq.%d" % (table, int(row["id"])),
                     {"ai_verdict": verdict, "ai_reason": why, "ai_at": now})
            counts[verdict] += 1
            done += 1
        except Exception as e:
            print("  쓰기 실패 %s#%s — %s" % (table, row.get("id"), type(e).__name__))

    print("소견을 단 글 %d건 — 무난 %d · 확인 필요 %d · 스팸 의심 %d"
          % (done, counts["ok"], counts["review"], counts["spam"]))
    print("게시는 하지 않았습니다. Table Editor 에서 status 를 정해 주세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
