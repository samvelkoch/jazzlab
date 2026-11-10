// Rhythm cells, motif / answer and phrase-end metrics of the solo scoring. Run: node tests/motif.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { scoreChorus, passed, checks, combine, resolveCells, barMatchesCell, motifRelated, shapeOf, endsOn, makeMotif, paletteAt, stretchesOf } from '../app/js/music/solo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const lib = read('content/solos/rhythms.json');
const blues = read('content/forms/blues-c.json'), bossa = read('content/forms/blue-bossa.json'), stdF = read('content/forms/std-f.json');
const sorted = (s) => [...s].sort((a, b) => a - b);

// 60 bpm straight: an eighth is 0.5 s, a bar 4 s
const at = (bar, slot, dt = 0) => (bar * 8 + slot) * 0.5 + dt;
const N = (bar, slot, m, dt = 0) => ({ t: at(bar, slot, dt), m });
const mk = (solo, bars = blues.bars) => ({ solo, bars, bpm: 60, swing: false, cells: resolveCells(solo, lib) });
const base = { phrasing: { play: 2, rest: 2 }, call: false, targets: false, choruses: 1, palette: { mode: 'scale', scale: 'blues', root: 'C' }, hand: { lo: 60, hi: 72 } };

// ---------- the cell library ----------
Object.entries(lib.cells).forEach(([id, c]) => {
  assert.ok(c.title.ru && c.title.en && c.about.ru && c.about.en, id + ': ru and en');
  const [cell] = resolveCells({ rhythm: id }, lib); // throws when the length is not bars × 8 eighths
  assert.equal(cell.per, (c.bars || 1) * 8);
});
const onsetsOf = (id) => resolveCells({ rhythm: id }, lib)[0].onsets.map(sorted);
assert.deepEqual(onsetsOf('even'), [[0, 1, 2, 3, 4, 5, 6, 7]]);
assert.deepEqual(onsetsOf('eighth-rest'), [[0, 1, 4, 5]]);
assert.deepEqual(onsetsOf('anticipation'), [[0, 2, 4, 7]]);
assert.deepEqual(onsetsOf('start-and'), [[1, 2, 3, 4, 5]]);
assert.deepEqual(onsetsOf('start-two'), [[2, 3, 4, 5]]);
assert.deepEqual(onsetsOf('charleston'), [[0, 3]], 'a dotted quarter on 1, then the and of 2');
assert.deepEqual(onsetsOf('repeated'), [[0, 1, 2, 4, 5, 6]]);
assert.deepEqual(onsetsOf('beat3'), [[4, 5, 6]]);
assert.deepEqual(onsetsOf('ask-answer'), [[0, 1, 2], [4, 5, 6]], 'a two-bar cell');
assert.throws(() => resolveCells({ rhythm: 'nope' }, lib));
assert.deepEqual(resolveCells({}, lib), []);

// ---------- barMatchesCell ----------
const S = (...a) => new Set(a);
assert.ok(barMatchesCell(S(0, 3), S(0, 3)));
assert.ok(!barMatchesCell(S(0), S(0, 3)), 'one of two onsets: too few (3/4 of 2 = 2)');
assert.ok(!barMatchesCell(S(0, 3, 4), S(0, 3)), 'an extra onset');
assert.ok(barMatchesCell(S(0, 2, 4), S(0, 2, 4, 7)), 'one of four missing is allowed');
assert.ok(!barMatchesCell(S(0, 2), S(0, 2, 4, 7)));
assert.ok(!barMatchesCell(S(), S(0, 3)), 'an empty bar plays nothing');
assert.ok(barMatchesCell(S(), S()) && !barMatchesCell(S(1), S()), 'an empty cell bar wants silence');

