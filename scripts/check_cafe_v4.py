# 실행: 사이트 루트를 http://127.0.0.1:8908 로 띄운 뒤 playwright 파이썬으로
#       `python scripts/check_cafe_v4.py`            (전부)
#       `python scripts/check_cafe_v4.py R H C`      (묶음만 — P0 R H C 중)
#       `python scripts/check_cafe_v4.py --fast`     (H2·C5·C16 의 큰 행렬을 줄여서)
# 사랑방 v4 · 헤더 회원 입구 · 회원 창 — 설계서 합격 기준(P0·R·H·C)을 실제 브라우저로 잰다.
# Supabase 로 가는 요청은 전부 check_board_ui.Fake(가짜 서버)가 받는다. 운영 DB·카카오·메일로 새지 않는다.
# 대비·넘침 같은 '0건이면 통과' 검사는 반드시 검사한 요소 수를 함께 단언한다 — 0 은 성공처럼 생겼다
# (메모리 contrast-audit-traps). 마지막에 --faint 를 #555 로 바꾸는 뮤테이션으로 대비 검사가 살아 있는지 본다.
import base64, json, re, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import check_board_ui as M   # 가짜 서버(Fake) — __main__ 가드라 import 해도 돌지 않는다

B = M.B
SUPA = M.SUPA
PAGES = ["index", "about", "music", "schedule", "news", "archive", "haemil", "community", "privacy", "terms"]
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
FAST = "--fast" in sys.argv
GROUPS = set(ARGS) or {"P0", "R", "H", "C", "V2", "V3", "V4"}
R = []


def t(name, ok, info=""):
    R.append((name, bool(ok), str(info)[:240]))
    print(("  ✓ " if ok else "  ✗ ") + name + ("" if ok else "   ← " + str(info)[:240]), flush=True)


# ── 시험 자료 ─────────────────────────────────────────────
def seed(f):
    adm = f.add_user("op@test.local", "op-pass", confirmed=True)
    f.admins.add(adm)
    f.members[adm] = {"nickname": "사랑방지기", "level": "member", "level_by": "admin"}
    fans = []
    for i, (nick, lv) in enumerate([("홍천팬", "member"), ("부산 갈매기", "member"), ("거위의꿈 1999", "member"),
                                    ("대전 아줌마", "sprout"), ("미국사는 딸", "member"), ("밤편지", "sprout")]):
        u = f.add_user("fan%d@test.local" % i, "pw", confirmed=True)
        f.members[u] = {"nickname": nick, "level": lv, "level_by": "auto"}
        fans.append(u)
    long12 = f.add_user("long@test.local", "pw", confirmed=True)
    f.members[long12] = {"nickname": "가나다라마바사아자차카타", "level": "member", "level_by": "auto"}   # 12자(직접 셈)
    kk = f.add_user(None, None, "kakao", {"nickname": "카카오회원"}, True)
    f.members[kk] = {"nickname": "카카오회원", "level": "member", "level_by": "auto"}
    P = [(adm, "notice", "사랑방 카페 이용 안내"), (adm, "notice", "10월 공연 일정이 올라왔습니다"), (adm, "notice", "추석 연휴 운영 안내"),
         (fans[0], "hello", "홍천에서 인사드립니다"), (fans[1], "review", "어제 부산 공연 다녀왔습니다 — 거위의 꿈에서 울었어요"),
         (fans[2], "free", "1999년 앨범 테이프를 아직 갖고 있어요"), (fans[3], "hello", "대전에서 처음 가입했어요"),
         (fans[4], "free", "미국에서도 응원합니다"), (fans[1], "review", "불후의 명곡 다시보기 추천합니다"),
         (fans[0], "free", "가을에 듣기 좋은 노래 추천해 주세요"), (fans[5], "hello", "안녕하세요 반갑습니다"),
         (fans[2], "free", "라디오에서 '밤이면 밤마다'가 나왔어요"), (fans[4], "review", "열린음악회 방송 잘 봤습니다"),
         (fans[0], "free", "오늘 날씨가 좋네요")]
    ids = []
    for i, (u, bd, ti) in enumerate(P):
        pid = f.nid()
        f.posts.append({"id": pid, "uid": u, "board": bd, "title": ti, "body": "본문 %d\n둘째 줄" % i, "status": "approved",
                        "created_at": "2026-09-%02dT0%d:10:00Z" % (10 + i, i % 9)})
        ids.append(pid)
    for k in range(4):
        f.comments.append({"id": f.nid(), "post": ids[4], "uid": fans[k], "body": "댓글 %d" % k, "status": "approved",
                           "created_at": "2026-09-16T1%d:00:00Z" % k})
    f.comments.append({"id": f.nid(), "post": ids[4], "uid": adm, "body": "후기 고맙습니다.", "status": "approved",
                       "created_at": "2026-09-16T15:00:00Z"})
    return {"ids": ids, "adm": adm, "fans": fans, "long": long12, "kakao": kk}


def ctx_of(br, f, w, h, conf="{board: true, kakao: true}", fs=17, session=None, lang=None, mobile=None, intro_seen=True):
    if mobile is None:
        mobile = w < 768
    c = br.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile, locale="ko-KR",
                       device_scale_factor=1)
    init = "window.INSOONI_CONFIG = %s;" % conf if conf is not None else ""
    init += "try{localStorage.setItem('insooni_fs', '%d')}catch(e){}" % {17: 0, 19: 1, 21: 2}[fs]
    if intro_seen:
        init += "try{sessionStorage.setItem('insooni_intro','1')}catch(e){}"
    if lang:
        init += "try{localStorage.setItem('insooni_lang', JSON.stringify('%s'))}catch(e){}" % lang
    if session:
        init += "try{if(!localStorage.getItem('insooni_member_session'))localStorage.setItem('insooni_member_session', %s)}catch(e){}" % json.dumps(json.dumps(session))
    c.add_init_script(init)
    calls = []

    def supa(route):
        calls.append(route.request.url)
        if f is None:
            return route.abort()
        return f.handle(route)
    c.route(re.compile(r"https://%s/.*" % re.escape(SUPA)), supa)
    c.route(re.compile(r"https://(?!%s).*" % re.escape(SUPA)), lambda r: r.abort())   # 바깥 세상(애플 CDN·날씨)은 끊는다
    c.calls = calls
    return c


def sess(f, uid):
    s = f.session(uid)
    return {"at": s["access_token"], "rt": s["refresh_token"], "exp": int(time.time() * 1000) + 3600e3}


def fresh(pg, url, wait=1300):
    pg.goto("about:blank")
    pg.goto(B + url, wait_until="load")
    if url.startswith("index"):
        # 홈은 도입부(세션당 1회)가 끝나야 헤더가 선다 — 그 전에 재면 투명한 헤더를 잰다
        pg.wait_for_function("!document.documentElement.classList.contains('is-intro')", timeout=20000)
    pg.wait_for_timeout(wait)


def errs_of(pg):
    E = []
    pg.on("pageerror", lambda e: E.append(str(e)[:160]))
    return E


# 화면에 실제로 보이는가 — 크기·가시성 + 그 자리에 다른 것이 덮고 있지 않은가
VIS_JS = """(e) => { if (!e) return false; const r = e.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  if (!e.checkVisibility({checkVisibilityCSS: true})) return false;
  if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
  const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const hit = document.elementFromPoint(x, y); return !!hit && (hit === e || e.contains(hit)); }"""

FILLED_JS = """() => { const vis = %s; const out = [];
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('.bd-badge--artist')) continue;
    const cs = getComputedStyle(e); if (cs.backgroundColor !== 'rgb(243, 239, 231)') continue;
    const r = e.getBoundingClientRect(); if (r.width * r.height <= 1500) continue;
    if (!vis(e)) continue; out.push((e.id ? '#' + e.id : e.className || e.tagName) + ' ' + (e.textContent || '').trim().slice(0, 14)); }
  return out; }""" % VIS_JS

MONO_JS = """(root) => { const out = []; let seen = 0;
  const w = document.createTreeWalker(document.querySelector(root), NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { if (!/[가-힣]/.test(n.nodeValue)) continue; const e = n.parentElement; if (!e) continue;
    if (!e.checkVisibility({checkVisibilityCSS: true})) continue; const r = e.getBoundingClientRect(); if (!r.width) continue;
    if (e.closest('.sr-only')) continue; seen++;
    const ff = getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (/JetBrains Mono/i.test(ff) && !e.closest('.bd-when, .gig-n, .gig-when, .gig-code')) out.push(n.nodeValue.trim().slice(0, 20) + ' <' + e.className + '>'); }
  return {seen, out}; }"""

DASH_JS = """() => { const out = []; for (const e of document.querySelectorAll('*')) { const cs = getComputedStyle(e);
  for (const s of ['Top', 'Right', 'Bottom', 'Left']) if (cs['border' + s + 'Style'] === 'dashed' && parseFloat(cs['border' + s + 'Width']) > 0) { out.push(e.className || e.tagName); break; }
  if (cs.outlineStyle === 'dashed' && parseFloat(cs.outlineWidth) > 0) out.push('outline ' + (e.className || e.tagName)); } return out; }"""

# 넘침은 clientWidth(레이아웃 폭)와 견준다 — 폰 흉내(is_mobile)에서는 내용이 넘치면 크로뮴이 화면을 축소해 innerWidth 가
# 내용 폭까지 늘어난다(360 → 441 실측). innerWidth 와 견주면 넘쳐도 0 이 나왔다(검토 4바퀴 6번 뮤테이션에서 드러남)
OVER_JS = "document.documentElement.scrollWidth - document.documentElement.clientWidth"

# 대비 감사(verify_8908 과 같은 방식: 직접 텍스트 노드 · 조상 배경 합성, 배경 그림이면 건너뜀)
AUDIT_JS = r"""(scope) => {
  function lum(c) { var m = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(function (v) {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return .2126 * m[0] + .7152 * m[1] + .0722 * m[2]; }
  function rgba(c) { var a = c.match(/[\d.]+/g).map(Number); return [a[0], a[1], a[2], a.length > 3 ? a[3] : 1]; }
  function backdrop(el) { var stack = [], n = el;
    while (n && n !== document.documentElement) { var cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return null;
      var c = rgba(cs.backgroundColor); if (c[3] > 0) { stack.push(c); if (c[3] > .95) break; } n = n.parentElement; }
    var base = [8, 8, 8]; for (var i = stack.length - 1; i >= 0; i--) { var a = stack[i][3];
      base = [0, 1, 2].map(function (k) { return a * stack[i][k] + (1 - a) * base[k]; }); }
    return 'rgb(' + base.map(Math.round).join(',') + ')'; }
  var bad = [], seen = 0, low = 99, root = scope ? document.querySelector(scope) : document.body;
  if (!root) return {seen: 0, bad: ['scope 없음'], low: 0};
  var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), ck = new Set(), n;
  while ((n = w.nextNode())) { if (!n.nodeValue || !n.nodeValue.trim()) continue; var e = n.parentElement;
    if (!e || ck.has(e)) continue; ck.add(e); var r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.bottom < 0 || r.top > innerHeight) continue;
    var cs = getComputedStyle(e); if (cs.clip === 'rect(0px, 0px, 0px, 0px)') continue;
    if (!e.checkVisibility({checkVisibilityCSS: true, checkOpacity: true})) continue;
    if (e.closest('[hidden],.sr-only,.skip-link,[inert]')) continue;
    if (e.closest('.bd-kakao')) continue;   /* 카카오 디자인 가이드 고정색(노랑 위 검정 85%) */
    var g = backdrop(e); if (!g) continue; seen++;
    var fg = rgba(cs.color); if (fg[3] < 1) { var gb = rgba(g); fg = [0, 1, 2].map(function (k) { return fg[3] * fg[k] + (1 - fg[3]) * gb[k]; }); }
    var a = lum('rgb(' + fg.slice(0, 3).join(',') + ')'), b = lum(g), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    var px = parseFloat(cs.fontSize), need = (px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700)) ? 3 : 4.5;
    low = Math.min(low, ratio / need * 4.5);
    if (ratio < need) bad.push(n.nodeValue.trim().slice(0, 18) + ' ' + ratio.toFixed(2) + ':1'); }
  return {seen: seen, bad: bad, low: low}; }"""


def run():
    with sync_playwright() as p:
        br = p.chromium.launch()
        try:
            if "P0" in GROUPS:
                group_p0(br)
            if "R" in GROUPS:
                group_r(br)
            if "H" in GROUPS:
                group_h(br)
            if "C" in GROUPS:
                group_c(br)
            if "V2" in GROUPS:
                group_v2(br)
            if "V3" in GROUPS:
                group_v3(br)
            if "V4" in GROUPS:
                group_v4(br)
        finally:
            br.close()


# ═══ P0 — KOE205 안전장치 · 작업 기준 ═══════════════════════════
def group_p0(br):
    print("── P0")
    for w, h in [(375, 812), (1280, 860)]:
        f = M.Fake(); seed(f)          # 가짜 서버 settings 는 kakao: true
        # config.js 의 기본값이 kakao=true 로 바뀌었으므로(2f99dab) 꺼짐을 명시한다 — 검사의 뜻(true 가 아니면 단추 0)은 그대로
        c = ctx_of(br, f, w, h, conf="{board: true, kakao: false}"); pg = c.new_page()
        fresh(pg, "community.html")
        pg.click("#hm"); pg.wait_for_timeout(900)
        n = pg.locator("#bd-sheet .bd-kakao").count()
        tab = pg.evaluate("(document.querySelector('#bd-sheet .bd-tab[aria-pressed=true]') || {}).textContent || ''")
        sh = pg.inner_text("#bd-sheet")
        # 처음 쓰는 기기는 '처음 가입' 탭이 먼저(검토 38번) · 없는 카카오를 권하는 말 0(검토 26번)
        t("P0-2 config.kakao 가 true 가 아니면 서버가 카카오를 켜 둬도 카카오 단추 0개 · 처음 기기는 '처음 가입' 먼저 · '카카오' 문구 0 (%d)" % w,
          n == 0 and pg.is_visible("#bd-ue") and tab == "처음 가입" and "카카오" not in sh, (n, tab, sh[:60]))
        c.close()
    # P0-3 — 카카오로 떠났다가 '뒤로 가기'로 돌아옴
    f = M.Fake(); seed(f)
    c = ctx_of(br, f, 375, 812); pg = c.new_page()
    # 카카오 화면(KOE205)을 흉내 — 우리 사이트가 아닌 곳이라 그 사이 우리 문서는 열리지 않는다
    c.route(re.compile(r"https://kauth\.kakao\.com/.*"), lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8",
                                                                             body="<p>잘못된 요청 (KOE205)</p>"))
    fresh(pg, "community.html")
    pg.evaluate("localStorage.setItem('insooni_pkce', JSON.stringify({v: 'x', p: 'kakao', at: Date.now()}))")
    pg.goto("https://kauth.kakao.com/oauth/authorize?x=1", wait_until="load"); pg.wait_for_timeout(400)
    pg.go_back(wait_until="load"); pg.wait_for_timeout(1800)
    al = pg.evaluate("""() => [...document.querySelectorAll('#bd-sheet [role=alert]')].filter(e => e.checkVisibility()).map(e => e.textContent)""")
    # 코드 없이 돌아온 사람은 대부분 동의 화면에서 망설이다 뒤로 간 사람이다 — 원인을 단정하지 않고(첫 초점 = 알림),
    # 실제로 되는 길(노란 카카오)을 이메일 양식보다 앞에 그대로 둔다. 예전에는 사랑방이면 카카오를 이메일 아래 테두리 단추로
    # 내려 375×812 에서 화면 밖(top 927)이었다(검토 4바퀴 5번). 혹시 KOE 였을 때를 위해 이메일 '처음 가입'도 열린다
    d = pg.evaluate("""() => { const sh = document.getElementById('bd-sheet'), k = sh.querySelector('.bd-kakao'),
        pane = sh.querySelector('.bd-pane'), up = [...sh.querySelectorAll('.bd-tab')].map(b => b.textContent);
      return {focus: document.activeElement && document.activeElement.className, low: !!(k && k.classList.contains('bd-kakao--low')),
              before: !!(k && pane && (k.compareDocumentPosition(pane) & Node.DOCUMENT_POSITION_FOLLOWING)),
              bg: k ? getComputedStyle(k).backgroundColor : '', kb: k ? Math.round(k.getBoundingClientRect().bottom) : 9999, ih: innerHeight, tabs: up}; }""")
    t("P0-3 PKCE(kakao) 남긴 채 뒤로 가기 → 시트 start + role=alert 'bd.kakaoBack'('끝나지 않았습니다 … KOE', 원인 단정 없음) 정확히 1개 · 검증값 지움 · 첫 초점 알림 · 노란 카카오가 이메일보다 앞(화면 안) · '처음 가입' 열림",
      pg.is_visible("#bd-sheet") and len(al) == 1 and "카카오 로그인이 끝나지 않았습니다" in al[0] and "KOE" in al[0]
      and pg.evaluate("localStorage.getItem('insooni_pkce')") is None
      and d["focus"] == "bd-alert" and not d["low"] and d["before"] and d["bg"] == "rgb(254, 229, 0)" and d["kb"] <= d["ih"] and "처음 가입" in d["tabs"], (al, d))
    c.close()
    # 인앱 창을 닫고 QR 을 다시 찍은 경우(뒤로 가기가 아니라 새로 열기)도 같은 안내를 한다(검토 32번 ③)
    c = ctx_of(br, f, 375, 812); pg = c.new_page()
    fresh(pg, "community.html")
    pg.evaluate("localStorage.setItem('insooni_pkce', JSON.stringify({v: 'x', p: 'kakao', at: Date.now()}))")
    fresh(pg, "community.html")
    al = pg.evaluate("""() => [...document.querySelectorAll('#bd-sheet [role=alert]')].filter(e => e.checkVisibility()).map(e => e.textContent)""")
    t("P0-3b 새로 열기(QR 재스캔)도 10분 안이면 같은 안내 1개 · 검증값 지움", pg.is_visible("#bd-sheet") and len(al) == 1
      and pg.evaluate("localStorage.getItem('insooni_pkce')") is None, al)
    c.close()
    # 10분이 지난 검증값은 말하지 않는다(다른 날의 시도까지 끌어오지 않게)
    c = ctx_of(br, f, 375, 812); pg = c.new_page()
    fresh(pg, "community.html")
    pg.evaluate("localStorage.setItem('insooni_pkce', JSON.stringify({v: 'x', p: 'kakao', at: Date.now() - 11 * 60e3}))")
    fresh(pg, "community.html")
    t("P0-3c 11분 묵은 검증값 → 경고하지 않음", not pg.is_visible("#bd-sheet"))
    c.close()
    # P0-4 — 카카오 취소
    c = ctx_of(br, f, 375, 812); pg = c.new_page()
    fresh(pg, "community.html?error=access_denied&bd=kakao")
    s = pg.inner_text("#bd-sheet") if pg.is_visible("#bd-sheet") else ""
    t("P0-4 ?error=access_denied&bd=kakao → '카카오 로그인을 취소하셨습니다' · '링크가 만료' 없음 · 주소 정리",
      "카카오 로그인을 취소하셨습니다" in s and "링크가 만료" not in s and "error=" not in pg.url, (s[:80], pg.url))
    c.close()
    # P0-5 — 작업 기준
    # 라이브(origin/main)가 이 작업의 조상이어야 한다 — 뒤처진 기준선 위에서 고치면 push 때 라이브의 수정
    # (www→insooni.com 이동 등)이 되돌아간다(검토 34·46번). 고정 해시(37ea103)는 형식상만 통과했다
    ok = subprocess.run(["git", "merge-base", "--is-ancestor", "origin/main", "HEAD"], cwd=ROOT).returncode == 0
    cfgsrc = (ROOT / "assets/js/config.js").read_text(encoding="utf-8")
    t("P0-5 origin/main 위에서 작업 · config.board 기본값 true · www→insooni.com 이동 보존",
      ok and re.search(r'INSOONI_CONFIG\.board = true;', cfgsrc) is not None and 'location.hostname === "www.insooni.com"' in cfgsrc, ok)


