#!/usr/bin/env python3
"""인순이 관련 '좋은 소식'을 매일 자동 수집해 live-news.json을 갱신한다.
GitHub Actions가 매일 실행. 표준 라이브러리만 사용(키·토큰 불필요).

수집 원칙(공식 사이트 무결성):
- 출처 = Google News RSS(한국 언론 기사 집계). 각 항목은 원문으로 링크한다.
- 제목에 '인순이'가 있어야 한다(동명이인·오검색 방지).
- **부정적 소식은 전부 제외한다** — 사고·논란·소송·부고·건강 이상 등 키워드가 하나라도 있으면 버린다.
  공식 어머니 사이트에는 좋은 소식만 올린다는 사용자 지시를 코드로 지킨다.
- 제목 정규화로 중복 기사를 합치고, 최근 90일·최대 16건만 남긴다.
- 자동 수집분임을 데이터에 표시한다(auto=true) — 화면에서 '자동 수집 · 출처'로 구분된다.
"""
import json, os, re, urllib.request, urllib.parse
from xml.etree import ElementTree
from datetime import datetime, timezone, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "assets", "data", "live-news.json")

QUERIES = ['"인순이"', "가수 인순이", "인순이 공연", "인순이 콘서트", "인순이 신곡"]

# 이 중 하나라도 제목에 있으면 버린다 (좋은 소식만 남기기)
NEGATIVE = [
    "사망", "별세", "부고", "빈소", "유족", "영결", "추모", "고인",
    "논란", "의혹", "구설", "루머", "악플", "비판", "파문", "뭇매", "역풍",
    "사고", "부상", "낙상", "화재",
    "사기", "소송", "고소", "고발", "피소", "입건", "검찰", "경찰", "구속", "벌금", "재판", "법정",
    "갑질", "폭행", "폭로", "논란", "마약", "음주운전", "성희롱", "성추행", "학폭", "표절",
    "이혼", "열애", "결별", "불화", "갈등",
    "위독", "입원", "응급", "쓰러", "건강 악화", "수술",
    "자숙", "사과", "해명", "저격", "디스", "손절",
]
# 가수 맥락을 확인하는 긍정·중립 표지 (하나 이상 있어야 채택 — 무관 기사 배제)
POSITIVE = [
    "가수", "무대", "공연", "콘서트", "라이브", "리사이틀", "디너쇼", "축제",
    "신곡", "발매", "앨범", "싱글", "음원", "컴백", "헌정",
    "출연", "방송", "심사", "심사위원", "무대에", "노래", "열창", "듀엣", "합창",
    "수상", "시상", "상 받", "영예", "헌액",
    "해밀", "기부", "후원", "나눔", "장학", "선행", "감동",
    "인터뷰", "디바", "거위의 꿈", "희자매", "골든걸스", "애국가",
]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def norm(s):
    return re.sub(r"[\s'\"`·.,!?()\[\]/\-–—…]", "", s).lower()


def parse_date(pub):
    for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S GMT"):
        try:
            return datetime.strptime(pub, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def classify(title):
    # 소식 페이지 필터(공연/방송/보도)에 맞춘다 — 보도가 기사 전반의 기본값
    if any(k in title for k in ("공연", "콘서트", "무대", "디너쇼", "축제", "리사이틀", "라이브", "열창", "애국가")):
        return "공연"
    if any(k in title for k in ("방송", "출연", "심사", "예능", "라디오", "오디션", "TV", "SBS", "KBS", "MBC")):
        return "방송"
    return "보도"


def clean_title(raw):
    """구글 뉴스는 '제목 - 언론사' 형태. 뒤 언론사명을 떼어 낸다."""
    return re.sub(r"\s*[-–]\s*[^-–]{1,20}$", "", raw).strip()


def main():
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=90)
    by_key = {}

    for q in QUERIES:
        try:
            url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(q) + "&hl=ko&gl=KR&ceid=KR:ko"
            root = ElementTree.fromstring(fetch(url))
        except Exception as e:
            print("query fail", q, e)
            continue
        for it in root.findall(".//item"):
            raw = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            pub = it.findtext("pubDate") or ""
            src_el = it.find("{*}source")
            source = src_el.text.strip() if src_el is not None and src_el.text else ""
            when = parse_date(pub)
            if not raw or not link or not when:
                continue
            if when < cutoff:
                continue
            if "인순이" not in raw:
                continue
            if any(neg in raw for neg in NEGATIVE):
                continue                                  # 부정적 소식 제외
            if not any(pos in raw for pos in POSITIVE):
                continue                                  # 가수 맥락 확인
            title = clean_title(raw)
            key = norm(title)[:40]
            if key in by_key and by_key[key]["_when"] >= when:
                continue
            by_key[key] = {
                "date": when.astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d"),
                "title": title,
                "source": source,
                "url": link,
                "type": classify(title),
                "auto": True,
                "_when": when,
            }

    items = sorted(by_key.values(), key=lambda x: x["_when"], reverse=True)[:16]
    for x in items:
        x.pop("_when", None)

    doc = {
        "note": "인순이 관련 좋은 소식 자동 수집 (Google News RSS, 매일). 부정 키워드 제외·중복 병합.",
        "updated": now.astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d"),
        "items": items,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print("collected", len(items), "good-news items")
    for x in items[:8]:
        print("  [%s] %s · %s" % (x["date"], x["title"][:56], x["source"]))


if __name__ == "__main__":
    main()
