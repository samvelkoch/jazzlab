// Accompaniment mode: the band generator, end keys, next change, content/jam.json. Run: node tests/jam.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { resolveStyle, makeChorus, fillHits, endKeys, nextChange, shellDegs, defaultStyle, BASS_LO, BASS_HI } from '../app/js/music/jam.js';
import { parseChord, chordAt } from '../app/js/music/forms.js';
import { paletteAt } from '../app/js/music/solo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const sorted = (s) => [...s].sort((a, b) => a - b);
const pcm = (m) => ((m % 12) + 12) % 12;
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- content ----------
const jam = read('content/jam.json');
assert.equal(jam.$format, 'jazzlab-jam/1');
const formFiles = readdirSync(join(root, 'content/forms')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
assert.deepEqual(jam.forms.slice().sort(), formFiles.slice().sort(), 'jam.forms = the files in content/forms');
assert.equal(new Set(jam.forms).size, jam.forms.length);
Object.keys(jam.simple).forEach((id) => assert.ok(jam.forms.includes(id), `simple palette for an unknown form ${id}`));
// the simple palettes are the solos' palettes
assert.deepEqual(jam.simple['blues-c'].palette, read('content/solos/blues-scale.json').palette);
assert.deepEqual(jam.simple['blue-bossa'].palette, read('content/solos/bossa-minor.json').palette);
assert.deepEqual(jam.simple['std-f'].palette, read('content/solos/std-key.json').palette);
const patterns = {};
readdirSync(join(root, 'content/patterns')).forEach((f) => { const p = read(`content/patterns/${f}`); patterns[p.id] = p; });
const styles = jam.styles.map((s) => resolveStyle(s, patterns));
assert.deepEqual(styles.map((s) => s.id), ['slow-blues', 'swing', 'boogie', 'bossa', 'ballad']);
styles.forEach((s) => {
  assert.ok(s.title.ru && s.title.en && s.tempo > 0 && ['swing', 'straight', 'bossa'].includes(s.drums), s.id);
  assert.ok(s.walk || s.bass.length >= 3, `${s.id}: 3+ bass cells`);
  assert.ok(s.comp.length >= 3 && s.comp.length <= 4, `${s.id}: 3-4 comp cells`);
  [...s.bass, ...s.comp].forEach((c) => assert.ok([1, 2, 3].includes(c.level), `${s.id}/${c.id}: level`));
  s.bass.forEach((c) => {
    assert.ok(c.events.some((e) => e.t === 0 && e.deg === 0), `${s.id}/${c.id}: root on 1`);
    assert.ok(c.events.every((e) => !Array.isArray(e.deg)), `${s.id}/${c.id}: single degrees`);
  });
  if (!s.walk) assert.equal(s.bass[0].level, 1); assert.equal(s.comp[0].level, 1);
});
// a pattern cell takes the pattern's single-degree events
assert.deepEqual(styles.find((s) => s.id === 'bossa').bass[0].events, [{ t: 0, d: 3, deg: 0 }, { t: 3, d: 5, deg: 7 }]);
assert.throws(() => resolveStyle({ id: 'x', bass: [{ level: 1, pattern: 'nope' }], comp: [] }, patterns));

// ---------- the generator: every style over every form ----------
const forms = Object.fromEntries(jam.forms.map((id) => [id, read(`content/forms/${id}.json`)]));
let maxLeap = 0, checked = 0;
for (const style of styles) {
  for (const id of jam.forms) {
    const bars = forms[id].bars, NB = bars.length;
    for (const variety of ['low', 'high']) {
      const rng = mulberry32(id.length * 977 + style.id.length * 31 + (variety === 'high' ? 7 : 0));
      let prev = null, lastWalk = null;
      for (let c = 0; c < 3; c++) {
        const ch = makeChorus(style, bars, { chorus: c, variety, rng, prev });
        prev = ch.prev;
        const tag = `${style.id} / ${id} / ${variety} / chorus ${c}`;
        assert.equal(ch.bars.length, NB, tag);
        const B = variety === 'high' ? 2 : 4;
        ch.bars.forEach((b, k) => {
          const at = `${tag} / bar ${k + 1}`;
          b.notes.forEach((n) => {
            assert.ok(Number.isInteger(n.t) && n.t >= 0 && n.t <= 7, `${at}: t ${n.t}`);
            assert.ok(Number.isInteger(n.d) && n.d >= 1 && n.t + n.d <= 8, `${at}: d ${n.d} at ${n.t}`); // no ties: nothing crosses the bar line
            assert.ok(n.m >= 28 && n.m <= 72, `${at}: m ${n.m}`);
            assert.ok(n.v > 0 && n.v <= 1 && ['bass', 'comp'].includes(n.part), at);
          });
          const r0 = parseChord(chordAt(bars[k], 0)).pc;
          assert.ok(b.notes.some((n) => n.part === 'bass' && n.t === 0 && pcm(n.m) === r0), `${at}: bass root on 1`);
          if (k % B) { assert.equal(b.bassCell, ch.bars[k - 1].bassCell, `${at}: bass cell inside a block`); assert.equal(b.compCell, ch.bars[k - 1].compCell, `${at}: comp cell inside a block`); }
          if (variety === 'low') { assert.equal(b.compCell, 0, at); assert.equal(b.bassCell, style.walk ? 'walk' : 0, at); }
          if (k === NB - 1) assert.equal(b.fill, true, at);
          else if (variety === 'low') assert.equal(b.fill, false, at);
          b.notes.filter((n) => n.part === 'comp').forEach((n) => assert.ok(n.m >= 48 && n.m <= 59, `${at}: comp in C3..B3`));
        });
        if (variety === 'high') {
          const maxLevel = Math.min(3, 1 + c);
          ch.bars.forEach((b) => { assert.ok((style.comp[b.compCell].level || 1) <= maxLevel); if (!style.walk) assert.ok((style.bass[b.bassCell].level || 1) <= maxLevel); });
        }
        if (style.walk) {
          ch.bars.forEach((b, k) => {
            const at = `${tag} / bar ${k + 1}`;
            const bass = b.notes.filter((n) => n.part === 'bass');
            assert.deepEqual(bass.map((n) => n.t), [0, 2, 4, 6], `${at}: four quarters`);
            bass.forEach((n) => assert.ok(n.m >= BASS_LO && n.m <= BASS_HI, `${at}: walk in ${BASS_LO}..${BASS_HI}: ${n.m}`));
            const two = bars[k].trim().split(/\s+/).length > 1;
            if (two) assert.equal(pcm(bass[2].m), parseChord(chordAt(bars[k], 4)).pc, `${at}: second root on beat 3`);
            const seq = lastWalk ? [lastWalk[3], ...bass.map((n) => n.m)] : bass.map((n) => n.m);
            for (let i = 1; i < seq.length; i++) {
              const leap = Math.abs(seq[i] - seq[i - 1]);
              maxLeap = Math.max(maxLeap, leap);
              assert.ok(leap <= 7, `${at}: leap ${leap} (${seq.join(' ')})`);
            }
            if (lastWalk) assert.ok(Math.abs(bass[0].m - lastWalk[3]) <= 2, `${at}: approach into the bar (${lastWalk[3]} → ${bass[0].m})`);
            lastWalk = bass.map((n) => n.m);
          });
        }
        checked++;
      }
    }
  }
}
assert.equal(checked, styles.length * jam.forms.length * 2 * 3);
console.log(`  walking bass: max leap ${maxLeap} semitones over ${jam.forms.length} forms`);

// the same seed gives the same band
const sw = styles.find((s) => s.id === 'swing');
assert.deepEqual(makeChorus(sw, forms['std-f'].bars, { variety: 'high', rng: mulberry32(5) }), makeChorus(sw, forms['std-f'].bars, { variety: 'high', rng: mulberry32(5) }));
// high variety does change cells somewhere over a long form
const many = makeChorus(styles[0], forms['std-f'].bars, { chorus: 2, variety: 'high', rng: mulberry32(9) });
assert.ok(new Set(many.bars.map((b) => b.compCell)).size > 1);
// two-chord bars: a bass note held over beat 3 is cut there and the second root sounds on beat 3
const bal = styles.find((s) => s.id === 'ballad');
const tb = makeChorus(bal, ['Gm7 C7'], { rng: mulberry32(1) }).bars[0].notes.filter((n) => n.part === 'bass');
assert.deepEqual(tb.map((n) => [n.t, n.d, n.m]), [[0, 4, 43], [4, 4, 36]]);
// the shell: 3rd + 7th, a 6th chord takes its 6th, a triad the major 7th (fitDeg)
assert.deepEqual(shellDegs(parseChord('C7')), [4, 10]);
assert.deepEqual(shellDegs(parseChord('Cm7')), [3, 10]);
assert.deepEqual(shellDegs(parseChord('F6')), [4, 9]);
assert.deepEqual(shellDegs(parseChord('Gm6')), [3, 9]);
assert.deepEqual(shellDegs(parseChord('F')), [4, 11]);

// ---------- fills ----------
const sb = styles[0], bo = styles.find((s) => s.id === 'bossa');
for (let s = 0; s < 4; s++) { assert.deepEqual(fillHits(sb, s), []); assert.deepEqual(fillHits(bo, s), []); }
assert.deepEqual(fillHits(sb, 5).map((x) => x.kind), ['kick', 'hat']);
assert.deepEqual(fillHits(sb, 6), []);
assert.deepEqual([4, 5, 6, 7].map((s) => fillHits(bo, s).length), [0, 1, 1, 1]);

// ---------- end keys ----------
let ek = endKeys('chords', paletteAt({}, ['C7'], 0, 0));
assert.deepEqual(sorted(ek.home), [0, 4]); assert.deepEqual(sorted(ek.hang), [10]);
ek = endKeys('chords', paletteAt({}, ['F'], 0, 0));
assert.deepEqual(sorted(ek.home), [5, 9]); assert.deepEqual(sorted(ek.hang), [0]); // a triad: its fifth
ek = endKeys('chords', paletteAt({}, ['F6'], 0, 0));
assert.deepEqual(sorted(ek.hang), [0]);
ek = endKeys('chords', paletteAt({}, ['Cm7'], 0, 0));
assert.deepEqual(sorted(ek.home), [0, 3]); assert.deepEqual(sorted(ek.hang), [10]);
ek = endKeys('chords', paletteAt({}, ['Fmaj7'], 0, 0));
assert.deepEqual(sorted(ek.hang), [4]);
ek = endKeys('chords', paletteAt({}, ['C#dim7'], 0, 0));
assert.deepEqual(sorted(ek.hang), [10]); // C# + 9 = B♭
ek = endKeys('simple', paletteAt(jam.simple['blues-c'], forms['blues-c'].bars, 4, 0));
assert.deepEqual(sorted(ek.home), [0]); assert.deepEqual(sorted(ek.hang), [7, 10]); // G, B♭
ek = endKeys('simple', paletteAt(jam.simple['blue-bossa'], forms['blue-bossa'].bars, 9, 0));
assert.deepEqual(sorted(ek.home), [1]); assert.deepEqual(sorted(ek.hang), [8]); // D♭ major: A♭, no C♭
ek = endKeys('simple', paletteAt(jam.simple['std-f'], forms['std-f'].bars, 0, 0));
assert.deepEqual(sorted(ek.home), [5]); assert.deepEqual(sorted(ek.hang), [0]);

// ---------- next change ----------
const bc = forms['blues-c'].bars;
assert.deepEqual(nextChange(bc, 0, 0), { chord: 'F7', inBars: 4, bar: 4, slot: 0 });
assert.deepEqual(nextChange(bc, 4, 4), { chord: 'C7', inBars: 2, bar: 6, slot: 0 });
assert.deepEqual(nextChange(bc, 11, 0), { chord: 'C7', inBars: 1, bar: 0, slot: 0 }); // wraps around the form end
assert.deepEqual(nextChange(bc, 10, 0), { chord: 'G7', inBars: 1, bar: 11, slot: 0 });
const ta = forms['blues-c-ta'].bars;
assert.deepEqual(nextChange(ta, 10, 0), { chord: 'A7', inBars: 0, bar: 10, slot: 4 });
assert.deepEqual(nextChange(ta, 10, 4), { chord: 'Dm7', inBars: 1, bar: 11, slot: 0 });
assert.deepEqual(nextChange(ta, 11, 4), { chord: 'C7', inBars: 1, bar: 0, slot: 0 });
assert.equal(nextChange(['C7', 'C7'], 1, 0), null);

// ---------- default style ----------
assert.equal(defaultStyle(forms['blues-c']), 'slow-blues');
assert.equal(defaultStyle(forms['blue-bossa']), 'bossa');
assert.equal(defaultStyle(forms['std-f']), 'swing');

console.log('jam: all tests passed');
