/**
 * The 2D page a visitor sees before entering mixed reality. It tells the
 * story (why place is memory's strongest hook, with the research), lets them
 * try one recall on the spot, build a palace for anything they need to
 * remember, manage their library, and step into their room.
 */
import './landing.css';
import type { Audience, Kind } from '../core/architect.js';
import { STARTER_DECKS } from '../core/decks.js';
import { forgettingCurves } from '../core/forecast.js';
import { deckFromNumber } from '../core/numbers.js';
import { dueIds, mastery, nextDue, retrievability, streak } from '../core/scheduler.js';
import { PalaceSchema } from '../core/schema.js';
import { decodeDeck, encodeDeck } from '../core/share.js';
import type { Deck, Palace } from '../core/types.js';
import { buildDeck } from '../net/architect-client.js';
import { stopAmbient, toggleAmbient } from './ambient.js';
import { mountDemo, span } from './demo.js';
import { createLandingScene } from './scene.js';

const DRAFT_KEY = 'loci.draft.v2';

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
  library: {
    list: () => Palace[];
    activate: (id: string) => void;
    remove: (id: string) => void;
    restore: (palace: Palace) => boolean;
  };
}

type Mode = Kind | 'number';
const MODES: { id: Mode; label: string; who: string; help: string; example: string; cta: string }[] = [
  {
    id: 'notes', label: 'My notes', who: 'Students, revision, anything already written down',
    help: 'Paste what you need to know. One thing per line works best, like term - meaning.',
    example: 'Mitochondria - makes energy for the cell\nRibosome - builds proteins\nNucleus - stores the DNA\nGolgi body - packages and ships proteins\nCell membrane - controls what enters and leaves',
    cta: 'Build my palace',
  },
  {
    id: 'topic', label: 'Teach me a topic', who: 'Curious minds of any age, starting from zero',
    help: 'Name a topic or paste a passage. The Palace Architect picks the key facts and teaches them to you.',
    example: 'How vaccines train the immune system', cta: 'Teach me',
  },
  {
    id: 'sequence', label: 'A speech or steps', who: 'Speakers, presenters, recipes, routines, checklists',
    help: 'Write your talking points or steps in order. You will recall them as one sweep of the room.',
    example: 'Open with the story about the lost luggage\nThank the hosts by name\nThe three things I learned from Asha\nThe toast: to curiosity',
    cta: 'Build my route',
  },
  {
    id: 'vocab', label: 'Words in a new language', who: 'Language learners and travellers',
    help: 'One word per line with its meaning. Each gets a sound-alike picture.',
    example: 'la biblioteca - the library\nel desayuno - breakfast\nla lluvia - the rain\nbarato - cheap\nla cuenta - the bill',
    cta: 'Build my palace',
  },
  {
    id: 'names', label: 'Names of people', who: 'A new job, a new class, a big family event',
    help: 'A detail, then the name, like "runs payroll - Farida". Pictures come from how the name sounds.',
    example: 'runs payroll - Farida\nmy desk neighbour - Tomasz\nthe team lead - Oluwaseun\nfront desk - Marguerite',
    cta: 'Build my palace',
  },
  {
    id: 'number', label: 'A number', who: 'Phone numbers, dates, codes, digits of pi',
    help: 'Type a number, with a label if you like. Each digit becomes the object it looks like. This one never leaves your device.',
    example: 'Grandma - 98450 12345', cta: 'Turn it into pictures',
  },
];

