import Router      from '../engine/Router.js';
import { CAMPAIGN_DATA } from '../data/campaign.js';
import CorruptionVisuals from './CorruptionVisuals.js';
import EventBus     from '../engine/EventBus.js';
import GameState    from '../engine/GameState.js';
import AssetLoader  from '../engine/AssetLoader.js';
import AudioSystem  from '../modules/AudioSystem.js';
import SaveManager  from '../engine/SaveManager.js';

/**
 * StoryEngine — CONFLUX v2039
 * Zpracovává campaign.json uzly: story, battle, cutscene
 *
 * v2039: Skryté důsledky voleb
 *   — Žádné ↑/↓ hinty pod volbami, žádná 🔒 ikona ani text "nedostupné"
 *   — Locked volby vypadají normálně, po kliknutí jemné chvění a přesun na failNext
 *   — HUD: jen barevná tečka místo textu ORDER/CHAOS
 *   — Tiché měření času volby (ms) pro identity profile a letter
 *
 * Params: { nodeId: 'intro' }
 *
 * Volby podporují:
 *   requireFlag:      'flag_name'         — hráč musí mít flag
 *   requireAlignment: { min: -100, max: 100 } — alignment musí být v rozsahu
 *   failNext:         'node_id'           — kam jít pokud podmínka nesplněna
 *
 * Příklad campaign.json volby:
 *   {
 *     "label": "Přijmout nabídku Synthu",
 *     "next": "synth_deal",
 *     "requireAlignment": { "min": 10 },
 *     "alignmentDelta": 15,
 *     "setFlag": "accepted_synth"
 *   }
 */
