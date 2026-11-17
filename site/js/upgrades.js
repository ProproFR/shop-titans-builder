// Améliorations prioritaires : pour chaque héros enregistré, on liste les améliorations possibles
// (qualité, objet, compétence, élément, esprit), on estime le gain de « valeur de combat » de chacune,
// puis on les classe toutes ensemble : gain × importance du héros ÷ effort.
// Calcul indicatif : il compare des améliorations entre elles, il ne prédit pas un combat.
import { D, findFamily } from './data.js';
import { QUALITY, PROFILES, scoreItem, newMods, defaultRole } from './calc.js';
import { heroClass, lineageOf, estimateStats, effectiveStats, heroSkillObjects } from './hero.js';
import { skillsToMods } from './calc.js';
import { heroCandidate, championCandidates, combineModifiers, recommend } from './tower-calc.js';
import { listChampions } from './store.js';
import { topSkills, heroSkillCtx } from './advisor.js';
import { recommendedEnchants } from './bis-plan.js';

export const QUALITY_ORDER = ['Normal', 'Superior', 'Flawless', 'Epic', 'Legendary'];
// Effort relatif (1 = facile, 5 = très coûteux). Monter en Légendaire coûte bien plus que passer en Supérieur.
const QUALITY_EFFORT = { Superior: 1, Flawless: 2, Epic: 3, Legendary: 5 };
const EFFORT = { item: 3, skill: 2, element: 1, spirit: 2, skillSwap: 4 };
// Estimations pour ce que les stats ne montrent pas (barrière élémentaire, effets d'esprit).
const ELEM_GAIN_PER_POINT = 0.001; // +0,1 % de valeur par point d'élément ajouté
const SPIRIT_GAIN = 0.03;          // +3 % pour un esprit sur un objet qui n'en a pas
const EVA_CAP = 0.78;
const ROLE_W = { tank: { o: 0.25, s: 0.75 }, rogue: { o: 0.55, s: 0.45 }, caster: { o: 0.7, s: 0.3 } };
const REF_MOB = { hp: 80000, atk: 70, aoe: 40, caps: { c50: 3200, c70: 6400, c75: 19200 } };

/**
 * Valeur de combat d'un ensemble de stats : attaque (avec critiques) × survie (PV, DEF, esquive plafonnée),
 * pondérées selon le rôle de la classe. Seuls les rapports entre deux valeurs ont un sens.
 */
export function combatValue(st, role) {
  const w = ROLE_W[role] || ROLE_W.tank;
  const off = Math.max(1, st.atk) * (1 + Math.min(1, st.crit || 0) * Math.max(0, (st.critDmg || 2) - 1));
  const sur = Math.max(1, st.hp) * (1 + Math.max(0, st.def) / 2000) / (1 - Math.min(st.eva || 0, EVA_CAP));
  return off ** w.o * sur ** w.s;
}

const clone = (hero) => ({ ...hero, gear: hero.gear.map((g) => ({ ...g })), skills: hero.skills.map((s) => ({ ...s })) });

/**
 * Gain relatif (0,05 = +5 %) d'une modification du héros. La différence de stats est calculée sur
 * l'estimation (avant / après), puis ajoutée aux stats réelles lues sur la capture : le gain reste
 * proportionné au vrai niveau du héros, même si l'estimation brute est imparfaite.
 */
function gainOf(hero, role, mutate) {
  const base = effectiveStats(hero);
  const e1 = estimateStats(hero);
  const h2 = clone(hero); mutate(h2);
  const e2 = estimateStats(h2);
  const after = { ...base };
  for (const k of ['atk', 'def', 'hp', 'eva', 'crit', 'critDmg']) after[k] = Math.max(0, (base[k] || 0) + ((e2[k] || 0) - (e1[k] || 0)));
  const before = combatValue(base, role);
  return before > 0 ? combatValue(after, role) / before - 1 : 0;
}

/** Variante BiS STC la plus proche de l'équipement actuel (même objets), ou null. */
function closestBis(cls, hero) {
  const bis = D.bisByClassId.get(lineageOf(cls).id);
  if (!bis || !bis.variants.length) return null;
  let best = null;
  for (const v of bis.variants) {
    const same = v.slots.filter((s, i) => s && hero.gear[i] && s.name === hero.gear[i].item).length;
    if (!best || same > best.same) best = { v, same };
  }
  return best.v;
}

/** Élément principal du héros : celui de ses enchantements (le plus fréquent), sinon celui de sa classe. */
function mainElement(hero, cls) {
  const n = {};
  for (const g of hero.gear) { const e = g.element && D.enchantByName.get(g.element); if (e) n[e.element] = (n[e.element] || 0) + 1; }
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : (cls.element && cls.element !== 'All' ? cls.element : null);
}
const bestEnchant = (el) => D.enchantments.filter((e) => e.type === 'Element' && e.element === el).sort((a, b) => b.value - a.value)[0] || null;

