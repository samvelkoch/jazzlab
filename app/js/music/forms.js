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
/** Left-hand pattern spelling: the chord's own spelling, but the b3 and b7 are always flats (Bb over C7, not A#). */
export const patSpell = (m, deg, chord) => spell(m, flatsFor(chord) || [3, 10].includes(((deg % 12) + 12) % 12));

/**
 * Root for the left hand: keep it between F2 (41) and E3 (52) so the hand stays in one place.
 * C -> C3 (48), F -> F2 (41), G -> G2 (43), Bb -> Bb2 (46), Eb -> Eb3 (51).
 */
export const lhRoot = (chord) => (chord.pc >= 5 ? 36 + chord.pc : 48 + chord.pc);

/**
 * The chords of one form bar: "C7" -> ["C7"], "C7 A7" -> ["C7", "A7"] (two chords: the first covers
 * slots 0..3, the second slots 4..7). Throws on an unknown chord.
 */
export function barChords(name) {
  const out = String(name).trim().split(/\s+/);
  if (out.length > 2) throw new Error('Too many chords in a bar: ' + name);
  out.forEach(parseChord);
  return out;
}
/** The chord name that sounds at eighth slot t of a bar. */
export const chordAt = (barName, t) => { const c = barChords(barName); return c[c.length > 1 && t >= 4 ? 1 : 0]; };

/** Chord tones as names, spelled like the left-hand pattern: A7 = A C# E G, C7 = C E G Bb, Dm7 = D F A C. */
export const chordNames = (name) => { const c = parseChord(name); return c.offsets.map((o) => patSpell(60 + c.pc + o, o, c).replace(/-?\d+$/, '')); };

// a pattern event's notes: deg may be a number or an array (several notes at once), f the same shape
const evDegs = (e) => (Array.isArray(e.deg) ? e.deg : [e.deg]);
const evFingers = (e) => (Array.isArray(e.f) ? e.f : e.f ? [e.f] : []);

/**
 * Unfold a pattern over a chord sequence.
 * pattern: { id, title, bars: 1, events: [{ t, d, deg, f, stac? }] } — deg = semitones above the root
 * (or an array of them, played together, with f an array of the same length).
 * bars: ['C7', 'F7', 'C7 A7', ...] one or two chords per bar (an event at t < 4 uses the first, t >= 4 the second).
 * Returns a raw jazzlab-exercise/1 object (call normalize() on it).
 */
export function patternExercise(pattern, bars, opts = {}) {
  const ev = pattern.events;
  const out = bars.map((name) => ({
    rh: [],
    lh: ev.map((e) => {
      const chord = parseChord(chordAt(name, e.t)), root = lhRoot(chord);
      return { t: e.t, d: e.d || 1, n: evDegs(e).map((g) => patSpell(root + g, g, chord)), f: evFingers(e), stac: !!e.stac, sug: false };
    }),
    chord: name
  }));
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

/**
 * Left-hand notes (MIDI) of a pattern in one form bar: [{ t, d, m, f, stac, deg, chord }], one entry per note
 * (a two-note event gives two entries with the same t, d). chord = the chord name at that slot.
 */
export function patternBar(pattern, barName) {
  return pattern.events.flatMap((e) => {
    const name = chordAt(barName, e.t), root = lhRoot(parseChord(name)), fs = evFingers(e);
    return evDegs(e).map((g, i) => ({ t: e.t, d: e.d || 1, m: root + g, f: fs[i] || 0, stac: !!e.stac, deg: g, chord: name }));
  });
}

/** Expected MIDI set at a slot of a form bar. */
export function expectedAtSlot(pattern, barName, slot) {
  return new Set(patternBar(pattern, barName).filter((e) => e.t === slot).map((e) => e.m));
}

export const noteNameOf = (m) => midiToName(m);

// ---------- right-hand licks (jazzlab-lick/1) ----------
// A lick is a 2-bar phrase written relative to the chord root: events { t: 0..15 (eighths over 2 bars), d, deg, f, stac? }.

/** Root for the right hand: C -> C4 (60), F -> F4 (65), G -> G4 (67), A -> A3 (57). */
export const rhRoot = (chord) => (chord.pc <= 7 ? 60 + chord.pc : 48 + chord.pc);

/**
 * Blues spelling for a lick note: flats for the blue notes (b3, b7: Eb, Bb over C), except the
 * passing #4 (deg 6), which leads up to the fifth and is written as a sharp (F# over C, C# over G).
 */
export function lickSpell(m, deg) {
  return spell(m, ((deg % 12) + 12) % 12 !== 6);
}

/** Lick notes over a chord (MIDI): [{ t: 0..15, d, m, f, stac, deg }]. A two-chord bar uses its first chord. */
export function lickNotes(lick, chordName) {
  const root = rhRoot(parseChord(barChords(chordName)[0]));
  return lick.events.map((e) => ({ t: e.t, d: e.d || 1, m: root + e.deg, f: e.f || 0, stac: !!e.stac, deg: e.deg }))
    .sort((a, b) => a.t - b.t);
}

/** Split lick notes into its two bars: [[bar 1 events, t 0..7], [bar 2 events, t 0..7]]. */
export function lickBars(lick, chordName) {
  const out = [[], []];
  lickNotes(lick, chordName).forEach((e) => {
    const b = Math.min(1, Math.floor(e.t / 8)), t = e.t - b * 8;
    out[b].push({ ...e, t, d: Math.max(1, Math.min(e.d, 8 - t)) });
  });
  return out;
}

/**
 * A lick over one chord as a 2-bar exercise: right hand = the lick, left hand = the pattern in both bars.
 * Returns a raw jazzlab-exercise/1 object (call normalize() on it).
 */
export function lickExercise(lick, chordName, pattern, opts = {}) {
  const lh = pattern ? patternExercise(pattern, [chordName]).bars[0].lh : []; // multi-note events stay one event
  const bars = lickBars(lick, chordName).map((evs) => ({
    rh: evs.map((e) => ({ t: e.t, d: e.d, n: [lickSpell(e.m, e.deg)], f: e.f ? [e.f] : [], stac: e.stac, sug: false })),
    lh: lh.map((e) => ({ ...e, n: e.n.slice(), f: e.f.slice() })),
    chord: chordName
  }));
  const tempo = opts.tempo || lick.tempo || 66;
  return {
    $format: 'jazzlab-exercise/1',
    id: opts.id || `lick-${lick.id}-${chordName.toLowerCase()}`,
    course: opts.course || 'blues', step: 0, number: 0,
    title: opts.title || lick.title,
    about: opts.about || lick.about || null,
    time: [4, 4],
    tempo: { start: tempo, target: tempo },
    swing: opts.swing !== undefined ? !!opts.swing : !!lick.swing,
    rhythm: null,
    dyn: [{ bar: 0, mark: 'mf', level: 0.75 }],
    bars,
    passAnyTempo: true, kicker: opts.kicker || null, back: opts.back || '#/', doneId: opts.doneId || null
  };
}
