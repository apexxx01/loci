/**
 * Optional ambient bed for the landing page: a slow, warm chord synthesised
 * with WebAudio. Off until the visitor asks for it.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function ambientOn(): boolean {
  return Boolean(master && master.gain.value > 0.001);
}

export function toggleAmbient(): boolean {
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    // D major add9, spread over three octaves, gently detuned.
    for (const [f, g] of [[146.83, 0.5], [220, 0.4], [293.66, 0.32], [369.99, 0.22], [440, 0.16], [659.25, 0.07]] as const) {
      for (const detune of [-5, 6]) {
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
    filter.connect(master).connect(ctx.destination);
  }
  void ctx.resume();
  const on = !ambientOn();
  master!.gain.cancelScheduledValues(ctx.currentTime);
  master!.gain.setTargetAtTime(on ? 0.09 : 0, ctx.currentTime, on ? 1.2 : 0.3);
  return on;
}

export function stopAmbient(): void {
  if (ctx && master) master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
}
