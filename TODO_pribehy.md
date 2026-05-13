# CONFLUX — Příběh: průvodce sesí

> Dokument popisuje celou kampaň jako ji vidíme teď, co před každým bojem chybí nebo nefunguje, a co by tam mělo být. Pracujeme akt po aktu.
>
> Stav: [ ] = potřebuje práci  [✓] = ok  [~] = přijatelné ale dá se zlepšit

---

## CELKOVÝ PŘÍBĚHOVÝ OBLOUK

Kurýr nese dopis. Neví pro koho. Projde systémem, zjistí že dopis je adresovaný jemu samotnému — ale víc než to, zjistí že **on sám je zpráva** (Akt 8 — Rozara). Trasa ho mění. Systém chce ho přepsat. Monyra je součást toho systému, ale bojuje o vlastní svobodu. Nakonec kurýr volí čemu patří: systému (Sigma), přírodě (Pramáti), sobě (Paradox), Monyře (Monyra), nebo syntetické třetí cestě (Lens).

---

## AKT 1: Kurýr
*"Systém funguje. Zatím."*

### Tok aktů
- Intro cutscene (dopis na stole) → město → první checkpoint → Monyra → tutoriál → jméno → ulice → Kellner → volba cesty (Synth / Organic) → Boss

### Bitvy a jejich kontext

---

**[ ] BITVA: `act1_battle_1` — Hlídkový systém (act1_01)**

**Kontext teď:**
`act1_street_observation` — Monyra ukazuje Kellnera na rohu, říká "nepouštěj ho k dopisu". Pak se bojuje s automatickým systémem.

**Problém:**
Hráč se chystá na Kellnera a pak bojuje s automatem. Spojení chybí — není jasné, že jde o checkpoint *před* Kellnerem.

**Co přidat (1-2 řádky):**
Za Monyřinou replikou přidat buď do `act1_street_observation` nebo jako nový uzel:
> *Cesta ke Kellnerovi vede přes hlídkový automat. Sentinel. Nekontroluje totožnost — kontroluje zásilky.*
> MONYRA: Projdi ho. Kellner čeká za ním.

**Jak to opravit:**
Upravit `act1_street_observation` — přidat jeden řádek kontextu na konec, jasně říct že automat je strážce sektoru před Kellnerem.

---

**[✓] BITVA: `act1_battle_2` — Kellner (act1_02)**

`act1_kellner_approach` je výborný. Kellner ví, čeká, konfrontace přímá. Bitva dává smysl.

---

**[✓] BITVA: `act1_battle_3_synth` — Síťový operátor (act1_04)**

`act1_synth_path` vysvětluje kdo stojí na konci a proč ho musíš porazit. OK.

---

**[✓] BITVA: `act1_battle_3_organic` — Lesní stráž — Trojice (act1_03)**

`act1_organic_path` — stráž přímo řekne "ukáž nebo projdi přes nás". OK.

---

**[✓] BITVA: `act1_boss` — Vykonavatel (act1_boss)**

`act1_boss_intro` — Monyra vysvětlí kdo je Vykonavatel a proč je nebezpečný (přesvědčení, ne síla). Výborný setup.

---

## AKT 2: Strana kterou si nevybereš
*"Musíš projít oběma světy. Ani jeden tě nechce."*

### Tok aktů
- Intro → Pohraničník Řeka (boj) → les → Organic rada (boj) → Rozara → volba strany → [Synth: Vaněk / Organic: Marta / Ani jedno: ruiny] → Tichý (boss)

---

**[~] BITVA: `act2_battle_1` — Pohraničník Řeka (act2_01)**

`act2_synth_encounter` je 3 řádky. Přímé, ale hodně strohé.

**Co přidat (1 řádek):**
Stačí jedna věta kontextu navíc — proč Řeka hlídá právě tady:
> *Demarkační linie. Synth ji hlídá proto, aby zabránil neregistrovaným kurýrům přecházet strany bez záznamu.*

Nebo to říká Monyra krátce před nebo po checkpointu.

---

**[~] BITVA: `act2_battle_2` — Lesní rada — Staří (act2_02)**

Kontext dobrý — `act2_forest_observe` + `act2_organic_encounter`. Trochu schematické ale funkční.

---

**[ ] BITVA: `act2_battle_vanek` — Systémový agent Vaněk (act2_03)**

**Kontext teď:**
Po volbě "Jdu se Synthem" jsou 2 řádky:
> VANĚK: Dobrý výběr. Systém ocení.
> MONYRA: Vaněk dělá pro systém věci které systém oficiálně nedělá.

Pak ihned boj.

**Problém:**
Proč vůbec bojuješ s Vaňkem, když jsi zvolil Synth stranu? Syndikát tě k nim poslal, Vaněk tě přivítá... ale pak se perete. Není vysvětleno.

**Co přidat:**
Vaněk tě "testuje" — Synth nevěří kurýrovi na slovo. Nebo: Vaněk má zakázku tě "registrovat" silou, protože kurýr bez registrace je anomálie. Případně: přijal jsi podmínky Synthu, ale podmínky zahrnují "prokázání schopností".

