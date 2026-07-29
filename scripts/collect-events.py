#!/usr/bin/env python3
"""플레이DB 인순이 아티스트 페이지에서 예정(종료일이 오늘 이후) 공연을 수집한다.
GitHub Actions가 매일 실행 → assets/data/live-events.json 갱신 → 전체 일정에 자동 표시."""
import json, os, re, sys, urllib.request
from datetime import date

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "assets", "data", "live-events.json")
ARTIST_URL = "http://www.playdb.co.kr/artistdb/detail.asp?ManNo=1181"  # 인순이


def main():
    req = urllib.request.Request(ARTIST_URL, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
    if "인순이" not in html:
        print("sanity check failed: page does not mention the artist", file=sys.stderr)
        sys.exit(1)
    # 카드: 제목 li → (장소 li, 기간 li) 순서. 클래스 해시는 빌드마다 변하므로 접두어로 매칭.
    cards = re.findall(
        r'DetailInfo_ticketTitle[^"]*">([^<]+)</li>.*?<li>([^<]*)</li><li class="DetailInfo_ticketDate[^"]*">'
        r"(\d{4}\.\d{1,2}\.\d{1,2})\s*~\s*(\d{4}\.\d{1,2}\.\d{1,2})",
        html, re.S)
    today = date.today()
    items = []
    for title, venue, start, end in cards:
        try:
            e = date(*map(int, end.split(".")))
        except ValueError:
            continue
        if e < today:
            continue
        items.append({
            "title": title.strip(),
            "place": venue.strip(),
            "start": start.replace(".", "-"),
            "end": end.replace(".", "-"),
            "src": "플레이DB",
            "url": "http://www.playdb.co.kr/artistdb/detail.asp?ManNo=1181",
        })
    items.sort(key=lambda x: x["start"])
    json.dump({"items": items, "checked": today.isoformat()},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(items)} upcoming item(s); checked {today}")


if __name__ == "__main__":
    main()
