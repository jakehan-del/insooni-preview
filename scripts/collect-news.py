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
# 동명이인(가수 아닌 '인순이') 기사 배제.
# 예: 방송인 박경배의 아내 '인순이' — '아내 인순이' 맥락. 가수와 무관하므로 제외한다.
NON_SINGER = [
    "박경배", "아내 인순이", "부인 인순이", "인순이씨 남편", "며느리", "장모",
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
            source_site = (src_el.get("url") or "").strip() if src_el is not None else ""
            when = parse_date(pub)
            if not raw or not link or not when:
                continue
            if when < cutoff:
                continue
            if "인순이" not in raw:
                continue
            if any(x in raw for x in NON_SINGER):
                continue                                  # 동명이인(가수 아닌 인순이) 제외
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
                "sourceSite": source_site,
                "url": link,
                "type": classify(title),
                "auto": True,
                "_when": when,
            }

    # '좋은 소식'을 앞세운다: 어머니가 주인공이거나 따뜻한 이야기일수록 위로.
    # (다른 사람이 주인공이고 인순이는 심사평만 한 줄 나오는 기사는 뒤로 밀린다)
    HEART = ["해밀", "기부", "후원", "나눔", "장학", "선행", "감동", "울컥", "눈물", "위로",
             "헌정", "존경", "레전드", "디바", "거위의 꿈"]
    HONOR = ["수상", "시상", "영예", "헌액", "공로", "표창", "위촉", "홍보대사", "명예"]
    STAGE = ["공연", "콘서트", "무대", "열창", "애국가", "신곡", "발매", "앨범", "컴백", "리사이틀", "디너쇼"]

    def score(x):
        t2 = x["title"]
        s2 = 0
        if t2.startswith("인순이") or t2.startswith("가수 인순이"):
            s2 += 40                       # 어머니가 기사 주인공
        s2 += 30 * sum(1 for k in HEART if k in t2)
        s2 += 24 * sum(1 for k in HONOR if k in t2)
        s2 += 12 * sum(1 for k in STAGE if k in t2)
        if "인순이" in t2[:14]:
            s2 += 10                       # 제목 앞쪽에 언급될수록 비중이 크다
        return s2

    ranked = sorted(by_key.values(), key=lambda x: (-score(x), -x["_when"].timestamp()))

    # ── AI 큐레이션 ──────────────────────────────────────────
    # 규칙으로는 같은 사건의 기사 네댓 건을 묶지 못한다. 제목 글자가 겹치지 않기
    # 때문이다. 실제로 16건 중 절반이 같은 이야기의 중복이었다.
    # AI는 묶고·버리고·분류만 한다. 문장은 쓰지 않는다.
    # 키가 없거나 실패하면 아래 규칙 기반 결과가 그대로 쓰인다.
    candidates = ranked[:40]
    for x in candidates:
        x["_ts"] = x["_when"].timestamp()
    curated = None
    try:
        from ai_curate import curate
        curated = curate([{k: v for k, v in x.items() if not k.startswith("_")} for x in candidates])
    except ImportError:
        print("  ai_curate.py 없음 — 규칙 기반 결과를 씁니다")
    except Exception as e:
        print("  AI 큐레이션 중 예외 (%s) — 규칙 기반 결과를 씁니다" % type(e).__name__)

    if curated:
        by_url = {x["url"]: x["_when"] for x in candidates}
        items = curated[:16]
        for x in items:
            x["_when"] = by_url.get(x.get("url"))
        items = [x for x in items if x["_when"]]
        mode = "AI 큐레이션"
    else:
        items = ranked[:16]
        mode = "규칙 기반"

    items.sort(key=lambda x: x["_when"], reverse=True)   # 화면에는 최신순으로
    for x in items:
        x.pop("_when", None)
        x.pop("_ts", None)

    doc = {
        "note": ("인순이 관련 좋은 소식 자동 수집 (Google News RSS). 부정 키워드 제외 후 "
                 + mode + "으로 같은 사건을 묶고 사진 캡션·곁다리 기사를 걸러냅니다. "
                 "제목과 링크는 원문 그대로입니다."),
        "mode": mode,
        "updated": now.astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
        "items": items,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print("collected", len(items), "good-news items")
    for x in items[:8]:
        print("  [%s] %s · %s" % (x["date"], x["title"][:56], x["source"]))


if __name__ == "__main__":
    main()
