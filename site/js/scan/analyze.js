// Analyse complète d'une capture de la fiche d'un héros (onglet Infos ou Capacités).
// Tout se passe dans le navigateur : l'image n'est envoyée nulle part.
import { D, itemIcon, skillIcon, classIcon, elemIcon } from '../data.js';
import { slotTypes } from '../hero.js';
import { integral, px, hsv } from './image.js';
import { detectPanel, regions } from './layout.js';
import { readNumber, readRoman } from './ocr.js';
import { loadSignatures, rank, confidence, guessQuality, meanColor } from './match.js';
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
    items: D.items.map((it) => ({ key: it.name, path: itemIcon(it), type: it.type, tier: it.tier })).filter((x) => x.path && x.path.includes('/items/')),
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
  // Le total affiché dépasse souvent la somme des enchantements (bonus d'affinité, compétences…) :
  // on prend l'enchantement le plus fort qui ne dépasse pas la moyenne par objet (+1 de marge).
  const fit = list.filter((e) => e.value <= perItem + 1);
  return (fit.length ? fit[fit.length - 1] : list[0]).name;
}

/**
 * Élément du héros d'après l'icône de la ligne « Élément » des stats (colorée et nette, contrairement
 * aux petites pastilles des objets, grisées pour Ténèbres et Air). Cherchée le long de la ligne.
 */
function heroElement(I, P, ref) {
  const best = new Map();
  for (let x = 4; x <= 44; x += 2) {
    const box = { x: P.x + x * P.u, y: P.y + 322 * P.u, w: 26 * P.u, h: 26 * P.u };
    for (const r of rank(I, box, ref.elements.filter((e) => e.key !== 'Gold'), { scales: [0.8, 0.9, 1], shift: 0.1 })) {
      if (!best.has(r.key) || r.d < best.get(r.key)) best.set(r.key, r.d);
    }
  }
  const list = [...best.entries()].sort((a, b) => a[1] - b[1]);
  if (list.length < 2) return null;
  // Sur nos captures : bon élément ≈ 12-20, suivant ≥ 60.
  return list[0][1] <= 35 && list[1][1] - list[0][1] >= 25 ? list[0][0] : null;
}

/**
 * Une pastille est-elle affichée à cet endroit ? (cadre clair/gris, ou pastille colorée comme Terre).
 * Sans pastille on ne voit que le fond de la case.
 */
function badgePresent(img, b) {
  let k = 0, light = 0, sat = 0;
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
    const [, s, v] = hsv(...px(img, x, y)); k++;
    if (v > 0.55 && s < 0.35) light++;
    if (s > 0.45 && v > 0.5) sat++;
  }
  return light / k >= 0.08 || sat / k >= 0.3;
}

/**
 * Élément d'une pastille d'après la couleur moyenne de son centre. Valeurs relevées sur de vraies
 * captures : Ténèbres = violet-gris terne (teinte ≈ 300-315, sat ≈ 0,3, sombre), Air = cyan pâle
 * (≈ 190, sat < 0,2, clair), Terre = vert vif (≈ 93). Eau ≈ 196 (sat 0,8), Feu ≈ 12, Lumière ≈ 48 : relevés sur les captures de la guilde.
 */
function elementByColor(I, b) {
  const [r, g, bl] = meanColor(I, { x: b.x + b.w * 0.3, y: b.y + b.h * 0.3, w: b.w * 0.4, h: b.h * 0.4 });
  const [hh, sat, v] = hsv(r, g, bl);
  if (hh >= 280 && hh <= 335 && sat >= 0.23 && sat <= 0.4 && v >= 0.25 && v <= 0.43) return 'Dark';
  if (hh >= 170 && hh <= 215 && sat < 0.3 && v > 0.55) return 'Air';
  if (hh >= 70 && hh <= 145 && sat > 0.4) return 'Earth';
  if ((hh < 25 || hh > 345) && sat > 0.45 && v > 0.45) return 'Fire';
  if (hh >= 188 && hh <= 255 && sat > 0.45) return 'Water';
  if (hh >= 38 && hh < 70 && sat > 0.3 && v > 0.6) return 'Light';
  return '';
}

