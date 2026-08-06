#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""무대의 기록 하나로 — 흩어진 세 목록을 연도 하나의 축에 꿴다.

아카이브가 조잡했던 이유는 서로 상관없는 목록 셋이 그냥 쌓여 있었기 때문이다.

  · 영상 35편   1979–1992  방송사·곡명이 있다        → 값어치가 크다
  · 일정 872건  2005–2013  장소·시간이 있는 것도 있고
                           "밴드 안무연습 14:00~" 도 있다  → 절반이 업무 일지
  · 사진 66장   2005       인순이 본인의 캡션          → 성격이 다르다

일정 872건을 그대로 늘어놓은 것이 조잡함의 정체였다. 남의 업무 달력이지
무대의 기록이 아니다. 걸러 내면 396건이 남는다 — 장소와 시간이 붙은 진짜 무대다.

그 396건과 영상 35편을 합치면 1979년부터 2013년까지 한 줄기가 된다.
사진은 성격이 다르므로 따로 둔다.

거르는 규칙 (실측으로 정했다)
  버린다  : 연습·리허설·미팅·회의·대기·이동·의상·미용 — 무대가 아니다
  남긴다  : kind 가 방송/라디오/촬영 이거나, 본문에 공연 낱말이 있는 것
  판단 근거를 항목마다 why 로 남긴다 — 나중에 규칙을 고칠 때 무엇이 왜
           들어왔는지 알 수 있어야 한다.

원본 파일은 읽기만 한다. 결과는 assets/data/stages.json.
멱등하다 — 같은 입력이면 같은 출력.
"""
import json, os, re, sys
from collections import defaultdict

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(BASE, "assets", "data")
OUT = os.path.join(D, "stages.json")

REH = re.compile(r"연습|리허설|미팅|회의|대기|이동|의상|미용|녹음실|사전점검")
STAGE = re.compile(r"콘서트|공연|디너쇼|축제|페스티벌|리사이틀|무대|시상|행사|초청")
VENUE = re.compile(r"\(([^)]{2,30})\)")
TIME = re.compile(r"\d{1,2}:\d{2}")


def load(name):
    p = os.path.join(D, name)
    if not os.path.exists(p):
        return []
    blob = json.load(open(p, encoding="utf-8"))
    return blob.get("items", blob if isinstance(blob, list) else [])


def clean(t):
    """줄바꿈과 겹공백을 없애고 앞머리 별표를 뗀다."""
    return re.sub(r"\s+", " ", (t or "").replace("*", " ")).strip()


def from_schedule():
    rows = []
    for it in load("old-schedule.json"):
        text, date, kind = it.get("text") or "", it.get("date") or "", it.get("kind") or ""
        if not date or len(date) < 4:
            continue
        if REH.search(text):
            continue
        if kind in ("방송", "라디오", "촬영"):
            why = "kind=" + kind
        elif STAGE.search(text):
            why = "본문에 공연 낱말"
        else:
            continue
        v = VENUE.search(text)
        rows.append({
            "y": date[:4], "date": date,
            "t": clean(text)[:110],
            "venue": (v.group(1).strip() if v else ""),
            "kind": kind or "무대",
            "why": why,
        })
    return rows


def from_videos():
    rows = []
    for it in load("old-videos.json"):
        y = it.get("year")
        if not y:
            continue
        rows.append({
            "y": str(y), "date": "",
            "t": clean(it.get("song") or it.get("raw") or "")[:110],
            "venue": clean(it.get("source") or ""),
            "kind": "영상",
            "who": clean(it.get("who") or ""),
            "why": "영상 목록",
        })
    return rows


def main():
    rows = from_schedule() + from_videos()
    if len(rows) < 200:
        # 조용히 빈 파일을 쓰지 않는다. 원본이 바뀌었는데 규칙이 안 맞으면
        # "기록이 없다"로 보이는데, 그건 사실이 아니다.
        print("실패: 무대가 %d건뿐이다. 원본이나 거르는 규칙을 확인할 것." % len(rows),
              file=sys.stderr)
        sys.exit(1)

    by_year = defaultdict(list)
    for r in rows:
        by_year[r["y"]].append(r)
    years = []
    for y in sorted(by_year, reverse=True):
        items = sorted(by_year[y], key=lambda r: (r["date"] or "9999", r["t"]))
        years.append({"y": y, "n": len(items), "items": items})

    out = {
        "note": ("무대의 기록. 옛 일정 872건에서 연습·이동·개인 일정을 걷어낸 것과 "
                 "영상 목록을 합쳐 연도로 묶었다. 새 사실은 만들지 않았다. "
                 "scripts/build-stages.py 가 만든다 — 손으로 고치지 말 것."),
        "count": len(rows),
        "first": years[-1]["y"], "last": years[0]["y"],
        "years": years,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("무대 %d건 · %s–%s · %d개 해" % (len(rows), out["first"], out["last"], len(years)))


if __name__ == "__main__":
    main()
