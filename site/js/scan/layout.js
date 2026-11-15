// Repérage des zones de l'écran « fiche du héros » de Shop Titans.
// Principe : on trouve le grand panneau violet (fiche), puis toutes les zones sont exprimées
// en « unités panneau » (u = largeur du panneau / 494), mesurées sur des captures PC (Steam).
import { px, hsv } from './image.js';

const REF_W = 494; // largeur du panneau sur la capture de référence

// Violet du panneau : r > b > g, sombre à moyen.
const isPanel = (r, g, b) => r > 45 && r < 130 && g > 18 && g < 68 && b > 32 && b < 104 && r > b && b > g + 4;

/** Premier et dernier indice où v[i] >= seuil (les bandes non violettes à l'intérieur du panneau sont ignorées). */
function span(v, thr) {
  let a = -1, b = -1;
  for (let i = 0; i < v.length; i++) if (v[i] >= thr) { if (a < 0) a = i; b = i; }
  return [a, b];
}

/** Cadre du panneau {x, y, w, h, u} ou null. */
export function detectPanel(img) {
  const { width: w, height: h, data } = img;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 500));
  const cols = new Float32Array(w), rows = new Float32Array(h);
  let ny = 0;
  for (let y = 0; y < h; y += step) {
    ny++;
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (isPanel(data[i], data[i + 1], data[i + 2])) { cols[x]++; rows[y]++; }
    }
  }
  const nx = Math.ceil(w / step);
  for (let x = 0; x < w; x += step) cols[x] /= ny;
  for (let y = 0; y < h; y += step) rows[y] /= nx;
  // Remplit les colonnes/lignes non échantillonnées.
  for (let x = 0; x < w; x++) if (x % step) cols[x] = cols[x - (x % step)];
  for (let y = 0; y < h; y++) if (y % step) rows[y] = rows[y - (y % step)];
  const [x0, x1] = span(cols, 0.3);
  if (x0 < 0 || x1 - x0 < w * 0.2) return null;
  // Lignes : densité mesurée seulement dans les colonnes du panneau.
  const rr = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0, k = 0;
    for (let x = x0; x <= x1; x += step) { const i = (y * w + x) * 4; k++; if (isPanel(data[i], data[i + 1], data[i + 2])) n++; }
    rr[y] = n / k;
  }
  const [y0, y1] = span(rr, 0.25);
  if (y0 < 0 || y1 - y0 < h * 0.3) return null;
  const pw = x1 - x0 + 1, ph = y1 - y0 + 1;
  // La fiche fait environ 494 × 448 (rapport 1,1) : on écarte les autres écrans violets (ex. bande des graines).
  if (pw / ph < 0.85 || pw / ph > 1.45) return null;
  return { x: x0, y: y0, w: pw, h: ph, u: pw / REF_W };
}

// Zones en unités panneau (origine = coin haut-gauche du panneau détecté, u = 1 sur la référence).
// [dx, dy, largeur, hauteur]
const Z = {
  level: [-1, -13, 27, 24],
  name: [100, 0, 200, 28], // nom du héros, à droite du portrait
  infosTab: [10, 64, 230, 28],
  capsTab: [254, 64, 230, 28],
  classIcon: [11, 104, 22, 22],
  power: [42, 132, 130, 40],
  stats: { hp: [92, 189, 85, 19], atk: [92, 223, 85, 19], def: [92, 257, 85, 19], eva: [62, 289, 115, 23], elem: [92, 326, 85, 19] },
  tiles: { x: [190, 292, 394], y: [131, 244], w: 93, h: 100 },
  // Compétences sous le personnage (onglet Infos) : 5 cases de 54, pas de 62.
  skillsInfos: { x: -394.3, y: 387, size: 54, step: 62 },
  // Mobile (portrait) : compétences centrées au-dessus du panneau, 5 cases de 51,8, pas de 61,3.
  skillsMobile: { x: 98, y: -73, size: 51.8, step: 61.3 },
};

const box = (P, [dx, dy, w, h]) => ({ x: P.x + dx * P.u, y: P.y + dy * P.u, w: w * P.u, h: h * P.u });

/** Onglet actif : 'infos' | 'caps' (bouton jaune). */
export function activeTab(img, P) {
  const yellow = (b) => {
    let n = 0, k = 0;
    for (let y = b.y; y < b.y + b.h; y += 2) for (let x = b.x; x < b.x + b.w; x += 3) {
      const [hh, s, v] = hsv(...px(img, x, y)); k++;
      if (hh > 38 && hh < 60 && s > 0.6 && v > 0.75) n++;
    }
    return n / Math.max(k, 1);
  };
  return yellow(box(P, Z.capsTab)) > yellow(box(P, Z.infosTab)) ? 'caps' : 'infos';
}

/** Toutes les zones utiles pour un panneau détecté. */
export function regions(img, P) {
  const tab = activeTab(img, P);
  const tiles = [];
  for (const ty of Z.tiles.y) for (const tx of Z.tiles.x) {
    const t = box(P, [tx, ty, Z.tiles.w, Z.tiles.h]);
    const u = P.u;
    tiles.push({
      tile: t,
      // Zone du dessin de l'objet (hors pastilles), carrée.
      art: { x: t.x + 8 * u, y: t.y + 10 * u, w: 74 * u, h: 74 * u },
      element: { x: t.x + 74 * u, y: t.y - 3 * u, w: 20 * u, h: 20 * u },
      spirit: { x: t.x + 73.5 * u, y: t.y + 23 * u, w: 21.5 * u, h: 21.5 * u }, // cadre extérieur de la pastille
    });
  }
  // Sur PC (paysage) les compétences sont à gauche du panneau ; sur mobile (portrait) il n'y a pas
  // la place à gauche : elles sont au-dessus. Même rangée sur les deux onglets.
  const layout = P.x - 394.3 * P.u < 0 ? 'mobile' : 'pc';
  const S = layout === 'mobile' ? Z.skillsMobile : Z.skillsInfos;
  const skills = [];
  for (let k = 0; k < 5; k++) {
    const s = box(P, [S.x + k * S.step, S.y, S.size, S.size]);
    skills.push({ tile: s, tier: { x: s.x + s.w * 0.55, y: s.y + s.h * 0.6, w: s.w * 0.42, h: s.h * 0.36 } });
  }
  const stats = {};
  for (const [k, z] of Object.entries(Z.stats)) stats[k] = box(P, z);
  return { tab, layout, name: box(P, Z.name), level: box(P, Z.level), classIcon: box(P, Z.classIcon), power: box(P, Z.power), stats, tiles, skills };
}
