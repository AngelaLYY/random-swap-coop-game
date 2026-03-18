# Random Swap Co-op Game

Two-player browser game for phones/laptops where one player runs, one chases, and roles swap at random intervals.

## Stack

- Vanilla HTML/CSS/JS
- Canvas 2D
- Firebase Realtime Database (for room sync)
- Static hosting via GitHub Pages

## Firebase setup guide (step-by-step)

### 1) Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Create a project**.
3. Give it a name (example: `random-swap-coop`), continue, and finish setup.

### 2) Register a Web app

1. Inside the Firebase project, click **Add app** and choose the **Web** icon (`</>`).
2. Enter an app nickname (example: `random-swap-web`).
3. Do not enable Firebase Hosting here (GitHub Pages is used for this project).
4. Finish and copy the config values shown by Firebase.

### 3) Enable Realtime Database

1. In left menu, open **Build > Realtime Database**.
2. Click **Create Database**.
3. Choose a location close to your users.
4. For quick testing, start in test mode (you will tighten rules later).

### 4) Paste config into this project

Open `js/firebase.js` and replace all `REPLACE_ME` fields in:

```js
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  databaseURL: "REPLACE_ME",
  projectId: "REPLACE_ME",
  appId: "REPLACE_ME",
};
```

Use the corresponding values from Firebase:

- `apiKey` -> `apiKey`
- `authDomain` -> `authDomain`
- `databaseURL` -> `databaseURL` (must be your Realtime DB URL)
- `projectId` -> `projectId`
- `appId` -> `appId`

### 5) Set Realtime Database rules (development)

In **Realtime Database > Rules**, paste:

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

Publish rules.

## Optional audio assets

The game now supports optional voice/BGM files:

- `assets/audio/run-voice.mp3` (played on swap when role becomes Runner)
- `assets/audio/bgm.mp3` (looping background music)

If these files are missing:

- `RUN!` falls back to browser speech synthesis
- `CHASE!` uses speech synthesis by default
- generated beep SFX still work for collect/tag/swap

### 6) Run locally and verify

1. Start a local server in this folder:

```bash
python3 -m http.server 5173
```

2. Open `http://localhost:5173/index.html`.
3. Click **Create Room** in one browser/device.
4. Join using the same room code on another browser/device.
5. Verify both clients can move and see synced gameplay.

If you still see `Firebase config missing`, re-check `js/firebase.js` for any remaining `REPLACE_ME`.

## Local setup (quick recap)

1. Complete Firebase setup above.
2. Serve the folder locally.
3. Open `index.html` and test with two devices/tabs.

Example quick server:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173/index.html`.

## Firebase rules notes

The rule block above is only for development and public demos. For production, tighten access so users can only read/write their own room paths and add expiration/cleanup logic for old rooms.

```json
{
  "rules": {
    "rooms": {
      ".read": true,
      ".write": true
    }
  }
}
```

## Deploy to GitHub Pages

1. Create a new GitHub repo and push this folder.
2. In repo settings, enable GitHub Pages and choose branch/folder.
3. Open deployed URL and share room code/link with partner.

## Gameplay defaults

- Best of 3 rounds
- Runner wins round by collecting 5 orbs
- Chaser wins round by 2 tags
- Random role swap every 10-20s
- Fairness guards:
  - 1.2s pre-swap cue
  - 8s minimum cooldown between swaps
  - 1s post-swap protection
