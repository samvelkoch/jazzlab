// Practice history by day (pure functions; store.js keeps the log under the key 'days').
//   days = { 'YYYY-MM-DD': { sec, passed, reviewsOk, reviewsFail, choruses, cleanChoruses } }
// The key is the local date, and a day starts at 04:00 like the review schedule: practice at 01:30 counts for the day before.
export const DAY_START_H = 4;
export const MAX_DAYS = 400;
export const DAY_FIELDS = ['sec', 'passed', 'reviewsOk', 'reviewsFail', 'choruses', 'cleanChoruses'];

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The day a moment belongs to (local time, the day starts at 04:00). */
export function dayKey(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < DAY_START_H) d.setDate(d.getDate() - 1);
  return fmt(d);
}
/** 'YYYY-MM-DD' -> the same key moved by n days (calendar days, DST-safe). */
export function shiftKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return fmt(new Date(y, m - 1, d + n, 12));
}
export const emptyDay = () => Object.fromEntries(DAY_FIELDS.map((f) => [f, 0]));

/** A new log with `delta` ({ sec: 12.5, passed: 1, … }) added to day `key`; at most MAX_DAYS days, the newest kept. */
export function addToDay(days, key, delta) {
  const cur = { ...emptyDay(), ...(days && days[key]) };
  for (const [f, v] of Object.entries(delta)) if (DAY_FIELDS.includes(f) && Number.isFinite(v)) cur[f] = (cur[f] || 0) + v;
  cur.sec = Math.round(cur.sec * 10) / 10;
  const out = { ...(days || {}), [key]: cur };
  const keys = Object.keys(out).sort();
  if (keys.length > MAX_DAYS) keys.slice(0, keys.length - MAX_DAYS).forEach((k) => delete out[k]);
  return out;
}

/** The last n days ending with today's key, oldest first; days without practice are zero rows. */
export function lastDays(days, n, todayKey = dayKey()) {
  return Array.from({ length: n }, (_, i) => {
    const key = shiftKey(todayKey, i - (n - 1));
    return { key, ...emptyDay(), ...((days && days[key]) || {}) };
  });
}

/** Totals over rows from lastDays: minutes (rounded), days practised (any seconds or results), and the counters. */
export function sumDays(rows) {
  const s = emptyDay();
  rows.forEach((r) => DAY_FIELDS.forEach((f) => { s[f] += r[f] || 0; }));
  const active = rows.filter((r) => r.sec >= 30 || r.passed || r.reviewsOk || r.reviewsFail || r.choruses).length;
  return { ...s, min: Math.round(s.sec / 60), active };
}
