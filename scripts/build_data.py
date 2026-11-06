"""Convertit le Shop Titans Data Spreadsheet (Kabam) en fichiers JSON pour le site.

Usage :
    python scripts/build_data.py            # télécharge la version en ligne
    python scripts/build_data.py --local FICHIER.xlsx

Sortie : site/data/*.json
"""
import argparse
import datetime as dt
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

import openpyxl

SHEET_ID = "1WLa7X8h3O0-aGKxeAlCL7bnN8-FhGd3t7pz2RCzSg8c"
EXPORT_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data"

ELEMENTS = ["Fire", "Water", "Air", "Earth", "Light", "Dark", "Gold"]
# Types d'objets qui ne sont pas de l'équipement de héros
NON_GEAR = {"Enchantment", "Runestone", "Moonstone"}


def clean(v):
    """Normalise une cellule : '---' et vide -> None, floats entiers -> int."""
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        if v in ("", "---"):
            return None
        return v
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def num(v):
    v = clean(v)
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return v
    m = re.search(r"-?\d+(\.\d+)?", str(v).replace(",", ""))
    return float(m.group()) if m else 0


def titlecase(v):
    """'SUN GOD'S TOMB' -> "Sun God's Tomb" (str.title met une majuscule après l'apostrophe)."""
    return " ".join(w[:1].upper() + w[1:].lower() for w in str(v).split())


def grid(ws):
    return [list(r) for r in ws.iter_rows(values_only=True)]


def cell(g, r, c):
    if 0 <= r < len(g) and 0 <= c < len(g[r]):
        return clean(g[r][c])
    return None


def split_list(v):
    v = clean(v)
    if not v:
        return []
    return [s.strip() for s in str(v).split(",") if s.strip()]


# ---------------------------------------------------------------- items
def origin(source, antique_tokens):
    """Provenance d'un plan :
    - "base"    : craft standard (débloqué par niveau ou parchemins de recherche), accessible à tous ;
    - "chest"   : obtenu en jeu dans un coffre de quête (clés) ou via le livre de collection ;
    - "antique" : sans pack, acheté à l'antiquaire avec des jetons gagnés en jeu (événements) ;
    - "paid"    : pack, offre ou Content Pass payant (peut revenir plus tard à l'antiquaire).
    """
    s = (source or "").lower()
    if re.search(r"pack|parck|pact|offer|content pass|bundle", s):
        return "paid"
    if re.search(r"chest|collection book", s):
        return "chest"
    if antique_tokens:
        return "antique"
    return "base"


def parse_items(ws):
    rows = grid(ws)
    h = [clean(x) for x in rows[0]]

    def col(name, start=0):
        return h.index(name, start)

    c = {k: col(k) for k in ["Name", "Type", "Unlock Prerequisite", "Tier", "Value",
                              "ATK", "DEF", "HP", "EVA", "CRIT", "Mana Shield",
                              "Elemental Affinity", "Spirit Affinity",
                              "Built-In Element", "Built-In Spirit",
                              "Research Scrolls", "Antique Tokens", "Airship Power"]}
    antique = next((i for i, x in enumerate(h) if x and "Is Antique" in str(x)), None)
    items = []
    for r in rows[1:]:
        name, typ = clean(r[c["Name"]]), clean(r[c["Type"]])
        if not name or not typ or typ in NON_GEAR:
            continue
        it = {
            "name": name,
            "type": typ,
            "tier": int(num(r[c["Tier"]])),
            "value": num(r[c["Value"]]),
            "atk": num(r[c["ATK"]]),
            "def": num(r[c["DEF"]]),
            "hp": num(r[c["HP"]]),
            "eva": num(r[c["EVA"]]),
            "crit": num(r[c["CRIT"]]),
            "ms": num(r[c["Mana Shield"]]),
            "elemAff": split_list(r[c["Elemental Affinity"]]),
            "spiritAff": split_list(r[c["Spirit Affinity"]]),
            "builtInElement": clean(r[c["Built-In Element"]]),
            "builtInSpirit": clean(r[c["Built-In Spirit"]]),
            "source": clean(r[c["Unlock Prerequisite"]]),
            "scrolls": int(num(r[c["Research Scrolls"]])),
            "antiqueTokens": int(num(r[c["Antique Tokens"]])),
            "airship": num(r[c["Airship Power"]]),
        }
        it["origin"] = origin(it["source"], it["antiqueTokens"])
        if antique is not None and clean(r[antique]):
            it["antique"] = str(clean(r[antique]))[:10]
        items.append(it)
    return items


