"""Récupère les données de quêtes publiées par STC Hub (pages « Event Quests » et « Main Quests »).

Sources (STC Hub, licence CC BY-NC-ND 4.0, valeurs reprises telles quelles avec crédit) :
  https://stcentral-hub.github.io/posts/event-quests/  -> Tour des Titans (6 tours × 30 étages)
  https://stcentral-hub.github.io/posts/main-quests/   -> quêtes principales (zones + boss)

Par étage / difficulté : puissance minimale, PV et ATK du monstre, dégâts de zone (AoE),
barrière élémentaire et ses PV, seuils de défense pour 50 %, 70 % et 75 % de réduction.

Usage : python scripts/scrape_stc_quests.py [--local-tower f.html] [--local-main f.html]
Sortie : site/data/tower.json, site/data/questcaps.json
"""
import argparse
import datetime as dt
import html
import json
import re
import urllib.request
from pathlib import Path

URL = "https://stcentral-hub.github.io/posts/event-quests/"
MAIN_URL = "https://stcentral-hub.github.io/posts/main-quests/"
DATA = Path(__file__).resolve().parent.parent / "site" / "data"
OUT = DATA / "tower.json"
MAIN_OUT = DATA / "questcaps.json"


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
    bar = re.search(r'title="?(\w+) Barrier HP"?>(.*?)</div>', block, re.S)
    if bar:
        vals = [num(v) for v in ps(bar.group(2)) if num(v) is not None]
        f["barrier"] = bar.group(1).title()
        f["barrierHp"] = vals[-1] if vals else None
    diff = re.search(r'quest-difficulty-banner title=("?)([A-Za-z ]+)\1', block)
    if diff and diff.group(2) not in ("Monster encounter", "Boss"):
        f["difficulty"] = diff.group(2)
    return f


def fetch(url, local):
    if local:
        return Path(local).read_text(encoding="utf-8")
    req = urllib.request.Request(url, headers={"User-Agent": "ShopTitansBuilder/1.0 (data refresh)"})
    return urllib.request.urlopen(req, timeout=60).read().decode("utf-8")


def save(path, data, key):
    if path.exists():
        old = json.loads(path.read_text(encoding="utf-8"))
        if old.get(key) == data[key]:
            print(f"{path.name} inchangé.")
            return
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{path.name} écrit.")


def parse_main(page):
    """Quêtes principales : chaque <h1> est une zone (ou son repaire de boss)."""
    end = page.find(">Donate</h1>")
    body = page[:end] if end > 0 else page
    # Les zones sont les <h1 class='st-text-outline no-margin'> (le titre de page a une autre classe)
    parts = re.split(r"<h1 class='st-text-outline no-margin'>([^<]+)</h1>", body)
    areas = []
    for i in range(1, len(parts), 2):
        name = html.unescape(parts[i]).strip()
        levels = [parse_floor(b) for b in re.split(r"<div class=quest-difficulty>", parts[i + 1])[1:]]
        levels = [{k: v for k, v in lv.items() if k not in ("floor", "boss", "bossName")} for lv in levels if lv.get("difficulty")]
        if levels:
            areas.append({"name": name, "levels": levels})
    # Une zone et son repaire de boss se suivent : on marque le second comme boss
    for j in range(1, len(areas), 2):
        areas[j]["bossOf"] = areas[j - 1]["name"]
    return areas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local-tower")
    ap.add_argument("--local-main")
    a = ap.parse_args()
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    meta = {"authors": "STC Hub", "license": "CC BY-NC-ND 4.0",
            "licenseUrl": "https://creativecommons.org/licenses/by-nc-nd/4.0/", "fetchedAt": now}

    page = fetch(URL, a.local_tower)
    section = page[page.find(">Tower Of Titans<"):]
    end = section.find("Donate")
    section = section[:end] if end > 0 else section
    towers = []
    parts = re.split(r"<h1 class='st-text-outline no-margin'>([^<]+ Tower)</h1>", section)
    for i in range(1, len(parts), 2):
        name, body = parts[i].strip(), parts[i + 1]
        party = re.search(r"Party Size</p><h3[^>]*>(\d+)</h3>", body)
        floors = [parse_floor(b) for b in re.split(r"<div class=quest-difficulty>", body)[1:]]
        floors = [f for f in floors if f.get("floor")]
        towers.append({"name": name, "difficulty": name.replace(" Tower", ""),
                       "partySize": int(party.group(1)) if party else None, "floors": floors})
    save(OUT, {"source": URL, **meta, "towers": towers}, "towers")

    areas = parse_main(fetch(MAIN_URL, a.local_main))
    save(MAIN_OUT, {"source": MAIN_URL, **meta, "areas": areas}, "areas")


if __name__ == "__main__":
    main()
