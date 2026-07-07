#!/usr/bin/env python3
"""CONFLUX voice-over generátor — OpenAI TTS (gpt-4o-mini-tts), CZ+EN.
Použití: OPENAI_API_KEY=... python3 tools/gen_voice.py [--only key1,key2] [--force]
Soubory → assets/audio/voice/{cs,en}/<key>.mp3 (existující přeskakuje, --force přepíše).
"""
import json, os, sys, time, urllib.request

VOICES = {
    'SYSTEM':   dict(voice='ash',  instructions='Cold, flat, official machine announcement over a public speaker. Monotone, clipped, zero emotion, slightly compressed. Do not dramatize.'),
    'PROFILER': dict(voice='onyx', instructions='Slow, low, quietly fascinated machine voice studying a subject it finds interesting. Deliberate, small pauses between sentences, calm and unsettling. Never threatening, never loud.'),
    'SIGMA':    dict(voice='onyx', instructions='Extremely slow, extremely deep, monumental machine voice in a vast hall. Absolute calm authority. Each word lands separately, like a verdict.'),
}

# key: (profil, CZ audio, EN audio)
LINES = {
    # ── SYSTÉM (checkpointy, intro) ──
    'intro_letter':      ('SYSTEM',   'Neotvírej ji. Zatím.', "Don't open it. Not yet."),
    'checkpoint_ok':     ('SYSTEM',   'KURÝR. IDENTIFIKACE OK. ZÁSILKA DETEKOVÁNA.', 'COURIER. IDENTIFICATION OK. PARCEL DETECTED.'),
    'checkpoint_fail':   ('SYSTEM',   'IDENTIFIKACE SELHALA. SUBJEKT NEEXISTUJE.', 'IDENTIFICATION FAILED. SUBJECT DOES NOT EXIST.'),
    'synth_monitored':   ('SYSTEM',   'KURÝR BEZ REGISTRACE. PRŮCHOD POVOLEN. MONITORING AKTIVNÍ.', 'UNREGISTERED COURIER. PASSAGE GRANTED. MONITORING ACTIVE.'),
    # ── PROFILER (profil-screen + profilovací barky — texty PŘESNĚ dle GameState.profileBarks) ──
    'profile_found':     ('PROFILER', 'Profil nalezen.', 'Profile found.'),
    'yourcard':          ('PROFILER', 'Poznáváš ji?', 'Do you recognize it?'),
    'p_atk':             ('PROFILER', 'Útočíš první. Pokaždé. Předvídatelné.', 'You attack first. Every time. Predictable.'),
    'p_def':             ('PROFILER', 'Čekáš. Stavíš zeď. Znám ten vzorec.', 'You wait. You build walls. I know that pattern.'),
    'p_synth':           ('PROFILER', 'Synth. Vidím to v každé kartě, kterou zahraješ.', 'Synth. I see it in every card you play.'),
    'p_org':             ('PROFILER', 'Organic. Držíš se paměti. To se dá použít.', 'Organic. You cling to memory. That can be used.'),
    'p_hyb':             ('PROFILER', 'Mícháš strany. Vzácné. Nebezpečné pro protokol.', 'You mix sides. Rare. Dangerous for the protocol.'),
    'p_fuse':            ('PROFILER', 'Riskuješ fúze. Systém si to zapsal.', 'You risk fusions. The system took note.'),
    'p_traps':           ('PROFILER', 'Pasti. Nevěříš přímému boji. Ani sobě.', "Traps. You don't trust open combat. Or yourself."),
    'p_direct':          ('PROFILER', 'Jdeš rovnou po LP. Netrpělivý.', 'You go straight for the life points. Impatient.'),
    'p_rush':            ('PROFILER', 'Spěcháš. Nečteš. To o tobě řekne víc než tvůj deck.', "You rush. You don't read. That says more about you than your deck."),
    'p_slow':            ('PROFILER', 'Váháš. Čteš. Přemýšlíš. Zpomaluje tě to.', 'You hesitate. You read. You think. It slows you down.'),
    'p_order':           ('PROFILER', 'Tvé volby táhnou k řádu. Statisticky.', 'Your choices lean toward order. Statistically.'),
    'p_edge':            ('PROFILER', 'Tvé volby táhnou k okrajům. Ke ztrátě.', 'Your choices lean toward the edges. Toward loss.'),
    'p_loss':            ('PROFILER', 'Necháváš karty padnout. Zvykl sis na ztrátu.', 'You let cards fall. You got used to loss.'),
    # ── SIGMA (akt 10 / rekalibrace) ──
    'sigma_recorded':    ('SIGMA',    'Zaznamenáno.', 'Recorded.'),
    'sigma_updated':     ('SIGMA',    'Zaznamenáno. Profil aktualizován.', 'Recorded. Profile updated.'),
    'sigma_archived':    ('SIGMA',    'Profil archivován.', 'Profile archived.'),
    'sigma_insufficient':('SIGMA',    'Nedostatečné.', 'Insufficient.'),
}

def tts(key, text, prof, lang, outpath, apikey):
    body = json.dumps({
        'model': 'gpt-4o-mini-tts',
        'voice': VOICES[prof]['voice'],
        'input': text,
        'instructions': VOICES[prof]['instructions'] + (' The text is in Czech — pronounce Czech correctly.' if lang == 'cs' else ''),
        'response_format': 'mp3',
    }).encode()
    req = urllib.request.Request('https://api.openai.com/v1/audio/speech', data=body,
        headers={'Authorization': f'Bearer {apikey}', 'Content-Type': 'application/json'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            open(outpath, 'wb').write(data)
            return len(data)
        except Exception as e:
            if attempt == 2: raise
            time.sleep(3 * (attempt + 1))

def main():
    apikey = os.environ.get('OPENAI_API_KEY')
    if not apikey: sys.exit('Chybí OPENAI_API_KEY')
    only = None
    if '--only' in sys.argv: only = set(sys.argv[sys.argv.index('--only')+1].split(','))
    force = '--force' in sys.argv
    ok = fail = skip = 0
    for lang in ('cs', 'en'):
        os.makedirs(f'assets/audio/voice/{lang}', exist_ok=True)
    for key, (prof, cz, en) in LINES.items():
        if only and key not in only: continue
        for lang, text in (('cs', cz), ('en', en)):
            out = f'assets/audio/voice/{lang}/{key}.mp3'
            if os.path.exists(out) and not force: skip += 1; continue
            try:
                n = tts(key, text, prof, lang, out, apikey)
                ok += 1; print(f'  {lang}/{key} OK ({n//1024} kB)')
            except Exception as e:
                fail += 1; print(f'  {lang}/{key} FAIL: {e}')
    print(f'Hotovo: {ok} OK, {fail} FAIL, {skip} přeskočeno')

if __name__ == '__main__':
    main()
