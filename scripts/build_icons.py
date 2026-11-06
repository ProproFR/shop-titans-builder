"""Extrait du Fan Kit officiel Kabam les images utilisées par le site.

Le Fan Kit (« Fan Kit Assets (Shop Titans).zip ») est lié depuis le pied de page de
https://playshoptitans.com. Licence (README du kit) : usage autorisé pour des projets
de fans Shop Titans ; interdit de redistribuer le kit ou de monétiser le projet.
Ce script ne copie que les images affichées par le site, redimensionnées en WebP.

Correspondance nom d'objet -> identifiant interne (uid) = nom du fichier image :
lue dans le Blueprint Browser officiel public (https://playshoptitans.com/blueprints/...).

Usage :
    python scripts/build_icons.py --fankit "chemin/Fan Kit Assets (Shop Titans).zip"
    python scripts/build_icons.py --fankit ... --refresh-names   # relit les noms (nouveaux objets)

Sortie : site/img/** (WebP) + site/data/icons.json
"""
import argparse
import io
import json
import re
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "site" / "data"
IMG = ROOT / "site" / "img"
PREFIX = "Fan Kit Assets (Shop Titans)/"
UA = {"User-Agent": "ShopTitansBuilder/1.0 (fan tool; blueprint name lookup)"}

# Catégories du Blueprint Browser officiel
CATEGORIES = (
    [f"weapons/{c}" for c in "w2 wa wb wc wd wg wh wi wm wp ws wt ww wy".split()]
    + [f"armor/{c}" for c in "ah al am bh bl gh gl hh hk hl hm".split()]
    + [f"accessories/{c}" for c in "fd fm uh up us xa xc xf xi xq xr xs xx".split()]
)

# Type d'objet du sheet -> icône générique du kit (Item Types/icon_global_item_<x>_big.png)
TYPE_ICON = {
    "Sword": "sword", "Axe": "axe", "Dagger": "dagger", "Mace": "mace", "Spear": "spear",
    "Bow": "bow", "Wand": "wand", "Staff": "staff", "Gun": "gun", "Crossbow": "crossbow",
    "Heavy Armor": "armorheavy", "Light Armor": "armormedium", "Clothes": "armorlight",
    "Helmet": "helmet", "Rogue Hat": "roguehat", "Magician Hat": "hat",
    "Gauntlets": "gauntlets", "Gloves": "bracers", "Heavy Footwear": "boots",
    "Light Footwear": "shoes", "Herbal Medicine": "herb", "Potion": "potion",
    "Spell": "scrolls", "Shield": "shield", "Ring": "ring", "Amulet": "amulet",
    "Meal": "meal", "Dessert": "dessert", "Cloak": "cloak", "Instrument": "instrument",
    "Dual Wield": "dualwield", "Quiver": "quiver", "Catalyst": "catalyst", "Idol": "idol",
    "Scythe": "scythe", "Mask": "mask", "Familiar": "familiar", "Aurasong": "aurastone",
}

# Compétences de héros dont l'icône du kit porte un autre nom (déduit des effets)
HERO_SKILL_ICON = {
    "Throw Daggers": "throwing", "Shadow Embrace": "shadows", "Whirlwind Attack": "whirlwind",
    "Dance of Blades": "bladedance", "Cloak & Dagger": "cloakndagger", "Magic Shield": "manashield",
    "Destructive Strikes": "megapunch",
    "Maintenance": "s_break", "Extended Warranty": "s_superbreak", "Fast Learner": "s_xp",
    "Super Genius": "s_megaxp", "Fast Healer": "s_hpregen", "Survivor": "s_superhpregen",
    "Toughness": "s_hphpregen", "Sturdy": "s_hp", "Impervious": "s_megahp",
    "Acrobatics": "s_evasion", "Blurred Movement": "s_megaevasion",
    "Extra Conditioning": "s_defevasion", "Deception": "s_evasioncrit", "Eagle Eyes": "s_crit",
    "All Natural": "s_megacrit", "Deadly Criticals": "s_critmult", "Death Dealer": "s_megacritmult",
    "Telling Blows": "s_critcritmult", "Warlord": "s_warmaster", "Marksman": "s_snipermaster",
    "Adept": "s_arcanemaster",
}

QUEST_ICON = {
    "Howling Woods": "forest", "Aurora Caves": "grotto", "Whispering Bog": "swamp",
    "Barren Wastes": "desert", "Sun God's Tomb": "pyramid", "Chronos Ruins": "ruins",
    "Haunted Castle": "castle", "Sunken Temple": "coralcity", "Bleakspire Peak": "peak",
    "Cinderlake Volcano": "volcano", "Void Dimension": "rift", "Elysium": "elysium",
    "Ancient Jungle": "jurassic", "Meteor Zone": "space", "Lost City Of Gold": "goldcity",
}

