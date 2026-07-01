#!/usr/bin/env python3
"""
CONFLUX asset generator — prompt-builder + orchestrátor.
Mozek: skládá deterministický prompt z asset_manifest.json + ART_BIBLE pravidel.

Použití:
  python3 generate.py prompts --ids 1,8,50,201 --out pilot_prompts.json
  python3 generate.py prompts --faction synth --kind monster --out synth.json
Backendy generování (volá driver, ne tenhle soubor) čtou výstupní JSON:
  každý záznam = {id, file, filename, project, prompt, size, quality}
"""
import json, argparse, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "asset_manifest.json")

# ---- STYL (zrcadlí tools/ART_BIBLE.md — jediná proměnná v promptu je SUBJECT) ----
# ŽÁDNÁ globální paleta ani jednotný opar — každá karta má vlastní prostředí a světlo.
# Paletu určuje FRAKCE, rozmanitost zajišťuje VARIETY (podle ID) + subjekt karty.
GLOBAL = ("Painterly textural illustration, visible brushwork, hand-made tactile feel, rich detail. "
          "A grounded, weathered, lived-in world. This is NOT clean glossy sci-fi and NOT fantasy "
          "(no dragons, wizards, magic, spaceships). Give THIS image its own distinct setting, colour "
          "mood and composition — do not make it look generic. "
          "NOT photorealistic, NOT 3D render, NOT anime, NOT pixel art, NOT cel-shading.")

# POZOR: frakce jsou ČISTÉ a nemíchají se. Jen HYBRID kombinuje obojí. Viz FACTION_NEG níže.
FACTION = {
    "synth": ("SYNTH faction — PURELY MACHINE, absolutely nothing organic. Aged, worn, hand-built "
              "industrial technology, never shiny: patinated metal, corroded panels, cracked ceramic, "
              "exposed wiring, rivets, gauges, dials; cool STEEL-BLUE and TEAL palette with small amber "
              "indicator glows; rigid modular geometry. Old machinery that has run far too long."),
    "organic": ("ORGANIC faction — PURELY LIVING NATURE, no technology whatsoever. Warm palette: lush "
                "moss greens, amber, ochre, bark brown, honeyed light; made of bark, roots, mycelium, "
                "sinew, chitin, leaves, wet stone, living flesh; soft asymmetrical grown organic forms. "
                "Ancient living-forest mood, alive and aware."),
    "hybrid": ("HYBRID faction — GENUINELY BOTH, in large part each: a true roughly 50/50 merger of "
               "machine AND living nature grown together (metal fused with flesh, roots threaded through "
               "machinery, a screen embedded in bark, cable fused with sinew). BALANCED teal-and-green "
               "palette; rigid symmetry meeting organic sprawl; neither side dominates. Real fusion, "
               "never a side-by-side collage."),
    "corruption": ("CORRUPTION faction — a TEAR IN REALITY itself, cosmic and wrong. The subject is NOT a "
                   "solid body: it is a form made of torn spacetime, half-dissolved into a glowing rift, "
                   "fragmenting into void, static and drifting stars, edges breaking apart and glitching. "
                   "A fracture in the world with the black void bleeding through, warped distorted space, "
                   "sickly VIOLET, MAGENTA and deep black with iridescent broken light and starfield. "
                   "Reality coming apart at the seams — otherworldly, cosmic-horror scale, not a person, "
                   "not a robed figure, not an object."),
    "neutral": ("NEUTRAL faction — plain human scale, the courier: DESATURATED grey, beige, faded cloth, "
                "leather, paper, worn wood and iron; practically no technology; one small warm human "
                "accent (a lamp, a letter). Quiet, civilian, lonely, tender."),
}

# Frakční negativy — vynucují ČISTOTU frakce (jen hybrid mísí).
FACTION_NEG = {
    "synth": " No plants, no roots, no moss, no wood, no vines, no leaves, no organic tissue, no nature.",
    "organic": " No metal, no machinery, no wires, no cables, no screens, no circuitry, no robots, no technology.",
    "hybrid": "",
    "corruption": " Not cozy, not a peaceful forest, not clean tidy machinery — everything is torn and wrong.",
    "neutral": " No monsters, no machinery, no glowing technology.",
}

