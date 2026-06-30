# CONFLUX — ART BIBLE (stylová bible pro generování assetů)

> Jediný zdroj pravdy pro vzhled VŠECH nově generovaných assetů.
> Tenhle dokument se vkládá (deterministicky) do každého promptu, aby 415 karet,
> 64 pozadí a 16 portrétů vypadalo jako JEDEN svět, ne jako náhodná sbírka.
>
> **Rámy karet, rámečky a logo se NEgenerují — zůstávají beze změny.**

---

## 0. ZÁVAZNÁ PRAVIDLA (platí pro úplně všechno)

1. **Blízká budoucnost, NE fantasy.** Žádní draci, čarodějové, meče, magické runy, středověk.
   Vše musí být uvěřitelné jako technologie/příroda za ~50–150 let. Sci-fi grounded, ne space opera.
2. **Drž se popisku karty (`desc`).** Subjekt obrázku = to, co říká `name` + `desc` dané karty.
   Bible určuje JAK to vypadá, popisek určuje CO to je. Popisek vyhrává nad volnou fantazií.
3. **Organicko-mechanický svět.** Kabely prorůstají kořeny, protokoly mají paměť, stromy „mluví"
   v datových paketech. Kov a tkáň, beton a mech, displeje které vypadají jako by rostly.
4. **Teplá, ne studená budoucnost.** Tlumené tóny, žádný cyberpunkový neon, žádná sterilní bílá scéna.
   Atmosféra spíš „obydlené, opotřebované, organické" než „čistá laboratoř".
5. **Žádný text v obrázku.** Žádné nápisy, čísla, loga, watermarky, UI prvky — text dává rám karty.
6. **Bez okrajů a rámečků** v samotném artworku (rám karty se přidá v enginu).

---

## 1. GLOBÁLNÍ VIZUÁLNÍ JAZYK

- **Médium:** malovaný digitální concept art / klíčová ilustrace. Bohaté textury, viditelný tah,
  malá hloubka ostrosti. NE 3D render, NE fotorealismus, NE anime, NE pixel-art, NE cel-shading.
- **Světlo:** jeden měkký dominantní zdroj, atmosférická mlha/prach, jemný volumetrický nádech.
- **Paleta (základ celé hry):** tlumená zemitá — antracit, mokrá hlína, mech, rez, kostní bílá,
  matná měď. Akcenty nasycené střídmě a jen podle frakce (viz níže).
- **Nálada:** melancholická, kontemplativní, „něco se rozhoduje". Klid před/po zlomu, ne akční řež.
- **Detail:** střední až vysoký, ale čitelná silueta na malém rozměru (karta je malá).

---

## 2. FRAKCE — barevný a charakterový klíč

Každá karta má `faction`. Frakce určuje paletu akcentů, materiál a „pocit".

### synth — *Chladná struktura* („Funguje to. Nech to fungovat.")
- **Akcenty:** chladná tyrkysová / oceloměď, jantarové stavové diody. Na teplém podkladu, ne na neonu.
- **Materiál:** matný kov, keramický plát, opotřebovaný kompozit, tenké světelné linky, spáry, šrouby.
- **Forma:** přesná, modulární, symetrická. Geometrie, mřížky, opakující se prvky.
- **Pocit:** řád a efektivita, ale unavený — stroj který slouží dlouho a možná zapomněl proč.

### organic — *Teplá paměť* („Pamatuj si, co jsi byl.")
- **Akcenty:** mechová zeleň, jantar, hlinková okrová, teplé biolumin. body.
- **Materiál:** kůra, mycelium, šlachy, kámen porostlý, vlhká hlína, chitin, listoví.
- **Forma:** asymetrická, rostlá, plynulá. Příroda, která si pamatuje.
- **Pocit:** živé, prastaré, vědomé. Příroda jako paměť, ne jako idyla.

### hybrid — *Most* („Nemusíš si vybrat stranu.")
- **Akcenty:** kombinace synth tyrkys + organic zeleň/jantar ve VYVÁŽENÉ kompozici.
- **Materiál:** kov prorostlý kořeny, displej v kůře, kabel jako šlacha. Srůst, ne koláž.
- **Forma:** symetrie potkává organický růst — třetí cesta, ne půl na půl nalepené.
- **Pocit:** smíření protikladů, křehká rovnováha, naděje s napětím.

### corruption — *Rozpad* („Zapomeň. Je to snazší.")
- **Akcenty:** purpurová/magenta a hluboká čerň, glitch, prázdná místa kde chybí data.
- **Materiál:** rozpadající se hmota, statický šum, „vyžraná" textura, fraktální trhliny, void.
- **Forma:** láme synth i organic — rozbitá symetrie, hnijící růst, dezintegrace okrajů.
- **Pocit:** ztráta, pohlcení, tichá hrozba. Krásné a špatné zároveň.

