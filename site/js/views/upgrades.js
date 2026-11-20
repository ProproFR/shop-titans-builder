// Vue « Améliorations prioritaires » (#/upgrades) : toutes les améliorations possibles de vos héros,
// classées par priorité (gain estimé × importance du héros ÷ effort).
import { D, classIcon, itemIcon, skillGameName, skillLabel } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, icon, fmt, select, numberField } from '../dom.js';
import { rankUpgrades, seedPlan, planWeights } from '../upgrades.js';
import { qualityName, enchantLabel, spiritLabel } from '../i18n-names.js';
import * as store from '../store.js';

const KINDS = ['item', 'quality', 'skill', 'skillSwap', 'element', 'spirit', 'evaCap'];
const ROMAN = ['', 'I', 'II', 'III', 'IV'];
export const pctTxt = (g) => `+${fmt(g * 100, g < 0.1 ? 1 : 0)} %`;
const enchLbl = (n) => { const e = D.enchantByName.get(n); return e ? enchantLabel(e) : n; };

/** Phrase décrivant l'amélioration. */
export function describe(u) {
  const slot = t('sc.slot', { n: u.slot + 1 });
  switch (u.kind) {
    case 'quality': return t('up.d.quality', { slot, item: u.item, from: qualityName(u.from), to: qualityName(u.to) });
    case 'item': return t(u.item ? 'up.d.item' : 'up.d.itemEmpty', { slot, item: u.item, to: u.to, tier: u.toTier }) + (u.toQuality ? ` ${t('up.d.knownQ', { q: qualityName(u.toQuality) })}` : '');
    case 'skill': return t('up.d.skill', { skill: skillLabel(u.item, u.from), to: `${skillGameName(u.item, u.to)} (${ROMAN[u.to] || u.to})` });
    case 'skillSwap': return t('up.d.skillSwap', { skill: skillLabel(u.item, (u.hero.skills[u.slot] || {}).tier), to: skillLabel(u.to, u.toTier) });
    case 'element': return t(u.from ? 'up.d.elementUp' : 'up.d.element', { slot, item: u.item, from: enchLbl(u.from), to: enchLbl(u.to) });
    case 'spirit': return t(u.to ? 'up.d.spirit' : 'up.d.spiritAny', { slot, item: u.item, to: spiritLabel(u.to) });
    case 'evaCap': return t('up.d.evaCap', { waste: u.waste });
    default: return '';
  }
}

/** Carte « À faire maintenant » : la meilleure amélioration, choisie par le site. */
export function nextActionCard(heroes, all = null) {
  const list = (all || rankUpgrades(heroes)).filter((u) => u.kind !== 'evaCap');
  if (!list.length) return null;
  // On investit d'abord dans un héros qui joue dans un groupe (les autres sont des candidats au remplacement).
  const u = list.find((x) => x.weight >= 1 && x.recent == null) || list[0];
  return h('section', { class: 'card next-action', 'aria-label': t('na.title') },
    h('div', { class: 'next-kicker' }, t('na.title')),
    h('div', { class: 'with-ico' }, icon(classIcon(u.cls.name), { size: 48, cls: 'portrait' }),
      h('div', {}, h('strong', { class: 'next-hero' }, u.hero.name), h('p', { class: 'next-what' }, describe(u)),
        h('p', { class: 'small' }, t('na.why', { gain: pctTxt(u.gain) }), u.weight > 1 ? ` ${t('na.key')}` : ''))),
    h('div', { class: 'actions' }, h('a', { class: 'button', href: `#/roster?edit=${u.hero.id}` }, t('na.do')), h('a', { class: 'btn-small', href: '#/upgrades' }, t('na.more'))));
}

const dots = (n) => h('span', { class: 'effort', 'aria-label': t('up.effortAria', { n }) }, '●'.repeat(n) + '○'.repeat(Math.max(0, 5 - n)));

