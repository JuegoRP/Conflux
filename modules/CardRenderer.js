/**
 * CardRenderer v8 — CONFLUX
 *
 * ZMĚNY OPROTI v7:
 * — Scar visualization refactored.
 *   Pod threshold 3 jizvy = karta vypadá neutrálně (hráč nic netuší).
 *   Na 3+/6+/10+ jizvách se objevují praskliny + frakční patina.
 *   Počet jizev (číslo ◈N) se skrývá v battle zónách, ukazuje jen
 *   v detail/collection/preview kontextu (opts.showScarCount = true).
 * — Nová historie jizev v preview (opts.scarData.history).
 *
 * SM (80×112, field): jen emoji + ATK/DEF — bez textů. Rychlé čtení za boje.
 * MD (100×140, hand/collection): jako sm, mírně větší písmo.
 * LG (360×504, preview): full layout — name, id, emoji, stats, description, subcategory.
 *
 * Barevný systém ATK/DEF je FIXED (oranžová/modrá) — ne faction.
 *
 * Fallback když frame nenačte: barva pozadí je faction-gradient.
 */

const FRAME_BASE = 'assets/images/frames/';

function framePath(card) {
  if (!card) return FRAME_BASE + 'frame_neutral.png';
  const kind = card.kind || 'monster';
  // kind-based frames — soubory přejmenovány uživatelem dle typu:
  if (kind === 'arena')  return FRAME_BASE + 'frame_arena.png';
  if (kind === 'spell')  return FRAME_BASE + 'frame_spell.png';
  if (kind === 'trap')   return FRAME_BASE + 'frame_trap.png';
  if (kind === 'letter') return FRAME_BASE + 'frame_corruption_alt.png';
  // faction-based frames — soubory přejmenovány dle frakce:
  const f = card.faction || 'neutral';
  const fMap = {
    synth:      'frame_synth.png',
    organic:    'frame_organic.png',
    hybrid:     'frame_hybrid.png',
    corruption: 'frame_corruption.png',
    neutral:    'frame_neutral.png',
  };
  return FRAME_BASE + (fMap[f] || 'frame_neutral.png');
}

export const factionShortLabel = f => ({
  synth:'SYNTH', organic:'ORGANIC', hybrid:'HYBRID', corruption:'CORRUPTION', neutral:'NEUTRAL'
}[f] || '');

export const factionColor = f => ({
  synth: '#4fa3e0', organic: '#e04f6a', hybrid: '#50e0b8', corruption: '#9b59b6', neutral: '#e0e4e8'
}[f] || '#c8d6e5');

export const factionBgGradient = f => ({
  synth:     'linear-gradient(135deg, #04080e 0%, #080f18 100%)',
  organic:   'linear-gradient(135deg, #0a0305 0%, #0f0508 100%)',
  hybrid:    'linear-gradient(135deg, #030a08 0%, #060f0c 100%)',
  corruption:'linear-gradient(135deg, #07030c 0%, #0c0512 100%)',
  neutral:   'linear-gradient(135deg, #060809 0%, #090c0e 100%)',
}[f] || 'linear-gradient(135deg, #060809 0%, #090c0e 100%)');

export const factionLabel = f => ({
  synth: '⬡ SYNTH', organic: '☘ ORGANIC', hybrid: '✦ HYBRID', corruption: '◈ CORRUPTION', neutral: '— NEUTRAL'
}[f] || (f || '').toUpperCase());

export const kindLabel = k => ({
  monster: 'MONSTER', spell: 'SKILL', trap: 'PAST', arena: 'ARÉNA', letter: 'DOPIS'
}[k] || (k || '').toUpperCase());

const subcatColors = {
  striker: '#f09050', guardian: '#4fa3e0', system: '#80c8f0', nature: '#50e0b8',
  memory: '#b570e0', void: '#9b59b6', healer: '#70e8a0', bridge: '#c8d6e5',
  scout: '#e0c060', balanced: '#90a0b0'
};

// ── Scar fáze ────────────────────────────────────────────────────────────────
// 0–2 jizvy: karta vypadá čistá, neutrální. Hráč nemá indicii.
// 3–5: první scar form. Mírné praskliny, lehká frakční patina.
// 6–9: druhý scar form. Víc prasklin, silnější patina, tlumená saturace.
// 10+: třetí scar form ("nameFull"). Přes karty jdou praskliny, rámeček ohnutý.
function scarPhase(scarCount) {
  if (scarCount >= 10) return 3;
  if (scarCount >= 6)  return 2;
  if (scarCount >= 3)  return 1;
  return 0;
}

