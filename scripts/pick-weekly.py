#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""이번 주의 무대를 정한다 — 팬이 고른 1위 곡.

사랑방의 신청곡을 세어 가장 많이 불린 곡을 이번 주의 무대로 올린다.
사람의 손이 닿지 않는다. 팬이 고른 것이 그대로 무대가 된다.

화면 층은 갈아끼울 수 있다 —
  assets/media/weekly/<곡슬러그>.mp4 가 있으면 그 영상을 쓴다 (Higgsfield 등)
  없으면 아카이브 사진이 천천히 흐르는 화면으로 돌아간다
어느 쪽이든 소리는 어머니의 실제 음원이다. 목소리는 만들지 않는다.

지난 주와 1위가 같으면 갱신하지 않는다 — 같은 무대를 두 주 연속 새것처럼
올리면 거짓말이 된다. 대신 몇 주째인지 적는다.

신청이 없으면 파일을 쓰지 않는다. 빈 무대를 세우느니 아무것도 안 세운다.
"""
import json, os, re, sys, urllib.request
from collections import Counter
from datetime import datetime, timezone, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "assets", "data", "weekly.json")
CFG = os.path.join(BASE, "assets", "js", "config.js")
MEDIA = os.path.join(BASE, "assets", "media", "weekly")
KST = timezone(timedelta(hours=9))


def slug(t):
    """파일 이름으로 쓸 수 있게. 한글은 그대로 두되 공백·기호만 정리한다."""
    return re.sub(r"[^0-9A-Za-z가-힣]+", "-", t).strip("-").lower()


def cfg():
    s = open(CFG, encoding="utf-8").read()
    url = re.search(r"https://[a-z0-9]+\.supabase\.co", s)
    key = re.search(r"(sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]{40,})", s)
    if not url or not key:
        print("설정을 못 읽었다 — config.js 에 url/anonKey 가 있어야 한다", file=sys.stderr)
        sys.exit(1)
    return url.group(0), key.group(0)


def main():
    base, key = cfg()
    req = urllib.request.Request(
        base + "/rest/v1/song_requests?select=title",
        headers={"apikey": key, "Authorization": "Bearer " + key})
    rows = json.loads(urllib.request.urlopen(req, timeout=25).read().decode("utf-8"))

    counts = Counter((r.get("title") or "").strip() for r in rows if (r.get("title") or "").strip())
    if not counts:
        print("신청이 아직 없다. 빈 무대를 세우지 않는다.")
        return

    title, votes = counts.most_common(1)[0]
    now = datetime.now(KST)
    week = now.strftime("%G-W%V")

    prev = {}
    if os.path.exists(OUT):
        try:
            prev = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            prev = {}

    # 같은 곡이 이어지면 새것인 척하지 않는다
    run = prev.get("run", 0) + 1 if prev.get("title") == title else 1

    # 곡 정보 (연도·앨범·재킷) 를 songs.json 에서 가져온다
    meta = {}
    songs_p = os.path.join(BASE, "assets", "data", "songs.json")
    if os.path.exists(songs_p):
        blob = json.load(open(songs_p, encoding="utf-8"))
        for s in (blob.get("songs") or blob if isinstance(blob, list) else []):
            if (s.get("t") or s.get("title")) == title:
                meta = {k: s.get(k) for k in ("y", "alTitle", "art", "artRemote") if s.get(k)}
                break

    # 화면 층: 영상이 있으면 영상, 없으면 사진
    sl = slug(title)
    vid = None
    for ext in (".mp4", ".webm"):
        if os.path.exists(os.path.join(MEDIA, sl + ext)):
            vid = "assets/media/weekly/" + sl + ext
            break

    out = {
        "note": ("이번 주의 무대. 사랑방 신청곡 1위를 그대로 올린다 — 사람이 고르지 않는다. "
                 "video 가 있으면 그 영상을, 없으면 아카이브 사진이 흐르는 화면을 쓴다. "
                 "소리는 언제나 어머니의 실제 음원이다. scripts/pick-weekly.py 가 만든다."),
        "week": week,
        "picked": now.strftime("%Y-%m-%d"),
        "title": title,
        "slug": sl,
        "votes": votes,
        "total": sum(counts.values()),
        "run": run,
        "video": vid,
        "meta": meta,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("이번 주의 무대: 「%s」 %d표 (%d주째) · 화면=%s"
          % (title, votes, run, "영상" if vid else "사진"))


if __name__ == "__main__":
    main()
