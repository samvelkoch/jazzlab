// Solo (improvisation) scoring: pure functions, no DOM (testable in node). See content/FORMAT.md «Solos».
// The band plays the form, the learner plays their own right hand; the app scores four things:
// inside (notes from the bar's palette; a semitone approach into the palette counts), grid (onsets on the swing-aware
// eighth grid), phrases and rests (phrasing cells), target notes (a chord tone on the first beat of a chord change).
import { parseChord, chordAt, barChords } from './forms.js';
import { gridDev, tols } from './recording.js';
import { scalePcs, scaleOf, pcOf } from './scales.js';

export const PER = 8; // eighths per bar
export const APPROACH_E8 = 1.25; // an approach resolves within this many eighths
/** Grid tolerance: 1.5 × the form screen's "even" window (tols().tight): ≈ 0.11 s at 66 bpm. tols().win (≈ 0.2 s) would let
 *  random tapping score ≈ 77 % on a swing grid. */
export const gridTol = (bpm) => 1.5 * tols(bpm).tight;

const pcm = (m) => ((m % 12) + 12) % 12;

/** Role of a form bar: 'you' (play), 'rest' (stay silent) or 'band' (call: the band plays a phrase, you listen).
 *  phrasing { play, rest } repeats over the form; with call the first `play` bars of each cell are the band's and the
 *  `rest` bars are yours (play 2 rest 2 + call = band 2 bars, you 2 bars). phrasing null = every bar is yours. */
export function roleOf(solo, bar) {
  const ph = solo.phrasing;
  if (!ph) return 'you';
  const k = bar % (ph.play + ph.rest);
  if (solo.call) return k < ph.play ? 'band' : 'you';
  return k < ph.play ? 'you' : 'rest';
}

/** The palette at a bar / eighth slot: { pcs (scale + chord tones), chordPcs, chord (name), scale, root (pc) }. */
export function paletteAt(solo, bars, bar, slot = 0) {
  const name = chordAt(bars[bar], slot), chord = parseChord(name);
  const cp = new Set(chord.offsets.map((o) => (chord.pc + o) % 12));
  const p = solo.palette || { mode: 'chordscale' };
  let sc;
  if (p.mode === 'scale') sc = { scale: p.scale, root: pcOf(p.root) };
  else if (p.mode === 'scales') {
    const part = (p.parts || []).find((x) => bar >= x.bars[0] && bar <= x.bars[1]);
    sc = part ? { scale: part.scale, root: pcOf(part.root) } : scaleOf(chord);
  } else sc = scaleOf(chord);
  return { pcs: new Set([...scalePcs(sc.scale, sc.root), ...cp]), chordPcs: cp, chord: name, scale: sc.scale, root: sc.root };
}

/** Continuous eighth position of a time t (s from the first beat); swung off-beats sit at 2/3 of the beat (form.js posAt). */
export function slotAt(t, bpm, swing) {
  const beats = t / (60 / bpm), w = Math.floor(beats), f = beats - w, sw = swing ? 2 / 3 : 0.5;
  return 2 * w + (f < sw ? f / sw : 1 + (f - sw) / (1 - sw));
}
/** The nearest eighth (global index) of a time: a slightly early downbeat belongs to its bar. */
export const gridIndex = (t, bpm, swing) => Math.round(slotAt(t, bpm, swing)) + 0; // + 0: no -0

/** Bars of the form where a chord changes, with the eighth slot of the change: [{ bar, slot }]. Bar 0 is compared with
 *  the last bar (the form loops); a second chord on slot 4 that differs from the first is a change too. */
export function changesOf(bars) {
  const NB = bars.length, out = [];
  bars.forEach((b, k) => {
    const cs = barChords(b), prev = chordAt(bars[(k - 1 + NB) % NB], PER - 1);
    if (cs[0] !== prev) out.push({ bar: k, slot: 0 });
    if (cs.length > 1 && cs[1] !== cs[0]) out.push({ bar: k, slot: 4 });
  });
  return out;
}

