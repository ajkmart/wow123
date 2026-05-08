let audioCtx: AudioContext | null = null;
let unlocked = false;
const activeNodes: Array<{ osc: OscillatorNode; gain: GainNode }> = [];

interface WindowWithWebkit extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

function getCtx(): AudioContext | null {
  if (!audioCtx) {
    try {
      const win = window as WindowWithWebkit;
      const AudioCtx = win.AudioContext || win.webkitAudioContext;
      if (!AudioCtx) return null;
      audioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.001);
  try { osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch {} }; } catch {}
  unlocked = true;
}

export function isAudioLocked(): boolean {
  if (unlocked) return false;
  const ctx = getCtx();
  if (!ctx) return false;
  return ctx.state === "suspended";
}

export function playOrderSound() {
  try {
    const ctx = getCtx();
    if (!ctx) { vibrateFallback(); return; }
    if (ctx.state === "suspended") { vibrateFallback(); return; }

    const now = ctx.currentTime;

    const playTone = (freq: number, start: number, dur: number, vol: number, type: OscillatorType = "sine") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      activeNodes.push({ osc, gain });
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(vol, now + start + 0.015);
      gain.gain.setValueAtTime(vol, now + start + dur * 0.7);
      gain.gain.linearRampToValueAtTime(0, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur);
      osc.onended = () => {
        const idx = activeNodes.findIndex(n => n.osc === osc);
        if (idx >= 0) activeNodes.splice(idx, 1);
        try { osc.disconnect(); gain.disconnect(); } catch {}
      };
    };

    playTone(660, 0,    0.12, 0.4, "square");
    playTone(880, 0.14, 0.12, 0.4, "square");
    playTone(1100, 0.28, 0.18, 0.35, "sine");
    playTone(660, 0.55, 0.12, 0.4, "square");
    playTone(880, 0.69, 0.12, 0.4, "square");
    playTone(1100, 0.83, 0.2,  0.3, "sine");
  } catch {
    vibrateFallback();
  }
}

function vibrateFallback() {
  try { navigator?.vibrate?.([200, 100, 200]); } catch {}
}

export function stopOrderSound() {
  while (activeNodes.length > 0) {
    const node = activeNodes.pop();
    if (!node) continue;
    try { node.osc.stop(); } catch {}
    try { node.osc.disconnect(); } catch {}
    try { node.gain.disconnect(); } catch {}
  }
}
