// Ear game "Find the note": a note sounds, the learner finds it on the keys. The range grows over the rounds
// (a fifth from C4, an octave, two octaves). Rounds are ok (first try), meh (found, few slips or a replay) or miss.
import { h, ICON, themeButton, midiChip, sessionChip } from '../ui.js';
import { t, L } from '../i18n.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview, reviews } from '../store.js';
import { noteName, midiToName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote } from '../music/midi.js';

const LO = 48, HI = 84; // C3..C6 on screen
const MAX_WRONG = 4;    // the 4th wrong key reveals the answer
const MEH_WRONG = 2;    // found with at most this many wrong keys (and no replay) still counts as meh

export function renderEar(root, { track, itemId, item, back }) {
  const settings = { names: 'en', pianoSnd: true, ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  const N = item.rounds || 12, ranges = item.ranges || [[60, 67]], passAcc = (item.pass && item.pass.acc) || 0.8;
  const nm = (m) => noteName(midiToName(m), names);
  const nmOct = (m) => nm(m) + (Math.floor(m / 12) - 1); // with octave number: C4
  const st = { running: false, k: -1, target: null, last: null, wrong: 0, replayed: false, locked: true, log: [] };
  const wasDue = reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date();
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('earUpper')}`), h('span.title', null, L(item.title))),
    h('div.grow'), sessionChip(itemId), midiChip(), themeButton());
  const prog = h('span.barno'), fbEl = h('span.fb', { 'aria-live': 'polite' });
  const promptK = h('span.kicker'), promptB = h('b.dprompt'), promptS = h('span.dsub');
  const card = h('div.dcard', null, promptK, promptB, promptS);
  const summary = h('div.dsummary');
  const panel = h('section.panel.drillpanel', null,
    h('div.staffhead', null, prog, h('div.grow'), fbEl),
    card, summary,
    h('p.muted.dabout', null, L(item.about)));
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const replayBtn = h('button.btn.earreplay', { type: 'button', title: t('earReplay'), onclick: () => replay(), html: ICON.speaker + `<span>${t('earReplay')}</span>` });
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => (st.running ? stop() : start()) });
  const footer = h('footer.actions', null, h('span.foothint', null, midiState().connected ? t('earHintMidi') : t('earHintScreen')), h('div.grow'), replayBtn, primary);
  const screen = h('div.exscreen.drillscreen.earscreen', null, header, h('main.ex', null, panel, kbPanel), footer);
  root.replaceChildren(screen);

  audio.preloadPiano(LO, HI);
  const kb = createKeyboard(kbEl, [LO, HI - 2], { names: settings.names, onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.8, 0.55); input(m); } });
  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const fb = (html) => { fbEl.innerHTML = html; };
  const paintPrimary = () => { primary.innerHTML = st.running ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${st.log.length ? t('again') : t('play')}</span>`; };

  // ---------- rounds ----------
  const rangeIdx = () => Math.min(ranges.length - 1, Math.floor(st.k * ranges.length / N));
  function pick() {
    const [lo, hi] = ranges[rangeIdx()];
    let m, guard = 0;
    do { m = lo + Math.floor(Math.random() * (hi - lo + 1)); } while (m === st.last && guard++ < 50);
    return m;
  }
  const playTarget = () => play1(st.target, audio.now() + 0.05, 1.4, 0.6);
  function start() {
    audio.ensureAudio();
    clearTimers();
    st.running = true; st.k = -1; st.log = []; st.last = null;
    summary.replaceChildren(); screen.classList.add('playing'); paintPrimary();
    next();
  }
  function next() {
    st.k++;
    if (st.k >= N) { finish(); return; }
    const [lo, hi] = ranges[rangeIdx()];
    st.target = pick(); st.last = st.target; st.wrong = 0; st.replayed = false; st.locked = false;
    prog.textContent = `${st.k + 1} / ${N}`;
    kb.show({ rh: null, lh: null }, { rh: null, lh: null }, 'both');
    promptK.textContent = t('earQ'); promptB.textContent = '♪';
    promptS.textContent = t('earRange').replace('{a}', nmOct(lo)).replace('{b}', nmOct(hi));
    fb('');
    playTarget();
  }
  function replay() {
    audio.ensureAudio();
    if (!st.running || st.locked) return;
    st.replayed = true; playTarget();
  }
  function settle(res, ms) {
    st.locked = true;
    st.log.push(res);
    later(() => { if (st.running) next(); }, ms);
  }
  function input(m) {
    markActive();
    if (!st.running || st.locked) return;
    if (m === st.target) {
      kb.flash(m, 'ok');
      const res = st.wrong === 0 && !st.replayed ? 'ok' : st.wrong <= MEH_WRONG ? 'meh' : 'miss';
      fb(res === 'miss' ? `<span class="bad">${nm(st.target)}</span>` : `<span class="${res}">✓ ${nm(st.target)}</span>`);
      settle(res, 350);
      return;
    }
    st.wrong++; kb.flash(m, 'bad');
    if (st.wrong >= MAX_WRONG) { // reveal the answer, count a miss
      kb.show({ rh: { notes: [midiToName(st.target)], f: [] }, lh: null }, { rh: null, lh: null }, 'both');
      fb(`<span class="bad">${t('earReveal')}: ${nm(st.target)}</span>`);
      settle('miss', 1100);
      return;
    }
    fb(`<span class="bad">${m < st.target ? t('earHigher') : t('earLower')}</span> · ${nm(m)}`);
  }
  function finish() {
    st.running = false; st.locked = true; screen.classList.remove('playing'); idle();
    const okN = st.log.filter((x) => x === 'ok').length, mehN = st.log.filter((x) => x === 'meh').length, missN = st.log.filter((x) => x === 'miss').length;
    const acc = N ? (okN + 0.5 * mehN) / N : 0, pass = acc >= passAcc;
    promptK.textContent = t('result'); promptB.textContent = pass ? t('dPassed') : t('dNotYet');
    promptS.textContent = pass ? t('earPassedSub') : t('earMoreAccurate');
    prog.textContent = `${N} / ${N}`;
    summary.replaceChildren(
      stat(`${Math.round(acc * 100)}%`, t('dAccuracy'), pass),
      stat(`${okN}/${N}`, t('earFirstTry'), true),
      stat(`${missN}`, t('earMisses'), missN === 0));
    updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, ...(pass ? { done: true } : {}) }, best: Math.max(typeof p.best === 'number' ? p.best : 0, acc), lastAcc: acc }));
    if (pass) scheduleReview(itemId, true); else if (wasDue) scheduleReview(itemId, false);
    fb(pass ? `<span class="ok">${ICON.check} ${t('stageDone')}</span>` : '');
    paintPrimary();
  }
  const stat = (v, label, good) => h('div.dstat' + (good ? '.good' : ''), null, h('b', null, v), h('span', null, label));
  function stop() { st.running = false; st.locked = true; clearTimers(); screen.classList.remove('playing'); idle(); fb(''); kb.show({ rh: null, lh: null }, { rh: null, lh: null }, 'both'); paintPrimary(); }

  // ---------- wiring ----------
  const offNote = onNote((e) => {
    if (e.type === 'on') { kb.down(e.note, true); audio.ensureAudio(); input(e.note); }
    else kb.down(e.note, false);
  });
  const onKey = (e) => { if (e.code === 'Space' && !e.target.closest('input,select,textarea,summary')) { e.preventDefault(); if (st.running) stop(); else start(); } };
  document.addEventListener('keydown', onKey);

  // intro state
  const saved = exProgress(itemId);
  const best = typeof saved.best === 'number' ? saved.best : 0;
  promptK.textContent = best ? t('dBest') : t('earUpper');
  promptB.textContent = best ? `${Math.round(best * 100)}%` : L(item.title);
  promptS.textContent = t('earGoal').replace('{acc}', Math.round(passAcc * 100)).replace('{n}', N);
  prog.textContent = `0 / ${N}`;
  paintPrimary();
  updateEx(itemId, (p) => p);

  return () => { clearTimers(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
