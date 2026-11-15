// Sauvegarde locale (héros, équipes, préférences) : localStorage, clé versionnée, toujours protégé par try/catch.
// Si le stockage est indisponible, l'appli fonctionne avec une copie en mémoire (perdue au rechargement).
import { D, findFamily } from './data.js';
import { QUALITY } from './calc.js';
import { slotTypes } from './hero.js';

export const KEY = 'stb.v1';
const MAX_NAME = 60;
const MAX_NOTES = 2000;
const KINDS = ['quest', 'tower', 'tomb'];
const ELEMENTS = ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark'];

let state = null;
let ok = true;
let lastError = '';

const empty = () => ({ v: 1, heroes: [], teams: [], prefs: {} });

function load() {
  if (state) return state;
  state = empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.v === 1) {
        state.heroes = (Array.isArray(o.heroes) ? o.heroes : []).map(sanitizeHero).filter(Boolean);
        state.teams = (Array.isArray(o.teams) ? o.teams : []).map(sanitizeTeam).filter(Boolean);
        state.prefs = o.prefs && typeof o.prefs === 'object' && !Array.isArray(o.prefs) ? o.prefs : {};
      }
    }
  } catch (e) { ok = false; lastError = String(e && e.message || e); }
  return state;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(load())); ok = true; return true; }
  catch (e) { ok = false; lastError = String(e && e.message || e); return false; }
}

/** Le stockage persistant fonctionne-t-il ? (vrai tant qu'aucune lecture/écriture n'a échoué) */
export function storageOk() { load(); return ok; }
export function storageError() { return lastError; }

export const newId = (p = 'x') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Validation : on ne garde que des champs connus, aux types et bornes connus ----------
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const numOrNull = (v, lo, hi) => { if (v === null || v === undefined || v === '') return null; const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null; };
const safeId = (v, p) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : newId(p));

export function sanitizeHero(o) {
  if (!o || typeof o !== 'object') return null;
  const cls = D.classById.get(o.classId);
  if (!cls) return null;
  const hero = {
    id: safeId(o.id, 'h'), name: str(o.name, MAX_NAME).trim() || cls.name, classId: cls.id,
    level: Math.round(numOrNull(o.level, 1, D.maxLevel) ?? D.maxLevel),
    skills: [], gear: [], notes: str(o.notes, MAX_NOTES), updatedAt: numOrNull(o.updatedAt, 0, 8.64e15) ?? Date.now(),
  };
  for (const s of Array.isArray(o.skills) ? o.skills.slice(0, 4) : []) {
    const fam = s && findFamily(s.family);
    const tier = Number(s && s.tier);
    if (fam && fam.tiers.has(tier)) hero.skills.push({ family: fam.family, tier });
  }
  const g = Array.isArray(o.gear) ? o.gear : [];
  for (let i = 0; i < cls.slots.length; i++) {
    const e = g[i];
    if (!e || typeof e !== 'object') { hero.gear.push({ item: '', quality: 'Normal' }); continue; }
    const it = D.itemByName.get(e.item);
    const ok2 = it && slotTypes(cls, i).includes(it.type);
    const ge = { item: ok2 ? it.name : '', quality: QUALITY[e.quality] ? e.quality : 'Normal' };
    const en = D.enchantByName.get(e.element); if (en && en.type === 'Element') ge.element = en.name;
    const sp = D.enchantByName.get(e.spirit); if (sp && sp.type === 'Spirit') ge.spirit = sp.name;
    hero.gear.push(ge);
  }
  if (o.stats && typeof o.stats === 'object') {
    const st = {};
    for (const [k, hi] of [['atk', 1e7], ['def', 1e7], ['hp', 1e8], ['eva', 100], ['crit', 100], ['power', 1e10]]) {
      const v = numOrNull(o.stats[k], 0, hi); if (v !== null) st[k] = v;
    }
    if (Object.keys(st).length) hero.stats = st;
  }
  return hero;
}

