// js/main.js — bootstrap, state machine, main loop, visibility/resize handling.
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var CFG = VB.CFG;

  var STATE = { TITLE: 'TITLE', PLAYING: 'PLAYING', PAUSED: 'PAUSED', GAME_OVER: 'GAME_OVER' };
  var state = STATE.TITLE;

  var canvas = null;
  var debugFlag = false;

  var accumulator = 0;
  var lastTime = null;
  var resizeScheduled = false;
  var gameOverDelay = 0;

  function nowSeconds() { return performance.now() / 1000; }

  // ---- state transitions -----------------------------------------------------
  function enterTitle() {
    state = STATE.TITLE;
    accumulator = 0;
    VB.audio.stopAllLoops();
    VB.world.seedTitleAsteroids();
    VB.ui.setHudVisible(false);
    VB.ui.setTouchLayerActive(false);
    VB.ui.showOverlay('title');
    refreshTitleBest();
  }

  function refreshTitleBest() {
    var bestEl = document.getElementById('title-best');
    if (bestEl) bestEl.textContent = String(VB.storage.getBest());
  }

  function enterPlaying(fresh) {
    VB.audio.unlock();
    if (fresh) {
      VB.world.startGame();
      gameOverDelay = CFG.UI.GAME_OVER_DELAY_S;
    } else if (VB.world.saucer) {
      // stopAllLoops() silenced the saucer when pausing; bring it back.
      VB.audio.setSaucer(true, VB.world.saucer.type === 'S');
    }
    state = STATE.PLAYING;
    accumulator = 0;
    VB.inputSystem.setStateEntryTime(nowSeconds());
    VB.inputSystem.consumeHyperspace();
    VB.inputSystem.consumeFire();
    VB.ui.setHudVisible(true);
    VB.ui.setTouchLayerActive(true);
    VB.ui.hideOverlays();
  }

  function forcePause() {
    if (state !== STATE.PLAYING) return;
    state = STATE.PAUSED;
    accumulator = 0;
    VB.audio.stopAllLoops();
    VB.ui.setTouchLayerActive(false);
    VB.ui.showOverlay('paused');
  }

  function resumeFromPause() {
    if (state !== STATE.PAUSED) return;
    enterPlaying(false);
  }

  function handlePauseToggle() {
    if (state === STATE.PLAYING) forcePause();
    else if (state === STATE.PAUSED) resumeFromPause();
  }

  function enterGameOver() {
    state = STATE.GAME_OVER;
    accumulator = 0;
    VB.ui.setTouchLayerActive(false);
    var w = VB.world;
    var isNewBest = w.score > w.bestAtStart;
    VB.ui.showGameOver(w.score, w.best, w.wave, isNewBest);
  }

  var actions = {
    play: function () { enterPlaying(true); },
    resume: function () { resumeFromPause(); },
    restart: function () { enterPlaying(true); },
    quitToTitle: function () { enterTitle(); },
    titleFromGameOver: function () { enterTitle(); }
  };
  VB.main = { actions: actions };

  // ---- resize -----------------------------------------------------------------
  function applyResize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    VB.world.resize(w, h);
    VB.render.resize(w, h);
    VB.ui.refreshPortraitHint();
  }

  function scheduleResize() {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(function () {
      resizeScheduled = false;
      applyResize();
    });
  }

  // ---- visibility / blur -----------------------------------------------------
  function onVisibilityChange() {
    if (document.hidden) {
      forcePause();
    } else {
      VB.audio.onVisible();
    }
  }

  function onBlur() {
    forcePause();
  }

  // ---- fixed-timestep loop ------------------------------------------------------
  function loop(now) {
    requestAnimationFrame(loop);

    if (lastTime === null) lastTime = now;
    var frameDt = (now - lastTime) / 1000;
    lastTime = now;
    if (frameDt < 0) frameDt = 0;
    if (frameDt > CFG.LOOP.MAX_FRAME_DT) frameDt = CFG.LOOP.MAX_FRAME_DT;

    VB.inputSystem.update();

    if (state === STATE.PLAYING || state === STATE.TITLE) {
      accumulator += frameDt;
      var steps = 0;
      var maxSteps = Math.ceil(CFG.LOOP.MAX_FRAME_DT / CFG.LOOP.STEP) + 1;
      while (accumulator >= CFG.LOOP.STEP && steps < maxSteps) {
        simStep(CFG.LOOP.STEP);
        accumulator -= CFG.LOOP.STEP;
        steps++;
      }
    }

    // Edge-triggered pause works from any state; harmless if state doesn't use it.
    if (VB.input.pausePressed) {
      VB.inputSystem.consumePause();
      handlePauseToggle();
    }

    // Let the final explosion play out before showing the Game Over screen.
    if (state === STATE.PLAYING && VB.world.gameOver) {
      gameOverDelay -= frameDt;
      if (gameOverDelay <= 0) enterGameOver();
    }

    VB.render.frame(now, VB.world);

    if (state === STATE.PLAYING || state === STATE.PAUSED) {
      VB.ui.updateHUD(VB.world.score, Math.max(VB.world.best, VB.world.score), VB.world.lives);
    }
    var showBanner = state === STATE.PLAYING && VB.world.phase === 'WAVE_INTRO' && VB.world.waveBanner > 0;
    VB.ui.updateWaveBanner(VB.world.wave, showBanner);

    if (state === STATE.PLAYING) {
      var settings = VB.storage.getSettings();
      VB.ui.updateTouchVisuals(settings.touch);
    }
  }

  function simStep(dt) {
    if (state === STATE.TITLE) {
      VB.world.stepDecorative(dt);
    } else if (state === STATE.PLAYING) {
      VB.world.step(dt, VB.input);
    }
  }

  // ---- debug hooks --------------------------------------------------------------
  function wireDebugKeys() {
    window.addEventListener('keydown', function (e) {
      if (!debugFlag) return;
      if (e.code === 'KeyN') VB.world.debugClearWave();
      if (e.code === 'KeyI') VB.world.debugToggleInvuln();
    });
  }

  // ---- audio unlock on first gesture ---------------------------------------------
  function wireAudioUnlock() {
    var unlock = function () { VB.audio.unlock(); };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  // ---- bootstrap ---------------------------------------------------------------
  function init() {
    debugFlag = /(?:^|[?&])debug=1(?:&|$)/.test(location.search);

    VB.world.init();
    canvas = document.getElementById('game-canvas');
    VB.render.init(canvas, debugFlag);
    VB.ui.init();

    applyResize();
    enterTitle();

    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleResize);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

    wireDebugKeys();
    wireAudioUnlock();

    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
