// Moteur de recommandation Tour / Tombeau des Titans : fonctions pures, simplifiées et indicatives.
// Hypothèses (non issues du jeu, à lire comme des ordres de grandeur) :
//  - dégâts subis = ATK du monstre × m(DEF), m interpolé linéairement entre : DEF 0 -> 1,5 ; moitié du seuil 50 % -> 1,0 ;
//    seuil 50 % -> 0,5 ; seuil 70 % -> 0,3 ; seuil 75 % -> 0,25 (plancher).
//  - defDown : DEF ×0,7 pour le groupe visé (−30 %, cf. « Can Opener ») ; evaDown : EVA ×0,5 (groupe visé ou tous) ; threatUp : menace ×1,5.
//  - dmgDown : ATK du groupe × (1 − fraction) ; enemyHp : PV du monstre × (1 + somme) ; enemyStronger : ATK du monstre ×1,2 ;
//    aoeUp : AoE ×1,5 ; critDown : plus de coups critiques ; enemyEva : −20 % de dégâts infligés ; enemyCrit : dégâts subis ×1,15.
//  - Tombeau : bonus d'ATK si l'élément de la classe (+20 %) ou d'un enchantement d'élément posé (+5 % chacun) correspond à la barrière.
import { D } from './data.js';
import { parseEffect, newMods, addMods } from './calc.js';
import { effectiveStats, heroClass, heroElements } from './hero.js';

export const ASSUME = { defDown: 0.3, evaDown: 0.5, threatUp: 1.5, strongerAtk: 1.2, aoeUp: 1.5, enemyEva: 0.2, enemyCrit: 1.15, classElem: 0.2, gearElem: 0.05 };
export const GROUPS = ['Fighter', 'Rogue', 'Spellcaster'];

/** Seuils de DEF d'un étage -> {c50,c70,c75}. */
export const capsOf = (floor) => ({ c50: floor.defCaps['50'], c70: floor.defCaps['70'], c75: floor.defCaps['75'] });

/** Multiplicateur de dégâts subis (1,5 à 0,25) pour une DEF donnée. */
export function damageMultiplier(def, caps) {
  const pts = [[0, 1.5], [caps.c50 / 2, 1], [caps.c50, 0.5], [caps.c70, 0.3], [caps.c75, 0.25]];
  if (def <= 0) return 1.5;
  for (let i = 1; i < pts.length; i++) {
    if (def <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * ((def - x0) / (x1 - x0)); }
  }
  return 0.25;
}

/** Seuil atteint : 0, 50, 70 ou 75. */
export const thresholdReached = (def, caps) => (def >= caps.c75 ? 75 : def >= caps.c70 ? 70 : def >= caps.c50 ? 50 : 0);

/** Fusionne les tags des modificateurs choisis (noms) en un jeu d'effets. */
export function combineModifiers(names) {
  const r = { threatUp: new Set(), defDown: new Set(), evaDown: new Set(), dmgDown: {}, enemyHp: 0, firstHit: false, critDown: false, critDmgDown: false,
    enemyCrit: false, enemyEva: false, aoeUp: false, breakUp: false, enemyStronger: false };
  for (const n of names) {
    const m = D.modifiers.modifiers.find((x) => x.name === n);
    if (!m) continue;
    const tg = m.tags || {};
    if (tg.threatUp) r.threatUp.add(tg.threatUp);
    if (tg.defDown) r.defDown.add(tg.defDown);
    if (tg.evaDown) (tg.evaDown === 'all' ? GROUPS : [tg.evaDown]).forEach((g) => r.evaDown.add(g));
    for (const [g, f] of Object.entries(tg.dmgDown || {})) r.dmgDown[g] = Math.max(r.dmgDown[g] || 0, f);
    if (tg.enemyHp) r.enemyHp += tg.enemyHp;
    for (const k of ['firstHit', 'critDown', 'critDmgDown', 'enemyCrit', 'enemyEva', 'aoeUp', 'breakUp', 'enemyStronger']) if (tg[k]) r[k] = true;
  }
  return r;
}

