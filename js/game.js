import { stepGame } from "./engine.js?v=20260321-2";
import {
  ensureSignedIn,
  firebaseReady,
  getAuthUid,
  initFirebase,
  joinRoom,
  pushHostState,
  pushInput,
  pushPlayerDisplayGuideAck,
  resetRoomDisplayGuideAcks,
  subscribeRoom,
} from "./firebase.js?v=20260320-3";
import { createInputController } from "./input.js?v=20260321-4";
import { createAudioManager } from "./audio.js?v=20260320-4";
import { drawGame } from "./render.js?v=20260320-3";
import { resetRoundState } from "./state.js?v=20260320-3";

const params = new URLSearchParams(window.location.search);
const roomId = params.get("room");
let playerId = null;
let inputCtrl = null;
let audio = null;
let roomState = null;
let unsub = null;

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const rolePill = document.getElementById("rolePill");
const roundInfo = document.getElementById("roundInfo");
const timerInfo = document.getElementById("timerInfo");
const scoreInfo = document.getElementById("scoreInfo");
const hudExitBtn = document.getElementById("hudExitBtn");
const hudDisplayBtn = document.getElementById("hudDisplayBtn");
const hudSoundBtn = document.getElementById("hudSoundBtn");
const hudInviteBtn = document.getElementById("hudInviteBtn");
const inviteMenuPanel = document.getElementById("inviteMenuPanel");
const inviteCopyCodeBtn = document.getElementById("inviteCopyCodeBtn");
const inviteCopyLinkBtn = document.getElementById("inviteCopyLinkBtn");
const swapCue = document.getElementById("swapCue");
const statusLine = document.getElementById("statusLine");
const roleFlash = document.getElementById("roleFlash");
const displaySettingsPanel = document.getElementById("displaySettingsPanel");
const displaySettingsCloseBtn = document.getElementById("displaySettingsCloseBtn");
const panelSoundToggle = document.getElementById("panelSoundToggle");
const resultOverlay = document.getElementById("resultOverlay");
const resultTitle = document.getElementById("resultTitle");
const resultSubtitle = document.getElementById("resultSubtitle");
const resultScore = document.getElementById("resultScore");
const playAgainBtn = document.getElementById("playAgainBtn");
const backLobbyBtn = document.getElementById("backLobbyBtn");
const noticeOverlay = document.getElementById("noticeOverlay");
const noticePhone = document.getElementById("noticePhone");
const noticeDesktop = document.getElementById("noticeDesktop");
const displayGuideOverlay = document.getElementById("displayGuideOverlay");
const displayGuideTitle = document.getElementById("displayGuideTitle");
const displayGuideText = document.getElementById("displayGuideText");
const displayGuideStepHint = document.getElementById("displayGuideStepHint");
const displayGuideOpenBtn = document.getElementById("displayGuideOpenBtn");
const displayGuideNextBtn = document.getElementById("displayGuideNextBtn");
const displayGuideSkipBtn = document.getElementById("displayGuideSkipBtn");
const displayGuideDontShowBtn = document.getElementById("displayGuideDontShowBtn");
const displayGuideShadeTop = document.getElementById("displayGuideShadeTop");
const displayGuideShadeBottom = document.getElementById("displayGuideShadeBottom");
const displayGuideShadeLeft = document.getElementById("displayGuideShadeLeft");
const displayGuideShadeRight = document.getElementById("displayGuideShadeRight");
const displayGuideHoleRing = document.getElementById("displayGuideHoleRing");
let lastIsRunner = null;
let roleFlashTimeout = null;
let lastTagCount = 0;
let lastCollectCount = 0;
let resultShown = false;
let resultRoomId = null;
let hintTimeout = null;
let hintAck = false;
let keyboardTimeout = null;
let keyboardAck = false;
let lastDeviceWasPhone = null;

