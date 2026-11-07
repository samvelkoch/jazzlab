#!/usr/bin/env python3
"""Import a lead sheet (MusicXML .xml / .musicxml / compressed .mxl) into jazzlab content.

Writes content/melodies/<id>.json (jazzlab-melody/1) and content/forms/<id>.json (jazzlab-form/1).
Melody = the first part's top voice, quantised to eighth-note slots (8 per 4/4 bar); chord symbols come
from <harmony> elements (two per bar at most: beats 1–2 and 3–4). Anything it had to guess is listed in
the melody's "notes" array, so read that before trusting the result.

    python3 scripts/import_tune.py "path/to/Tune.mxl" --id sgb-f --title-ru "Sweet Georgia Brown" \
        --form-ru "Sweet Georgia Brown" --tempo 66 --swing --patterns s1,s2 --practice D7,G7,C7,F
"""
import argparse, json, re, sys, zipfile
import xml.etree.ElementTree as ET
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STEP_PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
KIND = {  # MusicXML harmony kinds -> jazzlab chord qualities (forms.js QUAL)
    'major': '', 'minor': 'm', 'dominant': '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7',
    'half-diminished': 'm7b5', 'diminished-seventh': 'dim7', 'diminished': 'dim7', 'dominant-ninth': '9',
    'major-sixth': '6', 'minor-sixth': 'm', 'augmented': '7', 'augmented-seventh': '7', 'suspended-fourth': '7',
    'dominant-seventh': '7', 'major-minor': 'm7', 'minor-ninth': 'm7', 'major-ninth': 'maj7', 'dominant-13th': '9',
    'dominant-11th': '9', 'minor-11th': 'm7', 'minor-13th': 'm7', 'major-13th': 'maj7', 'power': '', 'none': '',
}
LOSSY = {'minor-sixth', 'augmented', 'augmented-seventh', 'suspended-fourth', 'minor-ninth', 'major-ninth',
         'dominant-13th', 'dominant-11th', 'minor-11th', 'minor-13th', 'major-13th', 'power', 'none', 'major-minor'}


def load_xml(path):
    p = Path(path)
    if p.suffix.lower() == '.mxl':
        with zipfile.ZipFile(p) as z:
            names = [n for n in z.namelist() if n.lower().endswith('.xml') and not n.startswith('META-INF')]
            return ET.fromstring(z.read(names[0]))
    return ET.parse(p).getroot()


def chord_name(h, notes):
    root = h.find('root')
    if root is None:
        return None
    step = root.findtext('root-step')
    alter = int(float(root.findtext('root-alter') or 0))
    name = step + ('#' if alter > 0 else 'b' if alter < 0 else '')
    kind = (h.findtext('kind') or 'major').strip()
    q = KIND.get(kind)
    if q is None:
        notes.append(f'chord kind "{kind}" unknown, used plain major for {name}')
        q = ''
    elif kind in LOSSY:
        notes.append(f'chord {name} {kind} simplified to {name}{q}')
    if h.find('bass') is not None:
        notes.append(f'slash bass of {name}{q} dropped')
    return name + q


