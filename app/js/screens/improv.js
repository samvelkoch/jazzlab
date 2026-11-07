// Improvisation screen (per step, after the book): one rhythm at a time, 3–4 given notes, a 2-bar accompaniment loop.
// Stages: Rhythm (tap the chosen rhythm, bar on / bar off) → Echo (the piano plays a phrase, you repeat it) → Own (your phrase, then a bar of rest).
import { h, ICON, themeButton, midiChip } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { store, updateEx, exProgress, markActive, idle } from '../store.js';
import { toMidi, noteName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import { patternRhythm } from '../music/rhythm.js';
import * as audio from '../music/audio.js';
import { groove } from '../music/drums.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';

const PER = 8; // eighths per bar (4/4)
const GOOD_PHRASES = 4; // own phrases with a clean rhythm to mark the step's improvisation as done
const SHAPES = ['up', 'down', 'same', 'arch'];

export function renderImprov(root, { step, imp, rhythms }) {
  const id = step.id + '-imp';
  const settings = { met: true, names: 'en', pianoSnd: true, syl: 'food', impBeat: 'drums', ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  const pitches = imp.notes.map(toMidi);
  const sorted = pitches.map((m, k) => ({ m, k })).sort((a, b) => a.m - b.m); // low → high
  const st = {
    stage: store.get('impStage:' + id, 'rhythm'),
    ri: 0,
    bpm: store.get('tempo:' + id, imp.tempo || 72),
    swing: !!imp.swing,
    playing: false,
    good: 0, shapeN: 0
  };
  const nn = (k) => noteName(imp.notes[k], names);
  const lang = getLang();
  const pats = rhythms.map((r) => ({ ...r, rh: patternRhythm(r.rhythm, PER, lang, settings.syl) }));

  // ---------- layout ----------
  const stageBtn = (sid, n) => h('button', { type: 'button', 'data-stage': sid, onclick: () => setStage(sid) }, h('span.num', null, String(n)), t('imp_' + sid));
  const stages = h('nav.seg.stages', { 'aria-label': 'stages' }, stageBtn('rhythm', 1), stageBtn('echo', 2), stageBtn('own', 3));
  const header = h('header.top', null,
    h('a.iconbtn', { href: '#/', 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null,
      h('span.kicker', null, `${t('stepUpper')} ${step.n} · ${t('improv').toUpperCase()}`),
      h('span.title', null, `${t('impNotes')}: ${sorted.map((x) => nn(x.k)).join(', ')}`)),
    h('div.grow'), stages, h('div.grow'),
    h('span.chordchip', null, imp.chords.map((c) => c.name).join(' · ') + (imp.swing ? ` · ${t('swing').toLowerCase()}` : '')),
    midiChip(), themeButton());

  const title = h('h2'), sub = h('span.sub');
  const fbEl = h('span.fb', { 'aria-live': 'polite' });
  const cyc = [0, 1].map(() => { const beats = h('div.cbeats', null, ...Array.from({ length: 4 }, () => h('i'))); const role = h('b'), what = h('span'); return { el: h('div.cyc', null, role, what, h('div.grow'), beats), role, what, beats }; });
  const roll = h('div.roll');
  const panel = h('section.panel.imppanel', null,
    h('div.rhead', null, title, sub, h('div.grow'), fbEl),
    h('div.cycle', null, cyc[0].el, cyc[1].el),
    roll);

  const rhythmList = h('div.rlist');
  const sideTitle = h('h3'), sideBody = h('div.ideas');
  const aside = h('aside.impside', null,
    h('section.panel', null, h('h3', null, t('oneRhythm')), rhythmList),
    h('section.panel', null, sideTitle, sideBody));
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
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => (st.playing ? stop() : play()) });
  const footer = h('footer.actions', null, swingSeg, beatSeg, tempoBox, footHint, h('div.grow'), primary);
  const screen = h('div.exscreen.impscreen', null, header, h('main.ex.imp', null, h('div.improw', null, panel, aside), kbPanel), footer);
  root.replaceChildren(screen);

  function seg(items, value, cb, label) {
    const w = h('div.seg', { role: 'group', 'aria-label': label ? t(label) : null });
    items.forEach(([v, text]) => w.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), onclick: (e) => {
      w.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); cb(v);
    } }, text)));
    return w;
  }

  // ---------- keyboard: the given notes stay lit, with fingers ----------
  const lo = Math.min(...pitches) - 5, hi = Math.max(...pitches) + 5;
  audio.preloadPiano(Math.min(lo, 40), Math.max(hi, 76));
  const kb = createKeyboard(kbEl, [lo, hi], { names: settings.names, onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.5, 0.55); if (!midiOn()) input(m, performance.now()); } });
  const lit = { notes: imp.notes, f: imp.f || [] };
  kb.show(imp.hand === 'lh' ? { rh: null, lh: lit } : { rh: lit, lh: null }, { rh: null, lh: null }, 'both');
  const midiOn = () => midiState().connected;

  // ---------- roll (rhythm bars + one row per given note) ----------
  const pct = (slot) => (slot / PER) * 100;
  let rollNotes = [], ghost = [], mine = [], ticks = [], contour = null, head = null;
  function buildRoll() {
    const r = pats[st.ri].rh;
    const kids = [];
    for (let k = 0; k < PER; k++) {
      if (k % 2 === 0) kids.push(h('div.bline', { style: `left:${pct(k)}%` }));
      kids.push(h('div.bnum' + (k % 2 ? '.and' : ''), { style: `left:${pct(k)}%` }, k % 2 ? '+' : String(k / 2 + 1)));
    }
    r.rests.forEach((x) => kids.push(h('div.lrest', { style: `left:${pct(x.slot)}%;width:calc(${pct(x.len || 1)}% - 6px)` }, x.syl)));
    rollNotes = r.onsets.map((o) => h('div.lnote', { style: `left:${pct(o.slot)}%;width:calc(${pct(o.len)}% - 6px)`, 'data-slot': o.slot }, h('span', null, o.syl)));
    kids.push(...rollNotes);
    if (st.stage !== 'rhythm') {
      sorted.slice().reverse().forEach((x, row) => kids.push(h('div.prow', { style: `--row:${row}` }, h('b', null, nn(x.k)))));
    } else kids.push(h('div.tline'));
    head = h('div.head'); contour = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    contour.setAttribute('class', 'contour'); contour.setAttribute('viewBox', '0 0 100 100'); contour.setAttribute('preserveAspectRatio', 'none');
    roll.dataset.rows = st.stage === 'rhythm' ? 0 : sorted.length;
    roll.replaceChildren(h('div.rinner', null, ...kids, contour, head));
    ghost = []; mine = []; ticks = [];
  }
  const rowOf = (m) => { let best = 0, bd = 1e9; sorted.forEach((x, k) => { const d = Math.abs(x.m - m); if (d < bd) { bd = d; best = k; } }); return { row: sorted.length - 1 - best, exact: bd === 0 }; };
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
  function clearGhost() { ghost.forEach((x) => x.el.remove()); ghost = []; }
  function drawContour() {
    if (mine.length < 2) { contour.innerHTML = ''; return; }
    const n = sorted.length, y = (row) => ((row + 0.5) / n) * 100;
    const pts = mine.map((x) => `${pct(x.slotPos) + 2},${y(x.row)}`).join(' ');
    contour.innerHTML = `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="5 6" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`;
  }

  // ---------- side: rhythms + ideas ----------
  function paintRhythms() {
    rhythmList.replaceChildren(...pats.map((p, k) => {
      const cells = [];
      for (let s = 0; s < PER;) {
        const o = p.rh.onsets.find((x) => x.slot === s);
        if (o) { cells.push(h('i.n', { style: `flex:${o.len} 1 0` })); s += o.len; } else { cells.push(h('i.r', { style: 'flex:1 1 0' })); s++; }
      }
      const syl = [...p.rh.onsets.map((o) => [o.slot, o.syl]), ...p.rh.rests.map((r) => [r.slot, r.syl])].sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(' ');
      return h('button.rpick', { type: 'button', 'aria-pressed': String(k === st.ri), onclick: () => { if (st.playing) stop(); st.ri = k; paintRhythms(); buildRoll(); } },
        h('span.cells', null, ...cells), h('small', null, `${t('exercise')} ${p.number} · ${syl}`));
    }));
  }
  const SHAPE_PATH = { up: 'M4 22 L18 22 L30 13 L42 4 L50 4', down: 'M4 4 L18 4 L30 13 L42 22 L50 22', same: 'M4 13 L50 13', arch: 'M4 22 L18 10 L30 4 L42 10 L50 22' };
  let lastShape = null;
  function paintSide() {
    const lowHigh = `${nn(sorted[0].k)} → ${nn(sorted[sorted.length - 1].k)}`;
    if (st.stage === 'rhythm') {
      sideTitle.textContent = t('impHowSounds');
      const p = pats[st.ri];
      sideBody.replaceChildren(idea('same', t('rhythmWords'), [...p.rh.onsets.map((o) => [o.slot, o.syl]), ...p.rh.rests.map((r) => [r.slot, r.syl])].sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(' '), false),
        idea('arch', t('impAccomp'), imp.chords.map((c) => c.name).join(' · ') + ' · ' + t('impLoop'), false));
      return;
    }
    sideTitle.textContent = st.stage === 'echo' ? t('impEchoShapes') : t('impIdeas');
    sideBody.replaceChildren(
      idea('up', t('shape_up'), lowHigh, lastShape === 'up'),
      idea('down', t('shape_down'), `${nn(sorted[sorted.length - 1].k)} → ${nn(sorted[0].k)}`, lastShape === 'down'),
      idea('same', t('shape_same'), t('shape_same_note'), lastShape === 'same'),
      idea('arch', t('shape_arch'), t('shape_arch_note'), lastShape === 'arch'));
  }
  function idea(shape, title, note, on) {
    const svg = `<svg width="54" height="26" viewBox="0 0 54 26" aria-hidden="true"><path d="${SHAPE_PATH[shape]}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return h('div.idea' + (on ? '.on' : ''), null, h('span.ic', { html: svg }), h('div', null, h('b', null, title), h('small', null, note)));
  }

  // ---------- stage ----------
  function setStage(sid) {
    if (st.playing) stop();
    st.stage = sid; store.set('impStage:' + id, sid);
    screen.dataset.istage = sid;
    stages.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.stage === sid)));
    title.textContent = t('impT_' + sid); sub.textContent = t('impS_' + sid);
    footHint.textContent = t('impF_' + sid);
    lastShape = null;
    buildRoll(); paintSide(); paintCycle(-1, 0); paintPrimary();
    fb(t('impStart'));
  }
  const roles = () => (st.stage === 'echo' ? [['piano', 'impPhrase'], ['you', 'impRepeat']] : [['you', st.stage === 'rhythm' ? 'impTapRhythm' : 'impOwnPhrase'], ['rest', 'impListen']]);
  const youBar = () => (st.stage === 'echo' ? 1 : 0);
  function paintCycle(bar, beat) {
    roles().forEach(([role, what], k) => {
      const c = cyc[k], on = bar === k;
      c.role.textContent = t('role_' + role); c.what.textContent = t(what);
      c.el.className = 'cyc ' + role + (on ? ' on' : '');
      [...c.beats.children].forEach((i, b) => i.classList.toggle('on', on && b <= beat));
    });
  }
  function paintPrimary() { primary.innerHTML = st.playing ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`; }
  function setBpm(v) {
    st.bpm = Math.max(40, Math.min(200, Math.round(v)));
    bpmOut.innerHTML = `♩ ${st.bpm}`;
    store.set('tempo:' + id, st.bpm);
  }
  function fb(html) { fbEl.innerHTML = html; }

  // ---------- sound ----------
  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) {
      const onMs = performance.now() + (time - audio.now()) * 1000;
      if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return;
    }
    audio.pianoNote(m, time, dur, v);
  }
  /** Accompaniment for one slot of a bar (book style: bass on 1 and 3, chord on 2 and 4 | chord on every beat). */
  function accomp(barK, slot, time, beat) {
    const c = imp.chords[barK % imp.chords.length];
    if (slot % 2) return;
    const b = slot / 2; // beat 0..3
    if (imp.style === 'stabs') {
      if (b === 0 && c.bass[0]) play1(toMidi(c.bass[0]), time, beat * 1.6, 0.42);
      c.chord.forEach((n) => play1(toMidi(n), time, beat * 0.45, 0.26));
    } else {
      if (b % 2 === 0) { const n = c.bass[(b / 2) % c.bass.length]; if (n) play1(toMidi(n), time, beat * 0.9, 0.45); }
      else c.chord.forEach((n) => play1(toMidi(n), time, beat * 0.5, 0.28));
    }
  }

  // ---------- echo phrases ----------
  function makePhrase() {
    const shape = SHAPES[st.shapeN++ % SHAPES.length];
    const ons = pats[st.ri].rh.onsets, n = ons.length, m = sorted.length;
    const idx = (k) => {
      const f = n > 1 ? k / (n - 1) : 0;
      if (shape === 'up') return Math.round(f * (m - 1));
      if (shape === 'down') return Math.round((1 - f) * (m - 1));
      if (shape === 'same') return Math.min(1, m - 1);
      return Math.round((1 - Math.abs(2 * f - 1)) * (m - 1)); // arch
    };
    return { shape, notes: ons.map((o, k) => ({ slot: o.slot, len: o.len, m: sorted[idx(k)].m })) };
  }

  // ---------- transport: endless 2-bar cycle after a 1-bar count-in ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null, phrase = null, exp = [], barSt = null;
  const swingOff = () => { const beat = 60 / st.bpm; return st.swing ? beat * 2 / 3 : beat / 2; };
  function play() {
    if (!audio.ensureAudio() || st.playing) return;
    st.playing = true; screen.classList.add('playing'); paintPrimary();
    const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += 4 * beat; beatTime = t0; g = 0;
    run = { t0, beat, swing: st.swing };
    clearMine(); clearGhost();
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function schedule() {
    const ahead = audio.now() + 0.15, beat = 60 / st.bpm;
    while (st.playing) {
      const slot = g % PER, bar = Math.floor(g / PER), k = bar % 2;
      const time = beatTime + (slot % 2 ? swingOff() : 0);
      if (time > ahead) break;
      if (slot === 0) {
        if (k === 0 && st.stage === 'echo') { phrase = makePhrase(); queue.push({ t: time - 0.05, phrase }); }
        if (k === youBar()) { exp = []; queue.push({ t: time - 0.12, youStart: bar }); }
        if (k === youBar() + 0 && bar > 0 || (k !== youBar() && bar > 0)) { /* nothing */ }
      }
      accomp(k, slot, time, beat);
      if (settings.impBeat === 'drums') groove(slot, time, st.swing); else if (settings.met && slot % 2 === 0) audio.click(time, slot === 0);
      if (k === 0 && st.stage === 'echo' && phrase) { const pn = phrase.notes.find((x) => x.slot === slot); if (pn) play1(pn.m, time, swingOff() * pn.len * 0.95, 0.55); }
      if (k === youBar()) { const o = pats[st.ri].rh.onsets.find((x) => x.slot === slot); if (o) exp.push({ t: time, slot, hit: false, m: phrase && st.stage === 'echo' ? (phrase.notes.find((x) => x.slot === slot) || {}).m : null }); }
      if (k === youBar() && slot === PER - 1) queue.push({ t: time + beat + 0.25, youEnd: bar });
      if (slot % 2) beatTime += beat;
      g++;
    }
  }
  function posAt(T) {
    if (!run) return 0;
    const beats = (T - run.t0) / run.beat, w = Math.floor(beats), f = beats - w, sw = run.swing ? 2 / 3 : 0.5;
    return 2 * w + (f < sw ? f / sw : 1 + (f - sw) / (1 - sw));
  }
  function tick() {
    const now = audio.now();
    while (queue.length && queue[0].t <= now) {
      const q = queue.shift();
      if (q.ci !== undefined) { fb(`${t('countInLabel')}: <b>${q.ci}</b>`); continue; }
      if (q.phrase) { clearGhost(); clearMine(); q.phrase.notes.forEach((x) => addBlock(ghost, 'ghost', x.slot, x.len, x.m)); fb(t('impListenPhrase')); }
      if (q.youStart !== undefined) { barSt = { ok: 0, meh: 0, miss: 0, extra: 0, notes: [] }; if (st.stage !== 'echo') { clearMine(); } fb(t('impYourTurn')); }
      if (q.youEnd !== undefined) finishBar();
    }
    const p = posAt(now);
    if (p >= 0) {
      const bar = Math.floor(p / PER), inBar = p - bar * PER;
      head.style.left = pct(inBar) + '%';
      paintCycle(bar % 2, Math.floor(inBar / 2));
      rollNotes.forEach((n) => { const s = +n.dataset.slot; n.classList.toggle('now', bar % 2 === youBar() && inBar >= s && inBar < s + 1); });
      markActive();
    }
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = st.playing; st.playing = false; run = null; exp = []; barSt = null;
    screen.classList.remove('playing');
    if (was) { audio.hush(); silence(); }
    paintCycle(-1, 0); head.style.left = '0%'; idle(); paintPrimary();
  }

  // ---------- input + scoring (rhythm only: "wrong" notes are allowed) ----------
  let lastIn = -1e9;
  const tols = () => { const e8 = 60 / st.bpm / 2; return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.2, 0.04), 0.08) }; };
  function input(m, ts) {
    markActive();
    if (!st.playing || !barSt) return;
    const T = audio.toAudioTime(ts), { win, tight } = tols();
    if (st.stage === 'rhythm') { if (ts - lastIn < 70) return; lastIn = ts; }
    const eighth = (slot) => (slot % 2 ? 60 / st.bpm - swingOff() : swingOff());
    let best = null;
    for (const x of exp) { if (x.hit) continue; const dt = T - x.t; if (Math.abs(dt) <= win && (!best || Math.abs(dt) < Math.abs(T - best.t))) best = x; }
    if (!best) {
      // a chord tone pressed together with the previous note is not an extra hit
      if (st.stage !== 'rhythm' && exp.some((x) => x.hit && Math.abs(T - x.t) <= win)) { const prev = exp.filter((x) => x.hit).pop(); addBlock(mine, 'mine', prev.slot, 1, m); return; }
      if (exp.length && T > exp[0].t - win) { barSt.extra++; addTick(Math.max(0, Math.min(PER - 0.2, posAt(T) % PER)), 'bad', t('extraW')); }
      return;
    }
    best.hit = true;
    const dt = T - best.t, cls = Math.abs(dt) <= tight ? 'ok' : 'meh';
    barSt[cls]++;
    const sp = best.slot + dt / eighth(best.slot);
    if (st.stage === 'rhythm') addTick(sp, cls, cls === 'ok' ? '✓' : `${dt < 0 ? t('earlyW') : t('lateW')} ${Math.round(Math.abs(dt) * 1000)}`);
    else {
      const o = pats[st.ri].rh.onsets.find((x) => x.slot === best.slot);
      const el = addBlock(mine, 'mine', sp, o ? o.len : 1, m);
      el.classList.add(cls);
      if (st.stage === 'echo' && best.m != null && best.m !== m) el.classList.add('other');
      barSt.notes.push({ m, slot: best.slot, same: best.m == null || best.m === m });
      drawContour();
    }
    const n = rollNotes.find((x) => +x.dataset.slot === best.slot); if (n) n.classList.add(cls);
  }
  function finishBar() {
    if (!barSt) return;
    barSt.miss = exp.filter((x) => !x.hit).length;
    exp.filter((x) => !x.hit).forEach((x) => { const n = rollNotes.find((r) => +r.dataset.slot === x.slot); if (n) n.classList.add('bad'); });
    const total = exp.length, hit = barSt.ok + barSt.meh, clean = barSt.miss === 0 && barSt.extra === 0;
    let html = `${t('rhythmW')}: <b>${hit}/${total}</b>` + (barSt.extra ? ` · ${t('extraTap')}: ${barSt.extra}` : '') + (clean ? ` <span class="ok">✓</span>` : '');
    if (st.stage === 'echo') { const same = barSt.notes.filter((x) => x.same).length; html += ` · ${t('impSameNotes')}: ${same}/${total}`; }
    if (st.stage === 'own' && barSt.notes.length) {
      const ms = barSt.notes.map((x) => x.m), up = ms.every((v, k) => !k || v >= ms[k - 1]), down = ms.every((v, k) => !k || v <= ms[k - 1]);
      lastShape = ms.every((v) => v === ms[0]) ? 'same' : up ? 'up' : down ? 'down' : 'arch';
      if (lastShape !== 'arch' || ms.length > 2) html += ` · ${t('shapeW')}: ${t('shape_' + lastShape).toLowerCase()}`;
      paintSide();
      if (clean) {
        st.good++;
        if (st.good >= GOOD_PHRASES && !exProgress(id).stages.tempo) {
          updateEx(id, (p) => ({ ...p, stages: { ...p.stages, tempo: true, own: true } }));
          html += ` · <b>${t('impDone')}</b>`;
        }
      }
    }
    if (st.stage === 'rhythm' && clean) html += ` · ${t('impRhythmOk')}`;
    fb(html);
    barSt = null;
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => { if (e.type === 'on') { kb.down(e.note, true); input(e.note, e.ts); } else kb.down(e.note, false); });
  const onKey = (e) => {
    if (e.target.closest('input,select,textarea,summary')) return;
    if (e.code === 'Space') { e.preventDefault(); if (st.playing) stop(); else play(); return; }
    if (st.stage === 'rhythm' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1) {
      e.preventDefault(); audio.ensureAudio(); play1(sorted[0].m, audio.now() + 0.005, 0.15, 0.5); input(-1, e.timeStamp);
    }
  };
  document.addEventListener('keydown', onKey);

  setBpm(st.bpm);
  paintRhythms();
  setStage(st.stage);
  updateEx(id, (p) => p);

  return () => {
    if (st.playing) stop();
    offNote(); document.removeEventListener('keydown', onKey);
    header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup());
  };
}