/**
 * Score one chorus. notes = [{ t (s from the chorus start), m }], ctx = { solo, bars, bpm, swing }.
 * Only the learner's ('you') bars count for inside, grid, phrases, pitches and targets; notes in 'rest' and 'band' bars
 * count against rests only (a rest bar is clean when empty, or with one note on its first eighth: a phrase's tail).
 * Returns { inside, grid (0..1), phrases, rests: { ok, total }, targets: { ok, total, changes }, pitches, notes,
 *   perBar: [{ role, notes, clean, restOk, target }] }.
 */
export function scoreChorus(notes, { solo, bars, bpm, swing }) {
  const NB = bars.length, beat = 60 / bpm, e8 = beat / 2, tol = gridTol(bpm), slack = tols(bpm).win;
  const ns = notes.slice().sort((a, b) => a.t - b.t).map((n) => {
    const gi = gridIndex(n.t, bpm, swing);
    const bar = Math.max(0, Math.min(NB - 1, Math.floor(gi / PER)));
    const slot = Math.max(0, Math.min(PER - 1, gi - bar * PER));
    return { t: n.t, m: n.m, bar, slot, role: roleOf(solo, bar), pal: paletteAt(solo, bars, bar, slot) };
  });
  ns.forEach((n, i) => {
    n.inPal = n.pal.pcs.has(pcm(n.m));
    const nx = ns[i + 1];
    n.approach = !n.inPal && !!nx && nx.t - n.t <= APPROACH_E8 * e8 + 1e-9 && Math.abs(nx.m - n.m) === 1 && nx.pal.pcs.has(pcm(nx.m));
    n.inside = n.inPal || n.approach;
    n.onGrid = Math.abs(gridDev(n.t, bpm, swing)) <= tol;
  });
  const you = ns.filter((n) => n.role === 'you');
  const share = (f) => (you.length ? you.filter(f).length / you.length : 0);
  // phrases: a phrase has 3+ notes; a gap of more than a beat between onsets splits. Onsets a quarter apart (a line of
  // quarter notes) stay together: the beat gets the form's acceptance window (tols().win), so timing slack does not cut a line in two.
  let phrases = 0, run = 0;
  you.forEach((n, i) => { run = i && n.t - you[i - 1].t <= beat + slack ? run + 1 : 1; if (run === 3) phrases++; });
  const byBar = bars.map((_, k) => ns.filter((n) => n.bar === k));
  const perBar = bars.map((_, k) => {
    const role = roleOf(solo, k), bn = byBar[k];
    return {
      role, notes: bn.length,
      clean: role === 'you' ? bn.length > 0 && bn.every((n) => n.inside && n.onGrid) : null,
      restOk: role === 'you' ? null : bn.length === 0 || (bn.length === 1 && bn[0].slot === 0),
      target: null
    };
  });
  const rests = { ok: perBar.filter((b) => b.restOk === true).length, total: perBar.filter((b) => b.restOk !== null).length };
  // targets: ok / total = accuracy (a chord tone among the changes played on), changes = every change in your bars,
  // so total / changes = coverage (a change left silent is not a wrong note, but it does not count as done either).
  const targets = { ok: 0, total: 0, changes: 0 };
  if (solo.targets) changesOf(bars).forEach(({ bar, slot }) => {
    if (perBar[bar].role !== 'you') return;
    targets.changes++;
    const first = byBar[bar].find((n) => n.slot === slot || n.slot === slot + 1); // the first note on the first beat of the chord
    if (!first) return; // silent change: counts against coverage only
    const ok = first.pal.chordPcs.has(pcm(first.m));
    targets.total++; if (ok) targets.ok++;
    perBar[bar].target = perBar[bar].target === false ? false : ok;
  });
  return {
    inside: share((n) => n.inside), grid: share((n) => n.onGrid), phrases, rests, targets,
    pitches: new Set(you.map((n) => n.m)).size, notes: you.length, perBar
  };
}

/** A run of several choruses as one score: mean inside / grid / phrases per chorus, summed rests and targets,
 *  the fewest distinct pitches of any chorus. */
