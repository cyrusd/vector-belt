// js/audio.js — Web Audio synth: unlock, master gain, one-shot and looping sounds.
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var CFG = VB.CFG.AUDIO;

  var ctx = null;
  var master = null;
  var noiseBuffer = null;
  var unlocked = false;
  var muted = false;

  var activeExplosions = 0;

  // Persistent loop nodes (created once, gain toggled).
  var thrustLoop = null;   // { src, filter, gain }
  var saucerLoop = null;   // { osc, lfo, lfoGain, gain, baseFreq }

  // Desired loop state, kept apart from the nodes so mute/unmute or a late unlock can
  // re-apply it, and so per-step calls only touch AudioParams when something changes.
  var thrustOn = false;
  var saucerOn = false;
  var saucerSmall = false;

  function makeNoiseBuffer(ac) {
    var length = ac.sampleRate * 1; // 1 second
    var buffer = ac.createBuffer(1, length, ac.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function ensureContext() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    noiseBuffer = makeNoiseBuffer(ctx);
    return ctx;
  }

  function unlock() {
    var ac = ensureContext();
    if (!ac) return;
    if (ac.state !== 'running') { // iOS can also report 'interrupted'
      ac.resume().catch(function () {});
    }
    if (!unlocked) {
      unlocked = true;
      initLoops();
    }
  }

  function initLoops() {
    if (!ctx) return;
    // Thrust loop: noise -> lowpass -> gain(0) -> master, started once and left running.
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = CFG.THRUST_LOWPASS;
    var gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    try { src.start(); } catch (e) {}
    thrustLoop = { src: src, filter: filter, gain: gain };

    // Saucer loop: square carrier with LFO on frequency, gain(0) until a saucer exists.
    var osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = CFG.SAUCER_LARGE_FREQ;
    var sGain = ctx.createGain();
    sGain.gain.value = 0;
    var lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = CFG.SAUCER_LFO_FREQ;
    var lfoGain = ctx.createGain();
    lfoGain.gain.value = CFG.SAUCER_LFO_DEPTH;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(sGain);
    sGain.connect(master);
    try { osc.start(); lfo.start(); } catch (e) {}
    saucerLoop = { osc: osc, lfo: lfo, lfoGain: lfoGain, gain: sGain };
    applyThrust();
    applySaucer();
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function playTone(type, freqStart, freqEnd, dur, gainPeak) {
    if (!ctx || muted) return;
    var t = now();
    var osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    }
    var g = ctx.createGain();
    g.gain.setValueAtTime(gainPeak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function fire() {
    playTone('square', CFG.FIRE_FREQ_START, CFG.FIRE_FREQ_END, CFG.FIRE_DUR, CFG.FIRE_GAIN);
  }

  function applyThrust() {
    if (!ctx || !thrustLoop) return;
    thrustLoop.gain.gain.setTargetAtTime(thrustOn && !muted ? CFG.THRUST_GAIN : 0, now(), 0.03);
  }

  // Called every sim step, so it only schedules automation on an actual change.
  function setThrust(active) {
    active = !!active;
    if (active === thrustOn) return;
    thrustOn = active;
    applyThrust();
  }

  function explode(size) {
    if (!ctx || muted) return;
    if (activeExplosions >= CFG.MAX_SIMULT_EXPLOSIONS) return;
    var spec = size === 'L' ? CFG.EXPLODE_L : (size === 'M' ? CFG.EXPLODE_M : CFG.EXPLODE_S);
    var t = now();
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.lowpass;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + spec.decay);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + spec.decay + 0.05);
    activeExplosions++;
    src.onended = function () {
      activeExplosions = Math.max(0, activeExplosions - 1);
    };
  }

  var beatToggle = false;
  function beat() {
    var freq = beatToggle ? CFG.BEAT2_FREQ : CFG.BEAT1_FREQ;
    beatToggle = !beatToggle;
    playTone('triangle', freq, freq, CFG.BEAT_DUR, CFG.BEAT_GAIN);
  }

  function applySaucer() {
    if (!ctx || !saucerLoop) return;
    saucerLoop.osc.frequency.setTargetAtTime(
      saucerSmall ? CFG.SAUCER_SMALL_FREQ : CFG.SAUCER_LARGE_FREQ, now(), 0.05
    );
    saucerLoop.gain.gain.setTargetAtTime(saucerOn && !muted ? 0.2 : 0, now(), 0.03);
  }

  function setSaucer(active, isSmall) {
    active = !!active;
    isSmall = !!isSmall;
    if (active === saucerOn && (!active || isSmall === saucerSmall)) return;
    saucerOn = active;
    if (active) saucerSmall = isSmall;
    applySaucer();
  }

  function hyperspace() {
    playTone('sine', CFG.HYPERSPACE_FREQ_START, CFG.HYPERSPACE_FREQ_END, CFG.HYPERSPACE_DUR, 0.2);
  }

  // Rising triangle-wave arpeggio for an earned ship.
  function extraLife() {
    if (!ctx || muted) return;
    var freqs = CFG.EXTRA_LIFE_FREQS;
    var t0 = now();
    for (var i = 0; i < freqs.length; i++) {
      var t = t0 + i * CFG.EXTRA_LIFE_SPACING;
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freqs[i];
      var g = ctx.createGain();
      g.gain.setValueAtTime(CFG.EXTRA_LIFE_GAIN, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + CFG.EXTRA_LIFE_DUR);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + CFG.EXTRA_LIFE_DUR + 0.02);
    }
  }

  function shipDeath() {
    if (!ctx || muted) return;
    var t = now();
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(CFG.SHIP_DEATH_FREQ_START, t);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(1, CFG.SHIP_DEATH_FREQ_END), t + CFG.SHIP_DEATH_DUR
    );
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + CFG.SHIP_DEATH_DUR);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + CFG.SHIP_DEATH_DUR + 0.05);
  }

  function stopAllLoops() {
    setThrust(false);
    setSaucer(false, false);
  }

  function setMuted(v) {
    muted = !!v;
    if (master && ctx) {
      master.gain.setTargetAtTime(muted ? 0 : 1, now(), CFG.MUTE_RAMP_S);
    }
    // Re-apply desired loop state, so unmuting mid-game restores thrust/saucer sound.
    applyThrust();
    applySaucer();
  }

  function isMuted() { return muted; }

  function onVisible() {
    if (ctx && ctx.state !== 'running') {
      ctx.resume().catch(function () {});
    }
  }

  VB.audio = {
    unlock: unlock,
    fire: fire,
    setThrust: setThrust,
    explode: explode,
    beat: beat,
    setSaucer: setSaucer,
    hyperspace: hyperspace,
    extraLife: extraLife,
    shipDeath: shipDeath,
    stopAllLoops: stopAllLoops,
    setMuted: setMuted,
    isMuted: isMuted,
    onVisible: onVisible
  };
})();
