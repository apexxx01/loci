#!/usr/bin/env node
/**
 * Live evaluation of the Palace Architect's teach mode.
 *
 * Sends a fixed set of topics (science, history, finance, law, tech, everyday
 * how-things-work, one pasted set of notes, one child audience) to the
 * deployed API one at a time and records what came back. Writes:
 *   docs/architect-eval.md    human-readable table, medians, two full outputs
 *   docs/architect-eval.json  every raw result, for scripts/receipts.mjs
 *
 * The API allows about 20 requests per 10 minutes per IP. This script waits
 * 2 s between requests, never sends more than BUDGET requests in any rolling
 * 10-minute window, and backs off on 429.
 *
 *   node scripts/eval-architect.mjs [--url https://loci-vr.vercel.app/api/architect] [--limit N]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const URL_ = arg('url', 'https://loci-vr.vercel.app/api/architect');
const LIMIT = Number(arg('limit', '0')) || Infinity;

const GAP_MS = 2_000;
const WINDOW_MS = 10 * 60_000;
/** Server limit is 20 per window; stay well under it. */
const BUDGET = 14;
const REQUEST_TIMEOUT_MS = 90_000;
const BACKOFF_MS = [60_000, 120_000, 240_000];

const NOTES = `Water cycle notes (Year 9 geography)
- sun heats oceans/lakes -> evaporation, water vapour rises
- plants lose water from leaves = transpiration
- vapour cools higher up -> condenses on dust -> clouds
- droplets join, get heavy -> precipitation (rain, snow, hail)
- runoff over ground into rivers, some soaks in = infiltration -> groundwater
- rivers + groundwater flow back to sea, cycle repeats`;

