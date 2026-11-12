// Relative ear games: levels, questions, answer checking, grading, and the track items. Run: node tests/ear.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from '../app/js/music/ear-games.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const rngA = G.mulberry32(42), rngB = G.mulberry32(42);
assert.deepEqual([rngA(), rngA(), rngA()], [rngB(), rngB(), rngB()], 'seeded RNG is reproducible');
const r = G.mulberry32(7);
for (let i = 0; i < 1000; i++) { const x = r(); assert.ok(x >= 0 && x < 1); }

// ---- higher / lower: the gap narrows, answers match the notes ----
{
  const N = 12, rng = G.mulberry32(1);
  for (const lv of [1, 2, 3]) {
    const gaps = [];
    for (let k = 0; k < N; k++) {
      const q = G.makeHiLo(lv, k, N, rng);
      assert.ok(q.a >= G.LO && q.a <= G.HI && q.b >= G.LO && q.b <= G.HI, 'in the keyboard range');
      assert.equal(q.answer, q.b > q.a ? 'up' : q.b < q.a ? 'down' : 'same');
      assert.ok(G.checkChoice(q, q.answer) && !G.checkChoice(q, q.answer === 'up' ? 'down' : 'up'));
      if (q.answer !== 'same') gaps.push(q.gap); else assert.ok(G.levelOf('hilo', lv).same, 'same only on a level that has it');
    }
    const lvl = G.levelOf('hilo', lv);
    assert.ok(Math.max(...gaps) <= lvl.gaps[0] && Math.min(...gaps) >= lvl.gaps[1]);
    assert.deepEqual(gaps, [...gaps].sort((x, y) => y - x), 'gaps never grow');
  }
  assert.equal(G.makeHiLo(2, 11, 12, G.mulberry32(3)).gap, 1, 'level 2 ends on a semitone');
  assert.deepEqual(G.optionsOf('hilo', 2), ['up', 'down']);
  assert.deepEqual(G.optionsOf('hilo', 3), ['up', 'down', 'same']);
  let sames = 0; const rs = G.mulberry32(5);
  for (let k = 0; k < 200; k++) if (G.makeHiLo(3, k % 12, 12, rs).answer === 'same') sames++;
  assert.ok(sames > 20 && sames < 80, 'about a quarter are the same note: ' + sames);
}

// ---- intervals ----
assert.deepEqual(G.optionsOf('interval', 1), [3, 4]);
assert.deepEqual(G.optionsOf('interval', 2), [3, 4, 5, 7]);
assert.deepEqual(G.optionsOf('interval', 3), [3, 4, 5, 7, 10, 11, 12]);
assert.equal(G.optionsOf('interval', 4).length, 12);
assert.equal(G.levelCount('interval'), 7);
assert.deepEqual(['asc', 'asc', 'asc', 'asc', 'desc', 'desc', 'harm'], Array.from({ length: 7 }, (_, i) => G.levelOf('interval', i + 1).dir));
for (let lv = 1; lv <= 7; lv++) {
  const rng = G.mulberry32(100 + lv); let prev = null; const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const q = G.makeInterval(lv, rng, prev);
    seen.add(q.semis);
    assert.ok(G.optionsOf('interval', lv).includes(q.semis), 'drawn from the level set');
    assert.ok(q.first >= G.LO && q.first <= G.HI && q.second >= G.LO && q.second <= G.HI, `range lv${lv}`);
    const dir = G.levelOf('interval', lv).dir;
    assert.equal(q.second - q.first, dir === 'desc' ? -q.semis : q.semis);
    assert.equal(q.harmonic, dir === 'harm');
    assert.ok(G.checkChoice(q, q.semis) && !G.checkChoice(q, q.semis + 1));
    assert.ok(G.checkNote(q, q.second) && !G.checkNote(q, q.second + 12) && !G.checkNote(q, q.first));
    if (prev && G.optionsOf('interval', lv).length > 1) assert.notEqual(q.semis, prev.semis, 'no immediate repeat');
    prev = q;
  }
  assert.equal(seen.size, G.optionsOf('interval', lv).length, 'every interval of the level turns up');
}
assert.equal(G.intervalShort(60, 64), 'M3');
assert.equal(G.intervalShort(67, 60), 'P5');
assert.equal(G.intervalShort(60, 72), 'P8');

