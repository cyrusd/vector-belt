// js/render.js — canvas sizing, DPR, camera transform, drawing, glow, shake.
(function () {
  'use strict';
  var VB = window.VB = window.VB || {};
  var CFG = VB.CFG;
  var util = VB.util;
  var ent = VB.entities;

  var canvas = null, ctx = null;
  var cssW = 0, cssH = 0, dpr = 1;

  var settings = { quality: 'high', glow: 'auto', shake: true, theme: 'classic' };
  var palette = CFG.THEMES.classic;
  var resolvedGlow = false;
  var reducedMotion = false;

  var shakeAmount = 0, shakeTimer = 0;
  var shakeX = 0, shakeY = 0;

  var stars = []; // normalized [0,1] positions, generated once
  var debugEl = null;
  var debugEnabled = false;

  var fpsAccum = 0, fpsFrames = 0, fpsValue = 0, lastRafTime = 0;

  function init(canvasEl, debugFlag) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d', { alpha: false });
    debugEnabled = !!debugFlag;

    for (var i = 0; i < CFG.RENDER.STAR_COUNT; i++) {
      stars.push({ x: util.rand(), y: util.rand(), b: util.randRange(0.2, 0.8) });
    }

    try {
      reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {}

    if (debugEnabled) {
      debugEl = document.createElement('div');
      debugEl.id = 'debug-overlay';
      document.body.appendChild(debugEl);
    }

    applySettings(settings);
  }

  function applySettings(s) {
    settings = s;
    palette = CFG.THEMES[s.theme] || CFG.THEMES.classic;
    resolveGlow();
    resize(cssW, cssH); // dpr may change with quality
  }

  function resolveGlow() {
    if (settings.quality === 'low') { resolvedGlow = false; return; }
    if (settings.glow === 'on') { resolvedGlow = true; return; }
    if (settings.glow === 'off') { resolvedGlow = false; return; }
    try {
      resolvedGlow = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    } catch (e) { resolvedGlow = false; }
  }

  function resize(newCssW, newCssH) {
    if (newCssW) cssW = newCssW;
    if (newCssH) cssH = newCssH;
    if (!canvas || !cssW || !cssH) return;
    var maxDpr = settings.quality === 'low' ? CFG.RENDER.DPR_MAX_LOW : CFG.RENDER.DPR_MAX;
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }

  function shake(amount) {
    if (!settings.shake || reducedMotion) return;
    shakeAmount = Math.max(shakeAmount, amount);
    shakeTimer = CFG.RENDER.SHAKE_DECAY_S;
  }

  function updateShake(dt) {
    if (shakeTimer > 0) {
      shakeTimer -= dt;
      var k = Math.max(0, shakeTimer / CFG.RENDER.SHAKE_DECAY_S);
      var mag = shakeAmount * k;
      shakeX = (util.rand() * 2 - 1) * mag;
      shakeY = (util.rand() * 2 - 1) * mag;
      if (shakeTimer <= 0) { shakeX = 0; shakeY = 0; shakeAmount = 0; }
    } else {
      shakeX = 0; shakeY = 0;
    }
  }

  // Sets the color for the next batch of strokes/fills; the glow takes the same color.
  function ink(color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (resolvedGlow) ctx.shadowColor = color;
  }

  // Returns offsets [dx,dy] (including [0,0]) at which an entity of given radius
  // at (x,y) should also be drawn so it doesn't pop in/out at the wrap edges.
  // Allocation-free: reuses one array. Pass wrapX=false for saucers (vertical wrap only).
  var ghostOffsets = [];
  function computeGhosts(x, y, radius, worldW, worldH, wrapX) {
    ghostOffsets.length = 0;
    ghostOffsets.push(0, 0);
    var gx = 0, gy = 0;
    if (wrapX !== false) {
      if (x - radius < 0) gx = worldW;
      else if (x + radius > worldW) gx = -worldW;
    }
    if (y - radius < 0) gy = worldH;
    else if (y + radius > worldH) gy = -worldH;
    if (gx) ghostOffsets.push(gx, 0);
    if (gy) ghostOffsets.push(0, gy);
    if (gx && gy) ghostOffsets.push(gx, gy);
    return ghostOffsets;
  }

  function frame(now, world) {
    if (!ctx) return;
    var realDt = lastRafTime ? Math.min(0.1, (now - lastRafTime) / 1000) : 1 / 60;
    lastRafTime = now;
    updateShake(realDt);

    var ppu = world.ppu;
    var worldW = world.worldW, worldH = world.worldH;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = palette.BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr * ppu, 0, 0, dpr * ppu, shakeX * dpr, shakeY * dpr);
    ctx.lineWidth = CFG.RENDER.LINE_WIDTH_CSS / ppu;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    drawStars(worldW, worldH, ppu);

    // shadowBlur ignores the current transform, so it is specified in device pixels.
    ctx.shadowBlur = resolvedGlow ? CFG.RENDER.GLOW_BLUR_CSS * dpr : 0;

    drawAsteroids(world.asteroids, worldW, worldH);
    drawBullets(world.bullets, worldW, worldH, ppu);
    drawSaucer(world.saucer, worldW, worldH);
    drawShip(world.ship, worldW, worldH);
    drawDebris(world.debris);

    ctx.shadowBlur = 0;
    drawParticles(world.particles, ppu);

    if (debugEnabled) drawDebug(realDt, world);
  }

  function drawStars(worldW, worldH, ppu) {
    ctx.fillStyle = palette.STAR;
    ctx.globalAlpha = palette.STAR_ALPHA;
    var r = 1.2 / ppu; // ~1.2 CSS px regardless of world scale
    ctx.beginPath();
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var x = s.x * worldW, y = s.y * worldH;
      ctx.rect(x - r / 2, y - r / 2, r, r);
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawAsteroids(asteroids, worldW, worldH) {
    if (!asteroids.length) return;
    ink(palette.ROCK);
    ctx.beginPath();
    for (var i = 0; i < asteroids.length; i++) {
      var a = asteroids[i];
      var verts = a.verts;
      var n = verts.length / 2;
      var cosA = Math.cos(a.angle), sinA = Math.sin(a.angle);
      var ghosts = computeGhosts(a.x, a.y, a.radius, worldW, worldH);
      for (var g = 0; g < ghosts.length; g += 2) {
        var ox = a.x + ghosts[g], oy = a.y + ghosts[g + 1];
        for (var v = 0; v < n; v++) {
          var lx = verts[v * 2] * a.radius, ly = verts[v * 2 + 1] * a.radius;
          var wx = lx * cosA - ly * sinA + ox;
          var wy = lx * sinA + ly * cosA + oy;
          if (v === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
        }
        ctx.closePath();
      }
    }
    ctx.stroke();
  }

  function drawBullets(bullets, worldW, worldH, ppu) {
    if (!bullets.length) return;
    var half = (CFG.RENDER.BULLET_SIZE_CSS / ppu) / 2;
    // Round bullets get a slightly larger radius so they read as heavy as the squares.
    if (palette.ROUND_BULLETS) half *= 1.25;

    ink(palette.PLAYER_BULLET);
    ctx.beginPath();
    var any = false;
    for (var i = 0; i < bullets.length; i++) {
      if (bullets[i].owner !== 'player') continue;
      any = true;
      addBulletShapes(bullets[i], half, worldW, worldH);
    }
    if (any) ctx.fill();

    ink(palette.SAUCER_BULLET);
    ctx.beginPath();
    any = false;
    for (var j = 0; j < bullets.length; j++) {
      if (bullets[j].owner !== 'saucer') continue;
      any = true;
      addBulletShapes(bullets[j], half, worldW, worldH);
    }
    if (any) ctx.fill();
  }

  function addBulletShapes(b, half, worldW, worldH) {
    var ghosts = computeGhosts(b.x, b.y, half, worldW, worldH);
    for (var g = 0; g < ghosts.length; g += 2) {
      var x = b.x + ghosts[g], y = b.y + ghosts[g + 1];
      if (palette.ROUND_BULLETS) {
        ctx.moveTo(x + half, y);
        ctx.arc(x, y, half, 0, Math.PI * 2);
      } else {
        ctx.rect(x - half, y - half, half * 2, half * 2);
      }
    }
  }

  function drawSaucer(s, worldW, worldH) {
    if (!s) return;
    ink(palette.SAUCER);
    ctx.beginPath();
    var r = s.hitRadius;
    var ghosts = computeGhosts(s.x, s.y, r * 1.4, worldW, worldH, false);
    for (var g = 0; g < ghosts.length; g += 2) {
      var ox = s.x + ghosts[g], oy = s.y + ghosts[g + 1];
      // simple flying-saucer silhouette: two elliptical arcs plus a hull line
      ctx.moveTo(ox - r, oy);
      ctx.lineTo(ox - r * 0.4, oy - r * 0.55);
      ctx.lineTo(ox + r * 0.4, oy - r * 0.55);
      ctx.lineTo(ox + r, oy);
      ctx.lineTo(ox + r * 0.4, oy + r * 0.5);
      ctx.lineTo(ox - r * 0.4, oy + r * 0.5);
      ctx.closePath();
      ctx.moveTo(ox - r * 0.55, oy);
      ctx.lineTo(ox + r * 0.55, oy);
    }
    ctx.stroke();
  }

  function drawShip(ship, worldW, worldH) {
    if (!ship.alive || !ship.visible) return;

    var shape = ent.SHIP_SHAPE;
    var cosA = Math.cos(ship.angle), sinA = Math.sin(ship.angle);
    // Invulnerable: blink between full and dim (§8) so the ship never fully disappears.
    if (ship.invulnTimer > 0 && !ship.blinkOn) ctx.globalAlpha = 0.35;

    ink(palette.SHIP);
    ctx.beginPath();
    var ghosts = computeGhosts(ship.x, ship.y, CFG.SHIP.LENGTH, worldW, worldH);
    for (var g = 0; g < ghosts.length; g += 2) {
      var ox = ship.x + ghosts[g], oy = ship.y + ghosts[g + 1];
      for (var v = 0; v < 5; v++) {
        var lx = shape[v * 2], ly = shape[v * 2 + 1];
        var wx = lx * cosA - ly * sinA + ox;
        var wy = lx * sinA + ly * cosA + oy;
        if (v === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
      }
    }
    ctx.stroke();

    if (ship.thrusting) {
      ink(palette.THRUST);
      ctx.beginPath();
      var flick = 0.5 + util.rand() * 0.5;
      var backX = -6, backY1 = 3, backY2 = -3;
      var tipX = -6 - 14 * flick, tipY = 0;
      for (g = 0; g < ghosts.length; g += 2) {
        ox = ship.x + ghosts[g]; oy = ship.y + ghosts[g + 1];
        var w1x = backX * cosA - backY1 * sinA + ox, w1y = backX * sinA + backY1 * cosA + oy;
        var w2x = backX * cosA - backY2 * sinA + ox, w2y = backX * sinA + backY2 * cosA + oy;
        var wtx = tipX * cosA - tipY * sinA + ox, wty = tipX * sinA + tipY * cosA + oy;
        ctx.moveTo(w1x, w1y); ctx.lineTo(wtx, wty);
        ctx.moveTo(w2x, w2y); ctx.lineTo(wtx, wty);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawDebris(list) {
    if (!list.length) return;
    ink(palette.SHIP);
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      ctx.globalAlpha = Math.max(0, d.life / d.maxLife);
      var cosA = Math.cos(d.angle), sinA = Math.sin(d.angle);
      var x1 = d.x1 * cosA - d.y1 * sinA + d.x;
      var y1 = d.x1 * sinA + d.y1 * cosA + d.y;
      var x2 = d.x2 * cosA - d.y2 * sinA + d.x;
      var y2 = d.x2 * sinA + d.y2 * cosA + d.y;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Particles are batched by theme color, then by fade bucket, to keep fills few.
  var ALPHA_BUCKETS = [0.15, 0.35, 0.55, 0.75, 0.95];
  var PARTICLE_COLORS = ['ROCK', 'SAUCER', 'SHIP'];
  function drawParticles(list, ppu) {
    if (!list.length) return;
    var half = (CFG.RENDER.PARTICLE_SIZE_CSS / ppu) / 2;
    for (var c = 0; c < PARTICLE_COLORS.length; c++) {
      var key = PARTICLE_COLORS[c];
      ctx.fillStyle = palette[key];
      for (var k = 0; k < ALPHA_BUCKETS.length; k++) {
        ctx.beginPath();
        var any = false;
        for (var p = 0; p < list.length; p++) {
          var particle = list[p];
          if (particle.color !== key) continue;
          var t = Math.max(0, Math.min(1, particle.life / particle.maxLife));
          var bucket = Math.min(ALPHA_BUCKETS.length - 1, Math.floor(t * ALPHA_BUCKETS.length));
          if (bucket !== k) continue;
          any = true;
          ctx.rect(particle.x - half, particle.y - half, half * 2, half * 2);
        }
        if (any) {
          ctx.globalAlpha = ALPHA_BUCKETS[k];
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawDebug(frameDt, world) {
    fpsAccum += frameDt; fpsFrames++;
    if (fpsAccum >= 0.5) {
      fpsValue = fpsFrames / fpsAccum;
      fpsAccum = 0; fpsFrames = 0;
    }

    ctx.strokeStyle = 'rgba(255,80,80,0.6)';
    ctx.lineWidth = 1 / world.ppu;
    ctx.beginPath();
    drawDebugCircle(world.ship.x, world.ship.y, world.ship.radius);
    for (var i = 0; i < world.asteroids.length; i++) {
      var a = world.asteroids[i];
      drawDebugCircle(a.x, a.y, a.hitRadius);
    }
    if (world.saucer) drawDebugCircle(world.saucer.x, world.saucer.y, world.saucer.hitRadius);
    ctx.stroke();

    debugEl.textContent =
      'FPS ' + fpsValue.toFixed(0) +
      ' | ast ' + world.asteroids.length +
      ' | bul ' + world.bullets.length +
      ' | par ' + world.particles.length +
      ' | deb ' + world.debris.length +
      ' | wave ' + world.wave +
      ' | phase ' + world.phase;
  }

  function drawDebugCircle(x, y, r) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  VB.render = {
    init: init,
    resize: resize,
    applySettings: applySettings,
    shake: shake,
    frame: frame
  };
})();
