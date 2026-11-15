// Lecture du nom du héros (texte libre) avec Tesseract.js, hébergé dans le site (site/vendor/tesseract/,
// installé par le workflow « Installer l'OCR »). Chargé seulement à la première analyse. Si les fichiers
// sont absents ou que la lecture échoue, on renvoie null : l'utilisateur saisit le nom à la main.
import { px } from './image.js';

const BASE = new URL('../../vendor/tesseract/', import.meta.url).href;
let workerPromise = null;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('tesseract.min.js introuvable'));
    document.head.append(s);
  });
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript(`${BASE}tesseract.min.js`);
      const w = await window.Tesseract.createWorker('fra', 1, {
        workerPath: `${BASE}worker.min.js`,
        corePath: BASE, // choisit tout seul la version SIMD ou non
        langPath: BASE, // fra.traineddata.gz
        gzip: true,
        cacheMethod: 'none', // rien n'est stocké dans le navigateur
        logger: () => {},
      });
      await w.setParameters({ tessedit_pageseg_mode: '7', preserve_interword_spaces: '1' }); // une seule ligne
      return w;
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/** Zone du nom recadrée, agrandie et passée en noir sur blanc (le texte du jeu est clair sur fond violet). */
function prepare(img, b) {
  const scale = Math.max(1, 64 / b.h); // ~64 px de haut : taille idéale pour Tesseract
  const W = Math.round(b.w * scale), H = Math.round(b.h * scale);
  const c = document.createElement('canvas');
  c.width = W + 20; c.height = H + 20;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  const out = ctx.getImageData(10, 10, W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, bl] = px(img, b.x + x / scale, b.y + y / scale);
    const v = Math.max(r, g, bl), s = v ? (v - Math.min(r, g, bl)) / v : 0;
    const on = v > 150 && s < 0.45; // lettres blanches/crème
    const i = (y * W + x) * 4;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = on ? 0 : 255; out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 10, 10);
  return c;
}

/** Nom lu, nettoyé (espaces, symboles parasites en bord), ou null. */
export async function readName(img, box) {
  try {
    const w = await getWorker();
    const { data } = await w.recognize(prepare(img, box));
    const txt = (data.text || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ')
      .replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}~!?'’\- ]/gu, '').trim();
    return txt.length >= 2 && txt.length <= 40 ? { name: txt, confidence: (data.confidence || 0) / 100 } : null;
  } catch (e) {
    console.warn('OCR du nom indisponible :', e.message);
    return null;
  }
}

/** Forme comparable d'un nom : minuscules, sans accents ni symboles (« Laurène ~ » → « laurene »). */
export const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
