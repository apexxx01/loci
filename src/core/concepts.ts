/**
 * Ready-made concepts: how six things work, as linked stages. They ship with
 * the app so the first minute never waits on a network, and every line was
 * written to be checked against a textbook. Each stage teaches a claim, why it
 * is true, a picture, one common misconception to test, and the link to the
 * next stage.
 */
import type { Deck, MemoryItem } from './types.js';

type Stage = Omit<MemoryItem, 'id' | 'order'>;

function concept(id: string, title: string, blurb: string, stages: Stage[]): Deck {
  return {
    id: `concept-${id}`,
    title,
    subtitle: blurb,
    ordered: true,
    source: 'concept',
    kind: 'concept',
    items: stages.map((s, order) => ({ ...s, id: `concept-${id}:${order}`, order })),
  };
}

export const CONCEPTS: Deck[] = [
  concept('heart', 'How your heart pumps blood', 'Six stages, one heartbeat', [
    {
      cue: 'Used blood comes home',
      answer: 'Oxygen-poor blood from the body flows back into the right atrium, the heart’s upper right chamber.',
      why: 'Two large veins empty into it after the blood has delivered its oxygen to the body.',
      scene: 'A crowd of tired, dark red marbles rolls home through a door marked RIGHT and flops into a waiting room.',
      glyphs: ['\u{1F6AA}', '\u{1F534}'],
      check: { wrong: 'Blood without oxygen is blue.', right: 'Blood is always red; oxygen-poor blood is just a darker red.' },
      link: 'drops it into the pump below',
    },
    {
      cue: 'Right ventricle pushes to lungs',
      answer: 'The right ventricle squeezes that blood through the pulmonary artery to the lungs.',
      why: 'The lungs are close by, so this side needs less force and its wall is thinner than the left side’s.',
      scene: 'A small, wiry trampoline flings the marbles up a short slide straight into two pink balloons.',
      glyphs: ['\u{1F3BF}', '\u{1F388}'],
      check: { wrong: 'Arteries always carry oxygen-rich blood.', right: 'Arteries carry blood away from the heart, and the lung artery carries oxygen-poor blood.' },
      link: 'sends it to the lungs',
    },
    {
      cue: 'Lungs swap the gases',
      answer: 'In tiny air sacs in the lungs, blood gives up carbon dioxide and picks up oxygen.',
      why: 'Gases drift from where there is more to where there is less, across walls only one cell thick.',
      scene: 'Inside a bunch of grapes made of balloons, each marble trades a grey pebble for a sparkling bubble.',
      glyphs: ['\u{1FAC1}', '\u{1FAE7}'],
      check: { wrong: 'Your lungs turn the air you breathe into carbon dioxide.', right: 'Your cells make the carbon dioxide; the lungs swap it out for oxygen.' },
      link: 'returns it bright red to',
    },
    {
      cue: 'Left atrium collects',
      answer: 'Oxygen-rich blood returns from the lungs through the pulmonary veins into the left atrium.',
      why: 'These are the only veins in an adult that carry oxygen-rich blood, which surprises most people.',
      scene: 'Bright red, fizzing marbles pour into an upper room on the left, humming and buzzing with energy.',
      glyphs: ['\u{2728}', '\u{1F534}'],
      check: { wrong: 'Veins always carry oxygen-poor blood.', right: 'Veins carry blood towards the heart, and the lung veins carry oxygen-rich blood.' },
      link: 'drops it into the strongest pump',
    },
    {
      cue: 'Left ventricle launches it',
      answer: 'The left ventricle, the strongest chamber, pumps blood into the aorta and out to the whole body.',
      why: 'It has to push blood all the way to your toes, so its muscular wall is the thickest in the heart.',
      scene: 'A giant, muscly catapult launches the glowing marbles down a huge arched tunnel towards your feet.',
      glyphs: ['\u{1F4AA}', '\u{1F680}'],
      check: { wrong: 'Your heart sits on the far left side of your chest.', right: 'Your heart sits near the middle of your chest, tilted slightly left.' },
      link: 'is kept one-way by',
    },
    {
      cue: 'Valves keep it one-way',
      answer: 'Four valves snap shut behind each push, so blood can only flow forward.',
      why: 'The lub-dub of a heartbeat is the sound of those valves closing.',
      scene: 'Four little trapdoors slam shut behind the marbles, going LUB and then DUB like a drum.',
      glyphs: ['\u{1F941}', '\u{1F6AA}'],
      check: { wrong: 'The heartbeat sound is the heart muscle squeezing.', right: 'The lub-dub sound comes from the heart’s valves snapping shut.' },
    },
  ]),

  concept('plants', 'How plants make food', 'Five stages, from root to air', [
    {
      cue: 'Roots drink water',
      answer: 'Roots draw water from the soil, and it travels up tubes called xylem to the leaves.',
      why: 'Water evaporating from the leaves pulls the whole column of water upwards, like sipping a straw.',
      scene: 'A plant sips from the floor through a long bendy straw, and water races up its stem to the leaves.',
      glyphs: ['\u{1F964}', '\u{1F331}'],
      check: { wrong: 'Plants get their food from the soil.', right: 'Plants make their own food; soil mostly gives them water and minerals.' },
      link: 'delivers water to the leaves, which also',
    },
    {
      cue: 'Leaves take in air',
      answer: 'Tiny pores on the leaves, called stomata, let carbon dioxide in from the air.',
      why: 'Carbon dioxide supplies the carbon atoms that the plant builds its whole body from.',
      scene: 'Thousands of tiny mouths on a leaf open and gulp invisible air, puffing out their cheeks.',
      glyphs: ['\u{1F343}', '\u{1F4A8}'],
      check: { wrong: 'Most of a tree’s weight comes from the soil.', right: 'Most of a tree’s weight comes from carbon dioxide in the air.' },
      link: 'meets sunlight inside',
    },
    {
      cue: 'Chlorophyll catches light',
      answer: 'Chlorophyll inside chloroplasts absorbs sunlight, mostly the red and blue parts.',
      why: 'It reflects much of the green light, which is why leaves look green to us.',
      scene: 'Green catchers’ mitts in every leaf snatch red and blue sunbeams and let the green ones bounce away.',
      glyphs: ['\u{2600}\u{FE0F}', '\u{1F9E4}'],
      check: { wrong: 'Plants use green light more than any other colour.', right: 'Leaves reflect much green light and absorb mostly red and blue.' },
      link: 'powers the kitchen that',
    },
    {
      cue: 'Sugar gets built',
      answer: 'Using the light’s energy, the plant turns water and carbon dioxide into glucose, a sugar.',
      why: 'Glucose stores the light’s energy in chemical bonds the plant can use later or build with.',
      scene: 'A tiny bakery inside the leaf mixes water and air, then pulls out glowing sugar cubes on a tray.',
      glyphs: ['\u{1F9C1}', '\u{1F36C}'],
      check: { wrong: 'Plants do not need to respire because they make their own food.', right: 'Plants respire all the time, burning some of the sugar they make.' },
      link: 'leaves behind a gift:',
    },
    {
      cue: 'Oxygen is released',
      answer: 'Oxygen is left over and escapes through the stomata into the air.',
      why: 'That oxygen comes from splitting water molecules, and it is the oxygen you breathe.',
      scene: 'The leaf blows a stream of shiny bubbles out of its tiny mouths, and you breathe one in.',
      glyphs: ['\u{1FAE7}', '\u{1F343}'],
      check: { wrong: 'The oxygen plants give off comes from carbon dioxide.', right: 'The oxygen plants give off comes from splitting water.' },
    },
  ]),

  concept('seasons', 'Why we have seasons', 'Five stages, one tilted planet', [
    {
      cue: 'Earth leans over',
      answer: 'Earth’s axis is tilted about 23.4 degrees, and it keeps pointing the same way all year.',
      why: 'As Earth circles the Sun, that fixed tilt means each half leans towards the Sun for part of the year.',
      scene: 'A spinning top, leaning to one side, glides around a lamp without ever straightening up.',
      glyphs: ['\u{1F30D}', '\u{1F4D0}'],
      check: { wrong: 'We have seasons because Earth is closer to the Sun in summer.', right: 'We have seasons because of Earth’s tilt, not its distance from the Sun.' },
      link: 'means one half leans in, so',
    },
    {
      cue: 'Direct sunlight',
      answer: 'The half tilted towards the Sun gets sunlight more directly, so each patch of ground gets more energy.',
      why: 'Steep light is concentrated on a small area; slanted light is spread thin over a bigger area.',
      scene: 'A torch shines straight down and makes a small, blazing spot; tilted, its light smears into a dim oval.',
      glyphs: ['\u{1F526}', '\u{1F525}'],
      check: { wrong: 'Summer sunlight is stronger because the Sun is closer.', right: 'Summer sunlight is stronger because it hits the ground more directly.' },
      link: 'and that same half also gets',
    },
    {
      cue: 'Longer days',
      answer: 'The half leaning towards the Sun also has longer days, so the ground warms for more hours.',
      why: 'That hemisphere spends more of each spin of the Earth on the sunny side.',
      scene: 'A clock on a sunny beach has a huge yellow day slice and a tiny dark night slice.',
      glyphs: ['\u{1F552}', '\u{1F31E}'],
      check: { wrong: 'Every place on Earth has 12-hour days all year round.', right: 'Day length changes through the year everywhere except right at the equator.' },
      link: 'which makes it summer there while',
    },
    {
      cue: 'Opposite halves',
      answer: 'When it is summer in the northern half of Earth, it is winter in the southern half.',
      why: 'The two hemispheres lean towards the Sun at opposite times of the year.',
      scene: 'A snowman and a sandcastle sit back to back on a ball, each waving at the other.',
      glyphs: ['\u{26C4}', '\u{1F3D6}\u{FE0F}'],
      check: { wrong: 'The whole planet has summer at the same time.', right: 'When the north has summer, the south has winter.' },
      link: 'and the proof that distance is not the cause:',
    },
    {
      cue: 'Closest in January',
      answer: 'Earth is closest to the Sun in early January, in the middle of northern winter.',
      why: 'Earth’s orbit is nearly a circle, so the change in distance is small and the tilt matters far more.',
      scene: 'In January, a snowman gets the closest hug from the Sun all year and still does not melt.',
      glyphs: ['\u{2600}\u{FE0F}', '\u{26C4}'],
      check: { wrong: 'Earth is closest to the Sun in July.', right: 'Earth is closest to the Sun in early January.' },
    },
  ]),

  concept('vaccine', 'How a vaccine trains your body', 'Five stages, from practice to protection', [
    {
      cue: 'A harmless preview',
      answer: 'A vaccine shows your immune system a harmless piece, copy or weakened form of a germ.',
      why: 'It looks like the germ to your body but cannot cause the disease it protects against.',
      scene: 'A cardboard cut-out of a spiky germ is wheeled in on a trolley, wearing a name badge.',
      glyphs: ['\u{1F9A0}', '\u{1F4CB}'],
      check: { wrong: 'Vaccines put the full disease into your body.', right: 'Vaccines use harmless pieces, copies, or weakened or inactivated germs.' },
      link: 'is spotted by',
    },
    {
      cue: 'Immune cells spot it',
      answer: 'Immune cells notice the unfamiliar shapes on it, called antigens, and raise the alarm.',
      why: 'Your body checks the shapes on everything it meets to tell its own cells from invaders.',
      scene: 'Guards with magnifying glasses circle the cut-out, find a strange shape, and ring a big bell.',
      glyphs: ['\u{1F50D}', '\u{1F514}'],
      check: { wrong: 'Your immune system only switches on after you get sick.', right: 'Your immune system is always on patrol, checking shapes.' },
      link: 'which switches on',
    },
    {
      cue: 'Antibodies are made',
      answer: 'B cells make antibodies, proteins that lock onto that exact antigen.',
      why: 'Each antibody fits one particular shape, like a key cut for one lock.',
      scene: 'A busy key-cutting shop cuts thousands of keys that all fit one spiky lock.',
      glyphs: ['\u{1F511}', '\u{1F512}'],
      check: { wrong: 'One antibody protects you against every germ.', right: 'Each antibody matches one specific shape on one germ.' },
      link: 'and leaves behind',
    },
    {
      cue: 'Memory cells stay',
      answer: 'Some B and T cells become memory cells that can last for years.',
      why: 'They remember the shape, so the next response starts much faster and stronger.',
      scene: 'A wise old guard pins a photo of the spiky shape on the wall and sits beside it, wide awake.',
      glyphs: ['\u{1F5BC}\u{FE0F}', '\u{1F9D0}'],
      check: { wrong: 'Protection ends as soon as antibody levels fade.', right: 'Memory cells can rebuild antibodies quickly after levels fade.' },
      link: 'that spring into action when',
    },
    {
      cue: 'The real germ arrives',
      answer: 'If the real germ shows up, memory cells respond fast and help stop it before it spreads much.',
      why: 'That quick second response is why vaccinated people usually get much less sick.',
      scene: 'The real germ sneaks in, the old guard points at the photo, and the keys snap onto it at once.',
      glyphs: ['\u{1F6E1}\u{FE0F}', '\u{26A1}'],
      check: { wrong: 'A vaccine means you can never catch that germ at all.', right: 'Vaccines greatly lower the risk, but do not always block every infection.' },
    },
  ]),

  concept('water', 'How the water cycle works', 'Five stages, around and around', [
    {
      cue: 'Evaporation',
      answer: 'The Sun’s heat turns water in oceans, lakes and puddles into invisible water vapour.',
      why: 'Heat gives some water molecules enough energy to break free into the air.',
      scene: 'A puddle on a hot day lifts off the ground as a ghostly, shimmering sheet and floats upward.',
      glyphs: ['\u{2600}\u{FE0F}', '\u{1F4A7}'],
      check: { wrong: 'Water has to boil before it can evaporate.', right: 'Water evaporates at any temperature, just faster when it is warm.' },
      link: 'is joined in the air by',
    },
    {
      cue: 'Plants breathe out water',
      answer: 'Plants pull water up from the soil and release water vapour from their leaves.',
      why: 'This is called transpiration, and over land it puts a large share of the water back into the air.',
      scene: 'A tree sighs out of every leaf at once, and a soft mist drifts up from its branches.',
      glyphs: ['\u{1F333}', '\u{1F32B}\u{FE0F}'],
      check: { wrong: 'Only oceans put water back into the air.', right: 'Plants release a lot of water vapour through their leaves too.' },
      link: 'and the vapour rises and cools into',
    },
    {
      cue: 'Condensation',
      answer: 'Rising vapour cools and condenses on tiny specks of dust into droplets that form clouds.',
      why: 'Cooler air can hold less water vapour, so the extra turns back into liquid.',
      scene: 'Specks of dust each grab a tiny water droplet and huddle together into a fluffy white crowd.',
      glyphs: ['\u{2601}\u{FE0F}', '\u{1F4A7}'],
      check: { wrong: 'Clouds are made of water vapour.', right: 'Clouds are tiny liquid droplets or ice crystals; vapour is invisible.' },
      link: 'grow heavy and fall as',
    },
    {
      cue: 'Precipitation',
      answer: 'Droplets merge until they are too heavy to stay up, then fall as rain, snow, sleet or hail.',
      why: 'Rising air holds small droplets up; only bigger drops can fall against it.',
      scene: 'Droplets bump together like bumper cars, grow fat, and drop out of the cloud like bread rolls.',
      glyphs: ['\u{1F327}\u{FE0F}', '\u{2744}\u{FE0F}'],
      check: { wrong: 'Falling raindrops are shaped like teardrops.', right: 'Falling raindrops are round or flattened, like a bun.' },
      link: 'which gathers back into',
    },
    {
      cue: 'Collection',
      answer: 'Water collects in rivers, lakes and oceans, and some soaks into the ground as groundwater.',
      why: 'Gravity pulls water downhill until it reaches the lowest place it can.',
      scene: 'Rain slides down a hill into a lake, while some sneaks underground into a hidden cave pool.',
      glyphs: ['\u{1F30A}', '\u{26F0}\u{FE0F}'],
      check: { wrong: 'Most liquid fresh water is in rivers and lakes.', right: 'Most liquid fresh water is underground, not in rivers and lakes.' },
    },
  ]),

  concept('web', 'How a web page reaches you', 'Five stages, in under a second', [
    {
      cue: 'The name is looked up',
      answer: 'Your browser asks a DNS server to turn the web address into the server’s numeric IP address.',
      why: 'Computers route messages by numbers; names are only there for people.',
      scene: 'A librarian flips through a giant phone book and hands you a number for the name you typed.',
      glyphs: ['\u{1F4D6}', '\u{1F522}'],
      check: { wrong: 'The internet finds websites by their names directly.', right: 'Names are looked up first and turned into numeric IP addresses.' },
      link: 'which lets the browser connect to',
    },
    {
      cue: 'A secure line opens',
      answer: 'Your browser connects to that server and, for https, they agree on keys to encrypt everything.',
      why: 'Encryption means anyone in between sees scrambled data instead of your page.',
      scene: 'Two people shake hands through a wall, swap secret decoder rings, and start whispering.',
      glyphs: ['\u{1F91D}', '\u{1F510}'],
      check: { wrong: 'A padlock in the address bar means the site is trustworthy.', right: 'The padlock means the connection is encrypted, not that the site is honest.' },
      link: 'and carries',
    },
    {
      cue: 'The request travels',
      answer: 'The browser sends an HTTP request for the page, split into small packets.',
      why: 'Packets can take different routes and are put back in order when they arrive.',
      scene: 'Your letter is cut into puzzle pieces, each one flies off by a different paper plane.',
      glyphs: ['\u{2709}\u{FE0F}', '\u{1F9E9}'],
      check: { wrong: 'Your request travels across the internet as one big piece.', right: 'Data travels in many small packets, sometimes by different routes.' },
      link: 'which is answered by',
    },
    {
      cue: 'The server replies',
      answer: 'The server sends back HTML, plus the styles, scripts and images the page needs.',
      why: 'HTML is the structure, CSS is the look, and JavaScript makes it interactive.',
      scene: 'A delivery van pulls up with a flat-pack kit: a skeleton, a box of paint, and a wind-up motor.',
      glyphs: ['\u{1F4E6}', '\u{1F69A}'],
      check: { wrong: 'A web page arrives as one finished picture.', right: 'A page arrives as code and files your browser assembles.' },
      link: 'which is assembled by',
    },
    {
      cue: 'Your browser builds it',
      answer: 'Your browser reads the code, works out the layout, and paints the page on your screen.',
      why: 'It builds a tree of everything on the page, then decides each element’s size and position.',
      scene: 'Tiny builders follow the flat-pack instructions and paint the finished page onto your screen.',
      glyphs: ['\u{1F6E0}\u{FE0F}', '\u{1F3A8}'],
      check: { wrong: 'The server draws the page you see.', right: 'Your own browser lays out and draws the page.' },
    },
  ]),
];

export function conceptById(id: string): Deck | undefined {
  return CONCEPTS.find((d) => d.id === id);
}
