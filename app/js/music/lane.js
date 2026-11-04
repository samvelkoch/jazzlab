// Rhythm lane: note bars whose length = the sound, syllables, beat numbers, your taps under them.
// Learn mode shows one bar with a bouncing ball; practice mode scrolls the whole exercise to a hit line.
import { h } from '../ui.js';
import { barRhythm } from './rhythm.js';

const HIT = 0.22; // practice: hit line position (share of the lane width)
const VIEW = 2; // practice: bars visible at once

export function createLane(ex) {
  const per = ex.per;
  const strip = h('div.strip');
  const head = h('div.head');
  const ball = h('div.ball');
  const el = h('div.lane', null, strip);
  let a0 = 0, total = per, mode = 'learn', notes = new Map(), taps = [], badges = new Map();
  const pct = (slot) => ((slot - a0) / total) * 100;

  /** Draw bars [b0, b1). opts: { mode: 'learn' | 'practice', lang, syl: bool } */
  function build(b0, b1, opts) {
    mode = opts.mode; el.dataset.mode = mode;
    a0 = b0 * per; total = (b1 - b0) * per;
    strip.style.width = mode === 'learn' ? '100%' : `${((b1 - b0) / VIEW) * 100}%`;
    notes = new Map(); badges = new Map(); taps = [];
    const kids = [h('div.tline')];
    for (let b = b0; b < b1; b++) {
      const r = barRhythm(ex, b, opts.lang), base = b * per;
      for (let k = 0; k < per; k += 2) {
        kids.push(h('div.bline' + (k === 0 ? '.bar' : ''), { style: `left:${pct(base + k)}%` }));
        kids.push(h('div.bnum', { style: `left:${pct(base + k)}%`, 'data-slot': base + k }, String(k / 2 + 1)));
        if (mode === 'learn') kids.push(h('div.bnum.and', { style: `left:${pct(base + k + 1)}%`, 'data-slot': base + k + 1 }, '+'));
      }
      r.rests.forEach((x) => kids.push(h('div.lrest', { style: `left:${pct(base + x.slot)}%;width:calc(${(100 * (x.len || 1)) / total}% - 8px)` }, opts.syl ? x.syl : '')));
      r.onsets.forEach((o) => {
        const n = h('div.lnote' + (o.acc ? '.acc' : ''), { style: `left:${pct(base + o.slot)}%;width:calc(${(100 * o.len) / total}% - 8px)`, 'data-slot': base + o.slot },
          o.acc ? h('i', null, '>') : null, opts.syl ? h('span', null, o.syl) : null);
        notes.set(base + o.slot, n); kids.push(n);
      });
    }
    strip.replaceChildren(...kids, head, ball);
    setPos(mode === 'learn' ? a0 : a0 - 2);
  }
  /** p = position in eighth slots (absolute, may be fractional or before the start). */
  function setPos(p) {
    if (mode === 'learn') {
      const x = Math.max(0, Math.min(100, pct(p)));
      head.style.left = ball.style.left = x + '%';
      const f = (((p - a0) / 2) % 1 + 1) % 1; // share of the current beat
      ball.style.transform = `translate(-50%, ${-Math.sin(Math.PI * f) * 34}px)`;
      strip.querySelectorAll('.bnum').forEach((n) => n.classList.toggle('cur', Math.floor(p) === +n.dataset.slot));
      notes.forEach((n, s) => n.classList.toggle('now', p > a0 && p >= s && p < s + 1));
    } else {
      strip.style.transform = `translateX(${(HIT * VIEW / (total / per) - (p - a0) / total) * 100}%)`;
      notes.forEach((n, s) => n.classList.toggle('past', p > s + 1));
    }
  }
  function addTap(p, cls, label) {
    const t = h('div.tick.' + cls, { style: `left:${pct(p)}%` }, mode === 'learn' && label ? h('span', null, label) : null);
    strip.append(t); taps.push(t);
  }
  function clearTaps() { taps.forEach((t) => t.remove()); taps = []; notes.forEach((n) => n.classList.remove('ok', 'meh', 'bad')); }
  function mark(slot, cls) { const n = notes.get(slot); if (n) { n.classList.remove('ok', 'meh', 'bad'); if (cls) n.classList.add(cls); } }
  function badge(b, text) {
    if (badges.has(b)) return;
    const x = h('div.lbadge', { style: `left:${pct(b * per + per / 2)}%` }, text);
    badges.set(b, x); strip.append(x);
  }
  return { el, build, setPos, addTap, clearTaps, mark, badge };
}
