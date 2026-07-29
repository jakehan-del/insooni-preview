/* ============================================================
   INSOONI DECK · 광고 없는 연속 믹스
   ------------------------------------------------------------
   Apple이 공식 제공하는 무광고 음원으로 곡과 곡을 겹쳐 넘긴다.
   두 개의 데크가 번갈아 돌고, 실시간 주파수를 읽어 파형을 그린다.
   전곡 감상은 각 곡의 '전곡 듣기'로 공식 채널에 연결된다.
   ============================================================ */
(function () {
  "use strict";

  var KEY = "insooni_deck";
  var TRACKS = null, queue = [], pos = 0, shuffled = false;
  var ctx = null, decks = [], cur = 0, analyser = null, raf = null;
  var XFADE = 4.0;
  /* 겹치는 길이는 곡의 결을 따른다.
     느린 곡은 길게 풀어 안개처럼 스미고, 힘찬 곡은 짧게 끊어 치고 나간다.
     길이를 정한 뒤에는 박의 정수배로 맞춰, 겹치는 동안 두 곡의 박이 어긋나지 않게 한다. */
  function xfadeLen(d) {
    var e = d && typeof d.e === "number" ? d.e : 0;
    var want = e > 0.6 ? 2.8 : e > 0.1 ? 3.6 : e > -0.5 ? 4.8 : 5.8;
    if (d && d.p) {
      var beats = Math.max(4, Math.round(want / d.p));
      want = beats * d.p;
    }
    return Math.max(2.4, Math.min(6.6, want));
  }
  var loaded = false, armed = false, busy = false, xfTimer = null;
  /* 전환마다 번호를 매긴다. 늦게 도착한 옛 타이머가 이미 남의 것이 된 데크를
     건드려 곡을 멈춰 버리는 일을 막는다. */
  var xfGen = 0;

  function isEN() { return document.documentElement.getAttribute("lang") === "en"; }
  function T(ko, en) { return isEN() ? en : ko; }

  /* ---------- 데크 구성 ---------- */
  function makeDeck() {
    var a = new Audio();
    a.crossOrigin = "anonymous";
    a.preload = "auto";
    a.playsInline = true;
    return { el: a, gain: null, src: null };
  }

  function ensureAudio() {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.78;
    analyser.connect(ctx.destination);
    decks = [makeDeck(), makeDeck()];
    /* 예비 시계 — timeupdate가 뜸해지는 브라우저에서도 전환을 놓치지 않는다 */
    if (!window.__insooniDeckTimer) {
      window.__insooniDeckTimer = setInterval(maybeAdvance, 500);
    }
    decks.forEach(function (d) {
      d.src = ctx.createMediaElementSource(d.el);
      /* 저역 셸빙: 두 곡이 겹칠 때 베이스가 뭉개지지 않게 들어오는 쪽 저역을 눌렀다 올린다 */
      d.bass = ctx.createBiquadFilter();
      d.bass.type = "lowshelf";
      d.bass.frequency.value = 190;
      d.bass.gain.value = 0;
      /* 트림: 곡마다 다른 녹음 음량을 같은 크기로 맞춘다 (스포티파이식 라우드니스 정규화) */
      d.trim = ctx.createGain();
      d.trim.gain.value = 1;
      d.gain = ctx.createGain();
      d.gain.gain.value = 0;
      d.src.connect(d.bass);
      d.bass.connect(d.trim);
      d.trim.connect(d.gain);
      d.gain.connect(analyser);
      d.p = 0;             /* 한 박 길이(초) */
      d.b = 0;             /* 첫 박이 오는 지점(초) */
      d.e = 0;             /* 곡의 에너지 */
      /* 음원을 못 받았을 때의 처리.
         잠깐 끊긴 것(네트워크)과 아예 못 쓰는 것(형식)을 구분한다 —
         일시적인 끊김에 곡을 영영 버리면, 멀쩡한 곡이 목록에서 사라지고
         순서가 저절로 바뀐 것처럼 보인다. */
      /* 소리가 흐르는 동안 계속 들어온다 — 탭이 뒤로 가도 멈추지 않는 신호 */
      d.el.addEventListener("timeupdate", maybeAdvance);
      d.el.addEventListener("error", function () {
        if (d !== decks[cur] || !d.live) return;
        var code = d.el.error && d.el.error.code;
        if (code !== 4 && !d.retried) {          /* 4 = 재생 불가 형식 */
          d.retried = 1;
          var at = d.el.currentTime;
          try {
            d.el.load();
            d.el.currentTime = at;
            var pr = d.el.play();
            if (pr && pr.catch) pr.catch(function () {});
          } catch (e) {}
          return;                                 /* 한 번은 다시 붙여 본다 */
        }
        if (d.el.src) DEAD[d.el.src] = 1;
        if (busy) { abortXfade(d); return; }      /* 겹치는 중이면 나가던 곡을 되살린다 */
        skipDead();
      });
    });
  }

  /* 겹치는 도중 들어오던 곡이 죽었다 — 나가던 곡을 도로 올리고 없던 일로 한다.
     이걸 안 하면 듣고 있던 곡이 문장 한가운데서 잘린다. */
  function abortXfade(bad) {
    xfGen++;
    clearTimeout(xfTimer); xfTimer = null;
    var from = decks[other()];
    try { bad.el.pause(); } catch (e) {}
    bad.live = false;
    bad.gain.gain.cancelScheduledValues(ctx.currentTime);
    bad.gain.gain.setValueAtTime(0, ctx.currentTime);
    if (from.gain.gain.cancelAndHoldAtTime) from.gain.gain.cancelAndHoldAtTime(ctx.currentTime);
    else from.gain.gain.cancelScheduledValues(ctx.currentTime);
    from.gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.3);
    from.bass.gain.cancelScheduledValues(ctx.currentTime);
    from.bass.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    cur = other();
    busy = false; armed = false;
    pos = (pos - 1 + queue.length) % queue.length;   /* 넘어가던 것을 되돌린다 */
  }

  /* 못 쓰는 음원은 목록에서 걷어내고 짧게 겹쳐 다음 곡으로 넘어간다 */
  var DEAD = {};
  function skipDead() {
    xfGen++;
    clearTimeout(xfTimer); xfTimer = null;
    var fresh = queue.filter(function (t) { return !DEAD[t.u]; });
    if (fresh.length < 2) return;
    var here = queue[pos];
    queue = fresh;
    var i = queue.indexOf(here);
    var next1 = i >= 0 ? i + 1 : Math.min(pos, queue.length - 1);
    pos = i >= 0 ? i : Math.min(pos, queue.length - 1);
    busy = false; armed = false;
    cur = other();
    playAt(next1, true, ctx.currentTime + 0.02, 0.45);   /* 딱 끊지 않고 짧게 넘긴다 */
  }

  /* ---------- 박자표 ----------
     곡마다 한 박 길이와 첫 박 위치를 미리 재 두었다(assets/data/previews.json).
     그래서 재생 중인 지점만 읽으면 다음 박이 언제 오는지 정확히 계산된다.
     소리를 실시간으로 뜯어 박을 추측하던 방식보다 어긋남이 없다. */
  function nextBeatTime(d) {
    if (!d.p || d.el.paused) return ctx.currentTime;
    var mt = d.el.currentTime;
    if (!(mt > 0)) return ctx.currentTime;
    var k = Math.ceil((mt - d.b) / d.p + 0.06);       /* 너무 코앞의 박은 건너뛴다 */
    var wait = (d.b + k * d.p) - mt;
    if (!(wait > 0) || wait > 2.4) return ctx.currentTime;
    return ctx.currentTime + wait;
  }

  /* 등파워 곡선: 선형으로 섞으면 가운데서 소리가 꺼진 듯 얇아진다 */
  function equalPower(rising) {
    var n = 64, arr = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = i / (n - 1);
      arr[i] = rising ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2);
    }
    return arr;
  }

  /* ---------- 세 개의 결 ----------
     연도나 앨범으로 나누면 숫자만 다를 뿐 소리가 섞이지 않는다.
     실제 DJ가 하듯 곡의 결로 나눈다 — 오늘의 흐름, 힘찬 무대, 조용한 밤.
     묶음이 셋뿐이라 각각이 50곡 넘게 깊고, 한 묶음 안에서는 템포가 이어진다. */
  var LISTS = {
    today: {
      ko: "오늘의 믹스", en: "Today's Mix", f: null,
      dko: "오늘 서울의 날씨와 계절, 지금 시간에 어울리는 곡부터 시작합니다. 매일 달라집니다.",
      den: "Starts with the songs that suit Seoul's weather, the season and this hour. It changes every day."
    },
    bright: {
      ko: "뜨거운 무대", en: "On Stage", f: function (s) { return s.set === "bright"; },
      dko: "무대를 밀어 올리는 곡들. 리듬이 앞에 서고, 곡과 곡은 짧게 끊어 넘어갑니다.",
      den: "The songs that lift a room. Rhythm out front, and the blends cut short and clean."
    },
    calm: {
      ko: "고요한 밤", en: "Quiet Night", f: function (s) { return s.set === "calm"; },
      dko: "혼자 있는 밤에 어울리는 곡들. 느리게 풀리고, 길게 겹쳐 넘어갑니다.",
      den: "For a night on your own. Slow to unfold, and the songs overlap for a long while."
    }
  };
  var kind = "today";

  /* ---------- 왜 이 곡인가 ----------
     노래가 그냥 흘러가면 배경음이 되고, 이유를 알면 이야기가 된다.
     ① 오늘 날씨·계절·시간에 맞춰 고른 곡이면 큐레이션 문장을 그대로 쓴다(가사 인용 없음)
     ② 아니면 앞 곡과의 관계로 설명한다
     ③ 그래도 없으면 그 곡이 놓인 시절을 말해 준다
     전부 확인된 데이터에서만 나온다 — 지어내지 않는다. */
  function moodReason(track) {
    var moods = window.SONG_MOODS || {};
    var d = new Date(), m = d.getMonth() + 1, h = d.getHours();
    var keys = [];
    if (window.INSOONI_TODAY && window.INSOONI_TODAY.key) keys.push(window.INSOONI_TODAY.key);
    keys.push(h < 6 ? "dawn" : h < 11 ? "morning" : h >= 20 ? "night" : "");
    keys.push(m <= 2 || m === 12 ? "cold-winter" : m <= 5 ? "clear-spring"
            : m <= 8 ? "clear-summer" : "clear-autumn");
    for (var i = 0; i < keys.length; i++) {
      var arr = moods[keys[i]] || [];
      for (var j = 0; j < arr.length; j++) {
        if (norm(arr[j].title) === norm(track.t)) {
          return isEN() && arr[j].en ? arr[j].en : arr[j].reason;
        }
      }
    }
    return "";
  }

  function flowReason(track, prev) {
    if (!prev) return T("여기서 오늘의 흐름이 시작됩니다.", "This is where today's set opens.");
    var de = (track.e || 0) - (prev.e || 0);
    var dp = Math.abs((track.p || 0.5) - (prev.p || 0.5));
    if (de > 0.45) return T("여기서부터 무대가 뜨거워집니다.", "From here the room starts to lift.");
    if (de < -0.45) return T("잠시 숨을 고르는 자리입니다.", "A place to catch your breath.");
    if (dp < 0.035) return T("앞 곡과 같은 걸음으로 이어집니다.", "It keeps the same step as the song before.");
    return "";
  }

  function eraReason(track) {
    if (track.no && track.y) {
      return T("정규 " + track.no + "집, " + track.y + "년의 노래입니다.",
               "From studio album no." + track.no + ", " + track.y + ".");
    }
    if (track.y) return T(track.y + "년에 남긴 노래입니다.", "Recorded in " + track.y + ".");
    return "";
  }

  function reasonFor(track, prev) {
    var m = moodReason(track);
    if (m) return m;
    return [flowReason(track, prev), eraReason(track)].filter(Boolean).join(" ");
  }

  function norm(s) { return String(s).toLowerCase().replace(/[\s'"`·.,!?()[\]/-]/g, ""); }
  /* 오늘의 믹스: 지금 서울 날씨에 맞는 곡을 앞에 세우고, 계절 곡으로 이어 붙인다.
     같은 날은 늘 같은 순서, 날이 바뀌면 순서도 바뀐다. */
  function todayFilter(list) {
    var moods = window.SONG_MOODS || {};
    var today = (window.INSOONI_TODAY && window.INSOONI_TODAY.key) || null;
    var d = new Date();
    var seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
    function bucket(keys) {
      var want = {};
      keys.forEach(function (k) {
        (moods[k] || []).forEach(function (s) { want[norm(s.title)] = 1; });
      });
      return list.filter(function (s) { return want[norm(s.t)]; });
    }
    var month = d.getMonth() + 1;
    var season = month <= 2 || month === 12 ? "cold-winter"
               : month <= 5 ? "clear-spring"
               : month <= 8 ? "clear-summer" : "clear-autumn";
    var hour = d.getHours();
    var timeKey = hour < 6 ? "dawn" : hour < 11 ? "morning" : hour >= 20 ? "night" : season;
    var head = today ? bucket([today]) : [];
    var mid = bucket([timeKey, season]).filter(function (s) { return head.indexOf(s) < 0; });
    var rest = list.filter(function (s) { return head.indexOf(s) < 0 && mid.indexOf(s) < 0; });
    /* 날짜 시드로 뒤쪽을 회전시켜 매일 다른 흐름을 만든다 */
    if (rest.length) {
      var cut = seed % rest.length;
      rest = rest.slice(cut).concat(rest.slice(0, cut));
    }
    var out = head.concat(mid, rest);
    return out.length ? out : list;
  }
  function shuffleArr(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = r[i]; r[i] = r[j]; r[j] = t; }
    return r;
  }

  /* 한 구간 안에서는 다음 곡을 세 가지로 고른다 — 템포, 세기, 그리고 시절.
     시절을 넣는 이유: 1981년 곡 다음에 2009년 곡이 오면 편곡과 녹음 질감이 확 달라져
     "뜬금없이 바뀌었다"고 느껴진다. 가까운 연대끼리 묶으면 흐름이 자연스럽다. */
  function chain(seg, from) {
    if (seg.length < 3) return seg.slice();
    function yr(t) { var y = parseInt(t.y, 10); return y > 1900 ? y : 1995; }
    var pool = seg.slice(), out = [pool.splice(from % pool.length, 1)[0]];
    while (pool.length) {
      var last = out[out.length - 1], bi = 0, bd = Infinity;
      for (var i = 0; i < pool.length; i++) {
        var dp = Math.abs((pool[i].p || 0.5) - (last.p || 0.5));
        var de = Math.abs((pool[i].e || 0) - (last.e || 0));
        var dy = Math.abs(yr(pool[i]) - yr(last)) / 45;     /* 45년 = 활동 전체 폭 */
        var cost = dp * 2.0 + de * 0.55 + dy * 1.3;
        if (cost < bd) { bd = cost; bi = i; }
      }
      out.push(pool.splice(bi, 1)[0]);
    }
    return out;
  }

  /* DJ 셋의 모양: 중간에서 열고, 밀어 올려 정점을 찍고, 가장 조용한 곡으로 내려놓는다.
     날짜를 씨앗으로 써서 시작 지점이 매일 달라진다 — 같은 날은 늘 같은 흐름. */
  function arc(list) {
    if (list.length < 8) return list.slice();
    var d = new Date();
    var seed = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate();
    var s = list.slice().sort(function (a, b) { return (a.e || 0) - (b.e || 0); });
    var n = s.length;
    var lo = Math.round(n * 0.40), mid = Math.round(n * 0.65);
    var open = s.slice(lo, mid);          /* 중간 에너지 — 문을 연다 */
    var peak = s.slice(mid);              /* 위쪽 — 밀어 올린다 */
    var close = s.slice(0, lo).reverse(); /* 아래쪽 — 천천히 내려놓는다 */
    return chain(open, seed).concat(chain(peak, seed >> 2), chain(close, seed >> 4));
  }

  function build(k) {
    var base = LISTS[k] && LISTS[k].f ? TRACKS.filter(LISTS[k].f) : TRACKS;
    if (base.length < 3) base = TRACKS;
    if (shuffled) return shuffleArr(base);
    if (k !== "today") return arc(base);
    /* 오늘의 믹스는 날씨·계절 곡을 앞에 세우고, 나머지를 셋의 모양대로 잇는다.
       앞머리도 조용한 곡부터 차오르게 세워 문이 부드럽게 열리도록 한다. */
    var ordered = todayFilter(base);
    var head = ordered.slice(0, 6).sort(function (a, b) { return (a.e || 0) - (b.e || 0); });
    var rest = ordered.filter(function (t) { return head.indexOf(t) < 0; });
    return head.concat(arc(rest));
  }

  /* ---------- 재생 ---------- */
  function other() { return cur === 0 ? 1 : 0; }

  /* 두 데크를 완전히 멈춘다 — 새 믹스를 걸기 전에 반드시 호출한다 */
  function stopAll() {
    xfGen++;                       /* 예약돼 있던 옛 전환을 전부 무효로 만든다 */
    clearTimeout(xfTimer); xfTimer = null;
    busy = false; armed = false;
    decks.forEach(function (d) {
      try { d.el.pause(); } catch (e) {}
      d.live = false;
      if (ctx && d.gain) {
        d.gain.gain.cancelScheduledValues(ctx.currentTime);
        d.gain.gain.setValueAtTime(0, ctx.currentTime);
      }
      if (ctx && d.bass) {
        d.bass.gain.cancelScheduledValues(ctx.currentTime);
        d.bass.gain.setValueAtTime(0, ctx.currentTime);
      }
      d.p = 0; d.b = 0; d.e = 0;
    });
  }

  function playAt(i, fade, at, xf) {
    if (!queue.length) return;
    pos = (i + queue.length) % queue.length;
    var track = queue[pos];
    var d = decks[cur];
    d.el.src = track.u;
    /* 들어오는 곡의 앞 무음을 건너뛴다. 첫 박 위치를 알고 있으므로
       바로 그 박에 맞춰 얹혀 들어가 앞머리가 비어 들리지 않는다.
       다만 30초뿐이라 많이 잘라내면 곡이 더 토막처럼 들린다 — 2초까지만 건너뛴다. */
    var skip = 0;
    if (fade) {
      /* 앞 무음이 첫 박보다 길 수도 있다 — 둘 중 큰 쪽까지 건너뛰어야 빈 앞머리가 안 남는다 */
      skip = Math.max(track.b > 0.25 ? track.b : 0, track.s > 0.35 ? track.s : 0);
      skip = Math.min(skip, 2);
    }
    d.el.currentTime = skip;
    d.el.addEventListener("loadedmetadata", function once() {
      d.el.removeEventListener("loadedmetadata", once);
      if (skip && d.el.currentTime < skip - 0.05) { try { d.el.currentTime = skip; } catch (e) {} }
    });
    /* 이 곡의 박자표와 결을 데크에 옮겨 둔다 */
    d.p = track.p || 0;
    d.b = track.b || 0;
    d.e = typeof track.e === "number" ? track.e : 0;
    var now = at && at > ctx.currentTime ? at : ctx.currentTime;
    d.gain.gain.cancelScheduledValues(ctx.currentTime);
    d.bass.gain.cancelScheduledValues(ctx.currentTime);
    if (fade) {
      d.gain.gain.setValueAtTime(0, ctx.currentTime);
      var XF2 = xf || XFADE;
      d.gain.gain.setValueCurveAtTime(equalPower(true), now, XF2);
      /* 들어오는 곡의 저역을 눌렀다가 절반 지점부터 되살린다 (베이스 스왑) */
      d.bass.gain.setValueAtTime(-16, ctx.currentTime);
      d.bass.gain.setValueAtTime(-16, now + XF2 * 0.45);
      d.bass.gain.linearRampToValueAtTime(0, now + XF2);
    } else {
      d.gain.gain.setValueAtTime(1, ctx.currentTime);
      d.bass.gain.setValueAtTime(0, ctx.currentTime);
    }
    d.live = true;
    /* 음량 보정 — 녹음 시대가 40년에 걸쳐 있어 곡마다 크기가 17dB까지 벌어진다.
       미리 재 둔 값으로 모두 같은 크기(-14 LUFS)에 맞춘다. */
    if (d.trim) d.trim.gain.setValueAtTime(track.g || 1, ctx.currentTime);
    /* 다음 곡을 미리 받아 두지 않는다.
       애플 프리뷰 CDN은 짧은 시간에 몰린 요청에 민감해서, 미리 받기가 쌓이면
       정작 재생 중인 곡의 요청이 거절당한다. 곡이 죽고 순서가 저절로 바뀌던
       원인이 이것이었다. preload="auto"만으로 충분하다. */
    d.retried = 0;
    var p = d.el.play();
    if (p && p.catch) p.catch(function () {});
    paint(track);
    setBoothTrack(cur, track);
    armed = false;
    save();
  }

  function next(onBeat) {
    var from = decks[cur];
    if (!ctx || busy) return false;   /* 전환 중 중복 호출 차단 */
    busy = true;
    /* 박자에 걸어 전환한다 — 박을 못 읽었으면 즉시 */
    var at = onBeat ? nextBeatTime(from) : ctx.currentTime;
    from.gain.gain.cancelScheduledValues(ctx.currentTime);
    from.gain.gain.setValueAtTime(from.gain.gain.value, ctx.currentTime);
    var XF = xfadeLen(from);
    from.gain.gain.setValueCurveAtTime(equalPower(false), at, XF);
    /* 나가는 곡의 저역을 먼저 빼서 자리를 비워 준다 */
    from.bass.gain.cancelScheduledValues(ctx.currentTime);
    from.bass.gain.setValueAtTime(from.bass.gain.value, ctx.currentTime);
    from.bass.gain.linearRampToValueAtTime(-16, at + XF * 0.5);
    clearTimeout(xfTimer);
    var myGen = ++xfGen;
    xfTimer = setTimeout(function () {
      if (myGen !== xfGen) return;   /* 그 사이 다른 전환이 있었다면 남의 데크다 */
      try { from.el.pause(); } catch (e) {}
      from.live = false;
      busy = false;                /* 겹침이 끝나야 다음 전환을 허용한다 */
    }, (at - ctx.currentTime + XF) * 1000 + 150);
    cur = other();
    playAt(pos + 1, true, at, XF);
    return true;
  }
  function prev() {
    if (!ctx) return;
    var here = pos;
    stopAll();                     /* 이전 곡은 겹치지 않고 딱 끊어 간다 */
    cur = other();
    playAt(here - 1, false);
  }

  /* 끝나기 전 여유를 두고, 다음 박에 맞춰 겹쳐 넘긴다.
     ------------------------------------------------------------
     이 판단을 화면 그리기(requestAnimationFrame)에 얹어 두면 안 된다.
     듣는 사람이 다른 탭으로 넘어가는 순간 브라우저가 그리기를 멈추기 때문에,
     노래는 계속 나오는데 넘길 사람이 없어져 곡이 끝나고 그대로 멈춰 버린다.
     그래서 소리 자체의 진행(timeupdate)과 느린 예비 시계로도 함께 확인한다. */
  function maybeAdvance() {
    if (!ctx || !decks.length || armed) return;
    var d = decks[cur];
    if (!d.el.duration || !(d.el.currentTime > 0) || d.el.paused) return;
    if (d.el.duration - d.el.currentTime > xfadeLen(d) + 0.9) return;
    /* 먼저 잠가야 같은 순간에 두 번 걸리지 않는다.
       전환이 성사되면 playAt이 잠금을 풀어 다음 곡이 제 차례에 준비된다.
       막혀서 못 걸었다면 여기서 풀어, 영영 못 넘어가는 일이 없게 한다. */
    armed = true;
    if (!next(true)) armed = false;
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    maybeAdvance();
    draw();
  }

  /* ---------- DJ 부스 (LP 두 장) ---------- */
  var booth = null, btDecks = null, btKnob = null, btBpm = null, btViz = null, btCtx = null;
  function bindBooth() {
    booth = document.getElementById("booth");
    if (!booth) { btDecks = null; return; }
    btDecks = [booth.querySelector('[data-deck="0"]'), booth.querySelector('[data-deck="1"]')];
    btKnob = booth.querySelector(".bt-knob");
    btBpm = document.getElementById("bt-bpm");
    btViz = booth.querySelector(".bt-viz");
    btCtx = btViz ? btViz.getContext("2d") : null;
    booth.setAttribute("aria-hidden", "false");
    idleBooth();
    var mm = document.getElementById("mode-mix"), mf = document.getElementById("mode-full");
    if (mm && !mm.dataset.bound) {
      mm.dataset.bound = "1";
      mm.addEventListener("click", function () { setMode("mix"); });
      mf.addEventListener("click", function () { setMode("full"); });
    }
    var pw = document.getElementById("bt-power");
    if (pw && !pw.dataset.bound) {
      pw.dataset.bound = "1";
      pw.addEventListener("click", function () {
        /* 아직 안 돌고 있으면 오늘의 믹스로 시작, 돌고 있으면 멈춤/재개 */
        if (MODE === "full") { if (!yt) { kind = "today"; setMode("full"); } else toggle(); return; }
        if (!ctx || !queue.length) { start("today"); return; }
        toggle();
      });
    }
  }
  function paintBooth() {
    if (!booth || !btDecks || !btDecks[0] || !decks.length) return;
    booth.classList.add("is-live");
    booth.setAttribute("aria-hidden", "false");
    var pw = document.getElementById("bt-power");
    if (pw) pw.querySelector(".btp-icon").textContent = decks[cur].el.paused ? "\u25B6" : "\u275A\u275A";
    for (var i = 0; i < 2; i++) {
      var d = decks[i], el = btDecks[i];
      if (!el) continue;
      var live = !!d.live && !d.el.paused;
      el.classList.toggle("is-live", !!live);
      var plate = el.querySelector(".bt-platter");
      /* 실제 박자에 맞춰 판이 도는 속도를 맞춘다 (한 바퀴 = 4박) */
      if (plate) plate.style.animationDuration = (d.p ? (d.p * 4).toFixed(2) : "2.4") + "s";
    }
    if (btKnob) {
      var g0 = decks[0].gain ? Math.max(0, decks[0].gain.gain.value) : 0;
      var g1 = decks[1].gain ? Math.max(0, decks[1].gain.gain.value) : 0;
      var ratio = (g0 + g1) > 0.02 ? g1 / (g0 + g1) : (cur === 0 ? 0 : 1);
      btKnob.style.left = (ratio * 100).toFixed(1) + "%";
    }
    /* 템포 숫자는 걸지 않는다 — 자동 추정은 두 배·절반으로 어긋나는 일이 잦아,
       공식 사이트에 사실처럼 내걸 수 없다. 대신 확실한 것을 보여 준다. */
    if (btBpm) {
      var blending = decks[0].live && decks[1].live;
      var lab = document.getElementById("bt-bpm-label");
      if (blending) {
        btBpm.textContent = "";
        if (lab) lab.textContent = T("두 곡이 겹치는 중", "BLENDING");
      } else {
        btBpm.textContent = queue.length ? (pos + 1) + " / " + queue.length : "—";
        if (lab) lab.textContent = T("번째 곡", "IN SET");
      }
    }
  }
  function idleBooth() {
    if (!btDecks || !btDecks[0]) return;
    var msg = T("눌러서 판을 올려 보세요", "Press to drop the needle");
    btDecks[0].querySelector(".bt-track").textContent = msg;
    btDecks[1].querySelector(".bt-track").textContent = "";
  }
  function setBoothTrack(i, track) {
    if (!btDecks || !btDecks[i]) return;
    var el = btDecks[i];
    var img = el.querySelector(".bt-art");
    if (track.art) { img.src = track.art; img.hidden = false; } else { img.hidden = true; }
    el.querySelector(".bt-track").textContent = track.t + (track.y ? "  " + track.y : "");
  }

  /* ---------- 비주얼 ---------- */
  var canvas = null, cctx = null, bins = null;
  function drawOn(c, cx) {
    var w = c.width, h = c.height;
    cx.clearRect(0, 0, w, h);
    var n = 34, step = Math.max(1, Math.floor(bins.length / n)), bw = w / n;
    for (var i = 0; i < n; i++) {
      var v = bins[i * step] / 255;
      var bh = Math.max(2, v * h * 0.94);
      var g = cx.createLinearGradient(0, h, 0, h - bh);
      g.addColorStop(0, "rgba(212,175,55,.95)");
      g.addColorStop(1, "rgba(243,239,231,.3)");
      cx.fillStyle = g;
      cx.fillRect(i * bw + bw * 0.2, h - bh, bw * 0.6, bh);
    }
  }
  var REDUCE = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function draw() {
    if (!analyser) return;
    paintBooth();                      /* 기능 표시(트랙·크로스페이더)는 항상 갱신 */
    if (REDUCE) return;                /* 모션 최소화: 장식용 주파수 막대는 그리지 않는다 */
    if (!bins) bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    if (btCtx && btViz) drawOn(btViz, btCtx);
    if (!canvas) return;
    var w = canvas.width, h = canvas.height;
    cctx.clearRect(0, 0, w, h);
    var n = 28, step = Math.floor(bins.length / n), bw = w / n;
    for (var i = 0; i < n; i++) {
      var v = bins[i * step] / 255;
      var bh = Math.max(2, v * h * 0.92);
      var g = cctx.createLinearGradient(0, h, 0, h - bh);
      g.addColorStop(0, "rgba(212,175,55,.95)");
      g.addColorStop(1, "rgba(243,239,231,.35)");
      cctx.fillStyle = g;
      cctx.fillRect(i * bw + bw * 0.22, h - bh, bw * 0.56, bh);
    }
  }

  /* ---------- UI ---------- */
  function bar() {
    var b = document.getElementById("deck");
    if (b) return b;
    b = document.createElement("div");
    b.id = "deck";
    b.className = "deck";
    b.hidden = true;
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", T("인순이 믹스 재생기", "Insooni mix player"));
    b.innerHTML =
      '<div class="dk-inner">' +
        '<div class="dk-disc" id="dk-disc"><img alt="" id="dk-art"><span class="dk-spindle"></span></div>' +
        '<div class="dk-now">' +
          '<span class="dk-kicker">INSOONI MIX · <b id="dk-list"></b></span>' +
          '<span class="dk-title" id="dk-title" aria-live="polite" aria-atomic="true"></span>' +
          '<span class="dk-meta" id="dk-meta"></span>' +
          '<span class="dk-why" id="dk-why"></span>' +
        "</div>" +
        '<canvas class="dk-viz" id="dk-viz" width="240" height="42" aria-hidden="true"></canvas>' +
        '<div class="dk-controls">' +
          '<button type="button" id="dk-prev" aria-label="' + T("이전 곡", "Previous") + '">◀◀</button>' +
          '<button type="button" id="dk-play" class="dk-play" aria-label="' + T("재생 또는 일시정지", "Play or pause") + '">❚❚</button>' +
          '<button type="button" id="dk-next" aria-label="' + T("다음 곡", "Next") + '">▶▶</button>' +
          '<button type="button" id="dk-shuffle" aria-pressed="false" aria-label="' + T("무작위", "Shuffle") + '">⤫</button>' +
          '<a id="dk-full" class="dk-full" target="_blank" rel="noopener">' + T("전곡 듣기", "FULL SONG") + "</a>" +
        "</div>" +
        '<button type="button" class="dk-close" id="dk-close" aria-label="' + T("닫기", "Close") + '">×</button>' +
      "</div>";
    document.body.appendChild(b);
    canvas = document.getElementById("dk-viz");
    cctx = canvas.getContext("2d");
    document.getElementById("dk-play").addEventListener("click", toggle);
    document.getElementById("dk-next").addEventListener("click", function () {
      if (MODE === "full") { if (yt) yt.nextVideo(); return; }
      next(true);
    });
    document.getElementById("dk-prev").addEventListener("click", function () {
      if (MODE === "full") { if (yt) yt.previousVideo(); return; }
      prev();
    });
    document.getElementById("dk-close").addEventListener("click", close);
    document.getElementById("dk-shuffle").addEventListener("click", function () {
      shuffled = !shuffled;
      this.setAttribute("aria-pressed", String(shuffled));
      var here = queue[pos];
      queue = build(kind);
      var i = queue.findIndex(function (s) { return s.t === (here && here.t); });
      pos = i < 0 ? 0 : i;
    });
    return b;
  }

  /* 앨범명은 우리 기록(정규 번호) 기준을 우선한다 — 스토어 표기와 다를 수 있어서 */
  function albumName(track) {
    var D = window.SITE_DATA || {};
    var hit = null;
    (D.albums || []).forEach(function (x) {
      var m = (x.kind || "").match(/정규\s*(\d+)집/);
      var n = m ? +m[1] : (x.kind === "솔로 1집" ? 1 : ((x.kind === "정규" && x.year === "2009") ? 17 : null));
      if (n && n === track.no) hit = x.title;
    });
    if (hit) return hit + (track.no ? T(" · 정규 " + track.no + "집", " · studio album no." + track.no) : "");
    return track.al || "";
  }

  function paint(track) {
    document.getElementById("dk-title").textContent = track.t;
    document.getElementById("dk-meta").textContent = [albumName(track), track.y].filter(Boolean).join(" · ");
    document.getElementById("dk-list").textContent = isEN() ? LISTS[kind].en : LISTS[kind].ko;
    var why = document.getElementById("dk-why");
    /* 첫 곡에는 '앞 곡'이 없다 — 큐를 돌려 마지막 곡과 비교하면 엉뚱한 설명이 나온다 */
    if (why) why.textContent = reasonFor(track, pos > 0 ? queue[pos - 1] : null);
    var art = document.getElementById("dk-art");
    if (track.art) { art.src = track.art; art.hidden = false; } else { art.hidden = true; }
    var full = document.getElementById("dk-full");
    var links = window.TRACK_LINKS || {};
    var id = links["인순이|" + track.t];
    full.href = id ? "https://www.youtube.com/watch?v=" + id
                   : "https://www.youtube.com/results?search_query=" + encodeURIComponent("인순이 " + track.t);
    document.body.classList.add("has-deck", "deck-playing");
  }

  function toggle() {
    if (MODE === "full") {
      if (!yt || !ytReady) return;
      var st = yt.getPlayerState();
      if (st === 1) yt.pauseVideo(); else yt.playVideo();
      return;
    }
    var d = decks[cur];
    if (d.el.paused) {
      if (ctx.state === "suspended") ctx.resume();
      d.el.play();
      document.body.classList.add("deck-playing");
      document.getElementById("dk-play").textContent = "❚❚";
      if (!raf) tick();
    } else {
      d.el.pause();
      document.body.classList.remove("deck-playing");
      document.getElementById("dk-play").textContent = "▶";
      cancelAnimationFrame(raf); raf = null;
    }
  }
  function close() {
    if (ctx && decks.length) stopAll();   /* 예약된 전환까지 확실히 접는다 */
    else decks.forEach(function (d) { try { d.el.pause(); } catch (e) {} });
    cancelAnimationFrame(raf); raf = null;
    bar().hidden = true;
    document.body.classList.remove("has-deck", "deck-playing");
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }
  function save() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ k: kind, t: queue[pos] && queue[pos].t, sh: shuffled, at: Date.now() }));
    } catch (e) {}
  }

  function load() {
    if (loaded) return Promise.resolve();
    return fetch("assets/data/previews.json?" + Date.now())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.tracks || !d.tracks.length) throw new Error("no tracks");
        TRACKS = d.tracks;
        loaded = true;
      });
  }

  /* 날씨 응답이 아직이면 잠깐 기다렸다가 오늘의 믹스를 짠다 */
  function waitToday(k) {
    if (k !== "today" || window.INSOONI_TODAY) return Promise.resolve();
    return new Promise(function (res) {
      var n = 0;
      var iv = setInterval(function () {
        if (window.INSOONI_TODAY || ++n > 16) { clearInterval(iv); res(); }
      }, 100);
    });
  }

  function start(k, resumeTitle) {
    kind = LISTS[k] ? k : "today";
    Promise.all([load(), waitToday(kind)]).then(function () {
      ensureAudio();
      if (ctx.state === "suspended") ctx.resume();
      stopAll();                   /* 다른 믹스를 누르면 돌던 판을 먼저 내린다 */
      queue = build(kind);
      var i = 0;
      if (resumeTitle) {
        var f = queue.findIndex(function (s) { return s.t === resumeTitle; });
        if (f >= 0) i = f;
      }
      bindBooth();
      bar().hidden = false;
      cur = 0;
      playAt(i, false);
      if (!raf) tick();
      document.getElementById("dk-play").textContent = "❚❚";
    }).catch(function () { /* 프리뷰를 못 받으면 조용히 아무것도 하지 않는다 */ });
  }

  /* ---------- 전곡 이어듣기 모드 ----------
     공식 음원 전곡은 유튜브를 통해서만 재생할 수 있다(광고 포함).
     30초 믹스와 전곡 감상 중에서 고를 수 있게 두 방식을 함께 둔다. */
  var MODE = "mix";
  var yt = null, ytReady = false;

  function ytIds() {
    var links = window.TRACK_LINKS || {};
    var ids = [], seen = {};
    queue.forEach(function (t) {
      var id = links["인순이|" + t.t];
      if (id && !seen[id]) { seen[id] = 1; ids.push(id); }
    });
    return ids;
  }

  function ensureYT(cb) {
    if (window.YT && window.YT.Player) { cb(); return; }
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () { if (prev) prev(); cb(); };
    if (!document.getElementById("yt-api")) {
      var t = document.createElement("script");
      t.id = "yt-api";
      t.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(t);
    }
  }

  function startFull() {
    var ids = ytIds();
    if (!ids.length) return;
    stopAll();
    document.body.classList.add("deck-full", "deck-playing");
    bar().hidden = false;
    if (!document.getElementById("dk-yt")) {
      var host = document.createElement("div");
      host.id = "dk-yt";
      document.body.appendChild(host);
    }
    ensureYT(function () {
      function onState(e) {
        if (e.data === 1) {
          document.body.classList.add("deck-playing");
          document.getElementById("dk-play").textContent = "\u275A\u275A";
          var pw = document.getElementById("bt-power");
          if (pw) pw.querySelector(".btp-icon").textContent = "\u275A\u275A";
          paintFullNow();
        } else if (e.data === 2) {
          document.body.classList.remove("deck-playing");
          document.getElementById("dk-play").textContent = "\u25B6";
        }
      }
      if (yt) { yt.loadPlaylist(ids); return; }
      yt = new YT.Player("dk-yt", {
        height: "1", width: "1",
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: function () { ytReady = true; yt.loadPlaylist(ids); },
          onStateChange: onState,
          onError: function () { try { yt.nextVideo(); } catch (e) {} }
        }
      });
    });
  }

  function paintFullNow() {
    if (!yt || !yt.getVideoData) return;
    var vd = yt.getVideoData() || {};
    var links = window.TRACK_LINKS || {};
    var hit = null;
    Object.keys(links).forEach(function (k) { if (links[k] === vd.video_id) hit = k.split("|")[1]; });
    var meta = null;
    TRACKS.forEach(function (t) { if (t.t === hit) meta = t; });
    document.getElementById("dk-title").textContent = hit || vd.title || "";
    document.getElementById("dk-meta").textContent = meta ? [albumName(meta), meta.y].filter(Boolean).join(" · ") : "";
    document.getElementById("dk-list").textContent = (isEN() ? LISTS[kind].en : LISTS[kind].ko) + " · " + T("전곡", "full");
    if (btDecks && btDecks[0] && meta) {
      btDecks[0].classList.add("is-live");
      setBoothTrack(0, meta);
      var img = document.getElementById("dk-art");
      if (meta.art) { img.src = meta.art; img.hidden = false; }
    }
    var full = document.getElementById("dk-full");
    if (full && vd.video_id) full.href = "https://www.youtube.com/watch?v=" + vd.video_id;
    document.body.classList.add("has-deck");
  }

  function setMode(m) {
    if (MODE === m) return;
    MODE = m;
    document.getElementById("mode-mix").setAttribute("aria-pressed", String(m === "mix"));
    document.getElementById("mode-full").setAttribute("aria-pressed", String(m === "full"));
    if (m === "full") {
      if (!TRACKS) { load().then(function () { queue = build(kind); startFull(); }); return; }
      if (!queue.length) queue = build(kind);
      startFull();
    } else {
      document.body.classList.remove("deck-full");
      if (yt && yt.stopVideo) { try { yt.stopVideo(); } catch (e) {} }
      start(kind);
    }
  }

  /* 고른 결이 어떤 자리인지 한 줄로 적어 준다 */
  function setNote() {
    var el = document.getElementById("deck-setnote");
    if (!el || !LISTS[kind]) return;
    el.textContent = isEN() ? LISTS[kind].den : LISTS[kind].dko;
  }

  /* ---------- 진입점 ---------- */
  function bindLauncher() {
    /* 캐시된 옛 문서에는 radio-launch로 남아 있을 수 있다 */
    bindBooth();
    var box = document.getElementById("deck-launch") || document.getElementById("radio-launch");
    if (!box || box.dataset.bound) return;
    box.dataset.bound = "1";
    load().then(function () {
      box.textContent = "";
      Object.keys(LISTS).forEach(function (k) {
        var n = LISTS[k].f ? TRACKS.filter(LISTS[k].f).length : TRACKS.length;
        if (n < 3) return;
        var b = document.createElement("button");
        b.type = "button";
        b.dataset.list = k;
        b.setAttribute("aria-pressed", String(k === kind));
        b.textContent = (isEN() ? LISTS[k].en : LISTS[k].ko) + "  " + n;
        b.addEventListener("click", function () {
          kind = k;
          /* 지금 고른 결이 어느 것인지 눈에 보이게 하고, 왜 이 결인지 한 줄로 알려 준다 */
          Array.prototype.forEach.call(box.children, function (el) {
            el.setAttribute("aria-pressed", String(el.dataset.list === k));
          });
          setNote();
          if (MODE === "full") { load().then(function () { queue = build(k); startFull(); }); }
          else start(k);
        });
        box.appendChild(b);
      });
      setNote();
    }).catch(function () {});
  }
  /* 영상이 시작되면 믹스를 멈춘다 (소리 겹침 방지) */
  window.INSOONI_DECK = {
    pause: function () {
      if (!ctx || !decks.length) return false;
      var ytOn = !!(yt && yt.getPlayerState && yt.getPlayerState() === 1);
      var any = decks.some(function (d) { return !d.el.paused; }) || ytOn;
      if (!any) return false;
      decks.forEach(function (d) { try { d.el.pause(); } catch (e) {} });
      if (yt && yt.pauseVideo) { try { yt.pauseVideo(); } catch (e) {} }
      document.body.classList.remove("deck-playing");
      var pb = document.getElementById("dk-play");
      if (pb) pb.textContent = "\u25B6";
      var pw = document.getElementById("bt-power");
      if (pw) pw.querySelector(".btp-icon").textContent = "\u25B6";
      return true;
    },
    debug: function () {
      var d = decks[cur];
      return {
        kind: kind, queue: queue.length, pos: pos,
        now: queue[pos] ? queue[pos].t : null,
        beat: d ? d.p : null, energy: d ? d.e : null,
        xfade: d ? +xfadeLen(d).toFixed(2) : null,
        trim: d && d.trim ? +d.trim.gain.value.toFixed(3) : null,
        live: decks.filter(function (x) { return x.live && !x.el.paused; }).length,
        order: queue.slice(0, 12).map(function (t) { return t.t + "(" + t.e + ")"; })
      };
    },
    isPlaying: function () {
      return !!(ctx && decks.length && decks.some(function (d) { return !d.el.paused; }));
    }
  };

  window.INSOONI_PAGE_INIT = window.INSOONI_PAGE_INIT || [];
  window.INSOONI_PAGE_INIT.push(bindLauncher);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindLauncher);
  else bindLauncher();
  window.addEventListener("pagehide", save);
})();
