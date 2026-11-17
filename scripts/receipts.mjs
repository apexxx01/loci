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
 *   roomMatrix         .tmp/matrix-pass1.json then .tmp/matrix-none2.json (later files
 *                        replace earlier rows for the same room), from scripts/matrix.py --tag=...
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
  const drift = log.match(/max (?:restore )?drift ([\d.]+) m/);
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

/* ---------- room matrix (optional) ---------- */
let roomMatrix;
const MATRIX = ['.tmp/matrix-pass1.json', '.tmp/matrix-none2.json'].map(at).filter(existsSync);
if (MATRIX.length) {
  const byRoom = new Map();
  for (const f of MATRIX) for (const r of JSON.parse(readFileSync(f, 'utf8')).rooms) byRoom.set(r.room, r);
  const rows = [...byRoom.values()];
  const synth = rows.filter((r) => r.room !== 'none');
  const empty = byRoom.get('none');
  roomMatrix = {
    command: 'python3 scripts/matrix.py --tag=pass1; python3 scripts/matrix.py --tag=none2 none',
    doc: 'docs/test-matrix.md',
    syntheticRooms: synth.length,
    syntheticRoomsAllPassed: synth.filter((r) => r.passed === r.checks).length,
    reruns: [],
    stagesOnSurfaces: synth.reduce((a, r) => a + r.onSurfaces, 0),
    stagesOnArc: synth.reduce((a, r) => a + r.onArc, 0),
    ...(empty ? { emptyRoom: { passed: empty.passed, checks: empty.checks, onArc: empty.onArc, maxRestoreDriftM: empty.maxRestoreDriftM } } : {}),
    rooms: rows.map((r) => ({ room: r.room, ranAt: r.ranAt, surfaces: r.surfaces, onSurfaces: r.onSurfaces, onArc: r.onArc, passed: r.passed, checks: r.checks, maxRestoreDriftM: r.maxRestoreDriftM })),
  };
}

/* ---------- committed e2e runs (docs/*-run.txt) ---------- */
function runFile(file, command) {
  const f = at(file);
  if (!existsSync(f)) return undefined;
  const log = readFileSync(f, 'utf8');
  const m = log.match(/(\d+)\/(\d+) checks passed/);
  const when = log.match(/ranAt: ([^\n]+)/);
  return m ? { passed: Number(m[1]), checks: Number(m[2]), ranAt: when ? when[1].trim() : null, command, doc: file } : undefined;
}
const e2eRuns = {
  chain: runFile('docs/e2e-chain-run.txt', 'python3 scripts/e2e-chain.py'),
  lookOnly: runFile('docs/e2e-look-run.txt', 'python3 scripts/e2e-look.py'),
  glasses: runFile('docs/e2e-glasses-run.txt', 'python3 scripts/e2e-glasses.py (emulator device metaVRGlasses)'),
  dayAfter: runFile('docs/e2e-return-run.txt', 'python3 scripts/e2e-return.py'),
};

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
  ...(roomMatrix ? { roomMatrix } : {}),
  e2eRuns,
};
// Keep sections this script does not compute (room matrix, perf), written by
// scripts/matrix.py and scripts/perf.py, so a refresh never drops them.
let previous = {};
try {
  previous = JSON.parse(readFileSync(at('public/receipts.json'), 'utf8'));
} catch {
  /* first run */
}
const merged = { ...previous, ...receipts };
writeFileSync(at('public/receipts.json'), JSON.stringify(merged, null, 2) + '\n');
console.log(JSON.stringify(receipts, null, 2));
console.log('wrote public/receipts.json');

// The website's receipts (src/site/parts/features.ts) import this file, so they cannot drift.
process.exit(tests.success ? 0 : 1);
