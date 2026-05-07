/**
 * EventBus — centrální komunikace mezi moduly
 *
 * Použití:
 *   import EventBus from './engine/EventBus.js';
 *
 *   EventBus.on('battle:end', handler)       // přihlásit se k odběru
 *   EventBus.emit('battle:end', { result })  // vyslat událost
 *   EventBus.off('battle:end', handler)      // odhlásit se
 *
 * Konvence událostí: 'oblast:akce'
 *   router:change     { screen, params }
 *   battle:start      { enemy }
 *   battle:end        { result: 'victory'|'defeat', alignment }
 *   story:node        { nodeId }
 *   story:choice      { choiceIndex, nextNode }
 *   game:save         { slot }
 *   game:load         { slot }
 */
const EventBus = {
  _listeners: {},

  /** Přihlásit se k události. Vrátí unsubscribe funkci. */
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  },

  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  },

  emit(event, data = {}) {
    if (window.DEBUG_EVENTS) console.log(`[EventBus] ${event}`, data);
    (this._listeners[event] || []).forEach(cb => {
      try { cb(data); }
      catch (e) { console.error(`[EventBus] Chyba v handleru '${event}':`, e); }
    });
  },

  clear() {
    this._listeners = {};
  }
};

export default EventBus;
