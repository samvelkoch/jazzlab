"""Helper used while transcribing: write content/exercises/<id>.json from a compact spec.
Event spec: (t, d, "E4 G4", "2 4", flags) where flags may contain p=printed fingering, s=staccato, a=accent, l=legato(override)."""
import json, sys, os
def ev(t, d, n, f, flags='', grace=None):
    e = {"t": t}
    if d != 1: e["d"] = d
    e["n"] = n.split()
    e["f"] = [int(x) for x in str(f).split()] if f != '' else []
    if grace: e["grace"] = grace
    if 'a' in flags: e["acc"] = True
    if 's' in flags: e["stac"] = True
    if 'p' not in flags and e["f"]: e["sug"] = True
    return e
def write(id, title, about, rhythm, bars, step, number, tempo=(60, 90), dyn=None, swing=False, export=None):
    ex = {"$format": "jazzlab-exercise/1", "id": id, "course": "jazz-rhythms", "step": step, "number": number,
          "title": title, "about": about, "time": [4, 4], "tempo": {"start": tempo[0], "target": tempo[1]},
          "swing": swing, "rhythm": rhythm, "dyn": dyn or [{"bar": 0, "mark": "mf", "level": 0.75}],
          "bars": [{"rh": [ev(*e) for e in b[0]], "lh": [ev(*e) for e in b[1]]} for b in bars]}
    if export: ex["export"] = export
    p = os.path.join(os.path.dirname(__file__), '..', 'content', 'exercises', id + '.json')
    s = json.dumps(ex, ensure_ascii=False, indent=2)
    open(p, 'w').write(s + '\n')
