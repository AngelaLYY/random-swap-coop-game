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
  if (base && knob) {
    let active = false;
    let cx = 0;
    let cy = 0;
    const maxR = 42;
    const center = () => {
      const rect = base.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
    };
    center();
    window.addEventListener("resize", center);

    const onMove = (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const m = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(maxR, m);
      const nx = (dx / m) * clamped;
      const ny = (dy / m) * clamped;
      knob.style.left = `${29 + nx}px`;
      knob.style.top = `${29 + ny}px`;
      state.x = nx / maxR;
      state.y = ny / maxR;
    };
    const reset = () => {
      knob.style.left = "29px";
      knob.style.top = "29px";
      state.x = 0;
      state.y = 0;
    };

    base.addEventListener("pointerdown", (e) => {
      active = true;
      base.setPointerCapture(e.pointerId);
      onMove(e.clientX, e.clientY);
    });
    base.addEventListener("pointermove", (e) => {
      if (!active) return;
      onMove(e.clientX, e.clientY);
    });
    const up = () => {
      active = false;
      reset();
    };
    base.addEventListener("pointerup", up);
    base.addEventListener("pointercancel", up);
  }

  return {
    get: () => ({ ...state }),
  };
}
