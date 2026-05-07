import EventBus  from '../engine/EventBus.js';
import GameState from '../engine/GameState.js';

/**
 * CorruptionSystem — CONFLUX
 *
 * Tři vrstvy korupce dle Design Bible:
 *
 * VRSTVA 1 — VIZUÁLNÍ (kontinuální, jemná)
 *   CSS třídy na #app dle alignment, přes GameState.corruption.visualClass
 *   Řeší index.html + global.css — tady jen event listener pro synchronizaci
 *
 * VRSTVA 2 — NARATIVNÍ (kritické momenty)
 *   requireAlignment podmínky v campaign.json volbách
 *   Řeší StoryEngine._renderChoice() — viz StoryEngine.js
 *
 * VRSTVA 3 — SYSTÉMOVÁ (nejodvážnější)
 *   UI "selhává" jako fyzický projev chaosu
 *   - Tlačítka se posunou o pixel
 *   - Text se překryje
 *   - Save sloty ukáží špatná data
 *   - Při alignment < -80: jeden nečitelný frame přes obrazovku
 *
 * Aktivace:
 *   CorruptionSystem.init()   — volej v index.html jednou
 *   CorruptionSystem.destroy()
 *
 * Nepotřebuje být registrován v Routeru — běží globálně celou dobu.
 */

