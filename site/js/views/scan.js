// Vue « Importer une capture » (#/scan) : lecture automatique de la fiche d'un héros, validation, enregistrement.
import { D, itemIcon, skillIcon, classIcon, champIcon, findFamily, applyBuiltIns, skillLabel } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, icon, combo, select, numberField, gearTile } from '../dom.js';
import { classMatches, QUALITY } from '../calc.js';
import { emptyGear, slotTypes } from '../hero.js';
import * as store from '../store.js';
import { loadImage } from '../scan/image.js';
import { analyze, rerankGear } from '../scan/analyze.js';
import { normName } from '../scan/name.js';
import { learn as learnSpirit } from '../scan/spirit.js';
import { typeName, enchantLabel, spiritLabel, sortSpirits, itemLabel, qualityName } from '../i18n-names.js';
import { deleteButton, gearRow } from './roster.js';
import { viewToggle, heroUnit, unitList } from './cards.js';
import { nextActionCard } from './upgrades.js';

/** Héros déjà enregistré portant ce nom (comparaison sans accents ni symboles), ou null. */
const sameName = (name) => { const n = normName(name); return n ? store.listHeroes().find((x) => normName(x.name) === n) || null : null; };

/**
 * Héros déjà enregistré correspondant à la capture : par le nom d'abord ; sinon (nom non lu ou mal lu),
 * un héros de même classe qui porte au moins 4 des mêmes objets.
 * @returns {{hero, how:'name'|'gear', same?:number}|null}
 */
function findExisting(name, classId, gear) {
  const byName = sameName(name);
  if (byName) return { hero: byName, how: 'name' };
  if (!classId) return null;
  let best = null;
  for (const x of store.listHeroes()) {
    if (x.classId !== classId) continue;
    const same = (x.gear || []).filter((g, i) => g && g.item && gear[i] && gear[i].item === g.item).length;
    if (same >= 4 && (!best || same > best.same)) best = { hero: x, how: 'gear', same };
  }
  return best;
}

/** Complète le brouillon avec la sauvegarde pour ce que la capture ne donne pas (esprit non reconnu, palier non lu…). */
function mergeFromSaved(d, saved) {
  if (!saved) return;
  (saved.gear || []).forEach((g, i) => {
    const cur = d.gear[i];
    if (!g || !cur || !cur.item || cur.item !== g.item) return; // objet changé : on ne reprend rien
    if (!cur.spirit && g.spirit) cur.spirit = g.spirit;
    if (!cur.element && g.element) cur.element = g.element;
  });
  d.skills = d.skills.map((sk, k) => {
    const old = saved.skills && saved.skills[k];
    if (!sk && old) { const f = findFamily(old.family); return f ? { family: f.family, key: f.key, tier: old.tier } : sk; }
    return sk;
  });
}

const fmt = (v) => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v));

