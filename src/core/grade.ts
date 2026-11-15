/**
 * Offline explain-back grading. When the Architect is unreachable the learner
 * still gets an honest, if blunter, verdict: a stage counts as explained when
 * enough of its key words (by a rough stem) show up in what they wrote.
 */
const STOP = new Set(
  'the a an and or but of to in on at by for from with into onto than then that this these those is are was were be been being it its as which who whom what when where why how there their they them you your our we he she his her not no can could will would should may might must does did do has have had also very more most less each other such only own same so too just about over under between through during before after above below again further once here all any both few some'.split(' '),
);

/** A crude stem: lower-case, accents off, first 5 letters of a word. */
function stems(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
    .map((w) => w.slice(0, 5));
}

export interface OfflineGrade {
  hit: number[];
  missed: number[];
  misconception: string;
  feedback: string;
}

export function gradeOffline(stages: { cue: string; answer: string }[], explanation: string): OfflineGrade {
  const said = new Set(stems(explanation));
  const hit: number[] = [];
  const missed: number[] = [];
  stages.forEach((st, i) => {
    const key = [...new Set(stems(`${st.cue} ${st.answer}`))];
    const found = key.filter((k) => said.has(k)).length;
    (key.length && (found >= 3 || found / key.length >= 0.4) ? hit : missed).push(i);
  });
  const first = missed[0];
  const feedback = !hit.length
    ? 'Try again in your own words, one stage after another.'
    : first === undefined
      ? 'You covered every stage.'
      : `You covered ${hit.length} of ${stages.length} stages. Add ${stages[first].cue.toLowerCase()} next.`;
  return { hit, missed, misconception: '', feedback };
}
