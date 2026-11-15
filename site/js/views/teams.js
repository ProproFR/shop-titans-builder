// Vue « Équipes proposées » (#/teams) : à partir des héros enregistrés, meilleur groupe pour chaque élément
// (barrière des boss) + meilleur groupe général. Les héros sont désignés par leur nom (pas seulement leur classe).
import { D, champIcon, classIcon, elemIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, icon, fmt, pct } from '../dom.js';
import { combineModifiers, heroCandidate, championCandidate, recommend, explain } from '../tower-calc.js';
import { gearRow } from './roster.js';
import * as store from '../store.js';

const ELEMS = ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark'];
const elName = (el) => t('tm.el.' + el);
// Monstre de référence fictif (ordre de grandeur du Tombeau), le même que l'ancienne page Éléments : sert à comparer
// des groupes entre eux, pas à prédire un combat précis.
const REF_MOB = { hp: 80000, atk: 70, aoe: 40, caps: { c50: 3200, c70: 6400, c75: 19200 } };

const fmtV = (v) => (typeof v === 'number' ? fmt(v, Number.isInteger(v) ? 0 : 1) : v);

function memberLine(m, el) {
  if (m.kind === 'champion') {
    return h('li', { class: 'team-member' }, h('span', { class: 'with-ico' }, icon(champIcon(m.label), { size: 40, cls: 'portrait' }),
      h('span', {}, h('strong', {}, m.label), ' ', h('span', { class: 'muted small' }, t('tm.champSuggested')))));
  }
  const hero = m.hero;
  const elOk = el && (m.classElement === el || (m.gearElements || []).includes(el));
  return h('li', { class: 'team-member' },
    h('div', { class: 'with-ico' }, icon(classIcon(m.cls.name), { size: 40, cls: 'portrait' }),
      h('span', {}, h('strong', {}, hero.name), ' ', h('span', { class: 'muted small' }, `${m.cls.name} · ${t('ro.level')} ${hero.level}`),
        el ? h('span', { class: `tag ${elOk ? 'tag-ok' : 'tag-est'}` }, elOk ? t('tm.elemOk', { el: elName(el) }) : t('tm.elemNo', { el: elName(el) })) : null)),
    h('p', { class: 'small muted' }, `ATQ ${fmt(m.atk)} · DEF ${fmt(m.def)} · PV ${fmt(m.hp)} · ESQ ${pct(m.eva, 0)}${m.estimated ? ` (${t('ro.estimated')})` : ''}`),
    gearRow(hero, 32));
}

function teamCard(title, ico, res, size, el) {
  const fx = combineModifiers([]);
  const sec = h('section', { class: 'card team-card' }, h('h2', { class: 'with-ico-h' }, ico ? icon(ico, { size: 36 }) : null, title));
  if (!res) { sec.append(h('p', { class: 'muted' }, t('tm.noResult'))); return sec; }
  sec.append(h('ol', { class: 'team-list' }, res.members.map((m) => memberLine(m, el))));
  if (res.members.length < size) sec.append(h('p', { class: 'warn small' }, t('tw.smallParty', { n: res.members.length, total: size })));
  sec.append(h('details', {}, h('summary', {}, t('tm.why')),
    h('ul', { class: 'small' }, explain(res, fx).map((x) => h('li', {}, t(x.k, Object.fromEntries(Object.entries(x.v).map(([k, v]) => [k, fmtV(v)])))))),
    h('p', { class: 'small muted' }, t('tm.score', { score: res.ev.ratio >= 10 ? '≥ 10' : fmt(res.ev.ratio, 2) }))));
  return sec;
}

export function render(root, ctx) {
  const size = ctx.params.get('n') === '5' ? 5 : 4;
  const heroes = store.listHeroes().filter((x) => D.classById.has(x.classId));
  const body = h('div', {});

  const sizeBtns = h('div', { class: 'q-group', role: 'group', 'aria-label': t('el.sizeAria') },
    [4, 5].map((n) => h('button', { type: 'button', class: 'q-btn', 'aria-pressed': String(size === n), onclick: () => { location.hash = n === 5 ? '#/teams?n=5' : '#/teams'; } }, t('el.size', { n }))));

  root.append(h('h1', {}, t('tm.title')), h('p', { class: 'lead' }, t('tm.intro')), h('p', { class: 'note' }, t('tm.disclaimer')));
  if (!heroes.length) {
    root.append(h('p', {}, t('tm.noHeroes')), h('p', { class: 'actions' }, h('a', { class: 'button', href: '#/scan' }, t('tm.goImport'))));
    return;
  }
  root.append(sizeBtns, h('p', { class: 'small muted' }, t('tm.basedOn', { n: heroes.length })), body);

  const heroCands = heroes.map(heroCandidate);
  const draw = () => {
    clear(body);
    const general = recommend(heroCands.slice(), size, REF_MOB, combineModifiers([]), {}, 1)[0];
    body.append(teamCard(t('tm.general'), null, general, size, null));
    const grid = h('div', { class: 'elem-grid' });
    for (const el of ELEMS) {
      const champs = D.champions.filter((c) => c.element === el).map((c) => championCandidate(c, 4));
      const res = recommend([...heroCands, ...champs], size, REF_MOB, combineModifiers([]), { barrier: el }, 1)[0];
      grid.append(teamCard(t('tm.elemTitle', { el: elName(el) }), elemIcon(el), res, size, el));
    }
    body.append(grid);
  };
  draw();
}
