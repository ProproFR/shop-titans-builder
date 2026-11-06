// Rôles des classes (heuristique tirée des guides STC Tombdex / BiS, https://st-central.net/tombdex/ ).
// Chaque entrée = [classe de base, classe promue]. Les rôles sont indicatifs :
//  - tank : classes qui encaissent (DEF/HP ou évasion). Ranger/Warden = hybride ; Berserker/Jarl et Wanderer/Pathfinder = tank « évasion ».
//  - dps  : classes de dégâts. Spellblade/Spellknight ont l'élément « Any » : elles comptent pour tous les éléments.
//  - heal : Cleric/Bishop. Chronomancer/Fateweaver : support (listé à part, pas DPS « pur »).
import { D } from './data.js';

export const ROLE_PAIRS = {
  tank: [['Knight', 'Lord'], ['Soldier', 'Mercenary'], ['Barbarian', 'Chieftain'], ['Ranger', 'Warden'], ['Berserker', 'Jarl'],
    ['Dark Knight', 'Death Knight'], ['Wanderer', 'Pathfinder'], ['Velite', 'Praetorian']],
  dps: [['Monk', 'Grandmaster'], ['Ninja', 'Sensei'], ['Dancer', 'Acrobat'], ['Thief', 'Trickster'], ['Musketeer', 'Conquistador'],
    ['Samurai', 'Daimyo'], ['Mage', 'Archmage'], ['Sorcerer', 'Warlock'], ['Druid', 'Arch Druid'], ['Geomancer', 'Astramancer'], ['Spellblade', 'Spellknight']],
  support: [['Chronomancer', 'Fateweaver']],
  heal: [['Cleric', 'Bishop']],
};
/** Sous-types signalés dans l'interface. */
export const HYBRID = new Set(['Ranger', 'Warden']);
export const EVASION_TANK = new Set(['Berserker', 'Jarl', 'Wanderer', 'Pathfinder']);

const ROLE_OF = new Map();
for (const [role, pairs] of Object.entries(ROLE_PAIRS)) for (const [b, p] of pairs) { ROLE_OF.set(b, role); ROLE_OF.set(p, role); }

export const roleOf = (cls) => ROLE_OF.get(cls.name) || null;

/** Un élément de classe convient-il à l'élément voulu ? « Any » (Spellblade) convient à tous ; element vide = tous. */
export const elementMatches = (cls, element) => !element || element === 'All' || cls.element === element || cls.element === 'Any';

/**
 * Classes d'un rôle (promues d'abord ; base seulement si `includeBase`), filtrées par élément.
 * @returns {object[]} objets de classes de classes.json
 */
export function classesFor(role, element = '', { includeBase = false } = {}) {
  const out = [];
  for (const [b, p] of ROLE_PAIRS[role] || []) {
    const pc = D.classByName.get(p), bc = D.classByName.get(b);
    if (pc && elementMatches(pc, element)) out.push(pc);
    else if (bc && elementMatches(bc, element)) out.push(bc);
    if (includeBase && bc && pc && elementMatches(bc, element) && !out.includes(bc)) out.push(bc);
  }
  return out;
}

/** Classe de base d'une lignée (pour le lien #/builds?c=<id>). */
export const lineageId = (cls) => (cls.promotionOf ? D.classByName.get(cls.promotionOf).id : cls.id);
