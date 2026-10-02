/* ============================================================
   INSOONI · 공연 화면 (gig.js) — live.html 전용
   ------------------------------------------------------------
   형님(2026-10-02): "콘서트 때 QR 코드로 들어가서 회원가입도 하고 글도 쓰고 재미난 요소로…
   핸드폰에서도 정말 완벽하게". 고른 재미 넷 — ① 공연 체크인 도장 ② 응원 한마디 ③ 앵콜 투표
   ④ 오늘 공연 방명록. 서버 규칙은 supabase/011_공연_모드.sql 에 있다(화면을 고쳐도 권한은 생기지 않는다).

   쓰는 환경이 설계를 정했다 — 어두운 객석 · 한 손 · 화면 밝기 낮음 · 소음 · 느린 LTE ·
   카카오톡/카메라 QR 의 인앱 브라우저. 그래서
     · 첫 화면에 필요한 것은 서버 왕복 한 번(gig_event)에 다 온다. 회원 핵심은 board.js 를 그대로 쓴다.
     · 채운 단추는 화면에 늘 하나 — 폰에서는 엄지가 닿는 아래쪽에 고정된 '도장 찍기' → '방명록 남기기'.
     · 숫자는 서버가 센 그대로(0 이면 0). 지어낸 숫자·순위·일련번호는 없다.
       '위험할 수 없는' 도장·응원·투표는 누르는 즉시 반영하고(현장이 살아 있게),
       글(방명록)은 등급 규칙을 그대로 따른다 — 새싹은 운영자 확인 뒤. 화면이 그 사실을 말한다.
     · 반복 모션 없음. 내 도장이 처음 찍히는 순간 한 번만 움직인다(동작 줄이기 설정이면 그것도 없다).
   상태(설계서 §6.4): L0 불러오는 중 · L1 꺼짐 · L2 코드 입력 · L3 못 찾음 · L4 시작 전 ·
   L5 열림·로그아웃 · L6 열림·가입 전 · L7 열림·도장 전 · L8 도장 뒤 · L9 방명록만 · L10 끝 ·
   L11 차단 · L12 운영자 미리보기.
   ============================================================ */
