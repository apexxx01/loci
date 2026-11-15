#!/usr/bin/env node
/**
 * Writes public/receipts.json from real runs, so every number Loci shows can
 * be traced to a command:
 *
 *   tests, testFiles   `npx vitest run` (JSON reporter), run by this script
 *   placementProperty  the stats line printed by tests/placement-property.test.ts
 *   e2eConcept         parsed from .tmp/e2e-concept.log if present, e.g. from
 *                        python3 scripts/e2e-concept.py | tee .tmp/e2e-concept.log
 *   architect          docs/architect-eval.json, written by scripts/eval-architect.mjs
 *
 * Then compares the numbers with RECEIPTS in src/site/parts/features.ts and
 * warns about any that disagree. Exit code 1 if a unit test failed.
 *
 *   node scripts/receipts.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = (p) => resolve(ROOT, p);
mkdirSync(at('.tmp'), { recursive: true });

/* ---------- unit tests ---------- */
const VITEST_JSON = at('.tmp/vitest.json');
const run = spawnSync('npx', ['vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${VITEST_JSON}`], {
  cwd: ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const out = `${run.stdout}\n${run.stderr}`;
if (!existsSync(VITEST_JSON)) {
  console.error(out);
  console.error('vitest did not write its JSON report');
  process.exit(1);
}
const vt = JSON.parse(readFileSync(VITEST_JSON, 'utf8'));
const tests = {
  total: vt.numTotalTests,
  passed: vt.numPassedTests,
  failed: vt.numFailedTests,
  files: vt.testResults.length,
  success: Boolean(vt.success),
};

const prop = out.match(/placement-property (\{.*\})/);
const placementProperty = prop ? JSON.parse(prop[1]) : undefined;

/* ---------- concept e2e (optional) ---------- */
let e2eConcept;
const E2E_LOG = at('.tmp/e2e-concept.log');
if (existsSync(E2E_LOG)) {
  const log = readFileSync(E2E_LOG, 'utf8');
  const m = [...log.matchAll(/(\d+)\/(\d+) checks passed/g)].pop();
  const ranAt = log.match(/^ranAt:\s*(.+)$/m);
  const drift = log.match(/max restore drift ([\d.]+) m/);
  if (m)
    e2eConcept = {
      checks: Number(m[2]),
      passed: Number(m[1]),
      ranAt: ranAt ? ranAt[1].trim() : statSync(E2E_LOG).mtime.toISOString(),
      ...(drift ? { maxRestoreDriftM: Number(drift[1]) } : {}),
    };
}

/* ---------- architect eval (optional) ---------- */
let architect;
const EVAL = at('docs/architect-eval.json');
if (existsSync(EVAL)) {
  const { summary: s } = JSON.parse(readFileSync(EVAL, 'utf8'));
  architect = {
    passRate: Number(s.passRate.toFixed(4)),
    passed: s.passed,
    topics: s.topics,
    medianMs: s.medianServerMs,
    medianWallMs: s.medianWallMs,
    medianStages: s.medianStages,
    mythChecks: s.mythChecksTotal,
    stages: s.stagesTotal,
    ranAt: s.startedAt,
    command: s.command,
  };
}

const receipts = {
  generatedAt: new Date().toISOString(),
  command: 'node scripts/receipts.mjs',
  tests: tests.passed,
  testsTotal: tests.total,
  testsFailed: tests.failed,
  testFiles: tests.files,
  ...(placementProperty ? { placementProperty } : {}),
  ...(e2eConcept ? { e2eConcept } : {}),
  ...(architect ? { architect } : {}),
};
writeFileSync(at('public/receipts.json'), JSON.stringify(receipts, null, 2) + '\n');
console.log(JSON.stringify(receipts, null, 2));
console.log('wrote public/receipts.json');

/* ---------- compare with what the website says ---------- */
const src = readFileSync(at('src/site/parts/features.ts'), 'utf8');
const block = src.slice(src.indexOf('export const RECEIPTS'), src.indexOf('];', src.indexOf('export const RECEIPTS')));
const shown = [...block.matchAll(/n:\s*'([^']*)'(?:,\s*unit:\s*'([^']*)')?,\s*text:\s*'([^']*)'/g)].map((m) => ({ n: m[1], unit: m[2], text: m[3] }));
const warn = [];
const find = (re) => shown.find((r) => re.test(r.text));
const ut = find(/unit tests/);
if (ut && Number(ut.n.replace(/,/g, '')) !== tests.passed) warn.push(`site says ${ut.n} unit tests, run has ${tests.passed}`);
if (e2eConcept) {
  const e = find(/emulator/i);
  if (e && `${e.n}${e.unit ?? ''}` !== `${e2eConcept.passed}/${e2eConcept.checks}`) warn.push(`site says ${e.n}${e.unit ?? ''} e2e checks, log has ${e2eConcept.passed}/${e2eConcept.checks}`);
}
if (architect) {
  const a = find(/Architect/);
  if (a && `${a.n}${a.unit ?? ''}` !== `${architect.passed}/${architect.topics}`) warn.push(`site says ${a.n}${a.unit ?? ''} Architect topics, eval has ${architect.passed}/${architect.topics}`);
}
for (const w of warn) console.warn(`warning: ${w} (update RECEIPTS in src/site/parts/features.ts)`);
process.exit(tests.success ? 0 : 1);
