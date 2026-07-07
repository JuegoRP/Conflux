// ─── CONFLUX BattleSystem v2039 ──────────────────────────────────────────────
// v2039: Event delegation (bind once, not per render), GameState Map index,
//        arena spells not counted in grading, CSS cleanup.
import Router     from '../engine/Router.js';
import { ENEMIES_DATA } from '../data/enemies.js';
import EventBus    from '../engine/EventBus.js';
import GameState   from '../engine/GameState.js';
import AudioSystem from './AudioSystem.js';
import AssetLoader from '../engine/AssetLoader.js';
import SaveManager from '../engine/SaveManager.js';
import { renderCardEl as _rcEl, injectCardStyles, showCardZoom } from './CardRenderer.js';


// ─── HELPERS ──────────────────────────────────────────────────────────────────
const shuffle = a => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b; };
const clamp   = (v,min,max) => Math.max(min, Math.min(max, v));
const factionColor = f => ({synth:"#4fa3e0", organic:"#e04f6a", hybrid:"#50e0b8", corruption:"#9b59b6"}[f] || "#c8d6e5");
const kindLabel = k => ({monster:'MONSTER', spell:'SKILL', trap:'PAST', arena:'ARÉNA'}[k]||k.toUpperCase());
const factionLabel = f => ({synth:"⬡ SYNTH", organic:"☘ ORGANIC", hybrid:"✦ HYBRID", corruption:"◈ CORRUPTION"}[f] || f);

// rarityFor — používá rarity z cards.json, fallback na výpočet ze síly
const rarityFor = card => {
  const rarityMap = {
    common:   {label:"COMMON",    color:"#c8d6e5"},
    uncommon: {label:"UNCOMMON",  color:"#4fa3e0"},
    rare:     {label:"RARE",      color:"#50e0b8"},
    unique:   {label:"UNIQUE",    color:"#ffd700"},
  };
  if(card.rarity && rarityMap[card.rarity]) return rarityMap[card.rarity];
  if(card.special) return {label:"SPECIAL", color:"#ffd700"};
  if(card.corruptionValue >= 4) return {label:"UNIQUE",    color:"#ff4444"};
  if(card.corruptionValue >= 3) return {label:"RARE",      color:"#9b59b6"};
  const power = (card.atk||0) + (card.def||0);
  if(power >= 4400) return {label:"UNIQUE",    color:"#ffd700"};
  if(power >= 3600) return {label:"RARE",      color:"#9b59b6"};
  if(power >= 2800) return {label:"UNCOMMON",  color:"#50e0b8"};
  if(power >= 2000) return {label:"COMMON",    color:"#4fa3e0"};
  return               {label:"COMMON",     color:"#c8d6e5"};
};

// findFusion — hledá fixní fúze z cards.json fusionIndex
// Fúze existuje JEN pokud je definovaná v datech (unikátní karta s vlastním ID)
function findFusion(ids) {
  if(!ids || ids.length < 2) return null;
  for(let i = 0; i < ids.length; i++) {
    for(let j = i+1; j < ids.length; j++) {
      const r = GameState.getFusionResult ? GameState.getFusionResult(ids[i], ids[j]) : null;
      if(r) return r;
    }
  }
  return null;
}

// getCard — hledá v GameState.cards (cards.json)
function getCard(id) {
  if(id === null || id === undefined) return null;
  const numId = typeof id === 'string' ? parseInt(id) : id;
  return GameState.getCard(numId) || null;
}

// allCards — bezpečné pole všech karet z cards.json
function allCards() {
  return (GameState.cards || []).filter(Boolean);
}


function getCorruptionLevel() {
  const c = GameState.corruption;
  if(typeof c === 'number') return c;
  if(c && typeof c === 'object') return c.level || 0;
  return 0;
}

