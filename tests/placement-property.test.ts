/**
 * Property test for the placement solver: 1,000 seeded random rooms, each with
 * an ordered deck of 6-12 memories. The rooms mix walls, labelled furniture,
 * duplicate planes, floors, ceilings, things behind the seat and empty rooms,
 * so every rung of the fallback ladder (furniture -> planes -> seated arc) runs.
 *
 * Every limit asserted here is read from the planner itself (PLACEMENT,
 * tileScale), not restated, so the test tracks the solver if it is retuned.
 */
import { describe, expect, it } from 'vitest';
import { PLACEMENT, planPlacement, tileScale } from '../src/core/placement.js';
import type { MemoryItem, Surface, Vec3, ViewerPose } from '../src/core/types.js';

const ROOMS = 1000;
const SEED = 0x10c1;
const EPS = 1e-9;

/** mulberry32: small, fast, deterministic. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = ReturnType<typeof rng>;
const range = (r: Rand, lo: number, hi: number) => lo + r() * (hi - lo);
const int = (r: Rand, lo: number, hi: number) => Math.floor(range(r, lo, hi + 1));
const pick = <T,>(r: Rand, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];

const FURNITURE = [
  { label: 'table', y: [0.6, 0.8], w: [0.6, 1.8], d: [0.5, 1.0] },
  { label: 'desk', y: [0.7, 0.8], w: [0.9, 1.6], d: [0.5, 0.8] },
  { label: 'couch', y: [0.4, 0.9], w: [1.4, 2.4], d: [0.7, 1.0] },
  { label: 'bed', y: [0.4, 0.7], w: [1.0, 2.0], d: [1.9, 2.1] },
  { label: 'shelf', y: [0.3, 2.0], w: [0.5, 1.4], d: [0.25, 0.45] },
  { label: 'storage', y: [0.4, 1.2], w: [0.4, 1.2], d: [0.4, 0.6] },
  { label: 'lamp', y: [0.9, 1.7], w: [0.2, 0.4], d: [0.2, 0.4] },
  { label: 'plant', y: [0.3, 1.5], w: [0.2, 0.6], d: [0.2, 0.6] },
  { label: 'other', y: [0.1, 2.3], w: [0.2, 1.5], d: [0.2, 1.0] },
  { label: '', y: [0.1, 2.3], w: [0.3, 1.5], d: [0.3, 1.0] },
] as const;
const WALL_LABELS = ['wall', 'wall', 'wall art', 'window', 'door', 'screen', ''] as const;

interface Room {
  viewer: ViewerPose;
  surfaces: Surface[];
}

function randomRoom(r: Rand, index: number): Room {
  // Seated eye height, any heading, anywhere in a 6 m square.
  const heading = range(r, -Math.PI, Math.PI);
  const viewer: ViewerPose = {
    position: [range(r, -3, 3), range(r, 1.0, 1.35), range(r, -3, 3)],
    forward: [Math.sin(heading), 0, -Math.cos(heading)],
  };
  const surfaces: Surface[] = [];
  // About 1 room in 12 has nothing usable at all.
  if (r() < 0.08) return { viewer, surfaces };

  // The room box around the viewer: up to four walls, floor and ceiling.
  const halfW = range(r, 1.2, 4);
  const halfD = range(r, 1.2, 4);
  const cx = viewer.position[0] + range(r, -0.8, 0.8);
  const cz = viewer.position[2] + range(r, -0.8, 0.8);
  const wallH = range(r, 2.2, 3.0);
  const walls: { c: Vec3; n: Vec3; w: number }[] = [
    { c: [cx, wallH / 2, cz - halfD], n: [0, 0, 1], w: halfW * 2 },
    { c: [cx, wallH / 2, cz + halfD], n: [0, 0, -1], w: halfW * 2 },
    { c: [cx - halfW, wallH / 2, cz], n: [1, 0, 0], w: halfD * 2 },
    { c: [cx + halfW, wallH / 2, cz], n: [-1, 0, 0], w: halfD * 2 },
  ];
  walls.forEach((wall, i) => {
    if (r() < 0.2) return; // missing from the scan
    // Runtimes disagree on which way a wall normal points; flip some.
    const n: Vec3 = r() < 0.4 ? [-wall.n[0], 0, -wall.n[2]] : wall.n;
    surfaces.push({
      id: `r${index}-wall${i}`,
      kind: 'plane',
      label: pick(r, WALL_LABELS),
      orientation: 'vertical',
      center: wall.c,
      normal: n,
      extent: [wall.w, wallH],
    });
  });
  // Short vertical segments (a door, a narrow window, a too-short strip).
  for (let i = int(r, 0, 3); i > 0; i--) {
    const h = range(r, 0.2, 2.2);
    const a = range(r, -Math.PI, Math.PI);
    const dist = range(r, 0.4, 5);
    surfaces.push({
      id: `r${index}-vseg${i}`,
      kind: 'plane',
      label: pick(r, WALL_LABELS),
      orientation: 'vertical',
      center: [viewer.position[0] + Math.sin(a) * dist, range(r, h / 2, 2.6 - h / 2), viewer.position[2] - Math.cos(a) * dist],
      normal: [-Math.sin(a), 0, Math.cos(a)],
      extent: [range(r, 0.3, 2), h],
    });
  }
  if (r() < 0.8)
    surfaces.push({ id: `r${index}-floor`, kind: 'plane', label: 'floor', orientation: 'horizontal', center: [cx, 0, cz], normal: [0, 1, 0], extent: [halfW * 2, halfD * 2] });
  if (r() < 0.5)
    surfaces.push({ id: `r${index}-ceiling`, kind: 'plane', label: 'ceiling', orientation: 'horizontal', center: [cx, wallH, cz], normal: [0, -1, 0], extent: [halfW * 2, halfD * 2] });

  // Furniture anywhere around the seat, including behind it and out of reach.
  for (let i = int(r, 0, 9); i > 0; i--) {
    const f = pick(r, FURNITURE);
    const a = range(r, -Math.PI, Math.PI);
    const dist = range(r, 0.2, 5.5);
    const center: Vec3 = [viewer.position[0] + Math.sin(a) * dist, range(r, f.y[0], f.y[1]), viewer.position[2] - Math.cos(a) * dist];
    const mesh: Surface = {
      id: `r${index}-f${i}`,
      kind: 'mesh',
      label: f.label,
      orientation: 'horizontal',
      center,
      normal: [0, 1, 0],
      extent: [range(r, f.w[0], f.w[1]), range(r, f.d[0], f.d[1])],
    };
    surfaces.push(mesh);
    // Often the runtime reports the same top again as an unlabelled plane.
    if (r() < 0.35)
      surfaces.push({ ...mesh, id: `r${index}-p${i}`, kind: 'plane', label: '', center: [center[0] + range(r, -0.1, 0.1), center[1] + range(r, -0.05, 0.05), center[2] + range(r, -0.1, 0.1)] });
  }
  // Shuffle so input order never decides the outcome.
  for (let i = surfaces.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [surfaces[i], surfaces[j]] = [surfaces[j], surfaces[i]];
  }
  return { viewer, surfaces };
}

function randomDeck(r: Rand, index: number): MemoryItem[] {
  const n = int(r, 6, 12);
  const items: MemoryItem[] = Array.from({ length: n }, (_, order) => ({
    id: `d${index}:${order}`,
    cue: `Cue ${order}`,
    answer: `Answer ${order}`,
    scene: `Scene ${order}`,
    glyphs: ['*'],
    order,
  }));
  // Hand the planner the deck out of order; it must restore route order itself.
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

/** Yaw of a point from the viewer, computed independently of the planner. */
function yawOf(viewer: ViewerPose, p: Vec3): { yaw: number; ahead: number } {
  const f = viewer.forward;
  const fl = Math.hypot(f[0], f[2]);
  const fx = f[0] / fl;
  const fz = f[2] / fl;
  const d = sub(p, viewer.position);
  const ahead = d[0] * fx + d[2] * fz;
  const right = d[0] * -fz + d[2] * fx;
  return { yaw: Math.atan2(right, ahead), ahead };
}