const StoryEngine = {
  // ── Speaker → portrait mapping ─────────────────────────────────────────
  // key: speaker string z dialog line (case-insensitive)
  // value: { portrait: filename bez .png, side: 'left'|'right' }
  // Hráčovy postavy / spojenci = left. Ostatní = right.
  _speakerMap: {
    'player':  { portrait: 'kuryr',   side: 'left'  },
    'kuryr':   { portrait: 'kuryr',   side: 'left'  },
    'monyra':  { portrait: 'monyra',  side: 'left'  },
    'rozara':  { portrait: 'rozara',  side: 'right' },
    'romen':   { portrait: 'romen',   side: 'right' },
    'marta':   { portrait: 'marta',   side: 'right' },
    'eli':     { portrait: 'eli',     side: 'right' },
    'voit':    { portrait: 'voit',    side: 'right' },
    'lens':    { portrait: 'lens',    side: 'right' },
    // bez portraitu — jen jméno (system, stráže, NPC bez artwork)
    // tito nebudou mít portrait ve scéně
  },
  _resolveSpeaker(speakerKey) {
    if (!speakerKey) return null;
    const key = String(speakerKey).toLowerCase();
    return this._speakerMap[key] || null;
  },

  // ── BG resolver: některé backgroundy jsou .png místo .jpg ────────────────
  _bgPngSet: new Set([
    'mesto','les','ruiny','synth_brana',
    'act8_mesto','battle_bg','collection_bg','deckbuilder_bg',
    'freebattle_bg','letter_bg','letter_bg2'
  ]),
  // Alias mapa — campaign.js názvy → reálné soubory které máme v assets
  // Pro akty 1-10 existuje jeden nebo dva "hero" backgroundy, všechny scény
  // v rámci aktu používají jeden z nich podle charakteru lokace.
  _bgAlias: {
    // ═══ ACT 1 ═══ (máme act1_synth, act1_organic)
    'act1_city_gate':'act1_synth', 'act1_checkpoint':'act1_synth',
    'act1_city_streets':'act1_synth', 'act1_admin':'act1_synth',
    'act1_synth_checkpoint':'act1_synth', 'act1_synth_zone':'act1_synth',
    'act1_forest_edge':'act1_organic', 'act1_crossroads':'act1_synth',
    'act1_gate_inner':'act1_synth', 'act1_beyond_gate':'act1_organic',
    // ═══ ACT 2 ═══ (máme act2_demarkace)
    'act2_border':'act2_demarkace', 'act2_synth_border':'act1_synth',
    'act2_forest_deep':'act1_organic', 'act2_forest_hidden':'act1_organic',
    'act2_crossroads':'act2_demarkace', 'act2_synth_deep':'act1_synth',
    'act2_ruins':'act6_ruiny', 'act2_before_boss':'act2_demarkace',
    'act2_gate':'act2_demarkace', 'act2_beyond':'act2_demarkace',
    // ═══ ACT 3 ═══ (máme act3_nexus)
    'act3_nexus':'act3_nexus', 'act3_nexus_deep':'act3_nexus',
    'act3_nexus_edge':'act3_nexus', 'act3_fusion_zone':'act3_nexus',
    'act3_before_boss':'act3_nexus', 'act3_duel_arena':'act3_nexus',
    'act3_beyond':'act2_demarkace', 'act3_horizon':'act3_nexus',
    // ═══ ACT 4 ═══ (máme act4_syndikat)
    'act4_border_dusk':'act4_syndikat', 'act4_city_corridor':'act1_synth',
    'act4_red_zone':'act4_syndikat', 'act4_syndicate_hall':'act4_syndikat',
    'act4_sector7':'act4_syndikat', 'act4_syndicate':'act4_syndikat',
    'act4_veritel_office':'act4_syndikat',
    // ═══ ACT 5 ═══ (máme act5_stanice)
    'act5_outer_ring':'act5_stanice', 'act5_transit_station':'act5_stanice',
    'act5_duel_memory':'act9_zrcadlo', 'act5_road_evening':'act5_stanice',
    'act5_road_dusk':'act5_stanice',
    // ═══ ACT 6 ═══ (máme act6_ruiny)
    'act6_crossing':'act6_ruiny', 'act6_crossing_fight':'act6_ruiny',
    'act6_ruins':'act6_ruiny', 'act6_open_road':'act2_demarkace',
    'act6_horizon':'act6_ruiny', 'act6_city':'mesto_intro',
    'act6_synth_hq':'act1_synth',
    // ═══ ACT 7 ═══ (máme act7_centrum)
    'act7_distorted_road':'act7_centrum', 'act7_checkpoint':'act1_synth',
    'act7_checkpoint_fight':'act7_centrum', 'act7_deep_road':'act7_centrum',
    'act7_core_facility':'act7_centrum', 'act7_core_inner':'act7_centrum',
    'act7_core_battle':'act7_centrum', 'act7_exit':'act7_centrum',
    'act7_horizon_glitch':'act9_zrcadlo',
    // ═══ ACT 8 ═══ (máme act8_mesto)
    'act8_border_town':'act8_mesto', 'act8_battle_town':'act8_mesto',
    'act8_road_after':'act2_demarkace', 'act8_horizon_clear':'act8_mesto',
    'act8_void':'act9_zrcadlo',
    // ═══ ACT 9 ═══ (máme act9_zrcadlo)
    'act9_convergence_plain':'act9_zrcadlo', 'act9_memory_space':'act9_zrcadlo',
    'act9_mirror_space':'act9_zrcadlo', 'act9_threshold':'act9_zrcadlo',
    'act9_threshold_open':'act9_zrcadlo', 'act9_transition_fight':'act9_zrcadlo',
    'act9_synth_gate':'synth_brana', 'act9_organic_gate':'act1_organic',
    'act9_center_gate':'act9_zrcadlo', 'act9_fourth_gate':'act9_zrcadlo',
    // ═══ ACT 10 ═══ (máme act10_konvergence)
    'act10_convergence':'act10_konvergence', 'act10_synth_core':'act10_konvergence',
    'act10_synth_battle':'act10_konvergence', 'act10_synth_horizon':'act10_konvergence',
    'act10_organic_deep':'act1_organic', 'act10_organic_battle':'act1_organic',
    'act10_organic_horizon':'act1_organic', 'act10_center_void':'act10_konvergence',
    'act10_void':'act10_konvergence', 'act10_void_battle':'act10_konvergence',
    'act10_fourth_space':'act10_konvergence', 'act10_fourth_horizon':'act10_konvergence',
    'act10_protocol_space':'act10_konvergence', 'act10_open_horizon':'act10_konvergence',
  },
  _resolveBgName(name) {
    if (!name) return '';
    return this._bgAlias[name] || name;
  },
  _bgUrl(name) {
    if (!name) return '';
    const real = this._resolveBgName(name);
    const ext = this._bgPngSet.has(real) ? 'png' : 'jpg';
    return `assets/images/backgrounds/${real}.${ext}`;
  },
  _bgStyle(name) {
    return name ? `background-image:url('${this._bgUrl(name)}')` : '';
  },
  _container:       null,
  _campaign:        null,
  _nodes:           {},
  _unsubscribers:   [],
  _typewriterTimer: null,
  _lastNav: 0,

  // Veřejný alias — Router může volat přímo
  processNode(nodeId, _retries = 0) {
    if(!this._nodes || Object.keys(this._nodes).length === 0) {
      if(_retries >= 10) {
        console.error('[StoryEngine] processNode: uzly nenačteny ani po 10 pokusech, nodeId:', nodeId);
        this._renderError?.(`Nepodařilo se načíst uzel '${nodeId}' — obnovte stránku.`);
        return;
      }
      console.warn('[StoryEngine] processNode: uzly ještě nenačteny, odkládám... pokus:', _retries + 1);
      setTimeout(() => this.processNode(nodeId, _retries + 1), 200);
      return;
    }
    this._goToNode(nodeId);
  },

  // Přednahraj campaign.json bez renderování — volá se z boot()
  async preload() {
    if(Object.keys(this._nodes).length > 0) return; // už načteno
    const raw = CAMPAIGN_DATA;
    if(!raw) { console.warn('[StoryEngine] preload: CAMPAIGN_DATA nenalezena'); return; }
    this._nodes = {};
    if(raw.nodes) {
      this._nodes = raw.nodes;
    } else if(Array.isArray(raw.acts)) {
      for(const act of raw.acts) {
        for(const node of (act.nodes || [])) {
          this._nodes[node.id] = { ...node, _actId: act.id };
        }
      }
    }
    this._campaign = raw;
    const nodeCount = Object.keys(this._nodes).length;
    console.log('[StoryEngine] Přednahráno:', nodeCount, 'uzlů');

    // Validace: odhal broken next pointery a uzly bez ID
    const nodeIds = new Set(Object.keys(this._nodes));
    const broken = [];
    for(const [id, node] of Object.entries(this._nodes)) {
      if(!id) { broken.push('uzel bez ID'); continue; }
      if(node.next && !nodeIds.has(node.next)) broken.push(`'${id}' → next:'${node.next}' (nenalezen)`);
      if(node.onWin  && !nodeIds.has(node.onWin))  broken.push(`'${id}' → onWin:'${node.onWin}' (nenalezen)`);
      if(node.onLose && !nodeIds.has(node.onLose)) broken.push(`'${id}' → onLose:'${node.onLose}' (nenalezen)`);
    }
    if(broken.length) console.warn('[StoryEngine] Broken node links:', broken.length, '\n' + broken.slice(0,10).join('\n'));
  },

  async init(container, params = {}) {
    // Vyčisti staré listenery z předchozího init()
    this._unsubscribers.forEach(fn => fn());
    this._unsubscribers = [];
    clearInterval(this._typewriterTimer);
    this._typewriterTimer = null;

    this._container = container;
    this._params = params;
    this._lastNav = 0;
    this._renderLoading();

    // Načti campaign.json — jen pokud ještě nemáme uzly (cache přes session)
    if(Object.keys(this._nodes).length === 0) {
      const raw = CAMPAIGN_DATA;
      if(!raw) {
        this._renderError('CAMPAIGN_DATA nenalezena — zkontroluj data/campaign.js');
        return;
      }

      // Flatten: acts[].nodes[] → this._nodes{id: node}
      this._nodes = {};
      if(raw.nodes) {
        this._nodes = raw.nodes;
      } else if(Array.isArray(raw.acts)) {
        for(const act of raw.acts) {
          for(const node of (act.nodes || [])) {
            this._nodes[node.id] = { ...node, _actId: act.id };
          }
        }
      }
      this._campaign = raw;

      const nodeCount = Object.keys(this._nodes).length;
      console.log('[StoryEngine] Uzlů:', nodeCount, '| první:', Object.keys(this._nodes)[0]);

      if(nodeCount === 0) {
        this._renderError('Kampaň neobsahuje uzly.');
        return;
      }
    } else {
      console.log('[StoryEngine] Uzly z cache, přeskakuji fetch. Uzlů:', Object.keys(this._nodes).length);
    }

    // Startovní uzel
    let nodeId = params.nodeId ?? GameState.campaign?.currentNode ?? null;
    if(!nodeId || !this._nodes[nodeId]) {
      // Fallback: act1_intro (nikdy pre_menu_intro)
      nodeId = this._nodes['act1_intro'] ? 'act1_intro'
             : Object.keys(this._nodes).find(k => k !== 'pre_menu_intro')
             || Object.keys(this._nodes)[0];
    }
    // pre_menu_intro se pouští pouze explicitně z MainMenu, ne jako fallback
    if(nodeId === 'pre_menu_intro' && !params.nodeId) {
      nodeId = this._nodes['act1_intro'] ? 'act1_intro' : Object.keys(this._nodes).find(k => k !== 'pre_menu_intro');
    }
    console.log('[StoryEngine] init → _goToNode:', nodeId, '| uzel existuje:', !!this._nodes[nodeId]);

    // Watchdog — pokud do 4s stále NAČÍTÁM, zobraz error s detailem
    const watchdog = setTimeout(() => {
      const stillLoading = this._container?.querySelector('.story-loading');
      if(stillLoading) {
        console.error('[StoryEngine] WATCHDOG: zamrzlo na NAČÍTÁM po 4s. nodeId:', nodeId, 'uzel:', JSON.stringify(this._nodes[nodeId]));
        this._renderError(`Zamrzlo na uzlu '${nodeId}' (typ: ${this._nodes[nodeId]?.type || '?'}). Viz konzole.`);
      }
    }, 4000);

    try {
      this._goToNode(nodeId);
    } finally {
      clearTimeout(watchdog);
    }

    // Navigaci po bitvě řeší BattleSystem přímo přes Router.goto('story')
    // battle:end zde pouze aktualizuje GameState.campaign.currentNode pro save
    const unsub = EventBus.on('battle:end', ({ result, nodeId: battleNode }) => {
      if(battleNode) GameState.campaign.currentNode = battleNode;
    });
    this._unsubscribers.push(unsub);
  },

  // ── NODE PROCESSING ───────────────────────────────────────────────────────
  _goToNode(nodeId, auto = false) {
    // Guard proti rychlému dvojkliku — jen pro manuální volání (klik hráče)
    if(!auto) {
      const now = Date.now();
      if(this._lastNav && now - this._lastNav < 250) return;
      this._lastNav = now;
    }
    if(!nodeId) return;

    const node = this._nodes?.[nodeId];
    if(!node) {
      console.error('[StoryEngine] Uzel nenalezen:', nodeId, '| dostupné:', Object.keys(this._nodes||{}).slice(0,5));
      this._renderError(`Uzel '${nodeId}' nenalezen.`);
      return;
    }

    console.log('[StoryEngine] _goToNode:', nodeId, '| type:', node.type);
    GameState.campaign.currentNode = nodeId;
    GameState.markVisited(nodeId);
    this._currentNode = node;
    // Ulož endingId pro letter system
    if(node.endingId) {
      if(!GameState.identity) GameState.identity = {};
      GameState.identity.endingType = node.endingId;
    }

    // Checkpoint — automaticky na uzlech kde nodeNumber % 5 === 0 nebo type === 'act_end'
    const isActEnd = node.type === 'act_end';
    if(isActEnd || (node.nodeNumber && node.nodeNumber % 5 === 0 && node.checkpointText)) {
      GameState.saveCheckpoint && GameState.saveCheckpoint(nodeId, node.nodeNumber || 0, node.checkpointText || node.text || '');
      // Ukládej do naposledy použitého slotu (nebo 0 jako fallback)
      const _saveSlot = GameState._lastSaveSlot ?? 0;
      SaveManager.save(_saveSlot);
      if(node.checkpointText) setTimeout(() => this._showCheckpointToast(node.checkpointText), 500);
    }

    // act_end — uloží, přepne hudbu, přejde na next uzel
    if(isActEnd) {
      // Přepni hudbu na next akt
      const nextActNum = (GameState.campaign.actNumber || 1) + 1;
      try { AudioSystem?.crossfade?.(null, `act${nextActNum}_exploration`, 2000); } catch(e) {}
      GameState.campaign.actNumber = nextActNum;
      if(node.next) setTimeout(() => this._goToNode(node.next, true), 400);
      else Router.goto('menu');
      return;
    }

    // Corruption redirect — tmavá větev
    if(node.corruptionCheck) {
      const { threshold, redirect } = node.corruptionCheck;
      const corrLevel = GameState.corruption?.level || 0;
      if(corrLevel >= threshold && redirect && this._nodes?.[redirect]) {
        GameState.setFlag('on_dark_branch');
        this._goToNode(redirect, true);
        return;
      }
    }

    // Permanentní ztráta karty
    if(node.loseCard) {
      if(node.loseCard === 'auto') {
        const col = GameState.player.collection || [];
        const faction = GameState.player.faction;
        const removeFaction = faction === 'synth' ? 'organic' : 'synth';
        const target = col.find(id => {
          if(removeFaction === 'organic') return id >= 21 && id <= 40;
          if(removeFaction === 'synth')   return id >= 1  && id <= 20;
          return false;
        }) || col[0];
        if(target) {
          GameState.loseCard && GameState.loseCard(target, node.loseCardReason || 'synth_tax');
          setTimeout(() => this._showCardLostToast(node.loseCardReason), 600);
        }
      } else {
        GameState.loseCard && GameState.loseCard(node.loseCard, node.loseCardReason || 'story_event');
      }
    }

    // Aplikuj efekty uzlu (podporuje starý formát i nový node.effects)
    const _eff = node.effects || {};
    if(node.setFlag)        GameState.setFlag(node.setFlag);
    // Přepni hudbu pokud uzel specifikuje music (pro všechny typy uzlů)
    if(node.music) {
      try { AudioSystem?.crossfade?.(null, node.music, 1500); } catch(e) {}
    }
    if(node.alignmentDelta) GameState.adjustAlignment(node.alignmentDelta);
    if(_eff.flags?.set)     for(const f of _eff.flags.set) GameState.setFlag(f);
    if(_eff.flags?.unset)   for(const f of _eff.flags.unset) GameState.setFlag(f, false);
    if(_eff.alignment)      GameState.adjustAlignment(_eff.alignment);
    if(_eff.corruption) {
      GameState.adjustCorruption(_eff.corruption);
    }
    if(node.giveCard) {
      if(!GameState.player.collection.includes(node.giveCard)) {
        GameState.player.collection.push(node.giveCard);
        EventBus.emit('story:cardReceived', { cardId: node.giveCard });
      }
    }

    // Ticho jako mechanika — speciální uzel
    if(node.silence) {
      EventBus.emit('story:silence', { duration: node.silence });
    }

    EventBus.emit('story:node', { nodeId, node });

    switch(node.type) {
      case 'story':    this._renderStory(nodeId, node);    break;
      case 'dialog':   this._renderDialog(nodeId, node);   break;
      case 'briefing': this._renderBriefing(nodeId, node); break;
      case 'battle':   this._startBattle(nodeId, node);    break;
      case 'cutscene': this._renderCutscene(nodeId, node); break;
      case 'choice':   this._renderChoice2(nodeId, node);  break;
      case 'anchor':   this._renderAnchor(nodeId, node);   break;
      case 'map':      this._renderMap(nodeId, node);      break;
      case 'reward':   this._renderReward(nodeId, node);   break;
      case 'profile':  this._renderProfile(nodeId, node);  break;
      case 'letter':
        // Spusť LetterEngine přes Router
        setTimeout(() => {
          Router._transitioning = false;
          Router.goto('letter', { endingId: node.endingId || GameState.identity?.endingType });
        }, 300);
        return;
      case 'end':        this._renderEnd(node);                break;
      case 'fusionDemo': this._renderFusionDemo(nodeId, node); break;
      default:
        // Neznámý typ — pokud má next, jen přeskočíme
        if(node.next) { this._goToNode(node.next, true); return; }
        this._renderError(`Neznámý typ uzlu: ${node.type}`);
    }
  },

  // ── FUSION DEMO (tutoriál) ────────────────────────────────────────────────
  _renderFusionDemo(nodeId, node) {
    this._addStyles();

    const ca  = GameState.getCard(node.cardA);
    const cb  = GameState.getCard(node.cardB);
    const cr  = GameState.getCard(node.result);
    if(!ca || !cb || !cr) { if(node.next) this._goToNode(node.next); return; }

    const factionColor = f => ({ synth:'#4fa3e0', organic:'#e04f6a', hybrid:'#50e0b8', corruption:'#9b59b6', neutral:'#8a9ab0' }[f] || '#8a9ab0');

    const cardHtml = (c, extraClass='') => `
      <div class="fd-card ${extraClass}" data-faction="${c.faction}">
        <div class="fd-emoji">${c.emoji||'?'}</div>
        <div class="fd-name">${c.name}</div>
        <div class="fd-stats">${c.atk} / ${c.def}</div>
        <div class="fd-faction" style="color:${factionColor(c.faction)}">${c.faction.toUpperCase()}</div>
      </div>`;

    this._container.innerHTML = `
      <div class="vn-screen fade-in">
        <div class="vn-bg"><div class="vn-bg-overlay"></div></div>
        <div class="fd-stage">
          <div class="fd-row" id="fd-row">
            ${cardHtml(ca,'fd-card-a')}
            <div class="fd-plus" id="fd-plus">+</div>
            ${cardHtml(cb,'fd-card-b')}
            <div class="fd-arrow" id="fd-arrow">→</div>
            ${cardHtml(cr,'fd-card-r fd-hidden')}
          </div>
        </div>
        <div class="vn-panel">
          <div class="vn-text" id="fd-text"></div>
          <div class="vn-choices" id="fd-btns"></div>
        </div>
      </div>`;

    const intro  = node.intro  || [];
    const outro  = node.outro  || [];
    const textEl = this._container.querySelector('#fd-text');
    const btnsEl = this._container.querySelector('#fd-btns');
    const arrowEl = this._container.querySelector('#fd-arrow');
    const resultEl = this._container.querySelector('.fd-card-r');

    const setLine = (speaker, text) => {
      const col = factionColor({ monyra:'hybrid', player:'neutral' }[speaker] || 'neutral');
      textEl.innerHTML = `<span class="vn-speaker" style="color:${col}">${speaker.toUpperCase()}</span>${text}`;
    };

    const showBtn = (label, onClick) => {
      btnsEl.innerHTML = `<button class="vn-btn">${label}</button>`;
      btnsEl.querySelector('.vn-btn').addEventListener('click', onClick);
    };

    // Sequence: intro lines → merge button → merge animation → outro lines → continue
    let step = 0;
    const advance = () => {
      if(step < intro.length) {
        const l = intro[step++];
        setLine(l.speaker, l.text);
        const isLast = step === intro.length;
        showBtn(isLast ? '▶ SPOJIT' : '▶', isLast ? doMerge : advance);
      } else if(step === intro.length) {
        doMerge();
      }
    };

    const doMerge = () => {
      btnsEl.innerHTML = '';
      // Animace — plus → → result appears
      const plusEl = this._container.querySelector('#fd-plus');
      plusEl.style.transition = 'opacity 0.3s';
      plusEl.style.opacity = '0';
      setTimeout(() => {
        arrowEl.classList.remove('fd-hidden');
        arrowEl.style.animation = 'fd-pop 0.4s ease';
        setTimeout(() => {
          resultEl.classList.remove('fd-hidden');
          resultEl.style.animation = 'fd-pop 0.5s ease';
          step = intro.length + 1; // skip past intro, into outro
          setTimeout(showOutro, 500);
        }, 350);
      }, 300);
    };

    const showOutro = () => {
      let outroIdx = 0;
      const nextOutro = () => {
        if(outroIdx < outro.length) {
          const l = outro[outroIdx++];
          setLine(l.speaker, l.text);
          const isLast = outroIdx === outro.length;
          showBtn(isLast ? '▶ POKRAČOVAT' : '▶', isLast ? () => this._goToNode(node.next) : nextOutro);
        } else {
          this._goToNode(node.next);
        }
      };
      nextOutro();
    };

    // Start
    advance();
  },

  // ── STORY RENDER ──────────────────────────────────────────────────────────
  _renderStory(nodeId, node) {
    const alignment  = GameState.player.alignment;
    const bgStyle    = node.image ? `background-image:url('${node.image}')` : '';
    const choicesHtml = node.choices
      ? node.choices.map((c, i) => this._renderChoice(c, i)).join('')
      : node.next
        ? `<button class="vn-btn" data-next="${node.next}">▶ POKRAČOVAT</button>`
        : '';

    this._container.innerHTML = `
      <div class="vn-screen fade-in">
        <div class="vn-bg" style="${bgStyle}"><div class="vn-bg-overlay"></div></div>
        <div class="vn-hud">
          <span>KAP. ${GameState.campaign.chapter}</span>
          <span class="vn-align-dot" style="background:${this._alignColor(alignment)}" aria-hidden="true"></span>
        </div>
        ${node.giveCard ? `<div class="vn-card-reward"><span class="vn-reward-label">▶ KARTA ZÍSKÁNA</span><span class="vn-reward-name">${node.giveCard}</span></div>` : ''}
        <div class="vn-panel">
          <div class="vn-text typewriter-text" data-full="${(node.text ?? '').replace(/"/g, '&quot;')}"></div>
          <div class="vn-choices">${choicesHtml}</div>
        </div>
      </div>`;

    this._addStyles();
    this._bindChoices(node.choices || []);
    this._startTypewriter();

    // Klik kdekoliv = skip typewriter nebo pokračovat (jen pokud není choice)
    if(!node.choices && node.next) {
      const screen = this._container.querySelector('.vn-screen');
      if(screen) {
        screen.style.cursor = 'pointer';
        const handler = () => {
          if(this._typewriterTimer) {
            // Text ještě píše — skip na konec
            clearInterval(this._typewriterTimer);
            this._typewriterTimer = null;
            const el = this._container.querySelector('.typewriter-text');
            if(el) el.textContent = el.dataset.full || '';
          } else {
            // Text dočten — pokračuj
            screen.removeEventListener('click', handler);
            this._goToNode(node.next);
          }
        };
        screen.addEventListener('click', handler, { once: true });
      }
    }
  },

  // ── VOLBY ─────────────────────────────────────────────────────────────────
  _renderChoice(choice, index) {
    const alignment = GameState.player.alignment;
    // Podpora obou formátů: choice.text (campaign JSON) i choice.label (starý)
    const label = choice.text ?? choice.label ?? '';
    // Podpora obou formátů efektů: choice.effects.* (campaign) i přímé fieldy (starý)
    const eff        = choice.effects || {};
    const alignDelta = eff.alignment ?? choice.alignmentDelta ?? 0;
    const flagsSet   = eff.flags?.set ?? (choice.setFlag ? [choice.setFlag] : []);
    const corruption = eff.corruption ?? 0;

    // ── requireFlag ──
    if(choice.requireFlag) {
      const hasFlag = GameState.getFlag(choice.requireFlag);
      if(!hasFlag) {
        if(choice.failNext) {
          // Volba vypadá normálně — hráč neví že je locked. Glitch přijde až po kliknutí.
          return `<button class="vn-btn btn-choice"
            data-next="${choice.failNext}" data-index="${index}" data-locked="flag">
            ${label}
          </button>`;
        }
        return ''; // Skryj zcela
      }
    }

    // ── requireAlignment ──
    if(choice.requireAlignment) {
      const { min = -100, max = 100 } = choice.requireAlignment;
      const inRange = alignment >= min && alignment <= max;

      if(!inRange) {
        if(choice.failNext) {
          // Volba vypadá normálně — hráč neví že je locked. Glitch přijde až po kliknutí.
          return `<button class="vn-btn btn-choice"
            data-next="${choice.failNext}" data-index="${index}" data-locked="alignment">
            ${label}
          </button>`;
        }
        return ''; // Skryj zcela
      }
    }

    // ── Normální volba ──
    // Efekty jsou skryté — hráč neví co volba "stojí" dokud nekliknu.
    return `<button class="vn-btn btn-choice"
      data-next="${choice.next ?? ''}"
      data-index="${index}"
      data-alignment="${alignDelta}"
      data-flags="${flagsSet.join(',')}"
      data-corruption="${corruption}">
      ${label}
    </button>`;
  },

  _bindChoices(choices) {
    // Tiché měření času rozhodnutí — začíná když se volby zobrazí
    const choiceShownAt = Date.now();

    this._container.querySelectorAll('.btn-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        const ms = Date.now() - choiceShownAt;
        const locked = btn.dataset.locked;

        if(locked) {
          this._glitchLockedChoice(btn);
          const next = btn.dataset.next;
          // Tracking — i locked volby započítáme pro identitu
          GameState.trackPlay('story_choice', { ms, side: null });
          if(next) setTimeout(() => this._goToNode(next), 400);
          return;
        }

        const next       = btn.dataset.next;
        const idx        = parseInt(btn.dataset.index ?? -1);
        const alignDelta = parseInt(btn.dataset.alignment ?? 0);
        const flags      = btn.dataset.flags ? btn.dataset.flags.split(',').filter(Boolean) : [];
        const corruption = parseInt(btn.dataset.corruption ?? 0);

        if(alignDelta)   GameState.adjustAlignment(alignDelta);
        for(const f of flags) GameState.setFlag(f);
        if(corruption > 0) {
          GameState.adjustCorruption(corruption);
        }

        // Tiché trackování: čas rozhodnutí a strana volby
        const side = alignDelta > 0 ? 'synth' : alignDelta < 0 ? 'organic' : 'neutral';
        GameState.trackPlay('story_choice', { ms, side });

        EventBus.emit('story:choice', { choiceIndex: idx, nextNode: next });
        EventBus.emit('ui:click');

        if(next) this._goToNode(next);
      });
    });
  },

  // Jemný "něco nesedí" signal na zamčené volbě — bez barev, jen drobné chvění
  _glitchLockedChoice(btn) {
    btn.classList.add('btn-choice-subtle-shake');
    setTimeout(() => btn.classList.remove('btn-choice-subtle-shake'), 250);
  },

  // ── BATTLE / CUTSCENE / END ───────────────────────────────────────────────
  _startBattle(nodeId, node) {
    // Nastav flags ze story uzlu pokud existují
    if(node.flags?.set) {
      for(const f of node.flags.set) GameState.setFlag?.(f);
    }
    console.log('[StoryEngine] _startBattle → enemyId:', node.enemyId, '| onWin:', node.onWin, '| onLose:', node.onLose);

    const battleParams = {
      enemyId:     node.enemyId || node.enemy,
      background:  node.background || node.bgImage,
      music:       node.music,
      storyNodeId: nodeId,
      onWin:       node.onWin  || node.onVictory,
      onLose:      node.onLose || node.onDefeat,
      // Campaign battle flags
      tutorial:    !!node.tutorial,
      forcedLoss:  !!node.forcedLoss,
      isBoss:      !!node.isBoss,
      playerFirst: node.playerFirst,
    };

    // Před kampanjovým bojem nabídni úpravu decku
    const _goBattle = () => {
      Router._transitioning = false;
      Router.goto('battle', battleParams);
    };

    const _showDeckChoice = () => {
      this._container.innerHTML = `
        <div class="deck-choice-screen fade-in">
          <div class="deck-choice-inner">
            <div class="deck-choice-title">PŘIPRAVUJEŠ SE NA BOJ</div>
            <div class="deck-choice-sub">Chceš upravit deck před bitvou?</div>
            <div class="deck-choice-btns">
              <button class="vn-btn" id="deck-choice-edit">✦ Upravit deck</button>
              <button class="vn-btn vn-btn--fight" id="deck-choice-fight">⚔ Do boje</button>
            </div>
          </div>
        </div>`;
      this._addStyles();
      this._container.querySelector('#deck-choice-fight')?.addEventListener('click', () => {
        Router._transitioning = false;
        Router.goto('battle', battleParams);
      });
      this._container.querySelector('#deck-choice-edit')?.addEventListener('click', () => {
        // Otevři DeckBuilder, po návratu zpět sem
        Router._transitioning = false;
        Router.goto('deck', { returnTo: 'battle', returnParams: battleParams });
      });
    };

    // Tutoriál — rovnou do boje, žádný deck choice
    if(node.tutorial) {
      battleParams.playerFirst = true; // hráč začíná v tutoriálu
      if(Router._transitioning) {
        setTimeout(_goBattle, 350);
      } else {
        setTimeout(_goBattle, 50);
      }
      return;
    }

    if(Router._transitioning) {
      setTimeout(_showDeckChoice, 350);
    } else {
      setTimeout(_showDeckChoice, 50);
    }
  },

  _renderCutscene(nodeId, node) {
    // Nový formát: frames[] s textem a pauzami
    if(node.frames) {
      this._playFrames(node.frames, node.next, node.background);
      return;
    }
    // Starý formát: video/fallbackImage
    if(node.video || node.fallbackImage) {
      Router.goto('cutscene', {
        video:      node.video,
        image:      node.fallbackImage,
        next:       node.next,
        nextModule: 'story',
        nextParams: { nodeId: node.next },
      });
      return;
    }
    // Žádná media — přejdi rovnou dál
    if(node.next) this._goToNode(node.next);
  },

  // Cutscene jako textové snímky s pomlkami
  // nodeBackground: fallback bg pokud frame nemá vlastní image
  _playFrames(frames, nextNodeId, nodeBackground) {
    let idx = 0;
    const nodeBgStyle = nodeBackground ? this._bgStyle(nodeBackground) : '';
    const show = () => {
      if(idx >= frames.length) {
        if(this._params?._returnToMenu) { Router.goto('menu'); return; }
        // _setFlagOnReturn — nastav flag po dohraní cutsceny (v2017 mechanismus)
        if(this._params?._setFlagOnReturn) GameState.setFlag(this._params._setFlagOnReturn);
        if(nextNodeId) { this._goToNode(nextNodeId, true); return; }
        // Žádný next — zkontroluj jestli aktuální node je ending (isEnding: true)
        // Pokud ano, zobraz _renderEnd. Jinak jen menu.
        const curNode = this._currentNode;
        if(curNode?.isEnding || curNode?.endingId) {
          this._renderEnd(curNode);
        } else {
          Router.goto('menu');
        }
        return;
      }
      const f = frames[idx++];
      // Priorita: frame.image → frame.background → node.background
      const bgStyle = f.image
        ? `background-image:url('${f.image}')`
        : (f.background ? this._bgStyle(f.background) : nodeBgStyle);

      // Portrait ve scéně (pokud frame má speakera/portrait)
      const portraitKey = f.portrait || f.speaker;
      const portraitInfo = this._resolveSpeaker(portraitKey);
      const portraitSide = portraitInfo?.side || 'left';
      const portraitFile = portraitInfo?.portrait || portraitKey;
      const portraitHtml = (portraitKey && portraitFile)
        ? `<div class="vn-portrait vn-portrait--${portraitSide} vn-portrait--active"
             style="background-image:url('assets/images/portraits/${portraitFile}.png')"></div>`
        : '';

      this._container.innerHTML = `
        <div class="vn-screen fade-in" style="cursor:pointer">
          <div class="vn-bg" style="${bgStyle}">
            <div class="vn-bg-overlay"></div>
          </div>
          ${portraitHtml}
          <div class="vn-panel">
            <div class="vn-text">${f.text || ''}</div>
            <div class="vn-tap">▶ KLIKNI PRO POKRAČOVÁNÍ</div>
          </div>
        </div>`;
      this._addStyles();
      const advance = () => { clearTimeout(timer); show(); };
      const timer = f.pause ? setTimeout(advance, f.pause) : null;
      this._container.querySelector('.vn-screen')
        ?.addEventListener('click', advance, { once: true });
    };
    show();
  },

  // ── LOADING / ERROR ───────────────────────────────────────────────────────
  _renderLoading() {
    if(!this._container) return;
    this._container.innerHTML = `
      <div class="story-loading" style="display:flex;align-items:center;justify-content:center;height:100vh;background:#060a0f">
        <div class="loading-text" style="color:#3d4a5c;font-family:monospace;font-size:11px;letter-spacing:3px;animation:blink 1s infinite">NAČÍTÁM...</div>
      </div>
    `;
  },

  _renderError(msg) {
    this._container.innerHTML = `
      <div class="story-loading">
        <div style="color:var(--red);font-family:var(--font-px);font-size:8px;text-align:center;max-width:300px;line-height:2">${msg}</div>
        <button class="vn-btn" style="margin-top:24px" id="back-menu">← MENU</button>
      </div>
    `;
    this._container.querySelector('#back-menu')
      ?.addEventListener('click', () => Router.goto('menu'));
  },

  // ── TYPEWRITER ────────────────────────────────────────────────────────────
  _startTypewriter() {
    const el = this._container.querySelector('.typewriter-text');
    if(!el) return;

    clearInterval(this._typewriterTimer);
    const full = el.dataset.full || '';
    let i = 0;
    el.textContent = '';

    this._typewriterTimer = setInterval(() => {
      el.textContent += full[i++] ?? '';
      if(i >= full.length) {
        clearInterval(this._typewriterTimer);
        this._typewriterTimer = null;
      }
    }, 42);
  },

  // ── HELPERS ───────────────────────────────────────────────────────────────
  _alignLabel(val) {
    if(val >  60) return 'ORDER';
    if(val >  20) return '~order';
    if(val < -60) return 'CHAOS';
    if(val < -20) return '~chaos';
    return 'NEUTRAL';
  },

  _alignColor(val) {
    if(val >  20) return 'var(--synth)';
    if(val < -20) return 'var(--organic)';
    return 'var(--dim)';
  },

  // ── STYLY ─────────────────────────────────────────────────────────────────
  _addStyles() {
    if(document.getElementById('story-styles')) return;
    const style = document.createElement('style');
    style.id = 'story-styles';
    style.textContent = `
      /* ═══ CONFLUX STORY ENGINE v2030 — VN LAYOUT ═══ */
      :root {
        --vn-panel-h: clamp(200px, 32vh, 280px);
        --font-px:   'Press Start 2P', monospace;
        --font-vt:   'VT323', monospace;
        --font-mono: 'Share Tech Mono', monospace;
        --text:   #c8d6e5;
        --dim:    #1e2535;
        --muted:  #3d4a5c;
        --synth:  #4fa3e0;
        --organic:#e04f6a;
        --hybrid: #50e0b8;
        --gold:   #c8a84b;
        --bg:     #06080a;
        --border: #1a1e2a;
      }

      @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
      @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
      @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0.2} }
      @keyframes vnSlideUp { from{transform:translateY(20px);opacity:0} to{transform:none;opacity:1} }

      /* ── BASE SCREEN ── */
      .vn-screen {
        position: relative;
        width: 100%; height: 100%;
        display: flex; flex-direction: column;
        justify-content: flex-end;
        overflow: hidden;
        background: var(--bg);
      }
      .fade-in { animation: fadeIn 0.4s ease; }

      /* ── BACKGROUND ── */
      .vn-bg {
        position: absolute; inset: 0;
        background-size: cover;
        background-position: center top;
        background-color: #06080a;
        transition: background-image 0.6s ease;
      }
      .vn-bg-overlay {
        position: absolute; inset: 0;
        background: linear-gradient(
          to top,
          rgba(4,6,8,0.98)  0%,
          rgba(4,6,8,0.6)   45%,
          rgba(4,6,8,0.15)  100%
        );
      }

      /* ── PORTRAIT — malý sprite nad panelem, left/right side ── */
      .vn-portrait {
        position: absolute;
        bottom: var(--vn-panel-h);
        width: clamp(90px, 18vw, 160px);
        aspect-ratio: 2/3;
        background-size: cover;
        background-position: top center;
        background-repeat: no-repeat;
        z-index: 3;
        pointer-events: none;
        transition: opacity 0.3s ease, filter 0.3s ease;
        mask-image: linear-gradient(to top, transparent 0%, black 20%);
        -webkit-mask-image: linear-gradient(to top, transparent 0%, black 20%);
      }
      .vn-portrait--left {
        left: clamp(12px, 3vw, 48px);
        animation: vnPortraitInLeft 0.35s ease-out;
      }
      .vn-portrait--right {
        right: clamp(12px, 3vw, 48px);
        animation: vnPortraitInRight 0.35s ease-out;
      }
      .vn-portrait--inactive {
        opacity: 0.4;
        filter: grayscale(0.7) brightness(0.55);
      }
      .vn-portrait--active {
        opacity: 1;
      }
      @keyframes vnPortraitInLeft {
        from { opacity: 0; transform: translateX(-20px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes vnPortraitInRight {
        from { opacity: 0; transform: translateX(20px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      /* Legacy enemy class — ponecháno pro briefing kde je jen jeden portrét */
      .vn-portrait--enemy {
        left: auto;
        right: clamp(12px, 4vw, 48px);
      }

      /* ── BOTTOM PANEL ── */
      .vn-panel {
        position: relative; z-index: 4;
        width: 100%;
        height: var(--vn-panel-h);
        min-height: unset;
        background: rgba(4,6,8,0.94);
        border-top: 1px solid #1a2230;
        padding: 16px 28px 20px;
        display: flex; flex-direction: column; gap: 10px;
        animation: vnSlideUp 0.3s ease;
        box-sizing: border-box;
        overflow: hidden;
      }

      /* ── TEXT IN PANEL ── */
      .vn-text {
        font-family: var(--font-vt);
        font-size: 20px;
        color: var(--text);
        line-height: 1.65;
        max-width: 760px;
      }
      .vn-speaker {
        display: block;
        font-family: var(--font-px);
        font-size: 6px;
        color: var(--synth);
        letter-spacing: 2px;
        margin-bottom: 4px;
      }
      .vn-dialog-line { display: flex; flex-direction: column; gap: 2px; }
      .vn-dialog-line + .vn-dialog-line { margin-top: 8px; }

      /* ── CHOICES ── */
      .vn-choices {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 4px;
      }
      .vn-btn {
        background: transparent;
        border: 1px solid #1e2a38;
        font-family: var(--font-px);
        font-size: 7px;
        color: var(--muted);
        cursor: pointer;
        padding: 9px 16px;
        letter-spacing: 1px;
        transition: all 0.12s;
        white-space: nowrap;
      }
      .vn-btn:hover {
        border-color: var(--text);
        color: var(--text);
        background: rgba(200,214,229,0.04);
      }
      .vn-btn--fight {
        border-color: rgba(224,79,106,0.5);
        color: #e04f6a;
      }
      .vn-btn--fight:hover {
        background: rgba(224,79,106,0.1);
        border-color: #e04f6a;
      }
      .vn-btn-locked {
        opacity: 0.3; cursor: not-allowed;
      }
      /* Alignment-colored choice buttons */
      .vn-btn[data-align-side="order"]  { border-left: 2px solid rgba(79,163,224,0.5); }
      .vn-btn[data-align-side="chaos"]  { border-left: 2px solid rgba(224,79,106,0.5); }

      /* ── TAP HINT ── */
      .vn-tap {
        font-family: var(--font-px);
        font-size: 6px;
        color: var(--dim);
        letter-spacing: 2px;
        align-self: flex-end;
        animation: blink 1.4s ease infinite;
      }

      /* ── SETUP TEXT (before choices in choice nodes) ── */
      .vn-setup {
        border-left: 2px solid var(--border);
        padding-left: 12px;
        margin-bottom: 4px;
      }

      /* ── STAKES (briefing) ── */
      .vn-stakes {
        border-left: 2px solid;
        padding: 6px 10px;
        background: rgba(4,6,8,0.4);
      }
      .vn-stakes-label {
        font-family: var(--font-px);
        font-size: 6px;
        letter-spacing: 1px;
        margin-right: 8px;
      }
      .vn-stakes {
        font-family: var(--font-vt);
        font-size: 18px;
        color: #8a9aaa;
        line-height: 1.5;
      }

      /* ── ENEMY INFO OVERLAY (briefing) ── */
      .vn-enemy-info {
        position: absolute;
        top: 20px; left: 20px;
        z-index: 5;
        border: 1px solid;
        background: rgba(4,6,8,0.75);
        padding: 10px 14px;
        display: flex; flex-direction: column; gap: 4px;
        animation: fadeIn 0.4s ease;
      }
      .vn-enemy-name {
        font-family: var(--font-px);
        font-size: 7px;
        letter-spacing: 2px;
      }
      .vn-enemy-emoji { font-size: 28px; line-height: 1.2; }
      .vn-enemy-lp {
        font-family: var(--font-mono);
        font-size: 13px;
        color: var(--muted);
      }

      /* ── DECK CHOICE ── */
      .deck-choice-screen{display:flex;align-items:center;justify-content:center;height:100vh;background:#060a0f;}
      .deck-choice-inner{display:flex;flex-direction:column;align-items:center;gap:20px;padding:40px;}
      .deck-choice-title{font-family:var(--font-px,monospace);font-size:12px;color:#c8d6e5;letter-spacing:3px;}
      .deck-choice-sub{font-family:monospace;font-size:11px;color:#3d4a5c;letter-spacing:1px;}
      .deck-choice-btns{display:flex;gap:16px;margin-top:8px;}

      /* ── BRIEFING LAYOUT ── */
      .briefing-enemy-bar{position:relative;z-index:2;display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(6,10,15,0.92);border-bottom:1px solid;flex-shrink:0;}
      .briefing-enemy-emoji{font-size:22px;line-height:1;}
      .briefing-enemy-name{font-family:var(--font-px,monospace);font-size:11px;font-weight:700;flex:1;letter-spacing:1px;}
      .briefing-enemy-lp{font-family:monospace;font-size:10px;opacity:0.8;}
      .briefing-lines{position:relative;z-index:2;flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 120px);}
      .briefing-footer{position:relative;z-index:2;padding:12px 20px 20px;background:rgba(6,10,15,0.92);border-top:1px solid #1a2535;flex-shrink:0;display:flex;justify-content:center;}

      /* ── HUD ── */
      .vn-hud, .story-hud {
        position: absolute;
        top: 14px; right: 18px; z-index: 6;
        display: flex; gap: 16px; align-items: center;
        font-family: var(--font-px); font-size: 6px; color: var(--dim);
        letter-spacing: 1px;
      }

      /* ── TEXT INPUT ── */
      .vn-input-wrap {
        display: flex; gap: 8px; align-items: center;
        margin-top: 4px;
      }
      .vn-input {
        font-family: var(--font-px); font-size: 8px;
        background: transparent;
        border: none; border-bottom: 1px solid var(--muted);
        color: var(--text); padding: 6px 4px;
        outline: none; flex: 1; transition: border-color 0.15s;
      }
      .vn-input:focus { border-color: var(--text); }
      .vn-input::placeholder { color: var(--dim); }

      /* ── CARD REWARD ── */
      .vn-card-reward {
        position: absolute;
        bottom: calc(var(--vn-panel-h) + 16px);
        right: 20px; z-index: 5;
        display: flex; flex-direction: column; gap: 4px;
        padding: 10px 14px;
        border-left: 2px solid var(--gold);
        background: rgba(4,6,8,0.8);
        animation: fadeIn 0.5s ease;
      }
      .vn-reward-label {
        font-family: var(--font-px); font-size: 6px; color: var(--gold);
      }
      .vn-reward-name {
        font-family: var(--font-px); font-size: 8px; color: var(--text);
      }

      /* ── LOADING ── */
      .story-loading {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        height: 100%; gap: 20px;
        background: var(--bg);
      }
      .loading-text {
        font-family: var(--font-px); font-size: 8px; color: var(--dim);
        letter-spacing: 4px; animation: blink 1.2s step-end infinite;
      }

      /* ── END / PROFILE screens ── */
      .story-screen {
        position: relative; width: 100%; height: 100%;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        overflow: hidden; background: var(--bg);
      }
      .story-end {
        text-align: center; display: flex; flex-direction: column;
        align-items: center; gap: 20px;
      }
      .end-text {
        font-family: var(--font-px); font-size: 10px;
        color: var(--dim); letter-spacing: 4px;
        animation: fadeIn 1s ease forwards;
      }

      /* ── REWARD / ANCHOR / MAP nodes ── */
      .story-reward, .story-anchor, .story-map {
        position: relative; width: 100%; height: 100%;
        display: flex; flex-direction: column; justify-content: flex-end;
        background: var(--bg); overflow: hidden;
      }
      .story-reward .vn-panel,
      .story-anchor .vn-panel,
      .story-map .vn-panel {
        position: relative; z-index: 4;
      }

      /* ── CHECKPOINT TOAST ── */
      .vn-checkpoint-toast {
        position: fixed; bottom: calc(var(--vn-panel-h) + 20px);
        left: 50%; transform: translateX(-50%);
        font-family: var(--font-px); font-size: 7px;
        color: #50e0b8; background: rgba(4,6,8,0.95);
        border: 1px solid #1a3a2a; padding: 10px 20px;
        letter-spacing: 2px; text-align: center;
        opacity: 0; transition: opacity 0.4s ease;
        z-index: 100;
      }

      /* ── CHOICE — subtle shake pro locked volby ── */
      /* Žádná barva, žádný glitch, jen lehké chvění a mírný fade */
      @keyframes choice-subtle-shake {
        0%   { transform: translateX(0);    opacity: 1; }
        15%  { transform: translateX(-2px); opacity: 0.85; }
        30%  { transform: translateX(2px);  }
        45%  { transform: translateX(-1px); }
        60%  { transform: translateX(1px);  }
        100% { transform: translateX(0);    opacity: 1; }
      }
      .btn-choice-subtle-shake {
        animation: choice-subtle-shake 0.25s ease !important;
      }

      /* ── HUD alignment dot — jen barva, žádný text ── */
      .vn-align-dot {
        display: inline-block;
        width: 6px; height: 6px;
        border-radius: 50%;
        transition: background 0.6s ease;
        opacity: 0.8;
      }
`;
    document.head.appendChild(style);
  },

  // ── DESTROY ───────────────────────────────────────────────────────────────
  // ── CHECKPOINT TOAST ─────────────────────────────────────────────────────
  _showCheckpointToast(text) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'
      + "background:rgba(8,10,12,0.95);border:1px solid #1a3a2a;font-family:'Press Start 2P',monospace;"
      + 'font-size:7px;color:#50e0b8;padding:12px 20px;z-index:999;letter-spacing:2px;'
      + 'opacity:0;transition:opacity 0.4s ease;text-align:center;max-width:380px;line-height:1.8;'
      + 'box-shadow:0 0 20px rgba(80,224,184,0.15)';
    t.innerHTML = '◈ ULOŽENO<br><span style="color:#3d4a5c;font-size:6px">' + (text || '') + '</span>';
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 3000);
  },

  _showCardLostToast(reason) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);'
      + "background:rgba(8,10,12,0.95);border:1px solid #2a1a1a;font-family:'Press Start 2P',monospace;"
      + 'font-size:7px;color:#e04f6a;padding:12px 20px;z-index:999;letter-spacing:2px;'
      + 'opacity:0;transition:opacity 0.4s ease;text-align:center;max-width:320px;line-height:2';
    t.innerHTML = '◈ KARTA ZTRACENA<br><span style="color:#3d4a5c;font-size:6px">' + (reason || '') + '</span>';
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = '1'; });
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 4000);
  },

  // ── PROFILE NODE ──────────────────────────────────────────────────────────
  _renderProfile(nodeId, node) {
    const id = (GameState.buildIdentityProfile && GameState.buildIdentityProfile()) || {};
    const endColor = { architect:'#4fa3e0', roots:'#50e0b8', assimilation:'#c8a84b',
      flood:'#e04f6a', fragmentation:'#607080' }[id.endingType] || '#c8d6e5';

    const bar = (label, score) => {
      const w = Math.round(Math.min(100, Math.max(0, score || 50)));
      return '<div style="margin-bottom:1rem">'
        + '<div style="font-family:\'Press Start 2P\',monospace;font-size:6px;color:#3d4a5c;margin-bottom:4px;letter-spacing:1px">' + label + '</div>'
        + '<div style="display:flex;height:3px;width:100%;background:#0d1117">'
        + '<div style="width:' + w + '%;background:' + endColor + ';transition:width 1.5s ease"></div>'
        + '</div></div>';
    };

    this._container.innerHTML = '<div class="story-screen fade-in" style="align-items:center;justify-content:center;background:#080a0c">'
      + '<div style="max-width:600px;width:100%;padding:40px">'
      + '<p style="font-family:\'Press Start 2P\',monospace;font-size:6px;color:#1e2535;letter-spacing:3px;margin-bottom:2rem;text-align:center">ANALÝZA PRŮCHODU</p>'
      + '<div style="font-family:\'VT323\',monospace;font-size:20px;line-height:1.9;color:#607080;border-left:2px solid ' + endColor + ';padding:20px 24px;background:rgba(8,10,12,0.6);margin-bottom:2.5rem">'
      + (id.profileText || '...') + '</div>'
      + '<div style="margin-bottom:2rem">'
      + bar('PAMĚŤ / ZAPOMNĚNÍ', id.memoryScore)
      + bar('DŮVĚRA / IZOLACE', id.trustScore)
      + bar('KONTROLA / CHAOS', id.controlScore)
      + bar('PŘIJETÍ / ODPOR', id.acceptanceScore)
      + '</div>'
      + '<p style="font-family:\'Press Start 2P\',monospace;font-size:6px;color:#1e2535;text-align:center;letter-spacing:2px;margin-bottom:2rem">'
      + 'COURIER TYPE: <span style="color:' + endColor + '">' + ((id.endingType || 'unknown').toUpperCase()) + '</span></p>'
      + '<button id="btn-profile-continue" style="font-family:\'Press Start 2P\',monospace;font-size:8px;padding:12px 24px;background:transparent;border:2px solid ' + endColor + ';color:' + endColor + ';cursor:pointer;width:100%"> > POKRAČOVAT</button>'
      + '</div></div>';

    this._addStyles && this._addStyles();
    this._container.querySelector('#btn-profile-continue')
      ?.addEventListener('click', () => this._goToNode(node.next || 'w5_ending_choice'));
  },

  // ── END NODE ──────────────────────────────────────────────────────────────
  _renderEnd(node) {
    const id = (GameState.buildIdentityProfile && GameState.buildIdentityProfile()) || {};
    const endingType = id.endingType || 'fragmentation';
    const endColor = { architect:'#4fa3e0', roots:'#50e0b8', assimilation:'#c8a84b',
      flood:'#e04f6a', fragmentation:'#607080' }[endingType] || '#c8d6e5';

    const rawText = node.text || 'the dance continues';
    const lines   = rawText.split('\n');
    const title   = lines[0] || '';
    const body    = lines.slice(1).join('\n').trim();

    this._container.innerHTML = '<div class="story-screen fade-in" style="align-items:center;justify-content:center;background:#080a0c">'
      + '<div style="max-width:680px;width:100%;padding:40px;text-align:center">'
      + '<div style="font-family:\'Press Start 2P\',monospace;font-size:14px;color:' + endColor + ';letter-spacing:6px;'
      + 'text-shadow:0 0 30px ' + endColor + ';margin-bottom:2rem">' + title + '</div>'
      + '<div style="font-family:\'VT323\',monospace;font-size:18px;line-height:1.8;color:#607080;margin-bottom:2.5rem;white-space:pre-line">' + body + '</div>'
      + '<div style="font-family:\'VT323\',monospace;font-size:16px;line-height:1.9;color:#3d4a5c;font-style:italic;margin-bottom:2.5rem">' + (id.profileText || '') + '</div>'
      + '<button id="btn-end-menu" style="font-family:\'Press Start 2P\',monospace;font-size:8px;padding:12px 28px;background:transparent;border:2px solid ' + endColor + ';color:' + endColor + ';cursor:pointer;margin-top:1rem"> ← NOVÝ CYKLUS</button>'
      + '</div></div>';

    this._addStyles && this._addStyles();
    this._container.querySelector('#btn-end-menu')
      ?.addEventListener('click', () => {
        GameState.clearCheckpoint && GameState.clearCheckpoint();
        Router.goto('menu');
      });
  },

  // ── DIALOG (portrait + lines + optional text input) ──────────────────────
  // Panel má fixní výšku — řádky se prochází kliknutím (VN styl)
  _renderDialog(nodeId, node) {
    const lines    = node.lines || [];
    const hasInput = !!node.input;
    const resolveTpl = t => {
      const text = (t||'')
        .replace(/\{\{player\.name\}\}/g, GameState.player.name || 'Kurýr')
        .replace(/\{\{player\.faction\}\}/g, GameState.player.faction || '');
      return CorruptionVisuals.processDialogLine(text, '');
    };

    const bgStyle = this._bgStyle(node.background);
    // node.portrait určuje side přes speaker map; default left
    const portraitInfo = this._resolveSpeaker(node.portrait);
    const portraitSide = portraitInfo?.side || 'left';
    const portraitFile = portraitInfo?.portrait || node.portrait;
    const portraitStyle = node.portrait
      ? `background-image:url('assets/images/portraits/${portraitFile}.png')`
      : '';
    const portraitHtml = node.portrait
      ? `<div class="vn-portrait vn-portrait--${portraitSide} vn-portrait--active" style="${portraitStyle}"></div>`
      : '';

    // Pokud má node input → zobrazíme vše najednou (name input apod.)
    if(hasInput) {
      const allHtml = lines.map(l => `
        <div class="vn-dialog-line">
          ${l.speaker ? `<span class="vn-speaker">${l.speaker.toUpperCase()}</span>` : ''}
          <span class="vn-text">${resolveTpl(l.text)}</span>
        </div>`).join('');
      this._container.innerHTML = `
        <div class="vn-screen fade-in">
          <div class="vn-bg" style="${bgStyle}"><div class="vn-bg-overlay"></div></div>
          ${portraitHtml}
          <div class="vn-panel">
            ${allHtml}
            <div class="vn-input-wrap">
              <input type="text" id="dialog-input" class="vn-input"
                placeholder="${node.input.placeholder || ''}"
                maxlength="${node.input.maxLength || 40}"
                value="${node.input.default || ''}">
              <button class="vn-btn" id="dialog-confirm">▶ POTVRDIT</button>
            </div>
          </div>
        </div>`;
      this._addStyles();
      const inp = this._container.querySelector('#dialog-input');
      const btn = this._container.querySelector('#dialog-confirm');
      const confirm = () => {
        const val = (inp?.value || node.input.default || 'Kurýr').trim();
        const key = node.input.storeAs || '';
        if(key === 'player.name') GameState.player.name = val;
        if(node.next) this._goToNode(node.next);
      };
      btn?.addEventListener('click', confirm);
      inp?.addEventListener('keydown', e => { if(e.key === 'Enter') confirm(); });
      inp?.focus();
      return;
    }

    // ── VN LINE-BY-LINE: jeden řádek najednou, klik = další ──
    const effective = lines.length > 0 ? lines : [{ speaker: node.speaker || '', text: node.text || '' }];
    let idx = 0;

    // Portrait slot state — udržujeme kdo je aktuálně zobrazen na left/right
    // aby se portrait animoval jen když se změní speaker
    const slotState = { left: null, right: null };

    // Update portrait slots podle aktuálního speakera
    const updatePortraits = (speakerKey) => {
      const info = this._resolveSpeaker(speakerKey);
      const leftSlot  = this._container.querySelector('.vn-portrait-slot[data-side="left"]');
      const rightSlot = this._container.querySelector('.vn-portrait-slot[data-side="right"]');

      // Pokud speaker nemá portrait (system, bezejmenný) — jen dim oba sloty
      if(!info) {
        leftSlot?.classList.add('vn-portrait--inactive');
        leftSlot?.classList.remove('vn-portrait--active');
        rightSlot?.classList.add('vn-portrait--inactive');
        rightSlot?.classList.remove('vn-portrait--active');
        return;
      }

      const targetSide = info.side;
      const targetSlot = targetSide === 'left' ? leftSlot : rightSlot;
      const otherSlot  = targetSide === 'left' ? rightSlot : leftSlot;

      // Pokud je v target slotu jiná postava — swap (nebo první render)
      if(slotState[targetSide] !== info.portrait) {
        if(targetSlot) {
          targetSlot.style.backgroundImage = `url('assets/images/portraits/${info.portrait}.png')`;
          targetSlot.style.display = 'block';
          // Trigger re-animation: remove + force reflow + add class
          targetSlot.classList.remove('vn-portrait--left', 'vn-portrait--right');
          void targetSlot.offsetWidth;
          targetSlot.classList.add(`vn-portrait--${targetSide}`);
        }
        slotState[targetSide] = info.portrait;
      }

      // Aktivní/inactive stavy
      targetSlot?.classList.add('vn-portrait--active');
      targetSlot?.classList.remove('vn-portrait--inactive');
      if(otherSlot && slotState[targetSide === 'left' ? 'right' : 'left']) {
        // druhá postava už v scéně — ponech ji dim
        otherSlot.classList.add('vn-portrait--inactive');
        otherSlot.classList.remove('vn-portrait--active');
      }
    };

    const renderLine = () => {
      const l     = effective[idx];
      const speaker = l.speaker || '';
      const text    = resolveTpl(l.text || '');
      const panel = this._container.querySelector('.vn-panel');
      if(panel) {
        panel.innerHTML = `
          <div class="vn-dialog-line vn-line-active">
            ${speaker ? `<span class="vn-speaker">${speaker.toUpperCase()}</span>` : ''}
            <span class="vn-text typewriter-text" data-full="${text.replace(/"/g,'&quot;')}"></span>
          </div>`;
        // Update portréty ve scéně podle aktuálního speakera
        updatePortraits(speaker);
        // Spusť typewriter pro tento řádek
        this._startTypewriter();
      }
    };

    // Minimální dwell před možností skipnout — zabrání okamžitému "proklikávání"
    const MIN_DWELL_MS = 600;
    let dwellStart = Date.now();

    const advance = () => {
      // Respektuj minimální dwell
      if(Date.now() - dwellStart < MIN_DWELL_MS) return;

      // Pokud typewriter stále píše — skip na konec
      if(this._typewriterTimer) {
        clearInterval(this._typewriterTimer);
        this._typewriterTimer = null;
        const el = this._container.querySelector('.typewriter-text');
        if(el) el.textContent = el.dataset.full || '';
        return;
      }
      if(idx < effective.length - 1) {
        idx++;
        dwellStart = Date.now();
        renderLine();
      } else {
        if(node.next) this._goToNode(node.next);
      }
    };

    // Prvotní vykreslení celé obrazovky — panel prázdný + dva portrait sloty (skryté)
    // Fallback: pokud node má explicitní node.portrait ale speakeři nemají mapping,
    // použijeme jako default left side
    const fallbackPortrait = node.portrait
      ? `background-image:url('assets/images/portraits/${node.portrait}.png')`
      : '';
    this._container.innerHTML = `
      <div class="vn-screen fade-in" style="cursor:pointer">
        <div class="vn-bg" style="${bgStyle}"><div class="vn-bg-overlay"></div></div>
        <div class="vn-portrait vn-portrait-slot" data-side="left" style="display:none"></div>
        <div class="vn-portrait vn-portrait-slot" data-side="right" style="display:none"></div>
        <div class="vn-panel"></div>
      </div>`;

    this._addStyles();

    // Klik kdekoliv na obrazovku = advance (skip typewriter nebo další řádek)
    const dlgScreen = this._container.querySelector('.vn-screen');
    const bindClick = () => {
      dlgScreen?.addEventListener('click', () => {
        advance();
        // Vždy znovu nabinduj — advance() sám zajistí přechod na next když jsme na konci
        setTimeout(bindClick, 50);
      }, { once: true });
    };
    if(dlgScreen) { dlgScreen.style.cursor = 'pointer'; bindClick(); }
    renderLine(); // Spusť typewriter pro první řádek
  },

  // ── CHOICE (fork s volbami) ──────────────────────────────────────────────
  _renderChoice2(nodeId, node) {
    const resolveTpl = t => (t||'')
      .replace(/\{\{player\.name\}\}/g, GameState.player.name || 'Kurýr');
    const setup     = node.setup || [];
    const choices   = node.choices || [];
    const portrait  = node.portrait || '';
    const bgStyle   = this._bgStyle(node.background);
    // Určit side podle speaker mappingu; default left když není známý
    const portraitInfo = this._resolveSpeaker(portrait);
    const portraitSide = portraitInfo?.side || 'left';
    const portraitFile = portraitInfo?.portrait || portrait;
    const portraitStyle = portrait
      ? `background-image:url('assets/images/portraits/${portraitFile}.png')` : '';
    const portraitHtml = portrait
      ? `<div class="vn-portrait vn-portrait--${portraitSide} vn-portrait--active" style="${portraitStyle}"></div>`
      : '';

    const corrLevel = GameState.corruption?.level || 0;
    const choicesHtml = choices
      .filter(c => !c.requireCorruption || corrLevel >= c.requireCorruption)
      .filter(c => !c.requireFlag || GameState.getFlag(c.requireFlag))
      .map((c, i) => this._renderChoice(c, i)).join('');

    // Pokud má setup (dialog před volbami) — projdi je line-by-line, pak ukaž volby
    if(setup.length > 0) {
      let idx = 0;

      const showChoices = () => {
        const panel = this._container.querySelector('.vn-panel');
        if(panel) {
          panel.innerHTML = `<div class="vn-choices">${choicesHtml}</div>`;
          this._bindChoices(choices);
        }
      };

      const renderSetupLine = () => {
        const l      = setup[idx];
        const isLast = idx === setup.length - 1;
        const panel  = this._container.querySelector('.vn-panel');
        if(!panel) return;
        panel.innerHTML = `
          <div class="vn-dialog-line vn-line-active">
            ${l.speaker ? `<span class="vn-speaker">${l.speaker.toUpperCase()}</span>` : ''}
            <span class="vn-text">${resolveTpl(l.text)}</span>
          </div>
          <div class="vn-choices">
            <button class="vn-btn" id="vn-setup-next">${isLast ? '▶ VOLBA' : '▶'}</button>
          </div>`;
        panel.querySelector('#vn-setup-next')?.addEventListener('click', () => {
          if(idx < setup.length - 1) { idx++; renderSetupLine(); }
          else showChoices();
        });
      };

      this._container.innerHTML = `
        <div class="vn-screen fade-in">
          <div class="vn-bg" style="${bgStyle}"><div class="vn-bg-overlay"></div></div>
          ${portraitHtml}
          <div class="vn-panel"></div>
        </div>`;
      this._addStyles();
      renderSetupLine();
    } else {
      // Žádný setup — rovnou volby
      this._container.innerHTML = `
        <div class="vn-screen fade-in">
          <div class="vn-bg" style="${bgStyle}"><div class="vn-bg-overlay"></div></div>
          ${portraitHtml}
          <div class="vn-panel">
            <div class="vn-choices">${choicesHtml}</div>
          </div>
        </div>`;
      this._addStyles();
      this._bindChoices(choices);
    }
  },


  // ── ANCHOR (krátký narativní text, auto-continue) ────────────────────────
  // ── BRIEFING — VN layout: pozadí + enemy info + panel dole ───────────────
  _renderBriefing(nodeId, node) {
    // Briefing = dialog co plynule přejde do boje.
    // Žádný speciální screen — jen dialog lines, pak rovnou battle.
    // Převedeme na dialog formát a renderujeme _renderDialog.
    const dialogNode = {
      ...node,
      type: 'dialog',
      // Portrait: použij první speaker z lines, nebo node.portrait
      portrait: node.portrait || (node.lines?.[0]?.speaker || null),
    };
    // Renderuj jako normální dialog — po posledním kliku přejde na next (battle)
    this._renderDialog(nodeId, dialogNode);
  },


  _renderAnchor(nodeId, node) {
    // Anchor = automatický checkpoint + větvení dle flagů
    GameState.saveCheckpoint(nodeId, GameState.campaign.nodeNumber || 0, node.narrativeText || '');

    // autoSetEndingFlag — nastav doporučený ending podle alignment/corruption pokud není nastaven
    if(node.autoSetEndingFlag) {
      const alignment  = GameState.player?.alignment || 0;
      const corrLevel  = GameState.corruption?.level || 0;
      const hasFlag    = ['chosen_synth_end','chosen_organic_end','chosen_hybrid_end',
                          'chosen_observer_end','chosen_monyra_end']
                          .some(f => GameState.getFlag(f));
      if(!hasFlag) {
        // Corruption má přednost pokud je vysoká
        if(corrLevel >= 70) {
          GameState.setFlag?.('chosen_corruption_end');
        } else if(alignment > 40) {
          GameState.setFlag?.('chosen_synth_end');
        } else if(alignment < -40) {
          GameState.setFlag?.('chosen_organic_end');
        } else {
          GameState.setFlag?.('chosen_observer_end');
        }
        console.log('[StoryEngine] autoSetEndingFlag: alignment='+alignment+' corr='+corrLevel);
      }
    }
    // Přepni hudbu pokud uzel specifikuje music
    if(node.music) {
      try { AudioSystem?.crossfade?.(null, node.music, 1500); } catch(e) {}
    }

    // branchOn — podmíněné větvení (první splněná podmínka vyhraje)
    const _resolveBranch = () => {
      if(node.branchOn) {
        const corrLevel  = GameState.corruption?.level || 0;
        const alignment  = GameState.player?.alignment || 0;
        for(const b of node.branchOn) {
          if(b.default) { if(b.next) return b.next; continue; }
          const cond = b.condition || {};
          const ok = (!cond.flagSet       || GameState.getFlag(cond.flagSet))
                  && (!cond.flagNotSet    || !GameState.getFlag(cond.flagNotSet))
                  && (cond.corruptionMin  === undefined || corrLevel >= cond.corruptionMin)
                  && (cond.corruptionMax  === undefined || corrLevel <= cond.corruptionMax)
                  && (cond.alignmentMin   === undefined || alignment >= cond.alignmentMin)
                  && (cond.alignmentMax   === undefined || alignment <= cond.alignmentMax);
          if(ok && b.next) return b.next;
        }
        // Pokud nic nesedí, hledej default
        const def = node.branchOn.find(b => b.default);
        if(def?.next) return def.next;
      }
      return node.next || null;
    };

    // Auto-continue — bez UI, rovnou přejdeme na next
    const nextId = _resolveBranch();
    if(nextId) { this._goToNode(nextId, true); return; }

    // Žádný next (konec větve) — ticho
  },

  // ── MAP (výběr cesty, zobrazí dostupné paths) ─────────────────────────────
  _renderMap(nodeId, node) {
    const paths = node.availablePaths || [];
    // Pokud je jen jedna cesta nebo next je definováno, přejdi přímo
    if(paths.length <= 1) {
      const nextId = paths[0]?.nodeId || node.next;
      if(nextId) { this._goToNode(nextId, true); return; }
    }
    const pathsHtml = paths.map(p => `
      <button class="vn-btn" data-node="${p.nodeId}">
        ${p.icon ? `<span style="margin-right:8px">${p.icon}</span>` : ''}${p.label || p.nodeId}
      </button>`).join('');

    this._container.innerHTML = `
      <div class="story-screen fade-in">
        <div class="vn-bg" style="${this._bgStyle(node.background)}">
          <div class="vn-bg-overlay"></div>
        </div>
        <div class="story-content">
          <div class="vn-text-box">
            <p class="story-text" style="font-size:9px;letter-spacing:2px">VYBER CESTU</p>
          </div>
          <div class="vn-choices">${pathsHtml}</div>
        </div>
      </div>`;
    this._addStyles();
    this._container.querySelectorAll('.btn-choice').forEach(btn => {
      btn.addEventListener('click', () => { this._goToNode(btn.dataset.node); });
    });
  },

  // ── REWARD (karta za akt) ─────────────────────────────────────────────────
  _renderReward(nodeId, node) {
    if(node.cardId !== undefined && !GameState.player.collection.includes(node.cardId)) {
      GameState.player.collection.push(node.cardId);
      EventBus.emit('story:cardReceived', { cardId: node.cardId });
    }
    // Najdi info o kartě z GameState (cards.json)
    const card = GameState.getCard(node.cardId);
    const cardHtml = card ? `
      <div style="font-size:clamp(36px,6vw,52px);margin:12px 0">${card.emoji || '?'}</div>
      <div style="font-family:var(--font-px);font-size:8px;color:var(--text);letter-spacing:1px">${card.name}</div>
      <div style="font-family:var(--font-px);font-size:6px;color:#4a5a6a;letter-spacing:2px;margin-top:4px">${card.faction?.toUpperCase() || ''}</div>
      ${card.atk !== undefined ? `<div style="font-family:var(--font-mono);font-size:14px;color:#607080;margin-top:6px">⚔ ${card.atk}  🛡 ${card.def}</div>` : ''}
    ` : '';
    this._container.innerHTML = `
      <div class="story-screen fade-in" style="align-items:center;justify-content:center">
        <div class="story-content" style="text-align:center">
          <div style="font-family:var(--font-px);font-size:7px;color:#c8a84b;letter-spacing:3px;margin-bottom:16px">▶ KARTA ZÍSKÁNA</div>
          ${cardHtml}
          <div style="font-family:var(--font-vt);font-size:18px;color:#607080;margin:16px 8px;line-height:1.6">${node.message || ''}</div>
          <button class="vn-btn" id="reward-next" style="margin-top:16px">▶ POKRAČOVAT</button>
        </div>
      </div>`;
    this._addStyles();
    this._container.querySelector('#reward-next')
      ?.addEventListener('click', () => { if(node.next) this._goToNode(node.next, true); });
  },

  destroy() {
    clearInterval(this._typewriterTimer);
    this._typewriterTimer = null;
    this._unsubscribers.forEach(fn => fn());
    this._unsubscribers = [];
  }
};

export default StoryEngine;