// ─── BATTLE SYSTEM ─────────────────────────────────────────────────────
const BattleSystem = {

  _container: null,
  _params: null,
  _enemy: null,
  _unsubs: [],
  _state: null,
  _handVisible: true,  // overlay ruka viditelná?

  // Arena faction → battle background (vyšší opacity než default)
  _arenaBgMap: {
    synth:      'act1_synth.jpg',
    organic:    'act1_organic.jpg',
    hybrid:     'act3_nexus.jpg',
    corruption: 'act9_zrcadlo.jpg',
    neutral:    'act6_ruiny.jpg',
  },

  // ── INIT ──────────────────────────────────────────────────────────────────
  async init(container, params = {}) {
    console.log('[BattleSystem] init() zavolán, enemyId:', params.enemyId, 'tutorial:', params.tutorial);
    this._container = container;
    this._params    = params;
    this._handVisible = true;

    // Reset tutorial flags
    this['_tut_battle_start'] = false;
    this['_tut_first_monster_played'] = false;
    this['_tut_first_enemy_turn'] = false;
    this['_tut_first_attack_phase'] = false;
    this['_tut_first_attack_done'] = false;
    this['_tut_tutorial_end'] = false;
    // Reset in-battle lore (barks)
    this._barkTurns = 0;
    this._barkState = { fired:{}, idx:{} };
    this._profileBarkFired = false;
    // "TVOJE KARTA": karty z tvého decku (mirror-flag se dopočítá po načtení nepřítele)
    this._yourCardIds = new Set((GameState.player.deck || []).map(Number));
    this._mirrorEnemy = false;

    container.innerHTML = `<div class="b-loading" style="display:flex;align-items:center;justify-content:center;height:100vh"><img src="assets/images/emblem_sm.png" alt="" style="width:76px;height:76px;opacity:0.75;animation:b-emblem-rot 4s linear infinite"></div><style>@keyframes b-emblem-rot{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>`;
    injectCardStyles();
    this._injectStyles();
    AudioSystem.playBattleMusic(!!params.freeBattle);

    // Zaručit že cards.json je načtené — pokud ne (např. přímý přechod do bitvy), načti nyní
    if(GameState.cards.length === 0) {
      await GameState.loadCards();
    }

    let enemy = null;
    if(params.selfBattle) {
      enemy = {
        name: 'Pozorovatel — druhá strana', faction:'hybrid',
        lp: GameState.player.lp || 10000,
        deck: [...(GameState.player.collection || [])],
        desc: 'Naučil se od tebe věci které ty sám nevíš. Teď přichází vrátit to co se naučil — přímo do obličeje.',
      };
    } else {
      // Načti nepřítele z enemies.json (přes GameState._enemies cache)
      enemy = await this._loadEnemy(params.enemyId);
      if(!enemy) enemy = this._defaultEnemy();
    }
    this._enemy = enemy;
    this._mirrorEnemy = !!(enemy?.profiler || enemy?.aiStyle === 'mirror');

    // Mark enemy as encountered (for Free Battle name reveal)
    if(params.enemyId && params.enemyId !== '__self__') {
      GameState.setFlag?.(`encountered_${params.enemyId}`);
    }

    try {
      this._initState();
    } catch(err) {
      console.error('[BattleSystem] _initState selhalo:', err);
      container.innerHTML = `<div style="color:#e04f6a;font-family:monospace;padding:40px;font-size:13px;">
        <div style="font-size:18px;margin-bottom:16px">Chyba inicializace boje</div>
        <pre>${err.message}</pre>
        <button onclick="Router.goto('menu')" style="margin-top:20px;padding:8px 16px;cursor:pointer">← Zpět do menu</button>
      </div>`;
      return;
    }

    // Vykresli pole, pak (u profilujícího nepřítele profil-screen →) coinflip
    this._render();
    this._bindEvents();
    const beginBattle = () => this._showCoinflip(container, () => {
      if(!this._isTutorial()) setTimeout(() => this._maybeBark('start'), 600);
      this._checkTutorial('battle_start', () => {
        this._startTurn();
      });
    });
    if(this._enemy?.profiler && !this._isTutorial()) this._showProfileReadout(beginBattle);
    else beginBattle();
  },

  _defaultEnemy() {
    return { id:"default_enemy", name:"Entita Systému", faction:"synth", lp:10000, deck:[] };
  },

  // ── COINFLIP OVERLAY ────────────────────────────────────────────────────────
  _showCoinflip(container, onDone) {
    const who = this._state.coinflipResult;
    const resultText = who === 'player' ? 'Začínáš ty.' : 'Začíná protivník.';

    const style = document.createElement('style');
    style.id = 'cf-style';
    style.textContent = `
      .cf-transition {
        position: fixed; inset: 0; z-index: 200;
        background: #05080c;
        display: flex; flex-direction: column; gap: 26px;
        align-items: center; justify-content: center;
        opacity: 1; transition: opacity 0.5s ease;
      }
      @keyframes cf-emblem-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
      .cf-transition-emblem {
        width: clamp(84px, 12vw, 130px); height: auto;
        filter: drop-shadow(0 0 22px rgba(79,163,224,0.28));
        animation: cf-emblem-spin 18s linear infinite;
      }
      .cf-transition-text {
        font-family: 'Press Start 2P', monospace;
        font-size: clamp(12px, 2vw, 20px); letter-spacing: 4px;
        color: rgba(200,215,230,0.7);
        text-shadow: 3px 3px 0 rgba(79,163,224,0.15), -1px -1px 0 rgba(0,0,0,0.8);
      }
      .cf-overlay {
        position: fixed; inset: 0; z-index: 190;
        background: rgba(4,6,8,0.85);
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
        opacity: 0; transition: opacity 0.5s ease;
      }
      @keyframes cf-fadeout { from{opacity:1} to{opacity:0} }
      @keyframes cf-spin {
        0%   { transform: rotate(0deg);    filter: drop-shadow(0 0 12px rgba(79,163,224,0.5)); }
        30%  { filter: drop-shadow(0 0 28px rgba(79,163,224,0.95)); }
        70%  { filter: drop-shadow(0 0 32px rgba(80,224,184,0.85)); }
        100% { transform: rotate(1080deg); filter: drop-shadow(0 0 18px rgba(80,224,184,0.65)); }
      }
      .cf-inner {
        display: flex; flex-direction: column;
        align-items: center; gap: 28px;
      }
      .cf-logo-wrap {
        cursor: pointer; position: relative;
        display: flex; align-items: center; justify-content: center;
      }
      /* Čistý kruhový glow za mincí (efekt kolem, ale čistě) */
      .cf-logo-wrap::before {
        content: ''; position: absolute; left: 50%; top: 50%;
        width: 280px; height: 280px; transform: translate(-50%,-50%);
        border-radius: 50%;
        background: radial-gradient(circle, rgba(79,163,224,0.22) 0%, rgba(80,224,184,0.10) 42%, rgba(0,0,0,0) 68%);
        pointer-events: none;
        animation: cf-glow-pulse 3.5s ease-in-out infinite;
      }
      @keyframes cf-glow-pulse { 0%,100%{opacity:0.65;transform:translate(-50%,-50%) scale(0.98)} 50%{opacity:1;transform:translate(-50%,-50%) scale(1.05)} }
      .cf-logo {
        width: 210px; height: 210px;
        object-fit: contain;
        border-radius: 50%;
        filter: drop-shadow(0 3px 14px rgba(0,0,0,0.55));
        transition: filter 0.3s ease, transform 0.3s ease;
        display: block; position: relative;
      }
      .cf-logo-wrap:hover .cf-logo {
        filter: drop-shadow(0 0 20px rgba(79,163,224,0.6));
        transform: scale(1.03);
      }
      .cf-logo.spinning {
        animation: cf-spin 0.75s cubic-bezier(0.2, 0.05, 0.3, 1) forwards;
        cursor: default;
      }
      .cf-hint {
        font-family: 'Share Tech Mono', monospace;
        font-size: 10px; color: rgba(96,128,160,0.55);
        letter-spacing: 3px; transition: opacity 0.3s;
      }
      .cf-result {
        font-family: 'Share Tech Mono', monospace;
        font-size: 14px; letter-spacing: 2px;
        color: rgba(200,215,230,0.95);
        opacity: 0; min-height: 1.4em; text-align: center;
        transition: opacity 0.4s ease;
      }
    `;
    const existing = document.getElementById('cf-style');
    if(existing) existing.remove();
    document.head.appendChild(style);

    // Coinflip = EMBLÉM jako mince, na kterou klikneš. Žádná "Cyklus pokračuje" obrazovka.
    const overlay = document.createElement('div');
    overlay.className = 'cf-overlay';
    overlay.innerHTML = `
      <div class="cf-inner">
        <div class="cf-logo-wrap" id="cf-logo-wrap">
          <img class="cf-logo" id="cf-logo" src="assets/images/emblem.png" alt="">
        </div>
        <div class="cf-hint" id="cf-hint">klikni na minci — kdo začíná</div>
        <div class="cf-result" id="cf-result"></div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    const logoWrap = overlay.querySelector('#cf-logo-wrap');
    const logo     = overlay.querySelector('#cf-logo');
    const hint     = overlay.querySelector('#cf-hint');
    const result   = overlay.querySelector('#cf-result');
    let spun       = false;

    logoWrap.addEventListener('click', () => {
      if(spun) return;
      spun = true;
      hint.style.opacity = '0';
      logo.classList.add('spinning');

      setTimeout(() => {
        result.textContent = resultText;
        result.style.opacity = '1';
        setTimeout(() => {
          overlay.style.animation = 'cf-fadeout 0.5s ease forwards';
          setTimeout(() => { overlay.remove(); if(onDone) onDone(); }, 500);
        }, 1400);
      }, 750);
    });
  },

  // Cache pro enemies.json — načteme jednou, uchováme
  _enemiesCache: null,

  async _loadEnemy(enemyId) {
    if(!enemyId) return null;
    // Načti z inline dat — funguje bez serveru i přes file://
    if(!this._enemiesCache) {
      this._enemiesCache = (ENEMIES_DATA?.enemies) || [];
      console.log('[BattleSystem] Nepřátelé načteni inline:', this._enemiesCache.length);
    }
    const found = this._enemiesCache.find(e => e.id === enemyId);
    if(!found) { console.warn(`[BattleSystem] ID '${enemyId}' nenalezeno`); return null; }

    // LP škálování podle aktu — data mají 10000 default, přepíšeme
    const enemy = { ...found };

    // Validace drop pool — neexistující karta by způsobila tiché selhání odměny
    if(enemy.drops?.pool) {
      const missing = enemy.drops.pool.filter(id => !GameState.getCard(id));
      if(missing.length) console.warn(`[BattleSystem] Enemy '${enemyId}' drops pool: neexistující karta ID`, missing);
    }
    if(enemy.lp === 10000 && enemy.actNumber) {
      const baseLp = [6000, 7000, 8000, 9000, 9500, 10000, 10500, 11000, 12000, 14000];
      const actLp = baseLp[Math.min(enemy.actNumber, baseLp.length - 1)] || 10000;
      enemy.lp = enemy.isBoss ? Math.round(actLp * 1.3) : actLp;
    }
    return enemy;
  },

  // ── STATE INIT ─────────────────────────────────────────────────────────────
  _initState() {
    const gs = GameState;
    const DECK_SIZE = 30;

    // Inicializuj kolekci pokud je prázdná
    if(!gs.player.collection?.length && gs.cards.length > 0) {
      const starterIds = gs.buildStarterDeck?.() || [];
      if(starterIds.length) {
        gs.player.collection = [...starterIds];
        if(!gs.player.deck?.length) gs.player.deck = [...starterIds];
        console.log('[BattleSystem] Kolekce inicializována:', gs.player.collection.length, 'karet');
      }
    }

    // ── Hráčův deck ─────────────────────────────────────────────────────────
    const collection = gs.player?.collection || [];
    let pDeckSource;

    // Priorita: player.deck pokud má >= 28 platných karet, jinak buildStarterDeck
    const playerDeckIds = gs.player?.deck || [];
    const fromPlayerDeck = playerDeckIds.map(id => getCard(id)).filter(Boolean);
    if(fromPlayerDeck.length >= 28) {
      pDeckSource = fromPlayerDeck;
    } else {
      // buildStarterDeck() vrátí přesně 30 IDček z cards.json pools
      const starterIds = GameState.buildStarterDeck();
      pDeckSource = starterIds.map(id => getCard(id)).filter(Boolean);
      if(pDeckSource.length < 28 && collection.length >= 10) {
        // Záloha: vezmi z kolekce
        pDeckSource = collection.slice(0, 40).map(id => getCard(id)).filter(Boolean);
      }
    }
    // Doplň na přesně 30 karet — bez závislosti na getCard
    if(pDeckSource.length < DECK_SIZE) {
      const pool = allCards();
      const monsters = pool.filter(c => c.kind === 'monster');
      const fillPool = monsters.length > 0 ? monsters : pool;
      if(fillPool.length > 0) {
        let fi = 0;
        while(pDeckSource.length < DECK_SIZE) {
          pDeckSource.push({...fillPool[fi % fillPool.length]});
          fi++;
        }
      } else if(pDeckSource.length > 0) {
        // Absolutní záchrana — duplikuj co máme
        let fi = 0;
        while(pDeckSource.length < DECK_SIZE) {
          pDeckSource.push({...pDeckSource[fi % pDeckSource.length]});
          fi++;
        }
      }
      console.warn(`[BattleSystem] Hráčův deck doplněn na ${DECK_SIZE} karet`);
    } else if(pDeckSource.length > DECK_SIZE) {
      pDeckSource = pDeckSource.slice(0, DECK_SIZE);
    }

    if(pDeckSource.length !== DECK_SIZE)
      console.error(`[BattleSystem] CHYBA: hráčův deck má ${pDeckSource.length} karet, očekáváno ${DECK_SIZE}`);

    // Enemy deck — 40 karet podle frakce nepřítele
    let enemyDeckCards = (this._enemy.deck||[]).map(entry=>{
      const id = (typeof entry === 'object') ? entry?.id : entry;
      const base = getCard(id);
      return base ? (GameState.applyScars ? GameState.applyScars({...base}) : {...base}) : null;
    }).filter(Boolean);

    // Mirror/profiler nepřítel hraje TEBOU: vmíchej karty z hráčova decku
    if(this._mirrorEnemy) {
      const yourCards = (GameState.player.deck || [])
        .map(entry => getCard((typeof entry === 'object') ? entry?.id : entry))
        .filter(Boolean)
        .map(c => (GameState.applyScars ? GameState.applyScars({...c}) : {...c}));
      if(yourCards.length) {
        const inject = shuffle([...yourCards]).slice(0, Math.min(12, yourCards.length));
        enemyDeckCards = enemyDeckCards.slice(0, Math.max(0, enemyDeckCards.length - inject.length));
        enemyDeckCards.push(...inject);
      }
    }

    // Doplň na 30 karet z GameState.cards (faction pool)
    if(enemyDeckCards.length < 30) {
      const faction = this._enemy.faction || 'synth';
      const actNum  = this._enemy.actNumber || 1;
      // Pool = karty odpovídající frakci + actUnlock <= actNum nepřítele
      const pool    = allCards();
      const fPool = pool.filter(c =>
        c.kind === 'monster' &&
        (c.faction === faction || (faction === 'hybrid' && ['synth','organic','hybrid'].includes(c.faction))) &&
        (c.actUnlock || 1) <= actNum
      );
      const fSpells = pool.filter(c =>
        (c.kind === 'spell' || c.kind === 'trap') &&
        (c.faction === faction || c.faction === 'neutral' || !c.faction) &&
        (c.actUnlock || 1) <= actNum
      );
      const combined = shuffle([
        ...fPool.map(c=>({...c})),
        ...fSpells.map(c=>({...c})),
        ...(fPool.length === 0 ? pool.filter(c=>c.kind==='monster').slice(0,10).map(c=>({...c})) : [])
      ]);
      // Pokud je combined prázdný, použij všechny monster karty jako zálohu
      if(!combined.length) {
        const fallback = allCards().filter(c => c.kind === 'monster');
        if(fallback.length) combined.push(...fallback.map(c => ({...c})));
      }
      // Garantovaně doplň na 30 — i pokud combined má méně karet než needed
      if(combined.length) {
        let fi = 0;
        while(enemyDeckCards.length < 30) {
          enemyDeckCards.push({...combined[fi % combined.length]});
          fi++;
        }
      }
    }

    // Tutoriál — slabší nepřítel aby hráč prošel
    const tutorialMode = this._isTutorial();
    const enemyLP = tutorialMode ? 5000 : (this._enemy.lp || 10000);

    this._state = {
      pLP:10000, pMaxLP:gs.player?.maxLp||10000,
      eLP:enemyLP, eMaxLP:enemyLP,
      stats:{turns:0,cardsPlayed:0,damageDealt:0,damageTaken:0,fusionsUsed:0,spellsUsed:0},
      pDeck:shuffle(pDeckSource.map(c=>({...c}))),
      pHand:[], eDeck:shuffle(enemyDeckCards), eHand:[],
      pMonsters:[null,null,null,null,null], pSpells:[null,null,null,null,null],
      eMonsters:[null,null,null,null,null], eSpells:[null,null,null,null,null],
      pGY:[], eGY:[],
      activeArena: null,
      turnNumber:1, isPlayerTurn:true, playerTurnCount:0, enemyTurnCount:0,
      canAttack:false, cardPlayedThisTurn:false,
      fuseSelection:[], selectedHandIdx:null,
      attackerSlot:null, phase:'draw', busy:false, over:false, log:[], forcedLoss:!!(this._params?.forcedLoss),
      pendingDrop: null,
      aiStalemateTurns: 0, // počet tahů kdy AI nepodnikla útok
      coinflipResult: null, // 'player' | 'enemy' — kdo vyhrál coinflip
    };

    // Coinflip — kdo začíná
    let playerFirst;
    if(this._params?.playerFirst !== undefined) {
      // Příběhový mód — explicitně zadáno
      playerFirst = !!this._params.playerFirst;
    } else {
      // Free battle — slabší deck začíná (součet ATK+DEF)
      const pPower = this._state.pDeck.reduce((sum, c) => sum + (c.atk||0) + (c.def||0), 0);
      const ePower = this._state.eDeck.reduce((sum, c) => sum + (c.atk||0) + (c.def||0), 0);
      if(pPower === ePower) playerFirst = Math.random() < 0.5;
      else playerFirst = pPower <= ePower; // slabší začíná
    }
    this._state.isPlayerTurn = playerFirst;
    this._state.coinflipResult = playerFirst ? 'player' : 'enemy';

    for(let i=0;i<5;i++) this._draw('p');
    for(let i=0;i<5;i++) this._draw('e');
  },

  // ── DRAW ──────────────────────────────────────────────────────────────────
  _draw(who) {
    const s = this._state;
    const [deck, hand] = who==='p'
      ? [s.pDeck, s.pHand]
      : [s.eDeck, s.eHand];
    if(!deck.length) return false;
    hand.push(deck.pop());
    return true;
  },

  // ── FÁZE ──────────────────────────────────────────────────────────────────
  _startTurn() {
    const s = this._state;
    s.cardPlayedThisTurn=false;
    s.fuseSelection=[]; s.selectedHandIdx=null; s.attackerSlot=null; s.afterFusion=false;

    this._applyArenaTurnEffects();

    const who = s.isPlayerTurn ? 'p' : 'e';
    const deck = s.isPlayerTurn ? s.pDeck : s.eDeck;
    const hand = s.isPlayerTurn ? s.pHand : s.eHand;

    // Deck-out: nemůže líznout na začátku tahu → prohra
    if(deck.length === 0) {
      s.over = true;
      if(s.isPlayerTurn) {
        this._showResult('defeat');
        EventBus.emit('battle:ended', { won: false, nodeId: this._params?.nodeId });
      } else {
        // Nepřítel deckout = Finesse S-grade automaticky
        s._deckoutVictory = true;
        s._finalGrade = { grade:'S', color:'#c8a040', label:'DECKOUT VICTORY', score:100, breakdown:['Nepřítel vyčerpal deck'], style:'finesse' };
        this._showResult('victory');
        EventBus.emit('battle:ended', { won: true, nodeId: this._params?.nodeId });
      }
      this._render();
      return;
    }

    // Doplň na 5 karet
    let drew = 0;
    while(hand.length < 5 && deck.length > 0) {
      this._draw(who);
      drew++;
    }
    console.log(`[Battle] _startTurn: ${who} drew ${drew}, hand=${hand.length}, deck=${deck.length}`);

    if(s.isPlayerTurn) {
      s.playerTurnCount++;
      s.canAttack = (s.coinflipResult === 'player') ? s.playerTurnCount > 1 : true;
      s.phase = 'hand';
      this._setPhase('hand');

      // forcedLoss: auto-trigger porážky na začátku 2. tahu hráče
      // (nevyžaduje klik End Turn ani zahranou kartu — trigger je automatický)
      if(s.forcedLoss && s.playerTurnCount >= 2) {
        this._log('Systém přebírá kontrolu...', 'hint');
        this._render();
        this._forcedLossTimer = setTimeout(() => {
          if(s.over) return;
          s.pLP = 0;
          this._checkGameOver();
        }, 1200);
        return;
      }

      // Tutorial: první útočná fáze
      if(s.canAttack && s.pMonsters.some(m=>m)) {
        this._checkTutorial('first_attack_phase', () => {});
      }
    } else {
      s.enemyTurnCount = (s.enemyTurnCount || 0) + 1;
      s.canAttack = (s.coinflipResult === 'enemy') ? s.enemyTurnCount > 1 : true;
      s.phase = 'main';
      // Tutorial: první enemy tah → po dialogu spustí AI
      // Non-tutorial: AI rovnou
      if(this._isTutorial() && !this['_tut_first_enemy_turn']) {
        this._checkTutorial('first_enemy_turn', () => {
          setTimeout(() => this._aiTurn(), 600);
        });
      } else {
        setTimeout(() => this._aiTurn(), 800);
      }
    }
    this._render();
  },

  // Aplikuje per-turn efekty aktivní arény na začátku tahu
  // Arény ovlivňují OBA hráče — léčení i tažení karet platí pro každého.
  _applyArenaTurnEffects() {
    const s = this._state;
    const arena = s.activeArena;
    if(!arena) return;

    switch(arena.effect) {
      case 'arena_heal': {
        const hp = arena.value || 300;
        s.pLP = clamp(s.pLP+hp, 0, s.pMaxLP);
        s.eLP = clamp(s.eLP+hp, 0, s.eMaxLP);
        this._animateLP('p', hp, true);
        this._animateLP('e', hp, true);
        this._log(`🏟 [${arena.name}]: oba hráči +${hp} LP.`,'sys');
        break;
      }
      case 'arena_draw': {
        const n = arena.value || 1;
        let pDrew = 0, eDrew = 0;
        for(let i=0;i<n;i++) { if(this._draw('p')) pDrew++; }
        for(let i=0;i<n;i++) { if(this._draw('e')) eDrew++; }
        if(pDrew || eDrew) this._log(`🏟 [${arena.name}]: tažení karet (hráč +${pDrew}, nepřítel +${eDrew}).`,'sys');
        break;
      }
      case 'arena_corrupt': {
        const amt = arena.value || 1;
        GameState.adjustCorruption?.(amt) || (GameState.corruption.level = (GameState.corruption?.level||0)+amt);

        break;
      }
      case 'arena_mirror': {
        // Mirror se aplikuje jen při umístění, ne per-turn
        break;
      }
      // Ostatní arena efekty (buff_atk, entropy) se aplikují jen při umístění
    }
  },

  _endTurn() {
    const s = this._state;
    if(s.busy || s.over) return;
    // Musíš zahrát kartu než ukončíš tah
    if(s.isPlayerTurn && !s.cardPlayedThisTurn) {
      this._log('Musíš zahrát kartu!', 'warn');
      return;
    }
    // In-battle lore (nevtíravé titulky) — na konci tahu hráče, mimo tutorial
    if(!this._isTutorial() && s.isPlayerTurn) {
      this._barkTurns = (this._barkTurns || 0) + 1;
      if(this._barkTurns >= 2) this._maybeBark('midfight');
      if(s.eLP <= s.eMaxLP * 0.5) this._maybeBark('lowHP');
    }
    s.busy = true;
    s.turnNumber++;
    if(s.isPlayerTurn) s.stats.turns++;
    s.isPlayerTurn = !s.isPlayerTurn;
    s.fuseSelection = []; s.selectedHandIdx = null; s.attackerSlot = null; s.phase = 'end';
    s.pMonsters.forEach(m => { if(m) m.hasAttacked = false; });
    s.eMonsters.forEach(m => { if(m) m.hasAttacked = false; });

    // Plynulý přechod — fade board
    const board = document.getElementById('board');
    if(board) {
      board.classList.add('turn-switching');
      setTimeout(() => {
        s.busy = false;
        this._render();
        const b2 = document.getElementById('board');
        if(b2) { b2.classList.add('turn-switching'); requestAnimationFrame(() => b2.classList.remove('turn-switching')); }
        this._startTurn();
      }, 320);
    } else {
      setTimeout(() => { s.busy = false; this._render(); this._startTurn(); }, 400);
    }
  },

  // ── ZAHRÁNÍ KARTY ─────────────────────────────────────────────────────────
  _playerPlayCard(handIdx, targetSlot, mode) {
    const s = this._state;
    if(s.busy||s.over||!s.isPlayerTurn) return;
    const card = s.pHand[handIdx];
    if(!card) return;

    // Letter kartu nelze hrát
    if(card.kind==='letter') {
      this._log(`✉ [${card.name}] — nelze hrát. Chraň ji.`,'warn');
      s.selectedHandIdx = null;
      this._render();
      return;
    }

    // ── MONSTER ──────────────────────────────────────────────────────────────
    if(card.kind==='monster') {
      if(s.cardPlayedThisTurn) { this._log('Už jsi zahral kartu v tomto tahu.','warn'); return; }
      const slot = targetSlot!==undefined ? targetSlot : s.pMonsters.findIndex(m=>m===null);
      if(slot>=0 && s.pMonsters[slot]!==null) {
        this._showSwapConfirm(handIdx, slot, 'monster', mode);
        return;
      }
      if(slot<0) { this._log('Žádný volný slot!','warn'); return; }
      s.pHand.splice(handIdx,1);
      const faceDown = s.afterFusion ? false : (mode?.faceDown || false);
      if(s.afterFusion && mode?.faceDown) this._log('Po fúzi nelze hrát face-down.','hint');
      s.pMonsters[slot] = {
        card:{...card},
        mode: faceDown ? 'def' : (mode?.stance || 'atk'),
        faceDown,
        hasAttacked:false,
        justPlaced:true,
        scarCount: GameState.getScarData?.(card.id)?.scars || 0,
      };
      this._applyArenaToMonster(s.pMonsters[slot]);
      setTimeout(()=>{ if(s.pMonsters[slot]) s.pMonsters[slot].justPlaced=false; }, 600);
      setTimeout(() => this._animatePlayFromHand(slot), 50);
      if(faceDown) {
        this._log(`◈ Karta uložena lícem dolů.`,'hint');
      } else {
        this._log(`▶ [${card.name}] (${card.faction.toUpperCase()}) vyložen.`,'sys');
      }
      if(card.storyEffect) GameState.setFlag?.('used_story_card_' + card.id);
      GameState.adjustAlignment?.(card.faction==='synth'?3:card.faction==='organic'?-3:0);
      if(card.corruptionValue) {
        GameState.adjustCorruption?.(card.corruptionValue) || (GameState.corruption.level = (GameState.corruption?.level||0) + card.corruptionValue);
        GameState.adjustAlignment?.(-card.corruptionValue * 5);
      }
      s.cardPlayedThisTurn=true;
      s.fuseSelection=[]; s.selectedHandIdx=null; s.stats.cardsPlayed++;

    // ── TRAP ─────────────────────────────────────────────────────────────────
    } else if(card.kind==='trap') {
      if(s.cardPlayedThisTurn) { this._log('Už jsi zahral kartu v tomto tahu.','warn'); return; }
      const slot = targetSlot!==undefined ? targetSlot : s.pSpells.findIndex(m=>m===null);
      if(slot>=0 && s.pSpells[slot]!==null) { this._showSwapConfirm(handIdx, slot, 'spell', mode); return; }
      if(slot<0) { this._log('Žádný volný slot!','warn'); return; }
      s.pHand.splice(handIdx,1);
      s.pSpells[slot] = {card:{...card}, faceDown:true, used:false};
      this._log(`🪤 [${card.name}] nastaven face-down.`,'warn');
      s.cardPlayedThisTurn=true;
      s.selectedHandIdx=null;

    // ── SPELL / ARENA ────────────────────────────────────────────────────────
    } else {
      if(s.cardPlayedThisTurn) { this._log('Už jsi zahral kartu v tomto tahu.','warn'); return; }
      const slot = targetSlot!==undefined ? targetSlot : s.pSpells.findIndex(m=>m===null);
      if(slot>=0 && s.pSpells[slot]!==null) { this._showSwapConfirm(handIdx, slot, 'spell', mode); return; }
      if(slot<0) { this._log('Žádný volný slot!','warn'); return; }
      s.pHand.splice(handIdx,1);
      // Arény se pokládají VŽDY lícem dolů — aktivují se až klikem na slot
      const faceDownPlacement = card.kind === 'arena';
      s.pSpells[slot] = {card:{...card}, faceDown:faceDownPlacement, used:false};
      if(faceDownPlacement) this._log(`🏟 [${card.name}] nastavena lícem dolů — klikni pro aktivaci.`,'warn');
      else                  this._log(`✨ [${card.name}] vyložen — klikni pro aktivaci.`,'sys');
      s.cardPlayedThisTurn=true;
      s.selectedHandIdx=null;
    }
    // Po zahrání karty → přepni na pole (ruka se schová)
    s.cardPlayedThisTurn = true;
    EventBus.emit("sfx:play", "card_play");
    this._setPhase('field');
    this._render();

    // Tutorial: po prvním monstru
    if(card.kind === 'monster') {
      this._checkTutorial('first_monster_played', () => {});
    }
  },


  
  // ── VÝBĚR SLOTU PRO VÝMĚNU (pole plné) ─────────────────────────────────
  _enterSwapMode(handIdx) {
    // Zavři popup, zvýrazni karty na poli — klik na jednu = přímá výměna bez pickeru
    const s = this._state;
    const card = s.pHand[handIdx];
    if(!card) return;
    document.querySelector('#card-preview-popup')?.remove();

    // Nastav stav swap módu
    s._swapMode = { handIdx, card };
    this._render();

    // Zobraz hint
    this._log('⇄ Vyber kartu na poli pro výměnu — nebo klikni jinam pro zrušení.', 'hint');

    // Bind klik na karty na poli — sloty mají data-who="p" data-slot="N"
    const handler = (e) => {
      const fieldEl = e.target.closest('[data-who="p"][data-slot]');
      if(fieldEl) {
        const slot = parseInt(fieldEl.dataset.slot);
        const entry = s.pMonsters[slot];
        if(entry) {
          document.removeEventListener('click', handler);
          s._swapMode = null;
          this._showSwapConfirm(handIdx, slot, 'monster', null);
          return;
        }
      }
      // Klik mimo obsazený slot = zrušení
      document.removeEventListener('click', handler);
      s._swapMode = null;
      this._render();
    };
    // Přidej listener s malým zpožděním aby nezachytil aktuální klik
    setTimeout(() => document.addEventListener('click', handler), 50);
  },

  _showFieldSwapPicker(handIdx, zone) {
    const s = this._state;
    const newCard = s.pHand[handIdx];
    if(!newCard) return;
    const fieldArr = zone === 'monster' ? s.pMonsters : s.pSpells;
    const fc = factionColor(newCard.faction);

    const pop = document.createElement('div');
    pop.className = 'sap-overlay';

    const slotsHtml = fieldArr.map((entry, i) => {
      if(!entry) {
        // Prázdný slot — nabídni jako přímé zahrání
        return `<button class="swap-slot-btn swap-slot-empty" data-slot="${i}" data-empty="1" style="border-color:#1a2535;color:#607080">
          <span class="ssb-emoji">＋</span>
          <span class="ssb-name">Volný slot ${i+1}</span>
          <span class="ssb-stat" style="color:#3d4a5c">Zahrát sem</span>
        </button>`;
      }
      const c = entry?.card || entry;
      if(!c) return '';
      const sfc = factionColor(c.faction);
      return `<button class="swap-slot-btn" data-slot="${i}" style="border-color:${sfc}">
        <span class="ssb-emoji">${c.emoji||'?'}</span>
        <span class="ssb-name">${c.name}</span>
        <span class="ssb-stat" style="color:${sfc}">${zone==='monster'?'ATK '+c.atk:c.kind.toUpperCase()}</span>
      </button>`;
    }).join('');

    pop.innerHTML = `
      <div class="sap-box" style="border-color:${fc};min-width:320px">
        <div class="sap-title" style="color:${fc}">⇄ Kam zahrát kartu?</div>
        <div class="sap-desc" style="margin-bottom:12px">
          Nasadit: <strong style="color:${fc}">[${newCard.name}]</strong>
        </div>
        <div class="swap-slot-list">${slotsHtml}</div>
        <button class="sap-btn" id="swap-picker-cancel" style="border-color:#334455;color:#607080;margin-top:12px">✕ Zrušit</button>
      </div>
    `;
    this._container.appendChild(pop);

    pop.querySelectorAll('.swap-slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        pop.remove();
        const slot = parseInt(btn.dataset.slot);
        if(btn.dataset.empty) {
          // Prázdný slot — zahraj přímo
          this._playerPlayCard(handIdx, slot, {stance:'atk', faceDown:false});
        } else {
          this._showSwapConfirm(handIdx, slot, zone, null);
        }
      });
    });
    pop.querySelector('#swap-picker-cancel').addEventListener('click', () => pop.remove());
  },

  // ── VÝMĚNA KARTY NA OBSAZENÉM SLOTU (anti-softlock) ─────────────────────
  _showSwapConfirm(handIdx, slot, zone, mode) {
    const s = this._state;
    const newCard = s.pHand[handIdx];
    const fieldArr = zone === 'monster' ? s.pMonsters : s.pSpells;
    const oldEntry = fieldArr[slot];
    const oldCard = oldEntry?.card || oldEntry;
    if(!newCard || !oldCard) return;

    const fc = factionColor(newCard.faction);
    const pop = document.createElement('div');
    pop.className = 'sap-overlay';
    pop.innerHTML = `
      <div class="sap-box" style="border-color:${fc}">
        <div class="sap-title" style="color:${fc}">⇄ Výměna karty</div>
        <div class="sap-desc">
          Zahodit <strong style="color:#e04f6a">[${oldCard.name}]</strong> do hřbitova<br>
          a nasadit <strong style="color:${fc}">[${newCard.name}]</strong>?
        </div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:12px;">
          <button class="sap-btn" id="swap-confirm">✓ Vyměnit</button>
          <button class="sap-btn" id="swap-cancel" style="border-color:#334455;color:#607080">✕ Zrušit</button>
        </div>
      </div>
    `;
    this._container.appendChild(pop);
    pop.querySelector('#swap-confirm').addEventListener('click', () => {
      pop.remove();
      const buried = oldEntry?.card || oldEntry;
      if(buried?.kind === 'letter') {
        GameState.setFlag?.('monyra_letter_destroyed');
        GameState.setFlag?.(`monyra_letter_${buried.id}_destroyed`);

      }
      s.pGY.push({...buried});
      s.pHand.splice(handIdx, 1);
      if(zone === 'monster') {
        const faceDown = s.afterFusion ? false : (mode?.faceDown || false);
        s.pMonsters[slot] = { card:{...newCard}, mode: faceDown?'def':(mode?.stance||'atk'), faceDown, hasAttacked:false };
        this._applyArenaToMonster(s.pMonsters[slot]);
        this._log(`⇄ [${oldCard.name}] zahozen, [${newCard.name}] nasazen.`,'sys');
      } else {
        s.pSpells[slot] = { card:{...newCard}, faceDown: newCard.kind==='trap', used:false };
        this._log(`⇄ [${oldCard.name}] zahozen, [${newCard.name}] nastaven.`,'sys');
      }
      s.cardPlayedThisTurn=true;
      s.fuseSelection=[]; s.selectedHandIdx=null;
      this._render();
    });
    pop.querySelector('#swap-cancel').addEventListener('click', () => pop.remove());
  },

// ── FÚZE ──────────────────────────────────────────────────────────────────
  _toggleFuseSelect(handIdx) {
    const s = this._state;
    if(s.busy||s.over||!s.isPlayerTurn) return;
    const card = s.pHand[handIdx];
    if(!card||card.kind!=='monster') return;

    const idx = s.fuseSelection.indexOf(handIdx);
    if(idx>=0) s.fuseSelection.splice(idx,1); else s.fuseSelection.push(handIdx);
    EventBus.emit('sfx:play', 'card_select');

    // Pokud je selection prázdný → opusť fuse mód
    if(s.fuseSelection.length === 0) {
      this._render();
      return;
    }

    this._render();
    // Auto-preview pouze při VALIDNÍ kombinaci. Pokud není, zavři popup.
    if(s.fuseSelection.length >= 2) {
      const ids = s.fuseSelection.map(i=>s.pHand[i]?.id).filter(Boolean);
      const exactResult = findFusion(ids);
      if(exactResult) {
        this._showFusePreview(exactResult, s.fuseSelection, null, false);
      } else {
        // Nevalidní kombinace — zavři případný preview
        this._closeFusePopup();
      }
    } else {
      this._closeFusePopup();
    }
  },

  _toggleFuseField(fieldSlot) {
    const s = this._state;
    if(!s.fuseSelection.length||s.busy||!s.isPlayerTurn) return;
    const fieldCard = s.pMonsters[fieldSlot];
    if(!fieldCard) return;
    const allIds = [...s.fuseSelection.map(i=>s.pHand[i].id), fieldCard.card.id];
    const result = findFusion(allIds);
    if(result) this._showFusePreview(result, s.fuseSelection, fieldSlot);
  },

  _showFusePreview(result, handIdxs, fieldSlot, isExperimental=false) {
    const s = this._state;
    const popup = this._container.querySelector('#fuse-popup');
    if(!popup) return;
    const sourceNames = handIdxs.map(i=>s.pHand[i]?.name).join(' + ');
    const fieldName = fieldSlot!==null ? ` + ${s.pMonsters[fieldSlot]?.card.name}` : '';

    // Renderuj kartu jako skutečnou herní kartu (lg velikost)
    const cardRender = popup.querySelector('#fp-card-render');
    if(cardRender) {
      const fusedCard = { ...result, kind: 'monster' };
      cardRender.innerHTML = this._renderCardEl(fusedCard, 'lg', {});
      // Klik na kartu = zoom
      cardRender.querySelector?.('.cx-card')?.addEventListener('click', () => showCardZoom(fusedCard));
    }

    // Legacy hodnoty (pro zpětnou kompatibilitu)
    popup.querySelector('#fp-source').textContent = sourceNames + fieldName;
    if(isExperimental) {
      const expNote = popup.querySelector('#fp-exp-note');
      if(expNote) expNote.style.display = 'block';
    }
    s._pendingFuse = {result, handIdxs, fieldSlot, isExperimental};
    popup.style.display='flex';
  },

  _confirmFuse() {
    const s = this._state;
    const pf = s._pendingFuse;
    if(!pf) return;
    const {result, handIdxs, fieldSlot, isExperimental} = pf;
    if(result) GameState.addDiscoveredFusion(result.id);
    const sortedIdxs = [...handIdxs].sort((a,b)=>b-a);
    const removed = sortedIdxs.map(i=>s.pHand.splice(i,1)[0]);
    removed.forEach(c=>s.pGY.push(c));
    const newCard = {...result, kind:'monster'};
    if(fieldSlot !== null) {
      s.pGY.push(s.pMonsters[fieldSlot].card);
      s.pMonsters[fieldSlot] = {card:newCard, mode:s.pMonsters[fieldSlot].mode, hasAttacked:false};
      this._log(`✦ FÚZE! [${result.name}] nahradil kartu na poli.`,'fuse');
    } else {
      const slot = s.pMonsters.findIndex(m=>m===null);
      if(slot<0) { this._log('Žádný volný slot!','warn'); this._cancelFuse(); return; }
      s.pMonsters[slot] = {card:newCard, mode:'atk', hasAttacked:false};
      this._applyArenaToMonster(s.pMonsters[slot]);
      if(isExperimental) {
        this._log(`⚗ EXPERIMENT! [${result.name}] vznikl z nestabilní fúze.`,'fuse');
      } else {
        this._log(`✦ FÚZE! [${result.name}] ATK:${result.atk}`,'fuse');
      }
    }
    s.fuseSelection=[]; s._pendingFuse=null;
    s.phase = s.canAttack ? 'battle' : 'main';
    s.afterFusion = true; // po fúzi lze hrát jen face-up
    s.cardPlayedThisTurn = true; // fúze POČÍTÁ jako zahrání karty
    s.stats.fusionsUsed++;
    // Fúze animace — flash + zvětšení
    this._flashScreen('#b570e0');
    this._fuseFlash();
    EventBus.emit('sfx:play', 'fusion');
    this._closeFusePopup(); this._render();
  },

  _cancelFuse() { this._state._pendingFuse=null; this._closeFusePopup(); this._render(); },
  _closeFusePopup() { const p=this._container.querySelector('#fuse-popup'); if(p) p.style.display='none'; },

  // Spálit fúzi — všechny vybrané karty kromě poslední jdou do GY
  // Poslední karta jde na pole (experimentální výsledek)
  _executeBurnFuse() {
    const s = this._state;
    if(!s.fuseSelection.length) return;
    // Poslední vybraná karta = jde na pole
    const keepIdx = s.fuseSelection[s.fuseSelection.length - 1];
    const keepCard = s.pHand[keepIdx];
    const burnIdxs = s.fuseSelection.slice(0, -1);
    // Spálit od největšího indexu dolů aby splice fungoval správně
    // Nejdřív odeber keepIdx a burnIdxs z ruky (vyšší indexy first)
    const allIdxs = [...s.fuseSelection].sort((a,b) => b - a);
    const removed = [];
    allIdxs.forEach(i => {
      const card = s.pHand.splice(i, 1)[0];
      if(card && i !== keepIdx) {
        s.pGY.push(card);

      } else if(card) {
        removed.push(card); // keepCard
      }
    });
    // Polož keepCard na pole
    const survivor = removed[0] || keepCard;
    if(survivor && survivor.kind === 'monster') {
      const slot = s.pMonsters.findIndex(m => m === null);
      if(slot >= 0) {
        s.pMonsters[slot] = {card:{...survivor}, mode:'atk', faceDown:false, hasAttacked:false};
        this._applyArenaToMonster(s.pMonsters[slot]);
        this._log(`⚗ [${survivor.name}] přežil experiment — na poli.`, 'fuse');
      } else {
        s.pGY.push(survivor);
        this._log(`⚗ [${survivor.name}] — žádný volný slot, zahozena.`, 'warn');
      }
    }
    s.fuseSelection = [];
    s.afterFusion = true;
    this._render();
  },

  // ── STANCE TOGGLE ─────────────────────────────────────────────────────────
  _toggleStance(slot) {
    const s = this._state;
    if(!s.isPlayerTurn||s.busy||s.over) return;
    const m = s.pMonsters[slot];
    if(!m) return;
    if(m.hasAttacked) { this._log('Karta již útočila — stance nelze měnit.','warn'); return; }
    m.mode = m.mode==='atk' ? 'def' : 'atk';
    this._render();
  },

  // ── ÚTOK ──────────────────────────────────────────────────────────────────
  _selectAttacker(slot) {
    const s = this._state;
    if(!s.isPlayerTurn || s.busy || s.over) return;
    if(!s.canAttack) { this._log('V prvním tahu nelze útočit.','warn'); return; }
    if(!s.cardPlayedThisTurn) { this._log('Nejdřív musíš zahrát kartu!','warn'); return; }
    const m = s.pMonsters[slot];
    if(!m) return;
    if(m.hasAttacked) { this._log('Tato karta již útočila.','warn'); return; }
    // Face-down karty v ATK mohou útočit (odhalí se při souboji)
    // Face-down v DEF nemohou útočit
    if(m.mode !== 'atk') { this._log('Karta je v DEF — přepni do ATK.','warn'); return; }
    // Toggle — klik znovu = zrušit výběr
    s.attackerSlot = s.attackerSlot === slot ? null : slot;
    if(s.attackerSlot !== null) {
      this._setPhase('attack');
    } else {
      this._setPhase(s.cardPlayedThisTurn ? 'field' : 'hand');
    }
    this._render();
  },

  _selectTarget(eSlot) {
    const s = this._state;
    if(s.attackerSlot===null||s.busy||s.over) return;
    const hasEnemies = s.eMonsters.some(m=>m);
    // Kliknutí na prázdný slot = direct attack (jen pokud pole nepřítele prázdné)
    if(eSlot!==null && !s.eMonsters[eSlot]) {
      if(hasEnemies) { this._log('Musíš útočit na nepřátelskou kartu!','warn'); return; }
      eSlot = null; // prázdný slot → direct attack
    }
    if(hasEnemies&&eSlot===null) { this._log('Musíš útočit na nepřátelskou kartu!','warn'); return; }
    const attacker = s.pMonsters[s.attackerSlot];
    attacker.hasAttacked=true;
    const atkSlot = s.attackerSlot;
    s.attackerSlot=null;
    // FM pravidlo: nepřátelské trapy se aktivují i při útoku hráče
    const eTrapSlot = s.eSpells.findIndex(sp=>sp&&sp.faceDown&&sp.card?.kind==='trap');
    if(eTrapSlot>=0) {
      const r = this._activateTrap(eTrapSlot, atkSlot, 'e');
      if(r==='negate'||r==='destroyed'||!s.pMonsters[atkSlot]) { this._render(); return; }
    }
    if(!hasEnemies||eSlot===null) this._directAttack('p', atkSlot);
    else this._resolveMonsterBattle('p', atkSlot, eSlot);
    // Tutorial: po prvním útoku
    this._checkTutorial('first_attack_done', () => {});
  },

  _directAttack(who, atkSlot) {
    const s = this._state;
    // Reveal útočníka při přímém útoku
    if(who==='p' && s.pMonsters[atkSlot]?.faceDown) {
      s.pMonsters[atkSlot].faceDown = false;
    }
    if(who==='e' && s.eMonsters[atkSlot] && !s.eMonsters[atkSlot].revealed) {
      s.eMonsters[atkSlot].revealed = true;
      s.eMonsters[atkSlot].justRevealed = true;
    }
    const attacker = who==='p' ? s.pMonsters[atkSlot] : s.eMonsters[atkSlot];
    const dmg = attacker.card.atk || 0;
    if(who==='p') {
      s.eLP=clamp(s.eLP-dmg,0,s.eMaxLP); s.stats.damageDealt+=dmg;
      this._animateLP('e', dmg);
    } else {
      s.pLP=clamp(s.pLP-dmg,0,s.pMaxLP); s.stats.damageTaken+=dmg;
      this._animateLP('p', dmg);
    }
    this._checkGameOver(); this._render();
  },

  // ── FM BATTLE RESOLUTION + CLASH ANIMATION ────────────────────────────────
  _resolveMonsterBattle(who, atkSlot, defSlot) {
    const s = this._state;

    // Označ jako busy na dobu animace
    s.busy = true;

    // Reveal face-down karet před bojem — útočník i obránce
    let needFlip = false;

    // Player útočí → odhal player's attacker if face-down
    if(who==='p' && s.pMonsters[atkSlot]?.faceDown) {
      s.pMonsters[atkSlot].faceDown = false;
      needFlip = true;
    }
    // Player útočí → odhal enemy defender
    if(who==='p' && s.eMonsters[defSlot] && !s.eMonsters[defSlot].revealed) {
      s.eMonsters[defSlot].revealed = true;
      s.eMonsters[defSlot].justRevealed = true;
      needFlip = true;
    }
    // Enemy útočí → odhal enemy attacker
    if(who==='e' && s.eMonsters[atkSlot] && !s.eMonsters[atkSlot].revealed) {
      s.eMonsters[atkSlot].revealed = true;
      s.eMonsters[atkSlot].justRevealed = true;
      needFlip = true;
    }
    // Enemy útočí → odhal player defender if face-down
    if(who==='e' && s.pMonsters[defSlot]?.faceDown) {
      s.pMonsters[defSlot].faceDown = false;
      s.pMonsters[defSlot].justRevealed = true;
      needFlip = true;
    }
    if(who==='e' && s.pMonsters[defSlot] && !s.pMonsters[defSlot].revealed) {
      s.pMonsters[defSlot].revealed = true;
    }

    // Pokud byl flip — render s animací, pak po 600ms spusť clash
    if(needFlip) { this._render(); }

    const flipDelay = needFlip ? 620 : 0;

    const [atkField,defField,atkGY,defGY] = who==='p'
      ? [s.pMonsters,s.eMonsters,s.pGY,s.eGY]
      : [s.eMonsters,s.pMonsters,s.eGY,s.pGY];

    const attacker = atkField[atkSlot];
    const defender = defField[defSlot];
    if(!attacker||!defender) return;

    // Face-down útočník se automaticky odhalí při útoku
    if(attacker.faceDown) {
      attacker.faceDown = false;
      this._log(`👁 [${attacker.card.name}] odhaleno při útoku!`, 'hint');
    }

    const bonus = 0; // affinity systém odstraněn v2037

    const baseAtk = attacker.card.atk || 0;
    const aAtk = Math.max(0, baseAtk + bonus);  // bonus může být +500 nebo -500
    const dVal = defender.mode==='atk' ? defender.card.atk : defender.card.def;
    const diff = aAtk - dVal;

    // Clash zoom overlay + animace
    setTimeout(() => {
    this._showClashZoom(who, atkSlot, defSlot, attacker, defender, diff, atkField, defField, atkGY, defGY);
    }, flipDelay);
    return; // zbytek řeší _showClashZoom
  },

  _showClashZoom(who, atkSlot, defSlot, attacker, defender, diff, atkField, defField, atkGY, defGY) {
    const s = this._state;
    const defWho = who==='p' ? 'e' : 'p';
    const fc_atk = factionColor(attacker.card.faction);
    const fc_def = factionColor(defender.card.faction);
    const atkCard = attacker.card;
    const defCard = defender.card;
    const atkVal  = attacker.card.atk;
    const defVal  = defender.mode==='atk' ? defender.card.atk : defender.card.def;
    const defLabel = defender.mode==='atk' ? 'ATK' : 'DEF';

    // Render actual cards via CardRenderer
    const atkCardHtml = _rcEl(atkCard, 'lg', { attacker: true });
    const defCardHtml = _rcEl(defCard, 'lg', { target: true, def: defender.mode==='def' });

    const clashEl = document.createElement('div');
    clashEl.className = 'clash-zoom-overlay';
    EventBus.emit('sfx:play', 'clash');
    clashEl.innerHTML = `
      <div class="clash-zoom-inner">
        <div class="clash-side clash-side-atk">
          ${atkCardHtml}
          <div class="clash-stat clash-stat-atk">ATK ${atkVal}</div>
        </div>
        <div class="clash-vs">VS</div>
        <div class="clash-side clash-side-def">
          ${defCardHtml}
          <div class="clash-stat clash-stat-def">${defLabel} ${defVal}</div>
        </div>
      </div>
    `;
    document.body.appendChild(clashEl);

    // Klik = skip animace
    clashEl.addEventListener('click', () => { clashEl.dataset.skip='1'; }, { once: true });

    // Výsledková animace po 400ms — show result + damage
    this._resultTimer = setTimeout(() => {
      const resultCls = diff > 0 ? 'clash-atk-wins' : diff < 0 ? 'clash-def-wins' : 'clash-draw';
      clashEl.querySelector('.clash-zoom-inner')?.classList.add(resultCls);
      // Show LP damage amount if overflow
      if(diff !== 0) {
        const lpDmg = Math.abs(diff);
        const dmgLabel = document.createElement('div');
        dmgLabel.className = 'clash-dmg';
        dmgLabel.textContent = defender.mode === 'atk' ? `-${lpDmg} LP` : (diff > 0 ? 'DESTROYED' : `-${lpDmg} LP`);
        dmgLabel.style.color = diff > 0 ? '#50e0b8' : '#e04f6a';
        clashEl.querySelector('.clash-zoom-inner')?.appendChild(dmgLabel);
      }
    }, 400);

    // Funkce která zavře overlay a pokračuje
    let clashDone = false;
    const finishClash = () => {
      if(!this._state) return;
      if(clashDone) return; clashDone = true;
      clearTimeout(this._resultTimer);
      clashEl.remove();
      this._animateCard(who, atkSlot, 'attack');

      if(diff > 0) {
        this._animateCard(defWho, defSlot, 'destroy');
        setTimeout(() => {
          atkGY.push(defender.card);
          defField[defSlot] = null;
          if(defender.mode==='atk') {
            const lpDmg = diff;
            if(who==='p') { s.eLP=clamp(s.eLP-lpDmg,0,s.eMaxLP); s.stats.damageDealt+=lpDmg; this._animateLP('e', lpDmg); this._flashScreen('#e04f6a'); }
            else          { s.pLP=clamp(s.pLP-lpDmg,0,s.pMaxLP); s.stats.damageTaken+=lpDmg; this._animateLP('p', lpDmg); this._flashScreen('#e04f6a'); }
            this._log(`⚔ [${atkCard.name}] drtí [${defCard.name}]! +${lpDmg} LP dmg.`,'dmg');
          } else {
            this._log(`⚔ [${atkCard.name}] ničí [${defCard.name}].`,'dmg');
          }
          s.busy = false;
          this._checkGameOver(); this._render();
        }, 400);

      } else if(diff < 0) {
        const lpDmg = Math.abs(diff);
        if(defender.mode === 'def') {
          // ATK vs DEF — útočník odražen (zůstává na poli), pouze LP damage (FM pravidla)
          setTimeout(() => {
            if(who==='p') { s.pLP=clamp(s.pLP-lpDmg,0,s.pMaxLP); s.stats.damageTaken+=lpDmg; this._animateLP('p', lpDmg); this._flashScreen('#4fa3e0'); }
            else          { s.eLP=clamp(s.eLP-lpDmg,0,s.eMaxLP); s.stats.damageDealt+=lpDmg; this._animateLP('e', lpDmg); this._flashScreen('#4fa3e0'); }
            this._log(`🛡 [${defCard.name}] odráží [${atkCard.name}]! Odraz -${lpDmg} LP.`,'dmg');
            s.busy = false;
            this._checkGameOver(); this._render();
          }, 400);
        } else {
          // ATK vs ATK — útočník zničen + LP damage
          this._animateCard(who, atkSlot, 'destroy');
          setTimeout(() => {
            atkGY.push(attacker.card);
            atkField[atkSlot] = null;
            if(who==='p') { s.pLP=clamp(s.pLP-lpDmg,0,s.pMaxLP); s.stats.damageTaken+=lpDmg; this._animateLP('p', lpDmg); this._flashScreen('#4fa3e0'); }
            else          { s.eLP=clamp(s.eLP-lpDmg,0,s.eMaxLP); s.stats.damageDealt+=lpDmg; this._animateLP('e', lpDmg); this._flashScreen('#4fa3e0'); }
            this._log(`🛡 [${defCard.name}] odráží [${atkCard.name}]! +${lpDmg} LP dmg.`,'dmg');
            s.busy = false;
            this._checkGameOver(); this._render();
          }, 400);
        }

      } else {
        // Remíza — ATK vs ATK: oba zničeni. ATK vs DEF: nic se nestane.
        if(defender.mode === 'def') {
          // ATK === DEF → obránce přežívá, žádné LP damage
          setTimeout(() => {
            this._log(`🛡 [${defCard.name}] odolává útoku [${atkCard.name}].`,'sys');
            s.busy = false;
            this._render();
          }, 300);
        } else {
          this._animateCard(who, atkSlot, 'destroy');
          this._animateCard(defWho, defSlot, 'destroy');
          setTimeout(() => {
            atkGY.push(attacker.card); defGY.push(defender.card);
            atkField[atkSlot] = null; defField[defSlot] = null;
            this._log(`💥 REMÍZA! [${atkCard.name}] vs [${defCard.name}].`,'sys');
            s.busy = false;
            this._checkGameOver(); this._render();
          }, 500);
        }
      }

    };

    // Po 2200ms nebo po kliku (skip)
    this._clashTimer = setTimeout(finishClash, 1200);
    this._skipCheck = setInterval(() => {
      if(clashEl.dataset.skip === '1') {
        clearTimeout(this._clashTimer); clearInterval(this._skipCheck);
        finishClash();
      }
    }, 50);
  },

// Aplikuje bonus aktivní arény na jedno nově vyložené monstrum (frakčně-vědomé).
  // Arény platí OBĚMA stranám i pro karty zahrané po aktivaci (pravidlo z CLAUDE.md).
  _applyArenaToMonster(m) {
    const a = this._state?.activeArena;
    if(!a || !m) return;
    const fits = (a.faction==='synth'||a.faction==='organic') ? m.card.faction===a.faction : true;
    if(!fits) return;
    if(a.effect==='arena_buff_atk') m.card.atk += a.value;
    else if(a.effect==='arena_buff_def') m.card.def = (m.card.def||0)+a.value;
    else if(a.effect==='arena_buff_all') { m.card.atk += a.value; m.card.def = (m.card.def||0)+a.value; }
  },

// ── AKTIVACE SPELLU ───────────────────────────────────────────────────────
  _activateSpell(card, who) {
    const s = this._state;
    const myM  = who==='p' ? s.pMonsters : s.eMonsters;
    const oppM = who==='p' ? s.eMonsters : s.pMonsters;
    const myLP = () => who==='p' ? s.pLP : s.eLP;
    const setMyLP = v => { if(who==='p') s.pLP=v; else s.eLP=v; };
    const myMax = who==='p' ? s.pMaxLP : s.eMaxLP;

    switch(card.effect) {
      // ── Buff vlastních ───────────────────────────────────────────────────
      case 'buff_atk': {
        // Bez cíle — bufuj nejsilnější vlastní monstrum
        const best = myM.filter(m=>m).sort((a,b)=>b.card.atk-a.card.atk)[0];
        if(best) { best.card.atk += card.value; this._log(`⚡ [${best.card.name}] +${card.value} ATK.`,'sys'); }
        else this._log(`⚡ +${card.value} ATK (žádné monstrum na poli).`,'warn');
        break;
      }
      case 'buff_atk_cost': {
        const best = myM.filter(m=>m).sort((a,b)=>b.card.atk-a.card.atk)[0];
        if(best) { best.card.atk += card.value; setMyLP(clamp(myLP()-400, 0, myMax)); this._log(`⚡ [${best.card.name}] +${card.value} ATK (cena 400 LP).`,'sys'); }
        break;
      }
      case 'buff_all_organic':  { myM.forEach(m=>{if(m&&m.card.faction==='organic')m.card.atk+=card.value;}); this._log(`☘ Organic +${card.value} ATK.`,'sys'); break; }
      case 'buff_all_synth':    { myM.forEach(m=>{if(m&&m.card.faction==='synth')m.card.atk+=card.value;}); this._log(`⬡ Synth +${card.value} ATK.`,'sys'); break; }
      case 'buff_all':          { myM.forEach(m=>{if(m)m.card.atk+=card.value;}); this._log(`⚡ Všichni +${card.value} ATK.`,'sys'); break; }

      // ── Léčení ───────────────────────────────────────────────────────────
      case 'heal_pure': {
        setMyLP(clamp(myLP()+card.value, 0, myMax));
        this._animateLP(who, card.value, true);
        this._log(`💧 Léčení ${card.value} LP.`,'sys');
        break;
      }
      case 'heal_buff': {
        // Bufuj nejsilnější + léčení 500 LP
        const best = myM.filter(m=>m).sort((a,b)=>b.card.atk-a.card.atk)[0];
        if(best) best.card.atk += card.value;
        setMyLP(clamp(myLP()+500, 0, myMax));
        this._animateLP(who, 500, true);
        this._log(`💚 +${card.value} ATK + 500 LP léčení.`,'sys');
        break;
      }
      case 'heal_dual': {
        const hasOrg = myM.some(m=>m&&m.card.faction==='organic');
        const hasSyn = myM.some(m=>m&&m.card.faction==='synth');
        if(hasOrg && hasSyn) {
          setMyLP(clamp(myLP()+card.value, 0, myMax));
          this._animateLP(who, card.value, true);
          this._log(`💚 Dual heal ${card.value} LP.`,'sys');
        } else {
          this._log('Potřebuješ Synth i Organic na poli!','warn');
        }
        break;
      }

      // ── Poškození ────────────────────────────────────────────────────────
      case 'area_dmg': {
        oppM.forEach(m=>{ if(m) m.card.atk = Math.max(0, m.card.atk-card.value); });
        this._log(`💥 Všichni nepřátelé -${card.value} ATK.`,'sys');
        break;
      }
      case 'destroy_synth': {
        // Bez cíle — zničí první nepřátelský synth
        const tIdx = oppM.findIndex(m=>m&&m.card.faction==='synth');
        if(tIdx>=0) {
          const t = oppM[tIdx];
          (who==='p'?s.eGY:s.pGY).push(t.card);
          oppM[tIdx] = null;
          this._log(`💻 [${t.card.name}] zničen!`,'sys');
          this._checkGameOver();
        } else {
          this._log('Žádný Synth k zničení.','warn');
        }
        break;
      }

      case 'destroy_organic': {
        const tIdx = oppM.findIndex(m=>m&&m.card.faction==='organic');
        if(tIdx>=0) {
          const t = oppM[tIdx];
          (who==='p'?s.eGY:s.pGY).push(t.card);
          oppM[tIdx] = null;
          this._log(`🪓 [${t.card.name}] vykořeněn!`,'sys');
          this._checkGameOver();
        } else this._log('Žádný Organic k zničení.','warn');
        break;
      }
      case 'destroy_corruption': {
        const tIdx = oppM.findIndex(m=>m&&m.card.faction==='corruption');
        if(tIdx>=0) {
          const t = oppM[tIdx];
          (who==='p'?s.eGY:s.pGY).push(t.card);
          oppM[tIdx] = null;
          this._log(`📡 [${t.card.name}] vyčištěn!`,'sys');
          this._checkGameOver();
        } else this._log('Žádná Corruption karta k zničení.','warn');
        break;
      }
      case 'destroy_strongest': {
        // Nejsilnější monstrum soupeře — impaktní removal za cenu +1 corruption
        let tIdx=-1, best=-1;
        oppM.forEach((m,i)=>{ if(m && (m.card.atk||0)>best){best=m.card.atk||0;tIdx=i;} });
        if(tIdx>=0) {
          const t = oppM[tIdx];
          (who==='p'?s.eGY:s.pGY).push(t.card);
          oppM[tIdx] = null;
          GameState.adjustCorruption?.(1) || (GameState.corruption.level = (GameState.corruption?.level||0)+1);
          this._log(`⌫ [${t.card.name}] přepsán! +1 corruption.`,'entropy');
          this._checkGameOver();
        } else this._log('Žádný cíl k přepsání.','warn');
        break;
      }
      case 'force_def': {
        // Nejsilnější kartu soupeře do DEF + sniž ATK
        let tIdx=-1, best=-1;
        oppM.forEach((m,i)=>{ if(m && (m.card.atk||0)>best){best=m.card.atk||0;tIdx=i;} });
        if(tIdx>=0) {
          const t = oppM[tIdx];
          t.mode='def';
          t.card.atk = Math.max(0, (t.card.atk||0) - card.value);
          this._log(`🔄 [${t.card.name}] přepnut do DEF, -${card.value} ATK.`,'sys');
        } else this._log('Žádný cíl k přesměrování.','warn');
        break;
      }
      case 'buff_synergy': {
        const hasOrg = myM.some(m=>m&&m.card.faction==='organic');
        const hasSyn = myM.some(m=>m&&m.card.faction==='synth');
        if(hasOrg && hasSyn) {
          myM.forEach(m=>{ if(m&&(m.card.faction==='synth'||m.card.faction==='organic')) m.card.atk += card.value; });
          this._log(`🌉 Synergie: Synth + Organic +${card.value} ATK.`,'sys');
        } else this._log('Potřebuješ Synth i Organic na poli!','warn');
        break;
      }
      case 'arena_break': {
        if(s.activeArena) {
          const name = s.activeArena.name;
          s.activeArena = null;
          // Odstraň arénu ze spell slotů (obou stran) → do hřbitova majitele
          [['p',s.pSpells,s.pGY],['e',s.eSpells,s.eGY]].forEach(([sd,slots,gy])=>{
            slots.forEach((sp,i)=>{ if(sp && sp.card?.kind==='arena'){ gy.push(sp.card); slots[i]=null; } });
          });
          this._log(`🏟 Aréna [${name}] zničena. Pole je zase jen pole.`,'sys');
        } else this._log('Žádná aktivní aréna.','warn');
        break;
      }

      // ── Corruption ───────────────────────────────────────────────────────
      case 'corrupt_debuff': {
        const t = oppM.find(m=>m);
        if(t) {
          t.card.atk = Math.max(0, t.card.atk-card.value);

        }
        GameState.adjustCorruption?.(1) || (GameState.corruption.level = (GameState.corruption?.level||0)+1);
        break;
      }
      case 'corruption_heal': {
        setMyLP(clamp(myLP()+card.value, 0, myMax));
        this._animateLP(who, card.value, true);
        GameState.adjustCorruption?.(1) || (GameState.corruption.level = (GameState.corruption?.level||0)+1);

        break;
      }

      // ── Copy ─────────────────────────────────────────────────────────────
      case 'copy_atk': {
        const strongest = oppM.filter(m=>m).reduce((a,b)=>(!a||b.card.atk>a.card.atk)?b:a, null);
        const t = myM.find(m=>m);
        if(strongest && t) {
          t.card.atk = strongest.card.atk;
          this._log(`🪞 Kopíruju ATK ${strongest.card.atk} z [${strongest.card.name}].`,'sys');
        }
        break;
      }

      // ── Arena efekty — aplikují se při umístění i při aktivaci ──────────
      // Arény ovlivňují OBĚ strany (efekt platí pro celé pole).
      case 'arena_buff_atk':
      case 'arena_buff_def':
      case 'arena_buff_all': {
        // Frakční aréna buffuje jen svou frakci (obě strany!); hybrid/neutral všem
        const fitsF = m => (card.faction==='synth'||card.faction==='organic') ? m.card.faction===card.faction : true;
        [...myM, ...oppM].forEach(m=>{
          if(!m || !fitsF(m)) return;
          if(card.effect!=='arena_buff_def') m.card.atk += card.value;
          if(card.effect!=='arena_buff_atk') m.card.def = (m.card.def||0)+card.value;
        });
        const lbl = card.faction==='synth' ? 'Synth' : card.faction==='organic' ? 'Organic' : 'všichni';
        const stat = card.effect==='arena_buff_atk' ? 'ATK' : card.effect==='arena_buff_def' ? 'DEF' : 'ATK i DEF';
        this._log(`🏟 [${card.name}]: ${lbl} +${card.value} ${stat} (obě strany).`,'sys');
        break;
      }
      case 'arena_draw': {
        const n = card.value || 1;
        let drew = 0;
        for(let i=0;i<n;i++) { if(who==='p'?this._draw('p'):this._draw('e')) drew++; }
        this._log(`🏟 Arena: +${drew} karta(y).`,'sys');
        break;
      }
      case 'arena_heal': {
        // Léčení se aplikuje na začátku každého tahu — zde jen okamžitý efekt
        const hp = card.value || 500;
        setMyLP(clamp(myLP()+hp, 0, myMax));
        this._animateLP(who, hp, true);
        this._log(`🏟 Arena: léčení ${hp} LP.`,'sys');
        break;
      }
      case 'arena_mirror': {
        myM.forEach((m,i)=>{
          if(!m||!oppM[i]) return;
          const tmp = m.card.atk; m.card.atk = oppM[i].card.atk; oppM[i].card.atk = tmp;
        });
        this._log(`🏟 Arena: zrcadlo — ATK proházeny.`,'sys');
        break;
      }
      case 'arena_entropy': {
        oppM.forEach(m=>{ if(m) m.card.atk = Math.max(0, m.card.atk-card.value); });
        GameState.adjustCorruption?.(1) || (GameState.corruption.level = (GameState.corruption?.level||0)+1);

        break;
      }
      case 'arena_corrupt': {
        const amt = card.value || 2;
        GameState.adjustCorruption?.(amt) || (GameState.corruption.level = (GameState.corruption?.level||0)+amt);

        break;
      }

      default:
        this._log(`[${card.name}] aktivován.`,'sys');
        break;
    }

    // Arena karty se nepočítají do spellsUsed (grading penalizuje spelly, ne arény)
    if(card.kind !== 'arena') {
      s.stats.spellsUsed++;
      EventBus.emit('sfx:play', 'spell');
    }

    // Arena karta — nastav jako aktivní arenu a aplikuj per-turn tracking
    if(card.kind === 'arena') {
      s.activeArena = { ...card };
      this._log(`🏟 [${card.name}] je nyní aktivní aréna.`,'sys');
      EventBus.emit('sfx:play', 'arena');
    }

    this._render();
  },

  _activateTrap(trapSlot, attackerSlot, who) {
    const s = this._state;
    const trapField = who==='p' ? s.pSpells : s.eSpells;
    const slot = trapField[trapSlot];
    if(!slot||!slot.faceDown) return false;
    const card = slot.card;
    const atkField = who==='p' ? s.eMonsters : s.pMonsters;
    const attacker = atkField[attackerSlot];
    if(!attacker) return false;
    trapField[trapSlot]=null;
    (who==='p'?s.pGY:s.eGY).push(card);
    this._log(`🪤 PAST! [${card.name}] aktivována!`,'warn');
    EventBus.emit('sfx:play', 'trap');
    switch(card.effect) {
      case 'trap_negate': this._log('Útok negován!','sys'); attacker.hasAttacked=false; return 'negate';
      case 'trap_weaken': attacker.card.atk=Math.max(0,attacker.card.atk-card.value); this._log(`Útočník -${card.value} ATK.`,'sys'); return false;
      case 'trap_emp':    if(attacker.card.faction==='synth'){(who==='p'?s.eGY:s.pGY).push(attacker.card);atkField[attackerSlot]=null;this._log(`⚡ EMP zničil [${attacker.card.name}]!`,'dmg');return 'destroyed';} return false;
      case 'trap_bounce': { const dmg=attacker.card.atk;if(who==='p'){s.eLP=clamp(s.eLP-dmg,0,s.eMaxLP);this._animateLP('e',dmg);}else{s.pLP=clamp(s.pLP-dmg,0,s.pMaxLP);this._animateLP('p',dmg);}this._log(`🔄 Odraz ${dmg} dmg!`,'dmg');this._checkGameOver();return false; }
      case 'trap_void':   { attacker.hasAttacked=false; GameState.adjustCorruption?.(1) || (GameState.corruption.level = (GameState.corruption?.level||0)+1); this._log('Void past! +1 corruption.','entropy'); return 'negate'; }
      case 'trap_capture': { attacker.mode='def'; this._log(`🔒 [${attacker.card.name}] uvězněn — přepnut do DEF, útok zrušen!`,'sys'); return 'negate'; }
      case 'trap_snare':  { if((attacker.card.atk||0) <= card.value){ (who==='p'?s.eGY:s.pGY).push(attacker.card); atkField[attackerSlot]=null; this._log(`🌱 [${attacker.card.name}] pohlcen půdou!`,'dmg'); return 'destroyed'; } this._log(`🌱 Past sklapla naprázdno — útočník je příliš silný (ATK > ${card.value}).`,'warn'); return false; }
      case 'trap_decay':  { const before=attacker.card.atk||0; attacker.card.atk=Math.floor(before/2); this._log(`🌀 [${attacker.card.name}] prošel trhlinou: ATK ${before} → ${attacker.card.atk}.`,'entropy'); return false; }
    }
    return false;
  },

  // ── AI ────────────────────────────────────────────────────────────────────
  _aiTurn() {
    const s = this._state;
    if(s.over) return;
    // Safety: ensure enemy hand is filled to 5 (should already be done in _startTurn)
    while(s.eHand.length < 5 && s.eDeck.length > 0) this._draw('e');
    const aiStyle = this._enemy?.aiStyle || 'balanced';
    this._aiPlayCard(aiStyle);
    this._render();
    setTimeout(()=>{
      if(s.over) return;
      // Pre-attack: odhal face-down a přepni do ATK karty co chtějí útočit
      this._aiPrepareAttackers(aiStyle);
      this._render();
      setTimeout(()=>{
        if(s.over) return;
        this._aiAttack(()=>{ this._render(); setTimeout(()=>this._endTurn(),600); });
      }, 300);
    }, 400);
  },

  // AI příprava útočníků — odhal face-down, přepni DEF→ATK
  _aiPrepareAttackers(style) {
    const s = this._state;
    // V prvním tahu (nesmí útočit) neodhaluj ani nepřepínej do ATK — zbytečné prozrazení
    if(!s.canAttack) return;
    // Kolik monster chceme přepnout do ATK závisí na stylu
    const wantAttack = !['defensive'].includes(style);
    if(!wantAttack) return;

    s.eMonsters.forEach((m, i) => {
      if(!m || m.hasAttacked) return;
      // Odhal face-down
      if(!m.revealed) {
        m.revealed = true;
        m.justRevealed = true;
        this._log(`◀ Nepřítel odhalil kartu: [${m.card.name}]`, 'hint');
      }
      // Přepni do ATK pokud je v DEF a styl to dovoluje
      if(m.mode === 'def') {
        // Defensive AI nechá v DEF; reactive přepne jen pokud má dost síly
        if(style === 'reactive') {
          const pMaxAtk = Math.max(0, ...s.pMonsters.filter(Boolean).map(pm => pm.card.atk || 0));
          if((m.card.atk || 0) > pMaxAtk) m.mode = 'atk';
        } else if(style === 'strategic' || style === 'balanced') {
          // Přepni jen pokud má šanci vyhrát souboj
          const pMaxAtk = Math.max(0, ...s.pMonsters.filter(Boolean).map(pm => pm.card.atk || 0));
          if((m.card.atk || 0) >= pMaxAtk || !s.pMonsters.some(Boolean)) m.mode = 'atk';
        } else {
          // Aggressive, perfect, rewrite, growth, corruption — vždy ATK
          m.mode = 'atk';
        }
      }
    });
  },

  // ── AI styl hrací logika ─────────────────────────────────────────────────
  // Nová AI v2039: chytrá fúze (ruka+ruka, ruka+pole), styl ovlivňuje vše
  _aiPlayCard(style) {
    const s = this._state;
    const monsters = s.eHand.filter(c => c.kind === 'monster');
    const spells   = s.eHand.filter(c => c.kind === 'spell');
    const traps    = s.eHand.filter(c => c.kind === 'trap');
    const emptyM   = s.eMonsters.map((m,i) => m===null ? i : -1).filter(i => i >= 0);
    const emptyS   = s.eSpells.map((m,i) => m===null ? i : -1).filter(i => i >= 0);
    const fieldM   = s.eMonsters.map((m,i) => m ? {m,i} : null).filter(Boolean);
    const lpPct    = s.eLP / s.eMaxLP;
    const pActive  = s.pMonsters.filter(Boolean);
    const pMaxAtk  = pActive.length ? Math.max(...pActive.map(m => m.card.atk || 0)) : 0;
    let played = false;

    // NOVÁ AI (v2040): místo pevné priority oskóruj všechny "chtěné" tahy a vyber nejhodnotnější.
    // Vetting dělají helpery (rozhodují, JESTLI je tah dobrý); skóre rozhoduje, KTERÝ se zahraje.
    // Dřív pořadí fúze→monstrum→… + limit 1 karta/tah → AI hrála skoro jen monstra.
    const candidates = [];

    // ── FÚZE ──
    const allFusions = this._aiFindAllFusions(monsters, fieldM);
    if(allFusions.length > 0) {
      const bestFusion = this._aiPickBestFusion(allFusions, style, pMaxAtk, lpPct);
      if(bestFusion && this._aiShouldFuse(bestFusion, style, pMaxAtk, monsters, emptyM)) {
        candidates.push({ t:'fuse', score: 1200 + (bestFusion.result.atk || 0),
          exec: () => this._aiExecuteFusion(bestFusion) });
      }
    }

    // ── MONSTRUM ──
    if(monsters.length && emptyM.length) {
      const pick = this._aiPickMonster(monsters, style, pMaxAtk, lpPct, pActive);
      if(pick && pick.card) {
        candidates.push({ t:'monster', score: 600 + (pick.card.atk || 0), exec: () => {
          const idx = s.eHand.indexOf(pick.card);
          if(idx >= 0) s.eHand.splice(idx, 1);
          s.eMonsters[emptyM[0]] = {card:{...pick.card}, mode: pick.mode, hasAttacked:false, revealed:false};
          this._applyArenaToMonster(s.eMonsters[emptyM[0]]);
          this._log('◀ Nepřítel vyložil kartu lícem dolů.', 'hint');
          return true;
        }});
      }
    }

    // ── KOUZLO ── (jen když ho AI opravdu chce — helper gate)
    if(spells.length) {
      const useSpell = this._aiWantsSpell(style, spells, monsters, emptyM, lpPct);
      if(useSpell) {
        candidates.push({ t:'spell', score: 1000 + Math.min(400, (useSpell.value || 0) / 2), exec: () => {
          s.eHand.splice(s.eHand.indexOf(useSpell), 1);
          s.eGY.push({...useSpell});
          this._activateSpell(useSpell, 'e');
          this._log(`◀ Nepřítel použil [${useSpell.name}]!`, 'warn');
          return true;
        }});
      }
    }

    // ── ARÉNA ──
    if(emptyS.length) {
      const arenas = s.eHand.filter(c => c.kind === 'arena');
      if(arenas.length) {
        const arena = this._aiPickArena(arenas, style, lpPct);
        if(arena) {
          candidates.push({ t:'arena', score: 760, exec: () => {
            s.eHand.splice(s.eHand.indexOf(arena), 1);
            s.eSpells[emptyS[0]] = {card:{...arena}, faceDown:false, used:false};
            this._activateSpell(arena, 'e');
            this._log(`◀ Nepřítel vyložil arénu [${arena.name}]!`, 'warn');
            return true;
          }});
        }
      }
    }

    // ── PAST ──
    if(traps.length && emptyS.length) {
      const pHasMonster = pActive.length > 0;
      let wantTrap = false;
      if(style === 'defensive') wantTrap = true;
      else if(style === 'aggressive') wantTrap = pHasMonster && Math.random() < 0.1;
      else if(style === 'strategic' || style === 'perfect' || style === 'rewrite' || style === 'reactive') wantTrap = pHasMonster;
      else wantTrap = pHasMonster && Math.random() < 0.5;
      if(wantTrap) {
        const trap = this._aiPickTrap(traps, pActive) || traps[0];
        candidates.push({ t:'trap', score: 720, exec: () => {
          s.eHand.splice(s.eHand.indexOf(trap), 1);
          s.eSpells[emptyS[0]] = {card:{...trap}, faceDown:true};
          this._log('◀ Nepřítel nastražil past.', 'hint');
          return true;
        }});
      }
    }

    // Jemný styl-posun: útočné styly boostnou monstrum/fúzi, defensive past/arénu
    for(const c of candidates) {
      if((style === 'aggressive' || style === 'perfect') && (c.t === 'monster' || c.t === 'fuse')) c.score += 150;
      if(style === 'defensive' && (c.t === 'trap' || c.t === 'arena')) c.score += 200;
    }

    if(candidates.length) {
      candidates.sort((a, b) => b.score - a.score);
      played = candidates[0].exec();
    }

    // ── FORCE PLAY — AI musí zahrát alespoň 1 kartu ──────────────────────
    if(!played && s.eHand.length > 0) {
      // Zkus monster na pole
      if(monsters.length && emptyM.length) {
        const card = monsters[0];
        s.eHand.splice(s.eHand.indexOf(card), 1);
        s.eMonsters[emptyM[0]] = {card:{...card}, mode:'def', hasAttacked:false, revealed:false};
        this._applyArenaToMonster(s.eMonsters[emptyM[0]]);
        played = true;
      }
      // Zkus spell/trap na spell slot
      if(!played && emptyS.length) {
        const card = s.eHand[0];
        if(card && (card.kind === 'spell' || card.kind === 'trap' || card.kind === 'arena')) {
          s.eHand.splice(0, 1);
          if(card.kind === 'arena') {
            s.eSpells[emptyS[0]] = {card:{...card}, faceDown:false, used:false};
            this._activateSpell(card, 'e');
          } else if(card.kind === 'spell') {
            s.eGY.push({...card});
            this._activateSpell(card, 'e');
          } else {
            s.eSpells[emptyS[0]] = {card:{...card}, faceDown:true, used:false};
          }
          played = true;
        }
      }
      // Všechny sloty plné — zahoď nejslabší kartu (force discard)
      if(!played) {
        const weakest = s.eHand.reduce((min, c, i) => (!min || (c.atk||0) < (min.c.atk||0)) ? {c, i} : min, null);
        if(weakest) {
          s.eHand.splice(weakest.i, 1);
          s.eGY = s.eGY || [];
          s.eGY.push(weakest.c);
          played = true;
        }
      }
    }
  },

  // ── AI: najdi všechny možné fúze ──────────────────────────────────────────
  _aiFindAllFusions(handMonsters, fieldEntries) {
    const results = [];

    // Ruka + ruka
    for(let i = 0; i < handMonsters.length; i++) {
      for(let j = i+1; j < handMonsters.length; j++) {
        const r = findFusion([handMonsters[i].id, handMonsters[j].id]);
        if(r) {
          results.push({
            type: 'hand+hand',
            sources: [handMonsters[i], handMonsters[j]],
            result: r,
            fieldSlot: null,
          });
        }
      }
    }

    // Ruka + pole
    for(const hc of handMonsters) {
      for(const {m: fieldEntry, i: slot} of fieldEntries) {
        if(!fieldEntry?.card) continue;
        const r = findFusion([hc.id, fieldEntry.card.id]);
        if(r) {
          results.push({
            type: 'hand+field',
            sources: [hc],
            fieldCard: fieldEntry.card,
            fieldSlot: slot,
            result: r,
          });
        }
      }
    }

    return results;
  },

  // ── AI: vyber nejlepší fúzi podle stylu ────────────────────────────────────
  _aiPickBestFusion(fusions, style, pMaxAtk, lpPct) {
    if(!fusions.length) return null;

    // Score každou fúzi
    const scored = fusions.map(f => {
      let score = f.result.atk || 0;

      // Bonus za hand+field (neobsadí nový slot)
      if(f.type === 'hand+field') score += 300;

      // Stylové úpravy
      if(style === 'aggressive') {
        score = f.result.atk * 1.5; // čistě ATK
      } else if(style === 'defensive') {
        score = (f.result.def || 0) * 1.3 + f.result.atk * 0.5;
      } else if(style === 'strategic' || style === 'perfect' || style === 'rewrite') {
        // Preferuj fúze které překonají hráčovu nejsilnější kartu
        if(f.result.atk > pMaxAtk) score += 1000;
        score += f.result.atk + (f.result.def || 0);
      } else if(style === 'corruption') {
        // Preferuj corruption fúze
        if(f.result.corruptionValue) score += 800;
        score += f.result.atk;
      }

      return { ...f, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  },

  // ── AI: rozhodnutí jestli fúzovat ─────────────────────────────────────────
  _aiShouldFuse(fusion, style, pMaxAtk, handMonsters, emptySlots) {
    // Perfect/rewrite/strategic — fúzuj vždy pokud výsledek je lepší
    if(['perfect','rewrite','strategic'].includes(style)) return true;

    // Aggressive — fúzuj pokud výsledek má vyšší ATK než cokoliv v ruce
    if(style === 'aggressive') {
      const bestHandAtk = handMonsters.reduce((max, c) => Math.max(max, c.atk || 0), 0);
      return fusion.result.atk > bestHandAtk;
    }

    // Defensive — fúzuj jen pokud výsledek má vysoký DEF
    if(style === 'defensive') {
      return (fusion.result.def || 0) >= 1500;
    }

    // Accumulator — nefúzuj v prvních 3 tazích
    if(style === 'accumulator' && this._state.turnNumber <= 3) return false;

    // Mirror — fúzuj pokud hráč má silnější kartu
    if(style === 'mirror') return fusion.result.atk > pMaxAtk;

    // Corruption — fúzuj vždy (risk/reward)
    if(style === 'corruption') return true;

    // Balanced/ostatní — fúzuj pokud výsledek stojí za ztrátu 2 karet
    const avgHandAtk = handMonsters.reduce((s, c) => s + (c.atk||0), 0) / (handMonsters.length || 1);
    return fusion.result.atk >= avgHandAtk * 1.4;
  },

  // ── AI: proveď fúzi ───────────────────────────────────────────────────────
  _aiExecuteFusion(fusion) {
    const s = this._state;

    if(fusion.type === 'hand+hand') {
      const [src1, src2] = fusion.sources;
      // Odeber z ruky (vyšší index first)
      const i1 = s.eHand.indexOf(src1);
      const i2 = s.eHand.indexOf(src2);
      const hi = Math.max(i1, i2), lo = Math.min(i1, i2);
      s.eGY.push(s.eHand.splice(hi, 1)[0]);
      s.eGY.push(s.eHand.splice(lo, 1)[0]);

      // Najdi slot
      const slot = s.eMonsters.findIndex(m => m === null);
      if(slot < 0) return false;

      s.eMonsters[slot] = {
        card: {...fusion.result, kind:'monster'},
        mode: 'atk', hasAttacked: false, revealed: false,
      };
      this._applyArenaToMonster(s.eMonsters[slot]);
      this._log(`◀ Nepřítel fúzoval dvě karty!`, 'warn');
      return true;

    } else if(fusion.type === 'hand+field') {
      const [src] = fusion.sources;
      const handIdx = s.eHand.indexOf(src);
      if(handIdx < 0) return false;

      // Odeber z ruky
      s.eGY.push(s.eHand.splice(handIdx, 1)[0]);
      // Odeber z pole do GY
      s.eGY.push(s.eMonsters[fusion.fieldSlot].card);

      // Nahraď na poli
      s.eMonsters[fusion.fieldSlot] = {
        card: {...fusion.result, kind:'monster'},
        mode: 'atk', hasAttacked: false, revealed: false,
      };
      this._log(`◀ Nepřítel posílil kartu na poli!`, 'warn');
      return true;
    }

    return false;
  },

  // ── AI: vyber monstrum k zahrání ──────────────────────────────────────────
  _aiPickMonster(monsters, style, pMaxAtk, lpPct, pActive) {
    let best, mode = 'atk';

    if(style === 'aggressive') {
      best = monsters.reduce((a,b) => (a.atk||0) > (b.atk||0) ? a : b);
      mode = 'atk';
    } else if(style === 'defensive') {
      best = monsters.reduce((a,b) => (a.def||0) > (b.def||0) ? a : b);
      mode = 'def';
      if((best.def||0) < 800) mode = 'atk';
    } else if(style === 'reactive') {
      best = monsters.reduce((a,b) => (a.atk||0) > (b.atk||0) ? a : b);
      mode = pActive.length > 0 ? 'atk' : 'def';
    } else if(style === 'strategic') {
      best = monsters.reduce((a,b) => {
        const sa = (a.atk||0) + (a.def||0), sb = (b.atk||0) + (b.def||0);
        return sa > sb ? a : b;
      });
      const wouldLose = pActive.some(m => (m.card.atk||0) > (best.atk||0));
      const goodDef = (best.def||0) >= (best.atk||0)*0.8;
      mode = (wouldLose && goodDef) ? 'def' : 'atk';
    } else if(style === 'mirror') {
      const pAtkCount = pActive.filter(m => m.mode==='atk').length;
      const pDefCount = pActive.filter(m => m.mode==='def').length;
      best = monsters.reduce((a,b) => (a.atk||0) > (b.atk||0) ? a : b);
      mode = pDefCount > pAtkCount ? 'def' : 'atk';
    } else if(style === 'accumulator') {
      const sorted = [...monsters].sort((a,b) => (a.atk||0) - (b.atk||0));
      best = this._state.turnNumber <= 3 ? sorted[0] : sorted[sorted.length-1];
      mode = this._state.turnNumber <= 2 ? 'def' : 'atk';
    } else if(style === 'perfect' || style === 'rewrite') {
      best = monsters.reduce((a,b) => (a.atk||0) > (b.atk||0) ? a : b);
      const wouldLose = pActive.some(m => (m.card.atk||0) > (best.atk||0));
      const goodDef = (best.def||0) >= pMaxAtk;
      mode = (wouldLose && goodDef) ? 'def' : 'atk';
    } else if(style === 'growth') {
      const sorted = [...monsters].sort((a,b) => (a.atk||0) - (b.atk||0));
      const pick = Math.min(this._state.turnNumber-1, sorted.length-1);
      best = sorted[pick];
      mode = 'atk';
    } else if(style === 'corruption') {
      // Preferuj corruption karty
      const corrCards = monsters.filter(c => c.faction === 'corruption' || c.corruptionValue);
      best = (corrCards.length ? corrCards : monsters).reduce((a,b) => (a.atk||0) > (b.atk||0) ? a : b);
      mode = 'atk';
    } else {
      // balanced
      best = monsters.reduce((a,b) => (a.atk||0) > (b.atk||0) ? a : b);
      const wouldLoseInAtk = pActive.some(m => (m.card.atk||0) > (best.atk||0));
      const hasGoodDef = (best.def||0) >= (best.atk||0)*0.8;
      if(lpPct < 0.3 && hasGoodDef) mode = 'def';
      else if(wouldLoseInAtk && hasGoodDef && (best.def||0) >= pMaxAtk) mode = 'def';
      else if(this._state.turnNumber <= 2 && Math.random() < 0.35 && hasGoodDef) mode = 'def';
    }

    return { card: best, mode };
  },

  // ── AI: vyber nejvhodnější arénu podle situace a stylu ────────────────────
  _aiPickArena(arenas, style, lpPct) {
    const s = this._state;
    const eMonsterCount = s.eMonsters.filter(Boolean).length;
    const eHandCount = s.eHand.length;
    const turn = s.turnNumber || 1;

    // arena_heal — když má AI nízké LP
    if(lpPct < 0.5) {
      const heal = arenas.find(a => a.effect === 'arena_heal');
      if(heal) return heal;
    }

    // arena_buff_atk — pokud má AI alespoň 1 monstrum
    if(eMonsterCount >= 1) {
      const buffAtk = arenas.find(a => a.effect === 'arena_buff_atk');
      if(buffAtk) return buffAtk;
    }

    // arena_draw — v prvních 3 tazích pokud má AI prázdnou ruku (< 3 karty)
    if(turn <= 3 && eHandCount < 3) {
      const draw = arenas.find(a => a.effect === 'arena_draw');
      if(draw) return draw;
    }

    // arena_corrupt — jen pro corruption styl
    if(style === 'corruption') {
      const corrupt = arenas.find(a => a.effect === 'arena_corrupt');
      if(corrupt) return corrupt;
    }

    // Žádná aréna nepasuje na aktuální situaci — počkáme s pokládáním
    // (jen pokud má AI tolik karet, že nehrozí přeplnění ruky)
    if(eHandCount >= 4 || turn >= 5) {
      // Force play — pokud má AI hodně karet nebo je pozdní hra, hraj cokoliv
      return arenas[0];
    }

    return null;
  },

  // ── AI: vyber nejvhodnější trap podle hráčových monster ───────────────────
  _aiPickTrap(traps, pActive) {
    if(!traps.length) return null;
    if(!pActive.length) return traps[0];

    const pHasSynth = pActive.some(m => m?.card?.faction === 'synth');
    const pMaxAtk = Math.max(0, ...pActive.map(m => m.card.atk || 0));
    const pMinAtk = Math.min(...pActive.map(m => m.card.atk || 0));
    const pStrong = pMaxAtk >= 1800;

    // Nové trapy — situační priorita
    if(pStrong) {
      const decay = traps.find(t => t.effect === 'trap_decay');      // půlí ATK — nejlepší proti obrům
      if(decay) return decay;
      const capture = traps.find(t => t.effect === 'trap_capture');  // uvězni do DEF
      if(capture) return capture;
    }
    const snare = traps.find(t => t.effect === 'trap_snare' && pMinAtk <= (t.value || 1500));
    if(snare) return snare;

    // EMP proti synth hráči
    if(pHasSynth) {
      const emp = traps.find(t => t.effect === 'trap_emp');
      if(emp) return emp;
    }

    // Bounce proti silnému útočníkovi (vrátí mu dmg)
    if(pStrong) {
      const bounce = traps.find(t => t.effect === 'trap_bounce');
      if(bounce) return bounce;
    }

    // Negate je univerzální — preferuj proti silným
    if(pStrong) {
      const negate = traps.find(t => t.effect === 'trap_negate' || t.effect === 'trap_void');
      if(negate) return negate;
    }

    // Weaken obecně užitečný
    const weaken = traps.find(t => t.effect === 'trap_weaken');
    if(weaken) return weaken;

    return traps[0];
  },

  // ── AI: rozhodnutí o spellu ────────────────────────────────────────────────
  _aiWantsSpell(style, spells, monsters, emptyM, lpPct) {
    if(!spells.length) return null;

    const s = this._state;
    const pActive = s.pMonsters.filter(Boolean);
    const pHasSynth = pActive.some(m => m?.card?.faction === 'synth');
    const pCount = pActive.length;
    const pMaxAtk = pActive.length ? Math.max(...pActive.map(m => m.card.atk || 0)) : 0;
    const eActive = s.eMonsters.filter(Boolean);
    const eMaxAtk = eActive.length ? Math.max(...eActive.map(m => m.card.atk || 0)) : 0;
    const eHasSynth = eActive.some(m => m?.card?.faction === 'synth');
    const eHasOrganic = eActive.some(m => m?.card?.faction === 'organic');
    const corruptionLvl = GameState?.corruption?.level || 0;

    // ── Univerzální matchery (běží před style-specific větvemi) ──────────────
    // Pomocné: najdi spell, který vyhovuje globálním podmínkám
    const findMatch = (effect, cond) => cond ? spells.find(sp => sp.effect === effect) : null;

    // destroy_synth — pouze pokud hráč má synth monstrum
    const destroySynth = findMatch('destroy_synth', pHasSynth);
    // area_dmg — pokud má hráč 2+ monster na poli
    const areaDmg = findMatch('area_dmg', pCount >= 2);
    // corruption_heal — pokud je korupce > 2 a LP < 60%
    const corrHeal = findMatch('corruption_heal', corruptionLvl > 2 && lpPct < 0.6);
    // heal_pure — pokud LP < 50%
    const healPure = findMatch('heal_pure', lpPct < 0.5);
    // buff_all_synth — jen pokud AI má synth monstrum
    const buffAllSynth = findMatch('buff_all_synth', eHasSynth);
    // buff_all_organic — jen pokud AI má organic monstrum
    const buffAllOrganic = findMatch('buff_all_organic', eHasOrganic);
    // buff_all — jen pokud AI má alespoň 1 monstrum na poli
    const buffAll = findMatch('buff_all', eActive.length >= 1);
    // copy_atk — pokud AI má slabé monstrum a hráč silné
    const copyAtk = findMatch('copy_atk', eActive.length > 0 && pMaxAtk > eMaxAtk && pMaxAtk - eMaxAtk >= 300);

    // ── Nové removal/tempo efekty (univerzální — mají prioritu u všech stylů) ──
    const pHasOrganic2    = pActive.some(m => m?.card?.faction === 'organic');
    const pHasCorruption2 = pActive.some(m => m?.card?.faction === 'corruption');
    const destroyOrganic    = findMatch('destroy_organic', pHasOrganic2);
    const destroyCorruption = findMatch('destroy_corruption', pHasCorruption2);
    const destroyStrongest  = findMatch('destroy_strongest', pMaxAtk >= 1500);
    const forceDef          = findMatch('force_def', pMaxAtk >= 1200 && pMaxAtk > eMaxAtk);
    const arenaBreak        = findMatch('arena_break', !!s.activeArena);
    const buffSynergy       = findMatch('buff_synergy', eHasSynth && eHasOrganic);
    const universalPick = destroyStrongest || destroyCorruption || destroyOrganic || forceDef || arenaBreak || buffSynergy;
    if(universalPick) return universalPick;

    // Defensive/reactive — spell jen pokud nemůže hrát monstrum
    // ALE: pokud má kritický spell (destroy_synth, heal při low LP), může hrát i tak
    if(style === 'defensive' || style === 'reactive') {
      // Kritické: heal při low LP, destroy proti hrozbě, corruption_heal
      if(healPure) return healPure;
      if(corrHeal) return corrHeal;
      if(destroySynth) return destroySynth;
      if(emptyM.length > 0 && monsters.length > 0) return null;
    }

    // Strategic — kombinace: kritické spelly mají přednost
    if(style === 'strategic' || style === 'perfect') {
      // Heal při kritickém LP
      if(healPure) return healPure;
      if(corrHeal) return corrHeal;
      // Destruktivní spelly podle hrozby
      if(destroySynth) return destroySynth;
      if(areaDmg) return areaDmg;
      // Copy ATK proti silnému soupeři
      if(copyAtk) return copyAtk;
      // Buff vlastních monster
      if(buffAllSynth) return buffAllSynth;
      if(buffAllOrganic) return buffAllOrganic;
      if(buffAll) return buffAll;
      // Generic heal/buff (legacy includes-matcher)
      const healSpell = spells.find(sp => sp.effect?.includes('heal'));
      if(lpPct < 0.4 && healSpell) return healSpell;
      const buffSpell = spells.find(sp => sp.effect?.includes('buff'));
      if(emptyM.length === 0 && buffSpell) return buffSpell;
      if(monsters.length === 0) return spells[0];
      return null;
    }

    // Aggressive — buff/destroy/dmg okamžitě, heal nikdy
    if(style === 'aggressive') {
      if(destroySynth) return destroySynth;
      if(areaDmg) return areaDmg;
      if(copyAtk) return copyAtk;
      if(buffAllSynth) return buffAllSynth;
      if(buffAllOrganic) return buffAllOrganic;
      if(buffAll) return buffAll;
      return spells.find(sp => sp.effect?.includes('buff') || sp.effect?.includes('dmg')) || null;
    }

    // Corruption — corruption spelly vždy, ale i jiné kritické
    if(style === 'corruption') {
      if(corrHeal) return corrHeal;
      const corrSpell = spells.find(sp => sp.effect?.includes('corrupt') || sp.faction === 'corruption');
      if(corrSpell) return corrSpell;
      if(healPure) return healPure;
      return spells[0];
    }

    // Default (balanced, growth, accumulator, mirror, rewrite, ...) — pořadí podle priority
    if(healPure) return healPure;
    if(corrHeal) return corrHeal;
    if(destroySynth) return destroySynth;
    if(areaDmg) return areaDmg;
    if(copyAtk) return copyAtk;
    if(buffAllSynth) return buffAllSynth;
    if(buffAllOrganic) return buffAllOrganic;
    if(buffAll) return buffAll;

    return spells[0];
  },

  _aiAttack(onDone) {
    const s = this._state;
    // FÉR pravidlo: kdo začíná, nesmí v 1. tahu útočit (stejně jako hráč). Dřív AI útočila i tak.
    if(!s.canAttack){ onDone(); return; }
    const attackers=s.eMonsters.map((m,i)=>({m,i})).filter(x=>x.m&&!x.m.hasAttacked&&x.m.mode==='atk');
    if(!attackers.length){onDone();return;}
    const difficulty = this._params?.difficulty ?? GameState.settings?.difficulty ?? 0;
    const mistakeChance=[0.15,0.05,0.0][difficulty]??0.1;
    // Lethal detection: if player field is empty and total AI ATK kills player, skip mistakes
    const pFieldEmpty = !s.pMonsters.some(Boolean);
    const totalAiAtk = attackers.reduce((sum,{m}) => sum+(m.card.atk||0), 0);
    const lethal = pFieldEmpty && totalAiAtk >= s.pLP;
    let idx=0;
    const next=()=>{
      if(idx>=attackers.length||s.over){onDone();return;}
      const {m:attacker,i:atkSlot}=attackers[idx++];
      if(!s.eMonsters[atkSlot]){next();return;}
      if(!lethal && Math.random()<mistakeChance){this._log('◀ Nepřítel váhá...','hint');setTimeout(next,400);return;}
      attacker.hasAttacked=true;
      const trapSlot=s.pSpells.findIndex(sp=>sp&&sp.faceDown&&sp.card?.kind==='trap');
      if(trapSlot>=0){const r=this._activateTrap(trapSlot,atkSlot,'p');if(r==='negate'||r==='destroyed'){this._render();setTimeout(next,500);return;}if(!s.eMonsters[atkSlot]){this._render();setTimeout(next,500);return;}}
      const pM=s.pMonsters.filter(m=>m);
      if(!pM.length){
        s.pLP=clamp(s.pLP-attacker.card.atk,0,s.pMaxLP);
        this._log(`◀ PŘÍMÝ ÚTOK! [${attacker.card.name}] → ${attacker.card.atk} dmg!`,'dmg');
        EventBus.emit('sfx:play', 'direct_attack');
        this._animateLP('p',attacker.card.atk);this._checkGameOver();this._render();setTimeout(next,500);return;
      }
      const AVG=1200;
      const targets=s.pMonsters.map((m,i)=>({m,i})).filter(x=>x.m).map(t=>(!t.m.faceDown)?t:{m:{...t.m,card:{...t.m.card,atk:AVG,def:AVG}},i:t.i});
      const eAtk=attacker.card.atk;
      const winnable=targets.filter(t=>eAtk>(t.m.mode==='atk'?t.m.card.atk:t.m.card.def));
      const even=targets.filter(t=>eAtk===(t.m.mode==='atk'?t.m.card.atk:t.m.card.def));
      if(winnable.length){
        const tgt=winnable.reduce((a,b)=>(a.m.mode==='atk'?a.m.card.atk:a.m.card.def)>(b.m.mode==='atk'?b.m.card.atk:b.m.card.def)?a:b);
        this._log(`◀ [${attacker.card.name}] útočí na [${tgt.m.card.name}]!`,'warn');
        this._resolveMonsterBattle('e',atkSlot,tgt.i);
        s.aiStalemateTurns = 0;
      } else if(even.length){
        this._log(`◀ [${attacker.card.name}] útočí na [${even[0].m.card.name}]!`,'warn');
        this._resolveMonsterBattle('e',atkSlot,even[0].i);
        s.aiStalemateTurns = 0;
      } else {
        // Nemůže vyhrát žádný souboj — útočí na nejslabší nebo čeká
        const weakest = targets.reduce((a,b) => {
          const aVal = a.m.mode==='atk' ? a.m.card.atk : a.m.card.def;
          const bVal = b.m.mode==='atk' ? b.m.card.atk : b.m.card.def;
          return aVal < bVal ? a : b;
        });
        // Agresivní styly útočí i do nevýhodného souboje
        const aiStyle = this._enemy?.aiStyle || 'balanced';
        const forceAttack = ['aggressive','perfect','rewrite'].includes(aiStyle);
        // Stalemate guard — po 3 pasivních tazích AI zaútočí vždy
        const staleForce = s.aiStalemateTurns >= 3;
        if(forceAttack || staleForce) {
          if(staleForce) this._log(`◀ [${attacker.card.name}] ztrácí trpělivost!`,'warn');
          else this._log(`◀ [${attacker.card.name}] útočí na [${weakest.m.card.name}]!`,'warn');
          this._resolveMonsterBattle('e',atkSlot,weakest.i);
          s.aiStalemateTurns = 0;
        } else {
          this._log(`◀ [${attacker.card.name}] čeká.`,'warn');
          s.aiStalemateTurns++;
        }
      }
      this._render();
      // Čekej na dokončení clash animace (busy=false) pak next()
      const waitBusy = () => {
        if(s.busy) { setTimeout(waitBusy, 100); return; }
        setTimeout(next, 300);
      };
      setTimeout(waitBusy, 200);
    };
    next();
  },

  // ── GAME OVER ─────────────────────────────────────────────────────────────

  // ── PROHRA CUTSCENA (kampaň) ───────────────────────────────────────────────
  _showDefeatCutscene() {
    const s = this._state;
    const enemyName = this._params?.enemyName || 'PROTIVNÍK';

    // Overlay přes celou obrazovku
    const scene = document.createElement('div');
    scene.className = 'defeat-scene';
    scene.innerHTML = `
      <div class="ds-content">
        <div class="ds-glitch" id="ds-glitch">KONEC CYKLU</div>
        <div class="ds-sub">Poražen od: ${enemyName}</div>
        <div class="ds-msg" id="ds-msg"></div>
        <div class="ds-bar" id="ds-bar"></div>
      </div>
    `;
    document.body.appendChild(scene);

    const msgs = [
      'Systém se hroutí...',
      'Data jsou fragmentována.',
      'Cyklus se resetuje.',
      'Přepisování paměti...',
      'Nový cyklus za chvíli.'
    ];
    const msgEl = scene.querySelector('#ds-msg');
    const barEl = scene.querySelector('#ds-bar');
    const glitchEl = scene.querySelector('#ds-glitch');

    // Glitch efekt na nadpis
    let glitchInterval = setInterval(() => {
      const chars = 'KONEC CYKLU'.split('').map(ch =>
        Math.random() < 0.15 ? '▓░▒'[Math.floor(Math.random()*3)] : ch
      ).join('');
      glitchEl.textContent = chars;
    }, 80);

    // Postupné zobrazování zpráv
    let i = 0;
    const showNext = () => {
      if(i >= msgs.length) {
        clearInterval(glitchInterval);
        glitchEl.textContent = 'KONEC CYKLU';
        barEl.style.width = '100%';
        setTimeout(() => {
          scene.classList.add('ds-fade-out');
          setTimeout(() => {
            scene.remove();
            this._showResult('defeat');
            EventBus.emit('battle:ended', { won:false, nodeId: this._params?.nodeId });
          }, 800);
        }, 600);
        return;
      }
      msgEl.style.opacity = '0';
      setTimeout(() => {
        msgEl.textContent = msgs[i++];
        msgEl.style.opacity = '1';
        barEl.style.width = (i / msgs.length * 100) + '%';
        setTimeout(showNext, 900);
      }, 200);
    };

    setTimeout(showNext, 400);
  },

  _checkGameOver() {
    const s = this._state;
    if(s.over) return;

    // Prázdný deck + prázdná ruka + žádné monstrum na poli = prohra toho hráče
    const pDeckOut = s.pDeck.length===0 && s.pHand.length===0 && !s.pMonsters.some(m=>m);
    const eDeckOut = s.eDeck.length===0 && s.eHand.length===0 && !s.eMonsters.some(m=>m);

    if(pDeckOut || s.pLP<=0) {
      s.over=true; s.phase='over';
      GameState.player.lp = GameState.player.maxLp || 10000;
      // Trackuj battle scars pro přeživší karty hráče
      const survivors = (s.pMonsters||[]).filter(Boolean).map(m=>m.card?.id).filter(Boolean);
      survivors.forEach(cardId => {
        const lpSaved = s.pLP > s.pMaxLP * 0.5;
        GameState.recordCardSurvived(cardId, lpSaved);
      });
      const isFree = this._params?.mode === 'free';
      if(isFree) {
        if(this._params.enemyId) {
          try { const k='conflux_fb_'+this._params.enemyId; const r=JSON.parse(localStorage.getItem(k)||'{"w":0,"l":0}'); r.l++; localStorage.setItem(k,JSON.stringify(r)); } catch {}
        }
        this._showResult('defeat');  EventBus.emit('battle:ended', { won:false, nodeId: this._params?.nodeId });
      } else if(s.forcedLoss) {
        // forcedLoss — přeskočit cutscénu, rovnou výsledek s POKRAČOVAT tlačítkem
        this._showResult('defeat');
        EventBus.emit('battle:ended', { won:false, nodeId: this._params?.nodeId });
      } else {
        this._showDefeatCutscene();
      }
      return;
    }
    if(eDeckOut || s.eLP<=0) {
      s.over=true; s.phase='over';
      GameState.player.lp = s.pLP;
      if(this._params.enemyId&&this._params.mode!=='free') {
        GameState.setFlag?.(`unlocked_enemy_${this._params.enemyId}`);
        GameState.setFlag?.(`beaten_${this._params.enemyId}`);
      }
      if(this._params.mode==='free' && this._params.enemyId) {
        try { const k='conflux_fb_'+this._params.enemyId; const r=JSON.parse(localStorage.getItem(k)||'{"w":0,"l":0}'); r.w++; localStorage.setItem(k,JSON.stringify(r)); } catch {}
      }

      // ── Battle Scars — přežité monstra dostanou scar ──
      s.pMonsters.forEach(m => {
        if(m && m.card?.id) {
          GameState.addScar?.(m.card.id);
          const sd = GameState.getScarData?.(m.card.id);
          if(sd?.evolved) {
            this._log(`◈ [${m.card.name}] se vyvinul!`, 'fuse');
          }
        }
      });
      // Karty co přežily v ruce taky dostanou recordCardSurvived
      s.pHand.forEach(c => {
        if(c?.id) GameState.recordCardSurvived?.(c.id);
      });

      const drop = this._rollDrop();
      s.pendingDrop = drop;
      // Ulož grade do stavu pro výsledkový screen + letter logiku
      s._finalGrade = this._calcGrade(s, true);
      // Autosave po vítězství (jen kampaň, ne volný souboj)
      if(this._params.mode !== 'free') {
        // Ulož na onWin node aby se při načtení přeskočil boj, ne na battle node
        const _winNode = this._params.onWin || this._params.onVictory;
        if(_winNode) GameState.campaign.currentNode = _winNode;
        SaveManager.save(0);
        this._tryGrantLetterFragment(s._finalGrade.grade);
      }
      this._showResult('victory'); EventBus.emit('battle:ended', { won:true,  nodeId: this._params?.nodeId });
    }
  },

  // ── DROP SYSTÉM ──────────────────────────────────────────────────────────
  // Vrátí váhu karty pro drop — vyšší = častější
  // Kampaň: slabé ~60%, střední ~25%, silné ~10%, vzácné ~3-5%
  // Free:   slabé ~70%, střední ~25%, silné ~4%,  vzácné ~1%
  _cardDropWeight(card, isFree, bonuses={}) {
    // Základní váha podle rarity — vyšší = pravděpodobnější
    const gm = bonuses?._gradeMult || 1.0;
    const rarityWeights = {
      common:   isFree ? 75 : 55,
      uncommon: isFree ? 20 : 28,
      rare:     isFree ?  4 : 13,
      unique:   isFree ?  1 :  4,
    };
    let w = rarityWeights[card.rarity || 'common'] || 30;

    // Tematická karta nepřítele — +20% bonus
    if(card.thematicDrop && this._enemy?.thematicCardId === card.id) w *= 1.2;

    // Styl bonusy
    if(bonuses.noLpLost && (card.rarity==='rare'||card.rarity==='unique'))    w *= 1.15;
    if(bonuses.lpHigh)                                                          w *= 1.10;
    if(bonuses.fusionKillingBlow && card.fusionRecipe)                         w *= 1.25;
    if(bonuses.noSpellsUsed && card.kind==='monster')                          w *= 1.10;

    return Math.max(w * gm, 0.1);
  },

  _rollDrop() {
    const s = this._state;
    const isFree = this._params?.mode === 'free';

    // ── PRAVIDLO: hráč může získat JEN karty které měl nepřítel ──
    // Sesbíráme všechny karty které nepřítel měl v decku během boje
    const seen = new Set();
    let candidates = [
      ...(s.eGY||[]),
      ...(s.eDeck||[]),
      ...(s.eHand||[]),
      ...(s.eMonsters||[]).filter(Boolean).map(m=>m.card),
      ...(s.eSpells||[]).filter(Boolean).map(sp=>sp.card),
    ]
    .filter(c => {
      if(!c?.id || c.special) return false;      // žádné speciální příběhové karty
      if(isFree && c.corruptionValue) return false; // free battle bez corruption
      if(seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .map(c => getCard(c.id) || c)  // načti plná data z GameState
    .filter(c => c && c.kind);

    if(!candidates.length) return null;  // nepřítel neměl žádné získatelné karty

    // ── Rarity vážení ──
    // Lepší karta = menší pravděpodobnost
    // Bonus za styl hry se aplikuje na váhy
    // Grade bonus — S/A zvýší váhu vzácnějších karet
    const gradeMultiplier = { S: 2.5, A: 1.8, B: 1.2, C: 1.0, D: 0.7, F: 0.5 };
    const grade = s._finalGrade?.grade || 'B';
    const gradeMult = gradeMultiplier[grade] || 1.0;
    const styleBonuses = this._calcStyleBonuses(s);
    styleBonuses._gradeMult = gradeMult;
    const weights = candidates.map(c => this._cardDropWeight(c, isFree, styleBonuses));
    const total = weights.reduce((a,b)=>a+b, 0);
    if(total <= 0) return candidates[0];

    let rand = Math.random() * total;
    for(let i=0; i<candidates.length; i++) {
      rand -= weights[i];
      if(rand <= 0) return candidates[i];
    }
    return candidates[candidates.length-1];
  },

  // Výpočet bonusů za styl hry (ovlivňují drop váhy)
  _calcStyleBonuses(s) {
    const st = s.stats || {};
    return {
      noLpLost:         s.pLP >= s.pMaxLP,                    // žádná ztráta LP
      lpHigh:           s.pLP / s.pMaxLP >= 0.6,              // LP nad 60%
      fusionKillingBlow: st.lastKillWasFusion === true,        // fúze jako poslední úder
      noSpellsUsed:     (st.spellsUsed || 0) === 0,           // bez kouzel
    };
  },

  _grantDrop(card) {
    if(!card) return;
    if(!GameState.player.collection?.length) {
      const starterIds = GameState.buildStarterDeck?.() || [];
      GameState.player.collection = starterIds.length
        ? [...starterIds]
        : [...(GameState.player.deck || [])];
    }
    GameState.player.collection.push(card.id);
    // Sleduj dropy v tomto boji — _showResult je pak může vykreslit
    if(this._state) {
      this._state._droppedCards = this._state._droppedCards || [];
      this._state._droppedCards.push(card);
    }
    console.log('[Battle] Drop: karta', card.id, card.name, '| Kolekce má', GameState.player.collection.length, 'karet');
    // Autosave kolekce — aby drop přežil refresh
    try { SaveManager.save(0); } catch(e) { console.warn('[Battle] Autosave po dropu selhal:', e); }
    EventBus.emit('story:cardReceived', {cardId:card.id});
  },

  // ── MONYRA LETTER FRAGMENT — jen kampaň, jen S/A ─────────────────────────
  _tryGrantLetterFragment(grade) {
    if(grade !== 'S' && grade !== 'A') return;
    // Kolik fragmentů má hráč (ID 801–805)
    const col = GameState.player?.collection || [];
    const owned = [801,802,803,804,805].filter(id => col.includes(id));
    if(owned.length >= 5) return; // všechny fragmenty už má

    // Zjisti next fragment (801 → 802 → ... → 805 v pořadí)
    const next = [801,802,803,804,805].find(id => !col.includes(id));
    if(!next) return;

    col.push(next);
    GameState.setFlag?.(`monyra_fragment_${next - 800}`);
    EventBus.emit('story:cardReceived', { cardId: next });
    this._state._pendingLetterFragment = next;
  },

  // ── CONFLUX GRADING v2 ──────────────────────────────────────────────────
  // Odměňuje fúze, mastery, risk. Nepenalizuje spelly.
  _calcGrade(s, isVictory) {
    const st = s.stats || {};
    const turns = st.turns || 0;
    const fusions = st.fusionsUsed || 0;
    const skills = st.spellsUsed || 0;
    const lpPct = s.pLP / (s.pMaxLP || 10000);
    const dmgDealt = st.damageDealt || 0;
    const dmgTaken = st.damageTaken || 0;
    const cardsPlayed = st.cardsPlayed || 0;

    // ── BRUTE SCORE — síla, rychlost, dominance ──────────────────────────
    let brute = 40;
    const bruteB = [];
    if(turns <= 6)       { brute += 20; bruteB.push(`+20 blitz (${turns}t)`); }
    else if(turns <= 12) { brute += 10; bruteB.push(`+10 rychle (${turns}t)`); }
    else if(turns > 25)  { brute -= 10; bruteB.push(`-10 pomalu (${turns}t)`); }
    if(dmgDealt > 15000) { brute += 15; bruteB.push('+15 devastace'); }
    else if(dmgDealt > 8000) { brute += 8; bruteB.push('+8 silny dmg'); }
    if(lpPct >= 0.8)     { brute += 10; bruteB.push('+10 dominance'); }
    if(fusions > 3)      { brute -= 8; bruteB.push('-8 prilis fuzi'); }
    else if(fusions <= 1){ brute += 5; bruteB.push('+5 cista sila'); }
    if(!isVictory)       { brute -= 30; bruteB.push('-30 prohra'); }

    // ── FINESSE SCORE — technika, efektivita, styl ───────────────────────
    let finesse = 40;
    const finesseB = [];
    if(fusions >= 1 && fusions <= 2) { finesse += 15; finesseB.push(`+15 presna fuze (${fusions}x)`); }
    else if(fusions === 3)           { finesse += 10; finesseB.push(`+10 fuze (${fusions}x)`); }
    else if(fusions > 3)             { finesse -= 5;  finesseB.push(`-5 prilis fuzi`); }
    else                             { finesse -= 5;  finesseB.push('-5 zadna fuze'); }
    if(skills >= 2)       { finesse += 8; finesseB.push(`+8 spell mastery (${skills}x)`); }
    if(dmgTaken < s.pMaxLP * 0.2 && isVictory) { finesse += 12; finesseB.push('+12 minimalni ztraty'); }
    if(isVictory && dmgTaken > s.pMaxLP * 0.6) { finesse += 10; finesseB.push('+10 comeback'); }
    if(turns > 15 && isVictory) { finesse += 5; finesseB.push('+5 trpelivost'); }
    if(!isVictory)        { finesse -= 25; finesseB.push('-25 prohra'); }

    // Deckout victory = automaticky Finesse S
    if(s._deckoutVictory) {
      return { grade:'S', color:'#c8a040', label:'DECKOUT VICTORY', score:100, breakdown:['Neprittel vycerpal deck'], style:'finesse' };
    }

    brute = clamp(brute, 0, 100);
    finesse = clamp(finesse, 0, 100);

    // Vyber lepší styl
    const style = brute >= finesse ? 'brute' : 'finesse';
    const score = Math.max(brute, finesse);
    const breakdown = style === 'brute' ? bruteB : finesseB;

    const gradeLabel = (sc, st) => {
      const prefix = st === 'brute' ? 'BRUTE' : 'FINESSE';
      if(sc >= 80) return { grade:'S', color:'#c8a040', label:`${prefix} — DOKONALE` };
      if(sc >= 65) return { grade:'A', color:'#50e0b8', label:`${prefix} — EFEKTIVNI` };
      if(sc >= 48) return { grade:'B', color:'#4fa3e0', label:`${prefix} — SOLIDNI` };
      if(sc >= 32) return { grade:'C', color:'#c8d6e5', label:`${prefix} — PRUMERNE` };
      if(sc >= 15) return { grade:'D', color:'#e04f6a', label:`${prefix} — SLABE` };
      return              { grade:'F', color:'#9b59b6', label:`${prefix} — SELHANI` };
    };

    const result = gradeLabel(score, style);
    result.score = score;
    result.breakdown = breakdown;
    result.style = style;
    result.bruteScore = brute;
    result.finesseScore = finesse;
    return result;
  },


  // ── PAUZA ─────────────────────────────────────────────────────────────────
  _showPause() {
    const s = this._state;
    if(s.over) return;
    const isFree = this._params?.mode === 'free';

    const overlay = document.createElement('div');
    overlay.id = 'pause-overlay';
    overlay.className = 'pause-overlay';
    overlay.innerHTML = `
      <div class="pause-panel">
        <div class="pause-title">⏸ PAUZA</div>
        <div class="pause-info">${isFree ? 'FREE BATTLE' : 'KAMPAŇ'} · TAH ${s.turnNumber}</div>
        <div class="pause-actions">
          <button class="pause-btn-action pause-resume" id="pause-resume">▶ POKRAČOVAT</button>
          <button class="pause-btn-action pause-menu" id="pause-menu">← HLAVNÍ MENU</button>
        </div>
      </div>
    `;

    const close = () => overlay.remove();

    overlay.querySelector('#pause-resume').addEventListener('click', close);



    overlay.querySelector('#pause-menu').addEventListener('click', () => {
      close();
      this._confirmAction(
        isFree
          ? 'Opustit Free Battle a vrátit se do menu?'
          : 'Vrátit se do hlavního menu?\nProgress od posledního save bude ztracen.',
        () => {
          s.over = true;
          if(isFree) {
            typeof Router !== 'undefined' ? Router.goto('menu') : EventBus.emit('battle:end',{result:'menu'});
          } else {
            Router._transitioning = false;
            EventBus.emit('battle:end', { result:'menu', nodeId: this._params.storyNodeId });
            Router.goto('menu');
          }
        }
      );
    });

    this._container.appendChild(overlay);
  },

  // Jednoduchý confirm dialog
  _confirmAction(message, onConfirm) {
    const existing = this._container.querySelector('#confirm-overlay');
    if(existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'confirm-overlay';
    overlay.className = 'pause-overlay';
    overlay.innerHTML = `
      <div class="pause-panel">
        <div class="pause-confirm-msg">${message.replace(/\n/g,'<br>')}</div>
        <div class="pause-actions">
          <button class="pause-btn-action pause-resume" id="confirm-yes">✓ ANO</button>
          <button class="pause-btn-action pause-menu" id="confirm-no">✕ NE</button>
        </div>
      </div>
    `;
    overlay.querySelector('#confirm-yes').addEventListener('click', () => { overlay.remove(); onConfirm(); });
    overlay.querySelector('#confirm-no').addEventListener('click', () => overlay.remove());
    this._container.appendChild(overlay);
  },

  _showResult(result) {
    const s = this._state;
    const isVictory = result==='victory';

    // Tutorial: závěrečná Monyřina replika
    if(this._isTutorial() && !this['_tut_tutorial_end']) {
      this._checkTutorial('tutorial_end', () => this._showResult(result));
      return;
    }

    const isCampaign = this._params.mode!=='free';
    const cp = isCampaign && GameState.checkpoint?.exists ? GameState.checkpoint.nodeId : null;
    const st = s.stats||{};
    const grade = this._calcGrade(s, isVictory);

    let overlay = document.getElementById('battle-overlay');
    if(!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'battle-overlay';
      overlay.className = 'battle-overlay';
      document.body.appendChild(overlay);
    }

    const navigate = () => {
      // Odstraň všechny overlaye
      document.getElementById('battle-overlay')?.remove();
      document.querySelectorAll('.battle-overlay,.sap-overlay,.card-preview-overlay,.swap-picker-overlay,.field-swap-picker').forEach(el=>el.remove());
      // Force reset transitioning — zabráni zaseknutí Routeru
      Router._transitioning = false;
      Router._transitionStart = 0;
      if(this._params.mode==='free') {
        Router.goto('menu');
      } else {
        const nextNode = result === 'victory'
          ? (this._params.onWin || this._params.onVictory || this._params.storyNodeId)
          : (this._params.onLose || this._params.onDefeat  || this._params.storyNodeId);
        console.log('[BattleSystem] navigate →', nextNode, '| result:', result, '| onWin:', this._params.onWin, '| onLose:', this._params.onLose);
        EventBus.emit('battle:end',{result,nodeId:this._params.storyNodeId,onDefeat:this._params.onDefeat,onVictory:this._params.onVictory});
        if(nextNode) {
          setTimeout(() => {
            Router._transitioning = false;
            Router.goto('story', { nodeId: nextNode });
          }, 300);
        } else {
          console.warn('[BattleSystem] navigate: nextNode chybí! params:', JSON.stringify(this._params));
          setTimeout(() => Router.goto('menu'), 300);
        }
      }
    };

    const letterFragment = s._pendingLetterFragment || null;
    const drop = s.pendingDrop;
    const fc = drop ? factionColor(drop.faction) : '#4fa3e0';
    const rarity = drop ? rarityFor(drop) : null;
    const copiesBefore = drop ? (GameState.player.collection||[]).filter(id=>id===drop.id||id===parseInt(drop.id)).length : 0;
    // Karetní styly pro vykreslení dropu jako reálné karty
    if(drop) injectCardStyles();

    // Drop vždy padne — přidáme do kolekce
    if(drop) this._grantDrop(drop);
    const copiesAfter = drop ? copiesBefore + 1 : 0;
    const copyLabel = drop ? (copiesBefore === 0 ? '✓ Nová karta!' : `✓ Přidáno (${copiesAfter}. kopie)`) : '';
    const headerText  = isVictory ? 'VÍTĚZSTVÍ' : 'PORÁŽKA';
    EventBus.emit('sfx:play', isVictory ? 'victory' : 'defeat');
    const headerColor = isVictory ? '#4fa3e0' : '#e04f6a';
    const reasonText  = isVictory
      ? (s.eLP<=0 ? 'Nepřítel přišel o všechny LP.' : 'Nepříteli došly karty.')
      : (s.pLP<=0 ? 'Přišel jsi o všechny LP.' : 'Došly ti karty.');
    const lpPct  = Math.round((s.pLP/s.pMaxLP)*100);
    const elpPct = Math.round((s.eLP/s.eMaxLP)*100);

    // Grant již proběhl výše
    overlay.innerHTML = `
      <div class="ov-phase" id="ov-stats-phase">
        <div class="ov-result-header" style="color:${headerColor}">${headerText}</div>
        <div class="ov-reason">${reasonText}</div>
        <div class="ov-grade-block">
          <div class="ov-grade" style="color:${grade.color};text-shadow:0 0 24px ${grade.color}">${grade.grade}</div>
          <div class="ov-grade-label" style="color:${grade.color}">${grade.label}</div>
          <div class="ov-grade-breakdown">${(grade.breakdown||[]).map(b =>
            `<span class="ov-gb-item" style="color:${b.startsWith('+')?'#50e0b8':'#e04f6a'}">${b}</span>`
          ).join('')}</div>
        </div>
        <div class="ov-stats">
          <div class="ov-stat"><span class="ov-stat-label">TVOJE LP</span><span class="ov-stat-val" style="color:${lpPct>50?'#50e0b8':lpPct>25?'#c8a84b':'#e04f6a'}">${s.pLP} <span class="ov-stat-pct">(${lpPct}%)</span></span></div>
          <div class="ov-stat"><span class="ov-stat-label">LP NEPŘÍTELE</span><span class="ov-stat-val" style="color:${elpPct>50?'#e04f6a':elpPct>25?'#c8a84b':'#50e0b8'}">${s.eLP} <span class="ov-stat-pct">(${elpPct}%)</span></span></div>
          <div class="ov-stat"><span class="ov-stat-label">TAHY</span><span class="ov-stat-val">${st.turns||0}</span></div>
          <div class="ov-stat"><span class="ov-stat-label">DMG ZPŮSOBEN</span><span class="ov-stat-val">${st.damageDealt||0}</span></div>
          <div class="ov-stat"><span class="ov-stat-label">DMG OBDRŽEN</span><span class="ov-stat-val">${st.damageTaken||0}</span></div>
          <div class="ov-stat"><span class="ov-stat-label">KARTY ZAHRÁNY</span><span class="ov-stat-val">${st.cardsPlayed||0}</span></div>
          ${st.fusionsUsed ? `<div class="ov-stat"><span class="ov-stat-label">FÚZE</span><span class="ov-stat-val" style="color:#50e0b8">${st.fusionsUsed}</span></div>` : ''}
          ${st.spellsUsed  ? `<div class="ov-stat"><span class="ov-stat-label">SKILLS</span><span class="ov-stat-val">${st.spellsUsed}</span></div>` : ''}
        </div>

        ${isVictory && letterFragment && this._params?.mode !== 'free' ? `
        <div class="ov-letter-fragment">
          <div class="ov-letter-icon">✉</div>
          <div class="ov-letter-text">
            <div class="ov-letter-title">Fragment dopisu od Monyry</div>
            <div class="ov-letter-sub">Přidán do kolekce — chraň ho.</div>
          </div>
        </div>` : ''}
        ${isVictory && drop ? `
        <div class="ov-drop-inline">
          <div class="ov-drop-inline-label">▼ KARTA ZÍSKÁNA</div>
          <div class="ov-drop-inline-card" style="--fc:${fc}">
            <div class="ov-drop-inline-left">
              ${_rcEl(drop, 'sm')}
            </div>
            <div class="ov-drop-inline-right">
              <div class="ov-drop-inline-rarity" style="color:${rarity?.color}">${rarity?.label}</div>
              <div class="ov-drop-inline-name">${drop.name}</div>
              <div class="ov-drop-inline-faction" style="color:${fc}">${factionLabel(drop.faction)}</div>
              ${drop.kind==='monster' ? `<div class="ov-drop-inline-stats">⚔ ${drop.atk}  🛡 ${drop.def}</div>` : `<div class="ov-drop-inline-stats">${drop.desc||''}</div>`}
              <div class="ov-drop-inline-status" style="color:${copiesBefore===0?'#50e0b8':'#c8a84b'}">${copyLabel}</div>
            </div>
          </div>
        </div>` : ''}

        <div class="ov-actions">
          ${(isVictory || this._params.forcedLoss) ? `<button class="ov-btn ov-btn-continue" id="ov-next">▶ POKRAČOVAT</button>` : ''}
          ${(isVictory || this._params.forcedLoss) ? `<button class="ov-btn ov-btn-menu" id="ov-menu">← MENU</button>` : `<div class="ov-auto-menu" id="ov-auto-msg">→ menu za 3…</div>`}
        </div>
      </div>
    `;

    overlay.style.color = isVictory ? '#4fa3e0' : '#e04f6a';
    overlay.classList.add('show');

    overlay.querySelector('#ov-next')?.addEventListener('click', navigate);
    overlay.querySelector('#ov-menu')?.addEventListener('click', ()=>{
      document.getElementById('battle-overlay')?.remove();
      Router._transitioning = false;
      setTimeout(()=>Router.goto('menu'), 50);
    });

    // Regular defeat — auto-redirect to menu with countdown
    if(!isVictory && !this._params.forcedLoss) {
      let secs = 3;
      const msgEl = overlay.querySelector('#ov-auto-msg');
      const tick = setInterval(() => {
        secs--;
        if(msgEl) msgEl.textContent = secs > 0 ? `→ menu za ${secs}…` : '→ menu';
        if(secs <= 0) {
          clearInterval(tick);
          document.getElementById('battle-overlay')?.remove();
          Router._transitioning = false;
          Router.goto('menu');
        }
      }, 1000);
    }
  },

  // Picker: Použít hned × Uložit na pole
  _showSpellActionPicker(handIdx, card) {
    const s = this._state;
    const isTrap  = card.kind === 'trap';
    const isArena = card.kind === 'arena';

    // Trap — vždy rovnou na slot lícem dolů, bez pickeru
    if(isTrap) {
      if(s.cardPlayedThisTurn) { this._log('Už jsi zahral kartu v tomto tahu.','warn'); s.selectedHandIdx=null; this._render(); return; }
      const slot = s.pSpells.findIndex(m => m === null);
      if(slot < 0) { this._log('Žádný volný slot pro past!', 'warn'); s.selectedHandIdx = null; this._render(); return; }
      s.pHand.splice(handIdx, 1);
      s.pSpells[slot] = { card: {...card}, faceDown: true, used: false };
      s.cardPlayedThisTurn = true; s.selectedHandIdx = null;
      this._log(`🪤 [${card.name}] nastavena lícem dolů.`, 'warn');
      this._render();
      return;
    }

    // Arena — pokládá se face-down, NEAKTIVUJE se hned. Hráč ji aktivuje klikem.
    if(isArena) {
      if(s.cardPlayedThisTurn) { this._log('Už jsi zahral kartu v tomto tahu.','warn'); s.selectedHandIdx=null; this._render(); return; }
      const slot = s.pSpells.findIndex(m => m === null);
      if(slot < 0) { this._log('Žádný volný slot pro arenu!', 'warn'); s.selectedHandIdx = null; this._render(); return; }
      s.pHand.splice(handIdx, 1);
      s.pSpells[slot] = { card: {...card}, faceDown: true, used: false };
      s.cardPlayedThisTurn = true; s.selectedHandIdx = null;
      this._log(`🏟 [${card.name}] nastavena lícem dolů — klikni pro aktivaci.`, 'warn');
      this._render();
      return;
    }

    // Spell — rozhodni podle typu efektu:
    //   - noTarget (single-use bez cíle)            → aktivuj okamžitě, bez popup
    //   - needsMyMonster / needsEneMonster (target) → přeskoč popup, rovnou target picker
    //   - jinak (buff/heal který může být uložen)   → zobraz popup s volbou
    const noTarget        = ['buff_all_organic','buff_all','buff_all_synth','area_dmg','corruption_heal','heal_pure','corrupt_debuff','destroy_strongest','arena_break','buff_synergy'].includes(card.effect);
    const needsMyMonster  = ['buff_atk','buff_atk_cost','heal_buff','heal_dual','copy_atk'].includes(card.effect);
    const needsEneMonster = ['destroy_synth','destroy_organic','destroy_corruption','force_def'].includes(card.effect);

    if(noTarget || needsMyMonster || needsEneMonster) {
      // Přímá aktivace přes existující target picker (zvládne i case noTarget = aktivuje rovnou)
      this._showSpellTargetPicker(handIdx, card, null);
      return;
    }

    // Spell který nemá zafixovaný efekt — zobraz popup s volbou (Použít hned / Uložit na pole)
    const pop = document.createElement('div');
    pop.className = 'sap-overlay';
    pop.innerHTML = `
      <div class="sap-panel">
        <div class="sap-emoji">${card.emoji}</div>
        <div class="sap-name">${card.name}</div>
        <div class="sap-kind">${kindLabel(card.kind)} · ${factionLabel(card.faction)}</div>
        <div class="sap-desc">${card.desc || ''}</div>
        <div class="sap-actions">
          <button class="sap-btn sap-btn--use" id="sap-use">▶ Použít hned</button>
          <button class="sap-btn sap-btn--save" id="sap-save">◈ Uložit na pole</button>
          <button class="sap-btn sap-btn--cancel" id="sap-cancel">✕ Zpět</button>
        </div>
      </div>`;
    this._container.appendChild(pop);

    // Použít hned — spustí target picker nebo přímou aktivaci
    pop.querySelector('#sap-use').addEventListener('click', () => {
      pop.remove();
      this._showSpellTargetPicker(handIdx, card, null);
    });

    // Uložit na pole — vloží na slot lícem nahoru
    pop.querySelector('#sap-save').addEventListener('click', () => {
      pop.remove();
      const slot = s.pSpells.findIndex(m => m === null);
      if(slot < 0) { this._log('Žádný volný slot!', 'warn'); s.selectedHandIdx = null; this._render(); return; }
      s.pHand.splice(handIdx, 1);
      s.pSpells[slot] = { card: {...card}, faceDown: false, used: false };
      s.selectedHandIdx = null;
      this._log(`[${card.name}] uložen na pole.`, 'sys');
      this._render();
    });

    pop.querySelector('#sap-cancel').addEventListener('click', () => {
      pop.remove(); s.selectedHandIdx = null; this._render();
    });
  },

  _showSpellTargetPickerAfterPopup(handIdx, card, parentPopup) {
    // Wrapper - zavře parent popup po výběru cíle
    const origPicker = this._showSpellTargetPicker.bind(this);
    // Přidej picker přímo do body místo b-field
    const s = this._state;
    const needsMyMonster  = ['buff_atk','buff_atk_cost','heal_buff','heal_dual','copy_atk'].includes(card.effect);
    const needsEneMonster = ['destroy_synth','destroy_organic','destroy_corruption','force_def'].includes(card.effect);
    const noTarget        = ['buff_all_organic','buff_all','buff_all_synth','area_dmg','corruption_heal','heal_pure','corrupt_debuff','destroy_strongest','arena_break','buff_synergy'].includes(card.effect);

    const doActivate = (targetSlot) => {
      if(parentPopup) parentPopup.remove();
      s.pHand.splice(handIdx, 1);
      s.selectedHandIdx = null;
      if(targetSlot != null) this._activateSpellTargeted(card, 'p', targetSlot, needsMyMonster);
      else this._activateSpell(card, 'p');
      s.pGY.push(card);
      this._render();
    };

    if(noTarget || (!needsMyMonster && !needsEneMonster)) { doActivate(null); return; }

    const myM  = s.pMonsters.map((m,i)=>m?{m,i}:null).filter(Boolean);
    const eneM = s.eMonsters.map((m,i)=>m?{m,i}:null).filter(Boolean);
    const targets = needsMyMonster ? myM : eneM;

    if(!targets.length) { doActivate(null); return; }

    const fc = factionColor(card.faction);
    const pop = document.createElement('div');
    pop.className = 'sap-overlay';
    pop.innerHTML = `
      <div class="sap-panel">
        <div class="sap-emoji">${card.emoji||'✨'}</div>
        <div class="sap-name" style="color:${fc}">${card.name}</div>
        <div class="sap-kind">${needsMyMonster ? 'Vyber své monstrum:' : 'Vyber cíl:'}</div>
        <div class="sap-actions">
          ${targets.map(t=>`<button class="sap-btn sap-btn--use stp-target" data-slot="${t.i}">
            ${t.m.card.emoji||'?'} ${t.m.card.name}
            <span style="color:var(--dim);font-size:10px;margin-left:8px">⚔${t.m.card.atk} 🛡${t.m.card.def}</span>
          </button>`).join('')}
          <button class="sap-btn sap-btn--cancel" id="stp-cancel2">✕ Zrušit</button>
        </div>
      </div>`;
    document.body.appendChild(pop);

    pop.querySelectorAll('.stp-target').forEach(btn => {
      btn.addEventListener('click', () => { pop.remove(); doActivate(parseInt(btn.dataset.slot)); });
    });
    pop.querySelector('#stp-cancel2')?.addEventListener('click', () => {
      pop.remove();
      if(parentPopup) parentPopup.remove();
      s.selectedHandIdx = null; this._render();
    });
  },

  _showSpellTargetPicker(handIdx, card, fieldSlotIdx) {
    const s = this._state;
    const fromField = fieldSlotIdx != null;

    // Zavři starý picker pokud existuje
    document.getElementById('spell-target-popup')?.remove();

    // Efekty které NEPOTŘEBUJÍ cíl — aktivuj rovnou
    const noTarget = [
      'buff_all_organic','buff_all_synth','buff_all',
      'area_dmg','heal_pure','heal_dual','heal_buff',
      'corruption_heal','corrupt_debuff',
      'buff_atk','buff_atk_cost',   // fallback bez cíle je v _activateSpell
      'destroy_strongest','arena_break','buff_synergy',
      'arena_buff_atk','arena_buff_def','arena_buff_all',
      'arena_draw','arena_heal','arena_mirror','arena_entropy','arena_corrupt',
    ].includes(card.effect);

    // Efekty které potřebují výběr cíle
    const needsMyMonster  = ['copy_atk'].includes(card.effect);
    const needsEneMonster = ['destroy_synth','destroy_organic','destroy_corruption','force_def'].includes(card.effect);

    const doActivate = (targetSlot) => {
      // Odeber kartu ze zdroje
      if(fromField) {
        this._animateCard('p', fieldSlotIdx, 'activate', true);
        const sp = s.pSpells[fieldSlotIdx];
        if(sp) { s.pGY.push({...sp.card}); s.pSpells[fieldSlotIdx] = null; }
      } else {
        const played = s.pHand.splice(handIdx, 1)[0];
        if(played) s.pGY.push({...played});
        s.selectedHandIdx = null;
      }
      // Aktivuj
      if(targetSlot != null) {
        this._activateSpellTargeted(card, 'p', targetSlot, needsMyMonster);
      } else {
        this._activateSpell(card, 'p');
      }
      s.phase = s.canAttack ? 'battle' : 'main';
      this._render();
    };

    // Žádný cíl potřeba — rovnou aktivuj
    if(noTarget || (!needsMyMonster && !needsEneMonster)) {
      doActivate(null);
      return;
    }

    const myM  = s.pMonsters.map((m,i) => m ? {m,i} : null).filter(Boolean);
    const eneM = s.eMonsters.map((m,i) => m ? {m,i} : null).filter(Boolean);
    // Frakční destroy → nabídni jen validní cíle
    const factionNeed = {destroy_synth:'synth', destroy_organic:'organic', destroy_corruption:'corruption'}[card.effect];
    const targetsAll = needsMyMonster ? myM : eneM;
    const targets = factionNeed ? targetsAll.filter(t => t.m.card.faction === factionNeed) : targetsAll;

    // Žádný dostupný cíl — fallback bez cíle
    if(!targets.length) {
      this._log(`✨ [${card.name}] — žádný cíl na poli.`, 'warn');
      doActivate(null);
      return;
    }

    // Zobraz target picker — fixně centrovaný přes body
    const fc = factionColor(card.faction);
    const pop = document.createElement('div');
    pop.id = 'spell-target-popup';
    pop.className = 'sap-overlay';
    pop.innerHTML = `
      <div class="sap-panel">
        <div class="sap-emoji">${card.emoji}</div>
        <div class="sap-name" style="color:${fc}">${card.name}</div>
        <div class="sap-kind">${needsMyMonster ? 'Vyber své monstrum:' : 'Vyber cíl nepřítele:'}</div>
        <div class="sap-actions">
          ${targets.map(t => `
            <button class="sap-btn sap-btn--use stp-target" data-slot="${t.i}">
              ${t.m.card.emoji} ${t.m.card.name}
              <span style="color:var(--dim);font-size:10px;margin-left:8px">⚔${t.m.card.atk} 🛡${t.m.card.def}</span>
            </button>`).join('')}
          <button class="sap-btn sap-btn--cancel" id="stp-cancel">✕ Zrušit</button>
        </div>
      </div>`;
    document.body.appendChild(pop);

    pop.querySelectorAll('.stp-target').forEach(btn => {
      btn.addEventListener('click', () => {
        pop.remove();
        doActivate(parseInt(btn.dataset.slot));
      });
    });
    pop.querySelector('#stp-cancel')?.addEventListener('click', () => {
      pop.remove();
      s.selectedHandIdx = null;
      this._render();
    });
  },

  _activateSpellTargeted(card, who, targetSlot, isMyMonster) {
    const s = this._state;
    const myM=who==='p'?s.pMonsters:s.eMonsters;
    const oppM=who==='p'?s.eMonsters:s.pMonsters;
    const target=isMyMonster?myM[targetSlot]:oppM[targetSlot];
    if(!target){this._log('Cíl zmizel!','warn');return;}
    switch(card.effect) {
      case 'buff_atk':      target.card.atk+=card.value;this._log(`⚡ +${card.value} ATK → [${target.card.name}]`,'sys');break;
      case 'buff_atk_cost': target.card.atk+=card.value;if(who==='p')s.pLP=clamp(s.pLP-400,0,s.pMaxLP);this._log(`⚡ +${card.value} ATK (cena 400 LP)`,'sys');break;
      case 'heal_buff':     target.card.atk+=card.value;if(who==='p')s.pLP=clamp(s.pLP+500,0,s.pMaxLP);this._log(`💚 +${card.value} ATK + 500 LP → [${target.card.name}]`,'organic');break;
      case 'destroy_synth': (who==='p'?s.eGY:s.pGY).push(target.card);oppM[targetSlot]=null;this._log(`💻 [${target.card.name}] zničen!`,'sys');this._checkGameOver();break;
      case 'copy_atk':      { const srcAtk=target.card.atk; const t2=myM.find(m=>m); if(t2){t2.card.atk=srcAtk;this._log(`🪞 ATK ${srcAtk} zkopírován.`,'fuse');} break; }
      case 'destroy_organic':
      case 'destroy_corruption': {
        const need = card.effect==='destroy_organic' ? 'organic' : 'corruption';
        if(target.card.faction===need) { (who==='p'?s.eGY:s.pGY).push(target.card); oppM[targetSlot]=null; this._log(`${need==='organic'?'🪓':'📡'} [${target.card.name}] zničen!`,'sys'); this._checkGameOver(); }
        else this._activateSpell(card, who); // špatný cíl → auto (první validní)
        break;
      }
      case 'force_def': { target.mode='def'; target.card.atk=Math.max(0,(target.card.atk||0)-card.value); this._log(`🔄 [${target.card.name}] přepnut do DEF, -${card.value} ATK.`,'sys'); break; }
      default: this._activateSpell(card, who); break;
    }
  },

  // ── PLACE POPUP — postoj + afinita + face-down (FM mechaniká) ───────────────
  _showPlacePopup(handIdx, slot) {
    const s=this._state;
    this._container.querySelector('#place-popup')?.remove();
    const card = s.pHand[handIdx];
    if(!card) return;

    const pop=document.createElement('div');
    pop.id='place-popup'; pop.className='sap-overlay';
    pop.innerHTML=`
      <div class="sap-panel">
        <div class="sap-emoji">${card.emoji||'?'}</div>
        <div class="sap-name">${card.name}</div>
        <div class="sap-kind">POSTAV MONSTRUM · vždy face-down</div>
        <div class="sap-actions">
          <button class="sap-btn sap-btn--use" data-stance="atk">⚔ ÚTOK</button>
          <button class="sap-btn sap-btn--use" data-stance="def">🛡 OBRANA</button>
          <button class="sap-btn sap-btn--cancel" id="pp-cancel">✕ Zrušit</button>
        </div>
      </div>`;
    document.body.appendChild(pop);

    pop.querySelectorAll('[data-stance]').forEach(btn => {
      btn.addEventListener('click', () => {
        pop.remove();
        this._playerPlayCard(handIdx, slot, { stance: btn.dataset.stance, faceDown: true });
      });
    });
    pop.querySelector('#pp-cancel').addEventListener('click',()=>{pop.remove();s.selectedHandIdx=null;this._render();});
  },

  // ── LOG ──────────────────────────────────────────────────────────────────
  _log(msg, cls='') {
    if(!this._state) return;
    this._state.log.push({msg, cls, ts: Date.now()});
    if(this._state.log.length > 80) this._state.log.shift();

    // Přeskoč oddělovače tahů — netlačme toast při každém tahu
    if(msg.startsWith('─')) return;

    const toastEl = document.getElementById('toast');
    if(!toastEl) return;

    // Barva podle třídy zprávy
    const colors = {
      warn:    'var(--gold)',
      hint:    'var(--hybrid)',
      sys:     'rgba(79,163,224,0.7)',
      entropy: 'var(--corruption)',
    };
    toastEl.textContent = msg;
    toastEl.style.color = colors[cls] || colors.sys;
    toastEl.classList.add('on');

    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toastEl.classList.remove('on');
    }, 2200);
  },

  // ── In-battle lore (nevtíravé titulky) ──
  // enemies.js: barks: { start:[{speaker,text}], midfight:[...], lowHP:[...] }
  _maybeBark(trigger) {
    // Profilující nepřítel: v průběhu boje hodí repliku z TVÉHO reálného playstyle
    // ("systém tě zná a hraje tebou"). Jednou za boj, ta nejsilnější věc co o tobě ví.
    if(trigger === 'midfight' && this._enemy?.profiler && !this._profileBarkFired) {
      const obs = (GameState.profileBarks && GameState.profileBarks()) || [];
      if(obs.length) {
        this._profileBarkFired = true;
        this._bark(this._enemy.portrait || this._enemy.id || '', obs[0]);
      }
    }
    const arr = this._enemy?.barks?.[trigger];
    if(!arr || !arr.length) return;
    this._barkState = this._barkState || { fired:{}, idx:{} };
    if(trigger === 'midfight') {
      const i = this._barkState.idx.midfight || 0;
      if(i >= arr.length) return;
      this._barkState.idx.midfight = i + 1;
      const b = arr[i]; this._bark(b.speaker || '', b.text);
    } else {
      if(this._barkState.fired[trigger]) return;
      this._barkState.fired[trigger] = true;
      arr.forEach((b, k) => setTimeout(() => this._bark(b.speaker || '', b.text), k * 3600));
    }
  },

  _bark(speaker, text) {
    this._injectBarkCSS();
    let layer = document.getElementById('cf-bark-layer');
    if(!layer) { layer = document.createElement('div'); layer.id = 'cf-bark-layer'; document.body.appendChild(layer); }
    const el = document.createElement('div');
    el.className = 'cf-bark';
    const port = speaker
      ? `<img class="cf-bark-port" src="assets/images/portraits/${speaker}.png" onerror="this.style.display='none'" alt="">`
      : '';
    const who = speaker ? `<span class="cf-bark-who">${speaker}</span>` : '';
    el.innerHTML = `${port}<div class="cf-bark-body">${who}<span class="cf-bark-txt">${text}</span></div>`;
    layer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('cf-bark--in'));
    setTimeout(() => { el.classList.remove('cf-bark--in'); setTimeout(() => el.remove(), 450); }, 4200);
  },

  _injectBarkCSS() {
    if(document.getElementById('cf-bark-css')) return;
    const s = document.createElement('style'); s.id = 'cf-bark-css';
    s.textContent = `
      #cf-bark-layer{position:fixed;left:16px;bottom:96px;z-index:60;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:min(46vw,420px);}
      .cf-bark{display:flex;align-items:flex-end;gap:10px;opacity:0;transform:translateX(-16px);transition:opacity .4s ease,transform .4s ease;}
      .cf-bark--in{opacity:1;transform:translateX(0);}
      .cf-bark-port{width:44px;height:44px;border-radius:6px;object-fit:cover;object-position:top center;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.6);}
      .cf-bark-body{background:linear-gradient(to right,rgba(3,6,10,.92),rgba(3,6,10,.72));border-left:2px solid rgba(79,163,224,.55);border-radius:4px;padding:7px 12px;}
      .cf-bark-who{display:block;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:1px;color:#7fb0d8;text-transform:uppercase;margin-bottom:2px;}
      .cf-bark-txt{font-family:'VT323',monospace;font-size:17px;line-height:1.25;color:#dfe9f2;text-shadow:0 1px 4px rgba(0,0,0,.9);}
    `;
    document.head.appendChild(s);
  },

  // ── Profil-screen: systém ti před mirror-bossem hodí, co o tobě ví ──
  _showProfileReadout(cb) {
    const obs = (GameState.profileBarks && GameState.profileBarks()) || [];
    if(!obs.length) { cb(); return; }
    this._injectProfileCSS();
    const lines = obs.slice(0, 5);
    const ov = document.createElement('div');
    ov.className = 'cf-profile';
    ov.innerHTML = `
      <img class="cf-profile-emblem" src="assets/images/emblem_sm.png" alt="">
      <div class="cf-profile-head">SYSTÉM &middot; PROFIL KURÝRA</div>
      <div class="cf-profile-sub">Čtu tvůj deck. A tebe.</div>
      <div class="cf-profile-list">
        ${lines.map(t => `<div class="cf-profile-line">&rsaquo; ${t}</div>`).join('')}
      </div>
      <button class="cf-profile-go">▶ POKRAČOVAT</button>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('on'));
    const lineEls = ov.querySelectorAll('.cf-profile-line');
    lineEls.forEach((el, i) => setTimeout(() => el.classList.add('on'), 700 + i * 750));
    const btn = ov.querySelector('.cf-profile-go');
    btn.style.opacity = '0';
    setTimeout(() => { btn.style.opacity = '1'; }, 700 + lineEls.length * 750 + 200);
    const done = () => { ov.classList.remove('on'); setTimeout(() => ov.remove(), 350); cb(); };
    btn.addEventListener('click', done, { once: true });
  },

  _injectProfileCSS() {
    if(document.getElementById('cf-profile-css')) return;
    const s = document.createElement('style'); s.id = 'cf-profile-css';
    s.textContent = `
      .cf-profile{position:fixed;inset:0;z-index:210;background:radial-gradient(ellipse at center,#0a1018 0%,#04070b 80%);
        display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;
        opacity:0;transition:opacity .4s ease;text-align:center;}
      .cf-profile.on{opacity:1;}
      .cf-profile-emblem{width:clamp(70px,10vw,110px);height:auto;opacity:.85;filter:drop-shadow(0 0 20px rgba(79,163,224,.3));margin-bottom:6px;}
      .cf-profile-head{font-family:'Press Start 2P',monospace;font-size:clamp(11px,1.6vw,16px);letter-spacing:3px;color:#8fd0ff;
        text-shadow:2px 0 0 rgba(224,79,106,.35),-2px 0 0 rgba(80,224,184,.3);}
      .cf-profile-sub{font-family:'Share Tech Mono',monospace;font-size:clamp(11px,1.2vw,14px);letter-spacing:2px;color:#5f7f9f;margin-bottom:10px;}
      .cf-profile-list{display:flex;flex-direction:column;gap:10px;max-width:min(620px,88vw);}
      .cf-profile-line{font-family:'VT323',monospace;font-size:clamp(16px,1.9vw,22px);color:#dfe9f2;
        opacity:0;transform:translateY(6px);transition:opacity .5s ease,transform .5s ease;
        border-left:2px solid rgba(79,163,224,.5);padding:4px 0 4px 12px;text-align:left;text-shadow:0 1px 4px rgba(0,0,0,.9);}
      .cf-profile-line.on{opacity:1;transform:none;}
      .cf-profile-go{margin-top:18px;background:transparent;border:1px solid rgba(79,163,224,.4);color:#cdd8e6;
        font-family:'VT323',monospace;font-size:clamp(15px,1.6vw,19px);letter-spacing:2px;padding:8px 26px;cursor:pointer;
        transition:opacity .4s ease,background .15s;}
      .cf-profile-go:hover{background:rgba(79,163,224,.12);}
    `;
    document.head.appendChild(s);
  },

  _animateLP(who, amount, isHeal) {
    const el = document.getElementById(who==='p' ? 'p-lp-ring' : 'e-lp-ring');
    if(!el) return;
    el.classList.add('lp-hit');
    EventBus.emit('sfx:play', 'damage');
    setTimeout(() => el.classList.remove('lp-hit'), 600);

    // Floating number — damage (červená/zelená) nebo healing (zelená +)
    if(amount && amount > 0) {
      const dmgEl = document.createElement('div');
      dmgEl.className = 'dmg-float';
      if(isHeal) {
        dmgEl.textContent = `+${amount}`;
        dmgEl.style.color = '#50e0b8';
      } else {
        dmgEl.textContent = `-${amount}`;
        dmgEl.style.color = who === 'p' ? '#e04f6a' : '#ff9a55';
      }
      el.appendChild(dmgEl);
      setTimeout(() => dmgEl.remove(), 1400);
    }
  },

  // Fúzní záblesk — fullscreen flash + expanding ring
  _fuseFlash() {
    const screen = this._container?.querySelector('.battle-screen');
    if(!screen) return;
    const flash = document.createElement('div');
    flash.className = 'fuse-flash';
    flash.innerHTML = `
      <div class="fuse-glow"></div>
      <div class="fuse-ring fuse-ring-1"></div>
      <div class="fuse-ring fuse-ring-2"></div>
      <div class="fuse-ring fuse-ring-3"></div>
      <div class="fuse-text">✦ FÚZE ✦</div>
    `;
    screen.appendChild(flash);
    screen.classList.add('fuse-shake');
    setTimeout(() => { flash.remove(); screen.classList.remove('fuse-shake'); }, 1800);
  },

  // ═══════════════════════════════════════════════════════════════════════
  // BATTLE DIALOG — VN overlay přímo na battle poli
  // Monyra (nebo jiná postava) mluví během boje. Boj je zapauzovaný.
  // ═══════════════════════════════════════════════════════════════════════

  _battleDialog(lines, callback) {
    // lines: [{speaker:'monyra', text:'...'}, ...]
    // callback: zavolá se po posledním kliku
    const screen = this._container?.querySelector('.battle-screen');
    if(!screen || !lines?.length) { if(callback) callback(); return; }

    this._state.busy = true; // pauzni boj

    let idx = 0;
    const overlay = document.createElement('div');
    overlay.className = 'bd-overlay';

    const render = () => {
      if(idx >= lines.length) {
        overlay.remove();
        this._state.busy = false;
        if(callback) callback();
        return;
      }
      const l = lines[idx];
      const speaker = l.speaker || '';
      const speakerMap = {
        monyra:'monyra', player:'kuryr', kuryr:'kuryr',
        eli:'eli', voit:'voit', rozara:'rozara', romen:'romen',
        lens:'lens', marta:'marta', sigma:'sigma',
        pramati:'pramati', 'pramáti':'pramati',
        paradox:'paradox', rekalibrator:'rekalibrator', reka:'rekalibrator',
        pozorovatel:'pozorovatel', spravce:'spravce', 'správce':'spravce',
        veritel:'veritel', 'věřitel':'veritel', agent:'agent',
        vykonavatel:'voit',
      };
      const portraitFile = speakerMap[speaker.toLowerCase()] || '';
      const portraitHtml = portraitFile
        ? `<div class="bd-portrait" style="background-image:url('assets/images/portraits/${portraitFile}.png')"></div>`
        : '';
      const isLeft = speaker.toLowerCase() === 'monyra' || speaker.toLowerCase() === 'player';

      overlay.innerHTML = `
        <div class="bd-dialog ${isLeft ? 'bd-left' : 'bd-right'}">
          ${portraitHtml}
          <div class="bd-bubble">
            ${speaker ? `<span class="bd-speaker">${speaker.toUpperCase()}</span>` : ''}
            <span class="bd-text"></span>
          </div>
        </div>
        <div class="bd-tap">▶</div>`;

      // Typewriter
      const textEl = overlay.querySelector('.bd-text');
      const full = l.text || '';
      let ci = 0;
      const tw = setInterval(() => {
        textEl.textContent += full[ci++] ?? '';
        if(ci >= full.length) clearInterval(tw);
      }, 35);

      // Klik = skip typewriter nebo další řádek
      const handler = () => {
        if(ci < full.length) {
          clearInterval(tw);
          textEl.textContent = full;
          ci = full.length;
          return;
        }
        idx++;
        overlay.removeEventListener('click', handler);
        render();
      };
      overlay.addEventListener('click', handler);
    };

    screen.appendChild(overlay);
    render();
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TUTORIAL SYSTEM — Monyra mluví v boji
  // ═══════════════════════════════════════════════════════════════════════

  _tutorialStep: 0,
  _isTutorial() { return !!this._params?.tutorial; },

  // Volá se v klíčových momentech boje
  _checkTutorial(trigger, callback) {
    if(!this._isTutorial()) { if(callback) callback(); return; }

    const steps = {
      // Trigger → [lines] (zobrazí se jen jednou)
      'battle_start': [
        {speaker:'monyra', text:'Vidíš ty karty dole? Každá je někdo. Někdo kdo bude bojovat za tebe.'},
        {speaker:'monyra', text:'Lízneš jednu kartu každý tah. Pět máš v ruce.'},
        {speaker:'monyra', text:'Vyber monstrum a polož ho na pole. Klikni na kartu.'},
      ],
      'first_monster_played': [
        {speaker:'monyra', text:'Dobře. Monstrum je na poli.'},
        {speaker:'monyra', text:'Kouzla a pasti hraješ do spodní řady. Kouzla hned účinkují. Pasti čekají.'},
        {speaker:'monyra', text:'Aréna ovlivňuje celé pole — jen jedna najednou.'},
        {speaker:'monyra', text:'Teď ukončí tah. Tlačítko vpravo dole.'},
      ],
      'first_enemy_turn': [
        {speaker:'monyra', text:'Nepřítel hraje. Sleduj co dělá.'},
        {speaker:'monyra', text:'ATK proti ATK — kdo má méně, padá. Pokud útočíš na DEF pozici, počítá se DEF obránce.'},
      ],
      'first_attack_phase': [
        {speaker:'monyra', text:'Teď můžeš útočit. Klikni na své monstrum a pak na nepřátelské.'},
        {speaker:'monyra', text:'LP — body života. Když nepřítel nemá monstra na poli, útočíš přímo na LP.'},
        {speaker:'monyra', text:'Na nule — konec.'},
      ],
      'first_attack_done': [
        {speaker:'monyra', text:'Přesně tak.'},
      ],
      'tutorial_end': [
        {speaker:'monyra', text:'Zbytek se naučíš sám. Nebo ne.'},
        {speaker:'monyra', text:'Uvidíme.'},
      ],
    };

    const key = `_tut_${trigger}`;
    if(this[key]) { if(callback) callback(); return; } // už bylo
    const lines = steps[trigger];
    if(!lines) { if(callback) callback(); return; }

    this[key] = true; // mark as shown
    this._battleDialog(lines, callback);
  },

  // Story komentáře — Monyra/Voit komentuje v boji (non-tutorial)
  _storyComment(lines) {
    if(!lines?.length) return;
    this._battleDialog(lines, () => {});
  },

  // Attack particles — jiskry z útočníka k cíli
  _attackParticles(fromEl, toEl) {
    const screen = this._container?.querySelector('.battle-screen');
    if(!screen || !fromEl || !toEl) return;
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    const sr = screen.getBoundingClientRect();
    for(let i=0; i<6; i++) {
      const p = document.createElement('div');
      p.className = 'atk-particle';
      p.style.left = (fr.left + fr.width/2 - sr.left) + 'px';
      p.style.top = (fr.top + fr.height/2 - sr.top) + 'px';
      p.style.setProperty('--tx', (tr.left + tr.width/2 - fr.left - fr.width/2 + (Math.random()-0.5)*30) + 'px');
      p.style.setProperty('--ty', (tr.top + tr.height/2 - fr.top - fr.height/2 + (Math.random()-0.5)*30) + 'px');
      p.style.animationDelay = (i * 50) + 'ms';
      screen.appendChild(p);
      setTimeout(() => p.remove(), 800);
    }
  },

  // Animuje kartu na poli — hledá .sl slot v řadě podle indexu
  _animateCard(who, slot, type, isSpell=false) {
    const rowId = isSpell
      ? (who==='p' ? '#player-spell-row' : '#enemy-spell-row')
      : (who==='p' ? '#player-monster-row' : '#enemy-monster-row');
    const row = document.querySelector(rowId);
    if(!row) return;
    const slots = row.querySelectorAll('.sl');
    const el = slots[slot];
    if(!el) return;

    // Přidej animaci přímo na .card element uvnitř slotu (nebo na slot samotný)
    const cardEl = el.querySelector('.cx-card, .cx-facedown, .card, .fb') || el;
    const animMap = {
      attack:   'an-atk',
      hit:      'an-hit',
      destroy:  'an-dest',
      activate: 'an-flip',
      flip:     'an-flip',
    };
    const cls = animMap[type];
    if(!cls) return;
    cardEl.classList.remove(cls);
    // Force reflow aby animace šla znovu
    void cardEl.offsetWidth;
    cardEl.classList.add(cls);
    const dur = type === 'destroy' ? 600 : 500;
    setTimeout(() => cardEl.classList.remove(cls), dur);
  },

  // Animuje zahraní karty z ruky — slot se rozsvítí
  _animatePlayFromHand(slot) {
    const row = document.querySelector('#player-monster-row');
    if(!row) return;
    const slots = row.querySelectorAll('.sl');
    const el = slots[slot];
    if(!el) return;
    el.classList.add('sl-place-anim');
    setTimeout(() => el.classList.remove('sl-place-anim'), 500);
  },

  // Blesková animace přímého útoku — krátký flash na LP kruhu nepřítele
  _flashScreen(color='#e04f6a') {
    const f = document.getElementById('flash');
    if(f) {
      f.classList.add('on');
      setTimeout(() => f.classList.remove('on'), 180);
      return;
    }
    const el = document.createElement('div');
    el.className = 'clash-flash';
    el.style.background = color + '22';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 300);
  },

  // ── RENDER ────────────────────────────────────────────────────────────────

  // Nastaví body.className podle fáze — řídí CSS atmosféru
  _setPhase(name) {
    // name: 'hand' | 'field' | 'attack' | 'enemy'
    document.body.className = 'ph-' + name;
  },

  _render() {
    const s = this._state;
    if(!s) return;

    // ── Phase CSS na body ────────────────────────────────────────────────
    if(!s.isPlayerTurn) {
      this._setPhase('enemy');
    } else if(s.attackerSlot !== null) {
      this._setPhase('attack');
    } else if(s.cardPlayedThisTurn || s.phase === 'battle') {
      this._setPhase('field');
    } else {
      this._setPhase('hand');
    }

    s.eMonsters.forEach(m => { if(m && m.justRevealed) setTimeout(() => { if(m) m.justRevealed = false; }, 500); });

    // ── Corruption class ─────────────────────────────────────────────────
    const cLvl = getCorruptionLevel();
    const cClass = cLvl >= 9 ? 'corr-collapse' : cLvl >= 7 ? 'corr-resonance' : cLvl >= 5 ? 'corr-interference' : cLvl >= 3 ? 'corr-glitch' : '';

    // ── First render? Build full DOM ─────────────────────────────────────
    const existing = this._container.querySelector('.battle-screen');
    if(!existing) {
      this._renderFull(cClass);
      return;
    }

    // ── Subsequent renders: targeted DOM patches ─────────────────────────
    existing.className = `battle-screen ${cClass}`;
    existing.dataset.arena = s.activeArena?.effect || '';

    // Dynamický battle bg podle arény
    const bgEl = existing.querySelector('.battle-bg');
    if (bgEl && s.activeArena) {
      const arenaBg = this._arenaBgMap[s.activeArena.faction];
      if (arenaBg && !bgEl.dataset.arenaApplied) {
        bgEl.style.backgroundImage = `url('assets/images/backgrounds/${arenaBg}')`;
        bgEl.style.opacity = '0.18';
        bgEl.dataset.arenaApplied = '1';
      }
    }

    // LP
    this._updateLP('p');
    this._updateLP('e');

    // Phase text + turn
    const phTxt = document.getElementById('ph-txt');
    if(phTxt) phTxt.textContent = this._phaseText();
    const tahEl = this._container.querySelector('.lp-tah');
    if(tahEl) tahEl.textContent = `Tah ${s.turnNumber}`;

    // Monster rows
    const pMRow = document.getElementById('player-monster-row');
    if(pMRow) pMRow.innerHTML = this._renderMonsterRow('p');
    const eMRow = document.getElementById('enemy-monster-row');
    if(eMRow) eMRow.innerHTML = this._renderMonsterRow('e');

    // Spell rows
    const pSRow = document.getElementById('player-spell-row');
    if(pSRow) pSRow.innerHTML = this._renderSpellRow('p');
    const eSRow = document.getElementById('enemy-spell-row');
    if(eSRow) eSRow.innerHTML = this._renderSpellRow('e');

    // Divider
    const divTxt = document.getElementById('div-txt');
    if(divTxt) divTxt.innerHTML = this._renderPhaseLabel();

    // Arena
    const arenaSlot = document.getElementById('arena-panel-slot');
    if(arenaSlot) arenaSlot.innerHTML = this._renderArenaPanel();


    // Hand (single)
    const handRow = document.getElementById('hand-row');
    if(handRow) handRow.innerHTML = this._renderHand();

    // Action bar
    const actTxt = document.getElementById('act-txt');
    if(actTxt) actTxt.innerHTML = this._actText();
    const btnZone = document.getElementById('act-btn-zone');
    if(btnZone) btnZone.innerHTML = this._renderActionButtons();

    this._fixCardImages();
  },

  // ── FULL RENDER — první sestavení DOM ──────────────────────────────────────
  _renderFull(cClass) {
    const s = this._state;
    const oldOverlay = document.getElementById('battle-overlay');
    if(oldOverlay && !oldOverlay.classList.contains('show')) oldOverlay.remove();

    this._container.innerHTML = '';
    this._injectStyles();

    const screen = document.createElement('div');
    screen.className = `battle-screen ${cClass}`;
    screen.dataset.arena = s.activeArena?.effect || '';
    this._container.appendChild(screen);

    screen.insertAdjacentHTML('afterbegin', '<div id="atmo"></div><div id="flash"></div>');

    // Battle background — params override nebo enemy act number + faction
    let bgFile = 'battle_bg';
    let bgExt = '.png';
    if(this._params?.background) {
      // StoryEngine alias mapa — resolvuj běžné campaign bg názvy
      const bgAlias = {
        'act1_city_gate':'act1_synth','act1_checkpoint':'act1_synth','act1_city_streets':'act1_synth',
        'act1_forest_edge':'act1_organic','act1_synth_checkpoint':'act1_synth','act1_crossroads':'act1_synth',
        'act1_gate_inner':'act1_synth','act2_border':'act2_demarkace','act2_synth_border':'act1_synth',
        'act2_forest_deep':'act1_organic','act2_gate':'act2_demarkace','act3_nexus':'act3_nexus',
        'act3_duel_arena':'act3_nexus','act4_red_zone':'act4_syndikat','act4_syndicate_hall':'act4_syndikat',
        'act4_veritel_office':'act4_syndikat','act5_transit_station':'act5_stanice',
        'act5_duel_memory':'act9_zrcadlo','act6_crossing':'act6_ruiny','act6_ruins':'act6_ruiny',
        'act7_core_battle':'act7_centrum','act7_checkpoint_fight':'act7_centrum',
        'act8_battle_town':'act8_mesto','act9_transition_fight':'act9_zrcadlo',
        'act10_synth_battle':'act10_konvergence','act10_organic_battle':'act1_organic',
        'act10_void_battle':'act10_konvergence','act10_protocol_space':'act10_konvergence',
      };
      bgFile = bgAlias[this._params.background] || this._params.background;
      const pngSet = new Set(['mesto','les','ruiny','synth_brana','act8_mesto','battle_bg','collection_bg','deckbuilder_bg','freebattle_bg']);
      bgExt = pngSet.has(bgFile) ? '.png' : '.jpg';
    } else {
      const actBgMap = {
        1: {synth:'act1_synth',organic:'act1_organic',default:'act1_synth'},
        2: {default:'act2_demarkace'},3: {default:'act3_nexus'},
        4: {default:'act4_syndikat'},5: {default:'act5_stanice'},
        6: {default:'act6_ruiny'},7: {default:'act7_centrum'},
        8: {default:'act4_syndikat'},9: {default:'act9_zrcadlo'},
        10:{default:'act10_konvergence'},
      };
      const actNum = this._enemy?.actNumber || 1;
      const actBgs = actBgMap[actNum] || actBgMap[1];
      bgFile = actBgs[this._enemy?.faction] || actBgs.default || 'battle_bg';
      bgExt = bgFile.startsWith('act') ? '.jpg' : '.png';
    }
    screen.insertAdjacentHTML('afterbegin',
      `<div class="battle-bg" style="background-image:url('assets/images/backgrounds/${bgFile}${bgExt}')"></div>`
    );

    // ── LP ROW ───────────────────────────────────────────────────────────
    const lpRow = document.createElement('div');
    lpRow.className = 'lp-row';
    lpRow.innerHTML = `
      ${this._renderLPBlock('p')}
      <div class="lp-mid">
        <div class="lp-phase" id="ph-txt">${this._phaseText()}</div>
        <div class="lp-tah">Tah ${s.turnNumber}</div>
      </div>
      ${this._renderLPBlock('e')}
    `;
    screen.appendChild(lpRow);

    // ── BOARD (celý střed) ────────────────────────────────────────────────
    const scene = document.createElement('div');
    scene.className = 'scene';
    const board = document.createElement('div');
    board.className = 'board';
    board.id = 'board';
    board.innerHTML = `
      <div class="field-frame"></div>
      <div id="arena-panel-slot">${this._renderArenaPanel()}</div>
      <div class="toast" id="toast"></div>
      <div class="row" id="enemy-spell-row">${this._renderSpellRow('e')}</div>
      <div class="row" id="enemy-monster-row">${this._renderMonsterRow('e')}</div>
      <div class="divider"><div class="div-txt" id="div-txt">${this._renderPhaseLabel()}</div></div>
      <div class="row" id="player-monster-row">${this._renderMonsterRow('p')}</div>
      <div class="row" id="player-spell-row">${this._renderSpellRow('p')}</div>
      <div id="fuse-popup" class="fuse-popup" style="display:none">
        <div class="fp-title">FUZE</div>
        <div class="fp-card">
          <div id="fp-card-render"></div>
          <div class="fp-info">
            <div class="fp-source" id="fp-source"></div>
            <div class="fp-buttons">
              <div id="fp-exp-note" class="fp-exp-note" style="display:none">Experimentalni</div>
              <button class="btn-fuse" id="btn-confirm-fuse">FUZOVAT</button>
              <button class="btn-cancel-fuse" id="btn-cancel-fuse">ZRUSIT</button>
            </div>
          </div>
        </div>
      </div>
    `;
    scene.appendChild(board);
    screen.appendChild(scene);

    if(!document.getElementById('battle-overlay')) {
      const bo = document.createElement('div');
      bo.id = 'battle-overlay'; bo.className = 'battle-overlay';
      document.body.appendChild(bo);
    }

    // ── HAND (jedna, dole) ────────────────────────────────────────────────
    const hand = document.createElement('div');
    hand.className = 'hand-row';
    hand.id = 'hand-row';
    hand.innerHTML = this._renderHand();
    screen.appendChild(hand);

    // ── ACTION BAR ───────────────────────────────────────────────────────
    const actRow = document.createElement('div');
    actRow.className = 'act-row';
    actRow.innerHTML = `
      <button class="btn btn-sm" id="btn-pause">PAUZA</button>
      <div class="act-txt" id="act-txt">${this._actText()}</div>
      <div id="act-btn-zone" style="display:contents">${this._renderActionButtons()}</div>
    `;
    screen.appendChild(actRow);
    this._fixCardImages();
  },

  // ── HAND — jedna ruka, mění obsah podle tahu ─────────────────────────────
  _renderHand() {
    const s = this._state;

    // Tah nepřítele — zobraz jeho karty face-down
    if(!s.isPlayerTurn) {
      return s.eHand.map(() =>
        `<div class="h-sl h-sl-enemy">${_rcEl(null, 'md', {faceDown:true})}</div>`
      ).join('') || '<div class="hand-empty">--</div>';
    }

    // Tvůj tah — tvoje karty
    return s.pHand.map((card, i) => {
      const isSelected = s.selectedHandIdx === i;
      const inFuseSel  = s.fuseSelection.includes(i);
      const inFuseMode = s.fuseSelection.length > 0;
      const scarData = GameState.getScarData?.(card.id);

      const canDiscard = s.isPlayerTurn && !s.busy && !s.over && card.kind !== 'letter';
      return `<div class="h-sl ${isSelected ? 'sel' : ''} ${inFuseSel ? 'multi-sel' : ''} ${inFuseMode && !inFuseSel ? 'fuse-dim' : ''}" data-hand="${i}">
        ${_rcEl(card, 'md', {
          selected: isSelected,
          inFuse: inFuseSel,
          scarCount: scarData?.scars || 0,
        })}
        ${canDiscard ? `<button class="hand-discard-btn" data-discard="${i}" title="Zahodit">✕</button>` : ''}
      </div>`;
    }).join('') || '<div class="hand-empty">--</div>';
  },

  // ── FIX CARD IMAGES — re-bind onerror po DOM patch ─────────────────────────
  _fixCardImages() {
    // Handle cx-frame errors (frame images that failed to load)
    const frames = this._container.querySelectorAll('img.cx-frame');
    frames.forEach(img => {
      if(img._errHandled) return;
      img._errHandled = true;
      img.addEventListener('error', () => { img.style.display = 'none'; });
      if(img.complete && img.naturalWidth === 0) img.style.display = 'none';
    });
  },

  _phaseText() {
    const s = this._state;
    if(!s.isPlayerTurn) return 'NEPŘÍTEL';
    if(s.attackerSlot !== null) return '⚔ ÚTOK';
    if(s.cardPlayedThisTurn) return 'POLE';
    return 'RUKA';
  },

  _actText() {
    const s = this._state;
    if(!s.isPlayerTurn || s.busy) return '◀ Protivník hraje…';

    // Card info bar — show selected card stats
    if(s.attackerSlot !== null) {
      const m = s.pMonsters[s.attackerSlot];
      if(m?.card) {
        const c = m.card;
        const fc = factionColor(c.faction);
        return `<span style="color:${fc}">⚔ ${c.name}</span> <span class="act-stat">ATK ${c.atk}</span> · Klikni na cíl`;
      }
      return '⚔ Klikni na nepřítele pro útok';
    }

    if(s.fuseSelection.length > 0) {
      const ids = s.fuseSelection.map(i => s.pHand[i]?.id).filter(Boolean);
      const result = ids.length >= 2 ? findFusion(ids) : null;
      if(result) {
        const names = s.fuseSelection.map(i => s.pHand[i]?.name || '?').join(' + ');
        return `⚗ ${names}`;
      }
      return 'RUKA · vyber karty';
    }

    if(s.selectedHandIdx !== null) {
      const card = s.pHand[s.selectedHandIdx];
      if(!card) return '▶ Karta vybrána';
      const fc = factionColor(card.faction);
      const fLabel = {synth:'SYNTH',organic:'ORGANIC',hybrid:'HYBRID',corruption:'CORRUPTION',neutral:'NEUTRAL'}[card.faction] || '';
      const sub = card.subcategory ? ` · ${card.subcategory.toUpperCase()}` : '';
      const stats = card.kind === 'monster' ? ` <span class="act-stat">ATK ${card.atk} DEF ${card.def}</span>` : ` <span class="act-stat">${kindLabel(card.kind)}</span>`;
      const hint = card.kind === 'monster' ? '→ monster slot'
                 : card.kind === 'trap' ? '→ spell slot (past)'
                 : '→ spell slot';
      return `<span style="color:${fc}">${card.name}</span> <span class="act-faction">${fLabel}</span>${stats}${sub} · ${hint}`;
    }

    if(s.cardPlayedThisTurn) return '▶ Vyber útočníka · nebo ukonči tah';
    return '▶ Vyber kartu z ruky';
  },

  _applyFieldTilt() {
    // Tilt řeší CSS přes body.ph-* třídy — tato metoda je prázdná pro zpětnou compat
  },

  _phaseBadge() {
    return this._phaseText();
  },

  _renderLPRing(who) {
    // Wrapper pro zpětnou compat — volá nový _renderLPBlock
    return this._renderLPBlock(who);
  },

  _renderLPBlock(who) {
    const s = this._state;
    const lp    = who === 'p' ? s.pLP    : s.eLP;
    const maxLP = who === 'p' ? s.pMaxLP : s.eMaxLP;
    const pct   = Math.max(0, lp / maxLP);
    const circ  = 97.4;
    const offset = circ * (1 - pct);
    const isBoss = who === 'e' && !!(this._enemy?.isBoss);
    const name   = who === 'p'
      ? (GameState.player?.name || 'KURÝR')
      : (this._enemy?.name || 'NEPŘÍTEL');

    let stroke;
    if(who === 'p') stroke = pct > 0.25 ? 'var(--synth)' : '#e04f6a';
    else            stroke = pct > 0.25 ? 'var(--organic)' : '#e04f6a';
    if(isBoss && pct > 0.25) stroke = 'var(--gold)';

    const valColor = who === 'p' ? 'var(--synth)' : 'var(--organic)';
    const danger   = pct <= 0.25;
    const deck = who === 'p' ? s.pDeck : s.eDeck;

    // Portrait — enemy gets portrait image, player gets kuryr
    const portraitMap = {
      'monyra_tutorial':'monyra', 'act1_boss':'voit',
      'act2_04':'marta',          'act4_marta':'marta',
      'act5_eli':'eli',           'act8_veritel':'romen',
      'act10_paradox':'lens',     'act10_lens':'lens',
      'act10_sigma':'sigma',      'act10_pramati':'pramati',
      'act9_pozorovatel':'pozorovatel',
      'act4_veritel':'veritel',
      'act7_boss':'spravce',
      'act7_01':'rekalibrator',
    };
    let portrait = '';
    if(who === 'e' && this._enemy?.id) {
      const pFile = portraitMap[this._enemy.id] || this._enemy.portrait;
      if(pFile) portrait = `<img class="lp-portrait" src="assets/images/portraits/${pFile}.png" onerror="this.style.display='none'" />`;
    } else if(who === 'p') {
      portrait = `<img class="lp-portrait" src="assets/images/portraits/kuryr.png" onerror="this.style.display='none'" />`;
    }

    return `
      <div class="lp-block ${who}" id="${who === 'p' ? 'p-lp-ring' : 'e-lp-ring'}">
        ${portrait}
        <div class="lp-ring">
          <svg viewBox="0 0 36 36">
            <circle class="r-bg"   cx="18" cy="18" r="15.5"/>
            <circle class="r-fill" cx="18" cy="18" r="15.5"
              stroke="${stroke}"
              stroke-dasharray="${circ}"
              stroke-dashoffset="${offset.toFixed(2)}"
              style="filter:drop-shadow(0 0 4px ${stroke}88)"/>
          </svg>
          <div class="lp-ring-num">LP</div>
        </div>
        <div class="lp-info">
          <div class="lp-name">${isBoss ? '⚡ ' : ''}${name}</div>
          <div class="lp-val ${danger ? 'lp-danger' : ''}" style="color:${valColor}">${lp.toLocaleString('en-US')}</div>
          <div class="lp-deck-info">DECK ${deck.length}</div>
        </div>
      </div>`;
  },

  // Targeted LP update — aktualizuje jen hodnoty uvnitř LP bloku, nenahrazuje element
  _updateLP(who) {
    const el = document.getElementById(who === 'p' ? 'p-lp-ring' : 'e-lp-ring');
    if(!el) return;
    const s = this._state;
    const lp    = who === 'p' ? s.pLP    : s.eLP;
    const maxLP = who === 'p' ? s.pMaxLP : s.eMaxLP;
    const pct   = Math.max(0, lp / maxLP);
    const circ  = 97.4;
    const offset = circ * (1 - pct);
    const isBoss = who === 'e' && !!(this._enemy?.isBoss);
    const danger = pct <= 0.25;

    let stroke;
    if(who === 'p') stroke = pct > 0.25 ? 'var(--synth)' : '#e04f6a';
    else            stroke = pct > 0.25 ? 'var(--organic)' : '#e04f6a';
    if(isBoss && pct > 0.25) stroke = 'var(--gold)';

    const valColor = who === 'p' ? 'var(--synth)' : 'var(--organic)';

    // Update SVG ring
    const ring = el.querySelector('.r-fill');
    if(ring) {
      ring.setAttribute('stroke', stroke);
      ring.setAttribute('stroke-dashoffset', offset.toFixed(2));
      ring.style.filter = `drop-shadow(0 0 4px ${stroke}88)`;
    }

    // Update LP number
    const valEl = el.querySelector('.lp-val');
    if(valEl) {
      valEl.textContent = lp.toLocaleString('en-US');
      valEl.style.color = valColor;
      valEl.className = `lp-val ${danger ? 'lp-danger' : ''}`;
    }

    // Update deck/hand count
    const deckInfo = el.querySelector('.lp-deck-info');
    if(deckInfo) {
      const deck = who === 'p' ? s.pDeck : s.eDeck;
      const hand = who === 'p' ? s.pHand : s.eHand;
      deckInfo.textContent = `DECK ${deck.length}`;
    }
  },

  _renderMonsterRow(who) {
    const s = this._state;
    const monsters  = who === 'p' ? s.pMonsters : s.eMonsters;
    const isPlayer  = who === 'p';
    const targetMode = who === 'e' && s.attackerSlot !== null;

    return monsters.map((slot, i) => {
      // ── Prázdný slot ──
      if(!slot) {
        const selCard = s.selectedHandIdx !== null ? s.pHand[s.selectedHandIdx] : null;
        const isOpen = isPlayer && s.isPlayerTurn && !s.busy
          && !s.cardPlayedThisTurn
          && selCard?.kind === 'monster';
        return `<div class="sl ${isOpen ? 'open' : ''}" data-who="${who}" data-slot="${i}">
          <div class="sl-e">·</div>
        </div>`;
      }

      const card = slot.card;
      const isSelected  = isPlayer && s.attackerSlot === i;
      const isUsed      = slot.hasAttacked;
      const isDef       = slot.mode === 'def';
      const isTarget    = targetMode;
      const isSwap      = isPlayer && s._swapMode?.handIdx !== undefined;

      // ── Enemy face-down ──
      if(who === 'e' && !slot.revealed) {
        return `<div class="sl ${isTarget ? 'sl-target' : ''}" data-who="${who}" data-slot="${i}">
          ${_rcEl(null, 'sm', {faceDown:true, target:isTarget})}
        </div>`;
      }

      // ── Player face-down ──
      if(who === 'p' && slot.faceDown) {
        const isAtk = slot.mode === 'atk';
        return `<div class="sl ${isDef ? 'def' : ''} ${isUsed ? 'sl-used' : ''} ${isSelected ? 'sl-atk' : ''}" data-who="${who}" data-slot="${i}">
          <div class="cx-card cx-sm cx-facedown ${isSelected ? 'cx-attacker' : ''} ${slot.justPlaced ? 'cx-reveal' : ''}" style="position:relative">
            <img class="cx-back-img" src="assets/images/cards/card_back.jpg" onerror="this.onerror=null;this.src='assets/images/cards/card_back.png'" />
          </div>
          ${isPlayer && s.isPlayerTurn && !s.busy && !s.over
            ? `<button class="stance-btn" data-stance="${i}">${isAtk ? 'DEF' : 'ATK'}</button>` : ''}
        </div>`;
      }

      // ── Karta viditelná ──
      const isRevealing = who === 'e' && slot.revealed && slot.justRevealed;

      const isYourCard = who === 'e' && this._mirrorEnemy && this._yourCardIds?.has(card.id);
      return `<div class="sl ${isDef ? 'def' : ''} ${isUsed ? 'sl-used' : ''} ${isSelected ? 'sl-atk' : ''} ${isSwap ? 'sl-swap' : ''}" data-who="${who}" data-slot="${i}" style="position:relative">
        ${isYourCard ? '<div class="cf-yourcard">◈ TVOJE KARTA</div>' : ''}
        ${_rcEl(card, 'sm', {
          selected: isSelected,
          attacker: isSelected,
          target: isTarget,
          used: isUsed,
          revealing: isRevealing,
          def: isDef,
          scarCount: slot.scarCount || 0,
        })}
        ${isPlayer && s.isPlayerTurn && !s.busy && !s.over
          ? `<button class="stance-btn" data-stance="${i}">${isDef ? 'ATK' : 'DEF'}</button>` : ''}
      </div>`;
    }).join('');
  },

  _renderArenaPanel() {
    const s = this._state;
    const arena = s.activeArena;
    if(!arena) return '';
    return `<div class="arena-b">
      <div class="arena-l">◈ ARÉNA</div>
      <div class="arena-n">${arena.name}</div>
    </div>`;
  },

  _renderSpellRow(who) {
    const s = this._state;
    const spells   = who === 'p' ? s.pSpells : s.eSpells;
    const isPlayer = who === 'p';

    return spells.map((slot, i) => {
      // ── Prázdný slot ──
      if(!slot) {
        const sel = s.pHand[s.selectedHandIdx];
        const isOpen = isPlayer && s.isPlayerTurn && !s.busy
          && s.selectedHandIdx !== null && !s.cardPlayedThisTurn
          && (sel?.kind === 'trap' || sel?.kind === 'spell' || sel?.kind === 'arena');
        return `<div class="sl ${isOpen ? 'open' : ''}" data-who="${who}" data-spell-slot="${i}">
          <div class="sl-e">·</div>
        </div>`;
      }

      // ── Face-down ──
      if(slot.faceDown) {
        const isMyTurn = who === 'p' && s.isPlayerTurn && !s.busy;
        const isArena = slot.card?.kind === 'arena';
        const isTrap  = slot.card?.kind === 'trap';
        // Hint: hráč by měl vědět, jakého typu je face-down karta na svém poli
        const hint = isPlayer
          ? (isArena ? '<div class="sl-fd-hint sl-fd-arena">ARÉNA (lícem dolů)</div>'
             : isTrap ? '<div class="sl-fd-hint sl-fd-trap">PAST (lícem dolů)</div>'
             : '<div class="sl-fd-hint">LÍCEM DOLŮ</div>')
          : '';
        const fdCls = isArena ? 'sl-fd sl-fd-arena-slot'
                    : isTrap ? 'sl-fd sl-fd-trap-slot'
                    : 'sl-fd';
        return `<div class="sl ${fdCls} ${isMyTurn ? 'sl-active' : ''}" data-who="${who}" data-spell-slot="${i}" data-fd-kind="${slot.card?.kind || ''}">
          ${_rcEl(null, 'sm', {faceDown:true})}
          ${hint}
        </div>`;
      }

      const card = slot.card;

      // ── Viditelná karta (spell/trap/arena) ──
      return `<div class="sl" data-who="${who}" data-spell-slot="${i}">
        ${_rcEl(card, 'sm', {})}
      </div>`;
    }).join('');
  },

  _renderFuseHint() {
    const s = this._state;
    if(!s.fuseSelection.length) return '';
    const ids    = s.fuseSelection.map(i => s.pHand[i]?.id).filter(Boolean);
    if(!ids.length) return '';
    const result = findFusion(ids);
    return `<div class="fuse-hint">
      <span class="fh-label">${ids.length}× vybráno</span>
      ${result
        ? `<span class="fh-result">✦ ${result.name}</span>
           <button class="fuse-go-btn" id="btn-fuse-go">FÚZOVAT</button>`
        : `<span class="fh-none">Žádná fúze</span>`}
    </div>`;
  },

  _renderPhaseLabel() {
    const s = this._state;
    const arenaP = s.pSpells.find(sp => sp && sp.card?.kind === 'arena' && !sp.faceDown);
    const arenaE = s.eSpells.find(sp => sp && sp.card?.kind === 'arena' && !sp.faceDown);
    const arena  = arenaP || arenaE;
    if(arena) return `🏟 ${arena.card.name}`;
    if(!s.isPlayerTurn) return '◀ TAH NEPŘÍTELE';
    if(s.attackerSlot !== null) return '⚔ CLASH';
    if(s.cardPlayedThisTurn) return 'POLE · vyber útočníka';
    return 'RUKA · vyber karty';
  },

  _renderPhaseInfo() {
    // Zpětná compat — nepoužívá se v novém layoutu
    return '';
  },

  _renderActionButtons() {
    const s = this._state;
    if(!s.isPlayerTurn || s.busy || s.over) {
      return '';
    }
    // Útočník vybrán
    if(s.attackerSlot !== null) {
      return `<button class="btn btn-cancel" id="btn-cancel-atk">ZRUSIT</button>
              <button class="btn btn-main" id="btn-end-turn">KONEC TAHU</button>`;
    }
    // Fúze mód — zobraz tlačítka jen pokud je platná kombinace
    if(s.fuseSelection.length > 0) {
      const ids = s.fuseSelection.map(i => s.pHand[i]?.id).filter(Boolean);
      const result = ids.length >= 2 ? findFusion(ids) : null;
      if(result) {
        return `<button class="btn btn-main" id="btn-fuse-go">FUZOVAT</button>
          <button class="btn btn-cancel" id="btn-clear-fuse">ZRUSIT</button>`;
      }
      // Neplatná kombinace — žádná tlačítka, jen stav výběru
      return `<button class="btn btn-main" disabled>KONEC TAHU</button>`;
    }
    // Phase: hand → nabídni FUZE, KONEC TAHU disabled (musíš zahrát kartu)
    if(!s.cardPlayedThisTurn) {
      const hasHandMonsters = s.pHand.filter(c => c.kind === 'monster').length >= 2;
      return `${
        hasHandMonsters ? `<button class="btn btn-sec" id="btn-fuse-mode">FUZE</button>` : ''
      }<button class="btn btn-main" disabled>KONEC TAHU</button>`;
    }
    // Phase: field (karta zahrána) → jen akce na poli
    return `<button class="btn btn-main" id="btn-end-turn">KONEC TAHU</button>`;
  },


  // ── NÁHLED KARTY ─────────────────────────────────────────────────────────
  // Zobrazí popup s detailem karty. readOnly=true = bez akčních tlačítek (nepřítel)
  _showCardPreview(card, context) {
    // context: { who, slot, isHand, handIdx, isField, fieldSlot, isSpell, spellSlot }
    document.getElementById('card-preview-popup')?.remove();
    const s = this._state;
    const fc = factionColor(card.faction);
    const readOnly = context.who === 'e';
    const isMonster = card.kind === 'monster';

    // Akční tlačítka podle kontextu
    let actions = '';
    if(!readOnly && s.isPlayerTurn && !s.busy && !s.over) {
      if(context.isHand) {
        const idx = context.handIdx;
        if(card.kind === 'monster') {
          if(!s.cardPlayedThisTurn) {
            const hasSlot  = s.pMonsters.some(m => m === null);
            const hasField = s.pMonsters.some(m => m !== null);
            if(hasSlot) actions += `<button class="cp-btn cp-play" data-cp-action="play-facedown" data-cp-idx="${idx}">▶ Nasadit na pole</button>`;
            if(hasField) actions += `<button class="cp-btn cp-swap" data-cp-action="swap-mode" data-cp-idx="${idx}">⇄ Vyměnit kartu na poli</button>`;
          }
          // Fúze vždy dostupná
          actions += `<button class="cp-btn cp-fuse" data-cp-action="fuse-select" data-cp-idx="${idx}">⚗ Přidat do fúze</button>`;
        } else if(card.kind === 'spell') {
          if(!s.cardPlayedThisTurn) {
            actions += `<button class="cp-btn cp-play" data-cp-action="spell-now" data-cp-idx="${idx}">✨ Zahrát hned</button>`;
            actions += `<button class="cp-btn cp-save" data-cp-action="spell-use" data-cp-idx="${idx}">◈ Uložit na pole</button>`;
          }
        } else if(card.kind === 'trap') {
          if(!s.cardPlayedThisTurn) {
            actions += `<button class="cp-btn cp-face" data-cp-action="trap-set" data-cp-idx="${idx}">🪤 Nastavit</button>`;
          }
        } else if(card.kind === 'arena') {
          if(!s.cardPlayedThisTurn) {
            actions += `<button class="cp-btn cp-play" data-cp-action="arena-now" data-cp-idx="${idx}">🏟 Aktivovat</button>`;
          }
        }
      } else if(context.isField && context.who === 'p') {
        const slot   = context.fieldSlot;
        const fieldM = s.pMonsters[slot];
        if(fieldM) {
          if(fieldM.faceDown) {
            // Face-down — jediná akce je odhalit (ale jen při útoku, ne ručně)
            actions += `<button class="cp-btn cp-face" data-cp-action="reveal-facedown" data-cp-slot="${slot}">👁 Odhalit</button>`;
          } else {
            if(s.canAttack && !fieldM.hasAttacked && fieldM.mode === 'atk') {
              actions += `<button class="cp-btn cp-atk" data-cp-action="select-attacker" data-cp-slot="${slot}">⚔ Útočit touto kartou</button>`;
            }
            actions += `<button class="cp-btn cp-stance" data-cp-action="toggle-stance" data-cp-slot="${slot}">${fieldM.mode==='atk' ? '🛡 DEF postoj' : '⚔ ATK postoj'}</button>`;
          }
        }
      } else if(context.isSpell && context.who === 'p') {
        const slot   = context.spellSlot;
        const fieldSp = s.pSpells[slot];
        if(fieldSp && !fieldSp.used) {
          if(fieldSp.faceDown) {
            // Face-down karta - nabídni odhalení a aktivaci
            const kind = fieldSp.card.kind;
            if(kind === 'spell')  actions += `<button class="cp-btn cp-play" data-cp-action="reveal-spell" data-cp-slot="${slot}">✨ Odhalit a aktivovat</button>`;
            if(kind === 'arena')  actions += `<button class="cp-btn cp-play" data-cp-action="reveal-arena" data-cp-slot="${slot}">🏟 Odhalit arenu</button>`;
            if(kind === 'trap')   actions += `<button class="cp-btn" data-cp-action="reveal-trap" data-cp-slot="${slot}">🪤 Odhalit past (manuálně)</button>`;
          } else {
            if(fieldSp.card.kind === 'spell')  actions += `<button class="cp-btn cp-play" data-cp-action="activate-spell" data-cp-slot="${slot}">✨ Aktivovat</button>`;
            if(fieldSp.card.kind === 'arena')  actions += `<button class="cp-btn cp-play" data-cp-action="reveal-arena" data-cp-slot="${slot}">🏟 Aktivovat arenu</button>`;
          }
          // Vždy možnost vyhodit kartu ze slotu
          actions += `<button class="cp-btn cp-cancel" data-cp-action="discard-spell" data-cp-slot="${slot}">✕ Zahodit</button>`;
        }
      }
    }
    // Pokud je aktivní fúze výběr a jde o kartu v ruce — nabídni fúzi s kartou na poli
    if(!readOnly && context.isField && s.fuseSelection.length > 0 && context.who === 'p' && s.pMonsters[context.fieldSlot]) {
      actions += `<button class="cp-btn cp-fuse" data-cp-action="fuse-with-field" data-cp-slot="${context.fieldSlot}">⚗ Fúzovat s touto kartou</button>`;
    }

    const popup = document.createElement('div');
    popup.id = 'card-preview-popup';
    popup.className = 'card-preview-popup';
    popup.innerHTML =
      '<div class="cpp-wrap">' +
        '<button class="cpp-close" id="cpp-close">✕</button>' +
        _rcEl(card, 'lg', {}) +
        (readOnly ? '<div class="cpp-readonly">— jen náhled —</div>' : '') +
        (actions ? '<div class="cpp-actions">' + actions + '</div>' : '') +
      '</div>';
    document.body.appendChild(popup);

    // Zavřít
    popup.querySelector('#cpp-close').addEventListener('click', () => popup.remove());
    popup.addEventListener('click', e => { if(e.target === popup) popup.remove(); });
    // Klik na samotnou kartu v popup = zoom overlay
    popup.querySelector('.cx-card')?.addEventListener('click', (e) => { e.stopPropagation(); showCardZoom(card); });

    // Akce
    popup.querySelectorAll('[data-cp-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.cpAction;
        const idx = parseInt(btn.dataset.cpIdx);
        const slot = parseInt(btn.dataset.cpSlot);
        // Odstraň popup AŽ po zpracování akce (spell picker potřebuje container)
        const removePopup = () => popup.remove();
        switch(action) {
          case 'play': { removePopup();
            const freeSlot = s.pMonsters.findIndex(m=>m===null);
            if(freeSlot>=0) this._playerPlayCard(idx, freeSlot, {stance:'def', faceDown:true});
            break;
          }
          case 'play-def': { removePopup();
            const freeSlot = s.pMonsters.findIndex(m=>m===null);
            if(freeSlot>=0) this._playerPlayCard(idx, freeSlot, {stance:'def', faceDown:true});
            break;
          }
          case 'play-facedown': { removePopup();
            const freeSlot = s.pMonsters.findIndex(m=>m===null);
            if(freeSlot>=0) this._playerPlayCard(idx, freeSlot, {stance:'def', faceDown:true});
            break;
          }
          case 'fuse-select': { removePopup();
            this._toggleFuseSelect(idx);
            break;
          }
          case 'spell-now': {
            // Nezavírej popup hned - target picker potřebuje container
            // Popup se zavře až po výběru cíle
            popup.style.display = 'none'; // Schovej ale neodstraňuj
            const handIdx = Number(idx);
            const spCard = {...card};
            this._showSpellTargetPickerAfterPopup(handIdx, spCard, popup);
            return; // nevolej popup.remove() na konci
          }
          case 'spell-use': { removePopup();
            // Spell na pole lícem dolů
            const freeSlot = s.pSpells.findIndex(m=>m===null);
            if(freeSlot<0){this._log('Žádný volný slot!','warn');break;}
            s.pHand.splice(idx,1);
            s.pSpells[freeSlot]={card:{...card},faceDown:true,used:false};
            s.selectedHandIdx=null;
            this._log('◈ Karta uložena lícem dolů.','hint');
            this._render(); break;
          }
          case 'spell-save': { removePopup();
            const freeSlot = s.pSpells.findIndex(m=>m===null);
            if(freeSlot>=0) this._playerPlayCard(idx, freeSlot, null);
            else this._log('Žádný volný slot pro spell!','warn');
            break;
          }

          case 'trap-set': { removePopup();
            if(s.cardPlayedThisTurn){this._log('Již jsi zahral kartu v tomto tahu.','warn');break;}
            const freeSlot = s.pSpells.findIndex(m=>m===null);
            if(freeSlot<0){this._log('Žádný volný slot!','warn');return;}
            s.pHand.splice(idx,1);
            s.pSpells[freeSlot] = {card:{...card}, faceDown:true, used:false};
            s.cardPlayedThisTurn=true; s.selectedHandIdx=null;
            this._log(`🪤 [${card.name}] nastaven lícem dolů.`,'warn');
            break;
          }
          case 'arena-now': { removePopup();
            if(s.cardPlayedThisTurn){this._log('Již jsi zahral kartu v tomto tahu.','warn');break;}
            const freeSlot = s.pSpells.findIndex(m=>m===null);
            if(freeSlot < 0) { this._log('Žádný volný slot pro arenu!','warn'); break; }
            const aCard = {...(s.pHand[Number(idx)] || card)};
            s.pHand.splice(Number(idx), 1);
            // Aréna se pokládá face-down — aktivuje se až klikem na slot
            s.pSpells[freeSlot] = { card: aCard, faceDown: true, used: false };
            s.cardPlayedThisTurn = true; s.selectedHandIdx = null;
            this._log(`🏟 [${aCard.name}] nastavena lícem dolů — klikni pro aktivaci.`, 'warn');
            this._render(); break;
          }
          case 'arena-use': { removePopup();
            const freeSlot = s.pSpells.findIndex(m=>m===null);
            if(freeSlot<0){this._log('Žádný volný slot!','warn');break;}
            const aCard = s.pHand[Number(idx)] || card;
            s.pHand.splice(Number(idx),1);
            s.pSpells[freeSlot]={card:{...aCard},faceDown:true,used:false};
            s.selectedHandIdx=null;
            this._log('◈ Karta uložena lícem dolů.','hint');
            this._render(); break;
          }
          case 'field-swap': this._showFieldSwapPicker(idx, 'monster'); return;
          case 'swap-mode': this._enterSwapMode(idx); return;
          case 'select-attacker': this._selectAttacker(slot); break;
          case 'toggle-stance': this._toggleStance(slot); break;
          case 'reveal-facedown': { removePopup();
            const fm = s.pMonsters[slot];
            if(fm) {
              this._animateCard('p', slot, 'flip');
              setTimeout(() => { fm.faceDown = false; this._render(); }, 250);
              this._log(`👁 [${fm.card.name}] odhaleno lícem nahoru.`,'hint');
            }
            return; // _render zavolá animace
          }
          case 'activate-spell': {
            const sp = s.pSpells[slot];
            if(sp) { this._showSpellTargetPicker(-1, sp.card, slot); }
            break;
          }
          case 'reveal-spell': { removePopup();
            const sp = s.pSpells[slot];
            if(sp) { sp.faceDown = false; this._render(); this._showSpellTargetPicker(-1, sp.card, slot); }
            break;
          }
          case 'reveal-arena': { removePopup();
            const sp = s.pSpells[slot];
            if(sp) {
              sp.faceDown = false;
              this._activateSpell(sp.card, 'p');
              // Arena zůstává na slotu — nemaže se ani neposílá do GY
              this._log(`🏟 [${sp.card.name}] aktivována!`, 'sys');
              this._render();
            }
            break;
          }
          case 'reveal-trap': { removePopup();
            const sp = s.pSpells[slot];
            if(sp) { sp.faceDown = false; this._log(`🪤 Past odhalena — ale žádný útok!`, 'warn'); this._render(); }
            break;
          }
          case 'discard-spell': { removePopup();
            const sp = s.pSpells[slot];
            if(sp) { s.pGY.push(sp.card); s.pSpells[slot] = null; this._log(`[${sp.card.name}] zahozena.`, 'hint'); this._render(); }
            break;
          }
          case 'fuse-with-field': this._toggleFuseField(slot); break;
        }
        this._render();
      });
    });
  },

  // ── BIND EVENTS ───────────────────────────────────────────────────────────
  // v2 INPUT SYSTEM — Click-based, konzistentní.
  // PRAVIDLA:
  //   Click = HLAVNÍ AKCE (zahrát, vybrat útočníka, zaútočit, zahrát do slotu)
  //   Contextmenu / Long-press = PREVIEW (vždy, všude)
  //   Fúze = ⚗ tlačítko v ruce, nebo auto-detekce při výběru 2 monster
  // Volá se JEDNOU při init(), ne při každém renderu.
  _bindEvents() {
    const s = this._state;
    if(!s) return;

    // AbortController pro čisté odstranění všech listenerů při destroy
    if(this._evtController) this._evtController.abort();
    this._evtController = new AbortController();
    const signal = this._evtController.signal;

    const HOLD_MS = 400;
    const closest = (e, sel) => e.target.closest(sel);

    // ── Long-press state ─────────────────────────────────────────────────
    let _holdTimer = null;
    let _holdFired = false;

    const _startHold = (onHold) => {
      _holdFired = false;
      clearTimeout(_holdTimer);
      _holdTimer = setTimeout(() => { _holdFired = true; onHold(); }, HOLD_MS);
    };
    const _cancelHold = () => { clearTimeout(_holdTimer); };
    const _wasHold    = () => {
      if(_holdFired) { _holdFired = false; return true; }
      return false;
    };

    // ── POINTERDOWN — start long-press detection ─────────────────────────
    this._container.addEventListener('pointerdown', e => {
      const s = this._state;
      if(!s) return;

      // Stance button — žádný hold, jen click
      if(closest(e, '[data-stance]')) return;

      // Hand card — long press = preview
      const handEl = closest(e, '[data-hand]');
      if(handEl) {
        const idx = parseInt(handEl.dataset.hand);
        _startHold(() => {
          const card = s.pHand[idx];
          if(card) this._showCardPreview(card, {who:'p', isHand:true, handIdx:idx});
        });
        return;
      }
      // Player monster — long press = preview
      const pSlot = closest(e, '.sl[data-who="p"][data-slot]');
      if(pSlot && !closest(e, '[data-stance]')) {
        const slot = parseInt(pSlot.dataset.slot);
        _startHold(() => {
          const fm = s.pMonsters[slot];
          if(fm) this._showCardPreview(fm.card, {who:'p', isField:true, fieldSlot:slot});
        });
        return;
      }
      // Enemy monster — long press = preview (jen odhalené)
      const eSlot = closest(e, '.sl[data-who="e"][data-slot]');
      if(eSlot) {
        const slot = parseInt(eSlot.dataset.slot);
        _startHold(() => {
          const em = s.eMonsters[slot];
          if(em && em.revealed) this._showCardPreview(em.card, {who:'e', isField:true, fieldSlot:slot});
        });
        return;
      }
      // Player spell slot — long press = preview
      const pSpell = closest(e, '.sl[data-who="p"][data-spell-slot]');
      if(pSpell) {
        const slot = parseInt(pSpell.dataset.spellSlot);
        _startHold(() => {
          const sp = s.pSpells[slot];
          if(sp) this._showCardPreview(sp.card, {who:'p', isSpell:true, spellSlot:slot, faceDown:sp.faceDown});
        });
        return;
      }
      // Enemy spell slot — long press = preview
      const eSpell = closest(e, '.sl[data-who="e"][data-spell-slot]');
      if(eSpell) {
        const slot = parseInt(eSpell.dataset.spellSlot);
        _startHold(() => {
          const sp = s.eSpells[slot];
          if(sp && !sp.faceDown) this._showCardPreview(sp.card, {who:'e', isSpell:true, spellSlot:slot});
        });
        return;
      }
    }, { signal });

    // ── POINTERUP — cancel hold if not fired ─────────────────────────────
    this._container.addEventListener('pointerup', () => {
      _cancelHold();
      // Pokud hold proběhl, _holdFired=true blokuje následný click (sežere ho _wasHold).
      // Po 100ms reset, aby další kliky už fungovaly normálně.
      if(_holdFired) setTimeout(() => { _holdFired = false; }, 100);
    }, { signal });
    this._container.addEventListener('pointerleave', () => _cancelHold(), { capture: true, signal });

    // ── CONTEXTMENU — right-click = preview (desktop) ────────────────────
    this._container.addEventListener('contextmenu', e => {
      e.preventDefault();
      const s = this._state;
      if(!s) return;

      const handEl = closest(e, '[data-hand]');
      if(handEl) {
        const card = s.pHand[parseInt(handEl.dataset.hand)];
        if(card) this._showCardPreview(card, {who:'p', isHand:true, handIdx:parseInt(handEl.dataset.hand)});
        return;
      }
      const pSlot = closest(e, '.sl[data-who="p"][data-slot]');
      if(pSlot) {
        const fm = s.pMonsters[parseInt(pSlot.dataset.slot)];
        if(fm) this._showCardPreview(fm.card, {who:'p', isField:true, fieldSlot:parseInt(pSlot.dataset.slot)});
        return;
      }
      const eSlot = closest(e, '.sl[data-who="e"][data-slot]');
      if(eSlot) {
        const em = s.eMonsters[parseInt(eSlot.dataset.slot)];
        if(em && em.revealed) this._showCardPreview(em.card, {who:'e', isField:true, fieldSlot:parseInt(eSlot.dataset.slot)});
        return;
      }
      const pSpell = closest(e, '.sl[data-who="p"][data-spell-slot]');
      if(pSpell) {
        const sp = s.pSpells[parseInt(pSpell.dataset.spellSlot)];
        if(sp) this._showCardPreview(sp.card, {who:'p', isSpell:true, spellSlot:parseInt(pSpell.dataset.spellSlot), faceDown:sp.faceDown});
        return;
      }
      const eSpell = closest(e, '.sl[data-who="e"][data-spell-slot]');
      if(eSpell) {
        const sp = s.eSpells[parseInt(eSpell.dataset.spellSlot)];
        if(sp && !sp.faceDown) this._showCardPreview(sp.card, {who:'e', isSpell:true, spellSlot:parseInt(eSpell.dataset.spellSlot)});
        return;
      }
    }, { signal });

    // ── Prevent double-click zoom ────────────────────────────────────────
    this._container.addEventListener('dblclick', e => e.preventDefault(), { signal });

    // ── CLICK — jediný handler pro VŠECHNY akce ──────────────────────────
    this._container.addEventListener('click', e => {
      const s = this._state;
      if(!s) return;

      // Pokud long-press právě proběhl → ignoruj následný click
      if(_wasHold()) { _holdFired = false; return; }

      // ── UI Buttons (always active) ─────────────────────────────────────
      if(closest(e, '#btn-end-turn'))    { this._endTurn(); return; }
      if(closest(e, '#btn-pause'))       { this._showPause(); return; }
      if(closest(e, '#btn-cancel-atk'))  {
        s.attackerSlot = null;
        this._setPhase(s.cardPlayedThisTurn ? 'field' : 'hand');
        this._render();
        return;
      }
      if(closest(e, '#btn-confirm-fuse')) { this._confirmFuse(); return; }
      if(closest(e, '#btn-cancel-fuse'))  { this._cancelFuse(); return; }
      if(closest(e, '#btn-fuse-go')) {
        const ids = s.fuseSelection.map(i => s.pHand[i]?.id).filter(Boolean);
        const result = findFusion(ids);
        if(result) this._showFusePreview(result, s.fuseSelection, null, false);
        else this._executeBurnFuse();
        return;
      }
      if(closest(e, '#btn-exp-fuse'))    { this._executeBurnFuse(); return; }
      if(closest(e, '#btn-clear-fuse'))  { s.fuseSelection = []; this._render(); return; }
      // Fúze mód — vstup (z action baru)
      if(closest(e, '#btn-fuse-mode')) {
        if(!s.isPlayerTurn || s.busy || s.over) return;
        s.fuseSelection = [];
        const firstMonster = s.pHand.findIndex(c => c.kind === 'monster');
        if(firstMonster >= 0) s.fuseSelection.push(firstMonster);
        this._render();
        return;
      }

      // ── ZAHODIT z ruky ────────────────────────────────────────────────────
      const discardBtn = closest(e, '[data-discard]');
      if(discardBtn) {
        if(!s.isPlayerTurn || s.busy || s.over) return;
        const di = parseInt(discardBtn.dataset.discard);
        const dc = s.pHand[di];
        if(dc && dc.kind !== 'letter') {
          s.pGY.push(s.pHand.splice(di, 1)[0]);
          if(s.selectedHandIdx === di) s.selectedHandIdx = null;
          else if(s.selectedHandIdx > di) s.selectedHandIdx--;
          s.fuseSelection = s.fuseSelection.filter(x => x !== di).map(x => x > di ? x-1 : x);
          this._log(`🗑 [${dc.name}] zahozena.`, 'hint');
          this._render();
        }
        return;
      }

      // Stance buttons (always clickable even during busy — it's a field toggle)
      const stanceBtn = closest(e, '[data-stance]');
      if(stanceBtn) { this._toggleStance(parseInt(stanceBtn.dataset.stance)); return; }

      // ── Guard: player turn, not busy, not over ─────────────────────────
      const canAct = s.isPlayerTurn && !s.busy && !s.over;

      // ── HAND CARD — click = VYBER (select-then-place) ─────────────────
      const handEl = closest(e, '[data-hand]');
      if(handEl) {
        if(!canAct) return;
        const idx  = parseInt(handEl.dataset.hand);
        const card = s.pHand[idx];
        if(!card) return;

        // Fúze mód aktivní → toggle výběr pro fúzi
        if(s.fuseSelection.length > 0 && card.kind === 'monster') {
          this._toggleFuseSelect(idx);
          return;
        }

        // Jiná karta z ruky vybrána + obě jsou monstra → zkus přímou fúzi
        if(s.selectedHandIdx !== null && s.selectedHandIdx !== idx
           && card.kind === 'monster') {
          const sel = s.pHand[s.selectedHandIdx];
          if(sel?.kind === 'monster' && !s.cardPlayedThisTurn) {
            const fusionResult = findFusion([sel.id, card.id]);
            if(fusionResult) {
              const slot = s.pMonsters.findIndex(m => m === null);
              if(slot < 0) { this._log('Žádný volný slot!', 'warn'); return; }
              const [hi, lo] = s.selectedHandIdx > idx ? [s.selectedHandIdx, idx] : [idx, s.selectedHandIdx];
              const c1 = s.pHand.splice(hi, 1)[0];
              const c2 = s.pHand.splice(lo, 1)[0];
              s.pGY.push(c1); s.pGY.push(c2);
              s.pMonsters[slot] = { card:{...fusionResult, kind:'monster'}, mode:'atk', hasAttacked:false, faceDown:false };
              this._applyArenaToMonster(s.pMonsters[slot]);
              if(fusionResult) GameState.addDiscoveredFusion(fusionResult.id);
              s.cardPlayedThisTurn=true; s.afterFusion=true;
              s.fuseSelection=[]; s.selectedHandIdx=null; s.stats.fusionsUsed++;
              this._flashScreen('#b570e0'); this._fuseFlash();
              EventBus.emit('sfx:play', 'fusion');
              this._log(`✦ FÚZE! [${c1.name}] + [${c2.name}] → [${fusionResult.name}] ATK:${fusionResult.atk}`, 'fuse');
              s.afterFusion = true;
              this._setPhase('field'); this._render();
              return;
            }
          }
        }

        // Toggle výběr — klik na stejnou kartu = zrušit
        if(s.selectedHandIdx === idx) {
          s.selectedHandIdx = null;
        } else {
          s.selectedHandIdx = idx;
        }
        this._render();
        return;
      }

      // ── PLAYER MONSTER SLOT — click = polož monster PŘÍMO / vyber útočníka ──
      const pSlot = closest(e, '.sl[data-who="p"][data-slot]');
      if(pSlot && !closest(e, '[data-stance]')) {
        if(!canAct) return;
        const slot = parseInt(pSlot.dataset.slot);
        const fm   = s.pMonsters[slot];

        // Fúze mód
        if(s.fuseSelection.length > 0 && fm) {
          this._toggleFuseField(slot);
          return;
        }

        // Vybraná karta z ruky + slot OBSAZENÝ → fúze nebo přímá výměna (1 klik)
        if(s.selectedHandIdx !== null && fm) {
          const hCard = s.pHand[s.selectedHandIdx];
          if(hCard?.kind === 'monster') {
            if(s.cardPlayedThisTurn) { this._log('Již jsi zahral kartu tento tah.', 'warn'); s.selectedHandIdx=null; this._render(); return; }
            const fusionResult = findFusion([hCard.id, fm.card.id]);
            if(fusionResult) {
              const hi = s.selectedHandIdx;
              s.pGY.push(s.pHand.splice(hi, 1)[0]);
              s.pGY.push(fm.card);
              s.pMonsters[slot] = { card:{...fusionResult, kind:'monster'}, mode:fm.mode, hasAttacked:false, faceDown:false };
              this._applyArenaToMonster(s.pMonsters[slot]);
              if(fusionResult) GameState.addDiscoveredFusion(fusionResult.id);
              s.cardPlayedThisTurn=true; s.afterFusion=true;
              s.fuseSelection=[]; s.selectedHandIdx=null; s.stats.fusionsUsed++;
              this._flashScreen('#b570e0'); this._fuseFlash();
              EventBus.emit('sfx:play', 'fusion');
              this._log(`✦ FÚZE! [${hCard.name}] + [${fm.card.name}] → [${fusionResult.name}] ATK:${fusionResult.atk}`, 'fuse');
            } else {
              const hi = s.selectedHandIdx;
              const newCard = s.pHand.splice(hi, 1)[0];
              s.pGY.push(fm.card);
              s.pMonsters[slot] = { card:{...newCard}, mode:'atk', hasAttacked:false, faceDown:false };
              this._applyArenaToMonster(s.pMonsters[slot]);
              s.cardPlayedThisTurn=true;
              s.fuseSelection=[]; s.selectedHandIdx=null;
              EventBus.emit('sfx:play', 'card_play');
              this._log(`⇄ [${fm.card.name}] zahozen, [${newCard.name}] nasazen.`, 'sys');
            }
            this._setPhase('field'); this._render();
            return;
          }
        }

        // Vybraná karta z ruky → POLOŽ PŘÍMO (monster vždy face-down DEF)
        if(s.selectedHandIdx !== null && !fm) {
          const card = s.pHand[s.selectedHandIdx];
          if(card?.kind === 'monster') {
            if(s.cardPlayedThisTurn) { this._log('Již jsi zahral kartu tento tah.', 'warn'); return; }
            this._playerPlayCard(s.selectedHandIdx, slot, { stance: 'def', faceDown: true });
            return;
          }
        }

        // Karta na poli → vybrat/zrušit útočníka
        if(fm) {
          if(s.attackerSlot === slot) {
            s.attackerSlot = null;
            this._setPhase(s.cardPlayedThisTurn ? 'field' : 'hand');
            this._render();
            return;
          }
          if(s.canAttack && !fm.hasAttacked) {
            this._selectAttacker(slot);
          }
          return;
        }
        return;
      }

      // ── PLAYER SPELL SLOT — click = polož spell/trap PŘÍMO / aktivuj ──
      const pSpell = closest(e, '.sl[data-who="p"][data-spell-slot]');
      if(pSpell) {
        if(!canAct) return;
        const slot = parseInt(pSpell.dataset.spellSlot);
        const sp   = s.pSpells[slot];

        // Vybraná karta → polož přímo face-down
        if(s.selectedHandIdx !== null && !sp) {
          const card = s.pHand[s.selectedHandIdx];
          if(card?.kind === 'spell' || card?.kind === 'arena' || card?.kind === 'trap') {
            if(s.cardPlayedThisTurn) { this._log('Již jsi zahral kartu tento tah.', 'warn'); return; }
            this._playerPlayCard(s.selectedHandIdx, slot, null);
            return;
          }
        }

        // Vybraná karta z ruky + slot OBSAZENÝ → přímá výměna (1 klik)
        if(s.selectedHandIdx !== null && sp) {
          const hCard = s.pHand[s.selectedHandIdx];
          if((hCard?.kind === 'spell' || hCard?.kind === 'arena' || hCard?.kind === 'trap') && !s.cardPlayedThisTurn) {
            const hi = s.selectedHandIdx;
            s.pGY.push(sp.card);
            // Trap i arena se pokládají lícem dolů (aréna se aktivuje až klikem)
            const fd = (hCard.kind === 'trap' || hCard.kind === 'arena');
            s.pSpells[slot] = { card:{...hCard}, faceDown: fd, used:false };
            s.pHand.splice(hi, 1);
            s.cardPlayedThisTurn=true; s.selectedHandIdx=null;
            EventBus.emit('sfx:play', 'card_play');
            this._log(`⇄ [${sp.card.name}] zahozen, [${hCard.name}] nasazen.`, 'sys');
            this._render();
            return;
          }
        }

        // Existující karta na poli → aktivuj
        if(sp && !sp.used) {
          // Face-down aréna → odhal + aktivuj
          if(sp.faceDown && sp.card.kind === 'arena') {
            sp.faceDown = false;
            this._render();
            this._activateSpell(sp.card, 'p');
            return;
          }
          // Spell (face-down i face-up) → otevři target picker
          if(sp.card.kind === 'spell') {
            if(sp.faceDown) sp.faceDown = false;
            this._render();
            this._showSpellTargetPicker(-1, sp.card, slot);
            return;
          }
          // Face-up aréna → re-aktivuj efekt (volitelné použití)
          if(!sp.faceDown && sp.card.kind === 'arena') {
            this._activateSpell(sp.card, 'p');
            return;
          }
        }
        return;
      }

      // ── ENEMY MONSTER SLOT — click = ZAÚTOČIT ─────────────────────────
      const eSlot = closest(e, '.sl[data-who="e"][data-slot]');
      if(eSlot) {
        const slot = parseInt(eSlot.dataset.slot);

        // Útočník vybrán → útok na cíl
        if(s.attackerSlot !== null && !s.busy && !s.over) {
          this._selectTarget(slot);
          return;
        }

        // Žádný útočník → auto-select prvního volného a zaútoč
        if(canAct && s.canAttack) {
          const unused = s.pMonsters
            .map((m,i) => ({m,i}))
            .filter(x => x.m && !x.m.hasAttacked && !x.m.faceDown && x.m.mode === 'atk');
          if(unused.length) {
            s.attackerSlot = unused[0].i;
            this._setPhase('attack');
            this._render();
            setTimeout(() => this._selectTarget(slot), 250);
          }
        }
        return;
      }

      // ── ENEMY SPELL SLOT — click = nic ─────────────────────────────────

      // ── ENEMY HEADER — přímý útok na LP ───────────────────────────────
      const enemyH = closest(e, '.enemy-header');
      if(enemyH && !closest(e, '[data-slot]')) {
        if(s.attackerSlot !== null && !s.busy && !s.over) {
          this._selectTarget(null);
          return;
        }
        if(canAct && s.canAttack && !s.eMonsters.some(m => m)) {
          const unused = s.pMonsters.map((m,i) => ({m,i})).filter(x => x.m && !x.m.hasAttacked && !x.m.faceDown);
          if(unused.length) { s.attackerSlot = unused[0].i; this._selectTarget(null); }
        }
        return;
      }
    }, { signal });
  },

  // ── STYLY ─────────────────────────────────────────────────────────────────

  // ── CARD IMAGE PATH — cesta k artwork obrázku karty ─────────────────────
  _cardImgPath(card) {
    if(!card?.id) return null;
    const id = String(card.id).padStart(3, '0');
    const name = (card.name || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    return `assets/images/cards/${id}_${name}.jpg`;
  },

  // ── SDÍLENÝ RENDER KARTY — 3 velikosti ────────────────────────────────────
  // size: 'sm' | 'md' | 'lg'
  // opts: { selected, def, target, used, revealing, inFuse, attacker, faceDown, isHand, noHover }
  _renderCardEl(card, size='md', opts={}) {
    // Přidej scar data z GameState pokud není explicitně zadáno
    // Přidej scar data
    if(card?.id && !opts.scarCount) {
      const sd = GameState.cardScars?.[card.id];
      if(sd?.scars > 0) opts = { ...opts, scarCount: sd.scars };
    }
    // Deleguj na CardRenderer — zajistí artwork pokud existuje
    return _rcEl(card, size, opts);
  },

  _injectStyles() {
    injectCardStyles();
    if(document.getElementById('battle-styles')) return;

    if(!document.getElementById('conflux-fonts')) {
      const l = document.createElement('link');
      l.id = 'conflux-fonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Share+Tech+Mono&family=VT323&display=swap';
      document.head.appendChild(l);
    }

    const style = document.createElement('style');
    style.id = 'battle-styles';
    style.textContent = `
      *{box-sizing:border-box;margin:0;padding:0;}
      /* Touch/gesture support — prevent context menu on hold, prevent zoom */
      .battle-screen, .hand-row, .row, .sl, .h-sl {
        touch-action: manipulation;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }
      :root{
        --bg:#03050a; --synth:#4fa3e0; --organic:#e04f6a;
        --hybrid:#50e0b8; --corruption:#b570e0; --gold:#d4a843;
        --dim:#1e3048; --muted:#080e16;
        --px:'Press Start 2P',monospace;
        --mono:'Share Tech Mono',monospace;
        --vt:'VT323',monospace;
        --cw:clamp(64px,7.5vw,105px);
        --ch:clamp(90px,10.5vw,147px);
      }
      html,body{width:100%;height:100%;overflow:hidden;background:var(--bg);color:#cce0f0;font-family:var(--mono);}

      /* ── ATMOSFÉRA ── */
      #atmo{position:fixed;inset:0;z-index:0;pointer-events:none;transition:all 1.4s ease;}
      body.ph-hand  #atmo{background:radial-gradient(ellipse 100% 55% at 50% 115%,rgba(79,163,224,0.13) 0%,transparent 55%),radial-gradient(ellipse 50% 25% at 5% 115%,rgba(80,224,184,0.05) 0%,transparent 50%);}
      body.ph-field #atmo{background:radial-gradient(ellipse 80% 55% at 50% 55%,rgba(79,163,224,0.08) 0%,transparent 60%);}
      body.ph-attack #atmo{background:radial-gradient(ellipse 70% 40% at 50% 50%,rgba(212,168,67,0.13) 0%,transparent 55%);animation:ab .45s step-end infinite;}
      body.ph-enemy #atmo{background:radial-gradient(ellipse 100% 55% at 50% -15%,rgba(224,79,106,0.13) 0%,transparent 55%);}
      @keyframes ab{0%,100%{opacity:1}50%{opacity:.88}}
      #atmo::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.09) 2px,rgba(0,0,0,0.09) 3px);}

      /* flash */
      #flash{position:fixed;inset:0;z-index:200;pointer-events:none;opacity:0;transition:opacity .12s;background:rgba(255,255,255,0.07);}
      #flash.on{opacity:1;}

      /* ── BATTLE SCREEN ── */
      @keyframes battle-in{from{opacity:0;transform:scale(1.015)}to{opacity:1;transform:none}}
      .battle-screen{width:100%;height:100vh;display:flex;flex-direction:column;position:relative;overflow:hidden;animation:battle-in .55s ease both;}
      .battle-bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0.42;filter:brightness(1.12) saturate(1.06);z-index:0;pointer-events:none;transition:background-image 0.8s ease,opacity 0.8s ease;}
      /* "TVOJE KARTA" — mirror/profilující nepřítel hraje kartu z tvého decku */
      @keyframes yc-in{from{opacity:0;transform:translateX(-50%) translateY(4px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      .cf-yourcard{position:absolute;top:-9px;left:50%;transform:translateX(-50%);z-index:35;font-family:var(--mono);font-size:8px;letter-spacing:1px;color:#8fd0ff;background:rgba(4,7,11,0.92);border:1px solid rgba(79,163,224,0.6);padding:1px 6px;white-space:nowrap;box-shadow:0 0 10px rgba(79,163,224,0.45);pointer-events:none;animation:yc-in .4s ease both;}

      /* ── CORRUPTION VIZUÁLNÍ EFEKTY (skryté — hráč neví proč) ── */
      .corr-glitch::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:100;
        background:transparent;animation:corr-g 8s ease infinite;opacity:0;}
      @keyframes corr-g{0%,95%{opacity:0}96%{opacity:1;background:rgba(155,89,182,0.03)}100%{opacity:0}}

      .corr-interference::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:100;
        background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(155,89,182,0.02) 3px,rgba(155,89,182,0.02) 4px);
        animation:corr-i 4s ease infinite;}
      @keyframes corr-i{0%,90%{opacity:0}92%{opacity:1}100%{opacity:0}}

      .corr-resonance{animation:corr-r 4s ease infinite;}
      .corr-resonance::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:100;
        border:2px solid transparent;animation:corr-rb 3s ease infinite;}
      @keyframes corr-r{0%,100%{filter:none}50%{filter:hue-rotate(3deg) saturate(1.05)}}
      @keyframes corr-rb{0%,85%{border-color:transparent}90%{border-color:rgba(155,89,182,0.1)}100%{border-color:transparent}}

      .corr-collapse{animation:corr-c 2.5s ease infinite;}
      .corr-collapse::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:100;
        background:linear-gradient(180deg,rgba(155,89,182,0.02),transparent,rgba(155,89,182,0.02));
        animation:corr-cb 3s linear infinite;}
      @keyframes corr-c{0%,100%{filter:none}30%{filter:hue-rotate(4deg)}60%{filter:hue-rotate(-3deg)}}
      @keyframes corr-cb{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}

      /* ── LP ROW ── */
      .lp-row{position:relative;z-index:20;display:flex;align-items:center;padding:10px 16px 16px;flex-shrink:0;gap:10px;background:linear-gradient(to bottom,rgba(4,7,11,0.86) 0%,rgba(4,7,11,0.4) 62%,rgba(4,7,11,0) 100%);border-bottom:none;}
      .lp-block{display:flex;align-items:center;gap:10px;flex:1;position:relative;overflow:visible;}
      .lp-block.e{flex-direction:row-reverse;}
      /* Portrait */
      .lp-portrait{width:clamp(32px,3.5vw,48px);height:clamp(32px,3.5vw,48px);border-radius:50%;object-fit:cover;object-position:center top;border:2px solid rgba(255,255,255,0.1);flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.5);}

      /* LP kruh */
      .lp-ring{width:clamp(40px,4.2vw,56px);height:clamp(40px,4.2vw,56px);flex-shrink:0;position:relative;}
      .lp-ring svg{width:100%;height:100%;transform:rotate(-90deg);}
      .r-bg  {fill:none;stroke:rgba(255,255,255,0.06);stroke-width:3.5;}
      .r-fill{fill:none;stroke-width:3.5;stroke-linecap:round;transition:stroke-dashoffset .9s ease,stroke .6s ease;}
      .lp-ring-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--px);font-size:clamp(3px,.38vw,5px);color:rgba(255,255,255,0.5);text-align:center;}

      .lp-info{display:flex;flex-direction:column;gap:2px;}
      .lp-name{font-family:var(--px);font-size:clamp(4px,.45vw,6px);color:var(--dim);letter-spacing:1px;}
      .lp-val{font-family:var(--vt);font-size:clamp(24px,2.6vw,36px);line-height:1;transition:color .5s;}
      .lp-danger{color:#e04f6a !important;animation:lp-dng .5s ease infinite;}
      @keyframes lp-dng{0%,100%{opacity:1}50%{opacity:.45}}
      .lp-deck-info{font-family:var(--mono);font-size:clamp(8px,.85vw,10px);color:var(--dim);letter-spacing:1px;margin-top:1px;}

      .lp-mid{display:flex;flex-direction:column;align-items:center;gap:3px;padding:0 10px;flex-shrink:0;}
      .lp-phase{font-family:var(--px);font-size:clamp(5px,.55vw,7px);letter-spacing:2px;transition:color .5s;}
      body.ph-hand   .lp-phase{color:var(--synth);}
      body.ph-field  .lp-phase{color:var(--hybrid);}
      body.ph-attack .lp-phase{color:var(--gold);}
      body.ph-enemy  .lp-phase{color:var(--organic);}
      .lp-tah{font-family:var(--mono);font-size:clamp(8px,.9vw,11px);color:var(--dim);}

      /* ── 3D SCÉNA ── */
      .scene{position:relative;z-index:5;flex:1;min-height:0;perspective:clamp(500px,65vw,850px);perspective-origin:50% 50%;display:flex;align-items:center;justify-content:center;overflow:hidden;transition:flex 0.5s ease;}
      /* Board zooms in when hand is hidden */
      body.ph-field .scene, body.ph-attack .scene { flex:1.3; }
      .board{width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;gap:clamp(2px,0.4vh,6px);padding:4px 0;position:relative;transform-origin:50% 50%;transition:transform 1s cubic-bezier(.4,0,.2,1);}
      body.ph-hand   .board{transform:rotateX(8deg) translateY(-3%) scale(0.95);}
      body.ph-field  .board{transform:rotateX(2deg) scale(1.05);}
      body.ph-attack .board{transform:rotateX(-3deg) scale(1.08);}
      body.ph-enemy  .board{transform:rotateX(-8deg) translateY(4%) scale(0.95);}
      .field-frame{position:absolute;top:4px;bottom:4px;left:clamp(6px,1.5vw,18px);right:clamp(6px,1.5vw,18px);pointer-events:none;z-index:1;border:1px solid;transition:border-color 1.2s ease,box-shadow 1.2s ease;background:rgba(8,14,24,0.4);}
      body.ph-hand   .field-frame{border-color:rgba(79,163,224,0.35);box-shadow:inset 0 0 80px rgba(79,163,224,0.08),0 0 20px rgba(79,163,224,0.05);}
      body.ph-field  .field-frame{border-color:rgba(80,224,184,0.28);box-shadow:inset 0 0 80px rgba(80,224,184,0.07),0 0 20px rgba(80,224,184,0.04);}
      body.ph-attack .field-frame{border-color:rgba(212,168,67,0.45);box-shadow:inset 0 0 90px rgba(212,168,67,0.12),0 0 25px rgba(212,168,67,0.08);}
      body.ph-enemy  .field-frame{border-color:rgba(224,79,106,0.35);box-shadow:inset 0 0 80px rgba(224,79,106,0.08),0 0 20px rgba(224,79,106,0.05);}

      /* Rohové akcenty */
      .field-frame::before,.field-frame::after{content:'';position:absolute;width:14px;height:14px;border-color:inherit;border-style:solid;}
      .field-frame::before{top:-1px;left:-1px;border-width:2px 0 0 2px;}
      .field-frame::after{bottom:-1px;right:-1px;border-width:0 2px 2px 0;}

      /* Toast */
      .toast{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:40;pointer-events:none;font-family:var(--mono);font-size:clamp(9px,1vw,12px);padding:4px 14px;border:1px solid rgba(79,163,224,0.18);background:rgba(2,4,8,0.94);color:var(--synth);white-space:nowrap;opacity:0;transition:opacity .3s;}
      .toast.on{opacity:1;}

      /* ── ŘADY ── */
      .row{display:flex;justify-content:center;gap:clamp(3px,.4vw,6px);padding:0 clamp(6px,1.5vw,18px);position:relative;z-index:2;}

      /* Divider */
      .divider{display:flex;align-items:center;gap:10px;padding:0 clamp(6px,1.5vw,18px);flex-shrink:0;position:relative;z-index:2;}
      .divider::before,.divider::after{content:'';flex:1;height:1px;transition:background 1.2s;}
      body.ph-hand   .divider::before,body.ph-hand   .divider::after{background:linear-gradient(90deg,transparent,rgba(79,163,224,0.3),transparent);}
      body.ph-field  .divider::before,body.ph-field  .divider::after{background:linear-gradient(90deg,transparent,rgba(80,224,184,0.25),transparent);}
      body.ph-attack .divider::before,body.ph-attack .divider::after{background:linear-gradient(90deg,transparent,rgba(212,168,67,0.4),transparent);}
      body.ph-enemy  .divider::before,body.ph-enemy  .divider::after{background:linear-gradient(90deg,transparent,rgba(224,79,106,0.3),transparent);}
      .div-txt{font-family:var(--px);font-size:clamp(5px,.55vw,7px);letter-spacing:2px;white-space:nowrap;transition:color .5s;}
      body.ph-hand   .div-txt{color:rgba(79,163,224,0.65);}
      body.ph-field  .div-txt{color:rgba(80,224,184,0.6);}
      body.ph-attack .div-txt{color:rgba(212,168,67,0.75);}
      body.ph-enemy  .div-txt{color:rgba(224,79,106,0.65);}

      /* ── SLOTY — velikost odpovídá cx-sm (66×92) ── */
      .sl{width:66px;height:92px;flex-shrink:0;position:relative;cursor:pointer;}
      .sl-e{width:100%;height:100%;border:1px solid rgba(255,255,255,0.1);background:rgba(10,16,28,0.7);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.08);font-size:16px;transition:all .3s;border-radius:2px;}
      .sl.open .sl-e{border-color:rgba(79,163,224,0.35);background:rgba(10,16,28,0.85);animation:op 2s ease infinite;}
      @keyframes op{0%,100%{border-color:rgba(79,163,224,0.25);box-shadow:inset 0 0 8px rgba(79,163,224,0.05)}50%{border-color:rgba(79,163,224,0.55);box-shadow:inset 0 0 18px rgba(79,163,224,0.12)}}
      .sl.def{transform:rotate(6deg) translateY(2px);}
      .sl.sl-used{opacity:.45;}
      .sl.sl-atk .cx-card{box-shadow:0 0 0 2px var(--gold),0 0 18px rgba(212,168,67,0.45);}
      .sl.sl-target .cx-facedown,.sl.sl-target .cx-card{animation:tg .45s ease infinite alternate;}
      .sl-swap .cx-card,.sl-swap .sl-e{box-shadow:0 0 0 1px var(--gold);}

      /* ── Face-down hint pro spell sloty ── */
      .sl-fd-hint{position:absolute;left:0;right:0;bottom:-12px;font-size:7px;line-height:1.1;text-align:center;color:rgba(255,255,255,0.55);letter-spacing:.5px;text-transform:uppercase;pointer-events:none;text-shadow:0 1px 2px rgba(0,0,0,0.8);}
      .sl-fd-hint.sl-fd-arena{color:rgba(212,168,67,0.85);}
      .sl-fd-hint.sl-fd-trap{color:rgba(224,79,106,0.85);}
      .sl-fd.sl-fd-arena-slot .cx-facedown{box-shadow:inset 0 0 0 1px rgba(212,168,67,0.45);}
      .sl-fd.sl-fd-trap-slot .cx-facedown{box-shadow:inset 0 0 0 1px rgba(224,79,106,0.45);}

      /* ── cx-card state hooks for battle (slot context) ── */
      .sl .cx-card { width:100%; height:100%; cursor:pointer; }
      .sl .cx-card:hover { transform:none; } /* disable hover in slots — slot handles it */
      .h-sl .cx-card { width:100%; height:100%; cursor:pointer; }

      /* cx-card animation classes */
      .cx-card.an-atk  { animation:an-a .4s cubic-bezier(.2,1,.3,1) forwards; }
      .cx-card.an-hit  { animation:an-h .35s ease; }
      .cx-card.an-dest { animation:an-d .45s ease forwards; }
      .cx-card.an-flip { animation:an-f .4s ease; }
      .cx-facedown.an-flip { animation:an-f .4s ease; }
      @keyframes an-a { 0%{transform:translateY(0) scale(1)} 40%{transform:translateY(-35px) scale(1.1);filter:brightness(1.3)} 70%{transform:translateY(-30px) scale(1.05)} 100%{transform:translateY(0) scale(1);filter:none} }
      @keyframes an-h { 0%{transform:translateX(0);filter:none} 25%{transform:translateX(-8px) scale(.95);filter:brightness(2) saturate(.2)} 50%{transform:translateX(6px) scale(.97)} 75%{transform:translateX(-3px)} 100%{transform:translateX(0);filter:none} }
      @keyframes an-d { 0%{opacity:1;transform:scale(1)} 30%{opacity:.8;transform:scale(1.12);filter:brightness(2.5)} 100%{opacity:0;transform:scale(.4) translateY(20px);filter:brightness(3) saturate(0)} }
      @keyframes an-f { 0%{transform:rotateY(0)} 49%{transform:rotateY(90deg)} 51%{transform:rotateY(-90deg)} 100%{transform:rotateY(0)} }
      @keyframes tg{from{box-shadow:0 0 0 2px var(--organic),0 0 8px rgba(224,79,106,0.3)}to{box-shadow:0 0 0 2px var(--organic),0 0 24px rgba(224,79,106,0.7)}}

      /* Slot animace při zahraní karty z ruky */
      .sl-place-anim .cx-card,.sl-place-anim .cx-facedown { animation:sl-place .4s cubic-bezier(.2,1.4,.4,1) forwards; }
      @keyframes sl-place { 0%{transform:translateY(-30px) scale(.85);opacity:0} 100%{transform:none;opacity:1} }

      .anim-attack .cx-card{animation:an-a .55s ease forwards;}
      .anim-hit .cx-card{animation:an-h .4s ease;}
      .anim-activate .cx-card{animation:an-f .5s ease;}

      /* Scar overlay */
      .scar{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(-48deg,transparent,transparent 9px,rgba(224,79,106,0.07) 9px,rgba(224,79,106,0.07) 10px);}
      .scar-badge{position:absolute;top:2px;right:2px;font-family:var(--mono);font-size:7px;color:#b570e0;opacity:0.85;z-index:3;text-shadow:0 1px 2px #000;}

      /* Stance btn — hidden by default, shows on slot hover */
      .stance-btn{position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:8px;padding:2px 8px;background:rgba(2,4,8,0.9);border:1px solid rgba(100,140,180,0.3);color:var(--dim);cursor:pointer;z-index:10;transition:all .15s;font-family:var(--mono);letter-spacing:1px;opacity:0;pointer-events:none;}
      .sl:hover .stance-btn{opacity:1;pointer-events:auto;}
      .stance-btn:hover{color:#ddeeff;border-color:var(--synth);background:rgba(10,20,35,0.95);}



      /* ══════════════════════
         RUKA — vždy viditelná, symetrická
      ══════════════════════ */
      .hand-row{
        flex-shrink:0;
        display:flex;
        justify-content:center;
        align-items:flex-end;
        gap:clamp(6px,0.8vw,12px);
        padding:4px clamp(8px,2vw,20px) 2px;
        min-height:128px;
        position:relative;
        z-index:10;
        overflow:visible;
        background:linear-gradient(to top,rgba(4,7,11,0.88) 0%,rgba(4,7,11,0.42) 58%,rgba(4,7,11,0) 100%);
        border-top:none;
        transition:max-height .4s ease, opacity .3s ease, padding .4s ease, min-height .4s ease;
      }
      /* Ruka schovaná po zahrání karty */
      body.ph-field .hand-row, body.ph-attack .hand-row{
        max-height:0; min-height:0; opacity:0; padding:0; overflow:hidden; pointer-events:none;
      }


      .hand-empty{font-family:var(--mono);font-size:10px;color:var(--dim);}

      /* Enemy face-down cards in hand */
      .h-sl-enemy{pointer-events:none;}
      .h-sl-enemy .cx-card{width:80px;height:112px;}

      .h-sl{width:86px;height:120px;flex-shrink:0;position:relative;cursor:pointer;transition:transform .15s ease;z-index:1;}
      .h-sl:hover{transform:translateY(-8px) scale(1.06);z-index:50;}
      .h-sl.sel{transform:translateY(-10px) scale(1.08);z-index:50;}
      .h-sl.sel .cx-card{box-shadow:0 0 0 2px var(--synth),0 0 22px rgba(79,163,224,0.45);}
      .h-sl.multi-sel .cx-card{box-shadow:0 0 0 2px var(--gold),0 0 14px rgba(212,168,67,0.3);}
      .h-sl.fuse-dim{opacity:.4;filter:grayscale(.5);}
      .hand-enemy-turn{font-family:var(--px);font-size:clamp(5px,.55vw,7px);color:var(--dim);letter-spacing:3px;text-align:center;padding:8px;}
      .hand-discard-btn{position:absolute;top:2px;right:2px;z-index:60;width:18px;height:18px;padding:0;border:none;border-radius:50%;background:rgba(30,20,40,0.82);color:#e04f6a;font-size:10px;line-height:18px;text-align:center;cursor:pointer;opacity:0;transition:opacity .15s;pointer-events:auto;}
      .h-sl:hover .hand-discard-btn{opacity:1;}
      .h-sl.sel .hand-discard-btn{opacity:0.7;}


      /* Arena badge — vždy viditelný, zvýrazněný */
      .arena-b{
        position:absolute;top:10px;left:16px;z-index:30;
        padding:5px 10px;
        border:1px solid rgba(212,168,67,0.5);
        border-left:3px solid var(--gold);
        background:rgba(2,4,8,0.92);
        box-shadow:0 0 12px rgba(212,168,67,0.15);
      }
      .arena-l{font-family:var(--px);font-size:clamp(3px,.38vw,4px);color:var(--gold);letter-spacing:1px;}
      .arena-n{font-family:var(--vt);font-size:clamp(14px,1.5vw,19px);color:#fff;line-height:1.1;}

      /* ── ARENA VIZUÁLNÍ EFEKTY ── */
      [data-arena="arena_buff_atk"] .field-frame{border-color:rgba(224,79,106,0.3) !important;box-shadow:inset 0 0 60px rgba(224,79,106,0.08) !important;}
      [data-arena="arena_buff_def"] .field-frame{border-color:rgba(79,163,224,0.3) !important;box-shadow:inset 0 0 60px rgba(79,163,224,0.08) !important;}
      [data-arena="arena_buff_all"] .field-frame{border-color:rgba(212,168,67,0.35) !important;box-shadow:inset 0 0 60px rgba(212,168,67,0.1) !important;}
      [data-arena="arena_heal"] .field-frame{border-color:rgba(80,224,184,0.3) !important;box-shadow:inset 0 0 60px rgba(80,224,184,0.08) !important;animation:arena-heal-pulse 3s ease infinite;}
      @keyframes arena-heal-pulse{0%,100%{box-shadow:inset 0 0 40px rgba(80,224,184,0.05)}50%{box-shadow:inset 0 0 80px rgba(80,224,184,0.12)}}
      [data-arena="arena_draw"] .field-frame{border-color:rgba(79,163,224,0.25) !important;box-shadow:inset 0 0 50px rgba(79,163,224,0.06) !important;}
      [data-arena="arena_mirror"] .field-frame{border-color:rgba(200,214,229,0.2) !important;box-shadow:inset 0 0 60px rgba(200,214,229,0.06) !important;animation:arena-mirror-shimmer 4s ease infinite;}
      @keyframes arena-mirror-shimmer{0%,100%{filter:none}50%{filter:brightness(1.05) contrast(1.02)}}
      [data-arena="arena_entropy"] .field-frame{border-color:rgba(181,112,224,0.35) !important;box-shadow:inset 0 0 70px rgba(181,112,224,0.1) !important;animation:arena-entropy-glitch 2s step-end infinite;}
      @keyframes arena-entropy-glitch{0%,90%{opacity:1}92%{opacity:0.85}94%{opacity:1}96%{opacity:0.9}100%{opacity:1}}
      [data-arena="arena_corrupt"] .field-frame{border-color:rgba(155,89,182,0.4) !important;box-shadow:inset 0 0 80px rgba(155,89,182,0.12) !important;animation:arena-corrupt-throb 1.5s ease infinite;}
      @keyframes arena-corrupt-throb{0%,100%{border-color:rgba(155,89,182,0.3)}50%{border-color:rgba(155,89,182,0.6)}}

      /* Plynulý přechod hráčů — board slide + fade */
      .board{transition:transform 1.0s cubic-bezier(.4,0,.2,1), opacity .4s ease;}
      .board.turn-switching{opacity:.6;transform:rotateX(0deg) scale(.98);}

      .fuse-hint{display:flex;align-items:center;gap:10px;padding:4px 0;flex-wrap:wrap;}
      .fh-label{font-family:var(--mono);font-size:11px;color:var(--hybrid);}
      .fh-result{font-family:var(--mono);font-size:12px;color:#ddeeff;}
      .fh-none{font-family:var(--mono);font-size:11px;color:var(--dim);}
      .fuse-go-btn{font-family:var(--mono);font-size:10px;padding:3px 10px;background:transparent;border:1px solid var(--hybrid);color:var(--hybrid);cursor:pointer;}
      .fuse-exp-btn{font-family:var(--mono);font-size:10px;padding:3px 10px;background:transparent;border:1px solid rgba(181,112,224,0.4);color:var(--corruption);cursor:pointer;}
      .fp-exp-note{font-family:var(--mono);font-size:10px;color:var(--corruption);text-align:center;}

      /* ══════════════════════
         AKCE BAR
      ══════════════════════ */
      .act-row{flex-shrink:0;z-index:35;display:flex;align-items:center;padding:6px 14px;gap:8px;background:rgba(2,4,8,0.97);border-top:1px solid rgba(255,255,255,0.03);}
      .act-txt{flex:1;font-family:var(--mono);font-size:clamp(9px,.7vw,12px);letter-spacing:0.5px;transition:color .5s;line-height:1.4;}
      .act-stat{color:#8090a0;font-family:var(--mono);}
      .act-faction{font-family:var(--px);font-size:7px;letter-spacing:1px;opacity:0.5;}
      body.ph-hand   .act-txt{color:rgba(79,163,224,0.75);}
      body.ph-field  .act-txt{color:rgba(80,224,184,0.7);}
      body.ph-attack .act-txt{color:rgba(212,168,67,0.8);}
      body.ph-enemy  .act-txt{color:rgba(224,79,106,0.7);}

      .btn{font-family:var(--px);font-size:clamp(6px,.6vw,8px);letter-spacing:1px;padding:clamp(6px,.7vh,9px) clamp(12px,1.4vw,20px);border:1px solid;background:transparent;cursor:pointer;transition:all .15s;white-space:nowrap;}
      .btn-main{border-color:var(--synth);color:var(--synth);}
      .btn-main:hover:not(:disabled){background:rgba(79,163,224,0.1);box-shadow:0 0 12px rgba(79,163,224,0.2);}
      .btn-main:disabled{border-color:var(--dim);color:var(--dim);cursor:not-allowed;}
      .btn-sec{border-color:rgba(255,255,255,0.15);color:rgba(255,255,255,0.4);}
      .btn-sec:hover{border-color:rgba(255,255,255,0.3);color:rgba(255,255,255,0.7);}
      .btn-cancel{border-color:rgba(224,79,106,0.3);color:rgba(224,79,106,0.5);}
      .btn-cancel:hover{border-color:rgba(224,79,106,0.6);color:rgba(224,79,106,0.8);}
      .btn-sm{border-color:var(--muted);color:var(--dim);font-size:clamp(5px,.5vw,7px);padding:clamp(4px,.5vh,6px) clamp(8px,1vw,12px);}
      .btn-sm:hover{border-color:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);}

      /* ── BATTLE OVERLAY ── */
      .battle-overlay{position:fixed;inset:0;z-index:400;pointer-events:none;opacity:0;transition:opacity .25s;
        display:flex;align-items:center;justify-content:center;
        background:rgba(2,4,8,0.97);backdrop-filter:blur(8px);}
      .battle-overlay.show{pointer-events:all;opacity:1;}

      /* ── RESULT SCREEN (ov-*) ── */
      .ov-phase{display:flex;flex-direction:column;align-items:center;gap:16px;padding:28px 32px;max-width:420px;width:90vw;text-align:center;}
      .ov-result-header{font-family:var(--px);font-size:clamp(16px,2.5vw,24px);letter-spacing:6px;}
      .ov-reason{font-family:var(--mono);font-size:clamp(10px,1.2vw,13px);color:var(--dim);margin-top:-8px;}
      .ov-grade-block{display:flex;flex-direction:column;align-items:center;gap:4px;margin:8px 0;}
      .ov-grade{font-family:var(--px);font-size:clamp(36px,6vw,56px);letter-spacing:4px;line-height:1;}
      .ov-grade-label{font-family:var(--px);font-size:clamp(6px,.7vw,9px);letter-spacing:3px;}
      .ov-grade-breakdown{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 8px;margin-top:6px;max-width:320px;}
      .ov-gb-item{font-family:var(--mono);font-size:clamp(8px,.8vw,10px);opacity:0.7;}
      .ov-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;width:100%;}
      .ov-stat{display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);}
      .ov-stat-label{font-family:var(--px);font-size:clamp(5px,.55vw,7px);color:rgba(200,214,229,0.5);letter-spacing:1px;}
      .ov-stat-val{font-family:var(--mono);font-size:clamp(11px,1.2vw,14px);color:#ddeeff;}
      .ov-stat-pct{font-size:0.8em;color:var(--dim);}
      .ov-letter-fragment{display:flex;align-items:center;gap:12px;padding:10px 16px;border:1px solid rgba(155,89,182,0.3);background:rgba(155,89,182,0.06);width:100%;}
      .ov-letter-icon{font-size:24px;}
      .ov-letter-title{font-family:var(--px);font-size:9px;color:#b570e0;letter-spacing:1px;}
      .ov-letter-sub{font-family:var(--mono);font-size:11px;color:var(--dim);}
      .ov-drop-inline{display:flex;flex-direction:column;align-items:center;gap:8px;width:100%;margin-top:4px;}
      .ov-drop-inline-label{font-family:var(--px);font-size:clamp(5px,.55vw,7px);color:var(--gold);letter-spacing:3px;}
      .ov-drop-inline-card{display:flex;gap:14px;padding:10px 14px;border:1px solid rgba(212,168,67,0.25);background:rgba(212,168,67,0.04);width:100%;align-items:center;}
      .ov-drop-inline-left{display:flex;align-items:center;justify-content:center;flex-shrink:0;}
      .ov-drop-inline-left .cx-card{box-shadow:0 4px 14px rgba(0,0,0,0.7),0 0 0 1px rgba(212,168,67,0.2);}
      .ov-drop-inline-emoji{font-size:28px;}
      .ov-drop-inline-right{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;}
      .ov-drop-inline-rarity{font-family:var(--px);font-size:7px;letter-spacing:2px;}
      .ov-drop-inline-name{font-family:var(--vt);font-size:clamp(16px,1.8vw,20px);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .ov-drop-inline-faction{font-family:var(--px);font-size:7px;letter-spacing:1px;}
      .ov-drop-inline-stats{font-family:var(--mono);font-size:12px;color:#c8d6e5;}
      .ov-drop-inline-status{font-family:var(--mono);font-size:11px;margin-top:2px;}
      .ov-actions{display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;justify-content:center;}
      .ov-btn{font-family:var(--px);font-size:clamp(6px,.65vw,9px);padding:10px 20px;background:transparent;border:1px solid;cursor:pointer;letter-spacing:2px;transition:all .2s;}
      .ov-btn-continue{border-color:var(--synth);color:var(--synth);}
      .ov-btn-continue:hover{box-shadow:0 0 14px rgba(79,163,224,0.3);background:rgba(79,163,224,0.06);}
      .ov-btn-menu{border-color:rgba(80,100,120,0.4);color:var(--dim);}
      .ov-btn-menu:hover{border-color:var(--dim);color:#8ab0c0;}
      .ov-auto-menu{font-family:'Share Tech Mono',monospace;font-size:11px;color:rgba(96,128,160,0.5);letter-spacing:2px;padding:8px 0;}

      /* enemy-hand-row: styles in .hand-row section above */

      .clash-flash{position:fixed;inset:0;z-index:200;pointer-events:none;animation:cf .3s ease forwards;}
      @keyframes cf{0%{opacity:1}100%{opacity:0}}

      /* ── FÚZE POPUP ── */
      .fuse-popup{position:fixed;inset:0;z-index:120;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(2,4,8,0.60);backdrop-filter:blur(8px);animation:fp-in .18s ease;}
      @keyframes fp-in{from{opacity:0}to{opacity:1}}
      .fp-title{font-family:var(--px);font-size:11px;color:var(--hybrid);letter-spacing:4px;}
      .fp-card{display:flex;flex-direction:row;align-items:center;gap:20px;}
      .fp-source{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:1px;}
      .fp-buttons{display:flex;gap:10px;flex-direction:column;align-items:flex-start;}
      .fp-info{display:flex;flex-direction:column;gap:8px;}
      .btn-fuse{font-family:var(--px);font-size:10px;padding:10px 24px;background:transparent;border:1px solid var(--hybrid);color:var(--hybrid);cursor:pointer;letter-spacing:2px;transition:all .2s;}
      .btn-fuse:hover{box-shadow:0 0 18px rgba(80,224,184,0.3);background:rgba(80,224,184,0.06);}
      .btn-cancel-fuse{font-family:var(--mono);font-size:11px;padding:6px 16px;background:transparent;border:1px solid rgba(80,100,120,0.3);color:var(--dim);cursor:pointer;transition:all .2s;}
      .btn-cancel-fuse:hover{border-color:var(--dim);}

      /* ── PAUZA ── */
      .pause-overlay{position:fixed;inset:0;background:rgba(2,4,8,0.96);z-index:150;display:flex;align-items:center;justify-content:center;animation:fp-in .2s ease;backdrop-filter:blur(4px);}
      .pause-panel{display:flex;flex-direction:column;align-items:center;gap:16px;background:#080c12;border:1px solid rgba(79,163,224,0.25);padding:32px 40px;min-width:280px;}
      .pause-title{font-family:var(--px);font-size:18px;color:#ddeeff;letter-spacing:6px;}
      .pause-info{font-family:var(--mono);font-size:13px;color:var(--dim);}
      .pause-confirm-msg{font-family:var(--px);font-size:11px;color:#8ab0c0;letter-spacing:1px;text-align:center;line-height:1.8;max-width:260px;}
      .pause-actions{display:flex;flex-direction:column;gap:8px;width:100%;}
      .pause-btn-action{font-family:var(--px);font-size:10px;padding:10px 20px;background:transparent;border:1px solid;cursor:pointer;letter-spacing:2px;transition:all .2s;width:100%;}
      .pause-resume{border-color:rgba(79,163,224,0.5);color:var(--synth);}
      .pause-resume:hover{border-color:var(--synth);box-shadow:0 0 14px rgba(79,163,224,0.3);}
      .pause-checkpoint{border-color:rgba(200,168,75,0.5);color:var(--gold);}
      .pause-checkpoint:hover{border-color:var(--gold);}
      .pause-menu{border-color:rgba(80,100,120,0.4);color:var(--dim);}
      .pause-menu:hover{border-color:var(--dim);color:#8ab0c0;}
      .pause-btn{font-family:var(--mono);font-size:12px;padding:4px 10px;background:transparent;border:1px solid rgba(80,100,120,0.3);color:var(--dim);cursor:pointer;transition:all .2s;}

      /* ── DEFEAT ── */
      .defeat-scene{position:fixed;inset:0;background:#000;z-index:500;display:flex;align-items:center;justify-content:center;animation:ds-in .6s ease forwards;}
      @keyframes ds-in{from{opacity:0}to{opacity:1}}
      .defeat-scene.ds-fade-out{animation:ds-out .8s ease forwards;}
      @keyframes ds-out{from{opacity:1}to{opacity:0}}
      .ds-content{display:flex;flex-direction:column;align-items:center;gap:20px;}
      .ds-glitch{font-family:var(--px);font-size:clamp(28px,5vw,56px);color:#e04f6a;letter-spacing:8px;text-shadow:0 0 30px rgba(224,79,106,0.8);animation:ds-glitch-anim .15s steps(1) infinite;}
      @keyframes ds-glitch-anim{0%{transform:translate(0)}20%{transform:translate(-3px,1px);filter:brightness(1.4)}40%{transform:translate(2px,-1px)}60%{transform:translate(-1px,2px);filter:brightness(0.8)}80%{transform:translate(1px,0)}100%{transform:translate(0)}}
      .ds-sub{font-family:var(--px);font-size:11px;color:#3d4a5c;letter-spacing:3px;}
      .ds-msg{font-family:var(--mono);font-size:14px;color:#4a6070;letter-spacing:2px;min-height:22px;}
      .ds-bar{width:0%;height:2px;background:#e04f6a;transition:width .4s ease;box-shadow:0 0 8px rgba(224,79,106,0.6);min-width:180px;max-width:360px;}

      /* ── LOADING ── */
      .b-loading{display:flex;align-items:center;justify-content:center;height:100%;width:100%;font-family:var(--px);font-size:13px;color:var(--synth);text-shadow:0 0 20px var(--synth);animation:b-pulse 1.5s ease infinite;letter-spacing:4px;}
      @keyframes b-pulse{0%,100%{opacity:.3}50%{opacity:1}}

      /* ── NÁHLED KARTY ── */
      .preview-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.7);opacity:0;pointer-events:none;transition:opacity .25s;}
      .preview-overlay.on{opacity:1;pointer-events:all;}
      .preview-box{width:clamp(220px,28vw,320px);background:rgba(4,8,16,0.98);border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;transform:translateY(10px) scale(.97);transition:transform .25s;}
      .preview-overlay.on .preview-box{transform:translateY(0) scale(1);}
      .pv-art{height:clamp(100px,18vh,160px);display:flex;align-items:center;justify-content:center;font-size:60px;background:linear-gradient(135deg,#080e18,#060a12);position:relative;}
      .pv-art-border{position:absolute;bottom:0;left:0;right:0;height:2px;transition:background .3s;}
      .pv-body{padding:12px 14px;display:flex;flex-direction:column;gap:8px;}
      .pv-name{font-family:var(--px);font-size:clamp(6px,.7vw,8px);color:#fff;line-height:1.4;}
      .pv-stats{display:flex;gap:12px;font-family:var(--mono);font-size:clamp(10px,1.1vw,13px);}
      .pv-desc{font-family:var(--mono);font-size:clamp(8px,.9vw,10px);color:rgba(255,255,255,0.45);line-height:1.5;}
      .pv-actions{display:flex;flex-wrap:wrap;gap:6px;}
      .pv-btn{font-family:var(--px);font-size:clamp(4px,.45vw,5px);padding:6px 10px;border:1px solid;background:transparent;cursor:pointer;transition:all .15s;}
      .pv-btn.play{border-color:var(--synth);color:var(--synth);}
      .pv-btn.play:hover{background:rgba(79,163,224,0.1);}
      .pv-btn.down{border-color:var(--dim);color:rgba(255,255,255,0.4);}
      .pv-btn.down:hover{border-color:rgba(255,255,255,0.2);color:rgba(255,255,255,0.7);}
      .pv-btn.fuse{border-color:var(--hybrid);color:var(--hybrid);}
      .pv-btn.cancel{border-color:var(--muted);color:var(--dim);}
      .pv-btn.cancel:hover{border-color:rgba(255,255,255,0.1);color:rgba(255,255,255,0.3);}
      #card-preview-popup{
        position:fixed;top:0;left:0;right:0;bottom:0;
        z-index:200;
        display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.75);
        animation:fp-in .2s ease;
      }
      .cpp-wrap{
        position:relative;
        display:flex;flex-direction:column;align-items:center;gap:12px;
        padding:0;
        background:transparent;
        border:none;
      }
      .cpp-close{
        position:absolute;top:-28px;right:0;
        font-family:var(--mono);font-size:13px;
        background:transparent;border:none;color:rgba(255,255,255,0.3);cursor:pointer;
        transition:color .15s;line-height:1;padding:2px 6px;
      }
      .cpp-close:hover{color:#fff;}
      .cpp-readonly{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:2px;}
      .cpp-actions{display:flex;flex-direction:column;gap:8px;width:100%;min-width:200px;max-width:360px;}
      .cp-btn{
        font-family:var(--px);font-size:7px;
        padding:10px 14px;background:rgba(2,4,8,0.95);border:1px solid;cursor:pointer;
        transition:all .15s;text-align:left;letter-spacing:1px;width:100%;
      }
      .cp-play{border-color:rgba(79,163,224,0.5);color:var(--synth);}
      .cp-play:hover{border-color:var(--synth);background:rgba(79,163,224,0.1);}
      .cp-def{border-color:rgba(80,224,184,0.4);color:var(--hybrid);}
      .cp-def:hover{border-color:var(--hybrid);background:rgba(80,224,184,0.07);}
      .cp-face{border-color:rgba(181,112,224,0.35);color:var(--corruption);}
      .cp-face:hover{border-color:var(--corruption);background:rgba(181,112,224,0.07);}
      .cp-atk{border-color:rgba(212,168,67,0.5);color:var(--gold);}
      .cp-atk:hover{border-color:var(--gold);background:rgba(212,168,67,0.08);}
      .cp-stance{border-color:rgba(79,163,224,0.25);color:rgba(79,163,224,0.6);}
      .cp-stance:hover{border-color:var(--synth);color:var(--synth);}
      .cp-save{border-color:rgba(212,168,67,0.3);color:rgba(212,168,67,0.7);}
      .cp-save:hover{border-color:var(--gold);color:var(--gold);}
      .cp-swap{border-color:rgba(80,224,184,0.25);color:rgba(80,224,184,0.6);}
      .cp-swap:hover{border-color:var(--hybrid);}
      .cp-fuse{border-color:rgba(80,224,184,0.35);color:var(--hybrid);}
      .cp-fuse:hover{border-color:var(--hybrid);}
      .cp-cancel{border-color:rgba(80,100,120,0.25);color:rgba(255,255,255,0.2);}
      .cp-cancel:hover{border-color:rgba(80,100,120,0.5);color:rgba(255,255,255,0.5);}

      /* ── SPELL ACTION PICKER ── */
      .sap-overlay{position:fixed;inset:0;background:rgba(2,4,8,0.88);z-index:120;display:flex;align-items:center;justify-content:center;animation:fp-in .18s ease;}
      .sap-panel{background:#080c12;border:1px solid rgba(79,163,224,0.3);padding:24px 28px;min-width:300px;max-width:380px;display:flex;flex-direction:column;gap:16px;}
      .sap-emoji{font-size:36px;text-align:center;}
      .sap-name{font-family:var(--px);font-size:13px;color:#ddeeff;text-align:center;letter-spacing:.05em;}
      .sap-kind{font-family:var(--mono);font-size:10px;color:var(--dim);text-align:center;letter-spacing:.1em;}
      .sap-desc{font-family:var(--vt);font-size:18px;color:#8aaccc;text-align:center;line-height:1.5;}
      .sap-stats{font-family:var(--px);font-size:11px;color:var(--dim);text-align:center;}
      .sap-actions{display:flex;flex-direction:column;gap:8px;}
      .sap-btn{font-family:var(--px);font-size:10px;padding:10px 16px;background:transparent;border:1px solid;cursor:pointer;letter-spacing:.08em;transition:all .15s;text-align:left;}
      .sap-btn--use{border-color:rgba(106,184,240,0.5);color:var(--synth);}
      .sap-btn--use:hover{border-color:var(--synth);box-shadow:0 0 12px rgba(106,184,240,0.25);}
      .sap-btn--save{border-color:rgba(224,192,96,0.4);color:var(--gold);}
      .sap-btn--save:hover{border-color:var(--gold);}
      .sap-btn--cancel{border-color:rgba(80,100,120,0.3);color:var(--dim);}
      .sap-btn--cancel:hover{border-color:var(--dim);color:#8ab0c0;}
      .swap-slot-list{display:flex;flex-direction:column;gap:8px;width:100%;}
      .swap-slot-btn{display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(10,16,26,0.9);border:1px solid #334455;border-radius:4px;cursor:pointer;text-align:left;transition:border-color .15s,background .15s;width:100%;}
      .swap-slot-btn:hover{background:rgba(20,30,46,0.95);}
      .ssb-emoji{font-size:18px;flex-shrink:0;}
      .ssb-name{font-family:var(--mono);font-size:11px;color:#c8d6e5;flex:1;}
      .ssb-stat{font-family:var(--mono);font-size:10px;flex-shrink:0;}

      /* ── VÝSLEDEK ── */
      .result-screen{position:fixed;inset:0;z-index:300;background:rgba(4,6,10,0.97);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;animation:fp-in .4s ease;}
      .result-grade{font-family:var(--px);font-size:48px;letter-spacing:6px;}
      .grade-S{color:var(--gold);text-shadow:0 0 30px rgba(224,192,96,0.6);}
      .grade-A{color:var(--hybrid);}
      .grade-B{color:var(--synth);}
      .grade-C{color:var(--dim);}
      .grade-D,.grade-F{color:var(--organic);}
      .result-title{font-family:var(--px);font-size:16px;letter-spacing:4px;}
      .result-win{color:var(--hybrid);}
      .result-lose{color:var(--organic);}
      .result-stats{font-family:var(--mono);font-size:12px;color:var(--dim);display:flex;flex-direction:column;gap:4px;text-align:center;}
      .result-drop{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px;border:1px solid rgba(224,192,96,0.25);background:rgba(224,192,96,0.04);}
      .result-drop-label{font-family:var(--px);font-size:8px;color:var(--gold);letter-spacing:3px;}
      .result-btns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}
      .result-btn{font-family:var(--px);font-size:9px;padding:10px 20px;background:transparent;border:1px solid;cursor:pointer;letter-spacing:2px;transition:all .2s;}
      .result-btn-main{border-color:var(--synth);color:var(--synth);}
      .result-btn-main:hover{box-shadow:0 0 14px rgba(79,163,224,0.3);}
      .result-btn-retry{border-color:rgba(80,100,120,0.4);color:var(--dim);}
      .result-btn-retry:hover{border-color:var(--dim);color:#8ab0c0;}

      /* ── CLASH ZOOM — uses actual card renders ── */
      .clash-zoom-overlay{position:fixed;inset:0;z-index:250;background:rgba(2,4,8,0.96);display:flex;align-items:center;justify-content:center;animation:fp-in .15s ease;cursor:pointer;}
      .clash-zoom-inner{display:flex;align-items:center;gap:clamp(12px,3vw,36px);transform:scale(clamp(0.55, 0.15vw + 0.4, 0.85));}
      .clash-side{display:flex;flex-direction:column;align-items:center;gap:10px;transition:transform .4s ease,opacity .3s ease;}
      .clash-side-atk{animation:clash-slide-left .35s cubic-bezier(.2,1,.4,1) forwards;}
      .clash-side-def{animation:clash-slide-right .35s cubic-bezier(.2,1,.4,1) forwards;}
      @keyframes clash-slide-left{from{transform:translateX(-80px);opacity:0}to{transform:translateX(0);opacity:1}}
      @keyframes clash-slide-right{from{transform:translateX(80px);opacity:0}to{transform:translateX(0);opacity:1}}
      .clash-stat{font-family:var(--mono);font-size:clamp(16px,2vw,24px);font-weight:bold;letter-spacing:2px;text-shadow:0 0 10px rgba(0,0,0,0.8);}
      .clash-stat-atk{color:#f09050;}
      .clash-stat-def{color:#70c8f8;}
      .clash-vs{font-family:var(--px);font-size:clamp(18px,3vw,28px);color:var(--gold);letter-spacing:6px;animation:clash-vs-pulse .6s ease .2s both;}
      @keyframes clash-vs-pulse{0%{transform:scale(0);opacity:0}60%{transform:scale(1.3)}100%{transform:scale(1);opacity:1}}
      /* Result states */
      .clash-atk-wins .clash-side-atk{transform:scale(1.1);filter:brightness(1.2);}
      .clash-atk-wins .clash-side-def{transform:scale(.85);opacity:.4;filter:grayscale(.5);}
      .clash-def-wins .clash-side-def{transform:scale(1.1);filter:brightness(1.2);}
      .clash-def-wins .clash-side-atk{transform:scale(.85);opacity:.4;filter:grayscale(.5);}
      .clash-draw .clash-side-atk,.clash-draw .clash-side-def{opacity:.6;filter:grayscale(.3);}
      /* Clash cards use cx-md size */
      .clash-side .cx-card{pointer-events:none;}
      .clash-dmg{font-family:var(--px);font-size:clamp(12px,2vw,18px);letter-spacing:3px;margin-top:12px;animation:clash-dmg-in .3s ease .1s both;text-shadow:0 2px 8px rgba(0,0,0,0.8);}
      @keyframes clash-dmg-in{from{opacity:0;transform:scale(0.5)}to{opacity:1;transform:scale(1)}}

      /* ── CONFIRM ── */
      .confirm-overlay{position:fixed;inset:0;z-index:180;background:rgba(2,4,8,0.88);display:flex;align-items:center;justify-content:center;animation:fp-in .15s ease;}
      .confirm-box{background:#080c12;border:1px solid rgba(79,163,224,0.25);padding:28px 32px;display:flex;flex-direction:column;gap:16px;min-width:280px;align-items:center;}
      .confirm-msg{font-family:var(--px);font-size:10px;color:#ddeeff;letter-spacing:1px;text-align:center;line-height:1.9;}
      .confirm-btns{display:flex;gap:12px;}
      .confirm-yes{font-family:var(--px);font-size:9px;padding:8px 18px;background:transparent;border:1px solid rgba(224,79,106,0.5);color:var(--organic);cursor:pointer;letter-spacing:2px;transition:all .2s;}
      .confirm-yes:hover{border-color:var(--organic);box-shadow:0 0 12px rgba(224,79,106,0.25);}
      .confirm-no{font-family:var(--px);font-size:9px;padding:8px 18px;background:transparent;border:1px solid rgba(80,100,120,0.3);color:var(--dim);cursor:pointer;letter-spacing:2px;transition:all .2s;}
      .confirm-no:hover{border-color:var(--dim);color:#8ab0c0;}

      /* LP animace */
      .lp-hit .lp-ring{animation:lp-hit .4s ease;}
      @keyframes lp-hit{0%{filter:none}50%{filter:brightness(2) drop-shadow(0 0 8px #e04f6a)}100%{filter:none}}
      /* Floating damage number */
      .dmg-float{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-family:var(--px);font-size:18px;font-weight:bold;z-index:30;pointer-events:none;text-shadow:0 2px 6px rgba(0,0,0,0.9);animation:dmg-up 1.2s ease-out forwards;}
      @keyframes dmg-up{0%{opacity:1;transform:translate(-50%,-50%) scale(0.5)}20%{opacity:1;transform:translate(-50%,-80%) scale(1.2)}100%{opacity:0;transform:translate(-50%,-150%) scale(0.8)}}

      /* ═══ Fusion flash ═══ */
      .fuse-flash{position:absolute;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;pointer-events:none;animation:fuse-fade 1.8s ease-out forwards;}
      .fuse-glow{position:absolute;inset:0;background:radial-gradient(circle,rgba(181,112,224,0.55) 0%,rgba(155,89,182,0.25) 40%,transparent 70%);animation:fuse-glow-in 0.3s ease-out;}
      .fuse-ring{position:absolute;border-radius:50%;border:2px solid #b570e0;box-shadow:0 0 20px #b570e0,0 0 40px rgba(181,112,224,0.4);}
      .fuse-ring-1{width:80px;height:80px;animation:fuse-expand 1.4s cubic-bezier(0.2,0.8,0.4,1) forwards;}
      .fuse-ring-2{width:80px;height:80px;border-color:#d0a0f8;animation:fuse-expand 1.4s cubic-bezier(0.2,0.8,0.4,1) 0.12s forwards;opacity:0.8;}
      .fuse-ring-3{width:80px;height:80px;border-color:#9060c0;animation:fuse-expand 1.4s cubic-bezier(0.2,0.8,0.4,1) 0.25s forwards;opacity:0.5;}
      .fuse-text{font-family:'Press Start 2P',monospace;font-size:15px;color:#f0e8ff;letter-spacing:8px;text-shadow:0 0 20px #b570e0,0 0 50px rgba(181,112,224,0.8),0 0 80px rgba(155,89,182,0.5);z-index:1;animation:fuse-text-in 0.9s cubic-bezier(0.2,0.8,0.4,1);}
      @keyframes fuse-expand{0%{width:80px;height:80px;opacity:1}100%{width:600px;height:600px;opacity:0}}
      @keyframes fuse-fade{0%{background:rgba(181,112,224,0.45)}25%{background:rgba(181,112,224,0.2)}100%{background:transparent;opacity:0}}
      @keyframes fuse-glow-in{0%{opacity:0}30%{opacity:1}100%{opacity:0}}
      @keyframes fuse-text-in{0%{transform:scale(0.1) translateY(30px);opacity:0}25%{transform:scale(1.2);opacity:1}60%{transform:scale(1);opacity:1}100%{transform:scale(1.05);opacity:0.6}}
      @keyframes fuse-shake{0%,100%{transform:none}10%,30%,50%,70%{transform:translateX(-5px) rotate(-0.4deg)}20%,40%,60%,80%{transform:translateX(5px) rotate(0.4deg)}}
      .fuse-shake{animation:fuse-shake 0.45s ease-out;}

      /* ═══ Attack particles ═══ */
      .atk-particle{position:absolute;width:6px;height:6px;border-radius:50%;background:#ff9a55;box-shadow:0 0 8px #ff9a55;z-index:50;pointer-events:none;animation:atk-fly 0.5s ease-out forwards;}
      @keyframes atk-fly{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--tx),var(--ty)) scale(0.3)}}

      /* ═══ Battle Dialog Overlay — Monyra mluví v boji ═══ */
      .bd-overlay{
        position:absolute;inset:0;z-index:150;
        display:flex;flex-direction:column;align-items:center;justify-content:flex-end;
        padding:0 16px 80px;
        background:rgba(0,0,0,0.55);
        cursor:pointer;
        animation:bd-fadein 0.25s ease;
      }
      @keyframes bd-fadein{from{opacity:0}to{opacity:1}}
      .bd-dialog{
        display:flex;align-items:flex-end;gap:12px;
        max-width:600px;width:100%;
      }
      .bd-left{flex-direction:row;}
      .bd-right{flex-direction:row-reverse;}
      .bd-portrait{
        width:70px;height:90px;flex-shrink:0;
        background-size:cover;background-position:top center;
        border-radius:4px;
        border:1px solid rgba(255,255,255,0.1);
        mask-image:linear-gradient(to top,transparent 0%,black 20%);
        -webkit-mask-image:linear-gradient(to top,transparent 0%,black 20%);
      }
      .bd-bubble{
        flex:1;
        background:rgba(4,6,10,0.95);
        border:1px solid rgba(79,163,224,0.2);
        border-radius:6px;
        padding:12px 16px;
        display:flex;flex-direction:column;gap:4px;
      }
      .bd-speaker{
        font-family:'Press Start 2P',monospace;font-size:6px;
        letter-spacing:2px;color:#4fa3e0;
      }
      .bd-text{
        font-family:'VT323',monospace;font-size:15px;
        line-height:1.6;color:#ddeeff;
      }
      .bd-tap{
        font-size:10px;color:rgba(255,255,255,0.3);margin-top:8px;
        animation:blink 1.2s step-end infinite;
      }

      /* Place popup */
      .place-popup-overlay{position:fixed;inset:0;z-index:160;background:rgba(2,4,8,0.85);display:flex;align-items:flex-end;justify-content:center;padding-bottom:100px;animation:fp-in .15s ease;}
      .place-popup{background:#080c12;border:1px solid rgba(79,163,224,0.25);padding:16px 24px;display:flex;flex-direction:column;gap:10px;min-width:240px;}
      .place-popup-title{font-family:var(--px);font-size:9px;color:var(--dim);letter-spacing:2px;}
      .place-popup-btns{display:flex;flex-direction:column;gap:8px;}
      .pp-btn{font-family:var(--px);font-size:9px;padding:8px 14px;background:transparent;border:1px solid;cursor:pointer;letter-spacing:1px;transition:all .15s;text-align:left;}
      .pp-btn-atk{border-color:rgba(224,79,106,0.4);color:var(--organic);}
      .pp-btn-atk:hover{border-color:var(--organic);}
      .pp-btn-def{border-color:rgba(79,163,224,0.4);color:var(--synth);}
      .pp-btn-def:hover{border-color:var(--synth);}
      .pp-btn-fd{border-color:rgba(181,112,224,0.35);color:var(--corruption);}
      .pp-btn-fd:hover{border-color:var(--corruption);}
      .pp-btn-cancel{border-color:rgba(80,100,120,0.3);color:var(--dim);}
      .pp-btn-cancel:hover{border-color:var(--dim);color:#8ab0c0;}

      /* ══════════════════════
         RESPONSIVE — větší rozlišení
      ══════════════════════ */
      @media(min-width:1440px){
        :root{--cw:clamp(70px,5vw,100px);--ch:clamp(98px,7vw,140px);}
        .lp-val{font-size:clamp(28px,2.2vw,42px);}
        .lp-ring{width:clamp(48px,3.5vw,68px);height:clamp(48px,3.5vw,68px);}
        .hand-row{gap:clamp(8px,0.8vw,14px);}
        .row{gap:clamp(6px,.5vw,10px);}
      }
      @media(min-width:1920px){
        :root{--cw:clamp(80px,4.5vw,110px);--ch:clamp(112px,6.3vw,154px);}
        .lp-val{font-size:clamp(32px,2vw,48px);}
        .lp-name{font-size:clamp(6px,.4vw,8px);}
        .lp-deck-info{font-size:clamp(10px,.7vw,13px);}
        .hand-row{gap:clamp(10px,1vw,18px);}
        .btn{font-size:clamp(7px,.5vw,10px);padding:clamp(8px,.6vh,12px) clamp(14px,1vw,22px);}
        .act-txt{font-size:clamp(6px,.4vw,9px);}
      }
      @media(min-width:2560px){
        :root{--cw:100px;--ch:140px;}
        .row{gap:12px;}
        .hand-row{gap:18px;}
      }
    `;
    document.head.appendChild(style);

  },

};

