/* 간단한 이벤트 버스: on / off / emit
 * 이벤트: 'state', 'step', 'episodeEnd', 'snapshot', 'concertEnd', 'timelapseStage', 'trained', 'reset' */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var FP = root.FlyPiano = root.FlyPiano || {};
  var handlers = {};

  FP.events = {
    on: function (name, fn) {
      (handlers[name] = handlers[name] || []).push(fn);
    },
    off: function (name, fn) {
      var list = handlers[name];
      if (!list) return;
      var i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit: function (name, data) {
      var list = handlers[name];
      if (!list) return;
      list.slice().forEach(function (fn) {
        try { fn(data); } catch (e) { console.error('[events] ' + name, e); }
      });
    }
  };
})();
