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
  _sfxVolume:  1.0,
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

    // Stejný track už hraje → neděj nic. (Dřív se při stejném klíči NEfadeovala
    // stará instance a vytvořila se druhá navrch → duplikace, kterou už nešlo vypnout.)
    if(this._current?.audio && this._current.key === key
       && !this._current.audio.paused && !this._current.audio.ended) return;

    // Vždy zhasni cokoli právě hraje
    if(this._current?.audio) {
      this._fadeOut(this._current.audio, Math.min(fadeIn, 1200));
      this._current = null;
    }

    if(!url) return;

    const audio = new Audio(url);
    // Konce a boss-intro buildy mají konec — nesmyčcovat
    audio.loop   = loop && !/_ending_|boss_intro/.test(key);
    audio.volume = 0;

    this._current = { key, audio };
    audio.play().then(() => {
      this._fadeTo(audio, this._musicVolume, fadeIn);
    }).catch(() => {
      // AUTOPLAY BLOKOVÁN → přehrát na příštím user gestu (jinak hudba vůbec nenaběhne)
      this._fadeTo(audio, this._musicVolume, fadeIn); // ať je volume připravené
      this._armAutoplayRetry();
    });
  },

  // Jednorázový retry — po prvním kliku/klávese zkusí rozjet aktuální hudbu, pokud stojí
  _armAutoplayRetry() {
    if(this._autoplayArmed) return;
    this._autoplayArmed = true;
    const retry = () => {
      document.removeEventListener('click', retry);
      document.removeEventListener('keydown', retry);
      document.removeEventListener('touchstart', retry);
      this._autoplayArmed = false;
      const a = this._current?.audio;
      if(a && a.paused) a.play().catch(() => {});
    };
    document.addEventListener('click', retry);
    document.addEventListener('keydown', retry);
    document.addEventListener('touchstart', retry);
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
    if(this._current?.key === key) return;
    this.playMusic(key, { fadeIn: 1500 });
  },

  // Hudba pro konkrétní screen (collection, deckbuilder, freebattle, story)
  playForScreen(screen, { fade = 1500 } = {}) {
    const key = `screen_${screen}`;
    if(this._current?.key === key) return;
    this.playMusic(key, { fadeIn: fade });
  },

  // Výběr battle hudby podle korupce a kontextu
  // isFree=true → free battle, isFree=false → příběhová bitva
  playBattleMusic(isFree = false) {
    if(isFree) {
      const key = 'battle_free';
      if(this._current?.key === key) return;
      this.playMusic(key, { fadeIn: 1200 });
      return;
    }
    const corruption = GameState.corruption?.level ?? 0;
    const key = corruption >= 3 ? 'battle_story_corrupted' : 'battle_story_clean';
    if(this._current?.key === key) return;
    this.playMusic(key, { fadeIn: 1200 });
  },

  // Hudba pro příběhový uzel — vybírá z story_* podle korupce a aktu
  playStoryMusic(actNumber = 1, forceKey = null) {
    // Nenamapovaný klíč (téma bez souboru) → spadni na default místo ticha
    if(forceKey && GameState.getMusic(forceKey)) {
      if(this._current?.key === forceKey) return;
      this.playMusic(forceKey, { fadeIn: 2000 });
      return;
    }
    const corruption = GameState.corruption?.level ?? 0;
    const alignment  = GameState.player?.alignment ?? 0;
    let key;
    if(corruption >= 4)      key = 'story_dramatic';
    else if(corruption >= 2) key = 'story_tension';
    else if(Math.abs(alignment) < 20) key = 'story_hybrid';
    else if(actNumber <= 2)  key = 'story_calm';
    else if(actNumber <= 5)  key = 'story_quiet';
    else                     key = 'story_slow';
    if(this._current?.key === key) return;
    this.playMusic(key, { fadeIn: 2000 });
  },

  // ══════════════════════════════════════════════════════════════
  // ZVUKOVÉ EFEKTY
  // ══════════════════════════════════════════════════════════════

  _fxPool: {},   // effectKey → [Audio,...] pool přednačtených, ready-to-play elementů

  // Nízká latence: místo klonování (které re-bufferuje) drž pool přednačtených elementů;
  // přehrání = najdi volný, currentTime=0, play(). Klon měl znatelné zpoždění.
  playEffect(effectKey, volume = null) {
    if(GameState.settings?.sfx === false) return;
    const url = GameState.getMusic(effectKey);
    if(!url) return;
    try {
      let pool = this._fxPool[effectKey];
      if(!pool) { pool = this._fxPool[effectKey] = []; this._makeFx(effectKey, url); }
      let a = pool.find(x => x.paused || x.ended);
      if(!a) { a = this._makeFx(effectKey, url); }  // všechny hrají → přidej do poolu (max ~4)
      a.currentTime = 0;
      a.volume = Math.min(1, Math.max(0, volume ?? this._sfxVolume));
      a.play().catch(() => {});
    } catch(e) {}
  },

  _makeFx(key, url) {
    const pool = this._fxPool[key] || (this._fxPool[key] = []);
    const a = new Audio(url);
    a.preload = 'auto';
    try { a.load(); } catch(e) {}
    if(pool.length < 4) pool.push(a);
    return a;
  },

  // Zahřej pool SFX dopředu (volá MainMenu při startu) — 2 kopie = plynulé rychlé opakování
  preloadEffects(keys) {
    for(const k of keys) {
      if(this._fxPool[k]) continue;
      const url = GameState.getMusic(k);
      if(!url) continue;
      this._fxPool[k] = [];
      this._makeFx(k, url); this._makeFx(k, url);
    }
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
    if(audio._fadeTimer) { clearInterval(audio._fadeTimer); audio._fadeTimer = null; }
    const steps    = 30;
    const interval = duration / steps;
    const delta    = (targetVolume - audio.volume) / steps;
    let   step     = 0;
    audio._fadeTimer = setInterval(() => {
      step++;
      audio.volume = Math.max(0, Math.min(1, audio.volume + delta));
      if(step >= steps) {
        audio.volume = targetVolume;
        clearInterval(audio._fadeTimer);
        audio._fadeTimer = null;
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
