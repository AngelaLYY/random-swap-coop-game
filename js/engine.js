import {
  ORB_TARGET,
  ROUND_MS,
  SWAP_COOLDOWN_MS,
  SWAP_CUE_MS,
  SWAP_PROTECT_MS,
  TAG_TARGET,
  WORLD_H,
  WORLD_W,
  nextSwapTime,
  resetRoundState,
} from "./state.js?v=20260319-2";

const BASE_SPEED = 530;
const RUNNER_MULT = 1.0;
const CHASER_MULT = 1.14;
const ORB_RADIUS = 18;
const CHAR_RADIUS = 20;
const TAG_DISTANCE = 34;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function normalize(vec) {
  const m = Math.hypot(vec.x, vec.y);
  if (m === 0) return { x: 0, y: 0 };
  return { x: vec.x / m, y: vec.y / m };
}

function ensureCharsForPlayers(state) {
  state.roles = state.roles || { runnerId: null, chaserId: null };
  state.match = state.match || {};
  state.match.round = state.match.round || 1;
  state.match.totalRounds = state.match.totalRounds || 3;
  state.match.roundsWon = state.match.roundsWon || {};
  state.match.roundEndsAt = state.match.roundEndsAt || nowMs();
  state.match.winnerId = state.match.winnerId ?? null;
  state.match.matchWinnerId = state.match.matchWinnerId ?? null;
  state.match.finishedAt = state.match.finishedAt || 0;
  const totalWins = Object.values(state.match.roundsWon).reduce((sum, v) => sum + (Number(v) || 0), 0);
  // Defensive cleanup: avoid stale winner state with no recorded wins.
  if (state.match.matchWinnerId && totalWins === 0) {
    state.match.winnerId = null;
    state.match.matchWinnerId = null;
    state.match.finishedAt = 0;
    state.match.started = false;
    state.match.round = 1;
    state.match.totalRounds = 3;
  }
  state.events = state.events || { lastTagAt: 0, message: "Live" };
  state.swap = state.swap || {};
  state.swap.lastSwapAt = state.swap.lastSwapAt || 0;
  state.swap.nextSwapAt = state.swap.nextSwapAt || nowMs() + 12000;
  state.swap.cueAt = state.swap.cueAt || state.swap.nextSwapAt - SWAP_CUE_MS;
  state.swap.cueActive = Boolean(state.swap.cueActive);
  state.swap.protectUntil = state.swap.protectUntil || 0;
  state.entities = state.entities || {};
  state.entities.chars = state.entities.chars || {};
  state.entities.orbs = state.entities.orbs || [];
  state.entities.runnerCollected = state.entities.runnerCollected || 0;
  state.entities.tags = state.entities.tags || 0;
  const ids = Object.keys(state.players || {});
  for (const id of ids) {
    if (!state.entities.chars[id]) {
      state.entities.chars[id] = {
        x: WORLD_W / 2,
        y: WORLD_H / 2,
        vx: 0,
        vy: 0,
        burstUntil: 0,
        pulseUntil: 0,
        nextActionAt: 0,
        sizeScale: 1,
        speedBonus: 0,
      };
    }
    state.entities.chars[id].sizeScale = state.entities.chars[id].sizeScale || 1;
    state.entities.chars[id].speedBonus = state.entities.chars[id].speedBonus || 0;
  }
}

function nowMs() {
  return Date.now();
}

export function canStartMatch(state) {
  return Object.keys(state.players || {}).length >= 2 && state.roles.runnerId && state.roles.chaserId;
}

/** Everyone in the room has dismissed the display guide (Firebase flag per player). */
export function allPlayersDisplayGuideAcked(state) {
  const ids = Object.keys(state.players || {});
  if (ids.length < 2) return false;
  return ids.every((id) => state.players[id]?.displayGuideAck === true);
}

export function ensureRoles(state) {
  const ids = Object.keys(state.players || {});
  if (ids.length < 2) return;
  if (!state.roles.runnerId || !ids.includes(state.roles.runnerId)) state.roles.runnerId = ids[0];
  if (!state.roles.chaserId || !ids.includes(state.roles.chaserId) || state.roles.chaserId === state.roles.runnerId) {
    state.roles.chaserId = ids.find((id) => id !== state.roles.runnerId) || null;
  }
}

function tryRoleSwap(state, now) {
  if (!state.roles.runnerId || !state.roles.chaserId) return;
  if (now - state.swap.lastSwapAt < SWAP_COOLDOWN_MS) return;
  const currentRunner = state.roles.runnerId;
  state.roles.runnerId = state.roles.chaserId;
  state.roles.chaserId = currentRunner;
  state.swap.lastSwapAt = now;
  state.swap.nextSwapAt = nextSwapTime(now);
  state.swap.cueAt = state.swap.nextSwapAt - SWAP_CUE_MS;
  state.swap.cueActive = false;
  state.swap.protectUntil = now + SWAP_PROTECT_MS;
  state.events.message = "Roles swapped!";
}

