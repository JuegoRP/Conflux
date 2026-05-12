import Router      from '../engine/Router.js';
import EventBus    from '../engine/EventBus.js';
import GameState   from '../engine/GameState.js';
import SaveManager from '../engine/SaveManager.js';
import AudioSystem from './AudioSystem.js';
import { renderCardEl, renderCardPreview, injectCardStyles } from './CardRenderer.js';

/**
 * DeckBuilder — CONFLUX v2013
 * Opravené bugy:
 *  - await GameState.loadCards() na začátku init()
 *  - _saveDeck kontroluje 30 (ne 40)
 *  - currentAct z campaign.chapter (ne campaign.act)
 *  - arena kind v labelech a filtrech
 *  - fusion detekce přes fusionIndex (ne c.fusion)
 *  - getCardScarForm → getScarData()
 *  - factionColor/Label pro corruption + neutral
 *  - dead code _buildStarterCollection/_buildStarterDeck odstraněn
 */

const factionColor = f => ({
  synth:      '#4fa3e0',
  organic:    '#e04f6a',
  hybrid:     '#50e0b8',
  corruption: '#b570e0',
  neutral:    '#c8d6e5',
}[f] || '#c8d6e5');

const factionLabel = f => ({
  synth:      'SYNTH',
  organic:    'ORGANIC',
  hybrid:     'HYBRID',
  corruption: 'CORRUPTION',
  neutral:    'NEUTRAL',
}[f] || (f||'').toUpperCase());

const kindLabel = k => ({
  monster: 'MONSTER',
  spell:   'KOUZLO',
  trap:    'PAST',
  arena:   'ARÉNA',
}[k] || (k||'').toUpperCase());

