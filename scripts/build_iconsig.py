"""Signatures des icônes pour la lecture des captures d'écran (site/data/iconsig.json).

À relancer après scripts/build_icons.py (quand de nouvelles images sont ajoutées) :
    python scripts/build_iconsig.py

Pour chaque image utilisée par le site (objets, compétences, classes, éléments), on calcule une
miniature N×N : couleur moyenne de chaque case + opacité. Le navigateur compare ces miniatures aux
cases de la capture (site/js/scan/match.js). Aucune image du Fan Kit n'est redistribuée en plus :
seules ces moyennes de couleurs, calculées à partir des images déjà présentes dans site/img, sont écrites.
Dépendance : pillow.
"""
import base64
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
OUT = SITE / "data" / "iconsig.json"
N = 12  # doit correspondre à SIG_N dans site/js/scan/match.js
GROUPS = ["items", "skills", "classes", "elements"]


def signature(path: Path, trim: bool) -> str:
    im = Image.open(path).convert("RGBA")
    if trim:  # recadre sur la partie opaque, puis centre dans un carré
        bbox = im.getchannel("A").point(lambda a: 255 if a > 24 else 0).getbbox()
        if bbox:
            im = im.crop(bbox)
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    # Moyenne pondérée par l'opacité : on passe en alpha prémultiplié avant de réduire.
    small = sq.convert("RGBa").resize((N, N), Image.BOX).convert("RGBA")
    return base64.b64encode(small.tobytes()).decode("ascii")


def main() -> int:
    icons = json.loads((SITE / "data" / "icons.json").read_text(encoding="utf-8"))
    out = {"n": N, "paths": {}}
    missing = 0
    for group in GROUPS:
        for rel in sorted(set(icons.get(group, {}).values())):
            if rel in out["paths"]:
                continue
            p = SITE / rel
            if not p.exists():
                missing += 1
                continue
            # Objets : dessin détouré à recentrer ; compétences/classes/éléments : image entière.
            out["paths"][rel] = signature(p, trim=(group == "items"))
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"{len(out['paths'])} signatures -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} Ko)"
          + (f", {missing} images manquantes" if missing else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
