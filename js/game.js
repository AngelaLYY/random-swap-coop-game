import { stepGame } from "./engine.js";
import {
  ensureSignedIn,
  firebaseReady,
  getAuthUid,
  initFirebase,
  joinRoom,
  pushHostState,
  pushInput,
  subscribeRoom,
} from "./firebase.js";
import { createInputController } from "./input.js";
import { createAudioManager } from "./audio.js";
import { drawGame } from "./render.js";
import { ORB_TARGET, TAG_TARGET, resetRoundState } from "./state.js";

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
let playerId = null;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const rolePill = document.getElementById("rolePill");
const roundInfo = document.getElementById("roundInfo");
const timerInfo = document.getElementById("timerInfo");
const scoreInfo = document.getElementById("scoreInfo");
const progressInfo = document.getElementById("progressInfo");
const swapCue = document.getElementById("swapCue");
const statusLine = document.getElementById("statusLine");
const roleFlash = document.getElementById("roleFlash");
const audioToggle = document.getElementById("audioToggle");
const resultOverlay = document.getElementById("resultOverlay");
const resultTitle = document.getElementById("resultTitle");
const resultSubtitle = document.getElementById("resultSubtitle");
const resultScore = document.getElementById("resultScore");
const playAgainBtn = document.getElementById("playAgainBtn");
const backLobbyBtn = document.getElementById("backLobbyBtn");
let lastIsRunner = null;
let roleFlashTimeout = null;
let lastTagCount = 0;
let lastCollectCount = 0;
let resultShown = false;
let resultRoomId = null;

if (!roomId) {
  statusLine.textContent = "Missing room.";
  throw new Error("Missing room query parameter.");
}
if (!firebaseReady()) {
  statusLine.textContent = "Firebase config missing in js/firebase.js";
  throw new Error("Firebase not configured.");
}
initFirebase();
await ensureSignedIn();
playerId = await getAuthUid();
await joinRoom(roomId, playerId);

const inputCtrl = createInputController();
const audio = createAudioManager();
let roomState = null;
let lastLocalPush = 0;
let lastHostStep = performance.now();
let lastHostPush = 0;
let syncError = "";

const unsub = subscribeRoom(roomId, (state) => {
  roomState = state;
});
window.addEventListener("beforeunload", () => unsub());

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

if (audioToggle) {
  audioToggle.addEventListener("click", () => {
    const next = !audio.isEnabled();
    audio.setEnabled(next);
    audioToggle.textContent = `Sound: ${next ? "On" : "Off"}`;
  });
}

if (backLobbyBtn) {
  backLobbyBtn.addEventListener("click", () => {
    window.location.href = "./index.html";
  });
}

if (playAgainBtn) {
  playAgainBtn.addEventListener("click", async () => {
    if (!roomState || roomState.hostId !== playerId) return;
    const ids = Object.keys(roomState.players || {});
    const next = structuredClone(roomState);
    next.match.started = false;
    next.match.round = 1;
    next.match.totalRounds = 3;
    next.match.roundsWon = {};
    next.match.winnerId = null;
    next.match.matchWinnerId = null;
    next.match.finishedAt = 0;
    next.roles.runnerId = next.hostId;
    next.roles.chaserId = ids.find((id) => id !== next.hostId) || null;
    resetRoundState(next, Date.now());
    next.events = next.events || {};
    next.events.message = "New match!";
    await pushHostState(roomId, next);
  });
}