# ═══ R — 라우터 ════════════════════════════════════════════
def group_r(br):
    print("── R")
    f = M.Fake(); seed(f)
    c = ctx_of(br, f, 1280, 860); pg = c.new_page()
    fresh(pg, "news.html")
    pg.evaluate("window.__keep = 1")
    pg.click(".site-header .main-nav a[href='community.html']"); pg.wait_for_timeout(1600)
    d = pg.evaluate("({p: document.body.dataset.page, k: getComputedStyle(document.body).getPropertyValue('--hero-key').trim(), keep: window.__keep})")
    t("R1 소식 → 헤더 '사랑방'(라우터) → body[data-page]=community · --hero-key .19", d["p"] == "community" and d["k"] == ".19" and d["keep"] == 1, d)
    for href in ["news.html", "live.html?e=K7Q2M", "/live?e=K7Q2M"]:
        fresh(pg, "community.html")
        pg.evaluate("""(h) => { window.__keep = 1; const a = document.createElement('a'); a.href = h; a.id = 'probe';
          if (h === 'news.html') a.setAttribute('data-router', 'off'); a.textContent = 'probe';
          document.querySelector('#main').prepend(a); }""", href)
        with pg.expect_navigation(timeout=8000):
            pg.evaluate("document.getElementById('probe').click()")   # 라우터는 문서 click 을 듣는다 — 같은 길
        pg.wait_for_timeout(500)
        t("R2 %s 링크 → 문서를 새로 연다(<main> 만 갈아끼우지 않음)" % (href if href != "news.html" else "data-router=off"),
          pg.evaluate("window.__keep") is None, pg.url)
    c.close()


# ═══ H — 헤더 회원 입구 ═══════════════════════════════════════
def group_h(br):
    print("── H")
    # H1 — 스위치 꺼짐
    f = M.Fake(); seed(f)
    c = ctx_of(br, f, 1280, 860, conf="{board: false}"); pg = c.new_page()
    bad = []
    for name in PAGES:
        fresh(pg, name + ".html", 900)
        n = pg.evaluate("[document.querySelectorAll('.hm').length, document.querySelectorAll('.nav-member').length]")
        if n != [0, 0]:
            bad.append((name, n))
    member_calls = [u for u in c.calls if "/auth/v1/" in u or re.search(r"/rpc/(member_|board_|comment_|cafe_|gig_)", u)]
    other = [u for u in c.calls if u not in member_calls]
    t("H1 board=false → 10페이지 .hm 0 · .nav-member 0 · 회원·게시판 요청 0 (신청곡 공개 집계 %d건은 별개 기능)" % len(other),
      not bad and not member_calls and all("song_requests" in u for u in other), (bad, member_calls[:2], other[:2]))
    c.close()

    # H2 — 행렬: 페이지 × 폭 × 글자 × 상태
    widths = [320, 360, 375, 390, 414, 768, 1081, 1280, 1440]
    pages = PAGES if not FAST else ["index", "news", "community", "music"]
    f = M.Fake(); S = seed(f)
    fails, n = [], 0
    for state in ["out", "member"]:
        for fs in [17, 21]:
            for name in pages:
                c = ctx_of(br, f, 1440, 900, fs=fs, session=sess(f, S["long"]) if state == "member" else None, mobile=False)
                pg = c.new_page()
                pg.goto(B + name + ".html", wait_until="load"); pg.wait_for_timeout(1300)
                if name == "index":
                    # 홈 도입부 동안은 헤더가 눌리지 않고(pointer-events:none) 상표가 크다 — 끝난 뒤의 헤더를 잰다(fresh 와 같은 기준)
                    pg.wait_for_function("!document.documentElement.classList.contains('is-intro')", timeout=20000)
                    pg.wait_for_timeout(300)
                for w in widths:
                    pg.set_viewport_size({"width": w, "height": 860}); pg.wait_for_timeout(180)
                    d = pg.evaluate("""() => { const hm = document.getElementById('hm'), b = document.querySelector('.site-header .brand');
                      const ul = document.querySelector('.site-header .main-nav ul');
                      if (!hm) return null; const r = hm.getBoundingClientRect();
                      const bs = [...b.querySelectorAll('.brand-en, .brand-mark')].filter(e => e.checkVisibility()).map(e => e.getBoundingClientRect().right);
                      const tg = document.querySelector('.site-header .nav-toggle'), tgOn = tg && tg.checkVisibility();
                      const hl = document.querySelector('.site-header .header-tools .lang-toggle'), nl = document.querySelector('.main-nav .nav-lang');
                      return {tg: tgOn ? tg.getBoundingClientRect().right : 0,
                              en: (hl && hl.checkVisibility()) || (!!nl && getComputedStyle(nl).display !== 'none'),
                              gapB: r.left - Math.max(...bs), gapN: innerWidth >= 1081 ? r.left - ul.getBoundingClientRect().right : 99,
                              over: document.documentElement.scrollWidth - document.documentElement.clientWidth, w: r.width, h: r.height,
                              txt: hm.innerText, member: /내 정보|My page/.test(hm.innerText)}; }""")
                    n += 1
                    if not d:
                        fails.append((state, fs, name, w, "입구 없음")); continue
                    why = []
                    if w < 1081 and d["gapB"] < 8: why.append("상표와 %.1f" % d["gapB"])
                    if w < 1081 and d["tg"] > w - 8: why.append("☰ right %.1f" % d["tg"])
                    if not d["en"]: why.append("EN 없음")
                    if d["gapN"] < 16: why.append("내비와 %.1f" % d["gapN"])
                    if d["over"] > 0: why.append("넘침 %d" % d["over"])
                    if d["w"] < 44 or d["h"] < 44: why.append("크기 %.0fx%.0f" % (d["w"], d["h"]))
                    if (state == "member") != d["member"]: why.append("상태 " + d["txt"])
                    if why:
                        fails.append((state, fs, name, w, " · ".join(why)))
                c.close()
    t("H2 %d조합(페이지 %d × 폭 9 × 글자 2 × 상태 2) 상표 간격 ≥8 · 내비 간격 ≥16 · ☰ right ≤ 폭−8 · EN 이 헤더나 메뉴에 · 넘침 0 · 44×44" % (n, len(pages)), not fails and n > 0, fails[:6])

    # H3 — 긴/짧은 라벨
    c = ctx_of(br, f, 1440, 900, mobile=False); pg = c.new_page(); fresh(pg, "news.html")
    a = pg.inner_text("#hm")
    c.close()
    c = ctx_of(br, f, 1081, 860, fs=21, mobile=False); pg = c.new_page(); fresh(pg, "news.html")
    b = pg.inner_text("#hm")
    pg.set_viewport_size({"width": 1440, "height": 860}); pg.wait_for_timeout(300)
    b2 = pg.inner_text("#hm")     # 넓히면 다시 긴 라벨(ResizeObserver)
    c.close()
    c = ctx_of(br, f, 1440, 900, session=sess(f, S["long"]), mobile=False); pg = c.new_page(); fresh(pg, "news.html")
    m = pg.evaluate("""() => { const h = document.getElementById('hm'); const v = s => { const e = h.querySelector(s); return !!e && e.checkVisibility() && e.getBoundingClientRect().width > 0; };
      return {nick: v('.hm-nick'), lv: v('.hm-lv'), txt: h.innerText}; }""")
    c.close()
    t("H3 1440×17 '로그인 · 회원가입' · 1081×21 '로그인' · 회원 1440×17 별명·등급·'내 정보'",
      a == "로그인 · 회원가입" and b == "로그인" and b2 == "로그인 · 회원가입" and m["nick"] and m["lv"] and "내 정보" in m["txt"], (a, b, b2, m))

    # H4 — 아주 좁은 폰의 언어 단추
    c = ctx_of(br, f, 320, 640, fs=21); pg = c.new_page(); fresh(pg, "news.html")
    hid = pg.evaluate("getComputedStyle(document.querySelector('.header-tools .lang-toggle')).display")
    pg.click(".nav-toggle"); pg.wait_for_timeout(600)
    nl = pg.locator(".main-nav .nav-lang")
    nl.scroll_into_view_if_needed(); hgt = nl.bounding_box()["height"]
    nl.click(); pg.wait_for_timeout(1500)
    t("H4 ≤359px 헤더 EN 숨김 · 메뉴 패널 맨 아래 'English'(56px) → 영어", hid == "none" and hgt >= 56
      and pg.evaluate("document.documentElement.lang") == "en", (hid, hgt))
    c.close()

    # H5 — 시트는 맨 위 층 · inert · Esc 로 닫고 초점 복귀
    c = ctx_of(br, f, 1280, 860); pg = c.new_page(); fresh(pg, "news.html")
    pg.click("#hm"); pg.wait_for_timeout(900)
    d = pg.evaluate("""() => { const s = document.getElementById('bd-sheet'), b = s.querySelector('.bd-sheet-box').getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return {role: s.getAttribute('role'), inside: s.contains(hit), inert: ['.site-header', '#main', '.footer-min'].map(q => document.querySelector(q).inert)}; }""")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    act = pg.evaluate("document.activeElement && document.activeElement.id")
    inert_after = pg.evaluate("['.site-header', '#main', '.footer-min'].map(q => document.querySelector(q).inert)")
    t("H5 소식에서 입구 → role=dialog 시트 맨 위 · 헤더·본문·푸터 inert · Esc → 닫힘 · 초점 입구로",
      d["role"] == "dialog" and d["inside"] and all(d["inert"]) and act == "hm" and not any(inert_after)
      and not pg.is_visible("#bd-sheet"), (d, act, inert_after))
    c.close()

    # H6 — 320×21 메뉴 패널
    c = ctx_of(br, f, 320, 640, fs=21); pg = c.new_page(); fresh(pg, "news.html")
    pg.click(".nav-toggle"); pg.wait_for_timeout(700)
    first = pg.evaluate("document.querySelector('.main-nav').firstElementChild.id")
    last = pg.locator(".main-nav ul li:last-child a")
    pg.evaluate("document.querySelector('.main-nav').scrollTop = 1e6"); pg.wait_for_timeout(200)
    reach = pg.evaluate("""() => { const a = document.querySelector('.main-nav ul li:last-child a'), r = a.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= innerHeight && r.top >= 0 && (hit === a || a.contains(hit)); }""")
    pg.evaluate("document.querySelector('.main-nav').scrollTop = 0"); pg.wait_for_timeout(200)
    pg.click(".nav-member-b"); pg.wait_for_timeout(900)
    t("H6 320×21 메뉴: 회원 입구가 첫 블록 · 마지막 메뉴까지 스크롤로 닿음 · 입구 → 패널 닫히고 시트",
      first == "nav-member" and reach and not pg.evaluate("document.querySelector('.main-nav').classList.contains('open')")
      and pg.is_visible("#bd-sheet"), (first, reach))
    c.close()

    # H7 — 로그인 왕복 뒤 원래 자리로
    f2 = M.Fake(); S2 = seed(f2)
    c = ctx_of(br, f2, 1280, 860); pg = c.new_page()
    fresh(pg, "news.html#x")
    pg.evaluate("window.scrollTo(0, 600)"); pg.wait_for_timeout(300)
    y0 = pg.evaluate("scrollY")
    pg.click("#hm"); pg.wait_for_timeout(900)
    pg.click("#bd-sheet .bd-kakao"); pg.wait_for_timeout(3000)
    d = pg.evaluate("({p: location.pathname, s: location.search, h: location.hash, y: scrollY, aria: document.getElementById('hm').getAttribute('aria-label'), toast: (document.getElementById('hm-toast') || {}).textContent, role: (document.getElementById('hm-toast') || {getAttribute: () => ''}).getAttribute('role')})")
    pg.wait_for_timeout(5300)
    gone = pg.evaluate("(() => { const n = document.getElementById('hm-toast'), r = n.getBoundingClientRect(); return n.textContent === '' && r.width * r.height === 0; })()")
    t("H7 news.html#x·y600 → 카카오 왕복 → /news.html#x · 코드·bd 없음 · y≈600 · 회원 입구 · 토스트(별명) 5초 뒤 사라짐",
      d["p"].endswith("/news.html") and d["h"] == "#x" and d["s"] == "" and abs(d["y"] - y0) <= 40 and y0 >= 560
      and "카카오회원" in (d["aria"] or "") and "카카오회원" in (d["toast"] or "") and d["role"] == "status" and gone, (d, y0, gone))
    c.close()

    # H8 — 입구 글자 대비(글자만 투명으로 만들고 그 아래 배경을 잰다)
    for page, name in [("index.html", "홈 첫 화면"), ("community.html", "사랑방")]:
        res = []
        for sess_on in (False, True):
            c = ctx_of(br, f, 1440, 900, session=sess(f, S["long"]) if sess_on else None, mobile=False); pg = c.new_page()
            fresh(pg, page, 2500 if page == "index.html" else 1300)
            res.append(hm_contrast(pg))
            c.close()
        ok = all(r["n"] >= 1 and r["low"] >= 4.5 for r in res)
        t("H8 입구 글자 대비 ≥4.5:1 — %s(로그아웃·회원, 잰 글자 상자 %s)" % (name, [r["n"] for r in res]), ok, res)

    # H9 — 자판이 올라와 보이는 화면이 420px 일 때 가입 마치기 단추
    c = ctx_of(br, f, 375, 812); pg = c.new_page()
    c.add_init_script("Object.defineProperty(window, 'visualViewport', {configurable: true, get: () => ({height: 420, offsetTop: 0, width: 375})});")
    nk = f.add_user(None, None, "kakao", {"nickname": "새카카오"}, True)
    pg2 = c.new_page(); pg.close(); pg = pg2
    c.add_init_script("try{localStorage.setItem('insooni_member_session', %s)}catch(e){}" % json.dumps(json.dumps(sess(f, nk))))
    fresh(pg, "community.html")
    pg.click("#hm"); pg.wait_for_timeout(800)
    first = pg.evaluate("document.activeElement && document.activeElement.id")
    pg.focus("#bd-jn"); pg.wait_for_timeout(400)
    r = pg.evaluate("(() => { const b = document.querySelector('#bd-sheet .bd-aform button[type=submit]').getBoundingClientRect(); return {top: b.top, bottom: b.bottom, txt: document.querySelector('#bd-sheet .bd-aform button[type=submit]').textContent}; })()")
    t("H9 visualViewport 420 · 첫 초점 '모두 동의'(별명 칸 아님) · 별명 칸 초점 → '가입 마치기' 단추가 0~420 안",
      first == "bd-jall" and r["top"] >= 0 and r["bottom"] <= 420 and "가입" in r["txt"], (first, r))
    c.close()
    # 큰 글자·낮은 폰에서도(검토 22번: 375×812/21 은 455–516, 360×640/17(자판 330) 은 353–405 로 자판 아래였다)
    bad9 = []
    for (w9, h9, fs9, vv9) in ((375, 812, 21, 420), (360, 640, 17, 330)):
        c = ctx_of(br, f, w9, h9, fs=fs9)
        c.add_init_script("Object.defineProperty(window, 'visualViewport', {configurable: true, get: () => ({height: %d, offsetTop: 0, width: %d})});" % (vv9, w9))
        nk = f.add_user(None, None, "kakao", {"nickname": "새카카오"}, True)
        c.add_init_script("try{localStorage.setItem('insooni_member_session', %s)}catch(e){}" % json.dumps(json.dumps(sess(f, nk))))
        pg = c.new_page(); fresh(pg, "community.html")
        pg.click("#hm"); pg.wait_for_timeout(800)
        pg.focus("#bd-jn"); pg.wait_for_timeout(400)
        r = pg.evaluate("(() => { const b = document.querySelector('#bd-sheet .bd-aform button[type=submit]').getBoundingClientRect(), i = document.getElementById('bd-jn').getBoundingClientRect(); return {top: b.top, bottom: b.bottom, itop: i.top}; })()")
        if not (r["itop"] >= 0 and r["bottom"] <= vv9):
            bad9.append((w9, h9, fs9, vv9, r))
        c.close()
    t("H9b 375×812·21(자판 420) · 360×640·17(자판 330) — 별명 칸과 '가입 마치기'가 함께 보인다", not bad9, bad9)


