// Jam session (#/session; spec docs/specs/2026-11-22-jam-session-design.md): the band of music/jam.js holds the form, a partner
// (tenor sax or a second pianist) and the learner take turns. Pure functions: no DOM, no audio, randomness only through
// the injected `rng` (testable in node: tests/session.test.mjs).
// The partner's notes come only from what the app already has: the phrase generators makeCall / makeMotif (music/solo.js),
// the course licks (content/licks, through lickNotes), the tune's melody (content/melodies) for the head and the form's
// ending exercise (content/exercises) for the end. Nothing here is a written-out note sequence.
// Events use the band's grid: { bar (absolute bar from the start of the run), t (eighth slot 0..7), d (eighths, t + d <= 8), m, v }.
import { parseChord, chordAt, barChords, lickNotes, melodyBarNotes, leadPair } from './forms.js';
import { makeCall, makeMotif } from './solo.js';
import { fillHits, shellDegs } from './jam.js';
import { toMidi } from './notes.js';

const PER = 8;
const pick = (arr, rng) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

export const FORMATS = ['qa', 'fours', 'session'];
/** The partners: the range every note of theirs sits in (whole-octave moves), the window the phrase generators draw in,
 *  the velocity. The second pianist sits above the learner's C4..C6 centre. */
export const PARTNERS = {
  sax: { lo: 50, hi: 74, hand: [57, 69], v: 0.8, up: false },
  clarinet: { lo: 55, hi: 82, hand: [62, 74], v: 0.8, up: false },
  piano: { lo: 72, hi: 96, hand: [76, 88], v: 0.55, up: true }
};
/** Course licks the partner may quote: chord-relative ones only (a key-relative `prog` lick needs its own progression). */
export const PARTNER_LICKS = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10', 'l11', 'bl1', 'bl2', 'bl3'];
export const SECTIONS = ['head', 'partnerSolo', 'yourSolo', 'fours', 'headOut'];
const FOURS = ['partner', 'you', 'drums', 'you'];

/**
 * Whose turn is it at absolute bar absBar (0 = the first bar after the count-in)?
 * qa: turns of 2 bars, partner / you. fours: turns of 4 bars, partner / you / drums / you, the cycle running on across choruses.
 * session: the plan SECTIONS, one chorus each (the fours chorus starts its cycle on its own first bar); after the last
 * chorus done = true.
 * Returns { who: 'partner' | 'you' | 'drums' | null, turnStart, turnLen, barsLeft (this bar included), next (who plays
 * the turn after this one, null at the end), section (session: a SECTIONS id, else null), chorus, choruses (session: 5), done }.
 */
export function turnAt(format, NB, absBar) {
  const r = turnCore(format, NB, absBar);
  r.next = r.done ? null : turnCore(format, NB, r.turnStart + r.turnLen).who;
  return r;
}
function turnCore(format, NB, absBar) {
  const chorus = Math.floor(absBar / NB);
  const base = (who, turnStart, turnLen, section) => ({ who, turnStart, turnLen, barsLeft: turnStart + turnLen - absBar, next: null, section, chorus, choruses: format === 'session' ? SECTIONS.length : null, done: false });
  if (format === 'qa') { const k = Math.floor(absBar / 2); return base(k % 2 ? 'you' : 'partner', k * 2, 2, null); }
  if (format === 'fours') { const k = Math.floor(absBar / 4); return base(FOURS[k % 4], k * 4, 4, null); }
  if (chorus >= SECTIONS.length || absBar < 0) return { who: null, turnStart: absBar, turnLen: 0, barsLeft: 0, next: null, section: null, chorus, choruses: SECTIONS.length, done: true };
  const section = SECTIONS[chorus], c0 = chorus * NB;
  if (section === 'fours') { const k = Math.floor((absBar - c0) / 4), s = c0 + k * 4; return base(FOURS[k % 4], s, Math.min(4, c0 + NB - s), section); }
  return base(section === 'yourSolo' ? 'you' : 'partner', c0, NB, section);
}

/** Bars of a whole session (the plan) and of its ending. */
export const sessionBars = (NB) => SECTIONS.length * NB;
/** Minutes a session lasts: every chorus of the plan plus the ending bars, 4 beats a bar; rounded (at least 1). */
export const sessionMinutes = (NB, bpm, endBars = 1) => Math.max(1, Math.round(((sessionBars(NB) + endBars) * 4) / bpm));

// ---------- pitch range ----------
/**
 * Move a phrase by whole octaves into [lo, hi]: of the shifts that fit every note, the one whose middle is nearest the
 * middle of the range (preferUp: the upper one of two equally near). When no shift fits all, the one that leaves the
 * fewest notes out, and those the least far out (preferUp: the upper one of equals); the notes still out are then moved
 * by octaves one by one. Returns the new pitches.
 */
