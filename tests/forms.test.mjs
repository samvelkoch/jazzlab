// Pattern -> exercise generator and chord helpers. Run: node tests/forms.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { normalize, buildSteps } from '../app/js/music/exercise.js';
import { parsePattern } from '../app/js/music/rhythm.js';
import { patSpell, fitDeg, parseChord, chordPcs, patternExercise, patternBar, patternBars, leadPair, expectedAtSlot, lhRoot, spell, rhRoot, lickNotes, lickBars, lickExercise, barChords, chordNames, melodyExercise, melodyNotes, melodyBarNotes, transposeChord, keyTonic, lickKeyNotes, lickOverKey, lickExerciseKey, iivPairs } from '../app/js/music/forms.js';

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

// the bossa melody (jazzlab-melody/1): bars match the form, fit the bar, unfold into exercises
const mel = read('content/melodies/bossa-cm.json'); // bb (blue-bossa) and b1 are read above
assert.equal(mel.$format, 'jazzlab-melody/1');
assert.equal(mel.form, 'blue-bossa');
assert.equal(mel.bars.length, bb.bars.length);
mel.bars.forEach((b, k) => {
  assert.equal(b.chord, bb.bars[k], `melody bar ${k + 1} chord`);
  b.rh.forEach((e) => assert.ok(e.t >= 0 && e.t + (e.d || 1) <= 8, `melody bar ${k + 1}: t ${e.t} + d ${e.d} > 8`));
});
mel.phrases.forEach(([a, z]) => assert.ok(a >= 0 && a <= z && z < mel.bars.length));
const m01 = melodyExercise(mel, [0, 1], b1, { id: 'm' });
assert.equal(m01.bars.length, 2);
assert.deepEqual(m01.bars[0].rh.map((e) => e.n[0]), ['G4', 'C5', 'D5', 'Eb5']);
assert.deepEqual(m01.bars[0].rh.map((e) => e.t), [0, 2, 3, 6]);
assert.deepEqual(m01.bars[0].rh.map((e) => e.d), [2, 1, 3, 2]);
assert.deepEqual(m01.bars[0].lh.map((e) => [e.n, e.t, e.d]), [[['C3'], 0, 3], [['G3'], 3, 5]]);
assert.equal(m01.swing, false); assert.equal(m01.passAnyTempo, true); assert.equal(m01.tempo.start, mel.tempo - 10);
assert.equal(normalize(m01).bars.length, 2);
assert.equal(normalize(m01).byEar, true, 'a phrase was learned by echo: it opens on the notes');
const m45 = melodyExercise(mel, [4, 5], b1, { id: 'm45' });
assert.equal(m45.bars[0].lh[1].n[0], 'Ab3', 'Dm7b5: the b5 as a flat');
const mAll = normalize(melodyExercise(mel, [0, mel.bars.length - 1], b1, { id: 'mel-bossa-all', doneId: 'mel-bossa' }));
assert.equal(mAll.bars.length, 16);
assert.equal(mAll.doneId, 'mel-bossa');
assert.equal(buildSteps(mAll).length, 16 * 8);
assert.deepEqual(melodyNotes(mel, [6, 7]).map((e) => e.t), [0, 12, 13, 14, 15], 'phrase slots count from its first bar');
assert.equal(melodyBarNotes(mel, 0)[3].m, 75, 'Eb5 = 75');
// the melody items on the bossa track
assert.equal(bt.items['mel-bossa'].melody, 'bossa-cm');
assert.equal(bt.items['form-mel'].melody, 'bossa-cm');
assert.equal(bt.items['perf-bossa'].melody, 'bossa-cm');
const secIds = bt.sections.map((x) => x.id);
assert.equal(secIds.indexOf('melody'), secIds.indexOf('form') + 1);
assert.equal(secIds.indexOf('rh'), secIds.indexOf('melody') + 1);
assert.equal(secIds.indexOf('ear'), secIds.indexOf('rh') + 1);
console.log('ok: melody');

