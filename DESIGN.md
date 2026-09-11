# VECTOR BELT — Design Spec

A browser game in the spirit of the arcade classic *Asteroids*. It plays well with a keyboard on desktop and with touch on phones and tablets, in portrait or landscape.

---

## 1. Goals and constraints

| Goal | Consequence |
|---|---|
| Zero build step, zero dependencies | Vanilla JS, Canvas 2D, Web Audio. No npm, bundler or framework. |
| Runs from `file://` **and** any static host | **Classic `<script>` tags, not ES modules** (Chrome blocks module scripts on `file://`). All files attach to one global namespace `window.VB`. |
| No network requests at all | No web fonts, no CDN, no image or audio assets. Sound is synthesized. Graphics are vector strokes. |
| Same feel from a 390 px phone to a 2560 px monitor | Resolution-independent world units (§3). Object counts scale with world area. |
| Smooth on mid-range phones and on 120/144 Hz displays | Fixed-timestep simulation, capped DPR, no per-frame allocations in hot paths, batched strokes, optional glow. |
| Fair and comfortable on touch | Floating joystick plus a large fire zone (§6.2), respawn invulnerability, forgiving hitboxes. |

### Target browsers
The latest two versions of Chrome, Edge, Firefox and Safari on desktop. iOS Safari 16+ and Chrome for Android.

---

## 2. File layout

```
index.html            – markup: canvas, HUD, overlays, touch layer; loads scripts in order
style.css             – layout, safe areas, overlays, touch-control visuals
manifest.webmanifest  – name, icons omitted, display: fullscreen, orientation: any, theme #000
js/config.js          – every tunable number in one frozen object VB.CFG
js/util.js            – vec helpers, wrap, wrapped delta, rng, clamp/lerp, object pool
js/storage.js         – localStorage wrapper (try/catch everywhere), settings + best score
js/audio.js           – Web Audio synth: unlock, master gain, one-shot and looping sounds
js/input.js           – keyboard, pointer/touch, gamepad → a unified VB.input state
js/entities.js        – Ship, Asteroid, Bullet, Saucer, Particle, Debris factories/updaters
js/world.js           – world sizing, spawning, waves, collisions, scoring, lives
js/render.js          – canvas sizing, DPR, camera transform, drawing, glow, shake
js/ui.js              – DOM overlays (title/pause/settings/game over), HUD, touch visuals
js/main.js            – bootstrap, state machine, main loop, visibility/resize handling
```

Scripts load in the order listed. Each file is an IIFE that reads from and writes to `window.VB`.

---

## 3. World, resolution and scaling

### 3.1 World units
All simulation uses **world units (u)**. The world's *short side* is `WORLD_SHORT` units, and its long side follows the viewport's aspect ratio.

```
cssShort   = min(viewportCssW, viewportCssH)
WORLD_SHORT = clamp(cssShort * 1.2, 460, 760)
ppu        = cssShort / WORLD_SHORT           // CSS px per world unit
worldW     = viewportCssW / ppu
worldH     = viewportCssH / ppu
```

Here is why. On a 390 px phone, `WORLD_SHORT` is 468 and the 30 u ship is about 25 CSS px, which is still readable. On a 1080 px desktop, `WORLD_SHORT` is 760 and the ship is about 43 px. The playfield never letterboxes. It fills the screen and wraps at the screen edges, as in the arcade game.

### 3.2 Density factor
`density = clamp((worldW * worldH) / (1280 * 720), 0.55, 1.4)`. This scales the starting asteroid count per wave, so a portrait phone doesn't get the same crowd as an ultrawide monitor.

### 3.3 Canvas backing store
- `dpr = min(devicePixelRatio, 2)`. Use 1.5 on the Low quality setting.
- `canvas.width = round(cssW * dpr)`, same for height. CSS size is 100% of the viewport.
- Each frame: `ctx.setTransform(dpr*ppu, 0, 0, dpr*ppu, shakeX, shakeY)`. After that, all drawing is in world units.
- Line width is set in CSS px and converted: `ctx.lineWidth = 2 / ppu`. That gives a crisp 2 px line at any scale.

### 3.4 Resize and orientation
- Listen to `window.resize` and `visualViewport.resize` when available. Coalesce the events into a single rAF-deferred `applyResize()`.
- On resize during play, recompute the world size and **scale every entity position** by `newW/oldW` and `newH/oldH`. Velocities stay unchanged. Do not pause.
- Use `window.innerWidth/innerHeight` for the viewport. `html, body` are `position: fixed; inset: 0; overflow: hidden; overscroll-behavior: none`.

