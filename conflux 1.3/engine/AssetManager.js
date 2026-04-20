/**
 * AssetManager — CONFLUX
 *
 * Centrální správa všech assetů.
 * Načítá obrázky, hudbu, efekty. Pokud soubor neexistuje → placeholder.
 * Až přidáš reálné soubory, stačí vyplnit cesty v GameState.assets.
 *
 * Použití:
 *   await AssetManager.preloadAct(1);
 *   AssetManager.getBackground(1);   // vrátí URL nebo null
 *   AssetManager.getCardImage(5);    // vrátí URL nebo null (fallback = emoji)
 */

import GameState from './GameState.js';
import EventBus  from './EventBus.js';

const AssetManager = {

  _cache:  new Map(),   // url → HTMLImageElement | HTMLAudioElement
  _failed: new Set(),   // url → neexistuje, neopakovat

  // ══════════════════════════════════════════════════════════════
  // PŘEDNAHRÁVANÍ PER ACT
  // ══════════════════════════════════════════════════════════════

  async preloadAct(actNumber) {
    const promises = [];

    // Background
    const bg = GameState.getBackground(actNumber);
    if(bg) promises.push(this._loadImage(bg));

    // Music (battle + boss)
    const battleTrack = GameState.getMusic(`act${actNumber}_battle`);
    const bossTrack   = GameState.getMusic(`act${actNumber}_boss`);
    if(battleTrack) promises.push(this._loadAudio(battleTrack));
    if(bossTrack)   promises.push(this._loadAudio(bossTrack));

    // Portrétky hlavních postav (vždy)
    const portraits = ['monyra', 'rozara', 'romen', 'voit'];
    portraits.forEach(p => {
      const url = GameState.assets.portraits[p];
      if(url) promises.push(this._loadImage(url));
    });

    await Promise.allSettled(promises);
    EventBus.emit('assets:actLoaded', { actNumber, count: promises.length });
  },

  // ══════════════════════════════════════════════════════════════
  // BACKGROUND
  // ══════════════════════════════════════════════════════════════

  getBackground(actNumber) {
    const url = GameState.getBackground(actNumber);
    if(!url || this._failed.has(url)) return null;
    return this._cache.has(url) ? url : null;
  },

  // CSS background-image string nebo null
  getBackgroundCSS(actNumber) {
    const url = this.getBackground(actNumber);
    return url ? `url('${url}')` : null;
  },

  // ══════════════════════════════════════════════════════════════
  // CARD IMAGES
  // ══════════════════════════════════════════════════════════════

  getCardImage(cardId) {
    const card = GameState.getCard(cardId);
    if(!card?.image) return null;
    const url = `assets/cards/${card.image}`;
    if(this._failed.has(url)) return null;
    return this._cache.has(url) ? url : null;
  },

  getCardBack(faction = 'default') {
    const url = GameState.assets.cardBack[faction] || GameState.assets.cardBack.default;
    if(!url || this._failed.has(url)) return null;
    return url;
  },

  // ══════════════════════════════════════════════════════════════
  // PORTRÉTY POSTAV
  // ══════════════════════════════════════════════════════════════

  getPortrait(characterId, mood = 'neutral') {
    // Zkus nejdřív s náladu, fallback na neutral
    const moodKey = `${characterId}_${mood}`;
    const url = GameState.assets.portraits[moodKey]
             || GameState.assets.portraits[characterId];
    if(!url || this._failed.has(url)) return null;
    return url;
  },

  // ══════════════════════════════════════════════════════════════
  // AUDIO
  // ══════════════════════════════════════════════════════════════

  getAudio(key) {
    const url = GameState.getMusic(key);
    if(!url || this._failed.has(url)) return null;
    return this._cache.get(url) || null;
  },

  // ══════════════════════════════════════════════════════════════
  // PRIVÁTNÍ — načítání
  // ══════════════════════════════════════════════════════════════

  _loadImage(url) {
    if(this._cache.has(url) || this._failed.has(url)) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const img = new Image();
      img.onload  = () => { this._cache.set(url, img); resolve(); };
      img.onerror = () => { this._failed.add(url);     resolve(); };
      img.src = url;
    });
  },

  _loadAudio(url) {
    if(this._cache.has(url) || this._failed.has(url)) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const audio = new Audio();
      audio.oncanplaythrough = () => { this._cache.set(url, audio); resolve(); };
      audio.onerror          = () => { this._failed.add(url);       resolve(); };
      audio.src = url;
      audio.load();
    });
  },

  // Přednahrání jednoho obrázku na vyžádání (lazy)
  async ensureImage(url) {
    if(this._cache.has(url) || this._failed.has(url)) return;
    await this._loadImage(url);
  },
};

export default AssetManager;
