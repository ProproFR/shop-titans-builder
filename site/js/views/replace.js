// Vue « Héros à remplacer » (#/replace) : quels héros ne servent dans aucun groupe, quelles classes rendraient
// vos groupes plus forts, et le site choisit les remplacements (héros qui sort → classe à recruter).
import { D, classIcon, elemIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, icon, fmt } from '../dom.js';
import * as store from '../store.js';
import { rosterPlan } from '../roster-plan.js';
import { heroMainElement } from './cards.js';
import { qualityName } from '../i18n-names.js';

const elName = (el) => t('tm.el.' + el);
const teamName = (k) => (k ? t('rp.team', { el: elName(k) }) : t('rp.general'));
const pc = (g) => `${g >= 0 ? '+' : '−'}${fmt(Math.abs(g) * 100, Math.abs(g) < 0.1 ? 1 : 0)} %`;
const elIco = (el, size = 20) => (el && el !== 'Any' && elemIcon(el) ? icon(elemIcon(el), { size, alt: elName(el) }) : null);

/** « Équipe Feu +12 % · Groupe général +3 % » (seulement les variations visibles). */
function gainsLine(gains) {
  const parts = Object.entries(gains).filter(([, g]) => Math.abs(g) >= 0.005).sort((a, b) => b[1] - a[1]).map(([k, g]) => `${teamName(k)} ${pc(g)}`);
  return parts.length ? parts.join(' · ') : t('rp.noChange');
}

function swapCard(s, i) {
  const x = s.out, r = s.recruit;
  const why = x.teams.length ? t('rp.whyCheap', { name: x.hero.name, loss: pc(-x.loss) }) : t('rp.whyIdle', { name: x.hero.name });
  return h('li', { class: 'swap' },
    h('div', { class: 'swap-kicker small' }, h('span', { class: 'upgrade-rank' }, String(i + 1)), ' ', t('rp.swapN')),
    h('div', { class: 'swap-head' },
      h('span', { class: 'with-ico' }, icon(classIcon(x.cls.name), { size: 40, cls: 'portrait' }),
        h('span', {}, h('strong', {}, x.hero.name), h('span', { class: 'muted small' }, ` ${x.cls.name} · ${t('ro.level')} ${x.hero.level}`))),
      h('span', { class: 'swap-arrow', 'aria-hidden': 'true' }, '→'),
      h('span', { class: 'with-ico' }, icon(classIcon(r.cls.name), { size: 40, cls: 'portrait' }),
        h('span', {}, h('strong', {}, r.cls.name), ' ', elIco(r.el), h('span', { class: 'muted small' }, ` ${t('rp.recruit')}`)))),
    h('p', { class: 'swap-what' }, t('rp.swapWhat', { out: x.hero.name, cls: r.cls.name, el: elName(r.el) })),
    h('p', { class: 'small' }, h('strong', {}, t('rp.gain')), ' ', gainsLine(s.gains)),
    h('p', { class: 'small muted' }, why, r.owned ? ` ${t('rp.alreadyN', { n: r.owned, cls: r.cls.name })}` : ` ${t('rp.newClass')}`),
    h('div', { class: 'actions' },
      h('a', { class: 'btn-small', href: `#/builds?c=${r.cls.id}` }, t('rp.seeBuild', { cls: r.cls.name })),
      h('a', { class: 'btn-small', href: `#/roster?edit=${x.hero.id}` }, t('rp.openHero', { name: x.hero.name }))));
}

function heroRow(x, tags, lines) {
  const el = heroMainElement(x.hero);
  return h('li', { class: 'unit-row rp-row' },
    icon(classIcon(x.cls.name), { size: 36, cls: 'portrait' }),
    h('div', { class: 'unit-id' }, h('a', { href: `#/roster?edit=${x.hero.id}` }, h('strong', {}, x.hero.name)), ' ', elIco(el), h('div', { class: 'muted small' }, `${x.cls.name} · ${t('ro.level')} ${x.hero.level}`)),
    h('div', { class: 'rp-tags' }, tags),
    h('div', { class: 'small rp-lines' }, lines.map((l) => h('div', {}, l))));
}

