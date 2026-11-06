import { t } from '../i18n.js';
import { h } from '../dom.js';
import { D } from '../data.js';

const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

export function render(root) {
  root.append(
    h('h1', {}, t('about.title')),
    h('p', { class: 'lead' }, t('about.fan')),
    h('p', {}, t('about.free')),
    h('h2', {}, t('about.sources')),
    h('ul', {},
      h('li', {}, ext('https://docs.google.com/spreadsheets/d/1WLa7X8h3O0-aGKxeAlCL7bnN8-FhGd3t7pz2RCzSg8c', t('about.sheet')), ' — ', t('about.sheetDesc')),
      h('li', {}, ext('https://st-central.net/', 'st-central.net'), ' — ', t('about.stc')),
      h('li', {}, ext(D.bis.source, 'STC Hub – BIS Heroes'), ' — ', t('about.hub', { authors: D.bis.authors })),
      h('li', {}, ext('https://st-central.net/tldr-heroes/', 'STC TL;DR Heroes'), ' — ', t('about.tldr'))),
    h('h2', {}, t('about.license')),
    h('p', {}, t('about.licenseBis', { license: D.bis.license }), ' ', ext(D.bis.licenseUrl, D.bis.licenseUrl)),
    h('p', {}, t('about.noModify')),
    h('h2', {}, t('about.limits')),
    h('ul', {}, ['about.l1', 'about.l2', 'about.l3'].map((k) => h('li', {}, t(k)))),
    h('h2', {}, t('about.data')),
    h('p', {}, t('about.dataDesc', { game: D.meta.clientVersion, sheet: D.meta.sheetVersion, date: D.meta.generatedAt })),
  );
}