function updateHud(now) {
  if (!roomState) return;
  const roles = roomState.roles || {};
  const match = roomState.match || {};
  const swap = roomState.swap || {};
  const roundsWon = match.roundsWon || {};
  const isRunner = roles.runnerId === playerId;
  if (lastIsRunner === null) {
    lastIsRunner = isRunner;
  } else if (lastIsRunner !== isRunner && roleFlash) {
    roleFlash.textContent = isRunner ? "RUN!" : "CHASE!";
    roleFlash.classList.remove("hidden", "run", "chase");
    roleFlash.classList.add(isRunner ? "run" : "chase");
    if (roleFlashTimeout) clearTimeout(roleFlashTimeout);
    roleFlashTimeout = setTimeout(() => {
      roleFlash.classList.add("hidden");
    }, 1100);
    audio.onRoleSwap(isRunner);
    lastIsRunner = isRunner;
  }
  rolePill.textContent = `Role: ${isRunner ? "Runner" : "Chaser"}`;
  rolePill.classList.toggle("runner", isRunner);
  rolePill.classList.toggle("chaser", !isRunner);
  const round = match.round || 1;
  const totalRounds = match.totalRounds || 3;
  const roundEndsAt = match.roundEndsAt || now;
  roundInfo.textContent = `Round ${round}/${totalRounds}`;
  timerInfo.textContent = `${Math.max(0, Math.ceil((roundEndsAt - now) / 1000))}s`;
  const ids = Object.keys(roomState.players || {});
  const myWins = playerId ? (roundsWon[playerId] || 0) : 0;
  const oppId = ids.find((id) => id !== playerId);
  const oppWins = oppId ? (roundsWon[oppId] || 0) : 0;
  scoreInfo.textContent = `You ${myWins} - Opp ${oppWins}`;
  swapCue.classList.toggle("hidden", !swap.cueActive);
  const collectCount = roomState.entities?.runnerCollected || 0;
  const tagCount = roomState.entities?.tags || 0;
  if (progressInfo) {
    progressInfo.textContent = `Runner dots ${collectCount}/${ORB_TARGET} | Tags ${tagCount}/${TAG_TARGET}`;
  }
  const localChar = roomState.entities?.chars?.[playerId];
  if (localChar) {
    audio.setBgmFromSpeedBonus(localChar.speedBonus || 0);
  }
  if (collectCount > lastCollectCount) {
    audio.onCollect();
  }
  if (tagCount > lastTagCount) {
    audio.onTag();
  }
  lastCollectCount = collectCount;
  lastTagCount = tagCount;
  const playerCount = Object.keys(roomState.players || {}).length;
  const hasWinnerInCurrentPlayers = Boolean(match.matchWinnerId) && ids.includes(match.matchWinnerId);
  const winnerWins = hasWinnerInCurrentPlayers ? (roundsWon[match.matchWinnerId] || 0) : 0;
  const finishedAt = Number(match.finishedAt || 0);
  const totalWins = myWins + oppWins;
  const hasValidFinishedMatch =
    Boolean(match.matchWinnerId) &&
    hasWinnerInCurrentPlayers &&
    winnerWins > 0 &&
    finishedAt > 0 &&
    totalWins > 0 &&
    playerCount >= 2 &&
    (myWins >= 2 || oppWins >= 2 || (match.round || 1) >= (match.totalRounds || 3));
  if (syncError) {
    statusLine.textContent = `Sync error: ${syncError}`;
  } else if (playerCount < 2) {
    statusLine.textContent = "Waiting for second player to join...";
  } else if (hasValidFinishedMatch) {
    const youWon = match.matchWinnerId === playerId;
    statusLine.textContent = youWon ? "Match finished - You win!" : "Match finished - Opponent wins!";
    if (!resultShown && resultOverlay && resultTitle && resultSubtitle && resultScore) {
      const myWinsFinal = playerId ? (roundsWon[playerId] || 0) : 0;
      const oppWinsFinal = oppId ? (roundsWon[oppId] || 0) : 0;
      resultTitle.textContent = "Match Finished";
      resultSubtitle.textContent = youWon ? "You win!" : "Opponent wins!";
      resultScore.textContent = `You ${myWinsFinal} - Opp ${oppWinsFinal}`;
      resultOverlay.classList.remove("hidden");
      if (playAgainBtn) {
        const isHost = roomState.hostId === playerId;
        playAgainBtn.disabled = !isHost;
        playAgainBtn.textContent = isHost ? "Play Again" : "Wait for host to restart";
      }
      resultShown = true;
      resultRoomId = roomId;
    }
  } else {
    if (resultShown && resultOverlay) {
      resultOverlay.classList.add("hidden");
      resultShown = false;
      resultRoomId = null;
    }
    statusLine.textContent = roomState.events?.message || "Live";
  }

  // Safety: never keep stale overlay when room changes or state no longer qualifies.
  if (resultShown && resultRoomId !== roomId && resultOverlay) {
    resultOverlay.classList.add("hidden");
    resultShown = false;
    resultRoomId = null;
  }
}

async function tick(now) {
  requestAnimationFrame(tick);
  try {
    if (!roomState || !playerId) return;

    const localInput = inputCtrl.get();
    if (now - lastLocalPush > 60) {
      lastLocalPush = now;
      try {
        await pushInput(roomId, playerId, localInput);
        syncError = "";
      } catch (err) {
        syncError = err?.message || "input write failed";
      }
    }

    if (roomState.hostId === playerId) {
      const dt = Math.max(8, Math.min(40, now - lastHostStep));
      lastHostStep = now;
      const next = structuredClone(roomState);
      stepGame(next, Date.now(), dt);
      if (now - lastHostPush > 80) {
        lastHostPush = now;
        try {
          await pushHostState(roomId, next);
          syncError = "";
        } catch (err) {
          syncError = err?.message || "host state write failed";
        }
      }
    }

    updateHud(Date.now());
    drawGame(ctx, canvas, roomState, playerId);
  } catch (err) {
    syncError = err?.message || "tick failed";
    if (statusLine) statusLine.textContent = `Runtime error: ${syncError}`;
  }
}
requestAnimationFrame(tick);