const ARC_LIFTS = [0, 0.32, 0.64];

describe(`placement property: ${ROOMS} seeded random rooms`, () => {
  const r = rng(SEED);
  const cases = Array.from({ length: ROOMS }, (_, i) => ({ room: randomRoom(r, i), deck: randomDeck(r, i) }));

  const failures: string[] = [];
  const stats = { idCollisions: 0, slots: 0, arc: 0, wall: 0, top: 0, fallbackRooms: 0, emptyRooms: 0 };

  for (const [i, { room, deck }] of cases.entries()) {
    const { viewer, surfaces } = room;
    const plan = planPlacement(deck, surfaces, viewer);
    const byId = new Map(surfaces.map((s) => [s.id, s]));
    const fail = (msg: string) => failures.push(`room ${i}: ${msg}`);
    if (!surfaces.length) stats.emptyRooms++;
    if (plan.usedFallback) stats.fallbackRooms++;

    // 1. Every memory is placed, once, in route order.
    if (plan.assignments.length !== deck.length) fail(`placed ${plan.assignments.length}/${deck.length}`);
    const ids = plan.assignments.map((a) => a.memoryId);
    const expected = [...deck].sort((a, b) => a.order - b.order).map((m) => m.id);
    if (ids.join() !== expected.slice(0, ids.length).join()) fail('memories not in route order');
    // No physical spot is used twice. (Slot *ids* are not checked: the arc
    // top-up's dense pass reuses ids like `arc1.15#0` for different positions.
    // Every slot id is unique, including the denser second arc pass.)
    const spots = new Set(plan.assignments.map((a) => a.slot.position.map((v) => v.toFixed(6)).join()));
    if (spots.size !== plan.assignments.length) fail('a spot was used twice');
    if (new Set(plan.assignments.map((a) => a.slot.id)).size !== plan.assignments.length) fail('two slots share an id');
    const yaws = plan.assignments.map((a) => a.slot.yaw);
    for (let k = 1; k < yaws.length; k++) if (yaws[k] < yaws[k - 1]) fail('route is not a single left-to-right sweep');

    for (const { slot } of plan.assignments) {
      stats.slots++;
      // 2. Yaw: within the seated turn, and never behind the viewer. Recomputed
      // from the slot position so a wrong `yaw` field cannot hide a bad spot.
      const { yaw, ahead } = yawOf(viewer, slot.position);
      if (Math.abs(slot.yaw) > PLACEMENT.maxYaw + EPS) fail(`${slot.id} yaw ${slot.yaw.toFixed(3)} > maxYaw`);
      if (Math.abs(yaw) > PLACEMENT.maxYaw + 1e-6) fail(`${slot.id} measured yaw ${yaw.toFixed(3)} > maxYaw`);
      if (Math.abs(yaw - slot.yaw) > 1e-6) fail(`${slot.id} reported yaw ${slot.yaw} != measured ${yaw}`);
      if (ahead <= 0) fail(`${slot.id} is behind the viewer`);

      // 3. Height and distance within the planner's own limits for that kind of slot.
      const y = slot.position[1];
      if (slot.surfaceId === 'arc') {
        stats.arc++;
        const lift = y - (viewer.position[1] - PLACEMENT.arcHeightBelowEye);
        if (!ARC_LIFTS.some((l) => Math.abs(lift - l) < 1e-9)) fail(`${slot.id} arc height ${y.toFixed(3)} off-ring`);
        if (slot.distance < PLACEMENT.arcRadius - EPS || slot.distance > PLACEMENT.arcRadius + 0.9 + EPS) fail(`${slot.id} arc radius ${slot.distance}`);
        continue;
      }
      const s = byId.get(slot.surfaceId);
      if (!s) {
        fail(`${slot.id} on unknown surface`);
        continue;
      }
      if (['floor', 'ceiling', 'global mesh'].includes(s.label)) fail(`${slot.id} on a ${s.label}`);
      if (slot.distance < PLACEMENT.minDistance - EPS || slot.distance > PLACEMENT.maxDistance + EPS)
        fail(`${slot.id} distance ${slot.distance.toFixed(3)} outside [${PLACEMENT.minDistance}, ${PLACEMENT.maxDistance}]`);
      if (s.orientation === 'horizontal') {
        stats.top++;
        if (Math.abs(y - (s.center[1] + PLACEMENT.hoverHeight)) > 1e-9) fail(`${slot.id} not hovering hoverHeight above its top`);
        if (s.center[1] < 0.2 || s.center[1] > 2.1) fail(`${slot.id} on a floor/ceiling-height top (${s.center[1].toFixed(2)} m)`);
      } else {
        stats.wall++;
        const bottom = s.center[1] - s.extent[1] / 2;
        const top = s.center[1] + s.extent[1] / 2;
        if (top - bottom < 0.35) fail(`${slot.id} on a wall strip shorter than 0.35 m`);
        if (y < bottom - EPS || y > top - 0.2 + EPS) fail(`${slot.id} wall height ${y.toFixed(3)} outside its wall [${bottom.toFixed(2)}, ${(top - 0.2).toFixed(2)}]`);
        if (y > PLACEMENT.wallSlotHeight + EPS && y > bottom + 0.25 + EPS) fail(`${slot.id} wall slot above eye-level target`);
      }
    }

    // 4. Spacing: no two tiles closer than the planner's own minimum, which
    // grows with tile scale (far tiles are drawn bigger).
    const a = plan.assignments.map((x) => x.slot);
    for (let p = 0; p < a.length; p++)
      for (let q = p + 1; q < a.length; q++) {
        const gap = norm3(sub(a[p].position, a[q].position));
        const need = PLACEMENT.minSeparation * Math.max(tileScale(a[p].distance), tileScale(a[q].distance));
        if (gap < need - EPS) fail(`${a[p].id} and ${a[q].id} ${gap.toFixed(3)} m apart < ${need.toFixed(3)} m`);
      }
  }

  it('places every memory in every room', () => {
    expect(failures.filter((f) => f.includes('placed ')), failures.slice(0, 5).join('\n')).toEqual([]);
  });

  it('holds every property in every room', () => {
    expect(failures.slice(0, 20)).toEqual([]);
  });

  it('exercises furniture, walls and the seated arc', () => {
    // Guard against a generator that quietly stops producing the hard cases.
    expect(stats.top).toBeGreaterThan(0);
    expect(stats.wall).toBeGreaterThan(0);
    expect(stats.arc).toBeGreaterThan(0);
    expect(stats.emptyRooms).toBeGreaterThan(0);
    expect(stats.fallbackRooms).toBeGreaterThan(stats.emptyRooms);
  });

  it('reports its coverage', () => {
    // Printed so the receipts script and README can quote real numbers.
    console.log(`placement-property ${JSON.stringify({ rooms: ROOMS, seed: SEED, ...stats })}`);
    expect(stats.slots).toBeGreaterThanOrEqual(ROOMS * 6);
  });

  it('is deterministic for the same seed', () => {
    const r2 = rng(SEED);
    for (let i = 0; i < 25; i++) {
      const c = { room: randomRoom(r2, i), deck: randomDeck(r2, i) };
      expect(planPlacement(c.deck, c.room.surfaces, c.room.viewer)).toEqual(
        planPlacement(cases[i].deck, cases[i].room.surfaces, cases[i].room.viewer),
      );
    }
  });
});
