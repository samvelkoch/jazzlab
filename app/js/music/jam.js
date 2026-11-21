// Accompaniment mode (content/jam.json, jazzlab-jam/1): a light band loops over a form, the learner improvises on top.
// Pure functions: no DOM, no audio, randomness only through the injected `rng` (testable in node: tests/jam.test.mjs).
// Times are eighth slots of a 4/4 bar (t 0..7, d in eighths); notes never cross the bar line (t + d <= 8).
import { parseChord, chordAt, barChords, fitDeg, leadPair } from './forms.js';
import { scaleOf, scalePcs } from './scales.js';

const pcm = (m) => ((m % 12) + 12) % 12;
export const BASS_LO = 33, BASS_HI = 52; // walking bass window (A1..E3)
const pick = (arr, rng) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];

/** Style cells with a `pattern` get that pattern's single-degree events (chords inside a pattern are dropped). Throws on a
 *  missing pattern. Returns a copy of the style; every cell has `events`. */
export function resolveStyle(style, patterns = {}) {
  const bass = (style.bass || []).map((c, i) => {
    if (!c.pattern) return { id: c.id || `b${i}`, ...c, events: c.events || [] };
    const p = patterns[c.pattern];
    if (!p) throw new Error(`Jam style ${style.id}: no pattern ${c.pattern}`);
    const events = p.events.filter((e) => !Array.isArray(e.deg)).map((e) => ({ t: e.t, d: e.d || 1, deg: e.deg, ...(e.stac ? { stac: true } : {}) }));
    return { id: c.id || c.pattern, ...c, events };
  });
  const comp = (style.comp || []).map((c, i) => ({ id: c.id || `c${i}`, ...c, events: c.events || [] }));
  return { ...style, bass, comp };
}

/** The shell of a chord: 3rd + 7th (fitDeg of 4 and 10); a 6th chord (6, m6) takes its 6th instead of a ♭7. */
export function shellDegs(chord) {
  const o = chord.offsets;
  return [fitDeg(4, chord), o.includes(9) && !o.includes(10) ? 9 : fitDeg(10, chord)];
}

// split an event that crosses slot 4 of a two-chord bar: [t, 4) on the first chord, [4, t + d) on the second
function splitAt4(evs, two) {
  const out = [];
  evs.forEach((e) => {
    const d = Math.max(1, Math.min(e.d || 1, 8 - e.t));
    if (two && e.t < 4 && e.t + d > 4) { out.push({ ...e, d: 4 - e.t }); out.push({ ...e, t: 4, d: e.t + d - 4, split: true }); }
    else out.push({ ...e, d });
  });
  return out.sort((a, b) => a.t - b.t);
}

// ---------- walking bass ----------
const rootOpts = (pc) => { const out = []; for (let m = BASS_LO; m <= BASS_HI; m++) if (pcm(m) === pc) out.push(m); return out; };
const leapCost = (a, b) => { const d = Math.abs(a - b); return d + (d > 7 ? 1000 : d > 6 ? 3 : 0); };
/** Root MIDI of every chord of the chorus (bar, slot 0 / 4), chosen together so neighbouring roots are close (a leap of 7 or less, 6 or less where
 *  the window allows it), starting from `start`. Returns { roots: [[r1], [r1, r2], ...], next } (next = bar 1 of the
 *  next chorus, nearest to the last root). */
function planRoots(bars, start) {
  const pos = [];
  bars.forEach((b, k) => barChords(b).forEach((c, i) => pos.push({ k, i, pc: parseChord(c).pc })));
  let cost = [new Map([[start, 0]])], from = [new Map()];
  for (let i = 1; i < pos.length; i++) {
    const cm = new Map(), fm = new Map();
    rootOpts(pos[i].pc).forEach((m) => {
      let best = Infinity, arg = null;
      cost[i - 1].forEach((c, p) => { const x = c + leapCost(p, m) + Math.abs(m - 42) * 0.01; if (x < best) { best = x; arg = p; } });
      cm.set(m, best); fm.set(m, arg);
    });
    cost.push(cm); from.push(fm);
  }
  // close the loop: the cost to reach bar 1 again counts too
  const pc0 = pos[0].pc, wrap = (m) => Math.min(...rootOpts(pc0).map((x) => leapCost(m, x)));
  let last = null, bestEnd = Infinity;
  cost[pos.length - 1].forEach((c, m) => { const x = c + wrap(m); if (x < bestEnd) { bestEnd = x; last = m; } });
  const ms = new Array(pos.length);
  ms[pos.length - 1] = last;
  for (let i = pos.length - 1; i > 0; i--) ms[i - 1] = from[i].get(ms[i]);
  const roots = bars.map(() => []);
  pos.forEach((p, i) => { roots[p.k][p.i] = ms[i]; });
  const next = rootOpts(pc0).reduce((a, x) => (Math.abs(x - last) < Math.abs(a - last) || (Math.abs(x - last) === Math.abs(a - last) && Math.abs(x - 36 - pc0) < Math.abs(a - 36 - pc0)) ? x : a));
  return { roots, next };
}
const inBass = (m) => m >= BASS_LO && m <= BASS_HI;
const tonesOf = (name) => { const c = parseChord(name), s = scaleOf(c); return new Set([...scalePcs(s.scale, s.root), ...c.offsets.map((o) => pcm(c.pc + o))]); };
const near = (T, m, lo, hi) => { const out = []; for (let x = m - hi; x <= m + hi; x++) { const d = Math.abs(x - m); if (d >= lo && inBass(x) && T.has(pcm(x))) out.push(x); } return out; };
// beat 4: a semitone or a scale step (of the chord that sounds) into the next root
function approaches(N, T) {
  return [N - 1, N + 1, N - 2, N + 2].filter((x) => inBass(x) && (Math.abs(x - N) === 1 || T.has(pcm(x))));
}
/** Four quarter notes of one bar: root on beat 1, steps / thirds on 2–3 (the second root on 3 in a two-chord bar),
 *  an approach on 4 into N (the next bar's root). Every leap <= 7 semitones, beat 4 within 2 of N. */
