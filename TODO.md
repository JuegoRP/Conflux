# CONFLUX — TODO & Stavový přehled

> Tento soubor slouží jako sdílená paměť napříč sezeními a instancemi.
> Při dokončení úkolu: zaškrtni `[x]` a přidej datum.
> Formát: `[x] Hotovo (2026-05-12)` / `[ ] Čeká`

---

## ASSETY

### Portréty postav
- [x] kuryr, monyra, rozara, romen, marta, eli, voit, lens (2026-05-12)
- [x] spravce, veritel, agent, sigma, pramati, pozorovatel, rekalibrator, paradox (2026-05-12)
- [x] Marta nahrazena správnou postavou — checkpoint guardian (2026-05-12)

### Backgroundy
- [x] act1 plná sada (city_gate, city_streets, crossroads, forest_edge, admin, gate_inner, checkpoint, synth_checkpoint, beyond_gate) (2026-05-12)
- [x] act2_border, act2_forest_deep, act2_forest_hidden, act2_ruins (2026-05-12)
- [x] act7_distorted_road, act8_void (korupce zóny) (2026-05-12)
- [x] collection_bg nahrazen serverovnou (2026-05-12)
- [x] StoryEngine alias mapa aktualizována — všech 85 bg klíčů pokryto (2026-05-12)
- [ ] act3–act6 backgroundy — zatím aliasy na existující soubory, ideálně vlastní artwork
- [ ] act7–act10 backgroundy — totéž

### Hudba (BGM)
- [x] menu_theme, collection, deckbuilder, freebattle_menu, freebattle_battle (hotovo dříve)
- [x] story_calm, story_quiet, story_slow, story_tension, story_dramatic, story_hybrid (hotovo dříve)
- [x] story_battle_low_corruption, story_battle_high_corruption (hotovo dříve)
- [ ] act1_intro.mp3 — úvodní cutscéna (tichá, napjatá)
- [ ] act1_battle.mp3 — normální bitvy akt 1
- [ ] act1_boss.mp3 — boss fight (brána)
- [ ] act1_boss_intro.mp3 — před bossem (krátká, dramatická)
- [ ] act1_end.mp3 — závěr aktu 1
- [ ] act5_eli_theme.mp3 — Eli dialog scény
- [ ] act5_eli_battle.mp3 — bitva s Elim (forcedLoss)
- [ ] early_glitch.mp3 — první korupce moment
- [ ] early_silence.mp3 — ticho před bouří
- [ ] act6_monyra_theme.mp3, act8_monyra_theme.mp3, act9_monyra_theme.mp3
- [ ] act10_boss_paradox.mp3 — finální boss
- [ ] act10_ending_a/b/c/d.mp3 — různé konce
- [ ] Zbytek character témat (veritel, voit, sigma...) — nižší priorita

### Karta 702 "Zpráva"
- [x] Opraveno: kind změněn na "letter" → správný rámec corruption_alt (2026-05-12)
- [x] Artwork přidán a zacentrován na světlém pergamenovém pozadí (2026-05-12)

---

## UI / UX

### Collection
- [x] Zobrazení všech karet ve hře (vlastněné + nevlastněné) (2026-05-12)
- [x] Reálné rámečky karet, klik na vlastněnou → náhled (2026-05-12)
- [x] Zadní strana karty pro nevlastněné (bez interakce) (2026-05-12)
- [x] ID range labely nad každou skupinou 10 karet (2026-05-12)
- [x] Širší okraje (padding 28px) (2026-05-12)

### DeckBuilder
- [x] Card preview opraveny (injectCardStyles voláno) (2026-05-12)
- [x] Získané karty se ukládají (SaveManager.save) (2026-05-12)
- [x] ATK/DEF filtr obousměrný (toggle ↑/↓) (2026-05-12)
- [x] ATK/DEF viditelné u monster v panelu ruky (2026-05-12)
- [x] Emoji odstraněny z DeckBuilder (2026-05-12)
- [ ] Názvosloví monster v panelu ruky — název monstra tam nepatří, odstranit nebo zkrátit
- [ ] Náhled karty při podržení v panelu "vezmu sebou do boje" (long press / hover)

### Nastavení (Settings)
- [ ] Větší popup pro settings — bude přibývat víc položek
- [ ] Grafické nastavení: kontrast, jas, barevný filtr
- [ ] Ovládání podle platformy (klávesnice, gamepad, dotyk)
- [ ] Přemapování tlačítek (klávesnice + ovladač)
- [ ] Fullscreen toggle

### Hlavní menu
- [ ] Výběr jazyka při prvním spuštění (CZ / EN) — před menu
- [ ] Přepínání jazyka v nastavení

### Obecné UI
- [ ] Všechny texty zkontrolovat na překlepy a konzistenci

---

## STORY / KAMPAŇ