// Globální helper — StoryEngine a jiné moduly mohou zjistit název karty podle id
if(typeof window !== 'undefined') {
  window._confluxCardName = (id) => {
    const card = getCard(id);
    return card ? `${card.emoji} ${card.name}` : `#${id}`;
  };
}

// Destroy pro Router
BattleSystem.destroy = function() {
  if (this._forcedLossTimer) { clearTimeout(this._forcedLossTimer); this._forcedLossTimer = null; }
  if (this._resultTimer) { clearTimeout(this._resultTimer); this._resultTimer = null; }
  if (this._clashTimer) { clearTimeout(this._clashTimer); this._clashTimer = null; }
  if (this._skipCheck) { clearInterval(this._skipCheck); this._skipCheck = null; }
  // Abort všechny event listenery navěšené přes _bindEvents
  if(this._evtController) {
    this._evtController.abort();
    this._evtController = null;
  }

  // Clear všechny pending timery
  if(this._clickTimers instanceof Map) {
    this._clickTimers.forEach(t => clearTimeout(t));
  }
  clearTimeout(this._toastTimer);

  // Clear hold timer
  this._holdTimer && clearTimeout(this._holdTimer);

  this._state = null;
  this._enemy = null;
  this._params = null;
  this._clickTimers = null;

  // Zastav hudbu
  AudioSystem.stopMusic(600);

  // Reset body class (battle phase CSS)
  document.body.className = '';

  // Odstraň VŠECHNY battle overlaye z body
  document.querySelectorAll(
    '.battle-overlay, .clash-zoom-overlay, #card-preview-popup, ' +
    '.sap-overlay, .spell-target-popup, #spell-target-popup, ' +
    '.defeat-scene, #pause-overlay, #confirm-overlay, ' +
    '#fuse-popup, .place-popup, .field-swap-picker, ' +
    '.card-preview-overlay, .swap-picker-overlay'
  ).forEach(el => el.remove());

  if(Array.isArray(this._unsubs)) {
    this._unsubs.forEach(fn => { try { fn(); } catch(e) {} });
    this._unsubs = [];
  }
};

export default BattleSystem;
