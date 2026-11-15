/**
 * The page a visitor sees before stepping into mixed reality. One continuous
 * night: the particle cloud tells the story (galaxy, neurons, brain, your
 * room, and finally the name), the words sit quietly beside it, and the tools
 * (try a recall, build a palace, recall from any screen) live in the same sky.
 */
import '@fontsource-variable/mona-sans/standard.css';
import '@fontsource-variable/mona-sans/standard-italic.css';
import 'lenis/dist/lenis.css';
import Lenis from 'lenis';
import './landing.css';
import type { Audience, Kind } from '../core/architect.js';
import { STARTER_DECKS } from '../core/decks.js';
import { forgettingCurves } from '../core/forecast.js';
import { deckFromNumber } from '../core/numbers.js';
import { dueIds, mastery, nextDue, retrievability, streak } from '../core/scheduler.js';
import { PalaceSchema } from '../core/schema.js';
import { decodeDeck, encodeDeck } from '../core/share.js';
import type { Deck, Palace, ReviewEvent } from '../core/types.js';
import { buildDeck } from '../net/architect-client.js';
import { ambientOn, breatheTone, chime, stopAmbient, toggleAmbient } from './ambient.js';
import { mountDemo, span } from './demo.js';
import { openReview } from './review.js';
import { createLandingScene, LOCI } from './scene.js';
import { AUDIENCES, HEADSET, PIPELINE, RECEIPTS, ROADMAP, WEAVE } from './features.js';
import { sigilSVG } from './sigil.js';
import { curveStars, starField } from './starchart.js';

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
    review: (id: string, memoryId: string, rating: ReviewEvent['rating']) => Palace | null;
    restore: (palace: Palace) => boolean;
  };
}

type Mode = Kind | 'number';
const MODES: { id: Mode; label: string; who: string; help: string; example: string; cta: string }[] = [
  {
    id: 'notes', label: 'My notes', who: 'for revision and anything already written down',
    help: 'Paste what you need to know, one thing per line, like term - meaning.',
    example: 'Mitochondria - makes energy for the cell\nRibosome - builds proteins\nNucleus - stores the DNA\nGolgi body - packages and ships proteins\nCell membrane - controls what enters and leaves',
    cta: 'Build my palace',
  },
  {
    id: 'topic', label: 'A topic', who: 'for starting from nothing, at any age',
    help: 'Name a topic or paste a passage. The Palace Architect picks the key facts and teaches them to you.',
    example: 'How vaccines train the immune system', cta: 'Teach me',
  },
  {
    id: 'sequence', label: 'A speech', who: 'for talks, toasts, steps and routines',
    help: 'Write your points or steps in order. You will recall them as one sweep around the room.',
    example: 'Open with the story about the lost luggage\nThank the hosts by name\nThe three things I learned from Asha\nThe toast: to curiosity',
    cta: 'Build my route',
  },
  {
    id: 'vocab', label: 'A language', who: 'for words you want to keep',
    help: 'One word per line with its meaning. Each one gets a picture that sounds like it.',
    example: 'la biblioteca - the library\nel desayuno - breakfast\nla lluvia - the rain\nbarato - cheap\nla cuenta - the bill',
    cta: 'Build my palace',
  },
  {
    id: 'names', label: 'Names', who: 'for a new job, a new class, a family gathering',
    help: 'A detail, then the name, like "runs payroll - Farida". The picture comes from how the name sounds.',
    example: 'runs payroll - Farida\nmy desk neighbour - Tomasz\nthe team lead - Oluwaseun\nfront desk - Marguerite',
    cta: 'Build my palace',
  },
  {
    id: 'number', label: 'A number', who: 'for phone numbers, dates and codes',
    help: 'Type a number, with a label if you like. Each digit becomes the object it looks like. This stays on your device.',
    example: 'Grandma - 98450 12345', cta: 'Turn it into pictures',
  },
];

// Which tile lights up while each step of "how it works" is in view.
const STEP_TILE = [4, 5, -1, 7];

