// On-screen keyboard: shows what to press (finger badges), what comes next, and MIDI feedback.
import { isBlack, SHARP_NAMES, toMidi, noteName } from './notes.js';

/**
 * @param el     container element
 * @param range  [lowMidi, highMidi] of the exercise
 * @param opts   {onPress(midi), names: 'en'|'ru'|'off'}
 */
export function createKeyboard(el, range, opts = {}) {
  let [lo, hi] = range;
  lo = lo - (lo % 12); hi = hi + 2; while (isBlack(hi)) hi++;
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const w = 100 / whites.length;
  const keys = {};
  el.innerHTML = '';
  el.classList.add('kb');
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
    el.appendChild(k); keys[m] = k;
  }
  const setNames = (mode) => {
    for (const m in keys) keys[m].querySelector('.lbl').textContent = mode === 'off' ? '' : noteName(keys[m].dataset.n, mode);
  };
  setNames(opts.names || 'en');
  const STATE = /\s(on-r|on-l|nx-r|nx-l|sug|acc|muted)\b/g;

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
    },
    flash(m, cls) {
      const k = keys[m]; if (!k) return;
      k.classList.remove('ok', 'meh', 'bad'); void k.offsetWidth; k.classList.add(cls);
      clearTimeout(k._ft); k._ft = setTimeout(() => k.classList.remove(cls), cls === 'bad' ? 450 : 300);
    },
    down(m, isDown) { const k = keys[m]; if (k) k.classList.toggle('down', isDown); }
  };
}
