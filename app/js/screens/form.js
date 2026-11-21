// Form screen: the whole 12-bar blues on a loop with drums. You play the left-hand pattern through the form,
// the app scores every note and counts clean choruses. Three clean choruses in a row pass the item.
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
// Screen: while stopped a task block says what to play and how it is passed; the «Now / Next» strip shows the bar that
// sounds with its notes under the eight eighth slots (one row per hand that is yours) and the next bar; the keyboard shows
// the hand position of a bar ahead of time: every key of the bar tinted with its finger, the next note strong
// (music/formview.js keyPlan). The next note moves on when it is hit or its window passes; after the last note of a bar
// the keyboard already shows the next bar with notes, while the strip follows the bar that sounds.
// Two stages (header, like the lick screen): 1 «Ноты» walks the form without tempo — no drums, no clock: the screen shows
// the next event (all your notes at one eighth slot, both hands together) strong on the keys and on the strip, waits until
// all its keys are pressed (any order) and moves on; a wrong key counts a slip and says where the right one is. One form
// with at most maxSlips slips passes it (stages.notes). 2 «В темпе» is the transport and scoring above; only it writes
// choruses, cleanChoruses, bestStreak, bestTempo, stages.done, the review and the day log. A due review opens stage 2;
// otherwise the stage last chosen for the item (formStage:<id>), else the first not passed. Stage 2 is never locked.
// Staff (footer switch «Ноты: вкл / выкл», settings.formStaffRh / formStaffLh, on by default for a right-hand part, off for a
// left-hand pattern alone and comping): the bar that sounds and the next one on a staff, drawn from the same per-bar notes as
// the strip (music/formview.js staffBars), with your hands only; a phone shows one staff (the right hand when there is one).
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L, plural, getLang } from '../i18n.js';
import { nameMode, nameInText } from '../music/names.js';
import { markTerms } from '../glossary.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview, reviews, logDay } from '../store.js';
import { noteName, midiToName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import { createStaff } from '../music/staff.js';
import { normalize } from '../music/exercise.js';
import { patternBars, compBars, lickBars, melodyBarNotes, rhRoot, parseChord, patSpell, barChords, iivPairs, lickOverKey } from '../music/forms.js';
import { groove } from '../music/drums.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';
import { decorateFunctions } from '../fnlabels.js';
import { createTally, chorusBarAt } from '../music/tally.js';
import { taskMode, phraseStarts, fmtBars, keyPlan, stripRow, barSummary, staffBars, walkTarget, eventKeys, walkPress, walkPassed, openStage } from '../music/formview.js';
import { keyHint } from '../music/lickfb.js';

const PER = 8;
const CLEAN_TO_PASS = 3; // clean choruses in a row
const SLIP_PER = 40; // one allowed slip per this many notes in a chorus (at least 1)

export function renderForm(root, { track, itemId, item, form, pattern, lick, licks, keyLicks, melody, back }) {
  const settings = { met: true, names: 'en', pianoSnd: true, impBeat: 'drums', ...store.get('settings', {}) };
  const names = nameMode(settings, 'short'); // the strip, the grid and the wrong-note text name notes even with names 'off'; 'both' → letters (narrow)
  const namesT = nameMode(settings, 'text');
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
  const kAt = Object.fromEntries(kPairs.map((p) => [p.bars[0], p])); // first bar of a pair -> the pair
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
  const kWord = (p) => (kl.length < 2 ? t('phraseW') : p.lick.role === 'question' ? t('questionW') : p.lick.role === 'answer' ? t('answerW') : t('phraseW'));
  const lickWord = (k) => !pair ? t('lickW') : lickAt(k).role === 'question' ? t('questionW') : lickAt(k).role === 'answer' ? t('answerW') : (k / 2) % 2 === 0 ? t('questionW') : t('answerW');
  // what you play (expected + keyboard); both hands: the two merged per bar (a same pitch on the same slot counts once)
  const merge = (a, b) => { const seen = new Set(); return [...a, ...b].filter((e) => { const k = e.t + ':' + e.m; if (seen.has(k)) return false; seen.add(k); return true; }); };
  const barNotes = two ? bars.map((_, k) => merge(lhNotes[k], rhNotes[k])) : rh ? rhNotes : lhNotes;
  const maxSlips = Math.max(1, Math.round(barNotes.flat().length / SLIP_PER)); // misses + wrong notes allowed in a clean chorus
  const st = { mode: 'play', bpm: store.get('tempo:' + itemId, form.tempo || 66), swing: !!form.swing && form.style !== 'bossa', playing: false, streak: 0, choruses: 0 };
  const wasDue = reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date();
  // stages: notes = stage 1 passed (or the item already done), tempo = the item done (3 clean choruses in a row)
  const STAGES = ['notes', 'tempo'];
  const prog = () => { const s = exProgress(itemId).stages || {}; return { notes: !!(s.notes || s.done), tempo: !!s.done }; };
  st.stage = openStage({ due: !!wasDue, saved: store.get('formStage:' + itemId, null), prog: prog() });
  const midiOn = () => midiState().connected;

  // ---------- layout ----------
  const stageBtn = (sid, n) => h('button', { type: 'button', 'data-stage': sid, onclick: () => setStage(sid) }, h('span.num', null, String(n)), t('fvSt_' + sid));
  const stages = h('nav.seg.stages', { 'aria-label': t('lqStages') }, ...STAGES.map((sid, k) => stageBtn(sid, k + 1)));
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('formUpper')}`), h('span.title', null, L(item.title || form.title))),
    h('div.grow'), stages, h('div.grow'), sessionChip(itemId), h('span.chordchip', null, (two ? t('bothHandsChip') + ' · ' : '') + (comp ? L(pattern.title) : mel ? L(mel.title) : kl ? (kl.length > 1 ? t('qaChip') : L(kl[0].title)) : rh ? (pair ? t('qaChip') : L(rhLicks[0].title)) : L(pattern.title))), midiChip(), themeButton());
  const fbEl = h('span.fb', { 'aria-live': 'polite' });
  const chorusEl = h('span.barno'), streakEl = h('div.loops', { 'aria-label': t('cleanChoruses') });
  const cells = bars.map((c, k) => {
    const lh = rh ? rhNotes[k] : lhNotes[k]; // the cell label shows the right-hand part when there is one
    const uniq = [...new Map(lh.map((e) => [e.m, e])).values()].sort((a, b) => a.m - b.m);
    const label = comp ? [...new Set(lh.map((e) => e.name))].map((n) => noteName(n, names)).join(' · ') : mel ? (lh.length ? noteName(lh[0].name, names) : '—') : kl ? (kAt[k] ? `${kWord(kAt[k])} · ${kAt[k].key}` : '') : rh ? (k % 2 === 0 ? `${lickWord(k)} · ${noteName((() => { const ch = parseChord(barChords(c)[0]); return patSpell(rhRoot(ch), 0, ch, !!form.flats); })(), names)}` : '') : uniq.map((e) => noteName(patSpell(e.m, e.deg, parseChord(e.chord || c), !!form.flats), names)).join(' · ');
    return h('div.fcell', { 'data-bar': k }, h('span.fno', null, String(k + 1)), h('b.fchord', null, c),
      h('small.fnotes' + (rh ? '.rh' : ''), null, label),
      h('div.fbeats', null, ...Array.from({ length: 4 }, () => h('i'))));
  });
  const grid = h('div.fgrid' + (NB > 16 ? '.long' : ''), null, ...cells);
  decorateFunctions(cells, bars); // ii · V · I under the chords, a bracket over each ii–V–I
  // a long form (or 16 bars on a short screen while playing) scrolls inside its grid: keep the current bar visible
  const keepInView = (k) => { const c = cells[k]; if (!c || grid.scrollHeight <= grid.clientHeight + 1) return; if (c.offsetTop < grid.scrollTop || c.offsetTop + c.offsetHeight > grid.scrollTop + grid.clientHeight) grid.scrollTop = Math.max(0, c.offsetTop - 8); };
  // ---------- task block (while stopped) ----------
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m));
  const tm = taskMode({ rh, two, comp, mel, kl, pair });
  const roleOf = (k) => (!pair ? null : lickAt(k).role === 'question' || lickAt(k).role === 'answer' ? lickAt(k).role : (k / 2) % 2 === 0 ? 'question' : 'answer');
  const starts = rh && !comp && !mel && !kl ? phraseStarts(rhNotes, roleOf) : null;
  const kBars = kPairs.filter((p) => p.bars.some((b) => (rhNotes[b] || []).length)).map((p) => `${p.bars[0] + 1}–${p.bars[1] + 1}`);
  const partVars = { bars: tm.mode === 'key' || tm.sub === 'key' ? fmtBars(kBars) : starts ? fmtBars(starts.all) : '', q: starts ? fmtBars(starts.q) : '', a: starts ? fmtBars(starts.a) : '' };
  const PART = { lick: 'Lick', qa: 'Qa', key: 'Key', mel: 'Mel' };
  const headline = tm.mode === 'lh' ? t('fvLh') : tm.mode === 'comp' ? t('fvComp')
    : tm.mode === 'both' ? fill(t('fvBoth'), { rh: fill(t('fvBoth' + PART[tm.sub]), partVars) }) : fill(t('fv' + PART[tm.mode] + (tm.mode === 'key' && kl.length > 1 ? 'Qa' : '')), partVars);
  const ownAbout = L(item.about || form.about);
  const abouts = (tm.mode === 'lh' || tm.mode === 'both' || tm.mode === 'comp' ? [L(pattern.about)] : []).concat(ownAbout && ownAbout !== L(pattern.about) ? [ownAbout] : []).filter(Boolean);
  const slipsTxt = `${maxSlips} ${plural(maxSlips, 'fvPassSlips')}`;
  const ruleText = { notes: fill(t('fvRule_notes'), { s: slipsTxt }), tempo: fill(t('fvPass'), { n: CLEAN_TO_PASS, c: plural(CLEAN_TO_PASS, 'fvChorusW'), s: slipsTxt }) };
  const ruleRows = STAGES.map((sid, k) => h('div.lqrule.fvrule', { 'data-stage': sid }, h('b.n', null, String(k + 1)), h('div', null, h('b', null, t('fvSt_' + sid) + '. '), ruleText[sid])));
  const taskEl = h('div.fvtask', null,
    h('div.fvgoal', null, h('span.fvlabel', null, t('fvTask')), h('h3', null, headline), ...abouts.map((a) => h('p', null, markTerms(a)))),
    h('div.fvrules', null, h('span.fvlabel', null, t('fvHow')), ...ruleRows,
      h('p', null, t('fvLook'))));

  // ---------- now / next strip ----------
  const flats = !!form.flats;
  const lhSpell = (k, e) => patSpell(e.m, e.deg, parseChord(e.chord || barChords(bars[k])[0]), flats); // with the octave: 'Bb2'
  const rhSpell = (e) => e.name || midiToName(e.m);
  const lhName = (k) => (e) => noteName(lhSpell(k, e), names);
  const rhName = (e) => noteName(rhSpell(e), names);
  const handRows = [rh ? 'rh' : null, !rh || two ? 'lh' : null].filter(Boolean); // the hands that are yours, right above left
  const notesOf = (hd, k) => (hd === 'rh' ? rhNotes[k] : lhNotes[k]) || [];
  const nameFor = (hd, k) => (hd === 'rh' ? rhName : lhName(k));
  const nowLabel = h('span.fvlabel'), nowChord = h('b.fvchord'), countEl = h('b.fvcount', { 'aria-hidden': 'true' });
  const slotHeads = Array.from({ length: PER }, (_, s) => h('span' + (s % 2 ? '.and' : ''), null, s % 2 ? t('fvAnd') : String(s / 2 + 1)));
  const rowEls = handRows.map((hd) => h('div.fvrow.fv-' + hd));
  const nowCard = h('div.fvnow', null,
    h('div.fvhead', null, nowLabel, nowChord, countEl),
    h('div.fvbeats', null, h('div.fvrow.fvslots', null, ...slotHeads), ...rowEls));
  const nextLabel = h('span.fvlabel', null, t('fvNext')), nextChord = h('b.fvchord'), nextNotes = h('span.fvnotes');
  const nextCard = h('div.fvnext', null, nextLabel, nextChord, nextNotes);
  const strip = h('div.fvstrip', null, nowCard, nextCard);
  // ---------- staff: the bar that sounds and the next one ----------
  const staffKey = rh && !comp ? 'formStaffRh' : 'formStaffLh'; // a melody / lick / phrase part: on by default; a pattern alone, comping: off
  let staffOn = typeof settings[staffKey] === 'boolean' ? settings[staffKey] : staffKey === 'formStaffRh';
  const staffSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  staffSvg.setAttribute('class', 'staff'); staffSvg.setAttribute('role', 'img'); staffSvg.setAttribute('aria-label', t('fvStaffAria'));
  const staffBox = h('div.fvstaff', null, staffSvg);
  const walkMsg = h('div.fvmsg', { 'aria-live': 'polite' }); // stage «Ноты»: the wrong-key hint, the result of a walk
  const live = h('div.fvlive', null, strip, walkMsg, staffBox); // phone: one sticky block while playing
  const phoneMq = window.matchMedia('(max-width: 640px)');
  const staffNames = nameMode(settings, 'key');
  const staffHands = { rh: rh ? rhNotes : null, lh: !rh || two ? lhNotes : null };
  const staffSpell = (hd, k, e) => (hd === 'rh' ? rhSpell(e) : lhSpell(k, e));
  const staffWin = new Map(); // first bar -> normalized 2-bar exercise (built once, off the hot path after the first use)
  const winEx = (k) => { if (!staffWin.has(k)) { const ex = normalize(staffBars(staffHands, k, staffSpell)); ex.dyn = []; staffWin.set(k, ex); } return staffWin.get(k); };
  let staff = null, staffK = -1, staffMode = '';
  /** one staff on a phone (the right hand when it is yours), both staves when both hands are yours on a wider screen */
  const stavesNow = () => (phoneMq.matches ? (rh ? 't' : 'b') : rh && two ? 'both' : rh ? 't' : 'b');
  function drawStaff(k) {
    if (!staffOn) return;
    const mode = stavesNow();
    if (k === staffK && mode === staffMode && staff) return;
    staffK = k; staffMode = mode;
    staff = createStaff(staffSvg, winEx(k), { names: staffNames, staves: mode });
    const vb = staffSvg.getAttribute('viewBox').split(' ').map(Number);
    staffSvg.style.aspectRatio = `${vb[2]} / ${vb[3]}`;
    staffBox.dataset.staves = mode;
  }
  const curShown = () => (st.playing ? !nowFirst : st.stage === 'notes' && !!walk && !walk.over); // a slot is lit on the strip
  function staffCursor(slot) {
    if (!staff) return;
    staffSvg.classList.toggle('nocur', slot < 0);
    if (slot >= 0) staff.setCursor(slot);
  }
  function paintStaffOn() {
    staffBox.hidden = !staffOn; panel.classList.toggle('fvstaffon', staffOn);
    staffTg.setAttribute('aria-pressed', String(staffOn)); staffTg.textContent = t(staffOn ? 'fvStaffOn' : 'fvStaffOff');
    if (staffOn) { staffK = -1; drawStaff(Math.max(0, nowBar)); staffCursor(curShown() ? curSlot : -1); }
  }
  /** Phone: the keyboard sticks above the footer; scroll just enough for the strip (and the staff) to sit above it. */
  function bringLiveUp() {
    if (!phoneMq.matches) return;
    const r = live.getBoundingClientRect(), kp = kbPanel.getBoundingClientRect();
    const d = Math.min(r.bottom - kp.top + 6, r.top - 4);
    if (d > 2) window.scrollTo({ top: window.scrollY + d, behavior: 'instant' });
  }
  const onPhone = () => { if (staffOn) { staffK = -1; drawStaff(Math.max(0, nowBar)); staffCursor(curShown() ? curSlot : -1); } };
  phoneMq.addEventListener('change', onPhone);
  let nowBar = -1, nowFirst = false; // nowFirst: the stopped / count-in view of bar 1
  function renderNow(k, first = false) {
    nowBar = k; nowFirst = first;
    nowLabel.textContent = `${t('fvNow')} · ${first ? t('fvFirst') : `${t('fvBar')} ${k + 1}`}`;
    nowChord.textContent = bars[k];
    drawStaff(k);
    handRows.forEach((hd, i) => {
      const row = stripRow(notesOf(hd, k), nameFor(hd, k));
      if (!row.some((c) => c && !c.hold)) { rowEls[i].replaceChildren(h('span.fvrest', null, t('fvRest') + (hd === 'rh' && !two ? ' · ' + t('fvListenLh') : ''))); return; }
      rowEls[i].replaceChildren(...row.map((c) => (!c ? h('span') : c.hold ? h('span.hold') : h('span.on' + (c.names.length > 2 ? '.many' : ''), null,
        ...c.names.map((n, j) => h('b', null, n, c.f[j] ? h('sup', null, String(c.f[j])) : null))))));
    });
    paintSlot(-1);
  }
  function renderNext(k) {
    const nb = (k + 1) % NB;
    nextChord.textContent = bars[nb];
    const evs = handRows.flatMap((hd) => notesOf(hd, nb).map((e) => ({ t: e.t, m: e.m, n: nameFor(hd, nb)(e) })));
    const list = barSummary(evs, (e) => e.n);
    nextNotes.textContent = list.length ? list.join(' · ') : t('fvRest');
  }
  let curSlot = -1;
  function paintSlot(slot) { curSlot = slot; staffCursor(slot); [slotHeads, ...rowEls.map((r) => [...r.children])].forEach((cs) => cs.forEach((c, s) => c.classList.toggle('cur', s === slot))); }
  function showFirst() { renderNow(0, true); renderNext(0); countEl.textContent = ''; }

  const panel = h('section.panel.formpanel', null,
    h('div.staffhead', null, chorusEl, streakEl, h('div.grow'), fbEl),
    taskEl, live,
    grid);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const bpmOut = h('output.bpm');
  const tempoBox = h('div.stepper', null,
    h('button', { type: 'button', 'aria-label': t('slower'), onclick: () => setBpm(st.bpm - 4) }, '−'), bpmOut,
    h('button', { type: 'button', 'aria-label': t('faster'), onclick: () => setBpm(st.bpm + 4) }, '+'));
  const modeSeg = seg([['play', t('fPlay')], ['listen', t('fListen')]], st.mode, (v) => { if (st.playing) stop(); st.mode = v; paintHint(); }, 'rMode');
  const swingSeg = seg([['straight', t('straight')], ['swing', t('swing')]], st.swing ? 'swing' : 'straight', (v) => { st.swing = v === 'swing'; }, 'eighths');
  const beatSeg = seg([['drums', t('drums')], ['click', t('metronome')]], settings.impBeat, (v) => { settings.impBeat = v; store.set('settings', { ...store.get('settings', {}), impBeat: v }); }, 'backing');
  const staffTg = h('button', { type: 'button', onclick: () => {
    staffOn = !staffOn; settings[staffKey] = staffOn; store.set('settings', { ...store.get('settings', {}), [staffKey]: staffOn }); paintStaffOn();
  } });
  const staffSeg = h('div.seg.fvstaffseg', { role: 'group', 'aria-label': t('fvStaffAria') }, staffTg);
  const footHint = h('span.foothint');
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => { if (st.stage === 'notes') { walkReset(); walkPaint(); } else if (st.playing) stop(); else play(); } });
  const listenBar = h('button.btn.ghost.fvlisten', { type: 'button', onclick: () => playBar() }, h('span', { html: ICON.speaker }), h('span', null, t('fvListenBar')));
  const footer = h('footer.actions', null, h('div.footsegs', null, modeSeg, form.style === 'bossa' ? null : swingSeg, beatSeg, staffSeg), tempoBox, listenBar, footHint, h('div.grow'), primary);
  const screen = h('div.exscreen.formscreen.fvscreen', null, header, h('main.ex', null, panel, kbPanel), footer);
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
  const kb = createKeyboard(kbEl, [lo, hi + 5], { names: nameMode(settings, 'key'), onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.5, 0.55); if (!midiOn()) input(m, performance.now()); } });
  // hand position ahead of time: doneG = the last event position that is over (hit or its window passed), -1 = none yet;
  // the target is the first of your events after it, the keyboard shows the target's bar (formview.keyPlan)
  const yours = { rh: rh ? rhNotes : null, lh: !rh || two ? lhNotes : null };
  let doneG = -1, planG = null;
  const slotTimes = new Map(); // event position -> its audio time, once scheduled
  function paintKeys() {
    const p = keyPlan(yours, doneG), key = p ? p.g : -1;
    if (key === planG) return;
    planG = key;
    if (p) kb.plan(p.tint, p.target); else kb.plan({}, {});
  }
  function syncKeys(now) {
    const { win } = tols();
    for (;;) {
      const p = keyPlan(yours, doneG); if (!p) break;
      const tm0 = slotTimes.get(p.g); if (tm0 === undefined) break; // not scheduled yet
      const over = st.mode === 'play' ? !exp.some((x) => x.g === p.g && !x.hit && now <= x.t + win) : now > tm0 + 0.15;
      if (!over) break;
      doneG = p.g; slotTimes.delete(p.g);
    }
    paintKeys();
  }
  function resetKeys() { doneG = -1; slotTimes.clear(); paintKeys(); }

  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const fb = (html) => { fbEl.innerHTML = html; };
  function setBpm(v) { st.bpm = Math.max(40, Math.min(160, Math.round(v))); bpmOut.innerHTML = `♩ ${st.bpm}`; store.set('tempo:' + itemId, st.bpm); }
  function paintPrimary() {
    if (st.stage === 'notes') { primary.innerHTML = `<span>${t('fvRestart')}</span>`; return; }
    primary.innerHTML = st.playing ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`;
  }
  function paintHint() { const r = two ? 'Both' : mel ? 'Mel' : rh ? 'Rh' : ''; footHint.textContent = st.stage === 'notes' ? t('fvHintNotes') : st.mode === 'listen' ? t('fListenHint' + r) : midiOn() ? t('fPlayHint' + r) : t('fPlayHintScreen' + r); }
  function paintStages() {
    const p = prog();
    stages.querySelectorAll('button').forEach((b, k) => {
      const sid = b.dataset.stage;
      b.setAttribute('aria-pressed', String(sid === st.stage)); b.classList.toggle('done', p[sid]);
      b.querySelector('.num').innerHTML = p[sid] ? ICON.check : String(k + 1);
    });
    ruleRows.forEach((r) => { r.classList.toggle('cur', r.dataset.stage === st.stage); r.classList.toggle('done', p[r.dataset.stage]); });
  }
  function startText() { const saved = exProgress(itemId); return saved.cleanChoruses ? `${t('fSoFar')}: ${saved.cleanChoruses} ${t('fCleanOf')} ${saved.choruses}` : t('fStart').replace('{n}', NB); }
  /** keep = opened by the screen (a due review, the saved stage), not chosen: the choice is not stored */
  function setStage(sid, keep) {
    if (st.playing) stop();
    walkReset();
    st.stage = sid; if (!keep) store.set('formStage:' + itemId, sid);
    screen.dataset.fstage = sid;
    [modeSeg, swingSeg, beatSeg, tempoBox].forEach((el) => { el.hidden = sid === 'notes'; }); // no tempo in stage 1; listening is stage 2
    listenBar.hidden = sid !== 'notes'; streakEl.hidden = sid === 'notes';
    paintStages(); paintPrimary(); paintHint();
    if (sid === 'notes') walkPaint();
    else { cells.forEach((c) => c.classList.remove('ok', 'meh', 'bad', 'cur')); planG = null; resetKeys(); showFirst(); paintStreak(); fb(startText()); }
  }
  function paintStreak() {
    streakEl.replaceChildren(...Array.from({ length: CLEAN_TO_PASS }, (_, k) => h('i' + (k < st.streak ? '' : '.off'))));
    chorusEl.textContent = `${t('chorusW')} ${st.choruses + 1}`;
  }
  const guideOn = () => st.mode === 'listen' || !midiOn();

  // ---------- transport ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null;
  let exp = [], tally = null; // tally: hits / misses / wrong notes per chorus and per bar of that chorus (music/tally.js)
  const swingOff = () => { const beat = 60 / st.bpm; return st.swing ? beat * 2 / 3 : beat / 2; };
  const tols = () => { const e8 = 60 / st.bpm / 2; return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.16, 0.035), 0.075) }; };
  function play() {
    if (!audio.ensureAudio() || st.playing) return;
    st.playing = true; screen.classList.add('playing'); paintPrimary();
    panel.scrollTop = 0; bringLiveUp();
    st.streak = 0; st.choruses = 0; paintStreak();
    cells.forEach((c) => c.classList.remove('ok', 'meh', 'bad', 'cur'));
    const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += 4 * beat; beatTime = t0; g = 0; run = { t0, beat, swing: st.swing };
    exp = []; tally = createTally(NB);
    resetKeys(); showFirst();
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function schedule() {
    const ahead = audio.now() + 0.15, beat = 60 / st.bpm;
    while (st.playing) {
      const slot = g % PER, bar = Math.floor(g / PER) % NB, chorus = Math.floor(g / (PER * NB));
      const time = beatTime + (slot % 2 ? swingOff() : 0);
      if (time > ahead) break;
      if (settings.impBeat === 'drums') groove(slot, time, { swing: st.swing, style: form.style, bar: Math.floor(g / PER) }); else if (settings.met && slot % 2 === 0) audio.click(time, slot === 0);
      // right-hand mode: the left hand is the band, always audible (both hands: it is yours, part of barNotes)
      if (rh && !two) lhNotes[bar].filter((e) => e.t === slot).forEach((e) => play1(e.m, time, e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9, 0.35));
      const evs = barNotes[bar].filter((e) => e.t === slot);
      evs.forEach((e) => {
        const dur = e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9;
        if (guideOn()) play1(e.m, time, dur, 0.45);
        if (st.mode === 'play') exp.push({ t: time, m: e.m, bar, chorus, hit: false, g });
      });
      if (evs.length) slotTimes.set(g, time);
      if (slot === 0) queue.push({ t: time, barStart: bar, chorus });
      if (slot === PER - 1) queue.push({ t: time + beat + 0.3, barEnd: bar, chorus, end: beatTime + beat });
      queue.push({ t: time, g });
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
    if (st.mode === 'play') expire(now);
    syncKeys(now);
    // every item that is due, in time order: a bar's judging (one beat + 0.3 s after its end) must not hold back the next bar's slots
    const due = [];
    if (queue.length) queue = queue.filter((q) => (q.t <= now ? (due.push(q), false) : true));
    due.sort((a, b) => a.t - b.t);
    for (const q of due) {
      if (q.ci !== undefined) { fb(`${t('countInLabel')}: <b>${q.ci}</b>`); countEl.textContent = String(q.ci); continue; }
      if (q.barStart !== undefined) { cells.forEach((c, k) => c.classList.toggle('cur', k === q.barStart)); cells[q.barStart].classList.remove('ok', 'meh', 'bad'); keepInView(q.barStart); if (q.barStart === 0) { cells.forEach((c) => c.classList.remove('ok', 'meh', 'bad')); } continue; }
      if (q.barEnd !== undefined) { finishBar(q.barEnd, q.chorus); continue; }
      if (q.g !== undefined) { const slot = q.g % PER, bar = Math.floor(q.g / PER) % NB; if (bar !== nowBar || nowFirst) { renderNow(bar); renderNext(bar); countEl.textContent = ''; } paintSlot(slot); const beats = cells[bar].querySelectorAll('.fbeats i'); beats.forEach((i, b) => i.classList.toggle('on', b <= slot >> 1)); if (slot === 0) cells.forEach((c, k) => { if (k !== bar) c.querySelectorAll('.fbeats i').forEach((i) => i.classList.remove('on')); }); markActive(); }
    }
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    // Stop right after the last note of a chorus still counts that chorus: a bar already over but not yet judged (its
    // barEnd waits one beat + 0.3 s), and the bar in progress once its last note is due, are judged now with what was played
    if (st.playing && st.mode === 'play' && run) {
      const now = audio.now();
      const judge = (chorus, bar) => {
        exp = exp.filter((x) => { if (x.chorus !== chorus || x.bar !== bar) return true; if (!x.hit) tally.add(chorus, bar, 'miss'); return false; });
        finishBar(bar, chorus);
      };
      queue.filter((q) => q.barEnd !== undefined && q.end <= now).forEach((q) => judge(q.chorus, q.barEnd));
      const p = posAt(now);
      if (p >= 0) {
        const at = chorusBarAt(p, NB, PER), lastSlot = Math.max(-1, ...barNotes[at.bar].map((e) => e.t));
        if (Math.floor(p) % PER >= lastSlot) judge(at.chorus, at.bar);
      }
    }
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = st.playing; st.playing = false; run = null; exp = [];
    screen.classList.remove('playing');
    if (was) { audio.hush(); silence(); }
    cells.forEach((c) => { c.classList.remove('cur'); c.querySelectorAll('.fbeats i').forEach((i) => i.classList.remove('on')); });
    resetKeys(); showFirst();
    idle(); paintPrimary();
  }

  // ---------- scoring ----------
  function input(m, ts) {
    markActive();
    if (st.stage === 'notes') { walkInput(m); return; }
    if (!st.playing || st.mode !== 'play') return;
    const T = audio.toAudioTime(ts), { win, tight } = tols();
    let best = null;
    for (const x of exp) { if (x.hit || x.m !== m) continue; const dt = T - x.t; if (Math.abs(dt) <= win && (!best || Math.abs(dt) < Math.abs(T - best.t))) best = x; }
    if (!best) {
      if (!exp.length || T < exp[0].t - win) return; // before the first note: ignore
      const at = chorusBarAt(posAt(T), NB, PER); // a wrong note belongs to the chorus and bar of its position
      tally.add(at.chorus, at.bar, 'bad'); kb.flash(m, 'bad'); fb(`<span class="bad">${t('wrongNote')}: ${noteName(midiToName(m), namesT)}</span>`); return;
    }
    best.hit = true;
    const dt = T - best.t, cls = Math.abs(dt) <= tight ? 'ok' : 'meh';
    tally.add(best.chorus, best.bar, cls);
    syncKeys(audio.now());
    kb.flash(m, cls);
    fb(cls === 'ok' ? `<span class="ok">${t('even')}</span>` : `<span class="meh">${dt < 0 ? t('early') : t('late')} ${Math.round(Math.abs(dt) * 1000)} ${t('ms')}</span>`);
  }
  function expire(now) {
    const { win } = tols();
    while (exp.length && (exp[0].hit || exp[0].t + win < now)) { const x = exp.shift(); if (!x.hit) tally.add(x.chorus, x.bar, 'miss'); }
  }
  function finishBar(bar, chorus) {
    const s = tally.takeBar(chorus, bar);
    const cls = s.miss + s.bad === 0 ? 'ok' : s.ok + s.meh >= s.miss ? 'meh' : 'bad';
    if (st.mode === 'play') cells[bar].classList.add(cls);
    if (bar === NB - 1) finishChorus(chorus);
  }
  function finishChorus(chorus) {
    st.choruses = chorus + 1;
    const s = tally.takeChorus(chorus); // only this chorus's notes, even if the next one has begun
    if (st.mode !== 'play') { paintStreak(); return; }
    const total = s.ok + s.meh + s.miss, slips = s.miss + s.bad, clean = slips <= maxSlips && total > 0;
    st.streak = clean ? st.streak + 1 : 0;
    paintStreak();
    const pct = total ? Math.round((s.ok / total) * 100) : 0;
    let html = `${t('chorusW')} ${chorus + 1}: ` + (clean ? `<span class="ok">${t('cleanW')} ✓</span>` : `<span class="bad">${slips} ${t('slipsW')}</span>`) + ` · ${pct}% ${t('evenPct')}`;
    updateEx(itemId, (p) => ({ ...p, choruses: (p.choruses || 0) + 1, cleanChoruses: (p.cleanChoruses || 0) + (clean ? 1 : 0), bestStreak: Math.max(p.bestStreak || 0, st.streak), bestTempo: clean ? Math.max(p.bestTempo || 0, st.bpm) : p.bestTempo || 0 }));
    logDay({ choruses: 1, cleanChoruses: clean ? 1 : 0 });
    if (st.streak >= CLEAN_TO_PASS) {
      const first = !exProgress(itemId).stages.done;
      updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, done: true } }));
      scheduleReview(itemId, true); paintStages();
      html += ` · <b>${first ? t('fPassed') : t('fPassedAgain')}</b>`;
    } else if (!clean && wasDue && st.choruses >= CLEAN_TO_PASS) scheduleReview(itemId, false);
    fb(html);
  }

  // ---------- stage «Ноты»: the form event by event, no tempo ----------
  // walk.doneG: the last event done (-1 = none); got: the keys of the current event already pressed; slips: wrong keys in
  // this walk; barSlips: in the bar of the current event (its grid cell turns green or amber when the walk leaves it)
  let walk = null;
  function walkReset() {
    walk = { doneG: -1, got: [], slips: 0, barSlips: 0, bar: -1, over: false };
    screen.classList.remove('walking'); kb.hint({});
    walkMsg.className = 'fvmsg'; walkMsg.replaceChildren();
    cells.forEach((c) => c.classList.remove('ok', 'meh', 'bad', 'cur'));
  }
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  /** the spelled name of key m in the event at bar / slot (the strip's own spelling) */
  function spellAt(bar, slot, m) {
    for (const hd of handRows) { const e = notesOf(hd, bar).find((x) => x.t === slot && x.m === m); if (e) return hd === 'rh' ? rhSpell(e) : lhSpell(bar, e); }
    return midiToName(m);
  }
  function walkPaint() {
    if (st.stage !== 'notes' || !walk) return;
    const p = walkTarget(yours, walk.doneG);
    if (!p) { walkFinish(); return; }
    if (p.bar !== walk.bar) {
      if (walk.bar >= 0) cells[walk.bar].classList.add(walk.barSlips ? 'meh' : 'ok');
      walk.bar = p.bar; walk.barSlips = 0;
      renderNow(p.bar); renderNext(p.bar); countEl.textContent = '';
      cells.forEach((c, k) => c.classList.toggle('cur', k === p.bar)); keepInView(p.bar);
    }
    paintSlot(p.slot);
    const left = (ms) => ms.filter((m) => !walk.got.includes(m));
    planG = null; kb.plan(p.tint, { rh: left(p.target.rh), lh: left(p.target.lh) });
    chorusEl.textContent = fill(t('fvBarOf'), { n: p.bar + 1, m: NB });
    fb(walk.slips ? `<span class="${walkPassed(walk.slips, maxSlips) ? 'meh' : 'bad'}">${fill(t('fvSlipsN'), { n: walk.slips })}</span>` : '');
    if (screen.classList.contains('walking')) bringLiveUp(); // phone: the strip, the hint and the staff above the keys
  }
  function walkInput(m) {
    if (!walk || walk.over) return;
    const p = walkTarget(yours, walk.doneG); if (!p) return;
    const r = walkPress(eventKeys(p.target), walk.got, m);
    if (r.res === 'again') return;
    if (!screen.classList.contains('walking')) { screen.classList.add('walking'); panel.scrollTop = 0; } // compact: the task block steps aside
    if (r.res === 'wrong') {
      walk.slips++; walk.barSlips++;
      kb.hint({ [m]: 'bad' });
      const k = keyHint(r.toward, m);
      const need = t('lqNeedN').replace('{name}', nameInText(spellAt(p.bar, p.slot, r.toward), namesT, getLang())).replace('{c}', t(k.black ? 'lqBlackW' : 'lqWhiteW')).replace('{n}', `${k.keys} ${plural(k.keys, 'lqKeys')}`).replace('{d}', t(k.dir === 'left' ? 'lqLeft' : 'lqRight'));
      walkMsg.className = 'fvmsg bad';
      walkMsg.replaceChildren(h('span.sym', null, k.dir === 'left' ? '←' : '→'), h('div', { html: `<b>${t('lqWrongKey')}. ${cap(need)}</b><span class="fvmsgsub"><br>${t('lqWrongSub')}</span>` }));
      walkPaint();
      return;
    }
    kb.hint({}); kb.flash(m, 'ok');
    if (walkMsg.classList.contains('bad')) { walkMsg.className = 'fvmsg'; walkMsg.replaceChildren(); }
    walk.got = r.got;
    if (r.res === 'done') { walk.doneG = p.g; walk.got = []; }
    walkPaint();
  }
  function walkFinish() {
    walk.over = true;
    if (walk.bar >= 0) cells[walk.bar].classList.add(walk.barSlips ? 'meh' : 'ok');
    cells.forEach((c) => c.classList.remove('cur'));
    kb.plan({}, {}); kb.hint({}); // .walking stays until «Ещё раз» / «Сначала»: the result sits right under the strip
    const passed = walkPassed(walk.slips, maxSlips);
    if (passed && !prog().notes) updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, notes: true } }));
    paintStages();
    const head = walk.slips ? fill(t('fvErrs'), { n: walk.slips }) : t('fvNoErr');
    const again = h('button.btn' + (passed ? '.ghost' : '.accent'), { type: 'button', onclick: () => { walkReset(); walkPaint(); } }, t('fvAgain'));
    const next = passed ? h('button.btn.accent', { type: 'button', onclick: () => setStage('tempo') }, t('fvToTempo')) : null;
    walkMsg.className = 'fvmsg ' + (passed ? 'ok' : 'meh');
    walkMsg.replaceChildren(h('div.fvmsgtext', null, h('b', null, head), h('span', null, passed ? t('fvNotesPassed') : fill(t('fvNotesMore'), { s: slipsTxt }))), h('div.fvmsgbtns', null, next, again));
    chorusEl.textContent = t('fvSt_notes'); fb('');
    showFirst(); bringLiveUp();
  }
  /** «Послушать такт»: the bar of the current event once, in tempo (your part; the band's left hand softly in rh modes) */
  function playBar() {
    if (!audio.ensureAudio()) return;
    const p = walk && walkTarget(yours, walk.doneG), bar = p ? p.bar : Math.max(0, nowBar);
    const beat = 60 / st.bpm, t0 = audio.now() + 0.1, at = (x) => t0 + Math.floor(x / 2) * beat + (x % 2 ? swingOff() : 0);
    const dur = (e) => (e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9);
    if (rh && !two) lhNotes[bar].forEach((e) => play1(e.m, at(e.t), dur(e), 0.3));
    barNotes[bar].forEach((e) => play1(e.m, at(e.t), dur(e), 0.55));
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => { if (e.type === 'on') { kb.down(e.note, true); input(e.note, e.ts); } else kb.down(e.note, false); });
  const onKey = (e) => { if (e.code === 'Space' && !(e.target.closest && e.target.closest('input,select,textarea,summary'))) { e.preventDefault(); if (st.stage === 'notes') return; if (st.playing) stop(); else play(); } };
  document.addEventListener('keydown', onKey);

  setBpm(st.bpm); paintStreak(); paintKeys(); showFirst(); paintStaffOn();
  setStage(st.stage, true);
  updateEx(itemId, (p) => p);

  return () => { phoneMq.removeEventListener('change', onPhone); if (footRO) footRO.disconnect(); if (st.playing) stop(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
