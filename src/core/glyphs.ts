/**
 * Offline keyword → emoji index used when the Palace Architect is unavailable.
 * Small on purpose: common study vocabulary across science, history, language
 * and everyday objects, plus a stable hash fallback so every item gets a glyph.
 */
const INDEX: [RegExp, string][] = [
  [/\b(sun|solar|star)s?\b/, '☀️'], [/\bmoon|lunar\b/, '🌙'], [/\bplanet|orbit|space|astro/, '🪐'],
  [/\bearth|world|globe|geograph/, '🌍'], [/\bwater|ocean|sea|river|rain|hydro/, '💧'], [/\bfire|heat|hot|burn|thermal/, '🔥'],
  [/\bice|cold|freez|frost|glacier/, '🧊'], [/\bwind|air|breath|gas\b/, '🌬️'], [/\bmountain|volcan|peak/, '🌋'],
  [/\btree|forest|wood\b/, '🌳'], [/\bplant|leaf|flower|seed|botan|photosynth/, '🌱'], [/\bcell|bacteria|virus|germ|microb/, '🦠'],
  [/\bdna|gene|genetic|chromosom/, '🧬'], [/\bheart|blood|cardi/, '❤️'], [/\bbrain|neuro|mind|memory/, '🧠'],
  [/\bbone|skelet/, '🦴'], [/\btooth|teeth|dental/, '🦷'], [/\beye|vision|sight|optic/, '👁️'], [/\blung|respirat/, '🫁'],
  [/\batom|electron|proton|neutron|nucle/, '⚛️'], [/\bchemi|acid|base|reaction|element|compound|lab\b/, '🧪'],
  [/\bmagnet/, '🧲'], [/\belectric|voltage|current|circuit|battery|energy/, '⚡'], [/\blight|lamp|photon|bright/, '💡'],
  [/\bgravity|force|newton|mass|weight/, '🍎'], [/\bspeed|fast|velocity|accelerat/, '🏎️'], [/\bsound|music|wave|frequency/, '🎵'],
  [/\bmath|number|equation|formula|algebra/, '🔢'], [/\bgeometr|triangle|angle|shape/, '📐'], [/\bmoney|price|cost|econom|trade|market/, '💰'],
  [/\bbank|loan|interest|tax/, '🏦'], [/\bking|queen|emperor|empire|crown|monarch|dynast/, '👑'], [/\bwar|battle|army|soldier|fight/, '⚔️'],
  [/\bpeace|treaty|agreement/, '🕊️'], [/\blaw|court|justice|constitution|rights?\b/, '⚖️'], [/\bvote|election|democra|parliament/, '🗳️'],
  [/\bship|sail|navy|boat|voyage/, '⛵'], [/\btrain|rail/, '🚂'], [/\bcar|road|drive/, '🚗'], [/\bplane|flight|fly|aviat/, '✈️'],
  [/\bhouse|home|build|architect/, '🏠'], [/\bcity|town|urban/, '🏙️'], [/\bbook|read|write|author|novel|poem/, '📖'],
  [/\bcomputer|code|program|software|data|algorithm/, '💻'], [/\bphone|call|telephon/, '📱'], [/\binternet|network|web\b/, '🌐'],
  [/\btime|clock|hour|minute|year|date|century/, '⏰'], [/\bcalendar|day|week|month/, '📅'], [/\bfood|eat|meal|cook|kitchen/, '🍽️'],
  [/\bbread|wheat|grain/, '🍞'], [/\bfruit|apple|orange|banana/, '🍊'], [/\bcoffee|tea|cafe/, '☕'], [/\bdog|puppy/, '🐶'],
  [/\bcat|kitten/, '🐱'], [/\bbird|wing|feather/, '🐦'], [/\bfish|shark|whale/, '🐟'], [/\bsnake|reptile/, '🐍'],
  [/\blion|tiger|wild/, '🦁'], [/\bhorse/, '🐴'], [/\bbee|honey|insect/, '🐝'], [/\bgold|treasure|medal/, '🥇'],
  [/\bdiamond|gem|crystal|jewel/, '💎'], [/\bkey|lock|secret/, '🔑'], [/\bdoor|gate|entrance/, '🚪'], [/\bmap|route|direction|north|south/, '🧭'],
  [/\bhello|hi\b|greet|wave/, '👋'], [/\bthank|grateful|please/, '🙏'], [/\bhelp|emergency|sos/, '🆘'], [/\bquestion|where|what|why|how\b/, '❓'],
  [/\bspeak|say|talk|speech|voice|language/, '🗣️'], [/\blisten|hear|ear\b/, '👂'], [/\bhappy|joy|smile|laugh/, '😄'], [/\bsad|cry|tear/, '😢'],
  [/\bangry|anger|rage/, '😠'], [/\blove|romance/, '💗'], [/\bsleep|night|dream|bed\b/, '🌙'], [/\bsport|ball|game|play/, '⚽'],
  [/\bart|paint|draw|color|colour/, '🎨'], [/\bfilm|movie|camera|photo/, '🎬'], [/\bdance/, '💃'], [/\bmedicine|doctor|hospital|health|drug/, '🩺'],
  [/\bpill|vitamin/, '💊'], [/\bfarm|agricult|crop/, '🚜'], [/\bfactory|industr|machine/, '🏭'], [/\btool|repair|fix/, '🔧'],
  [/\bscience|experiment|research/, '🔬'], [/\bteacher|school|class|student|exam|test\b/, '🎓'], [/\bfirst|one\b|1st/, '🥇'],
  [/\bsecond|two\b|2nd/, '🥈'], [/\bthird|three\b|3rd/, '🥉'], [/\bgrow|growth|increase|rise/, '📈'], [/\bfall|decrease|drop|decline/, '📉'],
];

const FALLBACK = ['✨', '🔷', '🔶', '🌀', '🎯', '🧩', '🔮', '🎈', '🪁', '🏮', '🧿', '🪄'];

export function glyphsFor(text: string, max = 2): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  for (const [re, g] of INDEX) {
    if (re.test(t) && !out.includes(g)) out.push(g);
    if (out.length >= max) break;
  }
  if (!out.length) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    out.push(FALLBACK[h % FALLBACK.length]);
  }
  return out;
}
