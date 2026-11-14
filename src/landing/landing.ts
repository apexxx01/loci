/**
 * The 2D page a visitor sees before entering mixed reality. It tells the
 * story (why place is memory's strongest hook, with the studies), lets them
 * try one recall on the spot, pick what to learn, and step into their room.
 */
import './landing.css';
import { STARTER_DECKS } from '../core/decks.js';
import { loadPalace, savePalace } from '../core/palace.js';
import { dueIds, mastery, nextDue, streak } from '../core/scheduler.js';
import { PalaceSchema } from '../core/schema.js';
import { decodeDeck, encodeDeck } from '../core/share.js';
import type { Deck, Palace } from '../core/types.js';
import { buildDeck } from '../net/architect-client.js';
import { stopAmbient, toggleAmbient } from './ambient.js';
import { mountDemo, span } from './demo.js';
import { createLandingScene } from './scene.js';

const EXAMPLE = `1. Mitochondria - makes energy for the cell
2. Ribosome - builds proteins
3. Nucleus - stores the DNA
4. Golgi body - packages and ships proteins
5. Cell membrane - controls what enters and leaves`;
const DRAFT_KEY = 'loci.draft';

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export interface LandingOptions {
  launchXR: () => void;
  /** Deck to build as soon as mixed reality starts. */
  onDeckReady: (deck: Deck | null) => void;
  /** Show a deck in the flat on-screen preview (no headset needed). */
  onPreviewDeck: (deck: Deck | null) => void;
  getPalace: () => Palace | null;
}

