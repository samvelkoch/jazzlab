// «Круг» (#/circle, #/circle/<blues|bossa|std|free>): the circle of fifths as a tool, almost no text. Three rings of
// 12 cells (majors, their relative minors, the vii° chords), the home key's wedge tinted with its roman numerals, the
// selected tune's chords lit (its real symbols), tap a cell to hear it and see it on a small keyboard. Under the text
// tabs (the tunes of content/circle.json + «Свободно»): one lead line, then (beside or under the circle) the tune's moves; «Послушать» plays a move
// chord by chord and draws its path on the circle. «Свободно»: a tap on an outer / middle cell makes it home.
// The SVG is built once as a string; taps and tab switches only change classes and label text (focus stays put).
import { h, ICON, themeButton, langSwitch, midiChip, navTabs } from '../ui.js';
import { t, L } from '../i18n.js';
import { parseChord, voicing, prettySymbol } from '../music/chords.js';
import { midiToName } from '../music/notes.js';
import { miniSvg } from '../music/minikb.js';
import { playNotes, hushAll } from './chords.js';
import { RINGS, RING_NAMES, SIZE, C0, cellOf, cellChord, wedgeOf, formChords, cellPath, cellCentre } from '../music/circle.js';

const STEP_S = 0.9; // a move: one chord every 0.9 s
const TAP_MS = 1200; // a tapped cell stays «sounding» this long
const key = (c) => `${c.ring}:${c.pos}`;
const SHORT = { outer: 'o', middle: 'm', inner: 'i' };

