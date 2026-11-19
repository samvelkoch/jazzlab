// Question and answer (kind "qa"): the piano asks, you answer. Three stages:
//   1 Услышь      — a phrase sounds; is it a question (it hangs) or an answer (it comes home)? 8 rounds, 6 right pass.
//   2 Ответь фразой — the 12-bar blues on a loop: the piano asks in bars 1–2, 5–6, 9–10 (the question licks), you answer
//                   in bars 3–4, 7–8, 11–12 with the learned answer lick (item.lick). 3 clean answers in a row pass.
//   3 Свой ответ  — the same form, you answer with any keys of the blues scale: stay silent while the piano asks, and end
//                   at home. 4 such answers pass the item (done + review).
// Item: { kind: "qa", lick: answer lick, licks: [other licks: the questions + more answers for the ear stage], form, pattern }
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L, plural } from '../i18n.js';
import { store, updateEx, exProgress, markActive, idle, scheduleReview } from '../store.js';
import { createKeyboard } from '../music/keyboard.js';
import { lickNotes, lickSpell, patternBar } from '../music/forms.js';
import { scoreRepeat, keyHint, beatKey, homeCheck } from '../music/lickfb.js';
import * as audio from '../music/audio.js';
import { groove } from '../music/drums.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';

const PER = 8;
const STAGES = ['ear', 'answer', 'own'];
const EAR_ROUNDS = 8, EAR_PASS = 6, ANSWER_NEED = 3, OWN_NEED = 4;
const BLUES = [0, 3, 5, 6, 7, 10]; // the blues scale from home
const HOME_KEY = 'C7';

