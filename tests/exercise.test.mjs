// normalize(): every exercise passes by cleanliness at any tempo unless passAnyTempo is explicitly false.
// Run: node tests/exercise.test.mjs
import assert from 'node:assert/strict';
import { normalize } from '../app/js/music/exercise.js';

const base = { $format: 'jazzlab-exercise/1', bars: [{ rh: [], lh: [] }] }; // minimal valid exercise
assert.equal(normalize({ ...base }).passAnyTempo, true, 'default: any tempo passes');
assert.equal(normalize({ ...base, passAnyTempo: true }).passAnyTempo, true);
assert.equal(normalize({ ...base, passAnyTempo: false }).passAnyTempo, false, 'explicit false keeps the tempo gate');
assert.equal(normalize({ ...base, tempo: { start: 60, target: 90 } }).tempo.target, 90, 'target stays available as a goal');
console.log('exercise.test: ok');
