// Filtre global « Objets accessibles » (préférence enregistrée dans le store) + sélecteur réutilisable.
import { t } from './i18n.js';
import { h } from './dom.js';
import { getPref, setPref } from './store.js';
import { ACCESS_MODES } from './calc.js';

/** Mode courant : 'all' | 'free' | 'base' (défaut 'free' = sans achat, comme l'ancien filtre « exclure packs »). */
export function getAccess() {
  const v = getPref('access', 'free');
  return ACCESS_MODES.includes(v) ? v : 'free';
}
export const setAccess = (v) => { if (ACCESS_MODES.includes(v)) setPref('access', v); };

let seq = 0;
/** Sélecteur visible sur les pages concernées ; onChange(mode) après enregistrement. */
export function accessSelector(onChange) {
  const id = `acc-${++seq}`;
  const sel = h('select', { id, onchange: () => { setAccess(sel.value); onChange && onChange(sel.value); } },
    ACCESS_MODES.map((m) => h('option', { value: m, selected: getAccess() === m }, t('acc.' + m))));
  return h('div', { class: 'field access-field' }, h('label', { for: id }, t('acc.label')), sel, h('p', { class: 'muted small field-hint' }, t('acc.hint')));
}
