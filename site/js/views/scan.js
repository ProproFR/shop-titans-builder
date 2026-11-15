// Vue « Importer une capture » (#/scan) : lecture automatique de la fiche d'un héros, validation, enregistrement.
import { D, itemIcon, skillIcon, classIcon, findFamily } from '../data.js';
import { t } from '../i18n.js';
import { h, clear, icon, combo, select, numberField, gearTile } from '../dom.js';
import { classMatches, QUALITY } from '../calc.js';
import { emptyGear, slotTypes } from '../hero.js';
import * as store from '../store.js';
import { loadImage } from '../scan/image.js';
import { analyze, rerankGear } from '../scan/analyze.js';

const SURE = 0.6; // seuil de confiance pour « sûr »
const SPIRITS = () => D.enchantments.filter((e) => e.type === 'Spirit');
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
  const d = { id: store.newId('h'), name: '', classId: cls ? cls.id : '', level: res.level || D.maxLevel, skills: [], gear: cls ? emptyGear(cls) : [], stats: {} };
  fillSkills(d, res, cls);
  fillGear(d, res, cls);
  if (res.stats) {
    for (const k of ['atk', 'def', 'hp', 'eva']) if (res.stats[k] != null) d.stats[k] = res.stats[k];
    d.power = res.stats.power;
  }
  return d;
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
    return { item: first ? first.key : '', quality: g.quality || 'Normal', element: g.enchant || '', spirit: '' };
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

