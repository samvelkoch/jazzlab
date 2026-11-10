// Per-chorus and per-bar score accounting for the form screen. Every hit / miss / wrong note is charged to the chorus
// (and bar) it belongs to, not to whichever chorus is running when it is counted: the end of chorus N is judged one
// beat after its last bar, by which time the first notes of chorus N+1 may already have expired as misses.
//   const tl = createTally(NB);
//   tl.add(chorus, bar, 'ok' | 'meh' | 'miss' | 'bad');
//   tl.takeBar(chorus, bar) -> { ok, meh, miss, bad } (and forgets it); tl.takeChorus(chorus) -> the same for the chorus.
const zero = () => ({ ok: 0, meh: 0, miss: 0, bad: 0 });

export function createTally(nb) {
  const ch = new Map(), bars = new Map();
  const get = (m, k) => { if (!m.has(k)) m.set(k, zero()); return m.get(k); };
  const take = (m, k) => { const v = m.get(k) || zero(); m.delete(k); return v; };
  return {
    add(chorus, bar, cls) { get(ch, chorus)[cls]++; get(bars, chorus * nb + bar)[cls]++; },
    takeBar: (chorus, bar) => take(bars, chorus * nb + bar),
    takeChorus: (chorus) => take(ch, chorus)
  };
}

/** Position on the eighth-note grid (slots from the form start, may be fractional) -> { chorus, bar }. */
export function chorusBarAt(pos, nb, per = 8) {
  const g = Math.floor(Math.max(0, pos));
  return { chorus: Math.floor(g / (per * nb)), bar: Math.floor(g / per) % nb };
}
