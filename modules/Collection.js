import Router      from '../engine/Router.js';
import GameState   from '../engine/GameState.js';
import AudioSystem from './AudioSystem.js';
import { renderCardEl, renderCardPreview, injectCardStyles } from './CardRenderer.js';

const PAGE = 60;

const Collection = {
  _container:    null,
  _filter:       { faction: 'all', kind: 'all', search: '' },
  _allCards:     [],
  _collection:   [],
  _fusionIds:    new Set(),
  _filteredCards: [],
  _renderedUntil: 0,

  async init(container) {
    this._container = container;
    this._filter = { faction: 'all', kind: 'all', search: '' };

    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#060a0f"><div style="color:#3d4a5c;font-family:monospace;font-size:11px;letter-spacing:3px">NAČÍTÁM...</div></div>';

    await GameState.loadCards();
    this._injectOwnStyles();
    injectCardStyles();
    AudioSystem.playForScreen('collection', { fade: 1500 });

    this._fusionIds = new Set(Object.values(GameState.fusionIndex || {}));
    this._allCards  = GameState.cards.filter(c => !c.special && c.kind !== 'letter');
    this._collection = [...(GameState.player.collection || [])];

    if(!this._collection.length) {
      const starter = GameState.buildStarterDeck?.() || [];
      this._collection = [...starter, ...new Set(starter)];
    }

    this._render();
  },

  destroy() { AudioSystem.stopMusic(600); },

  _render() {
    const totalOwned = new Set(this._collection.map(Number)).size;
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

  _getFilteredCards() {
    const search = this._filter.search.toLowerCase();
    const ownedSet = new Set(this._collection.map(Number));
    return this._allCards
      .slice()
      .sort((a, b) => a.id - b.id)
      .filter(c => {
        if(this._filter.faction !== 'all' && c.faction !== this._filter.faction) return false;
        if(this._filter.kind    !== 'all' && c.kind    !== this._filter.kind)    return false;
        if(search && !c.name.toLowerCase().includes(search)) return false;
        return true;
      });
  },

  _renderCardHtml(c, ownedSet) {
    const owned   = ownedSet.has(c.id);
    const inDeck  = owned ? (GameState.player.deck||[]).filter(x => Number(x) === c.id).length : 0;
    const isFused = this._fusionIds.has(c.id);
    if(owned) {
      return `<div class="col-card-wrap owned" data-id="${c.id}">
        ${renderCardEl(c, 'sm', { inDeck: inDeck || null, inFuse: isFused })}
      </div>`;
    }
    return `<div class="col-card-wrap unowned" data-id="${c.id}">
      ${renderCardEl(c, 'sm', { faceDown: true })}
    </div>`;
  },

  _renderGrid() {
    this._filteredCards = this._getFilteredCards();
    this._renderedUntil = 0;
    if(!this._filteredCards.length) return '<div class="col-empty">Žádné karty</div>';
    return this._buildCardHtml(0, Math.min(PAGE, this._filteredCards.length));
  },

  _buildCardHtml(from, to) {
    const cards    = this._filteredCards;
    const ownedSet = new Set(this._collection.map(Number));
    const CHUNK    = 10;
    let html = '';
    let lastLabel = -1;

    for(let i = from; i < to; i++) {
      const c = cards[i];
      const groupStart = Math.floor(i / CHUNK) * CHUNK;
      if(groupStart !== lastLabel) {
        const chunkEnd = Math.min(groupStart + CHUNK - 1, cards.length - 1);
        html += `<div class="col-range-label">${i === 0 ? '' : ''}#${cards[groupStart].id} — #${cards[chunkEnd].id}</div>`;
        lastLabel = groupStart;
      }
      html += this._renderCardHtml(c, ownedSet);
    }
    this._renderedUntil = to;
    return html;
  },

  _appendMore() {
    const grid = this._container?.querySelector('#col-grid');
    if(!grid) return;
    const from = this._renderedUntil;
    const to   = Math.min(from + PAGE, this._filteredCards.length);
    if(from >= this._filteredCards.length) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = this._buildCardHtml(from, to);
    while(tmp.firstChild) grid.appendChild(tmp.firstChild);
    this._bindGrid();
  },

  _showPreview(id) {
    const numId = Number(id);
    if(!numId) return;
    const c = this._cardById(numId);
    if(!c) return;
    const ownedCount = this._collection.filter(x => Number(x) === numId).length;
    if(!ownedCount) return; // unowned cards have no detail preview
    const inDeck  = (GameState.player.deck||[]).filter(x => Number(x) === numId).length;
    const isFused = this._fusionIds.has(c.id);
    const scarData = GameState.getScarData?.(c.id) || null;
    const el = this._container.querySelector('#col-preview');
    if(!el) return;
    el.innerHTML = `
      <div class="col-preview-inner">
        <button class="col-preview-close" id="colp-close">✕</button>
        ${renderCardPreview(c, { owned: ownedCount, inDeck, isFused, scarData, readOnly: true })}
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
    this._container.querySelectorAll('.col-card-wrap.owned').forEach(el => {
      el.addEventListener('click', () => this._showPreview(el.dataset.id));
    });
    const grid = this._container.querySelector('#col-grid');
    if(grid && !grid._scrollBound) {
      grid._scrollBound = true;
      grid.addEventListener('scroll', () => {
        if(grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 200) {
          this._appendMore();
        }
      }, { passive: true });
    }
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
      .col-title-main{font-family:var(--px);font-size:11px;color:#c8d6e5}
      .col-title-sub{font-family:var(--mono);font-size:11px;color:#4a6070;margin-left:12px}
      .col-filters{display:flex;flex-direction:column;gap:6px;padding:8px 16px;border-bottom:1px solid #0d1520;flex-shrink:0;position:relative;z-index:1}
      .col-filter-group{display:flex;gap:6px;flex-wrap:wrap}
      .col-fbtn{background:rgba(10,15,24,0.85);border:1px solid #1a2535;color:#607080;font-family:var(--mono);font-size:11px;padding:4px 10px;cursor:pointer}
      .col-fbtn:hover{border-color:#4fa3e0;color:#c8d6e5}
      .col-fbtn.active{border-color:#4fa3e0;color:#4fa3e0;background:#0d1a2a}
      .col-search{background:#0a0f18;border:1px solid #1a2535;color:#c8d6e5;font-family:var(--mono);font-size:12px;padding:4px 10px;outline:none}
      .col-search:focus{border-color:#4fa3e0}
      /* Card grid — centered */
      .col-grid{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,88px);gap:8px;padding:12px 32px;justify-content:center;align-content:flex-start;position:relative;z-index:1}
      .col-grid::-webkit-scrollbar{width:4px}
      .col-grid::-webkit-scrollbar-thumb{background:#1a2535}
      .col-range-label{
        grid-column:1/-1;
        font-family:var(--mono);font-size:11px;
        color:#607080;letter-spacing:3px;
        padding:10px 0 4px;margin-top:4px;
        border-top:1px solid #0d1520;
      }
      .col-range-label:first-child{border-top:none;margin-top:0;padding-top:4px}
      .col-card-wrap{cursor:pointer;transition:transform 0.1s,filter 0.1s;user-select:none}
      .col-card-wrap.owned:hover{transform:translateY(-3px)}
      .col-card-wrap.owned:hover .cx-card{box-shadow:0 6px 20px rgba(0,0,0,0.7),0 0 0 1px var(--fc,#4fa3e0)}
      .col-card-wrap.unowned{cursor:default;filter:brightness(0.5) saturate(0.3)}
      .col-card-wrap .cx-sm{width:100%;height:auto;aspect-ratio:2/3}
      .col-card-wrap .cx-back-img{width:100%;height:100%;object-fit:cover;border-radius:4px}
      .col-empty{color:#4a6070;font-family:var(--mono);font-size:12px;padding:24px;grid-column:1/-1;text-align:center}
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
