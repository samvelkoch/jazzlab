// Scales for the solo screen (improvisation): semitone offsets from the scale root, and the scale a chord implies.
// Pure (no DOM): testable in node.
import { parseChord } from './forms.js';

const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

export const SCALES = {
  blues: [0, 3, 5, 6, 7, 10],
  'minor-pent': [0, 3, 5, 7, 10],
  'major-pent': [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  dim: [0, 2, 3, 5, 6, 8, 9, 11] // whole-half, over a dim7 chord
};

/** Pitch class of a note name without octave: "Bb" -> 10. */
export function pcOf(name) {
  if (!(name in PC)) throw new Error('Unknown root: ' + name);
  return PC[name];
}

/** Pitch classes (Set of 0..11) of a scale on a root name or pitch class. */
export function scalePcs(scale, root) {
  const offs = SCALES[scale];
  if (!offs) throw new Error('Unknown scale: ' + scale);
  const r = typeof root === 'number' ? root : pcOf(root);
  return new Set(offs.map((o) => (r + o) % 12));
}

/**
 * The scale a chord implies, from its offsets: m7b5 -> locrian, dim7 -> dim, m7 -> dorian, m -> aeolian,
 * 7 / 9 -> mixolydian, maj7 / 6 / major triad -> major. Returns { scale, root: pc }.
 */
export function scaleOf(chord) {
  const c = typeof chord === 'string' ? parseChord(chord) : chord;
  const o = new Set(c.offsets.map((x) => x % 12));
  let scale;
  if (o.has(3) && o.has(6) && o.has(10)) scale = 'locrian';
  else if (o.has(3) && o.has(6) && o.has(9)) scale = 'dim';
  else if (o.has(3) && o.has(10)) scale = 'dorian';
  else if (o.has(3)) scale = 'aeolian';
  else if (o.has(4) && o.has(10)) scale = 'mixolydian';
  else scale = 'major';
  return { scale, root: c.pc };
}