function walkBar(barName, roots, N, rng) {
  const cs = barChords(barName), R = roots[0];
  const T1 = tonesOf(cs[0]), T2 = tonesOf(cs[cs.length - 1]);
  const A = approaches(N, T2);
  if (cs.length > 1) {
    const R2 = roots[1];
    const T = new Set([...T1, pcm(R2 - 1), pcm(R2 + 1)]);
    let b2 = near(T, R, 1, 4).filter((x) => Math.abs(x - R2) >= 1 && Math.abs(x - R2) <= 4);
    if (!b2.length) b2 = near(T, R, 1, 7).filter((x) => Math.abs(x - R2) >= 1 && Math.abs(x - R2) <= 7);
    if (!b2.length) b2 = [Math.round((R + R2) / 2)];
    let a = A.filter((x) => Math.abs(x - R2) >= 1 && Math.abs(x - R2) <= 4);
    if (!a.length) a = A.filter((x) => Math.abs(x - R2) <= 7);
    if (!a.length) a = [N + (R2 > N ? 1 : -1)];
    return [R, pick(b2, rng), R2, pick(a, rng)];
  }
  const paths = [];
  for (const tight of [4, 7]) {
    near(T1, R, 1, 4).forEach((b2) => near(T1, b2, 1, 4).forEach((b3) => A.forEach((a) => {
      const d = Math.abs(a - b3);
      if (d >= 1 && d <= tight) paths.push([b2, b3, a]);
    })));
    if (paths.length) break;
  }
  if (paths.length) return [R, ...pick(paths, rng)];
  const a = A.length ? A.reduce((x, y) => (Math.abs(y - R) < Math.abs(x - R) ? y : x)) : N; // fallback: a straight line
  return [R, Math.round(R + (a - R) / 3), Math.round(R + (2 * (a - R)) / 3), a];
}

// ---------- a chorus ----------
/**
 * One chorus of the band. style = resolveStyle(...), bars = the form's bars.
 * opts: chorus (0-based, opens the busier cells: level <= 1 + chorus, capped at 3), variety 'low' (always the first cell
 * of each layer, 4-bar blocks) | 'high' (random cells per 2-bar block, never the same cell twice in a row when there is
 * a choice), rng, prev (from the previous chorus: the shell pair, the walking bass's next root, the last cells).
 * Returns { bars: [{ notes: [{ t, d, m, v, stac, part }], bassCell, compCell, fill }], prev }.
 */
