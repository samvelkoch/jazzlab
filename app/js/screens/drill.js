// Drill screen: keyboard geography without a staff. A big prompt ("Play: Bb", "All F", "A fifth up from G",
// "Play C7"), the piano (or the on-screen keyboard) answers, we count accuracy and time per task.
import { h, ICON, themeButton, midiChip, sessionChip } from '../ui.js';
import { t, L } from '../i18n.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview, reviews } from '../store.js';
import { toMidi, noteName, midiToName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import { chordPcs, chordNames } from '../music/forms.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote } from '../music/midi.js';

const LO = 48, HI = 84; // C3..C6 on screen
const pcOf = (m) => ((m % 12) + 12) % 12;
const INTERVAL_KEY = { 3: 'int_m3', 4: 'int_M3', 5: 'int_p4', 7: 'int_p5', 10: 'int_m7', 12: 'int_p8' };

/** Expand the item's task specs into a shuffled list of concrete tasks (no immediate repeats). */
function makeTasks(item) {
  const out = [];
  item.tasks.forEach((spec) => {
    const pool = [];
    if (spec.type === 'note' || spec.type === 'all') spec.notes.forEach((n) => pool.push({ type: spec.type, name: n, pc: pcOf(toMidi(n + '4')) }));
    else if (spec.type === 'interval') spec.notes.forEach((n) => pool.push({ type: 'interval', name: n, pc: pcOf(toMidi(n + '4')), semis: spec.semis }));
    else if (spec.type === 'chord') spec.chords.forEach((c) => pool.push({ type: 'chord', name: c, pcs: chordPcs(c), tones: chordNames(c) }));
    const n = spec.n || pool.length;
    let last = null;
    for (let k = 0; k < n; k++) {
      let pick; let guard = 0;
      do { pick = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && pick === last && guard++ < 20);
      last = pick; out.push({ ...pick });
    }
  });
  return out;
}

export function renderDrill(root, { track, itemId, item, back }) {
  const settings = { names: 'en', pianoSnd: true, ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  // names come from the task spec (Bb stays Bb, not A#); chord tones are spelled like the chord (C7 = C E G Bb, A7 = A C# E G)
  const nm = (x) => noteName(x.name + '4', names);
  const st = { tasks: [], k: -1, running: false, t0: 0, errors: 0, log: [], held: new Set(), got: new Set() };
  const wasDue = reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date();

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('drillUpper')}`), h('span.title', null, L(item.title))),
    h('div.grow'), sessionChip(itemId), midiChip(), themeButton());
  const prog = h('span.barno'), timer = h('span.dtimer'), fbEl = h('span.fb', { 'aria-live': 'polite' });
  const promptK = h('span.kicker'), promptB = h('b.dprompt'), promptS = h('span.dsub');
  const card = h('div.dcard', null, promptK, promptB, promptS);
  const summary = h('div.dsummary');
  const panel = h('section.panel.drillpanel', null,
    h('div.staffhead', null, prog, timer, h('div.grow'), fbEl),
    card, summary,
    h('p.muted.dabout', null, L(item.about)));
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => (st.running ? stop() : start()) });
  const footer = h('footer.actions', null, h('span.foothint', null, midiState().connected ? t('drillHintMidi') : t('drillHintScreen')), h('div.grow'), primary);
  const screen = h('div.exscreen.drillscreen', null, header, h('main.ex', null, panel, kbPanel), footer);
  root.replaceChildren(screen);

  audio.preloadPiano(LO, HI);
  const kb = createKeyboard(kbEl, [LO, HI - 2], { names: settings.names, onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.5, 0.55); if (!midiState().connected) { input(m, true); } } });
  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const fb = (html) => { fbEl.innerHTML = html; };
  const paintPrimary = () => { primary.innerHTML = st.running ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${st.log.length ? t('again') : t('play')}</span>`; };

  // ---------- tasks ----------
  const task = () => st.tasks[st.k];
  const litKeys = () => { // reference keys shown on the keyboard for the task
    const x = task(); if (!x) return [];
    if (x.type === 'interval') return [60 + x.pc]; // the "from" key, 4th octave
    return [];
  };
  function showTask() {
    const x = task();
    prog.textContent = `${st.k + 1} / ${st.tasks.length}`;
    st.got.clear(); st.errors = 0; st.t0 = performance.now();
    kb.show({ rh: null, lh: null }, { rh: null, lh: null }, 'both');
    if (x.type === 'note') { promptK.textContent = t('dPlay'); promptB.textContent = nm(x); promptS.textContent = t('dAnyOctave'); }
    else if (x.type === 'all') { const n = keysOf(x.pc).length; promptK.textContent = t('dAll'); promptB.textContent = nm(x); promptS.textContent = t('dAllSub').replace('{n}', n); }
    else if (x.type === 'interval') { promptK.textContent = t(INTERVAL_KEY[x.semis] || 'int_up'); promptB.textContent = `${nm(x)} ↑`; promptS.textContent = t('dIntervalSub').replace('{n}', x.semis); kb.show({ rh: { notes: [midiToName(60 + x.pc)], f: [] }, lh: null }, { rh: null, lh: null }, 'both'); }
    else if (x.type === 'chord') { promptK.textContent = t('dChord'); promptB.textContent = x.name; promptS.textContent = t('dChordSub').replace('{notes}', x.tones.map((n) => noteName(n + '4', names)).join(' · ')); }
    fb('');
  }
  const keysOf = (pc) => { const out = []; for (let m = LO; m <= HI; m++) if (pcOf(m) === pc) out.push(m); return out; };

  function start() {
    audio.ensureAudio();
    st.tasks = makeTasks(item); st.k = -1; st.log = []; st.running = true; st.held.clear();
    summary.replaceChildren(); screen.classList.add('playing'); paintPrimary();
    next();
  }
  function next() {
    st.k++;
    if (st.k >= st.tasks.length) { finish(); return; }
    showTask();
  }
  function done(ok) {
    const ms = performance.now() - st.t0;
    st.log.push({ ms, errors: st.errors, ok: ok && st.errors === 0 });
    const x = task();
    fb(st.errors ? `<span class="meh">${t('dWithErrors').replace('{n}', st.errors)}</span> · ${(ms / 1000).toFixed(1)} ${t('sec')}` : `<span class="ok">✓</span> ${(ms / 1000).toFixed(1)} ${t('sec')}`);
    setTimeout(() => { if (st.running) next(); }, x.type === 'chord' ? 650 : 350);
    st.t0 = Infinity; // ignore input until the next task
  }
  function input(m, screenTap) {
    markActive();
    if (!st.running || st.t0 === Infinity) return;
    const x = task(), pc = pcOf(m);
    if (x.type === 'note') { if (pc === x.pc) { kb.flash(m, 'ok'); done(true); } else wrong(m); return; }
    if (x.type === 'all') {
      if (pc !== x.pc) { wrong(m); return; }
      const inRange = m >= LO && m <= HI;
      if (inRange) st.got.add(m); kb.flash(m, 'ok');
      const need = keysOf(x.pc);
      fb(`${st.got.size} / ${need.length}`);
      if (need.every((k) => st.got.has(k))) done(true);
      return;
    }
    if (x.type === 'interval') { if (pc === pcOf(x.pc + x.semis)) { kb.flash(m, 'ok'); done(true); } else wrong(m); return; }
    if (x.type === 'chord') {
      if (!x.pcs.includes(pc)) { wrong(m); return; }
      kb.flash(m, 'ok');
      // with MIDI the chord must be held together; on screen (no note-off) the notes accumulate
      const held = screenTap ? (st.got.add(pc), st.got) : new Set([...st.held].map(pcOf));
      fb(`${[...new Set([...held].filter((p) => x.pcs.includes(p)))].length} / ${x.pcs.length}`);
      if (x.pcs.every((p) => held.has(p))) done(true);
    }
  }
  function wrong(m) { st.errors++; kb.flash(m, 'bad'); fb(`<span class="bad">${t('wrongNote')}: ${noteName(midiToName(m), names)}</span>`); }
  function finish() {
    st.running = false; screen.classList.remove('playing'); idle();
    const n = st.log.length, okN = st.log.filter((x) => x.ok).length, acc = n ? okN / n : 0;
    const avg = n ? st.log.reduce((a, x) => a + x.ms, 0) / n : 0;
    const pass = acc >= (item.pass.acc || 0.9) && avg <= (item.pass.avgMs || 1e9);
    promptK.textContent = t('result'); promptB.textContent = pass ? t('dPassed') : t('dNotYet');
    promptS.textContent = pass ? t('dPassedSub') : (acc < (item.pass.acc || 0.9) ? t('dMoreAccurate') : t('dFaster'));
    prog.textContent = `${n} / ${n}`;
    summary.replaceChildren(
      stat(`${Math.round(acc * 100)}%`, t('dAccuracy'), acc >= (item.pass.acc || 0.9)),
      stat(`${(avg / 1000).toFixed(1)} ${t('sec')}`, t('dAvgTime'), avg <= (item.pass.avgMs || 1e9)),
      stat(`${okN}/${n}`, t('dClean'), true));
    updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, ...(pass ? { done: true } : {}) }, best: better(p.best, { acc, avgMs: Math.round(avg) }), lastAcc: acc, lastAvgMs: Math.round(avg) }));
    if (pass) scheduleReview(itemId, true); else if (wasDue) scheduleReview(itemId, false);
    fb(pass ? `<span class="ok">${ICON.check} ${t('stageDone')}</span>` : '');
    paintPrimary();
  }
  const better = (a, b) => (!a ? b : (b.acc > a.acc || (b.acc === a.acc && b.avgMs < a.avgMs)) ? b : a);
  const stat = (v, label, good) => h('div.dstat' + (good ? '.good' : ''), null, h('b', null, v), h('span', null, label));
  function stop() { st.running = false; screen.classList.remove('playing'); idle(); fb(''); paintPrimary(); }

  // ---------- wiring ----------
  const offNote = onNote((e) => {
    if (e.type === 'on') { st.held.add(e.note); kb.down(e.note, true); audio.ensureAudio(); input(e.note, false); }
    else { st.held.delete(e.note); kb.down(e.note, false); }
  });
  const onKey = (e) => { if (e.code === 'Space' && !e.target.closest('input,select,textarea,summary')) { e.preventDefault(); if (st.running) stop(); else start(); } };
  document.addEventListener('keydown', onKey);

  // intro state
  const saved = exProgress(itemId);
  promptK.textContent = saved.best ? t('dBest') : t('dReady');
  promptB.textContent = saved.best ? `${Math.round(saved.best.acc * 100)}% · ${(saved.best.avgMs / 1000).toFixed(1)} ${t('sec')}` : L(item.title);
  promptS.textContent = t('dGoal').replace('{acc}', Math.round((item.pass.acc || 0.9) * 100)).replace('{s}', ((item.pass.avgMs || 0) / 1000).toFixed(1));
  prog.textContent = `0 / ${item.tasks.reduce((a, x) => a + (x.n || 0), 0)}`;
  paintPrimary();
  updateEx(itemId, (p) => p);

  return () => { offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