export function renderQA(root, { track, itemId, item, answer, licks, form, pattern, back }) {
  const settings = { met: true, pianoSnd: true, impBeat: 'drums', ...store.get('settings', {}) };
  const questions = licks.filter((l) => l.role === 'question');
  const answers = [answer, ...licks.filter((l) => l.role === 'answer' && l !== answer)];
  const bars = form.bars; // 12
  const aNotes = lickNotes(answer, HOME_KEY);
  const qNotes = questions.map((q) => lickNotes(q, HOME_KEY));
  const prog = () => { const s = exProgress(itemId).stages || {}; return { ear: !!s.ear || !!s.done, answer: !!s.answer || !!s.done, own: !!s.done }; };
  const pass = (sid) => updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, [sid]: true, ...(sid === 'own' ? { done: true } : {}) } }));
  const firstOpen = () => STAGES.find((s) => !prog()[s]) || 'own';
  const st = {
    stage: STAGES.includes(store.get('qaStage:' + itemId)) ? store.get('qaStage:' + itemId) : firstOpen(),
    bpm: store.get('tempo:' + itemId, answer.tempo || form.tempo || 66),
    swing: answer.swing !== undefined ? !!answer.swing : !!form.swing,
    playing: false, streak: 0, own: 0, result: null,
    ear: null // { order: [{lick, notes}], k, picks: [true|false], answered }
  };
  const midiOn = () => midiState().connected;

  // ---------- layout ----------
  const stageBtn = (sid, n) => h('button', { type: 'button', 'data-stage': sid, onclick: () => setStage(sid) }, h('span.num', null, String(n)), t('qa_' + sid));
  const stages = h('nav.seg.stages', { 'aria-label': t('lqStages') }, ...STAGES.map((s, k) => stageBtn(s, k + 1)));
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('qaKicker')}`), h('span.title', null, item.title)),
    h('div.grow'), stages, h('div.grow'), sessionChip(itemId), midiChip(), themeButton());
  const title = h('h2'), sub = h('p.lqsub');
  const dotsLabel = h('span'), dots = h('div.lqdots', { role: 'img' }, dotsLabel);

  const ruleRows = STAGES.map((s, k) => h('div.lqrule', { 'data-stage': s }, h('b.n', null, String(k + 1)), h('div', null, h('b', null, t('qa_' + s) + '. '), t('qaRule_' + s))));
  const intro = h('div.lqintro', null,
    h('div.lqgoal', null, h('span.lqlabel', null, t('lqGives')), h('h3', null, t('qaGoal')), h('p', null, t('qaGoalText'))),
    h('div.lqrules', null, h('span.lqlabel', null, t('lqHow')), ...ruleRows));

  // ear stage
  const earDots = h('div.qaeardots');
  const earAsk = h('div.qaask', null, h('b', null, t('qaEarAsk')), h('span', null, t('qaEarAskSub')));
  const btnQ = h('button.qabig.q', { type: 'button', onclick: () => earPick('question') }, h('b', null, t('qaHangs')), h('span', null, t('qaHangsSub')));
  const btnA = h('button.qabig.a', { type: 'button', onclick: () => earPick('answer') }, h('b', null, t('qaHome')), h('span', null, t('qaHomeSub')));
  const earFb = h('div.lqmsg', { 'aria-live': 'polite' });
  const earBox = h('div.qaear', null, earDots, earAsk, h('div.qabtns', null, btnQ, btnA), earFb);

  // form stages: the 12 bars as 6 pairs, whose turn, the beat, the result of the last answer
  const pairs = [0, 1, 2, 3, 4, 5].map((k) => {
    const you = k % 2 === 1;
    return h('div.qapair' + (you ? '.you' : '.piano'), null, h('b', null, t(you ? 'role_you' : 'role_piano')), h('span', null, t(you ? 'answerW' : 'questionW')), h('small', null, `${bars[2 * k]} · ${bars[2 * k + 1]}`));
  });
  const beats = [1, 2, 3, 4].map((n) => h('i', null, String(n)));
  const turnWord = h('b.lqturn'), turnSub = h('span.lqturnsub');
  const phase = h('div.lqphase', null, h('div.lqbeats', { 'aria-hidden': 'true' }, ...beats), h('div.lqwords', { 'aria-live': 'polite' }, turnWord, turnSub));
  const resBox = h('div.lqres', { 'aria-live': 'polite' });
  const formBox = h('div.qaform', null, h('div.qapairs', null, ...pairs), phase, resBox);

  const panel = h('section.panel.imppanel.lickpanel', null, h('div.rhead', null, h('div.lqtitles', null, title, sub), h('div.grow'), dots), intro, earBox, formBox);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const bpmOut = h('output.bpm');
  const tempoBox = h('div.stepper', null,
    h('button', { type: 'button', 'aria-label': t('slower'), onclick: () => setBpm(st.bpm - 4) }, '−'), bpmOut,
    h('button', { type: 'button', 'aria-label': t('faster'), onclick: () => setBpm(st.bpm + 4) }, '+'));
  const beatSeg = seg([['drums', t('drums')], ['click', t('metronome')]], settings.impBeat, (v) => { settings.impBeat = v; store.set('settings', { ...store.get('settings', {}), impBeat: v }); }, 'backing');
  const footHint = h('span.foothint');
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: onPrimary });
  const footer = h('footer.actions', null, h('div.footsegs', null, beatSeg), tempoBox, footHint, h('div.grow'), primary);
  const screen = h('div.exscreen.impscreen.lickscreen.qascreen', null, header, h('main.ex.imp', null, panel, kbPanel), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer);

  function seg(items, value, cb, label) {
    const w = h('div.seg', { role: 'group', 'aria-label': label ? t(label) : null });
    items.forEach(([v, text]) => w.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), onclick: (e) => {
      w.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); cb(v);
    } }, text)));
    return w;
  }

  // ---------- keyboard ----------
  const earNotes = answers.concat(questions).map((l) => lickNotes(l, HOME_KEY));
  const allM = [...aNotes, ...qNotes.flat(), ...earNotes.flat()].map((e) => e.m);
  const lo = Math.min(60, ...allM), hi = Math.max(72, ...allM);
  audio.preloadPiano(36, hi + 4);
  const kb = createKeyboard(kbEl, [lo - 1, hi + 1], { names: 'off', exact: true, onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.5, 0.55); if (!midiOn()) input(m, performance.now()); } });
  const homeKeys = () => { const out = []; for (let m = lo - 1; m <= hi + 1; m++) if (m % 12 === 0) out.push(m); return out; };
  function paintKeys(extra) {
    kb.hint({});
    if (st.stage === 'answer') {
      kb.mark({});
      const uniq = [...new Map(aNotes.map((e) => [e.m, e])).values()];
      kb.show({ rh: { notes: uniq.map((e) => lickSpell(e.m, e.deg)), f: uniq.map((e) => e.f) }, lh: null }, { rh: null, lh: null }, 'both');
      return;
    }
    kb.show({ rh: null, lh: null }, { rh: null, lh: null }, 'both');
    const map = {};
    if (st.stage === 'own') for (let m = lo - 1; m <= hi + 1; m++) if (BLUES.includes(m % 12)) map[m] = { cls: 'step' };
    homeKeys().forEach((m) => { map[m] = { cls: 'base', label: t('qaHomeKey') }; });
    Object.assign(map, extra || {});
    kb.mark(map, { reveal: false });
  }

  // ---------- painting ----------
  function paintStages() {
    const p = prog();
    stages.querySelectorAll('button').forEach((b, k) => {
      const sid = b.dataset.stage;
      b.setAttribute('aria-pressed', String(sid === st.stage));
      b.classList.toggle('done', p[sid]);
      b.querySelector('.num').innerHTML = p[sid] ? ICON.check : String(k + 1);
    });
    ruleRows.forEach((r) => { r.classList.toggle('cur', r.dataset.stage === st.stage); r.classList.toggle('done', p[r.dataset.stage]); });
  }
  function paintDots() {
    [...dots.querySelectorAll('i')].forEach((d) => d.remove());
    const p = prog();
    if (st.stage === 'ear') {
      dotsLabel.textContent = t('qaDots_ear');
      const picks = st.ear ? st.ear.picks : [];
      for (let k = 0; k < EAR_ROUNDS; k++) dots.append(h('i', { class: picks[k] === true ? 'on' : picks[k] === false ? 'bad' : '' }));
      dots.setAttribute('aria-label', `${t('qaDots_ear')}: ${picks.filter(Boolean).length} / ${EAR_ROUNDS}`);
      return;
    }
    const need = st.stage === 'answer' ? ANSWER_NEED : OWN_NEED;
    const n = p[st.stage] ? need : st.stage === 'answer' ? st.streak : st.own;
    dotsLabel.textContent = t('qaDots_' + st.stage);
    for (let k = 0; k < need; k++) dots.append(h('i', { class: k < n ? 'on' : '' }));
    dots.setAttribute('aria-label', `${t('qaDots_' + st.stage)}: ${Math.min(n, need)} / ${need}`);
  }
  function paintView() {
    screen.dataset.lstage = st.stage;
    intro.hidden = st.playing || !!st.result || (st.stage === 'ear' && !!st.ear) || prog()[st.stage];
    earBox.hidden = st.stage !== 'ear' || !st.ear;
    formBox.hidden = st.stage === 'ear' || (!st.playing && !st.result && !prog()[st.stage]);
    phase.hidden = !st.playing;
    resBox.hidden = !st.result;
  }
  function paintPrimary() {
    if (st.stage === 'ear') {
      const e = st.ear;
      primary.innerHTML = !e ? ICON.play + `<span>${t('play')}</span>` : e.answered ? `<span>${t(e.k + 1 >= EAR_ROUNDS ? 'qaAgainRound' : 'qaNext')}</span>` : ICON.speaker + `<span>${t('qaReplay')}</span>`;
      return;
    }
    primary.innerHTML = st.playing ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`;
  }
  function setStage(sid, keep) {
    if (st.playing) stop();
    st.stage = sid; if (!keep) store.set('qaStage:' + itemId, sid);
    st.streak = 0; st.result = null; st.ear = null;
    title.textContent = t('qaT_' + sid); sub.textContent = t('qaS_' + sid);
    footHint.textContent = t('qaF_' + sid);
    resBox.replaceChildren();
    paintKeys(); paintStages(); paintDots(); paintPrimary(); paintPairs(-1); paintView();
  }
  function setBpm(v) { st.bpm = Math.max(40, Math.min(200, Math.round(v))); bpmOut.innerHTML = `♩ ${st.bpm}`; store.set('tempo:' + itemId, st.bpm); }
  function paintPairs(pi) { pairs.forEach((p, k) => { p.classList.toggle('on', k === pi); p.classList.toggle('next', pi >= 0 && k === (pi + 1) % 6); }); }

  // ---------- sound ----------
  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) {
      const onMs = performance.now() + (time - audio.now()) * 1000;
      if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return;
    }
    audio.pianoNote(m, time, dur, v);
  }
  const swingOff = () => { const beat = 60 / st.bpm; return st.swing ? beat * 2 / 3 : beat / 2; };
  const slotTime = (t0, slot) => t0 + Math.floor(slot / 2) * (60 / st.bpm) + (slot % 2 ? swingOff() : 0);

  // ---------- stage 1: question or answer, by ear ----------
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function earStart() {
    const qs = shuffle(questions.slice()), as = shuffle(answers.slice());
    const order = [];
    for (let k = 0; k < EAR_ROUNDS; k++) order.push(k % 2 ? qs[(k >> 1) % qs.length] : as[(k >> 1) % as.length]);
    st.ear = { order: shuffle(order).map((l) => ({ lick: l, notes: lickNotes(l, HOME_KEY) })), k: 0, picks: [], answered: false };
    st.result = null;
    earRound();
  }
  let earTimer = 0;
  function earPlayPhrase() {
    if (!audio.ensureAudio()) return;
    const e = st.ear.order[st.ear.k], beat = 60 / st.bpm, t0 = audio.now() + 0.15;
    const lh = pattern ? patternBar(pattern, HOME_KEY) : [];
    for (let b = 0; b < 2; b++) {
      lh.forEach((x) => play1(x.m, slotTime(t0 + b * 4 * beat, x.t), beat * x.d / 2 * 0.9, 0.25));
      if (settings.impBeat === 'drums') for (let s = 0; s < PER; s++) groove(s, slotTime(t0 + b * 4 * beat, s), { swing: st.swing, bar: b });
    }
    e.notes.forEach((n) => play1(n.m, slotTime(t0, n.t), swingOff() * n.d * 0.95, 0.6));
    btnQ.disabled = btnA.disabled = true;
    clearTimeout(earTimer); earTimer = setTimeout(() => { btnQ.disabled = btnA.disabled = false; markActive(); }, 8 * beat * 1000 * 0.6);
  }
  function earRound() {
    const e = st.ear;
    e.answered = false;
    earAsk.querySelector('b').textContent = `${t('qaEarAsk')} (${e.k + 1} / ${EAR_ROUNDS})`;
    earFb.className = 'lqmsg'; earFb.replaceChildren();
    btnQ.classList.remove('right', 'wrong'); btnA.classList.remove('right', 'wrong');
    paintKeys(); paintDots(); paintPrimary(); paintView();
    earPlayPhrase();
  }
  function earPick(kind) {
    const e = st.ear;
    if (!e || e.answered) return;
    const cur = e.order[e.k], ok = cur.lick.role === kind, last = cur.notes[cur.notes.length - 1];
    e.answered = true; e.picks.push(ok);
    (kind === 'question' ? btnQ : btnA).classList.add(ok ? 'right' : 'wrong');
    if (!ok) (kind === 'question' ? btnA : btnQ).classList.add('right');
    const home = last.m % 12 === 0;
    paintKeys({ [last.m]: { cls: home ? 'base' : 'wrong', label: home ? t('qaHomeKey') : t('qaLastKey') } });
    const dist = homeCheck([{ t: 0, m: last.m }], 0).keys;
    const why = home ? t('qaWhyHome') : t('qaWhyHangs').replace('{n}', `${dist} ${plural(dist, 'lqKeys')}`);
    earFb.className = 'lqmsg ' + (ok ? 'ok' : 'bad');
    earFb.replaceChildren(h('div', { html: `<b>${ok ? t('qaRight') : t('qaWrongPick')}</b> ${why}` }));
    // after a question: let the ear hear where it wanted to go — home, softly
    if (!home && audio.ensureAudio()) play1(last.m - (last.m % 12) + (last.m % 12 > 6 ? 12 : 0), audio.now() + 0.25, 0.9, 0.4);
    if (e.k + 1 >= EAR_ROUNDS) {
      const good = e.picks.filter(Boolean).length;
      const passed = good >= EAR_PASS;
      if (passed && !prog().ear) { pass('ear'); paintStages(); }
      earFb.append(h('div.qaearsum', { html: `<b>${t('qaEarSum').replace('{n}', good).replace('{m}', EAR_ROUNDS)}</b> ${passed ? t('qaEarPassed') : t('qaEarMore').replace('{n}', EAR_PASS)}` }));
    }
    paintDots(); paintPrimary();
  }

  // ---------- stages 2, 3: the form on a loop ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null, exp = [], ans = null, lhs = [];
  const enqueue = (x) => { queue.push(x); queue.sort((a, b) => a.t - b.t); };
  const pairOf = (bar) => Math.floor((bar % 12) / 2); // 0..5, odd = you
  function play() {
    if (!audio.ensureAudio() || st.playing) return;
    st.playing = true; st.result = null; screen.classList.add('playing');
    lhs = bars.map((b) => (pattern ? patternBar(pattern, b) : []));
    const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k }); }
    t0 += 4 * beat; beatTime = t0; g = 0; run = { t0, beat, swing: st.swing };
    exp = []; ans = null;
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
    paintPrimary(); paintView();
  }
  function schedule() {
    const ahead = audio.now() + 0.15, beat = 60 / st.bpm;
    while (st.playing) {
      const slot = g % PER, bar = Math.floor(g / PER), fb = bar % 12, pi = pairOf(bar), half = fb % 2, ls = half * PER + slot;
      const time = beatTime + (slot % 2 ? swingOff() : 0);
      if (time > ahead) break;
      if (pi % 2 === 1 && half === 0 && slot === 0) { exp = []; enqueue({ t: time - 0.12, ansStart: bar, start: time }); }
      if (settings.impBeat === 'drums') groove(slot, time, { swing: st.swing, style: form.style, bar }); else if (slot % 2 === 0) audio.click(time, slot === 0);
      lhs[fb].filter((e) => e.t === slot).forEach((e) => play1(e.m, time, e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9, 0.3));
      if (pi % 2 === 0) qNotes[(pi / 2) % qNotes.length].filter((e) => e.t === ls).forEach((e) => play1(e.m, time, e.stac ? Math.min(swingOff() * 0.6, 0.2) : swingOff() * e.d * 0.95, 0.6));
      else if (st.stage === 'answer') aNotes.filter((e) => e.t === ls).forEach((e) => exp.push({ t: time, slot: ls, len: e.d, m: e.m, f: e.f }));
      if (pi % 2 === 1 && half === 1 && slot === PER - 1) enqueue({ t: time + beat * 0.5 + 0.25, ansEnd: bar, end: time + beat * 0.5 });
      if (slot % 2) beatTime += beat;
      g++;
    }
  }
  function posAt(T) {
    if (!run) return -1;
    const beats = (T - run.t0) / run.beat, w = Math.floor(beats), f = beats - w, sw = run.swing ? 2 / 3 : 0.5;
    return 2 * w + (f < sw ? f / sw : 1 + (f - sw) / (1 - sw));
  }
  function tick() {
    const now = audio.now();
    while (queue.length && queue[0].t <= now) {
      const q = queue.shift();
      if (q.ci !== undefined) { beats.forEach((b, k) => b.classList.toggle('on', k === q.ci)); turnWord.textContent = t('countInLabel'); turnSub.textContent = t('qaCountSub'); continue; }
      if (q.ansStart !== undefined) { ans = { taps: [], start: q.start, during: 0 }; }
      if (q.ansEnd !== undefined) finishAnswer();
    }
    const p = posAt(now);
    if (p >= 0) {
      const bar = Math.floor(p / PER), pi = pairOf(bar), you = pi % 2 === 1;
      paintPairs(pi);
      beats.forEach((b, k) => b.classList.toggle('on', k === Math.floor((p % PER) / 2)));
      phase.classList.toggle('you', you);
      turnWord.textContent = you ? t('impYourTurn') : t('qaPianoAsks');
      turnSub.textContent = you ? t(st.stage === 'answer' ? 'qaYouAnswer' : 'qaYouOwn') : t('qaListenQ');
      markActive();
    }
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = st.playing; st.playing = false; run = null; exp = []; ans = null;
    screen.classList.remove('playing');
    if (was) { audio.hush(); silence(); }
    paintPairs(-1); idle(); paintPrimary(); paintView();
  }
  function onPrimary() {
    if (st.stage === 'ear') {
      if (!st.ear) earStart();
      else if (!st.ear.answered) earPlayPhrase();
      else if (st.ear.k + 1 >= EAR_ROUNDS) earStart();
      else { st.ear.k++; earRound(); }
      return;
    }
    if (st.playing) stop(); else play();
  }

  // ---------- input ----------
  let qTaps = 0; // presses while the piano asks (in the current question)
  const tols = () => { const e8 = 60 / st.bpm / 2; return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.2, 0.04), 0.08), near: e8 * 1.1 }; };
  function input(m, ts) {
    markActive();
    if (st.stage === 'ear' || !st.playing) return;
    const T = audio.toAudioTime(ts);
    if (ans) ans.taps.push({ t: T, m });
    else if (run && posAt(T) >= 0) qTaps++;
  }
  const beatWord = (slot) => (slot >= PER ? t('lqBar2') + ' · ' : '') + t(beatKey(slot));
  function finishAnswer() {
    if (!ans) return;
    const a = ans; ans = null;
    const during = qTaps; qTaps = 0;
    let html = '', clean = false, head = '', chips = [];
    if (st.stage === 'answer') {
      const r = scoreRepeat(exp, a.taps, { ...tols(), pitch: true });
      clean = r.clean;
      const good = r.notes.filter((n) => ['ok', 'bitEarly', 'bitLate'].includes(n.res)).length;
      head = clean ? t('lqClean') : t('lqAlmost').replace('{n}', good).replace('{m}', exp.length);
      const lines = [];
      r.notes.forEach((n, i) => {
        const e = exp[i], who = t('lqNoteF').replace('{i}', i + 1).replace('{f}', e.f);
        if (n.res === 'wrong') { const k = keyHint(e.m, n.got); lines.push(`<b>${who}:</b> ${t('lqWrong')}, ${t('lqNeed').replace('{c}', t(k.black ? 'lqBlackW' : 'lqWhiteW')).replace('{n}', `${k.keys} ${plural(k.keys, 'lqKeys')}`).replace('{d}', t(k.dir === 'left' ? 'lqLeft' : 'lqRight'))}.`); }
        else if (n.res === 'early' || n.res === 'late') lines.push(`<b>${who}:</b> ${t('lq_' + n.res)}. ${t('lqItIsOn').replace('{b}', beatWord(e.slot))}.`);
        else if (n.res === 'miss') lines.push(`<b>${who}:</b> ${t('lqMissed')}. ${t('lqItIsOn').replace('{b}', beatWord(e.slot))}.`);
      });
      if (r.extra) lines.push(`<b>${t('lqExtra')}:</b> ${r.extra}. ${t('lqExtraHint')}`);
      html = lines.slice(0, 3).join('<br>');
      chips = r.notes.map((n, i) => {
        const cls = n.res === 'ok' ? 'ok' : n.res === 'bitEarly' || n.res === 'bitLate' ? 'okish' : n.res === 'wrong' || n.res === 'miss' ? 'bad' : 'meh';
        return h('div.lqchip.' + cls, null, h('small', null, t(beatKey(exp[i].slot))), h('b', null, String(exp[i].f || '·')), h('span', null, t('lqRes_' + n.res)));
      });
      if (clean) { st.streak++; if (st.streak >= ANSWER_NEED && !prog().answer) { pass('answer'); paintStages(); head += ' ' + t('qaPassed_answer'); } }
      else st.streak = 0;
    } else {
      const c = homeCheck(a.taps, 0);
      const lines = [];
      if (!c.count) { head = t('qaSilent'); lines.push(t('qaSilentSub')); }
      else if (c.home) { head = t('qaEndedHome'); clean = true; lines.push(t('qaEndedHomeSub')); }
      else { head = t('qaHung'); lines.push(t('qaHungSub').replace('{n}', `${c.keys} ${plural(c.keys, 'lqKeys')}`).replace('{d}', t(c.dir === 'left' ? 'lqLeft' : 'lqRight'))); }
      if (during > 1) { clean = false; lines.push(t('qaTalkedOver').replace('{n}', during)); }
      if (clean) { st.own++; if (st.own >= OWN_NEED && !prog().own) { pass('own'); scheduleReview(itemId, true); paintStages(); head += ' ' + t('qaPassed_own'); } }
      if (c.last !== null) paintKeys({ [c.last]: { cls: c.home ? 'hit' : 'wrong', label: c.home ? t('qaHomeKey') : t('qaLastKey') } });
      html = lines.join('<br>');
    }
    st.result = { clean };
    resBox.className = 'lqres ' + (clean ? 'ok' : 'meh');
    resBox.replaceChildren(...[
      h('div.lqrestext', null, h('div.lqreshead', null, h('b', null, head), h('span', null, clean ? '' : t('qaNextTime'))), h('div.lqlines', { html })),
      chips.length ? h('div.lqchips', { style: `--n:${chips.length}` }, ...chips) : null].filter(Boolean));
    paintDots(); paintView();
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => { if (e.type === 'on') { kb.down(e.note, true); input(e.note, e.ts); } else kb.down(e.note, false); });
  const onKey = (e) => { if (e.target.closest('input,select,textarea,summary')) return; if (e.code === 'Space') { e.preventDefault(); onPrimary(); } };
  document.addEventListener('keydown', onKey);
  setBpm(st.bpm);
  setStage(st.stage, true);
  updateEx(itemId, (p) => p);
  return () => {
    if (footRO) footRO.disconnect();
    if (st.playing) stop();
    clearTimeout(earTimer);
    offNote(); document.removeEventListener('keydown', onKey);
    header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup());
  };
}
