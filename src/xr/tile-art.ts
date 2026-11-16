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
  /** Rebuild-the-chain practice: hide the stage number. */
  hideOrder?: boolean;
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
  if (style.concept) {
    drawConcept(ctx, item, face, style);
    return;
  }
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

/* ------------------------------------------------------------------ concept stages
 * Living light: at rest a stage is a small glowing label, one headline you can
 * read from across the room. Pinch and it blooms open into the full card.
 */
const LILAC = '#d8ccff';
const ROSE = '#ff9ec4';
const GOLD = '#ffcf7a';
const PEARL = '#fff4e6';

function glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, glow: number, contrast?: boolean): void {
  ctx.save();
  if (glow > 0 && !contrast) {
    ctx.shadowColor = `rgba(255, 207, 122, ${0.55 + glow * 0.4})`;
    ctx.shadowBlur = 26 + glow * 26;
  }
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = contrast ? '#000' : 'rgba(14, 10, 34, 0.9)';
  ctx.fill();
  ctx.restore();
  roundRect(ctx, x, y, w, h, r);
  ctx.lineWidth = contrast ? 6 : 3;
  if (contrast) ctx.strokeStyle = '#ffffff';
  else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, `rgba(255, 223, 160, ${0.5 + glow * 0.5})`);
    g.addColorStop(1, `rgba(255, 190, 215, ${0.3 + glow * 0.4})`);
    ctx.strokeStyle = g;
  }
  ctx.stroke();
}

function drawConcept(ctx: CanvasRenderingContext2D, item: MemoryItem, face: FaceKind, style: FaceStyle): void {
  const { w, h } = TILE_PX;
  const cx = w / 2;
  const ink = style.contrast ? '#ffffff' : PEARL;
  const soft = style.contrast ? '#ffffff' : 'rgba(240, 235, 255, 0.8)';
  const accent = style.contrast ? '#ffd400' : GOLD;
  const hint = (text: string, y: number, color = accent) => {
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = `500 26px ${UI_FONT}`;
    ctx.fillText(text, cx, y);
  };
  const left = 60;
  const maxW = w - left * 2;
  const block = (text: string, y: number, px: number, min: number, lines: number, color: string, weight = 400, family = UI_FONT) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    const f = fitText(ctx, text, maxW, lines, px, min, weight, family);
    f.lines.forEach((l, i) => ctx.fillText(l, left, y + f.px + i * f.px * 1.25));
    return y + f.px * 1.25 * f.lines.length + 10;
  };

  // At rest: a luminous label with one headline, centred low on the tile.
  if (face === 'learn' || face === 'cue') {
    const due = face === 'cue' && style.due;
    const fresh = face === 'learn';
    const title = face === 'cue' && style.blind ? `What happens ${style.surfaceLabel ? `on your ${style.surfaceLabel}` : 'here'}?` : item.cue;
    ctx.font = `400 60px ${DISPLAY_FONT}`;
    const f = fitText(ctx, title, w - 150, 2, 62, 44, 400, DISPLAY_FONT);
    const lh = f.px * 1.18;
    const boxH = 120 + lh * f.lines.length;
    const y0 = h - 70 - boxH;
    glass(ctx, 24, y0, w - 48, boxH, 44, due || fresh ? 1 : 0.15, style.contrast);
    // Stage number in a ring.
    ctx.beginPath();
    ctx.arc(cx, y0 + 46, 24, 0, Math.PI * 2);
    ctx.strokeStyle = due || fresh ? accent : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = due || fresh ? accent : soft;
    ctx.font = `400 30px ${DISPLAY_FONT}`;
    ctx.fillText(style.hideOrder ? '?' : String(item.order + 1), cx, y0 + 57);
    ctx.fillStyle = due || fresh || style.contrast ? ink : 'rgba(255, 244, 230, 0.72)';
    f.lines.forEach((l, i) => {
      ctx.font = `400 ${f.px}px ${DISPLAY_FONT}`;
      ctx.fillText(l, cx, y0 + 96 + lh * 0.82 + i * lh);
    });
    const pinch = style.dwell ? 'look' : 'pinch';
    if (style.hideOrder) return hint(`${pinch} if this comes next`, h - 26);
    hint(fresh ? (style.surfaceLabel ? `on your ${style.surfaceLabel}, ${pinch} to open` : `${pinch} to open`) : due ? `what happens here? ${pinch}` : `rests until ${style.restLabel}`, h - 26, fresh || due ? accent : 'rgba(240,235,255,0.55)');
    return;
  }

  // Opened: the full stage blooms into a card.
  glass(ctx, 14, 14, w - 28, h - 28, 50, 0.6, style.contrast);
  if (face === 'hint') {
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.font = `500 24px ${UI_FONT}`;
    ctx.fillText(`Stage ${item.order + 1}`, left, 92);
    let y = block(item.cue, 100, 46, 32, 2, ink, 400, DISPLAY_FONT);
    y = block(item.answer, y + 2, 30, 22, 4, ink);
    if (item.why) y = block(item.why, y + 4, 25, 19, 3, style.contrast ? '#fff' : LILAC);
    const room = Math.floor((h - 120 - y) / 30);
    if (room >= 1) block(item.scene, y + 4, 23, 19, Math.min(3, room), soft, 300);
    hint(item.link && style.next ? `${item.link} → ${style.next}` : style.dwell ? 'look away to close' : 'pinch to close', h - 52);
    return;
  }

  if (face === 'check') {
    ctx.textAlign = 'center';
    ctx.fillStyle = ink;
    ctx.font = `400 44px ${DISPLAY_FONT}`;
    ctx.fillText('Which is true?', cx, 110);
    const check = item.check;
    if (!check) return;
    const [a, b] = style.wrongFirst ? [check.wrong, check.right] : [check.right, check.wrong];
    const card = (label: string, text: string, y: number) => {
      roundRect(ctx, 44, y, w - 88, 200, 28);
      ctx.fillStyle = style.contrast ? '#000' : 'rgba(216, 204, 255, 0.08)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = style.contrast ? '#fff' : 'rgba(216, 204, 255, 0.45)';
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = accent;
      ctx.font = `400 46px ${DISPLAY_FONT}`;
      ctx.fillText(label, 70, y + 64);
      ctx.fillStyle = ink;
      const f = fitText(ctx, text, w - 200, 4, 30, 21, 400);
      const top = y + 100 - (f.lines.length * f.px * 1.22) / 2;
      f.lines.forEach((l, i) => ctx.fillText(l, 128, top + f.px * 0.85 + i * f.px * 1.22));
    };
    card('A', a, 150);
    card('B', b, 370);
    hint(style.dwell ? 'look at A or B beside the card' : 'pinch A or B beside the card', h - 52);
    return;
  }

  // Verdict.
  const right = style.lastCheck === 'right';
  ctx.textAlign = 'left';
  ctx.fillStyle = style.lastCheck ? (right ? C.mint : ROSE) : accent;
  ctx.font = `400 50px ${DISPLAY_FONT}`;
  ctx.fillText(style.lastCheck ? (right ? 'Right.' : 'Not quite.') : item.cue, left, 104);
  let y = 118;
  if (style.lastCheck === 'wrong' && item.check) y = block(item.check.right, y, 30, 22, 3, ink, 500);
  y = block(item.answer, y + 4, 28, 21, 4, style.lastCheck === 'wrong' ? soft : ink);
  if (item.why) block(item.why, y + 4, 25, 19, 3, style.contrast ? '#fff' : LILAC);
  hint(style.lastCheck === 'wrong' ? 'it will come back sooner' : style.dwell ? 'look away to rest it' : 'pinch to rest it', h - 52);
}