const DISPLAY_MODE_KEY = "rscoop_display_mode";
const DISPLAY_MODES = new Set(["auto", "desktop", "phone-landscape", "phone-portrait"]);
const DISPLAY_GUIDE_ACK_KEY = "rscoop_display_guide_ack";
let lastEffectiveDisplayMode = null;
/** 0 = spotlight menu, 1 = spotlight play canvas */
let displayGuideStep = 0;
let displayGuideSpotlightScheduled = false;
let guideAckAutoPushInFlight = false;

function updateHudMetrics() {
  const hud = document.querySelector(".hud");
  if (!hud) return;
  const rect = hud.getBoundingClientRect();
  const bottom = Math.max(0, rect.bottom);
  document.documentElement.style.setProperty("--hud-bottom", `${Math.ceil(bottom)}px`);
}

function isLandscape() {
  const mq = window.matchMedia?.("(orientation: landscape)")?.matches;
  if (typeof mq === "boolean") return mq;
  return window.innerWidth > window.innerHeight;
}

function detectDisplayMode() {
  if (!isPhoneLikeDevice()) return "desktop";
  return isLandscape() ? "phone-landscape" : "phone-portrait";
}

function prettyMode(mode) {
  if (mode === "desktop") return "Desktop";
  if (mode === "phone-landscape") return "Phone Landscape";
  if (mode === "phone-portrait") return "Phone Portrait";
  return "Auto";
}

