// Jam session: the turn schedule of each format, the partner's notes (range, bar, source, breathing), the drum turn, the
// ending, jam.json's melodies map. Run: node tests/session.test.mjs
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { turnAt, partnerTurn, drumTurn, endingOf, fitOctaves, lickFits, sessionBars, sessionMinutes, PARTNERS, PARTNER_LICKS, SECTIONS } from '../app/js/music/session.js';
import { lickNotes, melodyBarNotes } from '../app/js/music/forms.js';
import { paletteAt } from '../app/js/music/solo.js';
import { resolveStyle, fillHits } from '../app/js/music/jam.js';
import { normalize } from '../app/js/music/exercise.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const pcm = (m) => ((m % 12) + 12) % 12;
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const jam = read('content/jam.json');
const forms = Object.fromEntries(jam.forms.map((id) => [id, read(`content/forms/${id}.json`)]));
const licks = PARTNER_LICKS.map((id) => read(`content/licks/${id}.json`));
const isBlues = (fid) => !!(jam.simple[fid] && jam.simple[fid].palette.scale === 'blues');

// ---------- the schedule ----------
const who = (format, NB, n) => Array.from({ length: n }, (_, k) => turnAt(format, NB, k).who);
for (const NB of [12, 16, 32]) {
  // qa: 2 + 2
  assert.deepEqual(who('qa', NB, 8), ['partner', 'partner', 'you', 'you', 'partner', 'partner', 'you', 'you'], `qa ${NB}`);
  assert.deepEqual([0, 1, 2, 3].map((k) => turnAt('qa', NB, k).barsLeft), [2, 1, 2, 1]);
  assert.deepEqual([0, 1, 2, 3].map((k) => turnAt('qa', NB, k).next), ['you', 'you', 'partner', 'partner']);
  for (let k = 0; k < 3 * NB; k++) assert.equal(turnAt('qa', NB, k).who, Math.floor(k / 2) % 2 ? 'you' : 'partner');
  // fours: partner, you, drums, you, running on across choruses
  for (let k = 0; k < 3 * NB; k++) {
    const tn = turnAt('fours', NB, k);
    assert.equal(tn.who, ['partner', 'you', 'drums', 'you'][Math.floor(k / 4) % 4], `fours ${NB} bar ${k}`);
    assert.equal(tn.barsLeft, 4 - (k % 4));
    assert.equal(tn.turnLen, 4);
    assert.equal(tn.next, ['partner', 'you', 'drums', 'you'][(Math.floor(k / 4) + 1) % 4]);
  }
  // session: head, partner solo, your solo, a chorus of fours, head out; then it stops
  assert.equal(sessionBars(NB), 5 * NB);
  const plan = Array.from({ length: 5 }, (_, c) => turnAt('session', NB, c * NB).section);
  assert.deepEqual(plan, SECTIONS);
  assert.deepEqual(plan, ['head', 'partnerSolo', 'yourSolo', 'fours', 'headOut']);
  for (let k = 0; k < 5 * NB; k++) {
    const tn = turnAt('session', NB, k), c = Math.floor(k / NB), r = k - c * NB;
    assert.equal(tn.chorus, c); assert.equal(tn.choruses, 5); assert.equal(tn.done, false);
    if (SECTIONS[c] === 'fours') {
      assert.equal(tn.who, ['partner', 'you', 'drums', 'you'][Math.floor(r / 4) % 4], `session fours ${NB} bar ${r}`);
      assert.equal(tn.barsLeft, 4 - (r % 4));
    } else {
      assert.equal(tn.who, SECTIONS[c] === 'yourSolo' ? 'you' : 'partner');
      assert.equal(tn.barsLeft, NB - r);
      assert.equal(tn.turnStart, c * NB);
    }
  }
  // «get ready»: the last bar of the partner solo is followed by your solo
  const last = turnAt('session', NB, 2 * NB - 1);
  assert.equal(last.barsLeft, 1); assert.equal(last.next, 'you');
  assert.equal(turnAt('session', NB, 5 * NB - 1).next, null, 'nothing after the head out');
  const end = turnAt('session', NB, 5 * NB);
  assert.equal(end.done, true); assert.equal(end.who, null);
  assert.equal(turnAt('session', NB, 7 * NB).done, true);
}
// a 12-bar chorus of fours: partner, you, drums; a 32-bar one: two whole cycles
assert.deepEqual([0, 4, 8].map((r) => turnAt('session', 12, 36 + r).who), ['partner', 'you', 'drums']);
assert.equal(turnAt('session', 12, 44).next, 'partner', 'the head out follows the drums');
assert.deepEqual([0, 4, 8, 12, 16, 20, 24, 28].map((r) => turnAt('session', 32, 96 + r).who), ['partner', 'you', 'drums', 'you', 'partner', 'you', 'drums', 'you']);
// minutes: 5 choruses + the ending, 4 beats a bar
assert.equal(sessionMinutes(12, 60, 2), Math.round((62 * 4) / 60));
assert.equal(sessionMinutes(32, 92, 1), Math.round((161 * 4) / 92));

