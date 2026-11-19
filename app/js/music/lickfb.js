// Lick feedback: score one repeat note by note, and say in plain words what went wrong (no note names).
// Used by the lick screen: stage «Ритм» (pitch ignored) and «Эхо» (the same key and the same time).

const BLACK = new Set([1, 3, 6, 8, 10]);
export const isBlack = (m) => BLACK.has(((m % 12) + 12) % 12);

/**
 * exp:  expected notes, in time order: [{ t (s), m (midi), slot }]
 * taps: what was played: [{ t (s), m (midi) }]
 * opts: { win: s, a tap this close counts as on time; tight: s, closer = dead on; near: s, a tap this close to a missed
 *         note is shown as «early» / «late» for it (instead of «missed» + «extra»); pitch: false = rhythm only }
 * → { notes: [{ res, got, dt }], extra, clean }, res: ok | bitEarly | bitLate (on time, still clean) | early | late |
 *   wrong (the right time, another key) | miss.
 */
export function scoreRepeat(exp, taps, { win, tight, near, pitch = true }) {
  const notes = exp.map(() => ({ res: 'miss', got: null, dt: 0 }));
  const used = new Array(taps.length).fill(false);
  const order = taps.map((x, i) => i).sort((a, b) => taps[a].t - taps[b].t);
  // 1. each tap takes the nearest expected note still free within the window
  for (const i of order) {
    let best = -1;
    exp.forEach((e, k) => {
      if (notes[k].got !== null) return;
      const d = Math.abs(taps[i].t - e.t);
      if (d <= win && (best < 0 || d < Math.abs(taps[i].t - exp[best].t))) best = k;
    });
    if (best < 0) continue;
    used[i] = true;
    const dt = taps[i].t - exp[best].t;
    const n = notes[best];
    n.got = taps[i].m; n.dt = dt;
    n.res = pitch && taps[i].m !== exp[best].m ? 'wrong' : Math.abs(dt) <= tight ? 'ok' : dt < 0 ? 'bitEarly' : 'bitLate';
  }
  // 2. a missed note with a stray tap close by: that tap was meant for it, too early or too late
  exp.forEach((e, k) => {
    if (notes[k].got !== null) return;
    let best = -1;
    taps.forEach((x, i) => { if (!used[i] && Math.abs(x.t - e.t) <= near && (best < 0 || Math.abs(x.t - e.t) < Math.abs(taps[best].t - e.t))) best = i; });
    if (best < 0) return;
    used[best] = true;
    const dt = taps[best].t - e.t;
    notes[k] = { res: dt < 0 ? 'early' : 'late', got: taps[best].m, dt };
  });
  const extra = used.filter((u) => !u).length;
  const clean = exp.length > 0 && extra === 0 && notes.every((n) => n.res === 'ok' || n.res === 'bitEarly' || n.res === 'bitLate');
  return { notes, extra, clean };
}

/** Where the right key is, from the key that was pressed: { dir: 'left'|'right'|'same', keys: semitones, black } */
export function keyHint(want, got) {
  return { dir: want === got ? 'same' : want < got ? 'left' : 'right', keys: Math.abs(want - got), black: isBlack(want) };
}

/** Count word for a slot of eighths in 4/4: 0 → «раз», 1 → «и», 2 → «два» … (keys of the i18n table) */
export const beatKey = (slot) => (slot % 2 ? 'lqAnd' : 'lqBeat' + (Math.floor((slot % 8) / 2) + 1));

/**
 * Your own answer (stage «Свой ответ»): did it end at home? taps: [{ t, m }] of the answer window; homePc: pitch class
 * of home (0 = C). → { count, last (midi | null), home: bool, dir: 'left'|'right'|'same', keys: semitones to the nearest home key }
 */
export function homeCheck(taps, homePc = 0) {
  if (!taps.length) return { count: 0, last: null, home: false, dir: 'same', keys: 0 };
  const last = taps.reduce((a, b) => (b.t >= a.t ? b : a)).m;
  const pc = ((last - homePc) % 12 + 12) % 12;
  const down = last - pc, up = down + 12; // the home keys around the last one
  const target = pc === 0 ? last : pc <= 6 ? down : up;
  return { count: taps.length, last, home: pc === 0, dir: target === last ? 'same' : target < last ? 'left' : 'right', keys: Math.abs(target - last) };
}
