// Vue 2 : optimiseur d'équipement (calcul indicatif).
import { D, classIcon, skillIcon, qualityIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, combo, select, numberField, table, elBadge, fmt, pct, icon, statLabel, gearTile } from '../dom.js';
import {
  QUALITY, PROFILES, classMatches, parseEffect, skillsToMods, rankSlot, computeStats, newMods, modsIsEmpty,
} from '../calc.js';
import { itemStatsNode } from './builds.js';

const ELEMENTS = ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark'];
const MAX_SKILLS = 4;

/** Compétences (familles) sélectionnables pour une classe : Hero + Innate. */
export function skillFamiliesFor(cls) {
  return D.families.filter((f) => (f.type === 'Hero' || f.type === 'Innate') && classMatches(f.classes, cls))
    .sort((a, b) => a.family.localeCompare(b.family));
}

function parseSkillParam(v) {
  const [key, tier] = String(v).split('~');
  const fam = D.familyByKey.get(key);
  if (!fam) return null;
  const sk = fam.tiers.get(Number(tier));
  return sk ? { fam, tier: Number(tier), skill: sk } : null;
}

function readState(params) {
  const cls = D.classByName.get(params.get('cls') || '') || null;
  const num = (k, d) => { const v = params.get(k); return v !== null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d; };
  return {
    cls,
    lvl: num('lvl', D.maxLevel),
    tier: num('tier', null),
    q: QUALITY[params.get('q')] ? params.get('q') : 'Normal',
    prof: ['dps', 'tank', 'balanced', 'custom'].includes(params.get('prof')) ? params.get('prof') : 'dps',
    w: (params.get('w') || '1,0.2,0.2,2,3').split(',').map(Number).concat([0, 0, 0, 0, 0]).slice(0, 5).map((x) => (Number.isFinite(x) ? x : 0)),
    sk: params.getAll('sk').filter((v) => parseSkillParam(v)).slice(0, MAX_SKILLS),
    ip: params.get('ip') === '1',
    el: ELEMENTS.includes(params.get('el')) ? params.get('el') : '',
  };
}

const weightsOf = (S) => S.prof === 'custom'
  ? { atk: S.w[0], def: S.w[1], hp: S.w[2], eva: S.w[3], crit: S.w[4] } : PROFILES[S.prof];
const maxTierOf = (S) => Math.max(1, Math.min(D.maxItemTier, S.tier ?? D.maxTierByLevel.get(Math.max(1, Math.min(D.maxLevel, S.lvl))) ?? D.maxItemTier));

/** Calcule le résultat complet d'après l'état. */
export function compute(S) {
  if (!S.cls) return null;
  const skills = S.sk.map(parseSkillParam).filter(Boolean);
  const mods = skillsToMods(skills.map((s) => s.skill));
  const opts = { maxTier: maxTierOf(S), quality: S.q, weights: weightsOf(S), mods, excludePacks: !S.ip, element: S.el };
  const slots = S.cls.slots.map((types) => rankSlot(D.items, types, opts));
  const best = slots.map((s) => (s.list[0] ? s.list[0].item : null));
  const stats = computeStats({ cls: S.cls, items: best, quality: S.q, mods });
  const unknown = skills.flatMap((s) => parseEffect(s.skill.effect).unknown.map((u) => `${s.fam.family}: ${u}`));
  return { skills, mods, slots, best, stats, unknown, maxTier: opts.maxTier };
}

/** Pour le composeur d'équipe : stats d'après un lien/hash d'optimiseur. */
export function computeFromQuery(query) {
  const S = readState(new URLSearchParams(query));
  const r = compute(S);
  return r ? { cls: S.cls, stats: r.stats } : null;
}

