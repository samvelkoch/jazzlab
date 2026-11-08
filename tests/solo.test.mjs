// Solo (improvisation) scoring, scales and the band's call. Run: node tests/solo.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { SCALES, scalePcs, scaleOf } from '../app/js/music/scales.js';
import { paletteAt, scoreChorus, passed, checks, combine, makeCall, roleOf, changesOf, slotAt, gridIndex } from '../app/js/music/solo.js';
import { freshItems } from '../app/js/queue.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const sorted = (s) => [...s].sort((a, b) => a - b);

// ---------- scales ----------
assert.deepEqual(SCALES.blues, [0, 3, 5, 6, 7, 10]);
assert.deepEqual(sorted(scalePcs('blues', 'C')), [0, 3, 5, 6, 7, 10]);
assert.deepEqual(sorted(scalePcs('major', 'Db')), [0, 1, 3, 5, 6, 8, 10]);
assert.deepEqual(scaleOf('Dm7b5'), { scale: 'locrian', root: 2 });
assert.deepEqual(scaleOf('G7'), { scale: 'mixolydian', root: 7 });
assert.deepEqual(scaleOf('Dbmaj7'), { scale: 'major', root: 1 });
assert.equal(scaleOf('Cm7').scale, 'dorian');
assert.equal(scaleOf('Cm').scale, 'aeolian');
assert.equal(scaleOf('C').scale, 'major');
assert.equal(scaleOf('C6').scale, 'major');
assert.equal(scaleOf('C#dim7').scale, 'dim');

// ---------- palette ----------
const blues = read('content/forms/blues-c.json'), bossa = read('content/forms/blue-bossa.json');
const sScale = read('content/solos/blues-scale.json');
let p = paletteAt(sScale, blues.bars, 0, 0);
assert.equal(p.chord, 'C7');
assert.deepEqual(sorted(p.pcs), [0, 3, 4, 5, 6, 7, 10], 'blues C + the chord tones of C7 (E)');
assert.deepEqual(sorted(p.chordPcs), [0, 4, 7, 10]);
p = paletteAt(sScale, blues.bars, 4, 0);
assert.equal(p.chord, 'F7');
assert.deepEqual(sorted(p.pcs), [0, 3, 5, 6, 7, 9, 10], 'blues C + F7 (A)');
const cs = { palette: { mode: 'chordscale' } };
p = paletteAt(cs, bossa.bars, 4, 0);
assert.deepEqual([p.chord, p.scale, p.root], ['Dm7b5', 'locrian', 2]);
assert.deepEqual(sorted(p.pcs), [0, 2, 3, 5, 7, 8, 10], 'D locrian');
p = paletteAt(cs, bossa.bars, 5, 0);
assert.deepEqual([p.chord, p.scale], ['G7', 'mixolydian']);
assert.deepEqual(sorted(p.pcs), [0, 2, 4, 5, 7, 9, 11], 'G mixolydian');
p = paletteAt(cs, bossa.bars, 10, 0);
assert.deepEqual([p.chord, p.scale], ['Dbmaj7', 'major']);
assert.deepEqual(sorted(p.pcs), [0, 1, 3, 5, 6, 8, 10], 'Db major');
assert.equal(paletteAt(cs, bossa.bars, 15, 3).chord, 'Dm7b5', 'two-chord bar: the first chord on slots 0..3');
assert.equal(paletteAt(cs, bossa.bars, 15, 4).chord, 'G7', 'the second from slot 4');
const parts = { palette: { mode: 'scales', parts: [{ bars: [0, 7], scale: 'aeolian', root: 'C' }, { bars: [8, 11], scale: 'major', root: 'Db' }, { bars: [12, 15], scale: 'aeolian', root: 'C' }] } };
assert.equal(paletteAt(parts, bossa.bars, 9, 0).scale, 'major');
assert.ok(paletteAt(parts, bossa.bars, 9, 0).pcs.has(1), 'Db in the Db-major part');
assert.ok(!paletteAt(parts, bossa.bars, 2, 0).pcs.has(1), 'no Db in C aeolian over Fm7');