(function () {
  "use strict";

  var CODE_KEY = "insooni_gig_code";     /* 마지막으로 연 공연 코드 — 로그인 왕복 뒤에도 같은 공연으로 */
  var CODE_TTL = 12 * 3600e3;
  var SLOW_MS = 8000;
  var MAX_GAP = 120000;
  var ALPH = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";   /* 0·O·1·I·L 은 객석 조명 아래에서 서로 헷갈린다 */
  var NEXTS = ["checkin", "cheer", "vote"];

  /* ---------- 작은 도구 ---------- */
  function byId(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function conf() { return window.INSOONI_CONFIG || {}; }
  function isEN() { return document.documentElement.getAttribute("lang") === "en"; }
  function t(key, ko) {
    var d = window.I18N_EN || {};
    return isEN() && d[key] ? d[key] : ko;
  }
  function fmt(s, o) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return o.hasOwnProperty(k) ? o[k] : m; });
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function show(n, on) { if (n) n.hidden = !on; }
  function reduced() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function configured() {
    var c = conf(), url = c.url || "", key = c.anonKey || "";
    if (!url || !key) return false;
    if (url.indexOf("여기에") >= 0 || key.indexOf("여기에") >= 0 || url.indexOf("YOUR-") >= 0) return false;
    return true;
  }
  /* 스위치는 '정확히 true' 일 때만 켜진 것으로 본다(config.js) */
  function switchedOn() { return configured() && conf().board === true && conf().live === true; }
  function normCode(s) { return String(s || "").trim().toUpperCase(); }
  function validCode(s) {
    if (s.length !== 5) return false;
    for (var i = 0; i < 5; i++) if (ALPH.indexOf(s.charAt(i)) < 0) return false;
    return true;
  }
  function urlCode() {
    try { return normCode(new URLSearchParams(location.search).get("e")); } catch (e) { return ""; }
  }

  /* ---------- 한국 시각 ----------
     서버 시각은 UTC 다. 기기 시계가 어느 나라에 맞춰져 있어도 같은 시각이 보여야 한다.
     한국은 서머타임이 없어 늘 UTC+9 — Intl(timeZone "Asia/Seoul")과 같은 결과를, 오래된 인앱
     브라우저에서도 똑같이 내도록 고정 오프셋으로 계산한다(board.js 와 같은 방식). */
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function kst(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return null;
    var k = new Date(d.getTime() + 9 * 3600e3);
    return { y: k.getUTCFullYear(), mo: k.getUTCMonth() + 1, d: k.getUTCDate(), h: k.getUTCHours(), mi: k.getUTCMinutes() };
  }
  function p2(n) { return ("0" + n).slice(-2); }
  function dots(iso) { var k = kst(iso); return k ? k.y + "." + p2(k.mo) + "." + p2(k.d) : ""; }
  function hhmm(iso) { var k = kst(iso); return k ? p2(k.h) + ":" + p2(k.mi) : ""; }
  /* '10월 18일 오후 4시 30분' / '4:30 PM, Oct 18' */
  function longWhen(iso) {
    var k = kst(iso);
    if (!k) return "";
    var pm = k.h >= 12, h12 = k.h % 12 || 12;
    if (isEN()) return h12 + ":" + p2(k.mi) + " " + (pm ? "PM" : "AM") + ", " + MON[k.mo - 1] + " " + k.d;
    return k.mo + "월 " + k.d + "일 " + (pm ? "오후 " : "오전 ") + h12 + "시" + (k.mi ? " " + k.mi + "분" : "");
  }
  function dayOnly(iso) {
    var k = kst(iso);
    if (!k) return "";
    return isEN() ? MON[k.mo - 1] + " " + k.d : k.mo + "월 " + k.d + "일";
  }
  function longDate(iso) {
    var k = kst(iso);
    if (!k) return "";
    return isEN() ? MON[k.mo - 1] + " " + k.d + " " + k.y : k.y + "년 " + k.mo + "월 " + k.d + "일";
  }
  function ms(iso) { var v = Date.parse(iso); return isNaN(v) ? 0 : v; }

  function levelName(level, staff) {
    var k = staff ? "staff" : level;
    return k === "staff" ? t("bd.lv.staff", "운영자")
         : k === "member" ? t("bd.lv.member", "정회원")
         : k === "blocked" ? t("bd.lv.blocked", "쉬는 중")
         : t("bd.lv.sprout", "새싹");
  }

  /* 서버 말을 사람 말로 — 이 화면에서 나올 수 있는 것만 */
  function why(reason) {
    switch (reason) {
      case "network": case "timeout": case "server": case "parse":
        return t("gig.e.net", "연결이 느립니다. 방금 누른 것은 저장되지 않았습니다 — 잠시 뒤 다시 눌러 주세요.");
      case "not_logged_in": case "expired": return t("gig.e.login", "로그인이 끝났습니다. 다시 들어와 주세요.");
      case "not_member": return t("gig.e.join", "가입을 마치면 바로 이어집니다.");
      case "blocked": return t("gig.blocked", "지금은 도장·응원·방명록을 쓸 수 없습니다. 운영자에게 문의해 주세요.");
      case "not_found": return t("gig.e.gone", "이 공연을 찾지 못했습니다.");
      case "not_open": return t("gig.e.closed", "지금은 열려 있지 않습니다. 화면을 새로 고쳤습니다.");
      case "vote_closed": return t("gig.voteClosed", "투표가 닫혔습니다.");
      case "bad_song": return t("gig.e.song", "이 노래는 후보에 없습니다.");
      case "bad_phrase": return t("gig.e.phrase", "이 문구는 지금 쓸 수 없습니다.");
      case "rate_limited": return t("gig.e.rate", "잠시 뒤에 다시 눌러 주세요. 짧은 시간에 너무 많이 눌렀습니다.");
      case "empty": return t("gig.e.empty", "두 글자 이상 적어 주세요.");
      case "too_long": return t("gig.e.long", "500자까지 쓸 수 있습니다.");
      case "gig_limit": return t("gig.e.limit", "이 공연의 방명록은 한 분이 세 번까지 남길 수 있습니다.");
      case "not_ready": return t("gig.e.ready", "공연 화면을 준비하고 있습니다. 조금만 기다려 주세요.");
      default: return t("gig.e.fail", "지금 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    }
  }

  /* ---------- 상태 ---------- */
  var M = null;           /* window.INSOONI_MEMBER (board.js) */
  var S = {
    code: "", src: "", ev: null, phase: "", voteOpen: true, phrases: [], songs: [], me: null,
    pollS: 15, skew: 0, loaded: false, gen: 0,
    n: { checkins: null, cheers: {}, votes: {} },     /* 항목마다 {v, at} — 더 늦게 센 값만 반영 */
    busy: { checkin: false, cheer: {}, vote: false },
    want: { cheer: {}, vote: undefined },
    guest: null, mine: [], gbRows: null, justStamped: false, stampMsg: "",
    gbDone: ""          /* 방금 방명록을 올렸다 — 폼을 접고 그 자리에 결과 한 줄 + '한 줄 더'(검토 40번) */
  };
  var go = null;

  /* ---------- 글자 크기 · 언어 (main.js 를 싣지 않으므로 같은 키·같은 값으로) ---------- */
  function initFs() {
    var STEPS = [17, 19, 21], NAMES = ["보통", "크게", "아주 크게"], EN = ["normal", "large", "largest"];
    var btns = Array.prototype.slice.call(document.querySelectorAll(".fs-toggle"));
    var cur = 0;
    try { var s = parseInt(localStorage.getItem("insooni_fs"), 10); if (s >= 0 && s < 3) cur = s; } catch (e) {}
    function apply(i, save) {
      i = ((i % 3) + 3) % 3;
      document.documentElement.style.fontSize = STEPS[i] + "px";
      document.documentElement.setAttribute("data-fs", String(i + 1));
      btns.forEach(function (b) {
        b.setAttribute("aria-label", isEN() ? "Text size — now " + EN[i] + ". Press to change." : "글자 크기 바꾸기 — 지금 " + NAMES[i]);
      });
      if (save) { try { localStorage.setItem("insooni_fs", String(i)); } catch (e) {} }
      return i;
    }
    apply(cur, false);
    btns.forEach(function (b) { b.addEventListener("click", function () { cur = apply(cur + 1, true); }); });
  }
  function initLang() {
    Array.prototype.forEach.call(document.querySelectorAll(".lang-toggle"), function (b) {
      var wide = b.classList.contains("gig-tail-lang");
      b.textContent = isEN() ? "한국어" : (wide ? "English" : "EN");
      b.setAttribute("aria-label", isEN() ? "Switch to Korean" : "Switch to English");
    });
    document.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".lang-toggle") : null;
      if (!b) return;
      lsSet("insooni_lang", isEN() ? "ko" : "en");
      location.reload();
    });
  }
  /* 영어 사전은 영어로 볼 때만 싣는다 — 객석의 느린 회선에서 대부분의 방문자에게는 필요 없는 30KB 다.
     같은 판(?v)을 쓰도록 이 파일의 주소에서 꼬리표를 빌린다 */
  function loadI18n() {
    if (!isEN() || window.I18N_EN) return Promise.resolve();
    return new Promise(function (res) {
      var me = document.querySelector('script[src*="gig."]');
      var v = me ? (me.getAttribute("src").match(/\?v[0-9a-f]+/) || [""])[0] : "";
      var s = document.createElement("script");
      s.src = "assets/js/i18n.min.js" + v;
      s.onload = s.onerror = function () { res(); };
      document.head.appendChild(s);
      setTimeout(res, 4000);
    });
  }

  /* ---------- 정적 문구(언어) ---------- */
  function paintStatic() {
    document.title = t("gig.title", "공연 도장 · INSOONI");
    var skip = document.querySelector(".skip-link");
    if (skip) skip.textContent = t("nav.skip", "본문 바로가기");
    var brand = document.querySelector(".gig-brand");
    if (brand) brand.setAttribute("aria-label", t("gig.homeAria", "인순이 공식 사이트 홈"));
    txt("gig-retry", t("gig.retry", "다시 불러오기"));
    txt("gig-off-a", t("gig.toCafe", "사랑방으로"));
    txt("gig-code-l", t("gig.codeL", "공연 코드"));
    txt("gig-code-h", t("gig.codeH", "QR 아래에 적힌 다섯 글자입니다."));
    txt("gig-code-go", t("gig.codeGo", "열기"));
    txt("gig-stamp-w", t("gig.was", "다녀옴"));
    txt("gig-cheers-h", t("gig.cheerH", "응원 한마디"));
    txt("gig-vote-h", t("gig.voteH", "앵콜로 듣고 싶은 노래"));
    txt("gig-vote-n", t("gig.voteNote", "앵콜곡은 무대에서 정합니다. 이 숫자는 여기 모인 마음입니다."));
    txt("gig-gb-h", t("gig.gbH", "오늘 공연 방명록"));
    txt("gig-gb-empty", t("gig.gbEmpty", "아직 올라온 글이 없습니다."));
    txt("gig-gb-l", t("gig.gbL", "한 줄이면 충분합니다"));
    txt("gig-starts-h", t("gig.startsH", "누르면 글칸에 이어 붙습니다"));
    txt("gig-gb-again-b", t("gig.gbAgain", "한 줄 더 남기기"));
    txt("gig-gb-go", t("gig.gbGo", "남기기"));
    txt("gig-gb-all", t("gig.gbAll", "사랑방 공연·방송 후기에서 모두 보기 →"));
    txt("gig-t1", t("gig.toCafe", "사랑방으로"));
    txt("gig-t2", t("nav.privacy", "개인정보처리방침"));
    txt("gig-t3", t("nav.terms", "이용약관"));
    var tail = byId("gig-tail");
    if (tail) tail.setAttribute("aria-label", t("gig.tailAria", "다른 곳으로"));
    /* 시작 문장 — 누르면 글칸 끝에 붙는다. 빈 칸 앞에서 무엇을 쓸지 막막한 분께.
       밑줄 글자는 '다른 화면으로 가는 링크'로 읽혀 쓰이지 않았다 — 응원 칸과 같은 테두리 칸 + '+ '(검토 42번) */
    var st = byId("gig-starts");
    if (st && !st.children.length) {
      [["gig.s1", "오늘 처음 왔어요. "], ["gig.s2", "가장 좋았던 노래는 "], ["gig.s3", "다음 공연에도 올게요. "]].forEach(function (p) {
        var b = el("button", "gig-start", "+ " + t(p[0], p[1]).trim());
        b.type = "button";
        b.setAttribute("data-add", t(p[0], p[1]));
        st.appendChild(b);
      });
    }
  }
  function txt(id, s) { var n = byId(id); if (n) n.textContent = s; }

  /* ================================================================
     불러오기
     ================================================================ */
  var slowT = null;
  function setPhase(s) { txt("gig-phase", s); }

  function start() {
    paintStatic();
    bindOnce();
    var c = urlCode();
    if (c) { S.src = "url"; return load(c); }
    var st = lsGet(CODE_KEY);
    if (st && st.code && Date.now() - (st.at || 0) < CODE_TTL) { S.src = "store"; return load(st.code); }
    S.src = "auto";
    load("");
  }

  function load(code) {
    var g = ++S.gen;
    if (!S.loaded) {
      /* L0 — 글자만(스피너 없음). 8초가 지나도 답이 없으면 회선이 느리다고 말하고 다시 부를 길을 준다 */
      setPhase(t("gig.loading", "공연 정보를 불러오고 있습니다"));
      document.getElementById("main").setAttribute("aria-busy", "true");
      show(byId("gig-slow"), false);
      clearTimeout(slowT);
      slowT = setTimeout(function () {
        if (g !== S.gen || S.loaded) return;
        txt("gig-slow-t", t("gig.slow", "연결이 느립니다."));
        show(byId("gig-slow"), true);
      }, SLOW_MS);
    }
    S.tried = code || "";
    if (code && !validCode(code)) return notFound();
    return M.rpc("gig_event", { p_code: code || null }).then(function (r) {
      if (g !== S.gen) return;
      clearTimeout(slowT);
      document.getElementById("main").removeAttribute("aria-busy");
      if (!r || !r.ok) {
        if (r && r.reason === "not_found") {
          if (S.src === "store") { lsDel(CODE_KEY); S.src = "auto"; return load(""); }
          if (S.src === "auto") return codeForm(false);
          return notFound();
        }
        if (S.loaded) { S.gen++; return; }   /* 이미 그린 화면은 그대로 둔다 — 다음 숫자 갱신이 다시 묻는다 */
        txt("gig-slow-t", r && r.reason === "not_ready" ? why("not_ready") : t("gig.slow", "연결이 느립니다."));
        show(byId("gig-slow"), true);
        return;
      }
      show(byId("gig-slow"), false);
      apply(r);
      render();
      /* 사랑방의 '오늘 공연의 앵콜 투표는 공연 화면에서 →'(#gig-vote)로 왔다 — 그 섹션은 받은 뒤에야 서므로 직접 데려간다 */
      if (!S.hashDone) {
        S.hashDone = true;
        var hs = location.hash;
        if (/^#gig-[a-z]+$/.test(hs) && byId(hs.slice(1)) && !byId(hs.slice(1)).hidden) {
          setTimeout(function () { byId(hs.slice(1)).scrollIntoView({ block: "start" }); }, 60);
        }
      }
      poll(true);
      boundary();
      runNext();
    });
  }
  function notFound() {
    clearTimeout(slowT);
    document.getElementById("main").removeAttribute("aria-busy");
    codeForm(true);
  }

  function apply(r) {
    var ev = r.event || {};
    S.ev = ev;
    S.loaded = true;
    S.code = ev.code;
    S.phase = ev.phase;
    S.voteOpen = ev.vote_open !== false;
    S.phrases = r.phrases || [];
    S.songs = r.songs || [];
    S.me = r.me || null;
    S.pollS = Math.max(5, +r.poll_s || 15);
    if (r.now) S.skew = ms(r.now) - Date.now();
    var c = r.counts || {};
    setN("checkins", null, c.checkins, c.at, true);
    (c.cheers || []).forEach(function (x) { setN("cheers", x.k, x.n, c.at, true); });
    (c.votes || []).forEach(function (x) { setN("votes", x.song, x.n, c.at, true); });
    /* 같은 공연으로 돌아오게 — 카카오로 로그인하러 떠났다 와도, 탭을 닫았다 다시 열어도(12시간) */
    lsSet(CODE_KEY, { code: ev.code, at: Date.now() });
    /* 코드 없이 들어왔으면(지금 열린 공연) 주소에 코드를 적어 둔다 — 로그인 왕복의 돌아올 주소가 이것을 쓴다 */
    if (urlCode() !== ev.code) {
      try {
        var sp = new URLSearchParams(location.search);
        sp.set("e", ev.code);
        history.replaceState(history.state, "", location.pathname + "?" + sp.toString() + location.hash);
      } catch (e) {}
    }
    if (S.gbRows === null && ev.phase !== "before") loadGuestbook();
  }

  /* 숫자 하나 — 더 늦게 센 값만 반영한다(늦게 도착한 옛 응답이 숫자를 되돌리지 않게).
     내가 누른 것이 아직 서버에 가는 중이면 그 칸은 건드리지 않는다(눌렀더니 숫자가 한 번 내려갔다 오르는 일이 없게) */
  function setN(kind, key, v, at, force) {
    var box = kind === "checkins" ? null : S.n[kind];
    var cur = kind === "checkins" ? S.n.checkins : box[key];
    var a = ms(at);
    if (!force) {
      if (kind === "checkins" && S.busy.checkin) return;
      if (kind === "cheers" && S.busy.cheer[key]) return;
      if (kind === "votes" && S.busy.vote) return;
      if (cur && a < cur.at) return;
    }
    var nv = { v: Math.max(0, +v || 0), at: a };
    if (kind === "checkins") S.n.checkins = nv; else box[key] = nv;
  }
  function nOf(kind, key) {
    var x = kind === "checkins" ? S.n.checkins : S.n[kind][key];
    return x ? x.v : 0;
  }

  function loadGuestbook() {
    if (!S.code) return;
    var code = S.code;
    M.rpc("gig_guestbook", { p_code: code, p_before: null, p_limit: 5 }).then(function (r) {
      if (!r || !r.ok || code !== S.code) return;
      S.gbRows = r.rows || [];
      S.mine = S.gbRows.filter(function (x) { return x.mine && x.status !== "approved"; });
      paintGuestbook();
    });
  }

  /* ================================================================
     그리기
     ================================================================ */
  function lstate() {
    var me = S.me, ph = S.phase;
    if (me && me.joined && me.level === "blocked") return "L11";
    if (ph === "before") return "L4";
    if (ph === "open") return !me ? "L5" : !me.joined ? "L6" : !me.checked ? "L7" : "L8";
    if (ph === "after") return "L9";
    return "L10";
  }
  function title() { return (isEN() && S.ev.title_en) || S.ev.title_ko || ""; }
  function venue() { return (isEN() && S.ev.venue_en) || S.ev.venue_ko || ""; }

  function render() {
    if (!S.ev) return;
    var L = lstate(), ev = S.ev;
    document.body.setAttribute("data-gig", L);
    show(byId("gig-code"), false);
    show(byId("gig-off-go"), false);

    /* L12 — 운영자가 공개 전 공연을 미리 보는 중. 여기서 누른 것도 실제 기록이 된다(서버가 막지 않는다) */
    var pv = byId("gig-preview");
    pv.textContent = ev.preview ? t("gig.preview", "미리보기 — 아직 공개되지 않은 공연입니다. 여기서 누른 도장·응원·투표는 실제 기록으로 남습니다.") : "";
    show(pv, !!ev.preview);

    /* 1. 이름표 */
    var w = byId("gig-when");
    w.textContent = dots(ev.starts_at) + " · " + hhmm(ev.starts_at);
    show(w, true);
    txt("gig-title", title());
    var vn = byId("gig-venue");
    vn.textContent = venue();
    show(vn, !!venue());
    setPhase(phaseText(L));
    /* 로그아웃 + 카카오 없음 — 가입이 이메일 왕복이라는 것을 단추를 누르기 전에(검토 49번) */
    var mn = byId("gig-mailnote");
    if (mn) {
      var mailOnly = L === "L5" && !(M.kakao && M.kakao());
      mn.textContent = mailOnly ? t("gig.mailNote", "가입은 이메일로 합니다 — 확인 메일을 한 번 거치고, 메일이 늦게 올 수 있습니다.") : "";
      show(mn, mailOnly);
    }

    /* 2. 숫자 */
    var cnt = byId("gig-count"), n = nOf("checkins");
    var showCount = L !== "L4" && !(n === 0 && (S.phase === "after" || S.phase === "closed"));
    show(cnt, showCount);
    if (showCount) {
      byId("gig-count").classList.toggle("is-zero", n === 0);
      show(byId("gig-count-row"), n > 0);
      show(byId("gig-zero"), n === 0);
      txt("gig-zero", t("gig.zero", "아직 도장을 찍은 분이 없습니다. 첫 도장을 찍어 주세요."));
      paintN();
      txt("gig-count-c", S.phase === "open" ? t("gig.countC", "명이 오늘 도장을 찍었습니다") : t("gig.countCAfter", "명이 이 공연에 도장을 찍었습니다"));
      var polling = S.phase === "before" || S.phase === "open" || S.phase === "after";
      txt("gig-count-note", polling
        ? fmt(t("gig.countNote", "숫자는 {s}초마다 새로 셉니다. 도장은 회원 한 분께 한 번만 찍힙니다."), { s: S.pollS })
        : t("gig.countFinal", "공연이 끝난 뒤의 최종 숫자입니다."));
    }

    /* 3. 도장 */
    paintStamp();

    /* 하단 바 */
    paintBar(L);

    /* 4~6 */
    paintCheers(L);
    paintVotes(L);
    paintGuestbook();
  }

  function phaseText(L) {
    var ev = S.ev;
    switch (L) {
      case "L4": return fmt(t("gig.beforeF", "도장은 {w}부터 찍을 수 있습니다."), { w: longWhen(ev.opens_at) });
      /* 도장이 무엇을 남기는지 — 가입이라는 벽 앞에서 '찍으면 뭐가 남나'를 먼저 말한다. 혜택은 지어내지 않는다(검토 43번) */
      case "L5": case "L6": case "L7": return t("gig.openNow", "지금 도장을 찍을 수 있습니다. 찍으면 오늘 다녀온 공연이 내 정보에 기록으로 남습니다.");
      case "L8":
        return S.stampMsg || fmt(t("gig.alreadyF", "이미 도장을 찍으셨습니다 ({t})."), { t: hhmm(S.me.checked_at) });
      case "L9": return fmt(t("gig.afterF", "도장 찍기는 끝났습니다. 방명록은 {d}까지 남길 수 있습니다."), { d: dayOnly(ev.guest_until) });
      case "L11": return t("gig.blocked", "지금은 도장·응원·방명록을 쓸 수 없습니다. 운영자에게 문의해 주세요.");
      default: return t("gig.ended", "이 공연은 끝났습니다. 함께해 주셔서 고맙습니다.");
    }
  }

  function paintN() { txt("gig-n", String(nOf("checkins"))); }

  function paintStamp() {
    var f = byId("gig-stamp"), me = S.me;
    var on = !!(me && me.joined && me.checked);
    show(f, on);
    if (!on) return;
    /* 찍은 뒤에는 내 도장이 이 화면의 주인공 — 이름표 바로 아래, 숫자 위로 올린다 */
    var cnt = byId("gig-count");
    if (f.nextElementSibling !== cnt) cnt.parentNode.insertBefore(f, cnt);
    var d = S.ev.starts_at;
    txt("gig-stamp-d", dots(d));
    txt("gig-stamp-v", venue() || title());
    f.setAttribute("aria-label", isEN()
      ? fmt(t("gig.stampAriaF", "Stamp for {t}, {d}"), { t: title(), d: longDate(d) })
      : longDate(d) + " " + title() + " 도장");
  }

  /* 하단 바 — 상태마다 하나의 일. 없으면 숨긴다 */
  function barAction(L) {
    var me = S.me;
    var posted = me && me.posted > 0;
    switch (L) {
      case "L5": return ["stamp-login", t("gig.goStamp", "도장 찍기")];
      case "L6": return ["stamp-join", t("gig.goJoinStamp", "가입 마치고 도장 찍기")];
      case "L7": return ["stamp", t("gig.goStamp", "도장 찍기")];
      /* 도장 뒤에는 한 번 누르면 끝나는 응원·투표가 먼저 — 주 단추가 그것을 건너뛰고 가장 어려운 글쓰기로
         보냈다(검토 36번). 응원이나 투표를 한 번 하면 그다음이 방명록이다 */
      case "L8":
        if (posted) return null;
        if (S.phrases.length && !touched()) return ["cheers", t("gig.goCheer", "응원 보내기")];
        return ["gb", t("gig.goGb", "방명록 남기기")];
      case "L9": return posted ? null : ["gb", t("gig.goGb", "방명록 남기기")];
      default: return null;
    }
  }
  /* 응원이나 투표를 한 번이라도 했는가(보내는 중 포함) */
  function touched() {
    var me = S.me || {};
    if ((me.cheers || []).length || me.vote) return true;
    if (S.want.vote) return true;
    for (var k in S.want.cheer) if (S.want.cheer.hasOwnProperty(k) && S.want.cheer[k]) return true;
    return false;
  }
  function paintBar(L) {
    var bar = byId("gig-bar"), a = barAction(L);
    show(bar, !!a);
    document.body.classList.toggle("has-actbar", !!a);
    /* Tab 으로 옮긴 초점이 바 뒤로 숨지 않게 — CSS(:has)를 모르는 인앱 브라우저용으로 바 높이를 직접(검토 21번) */
    var fixed = !!a && window.getComputedStyle && getComputedStyle(bar).position === "fixed";
    document.documentElement.style.scrollPaddingBottom = fixed ? (bar.offsetHeight + 12) + "px" : "";
    if (!a) return;
    if (!S.busy.checkin) go.textContent = a[1];
    go.setAttribute("data-act", a[0]);
  }

  function paintCheers(L) {
    var sec = byId("gig-cheers"), box = byId("gig-chips");
    show(sec, S.phrases.length > 0);
    if (!S.phrases.length) return;
    var live = S.phase === "open" && L !== "L11";
    txt("gig-cheers-d", live ? t("gig.cheerD", "누르면 바로 더해집니다. 문구마다 한 번씩, 다시 누르면 거둡니다.")
      : S.phase === "before" ? t("gig.cheerBefore", "도장이 열리면 함께 누를 수 있습니다.")
      : L === "L11" ? t("gig.cheerOff", "지금은 누를 수 없습니다. 숫자만 보입니다.")
      : t("gig.cheerFinal", "공연 중에 모인 응원입니다."));
    var mine = (S.me && S.me.cheers) || [];
    if (box.children.length !== S.phrases.length) {
      box.textContent = "";
      S.phrases.forEach(function (p) {
        var b = el("button", "gig-chip");
        b.type = "button";
        b.setAttribute("data-k", p.k);
        var ph = el("span", "gig-chip-t");
        ph.appendChild(el("span", "gig-chk", "✓ ")).setAttribute("aria-hidden", "true");
        ph.appendChild(el("span", "gig-chip-p"));
        b.appendChild(ph);
        var cn = el("span", "gig-chip-n");
        cn.appendChild(el("span", "gig-n"));
        cn.appendChild(el("span", "gig-chip-u"));
        b.appendChild(cn);
        b.addEventListener("click", function () { onCheer(p.k); });
        box.appendChild(b);
      });
    }
    S.phrases.forEach(function (p, i) {
      var b = box.children[i];
      var on = S.want.cheer[p.k] !== undefined ? S.want.cheer[p.k] : mine.indexOf(p.k) >= 0;
      var words = (isEN() ? p.en : p.ko) || p.ko || "";
      var n = nOf("cheers", p.k);
      b.querySelector(".gig-chip-p").textContent = words;
      b.querySelector(".gig-n").textContent = String(n);
      b.querySelector(".gig-chip-u").textContent = isEN() ? "" : t("gig.unitPpl", "명");
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.setAttribute("aria-label", fmt(t("gig.chipAriaF", "{p}, {n}명"), { p: words, n: n }));
      if (live) b.removeAttribute("aria-disabled"); else b.setAttribute("aria-disabled", "true");
    });
  }

  function paintVotes(L) {
    var sec = byId("gig-vote"), box = byId("gig-songs");
    show(sec, S.songs.length > 0);
    if (!S.songs.length) return;
    var live = S.phase === "open" && S.voteOpen && L !== "L11";
    txt("gig-vote-d", live ? t("gig.voteD", "한 분이 한 곡을 고릅니다. 투표가 닫히기 전까지 바꿀 수 있습니다.")
      : S.phase === "before" && S.voteOpen ? t("gig.voteBefore", "도장이 열리면 투표할 수 있습니다.")
      : L === "L11" ? t("gig.cheerOff", "지금은 누를 수 없습니다. 숫자만 보입니다.")
      : t("gig.voteClosed", "투표가 닫혔습니다."));
    var mine = S.want.vote !== undefined ? S.want.vote : (S.me && S.me.vote) || null;
    var max = 0;
    S.songs.forEach(function (s) { max = Math.max(max, nOf("votes", s.song)); });
    /* 순서는 운영자가 정한 그대로 — 숫자로 다시 줄 세우지 않는다(순위를 만들지 않는다) */
    if (box.children.length !== S.songs.length) {
      box.textContent = "";
      S.songs.forEach(function (s) {
        var b = el("button", "gig-song");
        b.type = "button";
        b.setAttribute("data-song", s.song);
        b.appendChild(el("span", "gig-song-t", s.song));
        b.appendChild(el("span", "gig-song-n gig-n"));
        var mi = el("span", "gig-song-mine");
        mi.setAttribute("lang", isEN() ? "en" : "ko");
        b.appendChild(mi);
        var bar = el("span", "gig-bar-f");
        bar.setAttribute("aria-hidden", "true");
        b.appendChild(bar);
        b.addEventListener("click", function () { onVote(s.song); });
        box.appendChild(b);
      });
    }
    S.songs.forEach(function (s, i) {
      var b = box.children[i], n = nOf("votes", s.song), on = mine === s.song;
      b.querySelector(".gig-song-n").textContent = String(n);
      b.querySelector(".gig-song-mine").textContent = on ? t("gig.myPick", "내 선택") : "";
      b.querySelector(".gig-bar-f").style.width = max > 0 ? (n / max * 100).toFixed(1) + "%" : "0";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.setAttribute("aria-label", fmt(t("gig.songAriaF", "{s}, {n}표"), { s: s.song, n: n }) + (on ? ", " + t("gig.myPick", "내 선택") : ""));
      if (live) b.removeAttribute("aria-disabled"); else b.setAttribute("aria-disabled", "true");
    });
  }

  /* 방명록 — 공개된 글(최근 5) + 내가 맡긴 확인 중 글(나에게만) */
  function paintGuestbook() {
    if (!S.ev) return;
    var L = lstate(), sec = byId("gig-gb");
    var vis = S.phase !== "before";
    show(sec, vis);
    if (!vis) return;
    var list = byId("gig-gb-list");
    /* 공개 글 = 숫자 갱신(gig_pulse)의 최근 다섯 편 + 방금 받은 목록(gig_guestbook) — 같은 글은 한 번, 새 글부터 다섯 */
    var seen = {}, approved = [];
    ((S.guest && S.guest.latest) || []).concat((S.gbRows || []).filter(function (x) { return x.status === "approved" || !x.status; }))
      .forEach(function (x) { if (!seen[x.id]) { seen[x.id] = 1; approved.push(x); } });
    approved.sort(function (a, b) { return b.id - a.id; });
    approved = approved.slice(0, 5);
    var rows = S.mine.concat(approved.filter(function (x) {
      return !S.mine.some(function (m) { return m.id === x.id; });
    }));
    list.textContent = "";
    rows.forEach(function (x) {
      var li = el("li", "gig-gb-item");
      li.appendChild(el("p", "gig-gb-body", x.body || ""));
      var meta = el("p", "gig-gb-meta");
      meta.appendChild(el("span", "gig-gb-nick", x.nickname || ""));
      meta.appendChild(document.createTextNode(" · " + levelName(x.level, x.staff) + " · "));
      var tm = el("time", "gig-gb-t", hhmm(x.created_at));
      if (x.created_at) tm.setAttribute("datetime", x.created_at);
      meta.appendChild(tm);
      if (x.mine && x.status && x.status !== "approved") {
        meta.appendChild(document.createTextNode(" "));
        meta.appendChild(el("span", "bd-badge bd-badge--pending", t("bd.st.pending", "확인 중")));
      }
      li.appendChild(meta);
      list.appendChild(li);
    });
    show(byId("gig-gb-empty"), rows.length === 0 && S.gbRows !== null);

    /* 쓰기 — 열린 공연·방명록 시간에만. 로그인 전이면 들어오는 길 하나 */
    var me = S.me, canTime = S.phase === "open" || S.phase === "after";
    var form = byId("gig-gb-form"), join = byId("gig-gb-join"), note = byId("gig-gb-note");
    var writer = canTime && me && me.joined && me.level !== "blocked";
    var full = writer && me.posted >= 3;
    var folded = !!S.gbDone;
    show(form, writer && !full && !folded);
    txt("gig-gb-done", writer && folded ? S.gbDone : "");
    show(byId("gig-gb-again"), writer && folded && !full);
    show(join, canTime && (!me || !me.joined));
    if (canTime && (!me || !me.joined)) {
      txt("gig-gb-login", !me ? t("gig.gbLogin", "로그인하고 방명록 남기기") : t("gig.gbJoin", "가입 마치고 방명록 남기기"));
    }
    note.textContent = full ? t("gig.e.limit", "이 공연의 방명록은 한 분이 세 번까지 남길 수 있습니다.")
      : L === "L10" ? t("gig.gbClosed", "방명록은 닫혔습니다. 남긴 글은 사랑방에서 볼 수 있습니다.") : "";
    show(note, !!note.textContent);
    if (writer && !full) {
      txt("gig-gb-hint", me.staff || me.level === "member"
        ? t("gig.gbHintMember", "정회원이라 바로 올라갑니다.")
        : t("gig.gbHintSprout", "새싹 회원의 글은 운영자가 확인한 뒤 올라갑니다. 그동안은 나에게만 보입니다."));
    }
    watchForm();
  }

  /* L2 · L3 — 코드 입력 */
  function codeForm(missing) {
    S.ev = null;
    document.body.setAttribute("data-gig", missing ? "L3" : "L2");
    ["gig-when", "gig-venue", "gig-count", "gig-stamp", "gig-bar", "gig-cheers", "gig-vote", "gig-gb", "gig-preview"].forEach(function (id) { show(byId(id), false); });
    document.body.classList.remove("has-actbar");
    txt("gig-title", t("gig.titleGeneric", "공연 도장"));
    setPhase(missing ? t("gig.notFound", "이 공연을 찾지 못했습니다. QR 아래 다섯 글자를 다시 확인해 주세요.")
                     : t("gig.needCode", "공연장 QR 아래에 적힌 코드를 넣어 주세요."));
    show(byId("gig-code"), true);
    /* 못 찾은 코드는 칸에 그대로 둔다 — 한 글자만 고치면 되게(객석에서 다섯 글자를 다시 치지 않게) */
    var inp = byId("gig-code-in");
    if (missing && S.tried) inp.value = S.tried;
  }

  /* L1 — 스위치가 꺼져 있다. 서버에 한 번도 묻지 않는다 */
  function renderOff() {
    document.body.setAttribute("data-gig", "L1");
    paintStatic();
    txt("gig-title", t("gig.titleGeneric", "공연 도장"));
    setPhase(t("gig.off", "공연 화면은 곧 열립니다."));
    show(byId("gig-off-go"), true);
  }

  /* ================================================================
     누르기
     ================================================================ */
  function msg(s, kind) {
    var m = byId("gig-msg");
    m.textContent = s || "";
    m.classList.remove("is-ok", "is-bad");
    if (kind) m.classList.add(kind === "ok" ? "is-ok" : "is-bad");
  }
  /* 로그인·가입이 먼저 필요하면 — 무엇을 하려 했는지 적어 두고 회원 창을 연다(가입을 마치면 이어서 한다) */
  function needMember(next, from) {
    var me = S.me;
    if (me && me.joined) return false;
    if (next) { next.code = S.code; M.setNext(next); }
    M.openSheet(me ? "join" : "start", from || go, null, { ctx: "gig" });
    return true;
  }
  function blockedOrClosed(kind) {
    if (S.me && S.me.level === "blocked") { msg(why("blocked"), "bad"); return true; }
    if (S.phase !== "open") {
      msg(S.phase === "before" ? t("gig.notYet", "아직 열리지 않았습니다. 도장이 열리면 누를 수 있습니다.") : why(kind === "vote" ? "vote_closed" : "not_open"), "bad");
      return true;
    }
    if (kind === "vote" && !S.voteOpen) { msg(why("vote_closed"), "bad"); return true; }
    return false;
  }

  function onGo() {
    var a = go.getAttribute("data-act");
    if (a === "stamp-login" || a === "stamp-join") { needMember({ what: "checkin" }, go); return; }
    if (a === "stamp") { checkin(); return; }
    if (a === "cheers") {
      /* 응원 칸을 머리(56px) 바로 아래로 — 첫 칸에 초점(누르기만 하면 된다) */
      var cs = byId("gig-cheers"), hd = document.querySelector(".gig-head");
      var hb = hd ? hd.getBoundingClientRect().bottom : 0;
      window.scrollTo({ top: Math.max(0, window.scrollY + cs.getBoundingClientRect().top - hb - 8), behavior: reduced() ? "auto" : "smooth" });
      var c0 = byId("gig-chips").firstElementChild;
      if (c0) setTimeout(function () { try { c0.focus({ preventScroll: true }); } catch (e) {} }, reduced() ? 0 : 350);
      return;
    }
    if (a === "gb") {
      var target = byId("gig-gb-form").hidden ? byId("gig-gb-login") : byId("gig-gb-ta");
      var sec = byId("gig-gb");
      if (sec.scrollIntoView) sec.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" });
      setTimeout(function () { try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }, reduced() ? 0 : 350);
    }
  }

  /* ① 도장 */
  function checkin(then) {
    if (S.busy.checkin) return;
    if (needMember({ what: "checkin" }, go)) return;
    if (blockedOrClosed("checkin")) return;
    S.busy.checkin = true;
    go.textContent = t("gig.stamping", "찍는 중…");
    go.setAttribute("aria-busy", "true");
    go.disabled = true;
    var before = nOf("checkins");
    M.rpc("gig_checkin", { p_code: S.code }, true).then(function (r) {
      S.busy.checkin = false;
      go.removeAttribute("aria-busy");
      go.disabled = false;
      if (!r || !r.ok) {
        var why2 = r && r.reason;
        if (why2 === "not_logged_in" || why2 === "expired" || why2 === "not_member") {
          S.me = why2 === "not_member" ? (S.me || { joined: false }) : null;
          if (S.me) S.me.joined = false;
          render();
          needMember({ what: "checkin" }, go);
          return;
        }
        render();
        msg(why(why2), "bad");
        if (why2 === "not_open") refetch();
        return;
      }
      S.me.checked = true;
      S.me.checked_at = r.at;
      setN("checkins", null, r.checkins, r.already ? null : r.at, true);
      S.stampMsg = r.already ? fmt(t("gig.alreadyF", "이미 도장을 찍으셨습니다 ({t})."), { t: hhmm(r.at) })
                             : t("gig.stamped", "도장을 찍었습니다. 내 정보에 남았습니다.");
      render();
      if (!r.already) {
        stampMoment();
        countUp(before, nOf("checkins"));
        try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) {}
      }
      var f = byId("gig-stamp");
      if (f.scrollIntoView && f.getBoundingClientRect().top < 56) f.scrollIntoView({ block: "center" });
      if (typeof then === "function") then(r);
    });
  }
  /* 처음 찍힌 순간 한 번만 — 끝나면 클래스를 떼어 다시 그려도 움직이지 않게 */
  function stampMoment() {
    if (reduced()) return;
    var f = byId("gig-stamp");
    f.classList.remove("is-new");
    void f.offsetWidth;
    f.classList.add("is-new");
    f.addEventListener("animationend", function done() {
      f.classList.remove("is-new");
      f.removeEventListener("animationend", done);
    });
  }
  /* 내 도장 직후 한 번만(400ms). 몇 초마다 새로 센 숫자에는 걸지 않는다(반복 모션 금지) */
  function countUp(a, b) {
    var n = byId("gig-n");
    if (reduced() || b <= a || !window.requestAnimationFrame) { paintN(); return; }
    var t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / 400);
      n.textContent = String(Math.round(a + (b - a) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step); else paintN();
    }
    requestAnimationFrame(step);
  }

  /* ② 응원 — 누르면 바로(낙관적). 같은 칸을 빠르게 여러 번 눌러도 마지막 뜻 하나만 서버에 남는다 */
  function onCheer(k, keepMsg) {
    if (blockedOrClosed("cheer")) return;
    if (needMember({ what: "cheer", k: k })) return;
    var mine = S.me.cheers || [];
    var cur = S.want.cheer[k] !== undefined ? S.want.cheer[k] : mine.indexOf(k) >= 0;
    S.want.cheer[k] = !cur;
    bump("cheers", k, cur ? -1 : 1);
    paintCheers(lstate());
    paintBar(lstate());
    if (!keepMsg) msg("");
    if (!S.busy.cheer[k]) sendCheer(k);
  }
  function sendCheer(k) {
    var on = S.want.cheer[k];
    S.busy.cheer[k] = true;
    M.rpc("gig_cheer", { p_code: S.code, p_k: k, p_on: on }, true).then(function (r) {
      S.busy.cheer[k] = false;
      if (!r || !r.ok) {
        /* 되돌린다 — 서버가 아는 마지막 상태로. 숫자도 */
        var had = (S.me && S.me.cheers || []).indexOf(k) >= 0;
        if (S.want.cheer[k] !== had) bump("cheers", k, had ? 1 : -1);
        delete S.want.cheer[k];
        paintCheers(lstate());
        paintBar(lstate());
        failed(r);
        return;
      }
      var list = S.me.cheers || (S.me.cheers = []);
      var i = list.indexOf(k);
      if (r.on && i < 0) list.push(k);
      if (!r.on && i >= 0) list.splice(i, 1);
      setN("cheers", k, r.n, r.at, true);
      if (S.want.cheer[k] !== r.on) { bump("cheers", k, S.want.cheer[k] ? 1 : -1); sendCheer(k); }
      else delete S.want.cheer[k];
      paintCheers(lstate());
    });
  }
  function bump(kind, key, d) {
    var box = S.n[kind], cur = box[key] || { v: 0, at: 0 };
    box[key] = { v: Math.max(0, cur.v + d), at: cur.at };
  }

  /* ③ 앵콜 투표 — 한 사람 한 곡. 다른 곡을 누르면 옮긴다 */
  function onVote(song, keepMsg) {
    if (blockedOrClosed("vote")) return;
    if (needMember({ what: "vote", song: song })) return;
    var cur = S.want.vote !== undefined ? S.want.vote : S.me.vote || null;
    if (cur === song) { msg(t("gig.votedSame", "이미 고르셨습니다. 다른 곡을 누르면 바뀝니다.")); return; }
    if (cur) bump("votes", cur, -1);
    bump("votes", song, 1);
    S.want.vote = song;
    paintVotes(lstate());
    paintBar(lstate());
    if (!keepMsg) msg("");
    if (!S.busy.vote) sendVote();
  }
  function sendVote() {
    var song = S.want.vote;
    S.busy.vote = true;
    M.rpc("gig_vote", { p_code: S.code, p_song: song }, true).then(function (r) {
      S.busy.vote = false;
      if (!r || !r.ok) {
        var had = S.me.vote || null;
        if (S.want.vote && S.want.vote !== had) bump("votes", S.want.vote, -1);
        if (had && S.want.vote !== had) bump("votes", had, 1);
        S.want.vote = undefined;
        paintVotes(lstate());
        paintBar(lstate());
        failed(r);
        if (r && r.reason === "vote_closed") { S.voteOpen = false; paintVotes(lstate()); }
        return;
      }
      S.me.vote = r.song;
      if (r.song) setN("votes", r.song, r.n, r.at, true);
      if (r.prev && r.prev !== r.song) setN("votes", r.prev, r.prev_n, r.at, true);
      if (S.want.vote !== r.song) {
        /* 기다리는 동안 또 다른 곡을 눌렀다 — 화면 숫자는 이미 그 뜻대로 움직였다 */
        bump("votes", r.song, -1);
        bump("votes", S.want.vote, 1);
        sendVote();
      } else S.want.vote = undefined;
      paintVotes(lstate());
    });
  }

  function failed(r) {
    var w = r && r.reason;
    if (w === "not_logged_in" || w === "expired") { S.me = null; render(); M.openSheet("start", go, null, { ctx: "gig" }); return; }
    if (w === "not_member") { if (S.me) S.me.joined = false; render(); M.openSheet("join", go, null, { ctx: "gig" }); return; }
    msg(why(w), "bad");
    if (w === "not_open" || w === "blocked") refetch();
  }

  /* ④ 방명록 */
  function onGbSubmit(e) {
    e.preventDefault();
    var ta = byId("gig-gb-ta"), b = byId("gig-gb-go");
    var body = (ta.value || "").replace(/^\s+|\s+$/g, "");
    if (body.length < 2) { msg(why("empty"), "bad"); ta.focus(); return; }
    if (body.length > 500) { msg(why("too_long"), "bad"); return; }
    if (needMember(null, b)) return;
    b.disabled = true;
    M.rpc("gig_guestbook_write", { p_code: S.code, p_body: body }, true).then(function (r) {
      b.disabled = false;
      if (!r || !r.ok) { failed(r); return; }
      ta.value = "";
      gbCount();
      S.me.posted = (S.me.posted || 0) + 1;
      var done = r.status === "approved" ? t("gig.gbPosted", "올라갔습니다.") : t("gig.gbPending", "받았습니다. 확인한 뒤 올라갑니다.");
      /* 결과를 화면 밖(#gig-msg, 위쪽)에만 쓰면 빈 글칸과 '남기기'가 그대로 남아 '안 올라갔나?' 하고 한 번 더
         눌렀다(공연당 3개 제한을 쓴다). 폼을 접고 그 자리에 결과 + '한 줄 더'(검토 40번). 낭독은 #gig-msg 가 맡는다 */
      S.gbDone = done;
      msg(done, "ok");
      loadGuestbook();
      render();
    });
  }
  function gbCount() {
    var ta = byId("gig-gb-ta");
    txt("gig-gb-count", (ta.value || "").length + " / 500");
  }

  /* 채운 단추는 화면에 늘 하나 — 방명록 쓰기 칸이 보이거나 글을 치는 동안에는 하단 바를 내린다
     (iOS 에서 자판이 올라오면 고정 바가 자판 위로 떠서 글칸을 가린다) */
  var io = null, formIn = false, goIn = false;
  function watchForm() {
    if (io || !window.IntersectionObserver) return;
    io = new IntersectionObserver(function (es) {
      es.forEach(function (x) {
        if (x.target.id === "gig-gb-form") formIn = x.isIntersecting && x.intersectionRatio >= 0.3;
        else goIn = x.isIntersecting;
      });
      document.body.classList.toggle("gb-in-view", formIn || goIn);
    }, { threshold: [0, 0.3, 0.6] });
    io.observe(byId("gig-gb-form"));
    io.observe(byId("gig-gb-go"));
  }

  /* ================================================================
     숫자 새로 세기 — 화면이 보이고 공연이 진행 중일 때만
     ================================================================ */
  var pollT = null, failN = 0, bT = null;
  function pollable() { return !!S.ev && (S.phase === "before" || S.phase === "open" || S.phase === "after"); }
  function gap() {
    var base = S.pollS * 1000;
    if (failN) return Math.min(MAX_GAP, base * Math.pow(2, failN));
    return base + Math.floor(Math.random() * 3000);
  }
  var pulseGen = 0;
  function poll(reset) {
    clearTimeout(pollT);
    if (!pollable() || document.visibilityState === "hidden") return;
    if (reset) { pollT = setTimeout(pulse, gap()); return; }
    pulse();
  }
  function pulse() {
    clearTimeout(pollT);
    if (!pollable() || document.visibilityState === "hidden") return;
    var g = ++pulseGen, code = S.code;
    M.rpc("gig_pulse", { p_code: code }).then(function (r) {
      if (g !== pulseGen || code !== S.code) return;
      if (r && r.ok) { failN = 0; applyPulse(r); }
      else failN++;
      if (pollable() && document.visibilityState !== "hidden") pollT = setTimeout(pulse, gap());
    });
  }
  function applyPulse(r) {
    var at = r.at;
    if (r.now) S.skew = ms(r.now) - Date.now();
    setN("checkins", null, r.checkins, at);
    (r.cheers || []).forEach(function (x) { setN("cheers", x.k, x.n, at); });
    (r.votes || []).forEach(function (x) { setN("votes", x.song, x.n, at); });
    if (r.guest) S.guest = r.guest;
    var phaseChanged = r.phase && r.phase !== S.phase;
    S.voteOpen = r.vote_open !== false;
    if (phaseChanged) {
      /* 단계가 바뀌었다(시작 전 → 도장 받는 중 → 방명록만 → 끝) — 내 상태까지 새로 받는다 */
      S.phase = r.phase;
      refetch();
      return;
    }
    if (!S.busy.checkin) paintN();
    render();
  }
  /* 다음 경계 시각(도장 열림·닫힘·방명록 마감)에 한 번 더 묻는다 — 서버 시각 기준 */
  function boundary() {
    clearTimeout(bT);
    if (!S.ev) return;
    var now = Date.now() + S.skew, next = 0;
    [S.ev.opens_at, S.ev.closes_at, S.ev.guest_until].forEach(function (x) {
      var v = ms(x);
      if (v > now && (!next || v < next)) next = v;
    });
    if (!next || next - now > 6 * 3600e3) return;
    bT = setTimeout(function () { if (document.visibilityState !== "hidden") pulse(); boundary(); }, next - now + 1500);
  }
  function refetch() { if (S.code) { S.src = "url"; load(S.code); } }

  document.addEventListener("visibilitychange", function () {
    if (!S.ev) return;
    if (document.visibilityState === "hidden") { clearTimeout(pollT); pulseGen++; return; }
    pulse();
  });

  /* ================================================================
     로그인 뒤 이어서 할 일 — 도장·응원·투표를 누르고 회원으로 들어온 사람
     ================================================================ */
  function sig(me) { return me ? (me.joined ? "J" : "U") : "A"; }
  function runNext() {
    if (!S.me || !S.me.joined || !M.takeNext) return;
    var n = M.takeNext(NEXTS);
    if (!n) return;
    if (n.code && n.code !== S.code) return;
    if (n.what === "checkin") { if (!S.me.checked) checkin(); return; }
    /* 응원·투표를 누르고 들어온 사람 — 회원 창은 '가입 마치고 도장 찍기'를 약속했다. 도장이 모든 행동의
       바탕이므로 도장을 먼저 찍고, 이어서 누른 것을 보낸다. 그리고 실제로 한 일을 모두 말한다(검토 35번) */
    var stampFirst = S.phase === "open" && !S.me.checked;
    if (n.what === "cheer" && n.k != null) {
      var k = +n.k;
      var doCheer = function () {
        if ((S.me.cheers || []).indexOf(k) >= 0) return;
        onCheer(k, true);
        if (stampFirst) msg(fmt(t("gig.stampCheerF", "도장을 찍고 「{p}」 응원을 보냈습니다."), { p: phraseOf(k) }), "ok");
      };
      if (stampFirst) checkin(function () { doCheer(); }); else doCheer();
      return;
    }
    if (n.what === "vote" && n.song) {
      var song = n.song;
      var doVote = function () {
        if (S.me.vote === song) return;
        onVote(song, true);
        if (stampFirst) msg(fmt(t("gig.stampVoteF", "도장을 찍고 「{s}」에 한 표를 보냈습니다."), { s: song }), "ok");
      };
      if (stampFirst) checkin(function () { doVote(); }); else doVote();
    }
  }
  function phraseOf(k) {
    for (var i = 0; i < S.phrases.length; i++) if (+S.phrases[i].k === +k) return (isEN() ? S.phrases[i].en : S.phrases[i].ko) || S.phrases[i].ko || "";
    return "";
  }

  var bound = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    go = byId("gig-go");
    go.addEventListener("click", onGo);
    /* 로그인 창을 누르기 전에 미리 받아 둔다 — 손가락이 단추에 닿는 순간(창이 바로 뜨게) */
    ["touchstart", "pointerenter", "focus"].forEach(function (ev) {
      go.addEventListener(ev, function () { if (!S.me && M.prefetch) M.prefetch(); }, { passive: true });
    });
    byId("gig-retry").addEventListener("click", function () {
      show(byId("gig-slow"), false);
      if (S.code || urlCode()) { S.src = S.src === "auto" ? "auto" : "url"; load(S.code || urlCode()); } else start();
    });
    byId("gig-code").addEventListener("submit", function (e) {
      e.preventDefault();
      var inp = byId("gig-code-in"), c = normCode(inp.value);
      inp.value = c;
      if (!validCode(c)) { txt("gig-code-msg", t("gig.codeBad", "다섯 글자를 다시 확인해 주세요. 0·O·1·I·L 은 쓰지 않습니다.")); inp.focus(); return; }
      txt("gig-code-msg", "");
      S.src = "input";
      S.code = c;
      try { history.replaceState(history.state, "", location.pathname + "?e=" + encodeURIComponent(c)); } catch (e2) {}
      S.loaded = false;
      load(c);
    });
    byId("gig-code-in").addEventListener("input", function () {
      var inp = byId("gig-code-in"), c = inp.value.toUpperCase();
      if (c !== inp.value) inp.value = c;
    });
    byId("gig-gb-form").addEventListener("submit", onGbSubmit);
    byId("gig-gb-ta").addEventListener("input", gbCount);
    byId("gig-gb-login").addEventListener("click", function () { needMember(null, byId("gig-gb-login")); });
    byId("gig-gb-again-b").addEventListener("click", function () {
      S.gbDone = "";
      paintGuestbook();
      var ta = byId("gig-gb-ta");
      try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
      if (ta.scrollIntoView) ta.scrollIntoView({ block: "center" });
    });
    byId("gig-starts").addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest(".gig-start") : null;
      if (!b) return;
      var ta = byId("gig-gb-ta"), add = b.getAttribute("data-add") || "";
      ta.value = (ta.value && !/\s$/.test(ta.value) ? ta.value + " " : ta.value) + add;
      gbCount();
      try { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e2) { ta.focus(); }
    });
    /* 글을 치는 동안 하단 바를 내린다. 자판이 내려가고 300ms 뒤 다시 */
    var typT = null;
    document.addEventListener("focusin", function (e) {
      var n = e.target;
      if (n && n.matches && n.matches("#main textarea, #main input")) { clearTimeout(typT); document.body.classList.add("is-typing"); }
    });
    document.addEventListener("focusout", function (e) {
      var n = e.target;
      if (n && n.matches && n.matches("#main textarea, #main input")) {
        clearTimeout(typT);
        typT = setTimeout(function () { document.body.classList.remove("is-typing"); }, 300);
      }
    });
    /* 회원 상태가 바뀌면(로그인·가입·로그아웃) 이 공연에서의 내 상태(도장·응원·표)를 새로 받는다 */
    M.on(function (type) {
      if (!S.loaded) return;
      if (type === "next") { refetch(); return; }
      /* 로그인·가입을 마친 사람에게 — 공연 화면은 헤더 알림 대신 제 자리의 안내 줄에 */
      if (type === "welcome") { msg(arguments[1] || "", "ok"); return; }
      if (type !== "state") return;
      if (sig(M.me()) !== sig(S.me)) refetch();
    });
  }

  function boot() {
    initFs();
    initLang();
    M = window.INSOONI_MEMBER;
    loadI18n().then(function () {
      if (M && M.refresh) M.refresh();
      if (!switchedOn() || !M) { renderOff(); return; }
      start();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* 시험용 창구 — 화면 검사기가 상태를 들여다볼 수 있게(읽기 전용) */
  window.INSOONI_GIG = { state: function () { return { L: S.ev ? lstate() : document.body.getAttribute("data-gig"), code: S.code, phase: S.phase, me: S.me, pollS: S.pollS, failN: failN }; } };
})();
