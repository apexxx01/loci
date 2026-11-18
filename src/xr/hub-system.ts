/**
 * Binds the hub panel: deck buttons, palace stats, status line, and places the
 * hub comfortably in front of a seated user when mixed reality starts.
 */
import { createSystem, Vector3, type Intersection, type Object3D, type Raycaster, type UIKitMLAsset } from '@iwsdk/core';
import { conceptById } from '../core/concepts.js';
import { teachConcept, verifyConcept } from '../net/architect-client.js';
import { replaceItem, savePalace } from '../core/palace.js';
import { DeckSchema } from '../core/schema.js';
import type { Deck } from '../core/types.js';
import { findStarterDeck } from '../core/decks.js';
import { dueIds, mastery, streak } from '../core/scheduler.js';
import { listPalaces } from '../core/palace.js';
import { app, bus, getStorage, setStatus } from './app-state.js';
import { onSettings, settings, toggleSetting, type Settings } from './settings.js';
import { playClick } from './sound.js';
import { PalaceSystem } from './palace-system.js';
import { ChainSystem } from './chain-system.js';

const ACCESS: { key: keyof Settings; id: string; label: string; on: string; off: string; say: [string, string] }[] = [
  { key: 'dwell', id: 'acc-dwell', label: 'Look to select', on: 'on', off: 'off', say: ['Look at a memory for a moment to flip it; look at a button to rate it.', 'Look to select is off. Pinch and grab as usual.'] },
  { key: 'contrast', id: 'acc-contrast', label: 'High contrast', on: 'on', off: 'off', say: ['High contrast on: black cards, white text, yellow edges.', 'High contrast off.'] },
  { key: 'large', id: 'acc-large', label: 'Larger tiles', on: 'on', off: 'off', say: ['Memories are 35% larger.', 'Memories back to normal size.'] },
  { key: 'calm', id: 'acc-calm', label: 'Calm motion', on: 'on', off: 'off', say: ['Calm motion: no flights, hops or shakes.', 'Motion effects back on.'] },
  { key: 'speak', id: 'acc-speak', label: 'Read aloud', on: 'on', off: 'off', say: ['Answers are read aloud when you reveal them.', 'Read aloud is off.'] },
  { key: 'sound', id: 'acc-sound', label: 'Sound', on: 'on', off: 'off', say: ['Sound cues on.', 'Sound cues off. Every cue also shows as colour and text.'] },
];

type Lookable = {
  id: string;
  el: Object3D & { isVisible?: { value: boolean }; raycast(r: Raycaster, out: Intersection[]): void };
  press: () => void;
};

type El = {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  setProperties(p: Record<string, unknown>): void;
};

/** Press-and-release on the same button, independent of timing. */

const HUB_DISTANCE = 0.55;
const HUB_DROP = 0.22;
/** Docked: out of the line of sight, like a tray by your left hand. */
const DOCK_YAW = (-38 * Math.PI) / 180;
const DOCK_DISTANCE = 0.5;
/** Finished questions offered as you type in the headset. */
const SUGGEST = [
  'How does the heart pump blood?', 'How does photosynthesis work?', 'How do vaccines work?', 'How does the internet work?',
  'How does a bill become a law?', 'How does compound interest work?', 'How does inflation work?', 'How do tides work?',
  'How do volcanoes erupt?', 'How do earthquakes happen?', 'How does memory work?', 'How does sleep work?',
  'How does a credit score work?', 'How do stocks work?', 'How does a car engine work?', 'How do airplanes fly?',
  'How does GPS work?', 'How does Wi-Fi work?', 'How do batteries work?', 'How does digestion work?',
  'How do muscles grow?', 'How does the immune system work?', 'How does DNA copy itself?', 'How do antibiotics work?',
  'How does a rainbow form?', 'How does electricity reach my home?', 'How does a fridge keep food cold?',
  'How does machine learning work?', 'How does encryption work?', 'How does a search engine work?',
  'Why do we have seasons?', 'Why is the sky blue?', 'Why do we dream?', 'Why do we yawn?', 'Why do leaves change colour?',
  'Why does the moon change shape?', 'Why do prices go up?', 'Why do we need sleep?',
  'What is a black hole?', 'What is climate change?', 'What is a recession?', 'What is the water cycle?', 'What is gravity?',
  'Explain supply and demand', 'Explain the French Revolution', 'Explain how a bill is passed', 'Explain the Krebs cycle',
  'Explain how neurons fire', 'Explain plate tectonics', 'Explain the stock market',
];

