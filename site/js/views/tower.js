// Vue « Tour & Tombeau des Titans » : données d'étage, modificateurs, recommandation d'équipe (estimation indicative).
import { D, classIcon, champIcon, uiIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, select, numberField, table, icon, fmt, pct, elBadge } from '../dom.js';
import * as store from '../store.js';
import { combineModifiers, heroCandidate, championCandidate, recommend, explain, capsOf, ASSUME } from '../tower-calc.js';
import { TOMB_URL } from '../advisor.js';

const ELEMENTS = ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark'];
const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
const REF_MOB = { hp: 80000, atk: 70, aoe: 40, cap50: 3200 };

function modifierTips(fx) {
  const tips = [];
  for (const [g, f] of Object.entries(fx.dmgDown)) tips.push(t('tw.tip.dmgDown', { group: g, pct: Math.round(f * 100) }));
  if (fx.defDown.size) tips.push(t('tw.tip.defDown', { groups: [...fx.defDown].join(', ') }));
  if (fx.evaDown.size) tips.push(t('tw.tip.evaDown', { groups: [...fx.evaDown].join(', ') }));
  if (fx.threatUp.size) tips.push(t('tw.tip.threatUp', { groups: [...fx.threatUp].join(', ') }));
  if (fx.enemyHp) tips.push(t('tw.tip.enemyHp', { pct: Math.round(fx.enemyHp * 100) }));
  if (fx.critDown) tips.push(t('tw.tip.critDown'));
  if (fx.enemyStronger) tips.push(t('tw.tip.stronger'));
  return tips;
}

