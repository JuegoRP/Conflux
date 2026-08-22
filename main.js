/**
 * main.js — CONFLUX
 * Vstupní bod. Inicializuje vše ve správném pořadí.
 *
 * Pořadí:
 *  1. EventBus (žádné závislosti)
 *  2. GameState + načtení karet z cards.json
 *  3. AudioSystem (potřebuje GameState)
 *  4. AssetManager (potřebuje GameState)
 *  5. Router + registrace modulů
 *  6. StoryEngine (potřebuje Router)
 *  7. Pokus o načtení save → menu nebo pokračování
 */

import EventBus    from './engine/EventBus.js';
import GameState   from './engine/GameState.js';
import Locale      from './engine/Locale.js';
import Router      from './engine/Router.js';
import SaveManager from './engine/SaveManager.js';
import AssetManager from './engine/AssetManager.js';
import AssetLoader  from './engine/AssetLoader.js';
import AudioSystem  from './modules/AudioSystem.js';
import MainMenu     from './modules/MainMenu.js';
import BattleSystem from './modules/BattleSystem.js';
import DeckBuilder  from './modules/DeckBuilder.js';
import Collection   from './modules/Collection.js';
import StoryEngine  from './modules/StoryEngine.js';
import Cutscene          from './modules/Cutscene.js';
import LetterEngine       from './modules/LetterEngine.js';
import Credits            from './modules/Credits.js';
import CorruptionSystem   from './modules/CorruptionSystem.js';
import CorruptionVisuals  from './modules/CorruptionVisuals.js';
import FreeBattle         from './modules/FreeBattle.js';
import SpriteSheet        from './modules/SpriteSheet.js';
import KeyboardController from './modules/KeyboardController.js';

// ── Root element ──────────────────────────────────────────────────────────────
const root = document.getElementById('app');

// ── DEBUG globály ─────────────────────────────────────────────────────────────
window.DEBUG_EVENTS = true;
window.GameState    = GameState;
window.Router       = Router;
window.SaveManager  = SaveManager;
window.EventBus     = EventBus;
window.AudioSystem  = AudioSystem;
if(!root) {
  console.error('[main] #app element nenalezen v index.html');
}

// ── Boot sekvence ─────────────────────────────────────────────────────────────
async function boot() {
  // 0. file:// nefunguje — Chrome/Safari blokují ES moduly + media. Hra potřebuje http(s).
  if(location.protocol === 'file:') {
    _showFileProtocolWarning();
    return;
  }

  // 0a. První spuštění → uvítací výběr jazyka (blokuje boot dokud hráč nezvolí)
  if(!Locale.hasChosen()) {
    await _showLanguageGate();
  }

  _showBootScreen('Načítám…');

  // 0b. Jazyk (EN overlay MUTUJE data — musí běžet před loadCards)
  await Locale.apply();

  // 1. Načti karty (cards.json) — musí být první, vše ostatní závisí
  const cardsOk = await GameState.loadCards();
  if(!cardsOk) {
    _showBootScreen('Chyba: nepodařilo se načíst karty.', true);
    return;
  }

  // 2. CorruptionVisuals + CorruptionSystem
  CorruptionVisuals.init();
  CorruptionSystem.init();

  // 3. Audio — inicializace (AudioContext se spustí až po prvním kliku)
  AudioSystem.init();
  KeyboardController.init();

  // SFX event handler — BattleSystem emituje 'sfx:play' s typem zvuku
  EventBus.on('sfx:play', (type) => {
    const sfxMap = {
      card_play:     'sfx_card_play',
      card_select:   'sfx_card_play',
      click:         'sfx_card_play',
      fusion:        'sfx_fusion',
      clash:         'sfx_clash',
      damage:        'sfx_damage',
      direct_attack: 'sfx_direct_attack',
      spell:         'sfx_spell',
      trap:          'sfx_trap',
      arena:         'sfx_arena',
      victory:       'sfx_victory',
      defeat:        'sfx_defeat',
    };
    const key = sfxMap[type] || ('sfx_' + type);
    // Speciální zvuky hrají vždy naplno
    const loud = type === 'fusion' || type === 'victory' || type === 'defeat';
    AudioSystem.playEffect(key, loud ? 1.0 : null);
  });

  // 4. Asset manager + SpriteSheet
  // AssetManager nepotřebuje async init
  await SpriteSheet.init(); // tiché selhání pokud sprites.json neexistuje

  // 5. Registrace rout — přímo objekty, aby Router mohl volat destroy()
  Router.register('menu',       MainMenu);
  Router.register('battle',     BattleSystem);
  Router.register('freebattle', FreeBattle);
  Router.register('deck',       DeckBuilder);
  Router.register('collection', Collection);
  Router.register('story',      StoryEngine);
  Router.register('cutscene',   Cutscene);
  Router.register('letter',     LetterEngine);
  Router.register('credits',    Credits);
  Router.register('ending',     (c, p) => _showEnding(c, p));

  Router.setContainer(root);

  // SpriteSheet auto-apply po každém renderování (MutationObserver)
  const spriteObserver = new MutationObserver(() => SpriteSheet.applyAll(root));
  spriteObserver.observe(root, { childList: true, subtree: true });

  // 6. StoryEngine — přednahraj campaign.json bez renderování
  await StoryEngine.preload();

  // 7. Audio context resume — browser requirement
  const resumeAudio = () => {
    AudioSystem.initContext?.();
    document.removeEventListener('click',   resumeAudio);
    document.removeEventListener('keydown', resumeAudio);
  };
  document.addEventListener('click',   resumeAudio);
  document.addEventListener('keydown', resumeAudio);

  // ui:click → lehký klik zvuk pro UI interakce
  EventBus.on('ui:click', () => AudioSystem.playEffect('sfx_card_play', 0.35));

  document.addEventListener('click', e => {
    // .vn-screen ODEBRÁN — story si zvuk posunu řeší sama (jen při skutečném posunu, ne na každý klik)
    if(e.target.closest('button, [data-hand], .m-btn, .db-card-item, .cx-card')) {
      EventBus.emit('ui:click');
    }
  });

  // 7b. EN DOM lokalizace — přeloží zobrazené CZ texty po každém renderu (i re-renderech).
  //     Jeden observer pokrývá všechny moduly bez editace jejich render kódu.
  if(Locale.isEN()) {
    let pending = false;
    const run = () => { pending = false; try { Locale.localizeDOM(root); } catch(e) {} };
    const obs = new MutationObserver(() => { if(!pending) { pending = true; requestAnimationFrame(run); } });
    obs.observe(root, { childList: true, subtree: true, characterData: true });
    Locale.localizeDOM(root);
  }

  // 8. Hudbu hlavního menu spouští MainMenu.init() sám

  // 9. Vždy hlavní menu. Uloženou hru nabízí tlačítko "Pokračovat" v menu —
  //    NEskákat rovnou do příběhu (dřív hasCheckpoint auto-resume → hráč nikdy neviděl menu).
  _showBootScreen('');
  Router.goto('menu');
}

