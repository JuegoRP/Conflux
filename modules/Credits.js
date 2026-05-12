/**
 * Credits — CONFLUX
 *
 * Závěrečná obrazovka po dopise.
 * Autorův příběh o vzniku hry. Hudba, 20s timeout, pak menu.
 */

import Router      from '../engine/Router.js';
import AudioSystem from './AudioSystem.js';
import GameState   from '../engine/GameState.js';

const CREDITS_TEXT = [
  { delay: 0,    text: 'CONFLUX' },
  { delay: 1200, text: '2025 — 2026' },
  { delay: 2600, text: '— Roman Pavlorek' },
  { delay: 4200, text: '' },
  { delay: 4400, text: 'Tuto hru jsem dělal sám.' },
  { delay: 5800, text: 'S pomocí umělé inteligence jako spolupracovníka —' },
  { delay: 7400, text: 'ne jako nástroje, ale jako partnera.' },
  { delay: 9000, text: '' },
  { delay: 9200, text: 'CONFLUX vznikl jako otázka:' },
  { delay: 10600, text: 'Co se stane když přestaneme rozlišovat' },
  { delay: 12000, text: 'kde končí člověk a kde začíná systém?' },
  { delay: 13600, text: '' },
  { delay: 13800, text: 'Hra je odpovědí. Nebo dalším cyklem.' },
  { delay: 15400, text: '' },
  { delay: 15600, text: 'Děkuji že jsi byl součástí příběhu.' },
];

const AUTO_GOTO_MENU_MS = 22000;

const Credits = {

  _container: null,
  _timer:     null,
  _abortCtrl: null,

  init(container) {
    this._container = container;
    this._abortCtrl = new AbortController();
    const { signal } = this._abortCtrl;

    AudioSystem.stopMusic(800);
    setTimeout(() => {
      AudioSystem.playMusic('screen_credits', { loop: false, fadeIn: 2000 });
    }, 1000);

    this._render(signal);
  },

  destroy() {
    clearTimeout(this._timer);
    this._abortCtrl?.abort();
  },

  _render(signal) {
    const c = this._container;
    c.innerHTML = `
      <div class="cr-scene" id="cr-scene">
        <div class="cr-lines" id="cr-lines"></div>
        <button class="cr-skip" id="cr-skip">Zpět do menu →</button>
      </div>`;

    const linesEl = c.querySelector('#cr-lines');
    const skipBtn = c.querySelector('#cr-skip');

    skipBtn.addEventListener('click', () => this._goMenu(), { signal });

    // Postupné zobrazování řádků
    CREDITS_TEXT.forEach(({ delay, text }) => {
      setTimeout(() => {
        if(signal.aborted) return;
        const p = document.createElement('p');
        p.className = 'cr-line' + (text === '' ? ' cr-spacer' : '');
        p.textContent = text;
        p.style.animation = 'cr-fadein 1.2s ease forwards';
        linesEl.appendChild(p);
        linesEl.scrollTop = linesEl.scrollHeight;
      }, delay);
    });

    // Auto-redirect po 22s
    this._timer = setTimeout(() => {
      if(!signal.aborted) this._goMenu();
    }, AUTO_GOTO_MENU_MS);

    this._injectStyles();
  },

  _goMenu() {
    clearTimeout(this._timer);
    AudioSystem.stopMusic(1500);
    GameState.reset();
    GameState.clearCheckpoint();
    Router.goto('menu');
  },

  _injectStyles() {
    if(document.getElementById('cr-styles')) return;
    const s = document.createElement('style');
    s.id = 'cr-styles';
    s.textContent = `
      .cr-scene {
        position: fixed; inset: 0;
        background: #020305;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        padding: 40px 24px;
        overflow: hidden;
      }
      .cr-lines {
        display: flex; flex-direction: column;
        align-items: center; gap: 6px;
        max-width: 560px; width: 100%;
        overflow: hidden;
      }
      .cr-line {
        font-family: 'Georgia', 'Times New Roman', serif;
        font-size: clamp(13px, 2vw, 17px);
        color: rgba(200,185,155,0);
        text-align: center;
        line-height: 1.7;
        opacity: 0;
      }
      .cr-line:first-child {
        font-family: 'Press Start 2P', monospace;
        font-size: clamp(16px, 3vw, 22px);
        color: #4fa3e0;
        letter-spacing: 0.3em;
        margin-bottom: 8px;
      }
      .cr-line:nth-child(2), .cr-line:nth-child(3) {
        font-size: clamp(11px, 1.5vw, 14px);
        letter-spacing: 0.1em;
        color: rgba(140,120,90,0);
      }
      .cr-spacer { height: 12px; }
      @keyframes cr-fadein {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); color: #c8b99b; }
      }
      .cr-skip {
        position: absolute; bottom: 28px; right: 32px;
        background: transparent; border: none;
        font-family: 'Share Tech Mono', monospace;
        font-size: 12px; color: rgba(100,120,140,0.4);
        cursor: pointer; letter-spacing: 1px;
        transition: color 0.2s;
      }
      .cr-skip:hover { color: rgba(200,185,155,0.7); }
    `;
    document.head.appendChild(s);
  },
};

export default Credits;
