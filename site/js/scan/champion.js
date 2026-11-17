// Fiche d'un champion : gains du prochain « Power Up » (PV / ATK / DEF en vert), rang et équipement
// (familier et chant d'aura, les deux cercles à gauche du panneau). Zones en unités du panneau (u).
import { integral, hsv } from './image.js';
import { _dev, readNumber } from './ocr.js';
import { loadSignatures, rank } from './match.js';
import { D, itemIcon } from '../data.js';

const green = (r, g, b) => g > 140 && g > r + 40 && g > b + 30;
const light = (r, g, b) => hsv(r, g, b)[2] > 0.55;
const box = (P, [x, y, w, h]) => ({ x: P.x + x * P.u, y: P.y + y * P.u, w: w * P.u, h: h * P.u });

/** Nombre précédé d'un « + » : le signe est plus petit que les chiffres, on l'écarte. */
function readSigned(img, b, pred) {
  const { glyphs, hMax } = _dev.mainLine(_dev.components(img, b, pred));
  if (!glyphs.length) return null;
  const digits = glyphs.filter((c) => c.bh >= hMax * 0.8).slice(glyphs[0].bh < hMax * 0.8 ? 0 : 0);
  // Le « + » a la même hauteur que la moitié basse d'un chiffre mais est presque carré : on l'écarte aussi.
  const kept = digits.filter((c, i) => !(i === 0 && digits.length > 1 && c.bw / c.bh > 0.85));
  const txt = kept.map((c) => _dev.classify(c).d).join('').replace(/[^0-9]/g, '');
  return txt ? Number(txt) : null;
}

const Z = { nhp: [238, 314, 46, 26], famT: [-108, -14, 24, 20], auraT: [-108, 74, 24, 20], natk: [316, 316, 58, 22], ndef: [396, 316, 56, 22], rank: [250, 119, 18, 22],
  fam: [-92, -8, 50, 50], aura: [-92, 85, 50, 50] };

/** Lit la fiche d'un champion (img, panneau P). */
export async function readChampionSheet(img, P) {
  const I = integral(img);
  const gains = { hp: readSigned(img, box(P, Z.nhp), green), atk: readSigned(img, box(P, Z.natk), green), def: readSigned(img, box(P, Z.ndef), green) };
  const rk = readSigned(img, box(P, Z.rank), light);
  const sigs = await loadSignatures();
  const pick = async (type, zone, tz) => {
    // Palier lu sur le rond orange : seuls les objets de ce palier sont comparés.
    const tr = readNumber(img, box(P, tz)).value;
    const all = D.items.filter((x) => x.type === type);
    // Lecture du palier peu fiable sur ce petit rond : acceptée seulement si plausible (≥ 10).
    const byT = tr >= 10 ? all.filter((x) => x.tier === tr) : all.filter((x) => x.tier >= 10);
    const refs = (byT.length ? byT : all).map((x) => ({ key: x.name, path: itemIcon(x) })).filter((x) => x.path);
    await sigs.ensure(refs.map((r) => r.path));
    const l = rank(I, box(P, zone), refs, { scales: [0.8, 0.9, 1, 1.1], shift: 0.15 });
    return l.length ? { name: l[0].key, tier: tr, nT: byT.length, sure: l.length < 2 || l[1].d - l[0].d >= 12, list: l.slice(0, 4).map((x) => x.key) } : null;
  };
  return { gains, rank: rk && rk > 0 && rk < 30 ? rk : null, familiar: await pick('Familiar', Z.fam, Z.famT), aura: await pick('Aurasong', Z.aura, Z.auraT) };
}
