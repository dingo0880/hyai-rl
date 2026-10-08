/* 악보 데이터 — 반짝반짝 작은 별 (계이름만, 가사 없음)
 * 18세기 프랑스 민요 "Ah! vous dirai-je, maman" 멜로디. 저작권 만료. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var FP = root.FlyPiano = root.FlyPiano || {};

  var KEY_NAMES = ['도', '레', '미', '파', '솔', '라', '시', '높은 도'];
  var KEY_SHORT = ['도', '레', '미', '파', '솔', '라', '시', '도'];

  // 소절마다 7음, 마지막 음은 2박 (docs/03_사운드.md 3장)
  var PHRASES = [
    [0, 0, 4, 4, 5, 5, 4],
    [3, 3, 2, 2, 1, 1, 0],
    [4, 4, 3, 3, 2, 2, 1],
    [4, 4, 3, 3, 2, 2, 1],
    [0, 0, 4, 4, 5, 5, 4],
    [3, 3, 2, 2, 1, 1, 0]
  ];

  var SONG = [];
  PHRASES.forEach(function (notes, phrase) {
    notes.forEach(function (note, beat) {
      SONG.push({ note: note, beats: beat === 6 ? 2 : 1, phrase: phrase, beat: beat });
    });
  });

  // 스냅샷 회차와 별명 (docs/02_기능.md 5장)
  var SNAPSHOTS = [
    { ep: 0, name: '갓 태어난 초파리' },
    { ep: 5, name: '건반이 뭔지 앎' },
    { ep: 15, name: '첫 소절 성공' },
    { ep: 40, name: '절반까지' },
    { ep: 80, name: '끝까지는 감' },
    { ep: 150, name: '거의 완벽' },
    { ep: 300, name: '초파리 마에스트로' }
  ];

  FP.SONG = SONG;
  FP.KEY_NAMES = KEY_NAMES;
  FP.KEY_SHORT = KEY_SHORT;
  FP.N_PHRASES = PHRASES.length;
  FP.PHRASE_LEN = 7;
  FP.SNAPSHOTS = SNAPSHOTS;

  if (typeof module !== 'undefined') {
    module.exports = { SONG: SONG, KEY_NAMES: KEY_NAMES, KEY_SHORT: KEY_SHORT, SNAPSHOTS: SNAPSHOTS };
  }
})();