// ── EventBus listener — bitva skončila ────────────────────────────────────────
EventBus.on('battle:ended', ({ won, nodeId }) => {
  GameState.campaign.battlesTotal = (GameState.campaign.battlesTotal || 0) + 1;
  if(won) GameState.campaign.battlesWon = (GameState.campaign.battlesWon || 0) + 1;
});

// Autosave po každém přechodu bitva → příběh (zachová playstyle, flags, alignment)
EventBus.on('router:change', ({ to, from }) => {
  if(to === 'story' && from === 'battle') {
    // Dáme StoryEngine čas aktualizovat currentNode, pak uložíme
    setTimeout(() => {
      if(GameState.campaign?.currentNode) {
        const slot = GameState._lastSaveSlot ?? 0;
        try { SaveManager.save(slot); } catch(e) {}
      }
    }, 700);
  }
});

// ── EventBus listener — přepni hudbu při vstupu do aktu ──────────────────────
EventBus.on('story:actStart', ({ actNumber }) => {
  AudioSystem.crossfade(
    `act${actNumber - 1}_exploration`,
    `act${actNumber}_exploration`,
    2000
  );
  // Přednahraj assety pro nový akt
  AssetManager.preloadAct(actNumber);
});

// ── EventBus listener — corruption vizuály ────────────────────────────────────
EventBus.on('corruption:change', ({ level }) => {
  // Aplikuj CSS třídu na root pro globální vizuální efekty
  root.dataset.corruption = level;
  // AudioSystem zkreslí hudbu
  AudioSystem.setCorruptionFilter(level / 5);
});

// ── EventBus listener — konec hry (dopis) ────────────────────────────────────
EventBus.on('story:gameEnd', ({ endingId }) => {
  Router.goto('letter', { endingId });
});

// ── EventBus listener — brzký konec ──────────────────────────────────────────
EventBus.on('story:earlyEnding', ({ endingId, returnsTo }) => {
  EventBus.emit('analytics:earlyEnding', { endingId });
});

// ── Corruption vizuální třída na #app ─────────────────────────────────────────
function _updateCorruptionClass() {
  const app = document.getElementById('app');
  if(!app) return;
  app.classList.remove(
    'corruption-order-1', 'corruption-order-2', 'corruption-order-3',
    'corruption-chaos-1', 'corruption-chaos-2', 'corruption-chaos-3'
  );
  const cls = GameState.corruption.visualClass;
  if(cls) app.classList.add(cls);
}
EventBus.on('alignment:change', _updateCorruptionClass);
EventBus.on('router:change',    _updateCorruptionClass);
EventBus.on('battle:end', ({ result }) => {
  _updateCorruptionClass();
  console.log('[App] Bitva:', result, '| Alignment:', GameState.player.alignment);
});
EventBus.on('story:cardReceived', ({ cardId }) => {
  console.log('[App] Karta získána:', cardId);
});
EventBus.on('loading:start', () => {
  document.getElementById('loading').style.display = 'flex';
});
EventBus.on('loading:end', () => {
  document.getElementById('loading').style.display = 'none';
});

