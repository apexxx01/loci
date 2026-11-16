/**
 * Owns the palace in the room: builds it from a deck and the scanned surfaces,
 * restores it on the next visit from the persistent anchor, re-fits it when the
 * room has changed, and keeps tiles in sync with the schedule.
 */
import {
  DepthOccludable,
  OcclusionShadersMode,
  createSystem,
  DistanceGrabbable,
  MovementMode,
  Quaternion,
  RayInteractable,
  Vector3,
  XRAnchor,
  type Entity,
} from '@iwsdk/core';
import { PLACEMENT, planPlacement, semanticAgreement, tileScale } from '../core/placement.js';
import { createPalace, listPalaces, loadPalace, savePalace, setActivePalace, withPlacements } from '../core/palace.js';
import { dueIds, nextDue } from '../core/scheduler.js';
import type { Deck, MemoryItem, Palace, Placement, Slot } from '../core/types.js';
import { app, bus, getStorage, setStatus } from './app-state.js';
import { MemoryTile, TileFace } from './components.js';
import { viewerPose } from './room-system.js';
import { playBuild, playLand } from './sound.js';
import { createTile, type TileHandle } from './tile.js';
import { bindScenes } from '../net/architect-client.js';
import { settings } from './settings.js';
import type { FaceKind } from './tile-art.js';

const ANCHOR_KEY = 'iwsdk_scene_anchor_uuid';
const SCAN_SETTLE_SECONDS = 1.2;
const SCAN_TIMEOUT_SECONDS = 4;
const ARRIVE_SECONDS = 0.9;
const ARRIVE_STAGGER = 0.12;
const ATTACH_TIMEOUT_SECONDS = 3;

export interface TileRecord {
  entity: Entity;
  tile: TileHandle;
  item: MemoryItem;
  label: string;
  onTop: boolean;
  /** Local pose waiting for the anchor group to attach (restore path). */
  pendingLocal?: Placement['pose'];
  /** Arrival flight: start offset in root-local space. */
  from?: Vector3;
  delay: number;
  /** Concept stages: the last myth-check result, shown on the answer face. */
  lastCheck?: 'right' | 'wrong';
  /** Concept stages: true when the wrong statement is drawn on the left (A). */
  wrongFirst?: boolean;
}

type Phase = 'idle' | 'scanning' | 'building' | 'restoring' | 'ready';

const FACE_NAMES: FaceKind[] = ['cue', 'hint', 'answer', 'learn', 'check'];

