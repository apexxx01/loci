/**
 * "Try one recall, right here": the real loop, playable with a mouse, a finger
 * or the keyboard, using the same FSRS scheduler the headset uses. Visitors
 * understand Loci by doing it once, before they ever put a headset on.
 */
import { PLANETS } from '../core/decks.js';
import { newCard, review } from '../core/scheduler.js';
import { sigilSVG } from './sigil.js';

const CARDS = [
  { item: PLANETS.items[5], where: 'your lamp' },
  { item: PLANETS.items[3], where: 'your couch' },
  { item: PLANETS.items[4], where: 'your shelf' },
];
const FACES = ['cue', 'picture', 'answer'] as const;

export function span(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 36) return `${h} hours`;
  const d = Math.round(h / 24);
  return d < 60 ? `${d} days` : `${Math.round(d / 30)} months`;
}

/** Real schedule: how long until the next review, and the chain if you keep knowing it. */
function schedule(rating: 'good' | 'again') {
  let t = new Date();
  let c = review(newCard(t), rating, t);
  const first = new Date(c.due).getTime() - t.getTime();
  const chain: number[] = [];
  if (rating === 'good') {
    chain.push(first);
    for (let i = 0; i < 3; i++) {
      t = new Date(c.due);
      c = review(c, 'good', t);
      chain.push(new Date(c.due).getTime() - t.getTime());
    }
  }
  return { first, chain };
}

export function mountDemo(host: HTMLElement, onDone: () => void): void {
  host.innerHTML = `
    <div class="demo__stage">
      <p class="demo__where" data-where></p>
      <div class="demo__card" data-card tabindex="0" role="button" aria-describedby="demo-hint">
        <div class="demo__halo" aria-hidden="true"></div>
        <div class="demo__sigil" data-glyphs aria-hidden="true"></div>
      </div>
      <p class="demo__title" data-title></p>
      <p class="demo__face" data-face></p>
      <p class="demo__body" data-body></p>
    </div>
    <div class="demo__side">
      <p class="demo__hint" id="demo-hint" data-hint aria-live="polite"></p>
      <div class="demo__buttons">
        <button type="button" class="lumen lumen--quiet" data-peek>Peek</button>
        <button type="button" class="lumen" data-good>I knew it</button>
        <button type="button" class="lumen lumen--rose" data-again>Not yet</button>
      </div>
      <div class="demo__result" data-result hidden></div>
      <p class="demo__keys">Drag the star up if you knew it, down if you did not. Or use Space, and the up and down arrows.</p>
    </div>`;

  const $ = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
  const card = $('[data-card]');
  const hint = $('[data-hint]');
  const result = $('[data-result]');
  const peekBtn = $<HTMLButtonElement>('[data-peek]');
  let index = 0;
  let face = 0;
  let locked = false;

  const paint = () => {
    const { item, where } = CARDS[index];
    $('[data-where]').textContent = `Resting on ${where}`;
    $('[data-glyphs]').innerHTML = sigilSVG(item.cue, 170);
    $('[data-title]').textContent = item.cue;
    $('[data-body]').textContent = face === 0 ? '' : face === 1 ? item.scene : item.answer;
    $('[data-face]').textContent = face === 0 ? 'What do you remember about it?' : face === 1 ? 'The picture that holds it' : 'The answer';
    card.dataset.side = FACES[face];
    peekBtn.textContent = face === 0 ? 'Peek at the picture' : face === 1 ? 'Show the answer' : 'Back to the cue';
    hint.textContent =
      face === 0
        ? `Memory ${index + 1} of ${CARDS.length}. Try to recall what you know about ${item.cue}, then peek.`
        : face === 1
          ? 'That odd little scene is the hook. Does it bring the fact back?'
          : 'Now be honest. Did you know it?';
  };

  const flip = () => {
    if (locked) return;
    card.classList.add('is-flipping');
    setTimeout(() => {
      face = (face + 1) % 3;
      paint();
      card.classList.remove('is-flipping');
    }, 150);
  };

  const rate = (rating: 'good' | 'again') => {
    if (locked) return;
    locked = true;
    const { item } = CARDS[index];
    const s = schedule(rating);
    card.classList.add(rating === 'good' ? 'is-good' : 'is-again');
    result.hidden = false;
    const last = index === CARDS.length - 1;
    result.innerHTML =
      (rating === 'good'
        ? `<strong>Locked in.</strong> Loci will bring ${item.cue} back in ${span(s.first)}. Keep knowing it and the gaps grow:
           <span class="demo__chain">${s.chain.map((c) => `<span>${span(c)}</span>`).join('')}</span>`
        : `<strong>No problem.</strong> ${item.cue} comes back in ${span(s.first)} so you get another go while it is fresh.`) +
      `<button type="button" class="lumen lumen--next" data-next>${last ? 'Choose what to learn' : 'Next memory'}</button>`;
    hint.textContent = 'That rating just set the schedule. This is the same maths the headset uses.';
    result.querySelector<HTMLButtonElement>('[data-next]')!.addEventListener('click', () => {
      if (last) return onDone();
      index++;
      face = 0;
      locked = false;
      result.hidden = true;
      card.classList.remove('is-good', 'is-again');
      card.style.transform = '';
      paint();
      card.focus({ preventScroll: true });
    });
  };

  // Drag up / down to rate, like raising or lowering the memory in your room.
  let startY = 0;
  let dragging = false;
  let moved = 0;
  card.addEventListener('pointerdown', (e) => {
    if (locked) return;
    dragging = true;
    moved = 0;
    startY = e.clientY;
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    moved = e.clientY - startY;
    card.style.transform = `translateY(${moved * 0.8}px) rotate(${moved * -0.02}deg)`;
    card.dataset.pull = moved < -40 ? 'up' : moved > 40 ? 'down' : '';
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    card.dataset.pull = '';
    if (moved < -70) rate('good');
    else if (moved > 70) rate('again');
    else {
      card.style.transform = '';
      if (Math.abs(moved) < 6) flip();
    }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
  card.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      flip();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      rate('good');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      rate('again');
    }
  });
  peekBtn.addEventListener('click', flip);
  $('[data-good]').addEventListener('click', () => rate('good'));
  $('[data-again]').addEventListener('click', () => rate('again'));
  paint();
}