const HTML = `
<div class="sky" aria-hidden="true"></div>
<canvas class="cosmos" aria-hidden="true"></canvas>
<div class="progress" aria-hidden="true"><i data-progress></i></div>

<header class="bar">
  <a class="wordmark" href="#top" aria-label="Loci, back to top">Loci</a>
  <nav class="bar__nav" aria-label="Sections">
    <a href="#why">The science</a>
    <a href="#how">How it works</a>
    <a href="#try">Try it</a>
    <a href="#start">Build yours</a>
  </nav>
  <div class="bar__tools">
    <button class="tool" type="button" data-ambient aria-pressed="false">Sound off</button>
    <button class="pill" type="button" data-enter>Enter</button>
  </div>
</header>

<section class="s s--hero" id="top" data-stage="0" data-shift="0" data-dim="0.3">
  <div class="hero__inner">
    <p class="kicker">A memory palace, built out of the room you are in</p>
    <h1 id="landing-title">Your room remembers.</h1>
    <p class="lede">Loci rests what you are learning on your lamp, your shelf, your couch. It teaches you each piece,
    then brings it back at the exact moment you are about to forget it. A speech, a language, a new team's names,
    a whole subject. Whatever you are carrying.</p>
    <div class="cta-row">
      <button class="cta" type="button" data-enter>Enter your palace</button>
      <a class="ghost" href="#why">See the science</a>
    </div>
    <p class="fine" data-device-note>Hands only. Sitting down. Meta Quest 3 and 3S, nothing to install.</p>
    <p class="notice" data-shared hidden></p>
    <aside class="back-card" data-returning hidden></aside>
  </div>
  <div class="marquee" aria-hidden="true"><div class="marquee__track" data-marquee></div></div>
</section>

<section class="s" id="why" data-stage="1" data-shift="1" data-dim="0">
  <div class="copy">
    <h2>Your brain files memories by place.</h2>
    <p>Deep in the hippocampus, place cells fire when you stand in one exact spot, and grid cells map the space
    between. Their discovery won the 2014 Nobel Prize in Physiology or Medicine.</p>
    <p>Where something is turns out to be the strongest hook your memory has. When scientists scanned the
    brains of World Memory Championship competitors, they found no unusual intellect and no unusual anatomy,
    just heavy use of the regions that handle space. Nine of the ten said they used one old technique.</p>
    <div class="sources">
      <a href="https://www.nobelprize.org/prizes/medicine/2014/summary/" target="_blank" rel="noopener">Nobel Prize in Physiology or Medicine, 2014</a>
      <a href="https://doi.org/10.1038/nn988" target="_blank" rel="noopener">Maguire et al., Nature Neuroscience, 2003</a>
    </div>
  </div>
</section>

<section class="s" data-stage="2" data-shift="-1" data-dim="0">
  <div class="copy copy--right">
    <h2>That technique can be taught to anyone.</h2>
    <p>It is called the method of loci. You picture a place you know and leave each thing to remember at a spot
    along a walk through it. It is about 2,500 years old.</p>
    <div class="bars" data-bars role="img" aria-label="Words recalled from a list of 72: 26 before training, 62 after 40 days of training, 71 for memory athletes">
      <div class="bar-row"><span>Before training</span><i style="--v:26"></i><b>26</b></div>
      <div class="bar-row bar-row--gold"><span>After 40 days</span><i style="--v:62"></i><b>62</b></div>
      <div class="bar-row bar-row--dim"><span>Memory athletes</span><i style="--v:71"></i><b>71</b></div>
      <small>words recalled from a list of 72</small>
    </div>
    <p>In a 2017 study, people with ordinary memory practised for 30 minutes a day. Their recall more than
    doubled, and four months later, with no further training, they still remembered 22 more words than before.</p>
    <div class="sources">
      <a href="https://doi.org/10.1016/j.neuron.2017.02.003" target="_blank" rel="noopener">Dresler et al., Neuron, 2017</a>
    </div>
  </div>
</section>

<section class="s" data-stage="3" data-shift="1" data-dim="0">
  <div class="copy">
    <h2>And it works better when you are inside it.</h2>
    <p>The hard part was always imagining the palace clearly enough. When University of Maryland researchers
    let people explore a memory palace through a headset instead of on a desktop screen, recall improved by</p>
    <div class="stat"><b>8.8%</b><span>better recall inside the headset than at a screen</span></div>
    <p>So Loci skips the imagining. The room around you is the palace, and every memory has a real address.</p>
    <div class="sources">
      <a href="https://doi.org/10.1007/s10055-018-0346-3" target="_blank" rel="noopener">Krokos, Plaisant and Varshney, Virtual Reality, 2018</a>
    </div>
  </div>
</section>

<section class="s" id="how" data-stage="3" data-tiles="1" data-shift="-1" data-dim="0">
  <div class="copy copy--right">
    <h2>Loci builds the palace out of your own furniture.</h2>
    <ol class="steps">
      <li><h3>Place</h3><p>Loci reads your room and rests each memory on a different real object, in an order
      you can sweep with your eyes.</p></li>
      <li><h3>Study</h3><p>Each new memory shows its fact and a vivid little scene, rewritten so it happens
      on that very object. Picture it there once.</p></li>
      <li><h3>Leave</h3><p>Take the headset off. Everything stays anchored exactly where it landed.</p></li>
      <li><h3>Recall</h3><p>Come back when they glow. Remember first, pinch to peek, lift the memory if you
      knew it. Once you have mastered one, its cue disappears and only the place prompts you.</p></li>
    </ol>
  </div>
</section>

<section class="s s--wide" data-stage="3" data-tiles="1" data-shift="0" data-dim="0.9">
  <div class="panel">
    <h2>Two more things the research agrees on.</h2>
    <div class="duo">
      <article class="card">
        <h3>Recalling beats rereading</h3>
        <div class="bars bars--tight" role="img" aria-label="Recall after one week: 61 percent for students who tested themselves three times, 40 percent for students who only reread">
          <div class="bar-row bar-row--gold"><span>Tested themselves</span><i style="--v:61;--max:100"></i><b>61%</b></div>
          <div class="bar-row"><span>Reread four times</span><i style="--v:40;--max:100"></i><b>40%</b></div>
          <small>of a passage remembered one week later</small>
        </div>
        <p>Pulling a memory out strengthens it more than putting it back in. That is why Loci always asks you
        to recall before it lets you peek.</p>
        <div class="sources"><a href="https://doi.org/10.1111/j.1467-9280.2006.01693.x" target="_blank" rel="noopener">Roediger and Karpicke, Psychological Science, 2006</a></div>
      </article>
      <article class="card">
        <h3>Spacing beats cramming</h3>
        <figure class="curve">
          <svg viewBox="0 0 520 220" role="img" aria-labelledby="curve-title" data-curve><title id="curve-title">Forecast of how much you retain over 60 days</title></svg>
          <figcaption data-curve-caption></figcaption>
        </figure>
        <p>A review of 317 experiments found that spreading practice out improves retention, and that the best
        gap grows the longer you want to remember. Loci times every review for you.</p>
        <div class="sources"><a href="https://doi.org/10.1037/0033-2909.132.3.354" target="_blank" rel="noopener">Cepeda et al., Psychological Bulletin, 2006</a></div>
      </article>
    </div>
  </div>
</section>

<section class="s s--wide" id="try" data-stage="3" data-tiles="1" data-shift="0" data-dim="1">
  <div class="panel">
    <h2>Try one recall, right here.</h2>
    <p class="panel__lede">This is the loop you will do in your room. The schedule you get back is the real one.</p>
    <div class="demo" data-demo></div>
  </div>
</section>

<section class="s s--wide" id="start" data-stage="0" data-shift="0" data-dim="0.85">
  <div class="panel">
    <h2>What are you carrying?</h2>
    <p class="panel__lede">Tell Loci in whatever form you have it. The Palace Architect turns it into memories
    and teaches them to you in your room.</p>
    <div class="modes" role="tablist" aria-label="What to remember" data-modes></div>
    <div class="builder">
      <p class="builder__help" data-help></p>
      <label class="sr-only" for="notes">What you want to remember</label>
      <textarea id="notes" rows="6" spellcheck="true" data-notes></textarea>
      <div class="builder__row">
        <button class="btn-soft btn-soft--primary" type="button" data-build>Build my palace</button>
        <div class="seg" role="group" aria-label="Who is learning" data-audience>
          <button type="button" data-aud="child" aria-pressed="false">For a child</button>
          <button type="button" data-aud="teen" aria-pressed="false">A teen</button>
          <button type="button" data-aud="adult" aria-pressed="true">An adult</button>
        </div>
        <button class="link" type="button" data-example>Show me an example</button>
        <span class="builder__count" data-count-lines></span>
      </div>
      <p class="builder__status" role="status" aria-live="polite" data-build-status></p>
      <ol class="preview" data-preview-list hidden></ol>
    </div>
    <p class="samples">Or start with a sample: <span data-samples></span></p>
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

<section class="s s--wide" id="library" data-stage="0" data-shift="0" data-dim="0.85" hidden>
  <div class="panel">
    <h2>Your palaces</h2>
    <p class="panel__lede">Each one lives in your room. Strength is the scheduler's estimate of how likely you are
    to recall each memory right now.</p>
    <div class="library" data-library></div>
    <div class="data-row">
      <label class="link" tabindex="0">Restore a palace file<input type="file" accept="application/json,.json" data-import hidden /></label>
      <span class="fine" role="status" aria-live="polite" data-data-status></span>
    </div>
  </div>
</section>

<section class="s s--wide" id="faq" data-stage="0" data-shift="0" data-dim="0.6">
  <div class="panel panel--quiet">
    <h2>Good to know</h2>
    <details><summary>What do I need?</summary><p>A Meta Quest 3 or 3S and this page open in its browser.
    Nothing to install. Run Space Setup once so Loci knows where your furniture is. Without it, memories float
    in a gentle arc around you instead.</p></details>
    <details><summary>Is it only for students?</summary><p>No. People use memory palaces for speeches, languages,
    names, numbers, routines and shopping lists. There is a setting for younger learners that keeps the words
    simple, and a read-aloud option for anyone who prefers to listen.</p></details>
    <details><summary>Do I have to move around?</summary><p>No. Loci is made for sitting. Memories are placed
    where you can see them by turning your head, and far ones are drawn larger.</p></details>
    <details><summary>What if I cannot pinch or lift my arm?</summary><p>Open Comfort and access on the panel in
    your room. Look to select lets you flip and rate memories just by looking. There are also high contrast,
    larger tiles, calm motion, read aloud and a sound switch.</p></details>
    <details><summary>Can I trust what the Architect writes?</summary><p>You review every memory before it goes
    into your room and can remove any of them. When you ask it to teach a topic, it is told to use only
    well-established facts, but it can still be wrong, so check anything that matters against your own source.</p></details>
    <details><summary>Where does my data go?</summary><p>Your palaces and progress stay in this browser on this
    device. Text is sent to the Palace Architect only when you press the build button. Numbers are converted on
    your device and are never sent anywhere.</p></details>
    <div class="refs">
      <h3>The research, in full</h3>
      <ol>
        <li>O'Keefe, Moser and Moser. <a href="https://www.nobelprize.org/prizes/medicine/2014/summary/" target="_blank" rel="noopener">The Nobel Prize in Physiology or Medicine 2014</a>, for the cells that form the brain's positioning system.</li>
        <li>Maguire, Valentine, Wilding and Kapur (2003). <a href="https://doi.org/10.1038/nn988" target="_blank" rel="noopener">Routes to remembering: the brains behind superior memory</a>. Nature Neuroscience 6, 90-95.</li>
        <li>Dresler et al. (2017). <a href="https://doi.org/10.1016/j.neuron.2017.02.003" target="_blank" rel="noopener">Mnemonic training reshapes brain networks to support superior memory</a>. Neuron 93, 1227-1235.</li>
        <li>Krokos, Plaisant and Varshney (2018). <a href="https://doi.org/10.1007/s10055-018-0346-3" target="_blank" rel="noopener">Virtual memory palaces: immersion aids recall</a>. Virtual Reality 23, 1-15.</li>
        <li>Roediger and Karpicke (2006). <a href="https://doi.org/10.1111/j.1467-9280.2006.01693.x" target="_blank" rel="noopener">Test-enhanced learning: taking memory tests improves long-term retention</a>. Psychological Science 17, 249-255.</li>
        <li>Cepeda, Pashler, Vul, Wixted and Rohrer (2006). <a href="https://doi.org/10.1037/0033-2909.132.3.354" target="_blank" rel="noopener">Distributed practice in verbal recall tasks</a>. Psychological Bulletin 132, 354-380.</li>
        <li>Scheduling uses <a href="https://github.com/open-spaced-repetition/ts-fsrs" target="_blank" rel="noopener">FSRS</a>, an open spaced-repetition algorithm.</li>
      </ol>
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
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  $('[data-marquee]').innerHTML = [
    'a wedding toast', 'forty Spanish verbs', 'the Krebs cycle', 'everyone at the new job', 'the twelve cranial nerves',
    "grandma's phone number", 'a conference talk', 'the periodic table', 'this week’s shopping', 'lines for the school play',
    'the bones of the hand', 'a magic trick, in order',
  ]
    .map((t) => `<span>${t}</span>`)
    .join('')
    .repeat(2);

  /* ---------------------------------------------------- 3D backdrop */
  const scene = createLandingScene($<HTMLCanvasElement>('.cosmos'));
  const progressBar = $('[data-progress]');
  const num = (el: HTMLElement, k: string) => Number(el.dataset[k] ?? 0);
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const sections = $$('section.s').filter((s) => !s.hidden);
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

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')),
    { root, threshold: 0.25 },
  );
  $$('section.s').forEach((s) => io.observe(s));

  // A soft light follows the pointer across glass panels.
  root.addEventListener(
    'pointermove',
    (e) => {
      const p = (e.target as HTMLElement).closest<HTMLElement>('.panel, .card, .palace');
      if (!p) return;
      const r = p.getBoundingClientRect();
      p.style.setProperty('--mx', `${e.clientX - r.left}px`);
      p.style.setProperty('--my', `${e.clientY - r.top}px`);
    },
    { passive: true },
  );

  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const target = root.querySelector<HTMLElement>(a.getAttribute('href')!);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  });

  /* ---------------------------------------------------- forgetting curve */
  {
    const { points, reviews } = forgettingCurves(60, 0.5);
    const X = (d: number) => 44 + (d / 60) * 460;
    const Y = (v: number) => 20 + ((1 - Math.max(0.4, v)) / 0.6) * 160;
    const path = (k: 'once' | 'spaced') => points.map((p, i) => `${i ? 'L' : 'M'}${X(p.day).toFixed(1)} ${Y(p[k]).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    $('[data-curve]').insertAdjacentHTML(
      'beforeend',
      `${[1, 0.8, 0.6].map((v) => `<line class="grid" x1="44" x2="504" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="36" y="${Y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`).join('')}
       ${[0, 20, 40, 60].map((d) => `<text class="tick" x="${X(d)}" y="204" text-anchor="middle">${d === 0 ? 'today' : `day ${d}`}</text>`).join('')}
       <path class="line line--once" d="${path('once')}"/>
       <path class="line line--spaced" d="${path('spaced')}"/>
       ${reviews.map((d) => `<circle class="dot" cx="${X(d)}" cy="${Y(points.find((p) => p.day >= d)?.spaced ?? 0.9)}" r="4"/>`).join('')}
       <text class="lab lab--spaced" x="${X(60)}" y="${Y(last.spaced) - 10}" text-anchor="end">recalled on schedule</text>
       <text class="lab lab--once" x="${X(60)}" y="${Y(last.once) + 18}" text-anchor="end">learned once</text>`,
    );
    const floor = Math.min(...points.map((p) => p.spaced));
    $('[data-curve-caption]').textContent = `Forecast from the scheduling model Loci uses: ${reviews.length} short recalls over 60 days keep a memory above ${Math.floor(floor * 100)}%, against ${Math.round(last.once * 100)}% by day 60 if you learn it once. A model's estimate, not a measurement of you.`;
  }

  /* ---------------------------------------------------- state */
  let chosen: Deck | null = null;
  let built: Deck | null = null;
  let hasXR = true;
  let mode: Mode = 'notes';
  let audience: Audience = 'adult';
  const enterButtons = $$<HTMLButtonElement>('[data-enter]');
  const chosenBox = $('[data-chosen]');

  const paintEnter = () => {
    const palace = opts.getPalace();
    const label = !hasXR
      ? chosen ? `Preview "${chosen.title}" here` : 'Preview on this screen'
      : chosen ? `Enter with "${chosen.title}"` : palace ? 'Continue my palace' : 'Enter your palace';
    enterButtons.forEach((b) => (b.textContent = b.classList.contains('pill') ? (hasXR ? 'Enter' : 'Preview') : label));
    chosenBox.hidden = !chosen;
    if (chosen) {
      $('[data-chosen-text]').textContent = `${chosen.title}: ${chosen.items.length} ${chosen.items.length === 1 ? 'memory' : 'memories'}, ready to be placed around your room. Palaces you already have stay in your library.`;
    }
  };
  const choose = (deck: Deck | null) => {
    chosen = deck;
    $$('[data-sample]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sample === deck?.id)));
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

  /* ---------------------------------------------------- builder */
  const notes = $<HTMLTextAreaElement>('[data-notes]');
  const buildBtn = $<HTMLButtonElement>('[data-build]');
  const buildStatus = $('[data-build-status]');
  const previewList = $<HTMLOListElement>('[data-preview-list]');
  const countEl = $('[data-count-lines]');
  const drafts: Partial<Record<Mode, string>> = (() => {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Record<Mode, string>>;
    } catch {
      return {};
    }
  })();

  $('[data-modes]').innerHTML = MODES.map(
    (m) => `<button type="button" role="tab" class="mode" data-mode="${m.id}" aria-selected="false">
      <span class="mode__label">${m.label}</span><span class="mode__who">${m.who}</span></button>`,
  ).join('');
  $('[data-samples]').innerHTML = STARTER_DECKS.map(
    (d) => `<button type="button" class="chip" data-sample="${d.id}" aria-pressed="false">${esc(d.items[0].glyphs[0])} ${esc(d.title)}</button>`,
  ).join('');

  const paintCount = () => {
    if (mode === 'topic' || mode === 'number') return (countEl.textContent = '');
    const n = notes.value.split('\n').filter((l) => l.trim()).length;
    countEl.textContent = n ? `${Math.min(n, 12)} of 12 lines${n > 12 ? ' (extra lines are left out)' : ''}` : '';
  };
  const setMode = (id: Mode) => {
    mode = id;
    const m = MODES.find((x) => x.id === id)!;
    $$('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === id)));
    $('[data-help]').textContent = m.help;
    notes.placeholder = m.example;
    notes.value = drafts[id] ?? '';
    notes.rows = id === 'topic' || id === 'number' ? 2 : 6;
    buildBtn.textContent = m.cta;
    $('[data-audience]').hidden = id === 'number';
    paintCount();
  };
  $('[data-modes]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
    if (b) {
      setMode(b.dataset.mode as Mode);
      notes.focus();
    }
  });
  $('[data-audience]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-aud]');
    if (!b) return;
    audience = b.dataset.aud as Audience;
    $$('[data-aud]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  notes.addEventListener('input', () => {
    paintCount();
    drafts[mode] = notes.value;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    } catch {
      /* private mode */
    }
  });
  notes.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') buildBtn.click();
  });
  $('[data-example]').addEventListener('click', () => {
    notes.value = MODES.find((m) => m.id === mode)!.example;
    notes.dispatchEvent(new Event('input'));
    notes.focus();
  });
  $('[data-samples]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sample]');
    if (!b) return;
    built = STARTER_DECKS.find((d) => d.id === b.dataset.sample) ?? null;
    buildStatus.textContent = built ? `${built.title}: ${built.subtitle}.` : '';
    paintPreview();
    choose(built);
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
    built = { ...built, id: `${built.id.split('~')[0]}~${items.length}`, items };
    paintPreview();
    choose(built);
  });

  buildBtn.addEventListener('click', async () => {
    const m = MODES.find((x) => x.id === mode)!;
    if (mode === 'number') {
      built = deckFromNumber(notes.value);
      buildStatus.textContent = built
        ? `${built.subtitle}. Converted on this device; nothing was sent anywhere.`
        : 'Type a number with at least three digits.';
      if (built) {
        paintPreview();
        choose(built);
      }
      return;
    }
    buildBtn.disabled = true;
    buildBtn.textContent = 'Building...';
    buildStatus.textContent = mode === 'topic'
      ? 'The Palace Architect is choosing the key facts and turning them into pictures...'
      : 'The Palace Architect is turning your words into pictures. This takes a few seconds.';
    const result = await buildDeck(notes.value, mode, audience);
    buildBtn.disabled = false;
    buildBtn.textContent = m.cta;
    if (!result.ok) {
      buildStatus.textContent = result.error;
      notes.focus();
      return;
    }
    built = result.deck;
    buildStatus.textContent =
      result.via === 'architect'
        ? `Built ${built.items.length} memories in ${(result.ms / 1000).toFixed(1)} s.${result.repaired ? ` ${result.repaired} picture${result.repaired > 1 ? 's were' : ' was'} replaced by the safety check.` : ''}${mode === 'topic' ? ' Check the facts against your own source, remove any you do not want,' : ' Remove any you do not want,'} then enter.`
        : `Built ${built.items.length} memories straight from your lines, because the Palace Architect is unavailable right now.`;
    paintPreview();
    choose(built);
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

  /* ---------------------------------------------------- library */
  const libSection = $('#library');
  const libEl = $('[data-library]');
  const returning = $('[data-returning]');
  const dataStatus = $('[data-data-status]');
  const shareUrl = async (deck: Deck) => `${location.origin}${location.pathname}#p=${await encodeDeck(deck)}`;

  const paintLibrary = () => {
    const all = opts.library.list();
    const active = opts.getPalace();
    const now = new Date();
    libSection.hidden = all.length === 0;
    libEl.innerHTML = all
      .map((p) => {
        const due = dueIds(p, now).length;
        const next = nextDue(p);
        const days = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(now.getTime() - (13 - i) * 86_400_000).toDateString();
          return p.history.some((h) => new Date(h.at).toDateString() === d);
        });
        return `<article class="palace${active?.id === p.id ? ' is-active' : ''}" data-id="${esc(p.id)}">
          <header><h3>${esc(p.deck.title)}</h3><span>${p.deck.items.length} memories${active?.id === p.id ? ', in your room now' : ''}</span></header>
          <dl>
            <div><dt>${due}</dt><dd>${due ? 'glowing now' : next ? `next in ${span(next.getTime() - now.getTime())}` : 'due'}</dd></div>
            <div><dt>${Math.round(mastery(p) * 100)}%</dt><dd>mastered</dd></div>
            <div><dt>${streak(p.history, now)}</dt><dd>day streak</dd></div>
          </dl>
          <div class="strength" role="img" aria-label="Strength of each memory">${p.deck.items
            .map((it) => {
              const c = p.cards[it.id];
              const v = c ? retrievability(c, now) : 0;
              return `<i title="${esc(it.cue)}: ${c && c.reps ? `${Math.round(v * 100)}% likely to recall` : 'not studied yet'}" style="--v:${c && c.reps ? Math.max(0.06, v) : 0.06}"></i>`;
            })
            .join('')}</div>
          <div class="days" role="img" aria-label="Practice over the last 14 days">${days.map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('')}<span>last 14 days</span></div>
          <div class="palace__actions">
            ${active?.id === p.id ? '' : '<button class="btn-soft" type="button" data-act="open">Put it in my room</button>'}
            <button class="link" type="button" data-act="share">Share</button>
            <button class="link" type="button" data-act="remind">Calendar reminder</button>
            <button class="link" type="button" data-act="download">Download</button>
            <button class="link link--danger" type="button" data-act="delete">Delete</button>
          </div>
          <p class="fine" role="status" aria-live="polite" data-palace-status></p>
        </article>`;
      })
      .join('');

    returning.hidden = !active;
    if (active) {
      const due = dueIds(active, now).length;
      const next = nextDue(active);
      returning.innerHTML = `<p class="back-card__title">Welcome back. ${esc(active.deck.title)} is in your room.</p>
        <p class="back-card__line">${due ? `${due} ${due === 1 ? 'memory is' : 'memories are'} glowing, ready to recall.` : next ? `Nothing due. Next review in ${span(next.getTime() - now.getTime())}.` : ''}
        ${all.length > 1 ? `<a href="#library">${all.length} palaces in your library</a>` : '<a href="#library">See its strength</a>'}</p>`;
    }
    onScroll();
  };

  const download = (name: string, text: string, type: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  libEl.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    const card = b?.closest<HTMLElement>('[data-id]');
    if (!b || !card) return;
    const palace = opts.library.list().find((p) => p.id === card.dataset.id);
    if (!palace) return;
    const status = card.querySelector<HTMLElement>('[data-palace-status]')!;
    const slug = palace.deck.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    switch (b.dataset.act) {
      case 'open':
        opts.library.activate(palace.id);
        choose(null);
        paintLibrary();
        paintEnter();
        break;
      case 'share': {
        const url = await shareUrl(palace.deck);
        try {
          if (navigator.share) await navigator.share({ title: `Loci: ${palace.deck.title}`, url });
          else {
            await navigator.clipboard.writeText(url);
            status.textContent = 'Link copied. It rebuilds around their furniture, not yours.';
          }
        } catch {
          status.textContent = url;
        }
        break;
      }
      case 'remind': {
        const due = nextDue(palace) ?? new Date();
        const at = new Date(Math.max(due.getTime(), Date.now() + 5 * 60_000));
        const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
        download(
          `loci-${slug}.ics`,
          ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Loci//EN', 'BEGIN:VEVENT', `UID:${palace.id}-${at.getTime()}@loci`, `DTSTAMP:${stamp(new Date())}`,
            `DTSTART:${stamp(at)}`, `DTEND:${stamp(new Date(at.getTime() + 10 * 60_000))}`, `SUMMARY:Loci: recall ${palace.deck.title}`,
            `DESCRIPTION:Your memories are glowing. ${location.origin}${location.pathname}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'),
          'text/calendar',
        );
        status.textContent = 'Calendar file downloaded for your next review.';
        break;
      }
      case 'download':
        download(`loci-${slug}.json`, JSON.stringify(palace, null, 2), 'application/json');
        break;
      case 'delete':
        if (b.dataset.armed) {
          opts.library.remove(palace.id);
          paintLibrary();
          paintEnter();
        } else {
          b.dataset.armed = '1';
          b.textContent = 'Really delete?';
          setTimeout(() => {
            delete b.dataset.armed;
            b.textContent = 'Delete';
          }, 4000);
        }
        break;
    }
  });
  $<HTMLInputElement>('[data-import]').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const parsed = PalaceSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success || !opts.library.restore(parsed.data as Palace)) throw new Error('invalid');
      dataStatus.textContent = 'Palace restored.';
      paintLibrary();
      paintEnter();
    } catch {
      dataStatus.textContent = 'That file is not a Loci palace, or this browser cannot save it.';
    }
  });

  /* ---------------------------------------------------- demo + ambient */
  mountDemo($('[data-demo]'), () => $('#start').scrollIntoView({ behavior: calm ? 'auto' : 'smooth' }));
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
      built = r.deck;
      choose(r.deck);
    });
  }

  /* ---------------------------------------------------- headset check */
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
  const noXR = () => {
    hasXR = false;
    $('[data-device-note]').textContent =
      'Mixed reality needs a Quest 3 or 3S. On this screen you can read the science, try a recall and build a palace to send to a headset.';
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

  setMode('notes');
  paintEnter();
  paintLibrary();

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
      paintLibrary();
    },
    focusNotes: () => {
      api.show();
      $('#start').scrollIntoView();
      notes.focus();
    },
  };
  return api;
}
