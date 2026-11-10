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
(reviews due, then the next unfinished items in the learning order: `path`, see below).

```jsonc
{
  "$format": "jazzlab-track/1", "id": "blues", "title": {…}, "about": {…},
  "path": ["d-white", "ear-find", "pat-p1", "form-p1", …],              // optional: the learning order (see below)
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

An `ear` item with a `game` is a relative-ear level: `"kind": "ear", "game": "hilo" | "interval" | "quality" | "prog", "level": 1, "rounds": 12, "pass": { "acc": 0.8 }`
(screen `app/js/screens/ear-rel.js`; the pure logic, levels and question generation are in `app/js/music/ear-games.js`, tests in `tests/ear.test.mjs`).
The `level` (1-based) picks the set from `LEVELS`: `hilo` 1 wide gaps → 2 down to a semitone → 3 + «same»; `interval` 1 m3/M3 → 2 + P4, P5 →
3 + m7, M7, P8 → 4 all twelve → 5 descending (basic set) → 6 descending (all) → 7 harmonic (basic set); `quality` 1 maj/min → 2 maj7/m7/7 → 3 + m7b5;
`prog` 1 ii–V–I major or minor → 2 which of three chords is the V7. Grading, progress, review: as «Find the note» (a button answer is meh with one
slip, miss with two; on the keys, up to two slips are meh). Relative-ear item ids end with the track suffix (`ear-iv2`, `ear-iv2-bossa`, `ear-iv2-std`).

Item screens are `#/t/<track>/<item>`. Item ids are store keys (progress, reviews), so they must be unique across
all tracks (the bossa ear game is `ear-find-bossa`, not `ear-find`). Each track has its own one-tap session
(store `session` for the blues, `session:<track>` for the others). A track is listed in `content/index.json`
(`"kind": "track"`, `"ready": true` shows it in the home tabs, opened at `#/track/<id>`; the blues is `#/`).

The bossa track (`content/tracks/bossa.json`): chord drills of Blue Bossa (`d-chords-cm`, `d-chords-db`), the patterns
`pat-b1` / `pat-b2` over `blue-bossa`, the form with each (`form-b1`, `form-b2`), the comping section (`comp`, right-hand chords over the
bass, see «Right-hand comping»: `pat-c1` / `form-c1` after `form-b1` (`d-chords-db` now comes before them, the form uses all seven
chords), `pat-c2` / `form-c2` and `pat-c3` / `form-c3` after `form-b2`), the melody section (`mel-bossa`, the
tune `bossa-cm` by echo, and `form-mel`, the tune over the b1 bass on the form screen), the right hand (`rh`: the dorian
licks `lick-bl1`..`lick-bl3` echoed over `"chords": ["Cm7", "Fm7", "G7"]`, `form-rh-bl1` = bl1 on every odd bar of the form,
`form-rh-qa-bossa` = bl2 / bl1 taking turns), `ear-find-bossa`, the ending `end-bossa` (`bossa-end`, also the form's
`ending`: Dm7b5, G7 on the «и» of two, Cm for the whole second bar, straight, 56 → 66) and `perf-bossa` (2 choruses, the
licks bl1, bl3 and `melody: "bossa-cm"` as reminders, the ending). No check-up item; the home
«Навыки» card hides the lick row for a track without licks and shows «Фразы мелодии» (phrases with 3 clean echoes) for a
track with a melody item. Passing an item (drill thresholds, the exercise's «by heart» stage,
3 clean choruses of a form) schedules a review in 1, 3, 7, 14 then 30 days.

