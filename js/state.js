export const WORLD_SIZE = 1000;
export const ROUND_MS = 60_000;
export const ORB_TARGET = 5;
export const TAG_TARGET = 2;
export const SWAP_MIN_MS = 15_000;
export const SWAP_MAX_MS = 42_000;
export const SWAP_COOLDOWN_MS = 8_000;
export const SWAP_CUE_MS = 1_200;
export const SWAP_PROTECT_MS = 1_000;

function randomPos(pad = 80) {
  return {
    x: pad + Math.random() * (WORLD_SIZE - pad * 2),
    y: pad + Math.random() * (WORLD_SIZE - pad * 2),
  };
}

function makeOrb(id, roleColor) {
  return { id, roleColor, ...randomPos(), active: true };
}

function makeOrbs(count = 12) {
  return Array.from({ length: count }, (_, i) => makeOrb(`orb-${i}`, i % 2 === 0 ? "runner" : "chaser"));
}

export function makeRoomState(hostId, guestId = null, now = Date.now()) {
  const p1 = randomPos();
  const p2 = randomPos();
  const nextSwapAt = now + SWAP_MIN_MS + Math.random() * (SWAP_MAX_MS - SWAP_MIN_MS);
  return {
    hostId,
    createdAt: now,
    players: {
      [hostId]: { connected: true, updatedAt: now, displayName: "Player 1" },
      ...(guestId ? { [guestId]: { connected: true, updatedAt: now, displayName: "Player 2" } } : {}),
    },
    inputs: {},
    match: {
      started: false,
      round: 1,
      totalRounds: 3,
      roundsWon: {},
      roundEndsAt: now + ROUND_MS,
      winnerId: null,
      matchWinnerId: null,
      finishedAt: 0,
    },
    entities: {
      chars: {
        [hostId]: {
          x: p1.x,
          y: p1.y,
          vx: 0,
          vy: 0,
          burstUntil: 0,
          pulseUntil: 0,
          nextActionAt: 0,
          sizeScale: 1,
          speedBonus: 0,
        },
        ...(guestId
          ? {
              [guestId]: {
                x: p2.x,
                y: p2.y,
                vx: 0,
                vy: 0,
                burstUntil: 0,
                pulseUntil: 0,
                nextActionAt: 0,
                sizeScale: 1,
                speedBonus: 0,
              },
            }
          : {}),
      },
      orbs: makeOrbs(12),
      runnerCollected: 0,
      tags: 0,
    },
    roles: {
      runnerId: hostId,
      chaserId: guestId || null,
    },
    swap: {
      lastSwapAt: now,
      nextSwapAt,
      cueAt: nextSwapAt - SWAP_CUE_MS,
      cueActive: false,
      protectUntil: now + SWAP_PROTECT_MS,
    },
    events: {
      lastTagAt: 0,
      message: "Waiting for both players...",
    },
  };
}

export function nextSwapTime(now) {
  const r = Math.random();
  const skewed = r < 0.5 ? Math.pow(r * 2, 1.8) / 2 : 1 - Math.pow((1 - r) * 2, 1.8) / 2;
  return now + SWAP_MIN_MS + skewed * (SWAP_MAX_MS - SWAP_MIN_MS);
}

export function resetRoundState(state, now) {
  state.entities.runnerCollected = 0;
  state.entities.tags = 0;
  state.entities.orbs.forEach((orb) => {
    orb.active = true;
    if (!orb.roleColor) orb.roleColor = "runner";
    const pos = randomPos();
    orb.x = pos.x;
    orb.y = pos.y;
  });
  Object.values(state.entities.chars).forEach((char) => {
    const pos = randomPos();
    char.x = pos.x;
    char.y = pos.y;
    char.vx = 0;
    char.vy = 0;
    char.burstUntil = 0;
    char.pulseUntil = 0;
    char.nextActionAt = 0;
    char.sizeScale = 1;
    char.speedBonus = 0;
  });
  state.match.roundEndsAt = now + ROUND_MS;
  state.swap.lastSwapAt = now;
  state.swap.nextSwapAt = nextSwapTime(now);
  state.swap.cueAt = state.swap.nextSwapAt - SWAP_CUE_MS;
  state.swap.cueActive = false;
  state.swap.protectUntil = now + SWAP_PROTECT_MS;
}
