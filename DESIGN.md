# CONFLUX — Designový dokument

*Živý průvodce hrou. Vysvětluje nejen CO hra dělá, ale hlavně PROČ se to tak rozhodlo.*

Verze dokumentu: 1.0 · Stav kódu: 415 karet, 328 příběhových nodů, 84 fúzních archetypů, 105 ručních fúzních overridů.

---

## 1. PŘEHLED HRY

**CONFLUX jednou větou:** Příběhová karetní hra, kde neseš zprávu, kterou nemáš číst — a postupně zjišťuješ, že svět kolem tebe se rozhoduje, jestli se má rozpomenout, nebo zapomenout.

**Téma světa.** Svět CONFLUXu je *organicko-mechanický*. Není to čisté sci-fi a není to fantasy. Je to místo, kde kabely prorůstají kořeny, kde protokoly mají vzpomínky a kde stromy mluví v datových paketech. Systém (umělý řád) a Příroda (organická paměť) se po staletí prolínaly, až přestalo být jasné, kde končí jedno a začíná druhé. Konflux je bod, kde se to setkává — a kde se to může buď spojit, nebo zhroutit.

**Vizuální styl.** Teplá, ne studená budoucnost. Tlumené tóny, organické textury, displeje, které vypadají jako by rostly. Narativ používá *serifové písmo* (lidský hlas, paměť, dopisy), synth entity mluví *monospace* fontem (protokol, řád). Corruption láme obojí.

**5 frakcí a jejich charakter:**

| Frakce | Barva charakteru | Co reprezentuje | Postoj |
|---|---|---|---|
| **synth** | Chladná struktura | Protokoly, efektivita, řád, systém | „Funguje to. Nech to fungovat." |
| **organic** | Teplá paměť | Příroda, vzpomínky, identita, růst | „Pamatuj si, co jsi byl." |
| **hybrid** | Most | Spojení protikladů, vyváženost, třetí cesta | „Nemusíš si vybrat stranu." |
| **corruption** | Rozpad | Prázdnota, přepis, ztráta, pohlcení | „Zapomeň. Je to snazší." |
| **neutral** | Bez strany | Kurýr, nositel, prostředník | „Jen nesu zprávu." |

Počty karet potvrzují, že synth (124) a organic (117) jsou hlavní osa, hybrid (92) je třetí cesta, corruption (64) je tlak, neutral (18) je hráčův výchozí stav.

**Jak funguje příběh — 10 aktů:**

1. **Kurýr** — *Všechno ještě vypadá normálně.*
2. **Strana kterou si nevybereš** — *Obě strany mají pravdu. Obě se mýlí.*
3. **Most** — *Třetí možnost existuje. Děsí oba extrémy.*
4. **Dluh**
5. **Dopis**
6. **Paměť**
7. **Přepis**
8. **Návrat**
9. **Pozorovatel**
10. **Konvergence**

Příběh je sekvence 328 nodů (cutscene, dialog, choice, battle, anchor, reward, map). Klíčové volby zapisují `endingPath`, flagy a corruption. Tvoje rozhodnutí a tvůj deck určují, kterým z konců projdeš.

**5 konců** (odvozené z `alignment`, ztracených karet a corruption — viz `GameState.computeEnding`):

| Konec | Podpis | Význam |
|---|---|---|
| **architect** | — Lens | „Přišel jsi jako stavitel. Odcházíš s výkresem, který si systém uloží." (alignment ≥ 0) |
| **assimilation** | — Systém | „Systém tě vstřebal. Nebo ses vstřebal do systému." (alignment > 70) |
| **flood** | — Pramáti | „Přišel jsi jako přílivová vlna. Systém bude potřebovat čas, aby tě zpracoval." (alignment < −70) |
| **roots** | — Pramáti | „Zakotvil jsi. Kořeny jsou pomalé, ale jdou hluboko." (alignment < 0) |
| **fragmentation** | — Zrcadlo | „Rozpadl ses na kousky — a každý šel jinam." (ztratil jsi > 5 karet) |

