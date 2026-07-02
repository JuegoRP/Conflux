#!/usr/bin/env python3
"""
Připraví generovací joby pro CHYBĚJÍCÍ story pozadí (68) a portréty (10),
podle děje. Výstup: tools/scene_jobs.json, tools/portrait_jobs.json, tools/SCENE_MAP.md.
Negeneruje — jen skládá prompty. Spustit gen: gen_openai.py (pozadí) / gen_edit nepotřeba (nová, ne z předloh).
"""
import json, os

BG_STYLE = ("Painterly, textural, hand-made illustration of a LOCATION with no people and no text. "
 "A grounded, weathered, lived-in world where old technology and living nature coexist; muted earthy "
 "palette, atmospheric depth, soft moody light; a game location backdrop with a calmer, less-busy centre "
 "so UI and cards stay readable on top. NOT glossy sci-fi, NOT fantasy, NOT photorealistic, NOT 3D render. "
 "No text, no UI, no watermark, no people.")

PORT_STYLE = ("Painterly, textural hand-made character portrait, head-and-shoulders, grounded near-future "
 "organic-mechanical world, muted palette, soft moody light, simple dark neutral background. Recognisable "
 "distinct face. NOT anime, NOT 3D render, NOT photorealistic, NOT glossy. No text, no watermark.")