### 3.5 Wraparound
- Positions wrap modulo `worldW/worldH`.
- **Collision** uses the *shortest wrapped delta* (`util.wrapDelta`), so objects straddling an edge still collide.
- **Rendering**: any entity within `radius` of an edge is also drawn at the ±W/±H offset (ghost copies). That avoids pop-in at edges.
- **Exception:** a saucer wraps vertically only. It enters from one side and despawns after crossing the other.

---

## 4. Game loop

- Drive the loop with `requestAnimationFrame`. Simulate at a **fixed step of 1/120 s** using an accumulator.
- Clamp frame `dt` to 0.25 s, so at most 30 steps run per frame. This prevents a spiral of death after a stall.
- Render once per rAF after stepping. No interpolation is needed at 120 Hz simulation.
- `now` comes from the rAF timestamp. The loop keeps running in the TITLE state so asteroids can drift behind the menu.
- Pause on `document.visibilitychange` (hidden) and on `window.blur`. Returning does **not** auto-resume; it shows the pause overlay.
- On blur, clear all held keys and active pointers so nothing stays stuck.

### 4.1 State machine (`main.js`)

```
TITLE ──play──▶ PLAYING ◀──resume── PAUSED
                  │  ▲                 ▲
                  │  └── (P/Esc/⏸) ────┘
                  ▼
              GAME_OVER ──play again──▶ PLAYING
                  └──title──▶ TITLE
```

PLAYING has sub-phases handled in `world.js`:
- `WAVE_INTRO`: 2 s, shows "WAVE N". Asteroids are spawned but the ship can already move.
- `ACTIVE`
- `RESPAWN_WAIT`
- `WAVE_CLEAR`: 1.5 s delay before the next wave.

Rules for inputs across state changes:
- **Input edge rule:** a touch or key that *started before* entering PLAYING must not fire or thrust. Track `pointerdown` and `keydown` timestamps and ignore anything older than the state-entry time.
- The "Play again" button on GAME_OVER is disabled for 1.0 s, so a frantic tap doesn't skip the screen.

---

## 5. Gameplay rules (all values live in `config.js`)

### 5.1 Ship
| Param | Value |
|---|---|
| Shape | Classic open-back triangle, 30 u long, 20 u wide |
| Hit radius | 11 u (forgiving) |
| Rotation speed | 4.8 rad/s (touch aim mode: 6.0 rad/s, see §6.2) |
| Thrust accel | 480 u/s² |
| Max speed | 520 u/s |
| Drag | `v *= exp(-0.55 * dt)` |
| Fire cooldown | 0.15 s. Holding fire autofires at this rate. |
| Max live player bullets | 4 |
| Bullet speed / life | 820 u/s plus ship velocity, 0.85 s |
| Hyperspace | Ship vanishes for 0.45 s, reappears at a random position. Not guaranteed safe. No random self-destruct. Cooldown 1.5 s. |
| Respawn | 1.5 s after death, wait until no asteroid or saucer is within 150 u of the center (give up waiting after 4 s). Spawn at center with velocity 0. |
| Invulnerability | 2.5 s after respawn. Ship blinks at 8 Hz. Firing and thrusting are allowed. |
| Lives | 3 at start. +1 at every 10,000 points. Cap of 9 displayed. |
| Thrust flame | Flickering 2-segment flame drawn while thrusting |

### 5.2 Asteroids
| Size | Radius | Speed (u/s) | Score | Splits into |
|---|---|---|---|---|
| Large | 46 | 35–80 | 20 | 2 medium |
| Medium | 24 | 60–130 | 50 | 2 small |
| Small | 12 | 100–190 | 100 | — |

- **Shape**: generated once per asteroid. 10–12 vertices, radius jitter 0.72–1.12. Store the local vertex array (`Float32Array`). Spin is random from −1.2 to 1.2 rad/s.
- **Hit radius**: `radius * 0.9`.
- **Split**: children inherit parent velocity × 0.4, plus a random direction at their size's speed range × `waveSpeedMul`. Each child is offset ±`radius*0.3` from the parent so the two don't overlap.
- **Wave spawn**: large count is `max(3, round(min(4 + 2*(wave-1), 11) * density))`. Spawn at random positions at least 220 u (wrapped distance) from the ship.
- `waveSpeedMul = min(1 + 0.06*(wave-1), 1.6)`.
- **Hard cap** of 80 asteroids alive. If a split would exceed the cap, spawn one child instead of two.

