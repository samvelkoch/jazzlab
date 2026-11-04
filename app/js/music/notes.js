// Pitch helpers. Notes are scientific pitch strings: "C4" = middle C, "F#3", "Bb4".
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const RU = { C: 'До', D: 'Ре', E: 'Ми', F: 'Фа', G: 'Соль', A: 'Ля', B: 'Си' };
const LETTERS = 'CDEFGAB';
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const RE = /^([A-G])(#|b)?(-?\d)$/;

export function parse(n) {
  const m = RE.exec(n);
  if (!m) throw new Error('Bad note: ' + n);
  const alt = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const oct = +m[3];
  return { step: m[1], alt, oct, midi: 12 * (oct + 1) + PC[m[1]] + alt };
}
export const toMidi = (n) => parse(n).midi;
/** Diatonic index (staff position), ignores accidentals. */
export function dia(n) { const p = parse(n); return p.oct * 7 + LETTERS.indexOf(p.step); }
export const isBlack = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
export const midiToName = (m) => SHARP_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

/** Display name. mode: 'en' (C♯) | 'ru' (До♯) | 'both' (C♯ (До♯)). */
export function noteName(n, mode = 'en') {
  const p = parse(n);
  const acc = p.alt === 1 ? '♯' : p.alt === -1 ? '♭' : '';
  if (mode === 'ru') return RU[p.step] + acc;
  if (mode === 'both') return p.step + acc + ' (' + RU[p.step] + acc + ')';
  return p.step + acc;
}
