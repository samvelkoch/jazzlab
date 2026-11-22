// The circle of fifths («Круг», screens/circle.js): three rings of 12 cells, C at the top, clockwise by fifths. Pure
// helpers (no DOM), node-testable: ring tables, chord → cell, the home key's wedge with its numerals, cell geometry,
// the distinct chords of a form. Run: node tests/circle.test.mjs
import { parseChord } from './chords.js';
import { barChords } from './forms.js';

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
// outer: majors by fifths (pc = 7·pos); middle: the relative minor under its major (pc + 9); inner: the vii° of the
// major above (pc + 11). Labels spell the usual names (D♭ not C♯, F♯ not G♭, E♭m not D♯m, F° not E♯°).
export const OUTER = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];
export const MIDDLE = ['Am', 'Em', 'Bm', 'F♯m', 'C♯m', 'G♯m', 'E♭m', 'B♭m', 'Fm', 'Cm', 'Gm', 'Dm'];
export const INNER = ['B°', 'F♯°', 'C♯°', 'G♯°', 'D♯°', 'A♯°', 'F°', 'C°', 'G°', 'D°', 'A°', 'E°'];
export const RINGS = { outer: OUTER, middle: MIDDLE, inner: INNER };
export const RING_NAMES = ['outer', 'middle', 'inner'];
const OFFSET = { outer: 0, middle: 9, inner: 11 };

/** Pitch class (0..11) of the root of cell `pos` in `ring`. */
export const pcOf = (ring, pos) => (7 * pos + OFFSET[ring]) % 12;
/** The position (0..11) of the cell in `ring` whose root has pitch class `pc`. */
export const posOf = (ring, pc) => { for (let p = 0; p < 12; p++) if (pcOf(ring, p) === pc) return p; return -1; };
/** The pitch-class name a table would use (for messages, not labels). */
export const pcName = (pc) => NAMES[((pc % 12) + 12) % 12];

/** Which ring a chord symbol belongs to: m7b5 / dim / dim7 → inner, minor (m, m7, m6) → middle, everything else → outer. */
export function ringOf(symbol) {
  const q = parseChord(symbol).quality;
  return q.hdim || q.dim ? 'inner' : q.minor ? 'middle' : 'outer';
}

/** The cell of a chord symbol: { ring, pos }, by the pitch class of its root (enharmonics equal). */
export function cellOf(symbol) {
  const ch = parseChord(symbol);
  const ring = ringOf(symbol);
  return { ring, pos: posOf(ring, ch.root.pc) };
}

/** The plain chord of a cell (what a tap plays when the cell is not one of the tune's chords): C, Am, B°. */
export const cellChord = (ring, pos) => RINGS[ring][pos];

/** Home = { root, mode: 'major' | 'minor' } → the position of its home cell (outer for major, middle for minor). */
export const homePos = (home) => posOf(home.mode === 'minor' ? 'middle' : 'outer', parseChord(home.root).root.pc);

/**
 * The wedge of a home key: the six cells around it with their roman numerals, [{ ring, pos, numeral, tint }].
 * Major home at outer p: outer p−1 IV, p I, p+1 V; middle p−1 ii, p vi, p+1 iii.
 * Minor home at middle p: middle p−1 iv, p i, p+1 v; outer p−1 VI, p III, p+1 VII; plus the inner cell at p, ii°
 * (tint: false — it is not part of the tinted wedge, its numeral shows only when the cell is lit).
 */
export function wedgeOf(home) {
  const p = homePos(home), at = (d) => (p + d + 12) % 12;
  const c = (ring, d, numeral, tint = true) => ({ ring, pos: at(d), numeral, tint });
  if (home.mode === 'minor') {
    return [c('outer', -1, 'VI'), c('outer', 0, 'III'), c('outer', 1, 'VII'),
      c('middle', -1, 'iv'), c('middle', 0, 'i'), c('middle', 1, 'v'), c('inner', 0, 'ii°', false)];
  }
  return [c('outer', -1, 'IV'), c('outer', 0, 'I'), c('outer', 1, 'V'),
    c('middle', -1, 'ii'), c('middle', 0, 'vi'), c('middle', 1, 'iii')];
}

/** Every distinct chord symbol of a form, in the order of first appearance in its bars. */
export const formChords = (form) => [...new Set(form.bars.flatMap(barChords))];

/** The form's chords as they sound, bar by bar, with consecutive repeats collapsed (C7 C7 F7 → C7 F7). */
export function chordRun(form) {
  const all = form.bars.flatMap(barChords);
  return all.filter((c, i) => i === 0 || c !== all[i - 1]);
}

// ---------- geometry (SVG user units) ----------
export const SIZE = 520;
export const C0 = SIZE / 2;
/** Ring radii: outer 255…190, middle 190…130, inner 130…84; inside 84 the centre (the home name). */
export const RADII = { outer: [190, 255], middle: [130, 190], inner: [84, 130] };
const STEP = Math.PI / 6;
const pt = (r, a) => [C0 + r * Math.sin(a), C0 - r * Math.cos(a)];
const f = (n) => Number(n.toFixed(2));

/** The SVG path of a cell: an annular sector centred on angle pos·30° (0 = top, clockwise). */
export function cellPath(ring, pos) {
  const [r0, r1] = RADII[ring];
  const a0 = (pos - 0.5) * STEP, a1 = (pos + 0.5) * STEP;
  const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
  return `M${f(x0)} ${f(y0)}A${r1} ${r1} 0 0 1 ${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}A${r0} ${r0} 0 0 0 ${f(x3)} ${f(y3)}Z`;
}

/** The centre point of a cell: [x, y] at the middle radius of its ring. */
export function cellCentre(ring, pos) {
  const [r0, r1] = RADII[ring];
  const [x, y] = pt((r0 + r1) / 2, pos * STEP);
  return [f(x), f(y)];
}
