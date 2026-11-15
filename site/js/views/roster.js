// Vue « Mes héros » : héros et équipes sauvegardés (localStorage), éditeur, export/import, partage par lien.
import { D, classIcon, champIcon, qualityIcon, skillIcon, uiIcon, findFamily } from '../data.js';
import { t, getLang } from '../i18n.js';
import { h, clear, combo, select, numberField, icon, fmt, pct, gearTile, statLabel } from '../dom.js';
import { QUALITY } from '../calc.js';
import * as store from '../store.js';
import { heroClass, slotTypes, lineageOf, effectiveStats, optimizerLink, emptyGear, memberParam } from '../hero.js';
import { advisorPanel } from '../advisor.js';
import { skillFamiliesFor } from './optimizer.js';

const QUALITIES = Object.keys(QUALITY);

/** Copie un lien ; si le presse-papiers est refusé, l'affiche dans un champ à copier à la main. */
export async function copyText(text, btn, holder) {
  try { await navigator.clipboard.writeText(text); const old = btn.textContent; btn.textContent = t('copied'); setTimeout(() => { btn.textContent = old; }, 1800); return; } catch { /* repli */ }
  holder.replaceChildren(h('label', { class: 'small' }, t('copyManual'), h('input', { type: 'text', readonly: true, value: text, onfocus: (e) => e.target.select() })));
  const inp = holder.querySelector('input'); if (inp) inp.select();
}

/** Bouton « Supprimer » en deux temps (confirmation sans boîte de dialogue). */
function deleteButton(label, onConfirm) {
  const wrap = h('span', { class: 'confirm-wrap' });
  const start = () => {
    wrap.replaceChildren(h('span', { class: 'warn small', role: 'alert' }, t('ro.confirmDelete')), ' ',
      h('button', { type: 'button', class: 'btn-small danger', onclick: onConfirm }, t('ro.yesDelete')), ' ',
      h('button', { type: 'button', class: 'btn-small', onclick: () => wrap.replaceChildren(h('button', { type: 'button', class: 'btn-small', 'aria-label': label, onclick: start }, t('ro.delete'))) }, t('ro.cancel')));
  };
  wrap.append(h('button', { type: 'button', class: 'btn-small', 'aria-label': label, onclick: start }, t('ro.delete')));
  return wrap;
}

export function gearRow(hero, size = 44) {
  const cls = heroClass(hero);
  return h('div', { class: 'gear-row', 'aria-label': t('ro.gear') }, cls.slots.map((_, i) => {
    const g = hero.gear[i] || {};
    const it = D.itemByName.get(g.item);
    return it ? gearTile(it, { tier: it.tier, quality: g.quality, size }) : h('div', { class: 'gear-tile gear-tile-empty', style: `--tile:${size}px`, title: t('ro.emptySlot') }, h('span', { class: 'gear-empty', 'aria-hidden': 'true' }, '·'));
  }));
}

export function skillsRow(hero, size = 32) {
  return h('div', { class: 'skills-row' }, hero.skills.map((s) => {
    const f = findFamily(s.family);
    const sk = f && f.tiers.get(s.tier);
    return h('span', { class: 'chip-skill', title: sk ? sk.effect : s.family }, icon(skillIcon(sk ? sk.name : s.family) || skillIcon(s.family), { size }), `${s.family} T${s.tier}`);
  }));
}

export function statsLine(hero) {
  const st = effectiveStats(hero);
  return h('div', { class: 'stat-line small' },
    statLabel('attack', fmt(st.atk)), statLabel('defense', fmt(st.def)), statLabel('health', fmt(st.hp)),
    statLabel('evasion', pct(st.eva, 1)), statLabel('critchance', pct(st.crit, 1)),
    h('span', { class: st.estimated ? 'tag tag-est' : 'tag' }, st.estimated ? t('ro.estimated') : t('ro.entered')));
}

