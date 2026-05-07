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
  },

  campaign: {
    currentNode:  null,
    visitedNodes: [],
    flags:        {},
    chapter:      0,
    worldNumber:  1,
    nodeNumber:   0,
    lostCards:    [],
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

  _computeFusion(idA, idB) {
    const a = this.getCard(idA);
    const b = this.getCard(idB);
    if(!a || !b) return null;
    // Fúzovat se dají jen monstra (ne kouzla/pasti/arény)
    if(a.kind !== 'monster' || b.kind !== 'monster') return null;

    const outFaction = this._fusionFaction(a.faction || 'neutral', b.faction || 'neutral');
    const outSubcat  = this._fusionSubcat(a.subcategory || 'balanced', b.subcategory || 'balanced');
    const samePair   = a.faction === b.faction && a.subcategory === b.subcategory;
    const outTier    = this._fusionTier(a.atk || 0, b.atk || 0, samePair);

    return this._findArchetype(outFaction, outSubcat, outTier);
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
    const prev = this.corruption.level || 0;
    this.corruption = { ...this.corruption, level: Math.max(0, prev + delta) };
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
    const clampedLevel = Math.min(level, 3);
    this.corruption = { level, side, visualClass: level > 0 ? `corruption-${side}-${clampedLevel}` : '', glitchIntensity: level / 5 };
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
      player:    { ...this.player, deck: [...this.player.deck], collection: [...this.player.collection] },
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
    const p   = this.player;
    const ps  = this.playstyle || {};
    const name = p.name || 'Kurýr';
    const totalBattles = (ps.attackedFirst||0) + (ps.builtDefenseFirst||0);
    const alignment = p.alignment || 0;
    const corruption = this.corruption?.level || 0;

    const lines = [];
    lines.push({ type: 'salutation', text: `${name}.` });
    lines.push({ type: 'space' });

    if(totalBattles > 0) {
      if((ps.attackedFirst||0) > (ps.builtDefenseFirst||0)) {
        lines.push({ type: 'body', text: `Útočil jsi jako první. ${ps.attackedFirst}krát z ${totalBattles}.` });
      } else {
        lines.push({ type: 'body', text: `Čekal jsi než zaútočíš. ${ps.builtDefenseFirst}krát z ${totalBattles}.` });
      }
    }
    if((ps.usedFusions||0) > 0) {
      lines.push({ type: 'body', text: `Fúzoval jsi ${ps.usedFusions}krát. Věřil jsi že celek je víc než součty.` });
    }
    if((ps.usedSpells||0) > 0 || (ps.usedTraps||0) > 0) {
      const prefer = (ps.usedSpells||0) > (ps.usedTraps||0) ? 'kouzla' : 'pasti';
      lines.push({ type: 'body', text: `Dával jsi přednost ${prefer}.` });
    }
    lines.push({ type: 'space' });
    if(alignment > 40) {
      lines.push({ type: 'body', text: 'Věřil jsi systému. Nebo sis to alespoň říkal.' });
    } else if(alignment < -40) {
      lines.push({ type: 'body', text: 'Věřil jsi živému. Kořenům. Chaosu.' });
    } else if(Math.abs(alignment) < 15) {
      lines.push({ type: 'body', text: 'Nestál jsi na žádné straně. To je také volba.' });
    } else {
      lines.push({ type: 'body', text: 'Osciloval jsi. Obě strany tě lákaly.' });
    }
    if(corruption > 60) {
      lines.push({ type: 'body', text: `Přepis zanechal stopy. ${corruption > 80 ? 'Hluboké.' : 'Zatím mělké.'}` });
    }
    const lost = this.campaign?.lostCards?.length || 0;
    if(lost > 0) {
      lines.push({ type: 'body', text: `${lost} karet jsi ztratil. Permanentně.` });
    }
    lines.push({ type: 'space' });
    const endingId = this.identity?.endingType || '';
    const endings = {
      synth: 'Dopis byl protokol. Byl jsi protokol. Systém si pamatuje.',
      organic: 'Dopis byl semeno. Zasadil jsi ho. Co vyroste, nevíš.',
      hybrid: 'Dopis byl klíč. Otevřel jsi dveře které nikdo nečekal.',
      monyra: 'Dopis byl od ní. Vždy byl. Teď víš proč.',
      corruption: 'Dopis byl ty. Vždy byl ty.',
      corruption_early: 'Přepis tě dostal dřív než ses rozhodl. Nebo ses rozhodl.',
      observer: 'Dopis byl záznam. Zůstaneš jako záznam.',
      sold: 'Prodal jsi dopis. Byl prázdný. Vždy byl.',
      surrender: 'Vzdal jsi se. Systém tě přijal bez komentáře.',
    };
    lines.push({ type: 'body', text: endings[endingId] || 'Dopis byl doručen.' });
    lines.push({ type: 'space' });
    const signatures = {
      monyra: 'M.', synth: '— Protokol', organic: '— Pramáti', hybrid: '— Lens',
      corruption: '', corruption_early: '', observer: '— Pozorovatel',
      sold: '— Syndikát', surrender: '— Systém',
    };
    const sig = signatures[endingId];
    if(sig) lines.push({ type: 'signature', text: sig });
    return lines;
  },

  reset(playerName = 'Pozorovatel') {
    const starterIds = this.buildStarterDeck();
    const starterCol = [...starterIds];
    const fallbackDeck = [1,1,2,3,4,5,6,7,8,9,10,11,21,21,22,23,24,25,26,27,28,29,30,35,51,55,57,81,82,201];
    if(!starterCol.includes(1)) starterCol.push(1, 1);
    this.player = { name: playerName, lp: 10000, maxLp: 10000, alignment: 0, faction: null, credits: 0,
      deck: starterIds.length >= 10 ? starterIds : fallbackDeck,
      collection: starterCol.length >= 10 ? starterCol : [...fallbackDeck, ...fallbackDeck] };
    this.campaign = { currentNode: null, visitedNodes: [], flags: {}, chapter: 0, worldNumber: 1, nodeNumber: 0, lostCards: [] };
    this.cardScars  = {};
    this.currentAct = null;
    this.currentEnemy = null;
    this.playstyle  = { attackedFirst: 0, builtDefenseFirst: 0, usedTraps: 0, usedSpells: 0, usedFusions: 0, directAttacks: 0, sacrificedWeak: 0, foughtToLast: 0, storyChoiceSpeeds: [], skippedReadTime: 0, longPauses: 0, synthCardsPlayed: 0, organicCardsPlayed: 0, hybridCardsPlayed: 0, acceptedCardLoss: 0, retreatedOften: 0, riskTaker: 0, choseSynth: 0, choseOrganic: 0, choseNeutral: 0, mirrorFightStyle: null };
    this.identity   = { memoryScore: 0, trustScore: 0, controlScore: 0, acceptanceScore: 0, profileText: null, endingType: null };
    this.checkpoint = { exists: false, nodeId: null, nodeNumber: 0, savedAt: null, narrativeText: '' };
    this.corruption = { level: 0, side: null, visualClass: '', glitchIntensity: 0 };
    this.resetBattle();
  },

  _musicMap: {
    menu_theme: 'assets/audio/menu_theme.mp3',
    act1_exploration: 'assets/audio/bgm/act1_exploration.mp3',
    act1_battle: 'assets/audio/bgm/act1_battle.mp3',
    act1_boss: 'assets/audio/bgm/act1_boss.mp3',
    act2_exploration: 'assets/audio/bgm/act2_exploration.mp3',
    act2_battle: 'assets/audio/bgm/act2_battle.mp3',
    act2_boss: 'assets/audio/bgm/act2_boss.mp3',
    act3_battle: 'assets/audio/bgm/act3_battle.mp3',
    act3_boss: 'assets/audio/bgm/act3_boss.mp3',
    act4_battle: 'assets/audio/bgm/act4_battle.mp3',
    act4_boss_theme: 'assets/audio/bgm/act4_boss.mp3',
    act5_eli_battle: 'assets/audio/bgm/act5_eli_battle.mp3',
    act6_battle: 'assets/audio/bgm/act6_battle.mp3',
    act7_battle: 'assets/audio/bgm/act7_battle.mp3',
    act7_boss_theme: 'assets/audio/bgm/act7_boss.mp3',
    act8_boss_theme: 'assets/audio/bgm/act8_boss.mp3',
    act9_battle_theme: 'assets/audio/bgm/act9_battle.mp3',
    act10_boss_synth: 'assets/audio/bgm/act10_boss_synth.mp3',
    act10_boss_organic: 'assets/audio/bgm/act10_boss_organic.mp3',
    act10_boss_paradox: 'assets/audio/bgm/act10_boss_paradox.mp3',
    act10_boss_monyra: 'assets/audio/bgm/act10_boss_monyra.mp3',
    sfx_card_play: 'assets/audio/sfx/card_play.mp3',
    sfx_fusion: 'assets/audio/sfx/fusion.mp3',
    sfx_clash: 'assets/audio/sfx/clash.mp3',
    sfx_damage: 'assets/audio/sfx/damage.mp3',
    sfx_direct_attack: 'assets/audio/sfx/direct_attack.mp3',
    sfx_spell: 'assets/audio/sfx/spell.mp3',
    sfx_trap: 'assets/audio/sfx/trap.mp3',
    sfx_arena: 'assets/audio/sfx/arena.mp3',
    sfx_victory: 'assets/audio/sfx/victory.mp3',
    sfx_defeat: 'assets/audio/sfx/defeat.mp3',
  },
  getMusic(key) {
    return this._musicMap[key] || null;
  },
};

export default GameState;
