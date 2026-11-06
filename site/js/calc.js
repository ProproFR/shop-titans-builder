// Formules de calcul : fonctions pures, sans accès au DOM.
// Source des formules : st-central.net/combat-compendium (calcul indicatif).

/** Multiplicateur de qualité appliqué aux stats ATK/DEF/HP des objets. */
export const QUALITY = { Normal: 1, Superior: 1.25, Flawless: 1.5, Epic: 2, Legendary: 3 };

/** Profils de pondération pour l'optimiseur. eva/crit sont en points de pourcentage. */
export const PROFILES = {
  dps: { atk: 1, def: 0.2, hp: 0.2, eva: 2, crit: 3 },
  tank: { atk: 0.2, def: 1, hp: 1, eva: 2, crit: 0.5 },
  balanced: { atk: 0.6, def: 0.6, hp: 0.5, eva: 1.5, crit: 1.5 },
};

const NUM_FIELDS = ['atk', 'def', 'hp', 'hpFlat', 'crit', 'critDmg', 'eva', 'equip'];

export const newMods = () => ({ atk: 0, def: 0, hp: 0, hpFlat: 0, crit: 0, critDmg: 0, eva: 0, equip: 0, atkWith: {}, defWith: {} });

export function addMods(a, b, k = 1) {
  const r = newMods();
  for (const f of NUM_FIELDS) r[f] = (a[f] || 0) + k * (b[f] || 0);
  for (const f of ['atkWith', 'defWith']) {
    r[f] = { ...a[f] };
    for (const [t, v] of Object.entries(b[f] || {})) r[f][t] = (r[f][t] || 0) + k * v;
  }
  return r;
}

export const modsIsEmpty = (m) => NUM_FIELDS.every((f) => !m[f])
  && !Object.keys(m.atkWith).length && !Object.keys(m.defWith).length;

/**
 * Analyse le texte d'effet d'une compétence.
 * @param {string} effect
 * @param {{defaultTarget?: 'self'|'party'}} opts  defaultTarget 'party' pour les compétences de leader.
 * @returns {{self:object, party:object, perEach:{group:string,mods:object}[], unknown:string[]}}
 * Valeurs en points de pourcentage (ex. +30% Attack -> atk: 30). Les clauses non reconnues sont renvoyées dans `unknown`.
 */
