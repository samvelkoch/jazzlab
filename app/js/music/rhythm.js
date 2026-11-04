// Rhythm of an exercise, both hands merged (in the Rhythm stage hands don't matter: you clap one rhythm).

const SYL = {
  ru: { long: 'ко', short: 'фе', quarter: 'чай', off: 'ка', rest: 'тс' },
  en: { long: 'cof', short: 'fee', quarter: 'tea', off: 'ka', rest: 'ts' }
};

/**
 * One bar → { per, onsets: [{ slot, len, acc, syl }], rests: [{ slot, syl }], kinds: ['n'|'h'|'r'] }.
 * Syllables go per beat: two eighths = «ко-фе», a quarter (or longer) = «чай», a rest then an eighth = «тс-ка».
 */
export function barRhythm(ex, b, lang = 'ru') {
  const per = ex.per, bar = ex.bars[b], s = SYL[lang] || SYL.ru;
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

/** Parse a rhythm line like "8 8 4 r8 8 4." into one bar of events: [{ t, d, rest }]. */
export function parsePattern(str) {
  const out = []; let t = 0;
  str.trim().split(/\s+/).forEach((tok) => {
    const m = /^(r?)(4|8)(\.?)$/.exec(tok);
    if (!m) throw new Error('Bad rhythm token: ' + tok);
    const d = (m[2] === '4' ? 2 : 1) * (m[3] ? 1.5 : 1);
    out.push({ t, d, rest: !!m[1] }); t += d;
  });
  return out;
}

/** Same as barRhythm, for a rhythm line instead of an exercise bar. */
export function patternRhythm(str, per = 8, lang = 'ru') {
  const ev = parsePattern(str).filter((e) => !e.rest).map((e) => ({ t: e.t, d: e.d, acc: false }));
  return barRhythm({ per, bars: [{ rh: ev, lh: [] }] }, 0, lang);
}
