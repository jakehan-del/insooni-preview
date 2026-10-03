#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""인순이 관련 '좋은 소식'을 자동 수집해 소식 페이지 데이터를 만든다.
GitHub Actions(update-live.yml)가 2시간마다 실행한다. 표준 라이브러리만 쓴다.

  python3 scripts/collect-news.py               # 구글 뉴스를 보고 갱신 (CI)
  python3 scripts/collect-news.py --offline     # 네트워크 없이, 이미 모은 기사만 새 규칙으로 다시 만든다
  python3 scripts/collect-news.py --offline --dry   # 쓰지 않고 결과만 출력

파일 두 개
- news-archive.json : **기록.** 한 번 들어온 기사는 지우지 않는다(주소 기준).
                      원문 제목·언론사 표기도 함께 남긴다(rawTitle·rawSource).
- live-news.json    : **화면용.** 기록을 '사건' 단위로 묶은 것. 한 사건 = 한 줄 + 기사 N건.
                      기록에서 매번 다시 만든다 — 같은 기록이면 같은 결과(멱등).

지키는 것 (공식 사이트 무결성)
- 출처 = Google News RSS. 각 기사는 원문으로 링크한다.
- 제목에 '인순이'가 있어야 한다(동명이인·오검색 방지). 부정적 소식은 전부 버린다.
- **제목을 고쳐 쓰지 않는다.** 끝에 붙은 언론사·코너 꼬리표('- 스타투데이',
  "[엑's 현장]")만 덜어 낸다. 덜어 낸 제목은 언제나 원문 제목의 연속된 일부다.
- **언론사 이름을 지어내지 않는다.** 확실히 아는 곳만 표로 이름을 붙이고,
  모르는 곳은 도메인을 깔끔하게(www. 를 떼고) 그대로 보여 준다.
- **기사 날짜는 보도일이다.** 행사 날짜가 아니다. 화면도 '보도'라고 적는다.
  (실측: 8/23 기사=2011년 회고, 8/5 기사=5월 공연. 보도일을 행사일로 쓰면 거짓 날짜가 된다)