function renderCard(card, img, res, fileName) {
  const d = draftFrom(res);
  const msg = h('div', { role: 'status', 'aria-live': 'polite' });

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
          h('input', { type: 'text', id: `${d.id}-name`, value: d.name, maxlength: 60, placeholder: t('sc.namePh'), oninput: (e) => { d.name = e.target.value; } })),
        select({ label: t('sc.class'), id: `${d.id}-cls`, value: d.classId, options: [{ value: '', label: '–' }, ...clsOpts.map((c) => ({ value: c.id, label: c.name }))],
          onChange: async (v) => { const c = D.classById.get(v); d.classId = v; if (c) { await rerankGear(res, c); fillGear(d, res, c); fillSkills(d, res, c); } draw(); } }),
        numberField({ label: t('sc.level'), id: `${d.id}-lvl`, value: d.level, min: 1, max: D.maxLevel, step: 1, onChange: (v) => { d.level = v || D.maxLevel; } })),
      cls ? h('p', { class: 'with-ico small' }, icon(classIcon(cls.name), { size: 28 }), h('span', {}, `${cls.name} · ${cls.group}`)) : null));

    // --- Compétences
    const inn = res.skills[0];
    const innFam = inn.list[0] && inn.list[0].fams[0];
    const sk = h('fieldset', {}, h('legend', {}, t('sc.skills')),
      innFam ? h('p', { class: 'with-ico' }, icon(skillIcon(firstTier(innFam).name), { size: 32 }), h('span', {}, `${t('sc.innate')} : ${innFam.family} `), confTag(inn.conf)) : null,
      h('p', { class: 'muted small' }, t('sc.tierHint')));
    res.skills.slice(1).forEach((e, k) => {
      const cur = d.skills[k];
      const curFam = cur && findFamily(cur.family);
      const opts = skillOptions(e, cls).slice(0, 4);
      const all = D.families.filter((f) => f.type === 'Hero' && (!cls || classMatches(f.classes, cls)));
      sk.append(h('div', { class: 'scan-row' },
        h('div', { class: 'scan-row-main' },
          curFam ? icon(skillIcon(firstTier(curFam).name), { size: 40 }) : h('span', { class: 'gear-empty' }, '?'),
          h('strong', {}, curFam ? curFam.family : t('sc.unknown')), ' ', confTag(e.conf),
          curFam ? select({ label: t('sc.tier'), id: `${d.id}-t${k}`, value: cur.tier, options: [...curFam.tiers.keys()].map((x) => ({ value: x, label: ['', 'I', 'II', 'III', 'IV'][x] || x })),
            onChange: (v) => { cur.tier = Number(v); } }) : null),
        opts.length > 1 ? h('div', { class: 'q-group', role: 'group', 'aria-label': t('sc.alts') }, opts.map((f) => choice(f.family, skillIcon(firstTier(f).name), curFam === f,
          () => { d.skills[k] = { family: f.family, key: f.key, tier: tierFor(f, e.tier) }; draw(); }))) : null,
        combo({ label: t('sc.alts'), id: `${d.id}-sk${k}`, options: all.map((f) => ({ value: f.family })), value: '', placeholder: '…',
          onPick: (n) => { const f = all.find((x) => x.family === n); if (f) { d.skills[k] = { family: f.family, key: f.key, tier: tierFor(f, e.tier) }; draw(); } } })));
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
        const allItems = D.items.filter((x) => allowed.has(x.type));
        gr.append(h('div', { class: 'scan-row' },
          h('div', { class: 'scan-row-main' },
            it ? gearTile(it, { tier: it.tier, quality: g.quality, size: 48 }) : h('span', { class: 'gear-empty' }, '?'),
            h('div', {}, h('strong', {}, it ? it.name : t('sc.unknown')), ' ', confTag(e.conf), h('div', { class: 'muted small' }, `${t('sc.slot', { n: i + 1 })} · ${types.join(' / ')}`))),
          alts.length > 1 ? h('div', { class: 'q-group', role: 'group', 'aria-label': t('sc.alts') }, alts.map((x) => choice(x.key, itemIcon(D.itemByName.get(x.key)), g.item === x.key,
            () => { g.item = x.key; draw(); }))) : null,
          h('div', { class: 'row' },
            combo({ label: t('sc.alts'), id: `${d.id}-it${i}`, options: allItems.map((x) => ({ value: x.name, label: `T${x.tier} ${x.type}` })), value: '', placeholder: '…',
              onPick: (n) => { if (D.itemByName.has(n)) { g.item = n; draw(); } } }),
            select({ label: t('sc.quality'), id: `${d.id}-q${i}`, value: g.quality, options: Object.keys(QUALITY).map((q) => ({ value: q, label: q })), onChange: (v) => { g.quality = v; draw(); } }),
            select({ label: t('sc.element'), id: `${d.id}-e${i}`, value: g.element, options: [{ value: '', label: t('sc.none') }, ...ELEMENT_ENCHANTS().map((x) => ({ value: x.name, label: `${x.name} (+${x.value})` }))], onChange: (v) => { g.element = v; } }),
            select({ label: t('sc.spirit'), id: `${d.id}-s${i}`, value: g.spirit, options: [{ value: '', label: t('sc.none') }, ...SPIRITS().map((x) => ({ value: x.name, label: x.name }))], onChange: (v) => { g.spirit = v; } }))));
      });
      right.append(gr);
    }

    // --- Stats
    if (res.stats) {
      right.append(h('fieldset', {}, h('legend', {}, t('sc.stats')), h('p', { class: 'muted small' }, t('sc.statsHint')),
        h('div', { class: 'row' },
          numberField({ label: t('sc.power'), id: `${d.id}-pw`, value: d.power, min: 0, step: 1, onChange: (v) => { d.power = v; } }),
          ...[['atk', 'ATK'], ['def', 'DEF'], ['hp', 'HP'], ['eva', 'EVA %']].map(([k, lbl]) => numberField({ label: lbl, id: `${d.id}-${k}`, value: d.stats[k], min: 0, step: 1, onChange: (v) => { if (v == null) delete d.stats[k]; else d.stats[k] = v; } })))));
    }

    right.append(h('div', { class: 'actions' }, h('button', { type: 'button', class: 'button', onclick: save }, t('sc.save'))), msg);
    body.append(right);
    card.append(body);
  };

  function save() {
    const cls = D.classById.get(d.classId);
    if (!cls) { msg.replaceChildren(h('p', { class: 'error' }, t('sc.saveFail'))); return; }
    const hero = { id: d.id, name: d.name.trim() || cls.name, classId: cls.id, level: d.level, skills: d.skills.filter(Boolean).map((s) => ({ family: s.family, tier: s.tier })),
      gear: d.gear.map((g) => ({ item: g.item, quality: g.quality, element: g.element, spirit: g.spirit })), stats: { ...d.stats }, notes: '' };
    if (d.power) hero.stats.power = d.power;
    const saved = store.saveHero(hero);
    if (!saved) { msg.replaceChildren(h('p', { class: 'error' }, t('sc.saveFail'))); return; }
    msg.replaceChildren(h('p', { class: 'note' }, t('sc.saved', { name: saved.name }), ' ',
      h('a', { href: `#/roster?edit=${saved.id}` }, t('sc.openEditor')), ' · ', h('a', { href: '#/roster' }, t('sc.toRoster'))));
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
      const res = await analyze(img, { onProgress: (n, total) => { status.textContent = `${t('sc.loading')} ${t('sc.icons', { n, total })}`; } });
      renderCard(card, img, res, file.name || '');
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

  root.append(h('h1', {}, t('sc.title')), h('p', { class: 'lead' }, t('sc.intro')),
    h('p', { class: 'small' }, t('sc.private'), ' ', t('sc.tips')),
    h('p', { class: 'note' }, t('sc.estimate')),
    drop, list);
}
