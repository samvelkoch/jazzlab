// Form screen view logic (no DOM, no i18n): what the task headline says, the «Now» strip (the notes of a bar under its
// eight eighth slots), the «Next» summary, and the keyboard plan (the hand position of a bar shown ahead of time).
// Positions are global eighth slots G = chorus * NB * 8 + bar * 8 + slot, the same counter the form screen schedules with.
export const PER = 8;

/** Which task headline fits the item: 'lh' | 'lick' | 'qa' | 'key' | 'mel' | 'comp', or 'both' when both hands are yours
 *  (then sub = the right-hand part: 'lick' | 'qa' | 'key' | 'mel'). */
export function taskMode({ rh, two, comp, mel, kl, pair }) {
  if (!rh) return { mode: 'lh' };
  if (comp) return { mode: 'comp' };
  const part = mel ? 'mel' : kl ? 'key' : pair ? 'qa' : 'lick';
  return two ? { mode: 'both', sub: part } : { mode: part };
}

/** Bars (1-based) where a two-bar right-hand phrase starts: even k with notes in bar k or k + 1.
 *  roleOf(k) = 'question' | 'answer' | other splits them into q and a. Returns { all, q, a }. */
export function phraseStarts(rhNotes, roleOf = () => null) {
  const out = { all: [], q: [], a: [] };
  for (let k = 0; k < rhNotes.length; k += 2) {
    if (!(rhNotes[k] || []).length && !(rhNotes[k + 1] || []).length) continue;
    out.all.push(k + 1);
    const r = roleOf(k);
    if (r === 'question') out.q.push(k + 1); else if (r === 'answer') out.a.push(k + 1);
  }
  return out;
}

/** A list of bar numbers for a sentence: «1, 3, 5»; a long one keeps the first three and the last: «1, 3, 5 … 31».
 *  Items may be numbers or ready strings («5–6»). */
export function fmtBars(nums, max = 6) {
  if (nums.length <= max) return nums.join(', ');
  return nums.slice(0, 3).join(', ') + ' … ' + nums[nums.length - 1];
}

/** Distinct slots with notes, per bar: [[t, ...] ascending]. barNotes = per bar [{t, m, ...}]. */
export function eventSlots(barNotes) {
  return barNotes.map((evs) => [...new Set((evs || []).map((e) => e.t))].sort((a, b) => a - b));
}

/** The first event position G >= g (wrapping around the form), or -1 when the form has no notes at all. */
export function nextEventG(slots, g) {
  const NB = slots.length;
  if (!NB || !slots.some((s) => s.length)) return -1;
  for (let G = Math.max(0, g); G < Math.max(0, g) + NB * PER + PER; G++) {
    const bar = Math.floor(G / PER) % NB, slot = G % PER;
    if (slots[bar].includes(slot)) return G;
  }
  return -1;
}

/**
 * The keyboard plan after every event up to doneG is over (hit or expired; doneG = -1 before the first).
 * hands = { rh: perBar | null, lh: perBar | null }: only the parts that are yours, per bar [{t, m, f}].
 * Returns { g, bar, slot, target: { rh: [m], lh: [m] }, tint: { rh: [{m, f}], lh: [{m, f}] } }: target = the notes of the
 * next event, tint = every key of its bar with the finger of its next use at or after the target (else its first use).
 * null when there is nothing to play.
 */
export function keyPlan(hands, doneG) {
  const parts = ['rh', 'lh'].filter((h) => hands[h]);
  if (!parts.length) return null;
  const NB = hands[parts[0]].length;
  const merged = Array.from({ length: NB }, (_, k) => parts.flatMap((h) => hands[h][k] || []));
  const g = nextEventG(eventSlots(merged), doneG + 1);
  if (g < 0) return null;
  const bar = Math.floor(g / PER) % NB, slot = g % PER;
  const target = { rh: [], lh: [] }, tint = { rh: [], lh: [] };
  for (const h of parts) {
    const evs = (hands[h][bar] || []).slice().sort((a, b) => a.t - b.t || a.m - b.m);
    target[h] = [...new Set(evs.filter((e) => e.t === slot).map((e) => e.m))];
    const byM = new Map();
    evs.forEach((e) => { const cur = byM.get(e.m); if (!cur || (cur.t < slot && e.t >= slot)) byM.set(e.m, e); });
    tint[h] = [...byM.values()].map((e) => ({ m: e.m, f: e.f || 0 })).sort((a, b) => a.m - b.m);
  }
  return { g, bar, slot, target, tint };
}

