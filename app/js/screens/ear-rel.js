// Relative ear games (higher/lower, intervals, chord quality, ii-V-I). One screen for all four: the item says which
// game and which level (item.game, item.level); the questions and the checking are in music/ear-games.js (no DOM).
// Rounds are graded ok (first try, no replay) / meh (a slip or a replay) / miss, like "Find the note" (ear.js); the
// result goes into the same item progress (done on pass, best accuracy, spaced review).
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L } from '../i18n.js';
import { markTerms } from '../glossary.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview, reviews } from '../store.js';
import { noteName, midiToName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote } from '../music/midi.js';
import * as G from '../music/ear-games.js';

const SETTLE_OK = 450, SETTLE_MISS = 2200, SHAPE_GAP_MS = 3500;

export function renderEarRel(root, { track, itemId, item, back }) {
  const game = item.game, level = item.level || 1;
  const settings = { names: 'en', pianoSnd: true, ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  const N = item.rounds || 12, passAcc = (item.pass && item.pass.acc) || 0.8;
  const opts = G.optionsOf(game, level);
  const hasKeys = game === 'interval' || game === 'quality'; // these can be answered on the keys
  const nm = (m) => noteName(midiToName(m), names);
  const nmOct = (m) => nm(m) + (Math.floor(m / 12) - 1);
  const pc = (p) => noteName(G.pcName(p) + '4', names);
  const chordName = (c) => pc(c.pc) + G.QUALITIES[c.quality].sym;
  const st = { running: false, k: -1, q: null, prev: null, wrong: 0, replayed: false, locked: true, log: [], pressed: new Set(), pressedAt: 0, keysOn: game === 'interval' };
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
  const prog = h('span.barno'), fbEl = h('span.fb', { 'aria-live': 'polite' });
  const promptK = h('span.kicker'), promptB = h('b.dprompt'), promptS = h('span.dsub'), pills = h('div.erpills');
  const card = h('div.dcard', null, promptK, promptB, promptS, pills);
  const summary = h('div.dsummary');
  const answers = h('div.earans' + (opts.length > 4 ? '.many' : ''), { style: `--cols:${opts.length <= 4 ? opts.length : opts.length === 7 ? 7 : 6}` });
  const btns = new Map();
  const label = (o) => {
    if (game === 'hilo') return [t(o === 'up' ? 'erUp' : o === 'down' ? 'erDown' : 'erSame'), ''];
    if (game === 'interval') return [t('ivS' + o), t('ivN' + o)];
    if (game === 'quality') return [t('qS_' + o), t('qN_' + o)];
    return o === 'major' ? [t('erMajor'), ''] : o === 'minor' ? [t('erMinor'), ''] : [t('erPos' + (o + 1)), ''];
  };
  for (const o of opts) {
    const [big, small] = label(o);
    const b = h('button.earbtn', { type: 'button', onclick: () => answer(o) }, h('b', null, big), small ? h('span', null, small) : null);
    btns.set(o, b); answers.append(b);
  }
  const panel = h('section.panel.drillpanel', null,
    h('div.staffhead', null, prog, h('div.grow'), fbEl),
    card, summary, answers,
    h('p.muted.dabout', null, markTerms(L(item.about))));
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const replayBtn = h('button.btn.earreplay', { type: 'button', title: t('earReplay'), onclick: () => replay(), html: ICON.speaker + `<span>${t('earReplay')}</span>` });
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => (st.running ? stop() : start()) });
  const modeSeg = game === 'quality' ? h('div.seg', { role: 'group' },
    h('button', { type: 'button', 'data-m': 'btn', onclick: () => setKeys(false) }, t('erModeBtn')),
    h('button', { type: 'button', 'data-m': 'play', onclick: () => setKeys(true) }, t('erModePlay'))) : null;
  const hint = h('span.foothint', null, t('erHint_' + game));
  const footer = h('footer.actions', null, hint, modeSeg, h('div.grow'), replayBtn, primary);
  const screen = h('div.exscreen.drillscreen.earscreen.earrel', { 'data-game': game }, header, h('main.ex', null, panel, hasKeys ? kbPanel : null), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer);

  let kb = null;
  if (hasKeys) {
    audio.preloadPiano(G.LO, G.HI);
    kb = createKeyboard(kbEl, [G.LO, G.HI - 2], { names: settings.names, onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.8, 0.55); keyInput(m); } });
  } else audio.preloadPiano(G.LO, G.HI);
  function setKeys(on) {
    st.keysOn = on;
    if (game === 'quality') { try { store.set('earRel', { ...(store.get('earRel', {}) || {}), keys: on }); } catch (e) { /* ignore */ } }
    paintKeys();
    if (st.running && st.q) showGiven();
  }
  function paintKeys() {
    if (hasKeys) kbPanel.hidden = !st.keysOn;
    if (modeSeg) modeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.m === 'play') === st.keysOn)));
    screen.classList.toggle('nokeys', hasKeys && !st.keysOn);
  }

  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const fb = (html) => { fbEl.innerHTML = html; };
  const paintPrimary = () => { primary.innerHTML = st.running ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${st.log.length ? t('again') : t('play')}</span>`; };
  const clearKb = () => { if (kb) kb.show({ rh: null, lh: null }, { rh: null, lh: null }, 'both'); };
  const markKb = (midis) => { if (kb) kb.show({ rh: { notes: midis.map(midiToName), f: [] }, lh: null }, { rh: null, lh: null }, 'both'); };

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

  // ---------- rounds ----------
  function showGiven() { // the note(s) given on the keys, and the prompt text that depends on it
    const q = st.q;
    if (game === 'interval') {
      promptB.textContent = q.harmonic ? `${nmOct(q.first)} + ?` : `${nmOct(q.first)} → ?`;
      promptS.textContent = t('erDir_' + q.dir);
      markKb([q.first]);
    } else if (game === 'quality') {
      promptB.textContent = st.keysOn ? `${nm(q.root)} → ?` : '♪';
      promptS.textContent = st.keysOn ? t('erRootGiven').replace('{n}', nm(q.root)) : '';
      if (st.keysOn) markKb([q.root]); else clearKb();
    }
  }
  function start() {
    audio.ensureAudio();
    clearTimers();
    st.running = true; st.k = -1; st.log = []; st.prev = null;
    summary.replaceChildren(); screen.classList.add('playing'); paintPrimary();
    next();
  }
  function next() {
    st.k++;
    if (st.k >= N) { finish(); return; }
    st.q = G.makeQuestion(game, level, st.k, N, Math.random, st.prev); st.prev = st.q;
    st.wrong = 0; st.replayed = false; st.locked = false; st.pressed.clear();
    if (game === 'prog') st.voiced = G.voiceProg(st.q.chords);
    prog.textContent = `${st.k + 1} / ${N}`;
    btns.forEach((b) => { b.disabled = false; b.className = 'earbtn'; });
    promptK.textContent = t(game === 'prog' && st.q.ask === 'five' ? 'erQ_five' : 'erQ_' + game);
    promptB.textContent = game === 'hilo' ? '♪ → ♪' : game === 'prog' ? '♪ ♪ ♪' : '♪';
    promptS.textContent = '';
    pills.replaceChildren();
    if (game === 'prog') for (let i = 0; i < 3; i++) pills.append(h('i', null, String(i + 1)));
    clearKb(); showGiven();
    fb('');
    playQ();
  }
  function replay() {
    audio.ensureAudio();
    if (!st.running || st.locked) return;
    st.replayed = true; playQ();
  }
  function settle(res, ms) {
    st.locked = true;
    st.log.push(res);
    later(() => { if (st.running) next(); }, ms);
  }
  const maxMeh = () => (hasKeys && st.keysOn ? 2 : 1);
  const maxWrong = () => (hasKeys && st.keysOn ? 3 : G.maxWrongFor(opts.length));
  const answerText = () => {
    const q = st.q;
    if (game === 'hilo') return t(q.answer === 'up' ? 'erUp' : q.answer === 'down' ? 'erDown' : 'erSame');
    if (game === 'interval') return `${t('ivS' + q.semis)} · ${t('ivN' + q.semis)} · ${nmOct(q.second)}`;
    if (game === 'quality') return q.quality === 'maj' || q.quality === 'min' ? `${nm(q.root)} ${t(q.quality === 'maj' ? 'erMajor' : 'erMinor').toLowerCase()}` : `${nm(q.root)}${G.QUALITIES[q.quality].sym}`;
    if (q.ask === 'mode') return `${t(q.mode === 'major' ? 'erMajor' : 'erMinor')}: ${q.chords.map(chordName).join(' · ')}`;
    return q.chords.map(chordName).join(' · ');
  };
  function success() {
    const q = st.q;
    btns.get(q.answer) && btns.get(q.answer).classList.add('ok');
    const res = G.gradeRound({ wrong: st.wrong, replayed: st.replayed }, maxMeh());
    fb(res === 'miss' ? `<span class="bad">${answerText()}</span>` : `<span class="${res}">✓ ${answerText()}</span>`);
    settle(res, SETTLE_OK + (game === 'prog' ? 600 : 0));
  }
  function slip(html) {
    st.wrong++;
    if (st.wrong >= maxWrong()) { // reveal the answer, count a miss
      const q = st.q;
      btns.get(q.answer) && btns.get(q.answer).classList.add('ok');
      if (game === 'interval') markKb([q.first, q.second]); else if (game === 'quality') markKb(q.notes);
      fb(`<span class="bad">${t('erWas')}: ${answerText()}</span>`);
      settle('miss', SETTLE_MISS);
      later(() => { if (st.running) playQ(); }, 500); // hear it once more with the answer in front of you
      return;
    }
    fb(html);
  }
  function answer(o) {
    markActive();
    audio.ensureAudio();
    if (!st.running || st.locked) return;
    if (G.checkChoice(st.q, o)) { success(); return; }
    const b = btns.get(o); b.classList.add('bad'); b.disabled = true;
    slip(`<span class="bad">${label(o)[0]}</span> ✗`);
  }
  function keyInput(m) {
    markActive();
    if (!st.running || st.locked || !hasKeys || !st.keysOn) return;
    const q = st.q;
    if (game === 'interval') {
      if (m === q.first) return; // the given note: just a listen
      if (G.checkNote(q, m)) { kb.flash(m, 'ok'); success(); return; }
      kb.flash(m, 'bad');
      slip(`<span class="bad">${t('erPlayed')}: ${nmOct(m)} · ${G.intervalShort(q.first, m)}</span>`);
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
    slip(`<span class="bad">${t('erPlayed')}: ✗</span>`);
  }
  function finish() {
    st.running = false; st.locked = true; screen.classList.remove('playing'); idle();
    const okN = st.log.filter((x) => x === 'ok').length, missN = st.log.filter((x) => x === 'miss').length;
    const acc = G.accuracy(st.log, N), pass = acc >= passAcc;
    promptK.textContent = t('result'); promptB.textContent = pass ? t('dPassed') : t('dNotYet'); pills.replaceChildren();
    promptS.textContent = pass ? t('earPassedSub') : t('earMoreAccurate');
    prog.textContent = `${N} / ${N}`;
    btns.forEach((b) => { b.disabled = true; b.className = 'earbtn'; });
    clearKb();
    summary.replaceChildren(
      stat(`${Math.round(acc * 100)}%`, t('dAccuracy'), pass),
      stat(`${okN}/${N}`, t('earFirstTry'), true),
      stat(`${missN}`, t('earMisses'), missN === 0));
    updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, ...(pass ? { done: true } : {}) }, best: Math.max(typeof p.best === 'number' ? p.best : 0, acc), lastAcc: acc }));
    if (pass) scheduleReview(itemId, true); else if (wasDue) scheduleReview(itemId, false);
    fb(pass ? `<span class="ok">${ICON.check} ${t('stageDone')}</span>` : '');
    paintPrimary();
  }
  const stat = (v, lab, good) => h('div.dstat' + (good ? '.good' : ''), null, h('b', null, v), h('span', null, lab));
  function stop() {
    st.running = false; st.locked = true; clearTimers(); screen.classList.remove('playing'); idle(); fb('');
    btns.forEach((b) => { b.disabled = true; b.className = 'earbtn'; }); clearKb(); pills.replaceChildren();
    paintPrimary();
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => {
    if (!kb) return;
    if (e.type === 'on') { kb.down(e.note, true); audio.ensureAudio(); keyInput(e.note); }
    else kb.down(e.note, false);
  });
  const onKey = (e) => { if (e.code === 'Space' && !e.target.closest('input,select,textarea,summary,button')) { e.preventDefault(); if (st.running) stop(); else start(); } };
  document.addEventListener('keydown', onKey);

  // intro state
  const saved = exProgress(itemId);
  const best = typeof saved.best === 'number' ? saved.best : 0;
  promptK.textContent = best ? t('dBest') : t('earUpper');
  promptB.textContent = best ? `${Math.round(best * 100)}%` : L(item.title);
  promptS.textContent = t('erGoal_' + game).replace('{acc}', Math.round(passAcc * 100)).replace('{n}', N);
  prog.textContent = `0 / ${N}`;
  btns.forEach((b) => { b.disabled = true; });
  paintKeys(); paintPrimary();
  updateEx(itemId, (p) => p);

  return () => { if (footRO) footRO.disconnect(); clearTimers(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
