// Chord symbol parser. Run: node tests/chords.test.mjs
import assert from 'node:assert/strict';
import { parseChord, checkChord, voicing, explain, chordName, prettySymbol, withRoot, ChordError } from '../app/js/music/chords.js';

const names = (s) => parseChord(s).tones.map((x) => x.name).join(' ');
const req = (s) => parseChord(s).tones.filter((x) => x.req).map((x) => x.name).join(' ');
const cases = {
  C: 'C E G', Cm: 'C E♭ G', 'C-': 'C E♭ G', Cmaj: 'C E G', CM: 'C E G',
  C7: 'C E G B♭', Cmaj7: 'C E G B', CM7: 'C E G B', 'CΔ7': 'C E G B', 'CΔ': 'C E G B', Cm7: 'C E♭ G B♭', 'C-7': 'C E♭ G B♭',
  'Cm(maj7)': 'C E♭ G B', CmM7: 'C E♭ G B',
  B7sus: 'B E F♯ A', B7sus4: 'B E F♯ A', Csus2: 'C D G', Csus: 'C F G',
  C9: 'C E G B♭ D', Cmaj9: 'C E G B D', Cm9: 'C E♭ G B♭ D', C11: 'C E G B♭ D F', C13: 'C E G B♭ D F A',
  'C7(b9)': 'C E G B♭ D♭', 'C7(♭9)': 'C E G B♭ D♭', 'C7#9': 'C E G B♭ D♯', 'Cmaj7(#11)': 'C E G B F♯', 'C7(b9,#11)': 'C E G B♭ D♭ F♯',
  'Dm7(11)': 'D F A C G', 'G13': 'G B D F A C E', 'C13(b9)': 'C E G B♭ D♭ F A',
  Cdim: 'C E♭ G♭', Cdim7: 'C E♭ G♭ B𝄫', 'C°7': 'C E♭ G♭ B𝄫', Cm7b5: 'C E♭ G♭ B♭', 'Cø': 'C E♭ G♭ B♭', Caug: 'C E G♯', 'C+': 'C E G♯',
  C6: 'C E G A', Cm6: 'C E♭ G A', C69: 'C E G A D', 'C6/9': 'C E G A D', Cadd9: 'C E G D', C5: 'C G',
  'C7b5': 'C E G♭ B♭', 'C7#5': 'C E G♯ B♭', C7alt: 'C E B♭ D♭ D♯ A♭',
  Bb7: 'B♭ D F A♭', 'B♭maj7': 'B♭ D F A', 'F#m7': 'F♯ A C♯ E', Ebmaj7: 'E♭ G B♭ D', Abm: 'A♭ C♭ E♭', 'Db7': 'D♭ F A♭ C♭'
};
for (const [s, want] of Object.entries(cases)) assert.equal(names(s), want, s);

// optional tones: 5th in 7th chords, 9/11 under 13
assert.equal(req('C7'), 'C E B♭');
assert.equal(req('C'), 'C E G');
assert.equal(req('C13'), 'C E B♭ A');
assert.equal(req('Cm7b5'), 'C E♭ G♭ B♭');

// slash
const fa = parseChord('F/A');
assert.equal(fa.bass.name, 'A'); assert.equal(names('F/A'), 'F A C');
assert.equal(parseChord('C/Bb').bass.name, 'B♭');

// check: any octave / order; slash needs the bass lowest
const c7 = parseChord('C7');
assert.ok(checkChord(c7, [60, 64, 70]).ok, 'no fifth is fine');
assert.ok(checkChord(c7, [70, 52, 67, 48]).ok, 'any order and octave');
assert.deepEqual(checkChord(c7, [60, 64, 67]).missing, [10]);
assert.deepEqual(checkChord(c7, [60, 64, 70, 62]).extra, [62]);
assert.ok(!checkChord(fa, [53, 57, 60]).ok, 'F/A needs A in the bass');
assert.ok(checkChord(fa, [45, 53, 57, 60]).ok);
assert.ok(!checkChord(c7, []).ok);

// errors
assert.throws(() => parseChord(''), (e) => e instanceof ChordError && e.code === 'empty');
assert.throws(() => parseChord('H7'), (e) => e.code === 'root');
assert.throws(() => parseChord('Cxyz'), (e) => e.code === 'unknown' && e.part === 'xyz');

// voicing
assert.deepEqual(voicing(parseChord('C7')).map((x) => x.midi), [48, 52, 55, 58]);
assert.deepEqual(voicing(parseChord('F/A')).map((x) => x.midi), [57, 65, 69, 72]);

// texts exist for every part
for (const s of Object.keys(cases).concat(['F/A', 'C/Bb'])) {
  for (const lang of ['ru', 'en']) {
    explain(parseChord(s), lang).forEach((p) => assert.ok(p.says && !/undefined/.test(p.says), `${s} ${lang} ${p.text}: ${p.says}`));
    assert.ok(!/undefined/.test(chordName(parseChord(s), lang)), s);
  }
}
assert.equal(prettySymbol('Bb7(b9,#11)'), 'B♭7(♭9,♯11)');
assert.equal(prettySymbol('Bbm7'), 'B♭m7');
assert.equal(withRoot('C7sus', 'F♯'), 'F♯7sus');
console.log('chords: ok', Object.keys(cases).length, 'symbols');

// every lesson builds a valid exercise (the comping "in rhythm" stage)
import { readFileSync } from 'node:fs';
import { compExercise, compVoicing } from '../app/js/music/chord-ex.js';
import { normalize } from '../app/js/music/exercise.js';
const lessons = JSON.parse(readFileSync(new URL('../content/chords/lessons.json', import.meta.url), 'utf8')).lessons;
for (const l of lessons) {
  if (l.kind === 'keys') continue;
  const ex = normalize(compExercise(l));
  assert.equal(ex.bars.length, l.comp.bars.length, l.id);
  ex.bars.forEach((b, i) => {
    const ch = parseChord(l.comp.bars[i]);
    const ms = [...b.rh, ...b.lh].flatMap((e) => e.notes).map((n) => n);
    assert.ok(b.rh.length && b.lh.length, l.id);
    assert.ok(checkChord(ch, [...b.lh[0].notes, ...b.rh[0].notes].map(parseNote)).ok, `${l.id} bar ${i + 1} ${l.comp.bars[i]}: ${ms}`);
  });
  [...l.practice, l.sym.split(' ')[0]].forEach((s) => parseChord(s));
}
function parseNote(n) { const m = /^([A-G])(#|b)?(-?\d)$/.exec(n); return 12 * (+m[3] + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); }
assert.deepEqual(compVoicing(parseChord('C7')).rh.map((x) => x.name), ['C4', 'E4', 'G4', 'Bb4']);
assert.deepEqual(compVoicing(parseChord('Bb7')).rh.map((x) => x.name), ['Bb3', 'D4', 'F4', 'Ab4']);
console.log('chord lessons: ok', lessons.length);
