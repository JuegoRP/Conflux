import Router     from '../engine/Router.js';
import GameState  from '../engine/GameState.js';
import { ENEMIES_DATA } from '../data/enemies.js';

/**
 * FreeBattle v2 — CONFLUX
 * Vizuálně přepracovaný: akty jako karty, sjednocený styl, self-battle speciální.
 */

const BATTLE_MAP = [
  {num:1,title:'Kurýr',subtitle:'Začátek trasy',faction:'synth',battles:[
    {enemyId:'monyra_tutorial',name:'Monyra — Tutoriál',boss:false,emoji:'🗣'},
    {enemyId:'act1_01',name:'Hlídkový systém',boss:false,emoji:'🤖'},
    {enemyId:'act1_02',name:'Správce zóny Kellner',boss:false,emoji:'🕴'},
    {enemyId:'act1_04',name:'Síťový operátor',boss:false,emoji:'📡'},
    {enemyId:'act1_03',name:'Lesní stráž — Trojice',boss:false,emoji:'🌿'},
    {enemyId:'act1_boss',name:'Vykonavatel',boss:true,emoji:'⚙'},
  ]},
  {num:2,title:'Strana',subtitle:'Za hranicí',faction:'hybrid',battles:[
    {enemyId:'act2_01',name:'Pohraničník Řeka',boss:false,emoji:'🚧'},
    {enemyId:'act2_02',name:'Lesní rada — Staří',boss:false,emoji:'🌳'},
    {enemyId:'act2_03',name:'Agent Vaněk',boss:false,emoji:'🕵'},
    {enemyId:'act2_04',name:'Marta',boss:false,emoji:'🛡'},
    {enemyId:'act2_boss',name:'Tichý',boss:true,emoji:'🤫'},
  ]},
  {num:3,title:'Most',subtitle:'Hybrid Nexus',faction:'hybrid',battles:[
    {enemyId:'act3_01',name:'Přechodný strážce',boss:false,emoji:'⚖'},
    {enemyId:'act3_02',name:'Fúzní duelista Hana',boss:false,emoji:'✨'},
    {enemyId:'act3_boss',name:'Duelista',boss:true,emoji:'🎭'},
  ]},
  {num:4,title:'Dluh',subtitle:'Syndikát',faction:'synth',battles:[
    {enemyId:'act4_01',name:'Testovač',boss:false,emoji:'🔪'},
    {enemyId:'act4_marta',name:'Marta',boss:false,emoji:'🛡'},
    {enemyId:'act4_02',name:'Vymahač I',boss:false,emoji:'⚖'},
    {enemyId:'act4_03',name:'Vymahač II',boss:false,emoji:'⚖'},
    {enemyId:'act4_veritel',name:'Věřitel',boss:true,emoji:'💼'},
  ]},
  {num:5,title:'Dopis',subtitle:'Eli',faction:'corruption',battles:[
    {enemyId:'act5_eli',name:'Eli',boss:true,emoji:'👁'},
  ]},
  {num:6,title:'Paměť',subtitle:'Voit',faction:'synth',battles:[
    {enemyId:'act6_01',name:'Systémový agent — Ticho',boss:false,emoji:'🔇'},
  ]},
  {num:7,title:'Přepis',subtitle:'Centrum',faction:'synth',battles:[
    {enemyId:'act7_01',name:'Rekalibrační agent',boss:false,emoji:'⚙'},
    {enemyId:'act7_boss',name:'Správce přepisu',boss:true,emoji:'⬛'},
  ]},
  {num:8,title:'Návrat',subtitle:'Věřitel se vrací',faction:'hybrid',battles:[
    {enemyId:'act8_veritel',name:'Věřitel — II',boss:true,emoji:'💳'},
  ]},
  {num:9,title:'Pozorovatel',subtitle:'Přechod',faction:'corruption',battles:[
    {enemyId:'act9_pozorovatel',name:'Pozorovatel přechodu',boss:true,emoji:'🜂'},
  ]},
  {num:10,title:'Konvergence',subtitle:'Finále',faction:'corruption',battles:[
    {enemyId:'act10_sigma',name:'Sigma',boss:true,emoji:'Σ'},
    {enemyId:'act10_pramati',name:'Pramáti',boss:true,emoji:'🌿'},
    {enemyId:'act10_paradox',name:'Paradox pozorovatele',boss:true,emoji:'◈'},
    {enemyId:'act10_protokol_core',name:'Přepisovací jádro',boss:true,emoji:'⬛'},
  ]},
];

