/**
 * Placement solver: turns a room's surfaces into memory "loci" and assigns
 * memories to them along a route the learner can sweep with their eyes while
 * seated. Deterministic: same room + same deck = same palace.
 */
import type {
  MemoryItem,
  PlacementPlan,
  Slot,
  Surface,
  Vec3,
  ViewerPose,
} from './types.js';

export const PLACEMENT = {
  /** Closest a tile may sit to the viewer (metres). */
  minDistance: 0.55,
  /** Furthest a tile may sit; beyond this text stops being legible. */
  maxDistance: 4.5,
  /** Widest yaw from forward a seated user can comfortably turn to (rad). */
  maxYaw: (150 * Math.PI) / 180,
  /** Minimum gap between two tiles so they never overlap. */
  minSeparation: 0.3,
  /** Height a tile floats above a horizontal surface. */
  hoverHeight: 0.14,
  /** Gap between a tile and a wall. */
  wallOffset: 0.06,
  /** Spacing of slots across one surface. */
  horizontalSpacing: 0.34,
  verticalSpacing: 0.62,
  /** Eye-level target for wall slots in local-floor space. */
  wallSlotHeight: 1.35,
  /** Max tiles on one surface, so the palace stays spread out. */
  perSurfaceCap: 3,
  /** Virtual arc used when the room gives us too little. */
  arcRadius: 1.15,
  arcHeightBelowEye: 0.18,
  arcSpanDeg: 130,
} as const;

/** Labels that are never usable as loci. */
const EXCLUDED_LABELS = new Set(['floor', 'ceiling', 'global mesh']);

/**
 * Distinct, nameable furniture makes stronger loci than blank walls. Higher
 * scores are chosen first when the room offers more slots than needed.
 */
const LABEL_DISTINCTIVENESS: Record<string, number> = {
  table: 1,
  desk: 1,
  couch: 1,
  shelf: 1,
  storage: 0.9,
  bed: 0.9,
  lamp: 0.9,
  plant: 0.9,
  screen: 0.85,
  'wall art': 0.85,
  window: 0.8,
  door: 0.75,
  other: 0.6,
  wall: 0.5,
  '': 0.4,
};

const UP: Vec3 = [0, 1, 0];

/**
 * Tiles grow with distance so text stays legible: roughly constant angular
 * size beyond arm's reach, never smaller than the base card.
 */
export function tileScale(distance: number): number {
  return clamp(distance / 1.25, 1, 2.4);
}

/* ---------- tiny vector helpers (no allocations hidden in loops matter here) ---------- */
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l < 1e-9 ? [0, 0, -1] : scale(a, 1 / l);
};
const flat = (a: Vec3): Vec3 => [a[0], 0, a[2]];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Signed yaw of `dir` relative to `forward` on the floor plane (right = +). */
export function signedYaw(forward: Vec3, dir: Vec3): number {
  const f = norm(flat(forward));
  const d = norm(flat(dir));
  // Right-handed, -Z forward: right vector is (−f.z, 0, f.x)
  const right: Vec3 = [-f[2], 0, f[0]];
  return Math.atan2(dot(d, right), dot(d, f));
}

export function distinctiveness(label: string): number {
  return LABEL_DISTINCTIVENESS[label] ?? LABEL_DISTINCTIVENESS.other;
}