// ---------- the rhythm metric ----------
const charl = { ...base, id: 't', rhythm: 'charleston' }; // you: bars 0, 1, 4, 5, 8, 9
const youBars = [0, 1, 4, 5, 8, 9];
const play = (bars, slots) => bars.flatMap((b) => slots.map((s, i) => N(b, s, 60 + i)));
let s = scoreChorus(play(youBars, [0, 3]), mk(charl));
assert.deepEqual(s.rhythm, { ok: 6, total: 6 }, 'the charleston in every bar of yours');
assert.equal(s.perBar[0].rhy, true); assert.equal(s.perBar[2].rhy, null, 'a rest bar has no rhythm');
assert.equal(passed(s, { rhythm: 0.6 }), true);
s = scoreChorus([...play([0, 1, 4, 5], [0, 3]), ...play([8, 9], [0, 2])], mk(charl));
assert.deepEqual(s.rhythm, { ok: 4, total: 6 }); assert.equal(s.perBar[8].rhy, false);
assert.equal(checks(s, { rhythm: 0.6 }).rhythm, true, '4/6 meets 0.6');
s = scoreChorus([...play([0, 1], [0, 3]), ...play([4, 5, 8, 9], [0, 1, 2, 3, 4])], mk(charl));
assert.equal(checks(s, { rhythm: 0.6 }).rhythm, false, 'eighths instead of the cell: 2/6');
s = scoreChorus(play(youBars, [0]), mk(charl));
assert.deepEqual(s.rhythm, { ok: 0, total: 6 }, 'only the first onset: not the cell');
s = scoreChorus([], mk(charl));
assert.deepEqual(s.rhythm, { ok: 0, total: 6 }, 'silence is not a rhythm'); assert.equal(passed(s, { rhythm: 0.6 }), false);
s = scoreChorus([N(0, 0, 60), N(0, 3, 62, 0.2), ...play([1], [0, 3])], mk(charl));
assert.equal(s.perBar[0].rhy, false, 'a note off the grid fails the bar'); assert.equal(s.perBar[1].rhy, true);
// anticipation: the and of 4 belongs to its own bar
s = scoreChorus(play(youBars, [0, 2, 4, 7]), mk({ ...base, rhythm: 'anticipation' }));
assert.equal(s.rhythm.ok, 6);
s = scoreChorus(play(youBars, [0, 2, 4]), mk({ ...base, rhythm: ['anticipation'] }));
assert.equal(s.rhythm.ok, 6, 'one missing onset of four is fine');
// a list: a bar matches any of the cells
s = scoreChorus([...play([0], [0, 1, 4, 5]), ...play([1], [0, 1, 2, 3, 4, 5, 6, 7])], mk({ ...base, rhythm: ['even', 'eighth-rest'] }));
assert.deepEqual([s.perBar[0].rhy, s.perBar[1].rhy], [true, true]);
// a two-bar cell follows the position inside your stretch of bars
const ask = { ...base, rhythm: 'ask-answer' };
s = scoreChorus([...play([0], [0, 1, 2]), ...play([1], [4, 5, 6]), ...play([4], [0, 1, 2]), ...play([5], [4, 5, 6])], mk(ask));
assert.deepEqual([0, 1, 4, 5].map((b) => s.perBar[b].rhy), [true, true, true, true]);
s = scoreChorus([...play([0], [4, 5, 6]), ...play([1], [0, 1, 2])], mk(ask));
assert.deepEqual([s.perBar[0].rhy, s.perBar[1].rhy], [false, false], 'the bars swapped');
// no cells: nothing counted, always passes
s = scoreChorus(play(youBars, [0, 3]), mk(base));
assert.deepEqual(s.rhythm, { ok: 0, total: 0 }); assert.equal(passed(s, { rhythm: 0.9 }), true);
// swing: the and of 2 sits on the swung off-beat
{
  const sw = { solo: charl, bars: blues.bars, bpm: 60, swing: true, cells: resolveCells(charl, lib) };
  s = scoreChorus([{ t: 0, m: 60 }, { t: 1 + 2 / 3, m: 62 }, { t: 4, m: 60 }, { t: 5 + 2 / 3, m: 62 }], sw);
  assert.deepEqual([s.perBar[0].rhy, s.perBar[1].rhy], [true, true]);
}
// combine sums the ratio
assert.deepEqual(combine([{ inside: 1, grid: 1, phrases: 1, pitches: 3, notes: 1, rests: { ok: 1, total: 1 }, targets: { ok: 0, total: 0 }, rhythm: { ok: 2, total: 3 }, motif: { ok: 1, total: 1 }, ends: { ok: 0, total: 0 } },
  { inside: 1, grid: 1, phrases: 1, pitches: 3, notes: 1, rests: { ok: 1, total: 1 }, targets: { ok: 0, total: 0 }, rhythm: { ok: 3, total: 3 }, motif: { ok: 0, total: 1 }, ends: { ok: 0, total: 0 } }]).rhythm, { ok: 5, total: 6 });

