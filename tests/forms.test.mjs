// Pattern -> exercise generator and chord helpers. Run: node tests/forms.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { normalize, buildSteps } from '../app/js/music/exercise.js';
import { parseChord, chordPcs, patternExercise, patternBar, expectedAtSlot, lhRoot, spell, rhRoot, lickNotes, lickExercise } from '../app/js/music/forms.js';

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

// p2 "boogie": eight eighths per bar, b7 spelled as a flat over every chord
const p2 = read('content/patterns/p2.json');
assert.ok(form.patterns.includes('p2'));
const bx = normalize(patternExercise(p2, form.practice, { id: 'b', swing: form.swing }));
assert.deepEqual(form.practice, ['C7', 'F7', 'G7', 'C7']);
assert.deepEqual(bx.bars[0].lh.map((e) => e.notes[0]), ['C3', 'E3', 'G3', 'A3', 'Bb3', 'A3', 'G3', 'E3']);
assert.deepEqual(bx.bars[0].lh.map((e) => e.f[0]), [5, 3, 2, 1, 1, 1, 2, 3]);
assert.deepEqual(bx.bars[0].lh.map((e) => [e.t, e.d, e.stac]), [0, 1, 2, 3, 4, 5, 6, 7].map((t) => [t, 1, false]));
assert.deepEqual(bx.bars[1].lh.slice(0, 5).map((e) => e.notes[0]), ['F2', 'A2', 'C3', 'D3', 'Eb3']);
assert.deepEqual(bx.bars[2].lh.slice(0, 5).map((e) => e.notes[0]), ['G2', 'B2', 'D3', 'E3', 'F3']);
assert.deepEqual(bx.bars[3].lh.map((e) => e.notes[0]), bx.bars[0].lh.map((e) => e.notes[0]));
assert.equal(bx.tempo.start, 56); assert.equal(bx.swing, true);
assert.equal(buildSteps(bx).filter((s) => s.lh).length, 32, 'every eighth has a left-hand note');
assert.deepEqual(patternBar(p2, 'C7').map((e) => e.m), [48, 52, 55, 57, 58, 57, 55, 52]);
assert.deepEqual([0, 4].map((s) => [...expectedAtSlot(p2, 'F7', s)]), [[41], [51]]);
// the boogie under a lick keeps the flat too
assert.equal(normalize(lickExercise(read('content/licks/l1.json'), 'C7', p2)).bars[0].lh[4].notes[0], 'Bb3');
// clean-chorus allowance in the form screen: max(1, round(notes per chorus / 40))
const slips = (pat) => Math.max(1, Math.round(form.bars.flatMap((c) => patternBar(pat, c)).length / 40));
assert.deepEqual([p1, read('content/patterns/p1q.json'), p2].map(slips), [1, 1, 2]);

// the blues ending: a normal 2-bar exercise, linked from the form
const end = normalize(read('content/exercises/blues-end.json'));
assert.equal(form.ending, 'blues-end');
assert.equal(end.bars.length, 2); assert.equal(end.passAnyTempo, true); assert.equal(end.swing, true);
assert.deepEqual([end.tempo.start, end.tempo.target], [56, 66]);
assert.deepEqual(end.bars[0].rh.map((e) => [e.t, e.d, e.notes.join(' '), e.acc]), [[0, 2, 'E4 G4 Bb4', true], [7, 1, 'F4 Ab4 B4', false]]);
assert.deepEqual(end.bars[0].lh.map((e) => [e.t, e.d, e.notes.join(' ')]), [[0, 2, 'C3 G3'], [7, 1, 'Db3 Ab3']]);
assert.deepEqual(end.bars[1].rh.map((e) => [e.t, e.d, e.notes.join(' '), e.f.join('')]), [[0, 8, 'E4 G4 Bb4 C5', '1235']]);
assert.deepEqual(end.bars[1].lh.map((e) => [e.t, e.d, e.notes.join(' '), e.f.join('')]), [[0, 8, 'C2 C3', '51']]);
assert.ok(end.bars.every((b) => [...b.rh, ...b.lh].every((e) => !e.stac)));
const blues = read('content/tracks/blues.json');
assert.deepEqual(blues.items['end-blues'], { kind: 'exercise', ex: 'blues-end' });
assert.ok(blues.sections.find((s) => s.id === 'form').items.join(' ').includes('form-p1q form-p2 end-blues'));
assert.ok(blues.sections.find((s) => s.id === 'lh').items.join(' ').includes('pat-p1q pat-p2'));
Object.values(blues.items).forEach((it) => { if (it.pattern) read(`content/patterns/${it.pattern}.json`); });

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
