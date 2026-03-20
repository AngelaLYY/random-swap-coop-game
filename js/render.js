import { WORLD_H, WORLD_W } from "./state.js?v=20260319-2";

function isLandscape() {
  const mq = window.matchMedia?.("(orientation: landscape)")?.matches;
  if (typeof mq === "boolean") return mq;
  return window.innerWidth > window.innerHeight;
}

function isPhoneLikeDevice() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const uaLower = ua.toLowerCase();
  const isMobileUA = /iphone|ipod/i.test(uaLower);
  if (isMobileUA) return true;

  const hasTouch = typeof window !== "undefined" && ("ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0);
  const pointerCoarse = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
  const hoverNone = Boolean(window.matchMedia?.("(hover: none)")?.matches);
  const maxDim = Math.max(window.innerWidth || 0, window.innerHeight || 0);
  const minDim = Math.min(window.innerWidth || 0, window.innerHeight || 0);
  return Boolean(hasTouch && pointerCoarse && hoverNone && maxDim <= 1300 && minDim <= 900);
}

function getMobileVisualScale() {
  const mode = document.body?.dataset?.displayMode;
  if (mode === "desktop") return 1;
  if (mode === "phone-portrait") return 1.15;
  if (mode === "phone-landscape") return 1.7;

  // Fallback (before game.js applies display mode)
  if (!isPhoneLikeDevice()) return 1;
  return isLandscape() ? 1.7 : 1.15;
}

function getMobileWorldZoom() {
  const mode = document.body?.dataset?.displayMode;
  if (mode === "desktop") return 1;
  if (mode === "phone-portrait") return 1.06;
  if (mode === "phone-landscape") return 1.28;

  // Fallback (before game.js applies display mode)
  if (!isPhoneLikeDevice()) return 1;
  return isLandscape() ? 1.28 : 1.06;
}

function clear(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#1e2450");
  g.addColorStop(1, "#0b1022");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawArena(ctx, scale) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.strokeStyle = "#ffffff22";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, WORLD_W - 6, WORLD_H - 6);
  ctx.restore();
}

function drawCuteRoleOrb(ctx, orb, visualScale) {
  const isChaser = orb.roleColor === "chaser";
  const base = isChaser ? "#f9a8d4" : "#8ef9f3";
  const accent = isChaser ? "#f472b6" : "#22d3ee";
  const x = orb.x;
  const y = orb.y;
  const r = 12 * visualScale;

  // Main body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = base;
  ctx.fill();

  // Cute role-specific top feature (hair tuft / ears)
  if (isChaser) {
    ctx.beginPath();
    ctx.arc(x - 6 * visualScale, y - 10 * visualScale, 4 * visualScale, 0, Math.PI * 2);
    ctx.arc(x + 6 * visualScale, y - 10 * visualScale, 4 * visualScale, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - 3 * visualScale, y - 13 * visualScale);
    ctx.lineTo(x + 1 * visualScale, y - 20 * visualScale);
    ctx.lineTo(x + 5 * visualScale, y - 12 * visualScale);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
  }

  // Eyes
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - 4 * visualScale, y - 2 * visualScale, 2.4 * visualScale, 0, Math.PI * 2);
  ctx.arc(x + 4 * visualScale, y - 2 * visualScale, 2.4 * visualScale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a1024";
  ctx.beginPath();
  ctx.arc(x - 4 * visualScale, y - 2 * visualScale, 1.1 * visualScale, 0, Math.PI * 2);
  ctx.arc(x + 4 * visualScale, y - 2 * visualScale, 1.1 * visualScale, 0, Math.PI * 2);
  ctx.fill();

  // Tiny mouth
  ctx.strokeStyle = "#0a1024aa";
  ctx.lineWidth = 1.2 * visualScale;
  ctx.beginPath();
  ctx.arc(x, y + 2 * visualScale, 2.8 * visualScale, 0.1, Math.PI - 0.1);
  ctx.stroke();
}

export function drawGame(ctx, canvas, state, localPlayerId) {
  const visualScale = getMobileVisualScale();
  const worldZoom = getMobileWorldZoom();
  const viewportW = canvas.clientWidth || window.innerWidth;
  const viewportH = canvas.clientHeight || window.innerHeight;
  // One full-frame redraw: reset state that could cause trails on some GPUs.
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  // Fixed 16:9 world. Use "contain" scaling so we letterbox instead of cropping/stretching.
  const baseScale = Math.min(viewportW / WORLD_W, viewportH / WORLD_H);
  const scale = baseScale * worldZoom;
  clear(ctx, viewportW, viewportH);
  const worldPixelW = WORLD_W * scale;
  const worldPixelH = WORLD_H * scale;
  const offsetX = (viewportW - worldPixelW) / 2;
  const offsetY = (viewportH - worldPixelH) / 2;

  // Letterbox background bands (slightly darker) for clearer framing.
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  if (offsetY > 0) {
    ctx.fillRect(0, 0, viewportW, offsetY);
    ctx.fillRect(0, viewportH - offsetY, viewportW, offsetY);
  }
  if (offsetX > 0) {
    ctx.fillRect(0, 0, offsetX, viewportH);
    ctx.fillRect(viewportW - offsetX, 0, offsetX, viewportH);
  }
  ctx.restore();

  // World transform: pixel offset + uniform scale.
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  drawArena(ctx, 1);

  for (const orb of state.entities.orbs) {
    if (!orb.active) continue;
    drawCuteRoleOrb(ctx, orb, visualScale);
  }

  for (const [id, ch] of Object.entries(state.entities.chars)) {
    const isRunner = state.roles.runnerId === id;
    const isSelf = id === localPlayerId;
    const charRadius = 20 * (ch.sizeScale || 1) * visualScale;
    ctx.beginPath();
    ctx.arc(ch.x, ch.y, charRadius, 0, Math.PI * 2);
    ctx.fillStyle = isRunner ? "#7ef9e0" : "#ffb3d8";
    ctx.fill();
    if (isSelf) {
      ctx.beginPath();
      ctx.arc(ch.x, ch.y, charRadius + 6 * visualScale, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * Math.max(1, Math.sqrt(visualScale));
      ctx.stroke();
    }
  }

  ctx.restore();
}