export function sanitizeTeam(o) {
  if (!o || typeof o !== 'object') return null;
  const c = o.context && typeof o.context === 'object' ? o.context : {};
  const kind = KINDS.includes(c.kind) ? c.kind : 'quest';
  const ctx = { kind };
  if (kind === 'quest') {
    if (D.quests.some((q) => q.name === c.quest)) ctx.quest = c.quest;
    if (Number.isInteger(c.difficulty) && c.difficulty >= 0 && c.difficulty < 20) ctx.difficulty = c.difficulty;
  }
  if (kind === 'tower') {
    if (D.tower.towers.some((x) => x.difficulty === c.tower)) ctx.tower = c.tower;
    if (Number.isInteger(c.floor) && c.floor >= 1 && c.floor <= 30) ctx.floor = c.floor;
  }
  if (Array.isArray(c.modifiers)) ctx.modifiers = c.modifiers.filter((m) => D.modifiers.modifiers.some((x) => x.name === m)).slice(0, 12);
  if (kind === 'tomb' && ELEMENTS.includes(c.barrier)) ctx.barrier = c.barrier;
  const members = [];
  for (const m of Array.isArray(o.members) ? o.members.slice(0, 6) : []) {
    if (m && typeof m.heroId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(m.heroId)) members.push({ heroId: m.heroId });
    else if (m && D.championByName.has(m.champion)) members.push({ champion: m.champion, leaderTier: Math.min(4, Math.max(1, Math.round(Number(m.leaderTier) || 4))) });
  }
  return { id: safeId(o.id, 't'), name: str(o.name, MAX_NAME).trim() || 'Team', context: ctx, members, notes: str(o.notes, MAX_NOTES), updatedAt: numOrNull(o.updatedAt, 0, 8.64e15) ?? Date.now() };
}

// ---------- CRUD ----------
export const listHeroes = () => load().heroes.slice().sort((a, b) => b.updatedAt - a.updatedAt);
export const getHero = (id) => load().heroes.find((x) => x.id === id) || null;
export function saveHero(hero) {
  const clean = sanitizeHero({ ...hero, updatedAt: Date.now() });
  if (!clean) return null;
  const s = load();
  const i = s.heroes.findIndex((x) => x.id === clean.id);
  if (i >= 0) s.heroes[i] = clean; else s.heroes.push(clean);
  save();
  return clean;
}
export function deleteHero(id) { const s = load(); s.heroes = s.heroes.filter((x) => x.id !== id); save(); }
export function duplicateHero(id, suffix = ' (copie)') {
  const src = getHero(id);
  if (!src) return null;
  return saveHero({ ...JSON.parse(JSON.stringify(src)), id: newId('h'), name: (src.name + suffix).slice(0, MAX_NAME) });
}

export const listTeams = () => load().teams.slice().sort((a, b) => b.updatedAt - a.updatedAt);
export const getTeam = (id) => load().teams.find((x) => x.id === id) || null;
export function saveTeam(team) {
  const clean = sanitizeTeam({ ...team, updatedAt: Date.now() });
  if (!clean) return null;
  const s = load();
  const i = s.teams.findIndex((x) => x.id === clean.id);
  if (i >= 0) s.teams[i] = clean; else s.teams.push(clean);
  save();
  return clean;
}
export function deleteTeam(id) { const s = load(); s.teams = s.teams.filter((x) => x.id !== id); save(); }

export const getPref = (k, d = null) => (k in load().prefs ? load().prefs[k] : d);
export function setPref(k, v) { load().prefs[k] = v; save(); }

/** Efface toutes les données locales de l'appli (héros, équipes, préférences, langue). */
export function clearAll() {
  state = empty();
  try { localStorage.removeItem(KEY); localStorage.removeItem('stb-lang'); ok = true; return true; }
  catch (e) { ok = false; lastError = String(e && e.message || e); return false; }
}

