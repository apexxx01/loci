/**
 * Draws a memory tile face onto a 2D canvas. Pure canvas code (no Three.js) so
 * the same art renders on the headset, in the emulator and in screenshots.
 */
import type { MemoryItem } from '../core/types.js';

export const TILE_PX = { w: 512, h: 640 } as const;

export type FaceKind = 'cue' | 'hint' | 'answer' | 'learn';

export interface FaceStyle {
  due: boolean;
  /** 1-based number shown for ordered decks; 0 hides the badge. */
  badge: number;
  /** Next review label for rested tiles, e.g. "in 2d". */
  restLabel: string;
  /** Short real-world label, e.g. "table". */
  surfaceLabel: string;
  /** High-contrast rendering (accessibility). */
  contrast?: boolean;
  /** Look-to-select mode: tells the learner how to act without pinching. */
  dwell?: boolean;
  /** Stable in long-term memory (FSRS stability of several days). */
  mastered?: boolean;
  /** Mastered memories hide their cue: only the place prompts you. */
  blind?: boolean;
}

const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
const UI_FONT = '"Inter","Segoe UI","Roboto","Helvetica Neue",Arial,sans-serif';

const C = {
  ink: '#f6f4ff',
  inkSoft: '#cfc9ea',
  inkDim: '#9c96b8',
  violet: '#ffcf7a',
  violetHi: '#ffe3ae',
  mint: '#7ef0c4',
  glassTop: 'rgba(22, 19, 40, 0.95)',
  glassBot: 'rgba(7, 6, 16, 0.95)',
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
    ctx.shadowColor = 'rgba(255, 207, 122, 0.85)';
    ctx.shadowBlur = 28;
    roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r);
    ctx.strokeStyle = C.violet;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();
  }

  // Glass body (or solid black in high-contrast mode).
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, r);
  if (style.contrast) {
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = style.due ? '#ffd400' : '#ffffff';
    ctx.stroke();
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, style.due ? C.glassTop : C.restTop);
    g.addColorStop(1, style.due ? C.glassBot : C.restBot);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = style.mastered && !style.due ? 5 : 3;
    ctx.strokeStyle = style.due ? C.violetHi : style.mastered ? '#ffd36b' : 'rgba(255,255,255,0.18)';
    ctx.stroke();
  }

  // Top sheen.
  if (!style.contrast) {
  const sheen = ctx.createLinearGradient(0, pad, 0, h * 0.4);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, pad + 3, pad + 3, w - pad * 2 - 6, h * 0.38, r - 4);
  ctx.fillStyle = sheen;
  ctx.fill();
  }
  const ink = style.contrast ? '#ffffff' : C.ink;
  const inkSoft = style.contrast ? '#ffffff' : C.inkSoft;
  const accent = style.contrast ? '#ffd400' : C.violetHi;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const cx = w / 2;

  // Badge (route position).
  if (style.badge > 0) {
    ctx.beginPath();
    ctx.arc(78, 78, 34, 0, Math.PI * 2);
    ctx.fillStyle = style.due ? C.violet : 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.fillStyle = ink;
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
    ctx.fillStyle = inkSoft;
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

    ctx.fillStyle = ink;
    const cueText = style.blind ? `What lives ${style.surfaceLabel ? `on your ${style.surfaceLabel}` : 'here'}?` : item.cue;
    const cue = fitText(ctx, cueText, w - 90, 2, style.blind ? 44 : 58, 30, 800);
    drawLines(ctx, cue.lines, cue.px, cx, 430);

    ctx.fillStyle = style.due ? accent : C.inkDim;
    ctx.font = `600 24px ${UI_FONT}`;
    if (!style.due && style.mastered) ctx.fillStyle = '#ffd36b';
    ctx.fillText(
      style.due
        ? style.dwell ? 'recall it, then look here to peek' : 'recall it, then pinch to peek'
        : `${style.mastered ? '★ mastered' : 'rested'} · back ${style.restLabel}`,
      cx,
      h - 58,
    );
  } else if (face === 'learn') {
    // First meeting: cue, answer and picture together, to study before testing.
    ctx.font = `96px ${EMOJI_FONT}`;
    ctx.fillText(item.glyphs.slice(0, 3).join(''), cx, 200);
    ctx.fillStyle = ink;
    const cue = fitText(ctx, item.cue, w - 90, 1, 46, 28, 800);
    drawLines(ctx, cue.lines, cue.px, cx, 268);
    ctx.fillStyle = style.contrast ? '#ffffff' : C.mint;
    const ans = fitText(ctx, item.answer, w - 80, 3, 32, 24, 700);
    drawLines(ctx, ans.lines, ans.px, cx, 318);
    ctx.fillStyle = inkSoft;
    const scene = fitText(ctx, item.scene, w - 90, 4, 26, 21, 500);
    drawLines(ctx, scene.lines, scene.px, cx, 318 + ans.lines.length * ans.px * 1.22 + 26);
    ctx.fillStyle = accent;
    ctx.font = `600 23px ${UI_FONT}`;
    ctx.fillText(style.dwell ? 'new: picture it here, then look to hide' : 'new: picture it here, then pinch to hide', cx, h - 58);
  } else if (face === 'hint') {
    ctx.font = `110px ${EMOJI_FONT}`;
    ctx.fillText(item.glyphs.slice(0, 3).join(''), cx, 230);
    ctx.fillStyle = inkSoft;
    ctx.font = `700 24px ${UI_FONT}`;
    ctx.fillText('PICTURE THIS', cx, 290);
    ctx.fillStyle = ink;
    const scene = fitText(ctx, item.scene, w - 90, 6, 34, 24, 500);
    drawLines(ctx, scene.lines, scene.px, cx, 345);
    ctx.fillStyle = accent;
    ctx.font = `600 24px ${UI_FONT}`;
    ctx.fillText(style.dwell ? 'keep looking for the answer' : 'pinch again for the answer', cx, h - 58);
  } else {
    ctx.fillStyle = inkSoft;
    const cue = fitText(ctx, item.cue, w - 120, 1, 36, 24, 700);
    drawLines(ctx, cue.lines, cue.px, cx, 170);
    ctx.fillStyle = C.mint;
    ctx.font = `700 22px ${UI_FONT}`;
    ctx.fillText('ANSWER', cx, 215);
    ctx.fillStyle = ink;
    const ans = fitText(ctx, item.answer, w - 80, 5, 46, 28, 750);
    const blockH = ans.lines.length * ans.px * 1.22;
    drawLines(ctx, ans.lines, ans.px, cx, 250 + (250 - blockH) / 2 + ans.px);
    ctx.fillStyle = accent;
    ctx.font = `600 23px ${UI_FONT}`;
    ctx.fillText(style.dwell ? 'look at a button below to rate' : 'grab it: raise UP = knew it · DOWN = again', cx, h - 58);
  }
}