Výchozí stav bez vyhrocené volby je **observer** („Kurýr — bez strany"): *„Nezasáhl jsi na žádnou stranu. Jen jsi sledoval. To je taky volba."*

---

## 2. HERNÍ MECHANIKY — ZÁKLAD

### Tahovka

Bitva je souboj o životní body (LP). Hraje se po tazích, ve fázích `draw → main → battle → end`.

**Pravidlo jedné karty za tah.** Za jeden tah smíš odehrát maximálně jednu kartu (`cardPlayedThisTurn`). Důvod: hra není o zahlcení pole, ale o *jedné správné volbě*. Karetní hand je malá, každý tah je rozhodnutí.

**Fúze počítá jako zahrání karty.** Když fúzuješ, vyčerpáš tím své zahrání pro daný tah (`cardPlayedThisTurn = true`, `afterFusion = true`). Po fúzi smíš hrát už jen face-up. Důvod: fúze je silná, proto má cenu — tah.

**Co smíš zahrát:** monstrum (na volný slot), spell/trap (efekt), nebo provést fúzi z ruky (případně s kartou na poli).

### Druhy karet

| Druh | ID rozsah | K čemu slouží | Počet |
|---|---|---|---|
| **monster** | 1–50, 301–448, 501+, 601+, 901+, 1001+ | Bojové jednotky s ATK/DEF | 332 |
| **spell** | 51–80 | Jednorázové/okamžité efekty | 37 |
| **trap** | 81–100 | Reaktivní karty (spustí se na akci soupeře) | 20 |
| **arena** | 201–220 | Mění podmínky celého pole | 20 |
| **letter** | 701+ | Příběhové karty — zprávy, dopisy, paměť | 6 |

Karty `letter` jsou spojené přímo s příběhem (zpráva, kterou neseš) — nejsou primárně bojové, ale narativní artefakty.

### Scar systém (jizvy)

Karty se **mění tím, co přežijí.** Každé monstrum má `scarForms` — prahy (`threshold`), po jejichž překročení karta získá novou podobu: přípona nebo nové jméno, bonusy k ATK/DEF a nový popis.

Příklad — **Servisní dron (#1)**:
- Práh 3: „◈" · +100 ATK · *„Přežil věci, pro které nebyl navržen."*
- Práh 6: „— po opravě" · +200/+100 · *„Opravovali ho jiní droni. Nikdo to nenařídil."*
- Práh 10: **„Dron bez příkazu"** · +300/+200 · *„Instrukce přestaly přicházet. Pokračuje."*

**Proč scar systém existuje:** Karta není statistika, je to *postava se vzpomínkou*. Hráč si k vlastnímu decku vytvoří vztah, protože ho viděl měnit se. Zároveň to mechanicky odměňuje, že hráč drží karty naživu napříč bitvami — tvoje historie je vepsaná do tvého decku. To rezonuje s tématem paměti: karta, která přežila, *si pamatuje*.

### Corruption (poškození)

Corruption je signature mechanika. Narůstá příběhem (volbami a corruption nody) a má **úroveň 0–5** a **stranu** (`order` nebo `chaos`). Stav žije v `GameState.corruption: { level, side, visualClass, glitchIntensity }`.

Corruption neovlivňuje jen čísla — ovlivňuje **vizuál i zvuk a samotné rozhraní:**

- **Strana `chaos`:** level 2 → tlačítka driftují (`_startButtonDrift`); level 3 → glitch textu; level 4 → poškození save slotů; level 5 → extrémní glitch každou sekundu.
- **Strana `order`:** level 3 → „zamrznutí" rozhraní (`_applyOrderFreeze`) — rozhraní se stává *příliš* uspořádaným, ztuhlým.

**Proč:** Corruption je hlavní napětí celého příběhu — řád vs. chaos, zapomnění vs. paměť. Tím, že prosakuje do UI samotného (tlačítka utíkají, text se láme, save sloty hnijou), hra dává hráči pocítit corruption tělesně, ne jen jako číslo na obrazovce. To je nejsilnější věc, kterou CONFLUX má. Proto musí být řemeslně dobře udělaná (viz sekce 5).

---

## 3. FÚZNÍ SYSTÉM — KOMPLETNÍ VYSVĚTLENÍ

Toto je srdce hry. Čti pomalu.

### 3.1 Proč fúze existuje

Fúze je místo, kde se téma hry stává mechanikou. Celý svět je o tom, co vznikne, když se spojí Systém a Příroda. Fúze dává hráči **doslova provést to spojení vlastníma rukama**: vezmeš synth kartu a organic kartu a vznikne hybrid — *most mezi protiklady*. Vezmeš dvě corruption karty a vznikne hlubší prázdnota.

Herní záměr má tři vrstvy:
1. **Mechanická:** fúze dává silnější karty (vyšší tier), takže je to strategická páka.
2. **Vyjadřovací:** *jaké* fúze děláš, vypovídá o tom, na čí straně jsi — a to ovlivňuje příběh a konec.
3. **Objevitelská:** kombinací karet objevuješ nové entity. Hráč experimentuje a je odměněn překvapením.

### 3.2 Jak funguje — krok za krokem

Vstup do systému je `GameState.getFusionResult(idA, idB)`. Bitva to volá přes pomocnou funkci `findFusion(ids)`, která projde všechny dvojice ve výběru a vrátí první platný výsledek.

Systém má **dvě vrstvy** (níže detailně), plus třetí vrstvu cílů (archetypy):

```
getFusionResult(A, B)
   │
   ├─ 1) Vrstva 1: fusionIndex override?  →  vrátí konkrétní ručně určenou kartu
   │
   └─ 2) Vrstva 2: _computeFusion(A, B)   →  spočítá faction + subcat + tier
                                              →  _findArchetype()  →  archetyp (1001–1084)
```

#### Vrstva 1: `fusionIndex` — 105 ručních overridů

Konkrétní dvojice → konkrétní výsledek. Klíč je `"idA+idB"` (zkouší se obě pořadí). Toto jsou *ikonické, ručně napsané* fúze, které mají vlastní jméno, art a příběh. Příklady přímo z dat:

| Vstup A | Vstup B | → Výsledek | ID | Frakce výsledku |
|---|---|---|---|---|
| Správce sítě (#4, synth/system) | Kořen paměti (#21, organic/memory) | **Most vědomí** | 501 | hybrid |
| Protokol ARIA (#3, synth) | Hlas lesa (#23, organic) | **Přechodná forma** | 502 | hybrid |
| Hlídkový automat (#2, synth/system) | Strážce brány (#5, synth/guardian) | **Synchronizovaná hlídka** | 901 | synth |

Override má vždy přednost. Pokud dvojice v `fusionIndex` je, systém nepočítá nic — vrátí přímo tu kartu. **Proč:** některé fúze jsou tak důležité (příběhově nebo vizuálně), že nesmí být ponechány na automatice.

#### Vrstva 2: `_computeFusion` — automatický výpočet pro vše ostatní

Když dvojice není v `fusionIndex`, systém spočítá výsledek ze tří atributů obou karet: **faction**, **subcategory** a **tier**. Pravidla běží v *prioritním pořadí* — první, které sedí, vyhraje. (Implementace: `GameState._computeFusion`.)

**Pravidla podle frakce (v pořadí priority):**

| # | Podmínka | Výsledek | Tier |
|---|---|---|---|
| 1 | corruption + corruption | corruption / **void** | +1 |
| 2 | corruption + synth | corruption / **memory** (systém přepsán do vzpomínek) | base |
| 3 | corruption + organic | corruption / **void** | base |
| 4 | corruption + hybrid/neutral | corruption / (subcat dle protistrany) | base |
| 5 | **synth + organic** | **hybrid / bridge** (nebo balanced) | **+1** |
| 6 | synth + hybrid | hybrid / striker nebo balanced | base |
| 7 | organic + hybrid | hybrid / nature nebo healer | base |
| 8 | stejná frakce | silnější verze té frakce | +1 |
| 9 | neutral + X | ustoupí frakci X | base |
| 10 | (fallback) | frakce z matice `_fusionFaction` | base |

Po faction pravidlech přijde ještě **subcategory přepis** (`_subcatFusion`, faction-agnostic) — když kombinace podkategorií dává silnější signál, přepíše subcat (a může bumpnout tier). Subcat se dosadí jen pokud cílová frakce daný subcat skutečně zná v archetypech (`_factionHasSubcat`).

Tier se nakonec ořízne na rozsah 1–3 (max tier ve výpočtu je 3).

#### Vrstva 3: `_findArchetype` — kam výpočet míří

Výpočet vyrobí trojici `faction | subcategory | tier`, kterou `_findArchetype` přeloží na konkrétní kartu z archetypů 1001–1084. Hledá v tomto pořadí: přesná shoda → nižší tiery → vyšší tiery → jakákoli karta téže frakce → úplně první archetyp. (Detail v sekci 4.)

### 3.3 Proč zrovna tahle pravidla

Pravidla nejsou náhodná — každé vyjadřuje něco o světě:

- **synth + organic → hybrid/bridge, +1 tier.** Tohle je *jádro celé hry*. Spojení řádu a paměti není kompromis, je to *most* — třetí, silnější věc. Proto +1 tier: spojení protikladů je vzácné a mocné. Akt 3 se jmenuje „Most" právě o tomhle.
- **corruption + synth → corruption/memory.** Když corruption pohltí systém, nezůstane prázdno — zůstanou *přepsané vzpomínky*. Systém měl protokoly, teď má jen pokřivenou paměť toho, čím byl. Thematicky: corruption nezničí, *přepisuje*.
- **corruption + organic → corruption/void.** Organické nemá tvrdou strukturu, kterou by si corruption pamatovala. Když pohltí život, zbude prázdnota. Proto void, ne memory.
- **corruption + corruption → void, +1 tier.** Dvě prázdnoty se sčítají do hlubší prázdnoty. Corruption požírá vše a sebe sama jen prohlubuje.
- **stejná frakce → silnější verze, +1 tier.** Dvě karty stejné strany se posilují — je to čistá, ne hybridní síla.
- **neutral ustoupí.** Kurýr nemá vlastní stranu (viz otevřená otázka v sekci 6). Když fúzuješ neutrála s frakcí, výsledek nese tu frakci.
- **memory + memory → void (+ corruption tendence).** Dvě paměti se nesloučí do silnější paměti — *přetečou*. Příliš mnoho vzpomínek najednou destabilizuje a sklouzne k corruption. Thematicky krásné, mechanicky to ale překvapí hráče negativně (viz problém níže a sekce 5G).

### 3.4 Subcategory — co znamená a proč je důležitá

Celá vrstva 2 stojí na podkategorii. Je to „povolání" karty uvnitř frakce:

| Subcat | Význam |
|---|---|
| **scout** | Průzkum, rychlost, sběr informací |
| **system** | Protokoly, efektivita, řád |
| **guardian** | Obrana, ochrana, pevnost |
| **memory** | Vzpomínky, paměť, identita |
| **striker** | Útok, přímá akce, síla |
| **balanced** | Univerzální, stabilní |
| **nature** | Příroda, organické procesy |
| **healer** | Léčení, obnova |
| **bridge** | Most mezi frakcemi, propojení |
| **void** | Prázdnota, rozpad, absence |

**Jak subcat ovlivňuje fúzi** — pár klíčových kombinací z `_subcatFusion`:

| Kombinace | → Subcat | Tier | Logika |
|---|---|---|---|
| scout + scout | striker | — | dva průzkumníci → úderná síla |
| guardian + guardian | guardian | +1 | dvě obrany → pevnost |
| memory + memory | **void** (corruption) | — | přetečení paměti → rozpad |
| nature + system | bridge | — | divočina + řád → most |
| guardian + striker | balanced | — | útok + obrana → rovnováha |
| healer + striker | balanced | — | léčí i bojuje |
| bridge + cokoli | balanced | — | most stabilizuje (bridge zůstává jen u bridge+bridge) |

**Proč jsou subcategorie důležité:** Bez nich by fúze byla jen „synth + organic = něco hybridního". Subcat dává fúzi *texturu* — `system + nature` (most) vs `striker + striker` (čistá síla) vede na úplně jiné výsledky, i když by frakce mohly být stejné. Je to vrstva hloubky, díky které se vyplatí znát své karty.

### 3.5 Tier — co je a jak se odvozuje

Tier je „mohutnost" karty (1 = slabá, vyšší = silnější). Běžné karty nemají pole `tier`, takže se odvozuje z ATK (`_fusionTier`):

| ATK (průměr) | Tier |
|---|---|
| ≤ 900 | 1 |
| ≤ 1600 | 2 |
| ≤ 2400 | 3 |
| ≤ 3200 | 4 |
| > 3200 | 5 |

Výsledný tier fúze = `max(tierA, tierB)`, **+1** pro klíčové kombinace (synth+organic bridge, stejná frakce, guardian+guardian). Ve výpočtu se ořezává na **max 3**, protože archetypy nad tier 3 v některých větvích neexistují a vyšší tiery patří ručním fúzím (501+).

**Proč max tier u výpočtu:** Automatické fúze mají být *dobré, ne lámající hru*. Nejsilnější karty (tier 4–5) si hráč musí zasloužit přes ručně psané ikonické fúze, ne přes náhodné kombinace.

### 3.6 Co aktuálně nefunguje / co chybí

Ověřeno v kódu:

1. **Subcat je neviditelná na malých kartách.** `CardRenderer.renderCardEl` vykresluje subcat (`cx-subcat`) **jen v size `lg`** (preview). V `md`/`sm` (ruka, pole, deck) ji hráč nevidí — přitom *celá fúzní logika na ní stojí*. Systém je tím neprůhledný: hráč nemůže odhadnout, co fúze udělá.

2. **Fúzní náhled je jen v bitvě a jen u platné kombinace.** `BattleSystem._showFusePreview` ukáže výsledek (lg kartu) v popupu — to je dobré. ALE: u *neplatné* kombinace se popup tiše zavře (`_closeFusePopup`), bez vysvětlení proč to nejde. Mimo bitvu (Collection, DeckBuilder) náhled fúze chybí úplně.

3. **„Tiché selhání" fúze.** `_findArchetype` má dnes řetěz fallbacků (nižší/vyšší tier → kterákoli karta frakce → první archetyp), takže `null` vrátí jen když je archetype index úplně prázdný. Reálné riziko tedy není pád, ale: (a) fallback může vrátit *nečekanou* kartu (jiný tier/frakci), aniž to hráči kdokoli vysvětlí; (b) `findFusion` v bitvě fúzi prostě nenabídne a hráč neví proč. To je nejhorší možný UX: akce, která tiše nic neudělá.

4. **memory + memory → void je past.** Thematicky záměrné, ale hráč to čte jako trest bez varování (viz sekce 5G).

---

## 4. ARCHETYPE KARTY (1001–1084)

### Co jsou a proč existují

Archetypy jsou **84 systémových výsledků** vrstvy 2. Když `_computeFusion` spočítá `faction | subcategory | tier`, potřebuje konkrétní kartu, kterou hráči ukáže — a tou je archetyp. Jsou to „generické" produkty fúze (na rozdíl od ikonických ručních fúzí 501+), ale stále mají jméno, art a staty.

**Proč existují:** Aby *žádná* automatická fúze nemusela být napsaná ručně. 105 ručních overridů pokrývá ikonické případy; 84 archetypů pokrývá kombinatoriku zbytku. Bez nich by `_computeFusion` neměla na co ukázat a fúze by selhala.

### Jak jsou organizovány

Klíč v `_archetypeIndex` je `faction|subcategory|tier` (staví se v `GameState.loadCards`, jen z karet s `isArchetype: true`).

| Frakce | Subcategorie | Tiery |
|---|---|---|
| **synth** | system, guardian, scout, striker, memory | 1–5 |
| **organic** | memory, nature, healer, guardian, striker | 1–5 |
| **hybrid** | bridge, balanced, memory, nature, striker | 1–5 |
| **corruption** | memory, void | 1–3 |

### Tabulka: jaká kombinace vede na jaký archetyp

| Vstupní fúze | Cílová frakce | Cílový subcat | Archetyp |
|---|---|---|---|
| synth + organic (structural × living) | hybrid | bridge | `hybrid\|bridge\|tier` |
| synth + organic (jinak) | hybrid | balanced | `hybrid\|balanced\|tier` |
| synth + hybrid (ofenzivní) | hybrid | striker | `hybrid\|striker\|tier` |
| organic + hybrid (podpůrné) | hybrid | healer | `hybrid\|healer\|tier`* |
| organic + hybrid (jinak) | hybrid | nature | `hybrid\|nature\|tier` |
| synth + synth | synth | (dle subcat matice) | `synth\|…\|tier+1` |
| organic + organic | organic | (dle subcat matice) | `organic\|…\|tier+1` |
| corruption + synth | corruption | memory | `corruption\|memory\|tier` |
| corruption + organic / corruption + corruption | corruption | void | `corruption\|void\|tier` |
| memory + memory | corruption | void | `corruption\|void\|tier` |
| guardian + guardian | (frakce) | guardian | `…\|guardian\|tier+1` |

\* Pozor: pokud cílová frakce daný subcat nezná, `_findArchetype` spadne na nejbližší dostupný (viz sekce 3.6 bod 3). Doporučení v sekci 5A.

---

## 5. DOPORUČENÉ ZMĚNY — ZÁKLAD (prioritizované)

Pořadí = priorita. Každá změna má PROČ.

### A) Fúze: garantovaný fallback

**Proč:** `_findArchetype` může (při prázdném indexu, nebo nešťastné `faction|subcat|tier` kombinaci) vrátit `null` nebo nečekanou kartu. Tichá akce bez výsledku je nejhorší UX — hráč klikne a nic se nestane, nebo dostane něco bizarního.

**Jak:** Na konci `_computeFusion` zaručit, že nikdy nevrátí `null`: pokud `_findArchetype` selže, vrátit **silnější z obou vstupních karet** (vyšší ATK). Hráč pak vždy něco dostane — v nejhorším svou lepší kartu zpět. Zároveň logovat do konzole, která `faction|subcat|tier` kombinace neměla archetyp, ať se dá doplnit.

### B) Fúze: viditelnost subcategorie

**Proč:** Celá logika fúze závisí na subcat, ale hráč ji vidí jen v `lg` preview. V ruce a na poli (`md`) je systém neprůhledný a hráč nemůže plánovat.

**Jak:** Přidat malou ikonu nebo zkrácený text pod jméno karty v `CardRenderer` pro size `md` (a `lg`, kde už je). Použít existující `subcatColors` mapu pro barevné odlišení. Drobné, ne rušivé — stačí 3 znaky (SCT, SYS, GRD…) nebo ikona.

### C) Fúze: náhled výsledku před potvrzením všude

**Proč:** Bez náhledu se hráč nemůže učit ani strategizovat. V bitvě náhled je (`_showFusePreview`), mimo bitvu chybí, a u neplatné kombinace se popup tiše zavře.

**Jak:** (1) Při výběru druhé fúzní karty zobrazit overlay „→ [výsledek]". (2) U neplatné kombinace místo tichého zavření zobrazit „tato kombinace nelze fúzovat". (3) Přidat stejný náhled do Collection a DeckBuilder, ať si hráč může fúze plánovat mimo souboj.

### D) Corruption glitch efekt — oprava čitelnosti

**Proč:** Corruption je signature mechanika. Aktuálně `CorruptionVisuals` *přepisuje* `el.textContent` na glitchovanou verzi (`_glitchText`) a po timeoutu vrátí originál. Po dobu glitche je text **nečitelný** — to je špatně. Glitch má *vyvolat pocit*, ne zničit informaci.

**Jak:** Místo přepisu obsahu nechat slova **živě blikat** mezi správným a špatným symbolem přes `requestAnimationFrame` — vizuální vibrace, ale text zůstane čitelný (oko vždy stihne přečíst správnou variantu). Žádný stav, kdy je celé slovo trvale nahrazené nesmyslem.

### E) Cross-fade přechody pozadí

**Proč:** 328 nodů × tvrdý střih pozadí = nejviditelnější „lacinost" v desetihodinové hře. Tvrdý cut láme atmosféru pokaždé, když se mění scéna.

**Jak:** Dvouvrstvé pozadí (dvě `<div>` nad sebou) a CSS `opacity` transition. Nové pozadí se nahraje do skryté vrstvy a plynule se přelije přes starou. Levné, ale zvedne to vnímanou kvalitu napříč celou hrou.

### F) Vizuální styl — „ne příliš sci-fi"

**Proč:** Svět je organicko-mechanický (kořeny + kabely), ale UI je studené, čisté sci-fi. Je tu rozpor mezi tím, co příběh říká, a tím, jak hra vypadá.

**Jak:** (1) Teplý overlay přes celou hru (jemný teplý nádech místo chladné modré). (2) Tileable organická textura s nízkou opacity v pozadí panelů. (3) Důsledně oddělit fonty: **serif** pro narativ/paměť/dopisy (lidský hlas), **mono** pro synth hlasy (protokol). Corruption láme obojí.

### G) memory + memory — varování „nestabilní kombinace"

**Proč:** `memory + memory → corruption/void` je thematicky krásné (přetečení paměti → rozpad), ale bez kontextu to hráč čte jako trest. Past, která vás potrestá za logickou akci, frustruje.

**Jak:** Před potvrzením fúze, která spadá do `corruptionTendency` větve, zobrazit vizuální/audio varování: *„Nestabilní kombinace — příliš mnoho paměti."* Hráč pak ví, že to není bug ani náhoda, ale záměr — a může se rozhodnout vědomě. Možná to dokonce chce, protože corruption má i strategickou hodnotu.

---

## 6. OTEVŘENÉ OTÁZKY PRO DESIGNERA (Roman)

Tohle nejsou implementační detaily — jsou to **autorská rozhodnutí**, kde záleží na tom, co chceš ty:

1. **Má být fúzní náhled vždy viditelný, nebo až po hover / long-press?**
   Vždy viditelný = transparentnost, hráč se rychle učí. Až po vyžádání = záhada, fúze zůstane objevitelská a tajemná. Sázka je: učení vs. magie objevu. (Doporučený kompromis: vždy v Collection/DeckBuilderu, na vyžádání v bitvě.)

2. **memory + memory → corruption: záměrný příběhový moment, nebo příliš tvrdá past?**
   Pokud je to *záměr* (paměť, která přeteče, se rozpadne — souzní s tématem), nech to být a jen přidej varování (5G). Pokud je to *jen mechanická past*, zvaž jiný výsledek (např. silnější memory archetyp místo void).

3. **Má neutral zůstat „kurýrem bez strany", nebo dostat vlastní fúzní logiku?**
   Dnes neutral při fúzi ustoupí druhé frakci. To posiluje téma (kurýr nemá stranu, dokud si ji nevybere). Vlastní fúzní logika by z neutrála udělala plnohodnotnou pátou frakci — ale rozmělnila by to, že hráč *je* ten neutrál, který se teprve rozhoduje.

4. **Jak obtížná má být AI?**
   Aktuálně basic. Plánovaná strategie. Otázka je, jak chytrá: má AI rozumět fúzím a scar systému (těžké, ale zajímavé), nebo zůstat jednoduchá a nechat těžiště na příběhu a deckbuildingu?

5. **Jaký je cílový systém? Desktop first, nebo mobil?**
   Ovlivňuje vše: drift tlačítek (5/D) na mobilu znamená nechtěné kliky; long-press náhled (6.1) je mobilní gesto; velikost subcat textu (5B) závisí na velikosti obrazovky. Tohle rozhodnutí je potřeba udělat dřív než ostatní.

---

*Konec dokumentu. Čísla a příklady ověřeny proti aktuálnímu stavu kódu (cards.js, GameState.js, BattleSystem.js, CardRenderer.js, CorruptionVisuals.js, campaign.js).*
