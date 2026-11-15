/**
 * Draws a memory tile face onto a 2D canvas. Pure canvas code (no Three.js) so
 * the same art renders on the headset, in the emulator and in screenshots.
 */
import type { MemoryItem } from '../core/types.js';

export const TILE_PX = { w: 512, h: 640 } as const;

export type FaceKind = 'cue' | 'hint' | 'answer' | 'learn' | 'check';

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
  /** A stage of a concept: drawn as teaching, with a myth check on recall. */
  concept?: boolean;
  /** Result of the last myth check, shown on the answer face. */
  lastCheck?: 'right' | 'wrong';
  /** Wrong statement drawn as A (left). */
  wrongFirst?: boolean;
  /** Name of the next stage, for the thread line at the bottom. */
  next?: string;
}

const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
const UI_FONT = '"Lexend Variable","Lexend","Segoe UI","Roboto","Helvetica Neue",Arial,sans-serif';
const DISPLAY_FONT = '"Marcellus","Georgia",serif';

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
  family: string = UI_FONT,
): { lines: string[]; px: number } {
  for (let px = startPx; px >= minPx; px -= 2) {
    ctx.font = `${weight} ${px}px ${family}`;
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
  ctx.font = `${weight} ${minPx}px ${family}`;
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

  if (style.concept) {
    drawConcept(ctx, item, face, style, { ink, inkSoft, accent });
    return;
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

/* ------------------------------------------------------------------ concept stages */
const LILAC = '#cdbfff';
const ROSE = '#ff9ec4';

function drawConcept(
  ctx: CanvasRenderingContext2D,
  item: MemoryItem,
  face: FaceKind,
  style: FaceStyle,
  pal: { ink: string; inkSoft: string; accent: string },
): void {
  const { w, h } = TILE_PX;
  const cx = w / 2;
  const left = 54;
  const maxW = w - left * 2;
  const footer = (text: string, color = pal.accent) => {
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = `500 22px ${UI_FONT}`;
    ctx.fillText(text, cx, h - 56);
  };
  const stageLine = (y: number) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.accent;
    ctx.font = `500 22px ${UI_FONT}`;
    ctx.fillText(`Stage ${item.order + 1}`, left, y);
  };
  const block = (text: string, y: number, px: number, min: number, lines: number, color: string, weight = 400, family = UI_FONT) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    const f = fitText(ctx, text, maxW, lines, px, min, weight, family);
    f.lines.forEach((l, i) => ctx.fillText(l, left, y + f.px + i * f.px * 1.25));
    return y + f.px * 1.25 * f.lines.length + 8;
  };

  if (face === 'learn' || face === 'hint') {
    stageLine(150);
    let y = block(item.cue, 160, 46, 30, 2, pal.ink, 400, DISPLAY_FONT);
    y = block(item.answer, y + 4, 29, 22, 4, pal.ink, 400);
    if (item.why) y = block(`Why: ${item.why}`, y + 6, 24, 19, 3, style.contrast ? '#ffffff' : LILAC, 400);
    if (y < h - 170) block(item.scene, y + 6, 22, 18, Math.max(1, Math.floor((h - 150 - y) / 30)), pal.inkSoft, 300);
    footer(item.link && style.next ? `${item.link.charAt(0).toUpperCase()}${item.link.slice(1)} \u2192 ${style.next}` : style.dwell ? 'look here to test yourself' : 'pinch to test yourself');
    return;
  }

  if (face === 'cue') {
    // A large stage medallion: the place and the number are the cue.
    ctx.textAlign = 'center';
    ctx.beginPath();
    ctx.arc(cx, 250, 92, 0, Math.PI * 2);
    ctx.strokeStyle = style.due ? pal.accent : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = style.due ? pal.accent : pal.inkSoft;
    ctx.font = `400 104px ${DISPLAY_FONT}`;
    ctx.fillText(String(item.order + 1), cx, 286);
    ctx.fillStyle = pal.ink;
    const text = style.blind ? `Which stage lives ${style.surfaceLabel ? `on your ${style.surfaceLabel}` : 'here'}?` : item.cue;
    const f = fitText(ctx, text, w - 90, 2, 46, 28, 400, DISPLAY_FONT);
    f.lines.forEach((l, i) => ctx.fillText(l, cx, 420 + i * f.px * 1.2));
    footer(style.due ? (style.dwell ? 'what happens here? look to check' : 'what happens here? pinch to check') : `rested, back ${style.restLabel}`, style.due ? pal.accent : C.inkDim);
    return;
  }

  if (face === 'check') {
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.ink;
    ctx.font = `400 40px ${DISPLAY_FONT}`;
    ctx.fillText('Which is true?', cx, 160);
    const check = item.check;
    if (!check) {
      footer('pinch to see the answer');
      return;
    }
    const [a, b] = style.wrongFirst ? [check.wrong, check.right] : [check.right, check.wrong];
    const card = (label: string, text: string, y: number) => {
      roundRect(ctx, 40, y, w - 80, 170, 26);
      ctx.fillStyle = style.contrast ? '#000' : 'rgba(205,191,255,0.10)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = style.contrast ? '#fff' : 'rgba(205,191,255,0.45)';
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = pal.accent;
      ctx.font = `400 40px ${DISPLAY_FONT}`;
      ctx.fillText(label, 62, y + 56);
      ctx.fillStyle = pal.ink;
      const f = fitText(ctx, text, w - 190, 4, 27, 19, 400);
      const top = y + 85 - (f.lines.length * f.px * 1.22) / 2;
      f.lines.forEach((l, i) => ctx.fillText(l, 116, top + f.px + i * f.px * 1.22 - 8));
    };
    card('A', a, 200);
    card('B', b, 390);
    footer(style.dwell ? 'look at A or B below' : 'pinch A or B below');
    return;
  }

  // Answer: the verdict, the correction if needed, then the claim and why.
  const right = style.lastCheck === 'right';
  const verdictColor = style.lastCheck ? (right ? C.mint : ROSE) : pal.accent;
  ctx.textAlign = 'left';
  ctx.fillStyle = verdictColor;
  ctx.font = `400 46px ${DISPLAY_FONT}`;
  ctx.fillText(style.lastCheck ? (right ? 'Right.' : 'Not quite.') : item.cue, left, 150);
  let y = 166;
  if (style.lastCheck === 'wrong' && item.check) y = block(item.check.right, y, 27, 20, 3, pal.ink, 500);
  y = block(item.answer, y + 6, 26, 20, 4, style.lastCheck === 'wrong' ? pal.inkSoft : pal.ink, 400);
  if (item.why) block(`Why: ${item.why}`, y + 6, 23, 18, 3, style.contrast ? '#ffffff' : LILAC, 400);
  footer(style.lastCheck === 'wrong' ? 'it will come back sooner' : style.dwell ? 'look away to rest it' : 'pinch to rest it');
}