/**
 * One hand's row of the «Now» strip: 8 entries, one per eighth slot. A slot where notes start: { names: [high → low],
 * f: [fingers, same order], hold: false }; a slot still covered by an earlier note: { hold: true }; else null.
 * nameOf(e) = the label of a note (spelled, no octave).
 */
export function stripRow(evs, nameOf) {
  const row = Array(PER).fill(null);
  const starts = {};
  (evs || []).forEach((e) => { (starts[e.t] = starts[e.t] || []).push(e); });
  Object.keys(starts).map(Number).sort((a, b) => a - b).forEach((t) => {
    if (t < 0 || t >= PER) return;
    const es = starts[t].slice().sort((a, b) => b.m - a.m);
    const seen = new Set(), uniq = es.filter((e) => (seen.has(e.m) ? false : seen.add(e.m)));
    row[t] = { names: uniq.map(nameOf), f: uniq.map((e) => e.f || 0), hold: false };
    const end = Math.min(PER, t + Math.max(...es.map((e) => e.d || 1)));
    for (let s = t + 1; s < end; s++) if (!starts[s] && !row[s]) row[s] = { hold: true };
  });
  return row;
}

/** The distinct notes of a bar in order of first appearance (by time, low to high within one slot). */
export function barSummary(evs, nameOf) {
  const out = [], seen = new Set();
  (evs || []).slice().sort((a, b) => a.t - b.t || a.m - b.m).forEach((e) => { const n = nameOf(e); if (!seen.has(n)) { seen.add(n); out.push(n); } });
  return out;
}

/**
 * The staff window of the form screen: bars k, k + 1, … (n bars, wrapping round the form) as a raw jazzlab-exercise/1
 * object for createStaff (call normalize() on it). hands = { rh: perBar | null, lh: perBar | null } — the same per-bar notes
 * the strip and the keyboard show ({t, d, m, f?, stac?}); a hand that is null stays empty. spellOf(hand, bar, e) = the note's
 * spelled name with octave ('Eb4'). Notes starting on one slot of one hand become one event (a chord, low to high, a pitch
 * once); its length is the longest of them, cut at the bar line. No fingers (they are on the strip and the keys).
 */
export function staffBars(hands, k, spellOf, n = 2) {
  const NB = (hands.rh || hands.lh || []).length;
  const bars = [];
  for (let j = 0; j < Math.min(n, Math.max(NB, 1)); j++) {
    const bar = NB ? (k + j) % NB : 0, out = { rh: [], lh: [] };
    for (const hd of ['rh', 'lh']) {
      const evs = (hands[hd] && hands[hd][bar]) || [], at = new Map();
      evs.forEach((e) => { if (e.t >= 0 && e.t < PER) (at.get(e.t) || at.set(e.t, []).get(e.t)).push(e); });
      out[hd] = [...at.keys()].sort((a, b) => a - b).map((t) => {
        const es = at.get(t).slice().sort((a, b) => a.m - b.m), seen = new Set();
        const uniq = es.filter((e) => (seen.has(e.m) ? false : seen.add(e.m)));
        return { t, d: Math.max(1, Math.min(PER - t, Math.max(...es.map((e) => e.d || 1)))), n: uniq.map((e) => spellOf(hd, bar, e)), f: [], stac: es.every((e) => !!e.stac) };
      });
    }
    bars.push(out);
  }
  return { $format: 'jazzlab-exercise/1', id: 'form-staff', time: [4, 4], dyn: [], bars };
}