# Deterministická variace světla/nálady podle ID — rozbíjí uniformitu (frakce drží identitu).
VARIETY = [
    "LIGHT: cold blue dawn, long shadows.",
    "LIGHT: warm golden dusk, low sun.",
    "LIGHT: overcast diffuse grey daylight.",
    "LIGHT: deep night lit by a single warm source.",
    "LIGHT: dappled light filtered through canopy.",
    "LIGHT: pale misty morning, soft haze.",
    "LIGHT: harsh raking sidelight, strong contrast.",
    "LIGHT: dim close interior, pools of lamplight.",
    "LIGHT: stormy bruised sky, cool tones.",
    "LIGHT: hot dry midday, bleached and dusty.",
]

SUBCAT = {
    "scout": "scout archetype: light, agile, fast.",
    "guardian": "guardian archetype: heavy, defensive, immovable.",
    "system": "system archetype: technical, node-like, networked.",
    "memory": "memory archetype: archival, luminous, holding records.",
    "nature": "nature archetype: grown, elemental, rooted.",
}

KIND_COMP = {
    "monster": ("Single creature/entity, heroic centered composition, front or 3/4 view, fills the frame, "
                "clear readable silhouette, environment only hinted behind."),
    "spell": ("No creature — energy, phenomenon or gesture; abstract, dynamic light effect expressing the "
              "effect (buff=rising glow, damage=tearing, heal=warm stream)."),
    "trap": ("A hidden mechanism / set-up situation, tension just before it triggers; tense, muted, detail "
             "of the trap rather than a character."),
    "arena": ("Landscape / location, no character, wide environmental shot, suitable also as battle backdrop."),
    "letter": ("Intimate narrative human object (a letter, a hand, a close detail), warm human mood."),
}

NEGATIVE = ("No text, no letters, no numbers, no logo, no watermark, no signature, no UI, no border, no frame, "
            "no collage, no multiple panels, no image grid, no sword, no dragon, no wizard, no magic, no "
            "fantasy armor, no medieval, no glossy sci-fi, no clean futuristic render, no spaceship, no "
            "neon cyberpunk, no sterile white studio.")

RARITY = {
    "common": "restrained execution.", "uncommon": "richer detail.",
    "rare": "striking lighting and atmosphere.",
    "unique": "exceptional composition, dramatic light, a key visual.",
    "legendary": "exceptional composition, dramatic light, a key visual.",
}

def build_prompt(card):
    parts = [GLOBAL, FACTION.get(card["faction"], "")]
    subj = f'SUBJECT: {card["name"]} — {card.get("desc") or ""}'.strip()
    if card.get("subcategory") in SUBCAT:
        subj += " " + SUBCAT[card["subcategory"]]
    parts.append(subj)
    parts.append("COMPOSITION: " + KIND_COMP.get(card["kind"], KIND_COMP["monster"]))
    parts.append(VARIETY[card["id"] % len(VARIETY)])
    parts.append("QUALITY: " + RARITY.get(card.get("rarity"), "richer detail."))
    parts.append(NEGATIVE + FACTION_NEG.get(card["faction"], ""))
    return " ".join(p for p in parts if p)

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prompts")
    p.add_argument("--ids", help="comma list of card IDs")
    p.add_argument("--faction"); p.add_argument("--kind")
    p.add_argument("--limit", type=int)
    p.add_argument("--quality", default="high")
    p.add_argument("--out", required=True)
    p.add_argument("--subdir", default="conflux", help="project subfolder pro Save Image")
    a = ap.parse_args()

    cards = json.load(open(MANIFEST))["cards"]
    if a.ids:
        want = [int(x) for x in a.ids.split(",")]
        sel = [c for c in cards if c["id"] in want]
        sel.sort(key=lambda c: want.index(c["id"]))
    else:
        sel = cards
        if a.faction: sel = [c for c in sel if c["faction"] == a.faction]
        if a.kind: sel = [c for c in sel if c["kind"] == a.kind]
        if a.limit: sel = sel[:a.limit]

    out = []
    for c in sel:
        out.append({
            "id": c["id"],
            "file": c["file"],
            "filename": f'{str(c["id"]).zfill(3)}.png',
            "project": a.subdir,
            "size": "1024x1024",
            "quality": a.quality,
            "prompt": build_prompt(c),
        })
    json.dump(out, open(a.out, "w"), ensure_ascii=False, indent=1)
    print(f"Zapsáno {a.out}: {len(out)} promptů")
    for o in out[:3]:
        print(f'  #{o["id"]} {o["prompt"][:90]}...')

if __name__ == "__main__":
    main()