const DOCK_DROP = 0.42;
const GLIDE_SPEED = 5;

export class HubSystem extends createSystem({}) {
  private panel: UIKitMLAsset | null = null;
  private statsTimer = 0;
  private lastStatus = 'Ready.';
  private tmp = new Vector3();
  private fwd = new Vector3();
  /** Frames to wait before placing the hub (XR camera pose becomes live). */
  private placeIn = -1;
  private docked = false;
  private asking = false;
  private browsing = false;
  private askText = '';
  private askBusy = false;
  private glideTarget: Vector3 | null = null;
  private glideLook = new Vector3();
  private headAtPlace = new Vector3();

  init(): void {
    this.panel = this.world.getSceneObject<UIKitMLAsset>('hub') ?? null;
    if (!this.panel) {
      console.warn('[loci] hub panel missing');
      return;
    }
    this.panel.name = 'Loci Hub';

    const bind = (id: string, fn: () => void) => {
      const el = this.el(id);
      if (!el) return;
      // pmndrs pointer-events drops 'click' when a press outlasts its click
      // threshold, which happens with slow pinches and dropped frames. Treat a
      // down + up on the same button as activation instead, however long the
      // press is held: slow, deliberate hands should never be timed out.
      let downAt = 0;
      const onDown = () => (downAt = performance.now());
      const onLeave = () => (downAt = 0);
      const onUp = () => {
        if (!downAt) return;
        downAt = 0;
        playClick();
        fn();
      };
      this.lookables.push({ id, el: el as unknown as Lookable['el'], press: fn });
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointerleave', onLeave);
      this.cleanupFuncs.push(
        () => el.removeEventListener('pointerdown', onDown),
        () => el.removeEventListener('pointerup', onUp),
        () => el.removeEventListener('pointerleave', onLeave),
      );
    };

    for (const id of ['heart', 'plants', 'seasons', 'vaccine', 'water', 'web', 'pr']) {
      bind(`concept-${id}`, () => {
        const deck = conceptById(`concept-${id}`);
        if (deck) bus.emit({ type: 'start-deck', deck });
      });
    }
    bind('deck-planets', () => {
      const deck = findStarterDeck('planets');
      if (deck) bus.emit({ type: 'start-deck', deck });
    });
    bind('deck-phone', () => bus.emit({ type: 'own-notes' }));

    // Asking, right here: a keyboard on the panel, so nobody has to leave the room to type.
    const showAsk = (on: boolean) => {
      this.asking = on;
      this.setDisplay('section-ask', on);
      this.setDisplay('section-decks', !on && !app.palace);
      if (on) this.paintAsk();
    };
    bind('btn-ask', () => showAsk(true));
    bind('btn-chain', () => this.world.getSystem(ChainSystem)?.toggle());
    bind('ask-cancel', () => showAsk(false));
    bind('btn-browse', () => {
      this.browsing = !this.browsing;
      this.setDisplay('browse-block', this.browsing);
      this.setText('btn-browse-label', this.browsing ? 'Hide ready-made walks' : 'Ready-made walks');
    });
    const type = (t: string) => {
      if (this.askBusy || this.askText.length >= 120) return;
      this.askText += t;
      this.paintAsk();
    };
    for (const c of 'qwertyuiopasdfghjklzxcvbnm') bind(`key-${c}`, () => type(this.askText && !this.askText.endsWith(' ') ? c : this.askText ? c : c.toUpperCase()));
    bind('key-q-mark', () => type('?'));
    bind('key-space', () => this.askText && !this.askText.endsWith(' ') && type(' '));
    bind('key-back', () => {
      this.askText = this.askText.slice(0, -1);
      this.paintAsk();
    });
    // The four chips start as openers ("How does") and turn into finished
    // questions as you type, so most questions take a handful of pinches.
    ['pre-how', 'pre-why', 'pre-what', 'pre-explain'].forEach((id, i) =>
      bind(id, () => {
        const pick = this.chips()[i];
        if (!pick) return;
        this.askText = pick.endsWith(' ') ? pick : pick;
        this.paintAsk();
      }),
    );
    bind('ask-go', () => void this.teach());
    for (let i = 0; i < 3; i++)
      bind(`recent-${i}`, () => {
        const deck = this.recent()[i];
        if (deck) bus.emit({ type: 'start-deck', deck });
      });
    bind('btn-refit', () => bus.emit({ type: 'refit' }));
    let accessOpen = false;
    bind('btn-access', () => {
      accessOpen = !accessOpen;
      this.setDisplay('section-access', accessOpen);
      this.setText('btn-access-label', accessOpen ? 'Hide comfort and access' : 'Comfort and access');
    });
    for (const a of ACCESS) {
      bind(a.id, () => {
        const on = toggleSetting(a.key);
        setStatus(a.say[on ? 0 : 1]);
      });
    }
    const paintAccess = () => {
      for (const a of ACCESS) this.setText(`${a.id}-label`, `${a.label}: ${settings[a.key] ? a.on : a.off}`);
    };
    paintAccess();
    this.cleanupFuncs.push(onSettings(paintAccess));
    bind('btn-new', () => bus.emit({ type: 'new-palace' }));
    bind('btn-switch', () => bus.emit({ type: 'switch-palace' }));
    bind('btn-open', () => bus.emit({ type: 'switch-palace' }));

    this.cleanupFuncs.push(
      bus.on((e) => {
        if (e.type === 'status') this.setText('hub-status', (this.lastStatus = e.text));
        if (e.type === 'palace-changed' || e.type === 'start-deck' || e.type === 'new-palace' || e.type === 'chain') this.refresh();
        if (e.type === 'palace-changed' && app.palace && !this.docked) this.dock(true);
        if (e.type === 'new-palace') this.dock(false);
        // Dock again once every stage stands where it will stay: restored
        // stages only attach to their anchors after the first dock was chosen.
        // Only move if that hides fewer stages: a panel that shifts as you reach for it is worse.
        if (e.type === 'palace-ready' && app.palace && this.docked) this.redockIfBetter();
        if (e.type === 'new-palace' || e.type === 'start-deck') {
          // A fresh start opens on asking, with the ready-made list folded away.
          this.browsing = false;
          this.asking = false;
          this.setText('btn-browse-label', 'Ready-made walks');
          this.refresh();
        }
        this.coach(e);
      }),
    );

    // window.requestAnimationFrame is paused during immersive sessions on
    // Quest, so placement is deferred through the ECS update loop instead.
    const onStart = () => (this.placeIn = 3);
    this.xrManager.addEventListener('sessionstart', onStart);
    this.cleanupFuncs.push(() => this.xrManager.removeEventListener('sessionstart', onStart));

    this.refresh();
    if (!app.storageOk) setStatus('Private browsing: progress will not be saved after you leave.');
  }