### 5.3 Saucers
| Param | Large | Small |
|---|---|---|
| Hit radius | 20 | 11 |
| Speed | 110 | 160 |
| Fire interval | 1.3 s | 1.0 s |
| Aim | Random direction | At ship (wrapped shortest delta) ± error, where error = `lerp(25°, 3°, clamp(score/50000, 0, 1))` |
| Score | 200 | 1000 |

- **Spawn timer**: random `max(6, 18 - wave)` to `max(10, 26 - wave)` seconds. It only counts down while ACTIVE, the ship is alive and no saucer exists.
- **Type**: `pSmall = score < 10000 ? 0.1 : min(0.8, 0.3 + 0.05*wave)`.
- **Movement**: enters from the left or right edge at a random y. Every 1.5–3 s, it picks a vertical velocity from {−0.6, 0, +0.6} × speed. It despawns once it has fully crossed the far edge.
- **Saucer bullets**: 480 u/s, 1.2 s life, max 3 alive per saucer, drawn in a warm red (`#ff6b5b`).
- **Collisions**:
  - Saucer vs asteroid destroys both. The asteroid still splits. No points.
  - Saucer bullet vs asteroid splits the asteroid. No points.
  - Player bullet vs saucer destroys the saucer and awards points.
  - Ship vs saucer destroys both and awards points.

### 5.4 Collision matrix
Every check below is a circle test using wrapped distance. At these counts a brute-force O(n·m) loop is fine.

| | Asteroid | Saucer | Ship |
|---|---|---|---|
| Player bullet | split + score | kill + score | — |
| Saucer bullet | split | — | kill ship (unless invulnerable) |
| Ship | kill ship + split + score | kill both + score | — |
| Saucer | kill both | — | (above) |

Bullets move at most about 7 u per step, and the smallest radius is 12 u × 0.9, so no swept collision is needed.

### 5.5 Waves and pacing
- The wave ends when no asteroids remain. A saucer may still be alive; it keeps flying.
- **Heartbeat**: two alternating low tones. The interval is `lerp(1.0 s, 0.22 s, 1 - remainingAsteroidMass / waveStartMass)`, where mass is large=4, medium=2, small=1. It plays only while ACTIVE.
- Wave number is shown during WAVE_INTRO.

### 5.6 Scoring and persistence
- Score, best score and wave appear in the HUD.
- The best score is saved to `localStorage["vb.best"]`.
- Settings are saved to `localStorage["vb.settings"]` as JSON.
- Every storage call is wrapped in try/catch, because Safari private mode and sandboxed iframes throw. The game must work with storage unavailable.

---

## 6. Input

All devices feed one `VB.input` object, which the simulation reads each step:

```js
VB.input = {
  rotate: -1..1,         // keyboard/gamepad digital or analog rotation
  aimAngle: null|rad,    // touch joystick target heading (overrides rotate when non-null)
  thrust: bool,
  fire: bool,            // held
  hyperspacePressed: bool, // edge-triggered, consumed by the sim
  pausePressed: bool,      // edge-triggered
  lastDevice: 'keyboard'|'touch'|'gamepad'|'mouse'
}
```

### 6.1 Keyboard (desktop)
Use `event.code` so the bindings work on any keyboard layout.

| Action | Keys |
|---|---|
| Rotate left / right | `ArrowLeft`/`KeyA`, `ArrowRight`/`KeyD` |
| Thrust | `ArrowUp`, `KeyW` |
| Fire | `Space`, `KeyJ` |
| Hyperspace | `ArrowDown`, `KeyS`, `ShiftLeft`, `ShiftRight` |
| Pause | `KeyP`, `Escape` |
| Mute | `KeyM` |

- Call `preventDefault()` on Space and the arrow keys while the canvas or game has focus. This stops page scrolling.
- Ignore `event.repeat` for edge-triggered actions.
- Enter or Space on overlays activates the focused button. Buttons are real `<button>` elements.

### 6.2 Touch (mobile/tablet)
Use Pointer Events on one full-screen `#touch-layer`, with `touch-action: none`. Track each `pointerId` separately and call `setPointerCapture` on `pointerdown`. Handle `pointerup`, `pointercancel` and `lostpointercapture` identically.

**Left half: floating joystick (aim + thrust)**
- A `pointerdown` anywhere in the left 50% of the screen, outside the top HUD strip, places the stick base at the touch point.
- The knob follows the finger, clamped to `R = 64` CSS px.
- Displacement `d` greater than 12 px sets `aimAngle = atan2(dy, dx)`. The ship **rotates toward** `aimAngle` along the shortest arc at 6.0 rad/s. It does not snap, so aiming still takes some skill.
- Displacement `d ≥ 0.7R` sets `thrust = true`. The base ring brightens to show thrust is active.
- On release, `aimAngle = null` and `thrust = false`.

