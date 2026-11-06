// Chargement des JSON + index. Chemins relatifs (compatible GitHub Pages en sous-chemin).
const FILES = ['meta', 'classes', 'items', 'skills', 'enchantments', 'champions', 'quests', 'heroLevels', 'bis'];

export const D = {};

export async function loadData() {
  const out = await Promise.all(FILES.map(async (n) => {
    const url = new URL(`../data/${n}.json`, import.meta.url);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${n}.json: HTTP ${r.status}`);
    return r.json();
  }));
  FILES.forEach((n, i) => { D[n] = out[i]; });
  buildIndex();
  return D;
}

function buildIndex() {
  D.classById = new Map(D.classes.map((c) => [c.id, c]));
  D.classByName = new Map(D.classes.map((c) => [c.name, c]));
  D.baseClasses = D.classes.filter((c) => !c.promotionOf);
  D.itemByName = new Map(D.items.map((i) => [i.name, i]));
  D.championByName = new Map(D.champions.map((c) => [c.name, c]));
  D.bisByClassId = new Map(D.bis.heroes.map((b) => [b.id, b]));
  D.maxTierByLevel = new Map(D.heroLevels.map((l) => [l.level, l.maxTier]));
  D.maxLevel = Math.max(...D.heroLevels.map((l) => l.level));
  D.maxItemTier = Math.max(...D.items.map((i) => i.tier));
  // Compétences regroupées par famille+type : { key, family, type, tiers: Map(tier -> skill) }
  const fam = new Map();
  for (const s of D.skills) {
    const key = `${s.type}|${s.family}`;
    if (!fam.has(key)) fam.set(key, { key, family: s.family, type: s.type, classes: s.classes, tiers: new Map() });
    const f = fam.get(key);
    f.tiers.set(s.tier, s);
    for (const c of s.classes) if (!f.classes.includes(c)) f.classes = [...f.classes, c];
  }
  D.families = [...fam.values()];
  D.familyByKey = fam;
}

/** Une classe est-elle de type "héros" valide pour cet objet ? (exclut Familiar/Aurasong) */
export const CHAMPION_TYPES = new Set(['Familiar', 'Aurasong']);
