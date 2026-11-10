// Bossa comping: right-hand chords over the bass (pattern.comp). Run: node tests/comp.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { patternExercise, compBar, compBars, parseChord, barChords, chordPcs } from '../app/js/music/forms.js';
import { normalize, buildSteps } from '../app/js/music/exercise.js';
import { parsePattern } from '../app/js/music/rhythm.js';
import { toMidi } from '../app/js/music/notes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const form = read('content/forms/blue-bossa.json'), bt = read('content/tracks/bossa.json');
const pats = Object.fromEntries(['c1', 'c2', 'c3'].map((id) => [id, read(`content/patterns/${id}.json`)]));
// drums.js needs a browser (audio); read the clave out of its source
const BOSSA_CLAVE = JSON.parse(/BOSSA_CLAVE = (\[\[.*?\]\]);/.exec(readFileSync(join(root, 'app/js/music/drums.js'), 'utf8'))[1]);
const eq = (a, b, m) => assert.deepEqual(a, b, m);

// ---- voicings: every chord of the form, chord tones only, with the 3rd and 7th, in range, 3 distinct notes ----
const formChords = [...new Set(form.bars.flatMap(barChords))];
assert.equal(formChords.length, 7);
for (const [id, p] of Object.entries(pats)) {
  for (const name of formChords) {
    const v = p.comp.voicings[name], c = parseChord(name);
    assert.ok(v, `${id}: voicing for ${name}`);
    const ms = v.n.map(toMidi), pcs = chordPcs(name);
    assert.equal(ms.length, 3, `${id} ${name}: three notes`);
    eq(ms.slice().sort((a, b) => a - b), ms, `${id} ${name}: low to high`);
    assert.equal(new Set(ms).size, 3);
    ms.forEach((m) => assert.ok(pcs.includes(m % 12), `${id} ${name}: ${m} is a chord tone`));
    const third = (c.pc + c.offsets[1]) % 12, seventh = (c.pc + c.offsets[3]) % 12;
    assert.ok(ms.some((m) => m % 12 === third) && ms.some((m) => m % 12 === seventh), `${id} ${name}: guide tones 3rd and 7th`);
    assert.ok(ms[0] >= toMidi('C4') && ms[2] <= toMidi('D5'), `${id} ${name}: C4..D5`);
    assert.equal(v.f.length, 3);
  }
  eq(p.comp.voicings, pats.c1.comp.voicings, 'one set of voicings in all three patterns');
}

// ---- voice leading around the whole loop (the form, then back to bar 1): each voice moves at most a major third ----
const seq = [...form.bars.flatMap(barChords), form.bars[0]];
const v1 = pats.c1.comp.voicings;
let total = 0;
for (let k = 0; k + 1 < seq.length; k++) {
  const a = v1[seq[k]].n.map(toMidi), b = v1[seq[k + 1]].n.map(toMidi);
  a.forEach((m, i) => { assert.ok(Math.abs(m - b[i]) <= 4, `${seq[k]} -> ${seq[k + 1]}: voice ${i} moves ${m} -> ${b[i]}`); total += Math.abs(m - b[i]); });
}
assert.ok(total <= 80, 'voice leading stays small: ' + total);

