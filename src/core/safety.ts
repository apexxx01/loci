/**
 * Content guard for AI-written mnemonics. The competition bars identifiable
 * real people, brands and adult content, and our audience is 10+. The model is
 * told the rules; this module enforces them deterministically afterwards.
 */

/** Words that must never appear in a mnemonic, whatever the model says. */
const BLOCKED_TERMS = [
  // profanity / adult (kept short and unambiguous on purpose)
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'porn', 'sex', 'sexy', 'nude', 'naked',
  'boob', 'horny', 'whore', 'slut', 'rape', 'kill yourself', 'suicide', 'drug', 'cocaine', 'heroin',
  'weed', 'beer', 'vodka', 'whisky', 'whiskey', 'cigarette', 'gun', 'blood', 'gore', 'corpse',
  // well-known brands and products (no commercial branding allowed)
  'coca-cola', 'pepsi', 'mcdonald', 'burger king', 'kfc', 'starbucks', 'nike', 'adidas',
  'iphone', 'ipad', 'macbook', 'google', 'android', 'samsung', 'microsoft', 'xbox', 'playstation', 'nintendo', 'mario', 'pokemon', 'pikachu', 'disney', 'mickey', 'marvel',
  'batman', 'superman', 'spider-man', 'spiderman', 'harry potter', 'star wars', 'lego', 'barbie',
  'tesla', 'netflix', 'youtube', 'instagram', 'facebook', 'tiktok', 'twitter', 'meta',
  'oculus', 'quest', 'chatgpt', 'openai', 'red bull', 'ferrari', 'lamborghini', 'bmw', 'mercedes',
  'toyota', 'gucci', 'louis vuitton', 'rolex', 'ikea', 'walmart', 'uber', 'zomato', 'swiggy',
];

/** Lower-cased words that are fine to capitalise anywhere in a sentence. */
const SAFE_CAPITALISED = new Set([
  'i', 'a', 'the', 'an', 'it', 'its', 'you', 'your', 'he', 'she', 'they', 'we', 'imagine', 'picture',
  'see', 'now', 'then', 'this', 'that', 'here', 'there', 'giant', 'tiny', 'sun', 'moon', 'earth',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december',
]);

export interface SafetyVerdict {
  ok: boolean;
  reasons: string[];
}

const wordRe = (term: string) =>
  new RegExp(`(^|[^a-z])${term.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}([^a-z]|$)`, 'i');

/**
 * Check one piece of model output. `sourceText` is the learner's own material:
 * proper nouns that appear there (e.g. "Mercury", "Ashoka") are allowed, any
 * other capitalised name the model invents is treated as a possible real
 * person or brand and rejected.
 */
export function checkMnemonic(text: string, sourceText: string): SafetyVerdict {
  const reasons: string[] = [];
  const lower = text.toLowerCase();
  const sourceLower = sourceText.toLowerCase();

  for (const term of BLOCKED_TERMS) {
    if (wordRe(term).test(lower) && !wordRe(term).test(sourceLower)) {
      reasons.push(`blocked term: ${term}`);
    }
  }

  // Capitalised words not at sentence start, not in the learner's notes.
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    words.forEach((raw, i) => {
      const word = raw.replace(/[^A-Za-z'-]/g, '');
      if (!word || i === 0) return;
      if (!/^[A-Z][a-z]/.test(word)) return;
      const lw = word.toLowerCase();
      if (SAFE_CAPITALISED.has(lw)) return;
      if (wordRe(lw).test(sourceLower)) return;
      reasons.push(`unsourced proper noun: ${word}`);
    });
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Clamp user-supplied text before it is shown or sent anywhere. */
export function sanitizeUserText(text: string, max = 4000): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .slice(0, max)
    .trim();
}
