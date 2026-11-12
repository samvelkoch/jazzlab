// Shared pieces of the ear screens (ear.js "Find the note", ear-rel.js the relative games): the round dots, the
// prompt card with its states (task, hint, right, revealed), the "next" bar in the footer (a visible countdown with
// Pause, or a wait for Next) and a small staff that shows the note after the answer.
import { h, ICON } from '../ui.js';
import { t } from '../i18n.js';
import { midiToName, noteName } from '../music/notes.js';

/** A row of N dots: the result of each round, the current one ringed. */
export function earDots(N) {
  const el = h('div.erdots', { 'aria-hidden': 'true' });
  for (let i = 0; i < N; i++) el.append(h('i'));
  return {
    el,
    paint(log, cur = -1) {
      [...el.children].forEach((d, i) => { d.className = log[i] || (i === cur ? 'cur' : ''); });
    },
  };
}

/** The prompt card. set({ tone: ''|'bad'|'ok'|'reveal', big, kicker, title, text, actions: [nodes], aside: node }).
 *  With `big` the card is a row (the big word on the left, the words on the right); without it, a centred column. */
export function earCard(el) {
  el.classList.add('ercard');
  return {
    set({ tone = '', big = '', kicker = '', title = '', text = '', actions = [], aside = null } = {}) {
      el.className = 'dcard ercard' + (big ? ' row' : ' col') + (tone ? ' tone-' + tone : '');
      const body = h('div.erbody', null,
        kicker ? h('span.kicker', null, kicker) : null,
        title ? h('b.ertitle', null, title) : null,
        text ? h('span.ertext', null, text) : null,
        actions.length ? h('div.eracts', null, ...actions) : null);
      el.replaceChildren(...[big ? h('b.erbig', null, big) : null, body, aside].filter(Boolean));
    },
  };
}

/** A round button with the speaker icon. */
export const listenBtn = (label, onclick) => h('button.btn.erlisten', { type: 'button', onclick, html: ICON.speaker + `<span>${label}</span>` });

/** The footer part that says what comes next: a hint, a countdown bar with Pause, or "tap Next". */
export function nextBar({ onNext }) {
  const label = h('span.ernlabel');
  const fill = h('i');
  const bar = h('span.ernbar', null, fill);
  const box = h('div.ernext', null, label, bar);
  let timer = null, paused = false, words = '';
  const pauseBtn = h('button.btn.erpause', { type: 'button', onclick: () => pause() }, t('ezPause'));
  const nextBtn = h('button.btn.accent.xl.ernextbtn', { type: 'button', onclick: () => go(), html: `<span>${t('ezNext')}</span>` + ICON.next });
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  function go() { clear(); state('hint', ''); onNext(); }
  function pause() { if (!timer) return; clear(); paused = true; fill.style.transition = 'none'; fill.style.width = getComputedStyle(fill).width; label.textContent = t('ezPaused'); pauseBtn.hidden = true; }
  function state(kind, text) {
    box.dataset.kind = kind; label.textContent = text; words = text;
    bar.hidden = kind !== 'count'; pauseBtn.hidden = kind !== 'count'; nextBtn.hidden = kind === 'hint' || kind === 'off';
    box.hidden = kind === 'off';
  }
  state('off', '');
  return {
    els: [box, pauseBtn, nextBtn],
    hint(text) { clear(); state('hint', text); },
    /** Count down `ms`, then go on by itself (unless paused). */
    count(ms) {
      clear(); paused = false;
      state('count', t('ezNextIn').replace('{s}', Math.round(ms / 1000)));
      fill.style.transition = 'none'; fill.style.width = '0%'; void fill.offsetWidth;
      fill.style.transition = `width ${ms}ms linear`; fill.style.width = '100%';
      timer = setTimeout(() => { timer = null; if (!paused) go(); }, ms);
    },
    wait() { clear(); state('wait', t('ezWaiting')); },
    off() { clear(); state('off', ''); },
    waiting: () => box.dataset.kind === 'count' || box.dataset.kind === 'wait',
    next: () => go(),
    get words() { return words; },
  };
}

/** A note on a small treble staff (sharps as ♯), plus its name in Russian and English: shown after the answer. */
export function noteBadge(m) {
  const name = midiToName(m), step = 'CDEFGAB'.indexOf(name[0]), sharp = name[1] === '#';
  const oct = Math.floor(m / 12) - 1, d = oct * 7 + step, E4 = 4 * 7 + 2;
  const y = (dd) => 70 - (dd - E4) * 6;
  const ny = y(d), x = 92;
  let lines = '';
  for (let i = 0; i < 5; i++) lines += `<line x1="6" y1="${70 - i * 12}" x2="146" y2="${70 - i * 12}"/>`;
  for (let dd = E4 - 2; dd >= d; dd -= 2) lines += `<line x1="${x - 15}" y1="${y(dd)}" x2="${x + 15}" y2="${y(dd)}"/>`;
  for (let dd = E4 + 10; dd <= d; dd += 2) lines += `<line x1="${x - 15}" y1="${y(dd)}" x2="${x + 15}" y2="${y(dd)}"/>`;
  const up = d < E4 + 4; // stem up below the middle line
  const svg = `<svg viewBox="0 -10 152 120" width="152" height="120" role="img" aria-label="${name}">`
    + `<g stroke="var(--staff)" stroke-width="1.5">${lines}</g>`
    + `<text x="8" y="80" font-size="62" font-family="var(--music)" fill="var(--staff)">𝄞</text>`
    + (sharp ? `<text x="${x - 30}" y="${ny + 8}" font-size="24" font-family="var(--music)" fill="var(--ok)">♯</text>` : '')
    + `<ellipse cx="${x}" cy="${ny}" rx="8.5" ry="6" transform="rotate(-20 ${x} ${ny})" fill="var(--ok)"/>`
    + `<line x1="${up ? x + 7.5 : x - 7.5}" y1="${ny}" x2="${up ? x + 7.5 : x - 7.5}" y2="${up ? ny - 36 : ny + 36}" stroke="var(--ok)" stroke-width="2.2"/>`
    + '</svg>';
  const ru = noteName(name, 'ru'), en = noteName(name, 'en');
  return h('div.ernote', null, h('div', { html: svg }), h('b', null, ru, ru !== en ? h('span', null, ' · ' + en) : null));
}
