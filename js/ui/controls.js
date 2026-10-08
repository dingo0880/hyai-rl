/* 버튼 · 연습 일지 칩 · 단축키 · 팝업 · 설정 패널 · 발표 모드 · 대치동 vs 산골 (docs/02_기능.md 9~11장) */
(function () {
  'use strict';
  var FP = window.FlyPiano = window.FlyPiano || {};
  var $ = function (id) { return document.getElementById(id); };

  var App, S, BP, CH, A, ev;

  // ---------- 팝업 ----------
  var MODALS = ['modalInfo', 'modalHelp', 'modalSettings', 'modalConfirm', 'modalCharts', 'modalCompare'];
  function openModal(id) {
    $(id).classList.add('open');
    if (id === 'modalCharts') requestAnimationFrame(function () { App.drawBigCharts(); });
    if (id === 'modalCompare') requestAnimationFrame(function () { cmpDraw(); });
  }
  function closeModal(id) {
    $(id).classList.remove('open');
    if (id === 'modalCompare') cmpStop();
  }
  function topModal() {
    for (var i = MODALS.length - 1; i >= 0; i--) if ($(MODALS[i]).classList.contains('open')) return MODALS[i];
    return null;
  }

  var confirmCb = null;
  function confirmBox(title, text, onYes, onNo, yesLabel) {
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    $('confirmYes').textContent = yesLabel || '네';
    confirmCb = { yes: onYes, no: onNo };
    openModal('modalConfirm');
  }

  // ---------- 행동 (결과 카드가 떠 있으면 닫고 진행) ----------
  function act(fn) {
    if (App.state === 'concertResult') App.closeCard();
    if (App.busy()) return;
    fn();
  }

  function askReset() {
    act(function () {
      confirmBox('처음부터 다시 할까요?', '지금까지의 연습과 연습 일지가 모두 지워지고, 갓 태어난 초파리로 돌아가요.',
        function () { App.resetAll(); }, null, '네, 처음부터');
    });
  }

  // ---------- 연습 일지 칩 ----------
  function buildChips() {
    var box = $('chips');
    box.innerHTML = '';
    FP.SNAPSHOTS.forEach(function (s, i) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.dataset.ep = s.ep;
      b.setAttribute('data-tip', s.ep + '회 · ' + s.name + '  (단축키 ' + (i + 1) + ')');
      b.addEventListener('click', function () { act(function () { App.playChip(s.ep); }); });
      box.appendChild(b);
    });
    updateChips();
  }
  function updateChips() {
    var ep = App.trainer ? App.trainer.episode : 0;
    Array.prototype.forEach.call($('chips').children, function (b) {
      var e = +b.dataset.ep;
      var reached = ep >= e;
      b.classList.toggle('reached', reached);
      b.classList.toggle('heard', !!App.growth[e]);
      b.textContent = (reached ? '' : '⏩ ') + e + '회';
    });
  }

  function updateButtons() {
    var busy = App.busy() && App.state !== 'concertResult';
    ['btnLive', 'btnX10', 'btnX100', 'btnConcert', 'btnReset', 'btnTimelapse', 'btnSettings', 'btnCompare'].forEach(function (id) {
      $(id).disabled = busy;
    });
    Array.prototype.forEach.call($('chips').children, function (b) { b.disabled = busy; });
  }

  // ---------- 설정 패널 ----------
  var FIELDS = [
    { key: 'seed', label: '시드', type: 'int', min: 0, max: 999999, hint: '같은 시드면 항상 같은 결과' },
    { key: 'alpha', label: '학습률 α', type: 'num', min: 0.1, max: 0.5, step: 0.05, hint: '한 번에 얼마나 고칠지 (0.1 ~ 0.5)' },
    { key: 'beta', label: '결단력 β', type: 'num', min: 3, max: 8, step: 0.5, hint: '클수록 확신 있게 고름 (3 ~ 8)' },
    { key: 'nKC', label: '케년세포 수', type: 'int', min: 500, max: 4000, step: 100, hint: '500 ~ 4,000' },
    { key: 'ratio', label: '켜지는 비율 (%)', type: 'pct', min: 2, max: 10, step: 1, hint: '2 ~ 10%' },
    { key: 'maxMistakes', label: '실수 제한', type: 'int', min: 1, max: 10, hint: '연습 때 몇 번 틀리면 퇴장 (1 ~ 10)' },
    { key: 'liveBpm', label: '라이브 연습 속도 (BPM)', type: 'int', min: 60, max: 140, step: 5, hint: '60 ~ 140' },
    { key: 'greedy', label: '연주회 실수 없는 모드', type: 'bool', hint: '가장 큰 막대만 고름 (발표 기본값은 끔)' },
    { key: 'timelapse', label: '타임랩스 길이', type: 'select', options: [['full', '전곡 2배속 (약 2분)'], ['short', '앞뒤 1소절씩 2배속 (약 40초)']] },
    { key: 'compare', label: '대치동 vs 산골 모드 표시', type: 'bool', hint: '발표 모드 7단계도 켜짐' },
    { key: 'wrongDetune', label: '삑사리 디튠', type: 'bool', hint: '틀린 음을 살짝 낮게 (−25 cents)' },
    { key: 'metronome', label: '메트로놈', type: 'bool', hint: '라이브 연습 때 박자 소리' }
  ];
  var LEARN_KEYS = ['seed', 'alpha', 'beta', 'nKC', 'ratio', 'maxMistakes'];

  function buildSettings(values) {
    var g = $('settingsGrid');
    g.innerHTML = '';
    FIELDS.forEach(function (f) {
      var lab = document.createElement('label');
      lab.textContent = f.label;
      lab.htmlFor = 'set_' + f.key;
      var input;
      if (f.type === 'bool') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!values[f.key];
      } else if (f.type === 'select') {
        input = document.createElement('select');
        f.options.forEach(function (o) {
          var op = document.createElement('option');
          op.value = o[0]; op.textContent = o[1];
          input.appendChild(op);
        });
        input.value = values[f.key];
      } else {
        input = document.createElement('input');
        input.type = 'number';
        input.min = f.min; input.max = f.max;
        if (f.step) input.step = f.step;
        input.value = f.type === 'pct' ? Math.round(values[f.key] * 100) : values[f.key];
      }
      input.id = 'set_' + f.key;
      var hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = (LEARN_KEYS.indexOf(f.key) >= 0 ? '🔁 ' : '') + (f.hint || '');
      g.appendChild(lab); g.appendChild(input); g.appendChild(hint);
    });
  }

  function readSettings() {
    var out = {};
    FIELDS.forEach(function (f) {
      var el = $('set_' + f.key);
      if (f.type === 'bool') out[f.key] = el.checked;
      else if (f.type === 'select') out[f.key] = el.value;
      else {
        var v = parseFloat(el.value);
        if (!isFinite(v)) v = f.type === 'pct' ? App.settings[f.key] * 100 : App.settings[f.key];
        v = Math.max(f.min, Math.min(f.max, v));
        if (f.type === 'int') v = Math.round(v);
        if (f.type === 'pct') v = Math.round(v) / 100;
        out[f.key] = v;
      }
    });
    return out;
  }

  function applySettingsFromPanel() {
    var next = readSettings();
    var learnChanged = LEARN_KEYS.some(function (k) { return next[k] !== App.settings[k]; });
    if (!learnChanged) {
      App.applySettings(next);
      closeModal('modalSettings');
      return;
    }
    closeModal('modalSettings');
    confirmBox('학습 설정이 바뀌었어요', '시드 · 학습률 · 결단력 · 케년세포 · 실수 제한을 바꾸면 처음부터 다시 연습해요. 진행할까요?',
      function () { App.applySettings(next); App.resetAll(); },
      function () {
        // 학습 설정은 그대로 두고 나머지만 적용
        LEARN_KEYS.forEach(function (k) { next[k] = App.settings[k]; });
        App.applySettings(next);
      }, '네, 처음부터');
  }

  // ---------- 대치동 vs 산골 (Phase 6) ----------
  var Cmp = { dense: null, sparse: null, running: false, stop: false };

  function cmpReset() {
    var cfg = App.trainerCfg();
    Cmp.dense = new FP.Trainer(cfg, App.settings.seed);
    Cmp.sparse = new FP.Trainer(Object.assign({}, cfg, { mode: 'sparse' }), App.settings.seed);
    cmpDraw();
  }
  function cmpRow(el, results) {
    if (el.children.length !== 42) {
      el.innerHTML = '';
      for (var i = 0; i < 42; i++) el.appendChild(document.createElement('span'));
    }
    for (var t = 0; t < 42; t++) el.children[t].className = results ? (results[t] ? 'ok' : 'ng') : '';
  }
  function cmpDraw() {
    if (!Cmp.dense) cmpReset();
    [['dense', 'statDense', 'rowDense'], ['sparse', 'statSparse', 'rowSparse']].forEach(function (x) {
      var tr = Cmp[x[0]];
      var r = tr.concert(null, FP.Trainer.concertSeed(tr.episode), { greedy: App.settings.greedy });
      $(x[1]).textContent = '연습 ' + tr.episode + '회 · 연주회 ' + r.correct + ' / 42음 (' + Math.round(r.accuracy * 100) + '%)';
      cmpRow($(x[2]), tr.episode > 0 ? r.results : null);
    });
    CH.drawCompare($('cvCompare'), Cmp.dense.history, Cmp.sparse.history);
  }
  async function cmpTrain(n) {
    if (Cmp.running) return;
    if (!Cmp.dense) cmpReset();
    Cmp.running = true;
    Cmp.stop = false;
    var target = Cmp.dense.episode + n;
    while (Cmp.dense.episode < target && !Cmp.stop) {
      var k = Math.min(5, target - Cmp.dense.episode);
      Cmp.dense.train(k);
      Cmp.sparse.train(k);
      cmpDraw();
      await new Promise(function (r) { requestAnimationFrame(function () { r(); }); });
    }
    Cmp.running = false;
    if (!Cmp.stop) FP.sfx.fastDone();
  }
  function cmpStop() { Cmp.stop = true; }
  function openCompare(autoRun) {
    if (!Cmp.dense || autoRun) cmpReset();
    openModal('modalCompare');
    if (autoRun) setTimeout(function () { cmpTrain(300); }, 600);
  }

  // ---------- 발표 모드 ----------
  var Pres = { on: false, i: 0, steps: [] };

  function presSteps() {
    var steps = [
      { n: 1, run: function () { App.resetAll(); S.showCaption('오늘의 연주자: 초파리 🪰<small>(연습 0회)</small>'); },
        leave: function () { S.hideCaption(); } },
      { n: 2, run: function () { App.playChip(0); } },
      { n: 3, run: function () { BP.highlight(true); App.practiceLive({ bpm: 70 }); },
        leave: function () { BP.highlight(false); } },
      { n: 4, run: function () { App.playChip(15); } },
      { n: 5, run: function () { openModal('modalCharts'); }, leave: function () { closeModal('modalCharts'); } },
      { n: 6, run: function () { App.playChip(80); } },
      { n: 6, run: function () { App.playChip(300); } }
    ];
    if (App.settings.compare) {
      steps.push({ n: 7, run: function () { openCompare(true); }, leave: function () { closeModal('modalCompare'); } });
    }
    return steps;
  }
  function presBadge() {
    var b = $('presBadge');
    b.hidden = !Pres.on;
    if (Pres.on) {
      var total = Pres.steps[Pres.steps.length - 1].n;
      b.textContent = '발표 모드 ' + Pres.steps[Pres.i].n + ' / ' + total + '  (→ 다음)';
    }
  }
  function presLeave() {
    var st = Pres.steps[Pres.i];
    if (st && st.leave) st.leave();
  }
  function presRun() {
    presBadge();
    Pres.steps[Pres.i].run();
  }
  function presStart() {
    Pres.on = true;
    Pres.steps = presSteps();
    Pres.i = 0;
    MODALS.forEach(closeModal);
    if (App.token) App.abort();
    presRun();
  }
  function presEnd() {
    presLeave();
    Pres.on = false;
    presBadge();
  }
  function presNext() {
    if (!Pres.on) return;
    if (App.busy() && App.state !== 'concertResult') return; // 진행 중이면 기다림 (ESC로 멈출 수 있음)
    if (Cmp.running) return;
    presLeave();
    if (App.state === 'concertResult') App.closeCard();
    if (Pres.i + 1 >= Pres.steps.length) {
      Pres.on = false;
      presBadge();
      S.showCaption('발표 끝! 감사합니다 🎵');
      setTimeout(function () { S.hideCaption(); }, 2000);
      return;
    }
    Pres.i++;
    presRun();
  }
  function presPrev() {
    if (!Pres.on) return;
    presLeave();
    if (App.token) App.abort();
    cmpStop();
    Pres.i = Math.max(0, Pres.i - 1);
    presRun();
  }

  // ---------- 소리 · 전체화면 ----------
  function unlockAudio() {
    A.init();
    $('soundGate').classList.remove('open');
  }
  function toggleMute() {
    A.setMuted(!A.muted);
    $('btnMute').textContent = A.muted ? '🔇' : '🔊';
  }
  function toggleFull() {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    } catch (e) { /* 전체화면을 못 써도 계속 */ }
  }

  // ---------- 단축키 (e.code 기준: 한글 입력 상태에서도 동작) ----------
  function onKey(e) {
    var tag = (e.target && e.target.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if ($('soundGate').classList.contains('open')) unlockAudio();
    else A.init();

    var code = e.code;
    var modal = topModal();

    if (code === 'Escape') {
      e.preventDefault();
      if ($('termPop').classList.contains('open')) { $('termPop').classList.remove('open'); return; }
      if (modal) { closeModal(modal); return; }
      if (App.state === 'concertResult') { App.closeCard(); return; }
      App.abort();
      cmpStop();
      return;
    }
    if (typing) return;
    if (e.repeat && code !== 'ArrowRight' && code !== 'ArrowLeft') return;

    if (code === 'KeyM') { toggleMute(); return; }
    if (code === 'KeyF') { toggleFull(); return; }
    if (code === 'KeyP') { if (Pres.on) presEnd(); else presStart(); return; }
    if (code === 'ArrowRight') { e.preventDefault(); presNext(); return; }
    if (code === 'ArrowLeft') { e.preventDefault(); presPrev(); return; }
    if (code === 'KeyG') {
      if (modal === 'modalCharts') closeModal('modalCharts');
      else if (!modal) openModal('modalCharts');
      return;
    }
    if (modal) {
      if (modal === 'modalConfirm' && code === 'Enter') { e.preventDefault(); $('confirmYes').click(); }
      return;
    }
    if (code === 'Enter' && App.state === 'concertResult') { e.preventDefault(); App.closeCard(); return; }

    var digit = /^(Digit|Numpad)([1-7])$/.exec(code);
    if (digit) {
      var snap = FP.SNAPSHOTS[+digit[2] - 1];
      act(function () { App.playChip(snap.ep); });
      return;
    }
    switch (code) {
      case 'Space': e.preventDefault(); act(function () { App.practiceLive(); }); break;
      case 'KeyC': act(function () { App.openConcert(); }); break;
      case 'KeyT': act(function () { App.timelapse(); }); break;
      case 'KeyS': act(function () { buildSettings(App.settings); openModal('modalSettings'); }); break;
      case 'KeyR': askReset(); break;
      case 'Slash': if (e.shiftKey) openModal('modalHelp'); break;
      default:
        if (e.key === '?') openModal('modalHelp');
    }
  }

  // ---------- 시작 ----------
  function init(app) {
    App = app;
    S = FP.stage; BP = FP.brainPanel; CH = FP.charts; A = FP.audio; ev = FP.events;

    // 소리 켜기 (첫 클릭)
    $('soundGate').addEventListener('click', unlockAudio);
    document.addEventListener('pointerdown', function () { A.init(); }, true);

    $('btnLive').addEventListener('click', function () { act(function () { App.practiceLive(); }); });
    $('btnX10').addEventListener('click', function () { act(function () { App.practiceFast(10); }); });
    $('btnX100').addEventListener('click', function () { act(function () { App.practiceFast(100); }); });
    $('btnConcert').addEventListener('click', function () { act(function () { App.openConcert(); }); });
    $('btnReset').addEventListener('click', askReset);
    $('btnTimelapse').addEventListener('click', function () { act(function () { App.timelapse(); }); });
    $('btnSettings').addEventListener('click', function () { act(function () { buildSettings(App.settings); openModal('modalSettings'); }); });
    $('btnCompare').addEventListener('click', function () { act(function () { openCompare(false); }); });
    $('rcClose').addEventListener('click', function () { App.closeCard(); });
    $('growthCard').addEventListener('click', function () { openModal('modalCharts'); });
    $('btnInfo').addEventListener('click', function () { openModal('modalInfo'); });
    $('btnHelp').addEventListener('click', function () { openModal('modalHelp'); });
    $('btnMute').addEventListener('click', toggleMute);
    $('btnFull').addEventListener('click', toggleFull);

    $('btnApplySettings').addEventListener('click', applySettingsFromPanel);
    $('btnDefaults').addEventListener('click', function () { buildSettings(App.defaults()); });
    $('btnRefMelody').addEventListener('click', function () { closeModal('modalSettings'); act(function () { App.playReference(); }); });

    $('confirmYes').addEventListener('click', function () {
      var cb = confirmCb; confirmCb = null;
      closeModal('modalConfirm');
      if (cb && cb.yes) cb.yes();
    });

    $('cmpReset').addEventListener('click', function () { cmpStop(); setTimeout(cmpReset, 30); });
    $('cmpX10').addEventListener('click', function () { cmpTrain(10); });
    $('cmpX100').addEventListener('click', function () { cmpTrain(100); });

    // 닫기 버튼 · 바깥 클릭
    MODALS.forEach(function (id) {
      var m = $(id);
      m.addEventListener('click', function (e) {
        if (e.target === m || (e.target.hasAttribute && e.target.hasAttribute('data-close'))) {
          if (id === 'modalConfirm' && confirmCb && confirmCb.no) { var cb = confirmCb; confirmCb = null; cb.no(); }
          closeModal(id);
        }
      });
    });

    // 피아노 직접 눌러보기 (학습에는 영향 없음)
    S.keyEls.forEach(function (k, i) {
      k.addEventListener('click', function () { if (!App.busy()) App.humanKey(i); });
    });

    // 버튼에 남은 포커스 때문에 Space가 버튼을 다시 누르지 않게
    document.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'BUTTON') e.target.blur();
    });

    // 비교 화면 초파리
    $('flyDense').innerHTML = S.makeFlySVG();
    $('flySparse').innerHTML = S.makeFlySVG();

    document.addEventListener('keydown', onKey);
    ev.on('state', updateButtons);
    ev.on('trained', updateChips);
    ev.on('concertEnd', updateChips);
    ev.on('reset', function () { updateChips(); Cmp.dense = null; });
    ev.on('settings', function (s) { $('btnCompare').hidden = !s.compare; });

    $('btnCompare').hidden = !App.settings.compare;
    $('btnMute').textContent = A.muted ? '🔇' : '🔊';
    buildChips();
    updateButtons();
  }

  FP.controls = { init: init, openModal: openModal, closeModal: closeModal, presentation: Pres };
})();