// ---------- the standard: voice-led shell, 32-bar AABA form, the 32-bar tune ----------
const s1 = read('content/patterns/s1.json'), s2 = read('content/patterns/s2.json'), sf = read('content/forms/std-f.json');
assert.equal(s2.voicing, 'lead'); assert.equal(s1.voicing, undefined);
// one note moves at a time: Gm7 F3 Bb3 → C7 E3 Bb3 → Fmaj7 E3 A3 (the shell pair placed in C3..B3)
const shell = (b) => [...new Set(b.filter((e) => e.t === 2).map((e) => e.m))].sort((a, z) => a - z);
const vl = patternBars(s2, ['Gm7', 'C7', 'Fmaj7']);
assert.deepEqual(vl.map(shell), [[53, 58], [52, 58], [52, 57]]);
assert.deepEqual(vl.map((b) => b.filter((e) => e.t === 6).map((e) => e.m).sort((a, z) => a - z)), [[53, 58], [52, 58], [52, 57]], 'beat 4 = beat 2');
assert.deepEqual(vl.map((b) => b.filter((e) => e.t === 0).map((e) => e.m)), [[43], [48], [41]], 'the root stays in its octave');
assert.deepEqual(vl[0].pair.slice().sort(), [53, 58]);
vl.forEach((b) => { const sh = b.filter((e) => e.t === 2).sort((a, z) => a.m - z.m); assert.deepEqual(sh.map((e) => e.f), [2, 1], 'lower note 2, upper 1'); });
// threading by hand gives the same as patternBars; the exercise threads too
let pv = null; const byHand = ['Gm7', 'C7', 'Fmaj7'].map((c) => { const b = patternBar(s2, c, { prev: pv }); pv = b.pair; return shell(b); });
assert.deepEqual(byHand, [[53, 58], [52, 58], [52, 57]]);
const s2x = patternExercise(s2, ['Gm7', 'C7', 'Fmaj7'], { flats: true });
assert.deepEqual(s2x.bars.map((b) => b.lh[1].n), [['F3', 'Bb3'], ['E3', 'Bb3'], ['E3', 'A3']]);
assert.deepEqual(s2x.bars[0].lh[1].f, [2, 1]);
assert.equal(normalize(s2x).bars.length, 3);
// a two-chord bar: the second chord's pair follows the first
const two = patternBar(s2, 'Gm7 C7');
assert.deepEqual([2, 6].map((s) => two.filter((e) => e.t === s).map((e) => e.m).sort((a, z) => a - z)), [[53, 58], [52, 58]]);
assert.deepEqual(two.pair.slice().sort(), [52, 58]);
assert.deepEqual(leadPair([4, 11], parseChord('Fmaj7'), [52, 58]).slice().sort(), [52, 57]);
// every shell note of the form sits in C3..B3
patternBars(s2, sf.bars).flat().filter((e) => e.t % 4 === 2).forEach((e) => assert.ok(e.m >= 48 && e.m <= 59, `shell note ${e.m} in ${e.chord}`));
// s1: the root on 1 and 3; a two-chord bar plays both roots
assert.deepEqual(patternBar(s1, 'Gm7 C7').map((e) => [e.t, e.m]), [[0, 43], [4, 48]], 'G2 then C3');
assert.deepEqual(patternBar(s1, 'Fmaj7').map((e) => [e.t, e.m]), [[0, 41], [4, 41]]);
// the form
assert.equal(sf.id, 'std-f'); assert.equal(sf.bars.length, 32); assert.equal(sf.swing, true); assert.equal(sf.flats, true);
sf.bars.forEach((b) => barChords(b));
assert.deepEqual(sf.practice, ['Gm7 C7', 'Fmaj7', 'Cm7 F7', 'Bbmaj7']);
assert.deepEqual(sf.patterns, ['s1', 's2']);
assert.equal(normalize(patternExercise(s2, sf.bars, { flats: true })).bars.length, 32);
assert.equal(normalize(patternExercise(s1, sf.practice, { flats: true })).bars.length, 4);
// drill spelling
assert.deepEqual(chordNames('Fmaj7'), ['F', 'A', 'C', 'E']);
assert.deepEqual(chordNames('Am7'), ['A', 'C', 'E', 'G']);
assert.deepEqual(chordNames('D7'), ['D', 'F#', 'A', 'C']);
// the tune
const std = read('content/melodies/std-f.json');
assert.equal(std.form, 'std-f'); assert.equal(std.bars.length, 32);
std.bars.forEach((b, k) => {
  assert.equal(b.chord, sf.bars[k], `std melody bar ${k + 1} chord`);
  b.rh.forEach((e) => assert.ok(e.t >= 0 && e.t + (e.d || 1) <= 8, `std melody bar ${k + 1}: t ${e.t} + d ${e.d} > 8`));
});
assert.equal(std.phrases.length, 16);
std.phrases.forEach(([a, z]) => assert.ok(a >= 0 && a <= z && z < std.bars.length));
const sm01 = melodyExercise(std, [0, 1], s1, { id: 'sm' });
assert.equal(sm01.bars.length, 2); assert.equal(normalize(sm01).bars.length, 2);
assert.deepEqual(sm01.bars[1].lh.map((e) => e.n[0]), ['G2', 'C3']);
const sAll = normalize(melodyExercise(std, [0, 31], s1, { id: 'mel-std-all', doneId: 'mel-std' }));
assert.equal(sAll.bars.length, 32);
assert.equal(buildSteps(sAll).length, 32 * 8);
assert.equal(normalize(melodyExercise(std, [0, 31], s2, { id: 'x2' })).bars.length, 32);
// the std track: items resolve, every item in a section, ids do not collide with the blues or the bossa
const stt = read('content/tracks/std.json');
assert.equal(stt.id, 'std');
const sorder = stt.sections.flatMap((x) => x.items);
assert.deepEqual(sorder.slice().sort(), Object.keys(stt.items).sort(), 'every std item is in a section');
sorder.forEach((id) => assert.ok(!(id in blt.items) && !(id in bt.items), 'std item id collides with the blues / bossa: ' + id));
Object.values(stt.items).forEach((it) => {
  if (it.form) assert.equal(read(`content/forms/${it.form}.json`).id, it.form);
  if (it.pattern) assert.equal(read(`content/patterns/${it.pattern}.json`).id, it.pattern);
  if (it.melody) assert.equal(read(`content/melodies/${it.melody}.json`).id, it.melody);
  if (it.kind === 'drill') it.tasks.forEach((tk) => (tk.chords || []).forEach((c) => chordNames(c)));
});
assert.equal(stt.items['pat-s2-form'].over, 'bars');
const idx = read('content/index.json').courses;
assert.equal(idx.find((c) => c.id === 'std').ready, true);
assert.ok(!idx.some((c) => c.id === 'standard'), 'the old placeholder is gone');
console.log('ok: standard');

