# Blame Others

A toy-box driving game about being right. You drive perfectly; everyone else is the problem.

- Other drivers "wrong" you (cut you off, brake-check you, exist near you). Each one raises your **rage**.
- Chase the culprit, get close, and **hold scream** until they have been told. Your lungs run out, so time it.
- Every driver you blame calms you down and makes you **grow** — the driver melts further into the car, and the car takes up more of the road, so more things become someone else's fault.
- Blame 10 drivers and you fill every lane. Let rage hit 100% and you blow a gasket.

## Play

Open `index.html` in a browser (no build step). Controls: `◀ ▶` / `A D` steer, `Space` scream, `▼` / `S` brake, `M` mute. On a phone, use the on-screen buttons.

## Layout

- `index.html` — page, HUD and styles
- `src/game.js` — the whole game (three.js r128, vendored in `vendor/`)
- `tools/build-artifact.js` — bundles everything into one self-contained HTML file

Tuning constants (speeds, chase time, rage numbers, the list of offences and insults) are at the top of `src/game.js`.
