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


# ============================================================
# 같은 사건의 기사 묶기 — AI 없이
#
# 한 사건을 네댓 곳이 각자의 제목으로 쓴다. 제목 글자가 겹치지 않아
# 통짜 비교로는 절대 안 묶인다. 실제로 16건 중 절반이 중복이었다.
#
#   경수진 시구→인순이 애국가 '특집 불꽃야구 생중계' 고척돔 달군다
#   경수진 시구·인순이 애국가…'불꽃야구' 동국대전 출격
#   ‘불꽃야구’ 동국대전, 경수진 시구·인순이 애국가 출격
#
# 낱말 단위로 쪼개고 조사를 떼면 '경수진·시구·애국가·불꽃야구'가 공통으로 남는다.
# 날짜가 가깝고 이런 '드문 낱말'을 함께 쓰면 같은 사건이다.
#
# 못 묶는 것보다 **엉뚱하게 묶는 쪽이 훨씬 나쁘다** — 서로 다른 소식이
# 하나로 뭉개지면 소식이 사라진다. 그래서 문턱을 보수적으로 잡았다.
# ============================================================

# 어느 기사에나 나오는 말은 구별에 쓸 수 없다
_STOP_BASE = """인순이 가수 공연 무대 콘서트 출격 개최 열린 열려 함께 이번 지난 오는 내달
                올해 그리고 위해 대한 통해 기념 행사 소식 화제 눈길 모습 현장 사진 포토
                오늘 내일 어제 관련 대해 라며 라고 밝혀 전해""".split()
_PARTICLES = ("에서", "으로", "이랑", "에게", "까지", "부터", "이나", "라며", "라고",
              "은", "는", "이", "가", "을", "를", "에", "의", "도", "와", "과", "로", "만")


def _strip_particle(w):
    for p in _PARTICLES:                        # 조사가 붙어 있으면 같은 낱말이 달라 보인다
        if len(w) > len(p) + 1 and w.endswith(p):
            return w[: -len(p)]
    return w


# 불용어도 조사를 떼면 다른 낱말이 된다. '인순이' → '인순'.
# 이걸 빼먹으면 **모든 기사가 '인순'이라는 낱말 하나를 공유**하게 되어
# 제목이 짧을수록 서로 다른 소식이 엉뚱하게 묶인다. 실제로 그랬다.
_STOP = set(_STOP_BASE) | {_strip_particle(w) for w in _STOP_BASE}


def story_tokens(title):
    """제목에서 사건을 구별할 만한 낱말만 뽑는다."""
    out = set()
    for w in re.split(r"[^가-힣A-Za-z0-9]+", title or ""):
        if len(w) < 2 or w in _STOP:
            continue
        w = _strip_particle(w)
        if len(w) >= 2 and w not in _STOP:
            out.add(w)
    return out


def _day_gap(a, b):
    try:
        f = "%Y-%m-%d"
        return abs((datetime.strptime(a, f) - datetime.strptime(b, f)).days)
    except Exception:
        return 999                              # 날짜를 못 읽으면 다른 사건으로 둔다


def cluster_stories(items):
    """같은 사건끼리 묶는다. items 의 인덱스 묶음 목록을 돌려준다."""
    n = len(items)
    if n < 2:
        return [[i] for i in range(n)]

    toks = [story_tokens(it.get("title")) for it in items]
    rare = {}
    for t in toks:
        for w in t:
            rare[w] = rare.get(w, 0) + 1

    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        a, b = find(i), find(j)
        if a != b:
            parent[max(a, b)] = min(a, b)

    for i in range(n):
        for j in range(i + 1, n):
            if _day_gap(items[i].get("date", ""), items[j].get("date", "")) > 2:
                continue
            ta, tb = toks[i], toks[j]
            shared = ta & tb
            if not shared:
                continue
            jac = len(shared) / float(len(ta | tb))
            # 후보 전체에서 드문 낱말(=그 사건에만 나오는 고유명사)을 둘 이상 공유하면 확실하다
            rare_shared = sum(1 for w in shared if rare.get(w, 0) <= 4)
            # 낱말 하나만 겹칠 때는 비율이 아무리 높아도 묶지 않는다.
            # 짧은 제목 둘이 우연히 한 낱말을 공유하면 비율이 1.0이 되어 버린다.
            if (jac >= 0.34 and len(shared) >= 2) or rare_shared >= 2:
                union(i, j)

    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