// ---------- pitch range ----------
assert.deepEqual(fitOctaves([60, 64, 67], 50, 74), [60, 64, 67]);
assert.deepEqual(fitOctaves([77, 79], 50, 74), [65, 67]);
assert.deepEqual(fitOctaves([60, 64, 67], 72, 96, true), [84, 88, 91], "nearest the middle of the range");
assert.deepEqual(fitOctaves([76, 80], 72, 96, true), [88, 92], 'two shifts equally near the middle: the upper one');
assert.deepEqual(fitOctaves([62, 74], 72, 96, true), [74, 86]);
assert.deepEqual(fitOctaves([60, 88], 72, 96, true), [72, 88], 'too wide: the shift that leaves the note nearest the range, the note folded in');
assert.ok(fitOctaves([40, 90], 50, 74).every((m) => m >= 50 && m <= 74));

// ---------- melodies map ----------
assert.ok(jam.melodies && typeof jam.melodies === 'object');
Object.entries(jam.melodies).forEach(([fid, mid]) => {
  assert.ok(jam.forms.includes(fid), `melodies: unknown form ${fid}`);
  assert.ok(existsSync(join(root, `content/melodies/${mid}.json`)), `melodies: no file ${mid}`);
  const mel = read(`content/melodies/${mid}.json`);
  assert.equal(mel.form, fid, `melody ${mid} names form ${mel.form}, not ${fid}`);
  assert.equal(mel.bars.length, forms[fid].bars.length, `${mid}: one bar per form bar`);
});
// every melody file that names a form of the menu is in the map
import { readdirSync } from 'node:fs';
readdirSync(join(root, 'content/melodies')).forEach((f) => { const mel = read(`content/melodies/${f}`); if (jam.forms.includes(mel.form)) assert.equal(jam.melodies[mel.form], mel.id, `${mel.id} missing from jam.melodies`); });
// the partner's licks: chord-relative ones that exist
licks.forEach((l) => { assert.ok(!l.prog, `${l.id} is key-relative`); assert.equal(l.bars, 2); });
assert.equal(lickFits(licks[0], 'C7', true), true); assert.equal(lickFits(licks[0], 'C7', false), false);
assert.equal(lickFits(read('content/licks/bl1.json'), 'Cm7', false), true); assert.equal(lickFits(read('content/licks/bl1.json'), 'C7', true), false);
assert.equal(lickFits(read('content/licks/k1.json'), 'Gm7', true), false);