def hm_contrast(pg):
    """입구 글자만 투명으로 만든 화면을 찍고, 글자 상자 안의 가장 밝은 배경과 글자색의 대비를 잰다."""
    boxes = pg.evaluate("""() => { const h = document.getElementById('hm'); if (!h) return [];
      return [...h.querySelectorAll('span')].filter(e => e.checkVisibility() && e.getClientRects().length && e.textContent.trim()
        && ![...e.children].length).concat([...h.childNodes].length ? [] : []).map(e => { const r = e.getBoundingClientRect();
        return {x: r.left, y: r.top, w: r.width, h: r.height, c: getComputedStyle(e).color}; }); }""")
    if not boxes:   # 회원 라벨의 '· 내 정보' 처럼 맨 글자 노드만 있는 경우 — 입구 전체 상자
        boxes = pg.evaluate("""() => { const h = document.getElementById('hm'); const r = h.getBoundingClientRect();
          return [{x: r.left, y: r.top, w: r.width, h: r.height, c: getComputedStyle(h).color}]; }""")
    pg.add_style_tag(content="#hm, #hm * { color: transparent !important; text-decoration-color: transparent !important; } *{transition:none!important;animation:none!important}")
    pg.wait_for_timeout(200)
    png = base64.b64encode(pg.screenshot()).decode()
    low = pg.evaluate("""async ([png, boxes]) => { const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      const L = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      const lum = (r, g, b) => .2126 * L(r) + .7152 * L(g) + .0722 * L(b);
      let low = 99;
      for (const b of boxes) { const d = x.getImageData(Math.floor(b.x), Math.floor(b.y), Math.max(1, Math.ceil(b.w)), Math.max(1, Math.ceil(b.h))).data;
        const c = b.c.match(/[\\d.]+/g).map(Number); const lt = lum(c[0], c[1], c[2]); let worst = 0;
        for (let i = 0; i < d.length; i += 4) worst = Math.max(worst, lum(d[i], d[i + 1], d[i + 2]));
        low = Math.min(low, (Math.max(lt, worst) + .05) / (Math.min(lt, worst) + .05)); }
      return low; }""", [png, boxes])
    return {"n": len(boxes), "low": round(low, 2)}


