// Relative ear games (higher/lower, intervals, chord quality, ii-V-I). One screen for all four: the item says which
// game and which level (item.game, item.level); the questions and the checking are in music/ear-games.js (no DOM).
// Rounds are graded ok (first try, no replay) / meh (a slip or a replay) / miss, like "Find the note" (ear.js); the
// result goes into the same item progress (done on pass, best accuracy, spaced review).
// The card says the task in plain words (no note names, no "m3"): intervals are counted in steps (keys, black ones
// too) with a mood word. A wrong answer is said big on the card; after the answer the keys show it (given note blue,
// steps numbered, answer green) and the next question comes after a visible countdown, or after a reveal on Next.
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L, getLang } from '../i18n.js';
import { markTerms } from '../glossary.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview, reviews } from '../store.js';
import { noteName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote } from '../music/midi.js';
import * as G from '../music/ear-games.js';
import { earDots, earCard, listenBtn, nextBar } from './ear-ui.js';

const NEXT_MS = 2000, SHAPE_GAP_MS = 3500;

export function renderEarRel(root, { track, itemId, item, back }) {
  const game = item.game, level = item.level || 1;
  const settings = { names: 'en', pianoSnd: true, ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  const N = item.rounds || 12, passAcc = (item.pass && item.pass.acc) || 0.8;
  const opts = G.optionsOf(game, level);
  const hasKeys = game === 'interval' || game === 'quality'; // these can be answered on the keys
  const pc = (p) => noteName(G.pcName(p) + '4', names);
  const chordName = (c) => pc(c.pc) + G.QUALITIES[c.quality].sym;
  const steps = (n) => G.stepsWord(n, getLang());
  const st = { running: false, k: -1, q: null, prev: null, wrong: 0, replayed: false, phase: 'idle', log: [], pressed: new Set(), pressedAt: 0, tries: [], keysOn: game === 'interval' };
  if (game === 'quality') { try { st.keysOn = (store.get('earRel', {}) || {}).keys === true; } catch (e) { /* default: buttons only */ } }
  const wasDue = reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date();
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('earUpper')}`), h('span.title', null, L(item.title))),
    h('div.grow'), sessionChip(itemId), midiChip(), themeButton());
  const prog = h('span.erround'), dots = earDots(N), pills = h('div.erpills');
  const cardEl = h('div.dcard'), card = earCard(cardEl);
  const summary = h('div.dsummary');
  const answers = h('div.earans' + (opts.length > 4 ? '.many' : ''), { style: `--cols:${opts.length <= 4 ? opts.length : opts.length === 7 ? 7 : 6}` });
  const btns = new Map();
  const label = (o) => {
    if (game === 'hilo') return [t(o === 'up' ? 'erUp' : o === 'down' ? 'erDown' : 'erSame'), ''];
    if (game === 'interval') return [steps(o), `${t('ivM' + o)} · ${t('ivN' + o)}`];
    if (game === 'quality') return [t('qS_' + o), o === 'maj' || o === 'min' ? t('qM_' + o) : `${t('qM_' + o)} · ${t('qN_' + o)}`];
    return o === 'major' ? [t('erMajor'), ''] : o === 'minor' ? [t('erMinor'), ''] : [t('erPos' + (o + 1)), ''];
  };
  for (const o of opts) {
    const [big, small] = label(o);
    const b = h('button.earbtn', { type: 'button', onclick: () => answer(o) }, h('b', null, big), small ? h('span', null, small) : null);
    btns.set(o, b); answers.append(b);
  }
  const about = h('p.muted.dabout', null, markTerms(L(item.about)));
  const panel = h('section.panel.drillpanel', null,
    h('div.staffhead.erhead', null, prog, dots.el, h('div.grow'), pills),
    cardEl, summary, answers, about);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const nb = nextBar({ onNext: () => { if (st.running) next(); } });
  const primary = h('button.btn.xl', { type: 'button', onclick: () => (st.running ? stop() : start()) });
  const modeSeg = game === 'quality' ? h('div.seg', { role: 'group' },
    h('button', { type: 'button', 'data-m': 'btn', onclick: () => setKeys(false) }, t('erModeBtn')),
    h('button', { type: 'button', 'data-m': 'play', onclick: () => setKeys(true) }, t('erModePlay'))) : null;
  const footer = h('footer.actions', null, ...nb.els.slice(0, 2), modeSeg, h('div.grow'), nb.els[2], primary);
  const screen = h('div.exscreen.drillscreen.earscreen.earrel', { 'data-game': game }, header, h('main.ex', null, panel, hasKeys ? kbPanel : null), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer);

  let kb = null;
  audio.preloadPiano(G.LO, G.HI);
  if (hasKeys) kb = createKeyboard(kbEl, [G.LO, G.HI - 2], { names: 'off', onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.8, 0.55); keyInput(m); } });
  function setKeys(on) {
    st.keysOn = on;
    if (game === 'quality') { try { store.set('earRel', { ...(store.get('earRel', {}) || {}), keys: on }); } catch (e) { /* ignore */ } }
    paintKeys();
    if (st.running && st.q && st.phase === 'listen') { paintMarks(); listenCard(); }
  }
  function paintKeys() {
    // quality: the keys show after the answer even in the buttons mode (the chord tones in green)
    if (hasKeys) kbPanel.hidden = !(st.keysOn || (st.phase !== 'listen' && st.phase !== 'idle'));
    if (modeSeg) modeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.m === 'play') === st.keysOn)));
    screen.classList.toggle('nokeys', hasKeys && kbPanel.hidden);
  }

  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const paintPrimary = () => {
    primary.classList.toggle('accent', !st.running);
    primary.innerHTML = st.running ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${st.log.length ? t('again') : t('ezStart')}</span>`;
  };
  const paintHead = () => { prog.textContent = t('erRound').replace('{k}', Math.max(0, Math.min(N, st.k + 1))).replace('{n}', N); dots.paint(st.log, st.running ? st.k : -1); };

  // ---------- sound ----------
  function playQ() {
    const q = st.q, t0 = audio.now() + 0.05;
    pills.querySelectorAll('i').forEach((p) => p.classList.remove('on'));
    if (game === 'hilo') { play1(q.a, t0, 0.8, 0.6); play1(q.b, t0 + 0.9, 0.9, 0.6); }
    else if (game === 'interval') {
      if (q.harmonic) { play1(q.first, t0, 1.8, 0.6); play1(q.second, t0, 1.8, 0.55); }
      else { play1(q.first, t0, 0.9, 0.6); play1(q.second, t0 + 0.9, 1.2, 0.6); }
    } else if (game === 'quality') q.notes.forEach((m, i) => play1(m, t0 + i * 0.012, 1.9, 0.55));
    else {
      st.voiced.forEach((c, i) => {
        const at = t0 + i * 1.3;
        play1(c.bass, at, 1.2, 0.6); c.upper.forEach((m) => play1(m, at + 0.01, 1.2, 0.5));
        later(() => pills.children[i] && pills.children[i].classList.add('on'), 50 + i * 1300);
        later(() => pills.children[i] && pills.children[i].classList.remove('on'), 50 + i * 1300 + 1150);
      });
    }
  }

  // ---------- keys ----------
  function paintMarks(bar = null) {
    if (!kb) return;
    const q = st.q, marks = {};
    const done = st.phase === 'right' || st.phase === 'reveal';
    st.tries.forEach((m, i) => { marks[m] = { cls: 'wrong', label: i === st.tries.length - 1 && st.phase === 'listen' ? t('ezYou') : '×' }; });
    if (game === 'interval') {
      marks[q.first] = { cls: 'given', label: '' };
      if (done) {
        G.stepsBetween(q.first, q.second).forEach((m, i) => { marks[m] = { cls: 'step', label: String(i + 1) }; });
        marks[q.second] = { cls: 'hit', label: String(q.semis) };
      }
    } else if (game === 'quality') {
      if (done) q.notes.forEach((m) => { marks[m] = { cls: 'hit', label: '' }; });
      if (done || st.keysOn) marks[q.root] = { cls: done ? 'hit' : 'given', label: '' };
    }
    kb.mark(marks);
    kb.zone(bar ? { bar } : {});
  }

  // ---------- rounds ----------
  function listenCard() {
    const q = st.q;
    let title;
    if (game === 'interval') title = t('erListen_interval').replace('{dir}', t('erDirL_' + q.dir));
    else if (game === 'quality') title = t(st.keysOn ? 'erListen_qualityKeys' : 'erListen_quality');
    else if (game === 'prog') title = t(q.ask === 'five' ? 'erListen_five' : 'erListen_prog');
    else title = t('erListen_hilo');
    card.set({ kicker: t('ezTask'), title, actions: [listenBtn(t('ezListenAgain'), () => replay())] });
  }
  function start() {
    audio.ensureAudio();
    clearTimers();
    st.running = true; st.k = -1; st.log = []; st.prev = null;
    summary.replaceChildren(); screen.classList.add('playing'); paintPrimary();
    next();
  }
  function next() {
    clearTimers();
    st.k++;
    if (st.k >= N) { finish(); return; }
    st.q = G.makeQuestion(game, level, st.k, N, Math.random, st.prev); st.prev = st.q;
    st.wrong = 0; st.replayed = false; st.phase = 'listen'; st.pressed.clear(); st.tries = [];
    if (game === 'prog') st.voiced = G.voiceProg(st.q.chords);
    paintHead();
    btns.forEach((b) => { b.disabled = false; b.className = 'earbtn'; });
    pills.replaceChildren();
    if (game === 'prog') for (let i = 0; i < 3; i++) pills.append(h('i', null, String(i + 1)));
    paintKeys(); paintMarks(); listenCard();
    nb.hint(t('erHint_' + game));
    playQ();
  }
  function replay() {
    audio.ensureAudio();
    if (!st.running) return;
    if (st.phase === 'listen') st.replayed = true;
    playQ();
  }
  const maxMeh = () => (hasKeys && st.keysOn ? 2 : 1);
  const maxWrong = () => (hasKeys && st.keysOn ? 3 : G.maxWrongFor(opts.length));
  const result = () => { // [title, text] of the answer, shown after it
    const q = st.q;
    if (game === 'hilo') return [t('erHiloAns_' + q.answer), q.answer === 'same' ? '' : t('erHiloS').replace('{steps}', steps(q.gap))];
    if (game === 'interval') return [t('erIvT').replace('{steps}', steps(q.semis)).replace('{dir}', t('erStepsDir_' + q.dir)), t('erIvS').replace('{name}', t('ivN' + q.semis))];
    if (game === 'quality') {
      const name = q.quality === 'maj' || q.quality === 'min' ? `${pc(q.root % 12)} ${t(q.quality === 'maj' ? 'erMajor' : 'erMinor').toLowerCase()}` : `${pc(q.root % 12)}${G.QUALITIES[q.quality].sym}`;
      return [`${t('qS_' + q.quality)} · ${t('qM_' + q.quality)}`, `${t('erQualS')} ${name}.`];
    }
    if (q.ask === 'mode') return [t(q.mode === 'major' ? 'erMajor' : 'erMinor'), q.chords.map(chordName).join(' · ')];
    return [t('erPos' + (q.answer + 1)), q.chords.map(chordName).join(' · ')];
  };
  function success() {
    const q = st.q;
    btns.get(q.answer) && btns.get(q.answer).classList.add('ok');
    btns.forEach((b) => { b.disabled = true; });
    const res = G.gradeRound({ wrong: st.wrong, replayed: st.replayed }, maxMeh());
    st.log.push(res); st.phase = 'right';
    paintHead(); paintKeys(); paintMarks();
    const [title, text] = result();
    card.set({ tone: 'ok', big: t('ezRightBig'), title, text, actions: [listenBtn(t('ezListenAgain'), () => playQ())] });
    nb.count(NEXT_MS + (game === 'prog' ? 1000 : 0));
  }
  function reveal() {
    const q = st.q;
    btns.get(q.answer) && btns.get(q.answer).classList.add('ok');
    btns.forEach((b) => { b.disabled = true; });
    st.log.push('miss'); st.phase = 'reveal';
    paintHead(); paintKeys(); paintMarks();
    const [title, text] = result();
    card.set({ tone: 'reveal', big: t('erRevealBig'), title, text: [text, t('erRevealS')].filter(Boolean).join(' '), actions: [listenBtn(t('ezListenAgain'), () => playQ())] });
    nb.wait();
    later(() => { if (st.phase === 'reveal') playQ(); }, 500); // hear it once more with the answer in front of you
  }
  function slip(cardArgs, bar = null) {
    st.wrong++;
    if (st.wrong >= maxWrong()) { reveal(); return; }
    paintMarks(bar);
    card.set({ tone: 'bad', ...cardArgs });
  }
  function answer(o) {
    markActive();
    audio.ensureAudio();
    if (!st.running || st.phase !== 'listen') return;
    if (G.checkChoice(st.q, o)) { success(); return; }
    const b = btns.get(o); b.classList.add('bad'); b.disabled = true;
    slip({ big: t('erWrongBig'), title: t('erWrongT').replace('{x}', label(o)[0]), text: t('erWrongS'), actions: [listenBtn(t('ezListenAgain'), () => replay())] });
  }
  function keyInput(m) {
    markActive();
    if (!st.running || st.phase !== 'listen' || !hasKeys || !st.keysOn) return;
    const q = st.q;
    if (game === 'interval') {
      if (m === q.first) return; // the given note: just a listen
      if (G.checkNote(q, m)) { kb.flash(m, 'ok'); success(); return; }
      kb.flash(m, 'bad');
      if (!st.tries.includes(m)) st.tries.push(m);
      const up = q.second > m;
      slip({
        big: t(up ? 'ezHigherBig' : 'ezLowerBig'), title: t(up ? 'ezHigherT' : 'ezLowerT'), text: t('erWrongS'),
        actions: [listenBtn(t('ezListenAgain'), () => replay())],
      }, { kind: 'arrow', from: m, to: q.second, label: t(up ? 'ezArrowUp' : 'ezArrowDown') });
      return;
    }
    // quality: keys add up to a shape; judged once as many different notes are down as the chord has
    const now = performance.now();
    if (now - st.pressedAt > SHAPE_GAP_MS) st.pressed.clear();
    st.pressedAt = now; st.pressed.add(m);
    const ok = G.checkShape(q, st.pressed);
    if (ok === null) { kb.flash(m, 'meh'); return; }
    if (ok) { st.pressed.forEach((x) => kb.flash(x, 'ok')); success(); return; }
    st.pressed.forEach((x) => kb.flash(x, 'bad')); st.pressed.clear();
    slip({ big: t('erWrongBig'), title: t('erShapeWrongT'), text: t('erWrongS'), actions: [listenBtn(t('ezListenAgain'), () => replay())] });
  }
  function finish() {
    st.running = false; st.phase = 'idle'; screen.classList.remove('playing'); idle(); nb.off();
    const okN = st.log.filter((x) => x === 'ok').length, missN = st.log.filter((x) => x === 'miss').length;
    const acc = G.accuracy(st.log, N), pass = acc >= passAcc;
    st.k = N - 1; paintHead(); pills.replaceChildren();
    card.set({ tone: pass ? 'ok' : '', kicker: t('result'), title: pass ? t('dPassed') : t('dNotYet'), text: pass ? t('earPassedSub') : t('earMoreAccurate') });
    btns.forEach((b) => { b.disabled = true; b.className = 'earbtn'; });
    if (kb) { kb.mark({}); kb.zone({}); }
    paintKeys();
    summary.replaceChildren(
      stat(`${Math.round(acc * 100)}%`, t('dAccuracy'), pass),
      stat(`${okN}/${N}`, t('earFirstTry'), true),
      stat(`${missN}`, t('earMisses'), missN === 0));
    updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, ...(pass ? { done: true } : {}) }, best: Math.max(typeof p.best === 'number' ? p.best : 0, acc), lastAcc: acc }));
    if (pass) scheduleReview(itemId, true); else if (wasDue) scheduleReview(itemId, false);
    paintPrimary();
  }
  const stat = (v, lab, good) => h('div.dstat' + (good ? '.good' : ''), null, h('b', null, v), h('span', null, lab));
  function stop() {
    st.running = false; st.phase = 'idle'; clearTimers(); nb.off(); screen.classList.remove('playing'); idle();
    btns.forEach((b) => { b.disabled = true; b.className = 'earbtn'; }); pills.replaceChildren();
    if (kb) { kb.mark({}); kb.zone({}); }
    paintKeys(); intro(); paintPrimary();
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => {
    if (!kb) return;
    if (e.type === 'on') { kb.down(e.note, true); audio.ensureAudio(); keyInput(e.note); }
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
      text: t('erGoal_' + game).replace('{acc}', Math.round(passAcc * 100)).replace('{n}', N),
    });
    st.k = -1; paintHead();
  }
  intro();
  btns.forEach((b) => { b.disabled = true; });
  paintKeys(); paintPrimary();
  updateEx(itemId, (p) => p);

  return () => { if (footRO) footRO.disconnect(); clearTimers(); nb.off(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