// SVG praskliny — per-fáze, per-card seed pro variabilitu
function scarOverlay(cardId, phase, faction) {
  if (phase === 0) return '';
  const seed = ((cardId * 2654435761) >>> 0) % 1000;
  const r = (n) => ((seed * (n + 1) * 9301 + 49297) % 233280) / 233280;

  const lines = [];
  const count = phase === 1 ? 1 : phase === 2 ? 3 : 6;
  for (let i = 0; i < count; i++) {
    const x1 = 5 + r(i*2) * 90;
    const y1 = 5 + r(i*2+1) * 90;
    const angle = r(i*3) * Math.PI * 2;
    const len = phase === 1 ? 8 + r(i*4)*10 : phase === 2 ? 15 + r(i*4)*20 : 25 + r(i*4)*35;
    const x2 = x1 + Math.cos(angle) * len;
    const y2 = y1 + Math.sin(angle) * len;
    // Zlomené praskliny — přidej zlom uprostřed
    const mx = (x1 + x2) / 2 + (r(i*5) - 0.5) * 6;
    const my = (y1 + y2) / 2 + (r(i*6) - 0.5) * 6;
    lines.push(`M${x1.toFixed(1)},${y1.toFixed(1)} L${mx.toFixed(1)},${my.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`);
  }

  const opacity = phase === 1 ? 0.35 : phase === 2 ? 0.55 : 0.8;
  const width = phase === 1 ? 0.3 : phase === 2 ? 0.5 : 0.8;

  return `<svg class="cx-scar-overlay cx-scar-phase-${phase} cx-scar-f-${faction||'neutral'}"
    viewBox="0 0 100 100" preserveAspectRatio="none"
    style="--scar-op:${opacity};--scar-w:${width}">
    ${lines.map(d => `<path d="${d}" />`).join('')}
  </svg>`;
}

