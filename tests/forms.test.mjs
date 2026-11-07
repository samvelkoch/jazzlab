// Pattern -> exercise generator and chord helpers. Run: node tests/forms.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { normalize, buildSteps } from '../app/js/music/exercise.js';
import { parsePattern } from '../app/js/music/rhythm.js';
import { fitDeg, parseChord, chordPcs, patternExercise, patternBar, expectedAtSlot, lhRoot, spell, rhRoot, lickNotes, lickBars, lickExercise, barChords, chordNames } from '../app/js/music/forms.js';

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
assert.ok(blues.sections.find((s) => s.id === 'form').items.join(' ').includes('form-p1q form-p2 form-ta form-p3 end-blues'));
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
// licks l4..l7
const l4 = read('content/licks/l4.json'), l6 = read('content/licks/l6.json');
assert.deepEqual(lickNotes(l4, 'C7').map((e) => e.m), [60, 63, 65, 66, 67, 66, 65, 63, 60]);
assert.equal(lickNotes(l4, 'F7').at(-1).m, 65, 'l4 over F7 ends on F4');
assert.deepEqual(normalize(lickExercise(l6, 'C7', p1)).bars[0].rh.slice(0, 4).map((e) => e.notes[0]), ['Eb4', 'E4', 'Eb4', 'E4']);
const l4rh = normalize(lickExercise(l4, 'C7', p1)).bars[0].rh.map((e) => e.notes[0]);
assert.equal(l4rh[3], 'F#4', 'the passing #4 in l4 is F#4');
assert.ok(!l4rh.includes('Gb4'));
// every lick: slots 0..15, every note ends by slot 16, roles and the pair on the form
const lickFiles = readdirSync(join(root, 'content/licks')).filter((f) => f.endsWith('.json'));
assert.ok(lickFiles.length >= 7);
lickFiles.forEach((f) => {
  const l = read(`content/licks/${f}`);
  assert.equal(l.$format, 'jazzlab-lick/1', f);
  assert.ok(['question', 'answer'].includes(l.role), f);
  l.events.forEach((e) => {
    assert.ok(Number.isInteger(e.t) && e.t >= 0 && e.t <= 15, `${f}: t ${e.t}`);
    assert.ok(e.t + (e.d || 1) <= 16, `${f}: event at ${e.t} ends after slot 16`);
  });
  ['C7', 'F7', 'G7'].forEach((c) => normalize(lickExercise(l, c, p1)));
});
const qa = blues.items['form-rh-qa'];
assert.deepEqual(qa.licks, ['l5', 'l4']);
assert.equal(read('content/licks/l5.json').role, 'question');
assert.equal(read('content/licks/l4.json').role, 'answer');
assert.deepEqual(blues.sections.find((s) => s.id === 'rh').items, ['lick-l1', 'lick-l2', 'lick-l3', 'form-rh-l1', 'form-rh-l3', 'lick-l4', 'lick-l5', 'lick-l6', 'lick-l7', 'form-rh-l4', 'form-rh-l6', 'form-rh-qa']);
Object.values(blues.items).forEach((it) => { if (it.lick) read(`content/licks/${it.lick}.json`); (it.licks || []).forEach((l) => read(`content/licks/${l}.json`)); });

// p3 «Корень и шелл»: root on 1 and 3, third + seventh together on 2 and 4

assert.ok(form.patterns.includes('p3'));
const p3 = read('content/patterns/p3.json');
const sx = normalize(patternExercise(p3, ['C7', 'F7'], { id: 's' }));
assert.deepEqual(sx.bars[0].lh.map((e) => e.t), [0, 2, 4, 6]);
assert.deepEqual(sx.bars[0].lh[1].notes, ['E3', 'Bb3']);
assert.deepEqual(sx.bars[0].lh[1].f, [2, 1]);
assert.deepEqual(sx.bars[0].lh.map((e) => e.notes.join(' ')), ['C3', 'E3 Bb3', 'C3', 'E3 Bb3']);
assert.deepEqual(sx.bars[1].lh[1].notes, ['A2', 'Eb3']);
const p3c = patternBar(p3, 'C7');
assert.equal(p3c.length, 6);
assert.deepEqual(p3c.filter((e) => e.t === 2).map((e) => [e.m, e.f, e.d]), [[52, 2, 2], [58, 1, 2]]);
assert.deepEqual([...expectedAtSlot(p3, 'C7', 2)], [52, 58]);
assert.deepEqual(patternBar(p3, 'F7').filter((e) => e.t === 6).map((e) => e.m), [45, 51]);
assert.equal(buildSteps(sx).filter((s) => s.lh).length, 8);
// a pattern under a lick keeps the two-note event as one event
assert.deepEqual(normalize(lickExercise(l1, 'C7', p3)).bars[0].lh.map((e) => e.notes.join(' ')), ['C3', 'E3 Bb3', 'C3', 'E3 Bb3']);

