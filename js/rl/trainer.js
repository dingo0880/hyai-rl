/* 연습 · 연주회 · 스냅샷 · 기록
 * 순수 계산만 한다. UI를 모른다. 매 음마다 onStep(stepInfo)로 이벤트를 내보낸다.
 * 학습용 RNG는 Trainer 안에 하나만 있고, UI는 이것을 건드리지 않는다.
 * → 연습을 ×1로 하든 ×100으로 하든 같은 시드면 같은 뇌가 된다. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var FP = root.FlyPiano = root.FlyPiano || {};
  if (typeof module !== 'undefined' && typeof require === 'function') {
    require('../core/rng.js');
    require('./song.js');
    require('./env.js');
    require('./brain.js');
  }

  var DEFAULT_CFG = {
    nKC: 2000,
    k: 100,
    fanIn: 7,
    alpha: 0.3,
    beta: 6,
    nKeys: 8,
    maxMistakes: 3,
    mode: 'dense',   // 'dense' = 대치동(매 음 보상), 'sparse' = 산골(소절 끝에만 보상)
    lambda: 0.8      // 산골 모드 자격 흔적 감쇠
  };

  function concertSeed(ep) { return 1000 + ep; }

  function Trainer(cfg, seed) {
    this.cfg = Object.assign({}, DEFAULT_CFG, cfg || {});
    this.seed = seed == null ? 42 : seed;
    this.rng = FP.makeRng(this.seed);
    this.brain = new FP.MushroomBody(this.cfg, this.rng);
    this.song = FP.SONG;
    this.env = new FP.PianoEnv(this.song, { maxMistakes: this.cfg.maxMistakes });
    this.episode = 0;           // 끝낸 연습 횟수
    this.history = [];          // 회차별 { episode, reached, accuracy, meanAbsDelta, mistakes, completed }
    this.snapshotEps = FP.SNAPSHOTS.map(function (s) { return s.ep; });
    this.snapshots = {};        // { [회차]: Float32Array }
    if (this.snapshotEps.indexOf(0) >= 0) this.snapshots[0] = this.brain.snapshot();
  }

  // 연습 1회 (에피소드). 결과 요약을 돌려준다.
  Trainer.prototype.runEpisode = function (opts) {
    opts = opts || {};
    var learn = opts.learn !== false;
    var onStep = opts.onStep;
    var sparse = this.cfg.mode === 'sparse';
    var brain = this.brain, env = this.env, rng = this.rng;
    var epNo = this.episode + 1;

    env.reset();
    var nCorrect = 0, nSteps = 0, sumAbsDelta = 0, nDelta = 0, res;
    var traces = [], phraseCorrect = 0, phraseSteps = 0, phrasePredSum = 0;

    do {
      var obs = env.observe();
      var active = brain.encode(obs);
      var V = brain.values(active);
      var a = brain.act(V, rng);
      res = env.step(a);
      nSteps++;
      if (res.correct) nCorrect++;
      var info = {
        episode: epNo, t: obs.t,
        obs: { phrase: obs.phrase, beat: obs.beat, prevNote: obs.prevNote },
        activeKCs: active, values: V, action: a, target: obs.target,
        correct: res.correct, reward: res.reward,
        prediction: V[a], dopamine: 0,
        mistakes: res.mistakes, done: res.done
      };

      if (!sparse) {
        // 대치동: 매 음마다 설탕/찌릿 → 바로 도파민
        var delta = res.reward - V[a];
        if (learn) brain.learn(active, a, delta);
        info.dopamine = delta;
        sumAbsDelta += Math.abs(delta); nDelta++;
      } else {
        // 산골: 소절 끝(또는 퇴장)에만 "몇 개 맞았다"를 앎 → 자격 흔적으로 몰아서 학습
        for (var i = 0; i < traces.length; i++) traces[i].e *= this.cfg.lambda;
        traces.push({ active: active, a: a, e: 1 });
        phraseSteps++; phrasePredSum += V[a];
        if (res.correct) phraseCorrect++;
        var phraseEnd = obs.beat === FP.PHRASE_LEN - 1 || res.done;
        info.reward = null; info.prediction = null; info.dopamine = null;
        if (phraseEnd) {
          var R = (phraseCorrect * 2 - phraseSteps) / phraseSteps;
          var d = R - phrasePredSum / phraseSteps;
          if (learn) {
            for (var j = 0; j < traces.length; j++) brain.learn(traces[j].active, traces[j].a, d * traces[j].e);
          }
          info.reward = R; info.prediction = phrasePredSum / phraseSteps; info.dopamine = d;
          sumAbsDelta += Math.abs(d); nDelta++;
          traces = []; phraseCorrect = 0; phraseSteps = 0; phrasePredSum = 0;
        }
      }
      if (onStep) onStep(info);
    } while (!res.done);

    this.episode = epNo;
    var summary = {
      episode: epNo,
      reached: nSteps,
      accuracy: nCorrect / nSteps,
      meanAbsDelta: nDelta ? sumAbsDelta / nDelta : 0,
      mistakes: res.mistakes,
      completed: nSteps === this.song.length && res.mistakes < this.cfg.maxMistakes
    };
    this.history.push(summary);
    if (this.snapshotEps.indexOf(epNo) >= 0) {
      this.snapshots[epNo] = brain.snapshot();
      summary.snapshot = epNo;
    }
    return summary;
  };

  // 빨리 연습 n회
  Trainer.prototype.train = function (n) {
    var last = null;
    for (var i = 0; i < n; i++) last = this.runEpisode();
    return last;
  };

  // 회차 ep까지 연습 (이미 지났으면 아무것도 안 함)
  Trainer.prototype.trainUntil = function (ep) {
    if (this.episode < ep) this.train(ep - this.episode);
  };

  // 연주회: 학습 X, 실수 제한 없음, 고정 시드. 같은 스냅샷·시드 → 같은 연주.
  Trainer.prototype.concert = function (snapshot, seed, opts) {
    opts = opts || {};
    var greedy = !!opts.greedy, onStep = opts.onStep;
    var brain = this.brain, W = snapshot || brain.W;
    var rng = FP.makeRng(seed);
    var env = new FP.PianoEnv(this.song, { maxMistakes: Infinity });
    env.reset();
    var n = this.song.length;
    var results = new Uint8Array(n), actions = new Int8Array(n), steps = [];
    var res;
    do {
      var obs = env.observe();
      var active = brain.encode(obs);
      var V = brain.values(active, W);
      var a = brain.act(V, rng, greedy);
      res = env.step(a);
      results[obs.t] = res.correct ? 1 : 0;
      actions[obs.t] = a;
      var info = {
        episode: null, t: obs.t,
        obs: { phrase: obs.phrase, beat: obs.beat, prevNote: obs.prevNote },
        activeKCs: active, values: V, action: a, target: obs.target,
        correct: res.correct, reward: res.reward,
        prediction: V[a], dopamine: res.reward - V[a],
        mistakes: res.mistakes, done: res.done
      };
      steps.push(info);
      if (onStep) onStep(info);
    } while (!res.done);

    var correct = 0, first = 0;
    for (var t = 0; t < n; t++) {
      correct += results[t];
      if (this.song[t].phrase === 0) first += results[t];
    }
    return {
      results: results, actions: actions, steps: steps,
      correct: correct, accuracy: correct / n,
      firstPhraseAccuracy: first / FP.PHRASE_LEN
    };
  };

  Trainer.DEFAULT_CFG = DEFAULT_CFG;
  Trainer.concertSeed = concertSeed;
  FP.Trainer = Trainer;
  if (typeof module !== 'undefined') module.exports = { Trainer: Trainer, DEFAULT_CFG: DEFAULT_CFG, concertSeed: concertSeed };
})();
