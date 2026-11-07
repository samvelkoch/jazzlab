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
  "tempo": { "start": 60, "target": 90 }, // start = first practice tempo, target = a goal shown in the UI (♩ 60 · goal 90), not a requirement
  "passAnyTempo": true,               // default true: a clean run passes the «In tempo» / «By heart» stages at any tempo;
                                      // false = the stage passes only at tempo.target (old behaviour)
  "swing": false,                     // default eighths feel (user can switch)
  "rhythm": "8 8 4 8 8 r8 8",         // one bar, drawn and clapped in the Rhythm stage (without it the stage uses the first bar's merged rhythm)
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

Rhythm tokens: `8` eighth, `4` quarter, `2` half, `r` before one = a rest; a dot adds half (`4.` = 3 eighths,
`2.` = 6); `~` ties lengths into one note (`4.~4` = 5 eighths: a dotted quarter tied to a quarter, the bossa bass cell).
`parsePattern()` / `lenToken()` in `app/js/music/rhythm.js`. Events of 3, 5 and 6 eighths are drawn dotted / tied
in the Rhythm stage and on the staff, and exported to MusicXML as a dotted quarter + tied quarter for 5.

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
    "pat-s2-form": { "kind": "pattern", "pattern": "s2", "form": "std-f", "over": "bars" }, // over: "bars" = over the whole form.bars
    "form-p1": { "kind": "form", "form": "blues-c", "pattern": "p1", "title": {…} },
    "end-blues": { "kind": "exercise", "ex": "blues-end" }               // a written exercise from content/exercises
  }
}
```

An `exercise` item opens `content/exercises/<ex>.json` as a normal exercise (Notes → In tempo → By heart, no rhythm
stage). Title and about default to the exercise's. Its stages are stored under the exercise id; passing «by heart»
sets `stages.done` on the item and schedules the item's review (as with a lick's fingers exercise).

An `ear` item is the «Find the note» game: `"kind": "ear", "rounds": 12, "ranges": [[60, 67], [60, 72], [55, 79]], "pass": { "acc": 0.8 }`.
`ranges` are `[lowMidi, highMidi]` pairs; the range index grows evenly over the rounds. A round is ok (first try, no replay),
meh (≤ 2 wrong keys or a replay) or miss (3+ wrong keys; the 4th reveals the answer). Accuracy = (ok + 0.5 · meh) / rounds,
stored as `best` (a number 0..1). Passing sets `stages.done` and schedules a review.

Item screens are `#/t/<track>/<item>`. Item ids are store keys (progress, reviews), so they must be unique across
all tracks (the bossa ear game is `ear-find-bossa`, not `ear-find`). Each track has its own one-tap session
(store `session` for the blues, `session:<track>` for the others). A track is listed in `content/index.json`
(`"kind": "track"`, `"ready": true` shows it in the home tabs, opened at `#/track/<id>`; the blues is `#/`).

The bossa track (`content/tracks/bossa.json`): chord drills of Blue Bossa (`d-chords-cm`, `d-chords-db`), the patterns
`pat-b1` / `pat-b2` over `blue-bossa`, the form with each (`form-b1`, `form-b2`), the melody section (`mel-bossa`, the
tune `bossa-cm` by echo, and `form-mel`, the tune over the b1 bass on the form screen), `ear-find-bossa`, and `perf-bossa`
(2 choruses, no licks, `melody: "bossa-cm"` as a reminder, no ending: one ending bar). No check-up item; the home
«Навыки» card hides the lick row for a track without licks and shows «Фразы мелодии» (phrases with 3 clean echoes) for a
track with a melody item. Passing an item (drill thresholds, the exercise's «by heart» stage,
3 clean choruses of a form) schedules a review in 1, 3, 7, 14 then 30 days.

