import EventBus   from '../engine/EventBus.js';
import GameState  from '../engine/GameState.js';
import AudioSystem from './AudioSystem.js';
import Router      from '../engine/Router.js';

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
    AudioSystem.playEffect('sting_letter', 0.5);
    this._destroyed = false;
    this._container = container;
    this._endingId  = params.endingId || GameState.endingPath || 'most';

    // Sestav dopis z GameState
    this._lines = GameState.buildLetter();

    AudioSystem.stopMusic(800);
    this._render();
  },

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  _addStyles() {
    let style = document.getElementById('letter-styles');
    if(!style) {
      style = document.createElement('style');
      style.id = 'letter-styles';
      document.head.appendChild(style);
    }
    if(style.dataset.v === '3') return;
    style.dataset.v = '3';
    style.textContent = this.getStyles();
  },

  _render() {
    this._addStyles();
    const el = this._container;

    el.innerHTML = `
      <div class="letter-scene">
        <div class="letter-device">
          <img src="assets/images/letter_paper.png" class="letter-device-img" alt="">
          <div class="letter-screen">
            <div class="letter-content" id="letter-content"></div>
            <div class="letter-controls" id="letter-controls" style="display:none">
              <button class="letter-btn letter-btn--replay" id="letter-replay">▶ Přečíst znovu</button>
              <button class="letter-btn letter-btn--end" id="letter-end">✕ Konec</button>
            </div>
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
      if(this._destroyed) return;
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
        if(this._destroyed) return;
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

  destroy() {
    this._destroyed = true;
    if (this._container) {
      this._container.innerHTML = '';
      this._container = null;
    }
  },

  _handleEnd() {
    Router.goto('credits');
  },

  _endSubtitle() {
    const subtitles = {
      synth:      'Protokol přijat. Přepis dokončen.',
      organic:    'Kořeny drží. Paměť přežila.',
      observer:   'Pozorovatel nezasahuje. Jen sleduje.',
      monyra:     'Signál byl přijat.',
      hybrid:     'Most postaven. Dva světy, jeden průchod.',
      corruption: 'Přepis se dokončil. Ty jsi nový kód.',
      // legacy aliasy
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
      /* ── Letter Scene — holografický terminál ── */
      .letter-scene {
        position: fixed;
        inset: 0;
        background: #04080e;
      }

      /* Holo vyplňuje CELÝ displej (full-bleed) — žádná černá kolem */
      .letter-device {
        position: absolute;
        inset: 0;
      }

      .letter-device-img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      /* Overlay přesně na oblast displeje uvnitř hologramu */
      /* Hodnoty: top/bottom/left/right jsou % výšky/šířky .letter-device */
      .letter-screen {
        position: absolute;
        /* holo je full-bleed → text jako čitelný sloupec přímo na hologramu */
        top: 12%;
        bottom: 12%;
        left: 8%;
        right: 8%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        /* žádný barevný podkres — text se píše přímo do hologramu */
        background: transparent;
        padding: 0.8rem 1.2rem 0.5rem;
      }

      .letter-content {
        flex: 1;
        overflow-y: auto;
        scrollbar-width: none;
        padding-right: 0.2rem;
        max-width: 62ch;
        margin: 0 auto;
        width: 100%;
      }
      .letter-content::-webkit-scrollbar { display: none; }

      /* ── Text — sci-fi terminál, tmavé písmo na jasném hologramu ── */
      .letter-line {
        /* serif s plnou českou diakritikou (Share Tech Mono háčky/čárky neměl);
           navíc dle DESIGN.md = dopisy nese serifové "lidské" písmo */
        font-family: Georgia, 'Times New Roman', 'Noto Serif', serif;
        font-size: clamp(14px, 1.6vw, 19px);
        line-height: 1.7;
        color: #0a2035;
        margin: 0 0 0.15em 0;
        min-height: 1.7em;
      }

      .letter-line--greeting {
        font-size: clamp(13px, 1.6vw, 18px);
        color: #062040;
        margin-bottom: 0.6em;
        letter-spacing: 0.08em;
      }

      .letter-line--body {
        color: #0a2035;
      }

      .letter-line--closing {
        color: #0d2a42;
        margin-top: 0.5em;
        letter-spacing: 0.02em;
      }

      .letter-line--signature {
        font-size: clamp(11px, 1.3vw, 15px);
        color: #1a4060;
        margin-top: 0.8em;
        text-align: right;
        letter-spacing: 0.1em;
      }

      /* Za rámem ending — podpis je červený/varovný */
      .letter-line--observer {
        color: #6a0010;
      }

      .letter-spacer {
        height: 0.6em;
      }

      /* ── Tlačítka ── */
      .letter-controls {
        display: flex;
        gap: 0.7rem;
        justify-content: flex-end;
        padding-top: 0.5rem;
        margin-top: 0.3rem;
        border-top: 1px solid rgba(79, 163, 224, 0.2);
        flex-shrink: 0;
      }

      .letter-btn {
        background: rgba(4, 20, 40, 0.6);
        border: 1px solid rgba(79, 163, 224, 0.4);
        color: #4fa3e0;
        padding: 0.3rem 0.9rem;
        font-family: 'Share Tech Mono', monospace;
        font-size: clamp(9px, 1.1vw, 12px);
        cursor: pointer;
        letter-spacing: 0.06em;
        transition: background 0.15s, border-color 0.15s;
      }
      .letter-btn:hover {
        background: rgba(79, 163, 224, 0.12);
        border-color: rgba(79, 163, 224, 0.7);
      }
      .letter-btn--end {
        border-color: rgba(224, 79, 106, 0.5);
        color: #e04f6a;
      }
      .letter-btn--end:hover {
        background: rgba(224, 79, 106, 0.1);
        border-color: rgba(224, 79, 106, 0.8);
      }

      /* ── Konec hry ── */
      .game-end-wrap {
        position: fixed;
        inset: 0;
        background: #04080e;
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
        color: #4fa3e0;
        font-family: 'Share Tech Mono', monospace;
      }

      .game-end-subtitle {
        font-size: 1rem;
        color: #3a5060;
        letter-spacing: 0.1em;
        min-height: 1.5em;
        font-family: 'Share Tech Mono', monospace;
      }

      .game-end-actions {
        display: flex;
        gap: 1.5rem;
        margin-top: 2rem;
      }

      .game-end-btn {
        background: transparent;
        border: 1px solid rgba(79,163,224,0.3);
        color: #4fa3e0;
        padding: 0.7rem 2rem;
        font-size: 0.9rem;
        letter-spacing: 0.08em;
        cursor: pointer;
        font-family: 'Share Tech Mono', monospace;
        transition: border-color 0.2s, color 0.2s;
      }
      .game-end-btn:hover {
        border-color: #4fa3e0;
        color: #80c8f0;
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
