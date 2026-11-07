// Chords, left-hand patterns and forms. A pattern is written once, relative to the chord root
// (semitone offsets + fingers); over a chord sequence it unfolds into a normal exercise
// (jazzlab-exercise/1), so the exercise screen, MIDI scoring and export all work unchanged.
import { SHARP_NAMES, midiToName } from './notes.js';

const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// chord quality -> semitone offsets from the root
const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], '9': [0, 4, 7, 10, 14], '6': [0, 4, 7, 9]
};

/** "F7" -> { name, root: 'F', pc: 5, qual: '7', offsets: [0,4,7,10] } */
export function parseChord(name) {
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(name);
  if (!m || !(m[2] in QUAL)) throw new Error('Unknown chord: ' + name);
  return { name, root: m[1], pc: PC[m[1]], qual: m[2], offsets: QUAL[m[2]] };
}
/** Pitch classes of a chord (0..11). */
export const chordPcs = (name) => { const c = parseChord(name); return c.offsets.map((o) => (c.pc + o) % 12); };

/** Spell a MIDI number with flats when the chord root is flat (Bb7 -> Ab, not G#). */
export function spell(m, flats) {
  const pc = ((m % 12) + 12) % 12, oct = Math.floor(m / 12) - 1;
  return (flats ? FLAT_NAMES[pc] : SHARP_NAMES[pc]) + oct;
}
export const flatsFor = (chord) => /b/.test(chord.root) || chord.root === 'F';

/**
 * Root for the left hand: keep it between F2 (41) and E3 (52) so the hand stays in one place.
 * C -> C3 (48), F -> F2 (41), G -> G2 (43), Bb -> Bb2 (46), Eb -> Eb3 (51).
 */
export const lhRoot = (chord) => (chord.pc >= 5 ? 36 + chord.pc : 48 + chord.pc);

/**
 * Unfold a pattern over a chord sequence.
 * pattern: { id, title, bars: 1, events: [{ t, d, deg, f, stac? }] } — deg = semitones above the root.
 * bars: ['C7', 'F7', ...] one chord per bar.
 * Returns a raw jazzlab-exercise/1 object (call normalize() on it).
 */
export function patternExercise(pattern, bars, opts = {}) {
  const ev = pattern.events;
  const out = bars.map((name) => {
    const chord = parseChord(name), root = lhRoot(chord), flats = flatsFor(chord);
    return { rh: [], lh: ev.map((e) => ({ t: e.t, d: e.d || 1, n: [spell(root + e.deg, flats)], f: e.f ? [e.f] : [], stac: !!e.stac, sug: false })), chord: name };
  });
  return {
    $format: 'jazzlab-exercise/1',
    id: opts.id || `pat-${pattern.id}`,
    course: opts.course || 'blues', step: 0, number: 0,
    title: opts.title || pattern.title,
    about: opts.about || pattern.about || null,
    time: [4, 4],
    tempo: { start: opts.tempo || pattern.tempo || 60, target: opts.tempo || pattern.tempo || 60 },
    swing: opts.swing !== undefined ? !!opts.swing : !!pattern.swing,
    rhythm: pattern.rhythm || null,
    dyn: [{ bar: 0, mark: 'mf', level: 0.75 }],
    bars: out,
    passAnyTempo: true, kicker: opts.kicker || null, back: opts.back || '#/'
  };
}

/** Left-hand notes (MIDI) of a pattern in one bar of a chord: [{ t, d, m, f }]. */
export function patternBar(pattern, chordName) {
  const chord = parseChord(chordName), root = lhRoot(chord);
  return pattern.events.map((e) => ({ t: e.t, d: e.d || 1, m: root + e.deg, f: e.f || 0, stac: !!e.stac }));
}

/** Expected MIDI set at a slot of a form bar. */
export function expectedAtSlot(pattern, chordName, slot) {
  return new Set(patternBar(pattern, chordName).filter((e) => e.t === slot).map((e) => e.m));
}

export const noteNameOf = (m) => midiToName(m);