export function makeChorus(style, bars, { chorus = 0, variety = 'low', rng = Math.random, prev = null } = {}) {
  const NB = bars.length, high = variety === 'high', B = high ? 2 : 4;
  const maxLevel = Math.min(3, 1 + chorus);
  let pair = prev && prev.pair ? prev.pair : null;
  let lastBass = prev ? prev.bassCell : null, lastComp = prev ? prev.compCell : null;
  const choose = (cells, last) => {
    if (!cells.length) return null;
    if (!high) return 0;
    let ok = cells.map((c, i) => i).filter((i) => (cells[i].level || 1) <= maxLevel);
    if (!ok.length) ok = [0];
    if (ok.length > 1 && last != null) ok = ok.filter((i) => i !== last);
    return pick(ok, rng);
  };
  // walking bass: all roots of the chorus first
  let plan = null;
  if (style.walk) {
    const pc0 = parseChord(barChords(bars[0])[0]).pc;
    const start = prev && prev.nextRoot != null && pcm(prev.nextRoot) === pc0 ? prev.nextRoot : 36 + pc0;
    plan = planRoots(bars, start);
  }
  const out = [];
  let bassCell = null, compCell = null;
  for (let k = 0; k < NB; k++) {
    if (k % B === 0) {
      bassCell = style.walk ? 'walk' : choose(style.bass, lastBass);
      compCell = choose(style.comp, lastComp);
      if (bassCell !== 'walk') lastBass = bassCell;
      lastComp = compCell;
    }
    const name = bars[k], two = barChords(name).length > 1;
    const notes = [];
    // bass
    if (style.walk) {
      const N = k + 1 < NB ? plan.roots[k + 1][0] : plan.next;
      walkBar(name, plan.roots[k], N, rng).forEach((m, i) => notes.push({ t: i * 2, d: 2, m, v: i === 0 ? 0.55 : 0.45, stac: false, part: 'bass' }));
    } else if (bassCell != null) {
      const evs = splitAt4(style.bass[bassCell].events, two);
      // a two-chord bar: the first bass note on or after beat 3 is the second chord's root
      const second = two ? evs.find((e) => e.t >= 4) : null;
      evs.forEach((e) => {
        const chord = parseChord(chordAt(name, e.t));
        const deg = e === second ? 0 : fitDeg(e.deg, chord);
        notes.push({ t: e.t, d: e.d, m: 36 + chord.pc + deg, v: e.t === 0 ? 0.55 : 0.47, stac: !!e.stac, part: 'bass' });
      });
    }
    // comp: the voice-led shell, one pair per chord of the bar (kept moving even in a silent bar)
    const pairs = barChords(name).map((c) => { const ch = parseChord(c); pair = leadPair(shellDegs(ch), ch, pair); return pair; });
    if (compCell != null) {
      const cell = style.comp[compCell], cb = k % (cell.bars || 1);
      splitAt4(cell.events.filter((e) => (e.bar || 0) === cb), two).forEach((e) => {
        const ms = pairs[two && e.t >= 4 ? 1 : 0].slice().sort((a, b) => a - b);
        (e.note != null ? [ms[e.note]] : ms).forEach((m) => notes.push({ t: e.t, d: e.d, m, v: 0.32, stac: false, part: 'comp' }));
      });
    }
    // drum fill: the last bar of the chorus; with high variety also the end of a 4-bar block, now and then
    const fill = k === NB - 1 || (high && k % 4 === 3 && rng() < 0.25);
    notes.sort((a, b) => a.t - b.t || a.m - b.m);
    out.push({ notes, bassCell, compCell, fill });
  }
  return { bars: out, prev: { pair, nextRoot: plan ? plan.next : null, bassCell: lastBass, compCell: lastComp } };
}

/** Extra drum hits of a fill bar at an eighth slot: the second half of the bar only. Bossa: a rim click on the last three
 *  eighths; other styles: kick + hi-hat on the off-beats of beats 3 and 4. [{ kind, v }] (kind as audio.drum). */
export function fillHits(style, slot) {
  if (slot < 4) return [];
  if (style.drums === 'bossa') return slot >= 5 ? [{ kind: 'rim', v: 0.7 }] : [];
  return slot % 2 ? [{ kind: 'kick', v: 0.45 }, { kind: 'hat', v: 0.6 }] : [];
}

/**
 * Keys that end a phrase. pal = paletteAt(...) of the moment (computed with the simple palette in 'simple' mode).
 * mode 'chords': home = the chord's root and third, hang = its seventh (a triad or a 6th chord: its fifth).
 * mode 'simple': home = the scale's root, hang = the scale's 5th and ♭7 above the root, when the scale has them.
 * Returns { home: Set<pc>, hang: Set<pc> }.
 */
export function endKeys(mode, pal) {
  if (mode === 'simple') {
    const sc = scalePcs(pal.scale, pal.root);
    return { home: new Set([pal.root]), hang: new Set([7, 10].map((x) => (pal.root + x) % 12).filter((x) => sc.has(x))) };
  }
  const c = parseChord(pal.chord), o = c.offsets.map((x) => x % 12);
  const third = o.includes(4) ? 4 : o.includes(3) ? 3 : null;
  const sev = o.includes(10) ? 10 : o.includes(11) ? 11 : c.qual === 'dim7' ? 9 : null;
  const fifth = o.includes(7) ? 7 : 6;
  return {
    home: new Set([0, ...(third != null ? [third] : [])].map((x) => (c.pc + x) % 12)),
    hang: new Set([(c.pc + (sev != null ? sev : fifth)) % 12])
  };
}

/** The next different chord after bar / slot (the form loops): { chord, inBars (bar lines crossed: 0 = later in this
 *  bar), bar, slot }; null when the whole form is one chord. */
export function nextChange(bars, bar, slot = 0) {
  const NB = bars.length, cur = chordAt(bars[bar], slot);
  let k = bar, half = barChords(bars[bar]).length > 1 && slot >= 4 ? 1 : 0, crossed = 0;
  for (let n = 0; n < NB * 2 + 2; n++) {
    if (half === 0 && barChords(bars[k]).length > 1) half = 1;
    else { k = (k + 1) % NB; half = 0; crossed++; }
    const c = barChords(bars[k])[half];
    if (c !== cur) return { chord: c, inBars: crossed, bar: k, slot: half * 4 };
  }
  return null;
}

/** The default style of a form: bossa for a bossa form, slow blues for a 12-bar form, else swing. */
export const defaultStyle = (form) => (form.style === 'bossa' ? 'bossa' : form.bars.length === 12 ? 'slow-blues' : 'swing');
