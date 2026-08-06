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
    # 2026-08-06 점검: 이 긁기는 정상 동작한다. 카드 17개를 찾았고 그중 예정(오늘 이후)이
    #   0건이라 "0 upcoming" 이 맞는 값이었다. 스크래퍼 고장이 아니다.
    #   (curl -I 로 확인하면 302 만 보여 고장처럼 보인다 — urllib 은 리다이렉트를 따라간다.)
    #
    #   다만 "카드를 하나도 못 찾음"과 "예정 공연이 없음"은 화면에서 똑같이 0으로 보인다.
    #   플레이DB 는 이미 Next.js 로 갈아탔고 클래스 해시도 빌드마다 바뀌므로,
    #   언젠가 이 정규식은 조용히 죽는다. 그날 0을 "확인된 0"으로 착각하지 않도록
    #   카드 자체를 못 찾으면 실패로 알린다.

    # 카드: 제목 li → (장소 li, 기간 li) 순서. 클래스 해시는 빌드마다 변하므로 접두어로 매칭.
    cards = re.findall(
        r'DetailInfo_ticketTitle[^"]*">([^<]+)</li>.*?<li>([^<]*)</li><li class="DetailInfo_ticketDate[^"]*">'
        r"(\d{4}\.\d{1,2}\.\d{1,2})\s*~\s*(\d{4}\.\d{1,2}\.\d{1,2})",
        html, re.S)
    if not cards:
        # 기존 파일을 덮어쓰지 않는다 — 마지막으로 알던 예정 공연을 지우면
        # 사이트가 "공연이 없다"고 거짓말하게 된다.
        print("PARSER BROKEN: 공연 카드를 하나도 못 찾았다. "
              "플레이DB 구조가 바뀌었을 수 있다. live-events.json 은 그대로 둔다.",
              file=sys.stderr)
        sys.exit(1)

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
