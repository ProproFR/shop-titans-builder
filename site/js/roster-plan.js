// Plan d'effectif : cible de référence (vrai boss de quête adapté à vos héros), meilleurs groupes,
// héros remplaçables et classes à recruter. Calcul indicatif : il compare des groupes entre eux avec le
// moteur de tower-calc.js, il ne prédit pas un combat précis.
import { D } from './data.js';
import { heroCandidate, championCandidates, combineModifiers, recommend, capsOf } from './tower-calc.js';
import { estimateStats, effectiveStats, slotTypes, heroClass } from './hero.js';
import { QUALITY, PROFILES, defaultRole, rankSlot, newMods } from './calc.js';
import { listChampions } from './store.js';

export const ELEMS = ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark'];
const FX = combineModifiers([]);
// Ancien monstre de référence, gardé en secours si les données de quêtes manquent.
const FALLBACK = { name: '', difficulty: '', mob: { hp: 80000, atk: 70, aoe: 40, caps: { c50: 3200, c70: 6400, c75: 19200 } } };
// Cible : le boss le plus dur que votre meilleur groupe bat encore avec une marge de survie ≥ 1,5.
// Classement des groupes : une marge ≥ 1,2 suffit (le groupe survit au combat), on départage ensuite par les dégâts.
const TARGET_RATIO = 1.5;
export const SAFE = 1.2;
// Héros examinés par groupe : les 14 meilleurs candidats (rapide sur téléphone, même résultat en pratique).
const POOL = 14;
const QUALITY_ORDER = ['Normal', 'Superior', 'Flawless', 'Epic', 'Legendary'];

const quantile = (a, q) => { const b = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * q))] : null; };
const median = (a) => quantile(a, 0.5);
const sigOf = (heroes, size) => `${size}|${heroes.map((x) => `${x.id}:${x.classId}:${x.level}:${(x.stats && [x.stats.atk, x.stats.def, x.stats.hp].join(','))}`).join(';')}`;

/** Tous les niveaux de boss (Quêtes principales, STC Hub), du plus facile au plus dur (PV). */
function bossLevels() {
  const out = [];
  for (const a of (D.questcaps && D.questcaps.areas) || []) for (const L of a.levels) {
    if (!L.hp || !L.defCaps) continue;
    out.push({ name: a.name, difficulty: L.difficulty, mob: { hp: L.hp, atk: L.atk, aoe: L.aoe, caps: capsOf(L) } });
  }
  return out.sort((x, y) => x.mob.hp - y.mob.hp || x.mob.atk - y.mob.atk);
}

const targetCache = new Map();
/**
 * Boss de référence : le plus dur que votre meilleur groupe général bat encore avec de la marge.
 * Assez fort pour que la survie compte (tank, PV) autant que les dégâts ; recalculé quand vos héros changent.
 */
export function teamTarget(heroes, size = 4) {
  if (!heroes.length) return FALLBACK;
  const sig = sigOf(heroes, size);
  if (targetCache.has(sig)) return targetCache.get(sig);
  const levels = bossLevels();
  if (!levels.length) return FALLBACK;
  const cands = heroes.map(heroCandidate);
  const ratioAt = (i) => { const r = recommend(cands.slice(), size, levels[i].mob, FX, { safe: SAFE, pool: POOL }, 1)[0]; return r ? r.ev.ratio : 0; };
  // Recherche dichotomique (la marge baisse quand le boss se renforce).
  let lo = 0, hi = levels.length - 1, best = 0;
  if (ratioAt(hi) >= TARGET_RATIO) best = hi;
  else {
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (ratioAt(mid) >= TARGET_RATIO) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  }
  const out = levels[best];
  targetCache.set(sig, out);
  return out;
}

/** Meilleur groupe pour un élément ('' = groupe général, sans champion), avec les candidats donnés. */
export function runTeam(cands, heroes, size, el, mob, fx = FX) {
  const champs = el ? championCandidates(listChampions(), heroes, (c) => c.element === el) : [];
  return recommend([...cands, ...champs], size, mob, fx, el ? { barrier: el, elemFocus: true, safe: SAFE, pool: POOL } : { safe: SAFE, pool: POOL }, 1)[0] || null;
}

/** Gain relatif d'un groupe sur un autre : marge de survie (jusqu'à SAFE), puis dégâts — le même ordre que le classement. */
export function gainBetween(after, before) {
  if (!before) return after ? 1 : 0;
  if (!after) return -1;
  const a = Math.min(after.ev.ratio, SAFE), b = Math.min(before.ev.ratio, SAFE);
  if (Math.abs(a - b) > 1e-6) return b > 0 ? a / b - 1 : 1;
  return before.ev.dps > 0 ? after.ev.dps / before.ev.dps - 1 : 0;
}

