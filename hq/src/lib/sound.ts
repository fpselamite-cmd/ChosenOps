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
};
