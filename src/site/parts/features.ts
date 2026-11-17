import receipts from '../../../public/receipts.json';
/**
 * Everything Loci does, written down once, so the page tells the whole truth
 * about the product: what runs in the headset, what the Palace Architect does
 * on the server, who it is for, the receipts, and what is planned but not
 * built. `verified` marks features the mixed-reality end-to-end suite checks.
 */

export interface Feature {
  title: string;
  group: string;
  text: string;
  verified?: string;
  /** Position in the constellation, 0..100. */
  at: [number, number];
}

export const HEADSET: Feature[] = [
  {
    title: 'Reads your room', group: 'Placing', at: [8, 48],
    text: 'Loci uses the headset’s scene understanding, the surfaces Space Setup has already labelled as table, couch, shelf, screen and more, to find real places to put things.',
    verified: 'Emulator test: 8 memories on 8 different objects.',
  },
  {
    title: 'One memory, one object', group: 'Placing', at: [14, 30],
    text: 'Each memory gets an object of its own. Duplicate surfaces and spots hidden behind furniture are skipped, and the walk runs left to right so your eyes sweep the room in order.',
    verified: 'Emulator test: wall art, plant, window, lamp, table, couch, shelf, screen.',
  },
  {
    title: 'Sized for the distance', group: 'Placing', at: [29, 17],
    text: 'Memories on far objects are drawn larger, so every one reads the same from your chair.',
  },
  {
    title: 'Stays where it landed', group: 'Remembering the room', at: [50, 12],
    text: 'The palace is saved against a persistent anchor in your room. Take the headset off; tomorrow every memory is back on its object.',
    verified: 'Emulator test: restored with 0.0000 m of drift.',
  },
  {
    title: 'Notices a changed room', group: 'Remembering the room', at: [71, 17],
    text: 'On your return it checks the objects still match. If you have moved or rearranged, it re-fits the palace to the furniture that is there now instead of leaving memories floating.',
  },
  {
    title: 'Study first', group: 'Learning', at: [86, 30],
    text: 'A new memory opens on its study face: the fact, and a small strange scene that happens on that very object. Picture it there once.',
  },
  {
    title: 'Pinch to peek', group: 'Recalling', at: [92, 48],
    text: 'Remember first. Then pinch the memory to flip it: the cue, the picture as a hint, then the answer.',
    verified: 'Emulator test: a still pinch flips the tile.',
  },
  {
    title: 'Lift it if you knew it', group: 'Recalling', at: [86, 66],
    text: 'Hold the memory and raise it if you knew it, or lower it to see it again in a few minutes. Using the hint counts as a harder recall. Every rating goes into the schedule.',
    verified: 'Emulator test: raising records a recall; lowering brings it back within minutes.',
  },
  {
    title: 'Guided by light', group: 'Recalling', at: [71, 79],
    text: 'The next memory to recall pulses gently. When it is outside your view, a small chevron at the edge of your vision points the way.',
  },
  {
    title: 'Recall without words', group: 'Mastering', at: [50, 84],
    text: 'Once a memory is strong, its words fade and only the place prompts you, which is how the method is meant to work.',
  },
  {
    title: 'Comfort and access', group: 'For every body', at: [29, 79],
    text: 'Look to select runs the whole loop by looking alone: the panel, a concept, every stage, even rebuilding the chain. On Meta VR Glasses your eyes aim and a pinch from either hand selects. There is high contrast, larger tiles, calm motion, read-aloud and a sound switch, all on the panel in your room.',
  },
  {
    title: 'A library of palaces', group: 'Keeping', at: [14, 66],
    text: 'Keep up to 12 palaces and switch between them from the panel. The first time, a four-step coach teaches the whole loop one instruction at a time.',
  },
];

export const PIPELINE: { title: string; text: string }[] = [
  { title: 'Your words', text: 'Notes, a topic, a speech, a list of words or names. Up to 12 memories at a time. Numbers never leave your device.' },
  { title: 'Three models, one answer', text: 'Gemini writes the palace as structured data. If it has not answered in 3.5 seconds, a backup model starts in parallel and the first good answer wins.' },
  { title: 'Every line checked', text: 'A rule-based check reads each picture and rejects brands, adult words, and any name that is not in your own notes. A failed picture is replaced with a plain one.' },
  { title: 'You decide', text: 'You see every memory before it reaches your room, and can remove any of them.' },
  { title: 'Woven into your room', text: 'Once placed, each picture is rewritten around what its object does: a lamp heats, a couch sinks, a window fogs.' },
];

