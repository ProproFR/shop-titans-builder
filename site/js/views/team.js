// Vue 3 : composeur d'équipe pour une quête.
import { D } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, combo, select, numberField, table, elBadge, fmt, pct } from '../dom.js';
import { parseEffect, addMods, newMods, targetProbabilities } from '../calc.js';
import { computeFromQuery } from './optimizer.js';

const HEALERS = new Set(['Cleric', 'Bishop', 'Druid', 'Arch Druid']);

/** Membres sérialisés : "h~Classe~atk~def~hp" ou "c~Champion~palier". */
function parseMember(s) {
  const [kind, name, a, b, c] = String(s).split('~');
  if (kind === 'h' && D.classByName.has(name)) return { kind: 'h', name, atk: Number(a) || 0, def: Number(b) || 0, hp: Number(c) || 0 };
  if (kind === 'c' && D.championByName.has(name)) return { kind: 'c', name, tier: Math.min(4, Math.max(1, Number(a) || 1)) };
  return null;
}
const serialize = (m) => m.kind === 'h' ? `h~${m.name}~${m.atk}~${m.def}~${m.hp}` : `c~${m.name}~${m.tier}`;

export function leaderSkill(champName, tier) {
  return D.skills.find((s) => s.type === 'Leader' && s.classes.includes(champName) && s.tier === tier) || null;
}

