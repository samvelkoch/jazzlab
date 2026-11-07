// Pattern -> exercise generator and chord helpers. Run: node tests/forms.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { normalize, buildSteps } from '../app/js/music/exercise.js';
import { parseChord, chordPcs, patternExercise, patternBar, lhRoot, spell } from '../app/js/music/forms.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

assert.deepEqual(chordPcs('C7'), [0, 4, 7, 10]);
assert.deepEqual(chordPcs('F7'), [5, 9, 0, 3]);
assert.deepEqual(chordPcs('Bb7'), [10, 2, 5, 8]);
assert.equal(lhRoot(parseChord('C7')), 48, 'C -> C3');
assert.equal(lhRoot(parseChord('F7')), 41, 'F -> F2');
assert.equal(lhRoot(parseChord('G7')), 43, 'G -> G2');
assert.equal(spell(46, true), 'Bb2'); assert.equal(spell(46, false), 'A#2');

const p1 = read('content/patterns/p1.json'), form = read('content/forms/blues-c.json');
const ex = normalize(patternExercise(p1, form.practice, { id: 'x', swing: form.swing }));
assert.equal(ex.bars.length, 4);
assert.deepEqual(ex.bars[0].lh.map((e) => e.notes[0]), ['C3', 'G3']);
assert.deepEqual(ex.bars[1].lh.map((e) => e.notes[0]), ['F2', 'C3']);
assert.deepEqual(ex.bars[2].lh.map((e) => e.notes[0]), ['G2', 'D3']);
assert.deepEqual(ex.bars[0].lh.map((e) => e.f[0]), [5, 1]);
assert.equal(buildSteps(ex).length, 32);
assert.equal(ex.passAnyTempo, true);

const bar = patternBar(read('content/patterns/p1q.json'), 'F7');
assert.deepEqual(bar.map((e) => [e.t, e.m]), [[0, 41], [2, 48], [4, 41], [6, 48]]);

// the whole 12-bar form unfolds too
const full = normalize(patternExercise(p1, form.bars, { id: 'y' }));
assert.equal(full.bars.length, 12);
console.log('ok: forms');