# ═══ C — 사랑방 ═════════════════════════════════════════════
def group_c(br):
    print("── C")
    f = M.Fake(); S = seed(f)
    # C1 — 정렬선 하나
    for w, h, x0 in [(1280, 860, 64), (1440, 900, 144), (375, 812, 24)]:
        c = ctx_of(br, f, w, h); pg = c.new_page(); fresh(pg, "community.html")
        xs = pg.evaluate("""() => { const L = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().left * 10) / 10 : null; };
          return {h1: L('#main h1'), tab: L('.cafe-menu a'), d: L('#cafe-board-d'), title: L('#bd-list .cafe-title'), sl: L('#h-setlist'), doors: L('#h-doors')}; }""")
        tol = 1.01 if w >= 700 else 1.01
        ok = all(v is not None and abs(v - x0) <= tol for k, v in xs.items() if not (w < 700 and k == "tab")) and \
            (w >= 700 or (xs["tab"] is not None and abs(xs["tab"] - (x0 + 1)) <= tol))
        t("C1 %d: 제목·첫 탭·게시판 설명·첫 글 제목·신청곡·나가는 길 왼끝 = %d" % (w, x0), ok, xs)
        if w == 1280:
            d = pg.evaluate("""() => { const rows = [...document.querySelectorAll('#bd-list .cafe-row')].map(e => e.getBoundingClientRect());
              return {first: rows[0].top, full: rows.filter(r => r.top >= 0 && r.bottom <= innerHeight).length}; }""")
            t("C2 1280×860 로그아웃: 첫 회원 글 top ≤ 600 · 화면 안 회원 글 ≥3줄", d["first"] <= 600 and d["full"] >= 3, d)
        if w == 375:
            d = pg.evaluate("document.querySelector('#bd-list .cafe-row').getBoundingClientRect().top")
            t("C3 375×812·17px: 첫 회원 글 top ≤ 600", d <= 600, d)
        c.close()

    # C4 · C9 · C10 — 제목 · 목록 문법 · 배지
    c = ctx_of(br, f, 1280, 860); pg = c.new_page(); fresh(pg, "community.html")
    d = pg.evaluate("""() => { const vis = e => e.checkVisibility() && e.getBoundingClientRect().width > 1 && getComputedStyle(e).clip !== 'rect(0px, 0px, 0px, 0px)';
      const cur = (document.querySelector('.cafe-menu a[aria-current]') || {}).textContent;
      const heads = [...document.querySelectorAll('#main h1, #main h2, #main h3, #main h4')].filter(vis);
      return {h1: [...document.querySelectorAll('h1')].filter(vis).length,
        srH2: getComputedStyle(document.getElementById('h-board')).clip, srH3: getComputedStyle(document.getElementById('cafe-board-h')).clip,
        dup: heads.filter(e => e.textContent.trim() === (cur || '').trim()).length, cur}; }""")
    t("C4 보이는 h1 1개 · h2#h-board·h3#cafe-board-h 화면낭독기 전용 · 활성 탭과 같은 보이는 제목 0",
      d["h1"] == 1 and d["srH2"] == d["srH3"] == "rect(0px, 0px, 0px, 0px)" and d["dup"] == 0, d)
    d = pg.evaluate("""() => { const T = [...document.querySelectorAll('#bd-pins .cafe-title, #bd-list .cafe-title')].map(e => Math.round(e.getBoundingClientRect().left));
      const sizes = [...document.querySelectorAll('#bd-list .cafe-link')].map(a => new Set([a, ...a.querySelectorAll('*')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())).map(e => getComputedStyle(e).fontSize)).size);
      return {lefts: [...new Set(T)], no: document.querySelectorAll('.cafe-no').length,
        brackets: [...document.querySelectorAll('.cafe-link')].filter(a => /[\\[\\]]/.test(a.textContent)).length, maxSizes: Math.max(...sizes), rows: T.length}; }""")
    t("C9 목록 제목 왼끝 하나(고정 줄 공지·편지 포함) · 번호 열 0 · 대괄호 0 · 한 줄 글자 크기 ≤3", len(d["lefts"]) == 1 and d["no"] == 0 and d["brackets"] == 0
      and d["maxSizes"] <= 3 and d["rows"] >= 3, d)
    fresh(pg, "community.html#p%d" % S["ids"][4])
    pg.evaluate("""() => { const l = document.querySelector('#bd-list') ; }""")
    d = pg.evaluate("""() => ({staff: [...document.querySelectorAll('.bd-badge--staff')].map(e => getComputedStyle(e).backgroundColor),
      cm: [...document.querySelectorAll('.bd-cmts .bd-badge:not(.bd-badge--artist):not(.bd-badge--pending)')].map(e => getComputedStyle(e).borderTopWidth)})""")
    fresh(pg, "community.html#b=letters")
    a = pg.evaluate("[...document.querySelectorAll('.bd-badge--artist')].map(e => getComputedStyle(e).backgroundColor)")
    fresh(pg, "community.html")
    b = pg.evaluate("[...document.querySelectorAll('.cafe-by .bd-badge:not(.bd-badge--artist)')].map(e => getComputedStyle(e).borderTopWidth)")
    t("C10 운영자 배지 배경 투명 · 아티스트 배지만 채움 · 목록 줄·댓글 줄 안 배지는 테두리 0",
      d["staff"] and all(x == "rgba(0, 0, 0, 0)" for x in d["staff"]) and a and all(x == "rgb(243, 239, 231)" for x in a)
      and b and all(x == "0px" for x in b) and len(d["cm"]) >= 4 and all(x == "0px" for x in d["cm"]), (d, a[:2], b[:3]))
    c.close()

    # C5 — 폰 탭 격자 42조합
    combos = [(w, fs, lg) for w in [320, 360, 375, 390, 414, 480, 540] for fs in [17, 19, 21] for lg in ["ko", "en"]]
    if FAST:
        combos = [x for x in combos if x[0] in (320, 375, 540)]
    bad = []
    for lg in ["ko", "en"]:
        for fs in [17, 19, 21]:
            c = ctx_of(br, f, 375, 812, fs=fs, lang=lg if lg == "en" else None); pg = c.new_page(); fresh(pg, "community.html", 1100)
            for w in sorted(set(x[0] for x in combos if x[1] == fs and x[2] == lg)):
                pg.set_viewport_size({"width": w, "height": 812}); pg.wait_for_timeout(120)
                d = pg.evaluate("""() => { const m = document.querySelector('.cafe-menu'), A = [...m.querySelectorAll('a')];
                  const cols = new Set(A.map(a => Math.round(a.getBoundingClientRect().left))).size, rows = new Set(A.map(a => Math.round(a.getBoundingClientRect().top))).size;
                  const midBreak = A.filter(a => { const r = document.createRange(); r.selectNodeContents(a); const rects = [...r.getClientRects()];
                    if (rects.length < 2) return false; const words = a.textContent.trim().split(/\\s+/); return rects.length > words.length; }).length;
                  return {sw: m.scrollWidth, cw: m.clientWidth, cols, rows, over: A.filter(a => a.scrollWidth > a.clientWidth + 1).length,
                    midBreak, minH: Math.min(...A.map(a => a.getBoundingClientRect().height))}; }""")
                why = []
                if d["sw"] != d["cw"]: why.append("가로 넘침")
                if d["cols"] not in (2, 3) or d["cols"] * d["rows"] != 6: why.append("격자 %dx%d" % (d["cols"], d["rows"]))
                if d["over"]: why.append("칸 넘침 %d" % d["over"])
                if d["midBreak"]: why.append("단어 중간 줄바꿈 %d" % d["midBreak"])
                if d["minH"] < 52: why.append("높이 %.0f" % d["minH"])
                if why:
                    bad.append((w, fs, lg, " · ".join(why)))
            c.close()
    t("C5 폰 탭 격자 %d조합: 넘침 0 · 2~3열 · 외톨이 칸 0 · 단어 중간 줄바꿈 0 · 칸 ≥52px" % len(combos), not bad, bad[:5])

    # C6 — 글쓰기 단추 크기
    res = []
    for w, fs in [(375, 17), (320, 21)]:
        c = ctx_of(br, f, w, 812, fs=fs); pg = c.new_page(); fresh(pg, "community.html")
        res.append(pg.evaluate("(() => { const r = document.getElementById('bd-write-btn').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()"))
        c.close()
    css = (ROOT / "assets/css/style.css").read_text(encoding="utf-8")
    t("C6 글쓰기 단추 폭 ≤170 · 높이 ≥48 (375×17, 320×21) · width:100% 규칙 없음",
      all(r[0] <= 170 and r[1] >= 48 for r in res) and ".bd-write { width: 100%; }" not in css, res)

    # C7 · C8 · C11 · C17 — 상태별 화면을 돌며 한꺼번에
    scenes = []

    def scene(name, w, fs, prep, url="community.html", session=None, conf="{board: true, kakao: true}"):
        scenes.append((name, w, fs, prep, url, session, conf))
    for w, fs in [(375, 21), (320, 21), (1280, 17)]:
        scene("C01 전체글·로그아웃", w, fs, None)
        scene("C02 새싹", w, fs, None, session=S["fans"][3])
        scene("C04 운영자·공지", w, fs, None, url="community.html#b=notice", session=S["adm"])
        scene("C05 편지 게시판", w, fs, None, url="community.html#b=letters")
        scene("C09 글 보기·로그아웃", w, fs, None, url="community.html#p%d" % S["ids"][4])
        scene("C10 글 보기·회원", w, fs, None, url="community.html#p%d" % S["ids"][4], session=S["fans"][0])
        scene("C11 없는 글", w, fs, None, url="community.html#p999")
        scene("C12 편지 보기", w, fs, None, url="community.html#l0")
        scene("C13 글쓰기", w, fs, None, url="community.html#write", session=S["fans"][0])
        scene("C15 꺼짐", w, fs, None, conf="{board: false}")
        scene("시트 start", w, fs, "sheet")
        scene("시트 start(카카오 꺼짐)", w, fs, "sheet", conf="{board: true}")
        # 2026-10-03: 예전 '시트 me' 는 내 정보 화면(#me)이 대신한다 — 스위치 꺼짐(010 갈래)·켜짐(013)·새싹·로그인 전 모두
        scene("C16 내 정보·정회원", w, fs, None, url="community.html#me", session=S["fans"][0])
        scene("C16b 내 정보·새싹(013 켜짐)", w, fs, None, url="community.html#me", session=S["fans"][3], conf="{board: true, kakao: true, mypage: true}")
        scene("C16c 내 정보·로그인 전", w, fs, None, url="community.html#me")
        scene("시트 join", w, fs, "sheet", session="newkakao")
        scene("시트 join(노래 질문)", w, fs, "sheet", session="newkakao", conf="{board: true, kakao: true, mypage: true}")
    bad7, bad8, bad11, bad17, seen8 = [], [], [], [], 0
    for name, w, fs, prep, url, who, conf in scenes:
        if who == "newkakao":
            who = f.add_user(None, None, "kakao", {"nickname": "새분"}, True)
        c = ctx_of(br, f, w, 812 if w < 700 else 860, fs=fs, conf=conf, session=sess(f, who) if who else None); pg = c.new_page()
        fresh(pg, url, 1500)
        if prep == "sheet":
            pg.click("#hm"); pg.wait_for_timeout(900)
        fl = pg.evaluate(FILLED_JS)
        if len(fl) > 1:
            bad7.append((name, w, fl))
        mo = pg.evaluate(MONO_JS, "#main")
        seen8 += mo["seen"]
        if mo["out"]:
            bad8.append((name, w, mo["out"][:3]))
        if prep == "sheet":
            mo = pg.evaluate(MONO_JS, "#bd-sheet")
            if mo["out"]:
                bad8.append((name, w, mo["out"][:3]))
        da = pg.evaluate(DASH_JS)
        if da:
            bad11.append((name, w, da[:3]))
        if w <= 375 and fs == 21:
            o = pg.evaluate(OVER_JS)
            if o > 0:
                bad17.append((name, w, o))
        c.close()
    t("C7 화면마다 채운 단추(아이보리 바탕·1500px² 초과) ≤1 — %d화면" % len(scenes), not bad7, bad7[:4])
    t("C8 한글 글자에 모노 서체 0 (숫자 칸 제외, 잰 글자 %d)" % seen8, not bad8 and seen8 > 200, bad8[:4])
    t("C11 점선 테두리 0 — %d화면" % len(scenes), not bad11, bad11[:4])
    t("C17 320×21·375×21 가로 넘침 0 — %d화면" % sum(1 for s in scenes if s[1] <= 375 and s[2] == 21), not bad17, bad17[:4])

    # C12 — 섹션 경계에 밝기 계단이 없다(실제 스크롤한 화면 사진)
    for w, h, xs in [(375, 812, [40, 187, 300]), (1280, 860, [100, 282, 640, 1000])]:
        c = ctx_of(br, f, w, h); pg = c.new_page(); fresh(pg, "community.html")
        diffs = []
        for sel in ["#board", "#setlist", "#sb-doors"]:
            y = pg.evaluate("(s) => { const e = document.querySelector(s); const top = e.getBoundingClientRect().top + scrollY; scrollTo(0, top - innerHeight / 2); return e.getBoundingClientRect().top; }", sel)
            pg.wait_for_timeout(250)
            y = pg.evaluate("(s) => document.querySelector(s).getBoundingClientRect().top", sel)
            png = base64.b64encode(pg.screenshot()).decode()
            dd = pg.evaluate("""async ([png, y, xs]) => { const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
              const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
              const Y = Math.round(y); return xs.map(px => Math.abs(x.getImageData(px, Y - 1, 1, 1).data[0] - x.getImageData(px, Y + 1, 1, 1).data[0])); }""", [png, y, xs])
            diffs.append((sel, max(dd)))
        t("C12 %d 섹션 경계 위·아래 1px 의 R 차이 ≤3 (머리→카페·카페→신청곡·신청곡→나가는 길)" % w, all(d <= 3 for _, d in diffs), diffs)
        c.close()

    # C13 — 글 보기의 탭·초점·자리
    c = ctx_of(br, f, 375, 812); pg = c.new_page()
    fresh(pg, "community.html#p%d" % S["ids"][3])
    a = pg.evaluate("""() => ({tab: (document.querySelector('.cafe-menu a[aria-current]') || {}).dataset?.b, focus: document.activeElement.className,
      top: document.querySelector('.cafe-menu').getBoundingClientRect().top, hb: document.querySelector('.site-header').getBoundingClientRect().bottom})""")
    fresh(pg, "community.html")
    pg.click(".cafe-menu a[data-b=letters]"); pg.wait_for_timeout(700)
    pg.evaluate("location.hash = '#p%d'" % S["ids"][3]); pg.wait_for_timeout(1200)
    b = pg.evaluate("""() => ({tab: (document.querySelector('.cafe-menu a[aria-current]') || {}).dataset?.b, focus: document.activeElement.className,
      top: document.querySelector('.cafe-menu').getBoundingClientRect().top, hb: document.querySelector('.site-header').getBoundingClientRect().bottom})""")
    ok = all(x["tab"] == "hello" and "cafe-post-title" in x["focus"] and x["hb"] <= x["top"] <= x["hb"] + 16 for x in (a, b))
    t("C13 #p(가입인사 글)로 바로·편지 탭을 거쳐 → 탭 표시 '가입인사' · 초점 제목 · 탭 줄이 헤더 바로 아래", ok, (a, b))
    c.close()

    # C14 — 글에서 목록으로 돌아오기
    for w, h in [(1280, 860), (375, 812)]:
        c = ctx_of(br, f, w, h); pg = c.new_page(); fresh(pg, "community.html")
        pg.evaluate("window.scrollTo(0, 900)"); pg.wait_for_timeout(300)
        row = pg.locator("#bd-list .cafe-row").nth(5)
        rid = row.get_attribute("data-id")
        row.locator("a").scroll_into_view_if_needed(); pg.wait_for_timeout(200)
        sy = pg.evaluate("scrollY")
        hl = pg.evaluate("history.length")
        row.locator("a").click(); pg.wait_for_timeout(1200)
        pg.evaluate("history.back()"); pg.wait_for_timeout(1300)
        d = pg.evaluate("""(id) => { const li = document.querySelector('#bd-list [data-id="' + id + '"]'), r = li.getBoundingClientRect();
          const sl = document.getElementById('setlist').getBoundingClientRect();
          return {mid: (r.top + r.bottom) / 2, vh: innerHeight, focus: document.activeElement === li.querySelector('a'), setTop: sl.top, hl: history.length}; }""", rid)
        mid_ok = d["vh"] / 3 <= d["mid"] <= d["vh"] * 2 / 3
        t("C14 %d scrollY %d 에서 6번째 글 → 뒤로 → 그 줄이 화면 가운데 1/3 · 초점 · 신청곡이 위를 차지하지 않음" % (w, sy),
          sy >= 800 and mid_ok and d["focus"] and d["setTop"] > d["vh"] * 0.5, d)
        # 목록에서 들어온 글의 '← 목록으로'는 기록을 늘리지 않는다
        row = pg.locator("#bd-list .cafe-row").nth(2)
        hl0 = pg.evaluate("history.length")
        row.locator("a").click(); pg.wait_for_timeout(1100)
        hl1 = pg.evaluate("history.length")
        pg.click("#cafe-post .cafe-back >> nth=0"); pg.wait_for_timeout(900)
        t("C14b %d 목록에서 들어온 글의 '← 목록으로' → history.length 그대로" % w, pg.evaluate("history.length") == hl1
          and pg.is_visible("#cafe-list"), (hl0, hl1, pg.evaluate("history.length")))
        c.close()

    # C15 — 꺼짐
    c = ctx_of(br, None, 375, 812, conf="{board: false}"); pg = c.new_page(); fresh(pg, "community.html")
    d = pg.evaluate("""() => ({menu: getComputedStyle(document.querySelector('.cafe-menu')).display, tools: getComputedStyle(document.querySelector('.cafe-tools')).display,
      feats: document.querySelectorAll('.cafe-feature').length, lede: document.getElementById('cafe-lede').getAttribute('data-i18n'),
      txt: document.getElementById('main').innerText})""")
    t("C15 꺼짐 → 탭·도구줄 display:none · 편지 특집 2 · 소개 dClosed · '남겨 주세요'·'들려주세요' 안 보임",
      d["menu"] == d["tools"] == "none" and d["feats"] == 2 and d["lede"] == "ph.community.dClosed"
      and "남겨 주세요" not in d["txt"] and "들려주세요" not in d["txt"], {k: v for k, v in d.items() if k != "txt"})
    c.close()

    # C16 — 맨 위로 단추와 푸터 글자
    views = [(1440, 900), (1280, 800), (900, 1200), (375, 812), (320, 640)]
    bad, measured = [], []
    for w, h in (views if not FAST else views[::2]):
        c = ctx_of(br, f, w, h); pg = c.new_page()
        for name in PAGES:
            if name == "index":
                continue      # 홈은 고정 푸터라 따로(아래)
            fresh(pg, name + ".html", 900)
            pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); pg.wait_for_timeout(500)
            d = pg.evaluate("""() => { const b = document.querySelector('.back-to-top.show'); if (!b) return {none: true};
              const r = b.getBoundingClientRect(); let ov = 0;
              for (const e of document.querySelectorAll('.footer-min a, .footer-min span')) { const q = e.getBoundingClientRect();
                ov += Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left)) * Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top)); }
              return {ov, w: r.width}; }""")
            if d.get("none"):
                continue            # 짧은 페이지는 '맨 위로'가 아예 뜨지 않는다 — 겹칠 것이 없다
            measured.append(name)
            if d["ov"] > 0 or d["w"] < 44:
                bad.append((name, w, d))
        fresh(pg, "index.html", 1500)
        d = pg.evaluate("""() => { const b = document.querySelector('.back-to-top'); return {w: b ? b.getBoundingClientRect().width : 0}; }""")
        if d["w"] < 44 and d["w"] > 0:
            bad.append(("index", w, d))
        c.close()
    t("C16 9페이지 × %d뷰포트 '맨 위로'와 푸터 글자 겹침 0 · 폭 ≥44 (단추가 뜬 %d장면)" % (len(views if not FAST else views[::2]), len(measured)),
      not bad and len(measured) >= 12, bad[:4])

    # C18 — 대비 감사(장면마다 잰 글자 수 하한 단언) + 뮤테이션
    def audit(mut):
        out, counts = [], []
        for name, url, who, prep, need in [("목록", "community.html", None, None, 25), ("글 보기", "community.html#p%d" % S["ids"][4], S["fans"][0], None, 20),
                                           ("글쓰기", "community.html#write", S["fans"][0], None, 8), ("시트", "community.html", None, "sheet", 8),
                                           ("꺼짐", "community.html", None, "off", 8), ("내 정보(013)", "community.html#me", S["fans"][3], "me13", 12)]:
            c = ctx_of(br, f, 375, 812, conf="{board: false}" if prep == "off" else
                       "{board: true, kakao: true, mypage: true}" if prep == "me13" else "{board: true, kakao: true}",
                       session=sess(f, who) if who else None)
            pg = c.new_page(); fresh(pg, url, 1500)
            if mut:
                pg.add_style_tag(content=":root{--faint:#555 !important}")
            pg.add_style_tag(content="*{transition:none!important;animation:none!important}")
            if prep == "sheet":
                pg.click("#hm"); pg.wait_for_timeout(900)
            r = pg.evaluate(AUDIT_JS, "#bd-sheet" if prep == "sheet" else "#main")
            counts.append((name, r["seen"]))
            if r["seen"] < need:
                out.append((name, "잰 글자 %d — 화면이 비었나?" % r["seen"]))
            out += [(name, b) for b in r["bad"][:3]]
            c.close()
        return out, counts
    bad, counts = audit(False)
    t("C18 대비 4.5:1 — 목록·글 보기·글쓰기·시트·꺼짐·내 정보 (잰 글자 %s)" % counts, not bad, bad[:5])
    bad_m, _ = audit(True)
    t("C18b 뮤테이션 --faint #555 → 대비 검사가 잡는다", len(bad_m) > 0, bad_m[:2])

    # C19 · C20 — 소식지 · 공유 메타
    c = ctx_of(br, f, 1280, 860, conf="{board: true}"); pg = c.new_page(); fresh(pg, "community.html")
    d = pg.evaluate("[document.getElementById('sub-form').hidden, document.getElementById('sub-note').hidden]")
    t("C19 config.newsletter 없으면 소식지 폼·안내 hidden", d == [True, True], d)
    c.close()
    html = (ROOT / "community.html").read_text(encoding="utf-8")
    metas = re.findall(r'<meta (?:name|property)="(?:description|og:description|twitter:description)" content="([^"]*)"', html)
    t("C20 공유 메타 셋에 '응원 카드'·'번호증'·'편지를 쓰고' 없음", len(metas) == 3 and not any(w in m for m in metas for w in ("응원 카드", "번호증", "편지를 쓰고")), metas)


# ═══ V2 — 2차 검토(52건) 반영 확인 ═════════════════════════════════
def nav_contrast(pg, sel):
    """글자만 투명으로 만든 화면에서, 그 글자 상자 안의 가장 나쁜 배경과 글자색의 대비(hm_contrast 와 같은 방식)."""
    # 글자가 실제로 앉은 줄 상자(텍스트 노드의 Range)만 잰다 — 링크의 위아래 여백(누르는 칸)은 글자 배경이 아니다
    boxes = pg.evaluate("""(sel) => { const out = [];
      for (const e of document.querySelectorAll(sel)) { if (!e.checkVisibility() || !e.textContent.trim()) continue;
        const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n;
        while ((n = w.nextNode())) { if (!n.nodeValue.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n);
          for (const r of rg.getClientRects()) if (r.width && r.height) out.push({x: r.left, y: r.top, w: r.width, h: r.height, c: getComputedStyle(n.parentElement).color, t: n.nodeValue.trim()}); } }
      return out; }""", sel)
    # 그림자는 남긴다 — 글자 뒤 그늘이 대비를 만드는 방식(.hm)이므로 그것까지 재야 한다(글자색만 투명)
    pg.add_style_tag(content=sel + ", " + sel + " * { color: transparent !important; text-decoration-color: transparent !important; } *{transition:none!important;animation:none!important}")
    pg.wait_for_timeout(200)
    png = base64.b64encode(pg.screenshot()).decode()
    res = pg.evaluate("""async ([png, boxes]) => { const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      const L = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      const lum = (r, g, b) => .2126 * L(r) + .7152 * L(g) + .0722 * L(b);
      return boxes.map(b => { const d = x.getImageData(Math.floor(b.x), Math.floor(b.y), Math.max(1, Math.ceil(b.w)), Math.max(1, Math.ceil(b.h))).data;
        const c = b.c.match(/[\\d.]+/g).map(Number); const lt = lum(c[0], c[1], c[2]); let worst = lt;
        for (let i = 0; i < d.length; i += 4) { const l = lum(d[i], d[i + 1], d[i + 2]); if (Math.abs(l - lt) < Math.abs(worst - lt) || worst === lt) worst = l; }
        return [b.t, Math.round((Math.max(lt, worst) + .05) / (Math.min(lt, worst) + .05) * 100) / 100]; }); }""", [png, boxes])
    return res


