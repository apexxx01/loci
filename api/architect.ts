/**
 * POST /api/architect
 *   { mode: "build", notes, kind, audience }        -> { deck, repaired, model, ms }
 *   { mode: "teach", topic, audience }              -> { deck (kind: concept), repaired, model, ms }
 *   { mode: "bind",  items:[{cue,scene,label}] }    -> { scenes, repaired, model, ms }
 *   { mode: "grade", title, stages:[{cue,answer}], explanation } -> { hit, missed, misconception, feedback, model, ms }
 *   { mode: "reimagine", item:{cue,answer,scene,label} }         -> { scene, model, ms }
 *
 * Serverless function (Vercel). Keeps the Gemini key off the client, enforces
 * size limits and a per-instance rate limit, and never returns unvetted text.
 */
import {
  ARCHITECT_RESPONSE_SCHEMA,
  BIND_RESPONSE_SCHEMA,
  AUDIENCES,
  KINDS,
  architectPrompt,
  type Audience,
  type Kind,
  bindPrompt,
  CONCEPT_RESPONSE_SCHEMA,
  GRADE_RESPONSE_SCHEMA,
  gradePrompt,
  reimaginePrompt,
  teachPrompt,
  vetArchitectOutput,
  vetBoundScenes,
  vetConceptOutput,
  vetGrade,
} from '../src/core/architect.js';

/**
 * Measured 16 Nov: gemini-3.8-flash lost every race to gemini-3.5-flash-lite
 * (20/20 eval topics, and even a two-word probe waited ~4 s on it), so the fast
 * model leads and the larger ones back it up. GEMINI_PRIMARY overrides.
 */
const MODEL = process.env.GEMINI_PRIMARY || 'gemini-3.5-flash-lite';
/**
 * Fallback chain: a single overloaded model (503/429) or a slow response must
 * not break the experience. Each hop gets its own short timeout so the whole
 * chain fits inside the function's 30 s budget.
 */
const MODELS = [MODEL, process.env.GEMINI_MODEL || 'gemini-3.8-flash', ...(process.env.GEMINI_FALLBACKS ?? 'gemini-3.6-flash').split(',')]
  .map((m) => m.trim())
  .filter((m, i, a) => m && a.indexOf(m) === i);
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const TIMEOUT_MS = 20_000;
/** Mnemonics need creativity, not deep reasoning: keep thinking short for latency. */
const THINKING_LEVEL = process.env.GEMINI_THINKING || 'low';
const MAX_BODY = 12_000;

// Best-effort abuse guard: 20 requests / 10 minutes per IP per warm instance.
const WINDOW_MS = 10 * 60_000;
const LIMIT = 20;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > LIMIT;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

let lastModel = MODEL;

/** Start the next model in the chain if the current ones haven't answered by then. */
const HEDGE_AFTER_MS = 2_500;

/**
 * Hedged requests: launch the primary model, and every HEDGE_AFTER_MS without
 * an answer launch the next one in parallel (immediately on a hard failure).
 * First valid answer wins; the rest are aborted. Cuts tail latency when one
 * model is overloaded, at the cost of an occasional duplicate call.
 */
async function gemini(prompt: string, schema: object | null, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const controllers: AbortController[] = [];
  const errors: string[] = [];
  return await new Promise<unknown>((resolve, reject) => {
    let next = 0;
    let settled = false;
    let inFlight = 0;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedgeTimer);
      controllers.forEach((c) => c.abort());
      fn();
    };

    const launch = () => {
      if (settled || next >= MODELS.length) return;
      const model = MODELS[next++];
      const ctrl = new AbortController();
      controllers.push(ctrl);
      inFlight++;
      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(launch, HEDGE_AFTER_MS);
      callModel(model, prompt, schema, timeoutMs, ctrl.signal)
        .then((out) => {
          lastModel = model;
          finish(() => resolve(out));
        })
        .catch((e: Error & { upstream?: number }) => {
          inFlight--;
          if (settled) return;
          // Any failure (overload, timeout, a model rejecting a parameter,
          // malformed JSON) just moves on to the next model in the chain.
          errors.push(`${model}: ${e.name === 'AbortError' ? 'timeout' : e.message.slice(0, 80)}`);
          if (next < MODELS.length) launch();
          else if (inFlight === 0) {
            finish(() => reject(Object.assign(new Error(`All models unavailable (${errors.join('; ')})`), { status: 503 })));
          }
        });
    };
    launch();
  });
}

