import EventBus   from '../engine/EventBus.js';
import GameState  from '../engine/GameState.js';
import AudioSystem from './AudioSystem.js';

/**
 * LetterEngine — CONFLUX
 *
 * Sestaví a zobrazí dopis na konci hry.
 * Dopis se skládá dynamicky z bloků podle toho jak hráč hrál.
 * Každý řádek se vypíše typewriterem — jako by ho někdo psal.
 *
 * Vizuál:
 *  - Stará žlutá papírová textura (CSS)
 *  - Typewriter efekt — každé písmeno zvlášť
 *  - Hudba: tiché piano, končí s posledním slovem
 *  - Podpis — závisí na endingu (a u za_ramem je jiný autor)
 */

const LetterEngine = {

  _container: null,
  _lines:     [],
  _endingId:  null,

  // ═══════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════

  init(container, params = {}) {
    this._container = container;
    this._endingId  = params.endingId || GameState.endingPath || 'most';

    // Sestav dopis z GameState
    this._lines = GameState.buildLetter();

    // Hudba — tiché piano
    AudioSystem.stopMusic(1000);
    setTimeout(() => {
      AudioSystem.playMusic('letter_theme', { loop: false, fadeIn: 1500 });
    }, 1200);

    this._render();
  },

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  _render() {
    const el = this._container;

    el.innerHTML = `
      <div class="letter-scene">
        <div class="letter-paper">
          <div class="letter-content" id="letter-content"></div>
          <div class="letter-controls" id="letter-controls" style="display:none">
            <button class="letter-btn letter-btn--replay" id="letter-replay">
              Přečíst znovu
            </button>
            <button class="letter-btn letter-btn--end" id="letter-end">
              Konec
            </button>
          </div>
        </div>
      </div>`;

    const content  = el.querySelector('#letter-content');
    const controls = el.querySelector('#letter-controls');

    // Zapiš všechny řádky sekvečně
    this._writeLines(content, this._lines, () => {
      // Po dopsání posledního řádku — zobraz tlačítka
      setTimeout(() => {
        controls.style.display = 'flex';
        AudioSystem.playEffect('sfx_letter_done');
      }, 800);
    });

    // Tlačítka
    el.querySelector('#letter-replay').addEventListener('click', () => {
      controls.style.display = 'none';
      content.innerHTML = '';
      this._writeLines(content, this._lines, () => {
        setTimeout(() => { controls.style.display = 'flex'; }, 800);
      });
    });

    el.querySelector('#letter-end').addEventListener('click', () => {
      this._handleEnd();
    });

    // Klik přeskočí typewriter (ale ne celý dopis)
    el.addEventListener('click', (e) => {
      if(e.target.closest('.letter-btn')) return;
      this._skipCurrentLine = true;
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // SEKVENCE ŘÁDKŮ
  // ═══════════════════════════════════════════════════════════════

  _skipCurrentLine: false,

  async _writeLines(container, lines, onDone) {
    for(const line of lines) {
      if(line.type === 'space') {
        const br = document.createElement('div');
        br.className = 'letter-spacer';
        container.appendChild(br);
        await this._wait(200);
        continue;
      }

      const p = document.createElement('p');
      p.className = `letter-line letter-line--${line.type}`;

      // Corruption u_ramem endingu — podpis se píše jinak
      if(line.type === 'signature' && this._endingId === 'za_ramem') {
        p.classList.add('letter-line--observer');
      }

      container.appendChild(p);

      // Scroll dolů průběžně
      container.scrollTop = container.scrollHeight;

      // Typewriter
      await this._typewriteLine(p, line.text);

      // Pauza mezi řádky
      const pause = line.type === 'closing' ? 600
                  : line.type === 'greeting' ? 800
                  : line.type === 'signature' ? 400
                  : 300;
      await this._wait(pause);
    }

    if(onDone) onDone();
  },

  _typewriteLine(el, text = '') {
    return new Promise(resolve => {
      // Respektuj textSpeed
      const speedMap = { slow: 55, normal: 32, fast: 12, instant: 0 };
      const ms = speedMap[GameState.settings.textSpeed ?? 'normal'] ?? 32;

      if(ms === 0) {
        el.textContent = text;
        resolve();
        return;
      }

      let i = 0;
      this._skipCurrentLine = false;

      const tick = () => {
        // Přeskočení aktuálního řádku
        if(this._skipCurrentLine) {
          el.textContent = text;
          this._skipCurrentLine = false;
          resolve();
          return;
        }

        if(i >= text.length) {
          resolve();
          return;
        }

        el.textContent += text[i];
        i++;

        // Přirozené tempo — za tečkou a čárkou pauza
        const char    = text[i - 1];
        const nextMs  = (char === '.' || char === '—') ? ms * 6
                      : (char === ',')                  ? ms * 3
                      : ms;

        setTimeout(tick, nextMs);
      };

      setTimeout(tick, ms);
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // KONEC HRY
  // ═══════════════════════════════════════════════════════════════

  _handleEnd() {
    AudioSystem.stopMusic(2000);

    // Zobraz závěrečnou obrazovku
    this._container.innerHTML = `
      <div class="game-end-wrap">
        <div class="game-end-title">CONFLUX</div>
        <div class="game-end-subtitle">${this._endSubtitle()}</div>
        <div class="game-end-actions">
          <button class="game-end-btn" id="btn-new-game">Nová hra</button>
          <button class="game-end-btn game-end-btn--secondary" id="btn-menu">
            Hlavní menu
          </button>
        </div>
      </div>`;

    this._container.querySelector('#btn-new-game').addEventListener('click', () => {
      GameState.reset();
      GameState.clearCheckpoint();
      // Router je dostupný přes EventBus
      EventBus.emit('nav:goto', { route: 'menu' });
    });

    this._container.querySelector('#btn-menu').addEventListener('click', () => {
      EventBus.emit('nav:goto', { route: 'menu' });
    });
  },

  _endSubtitle() {
    const subtitles = {
      protokol: 'Systém funguje.',
      koreny:   'Les roste.',
      most:     'Most drží.',
      za_ramem: '',   // záměrně prázdné
    };
    return subtitles[this._endingId] ?? '';
  },

  // ═══════════════════════════════════════════════════════════════
  // CSS — vložené styly pro papír a typewriter
  // ═══════════════════════════════════════════════════════════════

  getStyles() {
    return `
      /* ── Letter Scene ── */
      .letter-scene {
        position: fixed;
        inset: 0;
        background: #0a0a0f;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
      }

      .letter-paper {
        background: #f5eed8;
        background-image:
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='4'%3E%3Crect width='4' height='4' fill='%23f5eed8'/%3E%3Crect x='0' y='0' width='1' height='1' fill='%23e8ddc4' opacity='0.4'/%3E%3C/svg%3E");
        color: #1a1a1a;
        max-width: 640px;
        width: 100%;
        max-height: 80vh;
        border-radius: 2px;
        padding: 3rem 3.5rem;
        box-shadow:
          0 4px 32px rgba(0,0,0,0.6),
          inset 0 0 60px rgba(0,0,0,0.04);
        display: flex;
        flex-direction: column;
        position: relative;
        overflow: hidden;
      }

      /* Okraje papíru */
      .letter-paper::before {
        content: '';
        position: absolute;
        left: 3.5rem;
        top: 0;
        bottom: 0;
        width: 1px;
        background: rgba(200, 80, 80, 0.15);
        pointer-events: none;
      }

      .letter-content {
        flex: 1;
        overflow-y: auto;
        scrollbar-width: none;
        padding-right: 0.5rem;
      }
      .letter-content::-webkit-scrollbar { display: none; }

      /* ── Řádky ── */
      .letter-line {
        font-family: 'Georgia', 'Times New Roman', serif;
        line-height: 1.8;
        margin: 0 0 0.1em 0;
        min-height: 1.8em;
      }

      .letter-line--greeting {
        font-size: 1.1rem;
        margin-bottom: 0.8em;
      }

      .letter-line--body {
        font-size: 0.95rem;
        color: #2a2a2a;
      }

      .letter-line--closing {
        font-size: 0.95rem;
        color: #1a1a1a;
        font-style: italic;
        margin-top: 0.6em;
      }

      .letter-line--signature {
        font-size: 0.9rem;
        color: #3a3a3a;
        margin-top: 1.2em;
        text-align: right;
      }

      /* Za rámem ending — podpis je trochu jiný */
      .letter-line--observer {
        color: #8a0000;
        font-style: italic;
      }

      .letter-spacer {
        height: 1em;
      }

      /* ── Tlačítka ── */
      .letter-controls {
        display: flex;
        gap: 1rem;
        justify-content: flex-end;
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid rgba(0,0,0,0.1);
      }

      .letter-btn {
        background: transparent;
        border: 1px solid #3a3a3a;
        color: #1a1a1a;
        padding: 0.5rem 1.2rem;
        font-family: inherit;
        font-size: 0.85rem;
        cursor: pointer;
        letter-spacing: 0.05em;
        transition: background 0.15s;
      }
      .letter-btn:hover {
        background: rgba(0,0,0,0.06);
      }
      .letter-btn--end {
        background: #1a1a1a;
        color: #f5eed8;
        border-color: #1a1a1a;
      }
      .letter-btn--end:hover {
        background: #333;
      }

      /* ── Konec hry ── */
      .game-end-wrap {
        position: fixed;
        inset: 0;
        background: #0a0a0f;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.5rem;
        animation: fadeIn 1.5s ease;
      }

      .game-end-title {
        font-size: 3rem;
        font-weight: 300;
        letter-spacing: 0.4em;
        color: #e0d0b0;
        font-family: 'Georgia', serif;
      }

      .game-end-subtitle {
        font-size: 1rem;
        color: #666;
        letter-spacing: 0.1em;
        min-height: 1.5em;
      }

      .game-end-actions {
        display: flex;
        gap: 1.5rem;
        margin-top: 2rem;
      }

      .game-end-btn {
        background: transparent;
        border: 1px solid #444;
        color: #ccc;
        padding: 0.7rem 2rem;
        font-size: 0.9rem;
        letter-spacing: 0.08em;
        cursor: pointer;
        transition: border-color 0.2s, color 0.2s;
      }
      .game-end-btn:hover {
        border-color: #e0d0b0;
        color: #e0d0b0;
      }
      .game-end-btn--secondary {
        opacity: 0.6;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `;
  },

  // ═══════════════════════════════════════════════════════════════
  // HELPER
  // ═══════════════════════════════════════════════════════════════

  _wait(ms) {
    return new Promise(r => setTimeout(r, ms));
  },
};

export default LetterEngine;
