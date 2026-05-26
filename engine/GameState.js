import EventBus from './EventBus.js';

/**
 * GameState — CONFLUX v2039
 * v2038: scar history (timeline bitev pro každou kartu)
 * v2039: fusion system v2 — systémový výpočet z faction+subcat+ATK tier,
 *         s fallbackem na archetypy (ID 1001-1084). fusionIndex je teď
 *         specific overrides only.
 */
import { CARDS_DATA } from '../data/cards.js';

const GameState = {

  // ── CARD DATA ─────────────────────────────────────────────────────────────
  cards:        [],
  _cardIndex:   null,
  _storyCorruption: 0,  // accumulated corruption from story choices (independent of alignment)
  fusionIndex:  {},   // specific overrides: "4+21": 501
  _archetypeIndex: null, // Map<"faction|subcat|tier", archetypeCard> — buildí se v loadCards()
  starterDeck:  null,

  player: {
    name:      'Pozorovatel',
    lp:        10000,
    maxLp:     10000,
    alignment: 0,
    deck:      [],
    collection:[],
    credits:   0,
    faction:   null,
    discoveredFusions: [],
  },

  campaign: {
    currentNode:  null,
    visitedNodes: [],
    flags:        {},
    chapter:      0,
    worldNumber:  1,
    nodeNumber:   0,
    lostCards:    [],
    actNumber:    1,
  },

  currentAct: null,
  currentEnemy: null,

  cardScars: {},

  playstyle: {
    attackedFirst: 0, builtDefenseFirst: 0, usedTraps: 0, usedSpells: 0,
    usedFusions: 0, directAttacks: 0, sacrificedWeak: 0, foughtToLast: 0,
    storyChoiceSpeeds: [], skippedReadTime: 0, longPauses: 0,
    synthCardsPlayed: 0, organicCardsPlayed: 0, hybridCardsPlayed: 0,
    acceptedCardLoss: 0, retreatedOften: 0, riskTaker: 0,
    choseSynth: 0, choseOrganic: 0, choseNeutral: 0,
    mirrorFightStyle: null,
  },

  identity: {
    memoryScore: 0, trustScore: 0, controlScore: 0, acceptanceScore: 0,
    profileText: null, endingType: null,
  },

  checkpoint: {
    exists: false, nodeId: null, nodeNumber: 0, savedAt: null, narrativeText: '',
  },

  battle: {
    active: false, enemyId: null, enemyName: '', enemyLp: 0, enemyMaxLp: 0,
    turn: 0, phase: 'draw', playerField: [], enemyField: [],
    playerHand: [], playerDeck: [], graveyard: [], log: [], alignmentDelta: 0,
  },

  corruption: {
    level: 0, side: null, visualClass: '', glitchIntensity: 0,
  },

  settings: {
    volume: 0.7, sfx: 0.8, music: 0.5, language: 'cs',
    keyboardShortcuts: true,
  },

  // ── CARD LOADING ──────────────────────────────────────────────────────────
  async loadCards() {
    if(this.cards.length > 0) return true;
    try {
      const data = CARDS_DATA;
      if(!data) {
        console.warn('[GameState] CARDS_DATA nenalezena.');
        return false;
      }
      this.cards       = data.cards       || [];
      this.fusionIndex = data.fusionIndex || {};
      this.starterDeck = data.starterDeck || null;

      this._cardIndex = new Map();
      this._archetypeIndex = new Map();
      for(const c of this.cards) {
        if(c && c.id != null) this._cardIndex.set(c.id, c);
        // Buildni archetype index: klíč "faction|subcat|tier" → karta
        if(c && c.isArchetype && c.faction && c.subcategory && c.tier) {
          const key = `${c.faction}|${c.subcategory}|${c.tier}`;
          this._archetypeIndex.set(key, c);
        }
      }

      console.log('[GameState] Karty načteny:', this.cards.length,
        '| overrides:', Object.keys(this.fusionIndex).length,
        '| archetypy:', this._archetypeIndex.size);

      if(!this.player.collection?.length) {
        const starterIds = this.buildStarterDeck();
        if(starterIds.length) {
          this.player.collection = [...starterIds];
          if(!this.player.deck?.length) this.player.deck = [...starterIds];
        }
      }
      return true;
    } catch(err) {
      console.error('[GameState] loadCards() selhalo:', err);
      return false;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────
  // FUSION SYSTEM v2
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Vrátí výslednou kartu fúze dvou ID.
   * 1) Specific override (fusionIndex) — ikonické fúze
   * 2) Systémový výpočet — frakce + subcat + tier → archetyp
   * Nikdy nevrací null pokud obě vstupní karty existují.
   */
  getFusionResult(idA, idB) {
    if(!idA || !idB) return null;
    const a = parseInt(idA), b = parseInt(idB);

    // 1) Override lookup
    const key1 = `${a}+${b}`;
    const key2 = `${b}+${a}`;
    const overrideId = this.fusionIndex[key1] ?? this.fusionIndex[key2] ?? null;
    if(overrideId !== null) {
      const card = this._cardIndex?.get(overrideId);
      if(card) return card;
    }

    // 2) Systémový výpočet
    return this._computeFusion(a, b);
  },

  /**
   * Systémový výpočet fúze ze dvou ID karet.
   * Vrací výslednou kartu (archetyp 1001-1084) nebo null pokud fúze není možná.
   *
   * Priorita pravidel:
   *  0) fusionIndex override (kompletnost — getFusionResult ho řeší taky)
   *  1) corruption + corruption  → corruption void (vyšší tier)
   *  2) corruption + synth       → corruption memory (systém přepsán)
   *  3) corruption + organic     → corruption void
   *  4) synth + organic          → hybrid bridge/balanced (+1 tier)
   *  5) synth + hybrid           → hybrid striker/balanced
   *  6) organic + hybrid         → hybrid nature/healer
   *  7) same faction             → silnější verze té frakce (+1 tier)
   *  8) subcategory kombinace    → faction-agnostic výsledek
   * Cíl se hledá přes _findArchetype(faction, subcat, tier).
   */
  _computeFusion(idA, idB) {
    const a = parseInt(idA), b = parseInt(idB);
    const cardA = this._cardIndex?.get(a) || this.getCard(a);
    const cardB = this._cardIndex?.get(b) || this.getCard(b);
    if(!cardA || !cardB) return null;

    // 0) Override (pro úplnost — voláno i z getFusionResult)
    const ov = this.fusionIndex[`${a}+${b}`] ?? this.fusionIndex[`${b}+${a}`] ?? null;
    if(ov !== null) {
      const c = this._cardIndex?.get(ov);
      if(c) return c;
    }

    const fa = cardA.faction, fb = cardB.faction;
    const sa = cardA.subcategory, sb = cardB.subcategory;
    const atkA = cardA.atk || 0, atkB = cardB.atk || 0;

    // Tier ze ATK (regulérní karty nemají pole tier)
    const tierA = cardA.tier || this._fusionTier(atkA, atkA, false);
    const tierB = cardB.tier || this._fusionTier(atkB, atkB, false);
    const baseTier = Math.max(tierA, tierB);
    const bump = (t) => Math.min(3, t + 1);

    const has = (f) => fa === f || fb === f;
    const both = (f) => fa === f && fb === f;
    const other = (f) => (fa === f ? fb : fa);
    const otherSub = (f) => (fa === f ? sb : sa);

    let targetFaction = null, targetSubcat = null, targetTier = baseTier;

    // ── FACTION PRAVIDLA (priorita) ──────────────────────────────────────────
    if(both('corruption')) {
      // 1) dvojitá corruption → hlubší void
      targetFaction = 'corruption';
      targetSubcat  = 'void';
      targetTier    = bump(baseTier);
    } else if(has('corruption') && has('synth')) {
      // 2) corruption přepíše systém → corruption memory (pohlcené vzpomínky systému)
      targetFaction = 'corruption';
      targetSubcat  = 'memory';
      targetTier    = baseTier;
    } else if(has('corruption') && has('organic')) {
      // 3) corruption pohltí organické → void
      targetFaction = 'corruption';
      targetSubcat  = 'void';
      targetTier    = baseTier;
    } else if(has('corruption')) {
      // corruption + hybrid/neutral → corruption, subcat dle protistrany
      targetFaction = 'corruption';
      targetSubcat  = this._corruptionSubcat(otherSub('corruption'));
      targetTier    = baseTier;
    } else if(has('synth') && has('organic')) {
      // 4) most mezi protiklady → hybrid, +1 tier
      targetFaction = 'hybrid';
      targetSubcat  = this._bridgeSubcat(sa, sb);
      targetTier    = bump(baseTier);
    } else if(has('synth') && has('hybrid')) {
      // 5) synth tlačí hybrid k akci → striker, jinak balanced
      targetFaction = 'hybrid';
      targetSubcat  = this._isOffensive(otherSub('hybrid')) || this._isOffensive(sa) || this._isOffensive(sb)
                        ? 'striker' : 'balanced';
      targetTier    = baseTier;
    } else if(has('organic') && has('hybrid')) {
      // 6) organické táhne hybrid k přírodě/léčení
      targetFaction = 'hybrid';
      targetSubcat  = this._isSupport(otherSub('hybrid')) || this._isSupport(sa) || this._isSupport(sb)
                        ? 'healer' : 'nature';
      targetTier    = baseTier;
    } else if(both('neutral')) {
      // neutral + neutral → most mezi nezařazenými, hybrid bridge (bez bump)
      targetFaction = 'hybrid';
      targetSubcat  = 'bridge';
      targetTier    = 1;
    } else if(has('neutral') && has('synth')) {
      // neutral + synth → systém vtáhne neutral mezi své zvědy (+1 tier)
      targetFaction = 'synth';
      targetSubcat  = 'scout';
      targetTier    = bump(baseTier);
    } else if(has('neutral') && has('organic')) {
      // neutral + organic → živé probudí v neutral paměť (+1 tier)
      targetFaction = 'organic';
      targetSubcat  = 'memory';
      targetTier    = bump(baseTier);
    } else if(has('neutral') && has('hybrid')) {
      // neutral + hybrid → most se posílí (+1 tier)
      targetFaction = 'hybrid';
      targetSubcat  = 'bridge';
      targetTier    = bump(baseTier);
    } else if(fa === fb) {
      // 7) stejná frakce → silnější verze, subcat z matice, +1 tier
      targetFaction = fa;
      targetSubcat  = this._fusionSubcat(sa, sb);
      targetTier    = bump(baseTier);
    } else if(has('neutral')) {
      // neutral ustoupí druhé straně
      targetFaction = other('neutral');
      targetSubcat  = this._fusionSubcat(sa, sb);
      targetTier    = baseTier;
    } else {
      // fallback faction přes matici
      targetFaction = this._fusionFaction(fa, fb);
      targetSubcat  = this._fusionSubcat(sa, sb);
      targetTier    = baseTier;
    }

    // ── SUBCATEGORY PŘEPIS (faction-agnostic kombinace) ──────────────────────
    // Pokud subcat kombinace dává silnější/specifičtější signál, použij ho.
    const subResult = this._subcatFusion(sa, sb);
    if(subResult) {
      // void tendence z memory+memory přetlačí k corruption
      if(subResult.subcat === 'void' && targetFaction !== 'corruption' && subResult.corruptionTendency) {
        targetFaction = 'corruption';
      }
      // Subcat dosazujeme jen pokud cílová frakce daný subcat zná (jinak necháme původní).
      if(this._factionHasSubcat(targetFaction, subResult.subcat)) {
        targetSubcat = subResult.subcat;
        if(subResult.bump) targetTier = bump(targetTier);
      }
    }

    if(targetTier > 3) targetTier = 3;
    if(targetTier < 1) targetTier = 1;

    const result = this._findArchetype(targetFaction, targetSubcat, targetTier);
    return result || null;
  },

  // Mapuje protistranu corruption fúze na rozumný corruption subcat (jen memory/void existují)
  _corruptionSubcat(otherSub) {
    if(otherSub === 'memory' || otherSub === 'system' || otherSub === 'scout') return 'memory';
    return 'void';
  },

  // synth+organic → bridge (most) pokud má smysl, jinak balanced
  _bridgeSubcat(sa, sb) {
    // Most vzniká když se spojí struktura (system/scout) s přírodou/pamětí
    const structural = (s) => s === 'system' || s === 'scout' || s === 'guardian';
    const living     = (s) => s === 'nature' || s === 'memory' || s === 'healer';
    if((structural(sa) && living(sb)) || (structural(sb) && living(sa))) return 'bridge';
    return 'balanced';
  },

  _isOffensive(s) { return s === 'striker' || s === 'scout'; },
  _isSupport(s)   { return s === 'healer' || s === 'memory' || s === 'guardian'; },

  // Zná daná frakce tento subcat v archetypech?
  _factionHasSubcat(faction, subcat) {
    if(!this._archetypeIndex) return false;
    for(let t = 1; t <= 5; t++) {
      if(this._archetypeIndex.has(`${faction}|${subcat}|${t}`)) return true;
    }
    return false;
  },

  // Faction-agnostic subcategory kombinace. Vrací {subcat, bump, corruptionTendency} nebo null.
  _subcatFusion(sa, sb) {
    if(!sa || !sb) return null;
    const pair = [sa, sb].sort().join('+');
    // explicitní kombinace
    const table = {
      'scout+scout':       { subcat: 'striker', bump: false },
      'guardian+guardian': { subcat: 'guardian', bump: true  },
      'memory+memory':     { subcat: 'void', bump: false, corruptionTendency: true },
      'guardian+striker':  { subcat: 'balanced', bump: false },
      'nature+system':     { subcat: 'bridge', bump: false },
      'healer+striker':    { subcat: 'balanced', bump: false },
      'memory+void':       { subcat: 'void', bump: false, corruptionTendency: true },
      'memory+scout':      { subcat: 'memory', bump: false },
    };
    if(table[pair]) return table[pair];
    // bridge + cokoli → balanced (most stabilizuje), bridge zůstává jen bridge+bridge
    if(sa === 'bridge' || sb === 'bridge') {
      if(sa === sb) return { subcat: 'bridge', bump: false };
      return { subcat: 'balanced', bump: false };
    }
    return null;
  },

  // Frakce matrix
  _fusionFaction(fa, fb) {
    // Corruption dominuje vše
    if(fa === 'corruption' || fb === 'corruption') return 'corruption';
    // Same + same
    if(fa === fb) return fa;
    // Hybrid + cokoli = hybrid
    if(fa === 'hybrid' || fb === 'hybrid') return 'hybrid';
    // Neutral ustoupí
    if(fa === 'neutral') return fb;
    if(fb === 'neutral') return fa;
    // synth + organic = hybrid (zbývající kombinace)
    return 'hybrid';
  },

  // Subcat matrix — dominance + výjimky
  _fusionSubcat(sa, sb) {
    // Same + same
    if(sa === sb) return sa;

    // Výjimky (pořadí nezáleží, normalizuj)
    const pair = [sa, sb].sort().join('+');
    const exceptions = {
      'memory+scout':     'memory',    // informace se stanou pamětí
      'guardian+striker': 'balanced',  // útok + obrana = vyvážený
      'nature+system':    'balanced',  // řád + divočina
      'healer+striker':   'balanced',  // léčí i bojuje
    };
    if(exceptions[pair]) return exceptions[pair];

    // Void a bridge převažují — corruption/balance markers
    if(sa === 'void' || sb === 'void') return 'void';
    if(sa === 'bridge' || sb === 'bridge') return 'bridge';

    // Dominance (vyšší číslo vyhraje)
    const dominance = {
      memory: 10, guardian: 9, nature: 8, system: 7, scout: 6,
      healer: 5, striker: 4, balanced: 3, bridge: 2, void: 1,
    };
    const da = dominance[sa] ?? 3;
    const db = dominance[sb] ?? 3;
    return da >= db ? sa : sb;
  },

  // Tier podle průměru ATK, +1 tier pro čisté same-faction same-subcat fúze
  _fusionTier(atkA, atkB, samePair) {
    const avg = (atkA + atkB) / 2;
    let tier;
    if(avg <= 900)      tier = 1;
    else if(avg <= 1600) tier = 2;
    else if(avg <= 2400) tier = 3;
    else if(avg <= 3200) tier = 4;
    else                 tier = 5;
    // Bonus za same-faction same-subcat
    if(samePair) tier = Math.min(5, tier + 1);
    return tier;
  },

  // Najde archetyp nebo fallback (nejbližší nižší tier, nebo jakýkoli matching faction+subcat)
  _findArchetype(faction, subcat, tier) {
    const tryKey = (f, s, t) => {
      const key = `${f}|${s}|${t}`;
      return this._archetypeIndex?.get(key) || null;
    };
    // Exact match
    let r = tryKey(faction, subcat, tier);
    if(r) return r;
    // Nižší tiery
    for(let t = tier - 1; t >= 1; t--) {
      r = tryKey(faction, subcat, t);
      if(r) return r;
    }
    // Vyšší tiery (kdyby nebyl tier 1)
    for(let t = tier + 1; t <= 5; t++) {
      r = tryKey(faction, subcat, t);
      if(r) return r;
    }
    // Fallback: jakákoli kombinace pro tuto faction
    for(const card of this._archetypeIndex?.values() || []) {
      if(card.faction === faction) return card;
    }
    // Absolute fallback: první archetyp
    for(const card of this._archetypeIndex?.values() || []) return card;
    return null;
  },

  // Zaznamenej že hráč objevil výslednou kartu fúze (pro Collection discovery)
  addDiscoveredFusion(cardId) {
    const id = Number(cardId);
    if(!id) return;
    if(!this.player.discoveredFusions) this.player.discoveredFusions = [];
    if(!this.player.discoveredFusions.includes(id)) {
      this.player.discoveredFusions.push(id);
    }
  },

  // Helper: je karta fúze? (pro Collection/DeckBuilder ikonu)
  isFusionCard(id) {
    const card = this.getCard(id);
    if(!card) return false;
    return !!(card.isFusion || card.isArchetype);
  },

  // ─────────────────────────────────────────────────────────────────────────

  getCard(id) {
    if(id === null || id === undefined) return null;
    const numId = typeof id === 'string' ? parseInt(id) : id;
    return this._cardIndex?.get(numId) || this.cards.find(c => c && c.id === numId) || null;
  },

  buildStarterDeck() {
    const sd = this.starterDeck;
    if(!sd) return [];
    const pick = (pool, count, maxCopies=2) => {
      const result = [];
      const copies = {};
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      for(const id of shuffled) {
        if(result.length >= count) break;
        const c = copies[id] || 0;
        if(c < maxCopies) { result.push(id); copies[id] = c+1; }
      }
      let i = 0;
      while(result.length < count && i < shuffled.length*3) {
        const id = shuffled[i % shuffled.length];
        result.push(id); i++;
      }
      return result.slice(0, count);
    };
    const deck = [
      ...pick(sd.monsterPool, 25, 3),
      ...pick(sd.spellPool,    3, 2),
      ...pick(sd.trapPool,     1, 1),
      ...pick(sd.arenaPool,    1, 1),
    ];
    return deck;
  },

  setFlag(key, value = true) { this.campaign.flags[key] = value; },
  getFlag(key, def = false)  { return this.campaign.flags[key] ?? def; },
  hasVisited(nodeId)         { return this.campaign.visitedNodes.includes(nodeId); },
  markVisited(nodeId)        { if(!this.hasVisited(nodeId)) this.campaign.visitedNodes.push(nodeId); },

  adjustAlignment(delta) {
    if(delta === 0) return;
    const prev = this.player.alignment;
    this.player.alignment = Math.max(-100, Math.min(100, prev + delta));
    this._updateCorruption();
    EventBus.emit('alignment:change', { alignment: this.player.alignment, delta, prev, corruption: { ...this.corruption } });
    EventBus.emit('corruption:change', { level: this.corruption.level, side: this.corruption.side, corruption: { ...this.corruption } });
  },

  adjustCorruption(delta) {
    if(!delta || delta === 0) return;
    this._storyCorruption = Math.max(0, (this._storyCorruption || 0) + delta);
    this._updateCorruption();
    EventBus.emit('alignment:change', { alignment: this.player.alignment, delta: 0, prev: this.player.alignment, corruption: { ...this.corruption } });
    EventBus.emit('corruption:change', { level: this.corruption.level, side: this.corruption.side, corruption: { ...this.corruption } });
  },

  _updateCorruption() {
    const a = this.player.alignment;
    let level = 0, side = null;
    if(a > 0) {
      side = 'order';
      level = a > 80 ? 5 : a > 60 ? 4 : a > 40 ? 3 : a > 20 ? 2 : 1;
    } else if(a < 0) {
      side = 'chaos';
      const abs = Math.abs(a);
      level = abs > 80 ? 5 : abs > 60 ? 4 : abs > 40 ? 3 : abs > 20 ? 2 : 1;
    }
    // Story choices can independently push corruption (arena effects, dark choices)
    const storyBonus = this._storyCorruption || 0;
    level = Math.min(5, level + storyBonus);
    if(level > 0 && !side) side = 'chaos';
    const clampedLevel = Math.min(level, 3);
    // glitchIntensity musí odpovídat visualClass — obě cappovat na stejné maximum (3).
    // Tím je glitchIntensity v rozsahu 0-1, maximum při corruption 3+.
    this.corruption = { level, side, visualClass: level > 0 ? `corruption-${side}-${clampedLevel}` : '', glitchIntensity: clampedLevel / 3 };
    this.player.faction = level >= 3 ? (side === 'order' ? 'synth' : 'organic') : 'hybrid';
  },

  trackPlay(event, data = {}) {
    const p = this.playstyle;
    switch(event) {
      case 'attack_first':       p.attackedFirst++;      break;
      case 'defense_first':      p.builtDefenseFirst++;  break;
      case 'used_trap':          p.usedTraps++;          break;
      case 'used_spell':         p.usedSpells++;         break;
      case 'used_fusion':        p.usedFusions++;        break;
      case 'direct_attack':      p.directAttacks++;      break;
      case 'sacrificed_weak':    p.sacrificedWeak++;     break;
      case 'fought_to_last':     p.foughtToLast++;       break;
      case 'accepted_card_loss': p.acceptedCardLoss++;   break;
      case 'risk_fusion':        p.riskTaker++;          break;
      case 'retreat_defense':    p.retreatedOften++;     break;
      case 'mirror_style':       p.mirrorFightStyle = data.style; break;
      case 'card_played':
        if(data.faction === 'synth')   p.synthCardsPlayed++;
        if(data.faction === 'organic') p.organicCardsPlayed++;
        if(data.faction === 'hybrid')  p.hybridCardsPlayed++;
        break;
      case 'story_choice':
        if(data.ms !== undefined) p.storyChoiceSpeeds.push(data.ms);
        if(data.ms < 2000)  p.skippedReadTime++;
        if(data.ms > 10000) p.longPauses++;
        if(data.side === 'synth')   p.choseSynth++;
        if(data.side === 'organic') p.choseOrganic++;
        if(data.side === 'neutral') p.choseNeutral++;
        break;
    }
  },

  // ── SCARS ────────────────────────────────────────────────────────────────
  addScar(cardId, meta = {}) {
    if(!this.cardScars[cardId]) {
      this.cardScars[cardId] = { scars: 0, evolved: false, evolvedIntoId: null, history: [] };
    }
    const scar = this.cardScars[cardId];
    if(!Array.isArray(scar.history)) scar.history = [];
    scar.scars++;

    scar.history.push({
      act: meta.act ?? this.currentAct ?? null,
      enemy: meta.enemy || meta.enemyName || this.currentEnemy || '—',
      outcome: meta.outcome || 'survived',
      at: Date.now(),
    });
    if(scar.history.length > 30) scar.history = scar.history.slice(-30);

    const evolvedId = this._checkEvolution(cardId, scar.scars);
    if(evolvedId !== null && !scar.evolved) {
      scar.evolved = true;
      scar.evolvedIntoId = evolvedId;
      const replaceIn = (arr) => {
        for(let i = 0; i < arr.length; i++) {
          if(arr[i] === cardId) { arr[i] = evolvedId; break; }
        }
      };
      replaceIn(this.player.collection);
      replaceIn(this.player.deck);
      if(!this.cardScars[evolvedId]) {
        this.cardScars[evolvedId] = {
          scars: 0, evolved: false, evolvedIntoId: null,
          history: [...scar.history, {
            act: meta.act ?? this.currentAct ?? null,
            enemy: this.getCard(cardId)?.name || '—',
            outcome: 'revived',
            at: Date.now(),
          }],
        };
      }
      EventBus.emit('card:evolved', { cardId, evolvedId, newCard: this.getCard(evolvedId) });
    }
    EventBus.emit('card:scarred', { cardId, scars: scar.scars });
  },

  _checkEvolution(cardId, scarCount) {
    const table = {
      1:  { at: 3, cardId: 47 },
      23: { at: 2, cardId: 48 },
      3:  { at: 2, cardId: 49 },
      29: { at: 2, cardId: 50 },
      7:  { at: 3, cardId: 47 },
      13: { at: 3, cardId: 47 },
      14: { at: 5, cardId: 61 },
    };
    const cardData = this.getCard(cardId);
    if(cardData?.evolvesInto) {
      const { battles, cardId: targetId } = cardData.evolvesInto;
      return (scarCount >= battles) ? targetId : null;
    }
    const ev = table[cardId];
    return (ev && scarCount >= ev.at) ? ev.cardId : null;
  },

  getScarData(cardId) {
    const d = this.cardScars[cardId] || { scars: 0, evolved: false, evolvedIntoId: null, history: [] };
    if(!Array.isArray(d.history)) d.history = [];
    return d;
  },

  recordCardFell(cardId, meta = {}) {
    if(!cardId) return;
    if(!this.cardScars[cardId]) {
      this.cardScars[cardId] = { scars: 0, evolved: false, evolvedIntoId: null, history: [] };
    }
    const scar = this.cardScars[cardId];
    if(!Array.isArray(scar.history)) scar.history = [];
    scar.history.push({
      act: meta.act ?? this.currentAct ?? null,
      enemy: meta.enemy || meta.enemyName || this.currentEnemy || '—',
      outcome: 'fallen',
      at: Date.now(),
    });
    if(scar.history.length > 30) scar.history = scar.history.slice(-30);
    EventBus.emit('card:fell', { cardId });
  },

  loseCard(cardId, reason = '') {
    const idx = this.player.collection.indexOf(cardId);
    if(idx >= 0) this.player.collection.splice(idx, 1);
    const di = this.player.deck.indexOf(cardId);
    if(di >= 0) this.player.deck.splice(di, 1);
    this.campaign.lostCards.push({ cardId, reason, nodeNumber: this.campaign.nodeNumber });
    EventBus.emit('card:lost', { cardId, reason });
  },

  saveCheckpoint(nodeId, nodeNumber, narrativeText = '') {
    this.checkpoint = { exists: true, nodeId, nodeNumber, savedAt: Date.now(), narrativeText };
    try {
      localStorage.setItem('conflux_save', JSON.stringify(this.toSave()));
      const slot = this._lastSaveSlot ?? 0;
      const data = { ...this.toSave(), version: '0.5', timestamp: Date.now() };
      localStorage.setItem('cardbound_save_' + slot, JSON.stringify(data));
    } catch(e) { console.warn('[GameState] Save failed:', e); }
    EventBus.emit('checkpoint:saved', { nodeId, nodeNumber, narrativeText });
  },

  loadCheckpoint() {
    try {
      const raw = localStorage.getItem('conflux_save');
      if(!raw) return false;
      this.fromSave(JSON.parse(raw));
      return true;
    } catch(e) { return false; }
  },

  hasCheckpoint() {
    try { return !!localStorage.getItem('conflux_save'); } catch(e) { return false; }
  },

  clearCheckpoint() {
    try { localStorage.removeItem('conflux_save'); } catch(e) {}
    this.checkpoint = { exists: false, nodeId: null, nodeNumber: 0, savedAt: null, narrativeText: '' };
  },

  buildIdentityProfile() {
    const p = this.playstyle, id = this.identity;
    const kept = this.getFlag('memories_kept') || 0;
    const lost = this.getFlag('memories_lost') || 0;
    id.memoryScore = Math.round((kept / Math.max(1, kept + lost)) * 100);
    const trustSig = p.choseOrganic + p.choseNeutral, isolSig = p.choseSynth;
    id.trustScore = Math.round((trustSig / Math.max(1, trustSig + isolSig)) * 100);
    const ctrlSig = p.synthCardsPlayed + p.builtDefenseFirst + p.usedTraps;
    const chaosSig = p.organicCardsPlayed + p.attackedFirst + p.usedFusions;
    id.controlScore = Math.round((ctrlSig / Math.max(1, ctrlSig + chaosSig)) * 100);
    const accSig = p.acceptedCardLoss + p.foughtToLast;
    const resSig = p.retreatedOften + (this.getFlag('restarted_battles') || 0);
    id.acceptanceScore = Math.round((accSig / Math.max(1, accSig + resSig)) * 100);
    const al = this.player.alignment;
    id.endingType = al > 70 ? 'assimilation' : al < -70 ? 'flood' : this.campaign.lostCards.length > 5 ? 'fragmentation' : al >= 0 ? 'architect' : 'roots';
    id.profileText = this._buildProfileText();
    EventBus.emit('identity:built', { identity: { ...id } });
    return id;
  },

  _buildProfileText() {
    const id = this.identity, p = this.playstyle;
    const lines = [];
    lines.push(id.memoryScore > 70 ? 'Pamatuješ si dost aby to bolelo.' : id.memoryScore > 40 ? 'Pamatuješ si věci v útržcích. Možná je to tak lepší.' : 'Zapomněl jsi víc než sis uvědomoval. Nebo sis to vybral.');
    lines.push(id.trustScore > 70 ? 'Důvěřuješ. Ne slepě — ale důvěřuješ.' : id.trustScore > 40 ? 'Důvěra přichází pomalu a odchází těžko.' : 'Nechal jsi ostatní na bezpečnou vzdálenost. Říkáš si že je to rozumné.');
    lines.push(id.controlScore > 70 ? 'Systémy ti dávají smysl. Emoce bereš jako informaci, ne jako pokyn.' : id.controlScore > 40 ? 'Hledáš řád tam kde není. Někdy ho najdeš.' : 'Chaos tě neděsí. Možná tě i přitahuje.');
    lines.push(id.acceptanceScore > 70 ? 'Zrcadlo jsi nezabil — domluvil ses s ním.' : id.acceptanceScore > 40 ? 'Zrcadlo tě překvapilo. Čekalo déle než ty.' : 'Zrcadlo jsi odmítl. Ale ono tam zůstalo.');
    if(p.usedFusions > 3 && p.riskTaker > 2) lines.push('Hledáš třetí možnost i když jsou na stole jen dvě.');
    else if(p.foughtToLast > 3) lines.push('Nevzdáváš se. Ani když by bylo rozumné.');
    else if(p.skippedReadTime > 5) lines.push('Rozhoduješ se rychle a neomlouváš se za to.');
    else if(p.longPauses > 5) lines.push('Přemýšlíš víc než jednáš. Nebo jsi jen opatrný.');
    return lines.join(' ');
  },

  recordCardSurvived(cardId, lpSaved = false) {
    if(!cardId) return;
    const scar = this.cardScars[cardId] || { scars: 0, evolved: false, evolvedIntoId: null, history: [] };
    if(!Array.isArray(scar.history)) scar.history = [];
    if(!this.cardScars[cardId]) this.cardScars[cardId] = scar;
  },

  resetBattle() {
    this.battle = { active: false, enemyId: null, enemyName: '', enemyLp: 0, enemyMaxLp: 0, turn: 0, phase: 'draw', playerField: [], enemyField: [], playerHand: [], playerDeck: [], graveyard: [], log: [], alignmentDelta: 0 };
  },

  toSave() {
    return {
      version: 3,
      player:    { ...this.player, deck: [...this.player.deck], collection: [...this.player.collection], discoveredFusions: [...(this.player.discoveredFusions||[])] },
      campaign:  { ...this.campaign, visitedNodes: [...this.campaign.visitedNodes], flags: { ...this.campaign.flags }, lostCards: [...(this.campaign.lostCards||[])] },
      cardScars:  { ...this.cardScars },
      playstyle:  { ...this.playstyle, storyChoiceSpeeds: [...(this.playstyle.storyChoiceSpeeds||[])] },
      identity:   { ...this.identity },
      checkpoint: { ...this.checkpoint },
      corruption: { ...this.corruption },
      settings:   { ...this.settings },
    };
  },

  fromSave(data) {
    if(!data) return;
    const savedCollection = data.player?.collection;
    const savedDeck = data.player?.deck;
    Object.assign(this.player, data.player || {});
    if(!savedCollection?.length) this.player.collection = this.player.collection || [];
    if(!savedDeck?.length) this.player.deck = this.player.deck || [];
    if(!Array.isArray(this.player.discoveredFusions)) this.player.discoveredFusions = [];
    Object.assign(this.campaign, data.campaign || {});
    Object.assign(this.settings, data.settings || {});
    if(data.cardScars)  this.cardScars  = { ...data.cardScars };
    if(data.playstyle)  Object.assign(this.playstyle,  data.playstyle);
    if(data.identity)   Object.assign(this.identity,   data.identity);
    if(data.checkpoint) Object.assign(this.checkpoint, data.checkpoint);
    if(data.corruption) Object.assign(this.corruption, data.corruption);
    else this._updateCorruption();
  },

  buildLetter() {
    const p  = this.player;
    const ps = this.playstyle || {};
    const name = p.name || 'Pozorovatel';

    // Compute identity first so all scores are fresh
    const id = this.buildIdentityProfile();

    // Kanonický typ konce — preferuj explicitní endingType / endingId z příběhu
    const endingType = this.identity?.endingType || this.campaign?.endingId || 'observer';

    const lines = [];
    const totalBattles   = (ps.attackedFirst||0) + (ps.builtDefenseFirst||0);
    const totalChoices   = (ps.choseSynth||0) + (ps.choseOrganic||0) + (ps.choseNeutral||0);
    const lost           = this.campaign?.lostCards?.length || 0;
    const alignment      = p.alignment || 0;
    const corrLevel      = this.corruption?.level || 0;

    // ── Greeting ─────────────────────────────────────────────────────────────
    lines.push({ type: 'greeting', text: `${name}.` });
    lines.push({ type: 'space' });

    // ── Memory / awareness ───────────────────────────────────────────────────
    if(id.memoryScore > 70) {
      lines.push({ type: 'body', text: 'Dopis se píše těžce, když druhý si pamatuje vše.' });
    } else if(id.memoryScore > 40) {
      lines.push({ type: 'body', text: 'Nevím kolik si pamatuješ. Možná ani ty ne.' });
    } else {
      lines.push({ type: 'body', text: 'Zapomínal jsi. Možná záměrně. Paměť je odpovědnost.' });
    }

    // ── Battle style ─────────────────────────────────────────────────────────
    if(totalBattles > 0) {
      const aggRate = (ps.attackedFirst||0) / totalBattles;
      if(aggRate > 0.65) {
        lines.push({ type: 'body', text: 'Útočil jsi jako první. Pořád. Jako by čekání bylo kapitulací.' });
      } else if(aggRate < 0.35) {
        lines.push({ type: 'body', text: 'Čekal jsi. Nechal jsi druhé udělat první krok. To taky říká něco o tobě.' });
      } else {
        lines.push({ type: 'body', text: 'Útočil jsi i bránil — podle situace. Adaptabilita. Nebo nerozhodnost. Záleží na úhlu pohledu.' });
      }
    }

    // ── Fusions / risk ───────────────────────────────────────────────────────
    if((ps.usedFusions||0) > 3) {
      lines.push({ type: 'body', text: `Fúzoval jsi ${ps.usedFusions}krát. Věřil jsi syntéze — že dvě věci mohou být víc než jejich součet.` });
    } else if((ps.usedFusions||0) > 0) {
      lines.push({ type: 'body', text: 'Zkusil jsi fúzi. Přiblížil ses hranici kde dvě věci přestávají existovat zvlášť.' });
    }

    // ── Faction preference ───────────────────────────────────────────────────
    const synthDom = (ps.synthCardsPlayed||0) > (ps.organicCardsPlayed||0) * 1.5;
    const orgDom   = (ps.organicCardsPlayed||0) > (ps.synthCardsPlayed||0) * 1.5;
    if(synthDom) {
      lines.push({ type: 'body', text: 'Dával jsi přednost systémům. Kódu. Struktuře. Věřil jsi že svět je lépe čitelný než živý.' });
    } else if(orgDom) {
      lines.push({ type: 'body', text: 'Dával jsi přednost živému. Kořenům. Hluku. Organickému chaosu víc než protokolu.' });
    }

    // ── Story choices ────────────────────────────────────────────────────────
    if(totalChoices > 2) {
      const synthRate = (ps.choseSynth||0) / totalChoices;
      const orgRate   = (ps.choseOrganic||0) / totalChoices;
      lines.push({ type: 'space' });
      if(synthRate > 0.6) {
        lines.push({ type: 'body', text: 'Ve volbách jsi se přikláněl k řádu. K čistotě systémů. K tomu co lze spočítat.' });
      } else if(orgRate > 0.6) {
        lines.push({ type: 'body', text: 'Ve volbách jsi se přikláněl k živému. K nepořádku. K tomu co nelze předpovědět.' });
      } else {
        lines.push({ type: 'body', text: 'Nenechal ses svést ani na jednu stranu. Hledal jsi třetí cestu — nebo jsi prostě nevěděl.' });
      }
    }

    // ── Spells vs traps ──────────────────────────────────────────────────────
    if((ps.usedSpells||0) > 2 || (ps.usedTraps||0) > 2) {
      const prefer = (ps.usedSpells||0) > (ps.usedTraps||0) ? 'kouzla — přímou akci' : 'pasti — trpělivost';
      lines.push({ type: 'body', text: `Volil jsi ${prefer}.` });
    }

    // ── Lost cards ───────────────────────────────────────────────────────────
    if(lost > 3) {
      lines.push({ type: 'body', text: `Ztratil jsi ${lost} karet. Permanentně. Každá z nich byla rozhodnutí — tvoje nebo systémové.` });
    } else if(lost > 0) {
      lines.push({ type: 'body', text: `${lost} karet zmizelo. Systém si to pamatuje i když ty ne.` });
    }

    // ── Corruption ───────────────────────────────────────────────────────────
    if(corrLevel >= 3) {
      lines.push({ type: 'body', text: `Přepis zanechal hluboké stopy. Nepřepisuješ ty systém — systém přepisuje tebe.` });
    } else if(corrLevel > 0) {
      lines.push({ type: 'body', text: 'Přepis zanechal stopy. Zatím mělké. Zatím.' });
    }

    lines.push({ type: 'space' });

    // ── Identity mirror — profile sentences one per line ────────────────────
    if(id.profileText) {
      const sentences = id.profileText.split(/(?<=\.)\s+/);
      for(const sentence of sentences) {
        const s = sentence.trim();
        if(s) lines.push({ type: 'body', text: s });
      }
      lines.push({ type: 'space' });
    }

    // ── Ending reflection ────────────────────────────────────────────────────
    const endingReflections = {
      synth:        'Protokol tě přijal. Odcházíš jako čistý kód — bez šumu, bez váhání.',
      organic:      'Zakotvil jsi. Kořeny jsou pomalé ale jdou hluboko. Paměť přežila.',
      observer:     'Nezasáhl jsi na žádnou stranu. Jen jsi sledoval. To je taky volba.',
      monyra:       'Signál byl přijat. Monyra tě slyšela — a ty jsi slyšel ji.',
      hybrid:       'Postavil jsi most. Dva světy, jeden průchod. Žádný z nich nezvítězil, ani neprohrál.',
      corruption:   'Přepis se dokončil. Nepřepisuješ ty systém — systém přepsal tebe.',
      // legacy aliasy
      assimilation: 'Systém tě vstřebal. Nebo ses vstřebal do systému. Hranice je v tomhle nejasná.',
      flood:        'Přišel jsi jako přílivová vlna. Systém bude potřebovat čas aby tě zpracoval.',
      fragmentation:'Rozpadl ses na kousky — a každý kousek šel jinam. Možná je to svoboda. Možná jen chaos.',
      architect:    'Přišel jsi jako stavitel. Odcházíš s výkresem který si systém uloží.',
      roots:        'Zakotvil jsi. Kořeny jsou pomalé ale jdou hluboko.',
    };
    const reflection = endingReflections[endingType];
    if(reflection) lines.push({ type: 'closing', text: reflection });

    lines.push({ type: 'space' });

    // ── Signature ────────────────────────────────────────────────────────────
    const signatures = {
      synth:      'Kurýr — přepsán protokolem',
      organic:    'Kurýr — ten, kdo pamatuje',
      observer:   'Kurýr — bez strany',
      monyra:     'Kurýr — signál Monyry',
      hybrid:     'Kurýr — most mezi světy',
      corruption: '— data poškozena —',
      // legacy aliasy
      assimilation: '— Systém',
      flood:        '— Pramáti',
      fragmentation:'— Zrcadlo',
      architect:    '— Lens',
      roots:        '— Pramáti',
    };
    lines.push({ type: 'signature', text: signatures[endingType] || '— Pozorovatel' });

    return lines;
  },

  reset(playerName = 'Pozorovatel') {
    const starterIds = this.buildStarterDeck();
    const starterCol = [...starterIds];
    const fallbackDeck = [1,1,2,3,4,5,6,7,8,9,10,11,21,21,22,23,24,25,26,27,28,29,30,35,51,55,57,81,82,201];
    if(!starterCol.includes(1)) starterCol.push(1, 1);
    this.player = { name: playerName, lp: 10000, maxLp: 10000, alignment: 0, faction: null, credits: 0,
      discoveredFusions: [],
      deck: starterIds.length >= 10 ? starterIds : fallbackDeck,
      collection: starterCol.length >= 10 ? starterCol : [...fallbackDeck, ...fallbackDeck] };
    this.campaign = { currentNode: null, visitedNodes: [], flags: {}, chapter: 0, worldNumber: 1, nodeNumber: 0, lostCards: [], actNumber: 1 };
    this.cardScars  = {};
    this.currentAct = null;
    this.currentEnemy = null;
    this.playstyle  = { attackedFirst: 0, builtDefenseFirst: 0, usedTraps: 0, usedSpells: 0, usedFusions: 0, directAttacks: 0, sacrificedWeak: 0, foughtToLast: 0, storyChoiceSpeeds: [], skippedReadTime: 0, longPauses: 0, synthCardsPlayed: 0, organicCardsPlayed: 0, hybridCardsPlayed: 0, acceptedCardLoss: 0, retreatedOften: 0, riskTaker: 0, choseSynth: 0, choseOrganic: 0, choseNeutral: 0, mirrorFightStyle: null };
    this.identity   = { memoryScore: 0, trustScore: 0, controlScore: 0, acceptanceScore: 0, profileText: null, endingType: null };
    this.checkpoint = { exists: false, nodeId: null, nodeNumber: 0, savedAt: null, narrativeText: '' };
    this.corruption = { level: 0, side: null, visualClass: '', glitchIntensity: 0 };
    this._storyCorruption = 0;
    this.resetBattle();
  },

  _musicMap: {
    // ── MENU ──
    menu_theme: 'assets/audio/bgm/menu_theme.mp3',

    // ── SCREENY ──
    screen_collection:  'assets/audio/bgm/collection.mp3',
    screen_deckbuilder: 'assets/audio/bgm/deckbuilder.mp3',
    screen_freebattle:  'assets/audio/bgm/freebattle_menu.mp3',
    screen_credits:     'assets/audio/bgm/story_slow.mp3',

    // ── PŘÍBĚH ──
    story_calm:    'assets/audio/bgm/story_calm.mp3',
    story_quiet:   'assets/audio/bgm/story_quiet.mp3',
    story_slow:    'assets/audio/bgm/story_slow.mp3',
    story_tension: 'assets/audio/bgm/story_tension.mp3',
    story_dramatic:'assets/audio/bgm/story_dramatic.mp3',
    story_hybrid:  'assets/audio/bgm/story_hybrid.mp3',

    // ── BITVA ──
    battle_story_clean:      'assets/audio/bgm/story_battle_low_corruption.mp3',
    battle_story_corrupted:  'assets/audio/bgm/story_battle_high_corruption.mp3',
    battle_free:             'assets/audio/bgm/freebattle_battle.mp3',

    // ── LEGACY KLÍČE (story uzly mohou odkazovat na tyto) ──
    act1_exploration: 'assets/audio/bgm/story_calm.mp3',
    act2_exploration: 'assets/audio/bgm/story_quiet.mp3',
    act3_exploration: 'assets/audio/bgm/story_tension.mp3',
    act4_exploration: 'assets/audio/bgm/story_dramatic.mp3',
    act5_exploration: 'assets/audio/bgm/story_hybrid.mp3',
    act6_exploration: 'assets/audio/bgm/story_slow.mp3',
    act7_exploration: 'assets/audio/bgm/story_tension.mp3',
    act8_exploration: 'assets/audio/bgm/story_dramatic.mp3',
    act9_exploration: 'assets/audio/bgm/story_hybrid.mp3',
    act10_exploration:'assets/audio/bgm/story_dramatic.mp3',

    // ── SFX ──
    sfx_card_play:    'assets/audio/sfx/card_play.ogg',
    sfx_fusion:       'assets/audio/sfx/fusion.ogg',
    sfx_clash:        'assets/audio/sfx/clash.ogg',
    sfx_damage:       'assets/audio/sfx/damage.ogg',
    sfx_direct_attack:'assets/audio/sfx/direct_attack.ogg',
    sfx_spell:        'assets/audio/sfx/spell.ogg',
    sfx_trap:         'assets/audio/sfx/trap.ogg',
    sfx_arena:        'assets/audio/sfx/arena.ogg',
    sfx_victory:      'assets/audio/sfx/victory.ogg',
    sfx_defeat:       'assets/audio/sfx/defeat.ogg',
  },
  getMusic(key) {
    return this._musicMap[key] || null;
  },
};

export default GameState;
