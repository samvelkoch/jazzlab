// The circle of fifths («Круг»): ring tables, chord → cell, the wedge, content/circle.json against its forms, and the
// word-card link to the circle. Run: node tests/circle.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { OUTER, MIDDLE, INNER, RING_NAMES, pcOf, cellOf, wedgeOf, formChords, chordRun, cellPath, cellCentre } from '../app/js/music/circle.js';
import { parseChord } from '../app/js/music/chords.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const pc = (name) => parseChord(name).root.pc;

// ---- ring tables: 12 distinct pitch classes each, the labels agree with pcOf, middle = relative minors, inner = vii° ----
for (const [ring, table] of [['outer', OUTER], ['middle', MIDDLE], ['inner', INNER]]) {
  assert.equal(table.length, 12, `${ring}: 12 cells`);
  assert.equal(new Set(table.map(pc)).size, 12, `${ring}: 12 distinct pitch classes`);
  table.forEach((name, i) => assert.equal(pc(name), pcOf(ring, i), `${ring} ${i}: ${name} has the table's pitch class`));
}
OUTER.forEach((maj, i) => {
  assert.equal(OUTER[i], ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'][i]);
  assert.equal(pc(OUTER[(i + 1) % 12]), (pc(maj) + 7) % 12, `outer: ${OUTER[(i + 1) % 12]} is a fifth above ${maj}`);
  assert.equal(pc(MIDDLE[i]), (pc(maj) + 9) % 12, `middle ${i}: ${MIDDLE[i]} is the relative minor of ${maj}`);
  assert.ok(parseChord(MIDDLE[i]).quality.minor, `middle ${i}: minor`);
  assert.equal(pc(INNER[i]), (pc(maj) + 11) % 12, `inner ${i}: ${INNER[i]} is the vii° of ${maj}`);
  assert.ok(parseChord(INNER[i]).quality.dim, `inner ${i}: diminished`);
});

// ---- cellOf ----
const cell = (ring, pos) => ({ ring, pos });
assert.deepEqual(cellOf('C7'), cell('outer', 0));
assert.deepEqual(cellOf('Fmaj7'), cell('outer', 11));
assert.deepEqual(cellOf('Cm7'), cell('middle', 9));
assert.deepEqual(cellOf('Dm7b5'), cell('inner', 9));
assert.deepEqual(cellOf('Ebm7'), cell('middle', 6));
assert.deepEqual(cellOf('Dbmaj7'), cell('outer', 7));
assert.deepEqual(cellOf('Gm7'), cell('middle', 10));
assert.deepEqual(cellOf('Am7'), cell('middle', 0));
assert.equal(cellOf('Abdim7').ring, 'inner');
assert.equal(cellOf('Abdim7').pos, 3, 'Abdim7 = G♯°');
assert.deepEqual(cellOf('C#7'), cellOf('Db7'), 'enharmonics share a cell');
assert.deepEqual(cellOf('F6'), cell('outer', 11)); assert.deepEqual(cellOf('C9'), cell('outer', 0)); assert.deepEqual(cellOf('Dm6'), cell('middle', 11));

// ---- geometry: a closed path per cell, centres inside the ring ----
for (const ring of RING_NAMES) for (let p = 0; p < 12; p++) {
  assert.match(cellPath(ring, p), /^M[\d. -]+A.*Z$/, `${ring} ${p}: a path`);
  const [x, y] = cellCentre(ring, p);
  assert.ok(x > 0 && x < 520 && y > 0 && y < 520, `${ring} ${p}: centre in the box`);
}
assert.deepEqual(cellCentre('outer', 0).map(Math.round), [260, 260 - 222], 'C sits at the top');

// ---- the wedge ----
const named = (w) => Object.fromEntries(w.map((c) => [({ outer: OUTER, middle: MIDDLE, inner: INNER })[c.ring][c.pos], c.numeral]));
const cMaj = wedgeOf({ root: 'C', mode: 'major' });
assert.deepEqual(named(cMaj), { F: 'IV', C: 'I', G: 'V', Dm: 'ii', Am: 'vi', Em: 'iii' });
assert.ok(cMaj.every((c) => c.tint) && cMaj.length === 6, 'major: six tinted cells');
const cMin = wedgeOf({ root: 'C', mode: 'minor' });
assert.deepEqual(named(cMin), { Cm: 'i', Fm: 'iv', Gm: 'v', 'E♭': 'III', 'A♭': 'VI', 'B♭': 'VII', 'D°': 'ii°' });
assert.equal(cMin.filter((c) => c.tint).length, 6, 'minor: six tinted cells (ii° is not tinted)');
assert.deepEqual(named(wedgeOf({ root: 'F', mode: 'major' })), { 'B♭': 'IV', F: 'I', C: 'V', Gm: 'ii', Dm: 'vi', Am: 'iii' });

// ---- content/circle.json against its forms ----
const circle = read('content/circle.json');
assert.equal(circle.$format, 'jazzlab-circle/1');
const ids = circle.tunes.map((tn) => tn.id);
assert.deepEqual(ids, ['blues', 'bossa', 'std']);
// a run is a contiguous part of the cyclic sequence
const inCycle = (seq, run) => seq.some((_, i) => run.every((c, k) => seq[(i + k) % seq.length] === c));
let moves = 0;
for (const tn of circle.tunes) {
  const form = read(`content/forms/${tn.form}.json`);
  const chords = formChords(form);
  for (const c of chords) assert.ok(cellOf(c).pos >= 0, `${tn.id}: ${c} maps to a cell`);
  assert.ok(chords.includes(tn.home.chord), `${tn.id}: home chord ${tn.home.chord} is in the form`);
  assert.ok(['major', 'minor'].includes(tn.home.mode), `${tn.id}: mode`);
  assert.deepEqual(cellOf(tn.home.chord).ring, tn.home.mode === 'minor' ? 'middle' : 'outer', `${tn.id}: the home chord sits on the home ring`);
  const run = chordRun(form);
  for (const mv of tn.moves) {
    assert.ok(mv.chords.length >= 2, `${tn.id}: a move has 2+ chords`);
    assert.ok(inCycle(run, mv.chords), `${tn.id}: «${mv.title.ru}» ${mv.chords.join(' ')} is a run of the form ${run.join(' ')}`);
    moves++;
  }
}
// every RU string has a non-empty EN pair
let strings = 0;
(function walk(x, at) {
  if (Array.isArray(x)) x.forEach((v, i) => walk(v, `${at}[${i}]`));
  else if (x && typeof x === 'object') {
    if ('ru' in x) { assert.ok(x.ru && typeof x.en === 'string' && x.en.trim(), `${at}: ru + en`); strings++; } else Object.entries(x).forEach(([k, v]) => walk(v, `${at}.${k}`));
  }
})(circle, 'circle');

// ---- the word-card link: `circle` names an existing tune ----
const idx = read('content/index.json');
let links = 0;
for (const c of idx.courses.filter((c) => c.kind === 'track')) {
  let tr; try { tr = read(`content/tracks/${c.id}.json`); } catch (e) { continue; }
  for (const s of tr.steps || []) for (const w of s.words || []) if ('circle' in w) {
    assert.ok(ids.includes(w.circle), `${c.id}/${w.term}: circle «${w.circle}» is a tune of content/circle.json`);
    links++;
  }
}
assert.ok(links >= 1, 'the II–V–I card links to the circle');

console.log(`circle: rings ok, ${circle.tunes.length} tunes, ${moves} moves, ${strings} ru/en strings, ${links} word-card link(s)`);