def group_v2(br):
    print("── V2 (2차 검토 반영)")
    f = M.Fake(); S = seed(f)

    # 1 — 서브페이지 헤더: 스크롤 1~90px 에서도 바탕(글자와 헤더가 포개지지 않게) · 홈은 투명 그대로
    HDR = "() => getComputedStyle(document.querySelector('.site-header')).backgroundColor"
    def hdr_bad(mut):
        bad, n = [], 0
        for pgname in [x for x in PAGES if x != "index"]:
            for (w, h, fs) in ((375, 667, 17), (375, 812, 21), (1280, 860, 17)):
                c = ctx_of(br, f, w, h, fs=fs); pg = c.new_page(); fresh(pg, pgname + ".html", 700)
                if mut:
                    pg.add_style_tag(content="body:not(.home) .site-header{background:transparent!important}")
                for y in (1, 40, 89):
                    pg.evaluate("scrollTo(0, %d)" % y); pg.wait_for_timeout(120)
                    if pg.evaluate("scrollY") < y - 2:
                        continue        # 그만큼 내려가지 않는 짧은 페이지
                    n += 1
                    bg = pg.evaluate(HDR)
                    if bg in ("rgba(0, 0, 0, 0)", "transparent"):
                        bad.append((pgname, w, fs, y))
                c.close()
        return bad, n
    bad, n = hdr_bad(False)
    t("V1 서브페이지 9 × (375×667·375×812/21·1280) × 스크롤 1·40·89px — 헤더 바탕 있음 (잰 장면 %d)" % n, not bad and n > 60, bad[:4])
    badm, _ = hdr_bad(True) if not FAST else ([1], 0)
    t("V1b 뮤테이션(서브페이지 헤더 투명) → 위 검사가 잡는다", len(badm) > 0, len(badm))
    c = ctx_of(br, f, 1280, 860); pg = c.new_page(); fresh(pg, "index.html", 1500)
    t("V1c 홈 맨 위 헤더는 투명 그대로(사진 위)", pg.evaluate(HDR) in ("rgba(0, 0, 0, 0)", "transparent"), pg.evaluate(HDR))
    c.close()

    # 16 — 사랑방 머리(폰): h1 이 헤더 띠 아래에서 시작
    bad = []
    for (w, h) in ((375, 667), (375, 812), (360, 640)):
        for fs in (17, 21):
            c = ctx_of(br, f, w, h, fs=fs); pg = c.new_page(); fresh(pg, "community.html", 900)
            d = pg.evaluate("[document.querySelector('#main h1').getBoundingClientRect().top, document.querySelector('.site-header').getBoundingClientRect().bottom]")
            if d[0] < d[1] + 8:
                bad.append((w, h, fs, d))
            c.close()
    t("V2 사랑방 머리 375×667·375×812·360×640 × 17/21 — h1 top ≥ 헤더 bottom+8", not bad, bad)

    # 3 — 도구줄(폰·21px): 설명은 한 폭 · 단어 가운데 줄바꿈 0 · 글쓰기는 그 아래 오른쪽
    BRK = r"""() => { const d = document.getElementById('cafe-board-d'), tn = d.firstChild; if (!tn || tn.nodeType !== 3) return {err: 1};
      const s = tn.nodeValue, rg = document.createRange(); let prev = null, mid = [], lines = 1;
      for (let i = 0; i < s.length; i++) { rg.setStart(tn, i); rg.setEnd(tn, i + 1); const r = rg.getClientRects()[0]; if (!r) continue;
        if (prev !== null && r.top > prev + 4) { lines++; if (!/[\s]/.test(s[i - 1]) && !/[\s]/.test(s[i])) mid.push(s.slice(Math.max(0, i - 3), i) + '/' + s.slice(i, i + 3)); }
        prev = r.top; }
      const tl = document.querySelector('.cafe-tools').getBoundingClientRect(), b = document.getElementById('bd-write-btn').getBoundingClientRect(), db = d.getBoundingClientRect();
      return {mid: mid, lines: lines, below: b.top >= db.bottom - 1, right: Math.abs(b.right - tl.right) <= 1, dw: Math.round(db.width), tw: Math.round(tl.width)}; }"""
    bad = []
    for w in (320, 360, 375):
        c = ctx_of(br, f, w, 812, fs=21); pg = c.new_page(); fresh(pg, "community.html#b=hello", 1200)
        d = pg.evaluate(BRK)
        if d.get("err") or d["mid"] or not d["below"] or not d["right"] or d["dw"] < d["tw"] - 1 or d["lines"] > 5:
            bad.append((w, d))
        c.close()
    t("V3 도구줄 320·360·375 × 21px(가입인사) — 설명이 한 폭 · 단어 가운데 줄바꿈 0 · 줄 ≤5 · 글쓰기는 설명 아래 오른쪽", not bad, bad)

    # 4 · 28 — 고정 줄 제목(21px 폰): 잘리지 않고 2줄 안에
    bad = []
    for w in (320, 360, 375):
        c = ctx_of(br, f, w, 812, fs=21); pg = c.new_page(); fresh(pg, "community.html", 1400)
        d = pg.evaluate("""() => [...document.querySelectorAll('#bd-pins .cafe-title')].map(e => ({t: e.textContent, clip: e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1,
          lines: Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight))}))""")
        if len(d) < 2 or any(x["clip"] or x["lines"] > 2 for x in d):
            bad.append((w, d))
        c.close()
    t("V4 고정 줄(공지·편지) 320·360·375 × 21px — 제목 전체가 보인다(2줄 이내, 말줄임 0)", not bad, bad)

    # 5 — 차단 회원: 누르면 실패하는 '글쓰기'를 그리지 않는다 · 쓸 수 없다는 문장은 한 번
    bl = f.add_user("blocked@test.local", "pw", confirmed=True)
    f.members[bl] = {"nickname": "쉬는회원", "level": "blocked", "level_by": "admin"}
    c = ctx_of(br, f, 375, 812, session=sess(f, bl)); pg = c.new_page(); fresh(pg, "community.html", 1400)
    d = pg.evaluate("""() => { const b = document.getElementById('bd-write-btn'), cs = getComputedStyle(b);
      return {hid: cs.visibility === 'hidden' || cs.display === 'none', n: (document.getElementById('main').innerText.match(/지금은 글을 쓸 수 없습니다/g) || []).length}; }""")
    fresh(pg, "community.html#write", 1400)
    n2 = pg.evaluate("(document.getElementById('main').innerText.match(/지금은 글을 쓸 수 없습니다/g) || []).length")
    t("V5 차단 회원 — 글쓰기 단추 안 보임 · '쓸 수 없습니다' 1회(#write 로 와도 1회)", d["hid"] and d["n"] == 1 and n2 == 1, (d, n2))
    c.close()

    # 6 — 헤더 회원 라벨의 별명에도 밑줄(한 단추가 두 조각처럼 보이지 않게). 4바퀴 9번: 별명이 따로 그은 밑줄이 두 토막을
    # 만들었다 — 이제 밑줄은 #hm 하나에서 이어져 내려오고(별명은 inline), 별명 자체의 선은 없다(V4-6 이 구조를 잰다)
    c = ctx_of(br, f, 1440, 900, session=sess(f, S["fans"][0]), mobile=False); pg = c.new_page(); fresh(pg, "news.html")
    u = pg.evaluate("[getComputedStyle(document.getElementById('hm')).textDecorationLine, getComputedStyle(document.querySelector('#hm .hm-nick')).display]")
    t("V6 1440 회원 — 헤더 밑줄은 #hm 에서 별명까지 이어짐(#hm underline · .hm-nick inline)", u == ["underline", "inline"], u)
    c.close()

    # 8 — 내 정보: 별명·계정 칸의 테두리 단추는 '별명 저장' 하나(고쳤을 때만 눌림) · 로그아웃·탈퇴는 글자 링크
    # 2026-10-03: 내 정보 창 → 내 정보 화면(#me). 같은 단언을 화면의 별명·계정 칸에 건다(소식 페이지에서 헤더로 들어온다)
    c = ctx_of(br, f, 375, 812, session=sess(f, S["fans"][3])); pg = c.new_page(); fresh(pg, "news.html")
    pg.click(".nav-toggle"); pg.wait_for_timeout(600); pg.click(".nav-member-b"); pg.wait_for_timeout(1500)
    d = pg.evaluate("""() => { const s = document.getElementById('cafe-me'); const vis = e => e.checkVisibility();
      const z = [...s.querySelectorAll('.me-nickx, .me-acts')];
      return {ghost: z.flatMap(x => [...x.querySelectorAll('.btn--ghost')]).filter(vis).map(b => b.textContent), out: !!s.querySelector('.bd-me-acts .bd-link'),
              outTxt: [...s.querySelectorAll('.bd-me-acts .bd-link')].map(b => b.textContent), dis: s.querySelector('.me-nickf button[type=submit]').disabled,
              h: [...s.querySelectorAll('.bd-me-acts .bd-link')].map(b => Math.round(b.getBoundingClientRect().height)), hash: location.hash}; }""")
    pg.fill("#bd-mn", "대전 아줌마2"); pg.wait_for_timeout(100)
    dis2 = pg.evaluate("document.querySelector('#cafe-me .me-nickf button[type=submit]').disabled")
    t("V8 소식 → 메뉴의 회원 입구 → 내 정보(#me) — 별명·계정 칸 테두리 단추 1개('별명 저장', 처음엔 잠김 → 고치면 열림) · '로그아웃 · 탈퇴하기' 글자 링크(≥44px)",
      d["hash"] == "#me" and d["ghost"] == ["별명 저장"] and d["dis"] and not dis2 and d["outTxt"] == ["로그아웃", "탈퇴하기"] and all(x >= 44 for x in d["h"]), (d, dis2))
    c.close()

    # 9 — 탭이 하나뿐이면 탭 대신 작은 제목(가입을 받지 않는 서버)
    f9 = M.Fake(); seed(f9); f9.settings["disable_signup"] = True
    c = ctx_of(br, f9, 375, 812, conf="{board: true}"); pg = c.new_page(); fresh(pg, "news.html")
    pg.click("#hm"); pg.wait_for_timeout(900)
    d = pg.evaluate("[document.querySelectorAll('#bd-sheet .bd-tab').length, (document.querySelector('#bd-sheet .bd-sub') || {}).textContent || '', !!document.getElementById('bd-ie')]")
    t("V9 가입을 받지 않을 때 — 외톨이 탭 0 · '이메일로 로그인' 작은 제목 · 로그인 칸", d[0] == 0 and d[1] == "이메일로 로그인" and d[2], d)
    c.close()

    # 11 — 글쓰기 진입: '← 쓰기 그만두기' 가 헤더 아래 +8 · 머리 숫자 줄이 헤더 경계에 걸치지 않음
    bad = []
    for path in ("direct", "list"):
        c = ctx_of(br, f, 375, 812, session=sess(f, S["fans"][0])); pg = c.new_page()
        if path == "direct":
            fresh(pg, "community.html#write", 1600)
        else:
            fresh(pg, "community.html", 1300); pg.click("#bd-write-btn"); pg.wait_for_timeout(1200)
        d = pg.evaluate("""() => { const hb = document.querySelector('.site-header').getBoundingClientRect().bottom, b = document.getElementById('bd-form-back').getBoundingClientRect(),
          st = document.getElementById('cafe-stat').getBoundingClientRect(); return {d: Math.round(b.top - hb), straddle: st.height > 0 && st.top < hb && st.bottom > hb}; }""")
        if abs(d["d"] - 8) > 2 or d["straddle"]:
            bad.append((path, d))
        c.close()
    t("V10 #write 직접·목록에서 — '← 쓰기 그만두기' top = 헤더 bottom+8(±2) · 숫자 줄이 헤더 경계에 걸치지 않음", not bad, bad)

    # 13 — 아래쪽 '← 목록으로' 도 위와 같은 글자·밑줄
    c = ctx_of(br, f, 375, 812); pg = c.new_page(); fresh(pg, "community.html#p%d" % S["ids"][4], 1400)
    d = pg.evaluate("[...document.querySelectorAll('#cafe-post .cafe-back')].map(a => [a.textContent, getComputedStyle(a).textDecorationLine])")
    t("V11 글 보기 위·아래 '← 목록으로' 같은 문구 · 밑줄", len(d) == 2 and d[0] == d[1] and d[0][0] == "← 목록으로" and "underline" in d[0][1], d)
    # 44 — 편지 보기: '당시 댓글' · 옮겨 오지 않았다는 한 줄
    fresh(pg, "community.html#l0", 1400)
    d = pg.evaluate("[(document.querySelector('.cafe-letter-when') || {}).textContent || '', (document.querySelector('.cafe-letter-nocmt') || {}).textContent || '']")
    t("V12 편지 보기 — '당시 조회 … · 당시 댓글 …' · '옛 게시판의 댓글은 옮겨 오지 않았습니다.'", "당시 댓글" in d[0] and d[1] == "옛 게시판의 댓글은 옮겨 오지 않았습니다.", d)
    # 52 — 댓글 지우기 48px
    c.close()
    c = ctx_of(br, f, 375, 812, session=sess(f, S["fans"][0])); pg = c.new_page(); fresh(pg, "community.html#p%d" % S["ids"][4], 1400)
    d = pg.evaluate("[...document.querySelectorAll('.bd-c-del')].map(b => [Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)])")
    t("V13 댓글 '지우기' ≥48×48", d and all(x[0] >= 48 and x[1] >= 48 for x in d), d)
    c.close()

    # 14 — '확인을 기다리는 내 글': 펼침 단서 + 펼친 뒤 경계
    f.posts.append({"id": f.nid(), "uid": S["fans"][3], "board": "free", "title": "확인 기다리는 글", "body": "본문", "status": "pending",
                    "created_at": "2026-09-30T01:00:00Z"})
    c = ctx_of(br, f, 375, 812, session=sess(f, S["fans"][3])); pg = c.new_page(); fresh(pg, "community.html", 1500)
    a = pg.evaluate("(() => { const t = document.querySelector('.bd-mine-t'); return t && t.checkVisibility() ? getComputedStyle(t, '::after').content : ''; })()")
    pg.click(".bd-mine-s"); pg.wait_for_timeout(300)
    b = pg.evaluate("[getComputedStyle(document.querySelector('.bd-mine-t'), '::after').content, getComputedStyle(document.getElementById('bd-mine-list')).borderLeftWidth]")
    t("V14 확인 기다리는 내 글 — 닫힘 '보기 ▾' → 열림 '접기 ▴' · 묶음 왼쪽 2px 선", a == '"보기 ▾"' and b[0] == '"접기 ▴"' and b[1] == "2px", (a, b))
    c.close()

    # 19 — 게시판 고르기(폰): 같은 폭의 세로 목록
    bad = []
    for w in (320, 375):
        for fs in (17, 21):
            for who in (S["fans"][0], S["adm"]):
                c = ctx_of(br, f, w, 812, fs=fs, session=sess(f, who)); pg = c.new_page(); fresh(pg, "community.html#write", 1500)
                d = pg.evaluate("[...document.querySelectorAll('.bd-pick label')].map(l => { const r = l.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.width)]; })")
                if len(d) < 3 or len(set(d_[0] for d_ in d)) != 1 or len(set(d_[1] for d_ in d)) != 1:
                    bad.append((w, fs, d))
                c.close()
    t("V15 게시판 고르기 320·375 × 17/21 × 회원·운영자 — 칸의 left·width 모두 같다", not bad, bad[:3])

    # 25 — 입력칸 테두리 3:1 · 27 — 시트 입력칸 초점 3px
    c = ctx_of(br, f, 375, 812, conf="{board: true}"); pg = c.new_page(); fresh(pg, "news.html")
    pg.click("#hm"); pg.wait_for_timeout(900)
    pg.click("#bd-sheet .bd-tab >> text=로그인"); pg.wait_for_timeout(300)
    def border_cr(mut):
        if mut:
            pg.add_style_tag(content=".bd-sheet .form-field input{border-color:rgba(243,239,231,.26)!important}")
        return pg.evaluate("""() => { const i = document.getElementById('bd-ie'), c = getComputedStyle(i).borderTopColor.match(/[\\d.]+/g).map(Number);
          const bg = [16, 16, 16]; const mix = c.slice(0, 3).map((v, k) => (c[3] === undefined ? 1 : c[3]) * v + (1 - (c[3] === undefined ? 1 : c[3])) * bg[k]);
          const L = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }, lum = a => .2126 * L(a[0]) + .7152 * L(a[1]) + .0722 * L(a[2]);
          const a = lum(mix), b = lum(bg); return Math.round((Math.max(a, b) + .05) / (Math.min(a, b) + .05) * 100) / 100; }""")
    cr = border_cr(False)
    pg.focus("#bd-ie"); pg.keyboard.press("Tab"); pg.keyboard.press("Shift+Tab"); pg.wait_for_timeout(100)
    ow = pg.evaluate("getComputedStyle(document.activeElement).outlineWidth")
    crm = border_cr(True)
    t("V16 시트 입력칸 테두리 대비 %.2f ≥ 3:1 (#101010 위) · 초점 링 3px · 뮤테이션(.26) %.2f < 3 잡힘" % (cr, crm), cr >= 3 and ow == "3px" and crm < 3, (cr, ow, crm))
    c.close()

    # 38 — 처음 기기는 '처음 가입' 먼저 · 로그인 실패하면 가입으로 가는 단추 · 한 번 로그인한 기기는 '로그인' 먼저
    c = ctx_of(br, f, 375, 812, conf="{board: true}"); pg = c.new_page(); fresh(pg, "news.html")
    pg.click("#hm"); pg.wait_for_timeout(900)
    first = pg.evaluate("(document.querySelector('#bd-sheet .bd-tab[aria-pressed=true]') || {}).textContent")
    pg.click("#bd-sheet .bd-tab >> text=로그인"); pg.wait_for_timeout(200)
    pg.fill("#bd-ie", "newbie@test.local"); pg.fill("#bd-ip", "whatever1"); pg.click("#bd-sheet .bd-aform button[type=submit]"); pg.wait_for_timeout(1000)
    tu = pg.evaluate("(() => { const b = document.querySelector('#bd-sheet .bd-toup'); return b && b.checkVisibility() ? [b.textContent, Math.round(b.getBoundingClientRect().height)] : null; })()")
    if tu:
        pg.click("#bd-sheet .bd-toup"); pg.wait_for_timeout(200)
    now = pg.evaluate("(document.querySelector('#bd-sheet .bd-tab[aria-pressed=true]') || {}).textContent")
    pg.fill("#bd-ue", "x"); pg.keyboard.press("Escape")
    pg.click("#hm"); pg.wait_for_timeout(500)
    pg.click("#bd-sheet .bd-tab >> text=로그인"); pg.wait_for_timeout(200)
    pg.fill("#bd-ie", "fan0@test.local"); pg.fill("#bd-ip", "pw"); pg.click("#bd-sheet .bd-aform button[type=submit]"); pg.wait_for_timeout(1500)
    pg.evaluate("localStorage.removeItem('insooni_member_session')")
    fresh(pg, "news.html"); pg.click("#hm"); pg.wait_for_timeout(900)
    again = pg.evaluate("(document.querySelector('#bd-sheet .bd-tab[aria-pressed=true]') || {}).textContent")
    t("V17 처음 기기 '처음 가입' 먼저 · 로그인 실패 → '처음이시면 → 처음 가입'(≥48px) → 가입 탭 · 로그인한 기기는 다음에 '로그인' 먼저",
      first == "처음 가입" and tu and tu[0] == "처음이시면 → 처음 가입" and tu[1] >= 48 and now == "처음 가입" and again == "로그인", (first, tu, now, again))
    c.close()

    # 12 · 18 · 50 — 닫힌 상태 머리 소개가 아래 안내와 같은 말을 되풀이하지 않음 · 등업 문구 · 약관·개인정보에 없는 기능
    c = ctx_of(br, f, 375, 812, conf="{board: false}"); pg = c.new_page(); fresh(pg, "community.html")
    d = pg.evaluate("[document.getElementById('cafe-lede').textContent, document.getElementById('cafe-closed').textContent]")
    t("V18 꺼짐 — 머리 소개에 '곧 문을 엽니다' 없음(아래 안내에만 한 번)", "곧 문을 엽니다" not in d[0] and "곧 문을 엽니다" in d[1], d)
    c.close()
    nk = f.add_user(None, None, "kakao", {"nickname": "새가입"}, True)
    c = ctx_of(br, f, 375, 812, session=sess(f, nk)); pg = c.new_page(); fresh(pg, "news.html")
    pg.click("#hm"); pg.wait_for_timeout(900)
    lv = pg.evaluate("(document.querySelector('#bd-sheet .bd-lvinfo') || {}).textContent || ''")
    t("V19 가입 마치기 등업 안내 — '운영자 확인을 거쳐 올라간 글 3개와 댓글 5개'", "운영자 확인을 거쳐 올라간 글 3개와 댓글 5개" in lv and "운영자가 올린 글" not in lv, lv)
    c.close()
    terms = (ROOT / "terms.html").read_text(encoding="utf-8")
    priv = (ROOT / "privacy.html").read_text(encoding="utf-8")
    t("V20 약관·개인정보에 지금 없는 '로그인 없이 한 줄을 남길 수 있' · '쓴 기기에서 언제든 지울 수' 0 · '운영진이 올린 글' 0",
      "한 줄을 남길 수 있" not in terms and "쓴 기기에서 언제든 지울 수" not in priv and "운영진이 올린 글" not in terms and "로그인 없이 한 줄을 남길 때" not in priv)

    # 31 — 홈 첫 화면 헤더 내비·EN·[가] 대비(밝은 리드 화보 위)
    c = ctx_of(br, f, 1280, 860, conf="{board: false}", mobile=False); pg = c.new_page(); fresh(pg, "index.html", 2500)
    NAV = ".site-header .main-nav li > a, .site-header .header-tools .lang-toggle, .site-header .header-tools .fs-a"
    res = nav_contrast(pg, NAV)
    low = [r for r in res if r[1] < 4.5]
    c.close()
    # 뮤테이션 — 예전 회색(--muted) 내비로 되돌리면 잡혀야 한다
    c = ctx_of(br, f, 1280, 860, conf="{board: false}", mobile=False); pg = c.new_page(); fresh(pg, "index.html", 2500)
    pg.add_style_tag(content="body.home .site-header:not(.scrolled) .main-nav a, body.home .site-header:not(.scrolled) .header-tools button{color:#b3a99c!important}")
    low_m = [r for r in nav_contrast(pg, NAV) if r[1] < 4.5]
    c.close()
    t("V21 홈 1280 첫 화면 — 헤더 내비·EN·가 대비 ≥4.5:1 (잰 글자 줄 %d, 가장 낮음 %s) · 뮤테이션(회색 내비) 잡힘 %d" % (len(res), min([r[1] for r in res] or [0]), len(low_m)),
      len(res) >= 9 and not low and low_m, (low[:4], low_m[:2]))

    # 47 — 홈: 도입부가 끝난 뒤 첫 클릭이 먹힌다(입구·내비·메뉴) — 그리고 가드를 지운 main.js 로는 실패한다(뮤테이션)
    main_src = (ROOT / "assets/js/main.min.js").read_text(encoding="utf-8")
    guard = 'if (!document.documentElement.classList.contains("is-intro")) { unbindSkip(); return; }'
    def first_click(w, h, mut):
        c = ctx_of(br, f, w, h, intro_seen=False, mobile=w < 768)
        if mut:
            c.route(re.compile(r".*/assets/js/main\.min\.js.*"), lambda r: r.fulfill(status=200, content_type="text/javascript", body=main_src.replace(guard, "")))
        pg = c.new_page(); fresh(pg, "index.html", 1200)
        if w >= 1081:
            pg.click("#hm"); pg.wait_for_timeout(900)
            ok = pg.evaluate("(() => { const s = document.getElementById('bd-sheet'); return !!s && !s.hidden; })()")
        else:
            pg.click(".nav-toggle"); pg.wait_for_timeout(700)
            ok = pg.evaluate("document.querySelector('.main-nav').classList.contains('open')")
        c.close()
        return ok
    a1, a2 = first_click(1280, 860, False), first_click(375, 812, False)
    m1 = first_click(1280, 860, True)
    t("V22 홈 첫 방문(도입부 뒤) — 1280 입구 첫 클릭 → 회원 창 · 375 메뉴(☰) 첫 탭 → 열림 · 뮤테이션(가드 삭제)은 잡힘",
      guard in main_src and a1 and a2 and not m1, (a1, a2, m1))

    # 48 — 운영의 .html → 깨끗한 주소 307: 라우터로 들어온 사랑방에서 글쓰기 → 카카오 왕복 → 글쓰기로 돌아온다
    from urllib.parse import urlparse, parse_qs
    board_src = (ROOT / "assets/js/board.min.js").read_text(encoding="utf-8")
    np_anchor = 'function normPath(p) { return String(p || "/")'
    def roundtrip(mut):
        f7 = M.Fake(); seed(f7)
        c = ctx_of(br, f7, 1280, 860)
        def authorize(route):
            q = parse_qs(urlparse(route.request.url).query)
            uid = [k for k, u in f7.users.items() if u["provider"] == "kakao"][0]
            f7.challenges[uid] = (q["code_challenge"][0], q["code_challenge_method"][0])
            back = q["redirect_to"][0]
            back = back + ("&" if "?" in back else "?") + "code=" + f7.issue_code(uid)
            u = urlparse(back)
            back = u._replace(path=re.sub(r"\.html$", "", u.path)).geturl()      # 운영의 307 을 흉내
            route.fulfill(status=200, content_type="text/html", body="<script>location.replace(%r)</script>" % back)
        c.route(re.compile(r"https://%s/auth/v1/authorize.*" % re.escape(SUPA)), authorize)
        c.route(re.compile(r"http://127\.0\.0\.1:8908/(community|news)(\?[^#]*)?$"),
                lambda r: r.fulfill(status=200, content_type="text/html; charset=utf-8",
                                    body=(ROOT / (urlparse(r.request.url).path.strip("/") + ".html")).read_text(encoding="utf-8")))
        if mut:
            c.route(re.compile(r".*/assets/js/board\.min\.js.*"), lambda r: r.fulfill(status=200, content_type="text/javascript",
                    body=board_src.replace(np_anchor, 'function normPath(p) { return String(p || "/"); return String(p || "/")')))
        pg = c.new_page()
        fresh(pg, "news.html", 1500)
        pg.click(".main-nav a[href='community.html']"); pg.wait_for_timeout(2000)
        p0 = pg.evaluate("location.pathname")
        pg.click("#bd-write-btn"); pg.wait_for_timeout(900)
        pg.click("#bd-sheet .bd-kakao"); pg.wait_for_timeout(3500)
        d = pg.evaluate("""() => ({p: location.pathname, writing: !!document.querySelector('#board.is-writing'),
            next: localStorage.getItem('insooni_board_next')})""")
        c.close()
        return p0, d
    p0, d = roundtrip(False)
    _, dm = roundtrip(True)
    t("V23 라우터로 온 /community.html → 글쓰기 → 카카오 왕복(307 로 /community) → 글쓰기 열림 · 이어서 할 일 소비 · 뮤테이션(normPath 무력화)은 잡힘",
      np_anchor in board_src and p0.endswith("/community.html") and d["p"] == "/community" and d["writing"] and d["next"] is None and not dm["writing"], (p0, d, dm))
    c = None


