#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""소식(scripts/collect-news.py · news.html) 검사기 — 네트워크 없이 돈다.

  python3 scripts/check_news.py              # 데이터: 묶기·언론사 이름·꼬리표·대표 기사·빠짐 없음 + 뮤테이션
  <playwright 파이썬> scripts/check_news.py --ui   # + 화면(검사기 안에서 http.server 를 스레드로 띄운다)

고정 입력: scripts/fixtures/news-20261003/ — 2026-10-03 새벽 라이브의 live-news.json·news-archive.json
그대로(기사 69건). 이 날 라이브 폰 화면에서 실측한 문제가 기준이다.
  · 윤항기 65주년 헌정 공연이 언론사만 바꿔 6줄 연속
  · 출처가 도메인 그대로(XPORTSNEWS.COM · KOOKMINNEWS.COM …)
  · 제목 끝 꼬리표('- 스타투데이' · "[엑's 현장]" · '[인생은 오디션]')
  · 한글 제목·라벨이 고정폭 서체, '공연' 라벨이 화면 폭 전체 상자
기대값은 사람이 기사 제목을 하나씩 읽고 정했다. 기대값을 고쳐야 한다면 그 이유를 이 파일에 적는다.

뮤테이션: 수집기의 한 곳을 일부러 망가뜨려(예: 낱말 포함 비교를 끄기) 이 검사가
**실패하는지** 본다. 망가뜨렸는데도 통과하면 검사가 아무것도 지키지 않는 것이다.
종료코드: 하나라도 실패하면 1.
"""
import importlib.util, json, os, re, sys, copy
from datetime import datetime, timezone, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, "scripts", "fixtures", "news-20261003")
KST = timezone(timedelta(hours=9))
NOW = datetime(2026, 10, 3, 9, 0, tzinfo=KST)


def load_cn():
    """collect-news.py 를 새로 읽는다(뮤테이션마다 깨끗한 사본)."""
    spec = importlib.util.spec_from_file_location("collect_news_%d" % id(object()), os.path.join(ROOT, "scripts", "collect-news.py"))
    m = importlib.util.module_from_spec(spec)
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    spec.loader.exec_module(m)
    return m


def fixture():
    a = json.load(open(os.path.join(FIX, "news-archive.json"), encoding="utf-8"))["items"]
    l = json.load(open(os.path.join(FIX, "live-news.json"), encoding="utf-8"))["items"]
    return a, l


def _domainish(s):
    return bool(re.fullmatch(r"[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", s or ""))


# ============================================================
# 데이터 단언 — 실패 문장 목록을 돌려준다
# ============================================================
def data_checks(cn, verbose=False):
    bad, n = [], [0]

    def ok(cond, msg):
        n[0] += 1
        if not cond:
            bad.append(msg)
        elif verbose:
            print("  ✓", msg)

    A, L = fixture()
    fx_urls = {x["url"] for x in A} | {x["url"] for x in L}
    fx_date = {}
    for x in A + L:
        fx_date.setdefault(x["url"], x["date"])
    arch_doc, live_doc = cn.build_docs(A, L, [], NOW)
    arch, stories = arch_doc["items"], live_doc["items"]

    # ── D1·D2 빠짐 없음: 고정 입력의 주소 69개가 기록에 한 번씩, 화면의 어느 사건 안에 한 번씩
    au = [x["url"] for x in arch]
    ok(len(au) == len(set(au)) == len(fx_urls) == 69, "D1 기록 = 고정 입력 주소 69개, 중복 없음 (지금 %d/%d)" % (len(set(au)), len(fx_urls)))
    ok(set(au) == fx_urls, "D1 기록의 주소 집합이 고정 입력과 같다(지어낸 것·빠진 것 없음)")
    seen = []
    for s in stories:
        for a in s["articles"]:
            seen.append(a["url"]); seen += a.get("alt") or []
    ok(sorted(seen) == sorted(fx_urls), "D2 화면 사건들 안에 주소 69개가 정확히 한 번씩 (지금 %d, 고유 %d)" % (len(seen), len(set(seen))))
    ok(all(s["count"] == len(s["articles"]) >= 1 for s in stories), "D2 count = 기사 줄 수, 빈 사건 없음")
    ok(all(s["articles"][0]["url"] == s["url"] for s in stories), "D2 대표 기사가 기사 목록 맨 앞")

    # ── D8 날짜는 보도일 그대로
    for x in arch:
        if x["date"] != fx_date.get(x["url"]):
            ok(False, "D8 날짜가 바뀌었다: %s %s→%s" % (x["title"][:20], fx_date.get(x["url"]), x["date"]))
            break
    else:
        ok(True, "D8 기사 날짜 = 수집 당시 보도일(69건)")
    ok(all(s["date"] == max(a["date"] for a in s["articles"]) and s["first"] == min(a["date"] for a in s["articles"])
           for s in stories), "D8 사건 date=마지막 보도일, first=첫 보도일")
    ok([s["date"] for s in stories] == sorted([s["date"] for s in stories], reverse=True), "D8 최신 보도 순")

    def story_of(sub):
        hits = [s for s in stories if any(sub in a["title"] for a in s["articles"])]
        return hits

    def one_story(sub, k, label):
        h = story_of(sub)
        ok(len(h) == 1, "D3 %s — '%s' 기사가 한 사건에 모인다 (지금 %d개 사건)" % (label, sub, len(h)))
        if len(h) == 1:
            urls = {u for a in h[0]["articles"] for u in [a["url"]] + (a.get("alt") or [])}
            ok(len(urls) == k, "D3 %s — 주소 %d개 (지금 %d)" % (label, k, len(urls)))
        return h[0] if len(h) == 1 else None

    # ── D3 묶기 (사람이 정한 정답)
    yh = one_story("윤항기", 8, "윤항기 헌정 공연(9/9 예고→9/18·21 라인업→9/30 현장)")
    if yh:
        ok(yh["first"] == "2026-09-09" and yh["date"] == "2026-09-30", "D3 윤항기 — 보도 9/9~9/30")
        ok(yh["count"] == 8, "D3 윤항기 — 기사 8건(언론사 8곳)")
    jh = [s for s in stories if any("진해" in a["title"] for a in s["articles"])]
    ok(len(jh) == 1, "D3 진해아트홀 — '진해아트홀 개관기념…'과 '진해서 … 아트홀 개관 축하'가 한 사건 (지금 %d)" % len(jh))
    if len(jh) == 1:
        ok(sum(1 + len(a.get("alt") or []) for a in jh[0]["articles"]) == 4 and jh[0]["count"] == 3,
           "D3 진해아트홀 — 주소 4개 · 줄 3개(시사코리아저널 m./www. 한 줄)")
    au_ = [s for s in stories if any(("인생은 오디션" in a["title"]) or ("서지오" in a["title"]) for a in s["articles"])]
    ok(len(au_) == 1, "D3 인생은 오디션 — 심사평 클립·참가자 기사가 한 사건 (지금 %d)" % len(au_))
    if len(au_) == 1:
        ok(sum(1 + len(a.get("alt") or []) for a in au_[0]["articles"]) == 13, "D3 인생은 오디션 — 주소 13개")
    gk = [s for s in stories if any(("국악가요" in a["title"]) or ("민요와 가요" in a["title"]) for a in s["articles"])]
    ok(len(gk) == 1, "D3 추석엔 국악가요 — 뉴스1·다음 4·Korearetro 한 사건 (지금 %d)" % len(gk))
    one_story("불꽃야구", 3, "불꽃야구 애국가")
    one_story("가요무대", 4, "가요무대 남진 듀엣(+KBS 님과 함께)")
    km = [s for s in stories if any("님과 함께" in a["title"] for a in s["articles"])]
    ok(bool(km) and km[0] is (story_of("가요무대") or [None])[0], "D3 KBS '님과 함께' 클립이 가요무대 기사와 한 사건")
    ms = one_story("마샬", 7, "마샬 스피커")
    if ms:
        ok(ms["count"] == 1, "D3 마샬 — 동아일보 2주소 + 포털(다음 4·네이트 1) 재게재는 한 기사의 다른 주소 → 기사 1건 (지금 %d)" % ms["count"])
    one_story("세계인", 2, "김포 세계인 큰잔치")
    one_story("노아", 2, "노아 화보")
    one_story("피스트레인", 2, "DMZ 피스트레인")
    one_story("플레이리스트 109", 2, "플레이리스트 109")
    one_story("시민의", 4, "청주 시민의 날")
    one_story("애국가 부르는", 2, "미국 독립기념일 애국가")
    # 묶으면 안 되는 것 — 엉뚱하게 묶이면 대표 제목이 다른 사건을 가리킨다
    ok(len(story_of("추석")) == 2, "D3 추석 9/2(국악가요)와 9/24(이승철·인순이)는 다른 사건")
    ok(len([s for s in stories if any("애국가" in a["title"] for a in s["articles"])]) == 2,
       "D3 애국가 6/30(미국 독립기념일)과 7/24(불꽃야구)는 다른 사건")
    ok(len(story_of("유지숙")) == 2, "D3 안동 '두 사랑 이야기' 5/6 보도와 8/5 보도(석 달 뒤 재게재)는 다른 줄")
    ok(len(stories) == 23, "D3 사건 23개 (지금 %d)" % len(stories))
    ok(all((datetime.strptime(s["date"], "%Y-%m-%d") - datetime.strptime(s["first"], "%Y-%m-%d")).days <= 30 for s in stories),
       "D3 한 사건의 보도 기간 30일 이하")

    # ── D4 대표 기사
    if yh:
        ok(yh["source"] == "스타뉴스" and yh["title"].startswith("'나는 행복합니다' 윤항기 65주년 헌정 공연"),
           "D4 윤항기 대표 = 스타뉴스 '나는 행복합니다'… (지금 %s · %s)" % (yh["source"], yh["title"][:24]))
    if len(jh) == 1:
        ok(jh[0]["title"].startswith("진해아트홀 개관기념 특별공연"), "D4 진해 대표 = '진해아트홀 개관기념 특별공연…'")
    if len(au_) == 1:
        ok("인생은 오디션" in au_[0]["title"], "D4 인생은 오디션 대표 제목에 프로그램 이름이 있다 (지금 %s)" % au_[0]["title"][:30])
    ag = story_of("미국 독립기념일")
    ok(bool(ag) and ag[0]["title"].startswith("미국 독립기념일"), "D4 사진 설명끼리면 '언제·어디서'가 있는 쪽이 대표")
    portal_names = {"다음 뉴스", "네이트", "네이버 뉴스"}
    for s in stories:
        if s["source"] in portal_names and any(a["source"] not in portal_names for a in s["articles"]):
            ok(False, "D4 언론사 기사가 있는데 포털이 대표: %s" % s["title"][:30]); break
    else:
        ok(True, "D4 대표는 포털이 아니다(언론사 기사가 있으면)")
    if ms:
        ok(ms["source"] == "동아일보", "D4 마샬 대표 = 동아일보 (지금 %s)" % ms["source"])

    # ── D5 언론사 이름
    def src_of(url):
        for x in arch:
            if x["url"] == url:
                return x["source"]
    by_raw = {}
    for x in A + L:
        by_raw.setdefault(x["source"], set()).add(src_of(x["url"]))
    expect = {"xportsnews.com": "엑스포츠뉴스", "starnewskorea.com": "스타뉴스", "issuedaily.com": "이슈데일리",
              "sbs.co.kr": "SBS", "v.daum.net": "다음 뉴스", "대한민국 대표 공영미디어 KBS": "KBS",
              "OhmyNews": "오마이뉴스", "bntnews.co.kr": "bnt뉴스", "fashionbiz.co.kr": "패션비즈",
              "news1.kr": "뉴스1", "kcemedia.com": "대한청년일보", "씨티 21": "씨티 21", "Korearetro": "Korearetro"}
    for raw, want in expect.items():
        ok(by_raw.get(raw) == {want}, "D5 '%s' → '%s' (지금 %s)" % (raw, want, by_raw.get(raw)))
    # 모르는 곳은 지어내지 않고 도메인 그대로(www. 없이)
    ok(by_raw.get("kstars.kr") == {"kstars.kr"} and by_raw.get("kookminnews.com") == {"kookminnews.com"},
       "D5 모르는 곳(kstars.kr·kookminnews.com)은 이름을 지어내지 않고 도메인 그대로")
    dom = sorted({x["source"] for x in arch if _domainish(x["source"])})
    ok(dom == ["kookminnews.com", "kstars.kr"], "D5 화면에 남은 도메인 표기는 모르는 두 곳뿐 (지금 %s)" % dom)
    ok(all(x["source"] == x["source"].strip() and not x["source"].isupper() for x in arch if _domainish(x["source"])),
       "D5 도메인 표기는 소문자")
    ok(all(x.get("rawSource") for x in arch if x["source"] != next((y["source"] for y in A if y["url"] == x["url"]), x["source"])),
       "D5 이름을 바꾼 기록은 원래 표기(rawSource)를 남긴다")

    # ── D6 꼬리표
    titles = [x["title"] for x in arch] + [s["title"] for s in stories] + [a["title"] for s in stories for a in s["articles"]]
    ok(not [t for t in titles if re.search(r"[\]】]\s*$", t)], "D6 제목 끝에 [코너] 꼬리표 없음")
    ok(not [t for t in titles if re.search(r"\s[-–]\s*(스타투데이|매일경제)\s*$", t)], "D6 '- 스타투데이' 없음")
    ok(not [t for t in titles if re.search(r"\s:\s*스포츠\s*$", t)], "D6 ' : 스포츠' 없음")
    ok(not [t for t in titles if "| KBS" in t], "D6 '| KBS 260803 방송' 없음")
    ok(not [t for t in titles if t.startswith("K채널 /")], "D6 앞에 붙은 'K채널 / ' 없음")
    ok(any(t == "남진 & 인순이 - 님과 함께" for t in titles), "D6 곡명 '님과 함께'는 지키다 (' - ' 를 함부로 자르지 않는다)")
    ok(any(t.startswith("‘플레이리스트 109’ 장동선-김영옥") for t in titles), "D6 이름 사이 '-'(장동선-김영옥)는 그대로")
    xp = [x for x in arch if x["url"] in {y["url"] for y in A if y["source"] == "xportsnews.com"}]
    ok(bool(xp) and xp[0]["title"].endswith("함께해줘\"") and xp[0].get("rawTitle", "").endswith("[엑's 현장]"),
       "D6 [엑's 현장] 을 떼고 원문은 rawTitle 에 남긴다")
    # ── D7 고쳐 쓰지 않았다: 덜어 낸 제목은 언제나 원문 제목의 연속된 일부
    sub_bad = [x for x in arch if x.get("rawTitle") and x["title"] not in re.sub(r"\s+", " ", x["rawTitle"])]
    ok(not sub_bad, "D7 덜어 낸 제목 = 원문 제목의 연속된 일부(요약·재작성 없음) %s" % ([x["title"][:20] for x in sub_bad][:2]))
    ok(all(len(x["title"]) >= 8 for x in arch), "D7 꼬리표를 떼다 제목이 사라진 것 없음")

    # ── D12 꼬리표 떼기 단위 사례 (구글 RSS 원문 모양)
    cases = [
        ("최백호·인순이 총출동…윤항기 \"함께해줘\" [엑's 현장] - xportsnews.com", ["xportsnews.com"], "최백호·인순이 총출동…윤항기 \"함께해줘\""),
        ("남진 & 인순이 - 님과 함께 | KBS 260803 방송 - 대한민국 대표 공영미디어 KBS", ["대한민국 대표 공영미디어 KBS", "KBS"], "남진 & 인순이 - 님과 함께"),
        ("[포토] 애국가 부르는 가수 인순이 - 뉴시스", ["뉴시스"], "애국가 부르는 가수 인순이"),
        ("‘나는 행복합니다’ 윤항기, 헌정무대 - 스타투데이 - 매일경제", ["매일경제"], "‘나는 행복합니다’ 윤항기, 헌정무대"),
        ("경수진 시구·인순이 애국가 가창…화려한 라인업 : 스포츠 - kstars.kr", ["kstars.kr"], "경수진 시구·인순이 애국가 가창…화려한 라인업"),
        ("인순이 '거위의 꿈' - 이적 작사", ["뉴스엔"], "인순이 '거위의 꿈' - 이적 작사"),
    ]
    for raw, names, want in cases:
        got = cn.clean_headline(raw, names)[0]
        ok(got == want, "D12 꼬리표 떼기: %r → %r (지금 %r)" % (raw[:30], want[:30], got[:40]))

    # ── D9 멱등: 다시 돌려도 같다
    a2, l2 = cn.build_docs(arch, stories, [], NOW, arch_doc, live_doc)
    ok(a2["items"] == arch and l2["items"] == stories and l2["updated"] == live_doc["updated"],
       "D9 멱등 — 결과를 다시 넣어도 같은 결과, 바뀐 게 없으면 updated 도 그대로")

    # ── D11 새 기사 들이기(네트워크 없이 합성 후보) — 이미 있는 사건에 붙는 것은 들이고, 없는 것은 점수로
    env_key = os.environ.pop("ANTHROPIC_API_KEY", None)
    try:
        base = cn.merge_records(A, cn._flatten_live(L))
        cands = [
            {"date": "2026-10-03", "title": "진해아트홀 개관기념 '인순이 스페셜 콘서트' 오늘 개최 - 경남신문", "source": "경남신문",
             "sourceSite": "https://www.knnews.co.kr", "url": "https://example.test/a1", "auto": True},
            {"date": "2026-10-02", "title": "인순이, 해밀학교 장학금 기부…다문화 청소년에 나눔 - 뉴스1", "source": "뉴스1",
             "sourceSite": "https://www.news1.kr", "url": "https://example.test/a2", "auto": True},
            {"date": "2026-10-02", "title": "제19회 세계인 큰 잔치, 국가별 입장 및 인순이 등 공연 - 씨티 21", "source": "씨티 21",
             "sourceSite": "http://m.city21.co.kr", "url": A[1]["url"], "auto": True},   # 이미 있는 주소
        ]
        got = cn.select_new(base, cands, NOW, log=lambda *a: None)
        gu = {x["url"] for x in got}
        ok("https://example.test/a1" in gu, "D11 이미 있는 사건(진해)에 붙는 새 기사는 들인다")
        ok("https://example.test/a2" in gu, "D11 '좋은 소식' 점수 높은 새 사건은 들인다")
        ok(A[1]["url"] not in gu, "D11 이미 기록된 주소는 다시 들이지 않는다")
        ad, ld = cn.build_docs(A, L, got, NOW)
        js = [s for s in ld["items"] if any("진해" in a["title"] for a in s["articles"])]
        ok(len(js) == 1 and js[0]["date"] == "2026-10-03" and js[0]["count"] == 4,
           "D11 새 진해 기사가 기존 진해 사건 안으로(마지막 보도 10/3, 기사 4건)")
        ok(ad["count"] == 71 and all(x["url"] in {y["url"] for y in ad["items"]} for x in A), "D11 들인 뒤에도 옛 기록은 그대로(69+2)")
    finally:
        if env_key is not None:
            os.environ["ANTHROPIC_API_KEY"] = env_key

    # ── D10 저장소의 지금 데이터 — 기록은 고정 입력을 하나도 잃지 않았고, 화면 파일은 기록에서 만든 그대로다
    try:
        cur_a = json.load(open(os.path.join(ROOT, "assets", "data", "news-archive.json"), encoding="utf-8"))
        cur_l = json.load(open(os.path.join(ROOT, "assets", "data", "live-news.json"), encoding="utf-8"))
        cu = {x["url"] for x in cur_a["items"]}
        ok(fx_urls <= cu, "D10 저장소 기록이 고정 입력 69건을 모두 갖고 있다(지운 것 없음)")
        ok(cur_a["count"] == len(cur_a["items"]), "D10 기록 count = 항목 수")
        up = datetime.strptime(cur_l["updated"], "%Y-%m-%d %H:%M").replace(tzinfo=KST)
        rebuilt = cn.build_stories(cur_a["items"], up)
        ok(rebuilt == cur_l["items"], "D10 live-news.json = 기록에서 다시 만든 결과(손으로 고친 흔적 없음)")
        inside = {u for s in cur_l["items"] for a in s["articles"] for u in [a["url"]] + (a.get("alt") or [])}
        win = (up - timedelta(days=cn.WINDOW_DAYS)).strftime("%Y-%m-%d")
        ok({x["url"] for x in cur_a["items"] if x["date"] >= win} <= inside or len(cur_l["items"]) >= cn.MAX_STORIES,
           "D10 창 안의 기록은 전부 화면 사건 안에 있다")
    except Exception as e:
        ok(False, "D10 저장소 데이터 읽기 실패: %s" % e)
    return bad, n[0]


# ============================================================
# 뮤테이션 — 망가뜨리면 실패해야 한다
# ============================================================
def mutations():
    out = []

    def m(name, fn):
        out.append((name, fn))

    m("묶기 창을 옛날(±2일)로", lambda cn: setattr(cn, "WIDE_DAYS", 2))
    m("사건 고유 낱말 끄기", lambda cn: setattr(cn, "SPECIFIC_SPAN", -1))
    m("낱말 앞·뒤 포함 비교 끄기", lambda cn: setattr(cn, "_tok_match", lambda a, b: a == b))
    m("창을 120일로·사건 기간 무제한(과하게 묶기)", lambda cn: (setattr(cn, "WIDE_DAYS", 120), setattr(cn, "STORY_SPAN", 999), setattr(cn, "SPECIFIC_SPAN", 999)))
    m("언론사 이름표 비우기", lambda cn: (cn.OUTLETS.clear()))
    m("구글 표기에서 이름 배우기 끄기", lambda cn: setattr(cn, "learn_outlets", lambda recs: {}))
    m("꼬리표 떼기 끄기", lambda cn: setattr(cn, "clean_headline", lambda raw, names=(): (raw, [])))

    def greedy(cn):
        orig = cn.clean_headline

        def f(raw, names=()):
            t, tags = orig(raw, names)
            return re.sub(r"\s+-\s+.*$", "", t), tags        # ' - ' 뒤를 무조건 자른다
        cn.clean_headline = f
    m("' - ' 뒤를 무조건 자르기(곡명 훼손)", greedy)

    def lead_first(cn):
        cn.pick_lead = lambda items, idxs, pool=None: sorted(idxs)[0]
    m("대표 기사 = 그냥 첫 기사", lead_first)

    def no_fold(cn):
        cn.is_portal = lambda site: False
    m("포털 재게재 접기 끄기", no_fold)

    def drop_rest(cn):
        orig = cn.build_stories

        def f(*a, **k):
            ss = orig(*a, **k)
            for s in ss:
                s["articles"] = s["articles"][:1]; s["count"] = 1
            return ss
        cn.build_stories = f
    m("대표 기사만 남기고 나머지 버리기", drop_rest)

    def today(cn):
        orig = cn.normalize_record

        def f(r, learned=None):
            x = orig(r, learned); x["date"] = "2026-10-03"; return x
        cn.normalize_record = f
    m("날짜를 오늘로(보도일 훼손)", today)

    def no_arch_keep(cn):
        orig = cn.merge_records
        cn.merge_records = lambda *ls: orig(*ls)[:-3]
    m("기록 세 건 잃기", no_arch_keep)
    return out


# ============================================================
# 화면 검사 (--ui) — playwright 가 있는 파이썬으로
# ============================================================
UI_PROBE = r"""() => {
  const HAN = /[가-힣]/;
  const mono = f => /^\s*"?(JetBrains Mono|Space Mono|IBM Plex Mono|SF Mono|monospace)/i.test(f);
  const main = document.querySelector('main.news');
  const out = {monoHan: [], spaced: [], round: [], smallTap: [], kindBox: [], overlap: [], texts: 0};
  if (!main) return out;
  const w = document.createTreeWalker(main, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) {
    if (!HAN.test(n.nodeValue)) continue;
    const e = n.parentElement; if (!e || e.closest('.sr-only,[hidden]')) continue;
    const r = e.getBoundingClientRect(); if (!r.width) continue;
    const cs = getComputedStyle(e); out.texts++;
    if (mono(cs.fontFamily)) out.monoHan.push(e.className + ':' + n.nodeValue.trim().slice(0, 12));
    const ls = parseFloat(cs.letterSpacing); if (ls && Math.abs(ls) > .01) out.spaced.push(e.className + ':' + cs.letterSpacing);
  }
  main.querySelectorAll('[class^="nw-"],[class*=" nw-"],.nw-filter button').forEach(e => {
    const cs = getComputedStyle(e);
    if (parseFloat(cs.borderTopLeftRadius) > 0) out.round.push(e.className);
  });
  main.querySelectorAll('.nw-more,.nw-press a,.nw-filter button,.nw-older,.nw-title a').forEach(e => {
    if (e.closest('[hidden]')) return;
    const r = e.getBoundingClientRect();
    if (r.height && r.height < 43.5) out.smallTap.push((e.className || e.tagName) + ':' + Math.round(r.height));
  });
  /* 한 줄 안에서 누르는 영역이 겹치면 손가락이 엉뚱한 것을 누른다(제목 링크 ↔ 「기사 N건」) */
  main.querySelectorAll('.nw-item').forEach(row => {
    const a = row.querySelector('.nw-title a'), b = row.querySelector('.nw-more');
    if (a && b && a.getBoundingClientRect().bottom > b.getBoundingClientRect().top + .5)
      out.overlap.push(row.querySelector('.nw-title').textContent.slice(0, 12));
  });
  main.querySelectorAll('.nw-kind').forEach(e => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 ||
        !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || r.width > 90)
      out.kindBox.push(e.textContent + ':' + Math.round(r.width) + ':' + cs.borderTopWidth);
  });
  return out;
}"""


def ui_checks():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright 없음 — --ui 를 건너뜁니다 (playwright 가 있는 파이썬으로 돌리세요)")
        return ["playwright 없음"], 0
    import threading, functools, socket
    from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

    class H(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), functools.partial(H, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    B = "http://127.0.0.1:%d/" % port
    live = json.load(open(os.path.join(ROOT, "assets", "data", "live-news.json"), encoding="utf-8"))["items"]
    bad, n = [], [0]

    def ok(cond, msg):
        n[0] += 1
        print("  %s %s" % ("✓" if cond else "✗", msg))
        if not cond:
            bad.append(msg)

    init = "try{sessionStorage.setItem('insooni_intro','1');%s}catch(e){}"
    with sync_playwright() as p:
        br = p.chromium.launch()

        def page(w, h, fs=None, lang=None, mobile=True):
            ctx = br.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile)
            extra = ""
            if fs is not None:
                extra += "localStorage.setItem('insooni_fs','%d');" % fs
            if lang:
                extra += "localStorage.setItem('insooni_lang','\"%s\"');" % lang
            ctx.add_init_script(init % extra)
            pg = ctx.new_page()
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
            pg.on("console", lambda m: m.type == "error" and errs.append(m.text[:120]))
            pg.goto(B + "news.html", wait_until="networkidle")
            pg.wait_for_function("document.querySelectorAll('#news-list .nw-item').length > 0", timeout=15000)
            pg.wait_for_timeout(300)
            return ctx, pg, errs

        # ── 폰 390
        ctx, pg, errs = page(390, 844)
        d = pg.evaluate("""() => { const rows=[...document.querySelectorAll('.nw-item')];
          return {rows: rows.length, lead: document.querySelectorAll('.nw-item--lead').length,
            leadFirst: rows[0] && rows[0].classList.contains('nw-item--lead'),
            leadPx: rows[0] ? parseFloat(getComputedStyle(rows[0].querySelector('.nw-title')).fontSize) : 0,
            restPx: rows[1] ? parseFloat(getComputedStyle(rows[1].querySelector('.nw-title')).fontSize) : 0,
            older: !!document.querySelector('.nw-older'),
            filters: [...document.querySelectorAll('#news-filter button')].map(b=>b.textContent)}; }""")
        ok(d["rows"] == 12 and d["older"], "U1 처음 12줄 + '지난 소식 더 보기' (지금 %d줄)" % d["rows"])
        ok(d["lead"] == 1 and d["leadFirst"] and d["leadPx"] >= d["restPx"] * 1.25,
           "U5 대표 소식 하나, 맨 앞, 제목이 1.25배 이상 크다 (%.1f / %.1f px)" % (d["leadPx"], d["restPx"]))
        ok(d["filters"][0] == "전체" and "공지" not in d["filters"] and "언론" in d["filters"],
           "U1 거르개는 있는 종류만(빈 '공지' 없음), 일반 기사 = '언론' %s" % d["filters"])
        pg.click(".nw-older"); pg.wait_for_timeout(200)
        focus_ok = pg.evaluate("() => { const r=[...document.querySelectorAll('.nw-item')][12]; return !!r && r.contains(document.activeElement); }")
        ok(focus_ok, "U1 더 보기 → 새로 펼친 첫 줄로 초점")
        dom = pg.evaluate("""() => ({hrefs: [...document.querySelectorAll('#news-list a[href]')].map(a=>a.getAttribute('href')),
            rows: [...document.querySelectorAll('.nw-item')].map(r => ({auto: !!r.querySelector('.nw-title a'),
               when: r.querySelector('.nw-when').textContent, more: (r.querySelector('.nw-more')||{}).textContent||'',
               t: r.querySelector('.nw-title').textContent}))})""")
        want = {a["url"] for s in live for a in s["articles"]}
        ok(want <= set(dom["hrefs"]), "U1 live-news 의 기사 %d건이 모두 화면에 링크로 있다(빠진 %d)" % (len(want), len(want - set(dom["hrefs"]))))
        ok(all(("보도" in r["when"]) == r["auto"] for r in dom["rows"]), "U6 언론 기사 줄만 날짜에 '보도'(보도일), 손으로 쓴 소식은 행사일")
        gc = [r for r in dom["rows"] if r["t"].startswith("고척스카이돔에서 애국가 열창")]
        ok(bool(gc) and gc[0]["more"] == "관련 기사 2건", "U11 손으로 쓴 '고척스카이돔' 소식에 불꽃야구 기사 2건이 붙는다(따로 줄 없음)")
        ok(not [r for r in dom["rows"] if "불꽃야구" in r["t"]], "U11 같은 일을 두 줄로 보이지 않는다")
        yh = [r for r in dom["rows"] if "윤항기" in r["t"]]
        ok(len(yh) == 1 and yh[0]["more"] == "기사 8건", "U1 윤항기 헌정 공연 = 한 줄 + '기사 8건' (지금 %d줄)" % len(yh))
        # 펼치기
        btn = pg.locator(".nw-item", has_text="윤항기").locator(".nw-more")
        btn.click(); pg.wait_for_timeout(150)
        ex = pg.evaluate("""() => { const b=[...document.querySelectorAll('.nw-more')].find(x=>x.closest('.nw-item').textContent.includes('윤항기'));
          const l=document.getElementById(b.getAttribute('aria-controls'));
          return {exp: b.getAttribute('aria-expanded'), vis: !l.hidden && l.getBoundingClientRect().height > 0,
                  li: l.querySelectorAll('li').length, src: [...l.querySelectorAll('.nw-p-src')].map(x=>x.textContent)}; }""")
        ok(ex["exp"] == "true" and ex["vis"] and ex["li"] == 8, "U7 '기사 8건' 펼침 → aria-expanded=true · 8줄")
        ok("엑스포츠뉴스" in ex["src"] and not [x for x in ex["src"] if _domainish(x)], "U7 펼친 목록은 언론사 이름(도메인 아님) %s" % ex["src"][:4])
        pr = pg.evaluate(UI_PROBE)
        ok(pr["texts"] > 100, "U2 한글 글자 노드를 실제로 쟀다 (%d개)" % pr["texts"])
        ok(not pr["monoHan"], "U2 한글에 고정폭 서체 없음 %s" % pr["monoHan"][:3])
        ok(not pr["spaced"], "U8 한글 자간 0 %s" % pr["spaced"][:3])
        ok(not pr["round"], "U9 모서리 0 %s" % pr["round"][:3])
        ok(not pr["smallTap"], "U4 누를 것 44px(제목 링크 포함) %s" % pr["smallTap"][:3])
        ok(not pr["overlap"], "U4 제목 링크와 '기사 N건' 단추의 누르는 영역이 겹치지 않는다 %s" % pr["overlap"][:3])
        ok(not pr["kindBox"], "U3 종류 라벨은 글자만(상자·배경 없음, 폭 90px 미만) %s" % pr["kindBox"][:3])
        # 감사기 자체를 의심한다 — 일부러 망가뜨리면 잡혀야 한다
        pg.add_style_tag(content=".news .nw-title{font-family:'JetBrains Mono',monospace!important}"
                                 ".news .nw-kind{border:1px solid #fff;display:block}"
                                 ".news .nw-more{min-height:20px!important;height:20px}")
        pg.wait_for_timeout(100)
        mu = pg.evaluate(UI_PROBE)
        ok(bool(mu["monoHan"]) and bool(mu["kindBox"]) and bool(mu["smallTap"]),
           "U-뮤테이션 제목 모노·라벨 상자·작은 단추를 심으면 감사기가 잡는다 (%d/%d/%d)" % (len(mu["monoHan"]), len(mu["kindBox"]), len(mu["smallTap"])))
        ok(not errs, "U13 콘솔 오류 없음 %s" % errs[:2])
        ctx.close()

        # ── 작은 폰 320 × 큰 글자(21px) — 가로 넘침
        ctx, pg, errs = page(320, 640, fs=2)
        pg.click(".nw-older"); pg.wait_for_timeout(150)
        pg.evaluate("() => document.querySelectorAll('.nw-more').forEach(b => b.click())")
        pg.wait_for_timeout(150)
        ov = pg.evaluate("() => ({doc: document.documentElement.scrollWidth - innerWidth, fs: getComputedStyle(document.documentElement).fontSize,"
                         " wide: [...document.querySelectorAll('.news .nw-item *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.nw-filter')).length})")
        ok(ov["doc"] <= 0 and ov["wide"] == 0, "U10 320px·글자 %s — 가로 넘침 없음 (문서 %dpx, 넘친 요소 %d)" % (ov["fs"], ov["doc"], ov["wide"]))
        ok(not errs, "U13 320 콘솔 오류 없음 %s" % errs[:2])
        ctx.close()

        # ── PC 1440 — 왼쪽 메타 열
        ctx, pg, errs = page(1440, 900, mobile=False)
        g = pg.evaluate("""() => { const r=document.querySelectorAll('.nw-item')[1]; const m=r.querySelector('.nw-meta'), t=r.querySelector('.nw-title');
          return {grid: getComputedStyle(r).display, metaLeft: m.getBoundingClientRect().right < t.getBoundingClientRect().left}; }""")
        ok(g["grid"] == "grid" and g["metaLeft"], "U14 PC — 메타(종류·날짜·언론사)가 왼쪽 열, 제목이 오른쪽")
        pr = pg.evaluate(UI_PROBE)
        ok(not pr["monoHan"] and not pr["kindBox"] and not pr["smallTap"] and not pr["overlap"],
           "U2·U3·U4 PC 도 같다 %s" % (pr["monoHan"][:2] + pr["kindBox"][:2] + pr["smallTap"][:2] + pr["overlap"][:2]))
        ok(not errs, "U13 PC 콘솔 오류 없음 %s" % errs[:2])
        ctx.close()

        # ── EN
        ctx, pg, errs = page(390, 844, lang="en")
        e = pg.evaluate("""() => ({when: document.querySelector('.nw-item--press .nw-when').textContent,
            f0: document.querySelector('#news-filter button').textContent,
            more: (document.querySelector('.nw-more')||{}).textContent||'', note: document.querySelector('.nw-note').textContent.slice(0, 20)})""")
        ok(e["when"].startswith("Reported ") and e["f0"] == "All" and e["more"].endswith("articles") and e["note"].startswith("Press coverage"),
           "U12 EN — 'Reported …' · 'All' · 'N articles' · 안내문 %s" % e)
        ok(not errs, "U13 EN 콘솔 오류 없음 %s" % errs[:2])
        ctx.close()
        br.close()
    httpd.shutdown()
    return bad, n[0]


def main(argv):
    print("① 데이터 — 고정 입력(2026-10-03 라이브 69건)")
    cn = load_cn()
    bad, n = data_checks(cn, verbose="-v" in argv)
    for b in bad:
        print("  ✗", b)
    print("  %d개 단언 중 실패 %d" % (n, len(bad)))
    fails = len(bad)

    print("② 뮤테이션 — 망가뜨리면 실패해야 한다")
    for name, fn in mutations():
        m = load_cn()
        fn(m)
        try:
            mb, _ = data_checks(m)
        except Exception as e:
            mb = ["예외 %s" % type(e).__name__]
        caught = len(mb) > 0
        print("  %s %-30s → %s" % ("✓" if caught else "✗", name, ("잡힘 %d건: %s" % (len(mb), mb[0][:56])) if caught else "안 잡힘!"))
        if not caught:
            fails += 1

    if "--ui" in argv:
        print("③ 화면 — news.html (폰 390 · 작은 폰 320×21px · PC 1440 · EN)")
        ub, un = ui_checks()
        print("  %d개 단언 중 실패 %d" % (un, len(ub)))
        fails += len(ub)
    print("\n결과:", "실패 %d" % fails if fails else "전부 통과")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
