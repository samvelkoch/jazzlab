// Lick feedback: note-by-note scoring and plain-words key hints. Run: node tests/lickfb.test.mjs
import assert from 'node:assert/strict';
import { scoreRepeat, keyHint, beatKey, isBlack, homeCheck } from '../app/js/music/lickfb.js';

const exp = [{ t: 0, m: 63 }, { t: 0.5, m: 64 }, { t: 1, m: 67 }, { t: 2, m: 70 }];
const o = { win: 0.15, tight: 0.05, near: 0.4 };

// perfect
{ const r = scoreRepeat(exp, exp.map((e) => ({ t: e.t, m: e.m })), o); assert.ok(r.clean); assert.equal(r.extra, 0); assert.deepEqual(r.notes.map((n) => n.res), ['ok', 'ok', 'ok', 'ok']); }
// a bit late but in the window: still clean
{ const r = scoreRepeat(exp, exp.map((e) => ({ t: e.t + 0.1, m: e.m })), o); assert.ok(r.clean); assert.equal(r.notes[0].res, 'bitLate'); }
// wrong key on note 3
{ const taps = exp.map((e) => ({ t: e.t, m: e.m })); taps[2].m = 69; const r = scoreRepeat(exp, taps, o); assert.ok(!r.clean); assert.equal(r.notes[2].res, 'wrong'); assert.equal(r.notes[2].got, 69); }
// rhythm only: any key is fine
{ const r = scoreRepeat(exp, exp.map((e) => ({ t: e.t, m: 60 })), { ...o, pitch: false }); assert.ok(r.clean); }
// way early on note 4 → «early», not «miss + extra»
{ const taps = exp.map((e) => ({ t: e.t, m: e.m })); taps[3].t = 1.7; const r = scoreRepeat(exp, taps, o); assert.equal(r.notes[3].res, 'early'); assert.equal(r.extra, 0); assert.ok(!r.clean); }
// missing note and a stray far tap
{ const taps = exp.slice(0, 3).map((e) => ({ t: e.t, m: e.m })).concat([{ t: 3.5, m: 60 }]); const r = scoreRepeat(exp, taps, o); assert.equal(r.notes[3].res, 'miss'); assert.equal(r.extra, 1); }
// an extra tap spoils a clean repeat
{ const taps = exp.map((e) => ({ t: e.t, m: e.m })).concat([{ t: 1.3, m: 60 }]); const r = scoreRepeat(exp, taps, o); assert.ok(!r.clean); assert.equal(r.extra, 1); }
// nothing expected → never clean
assert.ok(!scoreRepeat([], [], o).clean);

assert.deepEqual(keyHint(70, 71), { dir: 'left', keys: 1, black: true });
assert.deepEqual(keyHint(67, 64), { dir: 'right', keys: 3, black: false });
assert.equal(keyHint(60, 60).dir, 'same');
assert.equal(isBlack(63), true); assert.equal(isBlack(64), false);
assert.deepEqual([0, 1, 2, 4, 6, 7, 8].map(beatKey), ['lqBeat1', 'lqAnd', 'lqBeat2', 'lqBeat3', 'lqBeat4', 'lqAnd', 'lqBeat1']);
// own answer: ends at home or not
assert.equal(homeCheck([], 0).count, 0);
assert.deepEqual(homeCheck([{ t: 0, m: 67 }, { t: 1, m: 60 }], 0), { count: 2, last: 60, home: true, dir: 'same', keys: 0 });
assert.deepEqual(homeCheck([{ t: 0, m: 60 }, { t: 1, m: 63 }], 0), { count: 2, last: 63, home: false, dir: 'left', keys: 3 });
assert.deepEqual(homeCheck([{ t: 0, m: 70 }], 0), { count: 1, last: 70, home: false, dir: 'right', keys: 2 });
assert.equal(homeCheck([{ t: 2, m: 72 }, { t: 1, m: 70 }], 0).home, true, 'the last in time counts');
console.log('lickfb ok');
