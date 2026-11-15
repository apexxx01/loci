/**
 * Optional sound for the landing page, synthesised with WebAudio: a slow warm
 * drone, and now and then a soft bell from a pentatonic scale, as if a star
 * rang. Breathing opens and closes the drone. Off until the visitor asks.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let echo: GainNode | null = null;
let bellTimer = 0;

// D major pentatonic, two octaves up from the drone.
const BELLS = [587.33, 659.25, 739.99, 880, 987.77, 1174.66, 1318.51];

export function ambientOn(): boolean {
  return Boolean(master && master.gain.value > 0.001);
}

function build(): boolean {
  try {
    ctx = new AudioContext();
  } catch {
    return false;
  }
  master = ctx.createGain();
  master.gain.value = 0;
  filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 260;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();
  // D major add9, spread over three octaves, gently detuned.
  for (const [f, g] of [[73.42, 0.35], [146.83, 0.5], [220, 0.4], [293.66, 0.3], [369.99, 0.2], [440, 0.14]] as const) {
    for (const detune of [-6, 5]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = detune;
      const og = ctx.createGain();
      og.gain.value = g * 0.5;
      o.connect(og).connect(filter);
      o.start();
    }
  }
  filter.connect(master);
  // A long, soft echo gives the bells somewhere to ring.
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.48;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  echo = ctx.createGain();
  echo.gain.value = 1;
  echo.connect(master);
  echo.connect(delay);
  delay.connect(tone).connect(fb).connect(delay);
  tone.connect(master);
  master.connect(ctx.destination);
  return true;
}

function bell(freq: number, level = 0.12, at = 0): void {
  if (!ctx || !echo) return;
  const t = ctx.currentTime + at;
  for (const [mult, g] of [[1, 1], [2.76, 0.18], [5.4, 0.05]] as const) {
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(level * g, t + 0.02);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 3.2 / mult);
    o.connect(gn).connect(echo);
    o.start(t);
    o.stop(t + 3.4);
  }
}

function scheduleBells(): void {
  clearTimeout(bellTimer);
  if (!ambientOn()) return;
  bell(BELLS[Math.floor(Math.random() * BELLS.length)], 0.05 + Math.random() * 0.05);
  bellTimer = window.setTimeout(scheduleBells, 5000 + Math.random() * 7000);
}

export function toggleAmbient(): boolean {
  if (!ctx && !build()) return false;
  void ctx!.resume();
  const on = !ambientOn();
  master!.gain.cancelScheduledValues(ctx!.currentTime);
  master!.gain.setTargetAtTime(on ? 0.1 : 0, ctx!.currentTime, on ? 1.2 : 0.3);
  if (on) bellTimer = window.setTimeout(scheduleBells, 2500);
  else clearTimeout(bellTimer);
  return on;
}

/** 0..1 breath: the drone opens as you breathe in. */
export function breatheTone(v: number): void {
  if (!ctx || !filter || !ambientOn()) return;
  filter.frequency.setTargetAtTime(600 + v * 1100, ctx.currentTime, 0.4);
}

/** A small bell for a moment worth marking (a recall, a palace built). Only when sound is on. */
export function chime(kind: 'good' | 'soft' = 'good'): void {
  if (!ambientOn()) return;
  if (kind === 'good') {
    bell(880, 0.09);
    bell(1318.51, 0.06, 0.12);
  } else bell(587.33, 0.07);
}

export function stopAmbient(): void {
  clearTimeout(bellTimer);
  if (ctx && master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
}
