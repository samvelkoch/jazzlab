// Lick screen: a 2-bar right-hand phrase, learned in three stages, methodology order (rhythm before notes):
//   1 Ритм  — the piano plays the phrase for 2 bars, you tap its rhythm on ANY key in the next 2 (3 clean in a row);
//   2 Ноты  — no tempo: the key to press is lit with its finger number, press it and the next one lights up
//             (3 runs in a row without a wrong key);
//   3 Эхо   — the piano plays 2 bars, you repeat them in the next 2: the same keys, in time, over drums + the left-hand
//             pattern (3 clean repeats on the home chord pass the lick and put it on review).
// Other chords (or keys, for a key-relative lick) are an optional bonus after the echo, and so is the generated
// exercise with notation and the left hand (#/t/<track>/<item>/fingers/<chord>, its «by heart» also passes the item).
// No note names anywhere: keys are shown by finger number, black or white, and left or right of the one you pressed.
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L, plural } from '../i18n.js';
import { markTerms } from '../glossary.js';
import { store, updateEx, exProgress, markActive, idle, reviews, scheduleReview } from '../store.js';
import { createKeyboard } from '../music/keyboard.js';
import { lickNotes, lickSpell, patternBar, barChords, lickKeyNotes, lickOverKey } from '../music/forms.js';
import { scoreRepeat, keyHint, beatKey, isBlack } from '../music/lickfb.js';
import * as audio from '../music/audio.js';
import { groove } from '../music/drums.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';

const PER = 8; // eighths per bar
const LEN = 16; // the lick: 2 bars
const CYCLE = 4; // bars per cycle: 2 piano + 2 you
const NEED = 3; // clean runs per stage
const REVIEW_NEED = 2; // clean echoes in one visit clear a due review
const STAGES = ['rhythm', 'notes', 'echo'];

