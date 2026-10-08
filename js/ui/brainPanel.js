/* 초파리 머릿속 패널: ① 상태 ② 케년세포 ③ 가치(치고 싶은 건반) ④ 도파민 (docs/01_디자인_UI.md 4.7) */
(function () {
  'use strict';
  var FP = window.FlyPiano = window.FlyPiano || {};
  var $ = function (id) { return document.getElementById(id); };

  var GRID_COLS = 20, GRID_ROWS = 10; // KC 2,000개 중 앞 200개만 그림

  var TERMS = [
    ['환경', '악보와 피아노', '바깥 세상'],
    ['상태', '지금 몇 소절 · 몇 번째 박인지 + 방금 들린 음', '감각 입력 (투사뉴런, PN)'],
    ['행동', '8개 건반 중 하나 누르기', '출력 뉴런(MBON)이 고른 행동'],
    ['보상', '맞으면 설탕 +1, 틀리면 찌릿 −1', '설탕 / 전기 자극'],
    ['가치 (예상 보상)', '"이 건반 치면 좋을 것 같은 정도" 막대 (③)', 'MBON 활동 세기'],
    ['예측오차', '실제 보상 − 예상 보상 (④)', '도파민 뉴런(DAN)의 발화'],
    ['정책', '막대 값으로 확률을 정해 건반 고르기 (softmax)', '—'],
    ['에피소드', '연주 한 번 (3번 틀리면 퇴장)', '—'],
    ['학습', '켜진 케년세포 → 고른 건반 연결을 도파민만큼 조정', '도파민이 KC→MBON 시냅스 세기를 바꿈']
  ];

  function fmt(x) {
    var s = Math.abs(x).toFixed(2);
    return (x > 0.004 ? '+' : x < -0.004 ? '−' : '') + s;
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  var BP = { cfg: { nKC: 2000, k: 100, beta: 6 }, last: null };

  BP.init = function () {
    var html = '<tr><th>강화학습</th><th>데모에서</th><th>초파리 뇌에서</th></tr>' +
      TERMS.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>'; }).join('');
    $('termTable').innerHTML = html;
    $('termTable2').innerHTML = html;
    $('termToggle').addEventListener('click', function () { $('termPop').classList.add('open'); });
    $('termClose').addEventListener('click', function () { $('termPop').classList.remove('open'); });

    var vb = $('vbars');
    vb.innerHTML = '';
    BP.cols = FP.KEY_NAMES.map(function (name, i) {
      var col = document.createElement('div');
      col.className = 'vcol';
      col.innerHTML = '<div class="vname">' + FP.KEY_SHORT[i] + (i === 7 ? '↑' : '') + '</div>' +
        '<div class="vtrack"><div class="vbar"></div></div>' +
        '<div class="vprob">–</div>';
      vb.appendChild(col);
      return { col: col, name: col.querySelector('.vname'), bar: col.querySelector('.vbar'), prob: col.querySelector('.vprob') };
    });

    BP.kcCanvas = $('kcCanvas');
    if (window.ResizeObserver) new ResizeObserver(function () { BP.drawKC(BP.last ? BP.last.activeKCs : null); }).observe(BP.kcCanvas.parentNode);
    else window.addEventListener('resize', function () { BP.drawKC(BP.last ? BP.last.activeKCs : null); });
    BP.clear();
  };

  BP.setConfig = function (cfg) {
    BP.cfg = { nKC: cfg.nKC, k: cfg.k, beta: cfg.beta };
    var n = cfg.nKC.toLocaleString('ko-KR');
    var shown = Math.min(GRID_COLS * GRID_ROWS, cfg.nKC);
    $('kcSub').textContent = '(' + n + '개 중 ' + shown + '개만 그림)';
    $('kcCap').textContent = n + '개 중 약 ' + cfg.k + '개만 켜져요 — 상황마다 켜지는 세포가 달라요';
  };

  BP.setMode = function (mode) {
    BP.mode = mode;
    $('bpMode').textContent = mode === 'practice' ? '연습 중 — 배우는 중' :
      mode === 'concert' ? '연주회 — 배우지 않음' : '대기 중';
  };

  BP.highlight = function (on) { $('brainPanel').classList.toggle('highlight', !!on); };

  BP.clear = function () {
    BP.last = null;
    $('bpState').innerHTML = '<span class="dim">연습을 시작하면 보여요</span>';
    BP.cols.forEach(function (c) {
      c.col.classList.remove('chosen');
      c.name.classList.remove('target-mark');
      c.bar.style.height = '0';
      c.bar.className = 'vbar';
      c.prob.textContent = '–';
      c.prob.className = 'vprob';
    });
    $('dopaBar').style.height = '0';
    $('dopa').classList.remove('resting');
    $('dopaText').innerHTML = '<span class="note">맞으면 설탕(+1), 틀리면 찌릿(−1)</span>' +
      '<span class="note">놀람 = 실제 − 예상</span>';
    BP.drawKC(null);
    BP.setMode('idle');
  };

  BP.drawKC = function (active) {
    var cv = BP.kcCanvas;
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var cell = Math.min(w / GRID_COLS, h / GRID_ROWS);
    var r = cell * 0.33;
    var ox = (w - cell * GRID_COLS) / 2, oy = (h - cell * GRID_ROWS) / 2;
    var on = {};
    if (active) for (var j = 0; j < active.length; j++) if (active[j] < GRID_COLS * GRID_ROWS) on[active[j]] = 1;
    var cOff = cssVar('--kc-off'), cOn = cssVar('--kc-on');
    var n = Math.min(GRID_COLS * GRID_ROWS, BP.cfg.nKC);
    for (var i = 0; i < n; i++) {
      var x = ox + (i % GRID_COLS + 0.5) * cell, y = oy + (Math.floor(i / GRID_COLS) + 0.5) * cell;
      ctx.beginPath();
      if (on[i]) {
        ctx.fillStyle = cOn;
        ctx.shadowColor = cOn;
        ctx.shadowBlur = cell * 0.8;
        ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
      } else {
        ctx.fillStyle = cOff;
        ctx.shadowBlur = 0;
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  };

  // 한 음마다 패널 갱신. step은 trainer가 내보내는 이벤트 (docs/02_기능.md 4장)
  BP.show = function (step, mode) {
    BP.last = step;
    var o = step.obs;
    var prev = o.prevNote === 8 ? '없음 (첫 음)' : FP.KEY_NAMES[o.prevNote];
    $('bpState').innerHTML = (o.phrase + 1) + '소절 · ' + (o.beat + 1) + '번째 박 <span class="dim">· 방금 들린 음:</span> ' + prev;

    BP.drawKC(step.activeKCs);

    var V = step.values;
    var p = FP.MushroomBody.prototype.probs.call({ beta: BP.cfg.beta }, V);
    BP.cols.forEach(function (c, a) {
      var v = Math.max(-1, Math.min(1, V[a]));
      c.bar.className = 'vbar ' + (v >= 0 ? 'pos' : 'neg');
      c.bar.style.height = (Math.abs(v) * 50).toFixed(1) + '%';
      c.col.classList.toggle('chosen', a === step.action);
      c.name.classList.toggle('target-mark', !step.correct && a === step.target);
      if (a === step.action) {
        c.prob.innerHTML = '<span class="vres ' + (step.correct ? 'ok' : 'ng') + '">' + (step.correct ? '✓' : '✗') + '</span> ' + Math.round(p[a] * 100) + '%';
      } else {
        c.prob.textContent = Math.round(p[a] * 100) + '%';
      }
    });

    var d = step.dopamine, bar = $('dopaBar');
    bar.className = 'dopa-bar ' + (d >= 0 ? 'pos' : 'neg');
    // |δ| = 1.25 이상이면 끝까지 (보통 |δ|는 0 ~ 1.2)
    bar.style.height = (Math.min(Math.abs(d), 1.25) / 1.25 * 50).toFixed(1) + '%';
    var real = step.reward > 0 ? '설탕 +1' : '찌릿 −1';
    var cls = d >= 0 ? 'pos' : 'neg';
    var words = Math.abs(d) < 0.1 ? '(예상대로라 거의 안 놀람)' : d > 0 ? '(예상보다 좋았다!)' : '(예상보다 나빴다…)';
    $('dopa').classList.toggle('resting', mode === 'concert');
    $('dopaText').innerHTML =
      '<span>예상 <b>' + fmt(step.prediction) + '</b> → 실제 <b>' + real + '</b></span>' +
      '<span class="big ' + cls + '">놀람 ' + fmt(d) + ' <small style="font-weight:400;font-size:0.75rem">' + words + '</small></span>' +
      (mode === 'concert' ? '<span class="note">연주회에서는 배우지 않아요 (계산만 보여줌)</span>' : '<span class="note">이만큼 연결을 고쳐요</span>');
  };

  FP.brainPanel = BP;
})();
