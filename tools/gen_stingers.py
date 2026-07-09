#!/usr/bin/env python3
"""CONFLUX stingery — syntéza čistým Pythonem (bez závislostí), WAV → afconvert m4a.
Zadání zvuků: AUDIO_PLAN.md sekce 2. Spuštění: python3 tools/gen_stingers.py
"""
import math, random, struct, subprocess, wave, os

SR = 44100
random.seed(7)

def buf(sec): return [0.0] * int(SR * sec)

def add_sine(b, t0, dur, f0, f1=None, amp=0.2, attack=0.01, decay=None, phase=0.0):
    """Sinus s lineárním sweepem f0→f1, obálka attack + exp decay."""
    n0, n = int(t0 * SR), int(dur * SR)
    f1 = f1 if f1 is not None else f0
    ph = phase
    for i in range(n):
        t = i / SR
        f = f0 + (f1 - f0) * (i / n)
        ph += 2 * math.pi * f / SR
        env = min(1.0, t / attack) if attack > 0 else 1.0
        if decay: env *= math.exp(-t / decay)
        j = n0 + i
        if 0 <= j < len(b): b[j] += amp * env * math.sin(ph)

def add_noise(b, t0, dur, amp=0.2, decay=None, lp=0.0):
    """Šum, volitelně jednoduchý lowpass (0..0.99)."""
    n0, n = int(t0 * SR), int(dur * SR)
    y = 0.0
    for i in range(n):
        t = i / SR
        x = random.uniform(-1, 1)
        y = lp * y + (1 - lp) * x
        env = math.exp(-t / decay) if decay else 1.0
        j = n0 + i
        if 0 <= j < len(b): b[j] += amp * env * y

def write(name, b):
    peak = max(1e-9, max(abs(x) for x in b))
    norm = 0.89 / peak
    wav = f'/tmp/{name}.wav'
    with wave.open(wav, 'w') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, x * norm)) * 32767)) for x in b))
    out = f'assets/audio/sfx/{name}.m4a'
    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', wav, out], check=True, capture_output=True)
    os.remove(wav)
    print(f'  {out} ({len(b)/SR:.1f}s)')

# ── sting_profile: skener — sweep nahoru, tiky řádků, lock klik ──
b = buf(3.0)
add_sine(b, 0.0, 1.1, 180, 1400, amp=0.22, attack=0.05, decay=0.9)
add_sine(b, 0.0, 1.1, 360, 2800, amp=0.06, attack=0.05, decay=0.9)   # oktáva pro lesk
for k in range(6):                                                    # tiky naskakujících řádků
    add_noise(b, 1.15 + k * 0.16, 0.014, amp=0.30, decay=0.004, lp=0.4)
add_noise(b, 2.35, 0.010, amp=0.5, decay=0.003)                       # lock klik
add_sine(b, 2.35, 0.28, 130, 110, amp=0.30, attack=0.002, decay=0.07) # suchý thump
write('sting_profile', b)

# ── sting_corruption: krátké tiché prasknutí (v2 — dřív 2s a ostré, rušilo) ──
b = buf(0.7)
add_noise(b, 0.0, 0.03, amp=0.30, decay=0.007, lp=0.35)               # měkčí crack
add_sine(b, 0.02, 0.35, 300, 250, amp=0.10, attack=0.01, decay=0.10)  # krátký detune tón
add_sine(b, 0.02, 0.45, 60, 48, amp=0.32, attack=0.004, decay=0.12)   # kratší sub
write('sting_corruption', b)

# ── sting_act_title: teplý akord smyčce+synth, nádech a doznění ──
b = buf(4.0)
for f, a in ((146.83, 0.16), (220.0, 0.13), (293.66, 0.12), (369.99, 0.09)):  # D–A–D–F#
    add_sine(b, 0.0, 3.9, f, f, amp=a, attack=1.1, decay=1.4)
    add_sine(b, 0.0, 3.9, f * 1.003, f, amp=a * 0.5, attack=1.3, decay=1.4)   # detune vrstva = šíře
add_noise(b, 0.0, 3.5, amp=0.03, decay=1.2, lp=0.97)                          # dech vzduchu
write('sting_act_title', b)

# ── sting_coin: mince z kovu i dřeva — ping, rotace, dopad, usazení ──
b = buf(2.0)
for f, a in ((2093, 0.30), (2793, 0.14), (3520, 0.08)):               # kovový ping (inharm.)
    add_sine(b, 0.0, 0.6, f, f, amp=a, attack=0.001, decay=0.14)
for f, a in ((2093, 0.16), (2793, 0.08)):                             # druhý slabší (rotace)
    add_sine(b, 0.38, 0.4, f, f, amp=a, attack=0.001, decay=0.10)
add_sine(b, 0.9, 0.35, 190, 90, amp=0.45, attack=0.002, decay=0.08)   # dřevěný dopad
add_noise(b, 0.9, 0.03, amp=0.2, decay=0.008, lp=0.6)
add_sine(b, 1.35, 0.18, 160, 120, amp=0.18, attack=0.002, decay=0.045) # dosednutí
write('sting_coin', b)

# ── sting_bark: nenápadný ping staré ústředny ──
b = buf(0.45)
add_sine(b, 0.0, 0.4, 1180, 1180, amp=0.16, attack=0.004, decay=0.09)
add_sine(b, 0.0, 0.3, 2360, 2360, amp=0.05, attack=0.004, decay=0.06)
write('sting_bark', b)

# ── sting_yourcard: tvůj tón pozpátku — rostoucí obálka, tvrdý střih ──
b = buf(1.5)
n = int(1.25 * SR)
ph1 = ph2 = 0.0
for i in range(n):
    t = i / SR
    env = (t / 1.25) ** 2.2                                            # reverzní (rostoucí) obálka
    ph1 += 2 * math.pi * 523.25 / SR
    ph2 += 2 * math.pi * 622.25 / SR                                   # malá tercie = neklid
    b[i] += env * (0.26 * math.sin(ph1) + 0.12 * math.sin(ph2))
add_noise(b, 1.25, 0.05, amp=0.10, decay=0.015, lp=0.5)                # střihový svist
write('sting_yourcard', b)

# ── sting_letter: papír + holo bzučení + zaostřovací tón ──
b = buf(3.0)
for k in range(9):                                                     # šustění papíru
    add_noise(b, 0.05 + k * 0.11, 0.05, amp=0.12 + 0.05 * (k % 2), decay=0.02, lp=0.75)
add_sine(b, 0.5, 2.3, 110, 110, amp=0.07, attack=0.4, decay=1.0)       # hum
add_sine(b, 0.5, 2.3, 165, 165, amp=0.04, attack=0.4, decay=1.0)
add_sine(b, 2.1, 0.8, 1568, 1568, amp=0.12, attack=0.15, decay=0.25)   # zaostření (G6)
write('sting_letter', b)

print('Hotovo.')