/** Améliorations possibles pour un héros. */
export function heroUpgrades(hero) {
  const cls = heroClass(hero);
  if (!cls) return [];
  const role = defaultRole(cls);
  const out = [];
  const add = (u) => { if (u.gain > 0.001) out.push({ hero, cls, ...u }); };
  const maxTier = D.maxTierByLevel.get(Math.min(hero.level || D.maxLevel, D.maxLevel)) || D.maxItemTier;
  const bis = closestBis(cls, hero);
  const prof = PROFILES[role === 'tank' ? 'tank' : 'dps'];

  const recEnch = recommendedEnchants(D.bisByClassId.get(lineageOf(cls).id), hero, cls);
  hero.gear.forEach((g, i) => {
    const it = D.itemByName.get(g.item);
    // 1) Qualité : étape suivante seulement.
    if (it) {
      const qi = QUALITY_ORDER.indexOf(g.quality || 'Normal');
      if (qi >= 0 && qi < QUALITY_ORDER.length - 1) {
        const next = QUALITY_ORDER[qi + 1];
        add({ kind: 'quality', slot: i, item: it.name, from: g.quality || 'Normal', to: next, effort: QUALITY_EFFORT[next],
          gain: gainOf(hero, role, (h2) => { h2.gear[i].quality = next; }) });
      }
    }
    // 2) Objet : l'objet BiS STC de cet emplacement, sinon le meilleur objet accessible (palier max du héros).
    const types = new Set(cls.slots[i]); // (« Dual Wield » seulement via un build BiS)
    const cands = [];
    const bisSlot = bis && bis.slots[i];
    if (bisSlot && D.itemByName.has(bisSlot.name)) cands.push({ item: D.itemByName.get(bisSlot.name), bis: true });
    const mods = skillsToMods(heroSkillObjects(hero).map((x) => x.skill));
    const pool = D.items.filter((x) => types.has(x.type) && x.tier <= maxTier && (x.origin || 'base') !== 'paid')
      .map((x) => ({ x, s: scoreItem(x, prof, g.quality || 'Normal', mods || newMods()) })).sort((a, b) => b.s - a.s).slice(0, 2);
    for (const p of pool) if (!cands.some((c) => c.item.name === p.x.name)) cands.push({ item: p.x, bis: false });
    let bestItem = null;
    for (const c of cands) {
      if (it && c.item.name === it.name) continue;
      const gain = gainOf(hero, role, (h2) => { h2.gear[i].item = c.item.name; });
      if (!bestItem || gain > bestItem.gain) bestItem = { ...c, gain };
    }
    if (bestItem && bestItem.gain >= 0.02) {
      add({ kind: 'item', slot: i, item: it ? it.name : '', to: bestItem.item.name, toTier: bestItem.item.tier, bis: bestItem.bis,
        effort: EFFORT.item + (it && bestItem.item.tier > it.tier + 1 ? 1 : 0), gain: bestItem.gain });
    }
    // 3) Élément : absent ou plus faible que le meilleur enchantement de l'élément du héros.
    const el = mainElement(hero, cls);
    const best = el && bestEnchant(el);
    const cur = g.element && D.enchantByName.get(g.element);
    // (un autre élément déjà posé est un choix volontaire, ex. Spellknight multi-éléments : on n'y touche pas)
    if (it && best && !(it.builtInElement) && (!cur || cur.element === el)) {
      const delta = best.value - (cur ? cur.value : 0);
      if (delta > 0) add({ kind: 'element', slot: i, item: it.name, from: cur ? cur.name : '', to: best.name, effort: EFFORT.element, gain: delta * ELEM_GAIN_PER_POINT, estimate: true });
    }
    // 4) Esprit : objet sans esprit.
    if (it && !g.spirit && !it.builtInSpirit) {
      const sugg = (recEnch[i] && recEnch[i].spirit) || '';
      add({ kind: 'spirit', slot: i, item: it.name, to: sugg, effort: EFFORT.spirit, gain: SPIRIT_GAIN, estimate: true });
    }
  });

  // 5) Compétences : palier suivant.
  hero.skills.forEach((s, k) => {
    const f = findFamily(s.family);
    if (!f) return;
    const tiers = [...f.tiers.keys()].sort((a, b) => a - b);
    const next = tiers.find((x) => x > s.tier);
    if (!next) return;
    add({ kind: 'skill', slot: k, item: s.family, from: s.tier, to: next, effort: EFFORT.skill,
      gain: gainOf(hero, role, (h2) => { h2.skills[k].tier = next; }) });
  });

  // 6) Compétence à remplacer : absente des 4 conseillées pour la classe (même tri que le conseiller).
  const rec = topSkills(cls, role, 4, heroSkillCtx(hero)); // adaptées à l'équipement porté
  const owned = new Set(hero.skills.map((s) => s.family));
  const missing = rec.filter((r) => !owned.has(r.family));
  const left = missing.slice(); // chaque compétence conseillée ne remplace qu'une seule compétence
  hero.skills.forEach((s, k) => {
    if (rec.some((r) => r.family === s.family) || !left.length) return;
    let best = null;
    for (const r of left) {
      const gain = gainOf(hero, role, (h2) => { h2.skills[k] = { family: r.family, tier: r.tier }; });
      if (!best || gain > best.gain) best = { ...r, gain };
    }
    // Effet souvent hors stats (soin, menace…) : au moins +2 % quand la compétence conseillée remplace une non conseillée.
    left.splice(left.findIndex((r) => r.family === best.family), 1);
    add({ kind: 'skillSwap', slot: k, item: s.family, to: best.family, toTier: best.tier, effort: EFFORT.skillSwap, gain: Math.max(best.gain, 0.02), estimate: best.gain < 0.02 });
  });

  // Esquive au-delà du plafond : rien ne la rend utile, on le signale (sans gain chiffré).
  const est = estimateStats(hero);
  const evaShown = hero.stats && typeof hero.stats.eva === 'number' ? hero.stats.eva / 100 : est.eva;
  if (est.eva > EVA_CAP + 0.02) out.push({ hero, cls, kind: 'evaCap', gain: 0, effort: 1, waste: Math.round((est.eva - EVA_CAP) * 100), evaShown });
  return out;
}