"""
import json, os, re, sys, math, urllib.request, urllib.parse
from xml.etree import ElementTree
from datetime import datetime, timezone, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "assets", "data", "live-news.json")
ARCH = os.path.join(BASE, "assets", "data", "news-archive.json")
KST = timezone(timedelta(hours=9))

# 질의를 넓혔다. 어머니는 노래만 하는 사람이 아니라 학교를 세운 사람이고
# 예능·시상식·출간까지 걸쳐 있다 — 한 갈래만 보면 절반을 놓친다.
QUERIES = [
    '"인순이"', "가수 인순이", "인순이 공연", "인순이 콘서트", "인순이 신곡",
    "인순이 디너쇼", "인순이 단독공연", "인순이 출연", "인순이 수상",
    "인순이 해밀학교", "인순이 신간", "인순이 골든걸스",
]

# 출처는 구글 뉴스 RSS 하나다.
# 네이버 RSS(search.naver.com/search.naver?where=rss)도 붙여 봤지만 폐지됐다 —
# 200 을 주지만 본문은 HTML 검색 페이지이고 <item> 이 0개다. 실측 확인.
# 죽은 출처를 목록에 남겨 두면 "두 곳을 본다"는 착각만 생기므로 넣지 않는다.
FEEDS = [
    ("google", "https://news.google.com/rss/search?q={q}&hl=ko&gl=KR&ceid=KR:ko"),
]

# 이 중 하나라도 제목에 있으면 버린다 (좋은 소식만 남기기)
NEGATIVE = [
    "사망", "별세", "부고", "빈소", "유족", "영결", "추모", "고인",
    "논란", "의혹", "구설", "루머", "악플", "비판", "파문", "뭇매", "역풍",
    "사고", "부상", "낙상", "화재",
    "사기", "소송", "고소", "고발", "피소", "입건", "검찰", "경찰", "구속", "벌금", "재판", "법정",
    "갑질", "폭행", "폭로", "마약", "음주운전", "성희롱", "성추행", "학폭", "표절",
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

# 화면에 몇 개를 싣나. 기록은 지우지 않지만 화면은 최근 1년·사건 60개까지만.
WINDOW_DAYS = 365
MAX_STORIES = 60
# 새 사건을 기록에 들이는 문 — 예전과 같다. 최근 90일 후보를 '좋은 소식' 점수로
# 줄 세워 상위 16개 사건만 들인다. 이미 기록된 사건에 붙는 새 기사는 언제나 들인다.
SELECT_DAYS = 90
SELECT_TOP = 16


# ============================================================
# 1. 언론사 이름
#
# 구글 뉴스는 언론사 이름을 줄 때도 있고 도메인만 줄 때도 있다
# (같은 시사코리아저널이 어느 날은 '시사코리아저널', 어느 날은 'koreajn.co.kr').
# 화면에 'XPORTSNEWS.COM' 이 뜨던 이유다.
#
# 아래 표는 **확실히 아는 곳만** 적는다. 근거 없이 이름을 붙이면 지어낸 것이다.
# 표에 없고 구글도 도메인만 줬다면, 같은 사이트를 구글이 이름으로 부른 기록이
# 있으면 그 이름을 쓰고(learned), 그것도 없으면 도메인을 그대로 깔끔하게 보인다.
# ============================================================
OUTLETS = {
    # 도메인 → 이름. 하위 도메인이 따로 있으면 그쪽이 먼저 맞는다.
    "xportsnews.com": "엑스포츠뉴스",
    "starnewskorea.com": "스타뉴스",
    "koreajn.co.kr": "시사코리아저널",     # 구글이 m.koreajn.co.kr 을 이 이름으로 표기(2026-09-28)
    "issuedaily.com": "이슈데일리",        # 구글 표기(2026-09-09)
    "sbs.co.kr": "SBS",
    "kbs.co.kr": "KBS",                    # 구글 표기가 '대한민국 대표 공영미디어 KBS'(구호)였다
    "mbc.co.kr": "MBC",
    "donga.com": "동아일보",
    "mk.co.kr": "매일경제",
    "news1.kr": "뉴스1",
    "newsis.com": "뉴시스",
    "yna.co.kr": "연합뉴스",
    "ohmynews.com": "오마이뉴스",
    "star.ohmynews.com": "오마이스타",
    "segye.com": "세계일보",
    "isplus.com": "일간스포츠",
    "spotvnews.co.kr": "SPOTV NEWS",
    "topstarnews.net": "톱스타뉴스",
    "newsen.com": "뉴스엔",
    "hansbiz.co.kr": "한스경제",
    "seoul.co.kr": "서울신문",
    "newsgn.com": "뉴스경남",
    "fashionbiz.co.kr": "패션비즈",
    "bntnews.co.kr": "bnt뉴스",
    "chosun.com": "조선일보",
    "joongang.co.kr": "중앙일보",
    "hani.co.kr": "한겨레",
    "khan.co.kr": "경향신문",
    "hankookilbo.com": "한국일보",
    "osen.co.kr": "OSEN",
    "sportschosun.com": "스포츠조선",
    "sports.donga.com": "스포츠동아",
    "tvreport.co.kr": "TV리포트",
    "mydaily.co.kr": "마이데일리",
    "edaily.co.kr": "이데일리",
    "heraldcorp.com": "헤럴드경제",
    "nocutnews.co.kr": "노컷뉴스",
    "sedaily.com": "서울경제",
    "hankyung.com": "한국경제",
    "mt.co.kr": "머니투데이",
    "kmib.co.kr": "국민일보",
    # 포털 — 언론사가 아니라 기사를 다시 싣는 곳. 이름은 사이트 이름 그대로.
    "daum.net": "다음 뉴스",
    "nate.com": "네이트",
    "naver.com": "네이버 뉴스",
}
PORTALS = {"daum.net", "nate.com", "naver.com", "zum.com", "msn.com"}

# 제목 끝에 붙는 섹션·코너 이름 (언론사 이름은 아니지만 꼬리표다)
SECTION_TAILS = {"스타투데이", "MK스포츠", "스포츠", "연예", "엔터", "문화", "사회", "생활",
                 "오피니언", "포토", "영상", "방송", "가요", "TV"}


def _host(site):
    h = re.sub(r"^[a-z]+://", "", (site or "").strip().lower()).split("/")[0].split(":")[0]
    return h


def _domain_keys(host):
    """'m.star.ohmynews.com' → ['m.star.ohmynews.com','star.ohmynews.com','ohmynews.com', ...]"""
    parts = host.split(".")
    return [".".join(parts[i:]) for i in range(len(parts) - 1)]


def _looks_domain(label):
    return bool(re.fullmatch(r"[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", (label or "").strip()))


def _clean_domain(host):
    return re.sub(r"^(www|m|v|mobile)\.", "", host)


def is_portal(site):
    h = _host(site)
    return any(k in PORTALS for k in _domain_keys(h)) if h else False


def outlet_name(source, site, learned=None):
    """언론사 표시 이름. (이름, 확실한가) — 확실하지 않으면 도메인을 깔끔하게."""
    label = (source or "").strip()
    host = _host(site) or (_host(label) if _looks_domain(label) else "")
    for k in _domain_keys(host) if host else []:
        if k in OUTLETS:
            return OUTLETS[k], True
    if label and not _looks_domain(label):
        return label, True
    if learned and host:
        for k in _domain_keys(host):
            if k in learned:
                return learned[k], True
    if label and _looks_domain(label):
        return _clean_domain(label.lower()), False
    if host:
        return _clean_domain(host), False
    return "", False


def learn_outlets(records):
    """구글이 이름으로 부른 적이 있는 사이트 → 그 이름. 한 사이트에 이름이 둘이면 쓰지 않는다.
    표(OUTLETS)에 있는 사이트는 표가 먼저 이기므로 여기서 무엇을 배우든 상관없다."""
    seen = {}
    for r in records:
        host = _host(r.get("sourceSite"))
        if not host:
            continue
        for label in {(r.get("rawSource") or "").strip(), (r.get("source") or "").strip()}:
            if label and not _looks_domain(label):
                seen.setdefault(_clean_domain(host), set()).add(label)
    return {k: sorted(v)[0] for k, v in seen.items() if len(v) == 1}


# ============================================================
# 2. 제목 꼬리표 떼기 — 요약·재작성 금지
#
# 구글 뉴스 제목은 '제목 - 언론사' 이고, 언론사가 다시 섹션 이름을 붙이기도 한다
# ('… - 스타투데이'). 코너 이름("[엑's 현장]")·섹션(' : 스포츠')·출처(' | KBS 260803 방송')도
# 제목 끝에 붙는다. 이것만 덜어 낸다.
#
# 함정: ' - ' 를 무조건 자르면 안 된다. '남진 & 인순이 - 님과 함께' 의 '님과 함께' 는
# 곡명이다. 그래서 아는 언론사·섹션 이름일 때만 자른다.
# ============================================================
_BRACKET_END = re.compile(r"\s*[\[【]([^\[\]【】]{1,24})[\]】]\s*$")
_BRACKET_START = re.compile(r"^\s*[\[【]([^\[\]【】]{1,24})[\]】]\s*")
_SECTION_COLON = re.compile(r"\s+:\s+(" + "|".join(sorted(map(re.escape, SECTION_TAILS), key=len, reverse=True)) + r")\s*$")


def clean_headline(raw, names=()):
    """(덜어 낸 제목, 덜어 낸 꼬리표 목록). names = 이 기사의 언론사 표기들."""
    t = re.sub(r"\s+", " ", (raw or "")).strip()
    names = [n for n in names if n]
    known = set(names) | SECTION_TAILS | set(OUTLETS.values())
    tags = []
    for _ in range(6):
        before = t
        # ' - 언론사' / ' - 섹션' / ' - 도메인'
        m = re.search(r"\s+[-–—]\s+([^-–—]{1,24})$", t)
        if m and (m.group(1).strip() in known or _looks_domain(m.group(1).strip())):
            tags.append(m.group(1).strip()); t = t[: m.start()].rstrip()
        # ' | KBS 260803 방송' — 꼬리 안에 언론사 이름이 있을 때만
        m = re.search(r"\s*\|\s*([^|]{1,30})$", t)
        if m and any(n and n in m.group(1) for n in known if len(n) >= 2):
            tags.append(m.group(1).strip()); t = t[: m.start()].rstrip()
        # ' : 스포츠'
        m = _SECTION_COLON.search(t)
        if m:
            tags.append(m.group(1)); t = t[: m.start()].rstrip()
        # "[엑's 현장]" "[인생은 오디션]" — 끝, 그리고 "[포토]" — 앞
        m = _BRACKET_END.search(t)
        if m and len(t[: m.start()].strip()) >= 6:
            tags.append(m.group(1).strip()); t = t[: m.start()].rstrip()
        m = _BRACKET_START.search(t)
        if m and len(t[m.end():].strip()) >= 6:
            tags.append(m.group(1).strip()); t = t[m.end():].lstrip()
        # 'K채널 / 김태우·인순이…' — 앞에 붙은 언론사 이름
        m = re.match(r"^([^/]{1,16})\s+/\s+", t)
        if m and m.group(1).strip() in known:
            tags.append(m.group(1).strip()); t = t[m.end():]
        if t == before:
            break
    return t.strip(), tags


# ============================================================
# 3. 같은 사건의 기사 묶기 — AI 없이
#
# 한 사건을 여러 곳이 각자의 제목으로 쓴다. 낱말로 쪼개 조사를 떼고
# '그 사건에만 나오는 낱말'을 함께 쓰면 같은 사건이다.
#
# 2026-10-03 고친 것 — 윤항기 65주년 헌정 공연이 8건 중 6줄로 흩어져 있었다.
#   ① '드문 낱말'을 기사 수로 쟀다(4건 이하). 큰 사건일수록 그 사건의 고유명사가
#      기사 수가 많아져 '흔한 말'이 됐다 — 윤항기(8건)·최백호(8건)가 구별에 못 쓰였다.
#      → 낱말이 **시간상 한 덩어리**(21일 안)에만 나오면 사건 고유 낱말로 본다.
#        애국가(6/30·7/24)·추석(9/2·9/24)처럼 철 따라 되풀이되는 말은 흔한 말이 된다.
#   ② ±2일만 봤다. 예고(9/9)→라인업(9/18·21)→현장(9/30) 이 다 끊겼다.
#      → 고유 낱말을 둘 이상 나누면 14일까지 잇는다. 한 사건은 30일을 넘지 않는다.
#   ③ '진해아트홀' 과 '진해서 … 아트홀' 이 안 만났다. → 낱말 앞·뒤 포함도 같은 낱말로 본다.
#
# 못 묶는 것보다 **엉뚱하게 묶는 쪽이 나쁘다** — 이제 묶여도 기사는 '기사 N건'
# 안에 다 남지만, 대표 제목이 다른 사건을 가리키면 거짓이 된다. 그래서
# 넓은 창(14일)은 고유 낱말 두 개 이상일 때만 연다.
# ============================================================
_STOP_BASE = """인순이 가수 공연 무대 콘서트 출격 개최 열린 열려 함께 이번 지난 오는 내달
                올해 그리고 위해 대한 통해 기념 행사 소식 화제 눈길 모습 현장 사진 포토
                오늘 내일 어제 관련 대해 라며 라고 밝혀 전해 출연 출연진 라인업 특집 방송
                무대서 무대에 선봬 공개 펼친다 펼쳐 진행 예정 성황 합류 총출동 한자리 자리
                화려한 특별 특별한 감동 레전드 열창 노래 가창 등장 참석 축하 축제 개막
                단독 인터뷰 영상 스포츠 연예 공식 최고 최초 다시 모두 위한 함께한다""".split()
# 조사·어미 꼬리. 긴 것부터 뗀다.
_PARTICLES = sorted(("에서", "으로", "이랑", "에게", "까지", "부터", "이나", "라며", "라고", "에선", "에는",
                     "께서", "한테", "처럼", "보다", "마저", "조차", "들과", "들이", "들의", "들",
                     "은", "는", "이", "가", "을", "를", "에", "의", "도", "와", "과", "로", "만", "서", "엔"),
                    key=len, reverse=True)
SPECIFIC_SPAN = 21      # 낱말이 이 날수 안에만 나오면 '그 사건의 낱말'
NEAR_DAYS = 2           # 같은 날 ±2일 — 낱말 둘이면 묶는다
WIDE_DAYS = 14          # 고유 낱말 둘 이상이면 여기까지 잇는다
STORY_SPAN = 30         # 한 사건의 첫 보도와 마지막 보도는 30일을 넘지 않는다


def _strip_particle(w):
    for p in _PARTICLES:                        # 조사가 붙어 있으면 같은 낱말이 달라 보인다
        if len(w) >= len(p) + 2 and w.endswith(p):
            return w[: -len(p)]
    return w


# 불용어도 조사를 떼면 다른 낱말이 된다. '인순이' → '인순'.
# 이걸 빼먹으면 모든 기사가 '인순'이라는 낱말 하나를 공유하게 된다. 실제로 그랬다.
_STOP = set(_STOP_BASE) | {_strip_particle(w) for w in _STOP_BASE}


def story_tokens(title):
    """제목에서 사건을 구별할 만한 낱말만 뽑는다."""
    out = set()
    for w in re.split(r"[^가-힣A-Za-z0-9]+", title or ""):
        w = w.lower()
        if len(w) < 2 or w in _STOP or w.isdigit():
            continue
        w = _strip_particle(w)
        if len(w) >= 2 and w not in _STOP:
            out.add(w)
    return out


def _tok_match(a, b):
    """같은 낱말인가 — 같거나, 한글 낱말의 앞·뒤에 통째로 들어 있으면(진해 ⊂ 진해아트홀)."""
    if a == b:
        return True
    s, l = (a, b) if len(a) <= len(b) else (b, a)
    if len(s) < 2 or not re.fullmatch(r"[가-힣]+", s) or not re.fullmatch(r"[가-힣0-9]+", l):
        return False
    return l.startswith(s) or l.endswith(s)


def _shared(ta, tb):
    """두 낱말 집합이 함께 쓰는 낱말(작은 쪽 기준으로 센다)."""
    sa = {a for a in ta if any(_tok_match(a, b) for b in tb)}
    sb = {b for b in tb if any(_tok_match(a, b) for a in ta)}
    return sa if len(sa) <= len(sb) else sb


def _d(s):
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except Exception:
        return None


def _day_gap(a, b):
    da, db = _d(a), _d(b)
    if not da or not db:
        return 999                              # 날짜를 못 읽으면 다른 사건으로 둔다
    return abs((da - db).days)


def norm(s):
    # 곡선 따옴표(“ ” ‘ ’)까지 지운다. 언론사마다 따옴표 모양이 달라서
    # 같은 기사가 두 건으로 세어졌다 — 실제로 그런 일이 있었다.
    return re.sub(r"[\s'\"`“”‘’«»·.,!?()\[\]/\-–—…:|~]", "", s or "").lower()


def specific_words(items, toks):
    """시간상 한 덩어리(SPECIFIC_SPAN 일 안)에서만 쓰인 낱말."""
    words = set()
    for t in toks:
        words |= t
    spec = set()
    for w in words:
        ds = [_d(items[i].get("date", "")) for i, t in enumerate(toks)
              if any(_tok_match(w, x) for x in t)]
        ds = [d for d in ds if d]
        if ds and (max(ds) - min(ds)).days <= SPECIFIC_SPAN:
            spec.add(w)
    return spec


def cluster_stories(items):
    """같은 사건끼리 묶는다. items 의 인덱스 묶음 목록(각 묶음 오름차순)을 돌려준다.
    묶는 판단에는 꼬리표를 떼기 전 제목(rawTitle)을 쓴다 — '[인생은 오디션]' 같은
    코너 이름은 화면에서는 군더더기지만 같은 사건을 알아보는 데는 좋은 단서다."""
    n = len(items)
    if n < 2:
        return [[i] for i in range(n)]
    toks = [story_tokens(it.get("rawTitle") or it.get("title")) for it in items]
    keys = [norm(it.get("title")) for it in items]
    spec = specific_words(items, toks)

    pairs = []
    for i in range(n):
        for j in range(i + 1, n):
            gap = _day_gap(items[i].get("date", ""), items[j].get("date", ""))
            if gap > WIDE_DAYS:
                continue
            if keys[i] and keys[i] == keys[j]:
                pairs.append((gap, i, j)); continue          # 같은 제목
            sh = _shared(toks[i], toks[j])
            if len(sh) < 2:
                continue
            ns = sum(1 for w in sh if w in spec)
            jac = len(sh) / float(len(toks[i] | toks[j]) or 1)
            if gap <= NEAR_DAYS and (jac >= 0.34 or ns >= 2):
                pairs.append((gap, i, j))
            elif ns >= 2:
                pairs.append((gap, i, j))

    parent = list(range(n))
    lo = [_d(it.get("date", "")) for it in items]
    hi = list(lo)

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    # 가까운 짝부터 잇는다(결정적). 이으면 30일이 넘는 사건이 되면 잇지 않는다 —
    # 매주 하는 프로그램이 석 달 치 한 줄로 뭉개지는 것을 막는다.
    for gap, i, j in sorted(pairs):
        a, b = find(i), find(j)
        if a == b:
            continue
        l = min(x for x in (lo[a], lo[b]) if x) if (lo[a] or lo[b]) else None
        h = max(x for x in (hi[a], hi[b]) if x) if (hi[a] or hi[b]) else None
        if l and h and (h - l).days > STORY_SPAN:
            continue
        r, c = (a, b) if a < b else (b, a)
        parent[c] = r
        lo[r], hi[r] = l, h

    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    return sorted(groups.values(), key=lambda g: g[0])


# ============================================================
# 4. 대표 기사 고르기
# ============================================================
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


def pick_lead(items, idxs, pool=None):
    """묶음의 대표 — 사진 캡션이 아니고, 이름이 확실한 언론사이며(포털·도메인 아님),
    묶음 전체가 함께 쓰는 낱말을 가장 많이 담은 제목.

    대표 제목은 그 사건을 가리키는 한 줄이다. 여러 곳이 같은 낱말로 쓴 제목이
    그 사건을 가장 잘 말한다 — 한 기사만의 곁가지 낱말은 점수가 안 된다.
    낱말 수는 묶음의 모든 기사(pool — 포털 재게재 포함, 꼬리표 떼기 전 제목)로 센다.
    포털이 그대로 옮겨 실은 제목은 그만큼 널리 쓰인 문장이라는 뜻이다."""
    if not idxs:
        return None
    pool = list(pool or idxs)
    ptoks = [story_tokens(items[j].get("rawTitle") or items[j].get("title")) for j in pool]
    toks = {i: story_tokens(items[i].get("title")) for i in idxs}
    cnt = {}
    for i in idxs:
        for w in toks[i]:
            if w not in cnt:
                cnt[w] = sum(1 for t in ptoks if any(_tok_match(w, x) for x in t))

    def central(i):
        t = toks[i]
        if not t:
            return 0.0
        return sum(cnt[w] for w in t if cnt[w] >= 2) / math.sqrt(len(t))

    def rank(i):
        it = items[i]
        named = 1 if (it.get("_named") and not is_portal(it.get("sourceSite"))) else 0
        grade = _caption_grade(it.get("rawTitle") or it.get("title"))
        # 사진 설명끼리면 긴 쪽이 '언제·어디서'를 담는다
        # ('애국가 부르는 가수 인순이' < '미국 독립기념일 행사에서 애국가 부르는 인순이')
        body = round(central(i), 3) if grade == 2 else len(it.get("title", ""))
        return (grade, named, body, -len(it.get("title", "")), it.get("date", ""), it.get("url", ""))

    return max(idxs, key=rank)


def classify(title):
    # 소식 페이지 분류(공연/방송/보도)에 맞춘다 — 보도가 기사 전반의 기본값
    if any(k in title for k in ("공연", "콘서트", "무대", "디너쇼", "축제", "리사이틀", "라이브", "열창", "애국가")):
        return "공연"
    if any(k in title for k in ("방송", "출연", "심사", "예능", "라디오", "오디션", "TV", "SBS", "KBS", "MBC")):
        return "방송"
    return "보도"


# ============================================================
# 5. 기록 정리 · 사건 만들기 (순수 함수 — 네트워크 없음, check_news.py 가 부른다)
# ============================================================
def normalize_record(r, learned=None):
    """기록 한 건을 정리한다. 원문 제목·표기는 raw* 에 남기고, 화면용 값은 매번 다시 계산한다."""
    raw_title = r.get("rawTitle") or r.get("title") or ""
    raw_source = r.get("rawSource") or r.get("source") or ""
    name, sure = outlet_name(raw_source, r.get("sourceSite"), learned)
    names = [raw_source, name]
    title, tags = clean_headline(raw_title, names)
    out = {
        "date": r.get("date", ""),
        "title": title,
        "source": name,
        "sourceSite": r.get("sourceSite", ""),
        "url": r.get("url", ""),
        "type": r.get("type") or classify(title),
        "auto": True,
    }
    if raw_title != title:
        out["rawTitle"] = raw_title
    if raw_source and raw_source != name:
        out["rawSource"] = raw_source
    if tags:
        out["tags"] = tags
    if r.get("ai"):
        out["ai"] = True
    out["_named"] = sure and not _looks_domain(name)
    return out


def merge_records(*lists):
    """주소(url) 기준으로 기록을 합친다. 같은 주소가 둘이면 앞 목록(기록 파일)의 것이 이긴다 —
    화면용 파일에서 거꾸로 기록을 덮으면 안 된다. 언론사 이름 표기의 차이는
    learn_outlets 가 입력 전체에서 따로 배운다."""
    by_url, order = {}, []
    for lst in lists:
        for r in lst or []:
            u = r.get("url")
            if not (u and r.get("title") and r.get("date")):
                continue
            if u not in by_url:
                by_url[u] = dict(r); order.append(u)
    return [by_url[u] for u in order]


def _mode_type(arts, lead):
    ai = [a["type"] for a in arts if a.get("ai") and a.get("type")]
    pool = ai or [a.get("type") for a in arts if a.get("type")]
    if not pool:
        return lead.get("type") or "보도"
    counts = {}
    for t in pool:
        counts[t] = counts.get(t, 0) + 1
    best = max(counts.values())
    tops = [t for t in counts if counts[t] == best]
    return lead.get("type") if lead.get("type") in tops else sorted(tops)[0]


def build_stories(records, now=None, window_days=WINDOW_DAYS, cap=MAX_STORIES, learned=None):
    """기록 → 화면용 사건 목록. 기록에 있는 기사는 하나도 빠지지 않고 어느 사건 안에 들어간다
    (창 밖의 오래된 것만 화면에서 빠지고 기록에는 남는다)."""
    if learned is None:
        learned = learn_outlets(records)
    recs = [normalize_record(r, learned) for r in records]
    if now is not None:
        # 기사 날짜가 KST 날짜이므로 기준도 KST 로 — 새벽(UTC 전날)에 하루가 어긋나지 않게
        cutoff = (now.astimezone(KST) - timedelta(days=window_days)).strftime("%Y-%m-%d")
        recs = [r for r in recs if r["date"] >= cutoff]
    recs.sort(key=lambda r: (r["date"], r["url"]))
    groups = cluster_stories(recs)

    stories = []
    for g in groups:
        # 같은 언론사의 같은 제목(포털 재게재·모바일 주소)은 한 줄로 — 주소는 alt 에 모두 남긴다
        # 포털(다음·네이트)에 같은 제목으로 다시 실린 것은 원래 기사의 다른 주소다 — 그 줄에 붙인다.
        uniq, seen, by_title = [], {}, {}
        for i in sorted(g, key=lambda i: (is_portal(recs[i]["sourceSite"]), recs[i]["date"], recs[i]["url"])):
            k = (norm(recs[i]["title"]), recs[i]["source"])
            host = seen.get(k)
            if host is None and is_portal(recs[i]["sourceSite"]):
                host = by_title.get(norm(recs[i]["title"]))
            if host is not None:
                host.setdefault("alt", []).append(recs[i]["url"]); continue
            a = {"date": recs[i]["date"], "title": recs[i]["title"],
                 "source": recs[i]["source"], "url": recs[i]["url"]}
            seen[k] = a
            by_title.setdefault(norm(recs[i]["title"]), a)
            uniq.append((i, a))
        lead_i = pick_lead(recs, [i for i, _ in uniq], g)
        lead = recs[lead_i]
        # 대표 기사 먼저, 나머지는 최근 보도부터(같은 날이면 언론사 이름순)
        arts = sorted((a for i, a in uniq), key=lambda a: (a["source"], a["url"]))
        arts.sort(key=lambda a: a["date"], reverse=True)
        arts.sort(key=lambda a: a["url"] != lead["url"])
        dates = sorted(recs[i]["date"] for i in g)
        st = {
            "date": dates[-1],                   # 마지막 보도일 — 정렬 기준
            "first": dates[0],                   # 첫 보도일
            "title": lead["title"],
            "source": lead["source"],
            "url": lead["url"],
            "type": _mode_type([recs[i] for i in g], lead),
            "auto": True,
            "count": len(arts),
            "articles": arts,
        }
        stories.append(st)
    stories.sort(key=lambda s: (s["date"], s["first"], s["url"]), reverse=True)
    return stories[:cap]


def clean_archive(records, learned=None):
    """기록 파일용 — 주소마다 한 건, 최신 보도일 순. '_' 로 시작하는 계산용 값은 뺀다."""
    if learned is None:
        learned = learn_outlets(records)
    out = []
    for r in records:
        x = normalize_record(r, learned)
        out.append({k: v for k, v in x.items() if not k.startswith("_")})
    out.sort(key=lambda x: (x.get("date", ""), x.get("url", "")), reverse=True)
    return out


# ============================================================
# 6. 수집 (네트워크)
# ============================================================
def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def parse_date(pub):
    for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S GMT"):
        try:
            return datetime.strptime(pub, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def fetch_candidates(cutoff):
    """구글 뉴스 RSS → 걸러 낸 후보 기록(원문 제목·표기 그대로)."""
    found = {}
    for feed_name, feed_tpl in FEEDS:
        for q in QUERIES:
            try:
                url = feed_tpl.format(q=urllib.parse.quote(q))
                root = ElementTree.fromstring(fetch(url))
            except Exception as e:
                print("  query fail", q, type(e).__name__)
                continue
            for it in root.findall(".//item"):
                raw = (it.findtext("title") or "").strip()
                link = (it.findtext("link") or "").strip()
                pub = it.findtext("pubDate") or ""
                src_el = it.find("{*}source")
                source = src_el.text.strip() if src_el is not None and src_el.text else ""
                site = (src_el.get("url") or "").strip() if src_el is not None else ""
                when = parse_date(pub)
                if not raw or not link or not when or when < cutoff:
                    continue
                if "인순이" not in raw:
                    continue
                if any(x in raw for x in NON_SINGER):
                    continue                                  # 동명이인(가수 아닌 인순이) 제외
                if any(neg in raw for neg in NEGATIVE):
                    continue                                  # 부정적 소식 제외
                if not any(pos in raw for pos in POSITIVE):
                    continue                                  # 가수 맥락 확인
                if link in found:
                    continue
                found[link] = {
                    "date": when.astimezone(KST).strftime("%Y-%m-%d"),
                    "title": raw,                             # 꼬리표는 normalize_record 가 뗀다
                    "source": source,
                    "sourceSite": site,
                    "url": link,
                    "auto": True,
                }
    return list(found.values())


# '좋은 소식'을 앞세운다: 어머니가 주인공이거나 따뜻한 이야기일수록 위로.
HEART = ["해밀", "기부", "후원", "나눔", "장학", "선행", "감동", "울컥", "눈물", "위로",
         "헌정", "존경", "레전드", "디바", "거위의 꿈"]
HONOR = ["수상", "시상", "영예", "헌액", "공로", "표창", "위촉", "홍보대사", "명예"]
STAGE = ["공연", "콘서트", "무대", "열창", "애국가", "신곡", "발매", "앨범", "컴백", "리사이틀", "디너쇼"]


def score(title):
    s = 0
    if title.startswith("인순이") or title.startswith("가수 인순이"):
        s += 40                       # 어머니가 기사 주인공
    s += 30 * sum(1 for k in HEART if k in title)
    s += 24 * sum(1 for k in HONOR if k in title)
    s += 12 * sum(1 for k in STAGE if k in title)
    if "인순이" in title[:14]:
        s += 10                       # 제목 앞쪽에 언급될수록 비중이 크다
    return s


def select_new(archive, candidates, now, log=print):
    """새 후보 중 기록에 들일 것. 이미 기록된 사건에 붙는 기사는 언제나 들이고,
    새 사건은 최근 90일 사건 중 '좋은 소식' 점수 상위 16개 안에 들 때만 들인다(예전과 같은 문).
    AI 키가 있으면 새 사건 중 곁다리·캡션을 AI 가 한 번 더 거른다."""
    have = {r["url"] for r in archive}
    fresh = [c for c in candidates if c["url"] not in have]
    if not fresh:
        return []
    cut = (now.astimezone(KST) - timedelta(days=SELECT_DAYS)).strftime("%Y-%m-%d")
    pool_raw = [r for r in archive if r.get("date", "") >= cut] + fresh
    learned = learn_outlets(archive + fresh)
    pool = [normalize_record(r, learned) for r in pool_raw]
    groups = cluster_stories(pool)

    take, new_only = [], []
    for g in groups:
        urls = [pool[i]["url"] for i in g]
        if any(u in have for u in urls):
            take += [i for i in g if pool[i]["url"] not in have]
        else:
            new_only.append(g)

    def gscore(g):
        return max(score(pool[i]["title"]) for i in g)

    ranked_all = sorted(groups, key=lambda g: (-gscore(g), -max(_d(pool[i]["date"]).timestamp() for i in g)))
    top = {tuple(g) for g in ranked_all[:SELECT_TOP]}
    chosen = [g for g in new_only if tuple(g) in top]

    # ── AI 큐레이션 (키가 있을 때만) — 고르고 분류만 한다. 문장은 쓰지 않는다.
    # 키가 없거나 실패하면 위의 규칙 결과를 그대로 쓴다.
    if chosen:
        lead_idx = [pick_lead(pool, g) for g in chosen]
        curated = None
        try:
            from ai_curate import curate
            curated = curate([{k: v for k, v in pool[i].items() if not k.startswith("_")} for i in lead_idx], log=log)
        except ImportError:
            curated = None
        except Exception as e:
            log("  AI 큐레이션 중 예외 (%s) — 규칙 기반 결과를 씁니다" % type(e).__name__)
            curated = None
        if curated:
            pos = {pool[i]["url"]: k for k, i in enumerate(lead_idx)}
            keep, types = set(), {}
            for x in curated:
                k = pos.get(x.get("url"))
                if k is None:
                    continue
                keep.add(k)
                if x.get("type"):
                    types[k] = x["type"]
                for j in x.get("_same") or []:
                    if isinstance(j, int) and 0 <= j < len(chosen):
                        keep.add(j)                 # AI 가 같은 사건이라 합친 것 — 버린 게 아니다
                        if x.get("type"):
                            types[j] = x["type"]
            for k, g in enumerate(chosen):
                for i in g:
                    if k in types:
                        pool[i]["type"] = types[k]
                    if k in keep:
                        pool[i]["ai"] = True
            chosen = [g for k, g in enumerate(chosen) if k in keep]
    for g in chosen:
        take += g

    out = []
    for i in sorted(set(take)):
        r = pool[i]
        out.append({k: v for k, v in r.items() if not k.startswith("_")})
    return out


def _load(path):
    try:
        blob = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print("  읽기 실패", os.path.basename(path), type(e).__name__)
        return None, []
    return blob, (blob if isinstance(blob, list) else blob.get("items", []))


def _flatten_live(items):
    """옛 live-news(기사 한 줄)와 새 live-news(사건 + articles) 어느 쪽이든 기사 목록으로."""
    out = []
    for it in items:
        if isinstance(it.get("articles"), list) and it["articles"]:
            for a in it["articles"]:
                if a.get("url"):
                    out.append({"date": a.get("date"), "title": a.get("title"), "source": a.get("source"),
                                "url": a["url"], "type": it.get("type"), "auto": True})
                for u in a.get("alt") or []:
                    # 다른 주소(포털 재게재)는 언론사 표기가 다르다 — 이름을 물려주지 않는다
                    out.append({"date": a.get("date"), "title": a.get("title"), "source": "",
                                "url": u, "type": it.get("type"), "auto": True})
        else:
            out.append(dict(it))
    return out


def build_docs(archive_items, live_items, new_items, now, prev_arch=None, prev_live=None, mode="규칙 기반"):
    flat = _flatten_live(live_items)
    records = merge_records(archive_items, flat, new_items)
    learned = learn_outlets(list(archive_items or []) + flat + list(new_items or []))
    arch = clean_archive(records, learned)
    stories = build_stories(arch, now, learned=learned)
    stamp = now.astimezone(KST).strftime("%Y-%m-%d %H:%M")
    # 바뀐 것이 없으면 시각도 그대로 둔다 — 2시간마다 '시각만 바뀐 커밋'이 쌓이던 것을 막는다
    a_up = (prev_arch or {}).get("updated") if (prev_arch or {}).get("items") == arch else stamp
    l_up = (prev_live or {}).get("updated") if (prev_live or {}).get("items") == stories else stamp
    arch_doc = {
        "note": ("모아 둔 기사 전체(기록). 한 번 들어온 것은 지우지 않는다 — 주소(url)마다 한 건. "
                 "title·source 는 화면용(꼬리표를 덜어 낸 제목·언론사 이름), rawTitle·rawSource 는 수집 당시 원문 표기. "
                 "date 는 보도일이다(행사일 아님)."),
        "updated": a_up or stamp,
        "count": len(arch),
        "items": arch,
    }
    live_doc = {
        "note": ("인순이 관련 좋은 소식(Google News RSS)을 같은 사건끼리 묶은 화면용 목록. "
                 "한 사건 = 한 줄, articles 에 그 사건의 기사 전부. date 는 마지막 보도일, first 는 첫 보도일 — "
                 "둘 다 보도일이지 행사일이 아니다. 제목은 원문에서 언론사·코너 꼬리표만 덜어 냈다."),
        "mode": mode,
        "updated": l_up or stamp,
        "items": stories,
    }
    return arch_doc, live_doc


def _write(path, doc):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, path)


def main(argv):
    offline = "--offline" in argv
    dry = "--dry" in argv
    now = datetime.now(timezone.utc)
    if "--now" in argv:
        now = datetime.strptime(argv[argv.index("--now") + 1], "%Y-%m-%d").replace(tzinfo=KST)

    prev_arch, archive = _load(ARCH)
    prev_live, live = _load(OUT)
    if prev_arch is None and prev_live is None and offline:
        print("기록 파일을 읽지 못했습니다 — 아무것도 쓰지 않습니다")
        return 1

    new_items, mode = [], "규칙 기반"
    if not offline:
        cands = fetch_candidates(now - timedelta(days=SELECT_DAYS))
        print("  후보 %d건" % len(cands))
        base = merge_records(archive, _flatten_live(live))
        new_items = select_new(base, cands, now)
        if any(x.get("ai") for x in new_items):
            mode = "AI 큐레이션"
        print("  새로 들일 기사 %d건" % len(new_items))

    arch_doc, live_doc = build_docs(archive, live, new_items, now,
                                    prev_arch if isinstance(prev_arch, dict) else None,
                                    prev_live if isinstance(prev_live, dict) else None, mode)
    n_art = sum(s["count"] for s in live_doc["items"])
    print("  기록 %d건 → 화면 사건 %d개 (기사 %d줄)" % (arch_doc["count"], len(live_doc["items"]), n_art))
    for s in live_doc["items"][:10]:
        print("  [%s] %s · %s%s" % (s["date"], s["title"][:50], s["source"],
                                   (" 외 %d" % (s["count"] - 1)) if s["count"] > 1 else ""))
    if dry:
        print("(--dry: 쓰지 않음)")
        return 0
    _write(ARCH, arch_doc)
    _write(OUT, live_doc)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
