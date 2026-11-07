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
  // the major third and major seventh of a chord with a natural root are sharps even in a flat key (D7: F#, not Gb)
  if ([4, 11].includes(pc) && !/b/.test(chord.root)) return spell(m, false);
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
 * opts.minorToMajor (a lick written over a minor / dorian sound): the mirror case, the minor 3rd becomes 4 over a chord
 * with a major third and no minor one (Cm7 dorian over Dbmaj7: Fb → F, over G7: Bb → B). Degrees above 12 keep their octave.
 */
export function fitDeg(deg, chord, opts = {}) {
  const o = chord.offsets, pc = ((deg % 12) + 12) % 12, oct = deg - pc;
  if (opts.minorToMajor && pc === 3 && o.includes(4) && !o.includes(3)) return oct + 4;
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
  const lead = pattern.voicing === 'lead';
  let prev = opts.prev || null; // a voice-led pattern: the shell pair of the previous bar
  const out = bars.map((name) => {
    if (lead) {
      // one event per pattern event, its notes from patternBar (low → high, fingers by pitch)
      const pb = patternBar(pattern, name, { prev }); prev = pb.pair;
      return {
        rh: [],
        lh: ev.map((e, i) => {
          const notes = pb.filter((x) => x.ev === i).sort((a, b) => a.m - b.m);
          return { t: e.t, d: e.d || 1, n: notes.map((x) => patSpell(x.m, x.deg, parseChord(x.chord), !!opts.flats)), f: notes.map((x) => x.f).filter(Boolean), stac: !!e.stac, sug: false };
        }),
        chord: name
      };
    }
    return {
      rh: [],
      lh: ev.map((e) => {
        const chord = parseChord(chordAt(name, e.t)), root = lhRoot(chord);
        return { t: e.t, d: e.d || 1, n: evDegs(e).map((g0) => { const g = fitDeg(g0, chord); return patSpell(root + g, g, chord, !!opts.flats); }), f: evFingers(e), stac: !!e.stac, sug: false };
      }),
      chord: name
    };
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

// ---------- voice leading (pattern "voicing": "lead") ----------
// The root stays lhRoot; a two-note event (the shell: third + seventh) is placed in the window C3..B3 (48..59), each note's
// octave chosen so the pair is closest (sum of semitone moves, low note to low note, high to high) to the previous pair.
// The first pair of a sequence is measured against root + the fitted degrees (as p3 plays them), each moved by octaves
// into the window. The window is exactly one octave, so every pitch class has one place in it: Gm7 → F3 Bb3,
// C7 → E3 Bb3, Fmaj7 → E3 A3 (one note moves at a time). `prev` is kept so a wider window would just work.
export const LEAD_LO = 48, LEAD_HI = 59;
const intoWindow = (m) => { let x = m; while (x < LEAD_LO) x += 12; while (x > LEAD_HI) x -= 12; return x; };
const inWindow = (pc) => { const out = []; for (let m = LEAD_LO; m <= LEAD_HI; m++) if (((m % 12) + 12) % 12 === pc) out.push(m); return out; };
/**
 * The voice-led shell pair of a chord: degs = the two fitted degrees, prev = the previous pair (MIDI) or null.
 * Returns the two MIDI notes in the order of degs.
 */
export function leadPair(degs, chord, prev) {
  const root = lhRoot(chord);
  const ref = (prev && prev.length === 2 ? prev : degs.map((g) => intoWindow(root + g))).slice().sort((a, b) => a - b);
  const [ca, cb] = degs.map((g) => inWindow((((chord.pc + g) % 12) + 12) % 12));
  let best = null, bestCost = Infinity;
  ca.forEach((a) => cb.forEach((b) => {
    if (a === b) return;
    const s = [a, b].sort((x, y) => x - y);
    const cost = Math.abs(s[0] - ref[0]) + Math.abs(s[1] - ref[1]) + (Math.abs(a + b - 107) / 1000); // tie → nearer the window centre
    if (cost < bestCost) { bestCost = cost; best = [a, b]; }
  }));
  return best;
}

/**
 * Left-hand notes (MIDI) of a pattern in one form bar: [{ t, d, m, f, stac, deg, chord, ev }], one entry per note
 * (a two-note event gives two entries with the same t, d; ev = the event index). chord = the chord name at that slot.
 * A voice-led pattern ("voicing": "lead") places its two-note events by leadPair(), following opts.prev (the previous
 * bar's pair); the second chord of a two-chord bar follows the first. The returned array has .pair = the last pair
 * used (or opts.prev when the bar has none), to pass as prev to the next bar.
 */
export function patternBar(pattern, barName, opts = {}) {
  const lead = pattern.voicing === 'lead';
  let prev = opts.prev || null;
  const pairs = {}; // chord slot (0 | 1) -> pair, computed in time order
  const order = pattern.events.map((e, i) => i).sort((a, b) => pattern.events[a].t - pattern.events[b].t);
  const res = [];
  order.forEach((i) => {
    const e = pattern.events[i];
    const name = chordAt(barName, e.t), chord = parseChord(name), root = lhRoot(chord), fs = evFingers(e);
    const degs = evDegs(e).map((g0) => fitDeg(g0, chord));
    const key = barChords(barName).length > 1 && e.t >= 4 ? 1 : 0;
    const shellEv = lead ? pattern.events.find((x) => evDegs(x).length === 2) : null;
    const pairOf = () => { if (!pairs[key]) { pairs[key] = leadPair(evDegs(shellEv).map((g0) => fitDeg(g0, chord)), chord, prev); prev = pairs[key]; } return pairs[key]; };
    if (lead && degs.length === 2) {
      const ms = pairOf(), hiF = [...fs].sort((a, b) => b - a); // lower note takes the larger finger (2), upper the smaller (1)
      const lowFirst = ms[0] < ms[1];
      degs.forEach((g, k) => {
        const isLow = (k === 0) === lowFirst;
        res.push({ t: e.t, d: e.d || 1, m: ms[k], f: (isLow ? hiF[0] : hiF[1]) || 0, stac: !!e.stac, deg: g, chord: name, ev: i });
      });
    } else {
      // a voice-led root stays below its shell (D7: the pair C3 F#3 sits under D3, so the root drops to D2)
      let r = root;
      if (lead && shellEv && degs.length === 1 && degs[0] === 0) { const lo = Math.min(...pairOf()); while (r >= lo) r -= 12; }
      degs.forEach((g, k) => res.push({ t: e.t, d: e.d || 1, m: r + g, f: fs[k] || 0, stac: !!e.stac, deg: g, chord: name, ev: i }));
    }
  });
  res.sort((a, b) => a.t - b.t || a.ev - b.ev);
  res.pair = prev;
  return res;
}

/** patternBar over a sequence of bars, threading the voice-led pair from bar to bar: one array per bar. */
export function patternBars(pattern, bars, opts = {}) {
  let prev = opts.prev || null;
  return bars.map((name) => { const pb = patternBar(pattern, name, { prev }); prev = pb.pair; return pb; });
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
 * With a chord whose fifth is flat (m7b5, dim7) deg 6 is that b5 and stays a flat (Ab over Dm7b5).
 */
export function lickSpell(m, deg, chord = null) {
  const b5 = chord && chord.offsets.includes(6) && !chord.offsets.includes(7);
  return spell(m, ((deg % 12) + 12) % 12 !== 6 || !!b5);
}

/**
 * Lick notes over a chord (MIDI): [{ t: 0..15, d, m, f, stac, deg, name }]. A two-chord bar uses its first chord.
 * Each degree is fitted to the chord quality (fitDeg); a dorian lick (lick.scale === 'dorian') also turns its minor 3rd
 * major over a chord with a major third. deg = the fitted degree, name = the note spelled with lickSpell.
 */
export function lickNotes(lick, chordName) {
  const chord = parseChord(barChords(chordName)[0]), root = rhRoot(chord);
  const fit = { minorToMajor: lick.scale === 'dorian' };
  return lick.events.map((e) => {
    const deg = fitDeg(e.deg, chord, fit), m = root + deg;
    return { t: e.t, d: e.d || 1, m, f: e.f || 0, stac: !!e.stac, deg, name: lickSpell(m, deg, chord) };
  }).sort((a, b) => a.t - b.t);
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
    rh: evs.map((e) => ({ t: e.t, d: e.d, n: [e.name], f: e.f ? [e.f] : [], stac: e.stac, sug: false })),
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

// ---------- licks over a progression (lick.prog + item.keys) ----------
// A key-relative lick carries prog = one chord string per bar, written in F (the tonic); deg is counted from the tonic.
// The tonic of a key sits in C4..B4 (keyTonic = 60 + pc: F -> F4 65, Bb -> Bb4 70). This deliberately differs from
// rhRoot (which puts Bb at Bb3): the phrase stays in the same hand position when it moves from F up to Bb.

/** Tonic of a key for the right hand: C4..B4. */
export const keyTonic = (key) => 60 + parseChord(key).pc;

/** Transpose a bar of chords by semis, keeping each quality; black-key roots are spelled with flats: transposeChord('Gm7 C7', 5) = 'Cm7 F7'. */
export function transposeChord(name, semis) {
  return barChords(name).map((c) => {
    const p = parseChord(c), pc = (((p.pc + semis) % 12) + 12) % 12;
    return ([1, 3, 6, 8, 10].includes(pc) ? FLAT_NAMES : SHARP_NAMES)[pc] + p.qual;
  }).join(' ');
}

/** A key-relative lick's notes in a key, over its 2 bars: [{ t: 0..15, d, m, f, stac, deg, name }] (name spelled with flats: Bb, Eb; E, A stay natural). */
export function lickKeyNotes(lick, key) {
  const tonic = keyTonic(key);
  return lick.events.map((e) => ({ t: e.t, d: e.d || 1, m: tonic + e.deg, f: e.f || 0, stac: !!e.stac, deg: e.deg, name: spell(tonic + e.deg, true) }))
    .sort((a, b) => a.t - b.t);
}

/**
 * A key-relative lick in a key: { bars: [{ rh: [...], lh: [...] }], chords: [...] }. rh = the notes of each bar (t 0..7, as
 * lickKeyNotes), chords = lick.prog transposed from F to the key, lh = the pattern's notes over them (patternBars, voice-led
 * from bar to bar; [] without a pattern).
 */
export function lickOverKey(lick, key, pattern = null) {
  const semis = keyTonic(key) - keyTonic('F');
  const chords = (lick.prog || []).map((c) => transposeChord(c, semis));
  const nb = Math.max(lick.bars || 2, chords.length);
  const rh = Array.from({ length: nb }, () => []);
  lickKeyNotes(lick, key).forEach((e) => {
    const b = Math.min(nb - 1, Math.floor(e.t / 8)), t = e.t - b * 8;
    rh[b].push({ ...e, t, d: Math.max(1, Math.min(e.d, 8 - t)) });
  });
  const lh = pattern && chords.length ? patternBars(pattern, chords) : [];
  return { bars: rh.map((r, k) => ({ rh: r, lh: lh[k] || [] })), chords };
}

/**
 * A key-relative lick as a 2-bar exercise in a key: RH = the lick, LH = the pattern over lick.prog transposed to the key
 * (spelled with flats). Returns a raw jazzlab-exercise/1 object (call normalize() on it).
 */
export function lickExerciseKey(lick, key, pattern, opts = {}) {
  const { bars: kb, chords } = lickOverKey(lick, key);
  const lhBars = pattern ? patternExercise(pattern, chords, { flats: true }).bars : chords.map(() => ({ lh: [] }));
  const bars = kb.map((b, k) => ({
    rh: b.rh.map((e) => ({ t: e.t, d: e.d, n: [e.name], f: e.f ? [e.f] : [], stac: e.stac, sug: false })),
    lh: (lhBars[k] || { lh: [] }).lh,
    chord: chords[k] || chords[chords.length - 1]
  }));
  const tempo = opts.tempo || lick.tempo || 66;
  return {
    $format: 'jazzlab-exercise/1',
    id: opts.id || `lick-${lick.id}-${key.toLowerCase()}`,
    course: opts.course || 'std', step: 0, number: 0,
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

/**
 * The ii–V–I places of a form for a key-relative lick: [[k, k + 1], ...], scanning left to right, non-overlapping.
 * A pair is bar k with two chords (a minor 7th then a dominant 7th: "Gm7 C7") followed by bar k + 1 with one chord whose
 * root is a fourth above the dominant (V -> I: C7 -> F; the ii is a fourth below the V: Gm7 -> C7) and which is major
 * (maj7, 6 or a triad). key = that root.
 * std-f: bars (1,2) (3,4) (7,8) (9,10) (11,12) (25,26) (27,28) (30,31) in F and (16,17) (18,19) in Bb (0-based);
 * "Gm7 C7 | Gm7" (21,22) is not a resolution.
 */
export function iivPairs(bars) {
  const out = [];
  for (let k = 0; k + 1 < bars.length; k++) {
    const a = barChords(bars[k]), b = barChords(bars[k + 1]);
    if (a.length !== 2 || b.length !== 1) continue;
    const [ii, v] = a.map(parseChord), one = parseChord(b[0]);
    if (ii.qual !== 'm7' || v.qual !== '7' || !['maj7', '6', ''].includes(one.qual)) continue;
    if ((v.pc + 5) % 12 !== one.pc || (ii.pc + 5) % 12 !== v.pc) continue;
    out.push({ bars: [k, k + 1], key: one.root });
    k++;
  }
  return out;
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
