/**
 * Shareable palaces. A share link carries the deck, never the room: the
 * receiver's own furniture decides where each memory lands. Links are
 * untrusted input, so decoding re-validates the schema and re-runs the
 * content guard on every line.
 */
import { checkMnemonic } from './safety.js';
import { DeckSchema } from './schema.js';
import type { Deck } from './types.js';

const VERSION = 1;

interface Wire {
  v: number;
  t: string;
  s: string;
  o: boolean;
  i: [cue: string, answer: string, scene: string, glyphs: string][];
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Encode a deck for the URL hash. Prefix "z" = deflated, "j" = plain JSON. */
export async function encodeDeck(deck: Deck): Promise<string> {
  const wire: Wire = {
    v: VERSION,
    t: deck.title,
    s: deck.subtitle,
    o: deck.ordered,
    i: deck.items.map((it) => [it.cue, it.answer, it.baseScene ?? it.scene, it.glyphs.join('|')]),
  };
  const json = new TextEncoder().encode(JSON.stringify(wire));
  if (typeof CompressionStream === 'function') {
    return `z${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
  }
  return `j${toBase64Url(json)}`;
}

export type DecodeResult = { ok: true; deck: Deck; repaired: number } | { ok: false; error: string };

export async function decodeDeck(code: string): Promise<DecodeResult> {
  try {
    if (code.length > 20_000) return { ok: false, error: 'This link is too long to be a Loci palace.' };
    const kind = code[0];
    let bytes = fromBase64Url(code.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'j') return { ok: false, error: 'This link is not a Loci palace.' };
    const wire = JSON.parse(new TextDecoder().decode(bytes)) as Wire;
    if (wire.v !== VERSION || !Array.isArray(wire.i)) return { ok: false, error: 'This palace link is from a newer version of Loci.' };
    let repaired = 0;
    const id = `shared_${hash(code)}`;
    const deck = {
      id,
      title: String(wire.t ?? 'Shared palace'),
      subtitle: String(wire.s ?? ''),
      ordered: Boolean(wire.o),
      source: 'shared' as const,
      items: wire.i.slice(0, 12).map(([cue, answer, scene, glyphs], order) => {
        const c = String(cue ?? '');
        const a = String(answer ?? '');
        let sc = String(scene ?? '');
        if (!checkMnemonic(sc, `${c} ${a}`).ok) {
          repaired++;
          sc = `Picture ${c} glowing in front of you, spelling out the answer in light.`;
        }
        const gl = String(glyphs ?? '').split('|').filter((g) => /\p{Extended_Pictographic}/u.test(g)).slice(0, 3);
        return { id: `${id}:${order}`, cue: c, answer: a, scene: sc, glyphs: gl.length ? gl : ['✨'], order };
      }),
    };
    const parsed = DeckSchema.safeParse(deck);
    if (!parsed.success) return { ok: false, error: 'This palace link is damaged.' };
    return { ok: true, deck: parsed.data as Deck, repaired };
  } catch {
    return { ok: false, error: 'This palace link is damaged.' };
  }
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