**Right half: fire zone and hyperspace**
- A `pointerdown` anywhere in the right 50% (not on the hyperspace or pause buttons) sets `fire = true` until that pointer lifts. The whole half is the hit target.
- A visual FIRE disc (84 px) sits at the bottom-right as a resting guide for the thumb.
- A HYPER button (56 px) is placed up and left of the FIRE disc. It is edge-triggered and sits on top of the fire zone.
- A PAUSE button (44 px minimum touch target) sits at the top-right inside the safe area.

**Visibility of touch controls**
- Setting `Touch controls: Auto | On | Off`. Auto shows the controls if `matchMedia('(pointer: coarse)')` matches **or** after any `pointerType === 'touch'` event. Auto hides them again after a keyboard or gamepad input.
- The touch layer only receives events in the PLAYING state. Otherwise it has `pointer-events: none`, so the menus stay tappable.

**Haptics**
- If `navigator.vibrate` exists and the setting is on:
  - ship death: 40 ms
  - large asteroid destroyed: 15 ms
  - extra life: [20, 40, 20]
- iOS has no vibrate support. Hide the setting when it's unsupported.

### 6.3 Gamepad (should-have)
Poll `navigator.getGamepads()` each frame. Use the standard mapping:
- Left stick X or D-pad left/right: rotate. Deadzone 0.25.
- A (0): fire.
- RT (7), B (1) or D-pad up: thrust.
- X (2) or Y (3): hyperspace.
- Start (9): pause.

### 6.4 Mobile browser hygiene (`index.html` / `style.css`)
- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`
- `<meta name="theme-color" content="#000000">`, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, and a manifest link.
- Apply `user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;` globally.
- Prevent `contextmenu` on the canvas and touch layer. Prevent `gesturestart` for iOS pinch.
- Buttons use `touch-action: manipulation`, which removes the double-tap zoom delay.
- HUD, pause button and touch controls are offset by `env(safe-area-inset-*)`. The canvas itself runs edge to edge under the notch.
- **Fullscreen button** on the title and pause screens appears only if `document.fullscreenEnabled` (or the webkit-prefixed equivalent) is true. iPhone Safari lacks it, so the button is hidden there.
- **Portrait hint**: when `innerHeight > innerWidth` on a coarse pointer, the title screen shows a dismissible "Landscape recommended" note. The game is still fully playable in portrait.

---

## 7. Audio (`audio.js`)

- Create the `AudioContext` lazily on the **first user gesture** (Play button, first keydown or first pointerdown) and call `resume()`. Call `resume()` again on `visibilitychange` → visible.
- Signal chain: master `GainNode` → destination. Mute sets master gain to 0 with a 30 ms ramp. The M key and a setting toggle mute.
- Pre-generate one 1 s white-noise `AudioBuffer` at unlock and reuse it.
- All sounds are synthesized:

| Sound | Recipe |
|---|---|
| fire | square osc 900→240 Hz exponential over 0.08 s, gain 0.12→0 |
| thrust (loop) | noise → lowpass 400 Hz → gain. Ramp to 0.18 while thrusting, 0 otherwise. Create it once and keep it running. |
| explode L/M/S | noise burst → lowpass (300/700/1400 Hz), decay 0.9/0.5/0.3 s |
| beat 1 / beat 2 | triangle 58 Hz / 52 Hz, 0.09 s, gain 0.35 |
| saucer (loop) | square carrier (large 180 Hz, small 320 Hz) with an 8 Hz LFO on frequency ±40 Hz. Runs only while a saucer exists. |
| hyperspace | sine 200→1200 Hz over 0.25 s |
| extra life | three sine blips at 880, 1175, 1568 Hz, 0.07 s each |
| ship death | noise → lowpass sweep 1200→100 Hz over 1.1 s |

- Allow at most 6 simultaneous one-shot explosions. Drop extras.
- Stop all loops on pause and game over.
- Note for the README/help: iOS silences Web Audio when the hardware silent switch is on.

---

## 8. Rendering (`render.js`)

- **Background** is solid `#000`. Optionally add a very faint static starfield: 80 points, generated once and redrawn each frame.
- **Palette**:
  - vectors `#e8f1ff`
  - thrust flame `#ffb347`
  - saucer bullets `#ff6b5b`
  - invulnerable ship at alpha 0.35 on blink-off frames
