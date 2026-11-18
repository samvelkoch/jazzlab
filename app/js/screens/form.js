// Form screen: the whole form (a 12-bar blues, a standard) on a loop with drums. You play your part through the form,
// the app scores every note and counts clean choruses. Three clean choruses in a row pass a stage.
// Stages (methodology: rhythm first, then notes): «Ритм» = any key, only the timing counts; «Ноты» = the right keys
// (passing it passes the item); «Без подсказок» = no lit keys and no staff, by heart.
// What you see: a strip of the form's bars (chord + result), the staff of the current four bars with fingers and how each
// note went (✓, early, late, ✗), a big 1-2-3-4 counter (the count-in too), a warning one bar before every chord change
// with where the hand goes, the now-key lit and the next one underlined. Before the start: what the exercise trains and
// how a chorus is judged. After Stop: what went wrong in the last chorus, bar by bar, the timing spread, and a button
// that loops the four bars with the most slips (a practice loop: it does not count toward the three clean choruses).
// Right-hand mode (item.hand === 'rh' + a lick): the app always plays the left-hand pattern; you play the lick,
// started on every odd bar (1, 3, 5, …) and transposed to the chord of its first bar.
// With item.licks = [question, answer] the two alternate: the question on bars 1, 5, 9, the answer on bars 3, 7, 11.
// With key-relative licks (item.lickKey, or item.licksKey = [question, answer] taking turns) the lick sits on every ii–V–I
// of the form (iivPairs: "Gm7 C7 | Fmaj7"), in the key of the I bar; the other bars are rests.
// With a melody (item.melody, jazzlab-melody/1) you play the written tune, bar k of the melody over bar k of the form.
// Both hands (item.hand === 'both', same right-hand options as 'rh'): you play the left-hand pattern AND the right-hand part,
// the app plays only the drums / metronome (and both hands as a guide in Listen mode or without MIDI); both hands are scored.
// A comping pattern (pattern.comp, item.hand === 'both', no tune or lick): the left hand is the pattern's bass, the right hand
// its voice-led chords (compBars), both yours and both scored.
// A clean chorus allows max(1, round(notes per chorus / 40)) slips (misses + wrong notes): 1 for root-and-fifth
// (24 or 48 notes) and the licks, 2 for the boogie (96 eighths per chorus), so denser patterns are not stricter.
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L, getLang } from '../i18n.js';
import { markTerms } from '../glossary.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview, reviews, logDay } from '../store.js';
import { midiToName, dia } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import { createStaff } from '../music/staff.js';
import { patternBars, compBars, lickBars, melodyBarNotes, iivPairs, lickOverKey } from '../music/forms.js';
import { groove } from '../music/drums.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';
import { decorateFunctions } from '../fnlabels.js';
import { createTally, chorusBarAt } from '../music/tally.js';
import { slipBars, loopWindow, tendency, beatWord, changeBars, plural } from '../music/formfb.js';

const PER = 8;
const CLEAN_TO_PASS = 3; // clean choruses in a row
const SLIP_PER = 40; // one allowed slip per this many notes in a chorus (at least 1)
const LINE = 4; // bars on the staff at a time
const STAGES = ['rhythm', 'notes', 'free'];
const STAGE_KEY = { rhythm: 'frhythm', notes: 'done', free: 'ffree' }; // progress flags (passing «Ноты» passes the item)

