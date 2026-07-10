#!/usr/bin/env python3
"""CONFLUX — QA tester celého průchodu (statická integrita + herní data).
Kontroluje: reference nodů, dosažitelnost, slepé konce, battle→enemy, pozadí→soubor,
music klíče, giveCard/cardId→karta, prázdné volby, {{tokeny}}, portréty speakerů.
Spuštění: python3 tools/qa_playthrough.py
"""
import json, re, os
from collections import deque

def load(path, pattern):
    return json.loads(re.search(pattern, open(path).read(), re.S).group(1))

d = load('data/campaign.js', r'export\s+const\s+CAMPAIGN_DATA\s*=\s*(\{.*\})\s*;?\s*$')
cards = load('data/cards.js', r'export const CARDS_DATA = (\{.*\})\s*;?\s*$')
enemies = load('data/enemies.js', r'export const ENEMIES_DATA = (\{.*\})\s*;?\s*$')
gs = open('engine/GameState.js').read()
se = open('modules/StoryEngine.js').read()

BYID = {n['id']: n for a in d['acts'] for n in a['nodes']}
CARD_IDS = {c['id'] for c in cards['cards']}
ENEMY_IDS = {e['id'] for e in enemies['enemies']}
MUSIC_KEYS = set(re.findall(r"^\s*([a-z0-9_]+):\s*'assets/audio", gs, re.M))
BG_REAL = set(re.findall(r"'([a-z0-9_]+)'", re.search(r'_bgReal:\s*new Set\(\[(.*?)\]\)', se, re.S).group(1)))
BG_ALIAS = {m.group(1): m.group(2) for m in re.finditer(r"'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'",
            re.search(r'_bgAlias:\s*\{(.*?)\n  \},', se, re.S).group(1))}
BG_FILES = {os.path.splitext(f)[0] for f in os.listdir('assets/images/backgrounds')}
PORTRAITS = {os.path.splitext(f)[0] for f in os.listdir('assets/images/portraits')}
SPEAKER_MAP = set(re.findall(r"^\s*([a-z_]+):\s*\{", re.search(r'_speakerMap\s*=?\s*[:=]?\s*\{(.*?)\n  \}', se, re.S).group(1), re.M)) if re.search(r'_speakerMap', se) else set()
TOKENS_OK = {'player.name', 'profile', 'player.faction'}

issues = {'CHYBA': [], 'VAROVÁNÍ': []}
MISSING_MUSIC = set()
def err(msg): issues['CHYBA'].append(msg)
def warn(msg): issues['VAROVÁNÍ'].append(msg)

# ── 1) reference + obsah nodů ──
def refs_of(n):
    out = []
    for k in ('next', 'onWin', 'onLose'):
        if n.get(k): out.append((k, n[k]))
    for i, c in enumerate(n.get('choices') or []):
        if c.get('next'): out.append((f'choice[{i}]', c['next']))
    for i, b in enumerate(n.get('branchOn') or []):
        if b.get('next'): out.append((f'branch[{i}]', b['next']))
    cc = n.get('corruptionCheck') or {}
    if cc.get('redirect'): out.append(('corruptionCheck', cc['redirect']))
    return out

for nid, n in BYID.items():
    for src, tgt in refs_of(n):
        if tgt not in BYID: err(f'{nid}: {src} → neexistující nod "{tgt}"')
    t = n['type']
    if t == 'battle':
        eid = n.get('enemyId') or n.get('enemy')
        if not eid: err(f'{nid}: battle bez enemyId')
        elif eid not in ENEMY_IDS: err(f'{nid}: enemyId "{eid}" není v enemies.js')
        if not (n.get('onWin') or n.get('next')): err(f'{nid}: battle bez onWin/next')
    if t == 'choice' or n.get('choices'):
        for i, c in enumerate(n.get('choices') or []):
            if not (c.get('text') or '').strip(): err(f'{nid}: volba [{i}] má prázdný text')
            if not c.get('next'): err(f'{nid}: volba [{i}] ("{(c.get("text") or "")[:30]}") nemá next')
    bg = n.get('background')
    if bg:
        eff = bg if bg in BG_REAL else BG_ALIAS.get(bg, bg)
        if eff not in BG_FILES: err(f'{nid}: pozadí "{bg}" → "{eff}" neexistuje jako soubor')
    mus = n.get('music')
    if mus and mus not in MUSIC_KEYS:
        MISSING_MUSIC.add(mus)
    for card_field in ('giveCard', 'cardId'):
        cid = n.get(card_field)
        if cid is not None and cid not in CARD_IDS: err(f'{nid}: {card_field}={cid} není v cards.js')
    # tokeny + speakeři
    texts = [f.get('text', '') for f in n.get('frames') or []] \
          + [l.get('text', '') for l in (n.get('lines') or []) + (n.get('setup') or [])] \
          + [c.get('text', '') for c in n.get('choices') or []]
    for tx in texts:
        for tok in re.findall(r'\{\{([a-z._]+)\}\}', tx or ''):
            if tok not in TOKENS_OK: err(f'{nid}: neznámý token {{{{{tok}}}}}')
    for l in (n.get('lines') or []) + (n.get('setup') or []):
        sp = l.get('speaker')
        if sp and sp not in ('system', 'player') and sp not in PORTRAITS and sp not in SPEAKER_MAP:
            warn(f'{nid}: speaker "{sp}" nemá portrét ani mapping')

# ── 2) dosažitelnost od začátku ──
start = 'pre_menu_intro' if 'pre_menu_intro' in BYID else 'act1_intro'
seen = set(); q = deque([start, 'act1_intro'])
while q:
    nid = q.popleft()
    if nid in seen or nid not in BYID: continue
    seen.add(nid)
    for _, tgt in refs_of(BYID[nid]): q.append(tgt)
unreachable = [nid for nid in BYID if nid not in seen]
for nid in unreachable: warn(f'nedosažitelný nod: {nid} ({BYID[nid]["type"]})')

# ── 3) slepé konce (mimo koncové typy) ──
TERMINAL = ('_ending',)
TERMINAL_IDS = {'pre_menu_intro', 'letter'}  # engine je řeší speciálně (menu / LetterEngine)
for nid, n in BYID.items():
    if nid in seen and not refs_of(n) and not nid.endswith(TERMINAL) \
       and n['type'] not in ('ending', 'letter') and nid not in TERMINAL_IDS:
        err(f'slepý konec: {nid} ({n["type"]}) — žádné pokračování')

# ── 4) enemy sanity: decky odkazují na existující karty ──
for e in enemies['enemies']:
    bad = [cid for cid in e.get('deck', []) if cid not in CARD_IDS]
    if bad: err(f'enemy {e["id"]}: deck odkazuje na neexistující karty {sorted(set(bad))[:6]}')

if MISSING_MUSIC:
    print(f'♫ hudební klíče bez souboru ({len(MISSING_MUSIC)}) — hrají default, seznam pro Suno:')
    print('  ', ', '.join(sorted(MISSING_MUSIC)))
print(f'Zkontrolováno: {len(BYID)} nodů, {len(ENEMY_IDS)} nepřátel, {len(CARD_IDS)} karet')
for sev in ('CHYBA', 'VAROVÁNÍ'):
    print(f'\n═══ {sev} ({len(issues[sev])}) ═══')
    for m in issues[sev][:60]: print(' ', m)
    if len(issues[sev]) > 60: print(f'  … a dalších {len(issues[sev])-60}')
