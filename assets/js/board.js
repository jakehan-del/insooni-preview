/* ============================================================
   INSOONI · 사랑방 회원 · 게시판 (board.js)
   ------------------------------------------------------------
   매니저 요청(2026-10-01)과 형님 결정(2026-10-02):
     · 로그인은 카카오 + 이메일. Supabase 인증이 맡는다(이 파일은 그 문을 두드릴 뿐이다).
     · 새싹 → 정회원 자동 등업(운영자가 올린 글 3 + 댓글 5), 운영자는 언제든 직접 조정.
     · 정회원의 글·댓글은 바로 공개, 새싹은 운영자 확인 뒤 공개.
   서버 규칙은 supabase/010_회원과_게시판.sql 에 있다. 화면을 고쳐도 권한은 생기지 않는다.

   지킨 것
     1) 팬이 쓴 글은 신뢰할 수 없는 입력이다. 전부 textContent 로만 넣는다(innerHTML 금지).
     2) 비밀번호는 어디에도 저장하지 않는다. 세션 열쇠만 이 기기에 둔다(로그인 유지).
     3) 쓰던 글은 이 기기에 저절로 저장한다 — 카카오 로그인으로 페이지를 떠났다 와도,
        실수로 닫아도 잃지 않는다. 길게 쓰는 사람이 가장 두려워하는 것이 '날아감'이다.
     4) 실패를 성공처럼 보이지 않는다. 서버가 거절하면 그 이유를 사람 말로 옮긴다.
     5) 서버에 010 이 아직 없으면(함수 404) 게시판을 조용히 숨긴다 — 깨진 화면을 보이지 않는다.
     6) 로그인은 PKCE — 돌아오는 주소에 열쇠가 실리지 않고 일회용 코드만 실린다.
   ============================================================ */
