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

An `ear` item is the «Find the note» game: `"kind": "ear", "rounds": 12, "ranges": [[60, 67], [60, 72], [55, 79]], "pass": { "acc": 0.8 }`.
`ranges` are `[lowMidi, highMidi]` pairs; the range index grows evenly over the rounds. A round is ok (first try, no replay),
meh (≤ 2 wrong keys or a replay) or miss (3+ wrong keys; the 4th reveals the answer). Accuracy = (ok + 0.5 · meh) / rounds,
stored as `best` (a number 0..1). Passing sets `stages.done` and schedules a review.

Item screens are `#/t/<track>/<item>`. Passing an item (drill thresholds, the exercise's «by heart» stage,
3 clean choruses of a form) schedules a review in 1, 3, 7, 14 then 30 days.

# Forms (`jazzlab-form/1`) and left-hand patterns (`jazzlab-pattern/1`)

`content/forms/<id>.json`: `bars` = one chord per bar (`C7`, `Fm7`, `Bbmaj7`, `Dm7b5`…), `practice` = a short chord
sequence to learn a pattern on, `tempo`, `swing`.

`content/patterns/<id>.json`: `events` relative to the chord root, `deg` = semitones above it, `d` in eighths, `f` finger.
`patternExercise()` in `app/js/music/forms.js` unfolds a pattern over a chord list into a normal exercise; the root sits
between F2 and E3 (C → C3, F → F2, G → G2) so the hand stays in place.

# Licks (`jazzlab-lick/1`)

`content/licks/<id>.json`: a two-bar right-hand phrase written relative to the chord root, so it fits any chord of the form.

```jsonc
{
  "$format": "jazzlab-lick/1", "id": "l1", "title": {…}, "about": {…},
  "role": "answer",          // question (does not end on the root) | answer (ends on the root)
  "bars": 2, "tempo": 66, "swing": true,
  "events": [
    { "t": 0, "d": 1, "deg": 3, "f": 2 },            // t = eighth slot 0..15 over the 2 bars, d in eighths
    { "t": 8, "d": 4, "deg": 0, "f": 1, "stac": false } // deg = semitones above the root, f = finger, stac optional
  ]
}
```

The right-hand root is `rhRoot = pc <= 7 ? 60 + pc : 48 + pc` (C → C4, F → F4, G → G4, A → A3). Spelling: flats for the
blue notes (Eb and Bb over C), the passing #4 (`deg` 6) as a sharp (F# over C). `lickNotes()` / `lickExercise()` in
`app/js/music/forms.js` turn a lick into MIDI notes or into a 2-bar exercise (RH = the lick, LH = a pattern over the chord).

Track items that use licks:

```jsonc
"lick-l1":    { "kind": "lick", "lick": "l1", "form": "blues-c", "pattern": "p1" },
"form-rh-l1": { "kind": "form", "form": "blues-c", "pattern": "p1", "hand": "rh", "lick": "l1", "title": {…} }
```

- `kind: "lick"` opens the lick screen (`#/t/<track>/<item>`): Echo (the piano plays the lick for 2 bars, you repeat it
  in the next 2; 3 clean repeats on every chord of the form, the chords being the form's distinct `bars`) → Fingers →
  By heart. Title and about default to the lick's. Progress: `echo: { C7: n, … }`, `stages.echo`, `stages.done`.
- `#/t/<track>/<item>/fingers/<chord>` is the lick over one chord as an exercise (id `<item>-<chord lowercased>`, LH =
  `pattern`). Passing its «by heart» stage passes the lick item and schedules its review.
- `kind: "form"` with `hand: "rh"` and `lick`: the app always plays the left-hand `pattern`, you play the lick, starting on
  bars 1, 3, 5, … and transposed to the chord of its first bar. Passing is the same: 3 clean choruses.
## Chords mode (`content/chords/lessons.json`, `jazzlab-chords/1`)

The path of the «Аккорды» section. Each lesson: `id`, `n`, `sym` (the example chord, in C), optional `compare`
(a chord to hear it against), `title` / `sub` / `rule` / `sound` (`{ru, en}`), `practice` (symbols for «Найди»),
and `comp` — the «В ритме» exercise: `bars` (one chord symbol per bar), `rhythm` (one bar, same tokens as above),
`swing`, `tempo`. `kind: "keys"` = the key-names trainer, `kind: "progression"` = `sym` holds several chords.

`app/js/music/chord-ex.js` turns `comp` into a normal exercise (right hand: the chord, left hand: the root or the
slash bass), so it gets the Rhythm → Notes → In tempo stages for free. Chord symbols are parsed by
`app/js/music/chords.js`. Check: `node tests/chords.test.mjs`.

## Performance (`kind: "perform"`)

`"perf-blues": { "kind": "perform", "form": "blues-c", "pattern": "p1", "licks": ["l1", "l3"], "choruses": 3, "title", "about" }`
opens `app/js/screens/perform.js`: count-in, `choruses` × the form with drums only (or a click), one ending bar (beat 1
only). `pattern` and `licks` are shown as reminders only; nothing is scored against them and the item is never passed.
Every note played is recorded as `{ t, d, m, v }` (`t`, `d` in seconds from the first beat of chorus 1, `v` 0..1).
Store: `recordings` = the last 10, newest first, `{ id, itemId, date, bpm, swing, choruses, notes, acc: { ok, meh, off,
pct, avgMs } }` (`acc`: onsets against the swing-aware eighth grid, `app/js/music/recording.js`); progress keeps
`runs` and `bestPct`. `recordingToMidi()` in `export.js` writes a recording as a `.mid`. Check: `node tests/recording.test.mjs`.

## Check-up (`kind: "diag"`)

`"diag": { "kind": "diag", "title", "about", "every": 30 }` (own section `diag`) opens `app/js/screens/diag.js`: four parts in a
row with an intro card each: rhythm (4 count-in clicks + 16 taps at 80 bpm), note names (8), find the note (8, C4–C5 then
G3–G5), chord quality (8: major / minor / dominant 7th). No pass and no review; the first run marks the item done, and
«Сегодня» offers it again after `every` days (`diagDue()` in `track.js`). Store `diag` = newest first, `{ date, rhythmMs,
rhythmBias (< 0 = early), nameMs, nameAcc, earAcc, chordAcc }` (`rhythmMs`/`rhythmBias` are `null` with fewer than 4 matched
taps). The home «Навыки» card shows the newest entry next to lick vocabulary, clean choruses, recordings and long-term items.
