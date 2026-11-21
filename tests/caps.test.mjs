// Capital headings keep chord symbols and roman numerals in their own case (app/js/caps.js). Run: node tests/caps.test.mjs
import assert from 'node:assert/strict';
import { protectedRanges } from '../app/js/caps.js';

const tokens = (s) => protectedRanges(s).map(([a, b]) => s.slice(a, b));
assert.deepEqual(tokens('Turnaround: C, A7, Dm7, G7'), ['Dm7']);
assert.deepEqual(tokens('Оборот: C, A7, Dm7, G7'), ['Dm7']);
assert.deepEqual(tokens('ii–V–I in Bb'), ['ii', 'Bb']);
assert.deepEqual(tokens('Dm7b5 · Cmaj7 · Ebmaj7(#11) · F/Ab · C7(b9)'), ['Dm7b5', 'Cmaj7', 'Ebmaj7(#11)', 'F/Ab', 'C7(b9)']);
assert.deepEqual(tokens('iiø7 – V7 – i'), ['iiø7']);
// plain words and capitals stay as they are
assert.deepEqual(tokens('Blues in C, three choruses'), []);
assert.deepEqual(tokens('A Day in the Life of a Fool · Dmitri · Cab · Bad · Amen'), []);
// an English «Am» is taken for A minor: harmless, it only stays in its own case
assert.deepEqual(tokens('Am I blue'), ['Am']);
assert.deepEqual(tokens('C7 F7 G7'), []);
assert.deepEqual(tokens('Go, Do, Eo'), []);
console.log('caps ok');
