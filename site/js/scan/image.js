// Outils d'image pour la lecture des captures d'écran (sans dépendance).
// Les pixels sont lus via un <canvas> ; les moyennes de zone utilisent une image intégrale
// (somme cumulée) pour être exactes même avec des coordonnées fractionnaires.

/** Charge un File/Blob/URL en {width, height, data: Uint8ClampedArray RGBA}. */
export async function loadImage(src) {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('image illisible'));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { width: c.width, height: c.height, data: d.data, url: typeof src === 'string' ? src : null };
  } finally {
    if (typeof src !== 'string') URL.revokeObjectURL(url);
  }
}

/** Image intégrale RGB : S[(y)*(w+1)+x] = somme des pixels de [0,x)×[0,y). */
export function integral(img) {
  const { width: w, height: h, data } = img;
  const W = w + 1;
  const R = new Float64Array(W * (h + 1)), G = new Float64Array(W * (h + 1)), B = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let r = 0, g = 0, b = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
      const o = (y + 1) * W + x + 1;
      R[o] = R[o - W] + r; G[o] = G[o - W] + g; B[o] = B[o - W] + b;
    }
  }
  return { w, h, W, R, G, B };
}

// Valeur de l'intégrale en un point fractionnaire (interpolation bilinéaire = aire exacte).
function at(S, I, x, y) {
  x = Math.min(Math.max(x, 0), I.w); y = Math.min(Math.max(y, 0), I.h);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, I.w), y1 = Math.min(y0 + 1, I.h);
  const fx = x - x0, fy = y - y0, W = I.W;
  const a = S[y0 * W + x0], b = S[y0 * W + x1], c = S[y1 * W + x0], d = S[y1 * W + x1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/** Couleur moyenne [r,g,b] du rectangle [x0,x1)×[y0,y1). */
export function boxMean(I, x0, y0, x1, y1) {
  const area = Math.max((x1 - x0) * (y1 - y0), 1e-6);
  const f = (S) => (at(S, I, x1, y1) - at(S, I, x0, y1) - at(S, I, x1, y0) + at(S, I, x0, y0)) / area;
  return [f(I.R), f(I.G), f(I.B)];
}

/** Signature N×N×3 (moyennes RGB) d'un carré (x, y, côté). */
export function signature(I, x, y, size, N) {
  const out = new Float32Array(N * N * 3);
  const c = size / N;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const m = boxMean(I, x + i * c, y + j * c, x + (i + 1) * c, y + (j + 1) * c);
      const o = (j * N + i) * 3;
      out[o] = m[0]; out[o + 1] = m[1]; out[o + 2] = m[2];
    }
  }
  return out;
}

/** Pixel [r,g,b] (coordonnées entières, bornées). */
export function px(img, x, y) {
  x = Math.min(Math.max(Math.round(x), 0), img.width - 1); y = Math.min(Math.max(Math.round(y), 0), img.height - 1);
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

/** Teinte (0-360), saturation et valeur (0-1) d'une couleur RGB. */
export function hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(hh * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