export function renderCardEl(card, size = 'md', opts = {}) {
  if (opts.faceDown) {
    return `<div class="cx-card cx-${size} cx-facedown">
      <img class="cx-back-img" src="assets/images/cards/card_back.jpg" loading="lazy"
        onerror="this.onerror=null;this.src='assets/images/cards/card_back.png'" />
    </div>`;
  }
  if (!card) return '';

  const fc = factionColor(card.faction);
  const fbg = factionBgGradient(card.faction);
  const isMonster = card.kind === 'monster';
  const isLg = size === 'lg';
  const isSmall = size === 'sm' || size === 'md';

  const scarCount = opts.scarCount || (opts.scarData?.scars) || 0;
  const phase = scarPhase(scarCount);

  // Číslo jizev ukážeme jen když je explicitně povoleno (collection, preview, deck builder, hover).
  // V battle zónách ne — karty se mění samy, hráč to objevuje.
  const showScarCount = opts.showScarCount !== false && (opts.showScarCount === true || isLg);

  const cls = [
    'cx-card', 'cx-' + size,
    'cx-f-' + (card.faction || 'neutral'),
    'cx-k-' + (card.kind || 'monster'),
    opts.def ? 'cx-def' : '',
    opts.selected ? 'cx-selected' : '',
    opts.target ? 'cx-target' : '',
    opts.used ? 'cx-used' : '',
    opts.revealing ? 'cx-reveal' : '',
    opts.attacker ? 'cx-attacker' : '',
    phase >= 1 ? 'cx-scarred' : '',
    phase >= 1 ? 'cx-scar-p' + phase : '',
  ].filter(Boolean).join(' ');

  const frame = framePath(card);
  const scarSvg = scarOverlay(card.id, phase, card.faction);
  const artPath = card.id ? `assets/images/cards/${String(card.id).padStart(3,'0')}.jpg` : null;

  // ── SMALL SIZES (sm/md) ──
  if (isSmall) {
    const statsBottom = isMonster
      ? `<div class="cx-sm-stats">
           <span class="cx-sm-atk">${card.atk || 0}</span>
           <span class="cx-sm-sep">/</span>
           <span class="cx-sm-def">${card.def || 0}</span>
         </div>`
      : `<div class="cx-sm-kind">${kindLabel(card.kind)}</div>`;

    const badges = [
      opts.inFuse ? '<div class="cx-badge cx-badge-fuse">✦</div>' : '',
      card.corruptionValue ? `<div class="cx-badge cx-badge-corr">◈${card.corruptionValue}</div>` : '',
      showScarCount && scarCount > 0 ? `<div class="cx-badge cx-badge-scar">◈${scarCount}</div>` : '',
      (opts.owned > 1) ? `<div class="cx-badge cx-badge-owned">×${opts.owned}</div>` : '',
      (opts.inDeck > 0) ? `<div class="cx-badge cx-badge-deck">D</div>` : '',
      opts.used ? '<div class="cx-used-overlay"></div>' : '',
    ].join('');

    const artHtml = artPath
      ? `<img class="cx-art" src="${artPath}" loading="lazy" onerror="this.style.display='none';var f=this.closest('.cx-card').querySelector('.cx-emoji-fallback');if(f)f.style.display='';" />`
      : '';
    const emojiHtml = `<span class="cx-emoji${artPath ? ' cx-emoji-fallback' : ''}" data-sprite-id="${card.id}">${card.emoji || '?'}</span>`;

    return `<div class="${cls}" style="--fc:${fc};--fbg:${fbg}" data-card-id="${card.id}">
      ${artHtml}
      <img class="cx-frame" src="${frame}" loading="lazy" onerror="this.style.display='none'" />
      <div class="cx-content cx-content-sm">
        <div class="cx-sm-emoji-wrap">
          ${emojiHtml}
        </div>
        ${statsBottom}
      </div>
      ${scarSvg}
      ${badges}
    </div>`;
  }

  // ── LG (preview): full layout ──
  const subHtml = (isMonster && card.subcategory)
    ? `<div class="cx-subcat" style="color:${subcatColors[card.subcategory] || '#90a0b0'}">${card.subcategory.toUpperCase()}</div>` : '';

  const statsHtml = isMonster
    ? `<div class="cx-lg-stats">
         <div class="cx-lg-stat cx-lg-atk-block">
           <span class="cx-lg-stat-val">${card.atk || 0}</span>
           <span class="cx-lg-stat-label">ATK</span>
         </div>
         <div class="cx-lg-stat cx-lg-def-block">
           <span class="cx-lg-stat-label">DEF</span>
           <span class="cx-lg-stat-val">${card.def || 0}</span>
         </div>
       </div>` : '';

  const kindHtml = !isMonster
    ? `<div class="cx-lg-kind-block"><span class="cx-lg-kind-text">${kindLabel(card.kind)}</span></div>` : '';

  const descHtml = `<div class="cx-desc">${card.desc || ''}</div>`;

  const badges = [
    opts.inFuse ? '<div class="cx-badge cx-badge-fuse">✦</div>' : '',
    card.corruptionValue ? `<div class="cx-badge cx-badge-corr">◈${card.corruptionValue}</div>` : '',
    showScarCount && scarCount > 0 ? `<div class="cx-badge cx-badge-scar">◈${scarCount}</div>` : '',
    (opts.owned > 1) ? `<div class="cx-badge cx-badge-owned">×${opts.owned}</div>` : '',
    (opts.inDeck > 0) ? `<div class="cx-badge cx-badge-deck">D</div>` : '',
    opts.used ? '<div class="cx-used-overlay"></div>' : '',
  ].join('');

  const artHtmlLg = artPath
    ? `<img class="cx-art" src="${artPath}" onerror="this.style.display='none';var f=this.closest('.cx-card').querySelector('.cx-emoji-fallback');if(f)f.style.display='';" />`
    : '';

  return `<div class="${cls}" style="--fc:${fc};--fbg:${fbg}" data-card-id="${card.id}">
    ${artHtmlLg}
    <img class="cx-frame" src="${frame}" loading="lazy" onerror="this.style.display='none'" />
    <div class="cx-content">
      <div class="cx-zone-top">
        <span class="cx-topname">${card.name}</span>
        <span class="cx-topid">#${String(card.id).padStart(3,'0')}</span>
      </div>
      <div class="cx-zone-art">
        <span class="cx-emoji${artPath ? ' cx-emoji-fallback' : ''}" data-sprite-id="${card.id}">${card.emoji || '?'}</span>
        ${subHtml}
      </div>
      <div class="cx-zone-stats">${statsHtml}${kindHtml}</div>
      <div class="cx-zone-info">${descHtml}</div>
    </div>
    ${scarSvg}
    ${badges}
  </div>`;
}

