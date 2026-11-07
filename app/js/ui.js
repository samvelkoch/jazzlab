// Small DOM helpers + shared header pieces.
import { t, getLang, setLang } from './i18n.js';
import { toggleTheme, currentTheme, currentScheme, setScheme, SCHEMES } from './theme.js';
import { midiState, onMidiState, connect } from './music/midi.js';
import { sessionNext, sessionAdvance, endSession } from './store.js';

// Item screens register how to link to an item id and which track they belong to (set by main.js once the track is loaded).
let linkOf = () => null, linkTrack = null;
export function setItemLinks(fn, track = null) { linkOf = fn; linkTrack = track; }
export const itemHref = (id) => linkOf(id);

/** "Next →" chip for the one-tap session; empty when no session is running or this is the last item. */
export function sessionChip(currentId) {
  const nx = sessionNext(currentId, linkTrack);
  if (!nx) return null;
  const link = linkOf(nx.id);
  if (!link) return null;
  return h('a.chip.session', { href: link.href, title: link.title, onclick: () => sessionAdvance(currentId, linkTrack) },
    h('span', null, h('span.sn', null, `${t('nextW')} `), `${nx.at + 1}/${nx.total}`, h('span.st', null, `: ${link.title}`)), h('b', null, '→'));
}
export { endSession };

/** h('button.btn.primary', {onclick, 'aria-label': ...}, ...children) */
export function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((k) => { if (k !== null && k !== undefined && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k))); });
  return el;
}

const svg = (body, size = 20, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
export const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  moon: svg('<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  play: svg('<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>', 18),
  stop: svg('<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>', 16),
  speaker: svg('<path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14"/>', 18),
  download: svg('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>', 18),
  piano: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 6v7M12 6v7M17 6v7"/>', 16),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  prev: svg('<path d="M15 5l-7 7 7 7"/>', 18),
  next: svg('<path d="M9 5l7 7-7 7"/>', 18),
  check: svg('<path d="M5 12l5 5 9-10"/>', 16, 'stroke-width="3"'),
  lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>', 14),
  hand: svg('<path d="M8 13V5.5a1.5 1.5 0 013 0V12m0-1.5v-6a1.5 1.5 0 013 0V12m0-5.5a1.5 1.5 0 013 0V12m0-3.5a1.5 1.5 0 013 0V15a7 7 0 01-7 7h-1.5a7 7 0 01-5.7-3L4 15a1.5 1.5 0 012.3-1.9L8 15"/>', 40),
  note: svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>', 18, 'stroke-width="2.2"')
};

/** Appearance popover: light / dark + colour scheme. */
export function themeButton(onChange) {
  const sum = h('summary.iconbtn', { 'aria-label': t('theme'), title: t('theme') });
  const mode = h('div.seg', { role: 'group', 'aria-label': t('theme') });
  const schemes = h('div.schemes', { role: 'group', 'aria-label': t('colors') });
  const paint = () => {
    const th = currentTheme(), sc = currentScheme();
    sum.innerHTML = th === 'dark' ? ICON.moon : ICON.sun;
    mode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === th)));
    schemes.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.v === sc));
      b.querySelectorAll('i').forEach((i, k) => { i.style.background = SCHEMES[b.dataset.v][th][k]; });
    });
  };
  [['light', t('light')], ['dark', t('dark')]].forEach(([v, label]) => mode.append(h('button', { type: 'button', 'data-v': v,
    onclick: () => { if (currentTheme() !== v) toggleTheme(); paint(); if (onChange) onChange(); } }, label)));
  Object.keys(SCHEMES).forEach((v) => schemes.append(h('button', { type: 'button', 'data-v': v,
    onclick: () => { setScheme(v); paint(); if (onChange) onChange(); } }, h('span.sw3', null, h('i'), h('i'), h('i')), t('scheme_' + v))));
  const d = h('details.settings', null, sum, h('div.pop', null, h('div.popsec', null, h('span.pophead', null, t('theme')), mode), h('div.popsec', null, h('span.pophead', null, t('colors')), schemes)));
  paint();
  return d;
}

export function langSwitch(onChange) {
  const wrap = h('div.seg', { role: 'group', 'aria-label': t('language') });
  ['ru', 'en'].forEach((l) => {
    wrap.append(h('button', {
      type: 'button', 'aria-pressed': String(getLang() === l),
      onclick: () => { if (getLang() !== l) { setLang(l); onChange(); } }
    }, l.toUpperCase()));
  });
  return wrap;
}

/** Top-level sections: course / chords. */
export function navTabs(active) {
  const a = (id, href, label) => h('a', { href, 'aria-current': id === active ? 'page' : null }, label);
  return h('nav.seg.big.navtabs', { 'aria-label': t('sections') }, a('course', '#/', t('navCourse')), a('chords', '#/chords', t('navChords')));
}

const VIRTUAL = /midiweb|session|сеть|network|iac|virtual/i;

/** MIDI status chip; tapping it connects (and opens MIDIWeb's Bluetooth dialog on iPad). */
export function midiChip() {
  const b = h('button.chip', { type: 'button' });
  const paint = (s) => {
    b.className = 'chip' + (s.connected ? ' ok' : s.error ? ' bad' : '');
    // MIDIWeb also lists its own virtual/network ports ("MIDIWeb Out", "Session 1"): show the real instrument
    const label = s.connected ? (s.names.find((n) => !VIRTUAL.test(n)) || s.names[0])
      : s.error === 'unsupported' ? t('midiUnsupported')
      : s.error === 'denied' ? t('midiDenied')
      : s.supported ? t('midiConnect') : t('midiNone');
    b.innerHTML = ICON.piano + '<span></span>';
    b.querySelector('span').textContent = label;
    b.title = s.connected ? s.names.join(', ') : label;
  };
  b.addEventListener('click', () => connect(true));
  const off = onMidiState(paint);
  b._cleanup = off;
  paint(midiState());
  return b;
}

// Close an open popover (details.settings) on outside tap or Escape.
document.addEventListener('pointerdown', (e) => {
  document.querySelectorAll('details.settings[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
}, { capture: true });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('details.settings[open]').forEach((d) => d.removeAttribute('open'));
});
