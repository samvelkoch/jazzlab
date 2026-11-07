// Performance recordings: recordingToMidi writes a parseable file; rhythm accuracy against the swing grid.
// Run: node tests/recording.test.mjs
import assert from 'node:assert/strict';
import { recordingToMidi } from '../app/js/music/export.js';
import { rhythmAccuracy, gridDev, tols } from '../app/js/music/recording.js';

// minimal SMF parser (same as tests/export.test.mjs): [tick, kind, note, vel] per note event
function notes(buf) {
  const b = Buffer.from(buf);
  assert.equal(b.toString('latin1', 0, 4), 'MThd');
  const ntracks = b.readUInt16BE(10), ppq = b.readUInt16BE(12);
  const ev = [];
  let p = 14, seen = 0;
  while (p < b.length) {
    assert.equal(b.toString('latin1', p, p + 4), 'MTrk');
    const len = b.readUInt32BE(p + 4); let q = p + 8; const end = q + len; let t = 0, run = 0;
    while (q < end) {
      let d = 0, c; do { c = b[q++]; d = (d << 7) | (c & 0x7f); } while (c & 0x80); t += d;
      let st = b[q];
      if (st === 0xff) { const l = b[q + 2]; q += 3 + l; continue; }
      if (st & 0x80) { run = st; q++; } else st = run;
      const kind = st & 0xf0;
      if (kind === 0xc0) { q += 1; continue; }
      ev.push([t, kind, b[q], b[q + 1]]); q += 2;
    }
    assert.equal(q, end, 'track length');
    p = end; seen++;
  }
  assert.equal(seen, ntracks, 'track count');
  return { ev, ppq };
}

// 1) MIDI: 120 bpm, 5 notes (one at 0.5 s = one beat, one with zero duration)
const rec = { bpm: 120, notes: [
  { t: 0, d: 0.4, m: 48, v: 0.5 }, { t: 0.5, d: 0.25, m: 60, v: 0.8 }, { t: 1, d: 0, m: 63, v: 1 },
  { t: 1.333, d: 0.2, m: 64, v: 0.3 }, { t: 2, d: 1, m: 55, v: 0.6 }
] };
const { ev, ppq } = notes(recordingToMidi(rec, 'Test перформанс'));
const ons = ev.filter((e) => e[1] === 0x90), offs = ev.filter((e) => e[1] === 0x80);
assert.equal(ons.length, 5, 'note-on count');
assert.equal(offs.length, 5, 'note-off count');
assert.ok(ons.some((e) => e[0] === ppq && e[2] === 60), '0.5 s at 120 bpm lands on tick PPQ');
assert.equal(ons.find((e) => e[2] === 60)[3], Math.round(0.8 * 127), 'velocity 0..1 -> 1..127');
ons.forEach((on) => { const off = offs.find((o) => o[2] === on[2]); assert.ok(off[0] > on[0], `off after on for ${on[2]}`); });
assert.equal(notes(recordingToMidi({ bpm: 90, notes: [] }, 'empty')).ev.length, 0, 'empty recording');

// 2) grid deviation: straight and swing off-beats
const beat = 60 / 100;
assert.ok(Math.abs(gridDev(beat * 0.5, 100, false)) < 1e-9, 'straight off-beat at 1/2');
assert.ok(Math.abs(gridDev(beat * 2 / 3, 100, true)) < 1e-9, 'swing off-beat at 2/3');
assert.ok(Math.abs(gridDev(beat * 2 + 0.02, 100, true) - 0.02) < 1e-9, 'late on-beat');
assert.ok(Math.abs(gridDev(beat * 3 - 0.03, 100, true) + 0.03) < 1e-9, 'early on-beat (next beat is nearest)');

// 3) accuracy buckets
const { win, tight } = tols(100);
const acc = rhythmAccuracy([{ t: 0 }, { t: beat + tight / 2 }, { t: 2 * beat + (tight + win) / 2 }, { t: 3 * beat + win + 0.01 }], { bpm: 100, swing: false });
assert.deepEqual([acc.ok, acc.meh, acc.off, acc.pct], [2, 1, 1, 50]);
assert.ok(acc.avgMs > 0);
assert.deepEqual(rhythmAccuracy([], { bpm: 100, swing: true }), { ok: 0, meh: 0, off: 0, pct: 0, avgMs: 0 });
console.log(`ok: recordingToMidi ${ons.length} on / ${offs.length} off, accuracy buckets`);
