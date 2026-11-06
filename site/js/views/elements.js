// Vue « Meilleures compos par élément » (late game) : champions, classes par rôle, enchantement d'élément, compo conseillée, meilleur groupe sauvegardé.
import { D, champIcon, classIcon, skillIcon, elemIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, icon, fmt } from '../dom.js';
import { classesFor, lineageId, HYBRID, EVASION_TANK } from '../roles.js';
import { elementEnchants, leaderOf } from '../guide-calc.js';
import { combineModifiers, heroCandidate, championCandidate, recommend } from '../tower-calc.js';
import * as store from '../store.js';

const ELEMS = ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark', 'Gold'];
const SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vToZu-xRXRUjgU26St3tEH6OzXdVCADMY46zFrFUpcZiCuv3fcook5K4Y5uO0wF0esgDO06B-ZvPGqg/pubhtml/sheet?gid=395750963&single=true&widget=true&headers=false';
const SHEET_PAGE = 'https://st-central.net/tldr-heroes/#Roster-Building';
// Monstre de référence fictif pour classer les groupes sauvegardés (même ordre de grandeur que le Tombeau, cf. tower.js).
const REF_MOB = { hp: 80000, atk: 70, aoe: 40, caps: { c50: 3200, c70: 6400, c75: 19200 } };
const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

const byAtk = (a, b) => b.atk * b.critDmg - a.atk * a.critDmg;
const byDef = (a, b) => b.def + b.hp / 10 - (a.def + a.hp / 10);

/** Notes de build STC (bis.json) des lignées données, dédoublonnées, telles quelles. */
function bisNotes(classes) {
  const out = [];
  for (const c of classes) {
    const bis = D.bisByClassId.get(lineageId(c));
    const notes = bis ? [...new Set(bis.variants.flatMap((v) => v.notes))] : [];
    if (notes.length) out.push({ cls: c, notes });
  }
  return out;
}

function classChip(c, tag) {
  return h('a', { class: 'chip-cls', href: `#/builds?c=${lineageId(c)}`, title: `${c.name} (${c.group})` }, icon(classIcon(c.name), { size: 28 }), c.name,
    tag ? h('span', { class: 'tag' }, tag) : null);
}

