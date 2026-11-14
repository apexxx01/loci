/**
 * Builds the 3D object for one memory tile: a glass card (canvas texture), a
 * soft halo behind it, and a glowing foot + tether that ties it visually to
 * the real surface it lives on.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import type { MemoryItem } from '../core/types.js';
import { drawTile, TILE_PX, type FaceKind, type FaceStyle } from './tile-art.js';

export const TILE_SIZE = { w: 0.2, h: 0.25 } as const;

// Shared geometry/material instances: one draw-call-cheap set for every tile.
const cardGeometry = new PlaneGeometry(TILE_SIZE.w, TILE_SIZE.h);
const haloGeometry = new PlaneGeometry(TILE_SIZE.w * 1.9, TILE_SIZE.h * 1.7);
const footGeometry = new RingGeometry(0.035, 0.05, 40);
const footDotGeometry = new CircleGeometry(0.012, 20);

function haloTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(139,108,255,0.55)');
  grad.addColorStop(0.5, 'rgba(139,108,255,0.18)');
  grad.addColorStop(1, 'rgba(139,108,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

let sharedHaloTexture: CanvasTexture | null = null;

export interface TileHandle {
  /** Entity object: sits at the final resting pose, gets anchored. */
  root: Group;
  /** Animated child: arrival flights, hover lift and feedback hops. */
  pivot: Group;
  card: Mesh;
  halo: Mesh;
  foot: Group;
  tether: Line;
  /** Redraw the face; cheap enough to call on every state change. */
  render(face: FaceKind, style: FaceStyle): void;
  /** Point the tether/foot down to a surface `drop` metres below the card. */
  setDrop(drop: number): void;
  setHaloStrength(s: number): void;
  /** Tint multiplier for the halo (white = violet texture as authored). */
  setHaloColor(hex: number): void;
  dispose(): void;
}

export function createTile(item: MemoryItem): TileHandle {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX.w;
  canvas.height = TILE_PX.h;
  const ctx = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;

  const cardMat = new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: true, alphaTest: 0.02 });
  const card = new Mesh(cardGeometry, cardMat);
  card.name = `tile-card:${item.id}`;
  card.renderOrder = 2;

  sharedHaloTexture ??= haloTexture();
  const haloMat = new MeshBasicMaterial({
    map: sharedHaloTexture,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const halo = new Mesh(haloGeometry, haloMat);
  halo.position.z = -0.01;
  halo.renderOrder = 1;
  halo.raycast = () => {}; // never steals hover from the card

  const footMat = new MeshBasicMaterial({ color: 0x8b6cff, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const foot = new Group();
  const ring = new Mesh(footGeometry, footMat);
  ring.rotation.x = -Math.PI / 2;
  const dot = new Mesh(footDotGeometry, footMat);
  dot.rotation.x = -Math.PI / 2;
  foot.add(ring, dot);
  foot.traverse((o) => ((o as Mesh).raycast = () => {}));

  const tetherGeo = new BufferGeometry();
  tetherGeo.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, -0.1, 0], 3));
  const tether = new Line(
    tetherGeo,
    new LineBasicMaterial({ color: 0xb9a6ff, transparent: true, opacity: 0.55, toneMapped: false }),
  );
  tether.raycast = () => {};

  const pivot = new Group();
  pivot.add(halo, card, tether, foot);
  const root = new Group();
  root.name = `tile:${item.id}`;
  root.add(pivot);

  const handle: TileHandle = {
    root,
    pivot,
    card,
    halo,
    foot,
    tether,
    render(face, style) {
      drawTile(ctx, item, face, style);
      texture.needsUpdate = true;
    },
    setDrop(drop) {
      const show = drop > 0.02;
      foot.visible = show;
      tether.visible = show;
      if (!show) return;
      const bottom = -TILE_SIZE.h / 2;
      const pos = tetherGeo.getAttribute('position') as Float32BufferAttribute;
      pos.setXYZ(0, 0, bottom, 0);
      pos.setXYZ(1, 0, bottom - drop, 0);
      pos.needsUpdate = true;
      foot.position.set(0, bottom - drop + 0.002, 0);
    },
    setHaloStrength(s) {
      haloMat.opacity = s;
      halo.visible = s > 0.01;
    },
    setHaloColor(hex) {
      haloMat.color.setHex(hex);
    },
    dispose() {
      texture.dispose();
      cardMat.dispose();
      haloMat.dispose();
      footMat.dispose();
      tetherGeo.dispose();
      (tether.material as LineBasicMaterial).dispose();
    },
  };
  return handle;
}
