// Form screen: the whole 12-bar blues on a loop with drums. You play the left-hand pattern through the form,
// the app scores every note and counts clean choruses. Three clean choruses in a row pass the item.
// Right-hand mode (item.hand === 'rh' + a lick): the app always plays the left-hand pattern; you play the lick,
// started on every odd bar (1, 3, 5, …) and transposed to the chord of its first bar.
// With item.licks = [question, answer] the two alternate: the question on bars 1, 5, 9, the answer on bars 3, 7, 11.
// With key-relative licks (item.lickKey, or item.licksKey = [question, answer] taking turns) the lick sits on every ii–V–I
// of the form (iivPairs: "Gm7 C7 | Fmaj7"), in the key of the I bar; the other bars are rests.
// With a melody (item.melody, jazzlab-melody/1) you play the written tune, bar k of the melody over bar k of the form.
// A clean chorus allows max(1, round(notes per chorus / 40)) slips (misses + wrong notes): 1 for root-and-fifth
// (24 or 48 notes) and the licks, 2 for the boogie (96 eighths per chorus), so denser patterns are not stricter.
import { h, ICON, themeButton, midiChip, sessionChip } from '../ui.js';
import { t, L } from '../i18n.js';
import { markTerms } from '../glossary.js';
import { store, exProgress, updateEx, markActive, idle, scheduleReview, reviews } from '../store.js';
import { noteName, midiToName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import { patternBars, lickBars, melodyBarNotes, rhRoot, parseChord, patSpell, barChords, iivPairs, lickOverKey } from '../music/forms.js';
import { groove } from '../music/drums.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';

const PER = 8;
const CLEAN_TO_PASS = 3; // clean choruses in a row
const SLIP_PER = 40; // one allowed slip per this many notes in a chorus (at least 1)

export function renderForm(root, { track, itemId, item, form, pattern, lick, licks, keyLicks, melody, back }) {
  const settings = { met: true, names: 'en', pianoSnd: true, impBeat: 'drums', ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  const bars = form.bars, NB = bars.length;
  const lhNotes = patternBars(pattern, bars); // [{t, d, m, f}] per bar, built in order (a voice-led pattern follows the previous bar)
  // right hand: one lick, or a question-and-answer pair taking turns (pair k/2 even = question, odd = answer)
  const pair = Array.isArray(licks) && licks.length === 2 && licks.every(Boolean) ? licks : null;
  const rhLicks = pair || (lick ? [lick] : null);
  const mel = item.hand === 'rh' && melody ? melody : null; // the tune, written out bar by bar
  // key-relative licks on the ii–V–I pairs of the form: pair i plays keyLicks[i % n] in the key of its I bar
  const kl = item.hand === 'rh' && !mel && Array.isArray(keyLicks) && keyLicks.length && keyLicks.every((l) => l && l.prog) ? keyLicks : null;
  const kPairs = kl ? iivPairs(bars).map((p, i) => ({ ...p, lick: kl[i % kl.length] })) : [];
  const kAt = Object.fromEntries(kPairs.map((p) => [p.bars[0], p])); // first bar of a pair -> the pair
  const rh = item.hand === 'rh' && (!!rhLicks || !!mel || !!kl);
  const lickAt = (k) => rhLicks[(k / 2) % rhLicks.length]; // the lick starting on bar k (k even)
  // each lick over its pair of bars, in the key of the pair's first chord
  const rhNotes = rh ? bars.map(() => []) : null;
  if (mel) bars.forEach((_, k) => { rhNotes[k] = melodyBarNotes(mel, k); });
  else if (kl) kPairs.forEach((p) => { lickOverKey(p.lick, p.key).bars.forEach((b, j) => { if (p.bars[0] + j < NB) rhNotes[p.bars[0] + j] = b.rh; }); });
  else if (rh) for (let k = 0; k < NB; k += 2) { const [b1, b2] = lickBars(lickAt(k), bars[k]); rhNotes[k] = b1; if (k + 1 < NB) rhNotes[k + 1] = b2; }
  const kWord = (p) => (kl.length < 2 ? t('phraseW') : p.lick.role === 'question' ? t('questionW') : p.lick.role === 'answer' ? t('answerW') : t('phraseW'));
  const lickWord = (k) => !pair ? t('lickW') : lickAt(k).role === 'question' ? t('questionW') : lickAt(k).role === 'answer' ? t('answerW') : (k / 2) % 2 === 0 ? t('questionW') : t('answerW');
  const barNotes = rh ? rhNotes : lhNotes; // what you play (expected + keyboard)
  const maxSlips = Math.max(1, Math.round(barNotes.flat().length / SLIP_PER)); // misses + wrong notes allowed in a clean chorus
  const st = { mode: 'play', bpm: store.get('tempo:' + itemId, form.tempo || 66), swing: !!form.swing && form.style !== 'bossa', playing: false, streak: 0, choruses: 0 };
  const wasDue = reviews()[itemId] && new Date(reviews()[itemId].due) <= new Date();
  const midiOn = () => midiState().connected;

  // ---------- layout ----------
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('formUpper')}`), h('span.title', null, L(item.title || form.title))),
    h('div.grow'), sessionChip(itemId), h('span.chordchip', null, mel ? L(mel.title) : kl ? (kl.length > 1 ? t('qaChip') : L(kl[0].title)) : rh ? (pair ? t('qaChip') : L(rhLicks[0].title)) : L(pattern.title)), midiChip(), themeButton());
  const fbEl = h('span.fb', { 'aria-live': 'polite' });
  const chorusEl = h('span.barno'), streakEl = h('div.loops', { 'aria-label': t('cleanChoruses') });
  const cells = bars.map((c, k) => {
    const lh = barNotes[k];
    const uniq = [...new Map(lh.map((e) => [e.m, e])).values()].sort((a, b) => a.m - b.m);
    const label = mel ? (lh.length ? noteName(lh[0].name, names) : '—') : kl ? (kAt[k] ? `${kWord(kAt[k])} · ${kAt[k].key}` : '') : rh ? (k % 2 === 0 ? `${lickWord(k)} · ${noteName((() => { const ch = parseChord(barChords(c)[0]); return patSpell(rhRoot(ch), 0, ch, !!form.flats); })(), names)}` : '') : uniq.map((e) => noteName(patSpell(e.m, e.deg, parseChord(e.chord || c), !!form.flats), names)).join(' · ');
    return h('div.fcell', { 'data-bar': k }, h('span.fno', null, String(k + 1)), h('b.fchord', null, c),
      h('small.fnotes' + (rh ? '.rh' : ''), null, label),
      h('div.fbeats', null, ...Array.from({ length: 4 }, () => h('i'))));
  });
  const grid = h('div.fgrid' + (NB > 16 ? '.long' : ''), null, ...cells);
  // a long form scrolls inside its grid: keep the current bar visible
  const keepInView = (k) => { const c = cells[k]; if (NB <= 16 || !c) return; if (c.offsetTop < grid.scrollTop || c.offsetTop + c.offsetHeight > grid.scrollTop + grid.clientHeight) grid.scrollTop = Math.max(0, c.offsetTop - 8); };
  const panel = h('section.panel.formpanel', null,
    h('div.staffhead', null, chorusEl, streakEl, h('div.grow'), fbEl),
    grid,
    h('p.muted.dabout', null, markTerms(L(item.about || form.about))));
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
  const screen = h('div.exscreen.formscreen', null, header, h('main.ex', null, panel, kbPanel), footer);
  root.replaceChildren(screen);

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
  const evAt = (bar, slot) => { const e = barNotes[bar].filter((x) => x.t === slot); return e.length ? { notes: e.map((x) => x.name || midiToName(x.m)), f: e.map((x) => x.f), sug: false, acc: false } : null; };
  const nextEv = (bar, slot) => { for (let k = 1; k <= PER * NB; k++) { const g = bar * PER + slot + k, b = Math.floor(g / PER) % NB, s = g % PER; const e = evAt(b, s); if (e) return e; } return null; };
  function showKeys(bar, slot) { kb.show({ rh: null, lh: null, [handKey]: evAt(bar, slot) }, { rh: null, lh: null, [handKey]: nextEv(bar, slot) }, 'both'); }

  function play1(m, time, dur, v) {
    if (settings.pianoSnd && midiState().canPlay) { const onMs = performance.now() + (time - audio.now()) * 1000; if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return; }
    audio.pianoNote(m, time, dur, v);
  }
  const fb = (html) => { fbEl.innerHTML = html; };
  function setBpm(v) { st.bpm = Math.max(40, Math.min(160, Math.round(v))); bpmOut.innerHTML = `♩ ${st.bpm}`; store.set('tempo:' + itemId, st.bpm); }
  function paintPrimary() { primary.innerHTML = st.playing ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`; }
  function paintHint() { const r = mel ? 'Mel' : rh ? 'Rh' : ''; footHint.textContent = st.mode === 'listen' ? t('fListenHint' + r) : midiOn() ? t('fPlayHint' + r) : t('fPlayHintScreen' + r); }
  function paintStreak() {
    streakEl.replaceChildren(...Array.from({ length: CLEAN_TO_PASS }, (_, k) => h('i' + (k < st.streak ? '' : '.off'))));
    chorusEl.textContent = `${t('chorusW')} ${st.choruses + 1}`;
  }
  const guideOn = () => st.mode === 'listen' || !midiOn();

  // ---------- transport ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null;
  let exp = [], barSt = [], chSt = null;
  const swingOff = () => { const beat = 60 / st.bpm; return st.swing ? beat * 2 / 3 : beat / 2; };
  const tols = () => { const e8 = 60 / st.bpm / 2; return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.16, 0.035), 0.075) }; };
  function play() {
    if (!audio.ensureAudio() || st.playing) return;
    st.playing = true; screen.classList.add('playing'); paintPrimary();
    st.streak = 0; st.choruses = 0; paintStreak();
    cells.forEach((c) => c.classList.remove('ok', 'meh', 'bad', 'cur'));
    const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += 4 * beat; beatTime = t0; g = 0; run = { t0, beat, swing: st.swing };
    exp = []; barSt = []; chSt = { miss: 0, bad: 0, ok: 0, meh: 0 };
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function schedule() {
    const ahead = audio.now() + 0.15, beat = 60 / st.bpm;
    while (st.playing) {
      const slot = g % PER, bar = Math.floor(g / PER) % NB, chorus = Math.floor(g / (PER * NB));
      const time = beatTime + (slot % 2 ? swingOff() : 0);
      if (time > ahead) break;
      if (settings.impBeat === 'drums') groove(slot, time, { swing: st.swing, style: form.style, bar: Math.floor(g / PER) }); else if (settings.met && slot % 2 === 0) audio.click(time, slot === 0);
      // right-hand mode: the left hand is the band, always audible
      if (rh) lhNotes[bar].filter((e) => e.t === slot).forEach((e) => play1(e.m, time, e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9, 0.35));
      const evs = barNotes[bar].filter((e) => e.t === slot);
      evs.forEach((e) => {
        const dur = e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9;
        if (guideOn()) play1(e.m, time, dur, 0.45);
        if (st.mode === 'play') exp.push({ t: time, m: e.m, bar, chorus, hit: false });
      });
      if (slot === 0) queue.push({ t: time, barStart: bar, chorus });
      if (slot === PER - 1) queue.push({ t: time + beat + 0.3, barEnd: bar, chorus });
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
    while (queue.length && queue[0].t <= now) {
      const q = queue.shift();
      if (q.ci !== undefined) { fb(`${t('countInLabel')}: <b>${q.ci}</b>`); continue; }
      if (q.barStart !== undefined) { cells.forEach((c, k) => c.classList.toggle('cur', k === q.barStart)); keepInView(q.barStart); if (q.barStart === 0) { cells.forEach((c) => c.classList.remove('ok', 'meh', 'bad')); } continue; }
      if (q.barEnd !== undefined) { finishBar(q.barEnd, q.chorus); continue; }
      if (q.g !== undefined) { const slot = q.g % PER, bar = Math.floor(q.g / PER) % NB; showKeys(bar, slot); const beats = cells[bar].querySelectorAll('.fbeats i'); beats.forEach((i, b) => i.classList.toggle('on', b <= slot >> 1)); if (slot === 0) cells.forEach((c, k) => { if (k !== bar) c.querySelectorAll('.fbeats i').forEach((i) => i.classList.remove('on')); }); markActive(); }
    }
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    const was = st.playing; st.playing = false; run = null; exp = [];
    screen.classList.remove('playing');
    if (was) { audio.hush(); silence(); }
    cells.forEach((c) => { c.classList.remove('cur'); c.querySelectorAll('.fbeats i').forEach((i) => i.classList.remove('on')); });
    idle(); paintPrimary();
  }

  // ---------- scoring ----------
  const bs = (bar) => (barSt[bar] = barSt[bar] || { ok: 0, meh: 0, miss: 0, bad: 0 });
  function input(m, ts) {
    markActive();
    if (!st.playing || st.mode !== 'play') return;
    const T = audio.toAudioTime(ts), { win, tight } = tols();
    let best = null;
    for (const x of exp) { if (x.hit || x.m !== m) continue; const dt = T - x.t; if (Math.abs(dt) <= win && (!best || Math.abs(dt) < Math.abs(T - best.t))) best = x; }
    if (!best) {
      if (!exp.length || T < exp[0].t - win) return; // before the first note: ignore
      const bar = Math.floor(Math.max(0, posAt(T)) / PER) % NB;
      bs(bar).bad++; chSt.bad++; kb.flash(m, 'bad'); fb(`<span class="bad">${t('wrongNote')}: ${noteName(midiToName(m), names)}</span>`); return;
    }
    best.hit = true;
    const dt = T - best.t, cls = Math.abs(dt) <= tight ? 'ok' : 'meh';
    bs(best.bar)[cls]++; chSt[cls]++;
    kb.flash(m, cls);
    fb(cls === 'ok' ? `<span class="ok">${t('even')}</span>` : `<span class="meh">${dt < 0 ? t('early') : t('late')} ${Math.round(Math.abs(dt) * 1000)} ${t('ms')}</span>`);
  }
  function expire(now) {
    const { win } = tols();
    while (exp.length && (exp[0].hit || exp[0].t + win < now)) { const x = exp.shift(); if (!x.hit) { bs(x.bar).miss++; chSt.miss++; } }
  }
  function finishBar(bar, chorus) {
    const s = bs(bar);
    const cls = s.miss + s.bad === 0 ? 'ok' : s.ok + s.meh >= s.miss ? 'meh' : 'bad';
    if (st.mode === 'play') cells[bar].classList.add(cls);
    barSt[bar] = null;
    if (bar === NB - 1) finishChorus(chorus);
  }
  function finishChorus(chorus) {
    st.choruses = chorus + 1;
    const s = chSt; chSt = { miss: 0, bad: 0, ok: 0, meh: 0 };
    if (st.mode !== 'play') { paintStreak(); return; }
    const total = s.ok + s.meh + s.miss, slips = s.miss + s.bad, clean = slips <= maxSlips && total > 0;
    st.streak = clean ? st.streak + 1 : 0;
    paintStreak();
    const pct = total ? Math.round((s.ok / total) * 100) : 0;
    let html = `${t('chorusW')} ${chorus + 1}: ` + (clean ? `<span class="ok">${t('cleanW')} ✓</span>` : `<span class="bad">${slips} ${t('slipsW')}</span>`) + ` · ${pct}% ${t('evenPct')}`;
    updateEx(itemId, (p) => ({ ...p, choruses: (p.choruses || 0) + 1, cleanChoruses: (p.cleanChoruses || 0) + (clean ? 1 : 0), bestStreak: Math.max(p.bestStreak || 0, st.streak), bestTempo: clean ? Math.max(p.bestTempo || 0, st.bpm) : p.bestTempo || 0 }));
    if (st.streak >= CLEAN_TO_PASS) {
      const first = !exProgress(itemId).stages.done;
      updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, done: true } }));
      scheduleReview(itemId, true);
      html += ` · <b>${first ? t('fPassed') : t('fPassedAgain')}</b>`;
    } else if (!clean && wasDue && st.choruses >= CLEAN_TO_PASS) scheduleReview(itemId, false);
    fb(html);
  }

  // ---------- wiring ----------
  const offNote = onNote((e) => { if (e.type === 'on') { kb.down(e.note, true); input(e.note, e.ts); } else kb.down(e.note, false); });
  const onKey = (e) => { if (e.code === 'Space' && !e.target.closest('input,select,textarea,summary')) { e.preventDefault(); if (st.playing) stop(); else play(); } };
  document.addEventListener('keydown', onKey);

  setBpm(st.bpm); paintPrimary(); paintHint(); paintStreak(); showKeys(0, 0);
  const saved = exProgress(itemId);
  fb(saved.cleanChoruses ? `${t('fSoFar')}: ${saved.cleanChoruses} ${t('fCleanOf')} ${saved.choruses}` : t('fStart').replace('{n}', NB));
  updateEx(itemId, (p) => p);

  return () => { if (st.playing) stop(); offNote(); document.removeEventListener('keydown', onKey); header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup()); };
}
