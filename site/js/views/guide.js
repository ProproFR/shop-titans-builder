// Vue « Guide : groupe minimum » par quête / difficulté, ou par étage de tour. Estimation indicative.
import { D, questIcon, champIcon, classIcon, skillIcon, uiIcon } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, select, numberField, table, icon, fmt, elBadge, gearTile, originBadge, statLabel } from '../dom.js';
import { QUALITY } from '../calc.js';
import { classesFor, lineageId } from '../roles.js';
import { accessSelector, getAccess } from '../provenance.js';
import { progression, levelForTier, tankRow, dpsRow, dpsValue, elementEnchants, leaderOf } from '../guide-calc.js';
import { thresholdReached, heroCandidate } from '../tower-calc.js';
import * as store from '../store.js';

const ELEMENTS = ['Fire', 'Water', 'Air', 'Earth', 'Light', 'Dark'];
const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
const tierLvl = (o) => (o.tier === null ? t('gd.unreachable') : `T${o.tier} · ${t('builds.lvl')} ${o.level ?? '–'}`);

/** Niveaux d'une zone de quête -> objets homogènes. */
function questLevels(area) {
  return area.levels.map((l) => ({ key: l.difficulty, label: l.difficulty, minPower: l.minPower, hp: l.hp, atk: l.atk, aoe: l.aoe,
    barrier: l.barrier || '', barrierHp: l.barrierHp || 0, caps: { c50: l.defCaps['50'], c70: l.defCaps['70'], c75: l.defCaps['75'] } }));
}
function towerLevels(tower) {
  return tower.floors.map((f) => ({ key: f.floor, label: `${f.floor}${f.boss ? ' ★' : ''}`, minPower: f.minPower, hp: f.hp, atk: f.atk, aoe: f.aoe,
    barrier: f.barrier || '', barrierHp: f.barrierHp || 0, caps: { c50: f.defCaps['50'], c70: f.defCaps['70'], c75: f.defCaps['75'] } }));
}
function partySizeOf(area) {
  const q = D.questByLowerName.get((area.bossOf || area.name).toLowerCase());
  return q ? q.partySize : 4;
}

