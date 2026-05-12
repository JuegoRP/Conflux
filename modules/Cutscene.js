import GameState        from '../engine/GameState.js';
import EventBus         from '../engine/EventBus.js';
import AudioSystem      from './AudioSystem.js';
import CorruptionVisuals from './CorruptionVisuals.js';
import Router            from '../engine/Router.js';

/**
 * Cutscene — CONFLUX
 *
 * Standalone renderer pro cutscény.
 * StoryEngine volá Cutscene.play(node, container) a čeká na Promise.
 *
 * Funkce:
 *  - Typewriter s přirozeným tempem (pauzy za . , —)
 *  - Portréty postav (fade in/out)
 *  - Glitch frame efekt přes CorruptionVisuals
 *  - Background crossfade
 *  - Přeskočení framu (klik) i celé cutscény (dvojklik / Escape)
 *  - Hudba fade in na začátku cutscény
 */

const Cutscene = {

  _container:   null,
  _skipAll:     false,
  _skipCurrent: false,
  _typeTimer:   null,

  // ═══════════════════════════════════════════════════════════════
  // HLAVNÍ VSTUP
  // ═══════════════════════════════════════════════════════════════

  // Vstupní bod pro Router.goto('cutscene', params)
  init(container, params = {}) {
    this._container = container;
    this._skipAll   = false;
    const node = {
      frames:     params.frames || (params.text ? [{ text: params.text }] : [{ text: '' }]),
      background: params.background,
      music:      params.music,
    };
    this.play(node, container).then(() => {
      if(params.nextModule) {
        Router.goto(params.nextModule, params.nextParams || {});
      } else if(params.next) {
        Router.goto('story', { nodeId: params.next });
      }
    });
  },

  destroy() {
    this._skipAll = true;
    clearTimeout(this._typeTimer);
    try { this._cleanup?.(); } catch(e) {}
  },

  /**
   * Přehraj cutscénu z node objektu (campaign.json).
   * Vrátí Promise — resolvuje po posledním framu.
   */
  play(node, container) {
    this._container = container;
    this._skipAll   = false;

    return new Promise(resolve => {
      this._injectStyles();
      this._buildLayout();

      // Hudba
      if(node.music) {
        AudioSystem.playForContext(node._actId, node.music);
      }

      // Background
      if(node.background) {
        EventBus.emit('story:background', { key: node.background });
        this._applyBackground(node.background);
      }

      const frames = node.frames || [];
      let idx = 0;

      const showFrame = () => {
        if(this._skipAll || idx >= frames.length) {
          this._cleanup();
          resolve();
          return;
        }

        const frame = frames[idx];
        this._renderFrame(frame, () => {
          idx++;
          showFrame();
        });
      };

      // Klik = skip frame | Escape / dvojklik = skip vše
      const onKey = (e) => {
        if(e.key === 'Escape') { this._skipAll = true; }
        if(e.key === ' ' || e.key === 'Enter') { this._skipCurrent = true; }
      };
      const onClick = (e) => {
        if(e.detail >= 2) {
          this._skipAll = true; // dvojklik = přeskoč vše
        } else {
          this._skipCurrent = true;
        }
      };

      const cleanup = () => {
        this._container.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey);
      };
      this._cleanup = cleanup;

      this._container.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey);

      showFrame();
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // FRAME RENDER
  // ═══════════════════════════════════════════════════════════════

  _renderFrame(frame, onDone) {
    this._skipCurrent = false;
    if(clearTimeout) clearTimeout(this._typeTimer);

    const textEl     = this._container.querySelector('.cs-text');
    const portraitEl = this._container.querySelector('.cs-portrait');
    const contEl     = this._container.querySelector('.cs-continue');
    const noteEl     = this._container.querySelector('.cs-debug-note');

    // Note (dev only) — tiché poznámky z campaign.json
    if(noteEl && frame.note) {
      noteEl.textContent = frame.note;
    }

    // Portrét — fade in/out
    this._updatePortrait(portraitEl, frame.portrait);

    // Glitch — přes CorruptionVisuals nebo frame.glitch flag
    if(frame.glitch) {
      textEl.classList.add('cs-glitch');
    } else {
      textEl.classList.remove('cs-glitch');
    }

    // Text — zpracuj přes CorruptionVisuals (corruption level 3+)
    const rawText   = frame.text || '';
    const processed = CorruptionVisuals.processDialogLine(rawText, 'narrator');

    contEl.style.opacity = '0';
    textEl.textContent   = '';

    if(contEl) contEl.style.opacity = '0';

    // Typewriter
    this._typewrite(textEl, processed, () => {
      if(contEl) {
        contEl.style.opacity = '1';
        contEl.style.animation = 'blink 1.2s step-end infinite';
      }

      // Auto-advance po pauze
      if(frame.pause) {
        this._typeTimer = setTimeout(() => {
          if(!this._skipAll) onDone();
        }, frame.pause);
      }
      // Jinak čeká na klik (handleno v play())
    });
  },

  // ═══════════════════════════════════════════════════════════════
  // TYPEWRITER
  // ═══════════════════════════════════════════════════════════════

  _typewrite(el, text, onDone) {
    const speedMap = { slow: 55, normal: 35, fast: 15, instant: 0 };
    const ms = speedMap[GameState.settings?.textSpeed ?? 'normal'] ?? 35;

    if(ms === 0 || this._skipAll) {
      el.textContent = text;
      if(onDone) onDone();
      return;
    }

    let i = 0;
    this._skipCurrent = false;

    const tick = () => {
      // Přeskočení
      if(this._skipCurrent || this._skipAll) {
        el.textContent = text;
        this._skipCurrent = false;
        if(onDone) onDone();
        return;
      }

      if(i >= text.length) {
        if(onDone) onDone();
        return;
      }

      el.textContent += text[i];
      i++;

      // Přirozené tempo
      const ch  = text[i - 1];
      const next = (ch === '.' || ch === '—' || ch === '…') ? ms * 7
                 : (ch === ',')                               ? ms * 3
                 : (ch === '!')                               ? ms * 4
                 : (ch === '?')                               ? ms * 5
                 : ms;

      setTimeout(tick, next);
    };

    setTimeout(tick, ms);
  },

  // ═══════════════════════════════════════════════════════════════
  // PORTRÉT
  // ═══════════════════════════════════════════════════════════════

  _updatePortrait(el, portraitKey) {
    if(!el) return;

    if(!portraitKey) {
      el.classList.remove('cs-portrait--visible');
      el.style.backgroundImage = 'none';
      el.removeAttribute('data-char');
      return;
    }

    // Přímá cesta k portrétům (stejně jako StoryEngine)
    const url = `assets/images/portraits/${portraitKey}.png`;
    el.style.backgroundImage = `url('${url}')`;
    el.dataset.char           = portraitKey;
    el.classList.add('cs-portrait--visible');
  },

  // ═══════════════════════════════════════════════════════════════
  // BACKGROUND
  // ═══════════════════════════════════════════════════════════════

  _applyBackground(key) {
    const wrap = this._container.querySelector('.cs-bg');
    if(!wrap) return;

    // Přímá cesta — StoryEngine alias resolver není dostupný, použijeme fallback
    const pngSet = new Set(['mesto','les','ruiny','synth_brana','act8_mesto','battle_bg']);
    const ext = pngSet.has(key) ? 'png' : 'jpg';
    const url = `assets/images/backgrounds/${key}.${ext}`;

    const img = new Image();
    img.onload = () => {
      wrap.style.backgroundImage    = `url('${url}')`;
      wrap.style.backgroundSize     = 'cover';
      wrap.style.backgroundPosition = 'center';
    };
    img.onerror = () => {
      // Generativní pozadí fallback
      const colors = this._bgColorsForKey(key);
      wrap.style.background = `linear-gradient(160deg, ${colors[0]} 0%, ${colors[1]} 100%)`;
    };
    img.src = url;
  },

  _bgColorsForKey(key) {
    const map = {
      act1: ['#060c16', '#0d1a2e'],
      act2: ['#0a0808', '#1a0d0d'],
      act3: ['#060e10', '#0a1f1a'],
      act4: ['#0c080e', '#160c20'],
      act5: ['#0a0a12', '#14103a'],
      ruins:    ['#0c0c08', '#1a1a0a'],
      nexus:    ['#060e10', '#0a1a16'],
      default:  ['#060809', '#0b0f16'],
    };
    for(const [k, v] of Object.entries(map)) {
      if(key.includes(k)) return v;
    }
    return map.default;
  },

  // ═══════════════════════════════════════════════════════════════
  // LAYOUT
  // ═══════════════════════════════════════════════════════════════

  _buildLayout() {
    this._container.innerHTML = `
      <div class="cs-scene">
        <div class="cs-bg" aria-hidden="true"></div>
        <div class="cs-portrait" aria-hidden="true"></div>
        <div class="cs-text-box">
          <p class="cs-text" aria-live="polite"></p>
          <span class="cs-continue" aria-hidden="true">▼</span>
        </div>
        <div class="cs-skip-hint">ESC přeskoč vše</div>
        <div class="cs-debug-note" aria-hidden="true"></div>
      </div>`;
  },

  // ═══════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════

  _stylesInjected: false,

  _injectStyles() {
    if(this._stylesInjected) return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.id = 'cutscene-styles';
    style.textContent = `
      .cs-scene {
        position: fixed;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        padding-bottom: 2.5rem;
        overflow: hidden;
      }

      .cs-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        transition: background 1s ease, background-image 1s ease;
      }

      /* Vignette overlay */
      .cs-bg::after {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse at 50% 60%,
          transparent 30%,
          rgba(0,0,0,0.6) 100%
        );
      }

      .cs-portrait {
        position: absolute;
        bottom: 0;
        left: clamp(12px, 3vw, 48px);
        width: clamp(120px, 22vw, 220px);
        height: calc(100% - 8rem);
        max-height: 420px;
        background-size: contain;
        background-position: bottom center;
        background-repeat: no-repeat;
        z-index: 1;
        opacity: 0;
        transform: translateX(-20px);
        transition: opacity 0.4s ease, transform 0.4s ease;
        filter: drop-shadow(0 4px 20px rgba(0,0,0,0.8));
        mask-image: linear-gradient(to top, transparent 0%, black 15%);
        -webkit-mask-image: linear-gradient(to top, transparent 0%, black 15%);
      }
      .cs-portrait--visible {
        opacity: 1;
        transform: translateX(0);
      }

      .cs-text-box {
        position: relative;
        z-index: 2;
        background: rgba(4, 6, 8, 0.94);
        border: 1px solid rgba(100, 180, 240, 0.2);
        border-bottom: none;
        padding: 1.5rem 3rem 1.5rem 2.5rem;
        max-width: 720px;
        width: calc(100% - 3rem);
        backdrop-filter: blur(8px);
        animation: slideUp 0.25s ease;
      }

      .cs-text {
        font-family: 'VT323', monospace;
        font-size: 1.05rem;
        line-height: 1.85;
        color: #ddeeff;
        min-height: 2em;
        white-space: pre-wrap;
      }

      /* Glitch — přes CorruptionVisuals */
      .cs-glitch {
        animation: text-glitch 0.08s steps(1) infinite;
        color: #b570e0 !important;
      }

      .cs-continue {
        position: absolute;
        bottom: 0.6rem;
        right: 1rem;
        font-size: 0.65rem;
        color: rgba(100, 180, 240, 0.5);
        opacity: 0;
        transition: opacity 0.3s;
      }

      .cs-skip-hint {
        position: fixed;
        bottom: 0.8rem;
        right: 1.2rem;
        font-family: 'Share Tech Mono', monospace;
        font-size: 0.65rem;
        color: rgba(96, 128, 160, 0.4);
        letter-spacing: 0.08em;
        z-index: 10;
        pointer-events: none;
      }

      .cs-debug-note {
        position: fixed;
        top: 0.5rem;
        left: 50%;
        transform: translateX(-50%);
        font-family: monospace;
        font-size: 0.6rem;
        color: rgba(96,128,160,0.3);
        pointer-events: none;
        z-index: 10;
      }

      @keyframes slideUp {
        from { transform: translateY(10px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  },

  _cleanup() {},
};

export default Cutscene;
