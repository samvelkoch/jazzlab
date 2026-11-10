// Solo (improvisation) scoring: pure functions, no DOM (testable in node). See content/FORMAT.md «Solos».
// The band plays the form, the learner plays their own right hand; the app scores four things:
// inside (notes from the bar's palette; a semitone approach into the palette counts), grid (onsets on the swing-aware
// eighth grid), phrases and rests (phrasing cells), target notes (a chord tone on the first beat of a chord change).
import { parseChord, chordAt, barChords } from './forms.js';
import { gridDev, tols } from './recording.js';
import { scalePcs, scaleOf, pcOf } from './scales.js';
import { parsePattern } from './rhythm.js';

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
 * ctx.cells = resolveCells(solo, lib) (the rhythm cells to use), ctx.calls = the band's call notes [{ t, m }] (same clock as
 * notes) for the motif metric. Returns { inside, grid (0..1), phrases, rests: { ok, total }, targets: { ok, total, changes },
 *   rhythm: { ok, total } (your bars that play a cell), motif: { ok, total } (your answers that relate to the call),
 *   ends: { ok, total } (phrase ends on the chord's 3rd / root), pitches, notes,
 *   perBar: [{ role, notes, clean, restOk, target, rhy }] }.
 */
export function scoreChorus(notes, { solo, bars, bpm, swing, cells = [], calls = null }) {
  const NB = bars.length, beat = 60 / bpm, e8 = beat / 2, tol = gridTol(bpm), slack = tols(bpm).win;
  const ns = notes.slice().sort((a, b) => a.t - b.t).map((n) => {
    const gi = gridIndex(n.t, bpm, swing);
    const bar = Math.max(0, Math.min(NB - 1, Math.floor(gi / PER)));
    const slot = Math.max(0, Math.min(PER - 1, gi - bar * PER));
    return { t: n.t, m: n.m, gi, bar, slot, role: roleOf(solo, bar), pal: paletteAt(solo, bars, bar, slot) };
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
      target: null, rhy: null
    };
  });
  // rhythm: each of your bars is matched against the cell bar at its position in the stretch of your bars
  const rhythm = { ok: 0, total: 0 };
  if (cells.length) {
    let pos = 0;
    bars.forEach((_, k) => {
      if (perBar[k].role !== 'you') { pos = 0; return; }
      const bn = byBar[k], slots = new Set(bn.map((n) => n.slot)), off = bn.some((n) => !n.onGrid);
      const ok = !off && cells.some((c) => barMatchesCell(slots, c.onsets[pos % c.nbars]));
      perBar[k].rhy = ok; rhythm.total++; if (ok) rhythm.ok++;
      pos++;
    });
  }
  // motif: each answer stretch against the call stretch before it
  const motif = { ok: 0, total: 0 };
  if (solo.call && calls && calls.length) {
    const sts = stretchesOf(solo, NB);
    const cn = calls.map((c) => ({ gi: gridIndex(c.t, bpm, swing), m: c.m })).filter((c) => c.gi >= 0).sort((a, b) => a.gi - b.gi);
    sts.forEach((a, i) => {
      const c = sts[i - 1];
      if (a.role !== 'you' || !c || c.role !== 'band') return;
      const cl = cn.filter((x) => x.gi >= c.from * PER && x.gi < (c.to + 1) * PER).map((x) => ({ slot: x.gi - c.from * PER, m: x.m }));
      if (!cl.length) return;
      const an = ns.filter((n) => n.bar >= a.from && n.bar <= a.to).map((n) => ({ slot: n.gi - a.from * PER, m: n.m }));
      motif.total++; if (motifRelated(cl, an, solo.motif)) motif.ok++;
    });
  }
  // ends: the last note of each phrase (2+ notes) must be the chord's third or root
  const ends = { ok: 0, total: 0 };
  if (solo.endOn) {
    let ph = [];
    const close = () => {
      if (ph.length >= 2) { const l = ph[ph.length - 1]; ends.total++; if (endsOn(l.m, l.pal.chord, solo.endOn)) ends.ok++; }
      ph = [];
    };
    you.forEach((n, i) => { if (i && n.t - you[i - 1].t > beat + slack) close(); ph.push(n); });
    close();
  }
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
    inside: share((n) => n.inside), grid: share((n) => n.onGrid), phrases, rests, targets, rhythm, motif, ends,
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
    if (!s[k]) return a;
    const o = { ok: a.ok + s[k].ok, total: a.total + s[k].total };
    if (s[k].changes != null) o.changes = (a.changes || 0) + s[k].changes;
    return o;
  }, { ok: 0, total: 0 });
  return {
    inside: mean('inside'), grid: mean('grid'), phrases: mean('phrases'), rests: sum('rests'), targets: sum('targets'),
    rhythm: sum('rhythm'), motif: sum('motif'), ends: sum('ends'),
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
  ['rests', 'targets', 'rhythm', 'motif', 'ends'].forEach((k) => { if (pass[k] != null) out[k] = ratio(score[k]) >= pass[k] - 1e-9; });
  if (pass.cover != null) out.cover = coverage(score.targets) >= pass.cover - 1e-9;
  return out;
}
/** All thresholds of pass met. */
export const passed = (score, pass) => !!score && Object.values(checks(score, pass)).every(Boolean);

