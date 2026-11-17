// Cartes et lignes communes aux héros et aux champions : même présentation, au choix en cases ou en liste.
import { D, classIcon, champIcon, elemIcon, skillIcon, itemIcon, findFamily, skillLabel } from '../data.js';
import { t } from '../i18n.js';
import { h, icon, fmt, pct, statLabel } from '../dom.js';
import { heroClass, effectiveStats } from '../hero.js';
import { elementName } from '../i18n-names.js';
import * as store from '../store.js';

/** Boutons « Cases / Liste » ; le choix est mémorisé (préférence commune aux héros et aux champions). */
export function viewToggle(onChange) {
  const cur = () => (store.getPref('view', 'grid') === 'list' ? 'list' : 'grid');
  const wrap = h('div', { class: 'q-group view-toggle', role: 'group', 'aria-label': t('vw.aria') });
  const draw = () => wrap.replaceChildren(...['grid', 'list'].map((v) => h('button', { type: 'button', class: 'q-btn', 'aria-pressed': String(cur() === v),
    onclick: () => { store.setPref('view', v); draw(); onChange(v); } }, t(`vw.${v}`))));
  draw();
  wrap.value = cur;
  return wrap;
}

const statsNode = (st, estimated) => h('div', { class: 'stat-line small' },
  statLabel('health', fmt(st.hp)), statLabel('attack', fmt(st.atk)), statLabel('defense', fmt(st.def)), statLabel('evasion', pct(st.eva, 0)),
  st.crit != null ? statLabel('critchance', pct(st.crit, 0)) : null,
  estimated ? h('span', { class: 'tag tag-est' }, t('ro.estimated')) : null);

/** Carte (case) ou ligne (liste) générique. */
function unit(view, { portrait, name, sub, el, power, stats, extra, actions }) {
  const pw = power ? h('span', { class: 'unit-power', title: t('sc.power') }, '★ ', fmt(power)) : null;
  const elI = el && elemIcon(el) ? icon(elemIcon(el), { size: 20, alt: elementName(el) }) : null;
  if (view === 'list') {
    return h('li', { class: 'unit-row' }, portrait(36),
      h('div', { class: 'unit-id' }, h('strong', {}, name), ' ', elI, h('div', { class: 'muted small' }, sub)),
      pw, stats, h('div', { class: 'unit-actions' }, actions));
  }
  return h('li', { class: 'card unit-card' },
    h('div', { class: 'unit-head' }, portrait(52), h('div', { class: 'grow' }, h('h3', {}, name, ' ', elI), h('p', { class: 'muted small' }, sub)), pw),
    extra || null, stats, h('div', { class: 'actions' }, actions));
}

/** Élément principal d'un héros : le plus fréquent sur son équipement, sinon celui de sa classe. */
export function heroMainElement(hero) {
  const n = {};
  for (const g of hero.gear || []) { const e = g.element && D.enchantByName.get(g.element); if (e) n[e.element] = (n[e.element] || 0) + 1; }
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  const cls = heroClass(hero);
  return top ? top[0] : (cls && cls.element !== 'All' ? cls.element : null);
}

export function heroUnit(view, hero, actions, gearRow) {
  const cls = heroClass(hero);
  const st = effectiveStats(hero);
  const enteredMain = ['hp', 'atk', 'def'].every((k) => st.entered.includes(k));
  const skills = h('div', { class: 'skill-icons' }, (hero.skills || []).map((s) => {
    const f = findFamily(s.family); const sk = f && f.tiers.get(s.tier);
    return h('span', { title: skillLabel(s.family, s.tier) }, icon(skillIcon(sk ? sk.name : s.family) || skillIcon(s.family), { size: 30, cls: 'skill-ico', alt: skillLabel(s.family, s.tier) }));
  }));
  return unit(view, {
    portrait: (sz) => icon(classIcon(cls.name), { size: sz, cls: 'portrait' }), name: hero.name, sub: `${cls.name} · ${t('ro.level')} ${hero.level}`,
    el: heroMainElement(hero), power: hero.stats && hero.stats.power, stats: statsNode(st, !enteredMain),
    extra: h('div', { class: 'unit-extra' }, gearRow(hero, 36), skills), actions });
}

export function championUnit(view, champ, owned, actions) {
  const has = owned && owned.atk > 0;
  const st = has ? { hp: owned.hp, atk: owned.atk, def: owned.def, eva: (owned.eva || 0) / 100 } : null;
  const gear = owned ? [owned.familiar, owned.aura].map((n) => n && D.itemByName.get(n)).filter(Boolean) : [];
  const extra = owned && (gear.length || owned.nextAtk != null) ? h('div', { class: 'unit-extra small' },
    gear.length ? h('div', { class: 'gear-row' }, gear.map((it) => h('span', { class: 'with-ico', title: `${it.name} (T${it.tier})` }, icon(itemIcon(it), { size: 30 }), `T${it.tier}`))) : null,
    owned.nextAtk != null ? h('div', {}, t('ch.nextLine', { atk: fmt(owned.nextAtk), def: fmt(owned.nextDef ?? 0) })) : null) : null;
  return unit(view, {
    portrait: (sz) => icon(champIcon(champ.name), { size: sz, cls: 'portrait' }), name: champ.name,
    sub: `${champ.group}${owned && owned.level ? ` · ${t('ro.level')} ${owned.level}` : ''}${owned && owned.rank ? ` · ${t('ch.rank')} ${owned.rank}` : ''}`, el: champ.element, power: owned && owned.power,
    stats: st ? statsNode(st, false) : h('div', { class: 'small muted' }, t('ch.noStats')), extra, actions });
}

export const unitList = (view, items) => h('ul', { class: view === 'list' ? 'unit-list' : 'unit-grid' }, items);