/** Candidat : héros sauvegardé ou champion, avec stats et métadonnées utiles. */
export function heroCandidate(hero) {
  const cls = heroClass(hero);
  const st = effectiveStats(hero);
  return { key: `h:${hero.id}`, kind: 'hero', hero, label: hero.name, cls, group: cls.group, threat: cls.threat, ...st, ...heroElements(hero) };
}
export function championCandidate(champ, tier = 4) {
  const leader = D.skills.find((s) => s.type === 'Leader' && s.classes.includes(champ.name) && s.tier === tier) || null;
  return { key: `c:${champ.name}`, kind: 'champion', champion: champ, tier, leader, label: champ.name, group: champ.group, threat: champ.threat,
    atk: champ.atk, def: champ.def, hp: champ.hp, eva: champ.eva, crit: champ.crit, critDmg: 2, entered: [], estimated: false, classElement: champ.element, gearElements: [] };
}

const median = (a) => { const b = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };

/**
 * Champion possédé : stats estimées à partir de sa puissance (lue sur sa carte) et du rapport
 * stats / puissance de vos héros du même groupe (Fighter, Rogue, Spellcaster), puis nuancées par le
 * profil du champion (plus d'ATK pour Lilu, plus de DEF pour Argon…). Estimation, signalée comme telle.
 */
export function ownedChampionCandidate(champ, owned, heroes, tier = 4) {
  const c = championCandidate(champ, tier);
  if (!owned || !owned.power) return c;
  const withPw = heroes.filter((x) => x.stats && x.stats.power > 0 && x.stats.atk > 0);
  const same = withPw.filter((x) => (D.classById.get(x.classId) || {}).group === champ.group);
  const pool = same.length >= 2 ? same : withPw;
  if (!pool.length) return c;
  const r = (k) => median(pool.map((x) => (x.stats[k] || 0) / x.stats.power));
  const grp = D.champions.filter((x) => x.group === champ.group);
  const avg = (k) => grp.reduce((a, x) => a + x[k], 0) / grp.length || 1;
  const tilt = (k) => Math.sqrt(champ[k] / avg(k) || 1);
  return { ...c, owned: true, level: owned.level, power: owned.power,
    atk: owned.power * r('atk') * tilt('atk'), def: owned.power * r('def') * tilt('def'), hp: owned.power * r('hp') * tilt('hp'), estimated: true };
}

/** Candidats champions : vos champions possédés s'ils sont renseignés, sinon tous (suggestion). */
export function championCandidates(owned, heroes, filter = () => true) {
  const byName = new Map((owned || []).map((o) => [o.name, o]));
  const list = D.champions.filter(filter).filter((c) => !byName.size || byName.has(c.name));
  return list.map((c) => (byName.size ? ownedChampionCandidate(c, byName.get(c.name), heroes) : championCandidate(c, 4)));
}

/** Évalue un groupe de candidats contre un monstre. */
export function evaluateParty(members, mob, fx, opts = {}) {
  // Bonus de leader (champion)
  let party = newMods();
  const champ = members.find((m) => m.kind === 'champion' && m.leader);
  if (champ) {
    const p = parseEffect(champ.leader.effect, { defaultTarget: 'party' });
    party = p.party;
    for (const pe of p.perEach) party = addMods(party, pe.mods, members.filter((x) => x.group === pe.group).length);
  }
  const mobAtk = mob.atk * (fx.enemyStronger ? ASSUME.strongerAtk : 1);
  const mobAoe = mob.aoe * (fx.aoeUp ? ASSUME.aoeUp : 1);
  const mobHp = mob.hp * (1 + fx.enemyHp);
  const rows = members.map((m) => {
    const defMul = fx.defDown.has(m.group) ? 1 - ASSUME.defDown : 1;
    const def = m.def * (1 + party.def / 100) * defMul;
    const hp = m.hp * (1 + party.hp / 100);
    let eva = m.eva + party.eva / 100;
    if (fx.evaDown.has(m.group)) eva *= ASSUME.evaDown;
    const evaEff = Math.min(0.9, eva);
    let atk = m.atk * (1 + party.atk / 100) * (1 - (fx.dmgDown[m.group] || 0));
    let elemBonus = 0;
    if (opts.barrier) {
      if (m.classElement === opts.barrier) elemBonus += ASSUME.classElem;
      elemBonus += ASSUME.gearElem * m.gearElements.filter((e) => e === opts.barrier).length;
      atk *= 1 + elemBonus;
    }
    const crit = fx.critDown ? 0 : Math.min(1, m.crit + party.crit / 100);
    const critDmg = fx.critDmgDown ? 1 + (m.critDmg - 1) * 0.5 : m.critDmg + party.critDmg / 100;
    const dps = atk * (1 + crit * (critDmg - 1)) * (fx.enemyEva ? 1 - ASSUME.enemyEva : 1);
    const threat = m.threat * (fx.threatUp.has(m.group) ? ASSUME.threatUp : 1);
    return { m, def, hp, eva: evaEff, atk, dps, threat, elemBonus, mult: damageMultiplier(def, mob.caps), reached: thresholdReached(def, mob.caps) };
  });
  const sumThreat = rows.reduce((a, r) => a + r.threat, 0) || 1;
  for (const r of rows) {
    r.prob = r.threat / sumThreat;
    const hit = (1 - r.eva) * (fx.enemyCrit ? ASSUME.enemyCrit : 1);
    r.hitDmg = mobAtk * r.mult * hit;
    r.perTurn = (r.prob * mobAtk + mobAoe) * r.mult * hit;
    r.turnsAlive = r.perTurn > 0 ? r.hp / r.perTurn : Infinity;
  }
  const dps = rows.reduce((a, r) => a + r.dps, 0);
  const turnsToKill = dps > 0 ? mobHp / dps : Infinity;
  const survive = Math.min(...rows.map((r) => r.turnsAlive));
  const ratio = Number.isFinite(survive) ? survive / (Number.isFinite(turnsToKill) ? Math.max(turnsToKill, 0.01) : 1e9) : 1e3;
  const tank = rows.reduce((a, r) => (r.def > a.def ? r : a), rows[0]);
  return { rows, dps, turnsToKill, survive, ratio, tank, mobHp, mobAtk, mobAoe, party };
}

