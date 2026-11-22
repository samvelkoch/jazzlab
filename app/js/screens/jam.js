// Accompaniment screen (#/jam, #/jam/<formId>; content/jam.json): free play. A light band (bass, shell chords, drums) loops
// over a form in a chosen style until Stop; the learner improvises with the right hand. Nothing is judged or recorded.
// The keyboard shows the palette of the moment, the keys that end a phrase («дом») and the keys that hang («висит»).
// The band is generated a chorus at a time by music/jam.js (the next chorus at the start of the last bar of the current one)
// and scheduled on the audio clock by a look-ahead loop (25 ms timer, 150 ms ahead), as on the solo screen.
import { h, ICON, themeButton, midiChip, trackFootH } from '../ui.js';
import { t, L, plural } from '../i18n.js';
import { store, markActive, idle } from '../store.js';
import { noteName } from '../music/notes.js';
import { nameMode } from '../music/names.js';
import { createKeyboard } from '../music/keyboard.js';
import { parseChord, patSpell } from '../music/forms.js';
import { paletteAt } from '../music/solo.js';
import { resolveStyle, makeChorus, fillHits, endKeys, nextChange, defaultStyle } from '../music/jam.js';
import { groove } from '../music/drums.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';

const PER = 8;
const VOL = [0.25, 0.45, 0.65, 0.85, 1]; // background volume, 5 steps
const KB_LO = 60, KB_HI = 84; // C4..C6
const pcm = (m) => ((m % 12) + 12) % 12;

/** The keyboard marks of a palette (shared with the jam session screen): home keys (yellow), hanging keys (framed),
 *  the rest of the palette (an ink chip), for the keys lo..hi. ek = endKeys(...), pal = paletteAt(...). */
export function paletteMarks(ek, pal, lo, hi) {
  const map = {};
  for (let m = lo; m <= hi; m++) {
    const pc = pcm(m);
    if (ek.home.has(pc)) map[m] = { cls: 'base', label: t('qaHomeKey') };
    else if (ek.hang.has(pc)) map[m] = { cls: 'seventh', label: t('qaHangKey') };
    else if (pal.pcs.has(pc)) map[m] = { cls: 'pal' };
  }
  return map;
}

/** jam = content/jam.json, forms = { id: form } (every id of jam.forms), patterns = { id: pattern } (those the styles name),
 *  formId = the form asked for in the route (or null). Returns the cleanup function. */
