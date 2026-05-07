import GameState from '../engine/GameState.js';
import EventBus  from '../engine/EventBus.js';

/**
 * CorruptionVisuals — CONFLUX
 *
 * Aplikuje vizuální korupční efekty na UI podle corruption levelu.
 * Hráč nikdy nevidí číslo — vidí jen efekty.
 *
 * Level 0-1: nic / sotva znatelné
 * Level 2:   jména postav občas "zaskočí" na jiný znak
 * Level 3:   slova se přepisují, dialog má glitch řádky
 * Level 4:   UI elementy se posouvají, barvy se mění
 * Level 5:   skoro nečitelné — těsně před brzkým koncem
 *
 * Použití:
 *   CorruptionVisuals.init();      // jednou v main.js
 *   CorruptionVisuals.applyTo(el); // na konkrétní element
 */

const CorruptionVisuals = {

  _level: 0,
  _active: false,
  _intervals: [],

  // ═══════════════════════════════════════════════════════════════
  // INIT — nastaví listenery, začne monitorovat level
  // ═══════════════════════════════════════════════════════════════

  init() {
    if(this._active) return;
    this._active = true;

    // Naslouchej na změny corruption
    EventBus.on('corruption:change', ({ level }) => {
      this._level = level;
      this._updateRoot(level);
      this._restartLoops(level);
    });

    // Injektuj CSS styly
    if(!document.getElementById('corruption-visuals-styles')) {
      const style = document.createElement('style');
      style.id = 'corruption-visuals-styles';
      style.textContent = this.getStyles();
      document.head.appendChild(style);
    }
    // Načti aktuální level
    this._level = GameState.getCorruptionLevel ? GameState.getCorruptionLevel() : 0;
    this._updateRoot(this._level);
    this._restartLoops(this._level);
  },

  // ═══════════════════════════════════════════════════════════════
  // ROOT — nastaví data-corruption na #app
  // ═══════════════════════════════════════════════════════════════

  _updateRoot(level) {
    const app = document.getElementById('app');
    if(!app) return;
    app.dataset.corruption = level;
    // Nastav fázi pro CSS
    let phase = 1;
    if(level >= 96) phase = 5;
    else if(level >= 81) phase = 4;
    else if(level >= 61) phase = 3;
    else if(level >= 31) phase = 2;
    app.dataset.corruptionPhase = phase;
  },

  // ═══════════════════════════════════════════════════════════════
  // SMYČKY — opakující se efekty podle levelu
  // ═══════════════════════════════════════════════════════════════

  _restartLoops(level) {
    // Zastav staré smyčky
    this._intervals.forEach(id => clearInterval(id));
    this._intervals = [];

    if(level < 2) return;

    // Level 2+: občasný glitch na jména postav v dialogu
    if(level >= 2) {
      const id = setInterval(() => this._glitchSpeakerNames(), 8000);
      this._intervals.push(id);
    }

    // Level 3+: glitch na náhodné slovo v dialog textu
    if(level >= 3) {
      const id = setInterval(() => this._glitchDialogWord(), 5000);
      this._intervals.push(id);
    }

    // Level 4+: přehoď barvu náhodného UI elementu
    if(level >= 4) {
      const id = setInterval(() => this._glitchUIColor(), 3000);
      this._intervals.push(id);
    }

    // Level 5: glitch každou sekundu
    if(level >= 5) {
      const id = setInterval(() => {
        this._glitchSpeakerNames();
        this._glitchDialogWord();
      }, 1200);
      this._intervals.push(id);
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // EFEKTY
  // ═══════════════════════════════════════════════════════════════

  // Záblesk na jméno mluvčího — nahradí písmeno na 300ms
  _glitchSpeakerNames() {
    const speakers = document.querySelectorAll('.dlg-speaker, .cs-speaker');
    if(!speakers.length) return;

    const el = speakers[Math.floor(Math.random() * speakers.length)];
    const original = el.textContent;
    if(!original || original.length < 3) return;

    const glitched = this._glitchText(original, this._level);
    el.textContent = glitched;
    el.classList.add('glitch-active');

    setTimeout(() => {
      el.textContent = original;
      el.classList.remove('glitch-active');
    }, 200 + Math.random() * 300);
  },

  // Záblesk na náhodné slovo v textu dialogu
  _glitchDialogWord() {
    const textEls = document.querySelectorAll('.dlg-text, .cs-text');
    if(!textEls.length) return;

    const el = textEls[Math.floor(Math.random() * textEls.length)];
    const words = el.textContent.split(' ');
    if(words.length < 3) return;

    const original = el.textContent;

    // Nahraď 1-2 náhodná slova
    const numGlitch = this._level >= 4 ? 2 : 1;
    for(let i = 0; i < numGlitch; i++) {
      const idx = Math.floor(Math.random() * words.length);
      words[idx] = this._glitchText(words[idx], this._level);
    }

    el.textContent = words.join(' ');

    setTimeout(() => {
      el.textContent = original;
    }, 150 + Math.random() * 200);
  },

  // Záblesk barvy na náhodném UI elementu
  _glitchUIColor() {
    const targets = document.querySelectorAll(
      '.dlg-speaker[data-side="npc"], .choice-btn, .anchor-symbol, .db-card-name'
    );
    if(!targets.length) return;

    const el = targets[Math.floor(Math.random() * targets.length)];
    const original = el.style.color;
    el.style.color = this._randomCorruptColor();
    el.style.transition = 'none';

    setTimeout(() => {
      el.style.color = original;
    }, 80 + Math.random() * 120);
  },

  // ═══════════════════════════════════════════════════════════════
  // APLIKUJ NA ELEMENT — pro programové použití
  // ═══════════════════════════════════════════════════════════════

  /**
   * Aplikuj korupční efekt na konkrétní element.
   * Volá se z StoryEngine když se zobrazí dialog při vysoké corruption.
   */
  applyTo(el, intensity = null) {
    if(!el) return;
    const level = intensity !== null ? intensity : this._level;
    if(level < 2) return;

    el.classList.add(`corruption-l${level}`);

    // Level 3+: přidej glitch atribut pro CSS animaci
    if(level >= 3) {
      el.dataset.corruptionText = el.textContent;
    }
  },

  /**
   * Aplikuj glitch na jeden řádek textu — vrátí HTML string.
   * Používá se při renderování dialog řádků v StoryEngine.
   */
  processDialogLine(text, speaker) {
    const level = this._level;
    if(level < 2) return text;

    // Level 2: občas přidej glitch na jedno písmeno
    if(level === 2 && Math.random() < 0.15) {
      return this._glitchText(text, 2);
    }

    // Level 3: přidej glitch slovo + možná glitch řádek navíc
    if(level === 3 && Math.random() < 0.25) {
      const words = text.split(' ');
      const idx   = Math.floor(Math.random() * words.length);
      words[idx]  = `<span class="glitch">${this._glitchText(words[idx], 3)}</span>`;
      return words.join(' ');
    }

    // Level 4: systém "přepisuje" věty
    if(level === 4 && Math.random() < 0.3) {
      return this._corruptSentence(text);
    }

    // Level 5: text je těžko čitelný
    if(level >= 5) {
      return this._heavilyCorrupt(text);
    }

    return text;
  },

  /**
   * Aplikuj glitch na jméno postavy — pro korupci level 3+.
   */
  processSpeakerName(name) {
    const level = this._level;
    if(level < 3) return name;
    if(level === 3 && Math.random() < 0.2) return this._glitchText(name, 3);
    if(level >= 4  && Math.random() < 0.4) return this._glitchText(name, level);
    return name;
  },

  // ═══════════════════════════════════════════════════════════════
  // INTERNÍ GLITCH FUNKCE
  // ═══════════════════════════════════════════════════════════════

  _glitchText(text, level) {
    if(!text || text.length === 0) return text;

    // Korupční znakové sady podle intenzity
    const charsets = [
      '░▒▓█▄▀■□▪▫',          // level 2 — blokové znaky
      '₀₁₂₃₄₅₆₇₈₉ₐₑₒₓ',    // level 3 — subscript
      '̈̀́̂̃̄̅̆̇̈̉',              // level 4 — diakritika
      '̷̸̶̴̵╳╱╲╴╵',            // level 5 — přeškrtnutí
    ];

    const charset = charsets[Math.min(level - 2, charsets.length - 1)];
    const numGlitch = Math.ceil(text.length * (level * 0.08));
    let chars = text.split('');

    for(let i = 0; i < numGlitch; i++) {
      const pos = Math.floor(Math.random() * chars.length);
      if(chars[pos] === ' ') continue;
      chars[pos] = charset[Math.floor(Math.random() * charset.length)];
    }

    return chars.join('');
  },

  // "Systém přepisuje" — nahradí části věty systémovým jazykem
  _corruptSentence(text) {
    const systemPhrases = [
      'ERROR', 'NULL', 'PŘEPIS', '???', 'SMAZÁNO',
      '[CHYBÍ DATA]', 'KORUPCE', '▓▓▓', '///', 'NUL',
    ];
    const words = text.split(' ');
    const numCorrupt = Math.floor(words.length * 0.3);

    for(let i = 0; i < numCorrupt; i++) {
      const idx = Math.floor(Math.random() * words.length);
      words[idx] = systemPhrases[Math.floor(Math.random() * systemPhrases.length)];
    }

    return words.join(' ');
  },

  // Level 5 — každé druhé slovo je korupční
  _heavilyCorrupt(text) {
    const words = text.split(' ');
    return words.map((w, i) => {
      if(i % 2 === 0) return this._glitchText(w, 5);
      return w;
    }).join(' ');
  },

  _randomCorruptColor() {
    const colors = [
      '#b570e0', // corruption purple
      '#ff0066', // glitch pink
      '#00ff88', // glitch green
      '#ff3300', // error red
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  },

  // ═══════════════════════════════════════════════════════════════
  // DESTROY
  // ═══════════════════════════════════════════════════════════════

  destroy() {
    this._intervals.forEach(id => clearInterval(id));
    this._intervals = [];
    this._active = false;
  },

  // ═══════════════════════════════════════════════════════════════
  // CSS — vložené styly
  // ═══════════════════════════════════════════════════════════════

  getStyles() {
    return `
      /* Aktivní glitch třída — krátký záblesk */
      .glitch-active {
        animation: corruption-name-glitch 0.15s steps(1);
      }
      @keyframes corruption-name-glitch {
        0%   { opacity: 1; }
        50%  { opacity: 0.4; color: var(--corruption, #b570e0); }
        100% { opacity: 1; }
      }

      /* Corruption třídy na elementech */
      .corruption-l2 { animation: text-flicker-l2 8s infinite; }
      .corruption-l3 { animation: text-flicker-l3 4s infinite; }
      .corruption-l4 {
        animation: text-flicker-l4 2s infinite;
        text-shadow: 1px 0 var(--corruption, #b570e0),
                    -1px 0 rgba(106,184,240,0.4);
      }
      .corruption-l5 {
        animation: text-flicker-l5 0.8s infinite;
        text-shadow: 2px 0 var(--corruption, #b570e0),
                    -2px 0 rgba(106,184,240,0.6);
        filter: hue-rotate(10deg);
      }

      @keyframes text-flicker-l2 {
        0%,92%,100% { opacity:1; }
        93%          { opacity:0.85; }
      }
      @keyframes text-flicker-l3 {
        0%,85%,100% { opacity:1; }
        86%          { opacity:0.7; }
        88%          { opacity:1; }
        90%          { opacity:0.8; }
      }
      @keyframes text-flicker-l4 {
        0%,75%,100% { opacity:1; transform:translateX(0); }
        76%          { opacity:0.6; transform:translateX(-1px); }
        78%          { opacity:1;   transform:translateX(1px); }
        80%          { opacity:0.8; transform:translateX(0); }
      }
      @keyframes text-flicker-l5 {
        0%,60%,100% { opacity:1;   transform:translateX(0) skewX(0deg); }
        61%          { opacity:0.5; transform:translateX(-2px) skewX(-1deg); }
        63%          { opacity:1;   transform:translateX(2px) skewX(1deg); }
        65%          { opacity:0.7; transform:translateX(0) skewX(0deg); }
      }

      /* ── CORRUPTION FÁZE — celé UI ── */
      /* Fáze 1 (level 1-30): nic viditelného */
      
      /* Fáze 2 (level 31-60): mírný fialový nádech */
      #app[data-corruption-phase="2"] {
        --accent: #9070c0;
        --text: #c0cce0;
      }
      #app[data-corruption-phase="2"]::after {
        content:'';
        position:fixed;inset:0;pointer-events:none;z-index:999;
        background: radial-gradient(ellipse at 50% 100%, rgba(100,40,160,0.08) 0%, transparent 70%);
      }

      /* Fáze 3 (level 61-80): výrazný posun do fialova, scan linky */
      #app[data-corruption-phase="3"] {
        --accent: #b040e0;
        --text: #b0b8d0;
        filter: hue-rotate(15deg) saturate(0.9);
      }
      #app[data-corruption-phase="3"]::after {
        content:'';
        position:fixed;inset:0;pointer-events:none;z-index:999;
        background: repeating-linear-gradient(
          0deg, transparent, transparent 2px,
          rgba(100,0,180,0.03) 2px, rgba(100,0,180,0.03) 4px
        );
        animation: scan-lines 8s linear infinite;
      }

      /* Fáze 4 (level 81-95): silný glitch, obraz se trhá */
      #app[data-corruption-phase="4"] {
        --accent: #cc20f0;
        --text: #9090b8;
        filter: hue-rotate(30deg) saturate(0.7) contrast(1.1);
        animation: corruption-shake 4s infinite;
      }
      #app[data-corruption-phase="4"]::after {
        content:'';
        position:fixed;inset:0;pointer-events:none;z-index:999;
        background: repeating-linear-gradient(
          0deg, transparent, transparent 3px,
          rgba(180,0,255,0.06) 3px, rgba(180,0,255,0.06) 4px
        );
      }

      /* Fáze 5 (level 96+): těsně před corruption koncem */
      #app[data-corruption-phase="5"] {
        filter: hue-rotate(60deg) saturate(0.4) contrast(1.3);
        animation: corruption-shake 1.5s infinite;
      }
      #app[data-corruption-phase="5"]::before {
        content:'PŘEPIS PROBÍHÁ';
        position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        font-family:monospace;font-size:11px;color:rgba(180,0,255,0.15);
        letter-spacing:8px;pointer-events:none;z-index:1000;
        animation:corruption-text-pulse 2s infinite;
      }

      @keyframes scan-lines {
        0%   { background-position: 0 0; }
        100% { background-position: 0 100px; }
      }
      @keyframes corruption-shake {
        0%,100% { transform: translateX(0); }
        92%      { transform: translateX(0); }
        93%      { transform: translateX(-1px); }
        94%      { transform: translateX(1px); }
        95%      { transform: translateX(0); }
      }
      @keyframes corruption-text-pulse {
        0%,100% { opacity:0.15; }
        50%      { opacity:0.4; }
      }
    `;
  },
};

export default CorruptionVisuals;
