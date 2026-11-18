// Ear game "Find the note": a reference note ("home") sounds, then the riddle; the learner finds the riddle on the keys.
// The zone grows with success, not with the round number: it starts on 3 white keys, widens after FIND_UP first-try
// answers in a row and narrows again after FIND_DOWN rounds in a row that were not (music/ear-games.js FIND_LADDER).
// A new session starts one zone below the best reached last time. Listening again is free; while the learner searches
// the riddle repeats by itself every AUTO_MS. Rounds are ok (first try), meh (found, few slips) or miss (revealed).
// The keys are not labelled while the question is open (the ear, not reading, is trained). A wrong key stays red, a big
// "Higher →" / "← Lower" says where to go, the keys the note can no longer be on are struck out, and the learner hears
// their note and then the target to compare. After the answer the note is shown on a staff and nothing moves on until
// the learner taps Next or plays any key: the time to remember the sound is theirs.
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L } from '../i18n.js';
import { markTerms } from '../glossary.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview, reviews } from '../store.js';
import { createKeyboard } from '../music/keyboard.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote } from '../music/midi.js';
import { narrowWindow, FIND_LADDER, FIND_HOME, FIND_UP, findStep, findStartLevel, findPick } from '../music/ear-games.js';
import { earDots, earCard, listenBtn, nextBar, noteBadge } from './ear-ui.js';

const MAX_WRONG = 4;    // the 4th wrong key reveals the answer
const MEH_WRONG = 2;    // found with at most this many wrong keys still counts as meh
const AUTO_MS = 5000;   // the riddle repeats by itself after this long without a key
const HOME_GAP = 0.8;   // seconds from home to the riddle
const PAD = 3;          // keys shown on each side of the zone

