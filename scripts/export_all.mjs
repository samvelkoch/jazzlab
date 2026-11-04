// Export every exercise as MusicXML + MIDI for Piano Marvel, with the same exporter the app uses (⚙ → Piano Marvel).
// Usage: node scripts/export_all.mjs [outDir] [ru|en]   (default: export/piano-marvel, en)
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../app/js/music/exercise.js';
import { toMusicXML, toMidiFile } from '../app/js/music/export.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'export/piano-marvel');
const lang = process.argv[3] || 'en';
const STEP = { ru: 'Шаг', en: 'Step' }[lang];
const dir = join(root, 'content/exercises');
mkdirSync(out, { recursive: true });

const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const exs = files.map((f) => normalize(JSON.parse(readFileSync(join(dir, f), 'utf8'))))
  .sort((a, b) => a.step - b.step || a.number - b.number);
for (const ex of exs) {
  const title = `${STEP} ${ex.step}.${ex.number} - ${ex.title[lang] || ex.title.en}`;
  const base = `step${ex.step}-ex${String(ex.number).padStart(2, '0')}`;
  writeFileSync(join(out, base + '.musicxml'), toMusicXML(ex, title));
  writeFileSync(join(out, base + '.mid'), toMidiFile(ex, title));
  console.log(base, '|', title);
}
console.log(`${exs.length} exercises -> ${out}`);
