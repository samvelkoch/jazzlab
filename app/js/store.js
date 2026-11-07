// Local persistence (this device only). Every access is guarded: storage can be unavailable
// (private mode, blocked site data) and the app must still work.
const PREFIX = 'jazzlab:';
const mem = new Map();

export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(PREFIX + key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return mem.has(key) ? mem.get(key) : fallback; }
  },
  set(key, value) {
    mem.set(key, value);
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* memory only */ }
  }
};

// ---- progress ----
// progress = { [exerciseId]: { stages: {notes: true, tempo: true, memory: true}, bestTempo: 84, last: ISO } }
export function progress() { return store.get('progress', {}); }
export function exProgress(id) { return progress()[id] || { stages: {}, bestTempo: 0 }; }
export function updateEx(id, fn) {
  const all = progress();
  const cur = all[id] || { stages: {}, bestTempo: 0 };
  all[id] = { ...fn(cur), last: new Date().toISOString() };
  store.set('progress', all);
  store.set('lastExercise', id);
}
export const isDone = (p) => !!(p && p.stages && (p.stages.tempo || p.stages.done));

// ---- practice time (seconds), counted only while actually playing ----
let lastActive = 0, pending = 0, flushT = 0;
export function practiceSeconds() { return store.get('practiceSec', 0) + pending; }
/** Call on every note / playback tick. Counts up to 5 s of wall time per call. */
export function markActive() {
  const now = Date.now();
  if (lastActive) pending += Math.min(5, (now - lastActive) / 1000);
  lastActive = now;
  if (!flushT) flushT = setTimeout(() => { store.set('practiceSec', store.get('practiceSec', 0) + pending); pending = 0; flushT = 0; }, 5000);
}
export function idle() { lastActive = 0; }

// ---- spaced review ----
// review = { [itemId]: { due: ISO, interval: days, n: successes in a row, last: ISO } }
export const REVIEW_STEPS = [1, 3, 7, 14, 30];
export function reviews() { return store.get('review', {}); }
/** Called when an item is passed (first time or on review). ok=false sends it back to day 1. */
export function scheduleReview(id, ok, now = new Date()) {
  const all = reviews();
  const cur = all[id] || { n: 0 };
  // passing again before the due date is practice, not a review: keep the schedule as it is
  if (ok && cur.due && new Date(cur.due) > now) return cur;
  const n = ok ? Math.min(cur.n + 1, REVIEW_STEPS.length) : 0;
  const days = REVIEW_STEPS[Math.max(0, Math.min(n, REVIEW_STEPS.length) - 1)] || REVIEW_STEPS[0];
  const due = new Date(now); due.setHours(4, 0, 0, 0); due.setDate(due.getDate() + (ok ? days : 1));
  all[id] = { due: due.toISOString(), interval: ok ? days : 1, n, last: now.toISOString() };
  store.set('review', all);
  return all[id];
}
/** Ids due today or earlier, earliest first. */
export function dueReviews(now = new Date()) {
  const all = reviews();
  return Object.keys(all).filter((id) => new Date(all[id].due) <= now).sort((a, b) => new Date(all[a].due) - new Date(all[b].due));
}
/** "In long-term memory" = interval of 14 days or more. */
export const longTerm = (r) => !!(r && r.interval >= 14);

// ---- one-tap session: a queue of item ids to go through, one per track ----
// session = { ids: [...], at: index, started: ISO }. The blues keeps the original key 'session'; other tracks use
// 'session:<track>', so starting the bossa session does not end the blues one (item ids are unique across tracks).
const sessKey = (track) => (!track || track === 'blues' ? 'session' : 'session:' + track);
export function session(track) { return store.get(sessKey(track), null); }
export function startSession(ids, track) { const s = { ids, at: 0, started: new Date().toISOString() }; store.set(sessKey(track), s); return s; }
export function endSession(track) { store.set(sessKey(track), null); }
/** Next item after the given one (or the first not yet reached); null when the queue is finished. */
export function sessionNext(afterId, track) {
  const s = session(track); if (!s || !s.ids.length) return null;
  const k = afterId ? s.ids.indexOf(afterId) : -1;
  const at = k >= 0 ? k + 1 : s.at;
  if (at >= s.ids.length) return null;
  return { id: s.ids[at], at, total: s.ids.length };
}
export function sessionAdvance(id, track) {
  const s = session(track); if (!s) return;
  const k = s.ids.indexOf(id); if (k >= 0) { s.at = Math.max(s.at, k + 1); store.set(sessKey(track), s); }
}