const DeckBuilder = {
  _container:  null,
  _allCards:   [],   // karty dostupné v aktuálním aktu
  _fusionIds:  new Set(), // IDčka výsledků fúze — dostupné až jako drop, hráč je nezíská jinak
  _collection: [],   // kopie GameState.player.collection (pole ID)
  _deck:       [],   // kopie GameState.player.deck (pole ID)
  _filter: { faction: 'all', kind: 'all', search: '', sort: 'id', sortDir: 'asc' },
  _preview:    null,
  _toastTimer: null,

  MAX_DECK:   30,
  MAX_COPIES: 3,

  // ── INIT ──────────────────────────────────────────────────────────────────
  async init(container, params = {}) {
    this._container = container;
    this._filter = { faction: 'all', kind: 'all', search: '', sort: 'id', sortDir: 'asc' };
    this._preview = null;
    injectCardStyles();
    this._injectStyles();
    container.innerHTML = `<div class="db-loading"><span>načítám kolekci...</span></div>`;

    // Načti cards.json pokud ještě není (singleton — volání je bezpečné)
    await GameState.loadCards();
    AudioSystem.playForScreen('deckbuilder', { fade: 1500 });

    // Sestav množinu fusion výsledků — ty nelze přidat ručně
    this._fusionIds = new Set(Object.values(GameState.fusionIndex || {}));

    // Urči aktuální akt z campaign.chapter (1 = default)
    const chapter    = GameState.campaign?.chapter || 0;
    const currentAct = chapter > 0 ? Math.ceil(chapter / 5) : 1; // rough mapping
    // Bezpečnější: číst z currentNode prefix
    const nodeId = GameState.campaign?.currentNode || '';
    const actNum = nodeId.startsWith('act3') ? 3 : nodeId.startsWith('act2') ? 2 : 1;

    // V edit módu: všechny vlastněné karty bez omezení aktu
    // V read-only: jen karty do aktuálního aktu (pro přehled co hráč "viděl")
    if(this._readOnly) {
      this._allCards = GameState.cards.filter(c => (c.actUnlock || 1) <= actNum);
      if(!this._allCards.length) this._allCards = GameState.cards.filter(c => (c.actUnlock || 1) <= 1);
    } else {
      // Deck builder: zobraz všechny karty které hráč vlastní (bez omezení aktu)
      this._allCards = GameState.cards;
    }
    // Speciální (Eli/Voit) a letter karty schovej — nelze hrát
    // Fúzní karty jsou dostupné pokud je hráč vlastní (jako drop)
    this._allCards = this._allCards.filter(c => !c.special && c.kind !== 'letter');

    // Pokud hráč ještě nemá kolekci, sestav starter kolekci bez reset()
    if(!GameState.player.collection.length) {
      const starterIds = GameState.buildStarterDeck?.() || [];
      if(starterIds.length) {
        const unique = [...new Set(starterIds)];
        GameState.player.collection = [...starterIds, ...unique];
        if(!GameState.player.deck?.length) GameState.player.deck = [...starterIds];
      }
    }
    this._collection = [...GameState.player.collection];
    this._deck       = [...GameState.player.deck];
    this._returnTo   = params?.returnTo || null;
    this._returnParams = params?.returnParams || null;

    this._render();
  },

  // ── RENDER ────────────────────────────────────────────────────────────────
  _render() {
    const dc = this._deck.length;

    this._container.innerHTML = `
      <div class="db-wrap fade-in">

        <div class="db-header">
          <button class="db-back" id="db-back">←</button>
          <div class="db-title">
            <span class="db-title-main">DECK</span>
            <span class="db-title-sub">builder</span>
          </div>
          <div class="db-header-right">
            <div class="db-deck-counter">
              <span class="db-cnt-val ${dc === this.MAX_DECK ? 'cnt-full' : dc > this.MAX_DECK ? 'cnt-over' : 'cnt-low'}">${dc}</span>
              <span class="db-cnt-sep">/</span>
              <span class="db-cnt-max">${this.MAX_DECK}</span>
              ${dc !== this.MAX_DECK ? `<span class="cnt-warn"> ← přesně ${this.MAX_DECK}!</span>` : ''}
            </div>
            <button class="db-save-btn ${dc === this.MAX_DECK ? 'db-save-ready' : ''}" id="db-save">ULOŽIT</button>
          </div>
        </div>

        <div class="db-filters">
          <div class="db-filter-group">
            <button class="db-filter-btn ${this._filter.faction==='all'?'active':''}"        data-filter="faction" data-val="all">VŠE</button>
            <button class="db-filter-btn ${this._filter.faction==='synth'?'active':''}"      data-filter="faction" data-val="synth">SYNTH</button>
            <button class="db-filter-btn ${this._filter.faction==='organic'?'active':''}"    data-filter="faction" data-val="organic">ORGANIC</button>
            <button class="db-filter-btn ${this._filter.faction==='hybrid'?'active':''}"     data-filter="faction" data-val="hybrid">HYBRID</button>
            <button class="db-filter-btn ${this._filter.faction==='corruption'?'active':''}" data-filter="faction" data-val="corruption">CORR.</button>
          </div>
          <div class="db-filter-group">
            <button class="db-filter-btn ${this._filter.kind==='all'?'active':''}"     data-filter="kind" data-val="all">VŠE</button>
            <button class="db-filter-btn ${this._filter.kind==='monster'?'active':''}" data-filter="kind" data-val="monster">MONSTER</button>
            <button class="db-filter-btn ${this._filter.kind==='spell'?'active':''}"   data-filter="kind" data-val="spell">KOUZLO</button>
            <button class="db-filter-btn ${this._filter.kind==='trap'?'active':''}"    data-filter="kind" data-val="trap">PAST</button>
            <button class="db-filter-btn ${this._filter.kind==='arena'?'active':''}"   data-filter="kind" data-val="arena">ARÉNA</button>
          </div>
          <div class="db-filter-group">
            <span class="db-sort-label">ŘADIT:</span>
            <button class="db-filter-btn ${this._filter.sort==='id'?'active':''}"    data-filter="sort" data-val="id">#</button>
            <button class="db-filter-btn ${this._filter.sort==='atk'?'active':''}"   data-filter="sort" data-val="atk">ATK${this._filter.sort==='atk'?(this._filter.sortDir==='asc'?'↑':'↓'):'↓'}</button>
            <button class="db-filter-btn ${this._filter.sort==='def'?'active':''}"   data-filter="sort" data-val="def">DEF${this._filter.sort==='def'?(this._filter.sortDir==='asc'?'↑':'↓'):'↓'}</button>
            <button class="db-filter-btn ${this._filter.sort==='power'?'active':''}" data-filter="sort" data-val="power">PWR${this._filter.sort==='power'?(this._filter.sortDir==='asc'?'↑':'↓'):'↓'}</button>
            <button class="db-filter-btn ${this._filter.sort==='name'?'active':''}"  data-filter="sort" data-val="name">A-Z</button>
          </div>
          <input class="db-search" id="db-search" type="text"
            placeholder="hledat..." value="${this._filter.search}">
        </div>

        <div class="db-main">
          <div class="db-collection">
            <div class="db-section-label">KOLEKCE <span class="db-coll-count">${this._getFiltered().length}</span></div>
            <div class="db-row-list" id="db-grid">${this._renderGrid()}</div>
          </div>

          <div class="db-deck-panel">
            <div class="db-section-label">DECK</div>
            <div class="db-faction-bars" id="db-fbars">${this._renderFactionBars()}</div>
            <div class="db-deck-list" id="db-list">${this._renderDeckList()}</div>
            <div class="db-deck-actions">
              <button class="db-clear-btn" id="db-clear">VYČISTIT</button>
            </div>
          </div>
        </div>

        <div class="db-preview" id="db-preview" style="display:none"></div>
        <div class="db-toast" id="db-toast"></div>
      </div>
    `;

    this._bindAll();
  },

  // ── COLLECTION GRID ───────────────────────────────────────────────────────
  _getFiltered() {
    const f = this._filter;

    // Unikátní IDčka z hráčovy kolekce (jen karty které vlastní)
    let ids = [...new Set(this._collection.map(Number))];

    ids = ids.filter(id => {
      const c = this._cardById(id);
      if(!c) return false;
      if(f.faction !== 'all' && c.faction !== f.faction) return false;
      if(f.kind    !== 'all' && c.kind    !== f.kind)    return false;
      if(f.search  && !c.name.toLowerCase().includes(f.search.toLowerCase())) return false;
      return true;
    });

    // Sort
    const getCard = id => this._cardById(id);
    const dir = f.sortDir === 'asc' ? 1 : -1;
    switch(f.sort) {
      case 'atk':   ids.sort((a,b) => dir * ((getCard(a)?.atk||0) - (getCard(b)?.atk||0))); break;
      case 'def':   ids.sort((a,b) => dir * ((getCard(a)?.def||0) - (getCard(b)?.def||0))); break;
      case 'power': ids.sort((a,b) => dir * (((getCard(a)?.atk||0)+(getCard(a)?.def||0)) - ((getCard(b)?.atk||0)+(getCard(b)?.def||0)))); break;
      case 'name':  ids.sort((a,b) => (getCard(a)?.name||'').localeCompare(getCard(b)?.name||'')); break;
      default:      ids.sort((a,b) => a - b); break;
    }

    return ids;
  },

  _renderGrid() {
    const ids = this._getFiltered();
    if(!ids.length) return `<div class="db-empty">žádné karty</div>`;

    return ids.map(id => {
      const c      = this._cardById(id);
      if(!c) return '';
      const isFused  = this._fusionIds.has(c.id);
      const owned    = this._collection.filter(x => Number(x) === c.id).length;
      const inDeck   = this._deck.filter(x => Number(x) === c.id).length;
      // Fúzní kartu lze přidat pokud ji hráč vlastní (získal jako drop)
      const canAdd   = inDeck < this.MAX_COPIES && this._deck.length < this.MAX_DECK && owned > 0;
      const fc       = factionColor(c.faction);
      const scarData = GameState.getScarData ? GameState.getScarData(c.id) : null;
      const scarCount = scarData?.scars || 0;

      const statsStr = c.kind === 'monster'
        ? `<span class="db-row-atk">A:${c.atk}</span><span class="db-row-def">D:${c.def}</span>`
        : `<span class="db-row-kind">${kindLabel(c.kind)}</span>`;
      return `
        <div class="db-row ${canAdd ? 'db-row-addable' : 'db-row-maxed'} ${inDeck > 0 ? 'db-row-indeck' : ''}"
          data-id="${c.id}" style="--fc:${fc}">
          <span class="db-row-faction" style="color:${fc}">◈</span>
          <span class="db-row-name">${c.name}</span>
          <span class="db-row-stats">${statsStr}</span>
          ${inDeck > 0 ? `<span class="db-row-count" style="color:${fc}">${inDeck}/${owned > 1 ? owned : this.MAX_COPIES}</span>` : `<span class="db-row-count">${owned > 1 ? `×${owned}` : ''}</span>`}
          <span class="db-row-add">${canAdd ? '+' : inDeck >= this.MAX_COPIES ? '✓' : '–'}</span>
        </div>
      `;
    }).join('');
  },

  // ── DECK LIST ──────────────────────────────────────────────────────────────
  _renderDeckList() {
    if(!this._deck.length) return `<div class="db-empty db-deck-empty">— prázdný —</div>`;

    const counts = {};
    this._deck.forEach(id => { const n = Number(id); counts[n] = (counts[n]||0)+1; });

    const kindOrder = { monster:0, spell:1, trap:2, arena:3 };
    const unique = [...new Set(this._deck.map(Number))].sort((a,b) => {
      const ca = this._cardById(a), cb = this._cardById(b);
      if(!ca||!cb) return 0;
      const ko = (kindOrder[ca.kind]??9) - (kindOrder[cb.kind]??9);
      return ko !== 0 ? ko : ca.name.localeCompare(cb.name);
    });

    return unique.map(id => {
      const c  = this._cardById(id);
      if(!c) return '';
      const fc = factionColor(c.faction);
      const statsHtml = c.kind === 'monster'
        ? `<span class="db-de-atk">A:${c.atk}</span><span class="db-de-def">D:${c.def}</span>`
        : '';
      return `
        <div class="db-deck-entry" data-remove="${c.id}" style="--fc:${fc}">
          <div class="db-de-bar" style="background:${fc}"></div>
          <div class="db-de-info">
            <div class="db-de-name">${c.name}</div>
            <div class="db-de-sub" style="color:${fc}">${factionLabel(c.faction)} · ${kindLabel(c.kind)}</div>
            ${statsHtml ? `<div class="db-de-stats">${statsHtml}</div>` : ''}
          </div>
          ${counts[id]>1 ? `<div class="db-de-count" style="color:${fc}">×${counts[id]}</div>` : ''}
          <div class="db-de-remove">−</div>
        </div>
      `;
    }).join('');
  },

  // ── FACTION BARS ──────────────────────────────────────────────────────────
  _renderFactionBars() {
    if(!this._deck.length) return '';
    const stats = { synth:0, organic:0, hybrid:0, corruption:0, neutral:0 };
    this._deck.forEach(id => {
      const c = this._cardById(id);
      if(c && stats[c.faction] !== undefined) stats[c.faction]++;
    });
    const total = this._deck.length;
    const factions = [
      {key:'synth',      color:'#4fa3e0', label:'S'},
      {key:'organic',    color:'#e04f6a', label:'O'},
      {key:'hybrid',     color:'#50e0b8', label:'H'},
      {key:'corruption', color:'#b570e0', label:'C'},
      {key:'neutral',    color:'#c8d6e5', label:'N'},
    ];
    return `
      <div class="db-fbar-wrap">
        ${factions.map(f => {
          const pct = Math.round((stats[f.key]||0)/total*100);
          return pct ? `<div class="db-fbar-seg" style="width:${pct}%;background:${f.color}"></div>` : '';
        }).join('')}
      </div>
      <div class="db-faction-legend">
        ${factions.map(f => stats[f.key]
          ? `<span style="color:${f.color}">${f.label}:${stats[f.key]}</span>` : ''
        ).join('')}
      </div>
    `;
  },

  // ── PREVIEW ───────────────────────────────────────────────────────────────
  _showPreview(id) {
    const numId  = Number(id);
    const c      = this._cardById(numId);
    if(!c) return;
    this._preview = numId;
    const fc      = factionColor(c.faction);
    const isFused = this._fusionIds.has(c.id);
    const inDeck  = this._deck.filter(x => Number(x) === numId).length;
    const owned   = this._collection.filter(x => Number(x) === numId).length;
    const canAdd    = inDeck < this.MAX_COPIES && this._deck.length < this.MAX_DECK && owned > 0;
    const canRemove = inDeck > 0;
    const scarData  = GameState.getScarData ? GameState.getScarData(c.id) : null;

    const el = this._container.querySelector('#db-preview');
    if(!el) return;

    el.innerHTML =
      '<div class="dbp-preview-wrap">' +
        '<button class="dbp-close" id="dbp-close">✕</button>' +
        renderCardPreview(c, { owned, inDeck, canAdd, canRemove, isFused, scarData }) +
      '</div>';
    el.style.display = 'flex';

    const closeP = () => { el.style.display = 'none'; this._preview = null; this._refresh(); };

    el.querySelector('#dbp-close')?.addEventListener('click', closeP);
    el.addEventListener('click', e => { if(e.target === el) closeP(); });

    el.querySelector('#cpbtn-add')?.addEventListener('click', () => {
      this._addCard(c.id); this._showPreview(c.id);
    });
    el.querySelector('#cpbtn-rem')?.addEventListener('click', () => {
      this._removeCard(c.id); this._showPreview(c.id);
    });
  },

  // ── AKCE ──────────────────────────────────────────────────────────────────
  _addCard(id) {
    const numId = Number(id);
    const c = this._cardById(numId);
    if(!c) return;
    // Fúzní karta: lze přidat pouze pokud ji hráč získal jako drop
    const ownedFused = this._collection.filter(x => Number(x) === c.id).length;
    if(this._fusionIds.has(c.id) && ownedFused === 0) { this._toast('Fúzní karta — získej ji nejprve jako drop'); return; }
    if(this._deck.length >= this.MAX_DECK) { this._toast('Deck je plný!'); return; }
    const inDeck = this._deck.filter(x => Number(x) === numId).length;
    const owned  = this._collection.filter(x => Number(x) === numId).length;
    if(inDeck >= this.MAX_COPIES) { this._toast(`Max ${this.MAX_COPIES}× stejná karta v decku`); return; }
    this._deck.push(numId);
    this._refresh();
  },

  _removeCard(id) {
    const numId = Number(id);
    const idx   = this._deck.map(Number).lastIndexOf(numId);
    if(idx !== -1) { this._deck.splice(idx, 1); this._refresh(); }
  },

  _saveDeck() {
    if(this._deck.length !== this.MAX_DECK) {
      this._toast(`Deck musí mít přesně ${this.MAX_DECK} karet (máš ${this._deck.length})`);
      return;
    }
    GameState.player.deck = [...this._deck];
    EventBus.emit('deck:saved', { deck: this._deck });
    // Persist to save slot so deck changes survive reload
    try { SaveManager.save(GameState._lastSaveSlot ?? 0); } catch(e) {}
    if(this._returnTo) {
      // Návrat do boje po úpravě decku
      setTimeout(() => {
        Router._transitioning = false;
        Router.goto(this._returnTo, this._returnParams || {});
      }, 400);
      return;
    }
    this._toast('✓ Deck uložen');
    const btn = this._container.querySelector('#db-save');
    if(btn) { btn.textContent = '✓ ULOŽENO'; setTimeout(() => { if(btn) btn.textContent = 'ULOŽIT'; }, 1500); }
  },

  _refresh() {
    // Debounce - zabrání vícenásobnému překreslení
    if(this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => this._doRefresh(), 50);
  },

  _doRefresh() {
    const grid = this._container.querySelector('#db-grid');
    if(grid) grid.innerHTML = this._renderGrid();

    const list = this._container.querySelector('#db-list');
    if(list) list.innerHTML = this._renderDeckList();

    const fbars = this._container.querySelector('#db-fbars');
    if(fbars) fbars.innerHTML = this._renderFactionBars();

    const dc  = this._deck.length;
    const cnt = this._container.querySelector('.db-cnt-val');
    if(cnt) {
      cnt.textContent = dc;
      cnt.className = `db-cnt-val ${dc === this.MAX_DECK ? 'cnt-full' : dc > this.MAX_DECK ? 'cnt-over' : 'cnt-low'}`;
    }
    const warn = this._container.querySelector('.cnt-warn');
    if(warn) warn.style.display = dc === this.MAX_DECK ? 'none' : '';

    const save = this._container.querySelector('#db-save');
    if(save) save.classList.toggle('db-save-ready', dc === this.MAX_DECK);

    const collCount = this._container.querySelector('.db-coll-count');
    if(collCount) collCount.textContent = this._getFiltered().length;

    this._bindGrid();
    this._bindDeckList();
  },

  // ── BIND ──────────────────────────────────────────────────────────────────
  _bindAll() {
    const c = this._container;
    c.querySelector('#db-back')?.addEventListener('click', () => {
      if(this._deck.length !== this.MAX_DECK) {
        const ok = confirm(`Deck má ${this._deck.length}/${this.MAX_DECK} karet. Odejít bez uložení?`);
        if(!ok) return;
      }
      Router.goto('menu');
    });
    c.querySelector('#db-save')?.addEventListener('click', () => this._saveDeck());
    c.querySelector('#db-clear')?.addEventListener('click', () => { this._deck = []; this._refresh(); });

    c.querySelector('#db-search')?.addEventListener('input', e => {
      this._filter.search = e.target.value;
      this._refreshFilter();
    });

    c.querySelectorAll('.db-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ft = btn.dataset.filter, val = btn.dataset.val;
        if(ft === 'sort' && this._filter.sort === val && ['atk','def','power'].includes(val)) {
          // Toggle direction on re-click
          this._filter.sortDir = this._filter.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          if(ft === 'sort') this._filter.sortDir = val === 'name' ? 'asc' : 'desc';
          this._filter[ft] = val;
          c.querySelectorAll(`.db-filter-btn[data-filter="${ft}"]`)
            .forEach(b => b.classList.toggle('active', b.dataset.val === val));
        }
        // Update arrow label on active sort button
        if(ft === 'sort' && ['atk','def','power'].includes(val)) {
          const labels = { atk: 'ATK', def: 'DEF', power: 'PWR' };
          btn.textContent = labels[val] + (this._filter.sortDir === 'asc' ? '↑' : '↓');
        }
        this._refreshFilter();
      });
    });

    this._bindGrid();
    this._bindDeckList();
  },

  _refreshFilter() {
    const grid = this._container.querySelector('#db-grid');
    if(grid) grid.innerHTML = this._renderGrid();
    const collCount = this._container.querySelector('.db-coll-count');
    if(collCount) collCount.textContent = this._getFiltered().length;
    this._bindGrid();
  },

  _bindGrid() {
    this._container.querySelectorAll('.db-card, .db-row').forEach(el => {
      // Click = přidej do decku
      el.addEventListener('click', () => {
        if(el.classList.contains('db-card-addable') || el.classList.contains('db-row-addable')) {
          this._addCard(el.dataset.id);
        } else {
          // Pokud nelze přidat, zobraz preview
          this._showPreview(el.dataset.id);
        }
      });
      // Right-click / long-press = preview
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        this._showPreview(el.dataset.id);
      });
    });
  },

  _bindDeckList() {
    this._container.querySelectorAll('.db-deck-entry').forEach(el => {
      // Click = odeber z decku
      el.addEventListener('click', () => {
        this._removeCard(el.dataset.remove);
      });
      // Right-click = preview
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        this._showPreview(el.dataset.remove);
      });
    });
  },

  // ── HELPERS ───────────────────────────────────────────────────────────────
  _cardById(id) {
    const numId = Number(id);
    return this._allCards.find(c => c.id === numId) ||
           GameState.cards.find(c => c.id === numId) || null;
  },

  _toast(msg) {
    const el = this._container.querySelector('#db-toast');
    if(!el) return;
    el.textContent = msg;
    el.classList.add('db-toast-show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('db-toast-show'), 2000);
  },

  // ── STYLY ─────────────────────────────────────────────────────────────────
  _injectStyles() {
    if(!document.getElementById('conflux-fonts')) {
      const fl = document.createElement('link');
      fl.id = 'conflux-fonts'; fl.rel = 'stylesheet';
      fl.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Share+Tech+Mono&display=swap';
      document.head.appendChild(fl);
    }
    if(document.getElementById('deck-styles')) return;
    const style = document.createElement('style');
    style.id = 'deck-styles';
    style.textContent = `
      @keyframes blink { 50%{opacity:0} }
      .db-loading {
        height:100%; display:flex; align-items:center; justify-content:center;
        font-family:'Press Start 2P',monospace; font-size:8px; color:#3d4a5c;
        letter-spacing:3px; animation:blink 1.2s step-end infinite;
      }
      .db-wrap {
        display:flex; flex-direction:column; height:100%;
        background:#06080a; position:relative; overflow:hidden;
      }
      .db-wrap::before {
        content:''; position:absolute; inset:0;
        background:url('assets/images/backgrounds/deckbuilder_bg.png') center/cover no-repeat;
        opacity:0.1; pointer-events:none; z-index:0;
      }
      /* Header */
      .db-header {
        display:flex; align-items:center; gap:12px;
        padding:10px 16px; border-bottom:1px solid #1a1e2a; flex-shrink:0;
      }
      .db-back {
        background:none; border:none; color:#3d4a5c;
        font-family:'Press Start 2P',monospace; font-size:10px;
        cursor:pointer; padding:4px 8px; transition:color 0.15s;
      }
      .db-back:hover { color:#c8d6e5; }
      .db-title { display:flex; align-items:baseline; gap:8px; }
      .db-title-main { font-family:'Press Start 2P',monospace; font-size:12px; color:#c8d6e5; letter-spacing:3px; }
      .db-title-sub  { font-family:'Press Start 2P',monospace; font-size:6px;  color:#3d4a5c; letter-spacing:2px; }
      .db-header-right { margin-left:auto; display:flex; align-items:center; gap:12px; }
      .db-deck-counter { font-family:'Press Start 2P',monospace; font-size:8px; display:flex; align-items:baseline; gap:2px; }
      .db-cnt-val { transition:color 0.2s; }
      .cnt-full  { color:#50e0b8; }
      .cnt-low   { color:#e0a04f; }
      .cnt-over  { color:#e04f6a; }
      .cnt-warn  { color:#e04f6a; font-size:5px; }
      .db-cnt-sep, .db-cnt-max { color:#1e2535; }
      .db-save-btn {
        font-family:'Press Start 2P',monospace; font-size:8px;
        background:transparent; border:2px solid #1e2535;
        color:#1e2535; cursor:not-allowed; padding:10px 20px;
        letter-spacing:1px; transition:all 0.15s;
      }
      .db-save-btn.db-save-ready { border-color:#4fa3e0; color:#4fa3e0; cursor:pointer; }
      .db-save-btn.db-save-ready:hover { background:rgba(79,163,224,0.1); }
      /* Filters */
      .db-filters {
        display:flex; align-items:center; gap:6px; flex-wrap:wrap;
        padding:6px 16px; border-bottom:1px solid #1a1e2a; flex-shrink:0;
      }
      .db-filter-group { display:flex; gap:2px; align-items:center; }
      .db-sort-label { font-family:'Press Start 2P',monospace; font-size:5px; color:#3d4a5c; letter-spacing:1px; margin-right:4px; }
      .db-filter-btn {
        font-family:'Press Start 2P',monospace; font-size:6px;
        background:transparent; border:1px solid #1a1e2a; color:#3d4a5c;
        cursor:pointer; padding:6px 10px; transition:all 0.15s; letter-spacing:1px;
      }
      .db-filter-btn:hover { border-color:#3d4a5c; color:#c8d6e5; }
      .db-filter-btn.active { color:#c8d6e5; border-color:#2a2e3a; }
      .db-filter-btn[data-val="synth"].active      { color:#4fa3e0; }
      .db-filter-btn[data-val="organic"].active    { color:#e04f6a; }
      .db-filter-btn[data-val="hybrid"].active     { color:#50e0b8; }
      .db-filter-btn[data-val="corruption"].active { color:#b570e0; }
      .db-search {
        margin-left:auto; font-family:'Press Start 2P',monospace; font-size:6px;
        background:transparent; border:none; border-bottom:1px solid #1e2535;
        color:#c8d6e5; padding:4px 6px; outline:none; width:110px; transition:border-color 0.15s;
      }
      .db-search::placeholder { color:#1e2535; }
      .db-search:focus { border-color:#3d4a5c; }
      /* Main */
      .db-main { display:flex; flex:1; overflow:hidden; }
      /* Collection */
      .db-collection { flex:1; display:flex; flex-direction:column; padding:8px 12px; overflow:hidden; min-width:0; }
      .db-section-label { font-family:'Press Start 2P',monospace; font-size:6px; color:#3d4a5c; letter-spacing:2px; margin-bottom:8px; flex-shrink:0; }
      .db-coll-count { color:#4fa3e0; margin-left:6px; }
      .db-card-grid, .db-row-list {
        display:flex; flex-direction:column;
        gap:2px; overflow-y:auto; flex:1; padding-right:4px;
      }
      .db-row-list::-webkit-scrollbar { width:3px; }
      .db-row-list::-webkit-scrollbar-thumb { background:#1a1e2a; }
      /* Textový řádek */
      .db-row {
        display:flex; align-items:center; gap:6px;
        padding:4px 6px; cursor:pointer;
        border-left:2px solid var(--fc,#1a1e2a);
        background:#0a0d12;
        transition:background 0.1s;
        font-family:'Share Tech Mono',monospace; font-size:11px;
      }
      .db-row:hover { background:#0f1520; }
      .db-row-indeck { background:#0d1420; }
      .db-row-maxed { opacity:0.5; }
      .db-row-faction { font-size:8px; flex-shrink:0; }
      .db-row-name { flex:1; color:#ddeeff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .db-row-stats { display:flex; gap:4px; flex-shrink:0; font-size:10px; }
      .db-row-atk { color:#e8723a; }
      .db-row-def { color:#4fa3e0; }
      .db-row-kind { color:#607080; font-size:9px; }
      .db-row-count { color:var(--fc,#607080); font-size:10px; width:20px; text-align:right; flex-shrink:0; }
      .db-row-add { width:16px; text-align:center; color:#607080; flex-shrink:0; font-size:12px; }
      .db-row-addable .db-row-add { color:#4fa3e0; }
      .db-row-indeck .db-row-add { color:#50e0b8; }
      /* Card tile */
      .db-card {
        background:#0d1016; border:1px solid #1a1e2a;
        border-top:2px solid var(--fc,#1a1e2a);
        padding:6px 5px; position:relative; cursor:pointer;
        transition:transform 0.12s,box-shadow 0.12s; user-select:none;
      }
      .db-card-addable:hover {
        transform:translateY(-3px);
        box-shadow:0 6px 16px rgba(0,0,0,0.7),0 0 0 1px var(--fc);
      }
      .db-card-maxed  { opacity:0.28; cursor:default; }
      .db-card-indeck::after {
        content:''; position:absolute; inset:0;
        background:linear-gradient(160deg,rgba(79,163,224,0.06),transparent); pointer-events:none;
      }
      .db-card-faction { font-family:'Press Start 2P',monospace; font-size:4px; position:absolute; top:3px; left:4px; }
      .db-card-emoji   { font-size:20px; display:block; text-align:center; margin:8px 0 3px; }
      .db-card-name    { font-family:'Press Start 2P',monospace; font-size:4px; color:#c8d6e5; text-align:center; line-height:1.5; margin-bottom:3px; }
      .db-card-stats   { display:flex; justify-content:center; gap:5px; }
      .db-atk { font-family:'Press Start 2P',monospace; font-size:4px; color:#e8723a; }
      .db-def { font-family:'Press Start 2P',monospace; font-size:4px; color:#4fa3e0; }
      .db-card-kind    { font-family:'Press Start 2P',monospace; font-size:4px; color:#3d4a5c; text-align:center; }
      .db-card-indeck-badge { position:absolute; top:2px; right:3px; font-family:'Press Start 2P',monospace; font-size:5px; }
      .db-card-owned   { position:absolute; bottom:2px; right:3px; font-family:'Press Start 2P',monospace; font-size:4px; color:#1e2535; }
      .db-card-scar    { position:absolute; bottom:2px; left:3px; font-family:'Press Start 2P',monospace; font-size:4px; color:#b570e0; }
      .db-fusion-badge { position:absolute; top:2px; right:3px; font-size:7px; color:#50e0b8; }
      /* Rarity dots */
      .db-card-rarity { position:absolute; top:3px; right:3px; font-family:'Press Start 2P',monospace; font-size:4px; }
      .db-rarity--common   { color:#3d4a5c; }
      .db-rarity--uncommon { color:#4fa3e0; }
      .db-rarity--rare     { color:#50e0b8; }
      .db-rarity--unique   { color:#c8a84b; }
      .db-empty { font-family:'Press Start 2P',monospace; font-size:7px; color:#1e2535; padding:20px; text-align:center; grid-column:1/-1; }
      /* Deck panel */
      .db-deck-panel {
        width:228px; flex-shrink:0; display:flex; flex-direction:column;
        border-left:1px solid #1a1e2a; padding:8px 10px; overflow:hidden;
      }
      .db-faction-bars { margin-bottom:8px; flex-shrink:0; min-height:20px; }
      .db-fbar-wrap  { display:flex; height:2px; overflow:hidden; margin-bottom:4px; gap:1px; }
      .db-fbar-seg   { height:100%; transition:width 0.3s ease; }
      .db-faction-legend { display:flex; gap:8px; font-family:'Press Start 2P',monospace; font-size:5px; flex-wrap:wrap; }
      .db-deck-list { flex:1; overflow-y:auto; }
      .db-deck-list::-webkit-scrollbar { width:3px; }
      .db-deck-list::-webkit-scrollbar-thumb { background:#1a1e2a; }
      .db-deck-empty { padding:16px 0; }
      .db-deck-entry {
        display:flex; align-items:center; gap:6px;
        padding:5px 4px; cursor:pointer; transition:background 0.1s;
        border-bottom:1px solid #0f1218;
      }
      .db-deck-entry:hover { background:rgba(255,255,255,0.03); }
      .db-deck-entry:hover .db-de-remove { opacity:1; }
      .db-de-bar    { width:2px; height:26px; flex-shrink:0; opacity:0.7; }
      .db-de-emoji  { font-size:13px; flex-shrink:0; }
      .db-de-info   { flex:1; min-width:0; }
      .db-de-name   { font-family:'Press Start 2P',monospace; font-size:4.5px; color:#c8d6e5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .db-de-sub    { font-family:'Press Start 2P',monospace; font-size:4px; margin-top:2px; }
      .db-de-count  { font-family:'Press Start 2P',monospace; font-size:7px; flex-shrink:0; }
      .db-de-stats { display:flex; gap:5px; margin-top:2px; }
      .db-de-atk { font-family:'Share Tech Mono',monospace; font-size:9px; color:#e8723a; }
      .db-de-def { font-family:'Share Tech Mono',monospace; font-size:9px; color:#4fa3e0; }
      .db-de-remove { font-family:'Press Start 2P',monospace; font-size:10px; color:#3d4a5c; opacity:0; transition:opacity 0.1s,color 0.1s; flex-shrink:0; padding:0 2px; cursor:pointer; }
      .db-de-remove:hover { color:#e8723a; }
      .db-deck-actions { flex-shrink:0; padding-top:8px; border-top:1px solid #1a1e2a; }
      .db-clear-btn { font-family:'Press Start 2P',monospace; font-size:6px; background:transparent; border:none; color:#1e2535; cursor:pointer; letter-spacing:1px; padding:4px 0; transition:color 0.15s; }
      .db-clear-btn:hover { color:#3d4a5c; }
      /* Preview overlay — 2:3 karta + sidebar s akcemi */
      .db-preview {
        position:absolute; inset:0; background:rgba(4,6,8,0.95);
        display:flex; align-items:center; justify-content:center;
        z-index:40; animation:dbp-in 0.15s ease;
      }
      @keyframes dbp-in { from{opacity:0} to{opacity:1} }
      /* dbp preview wrapper */
      .dbp-preview-wrap { display:flex; flex-direction:column; align-items:center; gap:8px; background:#0a0f18; border:1px solid #1a2535; padding:16px; }
      .dbp-close { align-self:flex-end; font-family:var(--mono); font-size:12px; color:#3d4a5c; cursor:pointer; background:none; border:none; margin-bottom:-4px; }
      .dbp-close:hover { color:#c8d6e5; }
      .dbp-add-btn {
        font-family:'Press Start 2P',monospace; font-size:7px;
        background:transparent; border:2px solid #50e0b8; color:#50e0b8;
        cursor:pointer; padding:10px 8px; transition:all 0.15s; letter-spacing:1px; width:100%;
      }
      .dbp-add-btn:hover { background:rgba(80,224,184,0.12); }
      .dbp-rem-btn {
        font-family:'Press Start 2P',monospace; font-size:7px;
        background:transparent; border:2px solid #e8723a; color:#e8723a;
        cursor:pointer; padding:10px 8px; transition:all 0.15s; letter-spacing:1px; width:100%;
      }
      .dbp-rem-btn:hover { background:rgba(232,114,58,0.12); }
      .dbp-btn-disabled { opacity:0.2; cursor:not-allowed !important; pointer-events:none; }
      .dbp-fusion-note { font-family:'Press Start 2P',monospace; font-size:6px; color:#50e0b8; }
      .dbp-scar-evo    { font-family:'Press Start 2P',monospace; font-size:6px; color:#b570e0; }
      /* Toast */
      .db-toast {
        position:absolute; bottom:20px; left:50%; transform:translateX(-50%);
        font-family:'Press Start 2P',monospace; font-size:7px;
        background:#0d1016; border:1px solid #3d4a5c; color:#c8d6e5;
        padding:8px 16px; opacity:0; pointer-events:none; transition:opacity 0.2s;
        z-index:100; white-space:nowrap;
      }
      .db-toast.db-toast-show { opacity:1; }
    `;
    document.head.appendChild(style);
  },

  destroy() {
    clearTimeout(this._toastTimer);
    AudioSystem.stopMusic(600);
  }
};

export default DeckBuilder;
