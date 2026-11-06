"""Récupère les données de la Tour des Titans publiées par STC Hub (page « Event Quests »).

Source : https://stcentral-hub.github.io/posts/event-quests/ — STC Hub, licence CC BY-NC-ND 4.0.
Les valeurs sont reprises telles quelles (aucune modification), avec crédit et lien.

Pour chaque tour (Alpha → Terror) et chaque étage : puissance minimale, PV et ATK du monstre,
dégâts de zone (AoE), seuils de défense pour 50 %, 70 % et 75 % de réduction des dégâts.

Usage : python scripts/scrape_stc_tower.py [--local fichier.html]
Sortie : site/data/tower.json
"""
import argparse
import datetime as dt
import html
import json
import re
import urllib.request
from pathlib import Path

URL = "https://stcentral-hub.github.io/posts/event-quests/"
OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "tower.json"


def num(s):
    s = html.unescape(s).replace(",", "").replace("%", "").strip()
    try:
        return float(s) if "." in s else int(s)
    except ValueError:
        return None


def ps(block):
    return [html.unescape(re.sub(r"<[^>]+>", "", p)).strip() for p in re.findall(r"<p[^>]*>(.*?)</p>", block, re.S)]


def parse_floor(block):
    banner = re.search(r'quest-difficulty-banner title=("?)([^">]+)\1', block)
    number = re.search(r"banner-image-wrapper-tot\"><img[^>]*><p>(\d+)</p>", block)
    boss_name = re.search(r"<h3[^>]*>(.*?)</h3>", block, re.S)
    f = {
        "floor": int(number.group(1)) if number else None,
        "boss": bool(banner and banner.group(2) != "Monster encounter"),
    }
    if boss_name:
        f["bossName"] = html.unescape(re.sub(r"<[^>]+>", "", boss_name.group(1))).strip()
    for title, key in (("Minimum Power", "minPower"), ("HP", "hp"), ("ATK", "atk"), ("AoE", "aoe")):
        m = re.search(r'title=("?)' + re.escape(title) + r'\1>(.*?)</div>', block, re.S)
        if m:
            vals = [num(v) for v in ps(m.group(2)) if num(v) is not None]
            f[key] = vals[-1] if vals else None
    caps = {}
    for pct in ("50", "70", "75"):
        m = re.search(r"def-wrapper-stat-" + pct + r">(.*?)</div>", block, re.S)
        if m:
            vals = ps(m.group(1))
            caps[pct] = num(vals[-1]) if vals else None
    f["defCaps"] = caps
    return f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local")
    a = ap.parse_args()
    if a.local:
        page = Path(a.local).read_text(encoding="utf-8")
    else:
        req = urllib.request.Request(URL, headers={"User-Agent": "ShopTitansBuilder/1.0 (data refresh)"})
        page = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")

    start = page.find(">Tower Of Titans<")
    section = page[start:]
    end = section.find("Donate")
    section = section[:end] if end > 0 else section
    towers = []
    parts = re.split(r"<h1 class='st-text-outline no-margin'>([^<]+ Tower)</h1>", section)
    for i in range(1, len(parts), 2):
        name, body = parts[i].strip(), parts[i + 1]
        party = re.search(r"Party Size</p><h3[^>]*>(\d+)</h3>", body)
        floors = [parse_floor(b) for b in re.split(r"<div class=quest-difficulty>", body)[1:]]
        floors = [f for f in floors if f.get("floor")]
        towers.append({
            "name": name,
            "difficulty": name.replace(" Tower", ""),
            "partySize": int(party.group(1)) if party else None,
            "floors": floors,
        })

    data = {
        "source": URL,
        "authors": "STC Hub",
        "license": "CC BY-NC-ND 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
        "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "towers": towers,
    }
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8"))
        if old.get("towers") == towers:
            print("Données de la Tour inchangées.")
            return
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(towers)} tours, {sum(len(t['floors']) for t in towers)} étages -> {OUT}")


if __name__ == "__main__":
    main()