# ═══ V3 — 검토 3바퀴(2026-10-03 새벽) ═══════════════════════════
def group_v3(br):
    print("── V3 (3차 검토 반영)")
    f = M.Fake(); S = seed(f)
    board_src = (ROOT / "assets/js/board.min.js").read_text(encoding="utf-8")

    # 27 — 큰 글자 × 좁은 폰에서 ☰ 가 화면 밖(360×21 에서 right 382.5) → 메뉴를 열 수 없어 다른 페이지로 못 갔다
    TG = """() => { const tg = document.querySelector('.site-header .nav-toggle'), r = tg.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), r.top + r.height / 2);
      return {right: r.right, iw: innerWidth, hit: !!hit && (hit === tg || tg.contains(hit)), over: document.documentElement.scrollWidth - document.documentElement.clientWidth}; }"""
    def toggles(mut):
        bad, n = [], 0
        for who, lg in (("out", None), ("member", None), ("out", "en"), ("member", "en")):
            for fs in (17, 21):
                c = ctx_of(br, f, 414, 800, fs=fs, lang=lg, session=sess(f, S["long"]) if who == "member" else None)
                if mut:
                    c.route(re.compile(r".*/assets/js/board\.min\.js.*"), lambda r: r.fulfill(status=200, content_type="text/javascript",
                            body=board_src.replace('if (toolsOver()) b.classList.add("is-tiny");\nif (toolsOver()) document.documentElement.classList.add("hdr-tight");', "")))
                pg = c.new_page(); fresh(pg, "news.html", 1100)
                for w in (320, 360, 375, 390, 414):
                    pg.set_viewport_size({"width": w, "height": 800}); pg.wait_for_timeout(200)
                    d = pg.evaluate(TG); n += 1
                    if d["right"] > w - 8 or not d["hit"] or d["over"] > 0:
                        bad.append((who, lg, fs, w, round(d["right"], 1)))
                c.close()
        return bad, n
    bad, n = toggles(False)
    bad_m, _ = toggles(True)
    t("V3-1 ☰ 320·360·375·390·414 × 17/21 × 로그아웃·회원 × 한국어·영어 — right ≤ 폭−8 · 눌리는 자리 · 넘침 0 (%d장면) · 뮤테이션(fitHM 판정 삭제) 잡힘 %d" % (n, len(bad_m)),
      not bad and n == 40 and len(bad_m) > 0, (bad[:4], bad_m[:3]))
    # 넘친 자리(영어 360×21 — '로그인'으로 줄여도 ☰ 가 밀린다)에서 언어 단추는 메뉴 패널 맨 아래 줄로 — 눌러서 한국어가 된다
    # (영어는 문맥 초기화 스크립트가 아니라 저장소에 한 번만 넣는다 — 초기화 스크립트는 다시 실을 때마다 'en' 으로 되돌린다)
    c = ctx_of(br, f, 360, 800, fs=21); pg = c.new_page(); fresh(pg, "news.html", 600)
    pg.evaluate("localStorage.setItem('insooni_lang', JSON.stringify('en'))")
    fresh(pg, "news.html", 1100)
    tight = pg.evaluate("document.documentElement.classList.contains('hdr-tight')")
    hid = pg.evaluate("getComputedStyle(document.querySelector('.site-header .header-tools .lang-toggle')).display")
    pg.click(".nav-toggle"); pg.wait_for_timeout(700)
    nl = pg.locator(".main-nav .nav-lang"); nl.scroll_into_view_if_needed()
    nh = nl.bounding_box()["height"]
    nl.click(); pg.wait_for_timeout(1500)
    t("V3-2 영어 360×21 로그아웃 — hdr-tight · 헤더 언어 단추 숨김 · 메뉴 패널 맨 아래 '한국어'(≥56px) → 한국어",
      tight and hid == "none" and nh >= 56 and pg.evaluate("document.documentElement.lang") == "ko", (tight, hid, nh))
    c.close()

    # 28 — 낮은 폰(375×667)에서 메뉴를 열면 마지막 '사랑방'까지 한 화면에 · ©는 목록 아래(12px 이상)
    MENU = """() => { const nav = document.querySelector('.main-nav'), last = nav.querySelector('ul li:last-child a'), r = last.getBoundingClientRect(), nr = nav.getBoundingClientRect();
      const af = getComputedStyle(nav, '::after');
      return {lastB: Math.round(r.bottom), navB: Math.round(nr.bottom), ih: innerHeight, sh: nav.scrollHeight, ch: nav.clientHeight,
              pos: af.position, fsz: parseFloat(af.fontSize), lastH: Math.round(r.height), txt: last.textContent}; }"""
    def menu(w, h, fs, mut):
        c = ctx_of(br, f, w, h, fs=fs); pg = c.new_page(); fresh(pg, "news.html", 900)
        if mut:
            pg.add_style_tag(content=".main-nav.open::after{position:absolute!important;bottom:26px!important;font-size:9px!important} .main-nav a{min-height:56px!important;padding-block:19px!important}")
        pg.click(".nav-toggle"); pg.wait_for_timeout(1000)
        d = pg.evaluate(MENU); c.close()
        return d
    d = menu(375, 667, 17, False)
    dm = menu(375, 667, 17, True)
    ok = d["txt"] == "사랑방" and d["lastB"] <= d["navB"] and d["lastB"] <= d["ih"] and d["sh"] <= d["ch"] + 1 and d["pos"] == "static" and d["fsz"] >= 12 and d["lastH"] >= 44
    okm = dm["lastB"] <= dm["navB"] and dm["sh"] <= dm["ch"] + 1 and dm["pos"] == "static" and dm["fsz"] >= 12
    t("V3-3 375×667/17 메뉴 — '사랑방'(≥44px)이 패널·화면 안 · 패널 넘침 0(©가 목록 아래 흐름) · © ≥12px · 뮤테이션(옛 absolute·9px·56px 줄) 잡힘",
      ok and not okm, (d, dm))

    # 13 — 메일 보낸 화면: 받는 주소 · 어떤 메일인지 · 주 단추 '닫기'
    def sent(conf):
        f2 = M.Fake(); seed(f2)
        c = ctx_of(br, f2, 375, 812, fs=21, conf=conf); pg = c.new_page(); fresh(pg, "news.html")
        pg.click("#hm"); pg.wait_for_timeout(900)
        tabs = pg.locator("#bd-sheet .bd-tab >> text=처음 가입")
        if tabs.count():
            tabs.click(); pg.wait_for_timeout(200)
        pg.fill("#bd-ue", "newfan@test.local"); pg.fill("#bd-up", "goodpass123"); pg.fill("#bd-up2", "goodpass123")
        pg.click("#bd-sheet button[type=submit]"); pg.wait_for_timeout(900)
        d = pg.evaluate("""() => { const s = document.getElementById('bd-sheet'), vis = e => e.checkVisibility();
          const solid = [...s.querySelectorAll('.btn--solid')].filter(vis), to = s.querySelector('.bd-sent-to');
          const li = [...s.querySelectorAll('button')].find(b => b.textContent === '로그인하기');
          return {h: s.querySelector('.bd-sheet-h').textContent, to: to ? to.textContent : '', strong: to && to.querySelector('strong') ? to.querySelector('strong').textContent : '',
                  what: (s.querySelector('.bd-sent-what') || {}).textContent || '', same: (s.querySelector('.bd-sent-same') || {}).textContent || '',
                  solid: solid.map(b => b.textContent), li: li ? li.className : '', liH: li ? Math.round(li.getBoundingClientRect().height) : 0,
                  order: solid.length && li ? !!(solid[0].compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING) : false}; }""")
        c.close()
        return d
    d = sent("{board: true, kakao: true}")
    d2 = sent("{board: true, kakao: true, mailKo: true}")
    t("V3-4 메일 보낸 화면(375×21) — '{주소} 로 보냈습니다'(주소 굵게) · 영어 제목 「Confirm Your Signup」·「Supabase Auth」 안내 · 같은 기기 안내 · 채운 단추는 '닫기' 하나 · '로그인하기'는 그 아래 글자 단추(≥48px) · mailKo 이면 영어 안내 없음",
      d["h"] == "메일을 확인해 주세요" and d["strong"] == "newfan@test.local" and d["to"] == "newfan@test.local 로 보냈습니다"
      and "Confirm Your Signup" in d["what"] and "Supabase Auth" in d["what"] and "Confirm your mail" in d["what"] and "이 기기" in d["same"]
      and d["solid"] == ["닫기"] and "btn--text" in d["li"] and d["liH"] >= 48 and d["order"] and d2["what"] == "" and d2["strong"] == "newfan@test.local", (d, d2))

    # 18 — 사랑방 글쓰기: 칸 오류는 칸 바로 아래(화면 안) · aria-invalid
    bad = []
    for fs in (17, 21):
        c = ctx_of(br, f, 360, 640, fs=fs, session=sess(f, S["fans"][0])); pg = c.new_page(); fresh(pg, "community.html#write", 1500)
        pg.click("#bd-go"); pg.wait_for_timeout(400)
        a = pg.evaluate("""() => { const e = document.getElementById('bd-title-err'), r = e.getBoundingClientRect(), f = document.getElementById('bd-title');
          const hb = document.querySelector('.site-header').getBoundingClientRect().bottom;
          return {txt: e.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), hb: Math.round(hb), ih: innerHeight, inv: f.getAttribute('aria-invalid'),
                  db: f.getAttribute('aria-describedby'), foc: document.activeElement && document.activeElement.id}; }""")
        pg.fill("#bd-title", "제목입니다")
        pg.click("#bd-go"); pg.wait_for_timeout(400)
        b = pg.evaluate("""() => { const e = document.getElementById('bd-body-err'), r = e.getBoundingClientRect(), f = document.getElementById('bd-body');
          const hb = document.querySelector('.site-header').getBoundingClientRect().bottom;
          return {txt: e.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), hb: Math.round(hb), ih: innerHeight, inv: f.getAttribute('aria-invalid'),
                  db: f.getAttribute('aria-describedby'), foc: document.activeElement && document.activeElement.id,
                  tErr: document.getElementById('bd-title-err').textContent, tInv: document.getElementById('bd-title').getAttribute('aria-invalid')}; }""")
        okA = a["txt"] == "제목을 두 글자 이상 적어 주세요." and a["top"] >= a["hb"] and a["bottom"] <= a["ih"] and a["inv"] == "true" and a["db"] == "bd-title-err" and a["foc"] == "bd-title"
        okB = b["txt"] == "내용을 적어 주세요." and b["top"] >= b["hb"] and b["bottom"] <= b["ih"] and b["inv"] == "true" and b["db"] == "bd-body-err" and b["foc"] == "bd-body" and b["tErr"] == "" and b["tInv"] is None
        if not (okA and okB):
            bad.append((fs, a, b))
        c.close()
    t("V3-5 사랑방 글쓰기 360×640 × 17/21 — 빈 제목·빈 내용 오류가 그 칸 바로 아래(화면 안) · aria-invalid · describedby · 고치면 걷힘", not bad, bad)

    # 12 — 글쓰기 내용 칸: 폰에서 높이 7.5em · 자판(보이는 높이 420)이 있으면 내용 칸에 초점 → '올리기'가 보인다.
    # 자판이 없으면(초점만) 화면을 굴리지 않는다 — '← 쓰기 그만두기'가 머리 아래 그대로(검토 4바퀴 2번: 자판 없이 굴려
    # '고치기' 화면의 제목·닫기가 머리 밑에 숨었다)
    bad = []
    for (fs, vvh) in ((17, None), (21, None), (17, 420), (21, 420)):
        c = ctx_of(br, f, 375, 812, fs=fs, session=sess(f, S["fans"][0]))
        if vvh:
            c.add_init_script("Object.defineProperty(window, 'visualViewport', {configurable: true, get: () => ({height: %d, offsetTop: 0, width: 375})});" % vvh)
        pg = c.new_page(); fresh(pg, "community.html#write", 1500)
        y0 = pg.evaluate("scrollY")
        if vvh:
            pg.focus("#bd-body")
        else:
            # 브라우저의 초점 스크롤은 빼고(preventScroll) 우리 코드가 굴리는지만 본다
            pg.evaluate("document.getElementById('bd-body').focus({preventScroll: true})")
        pg.wait_for_timeout(500)
        d = pg.evaluate("""() => { const g = document.getElementById('bd-go').getBoundingClientRect(), b = document.getElementById('bd-body').getBoundingClientRect(),
          hint = document.getElementById('bd-form-hint').getBoundingClientRect(), hb = document.querySelector('.site-header').getBoundingClientRect().bottom;
          return {go: Math.round(g.bottom), bodyH: Math.round(b.height), bodyB: Math.round(b.bottom), bodyT: Math.round(b.top), hintAbove: hint.bottom <= b.top, root: parseFloat(getComputedStyle(document.documentElement).fontSize),
                  back: Math.round(document.getElementById('bd-form-back').getBoundingClientRect().top), hb: Math.round(hb), y: scrollY}; }""")
        if vvh:
            ok = d["go"] <= vvh - 7 and d["bodyT"] >= d["hb"] and d["hintAbove"]
        else:
            ok = d["y"] == y0 and d["back"] >= d["hb"] and d["hintAbove"] and d["bodyH"] <= 7.6 * 1.06 * d["root"] + 2
        if not ok:
            bad.append((fs, vvh, d))
        c.close()
    t("V3-6 375×812 × 17/21 — 자판 없음: 내용 칸 초점에도 스크롤 그대로 · '← 쓰기 그만두기' 머리 아래 · 내용 칸 높이 7.5em / 보이는 높이 420: '올리기' bottom ≤ 412 · 내용 칸 top ≥ 머리 · 등급 안내는 내용 칸 위", not bad, bad)

    # 26 — 회원 창: 가장 작은 폰 × 가장 큰 글자에서 자판(260)이 올라와도 칸과 주 단추가 함께
    bad = []
    for (w, h, vvh) in ((320, 568, 260), (360, 640, 330)):
        for kind in ("join", "login"):
            c = ctx_of(br, f, w, h, fs=21)
            c.add_init_script("Object.defineProperty(window, 'visualViewport', {configurable: true, get: () => ({height: %d, offsetTop: 0, width: %d})});" % (vvh, w))
            if kind == "join":
                nk = f.add_user(None, None, "kakao", {"nickname": "새카카오"}, True)
                c.add_init_script("try{localStorage.setItem('insooni_member_session', %s)}catch(e){}" % json.dumps(json.dumps(sess(f, nk))))
            pg = c.new_page(); fresh(pg, "community.html")
            pg.click("#hm"); pg.wait_for_timeout(800)
            if kind == "login":
                tb = pg.locator("#bd-sheet .bd-tab >> text=로그인")
                if tb.count():
                    tb.click(); pg.wait_for_timeout(200)
            MEAS = """(fid) => { const fe = document.querySelector(fid), form = fe.closest('form'), b = form.querySelector('button[type=submit]').getBoundingClientRect(), i = fe.getBoundingClientRect();
              return {itop: Math.round(i.top), ibot: Math.round(i.bottom), bottom: Math.round(b.bottom), txt: form.querySelector('button[type=submit]').textContent}; }"""
            fid = "#bd-jn" if kind == "join" else "#bd-ie"
            pg.focus(fid); pg.wait_for_timeout(400)
            d = pg.evaluate(MEAS, fid)
            # 이메일 칸 → 비밀번호 칸 → '로그인하기' 셋이 320×568·21px·자판 260 에는 한꺼번에 들어가지 않는다(277px).
            # 그 화면에서는 이메일 칸이 온전히 보이고, 비밀번호 칸으로 옮기면 칸과 '로그인하기'가 함께 보이면 된다
            if kind == "login" and vvh == 260:
                pg.focus("#bd-ip"); pg.wait_for_timeout(400)
                d2 = pg.evaluate(MEAS, "#bd-ip")
                ok = d["itop"] >= 0 and d["ibot"] <= vvh and d2["itop"] >= 0 and d2["bottom"] <= vvh
                d = (d, d2)
            else:
                ok = d["itop"] >= 0 and d["bottom"] <= vvh
            if not ok:
                bad.append((w, h, vvh, kind, d))
            c.close()
    t("V3-7 320×568·21(자판 260) · 360×640·21(자판 330) — 별명 칸 + '가입 마치기' · 이메일 칸 + '로그인하기'(260 에서는 이메일 칸 온전히 → 비밀번호 칸 + '로그인하기')가 함께 보인다", not bad, bad)

    # 32 — 도구줄 높이: 게시판을 바꿔도 첫 줄이 출렁이지 않는다
    rows = {}
    for fs in (17, 21):
        c = ctx_of(br, f, 375, 812, fs=fs, session=sess(f, S["fans"][0])); pg = c.new_page(); fresh(pg, "community.html", 1400)
        hs = []
        for b in ("all", "notice", "letters", "hello", "free", "review"):
            pg.click(".cafe-menu a[data-b='%s']" % b); pg.wait_for_timeout(700)
            hs.append(pg.evaluate("Math.round(document.querySelector('.cafe-tools').getBoundingClientRect().height)"))
        rows[fs] = hs
        c.close()
    t("V3-8 375×812 도구줄 높이 — 17px 여섯 게시판 모두 같다 %s · 21px 차이 ≤ 한 줄(32px) %s" % (rows[17], rows[21]),
      len(set(rows[17])) == 1 and max(rows[21]) - min(rows[21]) <= 32, rows)

    # 38 — 글 보기 메타: 줄이 가운뎃점으로 시작하지 않는다 · 편지 날짜 항목이 쪼개지지 않는다
    bad = []
    for w in (320, 375):
        c = ctx_of(br, f, w, 812, fs=21); pg = c.new_page(); fresh(pg, "community.html#p%d" % S["ids"][7], 1400)
        d = pg.evaluate("""() => { const m = document.querySelector('#cafe-post .cafe-post-meta');
          const dots = [...m.querySelectorAll('.bd-dot')].filter(e => e.checkVisibility()).length;
          return {dots, over: document.documentElement.scrollWidth - document.documentElement.clientWidth}; }""")
        fresh(pg, "community.html#l0", 1400)
        e = pg.evaluate("""() => { const items = [...document.querySelectorAll('.cafe-letter-when .cafe-lw-i')];
          return {n: items.length, split: items.filter(x => x.getClientRects().length > 1).length, over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  txt: (document.querySelector('.cafe-letter-when') || {}).textContent || ''}; }""")
        if d["dots"] or d["over"] or e["n"] < 3 or e["split"] or e["over"] or "당시 댓글" not in e["txt"]:
            bad.append((w, d, e))
        c.close()
    t("V3-9 320·375 × 21px — 글 보기 메타에 보이는 가운뎃점 0(간격으로 구분) · 편지 날짜 항목 쪼개짐 0 · 넘침 0", not bad, bad)

    # 33 · 31 · 29 — 내 글 '고치기'·'지우기'는 글자 단추 · 탭 격자 상자 없음 · 신청곡 찾기 칸 테두리·라벨
    c = ctx_of(br, f, 375, 812, session=sess(f, S["fans"][4])); pg = c.new_page(); fresh(pg, "community.html#p%d" % S["ids"][7], 1400)
    acts = pg.evaluate("""() => [...document.querySelectorAll('#cafe-post .bd-acts > *')].map(b => ({t: b.textContent, cls: b.className,
        w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), c: getComputedStyle(b).color}))""")
    fresh(pg, "community.html", 1400)
    menu_ = pg.evaluate("""() => { const m = getComputedStyle(document.querySelector('.cafe-menu')), a = getComputedStyle(document.querySelector('.cafe-menu a'));
      return [m.backgroundColor, m.rowGap, m.borderTopWidth, m.borderBottomWidth, a.backgroundColor]; }""")
    sl = pg.evaluate("""() => { const i = document.getElementById('sl-q'), cs = getComputedStyle(i), l = document.querySelector('label[for=sl-q]');
      return {bt: cs.borderTopWidth, bc: cs.borderTopColor, lab: l.checkVisibility() && l.getBoundingClientRect().height > 10 && !l.classList.contains('sr-only'),
              ph: getComputedStyle(i, '::placeholder').color}; }""")
    c.close()
    t("V3-10 내 글 '고치기'·'지우기' 글자 단추(테두리 없음 · ≥48×48 · '지우기'는 muted) · 폰 탭 격자 바탕·사방 테두리 없음(아래 1px) · 신청곡 칸 1px .42 · 보이는 라벨 · placeholder --faint",
      len(acts) == 2 and all("btn--text" in a["cls"] and "btn--ghost" not in a["cls"] and a["w"] >= 48 and a["h"] >= 48 for a in acts)
      and acts[1]["t"] == "지우기" and acts[1]["c"] == "rgb(179, 169, 156)"
      and menu_[0] in ("rgba(0, 0, 0, 0)", "transparent") and menu_[1] == "0px" and menu_[2] == "0px" and menu_[3] == "1px" and menu_[4] in ("rgba(0, 0, 0, 0)", "transparent")
      and sl["bt"] == "1px" and sl["bc"] == "rgba(243, 239, 231, 0.42)" and sl["lab"] and sl["ph"] == "rgb(156, 146, 132)", (acts, menu_, sl))

    # 16 — 글쓰기를 누르고 카카오로 가입을 마치면 '가입을 마쳤습니다. 이어서 글을 써 주세요.'가 글쓰기 화면에 보인다
    f3 = M.Fake(); seed(f3)
    kk2 = f3.add_user(None, None, "kakao", {"nickname": "막가입"}, True)     # 명부에 없는 카카오 계정 — 가입 전
    c = ctx_of(br, f3, 375, 812); pg = c.new_page(); fresh(pg, "community.html", 1300)
    pg.click("#bd-write-btn"); pg.wait_for_timeout(900)
    pg.click("#bd-sheet .bd-kakao"); pg.wait_for_timeout(3000)
    jh = pg.evaluate("(document.querySelector('#bd-sheet .bd-sheet-h') || {}).textContent || ''")
    pg.fill("#bd-jn", "막가입"); pg.check("#bd-jall")
    pg.click("#bd-sheet form button[type=submit]"); pg.wait_for_timeout(2500)
    d = pg.evaluate("""() => { const m = document.getElementById('bd-msg'), r = m.getBoundingClientRect(), hb = document.querySelector('.site-header').getBoundingClientRect().bottom;
      return {writing: !!document.querySelector('#board.is-writing'), txt: m.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), hb: Math.round(hb), ih: innerHeight}; }""")
    t("V3-11 글쓰기 → 카카오 → 가입 마치기 → 글쓰기 화면 · '막가입 님, 가입을 마쳤습니다. 이어서 글을 써 주세요.'(화면 안)",
      jh == "가입 마치기" and d["writing"] and d["txt"] == "막가입 님, 가입을 마쳤습니다. 이어서 글을 써 주세요." and d["top"] >= d["hb"] and d["bottom"] <= d["ih"], (jh, d))
    c.close()


