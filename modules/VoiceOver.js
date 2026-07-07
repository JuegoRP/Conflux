/**
 * VoiceOver — mluvené slovo systémových hlasů (SYSTÉM / PROFILER / SIGMA).
 * Diegetické TTS: mluví jen stroje, lidé ne. Soubory assets/audio/voice/{cs,en}/<key>.mp3,
 * jazyk dle GameState.settings.language. Mapa páruje PŘESNÉ herní texty → klíč souboru,
 * takže maybeSay(text) je bezpečné volat na cokoli (nenamapované texty tiše ignoruje).
 * Generátor linek: tools/gen_voice.py (zdroj pravdy pro texty souborů).
 */
import GameState from '../engine/GameState.js';

// přesný herní text → klíč voice souboru
const MAP = {
  // intro + checkpointy (SYSTÉM)
  'Neotvírej ji.': 'intro_letter', // soubor obsahuje „Neotvírej ji. Zatím."
  'KURÝR. IDENTIFIKACE OK. ZÁSILKA DETEKOVÁNA.': 'checkpoint_ok',
  'IDENTIFIKACE SELHALA. SUBJEKT NEEXISTUJE.': 'checkpoint_fail',
  'KURÝR BEZ REGISTRACE. PRŮCHOD POVOLEN. MONITORING AKTIVNÍ.': 'synth_monitored',
  // profilovací barky (PROFILER) — texty přesně dle GameState.profileBarks()
  'Útočíš první. Pokaždé. Předvídatelné.': 'p_atk',
  'Čekáš. Stavíš zeď. Znám ten vzorec.': 'p_def',
  'Synth. Vidím to v každé kartě, kterou zahraješ.': 'p_synth',
  'Organic. Držíš se paměti. To se dá použít.': 'p_org',
  'Mícháš strany. Vzácné. Nebezpečné pro protokol.': 'p_hyb',
  'Riskuješ fúze. Systém si to zapsal.': 'p_fuse',
  'Pasti. Nevěříš přímému boji. Ani sobě.': 'p_traps',
  'Jdeš rovnou po LP. Netrpělivý.': 'p_direct',
  'Spěcháš. Nečteš. To o tobě řekne víc než tvůj deck.': 'p_rush',
  'Váháš. Čteš. Přemýšlíš. Zpomaluje tě to.': 'p_slow',
  'Tvé volby táhnou k řádu. Statisticky.': 'p_order',
  'Tvé volby táhnou k okrajům. Ke ztrátě.': 'p_edge',
  'Necháváš karty padnout. Zvykl sis na ztrátu.': 'p_loss',
  // Sigma / rekalibrace (SIGMA)
  'ZAZNAMENÁNO.': 'sigma_recorded',
  'ZAZNAMENÁNO. PROFIL AKTUALIZOVÁN.': 'sigma_updated',
  'PROFIL ARCHIVOVÁN.': 'sigma_archived',
  'NEDOSTATEČNÉ.': 'sigma_insufficient',
};

const VoiceOver = {
  _current: null,

  /** Přehraj konkrétní klíč (programové spouštěče: profile_found, yourcard…) */
  say(key) {
    if(!key) return;
    const lang = GameState.settings?.language === 'en' ? 'en' : 'cs';
    try {
      if(this._current) { this._current.pause(); this._current = null; }
      const a = new Audio(`assets/audio/voice/${lang}/${key}.mp3`);
      a.volume = Math.min(1, GameState.settings?.sfxVolume ?? 0.8);
      a.play().catch(() => {}); // autoplay policy — tiše ignoruj
      this._current = a;
    } catch(e) { /* voice je bonus, nikdy neshodí hru */ }
  },

  /** Přehraj, pokud text odpovídá namapované lince; jinak nic. */
  maybeSay(text) {
    const key = MAP[(text || '').trim()];
    if(key) this.say(key);
  },

  stop() {
    if(this._current) { this._current.pause(); this._current = null; }
  },
};

export default VoiceOver;
