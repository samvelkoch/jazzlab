// Ear game "Find the note": a note sounds, the learner finds it on the keys. The range grows over the rounds
// (item.ranges). Rounds are ok (first try), meh (found, few slips or a replay) or miss (revealed).
// The keys are not labelled while the question is open (the ear, not reading, is trained); the zone the note is in
// is drawn on the keys. A wrong key stays red, a big "Higher →" / "← Lower" says where to go, the keys the note can
// no longer be on are struck out, and the learner hears their note and then the target to compare. After the answer
// the note is shown on a staff; the next round comes after a visible countdown (with Pause), or, after a reveal,
// when the learner taps Next.
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L } from '../i18n.js';
import { markTerms } from '../glossary.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview, reviews } from '../store.js';
import { createKeyboard } from '../music/keyboard.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote } from '../music/midi.js';
import { narrowWindow } from '../music/ear-games.js';
import { earDots, earCard, listenBtn, nextBar, noteBadge } from './ear-ui.js';

const MAX_WRONG = 4;    // the 4th wrong key reveals the answer
const MEH_WRONG = 2;    // found with at most this many wrong keys (and no replay) still counts as meh
const NEXT_MS = 2000;   // the countdown to the next round after a right answer
const PAD = 4;          // keys shown on each side of the zone

