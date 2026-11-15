/**
 * Comfort & access. Applies the settings (sound, larger tiles) and implements
 * look-to-select: hold your gaze (head direction on Quest 3, eyes where the
 * runtime offers them) on a memory to flip it, and on a rating button to rate
 * it. No pinch, no arm movement, nothing timed against you.
 */
import {
  createSystem,
  Mesh,
  MeshBasicMaterial,
  Ray,
  RingGeometry,
  Vector3,
  type Object3D,
} from '@iwsdk/core';
import { app } from './app-state.js';
import { MemoryTile, TileFace } from './components.js';
import { PalaceSystem, type TileRecord } from './palace-system.js';
import { RecallSystem } from './recall-system.js';
import { CheckSystem } from './check-system.js';
import { onSettings, settings } from './settings.js';
import { setMuted } from './sound.js';
import { TILE_SIZE } from './tile.js';

const DWELL_SECONDS = 1.1;
const RING_SEGMENTS = 40;

type Target = { rec: TileRecord; kind: 'card' | 'good' | 'again' | 'a' | 'b'; obj: Object3D };

export class AccessSystem extends createSystem({ tiles: { required: [MemoryTile] } }) {
  private palaceSys!: PalaceSystem;
  private recall!: RecallSystem;
  private checks: CheckSystem | undefined;
  private ray = new Ray();
  private origin = new Vector3();
  private dir = new Vector3();
  private localO = new Vector3();
  private localD = new Vector3();
  private hitPoint = new Vector3();
  private ring!: Mesh;
  private ringGeo!: RingGeometry;
  private current: Target | null = null;
  private dwell = 0;
  /** After an activation, wait for the gaze to leave before arming again. */
  private cooldownObj: Object3D | null = null;
  /** Short pause before a chained dwell (picture -> answer) starts filling. */
  private pause = 0;

  init(): void {
    this.palaceSys = this.world.getSystem(PalaceSystem)!;
    this.recall = this.world.getSystem(RecallSystem)!;
    this.checks = this.world.getSystem(CheckSystem);
    this.ringGeo = new RingGeometry(0.016, 0.024, RING_SEGMENTS, 1);
    this.ring = new Mesh(
      this.ringGeo,
      new MeshBasicMaterial({ color: 0x5ee3b0, transparent: true, depthTest: false, toneMapped: false }),
    );
    this.ring.renderOrder = 12;
    this.ring.visible = false;
    this.ring.raycast = () => {};

    setMuted(!settings.sound);
    this.cleanupFuncs.push(
      onSettings((s, key) => {
        if (key === 'sound') setMuted(!s.sound);
        for (const rec of this.palaceSys.records.values()) this.palaceSys.renderTile(rec);
      }),
      () => {
        this.ring.removeFromParent();
        this.ringGeo.dispose();
        (this.ring.material as MeshBasicMaterial).dispose();
      },
    );
  }

  update(delta: number): void {
    // Rating buttons follow the answer face in look-to-select mode.
    for (const rec of this.palaceSys.records.values()) {
      const showButtons = settings.dwell && rec.entity.getValue(MemoryTile, 'face') === TileFace.Answer && app.palace?.deck.kind !== 'concept';
      if (showButtons || rec.tile.rateButtons) rec.tile.showRateButtons(showButtons);
    }

    if (!settings.dwell || !app.palace) {
      this.clear();
      return;
    }

    const cam = this.world.camera;
    cam.getWorldPosition(this.origin);
    cam.getWorldDirection(this.dir);
    const target = this.pick();

    if (!target || target.obj === this.cooldownObj) {
      if (!target) this.cooldownObj = null;
      this.clear(false);
      return;
    }
    if (this.pause > 0) {
      this.pause -= delta;
      this.clear(false);
      return;
    }
    if (!this.current || this.current.obj !== target.obj) {
      this.current = target;
      this.dwell = 0;
      target.obj.add(this.ring);
      this.ring.position.set(0, 0, 0.006);
      if (target.kind === 'card') this.ring.position.set(0, 0, 0.006);
    }
    this.dwell += delta;
    const p = Math.min(1, this.dwell / DWELL_SECONDS);
    this.ringGeo.setDrawRange(0, Math.max(6, Math.floor(p * RING_SEGMENTS) * 6));
    this.ring.visible = true;

    if (p >= 1) {
      const t = this.current;
      this.clear(false);
      if (t.kind === 'card') {
        this.recall.flip(t.rec);
        // Keep looking to go on from the picture to the answer; once the
        // answer shows, the gaze must move to a rating button.
        if (t.rec.entity.getValue(MemoryTile, 'face') === TileFace.Hint) this.pause = 0.7;
        else this.cooldownObj = t.obj;
      } else {
        this.cooldownObj = t.obj;
      }
      if (t.kind === 'card') return;
      if (t.kind === 'a' || t.kind === 'b') {
        this.checks?.choose(t.kind === 'a' ? 0 : 1);
        return;
      }
      this.recall.rate(t.rec, t.kind === 'good' ? (t.rec.entity.getValue(MemoryTile, 'usedHint') ? 'hard' : 'good') : 'again');
    }
  }

  private clear(resetCooldown = false): void {
    this.current = null;
    this.dwell = 0;
    this.ring.visible = false;
    if (resetCooldown) this.cooldownObj = null;
  }

  /** Nearest card or visible rating button under the gaze ray. */
  private pick(): Target | null {
    let best: Target | null = null;
    let bestDist = Infinity;
    for (const rec of this.palaceSys.records.values()) {
      if (!rec.tile.root.visible) continue;
      const btns = rec.tile.rateButtons;
      const candidates: [Object3D, Target['kind'], number, number][] = [
        [rec.tile.card, 'card', TILE_SIZE.w, TILE_SIZE.h],
      ];
      if (btns?.good.visible) {
        candidates.push([btns.good, 'good', 0.092, 0.05], [btns.again, 'again', 0.092, 0.05]);
      }
      if (this.checks?.active === rec) {
        const [a, b] = this.checks.buttons;
        if (a?.mesh.visible) candidates.push([a.mesh, 'a', 0.094, 0.056], [b.mesh, 'b', 0.094, 0.056]);
      }
      for (const [obj, kind, w, h] of candidates) {
        const d = this.hitRect(obj, w, h);
        // Buttons win ties with their own card.
        if (d !== null && (d < bestDist - 0.01 || (kind !== 'card' && d < bestDist + 0.05))) {
          bestDist = d;
          best = { rec, kind, obj };
        }
      }
    }
    return best;
  }

  /** Distance along the gaze ray to a w×h rectangle on obj's local XY plane. */
  private hitRect(obj: Object3D, w: number, h: number): number | null {
    obj.updateWorldMatrix(true, false);
    this.localO.copy(this.origin);
    obj.worldToLocal(this.localO);
    this.localD.copy(this.origin).add(this.dir);
    obj.worldToLocal(this.localD);
    this.localD.sub(this.localO);
    if (Math.abs(this.localD.z) < 1e-6) return null;
    const t = -this.localO.z / this.localD.z;
    if (t <= 0) return null;
    const x = this.localO.x + this.localD.x * t;
    const y = this.localO.y + this.localD.y * t;
    // A little forgiveness: head pointing is coarser than a fingertip.
    if (Math.abs(x) > (w / 2) * 1.15 || Math.abs(y) > (h / 2) * 1.15) return null;
    this.ray.set(this.origin, this.dir);
    this.hitPoint.set(x, y, 0);
    obj.localToWorld(this.hitPoint);
    return this.hitPoint.distanceTo(this.origin);
  }
}
