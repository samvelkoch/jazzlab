# Exercise format (`jazzlab-exercise/1`)

One JSON file per exercise in `content/exercises/<id>.json`. The app renders the staff and keyboard,
plays it, checks MIDI input, and exports MusicXML + MIDI for Piano Marvel from this one file.

Time unit = one eighth note. A 4/4 bar has slots `0..7` (`1 + 2 + 3 + 4 +`).

```jsonc
{
  "$format": "jazzlab-exercise/1",
  "id": "s1-e2",                      // file name, used in URLs (#/ex/s1-e2)
  "course": "jazz-rhythms", "step": 1, "number": 2,
  "title": { "ru": "…", "en": "…" },
  "about": { "ru": "…", "en": "…" },  // optional one-line explanation
  "time": [4, 4],                     // only x/4 for now
  "tempo": { "start": 60, "target": 90 }, // start = first practice tempo, target = pass tempo
  "swing": false,                     // default eighths feel (user can switch)
  "rhythm": "8 8 4 8 8 r8 8",         // informational; the Rhythm stage derives the rhythm from the bars
  "defaults": { "stac": true },       // defaults for every event
  "dyn": [                            // dynamics; level 0..1 drives playback loudness
    { "bar": 0, "mark": "mp", "level": 0.55 },
    { "bar": 1, "mark": "cresc.", "level": 0.6, "cresc": true }, // linear up to the next mark
    { "bar": 3, "mark": "f", "level": 1 }
  ],
  "export": { "tempo": 90, "vel": [[60, 60]] }, // optional MIDI export overrides
  "bars": [
    { "rh": [ { "t": 0, "d": 2, "n": ["E4", "G4"], "f": [2, 4], "acc": true, "sug": true, "stac": false } ],
      "lh": [ … ] }
  ]
}
```

Event fields: `t` slot, `d` length in eighths (default 1), `n` pitches (`C4` = middle C, `F#3`, `Bb4`),
`f` fingers per pitch, `acc` accent, `stac` staccato, `sug` = fingering is our suggestion (not printed in the source),
`grace` = one grace note pitch played just before the event (`"grace": "D#4"`; optional when scoring, exported as a slashed grace note).

`scripts/mkex.py` is the compact helper used to transcribe the book exercises.

Add an exercise: create the file, then add its id to `available` in `content/courses/<course>.json`.
Check: `node tests/export.test.mjs`.

## Chords mode (`content/chords/lessons.json`, `jazzlab-chords/1`)

The path of the «Аккорды» section. Each lesson: `id`, `n`, `sym` (the example chord, in C), optional `compare`
(a chord to hear it against), `title` / `sub` / `rule` / `sound` (`{ru, en}`), `practice` (symbols for «Найди»),
and `comp` — the «В ритме» exercise: `bars` (one chord symbol per bar), `rhythm` (one bar, same tokens as above),
`swing`, `tempo`. `kind: "keys"` = the key-names trainer, `kind: "progression"` = `sym` holds several chords.

`app/js/music/chord-ex.js` turns `comp` into a normal exercise (right hand: the chord, left hand: the root or the
slash bass), so it gets the Rhythm → Notes → In tempo stages for free. Chord symbols are parsed by
`app/js/music/chords.js`. Check: `node tests/chords.test.mjs`.