const SHAPES = ['up', 'down', 'arch', 'same'];

// ---------- rhythm cells, motifs, phrase ends ----------
/** The rhythm cells a solo asks for (solo.rhythm: an id or a list of ids; lib = content/solos/rhythms.json):
 *  [{ id, title, about, rhythm (the pattern string), nbars, per (slots), events (parsePattern), onsets: [Set of slots per bar] }]. */
export function resolveCells(solo, lib) {
  const ids = [].concat(solo.rhythm || []), defs = (lib && lib.cells) || {};
  return ids.map((id) => {
    const d = defs[id]; if (!d) throw new Error('Unknown rhythm cell: ' + id);
    const nbars = d.bars || 1, events = parsePattern(d.rhythm);
    const per = events.reduce((a, e) => a + e.d, 0);
    if (per !== nbars * PER) throw new Error(`Rhythm cell ${id}: ${per} eighths, ${nbars * PER} expected`);
    const onsets = Array.from({ length: nbars }, (_, b) => new Set(events.filter((e) => !e.rest && e.t >= b * PER && e.t < (b + 1) * PER).map((e) => e.t - b * PER)));
    return { id, title: d.title, about: d.about, rhythm: d.rhythm, nbars, per, events, onsets };
  });
}
/** A bar plays a cell bar when its onsets are a subset of the cell's and at least 3/4 of the cell's onsets are played
 *  (an empty cell bar wants an empty bar). Slots = eighth positions 0..7; a note off the grid has already failed the bar. */
export function barMatchesCell(slots, cell) {
  if (!cell.size) return slots.size === 0;
  let hit = 0;
  for (const s of slots) { if (!cell.has(s)) return false; hit++; }
  return hit >= Math.ceil(0.75 * cell.size);
}
/** Consecutive bars of one role: [{ role, from, to }] (bars inclusive). */
export function stretchesOf(solo, NB) {
  const out = [];
  for (let k = 0; k < NB; k++) {
    const role = roleOf(solo, k), l = out[out.length - 1];
    if (l && l.role === role) l.to = k; else out.push({ role, from: k, to: k });
  }
  return out;
}
/** Contour of a pitch line (3+ notes): 'arch' (the peak 3+ semitones above both ends), 'up' / 'down' (the end 2+ above / below
 *  the start), else 'same'. null for fewer than 3 notes. */
export function shapeOf(ms) {
  if (ms.length < 3) return null;
  const first = ms[0], last = ms[ms.length - 1], peak = Math.max(...ms);
  if (peak >= Math.max(first, last) + 3) return 'arch';
  return last - first >= 2 ? 'up' : first - last >= 2 ? 'down' : 'same';
}
const pcs12 = (a) => a.map((n) => ((n.m % 12) + 12) % 12);
const intervals = (a) => a.slice(1).map((n, i) => n.m - a[i].m);
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
/**
 * Does an answer relate to the call? call / ans = [{ slot, m }] sorted by time, slots counted from the start of the stretch.
 * mode undefined (similar): any of: the same onsets (overlap |A∩C| / max(|A|,|C|) >= 0.6); the answer starts on the call's
 *   first note or ends on its last (same pitch class); the same contour shape (3+ notes each).
 * 'repeat': the same onsets and the same notes (same pitch classes, or the same intervals: moved to another place).
 * 'vary': the same onsets, different notes (neither the same pitch classes nor the same intervals).
 */
