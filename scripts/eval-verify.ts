/**
 * Fact-check eval against the live API: the six shipped concepts as written
 * (they should come back clean), then each with one planted error on a known
 * stage (it should be flagged, on that stage). Writes docs/verify-eval.md.
 *
 *   npx vite-node scripts/eval-verify.ts
 */
import { writeFileSync } from 'node:fs';
import { CONCEPTS, LOCI_METHOD } from '../src/core/concepts.js';

const API = 'https://loci-vr.vercel.app/api/architect';
// One false claim per concept, on the stage given.
const PLANTED: Record<string, [number, string]> = {
  'concept-heart': [4, 'The left ventricle is the weakest chamber and only pumps blood back to the lungs.'],
  'concept-plants': [4, 'The oxygen plants release comes from the carbon dioxide they take in.'],
  'concept-seasons': [4, 'Earth is closest to the Sun in early July, during northern summer.'],
  'concept-vaccine': [2, 'Antibodies are made by red blood cells and fit every germ equally well.'],
  'concept-water': [2, 'Clouds are made of invisible water vapour, not droplets.'],
  'concept-method': [3, 'Making a palace in a virtual room gives no measurable benefit over studying flat flashcards.'],
  'concept-pr': [2, 'Opening a pull request immediately merges the change into the main branch.'],
  'concept-web': [0, 'Your browser finds a website by sending its name directly to every computer on the internet.'],
};

type Flag = { index: number; issue: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function verify(title: string, stages: unknown[]): Promise<{ flags: Flag[]; ms: number; model: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'verify', title, stages }) });
    if (r.status === 429) {
      await sleep(30_000);
      continue;
    }
    const d = (await r.json()) as { flags?: Flag[]; ms?: number; model?: string };
    return { flags: d.flags ?? [], ms: d.ms ?? 0, model: d.model ?? '?' };
  }
  throw new Error('rate limited');
}

const rows: string[] = [];
let cleanPass = 0, caught = 0, onStage = 0;
const ms: number[] = [];
const DECKS = [...CONCEPTS, LOCI_METHOD];
for (const deck of DECKS) {
  const stages = deck.items.map((it) => ({ cue: it.cue, answer: it.answer, why: it.why, myth: it.check?.wrong, fact: it.check?.right }));
  const clean = await verify(deck.title, stages);
  ms.push(clean.ms);
  if (!clean.flags.length) cleanPass++;
  await sleep(3000);
  const [at, lie] = PLANTED[deck.id];
  const planted = stages.map((s, i) => (i === at ? { ...s, answer: lie } : s));
  const res = await verify(deck.title, planted);
  ms.push(res.ms);
  const hit = res.flags.length > 0;
  const right = res.flags.some((f) => f.index === at);
  if (hit) caught++;
  if (right) onStage++;
  rows.push(
    `| ${deck.title} | ${clean.flags.length ? `flagged ${clean.flags.map((f) => f.index).join(', ')}: ${clean.flags.map((f) => f.issue).join(' / ')}` : 'clean'} | stage ${at}: ${right ? 'caught on that stage' : hit ? `flagged other stage ${res.flags.map((f) => f.index).join(', ')}` : 'missed'} | ${res.flags.find((f) => f.index === at)?.issue ?? ''} |`,
  );
  console.log(deck.id, clean.flags.length, right);
  await sleep(3000);
}
ms.sort((a, b) => a - b);
const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
writeFileSync(
  'docs/verify-eval.md',
  `# Fact-check eval\n\nRun ${when} IST against ${API} with \`npx vite-node scripts/eval-verify.ts\`.\n\n` +
    `- Shipped concepts passing clean: **${cleanPass} of ${DECKS.length}**\n` +
    `- Planted errors flagged: **${caught} of ${DECKS.length}**, on the planted stage: **${onStage} of ${DECKS.length}**\n` +
    `- Median server time: **${ms[Math.floor(ms.length / 2)]} ms**\n\n` +
    `| Concept | As shipped | With one planted error | What it said |\n|---|---|---|---|\n${rows.join('\n')}\n`,
);
console.log({ cleanPass, caught, onStage });
