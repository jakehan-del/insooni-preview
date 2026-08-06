/* ============================================================
   INSOONI OFFICIAL · 백엔드 어댑터
   ------------------------------------------------------------
   사랑방의 글·응원·신청곡·구독을 실제 서버(Supabase)에 보낸다.

   설계에서 지킨 두 가지
     1) 설정이 없으면 조용히 물러난다. isReady()가 false가 되고,
        화면은 지금까지의 '이 기기에만 저장' 동작을 그대로 쓴다.
        키를 넣지 않은 상태에서도 사이트는 완전히 정상이어야 한다.
     2) 절대 예외를 던지지 않는다. 실패는 {ok:false, reason:...}으로 돌려준다.
        네트워크가 끊긴 것과 서버가 거절한 것과 설정이 없는 것을 구분해 알린다.
        화면이 "성공한 척"할 여지를 남기지 않기 위해서다.

   서버 쪽 규칙은 supabase/001_init.sql 에 있다.
   쓰기는 함수(rpc)로만, 읽기는 뷰로만 열려 있다.
   ============================================================ */
(function () {
  "use strict";

  var TIMEOUT = 12000;

  function cfg() {
    var c = window.INSOONI_CONFIG || {};
    var url = (c.url || "").replace(/\/+$/, "");
    var key = c.anonKey || "";
    if (!url || !key) return null;
    /* 안내서의 예시 문구를 그대로 둔 경우도 '설정 안 됨'으로 본다 */
    if (url.indexOf("여기에") >= 0 || key.indexOf("여기에") >= 0) return null;
    if (url.indexOf("YOUR-") >= 0 || key.indexOf("YOUR-") >= 0) return null;
    return { url: url, key: key };
  }

  function isReady() {
    return cfg() !== null;
  }

  /* fetch에 시간 제한을 붙인다. 응답이 없는 채로 버튼이 멈춰 있으면
     사용자는 무슨 일이 일어났는지 알 수 없다. */
  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve({ ok: false, reason: "timeout" });
      }, ms);
      promise.then(function (v) {
        if (done) return;
        done = true; clearTimeout(timer); resolve(v);
      }, function () {
        if (done) return;
        done = true; clearTimeout(timer); resolve({ ok: false, reason: "network" });
      });
    });
  }

  function headers(c, extra) {
    var h = {
      "apikey": c.key,
      "Authorization": "Bearer " + c.key,
      "Content-Type": "application/json"
    };
    if (extra) { for (var k in extra) if (extra.hasOwnProperty(k)) h[k] = extra[k]; }
    return h;
  }

  /* ---------- 쓰기: 서버 함수 호출 ---------- */
  function rpc(name, body) {
    var c = cfg();
    if (!c) return Promise.resolve({ ok: false, reason: "not_configured" });
    var p = fetch(c.url + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: headers(c),
      body: JSON.stringify(body || {})
    }).then(function (r) {
      if (!r.ok) {
        /* 서버가 거절했다. 본문에 이유가 있을 수 있으니 읽어 본다. */
        return r.text().then(function (t) {
          return { ok: false, reason: "server", status: r.status, detail: (t || "").slice(0, 200) };
        }, function () {
          return { ok: false, reason: "server", status: r.status };
        });
      }
      return r.json().then(function (j) {
        /* 함수는 {ok:true|false, reason} 형태를 돌려준다.
           PostgREST가 설정에 따라 [{...}] 로 한 겹 싸서 줄 수 있으므로 벗겨 낸다.
           이걸 놓치면 성공했는데 실패로 읽어 "보내지 못했습니다"를 띄운다. */
        if (Array.isArray(j)) j = j.length === 1 ? j[0] : { ok: true };
        if (j && typeof j === "object" && typeof j.ok !== "undefined") return j;
        if (j && typeof j === "object") return { ok: true, raw: j };
        return { ok: true };
      }, function () { return { ok: true }; });
    });
    return withTimeout(p, TIMEOUT);
  }

  /* ---------- 읽기: 공개 뷰 ---------- */
  function readView(view, query) {
    var c = cfg();
    if (!c) return Promise.resolve({ ok: false, reason: "not_configured", rows: [] });
    var url = c.url + "/rest/v1/" + view + "?select=*" + (query ? "&" + query : "");
    var p = fetch(url, { method: "GET", headers: headers(c) })
      .then(function (r) {
        if (!r.ok) return { ok: false, reason: "server", status: r.status, rows: [] };
        return r.json().then(function (rows) {
          return { ok: true, rows: Array.isArray(rows) ? rows : [] };
        }, function () { return { ok: false, reason: "parse", rows: [] }; });
      });
    return withTimeout(p, TIMEOUT).then(function (res) {
      if (!res.rows) res.rows = [];
      return res;
    });
  }

  window.INSOONI_BACKEND = {
    isReady: isReady,

    /* 한 줄 남기기 — 사이트의 유일한 자유 입력칸.
       서버가 status를 'pending'으로 못박고, 글쓴이에게만 취소용 토큰을 돌려준다.
       토큰은 어떤 공개 뷰에도 들어 있지 않다. */
    submitNote: function (o) {
      return rpc("submit_note", {
        p_song_key:   (o && o.songKey) || null,
        p_song_title: (o && o.songTitle) || null,
        p_song_year:  (o && o.songYear) || null,
        p_name:       (o && o.name) || null,
        p_body:       (o && o.body) || ""
      });
    },
    /* 아직 검수 전인 내 글만 지운다. 이미 올라간 글은 서버가 거절하고
       그 사실을 사실대로 알려 준다 — 화면이 거짓말을 하지 않게. */
    cancelNote: function (token) { return rpc("cancel_note", { p_token: token || null }); },
    /* 상태만 돌려준다. 본문·이름은 돌려주지 않는다. */
    noteStatus: function (token) { return rpc("note_status", { p_token: token || null }); },
    listNotes:  function () { return readView("public_notes"); },

    /* 칩 문구는 DB 가 갖고 있다. 화면에 박아 두면 DB 를 고칠 때마다
       '보이는 말'과 '실제로 저장되는 말'이 갈라진다 — submit_preset 은
       번호만 받고 문구는 서버에서 찾아 넣기 때문이다. 그래서 읽어 쓴다. */
    listPresets: function () { return readView("presets"); },

    /* 사이트가 제시한 고정 문구를 그대로 보낼 때. 검수를 거치지 않고 바로 오른다.
       사람이 쓴 문장이 아니라 사이트의 문구이기 때문이다.
       서버 함수가 텍스트 인자를 아예 받지 않으므로 이 통로로는 아무 말도 못 넣는다. */
    submitPreset: function (o) {
      return rpc("submit_preset", {
        p_chip:       (o && o.chip) || 0,
        p_song_key:   (o && o.songKey) || null,
        p_song_title: (o && o.songTitle) || null,
        p_song_year:  (o && o.songYear) || null,
        p_name:       (o && o.name) || null
      });
    },
    /* 회차 — 매월 1일 저절로 묶여 나간다. 발행 작업이 없다(뷰가 날짜에서 계산). */
    listIssue:   function (no) { return readView("issue_notes", no ? ("issue_no=eq." + no) : ""); },
    listIssues:  function () { return readView("public_issues"); },
    /* 사랑방의 상태 — 화면 문구가 실측에서 자동으로 바뀌게 */
    state:       function () { return readView("sarangbang_state"); },
    /* 몇 곡에 기억이 붙었는지. 곡별 개수는 내주지 않는다
       (로그인이 없어 곡마다 숫자를 보이면 곧 부풀리기 대상이 된다). */
    notesFilled: function () { return readView("notes_filled"); },

    /* 꿈 — 자유 입력이므로 반드시 검수를 거친다. 서버가 status를 'pending'으로 고정한다. */
    submitDream: function (o) {
      return rpc("submit_dream", {
        p_name: (o && o.name) || null,
        p_text: (o && o.text) || ""
      });
    },
    listDreams: function () { return readView("public_dreams"); },

    /* 소식지 구독 — 서버는 신규든 중복이든 같은 응답을 준다.
       그렇지 않으면 특정 이메일이 구독자인지 확인하는 창구가 되어 버린다. */
    /* 듣고 싶은 노래 —
       쓰기는 rpc(속도 제한이 서버에 있다), 집계는 표를 직접 읽는다.
       001_init.sql 의 "신청곡 집계용 읽기" 정책이 select 를 열어 둔 이유가 이것이다.
       세는 것은 화면에서 한다 — PostgREST 로 GROUP BY 를 하려면 뷰가 필요한데,
       뷰를 새로 만들려면 남의 데이터베이스에 손을 대야 한다. */
    requestSong: function (title) { return rpc("request_song", { p_title: title || "" }); },
    listSongRequests: function () { return readView("song_requests", "select=title"); },

    subscribe: function (email) { return rpc("subscribe", { p_email: email || "" }); }
  };
})();
