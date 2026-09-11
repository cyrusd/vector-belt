// js/config.js — every tunable number lives here.
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};

  var CFG = {
    WORLD: {
      SHORT_MIN: 460,
      SHORT_MAX: 760,
      SHORT_MULT: 1.2,
      DENSITY_MIN: 0.55,
      DENSITY_MAX: 1.4,
      DENSITY_REF_AREA: 1280 * 720
    },

    RENDER: {
      DPR_MAX: 2,
      DPR_MAX_LOW: 1.5,
      LINE_WIDTH_CSS: 2,
      BULLET_SIZE_CSS: 3,
      PARTICLE_SIZE_CSS: 2,
      PARTICLE_MAX: 250,
      GLOW_BLUR_CSS: 8,
      STAR_COUNT: 80,
      SHAKE_LARGE_ASTEROID: 4,
      SHAKE_SHIP_DEATH: 10,
      SHAKE_DECAY_S: 0.3,
      GHOST_MARGIN_MULT: 1 // ghost drawn when within radius of edge
    },

    COLORS: {
      VECTOR: '#e8f1ff',
      THRUST: '#ffb347',
      SAUCER_BULLET: '#ff6b5b',
      BG: '#000000'
    },

    LOOP: {
      STEP: 1 / 120,
      MAX_FRAME_DT: 0.25
    },

    SHIP: {
      LENGTH: 30,
      WIDTH: 20,
      HIT_RADIUS: 11,
      ROT_SPEED: 4.8,
      ROT_SPEED_TOUCH: 6.0,
      THRUST_ACCEL: 480,
      MAX_SPEED: 520,
      DRAG_K: 0.55,
      FIRE_COOLDOWN: 0.15,
      MAX_BULLETS: 4,
      BULLET_SPEED: 820,
      BULLET_LIFE: 0.85,
      HYPERSPACE_DURATION: 0.45,
      HYPERSPACE_COOLDOWN: 1.5,
      RESPAWN_DELAY: 1.5,
      RESPAWN_CLEAR_RADIUS: 150,
      RESPAWN_MAX_WAIT: 4,
      INVULN_DURATION: 2.5,
      INVULN_BLINK_HZ: 8,
      LIVES_START: 3,
      LIVES_MAX_DISPLAY: 9,
      EXTRA_LIFE_SCORE: 10000
    },

    ASTEROID: {
      LARGE: { radius: 46, speedMin: 35, speedMax: 80, score: 20 },
      MEDIUM: { radius: 24, speedMin: 60, speedMax: 130, score: 50 },
      SMALL: { radius: 12, speedMin: 100, speedMax: 190, score: 100 },
      HIT_RADIUS_MULT: 0.9,
      VERT_MIN: 10,
      VERT_MAX: 12,
      RADIUS_JITTER_MIN: 0.72,
      RADIUS_JITTER_MAX: 1.12,
      SPIN_MIN: -1.2,
      SPIN_MAX: 1.2,
      SPLIT_VEL_INHERIT: 0.4,
      SPLIT_OFFSET_MULT: 0.3,
      WAVE_BASE: 4,
      WAVE_PER_WAVE: 2,
      WAVE_CAP: 11,
      WAVE_MIN: 3,
      SPAWN_MIN_DIST_FROM_SHIP: 220,
      SPEED_MUL_BASE: 1,
      SPEED_MUL_PER_WAVE: 0.06,
      SPEED_MUL_CAP: 1.6,
      MAX_ALIVE: 80
    },

    SAUCER: {
      LARGE: { hitRadius: 20, speed: 110, fireInterval: 1.3, score: 200 },
      SMALL: { hitRadius: 11, speed: 160, fireInterval: 1.0, score: 1000 },
      AIM_ERROR_MAX_DEG: 25,
      AIM_ERROR_MIN_DEG: 3,
      AIM_ERROR_SCORE_REF: 50000,
      SPAWN_TIMER_MIN_BASE: 18,
      SPAWN_TIMER_MIN_FLOOR: 6,
      SPAWN_TIMER_MAX_BASE: 26,
      SPAWN_TIMER_MAX_FLOOR: 10,
      PSMALL_SCORE_THRESHOLD: 10000,
      PSMALL_LOW: 0.1,
      PSMALL_BASE: 0.3,
      PSMALL_PER_WAVE: 0.05,
      PSMALL_MAX: 0.8,
      VY_CHANGE_MIN: 1.5,
      VY_CHANGE_MAX: 3,
      VY_FACTORS: [-0.6, 0, 0.6],
      BULLET_SPEED: 480,
      BULLET_LIFE: 1.2,
      BULLET_MAX_PER_SAUCER: 3
    },

    WAVE: {
      INTRO_DURATION: 2,
      CLEAR_DELAY: 1.5,
      HEARTBEAT_MIN_INTERVAL: 0.22,
      HEARTBEAT_MAX_INTERVAL: 1.0,
      MASS_LARGE: 4,
      MASS_MEDIUM: 2,
      MASS_SMALL: 1
    },

    INPUT: {
      JOYSTICK_RADIUS_CSS: 64,
      JOYSTICK_AIM_DEADZONE_CSS: 12,
      JOYSTICK_THRUST_THRESHOLD_FRAC: 0.7,
      FIRE_DISC_CSS: 84,
      HYPER_BTN_CSS: 56,
      PAUSE_BTN_CSS: 44,
      GAMEPAD_DEADZONE: 0.25
    },

    AUDIO: {
      MAX_SIMULT_EXPLOSIONS: 6,
      MUTE_RAMP_S: 0.03,
      FIRE_FREQ_START: 900,
      FIRE_FREQ_END: 240,
      FIRE_DUR: 0.08,
      FIRE_GAIN: 0.12,
      THRUST_LOWPASS: 400,
      THRUST_GAIN: 0.18,
      EXPLODE_L: { lowpass: 300, decay: 0.9 },
      EXPLODE_M: { lowpass: 700, decay: 0.5 },
      EXPLODE_S: { lowpass: 1400, decay: 0.3 },
      BEAT1_FREQ: 58,
      BEAT2_FREQ: 52,
      BEAT_DUR: 0.09,
      BEAT_GAIN: 0.35,
      SAUCER_LARGE_FREQ: 180,
      SAUCER_SMALL_FREQ: 320,
      SAUCER_LFO_FREQ: 8,
      SAUCER_LFO_DEPTH: 40,
      HYPERSPACE_FREQ_START: 200,
      HYPERSPACE_FREQ_END: 1200,
      HYPERSPACE_DUR: 0.25,
      EXTRA_LIFE_FREQS: [880, 1175, 1568],
      EXTRA_LIFE_DUR: 0.07,
      SHIP_DEATH_FREQ_START: 1200,
      SHIP_DEATH_FREQ_END: 100,
      SHIP_DEATH_DUR: 1.1
    },

    HAPTICS: {
      SHIP_DEATH_MS: 40,
      LARGE_ASTEROID_MS: 15,
      EXTRA_LIFE_MS: [20, 40, 20]
    },

    UI: {
      PLAY_AGAIN_GUARD_S: 1.0,
      GAME_OVER_DELAY_S: 1.5
    }
  };

  VB.CFG = Object.freeze(deepFreeze(CFG));

  function deepFreeze(obj) {
    Object.getOwnPropertyNames(obj).forEach(function (key) {
      var val = obj[key];
      if (val && typeof val === 'object') deepFreeze(val);
    });
    return Object.freeze(obj);
  }
})();
