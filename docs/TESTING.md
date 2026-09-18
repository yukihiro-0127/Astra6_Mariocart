# Implementation and verification record

## Step 2 — minimal prototype
Implemented a single 1,309.5 m original circuit, player + one stable CPU, one lap, fixed-step physics, chase camera, countdown, ordered checkpoints, safe recovery, pause and restart. Expansion features remain disabled during the prototype gate.

## Issues found before Step 3 browser gate
| ID | Cause | Correction | Regression result |
|---|---|---|---|
| P01 | Wrong-way detection considered body heading only; reverse motion facing forward was missed. | Dot actual velocity direction with route tangent and multiply by signed speed. | Both reversed heading and reverse gear cases pass. |
| P02 | Idle update with omitted steering let undefined enter heading arithmetic. | Default optional controls to neutral values before physics. | Idle player stays finite and CPU completes independently. |

`npm test`: 10/10 core tests pass. Physical one-lap simulation completes in ~40.4 seconds; stable CPU continues without recovery. These are deterministic simulations, not yet real-browser visual/keyboard validation.

## Step 3 — real browser prototype gate
Chromium 153 / Playwright, 1440×960. `PROTOTYPE=1 npm run test:browser`: **11/11 PASS**, console errors **0**. Real keyboard accelerator/brake/steer, pause, physically simulated complete lap, continuous CPU, checkpoint skip rejection, reverse warning, fall/automatic recovery, R recovery.

Report: `artifacts/prototype-browser-report.json`. Step 2 is retained at `/prototype.html` with two racers / one lap / expansion features disabled.

A screenshot capture timed out on the first browser run after an accelerated synchronous race; the rerun allowed a paused render before capture and all checks completed. No gameplay crash. Headless rendering measured ~14 FPS despite only 71 draw calls, so graphical performance is a Step 4–5 fix target, not accepted as final.

## Step 4 — expansion and fixes
Added three CPU personalities, three laps, charged drifting, all four items, weighted Energy Gates, obstacle avoidance, overtaking, voluntary CPU shortcut selection, jump and original HUD/audio.

| ID | Cause | Correction | Retest |
|---|---|---|---|
| F01 | Nearest-centerline projection oscillated between the overlapping shortcut and main road. Rejected large projection deltas desynchronized race progress and the actual finish line (12.91 m mismatch). | Persist each vehicle's selected surface, enter the branch only by actual physical entry or deliberate CPU choice, explicitly validate local route transitions; reject discontinuous progress without moving its reference. | Full physical main/shortcut continuity and exact finish regression now pass. |
| F02 | Boost acceleration exceeded the correction applied above top speed. | Increase bounded overspeed correction so combined throttle/boost settles at configured maximum. | Pulse and three-lap physics tests pass. |
| F03 | Software WebGL (SwiftShader) rendered high-resolution shadows and every distant city mesh. | Batched matte world geometry, spatial city batches, GPU-aware shadows and adaptive internal pixel density; blob shadows remain. | Software browser improved from ~14 to ~24–29 FPS before GPU verification. |
| T01 | Browser harness still capped simulated race at100 seconds after expansion to3 laps. | Allow220 seconds for final race validation. | This was a test limit, not a race-state defect. |

`npm test`: **21/21 passing** including physically driven shortcut, actual jump/landing, four items, single-use shield, safe teleport across checkpoint/finish, and full three-lap four-racer competition.

GPU probe: Playwright's default headless-shell selected SwiftShader. Full Chromium with ANGLE Metal correctly detects **Apple M4**. Final browser testing uses full Chromium and real GPU, with the software fallback retained for slower machines.

## Step 5 — final browser play and self-assessment

Full Chromium 153 with ANGLE Metal / Apple M4, 1280×800. `node tests/playthrough.mjs` observed the live race state and sent **real Playwright keyboard key-down/up events** to the normal browser input path. No player transforms, checkpoint progress, race-clock advancement or CPU control were injected during this complete race. This is an automated keyboard playthrough and visual inspection, not a human usability study.

- Completed all three laps in **114.35 seconds**, **2nd place**.
- 12 Energy Gate pickups and 12 Shift item uses.
- Lead changed during the race; VEX won, VALE and CINDER were ~24–29 m behind the player at the finish.
- All four racers had **0 recoveries**. CPU branch and item decisions were active.
- GPU frame samples after warm-up: **median60 FPS / minimum60 FPS**. Renderer used native1× pixel scale in the final browser check.
- Browser JavaScript errors: **0**.
- Artifacts: `artifacts/playthrough-report.json`, `artifacts/play-finish.png`, `artifacts/play-lap-1.png` through `play-lap-3.png`.

Final validation after all corrections:

- `npm test`: **22/22 PASS**.
- `npm run test:browser`: **18/18 PASS**, errors0. Includes real W/S/D, Space charge/release boost, Shift activation of all4 items, pause, R, restart button, checkpoint integrity and full race simulation.
- `npm run build`: **PASS** (static output, ~153 KB gzip JS/CSS total).
- UI inspected at1440×900/960 and1280×720/800.
- Additional physical test confirms a human can steer onto the shortcut without an AI-only flag: 0 falls/recoveries, no progress mismatch.
- Screenshot of final entry guidance: `artifacts/shortcut-guide.png`.

| 観点 | 初回 | 修正後 | 評価の根拠 |
|---|---:|---:|---|
| 操作の分かりやすさ |4|4|画面内説明、WASD/矢印、Space/Shift/R/Esc、フォーカス可能な再スタート。キーボード検証通過。|
| 速度感 |4|4|140 km/h前後の通常走行、加速時のFOV変化、控えめなジェット・粒子。|
| コーナリングの気持ちよさ |4|4|低速旋回、速度に応じた感度、実キー操作でチャージ→離してブーストを確認。|
| CPUとの競争性 |4|5|3周で複数の順位変動、1～4位が接近しプレイヤー2位。性格別分岐・アイテム使用を確認。|
| コースの視認性 |3|4|分岐をライム色へ変更、CUT-THROUGH看板、分岐に重なる視覚的ガードレールを開口。入口画像と実走判定を再確認。|
| アイテムの公平性 |4|4|順位補正は確率のみ。全順位で全アイテム入手可能。1枠、ゲート待機時間、1回防御、安全な転移を検証。|
| 処理の安定性 |2|4|ソフトウェア描画向け最適化とGPUブラウザ選択を修正。実GPUで3周60 FPS、コンソールエラー0。|

Scores are a developer self-assessment from this test run. Broader human feedback and different GPUs/browsers remain useful follow-up work;60 FPS is measured on this machine, not a guarantee for every environment.

### Final test-harness correction
T02: A fixed90 ms wait after releasing Space could read the state before the next rendered physics frame following screenshots/accelerated simulation. An isolated keyboard reproduction confirmed the game released drift normally. The regression now waits for the actual boost transition (3-second timeout), and all18 browser checks pass.