const HTML = `
<canvas class="cosmos" aria-hidden="true"></canvas>
<div class="veil" aria-hidden="true"></div>
<svg class="callouts" aria-hidden="true" data-callouts></svg>

<header class="bar">
  <a class="wordmark" href="#top" aria-label="Loci, back to the top"><span class="wordmark__sigil" data-wordmark-sigil></span>loci</a>
  <nav class="bar__nav" aria-label="Sections">
    <a href="#why" data-spy="why">Science</a>
    <a href="#headset" data-spy="headset">In the headset</a>
    <a href="#architect" data-spy="architect">Architect</a>
    <a href="#try" data-spy="try">Try it</a>
    <a href="#start" data-spy="start">Build</a>
    <a href="#library" data-spy="library" data-nav-library hidden>Palaces</a>
  </nav>
  <div class="bar__tools">
    <button class="sound" type="button" data-ambient aria-pressed="false" aria-label="Sound"><i></i><i></i><i></i><i></i></button>
    <button class="lumen lumen--small" type="button" data-enter>Enter</button>
  </div>
</header>
<div class="thread" aria-hidden="true"><i data-progress></i></div>

<div class="flow" data-flow>
<section class="s s--hero" id="top" data-stage="0" data-shift="0" data-dim="0.1">
  <div class="hero">
    <h1 id="landing-title"><span class="line"><span>Your room</span></span><span class="line"><span>remembers.</span></span></h1>
    <p class="hero__lede">A memory palace built from the room you are sitting in. What you want to learn rests on
    your lamp, your shelf, your couch, and comes back just before you would forget it.</p>
    <form class="whisper" data-whisper autocomplete="off">
      <label for="whisper" class="sr-only">Something you want to remember</label>
      <input id="whisper" name="whisper" maxlength="32" placeholder="Type anything you want to remember" data-whisper-input />
    </form>
    <p class="whisper__said" data-whisper-said hidden><span data-whisper-line></span>
      <button class="lumen lumen--small" type="button" data-whisper-build>Build a palace from it</button>
      <button class="lumen lumen--small lumen--quiet" type="button" data-whisper-free>Let it go</button></p>
    <div class="hero__actions">
      <button class="lumen" type="button" data-enter>Enter your palace</button>
      <button class="lumen lumen--quiet" type="button" data-breathe-open>Take a breath first</button>
    </div>
    <p class="hero__note" data-device-note>Hands only, sitting down. Meta Quest 3 and 3S, right in the browser.</p>
    <p class="hero__note hero__note--warm" data-shared hidden></p>
    <div class="welcome" data-returning hidden></div>
  </div>
  <p class="scroll-cue" aria-hidden="true"><span>Scroll slowly</span><i></i></p>
</section>

<section class="s s--story" id="why" data-stage="1" data-shift="1" data-dim="0">
  <div class="copy">
    <h2>Memory keeps an address.</h2>
    <p>Deep in your brain, place cells fire when you stand in one particular spot, and grid cells map the space
    in between. Finding them won the 2014 Nobel Prize in Physiology or Medicine.</p>
    <p>Where something happened is one of the strongest hooks memory has. When scientists scanned the brains of
    World Memory Championship competitors, they found ordinary brains, put to work through the regions that
    handle space.</p>
    <figure class="figure">
      <p class="numeral">9<span class="numeral__of">of</span>10</p>
      <div class="figure__stars" data-field="9,10,10,candle,9 of the 10 champions used the method of loci"></div>
      <figcaption>of the champions they studied used the same old technique.</figcaption>
    </figure>
    <p class="cite"><a href="https://www.nobelprize.org/prizes/medicine/2014/summary/" target="_blank" rel="noopener">Nobel Prize, 2014</a>
    <a href="https://doi.org/10.1038/nn988" target="_blank" rel="noopener">Maguire et al., Nature Neuroscience, 2003</a></p>
  </div>
</section>

<section class="s s--story" data-stage="2" data-shift="-1" data-dim="0">
  <div class="copy copy--right">
    <h2>Anyone can learn to use it.</h2>
    <p>It is called the method of loci. You picture a place you know and leave each thing to remember somewhere
    along a walk through it. People have used it for about 2,500 years.</p>
    <p>In a 2017 study, people with ordinary memory practised it for 30 minutes a day, for 40 days.</p>
    <figure class="figure figure--pair">
      <div><p class="numeral numeral--mid numeral--dim">26</p><div data-field="26,72,12,lilac,26 of 72 words before training"></div><p class="figure__label">before</p></div>
      <div><p class="numeral numeral--mid">62</p><div data-field="62,72,12,candle,62 of 72 words after 40 days"></div><p class="figure__label">after 40 days</p></div>
      <figcaption>words recalled out of 72. Four months later, with no more practice, they still recalled 22 more
      than when they began.</figcaption>
    </figure>
    <p class="cite"><a href="https://doi.org/10.1016/j.neuron.2017.02.003" target="_blank" rel="noopener">Dresler et al., Neuron, 2017</a></p>
  </div>
</section>

<section class="s s--story" data-stage="3" data-shift="1" data-dim="0">
  <div class="copy">
    <h2>It is stronger when you are inside it.</h2>
    <p>The hard part was always imagining the palace clearly enough. When researchers let people explore one
    through a headset instead of on a desktop screen, recall rose.</p>
    <figure class="figure">
      <p class="numeral">8.8<span class="numeral__unit">%</span></p>
      <figcaption>better recall inside the headset than at a screen.</figcaption>
    </figure>
    <p>So Loci skips the imagining. The room around you becomes the palace, and every memory gets a real address.</p>
    <p class="cite"><a href="https://doi.org/10.1007/s10055-018-0346-3" target="_blank" rel="noopener">Krokos, Plaisant and Varshney, Virtual Reality, 2018</a></p>
  </div>
</section>

<section class="s s--story s--steps" id="how" data-stage="3" data-tiles="1" data-shift="-1" data-dim="0" data-labels="1">
  <div class="copy copy--right">
    <h2>How your palace is built.</h2>
    <ol class="steps">
      <li data-step="0"><h3>Place</h3><p>Loci reads your room and rests each memory on a different real object, in
      an order your eyes can sweep from left to right.</p></li>
      <li data-step="1"><h3>Study</h3><p>Each new memory shows its fact and a small, strange scene that happens on
      that very object. Picture it there once.</p></li>
      <li data-step="2"><h3>Leave</h3><p>Take the headset off. Everything stays anchored exactly where it landed,
      for tomorrow and the day after.</p></li>
      <li data-step="3"><h3>Recall</h3><p>Come back when they glow. Remember first, pinch to peek, then lift the
      memory if you knew it. Once you have mastered one, its words fade and only the place prompts you.</p></li>
    </ol>
  </div>
</section>

 <section class="s s--open" id="headset" data-stage="3" data-tiles="1" data-shift="0" data-dim="0.9">
  <div class="open">
    <h2 class="open__title">Everything that happens in the headset.</h2>
    <p class="open__lede">Twelve parts, one loop. Touch a star to read what it does. The ones marked as tested are
    checked every time by our mixed-reality test suite.</p>
    <div class="atlas">
      <div class="atlas__sky" data-atlas role="tablist" aria-label="Headset features"></div>
      <div class="atlas__card" data-atlas-detail aria-live="polite"></div>
    </div>
  </div>
</section>

<section class="s s--open" id="habits" data-stage="3" data-tiles="1" data-shift="0" data-dim="0.92">
  <div class="open">
    <h2 class="open__title">Two habits the research agrees on.</h2>
    <div class="duo">
      <article>
        <h3>Recall it, rather than reread it.</h3>
        <div class="vs">
          <div><p class="numeral numeral--small">61<span class="numeral__unit">%</span></p><div data-field="61,100,10,candle,61 in 100 remembered after testing themselves"></div><p class="figure__label">tested themselves</p></div>
          <div><p class="numeral numeral--small numeral--dim">40<span class="numeral__unit numeral__unit--dim">%</span></p><div data-field="40,100,10,star,40 in 100 remembered after rereading"></div><p class="figure__label">reread four times</p></div>
        </div>
        <p>Of a passage, one week later. Pulling a memory out strengthens it more than putting it back in, so Loci
        always asks you to try before it lets you peek.</p>
        <p class="cite"><a href="https://doi.org/10.1111/j.1467-9280.2006.01693.x" target="_blank" rel="noopener">Roediger and Karpicke, Psychological Science, 2006</a></p>
      </article>
      <article>
        <h3>Space it out, rather than cram.</h3>
        <figure class="curve" data-curve></figure>
        <p>A review of 317 experiments found that spreading practice out improves retention, and the best gap grows
        the longer you want to remember. Loci times each recall for you.</p>
        <p class="cite"><a href="https://doi.org/10.1037/0033-2909.132.3.354" target="_blank" rel="noopener">Cepeda et al., Psychological Bulletin, 2006</a></p>
      </article>
    </div>
  </div>
</section>

<section class="s s--open" id="architect" data-stage="3" data-shift="0" data-dim="0.94">
  <div class="open">
    <h2 class="open__title">The Palace Architect.</h2>
    <p class="open__lede">Inventing a good picture is the hardest part of the method, so the Architect does it
    for you, and a plain rule-based check reads every line before you see it.</p>
    <p class="live" data-live><i></i><span>Checking the Architect</span></p>
    <ol class="pipeline" data-pipeline></ol>
    <div class="weave">
      <div class="weave__intro">
        <h3>One memory, any room.</h3>
        <p>The same memory for Saturn (${WEAVE.answer}), rewoven around different objects. These are real
        answers from the Architect. Ask it again to see a fresh one.</p>
        <div class="weave__objects" role="group" aria-label="Objects" data-weave-objects></div>
      </div>
      <figure class="weave__out">
        <p class="weave__before"><span>Before it is placed</span>${WEAVE.scene}</p>
        <blockquote class="weave__scene" data-weave-scene></blockquote>
        <figcaption class="small" data-weave-note></figcaption>
        <button class="lumen lumen--quiet lumen--small" type="button" data-weave-live>Ask the Architect again</button>
      </figure>
    </div>
  </div>
</section>

<section class="s s--open" id="try" data-stage="3" data-tiles="1" data-shift="0" data-dim="0.94">
  <div class="open">
    <h2 class="open__title">Try one recall.</h2>
    <p class="open__lede">The same loop you will use in your room, with the real schedule behind it.</p>
    <div class="demo" data-demo></div>
  </div>
</section>

<section class="s s--open" id="start" data-stage="3" data-shift="0" data-dim="0.94">
  <div class="open">
    <h2 class="open__title">What would you like to remember?</h2>
    <p class="open__lede">Bring it in whatever shape you have it. The Palace Architect turns it into memories and
    teaches them to you in your room.</p>
    <div class="studio">
      <div class="kinds" role="tablist" aria-label="What to remember" aria-orientation="vertical" data-modes></div>
      <div class="desk">
        <label class="desk__help" for="notes" data-help></label>
        <textarea id="notes" rows="5" spellcheck="true" data-notes data-lenis-prevent></textarea>
        <div class="desk__line" aria-hidden="true"></div>
        <div class="desk__meta">
          <div class="for" role="group" aria-label="Who is learning" data-audience>
            <span>Written for</span>
            <button type="button" data-aud="child" aria-pressed="false">a child</button>
            <button type="button" data-aud="teen" aria-pressed="false">a teenager</button>
            <button type="button" data-aud="adult" aria-pressed="true">an adult</button>
          </div>
          <span class="desk__count" data-count-lines></span>
        </div>
        <div class="desk__go">
          <button class="lumen" type="button" data-build>Build my palace</button>
          <button class="textlink" type="button" data-example>Fill in an example</button>
        </div>
        <p class="desk__status" role="status" aria-live="polite" data-build-status></p>
        <p class="samples">Or begin with one of ours: <span data-samples></span></p>
      </div>
    </div>
    <ol class="memories" data-preview-list hidden></ol>
    <div class="ready" data-chosen hidden>
      <p data-chosen-text></p>
      <div class="ready__actions">
        <button class="lumen" type="button" data-enter>Enter your palace</button>
        <button class="lumen lumen--quiet" type="button" data-see-room>See it in a room first</button>
        <button class="textlink" type="button" data-copy-link>Copy a link for your headset</button>
      </div>
      <p class="small" role="status" aria-live="polite" data-link-status></p>
    </div>
  </div>
</section>

<section class="s s--open" id="library" data-stage="3" data-shift="0" data-dim="0.94" hidden>
  <div class="open">
    <h2 class="open__title">Your palaces.</h2>
    <p class="open__lede" data-library-lede></p>
    <div class="library" data-library></div>
    <div class="library__foot">
      <label class="textlink" tabindex="0">Restore a palace from a file<input type="file" accept="application/json,.json" data-import hidden /></label>
      <span class="small" role="status" aria-live="polite" data-data-status></span>
    </div>
  </div>
</section>

<section class="s s--open" id="everyone" data-stage="3" data-shift="0" data-dim="0.92">
  <div class="open">
    <h2 class="open__title">Made for whoever is remembering.</h2>
    <div class="people" data-people></div>
  </div>
</section>

<section class="s s--open" id="receipts" data-stage="3" data-shift="0" data-dim="0.92">
  <div class="open">
    <h2 class="open__title">The receipts.</h2>
    <p class="open__lede">Every number here comes from a real run of the code in the repository.</p>
    <div class="receipts" data-receipts></div>
  </div>
</section>

<section class="s s--open" id="next" data-stage="3" data-shift="0" data-dim="0.92">
  <div class="open">
    <h2 class="open__title">What comes next.</h2>
    <p class="open__lede">What is built today, and what we are building towards. Nothing under Next or Later
    exists yet.</p>
    <div class="road" data-road></div>
  </div>
</section>

<section class="s s--open" id="faq" data-stage="3" data-shift="0" data-dim="0.9">
  <div class="open open--narrow">
    <h2 class="open__title">Good to know.</h2>
    <details><summary>What do I need?</summary><p>A Meta Quest 3 or 3S, and this page open in its browser. Nothing
    to install. Run Space Setup once so Loci knows where your furniture is. Without it, memories rest in a gentle
    arc around you instead.</p></details>
    <details><summary>I do not have a headset yet.</summary><p>You can still build palaces here, try a recall,
    and send a link to anyone who has one. Once a palace has been placed in a room, you can also recall it from
    this page on any screen, and the schedule stays the same.</p></details>
    <details><summary>Is it only for students?</summary><p>No. People use memory palaces for speeches, languages,
    names, numbers, routines and shopping lists. A setting for younger learners keeps the words simple, and
    read-aloud is there for anyone who would rather listen.</p></details>
    <details><summary>Do I have to move around?</summary><p>No. Loci is made for sitting. Memories are placed
    where you can see them by turning your head, and the far ones are drawn larger.</p></details>
    <details><summary>What if I cannot pinch or lift my arm?</summary><p>Open Comfort and access on the panel in
    your room. Look to select lets you flip and rate memories just by looking. There is also high contrast,
    larger tiles, calm motion, read-aloud and a sound switch.</p></details>
    <details><summary>Can I trust what the Architect writes?</summary><p>You see every memory before it goes
    into your room and can remove any of them. When it teaches a topic, it is asked to use only well-established
    facts, but it can still be wrong, so check anything that matters against your own source.</p></details>
    <details><summary>Where does my data go?</summary><p>Your palaces and progress stay in this browser, on this
    device. Text goes to the Palace Architect only when you press build. Numbers are converted on your device and
    never sent anywhere.</p></details>
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
  </div>
</section>

<section class="s s--close" data-stage="4" data-shift="0" data-dim="0">
  <div class="close">
    <p class="close__line">Your room is ready when you are.</p>
    <button class="lumen" type="button" data-enter>Enter your palace</button>
    <p class="close__foot">Open source under the MIT licence.
    <a href="https://github.com/apexxx01/loci" target="_blank" rel="noopener">Read the code</a></p>
  </div>
</section>
</div>

<div class="breathe" data-breathe hidden role="dialog" aria-modal="true" aria-label="A minute of breathing">
  <p class="breathe__word" data-breathe-word aria-live="polite">Settle in</p>
  <p class="breathe__count" data-breathe-count></p>
  <button class="lumen lumen--quiet" type="button" data-breathe-close>I am ready</button>
</div>`;

