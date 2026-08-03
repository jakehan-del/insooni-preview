/* ══════════════════════════════════════════════════════════════════════
   「무리」 — 사랑방의 하늘.

   화면의 아기거위 한 마리 = 지금 이 페이지를 보고 있는 사람 한 명.
   1:1 이다. 가짜 인원도, 부풀린 숫자도 없다. 혼자면 한 마리다.

   ── 왜 이렇게 만들었나 ──
   자리를 적분(속도를 누적)으로 구하면 기기마다 프레임 간격이 달라
   시간이 갈수록 화면이 갈라진다. 그래서 자리는 t 를 넣으면 나오는
   함수 f(t) 다 — 늦게 들어와도 로딩 없이 첫 프레임에 정위치고,
   폰 두 대를 나란히 놓으면 같은 대형이 그려진다.
   살아있음은 그 자리를 쫓는 스프링에서 낸다(스프링은 항상 수렴하므로
   프레임 간격이 달라도 갈라지지 않는다).

   ── 시계 ──
   같은 순간을 그리려면 같은 시계를 봐야 한다. 서버 시계는 PostgREST
   응답의 date 헤더인데 HTTP-date 는 '초' 단위라 그냥 읽으면 폰 두 대가
   최대 1초까지 어긋난다. 한 마디가 1.85초이므로 그건 못 쓴다.
   그래서 '초가 바뀌는 순간'을 찾는다. 실측: 요청 9번(약 1초)에
   불확실 폭 122ms, 5회 반복 시 추정치 표준편차 30ms — 폰 두 대가
   ±60ms 안에 들어온다. 한 마디의 3% 라 섬광은 눈으로 동시에 보인다.

   ── 못 하면 못 한다고 한다 ──
   백엔드가 없거나 WebSocket 이 막히면 접속자 수를 알 수 없다.
   그때는 아무 숫자도 지어내지 않고 거위 한 마리만 띄운다.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var cv = document.getElementById("muri-canvas");
  if (!cv || typeof window.INSOONI_GOOSE !== "function") return;

  var ctx = cv.getContext("2d");
  var countEl = document.getElementById("muri-count");
  var noteEl = document.getElementById("muri-note");

  var INK = "#F3EFE7";
  var BAR = 1.85;                 /* 한 마디(초) */
  var CYCLE = BAR * 8;            /* 8마디마다 한 번 */
  var TURN = 90;                  /* 선두 교대 주기(초) */
  var MAX = 24;                   /* 이보다 많으면 화면이 뭉갠다. 숫자는 그대로 적는다 */

  var reduce = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── 화면 ─────────────────────────────────────────────────────── */
  var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  function size() {
    var r = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  /* ── 서버 시계 ────────────────────────────────────────────────── */
  /* skew = 서버시각 - 로컬시각(ms). 못 구하면 0 — 그래도 화면은 돈다.
     다만 그때는 다른 폰과 대형이 어긋날 수 있다. 그건 조용히 감수한다,
     화면이 안 나오는 것보다는 낫다. */
  var skew = 0, skewFixed = false;

  function probe(url, key) {
    var t0 = Date.now();
    /* apikey 를 안 붙이면 401 이 온다. 그 응답에도 date 헤더는 있지만
       콘솔에 붉은 줄이 남고, 브라우저가 요청을 중단한 것으로 기록한다.
       공식 홈페이지 콘솔에 이유 없는 오류를 남기지 않는다.
       헤더로 보내면 프리플라이트가 한 번 붙지만 그 결과는 캐시되고,
       경계 탐지는 '연속된 두 응답의 차이'라 첫 요청이 느려도 영향이 없다. */
    /* HEAD 는 본문이 없어 크로뮴이 매번 '중단'으로 기록한다 —
       오류는 아니지만 네트워크 기록이 지저분해진다.
       limit=1 짜리 GET 이면 본문이 몇 바이트뿐이라 사실상 같은 값이다. */
    return fetch(url, {
      method: "GET", cache: "no-store", headers: { apikey: key }
    }).then(function (r) {
      var d = r.headers.get("date");
      if (!d) return null;
      var srv = Date.parse(d);
      if (!isFinite(srv)) return null;
      /* 왕복의 절반을 보정한다 — 응답이 만들어진 시각은 그 언저리다 */
      return { srv: srv, mid: (t0 + Date.now()) / 2 };
    })["catch"](function () { return null; });
  }

  function syncClock(url, key) {
    /* 초가 바뀌는 경계를 찾는다. 그 경계가 곧 서버의 '정각 초'다. */
    var prev = null, tries = 0;
    function step() {
      if (skewFixed || tries >= 12) return;
      tries++;
      probe(url, key).then(function (r) {
        if (!r) return;
        if (prev && r.srv !== prev.srv) {
          /* 경계는 prev.mid 와 r.mid 사이. 그 가운데를 서버 초의 시작으로 본다 */
          var edge = (prev.mid + r.mid) / 2;
          skew = r.srv - edge;
          skewFixed = true;
          return;
        }
        prev = r;
        setTimeout(step, 60);
      });
    }
    step();
  }

  function now() { return (Date.now() + skew) / 1000; }

  /* ── 무리 ─────────────────────────────────────────────────────── */
  /* 선두의 씨앗 4바이트. 선두가 바뀌면 무리 전체의 항로가 바뀐다. */
  var seed = [0.113, 0.281, 0.171, 0.091];

  function seedFrom(id) {
    /* 문자열 하나를 네 개의 느린 주파수로 편다. 값의 범위는 좁게 —
       너무 빠르면 무리가 파리처럼 날고, 너무 느리면 정지해 보인다. */
    var h = 2166136261, i;
    for (i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    function f(shift, lo, hi) {
      return lo + ((h >>> shift) & 255) / 255 * (hi - lo);
    }
    return [f(0, 0.085, 0.145), f(8, 0.21, 0.34), f(16, 0.13, 0.21), f(24, 0.07, 0.12)];
  }

  function leadPath(t) {
    /* 화면을 가로질러 나가지 않는다. 안에서 배회한다 —
       한 번 밖으로 나가면 몇 초 동안 빈 하늘이 남고, 그건 사랑방에서 최악이다. */
    return [W * (0.50 + 0.21 * Math.sin(t * seed[0]) + 0.07 * Math.sin(t * seed[1] + 1.1)),
            H * (0.46 + 0.14 * Math.sin(t * seed[2] + 0.6) + 0.05 * Math.sin(t * seed[3]))];
  }

  function heading(t) {
    /* closed-form 이라 미래 위치를 함수에 넣어 바로 구한다.
       속도를 따로 적분해 들고 다닐 필요가 없다. */
    var a = leadPath(t), b = leadPath(t + 0.25);
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }

  /* 편대는 선두 '뒤로만' 늘어선다. 그래서 leadPath 를 그대로 쓰면
     무리의 무게중심이 늘 뒤쪽으로 쏠리고, 선두는 화면 끝에 걸린다.
     평균 차수만큼 앞으로 밀어 무게중심을 leadPath 에 앉힌다. */
  function meanRank() {
    var n = birds.length, sum = 0, i;
    for (i = 0; i < n; i++) sum += Math.ceil(i / 2);
    return n ? sum / n : 0;
  }

  function slot(i, t) {
    var L = leadPath(t);
    /* 편대의 기울기도 묶는다. 몸의 피치만 ±26° 로 묶고 편대를 안 묶으면,
       급강하하는 순간 V자가 통째로 세로로 서서 무리가 아니라 줄이 된다.
       좌우 방향은 그대로 두고 기울기만 ±31° 안으로 눕힌다. */
    var h = heading(t), ch = Math.cos(h), sh = Math.sin(h);
    var LIM = 0.60;                        /* tan 31° */
    if (Math.abs(sh) > LIM * Math.abs(ch)) {
      var mag = Math.sqrt(1 + LIM * LIM);
      ch = (ch < 0 ? -1 : 1) / mag;
      sh = (sh < 0 ? -1 : 1) * LIM / mag;
    }
    var arm = (i % 2) ? 1 : -1;              /* 좌우 갈래 */
    var rank = Math.ceil(i / 2);             /* 선두에서 몇 번째 */
    /* 몸보다 좁으면 겹친다. 1.28배는 날개 끝이 서로 닿지 않는 최소치다.
       적을 때는 조금 더 벌려 넓은 하늘이 허전하지 않게 한다. */
    var gap = SZ * (birds.length <= 4 ? 1.55 : 1.28);
    var th = 0.42 + Math.sin(t * 0.23 + i) * 0.05;   /* 편대 각이 숨쉰다 */
    var lx = (meanRank() - rank) * gap * Math.cos(th) * 1.35;
    var ly = arm * rank * gap * Math.sin(th);
    return [L[0] + lx * ch - ly * sh + Math.sin(t * 0.98 + i * 1.7) * 6,
            L[1] + lx * sh + ly * ch + Math.sin(t * 1.05 + i * 1.7) * 8
                                     + Math.sin(t * 0.44 + i * 0.6) * 4];
  }

  /* 이번 프레임의 기준 크기. 간격은 캔버스가 아니라 이 값의 함수여야 한다 —
     캔버스에 맞추면 인원이 늘 때 간격이 몸보다 좁아져 서로 겹친다. */
  var SZ = 46;
  var birds = [];
  function setCount(n) {
    n = Math.max(1, Math.min(MAX, n | 0));
    while (birds.length < n) {
      birds.push({ i: birds.length, x: 0, y: 0, vx: 0, vy: 0,
                   dir: 0, left: false, flap: birds.length * 0.9, warm: false });
    }
    birds.length = n;
  }
  setCount(1);

  /* ── 그리기 ───────────────────────────────────────────────────── */
  function paint() {
    var t = now();
    var ph = ((t % CYCLE) + CYCLE) % CYCLE / CYCLE;
    var flash = ph < 0.10 ? Math.pow(1 - ph / 0.10, 2.6) : 0;

    ctx.clearRect(0, 0, W, H);

    /* 이번 프레임의 기준 크기. 빛무리·몸·간격이 모두 이 값을 쓴다.
       적을수록 크게 — 세 마리가 하늘을 채우려면 한 마리가 커야 한다. */
    SZ = Math.max(30, Math.min(94,
      Math.min(W, H) * (0.205 - Math.min(birds.length, 24) * 0.0052)));

    /* 빛 — 검은 배경 위의 빛은 반드시 더한다.
       source-over 로 흰색을 얹으면 빛이 아니라 안개가 된다. */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var g = 0; g < birds.length; g++) {
      var b0 = birds[g], r = SZ * 1.15;
      var grad = ctx.createRadialGradient(b0.x, b0.y, 0, b0.x, b0.y, r);
      var a = 0.075 + flash * 0.26 + (g === 0 ? 0.04 : 0);
      grad.addColorStop(0, "rgba(243,239,231," + a.toFixed(3) + ")");
      grad.addColorStop(0.45, "rgba(243,239,231," + (a * 0.22).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(243,239,231,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(b0.x, b0.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    /* 몸 */
    for (var i = 0; i < birds.length; i++) {
      var b = birds[i], s = slot(i, t);
      if (!b.warm) { b.x = s[0]; b.y = s[1]; b.warm = true; }   /* 첫 프레임 정위치 */

      if (reduce) { b.x = s[0]; b.y = s[1]; }
      else {
        b.vx += (s[0] - b.x) * 0.19; b.vx *= 0.76; b.x += b.vx;
        b.vy += (s[1] - b.y) * 0.19; b.vy *= 0.76; b.y += b.vy;
        b.flap += 0.155;
      }

      /* 좌우는 회전이 아니라 x축 대칭으로 뒤집는다.
         y 부호를 뒤집으면 여전히 오른쪽을 보면서 배만 하늘을 본다.
         vx 로 바로 판정하면 수직 비행에서 매 프레임 튀므로 죽은 구간을 둔다. */
      if (b.vx < -0.25) b.left = true;
      else if (b.vx > 0.25) b.left = false;

      /* 피치는 ±26° 로 묶는다. 기러기는 수직으로 서지 않는다 */
      var pitch = Math.atan2(b.vy, Math.abs(b.vx) + 0.02);
      pitch = Math.max(-0.45, Math.min(0.45, pitch));
      if (b.left) pitch = -pitch;
      b.dir += (pitch - b.dir) * 0.14;

      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      var n = 1 + Math.min(sp * 0.016, 0.24);          /* 부피 보존 스쿼시 */
      var sz = SZ * (i === 0 ? 1.12 : 1);       /* 선두만 조금 크다 */

      window.INSOONI_GOOSE(ctx, b.x, b.y, sz, b.flap,
                           (b.left ? -1 : 1) / Math.sqrt(n), n, b.dir, 0.96);
    }

    /* 섬광 — 8마디마다 화면 전체가 한 번 숨을 쉰다.
       서버 시계로 계산하므로 폰 두 대를 나란히 놓으면 같이 터진다.
       그게 이 화면이 '같은 곳'이라는 유일한 증명이다. */
    /* 화면 전체를 채우지 않는다. 채우면 캔버스의 사각형 경계가 드러나
       '열린 하늘'이 '밝은 네모'가 된다 — 마스크로도 좌우 가장자리는 못 지운다.
       대신 위의 빛무리가 flash 만큼 함께 커진다(0.075 → 0.335).
       거위가 같이 밝아지는 것으로 충분하고, 그쪽이 더 곱다. */
  }

  var running = false;
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    paint();
  }

  /* 화면 밖으로 나가면 멈춘다. 안 멈추면 배터리만 먹는다. */
  function start() { if (!running) { running = true; requestAnimationFrame(loop); } }
  function stop() { running = false; }

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) { if (reduce) paint(); else start(); }
      else stop();
    }, { threshold: 0.01 }).observe(cv);
  } else { start(); }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else if (!reduce) start();
  });

  window.addEventListener("resize", function () {
    size();
    for (var i = 0; i < birds.length; i++) birds[i].warm = false;
    if (reduce) paint();
  });
  size();
  if (reduce) paint();

  /* ── 사람 수 ──────────────────────────────────────────────────── */
  function say(n, known) {
    if (!countEl) return;
    if (!known) {
      countEl.textContent = "";
      if (noteEl) noteEl.textContent = "지금은 몇 분이 계신지 셀 수 없습니다. 거위 한 마리만 띄웁니다.";
      return;
    }
    countEl.textContent = n === 1 ? "지금 여기, 한 사람" : ("지금 여기, " + n + "명");
    if (noteEl) {
      noteEl.textContent = n === 1
        ? "한 마리는 당신입니다. 다른 분이 들어오면 옆에 나란히 섭니다."
        : "한 마리가 한 사람입니다. 8마디마다 모든 화면이 같이 밝아집니다.";
    }
  }
  say(1, false);

  /* ── Realtime ─────────────────────────────────────────────────
     라이브러리를 쓰지 않는다. 프로토콜이 단순하고, 이 한 기능 때문에
     번들 하나를 더 받게 하고 싶지 않다. 로그인도 없다 —
     publishable 키는 공개용으로 설계된 키다. */
  /* 설정 읽는 규칙은 backend.js 와 똑같이 맞춘다.
     키 이름은 anonKey 다 (config.js). 여기서 c.key 로 읽어 조용히 꺼진 적이 있다.
     예시 문구가 그대로 남아 있는 경우도 '설정 안 됨'으로 보는 것까지 같다 —
     한쪽만 켜지면 화면에는 숫자가 뜨는데 글은 안 써지는 이상한 상태가 된다. */
  var c0 = window.INSOONI_CONFIG || {};
  var cfg = {
    url: (c0.url || "").replace(/\/+$/, ""),
    key: c0.anonKey || ""
  };
  if (!cfg.url || !cfg.key) return;
  if (cfg.url.indexOf("여기에") >= 0 || cfg.key.indexOf("여기에") >= 0) return;
  if (cfg.url.indexOf("YOUR-") >= 0 || cfg.key.indexOf("YOUR-") >= 0) return;

  /* /rest/v1/ 루트는 키를 붙여도 401 이다(실측). 401 응답에도 date 헤더는
     오지만 콘솔에 붉은 줄이 남는다. 이미 공개로 열려 있는 뷰를 쓴다 —
     HEAD 라 본문은 오지 않고, 응답은 200 이며, date 헤더는 그대로다. */
  syncClock(cfg.url + "/rest/v1/public_notes?select=id&limit=1", cfg.key);

  var me = "g" + Math.random().toString(36).slice(2, 10);
  var TOPIC = "realtime:muri";
  var ws = null, hb = null, ref = 0, retry = 0, present = {}, joinRef = "";

  function push(event, payload, topic) {
    if (!ws || ws.readyState !== 1) return;
    ref++;
    ws.send(JSON.stringify({
      topic: topic || TOPIC, event: event, payload: payload || {}, ref: String(ref)
    }));
  }

  function recount() {
    var ids = Object.keys(present);
    if (ids.indexOf(me) < 0) ids.push(me);
    setCount(ids.length);
    say(ids.length, true);

    /* 선두 교대 — 90초마다 실제 접속자 중 한 명이 앞에 선다.
       기러기가 선두를 돌아가며 서는 것과 같은 이유다: 맨 앞이 가장 힘들다.
       누구를 뽑든 모든 화면이 같은 답을 내야 하므로 정렬해서 고른다. */
    ids.sort();
    var lead = ids[Math.floor(now() / TURN) % ids.length];
    seed = seedFrom(lead);
  }

  function connect() {
    var base = cfg.url.replace(/^http/, "ws");
    try {
      ws = new WebSocket(base + "/realtime/v1/websocket?apikey="
                         + encodeURIComponent(cfg.key) + "&vsn=1.0.0");
    } catch (e) { return; }

    ws.onopen = function () {
      retry = 0;
      /* enabled:true 가 없으면 서버가 presence_state(지금 있는 사람 명부)를
         보내 주지 않는다. 그러면 나보다 '나중에' 들어온 사람만 알게 되어,
         늦게 들어온 사람은 방이 비어 있다고 느낀다.
         첫 사람은 계속 정확히 세이므로 혼자 열어 보면 멀쩡해 보인다 —
         조용히 틀리는 종류라 실제로 두 창을 띄워 보고서야 잡았다. */
      push("phx_join", {
        config: {
          presence: { key: me, enabled: true },
          broadcast: { self: false }
        }
      });
      joinRef = String(ref);          /* 이 응답에만 track 을 보낸다 */
      hb = setInterval(function () { push("heartbeat", {}, "phoenix"); }, 25000);
    };

    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.topic !== TOPIC) return;

      /* 가입 응답에만 반응한다.
         모든 phx_reply 에 track 을 보내면 track 의 응답도 phx_reply 라서
         자기 자신을 되먹이는 무한 루프가 된다. 화면은 멀쩡해 보이는데
         초당 수십 건이 나가 무료 한도(월 200만 건·초당 100건)를 갉아먹는다.
         실제로 그랬다 — ref 2, 3, 4 … 로 끝없이 나갔다. */
      if (m.event === "phx_reply" && m.ref === joinRef) {
        if (m.payload && m.payload.status === "ok") {
          push("presence", { type: "presence", event: "track", payload: {} });
        }
        return;
      }
      if (m.event === "presence_state") {
        present = {};
        var st = m.payload || {};
        for (var k in st) if (Object.prototype.hasOwnProperty.call(st, k)) present[k] = 1;
        recount();
        return;
      }
      if (m.event === "presence_diff") {
        var j = (m.payload && m.payload.joins) || {};
        var l = (m.payload && m.payload.leaves) || {};
        var p;
        for (p in j) if (Object.prototype.hasOwnProperty.call(j, p)) present[p] = 1;
        for (p in l) if (Object.prototype.hasOwnProperty.call(l, p)) delete present[p];
        recount();
      }
    };

    ws.onclose = function () {
      if (hb) { clearInterval(hb); hb = null; }
      /* 끊기면 숫자를 붙들고 있지 않는다. 모르면 모른다고 한다. */
      present = {};
      setCount(1);
      say(1, false);
      /* 지수 백오프 — 서버가 아플 때 다 같이 달려들면 더 아프다 */
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, 1000 * Math.pow(2, retry - 1));
    };

    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  connect();
})();
