// Petits utilitaires DOM (pas de framework).
import { itemIcon, elemIcon, statIcon, uiIcon } from './data.js';

let uid = 0;
export const nextId = (p = 'id') => `${p}-${++uid}`;

/** h('div', {class:'x', onclick: fn}, 'texte', autreNoeud) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'for') el.htmlFor = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'selected') el.selected = !!v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c.nodeType ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

// replaceChildren() ne plante pas si un nœud est retiré pendant un 'blur' déclenché par le retrait.
export function clear(el) { el.replaceChildren(); return el; }

/** Champ texte avec recherche (input + datalist). options: [{value,label?}] */
export function combo({ label, options, value = '', placeholder = '', onPick, id }) {
  const iid = id || nextId('combo');
  const listId = iid + '-list';
  const dl = h('datalist', { id: listId }, options.map((o) => h('option', { value: o.value }, o.label || null)));
  const input = h('input', { type: 'text', id: iid, list: listId, value, placeholder, autocomplete: 'off', spellcheck: 'false' });
  const byLower = new Map(options.map((o) => [o.value.toLowerCase(), o.value]));
  let last = value; // évite un 2e onPick (événement 'change' au blur après 'input')
  const fire = () => {
    if (!input.isConnected) return;
    const v = input.value.trim();
    if (v === '') { if (last !== '') { last = ''; onPick && onPick(''); } return; }
    const hit = byLower.get(v.toLowerCase());
    if (hit) {
      input.value = hit; input.removeAttribute('aria-invalid');
      if (hit !== last) { last = hit; onPick && onPick(hit); }
    }
    else input.setAttribute('aria-invalid', 'true');
  };
  input.addEventListener('change', fire);
  input.addEventListener('input', () => { if (byLower.has(input.value.trim().toLowerCase())) setTimeout(fire, 0); });
  const wrap = h('div', { class: 'field' }, label ? h('label', { for: iid }, label) : null, input, dl);
  wrap.input = input;
  return wrap;
}

export function select({ label, options, value, onChange, id }) {
  const iid = id || nextId('sel');
  const sel = h('select', { id: iid, onchange: () => onChange && onChange(sel.value) },
    options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  const wrap = h('div', { class: 'field' }, label ? h('label', { for: iid }, label) : null, sel);
  wrap.sel = sel;
  return wrap;
}

export function numberField({ label, value, min, max, step, onChange, id }) {
  const iid = id || nextId('num');
  const inp = h('input', { type: 'number', id: iid, value: value ?? '', min, max, step: step ?? 'any', inputmode: 'decimal',
    oninput: () => onChange && onChange(inp.value === '' ? null : Number(inp.value)) });
  const wrap = h('div', { class: 'field' }, label ? h('label', { for: iid }, label) : null, inp);
  wrap.input = inp;
  return wrap;
}

/** Image décorative ou nommée. size = côté en px (width/height). */
export function icon(src, { size = 24, alt = '', cls = '' } = {}) {
  if (!src) return null;
  return h('img', { class: `ico${cls ? ' ' + cls : ''}`, src, alt, width: size, height: size, loading: 'lazy', decoding: 'async' });
}

/** Pastille d'élément : icône + texte. */
export const elBadge = (el) => el ? h('span', { class: `elem elem-${String(el).toLowerCase()}` }, icon(elemIcon(el), { size: 16 }), el) : null;

/** Étiquette de statistique : icône (clé d'icons.stats) + texte. */
export const statLabel = (key, text) => h('span', { class: 'stat-label' }, icon(statIcon(key), { size: 18 }), text);

/** Icône + texte alignés (classe, compétence, quête…). */
export const withIcon = (src, text, size = 28) => h('span', { class: 'with-ico' }, icon(src, { size }), h('span', {}, text));

/** Case d'équipement façon jeu : image, cadre de qualité, pastille de tier en coin. */
export function gearTile(item, { tier, quality, size = 64 } = {}) {
  const src = itemIcon(item);
  const q = quality ? ({ normal: 'common', superior: 'uncommon' }[String(quality).toLowerCase()] || String(quality).toLowerCase()) : '';
  const tile = h('div', { class: `gear-tile${q ? ' q-' + q : ''}`, style: `--tile:${size}px` },
    src ? icon(src, { size, alt: item.name || '' }) : h('span', { class: 'gear-empty', 'aria-hidden': 'true' }, '?'),
    tier ? h('span', { class: 'tier-badge' }, icon(uiIcon('tier'), { size: 14 }), `T${tier}`) : null);
  return tile;
}

/** Mention des images (Fan Kit officiel). */
export function creditImages() {
  const fr = document.documentElement.lang !== 'en';
  return [fr ? 'Images : Fan Kit officiel Shop Titans © Kabam Games, Inc., utilisé pour un projet de fan non commercial'
    : 'Images: official Shop Titans Fan Kit © Kabam Games, Inc., used for a non-commercial fan project',
  ' (', h('a', { href: 'https://playshoptitans.com', target: '_blank', rel: 'noopener noreferrer' }, 'playshoptitans.com'), ')'];
}

export function table(headers, rows, cls = '') {
  return h('div', { class: 'table-wrap' }, h('table', { class: cls },
    h('thead', {}, h('tr', {}, headers.map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))))));
}

export const fmt = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n)) ? '–'
  : Number(n).toLocaleString(document.documentElement.lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
export const pct = (x, d = 0) => fmt(x * 100, d) + '%';