export function renderForm(root, { track, itemId, item, form, pattern, lick, licks, keyLicks, melody, back }) {
  const settings = { met: true, names: 'en', pianoSnd: true, impBeat: 'drums', ...store.get('settings', {}) };
  const ru = getLang() === 'ru';
  const bars = form.bars, NB = bars.length;
  const lhNotes = patternBars(pattern, bars); // [{t, d, m, f}] per bar, built in order (a voice-led pattern follows the previous bar)
  // right hand: one lick, or a question-and-answer pair taking turns (pair k/2 even = question, odd = answer)
  const pair = Array.isArray(licks) && licks.length === 2 && licks.every(Boolean) ? licks : null;
  const rhLicks = pair || (lick ? [lick] : null);
  const rhPart = item.hand === 'rh' || item.hand === 'both'; // the item has a right-hand part
  const mel = rhPart && melody ? melody : null; // the tune, written out bar by bar
  // key-relative licks on the ii–V–I pairs of the form: pair i plays keyLicks[i % n] in the key of its I bar
  const kl = rhPart && !mel && Array.isArray(keyLicks) && keyLicks.length && keyLicks.every((l) => l && l.prog) ? keyLicks : null;
  const kPairs = kl ? iivPairs(bars).map((p, i) => ({ ...p, lick: kl[i % kl.length] })) : [];
  const comp = rhPart && !!pattern.comp && !rhLicks && !mel && !kl; // right-hand chords from the pattern itself
  const rh = rhPart && (!!rhLicks || !!mel || !!kl || comp);
  const two = rh && item.hand === 'both'; // both hands are yours: no band left hand
  const lickAt = (k) => rhLicks[(k / 2) % rhLicks.length]; // the lick starting on bar k (k even)
  // each lick over its pair of bars, in the key of the pair's first chord
  const rhNotes = rh ? bars.map(() => []) : null;
  if (comp) compBars(pattern, bars).forEach((b, k) => { rhNotes[k] = b; });
  else if (mel) bars.forEach((_, k) => { rhNotes[k] = melodyBarNotes(mel, k); });
  else if (kl) kPairs.forEach((p) => { lickOverKey(p.lick, p.key).bars.forEach((b, j) => { if (p.bars[0] + j < NB) rhNotes[p.bars[0] + j] = b.rh; }); });
  else if (rh) for (let k = 0; k < NB; k += 2) { const [b1, b2] = lickBars(lickAt(k), bars[k]); rhNotes[k] = b1; if (k + 1 < NB) rhNotes[k + 1] = b2; }
  // what you play (expected + keyboard); both hands: the two merged per bar (a same pitch on the same slot counts once)
  const merge = (a, b) => { const seen = new Set(); return [...a, ...b].filter((e) => { const k = e.t + ':' + e.m; if (seen.has(k)) return false; seen.add(k); return true; }); };
  const barNotes = two ? bars.map((_, k) => merge(lhNotes[k], rhNotes[k])) : rh ? rhNotes : lhNotes;
  // the rhythm stage: one press per onset, whatever the key
  const onsets = barNotes.map((b) => [...new Set(b.map((e) => e.t))].sort((a, c) => a - c));
  const nNotes = barNotes.flat().length, nOnsets = onsets.flat().length;
  const role = two ? (comp ? 'comp' : 'both') : mel ? 'mel' : rh ? 'rh' : 'lh';
  const saved0 = exProgress(itemId), stg0 = saved0.stages || {};
  const st = {
    mode: 'play', bpm: store.get('tempo:' + itemId, form.tempo || 66), swing: !!form.swing && form.style !== 'bossa', playing: false, streak: 0, choruses: 0,
    stage: stg0.done ? 'notes' : stg0.frhythm ? 'notes' : 'rhythm', section: null, last: null, view: 'intro'
  };
  const maxSlipsOf = () => Math.max(1, Math.round((st.stage === 'rhythm' ? nOnsets : nNotes) / SLIP_PER));
  const wasDue = reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date();
  const midiOn = () => midiState().connected;
  const chg = changeBars(bars);
  const errW = (n) => (ru ? plural(n, ['ошибка', 'ошибки', 'ошибок']) : n === 1 ? 'slip' : 'slips');
  const keysW = (n) => (ru ? `${n} ${plural(n, ['клавишу', 'клавиши', 'клавиш'])}` : `${n} ${n === 1 ? 'key' : 'keys'}`);
  const T = (k, p = {}) => Object.entries(p).reduce((s, [a, v]) => s.split(`{${a}}`).join(v), t(k));

  // ---------- layout ----------
  const stageBtns = STAGES.map((s, i) => h('button', { type: 'button', 'data-v': s, onclick: () => setStage(s) }, h('span.fxnum', null, String(i + 1)), h('span', null, t('fxSt_' + s))));
  const stageNav = h('nav.fxstages', { 'aria-label': t('fxStagesW') }, ...stageBtns);
  const streakDots = h('div.loops');
  const streakWord = h('span.fxstreakw');
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', { title: comp ? L(pattern.title) : mel ? L(mel.title) : kl ? (kl.length > 1 ? t('qaChip') : L(kl[0].title)) : rh ? (pair ? t('qaChip') : L(rhLicks[0].title)) : L(pattern.title) }, `${L(track.title).toUpperCase()} · ${t('formUpper')}`), h('span.title', null, L(item.title || form.title))),
    h('div.grow'), stageNav, h('div.fxstreak', null, streakDots, streakWord), sessionChip(itemId), midiChip(), themeButton());

  // the form strip: bar number, chord, how the bar went
  const cells = bars.map((c, k) => h('div.fcell.fxcell', { 'data-bar': k }, h('span.fno', null, String(k + 1)), h('b.fchord', null, c), h('small.fxres')));
  const strip = h('div.fxstrip' + (NB > 16 ? '.long' : ''), { style: `--n:${Math.min(NB, 16)}` }, ...cells);
  decorateFunctions(cells, bars); // ii · V · I under the chords, a bracket over each ii–V–I
  const keepInView = (k) => { const c = cells[k]; if (NB <= 16 || !c) return; if (c.offsetTop < strip.scrollTop || c.offsetTop + c.offsetHeight > strip.scrollTop + strip.clientHeight) strip.scrollTop = Math.max(0, c.offsetTop - 4); };

  // the three views of the main panel: intro (goal + rules), play (staff + counter), result (after a chorus)
  const introEl = h('div.fxintro');
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('class', 'staff fxstaff');
  const beatCells = [0, 1, 2, 3].map((b) => h('span', null, String(b + 1)));
  const counterLbl = h('span.fxclbl', null, t('fxCount'));
  const pressLbl = h('span.fxpress');
  const counter = h('div.fxcounter', { 'aria-hidden': 'true' }, counterLbl, h('div.fxbeats', null, ...beatCells), pressLbl);
  const freeMsg = h('div.fxfree', null, t('fxFreeMsg'));
  const playEl = h('div.fxplay', null, h('div.fxstaffbox', null, svgEl, freeMsg), counter);
  const resultEl = h('div.fxresult');
  const panel = h('section.panel.formpanel.fxpanel', null, introEl, playEl, resultEl);
  const secChip = h('button.btn.fxsec', { type: 'button', onclick: () => { setSection(null); } });
  const changeEl = h('div.fxchange'), liveEl = h('div.fxlive', { 'aria-live': 'polite' });
  const bannerRow = h('div.fxbanners', null, secChip, changeEl, liveEl);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const bpmOut = h('output.bpm');
  const tempoBox = h('div.stepper', null,
    h('button', { type: 'button', 'aria-label': t('slower'), onclick: () => setBpm(st.bpm - 4) }, '−'), bpmOut,
    h('button', { type: 'button', 'aria-label': t('faster'), onclick: () => setBpm(st.bpm + 4) }, '+'));
  const modeSeg = seg([['play', t('fPlay')], ['listen', t('fListen')]], st.mode, (v) => { if (st.playing) stop(); st.mode = v; paintHint(); }, 'rMode');
  const swingSeg = seg([['straight', t('straight')], ['swing', t('swing')]], st.swing ? 'swing' : 'straight', (v) => { st.swing = v === 'swing'; }, 'eighths');
  const beatSeg = seg([['drums', t('drums')], ['click', t('metronome')]], settings.impBeat, (v) => { settings.impBeat = v; store.set('settings', { ...store.get('settings', {}), impBeat: v }); }, 'backing');
  const footHint = h('span.foothint');
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => (st.playing ? stop() : play()) });
  const footer = h('footer.actions', null, h('div.footsegs', null, modeSeg, form.style === 'bossa' ? null : swingSeg, beatSeg), tempoBox, footHint, h('div.grow'), primary);
  const screen = h('div.exscreen.formscreen.fv2', null, header, h('main.ex', null, strip, panel, bannerRow, kbPanel), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer); // phone: the keyboard sticks right above the footer

  function seg(items, value, cb, label) {
    const w = h('div.seg', { role: 'group', 'aria-label': label ? t(label) : null });
    items.forEach(([v, text]) => w.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), onclick: (e) => {
      w.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); cb(v);
    } }, text)));
    return w;
  }

  // ---------- keyboard ----------
  const all = barNotes.flat().map((e) => e.m);
  const lo = Math.min(...all), hi = Math.max(...all);
  const lhLo = rh ? Math.min(...lhNotes.flat().map((e) => e.m)) : lo;
  audio.preloadPiano(Math.min(lo, lhLo) - 3, hi + 7);
  const kb = createKeyboard(kbEl, [lo, hi + 5], { names: settings.names, onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.5, 0.55); if (!midiOn()) input(m, performance.now()); } });
  const handKey = rh ? 'rh' : 'lh';
  const evAt = (src, bar, slot) => { const e = src[bar].filter((x) => x.t === slot); return e.length ? { notes: e.map((x) => x.name || midiToName(x.m)), f: e.map((x) => x.f), sug: false, acc: false } : null; };
  // the keys to hold now: the last onset at or before the slot, while it still sounds
  const holdAt = (src, bar, slot) => { const on = src[bar].filter((x) => x.t <= slot && x.t + (x.d || 1) > slot); if (!on.length) return null; const t0 = Math.max(...on.map((x) => x.t)); return evAt(src, bar, t0); };
  const nextEv = (src, bar, slot) => { for (let k = 1; k <= PER * NB; k++) { const g = bar * PER + slot + k, b = Math.floor(g / PER) % NB, s = g % PER; const e = evAt(src, b, s); if (e) return e; } return null; };
  const none = { rh: null, lh: null };
  function showKeys(bar, slot) {
    if (st.stage !== 'notes' && st.mode === 'play') { kb.show(none, none, 'both'); return; } // rhythm: any key; free: by heart
    if (two) kb.show({ rh: holdAt(rhNotes, bar, slot), lh: holdAt(lhNotes, bar, slot) }, { rh: nextEv(rhNotes, bar, slot), lh: nextEv(lhNotes, bar, slot) }, 'both');
    else kb.show({ ...none, [handKey]: holdAt(barNotes, bar, slot) }, { ...none, [handKey]: nextEv(barNotes, bar, slot) }, 'both');
  }

  // ---------- the staff: four bars at a time ----------
  let staff = null, lineAt = -1;
  const toEv = (e) => ({ t: e.t, d: e.d || 1, notes: [], f: [], acc: false, sug: false, stac: !!e.stac, grace: null });
  function lineEvents(list) { // [{t, d, m, name, f}] -> staff events (notes at one slot together)
    const by = new Map();
    list.forEach((e) => { if (!by.has(e.t)) by.set(e.t, toEv(e)); const g = by.get(e.t); g.notes.push(e.name || midiToName(e.m)); if (e.f) g.f.push(e.f); g.d = Math.max(g.d, e.d || 1); });
    return [...by.values()].sort((a, b) => a.t - b.t);
  }
  function drawLine(start) {
    lineAt = start;
    const ks = []; for (let k = start; k < Math.min(NB, start + LINE); k++) ks.push(k);
    const ex = { per: PER, beats: 4, dyn: [], bars: ks.map((k) => ({ rh: rh ? lineEvents(rhNotes[k]) : [], lh: !rh || two ? lineEvents(lhNotes[k]) : [] })) };
    staff = createStaff(svgEl, ex, { names: 'off', only: two ? null : rh ? 't' : 'b', chords: ks.map((k) => bars[k]) });
  }
  const lineOf = (bar) => Math.floor(bar / LINE) * LINE;
  const handOf = () => (rh && !two ? 'rh' : 'lh');

  // ---------- the hand positions (left-hand patterns): each chord's keys, in the order they come ----------
  function positions() {
    if (rh) return null;
    const seen = new Map();
    bars.forEach((c, k) => { if (!seen.has(c)) seen.set(c, k); });
    if (seen.size > 6) return null;
    const ps = [...seen.entries()].map(([c, k]) => ({ c, notes: [...new Map(lhNotes[k].map((e) => [e.m, e])).values()].sort((a, b) => a.m - b.m) }));
    const ms = ps.flatMap((p) => p.notes.map((e) => e.m)); let a = Math.min(...ms), b = Math.max(...ms);
    const black = (m) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
    if (black(a)) a--; if (black(b)) b++;
    if (b - a > 26) return null;
    const home = dia(ps[0].notes[0].name || midiToName(ps[0].notes[0].m));
    return ps.map((p, i) => {
      const keys = [];
      for (let m = a; m <= b; m++) if (!black(m)) {
        const e = p.notes.find((x) => x.m === m), bl = m + 1 <= b && black(m + 1) ? p.notes.find((x) => x.m === m + 1) : null;
        keys.push(h('i' + (e ? '.on' : ''), null, e ? String(e.f || '') : '', black(m + 1) && m + 1 <= b ? h('b' + (bl ? '.on' : ''), null, bl ? String(bl.f || '') : '') : null));
      }
      const d = dia(p.notes[0].name || midiToName(p.notes[0].m)) - home;
      const where = i === 0 ? t('fxHome') : d === 0 ? t('fxSamePlace') : T(d > 0 ? 'fxUpN' : 'fxDownN', { n: Math.abs(d) });
      return h('div.fxpos', null, h('b', null, `${p.c} · ${where}`), h('div.fxmini', null, ...keys));
    });
  }

  // ---------- the views ----------
  function paintIntro() {
    const stg = st.stage, n = stg === 'rhythm' ? nOnsets : nNotes, k = maxSlipsOf();
    const pos = positions();
    introEl.replaceChildren(
      h('div.fxcol', null,
        h('span.kicker', null, t('fxGoalW')),
        h('h2.fxgoal', null, item.goal ? L(item.goal) : t('fxGoal_' + role)),
        h('p.fxgoals', null, (item.goalS ? L(item.goalS) : t('fxGoalS_' + role)) + (chg.length && chg.length < 14 ? ' ' + T('fxChanges', { list: chg.join(', ') }) : '')),
        h('span.kicker.fxsep', null, t('fxRulesW')),
        h('div.fxrule', null, h('b', null, String(n)), h('span', null, T(stg === 'rhythm' ? 'fxRule1r' : 'fxRule1', { bars: NB }))),
        h('div.fxrule', null, h('b', null, '≤ ' + k), h('span', null, T('fxRule2', { err: ru ? plural(k, ['ошибки', 'ошибок', 'ошибок']) : (k === 1 ? 'slip' : 'slips') }))),
        h('div.fxrule', null, h('b', null, String(CLEAN_TO_PASS)), h('span', null, t('fxRule3')))),
      h('div.fxcol', null,
        pos ? h('span.kicker', null, t('fxPosW')) : null,
        pos ? h('div.fxposes', null, ...pos) : null,
        pos ? h('span.muted.fxsmall', null, t('fxPosS')) : h('p.muted.dabout', null, markTerms(L(item.about || form.about))),
        h('div.fxstagecard', null,
          h('span.kicker', null, T('fxStageK', { i: STAGES.indexOf(stg) + 1, s: t('fxSt_' + stg).toUpperCase() })),
          h('b', null, T('fxStageT_' + stg, { n: NB })),
          h('span', null, t('fxStageS_' + stg)),
          stg !== 'rhythm' && !(exProgress(itemId).stages || {}).frhythm && !(exProgress(itemId).stages || {}).done ? h('span.fxtip', null, t('fxRhythmFirst')) : null)));
  }
  function setView(v) {
    st.view = v;
    introEl.hidden = v !== 'intro'; playEl.hidden = v !== 'play'; resultEl.hidden = v !== 'result';
    bannerRow.hidden = v !== 'play'; kbPanel.hidden = v !== 'play'; // the keys only while playing: room for the goal and the result
  }
  function setStage(s) {
    if (st.playing) stop();
    st.stage = s; st.streak = 0;
    stageBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === s)));
    screen.dataset.fstage = s;
    paintStages(); paintStreak(); paintHint(); paintIntro(); setView('intro'); paintPrimary();
    showKeys(0, 0);
  }
  function paintStages() {
    const p = exProgress(itemId).stages || {};
    stageBtns.forEach((b) => b.classList.toggle('passed', !!p[STAGE_KEY[b.dataset.v]]));
  }
  function setSection(sec) {
    if (st.playing) stop();
    st.section = sec;
    secChip.hidden = !sec;
    if (sec) secChip.innerHTML = `<span>${T('fxSecChip', { a: sec[0] + 1, b: sec[1] + 1 })}</span> ✕`;
    cells.forEach((c, k) => c.classList.toggle('fxoff', !!sec && (k < sec[0] || k > sec[1])));
    if (!sec) { setView(st.last ? 'result' : 'intro'); }
  }

  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const live = (text, cls = '', sub = '') => { liveEl.className = 'fxlive ' + cls; liveEl.replaceChildren(h('b', null, text), sub ? h('span', null, sub) : ''); };
  function setBpm(v) { st.bpm = Math.max(40, Math.min(160, Math.round(v))); bpmOut.innerHTML = `♩ ${st.bpm}`; store.set('tempo:' + itemId, st.bpm); }
  function paintPrimary() { primary.innerHTML = st.playing ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('fxStart')}</span>`; }
  function paintHint() {
    const r = two ? 'Both' : mel ? 'Mel' : rh ? 'Rh' : '';
    footHint.textContent = st.mode === 'listen' ? t('fListenHint' + r) : st.stage === 'rhythm' ? t('fxHintRhythm') : midiOn() ? t('fPlayHint' + r) : t('fPlayHintScreen' + r);
  }
  function paintStreak() {
    streakDots.replaceChildren(...Array.from({ length: CLEAN_TO_PASS }, (_, k) => h('i' + (k < st.streak ? '' : '.off'))));
    streakWord.textContent = T('fxStreak', { k: st.streak, n: CLEAN_TO_PASS }); streakDots.title = streakWord.textContent;
  }
  const guideOn = () => st.mode === 'listen' || !midiOn();

  // ---------- transport ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], ends = [], run = null, seq = [], NS = NB; // ends: bar judgements, due later than the queue's next items
  let exp = [], tally = null, recs = new Map(); // recs: chorus -> { issues, dts } (what the result panel explains)
  const swingOff = () => { const beat = 60 / st.bpm; return st.swing ? beat * 2 / 3 : beat / 2; };
  const tols = () => { const e8 = 60 / st.bpm / 2; return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.16, 0.035), 0.075) }; };
  const rec = (chorus) => { if (!recs.has(chorus)) recs.set(chorus, { issues: [], dts: [], bars: {} }); return recs.get(chorus); };
  function play() {
    if (!audio.ensureAudio() || st.playing) return;
    st.playing = true; screen.classList.add('playing'); paintPrimary();
    st.choruses = 0; if (!st.section) { st.streak = 0; paintStreak(); }
    seq = st.section ? Array.from({ length: st.section[1] - st.section[0] + 1 }, (_, i) => st.section[0] + i) : bars.map((_, k) => k);
    NS = seq.length;
    cells.forEach((c) => { c.classList.remove('ok', 'meh', 'bad', 'cur'); c.querySelector('.fxres').textContent = ''; });
    setView('play'); svgEl.style.visibility = st.stage === 'free' && st.mode === 'play' ? 'hidden' : ''; freeMsg.hidden = !(st.stage === 'free' && st.mode === 'play');
    drawLine(lineOf(seq[0]));
    changeEl.replaceChildren(); changeEl.className = 'fxchange';
    const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += 4 * beat; beatTime = t0; g = 0; run = { t0, beat, swing: st.swing };
    exp = []; tally = createTally(NS); recs = new Map();
    live(t('fxCountIn'), 'count', t('fxCountInS'));
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function schedule() {
    const ahead = audio.now() + 0.15, beat = 60 / st.bpm;
    while (st.playing) {
      const slot = g % PER, li = Math.floor(g / PER) % NS, bar = seq[li], chorus = Math.floor(g / (PER * NS));
      const time = beatTime + (slot % 2 ? swingOff() : 0);
      if (time > ahead) break;
      if (settings.impBeat === 'drums') groove(slot, time, { swing: st.swing, style: form.style, bar: Math.floor(g / PER) }); else if (settings.met && slot % 2 === 0) audio.click(time, slot === 0);
      // right-hand mode: the left hand is the band, always audible (both hands: it is yours, part of barNotes)
      if (rh && !two) lhNotes[bar].filter((e) => e.t === slot).forEach((e) => play1(e.m, time, e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9, 0.35));
      const evs = barNotes[bar].filter((e) => e.t === slot);
      evs.forEach((e) => {
        const dur = e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9;
        if (guideOn()) play1(e.m, time, dur, 0.45);
      });
      if (st.mode === 'play') {
        if (st.stage === 'rhythm') { if (evs.length) exp.push({ t: time, m: null, bar, li, slot, chorus, hit: false }); }
        else evs.forEach((e) => exp.push({ t: time, m: e.m, bar, li, slot, chorus, hit: false }));
      }
      if (slot === 0) queue.push({ t: time, barStart: bar, li, chorus });
      if (slot === PER - 1) ends.push({ t: time + beat + 0.3, barEnd: li, chorus, end: beatTime + beat });
      queue.push({ t: time, g });
      if (slot % 2) beatTime += beat;
      g++;
    }
  }
  function posAt(T0) {
    if (!run) return -1;
    const beats = (T0 - run.t0) / run.beat, w = Math.floor(beats), f = beats - w, sw = run.swing ? 2 / 3 : 0.5;
    return 2 * w + (f < sw ? f / sw : 1 + (f - sw) / (1 - sw));
  }
  function paintBeat(slot, bar) {
    const on = new Set(onsets[bar].filter((s) => s % 2 === 0).map((s) => s >> 1));
    const offs = onsets[bar].some((s) => s % 2);
    beatCells.forEach((c, b) => { c.className = (b === slot >> 1 ? 'cur ' : '') + (on.has(b) ? 'press' : ''); });
    counterLbl.textContent = t('fxCount');
    pressLbl.textContent = offs ? t('fxPressEighths') : T('fxPressOn', { list: [...on].map((b) => b + 1).join(ru ? ' и ' : ' and ') });
  }
  function paintChange(bar, li) {
    const nli = (li + 1) % NS, nb = seq[nli];
    if (NS > 1 && bars[nb] !== bars[bar]) {
      let move = '';
      if (!rh && lhNotes[bar].length && lhNotes[nb].length) {
        const lowName = (list) => { const e = list.reduce((a, b) => (b.m < a.m ? b : a)); return e.name || midiToName(e.m); };
        const d = dia(lowName(lhNotes[nb])) - dia(lowName(lhNotes[bar]));
        move = ' ' + (d === 0 ? t('fxMoveSame') : T(d > 0 ? 'fxMoveR' : 'fxMoveL', { n: keysW(Math.abs(d)) }));
      }
      changeEl.className = 'fxchange on';
      changeEl.innerHTML = `${ICON.next || ''}<span><b>${T('fxChangeIn', { c: bars[nb] })}</b>${move}</span>`;
    } else { changeEl.className = 'fxchange'; changeEl.innerHTML = `<span>${T('fxNowChord', { c: bars[bar] })}</span>`; }
  }
  function tick() {
    const now = audio.now();
    if (st.mode === 'play') expire(now);
    while (ends.length && ends[0].t <= now) { const q = ends.shift(); finishBar(q.barEnd, q.chorus); }
    while (queue.length && queue[0].t <= now) {
      const q = queue.shift();
      if (q.ci !== undefined) { beatCells.forEach((c, b) => { c.className = b === q.ci - 1 ? 'cur count' : ''; }); counterLbl.textContent = t('fxCountInW'); pressLbl.textContent = ''; continue; }
      if (q.barStart !== undefined) {
        cells.forEach((c, k) => c.classList.toggle('cur', k === q.barStart)); keepInView(q.barStart);
        if (q.li === 0) cells.forEach((c) => { c.classList.remove('ok', 'meh', 'bad'); c.querySelector('.fxres').textContent = ''; });
        if (lineOf(q.barStart) !== lineAt) drawLine(lineOf(q.barStart));
        paintChange(q.barStart, q.li);
        continue;
      }
      if (q.g !== undefined) {
        const slot = q.g % PER, bar = seq[Math.floor(q.g / PER) % NS];
        showKeys(bar, slot); paintBeat(slot, bar);
        if (staff && st.stage !== 'free') staff.setCursor((bar - lineAt) * PER + slot);
        markActive();
      }
    }
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    // Stop right after the last note of a chorus still counts that chorus: a bar already over but not yet judged (its
    // barEnd waits one beat + 0.3 s), and the bar in progress once its last note is due, are judged now with what was played
    if (st.playing && st.mode === 'play' && run) {
      const now = audio.now();
      const judge = (chorus, li) => {
        exp = exp.filter((x) => { if (x.chorus !== chorus || x.li !== li) return true; if (!x.hit) missed(x); return false; });
        finishBar(li, chorus);
      };
      ends.filter((q) => q.end <= now).forEach((q) => judge(q.chorus, q.barEnd));
      const p = posAt(now);
      if (p >= 0) {
        const at = chorusBarAt(p, NS, PER), lastSlot = Math.max(-1, ...barNotes[seq[at.bar]].map((e) => e.t));
        if (Math.floor(p) % PER >= lastSlot) judge(at.chorus, at.bar);
      }
    }
    clearInterval(timer); cancelAnimationFrame(raf); queue = []; ends = [];
    const was = st.playing; st.playing = false; run = null; exp = [];
    screen.classList.remove('playing');
    if (was) { audio.hush(); silence(); }
    cells.forEach((c) => c.classList.remove('cur'));
    beatCells.forEach((c) => { c.className = ''; });
    kb.show(none, none, 'both');
    idle(); paintPrimary();
    if (was) { if (st.last) { paintResult(); setView('result'); } else setView('intro'); }
  }

  // ---------- scoring ----------
  const staffIdx = (x) => (lineOf(x.bar) === lineAt ? (x.bar - lineAt) * PER + x.slot : -1);
  function markNote(x, cls, word) {
    const i = staffIdx(x); if (i < 0 || !staff) return;
    // a dense bar (more than two notes) has no room for words under the notes: signs instead
    if (word && onsets[x.bar].length > 2) word = word === t('fxTMiss') ? '✗' : word === t('fxTEarly') ? '←' : word === t('fxTLate') ? '→' : word;
    staff.mark(i, cls); if (word) staff.tag(i, word, cls, handOf());
  }
  function missed(x) {
    tally.add(x.chorus, x.li, 'miss');
    rec(x.chorus).issues.push({ bar: x.bar, slot: x.slot, kind: 'miss' });
    markNote(x, 'bad', t('fxTMiss'));
  }
  function input(m, ts) {
    markActive();
    if (!st.playing || st.mode !== 'play') return;
    const T0 = audio.toAudioTime(ts), { win, tight } = tols();
    let best = null;
    for (const x of exp) { if (x.hit || (x.m !== null && x.m !== m)) continue; const dt = T0 - x.t; if (Math.abs(dt) <= win && (!best || Math.abs(dt) < Math.abs(T0 - best.t))) best = x; }
    if (!best) {
      if (st.stage === 'rhythm') { if (exp.length && T0 >= exp[0].t - win) live(t('fxExtra'), 'meh', t('fxExtraS')); return; } // an extra tap: a nudge, not a slip
      if (!exp.length || T0 < exp[0].t - win) return; // before the first note: ignore
      // the note it was meant to be: the nearest expected one in time; the slip is charged to its bar (a wrong key a bit
      // early on «1» belongs to the new bar, not the old one), else to the chorus and bar of its position
      let near = null; for (const x of exp) if (!near || Math.abs(T0 - x.t) < Math.abs(T0 - near.t)) near = x;
      if (near && Math.abs(T0 - near.t) > 2 * win) near = null;
      const at = near ? { chorus: near.chorus, bar: near.li } : chorusBarAt(posAt(T0), NS, PER), bar = seq[at.bar];
      tally.add(at.chorus, at.bar, 'bad'); kb.flash(m, 'bad');
      rec(at.chorus).issues.push({ bar, slot: near ? near.slot : 0, kind: 'wrong', m, want: near ? near.m : null });
      if (near) markNote(near, 'bad', '✗');
      live(t('fxWrong'), 'bad', near && near.m !== null ? T(m > near.m ? 'fxWrongR' : 'fxWrongL', { n: keysW(Math.abs(m - near.m)) }) : '');
      return;
    }
    best.hit = true;
    const dt = T0 - best.t, cls = Math.abs(dt) <= tight ? 'ok' : 'meh';
    tally.add(best.chorus, best.li, cls);
    const r = rec(best.chorus); r.dts.push(dt);
    if (cls === 'meh') r.issues.push({ bar: best.bar, slot: best.slot, kind: dt < 0 ? 'early' : 'late', dt });
    kb.flash(m, cls);
    markNote(best, cls, cls === 'ok' ? '✓' : t(dt < 0 ? 'fxTEarly' : 'fxTLate'));
    if (cls === 'ok') live(t('fxOk'), 'ok'); else live(t(dt < 0 ? 'fxEarly' : 'fxLate'), 'meh', `${Math.round(Math.abs(dt) * 1000)} ${t('ms')} · ${t(dt < 0 ? 'fxEarlyS' : 'fxLateS')}`);
  }
  function expire(now) {
    const { win } = tols();
    while (exp.length && (exp[0].hit || exp[0].t + win < now)) { const x = exp.shift(); if (!x.hit) { missed(x); live(t('fxMiss'), 'bad', T('fxMissS', { beat: beatWord(x.slot, ru ? 'и' : 'and') })); } }
  }
  function paintCell(bar, cls) {
    const c = cells[bar]; c.classList.remove('ok', 'meh', 'bad'); if (cls) c.classList.add(cls);
    c.querySelector('.fxres').textContent = cls === 'ok' ? '✓' : cls === 'meh' ? '~' : cls === 'bad' ? '✗' : '';
  }
  function finishBar(li, chorus) {
    const s = tally.takeBar(chorus, li), bar = seq[li];
    const cls = s.miss + s.bad === 0 ? (s.meh ? 'meh' : 'ok') : 'bad';
    if (st.mode === 'play') { paintCell(bar, cls); rec(chorus).bars[bar] = cls; }
    if (li === NS - 1) finishChorus(chorus);
  }
  function finishChorus(chorus) {
    st.choruses = chorus + 1;
    const s = tally.takeChorus(chorus); // only this chorus's notes, even if the next one has begun
    if (st.mode !== 'play') return;
    const r = rec(chorus); recs.delete(chorus);
    const total = s.ok + s.meh + s.miss, slips = s.miss + s.bad, maxSlips = maxSlipsOf(), clean = slips <= maxSlips && total > 0;
    st.last = { chorus, total, slips, maxSlips, clean, ok: s.ok + s.meh, issues: r.issues, dts: r.dts, bars: r.bars, section: st.section, stage: st.stage, tight: tols().tight, win: tols().win };
    if (st.section) { // a practice loop: no streak, no pass
      const [a, b] = st.section;
      live(clean ? T('fxSecClean', { a: a + 1, b: b + 1 }) : T('fxSecSlips', { a: a + 1, b: b + 1, s: slips, err: errW(slips) }), clean ? 'ok' : 'bad');
      return;
    }
    st.streak = clean ? st.streak + 1 : 0;
    paintStreak();
    updateEx(itemId, (p) => ({ ...p, choruses: (p.choruses || 0) + 1, cleanChoruses: (p.cleanChoruses || 0) + (clean ? 1 : 0), bestStreak: Math.max(p.bestStreak || 0, st.streak), bestTempo: clean && st.stage !== 'rhythm' ? Math.max(p.bestTempo || 0, st.bpm) : p.bestTempo || 0 }));
    logDay({ choruses: 1, cleanChoruses: clean ? 1 : 0 });
    let msg = clean ? T('fxChClean', { k: chorus + 1 }) : T('fxChSlips', { k: chorus + 1, s: slips, err: errW(slips) });
    if (st.streak >= CLEAN_TO_PASS) {
      const key = STAGE_KEY[st.stage], first = !(exProgress(itemId).stages || {})[key];
      updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, [key]: true } }));
      if (st.stage === 'notes') scheduleReview(itemId, true);
      msg = t(first ? 'fxPassed_' + st.stage : 'fPassedAgain');
      st.last.passed = st.stage; paintStages();
    } else if (!clean && st.stage === 'notes' && wasDue && st.choruses >= CLEAN_TO_PASS) scheduleReview(itemId, false);
    live(msg, clean ? 'ok' : 'bad', clean ? '' : t('fxSeeStop'));
  }

  // ---------- the result of the last chorus ----------
  function paintResult() {
    const r = st.last; if (!r) return;
    cells.forEach((c, k) => paintCell(k, r.bars[k] || ''));
    const sec = r.section;
    const head = sec ? (r.slips ? T('fxSecSlips', { a: sec[0] + 1, b: sec[1] + 1, s: r.slips, err: errW(r.slips) }) : T('fxSecClean', { a: sec[0] + 1, b: sec[1] + 1 })) : r.passed ? t('fxPassed_' + r.passed) : r.clean ? (r.slips ? T('fxCleanWith', { s: r.slips, err: errW(r.slips) }) : t('fxClean')) : r.slips <= r.maxSlips + 2 ? T('fxAlmost', { s: r.slips, err: errW(r.slips), k: r.maxSlips }) : T('fxMany', { s: r.slips, err: errW(r.slips) });
    const sb = slipBars(r.issues);
    const where = sb.length === 1 ? T('fxWhereOne', { b: sb[0].bar + 1 }) : sb.length ? T('fxWhereMany', { list: sb.map((x) => x.bar + 1).join(', ') }) : r.clean ? t('fxCleanS') : '';
    // bar results stay on the strip
    const fix = [];
    sb.slice(0, 3).forEach(({ bar, list }) => {
      const x = list[0], c = bars[bar], isChange = chg.includes(bar + 1);
      let title, text;
      if (x.kind === 'wrong') {
        title = T('fxIWrongT', { b: bar + 1, c });
        text = x.want !== null && x.want !== undefined ? T(x.m > x.want ? 'fxIWrongR' : 'fxIWrongL', { n: keysW(Math.abs(x.m - x.want)) }) : '';
      } else { title = T('fxIMissT', { b: bar + 1, c }); text = T('fxIMissS', { beat: beatWord(x.slot, ru ? 'и' : 'and') }); }
      if (list.length > 1) text += ' ' + T('fxIMore', { n: list.length - 1 });
      if (isChange) text += ' ' + t('fxIChange');
      fix.push(h('div.fxissue', null, h('span.fxbadge.bad', null, String(bar + 1)), h('div', null, h('b', null, title), h('span', null, text))));
    });
    if (fix.length < 3) { // timing: the bars where most presses were off the beat
      const tm = new Map(); r.issues.filter((x) => x.kind === 'early' || x.kind === 'late').forEach((x) => { const v = tm.get(x.bar) || []; v.push(x); tm.set(x.bar, v); });
      [...tm.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3 - fix.length).forEach(([bar, list]) => {
        const early = list.filter((x) => x.kind === 'early').length >= list.length / 2, ms = Math.round(list.reduce((a, x) => a + Math.abs(x.dt), 0) / list.length * 1000);
        fix.push(h('div.fxissue', null, h('span.fxbadge.meh', null, String(bar + 1)), h('div', null, h('b', null, T(early ? 'fxIEarlyT' : 'fxILateT', { b: bar + 1, c: bars[bar] })), h('span', null, T('fxITimeS', { ms }) + ' ' + t(early ? 'fxEarlyS' : 'fxLateS')))));
      });
    }
    if (!fix.length) fix.push(h('p.muted', null, t('fxNothing')));
    // timing spread: each hit as a dot between «early» and «late»
    const lim = r.win, dots = r.dts.map((d) => {
      const x = 50 + Math.max(-1, Math.min(1, d / lim)) * 46, cls = Math.abs(d) <= r.tight ? 'ok' : d < 0 ? 'early' : 'late';
      return h('i.' + cls, { style: `left:${x}%` });
    });
    const tend = tendency(r.dts, r.tight);
    const loop = sec ? null : loopWindow(sb.map((x) => x.bar), NB);
    const tip = r.passed === 'rhythm' ? t('fxTipNotes') : sec ? (r.clean ? t('fxTipBack') : t('fxTipSlower')) : r.clean ? t('fxTipAgain') : loop ? T('fxTipLoop', { a: loop[0] + 1, b: loop[1] + 1 }) : t('fxTipSlower');
    const btns = [];
    if (sec) btns.push(h('button.btn.fxghost', { type: 'button', onclick: () => { setSection(null); play(); } }, t('fxWholeBtn')), h('button.btn.fxcta', { type: 'button', onclick: () => play() }, T('fxSecAgain', { a: sec[0] + 1, b: sec[1] + 1 })));
    else if (r.passed === 'rhythm') btns.push(h('button.btn.fxcta', { type: 'button', onclick: () => setStage('notes') }, T('fxToStage', { s: t('fxSt_notes') })));
    else {
      if (loop && !r.clean) btns.push(h('button.btn.fxghost', { type: 'button', onclick: () => play() }, t('fxWholeBtn')), h('button.btn.fxcta', { type: 'button', onclick: () => { setSection(loop); play(); } }, T('fxLoopBtn', { a: loop[0] + 1, b: loop[1] + 1 })));
      else btns.push(h('button.btn.fxcta', { type: 'button', onclick: () => play() }, t('fxAgainBtn')));
    }
    resultEl.replaceChildren(
      h('div.fxreshead', null,
        h('div.fxcol', null, h('span.kicker', null, sec ? T('fxSecChip', { a: sec[0] + 1, b: sec[1] + 1 }).toUpperCase() : T('fxResW', { k: r.chorus + 1 })), h('h2.fxgoal', null, head), h('span.muted', null, where)),
        h('div.fxscore' + (r.clean ? '.ok' : ''), null, h('b', null, `${Math.max(0, r.total - r.slips)}`, h('small', null, ` / ${r.total}`)), h('span', null, t('fxScoreS')))),
      h('div.fxresgrid', null,
        h('div.fxcol', null, h('span.kicker', null, t('fxFixW')), ...fix),
        h('div.fxcol', null, h('span.kicker', null, t('fxTimingW')),
          h('div.fxspread', null, h('span.fxzone'), h('span.fxmid'), ...dots),
          h('div.fxspreadl', null, h('span.early', null, t('fxEarlyL')), h('span.ok', null, t('fxOnBeat')), h('span.late', null, t('fxLateL'))),
          h('span', null, t('fxTend_' + tend)))),
      h('div.fxtipbar', null, h('div.fxcol', null, h('span.kicker', null, t('fxTipW')), h('b', null, tip)), ...btns));
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => { if (e.type === 'on') { kb.down(e.note, true); input(e.note, e.ts); } else kb.down(e.note, false); });
  const onKey = (e) => { if (e.code === 'Space' && !e.target.closest('input,select,textarea,summary')) { e.preventDefault(); if (st.playing) stop(); else play(); } };
  document.addEventListener('keydown', onKey);

  setBpm(st.bpm); secChip.hidden = true; setStage(st.stage);
  updateEx(itemId, (p) => p);

  return () => { if (footRO) footRO.disconnect(); if (st.playing) stop(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
