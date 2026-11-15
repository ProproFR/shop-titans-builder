// Reconnaissance des icônes (objets, compétences, classe, élément) par comparaison de miniatures.
// Les miniatures de référence viennent de data/iconsig.json (scripts/build_iconsig.py).
import { signature, boxMean, hsv } from './image.js';

export const SIG_N = 12;
let SIGS = null;

/** Miniature N×N RGBA d'une image du site, calculée dans le navigateur (même méthode que build_iconsig.py). */
async function computeSig(path, trim) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = () => rej(new Error(path));
    i.src = new URL(`../../${path}`, import.meta.url).href;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height);
  let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1;
  if (trim) { // recadrage sur la partie opaque
    x0 = w; y0 = h; x1 = -1; y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, side = Math.max(cw, ch);
  const ox = x0 - Math.floor((side - cw) / 2), oy = y0 - Math.floor((side - ch) / 2); // carré centré
  const N = SIG_N, out = new Uint8Array(N * N * 4), cell = side / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let r = 0, g = 0, b = 0, a = 0, area = 0;
    const ya = j * cell, yb = (j + 1) * cell, xa = i * cell, xb = (i + 1) * cell;
    for (let yy = Math.floor(ya); yy < Math.ceil(yb); yy++) {
      const fy = Math.min(yb, yy + 1) - Math.max(ya, yy);
      for (let xx = Math.floor(xa); xx < Math.ceil(xb); xx++) {
        const f = fy * (Math.min(xb, xx + 1) - Math.max(xa, xx));
        area += f;
        const sx = xx + ox, sy = yy + oy;
        if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue; // remplissage transparent
        const k = (sy * w + sx) * 4, al = data[k + 3] / 255;
        r += f * data[k] * al; g += f * data[k + 1] * al; b += f * data[k + 2] * al; a += f * al;
      }
    }
    const o = (j * N + i) * 4;
    out[o] = a ? r / a : 0; out[o + 1] = a ? g / a : 0; out[o + 2] = a ? b / a : 0; out[o + 3] = Math.round((a / area) * 255);
  }
  return out;
}

/**
 * Charge data/iconsig.json (miniatures précalculées) une seule fois. Les images absentes du fichier
 * sont calculées à la demande dans le navigateur (ensure), puis gardées en mémoire.
 */
export async function loadSignatures() {
  if (SIGS) return SIGS;
  let paths = {};
  try {
    const r = await fetch(new URL('../../data/iconsig.json', import.meta.url));
    if (r.ok) { const j = await r.json(); if (j.n === SIG_N) paths = j.paths; }
  } catch (e) { /* fichier facultatif */ }
  const bytes = new Map(); // chemin -> Uint8Array RGBA
  for (const [p, b64] of Object.entries(paths)) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    bytes.set(p, u);
  }
  const cache = new Map();
  SIGS = {
    has: (path) => bytes.has(path),
    /** Calcule les miniatures manquantes (par lots, en parallèle). onProgress(fait, total). */
    async ensure(list, onProgress) {
      const todo = [...new Set(list.filter((p) => p && !bytes.has(p)))];
      let done = 0;
      for (let i = 0; i < todo.length; i += 24) {
        await Promise.all(todo.slice(i, i + 24).map(async (p) => {
          try { bytes.set(p, await computeSig(p, p.includes('/items/'))); } catch (e) { /* image manquante */ }
          done++;
        }));
        if (onProgress) onProgress(done, todo.length);
      }
    },
    get(path) {
      if (cache.has(path)) return cache.get(path);
      const u = bytes.get(path);
      if (!u) return null;
      const n = SIG_N * SIG_N;
      const rgb = new Float32Array(n * 3), w = new Float32Array(n);
      let wsum = 0;
      for (let i = 0; i < n; i++) {
        rgb[i * 3] = u[i * 4]; rgb[i * 3 + 1] = u[i * 4 + 1]; rgb[i * 3 + 2] = u[i * 4 + 2];
        w[i] = u[i * 4 + 3] / 255; wsum += w[i];
      }
      const ref = { rgb, w, wsum };
      cache.set(path, ref);
      return ref;
    },
  };
  return SIGS;
}

/** Distance pondérée par l'opacité de la référence (0 = identique). */
function dist(crop, ref) {
  let s = 0;
  for (let i = 0, n = ref.w.length; i < n; i++) {
    const w = ref.w[i];
    if (w < 0.05) continue;
    const dr = crop[i * 3] - ref.rgb[i * 3], dg = crop[i * 3 + 1] - ref.rgb[i * 3 + 1], db = crop[i * 3 + 2] - ref.rgb[i * 3 + 2];
    s += w * (dr * dr + dg * dg + db * db);
  }
  return Math.sqrt(s / Math.max(ref.wsum, 1e-6) / 3);
}