// two chords in a bar: the first covers slots 0..3, the second slots 4..7
assert.deepEqual(barChords('C7 A7'), ['C7', 'A7']);
assert.deepEqual(barChords('C7'), ['C7']);
assert.throws(() => barChords('C7 H7'));
assert.deepEqual(parseChord('Dm7').offsets, [0, 3, 7, 10]);
assert.deepEqual(chordPcs('A7'), [9, 1, 4, 7]);
assert.deepEqual(chordPcs('Dm7'), [2, 5, 9, 0]);
assert.deepEqual(chordNames('Dm7'), ['D', 'F', 'A', 'C']);
assert.deepEqual(chordNames('A7'), ['A', 'C#', 'E', 'G']);
assert.deepEqual(chordNames('C7'), ['C', 'E', 'G', 'Bb']);
assert.deepEqual(patternBar(p1, 'C7 A7').map((e) => [e.t, e.m, e.chord]), [[0, 48, 'C7'], [4, 52, 'A7']]);
const tx = normalize(patternExercise(p1, ['C7 A7', 'Dm7 G7'], { id: 't' }));
assert.deepEqual(tx.bars[0].lh.map((e) => [e.t, e.notes[0]]), [[0, 'C3'], [4, 'E3']]);
assert.deepEqual(tx.bars[1].lh.map((e) => [e.t, e.notes[0]]), [[0, 'D3'], [4, 'D3']]);
assert.equal(patternExercise(p1, ['C7 A7', 'Dm7 G7']).bars[1].chord, 'Dm7 G7');
assert.deepEqual([...expectedAtSlot(p1, 'Dm7 G7', 4)], [50]);
assert.deepEqual([...expectedAtSlot(p1, 'Dm7 G7', 0)], [50]);
// A7's third is a sharp under the shell
assert.deepEqual(normalize(patternExercise(p3, ['C7 A7'], { id: 'u' })).bars[0].lh.map((e) => e.notes.join(' ')), ['C3', 'E3 Bb3', 'A2', 'C#3 G3']);
// licks over a two-chord bar use its first chord
assert.deepEqual(lickBars(l1, 'C7 A7'), lickBars(l1, 'C7'));

// the turnaround form
const ta = read('content/forms/blues-c-ta.json');
assert.equal(ta.bars.length, 12);
assert.deepEqual(ta.bars.slice(10), ['C7 A7', 'Dm7 G7']);
assert.deepEqual(ta.bars.slice(0, 10), form.bars.slice(0, 10));
ta.bars.forEach((b) => assert.ok(barChords(b).length >= 1));
assert.deepEqual(ta.practice, ['C7', 'A7', 'Dm7', 'G7']);
assert.deepEqual(ta.patterns, ['p1', 'p2', 'p3']);
assert.equal(ta.ending, 'blues-end');
[p1, p2, p3].forEach((p) => { assert.equal(normalize(patternExercise(p, ta.bars, { id: 'z' })).bars.length, 12); normalize(patternExercise(p, ta.practice, { id: 'z' })); });
assert.deepEqual([...new Set(ta.bars.flatMap(barChords))], ['C7', 'F7', 'G7', 'A7', 'Dm7']);
// track items for the shell and the turnaround
const secItems = (id) => blues.sections.find((s) => s.id === id).items;
assert.ok(secItems('lh').join(' ').endsWith('pat-p2 pat-p3 pat-ta'));
assert.equal(secItems('form').at(-1), 'end-blues');
assert.ok(secItems('keys').join(' ').includes('d-chords d-chords-ta'));
assert.deepEqual(blues.items['d-chords-ta'].tasks, [{ type: 'chord', chords: ['A7', 'Dm7'], n: 6 }]);
assert.equal(blues.items['perf-blues'].form, 'blues-c-ta');
Object.values(blues.items).forEach((it) => { if (it.form) read(`content/forms/${it.form}.json`); });
Object.values(blues.items).filter((it) => it.kind === 'drill').forEach((it) => it.tasks.filter((k) => k.type === 'chord').forEach((k) => k.chords.forEach((c) => chordPcs(c))));
console.log('ok: forms');

// pattern degrees follow the chord quality: the shell over Dm7 is F + C, not F# + C
assert.equal(fitDeg(4, parseChord('Dm7')), 3); assert.equal(fitDeg(10, parseChord('Cmaj7')), 11); assert.equal(fitDeg(4, parseChord('C7')), 4);

assert.deepEqual(patternBar(p3, 'Dm7 G7').map((e) => e.m), [50, 53, 60, 43, 47, 53], 'Dm7: D3 F3 C4, G7: G2 B2 F3');
assert.deepEqual(normalize(patternExercise(p3, ['Dm7'], { id: 'z' })).bars[0].lh[1].notes, ['F3', 'C4']);
console.log('ok: fitDeg');

