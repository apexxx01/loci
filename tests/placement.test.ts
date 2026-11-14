import { describe, expect, it } from 'vitest';
import { PLANETS, ELEMENTS } from '../src/core/decks.js';
import {
  PLACEMENT,
  arcSlots,
  planPlacement,
  signedYaw,
  slotsForSurface,
} from '../src/core/placement.js';
import type { Surface, ViewerPose } from '../src/core/types.js';

const seated: ViewerPose = { position: [0, 1.2, 0], forward: [0, 0, -1] };

const table: Surface = {
  id: 'table',
  kind: 'mesh',
  label: 'table',
  orientation: 'horizontal',
  center: [0, 0.74, -1.1],
  normal: [0, 1, 0],
  extent: [1.2, 0.7],
};
const wallFront: Surface = {
  id: 'wall-front',
  kind: 'plane',
  label: 'wall',
  orientation: 'vertical',
  center: [0, 1.3, -2.6],
  normal: [0, 0, 1],
  extent: [3.4, 2.6],
};
const wallLeft: Surface = {
  id: 'wall-left',
  kind: 'plane',
  label: 'wall',
  orientation: 'vertical',
  center: [-2.0, 1.3, -0.6],
  normal: [-1, 0, 0], // deliberately pointing away from the viewer
  extent: [3.0, 2.6],
};
const couch: Surface = {
  id: 'couch',
  kind: 'mesh',
  label: 'couch',
  orientation: 'horizontal',
  center: [1.6, 0.85, -0.9],
  normal: [0, 1, 0],
  extent: [1.9, 0.9],
};
const floor: Surface = {
  id: 'floor',
  kind: 'plane',
  label: 'floor',
  orientation: 'horizontal',
  center: [0, 0, -1],
  normal: [0, 1, 0],
  extent: [5, 5],
};
const behind: Surface = {
  id: 'behind',
  kind: 'mesh',
  label: 'shelf',
  orientation: 'horizontal',
  center: [0, 1.0, 2.0],
  normal: [0, 1, 0],
  extent: [1, 0.4],
};

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('signedYaw', () => {
  it('is 0 straight ahead, positive to the right, negative to the left', () => {
    expect(signedYaw([0, 0, -1], [0, 0, -1])).toBeCloseTo(0);
    expect(signedYaw([0, 0, -1], [1, 0, 0])).toBeCloseTo(Math.PI / 2);
    expect(signedYaw([0, 0, -1], [-1, 0, 0])).toBeCloseTo(-Math.PI / 2);
  });
});

describe('slotsForSurface', () => {
  it('never uses floors or ceilings', () => {
    expect(slotsForSurface(floor, seated)).toHaveLength(0);
  });

  it('puts table slots just above the tabletop, facing the viewer', () => {
    const slots = slotsForSurface(table, seated);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.position[1]).toBeCloseTo(0.74 + PLACEMENT.hoverHeight);
      expect(s.facing[2]).toBeGreaterThan(0.9); // faces back towards +Z (the viewer)
    }
  });

  it('flips wall normals that point away from the viewer', () => {
    const slots = slotsForSurface(wallLeft, seated);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.facing[0]).toBeGreaterThan(0.9);
      expect(s.position[0]).toBeGreaterThan(-2.0); // offset into the room, not into the wall
    }
  });

  it('drops slots directly behind a seated user', () => {
    expect(slotsForSurface(behind, seated)).toHaveLength(0);
  });
});