  update(delta: number): void {
    if (this.placeIn >= 0 && this.placeIn-- === 0) this.placeInFront();
    if (this.glideTarget && this.panel) {
      const hub = this.panel;
      const k = Math.min(1, delta * GLIDE_SPEED);
      hub.position.lerp(this.glideTarget, k);
      hub.lookAt(this.glideLook);
      if (hub.position.distanceToSquared(this.glideTarget) < 1e-6) this.glideTarget = null;
    }
    this.statsTimer += delta;
    if (this.statsTimer > 2) {
      this.statsTimer = 0;
      this.refresh();
    }
  }

  /**
   * First-run coaching: teaches the whole loop with one instruction at a time,
   * driven by what the learner actually does. No wall of text.
   */
  private coachStep = -1;
  private coach(e: { type: string; face?: number; rating?: string }): void {
    const firstTime = (app.palace?.history.length ?? 0) === 0;
    if (app.palace?.deck.kind === 'concept') {
      if (e.type === 'palace-changed' && firstTime && this.coachStep < 0 && app.palace.placements.length) {
        this.coachStep = 0;
        const first = app.palace.placements.find((p) => p.memoryId.endsWith(':0')) ?? app.palace.placements[0];
        setStatus(`Start at stage 1${first?.label ? ` on your ${first.label}` : ''} and follow the light.`);
        this.setText('palace-howto', 'Read each stage where it sits. When you are ready, pinch one to test yourself.');
      } else if (e.type === 'flipped' && e.face === 4 && this.coachStep >= 0 && this.coachStep < 2) {
        this.coachStep = 2;
        this.setText('palace-howto', 'One of these is a common myth. Pinch the true one.');
      } else if (e.type === 'rated' && this.coachStep >= 0 && this.coachStep < 4) {
        this.coachStep = 4;
        this.setText('palace-howto', 'That is the loop. Stages glow when they are due, and the ones you miss come back sooner.');
      }
      return;
    }
    if (e.type === 'palace-changed' && firstTime && this.coachStep < 0 && app.palace?.placements.length) {
      this.coachStep = 0;
      const first = app.palace.placements.find((p) => p.memoryId.endsWith(':0')) ?? app.palace.placements[0];
      const where = first?.label ? ` on your ${first.label}` : '';
      setStatus(`Start with memory 1${where}. Read it and picture the scene happening right there.`);
      this.setText('palace-howto', 'Step 1 of 4: study each new memory where it sits. Pinch one to hide it and test yourself.');
    } else if (e.type === 'flipped' && this.coachStep === 0 && e.face === 0) {
      this.coachStep = 1;
      this.setText('palace-howto', 'Step 2 of 4: what was it? Say it in your head, then pinch to peek at the picture.');
    } else if (e.type === 'flipped' && this.coachStep === 1 && e.face === 1) {
      this.coachStep = 2;
      this.setText('palace-howto', 'Step 3 of 4: that picture is your hook. Pinch again to check the answer.');
    } else if (e.type === 'flipped' && this.coachStep === 2 && e.face === 2) {
      this.coachStep = 3;
      this.setText('palace-howto', settings.dwell
        ? 'Step 4 of 4: look at "Knew it" or "Again" under the card.'
        : 'Step 4 of 4: grab it and raise it if you knew it, lower it if not.');
    } else if (e.type === 'rated' && this.coachStep >= 0 && this.coachStep < 4) {
      this.coachStep = 4;
      this.setText('palace-howto', 'That is the whole loop. Memories glow when they are due. Come back tomorrow to keep them.');
    }
  }