def pitch_name(n):
    p = n.find('pitch')
    step = p.findtext('step'); alter = int(float(p.findtext('alter') or 0)); octv = int(p.findtext('octave'))
    acc = {1: '#', -1: 'b', 2: '##', -2: 'bb'}.get(alter, '')
    midi = 12 * (octv + 1) + STEP_PC[step] + alter
    return step + acc + str(octv), midi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file'); ap.add_argument('--id', required=True)
    ap.add_argument('--title-ru'); ap.add_argument('--title-en'); ap.add_argument('--form-ru'); ap.add_argument('--form-en')
    ap.add_argument('--about-ru', default=''); ap.add_argument('--about-en', default='')
    ap.add_argument('--tempo', type=int, default=66); ap.add_argument('--swing', action='store_true')
    ap.add_argument('--style', default=None); ap.add_argument('--flats', action='store_true')
    ap.add_argument('--patterns', default='s1,s2'); ap.add_argument('--practice', default='')
    ap.add_argument('--source', default=''); ap.add_argument('--transpose', type=int, default=0, help='semitones (spelling re-derived)')
    ap.add_argument('--bars', default='', help='keep only bars a-b (1-based, after pickup folding), e.g. 9-40')
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()

    root = load_xml(a.file)
    notes = []
    title = root.findtext('work/work-title') or root.findtext('movement-title') or Path(a.file).stem
    part = root.find('part')
    divisions = 1; beats, beat_type = 4, 4
    bars = []  # {chords: [(slot, name)], events: [{t, d, n, m, tie}], full: bool}
    for meas in part.findall('measure'):
        attr = meas.find('attributes')
        if attr is not None:
            if attr.findtext('divisions'): divisions = int(attr.findtext('divisions'))
            if attr.find('time') is not None:
                beats = int(attr.findtext('time/beats')); beat_type = int(attr.findtext('time/beat-type'))
        quarter_slots = Fraction(2)  # eighth slots per quarter
        bar_slots = Fraction(beats * 4, beat_type) * quarter_slots
        if bar_slots != 8:
            notes.append(f'measure {meas.get("number")}: time {beats}/{beat_type} is not 8 eighths per bar; slots scaled')
        pos = Fraction(0); chords = []; events = []
        for el in meas:
            if el.tag == 'harmony':
                off = el.find('offset')
                slot = pos + (Fraction(int(float(off.text)), divisions) * quarter_slots if off is not None else 0)
                nm = chord_name(el, notes)
                if nm: chords.append((slot, nm))
            elif el.tag == 'backup':
                pos -= Fraction(int(el.findtext('duration')), divisions) * quarter_slots
            elif el.tag == 'forward':
                pos += Fraction(int(el.findtext('duration')), divisions) * quarter_slots
            elif el.tag == 'note':
                if el.find('grace') is not None:
                    continue
                dur = Fraction(int(el.findtext('duration')), divisions) * quarter_slots
                is_chord = el.find('chord') is not None
                voice = el.findtext('voice') or '1'
                if is_chord:  # extra chord tone: keep the top voice only (first note is usually the top in lead sheets)
                    continue
                if voice != '1':
                    notes.append(f'measure {meas.get("number")}: voice {voice} ignored'); pos += dur; continue
                if el.find('rest') is None:
                    nm, midi = pitch_name(el)
                    tie = el.find("tie[@type='stop']") is not None
                    events.append({'t': pos, 'd': dur, 'n': nm, 'm': midi, 'tie': tie})
                pos += dur
        rep = {'fwd': False, 'back': False, 'ending': None, 'ending_stop': False}
        for bl in meas.findall('barline'):
            r = bl.find('repeat')
            if r is not None:
                if r.get('direction') == 'forward': rep['fwd'] = True
                if r.get('direction') == 'backward': rep['back'] = True
            en = bl.find('ending')
            if en is not None:
                if en.get('type') == 'start': rep['ending'] = [int(x) for x in re.findall(r'\d+', en.get('number') or '1')]
                if en.get('type') in ('stop', 'discontinue'): rep['ending_stop'] = True
        bars.append({'num': meas.get('number'), 'chords': chords, 'events': events, 'len': pos, 'implicit': meas.get('implicit') == 'yes', 'rep': rep})

    # expand repeats: |: … :| with optional 1st/2nd endings, two passes (a plain repeat is played twice)
    if any(b['rep']['back'] for b in bars):
        out = []; start = 0; i = 0; pass_no = 1; cur = None
        while i < len(bars):
            b = bars[i]; r = b['rep']
            if r['fwd']: start = i; pass_no = 1
            if r['ending'] is not None: cur = r['ending']
            if cur is None or pass_no in cur: out.append(b)
            if r['back'] and pass_no == 1:
                pass_no = 2; cur = None; i = start; continue
            if r['ending_stop']: cur = None
            if r['back']: start = i + 1  # pass 2 done; the 2nd ending (if any) follows and is played once
            i += 1
        notes.append(f'repeats expanded: {len(bars)} written measures -> {len(out)} bars')
        bars = out
    # pickup: a short first measure is folded into the end of the last bar
    if bars and (bars[0]['implicit'] or bars[0]['len'] < 8):
        pick = bars.pop(0)
        shift = 8 - pick['len']
        if pick['events']:
            last = bars[-1]
            for e in pick['events']:
                last['events'].append({**e, 't': e['t'] + shift})
            notes.append(f'pickup measure ({len(pick["events"])} notes) folded into the end of the last bar')
    if a.bars:
        lo, hi = [int(x) for x in a.bars.split('-')]
        bars = bars[lo - 1:hi]
        notes.append(f'kept bars {lo}-{hi} of the score')

    # quantise to eighths, resolve chords, merge ties
    out_bars = []; last_chord = None
    for i, b in enumerate(bars):
        evs = []
        # onsets: round half down (a dotted-eighth + sixteenth pair, i.e. written swing, becomes two eighths),
        # strictly increasing; a note lasts until the next onset (or its own rounded length, whichever is shorter)
        import math
        seq = []
        prev = -1
        for e in b['events']:
            t = int(math.floor(float(e['t']) + 0.5 - 1e-9))
            if t <= prev: t = prev + 1
            prev = t
            seq.append((t, e))
        for j, (t, e) in enumerate(seq):
            nxt = seq[j + 1][0] if j + 1 < len(seq) else 8
            d = max(1, int(round(e['d'])))
            d = min(d, max(1, nxt - t))
            if e['t'] != t or e['d'] != d:
                notes.append(f'bar {i + 1}: {e["n"]} at {float(e["t"]):.2f} len {float(e["d"]):.2f} quantised to t{t} d{d}')
            if t >= 8:
                notes.append(f'bar {i + 1}: note {e["n"]} beyond the bar dropped'); continue
            d = min(d, 8 - t)
            if e['tie'] and evs == [] and out_bars and out_bars[-1]['rh'] and out_bars[-1]['rh'][-1]['n'] == e['n']:
                evs.append({'t': t, 'd': d, 'n': e['n'], 'm': e['m'], 'tie': True}); continue
            if e['tie'] and evs and evs[-1]['n'] == e['n'] and evs[-1]['t'] + evs[-1]['d'] == t:
                evs[-1]['d'] += d; continue
            evs.append({'t': t, 'd': d, 'n': e['n'], 'm': e['m']})
        # chords: at most two, split at slot 4
        cs = sorted(b['chords'])
        first = [c for c in cs if c[0] < 4]; second = [c for c in cs if c[0] >= 4]
        c1 = first[-1][1] if first else last_chord
        if not first and last_chord is None:
            c1 = second[0][1] if second else None
        if len(first) > 1: notes.append(f'bar {i + 1}: {len(first)} chords in beats 1-2, kept {c1}')
        c2 = second[-1][1] if second else None
        if len(second) > 1: notes.append(f'bar {i + 1}: {len(second)} chords in beats 3-4, kept {c2}')
        if second and second[0][0] != 4: notes.append(f'bar {i + 1}: chord {c2} printed on slot {second[0][0]}, placed on beat 3')
        if c1 is None:
            notes.append(f'bar {i + 1}: no chord, left empty'); c1 = 'C'
        chord = c1 if (c2 is None or c2 == c1) else f'{c1} {c2}'
        last_chord = c2 or c1
        out_bars.append({'chord': chord, 'rh': evs})

    if a.transpose:
        from_flats = a.flats
        names_s = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        names_f = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
        def sp(m):
            pc = m % 12; o = m // 12 - 1
            return (names_f if from_flats else names_s)[pc] + str(o)
        def tc(name):
            mm = re.match(r'^([A-G](?:#|b)?)(.*)$', name); pc = (STEP_PC[mm.group(1)[0]] + (1 if '#' in mm.group(1) else -1 if 'b' in mm.group(1) else 0) + a.transpose) % 12
            return (names_f if from_flats else names_s)[pc] + mm.group(2)
        for b in out_bars:
            for e in b['rh']:
                e['m'] += a.transpose; e['n'] = sp(e['m'])
            b['chord'] = ' '.join(tc(c) for c in b['chord'].split())
        notes.append(f'transposed by {a.transpose} semitones; spelling re-derived ({"flats" if from_flats else "sharps"})')

    # fingers: rank within each 2-bar phrase, lowest = 1 … highest = 5 (a suggestion, fix by hand)
    for k in range(0, len(out_bars), 2):
        evs = [e for b in out_bars[k:k + 2] for e in b['rh']]
        ms = sorted(set(e['m'] for e in evs))
        for e in evs:
            r = ms.index(e['m'])
            e['f'] = 1 + min(4, round(r * 4 / max(1, len(ms) - 1))) if len(ms) > 1 else 1
    notes.append('fingers are automatic (rank of the note within its 2-bar phrase), check them')

    bars_json = []
    for b in out_bars:
        rh = [{k: v for k, v in e.items() if k != 'm'} for e in b['rh']]
        bars_json.append({'chord': b['chord'], 'rh': rh})
    n = len(bars_json)
    phrases = [[i, min(i + 1, n - 1)] for i in range(0, n, 2)]
    tr = a.title_ru or title; te = a.title_en or title
    melody = {
        '$format': 'jazzlab-melody/1', 'id': a.id, 'title': {'ru': tr, 'en': te},
        'about': {'ru': a.about_ru or f'{tr}: мелодия из лид-шита, {n} тактов. Учится эхом по два такта.',
                  'en': a.about_en or f'{te}: the tune from a lead sheet, {n} bars. Learned by echo, two bars at a time.'},
        'source': a.source or f'MusicXML: {Path(a.file).name}', 'form': a.id, 'tempo': a.tempo, 'swing': bool(a.swing),
        'phrases': phrases, 'bars': bars_json, 'notes': notes,
    }
    chords_seq = []
    for b in bars_json:
        for c in b['chord'].split():
            if c not in chords_seq: chords_seq.append(c)
    form = {
        '$format': 'jazzlab-form/1', 'id': a.id, 'title': {'ru': a.form_ru or tr, 'en': a.form_en or te},
        'about': {'ru': f'{n} тактов, гармония из лид-шита.', 'en': f'{n} bars, the changes from the lead sheet.'},
        'bars': [b['chord'] for b in bars_json], 'practice': a.practice.split(',') if a.practice else chords_seq[:4],
        'patterns': a.patterns.split(','), 'tempo': a.tempo, 'swing': bool(a.swing), 'flats': bool(a.flats),
    }
    if a.style: form['style'] = a.style
    if a.dry:
        for i, b in enumerate(bars_json):
            print(f'{i + 1:2} {b["chord"]:12} ' + ' '.join(f'{e["n"]}@{e["t"]}/{e["d"]}' + ('~' if e.get('tie') else '') for e in b['rh']))
        print('\n'.join('- ' + x for x in notes)); return
    (ROOT / 'content/melodies' / f'{a.id}.json').write_text(json.dumps(melody, ensure_ascii=False, indent=1) + '\n')
    (ROOT / 'content/forms' / f'{a.id}.json').write_text(json.dumps(form, ensure_ascii=False, indent=1) + '\n')
    print(f'wrote content/melodies/{a.id}.json and content/forms/{a.id}.json: {n} bars, {len(notes)} notes')


if __name__ == '__main__':
    main()