export function renderEar(root, { track, itemId, item, back }) {
  const settings = { names: 'en', pianoSnd: true, ...store.get('settings', {}) };
  const N = item.rounds || 12, ranges = item.ranges || [[60, 67]], passAcc = (item.pass && item.pass.acc) || 0.8;
  const st = { running: false, k: -1, target: null, last: null, wrong: 0, replayed: false, phase: 'idle', log: [], win: null, tries: [], kbRange: null };
  const wasDue = reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date();
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('earUpper')}`), h('span.title', null, L(item.title))),
    h('div.grow'), sessionChip(itemId), midiChip(), themeButton());
  const prog = h('span.erround'), dots = earDots(N);
  const steps = [1, 2, 3].map((i) => h('span', null, `${i} · ${t('ezStep' + i)}`));
  const cardEl = h('div.dcard'), card = earCard(cardEl);
  const summary = h('div.dsummary');
  const about = h('p.muted.dabout', null, markTerms(L(item.about)));
  const panel = h('section.panel.drillpanel', null,
    h('div.staffhead.erhead', null, prog, dots.el, h('div.grow'), h('div.ersteps', null, ...steps)),
    cardEl, summary, about);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const nb = nextBar({ onNext: () => { if (st.running) next(); } });
  const primary = h('button.btn.xl', { type: 'button', onclick: () => (st.running ? stop() : start()) });
  const footer = h('footer.actions', null, ...nb.els.slice(0, 2), h('div.grow'), nb.els[2], primary);
  const screen = h('div.exscreen.drillscreen.earscreen.earfind', null, header, h('main.ex', null, panel, kbPanel), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer); // phone: the keyboard sticks right above the footer

  let kb = null;
  function buildKb(lo, hi) {
    const r = [Math.max(21, lo - PAD), Math.min(108, hi + PAD)];
    if (st.kbRange && st.kbRange[0] === r[0] && st.kbRange[1] === r[1]) return;
    st.kbRange = r;
    audio.preloadPiano(r[0], r[1]);
    kb = createKeyboard(kbEl, r, { names: 'off', exact: true, center: Math.round((lo + hi) / 2), onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.8, 0.55); input(m); } });
  }
  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const paintPrimary = () => {
    primary.classList.toggle('accent', !st.running);
    primary.innerHTML = st.running ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${st.log.length ? t('again') : t('ezStart')}</span>`;
  };
  const paintSteps = (i) => steps.forEach((s, j) => s.classList.toggle('on', j === i));
  const paintHead = () => { prog.textContent = t('ezRound').replace('{k}', Math.min(N, st.k + 1)).replace('{n}', N); dots.paint(st.log, st.running ? st.k : -1); };

  // ---------- the keys ----------
  const zone = () => ranges[rangeIdx()];
  function paintKeys(bar) {
    const marks = {};
    st.tries.forEach((m, i) => { marks[m] = { cls: 'wrong', label: st.phase === 'reveal' ? String(i + 1) : i === st.tries.length - 1 && st.phase === 'listen' ? t('ezYou') : '×' }; });
    if (st.phase === 'right') marks[st.target] = { cls: 'hit', label: '✓' };
    if (st.phase === 'reveal') marks[st.target] = { cls: 'hit', label: t('ezHere') };
    kb.mark(marks, { reveal: false });
    const [a, b] = zone();
    kb.zone({ zone: [a, b], win: st.phase === 'listen' ? st.win : null, bar: bar || { kind: 'zone', from: a, to: b, label: t('ezZone') } });
  }

  // ---------- rounds ----------
  const rangeIdx = () => Math.min(ranges.length - 1, Math.max(0, Math.floor(st.k * ranges.length / N)));
  function pick() {
    const [lo, hi] = zone();
    let m, guard = 0;
    do { m = lo + Math.floor(Math.random() * (hi - lo + 1)); } while (m === st.last && guard++ < 50);
    return m;
  }
  const playTarget = (at = 0.05) => play1(st.target, audio.now() + at, 1.4, 0.6);
  function start() {
    audio.ensureAudio();
    clearTimers();
    st.running = true; st.k = -1; st.log = []; st.last = null;
    summary.replaceChildren(); screen.classList.add('playing'); paintPrimary();
    next();
  }
  function listenCard() {
    card.set({ kicker: t('ezTask'), title: t('ezListenT'), text: t('ezListenS'), actions: [listenBtn(t('ezListenAgain'), () => replay())] });
  }
  function next() {
    clearTimers();
    st.k++;
    if (st.k >= N) { finish(); return; }
    const [lo, hi] = zone();
    buildKb(lo, hi);
    st.target = pick(); st.last = st.target; st.wrong = 0; st.replayed = false; st.phase = 'listen'; st.win = [lo, hi]; st.tries = [];
    paintHead(); paintSteps(0); paintKeys(); listenCard();
    nb.hint(midiState().connected ? t('earHintMidi') : t('earHintScreen'));
    playTarget();
    later(() => { if (st.phase === 'listen') paintSteps(1); }, 1500);
  }
  function replay() {
    audio.ensureAudio();
    if (!st.running) return;
    if (st.phase === 'listen' && !st.tries.length) st.replayed = true;
    if (st.phase === 'listen' && st.tries.length) { compare(); return; }
    playTarget();
  }
  function compare() { // the last wrong key, then the target
    const m = st.tries[st.tries.length - 1];
    play1(m, audio.now() + 0.45, 0.8, 0.55);
    play1(st.target, audio.now() + 1.35, 1.3, 0.6);
  }
  function input(m) {
    markActive();
    if (!st.running) return;
    if (st.phase === 'reveal') { // the answer is on the keys: pressing it goes on after the countdown
      if (m === st.target) { kb.flash(m, 'ok'); st.phase = 'revealed-played'; nb.count(NEXT_MS); }
      return;
    }
    if (st.phase !== 'listen') return;
    if (m === st.target) { right(m); return; }
    st.wrong++; kb.flash(m, 'bad');
    if (!st.tries.includes(m)) st.tries.push(m);
    st.win = narrowWindow(st.win, m, st.target);
    if (st.wrong >= MAX_WRONG) { reveal(); return; }
    const up = st.target > m;
    paintSteps(2);
    paintKeys(kb.has(m) ? { kind: 'arrow', from: m, to: up ? st.win[1] : st.win[0], label: t(up ? 'ezArrowUp' : 'ezArrowDown') } : null);
    card.set({
      tone: 'bad', big: t(up ? 'ezHigherBig' : 'ezLowerBig'),
      kicker: t('ezTry').replace('{k}', st.wrong).replace('{n}', MAX_WRONG),
      title: t(up ? 'ezHigherT' : 'ezLowerT'), text: t('ezCompareS'),
      actions: [listenBtn(t('ezCompare'), () => compare())],
    });
    nb.hint(t(up ? 'ezArrowUp' : 'ezArrowDown'));
    compare();
  }
  function right(m) {
    kb.flash(m, 'ok');
    const res = st.wrong === 0 && !st.replayed ? 'ok' : st.wrong <= MEH_WRONG ? 'meh' : 'miss';
    st.log.push(res); st.phase = 'right';
    paintHead(); paintKeys();
    card.set({ tone: 'ok', big: t('ezRightBig'), title: t('ezRightT'), text: t('ezRightS'), aside: noteBadge(st.target) });
    nb.count(NEXT_MS);
  }
  function reveal() {
    st.log.push('miss'); st.phase = 'reveal';
    paintHead(); paintKeys();
    card.set({ tone: 'reveal', big: t('ezRevealBig'), title: t('ezRevealT'), text: t('ezRevealS'), actions: [listenBtn(t('ezListenAgain'), () => playTarget())], aside: noteBadge(st.target) });
    nb.wait();
    later(() => { if (st.phase === 'reveal') playTarget(); }, 500);
  }
  function finish() {
    st.running = false; st.phase = 'idle'; screen.classList.remove('playing'); idle(); nb.off(); paintSteps(-1);
    const okN = st.log.filter((x) => x === 'ok').length, mehN = st.log.filter((x) => x === 'meh').length, missN = st.log.filter((x) => x === 'miss').length;
    const acc = N ? (okN + 0.5 * mehN) / N : 0, pass = acc >= passAcc;
    st.k = N - 1; paintHead();
    card.set({ tone: pass ? 'ok' : '', kicker: t('result'), title: pass ? t('dPassed') : t('dNotYet'), text: pass ? t('earPassedSub') : t('earMoreAccurate') });
    summary.replaceChildren(
      stat(`${Math.round(acc * 100)}%`, t('dAccuracy'), pass),
      stat(`${okN}/${N}`, t('earFirstTry'), true),
      stat(`${missN}`, t('earMisses'), missN === 0));
    updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, ...(pass ? { done: true } : {}) }, best: Math.max(typeof p.best === 'number' ? p.best : 0, acc), lastAcc: acc }));
    if (pass) scheduleReview(itemId, true); else if (wasDue) scheduleReview(itemId, false);
    kb.mark({}, { reveal: false }); kb.zone({});
    paintPrimary();
  }
  const stat = (v, label, good) => h('div.dstat' + (good ? '.good' : ''), null, h('b', null, v), h('span', null, label));
  function stop() {
    st.running = false; st.phase = 'idle'; clearTimers(); nb.off(); screen.classList.remove('playing'); idle(); paintSteps(-1);
    kb.mark({}, { reveal: false }); kb.zone({});
    intro(); paintPrimary();
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => {
    if (e.type === 'on') { kb.down(e.note, true); audio.ensureAudio(); input(e.note); }
    else kb.down(e.note, false);
  });
  const onKey = (e) => {
    if (e.target.closest('input,select,textarea,summary,button')) return;
    if ((e.code === 'Enter' || e.code === 'ArrowRight') && st.running && nb.waiting()) { e.preventDefault(); nb.next(); return; }
    if (e.code === 'Space') { e.preventDefault(); if (st.running) stop(); else start(); }
  };
  document.addEventListener('keydown', onKey);

  // intro state
  function intro() {
    const saved = exProgress(itemId);
    const best = typeof saved.best === 'number' ? saved.best : 0;
    card.set({
      kicker: best ? `${t('dBest')}: ${Math.round(best * 100)}%` : t('earUpper'), title: L(item.title),
      text: t('earGoal').replace('{acc}', Math.round(passAcc * 100)).replace('{n}', N) + ' ' + t('ezHidden'),
    });
    st.k = -1; paintHead(); prog.textContent = t('ezRound').replace('{k}', 0).replace('{n}', N);
  }
  st.k = 0; buildKb(...zone()); st.k = -1;
  intro(); paintPrimary();
  updateEx(itemId, (p) => p);

  return () => { if (footRO) footRO.disconnect(); clearTimers(); nb.off(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