  private chips(): string[] {
    const t = this.askText.trim().toLowerCase();
    if (t.length < 2) return ['How does ', 'Why do ', 'What is ', 'Explain '];
    const hits = SUGGEST.filter((q) => q.toLowerCase().startsWith(t) || q.toLowerCase().split(' ').some((w) => w.startsWith(t.split(' ').pop() ?? '') && t.split(' ').length === 1 && t.length >= 3));
    return hits.slice(0, 4);
  }

  private paintAsk(): void {
    const chips = this.chips();
    ['pre-how', 'pre-why', 'pre-what', 'pre-explain'].forEach((id, i) => {
      this.setDisplay(id, Boolean(chips[i]));
      if (chips[i]) this.setText(`${id}-label`, chips[i].trim());
    });
    this.setText('ask-text', this.askText ? `${this.askText}|` : 'Type with a pinch on each key');
    this.setText('ask-go-label', this.askBusy ? 'Thinking' : 'Teach me');
  }

  /** Concepts asked for before, on any screen (the website keeps the same list). */
  private recent(): Deck[] {
    try {
      const raw = JSON.parse(localStorage.getItem('loci.asked.v1') ?? '[]') as unknown[];
      return raw.map((d) => DeckSchema.safeParse(d)).filter((r) => r.success).map((r) => r.data as Deck).slice(0, 3);
    } catch {
      return [];
    }
  }

