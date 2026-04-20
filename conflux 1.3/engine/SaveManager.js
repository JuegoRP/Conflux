import GameState from './GameState.js';
import EventBus from './EventBus.js';

/**
 * SaveManager - ukladani a nacitani hry
 * Max 3 sloty (0, 1, 2) v localStorage
 */
const SaveManager = {
  PREFIX: 'cardbound_save_',
  MAX_SLOTS: 3,
  VERSION: '0.5',

  save(slot = 0) {
    if (slot < 0 || slot >= this.MAX_SLOTS) {
      console.error(`[SaveManager] Neplatny slot: ${slot}`);
      return false;
    }
    const data = {
      ...GameState.toSave(),
      version: this.VERSION,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(this.PREFIX + slot, JSON.stringify(data));
      console.log(`[SaveManager] Ulozeno do slotu ${slot}`);
      // Trackuj naposledy použitý slot pro automatické ukládání
      GameState._lastSaveSlot = slot;
      EventBus.emit('game:save', { slot, timestamp: data.timestamp });
      return true;
    } catch (e) {
      console.error('[SaveManager] Chyba pri ukladani:', e);
      return false;
    }
  },

  load(slot = 0) {
    const raw = localStorage.getItem(this.PREFIX + slot);
    if (!raw) {
      console.warn(`[SaveManager] Slot ${slot} je prazdny`);
      return false;
    }
    try {
      const data = JSON.parse(raw);
      GameState.fromSave(data);
      GameState._lastSaveSlot = slot;
      console.log(`[SaveManager] Nacteno ze slotu ${slot}`, new Date(data.timestamp).toLocaleString());
      // Obnov checkpoint z uloženého stavu pokud existuje
      if(data.checkpoint?.nodeId) {
        GameState.checkpoint = { ...data.checkpoint };
        console.log(`[SaveManager] Checkpoint obnoven: ${data.checkpoint.nodeId}`);
      }
      EventBus.emit('game:load', { slot });
      return true;
    } catch (e) {
      console.error('[SaveManager] Chyba pri nacitani:', e);
      return false;
    }
  },

  /** Vrati metadata vsech slotu - pro UI vyber save souboru */
  listSlots() {
    return Array.from({ length: this.MAX_SLOTS }, (_, i) => {
      const raw = localStorage.getItem(this.PREFIX + i);
      if (!raw) return { slot: i, empty: true };
      try {
        const { timestamp, version, campaign, player } = JSON.parse(raw);
        return {
          slot: i,
          empty: false,
          timestamp,
          version,
          chapter: campaign?.chapter ?? 0,
          playerName: player?.name ?? '?',
          alignment: player?.alignment ?? 0,
          faction: player?.faction ?? null,
          date: new Date(timestamp).toLocaleString('cs-CZ'),
        };
      } catch {
        return { slot: i, empty: true, corrupt: true };
      }
    });
  },

  delete(slot) {
    localStorage.removeItem(this.PREFIX + slot);
    console.log(`[SaveManager] Slot ${slot} smazan`);
  },

  clearAll() {
    for(let i = 0; i < 3; i++) localStorage.removeItem(this.PREFIX + i);
    localStorage.removeItem('conflux_save'); // legacy
    console.log('[SaveManager] Všechny save smazány');
  },

  /** Zkontroluj jestli existuje alespon jeden save */
  hasSave() {
    // Zkontroluj oba klíče — nový (cardbound_save_) i starý (conflux_save)
    const hasSlot = this.listSlots().some(s => !s.empty);
    const hasLegacy = !!localStorage.getItem('conflux_save');
    return hasSlot || hasLegacy;
  },

  /** Vrátí nodeId posledního checkpointu (z libovolného zdroje) */
  getCheckpointNodeId() {
    // 1. Zkus sloty
    for(let i = 0; i < this.MAX_SLOTS; i++) {
      try {
        const raw = localStorage.getItem(this.PREFIX + i);
        if(!raw) continue;
        const data = JSON.parse(raw);
        if(data.checkpoint?.nodeId) return data.checkpoint.nodeId;
      } catch(e) {}
    }
    // 2. Zkus legacy conflux_save
    try {
      const raw = localStorage.getItem('conflux_save');
      if(raw) {
        const data = JSON.parse(raw);
        if(data.checkpoint?.nodeId) return data.checkpoint.nodeId;
        if(data.currentNode) return data.currentNode;
      }
    } catch(e) {}
    return null;
  }
};

export default SaveManager;
