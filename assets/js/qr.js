/* ============================================================
   INSOONI · QR 부호기 (qr.js) — 운영 화면(admin.html)의 공연 탭에서만 싣는다
   ------------------------------------------------------------
   공연장 QR(https://insooni.com/live?e=코드)을 운영자의 브라우저에서 바로 만든다.
   왜 직접 쓰는가 — 런타임에 남의 스크립트(CDN)를 싣지 않는다는 사이트 원칙, 그리고
   코드는 서버가 공연을 만들 때 정하므로 빌드 때 미리 그려 둘 수도 없다.
   표준(ISO/IEC 18004)의 바이트 모드 · 버전 1~10 · 오류 정정 L/M/Q/H · 마스크 자동 선택만 담았다.
   공연 주소(30여 자)는 버전 3(29×29)에 들어간다. 더 긴 글은 버전 10(M 기준 213바이트)까지.
   검사: scripts/check_concert_ui.py 가 만든 SVG 를 다른 해독기(브라우저 BarcodeDetector —
   macOS Vision)로 읽어 원래 주소와 글자 하나까지 같은지 본다.
   ============================================================ */
(function () {
  "use strict";

  /* 버전별 블록 하나의 오류 정정 부호어 수와 블록 수 — [L, M, Q, H], 인덱스 = 버전(0 은 비움) */
  var ECC_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28]
  ];
  var NUM_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8]
  ];
  var LEVEL = { L: 0, M: 1, Q: 2, H: 3 };
  var FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };
  var MAX_VER = 10;

  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver, lv) {
    return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[lv][ver] * NUM_BLOCKS[lv][ver];
  }

  /* ---------- 리드-솔로몬 (GF(256), 원시다항식 0x11D) ---------- */
  function gmul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }
  function rsDivisor(degree) {
    var r = [], i, j, root = 1;
    for (i = 0; i < degree; i++) r.push(0);
    r[degree - 1] = 1;
    for (i = 0; i < degree; i++) {
      for (j = 0; j < r.length; j++) {
        r[j] = gmul(r[j], root);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      root = gmul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift();
      r.push(0);
      for (var i = 0; i < div.length; i++) r[i] ^= gmul(div[i], f);
    });
    return r;
  }

  function utf8(s) {
    var out = [], e = unescape(encodeURIComponent(String(s)));
    for (var i = 0; i < e.length; i++) out.push(e.charCodeAt(i));
    return out;
  }

  /* ---------- 부호화 ---------- */
  function make(text, level) {
    level = LEVEL.hasOwnProperty(level) ? level : "M";
    var lv = LEVEL[level], bytes = utf8(text), ver, cap, ccBits;
    for (ver = 1; ver <= MAX_VER; ver++) {
      ccBits = ver <= 9 ? 8 : 16;
      cap = dataCodewords(ver, lv) * 8;
      if (4 + ccBits + bytes.length * 8 <= cap) break;
    }
    if (ver > MAX_VER) throw new Error("QR: 글이 너무 깁니다");

    /* 비트열: 모드(0100 바이트) · 글자 수 · 데이터 · 끝표시 · 바이트 맞춤 · 채움(EC 11) */
    var bb = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1); }
    put(4, 4);
    put(bytes.length, ccBits);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bb.length));
    put(0, (8 - bb.length % 8) % 8);
    for (var pad = 0xEC; bb.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bb.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bb[i + j];
      data.push(v);
    }

    /* 블록으로 나누고 오류 정정을 붙여 엇갈려 싣는다 */
    var nb = NUM_BLOCKS[lv][ver], eccLen = ECC_PER_BLOCK[lv][ver];
    var raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    var div = rsDivisor(eccLen), blocks = [], k = 0, b;
    for (b = 0; b < nb; b++) {
      var dat = data.slice(k, k + shortLen - eccLen + (b < nShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (b < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var words = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (b = 0; b < blocks.length; b++) {
        if (i !== shortLen - eccLen || b >= nShort) words.push(blocks[b][i]);
      }
    }

    var size = ver * 4 + 17;
    var mod = [], fn = [];
    for (i = 0; i < size; i++) {
      mod.push([]); fn.push([]);
      for (j = 0; j < size; j++) { mod[i].push(false); fn[i].push(false); }
    }
    function setF(x, y, dark) { mod[y][x] = dark; fn[y][x] = true; }

    /* 기능 무늬: 타이밍 · 위치 찾기 셋 · 정렬 · 형식(자리만) · 버전 */
    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    function finder(x, y) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var al = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2;
      var step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      al = [6];
      for (var pos = size - 7; al.length < na; pos -= step) al.splice(1, 0, pos);
    }
    for (i = 0; i < al.length; i++) for (j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) {
        setF(al[i] + ax, al[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
      }
    }
    function format(mask) {
      var d = FORMAT_BITS[level] << 3 | mask, rem = d;
      for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = (d << 10 | rem) ^ 0x5412, n;
      for (n = 0; n <= 5; n++) setF(8, n, bit(bits, n));
      setF(8, 7, bit(bits, 6));
      setF(8, 8, bit(bits, 7));
      setF(7, 8, bit(bits, 8));
      for (n = 9; n < 15; n++) setF(14 - n, 8, bit(bits, n));
      for (n = 0; n < 8; n++) setF(size - 1 - n, 8, bit(bits, n));
      for (n = 8; n < 15; n++) setF(8, size - 15 + n, bit(bits, n));
      setF(8, size - 8, true);
    }
    format(0);
    if (ver >= 7) {
      var rv = ver;
      for (i = 0; i < 12; i++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1F25);
      var vb = ver << 12 | rv;
      for (i = 0; i < 18; i++) {
        var aa = size - 11 + i % 3, bq = Math.floor(i / 3), on = bit(vb, i);
        setF(aa, bq, on); setF(bq, aa, on);
      }
    }

    /* 데이터를 지그재그로 싣는다 */
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && bi < words.length * 8) {
            mod[y][x] = bit(words[bi >>> 3], 7 - (bi & 7));
            bi++;
          }
        }
      }
    }

    /* 마스크 여덟 가지 중 벌점이 가장 낮은 것 */
    function maskOn(m, x, y) {
      switch (m) {
        case 0: return (x + y) % 2 === 0;
        case 1: return y % 2 === 0;
        case 2: return x % 3 === 0;
        case 3: return (x + y) % 3 === 0;
        case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
        case 5: return x * y % 2 + x * y % 3 === 0;
        case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
        default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
      }
    }
    function applyMask(m) {
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) {
        if (!fn[yy][xx] && maskOn(m, xx, yy)) mod[yy][xx] = !mod[yy][xx];
      }
    }
    function addHist(len, h) { if (h[0] === 0) len += size; h.pop(); h.unshift(len); }
    function countPat(h) {
      var n = h[1], core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    }
    function termCount(color, len, h) {
      if (color) { addHist(len, h); len = 0; }
      len += size;
      addHist(len, h);
      return countPat(h);
    }
    function penalty() {
      var res = 0, xx, yy, color, run, h, dark = 0;
      for (yy = 0; yy < size; yy++) {
        color = false; run = 0; h = [0, 0, 0, 0, 0, 0, 0];
        for (xx = 0; xx < size; xx++) {
          if (mod[yy][xx] === color) { run++; if (run === 5) res += 3; else if (run > 5) res++; }
          else { addHist(run, h); if (!color) res += countPat(h) * 40; color = mod[yy][xx]; run = 1; }
        }
        res += termCount(color, run, h) * 40;
      }
      for (xx = 0; xx < size; xx++) {
        color = false; run = 0; h = [0, 0, 0, 0, 0, 0, 0];
        for (yy = 0; yy < size; yy++) {
          if (mod[yy][xx] === color) { run++; if (run === 5) res += 3; else if (run > 5) res++; }
          else { addHist(run, h); if (!color) res += countPat(h) * 40; color = mod[yy][xx]; run = 1; }
        }
        res += termCount(color, run, h) * 40;
      }
      for (yy = 0; yy < size - 1; yy++) for (xx = 0; xx < size - 1; xx++) {
        var c = mod[yy][xx];
        if (c === mod[yy][xx + 1] && c === mod[yy + 1][xx] && c === mod[yy + 1][xx + 1]) res += 3;
      }
      for (yy = 0; yy < size; yy++) for (xx = 0; xx < size; xx++) if (mod[yy][xx]) dark++;
      var total = size * size;
      res += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return res;
    }
    var best = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m);
      format(m);
      var sc = penalty();
      if (sc < bestScore) { bestScore = sc; best = m; }
      applyMask(m);   /* 되돌린다(XOR) */
    }
    applyMask(best);
    format(best);

    return {
      version: ver, size: size, level: level, mask: best, text: String(text),
      dark: function (x, y) { return x >= 0 && y >= 0 && x < size && y < size && mod[y][x]; }
    };
  }

  /* SVG — 흰 바탕 · 검은 칸 · 여백 border 칸(표준 최소 4). 반전(검은 바탕) QR 은 만들지 않는다:
     휴대폰 카메라 일부가 못 읽는다 */
  function svg(q, border, px) {
    border = border == null ? 4 : border;
    var n = q.size + border * 2, d = [];
    for (var y = 0; y < q.size; y++) {
      for (var x = 0; x < q.size; x++) {
        if (q.dark(x, y)) d.push("M" + (x + border) + "," + (y + border) + "h1v1h-1z");
      }
    }
    var wh = px ? ' width="' + px + '" height="' + px + '"' : "";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + " " + n + '"' + wh +
      ' shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="100%" height="100%" fill="#FFFFFF"/>' +
      '<path d="' + d.join("") + '" fill="#000000"/></svg>';
  }

  /* 캔버스(PNG 내려받기용) — 정확히 px×px. 칸 크기는 정수로 맞춰(흐린 가장자리 없게) 가운데 두고,
     남는 몇 px 은 흰 여백에 더한다(여백이 표준 4칸보다 조금 넓어질 뿐이다) */
  function canvas(q, px, border) {
    border = border == null ? 4 : border;
    var n = q.size + border * 2, cell = Math.max(1, Math.floor(px / n)), side = Math.max(px, cell * n);
    var off = Math.floor((side - cell * n) / 2) + border * cell;
    var c = document.createElement("canvas");
    c.width = c.height = side;
    var g = c.getContext("2d");
    g.fillStyle = "#FFFFFF";
    g.fillRect(0, 0, side, side);
    g.fillStyle = "#000000";
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) {
      if (q.dark(x, y)) g.fillRect(off + x * cell, off + y * cell, cell, cell);
    }
    return c;
  }

  window.INSOONI_QR = { make: make, svg: svg, canvas: canvas };
})();