export function heroCard(hero, actions) {
  const cls = heroClass(hero);
  return h('article', { class: 'card hero-card' },
    h('div', { class: 'hero-head' },
      icon(classIcon(cls.name), { size: 56, cls: 'portrait' }),
      h('div', {}, h('h3', {}, hero.name), h('p', { class: 'muted small' }, `${cls.name} · ${t('ro.level')} ${hero.level}`))),
    gearRow(hero), skillsRow(hero), statsLine(hero),
    hero.notes ? h('p', { class: 'small notes-txt' }, hero.notes) : null,
    actions || null);
}

function teamContextText(team) {
  const c = team.context;
  if (c.kind === 'tower') return `${t('ro.ctxTower')} ${c.tower || '?'} ${c.floor ? `· ${t('tw.floor')} ${c.floor}` : ''}`;
  if (c.kind === 'tomb') return `${t('ro.ctxTomb')}${c.barrier ? ` · ${c.barrier}` : ''}`;
  const q = D.quests.find((x) => x.name === c.quest);
  return `${t('ro.ctxQuest')} ${c.quest || '?'}${q && c.difficulty != null && q.levels[c.difficulty] ? ` · ${q.levels[c.difficulty].difficulty}` : ''}`;
}

/** Lien pour rouvrir une équipe sauvegardée dans le bon outil. */
export function teamOpenHref(team) {
  const c = team.context;
  const mods = (c.modifiers || []).map((m) => ['mod', m]);
  if (c.kind === 'tower' || c.kind === 'tomb') {
    const p = new URLSearchParams();
    if (c.kind === 'tomb') { p.set('mode', 'tomb'); if (c.barrier) p.set('barrier', c.barrier); }
    else { if (c.tower) p.set('t', c.tower); if (c.floor) p.set('f', c.floor); }
    mods.forEach(([k, v]) => p.append(k, v));
    return `#/tower?${p.toString()}`;
  }
  const p = new URLSearchParams();
  if (c.quest) p.set('q', c.quest);
  if (c.difficulty) p.set('lv', c.difficulty);
  for (const m of team.members) {
    if (m.heroId) { const hero = store.getHero(m.heroId); if (hero) p.append('m', memberParam(hero)); }
    else if (m.champion) p.append('m', `c~${m.champion}~${m.leaderTier}`);
  }
  return `#/team?${p.toString()}`;
}

function teamCard(team, refresh) {
  const holder = h('div', {});
  const nameInp = h('input', { type: 'text', id: `tn-${team.id}`, value: team.name, maxlength: 60,
    onchange: () => { const n = nameInp.value.trim(); if (n) store.saveTeam({ ...team, name: n }); } });
  return h('article', { class: 'card team-card' },
    h('div', { class: 'field' }, h('label', { for: nameInp.id }, t('ro.teamName')), nameInp),
    h('p', { class: 'muted small' }, teamContextText(team), (team.context.modifiers || []).length ? ` · ${team.context.modifiers.join(', ')}` : ''),
    h('ul', { class: 'team-members' }, team.members.map((m) => {
      if (m.champion) return h('li', {}, icon(champIcon(m.champion) || uiIcon('champion'), { size: 32, cls: 'portrait' }), ` ${m.champion} (${t('team.champion')} T${m.leaderTier})`);
      const hero = store.getHero(m.heroId);
      return hero ? h('li', {}, icon(classIcon(heroClass(hero).name), { size: 32, cls: 'portrait' }), ` ${hero.name} (${heroClass(hero).name})`)
        : h('li', { class: 'muted' }, t('ro.missingHero'));
    })),
    h('div', { class: 'actions' },
      h('a', { class: 'button', href: teamOpenHref(team) }, t('ro.openTeam')),
      h('button', { type: 'button', class: 'btn-small', onclick: (e) => copyText(store.shareLink('team', team), e.target, holder) }, t('ro.share')),
      deleteButton(`${t('ro.delete')} ${team.name}`, () => { store.deleteTeam(team.id); refresh(); })),
    holder);
}

/** Ajoute un partage reçu : nouveaux ids en cas de collision, membres d'équipe remappés. */
function addShared(sh) {
  const map = new Map();
  for (const hero of sh.heroes) {
    const id = store.getHero(hero.id) ? store.newId('h') : hero.id;
    map.set(hero.id, id);
    store.saveHero({ ...hero, id });
  }
  if (sh.team) {
    const members = sh.team.members.map((m) => (m.heroId ? { heroId: map.get(m.heroId) || m.heroId } : m));
    store.saveTeam({ ...sh.team, id: store.getTeam(sh.team.id) ? store.newId('t') : sh.team.id, members });
  }
}