/**
 * Profil d'équipement visé pour une recrue : celui de vos héros les mieux équipés (quart supérieur :
 * niveau, palier et qualité). Une recrue n'a d'intérêt que si on la monte au niveau de vos meilleurs héros.
 */
export function typicalKit(heroes, q = 0.75) {
  const tiers = [], quals = [];
  for (const x of heroes) for (const g of x.gear || []) {
    const it = D.itemByName.get(g.item);
    if (it) { tiers.push(it.tier); quals.push(QUALITY_ORDER.indexOf(g.quality)); }
  }
  return {
    level: quantile(heroes.map((x) => x.level), q) || 1,
    tier: quantile(tiers, q) || 1,
    quality: QUALITY_ORDER[Math.max(0, quantile(quals, q) ?? 0)] || 'Normal',
  };
}

const PROFILE_OF = { tank: 'tank', rogue: 'balanced', caster: 'dps' };
const bestEnchant = (el) => D.enchantments.filter((e) => e.type === 'Element' && e.element === el).sort((a, b) => b.value - a.value)[0] || null;

/**
 * Modèle « stats réelles » de vos héros : pour chaque stat, réel ≈ a × base de la classe + b × apport des objets
 * (moindres carrés sur vos héros). a reflète surtout le niveau, b la qualité, les compétences et les graines.
 */
export function statModel(heroes) {
  const pts = heroes.filter((x) => x.stats && x.stats.atk > 0 && x.stats.hp > 0 && D.classById.has(x.classId))
    .map((x) => ({ c: heroClass(x), e: estimateStats({ ...x, skills: [] }), r: effectiveStats(x) }));
  const fit = (k) => {
    let suu = 0, svv = 0, suv = 0, suy = 0, svy = 0;
    for (const p of pts) { const u = p.c[k], v = Math.max(0, p.e[k] - p.c[k]), y = p.r[k]; suu += u * u; svv += v * v; suv += u * v; suy += u * y; svy += v * y; }
    const det = suu * svv - suv * suv;
    if (pts.length < 3 || !det) return { a: 0, b: svv ? svy / svv : 1 };
    let a = (suy * svv - svy * suv) / det, b = (svy * suu - suy * suv) / det;
    if (a < 0) { a = 0; b = svy / svv; }
    if (b < 0) { b = 0; a = suy / suu; }
    return { a, b };
  };
  return { atk: fit('atk'), def: fit('def'), hp: fit('hp'), n: pts.length };
}

/**
 * Recrue fictive d'une classe, montée au niveau et à l'équipement habituels de vos héros :
 * objets du palier et de la qualité habituels, stats passées par le modèle tiré de vos héros (statModel).
 */
export function recruitCandidate(cls, heroes, el = cls.element, kit = typicalKit(heroes), model = statModel(heroes)) {
  const role = defaultRole(cls);
  const weights = PROFILES[PROFILE_OF[role]] || PROFILES.balanced;
  const ench = el && el !== 'Any' ? bestEnchant(el) : null;
  const gear = cls.slots.map((_, i) => {
    const top = rankSlot(D.items, slotTypes(cls, i), { maxTier: kit.tier, access: 'free', weights, quality: kit.quality, mods: newMods() }).list[0];
    return { item: top ? top.item.name : '', quality: kit.quality, element: ench ? ench.name : '' };
  });
  const fake = { id: `recruit-${cls.id}-${el}`, name: cls.name, classId: cls.id, level: kit.level, skills: [], gear, stats: {} };
  const est = estimateStats(fake);
  const st = (k) => model[k].a * cls[k] + model[k].b * Math.max(0, est[k] - cls[k]);
  return {
    key: `r:${cls.id}:${el}`, kind: 'hero', recruit: true, hero: fake, label: cls.name, cls, group: cls.group, threat: cls.threat,
    atk: st('atk'), def: st('def'), hp: st('hp'), eva: est.eva, crit: est.crit, critDmg: est.critDmg,
    entered: [], estimated: true, classElement: cls.element, gearElements: ench ? cls.slots.map(() => el) : [], recruitEl: el,
  };
}

/** Éléments différents posés sur l'équipement d'un héros. */
const gearElems = (hero) => new Set((hero.gear || []).map((g) => (g.element && D.enchantByName.get(g.element) || {}).element).filter(Boolean));
const powerOf = (hero) => { const st = effectiveStats(hero); return st.atk + st.def + st.hp * 10; };

/**
 * Signes de faiblesse d'un héros dans votre effectif : stats parmi le tiers le plus faible, éléments mélangés
 * (3 ou plus) ou un héros plus fort de la même classe. Un héros sans groupe et faible est à remplacer en priorité.
 * @returns {Map<string, {power:number, low:boolean, mixed:boolean, stronger:object|null, weak:boolean}>}
 */