# bg_name -> scéna (dle děje). faction nádech: synth=chladná ocel/tyrkys, organic=teplá zeleň, corruption=purpur/void, hybrid=srůst
SCENES = {
 # AKT 2 — strana kterou si nevybereš
 "act2_synth_border":"a synth-controlled demarcation checkpoint on a border line, cold steel-blue barriers, worn surveillance posts, a scanning lane, order",
 "act2_crossroads":"a crossroads at the seam of two worlds — cold blue synth city on the left, dark living forest on the right, a demarcation between order and nature, dusk",
 "act2_synth_deep":"a deep synth network corridor, patinated metal walls, humming machinery, cold teal light, oppressive",
 "act2_before_boss":"old neutral stone ruins between the two territories, timeworn, still and silent, older than both sides, grey mist",
 "act2_gate":"an ancient weathered stone gateway, neither synth nor organic, quiet threshold, a place that remembers",
 "act2_beyond":"a quiet path leading beyond the border into unknown territory, transitional, muted dawn",
 # AKT 3 — most / hybrid Nexus
 "act3_fusion_zone":"a hybrid Nexus zone where metal and living roots grow into each other, balanced teal-and-green, cables threaded through bark",
 "act3_nexus_deep":"deep inside the hybrid Nexus, circuits and roots merged, luminous layered chamber, contemplative",
 "act3_nexus_edge":"the edge of the Nexus, salvaged machinery overgrown by roots, a liminal hybrid marketplace",
 "act3_before_boss":"a circular duel arena in the Nexus, hybrid architecture of steel and root, tense anticipation",
 "act3_duel_arena":"a symmetrical hybrid duel arena, fusion of metal and root, focused light, a place of testing",
 "act3_beyond":"the far glitching edge of the record, a liminal threshold, faint corruption violet at the seams",
 "act3_horizon":"a horizon of fused city and forest seen while leaving the Nexus behind, dusk",
 # AKT 4 — dluh / Syndikát (transakce, data jako měna)
 "act4_border_dusk":"a dusk border beyond the Nexus, Syndikát trade territory, transactional cold, hanging trade lanterns",
 "act4_city_corridor":"a narrow watchful city corridor in Syndikát-controlled zone, grey, transactional",
 "act4_syndicate_hall":"a dim Syndikát trading hall where deals are struck, crates and ledgers, neutral greys, mercantile",
 "act4_red_zone":"a red-marked restricted delivery zone, warning tones, a testing checkpoint, tense",
 "act4_sector7":"sector 7, an organic-guarded passage where forest meets concrete, warm defiant, a protector's ground",
 "act4_veritel_office":"the Creditor's austere office, a debt-keeper's formal chamber, a desk, cold shadow",
 "act4_syndicate":"a cold empty Syndikát transaction point in the aftermath of a deal",
 # AKT 5 — dopis / Eli (paměť)
 "act5_outer_ring":"a worn outer-ring settlement at the edge of the route, memory-laden, muted dusk",
 "act5_transit_station":"an abandoned transit station with blind windows, quiet melancholy, dust and stillness",
 "act5_duel_memory":"a dim dreamlike memory-duel space, soft, cards drifting like recollections",
 "act5_road_evening":"an evening road under warm low light, a shared quiet path",
 "act5_road_dusk":"a dusk road leaving a station behind, contemplative, shared silence",
 # AKT 6 — paměť / Voit (přepis)
 "act6_crossing":"a sector crossing at dawn, transitional, muted, a place where an older figure appears",
 "act6_crossing_fight":"a crossing under threat where a system agent intercepts, cold tense",
 "act6_ruins":"quiet weathered ruins, contemplative, a place to explain a rewrite",
 "act6_open_road":"an open road under warm evening light, calm and honest",
 "act6_horizon":"a dusk horizon at act's end, protocol and memory weighing",
 "act6_city":"a cold ordered synth city edge under blue light (a bleak surrender)",
 "act6_synth_hq":"a cold institutional synth headquarters entrance, blue, absolute",
 # AKT 7 — přepis / identita
 "act7_checkpoint":"a clinical synth rewrite checkpoint, cold, unsettling, where a recalibrator waits",
 "act7_checkpoint_fight":"a cold checkpoint duel space, mirror-like tension, synth clinical",
 "act7_deep_road":"a deep oppressive road toward the rewrite core, faint glitch hints",
 "act7_core_facility":"the exterior of a monolithic rewrite-core facility that edits identity, cold synth, faint glitch",
 "act7_core_inner":"inside the rewrite core, an Overseer's chamber of screens and protocol architecture, cold watching",
 "act7_core_battle":"a cold clinical rewrite-core battle chamber, glitch, identity under pressure",
 "act7_exit":"a muted corridor out of the core, released, quiet relief",
 "act7_horizon_glitch":"a glitching dusk horizon, reality slightly torn, faint corruption violet threads",
 # AKT 8 — návrat
 "act8_border_town":"a worn border town at muted warm light where someone waits, return",
 "act8_battle_town":"a tense dusk town square, a confrontation ground",
 "act8_road_after":"a soft quiet road in the aftermath of a confrontation",
 "act8_horizon_clear":"a clearing calm dusk horizon before the end, the last stop",
 # AKT 9 — pozorovatel / práh
 "act9_convergence_plain":"a vast quiet plain at the route's end, a threshold place, muted and huge",
 "act9_memory_space":"an abstract memory-space where a whole journey opens like a constellation map, dreamlike soft glow",
 "act9_mirror_space":"a reflective liminal mirror-space, uncanny, where an alternate self stands",
 "act9_transition_fight":"an abstract threshold battle space, focused, liminal",
 "act9_threshold":"a liminal threshold before final gates, three or four gates faintly visible, anticipation",
 "act9_synth_gate":"the SYNTH gate — a cold ordered structural doorway of steel and teal light, imposing",
 "act9_organic_gate":"the ORGANIC gate — a living doorway of roots and warm growth, ancient and inviting",
 "act9_center_gate":"the OBSERVER gate — a lonely neutral grey threshold, solitary, a paradox",
 "act9_fourth_gate":"a hidden FOURTH gate the protocol doesn't know, a quiet doorway of off-system silence, faint warm, secret",
 "act9_threshold_open":"a chosen gate glowing open, momentous, transitional",
 # AKT 10 — konvergence / konce
 "act10_convergence":"the Convergence — the system's vast final core where the route ends, monumental architecture",
 "act10_synth_core":"the Synth core, cold monumental protocol architecture, teal, absolute order",
 "act10_synth_battle":"a cold monumental Synth core battle hall, protocol light",
 "act10_synth_horizon":"a cold clean synth dawn horizon, the system absorbing, ambiguous",
 "act10_organic_deep":"a vast warm bioluminescent organic underworld beneath the roots, living cavern",
 "act10_organic_battle":"the organic depths, roots and warm glow, a living battle cavern",
 "act10_organic_horizon":"a slow green organic dawn horizon, a seed growing, hopeful",
 "act10_center_void":"a mirror-void, unsettling neutral dark, where a darker reflection waits",
 "act10_void_battle":"a mirror-dark void battle space, tense, reflective",
 "act10_open_horizon":"an open unmapped grey horizon of quiet freedom, alone but not entirely",
 "act10_fourth_space":"an intimate off-record space beyond the system, a silence it cannot see, faint warm",
 "act10_protocol_space":"a cold glitching rewrite-core protocol space, the source, the final barrier",
 "act10_fourth_horizon":"an off-record soft horizon unseen by the system, two figures ahead, quiet",
 "act10_void":"a reflective dark mirror-void, the final self-recognition, uncanny",
}

