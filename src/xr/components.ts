import { createComponent, Types } from '@iwsdk/core';

export const TileFace = { Cue: 0, Hint: 1, Answer: 2 } as const;

/** One memory living on a real surface. */
export const MemoryTile = createComponent('MemoryTile', {
  memoryId: { type: Types.String, default: '' },
  face: { type: Types.Int8, default: TileFace.Cue },
  due: { type: Types.Boolean, default: true },
  usedHint: { type: Types.Boolean, default: false },
  /** Seconds remaining on the success/fail flash. */
  flash: { type: Types.Float32, default: 0 },
  /** 1 = success, -1 = again. */
  flashKind: { type: Types.Int8, default: 0 },
  /** Seconds until the arrival animation finishes (0 = settled). */
  arrive: { type: Types.Float32, default: 0 },
});
