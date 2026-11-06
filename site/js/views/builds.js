// Vue 1 : fiches de classe + builds STC affichés tels quels.
import { D } from '../data.js';
import { t } from '../i18n.js';
import { h, combo, table, elBadge, fmt, pct } from '../dom.js';

export function itemStatsText(it) {
  if (!it) return t('builds.unknownItem');
  const parts = [];
  if (it.atk) parts.push(`ATK ${fmt(it.atk)}`);
  if (it.def) parts.push(`DEF ${fmt(it.def)}`);
  if (it.hp) parts.push(`HP ${fmt(it.hp)}`);
  if (it.eva) parts.push(`EVA ${pct(it.eva)}`);
  if (it.crit) parts.push(`CRIT ${pct(it.crit)}`);
  return parts.join(' · ') || '–';
}

export function render(root, ctx) {
  const lineages = D.baseClasses;
  const id = ctx.params.get('c');
  const base = (id && D.classById.get(id)) || null;
  const lineage = base && base.promotionOf ? D.classByName.get(base.promotionOf) : base;

  const options = D.classes.map((c) => ({ value: c.name }));
  const picker = combo({
    label: t('builds.search'), options, placeholder: t('builds.searchPh'),
    onPick: (name) => {
      const c = D.classByName.get(name);
      if (!c) return;
      const l = c.promotionOf ? D.classByName.get(c.promotionOf) : c;
      location.hash = `#/builds?c=${l.id}`;
    },
  });

  root.append(
    h('h1', {}, t('builds.title')),
    h('p', { class: 'lead' }, t('builds.intro')),
    picker,
    h('ul', { class: 'chips', 'aria-label': t('builds.lineages') }, lineages.map((c) =>
      h('li', {}, h('a', { class: 'chip', href: `#/builds?c=${c.id}`, 'aria-current': lineage && lineage.id === c.id ? 'true' : null },
        c.name, c.promotion ? h('span', { class: 'chip-sub' }, ` → ${c.promotion}`) : null)))),
  );
  if (!lineage) { root.append(h('p', { class: 'muted' }, t('builds.pick'))); return; }
  const promo = lineage.promotion ? D.classByName.get(lineage.promotion) : null;
  const classes = promo ? [lineage, promo] : [lineage];

  const sheet = h('article', { class: 'card' });
  sheet.append(h('h2', {}, classes.map((c) => c.name).join(' → ')));

  // Stats de base (niveau 1)
  const row = (label, fn) => [label, ...classes.map(fn)];
  sheet.append(h('h3', {}, t('builds.baseStats')),
    table(['', ...classes.map((c) => c.name)], [
      row(t('stat.element'), (c) => elBadge(c.element)),
      row(t('stat.group'), (c) => c.group),
      row('HP', (c) => fmt(c.hp)), row('ATK', (c) => fmt(c.atk)), row('DEF', (c) => fmt(c.def)),
      row('EVA', (c) => pct(c.eva)), row('CRIT', (c) => pct(c.crit)), row(t('stat.critDmg'), (c) => `×${fmt(c.critDmg, 2)}`),
      row(t('stat.threat'), (c) => fmt(c.threat)),
      row(t('builds.prereq'), (c) => c.prerequisite || '–'),
      row(t('builds.skillUnlocks'), (c) => c.skillUnlocks.map((l) => `${t('builds.lvl')} ${l}`).join(', ')),
    ]),
    h('p', { class: 'muted' }, t('builds.statsLvl1')));

  // Emplacements
  sheet.append(h('h3', {}, t('builds.slots')),
    table([t('builds.slot'), ...classes.map((c) => c.name)],
      lineage.slots.map((_, i) => [`${i + 1}`, ...classes.map((c) => (c.slots[i] || []).join(' / '))])));

  // Compétence innée (tous paliers)
  const innate = D.skills.filter((s) => s.type === 'Innate' && classes.some((c) => s.classes.includes(c.name)))
    .sort((a, b) => a.classes[0].localeCompare(b.classes[0]) || a.tier - b.tier);
  sheet.append(h('h3', {}, t('builds.innate')),
    innate.length ? table([t('skills.class'), t('skills.tier'), t('skills.name'), t('skills.effect')],
      innate.map((s) => [s.classes.join(', '), `T${s.tier}`, s.name, s.effect])) : h('p', { class: 'muted' }, '–'));

  // Builds STC, tels quels
  const bis = D.bisByClassId.get(lineage.id);
  sheet.append(h('h3', {}, t('builds.stc')));
  sheet.append(h('p', { class: 'credit', role: 'note' },
    t('builds.credit', { authors: D.bis.authors, license: D.bis.license }), ' ',
    h('a', { href: D.bis.source, target: '_blank', rel: 'noopener noreferrer' }, t('builds.creditSource')), ' · ',
    h('a', { href: D.bis.licenseUrl, target: '_blank', rel: 'noopener noreferrer' }, D.bis.license), ' · ',
    t('builds.updated', { date: D.bis.pageUpdated })));
  if (!bis) sheet.append(h('p', { class: 'muted' }, t('builds.noBis')));
  else bis.variants.forEach((v, vi) => {
    const box = h('section', { class: 'variant', 'aria-label': `${t('builds.variant')} ${vi + 1}` },
      h('h4', {}, `${t('builds.variant')} ${vi + 1}${bis.variants.length > 1 ? ` / ${bis.variants.length}` : ''}`),
      v.notes.length ? h('ul', { class: 'notes' }, v.notes.map((n) => h('li', {}, n))) : null,
      table([t('builds.slot'), t('builds.tier'), t('builds.item'), t('builds.affinity'), t('builds.enchants'), t('builds.itemStats')],
        v.slots.map((s, i) => {
          const it = D.itemByName.get(s.name);
          return [`${i + 1}`, `T${s.tier}`, h('span', {}, h('strong', {}, s.name), it ? h('span', { class: 'muted' }, ` (${it.type})`) : null),
            s.affinity.length ? s.affinity.map((a) => ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark'].includes(a) ? elBadge(a) : h('span', { class: 'tag' }, a)) : '–',
            s.enchants.join(', ') || '–', itemStatsText(it)];
        })));
    sheet.append(box);
  });
  sheet.append(h('p', { class: 'credit', role: 'note' }, t('builds.creditBottom', { authors: D.bis.authors, license: D.bis.license })));
  root.append(sheet, h('p', {}, h('a', { class: 'button', href: `#/optimizer?cls=${encodeURIComponent((promo || lineage).name)}` }, t('builds.toOptimizer'))));
}