**Návrh dialogu (do `act2_synth_side` nebo nový node):**
> VANĚK: Systém ocení. Ale systém nejdřív otestuje.
> PLAYER: Co to znamená?
> VANĚK: Kurýr bez registrace který volí naši stranu — musí projít ověřením. Standardní.
> MONYRA: Jinými slovy: boj.

---

**[ ] BITVA: `act2_battle_marta` — Hlídač komunity — Marta (act2_04)**

**Kontext teď:**
Po volbě "Jdu s Organic":
> ROZARA: Jdeš naší cestou.
> PLAYER: Jdu svou cestou.
> ROZARA: Zatím je to totéž.

Pak boj s Martou.

**Problém:**
Proč bojuješ s Martou, když jsi zvolil Organic? Marta je přece jejich stráž. Měla by tě testovat nebo propouštět, ne stavět se jako nepřítel.

**Co přidat:**
Marta chrání komunitu od všech cizinců — i od těch co tvrdí že jsou na jejich straně. Kurýr je cizinec. Musí prokázat svůj záměr bojem.

**Návrh dialogu (do `act2_organic_side` nebo nový node před boj):**
> MARTA: Rozara tě posílá.
> PLAYER: Řekla mi přijít.
> MARTA: A ty přišel. To nestačí.
> MARTA: Každý kdo projde komunitou musí ukázat kdo je. Nám. Ne systému.
> MONYRA: Vítej v Organic — kde každý bojuje za právo zůstat.

---

**[ ] BITVA: `act2_battle_ruins` — ??? (reuse act2_01 — PLACEHOLDER)**

**Kontext teď:**
> MONYRA: Staré ruiny. Systém sem nesahá.
> MONYRA: Ale něco tu je. Nebo bylo.

Enemy: `act2_01` = Pohraničník Řeka (přesný recyklát).

**Problém:**
Tohle je evidentní placeholder. Borec co hlídal hranici se znovu objevuje v ruinách kde systém "nesahá". Nedává smysl.

**Co opravit — dvě možnosti:**

*Možnost A: Nový nepřítel — echo konfliktu*
Přiřadit jinému nepříteli (třeba `act2_02` nebo si vytvořit "Zbloudilý strážce") a kontext: tyto ruiny jsou místem starého konfliktu, stále tu bloudí automatické hlídky bez příkazu.

*Možnost B: Přidat kontextový node*
Přidat dialog před bitvu:
> *V troskách stojí postava. Uniform systému. Ale signál: žádný. Hlídá bez příkazu. Automaticky. Proto nebezpečně.*
> MONYRA: Zbytek. Systém ho zapomněl. On to neví.

A změnit enemy na `act2_01` ale s jiným kontextem než "pohraničník Řeka" — nebo dát mu nový name/context.

**Doporučení:** Možnost B je rychlejší a thematicky zajímavá.

---

**[ ] BITVA: `act2_boss` — Správce brány — Tichý (act2_boss)**

**Kontext teď:**
> MONYRA: Tichý. Stojí tu od začátku. Není ze Synthu ani z Organic.
> MONYRA: Je starší než oboje.
> [boss_intro]
> TICHÝ: Tohle není o stranách.
> PLAYER: O čem?
> TICHY: O tom co neseš. A proč to stále neseš.

**Problém:**
Kdo je Tichý? Proč musíš s ním bojovat? Proč je tady na konci aktu? Co se stane když ho prohraješ? Odpovědi nejsou.

**Co přidat:**
`act2_convergence` má 2 řádky a `act2_boss_intro` má 3. Stačí přidat 2-3 řádky do convergence:
> *Obě cesty vedou sem. Na křižovatku. Tady stojí muž co nepatří ani k jedné straně.*
> MONYRA: Tichý. Řeší průchody dávno předtím než tu byl Synth nebo Organic.
> MONYRA: Zná dopis. Ne co v něm je — ale že existuje.
> PLAYER: A propustí mě?
> MONYRA: Pokud ukážeš že víš proč ho neseš.

---

## AKT 3: Most
*"Hybrid Nexus — kde se kódy a kořeny kříží."*

### Tok aktů
- Intro → Stráž přechodu (boj) → Hana — fúze (boj) → Rozara + Romen → reveal zprávy → boss Duelista → Lens → konec

---

**[ ] BITVA: `act3_battle_1` — Přechodný strážce (act3_01)**

**Kontext teď:**
> STRAZCE: Kurýr bez strany.
> PLAYER: A ty?
> STRAZCE: Most. Mosty se šlapou.

3 řádky, boj.

**Problém:**
Proč tě zastavuje? "Mosty se šlapou" je poetické ale není vysvětleno co to znamená — jde o toll? Rituál vstupu? Test?

**Co přidat (1-2 věty úvodu):**
Přidat před dialog cutscene nebo narativní řádek:
> *Nexus má bránu. Nechlidí ji systém ani komunita — hlídá ji někdo bez příslušnosti. Říkají mu Přechodný strážce. Vstup do Nexu si musíš zasloužit.*