The standard track (`content/tracks/std.json`, id `std`): a 32-bar AABA tune in F with the bridge in Bb (`std-f`). Chord
drills `d-chords-f` (Fmaj7 Gm7 C7 Bbmaj7) and `d-chords-f2` (Cm7 F7 Am7 D7), the patterns `pat-s1` / `pat-s2` over the
practice `Gm7 C7 | Fmaj7 | Cm7 F7 | Bbmaj7` and `pat-s2-form` (the voice-led shell over all 32 bars, `"over": "bars"`), the form
with each (`form-s1`, `form-s2`), the melody (`mel-std`, the tune `std-f` in 16 two-bar phrases, and `form-mel-std` over the s1
bass), `ear-find-std`, and `perf-std` (2 choruses, s2 shell, the tune as a reminder, no licks yet: phase 1 of
`docs/specs/2026-11-07-standard-design.md`). A form of more than 16 bars gets a compact grid (`.fgrid.long`) that scrolls
inside the panel and keeps the current bar in view. The melody echo swings when the melody has `"swing": true` (not on a bossa form).

# Forms (`jazzlab-form/1`) and left-hand patterns (`jazzlab-pattern/1`)

`content/forms/<id>.json`: `bars` = one chord per bar (`C7`, `Fm7`, `Bbmaj7`, `Dm7b5`…) or two chords separated by a
space (`"C7 A7"`, the turnaround in `blues-c-ta`): the first covers slots 0..3, the second slots 4..7 (`barChords()` /
`chordAt()` in `forms.js`); licks and the right-hand form mode use the first chord of the bar. `practice` = a short chord
sequence to learn a pattern on, `tempo`, `swing`, optional `ending` = an exercise id (`"blues-end"`): the bars played
after the last chorus in a performance; its bar count sets the ending length. Any number of bars works (Blue Bossa has 16;
the form grid wraps 4 bars per row).

- `"style": "bossa"` (optional; default = the swing / straight jazz groove): the drums play a 2-bar bossa nova groove
  (shaker on every eighth, bass drum on slots 0, 3, 4, 7, rim click on the 3-2 bossa clave: bar A slots 0, 3, 6, bar B
  slots 2, 5; `groove(slot, time, { swing, style, bar })` in `app/js/music/drums.js`, `bar` = the bar index from the
  start, its parity picks A or B). A bossa form plays straight eighths: set `"swing": false`. The form, performance and
  lick screens pass the style through; the metronome-click backing is unchanged.
- `"flats": true` (optional): spell every left-hand note with flats (a flat key: Blue Bossa in C minor / Db major).
  `patternExercise(pattern, bars, { flats })`; the form and performance cells use it too.

`content/patterns/<id>.json`: `events` relative to the chord root, `deg` = semitones above it, `d` in eighths, `f` finger.
`patternExercise()` in `app/js/music/forms.js` unfolds a pattern over a chord list into a normal exercise; the root sits
between F2 and E3 (C → C3, F → F2, G → G2) so the hand stays in place. Spelling: the chord's own (flats for F and flat
roots), but `deg` 3 and 10 are always flats (Bb3 over C7), and so is the b5 of a m7b5 / dim chord (Ab over Dm7b5);
the form's `flats` forces flats everywhere. `chordNames()` (the drill prompts) spells the same way: Dm7b5 = D F Ab C,
Ebm7 = Eb Gb Bb Db, Dbmaj7 = Db F Ab C. Any number of events per bar works (p2 «Буги» has 8 eighths).
`deg` may be an array (several notes at once) with `f` an array of the same length:
`{ "t": 2, "d": 2, "deg": [4, 10], "f": [2, 1] }` (p3 «Корень и шелл»: the third and seventh on 2 and 4). The exercise gets
one event with all the notes; `patternBar()` returns one entry per note, so the form screen scores each of them.
`b1` «Бас боссы» (`t 0 d 3` root, `t 3 d 5` fifth, `"rhythm": "4. 4.~4"`) and `b2` «Бас боссы с ходом» (root, fifth,
root on 4: `"4. 4. 4"`) are the bossa cells; over a two-chord bar each event takes the chord at its slot, so b1 (no event
after slot 3) plays only the first chord of `"Dm7b5 G7"`, b2 plays the G on 4.
`s1` «Бас стандарта» = the root on 1 and on 3 (`t 0 d 4 deg 0`, `t 4 d 4 deg 0`): over a two-chord bar it plays both roots.

