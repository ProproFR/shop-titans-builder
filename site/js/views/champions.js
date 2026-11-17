// Vue « Mes champions » (#/champions) : même présentation que « Mes héros » (cases ou liste).
// Chaque champion possédé a sa carte (niveau, puissance, stats) ; « Modifier » ouvre les champs.
// Lien de pré-remplissage : #/champions?set=Lilu~50~53343,Yami~50~57667
import { D, champIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, icon, numberField } from '../dom.js';
import { viewToggle, championUnit, unitList } from './cards.js';
import * as store from '../store.js';
import { heroWeights } from '../upgrades.js';
import { fmt } from '../dom.js';

function parseSet(v) {
  const out = [];
  for (const part of String(v || '').split(',')) {
    const [name, lvl, pw] = part.split('~').map((x) => decodeURIComponent(x || '').trim());
    const c = D.champions.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (c) out.push({ name: c.name, level: Number(lvl) || null, power: Number(pw) || null });
  }
  return out;
}

/**
 * Champion à faire monter en premier (Power Up) : gain du prochain palier (ATK compte double, comme les
 * dégâts qui font tomber les boss), ×1,5 s'il est dans un groupe d'élément proposé.
 */
function powerUpCard(list) {
  const withGain = list.filter((x) => x.o && x.o.nextAtk != null);
  if (!withGain.length) return '';
  let inTeams = new Set();
  try { const w = heroWeights(store.listHeroes().filter((x) => D.classById.has(x.classId))); inTeams = w.champions || new Set(); } catch { /* calcul indisponible */ }
  const score = (x) => (2 * x.o.nextAtk / Math.max(1, x.o.atk || 1) + (x.o.nextDef || 0) / Math.max(1, x.o.def || 1)) * (inTeams.has(x.c.name) ? 1.5 : 1);
  const best = withGain.sort((a, b) => score(b) - score(a))[0];
  return h('section', { class: 'card next-action' }, h('div', { class: 'next-kicker' }, t('ch.puTitle')),
    h('div', { class: 'with-ico' }, icon(champIcon(best.c.name), { size: 48, cls: 'portrait' }),
      h('div', {}, h('strong', { class: 'next-hero' }, best.c.name),
        h('p', { class: 'next-what' }, t('ch.puWhat', { atk: fmt(best.o.nextAtk), def: fmt(best.o.nextDef || 0) })),
        h('p', { class: 'small' }, inTeams.has(best.c.name) ? t('ch.puInTeam') : t('ch.puWhy')))));
}

export function render(root, ctx) {
  const msg = h('p', { role: 'status', 'aria-live': 'polite' });
  const body = h('div', {});
  let editing = null;
  root.append(h('h1', {}, t('ch.title')), h('p', { class: 'lead' }, t('ch.intro2')));

  // Lien de pré-remplissage : un bouton pour tout enregistrer d'un coup.
  if (ctx.params.has('set')) {
    const preset = parseSet(ctx.params.get('set'));
    const box = h('div', { class: 'note' }, h('p', {}, t('ch.preset2', { n: preset.length, names: preset.map((x) => x.name).join(', ') })),
      h('button', { type: 'button', class: 'button', onclick: () => { preset.forEach((c) => store.saveChampion({ ...(store.listChampions().find((x) => x.name === c.name) || {}), ...c })); history.replaceState(null, '', '#/champions'); box.remove(); draw(); } }, t('ch.presetSave')));
    root.append(box);
  }
  const toggle = viewToggle(() => draw());
  root.append(h('div', { class: 'list-tools' }, toggle, h('a', { class: 'button', href: '#/teams' }, t('sc.seeTeams'))), msg, body);

  function editor(champ, cur) {
    const c = { name: champ.name, level: null, power: null, ...(cur || {}) };
    const f = (k, lbl, max) => numberField({ label: lbl, id: `ch-${champ.name}-${k}`, value: c[k], min: 0, max, step: 1, onChange: (v) => { if (v == null) delete c[k]; else c[k] = v; } });
    return h('li', { class: 'card unit-card unit-edit' },
      h('div', { class: 'unit-head' }, icon(champIcon(champ.name), { size: 52, cls: 'portrait' }), h('h3', {}, champ.name)),
      h('div', { class: 'row' }, f('level', t('ch.level'), 99), f('power', t('ch.power')), f('hp', 'HP'), f('atk', 'ATK'), f('def', 'DEF'), f('eva', 'EVA %', 100)),
      h('p', { class: 'small muted' }, t('ch.editHint')),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'button', onclick: () => { const ok = store.saveChampion(c); editing = null; msg.className = ok ? 'note' : 'error'; msg.textContent = ok ? t('sc.champSaved', { name: champ.name }) : t('ch.saveFail'); draw(); } }, t('ro.save')),
        h('button', { type: 'button', class: 'btn-small', onclick: () => { editing = null; draw(); } }, t('ro.cancel'))));
  }

  function draw() {
    const owned = new Map(store.listChampions().map((c) => [c.name, c]));
    const view = toggle.value();
    const mine = D.champions.filter((c) => owned.has(c.name)).sort((a, b) => (owned.get(b.name).power || 0) - (owned.get(a.name).power || 0));
    const others = D.champions.filter((c) => !owned.has(c.name));
    body.replaceChildren(powerUpCard(mine.map((c) => ({ c, o: owned.get(c.name) }))), h('h2', {}, `${t('ch.mine')} (${mine.length})`));
    if (!mine.length) body.append(h('p', { class: 'muted' }, t('ch.none')));
    else body.append(unitList(view, mine.map((c) => (editing === c.name ? editor(c, owned.get(c.name)) : championUnit(view, c, owned.get(c.name), [
      h('button', { type: 'button', class: 'btn-small', onclick: () => { editing = c.name; draw(); } }, t('ro.edit')),
      h('button', { type: 'button', class: 'btn-small', 'aria-label': `${t('ch.remove')} ${c.name}`, onclick: () => { store.saveChampions(store.listChampions().filter((x) => x.name !== c.name)); draw(); } }, t('ch.remove'))])))));
    if (others.length) {
      body.append(h('h2', {}, t('ch.others')), h('p', { class: 'small muted' }, t('ch.othersHint')),
        editing && others.some((c) => c.name === editing) ? h('ul', { class: 'unit-grid' }, editor(others.find((c) => c.name === editing), null)) : null,
        h('div', { class: 'chips' }, others.map((c) => h('button', { type: 'button', class: 'chip-add', onclick: () => { editing = c.name; draw(); } }, icon(champIcon(c.name), { size: 28, cls: 'portrait' }), `+ ${c.name}`))));
    }
    body.append(h('p', { class: 'small' }, t('ch.tipScan'), ' ', h('a', { href: '#/scan' }, t('nav.scan'))));
  }
  draw();
}
