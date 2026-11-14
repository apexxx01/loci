/**
 * Built-in decks. They work with no network and no AI, which is what keeps
 * Loci a product and not a wrapper: the room, the route, the scheduler and the
 * recall loop are all ours.
 */
import type { Deck, MemoryItem } from './types.js';

type Row = [cue: string, answer: string, scene: string, glyphs: string[]];

function deck(
  id: string,
  title: string,
  subtitle: string,
  ordered: boolean,
  rows: Row[],
): Deck {
  const items: MemoryItem[] = rows.map(([cue, answer, scene, glyphs], order) => ({
    id: `${id}:${order}`,
    cue,
    answer,
    scene,
    glyphs,
    order,
  }));
  return { id, title, subtitle, ordered, source: 'starter', items };
}

export const PLANETS = deck('planets', 'The Planets', 'All 8, in order from the Sun', true, [
  ['Mercury', '1st planet — closest to the Sun, a year lasts 88 days', 'A tiny silver thermometer sprints laps around a blazing campfire.', ['🌡️', '🏃', '☀️']],
  ['Venus', '2nd — hottest planet, thick clouds, spins backwards', 'A pressure cooker hidden in yellow fog, its lid spinning the wrong way.', ['♨️', '🌫️', '🔄']],
  ['Earth', '3rd — our home, the only known world with life', 'A blue marble with a front door and a sprout growing out of the chimney.', ['🌍', '🏠', '🌱']],
  ['Mars', '4th — the red planet, home of the tallest volcano', 'A red rock wearing a volcano as a party hat that touches the clouds.', ['🔴', '🌋', '🎉']],
  ['Jupiter', '5th — the largest planet, with a giant red storm', 'A huge crowned king with a red hurricane swirling on his belly.', ['👑', '🌀', '🔴']],
  ['Saturn', '6th — famous rings, light enough to float in water', 'A ringed ball bobbing happily in a bathtub like a rubber duck.', ['💍', '🛁', '🦆']],
  ['Uranus', '7th — an ice giant tipped on its side', 'An icy bowling ball rolling sideways down the lane.', ['🧊', '🎳', '↪️']],
  ['Neptune', '8th — farthest planet, the fastest winds', 'A blue trident being whipped around by howling winds.', ['🔱', '🌬️', '💙']],
]);

export const ELEMENTS = deck('elements', 'First 10 Elements', 'Hydrogen to Neon, by atomic number', true, [
  ['1 · Hydrogen (H)', 'Lightest element, fuel of the stars', 'A star sips a glass of water through a straw to keep burning.', ['⭐', '💧', '🥤']],
  ['2 · Helium (He)', 'Lighter than air, makes voices squeaky', 'A balloon floats away while giggling in a squeaky voice.', ['🎈', '🗣️', '😆']],
  ['3 · Lithium (Li)', 'Soft metal inside rechargeable batteries', 'A battery doing push-ups to recharge itself.', ['🔋', '💪', '⚡']],
  ['4 · Beryllium (Be)', 'Found in emeralds, light and strong', 'A bee buzzing around guarding a green emerald.', ['🐝', '💚', '💎']],
  ['5 · Boron (B)', 'Used in heat-proof glass and cleaning powder', 'A bored glass beaker yawning on a hot stove without cracking.', ['🥱', '🧪', '🔥']],
  ['6 · Carbon (C)', 'Basis of life — pencil lead and diamonds', 'A pencil sketching a diamond that pops off the page.', ['✏️', '💎', '🧬']],
  ['7 · Nitrogen (N)', 'About 78% of the air you breathe', 'A giant night sky made of air, with a big 78 written in stars.', ['🌌', '🌬️', '7️⃣']],
  ['8 · Oxygen (O)', 'What you breathe in; feeds fire', 'A pair of lungs fanning a campfire like a bellows.', ['🫁', '🔥', '💨']],
  ['9 · Fluorine (F)', 'Most reactive element; in toothpaste as fluoride', 'A tooth wearing a superhero cape, fighting a germ.', ['🦷', '🦸', '🦠']],
  ['10 · Neon (Ne)', 'Noble gas that glows in bright signs', 'A glowing sign that says OPEN flickering in orange light.', ['💡', '🌈', '✨']],
]);

export const SPANISH = deck('spanish', 'Spanish Survival', '8 phrases for your first day abroad', false, [
  ['Hola', 'Hello', 'A wave of OLA-la water crashes and says hello.', ['👋', '🌊']],
  ['Gracias', 'Thank you', 'You thank the GRASS for SEE-ing you safely across the park.', ['🌿', '👀', '🙏']],
  ['Por favor', 'Please', 'You POUR a FAVOUR of juice and politely say please.', ['🧃', '🙏']],
  ['¿Dónde está el baño?', 'Where is the bathroom?', 'A bathtub with a DONut on its head asks where it belongs.', ['🛁', '🍩', '❓']],
  ['¿Cuánto cuesta?', 'How much does it cost?', 'A QUANTity of coins asks the shopkeeper the price.', ['🪙', '🏷️', '❓']],
  ['No entiendo', "I don't understand", 'A question mark wearing a confused frown says no, no.', ['❓', '😕', '🙅']],
  ['La cuenta, por favor', 'The bill, please', 'A COUNTing machine at the café prints the bill.', ['🧾', '🧮', '☕']],
  ['Ayuda', 'Help', 'A lifebuoy shouts EYE-YOU-DA! to get your attention.', ['🛟', '📣', '🆘']],
]);

export const STARTER_DECKS: Deck[] = [PLANETS, ELEMENTS, SPANISH];

export function findStarterDeck(id: string): Deck | undefined {
  return STARTER_DECKS.find((d) => d.id === id);
}
