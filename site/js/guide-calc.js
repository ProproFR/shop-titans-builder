// Calculs du guide « Groupe minimum » (fonctions pures, indicatives).
// Méthode : pour une classe, on construit l'équipement « meilleur objet par emplacement » pour chaque palier d'objets T
// (objets de tier ≤ T, qualité choisie, filtre de provenance), puis on cherche le plus petit T dont la stat atteint la cible.
// Les stats sont celles de la classe au niveau 1 + objets : ni compétences, ni enchantements chiffrés, ni bonus de champion.
import { D } from './data.js';
import { rankSlot, computeStats, newMods } from './calc.js';
import { slotTypes } from './hero.js';
import { ASSUME } from './tower-calc.js';

const W_DEF = { atk: 0, def: 1, hp: 0.001, eva: 0, crit: 0 };
const W_ATK = { atk: 1, def: 0, hp: 0, eva: 0, crit: 3 };
const cache = new Map();

/**
 * Progression d'une classe : tableau indexé par le palier T (1..maxItemTier) de {items, stats}.
 * @param {'def'|'atk'} kind  stat optimisée
 */
export function progression(cls, kind, quality, access) {
  const key = `${cls.id}|${kind}|${quality}|${access}`;
  if (cache.has(key)) return cache.get(key);
  const weights = kind === 'def' ? W_DEF : W_ATK;
  const lists = cls.slots.map((_, i) => rankSlot(D.items, slotTypes(cls, i), { maxTier: D.maxItemTier, quality, weights, mods: newMods(), access }).list);
  const prog = [null];
  for (let T = 1; T <= D.maxItemTier; T++) {
    const items = lists.map((l) => { const e = l.find((x) => x.item.tier <= T); return e ? e.item : null; });
    prog.push({ T, items, stats: computeStats({ cls, items, quality, mods: newMods() }) });
  }
  cache.set(key, prog);
  return prog;
}

/** Valeur de dégâts par tour : ATK × (1 + crit × (critDmg − 1)) × bonus d'élément. */
export const dpsValue = (st, elemBonus = 0) => st.atk * (1 + Math.min(1, st.crit) * (st.critDmg - 1)) * (1 + elemBonus);

/** Plus petit palier atteignant `target` pour la valeur donnée par `valueOf(stats)`, ou null. */
export function minTier(prog, target, valueOf) {
  for (let T = 1; T < prog.length; T++) if (valueOf(prog[T].stats) >= target) return T;
  return null;
}

/** Niveau de héros minimal pour équiper des objets de palier T (heroLevels.maxTier), ou null. */
export function levelForTier(T) {
  if (T === null) return null;
  const hit = D.heroLevels.find((l) => l.maxTier >= T);
  return hit ? hit.level : null;
}

/** Bonus d'élément appliqué si la classe correspond à la barrière (+20 %, cf. tower-calc). */
export const elemBonusOf = (cls, barrier) => (barrier && (cls.element === barrier || cls.element === 'Any') ? ASSUME.classElem : 0);

/** Meilleur enchantement d'élément pour un élément (valeur la plus haute), et l'échelle complète. */
export function elementEnchants(element) {
  const list = D.enchantments.filter((e) => e.type === 'Element' && e.element === element).sort((a, b) => a.value - b.value);
  return { best: list[list.length - 1] || null, ladder: list };
}

/** Compétence de leader T4 d'un champion. */
export const leaderOf = (champName, tier = 4) => D.skills.find((s) => s.type === 'Leader' && s.classes.includes(champName) && s.tier === tier) || null;

/**
 * Ligne d'analyse d'une classe tank pour les seuils d'un niveau.
 * @returns {{cls, maxDef:number, th:{[k:string]:{tier:number|null, level:number|null}}}}
 */
export function tankRow(cls, caps, quality, access) {
  const prog = progression(cls, 'def', quality, access);
  const th = {};
  for (const [k, v] of [[50, caps.c50], [70, caps.c70], [75, caps.c75]]) {
    const tier = minTier(prog, v, (s) => s.def);
    th[k] = { tier, level: levelForTier(tier) };
  }
  return { cls, maxDef: prog[prog.length - 1].stats.def, th };
}

/** Ligne d'analyse d'une classe DPS : palier mini pour fournir `perDps` de dégâts par tour. */
export function dpsRow(cls, perDps, barrier, quality, access) {
  const prog = progression(cls, 'atk', quality, access);
  const eb = elemBonusOf(cls, barrier);
  const tier = minTier(prog, perDps, (s) => dpsValue(s, eb));
  return { cls, elemBonus: eb, tier, level: levelForTier(tier), maxDps: dpsValue(prog[prog.length - 1].stats, eb) };
}

export const sortByTier = (a, b, f) => ((f(a) ?? 99) - (f(b) ?? 99));
