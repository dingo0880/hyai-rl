/* 피아노 합성음 + 박자 스케줄러 (docs/03_사운드.md 4~5장)
 *
 * 버스:  피아노 → music(0.9) ┐
 *        효과음 → sfx(0.5)   ├→ master(1.0) → 컴프레서 → 스피커
 *        관객   → crowd(0.6) ┘
 *
 * 박자는 setTimeout이 아니라 AudioContext.currentTime 기준으로 예약 재생한다.
 * 화면 갱신도 같은 시계(예약된 소리 시각)를 보고 requestAnimationFrame에서 맞춘다. */
(function () {
  'use strict';
  var FP = window.FlyPiano = window.FlyPiano || {};

  var FREQS = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
  var PARTIALS = [[1, 1.0], [2, 0.5], [3, 0.25], [4, 0.12]];
  var MAX_VOICES = 8;
  var NOTE_GAIN = 0.32;

  var A = {
    ctx: null,
    master: null,
    buses: {},
    muted: false,
    wrongDetune: true,
    voices: [],
    noiseBuffer: null,
    // 오디오가 없을 때 쓰는 대체 시계
    _fbPausedTotal: 0,
    _fbPauseStart: null,
    paused: false
  };

  A.init = function () {
    if (A.ctx) {
      if (A.ctx.state === 'suspended' && !A.paused) A.ctx.resume();
      return true;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      var ctx = new AC();
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      comp.connect(ctx.destination);
      var master = ctx.createGain();
      master.gain.value = A.muted ? 0 : 1;
      master.connect(comp);
      var mk = function (v) { var g = ctx.createGain(); g.gain.value = v; g.connect(master); return g; };
      A.buses = { music: mk(0.9), sfx: mk(0.5), crowd: mk(0.6) };
      A.master = master;
      // 효과음용 화이트노이즈 2초
      var len = ctx.sampleRate * 2;
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      A.noiseBuffer = buf;
      A.ctx = ctx;
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    } catch (e) {
      console.warn('오디오를 시작할 수 없어요', e);
      return false;
    }
  };

  A.running = function () { return !!A.ctx && A.ctx.state === 'running'; };

  // 오디오가 없을 때 쓰는 시계 (초). 일시정지하면 멈춘다.
  A.fallbackNow = function () {
    var t = performance.now() / 1000;
    if (A._fbPauseStart != null) t = A._fbPauseStart;
    return t - A._fbPausedTotal;
  };
  function ctxNow() { return A.ctx.currentTime; }

  A.pause = function () {
    if (A.paused) return;
    A.paused = true;
    if (A.ctx) A.ctx.suspend();
    A._fbPauseStart = performance.now() / 1000;
  };
  A.resume = function () {
    if (!A.paused) return;
    A.paused = false;
    if (A.ctx) A.ctx.resume();
    if (A._fbPauseStart != null) {
      A._fbPausedTotal += performance.now() / 1000 - A._fbPauseStart;
      A._fbPauseStart = null;
    }
  };

  A.setMuted = function (m) {
    A.muted = !!m;
    if (A.master) A.master.gain.setTargetAtTime(A.muted ? 0 : 1, A.ctx.currentTime, 0.01);
  };

  function cleanVoices() {
    var now = A.ctx.currentTime;
    A.voices = A.voices.filter(function (v) { return v.end > now; });
  }

  function fadeVoice(v, at) {
    try {
      if (v.env.gain.cancelAndHoldAtTime) v.env.gain.cancelAndHoldAtTime(at);
      else v.env.gain.cancelScheduledValues(at);
      v.env.gain.setTargetAtTime(0, at, 0.015);
      v.oscs.forEach(function (o) { o.stop(at + 0.12); });
    } catch (e) { /* 이미 멈춘 음 */ }
    v.end = at + 0.12;
  }

  /* 피아노 음 하나.
   * key: 0~7, when: 오디오 시각, beats: 1|2, opts: { wrong, bus, gain } */
  A.note = function (key, when, beats, opts) {
    if (!A.ctx) return;
    opts = opts || {};
    var ctx = A.ctx;
    when = Math.max(when, ctx.currentTime);
    var cents = (Math.random() * 4 - 2) + (opts.wrong && A.wrongDetune ? -25 : 0);
    var f0 = FREQS[key] * Math.pow(2, cents / 1200);
    var decay = beats >= 2 ? 1.8 : 1.2;
    var peak = NOTE_GAIN * (opts.gain == null ? 1 : opts.gain);

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    var env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, when + decay);
    lp.connect(env);
    env.connect(opts.bus || A.buses.music);

    var oscs = PARTIALS.map(function (p) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f0 * p[0];
      var g = ctx.createGain();
      g.gain.value = p[1] / 1.87;
      o.connect(g);
      g.connect(lp);
      o.start(when);
      o.stop(when + decay + 0.05);
      return o;
    });

    // 동시 발음 최대 8개: 넘으면 가장 오래된 음부터 빠르게 페이드아웃
    cleanVoices();
    var v = { env: env, oscs: oscs, start: when, end: when + decay + 0.05 };
    A.voices.push(v);
    while (A.voices.length > MAX_VOICES) fadeVoice(A.voices.shift(), when);
  };

  // 모든 음을 빠르게 끈다 (중단할 때)
  A.hush = function () {
    if (!A.ctx) return;
    var now = A.ctx.currentTime;
    A.voices.forEach(function (v) { fadeVoice(v, now); });
    A.voices = [];
  };

  /* ---------- 박자 스케줄러 ----------
   * items: [{ key, beats, wrong, gapBefore }]
   * opts:  { bpm, lead(초), onJump(i), onHit(i), onSchedule(i, time, spb), tail(초) }
   * 25ms마다 깨어나서 앞으로 100ms 안에 울릴 음을 예약한다.
   * 화면은 rAF에서 A.now()와 예약 시각을 비교해서 맞춘다. */
  function Player() {
    this._timer = null;
    this._raf = null;
    this._resolve = null;
    this.active = false;
  }

  Player.prototype.play = function (items, opts) {
    var self = this;
    this.stop(true);
    opts = opts || {};
    var spb = 60 / (opts.bpm || 100);
    var lead = opts.lead == null ? 0.15 : opts.lead;
    // 연주 시작 때 시계를 하나 정해서 끝까지 쓴다 (도중에 시계가 바뀌면 박자가 튄다)
    var useAudio = A.running();
    var now = useAudio ? ctxNow : A.fallbackNow;
    this.now = now;
    var t0 = now() + (opts.startDelay == null ? 0.3 : opts.startDelay);
    var times = [], cur = t0;
    items.forEach(function (it) {
      cur += (it.gapBefore || 0) * spb;
      times.push(cur);
      cur += it.beats * spb;
    });
    var endTime = cur + (opts.tail == null ? 0.2 : opts.tail);
    var nSched = 0, nJump = 0, nHit = 0;
    this.active = true;
    this.times = times;

    return new Promise(function (resolve) {
      self._resolve = resolve;
      function schedule() {
        var horizon = now() + 0.1;
        while (nSched < items.length && times[nSched] < horizon) {
          var it = items[nSched];
          if (useAudio && !it.silent) A.note(it.key, times[nSched], it.beats, { wrong: it.wrong });
          if (useAudio && opts.onSchedule) opts.onSchedule(nSched, times[nSched], spb);
          nSched++;
        }
      }
      function frame() {
        if (!self.active) return;
        var t = now();
        while (nJump < items.length && t >= times[nJump] - lead) {
          if (opts.onJump) opts.onJump(nJump, times[nJump]);
          nJump++;
        }
        while (nHit < items.length && t >= times[nHit]) {
          if (opts.onHit) opts.onHit(nHit, times[nHit]);
          nHit++;
        }
        if (t >= endTime) { self._finish(true); return; }
        self._raf = requestAnimationFrame(frame);
      }
      schedule();
      self._timer = setInterval(schedule, 25);
      self._raf = requestAnimationFrame(frame);
    });
  };

  Player.prototype._finish = function (completed) {
    this.active = false;
    if (this._timer) clearInterval(this._timer);
    if (this._raf) cancelAnimationFrame(this._raf);
    this._timer = this._raf = null;
    var r = this._resolve;
    this._resolve = null;
    if (r) r(completed);
  };

  Player.prototype.stop = function (silent) {
    var wasActive = this.active;
    this._finish(false);
    if (wasActive && !silent) A.hush();
  };

  A.FREQS = FREQS;
  FP.audio = A;
  FP.Player = Player;
})();
