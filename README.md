# Jazzlab

A browser course in jazz piano and improvisation: from note names to your own solo over a form.
Ear training, chords as hand shapes, left-hand groove, a vocabulary of phrases, whole tunes, scored improvisation,
recorded performances and spaced review, in three styles (blues, bossa nova, standards) with a growing repertoire.
Passing is by cleanliness, not tempo. No account, no build step, no server: static files on GitHub Pages.

**Live:** https://samvelkoch.github.io/jazzlab/ · **How to use:** `#/help` in the app ·
**Design:** [course](docs/specs/2026-11-07-jazz-course-design.md), [standard track](docs/specs/2026-11-07-standard-design.md), [improvisation](docs/specs/2026-11-08-improvisation-design.md)

## What is inside

Three tracks, one per style. Each builds the full skill set and carries its own repertoire:

| Track | Repertoire so far | Left hand | New skill |
|---|---|---|---|
| Blues | 12-bar blues in C; St. Louis Blues, Tin Roof Blues | root–fifth, boogie, shell | swing, licks, question and answer |
| Bossa nova | Blue Bossa (16 bars, C minor) | bossa cell, bass + chord | straight eighths, independence of hands, ii–V |
| Standards | A standard in F (AABA), Bye Bye Blackbird, Sweet Georgia Brown, Honeysuckle Rose, Ain't Misbehavin', Tea for Two | voice-led shell | key changes, ii–V–I licks, voice leading |

Every track has the same sections: Keyboard (drills), Left hand (patterns), Form (the tune on a loop with drums),
Right hand (licks), Ear, Tune (melodies learned by echo), Improvisation, Performance (recorded), Check-up.
A one-tap session builds the day from due reviews, the next new item and a chorus of the form.

Plus: the **Riffs** course (25 short exercises in 10 steps, each with a rhythm stage and a small improvisation: steps 1–5 from
the book, steps 6–10 original: blues scale, ii–V–I, bossa, question and answer, turnaround), the **Chords** mode
(decoder for any chord symbol, key names, chord lessons and practice), a **glossary** (every professional term is underlined and
explained where it appears) and a **Reference** (short articles on styles, concepts, tunes and people, with sources).

### Mechanics

- **Echo → Fingers → By heart** for licks and melodies; **Rhythm → Notes → In tempo → By heart** for patterns and book exercises.
- **Passing is by cleanliness, not tempo.** Tempo is a separate optional scale. A clean chorus of the form allows one slip per 40 notes; three clean choruses in a row pass.
- **Spaced review:** 1 / 3 / 7 / 14 / 30 days, played from memory; a miss resets to one day. Due reviews open every session.
- **One-tap session by budget:** 10 / 20 / 40 minutes (3 / 4 / 6 reviews + 1 / 2 / 3 new items). New items follow each track's learning order (`path`: ear first, the whole form in week one, drills alongside), not the section order; reviews due in other tracks are listed under the day's queue.
- **Both hands over the form:** after the right-hand form steps, a scored step where you play the left-hand pattern and the lick or tune together, with drums only.
- **Improvisation** scores four things instead of "the right notes": inside the palette (scale or chord tones, approach notes allowed), on the eighth grid, phrases and rests, target notes on chord changes. Four steps per track: scale with rests, call and response with the band, chord tones on the change, a full solo. Every run is recorded.
- **Keyboard input:** Web MIDI (USB or Bluetooth) or the on-screen keyboard (scrollable on phones). The app can play the band and the hints through the connected piano.
- **Recordings** of performances and solos download as MIDI; exercises export to MusicXML and MIDI.
- **Themes:** five jazz palettes (Bossa, Studio, Club, Blue Note, Vinyl), light and dark, all WCAG-checked by a test.
- Russian and English UI.

### Connecting a piano

- Desktop: Chrome, Edge or Opera (Safari has no Web MIDI). USB or Bluetooth MIDI, then "Connect piano" in the header.
- iPad / iPhone: Safari has no Web MIDI (as of November 2026). Open the site in the free **MIDIWeb Browser**
  (App Store, iPadOS 17.6+), which exposes `navigator.requestMIDIAccess` and a Bluetooth MIDI dialog the app can open.
- Android: Chrome supports Web MIDI.

## Repository layout

```
index.html, app/          the app (vanilla JS ES modules, no bundler)
  app/js/main.js          hash router, content loading
  app/js/screens/         track (home), drill, lick, melody, form, solo, perform, ear, diag, exercise, rhythm-stage,
                          improv (book), course (book), chords, wiki
  app/js/music/           chords, forms (patterns, licks, melodies, voice leading), scales, solo scoring,
                          staff (SVG), keyboard, audio (synth + Salamander samples), drums, midi, recording, export
  app/js/store.js         progress, spaced review, sessions      app/js/queue.js   the day's fresh items
  app/js/glossary*.js     term matching and popovers              app/js/theme.js   palettes
  app/css/app.css         all styles, 5 schemes × light/dark, phone rules
content/                  all learning content as JSON, documented in content/FORMAT.md
  tracks/  forms/  patterns/  licks/  melodies/  solos/  exercises/  courses/  chords/  wiki/  glossary.json  help.json
scripts/import_tune.py    MusicXML / MXL lead sheet → melody + form JSON (repeats, pickups, chord symbols)
docs/specs/               design documents
tests/*.test.mjs          plain node tests (forms, solo, exercise, chords, glossary, wiki, theme, recording, export, store, tracks)
guide/                    the original one-page keyboard guide
```

## Content and sources

- Tunes are imported, not written from memory: public-domain lead sheets from [OpenEWLD](https://github.com/00sapo/OpenEWLD)
  (MusicXML) via `scripts/import_tune.py`, or transcribed from first-edition scans. Each melody JSON records its `source`.
  Adding a tune is one importer run plus a few lines in the track JSON (see `content/FORMAT.md`).
- Blue Bossa and "A standard in F" are original pieces written in the style; the Reference tells which is which.
- Reference articles cite their sources and link outward (Wikipedia, IMSLP, Commons images with licences).
- Piano sound: Salamander Grand Piano V2 by Alexander Holm (CC-BY 3.0), see `app/samples/piano/CREDITS.md`.

## Run and test locally

```sh
python3 -m http.server 8000      # then open http://localhost:8000
for f in tests/*.test.mjs; do node "$f"; done
```

Import a tune:

```sh
python3 scripts/import_tune.py path/to/tune.mxl --id my-tune --transpose -2 --flats --practice "Gm7 C7 Fmaj7" --patterns s1,s2
```

## Status

Everything is playable in the browser and verified in emulation; tolerance windows have not yet been tuned on a real
instrument with real learners. Feedback on passes that feel too strict or too generous is the most useful input.
