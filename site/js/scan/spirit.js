// Reconnaissance des esprits (2e pastille en haut à droite de chaque objet).
// Le jeu affiche l'esprit en petite silhouette grise : il n'existe pas d'image de référence fiable.
// On apprend donc au fil des imports : quand vous choisissez un esprit pour un objet et enregistrez,
// la « signature » de sa pastille est mémorisée dans ce navigateur ; aux imports suivants, une pastille
// qui lui ressemble est reconnue automatiquement.
import { boxMean } from './image.js';

const KEY = 'stb.spiritSig.v1';
const N = 10;          // grille de la signature
const MAX_PER = 6;     // signatures gardées par esprit
const THRESHOLD = 0.9;  // ressemblance minimale (corrélation) : même esprit ≥ 0,94, esprits différents ≤ 0,83 sur nos tests
const MARGIN = 0.05;   // écart minimal avec le 2e esprit le plus proche

const lum = (m) => 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];

/**
 * Recale la zone sur la pastille : on cherche, autour de la position prévue, le carré dont le cadre
 * (clair) contraste le plus avec l'intérieur (foncé). La position exacte varie d'une colonne à l'autre.
 */
export function locateBadge(I, b) {
  const w = b.w, t = w * 0.09;
  const mean = (x0, y0, x1, y1) => lum(boxMean(I, x0, y0, x1, y1));
  let best = { score: -1e9, b };
  for (let dy = -0.3; dy <= 0.3001; dy += 0.03) for (let dx = -0.3; dx <= 0.3001; dx += 0.03) for (const sc of [0.9, 1, 1.1]) {
    const s = w * sc, x = b.x + dx * w + (w - s) / 2, y = b.y + dy * w + (w - s) / 2, tt = t * sc;
    const ring = (mean(x, y, x + s, y + tt) + mean(x, y + s - tt, x + s, y + s) + mean(x, y, x + tt, y + s) + mean(x + s - tt, y, x + s, y + s)) / 4;
    const inner = mean(x + s * 0.2, y + s * 0.2, x + s * 0.8, y + s * 0.8);
    const outside = (mean(x - tt * 1.5, y, x - tt * 0.5, y + s) + mean(x + s + tt * 0.5, y, x + s + tt * 1.5, y + s)) / 2;
    const score = ring - 0.5 * inner - 0.5 * outside;
    if (score > best.score) best = { score, b: { x, y, w: s, h: s } };
  }
  return best;
}

/** Signature de la pastille : luminance sur une grille N×N, centrée et normée (insensible à la luminosité). */
export function spiritSig(I, b, shift = [0, 0], scale = 1) {
  // Intérieur de la pastille (on retire le cadre), avec un petit décalage/zoom pour tolérer l'alignement.
  const s = b.w * 0.78 * scale;
  const x = b.x + (b.w - s) / 2 + shift[0] * b.w, y = b.y + (b.h - s) / 2 + shift[1] * b.h;
  const v = new Float32Array(N * N);
  const c = s / N;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const [r, g, bb] = boxMean(I, x + i * c, y + j * c, x + (i + 1) * c, y + (j + 1) * c);
    v[j * N + i] = 0.299 * r + 0.587 * g + 0.114 * bb;
  }
  let m = 0; for (const a of v) m += a; m /= v.length;
  let n = 0; for (let k = 0; k < v.length; k++) { v[k] -= m; n += v[k] * v[k]; }
  n = Math.sqrt(n);
  return { v: n > 1e-6 ? Array.from(v, (a) => +(a / n).toFixed(4)) : null, contrast: n / N };
}

const dot = (a, b) => { let s = 0; for (let k = 0; k < a.length; k++) s += a[k] * b[k]; return s; };

function load() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
}
function save(o) {
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* stockage indisponible : on n'apprend pas */ }
}

/** Nombre d'esprits déjà appris. */
export const learnedCount = () => Object.keys(load()).length;

/** Mémorise la signature d'une pastille pour un esprit (appelé à l'enregistrement d'un héros). */
export function learn(name, sig) {
  if (!name || !sig || !sig.v) return;
  const o = load();
  const list = (o[name] || []).filter((v) => dot(v, sig.v) < 0.995); // évite les doublons exacts
  list.unshift(sig.v);
  o[name] = list.slice(0, MAX_PER);
  save(o);
}

/** Efface ce qui a été appris (bouton « oublier »). */
export function forget() { try { localStorage.removeItem(KEY); } catch { /* rien */ } }

/**
 * Esprit le plus ressemblant parmi ceux appris.
 * @returns {{name, score, sig}} name = '' si rien d'assez proche.
 */
export function recognize(I, box0) {
  const box = locateBadge(I, box0).b;
  const base = spiritSig(I, box);
  const o = load();
  const names = Object.keys(o);
  if (!base.v || !names.length) return { name: '', score: 0, sig: base };
  // Plusieurs petits décalages : on garde le meilleur score par esprit.
  const variants = [base];
  for (const sx of [-0.04, 0, 0.04]) for (const sy of [-0.04, 0, 0.04]) for (const sc of [0.95, 1, 1.05]) {
    if (!sx && !sy && sc === 1) continue;
    const s = spiritSig(I, box, [sx, sy], sc);
    if (s.v) variants.push(s);
  }
  const scores = names.map((name) => {
    let best = -1;
    for (const ref of o[name]) for (const s of variants) best = Math.max(best, dot(ref, s.v));
    return { name, score: best };
  }).sort((a, b) => b.score - a.score);
  const [a, b] = scores;
  const ok = a.score >= THRESHOLD && (!b || a.score - b.score >= MARGIN);
  return { name: ok ? a.name : '', score: a.score, sig: base, ranking: scores.slice(0, 3) };
}