  private async teach(): Promise<void> {
    const topic = this.askText.trim();
    if (this.askBusy) return;
    if (topic.length < 3) return setStatus('Type a few words first, like "how do tides work".');
    this.askBusy = true;
    this.paintAsk();
    setStatus('The Palace Architect is finding the stages, the reasons and the myths.');
    const res = await teachConcept(topic, 'adult');
    this.askBusy = false;
    this.paintAsk();
    if (!res.ok) return setStatus(res.error);
    try {
      const mine = [res.deck, ...this.recent().filter((d) => d.title !== res.deck.title)].slice(0, 4);
      localStorage.setItem('loci.asked.v1', JSON.stringify(mine));
    } catch {
      /* private browsing */
    }
    this.askText = '';
    this.asking = false;
    this.setDisplay('section-ask', false);
    bus.emit({ type: 'start-deck', deck: res.deck });
    // Then a second pass looks for mistakes; any stage it doubts says what to check.
    if (res.offline) return;
    const v = await verifyConcept(res.deck);
    const palace = app.palace;
    if (!v || !palace || palace.deck.id !== res.deck.id) return;
    const doubted = v.items.filter((it) => it.doubt);
    let next = palace;
    for (const it of v.items) {
      const cur = next.deck.items.find((x) => x.id === it.id);
      if (cur) next = replaceItem(next, { ...cur, doubt: it.doubt, checked: it.checked });
    }
    app.palace = next;
    const store = getStorage();
    if (store) savePalace(store, next);
    const sys = this.world.getSystem(PalaceSystem);
    for (const it of v.items) {
      const rec = sys?.records.get(it.id);
      const item = next.deck.items.find((x) => x.id === it.id);
      if (!rec || !item) continue;
      rec.item = item;
      rec.tile.setItem(item);
      sys!.renderTile(rec);
    }
    bus.emit({ type: 'palace-changed' });
    if (!doubted.length) return setStatus('Double-checked: no mistakes found in any stage. Each card now says so.');
    setStatus(`Double-checked: ${doubted.length} ${doubted.length === 1 ? 'stage says' : 'stages say'} what to verify when you open ${doubted.length === 1 ? 'it' : 'them'}.`);
  }

  /** Glide the hub between centre (choosing) and docked (reviewing). */
  private dock(docked: boolean): void {
    this.docked = docked;
    const hub = this.panel;
    if (!hub || !hub.parent) return;
    const cam = this.world.camera;
    cam.getWorldPosition(this.tmp);
    cam.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    const spot = docked ? this.clearSpot() : { yaw: 0, drop: HUB_DROP };
    if (docked) this.spot = spot;
    const yaw = spot.yaw;
    const dist = docked ? DOCK_DISTANCE : HUB_DISTANCE;
    const drop = spot.drop;
    // Rotate forward on the floor plane; negative yaw swings it to the left.
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const dx = this.fwd.x * c - this.fwd.z * s;
    const dz = this.fwd.x * s + this.fwd.z * c;
    const target = new Vector3(this.tmp.x + dx * dist, Math.max(0.55, this.tmp.y - drop), this.tmp.z + dz * dist);
    hub.parent.worldToLocal(target);
    this.glideTarget = target;
    this.glideLook.copy(this.tmp);
    this.headAtPlace.copy(this.tmp);
  }