// ── Historie jizev pro collection preview ────────────────────────────────────
function renderScarHistory(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const rows = history.map(h => {
    const outcome = h.outcome === 'survived' ? 'přežil'
                  : h.outcome === 'fallen' ? 'padl'
                  : h.outcome === 'revived' ? 'vzkříšen' : h.outcome || '';
    const enemy = h.enemy || '—';
    const act = h.act ? `Akt ${h.act}` : '';
    return `<div class="cp-scar-row">
      <span class="cp-scar-act">${act}</span>
      <span class="cp-scar-enemy">${enemy}</span>
      <span class="cp-scar-outcome cp-scar-${h.outcome || 'survived'}">${outcome}</span>
    </div>`;
  }).join('');
  return `<div class="cp-scar-history">
    <div class="cp-scar-history-title">Historie</div>
    ${rows}
  </div>`;
}

export function renderCardPreview(card, opts = {}) {
  if (!card) return '';
  const {
    owned = 0, inDeck = 0, canAdd = false, canRemove = false,
    isFused = false, scarData = null, readOnly = false
  } = opts;

  const scars = scarData?.scars || 0;
  const phase = scarPhase(scars);
  const phaseLabel = phase === 3 ? 'prolomená' : phase === 2 ? 'těžce poznamenaná' : phase === 1 ? 'poznamenaná' : '';

  return `<div class="cp-layout">
    <div class="cp-card-wrap">${renderCardEl(card, 'lg', { inFuse: isFused, scarData, showScarCount: true })}</div>
    <div class="cp-sidebar">
      <div class="cp-info">
        <div class="cp-owned">Vlastníš <strong>×${owned}</strong></div>
        <div class="cp-indeck">V decku <strong>×${inDeck}</strong></div>
        ${isFused ? '<div class="cp-fused">✦ Fúzní karta</div>' : ''}
        ${scars > 0 ? `<div class="cp-scar">◈ ${scars} ${scars === 1 ? 'jizva' : scars < 5 ? 'jizvy' : 'jizev'}${phaseLabel ? ' · ' + phaseLabel : ''}</div>` : ''}
        ${scarData?.evolved ? `<div class="cp-evo">◈ ${scarData.evolutionName || 'evoluce proběhla'}</div>` : ''}
      </div>
      ${renderScarHistory(scarData?.history)}
      ${!readOnly ? `<div class="cp-actions">
        <button class="cp-btn cp-add${canAdd ? '' : ' cp-btn-disabled'}" id="cpbtn-add"${canAdd ? '' : ' disabled'}>＋ PŘIDAT</button>
        <button class="cp-btn cp-rem${canRemove ? '' : ' cp-btn-disabled'}" id="cpbtn-rem"${canRemove ? '' : ' disabled'}>－ ODEBRAT</button>
      </div>` : ''}
    </div>
  </div>`;
}