/** Importance des héros : présents dans le meilleur groupe général (×1,6) ou d'un élément (×1,3). */
export function heroWeights(heroes, size = 4) {
  const w = new Map(heroes.map((x) => [x.id, 1]));
  if (!heroes.length) return w;
  const cands = heroes.map(heroCandidate);
  const fx = combineModifiers([]);
  w.champions = new Set();
  const mark = (res, k) => { if (res) for (const m of res.members) { if (m.hero) w.set(m.hero.id, Math.max(w.get(m.hero.id), k)); else if (m.kind === 'champion') w.champions.add(m.name || m.label); } };
  mark(recommend(cands.slice(), size, REF_MOB, fx, {}, 1)[0], 1.6);
  for (const el of ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark']) {
    const champs = championCandidates(listChampions(), heroes, (c) => c.element === el);
    mark(recommend([...cands, ...champs], size, REF_MOB, fx, { barrier: el, elemFocus: true }, 1)[0], 1.3);
  }
  return w;
}

/** Toutes les améliorations, classées par priorité décroissante. */
export function rankUpgrades(heroes) {
  const weights = heroWeights(heroes);
  const all = [];
  for (const hero of heroes) {
    const wgt = weights.get(hero.id) || 1;
    for (const u of heroUpgrades(hero)) all.push({ ...u, weight: wgt, priority: (u.gain * 100 * wgt) / u.effort });
  }
  return all.sort((a, b) => b.priority - a.priority || b.gain - a.gain);
}

// --- Graines : répartir le stock là où il rapporte le plus ---
const SEED_GAIN = { atk: 4, def: 4, hp: 1 }; // Puissance +4 ATK, Résistance +4 DEF, Vitalité +1 PV (par graine)

/**
 * Plan de graines : distribue le stock (par paquets de 10) au héros pour qui le paquet augmente le plus la
 * valeur de combat (× importance dans vos équipes), sans dépasser son maximum. Seuls les héros dont les
 * graines consommées sont renseignées sont pris en compte.
 * @returns {{alloc: Map<heroId, {hero, atk, def, hp, gain}>, unknown: hero[], left: {atk, def, hp}}}
 */
export function seedPlan(heroes, stock, weights = new Map()) {
  const known = heroes.filter((x) => x.seeds && ['atk', 'def', 'hp'].some((k) => x.seeds[k] != null));
  const unknown = heroes.filter((x) => !known.includes(x));
  const st = new Map(known.map((x) => [x.id, { ...effectiveStats(x) }]));
  const room = new Map(known.map((x) => [x.id, Object.fromEntries(['atk', 'def', 'hp'].map((k) => [k, Math.max(0, (x.seeds[`${k}Max`] || 80) - (x.seeds[k] || 0))]))]));
  const alloc = new Map();
  const left = { ...stock };
  for (let guard = 0; guard < 400; guard++) {
    let best = null;
    for (const k of ['atk', 'def', 'hp']) {
      if (left[k] <= 0) continue;
      for (const x of known) {
        const n = Math.min(10, left[k], room.get(x.id)[k]); if (n <= 0) continue;
        const cls = heroClass(x); if (!cls) continue;
        const role = defaultRole(cls);
        const a = st.get(x.id); const b = { ...a, [k]: (a[k] || 0) + n * SEED_GAIN[k] };
        const g = (combatValue(b, role) / combatValue(a, role) - 1) * (weights.get(x.id) || 1) / n;
        if (!best || g > best.g) best = { x, k, n, g, b, raw: combatValue(b, role) / combatValue(a, role) - 1 };
      }
    }
    if (!best) break;
    st.set(best.x.id, best.b); room.get(best.x.id)[best.k] -= best.n; left[best.k] -= best.n;
    const e = alloc.get(best.x.id) || { hero: best.x, atk: 0, def: 0, hp: 0, gain: 0 };
    e[best.k] += best.n; e.gain = (1 + e.gain) * (1 + best.raw) - 1; alloc.set(best.x.id, e);
  }
  return { alloc, unknown, left };
}