export function renderEar(root, { track, itemId, item, back }) {
  const settings = { names: 'en', pianoSnd: true, ...store.get('settings', {}) };
  const N = item.rounds || 12, passAcc = (item.pass && item.pass.acc) || 0.8;
  const ladder = FIND_LADDER, home = FIND_HOME;
  const st = { running: false, k: -1, target: null, last: null, wrong: 0, phase: 'idle', log: [], win: null, tries: [], kbRange: null,
    lv: 0, okRun: 0, badRun: 0, best: 0, auto: 0 };
  const wasDue = reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date();
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('earUpper')}`), h('span.title', null, L(item.title))),
    h('div.grow'), sessionChip(itemId), midiChip(), themeButton());
  const prog = h('span.erround'), dots = earDots(N);
  const chips = ladder.map((z) => h('span', null, t(z.label)));
  const runBars = Array.from({ length: FIND_UP }, () => h('i'));
  const ladderEl = h('div.ezladder', { 'aria-label': t('ezZoneW') }, h('span.ezlbl', null, t('ezZoneW')), h('div.ezchips', null, ...chips), h('div.ezrun', { 'aria-hidden': 'true' }, ...runBars));
  const cardEl = h('div.dcard'), card = earCard(cardEl);
  const summary = h('div.dsummary');
  const about = h('p.muted.dabout', null, markTerms(L(item.about)));
  const panel = h('section.panel.drillpanel', null,
    h('div.staffhead.erhead', null, prog, dots.el, h('div.grow'), ladderEl),
    cardEl, summary, about);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const nb = nextBar({ onNext: () => { if (st.running) next(); } });
  const primary = h('button.btn.xl', { type: 'button', onclick: () => (st.running ? stop() : start()) });
  const footer = h('footer.actions', null, nb.els[0], h('div.grow'), nb.els[2], primary);
  const screen = h('div.exscreen.drillscreen.earscreen.earfind', null, header, h('main.ex', null, panel, kbPanel), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer); // phone: the keyboard sticks right above the footer

  let kb = null;
  const zoneKeys = () => ladder[st.lv].keys;
  function buildKb() {
    const ks = zoneKeys(), lo = Math.min(...ks), hi = Math.max(...ks);
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
  const paintHead = () => { prog.textContent = t('ezRound').replace('{k}', Math.min(N, st.k + 1)).replace('{n}', N); dots.paint(st.log, st.running ? st.k : -1); };
  const paintLadder = () => {
    chips.forEach((c, i) => { c.className = i === st.lv ? 'on' : i < st.lv ? 'past' : ''; });
    runBars.forEach((b, i) => b.classList.toggle('on', i < st.okRun));
    ladderEl.querySelector('.ezrun').hidden = st.lv >= ladder.length - 1;
  };

  // ---------- the keys ----------
  function paintKeys(bar) {
    const marks = {};
    if (st.phase === 'listen' || st.phase === 'idle') marks[home] = { cls: 'home', label: t('ezHome') };
    st.tries.forEach((m, i) => { marks[m] = { cls: 'wrong', label: st.phase === 'reveal' ? String(i + 1) : i === st.tries.length - 1 && st.phase === 'listen' ? t('ezYou') : '×' }; });
    if (st.phase === 'right' || st.phase === 'revealed-played') marks[st.target] = { cls: 'hit', label: '✓' };
    if (st.phase === 'reveal') marks[st.target] = { cls: 'hit', label: t('ezHere') };
    kb.mark(marks, { reveal: false });
    const ks = zoneKeys(), a = Math.min(...ks), b = Math.max(...ks);
    kb.zone({ zone: [a, b], inPlay: ks, win: st.phase === 'listen' ? st.win : null, bar: bar || { kind: 'zone', from: a, to: b, label: t('ezZone') } });
  }

  // ---------- rounds ----------
  function playRiddle(withHome = true, at = 0.05) {
    const t0 = audio.now() + at;
    if (withHome) play1(home, t0, 0.7, 0.5);
    play1(st.target, t0 + (withHome ? HOME_GAP : 0), 1.4, 0.6);
  }
  function armAuto() { // the riddle again after AUTO_MS without a key, while the question is open
    if (st.auto) { clearTimeout(st.auto); timers.delete(st.auto); }
    st.auto = later(() => { st.auto = 0; if (st.running && st.phase === 'listen') { if (st.tries.length) compare(); else playRiddle(); armAuto(); } }, AUTO_MS);
  }
  function start() {
    audio.ensureAudio();
    clearTimers();
    st.running = true; st.k = -1; st.log = []; st.last = null; st.okRun = 0; st.badRun = 0;
    st.lv = findStartLevel(exProgress(itemId).zoneLv, ladder.length - 1); st.best = st.lv;
    summary.replaceChildren(); screen.classList.add('playing'); paintPrimary();
    next();
  }
  function listenCard() {
    const n = zoneKeys().length;
    card.set({
      kicker: t('ezTask'), title: t('ezFindAmong').replace('{n}', n), text: t('ezHomeS'),
      actions: [listenBtn(t('ezAgainFree'), () => replay()), h('button.btn.erlisten.ghost', { type: 'button', onclick: () => { audio.ensureAudio(); play1(home, audio.now() + 0.05, 0.9, 0.55); armAuto(); } }, t('ezOnlyHome'))],
    });
  }
  const toGrow = () => (st.lv >= ladder.length - 1 ? '' : ' · ' + t('ezToGrow').replace('{k}', FIND_UP - st.okRun));
  function next() {
    clearTimers(); st.auto = 0;
    st.k++;
    if (st.k >= N) { finish(); return; }
    buildKb();
    const ks = zoneKeys();
    st.target = findPick(ks, st.last); st.last = st.target; st.wrong = 0; st.phase = 'listen'; st.win = [Math.min(...ks), Math.max(...ks)]; st.tries = [];
    paintHead(); paintLadder(); paintKeys(); listenCard();
    nb.hint(t('ezAutoHint') + toGrow());
    playRiddle();
    armAuto();
  }
  function replay() {
    audio.ensureAudio();
    if (!st.running) return;
    if (st.phase === 'listen' && st.tries.length) compare(); else playRiddle();
    if (st.phase === 'listen') armAuto();
  }
  function compare() { // the last wrong key, then the target
    const m = st.tries[st.tries.length - 1];
    play1(m, audio.now() + 0.45, 0.8, 0.55);
    play1(st.target, audio.now() + 1.35, 1.3, 0.6);
  }
  function input(m) {
    markActive();
    if (!st.running) return;
    if (st.phase === 'right' || st.phase === 'revealed-played') { next(); return; } // any key goes on
    if (st.phase === 'reveal') { // the answer is on the keys: pressing it lets the learner go on
      if (m === st.target) { kb.flash(m, 'ok'); st.phase = 'revealed-played'; paintKeys(); }
      return;
    }
    if (st.phase !== 'listen') return;
    armAuto();
    if (m === st.target) { right(m); return; }
    st.wrong++; kb.flash(m, 'bad');
    if (!st.tries.includes(m)) st.tries.push(m);
    st.win = narrowWindow(st.win, m, st.target);
    if (st.wrong >= MAX_WRONG) { reveal(); return; }
    const up = st.target > m;
    paintKeys(kb.has(m) ? { kind: 'arrow', from: m, to: up ? st.win[1] : st.win[0], label: t(up ? 'ezArrowUp' : 'ezArrowDown') } : null);
    card.set({
      tone: 'bad', big: t(up ? 'ezHigherBig' : 'ezLowerBig'),
      kicker: t('ezTry').replace('{k}', st.wrong).replace('{n}', MAX_WRONG),
      title: t(up ? 'ezHigherT' : 'ezLowerT'), text: t('ezCompareS'),
      actions: [listenBtn(t('ezCompare'), () => replay())],
    });
    nb.hint(t(up ? 'ezArrowUp' : 'ezArrowDown'));
    compare();
  }
  /** One round done: the dots, the ladder, and what the learner is told about the zone. */
  function score(res) {
    st.log.push(res);
    const s = findStep(st, res, ladder.length - 1);
    Object.assign(st, { lv: s.lv, okRun: s.okRun, badRun: s.badRun });
    st.best = Math.max(st.best, st.lv);
    paintHead(); paintLadder();
    return s.moved;
  }
  const movedWords = (moved) => (moved > 0 ? t('ezWider').replace('{z}', t(ladder[st.lv].label)) : moved < 0 ? t('ezNarrower').replace('{z}', t(ladder[st.lv].label)) : '');
  function right(m) {
    if (st.auto) { clearTimeout(st.auto); st.auto = 0; }
    kb.flash(m, 'ok');
    const res = st.wrong === 0 ? 'ok' : st.wrong <= MEH_WRONG ? 'meh' : 'miss';
    st.phase = 'right'; paintKeys();
    const moved = score(res);
    card.set({ tone: 'ok', big: t('ezRightBig'), kicker: movedWords(moved), title: t('ezRightT'), text: t('ezRightWait'), aside: noteBadge(st.target) });
    nb.wait();
  }
  function reveal() {
    if (st.auto) { clearTimeout(st.auto); st.auto = 0; }
    st.phase = 'reveal'; paintKeys();
    const moved = score('miss');
    card.set({ tone: 'reveal', big: t('ezRevealBig'), kicker: movedWords(moved), title: t('ezRevealT'), text: t('ezRevealS'), actions: [listenBtn(t('ezListenAgain'), () => playRiddle(false))], aside: noteBadge(st.target) });
    nb.wait();
    later(() => { if (st.phase === 'reveal') playRiddle(false); }, 500);
  }
  function finish() {
    st.running = false; st.phase = 'idle'; screen.classList.remove('playing'); idle(); nb.off();
    const okN = st.log.filter((x) => x === 'ok').length, mehN = st.log.filter((x) => x === 'meh').length, missN = st.log.filter((x) => x === 'miss').length;
    const acc = N ? (okN + 0.5 * mehN) / N : 0, pass = acc >= passAcc;
    st.k = N - 1; paintHead();
    card.set({ tone: pass ? 'ok' : '', kicker: t('result'), title: pass ? t('dPassed') : t('dNotYet'), text: (pass ? t('earPassedSub') : t('earMoreAccurate')) + ' ' + t('ezReached').replace('{z}', t(ladder[st.best].label)) });
    summary.replaceChildren(
      stat(`${Math.round(acc * 100)}%`, t('dAccuracy'), pass),
      stat(`${okN}/${N}`, t('earFirstTry'), true),
      stat(`${missN}`, t('earMisses'), missN === 0));
    const best = st.best;
    updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, ...(pass ? { done: true } : {}) }, best: Math.max(typeof p.best === 'number' ? p.best : 0, acc), lastAcc: acc, zoneLv: Math.max(best, st.lv) }));
    if (pass) scheduleReview(itemId, true); else if (wasDue) scheduleReview(itemId, false);
    kb.mark({}, { reveal: false }); kb.zone({});
    paintPrimary();
  }
  const stat = (v, label, good) => h('div.dstat' + (good ? '.good' : ''), null, h('b', null, v), h('span', null, label));
  function stop() {
    st.running = false; st.phase = 'idle'; clearTimers(); st.auto = 0; nb.off(); screen.classList.remove('playing'); idle();
    if (st.log.length) { const lv = Math.max(st.best, st.lv); updateEx(itemId, (p) => ({ ...p, zoneLv: lv })); }
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
    st.lv = findStartLevel(saved.zoneLv, ladder.length - 1); st.okRun = 0;
    buildKb(); paintLadder();
    card.set({
      kicker: best ? `${t('dBest')}: ${Math.round(best * 100)}%` : t('earUpper'), title: L(item.title),
      text: t('earGoal').replace('{acc}', Math.round(passAcc * 100)).replace('{n}', N) + ' ' + t('ezLadderS') + ' ' + t('ezHidden'),
    });
    st.k = -1; paintHead(); prog.textContent = t('ezRound').replace('{k}', 0).replace('{n}', N);
  }
  intro(); paintPrimary();
  updateEx(itemId, (p) => p);

  return () => { if (footRO) footRO.disconnect(); clearTimers(); nb.off(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
