// Noms français des types d'objets, des enchantements d'élément et des esprits, pour se repérer
// dans les listes quand le jeu est en français. Les données du site (et les builds STC) restent en
// anglais : on affiche « nom français (nom anglais) ».
// Traductions faites pour ce site, non officielles : les intitulés du jeu peuvent différer un peu.
import { getLang } from './i18n.js';

const fr = () => getLang() === 'fr';

const TYPES = {
  Sword: 'Épée', Axe: 'Hache', Dagger: 'Dague', Mace: 'Masse', Spear: 'Lance', Bow: 'Arc', Wand: 'Baguette',
  Staff: 'Bâton', Gun: 'Arme à feu', Crossbow: 'Arbalète', 'Heavy Armor': 'Armure lourde', 'Light Armor': 'Armure légère',
  Clothes: 'Vêtements', Helmet: 'Casque', 'Rogue Hat': 'Chapeau de voleur', 'Magician Hat': 'Chapeau de mage',
  Gauntlets: 'Gantelets', Gloves: 'Gants', 'Heavy Footwear': 'Bottes lourdes', 'Light Footwear': 'Chaussures légères',
  'Herbal Medicine': 'Remède', Potion: 'Potion', Spell: 'Sort', Shield: 'Bouclier', Ring: 'Anneau', Amulet: 'Amulette',
  Meal: 'Repas', Dessert: 'Dessert', Cloak: 'Cape', Instrument: 'Instrument', 'Dual Wield': 'Armes doubles',
  Quiver: 'Carquois', Catalyst: 'Catalyseur', Idol: 'Idole', Scythe: 'Faux', Mask: 'Masque', Familiar: 'Familier',
  Aurasong: 'Chant d\'aura',
};

const ELEMENTS = { Fire: 'Feu', Water: 'Eau', Air: 'Air', Earth: 'Terre', Light: 'Lumière', Dark: 'Ténèbres', Gold: 'Or' };

// Enchantements d'élément : mot propre à chaque niveau.
const ELEM_WORDS = {
  Ember: 'Braise', Flame: 'Flamme', Blaze: 'Brasier', Inferno: 'Inferno', Blistering: 'Fournaise',
  Bubble: 'Bulle', Tide: 'Marée', Flood: 'Crue', Torrent: 'Torrent', Maelstrom: 'Maelström',
  Breeze: 'Brise', Gale: 'Bourrasque', Tempest: 'Tempête', Hurricane: 'Ouragan', Tornado: 'Tornade',
  Nature: 'Nature', Wild: 'Sauvage', Primal: 'Primal', Primeval: 'Primordial', Gaia: 'Gaïa',
  Light: 'Lumière', Holy: 'Saint', Sacred: 'Sacré', Divine: 'Divin', Apotheosis: 'Apothéose',
  Corrupted: 'Corrompu', Unholy: 'Impie', Nightmare: 'Cauchemar', Abyssal: 'Abyssal', Oblivion: 'Oubli',
  Luxurious: 'Luxueux', Opulent: 'Opulent', Platinum: 'Platine',
};

const SPIRITS = {
  Ram: 'Bélier', Wolf: 'Loup', Ox: 'Bœuf', Eagle: 'Aigle', Viper: 'Vipère', Cat: 'Chat', Bunny: 'Lapin', Goose: 'Oie',
  Xolotl: 'Xolotl', Rhino: 'Rhinocéros', Owl: 'Hibou', Armadillo: 'Tatou', Lizard: 'Lézard', Horse: 'Cheval',
  Hippo: 'Hippopotame', Squirrel: 'Écureuil', Shark: 'Requin', Walrus: 'Morse', Lion: 'Lion', Bear: 'Ours',
  Mammoth: 'Mammouth', Dinosaur: 'Dinosaure', Tiger: 'Tigre', Quetzalcoatl: 'Quetzalcóatl', Phoenix: 'Phénix',
  Hydra: 'Hydre', Tarrasque: 'Tarasque', Carbuncle: 'Escarboucle', Chimera: 'Chimère', Kraken: 'Kraken',
  Christmas: 'Noël', Krampus: 'Krampus', Kirin: 'Kirin', Behemoth: 'Béhémoth', Ouroboros: 'Ouroboros',
  Bahamut: 'Bahamut', Leviathan: 'Léviathan', Griffin: 'Griffon', Titan: 'Titan', Ancestor: 'Ancêtre', "Mundra's": 'Mundra',
};

/** Type d'objet dans la langue de l'interface (« Baguette »). */
export const typeName = (type) => (fr() && TYPES[type]) || type;

/** Élément dans la langue de l'interface (« Feu »). */
export const elementName = (el) => (fr() && ELEMENTS[el]) || el;

/** Libellé d'un enchantement d'élément : « Feu +5 · Braise (Ember Element) ». */
export function enchantLabel(e) {
  if (!fr()) return `${e.name} (${e.element} +${e.value})`;
  const w = ELEM_WORDS[e.name.replace(/ Element$/, '')];
  return `${elementName(e.element)} +${e.value} · ${w || e.name}${w ? ` (${e.name})` : ''}`;
}

/** Libellé d'un esprit : « Esprit du bélier » → « Bélier (Ram Spirit) ». */
export function spiritLabel(name) {
  const w = fr() && SPIRITS[name.replace(/ Spirit$/, '')];
  return w ? `${w} (${name})` : name;
}

/** Esprits triés selon leur nom affiché (alphabétique en français). */
export const sortSpirits = (list) => [...list].sort((a, b) => spiritLabel(a.name).localeCompare(spiritLabel(b.name), 'fr'));

/** Libellé d'un objet dans une liste : « T13 · Baguette ». */
export const itemLabel = (it) => `T${it.tier} · ${typeName(it.type)}`;

const QUALITIES = { Normal: 'Normale', Superior: 'Supérieure', Flawless: 'Impeccable', Epic: 'Épique', Legendary: 'Légendaire' };
/** Qualité dans la langue de l'interface. */
export const qualityName = (q) => (fr() && QUALITIES[q]) || q;