The standard track (`content/tracks/std.json`, id `std`): a 32-bar AABA tune in F with the bridge in Bb (`std-f`). Chord
drills `d-chords-f` (Fmaj7 Gm7 C7 Bbmaj7) and `d-chords-f2` (Cm7 F7 Am7 D7), the patterns `pat-s1` / `pat-s2` over the
practice `Gm7 C7 | Fmaj7 | Cm7 F7 | Bbmaj7` and `pat-s2-form` (the voice-led shell over all 32 bars, `"over": "bars"`), the form
with each (`form-s1`, `form-s2`), the melody (`mel-std`, the tune `std-f` in 16 two-bar phrases, and `form-mel-std` over the s1
bass), `ear-find-std`, the right hand (`rh`: the key-relative ii–V–I licks `lick-k1`..`lick-k3` in F and Bb, `form-rh-k1` = k1 on
every ii–V–I of the form, `form-rh-qa-std` = k3 / k1 taking turns), the ending `end-std` (`std-end`, also the form's `ending`)
and `perf-std` (2 choruses, s2 shell, the tune and the licks k1, k2 as reminders, the ending; phase 2 of
`docs/specs/2026-11-07-standard-design.md`). A form of more than 16 bars gets a compact grid (`.fgrid.long`) that scrolls
inside the panel and keeps the current bar in view. The melody echo swings when the melody has `"swing": true` (not on a bossa form).

The `tunes` section («Пьесы», after `melody`) of the std track holds five real tunes of the twenties, from first editions and
lead sheets: Bye Bye Blackbird in G (`bbb-g`, sharps, plain triads and `C#dim7`), Sweet Georgia Brown in F (`sgb-f`) and, from
lead sheets (`scripts/import_tune.py`), Honeysuckle Rose (`hsr-f`), Ain't Misbehavin' (`aim-f`) and Tea for Two (`tft-f`), each with
`mel-<tune>` (echo, fingers, by heart over s1; x = bbb, sgb, hsr, aim, tft) and `form-mel-<tune>` (the whole tune over the s1 bass);
`perf-<x>` in `perf` (2 choruses, the s2 shell, the tune as a reminder, `licks: []`). A plain major triad takes a major 7th in the
voice-led shell (`fitDeg`: G gets F#, not F). The sharp-key form's exercises are spelled with sharps (`flats: !!form.flats`).
The blues track's `tune` section has two blues choruses: St. Louis Blues (`stl-c`, over `blues-c`) and Tin Roof Blues (`tinroof-c`,
its own 12-bar form with plain triads C, F and A7 / D7; `mel-tinroof`, `form-mel-tinroof`, p1 / p2 / p3).
The home «Сегодня» queue takes at most one `melody` item and one `form` item with a `melody` among the fresh items (the earliest of
each in learning order; `freshItems()` in `app/js/queue.js`), so many tunes do not stack in one session.

**Learning order (`path`).** Sections are the display grouping only. The optional top-level `"path": [itemId, …]` is the
order in which fresh items are offered (ear first, the whole form in week one, foundation drills alongside the track, every
stage ending with the form); without it the flattened sections are the order. On the home screen the cards stay grouped by
section; only the «сейчас» badge and the «Сегодня» list follow the path. Rules (`node tests/tracks.test.mjs` checks them for
every track): every `path` id exists in `items` and in some section, no duplicates, and every section item that is not a
`diag` appears in `path` exactly once. Fresh-item rules (`freshItems()`): a `diag` is never a fresh item (the check-up comes
first on its own when due); at most one `melody`, one form with a `melody` and one `solo` a day; a `perform` item is offered
only once every path item before it is done, and for the queue it is done once it has a recorded run (`progress[id].runs >= 1`,
`itemDone()` in `store.js`; its card then says «записано» instead of «пройдено»).

**Session budget.** The «Сегодня» card has a 10 · 20 · 40 min switch (`settings.budget`, default 20): 10 → up to 3 reviews +
1 new item, 20 → up to 4 reviews + 2 new, 40 → up to 6 reviews + 3 new (`BUDGETS` in `queue.js`; `todayQueue(model, limits)`
in `track.js`). Changing it re-renders the list; a running one-tap session keeps its queue until it ends. Under the list,
one line per other ready track with reviews due today («Ещё к повтору: Босса-нова · 2 →», linking to that track's home); the
other tracks' raw JSON is fetched for their item ids, and the line stays hidden if a fetch fails.

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

## Right-hand comping (`comp` in a pattern)

A pattern may carry a `comp` block: a right-hand part of chords over the left-hand bass in `events` (`c1`, `c2`, `c3`, the bossa
comping steps). Backward compatible: a pattern without `comp` is left-hand only, as before.

```jsonc
"comp": {
  "rhythm": "r4 4. 4.",              // the right-hand rhythm; the Rhythm stage of the exercise drills THIS, not the bass
  "bars": 1,                         // 1 | 2: the comp repeats every `bars` form bars (bar k takes comp bar k % bars)
  "events": [ { "t": 2, "d": 3 }, { "t": 5, "d": 3 } ],  // when the chord sounds; "bar": 0|1 picks the comp bar (bars: 2)
  "voicings": { "Cm7": { "n": ["Eb4", "G4", "Bb4"], "f": [1, 3, 5] }, … }  // written out per chord, flats as in the form
}
```

- The voicings are not computed: each chord of the form has its notes (and fingers) in the file, hand-voice-led so every voice
  moves by at most a major third around the whole loop (the 3rd and 7th of each chord plus the 5th or root, C4..D5). A chord without
  a voicing throws. A two-chord bar takes the voicing of the chord at each event's slot.
- `patternExercise()` gives the right hand (`rh`) the chords and the left hand the bass; the exercise's `rhythm` is `comp.rhythm`.
  With `comp.bars: 2` the exercise gets `rhythmBars: 2`: the Rhythm stage then loops a two-bar rhythm line (`rhythm` written as two
  bars in a row, `"4. 4. 4 r4 4. 4."`; the notation draws a barline, counting restarts at 1).
- `compBar(pattern, barName, i)` / `compBars(pattern, bars)` in `forms.js` return the right-hand notes (MIDI + names) per form bar.
- A form item with `"hand": "both"` and a pattern with `comp` (and no `melody` or lick) is the whole-form loop: bass + chords, both
  hands scored (a chord = several expected notes at one slot), the app plays only the drums.
- The bossa set: `c1` «Аккорды вместе с басом» (bass `b1`; chords on 1 and the «and» of 2, `"4. 4. r4"`), `c2` «Аккорды между
  басом» (bass `b2`; chords on 2 and the «and» of 3, held: `"r4 4. 4."`) and `c3` «Аккорды по клаве» (bass `b2`; two bars that follow
  the rim-click clave of `drums.js`: bar A slots 0, 3, 6, bar B slots 2, 5). The three files carry the same voicings.

# Licks (`jazzlab-lick/1`)

`content/licks/<id>.json`: a two-bar right-hand phrase written relative to the chord root, so it fits any chord of the form.

```jsonc
{
  "$format": "jazzlab-lick/1", "id": "l1", "title": {…}, "about": {…},
  "role": "answer",          // question (does not end on the root) | answer (ends on the root)
  "bars": 2, "tempo": 66, "swing": true,
  "scale": "dorian",         // optional: written over a minor 7th / dorian sound (the bossa licks bl1..bl3); see fitting below
  "events": [
    { "t": 0, "d": 1, "deg": 3, "f": 2 },            // t = eighth slot 0..15 over the 2 bars, d in eighths
    { "t": 8, "d": 4, "deg": 0, "f": 1, "stac": false } // deg = semitones above the root, f = finger, stac optional
  ]
}
```

The right-hand root is `rhRoot = pc <= 7 ? 60 + pc : 48 + pc` (C → C4, F → F4, G → G4, A → A3). Spelling: flats for the
blue notes (Eb and Bb over C), the passing #4 (`deg` 6) as a sharp (F# over C), except over a chord with a flat fifth
(m7b5, dim7), where deg 6 is that b5 and stays a flat (Ab over Dm7b5). `lickNotes()` / `lickExercise()` in
`app/js/music/forms.js` turn a lick into MIDI notes or into a 2-bar exercise (RH = the lick, LH = a pattern over the chord).

Fitting to the chord: `lickNotes()` passes every degree through `fitDeg(deg, chord, opts)`, the same rule as the patterns
(4 → 3 over a minor chord, 10 → 11 over maj7, 7 → 6 over m7b5 / dim; the octave of a degree above 12 is kept). A lick with
`"scale": "dorian"` also passes `{ minorToMajor: true }`: the mirror case, 3 → 4 over a chord with a major third and no
minor one (G7: B, Dbmaj7: F). So a dorian lick played over Dbmaj7 gets the major third and the major seventh (F, C), over G7
the major third (B). Blues licks (no `scale`) keep their blue thirds over a dominant chord (l1 over C7 = Eb E G Bb …).
The returned `deg` is the fitted degree and `name` the spelled note (the lick, form and exercise screens show `name`).

Track items that use licks:

```jsonc
"lick-l1":    { "kind": "lick", "lick": "l1", "form": "blues-c", "pattern": "p1" },
"form-rh-l1": { "kind": "form", "form": "blues-c", "pattern": "p1", "hand": "rh", "lick": "l1", "title": {…} }
```

- `kind: "lick"` opens the lick screen (`#/t/<track>/<item>`): Echo (the piano plays the lick for 2 bars, you repeat it
  in the next 2; 3 clean repeats on every chord of the form, the chords being the form's distinct `bars`, or the item's
  own `"chords": ["Cm7", "Fm7", "G7"]` when set) → Fingers → By heart. Title and about default to the lick's. Progress:
  `echo: { C7: n, … }`, `stages.echo`, `stages.done`. The echo plays straight or swung by `lick.swing` (else `form.swing`)
  with the form's drum `style`.
- `#/t/<track>/<item>/fingers/<chord>` is the lick over one chord as an exercise (id `<item>-<chord lowercased>`, LH =
  `pattern`); the chord must be in `item.chords` when the item sets it, else any chord of the form. Passing its «by heart»
  stage passes the lick item and schedules its review.
- `kind: "form"` with `hand: "rh"` and `lick`: the app always plays the left-hand `pattern`, you play the lick, starting on
  bars 1, 3, 5, … and transposed to the chord of its first bar. Passing is the same: 3 clean choruses.
- `kind: "form"` with `hand: "rh"` and `lickKey` (a key-relative lick, see below), or `licksKey: [question, answer]`: the
  lick sits on every ii–V–I of the form and the other bars are rests. `iivPairs(bars)` in `forms.js` scans left to right,
  non-overlapping: bar k has two chords, a m7 then a 7 a fourth above it (`"Gm7 C7"`), and bar k + 1 has one major chord
  (maj7, 6 or a triad) a fourth above the 7 (`Fmaj7`); the key = that chord's root. In `std-f` (0-based) that is
  (1,2) (3,4) (7,8) (9,10) (11,12) (25,26) (27,28) (30,31) in F and (16,17) (18,19) in Bb; `"Gm7 C7 | Gm7"` (21,22) is
  not a resolution. With `licksKey` pair i plays `licksKey[i % 2]`. The first bar of a pair shows «фраза · F» (or «вопрос ·
  F» / «ответ · Bb»). Scoring and passing as with `lick`.
  `"form-rh-k1": { "kind": "form", "form": "std-f", "pattern": "s2", "hand": "rh", "lickKey": "k1", "title", "about" }`
- `kind: "form"` with `hand: "rh"` and `licks: [question, answer]` (two lick ids, instead of `lick`): question and answer
  take turns. The first lick starts on bars 1, 5, 9, the second on bars 3, 7, 11, each transposed to the chord of its
  first bar. The bar labels say «вопрос» / «ответ» (from each lick's `role`). The about comes from the item's `about`.
  Scoring and passing are the same as with one lick.
  `"form-rh-qa": { "kind": "form", "form": "blues-c", "pattern": "p1", "hand": "rh", "licks": ["l5", "l4"], "title", "about" }`
- `kind: "form"` with `hand: "both"`: the same right-hand options as `hand: "rh"` (`lick`, `licks`, `lickKey` / `licksKey`,
  `melody`), but you play the left-hand `pattern` AND the right-hand part. The app plays only the drums (or the click);
  both hands sound as a guide in Listen mode or without MIDI. Expected notes = both hands merged per bar (a same pitch on the
  same eighth counts once); a clean chorus allows max(1, round(notes of both hands per chorus / 40)) slips; three clean
  choruses in a row pass, a due review fails as with `rh`. The keyboard spans both hands and shows each hand's current and next
  keys; the bar cells keep the right-hand label; the header chip says «Две руки · …». Without right-hand material the item
  falls back to the left hand alone.
  `"form-2h-l1": { "kind": "form", "form": "blues-c", "pattern": "p1", "hand": "both", "lick": "l1", "title", "about" }`
  (also `form-2h-qa` with `licks: ["l5", "l4"]`, `form-2h-bossa` and `form-2h-std` with the tune).

## Key-relative licks (`prog` + `keys`)

A lick written over a progression instead of one chord: `"prog": ["Gm7 C7", "Fmaj7"]` = one chord string per bar,
written in F (the tonic), and `deg` = semitones from the tonic (negative = below it: k1's `deg: -1` is E4 under F4).
The tonic of a key is `keyTonic(key) = 60 + pc` (C4..B4: F → F4, Bb → Bb4). This is deliberately not `rhRoot` (Bb3):
the phrase keeps its hand position going up from F to Bb. Notes are spelled with flats (`spell(m, true)`: Bb, Eb; E, A,
D, G stay natural). In `forms.js`: `transposeChord(name, semis)` (keeps the quality, black-key roots as flats:
`transposeChord("Gm7 C7", 5)` = `"Cm7 F7"`), `lickKeyNotes(lick, key)` (t 0..15, with `name`), `lickOverKey(lick, key,
pattern?)` → `{ bars: [{ rh, lh }], chords }` (chords = `prog` moved from F to the key, lh = the pattern over them, voice-led),
`lickExerciseKey(lick, key, pattern, opts)` (2-bar exercise, LH spelled with flats). `lickBars` / `lickExercise` stay for
chord-relative licks. The std licks k1 «II–V–I: вверх и домой», k2 «ступеньки вниз» (answers) and k3 «вопрос».

```jsonc
"lick-k1": { "kind": "lick", "lick": "k1", "keys": ["F", "Bb"], "pattern": "s2" }   // keys instead of form
```

- The lick screen with `keys`: the chips are the keys, the piano plays the lick over `prog` in that key (LH = the pattern
  over the transposed chords, two bars), echo counts `echo: { F: n, Bb: n }`, Echo passes with 3 clean repeats in every key.
- `#/t/<track>/<item>/fingers/<key>` = the lick in one key as an exercise (id `<item>-<key lowercased>`: `lick-k1-bb`).
- A performance lists key-relative licks by title like any other (the keyboard covers them in the keys of the form's ii–V–Is).
# Melodies (`jazzlab-melody/1`)

`content/melodies/<id>.json`: a written right-hand tune over one form, in absolute pitches, in the form's key (flats).

```jsonc
{
  "$format": "jazzlab-melody/1", "id": "bossa-cm", "title": {…}, "about": {…},
  "form": "blue-bossa", "tempo": 66, "swing": false,
  "source": "free text: the edition the notes were read from (publisher, year, IMSLP number); optional",
  "phrases": [[0, 1], [2, 3]],               // echo chunks: [firstBar, lastBar], 0-based, inclusive
  "bars": [                                   // one entry per form bar, chord = that form bar (checked by the tests)
    { "chord": "Cm7", "rh": [ { "t": 0, "d": 2, "n": "G4", "f": 1 } ] }  // t = eighth slot 0..7, d in eighths (t + d ≤ 8),
  ]                                                                       // n = ONE pitch name, f = finger
// optional "notes": [ "…" ] — what the transcriber had to decide (read it before trusting a tune)
}
```

A pickup into the next phrase (notes at the end of the previous bar) belongs to the bar it is written in: a phrase is
exactly its bars. `melodyBarNotes()` / `melodyNotes()` / `melodyExercise()` in `app/js/music/forms.js`. The track loader
reads a melody when an item has `melody` (and its `form`, even when the item has none).

**Ties.** An event with `"tie": true` (always `t: 0`, the first event of a bar) is the note of the previous bar held over
the bar line: it is not struck again. `melodyBarNotes()`, `melodyNotes()` and `melodyExercise()` drop it, so it is never
expected, scored or played as a new attack, and a bar holding only a tie has no notes (the form cell shows «—», the echo
roll shows nothing in that bar). The previous bar's note simply ends at the bar line (its own `d`). The field stays in the
JSON; it records the source. `source` is free text about the edition (publisher, year, IMSLP number), not read by the app.

**Importing a lead sheet.** `python3 scripts/import_tune.py <file.mxl|.xml|.musicxml> --id <id> --title-ru … --title-en …
--form-ru … [--tempo 66] [--swing] [--flats] [--patterns s1,s2] [--practice D7,G7,C7,F] [--source "…"] [--transpose n] [--bars a-b]
[--dry]` reads MusicXML (compressed `.mxl` too) and writes `content/melodies/<id>.json` plus `content/forms/<id>.json`.
Melody = the first part's top voice quantised to eighths (anything off the grid is noted); fingers are automatic (the
rank of each note within its 2-bar phrase, lowest = 1, a suggestion: check them); a note tied over a bar line becomes a
`"tie": true` event at the start of the next bar; chords come from the `<harmony>` elements, two per bar at most (the first
covers beats 1–2, the second beats 3–4; a chord printed on beat 2 or 4 is placed on beat 3 and noted; a bar without a
chord repeats the last one). Repeats with 1st/2nd endings are expanded (a plain repeat plays twice). Written swing (a dotted eighth + a sixteenth) is quantised to two eighths: onsets round half down, and a note lasts until the next onset. Everything the script had to guess is written into the melody's `notes` array: read it, then
fix the JSON by hand (chord qualities outside `QUAL` in `forms.js`, pickups, endings). `--dry` prints without writing. Then add the items to a track and run the tests.

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
(optional `melody`: a melody id, shown as a reminder linking to its `melody` item; `licks` may be key-relative) opens `app/js/screens/perform.js`: count-in, `choruses` × the form with drums only (or a click), then the form's
`ending`: the drums keep the groove through every ending bar but the last, which gets beat 1 only (blues-end: 2 bars).
A form without `ending` gets one ending bar, beat 1 only. The reminders link to the track's `exercise` item for the ending. `pattern` and `licks` are shown as reminders only; nothing is scored against them and the item is never passed (for today's queue and the track card it counts as done after one recorded run; it is offered once every item before it in the track's `path` is done).
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

# Solos (`jazzlab-solo/1`)

Improvisation: `content/solos/<id>.json`, opened by a track item `"imp-b1": { "kind": "solo", "solo": "blues-scale", "title"?, "about"? }`
(title and about default to the solo's) on `app/js/screens/solo.js`. Design: `docs/specs/2026-11-08-improvisation-design.md`.
The band plays the whole form (`pattern` = its left hand, drums or a click); you play your own right hand. Nothing is compared
with a reference; each chorus is scored by `scoreChorus()` in `app/js/music/solo.js` from the notes recorded in it.

```jsonc
{
  "$format": "jazzlab-solo/1", "id": "blues-scale", "title": {…}, "about": {…},
  "form": "blues-c", "pattern": "p2",
  "palette": { "mode": "scale", "scale": "blues", "root": "C" },
  //  or { "mode": "scales", "parts": [{ "bars": [0, 15], "scale": "major", "root": "F" }, …] }  (bars inclusive, 0-based)
  //  or { "mode": "chordscale" }  m7 dorian, 7 / 9 mixolydian, maj7 / 6 / triad major, m7b5 locrian, dim7 dim, m aeolian
  "hand": { "lo": 60, "hi": 72 },          // the hand position: keyboard [lo-5, hi+7], palette brighter inside
  "phrasing": { "play": 2, "rest": 2 },    // bars, repeated over the form; null = free (no rest bars)
  "call": false,                           // true: the band plays the `play` bars of each cell, you answer in the `rest` bars
  "rhythm": "charleston",                  // optional: a rhythm cell id (or a list of ids) from content/solos/rhythms.json;
                                           //   your bars must play it (see «Rhythm cells»); a tap step comes first
  "motif": "repeat",                       // optional, with call: the band plays a ONE-bar motif (phrasing 1 / 1), you
                                           //   "repeat" it (same rhythm, same notes or moved) or "vary" it (same rhythm, other notes)
  "endOn": "third",                        // optional: "third" | "root": the last note of each phrase lands on the chord's 3rd / root
  "targets": false,                        // true: score target notes on chord changes
                                           //   score.targets = { ok, total, changes }: ok / total = accuracy (a chord tone
                                           //   on the changes you played on), total / changes = coverage
  "choruses": 1,                           // choruses in one run; the run passes as a whole
  "pass": { "inside": 0.9, "grid": 0.7, "phrases": 3, "rests": 0.8, "targets": 0.6, "cover": 0.5, "pitches": 3,
            "rhythm": 0.6, "motif": 0.5, "ends": 0.6 }
  //  cover: share of chord changes in your bars that got a note on the first beat (else silence on every change would
  //  pass "targets": a metric with no data passes)
}
```

Scales (`app/js/music/scales.js`): `blues` 0 3 5 6 7 10, `minor-pent`, `major-pent`, `major`, `dorian`, `mixolydian`,
`aeolian`, `locrian`, `dim` (0 2 3 5 6 8 9 11). The palette of a bar / slot (`paletteAt`) is the scale plus the tones of the
chord at that slot (`chordAt`: a second chord from slot 4). Bar roles (`roleOf`): `you`, `rest`, `band` (with `call`).

Scoring (one chorus; notes `{ t, m }`, `t` in seconds from the chorus start; a note belongs to the bar of its nearest eighth,
so a slightly early downbeat counts for the new bar):
- **inside**: share of your notes (`you` bars) in the palette; a note outside followed within 1.25 eighths by a note a
  semitone away that is in the palette is an approach and counts.
- **grid**: share of your notes within 1.5 × the form screen's «ровно» window of the swing-aware eighth grid
  (`1.5 × tols(bpm).tight` from `recording.js`: ±0.11 s at 66 bpm; `gridTol()` in `solo.js`).
- **phrases**: runs of 3+ of your notes, a gap of more than a beat (+ the form's acceptance window `tols().win`) between onsets splits.
- **rests**: `rest` and `band` bars that are empty (one note on their first eighth is allowed: a phrase's tail), of all
  such bars. Notes there count for nothing else.
- **targets**: on each chord change (bar 0 is compared with the last bar: the form loops; a second chord on slot 4 is a
  change at slot 4), in a `you` bar, the first note on the first beat of the new chord must be a chord tone. A change with no
  note on that beat is not counted.
- **pitches**: distinct MIDI notes played in your bars.
- **rhythm** (with `rhythm`): share of your bars that play a cell. A bar matches a cell bar when every note is on the grid
  (the grid tolerance above), its onsets are a subset of the cell's, and at least 3/4 of the cell's onsets are played (one
  of four may be missing; an empty bar never matches, an empty cell bar wants silence). With a list, any listed cell will do.
  A two-bar cell (`"bars": 2`) is read by the position inside your stretch of `you` bars. Note lengths are not scored.
  Pass `rhythm` as a share (0.6). Score: `{ ok, total }`; the bar cell gets ♪ (match) or ♩? (no match).
- **motif** (with `call`): share of your answers (a stretch of `you` bars right after the band's stretch) that relate to the
  band's call (its notes are recorded with the run). Without `motif`: any of: the same onsets (|answer ∩ call| / max ≥ 0.6),
  the answer starts on the call's first note or ends on its last (same pitch class), the same contour (`shapeOf`: up / down /
  arch / same, 3+ notes each). `motif: "repeat"`: the same onsets and the same notes (same pitch classes, or the same intervals:
  moved). `motif: "vary"`: the same onsets, other notes (neither the same pitch classes nor the same intervals). An empty
  answer does not relate. `{ ok, total }`.
- **ends** (with `endOn`): the last note of each phrase of 2+ notes (a phrase as in **phrases**) is the third (minor or
  major) or the root of the chord sounding at that note, in any octave. `{ ok, total }`.
A run of several choruses: mean inside / grid / phrases, summed rests / targets / rhythm / motif / ends, the fewest pitches of any chorus. `passed()`
checks only the thresholds present; a ratio with no data passes. The cells get ✓ (clean bar), − (rest broken), ◇ / ◆ (target
hit / missed) after each bar; a board after each chorus and after the run. Passing sets `stages.done` and schedules a review;
a failed run of a due item sends it back to day 1. Progress keeps `runs` and `best: { inside, grid, phrases, pitches, rests, targets, rhythm, motif, ends }`.

### Rhythm cells (`content/solos/rhythms.json`, `jazzlab-rhythms/1`)

`{ "cells": { "<id>": { "title": {…}, "about": {…}, "rhythm": "4. 4 r4.", "bars"?: 2 } } }`. `rhythm` is a rhythm line as in
exercises (`8` eighth, `4` quarter, `2` half, `.` dot, `~` tie, `r` rest) of exactly `bars × 8` eighths (`resolveCells()` checks).
Cells: `even` (8 eighths), `eighth-rest` (8 8 r4 8 8 r4), `anticipation` (4 4 4 r8 8: the and of 4), `start-and` (r8, then
eighths: a rest on 1), `start-two` (a rest on 1, comes in on 2), `charleston` (4. 4 r4.: 1 and the and of 2), `repeated` (8 8 4
twice), `beat3` (r2 8 8 4: from beat 3), `ask-answer` (2 bars: from 1, then from 3). Methodology: the rhythm comes first. A solo
with `rhythm` shows the cell in notation (`rhythmnote.js`) and starts in the «Простучи» (tap) mode: count-in, the app plays the
cell twice, then you tap it on any one key over a click (4 rounds; 3 for a two-bar cell). A round is clean when the taps are
on the eighth grid and are exactly the cell's onsets; all but one round clean = the cell is tapped (progress `tapped: [ids]`).
«Играть» (play) is open once every cell of the solo is tapped. Check: `node tests/motif.test.mjs`.

The band's motif (`motif`): `makeMotif()` in `solo.js`: 4–5 palette notes on one of five fixed one-bar rhythms, a small step
pattern, starting on a chord tone, inside the hand. Played once per `band` bar.

Every run is recorded like a performance: store `recordings`, `kind: "solo"`, plus `band` (the band's call notes, for the
playback) and `score`; the last 10 solo recordings are kept apart from the last 10 performances. The day queue takes at most
one `solo` item a day (`freshItems()`). Check: `node tests/solo.test.mjs`.

The blues track's `imp` section («Импровизация», after `rh`): `imp-b1` `blues-scale` (blues scale C, 2 on / 2 off),
`imp-b2` `blues-call` (call and response), `imp-b3` `blues-chords` (chordscale, targets), `imp-b4` `blues-solo` (3 choruses).
The bossa track's `imp` (after `rh`): `imp-bo1` `bossa-minor` (scales: C aeolian on bars 1–8 and 13–16, Db major on 9–12;
2 on / 2 off), `imp-bo2` `bossa-call`, `imp-bo3` `bossa-chords` (chordscale, targets), `imp-bo4` `bossa-solo` (2 choruses);
form `blue-bossa` (`style: "bossa"`: straight eighths, the bossa groove, no swing switch), pattern `b2`, hand 60–72.
The std track's `imp` (after `tunes`): `imp-s1` `std-key` (scales: F major on bars 1–16 and 25–32, Bb major on 17–24),
`imp-s2` `std-call`, `imp-s3` `std-chords` (chordscale, targets; two-chord bars switch the palette on slot 4), `imp-s4`
`std-solo` (1 chorus); form `std-f`, pattern `s2`, swing, hand 60–74. Rhythm / motif items (after the first of each track): blues `imp-b1r` `blues-eighths`, `imp-b2e` `blues-echo` (repeat),
`imp-b2r` `blues-charleston`, `imp-b3r` `blues-anticipation`, `imp-b3v` `blues-vary`; bossa `imp-bo1r` `bossa-start-and`,
`imp-bo2a` `bossa-anticipation`, `imp-bo2e` `bossa-echo`, `imp-bo3v` `bossa-vary`; std `imp-s1r` `std-displaced`, `imp-s2m`
`std-answer` (motif 0.5), `imp-s2q` `std-ask` (two-bar cell), `imp-s3e` `std-end-third`. Glossary: `improvisation`, `palette`, `target-note`;
reference article `content/wiki/improvisation.json`.
