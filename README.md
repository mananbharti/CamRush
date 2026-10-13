# CamRush

Camera-controlled arcade for Tech Utsav. Seventeen games, all played with your hands, face or head - no controller.

| Game | Control |
|---|---|
| Fruit Slash | Index fingertip slices fruit (golden / freeze / frenzy fruit, combos, bombs) |
| Sky Flap | Hand height steers the bird through the pipes |
| Bubble Burst | Pop bubbles with any fingertip, both hands; gold = mega burst |
| Face Chomp | Move your head, open your mouth to eat food, avoid bombs |
| Lean Rush | Lean your head to steer a neon highway |
| Rock Paper Scissors | Show fist / flat hand / two fingers on SHOOT |
| Mole Smash | Whack moles with your fingers; gold = x3, bombs cost time |
| Neon Pong | Palm height is the paddle, beat the AI |
| Brick Breaker | Palm left/right moves the paddle; power-ups, multi-level |
| Star Blaster | Hand flies the ship, pinch = nova bomb |
| Target Blitz | Point to aim, pinch to fire |
| Neon Beats | Rhythm game: touch the notes at the line |
| Goal Rush | Keeper mode: block every shot with both hands; gold balls score triple |
| Snake Surge | Steer the snake with your fingertip, eat orbs, never bite your tail |
| Tower Stack | Pinch (or click / Space) to drop the sliding block and build a tall tower |
| Sky Juggle | Bat balloons back up with your palms; three misses ends the game |
| Meteor Dodge | Fly your ship with your palm through a meteor storm, grab stars |

## Setup (one time, needs internet)

1. Install the current Node.js LTS from https://nodejs.org. Required: Node **20.19+ or 22.12+** (Vite 8). Check with `node -v`. An older Node makes `npm install` stop with an error.
2. In this folder run `npm install`. This also downloads the hand and face models (about 11 MB) and copies the MediaPipe wasm. Every file is verified by size and SHA-256. If a download fails or is corrupt, setup stops with an error instead of continuing.
3. Run `npm run check` any time. It works offline and says whether all assets are present and valid.

## Run the demo (works fully offline after setup)

`npm start` (or double-click `start.bat`), then open http://localhost:4173 in Chrome, click **Start with camera**, press **F** for fullscreen. `npm start` refuses to start if any asset is missing.

No camera? Use "Play with mouse". Keys: Esc = menu, F = fullscreen, M = mute, Arrow keys / Prev-Next = menu pages, Q = graphics quality (HQ/LQ). The app switches to LQ by itself if it stays under about 40 fps.

Performance notes: the camera runs at 640x480 / 30 fps, hand tracking automatically runs on every 2nd or 3rd frame when the laptop is slow, and LQ removes glow, bloom and blur effects.

Tips: good front light, camera at face height, stand ~1m back.

## Offline smoke test (do this before the event)

The booth Wi-Fi may be bad, so prove it works with no network:

1. Finish the setup above while online, then run `npm run check` (must print "assets ready").
2. Turn Wi-Fi off (and unplug ethernet). Close Chrome fully.
3. Run `npm start`, open http://localhost:4173 in Chrome.
4. Click **Start with camera**. The splash must reach the menu with no errors.
5. Play at least one hand game (e.g. Fruit Slash) and one face game (Face Chomp or Lean Rush). Confirm your hand and face are tracked.
6. If anything fails, reconnect, run `npm run setup`, and repeat.

## Stack
Vanilla JS + Canvas 2D, Vite, MediaPipe Tasks Vision (hand + face landmarker, GPU with CPU fallback), WebAudio synth sound (no audio files).

## Credits
Fruit Slash mechanics (combo multiplier, golden/frozen/frenzy fruit, difficulty ramp) adapted from
[handsomeZR-netizen/webcam-fruit-ninja](https://github.com/handsomeZR-netizen/webcam-fruit-ninja) (MIT). Hand/face models by Google MediaPipe (Apache-2.0).