/** Generate candidate slots on one surface. */
export function slotsForSurface(surface: Surface, viewer: ViewerPose): Slot[] {
  const label = surface.label.toLowerCase();
  if (EXCLUDED_LABELS.has(label)) return [];

  const toViewer = sub(viewer.position, surface.center);
  const slots: Slot[] = [];
  // Far surfaces get bigger tiles, so give each tile more room.
  const sc = tileScale(len(flat(toViewer)));

  if (surface.orientation === 'horizontal') {
    const y = surface.center[1];
    // Skip floor-height and ceiling-height horizontals even if unlabelled.
    if (y < 0.2 || y > 2.1) return [];
    const width = Math.min(surface.extent[0], surface.extent[1]);
    const spacing = PLACEMENT.horizontalSpacing * sc;
    const count = clamp(Math.floor(width / spacing), 1, PLACEMENT.perSurfaceCap);
    // Spread perpendicular to the line of sight so tiles don't hide each other.
    const lateral = norm(cross(UP, flat(toViewer)));
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spacing;
      const base = add(surface.center, scale(lateral, offset));
      const position = add(base, [0, PLACEMENT.hoverHeight, 0]);
      slots.push(makeSlot(surface, label, i, position, viewer));
    }
  } else {
    let normal = norm(flat(surface.normal));
    // Runtimes disagree on which side a wall's normal points; face the viewer.
    if (dot(normal, toViewer) < 0) normal = scale(normal, -1);
    const [width, height] = surface.extent;
    const bottom = surface.center[1] - height / 2;
    const top = surface.center[1] + height / 2;
    if (top - bottom < 0.35) return [];
    const y = clamp(PLACEMENT.wallSlotHeight, bottom + 0.25, top - 0.2);
    const tangent = norm(cross(UP, normal));
    const spacing = Math.max(PLACEMENT.verticalSpacing, PLACEMENT.minSeparation * sc + 0.04);
    const count = clamp(Math.floor(width / spacing), 1, PLACEMENT.perSurfaceCap);
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * spacing;
      const onWall: Vec3 = [
        surface.center[0] + tangent[0] * offset,
        y,
        surface.center[2] + tangent[2] * offset,
      ];
      const position = add(onWall, scale(normal, PLACEMENT.wallOffset));
      slots.push(makeSlot(surface, label, i, position, viewer, normal));
    }
  }

  return slots.filter(
    (s) =>
      s.distance >= PLACEMENT.minDistance &&
      s.distance <= PLACEMENT.maxDistance &&
      Math.abs(s.yaw) <= PLACEMENT.maxYaw,
  );
}

function makeSlot(
  surface: Surface,
  label: string,
  index: number,
  position: Vec3,
  viewer: ViewerPose,
  wallNormal?: Vec3,
): Slot {
  const toViewer = sub(viewer.position, position);
  const facing = wallNormal ?? norm(flat(toViewer));
  return {
    id: `${surface.id}#${index}`,
    surfaceId: surface.id,
    label,
    position,
    facing,
    distance: len(flat(toViewer)),
    yaw: signedYaw(viewer.forward, scale(toViewer, -1)),
    onTop: !wallNormal,
  };
}

/** Comfort score in [0,1]: near-ish, in front, on distinctive furniture. */
export function slotScore(slot: Slot): number {
  const d = slot.distance;
  const distanceScore =
    d < 0.8 ? 0.6 + 0.5 * (d - PLACEMENT.minDistance) : d <= 2.6 ? 1 : Math.max(0, 1 - (d - 2.6) / 2.4);
  const yawScore = Math.cos(Math.min(Math.abs(slot.yaw), Math.PI / 2) * 0.9);
  return 0.45 * distanceScore + 0.25 * yawScore + 0.3 * distinctiveness(slot.label);
}

/** Virtual arc slots in front of a seated user, used to top up or replace. */
export function arcSlots(
  count: number,
  viewer: ViewerPose,
  radius: number = PLACEMENT.arcRadius,
  lift = 0,
): Slot[] {
  if (count <= 0) return [];
  const f = norm(flat(viewer.forward));
  const baseYaw = Math.atan2(f[0], -f[2]);
  const span = (PLACEMENT.arcSpanDeg * Math.PI) / 180;
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const yaw = -span / 2 + t * span;
    const a = baseYaw + yaw;
    const position: Vec3 = [
      viewer.position[0] + Math.sin(a) * radius,
      viewer.position[1] - PLACEMENT.arcHeightBelowEye + lift,
      viewer.position[2] - Math.cos(a) * radius,
    ];
    slots.push({
      id: `arc${radius.toFixed(2)}#${i}`,
      surfaceId: 'arc',
      label: '',
      position,
      facing: norm(flat(sub(viewer.position, position))),
      distance: radius,
      yaw,
      onTop: false,
    });
  }
  return slots;
}

/**
 * Runtimes often report the same table twice: once as a labelled 3D mesh and
 * once as a horizontal plane. Keep one surface per physical spot, preferring
 * the more specific semantic label.
 */
