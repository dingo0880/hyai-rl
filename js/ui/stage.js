/* 무대: 악보 띠, 피아노, 초파리, 말풍선, 관객, 자막, 결과 카드 (docs/01_디자인_UI.md 4장)
 * 그림만 담당한다. 언제 무엇을 보여줄지는 main.js가 정한다. */
(function () {
  'use strict';
  var FP = window.FlyPiano = window.FlyPiano || {};
  var $ = function (id) { return document.getElementById(id); };

  // ---------- 초파리 SVG (직접 그린 그림) ----------
  function flySVG() {
    return '' +
      '<svg class="fly-svg" viewBox="0 0 100 104" aria-hidden="true">' +
      '<g class="fly-body-g">' +
        '<g class="wings">' +
          '<ellipse class="wing wing-l" cx="25" cy="50" rx="12" ry="24" transform="rotate(-38 25 50)"/>' +
          '<ellipse class="wing wing-r" cx="75" cy="50" rx="12" ry="24" transform="rotate(38 75 50)"/>' +
        '</g>' +
        '<g class="legs">' +
          '<path class="leg leg-front l" d="M37 66 Q26 66 21 75"/>' +
          '<path class="leg" d="M36 74 Q25 80 22 92"/>' +
          '<path class="leg" d="M41 82 Q34 92 35 101"/>' +
          '<path class="leg leg-front r" d="M63 66 Q74 66 79 75"/>' +
          '<path class="leg" d="M64 74 Q75 80 78 92"/>' +
          '<path class="leg" d="M59 82 Q66 92 65 101"/>' +
        '</g>' +
        '<ellipse class="thorax" cx="50" cy="74" rx="17" ry="19"/>' +
        '<path class="stripe" d="M36 78 Q50 84 64 78"/>' +
        '<path class="stripe" d="M38 86 Q50 91 62 86"/>' +
        '<g class="head">' +
          '<g class="antennae">' +
            '<path class="antenna" d="M45 31 Q42 21 37 17"/><circle class="antenna-tip" cx="37" cy="17" r="2.3"/>' +
            '<path class="antenna" d="M55 31 Q58 21 63 17"/><circle class="antenna-tip" cx="63" cy="17" r="2.3"/>' +
          '</g>' +
          '<circle class="head-c" cx="50" cy="45" r="16"/>' +
          '<g class="eyes-open">' +
            '<ellipse class="eye" cx="37.5" cy="42" rx="10.5" ry="12"/>' +
            '<ellipse class="eye" cx="62.5" cy="42" rx="10.5" ry="12"/>' +
            '<circle class="shine" cx="34" cy="37" r="3.4"/><circle class="shine" cx="59" cy="37" r="3.4"/>' +
            '<circle class="shine" cx="40" cy="47.5" r="1.5"/><circle class="shine" cx="65" cy="47.5" r="1.5"/>' +
          '</g>' +
          '<g class="eyes-x">' +
            '<ellipse class="eye" cx="37.5" cy="42" rx="10.5" ry="12"/>' +
            '<ellipse class="eye" cx="62.5" cy="42" rx="10.5" ry="12"/>' +
            '<path class="eye-x" d="M33 37.5 L42 46.5 M42 37.5 L33 46.5"/>' +
            '<path class="eye-x" d="M58 37.5 L67 46.5 M67 37.5 L58 46.5"/>' +
          '</g>' +
          '<circle class="blush" cx="41" cy="54" r="2.6"/><circle class="blush" cx="59" cy="54" r="2.6"/>' +
          '<path class="mouth" d="M46 54.5 Q50 58.5 54 54.5"/>' +
          '<path class="mouth-sad" d="M46 57.5 Q50 54 54 57.5"/>' +
          '<g class="prop-glasses">' +
            '<circle class="glass" cx="37.5" cy="42" r="9"/><circle class="glass" cx="62.5" cy="42" r="9"/>' +
            '<path class="glass" d="M46.5 41 Q50 38.5 53.5 41"/>' +
          '</g>' +
          '<g class="prop-hat">' +
            '<ellipse class="hat-brim" cx="50" cy="30" rx="27" ry="5.5"/>' +
            '<path class="hat-crown" d="M36 30 Q37 14 50 14 Q63 14 64 30 Z"/>' +
            '<rect class="hat-band" x="36.5" y="24" width="27" height="4" rx="1"/>' +
          '</g>' +
        '</g>' +
      '</g>' +
      '<g class="sugar">' +
        '<rect class="sugar-cube" x="42" y="-6" width="16" height="14" rx="2.5"/>' +
        '<path class="sparkle" d="M30 -4 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z"/>' +
        '<path class="sparkle" d="M70 -10 l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 z"/>' +
      '</g>' +
      '<g class="zap">' +
        '<path class="zap-bolt" d="M84 8 L72 30 L80 30 L70 52 L90 24 L81 24 L90 8 Z"/>' +
        '<path class="zap-bolt" d="M18 20 L10 34 L16 34 L10 48 L24 30 L18 30 L23 20 Z"/>' +
      '</g>' +
      '</svg>';
  }

  // ---------- 관객 얼굴 ----------
  function faceSVG(i) {
    var skin = 'skin-' + (1 + (i * 7) % 4), shirt = 'shirt-' + (1 + (i * 3) % 4);
    return '' +
      '<svg viewBox="0 0 40 50" aria-hidden="true">' +
        '<rect class="torso ' + shirt + '" x="7" y="33" width="26" height="20" rx="10"/>' +
        '<circle class="' + skin + '" cx="20" cy="19" r="13"/>' +
        '<g class="e-dot"><circle class="dot" cx="15" cy="17.5" r="1.8"/><circle class="dot" cx="25" cy="17.5" r="1.8"/></g>' +
        '<g class="e-sq"><path class="ln" d="M12.5 15.5 L16.5 17.5 L12.5 19.5"/><path class="ln" d="M27.5 15.5 L23.5 17.5 L27.5 19.5"/></g>' +
        '<circle class="blush" cx="12" cy="23" r="2"/><circle class="blush" cx="28" cy="23" r="2"/>' +
        '<path class="ln m-happy" d="M14.5 23.5 Q20 29.5 25.5 23.5"/>' +
        '<path class="ln m-flat" d="M15.5 25.5 L24.5 25.5"/>' +
        '<path class="ln m-zig" d="M14 26 L16 24 L18 26 L20 24 L22 26 L24 24 L26 26"/>' +
        '<ellipse class="ln m-o" cx="20" cy="25.5" rx="2.6" ry="3.2"/>' +
        '<g class="h-ears"><circle class="' + skin + '" cx="6.5" cy="19" r="4"/><circle class="' + skin + '" cx="33.5" cy="19" r="4"/></g>' +
        '<g class="h-clap"><circle class="' + skin + '" cx="16" cy="38" r="3.6"/><circle class="' + skin + '" cx="24" cy="38" r="3.6"/></g>' +
        '<text class="qmark" x="31" y="6">?</text>' +
      '</svg>';
  }

  var N_AUD = 14;
  var MOODS = ['mood-happy', 'mood-neutral', 'mood-cringe', 'mood-ears', 'mood-tilt', 'mood-clap', 'mood-stand', 'mood-wow'];

  var St = {
    flyKey: 3.5,
    chips: [],
    current: -1,
    bubbleUntil: 0,
    lastBubble: -1e9
  };

  St.makeFlySVG = flySVG;

  St.init = function () {
    // 피아노 건반
    var keys = $('keys');
    FP.KEY_NAMES.forEach(function (name, i) {
      var k = document.createElement('div');
      k.className = 'key' + (name.length > 2 ? ' small-name' : '');
      k.dataset.key = i;
      k.innerHTML = '<span class="key-mark"></span><span class="key-name">' + name + '</span>';
      keys.appendChild(k);
    });
    // 검은 건반은 장식 (도#, 레#, 파#, 솔#, 라#)
    [0, 1, 3, 4, 5].forEach(function (i) {
      var b = document.createElement('div');
      b.className = 'black-key';
      b.style.left = ((i + 1) * 12.5) + '%';
      keys.appendChild(b);
    });
    St.keyEls = Array.prototype.slice.call(keys.querySelectorAll('.key'));

    // 초파리
    $('fly').innerHTML = flySVG();
    St.flyEl = $('fly');
    St.moverEl = $('flyMover');
    St.hopEl = $('flyHop');
    St.placeFly(3.5, false);

    // 악보 띠
    St.buildStrip();

    // 관객
    var aud = $('audience');
    for (var i = 0; i < N_AUD; i++) {
      var d = document.createElement('div');
      d.className = 'aud mood-happy';
      d.style.setProperty('--d', (-(i * 0.137) % 0.5).toFixed(2) + 's');
      d.innerHTML = faceSVG(i);
      aud.appendChild(d);
    }
    St.audEls = Array.prototype.slice.call(aud.children);

    window.addEventListener('resize', function () { St.scrollStrip(true); St.aimSpot(); });
  };

  // ---------- 악보 띠 ----------
  St.buildStrip = function () {
    var track = $('stripTrack');
    track.innerHTML = '';
    St.chips = [];
    FP.SONG.forEach(function (n, t) {
      if (t > 0 && n.beat === 0) {
        var bl = document.createElement('div');
        bl.className = 'bar-line';
        track.appendChild(bl);
      }
      var c = document.createElement('div');
      c.className = 'note-chip' + (n.beats === 2 ? ' long' : '');
      c.textContent = FP.KEY_SHORT[n.note];
      track.appendChild(c);
      St.chips.push(c);
    });
    St.current = -1;
    St.scrollStrip(true);
  };

  St.resetStrip = function () {
    St.chips.forEach(function (c) {
      c.className = 'note-chip' + (c.classList.contains('long') ? ' long' : '');
      c.removeAttribute('data-mark');
      c.title = '';
    });
    St.current = -1;
    St.setCurrent(0);
  };

  St.setCurrent = function (t) {
    if (St.current >= 0 && St.chips[St.current]) St.chips[St.current].classList.remove('current');
    St.current = t;
    if (t >= 0 && St.chips[t]) St.chips[t].classList.add('current');
    St.scrollStrip(false);
  };

  St.scrollStrip = function (instant) {
    var track = $('stripTrack'), strip = $('strip');
    var t = St.current < 0 ? 0 : Math.min(St.current, St.chips.length - 1);
    var c = St.chips[t];
    if (!c) return;
    var center = c.offsetLeft + c.offsetWidth / 2;
    var x = strip.clientWidth / 2 - center;
    if (instant) track.style.transition = 'none';
    track.style.transform = 'translateX(' + x + 'px)';
    if (instant) { void track.offsetWidth; track.style.transition = ''; }
  };

  St.markNote = function (t, correct, played) {
    var c = St.chips[t];
    if (!c) return;
    c.classList.remove('ok', 'ng', 'skip');
    c.classList.add(correct ? 'ok' : 'ng');
    c.setAttribute('data-mark', correct ? '✓' : '✗');
    c.title = correct ? '맞음' : '틀림 (친 음: ' + FP.KEY_NAMES[played] + ')';
  };

  St.markSkipped = function (from) {
    for (var t = from; t < St.chips.length; t++) St.chips[t].classList.add('skip');
  };

  // ---------- 피아노 ----------
  St.pressKey = function (key, result, holdMs) {
    var k = St.keyEls[key];
    if (!k) return;
    clearTimeout(k._rel);
    k.classList.remove('glow-ok', 'glow-ng', 'mark-ok', 'mark-ng', 'glow-hint');
    void k.offsetWidth;
    k.classList.add('pressed');
    if (result === true) { k.classList.add('glow-ok', 'mark-ok'); k.querySelector('.key-mark').textContent = '✓'; }
    else if (result === false) { k.classList.add('glow-ng', 'mark-ng'); k.querySelector('.key-mark').textContent = '✗'; }
    else k.classList.add('glow-hint');
    k._rel = setTimeout(function () {
      k.classList.remove('pressed', 'glow-ok', 'glow-ng', 'mark-ok', 'mark-ng', 'glow-hint');
    }, holdMs || 320);
  };

  St.releaseAllKeys = function () {
    St.keyEls.forEach(function (k) {
      clearTimeout(k._rel);
      k.classList.remove('pressed', 'glow-ok', 'glow-ng', 'mark-ok', 'mark-ng', 'glow-hint');
    });
  };

  // ---------- 초파리 ----------
  function keyX(key) { return ((key + 0.5) / 8) * 100; }

  St.placeFly = function (key, animate) {
    St.flyKey = key;
    var x = keyX(key) + '%';
    if (!animate) St.moverEl.style.transition = 'none';
    St.moverEl.style.setProperty('--fly-x', x);
    St.aimSpot();
    if (!animate) { void St.moverEl.offsetWidth; St.moverEl.style.transition = ''; }
  };

  // 스포트라이트가 초파리를 따라간다
  St.aimSpot = function () {
    var kr = $('keys').getBoundingClientRect(), pr = $('performer').getBoundingClientRect();
    var px = kr.left - pr.left + kr.width * (St.flyKey + 0.5) / 8;
    $('spot').style.setProperty('--spot-x', px + 'px');
  };

  // 다음 건반으로 포물선 점프 (150ms)
  St.flyJump = function (key) {
    St.clearFlyPose();
    St.placeFly(key, true);
    var hop = St.hopEl;
    hop.classList.remove('hop');
    void hop.offsetWidth;
    hop.classList.add('hop');
    St.flyEl.classList.add('fast');
    clearTimeout(St._fastT);
    St._fastT = setTimeout(function () { St.flyEl.classList.remove('fast'); }, 220);
  };

  St.clearFlyPose = function () {
    St.flyEl.classList.remove('correct', 'wrong', 'sugar-on', 'zap-on', 'bow', 'sad', 'walking');
  };

  // pose: 'correct' | 'wrong' | 'bow' | 'sad'
  St.flyPose = function (pose, opts) {
    opts = opts || {};
    var f = St.flyEl;
    St.clearFlyPose();
    void f.offsetWidth;
    f.classList.add(pose);
    if (pose === 'correct' && opts.sugar) f.classList.add('sugar-on');
    if (pose === 'wrong' && opts.zap) f.classList.add('zap-on');
    clearTimeout(St._poseT);
    var ms = pose === 'bow' ? 1100 : pose === 'sad' ? 0 : 320;
    if (ms) St._poseT = setTimeout(function () { f.classList.remove(pose, 'sugar-on', 'zap-on'); }, ms);
  };

  // 퇴장: 고개 숙이고 무대 옆으로 터덜터덜 (1s)
  St.flyExit = function () {
    St.clearFlyPose();
    St.flyEl.classList.add('sad', 'walking');
    St.moverEl.classList.add('exiting');
    St.moverEl.style.setProperty('--fly-x', '112%');
  };

  // 무대로 돌아오기 (퇴장 후 다음 연습 때)
  St.flyReturn = function (key) {
    var m = St.moverEl;
    if (!m.classList.contains('exiting')) { St.clearFlyPose(); return; }
    m.classList.remove('exiting');
    m.classList.add('entering');
    St.clearFlyPose();
    St.placeFly(key == null ? 3.5 : key, false);
    void m.offsetWidth;
    m.classList.remove('entering');
  };

  St.setFlyProps = function (el, props) {
    el.classList.toggle('with-glasses', !!props.glasses);
    el.classList.toggle('with-hat', !!props.hat);
  };

  // ---------- 말풍선 (최소 2초 간격, 최대 1.5초 표시) ----------
  St.say = function (text, opts) {
    opts = opts || {};
    var now = performance.now();
    if (!opts.force && now - St.lastBubble < 2000) return false;
    St.lastBubble = now;
    var b = $('bubble');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(St._bubT);
    St._bubT = setTimeout(function () { b.classList.remove('show'); }, opts.ms || 1500);
    return true;
  };
  St.hideBubble = function () {
    clearTimeout(St._bubT);
    $('bubble').classList.remove('show');
  };

  // ---------- 관객 ----------
  function setMood(el, mood) {
    MOODS.forEach(function (m) { el.classList.remove(m); });
    el.classList.add(mood);
  }

  // 연주 중: 틀린 비율에 따라 표정이 😀 → 😐 → 😖 (얼굴마다 참을성이 다름)
  St.audienceLive = function (wrongRatio, played) {
    if (played < 3) return;
    St.audEls.forEach(function (el, i) {
      var patience = 0.15 + ((i * 37) % 14) / 14 * 0.5; // 0.15 ~ 0.65
      var mood = wrongRatio > patience + 0.25 ? 'mood-cringe' : wrongRatio > patience ? 'mood-neutral' : 'mood-happy';
      setMood(el, mood);
    });
  };

  // 끝난 뒤 반응: 'ears' | 'tilt' | 'clap-some' | 'clap' | 'stand' | 'boo'
  St.audienceReact = function (kind) {
    St.audEls.forEach(function (el, i) {
      var r = ((i * 53) % 14) / 14;
      var mood;
      if (kind === 'ears') mood = r < 0.45 ? 'mood-ears' : 'mood-cringe';
      else if (kind === 'boo') mood = r < 0.25 ? 'mood-ears' : 'mood-cringe';
      else if (kind === 'tilt') mood = r < 0.6 ? 'mood-tilt' : 'mood-neutral';
      else if (kind === 'clap-some') mood = r < 0.5 ? 'mood-clap' : 'mood-happy';
      else if (kind === 'clap') mood = 'mood-clap';
      else if (kind === 'stand') mood = 'mood-stand';
      else mood = 'mood-happy';
      setMood(el, mood);
    });
    if (kind === 'stand') St.throwFlowers();
  };

  St.audienceReset = function () {
    St.audEls.forEach(function (el) { setMood(el, 'mood-happy'); });
  };

  St.throwFlowers = function () {
    var stage = $('stage');
    var kinds = ['🌸', '🌹', '💐', '🌷', '🌼'];
    for (var i = 0; i < 12; i++) {
      var f = document.createElement('div');
      f.className = 'flower';
      f.textContent = kinds[i % kinds.length];
      f.style.left = (6 + i * 7.6) + '%';
      f.style.setProperty('--d', (i % 4) * 0.18 + 's');
      f.style.setProperty('--dx', ((50 - (6 + i * 7.6)) * 0.35).toFixed(1) + 'rem');
      f.style.setProperty('--rot', (i % 2 ? 1 : -1) * (200 + i * 20) + 'deg');
      stage.appendChild(f);
      setTimeout(function (el) { el.remove(); }.bind(null, f), 2600);
    }
  };

  // ---------- 자막 ----------
  St.showCaption = function (html) {
    $('captionText').innerHTML = html;
    $('caption').classList.add('show');
  };
  St.hideCaption = function () { $('caption').classList.remove('show'); };

  // ---------- 연주회 조명 ----------
  St.setConcertLights = function (on) {
    document.body.classList.toggle('concert', !!on);
  };

  // ---------- 결과 카드 ----------
  St.showResult = function (r) {
    $('rcTitle').textContent = r.title;
    $('rcScore').textContent = '42음 중 ' + r.correct + '음 정답 (' + Math.round(r.accuracy * 100) + '%)';
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= r.stars ? '★' : '<span class="off">★</span>';
    $('rcStars').innerHTML = s;
    $('rcCritic').textContent = '"' + r.critic + '"';
    $('rcCrowd').textContent = '관객 반응: ' + r.crowd;
    $('resultCard').classList.add('show');
  };
  St.hideResult = function () { $('resultCard').classList.remove('show'); };
  St.resultOpen = function () { return $('resultCard').classList.contains('show'); };

  // ---------- 타임랩스 진행 표시 ●●●○○○○ ----------
  St.timelapseProgress = function (k, n, label) {
    var el = $('tlProgress');
    if (k == null) { el.hidden = true; return; }
    el.hidden = false;
    var html = '<span>🎬 성장 타임랩스</span>';
    for (var i = 0; i < n; i++) html += '<span class="tl-dot' + (i < k ? ' done' : i === k ? ' now' : '') + '"></span>';
    if (label) html += '<span>' + label + '</span>';
    el.innerHTML = html;
  };

  St.fastBadge = function (on, text) {
    var b = $('fastBadge');
    if (text) b.textContent = text;
    b.classList.toggle('show', !!on);
  };

  // ---------- 헤더 카운터 ----------
  St.setCounter = function (n) {
    var b = $('epCount');
    if (b.textContent === String(n)) return;
    b.textContent = n;
    b.classList.remove('bump');
    void b.offsetWidth;
    b.classList.add('bump');
  };

  FP.stage = St;
})();
