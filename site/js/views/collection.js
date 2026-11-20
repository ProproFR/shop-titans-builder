// Vue « Collection d'objets » (#/collection) : suivi des qualités léguées, ordre conseillé pour compléter
// le plus vite possible, et réglage « ne conseiller que mes objets débloqués » utilisé par le plan d'améliorations.
import { D, itemIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, icon, fmt } from '../dom.js';
import * as store from '../store.js';
import { typeName, qualityName } from '../i18n-names.js';
import { QUALITIES, FULL, CATEGORIES, categoryOf, isUnlocked, isComplete, completionOrder, progress, trackedItems } from '../collection.js';

const ORDER_SIZE = 15;
const originTag = (it) => {
  const o = it.origin || 'base';
  return o === 'base' ? null : h('span', { class: 'tag' }, t('col.origin.' + o));
};

export function render(root, ctx) {
  const S = {
    cat: ctx.params.get('cat') || 'weapons',
    q: '',
    withPaid: !!store.getPref('colPaid', false),
  };
  root.append(h('h1', {}, t('col.title')), h('p', { class: 'lead' }, t('col.intro')), h('p', { class: 'note' }, t('col.how')));

  // Réglages
  const only = h('input', { type: 'checkbox', id: 'col-only', checked: !!store.getPref('colOnlyUnlocked', false), onchange: () => { store.setPref('colOnlyUnlocked', only.checked); } });
  const paid = h('input', { type: 'checkbox', id: 'col-paid', checked: S.withPaid, onchange: () => { S.withPaid = paid.checked; store.setPref('colPaid', paid.checked); drawAll(); } });
  root.append(h('section', { class: 'card' }, h('h2', {}, t('col.settings')),
    h('p', {}, h('label', { for: 'col-only', class: 'check' }, only, ' ', t('col.onlyUnlocked'))),
    h('p', { class: 'small muted' }, t('col.onlyUnlockedHint')),
    h('p', {}, h('label', { for: 'col-paid', class: 'check' }, paid, ' ', t('col.withPaid')))));

  const summary = h('section', { class: 'card', 'aria-live': 'polite' });
  const order = h('section', { class: 'card next-action', 'aria-labelledby': 'col-order' });
  const track = h('section', { class: 'card', 'aria-labelledby': 'col-track' });
  root.append(summary, order, track);

  /** Les 5 points de qualité d'un objet, cliquables (comme dans le livre du jeu). */
  function dots(it, onChange) {
    const wrap = h('span', { class: 'qdots', role: 'group', 'aria-label': t('col.dotsAria', { item: it.name }) });
    const draw = () => {
      clear(wrap);
      const m = store.getCollection()[it.name] || 0;
      QUALITIES.forEach((q, i) => {
        const on = !!(m & (1 << i));
        wrap.append(h('button', { type: 'button', class: `qdot q${i}`, 'aria-pressed': String(on), title: qualityName(q),
          'aria-label': `${qualityName(q)} : ${on ? t('col.given') : t('col.notGiven')}`,
          onclick: () => {
            const cur = store.getCollection()[it.name] || 0;
            store.setCollectionEntry(it.name, (cur ^ (1 << i)) | store.COL_UNLOCKED);
            draw(); onChange();
          } }));
      });
    };
    draw();
    return wrap;
  }

  function itemRow(it, rank, onChange) {
    const m = store.getCollection()[it.name] || 0;
    const unl = h('input', { type: 'checkbox', checked: isUnlocked(m), 'aria-label': t('col.unlockedAria', { item: it.name }),
      onchange: () => {
        const cur = store.getCollection()[it.name] || 0;
        store.setCollectionEntry(it.name, unl.checked ? cur | store.COL_UNLOCKED : 0);
        onChange(true);
      } });
    const all = h('button', { type: 'button', class: 'btn-small', onclick: () => { store.setCollectionEntry(it.name, FULL | store.COL_UNLOCKED); onChange(true); } }, t('col.all'));
    return h('li', { class: `col-row${isComplete(m) ? ' col-done' : ''}` },
      h('span', { class: 'col-lead' }, rank ? h('span', { class: 'upgrade-rank' }, String(rank)) : null, icon(itemIcon(it), { size: 36, alt: '' })),
      h('div', { class: 'col-name' }, h('strong', {}, it.name), ' ', originTag(it),
        h('div', { class: 'muted small' }, `T${it.tier} · ${typeName(it.type)}`)),
      dots(it, () => { unl.checked = true; onChange(false); }), // un point coché = objet débloqué
      h('label', { class: 'check small' }, unl, ' ', t('col.unlocked')),
      isComplete(m) ? h('span', { class: 'tag tag-ok' }, t('col.complete')) : all);
  }

  function drawSummary() {
    clear(summary);
    const p = progress(trackedItems(S.withPaid));
    summary.append(h('h2', {}, t('col.progress')),
      h('div', { class: 'col-stats' },
        h('div', {}, h('strong', {}, `${fmt(p.done)} / ${fmt(p.total)}`), h('div', { class: 'small muted' }, t('col.itemsDone'))),
        h('div', {}, h('strong', {}, `${fmt(p.dots)} / ${fmt(p.dotsTotal)}`), h('div', { class: 'small muted' }, t('col.dotsDone'))),
        h('div', {}, h('strong', {}, fmt(p.unlocked)), h('div', { class: 'small muted' }, t('col.unlockedN')))),
      h('progress', { max: String(p.dotsTotal), value: String(p.dots), 'aria-label': t('col.dotsDone') }));
  }

  function drawOrder() {
    clear(order);
    order.append(h('h2', { id: 'col-order', class: 'next-kicker' }, t('col.orderTitle')), h('p', { class: 'small muted' }, t('col.orderHint')));
    const list = completionOrder({ withPaid: S.withPaid });
    if (!list.length) { order.append(h('p', {}, Object.keys(store.getCollection()).length ? t('col.orderDone') : t('col.orderEmpty'))); return; }
    const ol = h('ol', { class: 'col-list' });
    list.slice(0, ORDER_SIZE).forEach((x, i) => {
      const li = itemRow(x.it, i + 1, () => { drawSummary(); drawOrder(); drawTrack(); });
      li.append(h('div', { class: 'small col-miss' }, t('col.missing', { list: x.missing.map(qualityName).join(', ') })));
      ol.append(li);
    });
    order.append(ol);
    if (list.length > ORDER_SIZE) order.append(h('p', { class: 'small muted' }, t('col.orderMore', { n: list.length - ORDER_SIZE })));
  }

  let openTypes = new Set();
  function drawTrack() {
    clear(track);
    track.append(h('h2', { id: 'col-track' }, t('col.trackTitle')), h('p', { class: 'small muted' }, t('col.trackHint')));
    track.append(h('div', { class: 'q-group', role: 'group', 'aria-label': t('col.catAria') },
      CATEGORIES.map((c) => h('button', { type: 'button', class: 'q-btn', 'aria-pressed': String(S.cat === c.id), onclick: () => { S.cat = c.id; drawTrack(); } }, t('col.cat.' + c.id)))));
    const search = h('input', { type: 'search', value: S.q, placeholder: t('col.search'), 'aria-label': t('col.search'),
      oninput: () => { S.q = search.value; drawTypes(); } });
    track.append(h('p', {}, search));
    const types = h('div', {});
    track.append(types);
    function drawTypes() {
      clear(types);
      const q = S.q.trim().toLowerCase();
      const items = trackedItems(S.withPaid).filter((it) => categoryOf(it.type) === S.cat && (!q || it.name.toLowerCase().includes(q) || typeName(it.type).toLowerCase().includes(q)));
      const byType = new Map();
      for (const it of items) { if (!byType.has(it.type)) byType.set(it.type, []); byType.get(it.type).push(it); }
      const cat = CATEGORIES.find((c) => c.id === S.cat);
      const order2 = [...byType.keys()].sort((a, b) => cat.types.indexOf(a) - cat.types.indexOf(b));
      if (!order2.length) { types.append(h('p', {}, t('col.noMatch'))); return; }
      for (const type of order2) {
        const list = byType.get(type).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
        const p = progress(list);
        const body = h('ul', { class: 'col-list' });
        const fill = () => { clear(body); list.forEach((it) => body.append(itemRow(it, 0, (full) => { drawSummary(); drawOrder(); if (full) fill(); }))); };
        const det = h('details', { class: 'col-type', open: openTypes.has(type) || !!q },
          h('summary', {}, h('strong', {}, typeName(type)), ` · ${t('col.typeProgress', { done: p.done, total: p.total, dots: p.dots, dotsTotal: p.dotsTotal })}`),
          body);
        det.addEventListener('toggle', () => { if (det.open) { openTypes.add(type); fill(); } else openTypes.delete(type); });
        if (det.open) fill();
        types.append(det);
      }
    }
    drawTypes();
  }

  function drawAll() { drawSummary(); drawOrder(); drawTrack(); }
  drawAll();
}