/** Real output from the live Palace Architect (room weaving), saved 15 Nov 2026. */
export const WEAVE = {
  cue: 'Saturn',
  answer: '6th planet, famous rings, light enough to float in water',
  scene: 'A ringed ball bobbing happily in a bathtub like a rubber duck.',
  model: 'gemini-3.6-flash',
  ms: 9256,
  scenes: {
    lamp: 'Your lamp shines intense heat onto a ringed ball, melting it so it bobs happily like a rubber duck in liquid light.',
    couch: 'Your couch sinks deep with a squeak as a heavy ringed ball bobs happily on its cushions like a rubber duck.',
    window: 'Your window fogs up until a ringed ball bobs happily against the warm glass like a rubber duck in a bath.',
    shelf: 'Your shelf tips over, spilling warm water where a ringed ball bobs happily like a rubber duck among the fallen books.',
    plant: 'Your plant grows wild vines that drip water into a basin where a ringed ball bobs happily like a rubber duck.',
    door: 'Your door swings open and knocks against a ringed ball, sending it bobbing happily like a rubber duck in a puddle.',
  } as Record<string, string>,
};

export const AUDIENCES: { who: string; text: string }[] = [
  { who: 'Students', text: 'Revision notes become a room you can walk through in your head during the exam. Topic mode teaches from nothing.' },
  { who: 'Children', text: 'Written for a child keeps the words short and the pictures silly, and every line passes the same safety check.' },
  { who: 'Language learners', text: 'Each word gets a picture that sounds like it, and read-aloud says it for you.' },
  { who: 'Speakers', text: 'A talk or a toast becomes one sweep around the room, so the next point is always where you left it.' },
  { who: 'New faces', text: 'Names mode, for a new job, a new class or a family gathering. The picture comes from how the name sounds.' },
  { who: 'Anyone who sits', text: 'Made for sitting still. Look to select means no pinching or lifting is ever required.' },
];

/**
 * Numbers from real runs, read from public/receipts.json, which
 * `node scripts/receipts.mjs` writes from the test, e2e, matrix and Architect
 * runs. Nothing here is typed by hand, so the site cannot drift from them.
 */
const R = receipts;
const fmt = (n: number) => n.toLocaleString('en-US');
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
export const RECEIPTS: { n: string; unit?: string; text: string }[] = [
  { n: String(R.tests), text: `unit tests passing in ${R.testFiles} files, across placement, scheduling, concepts, safety, sharing, the library and per-frame allocation` },
  { n: fmt(R.placementProperty.rooms), text: 'random rooms in the placement property test: every memory placed, spaced apart, within a seated turn and never behind you' },
  { n: String(R.e2eConcept.passed), unit: `/${R.e2eConcept.checks}`, text: 'concept checks passing in the Immersive Web Emulator, from picking a topic to restoring the palace' },
  {
    n: String(R.roomMatrix.syntheticRoomsAllPassed),
    unit: `/${R.roomMatrix.syntheticRooms}`,
    text: `synthetic emulator rooms passing every concept check on the first try, with ${R.roomMatrix.stagesOnSurfaces} of ${R.roomMatrix.stagesOnSurfaces + R.roomMatrix.stagesOnArc} stages on the room’s own furniture and walls`,
  },
  {
    n: String(R.architect.passed),
    unit: `/${R.architect.topics}`,
    text: `topics taught by the live Palace Architect in our test run, median ${secs(R.architect.medianWallMs)} each, with ${R.architect.mythChecks} of ${R.architect.stages} stages keeping a myth check`,
  },
  {
    n: String(R.e2eRuns.lookOnly.passed),
    unit: `/${R.e2eRuns.lookOnly.checks}`,
    text: 'look-only checks passing in the emulator: the panel, a concept, a stage, its myth check and the whole chain, with no hands at all',
  },
  {
    n: String(R.e2eRuns.dayAfter.passed),
    unit: `/${R.e2eRuns.dayAfter.checks}`,
    text: 'day-after checks: four days on, every stage is back in the same spot, the due ones are awake, and the panel says how many are waiting',
  },
  {
    n: String(R.e2eRuns.glasses.passed),
    unit: `/${R.e2eRuns.glasses.checks}`,
    text: 'checks passing on the emulator’s Meta VR Glasses profile: gaze plus a pinch from either hand, and the panel fits the glasses’ narrower view',
  },
  { n: '0', text: 'accounts. Palaces and progress stay in your browser, and share links carry the palace inside the link itself' },
];

export const ROADMAP: { when: 'Now' | 'Next' | 'Later'; items: string[] }[] = [
  { when: 'Now', items: ['Palaces in your own room, anchored and restored', 'The Palace Architect, with six ways in', 'Recall from any screen on the same schedule', 'Comfort and access on the panel', 'Gaze and pinch on Meta VR Glasses', 'Calendar reminders for your next three walks'] },
  { when: 'Next', items: ['Snap a textbook page and get a palace', 'Speak your notes instead of typing them', 'Class sets: one link from a teacher, built in every student’s own room'] },
  { when: 'Later', items: ['Palaces that walk through every room of your home', 'Sync between your devices', 'Each memory humming softly from where it rests'] },
];