export function render(root, ctx) {
  const P = ctx.params;
  const S = { size: P.get('n') === '5' ? 5 : 4 };
  const persist = () => ctx.setParams({ n: S.size === 5 ? 5 : '' });

  const cards = h('div', { class: 'elem-grid' });

  const compo = (el, champs) => {
    const tanks = classesFor('tank', el).map((c) => ({ c, ...c })).sort(byDef);
    const dpsEl = classesFor('dps', el);
    const tankPool = tanks.length ? tanks : classesFor('tank').map((c) => ({ c, ...c })).sort(byDef);
    const dpsAll = classesFor('dps').filter((c) => !dpsEl.includes(c)).map((c) => ({ c, ...c })).sort(byAtk);
    const dpsPool = [...dpsEl.map((c) => ({ c, ...c })).sort(byAtk), ...dpsAll];
    const nDps = S.size - 2;
    const dps = dpsPool.slice(0, nDps);
    return { champ: champs[0] || D.championByName.get('Argon'), champGeneric: !champs.length, tank: tankPool[0] && tankPool[0].c, tankOther: !tanks.length, dps: dps.map((x) => x.c), dpsOther: dps.filter((x) => !dpsEl.includes(x.c)).length };
  };

  const bestGroup = (el, champs) => {
    const box = h('div', { class: 'elem-mine' }, h('h4', {}, t('el.myBest')));
    const heroes = store.listHeroes();
    if (!heroes.length) { box.append(h('p', { class: 'muted small' }, t('el.noHeroes'), ' ', h('a', { href: '#/roster?edit=new' }, t('ro.newHero')))); return box; }
    if (el === 'Gold') { box.append(h('p', { class: 'muted small' }, t('el.noBarrierGold'))); return box; }
    const cands = heroes.map(heroCandidate).concat(champs.map((c) => championCandidate(c, 4)));
    const res = recommend(cands, S.size, REF_MOB, combineModifiers([]), { barrier: el }, 1)[0];
    if (!res) { box.append(h('p', { class: 'muted small' }, t('tw.noResult'))); return box; }
    const msg = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
    box.append(h('ul', { class: 'elem-team' }, res.members.map((m) => h('li', {}, h('span', { class: 'with-ico' },
      icon(m.kind === 'hero' ? classIcon(m.cls.name) : champIcon(m.label), { size: 28 }), h('span', {}, h('strong', {}, m.label), m.kind === 'hero' ? ` (${m.cls.name})` : ` (${t('team.champion')})`))))),
    h('p', { class: 'small muted' }, t('el.score', { score: res.ev.ratio >= 10 ? '≥ 10' : fmt(res.ev.ratio, 2), dps: fmt(res.ev.dps) })),
    res.members.length < S.size ? h('p', { class: 'warn small' }, t('tw.smallParty', { n: res.members.length, total: S.size })) : null,
    h('button', { type: 'button', class: 'button secondary', onclick: () => {
      const members = res.members.map((m) => (m.kind === 'hero' ? { heroId: m.hero.id } : { champion: m.champion.name, leaderTier: 4 }));
      const tm = store.saveTeam({ id: store.newId('t'), name: t('el.teamName', { el }), context: { kind: 'tomb', barrier: el, modifiers: [] }, members, notes: '' });
      msg.className = tm ? 'small' : 'small error'; msg.textContent = tm ? t('team.saved1', { name: tm.name }) : t('ro.saveFail');
      if (tm && !store.storageOk()) { msg.className = 'small error'; msg.textContent = t('ro.noStorage'); }
    } }, t('tw.saveTeam')), msg);
    return box;
  };

  const card = (el) => {
    const champs = D.champions.filter((c) => c.element === el);
    const gold = el === 'Gold';
    const tanks = gold ? [] : classesFor('tank', el).filter((c) => c.element === el);
    const dps = gold ? [] : classesFor('dps', el);
    const heal = gold ? [] : classesFor('heal', el).concat(classesFor('support', el));
    const ench = elementEnchants(el);
    const co = compo(el, champs);
    const notes = bisNotes([...tanks, ...dps.filter((c) => c.element === el)]);
    const sec = h('section', { class: 'card elem-card', 'aria-labelledby': `el-${el}` },
      h('h2', { id: `el-${el}`, class: 'with-ico-h' }, icon(elemIcon(el), { size: 40 }), el),
      h('h3', {}, t('el.champions')),
      champs.length ? h('ul', { class: 'plain' }, champs.map((c) => {
        const lead = leaderOf(c.name);
        return h('li', {}, h('span', { class: 'with-ico' }, icon(champIcon(c.name), { size: 40, cls: 'portrait' }), h('span', {}, h('strong', {}, c.name), ' ', h('span', { class: 'muted small' }, c.group))),
          lead ? h('div', { class: 'small' }, h('span', { class: 'with-ico' }, icon(skillIcon(lead.name) || skillIcon(lead.family), { size: 24 }), h('span', {}, h('strong', {}, `${lead.name} (T4) `), lead.effect))) : null);
      })) : h('p', { class: 'muted small' }, t('el.noChamp')),
      h('h3', {}, t('el.classes')),
      h('p', {}, h('strong', {}, `${t('gd.tank')} : `), tanks.length ? tanks.map((c) => classChip(c, HYBRID.has(c.name) ? t('el.hybrid') : EVASION_TANK.has(c.name) ? t('el.evaTank') : '')) : h('span', { class: 'muted' }, t('el.noClass'))),
      h('p', {}, h('strong', {}, `${t('gd.dps')} : `), dps.length ? dps.map((c) => classChip(c, c.element === 'Any' ? t('gd.anyElem') : '')) : h('span', { class: 'muted' }, t('el.noClass'))),
      h('p', {}, h('strong', {}, `${t('el.healSupport')} : `), heal.length ? heal.map((c) => classChip(c, c.name === 'Fateweaver' || c.name === 'Chronomancer' ? t('el.support') : '')) : h('span', { class: 'muted' }, t('el.noClass'))),
      h('h3', {}, t('gd.enchant')),
      ench.best ? h('p', {}, h('strong', {}, `${ench.best.name} (+${ench.best.value} %)`), ' ', h('span', { class: 'muted small' }, `(${ench.ladder.map((e) => `${e.name} ${e.value} %`).join(' · ')})`)) : '–',
      notes.length ? h('details', {}, h('summary', {}, t('el.stcNotes')), notes.map((n) => h('div', { class: 'small' }, h('strong', {}, `${n.cls.name} : `), h('ul', {}, n.notes.map((x) => h('li', {}, x))))),
        h('p', { class: 'credit small', role: 'note' }, t('builds.creditBottom', { authors: D.bis.authors, license: D.bis.license }), ' ', ext(D.bis.source, t('builds.creditSource')))) : null,
      h('h3', {}, t('el.compo', { n: S.size })),
      h('ol', { class: 'compo' },
        h('li', {}, h('span', { class: 'with-ico' }, icon(champIcon(co.champ.name), { size: 32, cls: 'portrait' }), h('span', {}, h('strong', {}, co.champ.name), ` (${t('team.champion')}${co.champGeneric ? ', ' + t('el.generic') : ''})`))),
        co.tank ? h('li', {}, classChip(co.tank, t('gd.tank') + (co.tankOther ? ` – ${t('el.otherElem')}` : ''))) : null,
        co.dps.map((c, i) => h('li', {}, classChip(c, t('gd.dps') + (c.element !== el && c.element !== 'Any' ? ` – ${t('el.otherElem')}` : ''))))),
      h('p', { class: 'small muted' }, t('el.compoNote')),
      bestGroup(el, champs));
    return sec;
  };

  const draw = () => {
    clear(cards);
    ELEMS.forEach((e) => cards.append(card(e)));
  };

  const sizeBtns = [4, 5].map((n) => h('button', { type: 'button', class: 'q-btn', 'aria-pressed': String(S.size === n),
    onclick: () => { S.size = n; sizeBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(S.size === [4, 5][i]))); persist(); draw(); } }, t('el.size', { n })));

  root.append(h('h1', {}, t('el.title')), h('p', { class: 'lead' }, t('el.intro')), h('p', { class: 'note' }, t('el.disclaimer')),
    h('div', { class: 'q-group', role: 'group', 'aria-label': t('el.sizeAria') }, sizeBtns), cards,
    h('section', { class: 'card' }, h('h2', {}, t('el.rosters')),
      h('p', { class: 'small' }, t('el.rostersTxt')),
      h('iframe', { class: 'sheet-frame', src: SHEET, loading: 'lazy', title: t('el.rostersTitle'), referrerpolicy: 'no-referrer' }),
      h('p', { class: 'credit', role: 'note' }, t('el.rostersCredit'), ' ', ext(SHEET_PAGE, 'st-central.net/tldr-heroes'), ' · ', ext('https://creativecommons.org/licenses/by-nc-nd/4.0/', 'CC BY-NC-ND 4.0'))));
  draw();
}