// ---------- shapes and the motif relation ----------
assert.equal(shapeOf([60, 62]), null);
assert.equal(shapeOf([60, 62, 65, 67]), 'up'); assert.equal(shapeOf([67, 65, 62, 60]), 'down');
assert.equal(shapeOf([60, 64, 67, 63]), 'arch'); assert.equal(shapeOf([64, 62, 64, 63]), 'same');
const C = (slots, ms) => slots.map((slot, i) => ({ slot, m: ms[i] }));
const call = C([0, 2, 4, 6], [60, 64, 67, 64]);
assert.ok(!motifRelated(call, []), 'no answer');
// repeat
assert.ok(motifRelated(call, C([0, 2, 4, 6], [60, 64, 67, 64]), 'repeat'), 'the same notes');
assert.ok(motifRelated(call, C([0, 2, 4, 6], [67, 71, 74, 71]), 'repeat'), 'the same shape moved up (the same intervals)');
assert.ok(motifRelated(call, C([0, 2, 4, 6], [72, 76, 79, 76]), 'repeat'), 'an octave up: the same pitch classes');
assert.ok(!motifRelated(call, C([0, 2, 4, 6], [60, 62, 67, 64]), 'repeat'), 'one note changed');
assert.ok(!motifRelated(call, C([0, 2, 4, 7], [60, 64, 67, 64]), 'repeat'), 'another rhythm');
assert.ok(!motifRelated(call, C([0, 2, 4], [60, 64, 67]), 'repeat'), 'a note short');
// vary
assert.ok(motifRelated(call, C([0, 2, 4, 6], [67, 65, 63, 65]), 'vary'), 'the same rhythm, other notes');
assert.ok(!motifRelated(call, C([0, 2, 4, 6], [60, 64, 67, 64]), 'vary'), 'a copy is not a variation');
assert.ok(!motifRelated(call, C([0, 2, 4, 6], [65, 69, 72, 69]), 'vary'), 'a copy moved is not a variation');
assert.ok(!motifRelated(call, C([1, 3, 5, 7], [67, 65, 63, 65]), 'vary'), 'another rhythm');
// similar (no mode): rhythm overlap >= 60 %, or the first / last pitch class, or the contour
assert.ok(motifRelated(call, C([0, 2, 4, 5], [62, 59, 55, 57])), 'rhythm: 3 of 4 shared onsets (75 %)');
assert.ok(!motifRelated(C([0, 2, 4, 6], [60, 64, 67, 64]), C([1, 3, 5, 7], [62, 59, 55, 57])), 'nothing shared');
assert.ok(motifRelated(call, C([1, 3, 5, 7], [60, 59, 62, 58])), 'starts on the first note of the call');
assert.ok(motifRelated(call, C([1, 3, 5, 7], [59, 62, 58, 64])), 'ends on the last note of the call (E)');
assert.ok(motifRelated(C([1, 3, 5, 7], [60, 62, 65, 67]), C([0, 4, 5, 6], [58, 61, 63, 66])), 'the same contour (up)');
assert.ok(!motifRelated(C([0, 2, 4, 6], [60, 64, 67, 72]), C([1, 3, 5, 7], [62, 59, 57, 53])), 'up against down');
assert.ok(!motifRelated(call, C([1, 3, 5, 7], [62, 65])), 'two notes: no contour');