export function render(root, ctx) {
  const quest = D.quests.find((q) => q.name === ctx.params.get('q')) || D.quests[0];
  const S = {
    quest,
    lv: Math.min(quest.levels.length - 1, Math.max(0, Number(ctx.params.get('lv')) || 0)),
    members: ctx.params.getAll('m').map(parseMember).filter(Boolean),
  };
  S.members = S.members.slice(0, S.quest.partySize);
  const persist = () => ctx.setParams({ q: S.quest.name, lv: S.lv || '', m: S.members.map(serialize) });
  const out = h('div', { 'aria-live': 'polite' });
  const questInfo = h('section', { class: 'card' });
  const membersBox = h('div', { class: 'members' });

  const levelLabel = (l, i) => `${i + 1}. ${l.difficulty}${l.type ? ` (${l.type})` : ''}${l.barrier ? ` – ${l.barrier}` : ''}`;

  const drawQuest = () => {
    clear(questInfo);
    const l = S.quest.levels[S.lv];
    questInfo.append(h('h2', {}, `${S.quest.name} – ${l.difficulty}`), table([t('team.partySize'), t('team.type'), t('team.minPower'), t('team.monsterHp'), t('team.monsterDmg'), t('team.aoe'), t('team.barrier'), t('team.barrierHp')], [[
      S.quest.partySize, l.type || t('team.normal'), fmt(l.minPower), fmt(l.monsterHp), fmt(l.monsterDmg), fmt(l.monsterAoe),
      l.barrier ? l.barrier.split(',').map((e) => elBadge(e.trim())) : '–', l.barrier ? fmt(l.barrierHp) : '–']]));
  };

  const drawMembers = () => {
    clear(membersBox);
    S.members.forEach((m, i) => {
      const row = h('div', { class: 'member card' });
      if (m.kind === 'h') {
        row.append(h('h3', {}, `${t('team.hero')} ${i + 1}`),
          h('div', { class: 'row' },
            combo({ label: t('opt.class'), options: D.classes.map((c) => ({ value: c.name, label: c.group })), value: m.name, onPick: (n) => { if (n) { m.name = n; persist(); update(); } } }),
            numberField({ label: 'ATK', value: m.atk, min: 0, step: 1, onChange: (v) => { m.atk = v ?? 0; persist(); update(); } }),
            numberField({ label: 'DEF', value: m.def, min: 0, step: 1, onChange: (v) => { m.def = v ?? 0; persist(); update(); } }),
            numberField({ label: 'HP', value: m.hp, min: 0, step: 1, onChange: (v) => { m.hp = v ?? 0; persist(); update(); } })));
        const imp = h('input', { type: 'text', id: `imp-${i}`, placeholder: '#/optimizer?cls=…', autocomplete: 'off',
          onchange: () => {
            const q = imp.value.includes('?') ? imp.value.slice(imp.value.indexOf('?') + 1) : '';
            const r = q ? computeFromQuery(q) : null;
            if (!r) { imp.setAttribute('aria-invalid', 'true'); return; }
            imp.removeAttribute('aria-invalid');
            Object.assign(m, { name: r.cls.name, atk: Math.round(r.stats.atk), def: Math.round(r.stats.def), hp: Math.round(r.stats.hp) });
            persist(); drawMembers(); update();
          } });
        row.append(h('div', { class: 'field' }, h('label', { for: `imp-${i}` }, t('team.import')), imp));
      } else {
        row.append(h('h3', {}, t('team.champion')),
          h('div', { class: 'row' },
            combo({ label: t('team.champion'), options: D.champions.map((c) => ({ value: c.name, label: c.element })), value: m.name, onPick: (n) => { if (n) { m.name = n; persist(); update(); } } }),
            select({ label: t('team.leaderTier'), value: m.tier, options: [1, 2, 3, 4].map((x) => ({ value: x, label: `T${x}` })), onChange: (v) => { m.tier = Number(v); persist(); update(); } })));
      }
      row.append(h('button', { type: 'button', class: 'btn-small', onclick: () => { S.members.splice(i, 1); persist(); drawMembers(); update(); } }, `${t('remove')} (${m.name})`));
      membersBox.append(row);
    });
    const full = S.members.length >= S.quest.partySize;
    const hasChamp = S.members.some((m) => m.kind === 'c');
    membersBox.append(h('p', { class: 'actions' },
      h('button', { type: 'button', class: 'button', disabled: full, onclick: () => { S.members.push({ kind: 'h', name: 'Soldier', atk: 0, def: 0, hp: 0 }); persist(); drawMembers(); update(); } }, t('team.addHero')), ' ',
      h('button', { type: 'button', class: 'button secondary', disabled: full || hasChamp, onclick: () => { S.members.push({ kind: 'c', name: D.champions[0].name, tier: 4 }); persist(); drawMembers(); update(); } }, t('team.addChampion')),
      h('span', { class: 'muted' }, ` ${S.members.length}/${S.quest.partySize}`)));
  };

  const update = () => {
    clear(out);
    const l = S.quest.levels[S.lv];
    if (!S.members.length) { out.append(h('p', { class: 'muted' }, t('team.empty'))); return; }
    const info = S.members.map((m) => {
      if (m.kind === 'h') { const c = D.classByName.get(m.name); return { m, label: m.name, group: c.group, element: c.element, threat: c.threat, base: { atk: m.atk, def: m.def, hp: m.hp, eva: c.eva, crit: c.crit, critDmg: c.critDmg } }; }
      const c = D.championByName.get(m.name);
      return { m, label: `${c.name} (${t('team.champion')})`, group: c.group, element: c.element, threat: c.threat, base: { atk: c.atk, def: c.def, hp: c.hp, eva: c.eva, crit: c.crit, critDmg: 0 } };
    });
    // Bonus de leader
    const champ = S.members.find((m) => m.kind === 'c');
    let party = newMods();
    const unknown = [];
    let leader = null;
    if (champ) {
      leader = leaderSkill(champ.name, champ.tier);
      if (leader) {
        const p = parseEffect(leader.effect, { defaultTarget: 'party' });
        party = p.party;
        for (const pe of p.perEach) {
          const n = info.filter((x) => x.group === pe.group).length;
          party = addMods(party, pe.mods, n);
        }
        unknown.push(...p.unknown);
      }
    }
    const lb = [['ATK', party.atk], ['DEF', party.def], ['HP', party.hp], ['CRIT', party.crit], [t('stat.critDmg'), party.critDmg], ['EVA', party.eva]].filter(([, v]) => v);
    out.append(h('section', { class: 'card' }, h('h2', {}, t('team.leaderBonus')),
      !champ ? h('p', { class: 'muted' }, t('team.noChampion'))
        : [h('p', {}, h('strong', {}, `${leader ? leader.name : champ.name} T${champ.tier}`), ' — ', leader ? leader.effect : '–'),
          lb.length ? h('p', {}, t('team.applied'), ' ', lb.map(([k, v]) => `${k} +${fmt(v, 1)}%`).join(' · ')) : h('p', { class: 'muted' }, t('team.noneParsed')),
          unknown.length ? h('p', { class: 'muted small' }, `${t('team.notApplied')} ${unknown.join(' ; ')}`) : null]));

    // Cibles + stats ajustées
    const probs = targetProbabilities(info.map((x) => x.threat));
    out.append(h('section', { class: 'card' }, h('h2', {}, t('team.members')),
      table([t('team.member'), t('stat.group'), t('stat.element'), t('stat.threat'), t('team.targetProb'), 'ATK', 'DEF', 'HP'],
        info.map((x, i) => [x.label, x.group, elBadge(x.element), fmt(x.threat), pct(probs[i], 1),
          fmt(x.base.atk * (1 + party.atk / 100)), fmt(x.base.def * (1 + party.def / 100)), fmt(x.base.hp * (1 + party.hp / 100))])),
      h('p', { class: 'muted small' }, t('team.statsNote'))));

    // Couverture d'élément + avertissements
    const warnings = [];
    if (l.barrier) {
      const els = l.barrier.split(',').map((e) => e.trim());
      const match = info.filter((x) => els.includes(x.element));
      out.append(h('section', { class: 'card' }, h('h2', {}, t('team.coverage')),
        h('p', {}, t('team.coverageCount', { n: match.length, total: info.length }), ' ', els.map((e) => elBadge(e))),
        match.length ? h('p', { class: 'small' }, match.map((x) => `${x.label} (${x.element})`).join(', ')) : null));
      if (!match.length) warnings.push(t('team.warnNoElement', { els: els.join(', ') }));
    } else out.append(h('section', { class: 'card' }, h('h2', {}, t('team.coverage')), h('p', { class: 'muted' }, t('team.noBarrier'))));
    if (info.length < S.quest.partySize) warnings.push(t('team.warnSize', { n: info.length, total: S.quest.partySize }));
    if (!info.some((x) => x.group === 'Fighter')) warnings.push(t('team.warnTank'));
    const heal = S.members.some((m) => (m.kind === 'h' && HEALERS.has(m.name)) || (m.kind === 'c' && (leaderSkill(m.name, m.tier) || { effect: '' }).effect.match(/heal/i)));
    if (!heal) warnings.push(t('team.warnHeal'));
    if (S.members.some((m) => m.kind === 'h' && (!m.atk || !m.hp))) warnings.push(t('team.warnStats'));
    out.append(h('section', { class: 'card' }, h('h2', {}, t('team.warnings')),
      warnings.length ? h('ul', { class: 'warn-list' }, warnings.map((w) => h('li', {}, w))) : h('p', {}, t('team.noWarning'))));
    out.append(h('p', { class: 'actions' }, h('button', { type: 'button', class: 'button secondary', onclick: async (e) => {
      try { await navigator.clipboard.writeText(location.href); e.target.textContent = t('copied'); } catch { window.prompt(t('copyManual'), location.href); }
    } }, t('copyLink'))));
  };

  const levelSel = () => select({ label: t('team.difficulty'), value: S.lv, options: S.quest.levels.map((l, i) => ({ value: i, label: levelLabel(l, i) })),
    onChange: (v) => { S.lv = Number(v); persist(); drawQuest(); update(); } });
  const levelHolder = h('div', {}, levelSel());
  const questSel = select({ label: t('team.quest'), value: S.quest.name, options: D.quests.map((q) => ({ value: q.name, label: `${q.name} (${q.partySize})` })),
    onChange: (v) => {
      S.quest = D.quests.find((q) => q.name === v); S.lv = 0; S.members = S.members.slice(0, S.quest.partySize);
      if (S.members.filter((m) => m.kind === 'c').length > 1) S.members = S.members.filter((m, i, a) => m.kind !== 'c' || a.findIndex((x) => x.kind === 'c') === i);
      persist(); clear(levelHolder); levelHolder.append(levelSel()); drawQuest(); drawMembers(); update();
    } });

  root.append(h('h1', {}, t('team.title')), h('p', { class: 'lead' }, t('team.intro')),
    h('div', { class: 'card form-grid' }, questSel, levelHolder), questInfo, h('h2', {}, t('team.membersTitle')), membersBox, out);
  drawQuest(); drawMembers(); update();
}
