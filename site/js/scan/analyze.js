// Analyse complète d'une capture de la fiche d'un héros (onglet Infos ou Capacités).
// Tout se passe dans le navigateur : l'image n'est envoyée nulle part.
import { D, itemIcon, skillIcon, classIcon, elemIcon } from '../data.js';
import { slotTypes } from '../hero.js';
import { integral } from './image.js';
import { detectPanel, regions } from './layout.js';
import { readNumber, readRoman } from './ocr.js';
import { loadSignatures, rank, confidence, guessQuality } from './match.js';
import { readName } from './name.js';
import { recognize as recognizeSpirit } from './spirit.js';

const TOP = 6; // candidats gardés par case

// Références (chemins d'image uniques) par catégorie, calculées une fois.
let REFS = null;
function refs(sigs) {
  if (REFS) return REFS;
  const famRefs = (type) => {
    const seen = new Map();
    for (const f of D.families) {
      if (f.type !== type) continue;
      const first = [...f.tiers.values()][0];
      const path = skillIcon(first.name);
      if (!path) continue;
      // Plusieurs familles peuvent partager une image : on les garde toutes (l'utilisateur tranchera).
      if (!seen.has(path)) seen.set(path, []);
      seen.get(path).push(f);
    }
    return [...seen.entries()].map(([path, fams]) => ({ key: fams[0].key, path, fams }));
  };
  REFS = {
    innate: famRefs('Innate'),
    hero: famRefs('Hero'),
    classes: D.classes.map((c) => ({ key: c.id, path: classIcon(c.name) })).filter((c) => c.path),
    elements: ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark', 'Gold'].map((e) => ({ key: e, path: elemIcon(e) })).filter((e) => e.path),
    items: D.items.map((it) => ({ key: it.name, path: itemIcon(it), type: it.type })).filter((x) => x.path && x.path.includes('/items/')),
  };
  return REFS;
}

/** Classe la plus probable : icône de classe + compétence innée (palier IV = classe promue). */
function pickClass(clsRank, innate, innateTier) {
  const fromInnate = new Set();
  if (innate) {
    for (const f of innate.fams) {
      const t = innateTier && f.tiers.has(innateTier) ? innateTier : Math.max(...f.tiers.keys());
      for (const n of f.tiers.get(t).classes) { const c = D.classByName.get(n); if (c) fromInnate.add(c.id); }
    }
  }
  const order = clsRank.map((r) => r.key);
  // Priorité : classes compatibles avec l'innée, dans l'ordre de ressemblance de l'icône.
  const both = order.filter((id) => fromInnate.has(id));
  const list = [...new Set([...both, ...fromInnate, ...order])];
  return list.map((id) => D.classById.get(id)).filter(Boolean);
}

/** Enchantement d'élément le plus plausible pour un élément donné (valeur la plus proche, à vérifier). */
function enchantFor(element, perItem) {
  const list = D.enchantments.filter((e) => e.type === 'Element' && e.element === element);
  if (!list.length) return '';
  if (!perItem) return list[list.length - 1].name;
  return list.reduce((a, b) => (Math.abs(b.value - perItem) < Math.abs(a.value - perItem) ? b : a)).name;
}

/** Objets possibles pour l'emplacement i (types autorisés par la classe, sinon tous). */
function slotCands(ref, cls, i) {
  const types = cls ? new Set(slotTypes(cls, i)) : null;
  return types ? ref.items.filter((x) => types.has(x.type)) : ref.items;
}
const rankSlot = (I, ref, t, cls, i) => rank(I, t.art, slotCands(ref, cls, i)).slice(0, TOP);

/** Prépare les miniatures des objets compatibles avec une classe (calculées au besoin). */
async function ensureItems(sigs, ref, cls, onProgress) {
  const paths = [];
  for (let i = 0; i < 6; i++) for (const x of slotCands(ref, cls, i)) paths.push(x.path);
  await sigs.ensure(paths, onProgress);
}

/** Recalcule les objets proposés après un changement de classe (les emplacements changent). */
export async function rerankGear(res, cls) {
  if (res.tab !== 'infos') return;
  await ensureItems(await loadSignatures(), res._ref, cls);
  res.regions.tiles.forEach((t, i) => {
    const list = rankSlot(res._I, res._ref, t, cls, i);
    Object.assign(res.gear[i], { list, conf: confidence(list) });
  });
}

