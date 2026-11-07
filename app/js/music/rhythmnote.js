// Rhythm pattern in notation, like the box above each exercise in the book: one line, note heads + stems,
// beamed eighths, rests, counting "1 + 2 + 3 + 4 +" underneath. x positions match the rhythm lane below it.
const NS = 'http://www.w3.org/2000/svg';
export const NOTE_X0 = 30, NOTE_W = 940; // same 3% / 94% inset as the lane

export function renderRhythmNotation(svg, events, per = 8) {
  const W = 1000, H = 138, LINE = 64, STEM = 22;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'rnote');
  svg.replaceChildren();
  const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.append(e); return e; };
  const xs = (slot) => NOTE_X0 + (slot / per) * NOTE_W + 26; // head position inside its slot
  el('line', { x1: 0, x2: W, y1: LINE, y2: LINE, class: 'staffline' });
  el('text', { x: 10, y: LINE - 6, class: 'tsig' }).textContent = String(per / 2);
  el('text', { x: 10, y: LINE + 22, class: 'tsig' }).textContent = '4';
  const groups = new Map();
  const isBeamed = (e, k) => {
    const n = events[k + 1], p = events[k - 1];
    const pairStart = !e.rest && e.d === 1 && e.t % 2 === 0 && n && !n.rest && n.d === 1;
    const pairEnd = !e.rest && e.d === 1 && e.t % 2 === 1 && p && !p.rest && p.d === 1 && p.t === e.t - 1;
    return pairStart ? 'start' : pairEnd ? 'end' : null;
  };
  events.forEach((e, k) => {
    const g = el('g', { class: 'rn' + (e.rest ? ' rest' : '') }); g.dataset.slot = e.t;
    groups.set(e.t, g);
    const x = xs(e.t);
    if (e.rest) {
      if (e.d >= 2) { // quarter rest
        el('path', { d: `M${x - 4} ${LINE - 26} l9 11 l-8 9 l9 11 c-8 -3 -13 1 -6 9`, class: 'glyph' }, g);
      } else { // eighth rest
        el('circle', { cx: x - 3, cy: LINE - 10, r: 4.5, class: 'fill' }, g);
        el('path', { d: `M${x - 3} ${LINE - 6} Q${x + 4} ${LINE - 6} ${x + 7} ${LINE - 14} L${x - 2} ${LINE + 18}`, class: 'glyph' }, g);
      }
      return;
    }
    el('ellipse', { cx: x, cy: LINE, rx: 10.5, ry: 7.5, transform: `rotate(-20 ${x} ${LINE})`, class: e.d >= 4 ? 'hollow' : 'fill' }, g); // half note = hollow head
    el('line', { x1: x + 9.5, x2: x + 9.5, y1: LINE - 3, y2: LINE - STEM - 30, class: 'stem' }, g);
    if (e.d === 1.5 || e.d === 3) el('circle', { cx: x + 20, cy: LINE - 4, r: 3, class: 'fill' }, g);
    const beam = isBeamed(e, k);
    if (beam === 'start') {
      const x2 = xs(events[k + 1].t);
      el('rect', { x: x + 8, y: LINE - STEM - 32, width: x2 - x + 3, height: 7, class: 'fill' }, g);
    } else if (!beam && e.d < 2 && e.d !== 1.5) { // single eighth: flag
      el('path', { d: `M${x + 9.5} ${LINE - STEM - 30} c2 12 16 14 12 30 c0 -10 -8 -14 -12 -16`, class: 'fill' }, g);
    }
  });
  for (let s = 0; s < per; s++) {
    const t = el('text', { x: xs(s), y: H - 10, class: 'count' + (s % 2 ? '' : ' beat') });
    t.textContent = s % 2 ? '+' : String(s / 2 + 1);
    t.dataset.slot = s;
  }
  return {
    /** highlight the note sounding at this slot (or -1 for none) */
    now(slot) {
      groups.forEach((g, s) => g.classList.toggle('now', s === slot));
      svg.querySelectorAll('.count').forEach((c) => c.classList.toggle('now', +c.dataset.slot === slot));
    }
  };
}