export function combine(scores) {
  if (!scores.length) return null;
  if (scores.length === 1) return { ...scores[0], choruses: 1 };
  const mean = (k) => scores.reduce((a, s) => a + s[k], 0) / scores.length;
  const sum = (k) => scores.reduce((a, s) => {
    const o = { ok: a.ok + s[k].ok, total: a.total + s[k].total };
    if (s[k].changes != null) o.changes = (a.changes || 0) + s[k].changes;
    return o;
  }, { ok: 0, total: 0 });
  return {
    inside: mean('inside'), grid: mean('grid'), phrases: mean('phrases'), rests: sum('rests'), targets: sum('targets'),
    pitches: Math.min(...scores.map((s) => s.pitches)), notes: scores.reduce((a, s) => a + s.notes, 0), choruses: scores.length
  };
}

const ratio = (x) => (x && x.total ? x.ok / x.total : 1); // no data passes
/** Target coverage: the share of chord changes in your bars that got a note on the first beat (no changes = 1). */
export const coverage = (x) => (x && x.changes ? x.total / x.changes : 1);
/** Each threshold present in pass -> true / false. A ratio metric with no data (total 0) passes; pass.cover checks
 *  target coverage, so a solo cannot meet pass.targets by leaving every change silent. */
export function checks(score, pass = {}) {
  const out = {};
  ['inside', 'grid', 'phrases', 'pitches'].forEach((k) => { if (pass[k] != null) out[k] = score[k] >= pass[k] - 1e-9; });
  ['rests', 'targets'].forEach((k) => { if (pass[k] != null) out[k] = ratio(score[k]) >= pass[k] - 1e-9; });
  if (pass.cover != null) out.cover = coverage(score.targets) >= pass.cover - 1e-9;
  return out;
}
/** All thresholds of pass met. */
export const passed = (score, pass) => !!score && Object.values(checks(score, pass)).every(Boolean);

const SHAPES = ['up', 'down', 'arch', 'same'];
/**
 * The band's call phrase over the `play` bars starting at form bar `bar`: { shape, notes: [{ slot, len, m }] },
 * slot 0..play*8-1 counted from the call start. 4–6 eighth onsets (the last beat stays free), a contour up / down / arch /
 * same over the hand range; on-beat notes (even slots) are chord tones, the others palette notes; all within solo.hand.
 */
export function makeCall(solo, bars, bar, rng = Math.random) {
  const NB = bars.length, len = ((solo.phrasing && solo.phrasing.play) || 2) * PER;
  const lo = (solo.hand && solo.hand.lo) || 60, hi = (solo.hand && solo.hand.hi) || 72;
  const shape = SHAPES[Math.floor(rng() * SHAPES.length) % SHAPES.length];
  const n = 4 + Math.floor(rng() * 3);
  const avail = []; for (let s = 1; s < len - 2; s++) avail.push(s);
  for (let i = avail.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [avail[i], avail[j]] = [avail[j], avail[i]]; }
  const slots = [0, ...avail.slice(0, n - 1)].sort((a, b) => a - b);
  const notes = slots.map((slot, k) => {
    const f = n > 1 ? k / (n - 1) : 0;
    const frac = shape === 'up' ? f : shape === 'down' ? 1 - f : shape === 'arch' ? 1 - Math.abs(2 * f - 1) : 0.5;
    const want = lo + frac * (hi - lo);
    const pal = paletteAt(solo, bars, (bar + Math.floor(slot / PER)) % NB, slot % PER);
    const set = slot % 2 === 0 ? pal.chordPcs : pal.pcs;
    let best = null;
    for (let m = lo; m <= hi; m++) if (set.has(pcm(m)) && (best === null || Math.abs(m - want) < Math.abs(best - want))) best = m;
    if (best === null) for (let m = lo; m <= hi; m++) if (pal.pcs.has(pcm(m)) && (best === null || Math.abs(m - want) < Math.abs(best - want))) best = m;
    const next = slots[k + 1];
    return { slot, len: next !== undefined ? Math.min(3, next - slot) : 2, m: best };
  });
  return { shape, notes };
}
