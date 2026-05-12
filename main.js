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
  _showBootScreen('Načítám…');

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
    if(e.target.closest('button, [data-hand], .m-btn, .db-card-item, .vn-screen, .cx-card')) {
      EventBus.emit('ui:click');
    }
  });

  // 8. Hudbu hlavního menu spouští MainMenu.init() sám

  // 9. Zobraz menu nebo pokračuj ze save
  _showBootScreen('');

  if(GameState.hasCheckpoint()) {
    Router.goto('menu');  // MainMenu nabídne "Pokračovat"
  } else {
    Router.goto('menu');
  }
}

// ── EventBus listener — bitva skončila ────────────────────────────────────────
EventBus.on('battle:ended', ({ won, nodeId }) => {
  // StoryEngine zpracuje výsledek přes svůj vlastní listener
  // Tady jen trackujeme globální statistiky
  GameState.campaign.battlesTotal++;
  if(won) GameState.campaign.battlesWon++;
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
  const endingId = params?.endingId || 'most';
  const backgrounds = {
    protokol: 'assets/images/backgrounds/ending_protokol.jpg',
    koreny:   'assets/images/backgrounds/ending_koreny.jpg',
    most:     'assets/images/backgrounds/ending_most.jpg',
    za_ramem: 'assets/images/backgrounds/ending_zaramem.jpg',
  };
  const bg = backgrounds[endingId];

  container.innerHTML = `
    <div class="ending-wrap" style="${bg ? `background-image:url('${bg}')` : ''}">
      <div class="ending-overlay"></div>
      <button class="ending-to-letter">Číst dopis →</button>
    </div>`;

  AudioSystem.playMusic(`ending_${endingId}`, { loop: false, fadeIn: 2000 });

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
  root.innerHTML = `
    <div class="boot-screen ${isError ? 'boot-screen--error' : ''}">
      <div class="boot-logo">CONFLUX</div>
      <div class="boot-message">${message}</div>
    </div>`;
}

// ── Start ─────────────────────────────────────────────────────────────────────
boot().catch(err => {
  console.error('[main] Boot selhal:', err);
  _showBootScreen('Kritická chyba. Obnovte stránku.', true);
});