function render2(body, plan) {
  clear(body);
  const { target, kit, swaps, info, recruits } = plan;

  body.append(h('p', { class: 'small muted' },
    target.name ? t('rp.target', { boss: target.name, diff: target.difficulty }) : '', ' ',
    t('rp.kit', { lvl: kit.level, tier: kit.tier, q: qualityName(kit.quality) })));

  // 1. Décision : remplacements choisis par le site.
  const dec = h('section', { class: 'card next-action', 'aria-labelledby': 'rp-dec' }, h('h2', { id: 'rp-dec', class: 'next-kicker' }, t('rp.decTitle')));
  if (swaps.length) dec.append(h('ol', { class: 'swap-list' }, swaps.map(swapCard)), h('p', { class: 'small' }, t('rp.oneAtATime')));
  else dec.append(h('p', {}, t('rp.noSwap')), h('p', { class: 'actions' }, h('a', { class: 'button', href: '#/upgrades' }, t('rp.goUpgrades'))));
  body.append(dec);

  // 2. Héros remplaçables : dans aucun groupe, ou remplacés presque sans perte.
  const outIds = new Set(swaps.map((s) => s.out.hero.id));
  const idle = info.filter((x) => !x.teams.length).sort((a, b) => a.power - b.power);
  const cheap = info.filter((x) => x.teams.length && x.loss < 0.03).sort((a, b) => a.loss - b.loss);
  const sec2 = h('section', { class: 'card' }, h('h2', {}, t('rp.idleTitle', { n: idle.length })), h('p', { class: 'small muted' }, t('rp.idleHint')));
  const rowFor = (x) => {
    const weak = x.weak;
    const tags = [];
    if (outIds.has(x.hero.id)) tags.push(h('span', { class: 'tag tag-est' }, t('rp.tagChosen')));
    else if (weak) tags.push(h('span', { class: 'tag tag-est' }, t('rp.tagFirst')));
    else tags.push(h('span', { class: 'tag tag-ok' }, t('rp.tagReserve')));
    const lines = [];
    if (x.teams.length) lines.push(t('rp.cheapLine', { teams: x.teams.map(teamName).join(', '), loss: pc(-x.loss) }));
    if (x.stronger) lines.push(t('rp.dupLine', { name: x.stronger.name, cls: x.cls.name }));
    if (x.mixed) lines.push(t('rp.mixedLine'));
    if (x.low) lines.push(t('rp.lowLine'));
    if (!weak && !x.teams.length) lines.push(t('rp.reserveLine'));
    return heroRow(x, tags, lines);
  };
  if (idle.length) sec2.append(h('ul', { class: 'unit-list' }, idle.map(rowFor)));
  else sec2.append(h('p', {}, t('rp.idleNone')));
  if (cheap.length) sec2.append(h('h3', {}, t('rp.cheapTitle')), h('ul', { class: 'unit-list' }, cheap.map(rowFor)));
  body.append(sec2);

  // 3. Classes à recruter.
  const useful = recruits.filter((r) => r.gain >= 0.01);
  const sec3 = h('section', { class: 'card' }, h('h2', {}, t('rp.recTitle')), h('p', { class: 'small muted' }, t('rp.recHint')));
  const recRow = (r) => h('li', { class: 'unit-row rp-row' },
    icon(classIcon(r.cls.name), { size: 36, cls: 'portrait' }),
    h('div', { class: 'unit-id' }, h('a', { href: `#/builds?c=${r.cls.id}` }, h('strong', {}, r.cls.name)), ' ', elIco(r.el), h('div', { class: 'muted small' }, r.owned ? t('rp.ownedN', { n: r.owned }) : t('rp.ownedNone'))),
    h('div', { class: 'rp-tags' }, h('span', { class: `tag ${r.gain >= 0.05 ? 'tag-ok' : ''}` }, pc(r.gain))),
    h('div', { class: 'small rp-lines' }, gainsLine(r.gains)));
  if (useful.length) sec3.append(h('ul', { class: 'unit-list' }, useful.slice(0, 8).map(recRow)));
  else sec3.append(h('p', {}, t('rp.recNone')));
  const rest = recruits.filter((r) => r.gain < 0.01);
  if (rest.length) sec3.append(h('details', {}, h('summary', {}, t('rp.recRest', { n: rest.length })),
    h('p', { class: 'small' }, rest.map((r) => r.cls.name).join(', '))));
  body.append(sec3);

  // 4. Piliers : ceux qui font le plus perdre si on les retire.
  const pillars = info.filter((x) => x.loss >= 0.05).sort((a, b) => b.loss - a.loss).slice(0, 6);
  if (pillars.length) {
    body.append(h('section', { class: 'card' }, h('h2', {}, t('rp.keepTitle')), h('p', { class: 'small muted' }, t('rp.keepHint')),
      h('ul', { class: 'unit-list' }, pillars.map((x) => heroRow(x, [h('span', { class: 'tag tag-ok' }, t('rp.tagKeep'))],
        [t('rp.keepLine', { name: x.hero.name, list: Object.entries(x.losses).filter(([, l]) => l >= 0.005).sort((a, b) => b[1] - a[1]).map(([k, l]) => `${teamName(k)} ${pc(-l)}`).join(' · ') })])))));
  }

  // 5. Méthode.
  body.append(h('details', { class: 'card' }, h('summary', {}, t('rp.howTitle')),
    h('ul', { class: 'small' }, ['rp.how1', 'rp.how2', 'rp.how3', 'rp.how4', 'rp.how5'].map((k) => h('li', {}, t(k))))));
}

export function render(root, ctx) {
  const size = ctx.params.get('n') === '5' ? 5 : 4;
  const heroes = store.listHeroes().filter((x) => D.classById.has(x.classId));
  root.append(h('h1', {}, t('rp.title')), h('p', { class: 'lead' }, t('rp.intro')), h('p', { class: 'note' }, t('rp.note')));
  if (heroes.length < 5) {
    root.append(h('p', {}, t('rp.needHeroes')), h('p', { class: 'actions' }, h('a', { class: 'button', href: '#/scan' }, t('tm.goImport'))));
    return;
  }
  root.append(h('div', { class: 'q-group', role: 'group', 'aria-label': t('el.sizeAria') },
    [4, 5].map((n) => h('button', { type: 'button', class: 'q-btn', 'aria-pressed': String(size === n), onclick: () => { location.hash = n === 5 ? '#/replace?n=5' : '#/replace'; } }, t('el.size', { n })))));
  const body = h('div', { 'aria-live': 'polite' }, h('p', { class: 'muted' }, t('rp.computing')));
  root.append(body);
  // Le calcul prend une à deux secondes : on laisse d'abord la page s'afficher.
  setTimeout(() => {
    if (!body.isConnected) return;
    try { render2(body, rosterPlan(heroes, size)); } catch (e) { console.error(e); clear(body); body.append(h('p', { class: 'error', role: 'alert' }, `${t('error.view')} ${e.message}`)); }
  }, 30);
}