const FC = {synth:'#4fa3e0',organic:'#e04f6a',hybrid:'#50e0b8',corruption:'#9b59b6',neutral:'#607080'};

const FreeBattle = {
  _container: null,
  _openAct: null,

  init(container) {
    this._container = container;
    this._openAct = null;
    this._injectStyles();
    this._render();
  },
  destroy() { this._container = null; },

  _fbRecord(eid) {
    try { return JSON.parse(localStorage.getItem('conflux_fb_' + eid) || '{"w":0,"l":0}'); }
    catch { return {w:0,l:0}; }
  },
  _isEncountered(eid) {
    const f = GameState.campaign?.flags || {};
    if(f['encountered_'+eid]||f['beaten_'+eid]||f['unlocked_enemy_'+eid]) return true;
    const r = this._fbRecord(eid);
    return r.w > 0 || r.l > 0;
  },
  _isActVisible(n) {
    const ch = GameState.campaign?.actNumber || GameState.campaign?.chapter || 0;
    return n === 1 || n <= (ch + 1);
  },

  _render() {
    const c = this._container;
    if(!c) return;

    let tW=0, tL=0;
    BATTLE_MAP.flatMap(a=>a.battles.map(b=>b.enemyId)).forEach(eid=>{const r=this._fbRecord(eid);tW+=r.w;tL+=r.l;});
    const sr=this._fbRecord('__self__'); tW+=sr.w; tL+=sr.l;

    c.innerHTML = `
      <div class="fb-screen">
        <div class="fb-bg"></div>
        <div class="fb-content">
          <div class="fb-header">
            <button class="fb-back" id="fb-back">←</button>
            <div class="fb-title">VOLNÝ SOUBOJ</div>
            <div class="fb-stats-bar">
              <span class="fb-w">${tW}W</span>
              <span class="fb-sep">·</span>
              <span class="fb-l">${tL}L</span>
            </div>
          </div>

          <div class="fb-list" id="fb-list">
            <!-- SELF BATTLE — speciální karta -->
            <div class="fb-self-card" id="fb-self">
              <div class="fb-self-icon">🪞</div>
              <div class="fb-self-info">
                <div class="fb-self-title">POZOROVATEL</div>
                <div class="fb-self-desc">Tvůj deck proti tvému decku</div>
              </div>
              <div class="fb-self-score">${sr.w+sr.l > 0 ? `<span class="fb-w">${sr.w}W</span> <span class="fb-l">${sr.l}L</span>` : 'NOVÝ'}</div>
            </div>

            <!-- AKTY -->
            <div class="fb-acts">
              ${BATTLE_MAP.map(a => this._renderAct(a)).join('')}
            </div>
          </div>
        </div>
      </div>`;
    this._bind();
  },

  _renderAct(act) {
    const vis = this._isActVisible(act.num);
    const open = this._openAct === act.num;
    const enc = act.battles.filter(b=>this._isEncountered(b.enemyId)).length;
    const fc = FC[act.faction] || FC.neutral;
    const actW = act.battles.reduce((s,b)=>s+this._fbRecord(b.enemyId).w,0);
    const actL = act.battles.reduce((s,b)=>s+this._fbRecord(b.enemyId).l,0);

    return `
      <div class="fb-act ${vis?'':'fb-act-locked'} ${open?'fb-act-open':''}">
        <button class="fb-act-head" data-act="${act.num}" ${vis?'':'disabled'} style="--afc:${fc}">
          <div class="fb-act-num" style="color:${fc}">AKT ${act.num}</div>
          <div class="fb-act-titles">
            <span class="fb-act-title">${act.title}</span>
            <span class="fb-act-sub">${act.subtitle}</span>
          </div>
          <div class="fb-act-meta">
            ${vis ? `<span class="fb-act-prog">${enc}/${act.battles.length}</span>` : '<span class="fb-act-lock">🔒</span>'}
            ${actW+actL > 0 ? `<span class="fb-act-score"><span class="fb-w">${actW}W</span><span class="fb-l">${actL}L</span></span>` : ''}
          </div>
          <span class="fb-act-arrow">${open ? '▾' : '▸'}</span>
        </button>
        ${open && vis ? `<div class="fb-act-body">
          ${act.battles.map(b=>this._renderEnemy(b,act.faction)).join('')}
        </div>` : ''}
      </div>`;
  },

  _renderEnemy(b, actFaction) {
    const enc = this._isEncountered(b.enemyId);
    const name = enc ? b.name : '???';
    const ed = (ENEMIES_DATA?.enemies||[]).find(e=>e.id===b.enemyId);
    const fc = FC[ed?.faction || actFaction] || FC.neutral;
    const rec = this._fbRecord(b.enemyId);

    return `<button class="fb-enemy ${enc?'':'fb-enemy-locked'} ${b.boss?'fb-enemy-boss':''}"
      data-enemy="${b.enemyId}" ${enc?'':'disabled'} style="--efc:${fc}">
      <span class="fb-enemy-emoji">${enc ? (b.emoji||'·') : '?'}</span>
      <div class="fb-enemy-info">
        <span class="fb-enemy-name">${name}</span>
        ${b.boss ? '<span class="fb-enemy-tag">BOSS</span>' : ''}
      </div>
      ${enc ? (rec.w+rec.l > 0
        ? `<span class="fb-enemy-score"><span class="fb-w">${rec.w}W</span><span class="fb-l">${rec.l}L</span></span>`
        : '<span class="fb-enemy-new">NOVÝ</span>'
      ) : '<span class="fb-enemy-lock">🔒</span>'}
    </button>`;
  },

  _bind() {
    const c = this._container;
    c.querySelector('#fb-back')?.addEventListener('click', ()=>Router.goto('menu'));
    c.querySelector('#fb-self')?.addEventListener('click', ()=>{
      Router.goto('battle', {enemyId:'__self__',mode:'free',selfBattle:true});
    });
    c.querySelectorAll('.fb-act-head').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const n = parseInt(btn.dataset.act);
        this._openAct = this._openAct===n ? null : n;
        this._render();
      });
    });
    c.querySelectorAll('.fb-enemy:not(:disabled)').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        Router.goto('battle', {enemyId:btn.dataset.enemy, mode:'free'});
      });
    });
  },

  _injectStyles() {
    if(document.getElementById('freebattle-styles')) return;
    const s = document.createElement('style');
    s.id = 'freebattle-styles';
    s.textContent = `
      .fb-screen{width:100%;height:100vh;display:flex;flex-direction:column;position:relative;overflow:hidden;background:#040608;}
      .fb-bg{position:absolute;inset:0;background:url('assets/images/backgrounds/freebattle_bg.png') center/cover no-repeat;opacity:0.1;pointer-events:none;z-index:0;}
      .fb-content{position:relative;z-index:1;display:flex;flex-direction:column;height:100%;overflow:hidden;}

      /* Header */
      .fb-header{flex-shrink:0;padding:20px 24px 14px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;align-items:center;gap:6px;}
      .fb-back{position:absolute;top:16px;left:14px;background:none;border:none;color:#607080;font-size:22px;cursor:pointer;padding:4px 8px;z-index:5;}
      .fb-back:hover{color:#c8d6e5;}
      .fb-title{font-family:'Press Start 2P',monospace;font-size:12px;letter-spacing:6px;color:#c8d6e5;}
      .fb-stats-bar{display:flex;gap:10px;font-family:'Share Tech Mono',monospace;font-size:12px;}
      .fb-w{color:#50e0b8;}.fb-l{color:#e04f6a;}.fb-sep{color:#1a2535;}

      /* List */
      .fb-list{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;}

      /* Self battle card */
      .fb-self-card{
        display:flex;align-items:center;gap:16px;
        padding:16px 20px;cursor:pointer;
        background:linear-gradient(135deg,rgba(80,224,184,0.08) 0%,rgba(80,224,184,0.02) 100%);
        border:1px solid rgba(80,224,184,0.2);border-radius:6px;
        transition:all 0.2s;
      }
      .fb-self-card:hover{border-color:rgba(80,224,184,0.5);transform:translateY(-1px);box-shadow:0 4px 16px rgba(80,224,184,0.1);}
      .fb-self-icon{font-size:28px;filter:drop-shadow(0 2px 6px rgba(80,224,184,0.4));}
      .fb-self-info{flex:1;}
      .fb-self-title{font-family:'Press Start 2P',monospace;font-size:9px;color:#50e0b8;letter-spacing:3px;}
      .fb-self-desc{font-family:'Share Tech Mono',monospace;font-size:11px;color:#4a6a5a;margin-top:3px;}
      .fb-self-score{font-family:'Share Tech Mono',monospace;font-size:11px;display:flex;gap:8px;}

      /* Acts container */
      .fb-acts{display:flex;flex-direction:column;gap:4px;}

      /* Act header */
      .fb-act{border-radius:4px;overflow:hidden;}
      .fb-act-head{
        display:flex;align-items:center;gap:12px;width:100%;
        padding:12px 16px;cursor:pointer;text-align:left;
        background:rgba(8,12,20,0.85);
        border:1px solid rgba(255,255,255,0.04);border-left:3px solid var(--afc,#607080);
        transition:all 0.15s;
      }
      .fb-act-head:hover:not(:disabled){background:rgba(14,20,32,0.95);border-left-width:5px;}
      .fb-act-head:disabled{cursor:default;opacity:0.3;}
      .fb-act-num{font-family:'Press Start 2P',monospace;font-size:7px;letter-spacing:1px;flex-shrink:0;min-width:50px;}
      .fb-act-titles{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;}
      .fb-act-title{font-family:'Share Tech Mono',monospace;font-size:13px;color:#c8d6e5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .fb-act-sub{font-family:'Share Tech Mono',monospace;font-size:10px;color:#4a5a6a;}
      .fb-act-meta{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;}
      .fb-act-prog{font-family:'Share Tech Mono',monospace;font-size:10px;color:#607080;}
      .fb-act-lock{font-size:12px;color:#2a3545;}
      .fb-act-score{font-family:'Share Tech Mono',monospace;font-size:9px;display:flex;gap:6px;}
      .fb-act-arrow{font-size:10px;color:#4a5a6a;flex-shrink:0;margin-left:4px;}
      .fb-act-locked .fb-act-num{color:#2a3545!important;}

      /* Act body (expanded enemies) */
      .fb-act-body{
        display:flex;flex-direction:column;gap:2px;
        padding:4px 4px 8px 24px;
        animation:fb-expand 0.2s ease;
      }
      @keyframes fb-expand{from{opacity:0;max-height:0}to{opacity:1;max-height:500px}}

      /* Enemy row */
      .fb-enemy{
        display:flex;align-items:center;gap:10px;width:100%;
        padding:10px 14px;cursor:pointer;text-align:left;
        background:rgba(6,10,16,0.7);
        border:1px solid rgba(255,255,255,0.04);border-left:2px solid var(--efc,#607080);
        border-radius:3px;transition:all 0.15s;
      }
      .fb-enemy:hover:not(:disabled){background:rgba(12,18,28,0.9);border-left-color:var(--efc);transform:translateX(2px);}
      .fb-enemy:disabled{cursor:default;opacity:0.35;}
      .fb-enemy-locked{border-left-color:rgba(255,255,255,0.05)!important;}
      .fb-enemy-boss{border-left-width:3px;}
      .fb-enemy-boss .fb-enemy-name{color:#e0c060;}

      .fb-enemy-emoji{font-size:18px;flex-shrink:0;width:24px;text-align:center;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6));}
      .fb-enemy-info{flex:1;display:flex;align-items:center;gap:8px;min-width:0;}
      .fb-enemy-name{
        font-family:'Press Start 2P',monospace;font-size:7px;letter-spacing:0.5px;
        color:#c8d6e5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      }
      .fb-enemy-tag{
        font-family:'Press Start 2P',monospace;font-size:5px;letter-spacing:1px;
        color:#e0c060;background:rgba(224,192,96,0.1);padding:2px 5px;border-radius:2px;
        flex-shrink:0;
      }
      .fb-enemy-lock{color:#2a3545;font-size:11px;flex-shrink:0;}
      .fb-enemy-score{font-family:'Share Tech Mono',monospace;font-size:10px;display:flex;gap:6px;flex-shrink:0;}
      .fb-enemy-new{font-family:'Press Start 2P',monospace;font-size:5px;color:#4a5a6a;letter-spacing:2px;flex-shrink:0;}
    `;
    document.head.appendChild(s);
  },
};

export default FreeBattle;