/** Différences entre le brouillon et la sauvegarde, en phrases courtes. */
function diffWithSaved(d, saved) {
  const out = [];
  const add = (label, a, b) => { if ((a ?? '') !== (b ?? '')) out.push(`${label} : ${fmt(a)} → ${fmt(b)}`); };
  if (saved.classId !== d.classId) add(t('sc.class'), D.classById.get(saved.classId)?.name, D.classById.get(d.classId)?.name);
  add(t('sc.level'), saved.level, d.level);
  const st = saved.stats || {};
  add(t('sc.power'), st.power, d.power ?? st.power);
  for (const [k, lbl] of [['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['eva', 'EVA %'], ['crit', 'CRIT %']]) if (d.stats[k] != null) add(lbl, st[k], d.stats[k]);
  d.gear.forEach((g, i) => {
    const o = (saved.gear || [])[i] || {};
    const n = t('sc.slot', { n: i + 1 });
    if ((o.item || '') !== (g.item || '')) { add(n, o.item, g.item); return; }
    add(`${n} · ${t('sc.quality')}`, o.quality && qualityName(o.quality), g.quality && qualityName(g.quality));
    add(`${n} · ${t('sc.element')}`, o.element, g.element);
    add(`${n} · ${t('sc.spirit')}`, o.spirit && spiritLabel(o.spirit), g.spirit && spiritLabel(g.spirit));
  });
  d.skills.forEach((sk, k) => {
    const o = (saved.skills || [])[k];
    const a = o ? skillLabel(o.family, o.tier) : '';
    const b = sk ? skillLabel(sk.family, sk.tier) : '';
    if (b) add(`${t('sc.skillN', { n: k + 1 })}`, a, b);
  });
  return out;
}

const SURE = 0.6; // seuil de confiance pour « sûr »
const SPIRITS = () => sortSpirits(D.enchantments.filter((e) => e.type === 'Spirit'));
const ELEMENT_ENCHANTS = () => D.enchantments.filter((e) => e.type === 'Element');

const confTag = (c) => (c == null ? null : h('span', { class: `tag ${c >= SURE ? 'tag-ok' : 'tag-est'}` }, t(c >= SURE ? 'sc.sure' : 'sc.check')));

/** Familles de compétences de héros proposées pour une case, compatibles avec la classe. */
function skillOptions(entry, cls) {
  const out = [];
  for (const r of entry.list) for (const f of r.fams) {
    if (cls && !classMatches(f.classes, cls)) continue;
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

const firstTier = (f) => [...f.tiers.values()][0];
const tierFor = (f, wanted) => (wanted && f.tiers.has(wanted) ? wanted : Math.max(...f.tiers.keys()));

/** Brouillon de héros à partir du résultat d'analyse. */
function draftFrom(res) {
  const cls = res.cls;
  const d = { id: store.newId('h'), existing: null, match: null, name: res.name || '', classId: cls ? cls.id : '', level: res.level || D.maxLevel, skills: [], gear: cls ? emptyGear(cls) : [], stats: {} };
  fillSkills(d, res, cls);
  fillGear(d, res, cls);
  if (res.stats) {
    for (const k of ['atk', 'def', 'hp', 'eva']) if (res.stats[k] != null) d.stats[k] = res.stats[k];
    d.power = res.stats.power;
  }
  const m = findExisting(d.name, d.classId, d.gear);
  if (m && m.how === 'name') useSaved(d, m.hero);
  else d.match = m; // ressemblance par l'équipement : on demande confirmation
  return d;
}

/** Rattache le brouillon à un héros enregistré (mise à jour). */
function useSaved(d, hero) {
  d.newId ||= d.id;
  d.existing = hero; d.id = hero.id; d.match = null;
  d.name = hero.name; // on garde le nom tel qu'enregistré (le nom lu peut différer : accents, OCR…)
  mergeFromSaved(d, hero);
}

function fillSkills(d, res, cls) {
  const used = new Set(); // une même compétence ne peut pas être équipée deux fois
  d.skills = res.skills.slice(1).map((e) => {
    const f = skillOptions(e, cls).find((x) => !used.has(x.key));
    if (!f) return null;
    used.add(f.key);
    return { family: f.family, key: f.key, tier: tierFor(f, e.tier) };
  });
}

function fillGear(d, res, cls) {
  d.gear = (cls ? cls.slots : res.gear).map((_, i) => {
    const g = res.gear[i] || {};
    const allowed = cls ? new Set(slotTypes(cls, i)) : null;
    const first = (g.list || []).find((x) => !allowed || allowed.has(x.type));
    return applyBuiltIns({ item: first ? first.key : '', quality: g.quality || 'Normal', element: g.enchant || '', spirit: g.spirit || '' });
  });
}

/** Aperçu de la capture avec les zones lues (vert = sûr, orange = à vérifier). */
function preview(img, res) {
  const maxW = 520, k = Math.min(1, maxW / img.width);
  const c = h('canvas', { class: 'scan-preview', width: Math.round(img.width * k), height: Math.round(img.height * k), role: 'img', 'aria-label': t('sc.preview') });
  const ctx = c.getContext('2d');
  const id = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  const tmp = document.createElement('canvas'); tmp.width = img.width; tmp.height = img.height;
  tmp.getContext('2d').putImageData(id, 0, 0);
  ctx.drawImage(tmp, 0, 0, c.width, c.height);
  const rect = (b, conf) => {
    ctx.strokeStyle = conf >= SURE ? '#2fd158' : '#ff9d1c'; ctx.lineWidth = 2;
    ctx.strokeRect(b.x * k, b.y * k, b.w * k, b.h * k);
  };
  res.skills.forEach((s) => rect(s.box, s.conf));
  if (res.tab === 'infos') res.gear.forEach((g) => rect(g.box, g.conf));
  return c;
}

/** Bouton de choix (alternative) avec icône. */
const choice = (label, src, pressed, onclick) => h('button', { type: 'button', class: 'q-btn compact', 'aria-pressed': String(pressed), onclick, title: label },
  icon(src, { size: 28 }), h('span', {}, label));

/** Fiche d'un champion ? Son nom commence par celui d'un champion (« Lilu and Nippy »). */
function championOf(name) {
  const n = normName(name);
  if (!n) return null;
  return D.champions.filter((c) => n.startsWith(normName(c.name.replace(/\s*\(.*\)$/, '')))).sort((a, b) => b.name.length - a.name.length)[0] || null;
}

/** Carte de validation pour un champion : niveau, puissance et stats, enregistrés dans « Mes champions ». */
function renderChampionCard(card, img, res, champ, fileName) {
  const c = { name: champ.name, level: res.level, power: res.stats && res.stats.power, hp: res.stats && res.stats.hp, atk: res.stats && res.stats.atk,
    def: res.stats && res.stats.def, eva: res.stats && res.stats.eva, elem: res.stats && res.stats.elem };
  const old = store.listChampions().find((x) => x.name === champ.name);
  const msg = h('div', { role: 'status', 'aria-live': 'polite' });
  clear(card);
  card.append(h('div', { class: 'scan-head' },
    h('h2', { class: 'with-ico-h' }, icon(champIcon(champ.name), { size: 40, cls: 'portrait' }), champ.name, ' ', h('span', { class: 'tag' }, t('sc.champion')), ' ', h('span', { class: 'muted small' }, fileName)),
    h('button', { type: 'button', class: 'btn-small danger', onclick: () => card.remove() }, t('sc.remove'))));
  const fields = [['level', t('ch.level')], ['power', t('ch.power')], ['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['eva', 'EVA %'], ['elem', t('sc.elemPts')]];
  card.append(h('div', { class: 'scan-body' }, h('div', { class: 'scan-left' }, preview(img, res)),
    h('div', { class: 'scan-right' },
      h('p', { class: 'note' }, old ? t('sc.champUpdate', { name: champ.name }) : t('sc.champNew', { name: champ.name })),
      h('fieldset', {}, h('legend', {}, t('sc.stats')), h('div', { class: 'row' },
        fields.map(([k, lbl]) => numberField({ label: lbl, id: `ch-${champ.name}-${k}`, value: c[k], min: 0, step: 1, onChange: (v) => { c[k] = v; } })))),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button', onclick: () => {
        const saved = store.saveChampion(c);
        msg.replaceChildren(h('p', { class: saved ? 'note' : 'error' }, saved ? t('sc.champSaved', { name: champ.name }) : t('ch.saveFail'), ' ',
          saved ? h('a', { href: '#/champions' }, t('nav.champions')) : '', saved ? ' · ' : '', saved ? h('a', { href: '#/teams' }, t('sc.toTeams')) : ''));
      } }, old ? t('sc.update', { name: champ.name }) : t('sc.champSave'))), msg)));
}

function renderCard(card, img, res, fileName, onSaved) {
  const d = draftFrom(res);
  const msg = h('div', { role: 'status', 'aria-live': 'polite' });
  const nameNote = h('p', { class: 'small', 'aria-live': 'polite' });
  const nameInfo = () => [
    res.name ? h('span', { class: 'muted' }, t('sc.nameRead'), ' ') : h('span', { class: 'muted' }, t('sc.nameNotRead'), ' '),
    d.existing ? h('strong', {}, t('sc.willUpdate', { name: d.existing.name })) : (d.name ? h('span', {}, t('sc.willCreate')) : null),
  ];

  // Comparaison avec la sauvegarde (mise à jour) ou proposition de rattachement (même équipement).
  const cmp = h('div', { 'aria-live': 'polite' });
  const saveLabel = () => (d.existing ? t('sc.update', { name: d.existing.name }) : t('sc.save'));
  let saveBtn = h('button');
  const compare = () => {
    if (d.match && !d.existing) {
      const x = d.match.hero;
      return [h('div', { class: 'note' }, h('p', {}, h('strong', {}, t('sc.looksLike', { name: x.name, n: d.match.same }))),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'button', onclick: () => { useSaved(d, x); draw(); } }, t('sc.yesUpdate', { name: x.name })),
          h('button', { type: 'button', class: 'btn-small', onclick: () => { d.match = null; draw(); } }, t('sc.noOther'))))];
    }
    if (!d.existing) return [];
    const diffs = diffWithSaved(d, d.existing);
    const when = d.existing.updatedAt ? new Date(d.existing.updatedAt).toLocaleDateString('fr-FR') : null;
    return [h('div', { class: 'note' },
      h('p', {}, h('strong', {}, t('sc.alreadySaved', { name: d.existing.name })), when ? ` ${t('sc.savedOn', { date: when })}` : ''),
      diffs.length
        ? [h('p', { class: 'small' }, t('sc.changes', { n: diffs.length })), h('ul', { class: 'small diff-list' }, diffs.map((x) => h('li', {}, x)))]
        : h('p', { class: 'small' }, t('sc.upToDate')))];
  };

  const draw = () => {
    clear(card);
    const cls = D.classById.get(d.classId) || null;
    card.append(h('div', { class: 'scan-head' },
      h('h2', {}, d.name || (cls ? cls.name : '?'), ' ', h('span', { class: 'muted small' }, fileName)),
      h('button', { type: 'button', class: 'btn-small danger', onclick: () => card.remove() }, t('sc.remove'))));
    if (res.tab === 'caps') card.append(h('p', { class: 'note' }, t('sc.capsTab')));

    const body = h('div', { class: 'scan-body' });
    body.append(h('div', { class: 'scan-left' }, preview(img, res)));
    const right = h('div', { class: 'scan-right' });

    // --- Identité
    const clsOpts = [...new Set([...res.classes.slice(0, 6), ...[...D.classes].sort((a, b) => a.name.localeCompare(b.name))])];
    right.append(h('fieldset', {}, h('legend', {}, t('sc.identity')),
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { for: `${d.id}-name` }, t('sc.name')),
          h('input', { type: 'text', id: `${d.id}-name`, value: d.name, maxlength: 60, placeholder: t('sc.namePh'), oninput: (e) => { d.name = e.target.value; const ex = sameName(d.name); if (ex) useSaved(d, ex); else { d.existing = null; d.id = (d.newId ||= store.newId('h')); } nameNote.replaceChildren(...nameInfo()); cmp.replaceChildren(...compare()); saveBtn.textContent = saveLabel(); } })),
        select({ label: t('sc.class'), id: `${d.id}-cls`, value: d.classId, options: [{ value: '', label: '–' }, ...clsOpts.map((c) => ({ value: c.id, label: c.name }))],
          onChange: async (v) => { const c = D.classById.get(v); d.classId = v; if (c) { await rerankGear(res, c); fillGear(d, res, c); fillSkills(d, res, c); } draw(); } }),
        numberField({ label: t('sc.level'), id: `${d.id}-lvl`, value: d.level, min: 1, max: D.maxLevel, step: 1, onChange: (v) => { d.level = v || D.maxLevel; } })),
      (nameNote.replaceChildren(...nameInfo()), nameNote),
      cls ? h('p', { class: 'with-ico small' }, icon(classIcon(cls.name), { size: 28 }), h('span', {}, `${cls.name} · ${cls.group}`)) : null));

    cmp.replaceChildren(...compare());
    right.append(cmp);

    // --- Compétences
    const inn = res.skills[0];
    const innFam = inn.list[0] && inn.list[0].fams[0];
    const sk = h('fieldset', {}, h('legend', {}, t('sc.skills')),
      innFam ? h('p', { class: 'with-ico' }, icon(skillIcon(firstTier(innFam).name), { size: 32 }), h('span', {}, `${t('sc.innate')} : ${skillLabel(innFam.family, inn.tier || Math.max(...innFam.tiers.keys()))} `), confTag(inn.conf)) : null,
      h('p', { class: 'muted small' }, t('sc.tierHint')));
    res.skills.slice(1).forEach((e, k) => {
      const cur = d.skills[k];
      const curFam = cur && findFamily(cur.family);
      const opts = skillOptions(e, cls).slice(0, 4);
      const all = D.families.filter((f) => f.type === 'Hero' && (!cls || classMatches(f.classes, cls)));
      sk.append(h('div', { class: 'scan-row' },
        h('div', { class: 'scan-row-main' },
          curFam ? icon(skillIcon(firstTier(curFam).name), { size: 40 }) : h('span', { class: 'gear-empty' }, '?'),
          h('strong', {}, curFam ? skillLabel(curFam.family, cur.tier) : t('sc.unknown')), ' ', confTag(e.conf),
          curFam ? select({ label: t('sc.tier'), id: `${d.id}-t${k}`, value: cur.tier, options: [...curFam.tiers.keys()].map((x) => ({ value: x, label: ['', 'I', 'II', 'III', 'IV'][x] || x })),
            onChange: (v) => { cur.tier = Number(v); } }) : null),
        opts.length > 1 ? h('div', { class: 'q-group', role: 'group', 'aria-label': t('sc.alts') }, opts.map((f) => choice(f.family, skillIcon(firstTier(f).name), curFam === f,
          () => { d.skills[k] = { family: f.family, key: f.key, tier: tierFor(f, e.tier) }; draw(); }))) : null,
        combo({ label: t('sc.alts'), id: `${d.id}-sk${k}`, options: all.flatMap((f) => [{ value: f.family }, ...[...f.tiers.values()].filter((x) => x.name !== f.family).map((x) => ({ value: x.name, label: f.family }))]), value: '', placeholder: '…',
          onPick: (n) => { const f = all.find((x) => x.family === n || [...x.tiers.values()].some((y) => y.name === n)); if (f) { d.skills[k] = { family: f.family, key: f.key, tier: tierFor(f, e.tier) }; draw(); } } })));
    });
    right.append(sk);

    // --- Équipement
    if (res.tab === 'infos' && cls) {
      const gr = h('fieldset', {}, h('legend', {}, t('sc.gear')), h('p', { class: 'muted small' }, t('sc.qualityHint'), ' ', t('sc.enchantHint')));
      cls.slots.forEach((types, i) => {
        const g = d.gear[i];
        const e = res.gear[i];
        const it = D.itemByName.get(g.item);
        const allowed = new Set(slotTypes(cls, i));
        const alts = e.list.filter((x) => allowed.has(x.type)).slice(0, 4);
        const tr = e.tier && e.tier.value; // palier lu : ces objets d'abord dans la liste
        const allItems = D.items.filter((x) => allowed.has(x.type)).sort((a, b) => (tr ? Math.abs(a.tier - tr) - Math.abs(b.tier - tr) : 0) || b.tier - a.tier);
        gr.append(h('div', { class: 'scan-row' },
          h('div', { class: 'scan-row-main' },
            it ? gearTile(it, { tier: it.tier, quality: g.quality, size: 48 }) : h('span', { class: 'gear-empty' }, '?'),
            h('div', {}, h('strong', {}, it ? it.name : t('sc.unknown')), ' ', confTag(e.conf), h('div', { class: 'muted small' }, `${t('sc.slot', { n: i + 1 })} · ${types.map(typeName).join(' / ')}${it ? ` · ${itemLabel(it)}` : ''}`))),
          alts.length > 1 ? h('div', { class: 'q-group', role: 'group', 'aria-label': t('sc.alts') }, alts.map((x) => choice(x.key, itemIcon(D.itemByName.get(x.key)), g.item === x.key,
            () => { g.item = x.key; applyBuiltIns(g); draw(); }))) : null,
          h('div', { class: 'row' },
            combo({ label: t('sc.alts'), id: `${d.id}-it${i}`, options: allItems.map((x) => ({ value: x.name, label: itemLabel(x) })), value: '', placeholder: '…',
              onPick: (n) => { if (D.itemByName.has(n)) { g.item = n; applyBuiltIns(g); draw(); } } }),
            select({ label: t('sc.quality'), id: `${d.id}-q${i}`, value: g.quality, options: Object.keys(QUALITY).map((q) => ({ value: q, label: qualityName(q) })), onChange: (v) => { g.quality = v; draw(); } }),
            select({ label: t('sc.element'), id: `${d.id}-e${i}`, value: g.element, options: [{ value: '', label: t('sc.none') }, ...ELEMENT_ENCHANTS().map((x) => ({ value: x.name, label: enchantLabel(x) }))], onChange: (v) => { g.element = v; } }),
            select({ label: t('sc.spirit'), id: `${d.id}-s${i}`, value: g.spirit, options: [{ value: '', label: t('sc.none') }, ...SPIRITS().map((x) => ({ value: x.name, label: spiritLabel(x.name) }))], onChange: (v) => { setSpirit(i, v); } }),
            h('span', { class: 'muted small' }, e.spirit && g.spirit === e.spirit ? h('span', { class: 'tag tag-ok' }, t('sc.spiritKnown')) : !g.spirit ? t('sc.spiritPick') : null))));
      });
      right.append(gr);
    }

    // --- Stats
    if (res.stats) {
      right.append(h('fieldset', {}, h('legend', {}, t('sc.stats')), h('p', { class: 'muted small' }, t('sc.statsHint')),
        h('div', { class: 'row' },
          numberField({ label: t('sc.power'), id: `${d.id}-pw`, value: d.power, min: 0, step: 1, onChange: (v) => { d.power = v; } }),
          ...[['hp', 'HP'], ['atk', 'ATK'], ['def', 'DEF'], ['eva', t('sc.evaReal')], ['crit', t('sc.critManual')]].map(([k, lbl]) => numberField({ label: lbl, id: `${d.id}-${k}`, value: d.stats[k], min: 0, step: 1, onChange: (v) => { if (v == null) delete d.stats[k]; else d.stats[k] = v; } })))),
        res.stats.evaShown != null && res.stats.eva != null && res.stats.evaShown > res.stats.eva
          ? h('p', { class: 'note small' }, t('sc.evaCapped', { shown: res.stats.evaShown, real: res.stats.eva, lost: res.stats.evaShown - res.stats.eva })) : null);
    }

    saveBtn = h('button', { type: 'button', class: 'button', onclick: () => save(false) }, saveLabel());
    right.append(h('div', { class: 'actions' }, saveBtn,
      d.existing ? h('button', { type: 'button', class: 'btn-small', onclick: () => save(true) }, t('sc.saveAsNew')) : null), msg);
    body.append(right);
    card.append(body);
  };

  // Choisir un esprit pour une case l'applique aussi aux autres cases de la capture dont la pastille
  // est identique (et encore vides) : souvent plusieurs objets portent le même esprit.
  function setSpirit(i, v) {
    const ref = res.gear[i] && res.gear[i].spiritSig;
    d.gear[i].spirit = v;
    if (v && ref && ref.v) d.gear.forEach((g, k) => {
      const o = res.gear[k] && res.gear[k].spiritSig;
      if (k === i || g.spirit || !o || !o.v) return;
      let c = 0; for (let n = 0; n < o.v.length; n++) c += o.v[n] * ref.v[n];
      if (c >= 0.9) g.spirit = v;
    });
    draw();
  }

  function save(asNew) {
    if (asNew && d.existing) {
      // Autre héros du même nom : nouvel identifiant et nom distinct (sinon il serait pris pour le premier).
      d.existing = null; d.id = (d.newId ||= store.newId('h'));
      let n = 2; const base = d.name.trim(); while (sameName(`${base} (${n})`)) n++;
      d.name = `${base} (${n})`;
    }
    const cls = D.classById.get(d.classId);
    if (!cls) { msg.replaceChildren(h('p', { class: 'error' }, t('sc.saveFail'))); return; }
    d.updated = !!d.existing;
    const hero = { id: d.id, name: d.name.trim(), classId: cls.id, level: d.level, skills: d.skills.filter(Boolean).map((s) => ({ family: s.family, tier: s.tier })),
      gear: d.gear.map((g) => ({ item: g.item, quality: g.quality, element: g.element, spirit: g.spirit })), stats: { ...d.stats }, notes: '' };
    if (d.power) hero.stats.power = d.power;
    if (!d.name.trim()) { msg.replaceChildren(h('p', { class: 'error' }, t('sc.needName'))); return; }
    const saved = store.saveHero(hero);
    if (!saved) { msg.replaceChildren(h('p', { class: 'error' }, t('sc.saveFail'))); return; }
    d.existing = saved; d.id = saved.id; onSaved();
    // Apprentissage : la pastille de chaque esprit choisi servira à le reconnaître aux prochains imports.
    d.gear.forEach((g, i) => { if (g.spirit && res.gear[i]) learnSpirit(g.spirit, res.gear[i].spiritSig); });
    msg.replaceChildren(h('p', { class: 'note' }, t(d.updated ? 'sc.updated' : 'sc.saved', { name: saved.name }), ' ',
      h('a', { href: `#/roster?edit=${saved.id}` }, t('sc.openEditor')), ' · ', h('a', { href: '#/teams' }, t('sc.toTeams'))));
    draw();
  }

  draw();
}

