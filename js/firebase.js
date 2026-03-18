import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getDatabase,
  get,
  onValue,
  ref,
  set,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { makeRoomState } from "./state.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQgJwIIyF78P-m9ja9dxIJM2G6SQZ2Xtc",
  authDomain: "random-swap-coop.firebaseapp.com",
  databaseURL: "https://random-swap-coop-default-rtdb.firebaseio.com/",
  projectId: "random-swap-coop",
  appId: "1:956366081031:web:4ac3ef4a6f7d97577beea2",
};

function hasConfig() {
  return Object.values(firebaseConfig).every((v) => v && v !== "REPLACE_ME");
}

let db = null;
let auth = null;
let authUid = null;
export function firebaseReady() {
  return hasConfig();
}

export function initFirebase() {
  if (!hasConfig()) return null;
  if (db && auth) return { db, auth };
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);
  return { db, auth };
}

export function makeRoomCode() {
  return Math.random().toString(36).slice(2, 10);
}

export async function ensureSignedIn() {
  initFirebase();
  if (auth.currentUser?.uid) {
    authUid = auth.currentUser.uid;
    return authUid;
  }
  await signInAnonymously(auth);
  authUid = auth.currentUser?.uid || null;
  return authUid;
}

export async function getAuthUid() {
  if (authUid) return authUid;
  return ensureSignedIn();
}

export function onAuthReady(callback) {
  initFirebase();
  return onAuthStateChanged(auth, (user) => {
    authUid = user?.uid || null;
    callback(authUid);
  });
}

export async function createRoom(roomId, hostPlayerId) {
  const uid = hostPlayerId || (await getAuthUid());
  const database = initFirebase().db;
  const roomRef = ref(database, `rooms/${roomId}`);
  await set(roomRef, makeRoomState(uid, null, Date.now()));
}

export async function joinRoom(roomId, playerId) {
  const uid = playerId || (await getAuthUid());
  const database = initFirebase().db;
  const roomRef = ref(database, `rooms/${roomId}`);
  const snap = await get(roomRef);
  if (!snap.exists()) throw new Error("Room not found.");
  const room = snap.val();
  const players = room.players || {};
  const playerIds = Object.keys(players);
  if (!players[uid] && playerIds.length >= 2) {
    throw new Error("Room is full.");
  }
  const existing = players[uid];
  await update(ref(database, `rooms/${roomId}/players/${uid}`), {
    connected: true,
    updatedAt: Date.now(),
    displayName: existing?.displayName || `Player ${Math.min(playerIds.length + 1, 2)}`,
  });
}

export function subscribeRoom(roomId, onChange) {
  const database = initFirebase().db;
  const roomRef = ref(database, `rooms/${roomId}`);
  return onValue(roomRef, (snap) => onChange(snap.val()));
}

export async function pushInput(roomId, playerId, input) {
  const uid = playerId || (await getAuthUid());
  const database = initFirebase().db;
  await update(ref(database, `rooms/${roomId}/inputs/${uid}`), {
    x: input.x,
    y: input.y,
    actionPressed: input.actionPressed,
    updatedAt: Date.now(),
  });
}

export async function pushHostState(roomId, state) {
  const database = initFirebase().db;
  const base = `rooms/${roomId}`;
  await update(ref(database, base), {
    match: state.match,
    roles: state.roles,
    swap: state.swap,
    entities: state.entities,
    events: state.events,
  });
}