/** A palace drawn as its own constellation: where each memory rests, the route between them, and how strong each is. */
function constellation(p: Palace, now: Date): string {
  const W = 168, H = 112, PAD = 14;
  const items = [...p.deck.items].sort((a, b) => a.order - b.order);
  const byId = new Map(p.placements.map((pl) => [pl.memoryId, pl.pose.p]));
  let pts: [number, number][];
  if (items.every((it) => byId.has(it.id)) && items.length > 1) {
    // Top-down: x across the room, z towards and away from you.
    const raw = items.map((it) => byId.get(it.id)!).map((v) => [v[0], v[2]] as [number, number]);
    const xs = raw.map((v) => v[0]), zs = raw.map((v) => v[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const sx = (W - PAD * 2) / Math.max(0.2, x1 - x0), sz = (H - PAD * 2) / Math.max(0.2, z1 - z0);
    const k = Math.min(sx, sz);
    const ox = (W - (x1 - x0) * k) / 2, oz = (H - (z1 - z0) * k) / 2;
    pts = raw.map(([x, z]) => [ox + (x - x0) * k, oz + (z - z0) * k]);
  } else {
    // Not placed in a room yet: the arc Loci uses when there is no furniture.
    pts = items.map((_, i) => {
      const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, items.length - 1));
      return [W / 2 - Math.cos(a) * (W / 2 - PAD), H - PAD - Math.sin(a) * (H - PAD * 2)];
    });
  }
  const due = new Set(dueIds(p, now));
  const route = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const stars = items
    .map((it, i) => {
      const c = p.cards[it.id];
      const v = c && c.reps ? retrievability(c, now) : 0;
      const [x, y] = pts[i];
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.6 + v * 3.2).toFixed(1)}" class="star${due.has(it.id) ? ' star--due' : ''}" style="--v:${Math.max(0.25, v).toFixed(2)}"><title>${esc(it.cue)}: ${c && c.reps ? `${Math.round(v * 100)}% likely to recall` : 'not studied yet'}</title></circle>`;
    })
    .join('');
  return `<svg class="sky-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of where each memory rests"><path d="${route}" class="sky-map__route"/>${stars}</svg>`;
}