_PHOTO = re.compile(r"^\s*[\[\(【]?\s*(포토|사진|영상|photo)\s*[\]\)】]", re.I)
_CAPTION = re.compile(r"(는|은)\s*(가수\s*)?인순이\s*$")


def is_caption(title):
    """'[포토] 애국가 부르는 가수 인순이' 같은 사진 설명인가."""
    t = title or ""
    return bool(_PHOTO.search(t) or _CAPTION.search(t))


def _caption_grade(title):
    """0 = [포토] 표시가 붙은 것, 1 = 표시는 없지만 캡션 어투, 2 = 보통 기사."""
    t = title or ""
    if _PHOTO.search(t):
        return 0
    if _CAPTION.search(t):
        return 1
    return 2


def pick_lead(items, idxs):
    """묶음의 대표 — 사진 캡션이 아닌 것 중 정보가 가장 많은 제목.

    묶음이 전부 캡션이면 그중 가장 나은 것을 남긴다. 실제로 있었던 일이므로
    통째로 지우면 소식 하나가 사라진다. 다만 '[포토]' 표시가 붙은 것은
    같은 캡션끼리라도 가장 나중에 고른다 — 글자 수만 보면 표시가 붙은 쪽이
    길어서 오히려 대표가 되어 버린다."""
    if not idxs:
        return None

    def rank(i):
        t = items[i].get("title", "")
        return (_caption_grade(t), len(story_tokens(t)), len(t))

    return max(idxs, key=rank)


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

    # ── ① 같은 사건 묶기 (규칙, 언제나 실행) ──────────────────
    # 키가 없어도 여기까지는 된다. 실측: 16건 → 10건, 사람이 매긴 정답과 일치.
    pool = ranked[:40]
    groups = cluster_stories(pool)
    merged = []
    for g in sorted(groups, key=min):
        lead = pick_lead(pool, g)
        it = pool[lead]
        if len(g) > 1:
            it["also"] = len(g) - 1          # 몇 곳이 함께 보도했는지는 사실이다
        merged.append(it)
    merged.sort(key=lambda x: (-score(x), -x["_when"].timestamp()))
    if len(merged) < len(pool):
        print("  같은 사건 묶기: %d건 → %d건" % (len(pool), len(merged)))

    # ── ② AI 큐레이션 (키가 있을 때만) ────────────────────────
    # 규칙이 못 하는 판단을 맡는다 — 인순이가 주인공인 기사인지,
    # 공식 사이트에 올려도 좋은 소식인지. 묶기는 위에서 이미 끝났다.
    # AI는 고르고 분류만 한다. 문장은 쓰지 않는다.
    # 키가 없거나 실패하면 ①의 결과가 그대로 쓰인다.
    candidates = merged
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
        items = merged[:16]
        mode = "규칙 기반"

    items.sort(key=lambda x: x["_when"], reverse=True)   # 화면에는 최신순으로
    for x in items:
        x.pop("_when", None)
        x.pop("_ts", None)

    # ── 소식 아카이브 — 한 번 모은 것은 잃지 않는다 ────────────
    # live-news.json 은 최근 90일·상위 16건만 남긴다. 그대로 두면
    # 지난 소식이 사라진다. 공식 사이트인데 쌓이는 것이 없다.
    # 그래서 별도 파일에 **계속 더한다.** 지우지 않는다.
    ARCH = os.path.join(BASE, "assets", "data", "news-archive.json")
    try:
        old_arch = json.load(open(ARCH, encoding="utf-8")).get("items", [])
    except Exception:
        old_arch = []
    by_url = {}
    for x in old_arch:
        if x.get("url"):
            by_url[x["url"]] = x
    fresh = 0
    for x in items:
        u = x.get("url")
        if u and u not in by_url:
            by_url[u] = {k: v for k, v in x.items() if not k.startswith("_")}
            fresh += 1
    arch = sorted(by_url.values(), key=lambda x: x.get("date", ""), reverse=True)
    with open(ARCH, "w", encoding="utf-8") as f:
        json.dump({
            "note": ("모아 둔 소식 전체. 한 번 들어온 것은 지우지 않는다. "
                     "live-news.json 은 최근 것만 보여 주는 창이고, 이 파일이 기록이다."),
            "updated": now.astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
            "count": len(arch),
            "items": arch,
        }, f, ensure_ascii=False, indent=1)
    print("  아카이브: 새로 %d건 · 누적 %d건" % (fresh, len(arch)))

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
