# Accompaniment mode (2026-11-21)

## Why

The user wants free play: a light background band in a chosen style, and they improvise over it with the right hand.
No task, no score, no pass. The screen only tells which keys sound good now and which keys end a phrase («дом» / «висит»),
as the phrase screens do. The existing improvisation items (`#/imp/sN`, kind `solo`) are exercises: fixed notes or rhythm,
fixed form and pattern, N choruses, thresholds. This mode has none of that: pick a style, a form, a tempo; the band loops
until Stop.

## Entry

- Route `#/jam` and `#/jam/<formId>` (preselects the form). New screen `app/js/screens/jam.js`.
- A card «Аккомпанемент» in the aside of every track home (`app/js/screens/track.js`), linking to `#/jam/<the track's first form>`.
- Nothing is written to progress, reviews or recordings. Practice time is counted (`markActive`) like on other screens.

## Content: `content/jam.json` (`jazzlab-jam/1`)

```
{ "forms": ["blues-c", ...all ids of content/forms, in menu order],
  "simple": { "blues-c": { "palette": { "mode": "scale", "scale": "blues", "root": "C" } },   // same shape as solo.palette
              "blue-bossa": { "palette": { "mode": "scales", "parts": [...] } }, ... },
  "styles": [ { "id": "slow-blues", "title": {ru,en}, "tempo": 60, "swing": true, "drums": "swing" | "straight" | "bossa",
                "drumGain": 1, "walk": false,
                "bass": [ { "level": 1, "pattern": "p1" } | { "level": 2, "events": [{ "t", "d", "deg", "stac"? }] } ],
                "comp": [ { "level": 1, "events": [{ "t", "d" }] }, ... ]  // when the shell chord sounds; [] events = silent bar
              } ] }
```

- `simple` palettes are copied from the existing solos (blues scale in C for the three blues forms, the `scales` parts of
  `bossa-minor` for Blue Bossa, of `std-key` for the standard in F). Forms without one offer only «по аккордам».
- A bass cell names an existing bass pattern of `content/patterns` (only its single-degree events are used) or carries its
  own events. Degrees are semitones above the root, fitted to the chord by `fitDeg`.
- Styles: slow blues (swing drums; p1, p1q, root-and-octave), swing (`walk: true`: a generated walking bass; comp cells:
  Charleston, the «and» of 2, 2 and 4, rest), boogie (p2 and variants: up, up-down, with the octave; sparse comp),
  bossa (bossa drums; b1, b2; comp on the c1 / c2 / c3 rhythms), ballad (straight drums, low gain; half notes, whole
  note; long chord, slow arpeggio of the shell). 3–4 cells per layer, levels 1 (plain) to 3 (busy).
- Any style plays over any form. Default style of a form: `bossa` when `form.style === 'bossa'`, else `swing`
  (`slow-blues` for the 12-bar forms).

## Generator: `app/js/music/jam.js` (pure, no DOM, no audio; `tests/jam.test.mjs`)

- `resolveStyle(style, patterns)`: cells with a `pattern` get that pattern's events.
- `makeChorus(style, bars, { chorus, variety, rng, prev })` → `{ bars: [{ notes: [{ t, d, m, v, stac, part: 'bass'|'comp' }], bassCell, compCell, fill }], prev }`.
  - Cells are chosen per block of 4 bars (`variety: 'high'`: per 2 bars), never inside a block. `variety: 'low'`: always the
    first cell of each layer. `high`: random among cells with `level <= 1 + chorus` (capped at 3), no cell twice in a row
    when there is a choice.
  - Bass register: root at `36 + pc` (C2..B2). Comp: the shell (3rd + 7th via `fitDeg([4, 10])`), voice-led with `leadPair`
    in its C3..B3 window, threaded through `prev` across bars and choruses. Two-chord bars use `chordAt(bar, t)`.
  - `walk`: four quarter notes per bar: beat 1 the root, beats 2–3 chord or scale tones moving by step or third, beat 4 a
    semitone or scale step into the next bar's root (the form loops: the last bar approaches bar 1). A two-chord bar puts
    the second root on beat 3. Stay within 33..52; `rng` picks among the candidates.
  - `fill: true` on the last bar of the chorus (`variety: 'high'` only also on the last bar of every 4-bar block with p = 0.25).
- `fillHits(style, slot)` → `[{ kind, v }]` drum hits added in a fill bar (second half of the bar; swung styles: kick + hat
  on the off-beats of beats 3–4; bossa: rim on the last three eighths).
- `endKeys(mode, pal, simple)` → `{ home: Set<pc>, hang: Set<pc> }`. `mode: 'chords'`: home = root and third of the current
  chord, hang = its seventh (a triad or a 6th chord: the fifth). `mode: 'simple'`: home = the root of the form's scale (as on
  the phrase screens), hang = the scale's 5th-from-root and 10th-from-root semitone pcs when in the scale (the blues: G, B♭).
- `nextChange(bars, bar, slot)` → `{ chord, inBars }`: the next different chord (the form loops), `null` for a one-chord form.

`groove()` in `drums.js` gets an optional `gain` (multiplies every velocity, default 1); nothing else changes there.

## Screen

Top to bottom: header (back, «Аккомпанемент · form title», MIDI chip, theme) · style chips · form select, tempo − / +,
background volume (5 steps), variety «мало / много», palette «по аккордам / одна гамма» · the strip **Сейчас** (chord,
«дом: C E · висит: B♭», the palette line) and **Дальше** (next chord, «через N тактов», its «дом») · the bar grid of the
form with the current bar marked and the chorus counter · the keyboard C4..C6 · Start / Stop.

- Keyboard marks (`kb.mark`): palette notes `pal`, home keys `base` + badge «дом», hang keys `seventh` + badge «висит».
  They repaint when the chord changes (per half bar on two-chord bars). The palette comes from `paletteAt` (`music/solo.js`)
  with `{ palette }` = chord scales or the form's `simple` palette.
- Transport: 4 clicks, then the band loops; the next chorus is generated at the start of the last bar of the current one.
  Look-ahead scheduler on the audio clock (25 ms timer, 150 ms ahead), swing as on the solo screen (off-beat at 2/3).
  Style, form, variety, tempo change only while stopped (controls are disabled while playing); volume and palette mode
  apply live.
- Volume scales the velocities of the band (drums via `gain`, notes via `v`); the user's own keys are not scaled.
- Input: MIDI keys and on-screen keys light the keyboard; on-screen keys sound through `audio.pianoNote`. Nothing is judged.
- Note names: `settings.names` ('en' | 'ru' | 'both' | 'off'); on keys 'both' → letters, in text 'off' → letters.
  Chord symbols stay letters.
- Choices persist in the store under `jam` (`{ style, form, vol, variety, mode, bpm: { [style]: n } }`).
- Phone (≤ 640 px): controls wrap, the strip cards stack, the bar grid scrolls with the current bar in view, the keyboard
  scrolls sideways (existing behaviour of `createKeyboard`).

## Shared files

`i18n.js` (keys `jam*`, appended at the end of each language block), `app.css` (a `jam` section appended at the end;
`.formscreen` / `.fgrid` / `.fcell` rules untouched), `main.js` (one import, one route), `track.js` (one card),
`content/FORMAT.md` (a «Jam» section appended).