/** Objets possibles pour l'emplacement i (types autorisés par la classe, sinon tous). */
function slotCands(ref, cls, i, tier) {
  const types = cls ? new Set(slotTypes(cls, i)) : null;
  const list = types ? ref.items.filter((x) => types.has(x.type)) : ref.items;
  // Palier lu sur la case (rond orange) : écarte les objets d'un autre palier, sources de confusions
  // (ex. Scepter of Ever-Wisdom T13 pris pour Natural Toxifier T5). Lecture incertaine : ±1.
  if (!tier || !tier.value) return list;
  const tol = tier.confidence >= 0.3 ? 0 : 1;
  const byTier = list.filter((x) => Math.abs(x.tier - tier.value) <= tol);
  return byTier.length ? byTier : list;
}
const rankSlot = (I, ref, t, cls, i, tier) => rank(I, t.art, slotCands(ref, cls, i, tier)).slice(0, TOP);

/** Prépare les miniatures des objets compatibles avec une classe (calculées au besoin). */
async function ensureItems(sigs, ref, cls, onProgress, tiers = []) {
  const paths = [];
  for (let i = 0; i < 6; i++) for (const x of slotCands(ref, cls, i, tiers[i])) paths.push(x.path);
  await sigs.ensure(paths, onProgress);
}

