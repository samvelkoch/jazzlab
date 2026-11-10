// History by day, timing offset, per-chorus accounting, backup. Run: node tests/history.test.mjs
// (no localStorage in node: the store falls back to memory)
import assert from 'node:assert/strict';
import { dayKey, shiftKey, addToDay, lastDays, sumDays, MAX_DAYS } from '../app/js/days.js';
import { clampLatency, suggestLatency, LATENCY } from '../app/js/timing.js';
import { createTally, chorusBarAt } from '../app/js/music/tally.js';
import { collectBackup, validateBackup, applyBackup, backupCounts, backupName, BACKUP_FORMAT } from '../app/js/backup.js';
import { scheduleReview, days, logDay, latencyMs, setLatencyMs } from '../app/js/store.js';

// ---- day keys: local date, the day starts at 04:00 ----
assert.equal(dayKey(new Date(2026, 0, 2, 3, 59)), '2026-01-01', 'before 04:00 is the day before');
assert.equal(dayKey(new Date(2026, 0, 2, 4, 0)), '2026-01-02');
assert.equal(dayKey(new Date(2026, 0, 1, 1, 0)), '2025-12-31', 'across the year');
assert.equal(dayKey(new Date(2026, 2, 1, 2, 0)), '2026-02-28', 'across the month');
assert.equal(shiftKey('2026-03-01', -1), '2026-02-28');
assert.equal(shiftKey('2024-02-28', 1), '2024-02-29', 'leap day');
assert.equal(shiftKey('2026-10-25', 1), '2026-10-26', 'DST change is a plain calendar day');

// ---- the log: add, prune to MAX_DAYS, last n days, totals ----
let log = addToDay({}, '2026-01-05', { sec: 30.04, passed: 1 });
log = addToDay(log, '2026-01-05', { sec: 60, reviewsOk: 2, bogus: 5 });
assert.deepEqual(log['2026-01-05'], { sec: 90, passed: 1, reviewsOk: 2, reviewsFail: 0, choruses: 0, cleanChoruses: 0 }, 'unknown fields are ignored');
let big = {};
for (let i = 0; i < MAX_DAYS + 5; i++) big[shiftKey('2025-01-01', i)] = { sec: 1 };
big = addToDay(big, shiftKey('2025-01-01', MAX_DAYS + 5), { sec: 1 });
assert.equal(Object.keys(big).length, MAX_DAYS, 'at most MAX_DAYS days');
assert.ok(!big['2025-01-01'] && big[shiftKey('2025-01-01', MAX_DAYS + 5)], 'the oldest days go first');
const rows = lastDays({ '2026-01-05': { sec: 600, passed: 1 }, '2026-01-03': { sec: 120, reviewsFail: 1 }, '2025-12-20': { sec: 999 } }, 7, '2026-01-05');
assert.deepEqual(rows.map((r) => r.key), ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'], 'oldest first, ends today');
assert.equal(rows[3].sec, 0, 'a day without practice is a zero row');
const s = sumDays(rows);
assert.equal(s.min, 12); assert.equal(s.active, 2); assert.equal(s.passed, 1); assert.equal(s.reviewsFail, 1);
assert.equal(sumDays(lastDays({ k: { sec: 10 } }, 1, 'k')).active, 0, 'a few seconds of noodling is not a practice day');

// ---- scheduleReview feeds the log: first pass, due pass, fail; early practice and repeated fails do not count ----
const at = (d, hh = 12) => new Date(2026, 4, d, hh);
scheduleReview('h1', true, at(1));                       // first pass
scheduleReview('h1', true, at(1));                       // practice before due: no change
assert.deepEqual([days()['2026-05-01'].passed, days()['2026-05-01'].reviewsOk], [1, 0]);
scheduleReview('h1', true, at(2));                       // due pass
scheduleReview('h1', false, at(3)); scheduleReview('h1', false, at(3)); // a fail, then the same fail again
assert.equal(days()['2026-05-02'].reviewsOk, 1);
assert.equal(days()['2026-05-03'].reviewsFail, 1, 'a repeated fail changes nothing and is not counted');
scheduleReview('h2', true, at(4, 2));                    // 02:00 belongs to the day before
assert.equal(days()['2026-05-03'].passed, 1);
logDay({ choruses: 3, cleanChoruses: 2 }, at(3));
assert.deepEqual([days()['2026-05-03'].choruses, days()['2026-05-03'].cleanChoruses], [3, 2]);

// ---- timing offset ----
assert.equal(clampLatency(500), LATENCY.max); assert.equal(clampLatency(-90), LATENCY.min); assert.equal(clampLatency('x'), 0); assert.equal(clampLatency(12.6), 13);
assert.equal(latencyMs(), 0, 'default 0');
assert.equal(setLatencyMs(80), 80); assert.equal(latencyMs(), 80);
assert.equal(setLatencyMs(999), LATENCY.max); setLatencyMs(0);
assert.equal(suggestLatency([80, 75, 90, 85, 70, 82], 0), 80, 'consistently late: the rounded mean');
assert.equal(suggestLatency([40, 35, 30, 45], 80), 118, 'measured with the offset on: added to it');
assert.equal(suggestLatency([10, -12, 20, 5, -8], 0), null, 'small bias: nothing');
assert.equal(suggestLatency([120, -60, 110, -50, 100, -40], 0), null, 'not consistent: nothing');
assert.equal(suggestLatency([-60, -55, -70, -65], 0), -50, 'early, clamped to the minimum');
assert.equal(suggestLatency([-60, -55, -70, -65], -50), null, 'already at the limit: nothing to apply');
assert.equal(suggestLatency([90, 80], 0), null, 'too few taps');

// ---- per-chorus accounting: the next chorus's early misses do not land on the chorus that just ended ----
const NB = 12, PER = 8;
const tl = createTally(NB);
for (let bar = 0; bar < NB; bar++) { tl.add(2, bar, 'ok'); tl.add(2, bar, 'ok'); }
tl.add(2, 4, 'miss');                                    // one own slip in chorus 3
tl.add(3, 0, 'miss'); tl.add(3, 0, 'miss');              // chorus 4 begins (nobody plays) before chorus 3 is judged
tl.add(chorusBarAt(3 * NB * PER + 1.2, NB, PER).chorus, 0, 'bad');
const c3 = tl.takeChorus(2);
assert.deepEqual(c3, { ok: 24, meh: 0, miss: 1, bad: 0 }, 'chorus 3 keeps only its own notes');
assert.deepEqual(tl.takeBar(3, 0), { ok: 0, meh: 0, miss: 2, bad: 1 }, 'bar 1 of chorus 4 is separate from bar 1 of chorus 3');
assert.deepEqual(tl.takeBar(2, 0), { ok: 2, meh: 0, miss: 0, bad: 0 });
assert.deepEqual(tl.takeChorus(2), { ok: 0, meh: 0, miss: 0, bad: 0 }, 'taken = forgotten');
assert.deepEqual(chorusBarAt(-3, NB), { chorus: 0, bar: 0 }, 'before the start: the first bar');
assert.deepEqual(chorusBarAt(NB * PER - 0.5, NB), { chorus: 0, bar: NB - 1 });
assert.deepEqual(chorusBarAt(2 * NB * PER + 5 * PER + 3, NB), { chorus: 2, bar: 5 });

// ---- backup over a storage-like object ----
function fakeStorage(init = {}, failOn = null) {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failOn && failOn(k)) throw new Error('QuotaExceededError'); m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, dump: () => Object.fromEntries(m) };
}
const src = fakeStorage({ 'jazzlab:progress': '{"a":{"stages":{"done":true}},"b":{}}', 'jazzlab:review': '{"a":{"n":1}}', 'jazzlab:tempo:form-p1': '96',
  'jazzlab:session:bossa': '{"ids":["x"],"at":0}', 'jazzlab:days': '{"2026-05-01":{"sec":60}}', 'other:key': '"not ours"' });
