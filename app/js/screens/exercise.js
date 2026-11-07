// Exercise screen: stages Rhythm (tap the rhythm on one key) → Notes (wait mode) → In tempo → By heart.
import { h, ICON, themeButton, midiChip, sessionChip } from '../ui.js';
import { t, L } from '../i18n.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview } from '../store.js';
import { buildSteps, dynAt, midiRange } from '../music/exercise.js';
import { toMidi, midiToName, noteName } from '../music/notes.js';
import { createStaff } from '../music/staff.js';
import { createKeyboard } from '../music/keyboard.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, onMidiState, sendNote, silence } from '../music/midi.js';
import { toMusicXML, toMidiFile } from '../music/export.js';
import { createRhythmStage } from './rhythm-stage.js';
import { SYL_KEYS } from '../music/rhythm.js';

const PASS = 0.85; // share of on-time notes needed to pass a tempo run

export function renderExercise(root, { ex, rerender }) {
  const steps = buildSteps(ex);
  const N = steps.length, per = ex.per;
  const saved = exProgress(ex.id);
  const settings = { met: true, count: true, names: 'en', guideSnd: false, pianoSnd: true, syl: 'food', ...store.get('settings', {}) };
  const st = {
    stage: !saved.stages.rhythm ? 'rhythm' : !saved.stages.notes ? 'notes' : 'tempo',
    step: 0, hands: 'both',
    bpm: store.get('tempo:' + ex.id, ex.tempo.start),
    swing: ex.swing,
    playing: false
  };
  const saveSettings = () => store.set('settings', settings);
  const handOn = (hd) => st.hands === 'both' || st.hands === hd;
  const midiOn = () => midiState().connected;

  // ---------- layout ----------
  const stageBtn = (id, label) => h('button', { type: 'button', 'data-stage': id, onclick: () => setStage(id) },
    h('span.num'), label);
  const stages = h('nav.seg.stages', { 'aria-label': 'stages' },
    stageBtn('rhythm', t('stRhythm')), stageBtn('notes', t('stNotes')), stageBtn('tempo', t('stTempo')), stageBtn('memory', t('stMemory')));

  const settingsPanel = h('details.settings', null,
    h('summary.iconbtn', { 'aria-label': t('settings'), title: t('settings'), html: ICON.gear }),
    h('div.pop', null,
      check(t('metronome'), 'met'), check(t('countIn'), 'count'),
      h('div.poprow', null, h('span', null, t('noteNames')),
        seg([['en', 'C D E'], ['ru', 'До Ре'], ['off', t('namesOff')]], settings.names, (v) => { settings.names = v; saveSettings(); kb.setNames(v); buildStaff(); render(st.step); })),
      h('div.poprow', null, h('span', null, t('sylSystem')),
        seg(SYL_KEYS.map((k) => [k, t('syl_' + k)]), settings.syl, (v) => { settings.syl = v; saveSettings(); rs.resyl(); })),
      check(t('pianoSound'), 'pianoSnd'),
      check(t('guideSound'), 'guideSnd'),
      h('button.btn', { type: 'button', title: t('exportPMTitle'), html: ICON.download + `<span>${t('exportPMTitle')}</span>`, onclick: () => doExport() })));
  function check(label, key) {
    const inp = h('input', { type: 'checkbox' }); inp.checked = !!settings[key];
    inp.addEventListener('change', () => { settings[key] = inp.checked; saveSettings(); });
    return h('label.chk', null, inp, label);
  }

  const header = h('header.top', null,
    h('a.iconbtn', { href: ex.back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null,
      h('span.kicker', null, ex.kicker || `${t('stepUpper')} ${ex.step} · ${t('exerciseUpper')} ${ex.number}`),
      h('span.title', null, L(ex.title))),
    h('div.grow'), stages, h('div.grow'),
    sessionChip(ex.id), midiChip(), settingsPanel, themeButton());

  const fbEl = h('span.fb', { 'aria-live': 'polite' });
  const barEl = h('span.barno');
  const counts = h('div.counts', { 'aria-hidden': 'true' }, ...Array.from({ length: per }, (_, k) => h('span' + (k % 2 ? '' : '.beat'), null, k % 2 ? '+' : String(k / 2 + 1))));
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('class', 'staff'); svgEl.setAttribute('role', 'img'); svgEl.setAttribute('aria-label', L(ex.title));
  const staffPanel = h('section.panel.staffpanel', null,
    h('div.staffhead', null, barEl, counts, h('div.grow'), fbEl),
    h('div.staffwrap', null, svgEl),
    h('div.legend', null,
      h('span', null, h('i.dot.rh'), t('legendRh')), h('span', null, h('i.dot.lh'), t('legendLh')),
      h('span', null, h('i.dot.ok'), t('legendOk')), h('span', null, h('i.dot.meh'), t('legendMeh')), h('span', null, h('i.dot.bad'), t('legendBad')),
      ex.about ? h('span.about', null, L(ex.about)) : null));
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);

  // Rhythm stage: only the exercise's rhythm pattern, on a loop (see rhythm-stage.js)
  let scr = null; // the screen, once built
  const rs = createRhythmStage(ex, {
    play1: (m, time, dur, v) => play1(m, time, dur, v),
    bpm: () => st.bpm, setBpm: (v) => setBpm(v), swing: () => st.swing, syl: () => settings.syl,
    onPlaying: (on) => { if (scr) scr.classList.toggle('playing', on); paintPrimary(); },
    onMode: (m) => { if (scr) scr.dataset.rmode = m; },
    onDone: () => complete('rhythm')
  });

  const handsSeg = seg([['rh', t('right')], ['lh', t('left')], ['both', t('both')]], st.hands, (v) => { st.hands = v; resetScores(); render(st.step); }, 'hands');
  handsSeg.classList.add('hands-seg');
  const prevB = h('button.iconbtn', { type: 'button', 'aria-label': t('prevStep'), title: t('prevStep'), html: ICON.prev, onclick: () => goto(st.step - 1) });
  const nextB = h('button.iconbtn', { type: 'button', 'aria-label': t('nextStep'), title: t('nextStep'), html: ICON.next, onclick: () => goto(st.step + 1) });
  const listenB = h('button.btn.listen-b', { type: 'button', html: ICON.speaker + `<span>${t('listen')}</span>`, onclick: () => (st.playing ? stop() : play(false)) });
  const bpmOut = h('output.bpm');
  const tempoBox = h('div.stepper', null,
    h('button', { type: 'button', 'aria-label': t('slower'), onclick: () => setBpm(st.bpm - 4) }, '−'), bpmOut,
    h('button', { type: 'button', 'aria-label': t('faster'), onclick: () => setBpm(st.bpm + 4) }, '+'));
  const swingSeg = seg([['straight', t('straight')], ['swing', t('swing')]], st.swing ? 'swing' : 'straight', (v) => { st.swing = v === 'swing'; }, 'eighths');
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: onPrimary });
  const footer = h('footer.actions', null, handsSeg, h('div.pair', null, prevB, nextB), listenB, h('div.grow'), tempoBox, swingSeg, primary);

  const screen = h('div.exscreen', null, header, h('main.ex', null, rs.els.rbar, staffPanel, kbPanel, rs.els.panel, rs.els.stats, rs.els.pad), footer);
  root.replaceChildren(screen);
  scr = screen; screen.dataset.rmode = rs.mode();

  // ---------- engines ----------
  let staff;
  function buildStaff() { staff = createStaff(svgEl, ex, { names: settings.names, onPick: (i) => goto(i) }); }
  buildStaff();
  audio.preloadPiano(...midiRange(ex));
  const kb = createKeyboard(kbEl, midiRange(ex), {
    names: settings.names,
    onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.6, 0.55); staff.ghost(m); if (!midiOn()) handleNote(m, performance.now()); }
  });

  function seg(items, value, cb, label) {
    const w = h('div.seg', { role: 'group', 'aria-label': label ? t(label) : null });
    items.forEach(([v, text]) => w.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), onclick: (e) => {
      w.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); cb(v);
    } }, text)));
    return w;
  }

  // ---------- rendering ----------
  function nextOnset(i, hd) { for (let k = 1; k <= N; k++) { const s = steps[(i + k) % N]; if (s[hd]) return s[hd]; } return null; }
  function render(i) {
    st.step = i;
    const s = steps[i];
    barEl.textContent = `${t('bar')} ${s.bar + 1} ${t('of')} ${ex.bars.length}`;
    [...counts.children].forEach((c, k) => c.classList.toggle('cur', k === s.slot));
    kb.show({ rh: s.rh, lh: s.lh }, { rh: nextOnset(i, 'rh'), lh: nextOnset(i, 'lh') }, st.hands);
    staff.setCursor(i);
  }
  function fb(html) { fbEl.innerHTML = html; }

  const mark = (i, cls) => staff.mark(i, cls);
  const clearMarks = () => staff.clearMarks();
  function setBpm(v) {
    st.bpm = Math.max(30, Math.min(200, Math.round(v)));
    bpmOut.innerHTML = ex.passAnyTempo ? `♩ ${st.bpm}` : `♩ ${st.bpm} <small>/ ${ex.tempo.target}</small>`;
    store.set('tempo:' + ex.id, st.bpm);
    if (st.stage === 'rhythm') rs.refresh();
  }
  function setStage(id) {
    if (st.playing) stop();
    rs.stop();
    st.stage = id;
    screen.dataset.stage = id;
    const prog = exProgress(ex.id);
    stages.querySelectorAll('button').forEach((b) => {
      const sid = b.dataset.stage;
      b.setAttribute('aria-pressed', String(sid === id));
      b.classList.toggle('done', !!prog.stages[sid]);
      b.querySelector('.num').innerHTML = prog.stages[sid] ? ICON.check : String(['rhythm', 'notes', 'tempo', 'memory'].indexOf(sid) + 1);
    });
    resetScores();
    paintPrimary();
    if (id === 'rhythm') { rs.refresh(); return; }
    const tip = id !== 'rhythm' && !prog.stages.rhythm ? `<b>${t('rhythmFirst')}</b> · ` : '';
    fb(tip + (id === 'rhythm' ? t('tapStart') : id === 'notes' ? (midiOn() ? t('waitHint') : t('noMidiHint')) : t('tempoHint')));
    if (id === 'notes') toPlayable();
    render(st.step);
  }
  function paintPrimary() {
    if (st.stage === 'rhythm') { primary.innerHTML = rs.primaryHtml(); return; }
    if (st.stage === 'notes') primary.innerHTML = ICON.play + `<span>${t('playInTempo')}</span>`;
    else primary.innerHTML = st.playing ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`;
    listenB.innerHTML = (st.playing && st.listenOnly ? ICON.stop + `<span>${t('stop')}</span>` : ICON.speaker + `<span>${t('listen')}</span>`);
  }
  function onPrimary() {
    if (st.stage === 'notes') { setStage('tempo'); return; }
    if (st.playing) { stop(); return; }
    if (st.stage === 'rhythm') { rs.toggle(); paintPrimary(); return; }
    play(true);
  }

  // ---------- sound ----------
  function sounds(i, time) {
    if (midiOn() && !settings.guideSnd && !st.listenOnly) return;
    const s = steps[i], eighth = 60 / st.bpm / 2, lvl = dynAt(ex, s).level;
    [['rh', 1], ['lh', 0.85]].forEach(([hd, bal]) => {
      const e = s[hd]; if (!e || !handOn(hd)) return;
      const dur = e.stac ? Math.min(eighth * 0.55, 0.22) : eighth * 1.8 * e.d / 2;
      const notes = e.notes.map(toMidi);
      const v = 0.55 * lvl * bal * (e.acc ? 1.4 : 1) / Math.sqrt(notes.length);
      if (e.grace) play1(toMidi(e.grace), time - 0.04, 0.06, v * 0.6);
      notes.forEach((m) => play1(m, time, dur, v));
    });
  }
  /** One note: through the piano when connected (real piano sound), else the built-in synth. */
  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) {
      const onMs = performance.now() + (time - audio.now()) * 1000;
      if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return;
    }
    audio.pianoNote(m, time, dur, v);
  }
  function goto(i) {
    if (st.playing) stop();
    i = ((i % N) + N) % N; render(i); waitGot.clear();
    audio.ensureAudio(); sounds(i, audio.now() + 0.01);
  }

  // ---------- transport ----------
  let timer = 0, raf = 0, nextIdx = 0, beatTime = 0, queue = [];
  const swingOff = () => { const beat = 60 / st.bpm; return st.swing ? beat * 2 / 3 : beat / 2; };
  let range = [0, N], loopsLeft = 1;
  /** opts: { a, b } = step range, loops = repeats of it */
  function play(scored, opts = {}) {
    if (!audio.ensureAudio()) return;
    if (st.playing) return;
    st.playing = true; st.listenOnly = !scored; st.scored = scored && midiOn();
    range = [opts.a ?? 0, opts.b ?? N]; loopsLeft = opts.loops || 1;
    screen.classList.add('playing');
    paintPrimary();
    nextIdx = range[0]; const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    if (st.scored) tempoReset();
    if (settings.count) { for (let k = 0; k < ex.beats; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); } t0 += ex.beats * beat; }
    beatTime = t0;
    queue.push({ t: t0 - 0.001, ci: 0 });
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function schedule() {
    const ahead = audio.now() + 0.15;
    while (st.playing === true) {
      const time = beatTime + (nextIdx % 2 ? swingOff() : 0);
      if (time > ahead) break;
      const s = steps[nextIdx];
      if (settings.met && s.slot % 2 === 0) audio.click(time, s.slot === 0);
      sounds(nextIdx, time); queue.push({ t: time, i: nextIdx });
      if (st.scored) expectStep(nextIdx, time);
      if (nextIdx % 2) beatTime += 60 / st.bpm;
      nextIdx++;
      if (nextIdx >= range[1]) {
        if (--loopsLeft > 0) { nextIdx = range[0]; queue.push({ t: beatTime - 0.15, loop: true }); continue; }
        queue.push({ t: beatTime + 0.05, end: true }); st.playing = 'ending'; break;
      }
    }
  }
  function tick() {
    const now = audio.now();
    if (st.scored) expireExp(now);
    while (queue.length && queue[0].t <= now) {
      const q = queue.shift();
      if (q.end) { stop(true); return; }
      if (q.loop) continue;
      if (q.ci !== undefined) { if (q.ci) fb(`${t('countInLabel')}: <b>${q.ci}</b>`); else fb(st.scored ? t('tempoHint') : ''); continue; }
      render(q.i);
      markActive();
    }
    raf = requestAnimationFrame(tick);
  }
  function stop(natural) {
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = st.playing; st.playing = false; screen.classList.remove('playing');
    if (was && !natural) { audio.hush(); silence(); }
    if (st.scored && was) { exp = exp.filter((x) => x.t <= audio.now()); expireExp(Infinity); showTempoFb(true, natural); }
    st.listenOnly = false; st.scored = false;
    idle(); paintPrimary();
  }

  // ---------- MIDI scoring ----------
  const waitGot = new Set();
  let waitSt = { ok: 0, bad: 0, done: false, stepBad: false, clean: true };
  let exp = [], tSt = null, graceExp = [];
  /** Grace notes are optional: pressing them is never a mistake. */
  const graceAt = (i) => { const s = steps[i], set = new Set(); ['rh', 'lh'].forEach((hd) => { const e = s[hd]; if (e && e.grace && handOn(hd)) set.add(toMidi(e.grace)); }); return set; };
  const expectedAt = (i) => { const s = steps[i], set = new Set(); ['rh', 'lh'].forEach((hd) => { const e = s[hd]; if (e && handOn(hd)) e.notes.forEach((n) => set.add(toMidi(n))); }); return set; };
  function resetScores() { waitSt = { ok: 0, bad: 0, done: false, stepBad: false, clean: true }; waitGot.clear(); clearMarks(); exp = []; tSt = null; }
  function toPlayable() { for (let k = 0; k < N; k++) { const j = (st.step + k) % N; if (expectedAt(j).size) { if (j !== st.step) render(j); return true; } } return false; }

  function handleNote(m, ts) {
    markActive();
    if (st.stage === 'rhythm') { rs.input(ts); return; }
    if (st.playing && st.scored) tempoNote(m, ts); // 'ending' = last notes still due
    else if (!st.playing && st.stage === 'notes') waitNote(m);
  }
  function waitNote(m) {
    if (waitSt.done) resetScores();
    if (!expectedAt(st.step).size && !toPlayable()) return;
    const need = expectedAt(st.step);
    if (!need.has(m) && graceAt(st.step).has(m)) { kb.flash(m, 'ok'); return; }
    if (!need.has(m)) { waitSt.bad++; waitSt.stepBad = true; waitSt.clean = false; kb.flash(m, 'bad'); showWaitFb(`${t('wrongNote')}: ${noteName(midiToName(m), settings.names === 'ru' ? 'ru' : 'en')}`); return; }
    waitGot.add(m); kb.flash(m, 'ok');
    if (![...need].every((x) => waitGot.has(x))) { showWaitFb(); return; }
    waitSt.ok++; staff.mark(st.step, waitSt.stepBad ? 'bad' : 'ok'); waitSt.stepBad = false; waitGot.clear();
    let j = st.step + 1;
    for (; j < N; j++) if (expectedAt(j).size) break;
    if (j >= N) {
      waitSt.done = true;
      const passed = waitSt.clean && st.hands === 'both';
      showWaitFb(null, true); render(0); toPlayable();
      if (passed) complete('notes');
      return;
    }
    render(j); showWaitFb();
  }
  function showWaitFb(msg, done) {
    const base = `<span class="ok">✓ ${waitSt.ok}</span> · <span class="bad">✗ ${waitSt.bad}</span>`;
    fb(done ? `${t('allDone')} ${base}${waitSt.bad ? '' : ' · ' + t('noErrors')}` : base + (msg ? ' · ' + msg : ''));
  }

  const eighthSec = () => 60 / st.bpm / 2;
  const tols = () => { const e8 = eighthSec(); return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.16, 0.035), 0.075) }; };
  function tempoReset() { exp = []; tSt = { ok: 0, meh: 0, miss: 0, bad: 0, sum: 0, abs: 0, n: 0 }; clearMarks(); }
  function expectStep(i, time) { if (!tSt) return; graceAt(i).forEach((m) => graceExp.push({ t: time, m })); if (graceExp.length > 16) graceExp.shift(); const need = expectedAt(i); if (!need.size) return; const occ = { i, left: need.size, cls: 'ok' }; need.forEach((m) => exp.push({ t: time, m, occ, hit: false })); }
  const RANK = { ok: 0, meh: 1, bad: 2 };
  const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);
  function tempoNote(m, ts) {
    if (!tSt) return;
    const T = audio.toAudioTime(ts), { win, tight } = tols();
    let best = null;
    for (const x of exp) { if (x.hit || x.m !== m) continue; const dt = T - x.t; if (Math.abs(dt) <= win && (!best || Math.abs(dt) < Math.abs(T - best.t))) best = x; }
    if (!best && graceExp.some((g) => g.m === m && Math.abs(T - g.t) <= win)) return;
    if (!best) {
      tSt.bad++;
      kb.flash(m, 'bad'); mark(st.step, 'bad');
      showTempoFb(false, false, t('wrongNote')); return;
    }
    best.hit = true;
    const dt = T - best.t, cls = Math.abs(dt) <= tight ? 'ok' : 'meh';
    tSt[cls]++; tSt.sum += dt; tSt.abs += Math.abs(dt); tSt.n++; best.occ.cls = worse(best.occ.cls, cls);
    kb.flash(m, cls);
    showTempoFb(false, false, cls === 'ok' ? t('even') : `${dt < 0 ? t('early') : t('late')} ${Math.round(Math.abs(dt) * 1000)} ${t('ms')}`);
  }
  function expireExp(now) {
    if (!tSt) return;
    const { win } = tols();
    while (exp.length && (exp[0].hit || exp[0].t + win < now)) {
      const x = exp.shift();
      if (!x.hit) { tSt.miss++; x.occ.cls = 'bad'; }
      if (--x.occ.left === 0) mark(x.occ.i, x.occ.cls);
    }
  }
  function showTempoFb(final, fullRun, msg) {
    if (!tSt) return;
    const s = tSt;
    let html = `<span class="ok">✓ ${s.ok}</span> · <span class="meh">~ ${s.meh}</span> · <span class="bad">✗ ${s.bad + s.miss}</span>`;
    if (final) {
      const tot = s.ok + s.meh + s.miss + s.bad;
      const pct = tot ? s.ok / tot : 0;
      html = `${t('result')}: <b>${Math.round(pct * 100)}%</b> ${t('evenPct')} · ` + html;
      if (fullRun && pct >= PASS && st.hands === 'both') {
        updateEx(ex.id, (p) => ({ ...p, bestTempo: Math.max(p.bestTempo || 0, st.bpm) }));
        if (ex.passAnyTempo || st.bpm >= ex.tempo.target) { fb(html); complete(st.stage); return; }
        setBpm(Math.min(ex.tempo.target, st.bpm + 4)); html += ` · ♩ → ${st.bpm}`;
      }
    } else if (msg) html += ' · ' + msg;
    fb(html);
  }
  function complete(stage) {
    const summary = fbEl.innerHTML;
    updateEx(ex.id, (p) => ({ ...p, stages: { ...p.stages, [stage]: true } }));
    if (stage === 'memory') scheduleReview(ex.id, true); // "by heart" is the gate for spaced review
    setStage(st.stage); // repaint stage marks
    fb(`<span class="ok">${ICON.check} ${t('stageDone')}</span> · ${summary}` + (stage === 'rhythm' ? ` · <b>${t('nowNotes')} →</b>` : ''));
    if (stage === 'rhythm') rs.say(`<span class="ok">${ICON.check} ${t('stageDone')}</span> · <b>${t('nowNotes')} →</b>`);
  }

  // ---------- export ----------
  function doExport() {
    const title = `${L(ex.title)} (${t('step')} ${ex.step}.${ex.number})`;
    const base = `jazzlab-${ex.id}`;
    download(new Blob([toMusicXML(ex, title)], { type: 'application/vnd.recordare.musicxml+xml' }), base + '.musicxml');
    setTimeout(() => download(new Blob([toMidiFile(ex, title)], { type: 'audio/midi' }), base + '.mid'), 400);
  }
  function download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => {
    if (e.type === 'on') { kb.down(e.note, true); handleNote(e.note, e.ts); } else kb.down(e.note, false);
  });
  let wasConnected = midiOn();
  const offState = onMidiState((s) => {
    if (s.connected !== wasConnected) { wasConnected = s.connected; if (!st.playing) setStage(st.stage); }
  });
  const onKey = (e) => {
    if (e.target.closest('input,select,textarea,summary')) return;
    if (e.code === 'Space') { e.preventDefault(); onPrimary(); }
    else if (st.stage === 'rhythm') { if (!e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) { e.preventDefault(); rs.tap(e.timeStamp); } }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goto(st.step + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goto(st.step - 1); }
  };
  document.addEventListener('keydown', onKey);

  setBpm(st.bpm);
  render(0);
  setStage(st.stage);
  updateEx(ex.id, (p) => p); // remember as last opened

  return () => {
    if (st.playing) stop();
    rs.stop();
    offNote(); offState(); document.removeEventListener('keydown', onKey);
    header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup());
  };
}
