/**
 * KeyboardController — CONFLUX
 *
 * Globální klávesové zkratky: Enter, Esc, Mezerník.
 * Kontext se mění automaticky při router:change.
 *
 * Enter / Mezerník — primární akce podle kontextu:
 *   battle/freebattle → KONEC TAHU (nebo FUZOVAT když je popup otevřený)
 *   story             → POKRAČOVAT / posun textu
 *   ostatní           → nic speciálního
 *
 * Esc (globálně) → zavře overlay, zruší výběr, zavře fúzní popup
 *
 * Zapnout/vypnout: GameState.settings.keyboardShortcuts = true/false
 */

import GameState from '../engine/GameState.js';
import EventBus  from '../engine/EventBus.js';

const KeyboardController = {

  _context: 'menu',

  init() {
    document.addEventListener('keydown', e => this._handle(e));
    EventBus.on('router:change', ({ to }) => { this._context = to; });
  },

  get _enabled() {
    return GameState.settings?.keyboardShortcuts !== false;
  },

  // Vrátí viditelný, klikatelný element pro selektor (nebo null)
  _find(selector) {
    for(const sel of selector.split(',').map(s => s.trim())) {
      const el = document.querySelector(sel);
      if(el && !el.disabled && el.offsetParent !== null) return el;
    }
    return null;
  },

  _handle(e) {
    if(!this._enabled) return;
    if(e.target.matches('input, textarea, select')) return;

    const key = e.key;
    if(!['Enter', 'Escape', ' '].includes(key)) return;

    // Enter a Space na tlačítcích nechaj prohlížeč, ať to vyřeší přirozeně
    if(key !== 'Escape' && e.target.matches('button, a, [role="button"]')) return;

    // ── ESC: zavření čehokoliv otevřeného (globální) ─────────────────────────
    if(key === 'Escape') {
      const closeEl = this._find([
        '#ov-cancel',
        '.m-cancel-btn',
        '#btn-cancel-fuse',
        '#btn-cancel-atk',
        '#btn-clear-fuse',
      ].join(','));
      if(closeEl) { e.preventDefault(); closeEl.click(); }
      return;
    }

    // Enter / Mezerník — od teď vždy preventDefault
    e.preventDefault();

    // ── BATTLE / FREE BATTLE ─────────────────────────────────────────────────
    if(this._context === 'battle' || this._context === 'freebattle') {
      const popup = document.querySelector('#fuse-popup');
      if(popup && popup.style.display !== 'none') {
        // Fúzní popup otevřen: Enter = FUZOVAT (pokud lze), Space = ZRUŠIT
        if(key === 'Enter') {
          (this._find('#btn-confirm-fuse') || this._find('#btn-cancel-fuse'))?.click();
        } else {
          this._find('#btn-cancel-fuse')?.click();
        }
        return;
      }
      // Normální tah: Enter/Space = KONEC TAHU
      this._find('#btn-end-turn')?.click();
      return;
    }

    // ── STORY ─────────────────────────────────────────────────────────────────
    if(this._context === 'story') {
      // Pokud je jediné tlačítko POKRAČOVAT, klikni na něj
      const btns = document.querySelectorAll('.vn-btn:not([disabled])');
      if(btns.length === 1) { btns[0].click(); return; }
      // Jinak klikni na celou scénu (posune typewriter / dialog)
      document.querySelector('.vn-screen')?.click();
      return;
    }

    // ── OSTATNÍ KONTEXTY (menu, collection, deckbuilder…) ────────────────────
    // Enter na focusovaném prvku
    if(key === 'Enter') {
      const focused = document.activeElement;
      if(focused && focused !== document.body) focused.click();
    }
  },
};

export default KeyboardController;
