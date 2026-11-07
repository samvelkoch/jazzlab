// Pure term matching (no DOM, no imports), so node can test it. Used by glossary.js.
// Matching is by lower-case stems: a Cyrillic stem must start a word and takes the rest of the word ("хроматик" finds
// «хроматика», «хроматике»); a Latin stem is a whole word with an optional plural ("chromatic" finds "Chromatics").
const MAX_MARKS = 4;
const ALNUM = /[\p{L}\p{N}]/u;
const CYR = /[а-яё]/i;
const PLURAL_END = /^(?:e?s)?(?![\p{L}\p{N}])/u;

/** The first occurrence of each term in `text`: sorted, non-overlapping (the earlier or longer match wins), at most `max`. */
export function findTerms(text, terms, lang = 'ru', max = MAX_MARKS) {
  const src = String(text || '');
  const low = src.toLowerCase();
  if (!low || low.length !== src.length) return [];
  const found = [];
  for (const term of terms || []) {
    let best = null;
    for (const raw of term.match || []) {
      const stem = raw.toLowerCase();
      const cyr = CYR.test(stem);
      if (lang === 'en' && cyr) continue;
      for (let from = low.indexOf(stem); from >= 0; from = low.indexOf(stem, from + 1)) {
        if (from > 0 && ALNUM.test(low[from - 1])) continue; // inside a word
        let end = from + stem.length;
        if (cyr) { while (end < low.length && ALNUM.test(low[end])) end++; }
        else { const m = PLURAL_END.exec(low.slice(end)); if (!m) continue; end += m[0].length; }
        if (!best || from < best.start || (from === best.start && end > best.end)) best = { start: from, end, id: term.id };
        break; // the first hit of this stem is its earliest
      }
    }
    if (best) found.push(best);
  }
  found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = [];
  for (const f of found) {
    if (out.length && f.start < out[out.length - 1].end) continue;
    out.push(f);
    if (out.length === max) break;
  }
  return out;
}
