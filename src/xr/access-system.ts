/**
 * Comfort & access. Applies the settings (sound, larger tiles) and implements
 * look-to-select: hold your gaze on a memory to flip it, on a rating or answer
 * button to press it, or on a hub button to press that. Where the runtime
 * offers eye tracking (Meta VR Glasses) the eyes aim; elsewhere (Quest 3 has
 * none) the head does. No pinch, no arm movement, nothing timed against you.
 *
 * With look-to-select off, gaze still works the standard way where the runtime
 * has it: IWSDK's GazeSystem aims at what you look at and a pinch selects.
 */
import {
  createSystem,
  Mesh,
  MeshBasicMaterial,
  Ray,
  Raycaster,
  RingGeometry,
  Vector3,
  type Object3D,
} from '@iwsdk/core';
import { app } from './app-state.js';
import { MemoryTile, TileFace } from './components.js';
import { PalaceSystem, type TileRecord } from './palace-system.js';
import { RecallSystem } from './recall-system.js';
import { CheckSystem } from './check-system.js';
import { ChainSystem } from './chain-system.js';
import { HubSystem } from './hub-system.js';
import { onSettings, settings } from './settings.js';
import { setMuted } from './sound.js';
import { TILE_SIZE } from './tile.js';

const DWELL_SECONDS = 1.1;
/** Hub buttons are also what you read, so they wait longer before pressing. */
const HUB_DWELL_SECONDS = 1.8;
/** How far the gaze must move after a hub press before the hub arms again. */
const HUB_REARM_RAD = (4 * Math.PI) / 180;
const RING_SEGMENTS = 40;

type HubTarget = NonNullable<ReturnType<HubSystem['lookPick']>>['target'];
type Target =
  | { rec: TileRecord; kind: 'card' | 'good' | 'again' | 'a' | 'b'; obj: Object3D }
  | { rec: null; kind: 'hub'; obj: Object3D; hub: HubTarget };

export class AccessSystem extends createSystem({ tiles: { required: [MemoryTile] } }) {
  private palaceSys!: PalaceSystem;
  private recall!: RecallSystem;
  private checks: CheckSystem | undefined;
  private hub: HubSystem | undefined;
  private chain: ChainSystem | undefined;
  private raycaster = new Raycaster();
  private hubPoint = new Vector3();
  /**
   * Where you were looking when a hub button fired. Pressing a button changes
   * the panel, so a new button can appear right under your gaze; nothing on
   * the hub arms again until the gaze has moved a few degrees from here.
   */
  private pressDir = new Vector3();
  private hubHold = false;
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
    // Hub and chain register after this system, so they are looked up on first use.
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

    // Look-to-select runs with or without a palace: the hub is how you start one.
    if (!settings.dwell) {
      this.clear();
      return;
    }

    // Eyes when the runtime tracks them, otherwise the head.
    const rig = this.input.xr.xrOrigin;
    const eyes = rig.gazeOrigin === 'tracked';
    const aim = eyes ? rig.eyeSpace : this.world.camera;
    aim.getWorldPosition(this.origin);
    aim.getWorldDirection(this.dir);
    // Object3D.getWorldDirection is +Z for plain groups; a ray space points down -Z.
    if (eyes) this.dir.negate();
    app.gazeSource = eyes ? 'eyes' : 'head';
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
      if (target.kind === 'hub') {
        // UIKit owns its children, so the ring sits in the world at the gaze point.
        this.world.scene.add(this.ring);
      } else {
        target.obj.add(this.ring);
        this.ring.position.set(0, 0, 0.006);
        this.ring.quaternion.identity();
      }
    }
    if (target.kind === 'hub') {
      // Just in front of the button, facing you.
      this.ring.position.copy(this.hubPoint).addScaledVector(this.dir, -0.01);
      this.ring.lookAt(this.origin);
    }
    this.dwell += delta;
    const p = Math.min(1, this.dwell / (target.kind === 'hub' ? HUB_DWELL_SECONDS : DWELL_SECONDS));
    this.ringGeo.setDrawRange(0, Math.max(6, Math.floor(p * RING_SEGMENTS) * 6));
    this.ring.visible = true;

    if (p >= 1) {
      const t = this.current;
      this.clear(false);
      if (t.kind === 'hub') {
        this.cooldownObj = t.obj;
        this.pressDir.copy(this.dir);
        this.hubHold = true;
        this.hub?.lookPress(t.hub);
        return;
      }
      if (t.kind === 'card' && app.chainMode) {
        // Rebuilding the chain: looking at a stage picks it, as a pinch would.
        this.cooldownObj = t.obj;
        this.chain ??= this.world.getSystem(ChainSystem);
        this.chain?.pick(t.rec);
        return;
      }
      if (t.kind === 'card') {
        this.recall.flip(t.rec);
        // Keep looking to go on from the picture to the answer; once the
        // answer shows, the gaze must move to a rating button.
        // A concept card stays open while you read it: look away, then back, to close.
        if (t.rec.entity.getValue(MemoryTile, 'face') === TileFace.Hint && app.palace?.deck.kind !== 'concept') this.pause = 0.7;
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

  /** Nearest card, visible rating or answer button, or hub button under the gaze ray. */
  private pick(): Target | null {
    let best: Target | null = null;
    let bestDist = Infinity;
    this.hub ??= this.world.getSystem(HubSystem);
    if (this.hubHold && this.dir.angleTo(this.pressDir) > HUB_REARM_RAD) this.hubHold = false;
    if (this.hub && !this.hubHold) {
      this.raycaster.set(this.origin, this.dir);
      const h = this.hub.lookPick(this.raycaster);
      if (h) {
        bestDist = h.distance;
        this.hubPoint.copy(h.point);
        best = { rec: null, kind: 'hub', obj: h.target.el, hub: h.target };
      }
    }
    for (const rec of this.palaceSys.records.values()) {
      if (!rec.tile.root.visible) continue;
      const btns = rec.tile.rateButtons;
      const candidates: [Object3D, Exclude<Target['kind'], 'hub'>, number, number][] = [
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
        if (d !== null && (d < bestDist - 0.01 || (kind !== 'card' && best?.kind !== 'hub' && d < bestDist + 0.05))) {
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