// ---------- bossa: dotted bass cell, flat spelling, the 16-bar Blue Bossa ----------
const b1 = read('content/patterns/b1.json'), b2 = read('content/patterns/b2.json'), bb = read('content/forms/blue-bossa.json');
const lhOf = (pat, bars, opts = {}) => normalize(patternExercise(pat, bars, { id: 'bz', ...opts })).bars.map((b) => b.lh.map((e) => [e.t, e.d, e.notes.join(' '), e.f[0]]));
assert.deepEqual(lhOf(b1, ['Cm7'])[0], [[0, 3, 'C3', 5], [3, 5, 'G3', 1]]);
assert.deepEqual(lhOf(b2, ['Dm7b5'])[0].map((e) => e[2]), ['D3', 'Ab3', 'D3'], 'the b5 of m7b5 is a flat');
assert.deepEqual(lhOf(b2, ['Dm7b5'])[0].map((e) => [e[0], e[1]]), [[0, 3], [3, 3], [6, 2]]);
assert.deepEqual(lhOf(b2, ['Dbmaj7'], { flats: true })[0].map((e) => e[2]), ['Db3', 'Ab3', 'Db3']);
assert.deepEqual(lhOf(b1, ['Ebm7', 'Ab7', 'G7'], { flats: bb.flats }).map((b) => b.map((e) => e[2])), [['Eb3', 'Bb3'], ['Ab2', 'Eb3'], ['G2', 'D3']]);
assert.deepEqual(lhOf(b1, ['C7'], { flats: true })[0].map((e) => e[2]), ['C3', 'G3']);
assert.equal(normalize(patternExercise(b1, bb.practice, { id: 'bp', swing: false, flats: true })).rhythm, '4. 4.~4');
assert.deepEqual(parsePattern(b1.rhythm).map((e) => [e.t, e.d]), b1.events.map((e) => [e.t, e.d]), 'b1 rhythm line matches its events');
assert.deepEqual(parsePattern(b2.rhythm).map((e) => [e.t, e.d]), b2.events.map((e) => [e.t, e.d]), 'b2 rhythm line matches its events');
assert.equal(bb.id, 'blue-bossa'); assert.equal(bb.style, 'bossa'); assert.equal(bb.swing, false); assert.equal(bb.flats, true);
assert.equal(bb.bars.length, 16);
bb.bars.forEach((b) => assert.ok(barChords(b).length >= 1));
assert.deepEqual(barChords(bb.bars[15]), ['Dm7b5', 'G7']);
assert.deepEqual(bb.patterns, ['b1', 'b2']);
bb.practice.forEach((c) => parseChord(c));
// every bar unfolds into a valid exercise with both patterns
[b1, b2].forEach((pat) => assert.equal(normalize(patternExercise(pat, bb.bars, { id: 'bf', flats: true })).bars.length, 16));
assert.deepEqual(patternBar(b2, 'Dm7b5 G7').map((e) => [e.t, e.m]), [[0, 50], [3, 56], [6, 43]], 'the last bar: D, Ab, then G for the G7');
assert.equal(parseChord('Dbmaj7').root, 'Db'); assert.equal(parseChord('Dbmaj7').qual, 'maj7');
assert.equal(parseChord('Ebm7').qual, 'm7'); assert.equal(parseChord('Dm7b5').root, 'D'); assert.equal(parseChord('Dm7b5').qual, 'm7b5');
assert.deepEqual(chordNames('Dm7b5'), ['D', 'F', 'Ab', 'C']);
assert.deepEqual(chordNames('Ebm7'), ['Eb', 'Gb', 'Bb', 'Db']);
assert.deepEqual(chordNames('Ab7'), ['Ab', 'C', 'Eb', 'Gb']);
assert.deepEqual(chordNames('Dbmaj7'), ['Db', 'F', 'Ab', 'C']);
assert.deepEqual(chordNames('Cm7'), ['C', 'Eb', 'G', 'Bb']);
assert.deepEqual(chordNames('Fm7'), ['F', 'Ab', 'C', 'Eb']);
assert.deepEqual(chordNames('G7'), ['G', 'B', 'D', 'F']);
assert.deepEqual(chordNames('A7'), ['A', 'C#', 'E', 'G'], 'sharp keys keep their sharps');
// the bossa track: items resolve to existing content, ids do not collide with the blues
const bt = read('content/tracks/bossa.json'), blt = read('content/tracks/blues.json');
assert.equal(bt.id, 'bossa');
const order = bt.sections.flatMap((x) => x.items);
assert.deepEqual(order.slice().sort(), Object.keys(bt.items).sort(), 'every item is in a section');
order.forEach((id) => assert.ok(!(id in blt.items), 'item id collides with the blues: ' + id));
Object.values(bt.items).forEach((it) => {
  if (it.form) assert.equal(read(`content/forms/${it.form}.json`).id, it.form);
  if (it.pattern) assert.equal(read(`content/patterns/${it.pattern}.json`).id, it.pattern);
  if (it.kind === 'drill') it.tasks.forEach((tk) => (tk.chords || []).forEach((c) => chordNames(c)));
});
assert.ok(!Object.values(bt.items).some((it) => it.kind === 'diag'));
assert.equal(read('content/index.json').courses.find((c) => c.id === 'bossa').ready, true);
console.log('ok: bossa');