export function renderLick(root, { track, itemId, item, lick, pattern, form: form0, back }) {
  const settings = { met: true, names: 'en', pianoSnd: true, impBeat: 'drums', ...store.get('settings', {}) };
  const keyed = Array.isArray(item.keys) && item.keys.length > 0 && Array.isArray(lick.prog); // over keys, not chords
  const form = form0 || {};
  // the chips: the keys of a key-relative lick, the item's own chord set (item.chords), or the form's distinct chords
  const chords = keyed ? item.keys.slice() : Array.isArray(item.chords) && item.chords.length ? item.chords.slice() : [...new Set(form.bars.flatMap(barChords))];
  const home = chords[0];
  const notesOf = (c) => (keyed ? lickKeyNotes(lick, c) : lickNotes(lick, c));
  const spelled = (e) => e.name || lickSpell(e.m, e.deg);
  // the left hand under the 2 bars of the lick: the pattern over the chord twice, or over the progression in the key
  const lhOf = (c) => { if (!pattern) return [[], []]; if (keyed) return lickOverKey(lick, c, pattern).bars.map((b) => b.lh); const pb = patternBar(pattern, c); return [pb, pb]; };

  // progress: stages.rhythm / notes / echo (+ done, which the track counts); an item passed before this screen had
  // stages (old «echo on every chord» or «by heart» in the exercise) keeps all three ticked
  const prog = () => {
    const p = exProgress(itemId), s = p.stages || {}, old = !!(s.done || s.echo);
    return { rhythm: old || !!s.rhythm, notes: old || !!s.notes, echo: old || !!s.done };
  };
  const passStage = (sid) => updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, [sid]: true, ...(sid === 'echo' ? { done: true } : {}) } }));
  const due = !!(reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date());
  const firstOpen = () => STAGES.find((s) => !prog()[s]) || 'echo';
  const savedEcho = exProgress(itemId).echo || {};
  const st = {
    stage: due ? 'echo' : (STAGES.includes(store.get('lickStage:' + itemId)) ? store.get('lickStage:' + itemId) : firstOpen()),
    chord: home,
    bpm: store.get('tempo:' + itemId, lick.tempo || form.tempo || 66),
    swing: lick.swing !== undefined ? !!lick.swing : !!form.swing,
    playing: false,
    streak: 0, // clean in a row in this visit (rhythm, notes)
    sessClean: 0, // clean echoes in this visit (a due review)
    clean: Object.fromEntries(chords.map((c) => [c, savedEcho[c] || 0])),
    ni: 0, slip: false, // notes stage: the note to press, a wrong key in this run
    result: null // the last repeat's result (rhythm, echo)
  };
  const midiOn = () => midiState().connected;
  const exHref = (c) => `${item.href}/fingers/${c}`;

  let notes = [], rows = []; // rows: distinct pitches, low → high: [{m, f, black}]
  function computeNotes() {
    notes = notesOf(st.chord);
    const uniq = [...new Map(notes.map((e) => [e.m, e])).values()].sort((a, b) => a.m - b.m);
    rows = uniq.map((e) => ({ m: e.m, f: e.f, black: isBlack(e.m), spelled: spelled(e) }));
  }
  computeNotes();

  // ---------- layout ----------
  const stageBtn = (sid, n) => h('button', { type: 'button', 'data-stage': sid, onclick: () => setStage(sid) }, h('span.num', null, String(n)), t('lq_' + sid));
  const stages = h('nav.seg.stages', { 'aria-label': t('lqStages') }, ...STAGES.map((s, k) => stageBtn(s, k + 1)));
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null,
      h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('lickUpper')}`),
      h('span.title', null, item.title || L(lick.title))),
    h('div.grow'), stages, h('div.grow'),
    sessionChip(itemId), midiChip(), themeButton());

  const title = h('h2'), sub = h('p.lqsub');
  const dotsLabel = h('span'), dots = h('div.lqdots', { role: 'img' }, dotsLabel, ...Array.from({ length: NEED }, () => h('i')));

  // intro: what the lick gives you + how each stage is passed (shown while nothing is playing and there is no result)
  const roleKey = lick.role === 'question' ? 'lqGoalQ' : lick.role === 'answer' ? 'lqGoalA' : 'lqGoal';
  const ruleRows = STAGES.map((s, k) => h('div.lqrule', { 'data-stage': s }, h('b.n', null, String(k + 1)), h('div', null, h('b', null, t('lq_' + s) + '. '), t('lqRule_' + s))));
  const intro = h('div.lqintro', null,
    h('div.lqgoal', null,
      h('span.lqlabel', null, t('lqGives')),
      h('h3', null, t(roleKey)),
      h('p', null, markTerms(L(lick.about)))),
    h('div.lqrules', null, h('span.lqlabel', null, t('lqHow')), ...ruleRows));

  // play view: whose turn (4 bar cells), the beat, the roll, the result
  const cells = [0, 1, 2, 3].map((k) => h('div.lqcell' + (k < 2 ? '.piano' : '.you'), null, h('b', null, t(k < 2 ? 'role_piano' : 'role_you')), h('span')));
  const beats = [1, 2, 3, 4].map((n) => h('i', null, String(n)));
  const turnWord = h('b.lqturn'), turnSub = h('span.lqturnsub');
  const phase = h('div.lqphase', null,
    h('div.lqbeats', { 'aria-hidden': 'true' }, ...beats), h('div.lqwords', { 'aria-live': 'polite' }, turnWord, turnSub),
    h('div.lqcells', null, ...cells));
  const roll = h('div.roll.lickroll');
  const resBox = h('div.lqres', { 'aria-live': 'polite' });
  const playBox = h('div.lqplay', null, phase, roll, resBox);

  // notes stage: the 8 notes as finger chips, the current one big
  const seqRow = h('div.lqseq');
  const listenBtn = h('button.btn.ghost', { type: 'button', onclick: () => playOnce() }, h('span', { html: ICON.speaker }), t('lqListen'));
  const noteMsg = h('div.lqmsg', { 'aria-live': 'polite' });
  const notesBox = h('div.lqnotes', null, h('div.lqseqrow', null, seqRow, h('div.grow'), listenBtn), noteMsg);

  // bonus after the echo: the other chords / keys, and the full exercise with notation
  const chordSeg = h('div.seg.lickchords', { role: 'group', 'aria-label': t(keyed ? 'lkKey' : 'lkChord') });
  const counts = h('div.lickcounts');
  const openBtn = h('a.btn.ghost.lickopen');
  const bonus = h('div.lqbonus', null, h('span.lqlabel', null, t(keyed ? 'lqBonusK' : 'lqBonus')), chordSeg, counts, h('div.grow'), openBtn);

  const panel = h('section.panel.imppanel.lickpanel', null,
    h('div.rhead', null, h('div.lqtitles', null, title, sub), h('div.grow'), dots),
    intro, playBox, notesBox, bonus);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);

  const bpmOut = h('output.bpm');
  const tempoBox = h('div.stepper', null,
    h('button', { type: 'button', 'aria-label': t('slower'), onclick: () => setBpm(st.bpm - 4) }, '−'), bpmOut,
    h('button', { type: 'button', 'aria-label': t('faster'), onclick: () => setBpm(st.bpm + 4) }, '+'));
  const swingSeg = seg([['straight', t('straight')], ['swing', t('swing')]], st.swing ? 'swing' : 'straight', (v) => { st.swing = v === 'swing'; }, 'eighths');
  const beatSeg = seg([['drums', t('drums')], ['click', t('metronome')]], settings.impBeat, (v) => {
    settings.impBeat = v; store.set('settings', { ...store.get('settings', {}), impBeat: v });
  }, 'backing');
  const footHint = h('span.foothint');
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: onPrimary });
  const footer = h('footer.actions', null, h('div.footsegs', null, swingSeg, beatSeg), tempoBox, footHint, h('div.grow'), primary);
  const screen = h('div.exscreen.impscreen.lickscreen', null, header, h('main.ex.imp', null, panel, kbPanel), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer); // phone: the keyboard sticks right above the footer

  function seg(items, value, cb, label) {
    const w = h('div.seg', { role: 'group', 'aria-label': label ? t(label) : null });
    items.forEach(([v, text]) => w.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), onclick: (e) => {
      w.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); cb(v);
    } }, text)));
    return w;
  }
  chords.forEach((c) => chordSeg.append(h('button', { type: 'button', 'data-v': c, onclick: () => setChord(c) }, c)));

  // ---------- keyboard ----------
  const allM = chords.flatMap((c) => notesOf(c).map((e) => e.m));
  const lo = Math.min(...allM), hi = Math.max(...allM);
  const lhM = chords.flatMap((c) => lhOf(c).flat().map((e) => e.m));
  audio.preloadPiano(Math.min(lo, ...lhM) - 2, hi + 4);
  const kb = createKeyboard(kbEl, [lo - 2, hi + 2], { names: 'off', exact: true, onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.5, 0.55); if (!midiOn()) input(m, performance.now()); } });
  function paintKeys() {
    kb.hint({});
    if (st.stage === 'notes') {
      const cur = notes[st.ni], nx = notes[st.ni + 1];
      kb.show({ rh: { notes: [spelled(cur)], f: [cur.f] }, lh: null }, { rh: nx && nx.m !== cur.m ? { notes: [spelled(nx)], f: [nx.f] } : null, lh: null }, 'rh');
      return;
    }
    kb.show({ rh: { notes: rows.map((r) => r.spelled), f: rows.map((r) => r.f) }, lh: null }, { rh: null, lh: null }, 'both');
  }

  // ---------- roll: 2 bars; one row per distinct key (labelled by finger), or one row in the rhythm stage ----------
  const pct = (slot) => (slot / LEN) * 100;
  const oneRow = () => st.stage === 'rhythm';
  let rollNotes = [], mine = [], ticks = [], contour = null, head = null;
  function buildRoll() {
    const kids = [];
    for (let k = 0; k < LEN; k += 2) {
      kids.push(h('div.bline' + (k === PER ? '.bar' : ''), { style: `left:${pct(k)}%` }));
      kids.push(h('div.bnum', { style: `left:${pct(k)}%` }, String((k % PER) / 2 + 1)));
    }
    rollNotes = notes.map((e) => h('div.lnote', { style: `left:${pct(e.t)}%;width:calc(${pct(e.d)}% - 6px)`, 'data-slot': e.t }, oneRow() ? null : h('span', null, String(e.f || ''))));
    kids.push(...rollNotes);
    const rr = oneRow() ? [{ f: '', black: false }] : rows;
    rr.slice().reverse().forEach((r, row) => kids.push(h('div.prow' + (r.black ? '.blk' : ''), { style: `--row:${row}` }, oneRow() ? null : h('b', { title: t(r.black ? 'lqBlack' : 'lqWhite') }, String(r.f || '')))));
    head = h('div.head'); contour = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    contour.setAttribute('class', 'contour'); contour.setAttribute('viewBox', '0 0 100 100'); contour.setAttribute('preserveAspectRatio', 'none');
    const n = rr.length;
    roll.dataset.rows = n;
    roll.style.setProperty('--rows', n);
    roll.style.setProperty('--row-h', (n >= 6 ? 22 : n === 5 ? 26 : n === 1 ? 40 : 32) + 'px');
    roll.replaceChildren(h('div.rinner', null, ...kids, contour, head));
    mine = []; ticks = [];
    notes.forEach((e) => addBlock([], 'ghost', e.t, e.d, e.m));
  }
  const rowOf = (m) => {
    if (oneRow()) return { row: 0, exact: true };
    let best = 0, bd = 1e9; rows.forEach((x, k) => { const d = Math.abs(x.m - m); if (d < bd) { bd = d; best = k; } });
    return { row: rows.length - 1 - best, exact: bd === 0 };
  };
  function addBlock(list, cls, slotPos, len, m) {
    const { row, exact } = rowOf(m);
    const el = h('div.pnote.' + cls + (exact ? '' : '.off'), { style: `left:${pct(slotPos)}%;width:calc(${pct(len)}% - 8px);--row:${row}` });
    roll.firstChild.append(el); list.push({ el, slotPos, row });
    return el;
  }
  function addTick(slotPos, cls, label) {
    const el = h('div.tick.' + cls, { style: `left:${pct(slotPos)}%` }, label ? h('span', null, label) : null);
    roll.firstChild.append(el); ticks.push(el);
  }
  function clearMine() { mine.forEach((x) => x.el.remove()); mine = []; ticks.forEach((x) => x.remove()); ticks = []; rollNotes.forEach((n) => n.classList.remove('ok', 'meh', 'bad')); drawContour(); }
  function drawContour() {
    if (oneRow() || mine.length < 2) { contour.innerHTML = ''; return; }
    const n = rows.length, y = (row) => ((row + 0.5) / n) * 100;
    const pts = mine.slice().sort((a, b) => a.slotPos - b.slotPos).map((x) => `${pct(x.slotPos) + 2},${y(x.row)}`).join(' ');
    contour.innerHTML = `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="5 6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
  }

  // ---------- painting ----------
  const count = () => (st.stage === 'echo' ? (due ? st.sessClean : Math.min(st.clean[st.chord] || 0, NEED)) : st.streak);
  function paintDots() {
    const p = prog(), passed = p[st.stage] && !(st.stage === 'echo' && (due || st.chord !== home));
    const n = passed ? NEED : count(), need = st.stage === 'echo' && due ? REVIEW_NEED : NEED;
    dotsLabel.textContent = t('lqDots_' + st.stage);
    [...dots.querySelectorAll('i')].forEach((d, k) => { d.className = k < Math.min(n, need) ? 'on' : ''; d.hidden = k >= need; });
    dots.setAttribute('aria-label', `${t('lqDots_' + st.stage)}: ${Math.min(n, need)} / ${need}`);
  }
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
  function paintBonus() {
    const show = st.stage === 'echo' && prog().echo && !st.playing;
    bonus.hidden = !show;
    chordSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.chord)));
    counts.replaceChildren(...chords.map((c) => h('span.lcount' + (st.clean[c] >= NEED ? '.ok' : '') + (c === st.chord ? '.cur' : ''), null, h('b', null, c), ` ${Math.min(st.clean[c] || 0, NEED)}/${NEED}`)));
    openBtn.href = exHref(st.chord);
    openBtn.innerHTML = ICON.note + `<span>${t('lqOpenEx')}</span>`;
  }
  /** what is visible: intro (idle, no result), the play view (rhythm, echo), the notes view */
  function paintView() {
    screen.dataset.lstage = st.stage;
    const idleIntro = !st.playing && !st.result && st.stage !== 'notes' && !prog()[st.stage]; // a passed stage shows the phrase and the bonus
    intro.hidden = !idleIntro;
    playBox.hidden = st.stage === 'notes';
    phase.hidden = !st.playing;
    resBox.hidden = !st.result;
    notesBox.hidden = st.stage !== 'notes';
    paintBonus();
  }
  function setStage(sid, keep) {
    if (st.playing) stop();
    st.stage = sid; if (!keep) store.set('lickStage:' + itemId, sid);
    st.streak = 0; st.result = null; st.ni = 0; st.slip = false;
    if (sid !== 'echo' && st.chord !== home) { st.chord = home; computeNotes(); }
    title.textContent = t('lqT_' + sid); sub.textContent = t('lqS_' + sid) + (due && sid === 'echo' ? ' ' + t('lqDueHint').replace('{n}', REVIEW_NEED) : '');
    footHint.textContent = t('lqF_' + sid);
    resBox.replaceChildren(); noteMsg.replaceChildren(); noteMsg.className = 'lqmsg';
    buildRoll(); paintKeys(); paintSeq();
    paintStages(); paintDots(); paintPrimary(); paintPhase(-1, -1); paintView();
  }
  function setChord(c) {
    if (st.playing) stop();
    st.chord = c; st.result = null;
    computeNotes(); buildRoll(); paintKeys(); paintDots(); paintView();
  }
  /** cell = bar of the 4-bar cycle (0, 1 piano; 2, 3 you), beat 0..3; cell -1 = count-in (beat = its click) */
  function paintPhase(cell, beat, countIn) {
    cells.forEach((c, k) => {
      c.classList.toggle('on', k === cell);
      c.classList.toggle('next', cell >= 0 && k === (cell === 1 ? 2 : cell === 3 ? 0 : -9));
      c.lastChild.textContent = `${t('lqBar')} ${(k % 2) + 1}`;
    });
    beats.forEach((b, k) => b.classList.toggle('on', k === beat));
    phase.classList.toggle('you', cell >= 2);
    if (countIn) { turnWord.textContent = t('countInLabel'); turnSub.textContent = t('lqCountSub'); }
    else if (cell >= 2) { turnWord.textContent = t('impYourTurn'); turnSub.textContent = t(st.stage === 'rhythm' ? 'lqYouRhythm' : 'lqYouEcho'); }
    else if (cell >= 0) { turnWord.textContent = t('lqListenT'); turnSub.textContent = t(st.stage === 'rhythm' ? 'lqListenRhythm' : 'lqListenEcho'); }
  }
  function paintPrimary() {
    if (st.stage === 'notes') { primary.innerHTML = `<span>${t('lqRestart')}</span>`; return; }
    primary.innerHTML = st.playing ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`;
  }
  function onPrimary() {
    if (st.stage === 'notes') { st.ni = 0; st.slip = false; noteMsg.replaceChildren(); noteMsg.className = 'lqmsg'; paintSeq(); paintKeys(); return; }
    if (st.playing) stop(); else play();
  }
  function setBpm(v) {
    st.bpm = Math.max(40, Math.min(200, Math.round(v)));
    bpmOut.innerHTML = `♩ ${st.bpm}`;
    store.set('tempo:' + itemId, st.bpm);
  }

  // ---------- sound ----------
  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) {
      const onMs = performance.now() + (time - audio.now()) * 1000;
      if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return;
    }
    audio.pianoNote(m, time, dur, v);
  }
  /** the phrase once, no backing (the notes stage) */
  function playOnce() {
    if (!audio.ensureAudio()) return;
    const t0 = audio.now() + 0.1, beat = 60 / st.bpm, off = st.swing ? beat * 2 / 3 : beat / 2;
    notes.forEach((e) => { const tm = t0 + Math.floor(e.t / 2) * beat + (e.t % 2 ? off : 0); play1(e.m, tm, (beat / 2) * e.d * 0.95, 0.55); });
  }

  // ---------- transport: 1-bar count-in, then an endless 4-bar cycle (2 piano + 2 you) ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null, exp = [], rep = null, lhBars = [[], []];
  const swingOff = () => { const beat = 60 / st.bpm; return st.swing ? beat * 2 / 3 : beat / 2; };
  const enqueue = (x) => { queue.push(x); queue.sort((a, b) => a.t - b.t); };
  const phoneMq = window.matchMedia('(max-width: 640px)');
  /** Phone: the keyboard sticks above the footer; on Start scroll just enough for the roll to sit above it. */
  function bringRollUp() {
    if (!phoneMq.matches) return;
    const r = roll.getBoundingClientRect(), kp = kbPanel.getBoundingClientRect(), top = phase.getBoundingClientRect().top;
    const d = Math.min(r.bottom - kp.top + 8, top - 8);
    if (d > 2) window.scrollTo({ top: window.scrollY + d, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function play() {
    if (!audio.ensureAudio() || st.playing) return;
    st.playing = true; screen.classList.add('playing'); paintPrimary(); paintView(); bringRollUp();
    lhBars = lhOf(st.chord);
    const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k }); }
    t0 += 4 * beat; beatTime = t0; g = 0;
    run = { t0, beat, swing: st.swing };
    clearMine(); exp = []; rep = null;
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function schedule() {
    const ahead = audio.now() + 0.15, beat = 60 / st.bpm;
    while (st.playing) {
      const slot = g % PER, bar = Math.floor(g / PER), k = bar % CYCLE, ls = (k % 2) * PER + slot; // ls: slot in the lick (0..15)
      const time = beatTime + (slot % 2 ? swingOff() : 0);
      if (time > ahead) break;
      if (k === 2 && slot === 0) { exp = []; enqueue({ t: time - 0.12, youStart: bar }); }
      if (settings.impBeat === 'drums') groove(slot, time, { swing: st.swing, style: form.style, bar }); else if (settings.met && slot % 2 === 0) audio.click(time, slot === 0);
      lhBars[k % 2].filter((e) => e.t === slot).forEach((e) => play1(e.m, time, e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9, 0.3));
      const evs = notes.filter((e) => e.t === ls);
      if (k < 2) evs.forEach((e) => play1(e.m, time, e.stac ? Math.min(swingOff() * 0.6, 0.2) : swingOff() * e.d * 0.95, 0.55));
      else evs.forEach((e) => exp.push({ t: time, slot: ls, len: e.d, hit: false, m: e.m, f: e.f }));
      if (k === 3 && slot === PER - 1) enqueue({ t: time + beat * 0.5 + 0.25, youEnd: bar });
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
      if (q.ci !== undefined) { paintPhase(-1, q.ci, true); continue; }
      if (q.youStart !== undefined) { rep = { taps: [] }; clearMine(); }
      if (q.youEnd !== undefined) finishRepeat();
    }
    const p = posAt(now);
    if (p >= 0) {
      const cb = Math.floor(p / PER) % CYCLE, inLick = p % LEN;
      head.style.left = pct(inLick) + '%';
      paintPhase(cb, Math.floor((p % PER) / 2));
      rollNotes.forEach((n) => { const s = +n.dataset.slot; n.classList.toggle('now', inLick >= s && inLick < s + 1); });
      markActive();
    }
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = st.playing; st.playing = false; run = null; exp = []; rep = null;
    screen.classList.remove('playing');
    if (was) { audio.hush(); silence(); }
    if (head) head.style.left = '0%'; rollNotes.forEach((n) => n.classList.remove('now'));
    idle(); paintPrimary(); paintView();
  }

  // ---------- input ----------
  const tols = () => { const e8 = 60 / st.bpm / 2; return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.2, 0.04), 0.08), near: e8 * 1.1 }; };
  function input(m, ts) {
    markActive();
    if (st.stage === 'notes') { notesInput(m); return; }
    if (!st.playing || !rep) return;
    const T = audio.toAudioTime(ts), { win, tight } = tols();
    rep.taps.push({ t: T, m });
    // live marks on the roll (the verdict comes at the end of the repeat)
    const eighth = (slot) => (slot % 2 ? 60 / st.bpm - swingOff() : swingOff());
    let best = null;
    for (const x of exp) { if (x.hit) continue; const dt = T - x.t; if (Math.abs(dt) <= win && (!best || Math.abs(dt) < Math.abs(T - best.t))) best = x; }
    if (!best) {
      if (exp.length && T > exp[0].t - win) { const p = posAt(T); addTick(Math.max(0, Math.min(LEN - 0.2, p % LEN)), 'bad', t('extraW')); }
      return;
    }
    best.hit = true;
    const dt = T - best.t, cls = Math.abs(dt) <= tight ? 'ok' : 'meh';
    const el = addBlock(mine, 'mine', best.slot + dt / eighth(best.slot), best.len, st.stage === 'rhythm' ? best.m : m);
    el.classList.add(cls);
    if (st.stage === 'echo' && best.m !== m) el.classList.add('other');
    drawContour();
    const n = rollNotes.find((x) => +x.dataset.slot === best.slot); if (n) n.classList.add(st.stage === 'echo' && best.m !== m ? 'bad' : cls);
  }

  const beatWord = (slot) => (slot >= PER ? t('lqBar2') + ' · ' : '') + t(beatKey(slot));
  const whereWord = (want, got) => {
    const k = keyHint(want, got);
    return t('lqNeed').replace('{c}', t(k.black ? 'lqBlackW' : 'lqWhiteW')).replace('{n}', `${k.keys} ${plural(k.keys, 'lqKeys')}`).replace('{d}', t(k.dir === 'left' ? 'lqLeft' : 'lqRight'));
  };
  function finishRepeat() {
    if (!rep) return;
    const pitch = st.stage === 'echo';
    const r = scoreRepeat(exp, rep.taps, { ...tols(), pitch });
    rep = null;
    exp.filter((x) => !x.hit).forEach((x) => { const n = rollNotes.find((y) => +y.dataset.slot === x.slot); if (n) n.classList.add('bad'); });
    const good = r.notes.filter((n) => ['ok', 'bitEarly', 'bitLate'].includes(n.res)).length;
    let verdict = '';
    if (r.clean) {
      if (st.stage === 'rhythm') {
        st.streak++;
        if (st.streak >= NEED && !prog().rhythm) { passStage('rhythm'); verdict = t('lqPassed_rhythm'); }
      } else {
        const c = st.chord;
        st.clean[c] = (st.clean[c] || 0) + 1;
        updateEx(itemId, (p) => ({ ...p, echo: { ...(p.echo || {}), [c]: st.clean[c] } }));
        if (due && c === home) {
          st.sessClean++;
          if (st.sessClean === REVIEW_NEED) { scheduleReview(itemId, true); verdict = t('lqReviewDone'); }
        } else if (c === home && st.clean[c] >= NEED && !prog().echo) {
          passStage('echo'); scheduleReview(itemId, true); verdict = t('lqPassed_echo');
        }
      }
    } else if (st.stage === 'rhythm') st.streak = 0;
    // result card: verdict, a chip per note, up to three lines in plain words
    const head2 = r.clean ? t('lqClean') : t('lqAlmost').replace('{n}', good).replace('{m}', exp.length);
    const lines = [];
    r.notes.forEach((n, i) => {
      const e = exp[i], who = pitch ? t('lqNoteF').replace('{i}', i + 1).replace('{f}', e.f) : t('lqNoteN').replace('{i}', i + 1);
      if (n.res === 'wrong') lines.push(`<b>${who}:</b> ${t('lqWrong')}, ${whereWord(e.m, n.got)}.`);
      else if (n.res === 'early' || n.res === 'late') lines.push(`<b>${who}:</b> ${t('lq_' + n.res)}. ${t('lqItIsOn').replace('{b}', beatWord(e.slot))}.`);
      else if (n.res === 'miss') lines.push(`<b>${who}:</b> ${t('lqMissed')}. ${t('lqItIsOn').replace('{b}', beatWord(e.slot))}.`);
    });
    if (r.extra) lines.push(`<b>${t('lqExtra')}:</b> ${r.extra}. ${t('lqExtraHint')}`);
    const chips = r.notes.map((n, i) => {
      const e = exp[i], cls = n.res === 'ok' ? 'ok' : n.res === 'bitEarly' || n.res === 'bitLate' ? 'okish' : n.res === 'wrong' || n.res === 'miss' ? 'bad' : 'meh';
      return h('div.lqchip.' + cls, null, h('small', null, t(beatKey(e.slot))), h('b', null, pitch ? String(e.f || '·') : String(i + 1)), h('span', null, t('lqRes_' + n.res)));
    });
    st.result = { clean: r.clean };
    resBox.className = 'lqres ' + (r.clean ? 'ok' : 'meh');
    resBox.replaceChildren(
      h('div.lqrestext', null,
        h('div.lqreshead', null, h('b', null, head2), h('span', null, verdict || (r.clean ? nextHint() : t('lqAgain')))),
        h('div.lqlines', { html: lines.slice(0, 3).join('<br>') })),
      h('div.lqchips', { style: `--n:${chips.length}` }, ...chips));
    paintDots(); paintStages(); paintView();
    if (verdict && st.stage === 'rhythm') setTimeout(() => { if (!st.playing || st.stage !== 'rhythm') return; stop(); setStage('notes'); noteFb('ok', t('lqPassed_rhythm')); }, 900);
  }
  const nextHint = () => {
    if (st.stage === 'rhythm') return t('lqMoreInRow').replace('{n}', Math.max(0, NEED - st.streak));
    if (due) return t('lqMore').replace('{n}', Math.max(0, REVIEW_NEED - st.sessClean));
    if (st.chord !== home || prog().echo) return t('lqKeepGoing');
    return t('lqMore').replace('{n}', Math.max(0, NEED - (st.clean[home] || 0)));
  };

  // ---------- notes stage: key after key, no tempo ----------
  function paintSeq() {
    seqRow.replaceChildren(...notes.map((e, i) => h('div.lqnote' + (i < st.ni ? '.done' : i === st.ni ? '.cur' : '') + (isBlack(e.m) ? '.blk' : ''), null,
      h('b', null, String(e.f || '·')),
      h('small', null, i < st.ni ? '✓' : i === st.ni ? t('lqNow') : t(isBlack(e.m) ? 'lqBlackW' : 'lqWhiteW')))));
  }
  function noteFb(cls, html, sym) {
    noteMsg.className = 'lqmsg ' + cls;
    noteMsg.replaceChildren(...[sym ? h('span.sym', null, sym) : null, h('div', { html })].filter(Boolean));
  }
  function notesInput(m) {
    const cur = notes[st.ni];
    if (!cur) return;
    if (m !== cur.m) {
      st.slip = true; st.streak = 0;
      kb.hint({ [m]: 'bad' });
      const k = keyHint(cur.m, m);
      noteFb('bad', `<b>${t('lqWrongKey')}: ${whereWord(cur.m, m)}</b><br>${t('lqWrongSub')}`, k.dir === 'left' ? '←' : '→');
      paintDots();
      return;
    }
    st.ni++;
    if (st.ni >= notes.length) {
      if (!st.slip) {
        st.streak++;
        if (st.streak >= NEED && !prog().notes) { passStage('notes'); paintStages(); noteFb('ok', `<b>${t('lqPassed_notes')}</b>`); }
        else noteFb('ok', `<b>${t('lqRunClean')}</b> ${st.streak >= NEED ? t('lqKeepGoing') : t('lqMoreInRow').replace('{n}', NEED - st.streak)}`);
      } else noteFb('meh', `<b>${t('lqRunSlip')}</b> ${t('lqRunSlipSub')}`);
      st.ni = 0; st.slip = false;
    } else if (noteMsg.classList.contains('bad')) { noteMsg.className = 'lqmsg'; noteMsg.replaceChildren(); }
    paintSeq(); paintKeys(); paintDots();
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => { if (e.type === 'on') { kb.down(e.note, true); input(e.note, e.ts); } else kb.down(e.note, false); });
  const onKey = (e) => {
    if (e.target.closest('input,select,textarea,summary')) return;
    if (e.code === 'Space') { e.preventDefault(); if (st.stage === 'notes') return; if (st.playing) stop(); else play(); }
  };
  document.addEventListener('keydown', onKey);

  setBpm(st.bpm);
  setStage(st.stage, true);
  updateEx(itemId, (p) => p);

  return () => {
    if (footRO) footRO.disconnect();
    if (st.playing) stop();
    offNote(); document.removeEventListener('keydown', onKey);
    header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup());
  };
}
