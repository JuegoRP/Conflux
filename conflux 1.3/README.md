# CONFLUX

Narativní deckbuilding karetní hra pro prohlížeč. Hráč se ujímá role kurýra doručujícího záhadný dopis skrze nepřátelský svět — každá volba formuje příběh, alignment a vizuální podobu světa.

**Jazyk:** čeština  
**Verze:** 1.3  
**Platforma:** moderní webový prohlížeč (Chrome, Firefox, Safari, Edge)

---

## Spuštění

Hra vyžaduje lokální HTTP server kvůli ES modulům:

```bash
# Python
python -m http.server 8080

# Node.js
npx serve .
```

Pak otevři `http://localhost:8080`

---

## Struktura projektu

```
conflux 1.3/
├── index.html              ← jediný HTML soubor, nemění se
├── main.js                 ← boot sekvence
├── engine/
│   ├── EventBus.js         ← pub/sub komunikace mezi moduly
│   ├── GameState.js        ← centrální stav hry
│   ├── Router.js           ← přepínání obrazovek s fade přechody
│   ├── SaveManager.js      ← 3 save sloty v localStorage
│   ├── AssetManager.js     ← cache obrázků a zvuků
│   └── AssetLoader.js      ← načítání JSON/JS dat
├── modules/
│   ├── MainMenu.js         ← hlavní menu, intro animace
│   ├── StoryEngine.js      ← příběhový engine, dialogy, volby
│   ├── BattleSystem.js     ← tahový soubojový systém
│   ├── DeckBuilder.js      ← editor decku
│   ├── Collection.js       ← galerie karet
│   ├── FreeBattle.js       ← volný souboj (trénink)
│   ├── LetterEngine.js     ← závěrečné dopisy podle endingu
│   ├── Cutscene.js         ← přehrávání videí
│   ├── CardRenderer.js     ← renderování karet
│   ├── EffectEngine.js     ← resoluce efektů karet
│   ├── AudioSystem.js      ← hudba a SFX, crossfade
│   ├── CorruptionSystem.js ← herní mechanika korupce
│   └── CorruptionVisuals.js← vizuální degradace světa
├── data/
│   ├── cards.js            ← databáze 370+ karet
│   ├── campaign.js         ← 100+ story uzlů, 10 aktů
│   └── enemies.js          ← 31 nepřátel s AI styly
├── styles/
│   └── global.css          ← veškeré styly a CSS animace
└── assets/
    ├── images/             ← pozadí, portréty, rámečky karet
    └── audio/              ← hudba a zvukové efekty
```

---

## Herní systémy

### Alignment
Škála −100 (Řád/Synth) až +100 (Chaos/Organic). Volby v příběhu mění alignment, který určuje dostupnost dalších voleb, vizuální korupci světa a typ závěrečného endingu.

### Karty a frakce
Čtyři frakce: **Synth** (pořádek), **Organic** (příroda), **Hybrid** (fúze), **Corruption** (entropie). Deck má 30 karet, max. 3 kopie jedné karty. Fúzní systém kombinuje karty a vytváří výsledky ze 140+ receptů.

### AI nepřátelé
Každý nepřítel má styl: agresivní, defenzivní, vyvážený, reaktivní, strategický, mirror, akumulátor nebo perfekcionista.

### Korupce
5 vizuálních úrovní degradace — od jemného fialového nádechu přes glitch textu až po třesení obrazovky. Korupce se projevuje pouze vizuálně, herní text zůstává vždy čitelný.

### Endings
4 závěrečné cesty: `protokol` (Řád), `koreny` (Organic), `most` (Rovnováha), `za_ramem` (Prázdno). Ending závisí na alignmentu a herním stylu hráče — hra sleduje playstyle metriky po celou dobu.

---

## Přidání nového modulu

1. Vytvoř `modules/NazevModulu.js` s rozhraním:
   ```js
   const NazevModulu = {
     init(container, params) { /* vykresli */ },
     destroy()               { /* uvolni listenery */ }
   };
   export default NazevModulu;
   ```
2. Zaregistruj v `main.js` přes `Router.register('nazev', NazevModulu)`.

---

## Komunikace mezi moduly

Moduly nikdy nevolají jiný modul přímo — vždy přes EventBus:

```js
// vyslat
EventBus.emit('battle:ended', { result: 'victory', alignmentDelta: 10 });

// naslouchat
EventBus.on('battle:ended', ({ result }) => {
  Router.goto('story', { continueAfter: result });
});
```

---

## Technologie

- Vanilla JavaScript (ES6 moduly) — žádný build krok
- HTML5 / CSS3 (Grid, Flexbox, CSS animace, filtry)
- Web Audio API (korupční distorze zvuku)
- localStorage (save systém, ~50 KB na slot)
