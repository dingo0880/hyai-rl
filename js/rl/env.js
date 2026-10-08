/* 피아노 환경
 * 상태: 몇 소절 · 몇 번째 박 + 방금 들린 음(초파리가 실제로 친 음)
 * 보상: 맞으면 +1(설탕), 틀리면 -1(찌릿). 틀려도 다음 음으로 넘어간다.
 * maxMistakes번 틀리면 퇴장 (연주회는 Infinity로 끝까지). */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var FP = root.FlyPiano = root.FlyPiano || {};

  var NO_NOTE = 8; // "방금 들린 음 없음" (곡의 첫 음)

  function PianoEnv(song, opts) {
    opts = opts || {};
    this.song = song;
    this.maxMistakes = opts.maxMistakes == null ? 3 : opts.maxMistakes;
    this.reset();
  }

  PianoEnv.prototype.reset = function () {
    this.t = 0;
    this.mistakes = 0;
    this.prevNote = NO_NOTE;
    this.done = false;
    return this.observe();
  };

  PianoEnv.prototype.observe = function () {
    var n = this.song[this.t];
    return { phrase: n.phrase, beat: n.beat, prevNote: this.prevNote, target: n.note, t: this.t };
  };

  PianoEnv.prototype.step = function (a) {
    if (this.done) throw new Error('에피소드가 이미 끝났어요');
    var target = this.song[this.t].note;
    var correct = a === target;
    if (!correct) this.mistakes++;
    this.prevNote = a;
    this.t++;
    this.done = this.t >= this.song.length || this.mistakes >= this.maxMistakes;
    return { reward: correct ? 1 : -1, correct: correct, done: this.done, mistakes: this.mistakes, t: this.t };
  };

  PianoEnv.NO_NOTE = NO_NOTE;
  FP.PianoEnv = PianoEnv;
  if (typeof module !== 'undefined') module.exports = { PianoEnv: PianoEnv, NO_NOTE: NO_NOTE };
})();
