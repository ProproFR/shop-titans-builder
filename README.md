# Shop Titans Builder

Application web gratuite pour construire les meilleurs builds de héros dans **Shop Titans** :
fiches build par classe, optimiseur d'équipement, composeur d'équipe et évaluateur de compétences.
Interface en français et en anglais.

> Appli de fans, non affiliée à Kabam. Gratuite, sans publicité, sans compte.

## Sources de données

| Source | Utilisation | Licence |
|---|---|---|
| [Shop Titans Data Spreadsheet](https://docs.google.com/spreadsheets/d/1WLa7X8h3O0-aGKxeAlCL7bnN8-FhGd3t7pz2RCzSg8c) (officiel, Kabam) | Objets, classes, compétences, champions, quêtes | © Kabam Games, Inc. |
| [STC Hub – Best In Slot](https://stcentral-hub.github.io/tools/bis-heroes/) (Nerilea, Reiga & Yuki) | Builds recommandés, affichés tels quels avec crédit | CC BY-NC-ND 4.0 |
| [STC Hub – Main Quests](https://stcentral-hub.github.io/posts/main-quests/) et [Event Quests](https://stcentral-hub.github.io/posts/event-quests/) | Seuils de défense, PV/ATK des monstres, barrières (quêtes principales et Tour des Titans) | CC BY-NC-ND 4.0 |
| [Shop Titans Central](https://st-central.net) | Formules de combat ([Combat Compendium](https://st-central.net/combat-compendium/)), modificateurs de la Tour, guides, rosters exemples | CC BY-NC-ND 4.0 |
| Fan Kit officiel (lien en bas de [playshoptitans.com](https://playshoptitans.com)) | Images : objets, compétences, classes, stats, éléments | © Kabam : projets de fans autorisés, pas de redistribution du kit ni de monétisation |
| [Blueprint Browser officiel](https://playshoptitans.com/blueprints/featured/new) | Correspondance nom d'objet ↔ nom du fichier image (`site/data/name2uid.json`) | © Kabam |

Les builds STC sont reproduits **sans modification**, avec attribution et lien, dans une appli **non commerciale**
à usage personnel et pour une guilde (lien partagé en privé, site non référencé).

## Structure

```
scripts/build_data.py      # sheet officiel (.xlsx) -> site/data/*.json
scripts/scrape_stc_bis.py  # page BiS de STC Hub -> site/data/bis.json
scripts/scrape_stc_quests.py  # quêtes principales + Tour (STC Hub) -> questcaps.json, tower.json
scripts/build_icons.py     # images du Fan Kit -> site/img + icons.json (manuel)
scripts/self_host_fonts.py # polices Google -> site/fonts + css/fonts.css (facultatif, une fois)
scripts/build_iconsig.py   # miniatures des icônes -> site/data/iconsig.json (import par capture)
site/                      # site statique (HTML/CSS/JS, aucune étape de build)
site/data/                 # données générées
.github/workflows/         # mise à jour hebdomadaire + déploiement GitHub Pages
```

## Mettre à jour les données à la main

```bash
pip install openpyxl
python scripts/build_data.py          # télécharge la dernière version du sheet
python scripts/scrape_stc_bis.py      # récupère les derniers builds STC
python scripts/scrape_stc_quests.py   # quêtes principales et Tour des Titans
```

Avec un fichier téléchargé : `python scripts/build_data.py --local "Shop Titans Data Spreadsheet ….xlsx"`.

### Images (à relancer à la main quand de nouveaux objets sortent)

Le Fan Kit n'est pas dans le dépôt (seules les images utilisées, en WebP, sont dans `site/img/`).
Télécharger le zip depuis le lien « Game Assets Fan Kit » en bas de playshoptitans.com, puis :

```bash
pip install openpyxl pillow
python scripts/build_icons.py --fankit "chemin/vers/Fan Kit Assets (Shop Titans).zip"
```

Les objets absents du kit (collaborations sous licence : Avatar, Jumanji…) affichent l'icône de leur type.

### Import d'un héros par capture d'écran (`#/scan`)

La page « Importer » lit une capture de la fiche d'un héros (onglet Infos) directement dans le navigateur :
classe, compétences (+ palier), objets, qualité, élément, niveau et stats. L'utilisateur valide, puis le héros
est enregistré. Les icônes sont reconnues en comparant des miniatures 12×12. Le navigateur les calcule lui-même à partir de
`site/img` à la première analyse (quelques centaines d'images), puis les garde en mémoire. Facultatif, pour
aller plus vite : précalculer toutes les miniatures dans `site/data/iconsig.json` (à refaire après `build_icons.py`) :

```bash
python scripts/build_iconsig.py
```

Code : `site/js/scan/` (layout = zones de l'écran, ocr = chiffres, match = icônes, analyze = enchaînement).
Calibré sur des captures PC (Steam) et iPhone (portrait).

### Polices hébergées dans le site (recommandé)

Par défaut, `site/css/fonts.css` charge Lilita One et Nunito depuis Google Fonts (l'adresse IP des visiteurs
est alors transmise à Google). Pour supprimer cet appel à un tiers :

```bash
python scripts/self_host_fonts.py
```

Puis adapter la ligne « Google Fonts » de la page Mentions légales (`site/js/i18n-legal.js`, clés `lg.t2`).

## Mentions légales

Page `#/legal` (lien en pied de page) : éditeur anonyme (particulier, art. 6-III-2 LCEN), hébergeur GitHub,
stockage local, services tiers, propriété intellectuelle, accessibilité, bouton « Effacer mes données locales ».
Pour afficher un moyen de contact, renseigner `CONTACT` en haut de `site/js/views/legal.js`.
Le tableau Google Sheets de la page Éléments n'est chargé qu'après un clic (Google peut y déposer des cookies).

## Lancer en local

```bash
cd site
python -m http.server 8000
```

Puis ouvrir http://localhost:8000.

## Mettre en ligne gratuitement (GitHub Pages)

1. Créer un dépôt GitHub public et y pousser ce dossier (branche `main`).
2. Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
3. Le workflow `update-data.yml` déploie le site à chaque push, et chaque lundi il
   retélécharge le sheet officiel et les builds STC, commit les changements et redéploie.
   Il peut aussi être lancé à la main (onglet **Actions → Run workflow**).

## Limites connues

- Les stats de base des classes sont celles du niveau 1 (le sheet ne donne pas la progression par niveau).
- Les bonus chiffrés des enchantements (éléments/esprits) par tier d'objet ne sont pas dans le sheet : l'optimiseur les ignore.
- Les seuils de défense par quête (page « Quest Data » de STC) ne sont pas encore intégrés.