// ---------- the partner's notes ----------
/** Every partner event of a run of `bars` bars, turn by turn. */
function runPartner(format, fid, inst, rng, nBars) {
  const form = forms[fid], NB = form.bars.length;
  const melody = jam.melodies[fid] ? read(`content/melodies/${jam.melodies[fid]}.json`) : null;
  const ctx = { bars: form.bars, inst: PARTNERS[inst], licks, blues: isBlues(fid), melody };
  const out = [];
  for (let k = 0; k < nBars; k++) {
    const tn = turnAt(format, NB, k);
    if (tn.done) break;
    if (tn.turnStart === k) out.push(...partnerTurn(ctx, format, k, rng).map((e) => ({ ...e, section: tn.section })));
  }
  return { out, ctx, NB, melody };
}
let sawLick = 0, sawMelody = 0, sawCall = 0, sawMotif = 0;
for (const fid of jam.forms) {
  for (const inst of ['sax', 'clarinet', 'piano', 'bass']) {
    for (const format of ['qa', 'fours', 'session']) {
      const rng = mulberry32(fid.length * 101 + format.length * 7 + (inst === 'sax' ? 1 : 2));
      const NB = forms[fid].bars.length;
      const { out, ctx, melody } = runPartner(format, fid, inst, rng, format === 'session' ? 6 * NB : 3 * NB);
      const P = PARTNERS[inst], id = `${fid}/${inst}/${format}`;
      assert.ok(out.length > 0, id + ': the partner plays');
      out.forEach((e) => {
        assert.ok(e.m >= P.lo && e.m <= P.hi, `${id}: ${e.m} outside ${P.lo}..${P.hi}`);
        assert.ok(Number.isInteger(e.t) && e.t >= 0 && e.t < 8 && e.d >= 1 && e.t + e.d <= 8, `${id}: inside the bar`);
        const tn = turnAt(format, NB, e.bar);
        assert.equal(tn.who, 'partner', `${id}: bar ${e.bar} is the partner's`);
        const fb = e.bar % NB;
        if (e.src === 'melody') {
          sawMelody++;
          assert.ok(['head', 'headOut'].includes(e.section) && melody, `${id}: a melody only in the head`);
          const src = melodyBarNotes(melody, fb).find((n) => n.t === e.t);
          assert.ok(src && pcm(src.m) === pcm(e.m) && (e.m - src.m) % 12 === 0, `${id}: melody note bar ${fb} t ${e.t}`);
        } else if (e.src === 'lick') {
          sawLick++;
          const l = licks.find((x) => x.id === e.lick);
          assert.ok(l && lickFits(l, e.chord, ctx.blues), `${id}: lick ${e.lick} over ${e.chord}`);
          assert.ok(lickNotes(l, e.chord).some((n) => pcm(n.m) === pcm(e.m)), `${id}: a note of lick ${e.lick}`);
        } else {
          if (e.src === 'call') sawCall++; else sawMotif++;
          assert.ok(['call', 'motif'].includes(e.src), `${id}: source ${e.src}`);
          const pal = paletteAt({}, ctx.bars, fb, e.t);
          assert.ok(pal.pcs.has(pcm(e.m)), `${id}: ${e.m} not in the palette of bar ${fb + 1} (${pal.chord})`);
        }
      });
      // breathing: the generated material (not the tune) never runs more than 2 bars without half a bar of rest
      const gen = out.filter((e) => e.src !== 'melody').map((e) => ({ s: e.bar * 8 + e.t, e: e.bar * 8 + e.t + e.d })).sort((a, b) => a.s - b.s);
      let start = null, end = -Infinity;
      gen.forEach((x) => {
        if (start === null || x.s - end >= 4) start = x.s;
        end = Math.max(end, x.e);
        assert.ok(end - start <= 16, `${id}: a phrase of ${end - start} eighths without a half-bar rest (from slot ${start})`);
      });
      // session: the head is the tune when the form has one
      if (format === 'session') {
        const head = out.filter((e) => e.section === 'head');
        if (melody) assert.ok(head.length && head.every((e) => e.src === 'melody'), `${id}: the head is the tune`);
        else assert.ok(head.length && head.every((e) => e.src !== 'melody'), `${id}: no tune, a solo`);
        assert.ok(!out.some((e) => e.section === 'yourSolo'), `${id}: silent in your solo`);
      }
    }
  }
}
assert.ok(sawLick > 0 && sawMelody > 0 && sawCall > 0 && sawMotif > 0, `every source is used (lick ${sawLick}, melody ${sawMelody}, call ${sawCall}, motif ${sawMotif})`);
// determinism: the same seed, the same notes; another seed, other notes
{
  const a = runPartner('fours', 'blues-c', 'sax', mulberry32(7), 36).out, b = runPartner('fours', 'blues-c', 'sax', mulberry32(7), 36).out;
  assert.deepEqual(a, b);
  const c = runPartner('fours', 'blues-c', 'sax', mulberry32(8), 36).out;
  assert.notDeepEqual(a, c);
}
// not the partner's turn: nothing
assert.deepEqual(partnerTurn({ bars: forms['blues-c'].bars, inst: PARTNERS.sax, licks, blues: true, melody: null }, 'qa', 2, mulberry32(1)), []);

