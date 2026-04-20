import EventBus from './EventBus.js';
import { CARDS_DATA }    from '../data/cards.js';
import { ENEMIES_DATA }  from '../data/enemies.js';
import { CAMPAIGN_DATA } from '../data/campaign.js';

/**
 * AssetLoader — CONFLUX
 * Načítání dat a médií. Vše se cachuje — max 1× fetch.
 *
 * API:
 *   AssetLoader.getCards()
 *   AssetLoader.getCampaign()
 *   AssetLoader.getEnemies()
 *   AssetLoader.preloadImages(urls[])
 *   AssetLoader.clearCache()
 */
const AssetLoader = {
  _cache: {},

  async loadJSON(path) {
    if(this._cache[path]) return this._cache[path];
    // Inline data — bez fetch, funguje přes file://
    let data = null;
    if(path.includes('cards'))    data = CARDS_DATA;
    if(path.includes('campaign')) data = CAMPAIGN_DATA;
    if(path.includes('enemies'))  data = ENEMIES_DATA;
    if(data) { this._cache[path] = data; return data; }
    throw new Error(`AssetLoader: neznámý soubor '${path}'`);
  },

  async getCards()    { return CARDS_DATA; },
  async getCampaign() { return CAMPAIGN_DATA; },
  async getEnemies()  { return ENEMIES_DATA; },

  // Nepřátelé z campaign.json — primární zdroj, nevyžaduje enemies.json
  async getCampaignEnemies() {
    const campaign = await this.getCampaign();
    return campaign.enemies || {};
  },

  preloadImages(urls) {
    return Promise.all(urls.map(url => new Promise(resolve => {
      const img = new Image();
      img.onload = img.onerror = resolve;
      img.src = url;
    })));
  },

  clearCache() { this._cache = {}; }
};

export default AssetLoader;
