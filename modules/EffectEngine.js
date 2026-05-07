/**
 * EffectEngine — CONFLUX
 *
 * Vizuální efekty pro bitvy.
 * Každá frakce má jiný vizuální styl útoku.
 * Funguje přes DOM animace + CSS třídy — žádný canvas.
 * Až přidáš sprite sheets, nahraď CSS animace obrázky.
 *
 * Použití:
 *   EffectEngine.playAttack(attackerEl, defenderEl, 'synth');
 *   EffectEngine.playFusion(cardAEl, cardBEl, resultCard);
 *   EffectEngine.playCorruptionGlitch(intensity);   // 0.0–1.0
 *   EffectEngine.playScarUpgrade(cardEl, newForm);
 */

const EffectEngine = {

  // ── Injektuje CSS jednou při prvním použití ─────────────────────
  _stylesInjected: false,

  _ensureStyles() {
    if(this._stylesInjected) return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.id    = 'effect-engine-styles';
    style.textContent = `

      /* ── ÚTOK — sdílená bublina ── */
      .fx-hit {
        position: fixed;
        pointer-events: none;
        z-index: 9999;
        border-radius: 50%;
        animation: fx-hit-burst 0.35s ease-out forwards;
      }

      @keyframes fx-hit-burst {
        0%   { transform: translate(-50%,-50%) scale(0.2); opacity: 1; }
        60%  { opacity: 0.8; }
        100% { transform: translate(-50%,-50%) scale(2.5); opacity: 0; }
      }

      /* Synth — elektrický modrý výboj */
      .fx-hit--synth {
        width: 60px; height: 60px;
        background: radial-gradient(circle, rgba(106,184,240,0.9) 0%, rgba(106,184,240,0) 70%);
        box-shadow: 0 0 20px rgba(106,184,240,0.6);
      }

      /* Organic — zelený praskot */
      .fx-hit--organic {
        width: 70px; height: 70px;
        background: radial-gradient(circle, rgba(240,96,112,0.9) 0%, rgba(240,96,112,0) 70%);
        box-shadow: 0 0 20px rgba(240,96,112,0.5);
      }

      /* Hybrid — bílé světlo */
      .fx-hit--hybrid {
        width: 80px; height: 80px;
        background: radial-gradient(circle, rgba(80,224,184,0.9) 0%, rgba(80,224,184,0) 70%);
        box-shadow: 0 0 28px rgba(80,224,184,0.6);
      }

      /* Corruption — fialová trhlina */
      .fx-hit--corruption {
        width: 50px; height: 50px;
        background: radial-gradient(circle, rgba(181,112,224,1) 0%, rgba(181,112,224,0) 70%);
        box-shadow: 0 0 24px rgba(181,112,224,0.8);
        border-radius: 20% 80% 60% 40% / 30% 50% 70% 60%;
        animation: fx-hit-corruption 0.4s ease-out forwards;
      }

      @keyframes fx-hit-corruption {
        0%   { transform: translate(-50%,-50%) scale(0.3) rotate(0deg);   opacity: 1; }
        50%  { transform: translate(-50%,-50%) scale(1.8)  rotate(15deg);  opacity: 0.9; }
        100% { transform: translate(-50%,-50%) scale(3)    rotate(-10deg); opacity: 0; }
      }

      /* ── DIRECT LP HIT — otřes celého pole ── */
      .fx-lp-shake {
        animation: fx-lp-shake 0.3s ease !important;
      }
      @keyframes fx-lp-shake {
        0%   { transform: translateX(0); }
        20%  { transform: translateX(-4px); }
        40%  { transform: translateX(4px); }
        60%  { transform: translateX(-3px); }
        80%  { transform: translateX(3px); }
        100% { transform: translateX(0); }
      }

      /* ── FÚZE — tah karet k sobě ── */
      .fx-fusion-card {
        animation: fx-fusion-merge 0.5s ease-in forwards;
      }
      @keyframes fx-fusion-merge {
        0%   { transform: scale(1); opacity: 1; }
        100% { transform: scale(0.1) translateY(-30px); opacity: 0; }
      }

      .fx-fusion-result {
        animation: fx-fusion-appear 0.5s ease-out forwards;
      }
      @keyframes fx-fusion-appear {
        0%   { transform: scale(0.3); opacity: 0;   filter: brightness(3); }
        60%  { transform: scale(1.1); opacity: 1;   filter: brightness(1.5); }
        100% { transform: scale(1);   opacity: 1;   filter: brightness(1); }
      }

      .fx-fusion-flash {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9998;
        background: rgba(80,224,184,0.15);
        animation: fx-fusion-flash 0.4s ease-out forwards;
      }
      @keyframes fx-fusion-flash {
        0%   { opacity: 1; }
        100% { opacity: 0; }
      }

      /* ── JIZVA — upgrade záblesk ── */
      .fx-scar-upgrade {
        position: absolute;
        inset: -4px;
        border: 2px solid var(--gold, #e0c060);
        pointer-events: none;
        z-index: 10;
        animation: fx-scar-glow 0.8s ease-out forwards;
      }
      @keyframes fx-scar-glow {
        0%   { opacity: 1;   box-shadow: 0 0 0px rgba(224,192,96,0); }
        40%  { opacity: 1;   box-shadow: 0 0 20px rgba(224,192,96,0.8); }
        100% { opacity: 0;   box-shadow: 0 0 0px rgba(224,192,96,0); }
      }

      /* ── CORRUPTION GLITCH — přes celou obrazovku ── */
      .fx-corruption-overlay {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 9997;
        animation: fx-corruption-glitch var(--fx-duration, 0.4s) steps(1) forwards;
      }
      @keyframes fx-corruption-glitch {
        0%   { background: transparent; clip-path: inset(0 0 100% 0); }
        15%  { background: rgba(181,112,224,0.08); clip-path: inset(10% 0 60% 0); }
        30%  { background: rgba(181,112,224,0.05); clip-path: inset(70% 0 5% 0); }
        45%  { background: rgba(181,112,224,0.10); clip-path: inset(40% 0 30% 0); }
        60%  { background: rgba(181,112,224,0.04); clip-path: inset(80% 0 2% 0); }
        75%  { background: rgba(181,112,224,0.07); clip-path: inset(20% 0 50% 0); }
        100% { background: transparent; clip-path: inset(0 0 100% 0); }
      }

      /* ── SPELL EFEKT — kruh kolem karty ── */
      .fx-spell-ring {
        position: absolute;
        inset: -6px;
        border-radius: 50%;
        pointer-events: none;
        z-index: 10;
        animation: fx-spell-ring 0.5s ease-out forwards;
      }
      .fx-spell-ring--synth    { border: 2px solid rgba(106,184,240,0.8); }
      .fx-spell-ring--organic  { border: 2px solid rgba(240,96,112,0.8);  }
      .fx-spell-ring--hybrid   { border: 2px solid rgba(80,224,184,0.8);  }
      .fx-spell-ring--corruption{ border: 2px solid rgba(181,112,224,0.8); }

      @keyframes fx-spell-ring {
        0%   { transform: scale(0.8); opacity: 1; }
        100% { transform: scale(2);   opacity: 0; }
      }

      /* ── DEFEAT — obrazovka se "rozpadá" ── */
      .fx-defeat-overlay {
        position: fixed;
        inset: 0;
        background: #000;
        pointer-events: none;
        z-index: 9999;
        animation: fx-defeat-in 0.8s ease-in forwards;
      }
      @keyframes fx-defeat-in {
        0%   { opacity: 0; }
        100% { opacity: 1; }
      }

      /* ── VICTORY — zlatý záblesk ── */
      .fx-victory-flash {
        position: fixed;
        inset: 0;
        background: rgba(224,192,96,0.15);
        pointer-events: none;
        z-index: 9997;
        animation: fx-victory-flash 1s ease-out forwards;
      }
      @keyframes fx-victory-flash {
        0%   { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  },

  // ═══════════════════════════════════════════════════════════════
  // ÚTOK
  // ═══════════════════════════════════════════════════════════════

  playAttack(attackerEl, defenderEl, faction = 'synth') {
    this._ensureStyles();

    // Pozice dopadu = střed obránce
    const rect = defenderEl
      ? defenderEl.getBoundingClientRect()
      : { left: window.innerWidth/2, top: window.innerHeight/2, width: 0, height: 0 };

    const x = rect.left + rect.width  / 2;
    const y = rect.top  + rect.height / 2;

    const hit = document.createElement('div');
    hit.className = `fx-hit fx-hit--${faction}`;
    hit.style.left = `${x}px`;
    hit.style.top  = `${y}px`;
    document.body.appendChild(hit);

    hit.addEventListener('animationend', () => hit.remove());
  },

  // ── Přímý úder na LP — zatřese LP barem ──
  playLPHit(lpEl) {
    this._ensureStyles();
    if(!lpEl) return;
    lpEl.classList.remove('fx-lp-shake');
    void lpEl.offsetWidth; // reflow
    lpEl.classList.add('fx-lp-shake');
    lpEl.addEventListener('animationend', () => {
      lpEl.classList.remove('fx-lp-shake');
    }, { once: true });
  },

  // ═══════════════════════════════════════════════════════════════
  // SPELL
  // ═══════════════════════════════════════════════════════════════

  playSpell(cardEl, faction = 'synth') {
    this._ensureStyles();
    if(!cardEl) return;

    cardEl.style.position = 'relative';
    const ring = document.createElement('div');
    ring.className = `fx-spell-ring fx-spell-ring--${faction}`;
    cardEl.appendChild(ring);

    ring.addEventListener('animationend', () => ring.remove());
  },

  // ═══════════════════════════════════════════════════════════════
  // FÚZE
  // ═══════════════════════════════════════════════════════════════

  playFusion(cardAEl, cardBEl, onDone = null) {
    this._ensureStyles();

    // Flash přes celou obrazovku
    const flash = document.createElement('div');
    flash.className = 'fx-fusion-flash';
    document.body.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove());

    // Animuj obě karty (schovaj je)
    if(cardAEl) {
      cardAEl.classList.add('fx-fusion-card');
      cardAEl.addEventListener('animationend', () => {
        cardAEl.classList.remove('fx-fusion-card');
      }, { once: true });
    }
    if(cardBEl) {
      cardBEl.classList.add('fx-fusion-card');
      cardBEl.addEventListener('animationend', () => {
        cardBEl.classList.remove('fx-fusion-card');
        if(onDone) onDone(); // callback po dokončení merge
      }, { once: true });
    }

    if(!cardAEl && !cardBEl && onDone) onDone();
  },

  playFusionResult(cardEl) {
    this._ensureStyles();
    if(!cardEl) return;
    cardEl.classList.add('fx-fusion-result');
    cardEl.addEventListener('animationend', () => {
      cardEl.classList.remove('fx-fusion-result');
    }, { once: true });
  },

  // ═══════════════════════════════════════════════════════════════
  // JIZVA — upgrade formy
  // ═══════════════════════════════════════════════════════════════

  playScarUpgrade(cardEl, newForm) {
    this._ensureStyles();
    if(!cardEl) return;

    cardEl.style.position = 'relative';
    const glow = document.createElement('div');
    glow.className = 'fx-scar-upgrade';
    cardEl.appendChild(glow);

    glow.addEventListener('animationend', () => glow.remove());
  },

  // ═══════════════════════════════════════════════════════════════
  // CORRUPTION GLITCH
  // ═══════════════════════════════════════════════════════════════

  playCorruptionGlitch(intensity = 0.5) {
    this._ensureStyles();

    const duration = 200 + intensity * 400; // 200ms–600ms
    const overlay  = document.createElement('div');
    overlay.className = 'fx-corruption-overlay';
    overlay.style.setProperty('--fx-duration', `${duration}ms`);
    document.body.appendChild(overlay);

    overlay.addEventListener('animationend', () => overlay.remove());
  },

  // Opakující se glitch (pro corruption level 3+)
  startCorruptionLoop(level) {
    this._stopCorruptionLoop();
    if(level < 3) return;

    const interval = level === 5 ? 1500
                   : level === 4 ? 3000
                   :               6000;

    this._corruptionLoopTimer = setInterval(() => {
      this.playCorruptionGlitch(level / 5);
    }, interval + Math.random() * interval);
  },

  stopCorruptionLoop() {
    clearInterval(this._corruptionLoopTimer);
    this._corruptionLoopTimer = null;
  },

  _corruptionLoopTimer: null,

  // ═══════════════════════════════════════════════════════════════
  // VÝSLEDEK BITVY
  // ═══════════════════════════════════════════════════════════════

  playDefeat(onDone = null) {
    this._ensureStyles();
    const overlay = document.createElement('div');
    overlay.className = 'fx-defeat-overlay';
    document.body.appendChild(overlay);

    overlay.addEventListener('animationend', () => {
      if(onDone) onDone();
      // Overlay zůstane (zakryje obrazovku) — odebere ho až nová scéna
      setTimeout(() => overlay.remove(), 100);
    }, { once: true });
  },

  playVictory() {
    this._ensureStyles();
    const flash = document.createElement('div');
    flash.className = 'fx-victory-flash';
    document.body.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove());
  },
};

export default EffectEngine;