// in a scored chorus: blues-call, band bars 0-1, your answer bars 2-3
const bluesCall = read('content/solos/blues-call.json');
assert.deepEqual(stretchesOf(bluesCall, 12).map((x) => x.role + x.from + '-' + x.to), ['band0-1', 'you2-3', 'band4-5', 'you6-7', 'band8-9', 'you10-11']);
const callN = [N(0, 0, 60), N(0, 2, 63), N(0, 4, 67), N(1, 2, 63)];
const ctxC = (extra = {}) => ({ solo: bluesCall, bars: blues.bars, bpm: 60, swing: false, calls: callN, ...extra });
s = scoreChorus([N(2, 0, 62), N(2, 2, 65), N(2, 4, 69), N(3, 2, 65)], ctxC());
assert.deepEqual(s.motif, { ok: 1, total: 1 }, 'the same rhythm (rest of the call is only in the first answer)');
s = scoreChorus([N(2, 1, 62), N(2, 3, 58), N(3, 5, 63)], ctxC({ calls: [N(0, 0, 60), N(0, 2, 65), N(0, 4, 67), N(1, 2, 69)] }));
assert.deepEqual(s.motif, { ok: 0, total: 1 }, 'other onsets, other end, a different contour');
s = scoreChorus([], ctxC());
assert.deepEqual(s.motif, { ok: 0, total: 1 }, 'no answer = not related'); assert.equal(passed(s, { motif: 0.5 }), false);
s = scoreChorus([N(2, 0, 62)], { ...ctxC(), calls: null });
assert.deepEqual(s.motif, { ok: 0, total: 0 }, 'no call data: nothing to compare, passes');
s = scoreChorus([N(2, 0, 60), N(2, 2, 63), N(2, 4, 67), N(3, 2, 63), N(6, 0, 62), N(6, 2, 65), N(10, 1, 70)], ctxC({ calls: [...callN, N(4, 0, 62), N(4, 2, 65), N(8, 0, 60), N(8, 3, 63)] }));
assert.equal(s.motif.total, 3); assert.equal(s.motif.ok, 2, 'two of the three answers relate (the third: other rhythm, notes, contour)');
assert.equal(checks(s, { motif: 0.5 }).motif, true); assert.equal(checks(s, { motif: 0.9 }).motif, false);
// repeat / vary through the whole chorus: blues-echo is band 1 / you 1
const echo = read('content/solos/blues-echo.json'), vary = read('content/solos/blues-vary.json');
const m1 = [N(0, 0, 60), N(0, 2, 64), N(0, 4, 67), N(0, 6, 64)];
s = scoreChorus([N(1, 0, 60), N(1, 2, 64), N(1, 4, 67), N(1, 6, 64)], { solo: echo, bars: blues.bars, bpm: 60, swing: false, calls: m1 });
assert.deepEqual(s.motif, { ok: 1, total: 1 }, 'repeated');
s = scoreChorus([N(1, 0, 60), N(1, 2, 62), N(1, 4, 64), N(1, 6, 62)], { solo: echo, bars: blues.bars, bpm: 60, swing: false, calls: m1 });
assert.deepEqual(s.motif, { ok: 0, total: 1 }, 'varied is not a repeat');
s = scoreChorus([N(1, 0, 60), N(1, 2, 62), N(1, 4, 64), N(1, 6, 62)], { solo: vary, bars: blues.bars, bpm: 60, swing: false, calls: m1 });
assert.deepEqual(s.motif, { ok: 1, total: 1 }, 'varied: same rhythm, other notes');
s = scoreChorus([N(1, 0, 60), N(1, 2, 64), N(1, 4, 67), N(1, 6, 64)], { solo: vary, bars: blues.bars, bpm: 60, swing: false, calls: m1 });
assert.deepEqual(s.motif, { ok: 0, total: 1 }, 'a copy is not a variation');

