/**
 * Field-of-view-aware guidance. Seated users can't see the whole room at once,
 * so the next memory to recall (in route order) gently pulses, and when it is
 * outside the comfortable view a small chevron at the edge of vision points the
 * way. Nothing is head-locked except that tiny transient marker.
 */
import {
  ConeGeometry,
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from '@iwsdk/core';
import { app } from './app-state.js';
import { MemoryTile, TileFace } from './components.js';
import { PalaceSystem, type TileRecord } from './palace-system.js';

/** Half-angle (deg) inside which a memory counts as "in view". */
const VIEW_HALF_ANGLE = 30;
const CHEVRON_DISTANCE = 0.6;
// About 21 degrees off centre: at the edge of vision, clear of whatever you are reading.
const CHEVRON_RADIUS = 0.23;

export class GuideSystem extends createSystem({ tiles: { required: [MemoryTile] } }) {
  private palaceSys!: PalaceSystem;
  private chevron!: Group;
  private chevronMat!: MeshBasicMaterial;
  private camPos = new Vector3();
  private camFwd = new Vector3();
  private toTarget = new Vector3();
  private local = new Vector3();
  private t = 0;
  private lastNext: TileRecord | null = null;

  init(): void {
    this.palaceSys = this.world.getSystem(PalaceSystem)!;
    this.chevronMat = new MeshBasicMaterial({ color: 0x5ee3b0, transparent: true, opacity: 0, depthTest: false, toneMapped: false });
    const cone = new Mesh(new ConeGeometry(0.012, 0.03, 3), this.chevronMat);
    cone.rotation.z = -Math.PI / 2; // tip points along +X before we rotate the group
    cone.renderOrder = 10;
    this.chevron = new Group();
    this.chevron.add(cone);
    this.chevron.visible = false;
    this.world.camera.add(this.chevron);
    this.cleanupFuncs.push(() => {
      this.chevron.removeFromParent();
      cone.geometry.dispose();
      this.chevronMat.dispose();
    });
  }

  update(delta: number): void {
    this.t += delta;
    const next = this.nextDue();

    if (this.lastNext && this.lastNext !== next) this.palaceSys.renderTile(this.lastNext);
    this.lastNext = next;

    if (!next || !app.palace) {
      this.fadeChevron(delta, 0);
      return;
    }

    // Pulse the next memory's halo so the eye finds it.
    next.tile.setHaloStrength(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(this.t * 4)));

    const cam = this.world.camera;
    cam.getWorldPosition(this.camPos);
    cam.getWorldDirection(this.camFwd);
    next.tile.root.getWorldPosition(this.toTarget);
    this.toTarget.sub(this.camPos);
    const angle = (this.camFwd.angleTo(this.toTarget) * 180) / Math.PI;

    // While a card is open you are reading it; the arrow can wait.
    if (angle <= VIEW_HALF_ANGLE || this.reading()) {
      this.fadeChevron(delta, 0);
      return;
    }
    // Direction to the target in camera space, flattened onto the view plane.
    this.local.copy(this.toTarget).add(this.camPos);
    cam.worldToLocal(this.local);
    const dx = this.local.x;
    const dy = this.local.y;
    const len = Math.hypot(dx, dy) || 1;
    this.chevron.position.set((dx / len) * CHEVRON_RADIUS, (dy / len) * CHEVRON_RADIUS, -CHEVRON_DISTANCE);
    this.chevron.rotation.set(0, 0, Math.atan2(dy, dx));
    // Nudge outward rhythmically: reads as "this way".
    const nudge = 1 + 0.12 * Math.sin(this.t * 6);
    this.chevron.position.x *= nudge;
    this.chevron.position.y *= nudge;
    this.fadeChevron(delta, 0.95);
  }

  private fadeChevron(delta: number, target: number): void {
    const m = this.chevronMat;
    m.opacity += (target - m.opacity) * Math.min(1, delta * 6);
    this.chevron.visible = m.opacity > 0.02;
  }

  /** True while any card is open (bloomed, checking or showing a verdict). */
  private reading(): boolean {
    for (const rec of this.palaceSys.records.values()) {
      const f = rec.entity.getValue(MemoryTile, 'face');
      if (f !== undefined && f !== TileFace.Cue && f !== TileFace.Learn) return true;
    }
    return false;
  }

  /** Lowest route position among due, settled, un-grabbed tiles. */
  private nextDue(): TileRecord | null {
    let best: TileRecord | null = null;
    for (const rec of this.palaceSys.records.values()) {
      const e = rec.entity;
      if (!e.active || !e.getValue(MemoryTile, 'due')) continue;
      if ((e.getValue(MemoryTile, 'arrive') ?? 0) > 0 || (e.getValue(MemoryTile, 'flash') ?? 0) > 0) continue;
      if (!rec.tile.root.visible) continue;
      if (!best || rec.item.order < best.item.order) best = rec;
    }
    return best;
  }
}
