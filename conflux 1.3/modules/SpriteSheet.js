/**
 * SpriteSheet — CONFLUX
 *
 * Sprite sheet systém pro karty. Nahrazuje emoji za sprite obrázky.
 *
 * Očekávaná struktura:
 *   assets/images/cards/sprites.png  — mozaikový PNG (5×6 grid = 30 slotů)
 *   assets/images/cards/sprites.json — mapping { "card_id": { col, row } }
 *
 * Každý slot: 256×358px (poměr 1:1.4, stejný jako karta)
 * Celý sheet: 1280×2148px (5×256 × 6×358)
 *
 * Použití:
 *   SpriteSheet.init()          — načte JSON mapping, injektuje CSS
 *   SpriteSheet.hasSprite(id)   — vrátí true pokud karta má sprite
 *   SpriteSheet.applyAll()      — najde všechny [data-sprite-id] a nahradí emoji
 *
 * CardRenderer automaticky přidává data-sprite-id="<card.id>" na emoji element.
 * Po renderování karet zavolej SpriteSheet.applyAll() pro nahrazení.
 */

const SHEET_PATH = 'assets/images/cards/sprites.png';
const MAP_PATH   = 'assets/images/cards/sprites.json';

const SLOT_W = 256;
const SLOT_H = 358;
const COLS   = 5;
const ROWS   = 6;

const SpriteSheet = {
  _map: null,      // { "card_id": { col, row } }
  _loaded: false,
  _failed: false,
  _styleInjected: false,

  async init() {
    if (this._loaded || this._failed) return;
    try {
      const res = await fetch(MAP_PATH);
      if (!res.ok) throw new Error('sprites.json not found');
      this._map = await res.json();
      this._loaded = true;
      this._injectCSS();
      console.log(`[SpriteSheet] Loaded ${Object.keys(this._map).length} sprite mappings`);
    } catch (e) {
      this._failed = true;
      // Tiché selhání — pokud sprites.json neexistuje, používáme emoji
      console.log('[SpriteSheet] Not available — using emoji fallback');
    }
  },

  hasSprite(cardId) {
    if (!this._loaded || !this._map) return false;
    return !!this._map[String(cardId)];
  },

  getPosition(cardId) {
    if (!this._loaded || !this._map) return null;
    const entry = this._map[String(cardId)];
    if (!entry) return null;
    return {
      x: entry.col * SLOT_W,
      y: entry.row * SLOT_H,
    };
  },

  /**
   * Projde DOM a nahradí emoji za sprite background u všech [data-sprite-id].
   * Volej po každém renderování karet.
   */
  applyAll(root = document) {
    if (!this._loaded) return;
    root.querySelectorAll('[data-sprite-id]').forEach(el => {
      const id = el.dataset.spriteId;
      if (!id || el.dataset.spriteApplied) return;
      const pos = this.getPosition(id);
      if (!pos) return; // žádný sprite — ponech emoji

      // Nahradí emoji za sprite background
      el.textContent = '';
      el.classList.add('cx-sprite');
      el.style.backgroundPosition = `-${pos.x}px -${pos.y}px`;
      el.dataset.spriteApplied = '1';
    });
  },

  _injectCSS() {
    if (this._styleInjected) return;
    this._styleInjected = true;
    const style = document.createElement('style');
    style.id = 'sprite-sheet-styles';
    style.textContent = `
      .cx-sprite {
        display: inline-block;
        background-image: url('${SHEET_PATH}');
        background-repeat: no-repeat;
        image-rendering: pixelated;
      }
      /* SM: 32×45px sprite */
      .cx-sm .cx-sprite {
        width: 32px; height: 45px;
        background-size: ${COLS * 32}px ${ROWS * 45}px;
      }
      /* MD: 44×62px sprite */
      .cx-md .cx-sprite {
        width: 44px; height: 62px;
        background-size: ${COLS * 44}px ${ROWS * 62}px;
      }
      /* LG: 110×154px sprite */
      .cx-lg .cx-sprite {
        width: 110px; height: 154px;
        background-size: ${COLS * 110}px ${ROWS * 154}px;
      }
    `;
    document.head.appendChild(style);
  },
};

export default SpriteSheet;