// ---- chord quality ----
assert.deepEqual(G.optionsOf('quality', 1), ['maj', 'min']);
assert.deepEqual(G.optionsOf('quality', 2), ['maj7', 'm7', '7']);
assert.deepEqual(G.optionsOf('quality', 3), ['maj7', 'm7', '7', 'm7b5']);
{
  const rng = G.mulberry32(9); let prev = null;
  for (let lv = 1; lv <= 3; lv++) for (let i = 0; i < 100; i++) {
    const q = G.makeQuality(lv, rng, prev); prev = q;
    assert.ok(G.optionsOf('quality', lv).includes(q.quality));
    assert.ok(q.root >= 48 && q.root <= 59);
    assert.deepEqual(q.notes.map((m) => m - q.root), G.QUALITIES[q.quality].tones);
    assert.ok(G.checkChoice(q, q.quality));
    // playing the shape: root position, an inversion in another octave, a missing note, a wrong chord
    assert.equal(G.checkShape(q, new Set(q.notes)), true);
    assert.equal(G.checkShape(q, new Set(q.notes.map((m, j) => (j ? m : m + 12)))), true, 'inversion counts');
    assert.equal(G.checkShape(q, new Set(q.notes.slice(0, -1))), null, 'not enough keys yet');
    const wrong = new Set(q.notes.map((m, j) => (j === 1 ? m + 1 : m)));
    assert.equal(G.checkShape(q, wrong), false);
  }
  const maj = { game: 'quality', notes: [60, 64, 67] };
  assert.equal(G.checkShape(maj, new Set([60, 63, 67])), false, 'minor is not major');
}

// ---- progressions ----
{
  const maj = G.iiVI('major', 0), min = G.iiVI('minor', 0);
  assert.deepEqual(maj.map((c) => G.pcName(c.pc) + G.QUALITIES[c.quality].sym), ['Dm7', 'G7', 'Cmaj7']);
  assert.deepEqual(min.map((c) => G.pcName(c.pc) + G.QUALITIES[c.quality].sym), ['Dm7b5', 'G7', 'Cm7']);
  assert.deepEqual(G.optionsOf('prog', 1), ['major', 'minor']);
  assert.deepEqual(G.optionsOf('prog', 2), [0, 1, 2]);
  const rng = G.mulberry32(11); const modes = new Set(), ats = new Set();
  for (let i = 0; i < 200; i++) {
    const q1 = G.makeProg(1, rng); modes.add(q1.answer);
    assert.equal(q1.chords.length, 3); assert.equal(q1.chords[1].quality, '7');
    assert.equal(q1.chords[2].quality, q1.answer === 'major' ? 'maj7' : 'm7');
    const q2 = G.makeProg(2, rng); ats.add(q2.answer);
    assert.equal(q2.chords.length, 3);
    assert.equal(q2.chords.filter((c) => c.deg === 'V').length, 1, 'exactly one V');
    assert.equal(q2.chords[q2.answer].deg, 'V');
    assert.ok(G.checkChoice(q2, q2.answer) && !G.checkChoice(q2, (q2.answer + 1) % 3));
  }
  assert.equal(modes.size, 2); assert.equal(ats.size, 3);
  // voicings: bass in C2..B2, three upper tones that carry the 3rd, 5th and 7th, close and in a playable range
  for (const c of G.voiceProg(G.iiVI('major', 5))) {
    assert.ok(c.bass >= 36 && c.bass < 48);
    assert.equal(c.upper.length, 3);
    assert.deepEqual(c.upper.map((m) => m % 12).sort((a, b) => a - b), G.QUALITIES[c.quality].tones.slice(1).map((x) => (c.pc + x) % 12).sort((a, b) => a - b));
    c.upper.forEach((m, i) => { assert.ok(m >= 52 && m <= 80); if (i) assert.ok(m > c.upper[i - 1]); });
    assert.ok(c.upper[2] - c.upper[0] <= 12, 'closed position');
  }
  const v = G.voiceProg(G.iiVI('major', 0));
  assert.ok(Math.abs(v[1].mean - v[0].mean) <= 4 && Math.abs(v[2].mean - v[1].mean) <= 4, 'smooth voice leading');
}

