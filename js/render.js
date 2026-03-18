import { WORLD_SIZE } from "./state.js";

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
  ctx.strokeRect(3, 3, WORLD_SIZE - 6, WORLD_SIZE - 6);
  ctx.restore();
}

function drawCuteRoleOrb(ctx, orb) {
  const isChaser = orb.roleColor === "chaser";
  const base = isChaser ? "#f9a8d4" : "#8ef9f3";
  const accent = isChaser ? "#f472b6" : "#22d3ee";
  const x = orb.x;
  const y = orb.y;
  const r = 12;

  // Main body
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = base;
  ctx.fill();

  // Cute role-specific top feature (hair tuft / ears)
  if (isChaser) {
    ctx.beginPath();
    ctx.arc(x - 6, y - 10, 4, 0, Math.PI * 2);
    ctx.arc(x + 6, y - 10, 4, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 13);
    ctx.lineTo(x + 1, y - 20);
    ctx.lineTo(x + 5, y - 12);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
  }

  // Eyes
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x - 4, y - 2, 2.4, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 2, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0a1024";
  ctx.beginPath();
  ctx.arc(x - 4, y - 2, 1.1, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 2, 1.1, 0, Math.PI * 2);
  ctx.fill();

  // Tiny mouth
  ctx.strokeStyle = "#0a1024aa";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y + 2, 2.8, 0.1, Math.PI - 0.1);
  ctx.stroke();
}

export function drawGame(ctx, canvas, state, localPlayerId) {
  const viewportW = canvas.clientWidth || window.innerWidth;
  const viewportH = canvas.clientHeight || window.innerHeight;
  const scale = Math.min(viewportW / WORLD_SIZE, viewportH / WORLD_SIZE);
  clear(ctx, viewportW, viewportH);
  drawArena(ctx, scale);

  ctx.save();
  ctx.scale(scale, scale);

  for (const orb of state.entities.orbs) {
    if (!orb.active) continue;
    drawCuteRoleOrb(ctx, orb);
  }

  for (const [id, ch] of Object.entries(state.entities.chars)) {
    const isRunner = state.roles.runnerId === id;
    const isSelf = id === localPlayerId;
    const charRadius = 20 * (ch.sizeScale || 1);
    ctx.beginPath();
    ctx.arc(ch.x, ch.y, charRadius, 0, Math.PI * 2);
    ctx.fillStyle = isRunner ? "#7ef9e0" : "#ffb3d8";
    ctx.fill();
    if (isSelf) {
      ctx.beginPath();
      ctx.arc(ch.x, ch.y, charRadius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  ctx.restore();
}
