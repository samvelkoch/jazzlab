// Relative ear training, the pure part (no DOM, no audio): the levels of the four games, question generation with an
// injectable RNG, answer checking and round grading. The screen is app/js/screens/ear-rel.js.
//   hilo      two notes: is the second higher or lower (later: the same)? The gap narrows over the rounds.
//   interval  two notes, melodic up / down or together: name the interval, or play the second note.
//   quality   a chord: major / minor, then maj7 / m7 / 7, then m7b5. Name it or play its root-position shape.
//   prog      ii-V-I: major or minor? Then: which of three chords is the V?
// An item in a track is { kind: 'ear', game, level, rounds, pass: { acc } }; the level picks the set below.

export const GAMES = ['hilo', 'interval', 'quality', 'prog'];
export const LO = 48, HI = 84; // C3..C6, the on-screen keyboard range of the ear screens

/** mulberry32: a small seeded RNG (returns a function giving [0, 1)). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive
const choice = (rng, arr) => arr[Math.floor(rng() * arr.length)];

// ---------- levels ----------
const IV_BASIC = [3, 4, 5, 7, 10, 11, 12];       // m3 M3 P4 P5 m7 M7 P8
const IV_ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const LEVELS = {
  hilo: [
    { gaps: [12, 5], same: false },               // 1: wide gaps, narrowing to a fourth
    { gaps: [6, 1], same: false },                // 2: narrowing down to a semitone
    { gaps: [4, 1], same: true },                 // 3: close notes, and sometimes the same note
  ],
  interval: [
    { set: [3, 4], dir: 'asc' },                  // 1: m3 vs M3
    { set: [3, 4, 5, 7], dir: 'asc' },            // 2: + P4, P5
    { set: IV_BASIC, dir: 'asc' },                // 3: + m7, M7, octave
    { set: IV_ALL, dir: 'asc' },                  // 4: the rest
    { set: IV_BASIC, dir: 'desc' },               // 5: going down
    { set: IV_ALL, dir: 'desc' },                 // 6: going down, all
    { set: IV_BASIC, dir: 'harm' },               // 7: together
  ],
  quality: [
    { set: ['maj', 'min'] },                      // 1: triads
    { set: ['maj7', 'm7', '7'] },                 // 2: sevenths
    { set: ['maj7', 'm7', '7', 'm7b5'] },         // 3: + half-diminished
  ],
  prog: [
    { ask: 'mode' },                              // 1: ii-V-I, major or minor?
    { ask: 'five' },                              // 2: which of three chords is the V?
  ],
};
export const levelCount = (game) => (LEVELS[game] || []).length;
/** The level object of a game (1-based; clamped). */
export function levelOf(game, n = 1) {
  const ls = LEVELS[game];
  if (!ls) throw new Error('unknown ear game: ' + game);
  return ls[Math.max(0, Math.min(ls.length - 1, (n | 0) - 1))];
}

export const IV_SHORT = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];
export const QUALITIES = {
  maj: { tones: [0, 4, 7], sym: '' },
  min: { tones: [0, 3, 7], sym: 'm' },
  maj7: { tones: [0, 4, 7, 11], sym: 'maj7' },
  m7: { tones: [0, 3, 7, 10], sym: 'm7' },
  7: { tones: [0, 4, 7, 10], sym: '7' },
  m7b5: { tones: [0, 3, 6, 10], sym: 'm7b5' },
};

/** The answer options of a level, in the order of the buttons. */
export function optionsOf(game, n = 1) {
  const lv = levelOf(game, n);
  if (game === 'hilo') return lv.same ? ['up', 'down', 'same'] : ['up', 'down'];
  if (game === 'interval') return [...lv.set].sort((a, b) => a - b);
  if (game === 'quality') return [...lv.set];
  if (game === 'prog') return lv.ask === 'mode' ? ['major', 'minor'] : [0, 1, 2];
  throw new Error('unknown ear game: ' + game);
}

