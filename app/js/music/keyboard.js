// On-screen keyboard: shows what to press (finger badges), what comes next, and MIDI feedback.
import { isBlack, SHARP_NAMES, toMidi, noteName } from './notes.js';
import { t } from '../i18n.js';

/**
 * @param el     container element
 * @param range  [lowMidi, highMidi] of the exercise
 * @param opts   {onPress(midi), names: 'en'|'ru'|'off', center: midi shown first on a narrow screen,
 *                exact: true = show exactly the range (snapped out to white keys) instead of whole octaves}
 *
 * DOM: el (.kbwrap, the frame) > .kbscroll (scrolls sideways on a phone) > .kb (the keys), plus two
 * octave buttons (.kbnav) over the edges of the frame. On a desktop the keys fit the width, nothing scrolls
 * and the buttons are hidden; on a phone (<=640px) a white key is 44px wide and reveal() keeps the keys
 * the learner must press in view.
 */
export function createKeyboard(el, range, opts = {}) {
  let [lo, hi] = range;
  if (opts.exact) { if (isBlack(lo)) lo--; if (isBlack(hi)) hi++; }
  else { lo = lo - (lo % 12); hi = hi + 2; while (isBlack(hi)) hi++; }
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const w = 100 / whites.length;
  const keys = {};
  if (el._kbro) el._kbro.disconnect(); // re-created in place (decoder): drop the old observer
  el.innerHTML = '';
  el.classList.remove('kb');
  el.classList.add('kbwrap');
  el.style.setProperty('--nw', whites.length);
  const scroller = document.createElement('div');
  scroller.className = 'kbscroll';
  const row = document.createElement('div');
  row.className = 'kb';
  scroller.appendChild(row);
  el.appendChild(scroller);
  const octave = (dir) => {
    const wk = row.querySelector('.key.white');
    const step = (wk ? wk.offsetWidth : 44) * 7;
    scroller.scrollBy({ left: dir * step, behavior: 'smooth' });
  };
  const navBtn = (dir, label, sym) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'kbnav ' + (dir < 0 ? 'prev' : 'next');
    b.setAttribute('aria-label', label); b.title = label; b.textContent = sym;
    b.addEventListener('click', () => octave(dir));
    el.appendChild(b);
    return b;
  };
  const prevB = navBtn(-1, t('kbOctDown'), '‹');
  const nextB = navBtn(1, t('kbOctUp'), '›');
  for (let m = lo; m <= hi; m++) {
    const k = document.createElement('div');
    const name = SHARP_NAMES[m % 12] + (Math.floor(m / 12) - 1);
    k.className = 'key ' + (isBlack(m) ? 'black' : 'white') + (m === 60 ? ' mid' : '');
    k.innerHTML = '<span class="badge"></span><span class="lbl"></span>';
    k.dataset.m = m; k.dataset.n = name;
    if (isBlack(m)) { const wi = whites.indexOf(m - 1); k.style.left = ((wi + 1) * w - w * 0.31) + '%'; k.style.width = (w * 0.62) + '%'; }
    k.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      if (opts.onPress) opts.onPress(m);
      k.classList.add('press'); setTimeout(() => k.classList.remove('press'), 120);
    });
    row.appendChild(k); keys[m] = k;
  }
  const setNames = (mode) => {
    for (const m in keys) keys[m].querySelector('.lbl').textContent = mode === 'off' ? '' : noteName(keys[m].dataset.n, mode);
  };
  setNames(opts.names || 'en');
  const STATE = /\s(on-r|on-l|nx-r|nx-l|sug|acc|muted)\b/g;

  // ---- sideways scrolling (phone) ----
  const paintNav = () => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    prevB.disabled = scroller.scrollLeft <= 1;
    nextB.disabled = scroller.scrollLeft >= max - 1;
  };
  scroller.addEventListener('scroll', paintNav, { passive: true });
  let lastReveal = null;
  /** Scroll so the given keys are in view (centred, clamped), if any of them is outside the visible part
   *  (force: centre them even if they are already visible). */
  function reveal(midis, smooth = true, force = false) {
    const ks = [].concat(midis || []).map((m) => keys[m]).filter(Boolean);
    if (!ks.length) return;
    lastReveal = ks.map((k) => +k.dataset.m);
    const vw = scroller.clientWidth;
    if (!vw) return; // hidden: done again when it gets a size (see the observer below)
    const max = scroller.scrollWidth - vw;
    if (max <= 0) { paintNav(); return; } // everything fits (desktop)
    let a = Infinity, b = -Infinity;
    for (const k of ks) { a = Math.min(a, k.offsetLeft); b = Math.max(b, k.offsetLeft + k.offsetWidth); }
    const x = scroller.scrollLeft;
    if (!force && a >= x && b <= x + vw) { paintNav(); return; }
    const left = Math.max(0, Math.min(max, Math.round((a + b) / 2 - vw / 2)));
    scroller.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
    if (!smooth) paintNav();
  }
  let lastW = 0, centred = false;
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    const w = scroller.clientWidth;
    if (w && w !== lastW && lastReveal) { reveal(lastReveal, false, !centred); centred = true; }
    lastW = w; paintNav();
  }) : null;
  if (ro) { ro.observe(scroller); el._kbro = ro; }
  // first view: the middle of the exercise range (or opts.center)
  let c = opts.center != null ? opts.center : Math.round((range[0] + range[1]) / 2);
  if (isBlack(c)) c++;
  lastReveal = [c];
  const centre = () => { if (!centred && el.isConnected && scroller.clientWidth) { reveal(lastReveal, false, true); centred = true; } };
  centre(); // the screens build the keyboard after it is in the DOM, so the widths are known now
  requestAnimationFrame(centre); // otherwise after the first layout, or by the observer once it gets a size

  return {
    setNames,
    /** cur: {rh, lh} events at the cursor; next: {rh, lh} upcoming events; hands: 'both'|'rh'|'lh' */
    show(cur, next, hands) {
      for (const m in keys) { keys[m].className = keys[m].className.replace(STATE, ''); keys[m].querySelector('.badge').textContent = ''; }
      const on = (h) => hands === 'both' || hands === h;
      const mark = (e, h, cls) => {
        if (!e) return;
        e.notes.forEach((n, i) => {
          const k = keys[toMidi(n)]; if (!k) return;
          k.classList.add(cls + '-' + h[0]);
          if (!on(h)) k.classList.add('muted');
          if (cls === 'on') { k.querySelector('.badge').textContent = e.f[i] || ''; if (e.sug) k.classList.add('sug'); if (e.acc) k.classList.add('acc'); }
        });
      };
      mark(next.rh, 'rh', 'nx'); mark(next.lh, 'lh', 'nx');
      mark(cur.rh, 'rh', 'on'); mark(cur.lh, 'lh', 'on');
      const want = [];
      for (const h of ['rh', 'lh']) {
        if (!on(h)) continue;
        for (const e of [cur[h], next[h]]) if (e) e.notes.forEach((n) => want.push(toMidi(n)));
      }
      if (want.length) reveal(want);
    },
    flash(m, cls) {
      const k = keys[m]; if (!k) return;
      k.classList.remove('ok', 'meh', 'bad'); void k.offsetWidth; k.classList.add(cls);
      clearTimeout(k._ft); k._ft = setTimeout(() => k.classList.remove(cls), cls === 'bad' ? 450 : 300);
    },
    down(m, isDown) { const k = keys[m]; if (k) k.classList.toggle('down', isDown); },
    /** Chord mode: colour keys. map: { midi: { cls: 'base'|'third'|'seventh'|'tension'|'bass'|'hit'|'wrong'|'miss', label } }
     *  opts.reveal === false: do not scroll to the marked keys (the solo palette marks every octave). */
    mark(map, opts = {}) {
      for (const m in keys) {
        const k = keys[m];
        k.className = k.className.replace(/\smk-[a-z]+\b/g, '');
        k.querySelector('.badge').textContent = '';
        const v = map[m];
        if (v) { k.classList.add('mk-' + v.cls); k.querySelector('.badge').textContent = v.label || ''; }
      }
      const ms = Object.keys(map).filter((m) => map[m]).map(Number);
      if (ms.length && opts.reveal !== false) reveal(ms);
    },
    /** Ear games: zone = [a, b] the target is in (keys outside are dimmed), win = [a, b] what is still possible
     *  (zone keys outside it are struck out), bar = a strip above the keys: { kind: 'zone'|'arrow', from, to, label }. */
    zone({ zone = null, win = null, bar = null } = {}) {
      const inR = (r, m) => r && m >= r[0] && m <= r[1];
      for (const m in keys) {
        const k = keys[m], n = +m;
        k.classList.toggle('ez-in', !!zone && inR(zone, n));
        k.classList.toggle('ez-out', !!zone && !inR(zone, n));
        k.classList.toggle('ez-elim', !!zone && !!win && inR(zone, n) && !inR(win, n));
      }
      el.classList.toggle('haszone', !!bar);
      let strip = row.querySelector('.kbbar');
      if (!bar) { if (strip) strip.remove(); return; }
      if (!strip) { strip = document.createElement('div'); row.appendChild(strip); }
      const edge = (m, right) => { // % from the left of the row
        if (!keys[m]) return m < lo ? 0 : 100;
        if (!isBlack(m)) return (whites.indexOf(m) + (right ? 1 : 0)) * w;
        return (whites.indexOf(m - 1) + 1) * w + (right ? 0.31 : -0.31) * w;
      };
      const mid = (m) => (edge(m, false) + edge(m, true)) / 2;
      let a, b;
      if (bar.kind === 'arrow') { a = Math.min(mid(bar.from), edge(bar.to, bar.to > bar.from)); b = Math.max(mid(bar.from), edge(bar.to, bar.to > bar.from)); }
      else { a = edge(bar.from, false); b = edge(bar.to, true); }
      strip.className = 'kbbar ' + bar.kind + (bar.kind === 'arrow' && bar.to < bar.from ? ' left' : '');
      strip.style.left = a + '%'; strip.style.width = Math.max(b - a, w) + '%';
      const label = bar.label || '';
      strip.textContent = bar.kind === 'arrow' && b - a < 3.5 * w ? (bar.to > bar.from ? '→' : '←') : label;
    },
    reveal,
    has: (m) => !!keys[m]
  };
}