// ---------- roles, changes, grid ----------
assert.deepEqual(blues.bars.map((_, k) => roleOf(sScale, k)).join(' '), 'you you rest rest you you rest rest you you rest rest');
const sCall = read('content/solos/blues-call.json');
assert.deepEqual(blues.bars.map((_, k) => roleOf(sCall, k)).slice(0, 4), ['band', 'band', 'you', 'you']);
assert.equal(roleOf({ phrasing: null }, 7), 'you');
assert.deepEqual(changesOf(blues.bars).map((c) => c.bar), [0, 4, 6, 8, 9, 10, 11], 'C7 after the closing G7 counts (the form loops)');
assert.deepEqual(changesOf(bossa.bars).filter((c) => c.bar === 15), [{ bar: 15, slot: 0 }, { bar: 15, slot: 4 }], 'Dm7b5 after Cm7 on slot 0, G7 on slot 4');
assert.ok(!changesOf(bossa.bars).some((c) => c.bar === 11), 'Dbmaj7 after Dbmaj7: no change');
assert.equal(slotAt(2 / 3, 60, true), 1, 'swung off-beat at 2/3 of the beat');
assert.equal(gridIndex(-0.02, 60, false), 0, 'a slightly early downbeat belongs to slot 0');

// ---------- scoring: synthetic 12-bar choruses (60 bpm, straight: an eighth is 0.5 s, a bar 4 s) ----------
const BPM = 60, at = (bar, slot, dev = 0) => bar * 4 + slot * 0.5 + dev;
const ctx = (solo, swing = false) => ({ solo, bars: blues.bars, bpm: BPM, swing });
// a 4-note phrase (C Eb F G, all in blues C) on bars 0, 4, 8; bars 1, 5, 9 empty; rests clean
const phrase = (bar) => [60, 63, 65, 67].map((m, i) => ({ t: at(bar, i), m }));
let notes = [0, 4, 8].flatMap(phrase);
let s = scoreChorus(notes, ctx(sScale));
assert.equal(s.inside, 1); assert.equal(s.grid, 1);
assert.equal(s.phrases, 3, 'three phrases of 4 notes');
assert.deepEqual(s.rests, { ok: 6, total: 6 });
assert.equal(s.pitches, 4); assert.equal(s.notes, 12);
assert.deepEqual(s.targets, { ok: 0, total: 0 }, 'blues-scale has no targets');
assert.equal(s.perBar[0].clean, true); assert.equal(s.perBar[1].clean, false, 'an empty play bar is not clean');
assert.equal(s.perBar[2].restOk, true); assert.equal(s.perBar[0].restOk, null);
assert.ok(passed(s, sScale.pass), 'the clean chorus passes blues-scale');

// a phrase split by a gap of a beat: 2 + 2 notes = no phrase
s = scoreChorus([{ t: at(0, 0), m: 60 }, { t: at(0, 1), m: 63 }, { t: at(0, 4), m: 65 }, { t: at(0, 5), m: 67 }], ctx(sScale));
assert.equal(s.phrases, 0, 'two 2-note groups');
s = scoreChorus([0, 2, 4, 6].map((sl, i) => ({ t: at(0, sl, i % 2 ? 0.08 : -0.08), m: 60 + 3 * (i % 2) })), ctx(sScale));
assert.equal(s.phrases, 1, 'a line of quarter notes (a little uneven) is one phrase');
s = scoreChorus([{ t: at(0, 0), m: 60 }, { t: at(0, 1), m: 63 }, { t: at(0, 4), m: 65 }, { t: at(0, 5), m: 67 }, { t: at(1, 0), m: 63 }, { t: at(1, 1), m: 60 }], ctx(sScale));
assert.equal(s.phrases, 0, 'a quarter rest after an eighth splits (onsets 1.5 beats apart)');
// a note on the first eighth of a rest bar is a tail; a second note breaks the rest
s = scoreChorus([...phrase(0), { t: at(1, 7), m: 60 }, { t: at(2, 0), m: 60 }], ctx(sScale));
assert.equal(s.perBar[2].restOk, true, 'one note on slot 0 of a rest bar is a tail');
assert.equal(s.phrases, 1);
s = scoreChorus([...phrase(0), { t: at(2, 0), m: 60 }, { t: at(2, 3), m: 63 }, { t: at(7, 2), m: 63 }], ctx(sScale));
assert.equal(s.perBar[2].restOk, false); assert.equal(s.perBar[7].restOk, false, 'one note off the first eighth breaks the rest');
assert.deepEqual(s.rests, { ok: 4, total: 6 });
assert.equal(s.notes, 4, 'notes in rest bars do not count for inside / grid');