export function fitOctaves(ms, lo, hi, preferUp = false) {
  if (!ms.length) return [];
  const a = Math.min(...ms), b = Math.max(...ms), mid = (lo + hi) / 2;
  let best = null;
  for (let k = -6; k <= 6; k++) {
    const s = k * 12, outs = ms.map((m) => Math.max(0, lo - m - s, m + s - hi)).filter((x) => x > 0);
    const dist = Math.abs((a + b) / 2 + s - mid);
    // fewest notes out first; then (all in) nearest the middle, (some out) the least overshoot; then the upper one for preferUp
    const key = [outs.length, outs.length ? outs.reduce((x, y) => x + y, 0) : dist, preferUp ? -s : s];
    const better = !best || key.some((x, i) => x !== best.key[i] && key.slice(0, i).every((y, j) => y === best.key[j]) && x < best.key[i]);
    if (better) best = { s, key };
  }
  return ms.map((m) => { let x = m + best.s; while (x < lo) x += 12; while (x > hi) x -= 12; return x; });
}

// ---------- the partner's phrases ----------
/** A solo config for the phrase generators: the bar's own chord scale (chordscale palette), the partner's window. */
const soloOf = (inst, play = 2) => ({ hand: { lo: inst.hand[0], hi: inst.hand[1] }, phrasing: { play, rest: 2 } });

/** Can a course lick sound over this chord? Dorian licks over a minor chord; the blues licks over a dominant chord of a blues form. */
export function lickFits(lick, chordName, blues) {
  if (lick.prog) return false;
  const q = parseChord(chordName).qual;
  if (lick.scale === 'dorian') return ['m7', 'm6', 'm'].includes(q);
  return !!blues && ['7', '9'].includes(q);
}

/**
 * One phrase from a form bar `fb` with at most `room` slots: [{ slot, len, m, src, lick?, chord? }] (slot from the phrase start).
 * kind: 'call' (makeCall, 2 bars), 'motif' (makeMotif, 1 bar), 'lick' (a course lick over the bar's first chord).
 */
function phrase(ctx, fb, room, rng) {
  const { bars, inst } = ctx, NB = bars.length, chord = chordAt(bars[fb], 0);
  const licks = room >= 16 ? (ctx.licks || []).filter((l) => lickFits(l, chord, ctx.blues)) : [];
  const kinds = room >= 16 ? ['call', 'call', 'motif', ...(licks.length ? ['lick', 'lick'] : [])] : ['motif'];
  const kind = pick(kinds, rng);
  if (kind === 'lick') {
    const lick = pick(licks, rng);
    return lickNotes(lick, chord).map((e) => ({ slot: e.t, len: e.d, m: e.m, src: 'lick', lick: lick.id, chord }));
  }
  const made = kind === 'call' ? makeCall(soloOf(inst), bars, fb % NB, rng) : makeMotif(soloOf(inst, 1), bars, fb % NB, rng);
  return made.notes.filter((n) => n.m != null).map((n) => ({ slot: n.slot, len: n.len, m: n.m, src: kind }));
}

/** Phrase notes (slots from absolute bar `from`) cut to `room` slots, each note cut at its bar line, moved into the
 *  partner's range: events { bar, t, d, m, v, src, ... }. */
function place(ctx, notes, from, room) {
  const ns = notes.filter((n) => n.slot < room).map((n) => {
    const t = n.slot % PER, end = Math.min(n.slot + Math.max(1, n.len), room);
    return { ...n, d: Math.max(1, Math.min(end - n.slot, PER - t)), t };
  });
  const ms = fitOctaves(ns.map((n) => n.m), ctx.inst.lo, ctx.inst.hi, ctx.inst.up);
  return ns.map((n, i) => {
    const { slot, len, ...rest } = n;
    return { ...rest, bar: from + Math.floor(slot / PER), t: n.t, d: n.d, m: ms[i], v: ctx.inst.v * (i === 0 ? 1 : 0.9) };
  });
}

/**
 * A chain of phrases over `len` bars from absolute bar `from` (a 4-bar turn, a solo chorus): each phrase starts on a bar
 * line and is followed by at least half a bar of rest (the partner breathes), sometimes by a whole empty bar; the last
 * half bar of the stretch stays free.
 */
function chain(ctx, from, len, rng) {
  const NB = ctx.bars.length, S = len * PER - 4, out = [];
  let pos = 0;
  while (S - pos >= PER) {
    const room = S - pos, abs = from + pos / PER;
    const ev = place(ctx, phrase(ctx, abs % NB, room, rng), abs, room);
    const end = ev.reduce((a, e) => Math.max(a, (e.bar - abs) * PER + e.t + e.d), 0);
    out.push(...ev);
    pos += Math.max(1, Math.ceil((end + 4) / PER)) * PER;
    if (rng() < 0.25) pos += PER; // a longer breath now and then
  }
  return out;
}

/** The tune's melody over one chorus from absolute bar `from`, moved as a whole into the partner's range (or phrase by
 *  phrase when the whole tune does not fit). Tied continuations are not struck again (melodyBarNotes). */
