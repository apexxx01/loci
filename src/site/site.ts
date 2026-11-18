/**
 * The Loci website: a memory palace you walk through.
 *
 * Scrolling walks you through a palace of light. You carry five things in,
 * leave one at each place, and at the door you walk back in your mind and
 * recall them. Then the camera rises over the palace and the rest of the
 * page is the product: build a palace for anything, recall what is glowing,
 * the headset, the Palace Architect, the research and its sources.
 */
import { startMeteors } from './parts/meteors';
import '@fontsource/marcellus/400.css';
import '@fontsource-variable/lexend/wght.css';
import 'lenis/dist/lenis.css';
import Lenis from 'lenis';
import './site.css';
import type { Audience, Kind } from '../core/architect.js';
import { STARTER_DECKS } from '../core/decks.js';
import { deckFromNumber } from '../core/numbers.js';
import { dueIds, mastery, nextDue, streak } from '../core/scheduler.js';
import { DeckSchema, PalaceSchema } from '../core/schema.js';
import { decodeDeck, encodeDeck } from '../core/share.js';
import { buildReminders, reviewTimes } from '../core/reminders.js';
import type { Deck, Palace, ReviewEvent } from '../core/types.js';
import { buildDeck, gradeExplanation, teachConcept, verifyConcept } from '../net/architect-client.js';
import { LOCI_METHOD } from '../core/concepts.js';
import { ambientOn, breatheTone, chime, stopAmbient, toggleAmbient } from './parts/ambient.js';
import { AUDIENCES, HEADSET, PIPELINE, RECEIPTS, ROADMAP, WEAVE } from './parts/features.js';
import { openReview } from './parts/review.js';
import { span } from './time.js';
import { createWorld, STATIONS } from './world.js';

