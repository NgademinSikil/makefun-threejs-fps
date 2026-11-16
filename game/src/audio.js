// Synthesised sound effects: plain Web Audio, no audio files and no network.
// Everything is built from oscillators and filtered noise, so the game stays
// fully offline. Created lazily on the first user gesture; silent until then.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(dur, filterFreq, gainVal, type = 'lowpass') {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  function tone(freq, dur, type, gainVal, slideTo = 0) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'dmr') { noise(0.28, 900, 0.9); tone(160, 0.16, 'square', 0.25, 60); }
      else if (kind === 'shotgun') { noise(0.3, 700, 1.0); tone(120, 0.2, 'sawtooth', 0.3, 50); }
      else if (kind === 'smg') { noise(0.09, 1800, 0.5); tone(220, 0.07, 'square', 0.16, 90); }
      else if (kind === 'pistol') { noise(0.12, 1400, 0.6); tone(200, 0.09, 'square', 0.2, 80); }
      else { noise(0.14, 1200, 0.7); tone(180, 0.1, 'sawtooth', 0.22, 70); }
    },
    distantShot() { noise(0.12, 500, 0.16); },
    dry() { tone(1200, 0.04, 'square', 0.12); },
    reload() { tone(500, 0.07, 'square', 0.12); setTimeout(() => tone(700, 0.07, 'square', 0.12), 180); },
    hit() { tone(1400, 0.06, 'sine', 0.25); },
    kill() { tone(880, 0.09, 'sine', 0.25); setTimeout(() => tone(1320, 0.12, 'sine', 0.25), 90); },
    hurt() { tone(140, 0.18, 'sawtooth', 0.3, 70); noise(0.15, 400, 0.25); },
    explosion() {
      noise(0.9, 300, 1.0);
      tone(70, 0.7, 'sine', 0.6, 30);
    },
    beep() { tone(1050, 0.12, 'sine', 0.22); },
    plant() { tone(660, 0.1, 'sine', 0.2); setTimeout(() => tone(990, 0.14, 'sine', 0.2), 120); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.25), i * 140)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.22), i * 160)); },
    buy() { tone(980, 0.08, 'sine', 0.2); setTimeout(() => tone(1240, 0.1, 'sine', 0.2), 80); },
    denied() { tone(220, 0.15, 'square', 0.18, 160); },
  };
}