function row(u, rank, maxP) {
  const hero = u.hero;
  const it = (u.kind === 'item' && D.itemByName.get(u.to)) || ((u.kind === 'quality' || u.kind === 'element' || u.kind === 'spirit') && D.itemByName.get(u.item)) || null;
  return h('li', { class: 'card upgrade' },
    h('div', { class: 'upgrade-head' },
      h('span', { class: 'upgrade-rank' }, `${rank}`),
      icon(classIcon(u.cls.name), { size: 36, cls: 'portrait' }),
      h('div', { class: 'grow' },
        h('strong', {}, hero.name), ' ', h('span', { class: 'tag' }, t(`up.k.${u.kind}`)),
        u.weight > 1.5 ? h('span', { class: 'tag tag-ok' }, t('up.inGeneral')) : u.weight > 1 ? h('span', { class: 'tag tag-ok' }, t('up.inElem')) : u.recent != null ? h('span', { class: 'tag tag-est' }, t('up.recentTag', { d: u.recent })) : null,
        u.replace ? h('a', { class: 'tag tag-est', href: '#/replace' }, t('up.toReplace')) : u.weight < 1 ? h('a', { class: 'tag tag-est', href: '#/replace' }, t('up.idle')) : null,
        h('p', { class: 'upgrade-desc' }, describe(u))),
      it ? icon(itemIcon(it), { size: 44 }) : null),
    u.kind === 'evaCap' ? h('p', { class: 'small muted' }, t('up.evaCapHint')) :
      h('div', { class: 'upgrade-meta small' },
        h('span', {}, t('up.gain'), ' ', h('strong', {}, pctTxt(u.gain)), u.estimate ? h('span', { class: 'muted' }, ` (${t('up.estimate')})`) : null),
        h('span', {}, t('up.effort'), ' ', dots(u.effort)),
        h('span', { class: 'prio-bar', role: 'img', 'aria-label': t('up.prioAria', { p: fmt(u.priority, 1) }) }, h('span', { style: `width:${Math.max(4, Math.round(100 * u.priority / maxP))}%` }))),
    h('p', { class: 'small' }, h('a', { href: `#/roster?edit=${hero.id}` }, t('up.edit'))));
}

/** Liste complète (version d'origine, gardée telle quelle comme « sauvegarde »). */
function renderList(root, ctx, heroes, all) {
  const S = { hero: ctx.params.get('h') || '', kinds: new Set(KINDS), limit: 25 };

  // Héros à améliorer en premier : somme des 3 meilleures priorités de chacun.
  const byHero = new Map();
  for (const u of all) { if (u.kind === 'evaCap' || u.replace) continue; const l = byHero.get(u.hero.id) || []; if (l.length < 3) l.push(u); byHero.set(u.hero.id, l); }
  const topHeroes = [...byHero.entries()].map(([id, l]) => ({ hero: l[0].hero, cls: l[0].cls, score: l.reduce((a, u) => a + u.priority, 0), best: l[0] }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
  root.append(nextActionCard(heroes, all) || '', h('section', { class: 'card' }, h('h2', {}, t('up.firstHeroes')),
    h('ol', { class: 'first-heroes' }, topHeroes.map((x) => h('li', { class: 'with-ico' }, icon(classIcon(x.cls.name), { size: 32, cls: 'portrait' }),
      h('span', {}, h('strong', {}, x.hero.name), ' — ', describe(x.best), ' ', h('span', { class: 'muted' }, `(${pctTxt(x.best.gain)})`))))),
    h('p', { class: 'small muted' }, t('up.how'))));

  const filters = h('div', { class: 'row' },
    select({ label: t('up.filterHero'), value: S.hero, options: [{ value: '', label: t('up.allHeroes') }, ...[...heroes].sort((a, b) => a.name.localeCompare(b.name)).map((x) => ({ value: x.id, label: x.name }))],
      onChange: (v) => { S.hero = v; S.limit = 25; draw(); } }),
    h('fieldset', { class: 'kinds' }, h('legend', {}, t('up.filterKind')), KINDS.map((k) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: true, onchange: (e) => { if (e.target.checked) S.kinds.add(k); else S.kinds.delete(k); S.limit = 25; draw(); } }), ' ', t(`up.k.${k}`)))));
  const list = h('div', {});
  root.append(filters, list, h('p', { class: 'note small' }, t('up.disclaimer')));

  function draw() {
    clear(list);
    const shown = all.filter((u) => (!S.hero || u.hero.id === S.hero) && S.kinds.has(u.kind));
    if (!shown.length) { list.append(h('p', { class: 'muted' }, t('up.none'))); return; }
    const maxP = Math.max(...shown.map((u) => u.priority), 0.001);
    // Les héros à remplacer arrivent en fin de liste, après un intertitre.
    const items = [];
    shown.slice(0, S.limit).forEach((u, i, arr) => {
      if (u.replace && (i === 0 || !arr[i - 1].replace)) items.push(h('li', { class: 'upgrade-sep' }, h('h3', {}, t('up.replaceSep')), h('p', { class: 'small muted' }, t('up.replaceSepHint'), ' ', h('a', { href: '#/replace' }, t('nav.replace')))));
      items.push(row(u, i + 1, maxP));
    });
    list.append(h('ol', { class: 'upgrade-list' }, items));
    if (shown.length > S.limit) list.append(h('p', { class: 'actions' }, h('button', { type: 'button', class: 'btn-small', onclick: () => { S.limit += 25; draw(); } }, t('up.more', { n: shown.length - S.limit }))));
  }
  draw();
}

