// Rhythm of an exercise, both hands merged (in the Rhythm stage hands don't matter: you clap one rhythm).

// Syllable systems. Per beat: two eighths = long + short, a quarter (or longer) = quarter,
// rest then an eighth = rest + off.
export const SYL_SYSTEMS = {
  food: { ru: { long: 'ко', short: 'фе', quarter: 'чай', off: 'ка', rest: 'тс' }, en: { long: 'cof', short: 'fee', quarter: 'tea', off: 'ka', rest: 'ts' } },
  kodaly: { ru: { long: 'ти', short: 'ти', quarter: 'та', off: 'ти', rest: 'тс' }, en: { long: 'ti', short: 'ti', quarter: 'ta', off: 'ti', rest: 'sh' } },
  takadimi: { ru: { long: 'та', short: 'ди', quarter: 'та', off: 'ди', rest: '(та)' }, en: { long: 'ta', short: 'di', quarter: 'ta', off: 'di', rest: '(ta)' } },
  scat: { ru: { long: 'ду', short: 'БА', quarter: 'ду', off: 'БАТ', rest: '–' }, en: { long: 'doo', short: 'BAH', quarter: 'doo', off: 'DAHT', rest: '–' } }
};
export const SYL_KEYS = Object.keys(SYL_SYSTEMS);

/**
 * One bar → { per, onsets: [{ slot, len, acc, syl }], rests: [{ slot, syl }], kinds: ['n'|'h'|'r'] }.
 * Syllables go per beat: two eighths = «ко-фе», a quarter (or longer) = «чай», a rest then an eighth = «тс-ка».
 */
export function barRhythm(ex, b, lang = 'ru', system = 'food') {
  const sys = SYL_SYSTEMS[system] || SYL_SYSTEMS.food;
  const per = ex.per, bar = ex.bars[b], s = sys[lang] || sys.ru;
  const evs = [...bar.rh, ...bar.lh];
  const at = (slot) => evs.filter((e) => e.t === slot);
  const kinds = Array.from({ length: per }, (_, k) => (at(k).length ? 'n' : evs.some((e) => e.t < k && e.t + e.d > k) ? 'h' : 'r'));
  const onsets = [], rests = [];
  for (let k = 0; k < per; k++) {
    if (kinds[k] !== 'n') continue;
    let next = k + 1; while (next < per && kinds[next] !== 'n') next++;
    const len = Math.max(1, Math.min(next - k, Math.max(...at(k).map((e) => e.d))));
    onsets.push({ slot: k, len, acc: at(k).some((e) => e.acc), syl: '' });
  }
  const on = (k) => onsets.find((o) => o.slot === k);
  for (let k = 0; k < per; k += 2) {
    const a = kinds[k], c = kinds[k + 1];
    if (a === 'n' && c === 'n') { on(k).syl = s.long; on(k + 1).syl = s.short; }
    else if (a === 'n') on(k).syl = s.quarter;
    else if (c === 'n') { on(k + 1).syl = s.off; if (a === 'r') rests.push({ slot: k, syl: s.rest }); }
    else if (a === 'r' && c === 'r') rests.push({ slot: k, len: 2, syl: s.rest });
  }
  return { per, onsets, rests, kinds };
}

/**
 * Parse a rhythm line like "8 8 4 r8 8 4." or "2 2" (half notes) into one bar of events: [{ t, d, rest }].
 * Lengths: 8 = eighth (1 slot), 4 = quarter (2), 2 = half (4); a dot adds half (4. = 3, 2. = 6);
 * "~" ties lengths into one note (4.~4 = 5: a dotted quarter tied to a quarter, the bossa bass cell).
 */
export function parsePattern(str) {
  const out = []; let t = 0;
  str.trim().split(/\s+/).forEach((tok) => {
    const m = /^(r?)((?:2|4|8)\.?(?:~(?:2|4|8)\.?)*)$/.exec(tok);
    if (!m) throw new Error('Bad rhythm token: ' + tok);
    const d = m[2].split('~').reduce((a, p) => a + (p[0] === '2' ? 4 : p[0] === '4' ? 2 : 1) * (p.length > 1 ? 1.5 : 1), 0);
    out.push({ t, d, rest: !!m[1] }); t += d;
  });
  return out;
}

/** A note length in eighths as a rhythm token (inverse of parsePattern): 3 -> "4.", 5 -> "4.~4", 6 -> "2.". */
export function lenToken(d) {
  const T = { 1: '8', 2: '4', 3: '4.', 4: '2', 5: '4.~4', 6: '2.', 7: '2.~8', 8: '2~2' };
  if (T[d]) return T[d];
  const parts = []; let left = d;
  for (const [n, tok] of [[6, '2.'], [4, '2'], [3, '4.'], [2, '4'], [1, '8']]) while (left >= n) { parts.push(tok); left -= n; }
  return parts.join('~');
}

/** Same as barRhythm, for a rhythm line instead of an exercise bar. */
export function patternRhythm(str, per = 8, lang = 'ru', system = 'food') {
  const ev = parsePattern(str).filter((e) => !e.rest).map((e) => ({ t: e.t, d: e.d, acc: false }));
  return barRhythm({ per, bars: [{ rh: ev, lh: [] }] }, 0, lang, system);
}
