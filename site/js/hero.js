// Aides sur un héros sauvegardé : stats effectives (saisies ou estimées), plan de l'optimiseur.
import { D, findFamily } from './data.js';
import { QUALITY, skillsToMods, computeStats } from './calc.js';

export const heroClass = (hero) => D.classById.get(hero.classId);
export const lineageOf = (cls) => (cls.promotionOf ? D.classByName.get(cls.promotionOf) : cls);

/** Objets de compétence (skills.json) d'un héros. */
export function heroSkillObjects(hero) {
  return hero.skills.map((s) => { const f = findFamily(s.family); return f && f.tiers.get(s.tier) ? { fam: f, skill: f.tiers.get(s.tier) } : null; }).filter(Boolean);
}

/** Estimation d'après la classe, l'équipement (qualité par objet) et les compétences. EVA/CRIT en fraction. */
export function estimateStats(hero) {
  const cls = heroClass(hero);
  const items = hero.gear.map((g) => {
    const it = D.itemByName.get(g.item);
    if (!it) return null;
    const q = QUALITY[g.quality] ?? 1;
    return { ...it, atk: it.atk * q, def: it.def * q, hp: it.hp * q };
  });
  const mods = skillsToMods(heroSkillObjects(hero).map((x) => x.skill));
  return computeStats({ cls, items, quality: 'Normal', mods });
}

/**
 * Stats utilisées pour les calculs : valeurs saisies si présentes, sinon estimation.
 * @returns {{atk,def,hp,eva,crit,critDmg, entered:string[], estimated:boolean}} eva/crit en fraction.
 */
export function effectiveStats(hero) {
  const est = estimateStats(hero);
  const s = hero.stats || {};
  const entered = [];
  const pick = (k, e, scale = 1) => { if (typeof s[k] === 'number') { entered.push(k); return s[k] / scale; } return e; };
  const out = { atk: pick('atk', est.atk), def: pick('def', est.def), hp: pick('hp', est.hp), eva: pick('eva', est.eva, 100), crit: pick('crit', est.crit, 100), critDmg: est.critDmg };
  return { ...out, entered, estimated: entered.length < 5 };
}

/** Éléments possibles : classe + enchantements d'élément posés sur l'équipement. */
export function heroElements(hero) {
  const cls = heroClass(hero);
  const els = hero.gear.map((g) => (g.element && D.enchantByName.get(g.element) || {}).element).filter(Boolean);
  return { classElement: cls.element, gearElements: els };
}

/** Lien vers l'optimiseur avec les compétences du héros. */
export function optimizerLink(hero) {
  const cls = heroClass(hero);
  const p = new URLSearchParams({ cls: cls.name });
  if (hero.level !== D.maxLevel) p.set('lvl', hero.level);
  for (const s of hero.skills) { const f = findFamily(s.family); if (f) p.append('sk', `${f.key}~${s.tier}`); }
  return `#/optimizer?${p.toString()}`;
}

/** Types d'objet acceptés dans l'emplacement i (les armes « Dual Wield » des builds STC vont dans l'emplacement d'arme). */
export const slotTypes = (cls, i) => (i === 0 ? [...cls.slots[0], 'Dual Wield'] : cls.slots[i]);

export const emptyGear = (cls) => cls.slots.map(() => ({ item: '', quality: 'Normal' }));

/** Membre du composeur d'équipe (#/team) : "h~Classe~atk~def~hp~idHéros". */
export function memberParam(hero) {
  const st = effectiveStats(hero);
  return `h~${heroClass(hero).name}~${Math.round(st.atk)}~${Math.round(st.def)}~${Math.round(st.hp)}~${hero.id}`;
}