// ── Ending screen ─────────────────────────────────────────────────────────────
function _showEnding(container, params) {
  const endingId = params?.endingId || 'observer';
  // Kanonická taxonomie konců — mapuj na existující pozadí (ending_*.jpg neexistují)
  const bgMap = {
    synth:      'act1_synth.jpg',      organic:    'act2_forest_deep.jpg',
    observer:   'act9_zrcadlo.jpg',    monyra:     'act10_konvergence.jpg',
    hybrid:     'act1_hybrid.jpg',     corruption: 'act8_void.jpg',
  };
  const bgFile = bgMap[endingId] || 'act10_konvergence.jpg';
  const bg = `assets/images/backgrounds/${bgFile}`;

  container.innerHTML = `
    <div class="ending-wrap" style="background-image:url('${bg}')">
      <div class="ending-overlay"></div>
      <button class="ending-to-letter">Číst dopis →</button>
    </div>`;

  AudioSystem.playMusic('story_dramatic', { loop: false, fadeIn: 2000 });

  container.querySelector('.ending-to-letter').addEventListener('click', () => {
    Router.goto('letter', { endingId });
  });
}

// ── Boot screen ───────────────────────────────────────────────────────────────
function _showBootScreen(message, isError = false) {
  if(!message) {
    root.innerHTML = '';
    return;
  }
  // Boot běží před EN DOM observerem → přelož přímo dle zvoleného jazyka
  if(Locale.getLang() === 'en') {
    message = {
      'Načítám…': 'Loading…',
      'Chyba: nepodařilo se načíst karty.': 'Error: failed to load cards.',
      'Kritická chyba. Obnovte stránku.': 'Critical error. Please reload.',
    }[message] || message;
  }
  root.innerHTML = `
    <div class="boot-screen ${isError ? 'boot-screen--error' : ''}">
      <div class="boot-logo">CONFLUX</div>
      <div class="boot-message">${message}</div>
    </div>`;
}

// ── file:// varování ──────────────────────────────────────────────────────────
function _showFileProtocolWarning() {
  root.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      background:radial-gradient(circle at 50% 40%,#0a1420,#05080c);text-align:center;padding:30px">
      <div style="max-width:560px;display:flex;flex-direction:column;gap:22px;align-items:center">
        <div style="font-family:'Press Start 2P',monospace;font-size:clamp(24px,5vw,40px);letter-spacing:5px;color:#dfe9f2">CONFLUX</div>
        <div style="font-family:'VT323',monospace;font-size:clamp(17px,2.4vw,22px);line-height:1.5;color:#c0cce0">
          Hru nelze spustit otevřením souboru napřímo — prohlížeč z bezpečnostních důvodů zablokuje načtení.<br><br>
          <b>Hraj online</b> (itch.io / web), nebo spusť přes lokální server:<br>
          <span style="font-family:monospace;color:#8fb8d8">python3 -m http.server</span> a otevři <span style="color:#8fb8d8">http://localhost:8000</span><br><br>
          <span style="color:#8a97a8">The game can't run from a local file — please play it online, or serve it over http.</span>
        </div>
      </div>
    </div>`;
}

// ── Uvítací výběr jazyka (první spuštění) ─────────────────────────────────────
function _showLanguageGate() {
  return new Promise(resolve => {
    root.innerHTML = `
      <div class="lang-gate">
        <div class="lang-gate-logo">CONFLUX</div>
        <div class="lang-gate-sub">Vyber jazyk &middot; Choose language</div>
        <div class="lang-gate-btns">
          <button class="lang-gate-btn" data-lang="cs">ČESKY</button>
          <button class="lang-gate-btn" data-lang="en">ENGLISH</button>
        </div>
      </div>
      <style>
        .lang-gate{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
          justify-content:center;gap:28px;background:#05080c;z-index:9999}
        .lang-gate-logo{font-family:'Press Start 2P',monospace;font-size:clamp(28px,6vw,52px);
          letter-spacing:6px;color:#dfe9f2;text-shadow:0 0 24px rgba(79,163,224,0.35)}
        .lang-gate-sub{font-family:'VT323',monospace;font-size:clamp(15px,2vw,20px);
          letter-spacing:2px;color:#7f8ea0}
        .lang-gate-btns{display:flex;gap:20px;flex-wrap:wrap;justify-content:center}
        .lang-gate-btn{font-family:'Press Start 2P',monospace;font-size:13px;letter-spacing:3px;
          padding:18px 34px;background:rgba(10,16,24,0.6);color:#cdd8e6;border:1px solid rgba(79,163,224,0.4);
          border-left:3px solid #4fa3e0;cursor:pointer;transition:all .14s}
        .lang-gate-btn:hover{background:rgba(79,163,224,0.14);color:#fff;transform:translateY(-2px)}
      </style>`;
    root.querySelectorAll('.lang-gate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Locale.setLang(btn.dataset.lang);
        AudioSystem.initContext?.(); // klik = user gesture, odemkni audio
        resolve();
      }, { once: true });
    });
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
boot().catch(err => {
  console.error('[main] Boot selhal:', err);
  _showBootScreen('Kritická chyba. Obnovte stránku.', true);
});