(function () {
  "use strict";

  var SKEY = "insooni_member_session";   /* 세션 열쇠(로그인 유지) */
  var PKEY = "insooni_pkce";             /* 로그인 왕복 동안만 쓰는 일회용 검증값 */
  var DKEY = "insooni_board_draft";      /* 쓰던 글 */
  var NKEY = "insooni_board_next";       /* 로그인 뒤 이어서 할 일 */
  var TIMEOUT = 15000;

  /* ---------- 작은 도구 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
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
  function isEN() { return document.documentElement.getAttribute("lang") === "en"; }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function cfg() {
    var c = window.INSOONI_CONFIG || {};
    var url = (c.url || "").replace(/\/+$/, "");
    var key = c.anonKey || "";
    if (!url || !key) return null;
    if (url.indexOf("여기에") >= 0 || key.indexOf("여기에") >= 0) return null;
    if (url.indexOf("YOUR-") >= 0 || key.indexOf("YOUR-") >= 0) return null;
    return { url: url, key: key };
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
  /* 돌아올 곳 = 지금 보고 있는 사랑방 주소 + 무엇을 하다 왔는지(bd=signup|recover|kakao).
     라이브는 /community(깨끗한 주소), 로컬 검사는 /community.html.
     Supabase 는 Site URL 과 같은 호스트의 주소를 받아 준다(설정 안내 참고). */
  function returnURL(purpose) { return location.origin + location.pathname + (purpose ? "?bd=" + purpose : ""); }

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

  var Auth = {
    settings: function () {
      return authFetch("settings", { method: "GET" }).then(function (r) {
        if (!r.ok || !r.body) return { ok: false };
        var ext = r.body.external || {};
        /* 카카오는 서버에서 켜져 있어도 config.js 의 kakao:false 로 버튼만 숨길 수 있다 —
           카카오 쪽 동의항목이 덜 끝나 팬이 KOE205 화면에 떨어지는 동안(2026-10-02) 쓰려고 */
        var kk = !!ext.kakao && (window.INSOONI_CONFIG || {}).kakao !== false;
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
      var err = q.get("error_description") || q.get("error") || hq.get("error_description") || hq.get("error");
      var at = hq.get("access_token");
      if (!code && !err && !at && !th) return Promise.resolve(null);
      /* 주소창에 코드·열쇠를 남기지 않는다(뒤로 가기·공유로 새지 않게) */
      try { history.replaceState(null, "", location.pathname + "#board"); } catch (e) {}
      if (err) {
        var old = /otp_expired|access_denied|flow_state/.test(errc) || /expired|invalid/i.test(err);
        return Promise.resolve({ kind: "error", reason: old ? "link_expired" : "auth_fail", purpose: purpose });
      }
      if (th) {
        /* 메일 양식이 token_hash 를 싣는 경우(설정 안내 5번) — 어느 브라우저에서 열어도 이어진다.
           폰에서는 메일 링크가 메일 앱 안의 브라우저로 열리는 일이 흔하다 */
        var vt = ttype === "recovery" ? "recovery" : (ttype || "email");
        var pur = vt === "recovery" ? "recover" : "signup";
        return authFetch("verify", { body: { type: vt, token_hash: th } }).then(function (r) {
          if (r.ok && r.body && r.body.access_token) { setS(r.body); return { kind: "login", purpose: pur }; }
          var w = authWhy(r);
          return { kind: "error", reason: w === "auth_fail" ? "link_expired" : w, purpose: pur };
        });
      }
      if (at) {
        /* 사이트는 이 방식을 쓰지 않는다(모두 PKCE). 남이 만든 링크로 지금 세션이 바뀌지 않게,
           이미 들어와 있으면 무시하고, 아니면 서버에 진짜 열쇠인지 물어본 뒤에만 받는다(검토 지적). */
        if (getS()) return Promise.resolve(null);
        return authFetch("user", { method: "GET", bearer: at }).then(function (r) {
          if (!r.ok || !r.body || !r.body.id) return { kind: "error", reason: "link_expired", purpose: purpose };
          setS({ access_token: at, refresh_token: hq.get("refresh_token"), expires_in: +hq.get("expires_in") || 3600 });
          return { kind: "login", purpose: hq.get("type") === "recovery" ? "recover" : "login" };
        });
      }
      var p = lsGet(PKEY);
      if (!p || !p.v || Date.now() - (p.at || 0) > 86400e3) {
        /* 다른 기기·다른 브라우저(메일 앱 안 등)에서 링크를 열었다 */
        return Promise.resolve({ kind: "noverifier", purpose: purpose || "" });
      }
      return authFetch("token?grant_type=pkce", { body: { auth_code: code, code_verifier: p.v } }).then(function (r) {
        if (r.ok && r.body && r.body.access_token) { lsDel(PKEY); setS(r.body); return { kind: "login", purpose: p.p }; }
        var w = authWhy(r);
        return { kind: "error", reason: w === "auth_fail" ? "link_expired" : w, purpose: purpose || p.p };
      });
    }
  };

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
      case "need_agree": return t("bd.e.agree", "이용약관과 개인정보처리방침에 동의해 주세요.");
      case "need_age": return t("bd.e.age", "만 14세 이상만 가입할 수 있습니다.");
      case "admin_cannot_leave": return t("bd.e.adminLeave", "운영자 계정은 여기서 탈퇴할 수 없습니다.");
      case "not_ready": return t("bd.e.ready", "회원 기능을 준비하고 있습니다. 조금만 기다려 주세요.");
      case "bad_login": return t("bd.e.badLogin", "이메일 또는 비밀번호가 맞지 않습니다.");
      case "not_confirmed": return t("bd.e.confirm", "아직 메일 확인 전입니다. 받은 메일의 링크를 먼저 눌러 주세요.");
      case "weak_pw": return t("bd.e.weak", "비밀번호는 8자 이상으로 정해 주세요.");
      case "mail_limit": return t("bd.e.mail", "지금은 메일을 보낼 수 없습니다(잠시 너무 많이 보냈습니다). 조금 뒤 다시 시도하시거나 카카오로 시작해 주세요.");
      case "signup_off": return t("bd.e.signupOff", "지금은 이 방법으로 가입을 받지 않습니다.");
      case "exists": return t("bd.e.exists", "이미 가입된 이메일입니다. 로그인해 주세요.");
      case "bad_email": return t("bd.e.email", "이메일 주소를 다시 확인해 주세요.");
      case "same_pw": return t("bd.e.samePw", "지금 비밀번호와 다른 비밀번호를 정해 주세요.");
      case "pw_mismatch": return t("bd.e.pwMatch", "두 비밀번호가 서로 다릅니다.");
      case "link_expired": return t("bd.e.linkOld", "링크가 만료됐거나 이미 쓰였습니다. 다시 받아 주세요.");
      default: return t("bd.e.fail", "지금 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
    }
  }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var now = new Date();
    var hh = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    var same = d.toDateString() === now.toDateString();
    if (isEN()) {
      if (same) return "Today " + hh;
      var mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
      return mo + " " + d.getDate() + (d.getFullYear() === now.getFullYear() ? "" : ", " + d.getFullYear());
    }
    if (same) return "오늘 " + hh;
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + "월 " + d.getDate() + "일";
    return d.getFullYear() + ". " + (d.getMonth() + 1) + ". " + d.getDate() + ".";
  }
  function badge(level, staff) {
    var k = staff ? "staff" : level;
    var label = k === "staff" ? t("bd.lv.staff", "운영자")
              : k === "member" ? t("bd.lv.member", "정회원")
              : k === "blocked" ? t("bd.lv.blocked", "쉬는 중")
              : t("bd.lv.sprout", "새싹");
    return el("span", "bd-badge bd-badge--" + k, label);
  }
  function author(nick, level, staff) {
    var w = el("span", "bd-who-line");
    w.appendChild(el("span", "bd-nick", nick));
    w.appendChild(badge(level, staff));
    return w;
  }
  function say(node, text, kind) {
    if (!node) return;
    node.textContent = text || "";
    node.classList.remove("is-ok", "is-bad");
    if (kind) node.classList.add(kind === "ok" ? "is-ok" : "is-bad");
  }

  /* ---------- 상태 ---------- */
  /* ---------- 카페의 게시판들 ----------
     공지는 운영자만 쓴다. 인순이의 편지는 서버가 아니라 옛 원문(letters.json)에서 싣는다 —
     본인이 2005년에 쓴 글이라 회원 글과 섞지 않고, 고치거나 지울 수 없다. */
  var BOARDS = [
    { k: "all",     key: "bd.b.all",     ko: "전체글",        dkey: "bd.bd.all",     d: "" },
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

  var S = { me: null, settings: null, ready: true, open: true, board: "all", rows: [], more: false,
            editing: null, cdraft: {}, letters: null, view: "list" };
  var sec = null;     /* 지금 화면의 #board (라우터가 <main> 을 갈아끼우면 바뀐다) */

  function joined() { return !!(S.me && S.me.ok && S.me.joined); }
  function canWrite() { return joined() && S.me.level !== "blocked"; }
  /* 회원 게시판을 쓸 수 있는가 — config.js 스위치가 켜졌고 서버에 010 이 있다 */
  function live() { return S.open && S.ready; }

  function loadMe() {
    if (!live()) { S.me = null; return Promise.resolve(null); }
    return token().then(function (at) {
      if (!at) { S.me = null; return null; }
      return rpc("member_me", {}, true).then(function (me) {
        if (me && me.reason === "not_ready") { S.ready = false; S.me = null; return null; }
        S.me = (me && me.ok) ? me : null;
        return S.me;
      });
    });
  }

  /* ---------- 위쪽 줄: 누가 들어와 있나 · 카페 숫자 ---------- */
  function renderWho() {
    var box = $("#bd-who", sec);
    if (!box) return;
    box.textContent = "";
    box.hidden = !live();
    if (!live()) { renderNote(); return; }
    if (!S.me) {
      var b = el("button", "btn btn--ghost btn--sm", t("bd.login", "로그인 · 가입"));
      b.type = "button";
      b.addEventListener("click", function () { openSheet("start", b); });
      box.appendChild(b);
    } else if (!S.me.joined) {
      var j = el("button", "btn btn--ghost btn--sm", t("bd.finish", "가입 마치기"));
      j.type = "button";
      j.addEventListener("click", function () { openSheet("join", j); });
      box.appendChild(j);
    } else {
      var me = el("button", "bd-me", null);
      me.type = "button";
      me.setAttribute("aria-label", t("bd.meAria", "내 정보 열기"));
      me.appendChild(author(S.me.nickname, S.me.level, S.me.admin));
      me.addEventListener("click", function () { openSheet("me", me); });
      box.appendChild(me);
    }
    renderNote();
  }
  function renderStat() {
    var n = $("#cafe-stat", sec);
    if (!n) return;
    if (!live()) { n.hidden = true; return; }
    rpc("cafe_info", {}).then(function (r) {
      if (!r || !r.ok) { n.hidden = true; return; }
      n.textContent = t("bd.stat1", "회원 ") + r.members + t("bd.stat2", "명 · 글 ") + r.posts + t("bd.stat3", "개");
      n.hidden = false;
    });
  }

  function progressText(me) {
    /* 운영자가 등급을 정한 새싹은 기준을 채워도 저절로 오르지 않는다 — 숫자를 보이면 거짓 약속이 된다 */
    if (me.auto_up === false) return t("bd.lvByStaff", "등급은 운영자가 정했습니다.");
    var np = Math.max(0, (me.need_posts || 0) - (me.posts_ok || 0));
    var nc = Math.max(0, (me.need_comments || 0) - (me.comments_ok || 0));
    return t("bd.prog1", "정회원까지 글 ") + np + t("bd.prog2", "개 · 댓글 ") + nc + t("bd.prog3", "개 남았습니다.");
  }
  function renderNote() {
    var n = $("#bd-note", sec);
    if (!n) return;
    if (!live() || !joined() || S.view !== "list") { n.hidden = true; return; }
    var me = S.me;
    if (me.admin) n.textContent = t("bd.noteStaff", "운영자로 들어와 있습니다. 글과 댓글이 바로 올라갑니다.");
    else if (me.level === "member") n.textContent = t("bd.noteMember", "정회원입니다. 글과 댓글이 바로 올라갑니다.");
    else if (me.level === "blocked") n.textContent = why("blocked");
    else n.textContent = t("bd.noteSprout", "새싹 회원입니다. 글과 댓글은 운영자가 확인한 뒤 올라갑니다. ") + progressText(me);
    n.hidden = false;
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
    return { view: "list", board: null };
  }
  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }
  function show(view) {
    S.view = view;
    $("#cafe-list", sec).hidden = view !== "list";
    $("#cafe-post", sec).hidden = view !== "post";
    $("#bd-form", sec).hidden = view !== "write";
    renderNote();
  }
  function toTop() {
    var top = sec.getBoundingClientRect().top;
    if (top < -10 || top > window.innerHeight * .5) sec.scrollIntoView({ block: "start" });
  }

  function route() {
    if (!sec || !document.body.contains(sec)) return;
    var r = parseHash();
    say($("#bd-msg", sec), S.flash || "", S.flashKind);
    S.flash = "";
    if (r.view === "letter") { openLetter(r.id); return; }
    if (r.view === "post") {
      if (!live()) { go("#b=" + S.board); return; }
      openPost(r.id);
      return;
    }
    if (r.view === "write") {
      if (!live()) { go("#b=all"); return; }
      if (!S.me) { lsSet(NKEY, { what: "write", board: r.board || null }); go("#b=" + S.board); openSheet("start", $("#bd-write-btn", sec), t("bd.needLogin", "글을 쓰려면 먼저 회원으로 들어와 주세요.")); return; }
      if (!S.me.joined) { lsSet(NKEY, { what: "write", board: r.board || null }); go("#b=" + S.board); openSheet("join", null); return; }
      if (S.me.level === "blocked") { S.flash = why("blocked"); S.flashKind = "bad"; go("#b=" + S.board); return; }
      if (r.edit) startEdit(r.edit); else openForm(null, r.board);
      return;
    }
    var b = r.board && boardOf(r.board).k === r.board ? r.board : (r.board ? "all" : S.board);
    S.board = b;
    show("list");
    renderMenu();
    loadList(false);
  }

  /* ---------- 메뉴 · 목록 ---------- */
  function renderMenu() {
    Array.prototype.forEach.call(sec.querySelectorAll(".cafe-menu a"), function (a) {
      if (a.getAttribute("data-b") === S.board) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var b = boardOf(S.board);
    $("#cafe-board-h", sec).textContent = t(b.key, b.ko);
    var d = $("#cafe-board-d", sec);
    d.textContent = b.d ? t(b.dkey, b.d) : "";
    d.hidden = !b.d;
    var w = $("#bd-write-btn", sec);
    /* 편지 게시판엔 쓸 수 없다. 공지는 운영자만 */
    w.hidden = !live() || S.board === "letters" || (S.board === "notice" && !(S.me && S.me.admin));
  }

  function loadList(more) {
    var msg = $("#bd-list-msg", sec), list = $("#bd-list", sec), pins = $("#bd-pins", sec);
    var closed = $("#cafe-closed", sec);
    msg.hidden = true;
    closed.hidden = true;
    if (S.board === "letters") {
      pins.textContent = ""; $("#bd-mine", sec).hidden = true; $("#bd-more", sec).hidden = true;
      return loadLetters().then(function (L) {
        list.textContent = "";
        L.forEach(function (l, i) { list.appendChild(letterRow(l, i)); });
        $("#bd-empty", sec).hidden = L.length > 0;
      });
    }
    if (!live()) {
      /* 회원 게시판이 아직 닫혀 있다 — 서버에 묻지 않고 그 사실을 그대로 말한다 */
      list.textContent = ""; pins.textContent = "";
      $("#bd-empty", sec).hidden = true; $("#bd-more", sec).hidden = true; $("#bd-mine", sec).hidden = true;
      if (S.board === "all") loadLetters().then(function () { pins.textContent = ""; pins.appendChild(lettersPin()); });
      closed.hidden = false;
      return Promise.resolve();
    }
    var before = more && S.rows.length ? S.rows[S.rows.length - 1].id : null;
    var want = S.board;
    return rpc("board_list", { p_board: want === "all" ? null : want, p_before: before, p_limit: 20 }).then(function (r) {
      if (want !== S.board) return;                       /* 그사이 다른 게시판을 눌렀다 */
      if (r && r.reason === "not_ready") { S.ready = false; renderWho(); renderMenu(); loadList(false); return; }
      if (!r || !r.ok) {
        /* 「글 0건」과 「못 불러옴」을 같은 화면으로 보이지 않는다 */
        say(msg, t("bd.listFail", "게시판을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요."), "bad");
        msg.hidden = false;
        return;
      }
      S.rows = more ? S.rows.concat(r.rows || []) : (r.rows || []);
      S.more = !!r.more;
      if (!more) {
        pins.textContent = "";
        (r.notices || []).forEach(function (n) { pins.appendChild(row(n, true)); });
        if (want === "all") loadLetters().then(function (L) { if (L.length && S.board === "all") pins.appendChild(lettersPin()); });
      }
      list.textContent = "";
      S.rows.forEach(function (x) { list.appendChild(row(x, false)); });
      $("#bd-empty", sec).hidden = S.rows.length > 0;
      $("#bd-more", sec).hidden = !S.more;
      loadMine();
    });
  }

  function row(x, pin) {
    var li = el("li", "cafe-row" + (pin ? " cafe-row--pin" : ""));
    li.setAttribute("data-id", x.id);
    var a = el("a", "cafe-link");
    a.href = "#p" + x.id;
    a.appendChild(el("span", "cafe-no", pin ? t("bd.b.notice", "공지") : String(x.id)));
    var main = el("span", "cafe-main");
    var line = el("span", "cafe-line");
    if (S.board === "all" && !pin && x.board) line.appendChild(el("span", "cafe-tag", boardName(x.board)));
    line.appendChild(el("span", "cafe-title", x.title));
    if (x.comments) line.appendChild(el("span", "cafe-cn", "[" + x.comments + "]"));
    if (x.status && x.status !== "approved") line.appendChild(statusBadge(x.status));
    main.appendChild(line);
    var meta = el("span", "cafe-meta");
    meta.appendChild(author(x.nickname, x.level, x.staff));
    meta.appendChild(el("span", "bd-dot", "·"));
    meta.appendChild(el("span", "bd-when", when(x.created_at)));
    main.appendChild(meta);
    a.appendChild(main);
    li.appendChild(a);
    return li;
  }
  function statusBadge(st) {
    return el("span", "bd-badge bd-badge--" + st,
      st === "pending" ? t("bd.st.pending", "확인 중") : t("bd.st.rejected", "내려감"));
  }

  /* ---------- 인순이의 편지(옛 원문) ---------- */
  function loadLetters() {
    if (S.letters) return Promise.resolve(S.letters);
    return fetch("assets/data/letters.json").then(function (r) { return r.json(); })
      .then(function (d) { S.letters = (d && d.items) || []; return S.letters; })["catch"](function () { return []; });
  }
  function letterDate(l) {
    var p = l.posted.split("-");
    return isEN() ? l.posted : (parseInt(p[0], 10) + ". " + parseInt(p[1], 10) + ". " + parseInt(p[2], 10) + ".");
  }
  function artist() {
    var w = el("span", "bd-who-line");
    w.appendChild(el("span", "bd-nick", t("bd.artist", "인순이")));
    w.appendChild(el("span", "bd-badge bd-badge--artist", t("bd.artistBadge", "아티스트")));
    return w;
  }
  function letterRow(l, i) {
    var li = el("li", "cafe-row cafe-row--letter");
    var a = el("a", "cafe-link");
    a.href = "#l" + i;
    a.appendChild(el("span", "cafe-no", l.posted.slice(0, 4)));
    var main = el("span", "cafe-main");
    var line = el("span", "cafe-line");
    line.appendChild(el("span", "cafe-title", "「" + l.title + "」"));
    main.appendChild(line);
    var meta = el("span", "cafe-meta");
    meta.appendChild(artist());
    meta.appendChild(el("span", "bd-dot", "·"));
    meta.appendChild(el("span", "bd-when", letterDate(l)));
    main.appendChild(meta);
    a.appendChild(main);
    li.appendChild(a);
    return li;
  }
  function lettersPin() {
    var li = el("li", "cafe-row cafe-row--pin cafe-row--letter");
    var a = el("a", "cafe-link");
    a.href = "#b=letters";
    a.appendChild(el("span", "cafe-no", t("bd.pinLetters", "편지")));
    var main = el("span", "cafe-main");
    var line = el("span", "cafe-line");
    line.appendChild(el("span", "cafe-title", t("bd.lettersPin", "인순이가 팬들에게 직접 남긴 편지") + " " + (S.letters || []).length + t("bd.lettersPin2", "편")));
    main.appendChild(line);
    var meta = el("span", "cafe-meta");
    meta.appendChild(artist());
    main.appendChild(meta);
    a.appendChild(main);
    li.appendChild(a);
    return li;
  }
  function openLetter(i) {
    show("post");
    var box = $("#cafe-post", sec);
    box.textContent = "";
    loadLetters().then(function (L) {
      var l = L[i];
      if (!l) { box.appendChild(el("p", "sb-msg is-bad", why("not_found"))); return; }
      box.appendChild(backLink("letters"));
      box.appendChild(el("p", "cafe-post-board", boardName("letters")));
      box.appendChild(el("h3", "cafe-post-title", "「" + l.title + "」"));
      var meta = el("p", "cafe-post-meta");
      meta.appendChild(artist());
      var years = new Date().getFullYear() - parseInt(l.posted.slice(0, 4), 10);
      meta.appendChild(el("span", "bd-when cafe-letter-when", isEN()
        ? (l.posted + " — " + years + " years ago · " + l.hit + " reads and " + l.comments + " replies at the time")
        : (letterDate(l) + " — " + years + "년 전 · 당시 조회 " + l.hit + " · 댓글 " + l.comments)));
      box.appendChild(meta);
      /* 원문 존중: textContent 로만, 번역하지 않는다. 손글씨 체 그대로 */
      var body = el("div", "letter-body cafe-letter-body", l.body);
      body.setAttribute("lang", "ko");
      box.appendChild(body);
      box.appendChild(el("p", "form-hint", t("bd.letterNote", "인순이가 2005년 팬 게시판에 직접 쓴 글입니다. 맞춤법도 띄어쓰기도 손대지 않았습니다.")));
      box.appendChild(backLink("letters", true));
      toTop();
    });
  }
  function backLink(board, bottom) {
    var a = el("a", bottom ? "btn btn--ghost btn--sm cafe-back cafe-back--bottom" : "cafe-back", t("bd.back2", "← 목록으로"));
    a.href = "#b=" + (board || S.board);
    return a;
  }

  /* ---------- 글 보기 ---------- */
  function openPost(id) {
    show("post");
    var box = $("#cafe-post", sec);
    box.textContent = "";
    box.appendChild(el("p", "bd-loading", t("bd.loading", "불러오는 중…")));
    toTop();
    rpc("board_read", { p_id: id }).then(function (r) {
      if (S.view !== "post" || parseHash().id !== id) return;
      box.textContent = "";
      if (!r || !r.ok) {
        box.appendChild(backLink());
        box.appendChild(el("p", "sb-msg is-bad", why(r && r.reason)));
        return;
      }
      renderPost(box, r);
    });
  }

  function renderPost(box, r) {
    var p = r.post;
    box.appendChild(backLink(p.board === "notice" ? "notice" : S.board));
    box.appendChild(el("p", "cafe-post-board", boardName(p.board)));
    box.appendChild(el("h3", "cafe-post-title", p.title));
    var meta = el("p", "cafe-post-meta");
    meta.appendChild(author(p.nickname, p.level, p.staff));
    meta.appendChild(el("span", "bd-dot", "·"));
    meta.appendChild(el("span", "bd-when", when(p.created_at)));
    if (p.edited_at) { meta.appendChild(el("span", "bd-dot", "·")); meta.appendChild(el("span", "bd-when", t("bd.editedShort", "고친 글"))); }
    if (p.status !== "approved") meta.appendChild(statusBadge(p.status));
    box.appendChild(meta);
    box.appendChild(el("div", "bd-body", p.body));
    if (p.mine) {
      var acts = el("div", "bd-acts");
      var ed = el("a", "btn btn--ghost btn--sm", t("bd.edit", "고치기"));
      ed.href = "#edit=" + p.id;
      var del = el("button", "btn btn--ghost btn--sm", t("bd.del", "지우기"));
      del.type = "button";
      del.addEventListener("click", function () {
        if (!window.confirm(t("bd.delQ", "이 글을 지울까요? 달린 댓글도 함께 지워지고 되돌릴 수 없습니다."))) return;
        del.disabled = true;
        rpc("board_delete", { p_id: p.id }, true).then(function (res) {
          del.disabled = false;
          if (res && res.ok) {
            S.flash = t("bd.deleted", "지웠습니다."); S.flashKind = "ok";
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
      var send = el("button", "btn btn--gold btn--sm", t("bd.cmtSend", "댓글 올리기"));
      send.type = "submit";
      f.appendChild(lab); f.appendChild(ta); f.appendChild(send);
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var v = ta.value.trim();
        if (!v) { say(cmsg, why("empty"), "bad"); ta.focus(); return; }
        send.disabled = true;
        rpc("comment_write", { p_post_id: p.id, p_body: v }, true).then(function (res) {
          send.disabled = false;
          if (res && res.ok) {
            ta.value = "";
            delete S.cdraft[p.id];
            refreshPost(p.id, res.status === "approved" ? t("bd.cmtOk", "댓글을 올렸습니다.")
                                                        : t("bd.cmtWaitOk", "댓글을 받았습니다. 운영자가 확인한 뒤 모두에게 보입니다."));
          } else handleWriteFail(res, cmsg);
        });
      });
      cwrap.appendChild(f);
    } else {
      var gb = el("button", "btn btn--ghost btn--sm",
        !S.me ? t("bd.cmtLogin", "로그인하고 댓글 쓰기") : !S.me.joined ? t("bd.cmtJoin", "가입 마치고 댓글 쓰기") : why("blocked"));
      gb.type = "button";
      if (S.me && S.me.joined) gb.disabled = true;
      gb.addEventListener("click", function () {
        lsSet(NKEY, { what: "open", id: p.id });
        openSheet(S.me ? "join" : "start", gb);
      });
      cwrap.appendChild(gb);
    }
    cwrap.appendChild(cmsg);
    box.appendChild(cwrap);
    box.appendChild(backLink(p.board === "notice" ? "notice" : S.board, true));
  }

  function comment(c, postId) {
    var it = el("li", "bd-c");
    var head = el("p", "bd-c-head");
    head.appendChild(author(c.nickname, c.level, c.staff));
    head.appendChild(el("span", "bd-dot", "·"));
    head.appendChild(el("span", "bd-when", when(c.created_at)));
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

  function refreshPost(id, note) {
    rpc("board_read", { p_id: id }).then(function (r) {
      if (S.view !== "post") return;
      var box = $("#cafe-post", sec);
      box.textContent = "";
      if (!r || !r.ok) { box.appendChild(backLink()); box.appendChild(el("p", "sb-msg is-bad", why(r && r.reason))); return; }
      renderPost(box, r);
      if (note) say(box.querySelector(".bd-cmsg"), note, "ok");
    });
    loadMe().then(renderWho);
  }

  /* ---------- 확인을 기다리는 내 글 ---------- */
  function loadMine() {
    var box = $("#bd-mine", sec);
    if (!box) return;
    if (!live() || !joined() || S.board === "letters") { box.hidden = true; return; }
    rpc("board_mine", {}, true).then(function (r) {
      var waiting = (r && r.ok ? r.rows : []).filter(function (x) { return x.status !== "approved"; });
      var ol = $("#bd-mine-list", box);
      ol.textContent = "";
      waiting.forEach(function (x) {
        ol.appendChild(row({ id: x.id, board: x.board, title: x.title, nickname: S.me.nickname, level: S.me.level, staff: S.me.admin,
                             created_at: x.created_at, comments: x.comments, status: x.status }, false));
      });
      $("#bd-mine-n", box).textContent = waiting.length;
      box.hidden = waiting.length === 0;
      /* 방금 글을 맡긴 사람에게는 펼쳐서 보여 준다 — 접혀 있으면 '내 글이 어디 갔지'가 된다 */
      if (S.showMine && waiting.length) { box.open = true; S.showMine = false; }
    });
  }

  /* ---------- 글쓰기 ---------- */
  function draftSave() {
    if (S.editing) return;   /* 고치는 중인 글은 초안으로 저장하지 않는다(새 글 초안을 덮지 않게) */
    var ti = sec && $("#bd-title", sec), bo = sec && $("#bd-body", sec), bs = sec && $("#bd-boardsel", sec);
    if (!ti || !bo) return;
    if (!ti.value && !bo.value) { lsDel(DKEY); return; }
    lsSet(DKEY, { title: ti.value, body: bo.value, board: bs ? bs.value : "free", at: Date.now() });
  }
  function counter() {
    var bo = $("#bd-body", sec), c = $("#bd-count", sec);
    if (bo && c) c.textContent = bo.value.length.toLocaleString() + " / 4,000";
  }
  function fillBoards(sel, current) {
    sel.textContent = "";
    writable().forEach(function (k) {
      var o = el("option", null, boardName(k));
      o.value = k;
      if (k === current) o.selected = true;
      sel.appendChild(o);
    });
    if (writable().indexOf(current) < 0) sel.value = "free";
  }

  function openForm(edit, board) {
    var f = $("#bd-form", sec);
    if (!f) return;
    var ti = $("#bd-title", sec), bo = $("#bd-body", sec), hint = $("#bd-form-hint", sec), gob = $("#bd-go", sec);
    var bs = $("#bd-boardsel", sec);
    S.editing = edit || null;
    show("write");
    if (edit) {
      ti.value = edit.title;
      bo.value = edit.body;
      fillBoards(bs, edit.board);
      gob.textContent = t("bd.saveEdit", "고친 내용 올리기");
      $("#bd-form-h", sec).textContent = t("bd.editH", "글 고치기");
      $("#bd-cancel", sec).textContent = t("bd.closeEdit", "고치지 않고 닫기");
    } else {
      gob.textContent = t("bd.post", "올리기");
      $("#bd-cancel", sec).textContent = t("bd.cancelWrite", "쓰기 그만두기");
      $("#bd-form-h", sec).textContent = t("bd.newH", "새 글 쓰기");
      var d = lsGet(DKEY);
      var pick = board || (d && d.board) || (S.board !== "all" && S.board !== "letters" ? S.board : "free");
      fillBoards(bs, pick);
      if (d && (d.title || d.body) && !ti.value && !bo.value) {
        ti.value = d.title || "";
        bo.value = d.body || "";
        say($("#bd-msg", sec), t("bd.draftBack", "쓰시던 글을 불러왔습니다."), "ok");
      }
    }
    var trusted = S.me && (S.me.level === "member" || S.me.admin);
    hint.textContent =
        edit && edit.status === "rejected" ? (trusted ? t("bd.hintEditRejected", "운영자가 내린 글입니다. 고쳐도 다시 올라가지 않습니다.")
                                                      : t("bd.hintEditSprout", "고친 글은 운영자가 다시 확인한 뒤 올라갑니다."))
      : edit && edit.status === "pending" ? t("bd.hintEditPending", "확인을 기다리는 글입니다. 고쳐도 그대로 확인을 기다립니다.")
      : trusted ? t("bd.hintMember", "올리면 바로 사랑방에 보입니다.")
      : edit ? t("bd.hintEditSprout", "고친 글은 운영자가 다시 확인한 뒤 올라갑니다.")
             : t("bd.hintSprout", "새싹 회원의 글은 운영자가 확인한 뒤 올라갑니다. 보통 하루 안에 올라갑니다.");
    counter();
    toTop();
    setTimeout(function () { (ti.value ? bo : ti).focus(); }, 250);
  }
  function closeForm() {
    if (S.editing && sec) { $("#bd-title", sec).value = ""; $("#bd-body", sec).value = ""; }
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

  function handleWriteFail(res, node) {
    var r = res && res.reason;
    say(node, why(r), "bad");
    if (r === "not_logged_in" || r === "expired") { S.me = null; renderWho(); openSheet("start", null, why(r)); }
    else if (r === "not_member") openSheet("join", null);
  }

  function onSubmit(e) {
    e.preventDefault();
    var ti = $("#bd-title", sec), bo = $("#bd-body", sec), gob = $("#bd-go", sec), msg = $("#bd-msg", sec);
    var bsel = $("#bd-boardsel", sec);
    var title = ti.value.trim(), body = bo.value.trim(), board = bsel.value;
    if (title.length < 2) { say(msg, why("title_empty"), "bad"); ti.focus(); return; }
    if (body.length < 2) { say(msg, why("empty"), "bad"); bo.focus(); return; }
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
      renderStat();
      loadMe().then(renderWho);
      if (res.status === "approved") {
        S.flash = editing ? t("bd.editOk", "고친 내용을 올렸습니다.") : t("bd.postOk", "올렸습니다. 사랑방에 바로 보입니다.");
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
                          : t("bd.postWait", "글을 받았습니다. 운영자가 확인한 뒤 올라갑니다. '확인을 기다리는 내 글'에서 볼 수 있어요.");
        S.showMine = true;
      }
      go("#b=" + board);
    });
  }

  function onCancel() {
    if (S.editing) {
      var changed = $("#bd-title", sec).value !== S.editing.title || $("#bd-body", sec).value !== S.editing.body;
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
    var ti = sec && $("#bd-title", sec), bo = sec && $("#bd-body", sec);
    if (ti) ti.value = "";
    if (bo) bo.value = "";
    if (S.view === "write") go("#b=" + S.board);
  }

  /* ---------- 회원 창(로그인·가입·내 정보) ---------- */
  var sheet = null, opener = null;

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
      var f = Array.prototype.filter.call(box.querySelectorAll("button, input, textarea, a[href]"), function (n) {
        return !n.disabled && n.offsetParent !== null;
      });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    document.body.appendChild(sheet);
    /* Esc 는 문서 전체에서 받는다 — 창 안의 단추가 처리 중 잠기면 초점이 창 밖(body)으로 빠져
       창에 단 듣개로는 Esc 가 닿지 않았다(화면 검사기가 잡음) */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet();
    });
    return sheet;
  }

  function closeSheet() {
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.documentElement.classList.remove("bd-lock");
    if (opener && opener.focus) { try { opener.focus(); } catch (e) {} }
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

  function openSheet(view, from, note) {
    if ((view || "start") === "start" && S.settings && !S.settings.ok) {
      S.settings = null;
      S.settingsP = Auth.settings().then(function (st) { S.settings = st; return st; });
    }
    if ((view || "start") === "start" && !S.settings && S.settingsP) {
      S.settingsP.then(function (st) { S.settings = st; openSheet(view, from, note); });
      return;
    }
    ensureSheet();
    if (from) opener = from;
    var h = sheet.querySelector(".bd-sheet-h"), body = sheet.querySelector(".bd-sheet-body");
    body.textContent = "";
    var builder = VIEWS[view] || VIEWS.start;
    builder(h, body, note);
    sheet.hidden = false;
    document.documentElement.classList.add("bd-lock");
    setTimeout(function () {
      var first = body.querySelector("input:not([type=checkbox]), .bd-kakao, button");
      (first || sheet.querySelector(".bd-x")).focus();
    }, 30);
  }

  /* 로그인 뒤 이어서 할 일 — 글쓰기를 누르고 로그인하러 갔던 사람을 다시 글쓰기로 */
  function continueNext() {
    var n = lsGet(NKEY);
    if (!n) return;
    if (!S.me) return;
    if (!S.me.joined) { openSheet("join", null); return; }
    lsDel(NKEY);
    closeSheet();
    if (n.what === "write") go("#write" + (n.board ? "=" + n.board : ""));
    if (n.what === "open" && n.id) go("#p" + n.id);
  }

  function afterLogin(note) {
    return loadMe().then(function () {
      renderWho();
      renderMenu();
      route();
      if (!S.me) { openSheet("start", null, why("auth_fail")); return; }
      if (!S.me.joined) { openSheet("join", null, note); return; }
      closeSheet();
      say($("#bd-msg", sec), note || (S.me.nickname + t("bd.welcome", " 님, 어서 오세요.")), "ok");
      continueNext();
    });
  }

  var VIEWS = {
    start: function (h, body, note) {
      h.textContent = t("bd.sheetH", "사랑방 회원");
      body.appendChild(el("p", "bd-sheet-lede", note || t("bd.sheetLede", "회원이 되면 제목을 달아 길게 쓰고, 댓글로 이야기를 나눌 수 있습니다.")));
      var st = S.settings || { ok: false };
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
      body.appendChild(pre);
      if (st.kakao) {
        var k = btn("bd-kakao", null);
        k.appendChild(kakaoMark());
        k.appendChild(el("span", null, t("bd.kakao", "카카오로 시작하기")));
        k.addEventListener("click", function () {
          k.disabled = true;
          draftSave();
          Auth.kakao().then(function (r) { if (!r.ok) { k.disabled = false; say(m0, why(r.reason), "bad"); } });
        });
        body.appendChild(k);
        var m0 = msgNode();
        body.appendChild(m0);
      }
      if (!st.email) {
        if (!st.kakao) body.appendChild(el("p", "form-hint", t("bd.noAuth", "지금은 회원 가입을 받지 않습니다.")));
        return;
      }
      if (st.kakao) body.appendChild(el("p", "bd-or", t("bd.or", "또는 이메일로")));

      var tabs = el("div", "bd-tabs");
      tabs.setAttribute("role", "group");
      var tIn = btn("bd-tab", t("bd.tabIn", "로그인"));
      var tUp = btn("bd-tab", t("bd.tabUp", "처음 가입"));
      tabs.appendChild(tIn);
      if (st.signup) tabs.appendChild(tUp);
      body.appendChild(tabs);
      var pane = el("div", "bd-pane");
      body.appendChild(pane);

      function showIn() {
        tIn.setAttribute("aria-pressed", "true"); tUp.setAttribute("aria-pressed", "false");
        pane.textContent = "";
        var f = el("form", "bd-aform");
        f.appendChild(field("bd-ie", t("bd.email", "이메일"), "email", { autocomplete: "username", required: "", inputmode: "email" }));
        f.appendChild(field("bd-ip", t("bd.pw", "비밀번호"), "password", { autocomplete: "current-password", required: "" }));
        var go = btn("btn btn--gold bd-wide", t("bd.doLogin", "로그인"), "submit");
        f.appendChild(go);
        var m = msgNode();
        f.appendChild(m);
        var fg = btn("bd-link", t("bd.forgot", "비밀번호를 잊으셨나요?"));
        fg.addEventListener("click", function () { openSheet("recover", null); });
        f.appendChild(fg);
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var em = $("#bd-ie", f).value.trim(), pw = $("#bd-ip", f).value;
          if (!em || !pw) { say(m, why("bad_login"), "bad"); return; }
          go.disabled = true;
          say(m, t("bd.wait", "잠시만요…"));
          Auth.signIn(em, pw).then(function (r) {
            go.disabled = false;
            $("#bd-ip", f).value = "";   /* 비밀번호는 입력칸에도 남기지 않는다 */
            if (!r.ok) { say(m, why(r.reason), "bad"); return; }
            afterLogin();
          });
        });
        pane.appendChild(f);
      }
      function showUp() {
        tUp.setAttribute("aria-pressed", "true"); tIn.setAttribute("aria-pressed", "false");
        pane.textContent = "";
        var f = el("form", "bd-aform");
        f.appendChild(field("bd-ue", t("bd.email", "이메일"), "email", { autocomplete: "email", required: "", inputmode: "email" }));
        f.appendChild(field("bd-up", t("bd.pwNew", "비밀번호 (8자 이상)"), "password", { autocomplete: "new-password", required: "", minlength: "8" }));
        f.appendChild(field("bd-up2", t("bd.pw2", "비밀번호 한 번 더"), "password", { autocomplete: "new-password", required: "", minlength: "8" }));
        f.appendChild(el("p", "form-hint", t("bd.upHint", "가입 확인 메일이 갑니다. 메일의 링크를 누르면 이 화면으로 돌아와 가입이 이어집니다.")));
        var go = btn("btn btn--gold bd-wide", t("bd.doUp", "가입하기"), "submit");
        f.appendChild(go);
        var m = msgNode();
        f.appendChild(m);
        f.addEventListener("submit", function (e) {
          e.preventDefault();
          var em = $("#bd-ue", f).value.trim(), p1 = $("#bd-up", f).value, p2 = $("#bd-up2", f).value;
          if (p1.length < 8) { say(m, why("weak_pw"), "bad"); return; }
          if (p1 !== p2) { say(m, why("pw_mismatch"), "bad"); return; }
          go.disabled = true;
          say(m, t("bd.wait", "잠시만요…"));
          draftSave();
          Auth.signUp(em, p1).then(function (r) {
            go.disabled = false;
            $("#bd-up", f).value = ""; $("#bd-up2", f).value = "";
            if (!r.ok) { say(m, why(r.reason), "bad"); return; }
            if (r.session) { afterLogin(); return; }
            openSheet("sent", null, t("bd.sentUp2", "확인 메일을 보냈습니다. 메일함(스팸함도)을 열어 링크를 눌러 주세요. 이미 가입하신 주소라면 메일이 가지 않으니, 로그인하시거나 비밀번호 찾기를 눌러 주세요."));
          });
        });
        pane.appendChild(f);
      }
      tIn.addEventListener("click", showIn);
      tUp.addEventListener("click", showUp);
      showIn();
    },

    recover: function (h, body, note) {
      h.textContent = t("bd.recoverH", "비밀번호 다시 정하기");
      if (note) body.appendChild(el("p", "sb-msg is-bad bd-note-top", note));   /* 왜 이 창이 떴는지(만료·다른 브라우저) */
      body.appendChild(el("p", "bd-sheet-lede", t("bd.recoverLede", "가입한 이메일을 적어 주세요. 비밀번호를 새로 정하는 링크를 보내 드립니다.")));
      var f = el("form", "bd-aform");
      f.appendChild(field("bd-re", t("bd.email", "이메일"), "email", { autocomplete: "email", required: "", inputmode: "email" }));
      var go = btn("btn btn--gold bd-wide", t("bd.send", "보내기"), "submit");
      f.appendChild(go);
      var m = msgNode();
      f.appendChild(m);
      var back = btn("bd-link", t("bd.back", "← 로그인으로"));
      back.addEventListener("click", function () { openSheet("start", null); });
      f.appendChild(back);
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var em = $("#bd-re", f).value.trim();
        if (!em) { say(m, why("bad_email"), "bad"); return; }
        go.disabled = true;
        Auth.recover(em).then(function (r) {
          go.disabled = false;
          if (!r.ok) { say(m, why(r.reason), "bad"); return; }
          openSheet("sent", null, t("bd.sentRe2", "그 주소로 가입된 계정이 있으면 메일이 갑니다. 메일의 링크를 눌러 새 비밀번호를 정해 주세요."));
        });
      });
      body.appendChild(f);
    },

    sent: function (h, body, note) {
      h.textContent = t("bd.sentH", "메일을 확인해 주세요");
      body.appendChild(el("p", "bd-sheet-lede", note || ""));
      /* 메일이 오지 않을 때 갈 길 — 이미 가입한 주소, 스팸함, 다른 방법 */
      var row = el("div", "bd-me-acts");
      var li = btn("btn btn--ghost btn--sm", t("bd.toLogin", "로그인하기"));
      li.addEventListener("click", function () { openSheet("start", null); });
      var fg = btn("btn btn--ghost btn--sm", t("bd.forgotShort", "비밀번호 찾기"));
      fg.addEventListener("click", function () { openSheet("recover", null); });
      row.appendChild(li); row.appendChild(fg);
      body.appendChild(row);
      var ok = btn("bd-link", t("bd.close", "닫기"));
      ok.addEventListener("click", closeSheet);
      body.appendChild(ok);
    },

    newpw: function (h, body) {
      h.textContent = t("bd.newpwH", "새 비밀번호 정하기");
      var f = el("form", "bd-aform");
      f.appendChild(field("bd-np", t("bd.pwNew", "비밀번호 (8자 이상)"), "password", { autocomplete: "new-password", required: "", minlength: "8" }));
      f.appendChild(field("bd-np2", t("bd.pw2", "비밀번호 한 번 더"), "password", { autocomplete: "new-password", required: "", minlength: "8" }));
      var go = btn("btn btn--gold bd-wide", t("bd.savePw", "저장"), "submit");
      f.appendChild(go);
      var m = msgNode();
      f.appendChild(m);
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var p1 = $("#bd-np", f).value, p2 = $("#bd-np2", f).value;
        if (p1.length < 8) { say(m, why("weak_pw"), "bad"); return; }
        if (p1 !== p2) { say(m, why("pw_mismatch"), "bad"); return; }
        go.disabled = true;
        Auth.setPassword(p1).then(function (r) {
          go.disabled = false;
          $("#bd-np", f).value = ""; $("#bd-np2", f).value = "";
          if (!r.ok) { say(m, why(r.reason), "bad"); return; }
          afterLogin(t("bd.pwSaved", "새 비밀번호를 저장했습니다."));
        });
      });
      body.appendChild(f);
    },

    join: function (h, body, note) {
      h.textContent = t("bd.joinH", "가입 마치기");
      body.appendChild(el("p", "bd-sheet-lede", note || t("bd.joinLede", "사랑방에서 쓸 별명을 정해 주세요. 다른 분들께는 별명과 등급만 보입니다.")));
      var f = el("form", "bd-aform");
      f.appendChild(field("bd-jn", t("bd.nick", "별명"), "text", { maxlength: "12", required: "", autocomplete: "nickname" }));
      f.appendChild(el("p", "form-hint", t("bd.nickHint", "2~12자 · 한글·영문·숫자. '인순이'·'운영자'처럼 오해를 부르는 이름은 쓸 수 없습니다.")));
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
      var need = (S.me && S.me.need_posts) || 3, needc = (S.me && S.me.need_comments) || 5;
      f.appendChild(el("p", "form-hint bd-lvinfo",
        t("bd.lvInfo1", "새싹으로 시작합니다. 운영자가 올린 글 ") + need + t("bd.lvInfo2", "개와 댓글 ") + needc +
        t("bd.lvInfo3", "개가 모이면 정회원이 되어, 글과 댓글이 바로 올라갑니다.")));
      var go = btn("btn btn--gold bd-wide", t("bd.doJoin", "가입 마치기"), "submit");
      f.appendChild(go);
      var m = msgNode();
      f.appendChild(m);
      var out = btn("bd-link", t("bd.logout", "로그아웃"));
      out.addEventListener("click", function () { Auth.signOut().then(function () { forgetDevice(); S.me = null; renderWho(); closeSheet(); loadList(false); }); });
      f.appendChild(out);
      /* 이메일 가입은 메일 확인에서 계정이 먼저 생긴다. 별명·동의 전에 그만두고 싶은 사람이 계정을 지울 길 */
      var quit = btn("bd-link bd-leave", t("bd.quitJoin", "가입 그만두고 계정 지우기"));
      quit.addEventListener("click", function () {
        if (!window.confirm(t("bd.quitQ", "가입을 그만두고 이 계정을 지울까요?"))) return;
        quit.disabled = true;
        rpc("member_leave", {}, true).then(function (r) {
          quit.disabled = false;
          if (r && r.ok) {
            clearS(); forgetDevice(); S.me = null; renderWho(); closeSheet();
            say($("#bd-msg", sec), t("bd.quitDone", "가입을 그만두고 계정을 지웠습니다."), "ok");
          } else say(m, why(r && r.reason), "bad");
        });
      });
      f.appendChild(quit);
      body.appendChild(f);
      if (S.me && S.me.suggest) $("#bd-jn", f).value = S.me.suggest;
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!c1.checked) { say(m, why("need_agree"), "bad"); c1.focus(); return; }
        if (!c2.checked) { say(m, why("need_age"), "bad"); c2.focus(); return; }
        go.disabled = true;
        rpc("member_join", { p_nickname: $("#bd-jn", f).value, p_agree: true, p_age14: true }, true).then(function (r) {
          go.disabled = false;
          if (r && (r.ok || r.reason === "already")) { afterLogin(); return; }
          if (r && (r.reason === "not_logged_in" || r.reason === "expired")) { S.me = null; renderWho(); openSheet("start", null, why(r.reason)); return; }
          say(m, why(r && r.reason), "bad");
        });
      });
    },

    me: function (h, body) {
      var me = S.me || {};
      h.textContent = t("bd.meH", "내 정보");
      var top = el("p", "bd-me-top");
      top.appendChild(author(me.nickname, me.level, me.admin));
      body.appendChild(top);
      body.appendChild(el("p", "bd-sheet-lede",
        me.admin ? t("bd.noteStaff", "운영자로 들어와 있습니다. 글과 댓글이 바로 올라갑니다.")
        : me.level === "member" ? t("bd.noteMember", "정회원입니다. 글과 댓글이 바로 올라갑니다.")
        : me.level === "blocked" ? why("blocked")
        : t("bd.meSprout", "새싹 회원입니다. ") + progressText(me)));
      if (me.admin) {
        var adm = el("a", "btn btn--ghost btn--sm bd-wide", t("bd.toAdmin", "운영 화면 열기"));
        adm.href = "admin.html";
        body.appendChild(adm);
      }
      var f = el("form", "bd-aform");
      f.appendChild(field("bd-mn", t("bd.rename", "별명 바꾸기"), "text", { maxlength: "12", required: "" }));
      var go = btn("btn btn--ghost btn--sm", t("bd.saveNick", "별명 저장"), "submit");
      f.appendChild(go);
      var m = msgNode();
      f.appendChild(m);
      $("#bd-mn", f).value = me.nickname || "";
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        go.disabled = true;
        rpc("member_rename", { p_nickname: $("#bd-mn", f).value }, true).then(function (r) {
          go.disabled = false;
          if (r && r.ok) { say(m, t("bd.nickOk", "별명을 바꿨습니다."), "ok"); loadMe().then(function () { renderWho(); loadList(false); }); }
          else say(m, why(r && r.reason), "bad");
        });
      });
      body.appendChild(f);
      var row = el("div", "bd-me-acts");
      var out = btn("btn btn--ghost btn--sm", t("bd.logout", "로그아웃"));
      out.addEventListener("click", function () {
        Auth.signOut().then(function () {
          forgetDevice();
          S.me = null; renderWho(); closeSheet(); loadList(false); loadMine();
          say($("#bd-msg", sec), t("bd.loggedOut", "로그아웃했습니다."), "ok");
        });
      });
      row.appendChild(out);
      if (!me.admin) {
        var leave = btn("bd-link bd-leave", t("bd.leave", "탈퇴하기"));
        leave.addEventListener("click", function () {
          if (!window.confirm(t("bd.leaveQ1", "탈퇴하면 쓰신 글과 댓글이 모두 지워지고 되돌릴 수 없습니다. 탈퇴할까요?"))) return;
          if (!window.confirm(t("bd.leaveQ2", "정말 탈퇴할까요? 이 확인이 마지막입니다."))) return;
          leave.disabled = true;
          rpc("member_leave", {}, true).then(function (r) {
            leave.disabled = false;
            if (r && r.ok) {
              clearS(); forgetDevice(); S.me = null;
              renderWho(); closeSheet(); loadList(false); loadMine();
              say($("#bd-msg", sec), r.partial
                ? t("bd.leftPartial", "글·댓글·회원 정보를 지웠습니다. 로그인 계정 삭제는 운영자에게 요청해 주세요.")
                : t("bd.left", "탈퇴했습니다. 쓰신 글과 댓글도 모두 지웠습니다."), "ok");
            } else say(m, why(r && r.reason), "bad");
          });
        });
        row.appendChild(leave);
      }
      body.appendChild(row);
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

  /* ---------- 시작 ---------- */
  var bound = false;
  function initBoard() {
    var s = document.getElementById("board");
    if (s !== sec) closeSheet();
    if (!s) return;
    if (s.__bd) return;          /* 같은 <main> 에 두 번 걸지 않는다 */
    s.__bd = true;
    sec = s;
    /* config.js 의 스위치. 꺼져 있으면 카페 틀과 '인순이의 편지'만 열고 서버에는 묻지 않는다 */
    S.open = !!(cfg() && (window.INSOONI_CONFIG || {}).board);
    S.ready = true;
    S.board = "all"; S.rows = []; S.view = "list";

    $("#bd-write-btn", sec).addEventListener("click", onWrite);
    $("#bd-form", sec).addEventListener("submit", onSubmit);
    $("#bd-cancel", sec).addEventListener("click", onCancel);
    $("#bd-more", sec).addEventListener("click", function () { loadList(true); });
    var dt = null;
    ["#bd-title", "#bd-body"].forEach(function (q) {
      $(q, sec).addEventListener("input", function () {
        counter();
        clearTimeout(dt);
        dt = setTimeout(draftSave, 400);
      });
    });
    $("#bd-boardsel", sec).addEventListener("change", draftSave);
    if (!bound) {
      bound = true;
      /* 창을 닫거나 다른 데로 가도 쓰던 글을 지킨다 */
      window.addEventListener("pagehide", draftSave);
      window.addEventListener("hashchange", function () { if (sec && document.body.contains(sec)) route(); });
    }

    if (!S.open) { renderWho(); renderStat(); route(); return; }
    S.settingsP = Auth.settings().then(function (st) { S.settings = st; return st; });
    Auth.callback().then(function (cb) {
      return loadMe().then(function () {
        renderWho();
        renderStat();
        route();
        if (!cb || !live()) return;
        if (cb.kind === "error" && cb.reason === "link_expired") {
          if (cb.purpose === "recover") openSheet("recover", null, t("bd.linkOldRe", "링크가 만료됐거나 이미 쓰였습니다. 비밀번호 메일을 다시 받아 주세요."));
          else openSheet("start", null, t("bd.linkOldUp", "링크가 만료됐거나 이미 쓰였습니다. 가입 확인 전이라면 '처음 가입'을 같은 이메일로 다시 누르면 확인 메일이 다시 갑니다."));
        } else if (cb.kind === "error") {
          openSheet("start", null, why(cb.reason));
        } else if (cb.kind === "noverifier" && cb.purpose === "recover") {
          /* 비밀번호를 잊은 사람에게 '로그인하세요'라고 하면 막다른 길이다 */
          openSheet("recover", null, t("bd.otherBrowserRe", "이 링크는 비밀번호 메일을 요청한 브라우저에서 열어야 이어집니다. 메일 앱 안에서 열렸다면 여기서 다시 요청해 주세요."));
        } else if (cb.kind === "noverifier") {
          openSheet("start", null, t("bd.confirmedElse", "메일 확인이 끝났습니다. 이메일과 비밀번호로 로그인해 주세요."));
        } else if (cb.purpose === "recover") {
          openSheet("newpw", null);
        } else {
          afterLogin();
        }
      });
    });
  }

  /* 카카오로 갔다가 뒤로 가기로 돌아오면(페이지가 캐시에서 되살아나면) 단추가 잠긴 채 남는다 */
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted || !sheet) return;
    Array.prototype.forEach.call(sheet.querySelectorAll(".bd-kakao"), function (b) { b.disabled = false; });
  });

  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(initBoard);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initBoard);
  else initBoard();

  /* 시험용 창구 — 화면 검사기가 상태를 들여다볼 수 있게(권한과 무관한 읽기 전용) */
  window.INSOONI_BOARD = { state: function () { return { me: S.me, rows: S.rows.length, ready: S.ready, open: S.open, view: S.view, board: S.board }; } };
})();
