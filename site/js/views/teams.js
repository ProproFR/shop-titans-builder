// Vue « Équipes proposées » (#/teams) : à partir des héros enregistrés, meilleur groupe pour chaque élément
// (barrière des boss) + meilleur groupe général. Les héros sont désignés par leur nom (pas seulement leur classe).
import { D, champIcon, classIcon, elemIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, icon, fmt, pct } from '../dom.js';
import { combineModifiers, heroCandidate, championCandidates, recommend, explain } from '../tower-calc.js';
import * as store from '../store.js';
import { rankUpgrades } from '../upgrades.js';
import { describe as describeUp, pctTxt } from './upgrades.js';

const ELEMS = ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark'];
const elName = (el) => t('tm.el.' + el);
// Monstre de référence fictif (ordre de grandeur du Tombeau), le même que l'ancienne page Éléments : sert à comparer
// des groupes entre eux, pas à prédire un combat précis.
const REF_MOB = { hp: 80000, atk: 70, aoe: 40, caps: { c50: 3200, c70: 6400, c75: 19200 } };

const fmtV = (v) => (typeof v === 'number' ? fmt(v, Number.isInteger(v) ? 0 : 1) : v);

function memberLine(m, el) {
  if (m.kind === 'champion') {
    return h('li', { class: 'team-member' }, h('span', { class: 'with-ico' }, icon(champIcon(m.label), { size: 40, cls: 'portrait' }),
      h('span', {}, h('strong', {}, m.label), ' ', h('span', { class: 'muted small' }, m.owned ? t('tm.champOwned', { lvl: m.level ?? '?', pw: fmt(m.power) }) : t('tm.champSuggested')))));
  }
  const hero = m.hero;
  const elOk = el && (m.classElement === el || (m.gearElements || []).includes(el));
  return h('li', { class: 'team-member' },
    h('div', { class: 'with-ico' }, icon(classIcon(m.cls.name), { size: 40, cls: 'portrait' }),
      h('span', {}, h('strong', {}, hero.name), ' ', h('span', { class: 'muted small' }, `${m.cls.name} · ${t('ro.level')} ${hero.level}`),
        el ? h('span', { class: `tag ${elOk ? 'tag-ok' : 'tag-est'}` }, elOk ? t('tm.elemOk', { el: elName(el) }) : t('tm.elemNo', { el: elName(el) })) : null)),
    h('p', { class: 'small muted' }, `HP ${fmt(m.hp)} · ATK ${fmt(m.atk)} · DEF ${fmt(m.def)} · EVA ${pct(m.eva, 0)}${m.crit != null ? ` · CRIT ${pct(m.crit, 0)}` : ''}${m.estimated ? ` (${t('ro.estimated')})` : ''}`));
}

