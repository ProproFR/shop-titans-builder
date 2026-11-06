// Vue 4 : évaluateur de compétences (heuristique).
import { D } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, combo, select, table, fmt } from '../dom.js';
import { classMatches, scoreSkill, defaultRole, SKILL_ROLES, RARITY_RANK, parseEffect } from '../calc.js';
import { skillFamiliesFor } from './optimizer.js';

function parseSk(v) {
  const [key, tier] = String(v).split('~');
  const fam = D.familyByKey.get(key);
  const sk = fam && fam.tiers.get(Number(tier));
  return sk ? { fam, tier: Number(tier), skill: sk } : null;
}

export function render(root, ctx) {
  const S = {
    cls: D.classByName.get(ctx.params.get('cls') || '') || null,
    role: ctx.params.get('role'),
    sk: ctx.params.getAll('sk').filter((v) => parseSk(v)).slice(0, 4),
  };
  if (!SKILL_ROLES[S.role]) S.role = S.cls ? defaultRole(S.cls) : 'dps';
  const persist = () => ctx.setParams({ cls: S.cls ? S.cls.name : '', role: S.cls && S.role !== defaultRole(S.cls) ? S.role : '', sk: S.sk });
  const out = h('div', { 'aria-live': 'polite' });
  const rarityLabel = (r) => r || '–';

  const draw = () => {
    clear(root);
    root.append(h('h1', {}, t('sk.title')), h('p', { class: 'lead' }, t('sk.intro')),
      h('p', { class: 'note' }, t('sk.heuristic'), ' ', h('a', { href: 'https://st-central.net/tldr-heroes/', target: '_blank', rel: 'noopener noreferrer' }, t('sk.guides'))));
    const form = h('form', { class: 'card form-grid', onsubmit: (e) => e.preventDefault() });
    form.append(combo({
      label: t('opt.class'), options: D.classes.map((c) => ({ value: c.name, label: c.group })), value: S.cls ? S.cls.name : '', placeholder: t('opt.classPh'),
      onPick: (n) => { S.cls = D.classByName.get(n) || null; S.sk = []; S.role = S.cls ? defaultRole(S.cls) : 'dps'; persist(); draw(); },
    }));
    if (S.cls && S.cls.group === 'Fighter') {
      form.append(select({ label: t('sk.role'), value: S.role, options: [{ value: 'tank', label: 'Tank' }, { value: 'dps', label: 'DPS' }],
        onChange: (v) => { S.role = v; persist(); update(); } }));
    } else if (S.cls) form.append(h('p', { class: 'muted field-hint' }, `${t('sk.role')}: ${S.cls.group === 'Rogue' ? t('sk.roleRogue') : t('sk.roleCaster')}`));
    if (S.cls) {
      const fams = skillFamiliesFor(S.cls).filter((f) => f.type === 'Hero');
      const byName = new Map(fams.map((f) => [f.family.toLowerCase(), f]));
      const max = Math.min(4, S.cls.skillUnlocks.length);
      const rows = h('div', { class: 'skill-rows' });
      const redraw = () => {
        clear(rows);
        S.sk.forEach((v, i) => {
          const p = parseSk(v);
          const tiers = [...p.fam.tiers.keys()].sort((a, b) => a - b);
          rows.append(h('div', { class: 'skill-row' }, h('div', { class: 'grow' }, h('strong', {}, p.fam.family)),
            select({ label: t('skills.tier'), value: p.tier, options: tiers.map((x) => ({ value: x, label: `T${x}` })),
              onChange: (nv) => { S.sk[i] = `${p.fam.key}~${nv}`; persist(); redraw(); update(); } }),
            h('button', { type: 'button', class: 'btn-small', 'aria-label': `${t('remove')} ${p.fam.family}`, onclick: () => { S.sk.splice(i, 1); persist(); redraw(); update(); } }, t('remove'))));
        });
      };
      redraw();
      const add = combo({ label: t('sk.add', { n: max }), options: fams.map((f) => ({ value: f.family })), placeholder: t('opt.skillPh'),
        onPick: (name) => {
          const f = byName.get(String(name).toLowerCase());
          if (!f || S.sk.length >= max) return;
          const tiers = [...f.tiers.keys()].sort((a, b) => a - b);
          S.sk.push(`${f.key}~${tiers[tiers.length - 1]}`);
          add.input.value = '';
          persist(); redraw(); update();
        } });
      form.append(rows, add);
    }
    root.append(form, out);
    update();
  };

  const update = () => {
    clear(out);
    if (!S.cls) { out.append(h('p', { class: 'muted' }, t('opt.pickClassFirst'))); return; }
    const owned = S.sk.map(parseSk).map((p) => ({ ...p, score: scoreSkill(p.skill, S.role, S.cls) }));
    if (owned.length) {
      const total = owned.reduce((a, b) => a + b.score, 0);
      const weak = owned.reduce((a, b) => (b.score < a.score ? b : a), owned[0]);
      out.append(h('section', { class: 'card' }, h('h2', {}, t('sk.owned')),
        table([t('skills.name'), t('skills.tier'), t('skills.rarity'), t('skills.effect'), t('sk.score')],
          owned.map((o) => [o.fam.family, `T${o.tier}`, rarityLabel(o.skill.rarity), o.skill.effect, fmt(o.score, 1)])),
        h('p', {}, h('strong', {}, t('sk.total')), ` ${fmt(total, 1)}`),
        owned.length > 1 ? h('p', { class: 'warn' }, t('sk.reroll', { name: weak.fam.family, score: fmt(weak.score, 1) })) : null,
        owned.some((o) => parseEffect(o.skill.effect).unknown.length) ? h('p', { class: 'muted small' }, t('sk.unparsed')) : null));
    } else out.append(h('p', { class: 'muted' }, t('sk.noneOwned')));

    const ownedKeys = new Set(S.sk.map((v) => v.split('~')[0]));
    const cands = skillFamiliesFor(S.cls).filter((f) => f.type === 'Hero' && !ownedKeys.has(f.key)).map((f) => {
      const maxTier = Math.max(...f.tiers.keys());
      const sk = f.tiers.get(maxTier);
      return { fam: f, skill: sk, tier: maxTier, score: scoreSkill(sk, S.role, S.cls) };
    }).filter((c) => c.score > 0).sort((a, b) => (RARITY_RANK[b.skill.rarity] || 0) - (RARITY_RANK[a.skill.rarity] || 0) || b.score - a.score).slice(0, 12);
    out.append(h('section', { class: 'card' }, h('h2', {}, t('sk.best')),
      cands.length ? table([t('skills.name'), t('skills.rarity'), t('skills.tier'), t('skills.effect'), t('sk.score')],
        cands.map((c) => [c.fam.family, rarityLabel(c.skill.rarity), `T${c.tier}`, c.skill.effect, fmt(c.score, 1)])) : h('p', { class: 'muted' }, '–'),
      h('p', { class: 'muted small' }, t('sk.bestNote'))));
  };

  draw();
}