// inside and the approach note: D (out of blues C) resolving a semitone up to Eb within an eighth counts
s = scoreChorus([{ t: at(0, 0), m: 62 }, { t: at(0, 1), m: 63 }, { t: at(0, 2), m: 65 }], ctx(sScale));
assert.equal(s.inside, 1, 'D -> Eb is an approach');
s = scoreChorus([{ t: at(0, 0), m: 62 }, { t: at(0, 3), m: 63 }, { t: at(0, 4), m: 65 }], ctx(sScale));
assert.ok(Math.abs(s.inside - 2 / 3) < 1e-9, 'resolved too late (1.5 eighths): not an approach');
s = scoreChorus([{ t: at(0, 0), m: 62 }, { t: at(0, 1), m: 60 }, { t: at(0, 2), m: 65 }], ctx(sScale));
assert.ok(Math.abs(s.inside - 2 / 3) < 1e-9, 'D -> C is a whole step: not an approach');
s = scoreChorus([{ t: at(0, 0), m: 61 }, { t: at(0, 1), m: 62 }, { t: at(0, 2), m: 60 }], ctx(sScale));
assert.equal(s.inside, 1 / 3, 'Db -> D: D is out too, so neither is inside');

// grid: off by a third of an eighth is off the grid at 60 bpm (win = 0.225 s), 0.1 s is on it
s = scoreChorus([{ t: at(0, 0, 0.1), m: 60 }, { t: at(0, 2, -0.1), m: 63 }, { t: at(0, 4, 0.24), m: 65 }, { t: at(0, 6), m: 67 }], ctx(sScale));
assert.equal(s.grid, 0.75);
// swing: the off-beat sits at 2/3 of the beat
s = scoreChorus([{ t: 0, m: 60 }, { t: 2 / 3, m: 63 }, { t: 1, m: 65 }, { t: 1 + 2 / 3, m: 67 }], ctx(sScale, true));
assert.equal(s.grid, 1, 'swung eighths are on the swing grid');

// targets: bar 4 is F7 after C7 (0-based)
const sChords = read('content/solos/blues-chords.json');
s = scoreChorus([{ t: at(3, 4), m: 64 }, { t: at(3, 5), m: 67 }, { t: at(3, 6), m: 70 }, { t: at(4, 0), m: 69 }, { t: at(4, 1), m: 65 }], ctx(sChords));
assert.deepEqual(s.targets, { ok: 1, total: 1 }, 'A on beat 1 of F7: a target note');
assert.equal(s.perBar[4].target, true);
s = scoreChorus([{ t: at(3, 4), m: 64 }, { t: at(3, 5), m: 67 }, { t: at(4, 0), m: 67 }, { t: at(4, 2), m: 69 }], ctx(sChords));
assert.deepEqual(s.targets, { ok: 0, total: 1 }, 'G on beat 1 of F7 (a 9th, not a chord tone): a miss');
assert.equal(s.perBar[4].target, false);
s = scoreChorus([{ t: at(4, 1, 0.02), m: 69 }], ctx(sChords));
assert.deepEqual(s.targets, { ok: 1, total: 1 }, 'the and of one is still the first beat');
s = scoreChorus([{ t: at(4, 2), m: 67 }], ctx(sChords));
assert.deepEqual(s.targets, { ok: 0, total: 0 }, 'nothing on beat 1: no data');
s = scoreChorus([{ t: at(4, 0, -0.03), m: 69 }], ctx(sChords));
assert.deepEqual(s.targets, { ok: 1, total: 1 }, 'a slightly early downbeat counts for the new bar');
assert.equal(s.perBar[3].notes, 0);

// ---------- thresholds ----------
const base = { inside: 0.9, grid: 0.8, phrases: 3, rests: { ok: 5, total: 6 }, targets: { ok: 3, total: 4 }, pitches: 5 };
const pass = { inside: 0.9, grid: 0.7, phrases: 3, rests: 0.8, targets: 0.6, pitches: 3 };
assert.equal(passed(base, pass), true);
assert.equal(passed({ ...base, inside: 0.89 }, pass), false);
assert.equal(passed({ ...base, grid: 0.69 }, pass), false);
assert.equal(passed({ ...base, phrases: 2 }, pass), false);
assert.equal(passed({ ...base, rests: { ok: 4, total: 6 } }, pass), false, '4/6 < 0.8');
assert.equal(passed({ ...base, targets: { ok: 2, total: 4 } }, pass), false);
assert.equal(passed({ ...base, targets: { ok: 0, total: 0 } }, pass), true, 'no target data passes');
assert.equal(passed({ ...base, rests: { ok: 0, total: 0 } }, pass), true, 'free phrasing: no rest bars');
assert.equal(passed({ ...base, pitches: 2 }, pass), false);
assert.equal(passed({ ...base, inside: 0.2 }, { phrases: 3 }), true, 'only the thresholds given are checked');
assert.deepEqual(checks({ ...base, grid: 0.5 }, pass), { inside: true, grid: false, phrases: true, pitches: true, rests: true, targets: true });
const run = combine([{ ...base, inside: 1, phrases: 4, pitches: 6 }, { ...base, inside: 0.8, phrases: 2, pitches: 3 }]);
assert.ok(Math.abs(run.inside - 0.9) < 1e-9); assert.equal(run.phrases, 3); assert.equal(run.pitches, 3);
assert.deepEqual(run.rests, { ok: 10, total: 12 }); assert.equal(run.choruses, 2);

