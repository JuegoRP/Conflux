/**
 * Config — build-level přepínače.
 * DEMO build: nastav DEMO = true → hra se zamkne po posledním demo aktu (paywall).
 * Full build: DEMO = false. Jeden zdroj, jeden build — žádný druhý demo build na údržbu.
 * (Release plán: itch.io free demo prvních 2 aktů → $10 za plnou hru; stejný mechanismus pro Steam Next Fest.)
 */
export const DEMO = false;
export const DEMO_LAST_ACT = 2;   // demo zpřístupní akty 1..2, pak paywall
export const BUY_URL = 'https://juegorp.itch.io/conflux'; // odkaz na plnou verzi (uprav dle itch stránky)
export const DEV = true;          // true = DEV tlačítko v menu (skip do bitvy ap.). VE VYDÁNÍ false!
