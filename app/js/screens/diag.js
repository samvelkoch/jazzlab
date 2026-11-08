// Skills check-up (kind "diag"): four short tests in a row, an intro card before each.
//   Rhythm  16 taps against a metronome at 80 bpm (4 count-in clicks first)  -> rhythmMs (mean |dev|), rhythmBias (mean signed dev, < 0 = early)
//   Notes   8 note-name tasks (like the drills), any octave                   -> nameMs (mean time per task), nameAcc
//   Ear     8 rounds of "find the note" (C4..C5, then G3..G5)                 -> earAcc = (ok + 0.5 meh) / 8
//   Chords  8 chords (major / minor / dominant 7th), answered with buttons    -> chordAcc
// The result is saved to store 'diag' (newest first) and compared with the previous and the first one.
// No pass, no review: the item is "done" after the first check-up and comes back to "Today" after `every` days.
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L } from '../i18n.js';
import { markTerms } from '../glossary.js';
import { store, updateEx, markActive, idle } from '../store.js';
import { toMidi, noteName, midiToName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote } from '../music/midi.js';

const LO = 48, HI = 84;          // C3..C6 on screen
const BPM = 80, COUNT_IN = 4, BEATS = 16;
const TAP_WIN = 0.25;            // s: a tap farther than this from every click is ignored
const MIN_HITS = 4;              // fewer matched taps than this: the rhythm part is not scored
const NAME_POOL = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'F#', 'Ab'];
const ROUNDS = 8;
const EAR_RANGES = [[60, 72], [55, 79]];
const MAX_WRONG = 3, MEH_WRONG = 2; // the 3rd wrong key reveals the answer; found with <= 2 wrong keys (no replay) = meh
const CHORDS = [{ id: 'maj', offs: [0, 4, 7], key: 'dgMajor' }, { id: 'min', offs: [0, 3, 7], key: 'dgMinor' }, { id: 'dom', offs: [0, 4, 7, 10], key: 'dgDom' }];
const PARTS = ['rhythm', 'names', 'ear', 'chords'];
const MAX_KEPT = 100;
const pcOf = (m) => ((m % 12) + 12) % 12;
const rnd = (n) => Math.floor(Math.random() * n);

// ---------- shared formatting (the Skills card on the home screen uses it too) ----------
export const diagFmt = {
  rhythm: (ms) => `${Math.round(ms)} ${t('ms')}`,
  bias: (b) => (Math.abs(b) >= 5 ? `${t(b < 0 ? 'early' : 'late')}` : ''),
  names: (ms) => `${(ms / 1000).toFixed(1)} ${t('sec')}`,
  pct: (x) => `${Math.round(x * 100)}%`
};
// [key, lower is better, comparable rounded value, formatter]
const METRICS = [
  ['rhythmMs', true, (v) => Math.round(v), diagFmt.rhythm],
  ['nameMs', true, (v) => Math.round(v / 100), diagFmt.names],
  ['earAcc', false, (v) => Math.round(v * 100), diagFmt.pct],
  ['chordAcc', false, (v) => Math.round(v * 100), diagFmt.pct]
];
/** 1 = `now` is better than `ref`, -1 = worse, 0 = same (at the displayed precision) or not comparable. */
function compare(m, now, ref) {
  if (typeof now !== 'number' || typeof ref !== 'number') return 0;
  const a = m[2](now), b = m[2](ref);
  return a === b ? 0 : ((m[1] ? a < b : a > b) ? 1 : -1);
}

