/**
 * Locale — CZ/EN lokalizace.
 * Jazyk je GLOBÁLNÍ (localStorage 'conflux_lang'), ne per-save.
 * EN data jsou overlay JSONy v data/lang/ (generuje tools/translate_en.py):
 *   campaign_en.json — nodeId → pole textů v pořadí frames→setup→lines→choices→title
 *   cards_en.json    — cardId → {name, desc}
 *   enemies_en.json  — enemyId → {name, preBattleDialog[], barks{trigger:[]}}
 *   strings_en.json  — přesný CZ string → EN (dynamické věty: dopis, profileBarks…)
 * apply() MUTUJE datové moduly in-place — volat v boot() PŘED GameState.loadCards().
 */
import GameState from './GameState.js';
import { CARDS_DATA } from '../data/cards.js';
import { CAMPAIGN_DATA } from '../data/campaign.js';
import { ENEMIES_DATA } from '../data/enemies.js';

// Statické UI stringy — CZ originál → EN. (Defaultně se zobrazuje CZ; EN jen když je zvolen.)
const UI_EN = {
  // Coinflip
  'klikni na minci — kdo začíná': 'flip the coin — who goes first',
  'Začínáš ty.': 'You go first.',
  'Začíná protivník.': 'Opponent goes first.',
  'načítám karty…': 'loading cards…',
  // Profil-screen
  'SYSTÉM · PROFIL KURÝRA': 'SYSTEM · COURIER PROFILE',
  'Čtu tvůj deck. A tebe.': 'I read your deck. And you.',
  // Obecné
  '▶ POKRAČOVAT': '▶ CONTINUE',
  'POKRAČOVAT →': 'CONTINUE →',
  ' > POKRAČOVAT': ' > CONTINUE',
  '← ZPĚT': '← BACK',
  // Letter
  'přečíst znovu': 'read again',
  'konec': 'end',
  // Mode select
  'VYBER HERNÍ MÓD': 'CHOOSE GAME MODE',
  'Nastavíš jen na začátku nové hry.': 'Set only at the start of a new game.',
  'Volné fúze (archetypy). Přístupnější — většina kombinací něco vytvoří. Doporučeno poprvé.':
    'Free fusions (archetypes). More forgiving — most combinations make something. Recommended for a first run.',
  'Jen specifické fúzní recepty. Mnohem složitější, využívá maximum mechanik. Pro znalce.':
    'Only specific fusion recipes. Much harder, uses every mechanic. For veterans.',
  // Nastavení
  'HUDBA': 'MUSIC', 'ZVUKY': 'SOUND', 'RYCHLOST TEXTU': 'TEXT SPEED', 'OBTÍŽNOST AI': 'AI DIFFICULTY',
  'FULLSCREEN': 'FULLSCREEN', 'KLÁVESNICE': 'KEYBOARD', 'NASTAVENÍ': 'SETTINGS',
  'POMALÁ': 'SLOW', 'NORMÁLNÍ': 'NORMAL', 'RYCHLÁ': 'FAST', 'OKAMŽITÁ': 'INSTANT',
  'TĚŽKÁ': 'HARD', 'PERFEKTNÍ': 'PERFECT',
  // Battle overlay
  'VÍTĚZSTVÍ': 'VICTORY', 'PORÁŽKA': 'DEFEAT', 'PAUZA': 'PAUSE', 'KAMPAŇ': 'CAMPAIGN', 'TAH': 'TURN',
};

const Locale = {
  strings: {},   // CZ → EN pro dynamické stringy

  getLang() {
    try { return localStorage.getItem('conflux_lang') || 'cs'; } catch(e) { return 'cs'; }
  },

  setLang(lang) {
    try { localStorage.setItem('conflux_lang', lang); } catch(e) {}
  },

  /** Byl už jazyk někdy zvolen? (false = ukázat uvítací výběr) */
  hasChosen() {
    try { return localStorage.getItem('conflux_lang') !== null; } catch(e) { return true; }
  },

  /** Přelož dynamický string (dopis, profil…). Mimo EN nebo bez záznamu vrací originál. */
  t(s) {
    if(GameState.settings?.language !== 'en') return s;
    return this.strings[s] || s;
  },

  /** Statické UI stringy (tlačítka, hlavičky). V CZ vrací originál, v EN z UI mapy. */
  ui(s) {
    if(GameState.settings?.language !== 'en') return s;
    return UI_EN[s] ?? s;
  },

  /** Je aktuální jazyk angličtina? */
  isEN() { return GameState.settings?.language === 'en'; },

  async apply() {
    const lang = this.getLang();
    GameState.settings.language = lang;
    GameState._locale = this; // pro moduly bez importu (žádný kruhový import)
    if(lang !== 'en') return;

    const grab = (url) => fetch(url).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    const [camp, cards, enemies, strings] = await Promise.all([
      grab('data/lang/campaign_en.json'),
      grab('data/lang/cards_en.json'),
      grab('data/lang/enemies_en.json'),
      grab('data/lang/strings_en.json'),
    ]);
    this.strings = strings || {};

    // ── karty ──
    for(const c of CARDS_DATA.cards || []) {
      const t = cards[String(c.id)];
      if(t) { if(t.name) c.name = t.name; if(t.desc) c.desc = t.desc; }
    }

    // ── kampaň (stejné pořadí jako node_texts v translate_en.py) ──
    for(const act of CAMPAIGN_DATA.acts || []) {
      for(const n of act.nodes || []) {
        const arr = camp[n.id];
        if(!arr) continue;
        let i = 0;
        for(const f of n.frames || [])  f.text = arr[i++] ?? f.text;
        for(const l of n.setup || [])   l.text = arr[i++] ?? l.text;
        for(const l of n.lines || [])   l.text = arr[i++] ?? l.text;
        for(const c of n.choices || []) c.text = arr[i++] ?? c.text;
        if(n.title) n.title = arr[i++] ?? n.title;
      }
    }

    // ── nepřátelé ──
    for(const e of ENEMIES_DATA.enemies || []) {
      const t = enemies[e.id];
      if(!t) continue;
      if(t.name) e.name = t.name;
      (t.preBattleDialog || []).forEach((tx, i) => { if(e.preBattleDialog?.[i]) e.preBattleDialog[i].text = tx; });
      for(const [trg, arr] of Object.entries(t.barks || {})) {
        (arr || []).forEach((tx, i) => { if(e.barks?.[trg]?.[i]) e.barks[trg][i].text = tx; });
      }
    }
    console.log('[Locale] EN overlay aplikován');
  },
};

export default Locale;
