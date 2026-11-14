/**
 * Pure data model for Loci. Nothing in src/core may import IWSDK, Three.js or
 * the DOM, so every rule here is unit-testable in Node.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/** A single thing to remember, plus the mnemonic that makes it stick. */
export interface MemoryItem {
  id: string;
  /** Cue shown on the tile front, e.g. "Mercury". */
  cue: string;
  /** What the learner must recall, e.g. "1st planet, closest to the Sun". */
  answer: string;
  /** Vivid image sentence tying cue to answer (bound to its room object once placed). */
  scene: string;
  /** The room-independent scene, kept so a re-fit can bind to new objects. */
  baseScene?: string;
  /** Emoji glyphs (1–3) composed on the tile. */
  glyphs: string[];
  /** Position in an ordered list (0-based). */
  order: number;
}

export type DeckSource = 'starter' | 'handoff' | 'architect' | 'shared';

export interface Deck {
  id: string;
  title: string;
  subtitle: string;
  /** Ordered decks get a walk route; unordered decks are placed by fit. */
  ordered: boolean;
  source: DeckSource;
  items: MemoryItem[];
}

export type SurfaceKind = 'plane' | 'mesh' | 'virtual';
export type SurfaceOrientation = 'horizontal' | 'vertical';

/**
 * A real-world surface reduced to what placement needs. Positions are in the
 * same frame as the viewer pose passed to the solver.
 */
export interface Surface {
  id: string;
  kind: SurfaceKind;
  /** Lower-case semantic label from the runtime ("table", "wall", ...), or "". */
  label: string;
  orientation: SurfaceOrientation;
  /** Centre of the usable face (top face for furniture, face centre for walls). */
  center: Vec3;
  /** Unit normal of the usable face (up for horizontal, outward for walls). */
  normal: Vec3;
  /** Width × depth (horizontal) or width × height (vertical), metres. */
  extent: [number, number];
}

export interface ViewerPose {
  position: Vec3;
  /** Unit vector the viewer faces, projected onto the floor plane. */
  forward: Vec3;
}

/** A spot where one memory tile can live. */
export interface Slot {
  id: string;
  surfaceId: string;
  label: string;
  position: Vec3;
  /** Direction the tile face should point (towards the viewer). */
  facing: Vec3;
  /** Distance from the viewer, metres. */
  distance: number;
  /** Signed yaw from viewer forward, radians (left negative, right positive). */
  yaw: number;
  /** True when the tile hovers above a horizontal surface (draws a tether down). */
  onTop: boolean;
}

export interface PlacementPlan {
  /** memoryId -> slot, in route order. */
  assignments: { memoryId: string; slot: Slot }[];
  /** True when no real surfaces were usable and the virtual arc was used. */
  usedFallback: boolean;
  /** Distinct real surfaces used (diversity is what makes loci memorable). */
  surfacesUsed: number;
}

/** Pose relative to the persistent anchor group. */
export interface LocalPose {
  p: Vec3;
  q: Quat;
  /** Uniform tile scale (legibility at distance). */
  s?: number;
}

export interface Placement {
  memoryId: string;
  label: string;
  pose: LocalPose;
  /** Sits on top of a horizontal surface (draws a tether). */
  onTop?: boolean;
}

/** FSRS card, serialised (dates as ISO strings). */
export interface StoredCard {
  due: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  state: number;
  last_review?: string;
}

export interface ReviewEvent {
  memoryId: string;
  at: string;
  rating: 'again' | 'hard' | 'good';
}

export interface Palace {
  version: 1;
  id: string;
  deck: Deck;
  createdAt: string;
  placements: Placement[];
  cards: Record<string, StoredCard>;
  history: ReviewEvent[];
}
