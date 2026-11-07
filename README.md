# Jazzlab

Learning app for jazz, blues and bossa nova piano for a self-taught adult. Ear first, chunks not notes, slow is fine.
Design: `docs/specs/2026-11-07-jazz-course-design.md`.

Live: https://samvelkoch.github.io/jazzlab/ (on iPad open it in **MIDIWeb** to connect a digital piano over Bluetooth MIDI)

## Structure

- `index.html` + `app/` — the app (vanilla JS modules, no build step)
  - `app/js/screens/` — track (home, one-tap session), drill, form, exercise, improvisation, the book course
  - `app/js/music/` — exercise model, forms/patterns generator, staff (SVG), keyboard, synth, drums, MIDI input, MusicXML/MIDI export
  - `app/js/store.js` — progress, spaced review (1/3/7/14/30 days), session queue
  - `app/css/app.css` — palette «Босса», light + dark
- `content/` — tracks, forms, left-hand patterns, courses and exercises as JSON ([format](content/FORMAT.md))
- `guide/` — the original one-page keyboard guide (`src/piano-guide.html` → `scripts/build.sh`)
- `tests/export.test.mjs` — export check against the reference Python exporter (`scripts/reference/`)

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
node tests/export.test.mjs
node tests/forms.test.mjs
```

## Credits

Piano sound: Salamander Grand Piano V2 by Alexander Holm (CC-BY 3.0), see `app/samples/piano/CREDITS.md`.
