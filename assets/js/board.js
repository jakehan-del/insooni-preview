/* ============================================================
   INSOONI · 회원 · 사랑방 카페 (board.js)
   ------------------------------------------------------------
   매니저 요청(2026-10-01)과 형님 결정(2026-10-02):
     · 로그인은 카카오 + 이메일. Supabase 인증이 맡는다(이 파일은 그 문을 두드릴 뿐이다).
     · 새싹 → 정회원 자동 등업(운영자가 올린 글 3 + 댓글 5), 운영자는 언제든 직접 조정.
     · 정회원의 글·댓글은 바로 공개, 새싹은 운영자 확인 뒤 공개.
   서버 규칙은 supabase/010_회원과_게시판.sql 에 있다. 화면을 고쳐도 권한은 생기지 않는다.

   두 부분으로 나뉜다(2026-10-02 밤, v4):
     1) 회원 핵심 initMember() — 문서마다 한 번. 모든 페이지 헤더에 '로그인 · 회원가입' 입구를 넣고
        (형님: "웹사이트에 로그인도 회원가입도 없다"), 회원 창(#bd-sheet)·로그인 왕복·돌아오기를 맡는다.
        헤더는 라우터가 갈아끼우지 않으므로 한 번만 넣는다. 공연 화면(gig.js)도 이것을 쓴다
        → window.INSOONI_MEMBER.
     2) 사랑방 카페 initCafe() — #board 가 있는 문서에서만. 라우터가 <main> 을 바꿀 때마다 다시 붙는다.

   지킨 것
     1) 팬이 쓴 글은 신뢰할 수 없는 입력이다. 전부 textContent 로만 넣는다(innerHTML 금지).
     2) 비밀번호는 어디에도 저장하지 않는다. 세션 열쇠만 이 기기에 둔다(로그인 유지).
     3) 쓰던 글은 이 기기에 저절로 저장한다 — 카카오 로그인으로 페이지를 떠났다 와도,
        실수로 닫아도 잃지 않는다. 길게 쓰는 사람이 가장 두려워하는 것이 '날아감'이다.
     4) 실패를 성공처럼 보이지 않는다. 서버가 거절하면 그 이유를 사람 말로 옮긴다.
     5) 서버에 010 이 아직 없으면(함수 404) 게시판을 조용히 숨긴다 — 깨진 화면을 보이지 않는다.
     6) 로그인은 PKCE — 돌아오는 주소에 열쇠가 실리지 않고 일회용 코드만 실린다.
     7) config.board 가 꺼져 있으면 헤더 입구도 넣지 않고 서버에 한 번도 묻지 않는다.
   ============================================================ */
