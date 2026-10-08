#!/usr/bin/env node
/* 초파리 학습 시뮬레이션 + 자동 검사 (docs/04_초파리_강화학습.md 5장)
 *
 *   node scripts/simulate.js                     # 기본: 시드 42, 300회
 *   node scripts/simulate.js --seed 7 --episodes 500
 *   node scripts/simulate.js --mode sparse       # 산골 모드 (Phase 6)
 *   node scripts/simulate.js --csv curve.csv     # 회차별 기록 저장
 *
 * 검사가 하나라도 FAIL이면 종료 코드 1.
 */
'use strict';
var fs = require('fs');
var path = require('path');
require('../js/core/rng.js');
require('../js/rl/song.js');
require('../js/rl/env.js');
require('../js/rl/brain.js');
var T = require('../js/rl/trainer.js');
var FP = globalThis.FlyPiano;
var Trainer = T.Trainer;

// ---------- 인자 ----------
var args = { seed: 42, episodes: 300, mode: 'dense', csv: null };
(function parse(argv) {
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--seed') args.seed = parseInt(argv[++i], 10);
    else if (a === '--episodes') args.episodes = parseInt(argv[++i], 10);
    else if (a === '--mode') args.mode = argv[++i];
    else if (a === '--csv') args.csv = argv[++i];
  }
})(process.argv.slice(2));

var CONCERT_REPEATS = 5;
var SNAP_EPS = FP.SNAPSHOTS.map(function (s) { return s.ep; });

function pct(x) { return (x * 100).toFixed(0) + '%'; }
function pad(s, n) { s = String(s); while (s.length < n) s = ' ' + s; return s; }

// 한 번 전체 실행: 학습 + 스냅샷 연주회
function runAll(seed, episodes, mode) {
  var t0 = Date.now();
  var tr = new Trainer({ mode: mode }, seed);
  tr.train(episodes);
  var trainMs = Date.now() - t0;
  var snaps = [];
  SNAP_EPS.forEach(function (ep) {
    if (ep > episodes) return;
    var accs = [], firsts = [], ui = null;
    for (var c = 0; c < CONCERT_REPEATS; c++) {
      var r = tr.concert(tr.snapshots[ep], 1000 + ep + c * 7919);
      accs.push(r.accuracy); firsts.push(r.firstPhraseAccuracy);
      if (c === 0) ui = r; // c=0 의 시드(1000+회차)가 화면 연주회와 같은 연주
    }
    var mean = function (xs) { return xs.reduce(function (s, x) { return s + x; }, 0) / xs.length; };
    snaps.push({
      ep: ep, acc: mean(accs), first: mean(firsts),
      uiAcc: ui.accuracy, uiFirst: ui.firstPhraseAccuracy, uiResults: Array.from(ui.results)
    });
  });
  return { trainer: tr, trainMs: trainMs, snaps: snaps };
}

function fingerprint(run) {
  var W = run.trainer.brain.W, h = 0;
  for (var i = 0; i < W.length; i++) h = (h * 31 + Math.round(W[i] * 1e6)) | 0;
  return JSON.stringify({ history: run.trainer.history, snaps: run.snaps, W: h });
}

var checks = [];
function check(group, name, ok, detail) { checks.push({ group: group, name: name, ok: !!ok, detail: detail || '' }); }

// ---------- 0. 기본 동작 검사 (RL-01 ~ RL-04) ----------
(function basicChecks() {
  var S = FP.SONG;
  var expected = [0,0,4,4,5,5,4, 3,3,2,2,1,1,0, 4,4,3,3,2,2,1, 4,4,3,3,2,2,1, 0,0,4,4,5,5,4, 3,3,2,2,1,1,0];
  check('기본', '악보 42음이 03 문서 표와 일치',
    S.length === 42 && S.every(function (n, i) { return n.note === expected[i] && n.beats === (n.beat === 6 ? 2 : 1); }));

  var env = new FP.PianoEnv(S, { maxMistakes: 3 });
  env.reset(); var r;
  do { r = env.step(env.observe().target); } while (!r.done);
  check('기본', '정답만 치면 42음 완주', r.t === 42 && r.mistakes === 0);
  env.reset(); var n = 0;
  do { var o = env.observe(); r = env.step((o.target + 1) % 8); n++; } while (!r.done);
  check('기본', '3번 틀리면 퇴장', n === 3 && r.mistakes === 3);

  var tr = new Trainer({}, 1);
  var obs = { phrase: 2, beat: 3, prevNote: 4 };
  var a1 = tr.brain.encode(obs);
  tr.brain._cache = {};
  var a2 = tr.brain.encode(obs);
  var same = a1.length === a2.length && a1.every(function (x, i) { return x === a2[i]; });
  var uniq = new Set(Array.from(a1)).size;
  check('기본', '같은 상태 → 같은 KC 패턴, 켜진 KC 정확히 k개', same && a1.length === tr.cfg.k && uniq === tr.cfg.k,
    '켜진 수 ' + a1.length);

  var V0 = tr.brain.values(a1);
  var a = 3, delta = 1 - V0[a];
  tr.brain.learn(a1, a, delta);
  var V1 = tr.brain.values(a1);
  var moved = V1[a] - V0[a], others = true;
  for (var k = 0; k < 8; k++) if (k !== a && V1[k] !== V0[k]) others = false;
  check('기본', '학습 1회 후 V[a]가 α·δ만큼 변함 (다른 건반은 그대로)',
    Math.abs(moved - tr.cfg.alpha * delta) < 1e-5 && others, '변화 ' + moved.toFixed(5));
})();

