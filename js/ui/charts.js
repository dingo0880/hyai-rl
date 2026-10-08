/* 그래프 3개 (Canvas): 학습 곡선, 놀람(도파민) 곡선, 성장 지도 + 비교 곡선 (docs/01_디자인_UI.md 4.9) */
(function () {
  'use strict';
  var FP = window.FlyPiano = window.FlyPiano || {};

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function rem() {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  }

  function fit(cv) {
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return null;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function movingAvg(xs, n) {
    var out = [], sum = 0;
    for (var i = 0; i < xs.length; i++) {
      sum += xs[i];
      if (i >= n) sum -= xs[i - n];
      out.push(sum / Math.min(i + 1, n));
    }
    return out;
  }

  function niceMax(n) { return Math.max(50, Math.ceil(n / 50) * 50); }

  function emptyText(g, text, fs) {
    g.ctx.fillStyle = cssVar('--text-dim');
    g.ctx.font = fs + 'px ' + cssVar('--font');
    g.ctx.textAlign = 'center';
    g.ctx.textBaseline = 'middle';
    g.ctx.fillText(text, g.w / 2, g.h / 2);
  }

  /* 공통 선 그래프
   * series: [{ ys: [], color, dots: bool }], yMax, yTicks, xMax */
  function lineChart(cv, opt) {
    var g = fit(cv);
    if (!g) return;
    var ctx = g.ctx, R = rem();
    var fs = Math.round(R * (opt.big ? 0.8 : 0.66));
    var font = cssVar('--font');
    var pad = { l: fs * 2.6, r: fs * 0.6, t: fs * (opt.flags ? 1.3 : 0.6), b: fs * 1.5 };
    var pw = g.w - pad.l - pad.r, ph = g.h - pad.t - pad.b;
    var n = opt.n;
    var xMax = opt.xMax || niceMax(n);
    var X = function (ep) { return pad.l + (ep / xMax) * pw; };
    var Y = function (v) { return pad.t + ph - (Math.min(v, opt.yMax) / opt.yMax) * ph; };

    // 격자 + 눈금
    ctx.lineWidth = 2;
    ctx.strokeStyle = cssVar('--chart-grid');
    ctx.fillStyle = cssVar('--text-dim');
    ctx.font = fs + 'px ' + font;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    opt.yTicks.forEach(function (t) {
      ctx.beginPath(); ctx.moveTo(pad.l, Y(t[0])); ctx.lineTo(pad.l + pw, Y(t[0])); ctx.stroke();
      ctx.fillText(t[1], pad.l - fs * 0.35, Y(t[0]));
    });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var step = xMax <= 100 ? 25 : xMax <= 300 ? 50 : xMax <= 600 ? 100 : 200;
    for (var e = 0; e <= xMax; e += step) {
      var last = e + step > xMax;
      ctx.textAlign = last ? 'right' : 'center';
      ctx.fillText(last ? e + '회' : String(e), last ? X(e) + fs * 0.5 : X(e), pad.t + ph + fs * 0.25);
    }

    if (!n) { emptyText(g, opt.empty || '아직 연습 기록이 없어요', fs); return; }

    // 연습 일지 깃발
    if (opt.flags) {
      var fc = cssVar('--correct');
      opt.flags.forEach(function (ep) {
        if (ep <= 0 || ep > xMax) return;
        var x = X(ep), top = pad.t - fs * 1.1;
        ctx.strokeStyle = fc; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, top + fs * 1.0); ctx.stroke();
        ctx.fillStyle = fc;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + fs * 0.6, top + fs * 0.25); ctx.lineTo(x, top + fs * 0.5); ctx.closePath(); ctx.fill();
        if (opt.big) {
          ctx.save(); ctx.globalAlpha = 0.25; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ph); ctx.stroke();
          ctx.restore();
        }
      });
    }

    opt.series.forEach(function (s) {
      var ys = s.ys;
      if (s.dots) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = s.dotColor || s.color;
        var r = ys.length > 150 ? 1.6 : 2.4;
        if (opt.big) r += 0.8;
        for (var i = 0; i < ys.length; i++) {
          ctx.beginPath(); ctx.arc(X(i + 1), Y(ys[i]), r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
      var ma = s.ma || movingAvg(ys, 10);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = opt.big ? 4 : 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var j = 0; j < ma.length; j++) {
        if (j === 0) ctx.moveTo(X(j + 1), Y(ma[j])); else ctx.lineTo(X(j + 1), Y(ma[j]));
      }
      ctx.stroke();
    });
  }

  var C = {};

  // 학습 곡선: x = 연습 회차, y = 도달한 음 수 (0~42)
  C.drawLearning = function (cv, history, opts) {
    opts = opts || {};
    var ys = history.map(function (h) { return h.reached; });
    lineChart(cv, {
      big: opts.big, n: ys.length,
      yMax: 42, yTicks: [[0, '0'], [21, '21'], [42, '42음']],
      flags: FP.SNAPSHOTS.map(function (s) { return s.ep; }),
      series: [{ ys: ys, color: cssVar('--accent'), dotColor: cssVar('--text-dim'), dots: true }]
    });
  };

  // 놀람 곡선: x = 연습 회차, y = 평균 |도파민|
  C.drawSurprise = function (cv, history, opts) {
    opts = opts || {};
    var ys = history.map(function (h) { return h.meanAbsDelta; });
    var mx = Math.max(1, ys.reduce(function (m, v) { return Math.max(m, v); }, 0));
    lineChart(cv, {
      big: opts.big, n: ys.length,
      yMax: mx, yTicks: [[0, '0'], [0.5, '0.5'], [1, '1']],
      series: [{ ys: ys, color: cssVar('--dopamine-pos'), dotColor: cssVar('--text-dim'), dots: true }]
    });
  };

  // 대치동 vs 산골: 두 선
  C.drawCompare = function (cv, histA, histB) {
    var a = histA.map(function (h) { return h.reached; });
    var b = histB.map(function (h) { return h.reached; });
    lineChart(cv, {
      big: true, n: Math.max(a.length, b.length),
      yMax: 42, yTicks: [[0, '0'], [21, '21'], [42, '42음']],
      empty: '"둘 다 ×10"을 눌러 연습시켜 보세요',
      series: [
        { ys: a, color: cssVar('--accent'), dots: false },
        { ys: b, color: cssVar('--sparse'), dots: false }
      ]
    });
  };

  /* 성장 지도: 행 7개(연습 일지) × 열 42개(음)
   * rows: [{ ep, name, results: (Uint8Array|Int8Array|null) }]  results[t]: 1 맞음, 0 틀림, -1 아직
   * opts: { big, highlight: ep } */
  C.drawGrowth = function (cv, rows, opts) {
    opts = opts || {};
    var g = fit(cv);
    if (!g) return;
    var ctx = g.ctx, R = rem();
    var fs = Math.round(R * (opts.big ? 0.8 : 0.62));
    var font = cssVar('--font');
    ctx.font = (opts.big ? 'bold ' : '') + fs + 'px ' + font;
    // 가장 긴 행 이름에 맞춰 왼쪽 칸 너비를 정한다
    var labelW = rows.reduce(function (m, row) {
      return Math.max(m, ctx.measureText(opts.big ? row.ep + '회 · ' + row.name : row.ep + '회').width);
    }, 0) + fs * 0.9;
    var top = opts.big ? fs * 1.5 : 0;
    var nCols = 42, gap = 1, phraseGap = opts.big ? 6 : 3;
    var gridW = g.w - labelW - 4;
    var cellW = (gridW - gap * (nCols - 1) - phraseGap * 5) / nCols;
    var rowH = (g.h - top) / rows.length;
    var cellH = Math.max(2, rowH - (opts.big ? 4 : 2));
    var colX = function (t) { return labelW + t * (cellW + gap) + Math.floor(t / 7) * phraseGap; };

    var cEmpty = cssVar('--cell-empty'), cOk = cssVar('--correct'), cNg = cssVar('--wrong');
    var cInk = cssVar('--ink'), cText = cssVar('--text'), cDim = cssVar('--text-dim'), cAcc = cssVar('--accent');

    if (opts.big) {
      ctx.fillStyle = cDim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var p = 0; p < 6; p++) {
        var x0 = colX(p * 7), x1 = colX(p * 7 + 6) + cellW;
        ctx.fillText((p + 1) + '소절', (x0 + x1) / 2, top / 2);
      }
    }

    rows.forEach(function (row, r) {
      var y = top + r * rowH + (rowH - cellH) / 2;
      ctx.fillStyle = row.results ? cText : cDim;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = (opts.big ? 'bold ' : '') + fs + 'px ' + font;
      var label = opts.big ? row.ep + '회 · ' + row.name : row.ep + '회';
      ctx.fillText(label, labelW - fs * 0.4, y + cellH / 2);

      var correct = 0, heard = 0;
      for (var t = 0; t < nCols; t++) {
        var v = row.results ? row.results[t] : -1;
        if (v === undefined || v === null) v = -1;
        ctx.fillStyle = v === 1 ? cOk : v === 0 ? cNg : cEmpty;
        var x = colX(t);
        ctx.fillRect(x, y, cellW, cellH);
        if (v >= 0) { heard++; correct += v; }
        // 색만으로 구분하지 않도록 칸이 크면 ✓ / ✗
        if (v >= 0 && cellW >= 11 && cellH >= 11) {
          ctx.fillStyle = cInk;
          ctx.textAlign = 'center';
          ctx.font = 'bold ' + Math.floor(Math.min(cellW, cellH) * 0.7) + 'px ' + font;
          ctx.fillText(v === 1 ? '✓' : '✗', x + cellW / 2, y + cellH / 2 + 1);
        }
      }
      if (opts.highlight === row.ep) {
        ctx.strokeStyle = cAcc;
        ctx.lineWidth = 3;
        ctx.strokeRect(labelW - 2, y - 2, colX(nCols - 1) + cellW - labelW + 4, cellH + 4);
      }
    });
  };

  C.fit = fit;
  C.movingAvg = movingAvg;
  FP.charts = C;
})();
