// Melody screen: a written tune (jazzlab-melody/1), learned by ear phrase by phrase, then with the fingers.
// Stages: Echo (the piano plays one phrase, you repeat it in as many bars, over drums + the left-hand pattern)
// → Fingers (the phrase as an exercise, #/t/<track>/<item>/fingers/<phrase>) → By heart (the whole tune as an exercise,
// #/t/<track>/<item>/fingers/all: its «by heart» passes the melody item and puts it on review).
// Echo is passed with 3 clean repeats of every phrase. Scoring is the lick echo's: onsets in the timing window,
// the same MIDI notes in the same order. Pickups are ignored: a phrase is exactly its bars.
import { h, ICON, themeButton, midiChip, sessionChip } from '../ui.js';
import { t, L, plural } from '../i18n.js';
import { store, updateEx, exProgress, markActive, idle } from '../store.js';
import { noteName } from '../music/notes.js';
import { createKeyboard } from '../music/keyboard.js';
import { melodyNotes, patternBars } from '../music/forms.js';
import * as audio from '../music/audio.js';
import { groove } from '../music/drums.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';

const PER = 8; // eighths per bar
const CLEAN_TO_PASS = 3; // clean repeats per phrase

export function renderMelody(root, { track, itemId, item, melody, pattern, form, back }) {
  const settings = { met: true, names: 'en', pianoSnd: true, impBeat: 'drums', ...store.get('settings', {}) };
  const names = settings.names === 'off' ? 'en' : settings.names;
  const phrases = melody.phrases;
  const saved = exProgress(itemId);
  const clean = phrases.map((_, i) => (saved.echo && saved.echo[i]) || 0);
  const firstOpen = clean.findIndex((n) => n < CLEAN_TO_PASS);
  const st = {
    stage: store.get('melStage:' + itemId, 'echo'),
    phrase: firstOpen >= 0 ? firstOpen : 0,
    bpm: store.get('tempo:' + itemId, melody.tempo || form.tempo || 66),
    swing: !!melody.swing && form.style !== 'bossa', // the tune's feel: a bossa is straight, a standard swings
    playing: false,
    clean
  };
  if (!['echo', 'fingers', 'memory'].includes(st.stage)) st.stage = 'echo';
  const midiOn = () => midiState().connected;
  const phraseLabel = (i) => `${phrases[i][0] + 1}–${phrases[i][1] + 1}`;
  const exHref = (i) => `${item.href}/fingers/${i}`;
  const allHref = `${item.href}/fingers/all`;

  // notes of the current phrase
  let notes = [], rows = [], nb = 2, LEN = 16, lhBars = []; // rows: distinct pitches, low → high
  const lhTune = pattern ? patternBars(pattern, melody.bars.map((b) => b.chord)) : []; // the left hand over the whole tune, in order
  function computeNotes() {
    const [from, to] = phrases[st.phrase];
    nb = to - from + 1; LEN = nb * PER;
    notes = melodyNotes(melody, [from, to]);
    const uniq = [...new Map(notes.map((e) => [e.m, e])).values()].sort((a, b) => a.m - b.m);
    rows = uniq.map((e) => ({ m: e.m, name: noteName(e.name, names), f: e.f, spelled: e.name }));
    lhBars = pattern ? lhTune.slice(from, to + 1) : Array.from({ length: nb }, () => []);
  }
  computeNotes();

  // ---------- layout (the lick screen's classes) ----------
  const stageBtn = (sid, n) => h('button', { type: 'button', 'data-stage': sid, onclick: () => setStage(sid) }, h('span.num', null, String(n)), t('lk_' + sid));
  const stages = h('nav.seg.stages', { 'aria-label': 'stages' }, stageBtn('echo', 1), stageBtn('fingers', 2), stageBtn('memory', 3));
  const header = h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': t('back'), title: t('back'), html: ICON.back }),
    h('div.titles', null,
      h('span.kicker', null, `${L(track.title).toUpperCase()} · ${t('melUpper')}`),
      h('span.title', null, item.title || L(melody.title))),
    h('div.grow'), stages, h('div.grow'),
    sessionChip(itemId), midiChip(), themeButton());

  const phraseSeg = h('div.seg.lickchords', { role: 'group', 'aria-label': t('mlPhrase') });
  const title = h('h2'), sub = h('span.sub');
  const fbEl = h('span.fb', { 'aria-live': 'polite' });
  const cyc = [0, 1].map(() => { const beats = h('div.cbeats'); const role = h('b'), what = h('span'); return { el: h('div.cyc', null, role, what, h('div.grow'), beats), role, what, beats }; });
  const roll = h('div.roll.lickroll');
  const echoBox = h('div.lickecho', null, h('div.cycle', null, cyc[0].el, cyc[1].el), roll);
  const openBtn = h('a.btn.accent.xl.lickopen');
  const allBtn = h('a.btn.ghost.lickopen', { href: allHref, html: ICON.note + `<span>${t('mlAll')}</span>` });
  const linkText = h('p.dabout');
  const linkBox = h('div.licklink', null, linkText, openBtn, allBtn);
  const panel = h('section.panel.imppanel.lickpanel', null,
    h('div.rhead', null, title, h('div.grow'), phraseSeg),
    h('div.lickinfo', null, sub, fbEl),
    echoBox, linkBox);
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel', null, kbEl);

  const bpmOut = h('output.bpm');
  const tempoBox = h('div.stepper', null,
    h('button', { type: 'button', 'aria-label': t('slower'), onclick: () => setBpm(st.bpm - 4) }, '−'), bpmOut,
    h('button', { type: 'button', 'aria-label': t('faster'), onclick: () => setBpm(st.bpm + 4) }, '+'));
  const beatSeg = seg([['drums', t('drums')], ['click', t('metronome')]], settings.impBeat, (v) => {
    settings.impBeat = v; store.set('settings', { ...store.get('settings', {}), impBeat: v });
  }, 'backing');
  const footHint = h('span.foothint');
  const primary = h('button.btn.accent.xl', { type: 'button', onclick: onPrimary });
  const footer = h('footer.actions', null, h('div.footsegs', null, beatSeg), tempoBox, footHint, h('div.grow'), primary);
  const screen = h('div.exscreen.impscreen.lickscreen.melscreen', null, header, h('main.ex.imp', null, panel, kbPanel), footer);
  root.replaceChildren(screen);

  function seg(items, value, cb, label) {
    const w = h('div.seg', { role: 'group', 'aria-label': label ? t(label) : null });
    items.forEach(([v, text]) => w.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), onclick: (e) => {
      w.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); cb(v);
    } }, text)));
    return w;
  }
  const chipCount = phrases.map(() => h('small'));
  phrases.forEach((_, i) => phraseSeg.append(h('button', { type: 'button', 'data-v': String(i), title: t('mlEchoGoal'), onclick: () => setPhrase(i) }, phraseLabel(i), ' ', chipCount[i])));

  // ---------- keyboard: one range for the whole tune and the left-hand pattern, the current phrase lit ----------
  const rhAll = melodyNotes(melody, [0, melody.bars.length - 1]).map((e) => e.m);
  const lhAll = lhTune.flat().map((e) => e.m);
  const lo = Math.min(...rhAll, ...lhAll), hi = Math.max(...rhAll, ...lhAll);
  audio.preloadPiano(lo - 2, hi + 4);
  const kb = createKeyboard(kbEl, [lo, hi], { names: settings.names, onPress: (m) => { audio.ensureAudio(); play1(m, audio.now() + 0.01, 0.5, 0.55); if (!midiOn()) input(m, performance.now()); } });
  function paintKeys() { kb.show({ rh: { notes: rows.map((r) => r.spelled), f: rows.map((r) => r.f) }, lh: null }, { rh: null, lh: null }, 'both'); }

  // ---------- roll: the phrase's bars, one row per distinct pitch ----------
  const pct = (slot) => (slot / LEN) * 100;
  let rollNotes = [], ghost = [], mine = [], ticks = [], contour = null, head = null;
  function buildRoll() {
    const kids = [];
    for (let k = 0; k < LEN; k += 2) {
      kids.push(h('div.bline' + (k && k % PER === 0 ? '.bar' : ''), { style: `left:${pct(k)}%` }));
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
    cyc.forEach((c) => c.beats.replaceChildren(...Array.from({ length: nb * 4 }, () => h('i'))));
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
  const echoDone = () => phrases.every((_, i) => st.clean[i] >= CLEAN_TO_PASS);
  function paintCounts() {
    phraseSeg.querySelectorAll('button').forEach((b, i) => {
      b.setAttribute('aria-pressed', String(i === st.phrase));
      b.classList.toggle('ok', st.clean[i] >= CLEAN_TO_PASS);
      chipCount[i].textContent = `${Math.min(st.clean[i], CLEAN_TO_PASS)}/${CLEAN_TO_PASS}`;
    });
  }
  function paintStages() {
    const p = exProgress(itemId);
    const fingersDone = phrases.some((_, i) => exProgress(`${itemId}-p${i}`).stages.tempo) || !!exProgress(`${itemId}-all`).stages.tempo;
    const done = { echo: !!p.stages.echo, fingers: fingersDone || !!p.stages.done, memory: !!p.stages.done };
    stages.querySelectorAll('button').forEach((b, k) => {
      const sid = b.dataset.stage;
      b.setAttribute('aria-pressed', String(sid === st.stage));
      b.classList.toggle('done', done[sid]);
      b.querySelector('.num').innerHTML = done[sid] ? ICON.check : String(k + 1);
    });
  }
  function paintPhrase() {
    openBtn.href = exHref(st.phrase);
    openBtn.innerHTML = ICON.note + `<span>${t('mlOpen').replace('{p}', phraseLabel(st.phrase))}</span>`;
    // fingers: the chosen phrase first, the whole tune second; by heart: the whole tune is the main button
    const memory = st.stage === 'memory';
    openBtn.style.display = memory ? 'none' : '';
    allBtn.className = 'btn lickopen ' + (memory ? 'accent xl' : 'ghost');
    linkText.textContent = memory ? t('mlL_memory') : L(melody.about);
    paintCounts();
  }
  function startHint() { return t('mlStartHint').replace(/\{n\}/g, `${nb} ${plural(nb, 'mlBarsW')}`); }
  function setStage(sid) {
    if (st.playing) stop();
    st.stage = sid; store.set('melStage:' + itemId, sid);
    screen.dataset.lstage = sid;
    title.textContent = t('lkT_' + sid); sub.textContent = t('mlS_' + sid);
    footHint.textContent = sid === 'echo' ? t('lkF_echo') : sid === 'fingers' ? t('mlF_link') : '';
    paintStages(); paintCycle(-1, 0); paintPrimary(); paintPhrase();
    if (sid === 'echo') fb(echoDone() ? `<span class="ok">${ICON.check} ${t('mlEchoDone')}</span>` : startHint());
    else fb(exProgress(itemId).stages.done ? `<span class="ok">${ICON.check} ${t('mlPassed')}</span>` : '');
  }
  function setPhrase(i) {
    if (st.playing) stop();
    st.phrase = i;
    computeNotes(); buildRoll(); paintKeys(); paintPhrase();
    if (st.stage === 'echo') fb(echoDone() ? `<span class="ok">${ICON.check} ${t('mlEchoDone')}</span>` : startHint());
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
    if (st.stage === 'fingers') { primary.innerHTML = ICON.note + `<span>${t('mlOpen').replace('{p}', phraseLabel(st.phrase))}</span>`; return; }
    if (st.stage === 'memory') { primary.innerHTML = ICON.note + `<span>${t('mlAll')}</span>`; return; }
    primary.innerHTML = st.playing ? ICON.stop + `<span>${t('stop')}</span>` : ICON.play + `<span>${t('play')}</span>`;
  }
  function onPrimary() {
    if (st.stage === 'fingers') { location.hash = exHref(st.phrase); return; }
    if (st.stage === 'memory') { location.hash = allHref; return; }
    if (st.playing) stop(); else play();
  }
  function setBpm(v) {
    st.bpm = Math.max(40, Math.min(200, Math.round(v)));
    bpmOut.innerHTML = `♩ ${st.bpm}`;
    store.set('tempo:' + itemId, st.bpm);
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

  // ---------- transport: 1-bar count-in, then an endless cycle of 2 × nb bars (nb piano + nb you) ----------
  let timer = 0, raf = 0, g = 0, beatTime = 0, queue = [], run = null, exp = [], barSt = null, lastResult = '';
  const eighthOff = () => { const beat = 60 / st.bpm; return st.swing ? beat * 2 / 3 : beat / 2; }; // the offbeat's offset in the beat
  const enqueue = (x) => { queue.push(x); queue.sort((a, b) => a.t - b.t); };
  function play() {
    if (!audio.ensureAudio() || st.playing) return;
    st.playing = true; screen.classList.add('playing'); paintPrimary();
    const beat = 60 / st.bpm; let t0 = audio.now() + 0.12;
    for (let k = 0; k < 4; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += 4 * beat; beatTime = t0; g = 0;
    run = { t0, beat, nb };
    clearMine(); exp = []; barSt = null;
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
  }
  function schedule() {
    const ahead = audio.now() + 0.15, beat = 60 / st.bpm, cycle = 2 * nb;
    while (st.playing) {
      const slot = g % PER, bar = Math.floor(g / PER), k = bar % cycle, pb = k % nb, ls = pb * PER + slot; // ls: slot in the phrase
      const time = beatTime + (slot % 2 ? eighthOff() : 0);
      if (time > ahead) break;
      if (k === 0 && slot === 0) enqueue({ t: time - 0.02, phrase: true });
      if (k === nb && slot === 0) { exp = []; enqueue({ t: time - 0.12, youStart: bar }); }
      // backing: drums or metronome + the left-hand pattern over the phrase bar's chord, in both halves
      if (settings.impBeat === 'drums') groove(slot, time, { swing: st.swing, style: form.style, bar }); else if (settings.met && slot % 2 === 0) audio.click(time, slot === 0);
      lhBars[pb].filter((e) => e.t === slot).forEach((e) => play1(e.m, time, e.stac ? Math.min(beat * 0.5, 0.25) : beat * e.d / 2 * 0.9, 0.3));
      const evs = notes.filter((e) => e.t === ls);
      if (k < nb) evs.forEach((e) => play1(e.m, time, beat / 2 * e.d * 0.95, 0.55));
      else evs.forEach((e) => exp.push({ t: time, slot: ls, len: e.d, hit: false, m: e.m }));
      if (k === cycle - 1 && slot === PER - 1) enqueue({ t: time + beat * 0.5 + 0.25, youEnd: bar });
      if (slot % 2) beatTime += beat;
      g++;
    }
  }
  function posAt(T) { // position in eighth slots (swing-aware)
    if (!run) return -1;
    const beats = (T - run.t0) / run.beat, w = Math.floor(beats), f = beats - w, sw = st.swing ? 2 / 3 : 0.5;
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
      const cb = Math.floor(p / PER) % (2 * run.nb), inPh = p % LEN, half = cb < run.nb ? 0 : 1;
      head.style.left = pct(inPh) + '%';
      paintCycle(half, Math.floor(inPh / 2));
      rollNotes.forEach((n) => { const s = +n.dataset.slot; n.classList.toggle('now', inPh >= s && inPh < s + 1); });
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

  // ---------- input + scoring (the lick echo's: rhythm by onsets, notes compared exactly) ----------
  const tols = () => { const e8 = 60 / st.bpm / 2; return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.2, 0.04), 0.08) }; };
  function input(m, ts) {
    markActive();
    if (!st.playing || !barSt || st.stage !== 'echo') return;
    const T = audio.toAudioTime(ts), { win, tight } = tols();
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
    const el = addBlock(mine, 'mine', best.slot + dt / (30 / st.bpm), best.len, m);
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
    const isClean = total > 0 && barSt.miss === 0 && barSt.extra === 0 && same === total;
    let html = `${t('rhythmW')}: <b>${hit}/${total}</b>` + (barSt.extra ? ` · ${t('extraTap')}: ${barSt.extra}` : '') + ` · ${t('impSameNotes')}: <b>${same}/${total}</b>`;
    if (isClean) {
      html += ` · <span class="ok">${t('cleanW')} ✓</span>`;
      const i = st.phrase;
      st.clean[i] = (st.clean[i] || 0) + 1;
      updateEx(itemId, (p) => ({ ...p, echo: { ...(p.echo || {}), [i]: st.clean[i] } }));
      if (echoDone() && !exProgress(itemId).stages.echo) {
        updateEx(itemId, (p) => ({ ...p, stages: { ...p.stages, echo: true } }));
        paintStages();
        html += ` · <b>${t('mlEchoDone')}</b>`;
      } else if (st.clean[i] === CLEAN_TO_PASS && !echoDone()) {
        html += ` · ${t('mlNext').replace('{p}', phraseLabel(phrases.findIndex((_, x) => st.clean[x] < CLEAN_TO_PASS)))}`;
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
  buildRoll(); paintKeys(); paintPhrase();
  setStage(st.stage);
  updateEx(itemId, (p) => p);

  return () => {
    if (st.playing) stop();
    offNote(); document.removeEventListener('keydown', onKey);
    header.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup());
  };
}