function getDisplayGuideAck() {
  try {
    return window.localStorage?.getItem(DISPLAY_GUIDE_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

function setDisplayGuideAck(ack) {
  try {
    window.localStorage?.setItem(DISPLAY_GUIDE_ACK_KEY, ack ? "1" : "0");
  } catch {
    // ignore
  }
}

function setDisplayGuideOpen(open) {
  if (!displayGuideOverlay) return;
  displayGuideOverlay.classList.toggle("hidden", !open);
  displayGuideOverlay.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) {
    scheduleDisplayGuideSpotlightUpdate();
  }
}

function playerHasDisplayGuideAck(state, pid) {
  return Boolean(state?.players?.[pid]?.displayGuideAck);
}

function positionDisplayGuideSpotlightAroundRect(rect, pad = 12) {
  if (
    !displayGuideShadeTop ||
    !displayGuideShadeBottom ||
    !displayGuideShadeLeft ||
    !displayGuideShadeRight ||
    !displayGuideHoleRing
  ) {
    return;
  }
  const t = rect.top - pad;
  const l = rect.left - pad;
  const r = rect.right + pad;
  const b = rect.bottom + pad;
  const holeW = Math.max(0, r - l);
  const holeH = Math.max(0, b - t);

  displayGuideShadeTop.style.top = "0";
  displayGuideShadeTop.style.left = "0";
  displayGuideShadeTop.style.right = "0";
  displayGuideShadeTop.style.height = `${Math.max(0, t)}px`;

  displayGuideShadeBottom.style.top = `${b}px`;
  displayGuideShadeBottom.style.left = "0";
  displayGuideShadeBottom.style.right = "0";
  displayGuideShadeBottom.style.bottom = "0";

  displayGuideShadeLeft.style.top = `${t}px`;
  displayGuideShadeLeft.style.left = "0";
  displayGuideShadeLeft.style.width = `${Math.max(0, l)}px`;
  displayGuideShadeLeft.style.height = `${holeH}px`;

  displayGuideShadeRight.style.top = `${t}px`;
  displayGuideShadeRight.style.left = `${r}px`;
  displayGuideShadeRight.style.right = "0";
  displayGuideShadeRight.style.height = `${holeH}px`;

  displayGuideHoleRing.style.left = `${l}px`;
  displayGuideHoleRing.style.top = `${t}px`;
  displayGuideHoleRing.style.width = `${holeW}px`;
  displayGuideHoleRing.style.height = `${holeH}px`;
}

function updateDisplayGuideSpotlightContent() {
  const pref = getDisplayModePreference();
  const effective = pref === "auto" ? detectDisplayMode() : pref;
  const modeLine = `Display mode: ${prettyMode(effective)}${pref === "auto" ? " (Auto)" : ""}.`;

  if (displayGuideStep === 0) {
    if (displayGuideTitle) displayGuideTitle.textContent = "Before you play";
    const tip =
      effective === "phone-portrait"
        ? "Rotate to landscape for the largest play area."
        : "If the screen looks clipped or tiny, change mode in settings.";
    if (displayGuideText) {
      displayGuideText.textContent = `${modeLine} Display, Sound, and Invite (room code or link) are in the top bar. Use Exit to leave. ${tip}`;
    }
    if (displayGuideStepHint) displayGuideStepHint.textContent = "Step 1 of 2 — top bar";
    if (displayGuideNextBtn) displayGuideNextBtn.textContent = "Next";
    const target = document.querySelector(".hud");
    if (target) {
      positionDisplayGuideSpotlightAroundRect(target.getBoundingClientRect(), 10);
    } else {
      positionDisplayGuideSpotlightAroundRect(
        { top: 10, left: 10, right: window.innerWidth - 10, bottom: 120 } /* fallback */,
        0,
      );
    }
  } else {
    if (displayGuideTitle) displayGuideTitle.textContent = "Play area";
    const rotateTip =
      effective === "phone-portrait" ? "Landscape is best for this arena." : "Steer with touch inside this area (or keys on desktop).";
    if (displayGuideText) {
      displayGuideText.textContent = `The highlighted region is your playfield. ${rotateTip}`;
    }
    if (displayGuideStepHint) displayGuideStepHint.textContent = "Step 2 of 2 — orientation";
    if (displayGuideNextBtn) displayGuideNextBtn.textContent = "Got it";
    const c = document.getElementById("gameCanvas");
    if (c) {
      positionDisplayGuideSpotlightAroundRect(c.getBoundingClientRect(), 8);
    }
  }
}

function scheduleDisplayGuideSpotlightUpdate() {
  if (displayGuideSpotlightScheduled) return;
  displayGuideSpotlightScheduled = true;
  requestAnimationFrame(() => {
    displayGuideSpotlightScheduled = false;
    if (!displayGuideOverlay || displayGuideOverlay.classList.contains("hidden")) return;
    updateDisplayGuideSpotlightContent();
  });
}

function tryOpenDisplayGuideBeforeGame() {
  if (!displayGuideOverlay || !roomState || !playerId) return;
  if (playerHasDisplayGuideAck(roomState, playerId)) {
    if (!displayGuideOverlay.classList.contains("hidden")) setDisplayGuideOpen(false);
    return;
  }
  if (getDisplayGuideAck()) {
    if (!guideAckAutoPushInFlight) {
      guideAckAutoPushInFlight = true;
      pushPlayerDisplayGuideAck(roomId, playerId, true)
        .then(() => {
          syncError = "";
        })
        .catch((err) => {
          syncError = err?.message || "setup sync failed";
        })
        .finally(() => {
          guideAckAutoPushInFlight = false;
        });
    }
    return;
  }
  if (!displayGuideOverlay.classList.contains("hidden")) {
    scheduleDisplayGuideSpotlightUpdate();
    return;
  }
  displayGuideStep = 0;
  setDisplayGuideOpen(true);
  updateDisplayGuideSpotlightContent();
}

async function completeDisplayGuideOnFirebase() {
  if (!roomId || !playerId) return;
  try {
    await pushPlayerDisplayGuideAck(roomId, playerId, true);
    syncError = "";
  } catch (err) {
    syncError = err?.message || "Could not save setup";
  }
  setDisplayGuideOpen(false);
}

function getDisplayModePreference() {
  try {
    const raw = window.localStorage?.getItem(DISPLAY_MODE_KEY);
    if (raw && DISPLAY_MODES.has(raw)) return raw;
  } catch {
    // ignore storage failures
  }
  return "auto";
}

function setDisplayModePreference(mode) {
  const next = DISPLAY_MODES.has(mode) ? mode : "auto";
  try {
    window.localStorage?.setItem(DISPLAY_MODE_KEY, next);
  } catch {
    // ignore storage failures
  }
}

function applyDisplayMode() {
  const pref = getDisplayModePreference();
  const effective = pref === "auto" ? detectDisplayMode() : pref;
  document.body.dataset.displayMode = effective;
  lastEffectiveDisplayMode = effective;
  scheduleDisplayGuideSpotlightUpdate();

  // Scale HUD and world separately (HUD via CSS, world via render.js).
  let hudScale = 1;
  if (effective === "phone-landscape") hudScale = 0.78;
  if (effective === "phone-portrait") hudScale = 1.0;
  if (effective === "desktop") hudScale = 1.0;
  document.documentElement.style.setProperty("--hud-ui-scale", String(hudScale));

  updateHudMetrics();
  updateDisplaySettingsUI();
  resizeCanvas?.();
}

function updateDisplaySettingsUI() {
  if (!displaySettingsPanel) return;
  const pref = getDisplayModePreference();
  const effective = pref === "auto" ? detectDisplayMode() : pref;

  if (hudDisplayBtn) {
    const detail =
      pref === "auto"
        ? `Auto (${effective === "desktop" ? "Desktop" : effective === "phone-landscape" ? "Phone Landscape" : "Phone Portrait"})`
        : effective === "desktop"
          ? "Desktop"
          : effective === "phone-landscape"
            ? "Phone Landscape"
            : "Phone Portrait";
    hudDisplayBtn.textContent = "Display";
    hudDisplayBtn.title = `Open display settings — ${detail}`;
  }

  if (panelSoundToggle && audio) {
    panelSoundToggle.textContent = `Sound: ${audio.isEnabled() ? "On" : "Off"}`;
  }

  if (hudSoundBtn && audio) {
    hudSoundBtn.textContent = `Sound: ${audio.isEnabled() ? "On" : "Off"}`;
  }

  for (const btn of displaySettingsPanel.querySelectorAll("button[data-display-mode]")) {
    const mode = btn.getAttribute("data-display-mode");
    btn.classList.toggle("selected", mode === pref);
  }
}

function setDisplaySettingsOpen(open) {
  if (!displaySettingsPanel) return;
  displaySettingsPanel.classList.toggle("hidden", !open);
  displaySettingsPanel.setAttribute("aria-hidden", open ? "false" : "true");
}

function applyVisualViewportChrome() {
  // visualViewport.offsetTop represents browser UI (tabs/address bar) that
  // overlays the page; we compensate so fixed content isn't hidden.
  const vv = window.visualViewport;
  const visibleHeight = typeof vv?.height === "number" && vv.height > 0 ? vv.height : window.innerHeight;
  const visibleWidth = typeof vv?.width === "number" && vv.width > 0 ? vv.width : window.innerWidth;
  document.documentElement.style.setProperty("--vh", `${visibleHeight * 0.01}px`);
  document.documentElement.style.setProperty("--vv-width", `${visibleWidth}px`);
  if (!vv) return;

  const top = typeof vv.offsetTop === "number" ? vv.offsetTop : 0;
  const bottom = Math.max(0, window.innerHeight - top - vv.height);
  const left = typeof vv.offsetLeft === "number" ? vv.offsetLeft : 0;
  const right = Math.max(0, window.innerWidth - left - vv.width);
  document.documentElement.style.setProperty("--chrome-top", `${top}px`);
  document.documentElement.style.setProperty("--chrome-bottom", `${bottom}px`);
  document.documentElement.style.setProperty("--chrome-left", `${left}px`);
  document.documentElement.style.setProperty("--chrome-right", `${right}px`);
  updateHudMetrics();
  // Recompute canvas size to match the newly visible area.
  resizeCanvas?.();
  scheduleDisplayGuideSpotlightUpdate();
}

function isPhoneLikeDevice() {
  const hasTouch = typeof window !== "undefined" && ("ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const uaLower = ua.toLowerCase();

  const pointerCoarse = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
  const hoverNone = Boolean(window.matchMedia?.("(hover: none)")?.matches);
  const isWindows = uaLower.includes("windows");

  // Prefer explicit mobile UA when available.
  const isMobileUA = /android|iphone|ipad|ipod/i.test(uaLower);
  if (isMobileUA) return true;

  // Touch-first + no-hover is the best cross-browser signal for phones/tablets.
  if (hasTouch && pointerCoarse && hoverNone && !isWindows) return true;

  // Fallback: smallish viewport + touch.
  const maxInnerDim =
    typeof window !== "undefined" && Number.isFinite(window.innerWidth) && Number.isFinite(window.innerHeight)
      ? Math.max(window.innerWidth, window.innerHeight)
      : 9999;
  const minInnerDim =
    typeof window !== "undefined" && Number.isFinite(window.innerWidth) && Number.isFinite(window.innerHeight)
      ? Math.min(window.innerWidth, window.innerHeight)
      : 0;
  return Boolean(hasTouch && !isWindows && maxInnerDim <= 1300 && minInnerDim <= 900);
}

function isPortrait() {
  // Prefer `matchMedia` when available; it's generally more stable on mobile.
  const mq = window.matchMedia?.("(orientation: portrait)")?.matches;
  if (typeof mq === "boolean") return mq;
  return window.innerHeight > window.innerWidth;
}

function updateNoticeOverlay() {
  if (!noticeOverlay || !noticePhone || !noticeDesktop) return;

  const phoneDevice = isPhoneLikeDevice();
  const showPhone = phoneDevice && !hintAck;
  const showDesktop = !phoneDevice && !keyboardAck;
  const shouldShow = showPhone || showDesktop;

  // Explicitly control display to avoid iOS "stuck dimming/blur" artifacts.
  noticeOverlay.classList.toggle("hidden", !shouldShow);
  noticeOverlay.style.display = shouldShow ? "grid" : "none";
  noticeOverlay.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  if (noticePhone) noticePhone.classList.toggle("hidden", !showPhone);
  if (noticeDesktop) noticeDesktop.classList.toggle("hidden", !showDesktop);

  // Manage auto-hide for the current device type.
  if (showPhone) {
    if (keyboardTimeout) {
      clearTimeout(keyboardTimeout);
      keyboardTimeout = null;
    }
    if (!hintTimeout) {
      hintTimeout = setTimeout(() => {
        hintAck = true;
        hintTimeout = null;
        updateNoticeOverlay();
      }, 4200);
    }
  } else if (showDesktop) {
    if (hintTimeout) {
      clearTimeout(hintTimeout);
      hintTimeout = null;
    }
    if (!keyboardTimeout) {
      keyboardTimeout = setTimeout(() => {
        keyboardAck = true;
        keyboardTimeout = null;
        updateNoticeOverlay();
      }, 4200);
    }
  } else {
    // Nothing to show right now.
    if (hintTimeout) {
      clearTimeout(hintTimeout);
      hintTimeout = null;
    }
    if (keyboardTimeout) {
      clearTimeout(keyboardTimeout);
      keyboardTimeout = null;
    }
  }
}

function applyOrientationLock() {
  const phoneDevice = isPhoneLikeDevice();
  document.body.classList.toggle("phone-device", phoneDevice);
  document.body.classList.toggle("desktop-device", !phoneDevice);

  // Optional body class for any future portrait-specific styling.
  document.body.classList.toggle("portrait-lock", phoneDevice && isPortrait());

  // If the user moves between "phone mode" and "desktop mode", reset notices.
  if (lastDeviceWasPhone !== null && lastDeviceWasPhone !== phoneDevice) {
    hintAck = false;
    keyboardAck = false;
    if (hintTimeout) clearTimeout(hintTimeout);
    if (keyboardTimeout) clearTimeout(keyboardTimeout);
  }
  lastDeviceWasPhone = phoneDevice;

  updateNoticeOverlay();
}

window.addEventListener("resize", applyOrientationLock);
window.addEventListener("orientationchange", applyOrientationLock);
applyOrientationLock();

window.addEventListener("resize", applyDisplayMode);
window.addEventListener("orientationchange", applyDisplayMode);

applyVisualViewportChrome();
window.addEventListener("resize", applyVisualViewportChrome);
window.visualViewport?.addEventListener("resize", applyVisualViewportChrome);
window.addEventListener("scroll", applyVisualViewportChrome, { passive: true });
window.visualViewport?.addEventListener("scroll", applyVisualViewportChrome, { passive: true });

applyDisplayMode();

if (hudDisplayBtn) {
  hudDisplayBtn.addEventListener("click", () => {
    const open = Boolean(displaySettingsPanel?.classList.contains("hidden"));
    setDisplaySettingsOpen(open);
  });
}

if (displaySettingsCloseBtn) {
  displaySettingsCloseBtn.addEventListener("click", () => setDisplaySettingsOpen(false));
}

if (displaySettingsPanel) {
  displaySettingsPanel.addEventListener("click", (e) => {
    const target = e.target;
    if (target === displaySettingsPanel) {
      setDisplaySettingsOpen(false);
    }
  });

  for (const btn of displaySettingsPanel.querySelectorAll("button[data-display-mode]")) {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-display-mode") || "auto";
      setDisplayModePreference(mode);
      applyDisplayMode();
    });
  }
}

if (displayGuideOpenBtn) {
  displayGuideOpenBtn.addEventListener("click", async () => {
    await completeDisplayGuideOnFirebase();
    setDisplaySettingsOpen(true);
  });
}

if (displayGuideNextBtn) {
  displayGuideNextBtn.addEventListener("click", async () => {
    if (displayGuideStep === 0) {
      displayGuideStep = 1;
      updateDisplayGuideSpotlightContent();
    } else {
      await completeDisplayGuideOnFirebase();
    }
  });
}

if (displayGuideSkipBtn) {
  displayGuideSkipBtn.addEventListener("click", async () => {
    await completeDisplayGuideOnFirebase();
  });
}

if (displayGuideDontShowBtn) {
  displayGuideDontShowBtn.addEventListener("click", async () => {
    setDisplayGuideAck(true);
    await completeDisplayGuideOnFirebase();
  });
}


window.addEventListener("softjoystick:started", () => {
  if (!isPhoneLikeDevice()) return;
  hintAck = true;
  if (hintTimeout) clearTimeout(hintTimeout);
  updateNoticeOverlay();
});

window.addEventListener("keydown", () => {
  if (keyboardAck) return;
  // Only show keyboard guidance on laptop/desktop.
  if (isPhoneLikeDevice()) return;
  keyboardAck = true;
  if (keyboardTimeout) clearTimeout(keyboardTimeout);
  updateNoticeOverlay();
});

if (!roomId) {
  statusLine.textContent = "Missing room. Open game.html?room=YOUR_ROOM_ID";
} else if (!firebaseReady()) {
  statusLine.textContent = "Firebase config missing in js/firebase.js";
} else {
  initFirebase();
  await ensureSignedIn();
  playerId = await getAuthUid();
  await joinRoom(roomId, playerId);

  inputCtrl = createInputController();
  audio = createAudioManager();
  updateDisplaySettingsUI();

  unsub = subscribeRoom(roomId, (state) => {
    roomState = state;
    if (roomState?.hostId === playerId) {
      // Don’t clone on every snapshot — that rewinds local sim and causes desktop “ghosting”.
      if (shouldResyncHostSimFromRemote(roomState)) {
        hostSimState = structuredClone(roomState);
      }
    } else {
      hostSimState = null;
    }
  });
  window.addEventListener("beforeunload", () => unsub?.());
}
let lastLocalPush = 0;
let lastHostStep = performance.now();
let lastHostPush = 0;
let syncError = "";
let inputWriteInFlight = false;
let hostWriteInFlight = false;
let hostSimState = null;

/** Only structural fields — not entity positions — so host local sim isn’t rewound every Firebase echo. */
function hostStructuralRev(s) {
  if (!s) return "";
  const p = Object.keys(s.players || {}).sort().join(",");
  const m = s.match || {};
  const r = s.roles || {};
  const players = s.players || {};
  const ackSig = Object.keys(players)
    .sort()
    .map((id) => `${id}:${players[id]?.displayGuideAck === true ? 1 : 0}`)
    .join(",");
  return [
    p,
    ackSig,
    m.round,
    m.totalRounds,
    Boolean(m.started),
    Number(m.finishedAt || 0),
    m.matchWinnerId || "",
    m.winnerId || "",
    r.runnerId || "",
    r.chaserId || "",
  ].join("|");
}

function shouldResyncHostSimFromRemote(remote) {
  if (!remote) return false;
  if (!hostSimState) return true;
  return hostStructuralRev(remote) !== hostStructuralRev(hostSimState);
}

function resizeCanvas() {
  updateHudMetrics();
  const dprCap = isPhoneLikeDevice() ? 1 : 2;
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  // Size the canvas to its actual rendered size.
  // This avoids "partial paint" issues when iOS/Safari or desktop layouts
  // cause `window.innerWidth/innerHeight` to differ from `canvas.clientWidth`.
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

if (hudSoundBtn && audio) {
  hudSoundBtn.addEventListener("click", () => {
    const next = !audio.isEnabled();
    audio.setEnabled(next);
    updateDisplaySettingsUI();
  });
}

if (panelSoundToggle && audio) {
  panelSoundToggle.addEventListener("click", () => {
    const next = !audio.isEnabled();
    audio.setEnabled(next);
    updateDisplaySettingsUI();
  });
}

function getRoomShareUrl() {
  const u = new URL(window.location.href);
  if (roomId) u.searchParams.set("room", roomId);
  u.hash = "";
  return u.toString();
}

function setInviteMenuOpen(open) {
  if (!inviteMenuPanel || !hudInviteBtn) return;
  inviteMenuPanel.classList.toggle("hidden", !open);
  inviteMenuPanel.setAttribute("aria-hidden", open ? "false" : "true");
  hudInviteBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

let inviteFeedbackTimer = 0;
function flashInviteButton(message, durationMs = 2000) {
  if (!hudInviteBtn) return;
  const prev = hudInviteBtn.textContent;
  hudInviteBtn.textContent = message;
  if (inviteFeedbackTimer) clearTimeout(inviteFeedbackTimer);
  inviteFeedbackTimer = window.setTimeout(() => {
    hudInviteBtn.textContent = prev || "Invite";
    inviteFeedbackTimer = 0;
  }, durationMs);
}

async function copyTextToClipboard(text, feedbackMessage) {
  try {
    await navigator.clipboard.writeText(text);
    setInviteMenuOpen(false);
    flashInviteButton(feedbackMessage || "Copied!");
  } catch {
    window.prompt("Copy:", text);
    setInviteMenuOpen(false);
  }
}

async function copyRoomCodeOnly() {
  if (!roomId) return;
  await copyTextToClipboard(roomId, "Code copied!");
}

async function copyRoomInviteLink() {
  if (!roomId) return;
  await copyTextToClipboard(getRoomShareUrl(), "Link copied!");
}

function goToLobby() {
  window.location.href = "./index.html";
}

if (hudExitBtn) {
  hudExitBtn.addEventListener("click", goToLobby);
}

if (hudInviteBtn && inviteMenuPanel) {
  hudInviteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = inviteMenuPanel.classList.contains("hidden");
    setInviteMenuOpen(open);
  });
  inviteMenuPanel.addEventListener("click", (e) => e.stopPropagation());
}

document.addEventListener("click", () => setInviteMenuOpen(false));

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setInviteMenuOpen(false);
});

