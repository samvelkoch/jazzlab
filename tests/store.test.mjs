// Spaced review schedule. Run: node tests/store.test.mjs (no localStorage in node: the store falls back to memory)
import assert from 'node:assert/strict';
import { scheduleReview, dueReviews, reviews, isDone, itemDone } from '../app/js/store.js';
import { freshItems } from '../app/js/queue.js';
import { parsePattern, patternRhythm, lenToken } from '../app/js/music/rhythm.js';

const day = (k) => new Date(Date.UTC(2026, 0, 1 + k, 12));
const r1 = scheduleReview('x', true, day(0));
assert.equal(r1.interval, 1); assert.equal(r1.n, 1);
// same-day repeats do not inflate the schedule
scheduleReview('x', true, day(0)); scheduleReview('x', true, day(0));
assert.equal(reviews().x.interval, 1); assert.equal(reviews().x.n, 1);
assert.deepEqual(dueReviews(day(0)), []);
assert.deepEqual(dueReviews(day(1)), ['x']);
// a pass on the due day moves it to 3 days, then 7
scheduleReview('x', true, day(1)); assert.equal(reviews().x.interval, 3);
assert.deepEqual(dueReviews(day(3)), []); assert.deepEqual(dueReviews(day(4)), ['x']);
scheduleReview('x', true, day(4)); assert.equal(reviews().x.interval, 7);
// a failure goes back to day 1 at once
scheduleReview('x', false, day(5)); assert.equal(reviews().x.interval, 1); assert.equal(reviews().x.n, 0);
assert.deepEqual(dueReviews(day(6)), ['x']);

// track done-ness: a left-hand pattern needs «by heart» (where its review starts); other kinds keep isDone
const tempoOnly = { stages: { rhythm: true, notes: true, tempo: true } };
assert.equal(isDone(tempoOnly), true, 'isDone (Riffs) is unchanged');
assert.equal(itemDone({ kind: 'pattern' }, tempoOnly), false, 'a pattern in tempo is only started');
assert.equal(itemDone({ kind: 'pattern' }, { stages: { ...tempoOnly.stages, memory: true } }), true);
assert.equal(itemDone({ kind: 'pattern' }, undefined), false);
assert.equal(itemDone({ kind: 'drill' }, { stages: { done: true } }), true);
assert.equal(itemDone({ kind: 'lick' }, { stages: { echo: true } }), false);
assert.equal(itemDone({ kind: 'exercise' }, { stages: { done: true } }), true);
// ...so today's queue keeps offering a pattern passed in tempo until it is played by heart
const qItems = { p1: { kind: 'pattern' }, p2: { kind: 'pattern' }, d1: { kind: 'drill' }, l1: { kind: 'lick' } };
const qProg = { p1: { stages: { ...tempoOnly.stages, memory: true } }, p2: tempoOnly, d1: { stages: { done: true } } };
assert.deepEqual(freshItems(['p1', 'p2', 'd1', 'l1'], qItems, (id) => itemDone(qItems[id], qProg[id]), 2), ['p2', 'l1']);
assert.deepEqual(freshItems(['p1', 'p2', 'd1', 'l1'], qItems, (id) => isDone(qProg[id]), 2), ['l1'], 'the old rule skipped it');

// half notes in rhythm strings
assert.deepEqual(parsePattern('2 2').map((e) => [e.t, e.d]), [[0, 4], [4, 4]]);
assert.deepEqual(parsePattern('4 r4 2').map((e) => [e.t, e.d, e.rest]), [[0, 2, false], [2, 2, true], [4, 4, false]]);
// dotted and tied lengths (the bossa bass cell)
assert.deepEqual(parsePattern('4. 8 r4 4').filter((e) => !e.rest).map((e) => e.t), [0, 3, 6], 'onsets on slots 0, 3, 6');
assert.deepEqual(parsePattern('4. 8 r4 4').map((e) => [e.t, e.d, e.rest]), [[0, 3, false], [3, 1, false], [4, 2, true], [6, 2, false]]);
assert.deepEqual(parsePattern('2. 4').map((e) => [e.t, e.d]), [[0, 6], [6, 2]]);
assert.deepEqual(parsePattern('4. 4.~4').map((e) => [e.t, e.d]), [[0, 3], [3, 5]], 'a tie makes one note');
assert.deepEqual(parsePattern('4. 4. 4').map((e) => [e.t, e.d]), [[0, 3], [3, 3], [6, 2]]);
assert.throws(() => parsePattern('4~'), /Bad rhythm token/);
assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(lenToken), ['8', '4', '4.', '2', '4.~4', '2.', '2.~8', '2~2']);
[1, 2, 3, 4, 5, 6, 7, 8].forEach((d) => assert.equal(parsePattern(lenToken(d))[0].d, d));
assert.deepEqual(patternRhythm('4. 4.~4').onsets.map((o) => [o.slot, o.len]), [[0, 3], [3, 5]]);
console.log('ok: store + queue + rhythm');
