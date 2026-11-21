// Form screen view logic: task mode, bar lists, the «Now» strip, the «Next» summary, the keyboard plan. Run: node tests/formview.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { taskMode, phraseStarts, fmtBars, eventSlots, nextEventG, keyPlan, stripRow, barSummary, staffBars } from '../app/js/music/formview.js';
import { normalize } from '../app/js/music/exercise.js';
import { midiToName } from '../app/js/music/notes.js';

// ---------- task mode ----------
assert.deepEqual(taskMode({ rh: false }), { mode: 'lh' });
assert.deepEqual(taskMode({ rh: true, comp: true, two: true }), { mode: 'comp' });
assert.deepEqual(taskMode({ rh: true }), { mode: 'lick' });
assert.deepEqual(taskMode({ rh: true, pair: [1, 2] }), { mode: 'qa' });
assert.deepEqual(taskMode({ rh: true, kl: [1] }), { mode: 'key' });
assert.deepEqual(taskMode({ rh: true, mel: {}, kl: null }), { mode: 'mel' });
assert.deepEqual(taskMode({ rh: true, two: true, mel: {} }), { mode: 'both', sub: 'mel' });
assert.deepEqual(taskMode({ rh: true, two: true, pair: [1, 2] }), { mode: 'both', sub: 'qa' });

// ---------- bar lists from the real data ----------
const n = (t) => ({ t, m: 60, d: 1 });
// a lick on every odd bar of a 12-bar form
{ const rh = Array.from({ length: 12 }, (_, k) => (k % 2 ? [n(0)] : [n(0), n(2)]));
  const s = phraseStarts(rh, (k) => ((k / 2) % 2 === 0 ? 'question' : 'answer'));
  assert.deepEqual(s.all, [1, 3, 5, 7, 9, 11]); assert.deepEqual(s.q, [1, 5, 9]); assert.deepEqual(s.a, [3, 7, 11]); }
// 16 bars, one empty pair: it is left out
{ const rh = Array.from({ length: 16 }, (_, k) => (k === 4 || k === 5 ? [] : [n(0)]));
  assert.deepEqual(phraseStarts(rh).all, [1, 3, 7, 9, 11, 13, 15]); }
// an odd number of bars: the last phrase has one bar
assert.deepEqual(phraseStarts([[n(0)], [], [n(0)]]).all, [1, 3]);
assert.equal(fmtBars([1, 5, 9]), '1, 5, 9');
assert.equal(fmtBars([1, 3, 5, 7, 9, 11]), '1, 3, 5, 7, 9, 11');
assert.equal(fmtBars(Array.from({ length: 16 }, (_, k) => 2 * k + 1)), '1, 3, 5 … 31');
assert.equal(fmtBars(['5–6', '9–10']), '5–6, 9–10');
assert.equal(fmtBars([]), '');

// ---------- event slots and the next event ----------
assert.deepEqual(eventSlots([[n(4), n(0), n(0)], [], [n(7)]]), [[0, 4], [], [7]]);
{ const slots = [[0, 4], [], [7]]; // 3 bars
  assert.equal(nextEventG(slots, 0), 0);
  assert.equal(nextEventG(slots, 1), 4);
  assert.equal(nextEventG(slots, 5), 23); // bar 2 slot 7
  assert.equal(nextEventG(slots, 24), 24); // the next chorus, bar 0 slot 0
  assert.equal(nextEventG(slots, 25), 28);
  assert.equal(nextEventG([[], []], 0), -1); }

// ---------- keyboard plan ----------
// left hand: root on 1 (pinky), fifth on 3 (thumb); bar 2 has a different chord
{ const lh = [[{ t: 0, m: 48, f: 5, d: 4 }, { t: 4, m: 55, f: 1, d: 4 }], [{ t: 0, m: 53, f: 5, d: 4 }, { t: 4, m: 60, f: 1, d: 4 }]];
  let p = keyPlan({ rh: null, lh }, -1);
  assert.equal(p.g, 0); assert.equal(p.bar, 0); assert.deepEqual(p.target, { rh: [], lh: [48] });
  assert.deepEqual(p.tint.lh, [{ m: 48, f: 5 }, { m: 55, f: 1 }]);
  p = keyPlan({ rh: null, lh }, 0); // the root is done: the fifth is the target, same bar
  assert.equal(p.g, 4); assert.equal(p.bar, 0); assert.deepEqual(p.target.lh, [55]);
  p = keyPlan({ rh: null, lh }, 4); // the last note of bar 1 is done: the keyboard already shows bar 2
  assert.equal(p.g, 8); assert.equal(p.bar, 1); assert.deepEqual(p.target.lh, [53]); assert.deepEqual(p.tint.lh.map((e) => e.m), [53, 60]);
  p = keyPlan({ rh: null, lh }, 12); // the end of the form: back to bar 1 of the next chorus
  assert.equal(p.g, 16); assert.equal(p.bar, 0); }
// a chord is one target with several keys; a pitch used twice shows the finger of its next use
{ const rh = [[{ t: 0, m: 64, f: 2 }, { t: 0, m: 67, f: 4 }, { t: 2, m: 64, f: 3 }]];
  let p = keyPlan({ rh, lh: null }, -1);
  assert.deepEqual(p.target.rh, [64, 67]); assert.deepEqual(p.tint.rh, [{ m: 64, f: 2 }, { m: 67, f: 4 }]);
  p = keyPlan({ rh, lh: null }, 0);
  assert.equal(p.slot, 2); assert.deepEqual(p.target.rh, [64]); assert.deepEqual(p.tint.rh, [{ m: 64, f: 3 }, { m: 67, f: 4 }]); }