  /**
   * Where to dock so the panel never hides a stage from your seat: try both
   * sides at three angles and two heights, and take the spot whose angular
   * rectangle (as seen from your eyes) covers the fewest stages. A stage only
   * counts as hidden when it falls inside the panel both across and up-down,
   * so a stage high on a wall above a low panel is not held against it.
   */
  /** The spot the panel was last docked at, and how many stages it hid then. */
  private spot: { yaw: number; drop: number } = { yaw: DOCK_YAW, drop: DOCK_DROP };

  private redockIfBetter(): void {
    const cam = this.world.camera;
    cam.getWorldPosition(this.tmp);
    cam.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    const now = this.hiddenAt(this.spot);
    const best = this.clearSpot();
    if (this.hiddenAt(best) < now) this.dock(true);
  }

  private hiddenAt(spot: { yaw: number; drop: number }): number {
    const half = Math.atan2(0.27, DOCK_DISTANCE);
    const pitch = Math.atan2(-spot.drop, DOCK_DISTANCE);
    return this.stageDirs().filter((d) => Math.abs(d.yaw - spot.yaw) < half && Math.abs(d.pitch - pitch) < half).length;
  }

  private stageDirs(): { yaw: number; pitch: number }[] {
    const recs = [...(this.world.getSystem(PalaceSystem)?.records.values() ?? [])];
    const fwdYaw = Math.atan2(this.fwd.x, -this.fwd.z);
    const p = new Vector3();
    return recs.map((r) => {
      r.tile.root.getWorldPosition(p);
      let d = Math.atan2(p.x - this.tmp.x, -(p.z - this.tmp.z)) - fwdYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      // Negative yaw is to the left, matching the dock rotation below.
      return { yaw: d, pitch: Math.atan2(p.y - this.tmp.y, Math.hypot(p.x - this.tmp.x, p.z - this.tmp.z)) };
    });
  }

  private clearSpot(): { yaw: number; drop: number } {
    const dirs = this.stageDirs();
    if (!dirs.length) return { yaw: DOCK_YAW, drop: DOCK_DROP };
    const yaws = [DOCK_YAW, -DOCK_YAW, (-60 * Math.PI) / 180, (60 * Math.PI) / 180, (-78 * Math.PI) / 180, (78 * Math.PI) / 180];
    const drops = [DOCK_DROP, DOCK_DROP + 0.14];
    let best = { yaw: DOCK_YAW, drop: DOCK_DROP };
    let bestHidden = Infinity;
    for (const drop of drops) {
      for (const yaw of yaws) {
        const hidden = this.hiddenAt({ yaw, drop });
        if (hidden < bestHidden) {
          bestHidden = hidden;
          best = { yaw, drop };
        }
      }
    }
    return best;
  }

  /** On session start: centred to choose a deck, docked if a palace exists. */
  private placeInFront(): void {
    this.dock(Boolean(app.palace));
    // Snap instead of gliding from wherever the scene authored it.
    if (this.glideTarget && this.panel) {
      this.panel.position.copy(this.glideTarget);
      this.panel.lookAt(this.glideLook);
      this.glideTarget = null;
    }
  }