/**
 * @param {{width,height,data}} img
 * @returns {Promise<object>} résultat brut + propositions (voir views/scan.js)
 */
export async function analyze(img, { onProgress } = {}) {
  const panel = detectPanel(img);
  if (!panel) throw new Error('panel');
  const R = regions(img, panel);
  const sigs = await loadSignatures();
  const ref = refs(sigs);
  const I = integral(img);
  await sigs.ensure([...ref.innate, ...ref.hero, ...ref.classes, ...ref.elements].map((r) => r.path), onProgress);

  // Compétences : la 1re case est l'innée, les 4 suivantes des compétences de héros.
  const skills = R.skills.map((s, k) => {
    const inner = { x: s.tile.x + s.tile.w * 0.1, y: s.tile.y + s.tile.h * 0.1, w: s.tile.w * 0.8, h: s.tile.h * 0.8 };
    const list = rank(I, inner, k === 0 ? ref.innate : ref.hero, { scales: [0.85, 1, 1.12], shift: 0.06 }).slice(0, TOP);
    const roman = readRoman(img, s.tier);
    return { box: s.tile, list, conf: confidence(list), tier: roman.tier, tierScore: roman.score };
  });

  const clsRank = rank(I, R.classIcon, ref.classes, { scales: [0.9, 1, 1.15], shift: 0.1 });
  const classes = pickClass(clsRank, skills[0].list[0], skills[0].tier);
  const cls = classes[0] || null;

  const nums = R.tab === 'infos';
  if (nums) await ensureItems(sigs, ref, cls, onProgress);
  const num = (b) => (nums ? readNumber(img, b) : { value: null, confidence: 0 });
  const elemTotal = nums ? readNumber(img, R.stats.elem).value : null;

  const gear = R.tiles.map((t, i) => {
    const list = nums ? rankSlot(I, ref, t, cls, i) : [];
    const el = nums ? rank(I, t.element, ref.elements, { scales: [0.7, 0.85, 1], shift: 0.1 }) : [];
    // Pastille reconnue si nettement plus proche d'un élément que des autres (sinon : vide, ou à choisir).
    const hasEl = el.length > 1 && el[1].d - el[0].d >= 15;
    const sp = nums ? recognizeSpirit(I, t.spirit) : null;
    return { box: t.tile, list, conf: confidence(list), quality: nums ? guessQuality(img, t.tile) : 'Normal', element: hasEl ? el[0].key : '', elemList: el.slice(0, 3),
      spirit: sp ? sp.name : '', spiritScore: sp ? sp.score : 0, spiritSig: sp ? sp.sig : null };
  });
  // Les 6 pastilles portent souvent le même élément : si la majorité est sûre, on l'applique aux cases
  // dont le meilleur candidat est le même élément mais avec une marge plus faible.
  const votes = {};
  gear.forEach((g) => { if (g.element) votes[g.element] = (votes[g.element] || 0) + 1; });
  const [maj, nMaj] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0] || [];
  if (maj && nMaj >= 3) gear.forEach((g) => { if (!g.element && g.elemList[0] && g.elemList[0].key === maj) g.element = maj; });
  const nEl = gear.filter((g) => g.element).length;
  for (const g of gear) g.enchant = g.element ? enchantFor(g.element, elemTotal && nEl ? elemTotal / nEl : 0) : '';

  const lv = readNumber(img, R.level);
  if (onProgress) onProgress(null, null, 'name');
  const nm = await readName(img, R.name);
  return {
    name: nm ? nm.name : '', nameConfidence: nm ? nm.confidence : 0,
    tab: R.tab, panel, regions: R, _I: I, _ref: ref,
    classes, cls,
    level: lv.value && lv.value <= D.maxLevel ? lv.value : null,
    stats: nums ? { power: num(R.power).value, hp: num(R.stats.hp).value, atk: num(R.stats.atk).value, def: num(R.stats.def).value, eva: num(R.stats.eva).value, elem: elemTotal } : null,
    skills, gear,
  };
}
