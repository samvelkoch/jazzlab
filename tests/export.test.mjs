// Checks the JS exporter against the reference Python exporter output (scripts/reference/export_ex2.py).
// Run: node tests/export.test.mjs   (needs python3 for the reference)
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { normalize } from '../app/js/music/exercise.js';
import { toMusicXML, toMidiFile } from '../app/js/music/export.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ex = normalize(JSON.parse(readFileSync(join(root, 'content/exercises/s1-e2.json'), 'utf8')));
const out = mkdtempSync(join(tmpdir(), 'jl-'));
execFileSync('python3', ['-I', join(root, 'scripts/reference/export_ex2.py'), out]);

// 1) MusicXML: identical except title + software tag
const ref = readFileSync(join(out, 'week1-ex2.musicxml'), 'utf8')
  .replace('jazzlab export_ex2.py', 'jazzlab').replace('Week 1 - Exercise 2', 'T');
assert.equal(toMusicXML(ex, 'T'), ref, 'MusicXML differs from reference');

// 2) MIDI: same note events (tick, pitch, on/off); velocities within ±1 (Python rounds half to even)
function notes(buf, title) {
  const b = Buffer.from(buf);
  const ev = [];
  let p = 14;
  while (p < b.length) {
    assert.equal(b.toString('latin1', p, p + 4), 'MTrk');
    const len = b.readUInt32BE(p + 4); let q = p + 8; const end = q + len; let t = 0, run = 0;
    while (q < end) {
      let d = 0, c; do { c = b[q++]; d = (d << 7) | (c & 0x7f); } while (c & 0x80); t += d;
      let st = b[q];
      if (st === 0xff) { const l = b[q + 2]; q += 3 + l; continue; }
      if (st & 0x80) { run = st; q++; } else st = run;
      const kind = st & 0xf0;
      if (kind === 0xc0) { q += 1; continue; }
      ev.push([t, kind, b[q], b[q + 1]]); q += 2;
    }
    p = end;
  }
  return ev.sort((a, c) => a[0] - c[0] || a[2] - c[2] || a[1] - c[1]);
}
const a = notes(toMidiFile(ex, 'Week 1 - Exercise 2'));
const r = notes(readFileSync(join(out, 'week1-ex2.mid')));
assert.equal(a.length, r.length, 'MIDI event count');
a.forEach((e, i) => {
  const f = r[i];
  assert.deepEqual(e.slice(0, 3), f.slice(0, 3), `MIDI event ${i}`);
  assert.ok(Math.abs(e[3] - f[3]) <= 1, `velocity ${i}: ${e[3]} vs ${f[3]}`);
});
console.log(`ok: MusicXML identical, ${a.length} MIDI events match`);
