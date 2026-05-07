import Router    from '../engine/Router.js';
import GameState from '../engine/GameState.js';
import { renderCardEl, renderCardPreview, injectCardStyles } from './CardRenderer.js';

const Collection = {
  _container:  null,
  _filter:     { faction: 'all', kind: 'all', search: '' },
  _allCards:   [],
  _collection: [],
  _fusionIds:  new Set(),

  async init(container) {
    this._container = container;
    this._filter = { faction: 'all', kind: 'all', search: '' };

    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#060a0f"><div style="color:#3d4a5c;font-family:monospace;font-size:11px;letter-spacing:3px">NAČÍTÁM...</div></div>';

    await GameState.loadCards();
    injectCardStyles();
    this._injectOwnStyles();

    this._fusionIds = new Set(Object.values(GameState.fusionIndex || {}));
    this._allCards  = GameState.cards.filter(c => !c.special && c.kind !== 'letter');
    this._collection = [...(GameState.player.collection || [])];

    if(!this._collection.length) {
      const starter = GameState.buildStarterDeck?.() || [];
      this._collection = [...starter, ...new Set(starter)];
    }

    this._render();
  },

  destroy() {},

  _render() {
    const ownedUniq  = [...new Set(this._collection.map(Number))];
    const totalOwned = ownedUniq.length;
    const totalCards = this._allCards.length;

    this._container.innerHTML = `
      <div class="col-wrap fade-in">
        <div class="col-header">
          <button class="col-back" id="col-back">←</button>
          <div class="col-title">
            <span class="col-title-main">KOLEKCE</span>
            <span class="col-title-sub">${totalOwned} / ${totalCards}</span>
          </div>
        </div>
        <div class="col-filters">
          <div class="col-filter-group">
            ${['all','synth','organic','hybrid','corruption'].map(v =>
              `<button class="col-fbtn ${this._filter.faction===v?'active':''}" data-f="faction" data-v="${v}">${v==='all'?'VŠE':v.toUpperCase()}</button>`
            ).join('')}
          </div>
          <div class="col-filter-group">
            ${['all','monster','spell','trap','arena'].map(v =>
              `<button class="col-fbtn ${this._filter.kind===v?'active':''}" data-f="kind" data-v="${v}">${{all:'VŠE',monster:'MONSTER',spell:'KOUZLO',trap:'PAST',arena:'ARÉNA'}[v]}</button>`
            ).join('')}
          </div>
          <input class="col-search" id="col-search" type="text" placeholder="hledat..." value="${this._filter.search}">
        </div>
        <div class="col-grid" id="col-grid">${this._renderGrid()}</div>
        <div class="col-preview" id="col-preview" style="display:none"></div>
      </div>`;

    this._bind();
  },

  _getFilteredIds() {
    const search = this._filter.search.toLowerCase();
    return [...new Set(this._collection.map(Number))]
      .sort((a, b) => a - b)
      .filter(id => {
        const c = this._cardById(id);
        if(!c) return false;
        if(this._filter.faction !== 'all' && c.faction !== this._filter.faction) return false;
        if(this._filter.kind    !== 'all' && c.kind    !== this._filter.kind)    return false;
        if(search && !c.name.toLowerCase().includes(search)) return false;
        return true;
      });
  },

  _renderGrid() {
    const ids = this._getFilteredIds();
    if(!ids.length) return '<div class="col-empty">Žádné karty</div>';
    return ids.map(id => {
      const c      = this._cardById(id);
      if(!c) return '';
      const owned   = this._collection.filter(x => Number(x) === id).length;
      const inDeck  = (GameState.player.deck||[]).filter(x => Number(x) === id).length;
      const isFused = this._fusionIds.has(c.id);
      return `<div class="col-card-wrap" data-id="${c.id}">${renderCardEl(c,'md',{inFuse:isFused,owned:owned>1?owned:null,inDeck:inDeck||null})}</div>`;
    }).join('');
  },

  _showPreview(id) {
    const numId = Number(id);
    if(!numId) return;
    const c = this._cardById(numId);
    if(!c) return;
    const owned   = this._collection.filter(x => Number(x) === numId).length;
    const inDeck  = (GameState.player.deck||[]).filter(x => Number(x) === numId).length;
    const isFused = this._fusionIds.has(c.id);
    const scarData = GameState.getScarData?.(c.id) || null;
    const el = this._container.querySelector('#col-preview');
    if(!el) return;
    el.innerHTML = `
      <div class="col-preview-inner">
        <button class="col-preview-close" id="colp-close">✕</button>
        ${renderCardPreview(c, { owned, inDeck, isFused, scarData, readOnly: true })}
      </div>`;
    el.style.display = 'flex';
    const close = () => { el.style.display = 'none'; };
    el.querySelector('#colp-close')?.addEventListener('click', close);
    el.addEventListener('click', e => { if(e.target === el) close(); });
  },

  _bind() {
    const c = this._container;
    c.querySelector('#col-back')?.addEventListener('click', () => Router.goto('menu'));
    c.querySelector('#col-search')?.addEventListener('input', e => {
      this._filter.search = e.target.value;
      this._refreshGrid();
    });
    c.querySelectorAll('.col-fbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.f, val = btn.dataset.v;
        this._filter[field] = val;
        c.querySelectorAll(`.col-fbtn[data-f="${field}"]`).forEach(b => b.classList.toggle('active', b.dataset.v === val));
        this._refreshGrid();
      });
    });
    this._bindGrid();
  },

  _bindGrid() {
    this._container.querySelectorAll('.col-card-wrap').forEach(wrap => {
      wrap.addEventListener('click', () => this._showPreview(wrap.dataset.id));
    });
  },

  _refreshGrid() {
    const grid = this._container.querySelector('#col-grid');
    if(grid) { grid.innerHTML = this._renderGrid(); this._bindGrid(); }
  },

  _cardById(id) {
    const numId = Number(id);
    return this._allCards.find(c => c.id === numId) || GameState.cards.find(c => c.id === numId) || null;
  },

  _injectOwnStyles() {
    if(document.getElementById('collection-styles')) return;
    const style = document.createElement('style');
    style.id = 'collection-styles';
    style.textContent = `
      .col-wrap{display:flex;flex-direction:column;height:100vh;background:#060a0f;color:#c8d6e5;overflow:hidden;position:relative}
      .col-wrap::before{content:'';position:absolute;inset:0;background:url('assets/images/backgrounds/collection_bg.png') center/cover no-repeat;opacity:0.12;pointer-events:none;z-index:0}
      .col-header{display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid #0d1520;flex-shrink:0;position:relative;z-index:1}
      .col-back{background:none;border:none;color:#607080;font-size:18px;cursor:pointer;padding:4px 8px}
      .col-back:hover{color:#c8d6e5}
      .col-title-main{font-family:'Press Start 2P',monospace;font-size:11px;color:#c8d6e5}
      .col-title-sub{font-family:monospace;font-size:10px;color:#3d4a5c;margin-left:12px}
      .col-filters{display:flex;flex-direction:column;gap:6px;padding:8px 16px;border-bottom:1px solid #0d1520;flex-shrink:0;position:relative;z-index:1}
      .col-filter-group{display:flex;gap:6px;flex-wrap:wrap}
      .col-fbtn{background:rgba(10,15,24,0.85);border:1px solid #1a2535;color:#607080;font-family:monospace;font-size:10px;padding:4px 10px;cursor:pointer}
      .col-fbtn:hover{border-color:#4fa3e0;color:#c8d6e5}
      .col-fbtn.active{border-color:#4fa3e0;color:#4fa3e0;background:#0d1a2a}
      .col-search{background:#0a0f18;border:1px solid #1a2535;color:#c8d6e5;font-family:monospace;font-size:11px;padding:4px 10px;outline:none}
      .col-search:focus{border-color:#4fa3e0}
      .col-grid{flex:1;overflow-y:auto;display:flex;flex-wrap:wrap;gap:10px;padding:14px 16px;align-content:flex-start;position:relative;z-index:1}
      .col-empty{color:#3d4a5c;font-family:monospace;font-size:11px;padding:24px;width:100%;text-align:center}
      .col-card-wrap{cursor:pointer}
      .col-card-wrap:hover .conflux-card{border-color:var(--fc,#4fa3e0)}
      .col-preview{position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:200;display:flex;align-items:center;justify-content:center}
      .col-preview-inner{position:relative;background:#0a0f18;border:1px solid #1a2535;padding:24px}
      .col-preview-close{position:absolute;top:8px;right:10px;background:none;border:none;color:#607080;font-size:14px;cursor:pointer}
      .col-preview-close:hover{color:#e04f6a}
      .fade-in{animation:fadeIn 0.2s ease}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    `;
    document.head.appendChild(style);
  },
};

export default Collection;
