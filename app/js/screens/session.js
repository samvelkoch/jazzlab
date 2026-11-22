// Jam session screen (#/session, #/session/<formId>; spec docs/specs/2026-11-22-jam-session-design.md): the band of the
// accompaniment screen (music/jam.js) holds the form, a partner (tenor sax or a second pianist) and the learner take turns.
// Formats: «Вопрос — ответ» (2 + 2 bars), «Четвёрки» (partner, you, drums, you), «Сессия» (head, partner solo, your solo,
// fours, head and ending; it stops by itself). Whose turn and what the partner plays: music/session.js (pure).
// Nothing is judged or recorded. Scheduling as jam.js: a look-ahead loop (25 ms timer, 150 ms ahead) on the audio clock.
import { h, ICON, themeButton, midiChip, trackFootH } from '../ui.js';
import { t, L } from '../i18n.js';
import { store, markActive, idle } from '../store.js';
import { nameMode } from '../music/names.js';
import { createKeyboard } from '../music/keyboard.js';
import { paletteAt } from '../music/solo.js';
import { resolveStyle, makeChorus, fillHits, endKeys, defaultStyle } from '../music/jam.js';
import { turnAt, partnerTurn, drumTurn, endingOf, sessionBars, sessionMinutes, PARTNERS, FORMATS } from '../music/session.js';
import { groove } from '../music/drums.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';
import { paletteMarks } from './jam.js';

const PER = 8;
const VOL = [0.25, 0.45, 0.65, 0.85, 1]; // background volume, 5 steps (as jam.js)
const KB_LO = 60, KB_HI = 84; // C4..C6 (as jam.js)
const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.split(`{${k}}`).join(String(x)), s);

/** jam = content/jam.json, forms = { id: form } (every id of jam.forms), patterns = the styles' patterns, fid = the form,
 *  melody = the form's tune (jam.melodies) or null, ending = the form's ending exercise (normalized) or null,
 *  licks = the partner's course licks (lick objects). Returns the cleanup function. */