if (inviteCopyCodeBtn) {
  inviteCopyCodeBtn.addEventListener("click", () => {
    void copyRoomCodeOnly();
  });
}
if (inviteCopyLinkBtn) {
  inviteCopyLinkBtn.addEventListener("click", () => {
    void copyRoomInviteLink();
  });
}

if (backLobbyBtn) {
  backLobbyBtn.addEventListener("click", goToLobby);
}

if (playAgainBtn) {
  playAgainBtn.addEventListener("click", async () => {
    if (!roomState || roomState.hostId !== playerId) return;
    const ids = Object.keys(roomState.players || {});
    await resetRoomDisplayGuideAcks(roomId, ids);
    const next = structuredClone(roomState);
    for (const id of ids) {
      if (next.players[id]) next.players[id].displayGuideAck = false;
    }
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
    hostSimState = structuredClone(next);
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
  const ids = Object.keys(roomState.players || {});
  const playerCount = ids.length;
  roundInfo.textContent = `Round ${round}/${totalRounds}`;
  if (!match.started && playerCount >= 2) {
    timerInfo.textContent = "—";
  } else {
    timerInfo.textContent = `${Math.max(0, Math.ceil((roundEndsAt - now) / 1000))}s`;
  }
  const myWins = playerId ? (roundsWon[playerId] || 0) : 0;
  const oppId = ids.find((id) => id !== playerId);
  const oppWins = oppId ? (roundsWon[oppId] || 0) : 0;
  scoreInfo.textContent = `You ${myWins} - Opp ${oppWins}`;
  swapCue.classList.toggle("hidden", !swap.cueActive);
  const collectCount = roomState.entities?.runnerCollected || 0;
  const tagCount = roomState.entities?.tags || 0;
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
    if (!roomState || !playerId || !inputCtrl || !audio) return;

    const localInput = inputCtrl.get();
    const inputPushMs = isPhoneLikeDevice() ? 48 : 66;
    if (!inputWriteInFlight && now - lastLocalPush > inputPushMs) {
      lastLocalPush = now;
      inputWriteInFlight = true;
      pushInput(roomId, playerId, localInput)
        .then(() => {
          syncError = "";
        })
        .catch((err) => {
          syncError = err?.message || "input write failed";
        })
        .finally(() => {
          inputWriteInFlight = false;
        });
    }

    if (roomState.hostId === playerId) {
      // Local prediction: smooth on mobile; desktop uses same sim for authority but renders authoritative state below.
      if (!hostSimState) hostSimState = structuredClone(roomState);
      // Inputs live under rooms/.../inputs and update every tick from RTDB. We no longer full-clone
      // roomState on every snapshot (ghosting fix), so merge inputs before simulateMovement().
      hostSimState.inputs = structuredClone(roomState.inputs || {});
      hostSimState.inputs[playerId] = {
        x: localInput.x,
        y: localInput.y,
        actionPressed: Boolean(localInput.actionPressed),
        updatedAt: Date.now(),
      };
      const dtRaw = now - lastHostStep;
      const dtMax = isPhoneLikeDevice() ? 26 : 38;
      const dt = Math.max(8, Math.min(dtMax, dtRaw));
      lastHostStep = now;
      stepGame(hostSimState, Date.now(), dt);
      const hostPushMs = isPhoneLikeDevice() ? 64 : 80;
      if (now - lastHostPush > hostPushMs) {
        lastHostPush = now;
        if (!hostWriteInFlight) {
          hostWriteInFlight = true;
          const snapshot = structuredClone(hostSimState);
          pushHostState(roomId, snapshot)
            .then(() => {
              syncError = "";
            })
            .catch((err) => {
              syncError = err?.message || "host state write failed";
            })
            .finally(() => {
              hostWriteInFlight = false;
            });
        }
      }
    }

    updateHud(Date.now());

    tryOpenDisplayGuideBeforeGame();

    // Mobile: draw predicted host sim for smooth motion. Desktop: single authoritative snapshot (no sim/echo mismatch).
    const useHostSimForRender =
      isPhoneLikeDevice() && roomState.hostId === playerId && hostSimState;
    const renderState = useHostSimForRender ? hostSimState : roomState;
    drawGame(ctx, canvas, renderState, playerId);
  } catch (err) {
    syncError = err?.message || "tick failed";
    if (statusLine) statusLine.textContent = `Runtime error: ${syncError}`;
  }
}
requestAnimationFrame(tick);
