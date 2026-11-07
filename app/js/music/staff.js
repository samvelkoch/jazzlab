// Grand-staff SVG renderer for one exercise (eighth-note grid).
import { dia, noteName, midiToName } from './notes.js';

const SV = { L: 84, SLOT: 25, PAD: 24, hs: 6, tTop: 60, bTop: 210, H: 330 };
const STF = { t: { top: SV.tTop, bot: 30, mid: 34 }, b: { top: SV.bTop, bot: 18, mid: 22 } };
const yOf = (d, st) => STF[st].top + 48 - (d - STF[st].bot) * SV.hs;

function restsFor(evs, per) {
  const occ = new Array(per).fill(false);
  evs.forEach((e) => { for (let k = e.t; k < e.t + e.d; k++) occ[k] = true; });
  const out = [];
  let s = 0;
  while (s < per) {
    if (occ[s]) { s++; continue; }
    let e = s; while (e < per && !occ[e]) e++;
    let p = s;
    while (p < e) { const len = e - p; const d = p % 4 === 0 && len >= 4 ? 4 : p % 2 === 0 && len >= 2 ? 2 : 1; out.push({ t: p, d }); p += d; }
    s = e;
  }
  return out;
}
function restSVG(x, st, d) {
  const m = STF[st].top + 24;
  if (d >= 4) return `<rect class="ink" x="${x - 7}" y="${m - 5}" width="14" height="5"/>`;
  if (d === 2) return `<path class="ink-s" stroke-width="2.6" stroke-linejoin="round" d="M${x - 3} ${m - 17} L${x + 4} ${m - 8} L${x - 2} ${m - 1} L${x + 4} ${m + 6} Q${x - 7} ${m + 3} ${x} ${m + 14}"/>`;
  return `<circle class="ink" cx="${x - 3}" cy="${m - 6}" r="3"/><path class="ink-s" stroke-width="1.8" d="M${x - 3} ${m - 4} Q${x + 1} ${m - 3} ${x + 5} ${m - 9} L${x - 1} ${m + 9}"/>`;
}
function ledgers(x, d, st) {
  let s = '';
  const b0 = STF[st].bot, t0 = b0 + 8;
  for (let k = b0 - 2; k >= d; k -= 2) s += `<line class="ledger" x1="${x - 10}" x2="${x + 10}" y1="${yOf(k, st)}" y2="${yOf(k, st)}"/>`;
  for (let k = t0 + 2; k <= d; k += 2) s += `<line class="ledger" x1="${x - 10}" x2="${x + 10}" y1="${yOf(k, st)}" y2="${yOf(k, st)}"/>`;
  return s;
}
// Accidentals are drawn as paths (not font glyphs): same bold shape on every device.
// Sizes in staff units (1 space = 12). (x, y) = notehead centre; c = column (0 nearest the head).
const HEAD = 6.3, ACC_W = 10, ACC_GAP = 3, ACC_COL = ACC_W + 1.5;
const accOf = (n) => (/^[A-G]#/.test(n) ? 1 : /^[A-G]b/.test(n) ? -1 : 0);
function accSVG(a, x, y, c = 0, k = 1) {
  const r = x - k * (HEAD + ACC_GAP) - c * ACC_COL * k; // right edge of the sign
  const L = (v) => (r - (ACC_W - v) * k).toFixed(1), Y = (v) => (y + v * k).toFixed(1);
  if (a > 0) {
    const bar = (yy) => `M${L(0)} ${Y(yy + 1.8)} L${L(10)} ${Y(yy - 1.2)} L${L(10)} ${Y(yy - 4.9)} L${L(0)} ${Y(yy - 1.9)} Z`;
    return `<g class="acc"><path d="${bar(-2.6)} ${bar(5.6)}"/>` +
      `<path class="acc-s" stroke-width="${1.6 * k}" d="M${L(3)} ${Y(-12)} L${L(3)} ${Y(15.5)} M${L(7.2)} ${Y(-14.5)} L${L(7.2)} ${Y(13)}"/></g>`;
  }
  // flat: tall stem + filled bowl with an open counter
  return `<g class="acc"><path class="acc-s" stroke-width="${1.7 * k}" d="M${L(1.6)} ${Y(-18)} L${L(1.6)} ${Y(5.6)}"/>` +
    `<path d="M${L(1)} ${Y(-1.6)} C${L(4)} ${Y(-6.4)} ${L(10.4)} ${Y(-6.6)} ${L(9.6)} ${Y(-1.6)} C${L(9.2)} ${Y(1.4)} ${L(5)} ${Y(4)} ${L(1)} ${Y(6.2)} L${L(1)} ${Y(3.6)}` +
    ` C${L(4)} ${Y(1.8)} ${L(6.6)} ${Y(0)} ${L(6.6)} ${Y(-2)} C${L(6.6)} ${Y(-4.4)} ${L(3.6)} ${Y(-3.6)} ${L(1)} ${Y(0.6)} Z"/></g>`;
}
/** Column per note for a chord's accidentals: signs closer than a 6th stack leftwards (top one nearest the head). */
function accCols(notes) {
  const cols = notes.map(() => -1), used = [];
  notes.map((n, k) => ({ n, k, d: dia(n) })).filter((o) => accOf(o.n)).sort((a, b) => b.d - a.d).forEach((o) => {
    let c = 0;
    while ((used[c] || []).some((d) => Math.abs(d - o.d) < 6)) c++;
    (used[c] = used[c] || []).push(o.d); cols[o.k] = c;
  });
  return { cols, n: used.length };
}
const GRACE_K = 0.7;
/** Grace-note x offset left of the main note (clears the main note's accidentals). */
const graceOff = (e) => { const ac = accCols(e.notes).n; return ac ? HEAD + ACC_GAP + ac * ACC_COL + 6 : 15; };
/** Ink extents of an event around its x: how far it reaches left / right. */
function extents(e) {
  const ac = accCols(e.notes).n;
  let left = ac ? HEAD + ACC_GAP + ac * ACC_COL - 1.5 : HEAD;
  if (e.grace) left = Math.max(left, graceOff(e) + (accOf(e.grace) ? GRACE_K * (HEAD + ACC_GAP + ACC_W) : 4.2));
  const right = e.d === 3 || e.d === 6 ? 13 : HEAD;
  return { left, right };
}
/** Note name with a larger ♯/♭ (body fonts draw them tiny). */
const nameSVG = (n, mode) => noteName(n, mode).replace(/[♯♭]/g, (c) => `<tspan class="nma">${c}</tspan>`);
let measureCtx = null;
function textW(str, px, fam) {
  try {
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    measureCtx.font = `700 ${px}px ${fam}`;
    return measureCtx.measureText(str).width;
  } catch (err) { return str.length * px * 0.62; }
}

/**
 * Horizontal layout. Slot spacing follows the rhythm (an eighth = SLOT, a held slot is narrower,
 * like engraved music), then widens wherever accidentals or note-name labels of neighbouring notes would touch.
 */
function layout(ex, names, fam) {
  const per = ex.per, pos = [], barX = [SV.L];
  const prev = { rh: null, lh: null }; // last note event per hand: {x, right, lw}
  const labelW = (e) => (names === 'off' ? 0 : Math.max(...e.notes.map((n) => textW(noteName(n, names), 12, fam) + (accOf(n) ? 4 : 0))));
  ex.bars.forEach((bar, bi) => {
    const onset = new Array(per).fill(false), at = { rh: [], lh: [] };
    ['rh', 'lh'].forEach((h) => {
      bar[h].forEach((e) => { onset[e.t] = true; at[h][e.t] = e; });
      restsFor(bar[h], per).forEach((r) => { onset[r.t] = true; if (r.d === 1) at[h][r.t] = { rest: true }; });
    });
    const row = [];
    for (let s = 0; s < per; s++) {
      let x = s === 0 ? barX[bi] + SV.PAD : row[s - 1] + (onset[s] ? SV.SLOT : SV.SLOT * 0.6);
      ['rh', 'lh'].forEach((h) => {
        const e = at[h][s]; if (!e || e.rest) return;
        const ext = extents(e), lw = labelW(e), p = prev[h];
        if (s === 0) x = Math.max(x, barX[bi] + ext.left + 7);
        if (p) x = Math.max(x, p.x + p.right + 4 + ext.left, lw && p.lw ? p.lx + (p.lw + lw) / 2 + 6 : 0);
      });
      row.push(x);
      ['rh', 'lh'].forEach((h) => {
        const e = at[h][s]; if (!e) return;
        prev[h] = e.rest ? { x, right: 9, lw: prev[h] ? prev[h].lw : 0, lx: prev[h] && prev[h].lx } : { x, lx: x, right: extents(e).right, lw: labelW(e) };
      });
    }
    pos.push(row);
    barX.push(row[per - 1] + SV.SLOT + 5);
  });
  // slot == per maps to where the next slot would be (for centring rests)
  const P = (bar, slot) => (slot >= per ? barX[bar + 1] - 5 : pos[bar][slot]);
  return { P, barX };
}

/**
 * @param svg  <svg> element to draw into
 * @param ex   normalized exercise
 * @param opts {names: 'en'|'ru'|'off', onPick(i)}
 */
export function createStaff(svg, ex, opts = {}) {
  const per = ex.per;
  const names = opts.names || 'en';
  const fam = (typeof getComputedStyle === 'function' && getComputedStyle(svg).getPropertyValue('--body').trim()) || 'sans-serif';
  const { P, barX } = layout(ex, names, fam), xOf = P;
  const W = barX[ex.bars.length] + 6;
  let o = `<rect class="band" x="0" y="4" width="26" height="${SV.H - 8}" rx="6"/>`;
  ['t', 'b'].forEach((st) => { for (let k = 0; k < 5; k++) { const y = STF[st].top + k * 12; o += `<line class="ln" x1="10" x2="${W - 6}" y1="${y}" y2="${y}"/>`; } });
  o += `<line class="bl" x1="10" x2="10" y1="${SV.tTop}" y2="${SV.bTop + 48}"/>`;
  for (let b = 1; b <= ex.bars.length; b++) {
    const x = barX[b];
    o += b < ex.bars.length
      ? `<line class="bl" x1="${x}" x2="${x}" y1="${SV.tTop}" y2="${SV.bTop + 48}"/>`
      : `<line class="bl" x1="${x - 6}" x2="${x - 6}" y1="${SV.tTop}" y2="${SV.bTop + 48}"/><rect class="ink" x="${x - 3}" y="${SV.tTop}" width="4" height="${SV.bTop + 48 - SV.tTop}"/>`;
  }
  o += `<text class="clef" x="14" y="${SV.tTop + 37}" font-size="48">\u{1D11E}</text>`;
  o += `<text class="clef" x="14" y="${SV.bTop + 25}" font-size="44">\u{1D122}</text>`;
  ['t', 'b'].forEach((st) => { o += `<text class="ts" x="52" y="${STF[st].top + 21}">${ex.beats}</text><text class="ts" x="52" y="${STF[st].top + 45}">4</text>`; });
  ex.dyn.forEach((d, k) => {
    const x = P(d.bar, 0) - 8, y = 186;
    if (d.cresc) {
      const nx = ex.dyn[k + 1];
      const x2 = barX[nx ? nx.bar : ex.bars.length] - 12;
      o += `<path class="ink-s" stroke-width="1.3" d="M${x2} ${y - 12} L${x + 4} ${y - 6} L${x2} ${y}"/>`;
    } else o += `<text class="dy" x="${x}" y="${y}">${d.mark}</text>`;
  });
  ex.bars.forEach((bar, bi) => {
    [['rh', 't', 'r'], ['lh', 'b', 'l']].forEach(([h, st, hc]) => {
      const evs = bar[h];
      restsFor(evs, per).forEach((r) => { o += restSVG(r.d === 4 ? (P(bi, r.t) + P(bi, r.t + 3)) / 2 : r.d === 2 ? (P(bi, r.t) + P(bi, r.t + 1)) / 2 : P(bi, r.t), st, r.d); });
      const groups = [];
      for (let k = 0; k < evs.length; k++) {
        const e = evs[k], n = evs[k + 1];
        if (e.d === 1 && e.t % 2 === 0 && n && n.t === e.t + 1 && n.d === 1) { groups.push([e, n]); k++; } else groups.push([e]);
      }
      groups.forEach((g) => {
        const ds = g.flatMap((e) => e.notes.map(dia));
        const up = ds.reduce((a, b) => a + b, 0) / ds.length < STF[st].mid;
        const ends = g.map((e) => { const ys = e.notes.map((n) => yOf(dia(n), st)); return up ? Math.min(...ys) - 34 : Math.max(...ys) + 34; });
        const end = up ? Math.min(...ends) : Math.max(...ends);
        const sx = [];
        g.forEach((e) => {
          const i = bi * per + e.t, x = xOf(bi, e.t), ys = e.notes.map((n) => yOf(dia(n), st)), d = e.d;
          const sxx = up ? x + 5.6 : x - 5.6; sx.push(sxx);
          let s = `<g class="nt ${hc}" data-i="${i}">`;
          e.notes.forEach((n) => { s += ledgers(x, dia(n), st); });
          if (e.grace) { // small slashed eighth just before the main note
            const gx = x - graceOff(e), gd = dia(e.grace), gy = yOf(gd, st);
            s += `<g class="grace">${ledgers(gx, gd, st)}`;
            if (accOf(e.grace)) s += accSVG(accOf(e.grace), gx, gy, 0, GRACE_K);
            s += `<ellipse cx="${gx}" cy="${gy}" rx="4.2" ry="3.1" transform="rotate(-20 ${gx} ${gy})" fill="currentColor"/>`;
            s += `<line stroke="currentColor" stroke-width="1" x1="${gx + 3.8}" x2="${gx + 3.8}" y1="${gy}" y2="${gy - 20}"/><path fill="none" stroke="currentColor" stroke-width="1" d="M${gx + 3.8} ${gy - 20} q2 6 6 8"/>`;
            s += `<line stroke="currentColor" stroke-width="1" x1="${gx - 1}" x2="${gx + 9}" y1="${gy - 6}" y2="${gy - 15}"/></g>`;
          }
          const ac = accCols(e.notes).cols;
          e.notes.forEach((n, k) => {
            const y = ys[k];
            if (accOf(n)) s += accSVG(accOf(n), x, y, ac[k]);
            s += d >= 4
              ? `<ellipse cx="${x}" cy="${y}" rx="6.3" ry="4.4" transform="rotate(-20 ${x} ${y})" fill="none" stroke="currentColor" stroke-width="1.8"/>`
              : `<ellipse cx="${x}" cy="${y}" rx="6.3" ry="4.6" transform="rotate(-20 ${x} ${y})" fill="currentColor"/>`;
            if (d === 3 || d === 6) s += `<circle cx="${x + 11}" cy="${y - 2}" r="1.9" fill="currentColor"/>`;
          });
          if (d < 8) s += `<line stroke="currentColor" stroke-width="1.4" x1="${sxx}" x2="${sxx}" y1="${up ? Math.max(...ys) : Math.min(...ys)}" y2="${end}"/>`;
          if (g.length === 1 && d === 1) s += up ? `<path fill="currentColor" d="M${sxx} ${end} q2 9 9 14 q3 4 0 12 q1 -9 -9 -14 z"/>` : `<path fill="currentColor" d="M${sxx} ${end} q2 -9 9 -14 q3 -4 0 -12 q1 9 -9 14 z"/>`;
          const ay = up ? Math.max(...ys) + 11 : Math.min(...ys) - 11;
          if (e.stac) s += `<circle cx="${x}" cy="${ay}" r="1.9" fill="currentColor"/>`;
          if (e.acc) { const y2 = up ? ay + 10 : ay - 10; s += `<path fill="none" stroke="currentColor" stroke-width="1.5" d="M${x - 6} ${y2 - 3.5} L${x + 6} ${y2} L${x - 6} ${y2 + 3.5}"/>`; }
          s += `<rect x="${x - 12}" y="${STF[st].top - 20}" width="24" height="90" fill="transparent"/></g>`;
          e.f.forEach((f, k) => { const y = h === 'rh' ? 32 - k * 12 : 286 - k * 11; s += `<text class="fg${e.sug ? ' sug' : ''}" x="${x - 3}" y="${y}">${f}</text>`; });
          if (names !== 'off') e.notes.forEach((n, k) => { const y = h === 'rh' ? 166 - k * 12 : 314 - k * 11; s += `<text class="nm ${hc}" data-i="${i}" x="${x}" y="${y}">${nameSVG(n, names)}</text>`; });
          o += s;
        });
        if (g.length === 2) { const y = up ? end : end - 5; o += `<rect class="ink" x="${sx[0]}" y="${y}" width="${sx[1] - sx[0]}" height="5"/>`; }
      });
    });
  });
  o += '<g class="ghost" style="opacity:0"></g>';
  svg.setAttribute('viewBox', `0 0 ${W} ${SV.H}`);
  svg.innerHTML = o;
  const band = svg.querySelector('.band'), ghostEl = svg.querySelector('.ghost');
  if (opts.onPick) svg.querySelectorAll('.nt').forEach((g) => g.addEventListener('click', () => opts.onPick(+g.dataset.i)));
  let ghostT = 0, cursor = 0;

  return {
    setCursor(i) {
      cursor = i;
      const bar = Math.floor(i / per), slot = i % per, x = xOf(bar, slot);
      band.setAttribute('x', x - 13);
      svg.querySelectorAll('.nt,.nm').forEach((el) => el.classList.toggle('cur', +el.dataset.i === i));
    },
    /** On-screen box of the cursor band (to scroll a narrow staff after it). */
    bandRect() { return band.getBoundingClientRect(); },
    mark(i, cls) {
      svg.querySelectorAll(`.nt[data-i="${i}"]`).forEach((g) => { g.classList.remove('ok', 'meh', 'bad'); if (cls) g.classList.add(cls); });
    },
    clearMarks() { svg.querySelectorAll('.nt.ok,.nt.meh,.nt.bad').forEach((g) => g.classList.remove('ok', 'meh', 'bad')); },
    /** Grey note showing where a pressed key sits on the staff. */
    ghost(m) {
      const n = midiToName(m), st = m >= 60 ? 't' : 'b', d = dia(n), y = yOf(d, st);
      const x = xOf(Math.floor(cursor / per), cursor % per) + SV.SLOT * 0.5 + 4;
      let g = ledgers(x, d, st);
      if (accOf(n)) g += accSVG(accOf(n), x, y);
      g += `<ellipse cx="${x}" cy="${y}" rx="6.3" ry="4.6" transform="rotate(-20 ${x} ${y})" fill="currentColor"/>`;
      g += `<text x="${x + 10}" y="${y - 8}">${noteName(n, names === 'off' ? 'en' : names)}</text>`;
      ghostEl.innerHTML = g; ghostEl.style.opacity = 1;
      clearTimeout(ghostT); ghostT = setTimeout(() => { ghostEl.style.opacity = 0; }, 2200);
    }
  };
}