// ---------- Plan de la semaine : les améliorations regroupées par type d'action ----------
// Le plan ne propose jamais d'investir dans un héros à remplacer, ni de changer un objet posé il y a moins de 30 jours.
const take = (all, kinds, n) => all.filter((u) => kinds.includes(u.kind) && !u.replace && u.recent == null).slice(0, n);

function planSection(title, hint, items, more) {
  if (!items.length) return null;
  return h('section', { class: 'card plan-sec' }, h('h2', {}, title), hint ? h('p', { class: 'small muted' }, hint) : null,
    h('ol', { class: 'plan-list' }, items), more || null);
}
const planItem = (u) => h('li', {}, h('a', { href: `#/roster?edit=${u.hero.id}` }, h('strong', {}, u.hero.name)), ` — ${describe(u)} `,
  h('span', { class: 'tag tag-ok' }, pctTxt(u.gain)), u.weight > 1 ? h('span', { class: 'muted small' }, ` · ${t(u.weight > 1.5 ? 'up.inGeneral' : 'up.inElem')}`) : null);

function seedBlock(heroes) {
  const stock = store.getSeedStock();
  const box = h('section', { class: 'card plan-sec' }, h('h2', {}, t('sd.planTitle')));
  const inputs = h('div', { class: 'row' }, ['atk', 'def', 'hp'].map((k) => numberField({ label: t(`sd.stock.${k}`), value: stock[k] || '', min: 0, step: 1,
    onChange: (v) => { stock[k] = v || 0; store.setSeedStock(stock); drawPlan(); } })));
  const out = h('div', { 'aria-live': 'polite' });
  const drawPlan = () => {
    clear(out);
    if (!stock.atk && !stock.def && !stock.hp) { out.append(h('p', { class: 'small muted' }, t('sd.noStock'))); return; }
    let w = new Map(); try { w = planWeights(heroes); } catch { /* sans pondération */ }
    const p = seedPlan(heroes, stock, w);
    if (p.alloc.size) {
      out.append(h('ol', { class: 'plan-list' }, [...p.alloc.values()].sort((a, b) => b.gain - a.gain).map((e) => h('li', {},
        h('a', { href: `#/roster?edit=${e.hero.id}` }, h('strong', {}, e.hero.name)), ' — ',
        ['atk', 'def', 'hp'].filter((k) => e[k]).map((k) => t(`sd.give.${k}`, { n: e[k] })).join(', '), ' ', h('span', { class: 'tag tag-ok' }, pctTxt(e.gain))))));
      const rest = ['atk', 'def', 'hp'].filter((k) => p.left[k] > 0).map((k) => t(`sd.give.${k}`, { n: p.left[k] }));
      if (rest.length) out.append(h('p', { class: 'small muted' }, t('sd.left', { list: rest.join(', ') })));
    }
    if (p.unknown.length) out.append(h('p', { class: 'small' }, t('sd.unknown', { n: p.unknown.length })));
  };
  box.append(h('p', { class: 'small muted' }, t('sd.planHint')), inputs, out);
  drawPlan();
  return box;
}

