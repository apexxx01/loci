/**
 * Draws a memory tile face onto a 2D canvas. Pure canvas code (no Three.js) so
 * the same art renders on the headset, in the emulator and in screenshots.
 */
import type { MemoryItem } from '../core/types.js';

export const TILE_PX = { w: 512, h: 640 } as const;

export type FaceKind = 'cue' | 'hint' | 'answer';

export interface FaceStyle {
  due: boolean;
  /** 1-based number shown for ordered decks; 0 hides the badge. */
  badge: number;
  /** Next review label for rested tiles, e.g. "in 2d". */
  restLabel: string;
  /** Short real-world label, e.g. "table". */
  surfaceLabel: string;
}

const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
const UI_FONT = '"Inter","Segoe UI","Roboto","Helvetica Neue",Arial,sans-serif';

const C = {
  ink: '#f6f4ff',
  inkSoft: '#cfc9ea',
  inkDim: '#9c96b8',
  violet: '#8b6cff',
  violetHi: '#c2b3ff',
  mint: '#5ee3b0',
  glassTop: 'rgba(30, 26, 52, 0.94)',
  glassBot: 'rgba(14, 12, 26, 0.94)',
  restTop: 'rgba(36, 36, 44, 0.86)',
  restBot: 'rgba(20, 20, 26, 0.86)',
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Greedy word wrap; shrinks the font until the text fits `maxLines`. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  startPx: number,
  minPx: number,
  weight: number,
): { lines: string[]; px: number } {
  for (let px = startPx; px >= minPx; px -= 2) {
    ctx.font = `${weight} ${px}px ${UI_FONT}`;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxWidth)) {
      return { lines, px };
    }
  }
  ctx.font = `${weight} ${minPx}px ${UI_FONT}`;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) line = next;
    else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  lines.push(`${line}…`);
  return { lines: lines.slice(0, maxLines), px: minPx };
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], px: number, cx: number, top: number, lh = 1.22) {
  lines.forEach((l, i) => ctx.fillText(l, cx, top + i * px * lh));
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  item: MemoryItem,
  face: FaceKind,
  style: FaceStyle,
): void {
  const { w, h } = TILE_PX;
  ctx.clearRect(0, 0, w, h);
  const pad = 14;
  const r = 56;

  // Outer glow ring when due.
  if (style.due) {
    ctx.save();
    ctx.shadowColor = 'rgba(139, 108, 255, 0.85)';
    ctx.shadowBlur = 28;
    roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r);
    ctx.strokeStyle = C.violet;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
  }

  // Glass body.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, style.due ? C.glassTop : C.restTop);
  g.addColorStop(1, style.due ? C.glassBot : C.restBot);
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = style.due ? C.violetHi : 'rgba(255,255,255,0.18)';
  ctx.stroke();

  // Top sheen.
  const sheen = ctx.createLinearGradient(0, pad, 0, h * 0.4);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, pad + 3, pad + 3, w - pad * 2 - 6, h * 0.38, r - 4);
  ctx.fillStyle = sheen;
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const cx = w / 2;

  // Badge (route position).
  if (style.badge > 0) {
    ctx.beginPath();
    ctx.arc(78, 78, 34, 0, Math.PI * 2);
    ctx.fillStyle = style.due ? C.violet : 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = `800 34px ${UI_FONT}`;
    ctx.fillText(String(style.badge), 78, 90);
  }

  // Surface chip, top-right: ties the memory to the real object.
  if (style.surfaceLabel) {
    ctx.font = `600 22px ${UI_FONT}`;
    const label = style.surfaceLabel.toUpperCase();
    const tw = ctx.measureText(label).width + 28;
    roundRect(ctx, w - pad - 24 - tw, 56, tw, 40, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.fillStyle = C.inkSoft;
    ctx.fillText(label, w - pad - 24 - tw / 2, 84);
  }

  if (face === 'cue') {
    // Glyphs.
    const glyphs = item.glyphs.slice(0, 3);
    const size = glyphs.length === 1 ? 190 : glyphs.length === 2 ? 150 : 124;
    ctx.font = `${size}px ${EMOJI_FONT}`;
    const gap = size * 1.05;
    const startX = cx - ((glyphs.length - 1) * gap) / 2;
    glyphs.forEach((gl, i) => ctx.fillText(gl, startX + i * gap, 300));

    ctx.fillStyle = C.ink;
    const cue = fitText(ctx, item.cue, w - 90, 2, 58, 34, 800);
    drawLines(ctx, cue.lines, cue.px, cx, 430);

    ctx.fillStyle = style.due ? C.violetHi : C.inkDim;
    ctx.font = `600 24px ${UI_FONT}`;
    ctx.fillText(style.due ? 'recall it, then pinch to peek' : `rested · ${style.restLabel}`, cx, h - 58);
  } else if (face === 'hint') {
    ctx.font = `110px ${EMOJI_FONT}`;
    ctx.fillText(item.glyphs.slice(0, 3).join(''), cx, 230);
    ctx.fillStyle = C.inkSoft;
    ctx.font = `700 24px ${UI_FONT}`;
    ctx.fillText('PICTURE THIS', cx, 290);
    ctx.fillStyle = C.ink;
    const scene = fitText(ctx, item.scene, w - 90, 6, 34, 24, 500);
    drawLines(ctx, scene.lines, scene.px, cx, 345);
    ctx.fillStyle = C.violetHi;
    ctx.font = `600 24px ${UI_FONT}`;
    ctx.fillText('pinch again for the answer', cx, h - 58);
  } else {
    ctx.fillStyle = C.inkSoft;
    const cue = fitText(ctx, item.cue, w - 120, 1, 36, 24, 700);
    drawLines(ctx, cue.lines, cue.px, cx, 170);
    ctx.fillStyle = C.mint;
    ctx.font = `700 22px ${UI_FONT}`;
    ctx.fillText('ANSWER', cx, 215);
    ctx.fillStyle = C.ink;
    const ans = fitText(ctx, item.answer, w - 80, 5, 46, 28, 750);
    const blockH = ans.lines.length * ans.px * 1.22;
    drawLines(ctx, ans.lines, ans.px, cx, 250 + (250 - blockH) / 2 + ans.px);
    ctx.fillStyle = C.violetHi;
    ctx.font = `600 23px ${UI_FONT}`;
    ctx.fillText('grab it: raise UP = knew it · DOWN = again', cx, h - 58);
  }
}