// ---------- 1. 메인 실행 ----------
console.log('');
console.log('초파리 첫 피아노 연주회 — 학습 시뮬레이션');
console.log('시드 ' + args.seed + ' · 연습 ' + args.episodes + '회 · 모드 ' + (args.mode === 'sparse' ? '산골(드문 보상)' : '대치동(매 음 보상)'));
var cfg = Object.assign({}, T.DEFAULT_CFG, { mode: args.mode });
console.log('파라미터 N_KC=' + cfg.nKC + ' k=' + cfg.k + ' fanIn=' + cfg.fanIn + ' α=' + cfg.alpha + ' β=' + cfg.beta + ' 실수제한=' + cfg.maxMistakes);
console.log('');

var run = runAll(args.seed, args.episodes, args.mode);
var H = run.trainer.history;

console.log('[회차별 기록] 10회 단위 평균');
console.log('  회차      | 도달 음 수 | 연습 정답률 | 평균 |도파민|');
for (var s = 0; s < H.length; s += 10) {
  var block = H.slice(s, s + 10);
  var avg = function (key) { return block.reduce(function (acc, h) { return acc + h[key]; }, 0) / block.length; };
  console.log('  ' + pad((s + 1) + '~' + (s + block.length), 9) + ' | ' + pad(avg('reached').toFixed(1), 10) + ' | ' +
    pad(pct(avg('accuracy')), 11) + ' | ' + pad(avg('meanAbsDelta').toFixed(3), 8));
}
console.log('');

console.log('[연습 일지 연주회] 스냅샷마다 연주회 ' + CONCERT_REPEATS + '번 평균 (시드 1000+회차+c×7919)');
console.log('  회차 | 별명               | 정답률(5회 평균) | 첫 소절 | 화면 연주회(시드 1000+회차)');
run.snaps.forEach(function (sn) {
  var name = FP.SNAPSHOTS.filter(function (x) { return x.ep === sn.ep; })[0].name;
  var row = sn.uiResults.map(function (x) { return x ? '■' : '·'; }).join('');
  console.log('  ' + pad(sn.ep, 4) + ' | ' + name + '　'.repeat(Math.max(0, 9 - name.length)) + ' | ' +
    pad(pct(sn.acc), 16) + ' | ' + pad(pct(sn.first), 7) + ' | ' + pad(pct(sn.uiAcc), 4) + ' ' + row);
});
console.log('');

// ---------- 2. 자동 검사 (5.3) ----------
function snapAt(ep) { return run.snaps.filter(function (x) { return x.ep === ep; })[0]; }
var full = args.episodes >= 300;

if (args.mode !== 'sparse') {
  if (snapAt(0)) check('5.3', '0회 연주회 정답률 < 25%', snapAt(0).acc < 0.25, pct(snapAt(0).acc));
  if (snapAt(15)) {
    check('5.3', '15회 첫 소절 정답률 ≥ 60%', snapAt(15).first >= 0.6, pct(snapAt(15).first));
    check('5.3', '15회 전체 정답률 ≤ 45%', snapAt(15).acc <= 0.45, pct(snapAt(15).acc));
  }
  if (snapAt(300)) check('5.3', '300회 연주회 정답률 ≥ 95%', snapAt(300).acc >= 0.95, pct(snapAt(300).acc));
  var monotone = true, worst = '';
  for (var i = 1; i < run.snaps.length; i++) {
    var drop = run.snaps[i - 1].acc - run.snaps[i].acc;
    if (drop > 0.05) { monotone = false; worst = run.snaps[i - 1].ep + '→' + run.snaps[i].ep + ' ' + (drop * 100).toFixed(0) + '%p 하락'; }
  }
  check('5.3', '스냅샷 정답률이 대체로 증가 (5%p 넘게 떨어지는 단계 없음)', monotone, worst);
  var last50 = H.slice(-50);
  var md = last50.reduce(function (a2, h) { return a2 + h.meanAbsDelta; }, 0) / last50.length;
  check('5.3', '마지막 50회 평균 |도파민| < 0.1', md < 0.1, md.toFixed(4));
}