export function render(root, ctx) {
  const heroes = store.listHeroes().filter((x) => D.classById.has(x.classId));
  root.append(h('h1', {}, t('up.title')));
  if (!heroes.length) {
    root.append(h('p', {}, t('tm.noHeroes')), h('p', { class: 'actions' }, h('a', { class: 'button', href: '#/scan' }, t('tm.goImport'))));
    return;
  }
  const all = rankUpgrades(heroes);
  const mode = ctx.params.get('h') ? 'list' : (ctx.params.get('v') || store.getPref('upView', 'plan'));
  root.append(h('div', { class: 'q-group', role: 'group', 'aria-label': t('pl.viewAria') }, ['plan', 'list'].map((m) => h('button', { type: 'button', class: 'q-btn', 'aria-pressed': String(mode === m),
    onclick: () => { store.setPref('upView', m); location.hash = `#/upgrades?v=${m}`; } }, t(`pl.view.${m}`)))));
  if (mode === 'list') { root.append(h('p', { class: 'lead' }, t('up.intro'))); renderList(root, ctx, heroes, all); return; }

  root.append(h('p', { class: 'lead' }, t('pl.intro')), nextActionCard(heroes, all) || '');
  // Enchantements regroupés par héros (éléments + esprits) : un passage dans l'éditeur règle tout.
  const ench = new Map();
  for (const u of all) if ((u.kind === 'element' || u.kind === 'spirit') && !u.replace) { const e = ench.get(u.hero.id) || { hero: u.hero, el: 0, sp: 0, gain: 0, weight: u.weight }; e[u.kind === 'element' ? 'el' : 'sp']++; e.gain += u.gain; ench.set(u.hero.id, e); }
  const enchTop = [...ench.values()].sort((a, b) => b.gain * b.weight - a.gain * a.weight).slice(0, 5);
  root.append(
    planSection(t('pl.items'), t('pl.itemsHint'), take(all, ['item'], 5).map(planItem)),
    planSection(t('pl.quality'), t('pl.qualityHint'), take(all, ['quality'], 4).map(planItem)),
    planSection(t('pl.skills'), t('pl.skillsHint'), take(all, ['skillSwap', 'skill'], 4).map(planItem)),
    planSection(t('pl.ench'), t('pl.enchHint'), enchTop.map((e) => h('li', {}, h('a', { href: `#/roster?edit=${e.hero.id}` }, h('strong', {}, e.hero.name)), ' — ',
      [e.el ? t('pl.enchEl', { n: e.el }) : '', e.sp ? t('pl.enchSp', { n: e.sp }) : ''].filter(Boolean).join(', '), ' ', h('span', { class: 'tag tag-ok' }, pctTxt(e.gain))))),
    seedBlock(heroes),
    h('section', { class: 'card plan-sec' }, h('h2', {}, t('pl.champs')), h('p', {}, t('pl.champsTxt'), ' ', h('a', { href: '#/champions' }, t('nav.champions')))),
    h('p', { class: 'note small' }, t('up.disclaimer')));
}
