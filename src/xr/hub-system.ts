/**
 * Binds the hub panel: deck buttons, palace stats, status line, and places the
 * hub comfortably in front of a seated user when mixed reality starts.
 */
import { createSystem, Vector3, type UIKitMLAsset } from '@iwsdk/core';
import { findStarterDeck } from '../core/decks.js';
import { dueIds, mastery, streak } from '../core/scheduler.js';
import { app, bus, setStatus } from './app-state.js';
import { onSettings, settings, toggleSetting, type Settings } from './settings.js';
import { playClick } from './sound.js';

const ACCESS: { key: keyof Settings; id: string; label: string; on: string; off: string; say: [string, string] }[] = [
  { key: 'dwell', id: 'acc-dwell', label: 'Look to select', on: 'on', off: 'off', say: ['Look at a memory for a moment to flip it; look at a button to rate it.', 'Look to select is off. Pinch and grab as usual.'] },
  { key: 'contrast', id: 'acc-contrast', label: 'High contrast', on: 'on', off: 'off', say: ['High contrast on: black cards, white text, yellow edges.', 'High contrast off.'] },
  { key: 'large', id: 'acc-large', label: 'Larger tiles', on: 'on', off: 'off', say: ['Memories are 35% larger.', 'Memories back to normal size.'] },
  { key: 'calm', id: 'acc-calm', label: 'Calm motion', on: 'on', off: 'off', say: ['Calm motion: no flights, hops or shakes.', 'Motion effects back on.'] },
  { key: 'sound', id: 'acc-sound', label: 'Sound', on: 'on', off: 'off', say: ['Sound cues on.', 'Sound cues off. Every cue also shows as colour and text.'] },
];

type El = {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  setProperties(p: Record<string, unknown>): void;
};

/** Press-and-release on the same button, independent of timing. */
const PRESS_WINDOW_MS = 2500;

const HUB_DISTANCE = 0.55;
const HUB_DROP = 0.22;
/** Docked: out of the line of sight, like a tray by your left hand. */
const DOCK_YAW = (-38 * Math.PI) / 180;
const DOCK_DISTANCE = 0.5;
const DOCK_DROP = 0.38;
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
      // down + up on the same button as activation instead.
      let downAt = 0;
      const onDown = () => (downAt = performance.now());
      const onLeave = () => (downAt = 0);
      const onUp = () => {
        if (!downAt || performance.now() - downAt > PRESS_WINDOW_MS) return;
        downAt = 0;
        playClick();
        fn();
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointerleave', onLeave);
      this.cleanupFuncs.push(
        () => el.removeEventListener('pointerdown', onDown),
        () => el.removeEventListener('pointerup', onUp),
        () => el.removeEventListener('pointerleave', onLeave),
      );
    };

    for (const id of ['planets', 'elements', 'spanish']) {
      bind(`deck-${id}`, () => {
        const deck = findStarterDeck(id);
        if (deck) bus.emit({ type: 'start-deck', deck });
      });
    }
    bind('deck-phone', () => bus.emit({ type: 'own-notes' }));
    bind('btn-refit', () => bus.emit({ type: 'refit' }));
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

    this.cleanupFuncs.push(
      bus.on((e) => {
        if (e.type === 'status') this.setText('hub-status', (this.lastStatus = e.text));
        if (e.type === 'palace-changed' || e.type === 'start-deck' || e.type === 'new-palace') this.refresh();
        if (e.type === 'palace-changed' && app.palace && !this.docked) this.dock(true);
        if (e.type === 'new-palace') this.dock(false);
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
    const yaw = docked ? DOCK_YAW : 0;
    const dist = docked ? DOCK_DISTANCE : HUB_DISTANCE;
    const drop = docked ? DOCK_DROP : HUB_DROP;
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
    this.setDisplay('section-decks', !palace);
    this.setDisplay('section-palace', Boolean(palace));
    if (!palace) {
      this.setText('hub-tagline', 'Pick something to learn. I will place it on the furniture around you.');
      return;
    }
    const now = new Date();
    this.setText('hub-tagline', `${palace.deck.title}: ${palace.deck.subtitle}.`);
    this.setText('palace-title', palace.deck.title.toUpperCase());
    this.setText('stat-due', String(dueIds(palace, now).length));
    this.setText('stat-mastery', `${Math.round(mastery(palace) * 100)}%`);
    this.setText('stat-streak', String(streak(palace.history, now)));
  }

  private el(id: string): El | null {
    try {
      return (this.panel?.getElementById(id) as unknown as El) ?? null;
    } catch {
      return null;
    }
  }

  private setText(id: string, text: string): void {
    this.el(id)?.setProperties({ text });
  }

  private setDisplay(id: string, show: boolean): void {
    this.el(id)?.setProperties({ display: show ? 'flex' : 'none' });
  }
}