const HTML = `
<div class="sky" aria-hidden="true"></div>
<canvas class="cosmos" aria-hidden="true"></canvas>
<div class="progress" aria-hidden="true"><i data-progress></i></div>

<header class="bar">
  <a class="wordmark" href="#top" aria-label="Loci, back to top">Loci</a>
  <nav class="bar__nav" aria-label="Sections">
    <a href="#why">Why it works</a>
    <a href="#try">Try it</a>
    <a href="#start">Start</a>
  </nav>
  <div class="bar__tools">
    <button class="tool" type="button" data-ambient aria-pressed="false">Sound off</button>
    <button class="pill" type="button" data-enter>Enter</button>
  </div>
</header>

<section class="s s--hero" id="top" data-stage="0" data-shift="0" data-dim="0.15">
  <div class="hero__inner">
    <h1 id="landing-title">Your room remembers.</h1>
    <p class="lede">Loci turns the room you are sitting in into a memory palace. Leave what you are learning
    on your lamp, your shelf, your couch. Come back tomorrow and it is still there, waiting to be recalled.</p>
    <div class="cta-row">
      <button class="cta" type="button" data-enter>Enter your palace</button>
      <a class="ghost" href="#why">See why it works</a>
    </div>
    <p class="fine" data-device-note>Hands only, no controllers. Made for sitting down. Meta Quest 3 and 3S.</p>
    <p class="notice" data-shared hidden></p>
    <aside class="back-card" data-returning hidden></aside>
  </div>
  <a class="scroll-cue" href="#why" aria-label="Scroll to the story"><span></span></a>
</section>

<section class="s" id="why" data-stage="1" data-shift="1" data-dim="0">
  <div class="copy">
    <h2>Your brain files memories by place.</h2>
    <p>Deep in the hippocampus, place cells fire when you are in one exact spot, and grid cells map the space
    between. Finding them won the 2014 Nobel Prize in Physiology or Medicine.</p>
    <p>Where something is turns out to be the strongest hook your memory has.</p>
    <cite>O'Keefe, Moser and Moser. Nobel Prize in Physiology or Medicine, 2014.</cite>
  </div>
</section>

<section class="s" data-stage="2" data-shift="-1" data-dim="0">
  <div class="copy copy--right">
    <h2>Memory champions use that on purpose.</h2>
    <p>They picture a familiar place and leave each thing to remember at a spot along a walk through it.
    The trick is 2,500 years old and it is called the method of loci.</p>
    <div class="figure" data-count aria-label="26 words recalled before training, 62 after">
      <span data-from>26</span><i></i><span class="to" data-to>26</span>
      <small>words recalled from a list of 72</small>
    </div>
    <p>In a 2017 study, people with ordinary memory practised it for 30 minutes a day. After 40 days their
    recall more than doubled, and four months later they still remembered 22 more words than before they started.</p>
    <cite>Dresler et al., "Mnemonic Training Reshapes Brain Networks to Support Superior Memory", Neuron, 2017.</cite>
  </div>
</section>

<section class="s" data-stage="3" data-shift="1" data-dim="0">
  <div class="copy">
    <h2>It works even better when you are inside it.</h2>
    <p>The hard part was always imagining the palace. When University of Maryland researchers let people
    explore a memory palace in a headset instead of on a screen, recall improved by 8.8%.</p>
    <p>So Loci skips the imagining. The room around you is the palace.</p>
    <cite>Krokos, Plaisant and Varshney, "Virtual memory palaces: immersion aids recall", Virtual Reality, 2018.</cite>
  </div>
</section>

<section class="s" id="how" data-stage="3" data-tiles="1" data-shift="-1" data-dim="0">
  <div class="copy copy--right">
    <h2>Loci builds the palace out of your own furniture.</h2>
    <ol class="steps">
      <li><h3>Place</h3><p>Pick a deck or paste your notes. Loci reads your room and rests each memory on a
      different real object, in an order you can sweep with your eyes.</p></li>
      <li><h3>Leave</h3><p>Take the headset off. Every memory stays anchored exactly where it landed.</p></li>
      <li><h3>Recall</h3><p>Come back when they glow. Look, remember, pinch to peek, then lift the memory if
      you knew it. The schedule adapts to what you find hard.</p></li>
    </ol>
  </div>
</section>

<section class="s s--wide" id="try" data-stage="3" data-tiles="1" data-shift="0" data-dim="1">
  <div class="panel">
    <h2>Try one recall, right here.</h2>
    <p class="panel__lede">This is the whole loop. The schedule you get back is the real one Loci uses.</p>
    <div class="demo" data-demo></div>
  </div>
</section>

<section class="s s--wide" id="start" data-stage="3" data-tiles="1" data-shift="0" data-dim="1">
  <div class="panel">
    <h2>What do you want to remember?</h2>
    <p class="panel__lede">Choose a ready-made deck, or bring your own notes and let the Palace Architect turn
    them into pictures.</p>
    <div class="decks" role="group" aria-label="Decks" data-decks></div>

    <div class="own" data-own hidden>
      <label for="notes">Your notes. One thing per line works best, like <em>term - meaning</em>.</label>
      <textarea id="notes" rows="6" spellcheck="true" data-notes></textarea>
      <div class="own__row">
        <button class="btn-soft btn-soft--primary" type="button" data-build>Build my palace</button>
        <button class="link" type="button" data-example>Use an example</button>
        <span class="own__count" data-count-lines></span>
      </div>
      <p class="own__status" role="status" aria-live="polite" data-build-status></p>
      <ol class="preview" data-preview-list hidden></ol>
    </div>

    <div class="chosen" data-chosen hidden>
      <p data-chosen-text></p>
      <div class="cta-row">
        <button class="cta" type="button" data-enter>Enter your palace</button>
        <button class="link" type="button" data-copy-link>Copy a link for your headset</button>
      </div>
      <p class="fine" role="status" aria-live="polite" data-link-status></p>
    </div>
  </div>
</section>

<section class="s s--wide" id="faq" data-stage="0" data-shift="0" data-dim="0.55">
  <div class="panel panel--quiet">
    <h2>Good to know</h2>
    <details><summary>What do I need?</summary><p>A Meta Quest 3 or 3S and this page open in its browser.
    Nothing to install. For the best fit, run Space Setup once so Loci knows where your furniture is. Without it,
    memories float in a gentle arc around you instead.</p></details>
    <details><summary>Do I have to move around?</summary><p>No. Loci is made for sitting. Memories are placed
    where you can see them by turning your head, and far ones are drawn larger so you can read them.</p></details>
    <details><summary>What if I cannot pinch or lift my arm?</summary><p>Open Comfort and access on the panel in
    your room. Look to select lets you flip and rate memories just by looking at them. There are also high
    contrast, larger tiles, calm motion and a sound switch.</p></details>
    <details><summary>Where does my data go?</summary><p>Your palace and progress stay in this browser on this
    device. Notes are sent to the Palace Architect only when you press Build my palace, to be turned into
    pictures. Nothing else leaves the page.</p></details>
    <details><summary>No headset right now?</summary><p>You can still try the recall above, build a deck from your
    notes, preview it on this screen, and copy a link that opens the same deck on a headset later.</p></details>
    <div class="data-row">
      <button class="link" type="button" data-export hidden>Download my palace</button>
      <label class="link" tabindex="0">Restore a palace file<input type="file" accept="application/json,.json" data-import hidden /></label>
      <span class="fine" role="status" aria-live="polite" data-data-status></span>
    </div>
    <div class="closing">
      <p>Your room is ready when you are.</p>
      <button class="cta" type="button" data-enter>Enter your palace</button>
    </div>
  </div>
</section>`;

