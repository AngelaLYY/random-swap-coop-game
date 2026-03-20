# Random Swap Co-op Game

Two-player browser game for phones/laptops where one player runs, one chases, and roles swap at random times.

## Features

- Real-time 2-player room play (share code/link)
- Runner vs Chaser asymmetric roles
- Random role swaps with on-screen + voice cues
- Cute role-colored dots with growth/shrink mechanics
- Mobile joystick controls
- Match result overlay with replay flow

## Tech stack

- Vanilla HTML/CSS/JS
- Canvas 2D
- Firebase Realtime Database + Anonymous Auth
- GitHub Pages static hosting

## Project structure

- `index.html` - Create / join room flow
- `game.html` - Gameplay screen
- `css/styles.css` - UI and responsive styles
- `js/*.js` - Game loop, render, input, audio, Firebase sync
- `assets/audio/*` - Optional custom audio files

## Quick start (local)

1. Configure Firebase in `js/firebase.js`.
2. Serve this folder:

```bash
python3 -m http.server 5173
```

3. Open `http://localhost:5173/index.html`.
4. Create a room on one device/browser, join from another.

## Firebase setup

1. Create a Firebase project.
2. Add a Web app and copy config values.
3. Enable:
   - Realtime Database
   - Anonymous Authentication
4. Paste config into `js/firebase.js`.
5. Publish your Realtime Database rules.

Note: frontend Firebase config values are public in web apps; protect access with strict database rules.

## Optional audio assets

Drop these files in `assets/audio/`:

- `run-voice.mp3` (used for `RUN!`; if missing, browser speech says “RUN”)
- `bgm.mp3` (looping background music)

**Chaser cue** always uses the browser’s **read aloud** (`speechSynthesis`) for “CHASE” — no `chase-voice.mp3` file.

If other clips are missing, the game falls back to speech / generated SFX where applicable.

## Gameplay rules

- Up to 3 rounds per match
- Runner objective: collect role runner dots
- Chaser objective: tag runner
- Role swaps occur at random intervals
- Final result screen appears when match ends

## Deploy to GitHub Pages

1. Push repository to GitHub.
2. In repo settings, open **Pages**.
3. Set source to branch `main` and folder `/ (root)`.
4. Save and wait for publish.

Your game URL will be:

`https://<your-username>.github.io/random-swap-coop-game/`

## Custom domain notes

- GitHub Pages default subdomain is free (`github.io`).
- A true `.io` domain is usually paid, not free.
- If you get a custom domain, add it in GitHub Pages settings and create a `CNAME` record at your DNS provider.