// a voice-led root stays below its shell: D7's pair C3 F#3 pushes the root down to D2
{
  const s2 = read('content/patterns/s2.json');
  const d7 = patternBar(s2, 'D7');
  assert.deepEqual(d7.filter((e) => e.t === 0).map((e) => e.m), [38], 'D7 root D2 under C3 F#3');
  assert.deepEqual(d7.filter((e) => e.t === 2).map((e) => e.m).sort((a, b) => a - b), [48, 54]);
  assert.deepEqual(patternBar(s2, 'Gm7').filter((e) => e.t === 0).map((e) => e.m), [43], 'Gm7 root G2 stays');
  console.log('ok: lead root');
}

// a forced-flats form still spells D7's third as F#
assert.equal(patSpell(54, 4, parseChord('D7'), true), 'F#3');
assert.equal(patSpell(53, 4, parseChord('Db7'), true), 'F3');
assert.deepEqual(chordNames('D7', true), ['D', 'F#', 'A', 'C']);
console.log('ok: sharp thirds');

// key-relative licks (lick.prog + item.keys): ii–V–I in F, moved to Bb
{
  assert.equal(transposeChord('Gm7 C7', 5), 'Cm7 F7');
  assert.equal(transposeChord('Fmaj7', 5), 'Bbmaj7');
  assert.equal(transposeChord('Gm7 C7', -2), 'Fm7 Bb7', 'black-key roots are flats');
  assert.equal(transposeChord('Fmaj7', 1), 'Gbmaj7');
  assert.equal(transposeChord('Fmaj7', 2), 'Gmaj7');
  assert.deepEqual([keyTonic('F'), keyTonic('Bb')], [65, 70], 'the tonic sits in C4..B4 (not rhRoot: Bb4, not Bb3)');
  const k1 = read('content/licks/k1.json'), k2 = read('content/licks/k2.json'), k3 = read('content/licks/k3.json');
  const s2 = read('content/patterns/s2.json'), sf = read('content/forms/std-f.json');
  [k1, k2, k3].forEach((l) => { assert.deepEqual(l.prog, ['Gm7 C7', 'Fmaj7']); assert.equal(l.tempo, 66); assert.equal(l.swing, true); });
  assert.deepEqual([k1.role, k2.role, k3.role], ['answer', 'answer', 'question']);
  const f = lickOverKey(k1, 'F');
  assert.deepEqual(f.bars.map((b) => b.rh.map((e) => e.m)), [[67, 70, 74, 72, 69, 64], [65]], 'negative deg: E4 under F4');
  assert.deepEqual(f.chords, ['Gm7 C7', 'Fmaj7']);
  const bb = lickOverKey(k1, 'Bb');
  assert.equal(bb.bars[1].rh.at(-1).m, 70, 'k1 in Bb lands on Bb4');
  assert.deepEqual(bb.chords, ['Cm7 F7', 'Bbmaj7']);
  assert.deepEqual(bb.bars.map((b) => b.rh.map((e) => e.name)), [['C5', 'Eb5', 'G5', 'F5', 'D5', 'A4'], ['Bb4']]);
  assert.deepEqual(f.bars.map((b) => b.rh.map((e) => e.name)), [['G4', 'Bb4', 'D5', 'C5', 'A4', 'E4'], ['F4']]);
  assert.deepEqual(lickKeyNotes(k2, 'F').map((e) => e.name), ['Bb4', 'A4', 'G4', 'F4', 'E4', 'G4', 'A4', 'F4']);
  assert.equal(lickKeyNotes(k3, 'F').at(-1).name, 'C5', 'the question hangs on the fifth');
  // the left hand under the lick: the voice-led shell over the progression in the key
  assert.deepEqual(lickOverKey(k1, 'F', s2).bars.map((b) => b.lh.length), [6, 6]);
  const kx = normalize(lickExerciseKey(k1, 'Bb', s2, { id: 'lick-k1-bb', doneId: 'lick-k1' }));
  assert.equal(kx.bars.length, 2); assert.equal(kx.id, 'lick-k1-bb'); assert.equal(kx.doneId, 'lick-k1'); assert.equal(kx.swing, true);
  assert.deepEqual(kx.bars[0].rh.map((e) => e.notes[0]), ['C5', 'Eb5', 'G5', 'F5', 'D5', 'A4']);
  assert.deepEqual(kx.bars[0].lh.map((e) => e.notes.join(' ')), ['C3', 'Eb3 Bb3', 'F2', 'Eb3 A3'], 'Cm7 F7 shell in Bb, flats');
  assert.equal(normalize(lickExerciseKey(k1, 'F', s2)).id, 'lick-k1-f');
  [k1, k2, k3].forEach((l) => ['F', 'Bb'].forEach((k) => normalize(lickExerciseKey(l, k, s2))));
  // ii–V–I places in the form: bar k = "m7 7" (ii a fourth below V), bar k+1 = one major chord a fourth above V; left to right, no overlap
  assert.deepEqual(iivPairs(sf.bars).map((p) => [...p.bars, p.key]), [
    [1, 2, 'F'], [3, 4, 'F'], [7, 8, 'F'], [9, 10, 'F'], [11, 12, 'F'], [16, 17, 'Bb'], [18, 19, 'Bb'], [25, 26, 'F'], [27, 28, 'F'], [30, 31, 'F']
  ]);
  assert.ok(!iivPairs(sf.bars).some((p) => p.bars[0] === 21), '"Gm7 C7 | Gm7" is not a resolution');
  assert.deepEqual(iivPairs(['Gm7 C7', 'Gm7 C7', 'Fmaj7']).map((p) => p.bars), [[1, 2]]);
  // the std track: the rh section, key-relative items, the ending
  const stt = read('content/tracks/std.json');
  assert.deepEqual(stt.sections.map((x) => x.id), ['keys', 'lh', 'form', 'melody', 'rh', 'ear', 'perf']);
  assert.deepEqual(stt.sections.find((x) => x.id === 'rh').items, ['lick-k1', 'lick-k2', 'lick-k3', 'form-rh-k1', 'form-rh-qa-std']);
  ['k1', 'k2', 'k3'].forEach((k) => assert.deepEqual(stt.items['lick-' + k], { kind: 'lick', lick: k, keys: ['F', 'Bb'], pattern: 's2' }));
  assert.equal(stt.items['form-rh-k1'].lickKey, 'k1'); assert.equal(stt.items['form-rh-k1'].hand, 'rh');
  assert.deepEqual(stt.items['form-rh-qa-std'].licksKey, ['k3', 'k1']);
  Object.values(stt.items).forEach((it) => [it.lick, it.lickKey, ...(it.licks || []), ...(it.licksKey || [])].filter(Boolean).forEach((l) => assert.equal(read(`content/licks/${l}.json`).id, l)));
  assert.deepEqual(stt.items['perf-std'].licks, ['k1', 'k2']);
  assert.equal(sf.ending, 'std-end');
  assert.deepEqual(stt.items['end-std'], { kind: 'exercise', ex: 'std-end' });
  assert.equal(stt.sections.find((x) => x.id === 'form').items.at(-1), 'end-std');
  const se = normalize(read('content/exercises/std-end.json'));
  assert.equal(se.bars.length, 2); assert.equal(se.passAnyTempo, true); assert.equal(se.swing, true);
  assert.deepEqual([se.tempo.start, se.tempo.target], [56, 66]);
  assert.deepEqual(se.bars[1].rh[0].notes, ['A4', 'C5', 'F5']);
  console.log('ok: standard licks');
}

