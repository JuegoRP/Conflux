# CONFLUX — Audio plán (hudba + stingery + mluvené slovo)

Hra vychází CZ + EN → **všechny voice linky ve dvou jazycích**, přehrávání podle `GameState.settings.language`.
Hudební identita: melancholická blízká budoucnost, prolínání organického (dřevo, dech, smyčce, přírodní perkuse)
a syntetického (analog synth, puls, jemný glitch). Žádný epos, žádná fantasy — **civilní, tichá tíha**.

Prompty u tracků jsou v angličtině — přímo použitelné pro Suno/Udio/StableAudio.

---

## 1. TRACKY (loopy, 1:30–2:30, bezešvý loop)

### Akt 1 — první dojem
| Soubor | Jak má znít | Prompt (EN) |
|---|---|---|
| `act1_intro` | Ráno v tenkých zdech. Skoro ticho — vzdálený hukot města, jeden opakující se klavírní tón, pod tím sotva slyšitelný synth pad. Napětí z každodennosti, ne z hrozby. | slow ambient, sparse single piano notes over distant city hum, faint analog pad, morning stillness, quiet tension, minimalist, melancholic, seamless loop |
| `act1_battle` | Civilní duel — suchý puls (tlumený kick + tikání jako skener), krátká synth figura, žádná sláva. Boj jako úřední úkon. | mid-tempo minimal electronic pulse, muted kick, ticking scanner percussion, short cold synth motif, bureaucratic tension, restrained, seamless loop |
| `act1_boss_intro` | 20–30 s, ne loop. Kovová brána bez světla: jeden hluboký drone, vzdálený úder kovu, stoupající sub. Zastaví se těsně před vrcholem — boj pak „dopadne". | short dark cinematic build, 25 seconds, low metal drone, distant anvil hits, rising sub bass, stops abruptly at the edge of climax, no melody |
| `act1_boss` | Vykonavatel: pomalý těžký rytmus (půlka tempa battle), kovové perkuse, chladná basová linka. Přesvědčení, ne vztek. | slow heavy industrial rhythm, metallic percussion, cold bass line, relentless conviction, dark electronic, half-time feel, seamless loop |
| `act1_end` | Za bránou. Stejný klavírní motiv jako intro, ale prázdnější prostor, delší dozvuk, pod tím poprvé JEMNĚ organický tón (smyčec/dech). Svět se otevřel. | sparse piano motif in large empty reverb, first hint of a soft bowed string underneath, sense of threshold crossed, ambient, melancholic hope, seamless loop |

### Akt 5 — Eli (emoční vrchol)
| Soubor | Jak má znít | Prompt (EN) |
|---|---|---|
| `act5_eli_theme` | Opuštěná stanice, člověk co čekal cykly. Osamělý motiv (elektrické piano nebo kytara s páskovým wow), praskání jako stará nahrávka, dlouhé pauzy. Paměť, ne smutek. | lonely electric piano or tape-warped guitar motif, vinyl crackle, long silences between phrases, abandoned train station at dusk, memory and patience, ambient, seamless loop |
| `act5_eli_battle` | Boj, který MÁŠ prohrát (forcedLoss). Krásné a zdrcující zároveň: pomalé smyčce nabírají vrstvy, pod tím neúprosný puls — hráč cítí, že se topí, ale hudba ho lituje. | slow building layered strings over an inexorable electronic pulse, overwhelming yet sorrowful, you are meant to lose this fight, tragic beauty, cinematic, seamless loop |

### Korupce — první setkání
| Soubor | Jak má znít | Prompt (EN) |
|---|---|---|
| `early_glitch` | První trhlina. Normální ambient, který se každých pár taktů „zadrhne" — časová smyčka, obrácený vzorek, detune. Krátce, jako by se nic nestalo. | calm ambient loop that briefly stutters and detunes every few bars, reversed micro-samples, tape glitch, wrongness passing quickly, unsettling but quiet, seamless loop |
| `early_silence` | Ticho před bouří. Skoro nic: room tone, vzdálený vítr, jeden dlouhý tón na hranici slyšitelnosti, občas puls sub-basu jako tep. | near-silence, room tone and distant wind, one sustained tone at the edge of hearing, occasional deep sub pulse like a heartbeat, dread in stillness, seamless loop |

### Monyra — jeden motiv, tři proměny (hudební vyprávění)
Stejná melodie (krátký, váhavý motiv ~5 tónů), tři aranže podle jejího oblouku:
| Soubor | Jak má znít | Prompt (EN) |
|---|---|---|
| `act6_monyra_theme` | Motiv hraný CHLADNĚ — čistý synth, kvantizovaný, bez rubata. Je součást protokolu a právě to přiznala. | short hesitant five-note melody played by a cold quantized synth, precise, emotionless delivery of an emotional theme, ambient electronic, seamless loop |
| `act8_monyra_theme` | Stejný motiv, ale hraje ho „lidský" nástroj (cello/klavír) s rubatem a chybami, synth jen doprovází. Učí se být někým. | the same five-note melody now played by imperfect human cello and piano with rubato, the synth reduced to a supporting pad, becoming someone, warm melancholic, seamless loop |
| `act9_monyra_theme` | Motiv rozložený: půl věty klavír, půl synth, střídají se a nakonec hrají SPOLU v oktávách. Ani stroj, ani člověk. | the melody split between piano and synth trading phrases, finally playing together in octaves, neither machine nor human, fragile resolution, ambient, seamless loop |