  private refresh(): void {
    const palace = app.palace;
    this.setDisplay('section-decks', !palace && !this.asking);
    this.setDisplay('row-chain', palace?.deck.kind === 'concept');
    this.setText('btn-chain-label', app.chainMode ? 'Stop chain practice' : 'Rebuild the chain');
    this.setDisplay('section-ask', !palace && this.asking);
    this.setDisplay('browse-block', this.browsing);
    const recent = this.recent();
    this.setDisplay('recent-block', !palace && recent.length > 0);
    recent.forEach((d, i) => this.setText(`recent-${i}-label`, d.title));
    for (let i = 0; i < 3; i++) this.setDisplay(`recent-${i}`, i < recent.length);
    this.setDisplay('section-palace', Boolean(palace));
    if (!palace) {
      const store = getStorage();
      const saved = store ? listPalaces(store).length : 0;
      this.setDisplay('btn-open', saved > 0);
      this.setText('btn-open-label', saved === 1 ? 'Open my saved palace' : `Open a saved palace (${saved})`);
      this.setText('hub-heading', 'What do you want to understand?');
      this.setText('hub-tagline', 'Ask, and its stages will land on the furniture around you.');
      return;
    }
    const now = new Date();
    this.setText('hub-heading', palace.deck.title);
    this.setText('hub-tagline', palace.deck.kind === 'concept' ? 'Follow the light from stage to stage.' : `${palace.deck.subtitle}.`);
    this.setText('palace-title', `YOUR PALACE: ${palace.deck.items.length} ${palace.deck.kind === 'concept' ? 'STAGES' : 'MEMORIES'}`);
    this.setDisplay('stats-row', palace.history.length > 0);
    this.setText('stat-due', String(dueIds(palace, now).length));
    // Early on, mastery and a streak are both zero, which reads as failure on a
    // welcome-back screen. Show what is true and encouraging instead: how much
    // has been studied, and how long you have been away.
    const m = mastery(palace);
    const total = palace.deck.items.length;
    const studied = new Set(palace.history.map((h) => h.memoryId)).size;
    this.setText('stat-mastery', m > 0 ? `${Math.round(m * 100)}%` : `${studied}/${total}`);
    this.setText('stat-mastery-cap', m > 0 ? 'mastered' : 'studied');
    const run = streak(palace.history, now);
    const last = palace.history.length ? new Date(palace.history[palace.history.length - 1].at) : now;
    const away = Math.floor((now.getTime() - last.getTime()) / 86_400_000);
    this.setText('stat-streak', String(run > 0 ? run : away));
    this.setText('stat-streak-cap', run > 0 ? 'day streak' : away === 1 ? 'day away' : 'days away');
    const store = getStorage();
    const count = store ? listPalaces(store).length : 1;
    this.setDisplay('btn-switch', count > 1);
    this.setText('btn-switch-label', `Switch palace (${count} saved)`);
  }

  /** Buttons that look-to-select can press (filled by bind). */
  private lookables: Lookable[] = [];
  private lookHits: Intersection[] = [];

  /**
   * The visible hub button nearest along a ray, for look-to-select. Each
   * button is raycast on its own (UIKit's panel-level raycast reports the
   * shared panel mesh, not the button).
   */
  lookPick(raycaster: Raycaster): { target: Lookable; distance: number; point: Vector3 } | null {
    if (!this.panel?.visible) return null;
    let best: { target: Lookable; distance: number; point: Vector3 } | null = null;
    for (const t of this.lookables) {
      if (!t.el.isVisible?.value) continue;
      this.lookHits.length = 0;
      t.el.raycast(raycaster, this.lookHits);
      const hit = this.lookHits[0];
      if (hit && (!best || hit.distance < best.distance)) best = { target: t, distance: hit.distance, point: hit.point };
    }
    return best;
  }

  /** Press a hub button by looking at it: the same action a pinch would take. */
  lookPress(t: Lookable): void {
    playClick();
    app.lastLookPress = t.id;
    app.lookPresses.push(t.id);
    if (app.lookPresses.length > 32) app.lookPresses.shift();
    t.press();
  }

  private el(id: string): El | null {
    try {
      return (this.panel?.getElementById(id) as unknown as El) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Last value written to each element. UIKit re-lays out on every
   * setProperties call, even an identical one, and refresh() runs every two
   * seconds; skipping unchanged writes keeps that refresh nearly free.
   */
  private shown = new Map<string, string>();

  private setText(id: string, text: string): void {
    const key = `t:${id}`;
    if (this.shown.get(key) === text) return;
    const el = this.el(id);
    if (!el) return;
    el.setProperties({ text });
    this.shown.set(key, text);
  }

  private setDisplay(id: string, show: boolean): void {
    const key = `d:${id}`;
    const display = show ? 'flex' : 'none';
    if (this.shown.get(key) === display) return;
    const el = this.el(id);
    if (!el) return;
    el.setProperties({ display });
    this.shown.set(key, display);
  }
}