Nebo jiný krátký řádek:
> MONYRA: Každý kdo vstoupí do Nexu musí projít přes něj. Říká tomu "mýtné na most".

---

**[✓] BITVA: `act3_battle_hana` — Fúzní duelista Hana (act3_02)**

`act3_fusion_tutorial` + `act3_hana_encounter` — kontext dobrý. Hana demonstruje fúzi. OK.

---

**[ ] BITVA: `act3_boss` — Duelista — Bez jména (act3_boss)**

**Kontext teď:**
`act3_syndicate_hint` (Romen varuje o Syndikátu) → volba přístupu → boss_intro (3 řádky).

**Problém:**
Kdo je Duelista? Proč stojí před Lens? Je to Syndikátní test? Nexusový rituál? Náhodný bojovník?

**Co přidat (do `act3_romen_warning` nebo nový node před volbu):**
> ROMEN: Před Lens stojí duelista. Vždy jiný. Vždy bez jména.
> PLAYER: Proč?
> ROMEN: Nexus testuje záměr. Duelista je test. Pokud neseš dopis s pochopením proč ho neseš — prohraješ. Pokud neseš s odhodláním — projdeš.
> MONYRA: To zní jako výmysl.
> ROMEN: Odpoví akt.

---

## AKT 4: Dluh
*"Syndikát zaplatil za průchod Nexem. Teď chce splátku."*

### Stav: DOBRÝ ✓
Všechny bitvy mají `briefing` nody s jasným kontextem:
- Testovač Nexu → jasné (ověření kurýra)
- Marta → jasné (zakázka + volba + kontext)
- Vymahač 2 → jasné (odmítnutí má cenu)
- Vymahač 3 → jasné (silnější, drž dopis)
- Věřitel → jasné (ocenění schopností)

### Drobnosti:
- `act4_battle_ruins` neexistuje (akt 2 problém přenesen sem) ✓ tohle není v aktu 4

---

## AKT 5: Dopis
*"Eli byl kurýrem před tebou. Dopis byl jeho."*

### Stav: DOBRÝ ✓
Eliho setup je detailní a dobře napsaný. Briefing vysvětluje povahu boje (ztráta záměrná).

---

## AKT 6: Paměť
*"Voit ví. Monyra je součást systému. Co teď?"*

### Stav: DOBRÝ ✓
Agent systému — kontext jasný (nepřišel zastavit tebe, přišel zastavit rozhovor s Voitem). Monyřino odhalení je silné.

---

## AKT 7: Přepis
*"Systém chce změnit to co jsi."*

### Stav: DOBRÝ ✓
Rekalibrátor — výborný setup (hraje tvůj styl obráceně). Správce přepisu — jasné.

---

## AKT 8: Návrat
*"Věřitel splnil slib. Přišel pro Rozaru."*

### Stav: DOBRÝ ✓
Věřitelův return má silný emocionální kontext (Rozara splatí dluh sama).

---

## AKT 9: Pozorovatel
*"Konec trasy. Trasa má tvář."*

### Stav: DOBRÝ ✓
Pozorovatel jako svědek, ne nepřítel. Briefing jasný.

---

## AKT 10: Konvergence
*"Pět možných konců."*

### Stav: DOBRÝ ✓
Všechny větve (Sigma, Pramáti, Paradox, Monyra, Lens) mají intro + briefing. Kontexty jasné.

---

## SHRNUTÍ — CO OPRAVIT

| Priorita | Kde | Co | Stav |
|---|---|---|---|
| 🔴 HIGH | Akt 2 — `act2_battle_ruins` | Kontext zapomenuté hlídky bez příkazu | ✅ hotovo |
| 🔴 HIGH | Akt 2 — `act2_battle_vanek` | Vaněk testuje kurýra — vysvětlení přidáno | ✅ hotovo |
| 🔴 HIGH | Akt 2 — `act2_battle_marta` | Marta hlídá vstup komunity — vysvětlení přidáno | ✅ hotovo |
| 🟠 MED | Akt 2 — `act2_boss` Tichý | Kdo je + proč musíš projít — přidáno | ✅ hotovo |
| 🟠 MED | Akt 3 — `act3_battle_1` Stráž | Mýtné na most + Monyra komentář — přidáno | ✅ hotovo |
| 🟠 MED | Akt 3 — `act3_boss` Duelista | Romen intro o Duelistovi před Lens — přidáno | ✅ hotovo |
| 🟡 LOW | Akt 1 — `act1_battle_1` | Narativní řádek + Monyra finální — přidáno | ✅ hotovo |
| 🟡 LOW | Akt 2 — `act2_battle_1` | Řeka hlídá demarkační linii — přidáno | ✅ hotovo |

---

## POSTUP

Jdeme od akt 1 dopředu. Pro každou `🔴`/`🟠` položku:
1. Zapsat dialog (česky, styl odpovídá zbytku hry — krátké věty, přímé)
2. Přidat nebo upravit node v `campaign.js`
3. Otestovat v prohlížeči