`"voicing": "lead"` (optional; `s2` «Шелл с голосоведением», the events of p3): voice leading. The root stays at `lhRoot`;
every two-note event (the shell: third + seventh, after `fitDeg`) is placed in the window C3..B3 (48..59), each note's
octave chosen so the pair is closest to the previous pair (sum of semitone moves, low to low and high to high; a tie goes
to the pair nearer the window centre). The first pair of a sequence is measured against root + the fitted degrees (as p3
plays them), each moved by octaves into the window. The window is one octave, so in practice each pitch class has one
place: Gm7 → F3 Bb3, C7 → E3 Bb3, Fmaj7 → E3 A3, one note moving at a time. Fingers by pitch: the event's larger finger on
the lower note (2), the smaller on the upper (1). The second chord of a two-chord bar follows the first.
`leadPair(degs, chord, prev)`; `patternBar(pattern, bar, { prev })` returns an array with `.pair` (the last pair used, to
pass as `prev` to the next bar); `patternBars(pattern, bars)` threads it over a sequence, and `patternExercise()` threads it
over its bars. The form, performance and melody screens build the left hand with `patternBars()` in form order. (The lick
screen plays one chord at a time and uses the first-pair rule.) Known overlap: D7's root D3 sits above the C3 of its shell.
The form screen allows max(1, round(notes per chorus / 40)) slips in a clean chorus: 1 for p1 / p1q, 2 for p2.

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
- `kind: "form"` with `hand: "rh"` and `licks: [question, answer]` (two lick ids, instead of `lick`): question and answer
  take turns. The first lick starts on bars 1, 5, 9, the second on bars 3, 7, 11, each transposed to the chord of its
  first bar. The bar labels say «вопрос» / «ответ» (from each lick's `role`). The about comes from the item's `about`.
  Scoring and passing are the same as with one lick.
  `"form-rh-qa": { "kind": "form", "form": "blues-c", "pattern": "p1", "hand": "rh", "licks": ["l5", "l4"], "title", "about" }`
# Melodies (`jazzlab-melody/1`)

`content/melodies/<id>.json`: a written right-hand tune over one form, in absolute pitches, in the form's key (flats).

```jsonc
{
  "$format": "jazzlab-melody/1", "id": "bossa-cm", "title": {…}, "about": {…},
  "form": "blue-bossa", "tempo": 66, "swing": false,
  "phrases": [[0, 1], [2, 3]],               // echo chunks: [firstBar, lastBar], 0-based, inclusive
  "bars": [                                   // one entry per form bar, chord = that form bar (checked by the tests)
    { "chord": "Cm7", "rh": [ { "t": 0, "d": 2, "n": "G4", "f": 1 } ] }  // t = eighth slot 0..7, d in eighths (t + d ≤ 8),
  ]                                                                       // n = ONE pitch name, f = finger
}
```

A pickup into the next phrase (notes at the end of the previous bar) belongs to the bar it is written in: a phrase is
exactly its bars. `melodyBarNotes()` / `melodyNotes()` / `melodyExercise()` in `app/js/music/forms.js`. The track loader
reads a melody when an item has `melody` (and its `form`, even when the item has none).

- `kind: "melody"`: `"mel-bossa": { "kind": "melody", "melody": "bossa-cm", "pattern": "b1" }` opens
  `app/js/screens/melody.js` (title and about default to the melody's). Echo: a phrase chip per `phrases` entry with its
  clean count n/3 (default = the first phrase under 3); count-in 1 bar, then the piano plays the phrase (RH = the melody
  bars, LH = `pattern` over each bar's chord, drums in the form's `style`), then as many bars for you (LH and drums keep
  going), and so on until Stop. Scoring as the lick echo: every note's onset inside the timing window, the same MIDI
  notes, nothing extra → a clean repeat. 3 clean repeats of every phrase → `stages.echo`. Progress:
  `echo: { 0: n, 1: n, … }` (by phrase index), `stages.echo`, `stages.done`.
- `#/t/<track>/<item>/fingers/<n>` = phrase n as an exercise (id `<item>-p<n>`, RH = the melody, LH = the pattern,
  straight, `tempo.start` = melody tempo − 10, no `doneId`, `byEar: true` = it opens on Notes, no Rhythm-first nudge); `#/t/<track>/<item>/fingers/all` = all the bars
  (id `<item>-all`, `doneId` = the item): its «by heart» passes the melody item and schedules its review.
- `kind: "form"` with `hand: "rh"` and `melody`: you play the tune, bar k of the melody over bar k of the form, the app
  plays the left-hand `pattern`. The cells show each bar's first note (— for an empty bar). Scoring and passing as with
  licks: 3 clean choruses, slips by note count.
  `"form-mel": { "kind": "form", "form": "blue-bossa", "pattern": "b1", "hand": "rh", "melody": "bossa-cm", "title", "about" }`
- `kind: "perform"` with `melody`: a reminder line «Мелодия: «<title>»» linking to the track's `melody` item for it.

## Chords mode (`content/chords/lessons.json`, `jazzlab-chords/1`)

The path of the «Аккорды» section. Each lesson: `id`, `n`, `sym` (the example chord, in C), optional `compare`
(a chord to hear it against), `title` / `sub` / `rule` / `sound` (`{ru, en}`), `practice` (symbols for «Найди»),
and `comp` — the «В ритме» exercise: `bars` (one chord symbol per bar), `rhythm` (one bar, same tokens as above),
`swing`, `tempo`. `kind: "keys"` = the key-names trainer, `kind: "progression"` = `sym` holds several chords.

`app/js/music/chord-ex.js` turns `comp` into a normal exercise (right hand: the chord, left hand: the root or the
slash bass), so it gets the Rhythm → Notes → In tempo stages for free. Chord symbols are parsed by
`app/js/music/chords.js`. Check: `node tests/chords.test.mjs`.

## Performance (`kind: "perform"`)

`"perf-blues": { "kind": "perform", "form": "blues-c", "pattern": "p1", "licks": ["l1", "l3", "l4", "l6"], "choruses": 3, "title", "about" }`
(optional `melody`: a melody id, shown as a reminder linking to its `melody` item) opens `app/js/screens/perform.js`: count-in, `choruses` × the form with drums only (or a click), then the form's
`ending`: the drums keep the groove through every ending bar but the last, which gets beat 1 only (blues-end: 2 bars).
A form without `ending` gets one ending bar, beat 1 only. The reminders link to the track's `exercise` item for the ending. `pattern` and `licks` are shown as reminders only; nothing is scored against them and the item is never passed.
Every note played is recorded as `{ t, d, m, v }` (`t`, `d` in seconds from the first beat of chorus 1, `v` 0..1).
Recording runs to the end of the ending. Store: `recordings` = the last 10, newest first, `{ id, itemId, date, bpm, swing,
choruses, ending (bars recorded after the choruses; 0 when stopped early), notes, acc: { ok, meh, off, pct, avgMs } }` (`acc`: onsets against the swing-aware eighth grid, `app/js/music/recording.js`); progress keeps
`runs` and `bestPct`. `recordingToMidi()` in `export.js` writes a recording as a `.mid`. Check: `node tests/recording.test.mjs`.

## Check-up (`kind: "diag"`)

`"diag": { "kind": "diag", "title", "about", "every": 30 }` (own section `diag`) opens `app/js/screens/diag.js`: four parts in a
row with an intro card each: rhythm (4 count-in clicks + 16 taps at 80 bpm), note names (8), find the note (8, C4–C5 then
G3–G5), chord quality (8: major / minor / dominant 7th). No pass and no review; the first run marks the item done, and
«Сегодня» offers it again after `every` days (`diagDue()` in `track.js`). Store `diag` = newest first, `{ date, rhythmMs,
rhythmBias (< 0 = early), nameMs, nameAcc, earAcc, chordAcc }` (`rhythmMs`/`rhythmBias` are `null` with fewer than 4 matched
taps). The home «Навыки» card shows the newest entry next to lick vocabulary, clean choruses, recordings and long-term items.