# Classes dont l'icône porte le nom interne du jeu
CLASS_ICON = {"Samurai": "swordmaster", "Grandmaster": "mastermonk",
              "Spellblade": "redmage", "Fateweaver": "timekeeper"}

STATS = ["attack", "defense", "health", "evasion", "critchance", "power", "maskhealth"]
ELEMENTS = ["fire", "water", "air", "earth", "light", "dark", "gold", "all"]
QUALITIES = ["common", "uncommon", "flawless", "epic", "legendary"]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def fetch_name2uid():
    m = {}
    for cat in CATEGORIES:
        req = urllib.request.Request(f"https://playshoptitans.com/blueprints/{cat}", headers=UA)
        page = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
        nd = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', page, re.S)
        pp = json.loads(nd.group(1))["props"]["pageProps"]
        for it in pp.get("items", []):
            name = pp["texts"].get(it["uid"] + "_name")
            if name:
                m[name] = it["uid"]
        print(f"  {cat}: {len(m)} noms", file=sys.stderr)
        time.sleep(1)  # rester poli avec le site officiel
    return m


class Kit:
    def __init__(self, path):
        self.z = zipfile.ZipFile(path)
        self.files = {n[len(PREFIX):]: n for n in self.z.namelist() if n.lower().endswith(".png")}
        self.by_stem = {}
        for rel in self.files:
            self.by_stem.setdefault(Path(rel).stem.lower(), rel)
        self.written = 0

    def find(self, folder, stem):
        rel = f"{folder}/{stem}.png"
        if rel in self.files:
            return rel
        cand = self.by_stem.get(stem.lower())
        return cand if cand and cand.startswith(folder.split("/")[0]) else None

    def export(self, rel, out_rel, size):
        """Copie une image du kit en WebP carré `size` px. Retourne le chemin servi par le site."""
        out = IMG / (out_rel + ".webp")
        if not out.exists():
            out.parent.mkdir(parents=True, exist_ok=True)
            im = Image.open(io.BytesIO(self.z.read(self.files[rel]))).convert("RGBA")
            im.thumbnail((size, size), Image.LANCZOS)
            im.save(out, "WEBP", quality=85, method=6)
            self.written += 1
        return "img/" + out_rel + ".webp"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fankit", required=True)
    ap.add_argument("--refresh-names", action="store_true",
                    help="relire le Blueprint Browser officiel (sinon : site/data/name2uid.json)")
    a = ap.parse_args()

    n2u_path = DATA / "name2uid.json"
    if not a.refresh_names and n2u_path.exists():
        name2uid = json.loads(n2u_path.read_text(encoding="utf-8"))
    else:
        print("Lecture du Blueprint Browser officiel…", file=sys.stderr)
        name2uid = fetch_name2uid()
        n2u_path.write_text(json.dumps(name2uid, ensure_ascii=False, sort_keys=True, indent=0), encoding="utf-8")

    kit = Kit(a.fankit)
    items = json.loads((DATA / "items.json").read_text(encoding="utf-8"))
    skills = json.loads((DATA / "skills.json").read_text(encoding="utf-8"))
    classes = json.loads((DATA / "classes.json").read_text(encoding="utf-8"))
    champions = json.loads((DATA / "champions.json").read_text(encoding="utf-8"))
    quests = json.loads((DATA / "quests.json").read_text(encoding="utf-8"))
    icons = {"items": {}, "types": {}, "skills": {}, "classes": {}, "champions": {},
             "elements": {}, "stats": {}, "quality": {}, "quests": {}, "ui": {}}
    missing = {k: [] for k in icons}

    # Icônes génériques par type d'objet (servent aussi de repli)
    for typ, stem in TYPE_ICON.items():
        rel = kit.find("Item Types", f"icon_global_item_{stem}_big")
        if rel:
            icons["types"][typ] = kit.export(rel, f"types/{stem}", 64)

    # Objets
    for it in items:
        uid = name2uid.get(it["name"])
        rel = kit.find("Items", uid) if uid else None
        if rel:
            icons["items"][it["name"]] = kit.export(rel, f"items/{uid}", 96)
        else:
            missing["items"].append(it["name"])

    # Compétences
    for s in skills:
        rel = None
        t = s["type"]
        if t == "Hero":
            alias = HERO_SKILL_ICON.get(s["family"])
            if not alias and s["family"].endswith(" Master"):
                alias = "s_" + norm(s["family"][:-7]) + "master"  # Sword Master -> s_swordmaster
            if alias:
                stem = ("icon_global_skill_" if alias.startswith("s_") else "icon_global_skill_p_") + alias
                rel = kit.find("Skills/Hero", stem)
            for nm in (s["name"], s["family"]):
                rel = rel or kit.find("Skills/Hero", "icon_global_skill_p_" + norm(nm))
        elif t == "Innate" and s["classes"]:
            k = next((c for c in classes if c["name"] == s["classes"][0]), None)
            base = (k.get("promotionOf") or k["name"]) if k else s["classes"][0]
            rel = kit.find("Skills/Innates", "icon_global_skill_c_" + CLASS_ICON.get(base, norm(base)))
        elif t == "Leader" and s["classes"] and s["tier"]:
            rel = kit.find("Skills/Leader", f"icon_global_skill_hero_{norm(s['classes'][0])}leader{s['tier']}")
        elif t == "Enchantment":
            rel = kit.find("Skills/Enchantment", "icon_global_skill_i_" + norm(s["name"].split()[0]))
        if rel:
            icons["skills"][s["name"]] = kit.export(rel, "skills/" + Path(rel).stem.replace("icon_global_skill_", ""), 64)
        elif t in ("Hero", "Innate", "Leader"):
            missing["skills"].append(f"{t}: {s['name']}")

    # Classes (icône 128 du kit)
    for c in classes:
        stem = f"icon_global_class_{CLASS_ICON.get(c['name'], norm(c['name']))}_128"
        rel = next((r for r in kit.files if r.startswith("Hero Classes/") and Path(r).stem.lower() == stem), None)
        if rel:
            icons["classes"][c["name"]] = kit.export(rel, f"classes/{norm(c['name'])}", 96)
        else:
            missing["classes"].append(c["name"])

    # Champions (portrait)
    for ch in champions:
        n = norm(ch["name"])
        rel = kit.find("Collection Cards/Champions", f"cc_{n}")
        if rel:
            icons["champions"][ch["name"]] = kit.export(rel, f"champions/{n}", 128)
        else:
            missing["champions"].append(ch["name"])

    for el in ELEMENTS:
        rel = kit.find("Elements/Affinity", f"icon_global_element_{el}")
        if rel:
            icons["elements"][el.title()] = kit.export(rel, f"elements/{el}", 48)
    for st in STATS:
        rel = kit.find("Stat Indicators/Heroes", f"icon_global_{st}")
        if rel:
            icons["stats"][st] = kit.export(rel, f"stats/{st}", 48)
    for q in QUALITIES:
        rel = kit.find("Quality Indicators", f"icon_global_quality_{q}")
        if rel:
            icons["quality"][q] = kit.export(rel, f"quality/{q}", 48)
    for qn, stem in QUEST_ICON.items():
        rel = next((r for r in kit.files if r.startswith("Quest Areas/Quests/") and stem in Path(r).stem.lower()), None)
        if rel and any(q["name"] == qn for q in quests):
            icons["quests"][qn] = kit.export(rel, f"quests/{stem}", 96)

    ui = {
        "logo": ("Logos/ShopTitans_AppLogo.png", 128),
        "heroes": ("Misc Icons/icon_global_heroes.png", 64),
        "quest": ("Misc Icons/icon_global_quest.png", 64),
        "champion": ("Misc Icons/icon_global_champion_big.png", 64),
        "skilltree": ("Misc Icons/icon_global_skilltree.png", 64),
        "craft": ("Misc Icons/icon_global_craft.png", 64),
        "help": ("Misc Icons/icon_global_help.png", 64),
        "settings": ("Misc Icons/icon_global_settings.png", 64),
        "antique": ("Currencies/icon_global_antique_shard.png", 48),
        "gem": ("Currencies/icon_global_gem.png", 48),
        "gold": ("Currencies/icon_global_gold.png", 48),
        "tier": ("Misc Icons/icon_global_level_item_s_r.png", 48),
        "breakchance": ("Misc Icons/icon_global_break_chance_reduction.png", 48),
        "background": ("Backgrounds/Tier 16 - Space/background_tier16_landscape.jpg", 1600),
    }
    for key, (rel, size) in ui.items():
        if rel in kit.files:
            icons["ui"][key] = kit.export(rel, f"ui/{key}", size)
        elif rel.endswith(".jpg") and PREFIX + rel in kit.z.namelist():
            out = IMG / "ui" / f"{key}.webp"
            if not out.exists():
                out.parent.mkdir(parents=True, exist_ok=True)
                im = Image.open(io.BytesIO(kit.z.read(PREFIX + rel))).convert("RGB")
                im.thumbnail((size, size), Image.LANCZOS)
                im.save(out, "WEBP", quality=70, method=6)
            icons["ui"][key] = f"img/ui/{key}.webp"

    (DATA / "icons.json").write_text(json.dumps(icons, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for k, v in icons.items():
        print(f"{k}: {len(v)} images" + (f", {len(missing[k])} sans image" if missing[k] else ""), file=sys.stderr)
    for k, v in missing.items():
        if v:
            print(f"  sans image ({k}) : {', '.join(v[:15])}{' …' if len(v) > 15 else ''}", file=sys.stderr)
    print(f"{kit.written} fichiers écrits dans {IMG}", file=sys.stderr)


if __name__ == "__main__":
    main()