// ---------- questions ----------
/** hilo: a = first note, b = second; answer 'up' | 'down' | 'same'. The gap goes from gaps[0] to gaps[1] over the rounds k = 0..N-1. */
export function makeHiLo(level, k, N, rng = Math.random) {
  const lv = levelOf('hilo', level);
  const [g0, g1] = lv.gaps;
  const frac = N > 1 ? k / (N - 1) : 1;
  const gap = Math.max(g1, Math.round(g0 + (g1 - g0) * frac));
  if (lv.same && rng() < 0.25) {
    const a = randInt(rng, 55, 79);
    return { game: 'hilo', a, b: a, notes: [a, a], gap: 0, answer: 'same' };
  }
  const up = rng() < 0.5;
  const a = up ? randInt(rng, Math.max(LO + 4, 55), HI - gap - 4) : randInt(rng, LO + gap + 4, Math.min(HI - 4, 79));
  const b = up ? a + gap : a - gap;
  return { game: 'hilo', a, b, notes: [a, b], gap, answer: up ? 'up' : 'down' };
}

/** interval: first = the given note, second = the note to name or play. dir 'asc' | 'desc' | 'harm' (harm: first is the lower note). */
export function makeInterval(level, rng = Math.random, prev = null) {
  const lv = levelOf('interval', level);
  let semis, guard = 0;
  do { semis = choice(rng, lv.set); } while (lv.set.length > 1 && prev && semis === prev.semis && guard++ < 50);
  const desc = lv.dir === 'desc';
  const first = desc ? randInt(rng, LO + semis, 79) : randInt(rng, 55, Math.min(76, HI - semis));
  const second = desc ? first - semis : first + semis;
  return { game: 'interval', dir: lv.dir, first, second, semis, harmonic: lv.dir === 'harm', notes: [first, second], answer: semis };
}

/** quality: a chord on a root (root position, root in C3..B3). notes are the chord tones, bottom first. */
export function makeQuality(level, rng = Math.random, prev = null) {
  const lv = levelOf('quality', level);
  let quality, guard = 0;
  do { quality = choice(rng, lv.set); } while (lv.set.length > 1 && prev && quality === prev.quality && guard++ < 50);
  const root = randInt(rng, 48, 59);
  return { game: 'quality', quality, root, notes: QUALITIES[quality].tones.map((x) => root + x), answer: quality };
}

// ---------- progressions ----------
const PC_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const pcName = (pc) => PC_NAMES[((pc % 12) + 12) % 12];
/** Close voicing: bass (C2..B2) + three upper tones (3rd, 5th, 7th), the inversion nearest to `around` (the previous mean). */
export function voiceChord(rootPc, quality, around = 64) {
  const tones = QUALITIES[quality].tones.slice(1).map((x) => (rootPc + x) % 12); // 3rd 5th 7th
  let best = null;
  const up = (from, pc) => from + ((((pc - from) % 12) + 12) % 12 || 12); // the next pc above `from`
  for (let rot = 0; rot < 3; rot++) {
    const order = [tones[rot], tones[(rot + 1) % 3], tones[(rot + 2) % 3]];
    const lowest = 52 + ((((order[0] - 52) % 12) + 12) % 12);
    for (const n1 of [lowest - 12, lowest, lowest + 12]) {
      const n2 = up(n1, order[1]), n3 = up(n2, order[2]);
      const notes = [n1, n2, n3];
      const mean = (n1 + n2 + n3) / 3;
      const cost = Math.abs(mean - around) + (n1 < 52 ? 8 : 0) + (n3 > 76 ? 8 : 0);
      if (!best || cost < best.cost) best = { cost, notes, mean };
    }
  }
  return { bass: 36 + rootPc, upper: best.notes, mean: best.mean };
}
/** A progression in key `keyPc`: ii-V-I (major) or iiø-V7-i (minor). Chords: { pc, quality, deg }. */
export function iiVI(mode, keyPc) {
  return mode === 'minor'
    ? [{ pc: (keyPc + 2) % 12, quality: 'm7b5', deg: 'iiø' }, { pc: (keyPc + 7) % 12, quality: '7', deg: 'V' }, { pc: keyPc, quality: 'm7', deg: 'i' }]
    : [{ pc: (keyPc + 2) % 12, quality: 'm7', deg: 'ii' }, { pc: (keyPc + 7) % 12, quality: '7', deg: 'V' }, { pc: keyPc, quality: 'maj7', deg: 'I' }];
}
const OTHER_MAJOR = [{ off: 0, quality: 'maj7', deg: 'I' }, { off: 2, quality: 'm7', deg: 'ii' }, { off: 5, quality: 'maj7', deg: 'IV' }, { off: 9, quality: 'm7', deg: 'vi' }];
/** The three chords of a prog question, voiced with smooth voice leading. */
export function voiceProg(chords) {
  let around = 64;
  return chords.map((c) => { const v = voiceChord(c.pc, c.quality, around); around = v.mean; return { ...v, pc: c.pc, quality: c.quality, deg: c.deg }; });
}
/** prog level 1: answer 'major' | 'minor'. Level 2: three chords, exactly one is the V7; answer = its index 0..2. */
export function makeProg(level, rng = Math.random, prev = null) {
  const lv = levelOf('prog', level);
  const keyPc = randInt(rng, 0, 11);
  if (lv.ask === 'mode') {
    const mode = prev && rng() < 0.3 ? prev.mode : rng() < 0.5 ? 'major' : 'minor';
    const chords = iiVI(mode, keyPc);
    return { game: 'prog', ask: 'mode', mode, keyPc, chords, answer: mode };
  }
  // which is the V: two non-dominant major-key chords and the V7 in a random place
  const pool = OTHER_MAJOR.slice();
  const a = pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const b = pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const at = randInt(rng, 0, 2);
  const slots = [a, b];
  slots.splice(at, 0, { off: 7, quality: '7', deg: 'V' });
  const chords = slots.map((s) => ({ pc: (keyPc + s.off) % 12, quality: s.quality, deg: s.deg }));
  return { game: 'prog', ask: 'five', keyPc, chords, answer: at };
}

