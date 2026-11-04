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
export const isDone = (p) => !!(p && p.stages && p.stages.tempo);

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
