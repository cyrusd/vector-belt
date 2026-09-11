// js/storage.js — localStorage wrapper (try/catch everywhere), settings + best score.
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};

  var KEY_BEST = 'vb.best';
  var KEY_SETTINGS = 'vb.settings';

  var DEFAULT_SETTINGS = {
    sound: true,
    haptics: true,
    glow: 'auto',      // 'auto' | 'on' | 'off'
    quality: 'high',   // 'high' | 'low'
    shake: true,
    touch: 'auto'      // 'auto' | 'on' | 'off'
  };

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function getBest() {
    var raw = safeGet(KEY_BEST);
    var n = raw ? parseInt(raw, 10) : 0;
    return isFinite(n) && n > 0 ? n : 0;
  }

  function setBest(score) {
    safeSet(KEY_BEST, String(score));
  }

  // Cached in memory: main.js reads settings every frame, so avoid re-parsing JSON.
  var cachedSettings = null;

  function getSettings() {
    if (cachedSettings) return cachedSettings;
    var raw = safeGet(KEY_SETTINGS);
    var out = {};
    for (var k in DEFAULT_SETTINGS) out[k] = DEFAULT_SETTINGS[k];
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        for (var key in parsed) {
          if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
            out[key] = parsed[key];
          }
        }
      } catch (e) {
        // ignore malformed JSON, fall back to defaults
      }
    }
    cachedSettings = out;
    return out;
  }

  function setSettings(settings) {
    cachedSettings = settings;
    try {
      safeSet(KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      // ignore
    }
  }

  VB.storage = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    getBest: getBest,
    setBest: setBest,
    getSettings: getSettings,
    setSettings: setSettings
  };
})();