function simulateMovement(state, dtMs, now) {
  const inputs = state.inputs || {};
  Object.entries(state.entities.chars).forEach(([id, char]) => {
    const input = inputs[id] || { x: 0, y: 0 };
    const rawX = Number(input.x) || 0;
    const rawY = Number(input.y) || 0;
    // Joystick sends |v| in [0,1]; keys send ±1. Scale speed by magnitude so slight stick
    // moves aren’t instantly full sprint (previously only direction was used).
    const mag = Math.min(1, Math.hypot(rawX, rawY));
    const dir = normalize({ x: rawX, y: rawY });
    const isRunner = state.roles.runnerId === id;
    let speed = BASE_SPEED * (isRunner ? RUNNER_MULT : CHASER_MULT);
    speed *= 1 + (char.speedBonus || 0);
    speed *= mag;
    char.vx = dir.x * speed;
    char.vy = dir.y * speed;
    const step = dtMs / 1000;
    char.x = clamp(char.x + char.vx * step, CHAR_RADIUS, WORLD_W - CHAR_RADIUS);
    char.y = clamp(char.y + char.vy * step, CHAR_RADIUS, WORLD_H - CHAR_RADIUS);
  });
}

function collectOrbFor(state, playerId, role, orb) {
  const char = state.entities.chars[playerId];
  if (!char) return;
  if (role === "runner") {
    state.entities.runnerCollected += 1;
    char.sizeScale = Math.max(0.72, (char.sizeScale || 1) - 0.055);
    char.speedBonus = Math.min(0.55, (char.speedBonus || 0) + 0.045);
    state.events.message = "Runner got smaller + faster";
  } else if (role === "chaser") {
    char.sizeScale = Math.min(1.8, (char.sizeScale || 1) + 0.08);
    char.speedBonus = Math.min(0.55, (char.speedBonus || 0) + 0.05);
    state.events.message = "Chaser got bigger + faster";
  }
  const x = 80 + Math.random() * (WORLD_W - 160);
  const y = 80 + Math.random() * (WORLD_H - 160);
  orb.x = x;
  orb.y = y;
  orb.active = true;
}

function handleRoleColorOrbs(state) {
  for (const orb of state.entities.orbs) {
    if (!orb.active) continue;
    if (orb.roleColor === "runner") {
      const runnerId = state.roles.runnerId;
      const runner = state.entities.chars[runnerId];
      const runnerR = CHAR_RADIUS * (runner?.sizeScale || 1);
      if (runner && distance(runner, orb) < ORB_RADIUS + runnerR) {
        collectOrbFor(state, runnerId, "runner", orb);
      }
    } else if (orb.roleColor === "chaser") {
      const chaserId = state.roles.chaserId;
      const chaser = state.entities.chars[chaserId];
      const chaserR = CHAR_RADIUS * (chaser?.sizeScale || 1);
      if (chaser && distance(chaser, orb) < ORB_RADIUS + chaserR) {
        collectOrbFor(state, chaserId, "chaser", orb);
      }
    }
  }
}

function handleTags(state, now) {
  const runner = state.entities.chars[state.roles.runnerId];
  const chaser = state.entities.chars[state.roles.chaserId];
  if (!runner || !chaser) return;
  if (now < state.swap.protectUntil) return;
  const runnerR = CHAR_RADIUS * (runner.sizeScale || 1);
  const chaserR = CHAR_RADIUS * (chaser.sizeScale || 1);
  const tagDistance = TAG_DISTANCE + (runnerR - CHAR_RADIUS) + (chaserR - CHAR_RADIUS);
  if (distance(runner, chaser) < tagDistance && now - state.events.lastTagAt > 900) {
    state.entities.tags += 1;
    state.events.lastTagAt = now;
    state.swap.protectUntil = now + SWAP_PROTECT_MS;
    state.events.message = "Tag!";
  }
}

function finishRoundIfNeeded(state, now) {
  let winnerId = null;
  if (state.entities.runnerCollected >= ORB_TARGET) winnerId = state.roles.runnerId;
  if (state.entities.tags >= TAG_TARGET) winnerId = state.roles.chaserId;
  if (now >= state.match.roundEndsAt && !winnerId) winnerId = state.roles.runnerId;
  if (!winnerId) return;

  state.match.roundsWon[winnerId] = (state.match.roundsWon[winnerId] || 0) + 1;
  const winCount = state.match.roundsWon[winnerId];
  if (winCount >= 2 || state.match.round >= state.match.totalRounds) {
    state.match.winnerId = winnerId;
    state.match.matchWinnerId = winnerId;
    state.match.finishedAt = now;
    state.events.message = "Match finished!";
    return;
  }

  state.match.round += 1;
  state.match.winnerId = winnerId;
  state.events.message = "Next round!";
  resetRoundState(state, now + 1300);
}

export function stepGame(state, now, dtMs) {
  ensureCharsForPlayers(state);
  ensureRoles(state);
  if (!canStartMatch(state)) {
    state.events.message = "Waiting for second player...";
    return state;
  }
  if (!allPlayersDisplayGuideAcked(state)) {
    state.events.message = "Waiting for everyone to finish setup…";
    return state;
  }
  if (!state.match.started) {
    state.match.started = true;
    state.match.roundEndsAt = now + ROUND_MS;
    state.events.message = "Match started!";
  }
  if (state.match.matchWinnerId) {
    // Keep finished state stable so players can clearly see result.
    state.events.message = "Match finished!";
    return state;
  }

  if (now >= state.swap.cueAt && now < state.swap.nextSwapAt) {
    state.swap.cueActive = true;
  }
  if (now >= state.swap.nextSwapAt) {
    tryRoleSwap(state, now);
  }

  simulateMovement(state, dtMs, now);
  handleRoleColorOrbs(state);
  handleTags(state, now);
  finishRoundIfNeeded(state, now);
  return state;
}