/** One question for round k of N. `prev` = the previous question of the same game (to avoid repeats). */
export function makeQuestion(game, level, k, N, rng = Math.random, prev = null) {
  if (game === 'hilo') return makeHiLo(level, k, N, rng);
  if (game === 'interval') return makeInterval(level, rng, prev);
  if (game === 'quality') return makeQuality(level, rng, prev);
  if (game === 'prog') return makeProg(level, rng, prev);
  throw new Error('unknown ear game: ' + game);
}

// ---------- answers ----------
/** Answer by a button (interval: semitones, quality: id, hilo: 'up'|'down'|'same', prog: mode or index). */
export const checkChoice = (q, ans) => ans === q.answer;
/** Answer by playing the second note of an interval question (the exact key). */
export const checkNote = (q, midi) => q.game === 'interval' && midi === q.second;
/** Answer by playing the chord's shape: the pressed keys' pitch classes must be exactly the chord's. Null while too few keys are down. */
export function checkShape(q, pressed) {
  const want = new Set(q.notes.map((m) => m % 12));
  const got = new Set([...pressed].map((m) => m % 12));
  if (got.size < want.size) return null;
  return got.size === want.size && [...want].every((x) => got.has(x));
}
/** The name of the interval between two notes, by semitones (0..12; a bigger gap is folded to the octave range). */
export const intervalShort = (a, b) => { const d = Math.abs(b - a); return IV_SHORT[d > 12 ? (d % 12 || 12) : d]; };

// ---------- grading ----------
/** ok = first try without a replay; meh = found with at most `maxMeh` slips (or after a replay); miss = more slips or revealed. */
export function gradeRound({ wrong = 0, replayed = false, revealed = false }, maxMeh = 1) {
  if (revealed) return 'miss';
  if (wrong === 0 && !replayed) return 'ok';
  return wrong <= maxMeh ? 'meh' : 'miss';
}
/** The wrong answers that reveal the correct one: all but one button, or MAX_WRONG on the keys. */
export const maxWrongFor = (nButtons, cap = 4) => Math.max(1, Math.min(cap, nButtons - 1));
/** Accuracy of a log of 'ok' | 'meh' | 'miss' over N rounds. */
export const accuracy = (log, N) => (N ? (log.filter((x) => x === 'ok').length + 0.5 * log.filter((x) => x === 'meh').length) / N : 0);