// ---- the exercises ----
const pv = (id, bars = form.practice) => normalize(patternExercise(pats[id], bars, { id: 'pat-' + id, swing: false, flats: true }));
for (const id of ['c1', 'c2', 'c3']) {
  const ex = pv(id);
  assert.equal(ex.bars.length, 4);
  assert.ok(ex.bars.every((b) => b.rh.length > 0 && b.lh.length > 0), `${id}: both hands in every bar`);
  assert.ok(ex.bars.every((b) => b.rh.every((e) => e.notes.length === 3 && e.f.length === 3)), `${id}: three-note chords with fingers`);
  assert.equal(ex.rhythm, pats[id].comp.rhythm, `${id}: the Rhythm stage drills the right-hand rhythm`);
  assert.equal(ex.swing, false);
  // the stage rhythm line is the right hand's: its onsets are the chord slots
  const hits = parsePattern(ex.rhythm).filter((e) => !e.rest);
  const slots = pats[id].comp.bars === 2 ? ex.bars.slice(0, 2).flatMap((b, k) => b.rh.map((e) => k * 8 + e.t)) : ex.bars[0].rh.map((e) => e.t);
  eq(hits.map((e) => e.t), slots);
  assert.equal(buildSteps(ex).length, 32);
  // the chord of each bar is the voicing of that bar's chord
  ex.bars.forEach((b, k) => b.rh.forEach((e) => eq(e.notes, v1[form.practice[k]].n)));
}
assert.equal(pv('c1').rhythmBars, 1); assert.equal(pv('c2').rhythmBars, 1);
assert.equal(pv('c3').rhythmBars, 2);
assert.equal(parsePattern(pats.c3.comp.rhythm).reduce((a, e) => Math.max(a, e.t + e.d), 0), 16, 'the clave rhythm line is two bars');
for (const id of ['c1', 'c2', 'c3']) assert.equal(pv(id, form.bars).bars.length, 16, 'the whole form builds');
eq(compBar(pats.c2, 'Dm7b5 G7', 0).map((e) => [e.t, e.chord]), [[2, 'Dm7b5'], [5, 'G7']], 'a two-chord bar: the chord at each event');

// ---- the rhythms: together with the bass / between it / on the clave ----
const bassSlots = (p) => p.events.map((e) => e.t);
eq(pats.c1.comp.events.map((e) => e.t), bassSlots(pats.c1), 'c1 lands with the bass');
assert.ok(pats.c2.comp.events.every((e) => !bassSlots(pats.c2).includes(e.t)), 'c2 never lands with the bass');
const c3 = pats.c3.comp.events;
eq(c3.filter((e) => e.bar === 0).map((e) => e.t), BOSSA_CLAVE[0], 'c3 bar A = the rim click');
eq(c3.filter((e) => e.bar === 1).map((e) => e.t), BOSSA_CLAVE[1], 'c3 bar B = the rim click');
eq(compBars(pats.c3, ['Cm7', 'Cm7', 'Fm7']).map((b) => [...new Set(b.map((n) => n.t))]), [[0, 3, 6], [2, 5], [0, 3, 6]]);
// the bass (left hand) is the known b1 / b2 cell
const lhOf = (id) => pv(id).bars[0].lh.map((e) => [e.t, e.d]);
eq(lhOf('c1'), [[0, 3], [3, 5]]); eq(lhOf('c2'), [[0, 3], [3, 3], [6, 2]]);

// ---- backward compatibility: a pattern without comp has an empty right hand and its own rhythm ----
const b1 = read('content/patterns/b1.json');
const e1 = normalize(patternExercise(b1, form.practice, { flats: true }));
assert.ok(e1.bars.every((b) => b.rh.length === 0)); assert.equal(e1.rhythm, '4. 4.~4'); assert.equal(e1.rhythmBars, 1);

// ---- the track ----
for (const id of ['c1', 'c2', 'c3']) {
  eq(bt.items['pat-' + id], { kind: 'pattern', pattern: id, form: 'blue-bossa' });
  const f = bt.items['form-' + id];
  assert.equal(f.kind, 'form'); assert.equal(f.hand, 'both'); assert.equal(f.pattern, id); assert.equal(f.form, 'blue-bossa');
  assert.ok(f.title.ru && f.title.en && f.about.ru && f.about.en);
  assert.ok(pats[id].title.ru && pats[id].title.en && pats[id].about.ru && pats[id].about.en);
}
const sec = bt.sections.find((s) => s.id === 'comp');
assert.ok(sec.title.ru && sec.title.en && sec.about.ru && sec.about.en);
eq(sec.items, ['pat-c1', 'form-c1', 'pat-c2', 'form-c2', 'pat-c3', 'form-c3']);
const at = (id) => bt.path.indexOf(id);
assert.ok(at('form-b1') < at('pat-c1') && at('form-c1') < at('mel-bossa'), 'c1 after form-b1, before the melody');
assert.ok(at('form-b2') < at('pat-c2') && at('pat-c2') < at('pat-c3'), 'c2, c3 after form-b2');
assert.ok(at('d-chords-db') < at('pat-c1'), 'the Db chords are drilled before the form that uses them');
assert.ok(read('content/glossary.json').terms.some((t) => t.id === 'comping'), 'the glossary knows comping');
console.log('ok: comp');