const CorruptionSystem = {

  _unsubs:     [],
  _glitchLoop: null,
  _lastLevel:  0,

  // ── INIT ──────────────────────────────────────────────────────────────────
  init() {
    // Poslouchej na alignment změny
    this._unsubs.push(
      EventBus.on('alignment:change', ({ corruption }) => {
        this._onCorruptionChange(corruption);
      })
    );

    // Při přechodu obrazovky — reinicializuj efekty dle aktuálního stavu
    this._unsubs.push(
      EventBus.on('router:change', ({ to }) => {
        this._applyCurrentLevel(to);
      })
    );

    // Inicializuj okamžitě dle aktuálního stavu
    this._applyCurrentLevel(null);
  },

  // ── REAKCE NA ZMĚNU ALIGNMENT ─────────────────────────────────────────────
  _onCorruptionChange(corruption) {
    if(!corruption) return;
    const { level, side } = corruption;

    // Přepni efekty pokud se level změnil
    if(level !== this._lastLevel) {
      this._lastLevel = level;
      this._applyLevel(level, side);
    }
  },

  _applyCurrentLevel(screen) {
    const { level, side } = GameState.corruption;
    this._lastLevel = level;
    this._applyLevel(level, side, screen);
  },

  // ── APLIKACE EFEKTŮ DLE LEVELU ────────────────────────────────────────────
  _applyLevel(level, side, screen) {
    this._clearSystemicEffects();

    if(side === 'chaos') {
      if(level >= 2) this._startButtonDrift(level);
      if(level >= 3) this._startTextGlitch(level);
      if(level >= 4) this._corruptSaveSlots();
      if(level >= 5) this._startExtremeGlitch();
    }

    if(side === 'order') {
      if(level >= 3) this._applyOrderFreeze(level);
    }
  },

  // ── CHAOS EFEKTY ──────────────────────────────────────────────────────────

  /**
   * Tlačítka se občas posunou o náhodný pixel.
   * Hráč si ani nevšimne — nebo si všimne. Záleží na levelu.
   */
  _startButtonDrift(level) {
    const intensity = (level - 1) * 2; // px — level 2 = 2px, level 5 = 8px
    const interval  = level >= 4 ? 1500 : 3000;

    const drift = () => {
      const btns = document.querySelectorAll('button, .m-btn, .btn');
      if(!btns.length) return;

      // Vyber náhodné tlačítko
      const btn = btns[Math.floor(Math.random() * btns.length)];
      const x   = (Math.random() - 0.5) * intensity;
      const y   = (Math.random() - 0.5) * intensity;

      btn.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;

      // Vrať zpět po chvíli
      setTimeout(() => {
        if(btn) btn.style.transform = '';
      }, 150 + Math.random() * 200);
    };

    this._glitchLoop = setInterval(drift, interval + Math.random() * 1000);
  },

  /**
   * Náhodný text v UI se na moment překryje nebo zglitchuje.
   * Jemné — jeden znak se změní, pak vrátí.
   */
  _startTextGlitch(level) {
    const glitchChars = '▓░▒█▄▀◆◈⬡';
    const interval    = level >= 4 ? 2000 : 4000;

    const glitch = () => {
      const texts = document.querySelectorAll(
        '.story-text, .m-tagline, .db-card-name, .bl-entry, .ddi-name'
      );
      if(!texts.length) return;

      const el   = texts[Math.floor(Math.random() * texts.length)];
      const orig = el.textContent;
      if(!orig || orig.length < 3) return;

      // Nahraď jeden náhodný znak
      const idx     = Math.floor(Math.random() * orig.length);
      const gChar   = glitchChars[Math.floor(Math.random() * glitchChars.length)];
      const glitched = orig.slice(0, idx) + gChar + orig.slice(idx + 1);

      el.textContent = glitched;
      setTimeout(() => { if(el) el.textContent = orig; }, 60 + Math.random() * 80);
    };

    // Přidej do existujícího loop nebo vytvoř nový
    const textLoop = setInterval(glitch, interval + Math.random() * 1500);
    this._textGlitchLoop = textLoop;
  },

  /**
   * Save sloty ukáží špatná data — datum z budoucnosti nebo nesmyslný chapter.
   * Aktivuje se jen při otevření slot pickeru.
   * Nejdrzejší efekt — hra "lže".
   */
  _corruptSaveSlots() {
    // Monkey-patch SaveManager.listSlots pro aktuální session
    // Jen vizuální — skutečná data zůstávají nedotčena
    this._origListSlots = window._confluxSaveManager?.listSlots;

    // Poslouchej na otevření slot pickeru
    this._slotObserver = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if(node.nodeType !== 1) return;
          const slots = node.querySelectorAll?.('.m-slot-btn:not(.m-slot-empty)');
          if(!slots?.length) return;

          slots.forEach(btn => {
            if(Math.random() > 0.5) return; // Ne vždy — nepředvídatelné

            const orig = btn.textContent;
            // Zkomol datum — přidej rok 2099 nebo nesmyslný chapter
            const corrupted = orig
              .replace(/\d{4}/, () => 2099 + Math.floor(Math.random() * 10))
              .replace(/kap\. \d+/i, `kap. ${Math.floor(Math.random() * 50)}`);

            btn.textContent = corrupted;
            btn.style.color = '#e04f6a';
            btn.title = 'data corruption detected';
          });
        });
      });
    });

    this._slotObserver.observe(document.body, { childList: true, subtree: true });
  },

  /**
   * Extrémní chaos (level 5, alignment -80 až -100):
   * Jeden nečitelný frame přes celou obrazovku.
   * Velmi vzácné. Nezapomenutelné.
   */
  _startExtremeGlitch() {
    const extreme = () => {
      if(GameState.corruption.level < 5) return;

      // Vytvoř overlay
      const overlay = document.createElement('div');
      overlay.id = 'corruption-extreme';
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9998;
        pointer-events: none; overflow: hidden;
      `;

      // Náhodné horizontální linky — "frame corruption"
      const linesHtml = Array.from({ length: 8 + Math.floor(Math.random() * 8) }, () => {
        const top    = Math.random() * 100;
        const height = 1 + Math.random() * 8;
        const color  = Math.random() > 0.5 ? '#e04f6a' : '#50e0b8';
        const left   = (Math.random() - 0.5) * 20; // horizontální posun
        return `<div style="
          position:absolute; top:${top}%;
          left:${left}px; right:${-left}px;
          height:${height}px;
          background:${color};
          opacity:${0.3 + Math.random() * 0.5};
          mix-blend-mode: screen;
        "></div>`;
      }).join('');

      overlay.innerHTML = linesHtml;
      document.body.appendChild(overlay);

      // Zmizí po 1–3 framech (16–50ms)
      setTimeout(() => overlay.remove(), 16 + Math.random() * 34);

      // Naplánuj další — velmi vzácně
      const next = 15000 + Math.random() * 30000;
      this._extremeTimer = setTimeout(extreme, next);
    };

    // První výskyt po 5–15 sekundách
    this._extremeTimer = setTimeout(extreme, 5000 + Math.random() * 10000);
  },

  // ── ORDER EFEKTY ──────────────────────────────────────────────────────────

  /**
   * Order korupce — UI zpomalí, zmrazí.
   * Animace se zpomalí, vše bude přesnější, chladnější.
   * Implementováno přes CSS proměnné.
   */
  _applyOrderFreeze(level) {
    const root = document.documentElement;
    const slowdown = 1 + (level - 2) * 0.5; // level 3 = 1.5x, 4 = 2x, 5 = 2.5x

    root.style.setProperty('--t-fast',   `${0.12 * slowdown}s ease`);
    root.style.setProperty('--t-normal', `${0.25 * slowdown}s ease`);
    root.style.setProperty('--t-slow',   `${0.5  * slowdown}s ease`);

    // Tagline se zpomalí / zamrzne
    const tagline = document.querySelector('.m-tagline');
    if(tagline) {
      tagline.style.animationDuration = `${4 * slowdown}s`;
      if(level >= 5) tagline.style.animationPlayState = 'paused';
    }
  },

  // ── CLEANUP ───────────────────────────────────────────────────────────────
  _clearSystemicEffects() {
    // Zastav glitch loop
    if(this._glitchLoop) {
      clearInterval(this._glitchLoop);
      this._glitchLoop = null;
    }
    if(this._textGlitchLoop) {
      clearInterval(this._textGlitchLoop);
      this._textGlitchLoop = null;
    }
    if(this._extremeTimer) {
      clearTimeout(this._extremeTimer);
      this._extremeTimer = null;
    }

    // Odstav slot observer
    if(this._slotObserver) {
      this._slotObserver.disconnect();
      this._slotObserver = null;
    }

    // Obnov CSS přechody
    const root = document.documentElement;
    root.style.removeProperty('--t-fast');
    root.style.removeProperty('--t-normal');
    root.style.removeProperty('--t-slow');

    // Obnov tagline animaci
    const tagline = document.querySelector('.m-tagline');
    if(tagline) {
      tagline.style.animationDuration = '';
      tagline.style.animationPlayState = '';
    }

    // Odstraň extreme overlay pokud existuje
    document.getElementById('corruption-extreme')?.remove();

    // Obnov posunutá tlačítka
    document.querySelectorAll('button, .m-btn, .btn').forEach(btn => {
      btn.style.transform = '';
    });
  },

  // ── DESTROY ───────────────────────────────────────────────────────────────
  destroy() {
    this._clearSystemicEffects();
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
  }
};

export default CorruptionSystem;
