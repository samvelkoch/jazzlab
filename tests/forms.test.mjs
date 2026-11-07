// Pattern -> exercise generator and chord helpers. Run: node tests/forms.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { normalize, buildSteps } from '../app/js/music/exercise.js';
import { parseChord, chordPcs, patternExercise, patternBar, lhRoot, spell, rhRoot, lickNotes, lickExercise } from '../app/js/music/forms.js';

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

// right-hand licks
assert.equal(rhRoot(parseChord('C7')), 60, 'C -> C4');
assert.equal(rhRoot(parseChord('F7')), 65, 'F -> F4');
assert.equal(rhRoot(parseChord('G7')), 67, 'G -> G4');
assert.equal(rhRoot(parseChord('Bb7')), 58, 'Bb -> Bb3');
const l1 = read('content/licks/l1.json'), l2 = read('content/licks/l2.json'), l3 = read('content/licks/l3.json');
assert.deepEqual(lickNotes(l1, 'C7').map((e) => e.m), [63, 64, 67, 70, 67, 65, 63, 60]);
assert.equal(lickNotes(l1, 'F7')[7].m, 65, 'l1 over F7 lands on F4');
const lx = normalize(lickExercise(l1, 'C7', p1, { id: 'lick-l1-c7', doneId: 'lick-l1' }));
assert.equal(lx.bars.length, 2);
assert.deepEqual(lx.bars[0].rh.slice(0, 3).map((e) => e.notes[0]), ['Eb4', 'E4', 'G4']);
assert.deepEqual(lx.bars[0].rh.map((e) => e.notes[0]), ['Eb4', 'E4', 'G4', 'Bb4', 'G4', 'F4', 'Eb4']);
assert.deepEqual(lx.bars[1].rh.map((e) => [e.t, e.d, e.notes[0]]), [[0, 4, 'C4']]);
assert.deepEqual(lx.bars[0].rh.map((e) => e.f[0]), [2, 3, 4, 5, 4, 3, 2]);
assert.deepEqual(lx.bars[0].lh.map((e) => e.notes[0]), ['C3', 'G3']);
assert.deepEqual(lx.bars[1].lh.map((e) => e.notes[0]), ['C3', 'G3']);
assert.equal(lx.passAnyTempo, true); assert.equal(lx.swing, true); assert.equal(lx.tempo.start, 66);
assert.equal(lx.doneId, 'lick-l1');
assert.equal(buildSteps(lx).length, 16);
const lf = normalize(lickExercise(l1, 'F7', p1));
assert.equal(lf.bars[1].rh[0].notes[0], 'F4', 'l1 over F7 ends on F4');
assert.deepEqual(lf.bars[0].rh.slice(0, 3).map((e) => e.notes[0]), ['Ab4', 'A4', 'C5']);
assert.deepEqual(lf.bars[0].lh.map((e) => e.notes[0]), ['F2', 'C3']);
assert.equal(lf.id, 'lick-l1-f7');
// the passing #4 is a sharp, blue notes are flats
assert.ok(normalize(lickExercise(l2, 'C7', p1)).bars[0].rh.some((e) => e.notes[0] === 'F#4'));
assert.deepEqual(normalize(lickExercise(l1, 'G7', p1)).bars[0].rh.slice(0, 4).map((e) => e.notes[0]), ['Bb4', 'B4', 'D5', 'F5']);
// a note longer than its bar is clipped (l2: t=5 d=3 ends exactly on the bar line)
['C7', 'F7', 'G7'].forEach((c) => [l1, l2, l3].forEach((l) => normalize(lickExercise(l, c, p1))));
console.log('ok: forms');