# ---------------------------------------------------------------- classes
def parse_classes(ws):
    g = grid(ws)
    # En-têtes de groupe sur la 1re ligne : FIGHTER / ROGUE / SPELLCASTER CLASSES
    groups = {}
    for ci, v in enumerate(g[0]):
        v = clean(v)
        if v and "CLASSES" in str(v):
            groups[ci] = str(v).split()[0].title()

    def group_for(c):
        best = None
        for gc in sorted(groups):
            if gc <= c:
                best = groups[gc]
        return best

    classes = []
    for r in range(len(g)):
        for c in range(len(g[r])):
            if cell(g, r, c + 2) != "Prerequisite" or cell(g, r, c + 4) != "HP":
                continue
            raw = str(cell(g, r, c))
            name = raw.split("\n")[0].strip().title()
            promo = re.search(r"\(([\w ]+?) Class Promotion\)", raw)
            stats = {
                "hp": num(cell(g, r, c + 5)),
                "atk": num(cell(g, r + 1, c + 5)),
                "def": num(cell(g, r + 2, c + 5)),
                "eva": num(cell(g, r + 3, c + 5)),
                "crit": num(cell(g, r + 1, c + 3)),
                "critDmg": num(cell(g, r + 2, c + 3)),
                "threat": num(cell(g, r + 3, c + 3)),
            }
            element = cell(g, r + 2, c + 6)
            # La ligne "Equipment Slot 1..6" se trouve juste après les stats
            hr = r + 4
            while hr < r + 7 and cell(g, hr, c) != "Equipment Slot 1":
                hr += 1
            slots = [[] for _ in range(6)]
            unlocks = []
            rr = hr + 1
            while rr < len(g):
                first = cell(g, rr, c)
                if first and cell(g, rr, c + 2) == "Prerequisite":
                    break
                row = [cell(g, rr, c + k) for k in range(7)]
                if all(x is None for x in row):
                    break
                for k in range(6):
                    if row[k]:
                        slots[k].append(row[k])
                if row[6]:
                    unlocks.append(int(num(row[6])))
                rr += 1
            classes.append({
                "id": name.lower().replace(" ", "-"),
                "name": name,
                "group": group_for(c),
                "promotionOf": promo.group(1).title() if promo else None,
                "prerequisite": cell(g, r, c + 3),
                "element": element,
                **stats,
                "slots": slots,
                "skillUnlocks": unlocks,
            })
    # Lien inverse : classe de base -> promotion
    by_name = {k["name"]: k for k in classes}
    for k in classes:
        if k["promotionOf"] and k["promotionOf"] in by_name:
            by_name[k["promotionOf"]]["promotion"] = k["name"]
    return classes


# ---------------------------------------------------------------- champions
def parse_champions(ws):
    g = grid(ws)
    out = []
    for r in range(len(g)):
        for c in range(len(g[r])):
            if cell(g, r, c + 2) != "Prerequisite" or cell(g, r, c + 4) != "HP":
                continue
            out.append({
                "name": str(cell(g, r, c)).title(),
                "element": cell(g, r + 1, c + 1),
                "group": cell(g, r + 3, c + 1),
                "prerequisite": cell(g, r, c + 3),
                "hp": num(cell(g, r, c + 5)),
                "atk": num(cell(g, r + 1, c + 5)),
                "def": num(cell(g, r + 2, c + 5)),
                "eva": num(cell(g, r + 3, c + 5)),
                "crit": num(cell(g, r + 1, c + 3)),
                "threat": num(cell(g, r + 3, c + 3)),
            })
    return out


