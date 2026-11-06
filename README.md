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
| [Shop Titans Central](https://st-central.net) | Formules de combat ([Combat Compendium](https://st-central.net/combat-compendium/)), guides | CC BY-NC-ND 4.0 |
| Fan Kit officiel (lien en bas de [playshoptitans.com](https://playshoptitans.com)) | Images : objets, compétences, classes, stats, éléments | © Kabam : projets de fans autorisés, pas de redistribution du kit ni de monétisation |
| [Blueprint Browser officiel](https://playshoptitans.com/blueprints/featured/new) | Correspondance nom d'objet ↔ nom du fichier image (`site/data/name2uid.json`) | © Kabam |

Les builds STC sont reproduits **sans modification**, avec attribution et lien, dans une appli **non commerciale**
à usage personnel et pour une guilde (lien partagé en privé, site non référencé).

## Structure

```
scripts/build_data.py      # sheet officiel (.xlsx) -> site/data/*.json
scripts/scrape_stc_bis.py  # page BiS de STC Hub -> site/data/bis.json
site/                      # site statique (HTML/CSS/JS, aucune étape de build)
site/data/                 # données générées
.github/workflows/         # mise à jour hebdomadaire + déploiement GitHub Pages
```

## Mettre à jour les données à la main

```bash
pip install openpyxl
python scripts/build_data.py          # télécharge la dernière version du sheet
python scripts/scrape_stc_bis.py      # récupère les derniers builds STC
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