export function injectCardStyles() {
  if (document.getElementById('conflux-card-styles')) return;
  if (!document.getElementById('conflux-fonts')) {
    const l = document.createElement('link');
    l.id = 'conflux-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Share+Tech+Mono&display=swap';
    document.head.appendChild(l);
  }
  const s = document.createElement('style');
  s.id = 'conflux-card-styles';
  s.textContent = `
    :root {
      --px:'Press Start 2P',monospace;--body:'VT323',monospace;--mono:'Share Tech Mono',monospace;
      --synth:#4fa3e0;--organic:#e04f6a;--hybrid:#50e0b8;--corruption:#9b59b6;--neutral:#e0e4e8;
      --bg:#060809;--bg2:#0b0f16;--border:rgba(100,180,240,0.25);
      --gold:#e0c060;--text:#ddeeff;--dim:#6080a0;
      --atk-color:#ff9a55;--def-color:#5bb8ff;
    }

    .cx-card{
      position:relative;overflow:hidden;border-radius:4px;
      background:var(--fbg, #080c14);
      box-shadow:0 2px 8px rgba(0,0,0,0.6),inset 0 0 0 1px rgba(0,0,0,0.4);
      transition:transform .15s ease,box-shadow .15s ease,filter .3s ease;
      cursor:default;user-select:none;
    }

    /* Card sizes — 2:3 ratio matching the frame PNGs (778×1168) */
    .cx-sm{width:80px;height:120px;}
    .cx-md{width:100px;height:150px;}
    .cx-lg{width:336px;height:504px;}

    /* Artwork — umístěno přesně do OKNA rámu (měřeno z průhledné díry v PNG:
       x ~11-86%, y ~15-74%, poměr ~0.85). Dřív byl artwork přes celou kartu (2:3)
       s object-fit:cover → čtverec ztratil ~38% šířky. Teď rect ~okno → zobrazí se
       celá šířka subjektu, ořez jen ~15% svisle. Rect je o kousek větší než okno,
       aby artwork dosedl pod okraje rámu (rám maskuje přesah). */
    .cx-art{
      position:absolute;
      top:12%;left:9%;width:82%;height:64%;
      object-fit:cover;
      object-position:center 40%;
      z-index:1;pointer-events:none;
    }
    .cx-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;z-index:2;pointer-events:none;}
    .cx-content{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;pointer-events:none;}

    /* Hide emoji when artwork is present; onerror in JS restores it */
    .cx-emoji-fallback{display:none;}

    /* SMALL CONTENT */
    .cx-content-sm{padding:20% 13% 7%;}
    .cx-sm-emoji-wrap{
      flex:1;display:flex;align-items:center;justify-content:center;
    }
    .cx-sm .cx-emoji{font-size:26px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.9));}
    .cx-md .cx-emoji{font-size:36px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.9));}

    .cx-sm-stats{
      display:flex;align-items:center;justify-content:center;gap:4px;
      padding:4px 0 2px;
      font-family:var(--mono);font-weight:bold;
      background:rgba(0,0,0,0.55);
      border-radius:2px;
      margin-top:4px;
    }
    .cx-sm-atk{color:var(--atk-color);text-shadow:0 1px 2px #000;}
    .cx-sm-def{color:var(--def-color);text-shadow:0 1px 2px #000;}
    .cx-sm-sep{color:rgba(255,255,255,0.4);}
    .cx-sm .cx-sm-atk,.cx-sm .cx-sm-def{font-size:11px;}
    .cx-sm .cx-sm-sep{font-size:10px;}
    .cx-md .cx-sm-atk,.cx-md .cx-sm-def{font-size:14px;}
    .cx-md .cx-sm-sep{font-size:12px;}

    .cx-sm-kind{
      text-align:center;padding:4px 0 2px;margin-top:4px;
      font-family:var(--px);letter-spacing:1.5px;
      color:#e8dfc2;
      background:rgba(0,0,0,0.55);
      border-radius:2px;
      text-shadow:0 1px 2px #000;
    }
    .cx-sm .cx-sm-kind{font-size:6px;}
    .cx-md .cx-sm-kind{font-size:7px;}

    /* LG CONTENT — zones calibrated to actual frame pixel layout (778×1168):
       top bar: y=60-220 (5-19%), art hole: y=220-880 (19-75%),
       stats: y=880-960 (75-82%), desc: y=980-1160 (84-99%) */
    .cx-lg .cx-zone-top{
      height:19%;
      display:flex;align-items:center;
      padding:2% 6% 0 14%;
      gap:6px;
    }
    /* Name fills the title bar space (after orb), centered */
    .cx-lg .cx-topname{
      flex:1;
      font-family:var(--px);font-size:9px;letter-spacing:0.5px;
      color:#f5eedf;
      text-shadow:0 0 10px rgba(0,0,0,1),0 1px 4px #000,0 0 2px #000;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      text-align:center;
    }
    /* ID — right side of title bar */
    .cx-lg .cx-topid{
      font-family:var(--mono);font-size:15px;font-weight:bold;
      color:#9ecae0;
      text-shadow:0 0 10px rgba(80,160,220,0.7),0 1px 4px #000;
      white-space:nowrap;flex-shrink:0;
      letter-spacing:1.5px;
      margin-right:10px;
    }
    .cx-lg .cx-zone-art{
      height:56%;position:relative;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
    }
    .cx-lg .cx-emoji{font-size:96px;line-height:1;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.9));}
    /* Subcategory — centered at bottom of art hole */
    .cx-lg .cx-subcat{
      position:absolute;bottom:6px;left:50%;transform:translateX(-50%);
      white-space:nowrap;
      font-family:var(--px);font-size:6px;letter-spacing:2px;
      text-shadow:0 0 8px rgba(0,0,0,0.95),0 1px 3px #000;opacity:0.85;
    }
    .cx-lg .cx-zone-stats{
      height:9%;display:flex;align-items:center;justify-content:space-around;
      padding:0 13% 2%;
    }
    /* ATK / DEF — [value ATK]   [DEF value] */
    .cx-lg-stats{display:flex;gap:24px;width:100%;justify-content:center;align-items:baseline;}
    .cx-lg-stat{
      display:flex;flex-direction:row;align-items:baseline;gap:5px;
    }
    .cx-lg-stat-label{
      font-family:var(--px);font-size:7px;letter-spacing:1.5px;
      text-shadow:0 1px 3px rgba(0,0,0,0.95);
      text-transform:uppercase;opacity:0.7;
    }
    .cx-lg-atk-block .cx-lg-stat-label{color:var(--atk-color);}
    .cx-lg-def-block .cx-lg-stat-label{color:var(--def-color);}
    .cx-lg-stat-val{
      font-family:var(--body);font-size:34px;line-height:1;font-weight:normal;
      text-shadow:0 0 14px currentColor, 0 0 5px currentColor, 0 2px 4px rgba(0,0,0,0.98);
    }
    .cx-lg-atk-block .cx-lg-stat-val{color:var(--atk-color);}
    .cx-lg-def-block .cx-lg-stat-val{color:var(--def-color);}
    .cx-lg-kind-block{
      display:flex;align-items:center;justify-content:center;
    }
    .cx-lg-kind-text{font-family:var(--px);font-size:9px;letter-spacing:2px;color:#c8b880;text-shadow:0 0 8px rgba(200,184,128,0.4),0 1px 2px #000;}
    .cx-lg .cx-zone-info{
      height:16%;padding:3px 13% 5%;
      display:flex;align-items:flex-start;overflow:hidden;
    }
    .cx-lg .cx-desc{
      font-family:var(--body);font-size:16px;line-height:1.2;color:#b8cede;
      text-shadow:0 1px 4px rgba(0,0,0,0.98),0 0 8px rgba(0,0,0,0.6);
    }

    /* States */
    .cx-selected{transform:translateY(-3px);box-shadow:0 0 0 2px var(--gold),0 4px 16px rgba(212,168,67,0.4);}
    .cx-target{animation:cx-pulse .6s ease infinite alternate;}
    @keyframes cx-pulse{from{box-shadow:0 0 0 2px #e04f6a,0 0 8px rgba(224,79,106,0.3)}to{box-shadow:0 0 0 2px #e04f6a,0 0 20px rgba(224,79,106,0.7)}}
    .cx-def{transform:rotate(6deg) translateY(2px);}
    .cx-used{opacity:0.45;filter:saturate(0.3);}
    .cx-reveal{animation:cx-flip .4s ease;}
    @keyframes cx-flip{0%{transform:rotateY(0)}49%{transform:rotateY(90deg)}51%{transform:rotateY(-90deg)}100%{transform:rotateY(0)}}
    .cx-attacker{box-shadow:0 0 0 2px var(--gold),0 0 14px rgba(212,168,67,0.4);}

    .cx-facedown{display:flex;align-items:center;justify-content:center;background:#0d1520;border:1px solid rgba(60,90,130,0.2);}
    .cx-back-img{width:100%;height:100%;object-fit:cover;}

    /* Badges */
    .cx-badge{position:absolute;z-index:5;font-family:var(--mono);font-size:9px;font-weight:bold;}
    .cx-badge-fuse{top:3px;right:4px;color:#b570e0;font-size:12px;text-shadow:0 0 4px #000;}
    .cx-badge-corr{bottom:3px;right:4px;color:#9b59b6;text-shadow:0 0 4px #000;}
    .cx-badge-scar{
      bottom:3px;right:4px;
      color:#d8c090;opacity:0.85;
      text-shadow:0 0 4px #000, 0 1px 1px rgba(0,0,0,0.9);
      font-family:var(--mono);font-size:10px;letter-spacing:0.5px;
    }
    .cx-badge-owned{top:3px;right:4px;color:#c8a84b;background:rgba(0,0,0,0.7);padding:2px 4px;border-radius:2px;}
    .cx-badge-deck{bottom:3px;left:4px;color:#50e0b8;background:rgba(0,0,0,0.7);padding:2px 4px;border-radius:2px;}
    .cx-used-overlay{position:absolute;inset:0;z-index:5;background:rgba(0,0,0,0.4);}

    /* ═══════════════════════════════════════════════════════════════
       SCARS — praskliny + frakční patina
       Žádné fialové ohraničení, žádný badge pod threshold.
       ═══════════════════════════════════════════════════════════════ */

    /* Overlay praskliny */
    .cx-scar-overlay{
      position:absolute;inset:0;z-index:3;pointer-events:none;
      width:100%;height:100%;
      mix-blend-mode:multiply;
    }
    .cx-scar-overlay path{
      fill:none;
      stroke:rgba(10,5,2,var(--scar-op,0.5));
      stroke-width:var(--scar-w,0.5);
      stroke-linecap:round;stroke-linejoin:round;
      vector-effect:non-scaling-stroke;
    }
    /* Frakční tónování prasklin */
    .cx-scar-f-synth path{stroke:rgba(60,30,15,var(--scar-op,0.5));}
    .cx-scar-f-organic path{stroke:rgba(40,15,10,var(--scar-op,0.5));}
    .cx-scar-f-hybrid path{stroke:rgba(15,35,25,var(--scar-op,0.5));}
    .cx-scar-f-corruption path{stroke:rgba(25,10,30,var(--scar-op,0.5));}

    /* Fázové efekty na celou kartu — patina a opotřebení */
    .cx-scar-p1{filter:saturate(0.92) brightness(0.97);}
    .cx-scar-p2{filter:saturate(0.78) brightness(0.90) contrast(1.05);}
    .cx-scar-p3{filter:saturate(0.60) brightness(0.82) contrast(1.10);}

    /* Fáze 2: lehká žlutavá patina přes kartu */
    .cx-scar-p2::before{
      content:'';position:absolute;inset:0;z-index:3;pointer-events:none;
      background:radial-gradient(ellipse at 30% 20%, transparent 40%, rgba(80,50,20,0.12) 100%);
    }
    /* Fáze 3: silnější patina + frakční nádech */
    .cx-scar-p3::before{
      content:'';position:absolute;inset:0;z-index:3;pointer-events:none;
      background:
        radial-gradient(ellipse at 20% 10%, transparent 30%, rgba(60,30,10,0.25) 100%),
        radial-gradient(ellipse at 80% 90%, transparent 40%, rgba(40,20,10,0.20) 100%);
    }
    /* Frakční zabarvení patiny ve fázi 3 */
    .cx-scar-p3.cx-f-synth::before{background:
      radial-gradient(ellipse at 20% 10%, transparent 30%, rgba(50,25,15,0.30) 100%),
      radial-gradient(ellipse at 80% 90%, transparent 40%, rgba(30,15,10,0.22) 100%);}
    .cx-scar-p3.cx-f-organic::before{background:
      radial-gradient(ellipse at 20% 10%, transparent 30%, rgba(40,20,10,0.30) 100%),
      radial-gradient(ellipse at 80% 90%, transparent 40%, rgba(20,15,8,0.22) 100%);}
    .cx-scar-p3.cx-f-hybrid::before{background:
      radial-gradient(ellipse at 20% 10%, transparent 30%, rgba(20,40,30,0.28) 100%),
      radial-gradient(ellipse at 80% 90%, transparent 40%, rgba(15,30,20,0.20) 100%);}
    .cx-scar-p3.cx-f-corruption::before{background:
      radial-gradient(ellipse at 20% 10%, transparent 30%, rgba(30,10,40,0.32) 100%),
      radial-gradient(ellipse at 80% 90%, transparent 40%, rgba(20,8,25,0.24) 100%);}

    /* Fáze 3: rohy vypadají odřené */
    .cx-scar-p3{
      box-shadow:
        0 2px 8px rgba(0,0,0,0.6),
        inset 0 0 0 1px rgba(0,0,0,0.4),
        inset 6px 0 8px -6px rgba(0,0,0,0.4),
        inset -6px 0 8px -6px rgba(0,0,0,0.4);
    }

    /* Faction hover glow — jen když není scarred, aby se glow neprala s patinou */
    .cx-f-synth:not(.cx-scarred):hover{box-shadow:0 0 12px rgba(79,163,224,0.3);}
    .cx-f-organic:not(.cx-scarred):hover{box-shadow:0 0 12px rgba(224,79,106,0.3);}
    .cx-f-hybrid:not(.cx-scarred):hover{box-shadow:0 0 12px rgba(80,224,184,0.3);}
    .cx-f-corruption:not(.cx-scarred):hover{box-shadow:0 0 12px rgba(181,112,224,0.3);}


    /* ═══ PREVIEW ═══ */
    .cp-layout{display:flex;gap:28px;align-items:flex-start;}
    .cp-card-wrap{flex-shrink:0;}
    .cp-sidebar{display:flex;flex-direction:column;gap:16px;min-width:220px;padding-top:8px;}
    .cp-info{display:flex;flex-direction:column;gap:8px;}
    .cp-owned,.cp-indeck{font-family:var(--mono);font-size:15px;color:#8090a0;}
    .cp-owned strong,.cp-indeck strong{color:var(--text);font-size:16px;}
    .cp-fused{font-size:13px;color:#b570e0;font-family:var(--mono);}
    .cp-scar{font-size:13px;color:#d8c090;font-family:var(--mono);}
    .cp-evo{font-size:13px;color:#50e0b8;font-family:var(--mono);}
    .cp-actions{display:flex;flex-direction:column;gap:10px;}
    .cp-btn{background:#0a0f18;border:1px solid #1a2535;color:#c8d6e5;font-family:var(--mono);font-size:13px;padding:10px 16px;cursor:pointer;}
    .cp-add:hover:not(:disabled){border-color:#50e0b8;color:#50e0b8;}
    .cp-rem:hover:not(:disabled){border-color:#e04f6a;color:#e04f6a;}
    .cp-btn-disabled{opacity:0.35;cursor:not-allowed;}

    /* Scar history */
    .cp-scar-history{
      display:flex;flex-direction:column;gap:4px;
      padding:10px 12px;
      background:rgba(10,15,22,0.6);
      border-left:2px solid rgba(216,192,144,0.3);
      font-family:var(--mono);
    }
    .cp-scar-history-title{
      font-size:10px;letter-spacing:1.5px;
      color:#8090a0;text-transform:uppercase;
      margin-bottom:4px;
    }
    .cp-scar-row{
      display:flex;gap:8px;align-items:baseline;
      font-size:12px;
      padding:2px 0;
      border-bottom:1px dotted rgba(100,120,140,0.15);
    }
    .cp-scar-row:last-child{border-bottom:none;}
    .cp-scar-act{color:#6080a0;min-width:44px;font-size:11px;}
    .cp-scar-enemy{color:#c0d0e0;flex:1;}
    .cp-scar-outcome{font-size:11px;font-style:italic;}
    .cp-scar-survived{color:#70b890;}
    .cp-scar-fallen{color:#b86070;}
    .cp-scar-revived{color:#b890e0;}
  `;
  document.head.appendChild(s);

  if (!window._confluxImgHandler) {
    window._confluxImgHandler = true;
    document.addEventListener('error', (e) => {
      if (e.target.tagName === 'IMG' && e.target.classList.contains('cx-frame')) e.target.style.display = 'none';
      if (e.target.tagName === 'IMG' && e.target.classList.contains('cx-back-img')) {
        if (!window._cardBackBlob) {
          fetch('assets/images/cards/card_back.jpg')
            .then(r => r.blob()).then(blob => {
              window._cardBackBlob = URL.createObjectURL(blob);
              document.querySelectorAll('img.cx-back-img').forEach(img => { img.src = window._cardBackBlob; });
            }).catch(() => { });
        } else e.target.src = window._cardBackBlob;
      }
    }, true);
  }
}