// ---------- the band's call ----------
let seed = 7; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
for (let i = 0; i < 60; i++) {
  const bar = [0, 4, 8][i % 3];
  const { shape, notes: cn } = makeCall(sCall, blues.bars, bar, rng);
  assert.ok(['up', 'down', 'arch', 'same'].includes(shape));
  assert.ok(cn.length >= 4 && cn.length <= 6, 'four to six notes');
  assert.equal(cn[0].slot, 0);
  cn.forEach((n, k) => {
    assert.ok(n.slot >= 0 && n.slot < 14, 'within the two bars, the last beat free');
    if (k) assert.ok(n.slot > cn[k - 1].slot);
    assert.ok(n.m >= sCall.hand.lo && n.m <= sCall.hand.hi, 'within the hand');
    const pal = paletteAt(sCall, blues.bars, bar + Math.floor(n.slot / 8), n.slot % 8);
    assert.ok(pal.pcs.has(n.m % 12), 'a palette note');
    if (n.slot % 2 === 0) assert.ok(pal.chordPcs.has(n.m % 12), 'on the beat: a chord tone');
  });
}

// ---------- blues content and track wiring ----------
const track = read('content/tracks/blues.json');
const sec = track.sections.map((x) => x.id);
assert.equal(sec[sec.indexOf('rh') + 1], 'imp', 'Improvisation right after the right hand');
const imp = track.sections.find((x) => x.id === 'imp');
assert.deepEqual(imp.items, ['imp-b1', 'imp-b2', 'imp-b3', 'imp-b4']);
const want = { 'imp-b1': 'blues-scale', 'imp-b2': 'blues-call', 'imp-b3': 'blues-chords', 'imp-b4': 'blues-solo' };
Object.entries(want).forEach(([id, sid]) => {
  assert.deepEqual([track.items[id].kind, track.items[id].solo], ['solo', sid]);
  const so = read(`content/solos/${sid}.json`);
  assert.equal(so.$format, 'jazzlab-solo/1'); assert.equal(so.id, sid);
  assert.ok(so.title.ru && so.title.en && so.about.ru && so.about.en, sid + ': title and about in ru and en');
  assert.deepEqual([so.form, so.pattern], ['blues-c', 'p2']);
  assert.deepEqual(so.hand, { lo: 60, hi: 72 });
  read(`content/forms/${so.form}.json`); read(`content/patterns/${so.pattern}.json`);
});
assert.deepEqual(read('content/solos/blues-scale.json').pass, { inside: 0.9, grid: 0.7, phrases: 3, rests: 0.8, pitches: 3 });
assert.equal(read('content/solos/blues-call.json').call, true);
const bc = read('content/solos/blues-chords.json');
assert.deepEqual([bc.palette.mode, bc.phrasing, bc.targets, bc.pass.targets, bc.pass.phrases, bc.pass.inside], ['chordscale', null, true, 0.6, 4, 0.85]);
const bs = read('content/solos/blues-solo.json');
assert.deepEqual([bs.choruses, bs.targets, bs.pass.targets, bs.pass.phrases], [3, true, 0.5, 3]);

// the day queue: at most one solo among the fresh items
const its = { a: { kind: 'form' }, s1: { kind: 'solo' }, s2: { kind: 'solo' }, b: { kind: 'lick' } };
assert.deepEqual(freshItems(['s1', 's2', 'a', 'b'], its, () => false, 3), ['s1', 'a', 'b'], 'one solo a day');
assert.deepEqual(freshItems(['s1', 's2', 'a'], its, (id) => id === 's1', 2), ['s2', 'a']);

console.log('solo tests ok');
