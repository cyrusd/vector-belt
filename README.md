# Vector Belt

A browser game in the spirit of the arcade classic *Asteroids*. It plays on desktop with a keyboard or gamepad, and on phones and tablets with touch controls.

It has no build step and no dependencies. The graphics are drawn with Canvas 2D, and every sound is generated with Web Audio.

## Play locally

Open `index.html` in a browser. Or serve the folder with any static server:

```bash
python -m http.server 8765
```

Then visit http://localhost:8765. Add `?debug=1` to the URL to see hitboxes and the frame rate. In debug mode, `N` clears the current wave and `I` toggles invulnerability.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Rotate | ← → or A D | Left-side joystick (aim) |
| Thrust | ↑ or W | Push the joystick past ~70% |
| Fire | Space or J | Hold anywhere on the right half |
| Hyperspace | ↓, S or Shift | HYPER button |
| Pause | P or Esc | Pause button (top right) |
| Mute | M | Settings |

A standard gamepad also works: left stick to rotate, A to fire, RT or B to thrust, X or Y for hyperspace, and Start to pause.

## Publish with GitHub Pages

1. Push this repository to GitHub.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**. Select `main` and the `/ (root)` folder.
4. The game will be live at `https://<your-user>.github.io/<repo-name>/` within a minute or two.

## Project layout

```
index.html            markup: canvas, HUD, overlays, touch layer
style.css             layout, safe areas, overlays, touch-control visuals
manifest.webmanifest  basic web app manifest
js/config.js          every tunable number (speeds, scores, timings)
js/util.js            vector/wrap math, RNG, object pool
js/storage.js         localStorage wrapper for settings and best score
js/audio.js           Web Audio synthesizer
js/input.js           keyboard, touch and gamepad → one input state
js/entities.js        ship, asteroids, bullets, saucers, particles
js/world.js           world sizing, waves, collisions, scoring
js/render.js          canvas drawing, glow, screen shake
js/ui.js              menus, HUD, touch-control visuals
js/main.js            state machine and fixed-timestep loop
DESIGN.md             the full design spec
```

To tune the game's feel, start with `js/config.js`.
