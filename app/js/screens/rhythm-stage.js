// Rhythm stage, the way the book does it: only the exercise's rhythm pattern (one bar, shown in notation),
// clapped and counted on a loop until it sits — not the whole melody.
// Learn: listen → tap along → on your own, with syllables. Practice: endless loop, tempo ladder, 3 clean rounds open the notes.
import { h, ICON } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { store, exProgress, markActive, idle } from '../store.js';
import { parsePattern, patternRhythm } from '../music/rhythm.js';
import { renderRhythmNotation } from '../music/rhythmnote.js';
import * as audio from '../music/audio.js';
import { silence } from '../music/midi.js';

const RUNS = 3; // clean rounds to open the notes
const ROUND = 4; // clean loops in a row = one clean round
const TOGETHER_OK = 2; // clean loops in a row while tapping along → on your own
const SOLO_OK = 4; // clean loops in a row alone → learned
const LISTEN_LOOPS = 2;

/**
 * @param ex      exercise (uses ex.rhythm, ex.per, ex.swing, ex.tempo)
 * @param io      { play1(m, time, dur, vel), bpm(), setBpm(v), swing(), onPlaying(bool), onMode(mode), onDone() }
 */
export function createRhythmStage(ex, io) {
  const per = ex.per;
  const pattern = parsePattern(ex.rhythm || fallbackPattern(ex));
  const lang = getLang();
  const patStr = ex.rhythm || fallbackPattern(ex);
  let rh = patternRhythm(patStr, per, lang, io.syl ? io.syl() : 'food');
  const onsets = rh.onsets; // [{slot, len, acc, syl}] (timing never changes with the syllable system)
  const st = {
    mode: store.get('rmode:' + ex.id, exProgress(ex.id).stages.rhythm ? 'practice' : 'learn'),
    lstep: 'listen', playing: false, cleanRuns: 0, streak: 0, loopsDone: 0
  };

  // ---------- DOM ----------
  const seg = (items, value, cb) => {
    const w = h('div.seg', { role: 'group' });
    items.forEach(([v, text]) => w.append(h('button', { type: 'button', 'data-v': v, 'aria-pressed': String(v === value), onclick: () => cb(v) }, text)));
    return w;
  };
  const modeSeg = seg([['learn', t('rLearn')], ['practice', t('rPractice')]], st.mode, (v) => setMode(v));
  const lstepBtn = (id, n) => h('button', { type: 'button', 'data-l': id, onclick: () => setLstep(id) }, h('span.n', null, String(n)), t('l_' + id));
  const lsteps = h('div.lsteps', null, lstepBtn('listen', 1), lstepBtn('together', 2), lstepBtn('solo', 3));
  const pHint = h('span.phint', null, t('practiceHint'));
  const history = h('div.loops', { 'aria-label': t('loopsW') });
  const loopNo = h('span.barno');
  const rbar = h('div.rbar', null, modeSeg, lsteps, pHint, h('div.grow'), history, loopNo);

  const title = h('h2'), sub = h('span.sub'), fbEl = h('span.fb', { 'aria-live': 'polite' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const notation = renderRhythmNotation(svg, pattern, per);
  const patBox = h('div.patbox', null, h('span.patlabel', null, t('patternW')), svg);

  // lane: one bar, note bars sized by duration, syllables, ball, your taps
  const pct = (slot) => (slot / per) * 100;
  const strip = h('div.strip');
  const lane = h('div.lane', { 'data-mode': 'learn' }, strip);
  const head = h('div.head'), ball = h('div.ball');
  let noteEls = new Map(), ticks = [];
  function buildLane() {
    const syl = st.mode === 'learn';
    lane.dataset.mode = st.mode === 'learn' ? 'learn' : 'loop';
    const kids = [h('div.tline')];
    for (let k = 0; k < per; k += 2) {
      kids.push(h('div.bline' + (k === 0 ? '.bar' : ''), { style: `left:${pct(k)}%` }));
      kids.push(h('div.bnum', { style: `left:${pct(k)}%`, 'data-slot': k }, String(k / 2 + 1)));
      kids.push(h('div.bnum.and', { style: `left:${pct(k + 1)}%`, 'data-slot': k + 1 }, '+'));
    }
    rh.rests.forEach((x) => kids.push(h('div.lrest', { style: `left:${pct(x.slot)}%;width:calc(${pct(x.len || 1)}% - 8px)` }, syl ? x.syl : '')));
    noteEls = new Map();
    onsets.forEach((o) => {
      const n = h('div.lnote', { style: `left:${pct(o.slot)}%;width:calc(${pct(o.len)}% - 8px)` }, syl ? h('span', null, o.syl) : null);
      noteEls.set(o.slot, n); kids.push(n);
    });
    strip.replaceChildren(...kids, head, ball);
    ticks = [];
    setPos(0);
  }
  function setPos(p) {
    const x = Math.max(0, Math.min(100, pct(p)));
    head.style.left = ball.style.left = x + '%';
    const f = ((p / 2) % 1 + 1) % 1;
    ball.style.transform = `translate(-50%, ${-Math.sin(Math.PI * f) * 34}px)`;
    const s = Math.floor(p);
    strip.querySelectorAll('.bnum').forEach((n) => n.classList.toggle('cur', st.playing && s === +n.dataset.slot));
    noteEls.forEach((n, slot) => n.classList.toggle('now', st.playing && p >= slot && p < slot + 1));
    const ev = st.playing ? pattern.filter((e) => e.t <= p).pop() : null;
    notation.now(ev ? ev.t : -1);
  }
  function addTick(p, cls, label) {
    const el = h('div.tick.' + cls, { style: `left:${pct(p)}%` }, label ? h('span', null, label) : null);
    strip.append(el); ticks.push(el);
  }
  function clearTicks() { ticks.forEach((x) => x.remove()); ticks = []; noteEls.forEach((n) => n.classList.remove('ok', 'meh', 'bad')); }

  const panel = h('section.panel.rhythmpanel', null,
    h('div.rhead', null, title, sub, h('div.grow'), fbEl),
    patBox, lane,
    h('div.legend', null,
      h('span', null, h('i.sw.n'), t('legendLen')), h('span', null, h('i.sw.r'), t('legendRest')),
      h('span', null, h('i.tk.ok'), t('legendOk')), h('span', null, h('i.tk.meh'), t('legendEarlyLate')), h('span', null, h('i.tk.bad'), t('legendExtra'))));

  // practice panels
  const gDots = h('div.gdots'), gAvg = h('i.gavg'), gText = h('p');
  const gauge = h('section.panel.rstat', null, h('h3', null, t('gaugeTitle')),
    h('div.gauge', null, h('div.gzone'), h('div.gmid'), gDots, gAvg),
    h('div.gscale', null, h('span', null, '← ' + t('earlyW')), h('span', null, t('onTime')), h('span', null, t('lateW') + ' →')), gText);
  const ladderBars = h('div.ladder'), ladderTxt = h('div.gscale');
  const ladder = h('section.panel.rstat', null, h('h3', null, t('ladderTitle')), ladderBars, ladderTxt);
  const runDots = h('div.runs', { role: 'img' }, ...Array.from({ length: RUNS }, () => h('i')));
  const toNotesTxt = h('p');
  const toNotes = h('section.panel.rstat', null, h('h3', null, t('toNotes')), runDots, toNotesTxt);
  const stats = h('div.rstats', null, gauge, ladder, toNotes);

  const pad = h('button.tappad', { type: 'button' },
    h('span.padicon', { html: ICON.hand }),
    h('span.padtext', null, h('b', null, t('tapHere')), h('span', null, t('countAloud'))));
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(e.timeStamp); });

  // ---------- painting ----------
  let recent = [], hist = [];
  function paint() {
    if (io.onMode) io.onMode(st.mode);
    lsteps.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.l === st.lstep)));
    modeSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.mode)));
    const key = st.mode === 'learn' ? st.lstep : 'practice';
    title.textContent = t('rt_' + key);
    sub.textContent = t('rs_' + key) + (ex.swing && key !== 'practice' ? ' ' + t('swingHint') : '');
    paintRuns(); paintLadder(); paintGauge(); paintHistory();
  }
  function paintHistory() {
    history.replaceChildren(...hist.slice(-8).map((c) => h('i.' + c)));
    loopNo.textContent = st.playing && st.loopsDone >= 0 ? `${t('loopW')} ${st.loopsDone + 1}` : '';
  }
  function paintRuns() {
    [...runDots.children].forEach((d, k) => { d.classList.toggle('on', k < st.cleanRuns); d.textContent = k < st.cleanRuns ? '✓' : ''; });
    const left = RUNS - st.cleanRuns;
    toNotesTxt.textContent = exProgress(ex.id).stages.rhythm ? t('notesOpen') : `${t('roundRule')} ${left === 1 ? t('oneMoreRun') : t('runsLeft').replace('{n}', left)}`;
  }
  function paintLadder() {
    const bpm = io.bpm(), lo = Math.min(ex.tempo.start, bpm), hi = Math.max(ex.tempo.target, lo + 4), rungs = [];
    for (let v = lo; v < hi; v += 4) rungs.push(v);
    rungs.push(hi);
    const cur = rungs.reduce((a, v) => (v <= bpm ? v : a), rungs[0]);
    ladderBars.replaceChildren(...rungs.map((v, k) => h('i' + (v === cur ? '.cur' : v < bpm ? '.done' : ''), { style: `height:${14 + (34 * k) / Math.max(1, rungs.length - 1)}px`, title: '♩ ' + v })));
    ladderTxt.replaceChildren(h('span', null, '♩ ' + lo), h('b', null, `${t('nowW')} ♩ ${bpm}`), h('span', null, `${t('goalW')} ♩ ${hi}`));
  }
  function paintGauge() {
    const R = 0.15;
    gDots.replaceChildren(...recent.map((x, k) => h('i.' + x.cls, { style: `left:${50 + 50 * Math.max(-1, Math.min(1, x.dt / R))}%;top:${6 + (k % 3) * 9}px` })));
    if (!recent.length) { gAvg.style.display = 'none'; gText.textContent = t('gaugeEmpty'); return; }
    const avg = recent.reduce((a, x) => a + x.dt, 0) / recent.length, ms = Math.round(Math.abs(avg) * 1000);
    gAvg.style.display = ''; gAvg.style.left = `${50 + 50 * Math.max(-1, Math.min(1, avg / R))}%`;
    gText.innerHTML = ms < 15 ? `<b>${t('gaugeEven')}</b>` : avg < 0 ? `<b>${t('gaugeEarly').replace('{n}', ms)}</b> ${t('adviceEarly')}` : `<b>${t('gaugeLate').replace('{n}', ms)}</b> ${t('adviceLate')}`;
  }
  const fb = (html) => { fbEl.innerHTML = html; };
  function setMode(v) { stop(); st.mode = v; store.set('rmode:' + ex.id, v); st.streak = 0; buildLane(); paint(); fb(v === 'learn' && st.lstep === 'listen' ? t('listenHint') : t('tapStart')); io.onPlaying(false); }
  function setLstep(v) { stop(); st.lstep = v; st.streak = 0; paint(); fb(v === 'listen' ? t('listenHint') : t('tapStart')); io.onPlaying(false); }

  // ---------- transport: count-in, then the pattern on a loop ----------
  let timer = 0, raf = 0, loops = [], queue = [], exp = [], stats0 = [], slotIdx = 0, loopIdx = 0, nextT = 0;
  const guideOn = () => st.mode === 'learn' && st.lstep !== 'solo';
  const swingFrac = () => (io.swing() ? 2 / 3 : 0.5);
  function start() {
    if (!audio.ensureAudio() || st.playing) return;
    st.playing = true; st.loopsDone = 0; st.streak = 0; st.said = false;
    const beat = 60 / io.bpm(); let t0 = audio.now() + 0.12;
    for (let k = 0; k < ex.beats; k++) { audio.click(t0 + k * beat, k === 0); queue.push({ t: t0 + k * beat, ci: k + 1 }); }
    t0 += ex.beats * beat;
    loops = []; exp = []; stats0 = []; slotIdx = 0; loopIdx = 0; nextT = t0;
    clearTicks(); hist = []; paintHistory();
    timer = setInterval(schedule, 25); schedule(); raf = requestAnimationFrame(tick);
    io.onPlaying(true);
  }
  function schedule() {
    const ahead = audio.now() + 0.15;
    while (st.playing) {
      if (slotIdx === 0) { // a new loop starts: tempo may have changed
        if (loops[loopIdx] === undefined) {
          const beat = 60 / io.bpm();
          loops[loopIdx] = { start: nextT, beat, sw: swingFrac() };
          stats0[loopIdx] = { ok: 0, meh: 0, miss: 0, extra: 0, n: 0 };
          if (loopIdx > 0) queue.push({ t: nextT - 0.15, loopStart: loopIdx });
        }
      }
      const L = loops[loopIdx], beatI = Math.floor(slotIdx / 2);
      const time = L.start + beatI * L.beat + (slotIdx % 2 ? L.beat * L.sw : 0);
      if (time > ahead) break;
      if (slotIdx % 2 === 0) audio.click(time, slotIdx === 0);
      const o = onsets.find((x) => x.slot === slotIdx);
      if (o) {
        if (guideOn() || st.listen) io.play1(72, time, Math.min(L.beat * o.len * 0.45, 0.5), 0.5);
        if (!st.listen) { exp.push({ t: time, slot: o.slot, loop: loopIdx, hit: false }); stats0[loopIdx].n++; }
      }
      slotIdx++;
      if (slotIdx >= per) {
        const end = L.start + (per / 2) * L.beat;
        queue.push({ t: end + 0.3, loopEnd: loopIdx });
        slotIdx = 0; loopIdx++; nextT = end;
        if (st.listen && loopIdx >= LISTEN_LOOPS) { queue.push({ t: end, end: true }); st.playing = 'ending'; break; }
      }
    }
  }
  function posAt(T) {
    let L = null, k = loops.length - 1;
    for (; k >= 0; k--) if (loops[k] && loops[k].start <= T) { L = loops[k]; break; }
    if (!L) return { loop: -1, p: 0 };
    const beats = (T - L.start) / L.beat, w = Math.floor(beats), f = beats - w;
    return { loop: k, p: 2 * w + (f < L.sw ? f / L.sw : 1 + (f - L.sw) / (1 - L.sw)) };
  }
  function tick() {
    const now = audio.now();
    while (queue.length && queue[0].t <= now) {
      const q = queue.shift();
      if (q.ci !== undefined) { fb(`${t('countInLabel')}: <b>${q.ci}</b>`); continue; }
      if (q.loopStart !== undefined) { clearTicks(); st.loopsDone = q.loopStart; paintHistory(); continue; }
      if (q.loopEnd !== undefined) { loopEnd(q.loopEnd); if (!st.playing) return; continue; }
      if (q.end) { const wasListen = st.listen; stop(true); if (wasListen) { st.lstep = 'together'; paint(); fb(`<b>${t('nowTogether')}</b>`); } return; }
    }
    // expire missed notes
    const win = tols().win;
    exp.forEach((x) => { if (!x.hit && !x.missed && x.t + win < now) { x.missed = true; stats0[x.loop].miss++; const n = noteEls.get(x.slot); if (n && x.loop === posAt(now).loop) n.classList.add('bad'); } });
    exp = exp.filter((x) => !(x.hit || x.missed) || x.t + 2 > now);
    const { p, loop } = posAt(now);
    if (loop >= 0) { setPos(p); if (!st.said) { st.said = true; fb(st.mode === 'learn' ? t('sayIt') : t('tempoHint')); } markActive(); }
    raf = requestAnimationFrame(tick);
  }
  function stop(natural) {
    if (!st.playing) return;
    clearInterval(timer); cancelAnimationFrame(raf); queue = [];
    st.playing = false; st.listen = false;
    if (!natural) { audio.hush(); silence(); }
    setPos(0); idle(); paintHistory();
    io.onPlaying(false);
  }

  // ---------- scoring, loop by loop ----------
  const tols = () => { const e8 = 60 / io.bpm() / 2; return { win: Math.min(Math.max(e8 * 0.45, 0.09), 0.25), tight: Math.min(Math.max(e8 * 0.16, 0.035), 0.075) }; };
  let lastTap = -1e9;
  function tap(ts) {
    audio.ensureAudio();
    pad.classList.remove('hit'); void pad.offsetWidth; pad.classList.add('hit');
    io.play1(60, audio.now() + 0.005, 0.12, 0.5);
    input(ts);
  }
  function input(ts) {
    markActive();
    if (ts - lastTap < 70) return; // a chord or a double trigger = one tap
    lastTap = ts;
    if (!st.playing || st.listen) { if (!st.playing) fb(st.mode === 'learn' && st.lstep === 'listen' ? t('listenHint') : t('tapStart')); return; }
    const T = audio.toAudioTime(ts), { win, tight } = tols();
    let best = null;
    for (const x of exp) { if (x.hit || x.missed) continue; const dt = T - x.t; if (Math.abs(dt) <= win && (!best || Math.abs(dt) < Math.abs(T - best.t))) best = x; }
    const { p, loop } = posAt(T);
    if (!best) {
      if (loop < 0) return; // during the count-in
      stats0[loop].extra++; addTick(Math.max(0, Math.min(per - 0.1, p)), 'bad', t('extraW'));
      return;
    }
    best.hit = true;
    const dt = T - best.t, cls = Math.abs(dt) <= tight ? 'ok' : 'meh';
    stats0[best.loop][cls]++;
    const L = loops[best.loop], e8 = best.slot % 2 ? L.beat * (1 - L.sw) : L.beat * L.sw;
    addTick(best.slot + dt / e8, cls, cls === 'ok' ? '✓' : `${dt < 0 ? t('earlyW') : t('lateW')} ${Math.round(Math.abs(dt) * 1000)}`);
    const n = noteEls.get(best.slot); if (n) { n.classList.remove('ok', 'meh', 'bad'); n.classList.add(cls); }
    if (st.mode === 'practice') { recent.push({ dt, cls }); if (recent.length > 12) recent.shift(); paintGauge(); }
  }
  function loopEnd(k) {
    const s = stats0[k]; if (!s) return;
    const clean = s.miss === 0 && s.extra === 0 && s.meh <= 1 && s.ok + s.meh === s.n;
    hist.push(clean ? (s.meh ? 'meh' : 'ok') : 'bad'); paintHistory();
    st.streak = clean ? st.streak + 1 : 0;
    const res = `${t('loopW')} ${k + 1}: ${clean ? `<span class="ok">${t('cleanW')} ✓</span>` : `<span class="bad">${s.ok + s.meh}/${s.n}${s.extra ? ` · ${t('extraTap')} ${s.extra}` : ''}</span>`}`;
    if (st.mode === 'learn') {
      if (st.lstep === 'together' && st.streak >= TOGETHER_OK) { st.lstep = 'solo'; st.streak = 0; paint(); fb(`${res} · <b>${t('nowSoloLoop')}</b>`); return; }
      if (st.lstep === 'solo' && st.streak >= SOLO_OK) { stop(true); setMode('practice'); fb(`${res} · <b>${t('learnedPattern')}</b>`); return; }
      fb(res + (st.lstep === 'together' ? ` · ${t('streakTo')} ${st.streak}/${TOGETHER_OK}` : ` · ${t('streakTo')} ${st.streak}/${SOLO_OK}`));
      return;
    }
    // practice: ROUND clean loops in a row = one clean round → tempo up, 3 rounds → notes
    if (st.streak >= ROUND) {
      st.streak = 0; st.cleanRuns = Math.min(RUNS, st.cleanRuns + 1); paintRuns();
      if (st.cleanRuns >= RUNS && !exProgress(ex.id).stages.rhythm) { stop(true); io.onDone(); return; }
      const bpm = io.bpm();
      if (bpm < ex.tempo.target) { io.setBpm(Math.min(ex.tempo.target, bpm + 4)); paintLadder(); fb(`${res} · <b>${t('roundClean')}</b> · ♩ → ${io.bpm()}`); return; }
      fb(`${res} · <b>${t('roundClean')}</b>`); return;
    }
    fb(`${res} · ${t('streakTo')} ${st.streak}/${ROUND}`);
  }

  buildLane(); paint(); fb(st.mode === 'learn' && st.lstep === 'listen' ? t('listenHint') : t('tapStart'));
  return {
    els: { rbar, panel, stats, pad },
    toggle() {
      if (st.playing) { stop(); return; }
      st.listen = st.mode === 'learn' && st.lstep === 'listen';
      start();
    },
    stop() { stop(); },
    playing: () => !!st.playing,
    input,
    tap,
    mode: () => st.mode,
    primaryHtml() {
      if (st.playing) return ICON.stop + `<span>${t('stop')}</span>`;
      if (st.mode === 'learn' && st.lstep === 'listen') return ICON.speaker + `<span>${t('listen')}</span>`;
      return ICON.play + `<span>${t(st.mode === 'learn' ? 'start' : 'loopPlay')}</span>`;
    },
    refresh() { paint(); },
    say(html) { fb(html); },
    /** syllable system changed */
    resyl() { rh = patternRhythm(patStr, per, lang, io.syl ? io.syl() : 'food'); onsets.forEach((o, k) => { o.syl = rh.onsets[k].syl; }); buildLane(); }
  };
}

/** Exercises without a rhythm line: the first bar's merged rhythm. */
function fallbackPattern(ex) {
  const b = ex.bars[0], on = new Map();
  [...b.rh, ...b.lh].forEach((e) => on.set(e.t, Math.max(on.get(e.t) || 0, e.d)));
  const out = []; let tt = 0;
  [...on.keys()].sort((a, c) => a - c).forEach((s) => { if (s > tt) out.push(s - tt === 2 ? 'r4' : 'r8'); const next = [...on.keys()].filter((x) => x > s).sort((a, c) => a - c)[0] ?? ex.per; const d = Math.min(on.get(s), next - s); out.push(d >= 4 ? '2' : d >= 2 ? '4' : '8'); tt = s + (d >= 4 ? 4 : d >= 2 ? 2 : 1); });
  while (tt < ex.per) { out.push(ex.per - tt >= 2 ? 'r4' : 'r8'); tt += ex.per - tt >= 2 ? 2 : 1; }
  return out.join(' ');
}
