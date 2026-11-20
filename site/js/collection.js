// Collection d'objets : suivi des qualités léguées et ordre conseillé (les objets les plus rapides à compléter d'abord).
// L'effort est une estimation relative : il ne vient pas du jeu, il sert seulement à ranger les objets entre eux.
import { D } from './data.js';
import { getCollection, getPref, COL_UNLOCKED } from './store.js';

export const QUALITIES = ['Normal', 'Superior', 'Flawless', 'Epic', 'Legendary'];
export const FULL = 31; // les 5 qualités léguées
// Effort relatif de chaque qualité (≈ nombre de fabrications pour l'obtenir) : la Légendaire est de loin la plus longue.
const Q_EFFORT = [1, 2, 4, 10, 30];
// Origine : plan de base (atelier), coffre (clés), antiquités (jetons) ; les objets de packs payants restent à part.
const ORIGIN_EFFORT = { base: 1, chest: 2.5, antique: 3, paid: 6 };

/** Les mêmes grandes familles que le livre de collection du jeu. */
export const CATEGORIES = [
  { id: 'weapons', types: ['Sword', 'Axe', 'Dagger', 'Mace', 'Spear', 'Bow', 'Wand', 'Staff', 'Gun', 'Crossbow', 'Instrument', 'Dual Wield', 'Scythe', 'Catalyst'] },
  { id: 'armor', types: ['Heavy Armor', 'Light Armor', 'Clothes', 'Helmet', 'Rogue Hat', 'Magician Hat', 'Gauntlets', 'Gloves', 'Heavy Footwear', 'Light Footwear'] },
  { id: 'accessories', types: ['Herbal Medicine', 'Potion', 'Spell', 'Shield', 'Ring', 'Amulet', 'Cloak', 'Familiar', 'Aurasong', 'Idol', 'Quiver', 'Meal', 'Dessert'] },
];
const CAT_OF = new Map(CATEGORIES.flatMap((c) => c.types.map((t) => [t, c.id])));
export const categoryOf = (type) => CAT_OF.get(type) || 'accessories';

export const maskOf = (name, col = getCollection()) => col[name] || 0;
export const qualMask = (m) => m & FULL;
export const isUnlocked = (m) => !!(m & COL_UNLOCKED) || (m & FULL) > 0;
export const isComplete = (m) => (m & FULL) === FULL;
export const missingQualities = (m) => QUALITIES.filter((_, i) => !(m & (1 << i)));
/** Meilleure qualité déjà léguée (donc déjà fabriquée) pour cet objet, ou null. */
export function bestQuality(name, col = getCollection()) {
  const m = col[name] || 0;
  for (let i = QUALITIES.length - 1; i >= 0; i--) if (m & (1 << i)) return QUALITIES[i];
  return null;
}

/** Effort restant pour compléter un objet (qualités manquantes × palier × origine). */
export function effortOf(item, m) {
  const miss = QUALITIES.reduce((a, _, i) => a + (m & (1 << i) ? 0 : Q_EFFORT[i]), 0);
  return miss * (1 + item.tier) * (ORIGIN_EFFORT[item.origin || 'base'] || 2);
}

/** Objets à suivre (les packs payants seulement si demandé). */
export function trackedItems(withPaid = false) {
  return D.items.filter((it) => withPaid || (it.origin || 'base') !== 'paid');
}

/** Ordre conseillé : objets débloqués non complets, du plus rapide au plus long à compléter. */
export function completionOrder({ withPaid = false } = {}) {
  const col = getCollection();
  return trackedItems(withPaid)
    .map((it) => ({ it, m: col[it.name] || 0 }))
    .filter((x) => isUnlocked(x.m) && !isComplete(x.m))
    .map((x) => ({ ...x, effort: effortOf(x.it, x.m), missing: missingQualities(x.m) }))
    .sort((a, b) => a.effort - b.effort || a.it.tier - b.it.tier || a.it.name.localeCompare(b.it.name));
}

/** Avancement global ou d'un type : objets complets, qualités léguées. */
export function progress(items, col = getCollection()) {
  let done = 0, dots = 0, unlocked = 0;
  for (const it of items) {
    const m = col[it.name] || 0;
    if (isComplete(m)) done++;
    if (isUnlocked(m)) unlocked++;
    for (let i = 0; i < 5; i++) if (m & (1 << i)) dots++;
  }
  return { total: items.length, done, dots, dotsTotal: items.length * 5, unlocked };
}

/** Restreindre les conseils d'objets à ceux que vous avez débloqués ? (réglage de la page Collection, et collection non vide) */
export function onlyUnlockedActive() {
  return !!getPref('colOnlyUnlocked', false) && Object.keys(getCollection()).length > 0;
}
/** Un objet peut-il être conseillé ? */
export function canSuggest(name) {
  return !onlyUnlockedActive() || isUnlocked(getCollection()[name] || 0);
}
