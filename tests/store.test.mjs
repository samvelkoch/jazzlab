// Spaced review schedule. Run: node tests/store.test.mjs (no localStorage in node: the store falls back to memory)
import assert from 'node:assert/strict';
import { scheduleReview, dueReviews, reviews } from '../app/js/store.js';
import { parsePattern } from '../app/js/music/rhythm.js';

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

// half notes in rhythm strings
assert.deepEqual(parsePattern('2 2').map((e) => [e.t, e.d]), [[0, 4], [4, 4]]);
assert.deepEqual(parsePattern('4 r4 2').map((e) => [e.t, e.d, e.rest]), [[0, 2, false], [2, 2, true], [4, 4, false]]);
console.log('ok: store + rhythm');
