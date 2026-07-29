#!/usr/bin/env python3
"""공식 유튜브 채널 RSS에서 인순이 무대 영상을 수집해 live-shows.json을 갱신한다.
GitHub Actions가 매일 실행. 표준 라이브러리만 사용.

수집 원칙(사이트 무결성 규칙과 동일):
- 공식 채널 피드만 구독한다 (아래 CHANNELS).
- 제목에 '인순이'가 들어간 영상만 채택한다 (공식 채널 명의의 실명 표기 = 검증된 출연 기록).
- 이미 사이트 데이터(data.js)나 기존 수집분에 있는 videoId는 제외한다.
"""
import json, re, os, sys, urllib.request
from xml.etree import ElementTree

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "assets", "data", "live-shows.json")
DATA_JS = os.path.join(BASE, "assets", "js", "data.js")

CHANNELS = [
    ("INSOONI 인순이 (공식)", "UCYxEvZRnhUrGOhHv5fMCh5Q"),
    ("KBS 레전드 케이팝", "UCR5cyf8hncN_AaQPfmvmlgA"),
    ("MBN MUSIC", "UCsxbX6QnOLal_qzzMK9AR9g"),
    ("tvN Joy", "UC78PMQprrZTbU0IlMDsYZPw"),
    ("TVCHOSUN", "UCuw1hxBo5mDVUhgMzRDk3aw"),
]
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015",
      "m": "http://search.yahoo.com/mrss/"}


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def known_ids():
    """자체 수집분만 중복 제거 대상 — 리캡과의 공존은 허용(관점이 다른 두 목록)"""
    ids = set()
    if os.path.exists(OUT):
        for item in json.load(open(OUT, encoding="utf-8")).get("items", []):
            ids.add(item["id"])
    return ids


def main():
    seen = known_ids()
    existing = {"items": []}
    if os.path.exists(OUT):
        existing = json.load(open(OUT, encoding="utf-8"))
    new_items = []
    for channel_name, cid in CHANNELS:
        try:
            xml = fetch(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}")
        except Exception as e:
            print(f"skip {channel_name}: {e}", file=sys.stderr)
            continue
        root = ElementTree.fromstring(xml)
        for entry in root.findall("a:entry", NS):
            vid = entry.findtext("yt:videoId", "", NS)
            title = entry.findtext("a:title", "", NS)
            published = entry.findtext("a:published", "", NS)[:10]
            if not vid or vid in seen or "인순이" not in title:
                continue
            # Shorts 제외 (세로 릴스는 사이트 문법에 안 맞음)
            if "#shorts" in title.lower():
                continue
            # 1년 넘은 항목은 '최근' 목록의 취지에 안 맞음
            from datetime import date, timedelta
            try:
                y, m, dd = map(int, published.split("-"))
                if date(y, m, dd) < date.today() - timedelta(days=365):
                    continue
            except ValueError:
                pass
            seen.add(vid)
            new_items.append({
                "id": vid,
                "title": title.strip(),
                "channel": channel_name,
                "date": published,
            })
            print(f"+ {published} {channel_name}: {title}")
    if new_items:
        existing["items"] = sorted(existing.get("items", []) + new_items,
                                   key=lambda x: x["date"], reverse=True)[:60]
        existing["updated"] = max(i["date"] for i in existing["items"])
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        json.dump(existing, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"wrote {len(new_items)} new item(s)")
    else:
        print("no new items")


if __name__ == "__main__":
    main()
