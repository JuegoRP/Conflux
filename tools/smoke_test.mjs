// CONFLUX — smoke test: načte celý modulový graf s DOM-stuby.
// Chytá to, co `node --check` NEchytá: ESM-only syntaxi (?. v modulu), chybějící importy,
// runtime chyby při načtení, špatně vložený kód. Spouštět po každé dávce editací modulů.
// Použití: node tools/smoke_test.mjs   (z kořene repa)
globalThis.localStorage = { _d:{}, getItem(k){return this._d[k] ?? null}, setItem(k,v){this._d[k]=String(v)}, removeItem(k){delete this._d[k]}, clear(){this._d={}} };
const el = () => new Proxy({ style:{}, dataset:{}, classList:{add(){},remove(){},toggle(){},contains(){return false}} },
  { get(t,p){ return p in t ? t[p] : (t[p] = (()=>el())); }, set(t,p,v){ t[p]=v; return true; } });
globalThis.document = new Proxy(
  { createElement:()=>el(), createElementNS:()=>el(), getElementById:()=>el(), querySelector:()=>null,
    querySelectorAll:()=>[], head:el(), body:el(), documentElement:el(), addEventListener(){}, removeEventListener(){} },
  { get(t,p){ return p in t ? t[p] : (()=>el()); } });
globalThis.window = { addEventListener(){}, removeEventListener(){}, matchMedia(){return{matches:false,addEventListener(){}}},
  requestAnimationFrame(){return 0}, cancelAnimationFrame(){}, location:{reload(){},href:''}, AudioContext:function(){}, innerWidth:1920, innerHeight:1080 };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.Audio = function(){ return { play:()=>Promise.resolve(), pause(){}, cloneNode(){return this}, addEventListener(){}, load(){} }; };
globalThis.Image = function(){ return { addEventListener(){} }; };
globalThis.fetch = () => Promise.resolve({ ok:true, json:()=>Promise.resolve({}), text:()=>Promise.resolve('') });

const MODULES = [
  '../engine/EventBus.js','../engine/GameState.js','../engine/Router.js','../engine/SaveManager.js',
  '../engine/AssetManager.js','../engine/AssetLoader.js','../engine/Locale.js',
  '../modules/AudioSystem.js','../modules/CardRenderer.js','../modules/VoiceOver.js','../modules/SpriteSheet.js',
  '../modules/KeyboardController.js','../modules/CorruptionSystem.js','../modules/CorruptionVisuals.js',
  '../modules/MainMenu.js','../modules/BattleSystem.js','../modules/StoryEngine.js','../modules/LetterEngine.js',
  '../modules/Collection.js','../modules/DeckBuilder.js','../modules/FreeBattle.js','../modules/Credits.js',
];
// main.js se vynechává — sám spouští boot(), který potřebuje reálný DOM. Jeho importy jsou výše.

let fail = 0;
for (const m of MODULES) {
  try { await import(m); }
  catch (e) { fail++; console.error(`FAIL  ${m}\n      ${e.constructor.name}: ${e.message}`); }
}

// Ověř klíčové runtime cesty (bez DOM interakce)
try {
  const { default: Locale } = await import('../engine/Locale.js');
  const { default: GameState } = await import('../engine/GameState.js');
  await Locale.apply();
  if (typeof Locale.ui('▶ POKRAČOVAT') !== 'string') throw new Error('Locale.ui nevrací string');
  if (!GameState.settings.language) throw new Error('language nenastaven');
} catch (e) { fail++; console.error(`FAIL  runtime\n      ${e.message}`); }

if (fail === 0) console.log(`✅ SMOKE OK — ${MODULES.length} modulů načteno, runtime cesty OK`);
else { console.error(`\n❌ ${fail} selhání`); process.exit(1); }