/** Recalcule les objets proposés après un changement de classe (les emplacements changent). */
export async function rerankGear(res, cls) {
  if (res.tab !== 'infos') return;
  const tiers = res.gear.map((g) => g.tier);
  await ensureItems(await loadSignatures(), res._ref, cls, undefined, tiers);
  res.regions.tiles.forEach((t, i) => {
    const list = rankSlot(res._I, res._ref, t, cls, i, tiers[i]);
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
    return { box: s.tile, list, conf: confidence(list), tier: roman.tier, tierScore: roman.score, tierSure: roman.tier != null };
  });

  const clsRank = rank(I, R.classIcon, ref.classes, { scales: [0.9, 1, 1.15], shift: 0.1 });
  const classes = pickClass(clsRank, skills[0].list[0], skills[0].tier);
  const cls = classes[0] || null;

  const nums = R.tab === 'infos';
  const tiers = R.tiles.map((t) => (nums ? readNumber(img, t.tier) : null));
  if (nums) await ensureItems(sigs, ref, cls, onProgress, tiers);
  const num = (b) => (nums ? readNumber(img, b) : { value: null, confidence: 0 });
  const elemTotal = nums ? readNumber(img, R.stats.elem).value : null;
  const evaRead = nums ? readNumber(img, R.stats.eva) : null; // « 100% (78%) » : 78 = valeur réelle (plafond)

  const gear = R.tiles.map((t, i) => {
    const list = nums ? rankSlot(I, ref, t, cls, i, tiers[i]) : [];
    const base = { box: t.tile, tier: tiers[i], list, conf: confidence(list), quality: nums ? guessQuality(img, t.tile) : 'Normal', element: '', elemList: [], spirit: '', spiritScore: 0, spiritSig: null };
    if (!nums) return base;
    // Pastilles : en haut l'élément, en dessous l'esprit. Sans élément, l'esprit remonte en haut ;
    // sans rien, aucune pastille (ex. Amran : cases 2 et 3 vides, case 5 = esprit de Mundra seul).
    // Une pastille d'élément reconnaissable à sa couleur compte aussi (losange Ténèbres, petit et sombre).
    const top = badgePresent(img, t.element) || !!elementByColor(I, t.element), low = badgePresent(img, t.spirit);
    if (!top) return { ...base, noBadge: true };
    let spiritBox = low ? t.spirit : null, elemBox = t.element;
    const byColor = elementByColor(I, t.element);
    // Pastille du haut sans couleur d'élément : c'est l'esprit remonté en haut (objet sans élément),
    // ex. esprit de Mundra intégré à Mundra's Decree.
    const item = list[0] && D.itemByName.get(list[0].key);
    if (!byColor && (!low || (item && item.builtInSpirit) || recognizeSpirit(I, t.element).name)) { spiritBox = t.element; elemBox = null; }
    const el = elemBox ? rank(I, elemBox, ref.elements, { scales: [0.7, 0.85, 1], shift: 0.1 }) : [];
    // Couleur d'abord ; à défaut, ressemblance avec les icônes si nettement meilleure que les autres.
    const hasEl = el.length > 1 && el[1].d - el[0].d >= 15;
    const elKey = elemBox ? (byColor || (hasEl ? el[0].key : '')) : '';
    const sp = spiritBox ? recognizeSpirit(I, spiritBox) : null;
    return { ...base, hasElemBadge: !!elemBox, element: elKey, elemList: el.slice(0, 3),
      spirit: sp ? sp.name : '', spiritScore: sp ? sp.score : 0, spiritSig: sp ? sp.sig : null };
  });
  // Les 6 pastilles portent souvent le même élément : si la majorité est sûre, on l'applique aux cases
  // dont le meilleur candidat est le même élément mais avec une marge plus faible.
  const votes = {};
  gear.forEach((g) => { if (g.element) votes[g.element] = (votes[g.element] || 0) + 1; });
  const [maj, nMaj] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0] || [];
  if (maj && nMaj >= 3) gear.forEach((g) => { if (!g.element && g.elemList[0] && g.elemList[0].key === maj) g.element = maj; });
  // Pastilles non reconnues à la couleur (Ténèbres, Air en losange…) : si l'élément du héros est sûr
  // et qu'il a des points d'élément, on l'attribue aux cases restées vides.
  const heroEl = nums ? heroElement(I, panel, ref) : null;
  if (heroEl && elemTotal > 0) gear.forEach((g) => { if (!g.element && g.hasElemBadge) { g.element = heroEl; g.fromHero = true; } });
  // Éléments intégrés à l'objet (pastille en losange, ex. Fleetfoot Travelers = Tornado) : connus d'avance.
  for (const g of gear) {
    const it = g.list[0] && D.itemByName.get(g.list[0].key);
    const en = it && it.builtInElement && D.enchantByName.get(it.builtInElement);
    if (en && g.hasElemBadge) { g.element = en.element; g.enchant = en.name; g.builtIn = en.value; }
  }
  // Le total « Élément » ne compte que l'élément du héros : on retire les éléments intégrés connus,
  // puis on répartit le reste sur les autres cases de cet élément.
  const isHero = (g) => g.element && (!heroEl || g.element === heroEl);
  const known = gear.filter((g) => isHero(g) && g.builtIn).reduce((a, g) => a + g.builtIn, 0);
  const nEl = gear.filter((g) => isHero(g) && !g.builtIn).length;
  const perItem = elemTotal && nEl ? Math.max(0, elemTotal - known) / nEl : 0;
  for (const g of gear) if (!g.builtIn) g.enchant = g.element ? enchantFor(g.element, heroEl && g.element !== heroEl ? 0 : perItem) : '';

  const lv = readNumber(img, R.level);
  if (onProgress) onProgress(null, null, 'name');
  const nm = await readName(img, R.name);
  return {
    name: nm ? nm.name : '', nameConfidence: nm ? nm.confidence : 0, heroElement: heroEl,
    tab: R.tab, panel, regions: R, _I: I, _ref: ref,
    classes, cls,
    level: lv.value && lv.value <= D.maxLevel ? lv.value : null,
    stats: nums ? { power: num(R.power).value, hp: num(R.stats.hp).value, atk: num(R.stats.atk).value, def: num(R.stats.def).value, eva: evaRead.value, evaShown: evaRead.shown ?? null, elem: elemTotal } : null,
    skills, gear,
  };
}
