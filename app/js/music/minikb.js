// A small static keyboard for a «Новое слово» card (path screen): no input, no scrolling, the card's keys filled.
// Pure geometry (node-testable) + an SVG string; the colours are CSS (.minikb in app.css).
import { toMidi, isBlack } from './notes.js';

/** [lo, hi] MIDI of the smallest whole-octave range (C … B) holding every note; a top note that is a C ends the range
 *  on that C instead of adding an octave of empty keys. `notes` = names like 'C4', 'Eb4', 'Bb3'. */
export function miniRange(notes) {
  const ms = notes.map(toMidi);
  const min = Math.min(...ms), max = Math.max(...ms);
  const lo = min - (((min % 12) + 12) % 12);
  const hi = max % 12 === 0 && max > lo ? max : max - (max % 12) + 11;
  return [lo, hi];
}

/** Keys of [lo, hi] laid out in white-key units: { whites, keys: [{ m, black, x, w }] } (a black key straddles the
 *  line between its two white neighbours). */
export function miniLayout(lo, hi) {
  const keys = [];
  let wx = 0;
  for (let m = lo; m <= hi; m++) {
    if (isBlack(m)) keys.push({ m, black: true, x: wx - 0.32, w: 0.64 });
    else keys.push({ m, black: false, x: wx++, w: 1 });
  }
  return { whites: wx, keys };
}

/** SVG markup: whites first, blacks over them; a key in `lit` (a Set of MIDI numbers) gets the class «on». */
export function miniSvg(notes) {
  const [lo, hi] = miniRange(notes);
  const lit = new Set(notes.map(toMidi));
  const { whites, keys } = miniLayout(lo, hi);
  const U = 17, H = 60, BH = 37;
  const rect = (k) => k.black
    ? `<rect class="bk${lit.has(k.m) ? ' on' : ''}" data-m="${k.m}" x="${(k.x * U).toFixed(1)}" y="0" width="${(k.w * U).toFixed(1)}" height="${BH}"/>`
    : `<rect class="wk${lit.has(k.m) ? ' on' : ''}" data-m="${k.m}" x="${k.x * U + 0.5}" y="0.5" width="${U - 1}" height="${H - 1}"/>`;
  return `<svg class="minikb" viewBox="0 0 ${whites * U} ${H}" width="${whites * U}" height="${H}" aria-hidden="true" focusable="false">`
    + keys.filter((k) => !k.black).map(rect).join('') + keys.filter((k) => k.black).map(rect).join('') + '</svg>';
}
