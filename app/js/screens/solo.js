// Solo screen (improvisation, kind "solo", content/solos/<id>.json): the band plays the whole form (left hand by the
// pattern, drums), you play your own right hand. Nothing is compared with a reference; every chorus is scored for
// inside (palette notes, approaches), grid, phrases / rests and target notes (app/js/music/solo.js), at the chorus end,
// from the notes recorded in that chorus. Live feedback on every key is instant. A run is solo.choruses choruses;
// the run passes when every threshold of solo.pass is met (mean over the choruses). Each run is recorded like a
// performance (store 'recordings', kind 'solo'), with listen back / MIDI download / delete.
import { h, ICON, themeButton, midiChip, sessionChip, trackFootH } from '../ui.js';
import { t, L, plural, getLang } from '../i18n.js';
import { markTerms } from '../glossary.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview, reviews } from '../store.js';
import { noteName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import { patternBars, parseChord, patSpell } from '../music/forms.js';
import { paletteAt, scoreChorus, combine, checks, passed, coverage, makeCall, roleOf, gridIndex, PER, APPROACH_E8 } from '../music/solo.js';
import { gridDev, tols, rhythmAccuracy } from '../music/recording.js';
import { groove } from '../music/drums.js';
import { recordingToMidi } from '../music/export.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';

const MAX_RECS = 10; // solo recordings kept (performances are kept apart)
const TAP_DUR = 0.3;
const r3 = (x) => Math.round(x * 1000) / 1000;
const pcm = (m) => ((m % 12) + 12) % 12;

export function renderSolo(root, { track, itemId, item, solo, form, pattern, back }) {
  const settings = { met: true, names: 'en', pianoSnd: true, impBeat: 'drums', ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  const bars = form.bars, NB = bars.length;
  const lhNotes = patternBars(pattern, bars); // the band's left hand, bar by bar
  const hand = { lo: 60, hi: 72, ...(solo.hand || {}) };
  const CH = Math.max(1, solo.choruses || 1);
  const st = { mode: 'play', bpm: store.get('tempo:' + itemId, form.tempo || 66), swing: !!form.swing && form.style !== 'bossa' };
  let wasDue = !!(reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date());
  const midiOn = () => midiState().connected;
  const myRecs = () => store.get('recordings', []).filter((r) => r.itemId === itemId);
  let current = myRecs()[0] || null;

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('soloUpper')}`), h('span.title', null, L(item.title || solo.title))),
    h('div.grow'), sessionChip(itemId), midiChip(), themeButton());
  const fbEl = h('span.fb', { 'aria-live': 'polite' });
  const chorusEl = h('span.barno');
  const palEl = h('div.solopal');
  const roleWord = { you: t('soYou'), rest: t('soRest'), band: t('soBand') };
  const marks = [];
  const cells = bars.map((c, k) => {
    const role = roleOf(solo, k), mk = h('span.fmark');
    marks.push(mk);
    return h('div.fcell', { 'data-bar': k, 'data-role': role }, h('span.fno', null, String(k + 1)), mk, h('b.fchord', null, c),
      h('small.frole', null, roleWord[role]),
      h('div.fbeats', null, ...Array.from({ length: 4 }, () => h('i'))));
  });
  const grid = h('div.fgrid' + (NB > 16 ? '.long' : ''), null, ...cells);
  // the current bar stays in view: inside a scrolling grid (32 bars, as form.js), then inside the panel (desktop) or the page
  // (a phone: the panel grows, the keyboard sticks over the page above the footer, so a 16- or 32-bar grid runs under it)
  const scrolls = (el) => el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY);
  const keepInView = (k) => {
    const c = cells[k]; if (!c) return;
    if (scrolls(grid) && (c.offsetTop < grid.scrollTop || c.offsetTop + c.offsetHeight > grid.scrollTop + grid.clientHeight)) grid.scrollTop = Math.max(0, c.offsetTop - 8);
    const r = c.getBoundingClientRect(), inPanel = scrolls(panel);
    let top, bottom;
    if (inPanel) { const pr = panel.getBoundingClientRect(); top = pr.top; bottom = pr.bottom; }
    else {
      top = Math.max(0, header.getBoundingClientRect().bottom);
      bottom = Math.min(innerHeight, footer.getBoundingClientRect().top, getComputedStyle(kbPanel).position === 'sticky' ? kbPanel.getBoundingClientRect().top : Infinity);
    }
    const dy = r.bottom > bottom ? r.bottom - bottom + 8 : r.top < top ? r.top - top - 8 : 0;
    if (!dy) return;
    if (inPanel) panel.scrollTop += dy; else window.scrollBy(0, dy);
  };
  const board = h('div.soloboard');
  const summary = h('div.dsummary.perfsum');
  const sumActs = h('div.perfacts');
  const list = h('div.perflist');
  const panel = h('section.panel.formpanel.solopanel', null,
    h('div.staffhead', null, chorusEl, h('div.grow'), fbEl),
    palEl, grid, board,
    h('p.muted.dabout', null, markTerms(L(item.about || solo.about))),
    summary, sumActs, list);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const bpmOut = h('output.bpm');
  const tempoBox = h('div.stepper', null,
    h('button', { type: 'button', 'aria-label': t('slower'), onclick: () => setBpm(st.bpm - 4) }, '−'), bpmOut,
    h('button', { type: 'button', 'aria-label': t('faster'), onclick: () => setBpm(st.bpm + 4) }, '+'));
  const modeSeg = seg([['play', t('fPlay')], ['listen', t('fListen')]], st.mode, (v) => { if (run) halt(); st.mode = v; paintHint(); }, 'rMode');
  const swingSeg = seg([['straight', t('straight')], ['swing', t('swing')]], st.swing ? 'swing' : 'straight', (v) => { st.swing = v === 'swing'; }, 'eighths');
  const beatSeg = seg([['drums', t('drums')], ['click', t('metronome')]], settings.impBeat, (v) => { settings.impBeat = v; store.set('settings', { ...store.get('settings', {}), impBeat: v }); }, 'backing');
  const footHint = h('span.foothint');
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => toggle() });
  const footer = h('footer.actions', null, h('div.footsegs', null, modeSeg, form.style === 'bossa' ? null : swingSeg, beatSeg), tempoBox, footHint, h('div.grow'), primary);
  const screen = h('div.exscreen.formscreen.soloscreen', null, header, h('main.ex', null, panel, kbPanel), footer);
  root.replaceChildren(screen);
  const footRO = trackFootH(screen, footer); // phone: the keyboard sticks right above the footer

  function seg(items, value, cb, label) {
    const w = h('div.seg', { role: 'group', 'aria-label': label ? t(label) : null });
    items.forEach(([v, text]) => w.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), onclick: (e) => {
      if (run && run.kind === 'run' && label !== 'rMode') return; // swing and backing are fixed while a run is scored
      w.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); cb(v);
    } }, text)));
    return w;
  }

  // ---------- keyboard: the palette ----------
  const kLo = hand.lo - 5, kHi = hand.hi + 7;
  audio.preloadPiano(Math.min(kLo, ...lhNotes.flat().map((e) => e.m)) - 1, kHi + 2);
  const kb = createKeyboard(kbEl, [kLo, kHi], { names: settings.names, center: Math.round((hand.lo + hand.hi) / 2), onPress: (m) => {
    audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.5, 0.55);
    if (!midiOn()) input(m, audio.toAudioTime(performance.now()), 0.6, TAP_DUR); // with a piano, MIDI is the one source
  } });
  kbEl.querySelectorAll('.key').forEach((k) => { const m = +k.dataset.m; if (m < hand.lo || m > hand.hi) k.classList.add('far'); });
  const nameOf = (m, pal) => { const ch = parseChord(pal.chord); return noteName(patSpell(m, pcm(m - ch.pc), ch, !!form.flats), names); };
  const DEG = { 0: ['base', '1'], 3: ['third', '3'], 4: ['third', '3'], 6: ['bass', '5'], 7: ['bass', '5'], 8: ['bass', '5'], 9: ['seventh', '6'], 10: ['seventh', '7'], 11: ['seventh', '7'] };
  // a seven-note palette is spelt one letter per note from its root (A dorian: F♯, not G♭); otherwise nameOf per note
  const LET = 'CDEFGAB', NAT = [0, 2, 4, 5, 7, 9, 11];
  function scaleSpelling(pcs, pal) {
    if (pcs.length !== 7 || pcs[0] !== pal.root) return null;
    const ch = parseChord(pal.chord), start = LET.indexOf(patSpell(60 + pal.root, pcm(pal.root - ch.pc), ch, !!form.flats)[0]);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const l = LET[(start + i) % 7], alt = pcm(pcs[i] - NAT[LET.indexOf(l)]);
      if (alt !== 0 && alt !== 1 && alt !== 11) return null;
      out.push(noteName(l + (alt === 1 ? '#' : alt === 11 ? 'b' : '') + '4', names));
    }
    return out;
  }
  let palKey = '';
  function paintPalette(bar, slot) {
    const pal = paletteAt(solo, bars, bar, slot), ch = parseChord(pal.chord);
    const key = `${pal.chord}|${[...pal.pcs].sort().join(',')}`;
    if (key === palKey) return pal;
    palKey = key;
    const map = {};
    for (let m = kLo - 12; m <= kHi + 12; m++) {
      const pc = pcm(m);
      if (pal.chordPcs.has(pc)) {
        const deg = pcm(pc - ch.pc), [cls, lab] = deg === 9 && ch.qual === 'dim7' ? ['seventh', '7'] : DEG[deg] || ['bass', ''];
        map[m] = { cls, label: m >= hand.lo && m <= hand.hi ? lab : '' };
      } else if (pal.pcs.has(pc)) map[m] = { cls: 'pal' }; // scale notes: a soft tint, the chord tones stand out
    }
    kb.mark(map, { reveal: false });
    // the palette line: from the scale root, chord tones stressed
    const pcs = [...pal.pcs].sort((a, b) => pcm(a - pal.root) - pcm(b - pal.root));
    const spelt = scaleSpelling(pcs, pal);
    palEl.replaceChildren(h('b', null, `${t('soPalette')}:`), ' ',
      ...pcs.flatMap((pc, i) => [h('span' + (pal.chordPcs.has(pc) ? '.ct' : ''), null, spelt ? spelt[i] : nameOf(60 + pc, pal)), ' ']),
      h('span.solochord', null, `· ${pal.chord}`));
    return pal;
  }

  function play1(m, time, dur, v, mv = 25 + 130 * v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, mv, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const fb = (html) => { fbEl.innerHTML = html; };
  function setBpm(v) { if (run) return; st.bpm = Math.max(40, Math.min(160, Math.round(v))); bpmOut.innerHTML = `♩ ${st.bpm}`; store.set('tempo:' + itemId, st.bpm); }
  function paintPrimary() { primary.innerHTML = run ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`; }
  function paintHint() { footHint.textContent = st.mode === 'listen' ? t('soListenHint') : midiOn() ? t('soPlayHint') : t('soPlayHintScreen'); }
  function paintChorus(k) { chorusEl.textContent = `${t('chorusW')} ${k + 1}${CH > 1 ? ` / ${CH}` : ''}`; }
  const startText = () => (CH > 1 ? t('soStartN').replace('{n}', CH) : solo.call ? t('soStartCall') : !solo.phrasing ? t('soStartFree') : t('soStart'));

  // ---------- transport: a run (play / listen) or the playback of a recording ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null, lastOut = null;
  const playDown = new Set();
  function newRun(kind, bpm, swing, choruses, t0) {
    const beat = 60 / bpm;
    return { kind, t0, beat, bpm, swing, choruses, total: choruses * NB * PER, chorusLen: NB * 4 * beat, swingOff: swing ? beat * 2 / 3 : beat / 2, bandQ: [], calls: [], notes: [], held: new Map(), scores: [] };
  }
  const timeOfG = (r, gg) => r.t0 + Math.floor(gg / 2) * r.beat + (gg % 2 ? r.swingOff : 0);
  function begin(r) {
    run = r; g = 0; beatTime = r.t0; lastOut = null;
    screen.classList.add('playing'); paintPrimary();
    cells.forEach((c) => c.classList.remove('cur'));
    clearMarks();
    // the end: chorus boards, then the finish one beat after the last chorus
    for (let c = 0; c < r.choruses; c++) queue.push({ t: r.t0 + (c + 1) * r.chorusLen + 0.3, chorusEnd: c });
    queue.push({ t: r.t0 + r.choruses * r.chorusLen + Math.max(0.6, r.beat) + (r.finishExtra || 0), finish: true });
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function start() {
    if (run || !audio.ensureAudio()) return;
    const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += 4 * beat;
    board.replaceChildren();
    begin(newRun(st.mode === 'listen' ? 'listen' : 'run', st.bpm, st.swing, CH, t0));
    paintChorus(0);
  }
  function playback(rec) {
    if (!audio.ensureAudio()) return;
    if (run) halt();
    const notes = rec.notes.slice().sort((a, b) => a.t - b.t);
    const r = newRun('play', rec.bpm, rec.swing, rec.choruses, audio.now() + 0.25);
    r.notes = notes; r.pi = 0; r.band = (rec.band || []).slice().sort((a, b) => a.t - b.t); r.bi = 0; r.rec = rec;
    r.finishExtra = Math.max(0, notes.reduce((x, n) => Math.max(x, n.t + n.d), 0) - r.choruses * r.chorusLen);
    begin(r); paintChorus(0);
    fb(t('perfPlaying')); paintList();
  }
  function schedule() {
    if (!run) return;
    const r = run, ahead = audio.now() + 0.15, drums = settings.impBeat === 'drums';
    while (g <= r.total) {
      const slot = g % PER, barG = Math.floor(g / PER), bar = barG % NB, chorus = Math.floor(barG / NB);
      const time = beatTime + (slot % 2 ? r.swingOff : 0);
      if (time > ahead) break;
      if (g === r.total) { // after the last chorus: one closing downbeat, the band's root
        if (drums) groove(0, time, { swing: r.swing, style: form.style, bar: barG }); else audio.click(time, true);
        lhNotes[0].filter((e) => e.t === 0).forEach((e) => play1(e.m, time, r.beat * 1.5, 0.35));
        queue.push({ t: time, barStart: -1 });
        g++; break;
      }
      if (drums) groove(slot, time, { swing: r.swing, style: form.style, bar: barG }); else if (settings.met && slot % 2 === 0) audio.click(time, slot === 0);
      lhNotes[bar].filter((e) => e.t === slot).forEach((e) => play1(e.m, time, e.stac ? Math.min(r.beat * 0.5, 0.25) : r.beat * e.d / 2 * 0.9, 0.35));
      // the band's call: a new phrase on the first bar of each band stretch
      if (r.kind !== 'play' && slot === 0 && roleOf(solo, bar) === 'band' && (bar === 0 || roleOf(solo, bar - 1) !== 'band')) {
        makeCall(solo, bars, bar, Math.random).notes.forEach((n) => {
          const gg = g + n.slot, at = timeOfG(r, gg), d = Math.max(0.12, r.swingOff * n.len * 0.95);
          r.bandQ.push({ g: gg, m: n.m, d });
          r.calls.push({ t: r3(at - r.t0), d: r3(d), m: n.m, v: 0.55 });
        });
      }
      r.bandQ.filter((n) => n.g === g).forEach((n) => { play1(n.m, time, n.d, 0.55); queue.push({ t: time, kd: n.m, on: true }, { t: time + n.d, kd: n.m, on: false }); });
      r.bandQ = r.bandQ.filter((n) => n.g > g);
      if (slot === 0) queue.push({ t: time, barStart: bar, chorus });
      if (slot === PER - 1) queue.push({ t: time + r.beat * 0.5 + 0.3, barEnd: bar, chorus });
      queue.push({ t: time, g });
      if (slot % 2) beatTime += r.beat;
      g++;
    }
    if (r.kind === 'play') {
      while (r.bi < r.band.length && r.t0 + r.band[r.bi].t <= ahead) {
        const n = r.band[r.bi++], at = r.t0 + n.t;
        play1(n.m, at, Math.max(n.d, 0.05), 0.5);
      }
      while (r.pi < r.notes.length && r.t0 + r.notes[r.pi].t <= ahead) {
        const n = r.notes[r.pi++], at = r.t0 + n.t, d = Math.max(n.d, 0.05);
        play1(n.m, at, d, 0.15 + 0.6 * n.v, n.v * 127);
        queue.push({ t: at, kd: n.m, on: true }, { t: at + d, kd: n.m, on: false });
      }
    }
  }
  function tick() {
    const now = audio.now(), due = [];
    queue = queue.filter((q) => (q.t <= now ? (due.push(q), false) : true));
    due.sort((a, b) => a.t - b.t).forEach(handle);
    if (run) raf = requestAnimationFrame(tick);
  }
  function handle(q) {
    if (!run) return;
    if (q.ci !== undefined) fb(`${t('countInLabel')}: <b>${q.ci}</b>`);
    else if (q.barStart !== undefined) {
      cells.forEach((c, k) => { c.classList.toggle('cur', k === q.barStart); if (k !== q.barStart) c.querySelectorAll('.fbeats i').forEach((i) => i.classList.remove('on')); });
      if (q.barStart >= 0) {
        keepInView(q.barStart); paintChorus(q.chorus);
        if (q.barStart === 0 && q.chorus > 0) clearMarks();
        if (run.kind === 'run' && q.barStart === 0 && q.chorus === 0) fb(`<b class="bad">● REC</b>`);
      }
    } else if (q.g !== undefined) {
      const slot = q.g % PER, bar = Math.floor(q.g / PER) % NB;
      cells[bar].querySelectorAll('.fbeats i').forEach((i, b) => i.classList.toggle('on', b <= slot >> 1));
      if (slot === 0 || slot === 4) paintPalette(bar, slot);
      if (run.kind === 'run') markActive();
    } else if (q.barEnd !== undefined) { if (run.kind === 'run') paintBar(q.barEnd, q.chorus); }
    else if (q.chorusEnd !== undefined) { if (run.kind === 'run') finishChorus(q.chorusEnd); }
    else if (q.kd !== undefined) { kb.down(q.kd, q.on); if (q.on) playDown.add(q.kd); else playDown.delete(q.kd); }
    else if (q.finish) finish(true);
  }
  function halt() {
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = run; run = null;
    screen.classList.remove('playing');
    if (was) { audio.hush(); silence(); }
    playDown.forEach((m) => kb.down(m, false)); playDown.clear();
    cells.forEach((c) => { c.classList.remove('cur'); c.querySelectorAll('.fbeats i').forEach((i) => i.classList.remove('on')); });
    idle(); paintPrimary(); paintChorus(0); paintPalette(0, 0);
    if (was && was.kind === 'play') { fb(''); paintList(); }
  }
  function toggle() { if (run && run.kind === 'run') finish(false); else if (run) halt(); else start(); }

  // ---------- input: record, instant feedback ----------
  function input(m, T, v, dur) {
    markActive();
    const r = run;
    if (!r || r.kind !== 'run') return;
    const tt = T - r.t0, { win, tight } = tols(r.bpm);
    if (tt < -win || tt > r.choruses * r.chorusLen + win) return; // count-in and after the end are not recorded
    const prev = r.held.get(m); if (prev) { prev.d = Math.max(0.01, tt - prev.t); r.held.delete(m); }
    const n = { t: tt, d: dur || 0, m, v: Math.round(v * 100) / 100 };
    r.notes.push(n);
    if (!dur) r.held.set(m, n);
    const gi = Math.max(0, gridIndex(tt, r.bpm, r.swing)), bar = Math.floor(gi / PER) % NB, slot = gi % PER;
    const role = roleOf(solo, bar);
    if (role !== 'you') { kb.flash(m, 'meh'); fb(`<span class="meh">${role === 'rest' ? t('soRestBar') : t('soBandBar')}</span>`); lastOut = null; return; }
    const pal = paletteAt(solo, bars, bar, slot), dev = gridDev(tt, r.bpm, r.swing);
    const timing = Math.abs(dev) > tight ? ` · <span class="meh">${dev < 0 ? t('early') : t('late')} ${Math.round(Math.abs(dev) * 1000)} ${t('ms')}</span>` : '';
    if (pal.pcs.has(pcm(m))) {
      kb.flash(m, 'ok');
      if (lastOut && tt - lastOut.tt <= APPROACH_E8 * r.beat / 2 + 1e-6 && Math.abs(m - lastOut.m) === 1) {
        kb.flash(lastOut.m, 'meh');
        fb(`<span class="meh">${t('soApproach')} → ${nameOf(m, pal)}</span>${timing}`);
      } else fb(`<span class="ok">${t('soInside')}</span>${timing}`);
      lastOut = null;
    } else {
      kb.flash(m, 'bad');
      fb(`<span class="bad">${t('soOut')}: ${nameOf(m, pal)}</span>${timing}`);
      lastOut = { m, tt };
    }
  }
  function release(m, T) {
    const r = run; if (!r || r.kind !== 'run') return;
    const n = r.held.get(m); if (!n) return;
    n.d = Math.max(0.01, T - r.t0 - n.t); r.held.delete(m);
  }

  // ---------- scoring ----------
  const chorusNotes = (r, c) => {
    const span = NB * PER;
    return r.notes.filter((n) => Math.floor(gridIndex(n.t, r.bpm, r.swing) / span) === c || (c === 0 && gridIndex(n.t, r.bpm, r.swing) < 0))
      .map((n) => ({ t: n.t - c * r.chorusLen, m: n.m }));
  };
  const ctxOf = (r) => ({ solo, bars, bpm: r.bpm, swing: r.swing });
  function clearMarks() { cells.forEach((c) => c.classList.remove('ok', 'meh', 'bad')); marks.forEach((mk) => { mk.textContent = ''; mk.className = 'fmark'; }); }
  function markBar(k, b) {
    const sym = [];
    let cls = '';
    if (b.role === 'you') {
      if (b.clean) { sym.push('✓'); cls = 'ok'; }
      if (b.target === true) sym.push('◇'); else if (b.target === false) { sym.push('◆'); cls = cls || 'meh'; }
    } else if (b.restOk === false) { sym.push('−'); cls = 'bad'; }
    marks[k].textContent = sym.join(' ');
    marks[k].className = 'fmark' + (cls ? ' ' + cls : '');
    cells[k].classList.remove('ok', 'meh', 'bad');
    if (cls) cells[k].classList.add(cls);
  }
  function paintBar(bar, chorus) { // after each bar: score the chorus so far, mark this bar
    const r = run, s = scoreChorus(chorusNotes(r, chorus).filter((n) => gridIndex(n.t, r.bpm, r.swing) < (bar + 1) * PER), ctxOf(r));
    markBar(bar, s.perBar[bar]);
  }
  const pct = (x) => `${Math.round(x * 100)}%`;
  function boardRow(title, s, html = '') {
    const pass = solo.pass || {}, ok = checks(s, pass);
    const stat = (v, label, k, thr) => h('div.dstat' + (ok[k] ? '.good' : ''), null, h('b', null, String(v)), h('span', null, thr != null ? `${label} · ≥ ${thr}` : label));
    const fmtR = (x) => `${x.ok}/${x.total}`;
    const ph = Math.round(s.phrases * 10) / 10;
    return h('div.soloround', null, h('b.solohead', { html: title + html }),
      h('div.dsummary.solostats', null,
        stat(pct(s.inside), t('soMInside'), 'inside', pass.inside != null ? pct(pass.inside) : null),
        stat(pct(s.grid), t('soMGrid'), 'grid', pass.grid != null ? pct(pass.grid) : null),
        stat(ph, t('soMPhrases'), 'phrases', pass.phrases),
        solo.phrasing ? stat(fmtR(s.rests), t('soMRests'), 'rests', pass.rests != null ? pct(pass.rests) : null) : null,
        solo.targets ? stat(fmtR(s.targets), t('soMTargets'), 'targets', pass.targets != null ? pct(pass.targets) : null) : null,
        solo.targets && s.targets.changes != null ? stat(`${s.targets.total}/${s.targets.changes}`, t('soMCover'), 'cover', pass.cover != null ? pct(pass.cover) : null) : null,
        stat(s.pitches, t('soMPitches'), 'pitches', pass.pitches)));
  }
  function finishChorus(c) {
    const r = run, s = scoreChorus(chorusNotes(r, c), ctxOf(r));
    r.scores[c] = s;
    if (c === r.choruses - 1) s.perBar.forEach((b, k) => markBar(k, b)); // the next chorus has already cleared the grid
    if (CH > 1) board.prepend(boardRow(`${t('soChorusBoard')} ${c + 1}`, s));
    else board.replaceChildren(boardRow(`${t('soChorusBoard')} 1`, s));
  }
  function finish(natural) {
    const r = run; if (!r) return;
    const elapsed = audio.now() - r.t0;
    halt();
    if (r.kind !== 'run') return;
    const done = natural ? r.choruses : Math.max(0, Math.min(r.choruses, Math.floor((elapsed - 0.3) / r.chorusLen)));
    r.held.forEach((n) => { n.d = Math.max(0.01, Math.min(elapsed, done * r.chorusLen) - n.t); });
    if (done < 1) { fb(t('perfTooShort')); return; }
    const limit = done * r.chorusLen + tols(r.bpm).win;
    const notes = r.notes.filter((n) => n.t < limit).map((n) => ({ t: r3(n.t), d: r3(n.d), m: n.m, v: n.v }));
    if (!notes.length) { fb(t('perfEmpty')); return; }
    for (let c = 0; c < done; c++) if (!r.scores[c]) r.scores[c] = scoreChorus(chorusNotes(r, c), ctxOf(r));
    const total = combine(r.scores.slice(0, done));
    const ok = natural && passed(total, solo.pass || {});
    // the run's board (a run of one chorus: its chorus board is the run)
    let line = '';
    if (natural) {
      const first = !exProgress(itemId).stages.done;
      updateEx(itemId, (p) => {
        const b = p.best || {}, rr = (x) => (x.total ? x.ok / x.total : null), mx = (a, v) => (v == null ? a : Math.max(a || 0, v));
        return { ...p, runs: (p.runs || 0) + 1, best: { inside: mx(b.inside, total.inside), grid: mx(b.grid, total.grid), phrases: mx(b.phrases, total.phrases), pitches: mx(b.pitches, total.pitches), rests: mx(b.rests, rr(total.rests)), targets: mx(b.targets, rr(total.targets)), cover: total.targets.changes ? mx(b.cover, coverage(total.targets)) : b.cover } };
      });
      if (ok) {
        updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, done: true } }));
        scheduleReview(itemId, true);
        line = ` · <span class="ok">${first ? t('soPassed') : t('soPassedAgain')}</span>`;
      } else {
        if (wasDue) { scheduleReview(itemId, false); wasDue = false; }
        line = ` · <span class="muted">${t('soNotYet')}</span>`;
      }
      if (CH > 1) board.prepend(boardRow(t('soRunBoard'), total, line));
      else { board.replaceChildren(boardRow(t('soRunBoard'), total, line)); }
    }
    const acc = rhythmAccuracy(notes, r);
    const rec = { id: Date.now().toString(36), itemId, kind: 'solo', date: new Date().toISOString(), bpm: r.bpm, swing: r.swing, choruses: done, ending: 0, notes,
      band: r.calls.filter((n) => n.t < done * r.chorusLen), acc,
      score: { inside: r3(total.inside), grid: r3(total.grid), phrases: r3(total.phrases), rests: total.rests, targets: total.targets, pitches: total.pitches, passed: ok } };
    const all = store.get('recordings', []);
    const solos = [rec, ...all.filter((x) => x.kind === 'solo')].slice(0, MAX_RECS);
    store.set('recordings', [...solos, ...all.filter((x) => x.kind !== 'solo')].sort((a, b) => (a.date < b.date ? 1 : -1)));
    current = rec; paintSummary(); paintList();
    fb(ok ? `<span class="ok">${t('soPassed')}</span> · ${t('perfSaved')}` : t('perfSaved'));
  }

  // ---------- summary, list, download (as perform.js) ----------
  const pad = (x) => String(x).padStart(2, '0');
  const stamp = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; };
  const fmtDate = (iso) => new Date(iso).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function download(rec) {
    const blob = new Blob([recordingToMidi(rec, `${L(item.title || solo.title)} · ${fmtDate(rec.date)}`)], { type: 'audio/midi' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `jazzlab-solo-${stamp(rec.date)}.mid` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const stat = (v, label, good) => h('div.dstat' + (good ? '.good' : ''), null, h('b', null, String(v)), h('span', null, label));
  function paintSummary() {
    if (!current) { summary.replaceChildren(); sumActs.replaceChildren(); return; }
    const a = current.acc, sc = current.score || {};
    summary.replaceChildren(
      stat(current.notes.length, plural(current.notes.length, 'perfNotesW')),
      stat(current.choruses, plural(current.choruses, 'perfChorusesW')),
      sc.inside != null ? stat(pct(sc.inside), t('soMInside'), sc.passed) : null,
      stat(`${a.pct}%`, t('perfPctW'), a.pct >= 70),
      stat(a.avgMs, t('perfAvgW')));
    const rec = current;
    sumActs.replaceChildren(
      h('button.btn', { type: 'button', title: t('perfPlayback'), html: ICON.speaker + `<span>${t('perfPlayback')}</span>`, onclick: () => playback(rec) }),
      h('button.btn', { type: 'button', title: t('perfDownload'), html: ICON.download + `<span>${t('perfDownload')}</span>`, onclick: () => download(rec) }));
  }
  function remove(id) {
    if (run && run.kind === 'play' && run.rec.id === id) halt();
    store.set('recordings', store.get('recordings', []).filter((r) => r.id !== id));
    if (current && current.id === id) { current = myRecs()[0] || null; paintSummary(); }
    paintList();
  }
  function paintList() {
    const recs = myRecs();
    const playing = run && run.kind === 'play' ? run.rec.id : null;
    list.replaceChildren(h('b.perflisthead', null, t('perfRecords')),
      ...(recs.length ? recs.map((r) => h('div.perfrec' + (current && current.id === r.id ? '.cur' : ''), null,
        h('button.prsel', { type: 'button', onclick: () => { current = r; paintSummary(); paintList(); } },
          h('span.prdate', null, fmtDate(r.date)), h('span.prmeta', null, `♩ ${r.bpm} · ${r.choruses}× · ${r.score ? `${t('soMInside')} ${pct(r.score.inside)}` : `${r.acc.pct}%`}${r.score && r.score.passed ? ' ✓' : ''}`)),
        h('button.iconbtn', { type: 'button', title: playing === r.id ? t('stop') : t('perfPlayback'), 'aria-label': playing === r.id ? t('stop') : t('perfPlayback'), html: playing === r.id ? ICON.stop : ICON.play, onclick: () => (playing === r.id ? halt() : playback(r)) }),
        h('button.iconbtn', { type: 'button', title: t('perfDownload'), 'aria-label': t('perfDownload'), html: ICON.download, onclick: () => download(r) }),
        h('button.iconbtn.prdel', { type: 'button', title: t('perfDelete'), 'aria-label': t('perfDelete'), onclick: () => remove(r.id) }, '×')))
        : [h('p.muted', null, t('perfNoRecords'))]));
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => {
    if (e.type === 'on') { kb.down(e.note, true); input(e.note, audio.toAudioTime(e.ts), (e.vel || 80) / 127); }
    else { kb.down(e.note, false); release(e.note, audio.toAudioTime(e.ts)); }
  });
  const onKey = (e) => { if (e.code === 'Space' && !(e.target.closest && e.target.closest('input,select,textarea,summary'))) { e.preventDefault(); toggle(); } };
  document.addEventListener('keydown', onKey);

  setBpm(st.bpm); paintPrimary(); paintHint(); paintChorus(0); paintPalette(0, 0); paintSummary(); paintList();
  kb.reveal([hand.lo, hand.hi], false, true);
  const saved = exProgress(itemId);
  fb(saved.runs && saved.best ? `${saved.runs} ${plural(saved.runs, 'soRunsW')} · ${t('soBestW')} ${t('soMInside')} ${pct(saved.best.inside || 0)}` : startText());
  updateEx(itemId, (p) => p);

  return () => { if (footRO) footRO.disconnect(); if (run && run.kind === 'run') finish(false); else if (run) halt(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
