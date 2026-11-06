// Internationalisation FR/EN. Les noms d'objets, compétences et classes restent en anglais (noms du jeu).
const DICT = {
  fr: {
    'skip': 'Aller au contenu', 'lang.label': 'Langue', 'nav.aria': 'Navigation principale',
    'nav.builds': 'Builds', 'nav.optimizer': 'Optimiseur', 'nav.team': 'Équipe', 'nav.skills': 'Compétences', 'nav.about': 'À propos',
    'error.view': 'Erreur d\'affichage :', 'error.data': 'Impossible de charger les données', 'error.server': 'Lancez le site depuis un serveur HTTP (pas en file://).',
    'footer.versions': 'Version du jeu {game} · version du sheet {sheet} · données générées le {date}',
    'footer.disclaimer': 'Appli de fans gratuite, sans pub, non affiliée à Kabam. Calculs indicatifs.',
    'remove': 'Retirer', 'copyLink': 'Copier le lien de ce build', 'copied': 'Lien copié', 'copyManual': 'Copiez ce lien :',
    'stat.element': 'Élément', 'stat.group': 'Groupe', 'stat.critDmg': 'Dégâts crit.', 'stat.threat': 'Menace',
    'skills.class': 'Classe', 'skills.tier': 'Palier', 'skills.name': 'Compétence', 'skills.effect': 'Effet', 'skills.rarity': 'Rareté',

    'builds.title': 'Builds par classe', 'builds.intro': 'Fiche de chaque lignée (classe de base et promue) avec les builds recommandés par la communauté STC, affichés tels quels.',
    'builds.search': 'Rechercher une classe', 'builds.searchPh': 'Ex. Soldier, Mercenary…', 'builds.lineages': 'Lignées de classes',
    'builds.pick': 'Choisissez une classe pour afficher sa fiche.', 'builds.baseStats': 'Stats de base', 'builds.statsLvl1': 'Stats au niveau 1 de la classe.',
    'builds.prereq': 'Prérequis', 'builds.skillUnlocks': 'Déblocage des compétences', 'builds.lvl': 'niv.',
    'builds.slots': 'Types d\'équipement par emplacement', 'builds.slot': 'Emplacement', 'builds.innate': 'Compétence innée (tous les paliers)',
    'builds.stc': 'Builds recommandés (STC Hub)', 'builds.credit': 'Build recommandé par {authors}, licence {license}.', 'builds.creditSource': 'Source',
    'builds.updated': 'page mise à jour : {date}', 'builds.creditBottom': 'Builds de {authors} ({license}) — reproduits sans modification ni changement d\'ordre.',
    'builds.noBis': 'Aucun build STC pour cette lignée.', 'builds.variant': 'Variante', 'builds.tier': 'Palier', 'builds.item': 'Objet',
    'builds.affinity': 'Affinités', 'builds.enchants': 'Enchantements', 'builds.itemStats': 'Stats (sheet)', 'builds.unknownItem': 'Objet absent des données',
    'builds.toOptimizer': 'Ouvrir l\'optimiseur pour cette classe',

    'opt.title': 'Optimiseur d\'équipement', 'opt.intro': 'Trouve le meilleur objet par emplacement selon votre profil, le niveau du héros et ses compétences.',
    'opt.disclaimer': 'Calcul indicatif basé sur le sheet officiel : les enchantements et les esprits ne sont pas chiffrés. Les résultats ne remplacent pas un test en jeu.',
    'opt.class': 'Classe', 'opt.classPh': 'Rechercher une classe…', 'opt.level': 'Niveau du héros (1-50)', 'opt.tier': 'Palier max manuel (facultatif)',
    'opt.tierHint': 'Palier max utilisé : T{tier}', 'opt.quality': 'Qualité supposée', 'opt.profile': 'Profil', 'opt.balanced': 'Équilibré', 'opt.custom': 'Poids personnalisés',
    'opt.weights': 'Poids par statistique (EVA et CRIT en points de %)', 'opt.skills': 'Compétences du héros (jusqu\'à {n})', 'opt.addSkill': 'Ajouter une compétence',
    'opt.skillPh': 'Rechercher une compétence…', 'opt.pickClassFirst': 'Choisissez d\'abord une classe.', 'opt.filters': 'Filtres',
    'opt.excludePacks': 'Exclure les objets de pack / offre / antiques', 'opt.element': 'Affinité élémentaire souhaitée', 'opt.anyElement': 'Aucune préférence',
    'opt.result': 'Résultat pour {cls} (palier max T{tier})', 'opt.totals': 'Stats totales calculées', 'opt.totalsNote': 'Avec les meilleurs objets, qualité {q} et compétences choisies. Niveau de classe 1 pour les stats de base.',
    'opt.unparsed': 'Effets non reconnus (affichés tels quels)', 'opt.noModParsed': 'Aucun effet chiffrable reconnu pour ces compétences.',
    'opt.noItem': 'Aucun objet disponible avec ces filtres.', 'opt.affinityRelaxed': 'Aucun objet avec cette affinité : filtre ignoré pour cet emplacement.',
    'opt.best': 'Meilleur objet', 'opt.alts': 'Alternatives', 'opt.score': 'score', 'opt.toTeam': 'Envoyer vers le composeur d\'équipe',

    'team.title': 'Composeur d\'équipe', 'team.intro': 'Montez une équipe pour une quête : bonus de leader, probabilité de ciblage, couverture d\'élément.',
    'team.quest': 'Quête', 'team.difficulty': 'Difficulté', 'team.partySize': 'Taille du groupe', 'team.type': 'Type', 'team.normal': 'Normal',
    'team.minPower': 'Puissance min.', 'team.monsterHp': 'PV du monstre', 'team.monsterDmg': 'Dégâts du monstre', 'team.aoe': 'Dégâts de zone', 'team.barrier': 'Barrière', 'team.barrierHp': 'PV de barrière',
    'team.membersTitle': 'Membres du groupe', 'team.hero': 'Héros', 'team.champion': 'Champion', 'team.leaderTier': 'Palier du leader', 'team.addHero': 'Ajouter un héros', 'team.addChampion': 'Ajouter un champion',
    'team.import': 'Importer depuis un lien de l\'optimiseur (coller l\'adresse)', 'team.empty': 'Ajoutez des membres pour voir l\'analyse.',
    'team.leaderBonus': 'Bonus de leader', 'team.noChampion': 'Pas de champion : aucun bonus de leader.', 'team.applied': 'Appliqué au groupe :', 'team.noneParsed': 'Aucun bonus chiffrable reconnu.',
    'team.notApplied': 'Non appliqué :', 'team.members': 'Membres et ciblage', 'team.member': 'Membre', 'team.targetProb': 'Proba. d\'être ciblé',
    'team.statsNote': 'ATK/DEF/HP incluent les bonus de leader. Probabilité = menace / somme des menaces du groupe.',
    'team.coverage': 'Couverture d\'élément', 'team.coverageCount': '{n} membre(s) sur {total} avec un élément de la barrière :', 'team.noBarrier': 'Pas de barrière élémentaire sur ce niveau.',
    'team.warnings': 'Avertissements', 'team.noWarning': 'Rien à signaler.',
    'team.warnNoElement': 'Aucun membre ne correspond aux éléments de la barrière ({els}).', 'team.warnSize': 'Groupe incomplet : {n}/{total} membres.',
    'team.warnTank': 'Pas de Fighter dans le groupe : aucun tank évident.', 'team.warnHeal': 'Pas de soin évident (Cleric, Bishop, Druid, Arch Druid ou champion soigneur).',
    'team.warnStats': 'Certains héros n\'ont pas de stats ATK/HP saisies.',

    'sk.title': 'Évaluateur de compétences', 'sk.intro': 'Choisissez une classe et ses compétences pour obtenir une note par compétence et des suggestions de relance.',
    'sk.heuristic': 'Heuristique simple basée sur les effets du sheet, pas une vérité absolue.', 'sk.guides': 'Guides de skill rolling STC',
    'sk.role': 'Rôle', 'sk.roleRogue': 'DPS critique / évasion', 'sk.roleCaster': 'DPS ATK', 'sk.add': 'Ajouter une compétence (max {n})',
    'sk.owned': 'Vos compétences', 'sk.score': 'Note', 'sk.total': 'Total :', 'sk.reroll': 'À relancer en priorité : {name} (note {score}).',
    'sk.unparsed': 'Certains effets ne sont pas chiffrés par la note.', 'sk.noneOwned': 'Ajoutez des compétences pour les évaluer.',
    'sk.best': 'Meilleures compétences compatibles non possédées', 'sk.bestNote': 'Triées par rareté puis par note, au palier maximum.',

    'about.title': 'À propos', 'about.fan': 'Shop Titans Builder est une appli de fans, non affiliée à Kabam. Shop Titans est une marque de ses propriétaires.',
    'about.free': 'Application gratuite et sans publicité. Aucune donnée personnelle n\'est collectée ; seule la langue choisie est mémorisée dans votre navigateur.',
    'about.sources': 'Sources', 'about.sheet': 'Sheet officiel Kabam', 'about.sheetDesc': 'stats des classes, objets, compétences, quêtes.',
    'about.stc': 'formules (Combat Compendium) et guides de la communauté.', 'about.hub': 'builds recommandés par {authors}.', 'about.tldr': 'guides de skill rolling.',
    'about.license': 'Licence et crédits', 'about.licenseBis': 'Les builds recommandés sont sous licence {license} :', 'about.noModify': 'Ils sont reproduits sans modification, avec attribution, à usage non commercial.',
    'about.limits': 'Limites connues', 'about.l1': 'Les enchantements et esprits ne sont pas chiffrés dans les calculs.', 'about.l2': 'Les notes de compétences sont une heuristique.',
    'about.l3': 'Seuls les effets de compétence reconnus automatiquement sont appliqués ; les autres sont affichés tels quels.',
    'about.data': 'Données', 'about.dataDesc': 'Version du jeu {game}, version du sheet {sheet}, générées le {date}.',
  },
  en: {
    'skip': 'Skip to content', 'lang.label': 'Language', 'nav.aria': 'Main navigation',
    'nav.builds': 'Builds', 'nav.optimizer': 'Optimizer', 'nav.team': 'Team', 'nav.skills': 'Skills', 'nav.about': 'About',
    'error.view': 'Display error:', 'error.data': 'Could not load data', 'error.server': 'Serve the site over HTTP (not file://).',
    'footer.versions': 'Game version {game} · sheet version {sheet} · data generated {date}',
    'footer.disclaimer': 'Free fan app, no ads, not affiliated with Kabam. Indicative calculations.',
    'remove': 'Remove', 'copyLink': 'Copy link to this build', 'copied': 'Link copied', 'copyManual': 'Copy this link:',
    'stat.element': 'Element', 'stat.group': 'Group', 'stat.critDmg': 'Crit. damage', 'stat.threat': 'Threat',
    'skills.class': 'Class', 'skills.tier': 'Tier', 'skills.name': 'Skill', 'skills.effect': 'Effect', 'skills.rarity': 'Rarity',

    'builds.title': 'Class builds', 'builds.intro': 'Sheet for each lineage (base and promoted class) with the community builds from STC, shown unmodified.',
    'builds.search': 'Search a class', 'builds.searchPh': 'E.g. Soldier, Mercenary…', 'builds.lineages': 'Class lineages',
    'builds.pick': 'Pick a class to show its sheet.', 'builds.baseStats': 'Base stats', 'builds.statsLvl1': 'Stats at class level 1.',
    'builds.prereq': 'Prerequisite', 'builds.skillUnlocks': 'Skill unlock levels', 'builds.lvl': 'lvl',
    'builds.slots': 'Equipment types per slot', 'builds.slot': 'Slot', 'builds.innate': 'Innate skill (all tiers)',
    'builds.stc': 'Recommended builds (STC Hub)', 'builds.credit': 'Build recommended by {authors}, licence {license}.', 'builds.creditSource': 'Source',
    'builds.updated': 'page updated: {date}', 'builds.creditBottom': 'Builds by {authors} ({license}) — reproduced without changes or reordering.',
    'builds.noBis': 'No STC build for this lineage.', 'builds.variant': 'Variant', 'builds.tier': 'Tier', 'builds.item': 'Item',
    'builds.affinity': 'Affinities', 'builds.enchants': 'Enchantments', 'builds.itemStats': 'Stats (sheet)', 'builds.unknownItem': 'Item not in data',
    'builds.toOptimizer': 'Open the optimizer for this class',

    'opt.title': 'Equipment optimizer', 'opt.intro': 'Finds the best item per slot for your profile, hero level and skills.',
    'opt.disclaimer': 'Indicative calculation based on the official sheet: enchantments and spirits are not quantified. Results do not replace in-game testing.',
    'opt.class': 'Class', 'opt.classPh': 'Search a class…', 'opt.level': 'Hero level (1-50)', 'opt.tier': 'Manual max tier (optional)',
    'opt.tierHint': 'Max tier used: T{tier}', 'opt.quality': 'Assumed quality', 'opt.profile': 'Profile', 'opt.balanced': 'Balanced', 'opt.custom': 'Custom weights',
    'opt.weights': 'Weight per stat (EVA and CRIT in % points)', 'opt.skills': 'Hero skills (up to {n})', 'opt.addSkill': 'Add a skill',
    'opt.skillPh': 'Search a skill…', 'opt.pickClassFirst': 'Pick a class first.', 'opt.filters': 'Filters',
    'opt.excludePacks': 'Exclude pack / offer / antique items', 'opt.element': 'Preferred elemental affinity', 'opt.anyElement': 'No preference',
    'opt.result': 'Result for {cls} (max tier T{tier})', 'opt.totals': 'Computed total stats', 'opt.totalsNote': 'With the best items, {q} quality and chosen skills. Class level 1 base stats.',
    'opt.unparsed': 'Unrecognized effects (shown as is)', 'opt.noModParsed': 'No quantifiable effect recognized for these skills.',
    'opt.noItem': 'No item available with these filters.', 'opt.affinityRelaxed': 'No item with this affinity: filter ignored for this slot.',
    'opt.best': 'Best item', 'opt.alts': 'Alternatives', 'opt.score': 'score', 'opt.toTeam': 'Send to team composer',

    'team.title': 'Team composer', 'team.intro': 'Build a party for a quest: leader bonuses, targeting odds, element coverage.',
    'team.quest': 'Quest', 'team.difficulty': 'Difficulty', 'team.partySize': 'Party size', 'team.type': 'Type', 'team.normal': 'Normal',
    'team.minPower': 'Min. power', 'team.monsterHp': 'Monster HP', 'team.monsterDmg': 'Monster damage', 'team.aoe': 'AoE damage', 'team.barrier': 'Barrier', 'team.barrierHp': 'Barrier HP',
    'team.membersTitle': 'Party members', 'team.hero': 'Hero', 'team.champion': 'Champion', 'team.leaderTier': 'Leader tier', 'team.addHero': 'Add a hero', 'team.addChampion': 'Add a champion',
    'team.import': 'Import from an optimizer link (paste the address)', 'team.empty': 'Add members to see the analysis.',
    'team.leaderBonus': 'Leader bonuses', 'team.noChampion': 'No champion: no leader bonus.', 'team.applied': 'Applied to the party:', 'team.noneParsed': 'No quantifiable bonus recognized.',
    'team.notApplied': 'Not applied:', 'team.members': 'Members and targeting', 'team.member': 'Member', 'team.targetProb': 'Chance to be targeted',
    'team.statsNote': 'ATK/DEF/HP include leader bonuses. Probability = threat / sum of party threat.',
    'team.coverage': 'Element coverage', 'team.coverageCount': '{n} of {total} member(s) match a barrier element:', 'team.noBarrier': 'No elemental barrier on this level.',
    'team.warnings': 'Warnings', 'team.noWarning': 'Nothing to report.',
    'team.warnNoElement': 'No member matches the barrier elements ({els}).', 'team.warnSize': 'Incomplete party: {n}/{total} members.',
    'team.warnTank': 'No Fighter in the party: no obvious tank.', 'team.warnHeal': 'No obvious healing (Cleric, Bishop, Druid, Arch Druid or healing champion).',
    'team.warnStats': 'Some heroes have no ATK/HP entered.',

    'sk.title': 'Skill evaluator', 'sk.intro': 'Pick a class and its skills to get a score per skill and reroll suggestions.',
    'sk.heuristic': 'Simple heuristic based on sheet effects, not absolute truth.', 'sk.guides': 'STC skill rolling guides',
    'sk.role': 'Role', 'sk.roleRogue': 'Crit / evasion DPS', 'sk.roleCaster': 'ATK DPS', 'sk.add': 'Add a skill (max {n})',
    'sk.owned': 'Your skills', 'sk.score': 'Score', 'sk.total': 'Total:', 'sk.reroll': 'Reroll first: {name} (score {score}).',
    'sk.unparsed': 'Some effects are not quantified by the score.', 'sk.noneOwned': 'Add skills to evaluate them.',
    'sk.best': 'Best compatible skills you do not own', 'sk.bestNote': 'Sorted by rarity then score, at maximum tier.',

    'about.title': 'About', 'about.fan': 'Shop Titans Builder is a fan app, not affiliated with Kabam. Shop Titans is a trademark of its owners.',
    'about.free': 'Free app, no ads. No personal data is collected; only your chosen language is stored in your browser.',
    'about.sources': 'Sources', 'about.sheet': 'Official Kabam sheet', 'about.sheetDesc': 'class, item, skill and quest stats.',
    'about.stc': 'formulas (Combat Compendium) and community guides.', 'about.hub': 'recommended builds by {authors}.', 'about.tldr': 'skill rolling guides.',
    'about.license': 'Licence and credits', 'about.licenseBis': 'Recommended builds are licensed {license}:', 'about.noModify': 'They are reproduced unmodified, with attribution, for non-commercial use.',
    'about.limits': 'Known limits', 'about.l1': 'Enchantments and spirits are not quantified in calculations.', 'about.l2': 'Skill scores are a heuristic.',
    'about.l3': 'Only automatically recognized skill effects are applied; others are shown as is.',
    'about.data': 'Data', 'about.dataDesc': 'Game version {game}, sheet version {sheet}, generated {date}.',
  },
};

let lang = 'fr';
try { const s = localStorage.getItem('stb-lang'); if (s === 'fr' || s === 'en') lang = s; } catch { /* ignoré */ }
const listeners = [];

export const getLang = () => lang;
export function setLang(l) {
  if (l !== 'fr' && l !== 'en') return;
  lang = l;
  try { localStorage.setItem('stb-lang', l); } catch { /* ignoré */ }
  listeners.forEach((f) => f());
}
export const onLangChange = (f) => listeners.push(f);

export function t(key, vars) {
  let s = DICT[lang][key] ?? DICT.fr[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}