export function renderJam(root, { jam, forms, patterns, formId }) {
  const styles = jam.styles.map((s) => resolveStyle(s, patterns));
  const settings = { pianoSnd: true, ...store.get('settings', {}) };
  const kbNames = nameMode(settings, 'key'); // keys: letters for 'both', 'off' stays off
  const txtNames = nameMode(settings, 'short'); // the strip and the palette line: 'off' and 'both' → letters
  const saved = store.get('jam', {});
  const firstForm = jam.forms.find((id) => forms[id]);
  const fid = formId && forms[formId] ? formId : saved.form && forms[saved.form] ? saved.form : firstForm;
  const form = forms[fid], bars = form.bars, NB = bars.length;
  const simple = jam.simple[fid] || null;
  const styleOk = (id) => styles.some((s) => s.id === id);
  // the stored style holds while the form is the stored one; a new form starts with its default style
  const styleId = saved.form === fid && styleOk(saved.style) ? saved.style : defaultStyle(form);
  const st = {
    style: styles.find((s) => s.id === styleId) || styles[0],
    vol: Math.max(1, Math.min(5, saved.vol || 3)),
    variety: saved.variety === 'high' ? 'high' : 'low',
    mode: saved.mode === 'simple' && simple ? 'simple' : 'chords',
    bpm: { ...(saved.bpm || {}) },
    open: !!saved.open // «Настройки» open or closed
  };
  const bpmOf = () => st.bpm[st.style.id] || st.style.tempo;
  const save = () => store.set('jam', { style: st.style.id, form: fid, vol: st.vol, variety: st.variety, mode: !simple && saved.mode === 'simple' ? 'simple' : st.mode, bpm: st.bpm, open: st.open }); // a form without a simple palette keeps the choice for the others
  const back = (() => { try { return sessionStorage.getItem('jamBack') || '#/play'; } catch (e) { return '#/play'; } })(); // free play: back to «Играть» unless a screen set jamBack

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, t('jamKicker')), h('span.title', null, `${t('jamTitle')} · ${L(form.title)}`)),
    h('div.grow'), midiChip(), themeButton());
  const locked = []; // controls that change only while stopped
  function seg(items, value, cb, label, lock) {
    const w = h('div.seg', { role: 'group', 'aria-label': label });
    items.forEach(([v, text, dis]) => {
      const b = h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), disabled: !!dis, title: dis || null, onclick: (e) => {
        if (lock && run) return;
        w.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === e.currentTarget))); cb(v);
      } }, text);
      if (lock) locked.push(b);
      w.append(b);
    });
    return w;
  }
  const styleSeg = seg(styles.map((s) => [s.id, L(s.title)]), st.style.id, (v) => { st.style = styles.find((s) => s.id === v); save(); paintBpm(); paintHint(); }, t('jamStyle'), true);
  styleSeg.classList.add('jamstyles');
  const formSel = h('select.jamform', { 'aria-label': t('jamForm'), onchange: () => {
    if (run) { formSel.value = fid; return; }
    const nf = formSel.value;
    store.set('jam', { ...store.get('jam', {}), form: nf, style: defaultStyle(forms[nf]) });
    location.replace(`#/jam/${nf}`); // the route renders the new form (no new history entry)
  } }, ...jam.forms.filter((id) => forms[id]).map((id) => h('option', { value: id, selected: id === fid }, L(forms[id].title))));
  locked.push(formSel);
  const bpmOut = h('output.bpm');
  const slower = h('button', { type: 'button', 'aria-label': t('slower'), onclick: () => setBpm(bpmOf() - 4) }, '−');
  const faster = h('button', { type: 'button', 'aria-label': t('faster'), onclick: () => setBpm(bpmOf() + 4) }, '+');
  locked.push(slower, faster);
  const tempoBox = h('div.stepper', null, slower, bpmOut, faster);
  const volOut = h('output.jamvol', { 'aria-live': 'polite' });
  const volBox = h('div.stepper.jamvolbox', { role: 'group', 'aria-label': t('jamVol') },
    h('button', { type: 'button', 'aria-label': t('jamVolDown'), onclick: () => setVol(st.vol - 1) }, '−'), volOut,
    h('button', { type: 'button', 'aria-label': t('jamVolUp'), onclick: () => setVol(st.vol + 1) }, '+'));
  const varSeg = seg([['low', t('jamVarLow')], ['high', t('jamVarHigh')]], st.variety, (v) => { st.variety = v; save(); }, t('jamVariety'), true);
  const modeSeg = seg([['chords', t('jamModeChords')], ['simple', t('jamModeSimple'), simple ? null : t('jamNoSimple')]], st.mode, (v) => { st.mode = v; save(); palKey = ''; paintAt(curBar, curSlot); }, t('jamMode'), false);
  const lab = (text, el) => h('div.jamctl', null, h('span.fvlabel', null, text), el);
  // the settings live under «Настройки» (closed by default, remembered): the style, the strip, the keys and Start stay in view
  const setBox = h('details.jamset', { open: st.open, ontoggle: () => { st.open = setBox.open; save(); } },
    h('summary', null, t('settings')),
    h('div.jamrow', null, lab(t('jamForm'), formSel), lab(t('jamTempo'), tempoBox), lab(t('jamVol'), volBox),
      lab(t('jamVariety'), varSeg), lab(t('jamMode'), modeSeg)));
  const controls = h('div.jamcontrols', null, styleSeg, setBox);

  // the «Now / Next» strip
  const nowChord = h('b.fvchord'), endLine = h('div.jamends'), palLine = h('div.solopal.jampal');
  const nowCard = h('div.fvnow.jamnow', null, h('div.jamnowhead', null, h('span.fvlabel', null, t('fvNow')), nowChord), h('div.jamnowbody', null, endLine, palLine));
  const nextChordEl = h('b.fvchord'), nextWhen = h('span.fvnotes'), nextHome = h('span.fvnotes');
  const nextCard = h('div.fvnext.jamnext', null, h('span.fvlabel', null, t('fvNext')), nextChordEl, nextWhen, nextHome);
  const strip = h('div.fvstrip.jamstrip', null, nowCard, nextCard);

  const chorusEl = h('span.barno');
  const fbEl = h('span.fb', { 'aria-live': 'polite' });
  const barEls = bars.map((c, k) => h('div.fcell', { 'data-bar': k }, h('span.fno', null, String(k + 1)), h('b.fchord', null, c),
    h('div.fbeats', null, ...Array.from({ length: 4 }, () => h('i')))));
  const grid = h('div.fgrid.jamgrid' + (NB > 16 ? '.long' : ''), null, ...barEls);
  const panel = h('section.panel.formpanel.jampanel', null, controls, strip, h('div.staffhead', null, chorusEl, h('div.grow'), fbEl), grid);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const footHint = h('span.foothint');
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => toggle() });
  const footer = h('footer.actions', null, footHint, h('div.grow'), primary);
  const screen = h('div.exscreen.formscreen.jamscreen', null, header, h('main.ex', null, panel, kbPanel), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer);

  // the current bar stays in view (as solo.js): inside a scrolling grid, then inside the panel (desktop) or the page (phone)
  const scrolls = (el) => el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY);
  const keepInView = (k) => {
    const c = barEls[k]; if (!c) return;
    if (scrolls(grid) && (c.offsetTop < grid.scrollTop || c.offsetTop + c.offsetHeight > grid.scrollTop + grid.clientHeight)) grid.scrollTop = Math.max(0, c.offsetTop - 8);
    const r = c.getBoundingClientRect(), inPanel = scrolls(panel);
    let top, bottom;
    if (inPanel) { const pr = panel.getBoundingClientRect(); top = pr.top; bottom = pr.bottom; }
    else {
      top = Math.max(0, header.getBoundingClientRect().bottom);
      bottom = Math.min(innerHeight, footer.getBoundingClientRect().top, getComputedStyle(kbPanel).position === 'sticky' ? kbPanel.getBoundingClientRect().top : Infinity);
    }
    const dy = r.bottom > bottom ? r.bottom - bottom + 8 : r.top < top ? r.top - top - 8 : 0;
    if (!dy) return;
    if (inPanel) panel.scrollTop += dy; else window.scrollBy(0, dy);
  };

  // ---------- keyboard: palette, home and hanging keys ----------
  audio.preloadPiano(33, KB_HI + 2); // the band's bass from A1, the keys up to C6
  const kb = createKeyboard(kbEl, [KB_LO, KB_HI], { names: kbNames, exact: true, center: 72, onPress: (m) => {
    audio.ensureAudio(); audio.pianoNote(m, audio.now() + 0.01, 0.5, 0.55); lastKey = performance.now(); markActive();
  } });
  const flats = !!form.flats;
  const nameOf = (pc, chordName) => { const ch = parseChord(chordName); return noteName(patSpell(60 + pc, pcm(pc - ch.pc), ch, flats).replace(/-?\d+$/, '') + '4', txtNames); };
  const palOf = (bar, slot) => paletteAt(st.mode === 'simple' && simple ? simple : {}, bars, bar, slot);
  const names = (set, chordName, from) => [...set].sort((a, b) => pcm(a - from) - pcm(b - from)).map((pc) => nameOf(pc, chordName)).join(' ');
  // a seven-note palette is spelt one letter per note from its root (A dorian: F♯, not G♭); otherwise per note (solo.js)
  const LET = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
  function scaleSpelling(pcs, pal) {
    if (pcs.length !== 7 || pcs[0] !== pal.root) return null;
    const ch = parseChord(pal.chord), start = LET.indexOf(patSpell(60 + pal.root, pcm(pal.root - ch.pc), ch, flats)[0]);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const l = LET[(start + i) % 7], alt = pcm(pcs[i] - NAT[LET.indexOf(l)]);
      if (alt !== 0 && alt !== 1 && alt !== 11) return null;
      out.push(noteName(l + (alt === 1 ? '#' : alt === 11 ? 'b' : '') + '4', txtNames));
    }
    return out;
  }
  let palKey = '', curBar = 0, curSlot = 0, lastKey = -1e9;
  function paintAt(bar, slot) {
    curBar = bar; curSlot = slot;
    const pal = palOf(bar, slot);
    paintNext(bar, slot, pal);
    const key = `${st.mode}|${pal.chord}|${[...pal.pcs].sort().join(',')}|${pal.root}`;
    if (key === palKey) return;
    palKey = key;
    const ek = endKeys(st.mode, pal);
    kb.mark(paletteMarks(ek, pal, KB_LO, KB_HI), { reveal: false });
    // now: the chord, home / hang, the palette line
    nowChord.textContent = pal.chord;
    const from = st.mode === 'simple' ? pal.root : parseChord(pal.chord).pc;
    endLine.replaceChildren(...[h('span.jamhome', null, `${t('qaHomeKey')}: `, h('b', null, names(ek.home, pal.chord, from))),
      ek.hang.size ? h('span.jamhang', null, ` · ${t('qaHangKey')}: `, h('b', null, names(ek.hang, pal.chord, from))) : null].filter(Boolean));
    const pcs = [...pal.pcs].sort((a, b) => pcm(a - pal.root) - pcm(b - pal.root));
    const spelt = scaleSpelling(pcs, pal);
    palLine.replaceChildren(h('b', null, `${t('soPalette')}:`), ' ',
      ...pcs.flatMap((pc, i) => [h('span' + (pal.chordPcs.has(pc) ? '.ct' : ''), null, spelt ? spelt[i] : nameOf(pc, pal.chord)), ' ']));
  }
  function paintNext(bar, slot, pal) {
    // next: the next different chord, when, and its home keys
    const nx = nextChange(bars, bar, slot);
    if (!nx) { nextChordEl.textContent = pal.chord; nextWhen.textContent = t('jamNoChange'); nextHome.textContent = ''; return; }
    const np = palOf(nx.bar, nx.slot), nek = endKeys(st.mode, np);
    nextChordEl.textContent = nx.chord;
    nextWhen.textContent = nx.inBars === 0 ? t('jamThisBar') : t('jamInBars').replace('{n}', nx.inBars).replace('{w}', plural(nx.inBars, 'jamBarsW'));
    nextHome.textContent = `${t('qaHomeKey')}: ${names(nek.home, np.chord, st.mode === 'simple' ? np.root : parseChord(np.chord).pc)}`;
  }

  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) { sentMidi = true; return; } }
    audio.pianoNote(m, time, dur, v);
  }
  const fb = (html) => { fbEl.innerHTML = html; };
  function paintBpm() { bpmOut.innerHTML = `♩ ${bpmOf()}`; }
  function setBpm(v) { if (run) return; st.bpm[st.style.id] = Math.max(40, Math.min(200, Math.round(v))); save(); paintBpm(); }
  function setVol(v) { st.vol = Math.max(1, Math.min(5, v)); save(); volOut.textContent = `${st.vol} / 5`; }
  function paintPrimary() { primary.innerHTML = run ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`; }
  function paintHint() { footHint.textContent = run ? t('jamHintPlay') : t('jamHint'); }
  function paintChorus(k) { chorusEl.textContent = `${t('chorusW')} ${k + 1}`; }
  function paintLocks() { locked.forEach((el) => { el.disabled = !!run; }); }

  // ---------- transport ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null, sentMidi = false;
  function gen(c, prev) { return makeChorus(run.style, bars, { chorus: c, variety: run.variety, rng: Math.random, prev }); }
  function start() {
    if (run || !audio.ensureAudio()) return;
    const bpm = bpmOf(), beat = 60 / bpm;
    let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += 4 * beat;
    run = { t0, beat, style: st.style, variety: st.variety, swingOff: st.style.swing ? beat * 2 / 3 : beat / 2, ch: {} };
    const c0 = gen(0, null);
    run.ch[0] = c0;
    g = 0; beatTime = t0; sentMidi = false;
    screen.classList.add('playing'); paintPrimary(); paintHint(); paintLocks(); paintChorus(0);
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function schedule() {
    if (!run) return;
    const r = run, now = audio.now(), ahead = now + 0.15;
    for (;;) {
      const slot = g % PER, barG = Math.floor(g / PER), bar = barG % NB, chorus = Math.floor(barG / NB);
      const time = beatTime + (slot % 2 ? r.swingOff : 0);
      if (time > ahead) break;
      // the next chorus is made at the start of the last bar of this one
      if (slot === 0 && bar === NB - 1 && !r.ch[chorus + 1]) { r.ch[chorus + 1] = gen(chorus + 1, r.ch[chorus].prev); delete r.ch[chorus - 1]; }
      if (!r.ch[chorus]) r.ch[chorus] = gen(chorus, r.ch[chorus - 1] ? r.ch[chorus - 1].prev : null); // safety (a one-bar form)
      const cb = r.ch[chorus].bars[bar];
      if (time >= now - 0.03) { // a slot already in the past (a throttled background tab) is skipped, not played late
        const vg = VOL[st.vol - 1], dg = vg * (r.style.drumGain == null ? 1 : r.style.drumGain);
        groove(slot, time, { swing: r.style.drums === 'swing', style: r.style.drums === 'bossa' ? 'bossa' : null, bar: barG, gain: dg });
        if (cb.fill) fillHits(r.style, slot).forEach((x) => audio.drum(x.kind, time, x.v * dg));
        cb.notes.forEach((n) => { if (n.t === slot) play1(n.m, time, n.stac ? Math.min(r.beat * 0.5, 0.25) : n.d * r.beat / 2 * 0.92, n.v * vg); });
        if (slot === 0) queue.push({ t: time, barStart: bar, chorus });
        queue.push({ t: time, g });
      }
      if (slot % 2) beatTime += r.beat;
      g++;
    }
  }
  function tick() {
    const now = audio.now(), due = [];
    queue = queue.filter((q) => (q.t <= now ? (due.push(q), false) : true));
    due.sort((a, b) => a.t - b.t).forEach(handle);
    if (run) raf = requestAnimationFrame(tick);
  }
  function handle(q) {
    if (!run) return;
    if (q.ci !== undefined) fb(`${t('countInLabel')}: <b>${q.ci}</b>`);
    else if (q.barStart !== undefined) {
      if (q.barStart === 0 && q.chorus === 0) fb('');
      barEls.forEach((c, k) => { c.classList.toggle('cur', k === q.barStart); if (k !== q.barStart) c.querySelectorAll('.fbeats i').forEach((i) => i.classList.remove('on')); });
      keepInView(q.barStart); paintChorus(q.chorus);
    } else if (q.g !== undefined) {
      const slot = q.g % PER, bar = Math.floor(q.g / PER) % NB;
      barEls[bar].querySelectorAll('.fbeats i').forEach((i, b) => i.classList.toggle('on', b <= slot >> 1));
      if (slot === 0 || slot === 4) paintAt(bar, slot);
      if (slot % 2 === 0 && performance.now() - lastKey < 8000) markActive(); // a band left alone is not practice
    }
  }
  function halt() {
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = run; run = null;
    screen.classList.remove('playing');
    if (was) { audio.hush(); if (sentMidi) silence(); }
    barEls.forEach((c) => { c.classList.remove('cur'); c.querySelectorAll('.fbeats i').forEach((i) => i.classList.remove('on')); });
    idle(); fb(''); paintPrimary(); paintHint(); paintLocks(); paintChorus(0); paintAt(0, 0);
  }
  function toggle() { if (run) halt(); else start(); }

  // ---------- input: light the keys, nothing is judged ----------
  const offNote = onNote((e) => { kb.down(e.note, e.type === 'on'); if (e.type === 'on') { lastKey = performance.now(); markActive(); } });
  const onKey = (e) => { if (e.code === 'Space' && !(e.target.closest && e.target.closest('input,select,textarea,summary,button'))) { e.preventDefault(); toggle(); } };
  document.addEventListener('keydown', onKey);

  paintBpm(); setVol(st.vol); paintPrimary(); paintHint(); paintChorus(0); paintAt(0, 0);

  return () => {
    if (run) halt();
    if (footRO) footRO.disconnect();
    offNote(); document.removeEventListener('keydown', onKey);
    header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup());
  };
}
