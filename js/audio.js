const RUN_VOICE_URL = "./assets/audio/run-voice.mp3";
const BGM_URL = "./assets/audio/bgm.mp3";

export function createAudioManager() {
  const AudioContextCls = window.AudioContext || window.webkitAudioContext;
  const ctx = AudioContextCls ? new AudioContextCls() : null;
  let enabled = true;
  let unlocked = false;
  let bgm = null;
  let runVoice = null;
  let runVoiceOk = false;
  let bgmOk = false;
  let bgmStarted = false;
  let bgmRate = 1;

  function tryLoadAudio(url, onOk, onErr) {
    const a = new Audio(url);
    a.preload = "auto";
    a.addEventListener("canplaythrough", () => onOk(a), { once: true });
    a.addEventListener("error", () => onErr?.(), { once: true });
    return a;
  }

  runVoice = tryLoadAudio(
    RUN_VOICE_URL,
    (audio) => {
      runVoice = audio;
      runVoiceOk = true;
    },
    () => {
      runVoiceOk = false;
    }
  );
  bgm = tryLoadAudio(
    BGM_URL,
    (audio) => {
      bgm = audio;
      bgm.loop = true;
      bgm.volume = 0.22;
      bgmOk = true;
    },
    () => {
      bgmOk = false;
    }
  );
  runVoice?.load?.();
  bgm?.load?.();

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
    // Warm up media elements under direct user gesture.
    const warm = (audio) => {
      if (!audio) return;
      try {
        const p = audio.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            audio.pause();
            audio.currentTime = 0;
          }).catch(() => {});
        }
      } catch {}
    };
    warm(runVoice);
    if (enabled && bgmOk && !bgmStarted) {
      bgmStarted = true;
      bgm.play().catch(() => {});
    }
  }

  function beep(freq = 440, duration = 0.08, type = "sine", gain = 0.06) {
    if (!enabled || !ctx) return;
    if (ctx.state === "suspended") return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.start(t);
    o.stop(t + duration);
  }

  function speak(text) {
    if (!enabled || !("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.15;
    utter.pitch = text === "RUN" ? 1.25 : 0.9;
    utter.volume = 0.85;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  function playVoice(audio) {
    if (!audio) return false;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {});
      }
      return true;
    } catch {
      return false;
    }
  }

  function onRoleSwap(isRunner) {
    if (!enabled) return;
    if (!unlocked) return;
    if (isRunner) {
      if (runVoiceOk && playVoice(runVoice)) {
        // mp3 voice played
      } else {
        speak("RUN");
      }
      beep(740, 0.09, "triangle", 0.07);
    } else {
      // Chaser line uses browser speech only (no chase mp3 asset).
      speak("CHASE");
      beep(280, 0.13, "sawtooth", 0.06);
    }
  }

  function onTag() {
    unlock();
    beep(180, 0.11, "square", 0.08);
    setTimeout(() => beep(130, 0.1, "square", 0.06), 45);
  }

  function onCollect() {
    unlock();
    beep(540, 0.05, "triangle", 0.05);
    setTimeout(() => beep(760, 0.05, "triangle", 0.045), 35);
  }

  function setEnabled(next) {
    enabled = next;
    if (!enabled) {
      if (bgm) bgm.pause();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } else if (unlocked && bgmOk && bgm && !bgmStarted) {
      bgmStarted = true;
      bgm.play().catch(() => {});
    } else if (unlocked && bgmOk && bgm) {
      bgm.play().catch(() => {});
    }
  }

  function isEnabled() {
    return enabled;
  }

  function setBgmRate(nextRate) {
    if (!bgm) return;
    const clamped = Math.max(0.92, Math.min(1.2, nextRate));
    bgmRate = clamped;
    bgm.playbackRate = clamped;
    // Keep pitch musical when available.
    if ("preservesPitch" in bgm) bgm.preservesPitch = true;
    if ("mozPreservesPitch" in bgm) bgm.mozPreservesPitch = true;
    if ("webkitPreservesPitch" in bgm) bgm.webkitPreservesPitch = true;
  }

  function setBgmFromSpeedBonus(speedBonus = 0) {
    // 0 -> 1.00x, 0.55 -> ~1.16x
    const target = 1 + Math.max(0, Math.min(0.55, speedBonus)) * 0.29;
    // Light smoothing to avoid jitter on frequent updates.
    const smoothed = bgmRate + (target - bgmRate) * 0.25;
    setBgmRate(smoothed);
  }

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  return {
    onRoleSwap,
    onTag,
    onCollect,
    setEnabled,
    isEnabled,
    unlock,
    setBgmFromSpeedBonus,
  };
}
