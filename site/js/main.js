// Point d'entrée : routeur par hash (#/vue?param=valeur) + chrome de l'application.
import { loadData, D, uiIcon } from './data.js';
import './i18n-extra.js';
import './i18n-guide.js';
import './i18n-legal.js';
import './i18n-scan.js';
import { t, getLang, setLang, onLangChange } from './i18n.js';
import { h, clear, icon, creditImages } from './dom.js';
import * as builds from './views/builds.js';
import * as optimizer from './views/optimizer.js';
import * as team from './views/team.js';
import * as skills from './views/skills.js';
import * as roster from './views/roster.js';
import * as tower from './views/tower.js';
import * as guide from './views/guide.js';
import * as elements from './views/elements.js';
import * as dragon from './views/dragon.js';
import * as about from './views/about.js';
import * as legal from './views/legal.js';
import * as scan from './views/scan.js';

const ROUTES = {
  builds: { mod: builds, label: 'nav.builds', ico: 'heroes' },
  roster: { mod: roster, label: 'nav.roster', ico: 'champion' },
  scan: { mod: scan, label: 'nav.scan', ico: 'quest' },
  optimizer: { mod: optimizer, label: 'nav.optimizer', ico: 'craft' },
  team: { mod: team, label: 'nav.team', ico: 'quest' },
  tower: { mod: tower, label: 'nav.tower', ico: 'gem' },
  skills: { mod: skills, label: 'nav.skills', ico: 'skilltree' },
  guide: { mod: guide, label: 'nav.guide', ico: 'tier' },
  elements: { mod: elements, label: 'nav.elements', ico: 'gold' },
  dragon: { mod: dragon, label: 'nav.dragon', ico: 'breakchance' },
  about: { mod: about, label: 'nav.about', ico: 'help' },
  legal: { mod: legal, label: 'nav.legal', ico: 'help', hidden: true }, // lien dans le pied de page
};
const root = document.getElementById('main');
let current = 'builds';

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  return { path: ROUTES[path] ? path : 'builds', params: new URLSearchParams(query) };
}

/** Écrit l'état du formulaire dans l'URL sans re-rendre (replaceState ne déclenche pas hashchange). */
function makeSetParams(path) {
  return (obj) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v)) v.forEach((x) => { if (x !== '' && x != null) p.append(k, x); });
      else if (v !== '' && v != null && v !== false) p.set(k, v === true ? '1' : v);
    }
    const qs = p.toString();
    try { history.replaceState(null, '', `#/${path}${qs ? '?' + qs : ''}`); } catch { /* ignoré */ }
  };
}

function renderNav() {
  const nav = document.getElementById('nav');
  clear(nav);
  const ul = h('ul', { id: 'nav-list' }, Object.entries(ROUTES).filter(([, r]) => !r.hidden).map(([k, r]) =>
    h('li', {}, h('a', { href: `#/${k}`, 'aria-current': k === current ? 'page' : null }, icon(uiIcon(r.ico), { size: 28 }), h('span', {}, t(r.label))))));
  // Mobile : menu repliable (bouton visible sous 760 px, liste toujours visible au-delà).
  const btn = h('button', { type: 'button', class: 'nav-toggle', 'aria-expanded': 'false', 'aria-controls': 'nav-list',
    onclick: () => { const open = !ul.classList.contains('open'); ul.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); } },
  icon(uiIcon(ROUTES[current].ico), { size: 24 }), h('span', {}, `${t('nav.menu')} · ${t(ROUTES[current].label)}`));
  nav.append(btn, ul);
}

function renderFooter() {
  const m = D.meta;
  const el = document.getElementById('footer');
  clear(el);
  el.append(
    h('p', {}, t('footer.versions', { game: m.clientVersion, sheet: m.sheetVersion, date: new Date(m.generatedAt).toLocaleDateString(getLang() === 'fr' ? 'fr-FR' : 'en-GB') })),
    h('p', { class: 'muted' }, t('footer.disclaimer')),
    h('p', { class: 'muted' }, creditImages()),
    h('p', {}, h('a', { href: '#/legal' }, t('footer.legal'))),
  );
}

function applyStaticText() {
  document.documentElement.lang = getLang();
  document.getElementById('lang-select').value = getLang();
  document.getElementById('lang-label').textContent = t('lang.label');
  document.getElementById('nav').setAttribute('aria-label', t('nav.aria'));
  document.getElementById('skip-link').textContent = t('skip');
}

function render() {
  const { path, params } = parseHash();
  current = path;
  applyStaticText();
  renderNav();
  clear(root);
  try {
    ROUTES[path].mod.render(root, { params, path, setParams: makeSetParams(path) });
  } catch (e) {
    console.error(e);
    root.append(h('p', { class: 'error', role: 'alert' }, `${t('error.view')} ${e.message}`));
  }
  document.title = `${t(ROUTES[path].label)} – Shop Titans Builder`;
  if (renderedOnce) { root.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  renderedOnce = true;
}
let renderedOnce = false;

async function start() {
  document.getElementById('lang-select').addEventListener('change', (e) => setLang(e.target.value));
  try {
    await loadData();
  } catch (e) {
    console.error(e);
    clear(root);
    root.append(h('p', { class: 'error', role: 'alert' }, `${t('error.data')} (${e.message}). ${t('error.server')}`));
    return;
  }
  renderFooter();
  onLangChange(() => { renderFooter(); render(); });
  window.addEventListener('hashchange', render);
  render();
}
start();