// ---- makeQuestion + grading ----
assert.equal(G.makeQuestion('interval', 2, 0, 10, G.mulberry32(1)).game, 'interval');
assert.throws(() => G.makeQuestion('nope', 1, 0, 1));
assert.throws(() => G.levelOf('nope', 1));
assert.equal(G.levelOf('interval', 99), G.levelOf('interval', 7), 'a level past the end clamps');
assert.equal(G.gradeRound({}), 'ok');
assert.equal(G.gradeRound({ replayed: true }), 'meh');
assert.equal(G.gradeRound({ wrong: 1 }), 'meh');
assert.equal(G.gradeRound({ wrong: 2 }), 'miss');
assert.equal(G.gradeRound({ wrong: 2 }, 2), 'meh');
assert.equal(G.gradeRound({ revealed: true }), 'miss');
assert.equal(G.maxWrongFor(2), 1); assert.equal(G.maxWrongFor(3), 2); assert.equal(G.maxWrongFor(12), 4);
assert.equal(G.accuracy(['ok', 'meh', 'miss', 'ok'], 4), 0.625);
assert.equal(G.accuracy([], 0), 0);

// ---- the tracks: every relative-ear item is valid, in the path and in the ear section ----
const seenIds = {};
for (const id of ['blues', 'bossa', 'std']) {
  const tr = read(`content/tracks/${id}.json`);
  const ear = tr.sections.find((s) => s.id === 'ear').items;
  const rel = Object.entries(tr.items).filter(([, x]) => x.kind === 'ear' && x.game);
  const game = (g) => rel.filter(([, it]) => it.game === g);
  for (const [iid, it] of rel) {
    assert.ok(G.GAMES.includes(it.game), iid);
    assert.ok(it.level >= 1 && it.level <= G.levelCount(it.game), `${iid}: level`);
    assert.ok(it.rounds >= 8 && it.pass && it.pass.acc > 0 && it.pass.acc <= 1, iid);
    for (const k of ['title', 'about']) assert.ok(it[k].ru && it[k].en, `${iid}.${k}`);
    assert.ok(ear.includes(iid) && tr.path.includes(iid), `${iid}: in the ear section and the path`);
    assert.ok(!seenIds[iid], `${iid}: id is unique across tracks`); seenIds[iid] = true;
  }
  // each game's levels come in order along the path
  for (const g of G.GAMES) {
    const lv = game(g).map(([iid, it]) => [tr.path.indexOf(iid), it.level]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    assert.deepEqual(lv, [...lv].sort((a, b) => a - b), `${id}/${g}: levels in path order`);
  }
  assert.ok(game('hilo').length >= 1 && game('interval').length >= 3 && game('quality').length >= 2, `${id}: games present`);
  if (id !== 'blues') assert.ok(game('prog').length >= 1, `${id}: ii-V-I game`);
  // spread through the path, not dumped together: no two relative-ear items adjacent
  const idx = tr.path.map((x, i) => (tr.items[x].game ? i : -1)).filter((i) => i >= 0);
  idx.slice(1).forEach((i, j) => assert.ok(i - idx[j] >= 2, `${id}: ear items not adjacent`));
}
// ---- hints: the window narrows after a wrong key, steps are counted and worded ----
{
  assert.deepEqual(G.narrowWindow([60, 67], 62, 65), [63, 67], 'target above: the pressed key and below drop out');
  assert.deepEqual(G.narrowWindow([60, 67], 66, 61), [60, 65], 'target below');
  assert.deepEqual(G.narrowWindow([63, 67], 60, 65), [63, 67], 'a key outside the window changes nothing');
  assert.deepEqual(G.narrowWindow([60, 67], 64, 64), [60, 67]);
  assert.deepEqual([1, 2, 3, 4, 5, 11, 12, 21, 22].map((n) => G.stepsWord(n)), ['1 шаг', '2 шага', '3 шага', '4 шага', '5 шагов', '11 шагов', '12 шагов', '21 шаг', '22 шага']);
  assert.equal(G.stepsWord(1, 'en'), '1 step'); assert.equal(G.stepsWord(3, 'en'), '3 steps');
  assert.deepEqual(G.stepsBetween(62, 65), [63, 64]); assert.deepEqual(G.stepsBetween(65, 62), [64, 63]); assert.deepEqual(G.stepsBetween(60, 61), []);
}
console.log('ok: ear (levels, questions, answers, grading, track items)');
