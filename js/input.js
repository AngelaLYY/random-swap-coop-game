export function createInputController() {
  const state = { x: 0, y: 0, actionPressed: false };
  const keys = new Set();

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
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;

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
      state.x = nx / maxR;
      state.y = ny / maxR;
    };

    const reset = () => {
      knob.style.left = `${knobOffsetPx}px`;
      knob.style.top = `${knobOffsetPx}px`;
      state.x = 0;
      state.y = 0;
      base.classList.remove("active");
    };

    const up = () => {
      active = false;
      reset();
    };

    // Fixed joystick: touch directly on the base
    base.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && isTouchDevice && touchZone) return;
      active = true;
      base.classList.add("active");
      base.setPointerCapture(e.pointerId);
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
        touchZone.setPointerCapture(e.pointerId);
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
    get: () => ({ ...state }),
  };
}
