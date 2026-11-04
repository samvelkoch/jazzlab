// Grand-staff SVG renderer for one exercise (eighth-note grid).
import { dia, noteName, midiToName } from './notes.js';

const SV = { L: 84, BW: 229, SLOT: 25, PAD: 24, hs: 6, tTop: 60, bTop: 210, H: 330 };
const STF = { t: { top: SV.tTop, bot: 30, mid: 34 }, b: { top: SV.bTop, bot: 18, mid: 22 } };
const yOf = (d, st) => STF[st].top + 48 - (d - STF[st].bot) * SV.hs;
const xOf = (bar, slot) => SV.L + bar * SV.BW + SV.PAD + slot * SV.SLOT;

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
const sharp = (x, y) => `<text class="accd" x="${x - 21}" y="${y + 5}">♯</text>`;
const flat = (x, y) => `<text class="accd" x="${x - 20}" y="${y + 5}">♭</text>`;

/**
 * @param svg  <svg> element to draw into
 * @param ex   normalized exercise
 * @param opts {names: 'en'|'ru'|'off', onPick(i)}
 */
export function createStaff(svg, ex, opts = {}) {
  const per = ex.per;
  const names = opts.names || 'en';
  const W = SV.L + ex.bars.length * SV.BW + 6;
  let o = `<rect class="band" x="0" y="4" width="26" height="${SV.H - 8}" rx="6"/>`;
  ['t', 'b'].forEach((st) => { for (let k = 0; k < 5; k++) { const y = STF[st].top + k * 12; o += `<line class="ln" x1="10" x2="${W - 6}" y1="${y}" y2="${y}"/>`; } });
  o += `<line class="bl" x1="10" x2="10" y1="${SV.tTop}" y2="${SV.bTop + 48}"/>`;
  for (let b = 1; b <= ex.bars.length; b++) {
    const x = SV.L + b * SV.BW;
    o += b < ex.bars.length
      ? `<line class="bl" x1="${x}" x2="${x}" y1="${SV.tTop}" y2="${SV.bTop + 48}"/>`
      : `<line class="bl" x1="${x - 6}" x2="${x - 6}" y1="${SV.tTop}" y2="${SV.bTop + 48}"/><rect class="ink" x="${x - 3}" y="${SV.tTop}" width="4" height="${SV.bTop + 48 - SV.tTop}"/>`;
  }
  o += `<text class="clef" x="14" y="${SV.tTop + 37}" font-size="48">\u{1D11E}</text>`;
  o += `<text class="clef" x="14" y="${SV.bTop + 25}" font-size="44">\u{1D122}</text>`;
  ['t', 'b'].forEach((st) => { o += `<text class="ts" x="52" y="${STF[st].top + 21}">${ex.beats}</text><text class="ts" x="52" y="${STF[st].top + 45}">4</text>`; });
  ex.dyn.forEach((d, k) => {
    const x = SV.L + d.bar * SV.BW + SV.PAD - 8, y = 186;
    if (d.cresc) {
      const nx = ex.dyn[k + 1];
      const x2 = SV.L + (nx ? nx.bar : ex.bars.length) * SV.BW - 12;
      o += `<path class="ink-s" stroke-width="1.3" d="M${x2} ${y - 12} L${x + 4} ${y - 6} L${x2} ${y}"/>`;
    } else o += `<text class="dy" x="${x}" y="${y}">${d.mark}</text>`;
  });
  ex.bars.forEach((bar, bi) => {
    [['rh', 't', 'r'], ['lh', 'b', 'l']].forEach(([h, st, hc]) => {
      const evs = bar[h];
      restsFor(evs, per).forEach((r) => { o += restSVG(xOf(bi, r.t) + (r.d === 4 ? SV.SLOT * 1.5 : r.d === 2 ? SV.SLOT * 0.5 : 0), st, r.d); });
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
            const gx = x - 15, gd = dia(e.grace), gy = yOf(gd, st);
            s += `<g class="grace">${ledgers(gx, gd, st)}`;
            if (e.grace.includes('#')) s += `<text class="accd" font-size="11" x="${gx - 14}" y="${gy + 4}">♯</text>`; else if (/^[A-G]b/.test(e.grace)) s += `<text class="accd" font-size="11" x="${gx - 13}" y="${gy + 4}">♭</text>`;
            s += `<ellipse cx="${gx}" cy="${gy}" rx="4.2" ry="3.1" transform="rotate(-20 ${gx} ${gy})" fill="currentColor"/>`;
            s += `<line stroke="currentColor" stroke-width="1" x1="${gx + 3.8}" x2="${gx + 3.8}" y1="${gy}" y2="${gy - 20}"/><path fill="none" stroke="currentColor" stroke-width="1" d="M${gx + 3.8} ${gy - 20} q2 6 6 8"/>`;
            s += `<line stroke="currentColor" stroke-width="1" x1="${gx - 1}" x2="${gx + 9}" y1="${gy - 6}" y2="${gy - 15}"/></g>`;
          }
          e.notes.forEach((n, k) => {
            const y = ys[k];
            if (n.includes('#')) s += sharp(x, y); else if (/^[A-G]b/.test(n)) s += flat(x, y);
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
          if (names !== 'off') e.notes.forEach((n, k) => { const y = h === 'rh' ? 166 - k * 12 : 314 - k * 11; s += `<text class="nm ${hc}" data-i="${i}" x="${x}" y="${y}">${noteName(n, names)}</text>`; });
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
    mark(i, cls) {
      svg.querySelectorAll(`.nt[data-i="${i}"]`).forEach((g) => { g.classList.remove('ok', 'meh', 'bad'); if (cls) g.classList.add(cls); });
    },
    clearMarks() { svg.querySelectorAll('.nt.ok,.nt.meh,.nt.bad').forEach((g) => g.classList.remove('ok', 'meh', 'bad')); },
    /** Grey note showing where a pressed key sits on the staff. */
    ghost(m) {
      const n = midiToName(m), st = m >= 60 ? 't' : 'b', d = dia(n), y = yOf(d, st);
      const x = xOf(Math.floor(cursor / per), cursor % per) + SV.SLOT * 0.5 + 4;
      let g = ledgers(x, d, st);
      if (n.includes('#')) g += sharp(x, y);
      g += `<ellipse cx="${x}" cy="${y}" rx="6.3" ry="4.6" transform="rotate(-20 ${x} ${y})" fill="currentColor"/>`;
      g += `<text x="${x + 10}" y="${y - 8}">${noteName(n, names === 'off' ? 'en' : names)}</text>`;
      ghostEl.innerHTML = g; ghostEl.style.opacity = 1;
      clearTimeout(ghostT); ghostT = setTimeout(() => { ghostEl.style.opacity = 0; }, 2200);
    }
  };
}