// both hands: the target takes the notes of both at one slot; a bar where only the left hand plays still counts
{ const rh = [[{ t: 2, m: 72, f: 1 }], []], lh = [[{ t: 0, m: 48, f: 5 }, { t: 2, m: 55, f: 1 }], [{ t: 0, m: 53, f: 5 }]];
  let p = keyPlan({ rh, lh }, -1);
  assert.deepEqual(p.target, { rh: [], lh: [48] });
  p = keyPlan({ rh, lh }, 0);
  assert.deepEqual(p.target, { rh: [72], lh: [55] });
  p = keyPlan({ rh, lh }, 2);
  assert.equal(p.bar, 1); assert.deepEqual(p.target, { rh: [], lh: [53] }); assert.deepEqual(p.tint.rh, []); }
// a rest bar is skipped: the next bar with notes is shown
{ const rh = [[{ t: 6, m: 60, f: 1 }], [], [], [{ t: 0, m: 62, f: 2 }]];
  const p = keyPlan({ rh, lh: null }, 6);
  assert.equal(p.bar, 3); assert.equal(p.g, 24); }
assert.equal(keyPlan({ rh: [[], []], lh: null }, -1), null);
assert.equal(keyPlan({ rh: null, lh: null }, -1), null);

// ---------- the «Now» strip and the «Next» summary ----------
const nm = (e) => ({ 48: 'C', 55: 'G', 64: 'E', 67: 'G', 70: 'B♭' })[e.m] || String(e.m);
{ const row = stripRow([{ t: 0, m: 48, f: 5, d: 4 }, { t: 4, m: 55, f: 1, d: 2 }], nm);
  assert.equal(row.length, 8);
  assert.deepEqual(row[0], { names: ['C'], f: [5], hold: false });
  assert.deepEqual(row[1], { hold: true }); assert.deepEqual(row[3], { hold: true });
  assert.deepEqual(row[4], { names: ['G'], f: [1], hold: false });
  assert.deepEqual(row[5], { hold: true }); assert.equal(row[6], null); assert.equal(row[7], null); }
// a chord: one slot, high note first; a duplicate pitch is shown once
{ const row = stripRow([{ t: 2, m: 64, f: 2, d: 1 }, { t: 2, m: 70, f: 4, d: 1 }, { t: 2, m: 64, f: 2, d: 1 }], nm);
  assert.deepEqual(row[2], { names: ['B♭', 'E'], f: [4, 2], hold: false }); assert.equal(row[3], null); }
assert.deepEqual(stripRow([], nm), Array(8).fill(null));
assert.deepEqual(barSummary([{ t: 4, m: 55 }, { t: 0, m: 48 }, { t: 6, m: 48 }, { t: 2, m: 64 }], nm), ['C', 'E', 'G']);
assert.deepEqual(barSummary([], nm), []);

// ---------- the staff window ----------
{ const sp = (hd, bar, e) => midiToName(e.m);
  const lh = [[{ t: 0, m: 48, d: 4 }, { t: 4, m: 55, d: 4 }], [{ t: 0, m: 53, d: 4 }, { t: 4, m: 60, d: 4 }], [{ t: 0, m: 55, d: 8 }]];
  const rh = [[{ t: 0, m: 67, d: 1 }, { t: 0, m: 64, d: 2 }, { t: 0, m: 64, d: 2 }, { t: 6, m: 70, d: 4 }], [], [{ t: 7, m: 72, d: 1, stac: true }]];
  let ex = staffBars({ rh, lh }, 0, sp);
  assert.equal(ex.bars.length, 2);
  assert.deepEqual(ex.bars[0].rh, [{ t: 0, d: 2, n: ['E4', 'G4'], f: [], stac: false }, { t: 6, d: 2, n: ['A#4'], f: [], stac: false }]); // chord low → high, cut at the bar line
  assert.deepEqual(ex.bars[0].lh.map((e) => e.n), [['C3'], ['G3']]);
  assert.deepEqual(ex.bars[1].rh, []);
  ex = staffBars({ rh, lh: null }, 2, sp); // the last bar wraps round to bar 1; a hand that is not yours stays empty
  assert.deepEqual(ex.bars[0].rh, [{ t: 7, d: 1, n: ['C5'], f: [], stac: true }]); assert.deepEqual(ex.bars[0].lh, []);
  assert.deepEqual(ex.bars[1].rh.map((e) => e.n), [['E4', 'G4'], ['A#4']]);
  const norm = normalize(ex); // the screen normalizes it for createStaff
  assert.equal(norm.per, 8); assert.equal(norm.bars[0].rh[0].notes[0], 'C5');
  assert.equal(staffBars({ rh: [[{ t: 0, m: 60 }]], lh: null }, 0, sp).bars.length, 1); } // a one-bar form: one bar

// ---------- every new string exists in ru and en ----------
{ const src = readFileSync(new URL('../app/js/i18n.js', import.meta.url), 'utf8');
  const keys = ['fvTask', 'fvLh', 'fvLick', 'fvQa', 'fvKey', 'fvKeyQa', 'fvMel', 'fvBoth', 'fvBothLick', 'fvBothQa', 'fvBothKey', 'fvBothMel', 'fvComp',
    'fvPass', 'fvChorusW', 'fvPassSlips', 'fvLook', 'fvNow', 'fvFirst', 'fvBar', 'fvNext', 'fvRest', 'fvListenLh', 'fvAnd',
    'fvStaffOn', 'fvStaffOff', 'fvStaffAria'];
  for (const k of keys) assert.equal((src.match(new RegExp(`\\b${k}: '`, 'g')) || []).length, 2, 'ru + en for ' + k); }

console.log('formview: ok');