/** `circle` = content/circle.json; `forms` = { formId: form } for its tunes; `tab` = a tune id, 'free' or null (blues). */
export function renderCircle(root, { circle, forms, tab, rerender }) {
  const tunes = circle.tunes;
  const TABS = [...tunes.map((tn) => tn.id), 'free'];
  let cur = TABS.includes(tab) ? tab : tunes[0].id;
  let freeHome = { root: 'C', mode: 'major' };
  const timers = [];
  let sounding = new Map(); // cell key → the symbol sounding there

  const header = h('header.top', null,
    h('div.brand', { role: 'img', 'aria-label': 'Jazzlab' }, h('span.brandname', { 'aria-hidden': 'true' }, 'jazz', h('span.key'), 'lab')),
    navTabs('play'),
    h('div.grow'), midiChip(), langSwitch(rerender),
    h('a.iconbtn.helpbtn', { href: '#/help', 'aria-label': t('helpTitle'), title: t('helpTitle'), html: ICON.help }), themeButton());

  // ---- the circle: one SVG string, cells are focusable groups ----
  const cellSvg = (ring, pos) => {
    const [x, y] = cellCentre(ring, pos);
    return `<g class="cc cc-${SHORT[ring]}" data-ring="${ring}" data-pos="${pos}" role="button" tabindex="0">`
      + `<path class="cp" d="${cellPath(ring, pos)}"/>`
      + `<text class="cn" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central"></text>`
      + `<text class="cl" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central"></text></g>`;
  };
  const svgHtml = `<svg class="cwheelsvg" viewBox="0 0 ${SIZE} ${SIZE}" role="group" aria-label="${t('circleTitle')}">`
    + '<defs><marker id="carrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="cah" d="M0 0L10 5L0 10z"/></marker></defs>'
    + RING_NAMES.map((ring) => Array.from({ length: 12 }, (_, p) => cellSvg(ring, p)).join('')).join('')
    + '<path class="chome" d=""/>'
    + '<g class="carrows" aria-hidden="true"></g>'
    + `<text class="ccroot" x="${C0}" y="${C0 - 8}" text-anchor="middle" dominant-baseline="central"></text>`
    + `<text class="ccmode" x="${C0}" y="${C0 + 34}" text-anchor="middle" dominant-baseline="central"></text>`
    + '</svg>';
  const wheel = h('div.csvg', { html: svgHtml });
  const svg = wheel.firstChild;
  const cells = new Map([...svg.querySelectorAll('.cc')].map((g) => [`${g.dataset.ring}:${g.dataset.pos}`, g]));
  const homeOutline = svg.querySelector('.chome'), arrows = svg.querySelector('.carrows');
  const centreRoot = svg.querySelector('.ccroot'), centreMode = svg.querySelector('.ccmode');

  // ---- the mini keyboard under the circle ----
  const kbName = h('span.ckbname');
  const kbKeys = h('div.ckbkeys');
  const showChord = (sym) => {
    const notes = voicing(parseChord(sym)).map((x) => midiToName(x.midi));
    kbName.textContent = prettySymbol(sym);
    kbKeys.innerHTML = miniSvg(notes);
  };
  const play = (sym, at = 0, dur = 1.6) => playNotes(voicing(parseChord(sym)).map((x) => x.midi), { at, dur });

  // ---- state of the current tab ----
  const tuneOf = (id) => tunes.find((tn) => tn.id === id) || null;
  let tune = null, home = null, lit = new Map(), homeKey = '', wedge = new Map();
  const setTab = (id) => {
    cur = id;
    tune = tuneOf(id);
    home = tune ? { root: tune.home.root, mode: tune.home.mode } : freeHome;
    lit = new Map();
    if (tune) for (const sym of formChords(forms[tune.form])) { const k = key(cellOf(sym)); if (!lit.has(k)) lit.set(k, sym); }
    homeKey = tune ? key(cellOf(tune.home.chord)) : '';
    setHome(home);
  };
  const setHome = (hm) => {
    home = hm;
    wedge = new Map(wedgeOf(hm).map((c) => [key(c), c]));
  };

  const paint = () => {
    for (const [k, g] of cells) {
      const ring = g.dataset.ring, pos = +g.dataset.pos;
      const w = wedge.get(k), sym = lit.get(k), snd = sounding.get(k);
      g.classList.toggle('w', !!(w && w.tint));
      g.classList.toggle('lit', !!sym);
      g.classList.toggle('home', k === homeKey);
      g.classList.toggle('snd', !!snd);
      const shown = snd && sym ? snd : sym;
      const label = shown ? prettySymbol(shown) : ring === 'inner' ? '' : RINGS[ring][pos];
      const numeral = w && (w.tint || sym) ? w.numeral : '';
      const [, y] = cellCentre(ring, pos);
      const n = g.querySelector('.cn'), l = g.querySelector('.cl');
      n.textContent = numeral;
      l.textContent = label;
      const d = ring === 'inner' ? 10 : 12;
      n.setAttribute('y', String(y - d));
      l.setAttribute('y', String(numeral ? y + d - 1 : y));
      g.setAttribute('aria-label', prettySymbol(sym || cellChord(ring, pos)) + (numeral ? ` (${numeral})` : ''));
    }
    if (homeKey) { const [r, p] = homeKey.split(':'); homeOutline.setAttribute('d', cellPath(r, +p)); } else homeOutline.setAttribute('d', '');
    centreRoot.textContent = prettySymbol(home.root);
    centreMode.textContent = home.mode === 'minor' ? t('circleMinor') : t('circleMajor');
  };

  // ---- arrows: one segment per step, an arrowhead each, short of the cell centres ----
  const drawArrow = (cs) => {
    const segs = [];
    for (let i = 1; i < cs.length; i++) {
      const [x0, y0] = cellCentre(cs[i - 1].ring, cs[i - 1].pos), [x1, y1] = cellCentre(cs[i].ring, cs[i].pos);
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const a = Math.min(16, len / 4) / len, b = Math.min(22, len / 3) / len;
      const p = [x0 + dx * a, y0 + dy * a, x1 - dx * b, y1 - dy * b].map((v) => v.toFixed(1));
      segs.push(`<line class="carrowbg" x1="${p[0]}" y1="${p[1]}" x2="${p[2]}" y2="${p[3]}"/>`
        + `<line class="carrow" x1="${p[0]}" y1="${p[1]}" x2="${p[2]}" y2="${p[3]}" marker-end="url(#carrowhead)"/>`);
    }
    arrows.innerHTML = segs.join('');
  };
  const clearArrow = () => { arrows.innerHTML = ''; };

  const stop = () => {
    timers.splice(0).forEach(clearTimeout);
    if (sounding.size) { sounding = new Map(); paint(); }
    hushAll();
  };
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));

  // ---- tap a cell: hear it, see it; on «Свободно» an outer / middle cell becomes home ----
  const activate = (g) => {
    const ring = g.dataset.ring, pos = +g.dataset.pos, k = key({ ring, pos });
    stop(); clearArrow();
    const sym = lit.get(k) || cellChord(ring, pos);
    if (cur === 'free' && ring !== 'inner') {
      freeHome = { root: RINGS[ring][pos].replace(/m$/, ''), mode: ring === 'middle' ? 'minor' : 'major' };
      setHome(freeHome);
    }
    play(sym);
    showChord(sym);
    sounding = new Map([[k, sym]]);
    paint();
    later(TAP_MS, () => { sounding = new Map(); paint(); });
  };
  svg.addEventListener('click', (e) => { const g = e.target.closest('.cc'); if (g) activate(g); });
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const g = e.target.closest('.cc');
    if (!g) return;
    e.preventDefault();
    activate(g);
  });

  // ---- a move: the chords one after another, each cell «sounding» in turn, the path drawn ----
  const playMove = (mv) => {
    stop();
    const cs = mv.chords.map(cellOf);
    drawArrow(cs);
    mv.chords.forEach((sym, i) => {
      play(sym, i * STEP_S, STEP_S + 0.05);
      later(i * STEP_S * 1000, () => { sounding = new Map([[key(cs[i]), sym]]); showChord(sym); paint(); });
    });
    later(mv.chords.length * STEP_S * 1000, () => { sounding = new Map(); paint(); });
  };

  // ---- the tabs, the lead line and the moves ----
  const tabLabel = (id) => (id === 'free' ? t('circleFree') : L(tuneOf(id).tab));
  const tabBtns = TABS.map((id) => h('button', { type: 'button', role: 'tab', id: `ctab-${id}`, 'aria-controls': 'ctabpanel', onclick: () => choose(id) }, tabLabel(id)));
  const tabs = h('div.seg.big.ctabs', { role: 'tablist', 'aria-label': t('circleTabsAria'), onkeydown: (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const k = (TABS.indexOf(cur) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    choose(TABS[k]); tabBtns[k].focus();
  } }, ...tabBtns);
  const lead = h('p.clead');
  const moves = h('ol.cmoves');
  const panel = h('div.cpanel', { role: 'tabpanel', id: 'ctabpanel' }, moves);

  const moveRow = (mv) => h('li.cmove', null,
    h('h2.cmt', null, L(mv.title)),
    h('span.cmchords', null, mv.chords.map(prettySymbol).join(' → ')),
    h('p.cmtext', null, L(mv.text)),
    h('button.cmlisten', { type: 'button', onclick: () => playMove(mv) }, t('pListen')));

  const show = () => {
    tabBtns.forEach((b, i) => { const on = TABS[i] === cur; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    panel.setAttribute('aria-labelledby', `ctab-${cur}`);
    lead.textContent = L(tune ? tune.lead : circle.free.lead);
    moves.replaceChildren(...(tune ? tune.moves.map(moveRow) : []));
    moves.hidden = !tune;
    showChord(tune ? tune.home.chord : home.root + (home.mode === 'minor' ? 'm' : ''));
    paint();
  };
  function choose(id) {
    if (id === cur) return;
    stop(); clearArrow();
    setTab(id);
    try { history.replaceState(null, '', `#/circle/${id}`); } catch (e) { /* the hash stays; the screen is right anyway */ }
    show();
  }

  setTab(cur);
  root.replaceChildren(header,
    h('main.circlemain', null,
      h('div.chead', null, h('h1.cap', null, t('circleTitle')), tabs, lead),
      h('div.cwheel', null, wheel, h('div.ckb', null, kbName, kbKeys)),
      panel));
  show();
  return () => { timers.splice(0).forEach(clearTimeout); hushAll(); };
}
