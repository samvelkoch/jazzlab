# Jazzlab

Learning app for jazz, blues and bossa nova piano. Rhythm first, notes second.

Live: https://samvelkoch.github.io/jazzlab/ (on iPad open it in **MIDIWeb** to connect a digital piano over Bluetooth MIDI)

## Structure

- `index.html` + `app/` — the app (vanilla JS modules, no build step)
  - `app/js/screens/` — course and exercise screens
  - `app/js/music/` — exercise model, staff (SVG), keyboard, synth, MIDI input, MusicXML/MIDI export
  - `app/css/app.css` — palette «Босса», light + dark
- `content/` — courses and exercises as JSON ([format](content/FORMAT.md))
- `guide/` — the original one-page keyboard guide (`src/piano-guide.html` → `scripts/build.sh`)
- `tests/export.test.mjs` — export check against the reference Python exporter (`scripts/reference/`)

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
node tests/export.test.mjs
```