// ---------- bossa licks: chord-relative licks follow the chord quality ----------
{
  const lk = (id) => read(`content/licks/${id}.json`);
  const bl1 = lk('bl1'), bl2 = lk('bl2'), bl3 = lk('bl3'), l1b = lk('l1'), bp1 = read('content/patterns/p1.json'), bb1 = read('content/patterns/b1.json');
  // fitDeg: the mirror case only on request; degrees above 12 keep their octave
  assert.equal(fitDeg(3, parseChord('Dbmaj7')), 3, 'no option: the minor 3rd stays');
  assert.equal(fitDeg(3, parseChord('Dbmaj7'), { minorToMajor: true }), 4);
  assert.equal(fitDeg(15, parseChord('G7'), { minorToMajor: true }), 16);
  assert.equal(fitDeg(3, parseChord('Cm7'), { minorToMajor: true }), 3);
  assert.equal(fitDeg(3, parseChord('Dm7b5'), { minorToMajor: true }), 3);
  assert.equal(fitDeg(10, parseChord('Dbmaj7'), { minorToMajor: true }), 11);
  assert.equal(fitDeg(7, parseChord('Dm7b5')), 6);
  // the blues lick keeps its blue third over C7
  assert.deepEqual(lickNotes(l1b, 'C7').map((e) => e.m), [63, 64, 67, 70, 67, 65, 63, 60]);
  assert.deepEqual(lickNotes(l1b, 'C7').map((e) => e.name), ['Eb4', 'E4', 'G4', 'Bb4', 'G4', 'F4', 'Eb4', 'C4']);
  // bl1 over Cm7: C D Eb F G F Eb D C
  assert.deepEqual(lickNotes(bl1, 'Cm7').map((e) => e.m), [60, 62, 63, 65, 67, 65, 63, 62, 60]);
  // a dorian lick over Dbmaj7: the major third (F, deg 4) and, for bl2, the major seventh (C, deg 11)
  assert.equal(rhRoot(parseChord('Dbmaj7')), 61);
  const d1 = lickNotes(bl1, 'Dbmaj7');
  assert.deepEqual(d1.map((e) => e.m), [61, 63, 65, 66, 68, 66, 65, 63, 61]);
  assert.deepEqual(d1.map((e) => e.name), ['Db4', 'Eb4', 'F4', 'Gb4', 'Ab4', 'Gb4', 'F4', 'Eb4', 'Db4']);
  assert.equal(d1[2].deg, 4, 'the fitted degree');
  const d2 = lickNotes(bl2, 'Dbmaj7');
  assert.deepEqual(d2.map((e) => e.m), [72, 70, 68, 66, 68]);
  assert.deepEqual(d2.map((e) => e.name), ['C5', 'Bb4', 'Ab4', 'Gb4', 'Ab4']);
  assert.deepEqual(normalize(lickExercise(bl2, 'Dbmaj7', bb1, { flats: true })).bars[0].rh.map((e) => e.notes[0]), ['C5', 'Bb4', 'Ab4', 'Gb4']);
  // bl2 over Cm7 starts Bb4 A4; over G7 the dorian third turns major (bl3: B, not Bb)
  assert.deepEqual(lickNotes(bl2, 'Cm7').map((e) => e.m).slice(0, 2), [70, 69]);
  assert.deepEqual(lickNotes(bl2, 'Cm7').map((e) => e.name), ['Bb4', 'A4', 'G4', 'F4', 'G4']);
  assert.ok(lickNotes(bl3, 'G7').some((e) => e.name === 'B4') && !lickNotes(bl3, 'G7').some((e) => e.name === 'Bb4'));
  // over Dm7b5 the fifth is flat and spelled as a flat (Ab, not G#)
  assert.deepEqual(lickNotes(bl2, 'Dm7b5').map((e) => e.name), ['C5', 'B4', 'Ab4', 'G4', 'Ab4']);
  // shape: straight, dorian, 2 bars, last note legato, roles
  [bl1, bl2, bl3].forEach((l) => {
    assert.equal(l.swing, false); assert.equal(l.scale, 'dorian'); assert.equal(l.tempo, 66); assert.equal(l.bars, 2);
    assert.equal(l.events.at(-1).stac, false);
    assert.equal(lickExercise(l, 'Cm7', bb1).swing, false, 'a bossa lick plays straight');
  });
  assert.deepEqual([bl1.role, bl2.role, bl3.role], ['answer', 'question', 'answer']);
  // every chord-relative lick still unfolds over C7, F7, G7, Cm7, Dbmaj7 (key-relative ones over F, Bb)
  readdirSync(join(root, 'content/licks')).filter((f) => f.endsWith('.json')).forEach((f) => {
    const l = lk(f.replace(/\.json$/, ''));
    if (l.prog) { ['F', 'Bb'].forEach((k) => normalize(lickExerciseKey(l, k, null))); return; }
    ['C7', 'F7', 'G7', 'Cm7', 'Dbmaj7'].forEach((c) => {
      const x = normalize(lickExercise(l, c, bp1));
      assert.equal(x.bars.length, 2, `${f} over ${c}`);
      x.bars.forEach((b) => b.rh.forEach((e) => assert.match(e.notes[0], /^[A-G](#|b)?\d$/, `${f} over ${c}: ${e.notes[0]}`)));
    });
  });
  // the bossa ending
  const be = normalize(read('content/exercises/bossa-end.json'));
  assert.equal(be.bars.length, 2); assert.equal(be.swing, false); assert.equal(be.passAnyTempo, true);
  assert.deepEqual([be.tempo.start, be.tempo.target], [56, 66]);
  assert.deepEqual(be.bars[0].rh.map((e) => [e.t, e.notes.join(' ')]), [[0, 'F4 Ab4 C5'], [3, 'F4 G4 B4']]);
  assert.deepEqual(be.bars[1].lh[0].notes, ['C2', 'C3']);
  assert.equal(bb.ending, 'bossa-end');
  // the bossa track: the rh section, the lick items with their own chord set, the ending, the performance
  const bt2 = read('content/tracks/bossa.json');
  assert.deepEqual(bt2.sections.map((x) => x.id), ['keys', 'lh', 'form', 'melody', 'rh', 'ear', 'perf']);
  assert.deepEqual(bt2.sections.find((x) => x.id === 'rh').items, ['lick-bl1', 'lick-bl2', 'lick-bl3', 'form-rh-bl1', 'form-rh-qa-bossa']);
  ['bl1', 'bl2', 'bl3'].forEach((l) => assert.deepEqual(bt2.items['lick-' + l], { kind: 'lick', lick: l, form: 'blue-bossa', pattern: 'b1', chords: ['Cm7', 'Fm7', 'G7'] }));
  bt2.items['lick-bl1'].chords.forEach((c) => assert.ok(bb.bars.flatMap(barChords).includes(c), c + ' is a chord of the form'));
  assert.equal(bt2.items['form-rh-bl1'].lick, 'bl1'); assert.equal(bt2.items['form-rh-bl1'].hand, 'rh');
  assert.deepEqual(bt2.items['form-rh-qa-bossa'].licks, ['bl2', 'bl1']);
  assert.deepEqual(bt2.items['perf-bossa'].licks, ['bl1', 'bl3']);
  assert.deepEqual(bt2.items['end-bossa'], { kind: 'exercise', ex: 'bossa-end' });
  assert.equal(bt2.sections.find((x) => x.id === 'form').items.at(-1), 'end-bossa');
  Object.values(bt2.items).forEach((it) => [it.lick, ...(it.licks || [])].filter(Boolean).forEach((l) => assert.equal(lk(l).id, l)));
  console.log('ok: bossa licks');
}