- **Batching**: build **one path for all asteroids** and call `stroke()` once. Do the same for bullets, which are small filled squares of 3 CSS px, drawn with `rect` into one path and one `fill()`. Draw ship and saucer as separate paths.
- **Glow**: when the `Glow` setting resolves to on, set `ctx.shadowBlur = 8 * dpr * ppu`-scaled and `shadowColor` to the stroke color before the batched strokes, then reset to 0.
  - Auto resolves to on for `(pointer: fine)` and off for coarse pointers.
  - The Low quality setting forces glow off and `dpr ≤ 1.5`.
- **Particles**: pooled, capped at 250 alive. They are drawn as 2 CSS px squares in one batched fill, with alpha fading over their life. Use a few alpha buckets so the fills can stay batched.
- **Ship death debris**: 5 line segments taken from the ship outline. Each drifts and spins, then fades over 1.4 s.
- **Screen shake**:
  - large asteroid 4 px, ship death 10 px, decaying over 0.3 s
  - disabled when `prefers-reduced-motion: reduce` or the Shake setting is off
- **Debug overlay** (`?debug=1`): FPS, entity counts, and collision circles. Also enables `N` = clear wave and `I` = toggle invulnerability. Useful for testing; keep it out of normal play.

---

## 9. UI and HUD (`ui.js`, DOM)

Menus and HUD are **DOM elements** layered over the canvas. That gives crisp text, accessibility, easy tap targets and no canvas text cost. The font stack is `ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace`, uppercase, `letter-spacing: 0.12em`.

**HUD** (top strip inside safe area):
- Score is top-left and best score is top-center.
- Lives are drawn as small ship glyphs top-right, left of the pause button. Use inline SVG or CSS triangles.
- The wave banner is centered and appears transiently.
- The HUD updates the DOM **only when a value changes**.

**Overlays** (one visible at a time, `role="dialog"`, focus moves to the first button):
- **Title**: game name, Play, Settings, How to Play, Fullscreen (if supported), best score, and the portrait hint (§6.4).
- **How to Play**: shows keyboard or touch instructions based on `lastDevice` / coarse pointer, with a tab to switch between them.
- **Paused**: Resume, Restart, Settings, Fullscreen, Quit to Title.
- **Settings**: Sound on/off, Haptics on/off (hidden if unsupported), Glow Auto/On/Off, Quality High/Low, Screen shake on/off, Touch controls Auto/On/Off. Changes apply immediately and persist.
- **Game Over**: final score, best score, "NEW BEST" badge, wave reached, Play Again (enabled after 1 s), Title.

Minimum touch target is 44×44 CSS px. Menus must fit a 360×640 portrait screen and a 640×360 landscape screen without scrolling. Use `clamp()` font sizes and `max-height: 100dvh` with internal scroll as a fallback.

---

## 10. Performance rules

- No allocations in `step()` or `render()` hot loops. Use pools for bullets and particles, and reuse vectors. Asteroid vertex arrays are allocated once at spawn.
- Remove dead entities with swap-remove (`arr[i] = arr[arr.length-1]; arr.pop()`) rather than `splice` or `filter`.
- Do no DOM reads (layout) in the frame loop. Read sizes only in `applyResize()`.
- Keep the whole game under about 3,000 lines of JS.

---

## 11. Acceptance checklist (the audit checks these)

1. `index.html` opens directly from disk (`file://`) and from a static server. The console shows no errors, and no network requests go beyond the local files.
2. `node --check` passes on every JS file.
3. Desktop: every keyboard binding in §6.1 works. Space and the arrows don't scroll the page. P/Esc pauses. Tab-away pauses. Keys don't stick after alt-tab.
4. Mobile emulation (375×812 portrait and 812×375 landscape): touch controls appear, and the joystick aims and thrusts. The right half fires while the joystick is held (multi-touch). Hyperspace and pause buttons work. Menus fit without scrolling. Nothing is under the notch.
5. The world scales per §3. The ship is ≥ 22 CSS px on a 375 px-wide phone. Resizing or rotating mid-game keeps entities on-screen and doesn't pause.
6. Wraparound works for movement, collisions across edges and ghost rendering.
7. Asteroids split correctly with the §5.2 scores. Waves advance. An extra life is awarded at 10,000.
8. Saucers spawn, shoot, and die per §5.3. The small saucer aims at the ship.
9. Respawn waits for a clear center and grants blinking invulnerability.
10. The tap that starts or restarts a game doesn't fire a bullet. The Play Again button has its 1 s guard.
11. Audio starts only after a gesture, mute works, and loops stop on pause and game over.
12. The best score and settings persist. The game still works if `localStorage` throws.
13. A fixed timestep is used. Speed is identical at 60 Hz and 144 Hz, and there's no spiral after a long tab stall.
14. `prefers-reduced-motion` disables shake.
