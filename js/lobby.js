import {
  createRoom,
  ensureSignedIn,
  firebaseReady,
  getAuthUid,
  initFirebase,
  joinRoom,
  makeRoomCode,
} from "./firebase.js?v=20260319-2";

const statusEl = document.getElementById("status");
const roomInput = document.getElementById("roomCodeInput");
const createBtn = document.getElementById("createRoomBtn");
const joinBtn = document.getElementById("joinRoomBtn");
const createdRoomPanel = document.getElementById("createdRoomPanel");
const createdRoomCode = document.getElementById("createdRoomCode");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const enterRoomBtn = document.getElementById("enterRoomBtn");

let pendingRoomCode = null;
let roomLocked = false;

function status(msg) {
  if (statusEl) statusEl.textContent = msg;
}

function goToGame(roomCode) {
  window.location.href = `./game.html?room=${roomCode}`;
}

function setRoomLocked(locked) {
  roomLocked = locked;
  if (!createBtn) return;
  if (locked) {
    createBtn.textContent = "Reset Room";
    createBtn.classList.remove("primary");
  } else {
    createBtn.textContent = "Create Room";
    createBtn.classList.add("primary");
  }
}

if (!firebaseReady()) {
  status("Firebase config missing. Fill js/firebase.js first.");
} else {
  initFirebase();
  ensureSignedIn().then(() => status("Ready."));
}

if (!createBtn || !joinBtn || !roomInput) {
  throw new Error("Lobby UI elements are missing from index.html.");
}

createBtn.addEventListener("click", async () => {
  if (roomLocked) {
    pendingRoomCode = null;
    if (createdRoomPanel) createdRoomPanel.classList.add("hidden");
    setRoomLocked(false);
    status("Room reset. You can create a new room.");
    return;
  }
  try {
    const playerId = await getAuthUid();
    const roomCode = makeRoomCode();
    await createRoom(roomCode, playerId);
    pendingRoomCode = roomCode;
    setRoomLocked(true);
    if (createdRoomCode && createdRoomPanel) {
      createdRoomCode.textContent = roomCode.toUpperCase();
      createdRoomPanel.classList.remove("hidden");
      status(`Room ${roomCode} created. Share code/link, then click Enter Room.`);
    } else {
      status(`Room ${roomCode} created.`);
      goToGame(roomCode);
    }
  } catch (err) {
    status(`Create failed: ${err.message}`);
  }
});

joinBtn.addEventListener("click", async () => {
  const roomCode = roomInput.value.trim().toLowerCase();
  if (!roomCode) {
    status("Enter room code.");
    return;
  }
  try {
    const playerId = await getAuthUid();
    await joinRoom(roomCode, playerId);
    status(`Joined ${roomCode}.`);
    goToGame(roomCode);
  } catch (err) {
    status(`Join failed: ${err.message}`);
  }
});

if (copyCodeBtn) {
  copyCodeBtn.addEventListener("click", async () => {
    if (!pendingRoomCode) return;
    await navigator.clipboard.writeText(pendingRoomCode);
    status("Room code copied.");
  });
}

if (copyLinkBtn) {
  copyLinkBtn.addEventListener("click", async () => {
    if (!pendingRoomCode) return;
    const inviteUrl = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, "")}game.html?room=${pendingRoomCode}`;
    await navigator.clipboard.writeText(inviteUrl);
    status("Invite link copied.");
  });
}

if (enterRoomBtn) {
  enterRoomBtn.addEventListener("click", () => {
    if (!pendingRoomCode) {
      status("Create a room first.");
      return;
    }
    goToGame(pendingRoomCode);
  });
}