# jméno -> popis postavy (dle děje). frakční nádech.
CHARS = {
 "kellner":"Kellner, a synth zone administrator — bureaucratic, tired official in a worn uniform, cold and detached; files everything (SYNTH: cold steel-blue tones)",
 "straz":"a wary organic forest guard — distrustful, rough natural clothing, weathered, protects those who can't choose (ORGANIC: warm mossy tones)",
 "vykonavatel":"the Executor — a synth enforcer who believes a sealed letter is a defect, rigid conviction, weathered synth armour, cold zeal (SYNTH)",
 "reka":"Řeka, a synth borderland patrol officer — dutiful, worn uniform, records everyone, neutral and cold (SYNTH)",
 "rada":"Rada, an organic community elder/council figure — grounded, natural garb, remembers what the system erases, warm and weary (ORGANIC)",
 "vanek":"Vaněk, a synth network operative who does things that aren't done — sly, efficient, cold, worn tech-wear (SYNTH)",
 "tichy":"the Silent One — an ancient neutral guardian older than both sides, still and hooded, timeless, weathered, remembers (NEUTRAL, desaturated)",
 "strazce":"a hybrid bridge-guardian — neither side, calm and liminal, fusion of steel and root motifs on his form, watchful (HYBRID: teal+green)",
 "hana":"Hana, a hybrid fusion adept — understands what belongs together, thoughtful, warm-cold balance (HYBRID)",
 "duelista":"the nameless Duelist — a shifting mirror-fighter with a different face each cycle, features slightly indistinct and uncanny, reads your intent (HYBRID, ambiguous)",
}

HERE=os.path.dirname(os.path.abspath(__file__))
scene_jobs=[{"name":k,"file":f"assets/images/backgrounds/{k}.jpg","size":"1536x1024",
             "prompt":f"{BG_STYLE} SCENE: {v}."} for k,v in SCENES.items()]
port_jobs=[{"name":k,"file":f"assets/images/portraits/{k}.png","size":"1024x1024",
            "prompt":f"{PORT_STYLE} CHARACTER: {v}."} for k,v in CHARS.items()]
json.dump(scene_jobs,open(os.path.join(HERE,"scene_jobs.json"),"w"),ensure_ascii=False,indent=1)
json.dump(port_jobs,open(os.path.join(HERE,"portrait_jobs.json"),"w"),ensure_ascii=False,indent=1)

# čitelná mapa
md=["# CONFLUX — mapa chybějících story assetů\n",
    f"**{len(scene_jobs)} chybějících pozadí** + **{len(port_jobs)} chybějících portrétů** (referencované příběhem, soubor neexistuje).\n",
    "Generovat: `gen_openai.py scene_jobs.json` a `... portrait_jobs.json`. Quality dle domluvy.\n",
    "\n## Pozadí (podle aktů)\n"]
for k,v in SCENES.items(): md.append(f"- **{k}** — {v}")
md.append("\n## Portréty (chybějící postavy)\n")
for k,v in CHARS.items(): md.append(f"- **{k}** — {v}")
md.append("\n## Pozn.\n- Bug: pribeh v aktu 7 pouziva `spravce` s diakritikou -> portret `spravce` se nenacte. Opravit v campaign.js.\n- Pozadi = ciste lokace bez postav (postavy jdou jako VN portret pres ne). Varianta postava-ve-scene mozna pozdeji.")
open(os.path.join(HERE,"SCENE_MAP.md"),"w").write("\n".join(md))
print(f"scene_jobs: {len(scene_jobs)} | portrait_jobs: {len(port_jobs)} | SCENE_MAP.md hotová")