function sharedCard(code, onDone) {
  const sh = store.decodeShare(code);
  if (!sh) return h('section', { class: 'card', role: 'alert' }, h('p', { class: 'error' }, t('ro.shareInvalid')));
  const box = h('section', { class: 'card share-card', 'aria-label': t('ro.shareTitle') },
    h('h2', {}, sh.kind === 'hero' ? t('ro.shareHero') : t('ro.shareTeam')),
    h('p', { class: 'note' }, t('ro.shareWarn')));
  if (sh.team) box.append(h('p', {}, h('strong', {}, sh.team.name), ' · ', teamContextText(sh.team)));
  sh.heroes.forEach((hero) => box.append(heroCard(hero)));
  box.append(h('div', { class: 'actions' },
    h('button', { type: 'button', class: 'button', onclick: () => { addShared(sh); onDone(); } }, sh.kind === 'hero' ? t('ro.addHero') : t('ro.addTeam')),
    h('a', { class: 'button secondary', href: '#/roster' }, t('ro.ignore'))));
  return box;
}

// ------------------------------------------------------------------ Liste
function renderList(root, ctx) {
  const msg = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
  const body = h('div', {});
  const share = ctx.params.get('share');

  const draw = () => {
    clear(body);
    if (share) body.append(sharedCard(share, () => { location.hash = '#/roster'; }));
    const heroes = store.listHeroes();
    const teams = store.listTeams();
    body.append(h('h2', {}, `${t('ro.heroes')} (${heroes.length})`),
      h('p', { class: 'actions' }, h('a', { class: 'button', href: '#/roster?edit=new' }, t('ro.newHero')), ' ', h('a', { class: 'button secondary', href: '#/scan' }, t('sc.title')), ' ',
        h('span', { class: 'muted small' }, t('ro.heroesHint'))));
    if (!heroes.length) body.append(h('p', { class: 'muted' }, t('ro.noHeroes')));
    else body.append(h('div', { class: 'hero-grid' }, heroes.map((hero) => {
      const holder = h('div', {});
      return heroCard(hero, h('div', {},
        h('div', { class: 'actions' },
          h('a', { class: 'button', href: `#/roster?edit=${hero.id}` }, t('ro.edit')),
          h('button', { type: 'button', class: 'btn-small', onclick: () => { store.duplicateHero(hero.id, getLang() === 'fr' ? ' (copie)' : ' (copy)'); draw(); } }, t('ro.duplicate')),
          h('button', { type: 'button', class: 'btn-small', onclick: (e) => copyText(store.shareLink('hero', hero), e.target, holder) }, t('ro.share')),
          h('a', { class: 'btn-small', href: optimizerLink(hero) }, t('ro.toOptimizer')),
          deleteButton(`${t('ro.delete')} ${hero.name}`, () => { store.deleteHero(hero.id); draw(); })),
        holder));
    })));

    body.append(h('h2', {}, `${t('ro.teams')} (${teams.length})`),
      h('p', { class: 'actions' }, h('a', { class: 'button secondary', href: '#/team' }, t('ro.toComposer')), ' ', h('a', { class: 'button secondary', href: '#/tower' }, t('ro.toTower'))));
    if (!teams.length) body.append(h('p', { class: 'muted' }, t('ro.noTeams')));
    else body.append(h('div', { class: 'hero-grid' }, teams.map((tm) => teamCard(tm, draw))));

    const file = h('input', { type: 'file', id: 'imp-file', accept: 'application/json,.json', onchange: async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const r = await store.importJSON(f);
        msg.className = 'small'; msg.textContent = t('ro.importOk', { h: r.heroes, t: r.teams });
        draw(); body.prepend(msg);
      } catch (e) { msg.className = 'small error'; msg.textContent = t(e.message === 'json' ? 'ro.importJson' : 'ro.importShape'); body.prepend(msg); }
      file.value = '';
    } });
    body.append(h('section', { class: 'card' }, h('h2', {}, t('ro.backup')), h('p', { class: 'muted small' }, t('ro.backupHint')),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'button secondary', onclick: () => store.exportJSON() }, t('ro.export')),
        h('div', { class: 'field' }, h('label', { for: 'imp-file' }, t('ro.import')), file))));
  };

  root.append(h('h1', {}, t('ro.title')), h('p', { class: 'lead' }, t('ro.intro')),
    ...(store.storageOk() ? [] : [h('p', { class: 'note', role: 'alert' }, t('ro.noStorage'))]), body);
  draw();
}