# ═══ V4 — 검토 4바퀴(2026-10-03 새벽) ════════════════════════════
# 자판 흉내 — 보이는 화면(visualViewport)을 줄이고 resize 를 쏜다(iOS·안드로이드 크롬처럼 innerHeight 는 그대로)
VVE = """(() => { const et = new EventTarget(); window.__vvH = null;
  const o = { get height() { return window.__vvH || window.innerHeight; }, get width() { return window.innerWidth; }, offsetTop: 0, offsetLeft: 0, pageTop: 0, scale: 1,
    addEventListener: (a, b, c) => et.addEventListener(a, b, c), removeEventListener: (a, b, c) => et.removeEventListener(a, b, c) };
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => o });
  window.__kb = (h) => { window.__vvH = h; et.dispatchEvent(new Event('resize')); }; })();"""
KBM = """([fid, bid]) => { const f = document.querySelector(fid), b = document.querySelector(bid), hb = document.querySelector('.site-header').getBoundingClientRect().bottom;
  return {ft: Math.round(f.getBoundingClientRect().top * 10) / 10, fb: Math.round(f.getBoundingClientRect().bottom), bb: Math.round(b.getBoundingClientRect().bottom * 10) / 10, hb: Math.round(hb * 10) / 10,
          vv: window.visualViewport.height, foc: document.activeElement === f, ekh: f.getAttribute('enterkeyhint'), sp: getComputedStyle(document.documentElement).scrollPaddingTop}; }"""


