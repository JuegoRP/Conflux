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
- ✅ **Mirror/profiler nepřátelé HOTOVO:** do decku vmícháno ~12 karet z hráčova decku → hrají TEBOU (TVOJE KARTA se reálně ukazuje)
- ✅ **Fér fix:** kdo začíná nesmí v 1. tahu útočit (platilo jen pro hráče; AI útočila = nefér) — `_aiAttack`/`_aiPrepareAttackers` respektují `canAttack`
- ✅ **Útočná logika ověřena** — útočí na nejsilnější poražitelný cíl, vyhýbá se sebevraždě, přímý jen na čisté pole, respektuje pasti. Hraje jako kompetentní hráč.
- ✅ **Doladění per playtest (2026-07-15):** 3 konkrétní Romanovy nálezy opraveny:
  (1) sebevražedné útoky na silnější VIDITELNOU kartu → else-větev preferuje udržet monstrum (náraz na DEF)
  + minimální LP ztrátu; 'perfect' už NIKDY nesebevraždí (2) málo buffů na sebe → taktický buff: když by
  posílení proměnilo prohraný souboj ve vítězný, AI ho použije (3) neútočí do prázdného pole → i defensive
  styl teď při prázdném poli hráče přepne vše do ATK a jde přímo na LP
- ⬜ Další ladění dle playtestu

## 3. Dva herni mody — ZAKLAD HOTOVY
- ✅ **Vyber modu na startu nove kampane** (MainMenu._showModeSelect) + setting `gameMode`
- ✅ **Fuzni gate**: SIMPLE = override+archetyp (volne), HARDCORE = jen specificke recepty (getFusionResult skip archetyp)
- ⬜ **Balancing HARDCORE** (pri balancingu): ktere recepty, obtiznost, pripadne dalsi mechaniky zprisnit; fuzni preview v deckbuilderu/kolekci at respektuje mod

## 3b. Card pool — opravy + removal balík ✅ HOTOVO (2026-07-07)
- ✅ **#826-828 opraveny** (effect byl próza → nic nedělaly): Synergie=buff_synergy, Lensino řešení=force_def (hráč VYBÍRÁ cíl), Třetí cesta=arena_break
- ✅ **6 nových karet**: Vykořenění (destroy_organic), Čistý signál (destroy_corruption), Přepsání (destroy_strongest +1 corr), Karanténa (trap_capture), Hladová půda (trap_snare ≤1500), Poloviční návrat (trap_decay ½ATK) — s artworky
- ✅ **AI je umí používat** (universální removal priorita v _aiWantsSpell + trap picker)
- ✅ **Arény opraveny dle popisků**: frakční buffy (synth aréna buffuje jen synth — OBĚ strany), buff_all dává ATK i DEF, bonus se aplikuje i na později vyložená monstra (_applyArenaToMonster, pravidlo z CLAUDE.md)
- ✅ **Audit popisků**: 17 karet lhalo (čísla, +corruption, „obě strany", mirror/entropy chování) → popisky srovnány s reálným chováním

## 3c. QA + release (2026-07-10)
- ✅ **Simulátor konců** (`tools/sim_endings.py`) — všech 9 konců (A–F + 3 early) ověřeno dosažitelných
- ✅ **QA tester průchodu** (`tools/qa_playthrough.py`) — 313 nodů, 0 chyb; opraveny: flagy konců (chose_*_path vs chosen_*_end), effect→effects (41 míst!), corruptionMin 70→5, osiřelý act3 řetěz (Voit first!), speakeři s diakritikou
- ✅ **Safari fix** — sfx ogg→m4a (Safari/iOS ogg nehraje)
- ✅ **EN lokalizace v1 (2026-07-11)**: engine/Locale.js (overlay merge při bootu), data/lang/*.json
  (campaign 253 nodů, cards 421, enemies 32, strings 27 — dopis+profil), přepínač JAZYK v nastavení,
  EN menu labely, VoiceOver EN mapa sladěná s dabingem. tools/translate_en.py (idempotentní).
  ✅ UI stringy (2026-07-11): Locale.ui() CZ→EN mapa — coinflip, profil-screen, POKRAČOVAT/ZPĚT,
     letter tlačítka, mode-select, settings labely+volby, pauza/výsledek. Wired: Battle/Story/Letter/MainMenu.
  ⬜ zbývá: 138 dynamických battle-log hlášek (interpolované, scrollují — nižší priorita)
- ⬜ **STEAM packaging** (rozhodnuto 2026-07-10): Electron/Tauri wrapper + Steamworks, až po EN a balancingu

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
