# CONFLUX

Narativní karetní hra (vanilla JS, ES modules). Kurýr nese dopis a neví pro koho — průchodem systémem zjišťuje, že dopis je adresovaný jemu, a že on sám je zpráva. Cesta ho mění, systém ho chce přepsat. 10 aktů, větvení Synth/Organic, korupce jako herní i vizuální mechanika, **5 různých konců** (Sigma, Pramáti, Paradox, Monyra, Lens).

> Starší pracovní název projektu: CardBound NEXUS.

## Stav projektu (k 2026-06-10) — beta-polish

**Hotovo:**
- **Kampaň napsaná — všech 10 aktů** (`data/campaign.js`), per-battle příběhový kontext
- **163 kartových artworků**, 64 backgroundů, 16 portrétů postav (kompletní obsazení), 9 rámečků
- **Hudba: 13 stop** (menu, story nálady, battle low/high corruption) + kompletní SFX sada
- Battle system po mnoha iteracích: fúze (hand+hand, hand+pole), trapy a arény face-down, limit karet za tah, DEF bounce, forcedLoss (Eli), AI s lethal detection a fúzemi
- Korupční vizuály (glitch text, UI efekty per level 0–5), Ken Burns efekt pozadí
- DeckBuilder, Collection (všechny karty + zadní strany), LetterEngine (dopis), FreeBattle, Credits

**Zbývá:**
- Act-specifická hudba (act1_intro, boss témata, Eli/Monyra témata, 4 endingy)
- Vlastní backgroundy aktů 3–10 (teď fungují přes aliasy na existující)
- Audit logiky skills / trapů / arén (dělá každá karta co říká text?)
- Vylepšení AI (skilly, strategie)
- Settings UI, výběr jazyka, EN lokalizace
- Drobný story polish (1–2 řádky kontextu u vybraných bitev)

**Zdroj pravdy o úkolech: `TODO.md` a `TODO_pribehy.md`** (per-battle review celé kampaně). Game design: `DESIGN.md`.

## Struktura

```
conflux/
  index.html              ← hlavní shell
  main.js                 ← bootstrap, registrace modulů
  engine/
    EventBus.js           ← komunikace mezi moduly (on/emit/off)
    GameState.js          ← centrální stav hry
    Router.js             ← přepínání obrazovek
    SaveManager.js        ← save/load do localStorage
    AssetLoader.js / AssetManager.js
  modules/
    MainMenu.js
    StoryEngine.js        ← kampaň, uzly, volby, korupce
    BattleSystem.js       ← bitvy, fúze, trapy, arény, AI
    DeckBuilder.js
    CardRenderer.js
    Collection.js
    Cutscene.js
    CorruptionSystem.js / CorruptionVisuals.js
    EffectEngine.js
    FreeBattle.js
    LetterEngine.js / LetterSystem.js
    AudioSystem.js
    Credits.js
    KeyboardController.js
    SpriteSheet.js
  data/
    cards.js              ← definice všech karet
    campaign.js           ← kampaň, všech 10 aktů
    enemies.js            ← AI protivníci
  styles/                 ← global.css (CSS proměnné: --px, --mono, --vt)
  assets/
    images/               ← cards/ (163), backgrounds/ (64), portraits/ (16), frames/
    audio/                ← hudba (mp3) + SFX (ogg)
```

## Jak spustit

Potřebuješ lokální HTTP server (kvůli ES modules):
  - VS Code: Live Server extension
  - Python:  `python3 -m http.server 8080`
  - Node:    `npx serve .`

Pak otevři: http://localhost:8080

## Konvence

### Přidání modulu

1. Vytvoř soubor v `modules/NazevModulu.js`
2. Modul musí mít strukturu:
   ```js
   const NazevModulu = {
     init(container, params) { /* vykreslí se */ },
     destroy()               { /* uklidí listenery, zastaví hudbu/timery */ }
   };
   export default NazevModulu;
   ```
3. V `index.html` / `main.js` přidej import a `Router.register()`

### Komunikace mezi moduly

NIKDY nevolej jiný modul přímo. Použij EventBus:

```js
// Vyslat událost (např. v BattleSystem):
EventBus.emit('battle:end', { result: 'victory', alignmentDelta: 10 });

// Naslouchat (např. ve StoryEngine):
EventBus.on('battle:end', ({ result }) => {
  Router.goto('story', { continueAfter: result });
});
```

### Další pravidla

- `destroy()` každého modulu musí zastavit hudbu (`AudioSystem.stopMusic`) a zrušit timery
- Fonty přes CSS proměnné `var(--px)`, `var(--mono)`, `var(--vt)` — ne lokální definice
- Korupce: změny emitovat přes `corruption:change`
