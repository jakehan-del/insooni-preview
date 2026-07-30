#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AI 뉴스 큐레이터.

키워드 규칙만으로는 못 하는 일 세 가지를 맡는다.

  1. 같은 사건을 다룬 기사 묶기
     '경수진 시구→인순이 애국가 특집 불꽃야구 생중계 고척돔 달군다'와
     '경수진 시구·인순이 애국가…불꽃야구 동국대전 출격'은 같은 이야기다.
     제목 글자가 겹치지 않아 정규화 비교로는 절대 안 묶인다.
  2. 사진 캡션·통신사 배포문 걸러내기
     '[포토] 애국가 부르는 가수 인순이'는 소식이 아니다.
  3. 인순이가 곁다리인 기사 걸러내기
     라인업 나열에 이름만 한 번 나오는 기사와 그가 주인공인 기사를 가른다.

── 지키는 것 ─────────────────────────────────────────────
AI에게 문장을 쓰게 하지 않는다. 고르고 묶고 분류만 시킨다.
화면에 나가는 제목은 실제 기사 제목 그대로이고 링크도 원문으로 간다.
요약을 쓰게 하면 제목에 없는 사실이 섞여 들어가고, 그건 공식 사이트에서
일어나면 안 되는 일이다.

키가 없거나 호출이 실패하면 None을 돌려준다. 부르는 쪽은 지금까지의
규칙 기반 결과를 그대로 쓴다. 사이트는 어느 쪽이든 정상 동작한다.

키는 코드에 넣지 않는다. GitHub Actions의 저장소 secret(ANTHROPIC_API_KEY)에서
환경변수로만 받는다.
"""
import json, os, re, urllib.request, urllib.error

API = "https://api.anthropic.com/v1/messages"
MODEL = "claude-haiku-4-5-20251001"
TIMEOUT = 90

SYSTEM = """당신은 가수 인순이의 공식 홈페이지에 올릴 뉴스를 고르는 편집자다.

주어진 기사 목록에서 다음을 판단한다. 새 문장을 쓰지 마라. 고르고 묶기만 한다.

[묶기] 같은 사건을 다룬 기사들을 한 묶음으로 만든다.
  - 같은 공연·같은 방송·같은 시상식·같은 발표를 다루면 제목이 달라도 같은 묶음이다.
  - 각 묶음에서 대표 기사 하나를 고른다. 사건을 가장 잘 설명하고
    인순이의 역할이 분명한 제목을 고른다.

[버리기] 다음은 버린다.
  - 사진 캡션 기사 ([포토], [사진], '~하는 인순이' 같은 제목만 있는 것)
  - 인순이가 여러 출연자 중 하나로 이름만 스친 기사
  - 같은 내용을 재배포한 보도자료 (묶음의 대표가 아닌 것은 묶으면 되니 여기 넣지 마라)
  - 인순이가 아닌 다른 사람이 주인공인 기사

[분류] 각 묶음에 하나를 준다: 공연 / 방송 / 나눔 / 보도
  - 나눔 = 해밀학교, 기부, 후원, 장학, 봉사

[좋은 소식인가] 공식 홈페이지에 올려도 좋은 소식이면 true.
  사고·논란·소송·건강 악화·부고 같은 것이 조금이라도 비치면 false.

반드시 아래 JSON 형식만 출력한다. 설명을 덧붙이지 마라.
{"stories":[{"lead":0,"same":[3,7],"type":"공연","good":true}],"drop":[2,5]}
  lead  = 대표 기사의 번호
  same  = 같은 사건이라 대표에 합쳐지는 기사 번호들 (없으면 [])
  drop  = 어느 묶음에도 들어가지 않고 버릴 기사 번호들
모든 번호는 주어진 목록의 번호여야 하고, 한 번호는 한 곳에만 나온다."""


def _post(key, payload):
    req = urllib.request.Request(
        API,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def _extract_json(text):
    """모델이 앞뒤에 뭘 붙였더라도 첫 JSON 덩어리를 꺼낸다."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except ValueError:
        return None


def curate(items, log=print):
    """items: collect-news.py가 만든 후보 목록 (date/title/source/url/...).

    돌려주는 것: 추려서 정리한 새 목록. 못 하면 None.
    """
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        log("  AI 큐레이션 건너뜀 — ANTHROPIC_API_KEY 없음 (규칙 기반 결과를 씁니다)")
        return None
    if len(items) < 2:
        return None

    listing = "\n".join(
        "%d. [%s] %s  (%s)" % (i, it["date"], it["title"], it.get("source", ""))
        for i, it in enumerate(items)
    )

    try:
        res = _post(key, {
            "model": MODEL,
            "max_tokens": 2000,
            "system": SYSTEM,
            "messages": [{"role": "user", "content": "기사 목록:\n" + listing}],
        })
    except urllib.error.HTTPError as e:
        log("  AI 큐레이션 실패 — HTTP %s (규칙 기반 결과를 씁니다)" % e.code)
        return None
    except Exception as e:
        log("  AI 큐레이션 실패 — %s (규칙 기반 결과를 씁니다)" % type(e).__name__)
        return None

    text = "".join(b.get("text", "") for b in res.get("content", []) if b.get("type") == "text")
    doc = _extract_json(text)
    if not isinstance(doc, dict) or not isinstance(doc.get("stories"), list):
        log("  AI 큐레이션 실패 — 형식이 맞지 않음 (규칙 기반 결과를 씁니다)")
        return None

    n = len(items)
    used, out = set(), []
    for st in doc["stories"]:
        if not isinstance(st, dict):
            continue
        lead = st.get("lead")
        if not isinstance(lead, int) or not (0 <= lead < n) or lead in used:
            continue
        if st.get("good") is False:
            used.add(lead)
            continue
        used.add(lead)

        it = dict(items[lead])
        same = [j for j in (st.get("same") or [])
                if isinstance(j, int) and 0 <= j < n and j not in used and j != lead]
        for j in same:
            used.add(j)
        # 같은 사건을 몇 곳이 보도했는지는 사실이므로 그대로 남긴다
        if same:
            it["also"] = len(same)
        t = st.get("type")
        if t in ("공연", "방송", "나눔", "보도"):
            it["type"] = t
        it["ai"] = True
        out.append(it)

    if not out:
        log("  AI 큐레이션 결과가 비어 규칙 기반 결과를 씁니다")
        return None

    dropped = n - len(out)
    log("  AI 큐레이션: 후보 %d건 → %d건 (중복·캡션·곁다리 %d건 정리)" % (n, len(out), dropped))
    return out
