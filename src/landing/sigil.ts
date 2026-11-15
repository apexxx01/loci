/**
 * Every memory gets its own small constellation, drawn from its words. The
 * same text always gives the same shape, so a memory keeps its sigil on the
 * page, in the library and on the tile in the sky room. It replaces emoji on
 * the website: the picture hook lives in the scene sentence; the sigil is the
 * memory's face.
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SigilShape {
  /** Points in a unit box (0..1). */
  pts: [number, number][];
  /** Index pairs joined by a line. */
  edges: [number, number][];
  /** Index of the brightest star. */
  lead: number;
}

export function sigilShape(text: string): SigilShape {
  const r = rng(hash(text.trim().toLowerCase() || 'loci'));
  const n = 4 + Math.floor(r() * 3);
  const pts: [number, number][] = [];
  let guard = 0;
  while (pts.length < n && guard++ < 300) {
    const a = r() * Math.PI * 2;
    const d = 0.12 + Math.sqrt(r()) * 0.36;
    const p: [number, number] = [0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d];
    if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.2)) pts.push(p);
  }
  // A walk through the stars, nearest first, so the line never tangles much.
  const order = [0];
  const left = new Set(pts.map((_, i) => i).slice(1));
  while (left.size) {
    const last = pts[order[order.length - 1]];
    let best = -1, bd = 9;
    for (const i of left) {
      const d = Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]);
      if (d < bd) [best, bd] = [i, d];
    }
    order.push(best);
    left.delete(best);
  }
  const edges: [number, number][] = order.slice(1).map((v, i) => [order[i], v]);
  if (pts.length > 4 && r() < 0.6) edges.push([order[1], order[order.length - 1]]);
  return { pts, edges, lead: order[Math.floor(r() * order.length)] };
}

/** An SVG sigil. `size` is the drawn size in px. */
export function sigilSVG(text: string, size = 64, cls = 'sigil'): string {
  const { pts, edges, lead } = sigilShape(text);
  const P = (v: number) => (6 + v * 88).toFixed(1);
  return `<svg class="${cls}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
    ${edges.map(([a, b]) => `<line x1="${P(pts[a][0])}" y1="${P(pts[a][1])}" x2="${P(pts[b][0])}" y2="${P(pts[b][1])}"/>`).join('')}
    ${pts.map((p, i) => `<circle cx="${P(p[0])}" cy="${P(p[1])}" r="${i === lead ? 4.2 : 2.6}"${i === lead ? ' class="lead"' : ''}/>`).join('')}
  </svg>`;
}

/** Draw a sigil onto a 2D canvas, centred at (cx, cy) inside a box of `size`. */
export function drawSigil(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number): void {
  const { pts, edges, lead } = sigilShape(text);
  const X = (v: number) => cx + (v - 0.5) * size;
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,214,160,0.55)';
  g.lineWidth = size * 0.012;
  g.beginPath();
  for (const [a, b] of edges) {
    g.moveTo(X(pts[a][0]), X(pts[a][1]) - cx + cy);
    g.lineTo(X(pts[b][0]), X(pts[b][1]) - cx + cy);
  }
  g.stroke();
  pts.forEach((p, i) => {
    const x = X(p[0]), y = X(p[1]) - cx + cy;
    const rad = size * (i === lead ? 0.05 : 0.032);
    const glow = g.createRadialGradient(x, y, 0, x, y, rad * 4);
    glow.addColorStop(0, 'rgba(255,226,189,0.9)');
    glow.addColorStop(1, 'rgba(255,201,138,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(x, y, rad * 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff6e8';
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  });
  g.restore();
}