def group_v4(br):
    print("── V4 (4차 검토 반영)")
    f = M.Fake(); S = seed(f)

    # 2 — '고치기'로 들어오면 제목·닫기가 보인다(자판 없이 초점만 줄 때 화면을 단추 쪽으로 끌어내리지 않는다)
    bad = []
    for (w, h, fs) in ((375, 667, 21), (375, 812, 17), (360, 640, 21)):
        c = ctx_of(br, f, w, h, fs=fs, session=sess(f, S["fans"][4])); pg = c.new_page(); fresh(pg, "community.html#p%d" % S["ids"][7], 1500)
        pg.click("#cafe-post .bd-edit-a"); pg.wait_for_timeout(1200)
        d = pg.evaluate("""() => { const hb = document.querySelector('.site-header').getBoundingClientRect().bottom, bk = document.getElementById('bd-form-back').getBoundingClientRect(),
          fh = document.getElementById('bd-form-h').getBoundingClientRect();
          return {hb: Math.round(hb), back: Math.round(bk.top), head: Math.round(fh.top), ih: innerHeight, foc: document.activeElement && document.activeElement.id,
                  txt: document.getElementById('bd-form-h').textContent}; }""")
        if not (d["txt"] == "글 고치기" and d["back"] >= d["hb"] and d["head"] >= d["hb"] and d["head"] < d["ih"] and d["foc"] == "bd-title"):
            bad.append((w, h, fs, d))
        c.close()
    t("V4-1 '고치기' 클릭(375×667·21 · 375×812·17 · 360×640·21) — '← 고치지 않고 닫기'·'글 고치기' top ≥ 머리 아래 · 초점 제목 칸", not bad, bad)

    # 10 · 11 · 14 — 자판: 칸과 그 단추가 머리 아래 ~ 자판 위에 함께 · 한 글자 더 쳐도 그대로
    cases = []
    for (w, h, fs, vvh) in ((360, 640, 17, 330), (360, 640, 19, 330), (360, 640, 21, 330), (375, 667, 21, 350), (390, 844, 17, 470), (390, 844, 21, 470)):
        cases.append(("write", w, h, fs, vvh, "community.html#write", "#bd-body", "#bd-go", S["fans"][0]))
        cases.append(("comment", w, h, fs, vvh, "community.html#p%d" % S["ids"][4], ".bd-cform textarea", ".bd-cform button[type=submit]", S["fans"][0]))
        cases.append(("nick", w, h, fs, vvh, "community.html#me", "#bd-mn", ".me-nickf button[type=submit]", S["fans"][3]))
    kbad, n = [], 0
    for (kind, w, h, fs, vvh, url, fid, bid, who) in cases:
        c = ctx_of(br, f, w, h, fs=fs, session=sess(f, who)); c.add_init_script(VVE); pg = c.new_page(); fresh(pg, url, 1600)
        pg.locator(fid).first.scroll_into_view_if_needed(); pg.wait_for_timeout(120)
        pg.locator(fid).first.click(); pg.wait_for_timeout(250)
        pg.keyboard.type("반갑" if kind != "nick" else "새")
        pg.evaluate("(h) => window.__kb(h)", vvh); pg.wait_for_timeout(600)
        d1 = pg.evaluate(KBM, [fid, bid])
        pg.keyboard.type("습니다 또 씁니다" if kind != "nick" else "별"); pg.wait_for_timeout(500)
        d2 = pg.evaluate(KBM, [fid, bid])
        n += 1
        ok = all(d["foc"] and d["ft"] >= d["hb"] and d["bb"] <= d["vv"] - 7.5 for d in (d1, d2))
        if kind == "nick":
            ok = ok and d1["ekh"] == "done"
        else:
            ok = ok and d1["sp"] == "%gpx" % (65 + fs * .5)
        if not ok:
            kbad.append((kind, w, h, fs, vvh, d1, d2))
        c.close()
    t("V4-2 자판 흉내 %d장면 — 글쓰기 내용 칸+'올리기' · 댓글 칸+'댓글 올리기' · 내 정보 별명 칸+'별명 저장': 한 글자 더 쳐도 칸 top ≥ 머리 · 단추 bottom ≤ 보이는 높이−8 · 별명 칸 enterkeyhint=done · 글칸 초점 중 scroll-padding-top 65px+.5rem" % n,
      not kbad and n == 18, kbad[:3])

    # 2 ① — 자판이 없으면(초점만) 화면을 굴리지 않는다 · 자판이 내려가면 줄인 글칸 높이를 되돌린다
    c = ctx_of(br, f, 360, 640, fs=21, session=sess(f, S["fans"][0])); c.add_init_script(VVE); pg = c.new_page(); fresh(pg, "community.html#write", 1500)
    y0 = pg.evaluate("scrollY"); h0 = pg.evaluate("document.getElementById('bd-body').getBoundingClientRect().height")
    # 브라우저의 초점 스크롤은 빼고(preventScroll) 우리 코드가 굴리는지만 본다
    pg.evaluate("document.getElementById('bd-body').focus({preventScroll: true})"); pg.wait_for_timeout(500)
    y1 = pg.evaluate("scrollY")
    pg.evaluate("window.__kb(330)"); pg.wait_for_timeout(500)
    h1 = pg.evaluate("document.getElementById('bd-body').getBoundingClientRect().height")
    pg.evaluate("window.__kb(0)"); pg.wait_for_timeout(500)
    h2 = pg.evaluate("document.getElementById('bd-body').getBoundingClientRect().height")
    t("V4-3 360×640·21 — 자판 없이 내용 칸 초점 → 스크롤 그대로(%d→%d) · 자판 330 → 글칸 줄임(%.0f→%.0f) · 자판 내림 → 원래 높이(%.0f)" % (y0, y1, h0, h1, h2),
      y0 == y1 and h1 < h0 - 10 and abs(h2 - h0) < 1, (y0, y1, h0, h1, h2))
    c.close()

    # 4 · 21 — 체크박스: 어두운 테마 · 직접 그린 직각 상자 · 테두리 대비 ≥ 3:1 · 동의 빠진 칸은 칸 자체에 표시 · 20 — 카카오 이름 안내
    nk = f.add_user(None, None, "kakao", {"nickname": "김정수"}, True)
    c = ctx_of(br, f, 375, 812, session=sess(f, nk)); pg = c.new_page(); fresh(pg, "community.html", 1400)
    pg.click("#hm"); pg.wait_for_timeout(900)
    cb = pg.evaluate("""() => { const i = document.getElementById('bd-ja'), cs = getComputedStyle(i), box = i.closest('.bd-sheet-box');
      const nick = document.getElementById('bd-jn'), hint = nick.closest('.form-field').nextElementSibling;
      return {scheme: getComputedStyle(document.documentElement).colorScheme, app: cs.appearance, rad: cs.borderTopLeftRadius, bw: cs.borderTopWidth, bc: cs.borderTopColor,
              bg: getComputedStyle(box).backgroundColor, nick: nick.value, hint: hint ? hint.textContent : ''}; }""")
    pg.click("#bd-sheet form .btn--solid"); pg.wait_for_timeout(500)
    inv = pg.evaluate("""() => { const i = document.getElementById('bd-ja'), cs = getComputedStyle(i);
      return {inv: i.getAttribute('aria-invalid'), ol: cs.outlineStyle + ' ' + cs.outlineWidth, oc: cs.outlineColor, err: document.getElementById('bd-jerr').textContent}; }""")
    pg.check("#bd-jall"); pg.wait_for_timeout(200)
    chk = pg.evaluate("""() => { const i = document.getElementById('bd-ja'); return [i.checked, getComputedStyle(i).backgroundColor, getComputedStyle(i, '::before').opacity, i.getAttribute('aria-invalid')]; }""")
    c.close()
    def lum(c_):
        v = [float(x) for x in re.findall(r"[\d.]+", c_)[:3]]
        v = [x / 255 for x in v]
        v = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in v]
        return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]
    def over(fg, bg):
        a = [float(x) for x in re.findall(r"[\d.]+", fg)]
        b = [float(x) for x in re.findall(r"[\d.]+", bg)][:3]
        al = a[3] if len(a) > 3 else 1
        return "rgb(%s)" % ",".join(str(al * a[k] + (1 - al) * b[k]) for k in range(3))
    bg = cb["bg"] if not cb["bg"].startswith("rgba(0, 0, 0, 0") else "rgb(8,8,8)"
    l1, l2 = lum(over(cb["bc"], bg)), lum(bg)
    cr = (max(l1, l2) + .05) / (min(l1, l2) + .05)
    t("V4-4 가입 창 — :root color-scheme dark · 체크박스 appearance none · 모서리 0 · 테두리 대비 %.1f:1 ≥ 3 · 빠진 칸 aria-invalid + 아이보리 테두리선 · \"위의 '모두 동의합니다'를 눌러 주세요.\" · 체크하면 아이보리+✓ · 카카오 이름 안내" % cr,
      cb["scheme"] == "dark" and cb["app"] == "none" and cb["rad"] == "0px" and cr >= 3
      and inv["inv"] == "true" and inv["ol"].startswith("solid") and inv["oc"] == "rgb(243, 239, 231)" and inv["err"] == "위의 '모두 동의합니다'를 눌러 주세요."
      and chk[0] and chk[1] == "rgb(243, 239, 231)" and chk[2] == "1" and chk[3] is None
      and cb["nick"] == "김정수" and cb["hint"] == "카카오 이름이 그대로 들어왔습니다. 방명록·사랑방에 이 이름으로 보이니, 실명이면 다른 별명을 권합니다.", (cb, inv, chk, cr))

    # 5 — 사랑방: 카카오에서 코드 없이 돌아오면 노란 '카카오로 시작하기'가 맨 위(화면 안) · 이메일은 '또는 이메일로' 아래
    c = ctx_of(br, f, 375, 812); pg = c.new_page(); fresh(pg, "community.html")
    pg.evaluate("localStorage.setItem('insooni_pkce', JSON.stringify({v: 'x', p: 'kakao', at: Date.now()}))")
    fresh(pg, "community.html", 1600)
    d = pg.evaluate("""() => { const s = document.getElementById('bd-sheet'), k = s.querySelector('.bd-kakao'), or = s.querySelector('.bd-or'), pane = s.querySelector('.bd-pane');
      return {low: !!k && k.classList.contains('bd-kakao--low'), yellow: !!k && getComputedStyle(k).backgroundColor === 'rgb(254, 229, 0)', ktop: k ? Math.round(k.getBoundingClientRect().bottom) : 9999,
              ih: innerHeight, or: or ? or.textContent : '', before: !!(k && pane && (k.compareDocumentPosition(pane) & Node.DOCUMENT_POSITION_FOLLOWING)),
              al: [...s.querySelectorAll('[role=alert]')].map(a => a.textContent).length, mark: sessionStorage.getItem('insooni_kakao_fail_at')}; }""")
    t("V4-5 사랑방 카카오 코드 없이 돌아옴 — 노란 '카카오로 시작하기'(내리지 않음)가 이메일보다 앞 · 화면 안(bottom %d ≤ %d) · '또는 이메일로' · 안내 1개 · 10분 내림 없음" % (d["ktop"], d["ih"]),
      not d["low"] and d["yellow"] and d["before"] and d["ktop"] <= d["ih"] and d["or"] == "또는 이메일로" and d["al"] == 1 and d["mark"] is None, d)
    c.close()

    # 9 — PC 헤더 회원 입구: 밑줄은 단추 하나에서(별명은 글자 흐름 · 등급 앞은 공백 글자 · 별명 자체의 밑줄·여백 없음)
    c = ctx_of(br, f, 1440, 900, session=sess(f, S["fans"][3]), mobile=False); pg = c.new_page(); fresh(pg, "news.html")
    d = pg.evaluate("""() => { const h = document.getElementById('hm'), n = h.querySelector('.hm-nick'), lv = h.querySelector('.hm-lv'), lg = h.querySelector('.hm-long');
      return {hm: getComputedStyle(h).textDecorationLine, nickDisp: getComputedStyle(n).display, nickDeco: getComputedStyle(n).textDecorationLine,
              lvMargin: getComputedStyle(lv).marginLeft, gap: lv.previousSibling && lv.previousSibling.nodeType === 3 ? lv.previousSibling.nodeValue : null,
              txt: lg.textContent, lines: lg.getClientRects().length}; }""")
    c.close()
    c = ctx_of(br, f, 1440, 900, session=sess(f, S["long"]), mobile=False); pg = c.new_page(); fresh(pg, "news.html")
    lng = pg.evaluate("[document.querySelector('#hm .hm-nick').textContent, document.getElementById('hm').getAttribute('aria-label')]")
    c.close()
    t("V4-6 1440 회원 입구 — 밑줄은 #hm 하나(underline) · 별명 inline·자체 밑줄 없음 · 등급 앞 공백 글자(margin 0) · '대전 아줌마 새싹 · 내 정보' 한 줄 · 12자 별명은 7자+… (전체는 aria-label)",
      d["hm"] == "underline" and d["nickDisp"] == "inline" and d["nickDeco"] == "none" and d["lvMargin"] == "0px" and d["gap"] == " "
      and d["txt"] == "대전 아줌마 새싹 · 내 정보" and d["lines"] == 1 and lng[0] == "가나다라마바사…" and lng[1].startswith("가나다라마바사아자차카타"), (d, lng))

    # 13 — 댓글을 키보드로 올리면(Enter) 초점이 문서로 떨어지지 않는다 — 보내는 동안 aria-disabled · 다시 그린 뒤 같은 단추로
    c = ctx_of(br, f, 1280, 860, session=sess(f, S["fans"][0]), mobile=False); pg = c.new_page(); fresh(pg, "community.html#p%d" % S["ids"][4], 1500)
    pg.fill(".bd-cform textarea", "키보드로 남기는 댓글")
    pg.focus(".bd-cform button[type=submit]")
    pg.evaluate("""() => { window.__foc = []; const tick = () => { window.__foc.push(document.activeElement === document.body ? 'BODY' : document.activeElement.tagName); if (window.__foc.length < 40) setTimeout(tick, 40); }; tick(); }""")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(2200)
    d = pg.evaluate("""() => ({foc: window.__foc, now: document.activeElement && document.activeElement.textContent, msg: (document.querySelector('.bd-cmsg') || {}).textContent || ''})""")
    c.close()
    t("V4-8 댓글 '댓글 올리기' Enter → 1.6초 동안 초점이 한 번도 문서(body)로 떨어지지 않음 · 다시 그린 뒤 초점 '댓글 올리기' · '댓글을 올렸습니다.'",
      "BODY" not in d["foc"] and d["now"] == "댓글 올리기" and d["msg"] == "댓글을 올렸습니다.", d)

    # 16 — 언어 단추(일반 페이지): 보이는 글자의 언어를 lang 으로 · 이름표도 그 언어 · 영어 화면의 '한국어'는 본문 서체·자간 0
    lg = {}
    for lang in (None, "en"):
        c = ctx_of(br, f, 1280, 860, lang=lang, mobile=False); pg = c.new_page(); fresh(pg, "music.html", 1400)
        lg[lang or "ko"] = pg.evaluate("""() => [...document.querySelectorAll('.lang-toggle')].map(b => [b.textContent, b.getAttribute('lang'), b.getAttribute('aria-label'),
          getComputedStyle(b).fontFamily.split(',')[0].replace(/["']/g, '').trim(), getComputedStyle(b).letterSpacing])""")
        c.close()
    t("V4-7 언어 단추 — 한국어 화면 'EN' lang=en 'View in English' · 영어 화면 '한국어' lang=ko '한국어로 보기' 본문 서체 · 자간 0",
      lg["ko"] and all(x[1] == "en" and x[2] == "View in English" for x in lg["ko"])
      and lg["en"] and all(x[0] == "한국어" and x[1] == "ko" and x[2] == "한국어로 보기" and "JetBrains" not in x[3] and x[4] in ("normal", "0px") for x in lg["en"]), lg)


if __name__ == "__main__":
    t0 = time.time()
    run()
    fail = [r for r in R if not r[1]]
    print("\n%d/%d 통과 (%.0f초)" % (len(R) - len(fail), len(R), time.time() - t0))
    sys.exit(1 if fail else 0)
