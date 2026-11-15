// Vue « Mentions légales et confidentialité » (#/legal), liée depuis le pied de page.
import { t, getLang } from '../i18n.js';
import { h } from '../dom.js';
import * as store from '../store.js';

// À compléter si vous voulez publier un moyen de contact (ex. 'https://github.com/<pseudo>/<depot>/issues'
// ou 'mailto:adresse-dediee@exemple.fr'). Laisser vide pour ne rien afficher.
const CONTACT = '';
// Date de la dernière modification de cette page (AAAA-MM-JJ).
const UPDATED = '2026-11-13';

const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

export function render(root) {
  const date = new Date(UPDATED + 'T12:00:00').toLocaleDateString(getLang() === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const status = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
  const clearBtn = h('button', { type: 'button', class: 'btn-small danger', onclick: () => {
    if (!window.confirm(t('lg.clearConfirm'))) return;
    status.textContent = store.clearAll() ? t('lg.cleared') : t('lg.clearFail');
  } }, t('lg.clear'));
  const contactHref = CONTACT && /^(https:|mailto:)/.test(CONTACT) ? CONTACT : '';

  root.append(
    h('h1', {}, t('lg.title')),
    h('p', { class: 'muted small' }, t('lg.updated', { date })),

    h('section', { class: 'card' },
      h('h2', {}, t('lg.editor')),
      h('p', {}, t('lg.editorTxt')),
      h('p', {}, t('lg.director')),
      contactHref ? h('p', {}, h('strong', {}, t('lg.contact') + (getLang() === 'fr' ? ' : ' : ': ')), ext(contactHref, contactHref.replace(/^mailto:/, ''))) : null,
      h('h2', {}, t('lg.host')),
      h('p', {}, t('lg.hostTxt'), ' ', ext('https://pages.github.com/', 'pages.github.com'))),

    h('section', { class: 'card' },
      h('h2', {}, t('lg.data')),
      h('p', {}, t('lg.dataTxt')),
      h('h3', {}, t('lg.local')),
      h('p', {}, t('lg.localTxt')),
      h('ul', {}, h('li', {}, t('lg.local1')), h('li', {}, t('lg.local2'))),
      h('p', {}, t('lg.localTxt2')),
      h('p', {}, clearBtn),
      status,
      h('h3', {}, t('lg.third')),
      h('p', {}, t('lg.thirdTxt')),
      h('ul', {},
        h('li', {}, t('lg.t1'), ' ', ext('https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement', t('lg.t1link')), '.'),
        h('li', {}, t('lg.t2'), ' ', ext('https://developers.google.com/fonts/faq/privacy', t('lg.t2link')), '.'),
        h('li', {}, t('lg.t3')),
        h('li', {}, t('lg.t4'))),
      h('h3', {}, t('lg.rights')),
      h('p', {}, t('lg.rightsTxt'), ' ', ext('https://www.cnil.fr/fr/plaintes', 'cnil.fr'))),

    h('section', { class: 'card' },
      h('h2', {}, t('lg.ip')),
      h('p', {}, t('lg.ipTxt')),
      h('p', { class: 'note' }, t('lg.fan')),
      h('h2', {}, t('lg.calc')),
      h('p', {}, t('lg.calcTxt')),
      h('h2', {}, t('lg.a11y')),
      h('p', {}, t(contactHref ? 'lg.a11yTxt' : 'lg.a11yNoContact'))),

    h('p', { class: 'muted small' }, t('lg.notLegal')),
  );
}
