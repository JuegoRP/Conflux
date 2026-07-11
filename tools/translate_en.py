#!/usr/bin/env python3
"""CONFLUX — generátor EN překladu (campaign/cards/enemies → data/lang/*_en.json).
Použití: OPENAI_API_KEY=... python3 tools/translate_en.py [campaign|cards|enemies|all]
Idempotentní: existující klíče v výstupu přeskakuje (lze přerušit a pustit znovu).
"""
import json, re, os, sys, time, urllib.request

MODEL = 'gpt-4o'
STYLE = """You are translating a Czech narrative card game (CONFLUX) into English.
VOICE: terse literary noir. Short sentences. No fluff. Keep the rhythm and punch of the Czech.
HARD RULES:
- Keep template tokens EXACTLY as-is: {{player.name}}, {{profile}}.
- Keep these terms: Synth, Organic, Hybrid, Corruption (faction names), LP, ATK, DEF.
- Proper names stay: Monyra, Eli, Rozara, Voit, Romen, Lens, Marta, Kellner, Hana, Sigma.
- Translate epithet names consistently: Kurýr=Courier, Správce=the Custodian, Pozorovatel=the Observer,
  Vykonavatel=the Executor, Věřitel=the Creditor, Rekalibrátor=the Recalibrator, Tichý=the Quiet One,
  Pramáti=the First Mother, Zrcadlo=the Mirror, Paradox=Paradox, Syndikát=the Syndicate,
  trasa=the route, dopis=the letter, zásilka=the parcel, přepis=the rewrite, cyklus=the cycle.
- ALL-CAPS system lines stay ALL-CAPS.
- Return ONLY valid JSON with the same keys, values translated."""

def chat(payload_text, retries=8):
    body = json.dumps({
        'model': MODEL, 'temperature': 0.25,
        'response_format': {'type': 'json_object'},
        'messages': [{'role': 'system', 'content': STYLE},
                     {'role': 'user', 'content': payload_text}],
    }).encode()
    req = urllib.request.Request('https://api.openai.com/v1/chat/completions', data=body,
        headers={'Authorization': f"Bearer {os.environ['OPENAI_API_KEY']}", 'Content-Type': 'application/json'})
    for a in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(json.load(r)['choices'][0]['message']['content'])
        except Exception as e:
            if a == retries - 1: raise
            print(f'   retry {a+1} ({e})', flush=True)
            time.sleep(min(120, 8 * (a + 1)))

def load_js(path, pattern):
    return json.loads(re.search(pattern, open(path).read(), re.S).group(1))

def load_out(path):
    return json.load(open(path)) if os.path.exists(path) else {}

def save_out(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(data, open(path, 'w'), ensure_ascii=False, indent=0)

# ── CAMPAIGN: per node overlay {texts:[...], choices:[...], frames? lines? dle typu} ──
def node_texts(n):
    """Vytáhne přeložitelné texty nodu v deterministickém pořadí."""
    out = []
    for f in n.get('frames') or []: out.append(('frame', f.get('text') or ''))
    for l in n.get('setup') or []: out.append(('setup', l.get('text') or ''))
    for l in n.get('lines') or []: out.append(('line', l.get('text') or ''))
    for c in n.get('choices') or []: out.append(('choice', c.get('text') or ''))
    if n.get('title'): out.append(('title', n['title']))
    return out

def translate_campaign():
    d = load_js('data/campaign.js', r'export\s+const\s+CAMPAIGN_DATA\s*=\s*(\{.*\})\s*;?\s*$')
    outp = 'data/lang/campaign_en.json'
    out = load_out(outp)
    nodes = [n for a in d['acts'] for n in a['nodes'] if node_texts(n) and n['id'] not in out]
    print(f'campaign: {len(nodes)} nodů k překladu')
    BATCH = 10
    for i in range(0, len(nodes), BATCH):
        chunk = nodes[i:i+BATCH]
        src = {n['id']: [t for _, t in node_texts(n)] for n in chunk}
        res = chat('Translate every string in every array. Keep array lengths identical.\n' + json.dumps(src, ensure_ascii=False))
        ok = 0
        for nid, arr in res.items():
            if nid in src and isinstance(arr, list) and len(arr) == len(src[nid]):
                out[nid] = arr; ok += 1
        save_out(outp, out)
        print(f'  {i+len(chunk)}/{len(nodes)} (+{ok})', flush=True)
    print('campaign hotovo:', len(out))

# ── CARDS: id → {name, desc} ──
def translate_cards():
    d = load_js('data/cards.js', r'export const CARDS_DATA = (\{.*\})\s*;?\s*$')
    outp = 'data/lang/cards_en.json'
    out = load_out(outp)
    cards = [c for c in d['cards'] if str(c['id']) not in out and (c.get('name') or c.get('desc'))]
    print(f'cards: {len(cards)} karet k překladu')
    BATCH = 25
    for i in range(0, len(cards), BATCH):
        chunk = cards[i:i+BATCH]
        src = {str(c['id']): {'name': c.get('name') or '', 'desc': c.get('desc') or ''} for c in chunk}
        res = chat('Translate name and desc of each card. Card names: short, evocative, noir.\n' + json.dumps(src, ensure_ascii=False))
        for cid, v in res.items():
            if cid in src and isinstance(v, dict): out[cid] = {'name': v.get('name', ''), 'desc': v.get('desc', '')}
        save_out(outp, out)
        print(f'  {i+len(chunk)}/{len(cards)}', flush=True)
    print('cards hotovo:', len(out))

# ── ENEMIES: id → {name, context, preBattleDialog:[...], barks:{trigger:[...]}} ──
def translate_enemies():
    d = load_js('data/enemies.js', r'export const ENEMIES_DATA = (\{.*\})\s*;?\s*$')
    outp = 'data/lang/enemies_en.json'
    out = load_out(outp)
    todo = [e for e in d['enemies'] if e['id'] not in out]
    print(f'enemies: {len(todo)} k překladu')
    for i in range(0, len(todo), 4):
        chunk = todo[i:i+4]
        src = {}
        for e in chunk:
            src[e['id']] = {
                'name': e.get('name') or '',
                'preBattleDialog': [l.get('text') or '' for l in e.get('preBattleDialog') or []],
                'barks': {trg: [b.get('text') or '' for b in blist]
                          for trg, blist in (e.get('barks') or {}).items()},
            }
        res = chat('Translate all strings; keep structure and array lengths identical.\n' + json.dumps(src, ensure_ascii=False))
        for eid, v in res.items():
            if eid in src: out[eid] = v
        save_out(outp, out)
        print(f'  {i+len(chunk)}/{len(todo)}', flush=True)
    print('enemies hotovo:', len(out))

if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('cards', 'all'): translate_cards()
    if what in ('enemies', 'all'): translate_enemies()
    if what in ('campaign', 'all'): translate_campaign()
