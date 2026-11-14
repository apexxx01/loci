/**
 * Runtime validation for anything that crosses a trust boundary: localStorage,
 * share links, the handoff API and AI output. Nothing unvalidated reaches the
 * scene.
 */
import { z } from 'zod';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const quat = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const MemoryItemSchema = z.object({
  id: z.string().min(1).max(80),
  cue: z.string().min(1).max(80),
  answer: z.string().min(1).max(200),
  scene: z.string().max(240),
  glyphs: z.array(z.string().min(1).max(16)).min(1).max(3),
  order: z.number().int().min(0).max(999),
});

export const DeckSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(60),
  subtitle: z.string().max(120),
  ordered: z.boolean(),
  source: z.enum(['starter', 'handoff', 'architect', 'shared']),
  items: z.array(MemoryItemSchema).min(1).max(24),
});

export const StoredCardSchema = z.object({
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  scheduled_days: z.number(),
  reps: z.number(),
  lapses: z.number(),
  learning_steps: z.number(),
  state: z.number().int().min(0).max(3),
  last_review: z.string().optional(),
});

export const PalaceSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  deck: DeckSchema,
  createdAt: z.string(),
  placements: z.array(
    z.object({
      memoryId: z.string(),
      label: z.string(),
      pose: z.object({ p: vec3, q: quat, s: z.number().min(0.1).max(5).optional() }),
      onTop: z.boolean().optional(),
    }),
  ),
  cards: z.record(z.string(), StoredCardSchema),
  history: z.array(
    z.object({
      memoryId: z.string(),
      at: z.string(),
      rating: z.enum(['again', 'hard', 'good']),
    }),
  ).max(5000),
});

/** What the Palace Architect is allowed to return. */
export const ArchitectItemSchema = z.object({
  cue: z.string().min(1).max(80),
  answer: z.string().min(1).max(200),
  scene: z.string().min(8).max(240),
  glyphs: z.array(z.string().min(1).max(16)).min(1).max(3),
});

export const ArchitectDeckSchema = z.object({
  title: z.string().min(1).max(60),
  ordered: z.boolean(),
  items: z.array(ArchitectItemSchema).min(1).max(24),
});

export type ArchitectDeck = z.infer<typeof ArchitectDeckSchema>;
