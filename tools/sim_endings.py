#!/usr/bin/env python3
"""CONFLUX — simulátor dosažitelnosti konců.
Implementuje sémantiku StoryEngine (choices+condition, effects alignment/corruption/flags,
branchOn, corruptionCheck) a GameState._updateCorruption. Battle = výhra (volitelně % proher).
Spuštění: python3 tools/sim_endings.py
"""
import json, re, random
from collections import Counter, defaultdict

d = json.loads(re.search(r'export\s+const\s+CAMPAIGN_DATA\s*=\s*(\{.*\})\s*;?\s*$',
                         open('data/campaign.js').read(), re.S).group(1))
BYID = {n['id']: n for a in d['acts'] for n in a['nodes']}
START = 'act1_intro'

def corruption_level(alignment, story_corr):
    x = abs(alignment)
    lvl = 5 if x > 92 else 4 if x > 72 else 3 if x > 52 else 2 if x > 32 else 1 if x > 15 else 0
    return min(5, lvl + story_corr // 3)

class Sim:
    def __init__(s, policy, lose_chance=0.0, seed=0):
        s.policy, s.lose_chance = policy, lose_chance
        s.rng = random.Random(seed)
        s.align, s.story_corr, s.flags, s.lost_cards = 0, 0, set(), 0

    def corr(s): return corruption_level(s.align, s.story_corr)

    def cond_ok(s, cond):
        if not cond: return True
        return ((not cond.get('flagSet') or cond['flagSet'] in s.flags)
            and (not cond.get('flagNotSet') or cond['flagNotSet'] not in s.flags)
            and ('corruptionMin' not in cond or s.corr() >= cond['corruptionMin'])
            and ('corruptionMax' not in cond or s.corr() <= cond['corruptionMax'])
            and ('alignmentMin' not in cond or s.align >= cond['alignmentMin'])
            and ('alignmentMax' not in cond or s.align <= cond['alignmentMax']))

    def apply_effects(s, eff):
        if not eff: return
        if eff.get('alignment'): s.align = max(-100, min(100, s.align + eff['alignment']))
        if eff.get('corruption'): s.story_corr = max(0, s.story_corr + eff['corruption'])
        fl = eff.get('flags') or {}
        for f in fl.get('set', []) or []: s.flags.add(f)
        for f in fl.get('clear', []) or []: s.flags.discard(f)

    def pick_choice(s, choices):
        avail = [c for c in choices if s.cond_ok(c.get('condition'))]
        if not avail: return None
        if s.policy == 'random': return s.rng.choice(avail)
        def a_of(c): return (c.get('effects') or {}).get('alignment') or 0
        def c_of(c): return (c.get('effects') or {}).get('corruption') or 0
        if s.policy == 'max_align': return max(avail, key=a_of)
        if s.policy == 'min_align': return min(avail, key=a_of)
        if s.policy == 'max_corr':
            obs = next((c for c in avail if 'chose_observer_path' in ((c.get('effects') or {}).get('flags') or {}).get('set', [])), None)
            if obs: return obs
            # vyhni se volbám vedoucím rovnou do early konců — cíl je dožít se aktu 10 s korupcí
            def early(c):
                nx = c.get('next') or ''
                return 'early' in nx or 'corruption_ending' in nx or 'prodan' in nx
            safe = [c for c in avail if not early(c)] or avail
            return max(safe, key=lambda c: (c_of(c), -abs(a_of(c))))
        if s.policy == 'neutral':   return min(avail, key=lambda c: abs(a_of(c)))
        return s.rng.choice(avail)

    def run(s):
        nid, steps, visited_endings = START, 0, []
        while nid and steps < 600:
            steps += 1
            n = BYID.get(nid)
            if not n: return ('MISSING:' + nid, s.align, s.corr())
            if nid.endswith('_ending') or n['type'] == 'ending':
                return (nid, s.align, s.corr())
            # corruptionCheck redirect
            cc = n.get('corruptionCheck')
            if cc and s.corr() >= (cc.get('threshold') or 99):
                red = cc.get('redirect')
                if red and red in BYID:
                    s.flags.add('on_dark_branch'); nid = red; continue
            if n.get('loseCard'): s.lost_cards += 1
            s.apply_effects(n.get('effects'))
            if n.get('alignmentDelta'): s.align = max(-100, min(100, s.align + n['alignmentDelta']))
            t = n['type']
            if t == 'choice' or n.get('choices'):
                ch = s.pick_choice(n.get('choices') or [])
                if ch is None: nid = n.get('next'); continue
                s.apply_effects(ch.get('effects'))
                nid = ch.get('next') or n.get('next'); continue
            if t == 'battle':
                lost = s.rng.random() < s.lose_chance
                nxt = (n.get('onLose') if lost and n.get('onLose') else n.get('onWin')) or n.get('next')
                nid = nxt; continue
            if n.get('branchOn'):
                nxt = None
                for b in n['branchOn']:
                    if b.get('default'): continue
                    if s.cond_ok(b.get('condition')) and b.get('next'): nxt = b['next']; break
                if not nxt:
                    df = next((b for b in n['branchOn'] if b.get('default')), None)
                    nxt = df and df.get('next')
                nid = nxt or n.get('next'); continue
            nid = n.get('next')
        return ('DEADEND@' + str(nid), s.align, s.corr())

def main():
    results = Counter(); align_range = defaultdict(list)
    runs = []
    runs += [('random', 0.0, i) for i in range(3000)]
    runs += [('random', 0.25, 10000 + i) for i in range(1500)]
    runs += [(p, 0.0, 777) for p in ('max_align', 'min_align', 'neutral')]
    runs += [('max_corr', 0.0, i) for i in range(300)]
    for policy, lose, seed in runs:
        sim = Sim(policy, lose, seed)
        end, al, co = sim.run()
        if policy == 'max_corr' and end.startswith('act10'):
            print(f'   [max_corr diag] {end} story_corr={sim.story_corr} corrLevel={co} align={al}')
        results[end] += 1
        align_range[end].append(al)

    print('=== VÝSLEDKY (konec: počet běhů | alignment min..max | corruption max) ===')
    for end, cnt in results.most_common():
        als = align_range[end]
        print(f'{end:28} {cnt:5}×   align {min(als):+4}..{max(als):+4}')
    endings = {'act10_a_ending','act10_b_ending','act10_c_ending','act10_d_ending','act10_e_ending','act10_f_ending',
               'act4_early_ending','act6_early_ending','act8_corruption_ending'}
    reached = {e for e in results if e in endings}
    print('\n=== DOSAŽITELNOST ===')
    for e in sorted(endings):
        print(f"  {'✅' if e in reached else '❌ NEDOSAŽEN'}  {e}")
    dead = [e for e in results if e.startswith(('DEADEND', 'MISSING'))]
    if dead: print('\n⚠ PROBLÉMY:', {e: results[e] for e in dead})
    # letter alignment prahy
    finals = [al for e, als in align_range.items() if e.startswith('act10') for al in als]
    if finals:
        print(f'\nLetter prahy: align >70 dosažen: {any(a>70 for a in finals)} | < -70: {any(a<-70 for a in finals)} | rozsah {min(finals)}..{max(finals)}')

if __name__ == '__main__':
    main()