describe('planPlacement', () => {
  const room = [table, wallFront, wallLeft, couch, floor];

  it('places every memory, spread across distinct surfaces', () => {
    const plan = planPlacement(PLANETS.items, room, seated);
    expect(plan.assignments).toHaveLength(PLANETS.items.length);
    expect(plan.surfacesUsed).toBe(4);
    expect(plan.usedFallback).toBe(false);
  });

  it('keeps every pair of tiles at least the minimum separation apart', () => {
    const plan = planPlacement(ELEMENTS.items, room, seated);
    const ps = plan.assignments.map((a) => a.slot.position);
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++)
        expect(dist(ps[i], ps[j])).toBeGreaterThanOrEqual(PLACEMENT.minSeparation - 1e-9);
  });

  it('orders an ordered deck left → right as a single sweep', () => {
    const plan = planPlacement(PLANETS.items, room, seated);
    const yaws = plan.assignments.map((a) => a.slot.yaw);
    expect([...yaws].sort((a, b) => a - b)).toEqual(yaws);
    expect(plan.assignments[0].memoryId).toBe('planets:0');
  });

  it('is deterministic', () => {
    const a = planPlacement(PLANETS.items, room, seated);
    const b = planPlacement(PLANETS.items, room, seated);
    expect(a).toEqual(b);
  });

  it('falls back to a symmetric arc in an empty room', () => {
    const plan = planPlacement(PLANETS.items, [], seated);
    expect(plan.assignments).toHaveLength(8);
    expect(plan.usedFallback).toBe(true);
    expect(plan.surfacesUsed).toBe(0);
    const yaws = plan.assignments.map((a) => a.slot.yaw);
    expect(Math.min(...yaws)).toBeLessThan(-0.5);
    expect(Math.max(...yaws)).toBeGreaterThan(0.5);
  });

  it('tops up with the arc when the room is too small', () => {
    const plan = planPlacement(ELEMENTS.items, [table], seated);
    expect(plan.assignments).toHaveLength(10);
    expect(plan.usedFallback).toBe(true);
    expect(plan.surfacesUsed).toBe(1);
  });

  it('remaps the same deck onto a different room', () => {
    const office: Surface[] = [
      { ...table, id: 'desk', label: 'desk', center: [0.4, 0.75, -0.8] },
      { ...wallFront, id: 'office-wall', center: [0, 1.3, -1.8] },
      { ...couch, id: 'shelf', label: 'shelf', center: [-1.2, 1.1, -1.4], extent: [0.9, 0.35] },
    ];
    const a = planPlacement(PLANETS.items, room, seated);
    const b = planPlacement(PLANETS.items, office, seated);
    expect(b.assignments.map((x) => x.memoryId)).toEqual(a.assignments.map((x) => x.memoryId));
    expect(b.assignments.some((x) => x.slot.label === 'desk')).toBe(true);
  });
});

describe('arcSlots', () => {
  it('respects the viewer heading', () => {
    const facingRight: ViewerPose = { position: [0, 1.2, 0], forward: [1, 0, 0] };
    const [mid] = arcSlots(1, facingRight);
    expect(mid.position[0]).toBeGreaterThan(1);
    expect(Math.abs(mid.position[2])).toBeLessThan(1e-6);
  });
});

describe('dedupeSurfaces', () => {
  it('keeps the labelled mesh when a plane duplicates the same table', async () => {
    const { dedupeSurfaces } = await import('../src/core/placement.js');
    const plane: Surface = { ...table, id: 'plane-1', kind: 'plane', label: '' , center: [0.05, 0.75, -1.12] };
    const out = dedupeSurfaces([plane, table, wallFront]);
    expect(out.map((s) => s.id).sort()).toEqual(['table', 'wall-front']);
  });
});

describe('label diversity', () => {
  it('prefers a new kind of object over a second couch', () => {
    const couch2: Surface = { ...couch, id: 'couch-2', center: [1.7, 0.85, -2.1] };
    const lamp: Surface = { ...table, id: 'lamp', label: 'lamp', center: [-1.2, 1.3, -1.6], extent: [0.3, 0.3] };
    const plan = planPlacement(PLANETS.items.slice(0, 3), [couch, couch2, lamp, table], seated);
    const labels = plan.assignments.map((a) => a.slot.label).sort();
    expect(labels).toEqual(['couch', 'lamp', 'table']);
  });
});
