/**
 * The myth check. When a concept stage is turned over on recall it shows two
 * statements, one true and one a common misconception, and two answer buttons
 * appear under it. Pinch (or look at) the true one: right counts as recalled,
 * wrong shows the correction and brings the stage back sooner. The buttons
 * are their own entities, not children of the tile, so pressing one never
 * also grabs the tile.
 */
import {
  CanvasTexture,
  createSystem,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Pressed,
  Quaternion,
  RayInteractable,
  SRGBColorSpace,
  Vector3,
  type Entity,
} from '@iwsdk/core';
import { bus, setStatus } from './app-state.js';
import { ChoiceButton, MemoryTile, TileFace } from './components.js';
import { PalaceSystem, type TileRecord } from './palace-system.js';
import { TILE_SIZE } from './tile.js';

const BTN = { w: 0.094, h: 0.056 };
const PARKED = new Vector3(0, -50, 0);

function pill(label: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 152;
  const g = c.getContext('2d')!;
  g.beginPath();
  g.roundRect(6, 6, 244, 140, 70);
  const grad = g.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#ffe2b0');
  grad.addColorStop(1, '#ffc0d8');
  g.fillStyle = grad;
  g.fill();
  g.fillStyle = '#1d1235';
  g.font = '400 88px "Marcellus", Georgia, serif';
  g.textAlign = 'center';
  g.fillText(label, 128, 106);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export class CheckSystem extends createSystem({
  pressed: { required: [ChoiceButton, Pressed] },
}) {
  /** The stage currently showing its check, if any. */
  active: TileRecord | null = null;
  readonly buttons: { entity: Entity; mesh: Mesh }[] = [];
  private palaceSys!: PalaceSystem;
  private pos = new Vector3();
  private quat = new Quaternion();
  private onAnswer: ((rec: TileRecord, correct: boolean) => void) | null = null;

  init(): void {
    this.palaceSys = this.world.getSystem(PalaceSystem)!;
    const geo = new PlaneGeometry(BTN.w, BTN.h);
    ['A', 'B'].forEach((label, slot) => {
      const mesh = new Mesh(geo, new MeshBasicMaterial({ map: pill(label), transparent: true, toneMapped: false, depthTest: true }));
      mesh.name = `choice-${label}`;
      mesh.renderOrder = 3;
      mesh.position.copy(PARKED);
      mesh.visible = false;
      const entity = this.world.createTransformEntity(mesh);
      entity.addComponent(ChoiceButton, { slot });
      entity.addComponent(RayInteractable);
      this.buttons.push({ entity, mesh });
    });
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (e) => this.choose(e.getValue(ChoiceButton, 'slot') ?? 0)),
      bus.on((e) => {
        if (e.type === 'new-palace' || e.type === 'switch-palace' || e.type === 'refit') this.close();
      }),
    );
  }

  /** RecallSystem decides what an answer means for the schedule. */
  setAnswerHandler(fn: (rec: TileRecord, correct: boolean) => void): void {
    this.onAnswer = fn;
  }

  /** Show the check on this stage; any other open check goes back to its cue. */
  open(rec: TileRecord): void {
    if (this.active && this.active !== rec) {
      this.active.entity.setValue(MemoryTile, 'face', TileFace.Cue);
      this.palaceSys.renderTile(this.active);
    }
    this.active = rec;
    rec.wrongFirst = Math.random() < 0.5;
    rec.entity.setValue(MemoryTile, 'face', TileFace.Check);
    this.palaceSys.renderTile(rec);
    setStatus('Which is true? Pinch A or B.');
  }

  close(): void {
    this.active = null;
    for (const b of this.buttons) {
      b.mesh.visible = false;
      b.mesh.position.copy(PARKED);
    }
  }

  choose(slot: number): void {
    const rec = this.active;
    if (!rec || rec.entity.getValue(MemoryTile, 'face') !== TileFace.Check) return;
    const correct = slot === (rec.wrongFirst ? 1 : 0);
    rec.lastCheck = correct ? 'right' : 'wrong';
    this.close();
    this.onAnswer?.(rec, correct);
    bus.emit({ type: 'stage-checked', memoryId: rec.item.id, correct });
  }

  update(): void {
    const rec = this.active;
    if (!rec) return;
    if (!this.palaceSys.records.has(rec.item.id) || rec.entity.getValue(MemoryTile, 'face') !== TileFace.Check) {
      this.close();
      return;
    }
    // Follow the card: A beside its left edge, B beside its right, facing the same
    // way. Beside, not below, so a table or shelf under the card never blocks them.
    const pivot = rec.tile.pivot;
    pivot.updateWorldMatrix(true, false);
    pivot.getWorldQuaternion(this.quat);
    const s = rec.tile.root.scale.x * pivot.scale.x;
    this.buttons.forEach((b, i) => {
      this.pos.set((i === 0 ? -1 : 1) * (TILE_SIZE.w / 2 + BTN.w / 2 + 0.012), 0, 0.004);
      pivot.localToWorld(this.pos);
      b.mesh.position.copy(this.pos);
      b.mesh.quaternion.copy(this.quat);
      b.mesh.scale.setScalar(s);
      b.mesh.visible = true;
    });
  }
}
