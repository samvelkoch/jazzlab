// Timing offset (settings.latencyMs): a constant input delay, typically Bluetooth MIDI, that makes every note read «late».
// A positive value means «my notes arrive late by this much»: audio.toAudioTime subtracts it from every input time.
export const LATENCY = { min: -50, max: 200, step: 5, def: 0 };
export const clampLatency = (v) => Math.max(LATENCY.min, Math.min(LATENCY.max, Math.round(Number(v) || 0)));

export const SUGGEST_MS = 25;   // a check-up bias beyond this suggests a correction
export const SUGGEST_SHARE = 0.75; // ...when at least this share of the taps lean the same way

/** From the check-up's rhythm deviations (ms, < 0 = early, measured with the `current` offset already applied):
 *  the offset to suggest, or null when the bias is small or not consistent. */
export function suggestLatency(devs, current = 0) {
  const d = (devs || []).filter(Number.isFinite);
  if (d.length < 4) return null;
  const mean = d.reduce((a, x) => a + x, 0) / d.length;
  if (Math.abs(mean) <= SUGGEST_MS) return null;
  const same = d.filter((x) => Math.sign(x) === Math.sign(mean)).length / d.length;
  if (same < SUGGEST_SHARE) return null;
  const next = clampLatency(clampLatency(current) + Math.round(mean));
  return next === clampLatency(current) ? null : next;
}