// ---------- the band's motif ----------
let seed = 11; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
[[echo, blues.bars, [0, 2, 4, 8]], [vary, blues.bars, [0, 6]], [read('content/solos/bossa-echo.json'), bossa.bars, [0, 8, 14]]].forEach(([so, bb, starts]) => {
  for (let i = 0; i < 40; i++) {
    const bar = starts[i % starts.length], { notes } = makeMotif(so, bb, bar, rng);
    assert.ok(notes.length >= 4 && notes.length <= 5);
    assert.equal(notes[0].slot, 0);
    notes.forEach((n, k) => {
      assert.ok(n.slot >= 0 && n.slot < 8, so.id + ': within one bar');
      if (k) assert.ok(n.slot > notes[k - 1].slot);
      assert.ok(n.m >= so.hand.lo && n.m <= so.hand.hi, 'within the hand');
      assert.ok(paletteAt(so, bb, bar, n.slot).pcs.has(n.m % 12), 'a palette note');
    });
    assert.ok(paletteAt(so, bb, bar, 0).chordPcs.has(notes[0].m % 12), 'starts on a chord tone');
    assert.ok(new Set(notes.map((n) => n.m)).size >= 2, 'not one repeated note');
  }
});

// ---------- the phrase end ----------
assert.ok(endsOn(64, 'C7', 'third') && endsOn(76, 'C7', 'third') && !endsOn(67, 'C7', 'third') && !endsOn(63, 'C7', 'third'));
assert.ok(endsOn(63, 'Cm7', 'third') && !endsOn(64, 'Cm7', 'third'));
assert.ok(endsOn(60, 'C7', 'root') && endsOn(72, 'C7', 'root') && !endsOn(64, 'C7', 'root'));
assert.ok(endsOn(65, 'Dm7b5', 'third') && endsOn(62, 'Dm7b5', 'root'));
const endSolo = { ...base, endOn: 'third' };
s = scoreChorus([N(0, 0, 67), N(0, 1, 62), N(0, 2, 64), N(1, 0, 65), N(1, 2, 67), N(1, 3, 64)], mk(endSolo)); // bar 1 is C7 as well
assert.deepEqual(s.ends, { ok: 2, total: 2 }, 'two phrases (a gap of three beats between), both end on E');
s = scoreChorus([N(0, 0, 60), N(0, 1, 62), N(0, 2, 64), N(1, 6, 65), N(1, 7, 67), N(4, 0, 69), N(4, 1, 65)], mk(endSolo)); // 64 (E) ends bar 0; 67 ends bar 1; F7 bar 4: F is the root, A is the third
assert.deepEqual(s.ends, { ok: 1, total: 3 }, 'E on C7 ok; G on C7 and F (the root, not the third) on F7 miss');
s = scoreChorus([N(0, 0, 60), N(0, 1, 62), N(0, 2, 64), N(4, 0, 72), N(4, 1, 65), N(4, 2, 69)], mk(endSolo));
assert.deepEqual(s.ends, { ok: 2, total: 2 }, 'E on C7 and A on F7');
s = scoreChorus([N(0, 0, 60), N(0, 1, 62), N(0, 2, 67), N(4, 0, 72), N(4, 1, 65), N(4, 2, 67)], mk(endSolo));
assert.deepEqual(s.ends, { ok: 0, total: 2 }, 'G on C7 and G on F7');
assert.equal(passed(s, { ends: 0.6 }), false);
s = scoreChorus([N(0, 0, 60), N(0, 1, 67), N(0, 2, 64)], mk({ ...base, endOn: 'root' }));
assert.deepEqual(s.ends, { ok: 0, total: 1 }, 'root wanted, E played');
s = scoreChorus([N(0, 0, 64), N(0, 1, 67), N(0, 2, 72)], mk({ ...base, endOn: 'root' }));
assert.deepEqual(s.ends, { ok: 1, total: 1 }, 'C an octave up is the root');
s = scoreChorus([N(0, 0, 67)], mk(endSolo));
assert.deepEqual(s.ends, { ok: 0, total: 0 }, 'a single note is not a phrase; no data passes');
s = scoreChorus([N(0, 0, 67), N(0, 1, 62), N(0, 2, 64), N(0, 6, 60), N(0, 7, 62), N(1, 0, 64)], mk(endSolo));
assert.deepEqual(s.ends, { ok: 2, total: 2 }, 'a gap of more than a beat splits phrases: both end on E');
s = scoreChorus([N(0, 0, 60)], mk(base));
assert.deepEqual(s.ends, { ok: 0, total: 0 }, 'no endOn: not scored');

