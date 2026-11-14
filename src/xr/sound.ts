/**
 * Procedural spatial sound: every cue is synthesised with WebAudio, so there
 * are no audio assets to license and nothing to download. Sounds are placed
 * in 3D with an HRTF panner at the tile that made them.
 */
type V3 = { x: number; y: number; z: number };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setMuted(m: boolean): void {
  muted = m;
}

/** Keep the listener glued to the head (call once per frame from a system). */
export function updateListener(pos: V3, fwd: V3, up: V3): void {
  if (!ctx) return;
  const l = ctx.listener;
  const t = ctx.currentTime;
  if (l.positionX) {
    l.positionX.setValueAtTime(pos.x, t);
    l.positionY.setValueAtTime(pos.y, t);
    l.positionZ.setValueAtTime(pos.z, t);
    l.forwardX.setValueAtTime(fwd.x, t);
    l.forwardY.setValueAtTime(fwd.y, t);
    l.forwardZ.setValueAtTime(fwd.z, t);
    l.upX.setValueAtTime(up.x, t);
    l.upY.setValueAtTime(up.y, t);
    l.upZ.setValueAtTime(up.z, t);
  }
}

function out(at?: V3): AudioNode | null {
  const a = audio();
  if (!a || !master) return null;
  if (!at) return master;
  const p = a.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 0.6;
  p.positionX.value = at.x;
  p.positionY.value = at.y;
  p.positionZ.value = at.z;
  p.connect(master);
  return p;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, dest: AudioNode, glideTo?: number) {
  const a = ctx!;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.05);
}

/** Soft pluck when a memory lands on a surface; pitch climbs along the route. */
export function playLand(at: V3, step: number): void {
  const dest = out(at);
  if (!dest || !ctx) return;
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26];
  const f = 392 * Math.pow(2, scale[step % scale.length] / 12);
  const t = ctx.currentTime;
  tone(f, t, 0.35, 'triangle', 0.22, dest);
  tone(f * 2, t, 0.18, 'sine', 0.06, dest);
}

/** Bright three-note chime: recalled. */
export function playSuccess(at: V3): void {
  const dest = out(at);
  if (!dest || !ctx) return;
  const t = ctx.currentTime;
  [659.25, 830.61, 987.77].forEach((f, i) => tone(f, t + i * 0.07, 0.5, 'sine', 0.2, dest));
  tone(1975.5, t + 0.21, 0.6, 'sine', 0.05, dest);
}

/** Low, short, not punishing: forgot, it'll come back soon. */
export function playAgain(at: V3): void {
  const dest = out(at);
  if (!dest || !ctx) return;
  const t = ctx.currentTime;
  tone(220, t, 0.28, 'triangle', 0.22, dest, 150);
  tone(110, t, 0.3, 'sine', 0.18, dest);
}

/** Paper-flip tick when a tile changes face. */
export function playFlip(at: V3): void {
  const dest = out(at);
  if (!dest || !ctx) return;
  tone(1200, ctx.currentTime, 0.06, 'square', 0.04, dest, 700);
}

/** Rising whoosh as a palace is built. */
export function playBuild(): void {
  const dest = out();
  if (!dest || !ctx) return;
  const a = ctx;
  const t = a.currentTime;
  const len = 0.9;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(3200, t + len);
  f.Q.value = 1.4;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.25, t + len * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(dest);
  src.start(t);
}

/** Gentle UI tick for hub buttons. */
export function playClick(): void {
  const dest = out();
  if (!dest || !ctx) return;
  tone(880, ctx.currentTime, 0.05, 'sine', 0.08, dest);
}
