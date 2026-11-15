// Lecture des nombres (police du jeu) et des paliers en chiffres romains sur une capture.
// Sans moteur d'OCR : on isole les caractères clairs (composantes connexes), on les normalise
// sur une grille 8×12 et on les compare à des modèles appris sur de vraies captures (digits.js).
import { px, hsv } from './image.js';
import { DIGITS, ROMAN_IV } from './digits.js';

const GW = 8, GH = 12;

/** Texte blanc/clair (chiffres des stats, du niveau, des graines). */
export const isLight = (r, g, b) => { const [, s, v] = hsv(r, g, b); return v > 0.62 && s < 0.4; };

/**
 * Composantes connexes (4-voisinage) des pixels vérifiant pred dans la zone.
 * @returns {{x0,y0,x1,y1,n,mask:Uint8Array,bw,bh}[]} triées de gauche à droite (coordonnées image).
 */
export function components(img, b, pred = isLight) {
  const x0 = Math.max(0, Math.floor(b.x)), y0 = Math.max(0, Math.floor(b.y));
  const x1 = Math.min(img.width, Math.ceil(b.x + b.w)), y1 = Math.min(img.height, Math.ceil(b.y + b.h));
  const W = x1 - x0, H = y1 - y0;
  if (W <= 0 || H <= 0) return [];
  const on = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = ((y + y0) * img.width + x + x0) * 4;
    if (pred(img.data[i], img.data[i + 1], img.data[i + 2])) on[y * W + x] = 1;
  }
  const lab = new Int32Array(W * H);
  const comps = [];
  const stack = [];
  for (let s = 0; s < W * H; s++) {
    if (!on[s] || lab[s]) continue;
    const id = comps.length + 1;
    const c = { x0: W, y0: H, x1: -1, y1: -1, n: 0, pts: [] };
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p - x) / W;
      c.n++; c.pts.push(p);
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue;
        if (on[q] && !lab[q]) { lab[q] = id; stack.push(q); }
      }
    }
    comps.push(c);
  }
  return comps.map((c) => {
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
    const mask = new Uint8Array(bw * bh);
    for (const p of c.pts) { const x = p % W, y = (p - x) / W; mask[(y - c.y0) * bw + (x - c.x0)] = 1; }
    return { x0: c.x0 + x0, y0: c.y0 + y0, x1: c.x1 + x0, y1: c.y1 + y0, n: c.n, mask, bw, bh };
  }).sort((a, b2) => a.x0 - b2.x0);
}

/** Vecteur 8×12 (taux de remplissage) d'une composante. */
export function glyphVector(c) {
  const v = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const xa = gx * c.bw / GW, xb = (gx + 1) * c.bw / GW, ya = gy * c.bh / GH, yb = (gy + 1) * c.bh / GH;
    let s = 0, k = 0;
    for (let y = Math.floor(ya); y < Math.ceil(yb); y++) for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
      if (x >= c.bw || y >= c.bh) continue;
      s += c.mask[y * c.bw + x]; k++;
    }
    v[gy * GW + gx] = k ? s / k : 0;
  }
  return v;
}

/** Garde les composantes de la ligne de texte principale (hauteur proche de la plus haute). */
function mainLine(comps) {
  const big = comps.filter((c) => c.n >= 6);
  if (!big.length) return { glyphs: [], small: [] };
  const hMax = Math.max(...big.map((c) => c.bh));
  return { glyphs: big.filter((c) => c.bh >= hMax * 0.62), small: big.filter((c) => c.bh < hMax * 0.62), hMax };
}

/** Chiffre le plus proche pour une composante : {d, dist}. */
function classify(c) {
  const v = glyphVector(c);
  const aspect = c.bw / c.bh;
  let best = { d: '?', dist: Infinity };
  for (const [d, list] of Object.entries(DIGITS)) {
    for (const t of list) {
      let s = 0;
      for (let i = 0; i < v.length; i++) { const e = v[i] - t.v[i]; s += e * e; }
      s += 4 * (aspect - t.a) * (aspect - t.a); // la proportion distingue 1 / 7 / 4…
      if (s < best.dist) best = { d, dist: s };
    }
  }
  return best;
}

/**
 * Lit un nombre dans une zone. Les virgules/points (petites composantes) sont ignorés,
 * « % » est reconnu comme un caractère à part et retiré de la valeur.
 * @returns {{value:number|null, text:string, confidence:number}}
 */
export function readNumber(img, b, pred = isLight) {
  const { glyphs, hMax } = mainLine(components(img, b, pred));
  if (!glyphs.length || !hMax) return { value: null, text: '', confidence: 0 };
  // Hauteur typique d'un chiffre : les parenthèses dépassent en haut et en bas, et sont étroites.
  const hs = glyphs.map((c) => c.bh).sort((a, c) => a - c);
  const hDigit = hs[Math.floor(hs.length / 3)];
  const isParen = (c) => c.bh >= hDigit * 1.12 && c.bw / c.bh < 0.34;
  // Découpe en groupes : « 100% (78%) » → valeur affichée 100 %, valeur réelle 78 % entre parenthèses.
  const groups = [{ text: '', worst: 0, pct: false }];
  let inParen = false;
  for (const c of glyphs) {
    if (isParen(c)) {
      if (!inParen) { inParen = true; groups.push({ text: '', worst: 0, pct: false, paren: true }); }
      else inParen = false;
      continue;
    }
    const r = classify(c);
    const g = groups[groups.length - 1];
    if (r.d === '%') { g.pct = true; continue; }
    g.text += r.d; g.worst = Math.max(g.worst, r.dist);
  }
  const main = groups[0], par = groups.find((g) => g.paren && g.text);
  const pick = par || main;
  if (!pick.text) return { value: null, text: '', confidence: 0 };
  const res = { value: Number(pick.text), text: pick.text + (pick.pct ? '%' : ''), confidence: Math.max(0, 1 - pick.worst / 12) };
  // Valeur avant plafond (ex. esquive 100 % plafonnée à 78 %) : utile pour repérer le surplus.
  if (par && main.text) { res.shown = Number(main.text); res.text = `${main.text}${main.pct ? '%' : ''} (${res.text})`; }
  return res;
}

/** Vecteur de luminance normalisé (moyenne 0, écart-type 1) d'une zone, grille 10×8. */
export function lumaVector(img, b) {
  const GX = 10, GY = 8, v = new Float32Array(GX * GY);
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    let s = 0, k = 0;
    for (let y = b.y + j * b.h / GY; y < b.y + (j + 1) * b.h / GY; y += 1) for (let x = b.x + i * b.w / GX; x < b.x + (i + 1) * b.w / GX; x += 1) {
      const [r, g, bb] = px(img, x, y); s += 0.299 * r + 0.587 * g + 0.114 * bb; k++;
    }
    v[j * GX + i] = k ? s / k : 0;
  }
  const m = v.reduce((a, x) => a + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / v.length) || 1;
  return v.map((x) => (x - m) / sd);
}

/**
 * Palier de compétence (chiffres romains dans le coin de la case).
 * Seul le modèle « IV » a pu être appris sur de vraies captures : on reconnaît IV avec une
 * corrélation suffisante, sinon on renvoie null (l'utilisateur choisit le palier à la validation).
 * @returns {{tier:number|null, score:number}}
 */
export function readRoman(img, b) {
  const v = lumaVector(img, b);
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * ROMAN_IV[i];
  const score = s / v.length;
  return { tier: score >= 0.4 ? 4 : null, score };
}

// Exposé pour le script de génération des modèles (outil de développement).
export const _dev = { components, glyphVector, mainLine };
export { px };
