// Exercise model: loads the JSON format (content/exercises/*.json, see content/FORMAT.md)
// and derives the per-eighth step list every other module works with.
import { toMidi } from './notes.js';

const FORMAT = 'jazzlab-exercise/1';

/** Validate + fill defaults. Throws Error with a readable message on bad data. */
export function normalize(raw) {
  if (!raw || raw.$format !== FORMAT) throw new Error('Unknown exercise format: ' + (raw && raw.$format));
  const [beats, unit] = raw.time || [4, 4];
  if (unit !== 4) throw new Error('Only x/4 time is supported for now');
  const per = beats * 2; // slots (eighths) per bar
  const def = raw.defaults || {};
  const ev = (e, where) => {
    const d = e.d || 1;
    if (!Array.isArray(e.n) || !e.n.length) throw new Error(where + ': empty notes');
    if (e.t < 0 || e.t + d > per) throw new Error(where + ': event outside the bar');
    e.n.forEach(toMidi); // throws on a bad pitch
    if (e.grace) toMidi(e.grace);
    return {
      t: e.t, d, notes: e.n.slice(), f: (e.f || []).slice(),
      acc: !!e.acc, sug: !!e.sug,
      stac: e.stac !== undefined ? !!e.stac : !!def.stac,
      grace: e.grace || null
    };
  };
  const bars = raw.bars.map((b, bi) => ({
    rh: (b.rh || []).map((e, k) => ev(e, `bar ${bi + 1} rh #${k + 1}`)).sort((a, c) => a.t - c.t),
    lh: (b.lh || []).map((e, k) => ev(e, `bar ${bi + 1} lh #${k + 1}`)).sort((a, c) => a.t - c.t)
  }));
  const dyn = (raw.dyn && raw.dyn.length ? raw.dyn : [{ bar: 0, mark: 'mf', level: 0.75 }]).slice().sort((a, c) => a.bar - c.bar);
  return {
    id: raw.id, course: raw.course, step: raw.step, number: raw.number,
    title: raw.title, about: raw.about || null,
    beats, per, bars, dyn,
    tempo: { start: (raw.tempo && raw.tempo.start) || 60, target: (raw.tempo && raw.tempo.target) || 90 },
    swing: !!raw.swing, rhythm: raw.rhythm || null,
    export: raw.export || {}
  };
}

/** One entry per eighth: {bar, slot, rh: event|null, lh: event|null}. */
export function buildSteps(ex) {
  const steps = [];
  ex.bars.forEach((b, bi) => {
    for (let s = 0; s < ex.per; s++) {
      steps.push({ bar: bi, slot: s, rh: b.rh.find((e) => e.t === s) || null, lh: b.lh.find((e) => e.t === s) || null });
    }
  });
  return steps;
}

/** Loudness 0..1 at a step, following dyn marks and linear crescendos. */
export function dynAt(ex, step) {
  const pos = step.bar + step.slot / ex.per;
  let cur = ex.dyn[0];
  for (const d of ex.dyn) if (d.bar <= step.bar) cur = d;
  if (cur.cresc) {
    const nx = ex.dyn.find((d) => d.bar > cur.bar);
    if (nx) return { d: cur, level: cur.level + (nx.level - cur.level) * (pos - cur.bar) / (nx.bar - cur.bar) };
  }
  return { d: cur, level: cur.level };
}

export function midiRange(ex) {
  const all = [];
  ex.bars.forEach((b) => [...b.rh, ...b.lh].forEach((e) => e.notes.forEach((n) => all.push(toMidi(n)))));
  return [Math.min(...all), Math.max(...all)];
}

export async function loadExercise(id) {
  const r = await fetch(new URL(`../../../content/exercises/${id}.json`, import.meta.url));
  if (!r.ok) throw new Error(`Exercise ${id}: HTTP ${r.status}`);
  return normalize(await r.json());
}
