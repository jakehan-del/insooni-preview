/* ============================================================
   INSOONI · 사랑방 운영 화면 (admin.html)
   ------------------------------------------------------------
   매니저 요청(2026-10-01) — 형님 말고도 검수·내리기를 할 수 있게.

   문은 서버에 있다(supabase/008).
     · 로그인은 Supabase 인증(이메일 + 비밀번호)이 맡는다.
     · 로그인한 사람이 운영자 명단(admins)에 없으면 서버 함수가 forbidden 만 준다.
     · 이 화면은 그 결과를 보여 줄 뿐이다. 화면을 고쳐도 권한은 생기지 않는다.

   지킨 것
     1) 팬이 쓴 글은 신뢰할 수 없는 입력이다. 절대 innerHTML 로 넣지 않는다.
     2) 비밀번호는 어디에도 저장하지 않는다. 로그인 직후 입력칸도 비운다.
        세션 토큰은 sessionStorage — 탭을 닫으면 사라진다.
     3) 지우기 기능은 없다. '내리기'는 status 를 rejected 로 바꿀 뿐이다.
     4) 실패를 성공처럼 보이지 않는다. 서버가 거절하면 그 이유를 말한다.
   ============================================================ */
(function () {
  "use strict";
  var SKEY = "insooni_admin_session";
  var TIMEOUT = 15000;

  function $(s) { return document.querySelector(s); }
  function $all(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  function cfg() {
    var c = window.INSOONI_CONFIG || {};
    var url = (c.url || "").replace(/\/+$/, "");
    var key = c.anonKey || "";
    if (!url || !key || url.indexOf("YOUR-") >= 0 || url.indexOf("여기에") >= 0) return null;
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

  /* ---------- 세션 ---------- */
  function getS() { try { return JSON.parse(sessionStorage.getItem(SKEY) || "null"); } catch (e) { return null; } }
  function setS(s) { try { sessionStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {} }
  function clearS() { try { sessionStorage.removeItem(SKEY); } catch (e) {} }
  function pack(b) {
    return {
      at: b.access_token,
      rt: b.refresh_token,
      exp: b.expires_at ? b.expires_at * 1000 : Date.now() + (b.expires_in || 3600) * 1000,
      email: (b.user && b.user.email) || ""
    };
  }

  function auth(path, body, bearer) {
    var c = cfg();
    if (!c) return Promise.resolve({ ok: false, reason: "not_configured" });
    var h = { "apikey": c.key, "Content-Type": "application/json" };
    if (bearer) h.Authorization = "Bearer " + bearer;
    return timed(fetch(c.url + "/auth/v1/" + path, { method: "POST", headers: h, body: JSON.stringify(body || {}) })
      .then(function (r) {
        return r.json().then(function (j) { return j; }, function () { return {}; })
          .then(function (j) { return { ok: r.ok, status: r.status, body: j || {} }; });
      }));
  }

  function signIn(email, pw) {
    return auth("token?grant_type=password", { email: email, password: pw }).then(function (r) {
      if (r.ok && r.body.access_token) { setS(pack(r.body)); return { ok: true }; }
      if (r.status === 400 || r.status === 401) return { ok: false, reason: "credentials" };
      if (r.status === 429) return { ok: false, reason: "too_many" };
      return { ok: false, reason: r.reason || "server", status: r.status };
    });
  }

  /* 토큰은 한 시간이면 끝난다. 검수하다 멈추지 않게 끝나기 1분 전에 갈아 끼운다. */
  function fresh() {
    var s = getS();
    if (!s || !s.at) return Promise.resolve(null);
    if (s.exp - Date.now() > 60000) return Promise.resolve(s);
    if (!s.rt) return Promise.resolve(null);
    return auth("token?grant_type=refresh_token", { refresh_token: s.rt }).then(function (r) {
      if (r.ok && r.body.access_token) { var n = pack(r.body); if (!n.email) n.email = s.email; setS(n); return n; }
      return null;
    });
  }

  function rpc(name, args) {
    return fresh().then(function (s) {
      if (!s) return { ok: false, reason: "expired" };
      var c = cfg();
      if (!c) return { ok: false, reason: "not_configured" };
      return timed(fetch(c.url + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: { "apikey": c.key, "Authorization": "Bearer " + s.at, "Content-Type": "application/json" },
        body: JSON.stringify(args || {})
      }).then(function (r) {
        if (r.status === 401) return { ok: false, reason: "expired" };
        /* 함수가 없다 = 서버에 008 이 아직 실행되지 않았다 */
        if (r.status === 404) return { ok: false, reason: "not_ready" };
        if (!r.ok) return { ok: false, reason: "server", status: r.status };
        return r.json().then(function (j) {
          if (Array.isArray(j)) j = j.length === 1 ? j[0] : null;
          return (j && typeof j === "object") ? j : { ok: false, reason: "empty" };
        }, function () { return { ok: false, reason: "parse" }; });
      }));
    });
  }

  /* ---------- 말 ---------- */
  var WHY = {
    not_configured: "사이트 설정에 서버 주소가 없습니다.",
    not_ready: "서버 쪽 준비(008·010)가 아직 실행되지 않았습니다. 관리자에게 알려 주세요.",
    staff: "운영자 계정의 등급은 여기서 바꾸지 않습니다.",
    changed: "그사이 쓴 사람이 글을 고쳤습니다. 고친 내용을 다시 띄웠으니 확인한 뒤 올려 주세요.",
    bad_level: "알 수 없는 등급입니다.",
    credentials: "이메일이나 비밀번호가 맞지 않습니다.",
    too_many: "로그인 시도가 너무 많습니다. 잠시 뒤 다시 해 주세요.",
    expired: "로그인이 끝났습니다. 다시 로그인해 주세요.",
    forbidden: "이 계정은 운영자로 등록되어 있지 않습니다. 등록을 요청해 주세요.",
    not_found: "이미 처리됐거나 팬이 스스로 지운 글입니다.",
    network: "인터넷 연결을 확인해 주세요.",
    timeout: "서버가 응답하지 않습니다. 잠시 뒤 다시 해 주세요."
  };
  function why(res) {
    var r = res && res.reason;
    return WHY[r] || ("처리하지 못했습니다" + (res && res.status ? " (" + res.status + ")" : "") + ".");
  }
  function say(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "msg" + (kind ? " " + kind : "");
  }
  var toastTm = null;
  function toast(text) {
    var el = $("#adm-toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("on");
    clearTimeout(toastTm);
    toastTm = setTimeout(function () { el.classList.remove("on"); }, 1800);
  }

  var KIND = { note: "한 줄", dream: "꿈", letter: "편지", post: "옛 글", bpost: "게시판 글", comment: "댓글" };
  var LEVEL = { sprout: "새싹", member: "정회원", blocked: "쉬는 중" };
  /* AI 검수 도우미는 옛 네 표(한 줄·꿈·편지·옛 글)만 읽는다. 게시판 글·댓글에 '아직 읽지 않음'을
     띄우면 영원히 읽지 않을 것을 기다리는 것처럼 보인다 — 그 줄을 아예 그리지 않는다. */
  var AI_KINDS = { note: 1, dream: 1, letter: 1, post: 1 };
  var AI = {
    ok: ["괜찮아 보임", "ok"],
    review: ["사람이 봐야 함", "review"],
    spam: ["스팸 의심", "spam"]
  };
  /* 운영 화면은 한국 시간으로 본다 — 서버 시각은 UTC 다 */
  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric",
                                         hour: "2-digit", minute: "2-digit" });
    } catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
  }

  /* 상태마다 보일 단추 — [보이는 말, 바꿀 상태, 끝나고 띄울 말] */
  var ACTS = {
    pending:  [["올리기", "approved", "올렸습니다"], ["내리기", "rejected", "내렸습니다"]],
    approved: [["내리기", "rejected", "내렸습니다"]],
    rejected: [["다시 올리기", "approved", "다시 올렸습니다"], ["대기로", "pending", "대기로 돌렸습니다"]]
  };

  /* ---------- 화면 ---------- */
  var view = "pending";
  var counts = { pending: 0, approved: 0, rejected: 0 };

  function show(which) {
    $("#adm-login").hidden = which !== "login";
    $("#adm-app").hidden = which !== "app";
  }
  function paintCounts() {
    $all("[data-n]").forEach(function (el) {
      var n = counts[el.getAttribute("data-n")];
      el.textContent = typeof n === "number" ? String(n) : "";
    });
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;          /* 언제나 textContent */
    return e;
  }

  function item(row) {
    var li = el("li", "adm-item");
    var meta = el("div", "adm-meta");
    meta.appendChild(el("span", "adm-kind", KIND[row.kind] || row.kind));
    meta.appendChild(el("span", "adm-name", row.name ? row.name : "이름 없음"));
    var t = el("time", "", when(row.created_at));
    if (row.created_at) t.setAttribute("datetime", row.created_at);
    meta.appendChild(t);
    if (row.preset != null) meta.appendChild(el("span", "adm-tag", "· 사이트 문구(칩)"));
    if (row.song_title) meta.appendChild(el("span", "adm-tag", "· 곡: " + row.song_title));
    if (row.level) meta.appendChild(el("span", "adm-tag", "· " + (LEVEL[row.level] || row.level)));
    if (row.kind === "comment" && row.title) meta.appendChild(el("span", "adm-tag", "· 달린 글: 「" + row.title + "」"));
    li.appendChild(meta);

    if (row.kind === "bpost" && row.title) li.appendChild(el("p", "adm-title", row.title));
    li.appendChild(el("p", "adm-text", row.content || ""));

    if (AI_KINDS[row.kind]) {
      var v = AI[row.ai_verdict];
      var ai = el("p", "adm-ai adm-ai--" + (v ? v[1] : "none"),
                  v ? ("AI 소견 · " + v[0] + (row.ai_reason ? " — " + row.ai_reason : ""))
                    : "AI 소견 · 아직 읽지 않음");
      li.appendChild(ai);
    }

    var acts = el("div", "adm-acts");
    (ACTS[row.status] || []).forEach(function (a, i) {
      var b = el("button", "btn btn--sm" + (i === 0 ? "" : " btn--ghost"), a[0]);
      b.type = "button";
      b.addEventListener("click", function () { act(row, a[1], a[2], li); });
      acts.appendChild(b);
    });
    li.appendChild(acts);
    return li;
  }

  function act(row, to, done, li) {
    var btns = li.querySelectorAll("button");
    Array.prototype.forEach.call(btns, function (b) { b.disabled = true; });
    /* 게시판 글은 화면에서 본 판(ver)을 함께 보낸다. 그사이 고쳐졌으면 서버가 'changed' 로 거절한다 */
    var args = { p_kind: row.kind, p_id: row.id, p_status: to };
    if (row.ver) args.p_ver = row.ver;
    rpc("admin_set_status", args).then(function (res) {
      if (res && res.ok) {
        li.parentNode && li.parentNode.removeChild(li);
        counts[view] = Math.max(0, (counts[view] || 0) - 1);
        counts[to] = (counts[to] || 0) + 1;
        paintCounts();
        toast(res.levelup ? done + " · " + (row.name || "") + " 님이 정회원이 되었습니다" : done);
        if (!$("#adm-list").children.length) emptyState();
        return;
      }
      Array.prototype.forEach.call(btns, function (b) { b.disabled = false; });
      if (res && res.reason === "changed") { load(WHY.changed); return; }   /* 다시 불러온 뒤에 띄운다 — 먼저 띄우면 불러오기가 지운다 */
      if (res && res.reason === "not_found") {
        /* 그사이 팬이 지웠다 — 목록에서 걷는다 */
        li.parentNode && li.parentNode.removeChild(li);
        counts[view] = Math.max(0, (counts[view] || 0) - 1);
        paintCounts();
      }
      gate(res) || say($("#adm-msg"), why(res), "bad");
    });
  }

  function emptyState() {
    var msg = { pending: "검수를 기다리는 글이 없습니다.",
                approved: "올라간 글이 없습니다.",
                rejected: "내린 글이 없습니다." }[view];
    $("#adm-list").appendChild(el("li", "adm-empty", msg));
  }

  /* ---------- 회원 (010) ---------- */
  var MACTS = {
    sprout:  [["정회원으로", "member", "정회원으로 올렸습니다"], ["쉬게 하기", "blocked", "쉬게 했습니다"]],
    member:  [["새싹으로", "sprout", "새싹으로 내렸습니다"], ["쉬게 하기", "blocked", "쉬게 했습니다"]],
    blocked: [["새싹으로 풀기", "sprout", "새싹으로 풀었습니다"]]
  };
  function memberItem(m, need) {
    var li = el("li", "adm-item");
    var meta = el("div", "adm-meta");
    meta.appendChild(el("span", "adm-kind", m.staff ? "운영자" : (LEVEL[m.level] || m.level)));
    meta.appendChild(el("span", "adm-name", m.nickname));
    meta.appendChild(el("span", "adm-tag", (m.provider === "kakao" ? "카카오" : "이메일") + (m.email_masked ? " · " + m.email_masked : "")));
    var t = el("time", "", "가입 " + when(m.joined_at));
    meta.appendChild(t);
    li.appendChild(meta);
    var line = "올라간 글 " + m.posts_ok + " · 댓글 " + m.comments_ok + (m.waiting ? " · 확인 기다리는 것 " + m.waiting : "");
    if (m.level === "sprout" && !m.staff) {
      if (m.level_by === "admin") line += " · 운영자가 정한 새싹(자동 등업 안 함)";
      else line += " · 정회원까지 글 " + Math.max(0, need.p - m.posts_ok) + " · 댓글 " + Math.max(0, need.c - m.comments_ok);
    }
    li.appendChild(el("p", "adm-text", line));
    var acts = el("div", "adm-acts");
    if (!m.staff) {
      (MACTS[m.level] || []).forEach(function (a, i) {
        var b = el("button", "btn btn--sm" + (i === 0 ? "" : " btn--ghost"), a[0]);
        b.type = "button";
        b.addEventListener("click", function () {
          if (a[1] === "blocked" && !window.confirm(m.nickname + " 님이 글·댓글을 쓰지 못하게 합니다. 계속할까요?")) return;
          if (a[1] === "sprout" && m.level === "member" && !window.confirm(m.nickname + " 님을 새싹으로 내립니다. 이 회원의 글은 다시 검수를 거치고, 자동 등업도 더는 걸리지 않습니다. 계속할까요?")) return;
          var bs = li.querySelectorAll("button");
          Array.prototype.forEach.call(bs, function (x) { x.disabled = true; });
          rpc("admin_set_level", { p_user: m.user_id, p_level: a[1] }).then(function (res) {
            if (res && res.ok) { toast(a[2]); loadMembers(); return; }
            Array.prototype.forEach.call(bs, function (x) { x.disabled = false; });
            gate(res) || say($("#adm-msg"), why(res), "bad");
          });
        });
        acts.appendChild(b);
      });
    }
    li.appendChild(acts);
    return li;
  }
  function loadMembers() {
    var list = $("#adm-list");
    say($("#adm-msg"), "불러오는 중…");
    rpc("admin_members", { p_q: ($("#adm-q").value || "").trim() || null, p_limit: 300 }).then(function (res) {
      if (!res || !res.ok) { gate(res) || say($("#adm-msg"), why(res), "bad"); return; }
      say($("#adm-msg"), "");
      var c = res.counts || {};
      counts.members = c.total;
      paintCounts();
      $("#adm-mnote").textContent = "새싹 " + (c.sprout || 0) + " · 정회원 " + (c.member || 0) + " · 쉬는 중 " + (c.blocked || 0) +
        ". 정회원 기준은 올라간 글 " + res.need_posts + "개 + 댓글 " + res.need_comments +
        "개입니다(Supabase 의 board_settings 표에서 바꿀 수 있습니다). 운영자가 한 번 등급을 정한 회원에게는 자동 등업이 다시 적용되지 않습니다.";
      list.textContent = "";
      var rows = Array.isArray(res.rows) ? res.rows : [];
      if (!rows.length) { list.appendChild(el("li", "adm-empty", "아직 회원이 없습니다.")); return; }
      rows.forEach(function (m) { list.appendChild(memberItem(m, { p: res.need_posts, c: res.need_comments })); });
    });
  }
  function refresh() {
    var mem = view === "members";
    $("#adm-search").hidden = !mem;
    $("#adm-mnote").hidden = !mem;
    $("#adm-note").hidden = mem;
    if (mem) loadMembers(); else load();
  }

  function load(note) {
    var list = $("#adm-list");
    say($("#adm-msg"), "불러오는 중…");
    rpc("admin_list", { p_status: view, p_limit: 200 }).then(function (res) {
      if (!res || !res.ok) { gate(res) || say($("#adm-msg"), why(res), "bad"); return; }
      say($("#adm-msg"), note || "", note ? "bad" : "");
      if (res.counts) { counts = res.counts; paintCounts(); }
      list.textContent = "";
      var rows = Array.isArray(res.rows) ? res.rows : [];
      if (!rows.length) { emptyState(); return; }
      rows.forEach(function (r) { list.appendChild(item(r)); });
    });
  }

  /* 세션이 끝났거나 권한이 없으면 로그인 화면으로 돌려보낸다. 처리했으면 true. */
  function gate(res) {
    var r = res && res.reason;
    if (r === "expired" || r === "forbidden") {
      clearS();
      show("login");
      say($("#adm-login-msg"), WHY[r], "bad");
      return true;
    }
    if (r === "not_ready" || r === "not_configured") {
      var sys = $("#adm-sys"); sys.hidden = false; sys.textContent = WHY[r];
      return true;
    }
    return false;
  }

  function enter() {
    return rpc("admin_whoami").then(function (w) {
      if (!w || !w.ok) { if (!gate(w)) { show("login"); say($("#adm-login-msg"), why(w), "bad"); } return; }
      if (!w.admin) { gate({ reason: "forbidden" }); return; }
      $("#adm-sys").hidden = true;
      $("#adm-who").textContent = (w.email || "") + " · 운영자";
      show("app");
      refresh();
    });
  }

  function signOut() {
    var s = getS();
    clearS();
    if (s && s.at) auth("logout", {}, s.at);     /* 서버 쪽 세션도 닫는다(실패해도 이쪽은 이미 닫혔다) */
    show("login");
    say($("#adm-login-msg"), "로그아웃했습니다.", "ok");
  }

  function boot() {
    if (!cfg()) {
      var sys = $("#adm-sys"); sys.hidden = false; sys.textContent = WHY.not_configured;
      return;
    }
    $("#adm-login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var em = $("#adm-email"), pw = $("#adm-pw"), btn = $("#adm-login-btn");
      var email = (em.value || "").trim(), pass = pw.value || "";
      if (!email || !pass) return;
      btn.disabled = true;
      say($("#adm-login-msg"), "확인하는 중…");
      signIn(email, pass).then(function (r) {
        pw.value = "";                 /* 비밀번호는 화면에도 남기지 않는다 */
        btn.disabled = false;
        if (!r.ok) { say($("#adm-login-msg"), why(r), "bad"); return; }
        say($("#adm-login-msg"), "");
        enter();
      });
    });
    $all(".adm-tab").forEach(function (b) {
      b.addEventListener("click", function () {
        view = b.getAttribute("data-status");
        $all(".adm-tab").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        refresh();
      });
    });
    $("#adm-reload").addEventListener("click", refresh);
    $("#adm-search").addEventListener("submit", function (e) { e.preventDefault(); loadMembers(); });
    $("#adm-out").addEventListener("click", signOut);

    if (getS()) enter(); else show("login");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
