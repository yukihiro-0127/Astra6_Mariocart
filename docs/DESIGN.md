# AEROFORGE — design / Step 1

Original desktop browser arcade hover-kart game. Track: Skyline Foundry Circuit.
All vehicles, geometry, city structures, UI graphics and synthesized sounds are created in source. No external artwork, models, fonts, music, game assets, paid APIs or publishing.

## Acceptance
One human and three distinct CPU racers complete three validated laps. Keyboard acceleration, braking/reversing, steering, drift and charged release boost; four original items; safe Vector Swap; narrow shortcut; jump; elevated unguarded segment; collisions, off-road slowing, fall recovery; rank/lap/speed/item/minimap/countdown/results/pause/restart; debug display.

## Flow
Hangar / grid → countdown → race ↔ pause → result → restart. Physics fixed at 60 Hz, render requestAnimationFrame with delta clamp. Ordered checkpoints plus directional finish crossing prevent skipped laps. Recovery goes to last validated safe progress.

## Technology and rationale
Three.js: efficient WebGL scene/camera/material/mesh rendering. Vite: local dev server and static production build. Native JS modules: minimal runtime dependencies. Web Audio: synthesized original sound. Node test + Playwright: progress invariants, physics and real-browser keyboard/render tests. Dependencies are free, pinned by package-lock.

## Files
src/config.js tuning; src/track.js route/projection; src/physics.js controls/collisions/recovery; src/ai.js decisions; src/items.js inventory/effects; src/game.js race/checkpoints/state; src/renderer.js original world and vehicles; src/ui.js and style.css HUD/menu; src/audio.js sound; src/main.js lifecycle/input; tests/ meaningful state/browser regression; docs/ test and bug records.

## Implementation gates
1. Design and interface contracts.
2. Prototype: single track, one player, one CPU, one lap, basic world and keyboard.
3. Run prototype in Chromium; test accel/brake/steer/lap/checkpoint skip/wrong way/recovery/CPU progress/console. Record fixes before expansion.
4. Add CPU personalities, three laps, ranking, drifting, four items, shortcut, polished world/HUD.
5. Play final version, measure performance and evaluate seven requested categories. Fix any rating ≤3 and retest.

## Main risks
Lap cheating: ordered checkpoints and bounded local progress. CPU deadlocks: lookahead steering, obstacle/overtake lane selection, timed safe recovery. Falling: freeze progress while airborne off deck, respawn at validated point. Performance: shared mesh materials/geometries, instanced city, capped pixel ratio, no heavy postprocessing. Rubber band: bounded ±6–8% speed adjustment only, no teleport catch-up.