export function parseEffect(effect, opts = {}) {
  const res = { self: newMods(), party: newMods(), perEach: [], unknown: [] };
  if (!effect) return res;
  // Découpe en clauses : ", +N" ou " and +N". Les virgules internes ("ATK, DEF and HP") sont conservées.
  const clauses = String(effect).split(/,\s*(?=[+-]?\d)|\s+and\s+(?=\+\d)/i).map((s) => s.trim()).filter(Boolean);
  for (const cl of clauses) {
    const m = /^\+(\d+(?:\.\d+)?)\s*(%?)\s*(.*)$/.exec(cl);
    if (!m) { res.unknown.push(cl); continue; }
    const val = parseFloat(m[1]);
    const isPct = m[2] === '%';
    const rest = m[3];
    const each = /for each\s+(fighter|rogue|spellcaster)/i.exec(rest);
    const isParty = opts.defaultTarget === 'party' || /party/i.test(rest);
    const mods = newMods();
    let found = false;
    let r = rest;
    // "+N% Attack with Sword" / "Defense with Shield" : bonus lié au type d'objet
    const wm = /\b(attack|atk|defense|def)\s+with\s+([a-z' -]+?)(?=\s+for\b|\s*$|\s*,)/i.exec(r);
    if (wm && isPct) {
      const type = wm[2].trim().toLowerCase();
      const bag = /^a/i.test(wm[1]) ? mods.atkWith : mods.defWith;
      bag[type] = (bag[type] || 0) + val;
      found = true;
      r = r.replace(wm[0], ' ');
    }
    if (/bonus from all items/i.test(r) && isPct) { mods.equip += val; found = true; r = r.replace(/bonus from all items/i, ' '); }
    if (/crit(ical)?\s*(hit\s*)?dam/i.test(r)) { mods.critDmg += val; found = true; r = r.replace(/crit(ical)?\s*(hit\s*)?dam\w*/i, ' '); }
    if (/crit(ical)?\s*(hit\s*)?chance/i.test(r)) { mods.crit += val; found = true; r = r.replace(/crit(ical)?\s*(hit\s*)?chance/i, ' '); }
    if (/\bevasion\b/i.test(r)) { mods.eva += val; found = true; }
    if (/\b(attack|atk)\b/i.test(r)) { mods.atk += val; found = true; }
    if (/\b(defense|def)\b/i.test(r)) { mods.def += val; found = true; }
    if (/\b(health|hp)\b/i.test(r)) { if (isPct) mods.hp += val; else mods.hpFlat += val; found = true; }
    if (!found) { res.unknown.push(cl); continue; }
    if (each) res.perEach.push({ group: each[1][0].toUpperCase() + each[1].slice(1).toLowerCase(), mods });
    else if (isParty) res.party = addMods(res.party, mods);
    else res.self = addMods(res.self, mods);
  }
  return res;
}

/** Une compétence (liste `classes`) s'applique-t-elle à cette classe ? */
export function classMatches(skillClasses, cls) {
  const promoted = !!cls.promotionOf;
  const grp = cls.group;
  return skillClasses.some((c) => {
    if (c === cls.name || c === 'All Classes') return true;
    if (c === `All ${grp}s`) return true;
    if (promoted && (c === 'All Promoted Classes' || c === `All Promoted ${grp}s`)) return true;
    return false;
  });
}

/** Somme des bonus "self" d'une liste de compétences (objets de skills.json). */
export function skillsToMods(skills) {
  let m = newMods();
  for (const s of skills) m = addMods(m, parseEffect(s.effect).self);
  return m;
}

/**
 * Stats d'un héros.
 * ATK = (ATKbase + Σ ATKobjet × (1 + bonus "with <Type>" + bonus équipement)) × (1 + %ATK)
 * DEF idem (le bouclier reçoit "Defense with Shield"). HP = (HPbase + PV plats + Σ HPobjet × (1+bonus équip.)) × (1 + %HP).
 * La qualité multiplie ATK/DEF/HP des objets. EVA/CRIT des objets s'ajoutent (non multipliés).
 * @param {{cls:object, items:(object|null)[], quality:string, mods:object}} p
 */
export function computeStats({ cls, items, quality = 'Normal', mods = newMods() }) {
  const q = QUALITY[quality] ?? 1;
  const eq = (mods.equip || 0) / 100;
  let atk = cls.atk, def = cls.def, hp = cls.hp + (mods.hpFlat || 0), eva = cls.eva, crit = cls.crit;
  for (const it of items) {
    if (!it) continue;
    const key = it.type.toLowerCase();
    atk += it.atk * q * (1 + eq + (mods.atkWith[key] || 0) / 100);
    def += it.def * q * (1 + eq + (mods.defWith[key] || 0) / 100);
    hp += it.hp * q * (1 + eq);
    eva += it.eva || 0;
    crit += it.crit || 0;
  }
  return {
    atk: atk * (1 + mods.atk / 100),
    def: def * (1 + mods.def / 100),
    hp: hp * (1 + mods.hp / 100),
    eva: eva + mods.eva / 100,
    crit: crit + mods.crit / 100,
    critDmg: cls.critDmg + mods.critDmg / 100,
  };
}

/** Score pondéré de la contribution d'un objet (après qualité et bonus). */
export function scoreItem(it, w, quality, mods) {
  const q = QUALITY[quality] ?? 1;
  const eq = (mods.equip || 0) / 100;
  const key = it.type.toLowerCase();
  const atk = it.atk * q * (1 + eq + (mods.atkWith[key] || 0) / 100);
  const def = it.def * q * (1 + eq + (mods.defWith[key] || 0) / 100);
  const hp = it.hp * q * (1 + eq);
  return w.atk * atk + w.def * def + w.hp * hp + w.eva * (it.eva || 0) * 100 + w.crit * (it.crit || 0) * 100;
}

export const isPackItem = (it) => !!it.antique || /pack|parck|offer|content pass/i.test(it.source || '');

/**
 * Classement des objets pour un emplacement.
 * @returns {{list:{item:object,score:number}[], relaxed:boolean}}  relaxed = filtre d'affinité ignoré faute d'objet.
 */
export function rankSlot(items, slotTypes, o) {
  const types = new Set(slotTypes);
  let pool = items.filter((i) => types.has(i.type) && i.tier <= o.maxTier);
  if (o.excludePacks) pool = pool.filter((i) => !isPackItem(i));
  let relaxed = false;
  if (o.element) {
    const f = pool.filter((i) => i.elemAff.includes(o.element) || i.elemAff.includes('All'));
    if (f.length) pool = f; else relaxed = true;
  }
  const list = pool.map((item) => ({ item, score: scoreItem(item, o.weights, o.quality, o.mods) }))
    .sort((a, b) => b.score - a.score || b.item.tier - a.item.tier || a.item.name.localeCompare(b.item.name));
  return { list, relaxed };
}

/** Probabilité d'être ciblé : threat / Σ threat. */
export function targetProbabilities(threats) {
  const sum = threats.reduce((a, b) => a + b, 0);
  return threats.map((t) => (sum > 0 ? t / sum : 0));
}

/** Pondérations d'évaluation des compétences selon le rôle. */
export const SKILL_ROLES = {
  tank: { atk: 0.4, def: 1, hp: 1, hpFlat: 0.25, crit: 0.3, critDmg: 0.05, eva: 1.5, equip: 3, atkWith: 0.3, defWith: 1 },
  dps: { atk: 1, def: 0.35, hp: 0.35, hpFlat: 0.1, crit: 1.5, critDmg: 0.3, eva: 0.6, equip: 3, atkWith: 1, defWith: 0.35 },
  rogue: { atk: 1, def: 0.25, hp: 0.25, hpFlat: 0.08, crit: 3, critDmg: 0.6, eva: 2.5, equip: 3, atkWith: 1, defWith: 0.25 },
  caster: { atk: 1.2, def: 0.25, hp: 0.3, hpFlat: 0.1, crit: 1.5, critDmg: 0.5, eva: 1, equip: 3, atkWith: 1.2, defWith: 0.2 },
};
export const defaultRole = (cls) => cls.group === 'Rogue' ? 'rogue' : cls.group === 'Spellcaster' ? 'caster' : 'tank';

/** Note heuristique d'une compétence. Les bonus "with <Type>" ne comptent que si la classe peut équiper ce type. */
export function scoreSkill(skill, role, cls) {
  const w = SKILL_ROLES[role];
  const { self } = parseEffect(skill.effect);
  const usable = new Set(cls.slots.flat().map((t) => t.toLowerCase()));
  let s = w.atk * self.atk + w.def * self.def + w.hp * self.hp + w.hpFlat * self.hpFlat + w.crit * self.crit
    + w.critDmg * self.critDmg + w.eva * self.eva + w.equip * self.equip;
  for (const [t, v] of Object.entries(self.atkWith)) if (usable.has(t)) s += w.atkWith * v;
  for (const [t, v] of Object.entries(self.defWith)) if (usable.has(t)) s += w.defWith * v;
  return s;
}
export const RARITY_RANK = { Epic: 3, Rare: 2, Common: 1 };
