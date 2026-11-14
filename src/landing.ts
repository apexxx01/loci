/**
 * The 2D page a visitor sees in Quest Browser (or on a laptop) before entering
 * mixed reality. One job: explain Loci in a glance and get them into the room.
 */
import './landing.css';
import { buildDeck } from './net/architect-client.js';
import { decodeDeck, encodeDeck } from './core/share.js';
import type { Deck } from './core/types.js';

type LaunchXR = () => void;

const EXAMPLE = `1. Mitochondria - makes energy for the cell
2. Ribosome - builds proteins
3. Nucleus - stores the DNA
4. Golgi body - packages and ships proteins
5. Cell membrane - controls what enters and leaves`;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Memory markers on the plan: [x, y, glyph] in route order (left -> right sweep). */
const MARKERS: [number, number, string][] = [
  [118, 212, '🌡️'], // plant
  [150, 82, '♨️'], // window
  [292, 92, '🌍'], // shelf
  [352, 238, '🔴'], // coffee table
  [440, 98, '👑'], // wall art
  [520, 196, '💍'], // lamp
  [470, 330, '🧊'], // couch
  [556, 292, '🔱'], // door
];

function planSvg(): string {
  const route = MARKERS.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  const viewer = { x: 320, y: 470 };
  const mems = MARKERS.map(
    ([x, y, g], i) => `
      <g class="mem" style="--i:${i}">
        <circle class="glow" cx="${x}" cy="${y}" r="30"></circle>
        <rect x="${x - 20}" y="${y - 20}" width="40" height="40" rx="9"></rect>
        <text class="glyph" x="${x}" y="${y + 8}" text-anchor="middle">${g}</text>
        <circle cx="${x + 19}" cy="${y - 19}" r="10"></circle>
        <text class="num" x="${x + 19}" y="${y - 15}" text-anchor="middle">${i + 1}</text>
      </g>`,
  ).join('');

  return `
  <svg class="plan" viewBox="0 0 640 540" role="img"
       aria-label="Floor plan of a living room. Eight memories sit on the plant, window, shelf, coffee table, wall art, lamp, couch and door, joined by a route that sweeps from left to right in front of a seated learner.">
    <!-- walls with a window gap (top-left) and a door swing (right) -->
    <path class="wall" d="M60 40 H110 M190 40 H600 V250 M600 330 V500 H60 V40"></path>
    <path class="fine" d="M110 34 H190 M110 46 H190"></path>
    <path class="fine" d="M600 250 A80 80 0 0 0 520 330"></path>
    <text class="tag" x="122" y="28">window</text>

    <!-- shelf along the top wall -->
    <rect class="furn" x="236" y="52" width="112" height="26" rx="3"></rect>
    <path class="fine" d="M264 52 V78 M292 52 V78 M320 52 V78"></path>
    <text class="tag" x="250" y="120">shelf</text>

    <!-- wall art -->
    <path class="fine" d="M410 48 H470" style="stroke-width:5"></path>
    <text class="tag" x="412" y="134">wall art</text>

    <!-- plant -->
    <circle class="furn" cx="104" cy="250" r="26"></circle>
    <path class="fine" d="M104 250 l-16 -14 M104 250 l18 -10 M104 250 l2 20 M104 250 l-18 10"></path>
    <text class="tag" x="84" y="296">plant</text>

    <!-- coffee table -->
    <rect class="furn" x="300" y="252" width="110" height="62" rx="8"></rect>
    <text class="tag" x="318" y="288">table</text>

    <!-- lamp -->
    <circle class="furn" cx="552" cy="160" r="20"></circle>
    <path class="fine" d="M540 148 L564 172 M564 148 L540 172"></path>

    <!-- couch -->
    <rect class="furn" x="420" y="350" width="150" height="70" rx="12"></rect>
    <path class="fine" d="M432 362 H558 M470 362 V420 M520 362 V420"></path>
    <text class="tag" x="476" y="444">couch</text>

    <text class="tag" x="606" y="296" style="writing-mode:vertical-rl">door</text>

    <!-- the learner: seated, with a soft view cone -->
    <path class="cone" d="M${viewer.x} ${viewer.y} L70 130 L590 130 Z"></path>
    <circle class="seat" cx="${viewer.x}" cy="${viewer.y}" r="16"></circle>
    <path class="fine" d="M${viewer.x} ${viewer.y - 16} V${viewer.y - 30}" style="stroke:var(--mint);stroke-width:2"></path>
    <text class="tag" x="${viewer.x + 24}" y="${viewer.y + 5}">you, seated</text>

    <!-- recall route + memories -->
    <path class="route route-draw" d="${route}"></path>
    ${mems}
  </svg>`;
}

