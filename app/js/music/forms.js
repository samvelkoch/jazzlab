// Chords, left-hand patterns and forms. A pattern is written once, relative to the chord root
// (semitone offsets + fingers); over a chord sequence it unfolds into a normal exercise
// (jazzlab-exercise/1), so the exercise screen, MIDI scoring and export all work unchanged.
import { SHARP_NAMES, midiToName, toMidi } from './notes.js';

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
 * Left-hand pattern spelling: the chord's own spelling, but the b3 and b7 are always flats (Bb over C7, not A#),
 * and so is the b5 of a m7b5 / dim chord (Ab over Dm7b5, not G#). flats = true forces flats (a form in a flat key).
 */
export const patSpell = (m, deg, chord, flats = false) => {
  const pc = ((deg % 12) + 12) % 12;
  return spell(m, flats || flatsFor(chord) || [3, 10].includes(pc) || (pc === 6 && chord.offsets.includes(6) && !chord.offsets.includes(7)));
};

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
export const chordNames = (name, flats = false) => { const c = parseChord(name); return c.offsets.map((o) => patSpell(60 + c.pc + o, o, c, flats).replace(/-?\d+$/, '')); };

// a pattern event's notes: deg may be a number or an array (several notes at once), f the same shape
const evDegs = (e) => (Array.isArray(e.deg) ? e.deg : [e.deg]);
/**
 * Fit a pattern degree to the chord quality: patterns are written over a dominant 7th (3rd = 4, 7th = 10);
 * over a minor chord the 3rd becomes 3 (Dm7: F, not F#), over a maj7 the 7th becomes 11, over m7b5/dim the 5th becomes 6.
 */
export function fitDeg(deg, chord) {
  const o = chord.offsets, pc = ((deg % 12) + 12) % 12, oct = deg - pc;
  if (pc === 4 && o.includes(3) && !o.includes(4)) return oct + 3;
  if (pc === 10 && o.includes(11)) return oct + 11;
  if (pc === 10 && o.includes(9) && !o.includes(10) && chord.qual === 'dim7') return oct + 9;
  if (pc === 7 && o.includes(6) && !o.includes(7)) return oct + 6;
  return deg;
}
const evFingers = (e) => (Array.isArray(e.f) ? e.f : e.f ? [e.f] : []);

/**
 * Unfold a pattern over a chord sequence.
 * pattern: { id, title, bars: 1, events: [{ t, d, deg, f, stac? }] } — deg = semitones above the root
 * (or an array of them, played together, with f an array of the same length).
 * bars: ['C7', 'F7', 'C7 A7', ...] one or two chords per bar (an event at t < 4 uses the first, t >= 4 the second).
 * opts.flats = spell every note with flats (the form's `flats`, a flat key like Blue Bossa).
 * Returns a raw jazzlab-exercise/1 object (call normalize() on it).
 */
export function patternExercise(pattern, bars, opts = {}) {
  const ev = pattern.events;
  const out = bars.map((name) => ({
    rh: [],
    lh: ev.map((e) => {
      const chord = parseChord(chordAt(name, e.t)), root = lhRoot(chord);
      return { t: e.t, d: e.d || 1, n: evDegs(e).map((g0) => { const g = fitDeg(g0, chord); return patSpell(root + g, g, chord, !!opts.flats); }), f: evFingers(e), stac: !!e.stac, sug: false };
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
    const chord = parseChord(name);
    return evDegs(e).map((g0, i) => { const g = fitDeg(g0, chord); return { t: e.t, d: e.d || 1, m: root + g, f: fs[i] || 0, stac: !!e.stac, deg: g, chord: name }; });
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
  const lh = pattern ? patternExercise(pattern, [chordName], { flats: opts.flats }).bars[0].lh : []; // multi-note events stay one event
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

// ---------- melodies (jazzlab-melody/1) ----------
// A melody is written out in absolute pitches, one entry per form bar: bars[i] = { chord, rh: [{ t, d, n, f }] },
// n = one pitch name in the form's key (flats). phrases = [[firstBar, lastBar], ...] = the echo chunks.

/** Right-hand notes of melody bar k (MIDI): [{ t, d, m, f, name }], sorted by t. An empty or missing bar gives []. */
export function melodyBarNotes(melody, k) {
  const b = melody.bars[k];
  return (b && b.rh ? b.rh : []).map((e) => ({ t: e.t, d: e.d || 1, m: toMidi(e.n), f: e.f || 0, name: e.n }))
    .sort((a, b2) => a.t - b2.t);
}

/** Notes of a phrase [from, to] over its bars: [{ t: 0..(bars*8-1), d, m, f, name, bar }] (t counted from the phrase start). */
export function melodyNotes(melody, [from, to]) {
  const out = [];
  for (let k = from; k <= to; k++) melodyBarNotes(melody, k).forEach((e) => out.push({ ...e, t: (k - from) * 8 + e.t, bar: k }));
  return out;
}

/**
 * Bars [from, to] of a melody as an exercise: right hand = the melody, left hand = the pattern over each bar's chord
 * (spelled with flats unless opts.flats === false). Returns a raw jazzlab-exercise/1 object (call normalize() on it).
 */
export function melodyExercise(melody, [from, to], pattern, opts = {}) {
  const src = melody.bars.slice(from, to + 1);
  const chords = src.map((b) => b.chord);
  const lhBars = pattern ? patternExercise(pattern, chords, { flats: opts.flats !== false }).bars : chords.map(() => ({ lh: [] }));
  const bars = src.map((b, k) => ({
    rh: (b.rh || []).map((e) => ({ t: e.t, d: e.d || 1, n: [e.n], f: e.f ? [e.f] : [], stac: false, sug: false })),
    lh: lhBars[k].lh,
    chord: b.chord
  }));
  const tempo = melody.tempo || 66;
  return {
    $format: 'jazzlab-exercise/1',
    id: opts.id || `mel-${melody.id}-${from}-${to}`,
    course: opts.course || 'blues', step: 0, number: 0,
    title: opts.title || melody.title,
    about: opts.about || melody.about || null,
    time: [4, 4],
    tempo: { start: opts.tempo || Math.max(40, tempo - 10), target: tempo },
    swing: false,
    rhythm: null,
    dyn: [{ bar: 0, mark: 'mf', level: 0.75 }],
    bars,
    passAnyTempo: true, kicker: opts.kicker || null, back: opts.back || '#/', doneId: opts.doneId || null, byEar: true
  };
}
