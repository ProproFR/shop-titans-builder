// Lecture des notes des builds STC (« Enchant the Idol with Titan if promoted », « Enchant remaining
// items with Ouroboros »…) pour en déduire, objet par objet, l'esprit à poser. Le texte STC n'est pas
// modifié : il reste affiché tel quel (replié) ; ceci est une interprétation du site, présentée à part.
import { D } from './data.js';

const SPIRITS = ['Titan', 'Ouroboros', 'Leviathan', 'Behemoth', 'Griffin', 'Kirin', 'Bahamut', 'Phoenix', 'Hydra', 'Kraken', 'Chimera', 'Carbuncle', 'Tarrasque', 'Quetzalcoatl'];
const spiritRe = new RegExp(`\\b(${SPIRITS.join('|')})\\b`, 'gi');
const norm = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
const spiritName = (w) => { const n = `${norm(w)} Spirit`; return D.enchantByName.has(n) ? n : null; };

// Mot de la note → types d'objet de l'emplacement visé.
const TARGETS = [
  [/\bweapon\b/i, null], // emplacement 1
  [/\bidol\b/i, ['Idol']],
  [/\bgauntlets?\b/i, ['Gauntlets']],
  [/\bgloves?\b/i, ['Gloves']],
  [/\blight armor\b/i, ['Light Armor']],
  [/\bheavy armor\b/i, ['Heavy Armor']],
  [/\bcloak\b/i, ['Cloak']],
  [/\bboots\b/i, ['Heavy Footwear', 'Light Footwear']],
  [/\bany item\b/i, null],
];

/**
 * Esprit conseillé pour chaque emplacement d'une variante STC.
 * @returns {{slots: ({spirit:string, alt:string[], cond:string|null, why:string}|null)[], useIf: string|null, evaTarget: number|null}}
 */
export function spiritPlan(v) {
  const slots = v.slots.map(() => null);
  const types = v.slots.map((s) => (D.itemByName.get(s.name) || {}).type || '');
  let rest = null; let useIf = null; let evaTarget = null; const extraAlt = [];
  for (const raw of v.notes) {
    const n = raw.trim();
    const u = /use this (?:setup|build) if your .*? has (.+?)\.?$/i.exec(n);
    if (u) { useIf = u[1]; continue; }
    const eva = /(\d{2})% EVA/i.exec(n);
    if (eva && /griffin/i.test(n)) evaTarget = Number(eva[1]);
    // « Enchant the X with Titan (if promoted) » : un emplacement précis.
    const one = /enchant (?:the |any )?([a-z ]+?) with (titan)\b(.*)$/i.exec(n);
    if (one && !/remaining|other|rest|all|everything/i.test(one[1])) {
      const target = TARGETS.find(([re]) => re.test(one[1]));
      let idx = 0;
      if (target && target[1]) idx = types.findIndex((t) => target[1].includes(t));
      if (idx >= 0) slots[idx] = { spirit: spiritName('Titan'), alt: [], cond: /if promoted/i.test(one[3]) ? 'promoted' : null, why: 'titan' };
      continue;
    }
    // Règle pour les autres objets : « remaining / all other / all / everything / rest … with X (or Y) ».
    // « Go Griffin if you're building for an evasion based … » : Griffon en option.
    if (/^go griffin/i.test(n)) { extraAlt.push('Griffin Spirit'); continue; }
    const names = [...n.matchAll(spiritRe)].map((m) => spiritName(m[1])).filter(Boolean);
    if (!names.length || /\bif you go with\b|instead/i.test(n)) continue;
    if (/remaining|all other|all items|everything|the rest|enchant with|griffin (?:to|until|is)|or ouroboros/i.test(n)) {
      // Griffin « pour 95 % d'esquive en quêtes extrêmes, sinon Ouroboros » : Ouroboros par défaut, Griffin en option.
      const hasG = names.includes('Griffin Spirit');
      const main = hasG && names.length > 1 ? names.find((x) => x !== 'Griffin Spirit') : names[0];
      const alt = [...new Set(names.filter((x) => x !== main))];
      if (!rest) rest = { spirit: main, alt, cond: null, why: hasG ? 'griffin' : 'rest' };
      else rest.alt = [...new Set([...rest.alt, ...names.filter((x) => x !== rest.spirit)])];
    }
  }
  if (rest && extraAlt.length) { rest.alt = [...new Set([...rest.alt, ...extraAlt])]; rest.why = 'griffin'; }
  if (rest) slots.forEach((s, i) => { if (!s) slots[i] = { ...rest }; else if (s.cond === 'promoted') s.alt = [rest.spirit]; });
  return { slots, useIf, evaTarget };
}