var run2 = runAll(args.seed, args.episodes, args.mode);
check('5.3', '같은 시드로 두 번 실행 → 모든 숫자 완전히 동일', fingerprint(run) === fingerprint(run2));

if (full) {
  var t0 = Date.now();
  new Trainer({ mode: args.mode }, args.seed).train(300);
  var ms = Date.now() - t0;
  check('5.3', '300회 학습 시간 < 1,500ms', ms < 1500, ms + 'ms');
}

// RL-09: ×1(이벤트를 하나씩 받는 라이브 연습)로 30회 vs train(30) → W 완전히 동일
(function () {
  var a = new Trainer({ mode: args.mode }, args.seed);
  var b = new Trainer({ mode: args.mode }, args.seed);
  var events = 0;
  for (var e = 0; e < 30; e++) a.runEpisode({ onStep: function () { events++; } });
  b.train(30);
  var same = a.brain.W.length === b.brain.W.length && a.brain.W.every(function (x, i) { return x === b.brain.W[i]; });
  check('재현성', '×1로 30회 vs train(30) → W 완전히 동일', same && events > 0);
})();

// ---------- 3. 목표 범위 (4.2) ----------
var TARGETS = [
  { ep: 0, lo: 0.10, hi: 0.20 },
  { ep: 5, lo: 0.12, hi: 0.25 },
  { ep: 15, lo: 0.20, hi: 0.40, firstLo: 0.60 },
  { ep: 40, lo: 0.35, hi: 0.60 },
  { ep: 80, lo: 0.65, hi: 0.92 },
  { ep: 150, lo: 0.92, hi: 1.00 },
  { ep: 300, lo: 0.97, hi: 1.00 }
];
if (args.mode !== 'sparse') {
  TARGETS.forEach(function (tg) {
    var sn = snapAt(tg.ep);
    if (!sn) return;
    var ok = sn.acc >= tg.lo - 1e-9 && sn.acc <= tg.hi + 1e-9;
    var name = tg.ep + '회 정답률 ' + pct(tg.lo) + ' ~ ' + pct(tg.hi);
    if (tg.firstLo != null) { ok = ok && sn.first >= tg.firstLo; name += ', 첫 소절 ' + pct(tg.firstLo) + ' 이상'; }
    check('4.2', name, ok, pct(sn.acc) + (tg.firstLo != null ? ' / 첫 소절 ' + pct(sn.first) : ''));
  });
}

// ---------- 4. 산골 모드 (6장) ----------
if (args.mode === 'sparse' && full) {
  var dense = runAll(args.seed, 300, 'dense');
  var dAcc = dense.snaps.filter(function (x) { return x.ep === 300; })[0].acc;
  var sAcc = snapAt(300).acc;
  check('6장', '산골 300회 정답률이 대치동 300회보다 30%p 이상 낮음', dAcc - sAcc >= 0.30,
    '대치동 ' + pct(dAcc) + ' / 산골 ' + pct(sAcc));
}

// ---------- 결과 출력 ----------
console.log('[자동 검사]');
var fails = 0;
checks.forEach(function (c) {
  if (!c.ok) fails++;
  console.log('  ' + (c.ok ? 'PASS' : 'FAIL') + '  [' + c.group + '] ' + c.name + (c.detail ? '  (' + c.detail + ')' : ''));
});
console.log('');
console.log(fails === 0 ? '모든 검사 통과 (' + checks.length + '개)' : 'FAIL ' + fails + '개 / 전체 ' + checks.length + '개');

if (args.csv) {
  var lines = ['episode,reached,accuracy,meanAbsDelta,completed'];
  H.forEach(function (h) { lines.push([h.episode, h.reached, h.accuracy.toFixed(4), h.meanAbsDelta.toFixed(4), h.completed ? 1 : 0].join(',')); });
  fs.writeFileSync(path.resolve(args.csv), lines.join('\n'), 'utf8');
  console.log('CSV 저장: ' + path.resolve(args.csv));
}

process.exitCode = fails === 0 ? 0 : 1;
