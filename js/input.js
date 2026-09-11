// js/input.js — keyboard, pointer/touch, gamepad → unified VB.input state.
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var CFG = VB.CFG.INPUT;
  var util = VB.util;

  // Public unified input state, read every sim step.
  var input = {
    rotate: 0,
    aimAngle: null,
    thrust: false,
    fire: false,
    firePressed: false,      // edge: a fire press that must yield a shot even if released within a frame
    hyperspacePressed: false,
    pausePressed: false,
    lastDevice: 'keyboard'
  };
  VB.input = input;

  // ---- state-entry edge rule -------------------------------------------
  var stateEntryTime = 0;
  function setStateEntryTime(t) { stateEntryTime = t; }

  // continuous "down" sources keyed by string id -> { down, downTime }
  var sources = Object.create(null);
  function noteDown(id, ts) {
    var s = sources[id];
    if (!s) { s = sources[id] = { down: false, downTime: 0 }; }
    if (!s.down) { s.down = true; s.downTime = ts; }
  }
  function noteUp(id) {
    var s = sources[id];
    if (s) s.down = false;
  }
  function isValid(id) {
    var s = sources[id];
    return !!s && s.down && s.downTime >= stateEntryTime;
  }
  function clearAllSources() {
    sources = Object.create(null);
    pendingFireTap = -1;
  }

  // Timestamp of the latest fresh fire press, folded into input.firePressed by update().
  var pendingFireTap = -1;
  function noteFireDown(id, ts) {
    var s = sources[id];
    if (!s || !s.down) pendingFireTap = ts;
    noteDown(id, ts);
  }

  // ---- keyboard ----------------------------------------------------------
  var keyRotateLeft = { ArrowLeft: 1, KeyA: 1 };
  var keyRotateRight = { ArrowRight: 1, KeyD: 1 };
  var keyThrust = { ArrowUp: 1, KeyW: 1 };
  var keyFire = { Space: 1, KeyJ: 1 };
  var keyHyper = { ArrowDown: 1, KeyS: 1, ShiftLeft: 1, ShiftRight: 1 };
  var keyPause = { KeyP: 1, Escape: 1 };
  var keyMute = { KeyM: 1 };
  var preventDefaultKeys = { Space: 1, ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1 };

  var muteToggleCallback = null;
  function onMuteToggle(cb) { muteToggleCallback = cb; }

  function isFormTarget(target) {
    if (!target) return false;
    var tag = target.tagName;
    return tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'A';
  }

  function onKeyDown(e) {
    // Pause and mute work even while a menu button has focus; they don't clash with
    // native button activation (Enter/Space).
    if (!e.repeat) {
      if (keyPause[e.code]) input.pausePressed = true;
      if (keyMute[e.code] && muteToggleCallback) muteToggleCallback();
    }

    var formTarget = isFormTarget(document.activeElement);
    if (!formTarget && preventDefaultKeys[e.code]) {
      e.preventDefault();
    }
    if (formTarget) return; // let native button activation (Enter/Space) proceed

    input.lastDevice = 'keyboard';
    if (sawTouchEvent || sawCoarsePointer) {
      // Auto touch controls hide again once the player switches to a keyboard (§6.2).
      sawTouchEvent = false;
      sawCoarsePointer = false;
      updateAutoVisibility();
    }
    var ts = performance.now() / 1000;

    if (keyRotateLeft[e.code]) noteDown('kb:left', ts);
    if (keyRotateRight[e.code]) noteDown('kb:right', ts);
    if (keyThrust[e.code]) noteDown('kb:thrust', ts);
    if (keyFire[e.code]) noteFireDown('kb:fire', ts);

    if (!e.repeat && keyHyper[e.code]) noteDown('kb:hyper', ts);
  }

  function onKeyUp(e) {
    if (keyRotateLeft[e.code]) noteUp('kb:left');
    if (keyRotateRight[e.code]) noteUp('kb:right');
    if (keyThrust[e.code]) noteUp('kb:thrust');
    if (keyFire[e.code]) noteUp('kb:fire');
    if (keyHyper[e.code]) noteUp('kb:hyper');
  }

  function onBlur() {
    // Clear all held keys/pointers so nothing stays stuck.
    clearAllSources();
    joystickPointerId = null;
    joystick.active = false;
    joystick.thrustActive = false;
    firePointerIds.clear();
    input.aimAngle = null;
  }

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // ---- touch / pointer ----------------------------------------------------
  var touchLayer = null;
  var hyperBtn = null;
  var pauseBtn = null;

  var joystickPointerId = null;
  var joystick = { baseX: 0, baseY: 0, curX: 0, curY: 0, active: false, thrustActive: false };
  var firePointerIds = new Set();

  var sawCoarsePointer = false;
  var sawTouchEvent = false;
  var touchAutoVisible = false;

  function updateAutoVisibility() {
    touchAutoVisible = sawCoarsePointer || sawTouchEvent;
  }

  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      sawCoarsePointer = true;
    }
  } catch (e) {}
  updateAutoVisibility();

  function shouldShowTouchControls(setting) {
    if (setting === 'on') return true;
    if (setting === 'off') return false;
    return touchAutoVisible;
  }

  function initTouch(layerEl, hyperBtnEl, pauseBtnEl) {
    touchLayer = layerEl;
    hyperBtn = hyperBtnEl;
    pauseBtn = pauseBtnEl;

    hyperBtn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      input.lastDevice = 'touch';
      sawTouchEvent = e.pointerType === 'touch' || sawTouchEvent;
      updateAutoVisibility();
      noteDown('touch:hyper', e.timeStamp / 1000 || performance.now() / 1000);
    });

    pauseBtn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      input.pausePressed = true;
    });

    touchLayer.addEventListener('pointerdown', onTouchPointerDown);
    touchLayer.addEventListener('pointermove', onTouchPointerMove);
    touchLayer.addEventListener('pointerup', onTouchPointerEnd);
    touchLayer.addEventListener('pointercancel', onTouchPointerEnd);
    touchLayer.addEventListener('lostpointercapture', onTouchPointerEnd);
  }

  function tsFor(e) {
    return performance.now() / 1000;
  }

  function onTouchPointerDown(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      sawTouchEvent = true;
      updateAutoVisibility();
      input.lastDevice = 'touch';
    } else if (e.pointerType === 'mouse') {
      input.lastDevice = 'mouse';
    }

    var w = window.innerWidth;
    var isLeft = e.clientX < w / 2;
    var ts = tsFor(e);

    if (isLeft) {
      if (joystickPointerId !== null) return; // already tracking one stick pointer
      joystickPointerId = e.pointerId;
      joystick.baseX = e.clientX;
      joystick.baseY = e.clientY;
      joystick.curX = e.clientX;
      joystick.curY = e.clientY;
      joystick.active = true;
      joystick.thrustActive = false;
      try { touchLayer.setPointerCapture(e.pointerId); } catch (err) {}
    } else {
      firePointerIds.add(e.pointerId);
      noteFireDown('touch:fire', ts);
      try { touchLayer.setPointerCapture(e.pointerId); } catch (err) {}
    }
  }

  function onTouchPointerMove(e) {
    if (e.pointerId === joystickPointerId) {
      joystick.curX = e.clientX;
      joystick.curY = e.clientY;
      var dx = e.clientX - joystick.baseX;
      var dy = e.clientY - joystick.baseY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var R = CFG.JOYSTICK_RADIUS_CSS;
      if (dist > CFG.JOYSTICK_AIM_DEADZONE_CSS) {
        input.aimAngle = Math.atan2(dy, dx);
      }
      joystick.thrustActive = dist >= CFG.JOYSTICK_THRUST_THRESHOLD_FRAC * R;
      if (joystick.thrustActive) noteDown('touch:thrust', tsFor(e));
      else noteUp('touch:thrust');
    }
  }

  function onTouchPointerEnd(e) {
    if (e.pointerId === joystickPointerId) {
      joystickPointerId = null;
      joystick.active = false;
      joystick.thrustActive = false;
      input.aimAngle = null;
      noteUp('touch:thrust');
    }
    if (firePointerIds.has(e.pointerId)) {
      firePointerIds.delete(e.pointerId);
      if (firePointerIds.size === 0) noteUp('touch:fire');
    }
  }

  function getJoystickVisual() {
    var R = CFG.JOYSTICK_RADIUS_CSS;
    var dx = joystick.curX - joystick.baseX;
    var dy = joystick.curY - joystick.baseY;
    var dist = Math.min(R, Math.sqrt(dx * dx + dy * dy));
    var ang = Math.atan2(dy, dx);
    return {
      active: joystick.active,
      baseX: joystick.baseX,
      baseY: joystick.baseY,
      knobX: joystick.baseX + (dist ? Math.cos(ang) * dist : 0),
      knobY: joystick.baseY + (dist ? Math.sin(ang) * dist : 0),
      thrustActive: joystick.thrustActive
    };
  }

  // ---- gamepad ----------------------------------------------------------
  var gamepadState = { rotate: 0, fire: false, thrust: false };
  function pollGamepad() {
    if (!navigator.getGamepads) return;
    var pads;
    try { pads = navigator.getGamepads(); } catch (e) { return; }
    var pad = null;
    for (var i = 0; i < pads.length; i++) { if (pads[i]) { pad = pads[i]; break; } }
    if (!pad) return;

    var dz = CFG.GAMEPAD_DEADZONE;
    var axisX = pad.axes && pad.axes.length ? pad.axes[0] : 0;
    var dpadLeft = pad.buttons[14] && pad.buttons[14].pressed;
    var dpadRight = pad.buttons[15] && pad.buttons[15].pressed;
    var rotate = 0;
    if (Math.abs(axisX) > dz) rotate = axisX;
    if (dpadLeft) rotate = -1;
    if (dpadRight) rotate = 1;

    var fireBtn = pad.buttons[0] && pad.buttons[0].pressed;
    var thrustBtn = (pad.buttons[7] && pad.buttons[7].pressed) ||
      (pad.buttons[1] && pad.buttons[1].pressed) ||
      (pad.buttons[12] && pad.buttons[12].pressed);
    var hyperBtnPressed = (pad.buttons[2] && pad.buttons[2].pressed) ||
      (pad.buttons[3] && pad.buttons[3].pressed);
    var pauseBtnPressed = pad.buttons[9] && pad.buttons[9].pressed;

    var ts = performance.now() / 1000;
    var anyActive = Math.abs(rotate) > dz || fireBtn || thrustBtn || hyperBtnPressed || pauseBtnPressed;
    if (anyActive) {
      input.lastDevice = 'gamepad';
      sawTouchEvent = false;
      updateAutoVisibility();
    }

    gamepadState.rotate = rotate;
    if (fireBtn) noteFireDown('gp:fire', ts); else noteUp('gp:fire');
    if (thrustBtn) noteDown('gp:thrust', ts); else noteUp('gp:thrust');

    if (hyperBtnPressed && !gamepadState.hyperWasDown) noteDown('gp:hyper', ts);
    if (!hyperBtnPressed) noteUp('gp:hyper');
    gamepadState.hyperWasDown = hyperBtnPressed;

    if (pauseBtnPressed && !gamepadState.pauseWasDown) input.pausePressed = true;
    gamepadState.pauseWasDown = pauseBtnPressed;
  }

  // ---- per-frame resolution ------------------------------------------------
  // Called once per rAF (not per sim step) to fold all sources into VB.input.
  function update() {
    pollGamepad();

    var left = isValid('kb:left');
    var right = isValid('kb:right');
    var kbRotate = (right ? 1 : 0) - (left ? 1 : 0);
    var gpRotate = Math.abs(gamepadState.rotate) > CFG.GAMEPAD_DEADZONE ? gamepadState.rotate : 0;
    input.rotate = util.clamp(kbRotate + gpRotate, -1, 1);

    input.thrust = isValid('kb:thrust') || isValid('touch:thrust') || isValid('gp:thrust');
    input.fire = isValid('kb:fire') || isValid('touch:fire') || isValid('gp:fire');
    if (pendingFireTap >= 0) {
      if (pendingFireTap >= stateEntryTime) input.firePressed = true;
      pendingFireTap = -1;
    }

    if (isValid('kb:hyper') || isValid('touch:hyper') || isValid('gp:hyper')) {
      input.hyperspacePressed = true;
      noteUp('kb:hyper'); noteUp('touch:hyper'); noteUp('gp:hyper');
    }

    // aimAngle stays as set by joystick handlers; cleared on release.
  }

  // Edge-triggered flags: fire/hyperspace are consumed by world.step(), pause by main.js.
  function consumeHyperspace() { input.hyperspacePressed = false; }
  function consumeFire() { input.firePressed = false; }
  function consumePause() { input.pausePressed = false; }

  VB.inputSystem = {
    setStateEntryTime: setStateEntryTime,
    initTouch: initTouch,
    update: update,
    getJoystickVisual: getJoystickVisual,
    shouldShowTouchControls: shouldShowTouchControls,
    consumeHyperspace: consumeHyperspace,
    consumeFire: consumeFire,
    consumePause: consumePause,
    onMuteToggle: onMuteToggle,
    clearAllSources: clearAllSources
  };
})();