export const TOPICS = [
  { id: 'vaccines', domain: 'science', audience: 'adult', topic: 'How a vaccine trains the immune system' },
  { id: 'photosynthesis', domain: 'science', audience: 'adult', topic: 'How photosynthesis turns sunlight into sugar' },
  { id: 'tectonics', domain: 'science', audience: 'teen', topic: 'How plate tectonics builds mountains' },
  { id: 'rome', domain: 'history', audience: 'adult', topic: 'How the Roman Republic became an empire' },
  { id: 'printing', domain: 'history', audience: 'adult', topic: 'How the printing press helped spread the Reformation' },
  { id: 'crash1929', domain: 'history / finance', audience: 'adult', topic: 'What caused the 1929 stock market crash' },
  { id: 'compound', domain: 'finance', audience: 'adult', topic: 'How compound interest grows savings over time' },
  { id: 'indexfund', domain: 'finance', audience: 'adult', topic: 'How an index fund works' },
  { id: 'upi', domain: 'finance / tech', audience: 'adult', topic: 'How a UPI payment moves money between two bank accounts' },
  { id: 'billlaw', domain: 'law', audience: 'adult', topic: 'How a bill becomes law in the Indian Parliament' },
  { id: 'contract', domain: 'law', audience: 'adult', topic: 'How a contract is formed: offer, acceptance and consideration' },
  { id: 'trial', domain: 'law', audience: 'adult', topic: 'What happens in a criminal case from arrest to verdict' },
  { id: 'https', domain: 'tech', audience: 'adult', topic: 'How HTTPS keeps a connection private' },
  { id: 'llm', domain: 'tech', audience: 'adult', topic: 'How a large language model predicts the next word' },
  { id: 'git', domain: 'tech', audience: 'adult', topic: 'How Git records and merges changes' },
  { id: 'fridge', domain: 'everyday', audience: 'adult', topic: 'How a refrigerator keeps food cold' },
  { id: 'toilet', domain: 'everyday', audience: 'adult', topic: 'How a flush toilet works' },
  { id: 'anc', domain: 'everyday', audience: 'adult', topic: 'How noise-cancelling headphones work' },
  { id: 'notes', domain: 'pasted notes', audience: 'teen', topic: NOTES },
  { id: 'sky', domain: 'science (child)', audience: 'child', topic: 'Why is the sky blue?' },
];
/** Full outputs shown verbatim in the report (first that succeeded wins). */
const EXAMPLES = ['sky', 'compound', 'vaccines', 'fridge'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sent = [];

async function budgetedPost(body) {
  for (let attempt = 0; ; attempt++) {
    // Rolling-window budget.
    const now = Date.now();
    while (sent.length && now - sent[0] >= WINDOW_MS) sent.shift();
    if (sent.length >= BUDGET) {
      const wait = WINDOW_MS - (now - sent[0]) + 1_000;
      console.log(`  budget: ${sent.length} requests in the last 10 min, waiting ${Math.round(wait / 1000)} s`);
      await sleep(wait);
      continue;
    }
    sent.push(Date.now());
    const t0 = performance.now();
    let status = 0;
    let data = null;
    let error = '';
    try {
      const res = await fetch(URL_, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      status = res.status;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        error = `non-JSON body: ${text.slice(0, 120)}`;
      }
    } catch (e) {
      error = e.name === 'TimeoutError' ? `client timeout after ${REQUEST_TIMEOUT_MS / 1000} s` : String(e.message || e);
    }
    const wallMs = Math.round(performance.now() - t0);
    if (status === 429 && attempt < BACKOFF_MS.length) {
      console.log(`  429, backing off ${BACKOFF_MS[attempt] / 1000} s`);
      await sleep(BACKOFF_MS[attempt]);
      continue;
    }
    return { status, data, error: error || (data && data.error) || '', wallMs, attempts: attempt + 1 };
  }
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

const ist = (d) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d) + ' IST';

async function main() {
  const startedAt = new Date();
  const info = await fetch(URL_).then((r) => r.json()).catch(() => null);
  console.log(`Architect eval against ${URL_}`);
  if (info) console.log(`  primary model ${info.model}, fallbacks ${info.fallbacks?.join(', ')}, thinking ${info.thinking}`);

  const results = [];
  const topics = TOPICS.slice(0, LIMIT);
  for (const [i, t] of topics.entries()) {
    if (i > 0) await sleep(GAP_MS);
    process.stdout.write(`[${i + 1}/${topics.length}] ${t.id} ... `);
    const r = await budgetedPost({ mode: 'teach', topic: t.topic, audience: t.audience });
    const deck = r.status === 200 && r.data && r.data.deck;
    const items = deck ? deck.items : [];
    const row = {
      id: t.id,
      domain: t.domain,
      audience: t.audience,
      topic: t.topic,
      ok: Boolean(deck && items.length >= 3),
      status: r.status,
      error: deck ? '' : r.error,
      stages: items.length,
      mythChecks: items.filter((it) => it.check).length,
      repaired: deck ? r.data.repaired ?? 0 : null,
      model: (r.data && r.data.model) || '',
      serverMs: (r.data && r.data.ms) ?? null,
      wallMs: r.wallMs,
      attempts: r.attempts,
      deck: deck || null,
    };
    results.push(row);
    console.log(row.ok ? `ok ${row.stages} stages, ${row.mythChecks} checks, ${row.model}, ${row.serverMs} ms` : `FAILED ${row.status} ${row.error}`);
  }
  const finishedAt = new Date();

  const ok = results.filter((r) => r.ok);
  const summary = {
    url: URL_,
    command: 'node scripts/eval-architect.mjs',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    startedAtIST: ist(startedAt),
    primaryModel: info?.model ?? null,
    fallbacks: info?.fallbacks ?? [],
    topics: results.length,
    passed: ok.length,
    passRate: results.length ? ok.length / results.length : 0,
    medianServerMs: median(ok.map((r) => r.serverMs).filter((x) => x != null)),
    medianWallMs: median(ok.map((r) => r.wallMs)),
    medianStages: median(ok.map((r) => r.stages)),
    stagesTotal: ok.reduce((a, r) => a + r.stages, 0),
    mythChecksTotal: ok.reduce((a, r) => a + r.mythChecks, 0),
    repairedTotal: ok.reduce((a, r) => a + (r.repaired || 0), 0),
    models: Object.fromEntries([...new Set(ok.map((r) => r.model))].map((m) => [m, ok.filter((r) => r.model === m).length])),
  };

  mkdirSync(resolve(ROOT, 'docs'), { recursive: true });
  writeFileSync(resolve(ROOT, 'docs/architect-eval.json'), JSON.stringify({ summary, results }, null, 2) + '\n');
  writeFileSync(resolve(ROOT, 'docs/architect-eval.md'), report(summary, results));
  console.log(`\npass ${ok.length}/${results.length}, median server ${summary.medianServerMs} ms, median wall ${summary.medianWallMs} ms`);
  console.log('wrote docs/architect-eval.md and docs/architect-eval.json');
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const short = (s, n = 70) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function report(s, results) {
  const pct = (x) => `${Math.round(x * 100)}%`;
  const lines = [];
  lines.push('# Palace Architect: live teach-mode evaluation', '');
  lines.push(`Run: ${s.startedAtIST} (${s.startedAt} UTC start, ${s.finishedAt} UTC end), against \`${s.url}\`.`, '');
  lines.push('Command:', '', '```sh', s.command, '```', '');
  lines.push(
    `Each topic was sent once as \`POST {mode: "teach", topic, audience}\`, one at a time, 2 s apart, ` +
      `with at most ${BUDGET} requests in any 10-minute window (the API allows about 20). ` +
      `Wall time is measured by the client and includes the network; server time is the \`ms\` the API reports. ` +
      `"Myth checks kept" counts stages whose misconception check survived the rule-based vetting ` +
      `(a check is dropped if either statement fails the safety filter or both say the same thing).`,
    '',
  );
  lines.push('## Summary', '');
  lines.push('| Measure | Value |', '| --- | --- |');
  lines.push(`| Topics | ${s.topics} |`);
  lines.push(`| Passed (deck with 3 or more stages) | ${s.passed} of ${s.topics} (${pct(s.passRate)}) |`);
  lines.push(`| Median stages per concept | ${s.medianStages ?? 'n/a'} |`);
  lines.push(`| Myth checks kept | ${s.mythChecksTotal} of ${s.stagesTotal} stages |`);
  lines.push(`| Scenes replaced by the safety filter | ${s.repairedTotal} |`);
  lines.push(`| Median server time | ${s.medianServerMs ?? 'n/a'} ms |`);
  lines.push(`| Median wall time | ${s.medianWallMs ?? 'n/a'} ms |`);
  lines.push(`| Primary model (from GET) | ${s.primaryModel ?? 'unknown'} |`);
  lines.push(`| Models that answered | ${Object.entries(s.models).map(([m, n]) => `${m} (${n})`).join(', ') || 'none'} |`);
  lines.push('');
  lines.push('## Per topic', '');
  lines.push('| # | Topic | Domain | Audience | Result | Stages | Myth checks kept | Model | Server ms | Wall ms |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  results.forEach((r, i) => {
    const topic = r.id === 'notes' ? 'Pasted notes: water cycle (7 lines)' : r.topic;
    const result = r.ok ? 'ok' : `failed (${r.status || 'no response'}${r.error ? `: ${short(r.error, 50)}` : ''})`;
    lines.push(
      `| ${i + 1} | ${cell(short(topic))} | ${r.domain} | ${r.audience} | ${cell(result)} | ${r.ok ? r.stages : '-'} | ${r.ok ? r.mythChecks : '-'} | ${r.model || '-'} | ${r.serverMs ?? '-'} | ${r.wallMs} |`,
    );
  });
  lines.push('');

  const notes = results.find((r) => r.id === 'notes');
  if (notes) lines.push('The pasted notes sent for row ' + (results.indexOf(notes) + 1) + ':', '', '```text', notes.topic, '```', '');

  lines.push('## Two full outputs, verbatim', '');
  lines.push('Title and stages exactly as the API returned them (after server-side vetting). Glyph emoji are omitted.', '');
  const shown = [];
  for (const id of EXAMPLES) {
    const r = results.find((x) => x.id === id && x.ok);
    if (r && shown.length < 2) shown.push(r);
  }
  for (const r of results) if (shown.length < 2 && r.ok && !shown.includes(r)) shown.push(r);
  for (const r of shown) {
    lines.push(`### "${r.deck.title}"`, '');
    lines.push(`Topic: ${r.id === 'notes' ? 'pasted notes (above)' : `"${r.topic}"`}, audience: ${r.audience}, model: ${r.model}, server ${r.serverMs} ms.`, '');
    r.deck.items.forEach((it, k) => {
      lines.push(`${k + 1}. **${it.cue}**: ${it.answer}`);
      if (it.why) lines.push(`   - Why: ${it.why}`);
      lines.push(`   - Scene: ${it.scene}`);
      if (it.check) lines.push(`   - Myth check: wrong "${it.check.wrong}" / right "${it.check.right}"`);
      if (it.link) lines.push(`   - Leads on: ${it.link}`);
    });
    lines.push('');
  }
  lines.push('Raw results for every topic, including full decks: [architect-eval.json](architect-eval.json).', '');
  return lines.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