export function renderDiag(root, { track, itemId, item, back }) {
  const settings = { names: 'en', pianoSnd: true, ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  const nmOct = (m) => noteName(midiToName(m), names) + (Math.floor(m / 12) - 1);
  const st = { phase: 'idle', part: 0, k: -1, locked: true, log: [], target: null, last: null, wrong: 0, replayed: false, t0: 0, errors: 0, chord: null, clicks: [], lastTap: -1e9 };
  const R = {}; // results of this run
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, Math.max(0, ms)); timers.add(id); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('diagUpper')}`), h('span.title', null, L(item.title))),
    h('div.grow'), sessionChip(itemId), midiChip(), themeButton());
  const strip = h('div.diagstrip', { 'aria-hidden': 'true' }, ...PARTS.map(() => h('i')));
  const prog = h('span.barno'), subprog = h('span.dtimer'), fbEl = h('span.fb', { 'aria-live': 'polite' });
  const promptK = h('span.kicker'), promptB = h('b.dprompt'), promptS = h('span.dsub');
  const card = h('div.dcard', null, promptK, promptB, promptS);
  const summary = h('div.dsummary.diagsum');
  const panel = h('section.panel.drillpanel', null,
    h('div.staffhead', null, prog, subprog, h('div.grow'), fbEl), strip, card, summary,
    h('p.muted.dabout', null, markTerms(L(item.about))));
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const pad = h('button.diagpad', { type: 'button' },
    h('span.padicon', { html: ICON.note }), h('span.padtext', null, h('b', null, t('dgTapPad')), h('span', null, t('dgTapPadSub'))));
  const padPanel = h('section.panel.padpanel', null, pad);
  const ansBtns = CHORDS.map((c) => h('button.btn.xl.diagbtn', { type: 'button', 'data-a': c.id, onclick: () => answer(c.id) }, t(c.key)));
  const ansPanel = h('section.panel.anspanel', null, ...ansBtns);
  const replayBtn = h('button.btn.diagreplay', { type: 'button', title: t('earReplay'), onclick: () => replay(), html: ICON.speaker + `<span>${t('earReplay')}</span>` });
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => { primary.blur(); primaryAction(); } });
  const footer = h('footer.actions', null, h('span.foothint', null, t('dgHint')), h('div.grow'), replayBtn, primary);
  const screen = h('div.exscreen.drillscreen.diagscreen', { 'data-input': 'none' }, header, h('main.ex', null, panel, kbPanel, padPanel, ansPanel), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer); // phone: the keyboard sticks right above the footer

  audio.preloadPiano(LO, HI);
  const kb = createKeyboard(kbEl, [LO, HI - 2], { names: settings.names, onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.6, 0.55); input(m); } });
  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const fb = (html) => { fbEl.innerHTML = html; };
  const clearKb = () => kb.show({ rh: null, lh: null }, { rh: null, lh: null }, 'both');
  const setInput = (v) => { screen.dataset.input = v; replayBtn.style.display = v === 'ans' || (v === 'keys' && PARTS[st.part] === 'ear') ? '' : 'none'; };
  const stat = (v, label, good) => h('div.dstat' + (good ? '.good' : ''), null, h('b', null, v), h('span', null, label));
  const paintStrip = () => {
    strip.querySelectorAll('i').forEach((el, i) => { el.className = st.phase === 'summary' || i < st.part ? 'done' : i === st.part && st.phase !== 'idle' ? 'cur' : ''; });
    prog.textContent = st.phase === 'idle' ? `0 / ${PARTS.length}` : st.phase === 'summary' ? `${PARTS.length} / ${PARTS.length}` : `${st.part + 1} / ${PARTS.length} · ${t('dgPart_' + PARTS[st.part])}`;
  };
  function paintPrimary() {
    const run = st.phase === 'run';
    primary.innerHTML = run ? ICON.stop + `<span>${t('dgStopW')}</span>` : ICON.play + `<span>${{ idle: t('dgStart'), intro: t('dgGo'), summary: t('dgAgain') }[st.phase]}</span>`;
    primary.classList.toggle('accent', !run);
  }
  function primaryAction() {
    if (st.phase === 'idle' || st.phase === 'summary') begin();
    else if (st.phase === 'intro') go();
    else abort();
  }

  // ---------- flow ----------
  const savedList = () => store.get('diag', []);
  function showIdle() {
    clearTimers(); st.phase = 'idle'; screen.classList.remove('playing'); setInput('none'); summary.replaceChildren(); subprog.textContent = ''; fb('');
    const last = savedList()[0];
    promptK.textContent = last ? t('dgLastW') : t('diagUpper');
    promptB.textContent = last ? new Date(last.date).toLocaleDateString() : L(item.title);
    promptB.classList.add('small');
    promptS.textContent = t('dgIdleSub');
    paintStrip(); paintPrimary();
  }
  function begin() {
    audio.ensureAudio();
    Object.keys(R).forEach((k) => delete R[k]);
    summary.replaceChildren();
    gotoIntro(0);
  }
  function gotoIntro(i) {
    clearTimers(); st.part = i; st.phase = 'intro'; screen.classList.remove('playing'); setInput('none'); subprog.textContent = ''; fb('');
    const p = PARTS[i];
    promptK.textContent = `${i + 1} / ${PARTS.length} · ${t('dgPart_' + p)}`;
    promptB.textContent = t('dgPart_' + p); promptB.classList.add('small');
    promptS.textContent = t('dgIntro_' + p);
    paintStrip(); paintPrimary();
  }
  function go() {
    audio.ensureAudio();
    st.phase = 'run'; screen.classList.add('playing'); promptB.classList.remove('small'); fb('');
    paintStrip(); paintPrimary();
    ({ rhythm: runRhythm, names: runNames, ear: runEar, chords: runChords })[PARTS[st.part]]();
  }
  function abort() {
    if (PARTS[st.part] === 'rhythm') audio.hush();
    idle(); showIdle();
  }
  function endPart() {
    idle(); clearTimers();
    if (st.part < PARTS.length - 1) gotoIntro(st.part + 1); else finishAll();
  }

  // ---------- 1. rhythm ----------
  function runRhythm() {
    setInput('pad');
    const beat = 60 / BPM, t0 = audio.now() + 0.6;
    st.clicks = []; st.lastTap = -1e9;
    promptK.textContent = t('dgCountIn'); promptB.textContent = String(COUNT_IN); promptS.textContent = t('dgListen'); subprog.textContent = `0 / ${BEATS}`;
    for (let k = 0; k < COUNT_IN + BEATS; k++) {
      const at = t0 + k * beat;
      audio.click(at, k % 4 === 0);
      if (k >= COUNT_IN) st.clicks.push({ t: at, dev: null });
      later(() => {
        if (k < COUNT_IN) { promptB.textContent = String(COUNT_IN - k); return; }
        if (k === COUNT_IN) { promptK.textContent = t('dgTapNow'); promptS.textContent = ''; }
        promptB.textContent = `${k - COUNT_IN + 1} / ${BEATS}`; subprog.textContent = `${k - COUNT_IN + 1} / ${BEATS}`;
      }, (at - audio.now()) * 1000);
    }
    later(finishRhythm, (t0 + (COUNT_IN + BEATS - 1) * beat + TAP_WIN + 0.15 - audio.now()) * 1000);
  }
  function tap(ts, screenTap) {
    audio.ensureAudio(); markActive();
    if (screenTap) { pad.classList.remove('hit'); void pad.offsetWidth; pad.classList.add('hit'); audio.pianoNote(60, audio.now() + 0.005, 0.12, 0.5); }
    if (st.phase !== 'run' || PARTS[st.part] !== 'rhythm') return;
    if (ts - st.lastTap < 70) return; // a chord or a double trigger = one tap
    st.lastTap = ts;
    const T = audio.toAudioTime(ts);
    let best = null;
    for (const c of st.clicks) if (!best || Math.abs(T - c.t) < Math.abs(T - best.t)) best = c;
    if (!best || Math.abs(T - best.t) > TAP_WIN) return;
    const dev = (T - best.t) * 1000;
    if (best.dev === null || Math.abs(dev) < Math.abs(best.dev)) best.dev = dev; // one tap per click: the closer one counts
    fb(`<span class="${Math.abs(dev) <= 60 ? 'ok' : 'meh'}">${dev < 0 ? '−' : '+'}${Math.round(Math.abs(dev))} ${t('ms')}</span>`);
  }
  function finishRhythm() {
    const devs = st.clicks.filter((c) => c.dev !== null).map((c) => c.dev);
    R.rhythmHits = devs.length;
    if (devs.length >= MIN_HITS) {
      R.rhythmMs = devs.reduce((a, d) => a + Math.abs(d), 0) / devs.length;
      R.rhythmBias = devs.reduce((a, d) => a + d, 0) / devs.length;
    } else { R.rhythmMs = null; R.rhythmBias = null; }
    endPart();
  }

  // ---------- 2. note names ----------
  function runNames() {
    setInput('keys');
    st.k = -1; st.log = []; st.last = null;
    nextName();
  }
  function nextName() {
    st.k++;
    if (st.k >= ROUNDS) { R.nameMs = avg(st.log.map((x) => x.ms)); R.nameAcc = st.log.filter((x) => x.ok).length / ROUNDS; endPart(); return; }
    let n, guard = 0;
    do { n = NAME_POOL[rnd(NAME_POOL.length)]; } while (n === st.last && guard++ < 50);
    st.last = n; st.target = { name: n, pc: pcOf(toMidi(n + '4')) };
    st.errors = 0; st.t0 = performance.now(); st.locked = false;
    subprog.textContent = `${st.k + 1} / ${ROUNDS}`;
    clearKb(); fb('');
    promptK.textContent = t('dPlay'); promptB.textContent = noteName(n + '4', names); promptS.textContent = t('dAnyOctave');
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  // ---------- 3. ear ----------
  const earRange = () => EAR_RANGES[st.k < ROUNDS / 2 ? 0 : 1];
  function runEar() {
    setInput('keys');
    st.k = -1; st.log = []; st.last = null;
    nextEar();
  }
  function nextEar() {
    st.k++;
    if (st.k >= ROUNDS) {
      const okN = st.log.filter((x) => x === 'ok').length, mehN = st.log.filter((x) => x === 'meh').length;
      R.earAcc = (okN + 0.5 * mehN) / ROUNDS; endPart(); return;
    }
    const [lo, hi] = earRange();
    let m, guard = 0;
    do { m = lo + rnd(hi - lo + 1); } while (m === st.last && guard++ < 50);
    st.target = m; st.last = m; st.wrong = 0; st.replayed = false; st.locked = false;
    subprog.textContent = `${st.k + 1} / ${ROUNDS}`;
    clearKb(); fb('');
    promptK.textContent = t('earQ'); promptB.textContent = '♪';
    promptS.textContent = t('earRange').replace('{a}', nmOct(lo)).replace('{b}', nmOct(hi));
    playTarget();
  }
  const playTarget = () => play1(st.target, audio.now() + 0.05, 1.4, 0.6);
  function settle(res, ms) { st.locked = true; st.log.push(res); later(() => { if (st.phase === 'run') nextEar(); }, ms); }
  function inputEar(m) {
    if (st.locked) return;
    if (m === st.target) {
      kb.flash(m, 'ok');
      const res = st.wrong === 0 && !st.replayed ? 'ok' : st.wrong <= MEH_WRONG ? 'meh' : 'miss';
      fb(res === 'miss' ? `<span class="bad">${noteName(midiToName(st.target), names)}</span>` : `<span class="${res}">✓ ${noteName(midiToName(st.target), names)}</span>`);
      settle(res, 350); return;
    }
    st.wrong++; kb.flash(m, 'bad');
    if (st.wrong >= MAX_WRONG) {
      kb.show({ rh: { notes: [midiToName(st.target)], f: [] }, lh: null }, { rh: null, lh: null }, 'both');
      fb(`<span class="bad">${t('earReveal')}: ${noteName(midiToName(st.target), names)}</span>`);
      settle('miss', 1100); return;
    }
    fb(`<span class="bad">${m < st.target ? t('earHigher') : t('earLower')}</span> · ${noteName(midiToName(m), names)}`);
  }

  // ---------- 4. chords ----------
  function runChords() {
    setInput('ans');
    st.k = -1; st.log = [];
    nextChord();
  }
  function nextChord() {
    st.k++;
    if (st.k >= ROUNDS) { R.chordAcc = st.log.filter(Boolean).length / ROUNDS; endPart(); return; }
    st.chord = { root: 48 + rnd(13), q: CHORDS[rnd(CHORDS.length)] }; // root C3..C4
    st.locked = false;
    subprog.textContent = `${st.k + 1} / ${ROUNDS}`;
    ansBtns.forEach((b) => { b.classList.remove('ok', 'bad'); b.disabled = false; });
    fb('');
    promptK.textContent = t('dgChordQ'); promptB.textContent = '♪'; promptS.textContent = t('dgChordSub');
    playChord();
  }
  function playChord() {
    const T = audio.now() + 0.05;
    st.chord.q.offs.forEach((o) => play1(st.chord.root + o, T, 1.2, 0.55));
  }
  function answer(id) {
    markActive(); audio.ensureAudio();
    if (st.phase !== 'run' || PARTS[st.part] !== 'chords' || st.locked) return;
    st.locked = true;
    const right = st.chord.q.id, ok = id === right;
    st.log.push(ok);
    ansBtns.forEach((b) => { b.disabled = true; if (b.dataset.a === right) b.classList.add('ok'); else if (b.dataset.a === id) b.classList.add('bad'); });
    fb(ok ? `<span class="ok">✓ ${t(st.chord.q.key)}</span>` : `<span class="bad">${t('earReveal')}: ${t(st.chord.q.key)}</span>`);
    later(() => { if (st.phase === 'run') nextChord(); }, ok ? 700 : 1100);
  }

  // ---------- shared input / replay ----------
  function input(m) {
    markActive();
    if (st.phase !== 'run') return;
    const p = PARTS[st.part];
    if (p === 'ear') { inputEar(m); return; }
    if (p !== 'names' || st.locked) return;
    if (pcOf(m) === st.target.pc) {
      kb.flash(m, 'ok');
      const ms = performance.now() - st.t0, ok = st.errors === 0;
      st.log.push({ ms, ok }); st.locked = true;
      fb(ok ? `<span class="ok">✓</span> ${(ms / 1000).toFixed(1)} ${t('sec')}` : `<span class="meh">${t('dWithErrors').replace('{n}', st.errors)}</span> · ${(ms / 1000).toFixed(1)} ${t('sec')}`);
      later(() => { if (st.phase === 'run') nextName(); }, 350);
    } else { st.errors++; kb.flash(m, 'bad'); fb(`<span class="bad">${t('wrongNote')}: ${noteName(midiToName(m), names)}</span>`); }
  }
  function replay() {
    audio.ensureAudio();
    if (st.phase !== 'run' || st.locked) return;
    const p = PARTS[st.part];
    if (p === 'ear') { st.replayed = true; playTarget(); } else if (p === 'chords') playChord();
  }

  // ---------- summary ----------
  function finishAll() {
    st.phase = 'summary'; screen.classList.remove('playing'); setInput('none'); subprog.textContent = ''; fb('');
    const rec = { date: new Date().toISOString(), rhythmMs: R.rhythmMs, rhythmBias: R.rhythmBias, nameMs: R.nameMs, nameAcc: R.nameAcc, earAcc: R.earAcc, chordAcc: R.chordAcc };
    const before = savedList();
    store.set('diag', [rec, ...before].slice(0, MAX_KEPT));
    updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, done: true }, n: before.length + 1 }));
    const prev = before[0] || null, base = before.length > 1 ? before[before.length - 1] : null;
    promptK.textContent = t('result'); promptB.textContent = t('dgSaved'); promptB.classList.add('small');
    promptS.textContent = prev ? `${t('dgPrevW')}: ${new Date(prev.date).toLocaleDateString()}` : t('dgFirstNote');
    const arrow = (c) => (c ? h('span.darrow.' + (c > 0 ? 'up' : 'down'), { title: t(c > 0 ? 'dgBetter' : 'dgWorse'), 'aria-label': t(c > 0 ? 'dgBetter' : 'dgWorse') }, c > 0 ? '↑' : '↓') : null);
    const ref = (label, m, then) => (then && typeof then[m[0]] === 'number' ? h('small.dref', null, `${label} ${m[3](then[m[0]])} `, arrow(compare(m, rec[m[0]], then[m[0]]))) : null);
    const extra = { rhythmMs: () => (R.rhythmMs === null ? t('dgFewHits') + ` (${R.rhythmHits} ${t('dgOf')} ${BEATS})` : `${diagFmt.bias(R.rhythmBias) ? diagFmt.bias(R.rhythmBias) + ' ' + Math.round(Math.abs(R.rhythmBias)) + ' ' + t('ms') : ''}`), nameMs: () => `${t('dgAccW')} ${diagFmt.pct(R.nameAcc)}` };
    const labels = { rhythmMs: 'dgResRhythm', nameMs: 'dgResNames', earAcc: 'dgResEar', chordAcc: 'dgResChords' };
    summary.replaceChildren(...METRICS.map((m) => {
      const v = rec[m[0]];
      return h('div.dstat' + (!prev || compare(m, v, prev[m[0]]) >= 0 ? '.good' : ''), null,
        h('b', null, typeof v === 'number' ? m[3](v) : '—', prev ? arrow(compare(m, v, prev[m[0]])) : null),
        h('span', null, t(labels[m[0]])),
        extra[m[0]] ? h('small.dref', null, extra[m[0]]()) : null,
        ref(t('dgPrevW'), m, prev), ref(t('dgBaseW'), m, base));
    }));
    paintStrip(); paintPrimary();
  }

  // ---------- wiring ----------
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(e.timeStamp, true); });
  const offNote = onNote((e) => {
    if (e.type === 'on') {
      kb.down(e.note, true); audio.ensureAudio();
      if (st.phase === 'run' && PARTS[st.part] === 'rhythm') tap(e.ts, false); else input(e.note);
    } else kb.down(e.note, false);
  });
  const onKey = (e) => {
    if (e.code !== 'Space' || e.repeat || e.target.closest('input,select,textarea,summary')) return;
    e.preventDefault();
    if (st.phase === 'run') { if (PARTS[st.part] === 'rhythm') tap(e.timeStamp, true); return; }
    primaryAction();
  };
  document.addEventListener('keydown', onKey);

  showIdle();

  return () => { if (footRO) footRO.disconnect(); clearTimers(); if (st.phase === 'run' && PARTS[st.part] === 'rhythm') audio.hush(); idle(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
