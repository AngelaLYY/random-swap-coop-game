export function createInputController() {
  const state = { x: 0, y: 0, actionPressed: false };
  const keys = new Set();
  let resetFn = () => {};

  function applyKeys() {
    state.x = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
    state.y = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
  }

  window.addEventListener("keydown", (e) => {
    keys.add(e.key);
    applyKeys();
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.key);
    applyKeys();
  });

  const base = document.getElementById("joystickBase");
  const knob = document.getElementById("joystickKnob");
  const touchZone = document.getElementById("joystickTouchZone");
  const canvas = document.getElementById("gameCanvas");
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  const uaLower = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  const pointerCoarse = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
  const hoverNone = Boolean(window.matchMedia?.("(hover: none)")?.matches);
  const isWindows = uaLower.includes("windows");

  // Only enable touch joystick UX on touch-first devices (phones/tablets).
  // This avoids showing joystick UX on desktop/laptops that have a mouse/hover.
  const canUseTouchControls = /android|iphone|ipad|ipod/i.test(uaLower) || (isTouchDevice && pointerCoarse && hoverNone && !isWindows);

  if (!canUseTouchControls) {
    return {
      get: () => ({ ...state }),
      reset: () => resetFn(),
    };
  }

  function hapticLight() {
    if (typeof navigator.vibrate === "function") navigator.vibrate(10);
  }

  if (base && knob) {
    let active = false;
    let cx = 0;
    let cy = 0;
    let maxR = 40;
    let knobOffsetPx = 0; // half base minus half knob, for positioning the knob in px

    function updateGeometry() {
      const rect = base.getBoundingClientRect();
      const knobRect = knob.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
      const halfBase = rect.width / 2;
      const halfKnob = knobRect.width / 2;
      maxR = Math.max(10, halfBase - halfKnob - 2);
      knobOffsetPx = halfBase - halfKnob;
    }

    updateGeometry();
    window.addEventListener("resize", updateGeometry);

    const onMove = (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const m = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(maxR, m);
      const nx = (dx / m) * clamped;
      const ny = (dy / m) * clamped;
      knob.style.left = `${knobOffsetPx + nx}px`;
      knob.style.top = `${knobOffsetPx + ny}px`;
      const stickCap = 0.8;
      const radialGain = 1.1;
      const ux = dx / m;
      const uy = dy / m;
      const t = Math.min(1, Math.max(0, (clamped / maxR) * radialGain));
      const curved = Math.pow(t, 1.06);
      const mag = curved * stickCap;
      state.x = ux * mag;
      state.y = uy * mag;
    };

    const reset = () => {
      knob.style.left = `${knobOffsetPx}px`;
      knob.style.top = `${knobOffsetPx}px`;
      state.x = 0;
      state.y = 0;
      base.classList.remove("active");
    };
    resetFn = reset;

    const up = () => {
      active = false;
      reset();
    };

    // Fixed joystick: touch directly on the base
    base.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && isTouchDevice && touchZone) return;
      active = true;
      base.classList.add("active");
      try {
        window.dispatchEvent(new CustomEvent("softjoystick:started"));
      } catch {
        // ignore
      }
      try {
        base.setPointerCapture?.(e.pointerId);
      } catch {
        // Pointer capture can throw on some iOS Safari versions; ignore.
      }
      updateGeometry();
      onMove(e.clientX, e.clientY);
      hapticLight();
    });
    base.addEventListener("pointermove", (e) => {
      if (!active) return;
      onMove(e.clientX, e.clientY);
    });
    base.addEventListener("pointerup", up);
    base.addEventListener("pointercancel", up);

    // Dynamic joystick on touch: first touch in left half places stick and starts control
    if (isTouchDevice && touchZone) {
      base.classList.add("dynamic");
      touchZone.classList.add("active");
      const safeBottomPx = 24; /* reserve space above home indicator / safe area */
      touchZone.addEventListener("pointerdown", (e) => {
        if (active) return;
        // Only capture touches that begin inside the play canvas.
        // This prevents the joystick touch zone from blocking HUD/buttons.
        if (canvas) {
          const r = canvas.getBoundingClientRect();
          const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          if (!inside) return;
        }

        e.preventDefault();
        updateGeometry();
        const rect = base.getBoundingClientRect();
        const bw = rect.width;
        const bh = rect.height;
        const padding = 24;
        const x = Math.max(padding + bw / 2, Math.min(window.innerWidth - padding - bw / 2, e.clientX));
        const y = Math.max(padding + bh / 2, Math.min(window.innerHeight - safeBottomPx - bh / 2, e.clientY));
        base.style.left = `${x - bw / 2}px`;
        base.style.top = `${y - bh / 2}px`;
        base.style.bottom = "auto";
        updateGeometry();
        active = true;
        base.classList.add("active");
        try {
          window.dispatchEvent(new CustomEvent("softjoystick:started"));
        } catch {
          // ignore
        }
        try {
          touchZone.setPointerCapture?.(e.pointerId);
        } catch {
          // Pointer capture can throw on some iOS Safari versions; ignore.
        }
        onMove(e.clientX, e.clientY);
        hapticLight();
      });
      touchZone.addEventListener("pointermove", (e) => {
        if (!active) return;
        onMove(e.clientX, e.clientY);
      });
      touchZone.addEventListener("pointerup", up);
      touchZone.addEventListener("pointercancel", up);
    }
  }

  return {
    get: () => {
      if (!base || !knob) {
        return { ...state };
      }
      const x = state.x;
      const y = state.y;
      // Tiny dead zone: filter thumb noise when trying to hold still.
      const mag = Math.hypot(x, y);
      if (mag < 0.03) return { x: 0, y: 0, actionPressed: Boolean(state.actionPressed) };
      return { x, y, actionPressed: Boolean(state.actionPressed) };
    },
    reset: () => resetFn(),
  };
}