export function render(root, ctx) {
  const P = ctx.params;
  const num = (k, d) => { const v = P.get(k); return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d; };
  const areas = D.questcaps.areas;
  const S = {
    mode: P.get('m') === 'tower' ? 'tower' : 'quest',
    zone: areas.find((a) => a.name === P.get('z')) || areas.find((a) => a.name === 'Haunted Castle') || areas[0],
    diff: P.get('d') || 'Extreme',
    tower: D.tower.towers.find((x) => x.difficulty === P.get('tw')) || D.tower.towers[0],
    floor: Math.min(30, Math.max(1, Math.round(num('f', 1)))),
    turns: Math.max(1, Math.min(60, Math.round(num('n', 10)))),
    q: QUALITY[P.get('q')] ? P.get('q') : 'Epic',
    tc: P.get('tc') || '', dc: P.get('dc') || '', th: [50, 70, 75].includes(num('th', 50)) ? num('th', 50) : 50,
  };
  const persist = () => ctx.setParams({ m: S.mode === 'tower' ? 'tower' : '', z: S.mode === 'quest' ? S.zone.name : '', d: S.mode === 'quest' ? S.diff : '',
    tw: S.mode === 'tower' ? S.tower.difficulty : '', f: S.mode === 'tower' ? S.floor : '', n: S.turns === 10 ? '' : S.turns, q: S.q === 'Epic' ? '' : S.q,
    tc: S.tc, dc: S.dc, th: S.th === 50 ? '' : S.th });

  const levels = () => (S.mode === 'quest' ? questLevels(S.zone) : towerLevels(S.tower));
  const curKey = () => String(S.mode === 'quest' ? S.diff : S.floor);
  const current = () => { const ls = levels(); return ls.find((l) => String(l.key) === curKey()) || ls[ls.length - 1]; };
  const partySize = () => (S.mode === 'quest' ? partySizeOf(S.zone) : S.tower.partySize);

  const body = h('div', { 'aria-live': 'polite' });

  const draw = () => {
    clear(root);
    const modeBtns = ['quest', 'tower'].map((m) => h('button', { type: 'button', class: 'q-btn', 'aria-pressed': String(S.mode === m),
      onclick: () => { S.mode = m; S.tc = ''; S.dc = ''; persist(); draw(); } },
    icon(uiIcon(m === 'quest' ? 'quest' : 'gem'), { size: 26 }), h('span', {}, t(m === 'quest' ? 'gd.modeQuest' : 'gd.modeTower'))));
    const form = h('div', { class: 'card form-grid' });
    if (S.mode === 'quest') {
      form.append(
        select({ label: t('gd.zone'), value: S.zone.name,
          options: areas.map((a) => ({ value: a.name, label: a.bossOf ? `${a.name} (${t('gd.bossOf', { zone: a.bossOf })})` : a.name })),
          onChange: (v) => { S.zone = areas.find((a) => a.name === v); if (!S.zone.levels.some((l) => l.difficulty === S.diff)) S.diff = S.zone.levels[0].difficulty; S.tc = ''; S.dc = ''; persist(); update(); } }),
        select({ label: t('gd.difficulty'), value: S.diff, options: ['Easy', 'Medium', 'Hard', 'Extreme'].map((d) => ({ value: d, label: d })),
          onChange: (v) => { S.diff = v; persist(); update(); } }));
    } else {
      form.append(
        select({ label: t('tw.difficulty'), value: S.tower.difficulty, options: D.tower.towers.map((x) => ({ value: x.difficulty, label: `${x.name} (${x.partySize})` })),
          onChange: (v) => { S.tower = D.tower.towers.find((x) => x.difficulty === v); persist(); update(); } }),
        select({ label: t('tw.floor'), value: S.floor, options: Array.from({ length: 30 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
          onChange: (v) => { S.floor = Number(v); persist(); update(); } }));
    }
    form.append(
      numberField({ label: t('gd.turns'), value: S.turns, min: 1, max: 60, step: 1, onChange: (v) => { S.turns = Math.max(1, Math.min(60, Math.round(v || 10))); persist(); update(); } }),
      select({ label: t('opt.quality'), value: S.q, options: Object.keys(QUALITY).map((k) => ({ value: k, label: `${k} (×${QUALITY[k]})` })), onChange: (v) => { S.q = v; persist(); update(); } }),
      accessSelector(() => update()));
    root.append(h('h1', {}, t('gd.title')), h('p', { class: 'lead' }, t('gd.intro')), h('p', { class: 'note' }, t('gd.disclaimer')),
      h('div', { class: 'q-group', role: 'group', 'aria-label': t('gd.modeAria') }, modeBtns), form, body,
      h('p', { class: 'credit', role: 'note' }, t('gd.credit'), ' ', ext(D.questcaps.source, 'STC Hub'), ' — ', ext(D.questcaps.licenseUrl, D.questcaps.license),
        ' · ', ext(D.tower.source, t('gd.towerSrc')), ' — ', ext(D.tower.licenseUrl, D.tower.license)));
    update();
  };

  function withSkill(sk) {
    return h('span', { class: 'with-ico' }, icon(skillIcon(sk.name) || skillIcon(sk.family), { size: 28 }), h('span', {}, h('strong', {}, `${sk.name} `), sk.effect));
  }

  function gearSet(items, quality) {
    return h('ol', { class: 'gear-grid' }, items.map((it, i) => (it
      ? h('li', { class: 'gear-card' },
        h('span', { class: 'gear-slot' }, `${t('builds.slot')} ${i + 1}`), gearTile(it, { tier: it.tier, quality, size: 64 }), h('strong', { class: 'gear-name' }, it.name),
        h('span', { class: 'muted small' }, `${it.type} · T${it.tier}`), originBadge(it),
        h('div', { class: 'small' }, [it.def ? statLabel('defense', fmt(it.def)) : null, it.atk ? statLabel('attack', fmt(it.atk)) : null, it.hp ? statLabel('health', fmt(it.hp)) : null]))
      : h('li', { class: 'gear-card' }, h('span', { class: 'gear-slot' }, `${t('builds.slot')} ${i + 1}`), h('span', { class: 'muted' }, t('opt.noItem'))))));
  }

  const update = () => {
    clear(body);
    const lv = current();
    const size = partySize();
    const access = getAccess();
    const barrier = ELEMENTS.includes(lv.barrier) ? lv.barrier : '';
    const barrierAll = lv.barrier === 'All';
    const ctxTitle = S.mode === 'quest' ? `${S.zone.name} – ${lv.label}` : `${S.tower.name} – ${t('tw.floor')} ${lv.label}`;
    const iconSrc = S.mode === 'quest' ? questIcon(S.zone.bossOf || S.zone.name) : uiIcon('gem');

    // ---- Fiche du niveau
    body.append(h('section', { class: 'card' },
      h('h2', { class: 'with-ico-h' }, icon(iconSrc, { size: 48 }), ctxTitle),
      table([t('tw.partySize'), t('team.minPower'), t('team.monsterHp'), t('team.monsterDmg'), t('team.aoe'), t('team.barrier')],
        [[size, fmt(lv.minPower), fmt(lv.hp), fmt(lv.atk), fmt(lv.aoe),
          lv.barrier ? h('span', {}, barrierAll ? t('gd.allElems') : elBadge(lv.barrier), ` · ${t('team.barrierHp')} ${fmt(lv.barrierHp)}`) : t('tw.noBarrier')]]),
      table([t('tw.defThresholds'), '50 %', '70 %', '75 %'], [[t('tw.threshold'), fmt(lv.caps.c50), fmt(lv.caps.c70), fmt(lv.caps.c75)]])));

    // ---- Groupe minimum conseillé
    const nDps = Math.max(1, size - 1);
    const need = lv.hp / S.turns;
    const perDps = need / nDps;
    const ench = barrier ? elementEnchants(barrier) : null;
    const heal = lv.aoe > lv.atk * 0.45;
    const champs = barrier ? D.champions.filter((c) => c.element === barrier) : [];
    const champ = champs[0] || D.championByName.get(heal ? 'Lilu' : 'Argon');
    const leader = champ && leaderOf(champ.name);
    body.append(h('section', { class: 'card' }, h('h2', {}, t('gd.group')),
      h('ul', { class: 'gd-list' },
        h('li', {}, h('strong', {}, `${t('tw.partySize')} : `), t('gd.roles', { n: size, dps: nDps })),
        h('li', {}, h('strong', {}, `${t('stat.element')} : `), barrier ? [elBadge(barrier), ' ', t('gd.elemBarrier')] : barrierAll ? t('gd.elemAll') : t('gd.elemFree')),
        ench && ench.best ? h('li', {}, h('strong', {}, `${t('gd.enchant')} : `), `${ench.best.name} (+${ench.best.value} %)`, ' ',
          h('span', { class: 'muted small' }, `(${ench.ladder.map((e) => `${e.value} %`).join(' < ')})`)) : null,
        h('li', {}, h('strong', {}, `${t('gd.champion')} : `), champ
          ? h('span', { class: 'with-ico' }, icon(champIcon(champ.name), { size: 32, cls: 'portrait' }),
            h('span', {}, champ.name, ' ', elBadge(champ.element), !champs.length ? ` — ${t(heal ? 'gd.champHeal' : 'gd.champSurv')}` : ''))
          : '–', leader ? h('div', { class: 'small' }, withSkill(leader)) : null),
        h('li', {}, h('strong', {}, `${t('gd.dmgNeed')} : `), t('gd.dmgNeedTxt', { hp: fmt(lv.hp), n: S.turns, tot: fmt(need), per: fmt(perDps), dps: nDps })),
        h('li', {}, h('strong', {}, `${t('team.minPower')} : `), fmt(lv.minPower))),
      barrier ? h('p', { class: 'small' }, t('gd.barrierNote', { hp: fmt(lv.barrierHp) })) : null,
      h('p', { class: 'muted small' }, t('gd.indicative'))));

    // ---- Tank
    const tankPool = barrier ? classesFor('tank', barrier) : classesFor('tank');
    const tankFallback = !!barrier && !tankPool.length;
    const tankCls = tankFallback ? classesFor('tank') : tankPool;
    const tRows = tankCls.map((c) => tankRow(c, lv.caps, S.q, access)).sort((a, b) => (a.th[S.th].tier ?? 99) - (b.th[S.th].tier ?? 99) || b.maxDef - a.maxDef);
    const tSel = tRows.find((r) => r.cls.name === S.tc) || tRows[0];
    const tProg = progression(tSel.cls, 'def', S.q, access);
    const tTier = tSel.th[S.th].tier;
    const defTarget = S.th === 50 ? lv.caps.c50 : S.th === 70 ? lv.caps.c70 : lv.caps.c75;
    body.append(h('section', { class: 'card' }, h('h2', { class: 'with-ico-h' }, icon(classIcon(tSel.cls.name), { size: 40 }), t('gd.tank')),
      tankFallback ? h('p', { class: 'warn small' }, t('gd.noTankElem', { el: barrier })) : null,
      h('div', { class: 'q-group', role: 'group', 'aria-label': t('gd.thAria') }, [50, 70, 75].map((k) => h('button', { type: 'button', class: 'q-btn', 'aria-pressed': String(S.th === k),
        onclick: () => { S.th = k; persist(); update(); } }, t(k === 50 ? 'gd.thMin' : k === 70 ? 'gd.thComfort' : 'gd.thMax', { k })))),
      h('p', {}, t('gd.defTarget', { def: fmt(defTarget), th: S.th })),
      table([t('skills.class'), t('stat.element'), 'DEF 50 %', 'DEF 70 %', 'DEF 75 %', t('gd.maxDef')],
        tRows.map((r) => [h('button', { type: 'button', class: 'btn-link', 'aria-current': r.cls === tSel.cls ? 'true' : null, onclick: () => { S.tc = r.cls.name; persist(); update(); } },
          h('span', { class: 'with-ico' }, icon(classIcon(r.cls.name), { size: 24 }), r.cls.name)), elBadge(r.cls.element), tierLvl(r.th[50]), tierLvl(r.th[70]), tierLvl(r.th[75]), fmt(r.maxDef)])),
      tTier === null
        ? h('p', { class: 'warn' }, t('gd.notReached', { cls: tSel.cls.name, def: fmt(tProg[tProg.length - 1].stats.def) }), ' ', t('gd.tryMore'))
        : [h('h3', {}, t('gd.tankSet', { cls: tSel.cls.name, tier: tTier, lvl: levelForTier(tTier) ?? '–', def: fmt(tProg[tTier].stats.def) })), gearSet(tProg[tTier].items, S.q)]));

    // ---- DPS
    const dpsPool = barrier ? classesFor('dps', barrier) : classesFor('dps');
    const dRows = dpsPool.map((c) => dpsRow(c, perDps, barrier, S.q, access)).sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99) || b.maxDps - a.maxDps);
    const dSel = dRows.find((r) => r.cls.name === S.dc) || dRows[0];
    const dProg = dSel ? progression(dSel.cls, 'atk', S.q, access) : null;
    body.append(h('section', { class: 'card' }, h('h2', { class: 'with-ico-h' }, dSel ? icon(classIcon(dSel.cls.name), { size: 40 }) : null, t('gd.dps')),
      h('p', {}, t('gd.dpsTarget', { per: fmt(perDps), n: S.turns, dps: nDps })),
      dSel ? [table([t('skills.class'), t('stat.element'), t('gd.minTier'), t('gd.maxDps')],
        dRows.map((r) => [h('button', { type: 'button', class: 'btn-link', 'aria-current': r.cls === dSel.cls ? 'true' : null, onclick: () => { S.dc = r.cls.name; persist(); update(); } },
          h('span', { class: 'with-ico' }, icon(classIcon(r.cls.name), { size: 24 }), r.cls.name)),
        r.cls.element === 'Any' ? t('gd.anyElem') : elBadge(r.cls.element), tierLvl(r), fmt(r.maxDps)])),
      dSel.tier === null
        ? h('p', { class: 'warn' }, t('gd.notReachedDps', { cls: dSel.cls.name, dps: fmt(dSel.maxDps) }), ' ', t('gd.tryMore'))
        : [h('h3', {}, t('gd.dpsSet', { cls: dSel.cls.name, tier: dSel.tier, lvl: dSel.level ?? '–', dps: fmt(dpsValue(dProg[dSel.tier].stats, dSel.elemBonus)) })), gearSet(dProg[dSel.tier].items, S.q),
          dSel.elemBonus ? h('p', { class: 'muted small' }, t('gd.elemBonusNote', { pct: Math.round(dSel.elemBonus * 100) })) : null]]
        : h('p', { class: 'muted' }, '–')));

    // ---- Classes recommandées + héros sauvegardés
    const chip = (c) => h('a', { class: 'chip-cls', href: `#/builds?c=${lineageId(c)}` }, icon(classIcon(c.name), { size: 28 }), c.name);
    body.append(h('section', { class: 'card' }, h('h2', {}, t('gd.classes')),
      h('p', {}, barrier ? t('gd.classesElem', { el: barrier }) : t('gd.classesGeneral')),
      h('p', {}, h('strong', {}, `${t('gd.tank')} : `), tRows.slice(0, 3).map(({ cls }) => chip(cls))),
      h('p', {}, h('strong', {}, `${t('gd.dps')} : `), dRows.slice(0, Math.max(3, size - 1)).map(({ cls }) => chip(cls))),
      h('p', { class: 'small muted' }, t('gd.classesNote')), h('p', {}, h('a', { class: 'button secondary', href: '#/elements' }, t('nav.elements')))));
    body.append(heroesCard(lv, barrier, perDps, nDps, size));

    // ---- Tableau récapitulatif
    const rows = levels().map((l) => {
      const r = tankRow(tSel.cls, l.caps, S.q, access);
      return [h('button', { type: 'button', class: 'btn-link', 'aria-current': String(l.key) === curKey() ? 'true' : null,
        'aria-label': `${S.mode === 'quest' ? '' : t('tw.floor') + ' '}${l.label}`,
        onclick: () => { if (S.mode === 'quest') S.diff = String(l.key); else S.floor = Number(l.key); persist(); draw(); } }, l.label),
      fmt(l.minPower), fmt(l.hp), fmt(l.caps.c50), l.barrier ? (ELEMENTS.includes(l.barrier) ? elBadge(l.barrier) : t('gd.allElems')) : '–', tierLvl(r.th[50]), tierLvl(r.th[70])];
    });
    const summary = h('section', { class: 'card' }, h('h2', {}, S.mode === 'quest' ? t('gd.sumQuest', { zone: S.zone.name }) : t('gd.sumTower', { tower: S.tower.name })),
      h('p', { class: 'muted small' }, t('gd.sumHint', { cls: tSel.cls.name })),
      table([S.mode === 'quest' ? t('gd.difficulty') : t('tw.floor'), t('team.minPower'), 'HP', 'DEF 50 %', t('team.barrier'), t('gd.tank50'), t('gd.tank70')], rows, 'compact floors-table'));
    body.append(summary);
    const cur = summary.querySelector('button[aria-current]');
    if (cur) cur.closest('tr').classList.add('row-sel');
  };

  function heroesCard(lv, barrier, perDps, nDps, size) {
    const box = h('section', { class: 'card' }, h('h2', {}, t('gd.myHeroes')));
    const heroes = store.listHeroes();
    if (!heroes.length) { box.append(h('p', { class: 'muted' }, t('gd.noHeroes')), h('a', { class: 'button', href: '#/roster?edit=new' }, t('ro.newHero'))); return box; }
    const cands = heroes.map(heroCandidate);
    const tanks = cands.map((c) => ({ c, reached: thresholdReached(c.def, lv.caps) })).filter((x) => x.reached >= 50).sort((a, b) => b.c.def - a.c.def);
    const dps = cands.map((c) => ({ c, v: dpsValue(c, barrier && (c.classElement === barrier || c.classElement === 'Any') ? 0.2 : 0) })).filter((x) => x.v >= perDps).sort((a, b) => b.v - a.v);
    const line = (x, text) => h('li', {}, h('span', { class: 'with-ico' }, icon(classIcon(x.c.cls.name), { size: 28 }), h('span', {}, h('strong', {}, x.c.label), ` (${x.c.cls.name}) — ${text}`)));
    box.append(h('h3', {}, t('gd.heroTanks')),
      tanks.length ? h('ul', {}, tanks.map((x) => line(x, `DEF ${fmt(x.c.def)} · ${x.reached} %`))) : h('p', { class: 'muted' }, t('gd.noHeroTank')),
      h('h3', {}, t('gd.heroDps', { per: fmt(perDps) })),
      dps.length ? h('ul', {}, dps.map((x) => line(x, `${fmt(x.v)} ${t('tw.dps')}`))) : h('p', { class: 'muted' }, t('gd.noHeroDps')));
    if (tanks.length && dps.filter((x) => x.c !== tanks[0].c).length >= nDps) box.append(h('p', { class: 'ok' }, t('gd.heroGroupOk', { n: size })));
    const href = S.mode === 'tower'
      ? `#/tower?t=${S.tower.difficulty}&f=${S.floor}`
      : `#/tower?${new URLSearchParams({ mode: 'tomb', ...(barrier ? { barrier } : {}), mhp: lv.hp, matk: lv.atk, maoe: lv.aoe, cap: lv.caps.c50, party: Math.min(4, size) })}`;
    box.append(h('p', {}, h('a', { class: 'button', href }, t('gd.openTower'))));
    return box;
  }

  draw();
}