export function mountLanding(opts: {
  launchXR: LaunchXR;
  onPreview: () => void;
  /** Called with a deck the learner built and approved; entering XR builds it. */
  onDeckReady: (deck: Deck) => void;
  /** Current saved palace deck, for sharing. */
  getPalaceDeck: () => Deck | null;
  /** Show a deck in the flat 3D preview (no headset). */
  onPreviewDeck: (deck: Deck) => void;
}): {
  hide(): void;
  show(): void;
  focusNotes(): void;
} {
  const root = document.createElement('main');
  root.className = 'landing is-animating';
  root.setAttribute('aria-labelledby', 'landing-title');
  root.innerHTML = `
    <div class="landing__inner">
      <header class="landing__top">
        <div class="wordmark" aria-label="Loci">Loci<span>.</span></div>
        <button class="preview-link" type="button" data-preview>Preview on this screen</button>
      </header>

      <section class="hero">
        <div>
          <h1 id="landing-title">Your room remembers.</h1>
          <p>Loci turns the furniture around you into a memory palace. Pick something to learn,
          and each piece lands on a real object, like the lamp, the shelf or the couch. It stays there
          until you come back to recall it.</p>
          <div class="cta-row">
            <button class="cta" type="button" data-enter>Enter your palace</button>
            <span class="cta-note" data-note>Uses your <strong>hands</strong>. No controllers needed.</span>
          </div>
          <p class="shared-note" data-shared hidden></p>
          <p class="share-row" data-share-row hidden>
            <button class="link-quiet" type="button" data-share>Share your palace</button>
            <span class="share-status" role="status" aria-live="polite" data-share-status></span>
          </p>
          <p class="setup-note" data-setup>For the best fit, run Space Setup on your Quest first.
          Without it, memories float in an arc around you instead of sitting on your furniture.</p>
        </div>
        <div class="hero__plan">${planSvg()}</div>
      </section>

      <section class="own" aria-labelledby="own-title">
        <div class="own__intro">
          <h2 id="own-title">Bring your own notes</h2>
          <p>Paste or dictate anything you need to remember: vocabulary, a process, a speech outline.
          One item per line works best, like <em>term - meaning</em>. Up to 12.</p>
        </div>
        <div class="own__work">
          <label class="sr-only" for="notes">Your notes</label>
          <textarea id="notes" rows="7" spellcheck="true" placeholder="${esc(EXAMPLE)}" data-notes></textarea>
          <div class="own__actions">
            <button class="btn-secondary" type="button" data-build>Build my palace</button>
            <button class="link-quiet" type="button" data-example>Use the example</button>
            <span class="own__status" role="status" aria-live="polite" data-build-status></span>
          </div>
          <ol class="preview" data-preview-list hidden></ol>
          <div class="own__enter" data-enter-own-wrap hidden>
            <button class="cta" type="button" data-enter-own>Enter with these memories</button>
            <button class="btn-secondary" type="button" data-preview-own>Preview them on this screen</button>
            <button class="link-quiet" type="button" data-link-own>Copy a link to open on your headset</button>
            <span class="share-status" role="status" aria-live="polite" data-link-status></span>
          </div>
        </div>
      </section>

      <ol class="steps">
        <li>
          <h2>Place</h2>
          <p>Choose a deck or paste your own notes. Loci reads your room and pins each memory to a
          different object, in an order you can sweep with your eyes.</p>
        </li>
        <li>
          <h2>Leave</h2>
          <p>Take the headset off. The memories stay anchored where they landed, ready for next time.</p>
        </li>
        <li>
          <h2>Recall</h2>
          <p>Come back when they glow. Look, remember, pinch to peek, then grab it and raise it if you
          knew it. The schedule adapts to what you find hard.</p>
        </li>
      </ol>

      <section class="evidence" aria-label="Why it works">
        <div class="figure" aria-hidden="true">26 <span class="to">→</span> 62</div>
        <p>After 40 days of training with the memory palace technique, people with ordinary memory
        went from recalling 26 words of a 72-word list to 62, and kept most of the gain four months later.
          <cite>Dresler et al., "Mnemonic Training Reshapes Brain Networks to Support Superior Memory," Neuron, 2017.</cite>
        </p>
      </section>

      <footer class="landing__foot">Your palace and progress are saved in this browser on this headset.</footer>
    </div>`;
  document.body.appendChild(root);

  // Way back from the flat 3D preview.
  const back = document.createElement('button');
  back.className = 'preview-back';
  back.type = 'button';
  back.textContent = 'Back to Loci';
  back.hidden = true;
  back.addEventListener('click', () => {
    root.hidden = false;
    back.hidden = true;
  });
  document.body.appendChild(back);
  const showBack = () => (back.hidden = !root.hidden);
  new MutationObserver(showBack).observe(root, { attributes: true, attributeFilter: ['hidden'] });

  const enter = root.querySelector<HTMLButtonElement>('[data-enter]')!;
  const notes = root.querySelector<HTMLTextAreaElement>('[data-notes]')!;
  const buildBtn = root.querySelector<HTMLButtonElement>('[data-build]')!;
  const buildStatus = root.querySelector<HTMLElement>('[data-build-status]')!;
  const previewList = root.querySelector<HTMLOListElement>('[data-preview-list]')!;
  const enterOwnWrap = root.querySelector<HTMLElement>('[data-enter-own-wrap]')!;
  const enterOwn = root.querySelector<HTMLButtonElement>('[data-enter-own]')!;
  let built: Deck | null = null;

  root.querySelector('[data-example]')!.addEventListener('click', () => {
    notes.value = EXAMPLE;
    notes.focus();
  });

  buildBtn.addEventListener('click', async () => {
    buildBtn.disabled = true;
    buildStatus.textContent = 'The Palace Architect is turning your notes into pictures...';
    previewList.hidden = true;
    enterOwnWrap.hidden = true;
    const result = await buildDeck(notes.value);
    buildBtn.disabled = false;
    if (!result.ok) {
      buildStatus.textContent = result.error;
      notes.focus();
      return;
    }
    built = result.deck;
    buildStatus.textContent =
      result.via === 'architect'
        ? `Built ${built.items.length} memories in ${(result.ms / 1000).toFixed(1)} s.${result.repaired ? ` ${result.repaired} picture${result.repaired > 1 ? 's were' : ' was'} replaced by the safety check.` : ''} Check them, then enter.`
        : `Built ${built.items.length} memories from your lines (Architect unavailable: ${result.reason}). Check them, then enter.`;
    previewList.innerHTML = built.items
      .map(
        (it) => `<li>
          <span class="preview__glyphs" aria-hidden="true">${esc(it.glyphs.join(''))}</span>
          <span class="preview__text"><strong>${esc(it.cue)}</strong> <span class="preview__answer">${esc(it.answer)}</span>
          <span class="preview__scene">${esc(it.scene)}</span></span>
        </li>`,
      )
      .join('');
    previewList.hidden = false;
    // With a headset: enter. Without one: preview here or send it to a headset.
    enterOwnWrap.hidden = false;
    enterOwn.hidden = enter.disabled;
    previewOwn.hidden = !enter.disabled;
    enterOwn.textContent = `Enter with these ${built.items.length} memories`;
  });

  enterOwn.addEventListener('click', () => {
    if (built) opts.onDeckReady(built);
    opts.launchXR();
  });
  const previewOwn = root.querySelector<HTMLButtonElement>('[data-preview-own]')!;
  previewOwn.addEventListener('click', () => {
    if (!built) return;
    root.hidden = true;
    opts.onPreviewDeck(built);
  });
  const linkStatus = root.querySelector<HTMLElement>('[data-link-status]')!;
  root.querySelector('[data-link-own]')!.addEventListener('click', async () => {
    if (!built) return;
    const url = `${location.origin}${location.pathname}#p=${await encodeDeck(built)}`;
    try {
      await navigator.clipboard.writeText(url);
      linkStatus.textContent = 'Link copied. Open it in the headset browser and it builds there.';
    } catch {
      linkStatus.textContent = url;
    }
  });
  const note = root.querySelector<HTMLElement>('[data-note]')!;
  const setup = root.querySelector<HTMLElement>('[data-setup]')!;

  let sharedDeck: Deck | null = null;
  enter.addEventListener('click', () => {
    if (sharedDeck) opts.onDeckReady(sharedDeck);
    opts.launchXR();
  });

  // Arriving from a share link: the deck travels, the room is yours.
  const sharedNote = root.querySelector<HTMLElement>('[data-shared]')!;
  const m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) {
    void decodeDeck(m[1]).then((r) => {
      sharedNote.hidden = false;
      if (!r.ok) {
        sharedNote.textContent = r.error;
        return;
      }
      sharedDeck = r.deck;
      sharedNote.innerHTML = `Someone shared <strong>${esc(r.deck.title)}</strong> with you (${r.deck.items.length} memories). Enter and it will be built around your own furniture.`;
      enter.textContent = `Build "${r.deck.title}" in my room`;
    });
  }

  // Share the current palace (content only; it re-fits to the receiver's room).
  const shareRow = root.querySelector<HTMLElement>('[data-share-row]')!;
  const shareStatus = root.querySelector<HTMLElement>('[data-share-status]')!;
  const refreshShare = () => (shareRow.hidden = !opts.getPalaceDeck());
  refreshShare();
  root.querySelector('[data-share]')!.addEventListener('click', async () => {
    const deck = opts.getPalaceDeck();
    if (!deck) return;
    const url = `${location.origin}${location.pathname}#p=${await encodeDeck(deck)}`;
    try {
      if (navigator.share) await navigator.share({ title: `Loci: ${deck.title}`, url });
      else {
        await navigator.clipboard.writeText(url);
        shareStatus.textContent = 'Link copied. It builds the same memories around their furniture.';
      }
    } catch {
      shareStatus.textContent = url;
    }
  });
  root.querySelector('[data-preview]')!.addEventListener('click', () => {
    root.hidden = true;
    opts.onPreview();
  });

  // Mixed reality needs a headset; say so plainly instead of failing on tap.
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
  if (!xr) {
    unsupported();
  } else {
    xr.isSessionSupported('immersive-ar').then((ok) => (ok ? undefined : unsupported())).catch(unsupported);
  }
  function unsupported() {
    enter.disabled = true;
    enter.textContent = 'Open this page on a Quest 3';
    note.innerHTML = 'Mixed reality needs a headset. You can still <strong>preview</strong> the palace here.';
    setup.hidden = true;
  }

  return {
    hide: () => {
      root.hidden = true;
      back.hidden = true; // immersive: no DOM chrome
    },
    show: () => {
      root.hidden = false;
      root.scrollTop = 0;
      refreshShare();
    },
    focusNotes: () => {
      root.hidden = false;
      notes.scrollIntoView({ block: 'center' });
      notes.focus();
    },
  };
}