// ------------------------------------------------------------------ Éditeur
function renderEditor(root, ctx) {
  const editId = ctx.params.get('edit');
  let H;
  const existing = editId && editId !== 'new' ? store.getHero(editId) : null;
  if (existing) H = JSON.parse(JSON.stringify(existing));
  else {
    const cls = D.classById.get(ctx.params.get('cls') || '') || null;
    H = { id: store.newId('h'), name: '', classId: cls ? cls.id : '', level: D.maxLevel, skills: [], gear: cls ? emptyGear(cls) : [], notes: '' };
    if (cls) {
      for (const v of ctx.params.getAll('sk')) {
        const [family, tier] = v.split('~');
        const f = findFamily(family);
        if (f && f.tiers.has(Number(tier)) && H.skills.length < 4) H.skills.push({ family: f.family, tier: Number(tier) });
      }
      const bis = D.bisByClassId.get(lineageOf(cls).id);
      const bi = Number(ctx.params.get('bis'));
      if (bis && Number.isInteger(bi) && bis.variants[bi]) applyVariant(H, bis.variants[bi]);
    }
  }
  if (editId && editId !== 'new' && !existing) { root.append(h('h1', {}, t('ro.title')), h('p', { class: 'error', role: 'alert' }, t('ro.notFound')), h('a', { class: 'button', href: '#/roster' }, t('ro.back'))); return; }

  const holder = h('div', {});
  const draw = () => {
    clear(holder);
    const cls = D.classById.get(H.classId) || null;
    const form = h('form', { class: 'card', onsubmit: (e) => e.preventDefault() });
    form.append(h('div', { class: 'row' },
      (() => { const f = h('div', { class: 'field' }, h('label', { for: 'hero-name' }, t('ro.name')),
        h('input', { type: 'text', id: 'hero-name', value: H.name, maxlength: 60, placeholder: t('ro.namePh'), oninput: (e) => { H.name = e.target.value; } })); return f; })(),
      combo({ label: t('opt.class'), options: D.classes.map((c) => ({ value: c.name, label: c.group })), value: cls ? cls.name : '', placeholder: t('opt.classPh'), id: 'hero-class',
        onPick: (n) => {
          const c = D.classByName.get(n); if (!c || c.id === H.classId) return;
          H.classId = c.id; H.gear = emptyGear(c);
          H.skills = H.skills.filter((s) => skillFamiliesFor(c).some((f) => f.family === s.family));
          draw();
        } }),
      numberField({ label: t('opt.level'), value: H.level, min: 1, max: D.maxLevel, step: 1, id: 'hero-level', onChange: (v) => { H.level = v ?? D.maxLevel; } })));
    if (!cls) { form.append(h('p', { class: 'muted' }, t('opt.pickClassFirst'))); holder.append(form); return; }

    form.append(h('h2', { class: 'with-ico-h' }, icon(classIcon(cls.name), { size: 48 }), cls.name));

    // ---- Compétences
    const skBox = h('fieldset', { class: 'skillbox' }, h('legend', {}, t('opt.skills', { n: 4 })));
    const fams = skillFamiliesFor(cls).filter((f) => f.type === 'Hero');
    const byName = new Map(fams.map((f) => [f.family.toLowerCase(), f]));
    const rows = h('div', { class: 'skill-rows' });
    const drawSkills = () => {
      clear(rows);
      H.skills.forEach((s, i) => {
        const f = findFamily(s.family); if (!f) return;
        const tiers = [...f.tiers.keys()].sort((a, b) => a - b);
        const sk = f.tiers.get(s.tier);
        rows.append(h('div', { class: 'skill-row' },
          icon(skillIcon(sk.name) || skillIcon(f.family), { size: 44, cls: 'skill-ico' }),
          h('div', { class: 'grow' }, h('strong', {}, f.family), sk.rarity ? [' ', h('span', { class: `rar rar-${sk.rarity.toLowerCase()}` }, sk.rarity)] : null, h('div', { class: 'small' }, sk.effect)),
          select({ label: t('skills.tier'), value: s.tier, options: tiers.map((x) => ({ value: x, label: `T${x}` })), onChange: (v) => { s.tier = Number(v); drawSkills(); } }),
          h('button', { type: 'button', class: 'btn-small', 'aria-label': `${t('remove')} ${f.family}`, onclick: () => { H.skills.splice(i, 1); drawSkills(); } }, t('remove'))));
      });
    };
    drawSkills();
    const add = combo({ label: t('opt.addSkill'), options: fams.map((f) => ({ value: f.family, label: f.type })), placeholder: t('opt.skillPh'),
      onPick: (name) => {
        const f = byName.get(String(name).toLowerCase());
        if (!f || H.skills.length >= 4 || H.skills.some((s) => s.family === f.family)) return;
        H.skills.push({ family: f.family, tier: Math.max(...f.tiers.keys()) });
        add.input.value = ''; drawSkills();
      } });
    skBox.append(rows, add);
    form.append(skBox);

    // ---- Équipement
    const gearBox = h('fieldset', { class: 'gearbox' }, h('legend', {}, t('ro.gear')));
    const elems = D.enchantments.filter((e) => e.type === 'Element');
    const spirits = D.enchantments.filter((e) => e.type === 'Spirit');
    cls.slots.forEach((types, i) => {
      const g = H.gear[i] || (H.gear[i] = { item: '', quality: 'Normal' });
      const tileHolder = h('div', {});
      const drawTile = () => {
        clear(tileHolder);
        const it = D.itemByName.get(g.item);
        tileHolder.append(it ? gearTile(it, { tier: it.tier, quality: g.quality, size: 56 }) : h('div', { class: 'gear-tile gear-tile-empty', style: '--tile:56px' }, h('span', { class: 'gear-empty', 'aria-hidden': 'true' }, '?')));
      };
      const opts = D.items.filter((it) => slotTypes(cls, i).includes(it.type)).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name)).map((it) => ({ value: it.name, label: `T${it.tier} ${it.type}` }));
      const qBtns = QUALITIES.map((q) => h('button', { type: 'button', class: 'q-btn compact', 'data-q': q.toLowerCase(), 'aria-pressed': String(g.quality === q), title: q, 'aria-label': `${t('opt.quality')} ${q}`,
        onclick: () => { g.quality = q; qBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === q.toLowerCase()))); drawTile(); } }, icon(qualityIcon(q), { size: 26 })));
      const itemField = combo({ label: `${t('builds.slot')} ${i + 1} — ${types.join(' / ')}`, options: opts, value: g.item, placeholder: t('ro.itemPh'), id: `gear-${i}`,
        onPick: (n) => { g.item = n; drawTile(); } });
      itemField.input.addEventListener('input', () => { if (itemField.input.value.trim() === '') { g.item = ''; drawTile(); } });
      gearBox.append(h('div', { class: 'gear-edit' }, tileHolder,
        h('div', { class: 'grow' }, itemField,
          h('div', { class: 'q-group' }, qBtns),
          h('div', { class: 'row' },
            select({ label: t('ro.element'), value: g.element || '', options: [{ value: '', label: '—' }, ...elems.map((e) => ({ value: e.name, label: `${e.name} (${e.element} +${e.value})` }))], onChange: (v) => { if (v) g.element = v; else delete g.element; } }),
            select({ label: t('ro.spirit'), value: g.spirit || '', options: [{ value: '', label: '—' }, ...spirits.map((e) => ({ value: e.name, label: e.name }))], onChange: (v) => { if (v) g.spirit = v; else delete g.spirit; } })))));
      drawTile();
    });
    form.append(gearBox);

    // Appliquer un build STC
    const bis = D.bisByClassId.get(lineageOf(cls).id);
    if (bis && bis.variants.length) {
      let vi = 0;
      form.append(h('div', { class: 'actions' },
        select({ label: t('ro.stcVariant'), value: 0, options: bis.variants.map((_, k) => ({ value: k, label: `${t('builds.variant')} ${k + 1}` })), onChange: (v) => { vi = Number(v); } }),
        h('button', { type: 'button', class: 'button secondary', onclick: () => { applyVariant(H, bis.variants[vi]); draw(); } }, t('ro.applyStc'))),
      h('p', { class: 'muted small' }, t('ro.applyStcHint')));
    }

    // ---- Stats du jeu (optionnelles)
    H.stats = H.stats || {};
    const est = h('div', { 'aria-live': 'polite' });
    const drawEst = () => { clear(est); est.append(statsLine({ ...H, stats: cleanStats(H.stats) })); };
    const sf = (k, label, scale) => numberField({ label, value: H.stats[k] ?? '', min: 0, step: 'any', onChange: (v) => { if (v === null) delete H.stats[k]; else H.stats[k] = v; drawEst(); } });
    form.append(h('fieldset', { class: 'statbox' }, h('legend', {}, t('ro.gameStats')), h('p', { class: 'muted small' }, t('ro.gameStatsHint')),
      h('div', { class: 'row' }, sf('atk', 'ATK'), sf('def', 'DEF'), sf('hp', 'HP'), sf('eva', 'EVA %'), sf('crit', 'CRIT %')), est));
    drawEst();

    form.append(h('div', { class: 'field' }, h('label', { for: 'hero-notes' }, t('ro.notes')),
      h('textarea', { id: 'hero-notes', rows: 3, maxlength: 2000, oninput: (e) => { H.notes = e.target.value; } }, H.notes)));

    const status = h('p', { role: 'status', 'aria-live': 'polite', class: 'small' });
    const optLink = h('a', { class: 'button secondary', href: '#', onclick: () => { optLink.href = optimizerLink({ ...H }); } }, t('ro.toOptimizer'));
    optLink.href = optimizerLink(H);
    form.append(h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'button', onclick: () => {
        const saved = store.saveHero({ ...H, name: H.name.trim() || cls.name, stats: cleanStats(H.stats) });
        if (!saved) { status.className = 'small error'; status.textContent = t('ro.saveFail'); return; }
        if (!store.storageOk()) { status.className = 'small error'; status.textContent = t('ro.noStorage'); return; }
        location.hash = '#/roster';
      } }, t('ro.save')),
      optLink, h('a', { class: 'button secondary', href: '#/roster' }, t('ro.cancel'))), status);
    holder.append(form, advisorPanel(cls, { showVariants: true, hideCreate: true }));
  };

  root.append(h('h1', {}, existing ? t('ro.editTitle') : t('ro.newTitle')),
    ...(store.storageOk() ? [] : [h('p', { class: 'note', role: 'alert' }, t('ro.noStorage'))]), holder);
  draw();
}

function cleanStats(s) {
  const o = {};
  for (const k of ['atk', 'def', 'hp', 'eva', 'crit']) if (typeof s[k] === 'number' && Number.isFinite(s[k])) o[k] = s[k];
  return o;
}

/** Remplit l'équipement depuis une variante STC (objets connus et compatibles uniquement). */
function applyVariant(H, v) {
  const cls = D.classById.get(H.classId);
  if (!cls) return;
  H.gear = cls.slots.map((types, i) => {
    const prev = H.gear[i] || {};
    const g = { item: '', quality: prev.quality || 'Normal' };
    const s = v.slots[i];
    if (!s) return g;
    const it = D.itemByName.get(s.name);
    if (it && slotTypes(cls, i).includes(it.type)) g.item = it.name;
    for (const e of s.enchants || []) {
      const en = D.enchantByName.get(e);
      if (en && en.type === 'Element') g.element = en.name;
      if (en && en.type === 'Spirit') g.spirit = en.name;
    }
    return g;
  });
}

export function render(root, ctx) {
  if (ctx.params.get('edit')) renderEditor(root, ctx);
  else renderList(root, ctx);
}