export function weakFlags(heroes) {
  const pw = new Map(heroes.map((x) => [x.id, powerOf(x)]));
  const sorted = [...pw.values()].sort((a, b) => a - b);
  const cut = sorted[Math.floor(sorted.length / 3)] ?? 0;
  const out = new Map();
  for (const hero of heroes) {
    const power = pw.get(hero.id);
    const stronger = heroes.filter((x) => x.id !== hero.id && x.classId === hero.classId && pw.get(x.id) > power).sort((a, b) => pw.get(b.id) - pw.get(a.id))[0] || null;
    const low = power <= cut, mixed = gearElems(hero).size >= 3;
    out.set(hero.id, { power, low, mixed, stronger, weak: low || mixed || !!stronger });
  }
  return out;
}

/**
 * Plan complet : groupes actuels, perte si l'on retire chaque héros, gain de chaque classe recrutée,
 * puis remplacements conseillés (héros qui sort → classe qui entre), au plus `maxSwaps`.
 */
export function rosterPlan(heroes, size = 4, { maxSwaps = 3, kitQ = 0.5 } = {}) {
  heroes = heroes.filter((x) => D.classById.has(x.classId));
  const target = teamTarget(heroes, size);
  const mob = target.mob;
  const keys = ['', ...ELEMS];
  const cands = heroes.map(heroCandidate);
  const base = Object.fromEntries(keys.map((k) => [k, runTeam(cands, heroes, size, k, mob)]));
  const memberIds = (res) => new Set(res ? res.members.filter((m) => m.hero && !m.recruit).map((m) => m.hero.id) : []);
  const usage = new Map(heroes.map((x) => [x.id, keys.filter((k) => memberIds(base[k]).has(x.id))]));
  const without = (id, extra = []) => [...cands.filter((c) => c.hero.id !== id), ...extra];

  // Perte quand on retire un héros (seulement les groupes où il joue : ailleurs, rien ne change).
  const flags = weakFlags(heroes);
  const info = heroes.map((hero) => {
    const cls = heroClass(hero);
    const losses = {};
    for (const k of usage.get(hero.id)) losses[k] = -gainBetween(runTeam(without(hero.id), heroes, size, k, mob), base[k]);
    const loss = Object.values(losses).reduce((a, b) => a + Math.max(0, b), 0);
    return { hero, cls, teams: usage.get(hero.id), losses, loss, ...flags.get(hero.id) };
  });

  // Gain de chaque classe promue si l'on en recrutait un (montée au niveau habituel).
  const kit = typicalKit(heroes, kitQ);
  const model = statModel(heroes);
  const owned = new Map();
  for (const x of heroes) owned.set(x.classId, (owned.get(x.classId) || 0) + 1);
  const recruits = [];
  for (const cls of D.classes.filter((c) => c.promotionOf)) {
    const els = cls.element === 'Any' ? ELEMS : [cls.element];
    let best = null;
    for (const el of els) {
      const rc = recruitCandidate(cls, heroes, el, kit, model);
      const gains = {};
      for (const k of ['', el]) {
        const res = runTeam([...cands, rc], heroes, size, k, mob);
        gains[k] = res && res.members.includes(rc) ? Math.max(0, gainBetween(res, base[k])) : 0;
      }
      const gain = Object.values(gains).reduce((a, b) => a + b, 0);
      if (!best || gain > best.gain) best = { cls, el, rc, gains, gain };
    }
    best.owned = owned.get(cls.id) || 0;
    recruits.push(best);
  }
  recruits.sort((a, b) => b.gain - a.gain);

  // Remplacements : on teste les meilleures recrues contre les héros qui coûtent le moins à retirer.
  const replaceable = info.filter((x) => x.loss < 0.03).sort((a, b) => a.loss - b.loss || a.power - b.power);
  const topR = recruits.filter((r) => r.gain > 0.02).slice(0, 5);
  const topH = replaceable.slice(0, 8);
  const tries = [];
  for (const r of topR) for (const x of topH) {
    const affected = new Set(['', r.el, ...x.teams]);
    const gains = {};
    for (const k of affected) gains[k] = gainBetween(runTeam(without(x.hero.id, [r.rc]), heroes, size, k, mob), base[k]);
    const net = Object.values(gains).reduce((a, b) => a + b, 0);
    tries.push({ out: x, recruit: r, gains, net });
  }
  tries.sort((a, b) => b.net - a.net || a.out.power - b.out.power);
  const swaps = [], usedH = new Set(), usedC = new Set(), usedEl = new Set();
  for (const s of tries) {
    if (swaps.length >= maxSwaps) break;
    if (s.net <= 0.02 || usedH.has(s.out.hero.id) || usedC.has(s.recruit.cls.id) || usedEl.has(s.recruit.el)) continue;
    swaps.push(s); usedH.add(s.out.hero.id); usedC.add(s.recruit.cls.id); usedEl.add(s.recruit.el);
  }
  return { target, base, info, recruits, replaceable, swaps, kit, size };
}
