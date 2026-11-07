// Performance screen: the whole form with drums only, N choruses and the ending. The ending length is the bar count
// of the form's `ending` exercise (blues-end: 2 bars); the drums keep the groove through every ending bar but the last,
// which gets beat 1 only, then silence. A form without an ending gets one ending bar (beat 1 only). Everything you play is
// recorded as { t, d, m, v } (seconds from the first beat of chorus 1). After the run: a summary (notes, choruses,
// rhythm accuracy against the eighth-note grid), playback over the drums, a MIDI download. No pass, no review:
// a performance is a result, not an exercise. The last 10 recordings live in store 'recordings'.
import { h, ICON, themeButton, midiChip, sessionChip } from '../ui.js';
import { t, L, plural, getLang } from '../i18n.js';
import { store, updateEx, markActive, idle } from '../store.js';
import { noteName, midiToName, toMidi } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import { patternBar, lickBars, patSpell, parseChord, barChords } from '../music/forms.js';
import { groove } from '../music/drums.js';
import { recordingToMidi } from '../music/export.js';
import { rhythmAccuracy } from '../music/recording.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';

const PER = 8;
const MAX_RECS = 10;
const TAP_DUR = 0.3;
const r3 = (x) => Math.round(x * 1000) / 1000;

export function renderPerform(root, { track, itemId, item, form, pattern, licks, ending, endItem, back }) {
  const settings = { names: 'en', pianoSnd: true, perfBeat: 'drums', ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  const bars = form.bars, NB = bars.length;
  const chords = [...new Set(bars.flatMap(barChords))]; // distinct chords (a bar may hold two: "C7 A7")
  const lhByChord = Object.fromEntries(chords.map((c) => [c, patternBar(pattern, c)]));
  const rhMidi = licks.flatMap((l) => chords.flatMap((c) => lickBars(l, c).flat().map((e) => e.m)));
  const lhMidi = Object.values(lhByChord).flat().map((e) => e.m);
  const END_BARS = ending ? ending.bars.length : 1; // bars after the last chorus
  const endMidi = ending ? ending.bars.flatMap((b) => [...b.rh, ...b.lh].flatMap((e) => e.notes.map(toMidi))) : [];
  const st = { bpm: store.get('tempo:' + itemId, form.tempo || 66), swing: !!form.swing && form.style !== 'bossa', choruses: item.choruses || 3, mode: null }; // mode: null | 'run' | 'play'
  const myRecs = () => store.get('recordings', []).filter((r) => r.itemId === itemId);
  let current = myRecs()[0] || null; // the recording shown in the summary
  const midiOn = () => midiState().connected;

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('perfUpper')}`), h('span.title', null, L(item.title || form.title))),
    h('div.grow'), sessionChip(itemId), midiChip(), themeButton());
  const fbEl = h('span.fb', { 'aria-live': 'polite' });
  const chorusEl = h('span.barno');
  const cells = bars.map((c, k) => h('div.fcell', { 'data-bar': k }, h('span.fno', null, String(k + 1)), h('b.fchord', null, c),
    h('div.fbeats', null, ...Array.from({ length: 4 }, () => h('i')))));
  const grid = h('div.fgrid', null, ...cells);
  const nn = (m) => noteName(midiToName(m), names);
  const strip = h('div.perfstrip', null,
    h('span', null, h('b', null, `${t('perfLeft')}:`), ...chords.map((c) => h('span.pchord', null, `${c} `, h('span.fnotes', null, [...new Map(lhByChord[c].map((e) => [e.m, e])).values()].map((e) => noteName(patSpell(e.m, e.deg, parseChord(c), !!form.flats), names)).join(' · '))))),
    licks.length ? h('span', null, h('b', null, `${t('perfRight')}:`), ` ${licks.map((l) => `«${L(l.title)}»`).join(', ')} ${t('perfOwn')}`) : null,
    ending ? h('span', null, h('b', null, `${t('perfEnding')}:`), ' ', endItem ? h('a', { href: endItem.href }, `«${L(ending.title)}»`) : `«${L(ending.title)}»`) : null);
  const summary = h('div.dsummary.perfsum');
  const sumActs = h('div.perfacts');
  const list = h('div.perflist');
  const panel = h('section.panel.formpanel.perfpanel', null,
    h('div.staffhead', null, chorusEl, h('div.grow'), fbEl),
    grid, strip, summary, sumActs, list);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);
  const bpmOut = h('output.bpm'), chOut = h('output.bpm');
  const tempoBox = h('div.stepper', null,
    h('button', { type: 'button', 'aria-label': t('slower'), onclick: () => setBpm(st.bpm - 4) }, '−'), bpmOut,
    h('button', { type: 'button', 'aria-label': t('faster'), onclick: () => setBpm(st.bpm + 4) }, '+'));
  const chorusBox = h('div.stepper', { role: 'group', 'aria-label': t('perfChoruses'), title: t('perfChoruses') },
    h('button', { type: 'button', 'aria-label': '−', onclick: () => setChoruses(st.choruses - 1) }, '−'), chOut,
    h('button', { type: 'button', 'aria-label': '+', onclick: () => setChoruses(st.choruses + 1) }, '+'));
  const swingSeg = seg([['straight', t('straight')], ['swing', t('swing')]], st.swing ? 'swing' : 'straight', (v) => { st.swing = v === 'swing'; }, 'eighths');
  const beatSeg = seg([['drums', t('drums')], ['click', t('metronome')]], settings.perfBeat, (v) => { settings.perfBeat = v; store.set('settings', { ...store.get('settings', {}), perfBeat: v }); }, 'backing');
  const footHint = h('span.foothint');
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: () => toggle() });
  const footer = h('footer.actions', null, swingSeg, beatSeg, chorusBox, tempoBox, footHint, h('div.grow'), primary);
  const screen = h('div.exscreen.formscreen.perfscreen', null, header, h('main.ex', null, panel, kbPanel), footer);
  root.replaceChildren(screen);

  function seg(items, value, cb, label) {
    const w = h('div.seg', { role: 'group', 'aria-label': label ? t(label) : null });
    items.forEach(([v, text]) => w.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), onclick: (e) => {
      if (st.mode) return; // settings are fixed while running
      w.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); cb(v);
    } }, text)));
    return w;
  }

  // ---------- keyboard: pressed keys only ----------
  const lo = Math.min(...lhMidi, ...rhMidi, ...endMidi), hi = Math.max(...lhMidi, ...rhMidi, ...endMidi);
  audio.preloadPiano(lo - 3, hi + 7);
  const kb = createKeyboard(kbEl, [lo, hi + 5], { names: settings.names, onPress: (m) => {
    audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.5, 0.55); markActive();
    if (!midiOn()) record(m, 0.6, audio.toAudioTime(performance.now()), TAP_DUR); // with a piano, MIDI is the one source
  } });
  const playDown = new Set();

  function play1(m, time, dur, v, mv = 25 + 130 * v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, mv, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const fb = (html) => { fbEl.innerHTML = html; };
  function setBpm(v) { if (st.mode) return; st.bpm = Math.max(40, Math.min(160, Math.round(v))); bpmOut.innerHTML = `♩ ${st.bpm}`; store.set('tempo:' + itemId, st.bpm); }
  function setChoruses(v) { if (st.mode) return; st.choruses = Math.max(1, Math.min(5, v)); chOut.textContent = `× ${st.choruses}`; if (!current) fb(startText()); paintChorus(0); }
  function startText() { return t(END_BARS === 2 ? 'perfStart' : 'perfStart1').replace('{n}', st.choruses); }
  function paintChorus(k) { chorusEl.textContent = `${t('chorusW')} ${k + 1} / ${st.mode === 'play' && run ? run.choruses : st.choruses}`; }
  function paintPrimary() { primary.innerHTML = st.mode ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`; }
  function paintHint() { footHint.textContent = midiOn() ? t('perfHint') : t('perfHintScreen'); }

  // ---------- transport (run and playback share it) ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null;
  function begin(r) {
    run = r; g = 0; beatTime = r.t0;
    queue.push({ t: r.t0 + r.finishT, finish: true });
    screen.classList.add('playing'); paintPrimary();
    cells.forEach((c) => c.classList.remove('cur'));
    if (window.matchMedia('(min-width: 641px)').matches) panel.scrollTop = 0; // keep the grid in view
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function newRun(kind, bpm, swing, choruses, t0, endBars = END_BARS) {
    const beat = 60 / bpm, total = choruses * NB * PER, endT = (total / PER + endBars) * 4 * beat; // end of the ending
    return { kind, t0, beat, bpm, swing, choruses, total, endBars, last: total + (endBars - 1) * PER, endT, finishT: endT + 1, swingOff: swing ? beat * 2 / 3 : beat / 2 };
  }
  function startRun() {
    if (st.mode || !audio.ensureAudio()) return;
    const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += 4 * beat;
    st.mode = 'run';
    begin({ ...newRun('run', st.bpm, st.swing, st.choruses, t0), notes: [], held: new Map() });
    paintChorus(0);
  }
  function playback(rec) {
    if (!audio.ensureAudio()) return;
    if (st.mode === 'run') finish(false); else if (st.mode) halt();
    const notes = rec.notes.slice().sort((a, b) => a.t - b.t);
    if (notes.length) audio.preloadPiano(Math.min(...notes.map((n) => n.m)) - 1, Math.max(...notes.map((n) => n.m)) + 1);
    const r = { ...newRun('play', rec.bpm, rec.swing, rec.choruses, audio.now() + 0.25, rec.ending || 1), notes, pi: 0, rec };
    r.finishT = Math.max(r.finishT, notes.reduce((x, n) => Math.max(x, n.t + n.d), 0) + 0.6);
    st.mode = 'play';
    begin(r); paintChorus(0);
    fb(t('perfPlaying')); paintList();
  }
  function schedule() {
    if (!run) return;
    const ahead = audio.now() + 0.15, drums = settings.perfBeat === 'drums';
    while (g <= run.last) {
      const slot = g % PER, barG = Math.floor(g / PER), bar = barG % NB, chorus = Math.floor(barG / NB);
      const time = beatTime + (slot % 2 ? run.swingOff : 0);
      if (time > ahead) break;
      if (g === run.last) { // the last ending bar: beat 1 only, then silence
        if (drums) groove(0, time, { swing: run.swing, style: form.style, bar: barG }); else audio.click(time, true);
        if (run.endBars === 1) queue.push({ t: time, barStart: -1 });
        g++; break;
      }
      if (drums) groove(slot, time, { swing: run.swing, style: form.style, bar: barG }); else if (slot % 2 === 0) audio.click(time, slot === 0);
      if (g >= run.total) { if (g === run.total) queue.push({ t: time, barStart: -1 }); } // ending bars: groove on, no form cell
      else {
        if (slot === 0) queue.push({ t: time, barStart: bar, chorus });
        queue.push({ t: time, g });
      }
      if (slot % 2) beatTime += run.beat;
      g++;
    }
    if (run.kind === 'play') {
      while (run.pi < run.notes.length && run.t0 + run.notes[run.pi].t <= ahead) {
        const n = run.notes[run.pi++], at = run.t0 + n.t, d = Math.max(n.d, 0.05);
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
      if (q.barStart < 0) chorusEl.textContent = t('perfEnding');
      else paintChorus(q.chorus);
      if (run.kind === 'run' && q.barStart === 0 && q.chorus === 0) fb(`<b class="bad">● REC</b>`);
    } else if (q.g !== undefined) {
      const slot = q.g % PER, bar = Math.floor(q.g / PER) % NB;
      cells[bar].querySelectorAll('.fbeats i').forEach((i, b) => i.classList.toggle('on', b <= slot >> 1));
      if (run.kind === 'run') markActive();
    } else if (q.kd !== undefined) { kb.down(q.kd, q.on); if (q.on) playDown.add(q.kd); else playDown.delete(q.kd); }
    else if (q.finish) finish(true);
  }
  function halt() {
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = st.mode; st.mode = null; run = null;
    screen.classList.remove('playing');
    if (was) { audio.hush(); silence(); }
    playDown.forEach((m) => kb.down(m, false)); playDown.clear();
    cells.forEach((c) => { c.classList.remove('cur'); c.querySelectorAll('.fbeats i').forEach((i) => i.classList.remove('on')); });
    idle(); paintPrimary(); paintChorus(0);
    if (was === 'play') { fb(''); paintList(); }
  }
  function toggle() { if (st.mode === 'run') finish(false); else if (st.mode) halt(); else startRun(); }

  // ---------- recording ----------
  function record(m, v, T, dur) {
    if (!run || run.kind !== 'run') return null;
    const tt = T - run.t0;
    if (tt < 0 || tt > run.endT) return null; // count-in (and after the ending) is not recorded
    const prev = run.held.get(m); if (prev) { prev.d = Math.max(0.01, tt - prev.t); run.held.delete(m); }
    const n = { t: tt, d: dur || 0, m, v: Math.round(v * 100) / 100 };
    run.notes.push(n);
    if (!dur) run.held.set(m, n);
    return n;
  }
  function release(m, T) {
    if (!run || run.kind !== 'run') return;
    const n = run.held.get(m); if (!n) return;
    n.d = Math.max(0.01, T - run.t0 - n.t); run.held.delete(m);
  }
  function finish(natural) {
    const r = run; if (!r) return;
    const elapsed = audio.now() - r.t0;
    halt();
    if (r.kind !== 'run') return;
    const chorusLen = NB * 4 * r.beat;
    const done = natural ? r.choruses : Math.max(0, Math.min(r.choruses, Math.floor(elapsed / chorusLen)));
    r.held.forEach((n) => { n.d = Math.max(0.01, Math.min(elapsed, r.endT) - n.t); });
    if (done < 1) { fb(t('perfTooShort')); return; }
    // stopped early: keep the completed choruses only, so notes and choruses agree
    const limit = natural ? r.endT : done * chorusLen;
    const notes = r.notes.filter((n) => n.t < limit).map((n) => ({ t: r3(n.t), d: r3(n.d), m: n.m, v: n.v }));
    if (!notes.length) { fb(t('perfEmpty')); return; }
    const acc = rhythmAccuracy(notes, r);
    const rec = { id: Date.now().toString(36), itemId, date: new Date().toISOString(), bpm: r.bpm, swing: r.swing, choruses: done, ending: natural ? r.endBars : 0, notes, acc };
    store.set('recordings', [rec, ...store.get('recordings', [])].slice(0, MAX_RECS));
    updateEx(itemId, (p) => ({ ...p, runs: (p.runs || 0) + 1, bestPct: Math.max(p.bestPct || 0, acc.pct) }));
    current = rec; paintSummary(); paintList(); fb(t('perfSaved'));
  }

  // ---------- summary, list, download ----------
  const pad = (x) => String(x).padStart(2, '0');
  const stamp = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`; };
  const fmtDate = (iso) => new Date(iso).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function download(rec) {
    const blob = new Blob([recordingToMidi(rec, `${L(item.title)} · ${fmtDate(rec.date)}`)], { type: 'audio/midi' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `jazzlab-perf-${stamp(rec.date)}.mid` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const stat = (v, label, good) => h('div.dstat' + (good ? '.good' : ''), null, h('b', null, String(v)), h('span', null, label));
  function paintSummary() {
    if (!current) { summary.replaceChildren(); sumActs.replaceChildren(); return; }
    const a = current.acc;
    summary.replaceChildren(
      stat(current.notes.length, plural(current.notes.length, 'perfNotesW')),
      stat(current.choruses, plural(current.choruses, 'perfChorusesW')),
      stat(`${a.pct}%`, t('perfPctW'), a.pct >= 70),
      stat(`${a.ok} · ${a.meh} · ${a.off}`, t('perfSplitW')),
      stat(a.avgMs, t('perfAvgW')));
    const rec = current;
    sumActs.replaceChildren(
      h('button.btn', { type: 'button', title: t('perfPlayback'), html: ICON.speaker + `<span>${t('perfPlayback')}</span>`, onclick: () => playback(rec) }),
      h('button.btn', { type: 'button', title: t('perfDownload'), html: ICON.download + `<span>${t('perfDownload')}</span>`, onclick: () => download(rec) }));
  }
  function remove(id) {
    if (st.mode === 'play' && run && run.rec.id === id) halt();
    store.set('recordings', store.get('recordings', []).filter((r) => r.id !== id));
    if (current && current.id === id) { current = myRecs()[0] || null; paintSummary(); }
    paintList();
  }
  function paintList() {
    const recs = myRecs();
    const playing = st.mode === 'play' && run ? run.rec.id : null;
    list.replaceChildren(h('b.perflisthead', null, t('perfRecords')),
      ...(recs.length ? recs.map((r) => h('div.perfrec' + (current && current.id === r.id ? '.cur' : ''), null,
        h('button.prsel', { type: 'button', onclick: () => { current = r; paintSummary(); paintList(); } },
          h('span.prdate', null, fmtDate(r.date)), h('span.prmeta', null, `♩ ${r.bpm} · ${r.choruses}× · ${r.acc.pct}%`)),
        h('button.iconbtn', { type: 'button', title: playing === r.id ? t('stop') : t('perfPlayback'), 'aria-label': playing === r.id ? t('stop') : t('perfPlayback'), html: playing === r.id ? ICON.stop : ICON.play, onclick: () => (playing === r.id ? halt() : playback(r)) }),
        h('button.iconbtn', { type: 'button', title: t('perfDownload'), 'aria-label': t('perfDownload'), html: ICON.download, onclick: () => download(r) }),
        h('button.iconbtn.prdel', { type: 'button', title: t('perfDelete'), 'aria-label': t('perfDelete'), onclick: () => remove(r.id) }, '×')))
        : [h('p.muted', null, t('perfNoRecords'))]));
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => {
    if (e.type === 'on') { kb.down(e.note, true); markActive(); record(e.note, (e.vel || 80) / 127, audio.toAudioTime(e.ts)); }
    else { kb.down(e.note, false); release(e.note, audio.toAudioTime(e.ts)); }
  });
  const onKey = (e) => { if (e.code === 'Space' && !e.target.closest('input,select,textarea,summary')) { e.preventDefault(); toggle(); } };
  document.addEventListener('keydown', onKey);

  setBpm(st.bpm); setChoruses(st.choruses); paintPrimary(); paintHint(); paintSummary(); paintList();
  fb(current ? '' : startText());

  return () => { if (st.mode === 'run') finish(false); else if (st.mode) halt(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