export function motifRelated(call, ans, mode) {
  if (!call.length || !ans.length) return false;
  const A = new Set(ans.map((n) => n.slot)), C = new Set(call.map((n) => n.slot));
  const same = A.size === C.size && [...A].every((s) => C.has(s)) && ans.length === call.length;
  const sameNotes = same && (sameList(pcs12(ans), pcs12(call)) || sameList(intervals(ans), intervals(call)));
  if (mode === 'repeat') return sameNotes;
  if (mode === 'vary') return same && !sameNotes;
  const overlap = [...A].filter((s) => C.has(s)).length / Math.max(A.size, C.size);
  if (overlap >= 0.6) return true;
  const ap = pcs12(ans), cp = pcs12(call);
  if (ap[0] === cp[0] || ap[ap.length - 1] === cp[cp.length - 1]) return true;
  const sa = shapeOf(ans.map((n) => n.m)), sc = shapeOf(call.map((n) => n.m));
  return !!sa && sa === sc;
}
/** Is pitch m the third (minor or major) or the root of the chord? which = 'third' | 'root'. */
export function endsOn(m, chordName, which) {
  const ch = parseChord(chordName), rel = (((m - ch.pc) % 12) + 12) % 12;
  if (which === 'root') return rel === 0;
  return ch.offsets.some((o) => (o === 3 || o === 4) && o === rel);
}
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

const MOTIF_ONSETS = [[0, 2, 4, 6], [0, 1, 2, 4], [0, 2, 3, 4, 6], [0, 3, 4, 6], [0, 2, 4, 5, 6]];
const MOTIF_STEPS = [[0, 1, 2, 1, 0], [0, 2, 1, 3, 2], [0, -1, -2, -1, 0], [0, 1, 0, 2, 1], [2, 1, 0, 1, 2]];
/**
 * A one-bar (solo.phrasing.play bars) motif the band plays once: 4-5 notes on a fixed rhythm (MOTIF_ONSETS), a small
 * step pattern through the palette notes in the hand range; the first note is a chord tone. Same shape as makeCall.
 */
export function makeMotif(solo, bars, bar, rng = Math.random) {
  const NB = bars.length, lo = (solo.hand && solo.hand.lo) || 60, hi = (solo.hand && solo.hand.hi) || 72;
  const slots = MOTIF_ONSETS[Math.floor(rng() * MOTIF_ONSETS.length) % MOTIF_ONSETS.length];
  const st0 = MOTIF_STEPS[Math.floor(rng() * MOTIF_STEPS.length) % MOTIF_STEPS.length], steps = st0.map((x) => x - st0[0]); // the first note is the start
  const poolAt = (slot) => {
    const pal = paletteAt(solo, bars, (bar + Math.floor(slot / PER)) % NB, slot % PER), pool = [];
    for (let m = lo; m <= hi; m++) if (pal.pcs.has(pcm(m))) pool.push(m);
    return { pal, pool };
  };
  const first = poolAt(slots[0]), chordTones = first.pool.filter((m) => first.pal.chordPcs.has(pcm(m)));
  const lo0 = Math.min(...steps), hi0 = Math.max(...steps);
  const fits = (m) => { const i = first.pool.indexOf(m); return i + lo0 >= 0 && i + hi0 <= first.pool.length - 1; }; // the steps stay inside the hand
  const ok = chordTones.filter(fits), from = ok.length ? ok : chordTones;
  const start = from.length ? from[Math.floor(rng() * from.length) % from.length] : lo;
  const idx0 = Math.max(0, first.pool.indexOf(start));
  const notes = slots.map((slot, k) => {
    const { pool } = poolAt(slot), i = Math.max(0, Math.min(pool.length - 1, idx0 + steps[k]));
    const next = slots[k + 1];
    return { slot, len: next !== undefined ? Math.min(2, next - slot) : 2, m: pool[i] };
  });
  return { shape: shapeOf(notes.map((n) => n.m)) || 'same', notes };
}