export interface SiteOptions {
  launchXR: () => void;
  onDeckReady: (deck: Deck | null) => void;
  onPreviewDeck: (deck: Deck | null) => void;
  getPalace: () => Palace | null;
  library: {
    list: () => Palace[];
    activate: (id: string) => void;
    remove: (id: string) => void;
    review: (id: string, memoryId: string, rating: ReviewEvent['rating']) => Palace | null;
    restore: (palace: Palace) => boolean;
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------------ the walk */
// The walk carries a concept: stage 1 at the gate, then the fountain, the
// lantern grove, the stair and the moon pool. Longer concepts share the pool.
const WALK_STOPS = 5;

/* ------------------------------------------------------------------ the studio */
type Mode = Kind | 'number';
const MODES: { id: Mode; label: string; who: string; help: string; example: string; cta: string }[] = [
  { id: 'notes', label: 'My notes', who: 'Revision, and anything already written down', help: 'One thing per line, like term - meaning.',
    example: 'Mitochondria - makes energy for the cell\nRibosome - builds proteins\nNucleus - stores the DNA\nGolgi body - packages and ships proteins\nCell membrane - controls what enters and leaves', cta: 'Build my palace' },
  { id: 'topic', label: 'A topic', who: 'Start from nothing, at any age', help: 'Name a topic or paste a passage. The Palace Architect picks the key facts and teaches them.',
    example: 'How vaccines train the immune system', cta: 'Teach me' },
  { id: 'sequence', label: 'A speech', who: 'Talks, toasts, steps and routines', help: 'Your points or steps, in order. You will recall them as one walk around the room.',
    example: 'Open with the story about the lost luggage\nThank the hosts by name\nThe three things I learned from Asha\nThe toast: to curiosity', cta: 'Build my route' },
  { id: 'vocab', label: 'A language', who: 'Words you want to keep', help: 'One word per line with its meaning. Each one gets a picture that sounds like it.',
    example: 'la biblioteca - the library\nel desayuno - breakfast\nla lluvia - the rain\nbarato - cheap\nla cuenta - the bill', cta: 'Build my palace' },
  { id: 'names', label: 'Names', who: 'A new job, a new class, a family gathering', help: 'A detail, then the name, like runs payroll - Farida.',
    example: 'runs payroll - Farida\nmy desk neighbour - Tomasz\nthe team lead - Oluwaseun\nfront desk - Marguerite', cta: 'Build my palace' },
  { id: 'number', label: 'A number', who: 'Phone numbers, dates and codes', help: 'Each digit becomes the object it looks like. This never leaves your device.',
    example: 'Grandma - 98450 12345', cta: 'Turn it into pictures' },
];

const FAQ: [string, string][] = [
  ['What do I need?', 'A Meta Quest 3 or 3S, and this page open in its browser. Nothing to install. Run Space Setup once so Loci knows where your furniture is. Without it, memories rest in a gentle arc around you instead.'],
  ['I do not have a headset.', 'You can still walk this palace, build palaces, and recall what is due from this page on any screen; the schedule is the same one the headset uses. Send a palace to anyone with a link.'],
  ['Is it only for students?', 'No. People use memory palaces for speeches, languages, names, numbers, routines and shopping lists. A setting for younger learners keeps the words simple, and read-aloud is there for anyone who would rather listen.'],
  ['Do I have to move around?', 'No. Loci is made for sitting. Memories are placed where you can see them by turning your head, and the far ones are drawn larger.'],
  ['What if I cannot pinch or lift my arm?', 'Open Comfort and access on the panel in your room and turn on Look to select. Then everything works by looking alone: hold your gaze on a button or a stage and a ring fills, then it presses. On Meta VR Glasses your eyes aim; on Quest 3 your head does. There is also high contrast, larger tiles, calm motion, read-aloud and a sound switch.'],
  ['Can I trust what the Architect writes?', 'You see every memory before it reaches your room and can remove any of them. When it teaches a topic it is asked to use only well-established facts, but it can still be wrong, so check anything important against your own source.'],
  ['Where does my data go?', 'Your palaces and progress stay in this browser, on this device. Text goes to the Palace Architect only when you press build. Numbers are converted on your device and never sent anywhere. There are no accounts.'],
];

const SOURCES: { n: string; text: string; ref: string; url: string }[] = [
  { n: '2014', text: 'Nobel Prize for the discovery of place cells and grid cells, the brain’s positioning system.', ref: 'O’Keefe, Moser and Moser. The Nobel Prize in Physiology or Medicine 2014.', url: 'https://www.nobelprize.org/prizes/medicine/2014/summary/' },
  { n: '9 of 10', text: 'of the memory champions studied used the method of loci; their brains were otherwise ordinary.', ref: 'Maguire, Valentine, Wilding and Kapur (2003). Routes to remembering: the brains behind superior memory. Nature Neuroscience 6, 90-95.', url: 'https://doi.org/10.1038/nn988' },
  { n: '26 to 62', text: 'words recalled out of 72 after 40 days of 30-minute practice, by people with ordinary memory.', ref: 'Dresler et al. (2017). Mnemonic training reshapes brain networks to support superior memory. Neuron 93, 1227-1235.', url: 'https://doi.org/10.1016/j.neuron.2017.02.003' },
  { n: '8.8%', text: 'better recall when a memory palace was explored in a headset instead of on a desktop screen.', ref: 'Krokos, Plaisant and Varshney (2018). Virtual memory palaces: immersion aids recall. Virtual Reality 23, 1-15.', url: 'https://doi.org/10.1007/s10055-018-0346-3' },
  { n: '61% vs 40%', text: 'of a passage remembered a week later by students who tested themselves, against those who reread it.', ref: 'Roediger and Karpicke (2006). Test-enhanced learning. Psychological Science 17, 249-255.', url: 'https://doi.org/10.1111/j.1467-9280.2006.01693.x' },
  { n: '317', text: 'experiments reviewed: spacing practice out improves retention, and the best gap grows with how long you want to remember.', ref: 'Cepeda, Pashler, Vul, Wixted and Rohrer (2006). Distributed practice in verbal recall tasks. Psychological Bulletin 132, 354-380.', url: 'https://doi.org/10.1037/0033-2909.132.3.354' },
];

/* ------------------------------------------------------------------ markup */
const html = () => `
<canvas class="sky" aria-hidden="true"></canvas>
<canvas class="meteors" aria-hidden="true"></canvas>
<button class="scrollcue" type="button" data-scrollcue inert><span data-scrollcue-text>Scroll to walk the room</span><i aria-hidden="true"><b></b></i></button>

<header class="top">
  <a class="brand" href="#top" aria-label="Loci, back to the start">Loci</a>
  <nav class="menu" aria-label="Sections">
    <a href="#walk" data-to="walk">The walk</a>
    <a href="#room" data-to="room">In your room</a>
    <a href="#build" data-to="build">Build</a>
    <a href="#palaces" data-to="palaces" data-nav-palaces hidden>Your palaces</a>
    <a href="#science" data-to="science">Science</a>
  </nav>
  <div class="tools">
    <button class="tool tool--sound" type="button" data-sound aria-pressed="false" aria-label="Sound"><i></i><i></i><i></i></button>
    <button class="b b--small" type="button" data-enter>Enter</button>
  </div>
</header>

<nav class="map" aria-label="Places in the palace" data-map>
  ${STATIONS.map((s, i) => `<button type="button" data-goto="${i}" aria-label="Go to ${s.name}"><i></i><span>${cap(s.name.replace('the ', ''))}</span></button>`).join('')}
</nav>

<div class="flow" data-flow>
<section class="walk" id="walk" aria-label="Walk through the palace" style="--n:${STATIONS.length}">
  <div class="stage">

    <article class="station station--approach" id="top" data-station="0">
      <p class="kicker">A memory palace for Meta Quest 3 and 3S</p>
      <h1>Your room<br />remembers.</h1>
      <p class="lede">Ask about anything, or paste your notes. Loci turns it into a chain of stages, sets each one on a
      piece of furniture, and keeps checking you on the myths people believe until it makes sense.</p>
      <div class="xr-now" data-xr-now hidden>
        <p>You are in a headset. Your room is ready.</p>
        <button class="b" type="button" data-enter>Put it in my room</button>
      </div>
      <form class="ask" data-ask autocomplete="off">
        <label class="sr" for="ask">What do you want to understand?</label>
        <div class="ask__box" data-ask-box>
          <textarea id="ask" rows="1" data-ask-input maxlength="4000" spellcheck="true" data-lenis-prevent></textarea>
          <span class="ask__ghost" aria-hidden="true" data-ghost></span>
          <div class="ask__bar">
            <div class="ask__for" role="group" aria-label="Explain it for">
              <span>For</span>
              <button type="button" data-hero-aud="child" aria-pressed="false">a child</button>
              <button type="button" data-hero-aud="teen" aria-pressed="false">a teen</button>
              <button type="button" data-hero-aud="adult" aria-pressed="true">an adult</button>
            </div>
            <span class="ask__meta" data-ask-meta>Drop a text file or paste notes</span>
            <button class="ask__mic" type="button" data-mic hidden aria-pressed="false" aria-label="Ask out loud"><i></i></button>
            <button class="b" type="submit" data-ask-go>Teach me</button>
          </div>
        </div>
        <ol class="ask__steps" data-ask-steps hidden>
          <li>Finding the key stages</li><li>Working out why each one is true</li><li>Collecting the myths people believe</li><li>Placing them in the room</li>
        </ol>
        <p class="ask__status" role="status" aria-live="polite" data-ask-status></p>
        <div class="ask__done" data-ask-done hidden></div>
        <p class="ask__mine" data-mine hidden></p>
      </form>
      <p class="note" data-device-note>Hands only, sitting down, right in the headset browser.</p>
      <p class="note note--warm" data-shared hidden></p>
      <div class="welcome" data-returning hidden></div>
    </article>

    ${STATIONS.slice(1, 6).map((st, i) => `<article class="station station--${st.side > 0 ? 'left' : 'right'}" data-station="${i + 1}" aria-labelledby="st-${i + 1}">
        <p class="kicker" data-kicker>Stage ${i + 1}, at ${esc(st.name)}</p>
        <h2 id="st-${i + 1}" data-cue></h2>
        <p class="claim" data-claim></p>
        <p class="why" data-why></p>
        <p class="picture" data-scene></p>
        <p class="doubt" data-doubt hidden></p>
        <div class="myth" data-myth>
          <p class="myth__q">Which is true?</p>
          <div class="myth__opts"><button type="button" data-opt="0"></button><button type="button" data-opt="1"></button></div>
          <p class="myth__v" role="status" aria-live="polite" data-verdict></p>
        </div>
        <p class="link" data-link></p>
      </article>`).join('')}

    <article class="station station--door" data-station="6" aria-labelledby="st-door">
      <p class="kicker">At the door</p>
      <h2 id="st-door">Now explain it back.</h2>
      <p data-door-lede>In your own words, how does it work? A sentence or two is enough.</p>
      <div class="order" data-order>
        <p class="order__q">Or first, put the stages back in order:</p>
        <ol class="order__slots" data-slots></ol>
        <div class="order__pool" data-pool></div>
        <p class="order__v" role="status" aria-live="polite" data-order-v></p>
      </div>
      <form class="explain" data-explain autocomplete="off">
        <textarea rows="4" data-explain-input data-lenis-prevent aria-labelledby="st-door"></textarea>
        <div class="explain__go"><button class="b" type="submit" data-explain-go>Check my explanation</button>
        <button class="linkish" type="button" data-walk-again>Walk it again</button></div>
      </form>
      <div class="result" data-result hidden></div>
    </article>
  </div>
</section>

<div class="after">

<section class="sec" id="room" aria-labelledby="room-title">
  <header class="sec__head">
    <h2 id="room-title">In your own room.</h2>
    <p>Everything you just did, done with your real furniture. Put on a Quest 3 or 3S, open this page, and Loci builds
    the palace around you. Here is every part of it. The ones marked tested are checked by our mixed-reality test suite.</p>
  </header>
  <ol class="parts">
    ${HEADSET.map((f, i) => `<li><span class="parts__n">${String(i + 1).padStart(2, '0')}</span><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p>${f.verified ? `<p class="tested"><i></i>${esc(f.verified)}</p>` : ''}</li>`).join('')}
  </ol>
  <div class="enter-strip">
    <p>Ready when you are. It opens straight in the Quest browser.</p>
    <button class="b" type="button" data-enter>Enter your palace</button>
  </div>
</section>

<section class="sec" id="build" aria-labelledby="build-title">
  <header class="sec__head">
    <h2 id="build-title">Build a palace for anything.</h2>
    <p>Bring it in whatever shape you have it. The Palace Architect turns it into memories, each with a picture that
    happens on a real object in your room. You check every one before it goes in.</p>
  </header>
  <div class="studio">
    <div class="kinds" role="tablist" aria-label="What are you remembering?" data-modes></div>
    <div class="desk">
      <label class="desk__help" for="notes" data-help></label>
      <textarea id="notes" rows="6" spellcheck="true" data-notes data-lenis-prevent></textarea>
      <div class="desk__row">
        <div class="seg" role="group" aria-label="Written for" data-audience>
          <button type="button" data-aud="child" aria-pressed="false">A child</button>
          <button type="button" data-aud="teen" aria-pressed="false">A teenager</button>
          <button type="button" data-aud="adult" aria-pressed="true">An adult</button>
        </div>
        <span class="desk__count" data-count></span>
      </div>
      <div class="desk__go">
        <button class="b" type="button" data-build>Build my palace</button>
        <button class="linkish" type="button" data-example>Fill in an example</button>
      </div>
      <p class="status" role="status" aria-live="polite" data-status></p>
      <p class="samples">Or start with one of ours: <span data-samples></span></p>
    </div>
  </div>
  <ol class="memories" data-memories hidden></ol>
  <div class="chosen" data-chosen hidden>
    <p data-chosen-text></p>
    <div class="chosen__go">
      <button class="b" type="button" data-enter>Enter with it</button>
      <button class="b b--line" type="button" data-walk-deck>Walk it on this page</button>
      <button class="linkish" type="button" data-copy-link>Copy a link for your headset</button>
    </div>
    <p class="small" role="status" aria-live="polite" data-link-status></p>
  </div>
</section>

<section class="sec" id="palaces" aria-labelledby="palaces-title" hidden>
  <header class="sec__head">
    <h2 id="palaces-title">Your palaces.</h2>
    <p data-palaces-lede></p>
  </header>
  <div class="palaces" data-palaces></div>
  <p class="restore"><label class="linkish" tabindex="0">Restore a palace from a file<input type="file" accept="application/json,.json" data-import hidden /></label>
  <span class="small" role="status" aria-live="polite" data-import-status></span></p>
</section>

<section class="sec" id="architect" aria-labelledby="architect-title">
  <header class="sec__head">
    <h2 id="architect-title">The Palace Architect.</h2>
    <p>Inventing a vivid picture is the hardest part of the method, so the Architect does it for you, and a plain
    rule-based check reads every line before you see it.</p>
  </header>
  <p class="live" data-live><i></i><span>Checking the Architect</span></p>
  <ol class="flowline">${PIPELINE.map((p, i) => `<li><span>${i + 1}</span><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></li>`).join('')}</ol>
  <div class="weave">
    <div>
      <h3>One memory, any room.</h3>
      <p>The same memory for Saturn (${esc(WEAVE.answer)}), rewoven around different objects. These are real answers from
      the Architect. Ask it again for a fresh one.</p>
      <div class="chips" role="group" aria-label="Objects" data-weave-objects></div>
    </div>
    <figure>
      <p class="weave__before">Before it is placed: ${esc(WEAVE.scene)}</p>
      <blockquote data-weave-scene></blockquote>
      <figcaption class="small" data-weave-note></figcaption>
      <button class="b b--small b--line" type="button" data-weave-live>Ask the Architect again</button>
    </figure>
  </div>
</section>

<section class="sec" id="science" aria-labelledby="science-title">
  <header class="sec__head">
    <h2 id="science-title">The research, in full.</h2>
    <p>Every number on this page, where it comes from. Scheduling uses
    <a href="https://github.com/open-spaced-repetition/ts-fsrs" target="_blank" rel="noopener">FSRS</a>, an open spaced-repetition algorithm.</p>
  </header>
  <ol class="sources">${SOURCES.map((s) => `<li><span class="sources__n">${esc(s.n)}</span><p>${esc(s.text)}</p><a href="${s.url}" target="_blank" rel="noopener">${esc(s.ref)}</a></li>`).join('')}</ol>
</section>

<section class="sec" id="for" aria-labelledby="for-title">
  <header class="sec__head"><h2 id="for-title">For whoever is remembering.</h2></header>
  <ul class="people">${AUDIENCES.map((a) => `<li><h3>${esc(a.who)}</h3><p>${esc(a.text)}</p></li>`).join('')}</ul>
</section>

<section class="sec" id="next" aria-labelledby="next-title">
  <header class="sec__head">
    <h2 id="next-title">Built, measured, and next.</h2>
    <p>Every number below comes from a real run of the code in the repository. Nothing under Next or Later exists yet.</p>
  </header>
  <ul class="receipts">${RECEIPTS.map((r) => `<li><span class="receipts__n" data-count-to="${esc(r.n)}">${esc(r.n)}</span>${r.unit ? `<span class="receipts__u">${esc(r.unit)}</span>` : ''}<p>${esc(r.text)}</p></li>`).join('')}</ul>
  <div class="road">${ROADMAP.map((g) => `<div class="road__col road__col--${g.when.toLowerCase()}"><h3>${g.when}</h3><ul>${g.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>
</section>

<section class="sec sec--narrow" id="questions" aria-labelledby="q-title">
  <header class="sec__head"><h2 id="q-title">Questions.</h2></header>
  <div class="faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
</section>

<footer class="foot">
  <p class="foot__brand">Loci</p>
  <button class="linkish" type="button" data-breathe-open>Breathe for a minute before you begin</button>
  <p>Your room remembers. Open source under the MIT licence. <a href="https://github.com/apexxx01/loci" target="_blank" rel="noopener">Read the code</a></p>
  <button class="b" type="button" data-enter>Enter your palace</button>
</footer>
</div>
</div>

<div class="breathe" data-breathe hidden role="dialog" aria-modal="true" aria-label="A minute of breathing">
  <p class="breathe__word" data-breathe-word aria-live="polite">Settle in</p>
  <p class="breathe__count" data-breathe-count></p>
  <button class="b b--line" type="button" data-breathe-close>I am ready</button>
</div>`;

/* ------------------------------------------------------------------ helpers */
/* ------------------------------------------------------------------ mount */
export function mountSite(opts: SiteOptions): { hide(): void; show(): void; focusNotes(): void } {
  const root = document.createElement('main');
  root.className = 'site';
  root.innerHTML = html();
  document.body.appendChild(root);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const flow = $('[data-flow]');
  const walk = $('#walk');
  const stations = $$('[data-station]');
  const mapButtons = $$('[data-goto]');

  /* ---------- smooth scroll */
  const lenis = calm || coarse ? null : new Lenis({ wrapper: root, content: flow, lerp: 0.075, smoothWheel: true, wheelMultiplier: 0.9 });
  if (lenis) {
    const loop = (t: number) => {
      if (!root.hidden) lenis.raf(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  const scrollTo = (y: number | HTMLElement) => {
    if (lenis) lenis.scrollTo(y, { duration: typeof y === 'number' ? 2.2 : 1.6, offset: typeof y === 'number' ? 0 : -10 });
    else if (typeof y === 'number') root.scrollTo({ top: y, behavior: calm ? 'auto' : 'smooth' });
    else y.scrollIntoView({ behavior: calm ? 'auto' : 'smooth' });
  };

  /* ---------- the palace */
  const world = createWorld($<HTMLCanvasElement>('.sky'));
  void (world?.ready ?? Promise.resolve()).then(() => root.classList.add('is-ready'));
  setTimeout(() => root.classList.add('is-ready'), 1800);

  const N = STATIONS.length - 1; // 6 steps from the approach to the door
  const stationY = (i: number) => walk.offsetTop + (Math.min(i, N) / N) * (walk.offsetHeight - root.clientHeight);
  let breathing = false;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const vh = root.clientHeight;
      const len = walk.offsetHeight - vh;
      const raw = Math.max(0, Math.min(N, ((root.scrollTop - walk.offsetTop) / len) * N));
      // Linger at each place, then walk to the next.
      const k = Math.min(N - 1, Math.floor(raw));
      const f = raw - k;
      const eased = raw >= N ? N : k + (f < 0.3 ? 0 : f > 0.8 ? 1 : (f - 0.3) / 0.5);
      const e = Math.min(N, eased);
      const after = Math.max(0, Math.min(1, (root.scrollTop - (walk.offsetTop + len)) / vh));
      if (!breathing) {
        world?.setProgress(e + after);
        world?.setDim(after * 0.62);
      }
      stations.forEach((st, i) => {
        const d = Math.abs(e - i);
        const o = after > 0.05 ? 0 : 1 - Math.min(1, Math.max(0, (d - 0.12) / 0.26));
        st.style.setProperty('--o', o.toFixed(3));
        st.classList.toggle('is-on', o > 0.5);
        st.inert = o < 0.5;
      });
      const here = after > 0.4 ? -1 : Math.round(e);
      mapButtons.forEach((b, i) => b.toggleAttribute('aria-current', i === here));
      root.classList.toggle('is-after', after > 0.4);
      root.classList.toggle('is-moving', root.scrollTop > 30);
    });
  };
  root.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  mapButtons.forEach((b) => b.addEventListener('click', () => scrollTo(stationY(Number(b.dataset.goto)) + 2)));
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href')!.slice(1);
    e.preventDefault();
    if (id === 'walk' || id === 'top') return scrollTo(0);
    const el = root.querySelector<HTMLElement>(`#${id}`);
    if (el) scrollTo(el);
  });
  // Arrow keys walk one place at a time while you are in the palace.
  root.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable]')) return;
    if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) return;
    const vh = root.clientHeight;
    const len = walk.offsetHeight - vh;
    const raw = ((root.scrollTop - walk.offsetTop) / len) * N;
    if (raw > N + 0.01) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' || e.key === 'PageDown' ? Math.floor(raw + 0.05) + 1 : Math.ceil(raw - 0.05) - 1;
    if (next > N) return scrollTo($('#room'));
    scrollTo(stationY(Math.max(0, next)) + 2);
  });

  /* ---------- the first screen asks you to scroll: a shooting star lands in a thread of light */
  const cue = $('[data-scrollcue]');
  if (coarse) $('[data-scrollcue-text]').textContent = 'Swipe up to walk the room';
  cue.setAttribute('aria-label', $('[data-scrollcue-text]').textContent!);
  cue.addEventListener('click', () => scrollTo(stationY(1) + 2));
  let cueLit = false;
  const lightCue = () => {
    cueLit = true;
    cue.classList.add('is-lit');
    cue.inert = root.scrollTop > 30;
  };
  const atTop = () => !root.hidden && !document.hidden && root.scrollTop <= 30 && !root.classList.contains('is-breathing');
  root.addEventListener('scroll', () => { if (cueLit) cue.inert = root.scrollTop > 30; }, { passive: true });
  let cueStarted = false;
  const startCue = () => {
    if (cueStarted) return;
    cueStarted = true;
    if (calm) return void setTimeout(lightCue, 1600);
    startMeteors($<HTMLCanvasElement>('.meteors'), {
      active: atTop,
      target: () => {
        const r = cue.querySelector('i')!.getBoundingClientRect();
        return r.width || r.height ? { x: r.left + r.width / 2, y: r.top + 2 } : null;
      },
      onLand: () => {
        lightCue();
        cue.classList.remove('is-hit');
        void cue.offsetWidth;
        cue.classList.add('is-hit');
        setTimeout(() => cue.classList.remove('is-hit'), 1400);
      },
    });
    // If the star is missed (tab hidden, already scrolled), light the cue anyway.
    setTimeout(lightCue, 4200);
  };
  void (world?.ready ?? Promise.resolve()).then(() => setTimeout(startCue, 1300));
  setTimeout(startCue, 3100);
  root.tabIndex = -1;

  // Section titles in the nav light up as you reach them.
  const spy = new IntersectionObserver((en) => en.forEach((x) => {
    if (!x.isIntersecting) return;
    const id = (x.target as HTMLElement).id;
    $$('[data-to]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.to === id));
  }), { root, rootMargin: '-45% 0px -50% 0px' });
  $$('.sec').forEach((s) => spy.observe(s));
  new IntersectionObserver((en) => en.forEach((x) => x.isIntersecting && $$('[data-to]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.to === 'walk'))),
    { root, threshold: 0.2 }).observe(walk);

  /* ---------- the concept being walked */
  let concept: Deck = LOCI_METHOD;
  let checked: boolean[] = [];
  const stationEls = $$('[data-station]').slice(1, 6);
  const stopsFor = (d: Deck) => {
    // Stage index list per walk stop; extra stages share the last stop.
    const n = d.items.length;
    return Array.from({ length: WALK_STOPS }, (_, i) => (i < WALK_STOPS - 1 ? (i < n ? [i] : []) : d.items.slice(i).map((_, k) => i + k)));
  };
  const showConcept = (d: Deck, walk = false) => {
    concept = d;
    checked = d.items.map(() => false);
    const stops = stopsFor(d);
    stationEls.forEach((el, i) => {
      const idx = stops[i];
      const it = d.items[idx[0]];
      el.hidden = false;
      const q = <T extends HTMLElement>(sel: string) => el.querySelector<T>(sel)!;
      if (!it) {
        q('[data-kicker]').textContent = `At ${STATIONS[i + 1].name}`;
        q('[data-cue]').textContent = 'A quiet place to rest.';
        q('[data-claim]').textContent = 'Nothing is kept here this time. Short concepts leave a place free, and that is fine.';
        ['[data-why]', '[data-scene]', '[data-link]'].forEach((s2) => (q(s2).textContent = ''));
        q('[data-myth]').hidden = true;
        return;
      }
      const many = idx.length > 1;
      q('[data-kicker]').textContent = many ? `Stages ${idx[0] + 1} ${idx.length === 2 ? 'and' : 'to'} ${idx[idx.length - 1] + 1}, at ${STATIONS[i + 1].name}` : `Stage ${idx[0] + 1}, at ${STATIONS[i + 1].name}`;
      q('[data-cue]').textContent = many ? idx.map((k, j) => (j ? d.items[k].cue.charAt(0).toLowerCase() + d.items[k].cue.slice(1) : d.items[k].cue)).join(', then ') : it.cue;
      q('[data-claim]').textContent = many ? idx.map((k) => d.items[k].answer).join(' ') : it.answer;
      q('[data-why]').textContent = !many && it.why ? `Why: ${it.why}` : '';
      q('[data-scene]').textContent = !many ? `Picture it: ${it.scene}` : '';
      const doubts = idx.map((k) => d.items[k].doubt).filter(Boolean);
      const clean = !doubts.length && idx.every((k) => d.items[k].checked);
      const dEl = q('[data-doubt]');
      dEl.hidden = !doubts.length && !clean;
      dEl.classList.toggle('doubt--ok', clean);
      dEl.textContent = doubts.length ? `Double-check this one: ${doubts.join(' ')}` : clean ? 'Fact-checked: nothing wrong found here.' : '';
      const last = d.items[idx[idx.length - 1]];
      const next = d.items[idx[idx.length - 1] + 1];
      q('[data-link]').textContent = last.link && next ? `${cap(last.link)} → ${next.cue}` : '';
      // One myth check per place, on its first stage.
      const myth = q('[data-myth]');
      myth.hidden = !it.check;
      if (it.check) {
        const flip = Math.random() < 0.5;
        const opts = flip ? [it.check.wrong, it.check.right] : [it.check.right, it.check.wrong];
        myth.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((btn, k) => {
          btn.textContent = opts[k];
          btn.dataset.right = String((k === 0) !== flip);
          btn.disabled = false;
          btn.removeAttribute('data-picked');
        });
        q('[data-verdict]').textContent = '';
        myth.dataset.stage = String(idx[0]);
      }
    });
    world?.setItems(stops.map((idx) => (idx.length ? d.items[idx[0]].cue : '')));
    resetDoor();
    if (walk) scrollTo(stationY(1) + 2);
  };
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-opt]');
    if (!btn || btn.disabled) return;
    const myth = btn.closest<HTMLElement>('[data-myth]')!;
    const right = btn.dataset.right === 'true';
    myth.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((o) => {
      o.disabled = true;
      o.dataset.picked = o === btn ? (right ? 'right' : 'wrong') : o.dataset.right === 'true' ? 'answer' : '';
    });
    const it = concept.items[Number(myth.dataset.stage)];
    myth.querySelector('[data-verdict]')!.textContent = right ? 'Right. Most people get that one wrong.' : `That one is a common myth. ${it.check?.right ?? ''}`;
    checked[Number(myth.dataset.stage)] = right;
    chime(right ? 'good' : 'soft');
  });

  /* ---------- asking */
  const ask = $<HTMLFormElement>('[data-ask]');
  const askInput = $<HTMLTextAreaElement>('[data-ask-input]');
  const askBox = $('[data-ask-box]');
  const askGo = $<HTMLButtonElement>('[data-ask-go]');
  const askStatus = $('[data-ask-status]');
  const askMeta = $('[data-ask-meta]');
  const askSteps = $('[data-ask-steps]');
  const askDone = $('[data-ask-done]');
  const ghost = $('[data-ghost]');
  let heroAudience: Audience = 'adult';
  $$('[data-hero-aud]').forEach((b) =>
    b.addEventListener('click', () => {
      heroAudience = b.dataset.heroAud as Audience;
      $$('[data-hero-aud]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }),
  );
  // The box grows with what you type or paste, up to a few lines.
  const grow = () => {
    askInput.style.height = 'auto';
    askInput.style.height = `${Math.min(askInput.scrollHeight, 220)}px`;
    const n = askInput.value.length;
    const lines = askInput.value.split('\n').filter((l) => l.trim()).length;
    askMeta.textContent = !n ? 'Drop a text file or paste notes' : lines > 1 || n > 160 ? `Your notes: ${n.toLocaleString()} characters` : 'Enter to teach me, Shift+Enter for a new line';
    ghost.hidden = n > 0;
    askBox.classList.toggle('is-notes', lines > 1 || n > 160);
  };
  askInput.addEventListener('input', grow);
  askInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask.requestSubmit();
    }
  });
  // Examples drift through the empty box, so it is clear anything goes.
  const EXAMPLES = [
    'How does a bill become a law?',
    'Why is the sky blue?',
    'How does compound interest grow money?',
    'Paste your lecture notes here',
    'How do noise-cancelling headphones work?',
    'What causes the tides?',
    'How does the stock market set a price?',
    'How do antibiotics stop an infection?',
  ];
  {
    let ex = 0, ch = 0, del = false, wait = 0;
    const tick = () => {
      if (askInput.value || document.activeElement === askInput) return void (ghost.textContent = askInput.value ? '' : EXAMPLES[ex]);
      const word = EXAMPLES[ex];
      if (wait > 0) wait--;
      else if (!del) {
        ch++;
        if (ch >= word.length) (del = true), (wait = 26);
      } else {
        ch -= 2;
        if (ch <= 0) (del = false), (ch = 0), (ex = (ex + 1) % EXAMPLES.length), (wait = 4);
      }
      ghost.textContent = word.slice(0, Math.max(0, ch));
    };
    if (calm) ghost.textContent = EXAMPLES[0];
    else setInterval(tick, 55);
  }
  // Ask out loud, where the browser can listen.
  {
    type Rec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
    const W = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    const mic = $<HTMLButtonElement>('[data-mic]');
    if (SR) {
      mic.hidden = false;
      let rec: Rec | null = null;
      mic.addEventListener('click', () => {
        if (rec) return rec.stop();
        rec = new SR();
        rec.lang = navigator.language || 'en-US';
        rec.interimResults = true;
        rec.continuous = false;
        const before = askInput.value ? `${askInput.value.trim()} ` : '';
        rec.onresult = (e) => {
          askInput.value = before + Array.from(e.results).map((r) => r[0].transcript).join(' ');
          grow();
        };
        rec.onend = rec.onerror = () => {
          rec = null;
          mic.setAttribute('aria-pressed', 'false');
          askInput.focus();
        };
        mic.setAttribute('aria-pressed', 'true');
        askStatus.textContent = 'Listening. Ask your question out loud.';
        rec.start();
      });
    }
  }

  // Drop a text file of notes onto the box.
  askBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    askBox.classList.add('is-drop');
  });
  askBox.addEventListener('dragleave', () => askBox.classList.remove('is-drop'));
  askBox.addEventListener('drop', async (e) => {
    e.preventDefault();
    askBox.classList.remove('is-drop');
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (!/\.(txt|md|markdown|csv)$/i.test(f.name) && !f.type.startsWith('text/')) {
      askStatus.textContent = 'That file is not plain text. Paste the words instead, or drop a .txt or .md file.';
      return;
    }
    askInput.value = (await f.text()).slice(0, 4000);
    grow();
    askInput.focus();
    askStatus.textContent = `Read ${f.name}. Press Teach me when you are ready.`;
  });

  // What you asked before, kept on this device so you can walk it again.
  const MINE = 'loci.asked.v1';
  const mineEl = $('[data-mine]');
  const readMine = (): Deck[] => {
    try {
      const raw = JSON.parse(localStorage.getItem(MINE) ?? '[]') as unknown[];
      return raw.map((d) => DeckSchema.safeParse(d)).filter((r) => r.success).map((r) => r.data as Deck);
    } catch {
      return [];
    }
  };
  const paintMine = () => {
    const mine = readMine();
    mineEl.hidden = !mine.length;
    mineEl.innerHTML = mine.length ? `Walk again: ${mine.map((d, i) => `<button type="button" class="linkish" data-mine-i="${i}">${esc(d.title)}</button>`).join('')}` : '';
  };
  mineEl.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mine-i]');
    const d = b && readMine()[Number(b.dataset.mineI)];
    if (d) {
      showConcept(d, true);
      choose(d);
    }
  });
  paintMine();

  let stepTimer = 0;
  ask.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = askInput.value.trim();
    if (topic.length < 3) {
      askStatus.textContent = 'Type a question or paste some notes first.';
      askInput.focus();
      return;
    }
    askGo.disabled = true;
    askGo.textContent = 'Thinking';
    askDone.hidden = true;
    askStatus.textContent = '';
    root.classList.add('is-teaching');
    askSteps.hidden = false;
    const steps = [...askSteps.children] as HTMLElement[];
    steps.forEach((li) => li.removeAttribute('data-state'));
    let step = 0;
    const t0 = performance.now();
    steps[0].dataset.state = 'now';
    clearInterval(stepTimer);
    stepTimer = window.setInterval(() => {
      if (step < steps.length - 1) {
        steps[step].dataset.state = 'done';
        steps[++step].dataset.state = 'now';
      }
    }, 1900);
    const res = await teachConcept(topic, heroAudience);
    clearInterval(stepTimer);
    askGo.disabled = false;
    askGo.textContent = 'Teach me';
    root.classList.remove('is-teaching');
    askSteps.hidden = true;
    if (!res.ok) {
      askStatus.textContent = res.error;
      return;
    }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    try {
      const mine = [res.deck, ...readMine().filter((d) => d.title !== res.deck.title)].slice(0, 4);
      localStorage.setItem(MINE, JSON.stringify(mine));
    } catch {
      /* private browsing */
    }
    paintMine();
    built = res.deck;
    showMemories();
    choose(res.deck);
    showConcept(res.deck);
    chime('good');
    askDone.hidden = false;
    askDone.innerHTML = `<p><b>${esc(res.deck.title)}</b>: ${res.deck.items.length} stages, ${res.offline ? 'from the walks that ship with Loci, because the Palace Architect could not be reached' : res.cached ? 'remembered from the last time it was asked' : `ready in ${secs} seconds`}.</p>
      <div class="ask__go"><button class="b" type="button" data-walk-now>Walk through it</button>
      <button class="b b--line" type="button" data-room-mine>Put it in my room</button>
      <button class="linkish" type="button" data-share-mine>Copy a link</button>
      <button class="linkish" type="button" data-cards-mine>Download as flashcards</button>
      <button class="linkish" type="button" data-remind-mine>Remind me to walk it again</button></div>
      <p class="small">${res.offline ? 'Checked by hand before it shipped.' : 'Written by the Palace Architect. It can be wrong, so check anything important against your own source.'}</p>`;
    askDone.querySelector('[data-walk-now]')?.addEventListener('click', () => scrollTo(stationY(1) + 2));
    // A second pass reads every stage again, looking only for mistakes.
    if (!res.offline) {
      const check = document.createElement('p');
      check.className = 'small ask__check';
      check.textContent = 'Double-checking every stage for mistakes...';
      askDone.appendChild(check);
      void verifyConcept(res.deck).then((v) => {
        if (!v) return void (check.textContent = 'The double-check could not run this time.');
        const n = v.items.filter((it) => it.doubt).length;
        check.textContent = n ? `Double-checked: ${n} ${n === 1 ? 'stage is' : 'stages are'} marked to verify on the walk.` : 'Double-checked: no mistakes found in any stage.';
        if (concept.id === res.deck.id) showConcept(v);
        if (chosen?.id === res.deck.id) choose(v);
        try {
          const mine = [v, ...readMine().filter((d) => d.title !== v.title)].slice(0, 4);
          localStorage.setItem(MINE, JSON.stringify(mine));
        } catch {
          /* private browsing */
        }
      });
    }
    askDone.querySelector('[data-room-mine]')?.addEventListener('click', () => enter());
    askDone.querySelector('[data-share-mine]')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget as HTMLButtonElement;
      const url = `${location.origin}${location.pathname}#p=${await encodeDeck(chosen ?? res.deck)}`;
      try {
        await navigator.clipboard.writeText(url);
        b.textContent = 'Link copied';
      } catch {
        askStatus.textContent = url;
      }
    });
    askDone.querySelector('[data-remind-mine]')?.addEventListener('click', (ev) => void remindMe(chosen ?? res.deck, ev.currentTarget as HTMLButtonElement));
    askDone.querySelector('[data-cards-mine]')?.addEventListener('click', () => {
      // A CSV that flashcard apps (Anki and others) import: front, back.
      const d = chosen ?? res.deck;
      const q = (t: string) => `"${t.replace(/"/g, '""')}"`;
      const rows = d.items.map((it) => [q(`${d.title}: ${it.cue}`), q([it.answer, it.why && `Why: ${it.why}`, it.check && `Myth: ${it.check.wrong} Fact: ${it.check.right}`].filter(Boolean).join('\n'))].join(','));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
      a.download = `loci-${d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  });

  /**
   * Coming back: a calendar file with the next three walks (1, 3 and 7 days
   * out), each linking straight back to this palace. No account, no server.
   */
  async function remindMe(d: Deck, b: HTMLButtonElement) {
    const url = `${location.origin}${location.pathname}#p=${await encodeDeck(d)}`;
    const ics = buildReminders({ title: d.title, url, stages: d.items.length });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = `loci-${d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-walks.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
    const first = reviewTimes(new Date())[0];
    b.textContent = `Added: next walk ${first.toLocaleDateString(undefined, { weekday: 'long' })} at ${first.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  }

  /* ---------- the door: explain it back */
  const explain = $<HTMLFormElement>('[data-explain]');
  const explainInput = $<HTMLTextAreaElement>('[data-explain-input]');
  const explainGo = $<HTMLButtonElement>('[data-explain-go]');
  const result = $('[data-result]');
  function resetDoor() {
    paintOrder();
    explainInput.value = '';
    result.hidden = true;
    explain.closest('.station')?.classList.remove('is-checked');
    explainInput.placeholder = concept.items[0] ? `Start with ${concept.items[0].cue.toLowerCase()}...` : '';
  }
  explain.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = explainInput.value.trim();
    if (text.length < 12) {
      result.hidden = false;
      result.innerHTML = '<p>Write a sentence or two first. Walk back through the places in your mind and say what happens at each one.</p>';
      return;
    }
    explainGo.disabled = true;
    explainGo.textContent = 'Reading';
    const stages = concept.items.map((it) => ({ cue: it.cue, answer: it.answer }));
    const g = await gradeExplanation(concept.title, stages, text);
    explainGo.disabled = false;
    explainGo.textContent = 'Check my explanation';
    const n = stages.length;
    explain.closest('.station')?.classList.add('is-checked');
    result.hidden = false;
    result.innerHTML = `<p class="result__n">${g.hit.length} of ${n}</p>
      <p class="result__sub">stages explained${g.via === 'offline' ? ', graded on this device' : ''}</p>
      <ol class="stages">${concept.items.map((it, i) => `<li data-hit="${g.hit.includes(i)}"><span>${esc(it.cue)}</span></li>`).join('')}</ol>
      ${g.misconception ? `<p class="result__myth">Watch out: ${esc(g.misconception)}</p>` : ''}
      ${g.feedback ? `<p>${esc(g.feedback)}</p>` : ''}
      <div class="result__go"><button class="b" type="button" data-room-now>Put it in my room</button>
      <button class="b b--line" type="button" data-remind-now>Remind me to come back</button>
      <button class="linkish" type="button" data-to-build>Try your own topic</button></div>
      <p class="small">Recall fades fastest in the first day. Three short walks, tomorrow, in three days and in a week, are what make it stay.</p>`;
    result.querySelector('[data-remind-now]')?.addEventListener('click', (ev) => void remindMe(concept, ev.currentTarget as HTMLButtonElement));
    chime(g.hit.length >= Math.ceil(n * 0.7) ? 'good' : 'soft');
    result.querySelector('[data-room-now]')?.addEventListener('click', () => {
      choose(concept);
      enter();
    });
    result.querySelector('[data-to-build]')?.addEventListener('click', () => {
      scrollTo(0);
      setTimeout(() => askInput.focus({ preventScroll: true }), 1600);
    });
  });
  /* ---------- the door: rebuild the chain */
  let placed = 0;
  let slips = 0;
  function paintOrder() {
    placed = 0;
    slips = 0;
    const items = concept.items;
    $('[data-slots]').innerHTML = items.map((_, i) => `<li data-slot="${i}"><span>${i + 1}</span></li>`).join('');
    const shuffled = items.map((it, i) => ({ it, i, k: Math.random() })).sort((a, b) => a.k - b.k);
    $('[data-pool]').innerHTML = shuffled.map(({ it, i }) => `<button type="button" data-link-stage="${i}">${esc(it.cue)}</button>`).join('');
    $('[data-order-v]').textContent = '';
  }
  $('[data-pool]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-link-stage]");
    if (!b || b.disabled) return;
    const i = Number(b.dataset.linkStage);
    const v = $('[data-order-v]');
    if (i !== placed) {
      slips++;
      b.classList.remove('is-wrong');
      void b.offsetWidth;
      b.classList.add('is-wrong');
      const prev = concept.items[placed - 1];
      v.textContent = placed === 0 ? 'Not the first stage. Where does it all begin?' : `Not yet. What happens right after ${prev.cue.toLowerCase()}?`;
      chime('soft');
      return;
    }
    b.disabled = true;
    const slot = root.querySelector<HTMLElement>(`[data-slot="${i}"]`)!;
    slot.innerHTML = `<span>${i + 1}</span>${esc(concept.items[i].cue)}`;
    slot.classList.add('is-on');
    placed++;
    chime('good');
    if (placed === concept.items.length) {
      v.textContent = slips === 0 ? 'Every stage in order, first try. Now say how it works.' : `Rebuilt with ${slips} ${slips === 1 ? 'slip' : 'slips'}. Now say how it works.`;
      explainInput.focus({ preventScroll: true });
    } else v.textContent = 'Right. What comes next?';
  });
  $('[data-walk-again]').addEventListener('click', () => scrollTo(stationY(1) + 2));

  /* ---------- breathe */
  const bEl = $('[data-breathe]');
  const bWord = $('[data-breathe-word]');
  const bCount = $('[data-breathe-count]');
  let bRaf = 0;
  const endBreath = () => {
    cancelAnimationFrame(bRaf);
    breathing = false;
    bEl.classList.remove('is-open');
    setTimeout(() => (bEl.hidden = true), 700);
    root.classList.remove('is-breathing');
    world?.breathe(0);
    lenis?.start();
    onScroll();
  };
  $('[data-breathe-open]').addEventListener('click', () => {
    breathing = true;
    bEl.hidden = false;
    lenis?.stop();
    root.classList.add('is-breathing');
    requestAnimationFrame(() => bEl.classList.add('is-open'));
    world?.setDim(0);
    const IN = 4, OUT = 6, ROUNDS = 6;
    const t0 = performance.now() + 2000;
    bWord.textContent = 'Settle in';
    bCount.textContent = `One minute, ${ROUNDS} slow breaths`;
    let lastWord = '';
    const tick = (now: number) => {
      bRaf = requestAnimationFrame(tick);
      const t = (now - t0) / 1000;
      if (t < 0) return;
      const round = Math.floor(t / (IN + OUT));
      if (round >= ROUNDS) {
        bWord.textContent = 'Welcome.';
        bCount.textContent = 'You are here, and ready.';
        world?.breathe(0);
        cancelAnimationFrame(bRaf);
        setTimeout(() => breathing && endBreath(), 2600);
        return;
      }
      const k = t % (IN + OUT);
      const v = k < IN ? Math.sin((k / IN) * Math.PI * 0.5) : Math.cos(((k - IN) / OUT) * Math.PI * 0.5);
      world?.breathe(v);
      breatheTone(v);
      const w = k < IN ? 'Breathe in' : 'And slowly out';
      if (w !== lastWord) {
        lastWord = w;
        bWord.textContent = w;
        bCount.textContent = `${round + 1} of ${ROUNDS}`;
      }
    };
    bRaf = requestAnimationFrame(tick);
    $('[data-breathe-close]').focus({ preventScroll: true });
  });
  $('[data-breathe-close]').addEventListener('click', endBreath);
  bEl.addEventListener('keydown', (e) => e.key === 'Escape' && endBreath());

  /* ---------- sound */
  const soundBtn = $('[data-sound]');
  const paintSound = () => soundBtn.setAttribute('aria-pressed', String(ambientOn()));
  soundBtn.addEventListener('click', () => {
    toggleAmbient();
    paintSound();
  });

  /* ---------- entering */
  let chosen: Deck | null = null;
  let hasXR = true;
  const enterButtons = () => $$<HTMLButtonElement>('[data-enter]');
  const paintEnter = () => {
    const palace = opts.getPalace();
    enterButtons().forEach((b) => {
      if (b.classList.contains('b--small')) b.textContent = hasXR ? 'Enter your room' : 'Try it here';
      else if (b.closest('[data-xr-now]')) b.textContent = chosen ? 'Put it in my room' : opts.getPalace() ? 'Return to my palace' : 'Start in my room';
      else if (b.closest('[data-chosen]')) b.textContent = hasXR ? 'Enter with it' : 'Preview it here';
      else b.textContent = !hasXR ? 'Preview on this screen' : chosen ? 'Enter with your new palace' : palace ? 'Return to your palace' : 'Enter your palace';
    });
    $('[data-chosen]').hidden = !chosen;
    if (chosen) $('[data-chosen-text]').textContent = `${chosen.title} is ready: ${chosen.items.length} ${chosen.items.length === 1 ? 'memory' : 'memories'} to place around your room. Palaces you already keep stay in your library.`;
  };
  const enter = () => {
    stopAmbient();
    paintSound();
    if (hasXR) {
      opts.onDeckReady(chosen);
      opts.launchXR();
    } else {
      root.hidden = true;
      opts.onPreviewDeck(chosen);
    }
  };
  root.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-enter]')) enter();
  });

  /* ---------- the studio */
  const notes = $<HTMLTextAreaElement>('[data-notes]');
  const buildBtn = $<HTMLButtonElement>('[data-build]');
  const status = $('[data-status]');
  const memList = $('[data-memories]');
  let mode: Mode = 'notes';
  let audience: Audience = 'adult';
  let built: Deck | null = null;
  const drafts: Partial<Record<Mode, string>> = (() => {
    try {
      return JSON.parse(localStorage.getItem('loci.draft.v2') ?? '{}') as Partial<Record<Mode, string>>;
    } catch {
      return {};
    }
  })();
  $('[data-modes]').innerHTML = MODES.map((m) => `<button type="button" role="tab" class="kind" data-mode="${m.id}" aria-selected="false"><span class="kind__label">${m.label}</span><span class="kind__who">${m.who}</span></button>`).join('');
  $('[data-samples]').innerHTML = STARTER_DECKS.map((d) => `<button type="button" class="linkish" data-sample="${d.id}">${esc(d.title)}</button>`).join('');
  const count = () => {
    const el = $('[data-count]');
    if (mode === 'topic' || mode === 'number') return (el.textContent = '');
    const n = notes.value.split('\n').filter((l) => l.trim()).length;
    el.textContent = n ? `${Math.min(n, 12)} of 12 lines${n > 12 ? '; the rest are left out' : ''}` : '';
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
    count();
  };
  $('[data-modes]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
    if (b) setMode(b.dataset.mode as Mode);
  });
  $('[data-modes]').addEventListener('keydown', (e) => {
    const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    if (!fwd && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = MODES.findIndex((m) => m.id === mode);
    const next = MODES[(i + (fwd ? 1 : MODES.length - 1)) % MODES.length];
    setMode(next.id);
    root.querySelector<HTMLElement>(`[data-mode="${next.id}"]`)?.focus();
  });
  $('[data-audience]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-aud]');
    if (!b) return;
    audience = b.dataset.aud as Audience;
    $$('[data-aud]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  notes.addEventListener('input', () => {
    count();
    drafts[mode] = notes.value;
    try {
      localStorage.setItem('loci.draft.v2', JSON.stringify(drafts));
    } catch {
      /* private browsing */
    }
  });
  notes.addEventListener('keydown', (e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && buildBtn.click());
  $('[data-example]').addEventListener('click', () => {
    notes.value = MODES.find((m) => m.id === mode)!.example;
    notes.dispatchEvent(new Event('input'));
    notes.focus({ preventScroll: true });
  });
  const showMemories = () => {
    if (!built) return;
    memList.innerHTML = built.items.map((it, i) => `<li style="--i:${i}"><span class="memories__n">${i + 1}</span><div>
      <p class="memories__cue">${esc(it.cue)}</p><p class="memories__answer">${esc(it.answer)}</p><p class="memories__scene">${esc(it.scene)}</p>
      <button type="button" class="linkish linkish--quiet" data-remove="${i}" aria-label="Remove ${esc(it.cue)}">Remove</button></div></li>`).join('');
    memList.hidden = false;
  };
  const choose = (d: Deck | null) => {
    chosen = d;
    paintEnter();
  };
  memList.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
    if (!b || !built || built.items.length <= 1) return;
    const items = built.items.filter((_, i) => i !== Number(b.dataset.remove)).map((it, order) => ({ ...it, order }));
    built = { ...built, id: `${built.id.split('~')[0]}~${items.length}`, items };
    showMemories();
    choose(built);
  });
  $('[data-samples]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sample]');
    if (!b) return;
    built = STARTER_DECKS.find((d) => d.id === b.dataset.sample) ?? null;
    status.textContent = built ? `${built.title}. ${built.subtitle}.` : '';
    showMemories();
    choose(built);
  });
  buildBtn.addEventListener('click', async () => {
    const m = MODES.find((x) => x.id === mode)!;
    if (mode === 'number') {
      built = deckFromNumber(notes.value);
      status.textContent = built ? `${built.subtitle}. Made on this device; nothing was sent anywhere.` : 'Type a number with at least three digits.';
      if (built) {
        showMemories();
        choose(built);
        chime('soft');
      }
      return;
    }
    buildBtn.disabled = true;
    root.classList.add('is-building');
    buildBtn.textContent = 'Building';
    status.textContent = mode === 'topic' ? 'The Palace Architect is choosing the key facts and turning them into pictures.' : 'The Palace Architect is turning your words into pictures. This takes a few seconds.';
    const res = await buildDeck(notes.value, mode, audience);
    buildBtn.disabled = false;
    root.classList.remove('is-building');
    buildBtn.textContent = m.cta;
    if (!res.ok) {
      status.textContent = res.error;
      notes.focus();
      return;
    }
    built = res.deck;
    chime('good');
    status.textContent = res.via === 'architect'
      ? `${built.items.length} memories, built in ${(res.ms / 1000).toFixed(1)} seconds.${res.repaired ? ` ${res.repaired} picture${res.repaired > 1 ? 's were' : ' was'} replaced by the safety check.` : ''}${mode === 'topic' ? ' Check the facts against your own source.' : ''} Remove any you do not want.`
      : `${built.items.length} memories made straight from your lines, because the Palace Architect is unavailable right now.`;
    showMemories();
    choose(built);
  });
  $('[data-walk-deck]').addEventListener('click', () => {
    if (chosen) showConcept(chosen, true);
  });
  $('[data-copy-link]').addEventListener('click', async () => {
    if (!chosen) return;
    const url = `${location.origin}${location.pathname}#p=${await encodeDeck(chosen)}`;
    const st = $('[data-link-status]');
    try {
      await navigator.clipboard.writeText(url);
      st.textContent = 'Link copied. Open it in the headset browser and the same palace builds there.';
    } catch {
      st.textContent = url;
    }
  });

  /* ---------- your palaces */
  const palacesEl = $('[data-palaces]');
  const returning = $('[data-returning]');
  const recall = (p: Palace) => {
    lenis?.stop();
    openReview({
      palace: p,
      save: (memoryId, rating) => opts.library.review(p.id, memoryId, rating),
      onRated: (r) => chime(r === 'again' ? 'soft' : 'good'),
      onClose: () => {
        lenis?.start();
        paintPalaces();
      },
    });
  };
  const download = (name: string, text: string, type: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  function paintPalaces() {
    const all = opts.library.list();
    const active = opts.getPalace();
    const now = new Date();
    $('#palaces').hidden = all.length === 0;
    $('[data-nav-palaces]').hidden = all.length === 0;
    const kept = all.reduce((n, p) => n + p.deck.items.length, 0);
    $('[data-palaces-lede]').textContent = `You are keeping ${kept} ${kept === 1 ? 'memory' : 'memories'} in ${all.length} ${all.length === 1 ? 'palace' : 'palaces'}. Recall what is due right here on any screen; your headset reads the same schedule.`;
    palacesEl.innerHTML = all.map((p) => {
      const due = dueIds(p, now).length;
      const next = nextDue(p);
      const m = mastery(p);
      const s = streak(p.history, now);
      const days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(now.getTime() - (13 - i) * 86_400_000).toDateString();
        return p.history.some((h) => new Date(h.at).toDateString() === d);
      });
      const isActive = active?.id === p.id;
      return `<article class="palace" data-id="${esc(p.id)}">
        <div class="palace__head"><h3>${esc(p.deck.title)}</h3>${isActive ? '<span class="tag">In your room</span>' : ''}</div>
        <p class="palace__meta">${p.deck.items.length} memories. ${due ? `<b>${due} due now.</b>` : next ? `Next one returns in ${span(next.getTime() - now.getTime())}.` : ''} ${s ? `${s}-day streak.` : ''}</p>
        <div class="strength" role="img" aria-label="${Math.round(m * 100)}% mastered"><i style="width:${Math.max(3, m * 100)}%"></i></div>
        <p class="palace__strength">${Math.round(m * 100)}% mastered</p>
        <div class="days" role="img" aria-label="Days practised in the last two weeks">${days.map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('')}</div>
        <div class="palace__go">
          <button class="b b--small" type="button" data-act="recall">${due ? `Recall ${due} now` : 'Practise the weakest'}</button>
          ${isActive ? '' : '<button class="b b--small b--line" type="button" data-act="open">Put it in my room</button>'}
          <button class="linkish" type="button" data-act="share">Share</button>
          <button class="linkish" type="button" data-act="remind">Add a reminder</button>
          <button class="linkish" type="button" data-act="download">Save a copy</button>
          <button class="linkish linkish--quiet" type="button" data-act="delete">Delete</button>
        </div>
        <p class="small" role="status" aria-live="polite" data-pstatus></p>
      </article>`;
    }).join('');
    returning.hidden = !active;
    if (active) {
      const due = dueIds(active, now).length;
      const next = nextDue(active);
      returning.innerHTML = `<p>Welcome back. <b>${esc(active.deck.title)}</b> is in your room. ${due ? `${due} ${due === 1 ? 'memory is' : 'memories are'} due.` : next ? `Nothing is due; the next returns in ${span(next.getTime() - now.getTime())}.` : ''}</p>
        ${due ? '<button class="b b--small b--line" type="button" data-welcome-recall>Recall them here</button>' : ''}`;
      returning.querySelector('[data-welcome-recall]')?.addEventListener('click', () => recall(active));
    }
  }
  palacesEl.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
    const card = b?.closest<HTMLElement>('[data-id]');
    if (!b || !card) return;
    const p = opts.library.list().find((x) => x.id === card.dataset.id);
    if (!p) return;
    const st = card.querySelector<HTMLElement>('[data-pstatus]')!;
    const slug = p.deck.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    switch (b.dataset.act) {
      case 'recall':
        return recall(p);
      case 'open':
        opts.library.activate(p.id);
        choose(null);
        paintPalaces();
        return paintEnter();
      case 'share': {
        const url = `${location.origin}${location.pathname}#p=${await encodeDeck(p.deck)}`;
        try {
          if (navigator.share) await navigator.share({ title: `Loci: ${p.deck.title}`, url });
          else {
            await navigator.clipboard.writeText(url);
            st.textContent = 'Link copied. It rebuilds around their furniture, not yours.';
          }
        } catch {
          st.textContent = url;
        }
        return;
      }
      case 'remind': {
        const due = nextDue(p) ?? new Date();
        const at = new Date(Math.max(due.getTime(), Date.now() + 5 * 60_000));
        const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
        download(`loci-${slug}.ics`, ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Loci//EN', 'BEGIN:VEVENT', `UID:${p.id}-${at.getTime()}@loci`,
          `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(at)}`, `DTEND:${stamp(new Date(at.getTime() + 600_000))}`, `SUMMARY:Loci: recall ${p.deck.title}`,
          `DESCRIPTION:Your memories are due. ${location.origin}${location.pathname}`, 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY',
          `DESCRIPTION:Loci: recall ${p.deck.title}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'), 'text/calendar');
        st.textContent = `Reminder saved for ${at.toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}, when the next memory is due.`;
        return;
      }
      case 'download':
        download(`loci-${slug}.json`, JSON.stringify(p, null, 2), 'application/json');
        st.textContent = 'Saved. Restore it on any device from the bottom of this list.';
        return;
      case 'delete':
        if (b.dataset.armed) {
          opts.library.remove(p.id);
          paintPalaces();
          paintEnter();
        } else {
          b.dataset.armed = '1';
          b.textContent = 'Delete for good?';
          setTimeout(() => {
            delete b.dataset.armed;
            b.textContent = 'Delete';
          }, 4000);
        }
    }
  });
  $<HTMLInputElement>('[data-import]').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const st = $('[data-import-status]');
    try {
      const parsed = PalaceSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success || !opts.library.restore(parsed.data as Palace)) throw new Error('invalid');
      st.textContent = 'Palace restored.';
      paintPalaces();
      paintEnter();
    } catch {
      st.textContent = 'That file is not a Loci palace, or this browser cannot save it.';
    }
  });

  /* ---------- the Architect */
  {
    const live = $('[data-live]');
    fetch('/api/architect', { cache: 'no-store' })
      .then((r) => r.json())
      .then((h: { ok?: boolean; configured?: boolean; model?: string; fallbacks?: string[] }) => {
        if (!h.ok || !h.configured) throw new Error('down');
        live.classList.add('is-on');
        live.querySelector('span')!.textContent = `Online now: ${h.model}, with ${(h.fallbacks ?? []).join(' and ')} as backups.`;
      })
      .catch(() => {
        live.classList.add('is-off');
        live.querySelector('span')!.textContent = 'The Architect is unreachable right now; Loci will build straight from your lines instead.';
      });
    const objs = Object.keys(WEAVE.scenes);
    const objEl = $('[data-weave-objects]');
    const sceneEl = $('[data-weave-scene]');
    const noteEl = $('[data-weave-note]');
    let current = 'lamp';
    const fresh: Record<string, { text: string; ms: number; model: string }> = {};
    objEl.innerHTML = objs.map((o) => `<button type="button" data-obj="${o}" aria-pressed="false">your ${o}</button>`).join('');
    const show = (o: string) => {
      current = o;
      $$('[data-obj]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.obj === o)));
      const f = fresh[o];
      sceneEl.textContent = f ? f.text : WEAVE.scenes[o];
      sceneEl.classList.remove('is-new');
      void sceneEl.offsetWidth;
      sceneEl.classList.add('is-new');
      noteEl.textContent = f ? `Just now, from ${f.model}, in ${(f.ms / 1000).toFixed(1)} seconds.` : `Saved from a real run on 15 November, from ${WEAVE.model}.`;
    };
    objEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-obj]');
      if (b) show(b.dataset.obj!);
    });
    const liveBtn = $<HTMLButtonElement>('[data-weave-live]');
    liveBtn.addEventListener('click', async () => {
      liveBtn.disabled = true;
      liveBtn.textContent = 'Weaving';
      const t0 = performance.now();
      try {
        const r = await fetch('/api/architect', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'bind', items: [{ cue: WEAVE.cue, scene: WEAVE.scene, label: current }] }) });
        const d = (await r.json()) as { scenes?: string[]; model?: string; error?: string };
        if (!r.ok || !d.scenes?.[0]) throw new Error(d.error ?? 'no answer');
        fresh[current] = { text: d.scenes[0], ms: performance.now() - t0, model: d.model ?? 'the Architect' };
        show(current);
      } catch (err) {
        noteEl.textContent = `The Architect did not answer (${(err as Error).message}). The saved answer is shown instead.`;
      } finally {
        liveBtn.disabled = false;
        liveBtn.textContent = 'Ask the Architect again';
      }
    });
    show('lamp');
  }

  /* ---------- quiet reveals as sections arrive */
  const io = new IntersectionObserver((en) => en.forEach((x) => x.isIntersecting && x.target.classList.add('in')), { root, threshold: 0.15 });
  $$('.sec').forEach((s) => io.observe(s));
  if (calm) $$('.sec').forEach((s) => s.classList.add('in'));

  /* ---------- shared links */
  const shared = $('[data-shared]');
  const m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) {
    void decodeDeck(m[1]).then((r) => {
      shared.hidden = false;
      if (!r.ok) return void (shared.textContent = r.error);
      shared.innerHTML = `Someone sent you <b>${esc(r.deck.title)}</b>, ${r.deck.items.length} memories. Enter and it is built around your own furniture.`;
      built = r.deck;
      showMemories();
      choose(r.deck);
      showConcept(r.deck);
    });
  }

  /* ---------- headset check */
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
  const noXR = () => {
    hasXR = false;
    $('[data-device-note]').textContent = 'No headset here? The walk, building, and recall all work on this screen.';
    paintEnter();
  };
  if (!xr) noXR();
  else
    xr.isSessionSupported('immersive-ar')
      .then((ok) => {
        if (!ok) return noXR();
        // In the headset browser: the first thing to see is the way into your room.
        $('[data-xr-now]').hidden = false;
        paintEnter();
      })
      .catch(noXR);

  /* ---------- back from the on-screen preview */
  const back = document.createElement('button');
  back.className = 'back';
  back.type = 'button';
  back.textContent = 'Back to Loci';
  back.hidden = true;
  back.addEventListener('click', () => api.show());
  document.body.appendChild(back);
  let immersive = false;
  new MutationObserver(() => {
    back.hidden = !root.hidden || immersive;
    world?.setActive(!root.hidden);
  }).observe(root, { attributes: true, attributeFilter: ['hidden'] });

  setMode('notes');
  showConcept(LOCI_METHOD);
  paintEnter();
  paintPalaces();
  paintSound();
  onScroll();

  const api = {
    hide: () => {
      immersive = true;
      stopAmbient();
      if (breathing) endBreath();
      root.hidden = true;
    },
    show: () => {
      immersive = false;
      root.hidden = false;
      paintEnter();
      paintPalaces();
      onScroll();
    },
    focusNotes: () => {
      api.show();
      $('#build').scrollIntoView();
      notes.focus();
    },
  };
  return api;
}
