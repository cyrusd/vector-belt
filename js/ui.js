// js/ui.js — DOM overlays (title/pause/settings/game over), HUD, touch visuals.
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var CFG = VB.CFG;

  var el = {}; // cached DOM refs, filled in init()
  var overlays = {}; // name -> element
  var currentOverlay = null;
  var settingsReturnTo = 'title';

  var hudCache = { score: null, best: null, lives: null };
  var waveBannerCache = { wave: null, showing: null };

  var portraitHintDismissed = false;
  var fullscreenSupported = false;

  var playAgainGuardUntil = 0;

  function $(id) { return document.getElementById(id); }

  function init() {
    el.hud = $('hud');
    el.hudScore = $('hud-score').querySelector('span');
    el.hudBest = $('hud-best').querySelector('span');
    el.hudLives = $('hud-lives');
    el.pauseBtn = $('pause-btn');
    el.waveBanner = $('wave-banner');

    el.touchLayer = $('touch-layer');
    el.joystick = $('joystick');
    el.joystickKnob = $('joystick-knob');
    el.fireDisc = $('fire-disc');
    el.hyperBtn = $('hyper-btn');

    overlays.title = $('overlay-title');
    overlays.howto = $('overlay-howto');
    overlays.paused = $('overlay-paused');
    overlays.settings = $('overlay-settings');
    overlays.gameover = $('overlay-gameover');

    el.titleBest = $('title-best');
    el.portraitHint = $('portrait-hint');

    el.tabKeyboard = $('tab-keyboard');
    el.tabTouch = $('tab-touch');
    el.howtoKeyboard = $('howto-keyboard');
    el.howtoTouch = $('howto-touch');

    el.gameoverNewBest = $('gameover-newbest');
    el.gameoverScore = $('gameover-score');
    el.gameoverBest = $('gameover-best');
    el.gameoverWave = $('gameover-wave');
    el.btnPlayAgain = $('btn-play-again');

    detectFullscreenSupport();
    wireButtons();
    populateSettingsUI(VB.storage.getSettings());
    refreshPortraitHint();

    VB.inputSystem.initTouch(el.touchLayer, el.hyperBtn, el.pauseBtn);
    VB.inputSystem.onMuteToggle(toggleSound);
  }

  function detectFullscreenSupport() {
    fullscreenSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    var btns = [$('btn-fullscreen'), $('btn-paused-fullscreen')];
    for (var i = 0; i < btns.length; i++) {
      if (btns[i]) btns[i].hidden = !fullscreenSupported;
    }
  }

  function toggleFullscreen() {
    var isFs = document.fullscreenElement || document.webkitFullscreenElement;
    if (isFs) {
      if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      var target = document.documentElement;
      if (target.requestFullscreen) target.requestFullscreen().catch(function () {});
      else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
    }
  }

  // ---- overlays ------------------------------------------------------------
  function showOverlay(name) {
    for (var key in overlays) {
      if (overlays[key]) overlays[key].hidden = key !== name;
    }
    currentOverlay = name;
    if (name && overlays[name]) {
      var btn = overlays[name].querySelector('button');
      if (btn) {
        // Defer focus one frame so the element is definitely visible.
        // Skip if the overlay was dismissed in the meantime (focus would land on a hidden button).
        requestAnimationFrame(function () {
          if (currentOverlay !== name) return;
          try { btn.focus(); } catch (e) {}
        });
      }
    }
  }

  function hideOverlays() {
    for (var key in overlays) {
      if (overlays[key]) overlays[key].hidden = true;
    }
    currentOverlay = null;
    // A hidden button can keep focus, which would make input.js ignore every game key.
    var active = document.activeElement;
    if (active && active !== document.body && active.blur) active.blur();
  }

  function getCurrentOverlay() { return currentOverlay; }

  // ---- HUD -------------------------------------------------------------------
  function updateHUD(score, best, lives) {
    if (hudCache.score !== score) {
      hudCache.score = score;
      el.hudScore.textContent = String(score);
    }
    if (hudCache.best !== best) {
      hudCache.best = best;
      el.hudBest.textContent = String(best);
    }
    var shown = Math.min(lives, CFG.SHIP.LIVES_MAX_DISPLAY);
    if (hudCache.lives !== shown) {
      hudCache.lives = shown;
      var html = '';
      for (var i = 0; i < shown; i++) {
        html += '<svg viewBox="-12 -10 24 20" xmlns="http://www.w3.org/2000/svg">' +
          '<polygon points="10,0 -8,7 -4,0 -8,-7" fill="none" stroke="#e8f1ff" stroke-width="1.5"/></svg>';
      }
      el.hudLives.innerHTML = html;
    }
  }

  function setHudVisible(visible) {
    el.hud.style.visibility = visible ? 'visible' : 'hidden';
  }

  function updateWaveBanner(wave, showing) {
    if (waveBannerCache.wave !== wave) {
      waveBannerCache.wave = wave;
      el.waveBanner.textContent = 'WAVE ' + wave;
    }
    if (waveBannerCache.showing !== showing) {
      waveBannerCache.showing = showing;
      el.waveBanner.hidden = !showing;
    }
  }

  // ---- touch visuals (called every rAF while PLAYING) --------------------------
  function updateTouchVisuals(setting) {
    var visible = VB.inputSystem.shouldShowTouchControls(setting);
    el.touchLayer.classList.toggle('hidden-controls', !visible);

    var v = VB.inputSystem.getJoystickVisual();
    if (v.active) {
      el.joystick.hidden = false;
      el.joystick.style.left = v.baseX + 'px';
      el.joystick.style.top = v.baseY + 'px';
      el.joystickKnob.style.transform = 'translate(' + (v.knobX - v.baseX) + 'px,' + (v.knobY - v.baseY) + 'px)';
      el.joystick.classList.toggle('thrusting', v.thrustActive);
    } else {
      el.joystick.hidden = true;
    }
  }

  function setTouchLayerActive(active) {
    el.touchLayer.classList.toggle('active', active);
  }

  // ---- settings ---------------------------------------------------------------
  function populateSettingsUI(settings) {
    var rows = document.querySelectorAll('.seg[data-setting]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var key = row.getAttribute('data-setting');
      var val = String(settings[key]);
      var btns = row.querySelectorAll('.seg-btn');
      for (var j = 0; j < btns.length; j++) {
        btns[j].setAttribute('aria-pressed', String(btns[j].getAttribute('data-value') === val));
      }
    }
    var haptics = !!(navigator.vibrate);
    var row = $('row-haptics');
    if (row) row.hidden = !haptics;

    VB.audio.setMuted(!settings.sound);
    VB.render.applySettings({ quality: settings.quality, glow: settings.glow, shake: settings.shake });
  }

  function onSettingClick(e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) return;
    var row = btn.closest('.seg');
    var key = row.getAttribute('data-setting');
    var raw = btn.getAttribute('data-value');
    var value = (raw === 'true') ? true : (raw === 'false' ? false : raw);

    var settings = VB.storage.getSettings();
    settings[key] = value;
    VB.storage.setSettings(settings);
    populateSettingsUI(settings);
  }

  function toggleSound() {
    var settings = VB.storage.getSettings();
    settings.sound = !settings.sound;
    VB.storage.setSettings(settings);
    populateSettingsUI(settings);
  }

  // ---- portrait hint ------------------------------------------------------------
  function refreshPortraitHint() {
    if (portraitHintDismissed) { el.portraitHint.hidden = true; return; }
    var coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    var portrait = window.innerHeight > window.innerWidth;
    el.portraitHint.hidden = !(coarse && portrait);
  }

  // ---- how to play tabs -----------------------------------------------------------
  function selectHowToTab(tab) {
    var isKb = tab === 'keyboard';
    el.tabKeyboard.setAttribute('aria-selected', String(isKb));
    el.tabTouch.setAttribute('aria-selected', String(!isKb));
    el.howtoKeyboard.hidden = !isKb;
    el.howtoTouch.hidden = isKb;
  }

  function openHowTo() {
    var coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    var lastDevice = VB.input.lastDevice;
    selectHowToTab((lastDevice === 'touch' || (lastDevice !== 'keyboard' && lastDevice !== 'gamepad' && coarse)) ? 'touch' : 'keyboard');
    showOverlay('howto');
  }

  // ---- game over ---------------------------------------------------------------
  function showGameOver(score, best, wave, isNewBest) {
    el.gameoverScore.textContent = String(score);
    el.gameoverBest.textContent = String(best);
    el.gameoverWave.textContent = String(wave);
    el.gameoverNewBest.hidden = !isNewBest;
    showOverlay('gameover');

    el.btnPlayAgain.disabled = true;
    playAgainGuardUntil = performance.now() + CFG.UI.PLAY_AGAIN_GUARD_S * 1000;
    setTimeout(function () {
      el.btnPlayAgain.disabled = false;
      // The initial focus attempt fails while disabled; give keyboard users a target now.
      if (currentOverlay === 'gameover') el.btnPlayAgain.focus();
    }, CFG.UI.PLAY_AGAIN_GUARD_S * 1000);
  }

  // ---- wiring ---------------------------------------------------------------
  function wireButtons() {
    $('btn-play').addEventListener('click', function () { VB.main.actions.play(); });
    $('btn-howto').addEventListener('click', openHowTo);
    $('btn-settings').addEventListener('click', function () { settingsReturnTo = 'title'; showOverlay('settings'); });
    var fsBtn = $('btn-fullscreen');
    if (fsBtn) fsBtn.addEventListener('click', toggleFullscreen);
    $('portrait-hint-dismiss').addEventListener('click', function () {
      portraitHintDismissed = true;
      el.portraitHint.hidden = true;
    });

    $('btn-howto-back').addEventListener('click', function () { showOverlay('title'); });
    el.tabKeyboard.addEventListener('click', function () { selectHowToTab('keyboard'); });
    el.tabTouch.addEventListener('click', function () { selectHowToTab('touch'); });

    $('btn-resume').addEventListener('click', function () { VB.main.actions.resume(); });
    $('btn-restart').addEventListener('click', function () { VB.main.actions.restart(); });
    $('btn-paused-settings').addEventListener('click', function () { settingsReturnTo = 'paused'; showOverlay('settings'); });
    var fsBtn2 = $('btn-paused-fullscreen');
    if (fsBtn2) fsBtn2.addEventListener('click', toggleFullscreen);
    $('btn-quit').addEventListener('click', function () { VB.main.actions.quitToTitle(); });

    $('btn-settings-back').addEventListener('click', function () { showOverlay(settingsReturnTo); });
    document.querySelectorAll('.seg[data-setting]').forEach(function (seg) {
      seg.addEventListener('click', onSettingClick);
    });

    el.btnPlayAgain.addEventListener('click', function () {
      if (el.btnPlayAgain.disabled) return;
      VB.main.actions.play();
    });
    $('btn-gameover-title').addEventListener('click', function () { VB.main.actions.titleFromGameOver(); });

    // Note: the pause button itself is handled by VB.inputSystem.initTouch (it wires a
    // pointerdown listener directly on el.pauseBtn that sets VB.input.pausePressed, the
    // same edge-triggered flag the P/Esc keys and gamepad Start set). That keeps a single
    // source of truth for "pause was pressed" so mouse/touch/keyboard/gamepad can't
    // double-toggle each other.
  }

  VB.ui = {
    init: init,
    showOverlay: showOverlay,
    hideOverlays: hideOverlays,
    getCurrentOverlay: getCurrentOverlay,
    updateHUD: updateHUD,
    setHudVisible: setHudVisible,
    updateWaveBanner: updateWaveBanner,
    updateTouchVisuals: updateTouchVisuals,
    setTouchLayerActive: setTouchLayerActive,
    populateSettingsUI: populateSettingsUI,
    refreshPortraitHint: refreshPortraitHint,
    showGameOver: showGameOver,
    toggleSound: toggleSound
  };
})();
