/* 전체 조립: 상태 머신 + 연습 · 연주회 · 타임랩스 흐름 (docs/02_기능.md 3~8장)
 *
 *  idle ──[연습 1회]──▶ practicingLive ──끝──▶ idle
 *  idle ──[×10 / ×100]──▶ practicingFast ──끝──▶ idle
 *  idle ──[연주회 / 칩]──▶ concertIntro ─▶ concertPlaying ─▶ concertResult ──닫기──▶ idle
 *  idle ──[타임랩스]──▶ timelapse ──끝──▶ idle
 *
 * 학습은 trainer가 즉시 계산하고, 화면은 그 결과(이벤트 큐)를 박자에 맞춰 보여주기만 한다.
 * UI는 학습용 RNG를 건드리지 않는다. 말풍선 · 디튠 같은 연출용 무작위는 Math.random. */
(function () {
  'use strict';
  var FP = window.FlyPiano;
  var ev = FP.events, A = FP.audio, SFX = FP.sfx, S = FP.stage, BP = FP.brainPanel, CH = FP.charts;
  var SNAP_EPS = FP.SNAPSHOTS.map(function (s) { return s.ep; });
  var LAST_SNAP = SNAP_EPS[SNAP_EPS.length - 1];

  // ---------- 설정 (localStorage는 try/catch, 실패해도 기본값으로 동작) ----------
  var DEFAULTS = {
    seed: 42, alpha: 0.3, beta: 6, nKC: 2000, ratio: 0.05, maxMistakes: 3,
    liveBpm: 100, greedy: false, timelapse: 'full', compare: false,
    wrongDetune: true, metronome: false
  };
  var STORE_KEY = 'flyPiano.settings.v1';

  function loadSettings() {
    var s = Object.assign({}, DEFAULTS);
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(DEFAULTS).forEach(function (k) {
          if (saved[k] !== undefined && typeof saved[k] === typeof DEFAULTS[k]) s[k] = saved[k];
        });
      }
    } catch (e) { /* 저장소를 못 써도 기본값으로 */ }
    return s;
  }
  function saveSettings(s) {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* 무시 */ }
  }

  // ---------- 문구 (docs/02_기능.md 6.2, 7장) ----------
  var LINES = {
    wrong: ['삑사리!', '어… 이게 아닌데', '건반이 너무 커요', '다리가 6개라 헷갈려요', '찌릿했다…'],
    streak: ['오, 좀 치는데?', '다리가 기억해요', '이 노래 아는 것 같아요'],
    exit: ['다음엔 잘할게요…', '연습 더 하고 올게요'],
    done: ['감사합니다! 🎵', '앙코르 받습니다'],
    first: '피아노가 뭐예요?'
  };
  var GRADES = [
    { min: 0.97, stars: 5, crowd: '기립박수 + 꽃 🌸', react: 'stand',
      critics: ['모차르트가 이 곡으로 변주곡을 쓴 이유를 알겠다', '이 초파리, 음대 보내야 합니다'] },
    { min: 0.85, stars: 4, crowd: '큰 박수 👏', react: 'clap',
      critics: ['곤충계의 신동 등장', '실수 한두 번은 애교'] },
    { min: 0.60, stars: 3, crowd: '박수 조금 👏', react: 'clap-some',
      critics: ['삑사리마저 개성으로 느껴진다', '다리 6개의 한계를 넘어서고 있다'] },
    { min: 0.30, stars: 2, crowd: '갸우뚱 🤔', react: 'tilt',
      critics: ['앞부분은 분명 그 노래였다', '후반부에 길을 잃은 듯'] },
    { min: 0, stars: 1, crowd: '귀 막기, 웅성웅성 🙉', react: 'ears',
      critics: ['현대음악인 줄 알았습니다', '피아노가 불쌍합니다', '곡 제목을 맞히는 퀴즈인가요?'] }
  ];
  function gradeOf(acc) {
    for (var i = 0; i < GRADES.length; i++) if (acc >= GRADES[i].min - 1e-9) return GRADES[i];
    return GRADES[GRADES.length - 1];
  }
  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ---------- 앱 상태 ----------
  var App = FP.app = {
    state: 'idle',
    settings: loadSettings(),
    trainer: null,
    growth: {},        // { 회차: Uint8Array(42) } 연주회로 들어본 단계만
    liveRow: null,     // 지금 칠해지는 성장 지도 행 { ep, results: Int8Array }
    token: null,
    player: new FP.Player()
  };
  A.wrongDetune = App.settings.wrongDetune;

  function setState(s) {
    App.state = s;
    ev.emit('state', s);
  }

  // 진행 중인 흐름 하나에 토큰 하나. ESC로 중단하면 aborted = true.
  function begin(state) {
    if (App.token) App.abort();
    var tok = { aborted: false, onAbort: [] };
    App.token = tok;
    setState(state);
    return tok;
  }
  function finish(tok) {
    if (App.token !== tok) return;
    App.token = null;
    setState('idle');
  }
  function sleep(ms, tok) {
    return new Promise(function (res) {
      var id = setTimeout(res, ms);
      if (tok) tok.onAbort.push(function () { clearTimeout(id); res(); });
    });
  }
  function nextFrame() { return new Promise(function (r) { requestAnimationFrame(function () { r(); }); }); }

  App.busy = function () { return App.state !== 'idle'; };

  App.abort = function () {
    var tok = App.token;
    if (!tok) return false;
    tok.aborted = true;
    App.token = null;
    App.player.stop();
    tok.onAbort.forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } });
    S.setConcertLights(false);
    S.hideCaption();
    S.hideResult();
    S.timelapseProgress(null);
    S.fastBadge(false);
    S.releaseAllKeys();
    S.hideBubble();
    S.flyReturn(3.5);
    S.audienceReset();
    if (App.liveRow) { App.liveRow = null; }
    App.refresh();
    setState('idle');
    return true;
  };

  // ---------- 화면 새로 그리기 ----------
  App.growthRows = function () {
    return FP.SNAPSHOTS.map(function (s) {
      var res = App.growth[s.ep] || null;
      if (App.liveRow && App.liveRow.ep === s.ep) res = App.liveRow.results;
      return { ep: s.ep, name: s.name, results: res };
    });
  };

  App.drawCharts = function () {
    var h = App.trainer.history;
    var hl = App.liveRow ? App.liveRow.ep : null;
    CH.drawLearning(document.getElementById('cvLearn'), h);
    CH.drawSurprise(document.getElementById('cvSurprise'), h);
    CH.drawGrowth(document.getElementById('cvGrowth'), App.growthRows(), { highlight: hl });
    if (document.getElementById('modalCharts').classList.contains('open')) App.drawBigCharts();
  };
  App.drawBigCharts = function () {
    var h = App.trainer.history;
    CH.drawGrowth(document.getElementById('cvGrowthBig'), App.growthRows(), { big: true, highlight: App.liveRow ? App.liveRow.ep : null });
    CH.drawLearning(document.getElementById('cvLearnBig'), h, { big: true });
    CH.drawSurprise(document.getElementById('cvSurpriseBig'), h, { big: true });
  };

  App.refresh = function () {
    S.setCounter(App.trainer.episode);
    App.drawCharts();
    ev.emit('trained', App.trainer.episode);
  };

  // ---------- 처음부터 ----------
  App.trainerCfg = function () {
    var s = App.settings;
    return {
      nKC: s.nKC, k: Math.max(1, Math.round(s.nKC * s.ratio)),
      alpha: s.alpha, beta: s.beta, maxMistakes: s.maxMistakes
    };
  };

  App.resetAll = function () {
    if (App.token) App.abort();
    var cfg = App.trainerCfg();
    App.trainer = new FP.Trainer(cfg, App.settings.seed);
    App.growth = {};
    App.liveRow = null;
    BP.setConfig(App.trainer.cfg);
    BP.clear();
    S.resetStrip();
    S.flyReturn(3.5);
    S.placeFly(3.5, false);
    S.audienceReset();
    App.refresh();
    ev.emit('reset');
  };

  App.applySettings = function (next) {
    var learnKeys = ['seed', 'alpha', 'beta', 'nKC', 'ratio', 'maxMistakes'];
    var changed = learnKeys.some(function (k) { return next[k] !== App.settings[k]; });
    App.settings = Object.assign({}, App.settings, next);
    A.wrongDetune = App.settings.wrongDetune;
    saveSettings(App.settings);
    ev.emit('settings', App.settings);
    return changed;
  };
  App.defaults = function () { return Object.assign({}, DEFAULTS); };

  // ---------- 성장 지도 기록 ----------
  function startLiveRow(ep) {
    if (SNAP_EPS.indexOf(ep) < 0) return;
    var r = new Int8Array(42);
    r.fill(-1);
    App.liveRow = { ep: ep, results: r };
  }
  function endLiveRow(full) {
    if (!App.liveRow) return;
    App.growth[App.liveRow.ep] = Uint8Array.from(full);
    App.liveRow = null;
    ev.emit('concertEnd');
  }

  // ---------- 라이브 연습 (×1) ----------
  App.practiceLive = async function (opts) {
    if (App.busy()) return;
    opts = opts || {};
    var tok = begin('practicingLive');
    var tr = App.trainer;
    var steps = [];
    // 계산은 즉시 (학습 결과는 이 순간 확정 → ESC로 멈춰도 재현성 유지)
    var summary = tr.runEpisode({ onStep: function (e) { steps.push(e); ev.emit('step', e); } });
    ev.emit('episodeEnd', summary);
    if (summary.snapshot != null) ev.emit('snapshot', summary.snapshot);

    var bpm = opts.bpm || App.settings.liveBpm;
    S.flyReturn(3.5);
    S.resetStrip();
    S.audienceReset();
    S.hideBubble();
    BP.clear();
    BP.setMode('practice');
    S.setCounter(summary.episode);
    if (summary.episode === 1) S.say(LINES.first, { force: true });

    var items = steps.map(function (e) {
      return { key: e.action, beats: FP.SONG[e.t].beats, wrong: !e.correct };
    });
    var streak = 0, wrongs = 0;
    var completed = await App.player.play(items, {
      bpm: bpm,
      onSchedule: function (i, time, spb) {
        if (!App.settings.metronome) return;
        for (var b = 0; b < items[i].beats; b++) SFX.click(time + b * spb, FP.SONG[steps[i].t].beat === 0 && b === 0);
      },
      onJump: function (i) { S.flyJump(steps[i].action); SFX.wing(); },
      onHit: function (i) {
        var e = steps[i];
        S.pressKey(e.action, e.correct);
        S.markNote(e.t, e.correct, e.action);
        S.setCurrent(e.done ? -1 : e.t + 1);
        BP.show(e, 'practice');
        if (e.correct) {
          SFX.sugar();
          S.flyPose('correct', { sugar: true });
          streak++;
          if (streak === 5) S.say(pickRandom(LINES.streak));
        } else {
          SFX.zap();
          S.flyPose('wrong', { zap: true });
          streak = 0;
          wrongs++;
          if (!e.done) S.say(pickRandom(LINES.wrong));
        }
        S.audienceLive(wrongs / (i + 1), i + 1);
      }
    });
    if (tok.aborted || !completed) return;

    if (summary.completed) {
      S.flyPose('bow');
      S.say(pickRandom(LINES.done), { force: true });
      S.audienceReact('clap');
      SFX.applause(4);
    } else {
      S.markSkipped(summary.reached);
      S.say(pickRandom(LINES.exit), { force: true });
      S.flyExit();
      S.audienceReact('boo');
      SFX.boo();
    }
    App.refresh();
    await sleep(1400, tok);
    if (tok.aborted) return;
    S.audienceReset();
    finish(tok);
  };

  // ---------- 빨리 연습 (무음, 10회씩 끊어서 화면이 멈추지 않게) ----------
  async function fastTrain(target, tok, label) {
    var tr = App.trainer;
    if (tr.episode >= target) return;
    S.fastBadge(true, label || '⏩ 빨리 연습 중');
    S.hideBubble();
    while (tr.episode < target && !tok.aborted) {
      var n = Math.min(10, target - tr.episode);
      for (var i = 0; i < n; i++) {
        var sum = tr.runEpisode();
        if (sum.snapshot != null) ev.emit('snapshot', sum.snapshot);
      }
      S.setCounter(tr.episode);
      App.drawCharts();
      ev.emit('trained', tr.episode);
      await nextFrame();
    }
    S.fastBadge(false);
  }

  App.practiceFast = async function (n) {
    if (App.busy()) return;
    var tok = begin('practicingFast');
    S.flyReturn(3.5);
    BP.clear();
    await fastTrain(App.trainer.episode + n, tok, '⏩ 빨리 연습 ×' + n);
    if (tok.aborted) return;
    SFX.fastDone();
    App.refresh();
    finish(tok);
  };

  // ---------- 연주회 ----------
  /* cfg: { ep, snapshot, bpm, intro, card, portions, quiet } */
  async function runConcert(tok, cfg) {
    var tr = App.trainer;
    var result = tr.concert(cfg.snapshot, FP.Trainer.concertSeed(cfg.ep), { greedy: App.settings.greedy });
    var bpm = cfg.bpm || 100;

    S.flyReturn(3.5);
    S.resetStrip();
    S.audienceReset();
    S.hideBubble();
    BP.clear();
    BP.setMode('concert');

    if (cfg.intro) {
      setState('concertIntro');
      S.setConcertLights(true);                 // 조명 다운 0.8초 → 스포트라이트 0.5초
      await sleep(1300, tok);
      if (tok.aborted) return null;
      S.showCaption('연주자: 초파리 · 연습 ' + cfg.ep + '회');
      await sleep(1500, tok);
      S.hideCaption();
      if (tok.aborted) return null;
      setState('concertPlaying');
    }

    // 들려줄 음: 전곡, 또는 첫 소절 + 마지막 소절 (타임랩스 짧게)
    var idxs = [];
    for (var t = 0; t < 42; t++) if (!cfg.portions || t < 7 || t >= 35) idxs.push(t);
    var items = idxs.map(function (t, j) {
      return {
        key: result.actions[t], beats: FP.SONG[t].beats, wrong: !result.results[t],
        gapBefore: j > 0 && t !== idxs[j - 1] + 1 ? 1.5 : 0
      };
    });
    if (cfg.portions) for (var s = 7; s < 35; s++) S.chips[s].classList.add('skip');

    startLiveRow(cfg.ep);
    App.drawCharts();
    if (cfg.ep === 0 && !cfg.quiet) S.say(LINES.first, { force: true });

    var streak = 0, wrongs = 0;
    var completed = await App.player.play(items, {
      bpm: bpm,
      onJump: function (i) { S.flyJump(items[i].key); },
      onHit: function (i) {
        var t = idxs[i], st = result.steps[t];
        S.pressKey(st.action, st.correct, cfg.quiet ? 200 : 320);
        S.markNote(t, st.correct, st.action);
        S.setCurrent(i + 1 < idxs.length ? idxs[i + 1] : -1);
        BP.show(st, 'concert');
        if (App.liveRow) { App.liveRow.results[t] = st.correct ? 1 : 0; App.drawCharts(); }
        if (st.correct) {
          S.flyPose('correct');
          streak++;
          if (streak === 5 && !cfg.quiet) S.say(pickRandom(LINES.streak));
        } else {
          S.flyPose('wrong');
          streak = 0;
          wrongs++;
          if (!cfg.quiet) S.say(pickRandom(LINES.wrong));
        }
        S.audienceLive(wrongs / (i + 1), i + 1);
      }
    });
    if (tok.aborted || !completed) return null;
    endLiveRow(result.results);
    App.drawCharts();
    return result;
  }

  async function concertWithCard(tok, ep, snapshot) {
    var result = await runConcert(tok, { ep: ep, snapshot: snapshot, intro: true, bpm: 100 });
    if (!result || tok.aborted) return;
    var gr = gradeOf(result.accuracy);
    // 평론가 한줄평은 회차로 정해서 발표 때마다 같게
    var critic = gr.critics[(ep + result.correct) % gr.critics.length];
    S.showResult({
      title: '연주회 결과 · 연습 ' + ep + '회' + (App.settings.greedy ? ' (실수 없는 모드)' : ''),
      correct: result.correct, accuracy: result.accuracy, stars: gr.stars,
      critic: critic, crowd: gr.crowd
    });
    S.audienceReact(gr.react);
    if (gr.stars >= 3) S.flyPose('bow'); else S.flyPose('sad');
    if (gr.stars === 5) { SFX.applause(5); SFX.fanfare(); S.say(pickRandom(LINES.done), { force: true }); }
    else if (gr.stars === 4) SFX.applause(4);
    else if (gr.stars === 3) SFX.applause(3);
    else if (gr.stars === 2) SFX.murmur();
    else { SFX.boo(); if (ep === 0) SFX.murmur(A.ctx ? A.ctx.currentTime + 1.2 : 0); }
    ev.emit('concertEnd', { ep: ep, result: result });
    setState('concertResult');   // 카드 닫기 → idle
  }

  // 연주회 열기: 지금 뇌로
  App.openConcert = async function () {
    if (App.busy()) return;
    var tok = begin('concertIntro');
    var tr = App.trainer;
    await concertWithCard(tok, tr.episode, tr.brain.snapshot());
  };

  // 연습 일지 칩: 지난 회차면 저장된 뇌로, 안 간 회차면 빨리 연습 후 연주회
  App.playChip = async function (ep) {
    if (App.busy()) return;
    var tok = begin('practicingFast');
    var tr = App.trainer;
    if (tr.episode < ep) {
      await fastTrain(ep, tok, '⏩ ' + ep + '회까지 빨리 연습');
      if (tok.aborted) return;
      App.refresh();
    }
    setState('concertIntro');
    await concertWithCard(tok, ep, tr.snapshots[ep]);
  };

  App.closeCard = function () {
    if (App.state !== 'concertResult') return false;
    var tok = App.token;
    S.hideResult();
    S.setConcertLights(false);
    S.audienceReset();
    S.clearFlyPose();
    BP.setMode('idle');
    finish(tok);
    return true;
  };

  // ---------- 성장 타임랩스 ----------
  App.timelapse = async function () {
    if (App.busy()) return;
    var tok = begin('timelapse');
    var tr = App.trainer;
    var short = App.settings.timelapse === 'short';
    if (tr.episode < LAST_SNAP) {
      await fastTrain(LAST_SNAP, tok, '⏩ ' + LAST_SNAP + '회까지 빨리 연습');
      if (tok.aborted) return;
      App.refresh();
    }
    S.setConcertLights(true);
    await sleep(900, tok);
    var n = FP.SNAPSHOTS.length;
    for (var k = 0; k < n; k++) {
      if (tok.aborted) return;
      var snap = FP.SNAPSHOTS[k];
      S.timelapseProgress(k, n);
      ev.emit('timelapseStage', { index: k, ep: snap.ep });
      S.showCaption('연습 ' + snap.ep + '회 · ' + snap.name);
      await sleep(1000, tok);
      S.hideCaption();
      if (tok.aborted) return;
      var res = await runConcert(tok, { ep: snap.ep, snapshot: tr.snapshots[snap.ep], bpm: 200, portions: short, quiet: true });
      if (!res || tok.aborted) return;
      S.timelapseProgress(k, n, snap.ep + '회: ' + Math.round(res.accuracy * 100) + '%');
      await sleep(500, tok);
    }
    if (tok.aborted) return;
    S.timelapseProgress(n, n, '끝!');
    S.audienceReact('stand');
    S.flyPose('bow');
    S.say('감사합니다! 🎵', { force: true });
    SFX.applause(5);
    await sleep(2500, tok);
    if (tok.aborted) return;
    S.timelapseProgress(null);
    S.setConcertLights(false);
    S.audienceReset();
    BP.setMode('idle');
    finish(tok);
  };

  // ---------- 정답 멜로디 듣기 (확인용, 학습 X) ----------
  App.playReference = async function () {
    if (App.busy()) return;
    var tok = begin('concertPlaying');
    S.flyReturn(3.5);
    S.resetStrip();
    BP.clear();
    var items = FP.SONG.map(function (n) { return { key: n.note, beats: n.beats }; });
    var ok = await App.player.play(items, {
      bpm: 100,
      onJump: function (i) { S.flyJump(items[i].key); },
      onHit: function (i) {
        S.pressKey(items[i].key, true);
        S.markNote(i, true, items[i].key);
        S.setCurrent(i + 1 < 42 ? i + 1 : -1);
      }
    });
    if (tok.aborted || !ok) return;
    S.flyPose('bow');
    await sleep(600, tok);
    if (tok.aborted) return;
    finish(tok);
  };

  // 사람이 건반을 직접 눌러보기 (소리 확인용, 학습에는 영향 없음)
  App.humanKey = function (key) {
    A.init();
    if (A.running()) A.note(key, A.ctx.currentTime + 0.01, 1);
    S.pressKey(key, null, 250);
  };

  // ---------- 탭이 백그라운드로 가면 일시정지 ----------
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (App.player.active) { A.pause(); document.getElementById('pauseGate').classList.add('open'); }
    }
  });
  document.getElementById('pauseGate').addEventListener('click', function () {
    A.resume();
    document.getElementById('pauseGate').classList.remove('open');
  });

  // ---------- 시작 ----------
  function boot() {
    S.init();
    BP.init();
    App.resetAll();
    if (FP.controls) FP.controls.init(App);
    var redraw = function () { App.drawCharts(); };
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { redraw(); });
      document.querySelectorAll('.chart-card .cv, .big-chart .cv').forEach(function (el) { ro.observe(el); });
    } else {
      window.addEventListener('resize', redraw);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
