// Feedback for the form screen: what one chorus tells the learner. Pure functions (tests/formfb.test.mjs).
//   issues: [{ bar, slot, kind: 'wrong' | 'miss' | 'early' | 'late', dt?, m?, want? }]  (bar = index in the form)
//   dts: the timing offsets of the hits, in seconds (negative = early)

/** Which slips to show first: wrong keys and misses (they break a chorus), grouped by bar, in form order. */
export function slipBars(issues) {
  const out = new Map();
  issues.filter((x) => x.kind === 'wrong' || x.kind === 'miss').forEach((x) => { if (!out.has(x.bar)) out.set(x.bar, []); out.get(x.bar).push(x); });
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([bar, list]) => ({ bar, list }));
}

/** The stretch of `len` bars to loop that holds the most slips (ties: the earliest). bars: slip bar indices. */
export function loopWindow(bars, nb, len = 4) {
  if (!bars.length) return null;
  if (nb <= len) return [0, nb - 1];
  let best = null, bestN = -1;
  for (let a = 0; a + len <= nb; a++) {
    const n = bars.filter((b) => b >= a && b < a + len).length;
    // prefer a window that starts on a slip bar's group of four (bars 1, 5, 9…) when it holds as many
    const score = n * 2 + (a % len === 0 ? 1 : 0);
    if (score > bestN) { bestN = score; best = [a, a + len - 1]; }
  }
  return best;
}

/** 'rush' | 'drag' | 'even' from the hits' offsets: the median beyond `tight` seconds one way. */
export function tendency(dts, tight) {
  if (dts.length < 4) return 'even';
  const s = [...dts].sort((a, b) => a - b), med = s[Math.floor(s.length / 2)];
  const early = dts.filter((d) => d < -tight).length, late = dts.filter((d) => d > tight).length;
  if (med < -tight / 2 && early > late) return 'rush';
  if (med > tight / 2 && late > early) return 'drag';
  return 'even';
}

/** "3" or "2 и" / "2 and": the count word of an eighth slot. */
export const beatWord = (slot, and = 'и') => (slot % 2 ? `${(slot >> 1) + 1} ${and}` : String((slot >> 1) + 1));

/** The bars where the chord changes (1-based numbers), from the second bar on. */
export const changeBars = (bars) => bars.map((c, k) => (k > 0 && c !== bars[k - 1] ? k + 1 : 0)).filter(Boolean);

/** Russian plural: plural(n, ['ошибка', 'ошибки', 'ошибок']). */
export function plural(n, forms) {
  const d = n % 10, dd = n % 100;
  return d === 1 && dd !== 11 ? forms[0] : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? forms[1] : forms[2];
}

/** How far the hand moves between two positions, in white keys (diatonic steps of the lowest notes): + right, − left. */
export const handShift = (diaFrom, diaTo) => diaTo - diaFrom;