export function render(root) {
  const list = h('div', { class: 'scan-list' });
  const handle = async (file) => {
    if (!file || !/^image\//.test(file.type)) return;
    const card = h('section', { class: 'card scan-card' }, h('p', { role: 'status' }, t('sc.loading')));
    list.prepend(card);
    try {
      const img = await loadImage(file);
      const status = card.querySelector('[role=status]');
      const res = await analyze(img, { onProgress: (n, total) => { status.textContent = n == null ? `${t('sc.loading')} ${t('sc.readingName')}` : `${t('sc.loading')} ${t('sc.icons', { n, total })}`; } });
      const champ = championOf(res.name);
      if (champ) renderChampionCard(card, img, res, champ, file.name || '');
      else renderCard(card, img, res, file.name || '', drawHeroes);
    } catch (e) {
      console.error(e);
      const key = e.message === 'panel' ? 'sc.noPanel' : null;
      card.replaceChildren(h('p', { class: 'error', role: 'alert' }, key ? t(key) : `${t('sc.fail')} ${e.message}`),
        h('button', { type: 'button', class: 'btn-small', onclick: () => card.remove() }, t('sc.remove')));
    }
  };
  const handleAll = (files) => { [...files].forEach(handle); };

  const input = h('input', { type: 'file', id: 'scan-file', accept: 'image/*', multiple: true, onchange: () => { handleAll(input.files); input.value = ''; } });
  const drop = h('div', { class: 'drop-zone' },
    h('label', { for: 'scan-file', class: 'button' }, t('sc.pick')), input,
    h('p', { class: 'small' }, t('sc.drop')));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handleAll(e.dataTransfer.files); });
  const onPaste = (e) => {
    if (!root.contains(drop)) { document.removeEventListener('paste', onPaste); return; }
    const files = [...(e.clipboardData && e.clipboardData.files || [])];
    if (files.length) { e.preventDefault(); handleAll(files); }
  };
  document.addEventListener('paste', onPaste);

  // --- Mes héros (sous la zone d'import)
  const heroesBox = h('section', { class: 'my-heroes', 'aria-labelledby': 'my-heroes-h' });
  const backupMsg = h('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
  function drawHeroes() {
    clear(heroesBox);
    const heroes = store.listHeroes().filter((x) => D.classById.has(x.classId));
    heroesBox.append(h('h2', { id: 'my-heroes-h' }, `${t('sc.myHeroes')} (${heroes.length})`));
    if (!heroes.length) { heroesBox.append(h('p', { class: 'muted' }, t('sc.noHeroes'))); }
    else {
      const listBox = h('div', {});
      const sortSel = select({ label: t('vw.sort'), id: 'hero-sort', value: store.getPref('heroSort', 'power'), options: ['power', 'name', 'class', 'recent'].map((v) => ({ value: v, label: t(`vw.sort.${v}`) })),
        onChange: (v) => { store.setPref('heroSort', v); drawList(); } });
      const toggle = viewToggle(() => drawList());
      const drawList = () => {
        const by = store.getPref('heroSort', 'power');
        const cn = (x) => D.classById.get(x.classId).name;
        const sorted = [...heroes].sort((a, b) => (by === 'name' ? a.name.localeCompare(b.name) : by === 'class' ? cn(a).localeCompare(cn(b)) || a.name.localeCompare(b.name)
          : by === 'recent' ? b.updatedAt - a.updatedAt : ((b.stats || {}).power || 0) - ((a.stats || {}).power || 0)));
        const view = toggle.value();
        listBox.replaceChildren(unitList(view, sorted.map((hero) => heroUnit(view, hero, [
          h('a', { class: 'btn-small', href: `#/roster?edit=${hero.id}` }, t('ro.edit')),
          deleteButton(`${t('ro.delete')} ${hero.name}`, () => { store.deleteHero(hero.id); drawHeroes(); })], gearRow))));
      };
      const tip = h('div', {});
      heroesBox.append(tip, h('div', { class: 'list-tools' }, sortSel, toggle, h('a', { class: 'button', href: '#/teams' }, t('sc.seeTeams'))), listBox);
      drawList();
      setTimeout(() => { if (tip.isConnected) tip.replaceChildren(nextActionCard(heroes) || ''); }, 30); // calcul après l'affichage
    }
    const file = h('input', { type: 'file', id: 'imp-json', accept: 'application/json,.json', onchange: async () => {
      const f = file.files[0]; if (!f) return;
      try { const r = await store.importJSON(f); backupMsg.className = 'small'; backupMsg.textContent = t('ro.importOk', { h: r.heroes, t: r.teams }); drawHeroes(); }
      catch (e) { backupMsg.className = 'small error'; backupMsg.textContent = t(e.message === 'json' ? 'ro.importJson' : 'ro.importShape'); }
    } });
    heroesBox.append(h('details', { class: 'card' }, h('summary', {}, t('sc.transfer')),
      h('p', { class: 'small' }, t('sc.transferTxt')),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'button secondary', onclick: () => store.exportJSON() }, t('ro.export')),
        h('div', { class: 'field' }, h('label', { for: 'imp-json' }, t('ro.import')), file)),
      backupMsg));
  }

  root.append(h('h1', {}, t('sc.title')), h('p', { class: 'lead' }, t('sc.intro')),
    h('p', { class: 'small' }, t('sc.private'), ' ', t('sc.tips')),
    h('p', { class: 'note' }, t('sc.estimate')),
    ...(store.storageOk() ? [] : [h('p', { class: 'note', role: 'alert' }, t('ro.noStorage'))]),
    drop, list, heroesBox);
  drawHeroes();
}