const b = collectBackup(src, new Date('2026-05-02T10:00:00Z'));
assert.equal(b.$format, BACKUP_FORMAT); assert.equal(b.exported, '2026-05-02T10:00:00.000Z');
assert.deepEqual(Object.keys(b.data), ['days', 'progress', 'review', 'session:bossa', 'tempo:form-p1'], 'only jazzlab:* keys, the prefix stripped once');
assert.equal(b.data['tempo:form-p1'], 96, 'values are parsed');
assert.deepEqual(backupCounts(b.data), { progress: 2, reviews: 1, days: 1 });
const text = JSON.stringify(b);
assert.equal(validateBackup(text).ok, true);
assert.deepEqual(validateBackup('{oops').error, 'json');
assert.deepEqual(validateBackup('{"$format":"jazzlab-help/1","data":{}}').error, 'format');
assert.deepEqual(validateBackup({ $format: BACKUP_FORMAT, data: [1] }).error, 'data');
assert.deepEqual(validateBackup({ $format: BACKUP_FORMAT }).error, 'data');
// apply onto another device: replaces our keys, removes the ones not in the file, leaves foreign keys alone
const dst = fakeStorage({ 'jazzlab:progress': '{}', 'jazzlab:lickStage:l1': '"echo"', 'other:key': '1' });
applyBackup(dst, validateBackup(text).backup);
assert.deepEqual(collectBackup(dst, new Date(0)).data, b.data, 'round trip');
assert.equal(dst.getItem('jazzlab:lickStage:l1'), null, 'a key missing from the file is removed');
assert.equal(dst.getItem('other:key'), '1', 'keys of other apps are untouched');
// a storage error half way: nothing changes
const before = { 'jazzlab:progress': '{"z":{}}', 'jazzlab:theme': '"dark"' };
const bad = fakeStorage(before, (k) => k === 'jazzlab:review');
assert.throws(() => applyBackup(bad, validateBackup(text).backup), /Quota/);
assert.deepEqual(bad.dump(), before, 'restored after a failed import');
assert.equal(backupName(new Date(2026, 10, 9, 23, 0)), 'jazzlab-progress-2026-11-09.json');
console.log('ok: history + timing + tally + backup');