function headEvents(ctx, from) {
  const { melody, inst } = ctx, NB = ctx.bars.length;
  const notes = [];
  for (let k = 0; k < NB; k++) melodyBarNotes(melody, k).forEach((e) => notes.push({ k, t: e.t, d: Math.max(1, Math.min(e.d, PER - e.t)), m: e.m }));
  const all = notes.map((n) => n.m);
  let ms = fitOctaves(all, inst.lo, inst.hi, inst.up);
  if (ms.some((m, i) => m - all[i] !== ms[0] - all[0])) { // no single shift: phrase by phrase
    ms = all.slice();
    (melody.phrases || [[0, NB - 1]]).forEach(([a, b]) => {
      const idx = notes.map((n, i) => (n.k >= a && n.k <= b ? i : -1)).filter((i) => i >= 0);
      fitOctaves(idx.map((i) => all[i]), inst.lo, inst.hi, inst.up).forEach((m, j) => { ms[idx[j]] = m; });
    });
  }
  return notes.map((n, i) => ({ bar: from + n.k, t: n.t, d: n.d, m: ms[i], v: inst.v, src: 'melody' }));
}

/**
 * The partner's notes for the turn that starts at absolute bar turnStart. ctx = { bars, inst (a PARTNERS entry), licks
 * (lick objects), blues (the form is a blues: its licks fit), melody (or null) }. A partner turn of 2 bars is one phrase;
 * a longer one (4 bars, a solo chorus) is a chain of phrases with rests; the head (session: head, headOut) is the tune's
 * melody when the form has one, else a solo chorus. Not the partner's turn: [].
 */
export function partnerTurn(ctx, format, turnStart, rng = Math.random) {
  const NB = ctx.bars.length, tn = turnAt(format, NB, turnStart);
  if (tn.who !== 'partner') return [];
  const from = tn.turnStart;
  if ((tn.section === 'head' || tn.section === 'headOut') && ctx.melody) return headEvents(ctx, from);
  if (tn.turnLen <= 2) return place(ctx, phrase(ctx, from % NB, tn.turnLen * PER, rng), from, tn.turnLen * PER);
  return chain(ctx, from, tn.turnLen, rng);
}

// ---------- the drummer's turn ----------
/**
 * Four bars of drums alone (the band's bass and chords rest; the screen keeps the style's groove, music/drums.js) with fills
 * on top, from the fill vocabulary of music/jam.js (fillHits): now and then the usual second-half fill, a few accents, and
 * the last bar a fill over the whole bar (the second-half figure doubled into the first half).
 * Returns [{ hits: [{ t, kind, v }] }] per bar.
 */
export function drumTurn(style, nBars = 4, rng = Math.random) {
  const accents = [5, 6, 7].flatMap((s) => fillHits(style, s));
  return Array.from({ length: nBars }, (_, k) => {
    const hits = [];
    if (k === nBars - 1) for (let t = 0; t < PER; t++) fillHits(style, t < 4 ? t + 4 : t).forEach((x) => hits.push({ t, kind: x.kind, v: x.v * (0.8 + 0.2 * t / 7) }));
    else {
      if (rng() < 0.5) for (let t = 4; t < PER; t++) fillHits(style, t).forEach((x) => hits.push({ t, ...x }));
      const n = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < n && accents.length; i++) { const a = pick(accents, rng); hits.push({ t: 1 + Math.floor(rng() * 7), kind: a.kind, v: a.v }); }
    }
    return { hits: hits.sort((a, b) => a.t - b.t) };
  });
}

// ---------- the end of a session ----------
/**
 * The ending after the last chorus. With the form's ending exercise (`ending`, normalized: content/exercises, as the
 * performance screen uses it): the band plays its notes (both hands) and the partner its top voice (the highest note of
 * each right-hand event), moved into the partner's range. Without one: one bar, the band on the first chord of the form
 * (bass root + shell) and the partner on that chord's root (home), all on beat 1.
 * Returns { bars (count), band: [[{ t, d, m, v }] per bar], partner: [[{ t, d, m, v }] per bar] }.
 */
export function endingOf(bars, ending, inst) {
  if (ending && ending.bars && ending.bars.length) {
    const band = ending.bars.map((b) => [...b.rh, ...b.lh].flatMap((e) => e.notes.map((n) => ({ t: e.t, d: Math.max(1, Math.min(e.d, PER - e.t)), m: toMidi(n), v: 0.4 }))));
    const tops = ending.bars.map((b) => b.rh.map((e) => ({ t: e.t, d: Math.max(1, Math.min(e.d, PER - e.t)), m: Math.max(...e.notes.map(toMidi)) })));
    const ms = fitOctaves(tops.flat().map((x) => x.m), inst.lo, inst.hi, inst.up);
    let i = 0;
    const partner = tops.map((bar) => bar.map((x) => ({ ...x, m: ms[i++], v: inst.v })));
    return { bars: ending.bars.length, band, partner };
  }
  const name = barChords(bars[0])[0], ch = parseChord(name), pair = leadPair(shellDegs(ch), ch, null);
  const band = [[{ t: 0, d: PER, m: 36 + ch.pc, v: 0.5 }, ...pair.map((m) => ({ t: 0, d: PER, m, v: 0.35 }))]];
  const root = fitOctaves([60 + ch.pc], inst.hand[0], inst.hand[1], inst.up)[0];
  return { bars: 1, band, partner: [[{ t: 0, d: PER, m: Math.max(inst.lo, Math.min(inst.hi, root)), v: inst.v }]] };
}