export function dedupeSurfaces(surfaces: Surface[], radius = 0.35): Surface[] {
  const ranked = [...surfaces].sort(
    (a, b) => distinctiveness(b.label) - distinctiveness(a.label) || a.id.localeCompare(b.id),
  );
  const kept: Surface[] = [];
  for (const s of ranked) {
    const dup = kept.some(
      (k) =>
        k.orientation === s.orientation &&
        Math.hypot(k.center[0] - s.center[0], k.center[2] - s.center[2]) < radius &&
        Math.abs(k.center[1] - s.center[1]) < 0.25,
    );
    if (!dup) kept.push(s);
  }
  return kept;
}

const farEnough = (slot: Slot, taken: Slot[]) =>
  taken.every(
    (t) =>
      len(sub(slot.position, t.position)) >=
      PLACEMENT.minSeparation * Math.max(tileScale(slot.distance), tileScale(t.distance)),
  );

/**
 * Pick `items.length` slots, spreading memories across as many distinct
 * surfaces as possible, then order them left→right so an ordered list becomes
 * a single sweep of the head.
 */
export function planPlacement(
  items: MemoryItem[],
  surfaces: Surface[],
  viewer: ViewerPose,
): PlacementPlan {
  const needed = items.length;
  const bySurface = new Map<string, Slot[]>();
  for (const surface of dedupeSurfaces(surfaces)) {
    const slots = slotsForSurface(surface, viewer).sort((a, b) => slotScore(b) - slotScore(a));
    if (slots.length) bySurface.set(surface.id, slots);
  }

  // Best surfaces first, judged by their best slot.
  const ranked = [...bySurface.values()].sort((a, b) => slotScore(b[0]) - slotScore(a[0]));

  // Round-robin across surfaces; within a round, surfaces whose *label* is
  // already used go last. Two couch meshes should not beat one lamp: distinct
  // objects are what make loci memorable.
  const chosen: Slot[] = [];
  const labelUses = new Map<string, number>();
  const uses = (label: string) => (label ? labelUses.get(label) ?? 0 : 0);
  for (let round = 0; round < PLACEMENT.perSurfaceCap && chosen.length < needed; round++) {
    const pool = ranked.map((slots) => slots[round]).filter((s): s is Slot => Boolean(s));
    while (pool.length && chosen.length < needed) {
      // Greedy: least-used label first, then the most comfortable slot.
      let best = 0;
      for (let i = 1; i < pool.length; i++) {
        const d = uses(pool[i].label) - uses(pool[best].label);
        if (d < 0 || (d === 0 && slotScore(pool[i]) > slotScore(pool[best]))) best = i;
      }
      const [candidate] = pool.splice(best, 1);
      if (farEnough(candidate, chosen)) {
        chosen.push(candidate);
        labelUses.set(candidate.label, uses(candidate.label) + 1);
      }
    }
  }

  const realSurfaces = new Set(chosen.map((s) => s.surfaceId)).size;
  let usedFallback = false;
  // Top up with virtual arcs: first at seated reach, then a second ring a bit
  // further out and higher, so a bare room still yields an even, symmetric palace.
  const rings = [
    { radius: PLACEMENT.arcRadius, lift: 0 },
    { radius: PLACEMENT.arcRadius + 0.45, lift: 0.32 },
    { radius: PLACEMENT.arcRadius + 0.9, lift: 0.64 },
  ];
  for (const ring of rings) {
    const remaining = needed - chosen.length;
    if (remaining <= 0) break;
    usedFallback = true;
    for (const slot of arcSlots(remaining, viewer, ring.radius, ring.lift)) {
      if (farEnough(slot, chosen)) chosen.push(slot);
    }
  }

  chosen.sort((a, b) => a.yaw - b.yaw);
  const ordered = [...items].sort((a, b) => a.order - b.order);
  return {
    assignments: ordered.slice(0, chosen.length).map((item, i) => ({
      memoryId: item.id,
      slot: chosen[i],
    })),
    usedFallback,
    surfacesUsed: realSurfaces,
  };
}
