// Note-name modes per context. Run: node tests/names.test.mjs
import assert from 'node:assert/strict';
import { NAME_MODES, storedMode, nameMode, nameInText } from '../app/js/music/names.js';

assert.deepEqual(NAME_MODES, ['en', 'ru', 'both', 'off']);
assert.equal(storedMode({}), 'en'); assert.equal(storedMode(null), 'en'); assert.equal(storedMode({ names: 'xx' }), 'en');
assert.equal(storedMode({ names: 'both' }), 'both');
const table = { // stored → [text, short, key, opt]
  en: ['en', 'en', 'en', 'en'], ru: ['ru', 'ru', 'ru', 'ru'], both: ['both', 'en', 'en', 'en'], off: ['en', 'en', 'off', null]
};
for (const [m, exp] of Object.entries(table)) assert.deepEqual(['text', 'short', 'key', 'opt'].map((c) => nameMode({ names: m }, c)), exp, m);
assert.equal(nameMode({}, 'key'), 'en');
assert.equal(nameInText('Eb4', 'ru', 'ru'), 'ми♭');
assert.equal(nameInText('Eb4', 'ru', 'en'), 'Ми♭');
assert.equal(nameInText('G4', 'both', 'ru'), 'G (соль)');
assert.equal(nameInText('F#3', 'en', 'ru'), 'F♯');
assert.equal(nameInText('C4', null, 'ru'), 'C');
console.log('names: ok');