export function renderSession(root, { jam, forms, patterns, fid, melody, ending, licks }) {
  const styles = jam.styles.map((s) => resolveStyle(s, patterns));
  const settings = { pianoSnd: true, ...store.get('settings', {}) };
  const form = forms[fid], bars = form.bars, NB = bars.length;
  const saved = store.get('jamSession', {});
  const styleOk = (id) => styles.some((s) => s.id === id);
  const styleId = saved.form === fid && styleOk(saved.style) ? saved.style : defaultStyle(form);
  const st = {
    style: styles.find((s) => s.id === styleId) || styles[0],
    vol: Math.max(1, Math.min(5, saved.vol || 3)),
    format: FORMATS.includes(saved.format) ? saved.format : 'qa',
    partner: saved.partner === 'piano' ? 'piano' : 'sax',
    bpm: { ...(saved.bpm || {}) },
    open: !!saved.open
  };
  const blues = !!(jam.simple && jam.simple[fid] && jam.simple[fid].palette && jam.simple[fid].palette.scale === 'blues');
  const bpmOf = () => st.bpm[st.style.id] || st.style.tempo;
  const save = () => store.set('jamSession', { form: fid, style: st.style.id, vol: st.vol, format: st.format, partner: st.partner, bpm: st.bpm, open: st.open });
  const endBars = () => endingOf(bars, ending, PARTNERS[st.partner]).bars;

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: '#/play', 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, t('sessKicker')), h('span.title', null, `${t('sessTitle')} · ${L(form.title)}`)),
    h('div.grow'), midiChip(), themeButton());

  // a text toggle / tab row: every change stops a running session and goes back to bar 1
  function choice(cls, items, value, cb, label, role) {
    const w = h(cls, { role: role === 'tab' ? 'tablist' : 'group', 'aria-label': label });
    const attr = role === 'tab' ? 'aria-selected' : 'aria-pressed';
    items.forEach(([v, text]) => w.append(h('button', { type: 'button', role: role === 'tab' ? 'tab' : null, 'data-v': v, [attr]: String(v === value), onclick: (e) => {
      w.querySelectorAll('button').forEach((x) => x.setAttribute(attr, String(x === e.currentTarget)));
      if (run) halt();
      cb(v);
    } }, text)));
    return w;
  }
  // the stage: band, partner, you; the one who plays now is yellow
  const bandLine = h('span.sline', null, t('sessBandLine'));
  const partnerSeg = choice('div.stoggle', [['sax', t('sessSax')], ['piano', t('sessPiano')]], st.partner, (v) => { st.partner = v; save(); paintIdle(); paintHint(); }, t('sessPartner'));
  const blocks = {
    drums: h('div.sblock', { 'data-who': 'band' }, h('b.sname', null, t('sessBand')), bandLine),
    partner: h('div.sblock', { 'data-who': 'partner' }, h('b.sname', null, t('sessPartner')), partnerSeg),
    you: h('div.sblock', { 'data-who': 'you' }, h('b.sname', null, t('sessYou')))
  };
  const stage = h('div.sstage', null, blocks.drums, blocks.partner, blocks.you);
  const fmtTabs = choice('div.seg.big.ptabs.sfmt', FORMATS.map((f) => [f, t('sessFmt_' + f)]), st.format, (v) => { st.format = v; save(); paintIdle(); paintHint(); }, t('sessFormat'), 'tab');

  // the turn strip: the big word, a square per bar of the turn, the chord, (session) the section and the chorus
  const word = h('b.sword', { 'aria-live': 'polite' });
  const squares = h('div.ssquares', { 'aria-hidden': 'true' });
  const chordEl = h('b.fvchord.schord');
  const secEl = h('span.ssec');
  const strip = h('div.fvnow.sstrip', null, h('div.sturn', null, word, squares), h('div.sside', null, h('span.fvlabel', null, t('fvNow')), chordEl, secEl));

  // settings: form, style, tempo, band volume
  const formSel = h('select.jamform', { 'aria-label': t('jamForm'), onchange: () => {
    if (run) halt();
    const nf = formSel.value;
    store.set('jamSession', { ...store.get('jamSession', {}), form: nf, style: defaultStyle(forms[nf]) });
    location.replace(`#/session/${nf}`); // the route renders the new form (no new history entry)
  } }, ...jam.forms.filter((id) => forms[id]).map((id) => h('option', { value: id, selected: id === fid }, L(forms[id].title))));
  const styleSeg = choice('div.seg.jamstyles', styles.map((s) => [s.id, L(s.title)]), st.style.id, (v) => { st.style = styles.find((s) => s.id === v); save(); paintBpm(); paintHint(); }, t('jamStyle'));
  const bpmOut = h('output.bpm');
  const tempoBox = h('div.stepper', null,
    h('button', { type: 'button', 'aria-label': t('slower'), onclick: () => setBpm(bpmOf() - 4) }, '−'), bpmOut,
    h('button', { type: 'button', 'aria-label': t('faster'), onclick: () => setBpm(bpmOf() + 4) }, '+'));
  const volOut = h('output.jamvol', { 'aria-live': 'polite' });
  const volBox = h('div.stepper.jamvolbox', { role: 'group', 'aria-label': t('jamVol') },
    h('button', { type: 'button', 'aria-label': t('jamVolDown'), onclick: () => setVol(st.vol - 1) }, '−'), volOut,
    h('button', { type: 'button', 'aria-label': t('jamVolUp'), onclick: () => setVol(st.vol + 1) }, '+'));
  const lab = (text, el) => h('div.jamctl', null, h('span.fvlabel', null, text), el);
  const setBox = h('details.jamset', { open: st.open, ontoggle: () => { st.open = setBox.open; save(); } },
    h('summary', null, t('settings')),
    h('div.jamrow', null, lab(t('jamForm'), formSel), lab(t('jamStyle'), styleSeg), lab(t('jamTempo'), tempoBox), lab(t('jamVol'), volBox)));

  const panel = h('section.panel.formpanel.jampanel.sesspanel', null, stage, fmtTabs, strip, setBox);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const footHint = h('span.foothint');
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => toggle() });
  const footer = h('footer.actions', null, footHint, h('div.grow'), primary);
  const screen = h('div.exscreen.formscreen.jamscreen.sessionscreen', null, header, h('main.ex', null, panel, kbPanel), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer);

  // ---------- keyboard: the palette of the moment + the partner's sounding keys ----------
  audio.preloadPiano(33, 98); // the band's bass from A1, the second pianist up to C7
  audio.preloadSax(PARTNERS.sax.lo, PARTNERS.sax.hi);
  const kb = createKeyboard(kbEl, [KB_LO, KB_HI], { names: nameMode(settings, 'key'), exact: true, center: 72, onPress: (m) => {
    audio.ensureAudio(); audio.pianoNote(m, audio.now() + 0.01, 0.5, 0.55); lastKey = performance.now(); markActive();
  } });
  let palMap = {}, palKey = '', lastKey = -1e9;
  const sounding = new Map(); // midi -> count of partner notes sounding
  function paintKeys() {
    const map = { ...palMap };
    sounding.forEach((n, m) => { if (n > 0 && m >= KB_LO && m <= KB_HI) map[m] = { cls: 'hit', label: '' }; });
    kb.mark(map, { reveal: false });
  }
  function paintPal(bar, slot) {
    const pal = paletteAt({}, bars, bar, slot);
    chordEl.textContent = pal.chord;
    const key = `${pal.chord}|${[...pal.pcs].sort().join(',')}`;
    if (key === palKey) return;
    palKey = key; palMap = paletteMarks(endKeys('chords', pal), pal, KB_LO, KB_HI); paintKeys();
  }

  // ---------- the strip and the stage ----------
  const partnerWord = () => t(st.partner === 'piano' ? 'sessPlays_piano' : 'sessPlays_sax');
  function secLabel(sec) {
    if (sec === 'partnerSolo' || (!melody && sec === 'head')) return t(st.partner === 'piano' ? 'sessSec_soloPiano' : 'sessSec_soloSax');
    return t('sessSec_' + sec);
  }
  /** Paint the turn of absolute bar absBar (ending = the bar is one of the ending bars of a session). */
  function paintTurn(absBar, endingBar = -1) {
    const tn = endingBar >= 0 ? null : turnAt(st.format, NB, absBar);
    const who = tn ? tn.who : 'partner';
    Object.entries(blocks).forEach(([k, el]) => el.classList.toggle('hot', !!run && k === who));
    bandLine.textContent = who === 'drums' && run ? t('sessBandDrums') : t('sessBandLine');
    const ready = tn && who !== 'you' && tn.barsLeft === 1 && tn.next === 'you';
    word.textContent = ready ? t('sessReady') : who === 'you' ? t('sessYourTurn') : who === 'drums' ? t('sessPlays_drums') : partnerWord();
    const len = tn ? tn.turnLen : endBars(), at = tn ? absBar - tn.turnStart : endingBar;
    squares.replaceChildren(...Array.from({ length: len }, (_, k) => h('i' + (k <= at && run ? '.on' : ''))));
    if (st.format === 'session') {
      const c = tn ? tn.chorus : 4;
      secEl.textContent = `${secLabel(tn ? tn.section : 'headOut')} · ${fill(t('sessRound'), { n: c + 1, m: 5 })}`;
    } else secEl.textContent = '';
  }
  function paintIdle(doneMsg = false) {
    paintTurn(0);
    if (doneMsg) { word.textContent = t('sessDone'); squares.replaceChildren(); secEl.textContent = ''; }
    paintPal(0, 0);
  }
  function paintBpm() { bpmOut.innerHTML = `♩ ${bpmOf()}`; }
  function setBpm(v) { if (run) halt(); st.bpm[st.style.id] = Math.max(40, Math.min(200, Math.round(v))); save(); paintBpm(); paintHint(); }
  function setVol(v) { if (run) halt(); st.vol = Math.max(1, Math.min(5, v)); save(); volOut.textContent = `${st.vol} / 5`; }
  function paintPrimary() { primary.innerHTML = run ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`; }
  function paintHint() {
    footHint.textContent = st.format === 'fours' ? t('sessHintFours')
      : st.format === 'session' ? fill(t('sessHintSession'), { n: sessionMinutes(NB, bpmOf(), endBars()) })
        : t('sessHint');
  }

  function play1(m, time, dur, v) { // the band and the second pianist: the piano (or the MIDI piano, as jam.js)
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) { sentMidi = true; return; } }
    audio.pianoNote(m, time, dur, v);
  }
  function partnerNote(m, time, dur, v) {
    if (run.partner === 'sax') audio.saxNote(m, time, dur, v); else play1(m, time, dur, v);
    queue.push({ t: time, kon: m }, { t: time + dur, koff: m });
  }

  // ---------- transport ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null, sentMidi = false;
  function start() {
    if (run || !audio.ensureAudio()) return;
    const bpm = bpmOf(), beat = 60 / bpm;
    let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += 4 * beat;
    const inst = PARTNERS[st.partner];
    run = {
      t0, beat, style: st.style, format: st.format, partner: st.partner, swingOff: st.style.swing ? beat * 2 / 3 : beat / 2,
      ctx: { bars, inst, licks, blues, melody }, ch: {}, pn: {}, made: new Set(), dt: {},
      end: st.format === 'session' ? { at: sessionBars(NB), ...endingOf(bars, ending, inst) } : null
    };
    g = 0; beatTime = t0; sentMidi = false;
    screen.classList.add('playing'); paintPrimary();
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  const gen = (c) => makeChorus(run.style, bars, { chorus: c, variety: 'low', rng: Math.random, prev: run.ch[c - 1] ? run.ch[c - 1].prev : null });
  /** Make the partner's notes / the drum fills of the turn starting at absolute bar a (once). */
  function prepare(a) {
    if (run.made.has(a)) return;
    run.made.add(a);
    const tn = turnAt(run.format, NB, a);
    if (tn.who === 'partner') partnerTurn(run.ctx, run.format, a, Math.random).forEach((e) => { (run.pn[e.bar] = run.pn[e.bar] || []).push(e); });
    if (tn.who === 'drums') run.dt[a] = drumTurn(run.style, tn.turnLen, Math.random);
  }
  function schedule() {
    if (!run) return;
    const r = run, now = audio.now(), ahead = now + 0.15, vg = VOL[st.vol - 1], dg = vg * (r.style.drumGain == null ? 1 : r.style.drumGain);
    const gr = (slot, time, barG) => groove(slot, time, { swing: r.style.drums === 'swing', style: r.style.drums === 'bossa' ? 'bossa' : null, bar: barG, gain: dg });
    const noteDur = (d) => d * r.beat / 2 * 0.92;
    for (;;) {
      const slot = g % PER, absBar = Math.floor(g / PER);
      const time = beatTime + (slot % 2 ? r.swingOff : 0);
      if (time > ahead) break;
      if (r.end && absBar >= r.end.at) { // the ending of a session: groove through its bars, beat 1 only on the last, then the end
        const e = absBar - r.end.at;
        if (e >= r.end.bars) { queue.push({ t: time, finish: true }); clearInterval(timer); timer = 0; return; }
        const last = e === r.end.bars - 1;
        if (time >= now - 0.03) {
          if (!last || slot === 0) gr(slot, time, absBar);
          r.end.band[e].forEach((n) => { if (n.t === slot) play1(n.m, time, noteDur(n.d), n.v * vg); });
          r.end.partner[e].forEach((n) => { if (n.t === slot) partnerNote(n.m, time, noteDur(n.d), n.v); });
          if (slot === 0) queue.push({ t: time, endBar: e });
          if (slot === 0 || slot === 4) queue.push({ t: time, pal: [0, 0] });
        }
      } else {
        const bar = absBar % NB, chorus = Math.floor(absBar / NB);
        if (!r.ch[chorus]) r.ch[chorus] = gen(chorus);
        if (slot === 0 && bar === NB - 1 && !r.ch[chorus + 1]) { r.ch[chorus + 1] = gen(chorus + 1); delete r.ch[chorus - 1]; }
        const tn = turnAt(r.format, NB, absBar);
        if (slot === 0) { prepare(tn.turnStart); delete r.pn[absBar - 2]; }
        if (time >= now - 0.03) {
          const cb = r.ch[chorus].bars[bar];
          gr(slot, time, absBar);
          if (tn.who === 'drums') { // the drummer alone: the band's bass and chords rest
            const dt = r.dt[tn.turnStart];
            if (dt) dt[absBar - tn.turnStart].hits.forEach((x) => { if (x.t === slot) audio.drum(x.kind, time, x.v * dg); });
          } else {
            if (cb.fill) fillHits(r.style, slot).forEach((x) => audio.drum(x.kind, time, x.v * dg));
            cb.notes.forEach((n) => { if (n.t === slot) play1(n.m, time, n.stac ? Math.min(r.beat * 0.5, 0.25) : noteDur(n.d), n.v * vg); });
          }
          (r.pn[absBar] || []).forEach((n) => { if (n.t === slot) partnerNote(n.m, time, noteDur(n.d) * (r.partner === 'sax' ? 1.04 : 1), n.v); });
          if (slot === 0) queue.push({ t: time, bar: absBar });
          if (slot === 0 || slot === 4) queue.push({ t: time, pal: [bar, slot] });
          if (slot % 2 === 0) queue.push({ t: time, beat: true });
        }
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
    if (q.ci !== undefined) { word.textContent = `${t('countInLabel')}: ${q.ci}`; return; }
    if (q.finish) { halt(true); return; }
    if (q.bar !== undefined) paintTurn(q.bar);
    else if (q.endBar !== undefined) paintTurn(0, q.endBar);
    else if (q.pal) paintPal(q.pal[0], q.pal[1]);
    else if (q.kon !== undefined) { sounding.set(q.kon, (sounding.get(q.kon) || 0) + 1); paintKeys(); }
    else if (q.koff !== undefined) { sounding.set(q.koff, Math.max(0, (sounding.get(q.koff) || 0) - 1)); if (!sounding.get(q.koff)) sounding.delete(q.koff); paintKeys(); }
    else if (q.beat && performance.now() - lastKey < 8000) markActive(); // a band left alone is not practice
  }
  /** Stop and go back to bar 1 (done: the session played to its end). */
  function halt(done = false) {
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = run; run = null;
    screen.classList.remove('playing');
    if (was) { audio.hush(); if (sentMidi) silence(); }
    sounding.clear(); palKey = '';
    idle(); paintPrimary(); paintIdle(done);
  }
  function toggle() { if (run) halt(); else start(); }

  // ---------- input: the learner's notes sound and light, nothing is judged ----------
  const offNote = onNote((e) => { kb.down(e.note, e.type === 'on'); if (e.type === 'on') { lastKey = performance.now(); markActive(); } });
  const onKey = (e) => { if (e.code === 'Space' && !(e.target.closest && e.target.closest('input,select,textarea,summary,button'))) { e.preventDefault(); toggle(); } };
  document.addEventListener('keydown', onKey);

  paintBpm(); setVol(st.vol); paintPrimary(); paintHint(); paintIdle();

  return () => {
    if (run) halt();
    if (footRO) footRO.disconnect();
    offNote(); document.removeEventListener('keydown', onKey);
    header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup());
  };
}
