/**
 * Shooting stars for the first screen. They fall steeply, so the eye follows
 * them down the page. The first one lands in the scroll cue and lights it;
 * after that one falls every few seconds while the visitor is still at the top,
 * and every third lands in the cue again. Nothing runs once the page has moved,
 * while the tab is hidden, or with reduced motion (the caller skips us).
 */
interface Meteor {
  x0: number; y0: number; x1: number; y1: number;
  born: number; dur: number; len: number; land: boolean;
}

export interface MeteorOptions {
  /** True while stars may fall: at the top of the page, page visible. */
  active: () => boolean;
  /** Where a landing star should end, in CSS pixels, or null to skip landing. */
  target: () => { x: number; y: number } | null;
  /** Called when a landing star reaches the target. */
  onLand: () => void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function startMeteors(canvas: HTMLCanvasElement, opts: MeteorOptions): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const live: Meteor[] = [];
  let w = 0, h = 0, dpr = 1;
  let raf = 0, timer = 0, count = 0, stopped = false;

  const size = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };
  size();
  window.addEventListener('resize', size);

  const spawn = (land: boolean) => {
    const t = land ? opts.target() : null;
    const now = performance.now();
    if (t) {
      // Come in from the upper right at about 62 degrees and stop on the cue.
      const a = rand(58, 66) * (Math.PI / 180);
      const d = Math.min(h * 0.62, 560);
      live.push({ x0: t.x + Math.cos(a) * d, y0: t.y - Math.sin(a) * d, x1: t.x, y1: t.y, born: now, dur: 1250, len: rand(150, 190), land: true });
    } else {
      const a = rand(56, 72) * (Math.PI / 180);
      const d = rand(0.32, 0.5) * h;
      const x0 = rand(0.5, 1.02) * w;
      const y0 = rand(-0.04, 0.3) * h;
      live.push({ x0, y0, x1: x0 - Math.cos(a) * d, y1: y0 + Math.sin(a) * d, born: now, dur: rand(700, 1000), len: rand(110, 170), land: false });
    }
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (stopped) return;
      if (opts.active()) {
        count++;
        spawn(count === 1 || count % 3 === 1);
      }
      schedule(rand(4200, 8200));
    }, ms);
  };

  function frame(now: number) {
    raf = 0;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, w, h);
    for (let i = live.length - 1; i >= 0; i--) {
      const m = live[i];
      const p = Math.max(0, Math.min(1, (now - m.born) / m.dur));
      // Landing stars ease out so they settle into the thread; others fall.
      const e = m.land ? 1 - (1 - p) ** 2.2 : p ** 1.25;
      const x = m.x0 + (m.x1 - m.x0) * e;
      const y = m.y0 + (m.y1 - m.y0) * e;
      const dx = m.x1 - m.x0, dy = m.y1 - m.y0;
      const dl = Math.hypot(dx, dy) || 1;
      // The tail shortens as a landing star slows, so it arrives as a point.
      const tail = m.len * (m.land ? 1 - p * 0.85 : 1) * Math.min(1, p * 6);
      const tx = x - (dx / dl) * tail, ty = y - (dy / dl) * tail;
      const alpha = m.land ? Math.min(1, p * 5) : Math.min(1, p * 6) * Math.min(1, (1 - p) * 3.2);
      const g = ctx!.createLinearGradient(tx, ty, x, y);
      g.addColorStop(0, 'rgba(255, 217, 156, 0)');
      g.addColorStop(0.6, `rgba(255, 224, 178, ${0.5 * alpha})`);
      g.addColorStop(1, `rgba(255, 250, 238, ${0.95 * alpha})`);
      ctx!.strokeStyle = g;
      ctx!.lineWidth = 2;
      ctx!.lineCap = 'round';
      ctx!.beginPath();
      ctx!.moveTo(tx, ty);
      ctx!.lineTo(x, y);
      ctx!.stroke();
      const glow = ctx!.createRadialGradient(x, y, 0, x, y, 13);
      glow.addColorStop(0, `rgba(255, 246, 224, ${0.9 * alpha})`);
      glow.addColorStop(1, 'rgba(255, 200, 130, 0)');
      ctx!.fillStyle = glow;
      ctx!.beginPath();
      ctx!.arc(x, y, 13, 0, Math.PI * 2);
      ctx!.fill();
      if (p >= 1) {
        live.splice(i, 1);
        if (m.land) opts.onLand();
      }
    }
    if (live.length) raf = requestAnimationFrame(frame);
  }

  schedule(900);
  return () => {
    stopped = true;
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', size);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}