export function render(root, ctx) {
  const P = ctx.params;
  const num = (k) => { const v = P.get(k); return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null; };
  const validMods = (arr) => arr.filter((m) => D.modifiers.modifiers.some((x) => x.name === m));
  const S = {
    mode: P.get('mode') === 'tomb' ? 'tomb' : 'tower',
    tower: D.tower.towers.find((x) => x.difficulty === P.get('t')) || D.tower.towers[0],
    floor: Math.min(30, Math.max(1, Math.round(num('f') || 1))),
    mods: P.has('mod') ? validMods(P.getAll('mod')) : validMods(store.getPref('towerMods', []) || []),
    barrier: ELEMENTS.includes(P.get('barrier')) ? P.get('barrier') : '',
    mhp: num('mhp'), matk: num('matk'), maoe: num('maoe'), cap: num('cap'),
    party: [3, 4].includes(num('party')) ? num('party') : 4,
    champs: P.get('champs') === '1',
  };
  const persist = () => {
    ctx.setParams({ mode: S.mode === 'tomb' ? 'tomb' : '', t: S.mode === 'tower' ? S.tower.difficulty : '', f: S.mode === 'tower' ? S.floor : '', mod: S.mods,
      barrier: S.mode === 'tomb' ? S.barrier : '', mhp: S.mode === 'tomb' ? S.mhp ?? '' : '', matk: S.mode === 'tomb' ? S.matk ?? '' : '', maoe: S.mode === 'tomb' ? S.maoe ?? '' : '',
      cap: S.mode === 'tomb' ? S.cap ?? '' : '', party: S.mode === 'tomb' ? S.party : '', champs: S.champs });
    store.setPref('towerMods', S.mods);
  };

  const floorData = () => S.tower.floors.find((f) => f.floor === S.floor) || S.tower.floors[0];
  const mobInfo = () => {
    if (S.mode === 'tower') {
      const f = floorData();
      return { hp: f.hp, atk: f.atk, aoe: f.aoe, caps: capsOf(f), size: S.tower.partySize, ref: false };
    }
    const c50 = S.cap ?? REF_MOB.cap50;
    return { hp: S.mhp ?? REF_MOB.hp, atk: S.matk ?? REF_MOB.atk, aoe: S.maoe ?? REF_MOB.aoe, caps: { c50, c70: c50 * 2, c75: c50 * 6 }, size: S.party,
      ref: S.mhp === null || S.matk === null };
  };

  const info = h('section', { class: 'card', 'aria-live': 'polite' });
  const fxBox = h('div', { class: 'small' });
  const out = h('div', { 'aria-live': 'polite' });
  const summary = h('section', { class: 'card' });

  // ---------- Contrôles
  const tabs = () => h('div', { class: 'q-group', role: 'group', 'aria-label': t('tw.modeAria') }, ['tower', 'tomb'].map((m) =>
    h('button', { type: 'button', class: 'q-btn', 'aria-pressed': String(S.mode === m), onclick: () => { S.mode = m; persist(); draw(); } },
      icon(uiIcon(m === 'tower' ? 'quest' : 'champion'), { size: 26 }), h('span', {}, t(m === 'tower' ? 'tw.tabTower' : 'tw.tabTomb')))));

  const draw = () => {
    clear(root);
    root.append(h('h1', {}, t('tw.title')), h('p', { class: 'lead' }, t('tw.intro')), h('p', { class: 'note' }, t('tw.disclaimer')), tabs());
    const form = h('div', { class: 'card form-grid' });
    if (S.mode === 'tower') {
      const floorSel = select({ label: t('tw.floor'), value: S.floor, options: S.tower.floors.map((f) => ({ value: f.floor, label: `${f.floor}${f.boss ? ` ★ ${t('tw.boss')}` : ''}` })),
        onChange: (v) => { S.floor = Number(v); persist(); update(); } });
      form.append(select({ label: t('tw.difficulty'), value: S.tower.difficulty, options: D.tower.towers.map((x) => ({ value: x.difficulty, label: `${x.name} (${x.partySize})` })),
        onChange: (v) => {
          S.tower = D.tower.towers.find((x) => x.difficulty === v);
          const sel = floorSel.sel;
          [...sel.options].forEach((o, i) => { const f = S.tower.floors[i]; if (f) o.textContent = `${f.floor}${f.boss ? ` ★ ${t('tw.boss')}` : ''}`; });
          persist(); update();
        } }), floorSel);
    } else {
      form.append(select({ label: t('tw.barrier'), value: S.barrier, options: [{ value: '', label: t('tw.noBarrier') }, ...ELEMENTS.map((e) => ({ value: e, label: e }))], onChange: (v) => { S.barrier = v; persist(); update(); } }),
        select({ label: t('tw.partySize'), value: S.party, options: [3, 4].map((n) => ({ value: n, label: String(n) })), onChange: (v) => { S.party = Number(v); persist(); update(); } }),
        numberField({ label: t('tw.mobHp'), value: S.mhp ?? '', min: 0, step: 1, onChange: (v) => { S.mhp = v; persist(); update(); } }),
        numberField({ label: t('tw.mobAtk'), value: S.matk ?? '', min: 0, step: 1, onChange: (v) => { S.matk = v; persist(); update(); } }),
        numberField({ label: t('tw.mobAoe'), value: S.maoe ?? '', min: 0, step: 1, onChange: (v) => { S.maoe = v; persist(); update(); } }),
        numberField({ label: t('tw.cap50'), value: S.cap ?? '', min: 1, step: 1, onChange: (v) => { S.cap = v; persist(); update(); } }));
      form.append(h('p', { class: 'muted small field-hint' }, t('tw.tombHint'), ' ', ext(TOMB_URL, t('adv.tomb'))));
    }
    root.append(form);

    // Modificateurs
    const modBox = h('fieldset', { class: 'card modbox' }, h('legend', {}, t('tw.modifiers')), h('p', { class: 'muted small' }, t('tw.modifiersHint')),
      h('div', { class: 'mod-grid' }, D.modifiers.modifiers.map((m, i) => {
        const id = `mod-${i}`;
        return h('label', { class: 'check mod-item', for: id }, h('input', { type: 'checkbox', id, checked: S.mods.includes(m.name),
          onchange: (e) => { S.mods = e.target.checked ? [...S.mods, m.name] : S.mods.filter((x) => x !== m.name); persist(); update(); } }),
        h('span', {}, h('strong', {}, m.name), h('span', { class: 'small muted mod-eff' }, m.effect || m.description || '')));
      })), fxBox,
      h('p', { class: 'credit', role: 'note' }, t('tw.creditMods'), ' ', ext(D.modifiers.source, 'Shop Titans Central'), ' — ', ext(D.modifiers.licenseUrl, D.modifiers.license)));
    root.append(modBox, info, out);
    if (S.mode === 'tower') root.append(summary);
    if (S.mode === 'tower') root.append(h('p', { class: 'credit', role: 'note' }, t('tw.creditTower'), ' ', ext(D.tower.source, 'STC Hub'), ' — ', ext(D.tower.licenseUrl, D.tower.license)));
    update();
  };

  const update = () => {
    const mob = mobInfo();
    const fx = combineModifiers(S.mods);
    drawInfo(mob);
    clear(fxBox);
    const tips = modifierTips(fx);
    fxBox.append(tips.length ? h('ul', {}, tips.map((x) => h('li', {}, x))) : h('p', { class: 'muted' }, t('tw.noMods')),
      h('details', {}, h('summary', {}, t('tw.assumptions')), h('p', { class: 'small' }, t('tw.assumptionsTxt', {
        d: Math.round(ASSUME.defDown * 100), e: Math.round(ASSUME.evaDown * 100), th: ASSUME.threatUp, st: Math.round((ASSUME.strongerAtk - 1) * 100), ce: Math.round(ASSUME.classElem * 100), ge: Math.round(ASSUME.gearElem * 100) }))));
    drawReco(mob, fx);
    if (S.mode === 'tower') drawSummary();
  };

  function drawInfo(mob) {
    clear(info);
    const c = mob.caps;
    if (S.mode === 'tower') {
      const f = floorData();
      info.append(h('h2', { class: 'with-ico-h' }, icon(uiIcon('quest'), { size: 44 }), `${S.tower.name} – ${t('tw.floor')} ${f.floor}${f.boss ? ` ★ ${f.bossName || t('tw.boss')}` : ''}`),
        table([t('tw.partySize'), t('team.minPower'), t('team.monsterHp'), t('team.monsterDmg'), t('team.aoe')], [[S.tower.partySize, fmt(f.minPower), fmt(f.hp), fmt(f.atk), fmt(f.aoe)]]));
    } else {
      info.append(h('h2', { class: 'with-ico-h' }, icon(uiIcon('champion'), { size: 44 }), t('tw.tabTomb'), ' ', S.barrier ? elBadge(S.barrier) : null),
        ...(mob.ref ? [h('p', { class: 'warn small' }, t('tw.refValues'))] : []),
        table([t('tw.partySize'), t('team.monsterHp'), t('team.monsterDmg'), t('team.aoe')], [[mob.size, fmt(mob.hp), fmt(mob.atk), fmt(mob.aoe)]]));
    }
    info.append(h('h3', {}, t('tw.defThresholds')),
      table(['50 %', '70 %', '75 %'], [[fmt(c.c50), fmt(c.c70), fmt(c.c75)]]),
      h('p', { class: 'small' }, t('tw.defExplain', { half: fmt(c.c50 / 2) })),
      h('details', {}, h('summary', {}, t('tw.defFormula')), h('p', { class: 'small' }, t('tw.defFormulaTxt'))));
  }

  function drawSummary() {
    clear(summary);
    const rows = S.tower.floors.map((f) => [
      h('span', {}, h('button', { type: 'button', class: 'btn-link', 'aria-current': f.floor === S.floor ? 'true' : null, 'aria-label': `${t('tw.floor')} ${f.floor}`,
        onclick: () => { S.floor = f.floor; persist(); draw(); } }, f.floor), f.boss ? ' ★' : ''),
      fmt(f.minPower), fmt(f.hp), fmt(f.atk), fmt(f.aoe), fmt(f.defCaps['50']), fmt(f.defCaps['70']), fmt(f.defCaps['75'])]);
    summary.append(h('h2', {}, t('tw.summary', { tower: S.tower.name })),
      table([t('tw.floor'), t('team.minPower'), 'HP', 'ATK', 'AoE', 'DEF 50 %', 'DEF 70 %', 'DEF 75 %'], rows, 'compact floors-table'),
      h('p', { class: 'muted small' }, t('tw.summaryHint')));
    const cur = summary.querySelector('button[aria-current]');
    if (cur) cur.closest('tr').classList.add('row-sel');
  }

  function drawReco(mob, fx) {
    clear(out);
    const heroes = store.listHeroes();
    out.append(h('h2', {}, t('tw.reco')));
    out.append(h('label', { class: 'check', for: 'inc-champs' }, h('input', { type: 'checkbox', id: 'inc-champs', checked: S.champs, onchange: (e) => { S.champs = e.target.checked; persist(); update(); } }), ' ', t('tw.includeChamps')));
    if (!heroes.length) {
      const c = mob.caps;
      out.append(h('section', { class: 'card' }, h('p', {}, t('tw.noHeroes')), h('p', { class: 'actions' }, h('a', { class: 'button', href: '#/roster?edit=new' }, t('ro.newHero')), ' ', h('a', { class: 'button secondary', href: '#/roster' }, t('nav.roster'))),
        h('h3', {}, t('tw.genericTitle')),
        h('ul', {}, h('li', {}, t('tw.gen.tank', { def: fmt(c.c75), p70: fmt(c.c70) })), h('li', {}, t('tw.gen.dps')), modifierTips(fx).map((x) => h('li', {}, x)))));
      if (!S.champs) return;
    }
    let cands = heroes.map(heroCandidate);
    if (S.champs) cands = cands.concat(D.champions.map((c) => championCandidate(c, 4)));
    if (!cands.length) return;
    const res = recommend(cands, mob.size, mob, fx, { barrier: S.mode === 'tomb' ? S.barrier : '' }, 3);
    if (!res.length) { out.append(h('p', { class: 'muted' }, t('tw.noResult'))); return; }
    const best = res[0];
    const size = best.members.length;
    if (size < mob.size) out.append(h('p', { class: 'warn small' }, t('tw.smallParty', { n: size, total: mob.size })));
    out.append(compCard(best, fx, mob, true));
    if (res.length > 1) {
      out.append(h('h3', {}, t('tw.alts')), h('ol', { class: 'alts-list' }, res.slice(1).map((r) => h('li', {}, compSummary(r)))));
    }
  }

  const scoreText = (ratio) => (ratio >= 10 ? '≥ 10' : fmt(ratio, 2));
  const verdict = (ratio) => (ratio >= 1.5 ? t('tw.v.good') : ratio >= 1 ? t('tw.v.tight') : t('tw.v.risky'));
  const memberIcon = (m) => (m.kind === 'hero' ? icon(classIcon(m.cls.name), { size: 32, cls: 'portrait' }) : icon(champIcon(m.label) || uiIcon('champion'), { size: 32, cls: 'portrait' }));
  const compSummary = (r) => h('span', {}, r.members.map((m) => m.label).join(' + '), ` — ${t('tw.score')} ${scoreText(r.ev.ratio)} · ${t('tw.dps')} ${fmt(r.ev.dps)} · ${verdict(r.ev.ratio)}`);

  function compCard(r, fx, mob, withSave) {
    const ev = r.ev;
    const box = h('section', { class: 'card comp-card' },
      h('h3', {}, t('tw.best')), h('p', { class: 'score-line' }, h('strong', {}, `${t('tw.score')} ${scoreText(ev.ratio)}`), ` — ${verdict(ev.ratio)}`),
      h('p', { class: 'muted small' }, t('tw.scoreHint')),
      table([t('team.member'), t('stat.group'), 'ATK', 'DEF', 'HP', 'EVA', t('team.targetProb'), t('tw.hitDmg'), t('tw.threshold')],
        ev.rows.map((row) => [h('span', { class: 'with-ico' }, memberIcon(row.m), h('span', {}, row.m.label, row.m === ev.tank.m ? ` (${t('tw.tankTag')})` : '')),
          row.m.group, fmt(row.atk), fmt(row.def), fmt(row.hp), pct(row.eva, 0), pct(row.prob, 0), fmt(row.hitDmg, 1), row.reached ? `${row.reached} %` : t('tw.none')])),
      h('h4', {}, t('tw.why')),
      h('ul', {}, explain(r, fx).map((x) => h('li', {}, t(x.k, Object.fromEntries(Object.entries(x.v).map(([k, v]) => [k, typeof v === 'number' ? fmt(v, Number.isInteger(v) ? 0 : 1) : v])))))),
      S.mode === 'tomb' && S.barrier ? h('p', { class: 'small' }, t('tw.elemMatch', { el: S.barrier, n: ev.rows.filter((x) => x.elemBonus > 0).length })) : null,
      r.members.some((m) => m.estimated) ? h('p', { class: 'muted small' }, t('tw.estimatedStats')) : null);
    if (withSave) {
      const nameInp = h('input', { type: 'text', id: 'tw-team-name', maxlength: 60, placeholder: t('team.saveNamePh') });
      const msg = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
      const save = () => {
        const members = r.members.map((m) => (m.kind === 'hero' ? { heroId: m.hero.id } : { champion: m.champion.name, leaderTier: 4 }));
        const fallback = S.mode === 'tower' ? `${S.tower.name} ${S.floor}` : `${t('tw.tabTomb')}${S.barrier ? ' ' + S.barrier : ''}`;
        const context = S.mode === 'tower' ? { kind: 'tower', tower: S.tower.difficulty, floor: S.floor, modifiers: S.mods } : { kind: 'tomb', barrier: S.barrier || undefined, modifiers: S.mods };
        const tm = store.saveTeam({ id: store.newId('t'), name: nameInp.value.trim() || fallback, context, members, notes: '' });
        msg.className = 'small'; msg.textContent = tm ? t('team.saved1', { name: tm.name }) : t('ro.saveFail');
        if (tm && !store.storageOk()) { msg.className = 'small error'; msg.textContent = t('ro.noStorage'); }
      };
      box.append(h('div', { class: 'field' }, h('label', { for: 'tw-team-name' }, t('ro.teamName')), nameInp),
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button', onclick: save }, t('tw.saveTeam')), ' ', h('a', { class: 'button secondary', href: '#/roster' }, t('ro.teams'))), msg);
    }
    return box;
  }

  draw();
}