function teamCard(title, ico, res, size, el, opts = {}) {
  const fx = combineModifiers([]);
  const sec = h('section', { class: `card team-card${opts.weak ? ' team-weak' : ''}` }, h('h2', { class: 'with-ico-h' }, ico ? icon(ico, { size: 36 }) : null, title,
    opts.weak ? h('span', { class: 'tag tag-est' }, t('tm.weakTag')) : null));
  if (!res) { sec.append(h('p', { class: 'muted' }, t('tm.noResult'))); return sec; }
  // Point faible : l'amélioration (sur un héros de ce groupe) qui rapporte le plus.
  if (opts.fix) sec.append(h('p', { class: 'team-fix' }, h('strong', {}, t('tm.fix')), ' ', h('a', { href: `#/roster?edit=${opts.fix.hero.id}` }, opts.fix.hero.name), ` — ${describeUp(opts.fix)} (${pctTxt(opts.fix.gain)})`));
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
  const owned = store.listChampions();
  root.append(sizeBtns, h('p', { class: 'small muted' }, t('tm.basedOn', { n: heroes.length }), ' ',
    owned.length ? t('tm.champsOwned', { n: owned.length }) : h('span', {}, t('tm.champsNone'), ' ', h('a', { href: '#/champions' }, t('tm.champsGo')))), body);

  // Quête précise : élément du boss, quête extrême (−20 % d'esquive), héros indisponibles (en quête, au repos).
  const busy = new Set(store.getPref('busyHeroes', []));
  const Q = { el: ctx.params.get('q') || '', extreme: store.getPref('questExtreme', false) };
  const questSel = h('div', { class: 'quest-tools card' },
    h('h2', {}, t('tm.questTitle')),
    h('div', { class: 'q-group', role: 'group', 'aria-label': t('tm.questEl') }, ['', ...ELEMS].map((el) => h('button', { type: 'button', class: 'q-btn', 'aria-pressed': String(Q.el === el),
      onclick: () => { Q.el = el; draw(); questSel.querySelectorAll('.q-group:first-of-type .q-btn').forEach((b, i) => b.setAttribute('aria-pressed', String(['', ...ELEMS][i] === el))); } },
      el ? h('span', { class: 'with-ico' }, icon(elemIcon(el), { size: 20 }), elName(el)) : t('tm.questAll')))),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: Q.extreme, onchange: (e) => { Q.extreme = e.target.checked; store.setPref('questExtreme', Q.extreme); draw(); } }), ' ', t('tm.extreme')),
    h('details', {}, h('summary', {}, t('tm.busyTitle', { n: busy.size })), h('p', { class: 'small muted' }, t('tm.busyHint')),
      h('div', { class: 'chips' }, [...heroes].sort((a, b) => a.name.localeCompare(b.name)).map((x) => h('label', { class: 'chip-add chip-check' },
        h('input', { type: 'checkbox', checked: busy.has(x.id), onchange: (e) => { if (e.target.checked) busy.add(x.id); else busy.delete(x.id); store.setPref('busyHeroes', [...busy]); questSel.querySelector('summary').textContent = t('tm.busyTitle', { n: busy.size }); draw(); } }), x.name)))));
  root.insertBefore(questSel, body);

  let ups = null; // classement des améliorations (calculé une fois)
  const draw = () => {
    clear(body);
    const avail = heroes.filter((x) => !busy.has(x.id));
    const cands = avail.map(heroCandidate).map((c) => (Q.extreme ? { ...c, eva: Math.max(0, (c.eva || 0) - 0.2) } : c));
    const run = (el) => {
      const champs = el ? championCandidates(store.listChampions(), heroes, (c) => c.element === el) : [];
      return recommend([...cands, ...champs], size, REF_MOB, combineModifiers([]), el ? { barrier: el, elemFocus: true } : {}, 1)[0];
    };
    if (Q.el) { body.append(teamCard(t('tm.questFor', { el: elName(Q.el) }), elemIcon(Q.el), run(Q.el), size, Q.el)); return; }
    body.append(teamCard(t('tm.general'), null, run(''), size, null));
    // Groupes d'élément, puis repérage des 2 plus faibles (marge de survie la plus basse).
    const groups = ELEMS.map((el) => ({ el, res: run(el) }));
    const sorted = groups.filter((g) => g.res).sort((a, b) => a.res.ev.ratio - b.res.ev.ratio);
    const weak = new Set(sorted.slice(0, 2).map((g) => g.el));
    if (!ups) { try { ups = rankUpgrades(heroes); } catch { ups = []; } }
    const grid = h('div', { class: 'elem-grid' });
    for (const g of groups) {
      let fix = null;
      if (weak.has(g.el) && g.res) {
        const ids = new Set(g.res.members.filter((m) => m.hero).map((m) => m.hero.id));
        fix = ups.find((u) => ids.has(u.hero.id) && u.kind !== 'evaCap' && u.kind !== 'spirit') || null;
      }
      grid.append(teamCard(t('tm.elemTitle', { el: elName(g.el) }), elemIcon(g.el), g.res, size, g.el, { weak: weak.has(g.el), fix }));
    }
    body.append(grid);
  };
  draw();
}
