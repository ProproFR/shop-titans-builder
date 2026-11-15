// Vue « Mes champions » (#/champions) : champions possédés, avec niveau et puissance (lus sur leurs cartes
// dans le jeu). Les équipes proposées n'utilisent alors que ces champions, avec des stats estimées
// d'après leur puissance. Lien de pré-remplissage : #/champions?set=Lilu~50~53343,Yami~50~57667
import { D, champIcon, elemIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, icon, numberField } from '../dom.js';
import { elementName } from '../i18n-names.js';
import * as store from '../store.js';

/** Lit le paramètre « set » : liste « Nom~niveau~puissance » séparée par des virgules. */
function parseSet(v) {
  const out = new Map();
  for (const part of String(v || '').split(',')) {
    const [name, lvl, pw] = part.split('~').map((x) => decodeURIComponent(x || '').trim());
    const c = D.champions.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (c) out.set(c.name, { name: c.name, level: Number(lvl) || null, power: Number(pw) || null });
  }
  return out;
}

export function render(root, ctx) {
  const saved = new Map(store.listChampions().map((c) => [c.name, c]));
  const preset = ctx.params.has('set') ? parseSet(ctx.params.get('set')) : null;
  // Brouillon : la pré-saisie du lien remplace l'affichage, rien n'est enregistré avant de cliquer.
  const rows = D.champions.map((c) => {
    const p = preset ? preset.get(c.name) : saved.get(c.name);
    return { name: c.name, owned: !!p, level: p ? p.level : null, power: p ? p.power : null };
  });
  const msg = h('p', { role: 'status', 'aria-live': 'polite' });

  root.append(h('h1', {}, t('ch.title')), h('p', { class: 'lead' }, t('ch.intro')), h('p', { class: 'small' }, t('ch.tipScan'), ' ', h('a', { href: '#/scan' }, t('nav.scan'))));
  if (preset) root.append(h('p', { class: 'note' }, t('ch.preset', { n: preset.size })));

  const list = h('div', { class: 'champ-list' });
  rows.forEach((r) => {
    const c = D.champions.find((x) => x.name === r.name);
    const box = h('input', { type: 'checkbox', id: `own-${r.name}`, checked: r.owned, onchange: (e) => { r.owned = e.target.checked; } });
    list.append(h('div', { class: 'card champ-row' },
      h('div', { class: 'with-ico' }, icon(champIcon(c.name), { size: 48, cls: 'portrait' }),
        h('div', {}, h('label', { for: `own-${r.name}`, class: 'check' }, box, ' ', h('strong', {}, c.name)),
          h('div', { class: 'muted small with-ico' }, icon(elemIcon(c.element), { size: 18 }), `${elementName(c.element)} · ${c.group}`),
          saved.get(r.name) && saved.get(r.name).atk ? h('div', { class: 'small' }, `HP ${saved.get(r.name).hp} · ATK ${saved.get(r.name).atk} · DEF ${saved.get(r.name).def} · EVA ${saved.get(r.name).eva ?? 0} %`, ' ', h('span', { class: 'tag tag-ok' }, t('ch.fromSheet'))) : null)),
      h('div', { class: 'row' },
        numberField({ label: t('ch.level'), id: `lvl-${r.name}`, value: r.level, min: 1, max: 99, step: 1, onChange: (v) => { r.level = v; if (v) { r.owned = true; box.checked = true; } } }),
        numberField({ label: t('ch.power'), id: `pw-${r.name}`, value: r.power, min: 0, step: 1, onChange: (v) => { r.power = v; if (v) { r.owned = true; box.checked = true; } } }))));
  });

  const saveBtn = h('button', { type: 'button', class: 'button', onclick: () => {
    // On garde les stats déjà lues sur les fiches (import de capture).
    const okSave = store.saveChampions(rows.filter((r) => r.owned).map((r) => ({ ...(saved.get(r.name) || {}), name: r.name, level: r.level, power: r.power, updatedAt: Date.now() })));
    msg.className = okSave ? 'note' : 'error';
    msg.replaceChildren(okSave ? t('ch.saved', { n: rows.filter((r) => r.owned).length }) : t('ch.saveFail'), ' ', okSave ? h('a', { href: '#/teams' }, t('sc.toTeams')) : '');
    if (preset) history.replaceState(null, '', '#/champions');
  } }, t('ch.save'));

  root.append(list, h('div', { class: 'actions' }, saveBtn), msg, h('p', { class: 'small muted' }, t('ch.how')));
}
