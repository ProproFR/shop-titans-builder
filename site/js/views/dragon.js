// Vue « Invasion des dragons » : classement des objets par puissance de dirigeable (colonne « Airship Power » du sheet officiel).
import { D, itemIcon, elemIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, select, numberField, icon, fmt, elBadge, originBadge } from '../dom.js';
import { isAllowed } from '../calc.js';
import { accessSelector, getAccess } from '../provenance.js';

const WEAPONS = new Set(['Sword', 'Axe', 'Dagger', 'Mace', 'Spear', 'Bow', 'Wand', 'Staff', 'Gun', 'Crossbow', 'Instrument', 'Dual Wield', 'Catalyst', 'Scythe']);
const ARMORS = new Set(['Heavy Armor', 'Light Armor', 'Clothes', 'Helmet', 'Rogue Hat', 'Magician Hat', 'Mask', 'Gauntlets', 'Gloves', 'Heavy Footwear', 'Light Footwear']);
export const categoryOf = (type) => (WEAPONS.has(type) ? 'weapons' : ARMORS.has(type) ? 'armors' : 'accessories');
const PAGE = 50;
const CATS = ['all', 'weapons', 'armors', 'accessories'];

export function render(root, ctx) {
  const P = ctx.params;
  const num = (k, d) => { const v = P.get(k); return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d; };
  const types = [...new Set(D.items.map((i) => i.type))].sort();
  const S = {
    cat: CATS.includes(P.get('cat')) ? P.get('cat') : 'all',
    type: types.includes(P.get('type')) ? P.get('type') : '',
    tmin: num('tmin', 1), tmax: num('tmax', D.maxItemTier),
    q: P.get('s') || '', page: Math.max(1, Math.round(num('p', 1))),
  };
  const persist = () => ctx.setParams({ cat: S.cat === 'all' ? '' : S.cat, type: S.type, tmin: S.tmin === 1 ? '' : S.tmin, tmax: S.tmax === D.maxItemTier ? '' : S.tmax, s: S.q, p: S.page === 1 ? '' : S.page });

  const sorted = D.items.filter((i) => i.airship > 0).sort((a, b) => b.airship - a.airship || b.tier - a.tier || a.name.localeCompare(b.name));
  const out = h('div', { 'aria-live': 'polite' });

  const filtered = () => {
    const access = getAccess();
    const q = S.q.trim().toLowerCase();
    return sorted.filter((i) => (S.cat === 'all' || categoryOf(i.type) === S.cat) && (!S.type || i.type === S.type) && i.tier >= S.tmin && i.tier <= S.tmax
      && isAllowed(i, access) && (!q || i.name.toLowerCase().includes(q)));
  };

  const affin = (i) => [i.elemAff.map((a) => (a === 'All' ? h('span', { class: 'tag' }, 'All') : (elemIcon(a) ? elBadge(a) : h('span', { class: 'tag' }, a)))), i.spiritAff.map((a) => h('span', { class: 'tag' }, a))];
  const thumb = (i) => icon(itemIcon(i), { size: 40, alt: i.name });

  const update = () => {
    clear(out);
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    if (S.page > pages) S.page = pages;
    const start = (S.page - 1) * PAGE;
    const slice = list.slice(start, start + PAGE);

    // Meilleur objet par type (selon les filtres)
    const best = new Map();
    for (const i of list) if (!best.has(i.type)) best.set(i.type, i);
    out.append(h('section', { class: 'card' }, h('h2', {}, t('dr.bestByType')),
      best.size ? h('ul', { class: 'best-types' }, [...best.values()].map((i) => h('li', {}, thumb(i), h('span', {}, h('strong', {}, i.name), h('br'), h('span', { class: 'muted small' }, `${i.type} · T${i.tier}`),
        h('br'), h('span', { class: 'small' }, `${t('dr.power')} ${fmt(i.airship)}`)))))
        : h('p', { class: 'muted' }, t('dr.none'))));

    const rows = slice.map((i, k) => h('tr', {},
      h('td', {}, String(start + k + 1)), h('td', {}, thumb(i)), h('td', {}, h('strong', {}, i.name)), h('td', {}, i.type), h('td', {}, `T${i.tier}`),
      h('td', { class: 'num' }, fmt(i.airship)), h('td', {}, affin(i)), h('td', {}, originBadge(i)), h('td', {}, i.antique || '–')));
    const head = ['#', '', t('dr.name'), t('dr.type'), t('dr.tier'), t('dr.power'), t('dr.affinities'), t('dr.origin'), t('dr.antiqueDate')];
    const nav = (id) => h('div', { class: 'pager', role: 'navigation', 'aria-label': t('dr.pagerAria') },
      h('button', { type: 'button', class: 'btn-small', disabled: S.page <= 1 ? '' : null, onclick: () => go(S.page - 1) }, t('dr.prev')),
      h('span', { id }, t('dr.page', { p: S.page, n: pages, total: fmt(list.length) })),
      h('button', { type: 'button', class: 'btn-small', disabled: S.page >= pages ? '' : null, onclick: () => go(S.page + 1) }, t('dr.next')));
    out.append(h('section', { class: 'card' }, h('h2', {}, t('dr.ranking')), nav('pg-top'),
      slice.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'compact dragon-table' },
        h('caption', { class: 'sr-only' }, t('dr.ranking')),
        h('thead', {}, h('tr', {}, head.map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, rows)))
        : h('p', { class: 'muted' }, t('dr.none')),
      pages > 1 ? nav('pg-bot') : null));
  };
  const go = (p) => { S.page = Math.max(1, p); persist(); update(); const top = root.querySelector('h1'); if (top) top.scrollIntoView({ block: 'start' }); };
  const refilter = () => { S.page = 1; persist(); update(); };

  const typeOpts = (cat) => types.filter((x) => cat === 'all' || categoryOf(x) === cat);
  const typeSel = select({ label: t('dr.type'), value: S.type, options: [{ value: '', label: t('dr.allTypes') }, ...typeOpts(S.cat).map((x) => ({ value: x, label: x }))], onChange: (v) => { S.type = v; refilter(); } });
  const tabs = h('div', { class: 'q-group', role: 'group', 'aria-label': t('dr.catAria') }, CATS.map((c) => h('button', { type: 'button', class: 'q-btn', 'data-cat': c, 'aria-pressed': String(S.cat === c),
    onclick: () => {
      S.cat = c; if (S.type && c !== 'all' && categoryOf(S.type) !== c) S.type = '';
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === c)));
      const sel = typeSel.sel; clear(sel);
      [{ value: '', label: t('dr.allTypes') }, ...typeOpts(c).map((x) => ({ value: x, label: x }))].forEach((o) => sel.append(h('option', { value: o.value, selected: o.value === S.type }, o.label)));
      refilter();
    } }, t('dr.cat.' + c))));
  const search = h('div', { class: 'field' }, h('label', { for: 'dr-search' }, t('dr.search')),
    h('input', { type: 'search', id: 'dr-search', value: S.q, placeholder: t('dr.searchPh'), autocomplete: 'off', oninput: (e) => { S.q = e.target.value; refilter(); } }));
  const form = h('div', { class: 'card form-grid' }, tabs, typeSel,
    h('div', { class: 'row' },
      numberField({ label: t('dr.tmin'), value: S.tmin, min: 1, max: D.maxItemTier, step: 1, onChange: (v) => { S.tmin = Math.max(1, v ?? 1); refilter(); } }),
      numberField({ label: t('dr.tmax'), value: S.tmax, min: 1, max: D.maxItemTier, step: 1, onChange: (v) => { S.tmax = Math.min(D.maxItemTier, v ?? D.maxItemTier); refilter(); } })),
    search, accessSelector(() => refilter()));

  root.append(h('h1', {}, t('dr.title')), h('p', { class: 'lead' }, t('dr.intro')), form, out,
    h('p', { class: 'credit', role: 'note' }, t('dr.credit'), ' ', h('a', { href: D.meta.source || '#/about' }, t('dr.creditLink'))));
  update();
}