### Přechody a backgroundy
- [x] Začátek příběhu ukazuje město, ne bránu (2026-05-12)
- [x] Brána použita až v boss sekci aktu 1 (2026-05-12)
- [ ] Plynulejší přechody backgroundů — cross-fade při změně scény (momentálně okamžité)

### Korupce — vizuální efekty
- [x] Korupce text glitch — základ (2026-05-12 — předchozí sezení)
- [ ] **PŘEPRACOVAT glitch efekt:** Aktuální implementace přepisuje text. Správné chování:
  - Text zůstává čitelný celou dobu
  - Jednotlivá slova nebo písmena **živě blikají** — střídají správný a špatný symbol
  - Frekvence a intenzita závisí na úrovni korupce
  - Efekt musí být kontinuální (ne jen při vypsání textu) — setInterval nebo requestAnimationFrame
  - Hráč musí vždy být schopen přečíst text i při maximální korupci
- [ ] Vizuální korupce v UI (fialový šum, aberace) — rozšířit dle úrovně korupce

### Story uzly
- [x] Překlepy opraveny: pramáti→pramati, věřitel→veritel, správce→spravce (2026-05-12)
- [x] act1_monyra_intro node přidán (předchozí sezení)

---

## BATTLE SYSTEM

### Karty na poli — líc dolů
- [ ] **Trapy** — při zahraní na pole zobrazit lícem dolů (face-down), odhalit až při triggeru
- [ ] **Arény** — při zahraní na pole zobrazit lícem dolů, odhalit až při aktivaci
- [ ] Skilly — stejné chování (face-down při zahraní, odhalit při použití)
- [ ] AI musí respektovat face-down karty (nevidí co pod nimi je)

### Skilly — opravit logiku
- [ ] Skill lze použít kliknutím na skill v ruce → kliknout na cílové monstrum (bez mezikroku)
- [ ] Prověřit každý skill: dělá to co říká text na kartě?
  - Skilly co zlepšují "všechny karty daného typu" → musí platit pro MÉ i PROTIVNÍKOVY karty
  - Permanentní efekty (ne jen při zahraní) musí platit i pro nově příchozí karty
- [ ] Chybí skill na **zničení karty** (libovolné)
- [ ] Chybí skill na **zničení karty určité frakce**

### Arény — opravit logiku
- [ ] Bonusy z arény přičítat OBĚMA stranám (ne jen hráči)
- [ ] Efekt arény musí platit i pro karty zahrané PO aktivaci arény (permanentní dokud je na poli)

### Trapy — prověřit
- [ ] Každý trap: spouští se správně? Dělá co říká text?

### AI — přepracovat
- [ ] AI musí znát a dodržovat všechna herní pravidla
- [ ] AI má útočit vždy když vidí jasnou příležitost k vítězství
- [ ] AI musí umět **fúzovat** karty
- [ ] AI musí umět **hrát skilly** cíleně
- [ ] AI musí respektovat face-down karty (neví co pod nimi je)
- [ ] AI má správně vyhodnocovat kdy použít trap/arénu
- [ ] Obecně: AI se má řídit jasnou strategií, ne náhodně útočit

### Coinflip animace
- [x] Klik na CONFLUX logo → rotace → výsledek → overlay nad polem (2026-05-12)
- [x] "Cyklus pokračuje." místo "A cycle begins..." (2026-05-12)
- [x] Emoji odstraněny z coinflip zprávy (2026-05-12)

### Konec hry / defeat
- [x] POKRAČOVAT po prohře jen u Eliho (forcedLoss) (2026-05-12)
- [x] Ostatní porážky: 3s countdown → auto-redirect do menu (2026-05-12)

---

## LOKALIZACE

- [ ] Audit všech textů — všechny musí být česky (žádné anglické zbytky)
- [ ] Připravit systém pro i18n (klíč → překlad)
- [ ] **Česká verze** — dokončit a vyčistit jako primární
- [ ] **Anglická verze** — přeložit všechno (UI, texty karet, kampaň, dialogy)
- [ ] Výběr jazyka při prvním spuštění
- [ ] Přepínač jazyka v nastavení

---

## TECHNICKÝ DLUH / RŮZNÉ

### Hudba
- [x] Music overlap opraven při odchodu z FreeBattle, DeckBuilder, Collection (2026-05-12)
- [x] destroy() volá AudioSystem.stopMusic(600) ve všech modulech (2026-05-12)

### Výkon
- [ ] Preload backgroundů pro aktuální + příští node funguje — zkontrolovat výkon na mobilech

### Platforma
- [ ] Otestovat na mobilním prohlížeči (touch gesta, viewport)
- [ ] Gamepad podpora (základní navigace)

---

## VZDÁLENÁ BUDOUCNOST

- [ ] **Multiplayer** — až bude vše ostatní hotové a stabilní
  - Online PvP (real-time nebo asynchronní)
  - Lobby systém
  - Deck sdílení

---

*Poslední aktualizace: 2026-05-12*
*Soubor udržuj aktuální — při každé změně uprav datum a stav úkolu.*
