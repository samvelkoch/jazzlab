// Lick screen: a 2-bar right-hand phrase, learned by ear first.
// Stages: Echo (the piano plays the lick for 2 bars, you repeat it in the next 2, over drums + the left-hand pattern)
// → Fingers / By heart (the generated exercise: RH lick + LH pattern over the chosen chord, #/t/<track>/<item>/fingers/<chord>).
// Echo is passed with 3 clean repeats on every chord of the form (or of item.chords, when the item sets its own); "by heart" in the exercise passes the lick item.
// A key-relative lick (lick.prog, item.keys): the chips are the keys, the lick plays over its progression in each key
// (LH = the pattern over lick.prog transposed), echo counts per key, fingers at #/t/<track>/<item>/fingers/<key>.
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L } from '../i18n.js';
import { markTerms } from '../glossary.js';
import { store, updateEx, exProgress, markActive, idle, reviews } from '../store.js';
import { noteName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import { lickNotes, lickSpell, patternBar, barChords, lickKeyNotes, lickOverKey } from '../music/forms.js';
import * as audio from '../music/audio.js';
import { groove } from '../music/drums.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';

const PER = 8; // eighths per bar
const LEN = 16; // the lick: 2 bars
const CYCLE = 4; // bars per cycle: 2 piano + 2 you
const CLEAN_TO_PASS = 3; // clean repeats per chord

export function renderLick(root, { track, itemId, item, lick, pattern, form: form0, back }) {
  const settings = { met: true, names: 'en', pianoSnd: true, impBeat: 'drums', ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  const keyed = Array.isArray(item.keys) && item.keys.length > 0 && Array.isArray(lick.prog); // over keys, not chords
  const form = form0 || {};
  // the chips: the keys of a key-relative lick, the item's own chord set (item.chords), or the form's distinct chords
  const chords = keyed ? item.keys.slice() : Array.isArray(item.chords) && item.chords.length ? item.chords.slice() : [...new Set(form.bars.flatMap(barChords))];
  const tk = (k) => (keyed && { lkChord: 'lkKey', lkEchoGoal: 'lkEchoGoalKey', lkEchoDone: 'lkEchoDoneKey', lkAllChords: 'lkAllKeys', lkOpen: 'lkOpenKey' }[k]) || k;
  const notesOf = (c) => (keyed ? lickKeyNotes(lick, c) : lickNotes(lick, c));
  const spelled = (e) => e.name || lickSpell(e.m, e.deg);
  // the left hand under the 2 bars of the lick: the pattern over the chord twice, or over the progression in the key
  const lhOf = (c) => { if (!pattern) return [[], []]; if (keyed) return lickOverKey(lick, c, pattern).bars.map((b) => b.lh); const pb = patternBar(pattern, c); return [pb, pb]; };
  const saved = exProgress(itemId);
  const due = !!(reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date());
  const st = {
    // a due review opens on «By heart»: its big button leads straight into the from-memory exercise
    stage: due ? 'memory' : store.get('lickStage:' + itemId, 'echo'),
    chord: chords.includes(store.get('lickChord:' + itemId)) ? store.get('lickChord:' + itemId) : chords[0],
    bpm: store.get('tempo:' + itemId, lick.tempo || form.tempo || 66),
    swing: lick.swing !== undefined ? !!lick.swing : !!form.swing,
    playing: false,
    clean: Object.fromEntries(chords.map((c) => [c, (saved.echo && saved.echo[c]) || 0]))
  };
  if (!['echo', 'fingers', 'memory'].includes(st.stage)) st.stage = 'echo';
  const midiOn = () => midiState().connected;
  const exHref = (c) => `${item.href}/fingers/${c}`;

  // notes of the lick over the current chord
  let notes = [], rows = []; // rows: distinct pitches, low → high: [{m, name}]
  function computeNotes() {
    notes = notesOf(st.chord);
    const uniq = [...new Map(notes.map((e) => [e.m, e])).values()].sort((a, b) => a.m - b.m);
    rows = uniq.map((e) => ({ m: e.m, name: noteName(spelled(e), names), f: e.f, spelled: spelled(e) }));
  }
  computeNotes();

  // ---------- layout ----------
  const stageBtn = (sid, n) => h('button', { type: 'button', 'data-stage': sid, onclick: () => setStage(sid) }, h('span.num', null, String(n)), t('lk_' + sid));
  const stages = h('nav.seg.stages', { 'aria-label': 'stages' }, stageBtn('echo', 1), stageBtn('fingers', 2), stageBtn('memory', 3));
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null,
      h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('lickUpper')}`),
      h('span.title', null, item.title || L(lick.title))),
    h('div.grow'), stages, h('div.grow'),
    sessionChip(itemId), midiChip(), themeButton());

  const chordSeg = h('div.seg.lickchords', { role: 'group', 'aria-label': t(tk('lkChord')) });
  const counts = h('div.lickcounts', { 'aria-label': t('lkCleanReps') });
  const title = h('h2'), sub = h('span.sub');
  const fbEl = h('span.fb', { 'aria-live': 'polite' });
  const cyc = [0, 1].map(() => { const beats = h('div.cbeats', null, ...Array.from({ length: 8 }, () => h('i'))); const role = h('b'), what = h('span'); return { el: h('div.cyc', null, role, what, h('div.grow'), beats), role, what, beats }; });
  const roll = h('div.roll.lickroll');
  const echoBox = h('div.lickecho', null, h('div.cycle', null, cyc[0].el, cyc[1].el), roll);
  const openBtn = h('a.btn.accent.xl.lickopen');
  const linkBox = h('div.licklink', null, h('p.dabout', null, markTerms(L(lick.about))), openBtn);
  const panel = h('section.panel.imppanel.lickpanel', null,
    h('div.rhead', null, title, h('div.grow'), counts, chordSeg),
    h('div.lickinfo', null, sub, fbEl),
    echoBox, linkBox);
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

  // ---------- keyboard: one range for every chord, the current chord's lick pitches lit ----------
  const allM = chords.flatMap((c) => notesOf(c).map((e) => e.m));
  const lo = Math.min(...allM), hi = Math.max(...allM);
  const lhM = chords.flatMap((c) => lhOf(c).flat().map((e) => e.m));
  audio.preloadPiano(Math.min(lo, ...lhM) - 2, hi + 4);
  const kb = createKeyboard(kbEl, [lo, hi], { names: settings.names, onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.5, 0.55); if (!midiOn()) input(m, performance.now()); } });
  function paintKeys() { kb.show({ rh: { notes: rows.map((r) => r.spelled), f: rows.map((r) => r.f) }, lh: null }, { rh: null, lh: null }, 'both'); }

  // ---------- roll: 2 bars, one row per distinct pitch ----------
  const pct = (slot) => (slot / LEN) * 100;
  let rollNotes = [], ghost = [], mine = [], ticks = [], contour = null, head = null;
  function buildRoll() {
    const kids = [];
    for (let k = 0; k < LEN; k += 2) {
      kids.push(h('div.bline' + (k === PER ? '.bar' : ''), { style: `left:${pct(k)}%` }));
      kids.push(h('div.bnum', { style: `left:${pct(k)}%` }, String((k % PER) / 2 + 1)));
    }
    rollNotes = notes.map((e) => h('div.lnote', { style: `left:${pct(e.t)}%;width:calc(${pct(e.d)}% - 6px)`, 'data-slot': e.t }, h('span', null, rows.find((r) => r.m === e.m).name)));
    kids.push(...rollNotes);
    rows.slice().reverse().forEach((r, row) => kids.push(h('div.prow', { style: `--row:${row}` }, h('b', null, r.name))));
    head = h('div.head'); contour = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    contour.setAttribute('class', 'contour'); contour.setAttribute('viewBox', '0 0 100 100'); contour.setAttribute('preserveAspectRatio', 'none');
    roll.dataset.rows = rows.length;
    roll.style.setProperty('--rows', rows.length);
    roll.style.setProperty('--row-h', (rows.length >= 6 ? 24 : rows.length === 5 ? 28 : 34) + 'px');
    roll.replaceChildren(h('div.rinner', null, ...kids, contour, head));
    ghost = []; mine = []; ticks = [];
    notes.forEach((e) => addBlock(ghost, 'ghost', e.t, e.d, e.m));
  }
  const rowOf = (m) => { let best = 0, bd = 1e9; rows.forEach((x, k) => { const d = Math.abs(x.m - m); if (d < bd) { bd = d; best = k; } }); return { row: rows.length - 1 - best, exact: bd === 0 }; };
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
    if (mine.length < 2) { contour.innerHTML = ''; return; }
    const n = rows.length, y = (row) => ((row + 0.5) / n) * 100;
    const pts = mine.slice().sort((a, b) => a.slotPos - b.slotPos).map((x) => `${pct(x.slotPos) + 2},${y(x.row)}`).join(' ');
    contour.innerHTML = `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="5 6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
  }

  // ---------- painting ----------
  const echoDone = () => chords.every((c) => st.clean[c] >= CLEAN_TO_PASS);
  function paintCounts() {
    counts.replaceChildren(...chords.map((c) => h('span.lcount' + (st.clean[c] >= CLEAN_TO_PASS ? '.ok' : '') + (c === st.chord ? '.cur' : ''), { title: t(tk('lkEchoGoal')) },
      h('b', null, c), ` ${Math.min(st.clean[c], CLEAN_TO_PASS)}/${CLEAN_TO_PASS}`)));
  }
  function paintStages() {
    const p = exProgress(itemId);
    const fingersDone = chords.some((c) => exProgress(`${itemId}-${c.toLowerCase()}`).stages.tempo);
    const done = { echo: !!p.stages.echo, fingers: fingersDone || !!p.stages.done, memory: !!p.stages.done };
    stages.querySelectorAll('button').forEach((b, k) => {
      const sid = b.dataset.stage;
      b.setAttribute('aria-pressed', String(sid === st.stage));
      b.classList.toggle('done', done[sid]);
      b.querySelector('.num').innerHTML = done[sid] ? ICON.check : String(k + 1);
    });
  }
  function paintChord() {
    chordSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.chord)));
    openBtn.href = exHref(st.chord);
    openBtn.innerHTML = ICON.note + `<span>${t(tk('lkOpen')).replace('{c}', st.chord)}</span>`;
    paintCounts();
  }
  /** keep = do not remember the stage (the first paint: a due review opens on «By heart» only for this visit) */
  function setStage(sid, keep) {
    if (st.playing) stop();
    st.stage = sid; if (!keep) store.set('lickStage:' + itemId, sid);
    screen.dataset.lstage = sid;
    title.textContent = t('lkT_' + sid); sub.textContent = t('lkS_' + sid);
    footHint.textContent = sid === 'echo' ? t('lkF_echo') : t('lkF_link');
    paintStages(); paintCycle(-1, 0); paintPrimary();
    if (sid === 'echo') fb(echoDone() ? `<span class="ok">${ICON.check} ${t(tk('lkEchoDone'))}</span>` : t('lkStartHint'));
    else if (due && sid === 'memory') fb(`<b>${t('reviewDueHint')} ↓</b>`);
    else fb(exProgress(itemId).stages.done ? `<span class="ok">${ICON.check} ${t('lkPassed')}</span>` : '');
  }
  function setChord(c) {
    if (st.playing) stop();
    st.chord = c; store.set('lickChord:' + itemId, c);
    computeNotes(); buildRoll(); paintKeys(); paintChord();
    if (st.stage === 'echo') fb(echoDone() ? `<span class="ok">${ICON.check} ${t(tk('lkEchoDone'))}</span>` : t('lkStartHint'));
    else paintPrimary();
  }
  function paintCycle(half, beat) {
    [['piano', 'impPhrase'], ['you', 'impRepeat']].forEach(([role, what], k) => {
      const c = cyc[k], on = half === k;
      c.role.textContent = t('role_' + role); c.what.textContent = t(what);
      c.el.className = 'cyc ' + role + (on ? ' on' : '');
      [...c.beats.children].forEach((i, b) => i.classList.toggle('on', on && b <= beat));
    });
  }
  function paintPrimary() {
    if (st.stage !== 'echo') { primary.innerHTML = ICON.note + `<span>${t(tk('lkOpen')).replace('{c}', st.chord)}</span>`; return; }
    primary.innerHTML = st.playing ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`;
  }
  function onPrimary() {
    if (st.stage !== 'echo') { location.hash = exHref(st.chord); return; }
    if (st.playing) stop(); else play();
  }
  function setBpm(v) {
    st.bpm = Math.max(40, Math.min(200, Math.round(v)));
    bpmOut.innerHTML = `♩ ${st.bpm}`;
    store.set('tempo:' + itemId, st.bpm);
  }
  function fb(html) { fbEl.innerHTML = html; if (st.playing) bringRollUp(); } // a longer result line pushes the roll down

  // ---------- sound ----------
  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) {
      const onMs = performance.now() + (time - audio.now()) * 1000;
      if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return;
    }
    audio.pianoNote(m, time, dur, v);
  }

  // ---------- transport: 1-bar count-in, then an endless 4-bar cycle (2 piano + 2 you) ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null, exp = [], barSt = null, lhBars = [[], []], lastResult = '';
  const swingOff = () => { const beat = 60 / st.bpm; return st.swing ? beat * 2 / 3 : beat / 2; };
  const enqueue = (x) => { queue.push(x); queue.sort((a, b) => a.t - b.t); };
  /** Phone: the keyboard sticks above the footer and covers the lower part of the screen. On Start, scroll just enough
   *  for the whole roll to sit above it, but never past the feedback line (count-in, "your turn", the result). */
  const phoneMq = window.matchMedia('(max-width: 640px)');
  function bringRollUp() {
    if (!phoneMq.matches) return;
    const r = roll.getBoundingClientRect(), kp = kbPanel.getBoundingClientRect(), top = fbEl.getBoundingClientRect().top;
    const d = Math.min(r.bottom - kp.top + 8, top - 8);
    if (d > 2) window.scrollTo({ top: window.scrollY + d, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function play() {
    if (!audio.ensureAudio() || st.playing) return;
    st.playing = true; screen.classList.add('playing'); paintPrimary(); bringRollUp();
    lhBars = lhOf(st.chord);
    const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += 4 * beat; beatTime = t0; g = 0;
    run = { t0, beat, swing: st.swing };
    clearMine(); exp = []; barSt = null;
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function schedule() {
    const ahead = audio.now() + 0.15, beat = 60 / st.bpm;
    while (st.playing) {
      const slot = g % PER, bar = Math.floor(g / PER), k = bar % CYCLE, ls = (k % 2) * PER + slot; // ls: slot in the lick (0..15)
      const time = beatTime + (slot % 2 ? swingOff() : 0);
      if (time > ahead) break;
      if (k === 0 && slot === 0) enqueue({ t: time - 0.02, phrase: true });
      if (k === 2 && slot === 0) { exp = []; enqueue({ t: time - 0.12, youStart: bar }); }
      // backing: drums or metronome + the left-hand pattern, quietly
      if (settings.impBeat === 'drums') groove(slot, time, { swing: st.swing, style: form.style, bar }); else if (settings.met && slot % 2 === 0) audio.click(time, slot === 0);
      lhBars[k % 2].filter((e) => e.t === slot).forEach((e) => play1(e.m, time, e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9, 0.3));
      const evs = notes.filter((e) => e.t === ls);
      if (k < 2) evs.forEach((e) => play1(e.m, time, e.stac ? Math.min(swingOff() * 0.6, 0.2) : swingOff() * e.d * 0.95, 0.55));
      else evs.forEach((e) => exp.push({ t: time, slot: ls, len: e.d, hit: false, m: e.m }));
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
      if (q.ci !== undefined) { fb(`${t('countInLabel')}: <b>${q.ci}</b>`); continue; }
      if (q.phrase && !lastResult) fb(t('impListenPhrase'));
      if (q.youStart !== undefined) { barSt = { ok: 0, meh: 0, miss: 0, extra: 0, notes: [] }; clearMine(); fb(t('impYourTurn')); }
      if (q.youEnd !== undefined) finishRepeat();
    }
    const p = posAt(now);
    if (p >= 0) {
      const cb = Math.floor(p / PER) % CYCLE, inLick = p % LEN, half = cb < 2 ? 0 : 1;
      head.style.left = pct(inLick) + '%';
      paintCycle(half, Math.floor(inLick / 2));
      rollNotes.forEach((n) => { const s = +n.dataset.slot; n.classList.toggle('now', inLick >= s && inLick < s + 1); });
      markActive();
    }
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = st.playing; st.playing = false; run = null; exp = []; barSt = null; lastResult = '';
    screen.classList.remove('playing');
    if (was) { audio.hush(); silence(); }
    paintCycle(-1, 0); if (head) head.style.left = '0%'; rollNotes.forEach((n) => n.classList.remove('now'));
    idle(); paintPrimary();
  }

  // ---------- input + scoring (as the improvisation echo: rhythm by onsets, notes compared exactly) ----------
  const tols = () => { const e8 = 60 / st.bpm / 2; return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.2, 0.04), 0.08) }; };
  function input(m, ts) {
    markActive();
    if (!st.playing || !barSt || st.stage !== 'echo') return;
    const T = audio.toAudioTime(ts), { win, tight } = tols();
    const eighth = (slot) => (slot % 2 ? 60 / st.bpm - swingOff() : swingOff());
    let best = null;
    for (const x of exp) { if (x.hit) continue; const dt = T - x.t; if (Math.abs(dt) <= win && (!best || Math.abs(dt) < Math.abs(T - best.t))) best = x; }
    if (!best) {
      if (exp.length && T > exp[0].t - win) {
        barSt.extra++;
        const p = posAt(T); addTick(Math.max(0, Math.min(LEN - 0.2, p % LEN)), 'bad', t('extraW'));
      }
      return;
    }
    best.hit = true;
    const dt = T - best.t, cls = Math.abs(dt) <= tight ? 'ok' : 'meh';
    barSt[cls]++;
    const sp = best.slot + dt / eighth(best.slot);
    const el = addBlock(mine, 'mine', sp, best.len, m);
    el.classList.add(cls);
    if (best.m !== m) el.classList.add('other');
    barSt.notes.push({ m, slot: best.slot, same: best.m === m });
    drawContour();
    const n = rollNotes.find((x) => +x.dataset.slot === best.slot); if (n) n.classList.add(cls);
  }
  function finishRepeat() {
    if (!barSt) return;
    barSt.miss = exp.filter((x) => !x.hit).length;
    exp.filter((x) => !x.hit).forEach((x) => { const n = rollNotes.find((r) => +r.dataset.slot === x.slot); if (n) n.classList.add('bad'); });
    const total = exp.length, hit = barSt.ok + barSt.meh, same = barSt.notes.filter((x) => x.same).length;
    const clean = total > 0 && barSt.miss === 0 && barSt.extra === 0 && same === total;
    let html = `${t('rhythmW')}: <b>${hit}/${total}</b>` + (barSt.extra ? ` · ${t('extraTap')}: ${barSt.extra}` : '') + ` · ${t('impSameNotes')}: <b>${same}/${total}</b>`;
    if (clean) {
      html += ` · <span class="ok">${t('cleanW')} ✓</span>`;
      const c = st.chord;
      st.clean[c] = (st.clean[c] || 0) + 1;
      updateEx(itemId, (p) => ({ ...p, echo: { ...(p.echo || {}), [c]: st.clean[c] } }));
      if (echoDone() && !exProgress(itemId).stages.echo) {
        updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, echo: true } }));
        paintStages();
        html += ` · <b>${t(tk('lkEchoDone'))}</b>`;
      } else if (st.clean[c] === CLEAN_TO_PASS && !echoDone()) {
        html += ` · ${t(tk('lkAllChords')).replace('{c}', chords.filter((x) => st.clean[x] < CLEAN_TO_PASS).join(', '))}`;
      }
      paintCounts();
    }
    lastResult = html;
    fb(html);
    barSt = null;
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => { if (e.type === 'on') { kb.down(e.note, true); input(e.note, e.ts); } else kb.down(e.note, false); });
  const onKey = (e) => {
    if (e.target.closest('input,select,textarea,summary')) return;
    if (e.code === 'Space') { e.preventDefault(); if (st.stage !== 'echo') return; if (st.playing) stop(); else play(); }
  };
  document.addEventListener('keydown', onKey);

  setBpm(st.bpm);
  buildRoll(); paintKeys(); paintChord();
  setStage(st.stage, true);
  updateEx(itemId, (p) => p);

  return () => {
    if (footRO) footRO.disconnect();
    if (st.playing) stop();
    offNote(); document.removeEventListener('keydown', onKey);
    header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup());
  };
}
