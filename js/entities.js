// js/entities.js — Ship, Asteroid, Bullet, Saucer, Particle, Debris factories/updaters.
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var CFG = VB.CFG;
  var util = VB.util;

  // Local-space ship outline: nose, right wing, right back-notch, left back-notch, left wing.
  // Five edges (nose-rWing, rWing-rNotch, rNotch-lNotch, lNotch-lWing, lWing-nose) give the
  // "open back" silhouette and double as the five debris segments on death.
  var SHIP_SHAPE = [
    18, 0,
    -12, 10,
    -6, 3,
    -6, -3,
    -12, -10
  ];

  function wrapPos(e, worldW, worldH) {
    e.x = util.wrap(e.x, worldW);
    e.y = util.wrap(e.y, worldH);
  }

  // ---- Ship ---------------------------------------------------------------
  function createShip() {
    return {
      x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2,
      radius: CFG.SHIP.HIT_RADIUS,
      alive: true,
      visible: true,
      thrusting: false,
      fireTimer: 0,
      hyperTimer: 0,       // cooldown remaining
      hyperActive: false,  // currently mid-hyperspace jump
      hyperElapsed: 0,
      invulnTimer: 0,      // remaining invulnerability seconds
      blinkOn: true,
      flameFlicker: 0
    };
  }

  function resetShipAt(ship, x, y) {
    ship.x = x; ship.y = y;
    ship.vx = 0; ship.vy = 0;
    ship.angle = -Math.PI / 2;
    ship.alive = true;
    ship.visible = true;
    ship.thrusting = false;
    ship.fireTimer = 0;
    ship.hyperActive = false;
    ship.hyperElapsed = 0;
    ship.invulnTimer = CFG.SHIP.INVULN_DURATION;
    ship.blinkOn = true;
  }

  function updateShip(ship, dt, worldW, worldH, rotateInput, aimAngle, thrustInput, rotSpeed) {
    if (!ship.alive) return;

    if (ship.hyperActive) {
      ship.hyperElapsed += dt;
      if (ship.hyperElapsed >= CFG.SHIP.HYPERSPACE_DURATION) {
        ship.hyperActive = false;
        ship.visible = true;
      }
    } else {
      if (aimAngle !== null && aimAngle !== undefined) {
        var delta = util.angleDelta(ship.angle, aimAngle);
        var maxStep = rotSpeed * dt;
        if (delta > maxStep) delta = maxStep;
        else if (delta < -maxStep) delta = -maxStep;
        ship.angle += delta;
      } else if (rotateInput) {
        ship.angle += rotateInput * rotSpeed * dt;
      }

      ship.thrusting = !!thrustInput;
      if (thrustInput) {
        ship.vx += Math.cos(ship.angle) * CFG.SHIP.THRUST_ACCEL * dt;
        ship.vy += Math.sin(ship.angle) * CFG.SHIP.THRUST_ACCEL * dt;
        var speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
        if (speed > CFG.SHIP.MAX_SPEED) {
          var k = CFG.SHIP.MAX_SPEED / speed;
          ship.vx *= k; ship.vy *= k;
        }
      }

      var drag = Math.exp(-CFG.SHIP.DRAG_K * dt);
      ship.vx *= drag;
      ship.vy *= drag;

      ship.x += ship.vx * dt;
      ship.y += ship.vy * dt;
      wrapPos(ship, worldW, worldH);
    }

    if (ship.fireTimer > 0) ship.fireTimer -= dt;
    if (ship.hyperTimer > 0) ship.hyperTimer -= dt;

    if (ship.invulnTimer > 0) {
      ship.invulnTimer -= dt;
      var blinkPeriod = 1 / CFG.SHIP.INVULN_BLINK_HZ;
      ship.blinkOn = Math.floor((CFG.SHIP.INVULN_DURATION - Math.max(0, ship.invulnTimer)) / (blinkPeriod / 2)) % 2 === 0;
    } else {
      ship.blinkOn = true;
    }
  }

  // ---- Asteroids ------------------------------------------------------------
  function sizeSpec(size) {
    return size === 'L' ? CFG.ASTEROID.LARGE : (size === 'M' ? CFG.ASTEROID.MEDIUM : CFG.ASTEROID.SMALL);
  }

  function makeAsteroidVerts() {
    var count = util.randInt(CFG.ASTEROID.VERT_MIN, CFG.ASTEROID.VERT_MAX);
    var verts = new Float32Array(count * 2);
    for (var i = 0; i < count; i++) {
      var theta = (i / count) * Math.PI * 2;
      var jitter = util.randRange(CFG.ASTEROID.RADIUS_JITTER_MIN, CFG.ASTEROID.RADIUS_JITTER_MAX);
      verts[i * 2] = Math.cos(theta) * jitter;
      verts[i * 2 + 1] = Math.sin(theta) * jitter;
    }
    return verts;
  }

  function createAsteroid(size, x, y, vx, vy) {
    var spec = sizeSpec(size);
    return {
      alive: true,
      size: size,
      x: x, y: y, vx: vx, vy: vy,
      radius: spec.radius,
      hitRadius: spec.radius * CFG.ASTEROID.HIT_RADIUS_MULT,
      angle: util.randRange(0, Math.PI * 2),
      spin: util.randRange(CFG.ASTEROID.SPIN_MIN, CFG.ASTEROID.SPIN_MAX),
      verts: makeAsteroidVerts()
    };
  }

  function updateAsteroid(a, dt, worldW, worldH) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.angle += a.spin * dt;
    wrapPos(a, worldW, worldH);
  }

  // ---- Bullets ---------------------------------------------------------------
  function createBullet() {
    return { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, owner: 'player' };
  }

  function fireBullet(b, x, y, angle, baseVx, baseVy, speed, life, owner) {
    b.alive = true;
    b.x = x; b.y = y;
    b.vx = Math.cos(angle) * speed + baseVx;
    b.vy = Math.sin(angle) * speed + baseVy;
    b.life = life;
    b.owner = owner;
  }

  function updateBullet(b, dt, worldW, worldH) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    wrapPos(b, worldW, worldH);
    b.life -= dt;
    if (b.life <= 0) b.alive = false;
  }

  // ---- Saucer ------------------------------------------------------------
  function createSaucer(type, worldW, worldH) {
    var spec = type === 'S' ? CFG.SAUCER.SMALL : CFG.SAUCER.LARGE;
    var fromLeft = util.rand() < 0.5;
    return {
      alive: true,
      type: type,
      x: fromLeft ? -spec.hitRadius * 1.5 : worldW + spec.hitRadius * 1.5, // start just off-screen
      y: util.randRange(0, worldH),
      vx: (fromLeft ? 1 : -1) * spec.speed,
      vy: 0,
      speed: spec.speed,
      hitRadius: spec.hitRadius,
      fireInterval: spec.fireInterval,
      fireTimer: spec.fireInterval * 0.5,
      vyChangeTimer: util.randRange(CFG.SAUCER.VY_CHANGE_MIN, CFG.SAUCER.VY_CHANGE_MAX),
      dir: fromLeft ? 1 : -1
    };
  }

  function updateSaucer(s, dt, worldH) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.y = util.wrap(s.y, worldH); // vertical wrap only
    s.vyChangeTimer -= dt;
    if (s.vyChangeTimer <= 0) {
      var f = CFG.SAUCER.VY_FACTORS[util.randInt(0, CFG.SAUCER.VY_FACTORS.length - 1)];
      s.vy = f * s.speed;
      s.vyChangeTimer = util.randRange(CFG.SAUCER.VY_CHANGE_MIN, CFG.SAUCER.VY_CHANGE_MAX);
    }
    s.fireTimer -= dt;
  }

  // ---- Particles ------------------------------------------------------------
  function createParticle() {
    return { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1 };
  }

  function spawnParticle(p, x, y, vx, vy, life) {
    p.alive = true;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
  }

  function updateParticle(p, dt, worldW, worldH) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    wrapPos(p, worldW, worldH);
    p.life -= dt;
    if (p.life <= 0) p.alive = false;
  }

  // ---- Ship debris (death) ------------------------------------------------
  function createDebris() {
    return { alive: false, x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 1 };
  }

  function spawnDebrisFromShip(pool, list, ship) {
    for (var i = 0; i < 5; i++) {
      var d = pool.acquire();
      d.alive = true;
      d.x = ship.x; d.y = ship.y;
      d.x1 = SHIP_SHAPE[i * 2];
      d.y1 = SHIP_SHAPE[i * 2 + 1];
      var j = (i + 1) % 5;
      d.x2 = SHIP_SHAPE[j * 2];
      d.y2 = SHIP_SHAPE[j * 2 + 1];
      d.angle = ship.angle;
      d.spin = util.randRange(-2, 2);
      var dir = util.randRange(0, Math.PI * 2);
      var speed = util.randRange(20, 90);
      d.vx = Math.cos(dir) * speed + ship.vx * 0.3;
      d.vy = Math.sin(dir) * speed + ship.vy * 0.3;
      d.life = 1.4;
      d.maxLife = 1.4;
      list.push(d);
    }
  }

  function updateDebris(d, dt, worldW, worldH) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.angle += d.spin * dt;
    wrapPos(d, worldW, worldH);
    d.life -= dt;
    if (d.life <= 0) d.alive = false;
  }

  VB.entities = {
    SHIP_SHAPE: SHIP_SHAPE,
    createShip: createShip,
    resetShipAt: resetShipAt,
    updateShip: updateShip,

    sizeSpec: sizeSpec,
    createAsteroid: createAsteroid,
    updateAsteroid: updateAsteroid,

    createBullet: createBullet,
    fireBullet: fireBullet,
    updateBullet: updateBullet,

    createSaucer: createSaucer,
    updateSaucer: updateSaucer,

    createParticle: createParticle,
    spawnParticle: spawnParticle,
    updateParticle: updateParticle,

    createDebris: createDebris,
    spawnDebrisFromShip: spawnDebrisFromShip,
    updateDebris: updateDebris,

    wrapPos: wrapPos
  };
})();
