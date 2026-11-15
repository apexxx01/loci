/**
 * Charts drawn in the page's own language: stars. A share becomes a field of
 * stars where the lit ones are the people (or words) that count, and a curve
 * becomes a trail of stars across the night. Every number is the real one.
 */
import { forgettingCurves } from '../core/forecast.js';

/** A field of `total` stars, the first `lit` of them alight, filled row by row. */
export function starField(lit: number, total: number, cols: number, tone: 'candle' | 'lilac' | 'star', label: string): string {
  const gap = 15;
  const rows = Math.ceil(total / cols);
  const W = cols * gap, H = rows * gap;
  const dots: string[] = [];
  for (let i = 0; i < total; i++) {
    const x = (i % cols) * gap + gap / 2;
    const y = Math.floor(i / cols) * gap + gap / 2;
    dots.push(i < lit
      ? `<circle class="sf-on" cx="${x}" cy="${y}" r="2.7" style="--d:${(i * 16) % 1600}ms"/>`
      : `<circle class="sf-off" cx="${x}" cy="${y}" r="1.6"/>`);
  }
  return `<svg class="starfield starfield--${tone}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${dots.join('')}</svg>`;
}

const sparkle = (x: number, y: number, r: number) =>
  `<path class="sc-spark" d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r}Z"/>`;

/** The forgetting curve, learned once against recalled on schedule, as two trails of stars. */
export function curveStars(): { svg: string; caption: string } {
  const { points, reviews } = forgettingCurves(60, 0.5);
  const W = 560, H = 230, L = 10, R = 548, T = 26, B = 196;
  const X = (d: number) => L + (d / 60) * (R - L);
  const Y = (v: number) => T + ((1 - Math.max(0.4, v)) / 0.6) * (B - T);
  const once: string[] = [];
  const spaced: string[] = [];
  points.forEach((p, i) => {
    if (i % 2 === 0) once.push(`<circle class="sc-once" cx="${X(p.day).toFixed(1)}" cy="${Y(p.once).toFixed(1)}" r="1.5" style="--d:${i * 9}ms"/>`);
    spaced.push(`<circle class="sc-spaced" cx="${X(p.day).toFixed(1)}" cy="${Y(p.spaced).toFixed(1)}" r="${i % 3 === 0 ? 2.1 : 1.4}" style="--d:${i * 9}ms"/>`);
  });
  const last = points[points.length - 1];
  const floor = Math.min(...points.map((p) => p.spaced));
  const sparks = reviews.map((d) => {
    const v = points.find((p) => p.day >= d)?.spaced ?? 0.9;
    return sparkle(X(d), Y(v), 9);
  });
  const svg = `<svg class="curve-stars" viewBox="0 0 ${W} ${H}" role="img" aria-label="Over 60 days, a memory learned once fades to about ${Math.round(last.once * 100)} percent; recalled ${reviews.length} times on schedule it stays above ${Math.floor(floor * 100)} percent">
    ${once.join('')}${spaced.join('')}${sparks.join('')}
    <text class="sc-lab sc-lab--spaced" x="${R}" y="${Y(last.spaced) - 16}" text-anchor="end">recalled on schedule, ${Math.round(last.spaced * 100)}%</text>
    <text class="sc-lab" x="${R}" y="${Y(last.once) + 24}" text-anchor="end">learned once, ${Math.round(last.once * 100)}%</text>
    <text class="sc-axis" x="${L}" y="${H - 4}">today</text>
    <text class="sc-axis" x="${R}" y="${H - 4}" text-anchor="end">two months</text>
  </svg>`;
  const caption = `The sparkles are the ${reviews.length} short recalls Loci schedules. Forecast from the same model the app uses; an estimate, not a measurement of you.`;
  return { svg, caption };
}