export function render(root, ctx) {
  const S = readState(ctx.params);
  const persist = () => ctx.setParams({
    cls: S.cls ? S.cls.name : '', lvl: S.lvl === D.maxLevel ? '' : S.lvl, tier: S.tier ?? '', q: S.q === 'Normal' ? '' : S.q,
    prof: S.prof, w: S.prof === 'custom' ? S.w.join(',') : '', sk: S.sk, ip: S.ip, el: S.el,
  });
  const out = h('div', { 'aria-live': 'polite' });

  const draw = () => {
    clear(root);
    root.append(h('h1', {}, t('opt.title')), h('p', { class: 'lead' }, t('opt.intro')),
      h('p', { class: 'note' }, t('opt.disclaimer')));
    const form = h('form', { class: 'card form-grid', onsubmit: (e) => e.preventDefault() });

    form.append(combo({
      label: t('opt.class'), options: D.classes.map((c) => ({ value: c.name, label: c.group })), value: S.cls ? S.cls.name : '',
      placeholder: t('opt.classPh'),
      onPick: (n) => { S.cls = D.classByName.get(n) || null; S.sk = []; persist(); draw(); },
    }));
    form.append(numberField({ label: t('opt.level'), value: S.lvl, min: 1, max: D.maxLevel, step: 1, onChange: (v) => { S.lvl = v ?? D.maxLevel; persist(); tierHint.textContent = hint(); update(); } }));
    form.append(numberField({ label: t('opt.tier'), value: S.tier, min: 1, max: D.maxItemTier, step: 1, onChange: (v) => { S.tier = v; persist(); tierHint.textContent = hint(); update(); } }));
    const tierHint = h('p', { class: 'muted small field-hint' });
    const hint = () => t('opt.tierHint', { tier: maxTierOf(S) });
    tierHint.textContent = hint();
    form.append(tierHint);
    const qBtns = Object.keys(QUALITY).map((k) => h('button', { type: 'button', class: 'q-btn', 'data-q': k.toLowerCase(), 'aria-pressed': String(S.q === k),
      onclick: () => { S.q = k; qBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === k.toLowerCase()))); persist(); update(); } },
      icon(qualityIcon(k), { size: 28 }), h('span', {}, `${k} (×${QUALITY[k]})`)));
    form.append(h('fieldset', { class: 'quality-set' }, h('legend', {}, t('opt.quality')), h('div', { class: 'q-group' }, qBtns)));

    const wBox = h('fieldset', { class: 'weights', hidden: S.prof !== 'custom' },
      h('legend', {}, t('opt.weights')),
      h('div', { class: 'row' }, ['ATK', 'DEF', 'HP', 'EVA', 'CRIT'].map((n, i) => numberField({
        label: n, value: S.w[i], min: 0, step: 0.1, onChange: (v) => { S.w[i] = v ?? 0; persist(); update(); } }))));
    form.append(select({ label: t('opt.profile'), value: S.prof,
      options: [{ value: 'dps', label: 'DPS' }, { value: 'tank', label: 'Tank' }, { value: 'balanced', label: t('opt.balanced') }, { value: 'custom', label: t('opt.custom') }],
      onChange: (v) => { S.prof = v; wBox.hidden = v !== 'custom'; persist(); update(); } }));
    form.append(wBox);

    // Compétences du héros
    const skillBox = h('fieldset', { class: 'skillbox' }, h('legend', {}, t('opt.skills', { n: MAX_SKILLS })));
    if (!S.cls) skillBox.append(h('p', { class: 'muted' }, t('opt.pickClassFirst')));
    else {
      const fams = skillFamiliesFor(S.cls);
      const byName = new Map(fams.map((f) => [f.family.toLowerCase(), f]));
      const rows = h('div', { class: 'skill-rows' });
      const redrawRows = () => {
        clear(rows);
        S.sk.forEach((v, i) => {
          const p = parseSkillParam(v);
          const tiers = [...p.fam.tiers.keys()].sort((a, b) => a - b);
          rows.append(h('div', { class: 'skill-row' },
            icon(skillIcon(p.skill.name) || skillIcon(p.fam.family), { size: 44, cls: 'skill-ico' }),
            h('div', { class: 'grow' }, h('strong', {}, p.fam.family), h('span', { class: 'muted' }, ` (${p.fam.type})`), h('div', { class: 'small' }, p.skill.effect)),
            select({ label: t('skills.tier'), value: p.tier, options: tiers.map((x) => ({ value: x, label: `T${x}` })),
              onChange: (nv) => { S.sk[i] = `${p.fam.key}~${nv}`; persist(); redrawRows(); update(); } }),
            h('button', { type: 'button', class: 'btn-small', 'aria-label': `${t('remove')} ${p.fam.family}`,
              onclick: () => { S.sk.splice(i, 1); persist(); redrawRows(); update(); } }, t('remove'))));
        });
      };
      redrawRows();
      const add = combo({ label: t('opt.addSkill'), options: fams.map((f) => ({ value: f.family, label: f.type })), placeholder: t('opt.skillPh'),
        onPick: (name) => {
          const f = byName.get(String(name).toLowerCase());
          if (!f || S.sk.length >= MAX_SKILLS) return;
          const tiers = [...f.tiers.keys()].sort((a, b) => a - b);
          S.sk.push(`${f.key}~${tiers[tiers.length - 1]}`);
          add.input.value = '';
          persist(); redrawRows(); update();
        } });
      skillBox.append(rows, add);
    }
    form.append(skillBox);

    // Filtres
    const filters = h('fieldset', { class: 'filters' }, h('legend', {}, t('opt.filters')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !S.ip, onchange: (e) => { S.ip = !e.target.checked; persist(); update(); } }), ' ', t('opt.excludePacks')),
      select({ label: t('opt.element'), value: S.el, options: [{ value: '', label: t('opt.anyElement') }, ...ELEMENTS.map((e) => ({ value: e, label: e }))],
        onChange: (v) => { S.el = v; persist(); update(); } }));
    form.append(filters);

    root.append(form, out);
    update();
  };

  const update = () => {
    clear(out);
    const R = compute(S);
    if (!R) { out.append(h('p', { class: 'muted' }, t('opt.pickClassFirst'))); return; }
    const cls = S.cls;
    out.append(h('h2', { class: 'with-ico-h' }, icon(classIcon(cls.name), { size: 48 }), t('opt.result', { cls: cls.name, tier: R.maxTier })));

    // Stats totales
    const st = R.stats;
    out.append(h('section', { class: 'card' }, h('h3', {}, t('opt.totals')),
      h('dl', { class: 'stats' },
        [[statLabel('health', 'HP'), fmt(st.hp)], [statLabel('attack', 'ATK'), fmt(st.atk)], [statLabel('defense', 'DEF'), fmt(st.def)],
          [statLabel('evasion', 'EVA'), pct(st.eva, 1)], [statLabel('critchance', 'CRIT'), pct(st.crit, 1)], [t('stat.critDmg'), `×${fmt(st.critDmg, 2)}`]]
          .map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
      h('p', { class: 'muted small' }, t('opt.totalsNote', { q: S.q })),
      R.unknown.length ? h('details', {}, h('summary', {}, t('opt.unparsed')), h('ul', {}, R.unknown.map((u) => h('li', {}, u)))) : null,
      !R.skills.length ? null : modsIsEmpty(R.mods) ? h('p', { class: 'muted small' }, t('opt.noModParsed')) : null));

    // Par emplacement
    R.slots.forEach((slot, i) => {
      const card = h('section', { class: 'card slot' },
        h('h3', {}, `${t('builds.slot')} ${i + 1} — ${cls.slots[i].join(' / ')}`));
      if (!slot.list.length) { card.append(h('p', { class: 'muted' }, t('opt.noItem'))); out.append(card); return; }
      if (slot.relaxed) card.append(h('p', { class: 'warn small' }, t('opt.affinityRelaxed')));
      const itemLine = (e, big) => h('div', { class: big ? 'best item-line' : 'alt item-line' },
        gearTile(e.item, { tier: e.item.tier, quality: S.q, size: big ? 72 : 44 }),
        h('div', { class: 'item-info' },
          h('strong', {}, e.item.name), ` · T${e.item.tier} · ${e.item.type} `,
          e.item.elemAff.map((a) => (a === 'All' ? h('span', { class: 'tag' }, 'All') : elBadge(a))),
          h('div', { class: 'small' }, itemStatsNode(e.item), e.item.source ? h('span', { class: 'muted' }, ` · ${e.item.source}`) : null,
            h('span', { class: 'muted' }, ` · ${t('opt.score')} ${fmt(e.score, 1)}`))));
      card.append(h('div', { class: 'label-best' }, t('opt.best')), itemLine(slot.list[0], true));
      const alts = slot.list.slice(1, 4);
      if (alts.length) card.append(h('div', { class: 'label-alt' }, t('opt.alts')), h('ol', { class: 'alts' }, alts.map((e) => h('li', {}, itemLine(e, false)))));
      out.append(card);
    });

    const link = location.href;
    const teamQ = new URLSearchParams({ m: `h~${cls.name}~${Math.round(st.atk)}~${Math.round(st.def)}~${Math.round(st.hp)}` }).toString();
    out.append(h('p', { class: 'actions' },
      h('a', { class: 'button', href: `#/team?${teamQ}` }, t('opt.toTeam')), ' ',
      h('button', { type: 'button', class: 'button secondary', onclick: async (e) => {
        try { await navigator.clipboard.writeText(location.href); e.target.textContent = t('copied'); } catch { window.prompt(t('copyManual'), link); }
      } }, t('copyLink'))));
  };

  draw();
}