// ── Fullscreen card zoom overlay ──────────────────────────────────────────────
// Použití: showCardZoom(card) — zobrazí kartu na průhledném přes celou obrazovku.
// Klik / klávesa Escape = zavře.
export function showCardZoom(card, opts = {}) {
  if (!card) return;
  injectCardStyles();
  document.getElementById('cx-zoom-overlay')?.remove();

  if (!document.getElementById('cx-zoom-style')) {
    const z = document.createElement('style');
    z.id = 'cx-zoom-style';
    z.textContent = `
      #cx-zoom-overlay{
        position:fixed;inset:0;z-index:9999;
        display:flex;align-items:center;justify-content:center;
        background:rgba(2,4,8,0.82);backdrop-filter:blur(4px);
        animation:cxz-in .18s ease;cursor:pointer;
      }
      @keyframes cxz-in{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}
      #cx-zoom-overlay .cx-card{
        transform:scale(1.12);
        box-shadow:0 12px 60px rgba(0,0,0,0.95),0 0 0 1px rgba(255,255,255,0.05);
        cursor:default;
      }
      #cx-zoom-close{
        position:absolute;top:16px;right:20px;
        font-family:var(--mono,monospace);font-size:14px;
        color:rgba(255,255,255,0.3);background:none;border:none;cursor:pointer;
        transition:color .15s;padding:4px 8px;
      }
      #cx-zoom-close:hover{color:#fff;}
    `;
    document.head.appendChild(z);
  }

  const ov = document.createElement('div');
  ov.id = 'cx-zoom-overlay';
  ov.innerHTML = `<button id="cx-zoom-close">✕ zavřít</button>` + renderCardEl(card, 'lg', opts);

  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if(e.key === 'Escape') close(); };
  ov.addEventListener('click', e => { if(!e.target.closest('.cx-card')) close(); });
  ov.querySelector('#cx-zoom-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
}
