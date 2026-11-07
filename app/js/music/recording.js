// Performance recordings: rhythm accuracy against the eighth-note grid (swing-aware).
// Notes are { t, d, m, v } with t and d in seconds from the first beat of chorus 1, v = velocity 0..1.

/** Timing windows, same as the form screen: |dev| <= tight is "ok", <= win is "meh", else "off". Seconds. */
export function tols(bpm) {
  const e8 = 60 / bpm / 2;
  return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.16, 0.035), 0.075) };
}

/** Signed deviation (s) of an onset from the nearest eighth-note grid point; swung off-beats sit at 2/3 of the beat. */
export function gridDev(t, bpm, swing) {
  const beat = 60 / bpm, off = swing ? beat * 2 / 3 : beat / 2;
  const w = Math.floor(t / beat), b = w * beat;
  let best = t - b;
  for (const p of [b + off, b + beat]) if (Math.abs(t - p) < Math.abs(best)) best = t - p;
  return best;
}

/** { ok, meh, off, pct (share of ok, 0..100), avgMs (mean |dev|) } over the notes' onsets. */
export function rhythmAccuracy(notes, { bpm, swing }) {
  const { win, tight } = tols(bpm);
  const acc = { ok: 0, meh: 0, off: 0, pct: 0, avgMs: 0 };
  if (!notes.length) return acc;
  let sum = 0;
  notes.forEach((n) => {
    const a = Math.abs(gridDev(n.t, bpm, swing));
    sum += a;
    acc[a <= tight ? 'ok' : a <= win ? 'meh' : 'off']++;
  });
  acc.pct = Math.round((acc.ok / notes.length) * 100);
  acc.avgMs = Math.round((sum / notes.length) * 1000);
  return acc;
}