// ---------- content: the new solos and their tracks ----------
const NEW = {
  blues: { 'imp-b1r': 'blues-eighths', 'imp-b2e': 'blues-echo', 'imp-b2r': 'blues-charleston', 'imp-b3r': 'blues-anticipation', 'imp-b3v': 'blues-vary' },
  bossa: { 'imp-bo1r': 'bossa-start-and', 'imp-bo2a': 'bossa-anticipation', 'imp-bo2e': 'bossa-echo', 'imp-bo3v': 'bossa-vary' },
  std: { 'imp-s1r': 'std-displaced', 'imp-s2m': 'std-answer', 'imp-s2q': 'std-ask', 'imp-s3e': 'std-end-third' }
};
const forms = { blues: ['blues-c', 'p2', 72], bossa: ['blue-bossa', 'b2', 72], std: ['std-f', 's2', 74] };
const KEYS = ['inside', 'grid', 'phrases', 'rests', 'targets', 'cover', 'pitches', 'rhythm', 'motif', 'ends'];
Object.entries(NEW).forEach(([tid, items]) => {
  const tr = read(`content/tracks/${tid}.json`), imp = tr.sections.find((x) => x.id === 'imp');
  Object.entries(items).forEach(([id, sid]) => {
    assert.deepEqual(tr.items[id], { kind: 'solo', solo: sid });
    assert.ok(imp.items.includes(id) && tr.path.includes(id), id + ': in the imp section and the path');
    const so = read(`content/solos/${sid}.json`);
    assert.equal(so.$format, 'jazzlab-solo/1'); assert.equal(so.id, sid);
    assert.ok(so.title.ru && so.title.en && so.about.ru && so.about.en);
    assert.deepEqual([so.form, so.pattern, so.hand.hi], forms[tid]);
    read(`content/forms/${so.form}.json`); read(`content/patterns/${so.pattern}.json`);
    Object.keys(so.pass).forEach((k) => assert.ok(KEYS.includes(k), sid + ': pass key ' + k));
    assert.ok(Object.values(so.pass).every((v) => v > 0));
    if (so.rhythm) { assert.ok(resolveCells(so, lib).length >= 1); assert.ok(so.pass.rhythm >= 0.5 && so.pass.rhythm <= 0.7, sid + ': lenient rhythm'); }
    else assert.equal(so.pass.rhythm, undefined);
    if (so.motif) { assert.equal(so.call, true); assert.ok(['repeat', 'vary'].includes(so.motif)); }
    if (so.pass.motif != null) assert.equal(so.call, true, sid + ': motif needs call');
    if (so.endOn) { assert.ok(['third', 'root'].includes(so.endOn)); assert.ok(so.pass.ends); }
    if (so.motif) assert.deepEqual(so.phrasing, { play: 1, rest: 1 });
  });
  // the new items come after the first improvisation item of the track
  const firstImp = tr.path.findIndex((x) => /^imp-(b|bo|s)1$/.test(x));
  Object.keys(items).forEach((id) => assert.ok(tr.path.indexOf(id) > firstImp, id + ' after the first improvisation item'));
});
assert.deepEqual(read('content/solos/blues-eighths.json').rhythm, ['even', 'eighth-rest']);
assert.equal(read('content/solos/std-answer.json').pass.motif, 0.5);
assert.equal(read('content/solos/std-end-third.json').endOn, 'third');
assert.equal(read('content/solos/bossa-start-and.json').form, 'blue-bossa');

console.log('motif tests ok');