### Finále
| Soubor | Jak má znít | Prompt (EN) |
|---|---|---|
| `act10_boss_paradox` | Boj se sebou. Dvě identické vrstvy téhož tracku, druhá o pár ms posunutá a zrcadlově panovaná — flanger/kanón efekt „hraješ proti své ozvěně". Tempo battle tracků, ale dutější. | a battle theme fighting its own echo, identical layers offset by milliseconds and mirror-panned, phasing canon effect, hollow driving electronic rhythm, fighting yourself, seamless loop |

### Konce (2:00–3:00, NE loop — mají konec)
| Soubor | Konec | Jak má znít | Prompt (EN) |
|---|---|---|---|
| `act10_ending_a` | Sigma / asimilace | Dokonale čistý, kvantizovaný synth chorál. Krásné a mrtvé. Poslední tón digitálně usekne. | perfect quantized synthetic choir, beautiful and lifeless, machine hymn, final note cut digitally, 2-3 minutes, cinematic ending |
| `act10_ending_b` | Pramáti / kořeny | Jen organika: smyčce, dřevěné perkuse, dech, ptáci pod tím. Teplé, ale pohlcující — splynutí, ne vítězství. | purely organic instrumentation, warm strings, wooden percussion, breath, faint birdsong, absorbing embrace rather than victory, 2-3 minutes, cinematic ending |
| `act10_ending_c` | Paradox / sám sebou | Motiv hráče (klavír z act1_intro!) hraný najednou oběma rukama v protipohybu, sólo, bez doprovodu. Zůstal jsi svůj. | solo piano playing the game's opening motif in contrary motion between both hands, no accompaniment, self contained, bittersweet resolve, 2 minutes, cinematic ending |
| `act10_ending_d` | Monyra / čtvrtá cesta | Monyřin motiv + klavír hráče v duetu, poprvé celá harmonie. Jediný konec, který smí znít nadějně. | the five-note companion theme and the opening piano motif in duet, full warm harmony for the first time, quiet hope, 2-3 minutes, cinematic ending |
| `act10_ending_e` | Lens / konvergence | Synth a organika střídavě po frázích, nakonec současně — most drží. Slavnostní, ale nejisté (nerozřešený závěrečný akord). | synth and organic instruments alternating phrases then playing together, a bridge holding, ceremonial but ending on an unresolved chord, 2-3 minutes, cinematic ending |
| `act10_ending_f` | Korupce / trhlina | Všechny předchozí motivy současně, rozladěné, přes sebe, pomalu se trhající do šumu. Konec = čistý room tone z early_silence. | all previous themes overlapping and detuning, slowly tearing into noise, resolving into empty room tone, disintegration, 2-3 minutes, cinematic ending |

---

## 2. STINGERY — krátké, pro efekt (1–6 s, one-shot)

| Soubor | Kdy hraje | Jak má znít | Prompt (EN) |
|---|---|---|---|
| `sting_profile` | Profil-screen se otevře | Skener: rychlý sweep zdola nahoru + tik-tik-tik jak naskakují řádky, konec suchý „lock" klik. ~3 s | short scanner sweep rising, rapid soft ticks like text lines appearing, ending with a dry lock click, 3 seconds, UI sting, cold electronic |
| `sting_yourcard` | Label „TVOJE KARTA" | Znepokojivé „poznání": tvůj vlastní tón zahraný zpět s reverzním dozvukem. ~1.5 s | a single familiar note played in reverse with an eerie short tail, uncanny recognition, 1.5 seconds, sting |
| `sting_corruption` | Korupce +1 | Prasknutí reality: sklo + pásek roztažený do detune, sub „žuchnutí". ~2 s | reality crack, glass fracture blended with tape detune drop and a deep sub thud, 2 seconds, dark sting |
| `sting_act_title` | Establishing scéna aktu | Filmový nádech: jeden teplý akord smyčce+synth, vzedme se a nechá doznít. ~4 s | single warm swelling chord of strings and synth, cinematic act title card, blooms and decays naturally, 4 seconds |
| `sting_letter` | Otevření dopisu/holo | Papír + jemné elektrické bzučení hologramu, nakonec čistý vysoký tón jako zaostření. ~3 s | paper unfolding blended with a soft holographic electric hum, ending on a clear high focusing tone, 3 seconds, intimate |
| `sting_victory` | Výhra duelu | Krátká vzestupná figura (3 tóny) v jazyce hry — napůl synth, napůl smyčec. Uspokojení bez fanfáry. ~2.5 s | short three-note rising resolution, half synth half string, satisfying but understated, no fanfare, 2.5 seconds |
| `sting_defeat` | Prohra duelu | Tytéž 3 tóny obráceně a o půltón níž, dozvuk do ticha. ~3 s | the same three notes descending a semitone lower, decaying into silence, quiet defeat, 3 seconds |
| `sting_fusion` | Úspěšná fúze | Dva odlišné tóny (kov / dřevo) sjedou do jednoho unisono s krátkým zábleskem. ~2 s | two distinct tones metallic and wooden gliding into one unison with a brief shimmer, fusion, 2 seconds |
| `sting_bark` | Systémový bark/titulek | Sotva slyšitelný „ping" jako notifikace ze staré ústředny. ~0.5 s | a faint single ping like an old switchboard notification, dry, 0.5 seconds |
| `sting_coin` | Coinflip dopad | Mince z kovu i dřeva zároveň — dopad, krátká rotace, dolehnutí. ~2 s | a coin of both metal and wood landing, short spin rattle, settle, 2 seconds, tactile |

