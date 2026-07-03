# CONFLUX — Roadmap

Živý seznam. ✅ = hotovo, 🔜 = další na řadě, ⬜ = plán.

---

## 1. Hák „systém tě zná a hraje tebou" (kreativní jádro / marketing)
- ✅ **Profil-screen** před mirror-bossem — systém ti hodí, co o tobě z playstyle ví
- ✅ **„TVOJE KARTA" label** — mirror/profilující nepřítel hraje karty z tvého decku
- ✅ **Profilovací barky** v boji (Rekalibrátor/Správce/Pozorovatel/Paradox/Sigma)
- ✅ **Dynamické story barky** — Správce/Pozorovatel/Sigma zmíní tvůj profil v cutscéně (`{{profile}}` token)
- ⬜ **Cyklický / roguelike rám** (větší) — „cykly" jako fikce → replayability, každý běh tě přepíše jinak

## 2. AI (po dokončení vizuálu) — ASSESSMENT hotový
AI reálně UMÍ fúze, monstra (se stancem), arény, kouzla, pasti, odhalení face-down, útok per styl.
**Skutečný problém = rigidní priorita:** `_aiPlayCard` zkouší v pořadí fúze → monstrum → aréna → kouzlo → past,
a kvůli limitu 1 karta/tah po zahrání monstra skončí → **skoro vždy hraje monstrum, kouzla/pasti/arény sotva.**
- ✅ **Fix HOTOVO:** `_aiPlayCard` teď SKÓRUJE všechny chtěné tahy a vybere nejhodnotnější (místo pevné priority) → hraje i kouzla/pasti/arény, ne jen monstra
- ⬜ **Mirror/profiler nepřátelé:** skládat/naklánět deck k hráčovým kartám (víc „TVOJE KARTA" + reálný zrcadlový pocit)
- ⬜ Bohatší per-`aiStyle` chování + doladit útok/stance rozhodování

## 3. Dva herní mody (při balancingu)
- ⬜ **Výběr na začátku hry**, přepínatelný:
  - **SIMPLE** — fúze jak teď (volné recepty)
  - **HARDCORE** — jen SPECIFICKÉ fúzní kombinace → mnohem složitější, využívá maximum stávajících mechanik

## 4. Balancing
- ⬜ **Corruption tempo** — laditelná konstanta `STORY_CORRUPTION_PER_TIER` + prahy alignmentu
- ⬜ **Váhy voleb** (akty 4–10 dostaly effects — doladit čísla podle pocitu)
- ⬜ **Počet soubojů / akt** (6 v aktu 1 = zvážit sloučení)
- ⬜ **Balanc 415 karet** (ATK/DEF, rarity, fúze)

## 5. Vizuál / UX — dolaďování podle playtestu
- 🔜 **Jemné panely** deckbuilder / kolekce / free battle — konkrétní tmavá/krabicová místa (ukázat co drhne)
- ⬜ **Crossfade mezi scénami** (kosmetika navrch Ken Burns)
- ⬜ Případně **přegenerovat konkrétní moc tmavá pozadí** světlejší (přes OpenAI)
- ⬜ Emblém do dalších míst dle chuti (rohy UI, rub karty?)

## 6. Story polish (volitelné)
- Próza aktů 5–10 je silná → ponechána. Drobnosti dle playtestu.

---

## Hotový kontext (aby bylo jasné, co už stojí)
- **Assety:** 415 card artworků, 64+68 story pozadí, 26 portrétů, letter holo, emblém — rámy/logo ponechány
- **Příběh:** páteř paměť/identita/výběr strany; akty 1–3 přepis, 4–10 volby zváženy (konec reaguje na rozhodnutí)
- **Boj:** in-battle lore barks (27 nepřátel), fade-in pole, mince=emblém
- **UX:** zesvětlení, čitelné volby, jméno hráče ve story, cinematic panely, preload scén (proti trhání)