function* combos(arr, k, start = 0, cur = []) {
  if (cur.length === k) { yield cur.slice(); return; }
  for (let i = start; i < arr.length; i++) { cur.push(arr[i]); yield* combos(arr, k, i + 1, cur); cur.pop(); }
}

/**
 * Meilleures compositions de `size` membres. Au plus un champion par équipe.
 * @returns {{members, ev}[]} triées par marge de survie décroissante (puis dégâts).
 */
export function recommend(candidates, size, mob, fx, opts = {}, top = 3) {
  const heroes = candidates.filter((c) => c.kind === 'hero');
  const champs = candidates.filter((c) => c.kind === 'champion');
  const pool = heroes.sort((a, b) => (b.atk + b.def + b.hp / 10) - (a.atk + a.def + a.hp / 10)).slice(0, 18);
  const n = Math.min(size, pool.length + (champs.length ? 1 : 0));
  if (n < 1) return [];
  const out = [];
  const consider = (members) => {
    if (!members.length) return; // sans héros sauvegardés, combos(pool, 0) renvoie un groupe vide
    const ev = evaluateParty(members, mob, fx, opts);
    out.push({ members, ev });
  };
  for (const c of combos(pool, Math.min(n, pool.length))) consider(c);
  if (champs.length && pool.length >= n - 1) {
    for (const ch of champs) for (const c of combos(pool, n - 1)) consider([...c, ch]);
  }
  // Au-delà d'une marge de survie ×3, on départage par les dégâts.
  const cap = (r) => Math.min(r.ev.ratio, 3);
  out.sort((a, b) => cap(b) - cap(a) || b.ev.dps - a.ev.dps);
  return out.slice(0, top);
}

/** Phrases explicatives (clés i18n + variables) pour une composition. */
export function explain(res, fx) {
  const reasons = [];
  const { ev } = res;
  reasons.push({ k: 'tw.r.tank', v: { name: ev.tank.m.label, reached: ev.tank.reached ? `${ev.tank.reached} %` : '–' } });
  reasons.push({ k: 'tw.r.dmg', v: { dps: Math.round(ev.dps), turns: Number.isFinite(ev.turnsToKill) ? (Math.round(ev.turnsToKill * 10) / 10) : '∞' } });
  reasons.push({ k: 'tw.r.surv', v: { turns: Number.isFinite(ev.survive) ? (Math.round(ev.survive * 10) / 10) : '∞' } });
  for (const r of ev.rows) {
    const cut = fx.dmgDown[r.m.group];
    if (cut) reasons.push({ k: 'tw.r.pen', v: { name: r.m.label, group: r.m.group, pct: Math.round(cut * 100) } });
  }
  if (fx.defDown.size) reasons.push({ k: 'tw.r.defDown', v: { groups: [...fx.defDown].join(', ') } });
  if (fx.threatUp.size) reasons.push({ k: 'tw.r.threat', v: { groups: [...fx.threatUp].join(', ') } });
  return reasons;
}
