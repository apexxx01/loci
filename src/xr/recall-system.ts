/**
 * The recall loop. A quick pinch on a memory flips it (cue → picture → answer);
 * grabbing it and flicking it UP or pushing it DOWN rates the recall, which
 * goes straight into the FSRS scheduler and is saved.
 */
import {
  createSystem,
  Grabbed,
  GrabSystem,
  Hovered,
  Quaternion,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { recordReview, savePalace } from '../core/palace.js';
import { dueIds } from '../core/scheduler.js';
import { classifyToss, rateToss, releaseVelocity, SampleRing } from '../core/toss.js';
import { app, bus, getStorage, setStatus } from './app-state.js';
import { MemoryTile, TileFace } from './components.js';
import { PalaceSystem, type TileRecord } from './palace-system.js';
import { settings, speak } from './settings.js';
import { playAgain, playFlip, playSuccess, updateListener } from './sound.js';

/** A grab shorter than this (wall-clock), that barely moves, is a tap. */
const TAP_TRAVEL = 0.035;
const FLASH_SECONDS = 0.9;
/**
 * Raising or lowering the holding hand this far (metres) rates the recall
 * immediately — no need to throw. Slow, deliberate movement works as well as a
 * flick, which matters for anyone with limited arm speed or range.
 */
const RATE_DISTANCE = 0.15;

const MINT = 0x5ee3b0;
const ROSE = 0xff6b8b;
const WHITE = 0xffffff;

interface GrabState {
  start: number;
  origin: Vector3;
  ring: SampleRing;
  /** Hand holding the tile; its grip pose is what we measure for a flick. */
  hand: 'left' | 'right' | null;
  /** Set once the raise/lower gesture has rated this grab. */
  rated: boolean;
}

export class RecallSystem extends createSystem({
  tiles: { required: [MemoryTile] },
  grabbed: { required: [MemoryTile, Grabbed] },
  hovered: { required: [MemoryTile, Hovered] },
}) {
  private grabs = new Map<number, GrabState>();
  private clock = 0;
  private tmp = new Vector3();
  private fwd = new Vector3();
  private up = new Vector3();
  private q = new Quaternion();
  private palaceSys!: PalaceSystem;
  private grabSys: GrabSystem | undefined;

  init(): void {
    this.palaceSys = this.world.getSystem(PalaceSystem)!;
    this.grabSys = this.world.getSystem(GrabSystem);

    this.cleanupFuncs.push(
      this.queries.grabbed.subscribe('qualify', (e) => this.onGrab(e)),
      this.queries.grabbed.subscribe('disqualify', (e) => this.onRelease(e)),
      this.queries.hovered.subscribe('qualify', (e) => {
        const rec = this.recordFor(e);
        if (rec) rec.tile.setHaloStrength(1);
      }),
      this.queries.hovered.subscribe('disqualify', (e) => {
        const rec = this.recordFor(e);
        if (rec) this.palaceSys.renderTile(rec);
      }),
    );
  }

  update(delta: number): void {
    // Wall-clock seconds: frame deltas can be clamped when frames drop, which
    // would distort release velocity exactly when it matters.
    this.clock = performance.now() / 1000;

    // Track the holding hand (or the tile) for release-velocity estimation.
    for (const entity of this.queries.grabbed.entities) {
      const g = this.grabs.get(entity.index);
      if (!g || g.rated) continue;
      if (!this.sampleSource(entity, g)) continue;
      g.ring.push(this.clock, this.tmp.x, this.tmp.y, this.tmp.z);
      const dy = this.tmp.y - g.origin.y;
      if (Math.abs(dy) >= RATE_DISTANCE) {
        const rec = this.recordFor(entity);
        if (!rec) continue;
        g.rated = true;
        const rating = rateToss(dy > 0 ? 'up' : 'down', Boolean(entity.getValue(MemoryTile, 'usedHint')))!;
        app.lastRelease = { held: this.clock - g.start, travel: Math.abs(dy), v: [0, dy, 0], result: dy > 0 ? 'raise' : 'lower' };
        this.rate(rec, rating);
        this.grabSys?.forceRelease(entity); // spring back home and celebrate
      }
    }

    // Hover lift + feedback flashes, all on the animated pivot.
    for (const entity of this.queries.tiles.entities) {
      const rec = this.recordFor(entity);
      if (!rec) continue;
      const arriving = (entity.getValue(MemoryTile, 'arrive') ?? 0) > 0;
      if (arriving) continue;
      const hovered = entity.hasComponent(Hovered);
      const base = settings.large ? 1.35 : 1;
      const target = base * (hovered ? 1.08 : 1);
      const s = rec.tile.pivot.scale.x + (target - rec.tile.pivot.scale.x) * Math.min(1, delta * 12);
      rec.tile.pivot.scale.setScalar(s);

      const flash = entity.getValue(MemoryTile, 'flash') ?? 0;
      if (flash > 0) {
        const next = Math.max(0, flash - delta);
        entity.setValue(MemoryTile, 'flash', next);
        const t = 1 - next / FLASH_SECONDS;
        const kind = entity.getValue(MemoryTile, 'flashKind') ?? 0;
        if (settings.calm) {
          // Colour feedback only; no hop, spin or shake.
        } else if (kind > 0) {
          rec.tile.pivot.position.y = Math.sin(Math.PI * Math.min(1, t * 1.6)) * 0.06;
          rec.tile.pivot.rotation.y = t < 0.6 ? t * Math.PI * 2 / 0.6 : 0;
        } else {
          rec.tile.pivot.position.x = Math.sin(t * Math.PI * 7) * 0.012 * (1 - t);
        }
        if (next === 0) {
          rec.tile.pivot.position.set(0, 0, 0);
          rec.tile.pivot.rotation.set(0, 0, 0);
          rec.tile.setHaloColor(WHITE);
          this.palaceSys.renderTile(rec);
        }
      }
    }

    // Spatial audio listener follows the head.
    const cam = this.world.camera;
    cam.getWorldPosition(this.tmp);
    cam.getWorldDirection(this.fwd);
    this.up.set(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(this.q));
    updateListener(this.tmp, this.fwd, this.up);
  }

  /** Writes the current sample position into this.tmp. */
  private sampleSource(entity: Entity, g: GrabState): boolean {
    if (g.hand) {
      const grip = this.player.gripSpaces?.[g.hand];
      if (grip) {
        grip.getWorldPosition(this.tmp);
        return true;
      }
    }
    const obj = entity.object3D;
    if (!obj) return false;
    obj.getWorldPosition(this.tmp);
    return true;
  }

  private onGrab(entity: Entity): void {
    this.clock = performance.now() / 1000;
    const g: GrabState = {
      start: this.clock,
      origin: new Vector3(),
      ring: new SampleRing(48),
      hand: this.grabSys?.getHolderHand(entity) ?? null,
      rated: false,
    };
    if (!this.sampleSource(entity, g)) return;
    g.origin.copy(this.tmp);
    g.ring.push(this.clock, this.tmp.x, this.tmp.y, this.tmp.z);
    this.grabs.set(entity.index, g);
  }

  private onRelease(entity: Entity): void {
    this.clock = performance.now() / 1000;
    const g = this.grabs.get(entity.index);
    this.grabs.delete(entity.index);
    const rec = this.recordFor(entity);
    if (!g || !rec || g.rated) return;
    if (this.sampleSource(entity, g)) g.ring.push(this.clock, this.tmp.x, this.tmp.y, this.tmp.z);
    const held = this.clock - g.start;
    const travel = this.tmp.distanceTo(g.origin);

    const v = releaseVelocity(g.ring.toArray());
    // A still pinch flips the tile however long it is held; only movement rates.
    const isTap = travel < TAP_TRAVEL;
    const result = isTap ? 'tap' : classifyToss(v);
    app.lastRelease = { held, travel, v, result };
    if (result === 'tap') {
      this.flip(rec);
      return;
    }
    const rating = rateToss(result, Boolean(entity.getValue(MemoryTile, 'usedHint')));
    if (!rating) {
      setStatus('Raise it UP if you knew it, or lower it DOWN if you did not.');
      return;
    }
    this.rate(rec, rating);
  }

  flip(rec: TileRecord): void {
    const e = rec.entity;
    const face = e.getValue(MemoryTile, 'face') ?? TileFace.Cue;
    // Learn -> Cue (now test yourself) -> Hint -> Answer -> Cue
    const next = face === TileFace.Cue ? TileFace.Hint : face === TileFace.Hint ? TileFace.Answer : TileFace.Cue;
    e.setValue(MemoryTile, 'face', next);
    if (next !== TileFace.Cue) e.setValue(MemoryTile, 'usedHint', true);
    if (next === TileFace.Answer) speak(rec.item.answer);
    else if (next === TileFace.Hint) speak(rec.item.scene);
    this.palaceSys.renderTile(rec);
    rec.tile.root.getWorldPosition(this.tmp);
    playFlip(this.tmp);
    bus.emit({ type: 'flipped', face: next, label: rec.label });
  }

  rate(rec: TileRecord, rating: 'again' | 'hard' | 'good'): void {
    const palace = app.palace;
    if (!palace) return;
    const now = new Date();
    app.palace = recordReview(palace, rec.item.id, rating, now);
    const store = getStorage();
    if (store) app.storageOk = savePalace(store, app.palace);

    const e = rec.entity;
    e.setValue(MemoryTile, 'face', TileFace.Cue);
    e.setValue(MemoryTile, 'usedHint', false);
    e.setValue(MemoryTile, 'flash', FLASH_SECONDS);
    e.setValue(MemoryTile, 'flashKind', rating === 'again' ? -1 : 1);
    rec.tile.setHaloColor(rating === 'again' ? ROSE : MINT);
    rec.tile.setHaloStrength(1);
    this.palaceSys.refreshDue();
    this.palaceSys.renderTile(rec);

    rec.tile.root.getWorldPosition(this.tmp);
    if (rating === 'again') playAgain(this.tmp);
    else playSuccess(this.tmp);

    const left = dueIds(app.palace, now).length;
    const verdict = rating === 'again' ? `"${rec.item.cue}" will come back soon.` : rating === 'hard' ? `"${rec.item.cue}" recalled with a hint.` : `"${rec.item.cue}" locked in.`;
    setStatus(left ? `${verdict} ${left} still glowing.` : `${verdict} All done for now. See you next session.`);
    bus.emit({ type: 'palace-changed' });
    bus.emit({ type: 'rated', rating });
  }

  private recordFor(entity: Entity): TileRecord | undefined {
    const id = entity.getValue(MemoryTile, 'memoryId');
    return id ? this.palaceSys.records.get(id) : undefined;
  }
}
