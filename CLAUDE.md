# CLAUDE.md — CONFLUX

Narativní karetní hra (vanilla JS, ES modules). 10 aktů, 5 konců, korupce jako mechanika. **Stav: beta-polish, cíl: Itch.io srpen 2026.**

**Zdroje pravdy (čti na začátku session):** `TODO.md` (úkoly), `TODO_pribehy.md` (per-battle story review), `DESIGN.md` (game design).

## Architektura — pravidla

- **Moduly komunikují VÝHRADNĚ přes EventBus** (`engine/EventBus.js`) — nikdy přímé volání mezi moduly
- Modul pattern: `init(container, params)` / `destroy()` — **`destroy()` MUSÍ zastavit hudbu (`AudioSystem.stopMusic`) a zrušit všechny timery** (typewriter chainy, forcedLoss timery — historicky zdroj bugů)
- Fonty přes CSS proměnné `var(--px)`, `var(--mono)`, `var(--vt)` z `styles/global.css` — žádné lokální definice
- Korupce: změny emitovat přes `corruption:change` (CorruptionSystem → CorruptionVisuals)
- Data jsou JS moduly (`data/cards.js`, `campaign.js`, `enemies.js`) — ne JSON
- Story uzly: jména postav bez diakritiky (pramati, veritel, spravce)

## Herní pravidla (neporušovat při změnách BattleSystem)

- Limit 1 karta za tah (všechny typy), sjednoceno v `cardPlayedThisTurn`
- ATK vs DEF: útočník odražen (zůstává na poli), pouze LP damage
- Trapy a arény hrané na pole jsou face-down; AI o nich nesmí „vědět"
- Bonusy arén platí OBĚMA stranám a i pro karty zahrané po aktivaci

## Testování

```bash
python3 -m http.server 8080
```

## Na konci každé session

1. Zaškrtni hotové v `TODO.md` s datem: `[x] Hotovo (RRRR-MM-DD)`; story změny promítni do `TODO_pribehy.md`
2. Změnila-li se fáze, aktualizuj README sekci „Stav projektu"
3. **Připomeň Romanovi aktualizovat `projects.json`** (admin.romanpavlorek.eu) — n8n agenti z něj čtou živý stav; zastaralý kontext = špatné výstupy celého studia
