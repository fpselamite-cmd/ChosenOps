/** Little casino sounds, made on the fly with WebAudio (no files). Muted per device. */
const KEY = 'chosenops.casino.muted';
let ctx: AudioContext | null = null;
export const isMuted = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
export const setMuted = (m: boolean) => {
  try {
    localStorage.setItem(KEY, m ? '1' : '0');
  } catch {
    /* private window */
  }
  if (m) ambience.stop();
};

// ---------- fast play ----------
// Shortens every casino animation (remembered per device).
const FAST = 'chosenops.casino.fast';
let fast = (() => {
  try {
    return localStorage.getItem(FAST) === '1';
  } catch {
    return false;
  }
})();
const fastListeners = new Set<(f: boolean) => void>();
export const isFast = () => fast;
export const setFast = (f: boolean) => {
  fast = f;
  try {
    localStorage.setItem(FAST, f ? '1' : '0');
  } catch {
    /* private window */
  }
  fastListeners.forEach((l) => l(f));
};
export const onFast = (l: (f: boolean) => void) => (fastListeners.add(l), () => void fastListeners.delete(l));
/** An animation length, cut short in fast play (and for people who ask for less motion). */
export const pace = (ms: number) => {
  const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return fast || calm ? Math.round(ms * 0.25) : ms;
};
function ac() {
  if (isMuted()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur);
}
function noise(dur: number, vol = 0.2, delay = 0, hp = 1500) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}
export const sfx = {
  chip: () => (noise(0.05, 0.25, 0, 3000), tone(2400, 0.04, 'triangle', 0.05)),
  card: () => noise(0.08, 0.3, 0, 800),
  tick: () => tone(1800, 0.02, 'square', 0.03),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, i * 0.09)),
  lose: () => (tone(220, 0.25, 'sawtooth', 0.05), tone(165, 0.35, 'sawtooth', 0.05, 0.15)),
  jackpot: () => [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => (tone(f, 0.4, 'triangle', 0.12, i * 0.08), noise(0.05, 0.1, i * 0.08, 4000))),
  reel: () => tone(300, 0.06, 'square', 0.04),
  /** Chips swept off the table by the dealer. */
  rake: () => (noise(0.18, 0.12, 0, 1200), noise(0.06, 0.1, 0.12, 3000)),
  /** A stack of chips pushed your way. */
  payout: () => [0, 0.05, 0.1, 0.16].forEach((d) => noise(0.05, 0.2, d, 3200)),
  /** The slot lever's ratchet. */
  lever: () => [0, 0.05, 0.1, 0.15, 0.2].forEach((d) => tone(180 - d * 200, 0.04, 'square', 0.05, d)),
  /** A drum roll while the last reel teases a jackpot. */
  tease: (secs = 1.2) => {
    for (let t = 0; t < secs; t += 0.06) noise(0.05, 0.05 + (t / secs) * 0.08, t, 200);
  },
  /** The ball clattering round the wheel. */
  ball: () => (tone(2600, 0.02, 'triangle', 0.03), tone(3100, 0.02, 'triangle', 0.02, 0.03)),
  coin: () => tone(2200 + Math.random() * 800, 0.08, 'triangle', 0.05),
};

// ---------- the room ----------
// A low jazz-club murmur, the odd glass clink and a far-off piano, while you're in the casino.
let room: { stop: () => void } | null = null;
export const ambience = {
  start() {
    if (room) return;
    const c = ac();
    if (!c) return;
    const out = c.createGain();
    out.gain.value = 0;
    out.gain.linearRampToValueAtTime(0.5, c.currentTime + 2);
    out.connect(c.destination);
    // Murmur: brown noise through a band-pass that drifts like voices.
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.8;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(band.frequency);
    const murmur = c.createGain();
    murmur.gain.value = 0.05;
    src.connect(band).connect(murmur).connect(out);
    src.start();
    lfo.start();
    // Now and then: a glass clink, or a soft piano chord from across the room.
    const chords = [
      [220, 277, 330, 415],
      [196, 247, 294, 370],
      [175, 220, 262, 330],
      [165, 208, 247, 311],
    ];
    let k = 0;
    const note = (f: number, at: number, vol: number, dur: number) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(out);
      o.start(at);
      o.stop(at + dur);
    };
    const timer = setInterval(() => {
      if (isMuted()) return;
      const t = c.currentTime + 0.05;
      if (Math.random() < 0.35) [3200, 4100].forEach((f, i) => note(f + Math.random() * 300, t + i * 0.04, 0.012, 0.5));
      if (Math.random() < 0.5) {
        const ch = chords[k++ % chords.length]!;
        ch.forEach((f, i) => note(f, t + i * 0.03, 0.01, 2.4));
      }
    }, 2600);
    room = {
      stop() {
        clearInterval(timer);
        out.gain.linearRampToValueAtTime(0, c.currentTime + 0.6);
        setTimeout(() => {
          try {
            src.stop();
            lfo.stop();
          } catch {
            /* already stopped */
          }
          out.disconnect();
        }, 800);
        room = null;
      },
    };
  },
  stop() {
    room?.stop();
  },
};
