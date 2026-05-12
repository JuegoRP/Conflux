import EventBus from './EventBus.js';

/**
 * Router — CONFLUX
 *
 * Každý modul MUSÍ mít:
 *   module.init(container, params)  — vykreslí se do containeru
 *   module.destroy()                — uklidí po sobě (timery, listenery)
 *
 * Použití:
 *   Router.register('menu', MainMenu);
 *   Router.goto('menu');
 *   Router.goto('battle', { enemyId: 'scout_01' });
 *   Router.back();
 *
 * Emituje:
 *   router:change  { to, from, params }
 */
const Router = {
  _modules:       {},
  _current:       null,
  _currentName:   null,
  _container:     null,
  _history:       [],
  _transitioning: false,

  register(name, module) {
    this._modules[name] = module;
    console.log(`[Router] Zaregistrován: ${name}`);
  },

  setContainer(el) {
    this._container = el;
  },

  goto(name, params = {}) {
    if(!this._modules[name]) {
      console.error(`[Router] Modul '${name}' není zaregistrován!`);
      return;
    }

    // Zabráni přechodu pokud už probíhá — ale s safety timeoutem aby se nezasekl
    if(this._transitioning) {
      const elapsed = Date.now() - (this._transitionStart || 0);
      console.warn('[Router] _transitioning=true, elapsed:', elapsed, 'ms, goto:', name);
      if(elapsed < 5000) return;
      console.error('[Router] _transitioning stuck po 5s — force reset, předchozí modul:', this._currentName);
      if(this._current?.destroy) { try { this._current.destroy(); } catch(e) {} }
      this._transitioning = false;
    }
    this._transitioning = true;
    this._transitionStart = Date.now();

    const from = this._currentName;

    const _doTransition = () => {
      // Destroy předchozího modulu
      if(this._current && typeof this._current !== 'function' && this._current.destroy) {
        try { this._current.destroy(); }
        catch(e) { console.warn('[Router] destroy() selhalo:', e); }
      }

      // Historie
      if(this._currentName) {
        this._history.push(this._currentName);
        if(this._history.length > 20) this._history.shift();
      }

      // Vyčisti container
      if(this._container) {
        this._container.innerHTML = '';
        this._container.className = `screen screen-${name}`;
        this._container.removeAttribute('style');
        this._container.style.opacity = '0';
      }

      this._currentName = name;
      this._current     = this._modules[name];

      console.log(`[Router] ${from || 'start'} → ${name}`, params);

      // Emit
      EventBus.emit('router:change', { to: name, from, params });

      // Init nového modulu — podporuje objekt s .init() nebo přímou funkci
      try {
        const mod = this._current;
        const result = typeof mod === 'function'
          ? mod(this._container, params)
          : mod.init(this._container, params);
        if(result && typeof result.catch === 'function') {
          result.catch(e => console.error(`[Router] async init() modulu '${name}' selhalo:`, e));
        }
      } catch(e) {
        console.error(`[Router] init() modulu '${name}' selhalo:`, e);
      }

      // Fade in
      requestAnimationFrame(() => {
        if(this._container) {
          this._container.style.transition = 'opacity 0.2s ease';
          this._container.style.opacity = '1';
        }
        setTimeout(() => {
          if(this._container) this._container.style.transition = '';
          this._transitioning = false;
        }, 220);
      });
    };

    // Fade out pokud existuje aktuální obsah
    if(this._current && this._container?.children.length) {
      this._container.style.transition = 'opacity 0.15s ease';
      this._container.style.opacity = '0';
      setTimeout(_doTransition, 160);
    } else {
      // První načtení — bez fade out
      _doTransition();
    }
  },

  back(params = {}) {
    const prev = this._history.pop();
    if(prev) this.goto(prev, params);
    else console.warn('[Router] Žádná předchozí obrazovka v historii.');
  },

  current() { return this._currentName; },
  history() { return [...this._history]; },
};

export default Router;
