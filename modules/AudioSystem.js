/**
 * AudioSystem — CONFLUX
 *
 * Správa hudby a zvukových efektů.
 * Plynulé přechody mezi ACTy, corruption efekty na hudbu.
 *
 * Použití:
 *   AudioManager.playMusic('act1_battle');
 *   AudioManager.crossfade('act1_battle', 'act2_battle', 2000);
 *   AudioManager.playEffect('attack_synth');
 *   AudioManager.setCorruptionFilter(0.6);  ← zkreslení při corruption
 */

import GameState    from '../engine/GameState.js';
import AssetManager from '../engine/AssetManager.js';

const AudioSystem = {

  _current:    null,    // aktuálně přehrávaná hudba { key, audio }
  _sfxVolume:  0.8,
  _musicVolume:0.7,
  _muted:      false,
  _ctx:        null,    // AudioContext pro efekty
  _gainNode:   null,
  _filterNode: null,    // distortion při corruption

  // ══════════════════════════════════════════════════════════════
  // INICIALIZACE
  // ══════════════════════════════════════════════════════════════

  init() {
    this._musicVolume = GameState.settings.musicVolume ?? 0.7;
    this._sfxVolume   = GameState.settings.sfxVolume   ?? 0.8;
    // AudioContext — jen po user gesture (prohlížeče to vyžadují)
    // Zavolej AudioManager.initContext() po prvním kliku hráče
  },

  initContext() {
    if(this._ctx) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {
      console.warn('[AudioSystem] AudioContext nedostupný:', e);
    }
  },

  // ══════════════════════════════════════════════════════════════
  // HUDBA
  // ══════════════════════════════════════════════════════════════

  playMusic(key, { loop = true, fadeIn = 1000 } = {}) {
    const url = GameState.getMusic(key);
    if(!url) {
      // Soubor zatím neexistuje — ticho je ok
      this._current = null;
      return;
    }

    const audio = AssetManager.getAudio(key) || new Audio(url);
    audio.loop   = loop;
    audio.volume = 0;

    // Zastav předchozí
    if(this._current?.audio) {
      this._fadeOut(this._current.audio, fadeIn);
    }

    this._current = { key, audio };
    audio.play().catch(() => {});

    // Fade in
    this._fadeTo(audio, this._musicVolume, fadeIn);
  },

  stopMusic(fadeOut = 1000) {
    if(!this._current?.audio) return;
    this._fadeOut(this._current.audio, fadeOut);
    this._current = null;
  },

  crossfade(fromKey, toKey, duration = 2000) {
    this.playMusic(toKey, { fadeIn: duration });
  },

  // Automatický výběr hudby podle ACT a situace
  playForContext(actNumber, situation = 'battle') {
    const key = `act${actNumber}_${situation}`;
    if(this._current?.key === key) return;  // již hraje
    this.playMusic(key, { fadeIn: 1500 });
  },

  // ══════════════════════════════════════════════════════════════
  // ZVUKOVÉ EFEKTY
  // ══════════════════════════════════════════════════════════════

  playEffect(effectKey) {
    const url = GameState.getMusic(effectKey);  // efekty mohou být v music mapě
    if(!url || this._muted) return;
    try {
      const audio = new Audio(url);
      audio.volume = this._sfxVolume;
      audio.play().catch(() => {});
    } catch(e) {}
  },

  // Faction-specific zvuk útoku
  playAttackSound(faction) {
    const sfxMap = {
      synth:      'sfx_attack_synth',
      organic:    'sfx_attack_organic',
      hybrid:     'sfx_attack_hybrid',
      corruption: 'sfx_attack_corruption',
    };
    this.playEffect(sfxMap[faction] || 'sfx_attack_default');
  },

  // ══════════════════════════════════════════════════════════════
  // CORRUPTION AUDIO EFEKT
  // Čím vyšší corruption, tím více zkreslená hudba
  // ══════════════════════════════════════════════════════════════

  setCorruptionFilter(intensity = 0) {
    // intensity: 0.0 – 1.0
    // Zatím jen jako volume duck + pitch shift simulace
    if(!this._current?.audio) return;
    const targetVolume = this._musicVolume * (1 - intensity * 0.3);
    this._current.audio.volume = Math.max(0, targetVolume);
    // TODO: až bude AudioContext — přidat distortion node
  },

  // ══════════════════════════════════════════════════════════════
  // HLASITOST
  // ══════════════════════════════════════════════════════════════

  setMusicVolume(v) {
    this._musicVolume = Math.max(0, Math.min(1, v));
    GameState.settings.musicVolume = this._musicVolume;
    if(this._current?.audio) this._current.audio.volume = this._musicVolume;
  },

  setSfxVolume(v) {
    this._sfxVolume = Math.max(0, Math.min(1, v));
    GameState.settings.sfxVolume = this._sfxVolume;
  },

  mute()   { this._muted = true;  if(this._current?.audio) this._current.audio.volume = 0; },
  unmute() { this._muted = false; if(this._current?.audio) this._current.audio.volume = this._musicVolume; },

  // ══════════════════════════════════════════════════════════════
  // PRIVÁTNÍ
  // ══════════════════════════════════════════════════════════════

  _fadeTo(audio, targetVolume, duration) {
    const steps    = 30;
    const interval = duration / steps;
    const delta    = (targetVolume - audio.volume) / steps;
    let   step     = 0;
    const timer = setInterval(() => {
      step++;
      audio.volume = Math.max(0, Math.min(1, audio.volume + delta));
      if(step >= steps) {
        audio.volume = targetVolume;
        clearInterval(timer);
      }
    }, interval);
  },

  _fadeOut(audio, duration) {
    this._fadeTo(audio, 0, duration);
    setTimeout(() => {
      try { audio.pause(); audio.currentTime = 0; } catch(e) {}
    }, duration + 100);
  },
};

export default AudioSystem;
