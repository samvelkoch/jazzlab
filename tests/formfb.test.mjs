// Form-screen feedback helpers. Run: node tests/formfb.test.mjs
import assert from 'node:assert/strict';
import * as F from '../app/js/music/formfb.js';

const iss = [{ bar: 9, kind: 'late' }, { bar: 8, kind: 'wrong' }, { bar: 9, kind: 'miss' }, { bar: 2, kind: 'early' }];
assert.deepEqual(F.slipBars(iss).map((x) => x.bar), [8, 9], 'only wrong keys and misses, in form order');
assert.deepEqual(F.loopWindow([8, 9], 12), [8, 11], 'bars 9–12');
assert.deepEqual(F.loopWindow([4], 12), [4, 7]);
assert.deepEqual(F.loopWindow([2, 3, 4, 5], 12), [2, 5], 'the window with the most slips wins');
assert.deepEqual(F.loopWindow([1], 3), [0, 2]);
assert.equal(F.loopWindow([], 12), null);
assert.equal(F.tendency([-0.08, -0.07, -0.09, -0.01, 0.0], 0.05), 'rush');
assert.equal(F.tendency([0.08, 0.07, 0.09, 0.0, 0.01], 0.05), 'drag');
assert.equal(F.tendency([0.01, -0.01, 0.02, -0.02, 0], 0.05), 'even');
assert.equal(F.tendency([-0.2], 0.05), 'even', 'too few hits to say');
assert.equal(F.beatWord(0), '1'); assert.equal(F.beatWord(4), '3'); assert.equal(F.beatWord(3), '2 и'); assert.equal(F.beatWord(5, 'and'), '3 and');
assert.deepEqual(F.changeBars(['C7', 'C7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7']), [5, 7, 9, 10, 11, 12]);
const f = ['ошибка', 'ошибки', 'ошибок'];
assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map((n) => F.plural(n, f)), ['ошибка', 'ошибки', 'ошибок', 'ошибок', 'ошибка', 'ошибки', 'ошибок']);
console.log('formfb.test: ok');
