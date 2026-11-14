/**
 * Turns IWSDK scene understanding (XRPlane / XRMesh entities) into the plain
 * `Surface` list the placement solver understands. Runs twice a second; scene
 * data changes slowly and the solver only needs it when a palace is built.
 */
import {
  Box3,
  createSystem,
  Mesh,
  Quaternion,
  Vector3,
  XRMesh,
  XRPlane,
  type Object3D,
} from '@iwsdk/core';
import type { Surface, ViewerPose } from '../core/types.js';
import { app } from './app-state.js';

const REBUILD_INTERVAL = 0.5;

export class RoomSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  private acc = REBUILD_INTERVAL;
  private box = new Box3();
  private size = new Vector3();
  private center = new Vector3();
  private normal = new Vector3();
  private quat = new Quaternion();
  private lastSignature = '';

  update(delta: number): void {
    this.acc += delta;
    if (this.acc < REBUILD_INTERVAL) return;
    this.acc = 0;

    const surfaces: Surface[] = [];
    let i = 0;
    for (const entity of this.queries.planes.entities) {
      const obj = entity.object3D;
      const plane = entity.getValue(XRPlane, '_plane') as XRPlaneLike | undefined;
      if (!obj || !plane) continue;
      const s = this.planeSurface(obj, plane, `plane-${i++}`);
      if (s) surfaces.push(s);
    }
    i = 0;
    for (const entity of this.queries.meshes.entities) {
      const obj = entity.object3D;
      if (!obj || !entity.getValue(XRMesh, 'isBounded3D')) continue;
      const label = String(entity.getValue(XRMesh, 'semanticLabel') ?? '').toLowerCase();
      const s = this.meshSurface(obj, label, `mesh-${i++}`);
      if (s) surfaces.push(s);
    }

    const signature = surfaces
      .map((s) => `${s.label}:${s.center.map((v) => v.toFixed(1)).join(',')}`)
      .sort()
      .join('|');
    app.surfaces = surfaces;
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      app.surfacesVersion++;
    }
  }

  private planeSurface(obj: Object3D, plane: XRPlaneLike, id: string): Surface | null {
    if (!(obj instanceof Mesh)) return null;
    const geo = obj.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    bb.getSize(this.size);
    bb.getCenter(this.center);
    obj.updateWorldMatrix(true, false);
    this.center.applyMatrix4(obj.matrixWorld);
    obj.getWorldQuaternion(this.quat);
    this.normal.set(0, 1, 0).applyQuaternion(this.quat);
    const orientation = plane.orientation === 'vertical' ? 'vertical' : 'horizontal';
    return {
      id,
      kind: 'plane',
      label: (plane.semanticLabel ?? '').toLowerCase(),
      orientation,
      center: [this.center.x, this.center.y, this.center.z],
      normal: [this.normal.x, this.normal.y, this.normal.z],
      extent: [Math.max(this.size.x, 0.01), Math.max(this.size.z, 0.01)],
    };
  }

  private meshSurface(obj: Object3D, label: string, id: string): Surface | null {
    this.box.setFromObject(obj);
    if (this.box.isEmpty()) return null;
    this.box.getSize(this.size);
    this.box.getCenter(this.center);
    const thin = Math.min(this.size.x, this.size.z);
    const broad = Math.max(this.size.x, this.size.z);
    // Flat, upright objects (screens, art, windows, doors) are vertical loci.
    if (thin < 0.15 && this.size.y > 0.3 && broad > 0.3) {
      const n: [number, number, number] = this.size.x < this.size.z ? [1, 0, 0] : [0, 0, 1];
      return {
        id,
        kind: 'mesh',
        label,
        orientation: 'vertical',
        center: [this.center.x, this.center.y, this.center.z],
        normal: n, // solver flips it to face the viewer
        extent: [broad, this.size.y],
      };
    }
    return {
      id,
      kind: 'mesh',
      label,
      orientation: 'horizontal',
      center: [this.center.x, this.box.max.y, this.center.z],
      normal: [0, 1, 0],
      extent: [Math.max(this.size.x, 0.05), Math.max(this.size.z, 0.05)],
    };
  }
}

/** Subset of the WebXR XRPlane interface we read. */
interface XRPlaneLike {
  orientation?: string;
  semanticLabel?: string;
}

const _pos = new Vector3();
const _dir = new Vector3();

/** Where the learner is and which way they face, on the floor plane. */
export function viewerPose(camera: Object3D): ViewerPose {
  camera.updateWorldMatrix(true, false);
  camera.getWorldPosition(_pos);
  camera.getWorldDirection(_dir); // cameras look down -Z; three returns that direction
  _dir.y = 0;
  if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, -1);
  _dir.normalize();
  return { position: [_pos.x, _pos.y, _pos.z], forward: [_dir.x, 0, _dir.z] };
}
