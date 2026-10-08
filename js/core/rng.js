/* 시드 고정 난수 (mulberry32)
 * 같은 시드 → 항상 같은 수열. 발표 때마다 똑같은 결과가 나오게 한다. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var FP = root.FlyPiano = root.FlyPiano || {};

  function makeRng(seed) {
    var s = seed >>> 0;
    function next() {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next: next,
      int: function (n) { return Math.floor(next() * n); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; }
    };
  }

  FP.makeRng = makeRng;
  if (typeof module !== 'undefined') module.exports = { makeRng: makeRng };
})();