---

## 3. MLUVENÉ SLOVO (CZ + EN) — „systém mluví"

**Princip:** dabují se JEN strojové/systémové hlasy — TTS je tu **diegetické** (systém MÁ znít syntetěji).
Lidské postavy (Monyra, Eli, Rozara…) se NEdabují. Tři hlasové profily:

- **SYSTÉM** — neutrální, úřední, lehce komprimovaný (checkpointy, UI). Rychlost 1.0.
- **PROFILER** — pomalejší, „zaujatý" (profil-readouty Správce/Pozorovatele). Rychlost 0.9, níž posazený.
- **SIGMA** — nejhlubší, nejpomalejší, s dozvukem sálu (akt 10). Rychlost 0.8 + reverb.

Soubory: `assets/audio/voice/{cs,en}/<klíč>.mp3` — přehrávání dle `GameState.settings.language`.
Generace: OpenAI TTS (`ash`/`onyx`) nebo ElevenLabs (lepší čeština); post: lehký bitcrush/chorus na SYSTÉM.

| Klíč | Spouštěč | CZ | EN | Hlas |
|---|---|---|---|---|
| `intro_letter` | pre_menu intro | „Neotvírej ji. Zatím." | "Don't open it. Not yet." | SYSTÉM |
| `checkpoint_ok` | act1 checkpoint | „Kurýr. Identifikace v pořádku." | "Courier. Identification confirmed." | SYSTÉM |
| `checkpoint_fail` | act1 scéna s mužem | „Identifikace selhala. Subjekt neexistuje." | "Identification failed. Subject does not exist." | SYSTÉM |
| `profile_found` | otevření profil-screenu | „Profil nalezen." | "Profile found." | PROFILER |
| `profile_attack` | profil-bark (agrese) | „Útočíš první. Pokaždé." | "You attack first. Every time." | PROFILER |
| `profile_defense` | profil-bark (obrana) | „Schováváš se za obranu. Systém to vidí." | "You hide behind defense. The system sees it." | PROFILER |
| `profile_synth` | profil-bark (synth karty) | „Synth. Vidím to v každé kartě." | "Synth. I see it in every card." | PROFILER |
| `profile_organic` | profil-bark (organic karty) | „Kořeny. Držíš se jich." | "Roots. You cling to them." | PROFILER |
| `profile_rush` | profil-bark (spěch) | „Spěcháš. Nečteš." | "You rush. You don't read." | PROFILER |
| `profile_fusion` | profil-bark (fúze) | „Spojuješ. Nikdy nespokojen s tím, co máš." | "You fuse. Never content with what you have." | PROFILER |
| `yourcard` | první „TVOJE KARTA" v boji | „Poznáváš ji?" | "Do you recognize it?" | PROFILER |
| `sigma_recorded` | Sigma bark | „Zaznamenáno." | "Recorded." | SIGMA |
| `sigma_archived` | výhra/prohra akt 10a | „Profil archivován." | "Profile archived." | SIGMA |
| `sigma_insufficient` | prohra akt 10a | „Nedostatečné." | "Insufficient." | SIGMA |

**Pozn. k dynamickým profil-barkům:** `GameState.profileBarks()` vrací konečnou množinu vět → každá dostane
svůj voice soubor (mapování klíč→věta), žádné runtime TTS. Až přibude EN lokalizace textů, voice EN už bude hotový.

---

## 4. Pořadí výroby (dopad / úsilí)

1. **Stingery** (11 ks, sekundy audia) — okamžitě zvednou pocit z UI a boje
2. **Konce A–F** (6 tracků) — nejplošší místo hry dnes
3. **Voice balík CZ+EN** (14 linek × 2 jazyky, TTS ~hodina práce) — „wow" moment profilu
4. **act10_boss_paradox + act1 sada** — rámují hru
5. **Eli + Monyra motivy** — emoční hloubka
6. glitch/silence — dokreslení
