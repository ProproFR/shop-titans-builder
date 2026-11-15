// Vue « Améliorations prioritaires » (#/upgrades) : toutes les améliorations possibles de vos héros,
// classées par priorité (gain estimé × importance du héros ÷ effort).
import { D, classIcon, itemIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, icon, fmt, select } from '../dom.js';
import { rankUpgrades } from '../upgrades.js';
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
    case 'item': return t(u.item ? 'up.d.item' : 'up.d.itemEmpty', { slot, item: u.item, to: u.to, tier: u.toTier });
    case 'skill': return t('up.d.skill', { skill: u.item, from: ROMAN[u.from] || u.from, to: ROMAN[u.to] || u.to });
    case 'skillSwap': return t('up.d.skillSwap', { skill: u.item, to: u.to, tier: ROMAN[u.toTier] || u.toTier });
    case 'element': return t(u.from ? 'up.d.elementUp' : 'up.d.element', { slot, item: u.item, from: enchLbl(u.from), to: enchLbl(u.to) });
    case 'spirit': return t(u.to ? 'up.d.spirit' : 'up.d.spiritAny', { slot, item: u.item, to: spiritLabel(u.to) });
    case 'evaCap': return t('up.d.evaCap', { waste: u.waste });
    default: return '';
  }
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
        u.weight > 1.5 ? h('span', { class: 'tag tag-ok' }, t('up.inGeneral')) : u.weight > 1 ? h('span', { class: 'tag tag-ok' }, t('up.inElem')) : null,
        h('p', { class: 'upgrade-desc' }, describe(u))),
      it ? icon(itemIcon(it), { size: 44 }) : null),
    u.kind === 'evaCap' ? h('p', { class: 'small muted' }, t('up.evaCapHint')) :
      h('div', { class: 'upgrade-meta small' },
        h('span', {}, t('up.gain'), ' ', h('strong', {}, pctTxt(u.gain)), u.estimate ? h('span', { class: 'muted' }, ` (${t('up.estimate')})`) : null),
        h('span', {}, t('up.effort'), ' ', dots(u.effort)),
        h('span', { class: 'prio-bar', role: 'img', 'aria-label': t('up.prioAria', { p: fmt(u.priority, 1) }) }, h('span', { style: `width:${Math.max(4, Math.round(100 * u.priority / maxP))}%` }))),
    h('p', { class: 'small' }, h('a', { href: `#/roster?edit=${hero.id}` }, t('up.edit'))));
}

export function render(root, ctx) {
  const heroes = store.listHeroes().filter((x) => D.classById.has(x.classId));
  root.append(h('h1', {}, t('up.title')), h('p', { class: 'lead' }, t('up.intro')));
  if (!heroes.length) {
    root.append(h('p', {}, t('tm.noHeroes')), h('p', { class: 'actions' }, h('a', { class: 'button', href: '#/scan' }, t('tm.goImport'))));
    return;
  }
  const all = rankUpgrades(heroes);
  const S = { hero: ctx.params.get('h') || '', kinds: new Set(KINDS), limit: 25 };

  // Héros à améliorer en premier : somme des 3 meilleures priorités de chacun.
  const byHero = new Map();
  for (const u of all) { if (u.kind === 'evaCap') continue; const l = byHero.get(u.hero.id) || []; if (l.length < 3) l.push(u); byHero.set(u.hero.id, l); }
  const topHeroes = [...byHero.entries()].map(([id, l]) => ({ hero: l[0].hero, cls: l[0].cls, score: l.reduce((a, u) => a + u.priority, 0), best: l[0] }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
  root.append(h('section', { class: 'card' }, h('h2', {}, t('up.firstHeroes')),
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
    list.append(h('ol', { class: 'upgrade-list' }, shown.slice(0, S.limit).map((u, i) => row(u, i + 1, maxP))));
    if (shown.length > S.limit) list.append(h('p', { class: 'actions' }, h('button', { type: 'button', class: 'btn-small', onclick: () => { S.limit += 25; draw(); } }, t('up.more', { n: shown.length - S.limit }))));
  }
  draw();
}
