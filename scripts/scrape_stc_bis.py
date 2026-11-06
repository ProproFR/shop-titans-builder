"""Récupère les builds « Best in Slot » publiés par STC-Hub.

Source : https://stcentral-hub.github.io/tools/bis-heroes/
Auteurs : Nerilea, Reiga & Yuki (STC Hub) — licence CC BY-NC-ND 4.0.
Les builds sont reproduits tels quels (aucune modification), avec crédit et lien.

Usage : python scripts/scrape_stc_bis.py [--local fichier.html]
Sortie : site/data/bis.json
"""
import argparse
import datetime as dt
import html
import json
import re
import urllib.request
from pathlib import Path

URL = "https://stcentral-hub.github.io/tools/bis-heroes/"
OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "bis.json"


def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse_slot(title):
    lines = [l.strip() for l in html.unescape(title).strip().splitlines()]
    m = re.match(r"Tier (\d+) (.+)", lines[0])
    slot = {"tier": int(m.group(1)), "name": m.group(2).strip()} if m else {"name": lines[0]}
    enchants = []
    for l in lines[1:]:
        if l.startswith("Enchanted with:"):
            v = l.split(":", 1)[1].strip()
            if v:
                enchants.append(v)
        elif l.startswith("Affinity:"):
            slot["affinity"] = [a.strip() for a in l.split(":", 1)[1].split("|") if a.strip()]
    slot["enchants"] = enchants
    return slot


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local")
    a = ap.parse_args()
    if a.local:
        page = Path(a.local).read_text(encoding="utf-8")
    else:
        req = urllib.request.Request(URL, headers={"User-Agent": "ShopTitansBuilder/1.0 (data refresh)"})
        page = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")

    updated = re.findall(r"(\w+ \d{1,2}, \d{4} \d{2}:\d{2} UTC)", page)
    blocks = re.split(r"<div class=row-layout id=", page)[1:]
    heroes = []
    for b in blocks:
        bid = re.match(r"([\w-]+)", b).group(1)
        title = text(re.search(r"<h1[^>]*>(.*?)</h1>", b, re.S).group(1))
        names = [n.strip() for n in title.split("/")]
        # Une classe peut avoir plusieurs variantes : chacune commence par <div class=hero-wrapper>
        variants = []
        for v in re.split(r"<div class=hero-wrapper>", b)[1:]:
            notes_html = re.search(r"hero-note-wrapper>(.*?)</ul>", v, re.S)
            notes = [text(li) for li in re.findall(r"<li>(.*?)</li>", notes_html.group(1), re.S)] if notes_html else []
            slots = [parse_slot(t) for t in re.findall(r'class="hero-equipment-slot [^"]*"[^>]*?title="([^"]*)"', v)]
            if slots:
                variants.append({"notes": notes, "slots": slots})
        heroes.append({
            "id": bid,
            "classes": names,
            "variants": variants,
        })
    data = {
        "source": URL,
        "authors": "Nerilea, Reiga & Yuki — STC Hub",
        "license": "CC BY-NC-ND 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by-nc-nd/4.0/",
        "pageUpdated": updated[1] if len(updated) > 1 else (updated[0] if updated else None),
        "fetchedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "heroes": heroes,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # Conserver l'ancienne date si les builds n'ont pas changé (évite des commits vides)
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8"))
        if old.get("heroes") == heroes and old.get("pageUpdated") == data["pageUpdated"]:
            print("Builds STC inchangés.")
            return
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(heroes)} builds -> {OUT}")


if __name__ == "__main__":
    main()