(function () {
  "use strict";

  var SKEY = "insooni_member_session";   /* 세션 열쇠(로그인 유지) */
  var PKEY = "insooni_pkce";             /* 로그인 왕복 동안만 쓰는 일회용 검증값 */
  var DKEY = "insooni_board_draft";      /* 쓰던 글 */
  var NKEY = "insooni_board_next";       /* 로그인 뒤 이어서 할 일 */
  var RKEY = "insooni_member_ret";       /* 로그인하러 떠나기 직전의 자리(주소·스크롤) */
  var BKEY = "insooni_cafe_back";        /* 글을 열기 직전의 목록 자리(sessionStorage) */
  var YKEY = "insooni_cafe_y";           /* 목록을 보다 떠난 자리 — 새로고침·뒤로 가기로 돌아올 때(sessionStorage) */
  var DOC_PATH = location.pathname;      /* 이 문서가 처음 열린 주소 — 라우터로 들어온 사랑방과 가른다 */
  var TIMEOUT = 15000;
  var NEXT_TTL = 30 * 60e3;              /* 30분 넘게 묵은 '이어서 할 일'·'돌아올 자리'는 버린다 */
  var KAKAO_BACK_TTL = 10 * 60e3;
  var KFKEY = "insooni_kakao_fail_at";   /* 카카오 로그인이 방금(10분 안) 끝나지 못했다(sessionStorage) */
  var SEEN = "insooni_member_seen";      /* 이 기기로 한 번이라도 로그인한 적이 있다 — 회원 창의 첫 탭을 고른다 */
  var MEFROM = "insooni_me_from";        /* 공연 화면에서 '내 정보'로 왔다 — 내 정보 맨 위에 '← 공연 화면으로'(sessionStorage) */

  /* ---------- 작은 도구 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function byId(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function t(key, ko) {
    var d = window.I18N_EN || {};
    return document.documentElement.getAttribute("lang") === "en" && d[key] ? d[key] : ko;
  }
  /* 숫자·이름이 문장 가운데 들어가는 문구 — 영어는 어순이 달라 조각 잇기로는 못 쓴다 */
  function fmt(s, o) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o.hasOwnProperty(k) ? o[k] : m; });
  }
  function isEN() { return document.documentElement.getAttribute("lang") === "en"; }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function ssGet(k) { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }

  function conf() { return window.INSOONI_CONFIG || {}; }
  /* 주소를 같은 페이지끼리 같게 — 운영은 /community.html 을 /community 로 307 보낸다(깨끗한 주소).
     라우터로 들어온 사랑방의 주소는 /community.html 이라, 로그인 왕복 뒤(/community) 경로를 그대로 비교하면
     '다른 페이지'로 보고 하던 일(글쓰기)·돌아올 자리를 버렸다(검토 48번, 라이브 307 실측) */
  function normPath(p) { return String(p || "/").replace(/\/index\.html$/, "/").replace(/\.html$/, "") || "/"; }
  function samePath(a, b) { return normPath(a) === normPath(b); }
  function cfg() {
    var c = conf();
    var url = (c.url || "").replace(/\/+$/, "");
    var key = c.anonKey || "";
    if (!url || !key) return null;
    if (url.indexOf("여기에") >= 0 || key.indexOf("여기에") >= 0) return null;
    if (url.indexOf("YOUR-") >= 0 || key.indexOf("YOUR-") >= 0) return null;
    return { url: url, key: key };
  }
  /* 스위치는 '정확히 true' 일 때만 켜진 것으로 본다(config.js) */
  function boardOn() { return !!cfg() && conf().board === true; }
  function kakaoOn() { return conf().kakao === true; }
  function liveOn() { return boardOn() && conf().live === true; }
  /* 014(모든 글 바로 공개)가 운영에 있다 — 화면이 '확인 뒤 올라갑니다'라고 말하지 않게. 서버가 정하는 것은 그대로 서버가
     정하고(응답의 status), 이 스위치는 쓰기 전에 보여 주는 안내 문장만 바꾼다(형님 10/03 결정) */
  function instantOn() { return conf().instant === true; }
  /* 가입할 때 '인순이 새 소식을 이메일로' 선택 동의 — 공연 담당 피드백(2026-10-03). 015 를 실행하면 회원별로 저장되고,
     실행 전이면 001 의 구독 명단(subscribe)에 넣는다. 꺼 두면 칸 자체가 없다 */
  function newsOn() { return conf().news === true; }
  /* 마이페이지의 013 칸(내 댓글·내 노래·가입 질문) — 스위치가 켜졌고, 서버가 아직 '없다'(404)고 하지 않았다 */
  function mypageOn() { return boardOn() && conf().mypage === true && S.mp !== false; }
  function onLivePage() { return document.body && document.body.getAttribute("data-page") === "live"; }
  /* 공연 화면(gig.js)의 지금 단계 — 'open'(도장 받는 중) · 'before' · 'after' · 'closed' · ''(아직 모름·코드 입력) */
  function gigPhase() {
    try { var g = window.INSOONI_GIG && window.INSOONI_GIG.state(); return (g && g.L && /^L(4|5|6|7|8|9|10|11|12)$/.test(g.L) && g.phase) || ""; } catch (e) { return ""; }
  }
  function gigOpen() { return gigPhase() === "open"; }
  /* 공연 화면 회원 창의 제목·첫 문장·가입 단추 — 창을 연 목적(wy)과 지금 단계(ph)에 맞춘다(검토 4바퀴 12·18번).
     단계를 아직 모르면('') 도장 받는 중으로 본다 — 공연 화면은 대부분 그때 열리고, 단계가 정해지면 syncGigSheet 가 고친다 */
  function gigStartH(wy, ph) {
    /* 자동으로 뜬 창(gig.js autoPop) — 아무것도 누르지 않은 사람에게 '도장을 남기려면'은 엉뚱하다 */
    if (wy === "pop") return t("bd.sheetHGigPop", "회원으로 오늘 공연을 함께해 주세요");
    return wy === "cheer" ? t("bd.sheetHGigCheer", "응원을 보내려면 회원으로 들어와 주세요")
      : wy === "vote" ? t("bd.sheetHGigVote", "투표하려면 회원으로 들어와 주세요")
      : wy === "gb" ? t("bd.sheetHGigGb", "방명록을 남기려면 회원으로 들어와 주세요")
      : ph && ph !== "open" ? t("bd.sheetH", "로그인 · 회원가입")
      : t("bd.sheetHGig", "도장을 남기려면 회원으로 들어와 주세요");
  }
  function gigStartLede(wy, ph, kakaoTop) {
    var what = wy === "cheer" ? t("bd.sheetWhyCheer", "가입을 마치면 누르신 응원이 바로 더해지고, 오늘 공연 도장도 함께 찍힙니다.")
      : wy === "vote" ? t("bd.sheetWhyVote", "가입을 마치면 고르신 노래에 한 표가 바로 더해지고, 오늘 공연 도장도 함께 찍힙니다.")
      : wy === "gb" ? t("bd.sheetWhyGb", "가입을 마치면 이 화면에서 바로 한 줄 남길 수 있습니다.")
      : ph === "before" ? t("bd.sheetWhyGigBefore", "미리 가입해 두시면 도장이 열릴 때 이 화면에서 바로 찍을 수 있습니다.")
      : ph === "after" ? t("bd.sheetWhyGigAfter", "가입하면 이 공연 방명록에 한 줄 남길 수 있습니다.")
      : ph && ph !== "open" ? t("bd.sheetWhyGigOff", "가입하면 사랑방에 글과 댓글을 남길 수 있습니다. 읽기는 누구나 됩니다.")
      : "";
    if (what) return what + " " + (kakaoTop ? t("bd.sheetFast", "카카오로 시작하면 가장 빠릅니다.") : t("bd.sheetMailOr", "이메일로 가입하거나, 이미 회원이면 로그인해 주세요."));
    return kakaoTop ? t("bd.sheetLedeGig", "도장을 찍으면 오늘 다녀온 공연이 내 정보에 남습니다. 카카오로 시작하면 가장 빠릅니다.")
                    : t("bd.sheetLedeGigMail", "도장을 찍으면 오늘 다녀온 공연이 내 정보에 남습니다. 이메일로 가입하거나, 이미 회원이면 로그인해 주세요.");
  }
  /* 공연 화면 회원 창의 '회원이 되면' 줄 — 실제로 있는 기능만(혜택은 지어내지 않는다, 검토 43번).
     도장·응원·투표는 그것이 아직 열려 있을 때(시작 전·받는 중)만 말한다 */
  function gigPerks(ph) {
    var ul = el("ul", "bd-perks");
    ul.setAttribute("aria-label", t("bd.perksAria", "회원이 되면"));
    var items = [];
    if (!ph || ph === "open" || ph === "before") items.push(t("bd.perkGig", "오늘 공연 도장 · 응원 한마디 · 앵콜곡 투표"));
    items.push(t("bd.perkGb", "공연 방명록과 사랑방에 글 남기기"));
    if (newsOn()) items.push(t("bd.perkNews", "원하시면 인순이 새 공연·방송 소식을 이메일로 먼저"));
    items.forEach(function (x) { ul.appendChild(el("li", null, x)); });
    return ul;
  }
  function joinGoText(gig, wy, ph) {
    if (gig && wy === "gb") return t("bd.doJoinGb", "가입 마치고 방명록 남기기");
    if (gig && (!ph || ph === "open")) return t("bd.doJoinGig", "가입 마치고 도장 찍기");
    return t("bd.doJoin", "가입 마치기");
  }
  /* 공연 화면이 단계를 새로 알았을 때(gig.js render) — 열려 있는 공연 문맥 회원 창의 글만 그 자리에서 고친다 */
  function syncGigSheet() {
    if (!sheet || sheet.hidden || !sheet.__gs) return;
    var g = sheet.__gs, ph = gigPhase();
    if (ph === g.ph) return;
    g.ph = ph;
    if (g.view === "start") {
      var h = sheet.querySelector(".bd-sheet-h");
      if (h) h.textContent = gigStartH(g.wy, ph);
      var l = byId("bd-sheet-lede");
      if (l && !g.note) l.textContent = gigStartLede(g.wy, ph, g.kt);
    } else if (g.view === "join" && g.btn && !g.btn.disabled) {
      g.btn.textContent = joinGoText(true, g.wy, ph);
    }
  }

  /* ---------- 자판 맞춤(공용) — 검토 4바퀴 2·10·11·14번 ----------
     폰에서 글칸을 누르면 자판이 올라와 보이는 화면(visualViewport)이 줄어든다. 그때 그 칸의 단추(올리기·댓글 올리기·
     별명 저장·방명록 남기기·공연 코드 열기)가 자판 뒤로 가면, 어르신은 '자판을 내려야 단추가 보인다'는 것을 모르고
     거기서 멈춘다. 예전 맞춤(goFit·gbFit)은 칸마다 따로였고 세 군데에서 무너졌다:
       ① 자판이 없어도 굴렸다 — '고치기'로 들어오면(초점만 있고 자판 없음) 화면을 단추 쪽으로 끌어내려 제목·닫기가 머리 밑에 숨었다.
       ② 단추만 봤다 — 작은 폰·큰 글자(360×640·21px)에서는 단추를 맞추느라 내가 치는 첫 줄이 머리 밑으로 갔다.
       ③ 초점·크기 변화 때만 돌았다 — 한 글자를 치면 크로뮴이 커서를 6rem(scroll-padding-top) 아래로 끌어와
          화면을 다시 위로 굴렸고 단추는 도로 자판 뒤로 갔다.
     그래서 칸에 초점이 있는 동안, 보이는 화면이 바뀔 때와 글을 칠 때마다 '칸 윗변 ≥ 머리 아래 + 8' 과
     '단추 아랫변 ≤ 보이는 화면 아래 − 8' 을 함께 맞춘다. 둘이 한 화면에 안 들어가면 그동안만 글칸 높이를 들어가는 만큼
     줄인다(한 줄 아래로는 줄이지 않고, 그래도 안 되면 내가 치는 칸이 먼저다). 문서 끝이라 더 굴릴 자리가 없으면 몸 끝에
     빈 자리를 잠시 만든다(자판에 가려지는 자리라 보이지 않는다). 칸에서 나가면 높이·빈 자리를 되돌린다.
     '자판이 있다' = 보이는 높이가 이 폭에서 본 가장 큰 창 높이의 85% 미만(손가락 확대는 빼고). iOS·안드로이드 크롬은
     자판이 떠도 창 높이가 그대로이고, 카카오톡 인앱(안드로이드)은 창 자체가 줄어든다 — 둘 다 잡는다. */
  var KB = { f: null, b: null, w: 0, h: 0, vv: null, raf: 0, sp: null, spH: 0 };
  function kbBase() {
    var w = window.innerWidth, h = window.innerHeight;
    if (w !== KB.w) { KB.w = w; KB.h = h; } else if (h > KB.h) KB.h = h;
    return KB.h;
  }
  function kbUp() {
    var vv = window.visualViewport;
    var vh = vv && vv.height ? Math.min(vv.height, window.innerHeight) : window.innerHeight;
    if (vv && (vv.scale || 1) > 1.05) return false;
    return vh < kbBase() * 0.85;
  }
  function kbHead() {
    var hd = $(".site-header") || $(".gig-head");
    if (!hd || !hd.getClientRects().length) return 0;
    var b = hd.getBoundingClientRect().bottom;
    return b > 0 ? b : 0;
  }
  /* 줄여 둔 글칸 높이를 되돌린다 */
  function kbSize(f) {
    if (!f || !f.__kbNat) return;
    f.style.height = f.__kbSt[0];
    f.style.minHeight = f.__kbSt[1];
    f.__kbNat = 0;
  }
  /* bottomY(문서 좌표)까지 화면을 내릴 수 있게 몸 끝에 빈 자리를 둔다. 0 이면 걷는다.
     짧은 문서(공연 코드 화면)는 몸이 min-height 로 화면 높이를 채워 '남은 스크롤'이 0 이라, 빈 자리를 '모자란 만큼'만
     더하면 그 높이가 min-height 안에 묻혀 한 px 도 늘지 않았다(360×640 실측) — 빈 자리의 시작 위치에서 직접 잰다 */
  function kbRoom(bottomY) {
    if (!bottomY) {
      if (KB.sp && KB.sp.parentNode) KB.sp.parentNode.removeChild(KB.sp);
      KB.spH = 0;
      return;
    }
    if (!KB.sp) {
      KB.sp = el("div", "kb-room");
      KB.sp.setAttribute("aria-hidden", "true");
    }
    if (KB.sp.parentNode !== document.body) { KB.sp.style.height = "0px"; document.body.appendChild(KB.sp); }
    var top = KB.sp.getBoundingClientRect().top + window.scrollY;
    var pad = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    var h = Math.max(KB.spH, Math.ceil(bottomY - top - pad + 8));
    KB.spH = h;
    KB.sp.style.height = h + "px";
  }
  function kbFit() {
    KB.raf = 0;
    var f = KB.f, b = KB.b ? KB.b() : null;
    if (!f || document.activeElement !== f) return;
    if (!kbUp()) { kbSize(f); return; }
    if (!b || !b.getClientRects().length) return;
    var vv = window.visualViewport, vt = vv && vv.height ? (vv.offsetTop || 0) : 0;
    var vh = vv && vv.height ? Math.min(vv.height, window.innerHeight) : window.innerHeight;
    var top = Math.max(kbHead(), vt) + 8, bot = vt + vh - 8;
    var fr = f.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (f.tagName === "TEXTAREA") {
      /* 원래 높이일 때의 '칸 위 ~ 단추 아래'가 보이는 자리보다 크면 그 차이만큼 칸을 줄인다 */
      var nat = f.__kbNat || fr.height, span = br.bottom - fr.top + (nat - fr.height), room = bot - top;
      if (span > room) {
        var cs = getComputedStyle(f), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
        var pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
        /* 들어가는 만큼만 줄인다 — 대부분의 폰에서는 3줄 넘게 남는다. 320×568·21px·자판 260 처럼 아주 좁으면
           한 줄까지 내려간다(커서 줄은 늘 보이고 칸 안에서 굴러간다). 단추가 자판 뒤로 가는 것보다 낫다 */
        var h = Math.max(Math.ceil(lh + pad), Math.floor(nat - (span - room)));
        if (h < nat - 1) {
          if (!f.__kbNat) { f.__kbSt = [f.style.height, f.style.minHeight]; f.__kbNat = nat; }
          f.style.minHeight = "0px";
          f.style.height = h + "px";
        } else kbSize(f);
      } else kbSize(f);
      fr = f.getBoundingClientRect(); br = b.getBoundingClientRect();
    }
    var lo = br.bottom - bot, hi = fr.top - top;
    /* 둘이 몇 px 차이로 안 들어가면(줄일 수 없는 한 줄 칸 + 두세 줄 안내 — 360×640·21px 의 별명 칸) 칸 위 여백을 8 → 2px 까지 양보한다.
       그래도 모자라면 내가 치는 칸이 먼저다 */
    if (lo > hi) hi = Math.min(lo, fr.top - (top - 6));
    var dy = lo > 0 ? Math.min(lo, hi) : (hi < 0 ? hi : 0);
    if (dy > 0) {
      var left = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      if (dy > left) kbRoom(window.scrollY + window.innerHeight + dy);
    }
    /* 반올림하면 단추가 보이는 화면 아래로 0.5px 남을 수 있다 — 내릴 때는 올림, 올릴 때는 내림 */
    if (Math.abs(dy) >= 0.5) window.scrollBy(0, dy > 0 ? Math.ceil(dy) : Math.floor(dy));
  }
  function kbQueue() { if (!KB.raf) KB.raf = (window.requestAnimationFrame || setTimeout)(kbFit); }
  /* f = 글칸, btnOf = 그 칸의 단추를 돌려주는 함수(다시 그려도 지금 단추를 찾게) */
  function kbBind(f, btnOf) {
    if (!f || f.__kb) return;
    f.__kb = true;
    kbBase();
    if (!kbBind.on) {
      kbBind.on = true;
      window.addEventListener("resize", function () { kbBase(); kbQueue(); });
    }
    f.addEventListener("focus", function () {
      kbBase();
      KB.f = f;
      KB.b = btnOf;
      var vv = window.visualViewport;
      if (vv && vv.addEventListener && KB.vv !== vv) { vv.addEventListener("resize", kbQueue); KB.vv = vv; }
      setTimeout(kbQueue, 60);
    });
    /* 글을 칠 때마다 — 크로뮴의 커서 따라가기가 화면을 굴린 뒤(다음 프레임)에 다시 맞춘다 */
    f.addEventListener("input", kbQueue);
    /* 되돌리기는 300ms 뒤 — 단추를 누르는 순간 글칸이 먼저 초점을 잃는다. 그때 바로 높이를 되돌리면 단추가
       그만큼 아래로 밀려, 손가락을 떼는 순간의 '누름'이 단추가 아니라 글칸에 떨어질 수 있다 */
    f.addEventListener("blur", function () {
      if (KB.f === f) KB.f = null;
      setTimeout(function () {
        if (KB.f !== f) kbSize(f);
        if (!KB.f) kbRoom(0);
      }, 300);
    });
  }

  /* 응답이 없으면 버튼이 잠긴 채 멈춘다 — 시간 제한을 둔다 */
  function timed(p) {
    return new Promise(function (resolve) {
      var done = false;
      var tm = setTimeout(function () { if (!done) { done = true; resolve({ ok: false, reason: "timeout" }); } }, TIMEOUT);
      p.then(function (v) { if (!done) { done = true; clearTimeout(tm); resolve(v); } },
             function () { if (!done) { done = true; clearTimeout(tm); resolve({ ok: false, reason: "network" }); } });
    });
  }

  /* ---------- 인증 (Supabase Auth) ---------- */
  function authFetch(path, o) {
    var c = cfg();
    if (!c) return Promise.resolve({ ok: false, reason: "not_configured" });
    o = o || {};
    var h = { "apikey": c.key, "Content-Type": "application/json" };
    if (o.bearer) h.Authorization = "Bearer " + o.bearer;
    var p = fetch(c.url + "/auth/v1/" + path, {
      method: o.method || "POST", headers: h,
      body: o.body ? JSON.stringify(o.body) : undefined
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null;
        try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
        return { ok: r.ok, status: r.status, body: j };
      });
    });
    return timed(p);
  }

  function pack(b) {
    return {
      at: b.access_token,
      rt: b.refresh_token || "",
      exp: b.expires_at ? b.expires_at * 1000 : Date.now() + (b.expires_in || 3600) * 1000
    };
  }
  function getS() { return lsGet(SKEY); }
  /* 로그인 열쇠(JWT)에 실린 이메일 — 이메일로 가입했거나 카카오에서 이메일 제공에 동의한 분. 없으면 빈 값.
     소식 메일 칸을 미리 채우는 데만 쓴다(서버에 따로 보내지 않는다) */
  function tokenEmail() {
    var s0 = getS();
    if (!s0 || !s0.at) return "";
    try {
      var p = String(s0.at).split(".")[1].split("-").join("+").split("_").join("/");
      while (p.length % 4) p += "=";
      var j = JSON.parse(decodeURIComponent(escape(atob(p))));
      return typeof j.email === "string" ? j.email : "";
    } catch (e) { return ""; }
  }
  function setS(b) { lsSet(SKEY, pack(b)); }
  function clearS() { lsDel(SKEY); }

  var refreshing = null;
  /* 쓸 수 있는 열쇠. 곧 만료되면 새로 받는다. 없으면 null */
  function token() {
    var s = getS();
    if (!s || !s.at) return Promise.resolve(null);
    if (s.exp - Date.now() > 60000) return Promise.resolve(s.at);
    if (!s.rt) { clearS(); return Promise.resolve(null); }
    if (!refreshing) {
      refreshing = authFetch("token?grant_type=refresh_token", { body: { refresh_token: s.rt } })
        .then(function (r) {
          refreshing = null;
          if (r.ok && r.body && r.body.access_token) { setS(r.body); return r.body.access_token; }
          /* 열쇠가 죽은 경우에만 지운다. 잠깐 끊긴 것이면 다음에 다시 해 본다 */
          if (r.status === 400 || r.status === 401 || r.status === 403) clearS();
          return null;
        });
    }
    return refreshing;
  }

  /* 서버 함수 — 로그인했으면 그 열쇠로, 아니면 공개 키로 */
  function rpc(name, body, needAuth) {
    var c = cfg();
    if (!c) return Promise.resolve({ ok: false, reason: "not_configured" });
    return token().then(function (at) {
      if (needAuth && !at) return { ok: false, reason: "not_logged_in" };
      var p = fetch(c.url + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: { "apikey": c.key, "Authorization": "Bearer " + (at || c.key), "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
      }).then(function (r) {
        if (r.status === 401 && at) { clearS(); return { ok: false, reason: "expired" }; }
        /* 글·댓글을 쓰고 고치고 지웠으면 내 정보에 받아 둔 목록은 낡았다 — 다음에 열 때 다시 받는다 */
        if (/^(comment_(write|delete)|board_(write|edit|delete))$/.test(name)) ME.data = null;
        if (r.status === 404) return { ok: false, reason: "not_ready" };
        if (!r.ok) return { ok: false, reason: "server", status: r.status };
        return r.json().then(function (j) {
          if (Array.isArray(j)) j = j[0];
          return (j && typeof j === "object") ? j : { ok: false, reason: "parse" };
        }, function () { return { ok: false, reason: "parse" }; });
      });
      return timed(p);
    });
  }

  /* PKCE — 무작위 검증값을 이 기기에 두고, 그 해시만 밖으로 보낸다 */
  function b64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    /* split/join 으로 바꾼다 — build.py 의 축소기가 정규식 안의 '//' 를 주석으로 읽어 잘랐다 */
    return btoa(s).split("+").join("-").split("/").join("_").replace(/=+$/, "");
  }
  function pkce(purpose) {
    var raw = new Uint8Array(48);
    (window.crypto || window.msCrypto).getRandomValues(raw);
    var v = b64url(raw);
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
      return Promise.resolve({ c: v, m: "plain", v: v, p: purpose });
    }
    return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)).then(function (d) {
      return { c: b64url(new Uint8Array(d)), m: "s256", v: v, p: purpose };
    });
  }
  /* 검증값은 서버가 요청을 받아 준 뒤에만 이 기기에 둔다. 먼저 두면 실패한 시도·다른 시도가
     칸 하나를 덮어, 정작 도착한 메일의 링크가 이어지지 않는다(검토 지적). */
  function keep(ch) { lsSet(PKEY, { v: ch.v, p: ch.p, at: Date.now() }); }

  /* 지금 주소의 공연 코드(?e=) — 공연장에서 QR 로 들어와 로그인하러 떠나도 같은 공연으로 돌아오게 */
  function gigCode() {
    try { return new URLSearchParams(location.search).get("e") || ""; } catch (e) { return ""; }
  }
  /* 돌아올 곳 = 지금 보고 있는 페이지 + 무엇을 하다 왔는지(bd=signup|recover|kakao).
     라이브는 /community(깨끗한 주소), 로컬 검사는 /community.html.
     Supabase Redirect URLs 에 https://insooni.com/** 가 있어 어느 페이지로든 돌아온다. */
  function returnURL(purpose) {
    var e = gigCode();
    /* 운영 주소에서는 처음부터 깨끗한 경로로 — .html → 깨끗한 주소 307 한 번을 덜 탄다(객석의 느린 회선).
       로컬 검사 서버는 깨끗한 경로를 모르므로 그대로 둔다 */
    var path = /(^|\.)insooni\.com$/.test(location.hostname) ? normPath(location.pathname) : location.pathname;
    return location.origin + path + "?" + (e ? "e=" + encodeURIComponent(e) + "&" : "") + "bd=" + purpose;
  }
  /* 떠나기 직전의 자리. 돌아와서 주소(?·#)와 스크롤을 그대로 되돌린다 — 로그인하고 나니
     다른 데로 가 있으면 어르신은 '하던 일'을 잃는다. 일회용 코드·오류 표시는 빼고 둔다. */
  function saveRet() {
    var q = "";
    try {
      var sp = new URLSearchParams(location.search);
      ["code", "bd", "error", "error_code", "error_description", "token_hash", "type"].forEach(function (k) { sp["delete"](k); });
      q = sp.toString();
    } catch (e) {}
    lsSet(RKEY, { path: normPath(location.pathname), search: q ? "?" + q : "", hash: location.hash || "",
                  y: Math.round(window.scrollY || 0), at: Date.now() });
  }

  function authWhy(r) {
    if (!r || r.reason === "timeout" || r.reason === "network") return "network";
    if (r.reason === "not_configured") return "not_configured";
    var b = r.body || {};
    var code = String(b.error_code || b.code || b.error || "");
    var msg = String(b.msg || b.message || b.error_description || "");
    if (code === "invalid_credentials" || /invalid login credentials/i.test(msg) || code === "invalid_grant") return "bad_login";
    if (code === "email_not_confirmed" || /not confirmed/i.test(msg)) return "not_confirmed";
    if (code === "weak_password" || /password should|at least/i.test(msg)) return "weak_pw";
    if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || r.status === 429) return "mail_limit";
    if (code === "signup_disabled" || code === "email_provider_disabled" || /signups? not allowed/i.test(msg)) return "signup_off";
    if (code === "user_already_exists" || /already registered/i.test(msg)) return "exists";
    if (code === "email_address_invalid" || code === "validation_failed" || /invalid.*email|email.*invalid/i.test(msg)) return "bad_email";
    if (code === "same_password") return "same_pw";
    return "auth_fail";
  }

  /* 주소창을 고치고(코드 지우기) 라우터에게 알린다 — 라우터는 '지금 페이지'를 주소로 기억한다 */
  function setURL(u) {
    try { history.replaceState(null, "", u); } catch (e) {}
    if (window.INSOONI_ROUTER && window.INSOONI_ROUTER.sync) window.INSOONI_ROUTER.sync();
  }
  /* 돌아온 뒤 갈 주소. 떠날 때 둔 자리가 이 페이지 것이고 30분 안이면 그 자리로,
     아니면 지금 페이지(공연 코드만 남김)로 */
  function backURL() {
    var r = lsGet(RKEY), e = gigCode();
    if (r && samePath(r.path, location.pathname) && Date.now() - (r.at || 0) < NEXT_TTL) {
      /* 경로는 지금 문서의 것을 쓴다(같은 페이지다) — 로컬 서버는 깨끗한 경로를 모른다 */
      return { url: location.pathname + (r.search || "") + (r.hash || ""), y: typeof r.y === "number" ? r.y : null };
    }
    return { url: location.pathname + (e ? "?e=" + encodeURIComponent(e) : ""), y: null };
  }

  var Auth = {
    settings: function () {
      return authFetch("settings", { method: "GET" }).then(function (r) {
        if (!r.ok || !r.body) return { ok: false };
        var ext = r.body.external || {};
        /* 카카오는 서버가 켜 둔 것만으로 '된다'고 보지 않는다 — config.kakao === true(kakaoOn)일 때만.
           스위치의 뜻을 하나로 둔다: 정의하지 않으면 꺼짐(KOE205, 2026-10-02). */
        var kk = !!ext.kakao && kakaoOn();
        return { ok: true, kakao: kk, email: !!ext.email, signup: !r.body.disable_signup };
      });
    },
    signIn: function (email, pw) {
      return authFetch("token?grant_type=password", { body: { email: email, password: pw } }).then(function (r) {
        if (r.ok && r.body && r.body.access_token) { setS(r.body); return { ok: true }; }
        return { ok: false, reason: authWhy(r) };
      });
    },
    signUp: function (email, pw) {
      var ch;
      saveRet();
      return pkce("signup").then(function (x) {
        ch = x;
        return authFetch("signup?redirect_to=" + encodeURIComponent(returnURL("signup")), {
          body: { email: email, password: pw, code_challenge: ch.c, code_challenge_method: ch.m }
        });
      }).then(function (r) {
        if (r.ok && r.body && r.body.access_token) { setS(r.body); return { ok: true, session: true }; }
        /* 확인 메일을 보냈다. 이미 가입된 주소여도 서버는 같은 답을 준다 — 가입 여부를 알려 주지 않기 위해서 */
        if (r.ok) { keep(ch); return { ok: true, confirm: true }; }
        return { ok: false, reason: authWhy(r) };
      });
    },
    recover: function (email) {
      var ch;
      saveRet();
      return pkce("recover").then(function (x) {
        ch = x;
        return authFetch("recover?redirect_to=" + encodeURIComponent(returnURL("recover")), {
          body: { email: email, code_challenge: ch.c, code_challenge_method: ch.m }
        });
      }).then(function (r) {
        if (r.ok) { keep(ch); return { ok: true }; }
        return { ok: false, reason: authWhy(r) };
      });
    },
    kakao: function () {
      var c = cfg();
      if (!c) return Promise.resolve({ ok: false, reason: "not_configured" });
      return pkce("kakao").then(function (ch) {
        keep(ch);
        saveRet();
        location.href = c.url + "/auth/v1/authorize?provider=kakao&redirect_to=" + encodeURIComponent(returnURL("kakao")) +
          "&code_challenge=" + encodeURIComponent(ch.c) + "&code_challenge_method=" + ch.m;
        return { ok: true };
      });
    },
    setPassword: function (pw) {
      return token().then(function (at) {
        if (!at) return { ok: false, reason: "not_logged_in" };
        return authFetch("user", { method: "PUT", bearer: at, body: { password: pw } }).then(function (r) {
          return r.ok ? { ok: true } : { ok: false, reason: authWhy(r) };
        });
      });
    },
    signOut: function () {
      var s = getS();
      clearS();
      if (s && s.at) authFetch("logout", { bearer: s.at });   /* 서버 쪽 세션도 끊는다 — 답은 기다리지 않는다 */
      return Promise.resolve({ ok: true });
    },
    /* 카카오·메일 링크에서 돌아왔을 때 — 주소의 일회용 코드를 세션으로 바꾼다 */
    callback: function () {
      var q, hq;
      try {
        q = new URLSearchParams(location.search);
        hq = new URLSearchParams(location.hash.replace(/^#/, ""));
      } catch (e) { return Promise.resolve(null); }
      var code = q.get("code");
      var th = q.get("token_hash"), ttype = q.get("type") || "";
      var purpose = q.get("bd") || "";
      var errc = q.get("error_code") || hq.get("error_code") || "";
      var errk = q.get("error") || hq.get("error") || "";
      var err = q.get("error_description") || errk || hq.get("error_description");
      var at = hq.get("access_token");
      if (!code && !err && !at && !th) return Promise.resolve(null);
      /* 주소창에 코드·열쇠를 남기지 않는다(뒤로 가기·공유로 새지 않게). 떠나기 전 자리로 되돌린다 */
      var back = backURL();
      setURL(back.url);
      if (err) {
        /* 카카오는 '취소'와 '오류'를 갈라 말한다 — '링크가 만료됐다'는 카카오를 취소한 사람에게 틀린 말이었다 */
        if (purpose === "kakao") {
          lsDel(PKEY);
          var cancel = errk === "access_denied" || errc === "access_denied" || /cancel|denied/i.test(err);
          return Promise.resolve({ kind: "error", reason: cancel ? "kakao_cancel" : "kakao_fail", purpose: purpose, y: back.y });
        }
        var old = /otp_expired|access_denied|flow_state/.test(errc) || /expired|invalid/i.test(err);
        return Promise.resolve({ kind: "error", reason: old ? "link_expired" : "auth_fail", purpose: purpose, y: back.y });
      }
      if (th) {
        /* 메일 양식이 token_hash 를 싣는 경우(설정 안내 5번) — 어느 브라우저에서 열어도 이어진다.
           폰에서는 메일 링크가 메일 앱 안의 브라우저로 열리는 일이 흔하다 */
        var vt = ttype === "recovery" ? "recovery" : (ttype || "email");
        var pur = vt === "recovery" ? "recover" : "signup";
        return authFetch("verify", { body: { type: vt, token_hash: th } }).then(function (r) {
          if (r.ok && r.body && r.body.access_token) { setS(r.body); return { kind: "login", purpose: pur, y: back.y }; }
          var w = authWhy(r);
          return { kind: "error", reason: w === "auth_fail" ? "link_expired" : w, purpose: pur, y: back.y };
        });
      }
      if (at) {
        /* 사이트는 이 방식을 쓰지 않는다(모두 PKCE). 남이 만든 링크로 지금 세션이 바뀌지 않게,
           이미 들어와 있으면 무시하고, 아니면 서버에 진짜 열쇠인지 물어본 뒤에만 받는다(검토 지적). */
        if (getS()) return Promise.resolve(null);
        return authFetch("user", { method: "GET", bearer: at }).then(function (r) {
          if (!r.ok || !r.body || !r.body.id) return { kind: "error", reason: "link_expired", purpose: purpose, y: back.y };
          setS({ access_token: at, refresh_token: hq.get("refresh_token"), expires_in: +hq.get("expires_in") || 3600 });
          return { kind: "login", purpose: hq.get("type") === "recovery" ? "recover" : "login", y: back.y };
        });
      }
      var p = lsGet(PKEY);
      if (!p || !p.v || Date.now() - (p.at || 0) > 86400e3) {
        /* 다른 기기·다른 브라우저(메일 앱 안 등)에서 링크를 열었다 */
        return Promise.resolve({ kind: "noverifier", purpose: purpose || "", y: back.y });
      }
      return authFetch("token?grant_type=pkce", { body: { auth_code: code, code_verifier: p.v } }).then(function (r) {
        if (r.ok && r.body && r.body.access_token) { lsDel(PKEY); setS(r.body); return { kind: "login", purpose: p.p, y: back.y }; }
        var w = authWhy(r);
        return { kind: "error", reason: w === "auth_fail" ? "link_expired" : w, purpose: purpose || p.p, y: back.y };
      });
    }
  };

  /* 카카오로 떠났다가 코드 없이 돌아왔는가 — KOE205(카카오 동의항목 설정 오류)가 나면 카카오 화면에서
     막혀 우리에게 돌아올 길이 없다. 사람들은 '뒤로 가기'를 누르거나, 인앱 창을 닫고 QR 을 다시 찍는다.
     어느 길이든 이 문서가 열릴 때 카카오 검증값이 10분 안에 저장돼 있고 주소에 코드·오류가 없으면
     왕복이 끝나지 못한 것이다(끝났다면 callback 이 검증값을 지웠다). 그때 회원 창을 다시 열고 무슨 일이
     있었는지 말한다. 예전에는 '뒤로 가기'만 봤다 — QR 을 다시 찍은 사람에게는 아무 안내가 없었다(검토 32번).
     검증값은 지운다(한 번만 말한다).
     '10분 동안 카카오를 내린다'(markKakaoFail)는 걸지 않는다 — KOE 가 고쳐진 지금(10/02 밤) 이 길로 돌아오는 사람은
     대부분 동의 화면에서 망설이다 뒤로 간 사람이다. 그 사람에게 '저희 설정 문제'라고 단정하고 노란 단추를 내리면
     공연장에서 사실상 막힌 이메일 길로 보내게 된다(검토 3바퀴 35번). 내림은 카카오가 오류(error)를 돌려보낸 때만 */
  function kakaoCameBack() {
    var p = lsGet(PKEY);
    if (!p || p.p !== "kakao" || Date.now() - (p.at || 0) > KAKAO_BACK_TTL) return false;
    try {
      var q = new URLSearchParams(location.search);
      if (q.get("code") || q.get("error") || q.get("error_code") || q.get("token_hash")) return false;
    } catch (e) { return false; }
    if (/(^#|&)(access_token|error)=/.test(location.hash)) return false;
    lsDel(PKEY);
    return true;
  }
  /* 10분 동안은 카카오를 맨 위 노란 단추로 다시 권하지 않는다 — 설정 문제(KOE205)라면 누를 때마다
     같은 오류가 되풀이된다(검토 29·32번). 이메일이 앞으로 오고 카카오는 아래 테두리 단추로 내려간다 */
  function markKakaoFail() { ssSet(KFKEY, Date.now()); }
  function kakaoFailRecent() { var v = ssGet(KFKEY); return typeof v === "number" && Date.now() - v < KAKAO_BACK_TTL; }

  /* ---------- 서버 말을 사람 말로 ---------- */
  function why(reason) {
    switch (reason) {
      case "network": case "timeout": return t("bd.e.net", "지금 연결이 원활하지 않습니다. 잠시 뒤 다시 시도해 주세요.");
      case "not_logged_in": case "expired": return t("bd.e.login", "로그인이 끝났습니다. 다시 들어와 주세요.");
      case "not_member": return t("bd.e.join", "가입을 마쳐야 글을 쓸 수 있습니다.");
      case "blocked": return t("bd.e.blocked", "지금은 글을 쓸 수 없습니다. 운영자에게 문의해 주세요.");
      case "title_empty": return t("bd.e.title", "제목을 두 글자 이상 적어 주세요.");
      case "title_long": return t("bd.e.titleLong", "제목은 60자까지 쓸 수 있습니다.");
      case "empty": return t("bd.e.empty", "내용을 적어 주세요.");
      case "too_long": return t("bd.e.long", "글이 너무 깁니다. 조금 줄여 주세요.");
      case "rate_limited": return t("bd.e.rate", "잠시 뒤에 다시 올려 주세요. 짧은 시간에 너무 많이 올렸습니다.");
      case "not_found": return t("bd.e.gone", "이 글은 지워졌거나 아직 공개되지 않았습니다.");
      case "bad_nick_len": return t("bd.e.nickLen", "별명은 2~12자로 정해 주세요.");
      case "bad_nick_char": return t("bd.e.nickChar", "별명에는 한글·영문·숫자와 띄어쓰기, _ . - 만 쓸 수 있습니다.");
      case "reserved_nick": return t("bd.e.nickRes", "이 별명은 쓸 수 없습니다. '인순이'·'운영자'처럼 오해를 부르는 이름은 막혀 있습니다.");
      case "nick_taken": return t("bd.e.nickTaken", "이미 쓰고 있는 별명입니다. 다른 별명을 골라 주세요.");
      /* 한 번에 끝나는 행동으로 — 어느 칸이 빠졌는지 찾게 하지 않는다(검토 4바퀴 21번) */
      case "need_agree": return t("bd.e.agree", "위의 '모두 동의합니다'를 눌러 주세요.");
      case "need_age": return t("bd.e.age", "만 14세 이상만 가입할 수 있습니다.");
      case "admin_cannot_leave": return t("bd.e.adminLeave", "운영자 계정은 여기서 탈퇴할 수 없습니다.");
      case "not_ready": return t("bd.e.ready", "회원 기능을 준비하고 있습니다. 조금만 기다려 주세요.");
      case "bad_login": return t("bd.e.badLogin", "이메일 또는 비밀번호가 맞지 않습니다.");
      case "not_confirmed": return t("bd.e.confirm", "아직 메일 확인 전입니다. 받은 메일의 링크를 먼저 눌러 주세요.");
      case "weak_pw": return t("bd.e.weak", "비밀번호는 8자 이상으로 정해 주세요.");
      /* 카카오를 권하는 말은 카카오 단추가 실제로 있을 때만 — 없는 단추를 가리키면 막다른 길이다(검토 26·49번) */
      case "mail_limit": return kakaoReady() ? t("bd.e.mailKakao", "지금은 메일을 보낼 수 없습니다(잠시 너무 많이 보냈습니다). 조금 뒤 다시 시도하시거나 카카오로 시작해 주세요.")
                                             : t("bd.e.mail", "지금은 메일을 보낼 수 없습니다(잠시 너무 많이 보냈습니다). 조금 뒤 다시 시도해 주세요.");
      case "signup_off": return t("bd.e.signupOff", "지금은 이 방법으로 가입을 받지 않습니다.");
      case "exists": return t("bd.e.exists", "이미 가입된 이메일입니다. 로그인해 주세요.");
      case "bad_email": return t("bd.e.email", "이메일 주소를 다시 확인해 주세요.");
      case "same_pw": return t("bd.e.samePw", "지금 비밀번호와 다른 비밀번호를 정해 주세요.");
      case "pw_mismatch": return t("bd.e.pwMatch", "두 비밀번호가 서로 다릅니다.");
      case "link_expired": return t("bd.e.linkOld", "링크가 만료됐거나 이미 쓰였습니다. 다시 받아 주세요.");
      case "kakao_cancel": return t("bd.kakaoCancel", "카카오 로그인을 취소하셨습니다. 다시 하시거나 이메일로 시작해 주세요.");
      case "kakao_fail": return t("bd.kakaoFail", "카카오 로그인이 지금 되지 않습니다(저희 설정 문제입니다). 아래 이메일로 가입하거나 로그인해 주세요.");
      /* 코드 없이 돌아왔다 — 원인을 단정하지 않는다(망설이다 뒤로 간 사람이 대부분이다) */
      case "kakao_back": return t("bd.kakaoBack", "카카오 로그인이 끝나지 않았습니다. 카카오 화면에 KOE로 시작하는 오류가 보였다면 저희 설정 문제입니다. 다시 해 보시거나 이메일로 시작해 주세요.");
      default: return t("bd.e.fail", "지금 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    }
  }

  /* ---------- 날짜(한국 시각) ----------
     방문자의 기기 시계가 어느 나라에 맞춰져 있어도 같은 날짜가 보여야 한다(미국 사는 딸의 폰).
     한국은 서머타임이 없어 늘 UTC+9 다 — Intl timeZone "Asia/Seoul" 과 같은 결과를, 오래된
     인앱 브라우저에서도 똑같이 내도록 고정 오프셋으로 계산한다. 숫자만 쓰므로 ko·en 이 같다. */
  function kst(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    var k = new Date(d.getTime() + 9 * 3600e3);
    function p2(n) { return ("0" + n).slice(-2); }
    return { y: k.getUTCFullYear(), m: p2(k.getUTCMonth() + 1), d: p2(k.getUTCDate()),
             hh: p2(k.getUTCHours()), mi: p2(k.getUTCMinutes()) };
  }
  function when(iso) {
    var a = kst(iso), n = kst(new Date().toISOString());
    if (!a) return "";
    if (a.y === n.y && a.m === n.m && a.d === n.d) return a.hh + ":" + a.mi;
    if (a.y === n.y) return a.m + "." + a.d;
    return a.y + "." + a.m + "." + a.d;
  }
  function stampTime(iso) {
    var a = kst(iso);
    return a ? a.y + "." + a.m + "." + a.d + " " + a.hh + ":" + a.mi : "";
  }
  function timeEl(iso, text) {
    var n = el("time", "bd-when", text);
    if (iso) n.setAttribute("datetime", iso);
    return n;
  }

  function levelName(level, staff) {
    var k = staff ? "staff" : level;
    return k === "staff" ? t("bd.lv.staff", "운영자")
         : k === "member" ? t("bd.lv.member", "정회원")
         : k === "blocked" ? t("bd.lv.blocked", "쉬는 중")
         : t("bd.lv.sprout", "새싹");
  }
  function badge(level, staff) {
    var k = staff ? "staff" : level;
    return el("span", "bd-badge bd-badge--" + k, levelName(level, staff));
  }
  function author(nick, level, staff) {
    var w = el("span", "bd-who-line");
    w.appendChild(el("span", "bd-nick", nick));
    w.appendChild(badge(level, staff));
    return w;
  }
  function dot() {
    var d = el("span", "bd-dot", " · ");
    d.setAttribute("aria-hidden", "true");
    return d;
  }
  function say(node, text, kind) {
    if (!node) return;
    node.textContent = text || "";
    node.classList.remove("is-ok", "is-bad");
    if (kind) node.classList.add(kind === "ok" ? "is-ok" : "is-bad");
  }

  /* ---------- 상태 ---------- */
  var S = { me: null, settings: null, settingsP: null, ready: true, open: false, loading: false, net: false,
            board: "all", rows: [], rowsBoard: null, more: false, editing: null, cdraft: {}, letters: null, view: "list",
            trail: null, flash: "", flashKind: "",
            mp: null,          /* 013 이 서버에 있는가 — null 모름 · true 있음 · false 없음(404) */
            songsP: null,      /* songs.json(103곡) — 처음 고를 때 한 번 받는다 */
            songNote: "", newsNote: "" };    /* 가입은 됐는데 고른 노래를 저장하지 못했다 — 인사 끝에 한 줄 붙인다 */
  var sec = null;     /* 지금 화면의 #board (라우터가 <main> 을 갈아끼우면 바뀐다) */
  var memberReady = false;
  var listeners = [];
  var readyResolve;
  var readyP = new Promise(function (r) { readyResolve = r; });

  function joined() { return !!(S.me && S.me.ok && S.me.joined); }
  /* 카카오 단추가 지금 실제로 그려지는가 — 스위치(config.kakao) · 서버 설정 · 방금 실패하지 않았음 */
  function kakaoReady() { return kakaoOn() && !!(S.settings && S.settings.ok && S.settings.kakao) && !kakaoFailRecent(); }
  function canWrite() { return joined() && S.me.level !== "blocked"; }
  /* 회원 게시판을 쓸 수 있는가 — config.js 스위치가 켜졌고 서버에 010 이 있다 */
  function live() { return S.open && S.ready; }

  function emit(type, data, extra) {
    listeners.slice().forEach(function (fn) { try { fn(type, data, S.me, extra); } catch (e) {} });
  }

  function loadMe() {
    if (!live()) { S.me = null; return Promise.resolve(null); }
    return token().then(function (at) {
      if (!at) { S.me = null; S.net = false; return null; }
      return rpc("member_me", {}, true).then(function (me) {
        if (me && me.reason === "not_ready") { S.ready = false; S.me = null; return null; }
        /* 열쇠는 있는데 서버에 닿지 못했다 — 로그아웃된 것처럼 보이면 거짓이다(H6) */
        S.net = !!(me && (me.reason === "network" || me.reason === "timeout" || me.reason === "server"));
        S.me = (me && me.ok) ? me : null;
        return S.me;
      });
    });
  }

  function prefetchSettings() {
    if (!boardOn() || S.settingsP) return S.settingsP;
    S.settingsP = Auth.settings().then(function (st) { S.settings = st; return st; });
    return S.settingsP;
  }

  /* ================================================================
     1. 헤더의 회원 입구 — 모든 페이지
     형님: "웹사이트에 로그인 하는 것도 회원가입도 없고 지금 엉망이야".
     입구가 사랑방 카페 안에만 있어 다른 페이지에서는 회원 기능이 '없는 것'처럼 보였다.
     v3 의 조용한 크롬(상자 없는 글자 단추)을 지키되, 어르신이 찾게 아이콘이 아니라 한글 글자로.
     PC: 헤더 오른쪽 도구 맨 앞. 폰·태블릿: 헤더(짧은 라벨) + 메뉴 패널 첫 블록(두 줄).
     ================================================================ */
  function hmState() {
    if (!boardOn() || !S.ready) return "H0";
    if (S.loading) return "H1";
    if (S.net && !S.me) return "H6";
    if (!S.me) return "H2";
    if (!S.me.joined) return "H3";
    if (S.me.level === "blocked") return "H5";
    return "H4";
  }
  function hmView(st) {
    return st === "H2" ? "start" : st === "H3" ? "join" : "me";
  }

  function injectHeader() {
    var tools = $(".site-header .header-tools") || $(".gig-head .header-tools");
    if (!tools || byId("hm")) return;
    var b = el("button", "hm");
    b.id = "hm";
    b.type = "button";
    b.setAttribute("aria-haspopup", "dialog");
    b.appendChild(el("span", "hm-long"));
    b.appendChild(el("span", "hm-short"));
    b.appendChild(el("span", "hm-tiny"));
    b.addEventListener("click", function () { openFromHM(b); });
    /* 누르기 전에 미리 — 마우스를 올리거나 손가락이 닿는 순간 설정을 받아 두면 창이 바로 뜬다.
       로그아웃한 방문자는 누르기 전까지 서버에 아무것도 묻지 않는다(첫 화면을 가볍게) */
    ["pointerenter", "touchstart", "focus"].forEach(function (ev) {
      b.addEventListener(ev, prefetchSettings, { passive: true });
    });
    tools.insertBefore(b, tools.firstChild);

    var nav = $(".site-header .main-nav");
    if (nav && !byId("nav-member")) {
      var nm = el("div", "nav-member");
      nm.id = "nav-member";
      var nb = el("button", "nav-member-b");
      nb.type = "button";
      nb.setAttribute("aria-haspopup", "dialog");
      nb.appendChild(el("span", "nm-1"));
      nb.appendChild(el("span", "nm-2"));
      nb.addEventListener("click", function () {
        /* 메뉴 패널을 먼저 닫는다 — main.js 의 닫기 길(스크롤 복원·잠금 해제)을 그대로 탄다.
           그다음 창을 열면 닫을 때 초점이 헤더 입구로 돌아온다 */
        var tg = $(".site-header .nav-toggle");
        if (nav.classList.contains("open") && tg) tg.click();
        openFromHM(byId("hm") || nb);
      });
      nb.addEventListener("touchstart", prefetchSettings, { passive: true });
      nm.appendChild(nb);
      nav.insertBefore(nm, nav.firstChild);
      /* 아주 좁은 폰(≤359px)에서는 헤더의 EN 단추가 자리를 잃는다 — 메뉴 패널 맨 아래 줄로 옮겨 둔다.
         main.js 가 .lang-toggle 를 문서 단위로 받으므로 클래스만 같으면 같은 단추다 */
      var lg = el("button", "nav-lang lang-toggle", isEN() ? "한국어" : "English");
      lg.type = "button";
      lg.setAttribute("lang", isEN() ? "ko" : "en");
      lg.setAttribute("aria-label", isEN() ? "한국어로 보기" : "View in English");
      nav.appendChild(lg);
    }
    var tg2 = $(".site-header .nav-toggle");
    if (tg2) tg2.addEventListener("touchstart", prefetchSettings, { passive: true });

    /* 헤더 아래 알림(로그인하고 돌아왔을 때 '어서 오세요'). 비어 있는 채로 미리 둬야
       화면낭독기가 내용이 바뀌는 순간을 읽는다 */
    if (!byId("hm-toast")) {
      var ts = el("p");
      ts.id = "hm-toast";
      ts.setAttribute("role", "status");
      ts.addEventListener("click", function () { ts.textContent = ""; });
      document.body.appendChild(ts);
    }

    if (window.ResizeObserver) {
      /* 헤더 폭이 바뀌거나(창 크기) 가운데 내비 폭이 바뀌면(글자 크기·서체 도착) 다시 잰다 */
      var ro = new ResizeObserver(function () { fitHM(); });
      var hi = $(".site-header .header-inner"), nu = $(".site-header .main-nav ul"), bd = $(".site-header .brand");
      if (hi) ro.observe(hi);
      if (nu) ro.observe(nu);
      /* 홈 도입부 동안 상표가 크다(320×21 에서 141px) — 도입부가 끝나 상표가 줄면 다시 잰다(EN 을 괜히 숨겨 두지 않게) */
      if (bd) ro.observe(bd);
    } else {
      window.addEventListener("resize", fitHM);
    }
    /* [가] 를 누르면 글자가 커져 헤더가 좁아진다 — 다 그린 뒤 다시 잰다 */
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".fs-toggle")) requestAnimationFrame(fitHM);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHM);
  }

  function openFromHM(from) {
    var st = hmState();
    if (st === "H1") {
      /* 열쇠는 있는데 아직 '누구인지' 답을 기다린다 — 답이 오면 그 상태로 연다 */
      readyP.then(function () { if (hmState() !== "H1") openFromHM(from); });
      return;
    }
    /* 회원(H4·H5)과 연결이 끊긴 회원(H6)은 창이 아니라 내 정보 화면으로 — 별명·등급·내가 쓴 글·댓글·도장·노래·
       별명 바꾸기·로그아웃·탈퇴가 한곳에 있다. 예전 '내 정보' 창은 이 화면으로 대체했다(같은 일을 두 곳에 두지 않는다) */
    if (st === "H4" || st === "H5" || st === "H6") { goMe(); return; }
    openSheet(hmView(st), from);
  }
  /* 내 정보(community.html#me)로 — 사랑방이면 '#' 만 바꾸고, 다른 페이지면 라우터로(<main> 만 갈아끼움),
     공연 화면(따로 사는 문서)이면 새로 연다. 공연 화면에서 왔으면 내 정보 맨 위에 '← 공연 화면으로'를 둔다 */
  function goMe() {
    closeSheet();
    if (sec && document.body.contains(sec)) {
      if (location.hash === "#me") route(); else location.hash = "#me";
      return;
    }
    var href = "community.html#me";
    if (onLivePage()) {
      ssSet(MEFROM, { url: location.pathname + location.search, at: Date.now() });
      location.href = href;
      return;
    }
    if (!(window.INSOONI_ROUTER && window.INSOONI_ROUTER.go && window.INSOONI_ROUTER.go(href))) location.href = href;
  }

  function renderHM() {
    var b = byId("hm"), nm = byId("nav-member");
    var st = hmState();
    if (b) b.hidden = st === "H0";
    if (nm) nm.hidden = st === "H0";
    if (st === "H0") return;
    var me = S.me || {};
    var long = b ? $(".hm-long", b) : null, short = b ? $(".hm-short", b) : null, tiny = b ? $(".hm-tiny", b) : null;
    var meT = t("hm.me", "내 정보");
    var aria, n1, n2;
    if (long) long.textContent = "";
    if (st === "H2") {
      if (long) long.textContent = t("hm.in", "로그인 · 회원가입");
      /* 폰에도 '가입'이 보이게 — 형님 지적 "로그인도 회원가입도 없다"는 폰에서 그대로였다(검토 39번).
         상표와 8px 안으로 붙는 아주 좁은 폰·큰 글자에서만 '로그인'으로 내린다(fitHM) */
      if (short) short.textContent = t("hm.inShort2", "로그인·가입");
      if (tiny) tiny.textContent = t("hm.inShort", "로그인");
      aria = t("hm.inAria", "로그인 또는 회원가입");
      n1 = t("hm.in", "로그인 · 회원가입");
      n2 = kakaoOn() ? t("hm.nm2In", "카카오 또는 이메일로") : t("hm.nm2InMail", "이메일로 가입하고 들어옵니다");
    } else if (st === "H3") {
      if (long) long.textContent = t("hm.finish", "가입 마치기");
      if (short) short.textContent = meT;
      aria = t("hm.finish", "가입 마치기");
      n1 = t("hm.nm1Finish", "가입을 마쳐 주세요");
      n2 = t("hm.nm2Finish", "별명만 정하면 됩니다");
    } else if (st === "H4" || st === "H5") {
      if (long) {
        /* 한 줄 밑줄이 끊기지 않게 — 별명은 글자 흐름 그대로(말줄임은 여기서), 등급 앞은 공백 글자(검토 4바퀴 9번) */
        var nk = me.nickname || "";
        long.appendChild(el("span", "hm-nick", nk.length > 8 ? nk.slice(0, 7) + "…" : nk));
        if (st === "H4") { long.appendChild(document.createTextNode(" ")); long.appendChild(el("span", "hm-lv", levelName(me.level, me.admin))); }
        long.appendChild(document.createTextNode(" · " + meT));
      }
      if (short) short.textContent = meT;
      aria = fmt(t("hm.meAriaF", "{n}, {l} — 내 정보 열기"), { n: me.nickname || "", l: levelName(me.level, me.admin) });
      n1 = (me.nickname || "") + (st === "H4" ? " · " + levelName(me.level, me.admin) : "");
      n2 = t("hm.nm2Me", "내 정보 ›");
    } else {          /* H1 · H6 */
      if (long) long.textContent = meT;
      if (short) short.textContent = meT;
      aria = meT;
      n1 = meT;
      n2 = st === "H6" ? t("hm.nm2Net", "연결을 다시 확인합니다") : "";
    }
    if (tiny && st !== "H2") tiny.textContent = short ? short.textContent : meT;
    if (b) b.setAttribute("aria-label", aria);
    /* 회원은 창이 아니라 내 정보 화면으로 간다 — '대화상자를 엽니다'라고 읽히면 거짓 안내다 */
    var pop = st === "H2" || st === "H3";
    [b, nm && $(".nav-member-b", nm)].forEach(function (x) {
      if (!x) return;
      if (pop) x.setAttribute("aria-haspopup", "dialog"); else x.removeAttribute("aria-haspopup");
    });
    if (nm) {
      nm.classList.toggle("is-me", st === "H4" || st === "H5");
      $(".nm-1", nm).textContent = n1;
      $(".nm-2", nm).textContent = n2 || "";
      $(".nm-2", nm).hidden = !n2;
      $(".nav-member-b", nm).setAttribute("aria-label", aria);
    }
    fitHM();
  }

  /* 1081px 이상: 긴 라벨이 가운데 내비와 16px 안으로 붙으면 짧은 라벨로.
     1081×21px 에서 '로그인 · 회원가입'은 내비와 간격 0 으로 붙고, 1440×17px 에서는 넉넉했다(실측).
     1080px 이하: 짧은 라벨('로그인·가입')이 상표와 8px 안으로 붙으면 '로그인'으로(320·360 × 21px 실측) */
  function fitHM() {
    var b = byId("hm");
    if (!b || b.hidden) return;
    b.classList.remove("is-short");
    b.classList.remove("is-tiny");
    document.documentElement.classList.remove("hdr-tight");
    if (window.innerWidth < 1081) {
      var br = $(".site-header .brand") || $(".gig-head .gig-brand");
      if (!br || !br.getClientRects().length) return;
      if (b.getBoundingClientRect().left - br.getBoundingClientRect().right < 8) b.classList.add("is-tiny");
      /* 상표와는 떨어져 있어도 오른쪽 끝(☰)이 화면 밖일 수 있다 — 360×21px 에서 ☰ right 382.5(22.5px 밖),
         문서 가로 넘침은 0 이라 스크롤로도 닿지 않아 다른 페이지로 갈 수 없었다(검토 3바퀴 27번).
         ① '로그인'으로 줄이고 ② 그래도 넘치면 EN 을 메뉴 패널 맨 아래로 옮긴다(.hdr-tight) */
      if (toolsOver()) b.classList.add("is-tiny");
      if (toolsOver()) document.documentElement.classList.add("hdr-tight");
      return;
    }
    var ul = $(".site-header .main-nav ul");
    if (!ul) return;
    function gap() { return b.getBoundingClientRect().left - ul.getBoundingClientRect().right; }
    /* 긴 라벨 → 짧은 라벨('로그인·가입') → '로그인' 순으로 줄인다(1081×21 에서 '로그인·가입'도 10px 로 붙었다) */
    if (gap() < 16) b.classList.add("is-short");
    if (gap() < 16) { b.classList.remove("is-short"); b.classList.add("is-tiny"); }
  }
  /* 헤더 오른쪽 도구 중 가장 오른쪽 것(☰ 또는 공연 머리의 EN)이 화면 오른쪽 8px 안쪽에 들어오는가 */
  function toolsOver() {
    var tools = $(".site-header .header-tools") || $(".gig-head .header-tools");
    if (!tools) return false;
    var right = 0;
    Array.prototype.forEach.call(tools.children, function (n) {
      if (n.getClientRects().length) right = Math.max(right, n.getBoundingClientRect().right);
    });
    var hi = $(".site-header .header-inner") || $(".gig-head");
    return right > window.innerWidth - 8 || (!!hi && hi.scrollWidth > hi.clientWidth + 1);
  }

  var toastT = null;
  function toast(text) {
    var n = byId("hm-toast");
    if (!n) return;
    n.textContent = text;
    clearTimeout(toastT);
    toastT = setTimeout(function () { n.textContent = ""; }, 5000);
  }

  /* 로그인·가입을 마친 사람에게 — 사랑방이면 카페 안내 줄에, 다른 페이지면 헤더 아래 알림으로.
     공연 화면은 제 자리의 안내(gig.js)를 쓴다 */
  /* 가입은 됐는데 고른 노래를 저장하지 못했으면 인사 끝에 한 줄 — 조용히 버리지 않는다(가입은 그대로 유지된다) */
  function withSongNote(text) {
    if (S.newsNote) text += " " + S.newsNote;
    return S.songNote ? text + " " + S.songNote : text;
  }
  /* how = "join" 이면 방금 가입을 마쳤다 — 공연 화면이 '가입을 마쳤습니다'와 '로그인'을 가려 말한다 */
  function welcome(note, how) {
    var text = withSongNote(note || fmt(t("bd.welcomeF", "{n} 님, 어서 오세요."), { n: (S.me && S.me.nickname) || "" }));
    if (sec && document.body.contains(sec)) say(sq("#bd-msg"), text, "ok");
    else if (!onLivePage()) toast(text);
    emit("welcome", text, how || "");
  }

  /* 로그인 뒤 이어서 할 일 — 글쓰기를 누르고 로그인하러 갔던 사람을 다시 글쓰기로.
     어느 페이지에서 무엇을 하다 갔는지 함께 적는다. 다른 페이지에서 꺼내 쓰면 엉뚱한 일이 된다 */
  function setNext(o) {
    o.path = normPath(location.pathname);
    o.at = Date.now();
    lsSet(NKEY, o);
  }
  function continueNext(how) {
    var n = lsGet(NKEY);
    if (!n) return;
    if (!S.me) return;
    if ((n.path && !samePath(n.path, location.pathname)) || Date.now() - (n.at || 0) > NEXT_TTL) { lsDel(NKEY); return; }
    if (!S.me.joined) { openSheet("join", byId("hm")); return; }
    /* 내 정보를 열려다 로그인·가입하러 갔던 사람 — 내 정보로 */
    if (n.what === "me") {
      if (!sec) return;
      lsDel(NKEY);
      closeSheet();
      S.flash = withSongNote(how === "join"
        ? fmt(t("bd.joinedMeF", "{n} 님, 가입을 마쳤습니다."), { n: (S.me && S.me.nickname) || "" })
        : fmt(t("bd.welcomeF", "{n} 님, 어서 오세요."), { n: (S.me && S.me.nickname) || "" }));
      S.flashKind = "ok";
      go("#me");
      return;
    }
    if (n.what === "write" || n.what === "open") {
      if (!sec) return;
      lsDel(NKEY);
      closeSheet();
      /* welcome() 가 #bd-msg 에 쓴 인사는 곧이어 화면을 바꾸는 route() 가 지웠다 — 가입을 마치고도 아무 말 없이
         글쓰기 칸만 열렸다(검토 3바퀴 16번). 바뀐 화면이 그리도록 S.flash 로 넘긴다 */
      var nk = { n: (S.me && S.me.nickname) || "" };
      S.flash = withSongNote(how === "join"
        ? fmt(n.what === "write" ? t("bd.joinedF", "{n} 님, 가입을 마쳤습니다. 이어서 글을 써 주세요.") : t("bd.joinedOpenF", "{n} 님, 가입을 마쳤습니다. 이어서 댓글을 남겨 주세요."), nk)
        : fmt(n.what === "write" ? t("bd.backWriteF", "{n} 님, 어서 오세요. 이어서 글을 써 주세요.") : t("bd.backOpenF", "{n} 님, 어서 오세요. 이어서 댓글을 남겨 주세요."), nk));
      S.flashKind = "ok";
      if (n.what === "write") go("#write" + (n.board ? "=" + n.board : ""));
      if (n.what === "open" && n.id) go("#p" + n.id);
      return;
    }
    /* 도장·응원·투표(공연 화면) — gig.js 가 INSOONI_MEMBER.takeNext 로 꺼내 쓴다 */
    emit("next", n);
  }

  /* how = "join" — 방금 가입을 마쳤다(이어서 할 일 안내가 '가입을 마쳤습니다'로 시작한다) */
  function afterLogin(note, how) {
    return loadMe().then(function () {
      renderHM();
      emit("state");
      if (sec) { renderMenu(); renderNote(); route(); }
      if (!S.me) { openSheet("start", byId("hm"), why("auth_fail")); return; }
      lsSet(SEEN, 1);
      if (!S.me.joined) { openSheet("join", byId("hm"), note); return; }
      closeSheet();
      welcome(note, how);
      continueNext(how);
      S.songNote = "";
      S.newsNote = "";
    });
  }

  function handleCallback(cb) {
    if (!cb || !live()) return;
    var hm = byId("hm");
    /* 카카오로 다녀왔는데 마지막 열쇠 교환(token)이 실패했다 — 공연장 와이파이처럼 여러 사람이 IP 하나를 쓰면 429 가 날 수 있다.
       예전에는 이메일 사람의 말('메일을 보낼 수 없습니다'·'링크가 만료됐습니다 … 처음 가입을 같은 이메일로')이 떠서
       카카오로 들어온 관객이 메일 이야기를 들었다(검토 4바퀴 26번). 카카오 사람의 말로, 카카오 단추를 맨 위에 둔다.
       다른 브라우저로 돌아온 경우(검증값 없음 — 카카오톡이 바깥 브라우저로 넘긴 때)도 '메일 확인이 끝났습니다'가 아니다 */
    if (cb.purpose === "kakao" && ((cb.kind === "error" && /^(link_expired|mail_limit|auth_fail)$/.test(cb.reason || "")) || cb.kind === "noverifier")) {
      openSheet("start", hm, null, { alert: t("bd.kakaoTokenFail", "카카오 로그인을 마치지 못했습니다. 잠시 뒤 카카오로 다시 시작해 주세요."), kakaoFail: false });
      return;
    }
    if (cb.kind === "error" && cb.reason === "link_expired") {
      if (cb.purpose === "recover") openSheet("recover", hm, t("bd.linkOldRe", "링크가 만료됐거나 이미 쓰였습니다. 비밀번호 메일을 다시 받아 주세요."));
      else openSheet("start", hm, t("bd.linkOldUp", "링크가 만료됐거나 이미 쓰였습니다. 가입 확인 전이라면 '처음 가입'을 같은 이메일로 다시 누르면 확인 메일이 다시 갑니다."));
    } else if (cb.kind === "error" && (cb.reason === "kakao_cancel" || cb.reason === "kakao_fail")) {
      if (cb.reason === "kakao_fail") markKakaoFail();
      openSheet("start", hm, null, { alert: why(cb.reason), kakaoFail: cb.reason === "kakao_fail" });
    } else if (cb.kind === "error") {
      openSheet("start", hm, why(cb.reason));
    } else if (cb.kind === "noverifier" && cb.purpose === "recover") {
      /* 비밀번호를 잊은 사람에게 '로그인하세요'라고 하면 막다른 길이다 */
      openSheet("recover", hm, t("bd.otherBrowserRe", "이 링크는 비밀번호 메일을 요청한 브라우저에서 열어야 이어집니다. 메일 앱 안에서 열렸다면 여기서 다시 요청해 주세요."));
    } else if (cb.kind === "noverifier") {
      openSheet("start", hm, t("bd.confirmedElse", "메일 확인이 끝났습니다. 이메일과 비밀번호로 로그인해 주세요."));
    } else if (cb.purpose === "recover") {
      openSheet("newpw", hm);
    } else {
      afterLogin();
    }
  }

  var memberInit = false;
  function initMember() {
    if (memberInit) return;
    memberInit = true;
    /* 공연 화면(/live)은 공연 스위치(config.live)까지 켜져야 회원 입구를 연다 — 꺼져 있으면 '곧 열립니다'
       한 줄뿐인 화면이라 로그인 입구가 갈 곳이 없고, 서버에도 한 번도 묻지 않아야 한다(L1) */
    S.open = boardOn() && (!onLivePage() || liveOn());
    if (!S.open) {
      /* H0 — 헤더 입구도, 서버 호출도 없다. 카페는 닫힌 모양(편지만)으로 그린다 */
      memberReady = true;
      readyResolve(null);
      if (sec) cafeStart();
      return;
    }
    injectHeader();
    S.loading = !!(getS() && getS().at);
    renderHM();
    var came = kakaoCameBack();
    /* 사랑방에는 '글쓰기'가 첫 화면에 있다 — 누르면 바로 창이 뜨도록 미리 받아 둔다 */
    if (byId("board")) prefetchSettings();
    Auth.callback().then(function (cb) {
      if (cb) prefetchSettings();
      return loadMe().then(function () {
        S.loading = false;
        memberReady = true;
        renderHM();
        if (sec) cafeStart();
        if (cb && typeof cb.y === "number") window.scrollTo(0, cb.y);
        if (cb) lsDel(RKEY);
        readyResolve(cb);
        emit("state");
        if (came && !cb) openKakaoBack(byId("hm"));
        handleCallback(cb);
      });
    });
  }

  /* 카카오로 갔다가 뒤로 가기로 돌아오면(페이지가 캐시에서 되살아나면) 단추가 잠긴 채 남는다.
     KOE 화면에서 돌아온 것이면 무엇이 잘못됐는지 말한다 */
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    if (sheet) Array.prototype.forEach.call(sheet.querySelectorAll(".bd-kakao"), function (b) { b.disabled = false; });
    if (boardOn() && kakaoCameBack()) openKakaoBack(byId("hm") || opener);
  });
  /* 카카오에서 코드 없이 돌아온 사람에게 — 어디서든 노란 '카카오로 시작하기'를 맨 위 주 단추로 그대로 둔다.
     이 길로 돌아오는 사람은 대부분 동의 화면에서 망설이다 뒤로 간 사람이고, 실제로 되는 길은 카카오다.
     예전에는 사랑방이면 카카오를 이메일 양식 아래 '다시 해 보기'로 내렸다 — 375×812 에서 그 단추가 top 927(화면 밖)이었고,
     커스텀 SMTP 가 없는 지금 이메일은 시간당 몇 통뿐이라 사실상 막힌 길이었다(검토 4바퀴 5번).
     혹시 KOE 였을 때를 위해 이메일 '처음 가입'도 연다(공연장은 접힌 칸 안에). 카카오를 아래로 내리는 것은
     카카오가 오류(error)를 돌려준 때(handleCallback 의 kakao_fail)에만 남긴다 */
  function openKakaoBack(from) {
    openSheet("start", from, null, { alert: why("kakao_back"), kakaoFail: false, kakaoBack: true });
  }

  /* ================================================================
     2. 사랑방 카페 — #board 가 있는 문서에서만
     ================================================================ */
  function sq(s) { return sec ? sec.querySelector(s) : null; }

  /* 공지는 운영자만 쓴다. 인순이의 편지는 서버가 아니라 옛 원문(letters.json)에서 싣는다 —
     본인이 2005년에 쓴 글이라 회원 글과 섞지 않고, 고치거나 지울 수 없다. */
  var BOARDS = [
    { k: "all",     key: "bd.b.all",     ko: "전체글",        dkey: "bd.bd.all",     d: "모든 게시판의 새 글입니다." },
    { k: "notice",  key: "bd.b.notice",  ko: "공지",          dkey: "bd.bd.notice",  d: "운영진이 알려 드리는 소식입니다." },
    { k: "letters", key: "bd.b.letters", ko: "인순이의 편지", dkey: "bd.bd.letters", d: "2005년, 인순이가 팬들에게 직접 남긴 글입니다. 맞춤법도 띄어쓰기도 손대지 않았습니다." },
    { k: "hello",   key: "bd.b.hello",   ko: "가입인사",      dkey: "bd.bd.hello",   d: "새로 오신 분들의 첫인사입니다. 어디서 오셨는지, 어떤 노래를 좋아하시는지 들려주세요." },
    { k: "free",    key: "bd.b.free",    ko: "자유게시판",    dkey: "bd.bd.free",    d: "무엇이든 편하게 이야기 나누는 곳입니다." },
    { k: "review",  key: "bd.b.review",  ko: "공연·방송 후기", dkey: "bd.bd.review", d: "다녀오신 공연, 보신 방송의 기억을 남겨 주세요." }
  ];
  function boardOf(k) { for (var i = 0; i < BOARDS.length; i++) if (BOARDS[i].k === k) return BOARDS[i]; return BOARDS[0]; }
  function boardName(k) { var b = boardOf(k); return t(b.key, b.ko); }
  function writable() {
    var w = ["hello", "free", "review"];
    if (S.me && S.me.admin) w.unshift("notice");
    return w;
  }
  /* 폰은 첫 쪽을 10개로 — 느린 회선에서 첫 화면이 빨리 선다. 더 보기는 언제나 있다 */
  function pageSize() { return window.matchMedia && window.matchMedia("(max-width:720px)").matches ? 10 : 20; }
  function narrow() { return window.matchMedia && window.matchMedia("(max-width:720px)").matches; }

  /* ---------- 머리: 카페 숫자 · 새싹 안내 ---------- */
  function renderStat() {
    var n = byId("cafe-stat");
    if (!n) return;
    if (!live()) { n.hidden = true; return; }
    /* 숫자가 오기 전에 자리를 잡는다(보이지 않게) — 늦게 펼쳐지면 그 아래가 한 줄 밀려
       글쓰기·글 보기로 바로 들어온 화면 맨 위에 반쯤 잘린 줄이 걸렸다(검토 11번) */
    if (n.hidden) { n.textContent = "\u00a0"; n.classList.add("is-wait"); n.hidden = false; }
    rpc("cafe_info", {}).then(function (r) {
      if (!r || !r.ok) { n.hidden = true; n.classList.remove("is-wait"); return; }
      /* 실측값 그대로 — 0 이면 0 이라고 쓴다 */
      n.textContent = fmt(t("bd.statF", "회원 {m}명 · 글 {p}개"), { m: r.members, p: r.posts });
      n.classList.remove("is-wait");
      n.hidden = false;
    });
  }

  /* 새싹에게만 한 줄 — 정회원·운영자에게는 할 말이 없다(옛 3줄 배너는 걷었다) */
  function renderNote() {
    var n = byId("bd-note");
    if (!n) return;
    var me = S.me;
    if (!live() || !joined() || S.view !== "list" || me.admin || me.level === "member") { n.hidden = true; return; }
    if (me.level === "blocked") n.textContent = why("blocked");
    /* 운영자가 등급을 정한 새싹은 기준을 채워도 저절로 오르지 않는다 — 숫자를 보이면 거짓 약속이 된다 */
    else if (me.auto_up === false) n.textContent = t("bd.progStaffF", "새싹 회원 · 등급은 운영자가 정합니다");
    else {
      var np = Math.max(0, (me.need_posts || 0) - (me.posts_ok || 0));
      var nc = Math.max(0, (me.need_comments || 0) - (me.comments_ok || 0));
      n.textContent = fmt(t("bd.progF", "새싹 회원 · 정회원까지 글 {p}개 · 댓글 {c}개"), { p: np, c: nc });
    }
    n.hidden = false;
  }

  /* ---------- 공연 당일 줄 (config.live) ----------
     서버가 '지금 열린 공연'을 알려 줄 때만 머리 아래 한 줄. 숫자는 서버가 센 그대로(0 이면 빼고) */
  function renderToday() {
    var a = byId("cafe-today"), sl = byId("sl-live");
    if (!a) return;
    a.hidden = true;
    if (sl) sl.hidden = true;
    if (!liveOn() || !live()) return;
    rpc("gig_now", {}).then(function (r) {
      if (!r || !r.ok) return;
      var ev = r.event || r;
      var phase = r.phase || ev.phase;
      var code = ev.code;
      if (!code || (phase !== "open" && phase !== "after")) return;
      var ttl = (isEN() && ev.title_en) || ev.title_ko || ev.title || "";
      var venue = (isEN() && ev.venue_en) || ev.venue_ko || ev.venue || "";
      var k = kst(ev.starts_at), n = +(r.checkins != null ? r.checkins : (ev.checkins || 0));
      var d = k ? (isEN() ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+k.m - 1] + " " + (+k.d) : k.m + "." + k.d) : "";
      a.textContent = "";
      /* 도장 받는 중이면 도장이 아니라 응원·방명록으로 데려간다(검토 4바퀴 19번) — 공개 사랑방이 공연 코드를 건네며
         도장을 권하면 오지 않은 사람에게도 '다녀옴' 기록이 생기고 '도장 N명'에 집에서 찍은 사람이 섞인다.
         도장 입구는 공연장 QR 이다. 숫자는 '도장 N명' 그대로(출석을 단정하는 '다녀온 분 N명'은 쓰지 않는다) */
      a.href = "/live?e=" + encodeURIComponent(code) + (phase === "open" ? "#gig-cheers" : "");
      a.appendChild(el("span", "ct-1", n > 0
        ? fmt(t("bd.todayF", "오늘 공연 · {d} {v} · 도장 {n}명"), { d: d, v: venue || ttl, n: n })
        : fmt(t("bd.todayF0", "오늘 공연 · {d} {v}"), { d: d, v: venue || ttl })));
      a.appendChild(el("span", "ct-2", phase === "open"
        ? t("bd.todayOpenSee", "오늘 공연 응원·방명록 보기 →")
        : t("bd.todayAfter", "공연 방명록 보러 가기 →")));
      /* 글 보기·글쓰기·내 정보는 머리 아래로 맞춰 둔 화면이다 — 그 위에 이 줄이 늦게 생기면 보던 것이 줄 높이만큼
         밀려 내려간다(내 정보 375×812 실측 +86px). 화면 위로 지나간 자리에 생긴 줄이면 그만큼 따라 내린다 */
      var ref = sec && document.body.contains(sec) && S.view !== "list" && window.scrollY > 0 ? sec : null;
      var before = ref ? ref.getBoundingClientRect().top : 0;
      a.hidden = false;
      if (ref) {
        var dy = ref.getBoundingClientRect().top - before;
        if (dy) window.scrollBy(0, dy);
      }
      var sla = byId("sl-live-a");
      if (sl && sla && phase === "open") { sla.href = "/live?e=" + encodeURIComponent(code) + "#gig-vote"; sl.hidden = false; }
    });
  }

  /* ---------- 화면 고르기(주소창의 # 으로) ----------
     #b=free 게시판 · #p123 글 보기 · #l0 인순이의 편지 · #write(=board) 글쓰기 · #edit=123 고치기.
     주소에 담으니 폰의 '뒤로 가기'가 카페 안에서 그대로 통한다(글 → 목록). */
  function parseHash() {
    var h = (location.hash || "").replace(/^#/, "");
    var m;
    if ((m = /^p(\d+)$/.exec(h))) return { view: "post", id: +m[1] };
    if ((m = /^l(\d)$/.exec(h))) return { view: "letter", id: +m[1] };
    if ((m = /^edit=(\d+)$/.exec(h))) return { view: "write", edit: +m[1] };
    if ((m = /^write(?:=(\w+))?$/.exec(h))) return { view: "write", board: m[1] || null };
    if ((m = /^b=(\w+)$/.exec(h))) return { view: "list", board: m[1] };
    if (h === "me") return { view: "me" };
    return { view: "list", board: null };
  }
  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }
  function show(view) {
    S.view = view;
    sq("#cafe-list").hidden = view !== "list";
    sq("#cafe-post").hidden = view !== "post";
    sq("#bd-form").hidden = view !== "write";
    var mb = meBox();
    if (mb) mb.hidden = view !== "me";
    sec.classList.toggle("is-writing", view === "write");
    sec.classList.toggle("is-post", view === "post");
    sec.classList.toggle("is-me", view === "me");
    renderNote();
  }
  /* 글·편지를 열면 탭 줄 윗변을 헤더 바로 아래(＋8px)에 맞춘다 — 어느 게시판의 글인지가 늘 보이게.
     이미 그 근처(0~16px)에 있으면 움직이지 않는다(덜컹거림 방지) */
  /* 글자체가 늦게 도착하면(느린 회선) 맞춰 둔 자리 위의 줄 높이가 바뀌어 탭 줄·'← 쓰기 그만두기'가 헤더 밑으로
     몇 px 숨는다. 글자체가 다 오면 한 번 더 맞춘다 — 그사이 사람이 스크롤했으면 건드리지 않는다 */
  function alignAfterFonts() {
    var v = S.view, y = window.scrollY;
    if (!document.fonts || !document.fonts.ready || document.fonts.status === "loaded") return;
    document.fonts.ready.then(function () {
      if (S.view === v && sec && document.body.contains(sec) && Math.abs(window.scrollY - y) < 2) toMenu();
    });
  }
  function toMenu() {
    var m = sq(".cafe-menu"), hd = $(".site-header");
    /* 글쓰기 화면 — 안내(#bd-msg: '가입을 마쳤습니다'·'쓰시던 글을 불러왔습니다')가 있으면 그 줄부터. 없으면 '← 쓰기 그만두기' */
    var wm = sq("#bd-msg");
    var target = m && m.getClientRects().length && !sec.classList.contains("is-closed") && !sec.classList.contains("is-writing")
      ? m : (sec.classList.contains("is-writing") ? ((wm && wm.textContent ? wm : null) || sq("#bd-form-back") || sq("#bd-form"))
      /* 내 정보 — 안내(가입을 마쳤습니다 등)가 있으면 그 줄부터, 없으면 '← 사랑방 목록으로' */
      : sec.classList.contains("is-me") ? ((wm && wm.textContent ? wm : null) || meBox() || sec) : sec);
    if (!target) return;
    var hb = hd ? hd.getBoundingClientRect().bottom : 0;
    /* 자리는 transform 을 뺀 배치 위치로 잰다 — 섹션 등장 모션(main.js .rise: translateY 12px → 0, .7초)이 도는 중에
       재면 모션이 끝난 뒤 12px 위로 올라가 '← 쓰기 그만두기'가 헤더 밑으로 숨었다(V10 간헐 실패 d=4·5 의 원인, 검토 3바퀴 12번) */
    var top = layoutY(target) - window.scrollY;
    if (top >= hb && top <= hb + 16) return;
    window.scrollTo(0, Math.max(0, window.scrollY + top - hb - 8));
  }
  function layoutY(n) {
    var y = 0;
    for (var e = n; e; e = e.offsetParent) y += e.offsetTop;
    return y;
  }

  function route() {
    if (!sec || !document.body.contains(sec)) return;
    var r = parseHash();
    say(sq("#bd-msg"), S.flash || "", S.flashKind);
    S.flash = "";
    sec.classList.toggle("is-closed", !live());
    renderLede();
    /* 내 정보에서 연 글을 보고 돌아오는 길이 아니면 내 정보의 '돌아올 자리'는 버린다 */
    if (r.view !== "me" && r.view !== "post") ME.back = null;
    if (r.view === "me") {
      if (!live()) { go("#b=all"); return; }
      openMe();
      return;
    }
    if (r.view === "letter") { openLetter(r.id); return; }
    if (r.view === "post") {
      if (!live()) { go("#b=" + S.board); return; }
      openPost(r.id);
      return;
    }
    if (r.view === "write") {
      if (!live()) { go("#b=all"); return; }
      if (!S.me) { setNext({ what: "write", board: r.board || null }); go("#b=" + S.board); openSheet("start", sq("#bd-write-btn"), t("bd.needLogin", "글을 쓰려면 먼저 회원으로 들어와 주세요.")); return; }
      if (!S.me.joined) { setNext({ what: "write", board: r.board || null }); go("#b=" + S.board); openSheet("join", byId("hm")); return; }
      /* 차단 회원은 글쓰기 단추가 없다(renderMenu). 주소로 들어와도 조용히 목록으로 — 쓸 수 없다는
         문장은 머리(#bd-note)에 이미 한 번 있다. 같은 문장을 두 번 찍지 않는다(검토 5번) */
      if (S.me.level === "blocked") { go("#b=" + S.board); return; }
      if (r.edit) startEdit(r.edit); else openForm(null, r.board);
      return;
    }
    /* '#' 이 없는 주소 = 처음 연 목록(전체글). 뒤로 가기로 거기 돌아왔는데 직전에 본 글의 게시판이
       남아 있으면 엉뚱한 게시판이 열린다(글을 링크로 바로 열고 새로고침한 뒤 뒤로 가기에서 실측) */
    var b = r.board && boardOf(r.board).k === r.board ? r.board : "all";
    S.board = b;
    show("list");
    renderMenu();
    loadList(false);
    /* 글을 맡기고 돌아왔다 — 글쓰기 칸 아래쪽에 있던 스크롤 그대로면 '확인 뒤 올라갑니다' 안내가 화면 위로 숨는다 */
    if (S.afterPost) { S.afterPost = false; toMenu(); }
  }

  /* ---------- 탭 · 도구줄 ---------- */
  /* 탭의 '지금 여기' 표시만 바꾼다(지금 게시판 S.board 는 그대로) — 글을 보는 동안에도
     어느 게시판의 글인지 탭이 말하게. aria-current="true" — 페이지가 아니라 묶음 안의 위치다 */
  function markTab(k) {
    if (!sec) return;
    Array.prototype.forEach.call(sec.querySelectorAll(".cafe-menu a"), function (a) {
      if (a.getAttribute("data-b") === k) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  }
  function renderMenu() {
    if (!sec) return;
    markTab(S.board);
    var b = boardOf(S.board);
    sq("#cafe-board-h").textContent = t(b.key, b.ko);
    var d = sq("#cafe-board-d");
    d.textContent = live() ? t(b.dkey, b.d) : "";
    var w = sq("#bd-write-btn");
    /* 편지 게시판엔 쓸 수 없다. 공지는 운영자만 — 단추는 숨기되 자리는 남긴다(줄 높이 고정) */
    w.hidden = false;
    w.classList.toggle("is-off", !live() || S.board === "letters" || (S.board === "notice" && !(S.me && S.me.admin)) ||
      !!(S.me && S.me.joined && S.me.level === "blocked"));
  }

  /* ---------- 목록 ---------- */
  function rowsSig(rows) {
    return JSON.stringify((rows || []).map(function (x) { return [x.id, x.title, x.comments, x.nickname, x.level, x.board]; }));
  }
  function paintList() {
    var list = sq("#bd-list");
    list.textContent = "";
    S.rows.forEach(function (x) { list.appendChild(row(x, false)); });
  }
  function paintPins(notices) {
    var pins = sq("#bd-pins");
    pins.textContent = "";
    /* 공지 고정은 PC 3개, 폰은 최신 1개 — 폰 첫 화면에 회원 글이 서게(나머지는 공지 탭에 모두 있다) */
    (notices || []).slice(0, narrow() ? 1 : 3).forEach(function (n) { pins.appendChild(row(n, true)); });
    if (S.board === "all") {
      loadLetters().then(function (L) {
        if (L.length && S.board === "all" && !pins.querySelector("[data-id=letters]")) pins.appendChild(lettersPin());
      });
    }
  }

  function loadList(more) {
    var list = sq("#bd-list"), pins = sq("#bd-pins");
    var fail = sq("#bd-fail"), loading = sq("#bd-loading"), empty = sq("#bd-empty"), moreB = sq("#bd-more");
    fail.hidden = true;
    sq("#cafe-closed").hidden = true;
    sq("#cafe-features").hidden = true;
    if (!live()) { renderClosed(); return Promise.resolve(); }
    if (S.board === "letters") {
      pins.textContent = ""; sq("#bd-mine").hidden = true; moreB.hidden = true; loading.hidden = true;
      return loadLetters().then(function (L) {
        if (S.board !== "letters") return;
        list.textContent = "";
        L.forEach(function (l, i) { list.appendChild(letterRow(l, i)); });
        empty.hidden = L.length > 0;
        restoreBack();
        ssDel(BKEY);
        reloadBack();
      });
    }
    var want = S.board;
    var cached = !more && S.rowsBoard === want && S.rows.length > 0;
    if (!more) {
      if (cached) {
        /* 글에서 목록으로 돌아왔다 — 비우지 않고 아까 그린 것을 바로 다시 세운다. 비웠다 채우면
           페이지가 한 번 짧아졌다 길어지며 스크롤이 튀고, 어르신은 '내가 보던 줄'을 잃는다 */
        paintList();
        if (S.notices) paintPins(S.notices);
        empty.hidden = true;
        moreB.hidden = !S.more;
        restoreBack();
      } else {
        list.textContent = ""; pins.textContent = "";
        empty.hidden = true; moreB.hidden = true;
        loading.hidden = false;
      }
    }
    var before = more && S.rows.length ? S.rows[S.rows.length - 1].id : null;
    return rpc("board_list", { p_board: want === "all" ? null : want, p_before: before, p_limit: pageSize() }).then(function (r) {
      if (want !== S.board) return;                       /* 그사이 다른 게시판을 눌렀다 */
      loading.hidden = true;
      /* 돌아올 자리는 한 번만 쓴다 — 응답까지 받은 뒤 지운다(남겨 두면 나중에 탭을 바꿀 때마다 그 줄로 끌려간다) */
      var keepBack = function () { if (!more) ssDel(BKEY); };
      if (r && r.reason === "not_ready") { S.ready = false; renderHM(); renderMenu(); route(); return; }
      if (!r || !r.ok) {
        /* 「글 0건」과 「못 불러옴」을 같은 화면으로 보이지 않는다 */
        if (!cached) { say(sq("#bd-list-msg"), why("network"), "bad"); fail.hidden = false; }
        keepBack();
        return;
      }
      var rows = more ? S.rows.concat(r.rows || []) : (r.rows || []);
      var same = cached && rowsSig(rows) === rowsSig(S.rows) && rowsSig(r.notices) === rowsSig(S.notices);
      S.rows = rows;
      S.rowsBoard = want;
      S.more = !!r.more;
      if (!more) S.notices = r.notices || [];
      if (!same) {
        if (!more) paintPins(S.notices);
        paintList();
        if (S.view === "list") restoreBack();
      }
      empty.hidden = S.rows.length > 0;
      moreB.hidden = !S.more;
      keepBack();
      reloadBack();
      loadMine();
      tagGigs();
    });
  }
  /* 새로고침(또는 다른 사이트에서 뒤로 가기)으로 목록에 돌아왔다 — 목록이 그려진 뒤에 그 자리로.
     브라우저의 기본 복원은 목록이 오기 전(페이지가 짧을 때) 멈추고, 그 뒤 스크롤 고정(anchoring)이
     늦게 온 목록만큼 밀어 내려 목록 깊은 곳(1100)에서 새로고침한 사람이 맨 아래 신청곡(1646)에 떨어졌다 */
  function reloadBack() {
    if (S.reloadY == null) return;
    var y = S.reloadY;
    S.reloadY = null;
    window.scrollTo(0, y);
  }

  /* 글을 열기 직전의 목록 자리로 — 그 줄을 화면 가운데에 두고 초점을 준다 */
  function restoreBack() {
    var b = ssGet(BKEY);
    if (!b || b.board !== S.board || S.view !== "list") return;
    var li = sec.querySelector('#bd-list [data-id="' + b.id + '"], #bd-pins [data-id="' + b.id + '"], #bd-mine-list [data-id="' + b.id + '"]');
    if (li) {
      li.scrollIntoView({ block: "center" });
      var a = li.querySelector("a");
      if (a) { try { a.focus({ preventScroll: true }); } catch (e) { a.focus(); } }
    } else if (typeof b.y === "number") window.scrollTo(0, b.y);
  }

  function row(x, pin) {
    var li = el("li", "cafe-row" + (pin ? " cafe-row--pin" : ""));
    li.setAttribute("data-id", x.id);
    var a = el("a", "cafe-link");
    a.href = "#p" + x.id;
    /* 고정 줄의 '공지' 라벨은 제목 안 맨 앞에 — 라벨 칸을 따로 두면 제목 시작선이 둘이 된다(검토 4번) */
    var title = el("span", "cafe-title");
    if (pin) title.appendChild(el("span", "cafe-pin-l", t("bd.pinNotice", "공지")));
    title.appendChild(document.createTextNode(x.title));
    if (x.status && x.status !== "approved") title.appendChild(statusBadge(x.status));
    a.appendChild(title);
    a.appendChild(timeEl(x.created_at, when(x.created_at)));
    if (!pin) {
      var by = el("span", "cafe-by");
      if (S.board === "all" && x.board) { by.appendChild(el("span", "cafe-tag", boardName(x.board))); by.appendChild(dot()); }
      by.appendChild(el("span", "bd-nick", x.nickname));
      by.appendChild(document.createTextNode(" "));
      by.appendChild(badge(x.level, x.staff));
      if (x.comments) { by.appendChild(dot()); by.appendChild(el("span", "cafe-cn", fmt(t("bd.cmtN", "댓글 {n}"), { n: x.comments }))); }
      if (x.gig && x.gig.code) { by.appendChild(dot()); by.appendChild(el("span", "cafe-gig", gigLabel(x.gig))); }
      a.appendChild(by);
    }
    li.appendChild(a);
    return li;
  }
  function statusBadge(st) {
    return el("span", "bd-badge bd-badge--" + st,
      st === "pending" ? t("bd.st.pending", "확인 중") : t("bd.st.rejected", "내려짐"));
  }
  /* 공연 방명록 글에 붙는 공연 이름(011 post_gigs) — '10.18 부산 KBS홀 공연' */
  function gigLabel(g) {
    var k = kst(g.starts_at);
    var v = (isEN() && (g.venue_en || g.title_en)) || g.venue_ko || g.title_ko || "";
    var d = k ? (isEN() ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+k.m - 1] + " " + (+k.d) : k.m + "." + k.d) : "";
    return fmt(t("bd.gigShowF", "{d} {v} 공연"), { d: d, v: v }).replace(/^\s+|\s+$/g, "");
  }
  /* 목록에 보인 후기 글 중 공연 방명록에서 온 것에 공연 이름을 붙인다 — 공연 모드가 켜진 뒤에만.
     서버는 공개된 글·공개된 공연만 알려 준다(공개 전 공연의 이름이 새지 않게) */
  function tagGigs() {
    if (!liveOn()) return;
    var ids = S.rows.filter(function (x) { return (x.board === "review") && !x.gig && !x.gigAsked; })
      .map(function (x) { x.gigAsked = true; return x.id; }).slice(0, 50);
    if (!ids.length) return;
    var want = S.board;
    rpc("post_gigs", { p_ids: ids }).then(function (r) {
      if (!r || !r.ok || !r.map || want !== S.board) return;
      var hit = false;
      S.rows.forEach(function (x) { if (r.map[x.id]) { x.gig = r.map[x.id]; hit = true; } });
      if (hit && S.view === "list") paintList();
    });
  }

  /* ---------- 인순이의 편지(옛 원문) ---------- */
  function loadLetters() {
    if (S.letters) return Promise.resolve(S.letters);
    return fetch("assets/data/letters.json").then(function (r) { return r.json(); })
      .then(function (d) { S.letters = (d && d.items) || []; return S.letters; })["catch"](function () { return []; });
  }
  function letterDate(l) { return String(l.posted || "").split("-").join("."); }
  function artist() {
    var w = el("span", "bd-who-line");
    w.appendChild(el("span", "bd-nick", t("bd.artist", "인순이")));
    w.appendChild(el("span", "bd-badge bd-badge--artist", t("bd.artistBadge", "아티스트")));
    return w;
  }
  function letterRow(l, i) {
    var li = el("li", "cafe-row cafe-row--letter");
    li.setAttribute("data-id", "l" + i);
    var a = el("a", "cafe-link");
    a.href = "#l" + i;
    a.appendChild(el("span", "cafe-title", l.title));
    a.appendChild(timeEl(l.posted, letterDate(l)));
    var by = el("span", "cafe-by");
    by.appendChild(el("span", "bd-nick", t("bd.artist", "인순이")));
    by.appendChild(document.createTextNode(" "));
    by.appendChild(el("span", "bd-badge bd-badge--artist", t("bd.artistBadge", "아티스트")));
    a.appendChild(by);
    li.appendChild(a);
    return li;
  }
  function lettersPin() {
    var li = el("li", "cafe-row cafe-row--pin cafe-row--letter");
    li.setAttribute("data-id", "letters");
    var a = el("a", "cafe-link");
    a.href = "#b=letters";
    var title = el("span", "cafe-title");
    title.appendChild(el("span", "cafe-pin-l", t("bd.pinLetters", "편지")));
    title.appendChild(document.createTextNode(fmt(t("bd.lettersPinF", "인순이가 직접 남긴 편지 {n}편"), { n: (S.letters || []).length })));
    a.appendChild(title);
    li.appendChild(a);
    return li;
  }
  /* 회원 게시판이 닫혀 있을 때(스위치 꺼짐·서버 준비 전) — 탭·도구줄 없이 편지 두 편만 특집으로 */
  function featureRow(l, i) {
    var li = el("li", "cafe-feature");
    var a = el("a");
    a.href = "#l" + i;
    var lab = el("p", "cf-label", letterDate(l) + " · " + t("bd.artist", "인순이") + " ");
    lab.appendChild(el("span", "bd-badge bd-badge--artist", t("bd.artistBadge", "아티스트")));
    a.appendChild(lab);
    a.appendChild(el("h3", "cf-title", l.title));
    var first = String(l.body || "").split("\n").filter(function (s) { return s.trim(); })[0] || "";
    var line = el("p", "cf-line", first);
    line.setAttribute("lang", "ko");     /* 원문 — 번역하지 않는다 */
    a.appendChild(line);
    a.appendChild(el("span", "cf-go", t("bd.featGo", "편지 읽기 ›")));
    li.appendChild(a);
    return li;
  }
  function renderClosed() {
    var closed = sq("#cafe-closed"), feats = sq("#cafe-features");
    sq("#bd-list").textContent = ""; sq("#bd-pins").textContent = "";
    sq("#bd-empty").hidden = true; sq("#bd-more").hidden = true; sq("#bd-mine").hidden = true;
    sq("#bd-loading").hidden = true; sq("#bd-fail").hidden = true;
    closed.hidden = false;
    loadLetters().then(function (L) {
      if (live()) return;
      feats.textContent = "";
      L.slice(0, 2).forEach(function (l, i) { feats.appendChild(featureRow(l, i)); });
      feats.hidden = !L.length;
    });
  }
  /* 머리 소개 — 닫혀 있는 동안은 '곧 문을 엽니다'. 사전 키도 함께 바꿔 언어 전환이 되돌리지 않게 */
  function renderLede() {
    var n = byId("cafe-lede");
    if (!n) return;
    var k = live() ? "ph.community.d" : "ph.community.dClosed";
    if (n.getAttribute("data-i18n") === k && n.__done) return;
    n.setAttribute("data-i18n", k);
    n.textContent = live() ? t("ph.community.d", "인순이의 편지와 팬들의 글이 모이는 공식 사랑방입니다.")
                           : t("ph.community.dClosed", "인순이가 직접 남긴 편지를 모아 둔 공식 사랑방입니다.");
    n.__done = true;
  }

  function openLetter(i) {
    show("post");
    markTab("letters");
    var box = sq("#cafe-post");
    box.textContent = "";
    loadLetters().then(function (L) {
      if (S.view !== "post" || parseHash().id !== i) return;
      var l = L[i];
      box.textContent = "";
      if (!l) { box.appendChild(backLink("letters")); box.appendChild(el("p", "sb-msg is-bad", why("not_found"))); return; }
      box.appendChild(backLink("letters"));
      var bl = el("a", "cafe-post-board", boardName("letters"));
      bl.href = "#b=letters";
      box.appendChild(bl);
      var h = el("h3", "cafe-post-title", l.title);
      h.tabIndex = -1;
      box.appendChild(h);
      var meta = el("p", "cafe-post-meta");
      meta.appendChild(artist());
      var years = new Date().getFullYear() - parseInt(String(l.posted).slice(0, 4), 10);
      /* 항목마다 한 덩어리(줄바꿈 금지) — '당시 / 댓글 18' 처럼 항목 가운데서 줄이 나뉘지 않게. 가운뎃점은 앞 항목에 붙여
         줄 맨 앞에 '·'가 오지 않게 한다(검토 3바퀴 38번) */
      var lw = el("span", "cafe-letter-when");
      var items = fmt(t("bd.letterWhenF", "{d} · {y}년 전 · 당시 조회 {h} · 당시 댓글 {c}"),
        { d: letterDate(l), y: years, h: (+l.hit || 0).toLocaleString("en-US"), c: l.comments }).split(" · ");
      items.forEach(function (x, i) {
        /* 긴 항목(영어 등)은 묶지 않는다 — 320px·21px 에서 한 덩어리가 화면 폭을 넘지 않게 */
        lw.appendChild(el("span", x.length <= 18 ? "cafe-lw-i" : null, x + (i < items.length - 1 ? "\u00a0·" : "")));
        if (i < items.length - 1) lw.appendChild(document.createTextNode(" "));
      });
      meta.appendChild(lw);
      box.appendChild(meta);
      /* 원문 존중: textContent 로만, 번역하지 않는다. 손글씨 체 그대로 */
      var body = el("div", "letter-body cafe-letter-body", l.body);
      body.setAttribute("lang", "ko");
      box.appendChild(body);
      box.appendChild(el("p", "form-hint", t("bd.letterNote", "인순이가 2005년 팬 게시판에 직접 쓴 글입니다. 맞춤법도 띄어쓰기도 손대지 않았습니다.")));
      /* '당시 댓글 18' 을 보고 끝까지 찾아 내려가지 않게 — 그 댓글은 여기 없다(검토 44번) */
      box.appendChild(el("p", "form-hint cafe-letter-nocmt", t("bd.letterNoCmts", "옛 게시판의 댓글은 옮겨 오지 않았습니다.")));
      box.appendChild(backLink("letters", true));
      settlePost(h);
    });
  }
  /* 글이 다 그려진 뒤 — 탭 줄을 헤더 아래로, 초점은 제목으로(화면낭독기가 '이 글'부터 읽게) */
  function settlePost(h) {
    toMenu();
    alignAfterFonts();
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) {} }
  }
  /* '← 목록으로' — 목록에서 들어온 글이면 진짜 뒤로 가기(기록이 쌓이지 않고 보던 줄로 돌아간다).
     링크로 바로 들어왔으면 그 게시판 목록으로 바꿔 놓는다(뒤로 가기 한 번에 카페 밖으로 나가지 않게) */
  function backLink(board, bottom) {
    /* 내 정보에서 연 글이면 '← 내 정보로'(진짜 뒤로 가기 — 보던 자리로) */
    var fromMe = !!(S.trail && S.trail.from === "#me" && S.trail.to === location.hash);
    var a = el("a", bottom ? "cafe-back cafe-back--bottom" : "cafe-back",
      fromMe ? t("bd.backMe", "← 내 정보로") : t("bd.back2", "← 목록으로"));
    a.href = fromMe ? "#me" : "#b=" + (board || S.board);
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (S.trail && S.trail.to === location.hash) { S.trail = null; history.back(); return; }
      location.replace("#b=" + (board || S.board));
    });
    return a;
  }

  /* ---------- 글 보기 ---------- */
  function openPost(id) {
    show("post");
    var box = sq("#cafe-post");
    box.textContent = "";
    box.appendChild(el("p", "bd-loading", t("bd.loading", "불러오는 중…")));
    rpc("board_read", { p_id: id }).then(function (r) {
      if (S.view !== "post" || parseHash().id !== id) return;
      box.textContent = "";
      if (!r || !r.ok) {
        markTab(S.board);
        box.appendChild(backLink());
        box.appendChild(el("p", "sb-msg is-bad", why(r && r.reason)));
        settlePost(null);
        return;
      }
      /* 링크로 바로 들어왔다(목록을 거치지 않음) — 그 글의 게시판을 '지금 게시판'으로 */
      if (!S.trail || S.trail.to !== location.hash) {
        if (r.post.board && !S.rows.some(function (x) { return x.id === id; })) S.board = r.post.board;
      }
      renderPost(box, r);
      settlePost(box.querySelector(".cafe-post-title"));
    });
  }

  function renderPost(box, r) {
    var p = r.post;
    markTab(p.board);
    box.appendChild(backLink(p.board === "notice" ? "notice" : S.board));
    var bl = el("a", "cafe-post-board", boardName(p.board));
    bl.href = "#b=" + p.board;
    box.appendChild(bl);
    function gigLink(g) {
      var gl = el("a", "cafe-post-gig", fmt(t("bd.gigGbF", "{g} 방명록"), { g: gigLabel(g) }));
      gl.href = "/live?e=" + encodeURIComponent(g.code);
      gl.setAttribute("data-router", "off");
      return gl;
    }
    if (p.gig && p.gig.code) box.appendChild(gigLink(p.gig));
    else if (liveOn() && p.board === "review" && p.status === "approved") {
      /* 공연 방명록에서 온 글이면 그 공연으로 가는 길을 제목 위에 — 서버에 한 번 묻는다 */
      rpc("post_gigs", { p_ids: [p.id] }).then(function (g) {
        var hit = g && g.ok && g.map && g.map[p.id];
        var hh = box.querySelector(".cafe-post-title");
        if (hit && hh && box.contains(hh) && !box.querySelector(".cafe-post-gig")) box.insertBefore(gigLink(hit), hh);
      });
    }
    var h = el("h3", "cafe-post-title", p.title);
    h.tabIndex = -1;
    box.appendChild(h);
    var meta = el("p", "cafe-post-meta");
    meta.appendChild(author(p.nickname, p.level, p.staff));
    /* '· 날짜'는 한 덩어리로 줄을 넘긴다 — 큰 글자에서 가운뎃점만 윗줄 끝에 남지 않게 */
    var mt = el("span", "cafe-meta-t");
    mt.appendChild(dot());
    mt.appendChild(timeEl(p.created_at, stampTime(p.created_at)));
    meta.appendChild(mt);
    if (p.edited_at) { var me2 = el("span", "cafe-meta-t"); me2.appendChild(dot()); me2.appendChild(el("span", "cafe-edited", t("bd.editedShort", "고친 글"))); meta.appendChild(me2); }
    if (p.status !== "approved") meta.appendChild(statusBadge(p.status));
    box.appendChild(meta);
    box.appendChild(el("div", "bd-body", p.body));
    if (p.mine) {
      var acts = el("div", "bd-acts");
      /* 둘 다 글자 단추 — 같은 테두리 단추 둘이 나란히 있으면 되돌릴 수 없는 '지우기'가 구분되지 않았다.
         테두리 단추는 '댓글 올리기' 하나만 남긴다. '지우기'는 한 단계 낮은 색 + 확인 창(검토 3바퀴 33번) */
      var ed = el("a", "btn btn--text bd-edit-a", t("bd.edit", "고치기"));
      ed.href = "#edit=" + p.id;
      var del = el("button", "btn btn--text bd-del-a", t("bd.del", "지우기"));
      del.type = "button";
      del.addEventListener("click", function () {
        if (!window.confirm(t("bd.delQ", "이 글을 지울까요? 달린 댓글도 함께 지워지고 되돌릴 수 없습니다."))) return;
        del.disabled = true;
        rpc("board_delete", { p_id: p.id }, true).then(function (res) {
          del.disabled = false;
          if (res && res.ok) {
            S.flash = t("bd.deleted", "지웠습니다."); S.flashKind = "ok";
            S.rowsBoard = null;
            go("#b=" + S.board);
            renderStat();
          } else say(box.querySelector(".bd-cmsg"), why(res && res.reason), "bad");
        });
      });
      acts.appendChild(ed);
      acts.appendChild(del);
      box.appendChild(acts);
    }

    /* 댓글 */
    var cwrap = el("div", "bd-cmts");
    cwrap.appendChild(el("h4", "bd-cmts-h", t("bd.cmtsH", "댓글") + " " + r.comments.filter(function (c) { return c.status === "approved"; }).length));
    var ol = el("ol", "bd-clist");
    r.comments.forEach(function (c) { ol.appendChild(comment(c, p.id)); });
    cwrap.appendChild(ol);
    var cmsg = el("p", "sb-msg bd-cmsg");
    cmsg.setAttribute("role", "status");
    cmsg.setAttribute("aria-live", "polite");

    if (p.status !== "approved") {
      cwrap.appendChild(el("p", "form-hint", t("bd.cmtWait", "이 글이 공개되면 댓글을 받을 수 있습니다.")));
    } else if (canWrite()) {
      var f = el("form", "bd-cform");
      var lab = el("label", "sr-only", t("bd.cmtLabel", "댓글 쓰기"));
      lab.setAttribute("for", "bd-c-" + p.id);
      var ta = el("textarea", "bd-ctext");
      ta.id = "bd-c-" + p.id;
      ta.maxLength = 1000;
      ta.rows = 3;
      ta.placeholder = t("bd.cmtPh", "따뜻한 한마디를 남겨 주세요");
      /* 다시 그려도(다른 글 보고 돌아옴·댓글 올림) 쓰던 댓글을 지킨다 */
      ta.value = S.cdraft[p.id] || "";
      ta.addEventListener("input", function () { S.cdraft[p.id] = ta.value; });
      var send = el("button", "btn btn--ghost", t("bd.cmtSend", "댓글 올리기"));
      send.type = "submit";
      f.appendChild(lab); f.appendChild(ta); f.appendChild(send);
      /* 자판이 올라와도 '댓글 올리기'가 보이게 — 글쓰기와 같은 공용 맞춤(검토 4바퀴 10번). 글칸이라 엔터는 줄바꿈이고
         올리는 길은 이 단추 하나뿐이다 */
      kbBind(ta, function () { return send; });
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        if (f.__busy) return;
        var v = ta.value.trim();
        if (!v) { say(cmsg, why("empty"), "bad"); ta.focus(); return; }
        /* 보내는 동안 disabled 대신 aria-disabled — 초점을 가진 단추가 disabled 가 되면 브라우저가 초점을 문서(body)로
           떨어뜨려 키보드·화면낭독기 사용자가 자리를 잃었다(검토 4바퀴 13번). 두 번 누름은 __busy 가 막는다 */
        f.__busy = true;
        send.setAttribute("aria-disabled", "true");
        rpc("comment_write", { p_post_id: p.id, p_body: v }, true).then(function (res) {
          f.__busy = false;
          send.removeAttribute("aria-disabled");
          if (res && res.ok) {
            ta.value = "";
            delete S.cdraft[p.id];
            refreshPost(p.id, res.status === "approved" ? t("bd.cmtOk", "댓글을 올렸습니다.")
                                                        : t("bd.cmtWaitOk", "댓글을 받았습니다. 운영자가 확인한 뒤 모두에게 보입니다."),
                        document.activeElement === send);
          } else handleWriteFail(res, cmsg);
        });
      });
      cwrap.appendChild(f);
    } else {
      var gb = el("button", "btn btn--ghost",
        !S.me ? t("bd.cmtLogin", "로그인하고 댓글 쓰기") : !S.me.joined ? t("bd.cmtJoin", "가입 마치고 댓글 쓰기") : why("blocked"));
      gb.type = "button";
      if (S.me && S.me.joined) gb.disabled = true;
      gb.addEventListener("click", function () {
        setNext({ what: "open", id: p.id });
        openSheet(S.me ? "join" : "start", gb);
      });
      cwrap.appendChild(gb);
    }
    cwrap.appendChild(cmsg);
    box.appendChild(cwrap);
    var pn = pnNav(p.id);
    if (pn) box.appendChild(pn);
    box.appendChild(backLink(p.board === "notice" ? "notice" : S.board, true));
  }

  /* 이전 글 / 다음 글 — 지금 목록의 바로 위·아래 줄. 목록을 거치지 않고 들어왔으면 그리지 않는다 */
  function pnNav(id) {
    var i = -1;
    for (var k = 0; k < S.rows.length; k++) if (S.rows[k].id === id) { i = k; break; }
    if (i < 0) return null;
    var prev = S.rows[i - 1], next = S.rows[i + 1];
    if (!prev && !next) return null;
    var nav = el("nav", "cafe-pn");
    nav.setAttribute("aria-label", t("bd.pnAria", "이전 글과 다음 글"));
    [[prev, t("bd.prev", "이전 글")], [next, t("bd.next", "다음 글")]].forEach(function (pr) {
      if (!pr[0]) return;
      var a = el("a", "cafe-pn-a");
      a.href = "#p" + pr[0].id;
      a.appendChild(el("span", "cafe-pn-l", pr[1]));
      a.appendChild(el("span", "cafe-pn-t", pr[0].title));
      nav.appendChild(a);
    });
    return nav;
  }

  function comment(c, postId) {
    var it = el("li", "bd-c");
    var head = el("p", "bd-c-head");
    head.appendChild(author(c.nickname, c.level, c.staff));
    var ct = el("span", "cafe-meta-t");
    ct.appendChild(dot());
    ct.appendChild(timeEl(c.created_at, stampTime(c.created_at)));
    head.appendChild(ct);
    if (c.status !== "approved") head.appendChild(statusBadge(c.status));
    it.appendChild(head);
    it.appendChild(el("p", "bd-c-body", c.body));
    if (c.mine) {
      var del = el("button", "bd-c-del", t("bd.del", "지우기"));
      del.type = "button";
      del.addEventListener("click", function () {
        if (!window.confirm(t("bd.cdelQ", "이 댓글을 지울까요?"))) return;
        rpc("comment_delete", { p_id: c.id }, true).then(function (res) {
          if (res && res.ok) refreshPost(postId, t("bd.deleted", "지웠습니다."));
          else window.alert(why(res && res.reason));
        });
      });
      it.appendChild(del);
    }
    return it;
  }

  /* keep — '댓글 올리기'를 누른 초점을 다시 그린 뒤의 같은 단추로 돌려준다(다시 그리면 옛 단추가 사라져 초점이 문서로 떨어졌다) */
  function refreshPost(id, note, keep) {
    rpc("board_read", { p_id: id }).then(function (r) {
      if (S.view !== "post") return;
      var box = sq("#cafe-post");
      box.textContent = "";
      if (!r || !r.ok) { box.appendChild(backLink()); box.appendChild(el("p", "sb-msg is-bad", why(r && r.reason))); return; }
      renderPost(box, r);
      if (note) say(box.querySelector(".bd-cmsg"), note, "ok");
      var nb = keep ? box.querySelector(".bd-cform button[type=submit]") : null;
      if (nb) { try { nb.focus({ preventScroll: true }); } catch (e) {} }
    });
    loadMe().then(function () { renderHM(); emit("state"); });
  }

  /* ---------- 확인을 기다리는 내 글 ---------- */
  function loadMine() {
    var box = sq("#bd-mine");
    if (!box) return;
    if (!live() || !joined() || S.board === "letters") { box.hidden = true; return; }
    rpc("board_mine", {}, true).then(function (r) {
      var waiting = (r && r.ok ? r.rows : []).filter(function (x) { return x.status !== "approved"; });
      var ol = sq("#bd-mine-list");
      ol.textContent = "";
      waiting.forEach(function (x) {
        ol.appendChild(row({ id: x.id, board: x.board, title: x.title, nickname: S.me.nickname, level: S.me.level, staff: S.me.admin,
                             created_at: x.created_at, comments: x.comments, status: x.status }, false));
      });
      sq("#bd-mine-n").textContent = waiting.length;
      box.hidden = waiting.length === 0;
      /* 방금 글을 맡긴 사람에게는 펼쳐서 보여 준다 — 접혀 있으면 '내 글이 어디 갔지'가 된다 */
      if (S.showMine && waiting.length) { box.open = true; S.showMine = false; }
    });
  }

  /* ---------- 글쓰기 ---------- */
  function boardVal() {
    var c = sec && sec.querySelector("#bd-pick input:checked");
    return c ? c.value : "free";
  }
  function draftSave() {
    if (S.editing) return;   /* 고치는 중인 글은 초안으로 저장하지 않는다(새 글 초안을 덮지 않게) */
    var ti = sq("#bd-title"), bo = sq("#bd-body");
    if (!ti || !bo) return;
    if (!ti.value && !bo.value) { lsDel(DKEY); return; }
    lsSet(DKEY, { title: ti.value, body: bo.value, board: boardVal(), at: Date.now() });
  }
  function counter() {
    var bo = sq("#bd-body"), c = sq("#bd-count");
    if (bo && c) c.textContent = bo.value.length.toLocaleString("en-US") + " / 4,000";
  }
  /* 게시판 고르기 — 고르는 칸을 눈에 보이게 펼친다(접힌 select 는 어르신에게 '눌러야 열리는 것'이 안 보인다).
     고른 칸은 채우지 않고 굵은 글자 + ✓ + 안쪽 테두리 — 채운 버튼은 '올리기' 하나다 */
  function fillBoards(current) {
    var rowBox = sq("#bd-pick-row");
    rowBox.textContent = "";
    var list = writable();
    if (list.indexOf(current) < 0) current = "free";
    list.forEach(function (k) {
      var lab = el("label", "bd-pick-o");
      var inp = el("input");
      inp.type = "radio";
      inp.name = "bd-board";
      inp.value = k;
      inp.checked = k === current;
      lab.appendChild(inp);
      lab.appendChild(el("span", null, (k === current ? "✓ " : "") + boardName(k)));
      rowBox.appendChild(lab);
    });
  }
  function markPick() {
    Array.prototype.forEach.call(sec.querySelectorAll("#bd-pick input"), function (inp) {
      inp.nextSibling.textContent = (inp.checked ? "✓ " : "") + boardName(inp.value);
    });
  }
  /* 처음 쓰는 새싹은 가입인사로, 아니면 보던 게시판(쓸 수 있으면), 그 밖에는 자유게시판 */
  function defaultPick() {
    var me = S.me || {};
    if (!me.admin && me.level === "sprout" && (me.posts_ok || 0) + (me.posts_pending || 0) === 0) return "hello";
    if (writable().indexOf(S.board) >= 0) return S.board;
    return "free";
  }

  function openForm(edit, board) {
    var f = sq("#bd-form");
    if (!f) return;
    var ti = sq("#bd-title"), bo = sq("#bd-body"), hint = sq("#bd-form-hint"), gob = sq("#bd-go");
    S.editing = edit || null;
    fieldErr(ti, ""); fieldErr(bo, "");
    show("write");
    if (edit) {
      ti.value = edit.title;
      bo.value = edit.body;
      fillBoards(edit.board);
      gob.textContent = t("bd.saveEdit", "고친 내용 올리기");
      sq("#bd-form-h").textContent = t("bd.editH", "글 고치기");
      sq("#bd-cancel").textContent = t("bd.closeEdit", "고치지 않고 닫기");
      sq("#bd-form-back").textContent = t("bd.closeEditBack", "← 고치지 않고 닫기");
    } else {
      gob.textContent = t("bd.post", "올리기");
      sq("#bd-cancel").textContent = t("bd.cancelWrite", "쓰기 그만두기");
      sq("#bd-form-back").textContent = t("bd.stopWriting", "← 쓰기 그만두기");
      sq("#bd-form-h").textContent = t("bd.newH", "새 글 쓰기");
      var d = lsGet(DKEY);
      fillBoards(board || (d && d.board) || defaultPick());
      if (d && (d.title || d.body) && !ti.value && !bo.value) {
        ti.value = d.title || "";
        bo.value = d.body || "";
        var had = sq("#bd-msg").textContent;
        say(sq("#bd-msg"), (had ? had + " " : "") + t("bd.draftBack", "쓰시던 글을 불러왔습니다."), "ok");
      }
    }
    markTab(boardVal());
    var trusted = S.me && (S.me.level === "member" || S.me.admin);
    if (instantOn() && !(edit && edit.status === "rejected")) {
      hint.textContent = t("bd.hintAll", "쓰자마자 모두에게 보입니다. 문제가 되는 글은 운영자가 내릴 수 있습니다.");
    } else hint.textContent =
        edit && edit.status === "rejected" ? (trusted ? t("bd.hintEditRejected", "운영자가 내린 글입니다. 고쳐도 다시 올라가지 않습니다.")
                                                      : t("bd.hintEditSprout", "고친 글은 운영자가 다시 확인한 뒤 올라갑니다."))
      : edit && edit.status === "pending" ? t("bd.hintEditPending", "확인을 기다리는 글입니다. 고쳐도 그대로 확인을 기다립니다.")
      : trusted ? t("bd.hintMember", "정회원의 글은 바로 올라갑니다.")
      : edit ? t("bd.hintEditSprout", "고친 글은 운영자가 다시 확인한 뒤 올라갑니다.")
             : t("bd.hintSprout", "새싹 회원의 글은 운영자가 확인한 뒤 올라갑니다.");
    counter();
    toMenu();
    alignAfterFonts();
    /* 고치기는 제목 칸에서 시작한다(새 글과 같이) — 내용 칸에 두면 폰에서 화면이 내용 칸 한가운데로 내려가
       '글 고치기' 제목과 '← 고치지 않고 닫기'가 머리 밑에 숨었다(검토 4바퀴 2번). 이어 쓰던 새 글만 내용 칸에서 */
    setTimeout(function () { var x = ti.value && !edit ? bo : ti; try { x.focus({ preventScroll: true }); } catch (e) { x.focus(); } }, 250);
  }
  function closeForm() {
    if (S.editing && sec) { sq("#bd-title").value = ""; sq("#bd-body").value = ""; }
    S.editing = null;
  }
  function startEdit(id) {
    if (!canWrite()) { S.flash = why("blocked"); S.flashKind = "bad"; go("#b=" + S.board); return; }
    rpc("board_read", { p_id: id }).then(function (r) {
      if (!r || !r.ok || !r.post.mine) { S.flash = why((r && r.reason) || "not_found"); S.flashKind = "bad"; go("#b=" + S.board); return; }
      var p = r.post;
      openForm({ id: p.id, board: p.board, title: p.title, body: p.body, status: p.status });
    });
  }

  function onWrite() {
    go("#write" + (S.board !== "all" && S.board !== "letters" ? "=" + S.board : ""));
  }

  /* 칸 하나의 오류 — 칸 아래 .bd-ferr 에 쓰고 aria-invalid·describedby 를 건다. 빈 글이면 걷는다 */
  function fieldErr(f, text) {
    if (!f) return;
    var e = byId(f.id + "-err");
    if (!e) return;
    if (e.textContent !== (text || "")) e.textContent = text || "";
    if (text) {
      f.setAttribute("aria-invalid", "true");
      f.setAttribute("aria-describedby", e.id);
    } else {
      f.removeAttribute("aria-invalid");
      if (f.getAttribute("aria-describedby") === e.id) f.removeAttribute("aria-describedby");
    }
  }
  function handleWriteFail(res, node) {
    var r = res && res.reason;
    say(node, why(r), "bad");
    if (r === "not_logged_in" || r === "expired") { S.me = null; renderHM(); openSheet("start", byId("hm"), why(r)); }
    else if (r === "not_member") openSheet("join", byId("hm"));
  }

  function onSubmit(e) {
    e.preventDefault();
    var ti = sq("#bd-title"), bo = sq("#bd-body"), gob = sq("#bd-go"), msg = sq("#bd-msg");
    var title = ti.value.trim(), body = bo.value.trim(), board = boardVal();
    /* 칸 오류는 그 칸 바로 아래에 — 위쪽 안내 줄(#bd-msg)은 이 화면에서 헤더 위(360×640 에서 top -35~-222)에
       숨어 있어 초점만 칸으로 가고 이유는 보이지 않았다(검토 3바퀴 18번) */
    fieldErr(ti, title.length < 2 ? why("title_empty") : "");
    fieldErr(bo, title.length >= 2 && body.length < 2 ? why("empty") : "");
    if (title.length < 2) { ti.focus(); return; }
    if (body.length < 2) { bo.focus(); return; }
    gob.disabled = true;
    var editing = S.editing;
    var call = editing
      ? rpc("board_edit", { p_id: editing.id, p_board: board, p_title: title, p_body: body }, true)
      : rpc("board_write", { p_board: board, p_title: title, p_body: body }, true);
    call.then(function (res) {
      gob.disabled = false;
      if (!res || !res.ok) { handleWriteFail(res, msg); return; }   /* 실패하면 쓴 글을 그대로 둔다 */
      if (!editing) lsDel(DKEY);
      S.editing = null;
      ti.value = ""; bo.value = "";
      S.board = board;
      S.rowsBoard = null;
      renderStat();
      loadMe().then(function () { renderHM(); emit("state"); });
      if (res.status === "approved") {
        S.flash = editing ? t("bd.editOk", "고친 내용을 올렸습니다.") : t("bd.postOk", "올라갔습니다.");
        S.flashKind = "ok";
        go("#p" + (editing ? editing.id : res.id));
        return;
      }
      S.flashKind = "ok";
      if (res.status === "rejected") S.flash = t("bd.editRejected", "고친 내용을 저장했습니다. 내려간 글이라 공개되지는 않습니다.");
      else if (editing && editing.status === "pending" && S.me && (S.me.level === "member" || S.me.admin))
        S.flash = t("bd.editStillWait", "고친 내용을 저장했습니다. 확인이 끝나면 올라갑니다.");
      else {
        S.flash = editing ? t("bd.editWait", "고친 글을 받았습니다. 운영자가 다시 확인한 뒤 올라갑니다.")
                          : t("bd.postWait", "올렸습니다. 운영자가 확인한 뒤 공개됩니다.");
        S.showMine = true;
      }
      S.afterPost = true;
      go("#b=" + board);
    });
  }

  function onCancel(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (S.editing) {
      var changed = sq("#bd-title").value !== S.editing.title || sq("#bd-body").value !== S.editing.body;
      if (changed && !window.confirm(t("bd.dropEdit", "고친 내용을 버리고 닫을까요?"))) return;
      var back = S.editing.id;
      closeForm();
      go("#p" + back);
      return;
    }
    draftSave();
    go("#b=" + S.board);
  }

  /* 로그아웃·탈퇴 뒤 — 이 기기에 남은 쓰던 글·이어서 할 일·댓글 초안을 치운다.
     공용 기기(가족 폰·도서관 PC)에서 다음 사람의 글쓰기 칸에 앞사람 글이 뜨지 않게(검토 지적). */
  function forgetDevice() {
    lsDel(DKEY);
    lsDel(NKEY);
    S.cdraft = {};
    S.editing = null;
    var ti = sq("#bd-title"), bo = sq("#bd-body");
    if (ti) ti.value = "";
    if (bo) bo.value = "";
    if (S.view === "write") go("#b=" + S.board);
  }
  /* 회원 상태가 바뀐 뒤(로그아웃·탈퇴·별명) 카페를 다시 그린다 */
  function refreshCafe() {
    if (!sec) return;
    S.rowsBoard = null;
    renderMenu(); renderNote();
    if (S.view === "list") loadList(false);
    loadMine();
  }

  /* ================================================================
     2-1. 내 정보(마이페이지) — community.html#me
     형님(10/02): "내가 남긴 글들도 볼 수 있는 마이페이지라든지 여러 가지가 있으면 좋지 않을까?"
     모든 페이지 헤더의 '내 정보'가 여기로 온다. 예전 '내 정보' 창(시트)에 있던 별명 바꾸기·로그아웃·탈퇴·
     다녀온 공연도 이리로 옮겼다 — 같은 일을 하는 곳이 두 군데면 어르신은 어디서 했는지 잊는다.
     서버 두 갈래:
       · config.mypage 켜짐 + 013 있음 → member_page() 한 번(객석의 느린 LTE 에서 왕복 한 번) — 글·댓글·노래·도장·건수
       · 꺼짐 또는 013 없음(404) → 010 의 member_me + board_mine, 공연 모드가 켜졌으면 011 의 gig_my_stamps.
         013 에만 있는 칸(내 댓글·내 노래)은 '준비하고 있습니다' 한 줄로 비운다 — 지어내지 않는다.
     숫자는 전부 서버가 센 그대로다(등업 기준도 board_settings 값). 0 이면 0 이라고 쓴다.
     ================================================================ */
  var ME = { data: null, at: 0, back: null, seq: 0, from: null };

  function meBox() {
    if (!sec) return null;
    var b = sq("#cafe-me");
    if (!b) {
      /* 예전 HTML(캐시)에 자리가 없으면 글 보기 바로 뒤에 만든다 — 화면이 비지 않게 */
      var post = sq("#cafe-post");
      if (!post || !post.parentNode) return null;
      b = el("div", "cafe-me");
      b.id = "cafe-me";
      b.hidden = true;
      post.parentNode.insertBefore(b, post.nextSibling);
    }
    return b;
  }
  function meSec(cls, title, n) {
    var s = el("section", "me-sec " + cls);
    var h = el("h4", "me-sec-h", title);
    if (typeof n === "number") { h.appendChild(document.createTextNode(" ")); h.appendChild(el("span", "me-n", String(n))); }
    s.appendChild(h);
    return s;
  }
  /* 맨 위 — 돌아갈 길 하나 + 제목. 공연 화면에서 왔으면 공연 화면으로(객석에서 길을 잃지 않게).
     회원이면 제목이 그 사람의 별명이다('내 정보'는 그 위 작은 머리말) — 화면의 주인이 누구인지가 먼저 보이게 */
  function meHead(box, nick) {
    box.textContent = "";
    var a;
    if (ME.from) {
      a = el("a", "cafe-back", t("bd.me.backLive", "← 공연 화면으로"));
      a.href = ME.from;
      a.setAttribute("data-router", "off");
    } else {
      a = el("a", "cafe-back", t("bd.me.backList", "← 사랑방 목록으로"));
      a.href = "#b=" + (S.board || "all");
    }
    box.appendChild(a);
    var h = el("h3", "me-h");
    if (nick) {
      h.appendChild(el("span", "me-kick", t("bd.me.h", "내 정보")));
      h.appendChild(el("span", "me-nick-t", nick));
    } else {
      h.textContent = t("bd.me.h", "내 정보");
    }
    h.id = "me-h";
    h.setAttribute("tabindex", "-1");
    box.appendChild(h);
    return h;
  }
  function settleMe(h) {
    toMenu();
    alignAfterFonts();
    if (h) { try { h.focus({ preventScroll: true }); } catch (e) {} }
  }

  function openMe() {
    show("me");
    markTab(null);
    var box = meBox();
    if (!box) return;
    var fr = ssGet(MEFROM);
    if (fr) {
      ssDel(MEFROM);
      if (Date.now() - (fr.at || 0) < 30 * 60e3 && /^\/live(\.html)?(\?|$)/.test(fr.url || "")) ME.from = fr.url;
    }
    if (!S.me) { meGate(box, S.net ? "net" : "out"); return; }
    if (!S.me.joined) { meGate(box, "join"); return; }
    /* 내 정보에서 연 글을 보고 돌아왔다 — 아까 그린 것을 그대로, 보던 자리로(다시 받으며 맨 위로 튀지 않게) */
    if (ME.back && ME.data && Date.now() - ME.at < 10 * 60e3) {
      var y = ME.back.y;
      ME.back = null;
      paintMe(box, ME.data);
      window.scrollTo(0, y);
      var lh = box.querySelector(".me-h");
      if (lh) { try { lh.focus({ preventScroll: true }); } catch (e) {} }
      return;
    }
    /* 받아 둔 것이 낡았으면(그 글에서 댓글을 쓰거나 지웠다) 다시 받되, 돌아올 자리는 지킨다 */
    var backY = ME.back ? ME.back.y : null;
    ME.back = null;
    var h = meHead(box);
    box.appendChild(el("p", "bd-loading", t("bd.loading", "불러오는 중…")));
    settleMe(h);
    var y0 = window.scrollY;
    var seq = ++ME.seq;
    fetchMe().then(function (res) {
      if (seq !== ME.seq || S.view !== "me" || !sec || !document.body.contains(sec)) return;
      /* 다른 페이지에서 라우터로 왔으면 라우터가 훅(이 함수) 뒤에 맨 위로 올리고 h1 에 초점을 준다 — 받은 뒤 다시 맞춘다.
         그사이 사람이 스크롤했으면 건드리지 않는다 */
      var ae = document.activeElement;
      var hadFocus = ae === h || ae === document.body || !!(ae && ae.matches && ae.matches("#main h1"));
      var still = window.scrollY === 0 || Math.abs(window.scrollY - y0) < 2;
      if (res.fail) {
        var r0 = res.fail.reason;
        if (r0 === "not_logged_in" || r0 === "expired") { S.me = null; renderHM(); emit("state"); meGate(box, "out"); return; }
        if (r0 === "not_member") { if (S.me) S.me.joined = false; renderHM(); emit("state"); meGate(box, "join"); return; }
        meGate(box, "net", r0);
        return;
      }
      ME.data = res;
      ME.at = Date.now();
      paintMe(box, res);
      if (backY !== null) window.scrollTo(0, backY);
      else if (still) toMenu();
      var nh = box.querySelector(".me-h");
      if (hadFocus && nh) { try { nh.focus({ preventScroll: true }); } catch (e) {} }
    });
  }

  /* 로그인 전 · 가입 전 · 연결 끊김 — 할 수 있는 일 하나만 */
  function meGate(box, kind, reason) {
    var h = meHead(box);
    var p = el("p", "me-gate-t");
    var b;
    if (kind === "out") {
      p.textContent = t("bd.me.out", "내 정보는 회원으로 들어오면 보입니다. 내가 쓴 글과 댓글, 다녀온 공연을 한곳에서 볼 수 있습니다.");
      b = btn("btn btn--solid me-gate-b", t("hm.in", "로그인 · 회원가입"));
      b.addEventListener("click", function () { setNext({ what: "me" }); openSheet("start", b); });
    } else if (kind === "join") {
      p.textContent = t("bd.me.join", "가입을 마치면 내 정보가 열립니다. 별명만 정하면 됩니다.");
      b = btn("btn btn--solid me-gate-b", t("bd.doJoin", "가입 마치기"));
      b.addEventListener("click", function () { setNext({ what: "me" }); openSheet("join", b); });
    } else {
      p.textContent = why(reason || "network");
      b = btn("btn btn--ghost me-gate-b", t("bd.retry", "다시 시도"));
      b.addEventListener("click", function () {
        b.disabled = true;
        loadMe().then(function () { renderHM(); emit("state"); route(); });
      });
    }
    box.appendChild(p);
    box.appendChild(b);
    settleMe(h);
  }

  /* member_me 와 같은 칸을 S.me 에 옮긴다 — 헤더의 별명·등급, 사랑방의 새싹 안내가 같은 값을 쓴다 */
  function syncMe(r) {
    if (!S.me) S.me = { ok: true };
    ["joined", "nickname", "level", "admin", "auto_up", "provider", "joined_at", "posts_ok", "comments_ok", "posts_pending",
     "need_posts", "need_comments"].forEach(function (k) { if (r.hasOwnProperty(k)) S.me[k] = r[k]; });
    renderHM();
    emit("state");
  }
  function fetchMe() {
    if (mypageOn()) {
      return rpc("member_page", {}, true).then(function (r) {
        /* 스위치는 켜졌는데 서버에 013 이 없다 — 010 갈래로(이 문서에서는 다시 묻지 않는다) */
        if (r && r.reason === "not_ready") { S.mp = false; return fetchMe(); }
        if (!r || !r.ok) return { fail: r || { reason: "network" } };
        S.mp = true;
        syncMe(r);
        return { full: true, p: r };
      });
    }
    return Promise.all([
      loadMe(),
      rpc("board_mine", {}, true),
      liveOn() ? rpc("gig_my_stamps", {}, true) : Promise.resolve(null)
    ]).then(function (a) {
      var me = S.me;
      if (!me) return { fail: { reason: S.net ? "network" : "not_logged_in" } };
      if (!me.joined) return { fail: { reason: "not_member" } };
      renderHM();
      emit("state");
      var mine = a[1] || {};
      var p = {};
      ["nickname", "level", "admin", "auto_up", "provider", "joined_at", "posts_ok", "comments_ok", "posts_pending",
       "need_posts", "need_comments"].forEach(function (k) { p[k] = me[k]; });
      var rows = mine.ok ? (mine.rows || []) : [];
      p.posts = { ok: !!mine.ok, reason: mine.reason, more: false, rows: rows };
      p.counts = { posts: { total: rows.length } };
      p.stamps = a[2];
      return { full: false, p: p };
    });
  }

  function paintMe(box, res) {
    var p = res.p;
    meHead(box, p.nickname || "");
    /* 등급 · 가입 경로 · 가입한 날 — 한 줄 */
    var who = el("p", "me-since");
    who.appendChild(badge(p.level, p.admin));
    var since = [];
    if (p.provider === "kakao") since.push(t("bd.me.kakao", "카카오 계정"));
    else if (p.provider === "email") since.push(t("bd.me.email", "이메일 계정"));
    var k = kst(p.joined_at);
    if (k) since.push(fmt(t("bd.me.sinceF", "{d} 가입"), { d: k.y + "." + k.m + "." + k.d }));
    if (since.length) who.appendChild(el("span", "me-via", since.join(" · ")));
    box.appendChild(who);
    var msg = el("p", "sb-msg me-msg");
    msg.id = "me-msg";
    msg.setAttribute("role", "status");
    msg.setAttribute("aria-live", "polite");
    box.appendChild(msg);
    if (p.levelup) say(msg, t("bd.me.levelup", "축하합니다. 방금 정회원이 되었습니다. 이제 글과 댓글이 바로 올라갑니다."), "ok");
    box.appendChild(meLevel(p));
    var st = meStamps(p);
    if (st) box.appendChild(st);
    if (res.full) box.appendChild(meSong(p));
    box.appendChild(mePosts(p, res.full));
    if (res.full) box.appendChild(meCmts(p));
    else box.appendChild(el("p", "form-hint me-soon", t("bd.me.soon", "내 댓글 모아 보기와 '내 노래' 고르기는 준비하고 있습니다.")));
    /* 소식 메일은 내 글·댓글 아래(별명 바꾸기 앞) — 서버 답을 받은 뒤에 나타나는 칸이라, 위에 두면 나타나는 순간
       아래 목록을 밀어 '← 내 정보로' 돌아온 자리가 어긋났다(S3b 실측 +373px) */
    if (res.full && newsOn()) box.appendChild(meNews());
    box.appendChild(meNick(p));
    box.appendChild(meAcct(p, res.full));
  }

  /* 등급 — 새싹(자동 등업)만 숫자를 보인다. 운영자가 정한 새싹에게 '몇 개 더'는 거짓 약속이다(자동 등업이 없다) */
  function meLevel(p) {
    var s = meSec("me-lv", t("bd.me.lvH", "등급"));
    var line = el("p", "me-line");
    s.appendChild(line);
    if (p.admin) {
      line.textContent = t("bd.noteStaff", "운영자로 들어와 있습니다. 글과 댓글이 바로 올라갑니다.");
      var adm = el("a", "me-go", t("bd.toAdmin", "운영 화면 열기"));
      adm.href = "admin.html";
      adm.setAttribute("data-router", "off");
      s.appendChild(adm);
      return s;
    }
    if (p.level === "member") { line.textContent = t("bd.me.member", "정회원입니다. 글과 댓글이 바로 올라갑니다."); return s; }
    if (p.level === "blocked") { line.textContent = why("blocked"); return s; }
    if (p.auto_up === false) { line.textContent = t("bd.me.byStaff", "새싹 회원입니다. 등급은 운영자가 정합니다."); return s; }
    var NP = p.need_posts || 0, NC = p.need_comments || 0;
    line.textContent = instantOn()
      ? fmt(t("bd.me.sproutInstF", "새싹 회원입니다. 공개된 글 {p}개와 댓글 {c}개가 모이면 정회원이 됩니다."), { p: NP, c: NC })
      : fmt(t("bd.me.sproutF", "새싹 회원입니다. 운영자 확인을 거쳐 공개된 글 {p}개와 댓글 {c}개가 모이면 정회원이 되어, 글과 댓글이 바로 올라갑니다."), { p: NP, c: NC });
    var ul = el("ul", "me-prog");
    [[t("bd.me.pOk", "공개된 글"), p.posts_ok || 0, NP], [t("bd.me.cOk", "공개된 댓글"), p.comments_ok || 0, NC]].forEach(function (x) {
      var li = el("li", "me-prog-i");
      li.appendChild(el("span", "me-prog-l", x[0]));
      li.appendChild(el("span", "me-prog-n", x[1] >= x[2] ? fmt(t("bd.me.doneF", "{n}개 · 채웠습니다"), { n: x[1] }) : x[1] + " / " + x[2]));
      var bar = el("span", "me-bar");
      bar.setAttribute("aria-hidden", "true");
      var fill = el("i");
      fill.style.width = Math.round(Math.min(1, x[2] ? x[1] / x[2] : 1) * 100) + "%";
      bar.appendChild(fill);
      li.appendChild(bar);
      ul.appendChild(li);
    });
    s.appendChild(ul);
    if (p.posts_pending) s.appendChild(el("p", "form-hint", fmt(t("bd.me.pendF", "확인을 기다리는 글 {n}개는 공개되면 셉니다."), { n: p.posts_pending })));
    return s;
  }

  /* 다녀온 공연 — 도장은 나에게만 보인다. 공연 모드 전(011 없음)이면 칸 자체가 없다 */
  function meStamps(p) {
    var st = p.stamps;
    if (!st || !st.ok) return null;
    var rows = st.rows || [];
    if (!rows.length && !liveOn()) return null;
    var s = meSec("me-stamps bd-stamps", t("bd.stampsH", "다녀온 공연"), rows.length);
    if (!rows.length) {
      s.appendChild(el("p", "me-empty", t("bd.me.noStamp", "아직 찍은 도장이 없습니다. 공연장에서 QR로 들어와 도장을 찍으면 여기에 남습니다.")));
      return s;
    }
    var ul = el("ul", "bd-stamps-l");
    rows.forEach(function (x) {
      var k = kst(x.starts_at || x.at);
      var li = el("li", "bd-stamp-mini");
      li.appendChild(el("span", "bd-stamp-d", k ? k.y + "." + k.m + "." + k.d : ""));
      li.appendChild(el("span", "bd-stamp-v", (isEN() && x.venue_en) || x.venue_ko || x.venue || x.title_ko || x.title || ""));
      ul.appendChild(li);
    });
    s.appendChild(ul);
    return s;
  }

  /* 내 노래 — 가입 질문의 답. 고르기·바꾸기·지우기(답은 선택). 다른 회원에게는 보이지 않는다(운영 화면만) */
  function meSong(p) {
    var s = meSec("me-song", t("bd.me.songH", "내 노래"));
    s.appendChild(el("p", "form-hint me-song-d", t("bd.me.songD", "좋아하는 인순이 노래 한 곡입니다. 다른 회원에게는 보이지 않습니다.")));
    var cur = el("p", "me-song-cur");
    var acts = el("div", "me-song-acts");
    var pick = el("div", "me-song-pick");
    pick.id = "me-song-pick";
    pick.hidden = true;
    var msg = msgNode();
    s.appendChild(cur);
    s.appendChild(acts);
    s.appendChild(pick);
    s.appendChild(msg);
    var song = p.song || null;
    var pickB;
    function paint() {
      cur.textContent = "";
      if (song) {
        cur.appendChild(el("span", "me-song-t", "「" + song.title + "」"));
        if (song.year) cur.appendChild(el("span", "me-song-y", String(song.year)));
      } else {
        cur.appendChild(el("span", "me-song-none", t("bd.me.noSong", "아직 고르지 않았습니다.")));
      }
      acts.textContent = "";
      pickB = btn("btn btn--ghost btn--sm me-song-b", song ? t("bd.me.songChange", "다른 노래로 바꾸기") : t("bd.me.songPick", "노래 고르기"));
      pickB.setAttribute("aria-controls", pick.id);
      pickB.setAttribute("aria-expanded", "false");
      pickB.addEventListener("click", function () {
        pick.hidden = false;
        pickB.setAttribute("aria-expanded", "true");
        say(msg, "");
        try { picker.input.focus(); } catch (e) {}
      });
      acts.appendChild(pickB);
      if (song) {
        var clr = btn("bd-link me-song-clr", t("bd.me.songClear", "지우기"));
        clr.addEventListener("click", function () { save(null); });
        acts.appendChild(clr);
      }
    }
    function close() {
      pick.hidden = true;
      picker.reset();
      if (pickB) pickB.setAttribute("aria-expanded", "false");
    }
    var picker = songPicker({ id: "me-song-q", label: t("bd.me.songFind", "노래 제목으로 찾기"), onPick: function (x) { save(x); } });
    pick.appendChild(picker.node);
    var cancel = btn("bd-link", t("bd.me.songCancel", "그만두기"));
    cancel.addEventListener("click", function () { close(); try { pickB.focus(); } catch (e) {} });
    pick.appendChild(cancel);
    function save(x) {
      say(msg, t("bd.me.saving", "저장하는 중…"));
      rpc("member_set_song", { p_song: x ? x.t : "" }, true).then(function (r) {
        if (r && r.ok) {
          song = r.song ? { k: r.song.k, title: r.song.title, year: r.song.year } : null;
          if (ME.data && ME.data.p) ME.data.p.song = song;
          close();
          paint();
          say(msg, song ? fmt(t("bd.me.songOkF", "내 노래: 「{t}」 — 저장했습니다."), { t: song.title }) : t("bd.me.songCleared", "내 노래를 지웠습니다."), "ok");
          try { pickB.focus(); } catch (e) {}
          return;
        }
        if (r && r.reason === "not_ready") S.mp = false;
        say(msg, r && r.reason === "bad_song" ? t("bd.e.badSong", "목록에 있는 노래만 고를 수 있습니다.") : why(r && r.reason), "bad");
      });
    }
    paint();
    return s;
  }

  /* 소식 메일 — 받는 중이면 주소와 '그만 받기', 아니면 주소 칸과 '소식 받기'. 가입 창이 '내 정보에서 언제든 끊을 수
     있습니다'라고 약속한 자리다. 015 가 없으면(not_ready) 칸을 숨긴 채 둔다(없는 기능을 보여 주지 않는다) */
  function meNews() {
    var s = meSec("me-news", t("bd.me.newsH", "소식 메일"));
    s.hidden = true;
    s.appendChild(el("p", "form-hint me-news-d", t("bd.me.newsD", "인순이 새 공연·방송 소식을 이메일로 받습니다. 주소는 다른 회원에게 보이지 않고, 소식 메일 외에는 쓰지 않습니다.")));
    var cur = el("p", "me-news-cur");
    var acts = el("div", "me-news-acts");
    var msg = msgNode();
    s.appendChild(cur);
    s.appendChild(acts);
    s.appendChild(msg);
    var on = false, mail = "", busy = false;
    function paint(focus) {
      cur.textContent = "";
      acts.textContent = "";
      var first;
      if (on) {
        cur.appendChild(el("span", "bd-badge me-news-on", t("bd.me.newsOn", "받는 중")));
        cur.appendChild(el("span", "me-news-e", mail));
        first = btn("btn btn--ghost btn--sm me-news-b", t("bd.me.newsOff", "그만 받기"));
        first.addEventListener("click", function () { save(false); });
        acts.appendChild(first);
      } else {
        cur.appendChild(el("span", "me-song-none", t("bd.me.newsNone", "받지 않습니다.")));
        var fm = el("form", "me-news-f");
        fm.setAttribute("novalidate", "");
        var fe = field("me-news-e", t("bd.newsEmail", "소식 받을 이메일"), "email", { autocomplete: "email", inputmode: "email", maxlength: "254", spellcheck: "false" });
        var inp = $("input", fe);
        inp.value = mail || tokenEmail();
        inp.addEventListener("input", function () { inp.removeAttribute("aria-invalid"); });
        fm.appendChild(fe);
        first = btn("btn btn--ghost btn--sm me-news-b", t("bd.me.newsGo", "소식 받기"), "submit");
        fm.appendChild(first);
        fm.addEventListener("submit", function (e) {
          e.preventDefault();
          var v = inp.value.trim();
          if (!emailOk(v)) { say(msg, why("bad_email"), "bad"); inp.setAttribute("aria-invalid", "true"); try { inp.focus(); } catch (e2) {} return; }
          save(true, v);
        });
        acts.appendChild(fm);
      }
      if (focus) { try { first.focus(); } catch (e) {} }
    }
    function save(want, v) {
      if (busy) return;
      busy = true;
      say(msg, t("bd.me.saving", "저장하는 중…"));
      rpc("member_news_set", { p_on: want, p_email: want ? v : null, p_source: "me" }, true).then(function (r) {
        busy = false;
        if (r && r.ok) {
          on = !!r.on;
          mail = r.email || (want ? v : "");
          paint(true);
          say(msg, on ? fmt(t("bd.me.newsOkF", "{e} 로 소식을 보내 드립니다."), { e: mail }) : t("bd.me.newsOffOk", "소식 메일을 그만 받습니다. 주소를 지웠습니다."), "ok");
          return;
        }
        say(msg, why(r && r.reason), "bad");
      });
    }
    rpc("member_news_get", {}, true).then(function (r) {
      if (!r || !r.ok) return;
      on = !!r.on;
      mail = r.email || "";
      s.hidden = false;
      paint(false);
      /* 탈퇴 경고에 한 문장 — 015 의 명단(회원과 묶임)에 있을 때만 참이다(탈퇴하면 함께 지워진다) */
      var ln = on && s.parentNode && s.parentNode.querySelector(".bd-leave-note");
      if (ln && !ln.__news) { ln.__news = 1; ln.appendChild(document.createTextNode(" " + t("bd.leaveNoteNews", "소식 메일 주소도 함께 지웁니다."))); }
    });
    return s;
  }

  function stLabel(st) {
    return st === "pending" ? t("bd.st.pending", "확인 중") : st === "rejected" ? t("bd.st.rejected", "내려짐") : t("bd.st.approved", "공개");
  }
  function stBadge(st) { return el("span", "bd-badge me-st me-st--" + (st === "pending" || st === "rejected" ? st : "approved"), stLabel(st)); }
  /* 내가 쓴 글 한 줄 — 제목 · 날짜 / 상태 · 게시판 · 댓글 수(남들이 보는 숫자) · 공연 방명록이면 공연 이름. 누르면 그 글 */
  function meRow(x) {
    var li = el("li", "cafe-row me-row");
    li.setAttribute("data-id", x.id);
    var a = el("a", "cafe-link");
    a.href = "#p" + x.id;
    a.appendChild(el("span", "cafe-title", x.title));
    a.appendChild(timeEl(x.created_at, when(x.created_at)));
    var by = el("span", "cafe-by");
    by.appendChild(stBadge(x.status));
    by.appendChild(dot());
    by.appendChild(el("span", "cafe-tag", boardName(x.board)));
    if (x.comments) { by.appendChild(dot()); by.appendChild(el("span", "cafe-cn", fmt(t("bd.cmtN", "댓글 {n}"), { n: x.comments }))); }
    if (x.gig && (x.gig.title_ko || x.gig.code)) {
      by.appendChild(dot());
      by.appendChild(el("span", "cafe-gig", (isEN() && x.gig.title_en) || x.gig.title_ko || x.gig.code));
    }
    a.appendChild(by);
    li.appendChild(a);
    return li;
  }
  /* 내 댓글 한 줄 — 본문 · 날짜 / 상태 · 어느 글. 그 글을 지금 볼 수 없으면(남의 글이 내려졌거나 다시 확인 중) 링크하지 않는다 */
  function meCRow(x) {
    var li = el("li", "cafe-row me-row me-crow");
    li.setAttribute("data-c", x.id);
    var a = el(x.post_visible ? "a" : "div", x.post_visible ? "cafe-link" : "cafe-link me-gone");
    if (x.post_visible) a.href = "#p" + x.post_id;
    a.appendChild(el("span", "cafe-title me-cbody", x.body));
    a.appendChild(timeEl(x.created_at, when(x.created_at)));
    var by = el("span", "cafe-by");
    by.appendChild(stBadge(x.status));
    by.appendChild(dot());
    by.appendChild(el("span", "me-on", x.post_visible
      ? fmt(t("bd.me.onF", "‘{t}’에 단 댓글"), { t: x.post_title || "" })
      : t("bd.me.onGone", "지금은 볼 수 없는 글에 단 댓글")));
    a.appendChild(by);
    li.appendChild(a);
    return li;
  }
  /* 목록 칸 하나(글·댓글 공용) — 첫 쪽은 받은 것, '더 보기'는 서버에 다음 쪽(013) 또는 받아 둔 것에서 20개씩(010 board_mine 은 최근 100개) */
  function meList(o) {
    var s = meSec(o.cls, o.title, o.ok ? o.total : undefined);
    var m = el("p", "sb-msg me-lmsg");
    m.setAttribute("role", "status");
    if (!o.ok) { s.appendChild(m); say(m, why(o.reason), "bad"); return s; }
    var ol = el("ol", "cafe-rows me-rows");
    s.appendChild(ol);
    var more = btn("btn btn--ghost me-more", t("sb.more", "더 보기"));
    var shown = 0;
    function add(rows) {
      var first = null;
      rows.forEach(function (x) { var li = o.row(x); if (!first) first = li; ol.appendChild(li); });
      return first;
    }
    function focusNew(li) { var a = li && li.querySelector("a, .cafe-link"); if (a && a.focus) { if (!a.hasAttribute("href")) a.setAttribute("tabindex", "-1"); try { a.focus({ preventScroll: true }); } catch (e) {} } }
    if (o.page) {
      add(o.rows);
      more.hidden = !o.more;
      more.addEventListener("click", function () {
        var last = o.rows.length ? o.rows[o.rows.length - 1].id : null;
        more.disabled = true;
        say(m, "");
        rpc(o.page, { p_before: last, p_limit: 20 }, true).then(function (r) {
          more.disabled = false;
          if (!r || !r.ok) { say(m, why(r && r.reason), "bad"); return; }
          var rows = r.rows || [];
          Array.prototype.push.apply(o.rows, rows);    /* 받아 둔 것(ME.data)에도 더한다 — 글을 보고 돌아와도 그대로 */
          o.setMore(!!r.more);
          more.hidden = !r.more;
          focusNew(add(rows));
        });
      });
    } else {
      var step = function () { var li = add(o.rows.slice(shown, shown + 20)); shown = Math.min(o.rows.length, shown + 20); more.hidden = shown >= o.rows.length; return li; };
      step();
      more.addEventListener("click", function () { focusNew(step()); });
    }
    if (!o.rows.length) {
      var e = el("p", "me-empty", o.empty);
      s.appendChild(e);
      if (o.emptyGo) s.appendChild(o.emptyGo);
    }
    s.appendChild(more);
    s.appendChild(m);
    return s;
  }
  function mePosts(p, full) {
    var posts = p.posts || { ok: false };
    var go2 = null;
    if (canWrite()) {
      go2 = el("a", "me-go", t("bd.me.firstPost", "첫 글 쓰기 →"));
      go2.href = "#write";
    }
    return meList({
      cls: "me-posts", title: t("bd.me.postsH", "내가 쓴 글"), ok: !!posts.ok, reason: posts.reason,
      total: full && p.counts && p.counts.posts ? p.counts.posts.total : (posts.rows || []).length,
      rows: posts.rows || [], more: !!posts.more, page: full ? "member_my_posts" : null,
      setMore: function (v) { posts.more = v; }, row: meRow,
      empty: t("bd.me.noPost", "아직 쓴 글이 없습니다."), emptyGo: go2
    });
  }
  function meCmts(p) {
    var c = p.comments || { ok: false };
    return meList({
      cls: "me-cmts", title: t("bd.me.cmtsH", "내 댓글"), ok: !!c.ok, reason: c.reason,
      total: p.counts && p.counts.comments ? p.counts.comments.total : (c.rows || []).length,
      rows: c.rows || [], more: !!c.more, page: "member_my_comments",
      setMore: function (v) { c.more = v; }, row: meCRow,
      empty: t("bd.me.noCmt", "아직 남긴 댓글이 없습니다.")
    });
  }

  /* 별명 바꾸기 — 테두리 단추는 '별명 저장' 하나, 별명을 고쳤을 때만 눌린다(검토 8번) */
  function meNick(p) {
    var s = meSec("me-nickx", t("bd.rename", "별명 바꾸기"));
    var f = el("form", "bd-aform me-nickf");
    /* enterkeyhint — 자판의 엔터 자리에 '완료'가 보여 그것으로도 저장된다는 것을 알 수 있게(검토 4바퀴 14번) */
    f.appendChild(field("bd-mn", t("bd.me.newNick", "새 별명"), "text", { maxlength: "12", required: "", autocomplete: "nickname", enterkeyhint: "done" }));
    f.appendChild(el("p", "form-hint", t("bd.nickHint", "2~12자 · 한글·영문·숫자. '인순이'·'운영자'처럼 오해를 부르는 이름은 쓸 수 없습니다.")));
    var go2 = btn("btn btn--ghost btn--sm", t("bd.saveNick", "별명 저장"), "submit");
    f.appendChild(go2);
    var m = msgNode();
    f.appendChild(m);
    var inp = $("#bd-mn", f);
    inp.value = p.nickname || "";
    function dirty() { go2.disabled = inp.value.trim() === (p.nickname || ""); }
    inp.addEventListener("input", dirty);
    /* 자판이 올라와도 칸과 '별명 저장'이 함께 보이게(공용 맞춤, 검토 4바퀴 14번) */
    kbBind(inp, function () { return go2; });
    dirty();
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      go2.disabled = true;
      rpc("member_rename", { p_nickname: inp.value }, true).then(function (r) {
        go2.disabled = false;
        if (r && r.ok) {
          p.nickname = r.nickname || inp.value.trim().replace(/\s+/g, " ");
          inp.value = p.nickname;
          if (S.me) S.me.nickname = p.nickname;
          var nt = sec && sq("#cafe-me .me-nick-t");
          if (nt) nt.textContent = p.nickname;
          say(m, t("bd.nickOk", "별명을 바꿨습니다."), "ok");
          dirty();
          S.rowsBoard = null;    /* 목록의 내 글 줄에 새 별명이 보이게 — 목록으로 돌아가면 다시 받는다 */
          loadMe().then(function () { renderHM(); emit("state"); });
        } else {
          say(m, why(r && r.reason), "bad");
          dirty();
        }
      });
    });
    s.appendChild(f);
    return s;
  }

  /* 로그아웃 · 탈퇴(확인 두 번) — 글자 링크. 끝나면 사랑방 목록으로, 무슨 일이 있었는지 한 줄 */
  function meAcct(p, full) {
    var row2 = el("div", "bd-me-acts me-acts");
    var m = msgNode();
    function leaveTo(text) {
      S.me = null; ME.data = null; S.rowsBoard = null;
      renderHM(); emit("state");
      S.flash = text; S.flashKind = "ok";
      go("#b=" + (S.board || "all"));
    }
    if (!p.admin) {
      row2.appendChild(el("p", "form-hint bd-leave-note", liveOn()
        ? (full ? t("bd.leaveNoteLiveSong", "탈퇴하면 글·댓글·도장·응원·투표 기록과 내 노래가 함께 지워집니다.")
                : t("bd.leaveNoteLive", "탈퇴하면 글·댓글·도장·응원·투표 기록이 함께 지워집니다."))
        : (full ? t("bd.leaveNoteSong", "탈퇴하면 글·댓글과 내 노래가 함께 지워집니다.")
                : t("bd.leaveNote", "탈퇴하면 글·댓글이 함께 지워집니다."))));
    }
    var out = btn("bd-link", t("bd.logout", "로그아웃"));
    out.addEventListener("click", function () {
      out.disabled = true;
      Auth.signOut().then(function () {
        forgetDevice();
        leaveTo(t("bd.loggedOut", "로그아웃했습니다."));
      });
    });
    row2.appendChild(out);
    if (!p.admin) {
      var sp = el("span", "bd-dot", "·");
      sp.setAttribute("aria-hidden", "true");
      row2.appendChild(sp);
      var leave = btn("bd-link bd-leave", t("bd.leave", "탈퇴하기"));
      leave.addEventListener("click", function () {
        if (!window.confirm(t("bd.leaveQ1", "탈퇴하면 쓰신 글과 댓글이 모두 지워지고 되돌릴 수 없습니다. 탈퇴할까요?"))) return;
        if (!window.confirm(t("bd.leaveQ2", "정말 탈퇴할까요? 이 확인이 마지막입니다."))) return;
        leave.disabled = true;
        rpc("member_leave", {}, true).then(function (r) {
          leave.disabled = false;
          if (r && r.ok) {
            clearS(); forgetDevice();
            leaveTo(r.partial
              ? t("bd.leftPartial", "글·댓글·회원 정보를 지웠습니다. 로그인 계정 삭제는 운영자에게 요청해 주세요.")
              : t("bd.left", "탈퇴했습니다. 쓰신 글과 댓글도 모두 지웠습니다."));
          } else say(m, why(r && r.reason), "bad");
        });
      });
      row2.appendChild(leave);
    }
    row2.appendChild(m);
    return row2;
  }

  /* ================================================================
     3. 회원 창(로그인·가입·내 정보) — 모든 페이지 공용, 페이지 맨 위 층
     ================================================================ */
  var sheet = null, opener = null, sheetView = null, sheetOpts = null, vvBound = null;
  var INERT = ".site-header, #main, .footer-min, .back-to-top, .gig-head, .gig-bar";

  function ensureSheet() {
    if (sheet && document.body.contains(sheet)) return sheet;
    sheet = el("div", "bd-sheet");
    sheet.id = "bd-sheet";
    sheet.hidden = true;
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "bd-sheet-h");
    var box = el("div", "bd-sheet-box");
    var x = el("button", "bd-x", "×");
    x.type = "button";
    x.setAttribute("aria-label", t("bd.close", "닫기"));
    x.addEventListener("click", closeSheet);
    box.appendChild(x);
    box.appendChild(el("h2", "bd-sheet-h"));
    box.querySelector(".bd-sheet-h").id = "bd-sheet-h";
    box.appendChild(el("div", "bd-sheet-body"));
    sheet.appendChild(box);
    sheet.addEventListener("click", function (e) { if (e.target === sheet) closeSheet(); });
    sheet.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      /* 창 안에서만 맴돌게 — 뒤 화면으로 초점이 새면 화면 낭독기 사용자가 길을 잃는다 */
      var f = Array.prototype.filter.call(box.querySelectorAll('button, input, textarea, select, summary, a[href], [tabindex]:not([tabindex="-1"])'), function (n) {
        return !n.disabled && n.offsetParent !== null;
      });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    /* 폰에서 글칸을 누르면 자판이 올라온다. 그 칸과 그 아래 단추가 자판에 가리지 않게 —
       자판이 올라와 보이는 화면(visualViewport)이 줄었으면 칸을 창 위쪽에 붙여 아래를 넓게 연다 */
    sheet.addEventListener("focusin", function (e) {
      var f = e.target;
      if (!f || !f.matches || !f.matches(TEXT_FIELD)) return;
      vvSync();
      setTimeout(function () { fieldIntoView(f); }, 50);
    });
    document.body.appendChild(sheet);
    /* Esc 는 문서 전체에서 받는다 — 창 안의 단추가 처리 중 잠기면 초점이 창 밖(body)으로 빠져
       창에 단 듣개로는 Esc 가 닿지 않았다(화면 검사기가 잡음) */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet();
    });
    return sheet;
  }

  var TEXT_FIELD = 'input[type="text"], input[type="email"], input[type="password"], input[type="search"], textarea';
  var vvLastH = 0;
  function vvSync() {
    if (!sheet || sheet.hidden) return;
    var vv = window.visualViewport;
    if (!vv || !vv.height) { sheet.style.removeProperty("--vvt"); sheet.style.removeProperty("--vvh"); return; }
    sheet.style.setProperty("--vvt", (vv.offsetTop || 0) + "px");
    sheet.style.setProperty("--vvh", vv.height + "px");
    /* 실기기는 초점이 먼저 가고 자판은 나중에 올라온다 — focusin 때 한 번 맞춘 것으로는 부족했다.
       보이는 화면 높이가 바뀌면 지금 초점 칸과 그 폼의 주 단추를 다시 맞춘다(검토 22번) */
    if (vv.height !== vvLastH) {
      vvLastH = vv.height;
      var a = document.activeElement;
      if (a && sheet.contains(a) && a.matches && a.matches(TEXT_FIELD)) {
        requestAnimationFrame(function () { fieldIntoView(a); });
      }
    }
  }
  /* 칸을 자판 위로 — 칸 윗변부터 그 폼의 주 단추 아랫변까지가 보이는 창에 들어가면 단추 아랫변을 창 아래 8px 에
     맞춰 칸과 단추를 함께 보인다. 안 들어가면 칸을 창 위쪽에 붙인다 */
  function fieldIntoView(f) {
    var box = sheet && sheet.querySelector(".bd-sheet-box");
    if (!box || !box.contains(f)) return;
    var vv = window.visualViewport;
    var squeezed = vv && vv.height && vv.height < window.innerHeight * 0.75;
    var wrap = f.closest(".form-field") || f;
    /* 가입 마치기 — 주 단추가 창 아래에 붙어 있다(.bd-jfoot sticky). 칸이 그 띠 위로 보이게만 맞춘다.
       노래 찾기 칸은 결과가 아래로 펼쳐지므로 창 위쪽에 붙여 결과 자리를 넓힌다 */
    var jf = f.closest("form") && f.closest("form").querySelector(".bd-jfoot");
    if (jf && box.scrollHeight > box.clientHeight + 1 && getComputedStyle(jf).position === "sticky") {
      var bt0 = box.getBoundingClientRect().top, fr = f.getBoundingClientRect(), ft = jf.getBoundingClientRect().top;
      if (f.closest(".bd-songp")) { box.scrollTop += f.closest(".bd-songp").getBoundingClientRect().top - bt0 - 12; return; }
      if (fr.bottom > ft - 8) box.scrollTop += fr.bottom - (ft - 8);
      else if (fr.top < bt0 + 8) box.scrollTop -= bt0 + 8 - fr.top;
      return;
    }
    if (squeezed && box.scrollHeight > box.clientHeight + 1) {
      var bt = box.getBoundingClientRect().top;
      /* 기준은 칸의 라벨(wrap)이 아니라 칸 자신 — 라벨까지 함께 넣으려다 320×568·21px(자판 260)에서 '가입 마치기'가
         자판 뒤(302)로 갔고, 이메일 칸에서는 '로그인하기'가 340 이었다(검토 3바퀴 26번). 칸과 단추가 함께 들어가면
         단추 아랫변을 창 아래 8px 에, 안 들어가면 칸을 창 위쪽에 붙인다 */
      var top = f.getBoundingClientRect().top - bt;
      var form = f.closest("form");
      var go = form ? form.querySelector(".btn--solid, button[type=submit]") : null;
      var bottom = go ? go.getBoundingClientRect().bottom - bt : 0;
      if (go && bottom > top && bottom - top <= box.clientHeight - 8) box.scrollTop += bottom - (box.clientHeight - 8);
      else box.scrollTop += top - 8;
    } else if (wrap.scrollIntoView) {
      wrap.scrollIntoView({ block: "nearest" });
    }
  }

  function setInert(on) {
    Array.prototype.forEach.call(document.querySelectorAll(INERT), function (n) {
      if (n === sheet || n.contains(sheet)) return;
      if (on) n.setAttribute("inert", ""); else n.removeAttribute("inert");
      try { n.inert = on; } catch (e) {}
    });
  }

  function closeSheet() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    sheetView = null;
    document.documentElement.classList.remove("bd-lock");
    setInert(false);
    if (vvBound && vvBound.removeEventListener) {
      vvBound.removeEventListener("resize", vvSync);
      vvBound.removeEventListener("scroll", vvSync);
    }
    vvBound = null;
    if (opener && opener.focus && document.body.contains(opener)) { try { opener.focus(); } catch (e) {} }
    opener = null;
  }

  function field(id, label, type, attrs) {
    var w = el("div", "form-field");
    var l = el("label", null, label);
    l.setAttribute("for", id);
    var i = el("input");
    i.id = id;
    i.type = type || "text";
    for (var k in (attrs || {})) if (attrs.hasOwnProperty(k)) i.setAttribute(k, attrs[k]);
    w.appendChild(l);
    w.appendChild(i);
    return w;
  }
  function btn(cls, text, type) {
    var b = el("button", cls, text);
    b.type = type || "button";
    return b;
  }
  function msgNode() {
    var m = el("p", "sb-msg bd-smsg");
    m.setAttribute("role", "status");
    m.setAttribute("aria-live", "polite");
    return m;
  }
  function lede(body, text) {
    var p = el("p", "bd-sheet-lede", text);
    p.id = "bd-sheet-lede";
    body.appendChild(p);
    return p;
  }

  function openSheet(view, from, note, opts) {
    view = view || "start";
    if (!boardOn()) return;
    /* '내 정보'는 창이 아니라 화면이다(community.html#me) — 옛 부름이 남아 있어도 그리로 */
    if (view === "me") { goMe(); return; }
    /* 공연 화면에서 열리는 창은 어디서 불렀든(헤더 입구·로그인 왕복 뒤의 가입 마치기·카카오 실패 안내)
       공연 문맥이다 — 경고와 함께 열 때 공연 제목이 빠지던 것(검토 32번) */
    opts = opts || {};
    if (onLivePage() && !opts.ctx) opts.ctx = "gig";
    if (view === "start" && S.settings && !S.settings.ok) { S.settings = null; S.settingsP = null; }
    if (view === "start" && !S.settings) prefetchSettings();
    ensureSheet();
    if (from) opener = from;
    else if (!opener) opener = byId("hm");
    sheetView = view;
    sheetOpts = opts;
    var h = sheet.querySelector(".bd-sheet-h"), body = sheet.querySelector(".bd-sheet-body");
    body.textContent = "";
    sheet.__gs = null;
    var builder = VIEWS[view] || VIEWS.start;
    builder(h, body, note, opts);
    if (byId("bd-sheet-lede") && sheet.contains(byId("bd-sheet-lede"))) sheet.setAttribute("aria-describedby", "bd-sheet-lede");
    else sheet.removeAttribute("aria-describedby");
    var wasHidden = sheet.hidden;
    sheet.hidden = false;
    document.documentElement.classList.add("bd-lock");
    setInert(true);
    vvSync();
    var vv = window.visualViewport;
    if (wasHidden && vv && vv.addEventListener) {
      vv.addEventListener("resize", vvSync);
      vv.addEventListener("scroll", vvSync);
      vvBound = vv;
    }
    sheet.querySelector(".bd-sheet-box").scrollTop = 0;
    setTimeout(function () {
      if (sheet.hidden) return;
      /* 첫 초점 — 경고가 있으면 경고(무슨 일이 있었는지 먼저), 아니면 카카오 단추, 없으면 첫 입력칸.
         '내 정보'는 글칸에 두지 않는다(폰에서 열자마자 자판이 올라온다). '가입 마치기'는 '모두 동의'에 —
         별명은 카카오 별명으로 이미 채워져 있는데 글칸에 두면 자판이 동의·주 단추를 덮었다(검토 22번).
         카카오가 방금 실패했으면 같은 단추가 아니라 이메일 탭에(검토 29번) */
      var first = null;
      if (view === "join") first = body.querySelector("#bd-jall");
      else if (view === "start") {
        first = body.querySelector(".bd-alert") || body.querySelector(".bd-kakao:not(.bd-kakao--low)") ||
          (kakaoFailRecent() ? body.querySelector('.bd-tab[aria-pressed="true"]') : null) ||
          body.querySelector(".bd-pane input");
      } else if (view !== "me" && view !== "sent") {
        first = body.querySelector("input:not([type=checkbox]):not([type=radio]), button");
      }
      var tgt = first || sheet.querySelector(".bd-x");
      try { tgt.focus(); } catch (e) {}
    }, 30);
  }
  /* 설정을 기다리던 창이 아직 그 화면이면 다시 그린다 */
  function reopenIfWaiting() {
    if (sheet && !sheet.hidden && sheetView === "start" && sheet.querySelector(".bd-wait")) {
      var note = sheet.__note;
      openSheet("start", null, note, sheetOpts);
    }
  }

  function alertNode(text) {
    var a = el("p", "bd-alert", text);
    a.setAttribute("role", "alert");
    return a;
  }

  /* ---------- 노래 고르기(가입 질문 · 내 정보 공용) ----------
     자유 입력을 받지 않는다 — songs.json 의 103곡(서버 013 의 member_song_choices 와 같은 목록)에서만.
     찾기 칸 + 결과 단추 다섯 개. 자판의 '이동'(Enter)은 첫 결과를 고르고 가입 폼을 보내지 않는다. */
  function loadSongs() {
    if (S.songsP) return S.songsP;
    S.songsP = fetch("assets/data/songs.json").then(function (r) { return r.json(); }).then(function (d) {
      return ((d && d.songs) || []).map(function (x) { return { k: x.k, t: x.t, y: x.y }; }).filter(function (x) { return x.t; });
    })["catch"](function () { S.songsP = null; return []; });
    return S.songsP;
  }
  /* 띄어쓰기·문장부호를 빼고 견준다 — '거위의꿈'·'거위의 꿈'·'거위 의꿈' 이 같은 노래 */
  function songKey(s) { return String(s || "").toLowerCase().replace(/[\s'"’‘“”.,!?·~()\[\]「」『』\-]/g, ""); }
  function songMatch(list, q) {
    var k = songKey(q);
    if (!k) return [];
    var head = [], mid = [];
    list.forEach(function (x) {
      var a = songKey(x.t), b = songKey(x.k);
      if (a.indexOf(k) === 0 || b.indexOf(k) === 0) head.push(x);
      else if (a.indexOf(k) > 0 || b.indexOf(k) > 0) mid.push(x);
    });
    return head.concat(mid);
  }
  var SONG_MAX = 5;
  function songPicker(o) {
    var w = el("div", "bd-songp");
    var lab = el("label", "bd-songp-l" + (o.srLabel ? " sr-only" : ""), o.label);
    lab.setAttribute("for", o.id);
    var inp = el("input");
    inp.id = o.id;
    inp.type = "search";
    inp.setAttribute("autocomplete", "off");
    inp.setAttribute("enterkeyhint", "search");
    inp.setAttribute("placeholder", t("bd.songPh", "제목 한두 글자로 찾기"));
    var ul = el("ul", "bd-songp-r");
    ul.id = o.id + "-r";
    var st = el("p", "form-hint bd-songp-s");
    st.id = o.id + "-s";
    st.setAttribute("role", "status");
    st.setAttribute("aria-live", "polite");
    var idle = o.hint || t("bd.songHint", "제목 한두 글자만 적어도 찾아 드립니다.");
    st.textContent = idle;
    inp.setAttribute("aria-describedby", st.id);
    inp.setAttribute("aria-controls", ul.id);
    var seq = 0;
    function paint() {
      var my = ++seq, q = inp.value;
      loadSongs().then(function (L) {
        if (my !== seq) return;
        ul.textContent = "";
        if (!songKey(q)) { st.textContent = idle; return; }
        if (!L.length) { st.textContent = t("bd.songNoList", "노래 목록을 불러오지 못했습니다. 잠시 뒤 다시 찾아 주세요."); return; }
        var hit = songMatch(L, q);
        hit.slice(0, SONG_MAX).forEach(function (x) {
          var li = el("li");
          var b = btn("bd-songp-o");
          b.appendChild(el("span", "bd-songp-t", x.t));
          if (x.y) b.appendChild(el("span", "bd-songp-y", String(x.y)));
          b.addEventListener("click", function () {
            inp.value = "";
            ul.textContent = "";
            st.textContent = idle;
            o.onPick(x);
          });
          li.appendChild(b);
          ul.appendChild(li);
        });
        st.textContent = !hit.length ? t("bd.songNone", "목록에 없는 제목입니다. 다른 글자로 찾아 주세요.")
          : hit.length > SONG_MAX ? fmt(t("bd.songManyF", "{n}곡 중 {m}곡을 보여 드립니다. 글자를 더 적으면 좁혀집니다."), { n: hit.length, m: SONG_MAX })
          : fmt(t("bd.songFoundF", "{n}곡을 찾았습니다."), { n: hit.length });
      });
    }
    inp.addEventListener("input", paint);
    inp.addEventListener("focus", function () { loadSongs(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();                 /* 가입 폼을 보내지 않는다 */
      var b = ul.querySelector("button");
      if (b) b.click();
    });
    w.appendChild(lab);
    w.appendChild(inp);
    w.appendChild(ul);
    w.appendChild(st);
    return {
      node: w, input: inp,
      reset: function () { inp.value = ""; ul.textContent = ""; st.textContent = idle; seq++; }
    };
  }
  /* 가입 질문 '좋아하는 인순이 노래 (선택)' — 형님 결정: 질문 1개, 답은 선택.
     공연장(/live)에서는 접어 둔다 — 객석에서 가입은 30초 안에 끝나야 한다(펼치면 그때 고른다).
     고르면 칸 대신 '고른 노래 「…」 · 다시 고르기'. 가입이 된 뒤에 저장한다(member_set_song) */
  function songQuestion(fold) {
    var chosen = null;
    var w = el(fold ? "details" : "div", "bd-songq");
    var q = t("bd.songQ", "좋아하는 인순이 노래 (선택)");
    if (fold) w.appendChild(el("summary", "bd-songq-h", t("bd.songQFold", "좋아하는 인순이 노래도 알려 주실래요? (선택)")));
    var body = el("div", "bd-songq-b");
    var pk = songPicker({ id: "bd-js", label: q, srLabel: fold,
      hint: t("bd.songQHint", "건너뛰어도 가입이 됩니다. 고르시면 내 정보에 '내 노래'로 남습니다."),
      onPick: function (x) { chosen = x; paint(); } });
    var pickedP = el("p", "bd-songq-c");
    pickedP.hidden = true;
    body.appendChild(pk.node);
    body.appendChild(pickedP);
    w.appendChild(body);
    function paint() {
      pickedP.textContent = "";
      pk.node.hidden = !!chosen;
      pickedP.hidden = !chosen;
      if (!chosen) return;
      pickedP.appendChild(el("span", "bd-songq-cl", t("bd.songPicked", "고른 노래")));
      pickedP.appendChild(el("span", "bd-songq-ct", "「" + chosen.t + "」"));
      if (chosen.y) pickedP.appendChild(el("span", "bd-songp-y", String(chosen.y)));
      var again = btn("bd-link", t("bd.songAgain", "다시 고르기"));
      again.addEventListener("click", function () { chosen = null; paint(); try { pk.input.focus(); } catch (e) {} });
      pickedP.appendChild(again);
      try { again.focus({ preventScroll: true }); } catch (e) {}
    }
    return { node: w, value: function () { return chosen; } };
  }

  /* 소식 메일 받기(선택) — 체크하지 않아도 가입된다(모두 동의에 묶지 않는다). 받는 것·쓰는 곳·보관을 칸 바로 아래에서
     말한다(개인정보 선택 동의 — 항목·목적·보유 기간·거부할 수 있다는 것). 주소 칸은 체크했을 때만 연다 */
  var EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;
  /* 'a@b..com'·'a@b.com.' 같은 오타를 동의 주소로 받지 않는다 */
  function emailOk(v) { return !!v && v.length <= 254 && EMAIL_RE.test(v) && v.indexOf("..") < 0 && v.charAt(v.length - 1) !== "."; }
  function newsQuestion() {
    var w = el("div", "bd-news");
    var lb = el("label", "bd-check bd-news-c");
    var c = el("input"); c.type = "checkbox"; c.id = "bd-jnews";
    lb.appendChild(c);
    var tx = el("span");
    tx.appendChild(el("span", "bd-news-opt", t("bd.newsOpt", "선택")));
    tx.appendChild(document.createTextNode(t("bd.newsQ", "인순이 새 공연·방송 소식을 이메일로 먼저 받겠습니다")));
    lb.appendChild(tx);
    w.appendChild(lb);
    var box = el("div", "bd-news-b");
    box.hidden = true;
    /* type=email 이 아니라 text + inputmode=email — 가입 폼의 브라우저 기본 검사가 영어 말풍선으로 막지 않게(틀린 주소는 아래 value() 가
       칸 바로 아래에 우리 말로 알린다). 폰 자판은 그대로 이메일 자판이다 */
    var fe = field("bd-jne", t("bd.newsEmail", "소식 받을 이메일"), "text", { autocomplete: "email", inputmode: "email", maxlength: "254", spellcheck: "false", autocapitalize: "off" });
    box.appendChild(fe);
    var err = el("p", "bd-ferr");
    err.id = "bd-jne-err";
    err.setAttribute("role", "status");
    box.appendChild(err);
    w.appendChild(box);
    /* 동의 안내(받는 것·쓰는 곳·보관·보내는 곳·거부해도 된다)를 체크 칸에 묶는다 — 화면낭독기가 체크 칸과 함께 읽는다 */
    var hint = el("p", "form-hint bd-news-h", t("bd.newsHint", "받는 것: 이메일 주소 · 쓰는 곳: 인순이 공연·방송 소식 메일 · 보내는 곳: 인순이 공식 팬사이트(소속사 소솝) · 보관: 그만 받을 때까지(탈퇴하면 바로 지웁니다). 체크하지 않아도 가입됩니다. 내 정보에서 언제든 끊을 수 있습니다."));
    hint.id = "bd-jnews-h";
    c.setAttribute("aria-describedby", hint.id);
    w.appendChild(hint);
    var inp = $("input", fe);
    var pre = tokenEmail();
    if (pre) inp.value = pre;
    function clearErr() { err.textContent = ""; inp.removeAttribute("aria-invalid"); inp.removeAttribute("aria-describedby"); }
    c.addEventListener("change", function () {
      box.hidden = !c.checked;
      clearErr();
      if (c.checked && !inp.value) { try { inp.focus(); } catch (e) {} }
    });
    inp.addEventListener("input", clearErr);
    return {
      node: w,
      /* 체크했으면 주소 — 모양이 틀리면 칸 아래에 말하고 null(가입을 멈춘다). 체크하지 않았으면 "" */
      value: function () {
        if (!c.checked) return "";
        var v = inp.value.trim();
        if (emailOk(v)) return v;
        err.textContent = v ? t("bd.newsBad", "이메일 주소를 다시 확인해 주세요. 소식을 받지 않으려면 위 칸의 체크를 풀어 주세요.")
                            : t("bd.newsEmpty", "소식 받을 이메일을 적어 주세요. 받지 않으려면 위 칸의 체크를 풀어 주세요.");
        inp.setAttribute("aria-invalid", "true");
        inp.setAttribute("aria-describedby", err.id);
        try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); }
        if (inp.scrollIntoView) inp.scrollIntoView({ block: "nearest" });
        return null;
      }
    };
  }
  /* 소식 메일 저장 — 015(회원별 member_news_set)에만. 실패해도 가입은 그대로다.
     001 의 구독 명단(subscribe)으로 돌리지 않는다 — 회원과 묶이지 않아 '내 정보에서 끊기·탈퇴하면 지움'을 지킬 수 없다
     (2026-10-03 사전 검토). 015 전이면 config.news 를 꺼 둔다 */
  function saveNews(email, src) {
    return rpc("member_news_set", { p_on: true, p_email: email, p_source: src || null }, true).then(function (r) {
      return r || { ok: false };
    });
  }
  function newsSrc(gig) {
    var code = "";
    try { code = (gig && window.INSOONI_GIG && window.INSOONI_GIG.state().code) || ""; } catch (e) {}
    return code && /^[A-Z0-9]{1,12}$/.test(code) ? "gig:" + code : "join";
  }

  var VIEWS = {
    start: function (h, body, note, opts) {
      var gig = opts.ctx === "gig";
      /* 카카오가 방금(10분 안) 끝나지 못했다 — 같은 실패 경로를 맨 위 노란 단추로 다시 권하지 않는다(검토 29·32번) */
      var kFail = !!opts.kakaoFail || kakaoFailRecent();
      sheet.__note = note;
      /* 공연 화면에서 무엇을 누르고 왔는지(gig.js needMember 의 why) — 응원·투표를 누른 사람에게 '도장을 남기려면'이라고
         하지 않는다. 가입을 마치면 누른 것과 도장이 함께 된다(gig.js runNext)는 사실 그대로(검토 3바퀴 15번) */
      var wy = gig ? opts.why : "";
      /* 창 제목·첫 문장은 창을 연 목적과 지금 단계에 맞춘다(WCAG 2.4.6) — 방명록을 남기려는 사람에게, 또 도장이 닫힌 뒤
         (집에서 방명록·끝난 공연)나 열리기 전에 '도장을 남기려면'이라고 하면 사실과 다른 안내다(검토 4바퀴 12번) */
      var ph = gig ? gigPhase() : "";
      h.textContent = !gig ? t("bd.sheetH", "로그인 · 회원가입") : gigStartH(wy, ph);
      if (opts.alert) {
        var al = alertNode(opts.alert);
        al.tabIndex = -1;      /* 첫 초점을 여기 — 무슨 일이 있었는지 먼저 읽고 Tab 으로 이메일 쪽으로 간다 */
        body.appendChild(al);
      }
      var st = S.settings;
      /* 카카오는 서버가 켜 둔 것만으로 그리지 않는다 — 실기기 왕복을 확인한 뒤 config.kakao 로 켠다(KOE205) */
      var kakao = !!(st && st.ok && st.kakao) && kakaoOn();
      var kakaoTop = kakao && !kFail;
      /* 공연 문맥: 도장이 무엇을 남기는지 먼저(혜택은 지어내지 않는다, 검토 43번). 카카오가 없으면
         없는 카카오를 권하지 않는다(검토 26·33·49번) */
      lede(body, note || (gig ? gigStartLede(wy, ph, kakaoTop)
                              : liveOn() ? t("bd.sheetLedeLive", "글쓰기·댓글·공연 도장은 회원만 할 수 있습니다. 읽기는 누구나 됩니다.")
                                         : t("bd.sheetLede", "글쓰기와 댓글은 회원만 할 수 있습니다. 읽기는 누구나 됩니다.")));
      /* 공연 단계를 아직 모를 때(공연 화면이 서버 답을 받기 전 — 카카오 왕복 직후 등) 연 창은 단계가 정해지면 제목·첫 문장을
         그 자리에서 고친다(syncGigSheet). 창을 새로 그리지 않는다 — 초점·입력이 그대로 남게 */
      /* 회원이 되면 무엇을 하는지 — 응원·투표·방명록을 누르고 온 사람에게는 이미 첫 문장이 말했으니 줄을 더하지 않는다 */
      if (gig && !note && !/^(cheer|vote|gb)$/.test(wy || "")) body.appendChild(gigPerks(ph));
      sheet.__gs = gig ? { view: "start", wy: wy, ph: ph, kt: kakaoTop, note: !!note } : null;
      if (!st) {
        /* 설정을 받는 중 — 창은 바로 띄우고(누른 반응이 늦으면 다시 누른다) 도착하면 채운다 */
        body.appendChild(el("p", "form-hint bd-wait", t("bd.wait", "잠시만요…")));
        if (S.settingsP) S.settingsP.then(reopenIfWaiting);
        return;
      }
      if (!st.ok) {
        body.appendChild(el("p", "sb-msg is-bad", why("network")));
        return;
      }
      /* 이메일 가입은 메일 확인에서 계정이 먼저 생긴다 — 동의 화면보다 앞이므로 여기서 미리 알린다 */
      var pre = el("p", "form-hint bd-pre");
      pre.appendChild(document.createTextNode(t("bd.pre1", "가입하면 ")));
      var pt = el("a", null, t("bd.terms", "이용약관")); pt.href = "terms.html"; pt.target = "_blank"; pt.rel = "noopener";
      var pp = el("a", null, t("bd.privacy", "개인정보처리방침")); pp.href = "privacy.html"; pp.target = "_blank"; pp.rel = "noopener";
      pre.appendChild(pt);
      pre.appendChild(document.createTextNode(t("bd.agree2", "과 ")));
      pre.appendChild(pp);
      pre.appendChild(document.createTextNode(t("bd.pre2", "을 따릅니다. 만 14세 이상만 가입할 수 있습니다.")));

      var m0 = msgNode();
      function kakaoBlock(low) {
        var wrap = document.createDocumentFragment();
        /* 실패 직후에는 노랑을 걷고 테두리 단추로 내린다 — '다시 누르라'고 가장 크게 말하지 않게 */
        var k = btn(low ? "bd-kakao bd-kakao--low" : "bd-kakao", null);
        k.appendChild(kakaoMark());
        k.appendChild(el("span", null, low ? t("bd.kakaoAgain", "카카오로 다시 해 보기") : t("bd.kakao", "카카오로 시작하기")));
        k.addEventListener("click", function () {
          k.disabled = true;
          if (sec) draftSave();
          Auth.kakao().then(function (r) { if (!r.ok) { k.disabled = false; say(m0, why(r.reason), "bad"); } });
        });
        wrap.appendChild(k);
        if (!low) wrap.appendChild(el("p", "form-hint bd-kakao-hint", t("bd.kakaoHint", "카카오 계정으로 바로 들어옵니다. 별명만 정하시면 됩니다.")));
        wrap.appendChild(m0);
        return wrap;
      }

      if (!st.email) {
        if (kakao) body.appendChild(kakaoBlock(kFail));
        else body.appendChild(el("p", "form-hint", t("bd.noAuth", "지금은 회원 가입을 받지 않습니다.")));
        body.appendChild(pre);
        return;
      }

      /* 공연장 + 카카오가 있으면: 이메일은 접어 두고(이미 이메일로 가입한 분만 연다) 노란 단추를 맨 아래 —
         엄지가 있던 자리(화면 아래)에 온다. 창 높이가 내용만큼 줄어 아래에서 올라오는 판이 된다(검토 37번) */
      var foldMail = gig && kakaoTop;
      /* 공연 문맥의 이메일 '처음 가입'은 카카오가 실제로 있을 때만 숨긴다 — 카카오가 꺼졌거나 방금 실패했으면
         처음 온 관객이 가입할 길이 하나도 없었다(검토 26·33·49번) */
      var canUp = st.signup && !(gig && conf().liveEmail !== true && kakaoTop && !opts.kakaoBack);

      if (kakaoTop && !foldMail) {
        body.appendChild(kakaoBlock(false));
        body.appendChild(el("p", "bd-or", t("bd.or", "또는 이메일로")));
      }
      var mailBox = body;
      if (foldMail) {
        var det = el("details", "bd-mail");
        det.appendChild(el("summary", null, canUp ? t("bd.mailFoldUp", "이메일로 가입·로그인") : t("bd.mailFold", "이메일로 가입하셨나요?")));
        body.appendChild(det);
        mailBox = det;
      }
      if (canUp) mailBox.appendChild(el("p", "form-hint bd-mailnote", t("bd.emailNote", "이메일로 가입하면 확인 메일을 한 번 거칩니다. 메일이 늦게 올 수 있습니다.")));
      else if (gig && !foldMail) mailBox.appendChild(el("p", "form-hint bd-mailnote", t("bd.emailOnlyIn", "이미 이메일로 가입하셨다면 로그인하세요.")));
      var tIn = btn("bd-tab", t("bd.tabIn", "로그인"));
      var tUp = btn("bd-tab", t("bd.tabUp", "처음 가입"));
      if (canUp) {
        var tabs = el("div", "bd-tabs");
        tabs.setAttribute("role", "group");
        tabs.setAttribute("aria-label", t("bd.emailAria", "이메일로 로그인 또는 가입"));
        tabs.appendChild(tIn);
        tabs.appendChild(tUp);
        mailBox.appendChild(tabs);
      } else if (!foldMail) {
        /* 탭이 하나뿐이면 제목인지 탭인지 모호한 잔해로 보였다(검토 9번) — 작은 제목 한 줄로 */
        mailBox.appendChild(el("h3", "bd-sub", t("bd.subIn", "이메일로 로그인")));
      }
      var pane = el("div", "bd-pane");
      mailBox.appendChild(pane);
      /* 채운 단추는 화면에 하나 — 카카오(노랑)가 있으면 이메일 단추는 테두리만 */
      var mainCls = kakaoTop ? "btn btn--ghost bd-wide" : "btn btn--solid bd-wide";
      if (kakao && kFail) {
        body.appendChild(el("p", "bd-or", t("bd.orKakao", "또는")));
        body.appendChild(kakaoBlock(true));
      }
      if (foldMail) body.appendChild(kakaoBlock(false));
      body.appendChild(pre);

      function showIn() {
        tIn.setAttribute("aria-pressed", "true"); tUp.setAttribute("aria-pressed", "false");
        pane.textContent = "";
        var f = el("form", "bd-aform");
        f.appendChild(field("bd-ie", t("bd.email", "이메일"), "email", { autocomplete: "username", required: "", inputmode: "email" }));
        f.appendChild(field("bd-ip", t("bd.pw", "비밀번호"), "password", { autocomplete: "current-password", required: "" }));
        var go2 = btn(mainCls, t("bd.doLogin", "로그인하기"), "submit");
        f.appendChild(go2);
        var m = msgNode();
        f.appendChild(m);
        /* 처음 온 분이 '로그인' 칸에 새 비밀번호를 넣고 오류만 받던 길(검토 38번) — 가입으로 가는 단추를 곁에 */
        var toUp = btn("btn btn--text bd-toup", t("bd.toUp", "처음이시면 → 처음 가입"));
        toUp.hidden = true;
        toUp.addEventListener("click", function () { tUp.click(); try { tUp.focus(); } catch (e) {} });
        if (canUp) f.appendChild(toUp);
        var fg = btn("bd-link", t("bd.forgot", "비밀번호를 잊으셨나요?"));
        fg.addEventListener("click", function () { openSheet("recover", null); });
        f.appendChild(fg);
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var em = $("#bd-ie", f).value.trim(), pw = $("#bd-ip", f).value;
          if (!em || !pw) { say(m, why("bad_login"), "bad"); toUp.hidden = false; return; }
          go2.disabled = true;
          say(m, t("bd.wait", "잠시만요…"));
          Auth.signIn(em, pw).then(function (r) {
            go2.disabled = false;
            $("#bd-ip", f).value = "";   /* 비밀번호는 입력칸에도 남기지 않는다 */
            if (!r.ok) { say(m, why(r.reason), "bad"); toUp.hidden = r.reason !== "bad_login"; return; }
            afterLogin();
          });
        });
        pane.appendChild(f);
      }
      function showUp() {
        tUp.setAttribute("aria-pressed", "true"); tIn.setAttribute("aria-pressed", "false");
        pane.textContent = "";
        var f = el("form", "bd-aform");
        f.appendChild(el("p", "form-hint", t("bd.upHint", "가입 확인 메일이 갑니다. 메일의 링크를 누르면 이 화면으로 돌아와 가입이 이어집니다.")));
        f.appendChild(field("bd-ue", t("bd.email", "이메일"), "email", { autocomplete: "email", required: "", inputmode: "email" }));
        f.appendChild(field("bd-up", t("bd.pwNew", "비밀번호 (8자 이상)"), "password", { autocomplete: "new-password", required: "", minlength: "8" }));
        f.appendChild(field("bd-up2", t("bd.pw2", "비밀번호 한 번 더"), "password", { autocomplete: "new-password", required: "", minlength: "8" }));
        var go2 = btn(mainCls, t("bd.doUp", "가입하기"), "submit");
        f.appendChild(go2);
        var m = msgNode();
        f.appendChild(m);
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var em = $("#bd-ue", f).value.trim(), p1 = $("#bd-up", f).value, p2 = $("#bd-up2", f).value;
          if (p1.length < 8) { say(m, why("weak_pw"), "bad"); return; }
          if (p1 !== p2) { say(m, why("pw_mismatch"), "bad"); return; }
          go2.disabled = true;
          say(m, t("bd.wait", "잠시만요…"));
          if (sec) draftSave();
          Auth.signUp(em, p1).then(function (r) {
            go2.disabled = false;
            $("#bd-up", f).value = ""; $("#bd-up2", f).value = "";
            if (!r.ok) { say(m, why(r.reason), "bad"); return; }
            if (r.session) { afterLogin(); return; }
            openSheet("sent", null, t("bd.sentUp3", "메일함(스팸함도)을 열어 메일 안의 링크를 눌러 주세요. 이미 가입하신 주소라면 메일이 가지 않으니, 로그인하시거나 비밀번호 찾기를 눌러 주세요."), { email: em, kind: "signup" });
          });
        });
        pane.appendChild(f);
      }
      tIn.addEventListener("click", showIn);
      tUp.addEventListener("click", showUp);
      /* 처음 쓰는 기기(이 기기로 로그인한 적 없음)는 '처음 가입'을 먼저 연다 — 대부분 처음 온 분이다(검토 38번) */
      if (canUp && !lsGet(SEEN)) showUp(); else showIn();
    },

    recover: function (h, body, note) {
      h.textContent = t("bd.recoverH", "비밀번호 다시 정하기");
      if (note) body.appendChild(el("p", "sb-msg is-bad bd-note-top", note));   /* 왜 이 창이 떴는지(만료·다른 브라우저) */
      lede(body, t("bd.recoverLede", "가입한 이메일을 적어 주세요. 비밀번호를 새로 정하는 링크를 보내 드립니다."));
      var f = el("form", "bd-aform");
      f.appendChild(field("bd-re", t("bd.email", "이메일"), "email", { autocomplete: "email", required: "", inputmode: "email" }));
      var go2 = btn("btn btn--solid bd-wide", t("bd.send", "보내기"), "submit");
      f.appendChild(go2);
      var m = msgNode();
      f.appendChild(m);
      var back = btn("bd-link", t("bd.back", "← 로그인으로"));
      back.addEventListener("click", function () { openSheet("start", null); });
      f.appendChild(back);
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var em = $("#bd-re", f).value.trim();
        if (!em) { say(m, why("bad_email"), "bad"); return; }
        go2.disabled = true;
        Auth.recover(em).then(function (r) {
          go2.disabled = false;
          if (!r.ok) { say(m, why(r.reason), "bad"); return; }
          openSheet("sent", null, t("bd.sentRe2", "그 주소로 가입된 계정이 있으면 메일이 갑니다. 메일의 링크를 눌러 새 비밀번호를 정해 주세요."));
        });
      });
      body.appendChild(f);
    },

    sent: function (h, body, note, opts) {
      h.textContent = t("bd.sentH", "메일을 확인해 주세요");
      /* 어디로 · 어떤 메일이 갔는지 — 입력한 주소를 다시 보여 주지 않았고, 커스텀 SMTP 가 없는 지금 메일은
         Supabase 기본 영어 양식이라 한국어 메일을 찾는 분은 지나쳤다(검토 3바퀴 13번). 양식이 한국어로 바뀌면
         config.mailKo = true 로 영어 안내를 끈다 */
      if (opts && opts.email) {
        var to = el("p", "bd-sent-to");
        var parts = fmt(t("bd.mailSentTo", "{email} 로 보냈습니다"), { email: "\u0000" }).split("\u0000");
        to.appendChild(document.createTextNode(parts[0] || ""));
        to.appendChild(el("strong", null, opts.email));
        to.appendChild(document.createTextNode(parts[1] || ""));
        body.appendChild(to);
      }
      lede(body, note || "");
      if (opts && opts.kind === "signup") {
        if (conf().mailKo !== true) body.appendChild(el("p", "form-hint bd-sent-what", t("bd.mailSentWhat", "제목이 영어 「Confirm Your Signup」, 보낸 사람 「Supabase Auth」인 메일입니다. 안의 「Confirm your mail」을 눌러 주세요.")));
        body.appendChild(el("p", "form-hint bd-sent-same", t("bd.mailSentSame", "가입한 이 기기·이 브라우저에서 열어야 바로 이어집니다.")));
      }
      /* 주 단추는 '닫기' 하나 — 메일을 기다리는 사람에게 첫 단추가 '로그인하기'면 잘못 온 줄 알았다.
         메일이 오지 않을 때 갈 길(이미 가입한 주소·비밀번호)은 글자 단추로 그 아래에 */
      var ok = btn("btn btn--solid bd-wide", t("bd.close", "닫기"));
      ok.addEventListener("click", closeSheet);
      body.appendChild(ok);
      var row2 = el("div", "bd-me-acts bd-sent-acts");
      var li = btn("btn btn--text", t("bd.toLogin", "로그인하기"));
      li.addEventListener("click", function () { openSheet("start", null); });
      var fg = btn("btn btn--text", t("bd.forgotShort", "비밀번호 찾기"));
      fg.addEventListener("click", function () { openSheet("recover", null); });
      row2.appendChild(li); row2.appendChild(fg);
      body.appendChild(row2);
    },

    newpw: function (h, body) {
      h.textContent = t("bd.newpwH", "새 비밀번호 정하기");
      var f = el("form", "bd-aform");
      f.appendChild(field("bd-np", t("bd.pwNew", "비밀번호 (8자 이상)"), "password", { autocomplete: "new-password", required: "", minlength: "8" }));
      f.appendChild(field("bd-np2", t("bd.pw2", "비밀번호 한 번 더"), "password", { autocomplete: "new-password", required: "", minlength: "8" }));
      var go2 = btn("btn btn--solid bd-wide", t("bd.savePw", "저장"), "submit");
      f.appendChild(go2);
      var m = msgNode();
      f.appendChild(m);
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var p1 = $("#bd-np", f).value, p2 = $("#bd-np2", f).value;
        if (p1.length < 8) { say(m, why("weak_pw"), "bad"); return; }
        if (p1 !== p2) { say(m, why("pw_mismatch"), "bad"); return; }
        go2.disabled = true;
        Auth.setPassword(p1).then(function (r) {
          go2.disabled = false;
          $("#bd-np", f).value = ""; $("#bd-np2", f).value = "";
          if (!r.ok) { say(m, why(r.reason), "bad"); return; }
          afterLogin(t("bd.pwSaved", "새 비밀번호를 저장했습니다."));
        });
      });
      body.appendChild(f);
    },

    join: function (h, body, note, opts) {
      var gig = opts.ctx === "gig";
      h.textContent = t("bd.joinH", "가입 마치기");
      lede(body, note || t("bd.joinLede", "사랑방에서 쓸 별명을 정해 주세요. 다른 분들께는 별명과 등급만 보입니다."));
      var f = el("form", "bd-aform");
      var suggest = S.me && S.me.suggest;
      /* 순서: 동의 → 별명 → 가입 마치기. 주 단추가 마지막 입력칸(별명) 바로 아래에 온다 — 별명 칸에서 자판이
         올라와도 칸과 단추가 함께 보인다. 예전 순서(별명 → 동의 → 단추)는 자판이 동의와 단추를 함께 덮었다(검토 22번) */
      /* '모두 동의' 한 칸 — 누르면 아래 두 칸이 함께 체크된다. 두 칸은 그대로 남겨
         무엇에 동의하는지 하나씩 보이게 한다(서버의 member_join 은 두 값을 그대로 받는다) */
      var aAll = el("label", "bd-check bd-check--all");
      var cAll = el("input"); cAll.type = "checkbox"; cAll.id = "bd-jall";
      aAll.appendChild(cAll);
      aAll.appendChild(el("span", null, t("bd.agreeAll", "모두 동의합니다 (만 14세 이상 · 이용약관 · 개인정보처리방침)")));
      f.appendChild(aAll);
      var a1 = el("label", "bd-check");
      var c1 = el("input"); c1.type = "checkbox"; c1.id = "bd-ja";
      a1.appendChild(c1);
      var s1 = el("span");
      s1.appendChild(document.createTextNode(t("bd.agree1", "")));
      var lt = el("a", null, t("bd.terms", "이용약관"));
      lt.href = "terms.html"; lt.target = "_blank"; lt.rel = "noopener";
      var lp = el("a", null, t("bd.privacy", "개인정보처리방침"));
      lp.href = "privacy.html"; lp.target = "_blank"; lp.rel = "noopener";
      s1.appendChild(lt);
      s1.appendChild(document.createTextNode(t("bd.agree2", "과 ")));
      s1.appendChild(lp);
      s1.appendChild(document.createTextNode(t("bd.agree3", "에 동의합니다")));
      a1.appendChild(s1);
      f.appendChild(a1);
      var a2 = el("label", "bd-check");
      var c2 = el("input"); c2.type = "checkbox"; c2.id = "bd-jg";
      a2.appendChild(c2);
      a2.appendChild(el("span", null, t("bd.age", "만 14세 이상입니다")));
      f.appendChild(a2);
      /* 동의 오류는 동의 칸 바로 아래 — 주 단추 아래(m)에 쓰면 360×640·21px 에서 화면 밖(788–853)이었고 초점만 위로
         튀었다. 공연 가입이 '눌러도 화면만 튀는' 상태였다(검토 3바퀴 18번) */
      var agErr = el("p", "bd-ferr");
      agErr.id = "bd-jerr";
      agErr.setAttribute("role", "status");
      f.appendChild(agErr);
      function agClear() {
        [c1, c2].forEach(function (c) { if (c.checked) { c.removeAttribute("aria-invalid"); c.removeAttribute("aria-describedby"); } });
        if (c1.checked && c2.checked) agErr.textContent = "";
      }
      cAll.addEventListener("change", function () { c1.checked = c2.checked = cAll.checked; agClear(); });
      function syncAll() { cAll.checked = c1.checked && c2.checked; agClear(); }
      c1.addEventListener("change", syncAll);
      c2.addEventListener("change", syncAll);
      var nf = field("bd-jn", t("bd.nick", "별명"), "text", { maxlength: "12", required: "", autocomplete: "nickname" });
      nf.classList.add("bd-nickf");
      f.appendChild(nf);
      /* 50~60대는 카카오 이름이 실명인 경우가 많다 — 객석에서 서둘러 가입하면 실명이 공개 방명록·사랑방에 그대로 오른다.
         그 사실을 칸 바로 아래에서 말한다. 칸을 비워 두지는 않는다(가입이 한 단계 더 어려워진다, 검토 4바퀴 20번) */
      f.appendChild(el("p", "form-hint", suggest
        ? t("bd.nickSuggest", "카카오 이름이 그대로 들어왔습니다. 방명록·사랑방에 이 이름으로 보이니, 실명이면 다른 별명을 권합니다.")
        : t("bd.nickHint", "2~12자 · 한글·영문·숫자. '인순이'·'운영자'처럼 오해를 부르는 이름은 쓸 수 없습니다.")));
      /* 가입 질문 하나 — 좋아하는 인순이 노래(선택). 013 이 켜졌을 때만(없는 함수에 답을 맡기지 않는다) */
      var songQ = mypageOn() ? songQuestion(gig) : null;
      /* 소식 메일(선택)은 노래 질문 앞 — 공연 담당이 가장 먼저 권하고 싶은 것이다. 접지 않는다(체크 한 번이면 된다) */
      var newsQ = newsOn() ? newsQuestion() : null;
      if (newsQ) f.appendChild(newsQ.node);
      if (songQ) f.appendChild(songQ.node);
      /* 주 단추는 창 아래에 붙는다(.bd-jfoot, position: sticky) — 별명·노래 어느 칸에서 자판이 올라와도
         '가입 마치기'가 보이는 창 맨 아래에 남는다. 별명 오류(m)도 단추 바로 아래 같은 띠 안에 */
      var foot = el("div", "bd-jfoot");
      /* 단추는 실제로 이어질 일을 말한다 — 도장이 열려 있지 않은데(시작 전·방명록만·끝남) '가입 마치고 도장 찍기'라고 하면
         가입해도 도장이 없어 '뭐가 잘못됐나' 한다(검토 4바퀴 18번). 방명록 단추로 왔으면 방명록을 말한다.
         무엇을 하러 왔는지는 창을 연 쪽(why)이, 카카오 왕복 뒤라면 적어 둔 '이어서 할 일'이 안다 */
      var nx = lsGet(NKEY);
      var wyj = (gig && (opts.why || (nx && samePath(nx.path, location.pathname) && Date.now() - (nx.at || 0) < NEXT_TTL && nx.what))) || "";
      var go2 = btn("btn btn--solid bd-wide", joinGoText(gig, wyj, gigPhase()), "submit");
      sheet.__gs = gig ? { view: "join", wy: wyj, ph: gigPhase(), btn: go2 } : null;
      foot.appendChild(go2);
      var m = msgNode();
      foot.appendChild(m);
      f.appendChild(foot);
      /* 주소를 고치거나 체크를 풀면 단추 띠의 주소 오류도 걷는다 */
      if (newsQ) ["#bd-jne", "#bd-jnews"].forEach(function (q) {
        var x = $(q, f);
        if (x) x.addEventListener(q === "#bd-jne" ? "input" : "change", function () { if (m.classList.contains("is-bad")) say(m, ""); });
      });
      var need = (S.me && S.me.need_posts) || 3, needc = (S.me && S.me.need_comments) || 5;
      f.appendChild(el("p", "form-hint bd-lvinfo", instantOn()
        ? fmt(t("bd.lvInfoInstF", "새싹으로 시작합니다. 글 {p}개와 댓글 {c}개가 모이면 정회원이 됩니다. 글은 쓰자마자 모두에게 보입니다."), { p: need, c: needc })
        : t("bd.lvInfo1", "새싹으로 시작합니다. 운영자 확인을 거쳐 올라간 글 ") + need + t("bd.lvInfo2", "개와 댓글 ") + needc +
          t("bd.lvInfo3", "개가 모이면 정회원이 되어, 글과 댓글이 바로 올라갑니다.")));
      var out = btn("bd-link", t("bd.logout", "로그아웃"));
      out.addEventListener("click", function () {
        Auth.signOut().then(function () { forgetDevice(); S.me = null; renderHM(); emit("state"); closeSheet(); refreshCafe(); });
      });
      f.appendChild(out);
      /* 이메일 가입은 메일 확인에서 계정이 먼저 생긴다. 별명·동의 전에 그만두고 싶은 사람이 계정을 지울 길 */
      var quit = btn("bd-link bd-leave", t("bd.quitJoin", "가입 그만두고 계정 지우기"));
      quit.addEventListener("click", function () {
        if (!window.confirm(t("bd.quitQ", "가입을 그만두고 이 계정을 지울까요?"))) return;
        quit.disabled = true;
        rpc("member_leave", {}, true).then(function (r) {
          quit.disabled = false;
          if (r && r.ok) {
            clearS(); forgetDevice(); S.me = null; renderHM(); emit("state"); closeSheet(); refreshCafe();
            welcome(t("bd.quitDone", "가입을 그만두고 계정을 지웠습니다."));
          } else say(m, why(r && r.reason), "bad");
        });
      });
      f.appendChild(quit);
      body.appendChild(f);
      if (suggest) $("#bd-jn", f).value = S.me.suggest;
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!c1.checked || !c2.checked) {
          agErr.textContent = why(!c1.checked ? "need_agree" : "need_age");
          [c1, c2].forEach(function (c) {
            if (!c.checked) { c.setAttribute("aria-invalid", "true"); c.setAttribute("aria-describedby", agErr.id); }
          });
          var fc = !c1.checked ? c1 : c2;
          try { fc.focus({ preventScroll: true }); } catch (e2) { fc.focus(); }
          /* 칸과 문구가 함께 보이게 — 창(.bd-sheet-box) 안에서 필요한 만큼만 */
          if (agErr.scrollIntoView) agErr.scrollIntoView({ block: "nearest" });
          if (fc.closest("label").scrollIntoView) fc.closest("label").scrollIntoView({ block: "nearest" });
          return;
        }
        /* 소식을 받겠다고 체크했는데 주소가 틀리면 가입 전에 멈춘다 — 가입한 뒤에 '저장 못 함'으로 버리지 않게 */
        var news = newsQ ? newsQ.value() : "";
        /* 칸 아래 안내는 자판이 올라오면 단추 띠 뒤로 숨는다 — 별명 오류처럼 단추 바로 아래(m)에도 쓴다 */
        if (news === null) { say(m, ($("#bd-jne-err", f) || {}).textContent || why("bad_email"), "bad"); return; }
        go2.disabled = true;
        rpc("member_join", { p_nickname: $("#bd-jn", f).value, p_agree: true, p_age14: true }, true).then(function (r) {
          /* 가입이 된 뒤에만 — 소식 저장이 실패해도 가입은 그대로다(인사 끝에 한 줄, 내 정보에서 다시) */
          if (!(r && (r.ok || r.reason === "already") && news)) return r;
          return saveNews(news, newsSrc(gig)).then(function (nr) {
            S.newsNote = nr && nr.ok ? fmt(t("bd.newsDoneF", "소식 메일은 {e} 로 보내 드립니다."), { e: news })
                                     : t("bd.newsLater", "소식 메일 신청은 저장하지 못했습니다. 내 정보에서 다시 신청할 수 있습니다.");
            return r;
          });
        }).then(function (r) {
          /* 가입이 된 뒤에만, 고른 노래가 있을 때만 — 노래 저장이 실패해도 가입은 그대로다(내 정보에서 다시 고른다) */
          var pick = songQ && songQ.value();
          if (!(r && r.ok && pick)) return r;
          return rpc("member_set_song", { p_song: pick.t }, true).then(function (sr) {
            if (sr && sr.reason === "not_ready") S.mp = false;
            if (!(sr && sr.ok)) S.songNote = t("bd.songLater", "좋아하는 노래는 저장하지 못했습니다. 내 정보에서 다시 고를 수 있습니다.");
            return r;
          });
        }).then(function (r) {
          go2.disabled = false;
          if (r && (r.ok || r.reason === "already")) { afterLogin(null, r.ok ? "join" : null); return; }
          if (r && (r.reason === "not_logged_in" || r.reason === "expired")) { S.me = null; renderHM(); openSheet("start", null, why(r.reason)); return; }
          say(m, why(r && r.reason), "bad");
        });
      });
    }
  };

  function kakaoMark() {
    /* 카카오 말풍선 — 카카오 로그인 디자인 가이드의 심볼(검정, 노랑 바탕 위) */
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("class", "bd-kakao-mark");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M12 3C6.48 3 2 6.58 2 11c0 2.85 1.86 5.35 4.66 6.77-.2.75-.74 2.73-.85 3.15-.13.52.19.51.4.37.16-.11 2.6-1.77 3.66-2.49.69.1 1.4.15 2.13.15 5.52 0 10-3.58 10-8S17.52 3 12 3z");
    s.appendChild(p);
    return s;
  }

  /* ---------- 카페 시작 ---------- */
  var bound = false;
  /* 회원 상태가 정해진 뒤 한 번 — 머리 숫자·안내·화면 고르기 */
  function cafeStart() {
    if (!sec || sec.__started) return;
    sec.__started = true;
    renderLede();
    renderStat();
    route();
    renderToday();
  }
  function initCafe() {
    var s = byId("board");
    if (!s) { sec = null; return; }
    if (s.__bd) return;          /* 같은 <main> 에 두 번 걸지 않는다 */
    s.__bd = true;
    sec = s;
    S.board = "all"; S.rows = []; S.rowsBoard = null; S.notices = null; S.view = "list"; S.trail = null;
    S.reloadY = null;
    var yk = ssGet(YKEY);
    ssDel(YKEY);
    if (yk && location.pathname === DOC_PATH && !initCafe.done && yk.path === location.pathname && yk.hash === location.hash
        && Date.now() - (yk.at || 0) < NEXT_TTL) {
      var nt = "";
      try { nt = (performance.getEntriesByType("navigation")[0] || {}).type || ""; } catch (e) {}
      if (nt === "reload" || nt === "back_forward") {
        S.reloadY = yk.y;
        /* 브라우저가 반쯤 복원하다 멈춘 자리에서 목록이 밀려 내려가지 않게 — 이 문서에서는 우리가 맞춘다 */
        try { history.scrollRestoration = "manual"; } catch (e) {}
      }
    }
    initCafe.done = true;

    sq("#bd-write-btn").addEventListener("click", onWrite);
    sq("#bd-form").addEventListener("submit", onSubmit);
    sq("#bd-cancel").addEventListener("click", onCancel);
    sq("#bd-form-back").addEventListener("click", onCancel);
    sq("#bd-more").addEventListener("click", function () { loadList(true); });
    sq("#bd-retry").addEventListener("click", function () { loadList(false); });
    var dt = null;
    ["#bd-title", "#bd-body"].forEach(function (q) {
      sq(q).addEventListener("input", function () {
        counter();
        if (sq(q).getAttribute("aria-invalid")) fieldErr(sq(q), "");
        clearTimeout(dt);
        dt = setTimeout(draftSave, 400);
      });
    });
    /* 폰에서 내용 칸을 누르면 자판이 올라온다 — 칸과 '올리기'를 머리 아래 ~ 자판 위에 함께(공용 kbBind, 검토 4바퀴 2·11번).
       예전 맞춤은 자판이 없어도 굴려서 '고치기'로 들어오면 제목·닫기가 머리 밑에 숨었다 */
    kbBind(sq("#bd-body"), function () { return sq("#bd-go"); });
    sq("#bd-pick").addEventListener("change", function () { markPick(); markTab(boardVal()); draftSave(); });
    /* 목록의 글·편지를 누르는 순간 — 돌아올 자리(게시판·줄·스크롤)를 적어 둔다 */
    sec.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest(".cafe-link, .cafe-feature a") : null;
      if (!a || !sec.contains(a)) return;
      var href = a.getAttribute("href") || "";
      if (!/^#[pl]\d+$/.test(href)) return;
      /* 내 정보의 내가 쓴 글·내 댓글 — '← 내 정보로' 돌아올 길과 스크롤만 적는다(목록의 돌아올 줄은 건드리지 않는다) */
      if (a.closest("#cafe-me")) {
        S.trail = { from: "#me", to: href };
        ME.back = { y: Math.round(window.scrollY) };
        return;
      }
      var li = a.closest("[data-id]");
      ssSet(BKEY, { board: S.board, id: li ? li.getAttribute("data-id") : null, y: Math.round(window.scrollY) });
      S.trail = { from: location.hash, to: href };
      /* 목록으로 돌아올 때 스크롤은 이 파일이 맞춘다(restoreBack) — 브라우저의 자동 복원이 먼저 엉뚱한 곳
         (목록이 아직 비어 있을 때의 높이 → 신청곡)으로 끌고 가지 않게. 이 목록 기록과 그 뒤로 쌓이는
         글 기록이 'manual' 을 물려받는다. 문서를 열 때가 아니라 지금 거는 이유: 열 때 걸면 새로고침의
         기본 복원이 도중에 끊기고 스크롤 고정(anchoring)만 남아 목록 깊은 곳(1100)에서 새로고침한
         사람이 맨 아래(1646)로 떨어졌다(1280×860 실측). 떠날 때(pagehide·라우터)는 'auto' 로 되돌린다 */
      try { history.scrollRestoration = "manual"; } catch (e2) {}
    });
    if (!bound) {
      bound = true;
      /* 창을 닫거나 다른 데로 가도 쓰던 글을 지킨다 */
      window.addEventListener("pagehide", function () {
        draftSave();
        if (sec && document.body.contains(sec) && S.view === "list") {
          ssSet(YKEY, { path: location.pathname, hash: location.hash, y: Math.round(window.scrollY), at: Date.now() });
        }
        try { history.scrollRestoration = "auto"; } catch (e) {}
      });
      window.addEventListener("hashchange", function () { if (sec && document.body.contains(sec)) route(); });
    }
    if (memberReady) cafeStart();
  }

  /* ---------- 바깥에 내놓는 창구 ----------
     공연 화면(gig.js)이 같은 회원 핵심을 쓴다. 권한과는 무관하다 — 서버가 지킨다 */
  window.INSOONI_MEMBER = {
    instant: instantOn,
    ready: readyP,
    me: function () { return S.me; },
    on: function (fn) { if (typeof fn === "function") listeners.push(fn); },
    rpc: rpc,
    openSheet: function (view, from, note, opts) { openSheet(view, from, note, opts); },
    closeSheet: closeSheet,
    setNext: setNext,
    /* 이어서 할 일 중 공연 화면의 몫(도장·응원·투표)을 꺼낸다 — 한 번 꺼내면 지워진다 */
    takeNext: function (whats) {
      var n = lsGet(NKEY);
      if (!n || (n.path && !samePath(n.path, location.pathname)) || Date.now() - (n.at || 0) > NEXT_TTL) return null;
      if (whats && whats.indexOf(n.what) < 0) return null;
      lsDel(NKEY);
      return n;
    },
    state: hmState,
    /* 영어 사전을 늦게 실은 화면(공연 화면)이 헤더 입구를 그 말로 다시 그릴 때 */
    refresh: function () { renderHM(); },
    /* 로그인 창이 바로 뜨도록 — 단추에 손가락이 닿는 순간 회원 설정을 미리 받는다 */
    prefetch: function () { if (S.open) prefetchSettings(); },
    /* 카카오 단추를 권할 수 있는가(스위치 켜짐 · 방금 실패하지 않음) — 공연 화면의 안내 문구가 쓴다 */
    kakao: function () { return kakaoOn() && !kakaoFailRecent(); },
    /* 이어서 할 일이 남아 있는가(지우지 않고 보기만) — 공연 화면이 인사를 그 결과와 한 문장으로 묶을 때 */
    hasNext: function (whats) {
      var n = lsGet(NKEY);
      return !!n && (!n.path || samePath(n.path, location.pathname)) && Date.now() - (n.at || 0) <= NEXT_TTL && (!whats || whats.indexOf(n.what) >= 0);
    },
    /* 자판 맞춤(공용) — 공연 화면의 방명록 글칸·공연 코드 칸 */
    kbFit: function (f, btnOf) { kbBind(f, btnOf); },
    /* 공연 화면이 단계를 새로 알았다 — 열린 회원 창의 제목·첫 문장·가입 단추를 그 단계에 맞춘다 */
    gigChanged: function () { syncGigSheet(); }
  };

  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(initCafe);
  function boot() { initMember(); initCafe(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* 시험용 창구 — 화면 검사기가 상태를 들여다볼 수 있게(권한과 무관한 읽기 전용) */
  window.INSOONI_BOARD = { state: function () { return { me: S.me, rows: S.rows.length, ready: S.ready, open: S.open, view: S.view, board: S.board }; } };
})();
