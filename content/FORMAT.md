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


# Tracks (`jazzlab-track/1`)

`content/tracks/<id>.json`. A track is sections of items; the home screen renders it and builds today's session
(reviews due, then the next unfinished items).

```jsonc
{
  "$format": "jazzlab-track/1", "id": "blues", "title": {…}, "about": {…},
  "sections": [ { "id": "keys", "title": {…}, "about": {…}, "items": ["d-white", "pat-p1", "form-p1"] } ],
  "items": {
    "d-white": { "kind": "drill", "title": {…}, "about": {…},
      "tasks": [ { "type": "note", "notes": ["C", "D"], "n": 16 } ],   // note | all | interval (+ "semis") | chord (+ "chords")
      "pass": { "acc": 0.9, "avgMs": 2500 } },
    "pat-p1": { "kind": "pattern", "pattern": "p1", "form": "blues-c" }, // unfolded over form.practice as an exercise
    "form-p1": { "kind": "form", "form": "blues-c", "pattern": "p1", "title": {…} }
  }
}
```

Item screens are `#/t/<track>/<item>`. Passing an item (drill thresholds, the exercise's «by heart» stage,
3 clean choruses of a form) schedules a review in 1, 3, 7, 14 then 30 days.

# Forms (`jazzlab-form/1`) and left-hand patterns (`jazzlab-pattern/1`)

`content/forms/<id>.json`: `bars` = one chord per bar (`C7`, `Fm7`, `Bbmaj7`, `Dm7b5`…), `practice` = a short chord
sequence to learn a pattern on, `tempo`, `swing`.

`content/patterns/<id>.json`: `events` relative to the chord root, `deg` = semitones above it, `d` in eighths, `f` finger.
`patternExercise()` in `app/js/music/forms.js` unfolds a pattern over a chord list into a normal exercise; the root sits
between F2 and E3 (C → C3, F → F2, G → G2) so the hand stays in place.
