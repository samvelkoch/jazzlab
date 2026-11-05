// Chord lessons → a regular exercise (jazzlab-exercise/1), so "chord in rhythm" reuses the exercise
// screen: Rhythm stage first (one key), then the notes, then in tempo. Pure module.
import { parseChord } from './chords.js';
import { parsePattern } from './rhythm.js';

const NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Pitch string for the exercise format, keeping the chord's spelling (B♭ stays Bb, not A#). */
function pitch(midi, letter, alt) {
  if (letter && Math.abs(alt) <= 1) {
    const oct = Math.floor((midi - alt - NAT[letter]) / 12) - 1;
    return letter + (alt === 1 ? '#' : alt === -1 ? 'b' : '') + oct;
  }
  return SHARP[midi % 12] + (Math.floor(midi / 12) - 1);
}

/**
 * Right hand + left hand for comping.
 * Simple chords (triads, 7ths, sus): root position, root between G3 and F#4 — the shape the lesson teaches.
 * Chords with colours (9, 11, 13, ♭9 …): the pianist's way — left hand the root, right hand the rest
 * without the root and the optional 5th, in the closest position around middle C.
 * @returns {{ rh: [{midi, name, tone}], lh: [{midi, name}], fingers: number[] }}
 */
export function compVoicing(ch) {
  const big = ch.tones.some((x) => x.kind === 'tension');
  const pick = ch.tones.filter((x) => (big ? x.semi !== 0 && x.req : true));
  let rh;
  if (!big) {
    const r = 55 + ((ch.root.pc - 55 % 12 + 12) % 12);
    rh = pick.map((x) => ({ midi: r + x.semi, tone: x }));
  } else {
    // try each rotation: stack upward, keep the lowest note in G3..F#4, take the smallest span
    let best = null;
    const pcs = pick.slice().sort((a, b) => a.pc - b.pc);
    for (let k = 0; k < pcs.length; k++) {
      const order = pcs.slice(k).concat(pcs.slice(0, k));
      let m = 55 + ((order[0].pc - 55 % 12 + 12) % 12);
      const out = [{ midi: m, tone: order[0] }];
      for (let i = 1; i < order.length; i++) { let n = m + 1; while (n % 12 !== order[i].pc) n++; out.push({ midi: n, tone: order[i] }); m = n; }
      const span = out[out.length - 1].midi - out[0].midi;
      if (!best || span < best.span) best = { span, out };
    }
    rh = best.out;
  }
  rh.forEach((x) => { x.name = pitch(x.midi, x.tone.letter, x.tone.alt); });
  const b = ch.bass || ch.root;
  const lm = 41 + ((b.pc - 41 % 12 + 12) % 12); // F2..E3
  const lh = [{ midi: lm, name: pitch(lm, b.letter, b.alt) }];
  const n = rh.length, span = rh[n - 1].midi - rh[0].midi;
  const fingers = n >= 5 ? [1, 2, 3, 4, 5] : n === 4 ? [1, 2, 3, 5] : n === 3 ? (span <= 5 ? [1, 2, 3] : [1, 3, 5]) : n === 2 ? [1, 5] : [1];
  return { rh, lh, fingers };
}

/** Lesson (content/chords/lessons.json) → raw exercise JSON. */
export function compExercise(lesson) {
  const c = lesson.comp;
  const hits = parsePattern(c.rhythm).filter((e) => !e.rest);
  if (!hits.length) throw new Error('comp rhythm has no notes: ' + lesson.id);
  const bars = c.bars.map((sym) => {
    const v = compVoicing(parseChord(sym));
    const rh = hits.map((e) => ({ t: e.t, d: e.d, n: v.rh.map((x) => x.name), f: v.fingers, sug: true }));
    const first = hits[0];
    const lh = [{ t: first.t, d: first.d, n: v.lh.map((x) => x.name), f: [5], sug: true }];
    return { rh, lh, sym };
  });
  return {
    $format: 'jazzlab-exercise/1',
    id: 'ch-' + lesson.id, course: 'chords', step: lesson.n, number: 1,
    kicker: { ru: `АККОРДЫ · ШАГ ${lesson.n}`, en: `CHORDS · STEP ${lesson.n}` },
    back: '#/chords/l/' + lesson.id,
    title: { ru: 'В ритме: ' + c.bars.join(' – '), en: 'In rhythm: ' + c.bars.join(' – ') },
    about: {
      ru: 'Сначала ритм одной клавишей, потом аккорды: правая рука аккорд, левая корень. Аккорды по тактам: ' + c.bars.join(' | ') + '.',
      en: 'Rhythm first on one key, then the chords: right hand the chord, left hand the root. Bars: ' + c.bars.join(' | ') + '.'
    },
    time: [4, 4], tempo: c.tempo || { start: 60, target: 90 }, swing: !!c.swing, rhythm: c.rhythm,
    dyn: [{ bar: 0, mark: 'mf', level: 0.7 }],
    bars: bars.map(({ rh, lh }) => ({ rh, lh }))
  };
}
