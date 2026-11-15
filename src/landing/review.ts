/**
 * Recall from any screen. Between headset sessions, the memories that are due
 * can be recalled right here, prompted by where they live in the room, and the
 * result goes into the same FSRS schedule the headset reads.
 */
import { dueIds, nextDue } from '../core/scheduler.js';
import type { Palace, ReviewEvent } from '../core/types.js';
import { span } from './demo.js';

type Rating = ReviewEvent['rating'];

export interface ReviewOptions {
  palace: Palace;
  /** Save one recall; returns the updated palace, or null if it could not be saved. */
  save: (memoryId: string, rating: Rating) => Palace | null;
  onClose: () => void;
  onRated?: (rating: Rating) => void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function openReview(opts: ReviewOptions): () => void {
  let palace = opts.palace;
  const now = new Date();
  // Due first; if nothing is due, a short practice round of the weakest memories.
  let queue = dueIds(palace, now);
  const practice = queue.length === 0;
  if (practice) {
    queue = Object.entries(palace.cards)
      .sort(([, a], [, b]) => a.stability - b.stability)
      .slice(0, 5)
      .map(([id]) => id);
  }
  const total = queue.length;
  const where = new Map(palace.placements.map((p) => [p.memoryId, p.label]));
  const item = (id: string) => palace.deck.items.find((it) => it.id === id)!;
  const tally: Record<Rating, number> = { good: 0, hard: 0, again: 0 };

  const el = document.createElement('div');
  el.className = 'recall';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', `Recall ${palace.deck.title}`);
  el.innerHTML = `
    <div class="recall__top">
      <p class="recall__title">${esc(palace.deck.title)}</p>
      <ol class="recall__dots" aria-hidden="true">${queue.map(() => '<li></li>').join('')}</ol>
      <button type="button" class="recall__close" data-close>Close</button>
    </div>
    <div class="recall__body" data-body></div>`;
  document.body.appendChild(el);
  const body = el.querySelector<HTMLElement>('[data-body]')!;
  const dots = [...el.querySelectorAll<HTMLElement>('.recall__dots li')];
  let i = 0;
  let shown = false;
  const prev = document.activeElement as HTMLElement | null;

  const paint = () => {
    dots.forEach((d, k) => (d.className = k < i ? 'done' : k === i ? 'now' : ''));
    if (i >= total) return finish();
    const it = item(queue[i]);
    const place = where.get(it.id);
    body.innerHTML = `
      <p class="recall__where">${place ? `Resting on ${esc(place.replace(/^the /i, 'the '))} in your room` : `Memory ${it.order + 1} on your walk`}</p>
      <div class="recall__glyphs" aria-hidden="true">${esc(it.glyphs.join(' '))}</div>
      <h2 class="recall__cue">${esc(it.cue)}</h2>
      <div class="recall__reveal" data-reveal ${shown ? '' : 'hidden'}>
        <p class="recall__answer">${esc(it.answer)}</p>
        <p class="recall__scene">${esc(it.scene)}</p>
      </div>
      <div class="recall__actions">
        ${shown
          ? `<button type="button" class="soft soft--again" data-rate="again">Not yet <kbd>1</kbd></button>
             <button type="button" class="soft" data-rate="hard">It took a moment <kbd>2</kbd></button>
             <button type="button" class="soft soft--good" data-rate="good">I knew it <kbd>3</kbd></button>`
          : `<button type="button" class="soft soft--good" data-show>Show me <kbd>Space</kbd></button>`}
      </div>
      <p class="recall__hint">${shown ? 'Be honest. The schedule only works if the rating is true.' : `Picture ${place ? 'that spot' : 'the spot'} first. What was resting there?`}</p>`;
    body.querySelector<HTMLButtonElement>(shown ? '[data-rate="good"]' : '[data-show]')?.focus({ preventScroll: true });
  };

  const finish = () => {
    const next = nextDue(palace);
    const left = dueIds(palace, new Date()).length;
    body.innerHTML = `
      <p class="recall__where">${practice ? 'Practice round done' : 'All caught up'}</p>
      <h2 class="recall__cue">${tally.good + tally.hard} of ${total} came back.</h2>
      <p class="recall__summary">${tally.again ? `${tally.again} will return within minutes, while ${tally.again === 1 ? 'it is' : 'they are'} fresh. ` : ''}${
        left ? `${left} still glowing.` : next ? `Nothing else is due. The next one comes back in ${span(next.getTime() - Date.now())}.` : ''
      }</p>
      <p class="recall__hint">Saved to this palace. Your headset picks up the same schedule.</p>
      <div class="recall__actions"><button type="button" class="soft soft--good" data-close>Done</button></div>`;
    body.querySelector<HTMLButtonElement>('[data-close]')?.focus({ preventScroll: true });
  };

  const rate = (r: Rating) => {
    const id = queue[i];
    const saved = opts.save(id, r);
    if (saved) palace = saved;
    tally[r]++;
    opts.onRated?.(r);
    i++;
    shown = false;
    paint();
  };

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 380);
    prev?.focus?.({ preventScroll: true });
    opts.onClose();
  };

  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) return close();
    if (t.closest('[data-show]')) {
      shown = true;
      return paint();
    }
    const r = t.closest<HTMLElement>('[data-rate]');
    if (r) rate(r.dataset.rate as Rating);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return close();
    if (i >= total) return;
    if (!shown && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      shown = true;
      paint();
    } else if (shown && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      rate((['again', 'hard', 'good'] as const)[Number(e.key) - 1]);
    }
  };
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => el.classList.add('is-open'));
  paint();
  return close;
}