export function mountLanding(opts: LandingOptions): { hide(): void; show(): void; focusNotes(): void } {
  const root = document.createElement('main');
  root.className = 'landing';
  root.setAttribute('aria-labelledby', 'landing-title');
  root.innerHTML = HTML;
  document.body.appendChild(root);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];

  /* ---------------------------------------------------- 3D backdrop */
  const scene = createLandingScene($<HTMLCanvasElement>('.cosmos'));
  const sections = $$('section.s');
  const progressBar = $('[data-progress]');
  const num = (el: HTMLElement, k: string) => Number(el.dataset[k] ?? 0);
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const mid = root.scrollTop + root.clientHeight / 2;
      const centers = sections.map((s) => s.offsetTop + s.offsetHeight / 2);
      let i = 0;
      while (i < centers.length - 2 && mid > centers[i + 1]) i++;
      const t = Math.max(0, Math.min(1, (mid - centers[i]) / (centers[i + 1] - centers[i])));
      const a = sections[i];
      const b = sections[i + 1];
      const mix = (k: string) => num(a, k) + (num(b, k) - num(a, k)) * t;
      scene?.set({ progress: mix('stage'), tiles: mix('tiles'), shift: mix('shift'), dim: mix('dim') });
      const max = root.scrollHeight - root.clientHeight;
      progressBar.style.transform = `scaleX(${max > 0 ? root.scrollTop / max : 0})`;
      root.classList.toggle('is-scrolled', root.scrollTop > 40);
    });
  };
  root.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  // Content settles in as each chapter arrives; figures count up once.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        const fig = e.target.querySelector<HTMLElement>('[data-count]');
        if (fig && !fig.dataset.done) {
          fig.dataset.done = '1';
          const to = fig.querySelector<HTMLElement>('[data-to]')!;
          const t0 = performance.now();
          const tick = (now: number) => {
            const k = Math.min(1, (now - t0) / 1400);
            to.textContent = String(Math.round(26 + 36 * (1 - Math.pow(1 - k, 3))));
            if (k < 1) requestAnimationFrame(tick);
          };
          if (matchMedia('(prefers-reduced-motion: reduce)').matches) to.textContent = '62';
          else requestAnimationFrame(tick);
        }
      }
    },
    { root, threshold: 0.3 },
  );
  sections.forEach((s) => io.observe(s));

  // In-page anchors scroll the landing container, not the window.
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const target = root.querySelector<HTMLElement>(a.getAttribute('href')!);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------------------------------------------------- state */
  let chosen: Deck | null = null;
  let hasXR = true;
  const enterButtons = $$<HTMLButtonElement>('[data-enter]');
  const chosenBox = $('[data-chosen]');
  const chosenText = $('[data-chosen-text]');

  const paintEnter = () => {
    const palace = opts.getPalace();
    const label = !hasXR
      ? chosen ? `Preview "${chosen.title}" here` : 'Preview on this screen'
      : chosen ? `Enter with "${chosen.title}"` : palace ? 'Continue my palace' : 'Enter your palace';
    enterButtons.forEach((b) => (b.textContent = b.classList.contains('pill') ? (hasXR ? 'Enter' : 'Preview') : label));
    chosenBox.hidden = !chosen;
    if (chosen) {
      chosenText.textContent = `${chosen.title}: ${chosen.items.length} memories, ready to be placed around your room.${
        palace && palace.deck.id !== chosen.id ? ` This replaces your current palace, "${palace.deck.title}".` : ''
      }`;
    }
  };
  const choose = (deck: Deck | null) => {
    chosen = deck;
    $$('[data-deck]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.deck === deck?.id)));
    paintEnter();
  };
  const leave = () => {
    stopAmbient();
    $('[data-ambient]').setAttribute('aria-pressed', 'false');
    $('[data-ambient]').textContent = 'Sound off';
  };
  enterButtons.forEach((b) =>
    b.addEventListener('click', () => {
      leave();
      if (hasXR) {
        opts.onDeckReady(chosen);
        opts.launchXR();
      } else {
        root.hidden = true;
        opts.onPreviewDeck(chosen);
      }
    }),
  );

  /* ---------------------------------------------------- decks */
  const decksEl = $('[data-decks]');
  decksEl.innerHTML =
    STARTER_DECKS.map(
      (d) => `<button type="button" class="deck" data-deck="${d.id}" aria-pressed="false">
        <span class="deck__glyphs" aria-hidden="true">${d.items.slice(0, 4).map((i) => esc(i.glyphs[0])).join('')}</span>
        <span class="deck__title">${esc(d.title)}</span>
        <span class="deck__sub">${esc(d.subtitle)}</span>
      </button>`,
    ).join('') +
    `<button type="button" class="deck deck--own" data-deck="own" aria-pressed="false" aria-expanded="false">
        <span class="deck__glyphs" aria-hidden="true">✍️</span>
        <span class="deck__title">My own notes</span>
        <span class="deck__sub">Vocabulary, a process, a speech. Up to 12 lines.</span>
      </button>`;
  const ownBox = $('[data-own]');
  decksEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-deck]');
    if (!b) return;
    const own = b.dataset.deck === 'own';
    ownBox.hidden = !own;
    $('[data-deck="own"]').setAttribute('aria-expanded', String(own));
    if (own) {
      choose(built);
      b.setAttribute('aria-pressed', 'true');
      notes.focus();
    } else choose(STARTER_DECKS.find((d) => d.id === b.dataset.deck) ?? null);
  });

  /* ---------------------------------------------------- own notes */
  const notes = $<HTMLTextAreaElement>('[data-notes]');
  const buildBtn = $<HTMLButtonElement>('[data-build]');
  const buildStatus = $('[data-build-status]');
  const previewList = $<HTMLOListElement>('[data-preview-list]');
  const countEl = $('[data-count-lines]');
  let built: Deck | null = null;
  notes.placeholder = EXAMPLE;
  try {
    notes.value = localStorage.getItem(DRAFT_KEY) ?? '';
  } catch {
    /* private mode */
  }
  const paintCount = () => {
    const n = notes.value.split('\n').filter((l) => l.trim()).length;
    countEl.textContent = n ? `${Math.min(n, 12)} of 12 lines${n > 12 ? ' (extra lines are left out)' : ''}` : '';
  };
  paintCount();
  notes.addEventListener('input', () => {
    paintCount();
    try {
      localStorage.setItem(DRAFT_KEY, notes.value);
    } catch {
      /* ignore */
    }
  });
  notes.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') buildBtn.click();
  });
  $('[data-example]').addEventListener('click', () => {
    notes.value = EXAMPLE;
    notes.dispatchEvent(new Event('input'));
    notes.focus();
  });

  const paintPreview = () => {
    if (!built) return;
    previewList.innerHTML = built.items
      .map(
        (it, i) => `<li>
          <span class="preview__glyphs" aria-hidden="true">${esc(it.glyphs.join(''))}</span>
          <span class="preview__text"><strong>${esc(it.cue)}</strong> <span class="preview__answer">${esc(it.answer)}</span>
          <span class="preview__scene">${esc(it.scene)}</span></span>
          <button type="button" class="preview__remove" data-remove="${i}" aria-label="Remove ${esc(it.cue)}">Remove</button>
        </li>`,
      )
      .join('');
    previewList.hidden = false;
  };
  previewList.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
    if (!b || !built || built.items.length <= 1) return;
    const items = built.items.filter((_, i) => i !== Number(b.dataset.remove)).map((it, order) => ({ ...it, order }));
    built = { ...built, items, subtitle: `${items.length} memories, built from your notes` };
    paintPreview();
    choose(built);
    $('[data-deck="own"]').setAttribute('aria-pressed', 'true');
  });

  buildBtn.addEventListener('click', async () => {
    buildBtn.disabled = true;
    buildBtn.textContent = 'Building...';
    buildStatus.textContent = 'The Palace Architect is turning your notes into pictures. This takes a few seconds.';
    const result = await buildDeck(notes.value);
    buildBtn.disabled = false;
    buildBtn.textContent = 'Build my palace';
    if (!result.ok) {
      buildStatus.textContent = result.error;
      notes.focus();
      return;
    }
    built = result.deck;
    buildStatus.textContent =
      result.via === 'architect'
        ? `Built ${built.items.length} memories in ${(result.ms / 1000).toFixed(1)} s.${result.repaired ? ` ${result.repaired} picture${result.repaired > 1 ? 's were' : ' was'} replaced by the safety check.` : ''} Remove any you do not want, then enter.`
        : `Built ${built.items.length} memories straight from your lines, because the Palace Architect is unavailable right now.`;
    paintPreview();
    choose(built);
    $('[data-deck="own"]').setAttribute('aria-pressed', 'true');
  });

  const linkStatus = $('[data-link-status]');
  $('[data-copy-link]').addEventListener('click', async () => {
    if (!chosen) return;
    const url = `${location.origin}${location.pathname}#p=${await encodeDeck(chosen)}`;
    try {
      await navigator.clipboard.writeText(url);
      linkStatus.textContent = 'Link copied. Open it in the headset browser and the same deck builds there.';
    } catch {
      linkStatus.textContent = url;
    }
  });

  /* ---------------------------------------------------- returning learner */
  const returning = $('[data-returning]');
  const paintReturning = () => {
    const palace = opts.getPalace();
    $('[data-export]').hidden = !palace;
    returning.hidden = !palace;
    if (!palace) return;
    const now = new Date();
    const due = dueIds(palace, now).length;
    const next = nextDue(palace);
    const when = due ? 'ready now' : next ? `next in ${span(next.getTime() - now.getTime())}` : '';
    returning.innerHTML = `
      <p class="back-card__title">Welcome back to ${esc(palace.deck.title)}</p>
      <dl>
        <div><dt>${due}</dt><dd>glowing, ${when}</dd></div>
        <div><dt>${Math.round(mastery(palace) * 100)}%</dt><dd>mastered</dd></div>
        <div><dt>${streak(palace.history, now)}</dt><dd>day streak</dd></div>
      </dl>
      <button class="link" type="button" data-share>Share this palace</button>
      <span class="fine" role="status" aria-live="polite" data-share-status></span>`;
    returning.querySelector('[data-share]')!.addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}#p=${await encodeDeck(palace.deck)}`;
      const status = returning.querySelector<HTMLElement>('[data-share-status]')!;
      try {
        if (navigator.share) await navigator.share({ title: `Loci: ${palace.deck.title}`, url });
        else {
          await navigator.clipboard.writeText(url);
          status.textContent = 'Link copied. It rebuilds around their furniture.';
        }
      } catch {
        status.textContent = url;
      }
    });
  };

  /* ---------------------------------------------------- data in / out */
  const dataStatus = $('[data-data-status]');
  $('[data-export]').addEventListener('click', () => {
    const palace = opts.getPalace();
    if (!palace) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(palace, null, 2)], { type: 'application/json' }));
    a.download = `loci-${palace.deck.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $<HTMLInputElement>('[data-import]').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const parsed = PalaceSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error('not a palace');
      if (!savePalace(localStorage, parsed.data as Palace) || loadPalace(localStorage).status !== 'ok') throw new Error('storage');
      dataStatus.textContent = 'Palace restored. Reloading...';
      setTimeout(() => location.reload(), 600);
    } catch {
      dataStatus.textContent = 'That file is not a Loci palace, or this browser cannot save it.';
    }
  });

  /* ---------------------------------------------------- demo + ambient */
  mountDemo($('[data-demo]'), () => $('#start').scrollIntoView({ behavior: 'smooth' }));
  const ambientBtn = $('[data-ambient]');
  ambientBtn.addEventListener('click', () => {
    const on = toggleAmbient();
    ambientBtn.setAttribute('aria-pressed', String(on));
    ambientBtn.textContent = on ? 'Sound on' : 'Sound off';
  });

  /* ---------------------------------------------------- share links in */
  const sharedNote = $('[data-shared]');
  const m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) {
    void decodeDeck(m[1]).then((r) => {
      sharedNote.hidden = false;
      if (!r.ok) {
        sharedNote.textContent = r.error;
        return;
      }
      sharedNote.innerHTML = `You were sent <strong>${esc(r.deck.title)}</strong> (${r.deck.items.length} memories). Enter and it is built around your own furniture.`;
      choose(r.deck);
    });
  }

  /* ---------------------------------------------------- headset check */
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
  const noXR = () => {
    hasXR = false;
    $('[data-device-note]').textContent =
      'Mixed reality needs a Quest 3 or 3S. On this screen you can explore, try a recall and preview a palace.';
    paintEnter();
  };
  if (!xr) noXR();
  else xr.isSessionSupported('immersive-ar').then((ok) => (ok ? undefined : noXR())).catch(noXR);

  /* ---------------------------------------------------- preview back */
  const back = document.createElement('button');
  back.className = 'preview-back';
  back.type = 'button';
  back.textContent = 'Back to Loci';
  back.hidden = true;
  back.addEventListener('click', () => api.show());
  document.body.appendChild(back);

  paintEnter();
  paintReturning();

  let immersive = false;
  new MutationObserver(() => {
    back.hidden = !root.hidden || immersive;
    scene?.setActive(!root.hidden);
  }).observe(root, { attributes: true, attributeFilter: ['hidden'] });

  const api = {
    hide: () => {
      immersive = true;
      leave();
      root.hidden = true;
    },
    show: () => {
      immersive = false;
      root.hidden = false;
      paintEnter();
      paintReturning();
    },
    focusNotes: () => {
      api.show();
      ownBox.hidden = false;
      $('#start').scrollIntoView();
      notes.focus();
    },
  };
  return api;
}