async function callModel(
  model: string,
  prompt: string,
  schema: object | null,
  timeoutMs: number,
  outer: AbortSignal,
): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('GEMINI_API_KEY is not set on the server'), { status: 503 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  outer.addEventListener('abort', () => ctrl.abort(), { once: true });
  try {
    const res = await fetch(ENDPOINT(model), {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
          thinkingConfig: { thinkingLevel: THINKING_LEVEL },
        },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw Object.assign(new Error(`Gemini returned ${res.status}: ${detail}`), { status: 502, upstream: res.status });
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    return schema ? JSON.parse(text) : text;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request): Promise<Response> {
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (rateLimited(ip)) return json(429, { error: 'Too many requests. Wait a few minutes and try again.' });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'Notes are too long. Keep it under about 4,000 characters.' });
  let body: {
    mode?: string; notes?: unknown; items?: unknown; kind?: unknown; audience?: unknown;
    topic?: unknown; title?: unknown; stages?: unknown; explanation?: unknown; item?: unknown;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Request body must be JSON.' });
  }

  const started = Date.now();
  try {
    if (body.mode === 'bind') {
      const items = Array.isArray(body.items)
        ? body.items.slice(0, 12).map((it: Record<string, unknown>) => ({
            cue: String(it?.cue ?? '').slice(0, 80),
            scene: String(it?.scene ?? '').slice(0, 240),
            label: String(it?.label ?? '').slice(0, 30),
          }))
        : [];
      if (!items.length) return json(400, { error: 'No items to bind.' });
      const out = await gemini(bindPrompt(items), BIND_RESPONSE_SCHEMA);
      const vetted = vetBoundScenes(out, items, items.map((i) => `${i.cue} ${i.scene}`).join(' '));
      return json(200, { ...vetted, model: lastModel, ms: Date.now() - started });
    }

    const audienceOf = (a: unknown): Audience => (AUDIENCES.includes(a as Audience) ? (a as Audience) : 'adult');
    const str = (v: unknown, n: number) => String(v ?? '').slice(0, n);

    if (body.mode === 'teach') {
      const topic = typeof body.topic === 'string' ? body.topic : '';
      if (topic.trim().length < 3) return json(400, { error: 'Name something to understand first.' });
      const id = `cx_${Date.now().toString(36)}`;
      const prompt = teachPrompt(topic, audienceOf(body.audience));
      let vetted = vetConceptOutput(await gemini(prompt, CONCEPT_RESPONSE_SCHEMA), topic, id);
      if (!vetted) vetted = vetConceptOutput(await gemini(prompt, CONCEPT_RESPONSE_SCHEMA), topic, id);
      if (!vetted) return json(502, { error: 'The Architect could not explain that one. Try naming it a little differently.' });
      return json(200, { deck: vetted.deck, repaired: vetted.repaired, model: lastModel, ms: Date.now() - started });
    }

    if (body.mode === 'grade') {
      const stages = Array.isArray(body.stages)
        ? body.stages.slice(0, 12).map((st: Record<string, unknown>) => ({ cue: str(st?.cue, 80), answer: str(st?.answer, 200) }))
        : [];
      const explanation = str(body.explanation, 3000);
      if (!stages.length) return json(400, { error: 'Nothing to grade against.' });
      if (explanation.trim().length < 12) return json(400, { error: 'Write a sentence or two first.' });
      const graded = vetGrade(await gemini(gradePrompt(str(body.title, 80), stages, explanation), GRADE_RESPONSE_SCHEMA), stages, explanation);
      if (!graded) return json(502, { error: 'The Architect could not grade that. Try again.' });
      return json(200, { ...graded, model: lastModel, ms: Date.now() - started });
    }

    if (body.mode === 'reimagine') {
      const it = (body.item ?? {}) as Record<string, unknown>;
      const item = { cue: str(it.cue, 80), answer: str(it.answer, 200), scene: str(it.scene, 240), label: str(it.label, 30) };
      if (!item.cue || !item.answer) return json(400, { error: 'No memory to re-imagine.' });
      const out = await gemini(reimaginePrompt(item), BIND_RESPONSE_SCHEMA);
      const vetted = vetBoundScenes(out, [item], `${item.cue} ${item.answer} ${item.scene}`);
      // A repaired result is just the old scene re-bound: report it as unchanged.
      return json(200, { scene: vetted.repaired ? null : vetted.scenes[0], model: lastModel, ms: Date.now() - started });
    }

    const notes = typeof body.notes === 'string' ? body.notes : '';
    if (notes.trim().length < 3) return json(400, { error: 'Add a few notes first.' });
    const id = `ai_${Date.now().toString(36)}`;
    const kind: Kind = KINDS.includes(body.kind as Kind) ? (body.kind as Kind) : 'notes';
    const audience: Audience = AUDIENCES.includes(body.audience as Audience) ? (body.audience as Audience) : 'adult';
    let vetted = vetArchitectOutput(await gemini(architectPrompt(notes, kind, audience), ARCHITECT_RESPONSE_SCHEMA), notes, id);
    if (!vetted) {
      // One retry: structured output occasionally truncates long lists.
      vetted = vetArchitectOutput(await gemini(architectPrompt(notes, kind, audience), ARCHITECT_RESPONSE_SCHEMA), notes, id);
    }
    if (!vetted) return json(502, { error: 'The Architect returned something unusable. Try again or shorten your notes.' });
    return json(200, { deck: vetted.deck, repaired: vetted.repaired, model: lastModel, ms: Date.now() - started });
  } catch (e) {
    const err = e as Error & { status?: number };
    const status = err.name === 'AbortError' ? 504 : err.status ?? 500;
    return json(status, { error: status === 504 ? 'The Architect took too long. Try again.' : err.message });
  }
}

export async function GET(request: Request): Promise<Response> {
  const base = { ok: true, model: MODEL, fallbacks: MODELS.slice(1), thinking: THINKING_LEVEL, configured: Boolean(process.env.GEMINI_API_KEY) };
  if (!new URL(request.url).searchParams.has('probe')) return json(200, base);
  // Health probe: one tiny call, reports latency or the exact upstream error.
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (rateLimited(ip)) return json(429, { error: 'Too many requests.' });
  const t0 = Date.now();
  try {
    const text = await gemini('Reply with the single word OK.', null, 8_000);
    return json(200, { ...base, probe: 'ok', served_by: lastModel, reply: String(text).slice(0, 40), ms: Date.now() - t0 });
  } catch (e) {
    const err = e as Error;
    return json(200, { ...base, probe: 'failed', error: err.name === 'AbortError' ? 'timeout after 15s' : err.message, ms: Date.now() - t0 });
  }
}
