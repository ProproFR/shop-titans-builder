// Vue « Mes champions » (#/champions) : même présentation que « Mes héros » (cases ou liste).
// Chaque champion possédé a sa carte (niveau, puissance, stats) ; « Modifier » ouvre les champs.
// Lien de pré-remplissage : #/champions?set=Lilu~50~53343,Yami~50~57667
import { D, champIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, icon, numberField } from '../dom.js';
import { viewToggle, championUnit, unitList } from './cards.js';
import * as store from '../store.js';

function parseSet(v) {
  const out = [];
  for (const part of String(v || '').split(',')) {
    const [name, lvl, pw] = part.split('~').map((x) => decodeURIComponent(x || '').trim());
    const c = D.champions.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (c) out.push({ name: c.name, level: Number(lvl) || null, power: Number(pw) || null });
  }
  return out;
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
    body.replaceChildren(h('h2', {}, `${t('ch.mine')} (${mine.length})`));
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