// ---------- the drum turn ----------
const patterns = {};
readdirSync(join(root, 'content/patterns')).forEach((f) => { const p = read(`content/patterns/${f}`); patterns[p.id] = p; });
for (const st of jam.styles.map((s) => resolveStyle(s, patterns))) {
  const vocab = new Set([0, 1, 2, 3, 4, 5, 6, 7].flatMap((s) => fillHits(st, s)).map((x) => x.kind));
  const d1 = drumTurn(st, 4, mulberry32(3)), d2 = drumTurn(st, 4, mulberry32(3));
  assert.deepEqual(d1, d2, st.id + ': deterministic');
  assert.equal(d1.length, 4);
  d1.forEach((b) => b.hits.forEach((x) => { assert.ok(x.t >= 0 && x.t < 8 && x.v > 0 && x.v <= 1, st.id); assert.ok(vocab.has(x.kind), `${st.id}: ${x.kind} from the fill vocabulary`); }));
  // the last bar is the densest: a fill over the whole bar
  assert.ok(d1[3].hits.some((x) => x.t < 4) && d1[3].hits.some((x) => x.t >= 4), st.id + ': last bar fills the whole bar');
  assert.ok(d1[3].hits.length >= Math.max(...d1.slice(0, 3).map((b) => b.hits.length)), st.id + ': last bar densest');
}

// ---------- the ending ----------
for (const fid of jam.forms) {
  const form = forms[fid];
  for (const inst of ['sax', 'clarinet', 'piano', 'bass']) {
    const P = PARTNERS[inst];
    const ex = form.ending ? normalize(read(`content/exercises/${form.ending}.json`)) : null;
    const e = endingOf(form.bars, ex, P);
    assert.equal(e.bars, ex ? ex.bars.length : 1, fid);
    assert.equal(e.band.length, e.bars); assert.equal(e.partner.length, e.bars);
    [...e.band.flat(), ...e.partner.flat()].forEach((n) => assert.ok(n.t >= 0 && n.t + n.d <= 8 && n.d >= 1, fid + ': inside the bar'));
    e.partner.flat().forEach((n) => assert.ok(n.m >= P.lo && n.m <= P.hi, `${fid}/${inst}: ending in range`));
    if (!ex) {
      const root0 = forms[fid].bars[0].split(' ')[0].match(/^[A-G][b#]?/)[0];
      const pc = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 }[root0];
      assert.equal(pcm(e.partner[0][0].m), pc, `${fid}: the partner ends on the first chord's root`);
      assert.equal(pcm(e.band[0][0].m), pc, `${fid}: the bass on the first chord's root`);
    }
  }
}
assert.equal(endingOf(forms['blues-c'].bars, normalize(read('content/exercises/blues-end.json')), PARTNERS.sax).bars, 2);

console.log('session ok');
