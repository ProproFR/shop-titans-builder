"""Héberge les polices du site (Lilita One, Nunito 400/700/800) dans site/fonts/ au lieu de Google Fonts.

À lancer une seule fois, à la main (les polices sont sous licence SIL Open Font License, redistribution autorisée) :
    python scripts/self_host_fonts.py

Effets : télécharge les fichiers .woff2 (alphabets latin et latin étendu) dans site/fonts/,
réécrit site/css/fonts.css avec des @font-face locaux. Plus aucune requête vers Google au chargement du site.
Ensuite, mettre à jour la ligne « Google Fonts » de la page Mentions légales (site/js/i18n-legal.js, clés lg.t2).
Aucune dépendance : bibliothèque standard Python uniquement.
"""
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = ROOT / "site" / "fonts"
CSS_FILE = ROOT / "site" / "css" / "fonts.css"
GOOGLE_CSS = "https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@400;700;800&display=swap"
# Un navigateur récent reçoit du woff2 découpé par alphabet.
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
KEEP = {"latin", "latin-ext"}  # le site est en français et en anglais


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main() -> int:
    css = fetch(GOOGLE_CSS).decode("utf-8")
    # Blocs « /* latin */ @font-face { ... } »
    blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*\{[^}]*\})", css)
    if not blocks:
        print("Réponse inattendue de Google Fonts : aucun @font-face trouvé.", file=sys.stderr)
        return 1
    FONTS_DIR.mkdir(parents=True, exist_ok=True)
    saved = {}  # url -> nom local (Nunito est une police variable : même fichier pour 400/700/800)
    out = ["/* Polices hébergées dans le site (générées par scripts/self_host_fonts.py). Licence : SIL Open Font License 1.1. */"]
    for subset, block in blocks:
        if subset not in KEEP:
            continue
        family = re.search(r"font-family:\s*'([^']+)'", block).group(1)
        weight = re.search(r"font-weight:\s*(\d+)", block).group(1)
        url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
        if url not in saved:
            saved[url] = f"{family.lower().replace(' ', '-')}-{weight}-{subset}.woff2"
            (FONTS_DIR / saved[url]).write_bytes(fetch(url))
        name = saved[url]
        out.append(f"/* {subset} */\n" + block.replace(url, f"../fonts/{name}"))
        print(f"  {name}")
    CSS_FILE.write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"OK : {CSS_FILE.relative_to(ROOT)} réécrit, polices dans {FONTS_DIR.relative_to(ROOT)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