# ---------------------------------------------------------------- skills
def parse_skills(ws):
    rows = grid(ws)
    out = []
    family = None
    for r in rows[1:]:
        name, typ = clean(r[0]), clean(r[1])
        if not name or not typ:
            continue
        tier = int(num(r[2])) if clean(r[2]) else None
        # Les paliers T1..T4 d'une même compétence se suivent : le T1 donne le nom de famille
        if tier in (None, 1) or family is None:
            family = name
        out.append({
            "family": family,
            "name": name,
            "type": typ,
            "tier": tier,
            "rarity": clean(r[3]),
            "cost": clean(r[4]),
            "effect": clean(r[5]),
            "classes": split_list(r[6]),
            "promoted": clean(r[7]) == "Yes",
        })
    return out


# ---------------------------------------------------------------- enchantments
def parse_enchantments(ws):
    rows = grid(ws)
    out = []
    for r in rows[1:]:
        name, typ = clean(r[0]), clean(r[1])
        if not name or not typ:
            continue
        e = {"name": name, "type": typ}
        if typ == "Element":
            for i, el in enumerate(ELEMENTS):
                v = clean(r[2 + i]) if 2 + i < len(r) else None
                if v:
                    e["element"], e["value"] = el, num(v)
        out.append(e)
    return out


# ---------------------------------------------------------------- quests
def parse_quests(ws):
    g = grid(ws)
    out = []
    for r in range(len(g)):
        if cell(g, r, 5) == "Maximum Party Size":
            area = {
                "name": titlecase(cell(g, r, 1)),
                "partySize": int(num(cell(g, r, 7))),
                "levels": [],
            }
            hr = r + 2
            head = [cell(g, hr, k) for k in range(len(g[hr]))]
            rr = hr + 1
            while rr < len(g) and cell(g, rr, 1):
                row = {head[k]: cell(g, rr, k) for k in range(len(head)) if head[k]}
                area["levels"].append({
                    "difficulty": row.get("Difficulty"),
                    "type": row.get("Type"),
                    "minPower": num(row.get("Minimum Power")),
                    "monsterHp": num(row.get("Monster Health")),
                    "monsterDmg": num(row.get("Monster Base DMG")),
                    "monsterAoe": num(row.get("Monster AOE DMG")),
                    "barrier": row.get("Barrier Type"),
                    "barrierHp": num(row.get("Barrier Health")),
                })
                rr += 1
            out.append(area)
    return out


# ---------------------------------------------------------------- hero levels
def parse_hero_levels(ws):
    rows = grid(ws)
    return [{"level": int(num(r[0])), "maxTier": int(num(r[2]))}
            for r in rows[1:] if clean(r[0]) is not None]


def versions(ws):
    txt = " ".join(str(v) for row in ws.iter_rows(values_only=True) for v in row if v)
    client = re.search(r"client:\s*v?([\d.]+)", txt)
    sheet = re.search(r"spreadsheet:\s*v?([\d.]+)", txt)
    return (client.group(1) if client else None, sheet.group(1) if sheet else None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", help="Fichier .xlsx local au lieu du téléchargement")
    a = ap.parse_args()
    if a.local:
        src = a.local
    else:
        print("Téléchargement du sheet…", file=sys.stderr)
        with urllib.request.urlopen(EXPORT_URL, timeout=120) as resp:
            src = io.BytesIO(resp.read())
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)

    client, sheet = versions(wb["Home"])
    data = {
        "items": parse_items(wb["Blueprints"]),
        "classes": parse_classes(wb["Heroes"]),
        "champions": parse_champions(wb["Champions"]),
        "skills": parse_skills(wb["Skills"]),
        "enchantments": parse_enchantments(wb["Enchantments"]),
        "quests": parse_quests(wb["Quests"]),
        "heroLevels": parse_hero_levels(wb["Hero Levels"]),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    changed = False
    for k, v in data.items():
        f = OUT / f"{k}.json"
        txt = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
        if not f.exists() or f.read_text(encoding="utf-8") != txt:
            f.write_text(txt, encoding="utf-8")
            changed = True
        print(f"{k}: {len(v)}", file=sys.stderr)
    if not changed and (OUT / "meta.json").exists():
        print("Données inchangées.", file=sys.stderr)
        return
    meta = {
        "clientVersion": client,
        "sheetVersion": sheet,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": f"https://docs.google.com/spreadsheets/d/{SHEET_ID}",
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print(meta, file=sys.stderr)


if __name__ == "__main__":
    main()