export function mountLanding(opts: LandingOptions): { hide(): void; show(): void; focusNotes(): void } {
  const root = document.createElement('main');
  root.className = 'landing';
  root.setAttribute('aria-labelledby', 'landing-title');
  root.innerHTML = HTML;
  document.body.appendChild(root);
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const flow = $('[data-flow]');

  /* ---------------------------------------------------- smooth scroll */
  const lenis = calm || coarse ? null : new Lenis({ wrapper: root, content: flow, lerp: 0.08, smoothWheel: true });
  const scrollTo = (el: HTMLElement) => {
    if (lenis) lenis.scrollTo(el, { offset: -20, duration: 1.6 });
    else el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
  };
  if (lenis) {
    const loop = (t: number) => {
      if (!root.hidden) lenis.raf(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------------------------------------------------- the sky */
  const scene = createLandingScene($<HTMLCanvasElement>('.cosmos'));
  void (scene?.ready ?? Promise.resolve()).then(() => root.classList.add('is-ready'));
  // Never keep the words waiting on a slow graphics card.
  setTimeout(() => root.classList.add('is-ready'), 2600);
  if (!scene) root.classList.add('is-ready');

  const progressBar = $('[data-progress]');
  const num = (el: HTMLElement, k: string) => Number(el.dataset[k] ?? 0);
  let breathing = false;
  let labelsOn = 0;
  let litTile = -1;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const sections = $$('section.s').filter((s) => !s.hidden);
      const vh = root.clientHeight;
      const mid = root.scrollTop + vh / 2;
      const centers = sections.map((s) => s.offsetTop + s.offsetHeight / 2);
      let i = 0;
      while (i < centers.length - 2 && mid > centers[i + 1]) i++;
      const t = Math.max(0, Math.min(1, (mid - centers[i]) / (centers[i + 1] - centers[i])));
      const a = sections[i];
      const b = sections[i + 1];
      const mix = (k: string) => num(a, k) + (num(b, k) - num(a, k)) * t;
      labelsOn = mix('labels');
      if (!breathing) scene?.set({ progress: mix('stage'), tiles: mix('tiles'), shift: mix('shift'), dim: mix('dim') });
      const max = root.scrollHeight - vh;
      progressBar.style.transform = `scaleY(${max > 0 ? root.scrollTop / max : 0})`;
      root.classList.toggle('is-scrolled', root.scrollTop > 40);
    });
  };
  root.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  // Steps of "how it works" light their tile as they reach the middle.
  const stepIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = Number((e.target as HTMLElement).dataset.step);
        $$('[data-step]').forEach((s) => s.classList.toggle('is-lit', s === e.target));
        litTile = STEP_TILE[i] ?? -1;
        scene?.set({ focus: litTile });
      }
    },
    { root, rootMargin: '-45% 0px -45% 0px' },
  );
  $$('[data-step]').forEach((s) => stepIO.observe(s));
  const howIO = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) return;
    litTile = -1;
    scene?.set({ focus: -1 });
  }), { root });
  howIO.observe($('#how'));
  const leapIO = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { root, threshold: 0.6 });
  $$('[data-field], [data-curve]').forEach((el) => leapIO.observe(el));

  // The nav marks the chapter you are in with a small star.
  const spyIO = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const id = (e.target as HTMLElement).id;
        $$('[data-spy]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.spy === id));
      }
    },
    { root, rootMargin: '-48% 0px -48% 0px' },
  );
  $$('section[id]').forEach((s) => spyIO.observe(s));

  // Labels drawn like a star chart beside each memory in the room.
  const callouts = $('[data-callouts]') as unknown as SVGSVGElement;
  callouts.innerHTML = LOCI.map(
    (l) => `<g><line/><circle r="2.2"/><text class="c-cue">${esc(l.cue)}</text><text class="c-place">on ${esc(l.label)}</text></g>`,
  ).join('');
  const groups = [...callouts.querySelectorAll('g')];
  const showInRoom = (deck: Deck) => {
    const items = [...deck.items].sort((a, b) => a.order - b.order).slice(0, LOCI.length);
    scene?.showDeck(items.map((it) => ({ glyph: it.glyphs[0] ?? '✨', cue: it.cue })));
    groups.forEach((g, i) => {
      g.style.display = i < items.length ? '' : 'none';
      if (i < items.length) g.querySelector('.c-cue')!.textContent = items[i].cue.length > 22 ? `${items[i].cue.slice(0, 21)}…` : items[i].cue;
    });
  };
  scene?.onTiles((tiles) => {
    const show = labelsOn > 0.5 && window.innerWidth > 900 && !breathing;
    callouts.style.opacity = show ? '1' : '0';
    if (!show) return;
    const w = window.innerWidth;
    tiles.forEach((t, i) => {
      const g = groups[i];
      const left = t.x > w * 0.5;
      const dx = left ? 40 : -40;
      const lx = t.x + dx, ly = t.y - 30;
      const [line, dot, cue, place] = g.children as unknown as [SVGLineElement, SVGCircleElement, SVGTextElement, SVGTextElement];
      line.setAttribute('x1', String(t.x + (left ? 16 : -16)));
      line.setAttribute('y1', String(t.y - 12));
      line.setAttribute('x2', String(lx));
      line.setAttribute('y2', String(ly));
      dot.setAttribute('cx', String(lx));
      dot.setAttribute('cy', String(ly));
      const anchor = left ? 'start' : 'end';
      const tx = lx + (left ? 8 : -8);
      cue.setAttribute('x', String(tx));
      cue.setAttribute('y', String(ly - 2));
      cue.setAttribute('text-anchor', anchor);
      place.setAttribute('x', String(tx));
      place.setAttribute('y', String(ly + 14));
      place.setAttribute('text-anchor', anchor);
      const emphasis = litTile < 0 ? 0.8 : litTile === i ? 1 : 0.28;
      g.style.opacity = String(Math.max(0, t.a * 1.4 - 0.4) * emphasis);
    });
  });

  // A slow ring of light from wherever you click the sky.
  root.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, textarea, label, summary, .demo, .studio, [data-library]')) return;
    scene?.ripple(e.clientX, e.clientY);
  });

  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const target = root.querySelector<HTMLElement>(a.getAttribute('href')!);
    if (!target) return;
    e.preventDefault();
    scrollTo(target);
  });

  /* ---------------------------------------------------- breathe */
  const breatheEl = $('[data-breathe]');
  const word = $('[data-breathe-word]');
  const count = $('[data-breathe-count]');
  const IN = 4, OUT = 6, ROUNDS = 6;
  let breathRaf = 0;
  const endBreath = () => {
    cancelAnimationFrame(breathRaf);
    breathing = false;
    breatheEl.classList.remove('is-open');
    setTimeout(() => (breatheEl.hidden = true), 600);
    root.classList.remove('is-breathing');
    scene?.set({ breath: 0 });
    lenis?.start();
    onScroll();
  };
  const startBreath = () => {
    breathing = true;
    breatheEl.hidden = false;
    lenis?.stop();
    root.classList.add('is-breathing');
    requestAnimationFrame(() => breatheEl.classList.add('is-open'));
    scene?.set({ dim: 0 });
    const t0 = performance.now() + 2200;
    word.textContent = 'Settle in';
    count.textContent = `A minute, ${ROUNDS} slow breaths`;
    let lastWord = '';
    const tick = (now: number) => {
      breathRaf = requestAnimationFrame(tick);
      const t = (now - t0) / 1000;
      if (t < 0) return;
      const round = Math.floor(t / (IN + OUT));
      if (round >= ROUNDS) {
        word.textContent = 'Welcome.';
        count.textContent = 'You are here, and ready.';
        scene?.set({ breath: 0 });
        cancelAnimationFrame(breathRaf);
        setTimeout(() => breathing && endBreath(), 2600);
        return;
      }
      const k = t % (IN + OUT);
      const v = k < IN ? Math.sin((k / IN) * Math.PI * 0.5) : Math.cos(((k - IN) / OUT) * Math.PI * 0.5);
      scene?.set({ breath: v });
      breatheTone(v);
      const w = k < IN ? 'Breathe in' : 'And slowly out';
      if (w !== lastWord) {
        lastWord = w;
        word.textContent = w;
        count.textContent = `${round + 1} of ${ROUNDS}`;
      }
    };
    breathRaf = requestAnimationFrame(tick);
    $('[data-breathe-close]').focus({ preventScroll: true });
  };
  $('[data-breathe-open]').addEventListener('click', startBreath);
  $('[data-breathe-close]').addEventListener('click', endBreath);
  breatheEl.addEventListener('keydown', (e) => e.key === 'Escape' && endBreath());

  /* ---------------------------------------------------- star charts */
  $$('[data-field]').forEach((el) => {
    const [lit, total, cols, tone, ...label] = el.dataset.field!.split(',');
    el.innerHTML = starField(Number(lit), Number(total), Number(cols), tone as 'candle', label.join(','));
    el.classList.add('field');
    if (calm) el.classList.add('in');
  });
  {
    const c = curveStars();
    $('[data-curve]').innerHTML = `${c.svg}<figcaption class="small">${c.caption}</figcaption>`;
  }
  $('[data-wordmark-sigil]').innerHTML = sigilSVG('loci', 22);

  /* ---------------------------------------------------- headings resolve word by word */
  const headIO = new IntersectionObserver((en) => en.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { root, threshold: 0.35 });
  $$('section h2').forEach((h) => {
    h.innerHTML = h.textContent!.trim().split(/\s+/).map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' ');
    if (calm) h.classList.add('in');
    else headIO.observe(h);
  });

  /* ---------------------------------------------------- lanterns lean towards the cursor */
  if (!coarse && !calm) {
    let leaning: HTMLElement | null = null;
    root.addEventListener('pointermove', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.lumen');
      if (leaning && leaning !== b) leaning.style.transform = '';
      leaning = b;
      if (!b) return;
      const r = b.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * 0.18;
      const dy = (e.clientY - (r.top + r.height / 2)) * 0.3;
      b.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }, { passive: true });
  }

  /* ---------------------------------------------------- write it in the stars */
  {
    const form = $<HTMLFormElement>('[data-whisper]');
    const input = $<HTMLInputElement>('[data-whisper-input]');
    const said = $('[data-whisper-said]');
    const line = $('[data-whisper-line]');
    let written = '';
    const free = () => {
      if (!written) return;
      written = '';
      scene?.release();
      root.classList.remove('is-whispering');
      said.hidden = true;
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.replace(/\s+/g, ' ').trim().slice(0, 32);
      if (!text) return;
      if (!scene?.write(text)) return;
      written = text;
      root.classList.add('is-whispering');
      said.hidden = false;
      line.textContent = 'Written in your sky.';
      chime('good');
      input.blur();
    });
    $('[data-whisper-free]').addEventListener('click', () => {
      free();
      input.value = '';
    });
    $('[data-whisper-build]').addEventListener('click', () => {
      const text = written;
      free();
      // One short phrase reads as a topic to teach; anything list-like as notes.
      setMode(/[-:,]/.test(text) ? 'notes' : 'topic');
      notes.value = text;
      notes.dispatchEvent(new Event('input'));
      scrollTo($('#start'));
      setTimeout(() => notes.focus({ preventScroll: true }), 1200);
    });
    root.addEventListener('scroll', () => written && root.scrollTop > root.clientHeight * 0.45 && free(), { passive: true });
    window.addEventListener('keydown', (e) => e.key === 'Escape' && free());
  }

  /* ---------------------------------------------------- the headset, as a constellation */
  {
    const sky = $('[data-atlas]');
    const detail = $('[data-atlas-detail]');
    const lines = HEADSET.slice(1).map((f, i) => `<line x1="${HEADSET[i].at[0]}" y1="${HEADSET[i].at[1]}" x2="${f.at[0]}" y2="${f.at[1]}"/>`).join('');
    sky.innerHTML = `<svg class="atlas__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}<line x1="${HEADSET[11].at[0]}" y1="${HEADSET[11].at[1]}" x2="${HEADSET[0].at[0]}" y2="${HEADSET[0].at[1]}"/></svg>`
      + '<div class="atlas__core" data-atlas-core aria-hidden="true"></div>'
      + HEADSET.map((f, i) => `<button type="button" role="tab" class="atlas__star${f.verified ? ' atlas__star--tested' : ''}" style="left:${f.at[0]}%;top:${f.at[1]}%" data-feature="${i}" aria-selected="false"><i></i><span>${esc(f.title)}</span></button>`).join('');
    let auto = 0;
    const pick = (i: number) => {
      const f = HEADSET[i];
      $$('[data-feature]').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.feature) === i)));
      const core = sky.querySelector<HTMLElement>('[data-atlas-core]')!;
      core.innerHTML = sigilSVG(f.title, 150);
      detail.innerHTML = `<p class="atlas__group">${String(i + 1).padStart(2, '0')} of 12, ${esc(f.group.toLowerCase())}</p>
        <h3>${esc(f.title)}</h3><p>${esc(f.text)}</p>${f.verified ? `<p class="atlas__tested"><i></i>${esc(f.verified)}</p>` : ''}`;
    };
    sky.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-feature]');
      if (!b) return;
      clearInterval(auto);
      pick(Number(b.dataset.feature));
    });
    sky.addEventListener('pointerover', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-feature]');
      if (b && matchMedia('(hover: hover)').matches) {
        clearInterval(auto);
        pick(Number(b.dataset.feature));
      }
    });
    pick(0);
    // Until you touch it, the constellation walks itself through the loop, slowly.
    if (!calm) {
      let k = 0;
      const io = new IntersectionObserver((en) => {
        if (en[0].isIntersecting && !auto) auto = window.setInterval(() => pick((k = (k + 1) % HEADSET.length)), 4200);
        else if (!en[0].isIntersecting) { clearInterval(auto); auto = 0; }
      }, { root, threshold: 0.4 });
      io.observe(sky);
    }
  }

  /* ---------------------------------------------------- the Architect */
  $('[data-pipeline]').innerHTML = PIPELINE.map((p, i) => `<li style="--i:${i}"><i></i><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></li>`).join('');
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
        live.querySelector('span')!.textContent = 'The Architect is unreachable right now. Loci will build straight from your lines instead.';
      });
    const objects = Object.keys(WEAVE.scenes);
    const objEl = $('[data-weave-objects]');
    const sceneEl = $('[data-weave-scene]');
    const noteEl = $('[data-weave-note]');
    let current = 'lamp';
    const fresh: Record<string, { text: string; ms: number; model: string }> = {};
    objEl.innerHTML = objects.map((o) => `<button type="button" data-obj="${o}" aria-pressed="false">your ${o}</button>`).join('');
    const show = (o: string) => {
      current = o;
      $$('[data-obj]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.obj === o)));
      const f = fresh[o];
      sceneEl.classList.remove('is-new');
      void sceneEl.offsetWidth;
      sceneEl.classList.add('is-new');
      sceneEl.textContent = f ? f.text : WEAVE.scenes[o];
      noteEl.textContent = f
        ? `Just now, from ${f.model}, in ${(f.ms / 1000).toFixed(1)} seconds.`
        : `Saved from a real run on 15 November, from ${WEAVE.model}.`;
    };
    objEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-obj]');
      if (b) show(b.dataset.obj!);
    });
    const liveBtn = $<HTMLButtonElement>('[data-weave-live]');
    liveBtn.addEventListener('click', async () => {
      liveBtn.disabled = true;
      liveBtn.textContent = 'Weaving';
      const started = performance.now();
      try {
        const r = await fetch('/api/architect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'bind', items: [{ cue: WEAVE.cue, scene: WEAVE.scene, label: current }] }),
        });
        const d = (await r.json()) as { scenes?: string[]; model?: string; error?: string };
        if (!r.ok || !d.scenes?.[0]) throw new Error(d.error ?? 'No answer');
        fresh[current] = { text: d.scenes[0], ms: performance.now() - started, model: d.model ?? 'the Architect' };
        show(current);
        chime('soft');
      } catch (err) {
        noteEl.textContent = `The Architect did not answer (${(err as Error).message}). The saved answer is shown instead.`;
      } finally {
        liveBtn.disabled = false;
        liveBtn.textContent = 'Ask the Architect again';
      }
    });
    show('lamp');
  }

  /* ---------------------------------------------------- who, receipts, next */
  $('[data-people]').innerHTML = AUDIENCES.map((a) => `<article>${sigilSVG(a.who, 40, 'sigil people__sigil')}<h3>${esc(a.who)}</h3><p>${esc(a.text)}</p></article>`).join('');
  $('[data-receipts]').innerHTML = RECEIPTS.map((r) => `<div><p class="numeral numeral--receipt"><span data-count="${esc(r.n)}">${esc(r.n)}</span>${r.unit ? `<span class="numeral__unit">${esc(r.unit)}</span>` : ''}</p><p>${esc(r.text)}</p></div>`).join('');
  {
    // Each receipt counts up once, the first time it comes into view.
    const io = new IntersectionObserver((en) => en.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const el = e.target as HTMLElement;
      const goal = el.dataset.count!;
      const dec = goal.includes('.') ? goal.split('.')[1].length : 0;
      const end = Number(goal);
      if (calm || !end) return;
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 1600);
        el.textContent = (end * (1 - Math.pow(1 - k, 3))).toFixed(dec);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { root, threshold: 0.6 });
    $$('[data-count]').forEach((el) => io.observe(el));
  }
  $('[data-road]').innerHTML = ROADMAP.map((g) => `<div class="road__col road__col--${g.when.toLowerCase()}"><h3><i></i>${g.when}</h3><ul>${g.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('');

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
      ? chosen ? `Preview ${chosen.title} here` : 'Preview on this screen'
      : chosen ? `Enter with ${chosen.title}` : palace ? 'Return to your palace' : 'Enter your palace';
    enterButtons.forEach((b) => (b.textContent = b.classList.contains('lumen--small') ? (hasXR ? 'Enter' : 'Preview') : label));
    chosenBox.hidden = !chosen;
    if (chosen) {
      $('[data-chosen-text]').textContent = `${chosen.title}: ${chosen.items.length} ${chosen.items.length === 1 ? 'memory' : 'memories'}, ready to be placed around your room. Palaces you already keep stay in your library.`;
    }
  };
  const choose = (deck: Deck | null) => {
    chosen = deck;
    if (deck) showInRoom(deck);
    $$('[data-sample]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sample === deck?.id)));
    paintEnter();
  };
  const ambientBtn = $('[data-ambient]');
  const paintAmbient = () => {
    const on = ambientOn();
    ambientBtn.setAttribute('aria-pressed', String(on));
    ambientBtn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
  };
  const leave = () => {
    stopAmbient();
    paintAmbient();
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
    (m) => `<button type="button" role="tab" class="kind" data-mode="${m.id}" aria-selected="false">
      ${sigilSVG(m.label, 34, 'sigil kind__sigil')}<span class="kind__label">${m.label}</span><span class="kind__who">${m.who}</span></button>`,
  ).join('');
  $('[data-samples]').innerHTML = STARTER_DECKS.map(
    (d) => `<button type="button" class="textlink sample" data-sample="${d.id}" aria-pressed="false">${esc(d.title)}</button>`,
  ).join('');

  const paintCount = () => {
    if (mode === 'topic' || mode === 'number') return (countEl.textContent = '');
    const n = notes.value.split('\n').filter((l) => l.trim()).length;
    countEl.textContent = n ? `${Math.min(n, 12)} of 12 lines${n > 12 ? ', the rest are left out' : ''}` : '';
  };
  const setMode = (id: Mode) => {
    mode = id;
    const m = MODES.find((x) => x.id === id)!;
    $$('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === id)));
    $('[data-help]').textContent = m.help;
    notes.placeholder = m.example;
    notes.value = drafts[id] ?? '';
    notes.rows = id === 'topic' || id === 'number' ? 2 : 5;
    buildBtn.textContent = m.cta;
    $('[data-audience]').hidden = id === 'number';
    paintCount();
  };
  $('[data-modes]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]');
    if (b) {
      setMode(b.dataset.mode as Mode);
      notes.focus({ preventScroll: true });
    }
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
    notes.focus({ preventScroll: true });
  });
  $('[data-samples]').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sample]');
    if (!b) return;
    built = STARTER_DECKS.find((d) => d.id === b.dataset.sample) ?? null;
    buildStatus.textContent = built ? `${built.title}. ${built.subtitle}.` : '';
    paintPreview();
    choose(built);
  });

  const paintPreview = () => {
    if (!built) return;
    previewList.innerHTML = built.items
      .map(
        (it, i) => `<li style="--i:${i}">
          ${sigilSVG(it.cue, 44, 'sigil memories__sigil')}
          <span class="memories__text"><strong>${esc(it.cue)}</strong><span class="memories__answer">${esc(it.answer)}</span>
          <span class="memories__scene">${esc(it.scene)}</span></span>
          <button type="button" class="textlink textlink--quiet" data-remove="${i}" aria-label="Remove ${esc(it.cue)}">Remove</button>
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
        ? `${built.subtitle}. Made on this device, nothing was sent anywhere.`
        : 'Type a number with at least three digits.';
      if (built) {
        paintPreview();
        choose(built);
        chime('soft');
      }
      return;
    }
    buildBtn.disabled = true;
    root.classList.add('is-building');
    buildBtn.textContent = 'Building';
    buildStatus.textContent = mode === 'topic'
      ? 'The Palace Architect is choosing the key facts and turning them into pictures.'
      : 'The Palace Architect is turning your words into pictures. This takes a few seconds.';
    const result = await buildDeck(notes.value, mode, audience);
    buildBtn.disabled = false;
    root.classList.remove('is-building');
    buildBtn.textContent = m.cta;
    if (!result.ok) {
      buildStatus.textContent = result.error;
      notes.focus();
      return;
    }
    built = result.deck;
    chime('good');
    buildStatus.textContent =
      result.via === 'architect'
        ? `${built.items.length} memories, built in ${(result.ms / 1000).toFixed(1)} seconds.${result.repaired ? ` ${result.repaired} picture${result.repaired > 1 ? 's were' : ' was'} replaced by the safety check.` : ''}${mode === 'topic' ? ' Check the facts against your own source and remove any you do not want.' : ' Remove any you do not want.'}`
        : `${built.items.length} memories made straight from your lines, because the Palace Architect is unavailable right now.`;
    paintPreview();
    choose(built);
  });

  $('[data-see-room]').addEventListener('click', () => scrollTo($('#how')));
  const linkStatus = $('[data-link-status]');
  $('[data-copy-link]').addEventListener('click', async () => {
    if (!chosen) return;
    const url = `${location.origin}${location.pathname}#p=${await encodeDeck(chosen)}`;
    try {
      await navigator.clipboard.writeText(url);
      linkStatus.textContent = 'Link copied. Open it in the headset browser and the same palace builds there.';
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

  const recall = (palace: Palace) => {
    root.classList.add('is-recalling');
    lenis?.stop();
    scene?.set({ dim: 0.94 });
    openReview({
      palace,
      save: (memoryId, rating) => opts.library.review(palace.id, memoryId, rating),
      onRated: (r) => chime(r === 'again' ? 'soft' : 'good'),
      onClose: () => {
        root.classList.remove('is-recalling');
        lenis?.start();
        paintLibrary();
      },
    });
  };

  const paintLibrary = () => {
    const all = opts.library.list();
    const active = opts.getPalace();
    const now = new Date();
    libSection.hidden = all.length === 0;
    $('[data-nav-library]').hidden = all.length === 0;
    const kept = all.reduce((n, p) => n + p.deck.items.length, 0);
    const strong = all.reduce((n, p) => n + Math.round(mastery(p) * p.deck.items.length), 0);
    $('[data-library-lede]').textContent = `You are keeping ${kept} ${kept === 1 ? 'memory' : 'memories'} across ${all.length} ${all.length === 1 ? 'palace' : 'palaces'}${strong ? `, and ${strong} ${strong === 1 ? 'is' : 'are'} already strong` : ''}. Each star is a memory, drawn where it rests in your room and brighter the more likely you are to recall it today.`;
    libEl.innerHTML = all
      .map((p) => {
        const due = dueIds(p, now).length;
        const next = nextDue(p);
        const isActive = active?.id === p.id;
        const days = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(now.getTime() - (13 - i) * 86_400_000).toDateString();
          return p.history.some((h) => new Date(h.at).toDateString() === d);
        });
        const s = streak(p.history, now);
        return `<article class="palace${isActive ? ' is-active' : ''}" data-id="${esc(p.id)}">
          ${constellation(p, now)}
          <div class="palace__main">
            <h3>${esc(p.deck.title)}</h3>
            <p class="palace__meta">${p.deck.items.length} memories${isActive ? ', in your room now' : ''}.
              ${due ? `<b>${due} glowing</b>, ready to recall.` : next ? `Next one returns in ${span(next.getTime() - now.getTime())}.` : ''}
              ${Math.round(mastery(p) * 100)}% mastered${s ? `, ${s} day streak` : ''}.</p>
            <div class="days" role="img" aria-label="Days practised in the last two weeks">${days.map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('')}</div>
            <div class="palace__actions">
              <button class="lumen lumen--small" type="button" data-act="recall">${due ? `Recall ${due} now` : 'Practise the weakest'}</button>
              ${isActive ? '' : '<button class="lumen lumen--small lumen--quiet" type="button" data-act="open">Put it in my room</button>'}
              <button class="textlink" type="button" data-act="share">Share</button>
              <button class="textlink" type="button" data-act="remind">Add a reminder</button>
              <button class="textlink" type="button" data-act="download">Save a copy</button>
              <button class="textlink textlink--quiet" type="button" data-act="delete">Delete</button>
            </div>
            <p class="small" role="status" aria-live="polite" data-palace-status></p>
          </div>
        </article>`;
      })
      .join('');

    returning.hidden = !active;
    if (active) {
      const due = dueIds(active, now).length;
      const next = nextDue(active);
      returning.innerHTML = `<p class="welcome__line">Welcome back. <b>${esc(active.deck.title)}</b> is in your room. ${
        due ? `${due} ${due === 1 ? 'memory is' : 'memories are'} glowing.` : next ? `Nothing is due; the next returns in ${span(next.getTime() - now.getTime())}.` : ''
      }</p>
      <div class="welcome__actions">${due ? `<button class="lumen lumen--small lumen--quiet" type="button" data-welcome-recall>Recall ${due === 1 ? 'it' : 'them'} here</button>` : ''}
      <a class="textlink" href="#library">${all.length > 1 ? `All ${all.length} palaces` : 'See how strong it is'}</a></div>`;
      returning.querySelector('[data-welcome-recall]')?.addEventListener('click', () => recall(active));
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
      case 'recall':
        recall(palace);
        break;
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
            `DESCRIPTION:Your memories are glowing. ${location.origin}${location.pathname}`, 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY',
            `DESCRIPTION:Loci: recall ${palace.deck.title}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'),
          'text/calendar',
        );
        status.textContent = `Reminder saved for ${at.toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}, when the next memory is due.`;
        break;
      }
      case 'download':
        download(`loci-${slug}.json`, JSON.stringify(palace, null, 2), 'application/json');
        status.textContent = 'Saved. Restore it on any device from the bottom of this list.';
        break;
      case 'delete':
        if (b.dataset.armed) {
          opts.library.remove(palace.id);
          paintLibrary();
          paintEnter();
        } else {
          b.dataset.armed = '1';
          b.textContent = 'Delete for good?';
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

  /* ---------------------------------------------------- demo + sound */
  mountDemo($('[data-demo]'), () => scrollTo($('#start')));
  ambientBtn.addEventListener('click', () => {
    toggleAmbient();
    paintAmbient();
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
      sharedNote.innerHTML = `Someone sent you <b>${esc(r.deck.title)}</b>, ${r.deck.items.length} memories. Enter and it is built around your own furniture.`;
      built = r.deck;
      choose(r.deck);
    });
  }

  /* ---------------------------------------------------- headset check */
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
  const noXR = () => {
    hasXR = false;
    $('[data-device-note]').textContent =
      'Mixed reality needs a Quest 3 or 3S. On this screen you can try a recall, build a palace, recall what is glowing, and send it to a headset.';
    paintEnter();
  };
  if (!xr) noXR();
  else xr.isSessionSupported('immersive-ar').then((ok) => (ok ? undefined : noXR())).catch(noXR);

  /* ---------------------------------------------------- a small light that follows you */
  const glow = document.createElement('div');
  glow.className = 'cursor';
  glow.setAttribute('aria-hidden', 'true');
  if (!coarse && !calm) {
    root.after(glow);
    root.addEventListener('pointermove', (e) => (glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`), { passive: true });
  }

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
      if (breathing) endBreath();
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
