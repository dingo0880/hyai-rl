/* 버섯체 모델 (Mushroom Body)
 *
 *  [입력 PN 22개] --무작위 고정 연결--> [케년세포 KC nKC개, 상위 k개만 켜짐]
 *                                            | 학습되는 연결 W
 *                                            v
 *                                   [출력 MBON 8개 = 건반 8개]
 *
 * PN 22개 = 소절 one-hot 6 + 박 one-hot 7 + 방금 들린 음 one-hot 9 (건반 8 + 없음)
 * V[a] = (1/k) Σ(켜진 KC i) W[a][i]          → 건반 a의 예상 보상
 * 정책  = softmax(β × V)
 * 학습  = 켜진 KC i마다 W[a][i] += α × δ,  δ = r − V[a] (도파민 = 예측오차)
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var FP = root.FlyPiano = root.FlyPiano || {};

  var N_PHRASE = 6, N_BEAT = 7, N_PREV = 9;
  var N_PN = N_PHRASE + N_BEAT + N_PREV; // 22

  function MushroomBody(cfg, rng) {
    this.nKC = cfg.nKC;
    this.k = cfg.k;
    this.fanIn = cfg.fanIn;
    this.alpha = cfg.alpha;
    this.beta = cfg.beta;
    this.nKeys = cfg.nKeys || 8;
    this.nPN = N_PN;

    // PN → KC 무작위 고정 연결 (학습하지 않음)
    // pnToKc[p] = 그 PN이 연결된 KC 목록, pnToW[p] = 연결 세기
    var lists = [], wlists = [], p, i, j;
    for (p = 0; p < N_PN; p++) { lists.push([]); wlists.push([]); }
    var pool = [];
    for (p = 0; p < N_PN; p++) pool.push(p);
    for (i = 0; i < this.nKC; i++) {
      // PN 22개 중 서로 다른 fanIn개를 고른다 (부분 Fisher-Yates)
      for (j = 0; j < this.fanIn; j++) {
        var r = j + rng.int(N_PN - j);
        var tmp = pool[j]; pool[j] = pool[r]; pool[r] = tmp;
        lists[pool[j]].push(i);
        wlists[pool[j]].push(0.5 + rng.next()); // 0.5 ~ 1.5
      }
    }
    this.pnToKc = lists.map(function (l) { return Int32Array.from(l); });
    this.pnToW = wlists.map(function (l) { return Float64Array.from(l); });

    // 동점 처리용 KC별 고정 노이즈 (1e-6 수준)
    this.tieNoise = new Float64Array(this.nKC);
    for (i = 0; i < this.nKC; i++) this.tieNoise[i] = rng.next() * 1e-6;

    // 학습되는 연결: Float32Array(nKeys × nKC), 처음엔 전부 0
    this.W = new Float32Array(this.nKeys * this.nKC);

    this._cache = {};
    this._drive = new Float64Array(this.nKC);
    this._order = new Int32Array(this.nKC);
  }

  MushroomBody.prototype.pnIndices = function (obs) {
    return [obs.phrase, N_PHRASE + obs.beat, N_PHRASE + N_BEAT + obs.prevNote];
  };

  // 켜진 KC 인덱스 k개 (Int32Array, 오름차순). 가능한 상태가 378개뿐이라 캐시한다.
  MushroomBody.prototype.encode = function (obs) {
    var key = (obs.phrase * N_BEAT + obs.beat) * N_PREV + obs.prevNote;
    var hit = this._cache[key];
    if (hit) return hit;

    var drive = this._drive, nKC = this.nKC, i, j;
    for (i = 0; i < nKC; i++) drive[i] = this.tieNoise[i];
    var pns = this.pnIndices(obs);
    for (j = 0; j < pns.length; j++) {
      var kcs = this.pnToKc[pns[j]], ws = this.pnToW[pns[j]];
      for (i = 0; i < kcs.length; i++) drive[kcs[i]] += ws[i];
    }
    // k-WTA: 입력 합 상위 k개만 켜짐 (APL 뉴런의 전체 억제를 흉내)
    var order = this._order;
    for (i = 0; i < nKC; i++) order[i] = i;
    var sorted = Array.prototype.slice.call(order).sort(function (a, b) {
      return drive[b] - drive[a] || a - b;
    });
    var active = Int32Array.from(sorted.slice(0, this.k)).sort();
    this._cache[key] = active;
    return active;
  };

  // 건반별 예상 보상. W를 넘기면 그 가중치(스냅샷)로 계산.
  MushroomBody.prototype.values = function (active, W) {
    W = W || this.W;
    var V = new Float32Array(this.nKeys), nKC = this.nKC, k = active.length;
    for (var a = 0; a < this.nKeys; a++) {
      var base = a * nKC, sum = 0;
      for (var j = 0; j < k; j++) sum += W[base + active[j]];
      V[a] = sum / k;
    }
    return V;
  };

  // softmax(β × V) 확률
  MushroomBody.prototype.probs = function (values) {
    var n = values.length, beta = this.beta, m = -Infinity, a;
    for (a = 0; a < n; a++) if (beta * values[a] > m) m = beta * values[a];
    var p = new Float64Array(n), sum = 0;
    for (a = 0; a < n; a++) { p[a] = Math.exp(beta * values[a] - m); sum += p[a]; }
    for (a = 0; a < n; a++) p[a] /= sum;
    return p;
  };

  // 건반 선택. greedy면 가장 큰 값(동점이면 낮은 번호), 아니면 softmax 샘플링.
  MushroomBody.prototype.act = function (values, rng, greedy) {
    var n = values.length, a;
    if (greedy) {
      var best = 0;
      for (a = 1; a < n; a++) if (values[a] > values[best]) best = a;
      return best;
    }
    var p = this.probs(values);
    var u = rng.next();
    for (a = 0; a < n; a++) {
      u -= p[a];
      if (u < 0) return a;
    }
    return n - 1;
  };

  // 도파민 학습: 고른 건반 a의 연결만, 켜진 KC마다 α × δ
  MushroomBody.prototype.learn = function (active, a, delta) {
    var step = this.alpha * delta, base = a * this.nKC, W = this.W;
    for (var j = 0; j < active.length; j++) W[base + active[j]] += step;
  };

  MushroomBody.prototype.snapshot = function () { return this.W.slice(); };
  MushroomBody.prototype.load = function (snapshot) { this.W.set(snapshot); };

  MushroomBody.N_PN = N_PN;
  FP.MushroomBody = MushroomBody;
  if (typeof module !== 'undefined') module.exports = { MushroomBody: MushroomBody };
})();
