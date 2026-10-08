/* 효과음 · 관객 소리 (docs/03_사운드.md 6장) — 전부 합성, 음원 파일 없음
 * 효과음은 항상 피아노보다 작게. */
(function () {
  'use strict';
  var FP = window.FlyPiano = window.FlyPiano || {};
  var A = FP.audio;

  function ok() { return A.ctx && A.ctx.state === 'running'; }
  function t0(when) { return Math.max(when || 0, A.ctx.currentTime); }

  function envGain(ctx, when, attack, peak, release, dest) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, when + attack + release);
    g.connect(dest);
    return g;
  }

  function noiseSource(ctx, when, dur) {
    var src = ctx.createBufferSource();
    src.buffer = A.noiseBuffer;
    var offset = Math.random() * Math.max(0, A.noiseBuffer.duration - dur - 0.01);
    src.start(when, offset, dur + 0.01);
    return src;
  }

  var S = {};

  // 설탕 띵: 고음 사인 2개, 작게, 빠른 감쇠 (0.15s)
  S.sugar = function (when) {
    if (!ok()) return;
    var ctx = A.ctx, w = t0(when);
    var g = envGain(ctx, w, 0.003, 0.16, 0.15, A.buses.sfx);
    [2093, 2637].forEach(function (f) {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(g);
      o.start(w);
      o.stop(w + 0.2);
    });
  };

  // 찌릿: 노이즈 → 밴드패스 1.5kHz + 사각파 60Hz, 20Hz로 떨림 (0.25s, 크지 않게)
  S.zap = function (when) {
    if (!ok()) return;
    var ctx = A.ctx, w = t0(when), dur = 0.25;
    var out = ctx.createGain();
    out.gain.setValueAtTime(0, w);
    out.gain.linearRampToValueAtTime(0.22, w + 0.01);
    out.gain.setValueAtTime(0.22, w + dur - 0.06);
    out.gain.linearRampToValueAtTime(0, w + dur);
    var trem = ctx.createGain();
    trem.gain.value = 0.5;
    var lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 20;
    var lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.5;
    lfo.connect(lfoAmt);
    lfoAmt.connect(trem.gain);
    trem.connect(out);
    out.connect(A.buses.sfx);

    var n = noiseSource(ctx, w, dur);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 1.2;
    n.connect(bp);
    bp.connect(trem);
    var sq = ctx.createOscillator();
    sq.type = 'square';
    sq.frequency.value = 60;
    var sqg = ctx.createGain();
    sqg.gain.value = 0.35;
    sq.connect(sqg);
    sqg.connect(trem);
    sq.start(w); sq.stop(w + dur);
    lfo.start(w); lfo.stop(w + dur);
  };

  // 날갯짓 윙: 톱니파 220Hz + 트레몰로 30Hz, 아주 작게 (0.15s)
  S.wing = function (when) {
    if (!ok()) return;
    var ctx = A.ctx, w = t0(when);
    var g = envGain(ctx, w, 0.02, 0.05, 0.13, A.buses.sfx);
    var trem = ctx.createGain();
    trem.gain.value = 0.5;
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 30;
    var amt = ctx.createGain();
    amt.gain.value = 0.5;
    lfo.connect(amt); amt.connect(trem.gain);
    var o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 210 + Math.random() * 25;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    o.connect(lp); lp.connect(trem); trem.connect(g);
    o.start(w); o.stop(w + 0.18);
    lfo.start(w); lfo.stop(w + 0.18);
  };

  // 박수: 짧은 딸깍을 랜덤 간격으로 수십~수백 개. 별이 많을수록 더 많이, 더 길게.
  S.applause = function (stars, when) {
    if (!ok()) return;
    var ctx = A.ctx, w = t0(when) + 0.05;
    var dur = stars >= 5 ? 4 : stars >= 4 ? 2.6 : 1.5;
    var count = stars >= 5 ? 420 : stars >= 4 ? 220 : 70;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1000;
    hp.connect(A.buses.crowd);
    for (var i = 0; i < count; i++) {
      // 앞쪽이 촘촘하고 뒤로 갈수록 성기게
      var u = Math.random();
      var at = w + dur * (1 - Math.sqrt(1 - u)) * 0.95;
      var fade = 1 - (at - w) / dur;
      var src = noiseSource(ctx, at, 0.03);
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200 + Math.random() * 1800;
      bp.Q.value = 0.9;
      var g = ctx.createGain();
      var peak = (0.25 + Math.random() * 0.35) * (0.35 + 0.65 * fade);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.005 + 0.02 + Math.random() * 0.02);
      src.connect(bp); bp.connect(g); g.connect(hp);
    }
  };

  // 야유 "우~": 톱니파 120~160Hz 여러 개 + 비브라토 5Hz + 로우패스 800Hz (1.5s)
  S.boo = function (when) {
    if (!ok()) return;
    var ctx = A.ctx, w = t0(when), dur = 1.5;
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, w);
    g.gain.linearRampToValueAtTime(0.16, w + 0.6);
    g.gain.linearRampToValueAtTime(0.0001, w + dur);
    lp.connect(g); g.connect(A.buses.crowd);
    for (var i = 0; i < 6; i++) {
      var f = 120 + Math.random() * 40;
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 1.04, w);
      o.frequency.linearRampToValueAtTime(f * 0.9, w + dur);
      var vib = ctx.createOscillator();
      vib.frequency.value = 4.5 + Math.random();
      var vg = ctx.createGain();
      vg.gain.value = f * 0.02;
      vib.connect(vg); vg.connect(o.frequency);
      var og = ctx.createGain();
      og.gain.value = 0.25;
      o.connect(og); og.connect(lp);
      var st = w + Math.random() * 0.15;
      o.start(st); o.stop(w + dur);
      vib.start(st); vib.stop(w + dur);
    }
  };

  // 웅성웅성: 밴드패스 노이즈 (300~1,500Hz) + 느리고 불규칙한 진폭 변화 (1.5s)
  S.murmur = function (when) {
    if (!ok()) return;
    var ctx = A.ctx, w = t0(when), dur = 1.6;
    [450, 800, 1250].forEach(function (fc, k) {
      var src = noiseSource(ctx, w, dur);
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fc;
      bp.Q.value = 2.5;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0, w);
      for (var t = 0.1; t < dur - 0.15; t += 0.09 + Math.random() * 0.08) {
        g.gain.linearRampToValueAtTime((0.1 + Math.random() * 0.45) * (k === 1 ? 1 : 0.7), w + t);
      }
      g.gain.linearRampToValueAtTime(0, w + dur);
      src.connect(bp); bp.connect(g); g.connect(A.buses.crowd);
    });
  };

  // 팡파레: 피아노 합성음으로 도-미-솔-높은 도 + 마지막 화음 (1s)
  S.fanfare = function (when) {
    if (!ok()) return;
    var w = t0(when) + 0.05;
    [0, 2, 4, 7].forEach(function (k, i) { A.note(k, w + i * 0.12, 1, { gain: 0.8 }); });
    [0, 2, 4, 7].forEach(function (k) { A.note(k, w + 0.55, 2, { gain: 0.6 }); });
  };

  // 빨리 연습 완료: 짧은 상승음 솔 → 높은 도 (0.3s)
  S.fastDone = function (when) {
    if (!ok()) return;
    var w = t0(when);
    A.note(4, w, 1, { bus: A.buses.sfx, gain: 0.9 });
    A.note(7, w + 0.12, 1, { bus: A.buses.sfx, gain: 0.9 });
  };

  // 메트로놈: 1,000Hz 클릭 (0.02s)
  S.click = function (when, accent) {
    if (!ok()) return;
    var ctx = A.ctx, w = t0(when);
    var g = envGain(ctx, w, 0.001, accent ? 0.22 : 0.12, 0.02, A.buses.sfx);
    var o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = accent ? 1500 : 1000;
    o.connect(g);
    o.start(w); o.stop(w + 0.03);
  };

  FP.sfx = S;
})();