// ---------- Export / import ----------
export function exportJSON() {
  const s = load();
  const data = JSON.stringify({ app: 'shop-titans-builder', v: 1, exportedAt: new Date().toISOString(), heroes: s.heroes, teams: s.teams }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `shop-titans-builder-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Nom comparé sans accents, majuscules ni symboles (« Laurène ~ » = « laurene »).
const normName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Garde ce que l'import n'a pas (esprit, élément, compétence) quand l'objet est le même. */
function keepMissing(x, old) {
  const gear = (x.gear || []).map((g, i) => {
    const o = (old.gear || [])[i];
    if (!g || !o || g.item !== o.item) return g;
    return { ...g, spirit: g.spirit || o.spirit, element: g.element || o.element };
  });
  const skills = (x.skills && x.skills.length) ? x.skills : old.skills;
  return { ...old, ...x, id: old.id, gear, skills, notes: x.notes || old.notes, stats: { ...(old.stats || {}), ...(x.stats || {}) } };
}

/**
 * Fusionne des héros/équipes déjà validés. Même id, ou à défaut même nom (héros) : remplacé seulement si
 * l'import est plus récent, en gardant ce que l'import ne précise pas. Sinon ajouté.
 */
export function mergeData(heroes, teams) {
  const s = load();
  let nh = 0, nt = 0;
  for (const x of heroes) {
    let i = s.heroes.findIndex((y) => y.id === x.id);
    if (i < 0 && normName(x.name)) i = s.heroes.findIndex((y) => normName(y.name) === normName(x.name));
    if (i < 0) { s.heroes.push(x); nh++; }
    else if (x.updatedAt > s.heroes[i].updatedAt) { s.heroes[i] = keepMissing(x, s.heroes[i]); nh++; }
  }
  for (const x of teams) {
    const i = s.teams.findIndex((y) => y.id === x.id);
    if (i < 0) { s.teams.push(x); nt++; }
    else if (x.updatedAt > s.teams[i].updatedAt) { s.teams[i] = x; nt++; }
  }
  save();
  return { heroes: nh, teams: nt };
}

/** Lit un fichier JSON exporté : données uniquement, validées champ par champ, jamais exécutées. */
export async function importJSON(file) {
  if (!file || file.size > 5e6) throw new Error('file');
  let o;
  try { o = JSON.parse(await file.text()); } catch { throw new Error('json'); }
  if (!o || typeof o !== 'object' || o.app !== 'shop-titans-builder' || !Array.isArray(o.heroes || []) || !Array.isArray(o.teams || [])) throw new Error('shape');
  const heroes = (o.heroes || []).slice(0, 500).map(sanitizeHero).filter(Boolean);
  const teams = (o.teams || []).slice(0, 500).map(sanitizeTeam).filter(Boolean);
  return mergeData(heroes, teams);
}

// ---------- Liens de partage : base64url de JSON compact dans le hash ----------
const b64e = (s) => { const b = new TextEncoder().encode(s); let bin = ''; b.forEach((c) => { bin += String.fromCharCode(c); }); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64d = (s) => { const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };

/** kind: 'hero' | 'team'. Pour une équipe, les héros membres sont joints. */
export function encodeShare(kind, obj) {
  const payload = kind === 'team'
    ? { k: 'team', t: obj, h: obj.members.filter((m) => m.heroId).map((m) => getHero(m.heroId)).filter(Boolean) }
    : { k: 'hero', h: [obj] };
  return b64e(JSON.stringify(payload));
}
export const shareLink = (kind, obj) => `${location.origin}${location.pathname}#/roster?share=${encodeShare(kind, obj)}`;

/** Décode et valide un partage. Renvoie {kind, heroes, team} ou null. Les ids sont conservés (fusion idempotente). */
export function decodeShare(code) {
  try {
    if (!code || code.length > 60000) return null;
    const o = JSON.parse(b64d(code));
    if (!o || (o.k !== 'hero' && o.k !== 'team')) return null;
    const heroes = (Array.isArray(o.h) ? o.h : []).slice(0, 8).map(sanitizeHero).filter(Boolean);
    if (o.k === 'hero') return heroes.length ? { kind: 'hero', heroes, team: null } : null;
    const team = sanitizeTeam(o.t);
    return team ? { kind: 'team', heroes, team } : null;
  } catch { return null; }
}
