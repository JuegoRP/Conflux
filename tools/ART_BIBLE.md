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

- **Médium:** malovaný, texturní, „ručně dělaný" digitální obraz. Viditelný tah, bohatý detail.
  NE lesklé sci-fi, NE 3D render, NE fotorealismus, NE anime, NE pixel-art, NE cel-shading, NE fantasy.
- **ROZMANITOST je pravidlo:** každá karta má VLASTNÍ prostředí, světlo a barevnou náladu.
  ŽÁDNÁ jednotná celohrová paleta ani jeden opar přes všechno — to dělá karty uniformní (chyba v1).
  Paletu určuje FRAKCE (§2), variaci světla zajišťuje deterministický `VARIETY` klíč podle ID.
- **Svět:** obydlený, opotřebovaný, prastarý. „Blízká budoucnost", ale ne úplně sci-fi.
- **Detail:** střední až vysoký, ale čitelná silueta na malém rozměru (karta je malá).

---

## 2. FRAKCE — barevný a charakterový klíč

Každá karta má `faction`. **Frakce jsou ČISTÉ a NEMÍCHAJÍ se — jedině `hybrid` kombinuje obojí.**
Frakční negativy (v `generate.py` → `FACTION_NEG`) tuhle čistotu vynucují.

### synth — *Chladná struktura* („Funguje to. Nech to fungovat.")
- **JEN STROJ, žádná příroda.** (zakázáno: rostliny, kořeny, mech, dřevo, organická tkáň)
- **Materiál:** stará, opotřebovaná, ručně stavěná technika — patinovaný kov, korodované panely,
  prasklá keramika, obnažené kabely, nýty, ciferníky. NE lesklé futuro.
- **Paleta:** chladná ocelová modrá + tyrkys, drobné jantarové diody. **Forma:** rigidní, modulární.
- **Pocit:** stroj, co běží příliš dlouho.

### organic — *Teplá paměť* („Pamatuj si, co jsi byl.")
- **JEN ŽIVÁ PŘÍRODA, žádná technika.** (zakázáno: kov, stroje, kabely, displeje, obvody, roboti)
- **Materiál:** kůra, kořeny, mycelium, šlachy, chitin, listí, vlhký kámen, živá tkáň.
- **Paleta:** teplá — mechová zeleň, jantar, okrová, kůrová hněď, medové světlo. **Forma:** rostlá, asymetrická.
- **Pocit:** prastarý živoucí les, vědomý.

### hybrid — *Most* („Nemusíš si vybrat stranu.")
- **VÁŽNĚ OBOJÍ, zhruba 50/50** — skutečné srůstání stroje A přírody (kov srostlý s tkání,
  kořeny protkané strojem, displej v kůře, kabel jako šlacha). Žádná strana nepřevažuje. Srůst, ne koláž.
- **Paleta:** vyvážená tyrkys + zeleň. **Pocit:** křehké smíření protikladů.

### corruption — *Trhlina v realitě* („Zapomeň. Je to snazší.")
- **TRHLINA V REALITĚ, vesmírná tématika** — ne „postava", ne objekt. Subjekt je tvořen roztrženým
  časoprostorem: napůl rozpuštěný v zářivé trhlině, tříští se do voidu, statiky a hvězd, okraje se lámou/glitchují.
- **Paleta:** chorobná purpurová, magenta, hluboká čerň, duhové zlomené světlo, hvězdné pole.
- **Pocit:** realita se rozpadá ve švech; kosmický horor, „mimo".

### neutral — *Bez strany* („Jen nesu zprávu.")
- **Lidské měřítko, prakticky bez techniky.** Odbarvené šedo-béžové, vybledlá látka, kůže, papír,
  ošoupané dřevo/železo; jediný teplý lidský akcent (lampa, dopis). Civilní, osamělé, křehké.

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

> **Portréty a pozadí mají PŘEDLOHU.** Postavy (16 v `portraits/`) i lokace (64 v `backgrounds/`)
> mají zavedený design ve stávajících souborech. Nevymýšlet od nuly — použít existující obrázek
> jako REFERENČNÍ vstup (gpt-image-1 image edit) a jen ho pozvednout do nového stylu při zachování
> identity postavy/místa. Karty (card artworky) předlohu nemají → generují se čistě z popisku.

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
