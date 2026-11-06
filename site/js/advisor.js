// Conseiller de build : « Meilleur combo conseillé » pour une classe (fiche Builds + éditeur de héros).
import { D, skillIcon } from './data.js';
import { t } from './i18n.js';
import { h, select, icon, fmt } from './dom.js';
import { scoreSkill, defaultRole, RARITY_RANK } from './calc.js';
import { skillFamiliesFor } from './views/optimizer.js';
import { variantBox } from './views/builds.js';
import { lineageOf } from './hero.js';

export const GUIDE_URL = 'https://st-central.net/tldr-heroes/#Skill-Rolling';
export const TOMB_URL = 'https://st-central.net/tombdex/';
const IMG_BASE = 'https://i0.wp.com/st-central.net/wp-content/uploads/2021/04/ancientstuff/';
export const GUIDE_IMG = { Fighter: `${IMG_BASE}Fighters-1.png?ssl=1`, Rogue: `${IMG_BASE}Rogues-1.png?ssl=1`, Spellcaster: `${IMG_BASE}Spellcasters-1.png?ssl=1` };
const RARITIES = ['Epic', 'Rare', 'Common'];

const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

/** Compétences de héros compatibles (palier max), notées par l'heuristique de l'évaluateur. */
export function rankedSkills(cls, role) {
  return skillFamiliesFor(cls).filter((f) => f.type === 'Hero').map((f) => {
    const tier = Math.max(...f.tiers.keys());
    const skill = f.tiers.get(tier);
    return { fam: f, skill, tier, score: scoreSkill(skill, role, cls) };
  }).filter((c) => c.score > 0)
    .sort((a, b) => (RARITY_RANK[b.skill.rarity] || 0) - (RARITY_RANK[a.skill.rarity] || 0) || b.score - a.score);
}

/** Les 4 meilleures compétences (même tri que l'évaluateur : rareté puis note). */
export const topSkills = (cls, role = defaultRole(cls), n = 4) => rankedSkills(cls, role).slice(0, n).map((c) => ({ family: c.fam.family, tier: c.tier }));

/** Lien vers l'éditeur pré-rempli : classe + variante STC + meilleures compétences. */
export function createHeroHref(cls, variantIdx, role) {
  const p = new URLSearchParams({ edit: 'new', cls: cls.id });
  if (variantIdx >= 0) p.set('bis', variantIdx);
  for (const s of topSkills(cls, role)) p.append('sk', `${s.family}~${s.tier}`);
  return `#/roster?${p.toString()}`;
}

/**
 * Panneau « Meilleur combo conseillé ».
 * @param {object} cls classe (promue de préférence)
 * @param {{showVariants?:boolean, hideCreate?:boolean}} o  showVariants: affiche les variantes STC (inutile sur la fiche Builds qui les montre déjà)
 */
export function advisorPanel(cls, o = {}) {
  const lineage = lineageOf(cls);
  const bis = D.bisByClassId.get(lineage.id);
  let role = defaultRole(cls);
  const box = h('section', { class: 'card advisor', 'aria-label': t('adv.title') });
  const skillsBox = h('div', {});
  const createBtn = h('a', { class: 'button', href: '#' }, t('adv.create'));
  let vIdx = bis && bis.variants.length ? 0 : -1;
  const refreshCreate = () => { createBtn.href = createHeroHref(cls, vIdx, role); };

  const drawSkills = () => {
    skillsBox.replaceChildren();
    const ranked = rankedSkills(cls, role);
    const groups = [...RARITIES, null];
    for (const r of groups) {
      const list = ranked.filter((c) => (c.skill.rarity || null) === r).slice(0, 5);
      if (!list.length) continue;
      skillsBox.append(h('h5', { class: 'adv-rar' }, r ? h('span', { class: `rar rar-${r.toLowerCase()}` }, r) : t('adv.otherRarity')),
        h('ul', { class: 'adv-skills' }, list.map((c) => h('li', {},
          icon(skillIcon(c.skill.name) || skillIcon(c.fam.family), { size: 36, cls: 'skill-ico' }),
          h('span', { class: 'adv-sk' }, h('strong', {}, c.fam.family), ` T${c.tier} `, h('span', { class: 'muted small' }, `· ${t('sk.score')} ${fmt(c.score, 1)}`),
            h('span', { class: 'small adv-eff' }, c.skill.effect))))));
    }
    if (!ranked.length) skillsBox.append(h('p', { class: 'muted' }, '–'));
    refreshCreate();
  };

  box.append(h('h3', {}, t('adv.title')),
    h('p', { class: 'credit', role: 'note' }, t('adv.credit'), ' ', ext('https://st-central.net/tldr-heroes/', 'Shop Titans Central'), ' · ', ext(D.bis.licenseUrl, D.bis.license)));

  // Équipement + enchantements : variantes STC
  box.append(h('h4', {}, t('adv.gear')));
  if (!bis) box.append(h('p', { class: 'muted' }, t('builds.noBis')));
  else if (o.showVariants) {
    bis.variants.forEach((v, vi) => box.append(variantBox(bis, v, vi)));
    box.append(h('p', { class: 'small muted' }, t('builds.creditBottom', { authors: D.bis.authors, license: D.bis.license }), ' ', ext(D.bis.source, t('builds.creditSource'))));
  } else box.append(h('p', { class: 'muted small' }, t('adv.gearBelow', { n: bis.variants.length })));

  // Compétences
  box.append(h('h4', {}, t('adv.skills')));
  if (cls.group === 'Fighter') box.append(select({ label: t('sk.role'), value: role, options: [{ value: 'tank', label: 'Tank' }, { value: 'dps', label: 'DPS' }], onChange: (v) => { role = v; drawSkills(); } }));
  box.append(skillsBox, h('p', { class: 'muted small' }, t('sk.heuristic'), ' ', t('sk.bestNote')));
  drawSkills();

  // Guide STC
  const g = cls.group;
  box.append(h('p', {}, ext(GUIDE_URL, t('adv.guide'))),
    h('figure', { class: 'guide-fig' },
      h('a', { href: GUIDE_IMG[g], target: '_blank', rel: 'noopener noreferrer', 'aria-label': t('adv.guideImgOpen', { group: g }) },
        h('img', { class: 'guide-img', src: GUIDE_IMG[g], alt: t('adv.guideImgAlt', { group: g }), loading: 'lazy', decoding: 'async',
          onerror: (e) => { e.target.hidden = true; } })),
      h('figcaption', { class: 'small muted' }, t('adv.guideCredit'), ' ', ext(GUIDE_URL, 'st-central.net'))));
  box.append(h('p', {}, ext(TOMB_URL, t('adv.tomb'))));

  // Créer ce héros
  const actions = h('div', { class: 'actions' });
  if (!o.hideCreate && bis && bis.variants.length > 1) {
    actions.append(select({ label: t('adv.variantPick'), value: 0,
      options: bis.variants.map((_, i) => ({ value: i, label: `${t('builds.variant')} ${i + 1}` })), onChange: (v) => { vIdx = Number(v); refreshCreate(); } }));
  }
  if (!o.hideCreate) { actions.append(createBtn); box.append(actions); }
  refreshCreate();
  return box;
}
