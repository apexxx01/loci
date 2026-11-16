import { describe, expect, it } from 'vitest';
import { gradePrompt, teachPrompt, vetConceptOutput, vetGrade } from '../src/core/architect.js';
import { CONCEPTS, conceptById } from '../src/core/concepts.js';
import { gradeOffline } from '../src/core/grade.js';
import { checkMnemonic } from '../src/core/safety.js';
import { DeckSchema, PalaceSchema } from '../src/core/schema.js';

describe('ready-made concepts', () => {
  it('ships six concepts that pass the deck schema', () => {
    expect(CONCEPTS).toHaveLength(6);
    for (const d of CONCEPTS) expect(DeckSchema.safeParse(d).success, d.id).toBe(true);
  });

  it('teaches every stage: claim, why, scene, a two-sided check, and a link to the next', () => {
    for (const d of CONCEPTS) {
      expect(d.kind).toBe('concept');
      expect(d.ordered).toBe(true);
      expect(d.items.length).toBeGreaterThanOrEqual(5);
      d.items.forEach((it, i) => {
        expect(it.order).toBe(i);
        expect(it.why && it.why.length > 20, `${it.id} why`).toBe(true);
        expect(it.check?.wrong && it.check.right && it.check.wrong !== it.check.right, `${it.id} check`).toBeTruthy();
        const last = i === d.items.length - 1;
        expect(Boolean(it.link), `${it.id} link`).toBe(!last);
      });
    }
  });

  it('keeps every picture within the safety rules', () => {
    for (const d of CONCEPTS)
      for (const it of d.items) {
        const verdict = checkMnemonic(it.scene, `${it.cue} ${it.answer} ${it.why}`);
        expect(verdict.ok, `${it.id}: ${verdict.reasons.join(', ')}`).toBe(true);
      }
  });

  it('has unique ids and can be found by id', () => {
    const ids = CONCEPTS.flatMap((d) => d.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(conceptById('concept-heart')?.title).toBe('How your heart pumps blood');
  });

  it('old palaces without concept fields still load', () => {
    const old = {
      version: 1, id: 'p1', createdAt: new Date().toISOString(), placements: [], cards: {}, history: [],
      deck: { id: 'd', title: 'Planets', subtitle: '', ordered: true, source: 'starter', items: [{ id: 'd:0', cue: 'Mercury', answer: 'first', scene: 'x', glyphs: ['\u{1FA90}'], order: 0 }] },
    };
    expect(PalaceSchema.safeParse(old).success).toBe(true);
  });
});

const stage = (n: number) => ({
  cue: `Stage ${n}`,
  answer: `Claim number ${n} about pumps.`,
  why: `Because of reason ${n}.`,
  scene: `A bright spinning wheel number ${n} rolls across the floor.`,
  glyphs: ['\u{2728}'],
  wrong: `A false belief number ${n}.`,
  right: `The true statement number ${n}.`,
  link: n < 3 ? 'leads to' : '',
});

describe('teach mode vetting', () => {
  it('builds an ordered concept deck with checks and links', () => {
    const r = vetConceptOutput({ title: 'How pumps work', stages: [0, 1, 2, 3].map(stage) }, 'pumps', 'cx_1');
    expect(r).not.toBeNull();
    expect(r!.deck.kind).toBe('concept');
    expect(r!.deck.ordered).toBe(true);
    expect(r!.deck.items[0].check?.wrong).toContain('false belief');
    expect(r!.deck.items[3].link).toBeUndefined();
    expect(DeckSchema.safeParse(r!.deck).success).toBe(true);
  });

  it('replaces an unsafe picture and drops an unsafe check', () => {
    const bad = { ...stage(0), scene: 'A famous soda brand called pepsi explodes over the floor.', wrong: 'Drink beer to pump faster.' };
    const r = vetConceptOutput({ title: 'Pumps', stages: [bad, stage(1), stage(2)] }, 'pumps', 'cx_2')!;
    expect(r.repaired).toBe(1);
    expect(r.deck.items[0].scene).not.toContain('pepsi');
    expect(r.deck.items[0].check).toBeUndefined();
  });

  it('rejects too few stages and malformed output', () => {
    expect(vetConceptOutput({ title: 'x', stages: [stage(0), stage(1)] }, 'x', 'c')).toBeNull();
    expect(vetConceptOutput('nope', 'x', 'c')).toBeNull();
  });

  it('puts the learner text in the prompt, cleaned', () => {
    expect(teachPrompt('how tides work', 'child')).toContain('how tides work');
    expect(teachPrompt('how tides work')).toContain('misconception');
  });
});

describe('explain-back grading', () => {
  const stages = CONCEPTS[0].items.map((i) => ({ cue: i.cue, answer: i.answer }));

  it('makes every stage appear exactly once', () => {
    const g = vetGrade({ hit: [0, 0, 2, 99], missed: [1], misconception: '', feedback: 'You explained the start well.' }, stages, 'blood comes back');
    expect(g!.hit).toEqual([0, 2]);
    expect(g!.missed).toEqual([1, 3, 4, 5]);
  });

  it('strips feedback that breaks the safety rules', () => {
    const g = vetGrade({ hit: [], missed: [], misconception: 'Like a Nike shoe.', feedback: 'ok' }, stages, 'x');
    expect(g!.misconception).toBe('');
  });

  it('offline grading counts stages whose key words appear', () => {
    const g = gradeOffline(stages, 'Oxygen-poor blood comes back from the body into the right atrium. Then valves snap shut so blood flows forward only.');
    expect(g.hit).toContain(0);
    expect(g.hit).toContain(5);
    expect(g.missed).toContain(2);
    expect(g.hit.length + g.missed.length).toBe(stages.length);
  });

  it('builds a grading prompt that lists numbered stages', () => {
    const p = gradePrompt('Heart', stages, 'my explanation');
    expect(p).toContain('0. Used blood comes home');
    expect(p).toContain('my explanation');
  });
});

describe('fact-check pass', () => {
  const stages = CONCEPTS[0].items.map((i) => ({ cue: i.cue, answer: i.answer, why: i.why, myth: i.check?.wrong, fact: i.check?.right }));
  it('keeps in-range, unique flags only', async () => {
    const { vetVerify } = await import('../src/core/architect.js');
    const flags = vetVerify({ flags: [{ index: 1, issue: 'The right ventricle sends blood to the lungs, not the body.' }, { index: 1, issue: 'duplicate one here' }, { index: 40, issue: 'out of range one' }] }, stages);
    expect(flags.map((f) => f.index)).toEqual([1]);
  });
  it('returns nothing for malformed output', async () => {
    const { vetVerify } = await import('../src/core/architect.js');
    expect(vetVerify('nope', stages)).toEqual([]);
  });
  it('builds a prompt with every stage and its myth', async () => {
    const { verifyPrompt } = await import('../src/core/architect.js');
    const p = verifyPrompt('Heart', stages);
    expect(p).toContain('0. Used blood comes home');
    expect(p).toContain('myth: Blood without oxygen is blue.');
  });
});