/** Distance de forme : luminance centrée-réduite (insensible aux teintes ; sert aux pastilles d'élément, grisées en jeu). */
function shapeDist(crop, ref) {
  const n = ref.w.length;
  const la = new Float32Array(n), lb = new Float32Array(n);
  let wa = 0, ma = 0, mb = 0;
  for (let i = 0; i < n; i++) {
    la[i] = 0.299 * crop[i * 3] + 0.587 * crop[i * 3 + 1] + 0.114 * crop[i * 3 + 2];
    lb[i] = 0.299 * ref.rgb[i * 3] + 0.587 * ref.rgb[i * 3 + 1] + 0.114 * ref.rgb[i * 3 + 2];
    const w = ref.w[i]; wa += w; ma += w * la[i]; mb += w * lb[i];
  }
  if (wa < 1e-6) return Infinity;
  ma /= wa; mb /= wa;
  let va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const w = ref.w[i]; va += w * (la[i] - ma) ** 2; vb += w * (lb[i] - mb) ** 2; }
  const sa = Math.sqrt(va / wa) || 1, sb = Math.sqrt(vb / wa) || 1;
  let s = 0;
  for (let i = 0; i < n; i++) { const e = (la[i] - ma) / sa - (lb[i] - mb) / sb; s += ref.w[i] * e * e; }
  return Math.sqrt(s / wa) * 40; // même ordre de grandeur que dist()
}

/**
 * Classe des candidats pour une zone carrée de la capture.
 * On essaie plusieurs tailles et décalages du cadrage (le dessin n'occupe pas toujours la même place).
 * @param {object} I image intégrale (image.js)
 * @param {{x,y,w,h}} box zone approximative
 * @param {{key:string, path:string}[]} cands
 * @param {{scales?:number[], shift?:number, steps?:number, shape?:boolean}} opt
 * @returns {{key:string, path:string, d:number}[]} du plus proche au plus éloigné
 */
export function rank(I, box, cands, opt = {}) {
  const scales = opt.scales || [0.72, 0.82, 0.92, 1];
  const shift = opt.shift ?? 0.08, steps = opt.steps ?? 2;
  const side = Math.min(box.w, box.h), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const crops = [];
  for (const sc of scales) {
    const sz = side * sc;
    for (let a = -steps; a <= steps; a++) for (let b = -steps; b <= steps; b++) {
      const x = cx - sz / 2 + (a / steps) * shift * side, y = cy - sz / 2 + (b / steps) * shift * side;
      crops.push(signature(I, x, y, sz, SIG_N));
    }
  }
  const out = [];
  for (const c of cands) {
    const ref = SIGS && SIGS.get(c.path);
    if (!ref) continue;
    let best = Infinity;
    const f = opt.shape ? shapeDist : dist;
    for (const cr of crops) { const d = f(cr, ref); if (d < best) best = d; }
    out.push({ ...c, d: best });
  }
  return out.sort((a, b) => a.d - b.d);
}

/** Confiance 0-1 à partir de l'écart entre le 1er et le 2e candidat et de la distance absolue. */
export function confidence(list) {
  if (!list.length) return 0;
  const d1 = list[0].d, d2 = list[1] ? list[1].d : d1 + 40;
  const gap = Math.min(1, (d2 - d1) / Math.max(d1, 1) * 2);
  const abs = Math.max(0, 1 - d1 / 70);
  return Math.round(Math.min(1, 0.5 * gap + 0.5 * abs) * 100) / 100;
}

/**
 * Qualité de l'objet d'après la couleur du contour/halo dans la case :
 * jaune-or = Legendary, magenta = Epic, cyan = Flawless, vert = Superior, rien = Normal.
 * Estimation à confirmer (les couleurs propres à l'objet peuvent tromper).
 */
export function guessQuality(img, tile) {
  const bins = { Legendary: 0, Epic: 0, Flawless: 0, Superior: 0 };
  let n = 0;
  const { x, y, w, h } = tile;
  // On ignore la bande du bas (pourcentage vert) et les pastilles des coins.
  for (let yy = y + h * 0.12; yy < y + h * 0.72; yy += 1) {
    for (let xx = x + w * 0.06; xx < x + w * 0.78; xx += 1) {
      const i = (Math.round(yy) * img.width + Math.round(xx)) * 4;
      const [hh, s, v] = hsv(img.data[i], img.data[i + 1], img.data[i + 2]);
      n++;
      if (s < 0.55 || v < 0.6) continue;
      if (hh >= 38 && hh < 62) bins.Legendary++;
      else if (hh >= 280 && hh < 335) bins.Epic++;
      else if (hh >= 170 && hh < 200) bins.Flawless++;
      else if (hh >= 85 && hh < 150) bins.Superior++;
    }
  }
  const [best, cnt] = Object.entries(bins).sort((a, b) => b[1] - a[1])[0];
  return cnt / Math.max(n, 1) > 0.04 ? best : 'Normal';
}

/** Couleur moyenne d'une zone (utilitaire de diagnostic). */
export const meanColor = (I, b) => boxMean(I, b.x, b.y, b.x + b.w, b.y + b.h);
