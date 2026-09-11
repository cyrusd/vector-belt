// js/world.js — world sizing, spawning, waves, collisions, scoring, lives.
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var CFG = VB.CFG;
  var util = VB.util;
  var ent = VB.entities;

  var deltaTmp = { dx: 0, dy: 0, dist: 0 };

  function wrappedDist(ax, ay, bx, by, worldW, worldH) {
    util.wrapDelta(ax, ay, bx, by, worldW, worldH, deltaTmp);
    return deltaTmp.dist;
  }

  var world = {
    // sizing
    WORLD_SHORT: 600, ppu: 1, worldW: 800, worldH: 600, density: 1,
    // phase within PLAYING
    phase: 'WAVE_INTRO',
    phaseTimer: 0,
    wave: 1,
    waveSpeedMul: 1,
    waveStartMass: 1,
    // scoring / lives
    score: 0,
    best: 0,
    bestAtStart: 0,
    lives: CFG.SHIP.LIVES_START,
    livesAwarded: 0,
    gameOver: false,
    // entities
    ship: null,
    asteroids: [],
    saucer: null,
    bullets: [],
    bulletPool: null,
    particles: [],
    particlePool: null,
    debris: [],
    debrisPool: null,
    // timers
    saucerSpawnTimer: 8,
    heartbeatTimer: 1,
    respawnElapsed: 0,
    waveBanner: 0, // seconds remaining to show "WAVE N"
    // callbacks (assigned by main.js)
    callbacks: {}
  };

  VB.world = world;

  function haptic(pattern) {
    try {
      var s = VB.storage.getSettings();
      // Chrome logs an intervention error if vibrate() runs before any user tap.
      var activated = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (s.haptics && navigator.vibrate && activated) navigator.vibrate(pattern);
    } catch (e) {}
  }

  // ---- init / sizing --------------------------------------------------------
  function init() {
    world.bulletPool = util.makePool(ent.createBullet, function (b) { b.alive = false; }, 16);
    world.particlePool = util.makePool(ent.createParticle, function (p) { p.alive = false; }, 64);
    world.debrisPool = util.makePool(ent.createDebris, function (d) { d.alive = false; }, 20);
    world.ship = ent.createShip();
  }

  function computeWorldSize(cssW, cssH) {
    var cssShort = Math.min(cssW, cssH);
    var WORLD_SHORT = util.clamp(cssShort * CFG.WORLD.SHORT_MULT, CFG.WORLD.SHORT_MIN, CFG.WORLD.SHORT_MAX);
    var ppu = cssShort / WORLD_SHORT;
    var worldW = cssW / ppu;
    var worldH = cssH / ppu;
    var density = util.clamp((worldW * worldH) / CFG.WORLD.DENSITY_REF_AREA, CFG.WORLD.DENSITY_MIN, CFG.WORLD.DENSITY_MAX);
    return { WORLD_SHORT: WORLD_SHORT, ppu: ppu, worldW: worldW, worldH: worldH, density: density };
  }

  function resize(cssW, cssH) {
    if (!cssW || !cssH || !isFinite(cssW) || !isFinite(cssH)) return; // ignore spurious 0/invalid sizes
    var sz = computeWorldSize(cssW, cssH);
    var oldW = world.worldW, oldH = world.worldH;
    var scaleX = oldW > 0 ? sz.worldW / oldW : 1;
    var scaleY = oldH > 0 ? sz.worldH / oldH : 1;

    world.WORLD_SHORT = sz.WORLD_SHORT;
    world.ppu = sz.ppu;
    world.worldW = sz.worldW;
    world.worldH = sz.worldH;
    world.density = sz.density;

    if (scaleX !== 1 || scaleY !== 1) {
      rescaleEntity(world.ship, scaleX, scaleY);
      for (var i = 0; i < world.asteroids.length; i++) rescaleEntity(world.asteroids[i], scaleX, scaleY);
      if (world.saucer) rescaleEntity(world.saucer, scaleX, scaleY);
      for (var j = 0; j < world.bullets.length; j++) rescaleEntity(world.bullets[j], scaleX, scaleY);
    }
  }

  function rescaleEntity(e, sx, sy) {
    if (!e) return;
    e.x *= sx; e.y *= sy;
  }

  // ---- game / wave lifecycle -------------------------------------------------
  function startGame() {
    world.score = 0;
    world.best = VB.storage.getBest();
    world.bestAtStart = world.best;
    world.lives = CFG.SHIP.LIVES_START;
    world.livesAwarded = 0;
    world.wave = 1;
    world.gameOver = false;
    world.asteroids.length = 0;
    world.saucer = null;
    clearPoolArray(world.bullets, world.bulletPool);
    clearPoolArray(world.particles, world.particlePool);
    clearPoolArray(world.debris, world.debrisPool);
    ent.resetShipAt(world.ship, world.worldW / 2, world.worldH / 2);
    world.ship.invulnTimer = CFG.SHIP.INVULN_DURATION;
    startWave();
  }

  function clearPoolArray(arr, pool) {
    for (var i = 0; i < arr.length; i++) { arr[i].alive = false; pool.release(arr[i]); }
    arr.length = 0;
  }

  function startWave() {
    world.phase = 'WAVE_INTRO';
    world.phaseTimer = CFG.WAVE.INTRO_DURATION;
    world.waveBanner = CFG.WAVE.INTRO_DURATION;
    world.waveSpeedMul = Math.min(CFG.ASTEROID.SPEED_MUL_BASE + CFG.ASTEROID.SPEED_MUL_PER_WAVE * (world.wave - 1), CFG.ASTEROID.SPEED_MUL_CAP);
    spawnWaveAsteroids();
    world.saucerSpawnTimer = util.randRange(
      Math.max(CFG.SAUCER.SPAWN_TIMER_MIN_FLOOR, CFG.SAUCER.SPAWN_TIMER_MIN_BASE - world.wave),
      Math.max(CFG.SAUCER.SPAWN_TIMER_MAX_FLOOR, CFG.SAUCER.SPAWN_TIMER_MAX_BASE - world.wave)
    );
    world.heartbeatTimer = CFG.WAVE.HEARTBEAT_MAX_INTERVAL;
  }

  function spawnWaveAsteroids() {
    var count = Math.max(CFG.ASTEROID.WAVE_MIN, Math.round(
      Math.min(CFG.ASTEROID.WAVE_BASE + CFG.ASTEROID.WAVE_PER_WAVE * (world.wave - 1), CFG.ASTEROID.WAVE_CAP) * world.density
    ));
    var mass = 0;
    for (var i = 0; i < count; i++) {
      var pos = randomSpawnPos();
      var speed = util.randRange(CFG.ASTEROID.LARGE.speedMin, CFG.ASTEROID.LARGE.speedMax) * world.waveSpeedMul;
      var dir = util.randRange(0, Math.PI * 2);
      world.asteroids.push(ent.createAsteroid('L', pos.x, pos.y, Math.cos(dir) * speed, Math.sin(dir) * speed));
      mass += CFG.WAVE.MASS_LARGE;
    }
    world.waveStartMass = Math.max(1, mass);
  }

  function randomSpawnPos() {
    for (var attempt = 0; attempt < 20; attempt++) {
      var x = util.randRange(0, world.worldW);
      var y = util.randRange(0, world.worldH);
      if (wrappedDist(x, y, world.ship.x, world.ship.y, world.worldW, world.worldH) >= CFG.ASTEROID.SPAWN_MIN_DIST_FROM_SHIP) {
        return { x: x, y: y };
      }
    }
    return { x: util.randRange(0, world.worldW), y: util.randRange(0, world.worldH) };
  }

  // ---- per-frame step (fixed timestep) ----------------------------------------
  // Note: the "input edge rule" (a key/touch held from before PLAYING began must not
  // fire/thrust) is fully resolved upstream in input.js — VB.input.fire/.thrust/
  // .hyperspacePressed are already filtered by the time step() reads them here.
  function step(dt, input) {
    if (world.gameOver) {
      // Ship is gone; keep the rest of the world animating during the game-over delay.
      stepShipAndWorld(dt, input);
      consumeEdges();
      return;
    }

    // killShip() can switch the phase to RESPAWN_WAIT mid-step, so every transition
    // below re-checks the phase before overriding it.
    switch (world.phase) {
      case 'WAVE_INTRO':
        world.phaseTimer -= dt;
        world.waveBanner = Math.max(0, world.phaseTimer);
        stepShipAndWorld(dt, input);
        if (world.phase === 'WAVE_INTRO' && world.phaseTimer <= 0) world.phase = 'ACTIVE';
        break;
      case 'ACTIVE':
        stepShipAndWorld(dt, input);
        stepSaucerSpawn(dt);
        stepHeartbeat(dt);
        if (world.phase === 'ACTIVE' && world.asteroids.length === 0) {
          world.phase = 'WAVE_CLEAR';
          world.phaseTimer = CFG.WAVE.CLEAR_DELAY;
        }
        break;
      case 'RESPAWN_WAIT':
        stepShipAndWorld(dt, input);
        world.respawnElapsed += dt;
        if (world.respawnElapsed >= CFG.SHIP.RESPAWN_DELAY) {
          var clear = isCenterClear();
          if (clear || world.respawnElapsed >= CFG.SHIP.RESPAWN_MAX_WAIT) {
            ent.resetShipAt(world.ship, world.worldW / 2, world.worldH / 2);
            world.phase = 'ACTIVE';
          }
        }
        break;
      case 'WAVE_CLEAR':
        world.phaseTimer -= dt;
        stepShipAndWorld(dt, input);
        if (world.phase === 'WAVE_CLEAR' && !world.gameOver && world.phaseTimer <= 0) {
          world.wave += 1;
          startWave();
        }
        break;
    }
    consumeEdges();
  }

  // Edge-triggered inputs are only valid for the step that first sees them.
  function consumeEdges() {
    VB.inputSystem.consumeHyperspace();
    VB.inputSystem.consumeFire();
  }

  function isCenterClear() {
    var cx = world.worldW / 2, cy = world.worldH / 2;
    var r = CFG.SHIP.RESPAWN_CLEAR_RADIUS;
    for (var i = 0; i < world.asteroids.length; i++) {
      var a = world.asteroids[i];
      if (wrappedDist(cx, cy, a.x, a.y, world.worldW, world.worldH) < r + a.hitRadius) return false;
    }
    if (world.saucer && wrappedDist(cx, cy, world.saucer.x, world.saucer.y, world.worldW, world.worldH) < r + world.saucer.hitRadius) {
      return false;
    }
    return true;
  }

  function stepShipAndWorld(dt, input) {
    var rotSpeed = input.aimAngle !== null ? CFG.SHIP.ROT_SPEED_TOUCH : CFG.SHIP.ROT_SPEED;
    var ship = world.ship;

    ent.updateShip(ship, dt, world.worldW, world.worldH, input.rotate, input.aimAngle, input.thrust, rotSpeed);
    VB.audio.setThrust(ship.alive && !ship.hyperActive && ship.thrusting);

    if (ship.alive && !ship.hyperActive) {
      if ((input.fire || input.firePressed) && ship.fireTimer <= 0) {
        tryFirePlayerBullet(ship);
      }
      if (input.hyperspacePressed && ship.hyperTimer <= 0) {
        ship.hyperActive = true;
        ship.hyperElapsed = 0;
        ship.hyperTimer = CFG.SHIP.HYPERSPACE_COOLDOWN;
        ship.visible = false;
        ship.x = util.randRange(0, world.worldW);
        ship.y = util.randRange(0, world.worldH);
        ship.vx = 0; ship.vy = 0;
        VB.audio.hyperspace();
      }
    }

    updateAsteroids(dt);
    updateSaucer(dt);
    updateBullets(dt);
    updateParticlesAndDebris(dt);

    resolveCollisions();
    compact();
  }

  function countBullets(owner) {
    var n = 0;
    for (var i = 0; i < world.bullets.length; i++) {
      var b = world.bullets[i];
      if (b.alive && b.owner === owner) n++;
    }
    return n;
  }

  function tryFirePlayerBullet(ship) {
    if (countBullets('player') >= CFG.SHIP.MAX_BULLETS) return;
    var b = world.bulletPool.acquire();
    ent.fireBullet(b, ship.x, ship.y, ship.angle, ship.vx, ship.vy, CFG.SHIP.BULLET_SPEED, CFG.SHIP.BULLET_LIFE, 'player');
    world.bullets.push(b);
    ship.fireTimer = CFG.SHIP.FIRE_COOLDOWN;
    VB.audio.fire();
  }

  function updateAsteroids(dt) {
    for (var i = 0; i < world.asteroids.length; i++) {
      ent.updateAsteroid(world.asteroids[i], dt, world.worldW, world.worldH);
    }
  }

  function updateSaucer(dt) {
    if (!world.saucer) return;
    var s = world.saucer;
    ent.updateSaucer(s, dt, world.worldH);

    // Despawn once fully crossed the far edge (horizontal, no wrap).
    var margin = s.hitRadius * 2;
    if ((s.dir > 0 && s.x - margin > world.worldW) || (s.dir < 0 && s.x + margin < 0)) {
      world.saucer = null;
      VB.audio.setSaucer(false, false);
      return;
    }

    if (s.fireTimer <= 0 && countBullets('saucer') < CFG.SAUCER.BULLET_MAX_PER_SAUCER) {
      fireSaucerBullet(s);
      s.fireTimer = s.fireInterval;
    }
  }

  function fireSaucerBullet(s) {
    var angle;
    if (s.type === 'S') {
      var toShip = Math.atan2(
        util.wrapDelta1(s.y, world.ship.y, world.worldH),
        util.wrapDelta1(s.x, world.ship.x, world.worldW)
      );
      var errMaxRad = CFG.SAUCER.AIM_ERROR_MAX_DEG * Math.PI / 180;
      var errMinRad = CFG.SAUCER.AIM_ERROR_MIN_DEG * Math.PI / 180;
      var t = util.clamp(world.score / CFG.SAUCER.AIM_ERROR_SCORE_REF, 0, 1);
      var errMag = util.lerp(errMaxRad, errMinRad, t);
      angle = toShip + util.randRange(-errMag, errMag);
    } else {
      angle = util.randRange(0, Math.PI * 2);
    }
    var b = world.bulletPool.acquire();
    ent.fireBullet(b, s.x, s.y, angle, 0, 0, CFG.SAUCER.BULLET_SPEED, CFG.SAUCER.BULLET_LIFE, 'saucer');
    world.bullets.push(b);
  }

  function updateBullets(dt) {
    for (var i = 0; i < world.bullets.length; i++) {
      ent.updateBullet(world.bullets[i], dt, world.worldW, world.worldH);
    }
  }

  function updateParticlesAndDebris(dt) {
    for (var i = 0; i < world.particles.length; i++) {
      ent.updateParticle(world.particles[i], dt, world.worldW, world.worldH);
    }
    for (var j = 0; j < world.debris.length; j++) {
      ent.updateDebris(world.debris[j], dt, world.worldW, world.worldH);
    }
  }

  function stepSaucerSpawn(dt) {
    if (world.saucer || !world.ship.alive) return;
    world.saucerSpawnTimer -= dt;
    if (world.saucerSpawnTimer <= 0) {
      var pSmall = world.score < CFG.SAUCER.PSMALL_SCORE_THRESHOLD
        ? CFG.SAUCER.PSMALL_LOW
        : Math.min(CFG.SAUCER.PSMALL_MAX, CFG.SAUCER.PSMALL_BASE + CFG.SAUCER.PSMALL_PER_WAVE * world.wave);
      var type = util.rand() < pSmall ? 'S' : 'L';
      world.saucer = ent.createSaucer(type, world.worldW, world.worldH);
      VB.audio.setSaucer(true, type === 'S');
      world.saucerSpawnTimer = util.randRange(
        Math.max(CFG.SAUCER.SPAWN_TIMER_MIN_FLOOR, CFG.SAUCER.SPAWN_TIMER_MIN_BASE - world.wave),
        Math.max(CFG.SAUCER.SPAWN_TIMER_MAX_FLOOR, CFG.SAUCER.SPAWN_TIMER_MAX_BASE - world.wave)
      );
    }
  }

  function stepHeartbeat(dt) {
    var remainingMass = 0;
    for (var i = 0; i < world.asteroids.length; i++) {
      remainingMass += massFor(world.asteroids[i].size);
    }
    world.heartbeatTimer -= dt;
    if (world.heartbeatTimer <= 0) {
      VB.audio.beat();
      var frac = 1 - util.clamp(remainingMass / world.waveStartMass, 0, 1);
      world.heartbeatTimer = util.lerp(CFG.WAVE.HEARTBEAT_MAX_INTERVAL, CFG.WAVE.HEARTBEAT_MIN_INTERVAL, frac);
    }
  }

  function massFor(size) {
    return size === 'L' ? CFG.WAVE.MASS_LARGE : (size === 'M' ? CFG.WAVE.MASS_MEDIUM : CFG.WAVE.MASS_SMALL);
  }

  // ---- collisions -------------------------------------------------------------
  function resolveCollisions() {
    var i, j, a, b, ship = world.ship;

    // player bullets vs asteroids
    for (i = 0; i < world.bullets.length; i++) {
      b = world.bullets[i];
      if (!b.alive || b.owner !== 'player') continue;
      for (j = 0; j < world.asteroids.length; j++) {
        a = world.asteroids[j];
        if (!a.alive) continue;
        if (wrappedDist(a.x, a.y, b.x, b.y, world.worldW, world.worldH) <= a.hitRadius) {
          b.alive = false;
          destroyAsteroid(a, true);
          break;
        }
      }
    }

    // player bullets vs saucer
    if (world.saucer) {
      for (i = 0; i < world.bullets.length; i++) {
        b = world.bullets[i];
        if (!b.alive || b.owner !== 'player' || !world.saucer) continue;
        if (wrappedDist(world.saucer.x, world.saucer.y, b.x, b.y, world.worldW, world.worldH) <= world.saucer.hitRadius) {
          b.alive = false;
          addScore(world.saucer.type === 'S' ? CFG.SAUCER.SMALL.score : CFG.SAUCER.LARGE.score);
          spawnExplosion(world.saucer.x, world.saucer.y, 'M');
          VB.audio.explode('M');
          VB.audio.setSaucer(false, false);
          world.saucer = null;
          break;
        }
      }
    }

    // saucer bullets vs asteroids
    for (i = 0; i < world.bullets.length; i++) {
      b = world.bullets[i];
      if (!b.alive || b.owner !== 'saucer') continue;
      for (j = 0; j < world.asteroids.length; j++) {
        a = world.asteroids[j];
        if (!a.alive) continue;
        if (wrappedDist(a.x, a.y, b.x, b.y, world.worldW, world.worldH) <= a.hitRadius) {
          b.alive = false;
          destroyAsteroid(a, false);
          break;
        }
      }
    }

    // saucer bullets vs ship
    if (ship.alive && ship.invulnTimer <= 0 && !ship.hyperActive) {
      for (i = 0; i < world.bullets.length; i++) {
        b = world.bullets[i];
        if (!b.alive || b.owner !== 'saucer') continue;
        if (wrappedDist(ship.x, ship.y, b.x, b.y, world.worldW, world.worldH) <= ship.radius) {
          b.alive = false;
          killShip();
          break;
        }
      }
    }

    // ship vs asteroids
    if (ship.alive && ship.invulnTimer <= 0 && !ship.hyperActive) {
      for (j = 0; j < world.asteroids.length; j++) {
        a = world.asteroids[j];
        if (!a.alive) continue;
        if (wrappedDist(ship.x, ship.y, a.x, a.y, world.worldW, world.worldH) <= ship.radius + a.hitRadius) {
          addScore(ent.sizeSpec(a.size).score);
          destroyAsteroid(a, false);
          killShip();
          break;
        }
      }
    }

    // ship vs saucer
    if (ship.alive && ship.invulnTimer <= 0 && !ship.hyperActive && world.saucer) {
      if (wrappedDist(ship.x, ship.y, world.saucer.x, world.saucer.y, world.worldW, world.worldH) <= ship.radius + world.saucer.hitRadius) {
        addScore(world.saucer.type === 'S' ? CFG.SAUCER.SMALL.score : CFG.SAUCER.LARGE.score);
        spawnExplosion(world.saucer.x, world.saucer.y, 'M');
        VB.audio.explode('M');
        VB.audio.setSaucer(false, false);
        world.saucer = null;
        killShip();
      }
    }

    // saucer vs asteroids
    if (world.saucer) {
      for (j = 0; j < world.asteroids.length; j++) {
        a = world.asteroids[j];
        if (!a.alive) continue;
        if (wrappedDist(world.saucer.x, world.saucer.y, a.x, a.y, world.worldW, world.worldH) <= world.saucer.hitRadius + a.hitRadius) {
          destroyAsteroid(a, false);
          spawnExplosion(world.saucer.x, world.saucer.y, 'M');
          VB.audio.explode('M');
          VB.audio.setSaucer(false, false);
          world.saucer = null;
          break;
        }
      }
    }
  }

  function killShip() {
    var ship = world.ship;
    if (!ship.alive) return;
    ship.alive = false;
    ship.visible = false;
    spawnExplosion(ship.x, ship.y, 'L');
    ent.spawnDebrisFromShip(world.debrisPool, world.debris, ship);
    VB.audio.shipDeath();
    VB.audio.setThrust(false);
    haptic(CFG.HAPTICS.SHIP_DEATH_MS);
    if (VB.render && VB.render.shake) VB.render.shake(CFG.RENDER.SHAKE_SHIP_DEATH);

    world.lives -= 1;
    if (world.lives <= 0) {
      world.gameOver = true;
      VB.audio.stopAllLoops();
      if (world.score > world.best) {
        world.best = world.score;
        VB.storage.setBest(world.best);
      }
      if (world.callbacks.onGameOver) world.callbacks.onGameOver();
      return;
    }
    world.phase = 'RESPAWN_WAIT';
    world.respawnElapsed = 0;
  }

  function destroyAsteroid(a, awardScore) {
    a.alive = false;
    if (awardScore) addScore(ent.sizeSpec(a.size).score);

    var sizeChar = a.size === 'L' ? 'L' : (a.size === 'M' ? 'M' : 'S');
    spawnExplosion(a.x, a.y, sizeChar);
    VB.audio.explode(sizeChar);
    if (a.size === 'L') haptic(CFG.HAPTICS.LARGE_ASTEROID_MS);
    if (VB.render && VB.render.shake && a.size === 'L') VB.render.shake(CFG.RENDER.SHAKE_LARGE_ASTEROID);

    if (a.size === 'S') return;

    var childSize = a.size === 'L' ? 'M' : 'S';
    var spec = ent.sizeSpec(childSize);
    var childrenToSpawn = spawnableChildCount();

    for (var i = 0; i < childrenToSpawn; i++) {
      var dir = util.randRange(0, Math.PI * 2);
      var speed = util.randRange(spec.speedMin, spec.speedMax) * world.waveSpeedMul;
      var ox = Math.cos(dir) * a.radius * CFG.ASTEROID.SPLIT_OFFSET_MULT;
      var oy = Math.sin(dir) * a.radius * CFG.ASTEROID.SPLIT_OFFSET_MULT;
      var vx = a.vx * CFG.ASTEROID.SPLIT_VEL_INHERIT + Math.cos(dir) * speed;
      var vy = a.vy * CFG.ASTEROID.SPLIT_VEL_INHERIT + Math.sin(dir) * speed;
      world.asteroids.push(ent.createAsteroid(childSize, a.x + ox, a.y + oy, vx, vy));
    }
  }

  function countAliveAsteroids() {
    var n = 0;
    for (var i = 0; i < world.asteroids.length; i++) if (world.asteroids[i].alive) n++;
    return n;
  }

  function spawnableChildCount() {
    var alive = countAliveAsteroids();
    if (alive >= CFG.ASTEROID.MAX_ALIVE) return 0;
    if (alive + 1 >= CFG.ASTEROID.MAX_ALIVE) return 1;
    return 2;
  }

  function addScore(pts) {
    world.score += pts;
    var awarded = Math.floor(world.score / CFG.SHIP.EXTRA_LIFE_SCORE);
    if (awarded > world.livesAwarded) {
      var grant = awarded - world.livesAwarded;
      world.livesAwarded = awarded;
      for (var i = 0; i < grant; i++) {
        world.lives = Math.min(CFG.SHIP.LIVES_MAX_DISPLAY, world.lives + 1);
      }
      VB.audio.extraLife();
      haptic(CFG.HAPTICS.EXTRA_LIFE_MS);
      if (world.callbacks.onExtraLife) world.callbacks.onExtraLife();
    }
  }

  function spawnExplosion(x, y, size) {
    var count = size === 'L' ? 22 : (size === 'M' ? 14 : (size === 'S' ? 8 : 18));
    var speedMax = size === 'L' ? 140 : (size === 'M' ? 110 : 90);
    for (var i = 0; i < count; i++) {
      if (world.particles.length >= CFG.RENDER.PARTICLE_MAX) break;
      var p = world.particlePool.acquire();
      var dir = util.randRange(0, Math.PI * 2);
      var speed = util.randRange(speedMax * 0.2, speedMax);
      ent.spawnParticle(p, x, y, Math.cos(dir) * speed, Math.sin(dir) * speed, util.randRange(0.3, 0.7));
      world.particles.push(p);
    }
  }

  // ---- compaction (swap-remove dead entities) ----------------------------------
  function compact() {
    compactPooled(world.bullets, world.bulletPool);
    compactPooled(world.particles, world.particlePool);
    compactPooled(world.debris, world.debrisPool);
    compactAsteroids();
  }

  function compactPooled(arr, pool) {
    for (var i = arr.length - 1; i >= 0; i--) {
      if (!arr[i].alive) {
        pool.release(arr[i]);
        util.swapRemove(arr, i);
      }
    }
  }

  function compactAsteroids() {
    for (var i = world.asteroids.length - 1; i >= 0; i--) {
      if (!world.asteroids[i].alive) util.swapRemove(world.asteroids, i);
    }
  }

  // ---- decorative title-screen background --------------------------------------
  // A handful of drifting asteroids with no ship, collisions or scoring, purely so
  // the TITLE screen doesn't look static. main.js drives this while state===TITLE.
  function seedTitleAsteroids() {
    // Clear leftover game state (e.g. after Quit to Title) so only rocks drift behind the menu.
    world.asteroids.length = 0;
    world.saucer = null;
    world.gameOver = false;
    clearPoolArray(world.bullets, world.bulletPool);
    clearPoolArray(world.particles, world.particlePool);
    clearPoolArray(world.debris, world.debrisPool);
    world.ship.alive = false;
    world.ship.visible = false;
    var count = Math.max(4, Math.round(6 * world.density));
    for (var i = 0; i < count; i++) {
      var x = util.randRange(0, world.worldW);
      var y = util.randRange(0, world.worldH);
      var speed = util.randRange(CFG.ASTEROID.LARGE.speedMin, CFG.ASTEROID.LARGE.speedMax) * 0.6;
      var dir = util.randRange(0, Math.PI * 2);
      world.asteroids.push(ent.createAsteroid('L', x, y, Math.cos(dir) * speed, Math.sin(dir) * speed));
    }
  }

  function stepDecorative(dt) {
    updateAsteroids(dt);
  }

  // ---- debug helpers ------------------------------------------------------------
  function debugClearWave() {
    for (var i = 0; i < world.asteroids.length; i++) world.asteroids[i].alive = false;
    compactAsteroids();
  }

  function debugToggleInvuln() {
    world.ship.invulnTimer = world.ship.invulnTimer > 0 ? 0 : 9999;
  }

  VB.world.init = init;
  VB.world.resize = resize;
  VB.world.startGame = startGame;
  VB.world.step = step;
  VB.world.seedTitleAsteroids = seedTitleAsteroids;
  VB.world.stepDecorative = stepDecorative;
  VB.world.debugClearWave = debugClearWave;
  VB.world.debugToggleInvuln = debugToggleInvuln;
})();
