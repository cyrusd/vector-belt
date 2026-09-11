// js/util.js — vector helpers, wrap math, rng, clamp/lerp, object pool.
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Shortest signed angle delta from a to b, result in (-PI, PI].
  function angleDelta(a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function wrap(v, max) {
    v = v % max;
    if (v < 0) v += max;
    return v;
  }

  // Shortest wrapped delta between two 1D coordinates on a torus of length `size`.
  function wrapDelta1(a, b, size) {
    var d = b - a;
    var half = size / 2;
    if (d > half) d -= size;
    if (d < -half) d += size;
    return d;
  }

  // Fills out.dx/out.dy/out.dist with the shortest wrapped delta between two points.
  function wrapDelta(ax, ay, bx, by, worldW, worldH, out) {
    out.dx = wrapDelta1(ax, bx, worldW);
    out.dy = wrapDelta1(ay, by, worldH);
    out.dist = Math.sqrt(out.dx * out.dx + out.dy * out.dy);
    return out;
  }

  // Simple deterministic-friendly PRNG (mulberry32). Not seeded per-run; using Math.random is fine
  // here, but we centralize it so it's easy to swap for testing.
  function rand() { return Math.random(); }
  function randRange(lo, hi) { return lo + rand() * (hi - lo); }
  function randInt(lo, hiInclusive) { return Math.floor(randRange(lo, hiInclusive + 1)); }
  function randSign() { return rand() < 0.5 ? -1 : 1; }

  // Generic object pool. `factory` creates a new object; `reset` reinitializes one for reuse.
  function makePool(factory, reset, initialSize) {
    var free = [];
    for (var i = 0; i < (initialSize || 0); i++) free.push(factory());
    return {
      acquire: function () {
        var obj = free.length ? free.pop() : factory();
        if (reset) reset(obj);
        return obj;
      },
      release: function (obj) {
        free.push(obj);
      },
      freeCount: function () { return free.length; }
    };
  }

  // Swap-remove an element at index i from array arr (order not preserved).
  function swapRemove(arr, i) {
    var last = arr.length - 1;
    if (i !== last) arr[i] = arr[last];
    arr.pop();
  }

  VB.util = {
    clamp: clamp,
    lerp: lerp,
    angleDelta: angleDelta,
    wrap: wrap,
    wrapDelta1: wrapDelta1,
    wrapDelta: wrapDelta,
    rand: rand,
    randRange: randRange,
    randInt: randInt,
    randSign: randSign,
    makePool: makePool,
    swapRemove: swapRemove
  };
})();