export class PalaceSystem extends createSystem({
  tiles: { required: [MemoryTile] },
}) {
  readonly records = new Map<string, TileRecord>();
  private phase: Phase = 'idle';
  private phaseTime = 0;
  private pendingDeck: Deck | null = null;
  /** Bind generation guards against stale responses after a re-fit. */
  private bindGen = 0;
  private needsBind = false;
  /** Seconds left to verify a restored palace against the scanned room. */
  private verifyFor = 0;
  private lastSurfaceVersion = -1;
  private stableFor = 0;
  private dueTimer = 0;
  private anchorUuidAtStart: string | null = null;
  private anchorsEnabled = false;
  private sessionActive = false;
  private tmpV = new Vector3();
  private tmpQ = new Quaternion();
  private up = new Vector3(0, 1, 0);

  init(): void {
    const store = getStorage();
    app.storageOk = store !== null;
    if (store) {
      const res = loadPalace(store);
      if (res.status === 'ok') {
        app.palace = res.palace;
        app.frame = res.palace.placements.length && store.getItem('loci.frame') === 'anchor' ? 'anchor' : 'reference';
      } else if (res.status === 'corrupt') {
        setStatus('Saved palace could not be read, so you are starting fresh.');
      }
    }

    this.cleanupFuncs.push(
      bus.on((e) => {
        if (e.type === 'start-deck') this.beginBuild(e.deck);
        else if (e.type === 'refit') this.refit('Re-fitting your palace to this room...');
        else if (e.type === 'new-palace') this.clearPalace();
        else if (e.type === 'switch-palace') this.switchPalace();
      }),
    );

    const onStart = () => {
      this.sessionActive = true;
      const session = this.xrManager.getSession();
      const features = (session as unknown as { enabledFeatures?: string[] })?.enabledFeatures ?? [];
      this.anchorsEnabled = features.includes('anchors');
      this.anchorUuidAtStart = getStorage()?.getItem(ANCHOR_KEY) ?? null;
      this.disposeTiles();
      if (app.pendingDeck) {
        // The learner built and approved a deck on the 2D page: build it now.
        const deck = app.pendingDeck;
        app.pendingDeck = null;
        this.beginBuild(deck);
      } else if (app.palace) this.beginRestore();
    };
    const onEnd = () => {
      this.persist();
      this.sessionActive = false;
      this.disposeTiles();
      this.phase = 'idle';
    };
    this.xrManager.addEventListener('sessionstart', onStart);
    this.xrManager.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(
      () => this.xrManager.removeEventListener('sessionstart', onStart),
      () => this.xrManager.removeEventListener('sessionend', onEnd),
    );

    // Outside XR (plain browser) show the palace on the virtual arc so the
    // page is never empty.
    queueMicrotask(() => {
      if (!this.sessionActive && app.palace) this.spawnFromPlan(app.palace, false);
    });
  }

  /* ------------------------------------------------------------------ build */

  private beginBuild(deck: Deck): void {
    // Picking something you already keep resumes it with its progress intact,
    // rather than stacking a second copy in the library.
    const store = getStorage();
    const kept = store ? listPalaces(store).find((p) => p.deck.id === deck.id && p.deck.items.length === deck.items.length) : undefined;
    if (kept) {
      this.activate(kept.id);
      setStatus(`Picked up "${kept.deck.title}" where you left it.`);
      return;
    }
    this.disposeTiles();
    this.pendingDeck = deck;
    this.phase = 'scanning';
    this.phaseTime = 0;
    this.stableFor = 0;
    this.lastSurfaceVersion = app.surfacesVersion;
    setStatus(`Reading your room for "${deck.title}"...`);
  }

  private finishBuild(): void {
    const deck = this.pendingDeck;
    if (!deck) return;
    this.pendingDeck = null;
    const now = new Date();
    const palace = createPalace(deck, [], now);
    app.palace = palace;
    this.spawnFromPlan(palace, true);
  }

  /** Plan against the current room and spawn every tile, animated or not. */
  private spawnFromPlan(palace: Palace, animate: boolean): void {
    this.disposeTiles();
    const viewer = viewerPose(this.world.camera);
    const plan = planPlacement(palace.deck.items, app.surfaces, viewer);
    const items = new Map(palace.deck.items.map((it) => [it.id, it]));
    const start = this.hubWorldPosition();

    plan.assignments.forEach(({ memoryId, slot }, i) => {
      const item = items.get(memoryId);
      if (!item) return;
      this.spawnTile(item, slot, animate ? start : null, i * ARRIVE_STAGGER);
    });

    this.phase = 'building';
    this.phaseTime = 0;
    this.needsBind = this.sessionActive;
    if (animate) playBuild();

    const realCount = plan.assignments.filter((a) => a.slot.surfaceId !== 'arc').length;
    const labels = [...new Set(plan.assignments.map((a) => a.slot.label).filter(Boolean))];
    if (plan.surfacesUsed === 0) {
      setStatus(
        this.sessionActive
          ? 'No furniture found yet, so memories are floating around you. Run Space Setup for a room-anchored palace.'
          : 'Preview mode: enter mixed reality to pin these to your real room.',
      );
    } else {
      setStatus(
        `Placed ${plan.assignments.length} memories: ${realCount} on ${labels.slice(0, 4).join(', ')}${labels.length > 4 ? '...' : ''}.`,
      );
    }
  }

  private spawnTile(item: MemoryItem, slot: Slot, flyFrom: Vector3 | null, delay: number): TileRecord {
    const tile = createTile(item);
    const root = tile.root;
    root.position.set(slot.position[0], slot.position[1], slot.position[2]);
    root.lookAt(
      slot.position[0] + slot.facing[0],
      slot.position[1],
      slot.position[2] + slot.facing[2],
    );
    const scale = tileScale(slot.distance);
    root.scale.setScalar(scale);
    // Horizontal loci get a tether down to the surface they sit on. The card
    // grows with distance, so lift it to keep its bottom edge above the surface.
    if (slot.onTop) root.position.y += (scale - 1) * 0.125;
    tile.setDrop(slot.onTop ? (PLACEMENT.hoverHeight + (scale - 1) * 0.125) / scale : 0);

    const entity = this.world.createTransformEntity(root);
    entity.addComponent(MemoryTile, { memoryId: item.id, face: this.firstFace(item.id), due: true, arrive: flyFrom ? ARRIVE_SECONDS + delay : 0 });
    entity.addComponent(RayInteractable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
      returnToOrigin: true,
      rotate: false,
      scale: false,
    });
    if (this.anchorsEnabled) entity.addComponent(XRAnchor);

    const record: TileRecord = { entity, tile, item, label: slot.label, onTop: slot.onTop, delay };
    if (flyFrom) {
      root.updateWorldMatrix(true, false);
      record.from = root.worldToLocal(flyFrom.clone());
      tile.pivot.position.copy(record.from);
      tile.pivot.scale.setScalar(0.2);
    }
    this.records.set(item.id, record);
    this.renderTile(record);
    return record;
  }

  /* ---------------------------------------------------------------- restore */

  private beginRestore(): void {
    const palace = app.palace;
    if (!palace) return;
    if (!palace.placements.length) {
      this.spawnFromPlan(palace, true);
      return;
    }
    const items = new Map(palace.deck.items.map((it) => [it.id, it]));
    const useAnchor = app.frame === 'anchor' && this.anchorsEnabled;
    for (const pl of palace.placements) {
      const item = items.get(pl.memoryId);
      if (!item) continue;
      const tile = createTile(item);
      const entity = this.world.createTransformEntity(tile.root);
      entity.addComponent(MemoryTile, { memoryId: item.id, face: this.firstFace(item.id), due: true, arrive: 0.6 });
      // A stage behind your real armchair is hidden by it, where the headset can sense depth.
      entity.addComponent(DepthOccludable, { mode: OcclusionShadersMode.HardOcclusion });
      entity.addComponent(RayInteractable);
      entity.addComponent(DistanceGrabbable, {
        movementMode: MovementMode.MoveFromTarget,
        returnToOrigin: true,
        rotate: false,
        scale: false,
      });
      const onTop = pl.onTop ?? (Boolean(pl.label) && !isWallish(pl.label));
      const record: TileRecord = { entity, tile, item, label: pl.label, onTop, delay: 0 };
      const sc = pl.pose.s ?? 1;
      tile.root.scale.setScalar(sc);
      tile.setDrop(onTop ? (PLACEMENT.hoverHeight + (sc - 1) * 0.125) / sc : 0);
      tile.pivot.scale.setScalar(0.2);
      if (useAnchor) {
        record.pendingLocal = pl.pose;
        tile.root.visible = false;
        entity.addComponent(XRAnchor);
      } else {
        tile.root.position.fromArray(pl.pose.p);
        tile.root.quaternion.fromArray(pl.pose.q);
        if (this.anchorsEnabled) entity.addComponent(XRAnchor);
      }
      this.records.set(item.id, record);
      this.renderTile(record);
    }
    this.phase = useAnchor ? 'restoring' : 'ready';
    this.phaseTime = 0;
    setStatus(useAnchor ? 'Finding your palace in this room...' : 'Welcome back. Your palace is where you left it.');
    this.refreshDue();
  }

  private refit(message: string): void {
    const palace = app.palace;
    if (!palace) return;
    setStatus(message);
    this.spawnFromPlan(palace, true);
  }

  /** A memory you have never recalled starts on its study face. */
  private firstFace(memoryId: string): number {
    return (app.palace?.cards[memoryId]?.reps ?? 0) === 0 ? TileFace.Learn : TileFace.Cue;
  }

  /** Put the current palace away (it stays in the library) and show the picker. */
  private clearPalace(): void {
    this.persist();
    this.disposeTiles();
    app.palace = null;
    const store = getStorage();
    if (store) setActivePalace(store, null);
    bus.emit({ type: 'palace-changed' });
    setStatus('Your palace is saved. Pick something new to learn.');
    this.phase = 'idle';
  }

  /** Cycle to the next saved palace in the library. */
  private switchPalace(): void {
    const store = getStorage();
    if (!store) return;
    this.persist();
    const all = listPalaces(store);
    if (all.length < 2 && app.palace) {
      setStatus('This is your only palace. Start another from the picker.');
      return;
    }
    if (!all.length) return;
    const i = all.findIndex((p) => p.id === app.palace?.id);
    const next = all[(i + 1) % all.length];
    this.activate(next.id);
  }

  /** Make a saved palace the one in the room. */
  activate(id: string): void {
    const store = getStorage();
    if (!store) return;
    const palace = setActivePalace(store, id);
    if (!palace) return;
    this.disposeTiles();
    app.palace = palace;
    if (this.sessionActive) this.beginRestore();
    else this.spawnFromPlan(palace, false);
    bus.emit({ type: 'palace-changed' });
    setStatus(`Now in the room: ${palace.deck.title}.`);
  }

  /* ----------------------------------------------------------------- update */

  update(delta: number): void {
    this.phaseTime += delta;

    if (this.phase === 'scanning') {
      if (app.surfacesVersion !== this.lastSurfaceVersion) {
        this.lastSurfaceVersion = app.surfacesVersion;
        this.stableFor = 0;
      } else this.stableFor += delta;
      const settled = app.surfaces.length > 0 && this.stableFor >= SCAN_SETTLE_SECONDS;
      if (settled || this.phaseTime >= SCAN_TIMEOUT_SECONDS || !this.sessionActive) this.finishBuild();
    }

    if (this.phase === 'restoring') this.updateRestore();

    // Arrival flights.
    for (const rec of this.records.values()) {
      const remaining = rec.entity.getValue(MemoryTile, 'arrive') ?? 0;
      if (remaining <= 0) continue;
      const next = settings.calm ? 0 : Math.max(0, remaining - delta);
      rec.entity.setValue(MemoryTile, 'arrive', next);
      const t = 1 - Math.min(1, next / ARRIVE_SECONDS);
      const e = easeOutBack(t);
      if (rec.from) {
        rec.tile.pivot.position.copy(rec.from).multiplyScalar(1 - easeOutCubic(t));
        rec.tile.pivot.position.y += Math.sin(Math.PI * t) * 0.18 * (1 - t);
      }
      rec.tile.pivot.scale.setScalar(0.2 + 0.8 * e);
      if (remaining > 0 && next === 0) {
        rec.tile.pivot.position.set(0, 0, 0);
        rec.tile.pivot.scale.setScalar(settings.large ? 1.35 : 1);
        rec.tile.root.getWorldPosition(this.tmpV);
        playLand(this.tmpV, rec.item.order);
      }
    }

    if (this.phase === 'building') {
      const allLanded = [...this.records.values()].every((r) => (r.entity.getValue(MemoryTile, 'arrive') ?? 0) <= 0);
      const attached = !this.anchorsEnabled || [...this.records.values()].every((r) => r.entity.getValue(XRAnchor, 'attached'));
      if (allLanded && (attached || this.phaseTime > ATTACH_TIMEOUT_SECONDS + 2)) {
        this.phase = 'ready';
        // Only poses measured in a real (or emulated) XR session describe the room.
        if (this.sessionActive) this.persist();
        this.refreshDue();
        bus.emit({ type: 'palace-changed' });
        bus.emit({ type: 'palace-ready', restored: false });
        if (this.needsBind) {
          this.needsBind = false;
          void this.weaveRoom();
        }
      }
    }

    if (this.verifyFor > 0) this.verifyRestore(delta);

    this.dueTimer += delta;
    if (this.dueTimer > 15) {
      this.dueTimer = 0;
      this.refreshDue();
    }
  }

  private updateRestore(): void {
    const recs = [...this.records.values()];
    const attachedAll = recs.every((r) => !r.pendingLocal || r.entity.getValue(XRAnchor, 'attached'));
    if (attachedAll) {
      const uuidNow = getStorage()?.getItem(ANCHOR_KEY) ?? null;
      const anchorRecreated = this.anchorUuidAtStart !== null && uuidNow !== this.anchorUuidAtStart;
      if (anchorRecreated) {
        // The runtime could not find last session's anchor (different room,
        // cleared space, new boundary). Old poses are meaningless here.
        this.refit('This room looks different, so I re-fit your palace to it.');
        return;
      }
      for (const r of recs) {
        if (!r.pendingLocal) continue;
        r.tile.root.position.fromArray(r.pendingLocal.p);
        r.tile.root.quaternion.fromArray(r.pendingLocal.q);
        r.tile.root.visible = true;
        r.pendingLocal = undefined;
      }
      this.phase = 'ready';
      this.verifyFor = 5;
      setStatus(this.welcomeBackText());
      bus.emit({ type: 'palace-changed' });
      bus.emit({ type: 'palace-ready', restored: true });
      return;
    }
    if (this.phaseTime > ATTACH_TIMEOUT_SECONDS) {
      this.refit('Could not lock onto last session\'s anchor, so I re-fit your palace to this room.');
    }
  }

  /**
   * Ask the Palace Architect to rewrite each picture so it interacts with the
   * object it landed on ("...bursts out of your lamp shade"). The locus and
   * the image become one memory, which is the heart of the technique.
   */
  private async weaveRoom(): Promise<void> {
    const palace = app.palace;
    if (!palace) return;
    const gen = ++this.bindGen;
    const byId = new Map(palace.deck.items.map((it) => [it.id, it]));
    const inputs = [...this.records.values()]
      .filter((r) => r.label)
      .map((r) => {
        const it = byId.get(r.item.id)!;
        return { id: it.id, cue: it.cue, scene: it.baseScene ?? it.scene, label: r.label };
      });
    if (!inputs.length) return;
    setStatus('The Palace Architect is weaving your room into each picture...');
    const t0 = performance.now();
    const res = await bindScenes(inputs.map(({ cue, scene, label }) => ({ cue, scene, label })));
    if (gen !== this.bindGen || app.palace?.id !== palace.id) return; // superseded
    const scenes = new Map(inputs.map((inp, i) => [inp.id, res.scenes[i]]));
    const items = app.palace.deck.items.map((it) =>
      scenes.has(it.id) ? { ...it, baseScene: it.baseScene ?? it.scene, scene: scenes.get(it.id)! } : it,
    );
    app.palace = { ...app.palace, deck: { ...app.palace.deck, items } };
    for (const rec of this.records.values()) {
      const updated = items.find((it) => it.id === rec.item.id);
      if (updated) {
        rec.item = updated;
        rec.tile.setItem(updated);
      }
      this.renderTile(rec);
    }
    this.persist();
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setStatus(
      res.via === 'architect'
        ? `Every picture now lives on its object (${secs} s). Pinch a memory to see it.`
        : 'Every memory is on its object. Pinch one to see it.',
    );
  }

  /**
   * Anchors can come back in the wrong place (a different room, furniture
   * moved). Once scene data is in, check that memories still sit near objects
   * with their labels; if most don't, re-fit instead of floating in mid-air.
   */
  private verifyRestore(delta: number): void {
    this.verifyFor -= delta;
    if (!app.surfaces.length && this.verifyFor > 0) return; // wait for scene data
    const settled = this.verifyFor <= 3.5 || this.verifyFor <= 0;
    if (!settled) return;
    this.verifyFor = 0;
    if (!app.surfaces.length) return; // no Space Setup: nothing to compare against
    const placed = [...this.records.values()].map((r) => {
      r.tile.root.getWorldPosition(this.tmpV);
      return { label: r.label, position: [this.tmpV.x, this.tmpV.y, this.tmpV.z] as [number, number, number] };
    });
    const { checked, matched, ratio } = semanticAgreement(placed, app.surfaces);
    app.lastVerify = { checked, matched };
    if (checked >= 3 && ratio < 0.4) {
      this.refit(`Only ${matched} of ${checked} memories found their furniture here, so I re-fit your palace to this room.`);
    }
  }

  /* ---------------------------------------------------------------- helpers */

  /** Persist palace + current local poses. */
  persist(): void {
    const palace = app.palace;
    const store = getStorage();
    if (!palace || !store) return;
    if (!this.sessionActive) {
      // Outside XR the tiles sit on a preview arc; keep the saved room poses.
      app.storageOk = savePalace(store, palace);
      return;
    }
    let anchored = this.anchorsEnabled;
    const placements: Placement[] = [];
    for (const rec of this.records.values()) {
      if (rec.pendingLocal) {
        placements.push({ memoryId: rec.item.id, label: rec.label, pose: rec.pendingLocal, onTop: rec.onTop });
        continue;
      }
      if (this.anchorsEnabled && !rec.entity.getValue(XRAnchor, 'attached')) anchored = false;
      const r = rec.tile.root;
      placements.push({
        memoryId: rec.item.id,
        label: rec.label,
        pose: { p: [r.position.x, r.position.y, r.position.z], q: [r.quaternion.x, r.quaternion.y, r.quaternion.z, r.quaternion.w], s: r.scale.x },
        onTop: rec.onTop,
      });
    }
    const updated = placements.length ? withPlacements(palace, placements) : palace;
    app.palace = updated;
    if (placements.length) {
      app.frame = anchored ? 'anchor' : 'reference';
      try {
        store.setItem('loci.frame', app.frame);
      } catch {
        /* ignore */
      }
    }
    app.storageOk = savePalace(store, updated);
  }

  refreshDue(): void {
    const palace = app.palace;
    if (!palace) return;
    const now = new Date();
    const due = new Set(dueIds(palace, now));
    for (const rec of this.records.values()) {
      const wasDue = rec.entity.getValue(MemoryTile, 'due');
      const isDue = due.has(rec.item.id);
      if (wasDue !== isDue) {
        rec.entity.setValue(MemoryTile, 'due', isDue);
        this.renderTile(rec);
      }
    }
  }

  renderTile(rec: TileRecord): void {
    const palace = app.palace;
    const face = FACE_NAMES[rec.entity.getValue(MemoryTile, 'face') ?? 0] ?? 'cue';
    const due = Boolean(rec.entity.getValue(MemoryTile, 'due'));
    const card = palace?.cards[rec.item.id];
    rec.tile.render(face, {
      due,
      badge: palace?.deck.ordered ? rec.item.order + 1 : 0,
      restLabel: card ? relativeDue(new Date(card.due)) : '',
      surfaceLabel: rec.label,
      contrast: settings.contrast,
      dwell: settings.dwell,
      mastered: Boolean(card && card.state === 2 && card.stability >= 3),
      blind: Boolean(due && card && card.state === 2 && card.stability >= 3),
      concept: palace?.deck.kind === 'concept',
      hideOrder: app.chainMode,
      lastCheck: rec.lastCheck,
      wrongFirst: rec.wrongFirst,
      next: palace?.deck.kind === 'concept' ? palace.deck.items.find((i) => i.order === rec.item.order + 1)?.cue : undefined,
    });
    rec.tile.setHaloStrength(due ? 0.9 : 0.15);
  }

  private welcomeBackText(): string {
    const palace = app.palace;
    if (!palace) return '';
    const due = dueIds(palace, new Date()).length;
    if (due === 0) {
      const next = nextDue(palace);
      return `Welcome back. Nothing due right now${next ? `; next review ${relativeDue(next)}` : ''}.`;
    }
    return `Welcome back. ${due} ${due === 1 ? 'memory is' : 'memories are'} glowing, ready to recall.`;
  }

  private hubWorldPosition(): Vector3 {
    try {
      const hub = this.world.getSceneObject?.('hub');
      if (hub) {
        hub.updateWorldMatrix(true, false);
        return hub.getWorldPosition(new Vector3());
      }
    } catch {
      /* fall through */
    }
    const v = new Vector3();
    this.world.camera.getWorldPosition(v);
    this.world.camera.getWorldDirection(this.tmpV);
    return v.addScaledVector(this.tmpV, 0.6);
  }

  private disposeTiles(): void {
    for (const rec of this.records.values()) {
      rec.tile.dispose();
      if (rec.entity.active) rec.entity.dispose();
    }
    this.records.clear();
  }

  get currentPhase(): Phase {
    return this.phase;
  }
}

function isWallish(label: string): boolean {
  return ['wall', 'window', 'door', 'wall art', 'screen'].includes(label);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function relativeDue(due: Date, now = new Date()): string {
  const ms = due.getTime() - now.getTime();
  if (ms <= 0) return 'now';
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min}m`;
  const h = Math.round(min / 60);
  if (h < 36) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
}
