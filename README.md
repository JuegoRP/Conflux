# CardBound NEXUS - Architektura projektu

## Struktura souboru

```
cardbound/
  index.html              <- hlavni shell, nikdy se nemeni
  engine/
    EventBus.js           <- komunikace mezi moduly (on/emit/off)
    GameState.js          <- centralni stav cele hry
    Router.js             <- prepinani obrazovek
    SaveManager.js        <- save/load do localStorage
    AssetLoader.js        <- nacteni JSON dat a obrazku
  modules/
    MainMenu.js           <- hlavni menu (HOTOVO)
    DeckBuilder.js        <- stavba decku (TODO)
    StoryEngine.js        <- pribeh, volby, videa (TODO)
    BattleSystem.js       <- bitevni system (TODO - migrace z v04)
    Cutscene.js           <- prehravani videi (TODO)
  data/
    cards.json            <- definice vsech karet
    campaign.json         <- story uzly a vetve (HOTOVO - sablona)
    enemies.json          <- AI protivnici (HOTOVO - sablona)
  styles/
    global.css            <- sdilene styly, CSS promenne (HOTOVO)
    menu.css              <- styly menu (volitelne)
    battle.css            <- styly bitvy (TODO)
  assets/
    video/                <- MP4 cutscenes
    images/               <- pozadi, portréty, UI
    audio/                <- hudba, zvuky
```

## Jak spustit

Potrebujes lokalni HTTP server (kvuli ES modules):
  - VS Code: Live Server extension
  - Python:  `python -m http.server 8080`
  - Node:    `npx serve .`

Pak otevri: http://localhost:8080

## Postup pridavani modulu

1. Vytvor soubor v `modules/NazevModulu.js`
2. Modul musi mit strukturu:
   ```js
   const NazevModulu = {
     init(container, params) { /* vykresli se */ },
     destroy()               { /* uklidí listenery */ }
   };
   export default NazevModulu;
   ```
3. V `index.html` odkomentuj import a `Router.register()`

## Komunikace mezi moduly

NIKDY nevolej jiny modul primo. Pouzij EventBus:

```js
// Vyslat udalost (napr. v BattleSystem):
EventBus.emit('battle:end', { result: 'victory', alignmentDelta: 10 });

// Naslouchat udalosti (napr. v index.html nebo StoryEngine):
EventBus.on('battle:end', ({ result }) => {
  Router.goto('story', { continueAfter: result });
});
```

## Dalsi kroky (poradi doporuceno)

1. MainMenu.js       - HOTOVO
2. StoryEngine.js    - nacte campaign.json, zobrazuje uzly
3. Cutscene.js       - prehrava videa mezi uzly
4. BattleSystem.js   - migrace z cardbound_v04.html
5. DeckBuilder.js    - stavba decku z kolekce
6. cards.json        - presunout karty z v04 do JSON