### neutral — *Bez strany* („Jen nesu zprávu.")
- **Akcenty:** odbarvené, šedo-béžové, jediný teplý lidský akcent (lampa, dopis, dlaň).
- **Materiál:** obyčejné — látka, kůže, papír, ošoupaný kov. Lidské měřítko.
- **Forma:** prostá, civilní, bez frakční okázalosti.
- **Pocit:** osamělý poutník mezi systémy. Civilní, zranitelné, lidské.

---

## 3. TYP KARTY (`kind`) — kompozice

- **monster** — jedna bytost/entita, hrdinská centrální kompozice, čelní nebo 3/4 pohled,
  vyplňuje rám, jasná silueta. Prostředí jen naznačené za ní.
  - `subcategory` ladí archetyp: `scout`=hbitý/lehký, `guardian`=těžký/obranný,
    `system`=technický/uzlový, `memory`=archivní/světelný, `nature`=rostlý/živel.
- **spell** — žádná bytost; energie / jev / gesto. Abstraktnější, dynamické, světelný efekt
  vyjadřující účinek (buff = vzestup/záře, dmg = roztržení, heal = teplý proud).
- **trap** — skrytý mechanismus / nastražená situace, napětí „těsně před spuštěním",
  tlumené, tísnivé, detail pasti spíš než postavy.
- **arena** — krajina / lokace bez postavy, široký environmentální záběr, vhodné i jako pozadí bitvy.
- **letter / story** — intimní, narativní, lidský objekt (dopis, ruka, detail). Serifová „lidská" nálada.

---

## 4. RARITY (`rarity`) — intenzita, ne změna stylu

Vzácnost nemění styl, jen nákladnost provedení:
`common` střídmé · `uncommon` bohatší detail · `rare` výrazné nasvícení/atmosféra ·
`unique`/`legendary` výjimečná kompozice, dramatické světlo, „klíčový vizuál".

---

## 5. TECHNICKÉ SPECIFIKACE

- **Card artwork:** čtverec **1024×1024**, motiv komponovaný s rezervou u krajů
  (rám karty ořízne ~5 % okraje). Ukládat jako `assets/images/cards/<ID>.jpg`, kvalita ~85.
- **Background:** **1536×1024** (na šířku), motiv lokace, méně kontrastní centrum
  (přes pozadí běží UI a karty). Ukládat do `assets/images/backgrounds/<název>.jpg`.
- **Portrait:** **1024×1024** nebo 3/4 portrét, konzistentní per-postava (viz §6),
  neutrální pozadí, do `assets/images/portraits/<jméno>.png`.
- **card_back:** čtverec, frakčně neutrální symbol konfluxu (synth+organic srůst), tlumený.

---

## 6. KONZISTENCE (nejdůležitější a nejtěžší)

gpt-image-1 nemá nativní style-reference, proto:

1. **Stylový blok (§0–§2) jde do KAŽDÉHO promptu** doslova — to drží jednotný „štětec".
2. **Portréty postav** = reference-based: pro každou ze 16 postav vznikne 1 „master" portrét,
   ten se posílá jako referenční vstup (image edit) do všech dalších jejích výskytů.
3. **Fúzní karty** (501+/901+/1001+) generovat s referencemi obou rodičovských karet,
   aby fúze vizuálně navazovala.
4. **Pevný negativní seznam** (viz §7) v každém promptu.
5. **Stejný `seed`/styl deskriptor** napříč jednou frakcí v rámci jedné dávky.

---

## 7. NEGATIVNÍ SEZNAM (vždy potlačit)

text, nápisy, čísla, logo, watermark, podpis, UI, rámeček, okraj, koláž, více panelů,
mřížka obrázků, fotorealismus, 3D render, anime, manga, kreslený styl, pixel art,
neonový cyberpunk, sterilní bílé studio, meč, drak, čaroděj, fantasy brnění, středověk.

---

## 8. PROMPT ŠABLONA (skládá orchestrátor)

```
[STYLE] {globální blok §1} {frakční blok §2 podle card.faction}
[SUBJECT] {card.name} — {card.desc}  (typ: {card.kind}, subkat.: {subcategory})
[COMPOSITION] {pravidlo podle kind §3}
[QUALITY] {rarity §4}
[TECH] {specifikace §5 podle typu assetu}
[NEGATIVE] {seznam §7}
```

Subjekt (`name`+`desc`) je jediná proměnná část; zbytek je konstantní → konzistence.
