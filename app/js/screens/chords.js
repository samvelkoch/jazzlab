// Chords mode: hub (path + "what does this symbol mean?"), symbol decoder, key-names trainer,
// lesson screen and "play the chord" practice. "In rhythm" reuses the exercise screen (see chord-ex.js).
import { h, ICON, themeButton, langSwitch, midiChip, navTabs } from '../ui.js';
import { t, L, getLang } from '../i18n.js';
import { store, markActive, idle, practiceSeconds, exProgress, isDone } from '../store.js';
import { createKeyboard } from '../music/keyboard.js';
import * as audio from '../music/audio.js';
import { onNote, midiState, sendNote, silence } from '../music/midi.js';
import { parseChord, checkChord, voicing, explain, chordName, prettySymbol, withRoot, nameInChord, ruName } from '../music/chords.js';
import { compVoicing } from '../music/chord-ex.js';

// ---------- strings ----------
const TX = {
  ru: {
    chords: 'Аккорды', chordsUpper: 'АККОРДЫ', path: 'Путь', pathHint: 'в любом порядке, без сроков', back: 'Назад к аккордам',
    whatTitle: 'Что значит этот символ?', whatText: 'Впиши аккорд из любого приложения или нот: покажу, из чего он состоит, какие клавиши нажать, и дам послушать.',
    symLabel: 'Символ аккорда', decode: 'Разобрать', forExample: 'Например:', drills: 'Тренировки',
    d_keys: 'Клавиши', d_keysSub: 'Найди ноту по названию. Белые, потом чёрные.',
    d_play: 'Сыграй аккорд', d_playSub: 'Вижу символ, играю. Пианино проверит.',
    d_rhythm: 'Аккорд в ритме', d_rhythmSub: 'Сначала ритм на одной клавише, потом аккорд.',
    atPiano: 'За инструментом', decoderTitle: 'Разбор символа', readAs: 'полное название',
    together: 'Вместе', oneByOne: 'По одной', tonesLow: 'Ноты снизу вверх:', optional: 'можно не играть',
    playIt: 'Сыграй его на пианино: проверю', playedOk: 'Верно, это он!', missingW: 'Не хватает', extraW: 'Лишняя', bassLow: 'Внизу должна быть',
    errEmpty: 'Впиши символ, например B7sus.', errRoot: 'Символ начинается с буквы ноты: C D E F G A B. Немецкая H = B.', errUnknown: 'Не понял часть «{p}». Проверь написание или нажми пример выше.',
    keysTitle: 'Клавиши', pressKey: 'Нажми клавишу', anyOctave: 'в любой октаве, на пианино или прямо здесь',
    waitKey: 'Жду клавишу', waitKeyText: 'Не спеши. Найди ориентир: группу чёрных клавиш.',
    itIs: 'Это {n}', moveR: 'Нужная правее на {k}', moveL: 'Нужная левее на {k}', keysW: ['клавишу', 'клавиши', 'клавиш'], countBlack: '(считая чёрные)',
    yes: 'Верно!', today: 'Верно сегодня', noTimer: 'без таймера', showNames: 'Показать подписи', hideNames: 'Скрыть подписи',
    lvlWhite: 'Белые', lvlSharp: '+ чёрные ♯', lvlFlat: '♭',
    lm1: 'Ориентир 1', lm1t: 'C (До): белая слева от двух чёрных. От неё отсчитываем всё.',
    lm2: 'Ориентир 2', lm2t: 'F (Фа): белая слева от трёх чёрных.',
    lm3: 'Буквы по кругу', lm3t: 'C D E F G A B, потом снова C. ♯ = соседняя справа, ♭ = соседняя слева.',
    tabLearn: 'Пойми', tabFind: 'Найди', tabRhythm: 'В ритме', tabAll: 'Все 12',
    rule: 'Правило', howSounds: 'Как звучит', listen: 'Послушать', compareWith: 'Сравнить с {s}',
    stepsHint: 'Числа на стрелках: сколько клавиш (полутонов) шагнуть вверх, считая чёрные.',
    rh: 'Правая рука', lh: 'левая', fingers: 'пальцы', nextFind: 'Дальше: найди на клавишах', nextRhythm: 'Дальше: в ритме', nextAll: 'Во всех 12 тональностях',
    playTitle: 'Сыграй аккорд', play: 'Сыграй', anyVoicing: 'Октава и порядок нот не важны: засчитаю любое расположение.',
    waitChord: 'Жду аккорд', waitChordText: 'Нажми все ноты вместе. Можно с педалью.', almost: 'Почти', got: 'Есть! Это {s}',
    notesRight: 'Верных нот: {a} из {b}', hintsOn: 'Подсказки: вкл', hintsOff: 'Подсказки: выкл', hints: 'Подсказки', show: 'Показать ответ', skip: 'Пропустить', next: 'Следующий',
    doneOf: 'верно {a} из {b}', setDone: 'Набор пройден!', setDoneText: 'Все аккорды найдены. Можно повторить или идти дальше.', again: 'Ещё раз',
    mix: 'Смесь', mixSub: 'аккорды из пройденных шагов', allKeysOf: 'все 12 тональностей', setOf: 'набор',
    legendBase: '1 и 5: основа', legendThird: 'терция (вид)', legendSeventh: 'септима / секста', legendTension: 'краска', legendBass: 'бас',
    progression: 'Цепочка', tapChord: 'Нажми на аккорд, чтобы увидеть его на клавишах',
    keysDone: 'пройдено', now: 'сейчас'
  },
  en: {
    chords: 'Chords', chordsUpper: 'CHORDS', path: 'Path', pathHint: 'any order, no deadlines', back: 'Back to chords',
    whatTitle: 'What does this symbol mean?', whatText: 'Type a chord from any app or sheet: I’ll show what it’s made of, which keys to press, and let you hear it.',
    symLabel: 'Chord symbol', decode: 'Explain', forExample: 'For example:', drills: 'Practice',
    d_keys: 'Key names', d_keysSub: 'Find a note by its name. White keys, then black.',
    d_play: 'Play the chord', d_playSub: 'See the symbol, play it. The piano checks.',
    d_rhythm: 'Chord in rhythm', d_rhythmSub: 'Rhythm on one key first, then the chord.',
    atPiano: 'At the piano', decoderTitle: 'Symbol explained', readAs: 'full name',
    together: 'Together', oneByOne: 'One by one', tonesLow: 'Notes, low to high:', optional: 'optional',
    playIt: 'Play it on the piano: I’ll check', playedOk: 'Right, that’s it!', missingW: 'Missing', extraW: 'Extra', bassLow: 'The lowest note should be',
    errEmpty: 'Type a symbol, e.g. B7sus.', errRoot: 'A symbol starts with a note letter: C D E F G A B. German H = B.', errUnknown: 'I don’t understand “{p}”. Check the spelling or tap an example above.',
    keysTitle: 'Key names', pressKey: 'Press the key', anyOctave: 'any octave, on the piano or right here',
    waitKey: 'Waiting', waitKeyText: 'No rush. Find a landmark: a group of black keys.',
    itIs: 'That’s {n}', moveR: 'Go {k} to the right', moveL: 'Go {k} to the left', keysW: ['key', 'keys', 'keys'], countBlack: '(counting black keys)',
    yes: 'Right!', today: 'Right today', noTimer: 'no timer', showNames: 'Show names', hideNames: 'Hide names',
    lvlWhite: 'White', lvlSharp: '+ black ♯', lvlFlat: '♭',
    lm1: 'Landmark 1', lm1t: 'C: the white key left of the two black keys. Count everything from here.',
    lm2: 'Landmark 2', lm2t: 'F: the white key left of the three black keys.',
    lm3: 'Letters in a circle', lm3t: 'C D E F G A B, then C again. ♯ = the key just right, ♭ = just left.',
    tabLearn: 'Understand', tabFind: 'Find', tabRhythm: 'In rhythm', tabAll: 'All 12',
    rule: 'Rule', howSounds: 'How it sounds', listen: 'Listen', compareWith: 'Compare with {s}',
    stepsHint: 'Numbers on the arrows: how many keys (semitones) to step up, counting black keys.',
    rh: 'Right hand', lh: 'left', fingers: 'fingers', nextFind: 'Next: find it on the keys', nextRhythm: 'Next: in rhythm', nextAll: 'In all 12 keys',
    playTitle: 'Play the chord', play: 'Play', anyVoicing: 'Octave and order don’t matter: any voicing counts.',
    waitChord: 'Waiting for a chord', waitChordText: 'Press all the notes together. Pedal is fine.', almost: 'Almost', got: 'Yes! That’s {s}',
    notesRight: 'Right notes: {a} of {b}', hintsOn: 'Hints: on', hintsOff: 'Hints: off', hints: 'Hints', show: 'Show the answer', skip: 'Skip', next: 'Next',
    doneOf: '{a} of {b} right', setDone: 'Set done!', setDoneText: 'You found every chord. Go again or move on.', again: 'Again',
    mix: 'Mix', mixSub: 'chords from the steps you did', allKeysOf: 'all 12 keys', setOf: 'set',
    legendBase: '1 and 5: base', legendThird: 'third (quality)', legendSeventh: 'seventh / sixth', legendTension: 'colour', legendBass: 'bass',
    progression: 'Progression', tapChord: 'Tap a chord to see it on the keys',
    keysDone: 'done', now: 'now'
  }
};
const tr = (k, vars) => {
  let s = (TX[getLang()] || TX.ru)[k]; if (s === undefined) s = TX.ru[k] ?? k;
  if (vars && typeof s === 'string') for (const [a, b] of Object.entries(vars)) s = s.replace('{' + a + '}', b);
  return s;
};
const plural = (n) => { const w = tr('keysW'); if (getLang() !== 'ru') return n === 1 ? w[0] : w[1]; const d = n % 10, dd = n % 100; return d === 1 && dd !== 11 ? w[0] : d >= 2 && d <= 4 && (dd < 10 || dd >= 20) ? w[1] : w[2]; };
const PCN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteLabel = (name) => (getLang() === 'ru' ? `${name} · ${ruName(name)}` : name);
const DEG_KIND_LABEL = () => [['base', tr('legendBase')], ['third', tr('legendThird')], ['seventh', tr('legendSeventh')], ['tension', tr('legendTension')]];

// ---------- progress (this device) ----------
const prog = () => store.get('chords', { lessons: {}, keys: 0 });
function setLesson(id, patch) { const p = prog(); p.lessons = p.lessons || {}; p.lessons[id] = { ...(p.lessons[id] || {}), ...patch }; store.set('chords', p); }
export function lessonStatus(l) {
  const p = (prog().lessons || {})[l.id] || {};
  if (l.kind === 'keys') return { done: !!p.found, found: !!p.found };
  const rhythm = isDone(exProgress('ch-' + l.id));
  return { found: !!p.found, rhythm, all12: !!p.all12, done: !!p.found && rhythm };
}

// ---------- sound ----------
const settings = () => ({ pianoSnd: true, ...store.get('settings', {}) });
function play1(m, time, dur, v) {
  if (settings().pianoSnd && midiState().canPlay) {
    const onMs = performance.now() + (time - audio.now()) * 1000;
    if (sendNote(m, 25 + 130 * v, onMs, onMs + dur * 1000)) return;
  }
  audio.pianoNote(m, time, dur, v);
}
function playNotes(midis, { arp = false, dur = 1.6, vel = 0.5, at = 0 } = {}) {
  if (!midis.length) return;
  audio.ensureAudio();
  audio.preloadPiano(Math.min(...midis), Math.max(...midis));
  const t0 = audio.now() + 0.06 + at;
  midis.forEach((m, i) => play1(m, t0 + (arp ? i * 0.34 : i * 0.012), arp ? Math.max(0.9, dur - i * 0.2) : dur, vel));
  markActive();
}
const hushAll = () => { audio.hush(); silence(); idle(); };

// ---------- shared pieces ----------
function header({ back = '#/chords', kicker, title, mid = null, rerender }) {
  return h('header.top', null,
    h('a.iconbtn', { href: back, 'aria-label': tr('back'), title: tr('back'), html: ICON.back }),
    h('div.titles', null, h('span.kicker', null, kicker), h('span.title', null, title)),
    h('div.grow'), mid, mid ? h('div.grow') : null,
    midiChip(), rerender ? langSwitch(rerender) : null, themeButton());
}
const cleanupChips = (root) => root.querySelectorAll('.chip').forEach((c) => c._cleanup && c._cleanup());
const symSpan = (ch, parts) => h('span.csym', { 'aria-label': ch.symbol },
  ...(parts || ch.parts).filter((p) => !p.implied && p.text).map((p) => h('span.k-' + p.kind, null, p.text)));
function legend(kinds) {
  return h('div.legend.clegend', null, ...kinds.map(([k, label]) => h('span', null, h('i.dot.k-' + k), label)));
}
/** Keyboard + its marks for a voicing [{midi, tone}] (tone null = bass). badge: (v, i) => label */
function markVoicing(kb, v, badge) {
  const map = {};
  v.forEach((x, i) => { map[x.midi] = { cls: x.tone ? x.tone.kind : 'bass', label: badge ? badge(x, i) : (x.tone ? x.tone.deg : '') }; });
  kb.mark(map);
}

// =====================================================================
// Hub
// =====================================================================
export function renderChordsHub(root, { data, rerender }) {
  const lessons = data.lessons;
  const st = lessons.map((l) => ({ l, s: lessonStatus(l) }));
  const nowL = (st.find((x) => !x.s.done) || st[0]).l;
  const href = (l) => (l.kind === 'keys' ? '#/chords/keys' : '#/chords/l/' + l.id);

  const head = h('header.top', null,
    h('div.brand', { role: 'img', 'aria-label': 'Jazzlab' }, h('span.brandname', { 'aria-hidden': 'true' }, 'jazz', h('span.key'), 'lab')),
    navTabs('chords'), h('div.grow'), midiChip(), langSwitch(rerender), themeButton());

  const path = h('section.panel.cpath', null,
    h('div.row', null, h('h2', null, tr('path')), h('div.grow'), h('span.meta', null, tr('pathHint'))),
    h('ol', null, ...st.map(({ l, s }) => h('li', null, h('a.cprow' + (s.done ? '.done' : l === nowL ? '.now' : ''), { href: href(l) },
      h('span.pnum', { 'aria-hidden': 'true' }, s.done ? '✓' : String(l.n)),
      h('span.ptext', null, h('b', null, L(l.title)), h('span', null, L(l.sub))),
      h('span.psym', null, l.kind === 'keys' ? l.sym : l.sym.split(' ').map(prettySymbol).join(' ')))))));

  const inp = h('input.symin', { id: 'csym', type: 'text', value: 'B7sus', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go' });
  const form = h('form.symform', { onsubmit: (e) => { e.preventDefault(); location.hash = '#/chords/what/' + encodeURIComponent(inp.value.trim() || 'B7sus'); } },
    inp, h('button.btn.xl.decodebtn', { type: 'submit' }, tr('decode')));
  const hero = h('section.hero.chero', null,
    h('h2', null, tr('whatTitle')), h('p', null, tr('whatText')),
    h('label', { for: 'csym' }, tr('symLabel')), form,
    h('div.chips', null, h('span', null, tr('forExample')),
      ...data.examples.map((s) => h('a.schip', { href: '#/chords/what/' + encodeURIComponent(s) }, prettySymbol(s)))));

  const tile = (icon, title, sub, href) => h('a.ctile', { href }, h('span.cticon', null, icon), h('b', null, title), h('span', null, sub));
  const rl = nowL.kind === 'keys' ? lessons[1] : nowL;
  const drills = h('section.cdrills', null, h('h2', null, tr('drills')),
    h('div.ctiles', null,
      tile('C D E', tr('d_keys'), tr('d_keysSub'), '#/chords/keys'),
      tile(prettySymbol(rl.practice[1] || rl.sym), tr('d_play'), tr('d_playSub'), '#/chords/play/mix'),
      tile('♩ ♪', tr('d_rhythm'), tr('d_rhythmSub'), '#/chords/rhythm/' + rl.id)));
  const m = Math.round(practiceSeconds() / 60);
  const foot = h('p.meta', null, `${tr('atPiano')}: ${m < 60 ? m + ' ' + t('min') : Math.floor(m / 60) + t('h') + ' ' + (m % 60) + t('min')}`);

  root.replaceChildren(head, h('main.chub', null, path, h('div.cside', null, hero, drills, foot)));
  return () => cleanupChips(root);
}

// =====================================================================
// Decoder: what does a symbol mean
// =====================================================================
export function renderDecoder(root, { sym, data }) {
  const inp = h('input.symin', { type: 'text', value: sym, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': tr('symLabel'), enterkeyhint: 'go' });
  const form = h('form.symform.small', { onsubmit: (e) => { e.preventDefault(); show(inp.value); inp.blur(); } }, inp, h('button.btn.accent', { type: 'submit' }, tr('decode')));
  const chips = h('div.chips.dchips', null, ...data.examples.map((s) => h('button.schip', { type: 'button', onclick: () => { inp.value = s; show(s); } }, prettySymbol(s))));
  const out = h('div.dout');
  const kbEl = h('div');
  const kbPanel = h('section.panel.kbpanel.dkb', null, kbEl);
  const screen = h('div.cscreen', null,
    header({ kicker: tr('chordsUpper'), title: tr('decoderTitle') }),
    h('main.decoder', null, h('div.drow', null, form, chips), out, kbPanel));
  root.replaceChildren(screen);

  let ch = null, v = [], kb = null, timer = 0;
  const held = new Set();
  const status = h('span.dstatus', { 'aria-live': 'polite' });
  function paintStatus() {
    if (!ch) return;
    if (!midiState().connected) { status.textContent = ''; return; }
    const notes = [...held];
    if (!notes.length) { status.className = 'dstatus'; status.textContent = tr('playIt'); return; }
    const r = checkChord(ch, notes);
    status.className = 'dstatus ' + (r.ok ? 'ok' : 'meh');
    status.textContent = r.ok ? '✓ ' + tr('playedOk')
      : [r.missing.length ? `${tr('missingW')}: ${r.missing.map((p) => nameInChord(ch, p)).join(', ')}` : '',
        r.extra.length ? `${tr('extraW')}: ${[...new Set(r.extra.map((m) => PCN[m % 12]))].join(', ')}` : '',
        !r.bassOk ? `${tr('bassLow')} ${ch.bass.name}` : ''].filter(Boolean).join(' · ');
  }
  function show(s) {
    s = String(s || '').trim();
    try { history.replaceState(null, '', '#/chords/what/' + encodeURIComponent(s)); } catch (e) { /* ignore */ }
    try { ch = parseChord(s); } catch (err) {
      ch = null;
      const msg = err.code === 'empty' ? tr('errEmpty') : err.code === 'root' ? tr('errRoot') : tr('errUnknown', { p: err.part || s });
      out.replaceChildren(h('section.panel.derr', null, h('b', null, prettySymbol(s) || '…'), h('p', null, msg)));
      kbPanel.hidden = true;
      return;
    }
    document.title = `${ch.symbol} · Jazzlab`;
    v = voicing(ch);
    const lang = getLang();
    const cards = explain(ch, lang).map((p) => h('div.dcard.k-' + p.kind, null,
      h('div.row', null, h('span.dtag', null, p.implied ? '—' : p.text), h('b', null, p.what)), h('p', null, p.says)));
    const tones = h('div.dtones', null, h('span.meta', null, tr('tonesLow')),
      ...v.map((x) => {
        const name = x.tone ? x.tone.name : ch.bass.name;
        const opt = x.tone && !x.tone.req;
        return h('span.tpill.k-' + (x.tone ? x.tone.kind : 'bass') + (opt ? '.opt' : ''), { title: opt ? tr('optional') : null },
          h('b', null, name), lang === 'ru' ? h('span', null, ruName(name)) : null, h('small', null, x.tone ? x.tone.deg : 'bass'), opt ? h('small', null, '· ' + tr('optional')) : null);
      }));
    const mids = v.map((x) => x.midi);
    out.replaceChildren(
      h('div.dhead', null, symSpan(ch),
        h('div.dname', null, h('span.meta', null, tr('readAs')), h('b', null, chordName(ch, lang))),
        h('div.grow'),
        h('button.btn.accent', { type: 'button', html: ICON.play + `<span>${tr('together')}</span>`, onclick: () => playNotes(mids) }),
        h('button.btn', { type: 'button', onclick: () => playNotes(mids, { arp: true }) }, tr('oneByOne'))),
      h('div.dcards', { style: `--n:${Math.min(4, cards.length)}` }, ...cards),
      h('div.drow2', null, tones, h('div.grow'), status));
    kbPanel.hidden = false;
    const lo = Math.min(48, ...mids), hi = Math.max(83, ...mids);
    kb = createKeyboard(kbEl, [lo, hi], { names: 'off', onPress: (m) => playNotes([m], { dur: 0.8 }) });
    markVoicing(kb, v);
    paintStatus();
  }
  inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => show(inp.value), 350); });
  const off = onNote((e) => {
    if (e.type === 'on') held.add(e.note); else held.delete(e.note);
    if (kb) kb.down(e.note, e.type === 'on');
    markActive(); paintStatus();
  });
  show(sym);
  return () => { clearTimeout(timer); off(); hushAll(); cleanupChips(screen); };
}

// =====================================================================
// Key names trainer
// =====================================================================
const POOLS = {
  white: [0, 2, 4, 5, 7, 9, 11].map((pc) => [pc, PCN[pc]]),
  sharp: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((pc) => [pc, ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pc]]),
  flat: [1, 3, 6, 8, 10].map((pc) => [pc, ['', 'D♭', '', 'E♭', '', '', 'G♭', '', 'A♭', '', 'B♭'][pc]])
};
export function renderKeys(root) {
  const st = { lvl: store.get('chordKeysLvl', 'white'), target: null, score: 0, names: false, last: null };
  const big = h('span.ktarget'), ru = h('span.kru');
  const fb = h('div.kfb', { 'aria-live': 'polite' });
  const lvls = h('div.seg', { role: 'group' });
  [['white', tr('lvlWhite')], ['sharp', tr('lvlSharp')], ['flat', tr('lvlFlat')]].forEach(([v, label]) => lvls.append(h('button', { type: 'button', 'data-v': v, onclick: () => { st.lvl = v; store.set('chordKeysLvl', v); paintLvls(); next(); } }, label)));
  const paintLvls = () => lvls.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.lvl)));
  const scoreEl = h('b');
  const namesBtn = h('button.btn', { type: 'button', onclick: () => { st.names = !st.names; kb.setNames(st.names ? 'en' : 'off'); namesBtn.textContent = st.names ? tr('hideNames') : tr('showNames'); } }, tr('showNames'));
  const lm = (a, b) => h('div.panel.lm', null, h('b', null, a), h('p', null, b));
  // phone: the three landmark cards fold into one toggle, so the prompt and the keyboard fit one screen
  const hintsBtn = h('button.btn.khints', { type: 'button', onclick: () => setHints(main.dataset.hints !== '1') }, tr('hints'));
  const kbEl = h('div');
  const main = h('main.keys', null,
    h('div.krow', null,
      h('div.kask', null, h('span.meta', null, tr('pressKey')), h('div.row', null, big, ru), h('span.meta', null, tr('anyOctave'))),
      h('div.grow'), fb),
    h('div.lms', null, lm(tr('lm1'), tr('lm1t')), lm(tr('lm2'), tr('lm2t')), lm(tr('lm3'), tr('lm3t'))),
    h('div.row.kfoot', null, h('span.meta', null, tr('today') + ': ', scoreEl, ' · ' + tr('noTimer')), h('div.grow'), hintsBtn, namesBtn),
    h('section.panel.kbpanel.bigkb', null, kbEl));
  const setHints = (on) => { main.dataset.hints = on ? '1' : '0'; hintsBtn.setAttribute('aria-pressed', String(on)); store.set('chordKeysHints', on); };
  setHints(!!store.get('chordKeysHints', false));
  const screen = h('div.cscreen', null,
    header({ kicker: tr('chordsUpper'), title: tr('keysTitle'), mid: lvls }),
    main);
  root.replaceChildren(screen);
  const kb = createKeyboard(kbEl, [48, 69], { names: 'off', center: 60, onPress: (m) => press(m) });

  function setFb(kind, title, text) { fb.className = 'kfb ' + kind; fb.replaceChildren(h('b', null, title), text ? h('span', null, text) : ''); }
  function next() {
    const pool = POOLS[st.lvl];
    let n; do { n = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && st.target && n[0] === st.target[0]);
    st.target = n; big.textContent = n[1]; ru.textContent = getLang() === 'ru' ? ruName(n[1]) : '';
    setFb('', tr('waitKey'), tr('waitKeyText'));
  }
  function press(m) {
    playNotes([m], { dur: 0.7 });
    const pc = m % 12;
    if (pc === st.target[0]) {
      kb.flash(m, 'ok'); st.score++; scoreEl.textContent = String(st.score);
      const p = prog(); p.keys = (p.keys || 0) + 1; store.set('chords', p);
      if (p.keys >= 20) setLesson('keys', { found: true });
      setFb('ok', tr('yes'), ''); setTimeout(next, 600);
    } else {
      kb.flash(m, 'bad');
      const d = (st.target[0] - pc + 12) % 12, right = d <= 6, k = right ? d : 12 - d;
      setFb('meh', tr('itIs', { n: noteLabel(PCN[pc]) }), (right ? tr('moveR', { k: k + ' ' + plural(k) }) : tr('moveL', { k: k + ' ' + plural(k) })) + ' ' + tr('countBlack'));
    }
  }
  const off = onNote((e) => { kb.down(e.note, e.type === 'on'); if (e.type === 'on') press(e.note); });
  scoreEl.textContent = '0'; paintLvls(); next();
  return () => { off(); hushAll(); cleanupChips(screen); };
}

// =====================================================================
// Lesson: understand the chord
// =====================================================================
function lessonTabs(l, active) {
  const s = lessonStatus(l);
  const a = (id, href, label, done) => h('a' + (done ? '.done' : ''), { href, 'aria-current': id === active ? 'page' : null }, done ? '✓ ' + label : label);
  return h('nav.seg.stages.ltabs', { 'aria-label': 'lesson' },
    a('learn', '#/chords/l/' + l.id, tr('tabLearn'), false),
    a('find', '#/chords/play/' + l.id, tr('tabFind'), s.found),
    a('rhythm', '#/chords/rhythm/' + l.id, tr('tabRhythm'), s.rhythm),
    l.id === 'slash' ? null : a('all', '#/chords/play/' + l.id + '-12', tr('tabAll'), s.all12));
}
export function renderLesson(root, { lesson: l }) {
  const kbEl = h('div');
  const syms = l.sym.split(' ');
  let cur = parseChord(syms[0]);
  const kbHint = h('span.meta');
  const chordsRow = l.kind === 'progression'
    ? h('div.prog', null, ...syms.map((s, i) => h('button.progchip', { type: 'button', 'aria-pressed': String(i === 0), onclick: (e) => {
      cur = parseChord(s); e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); paintKb(); playCur();
    } }, prettySymbol(s))))
    : null;
  const stair = (ch) => {
    const kids = [];
    ch.tones.forEach((x, i) => {
      if (i) kids.push(h('span.sarrow', null, '+' + (x.semi - ch.tones[i - 1].semi) + ' →'));
      kids.push(h('span.snode.k-' + x.kind + (x.req ? '' : '.opt'), null, h('b', null, x.name), h('small', null, x.deg)));
    });
    return h('div.stair', null, ...kids);
  };
  const ruleBox = h('section.panel.lrule', null,
    h('span.kicker', null, tr('rule').toUpperCase()),
    l.kind === 'progression' ? chordsRow : stair(cur),
    h('p', null, L(l.rule)),
    l.kind === 'progression' ? h('span.meta', null, tr('tapChord')) : h('span.meta', null, tr('stepsHint')));
  const all = () => syms.map((s) => compVoicing(parseChord(s)));
  const playCur = () => { const v = compVoicing(cur); playNotes([...v.lh.map((x) => x.midi), ...v.rh.map((x) => x.midi)]); };
  const listen = () => {
    if (l.kind !== 'progression') { playCur(); return; }
    all().forEach((v, i) => playNotes([...v.lh.map((x) => x.midi), ...v.rh.map((x) => x.midi)], { at: i * 1.5, dur: 1.4 }));
  };
  const soundBox = h('section.hero.lsound', null,
    h('b', null, tr('howSounds')), h('p', null, L(l.sound)),
    h('div.row', null,
      h('button.btn.xl.decodebtn', { type: 'button', html: ICON.play + `<span>${tr('listen')}</span>`, onclick: listen }),
      l.compare ? h('button.btn.ghostbtn', { type: 'button', onclick: () => { const v = compVoicing(parseChord(l.compare)); playNotes([...v.lh.map((x) => x.midi), ...v.rh.map((x) => x.midi)]); } }, tr('compareWith', { s: prettySymbol(l.compare) })) : null));
  const cta = h('div.row.lcta', null,
    legend(DEG_KIND_LABEL().concat(l.id === 'slash' ? [['bass', tr('legendBass')]] : [])), h('div.grow'),
    h('a.btn.accent.xl', { href: '#/chords/play/' + l.id, html: `<span>${tr('nextFind')}</span>` + ICON.next }));
  const screen = h('div.cscreen', null,
    header({ kicker: `${tr('chordsUpper')} · ${t('stepUpper')} ${l.n}`, title: `${L(l.title)} · ${syms.map(prettySymbol).join(' ')}`, mid: lessonTabs(l, 'learn') }),
    h('main.lesson', null, h('div.lgrid', null, ruleBox, soundBox), h('section.panel.kbpanel', null, h('div.row.kbhead', null, kbHint), kbEl), cta));
  root.replaceChildren(screen);
  let kb = null;
  function paintKb() {
    const v = compVoicing(cur);
    const notes = [...v.lh.map((x) => ({ midi: x.midi, tone: null })), ...v.rh.map((x) => ({ midi: x.midi, tone: x.tone }))];
    if (!kb) kb = createKeyboard(kbEl, [41, 76], { names: 'en', onPress: (m) => playNotes([m], { dur: 0.8 }) });
    const map = {};
    v.lh.forEach((x) => { map[x.midi] = { cls: cur.bass ? 'bass' : 'base', label: '5' }; });
    v.rh.forEach((x, i) => { map[x.midi] = { cls: x.tone.kind, label: String(v.fingers[i] || '') }; });
    kb.mark(map);
    kbHint.textContent = `${tr('rh')}: ${v.rh.map((x) => x.tone.name).join(' ')} · ${tr('fingers')} ${v.fingers.join(' ')}  ·  ${tr('lh')}: ${(cur.bass || cur.root).name}`;
    void notes;
  }
  paintKb();
  const off = onNote((e) => { if (kb) kb.down(e.note, e.type === 'on'); });
  return () => { off(); hushAll(); cleanupChips(screen); };
}

// =====================================================================
// Practice: play the chord (MIDI or screen)
// =====================================================================
const CIRCLE = ['C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'F♯', 'B', 'E', 'A', 'D', 'G'];
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
function practiceSet(setId, data) {
  const lessons = data.lessons.filter((l) => l.kind !== 'keys');
  if (setId === 'mix') {
    const found = lessons.filter((l) => lessonStatus(l).found);
    const pool = (found.length ? found : lessons.slice(0, 3)).flatMap((l) => l.practice);
    return { title: tr('mix'), sub: tr('mixSub'), list: shuffle(pool).slice(0, 10), back: '#/chords' };
  }
  const all12 = setId.endsWith('-12');
  const l = lessons.find((x) => x.id === setId.replace(/-12$/, ''));
  if (!l) return null;
  if (!all12) return { lesson: l, title: L(l.title), sub: tr('setOf') + ': ' + l.practice.map(prettySymbol).join(' '), list: shuffle(l.practice).concat(shuffle(l.practice)).slice(0, 8), back: '#/chords/l/' + l.id };
  let list;
  if (l.kind === 'progression') {
    const keys = shuffle(CIRCLE).slice(0, 4);
    const up = (r, n) => CIRCLE[(CIRCLE.indexOf(r) + n) % 12]; // in fourths: +1 = a fourth up
    list = keys.flatMap((r) => [up(r, 10) + 'm7', up(r, 11) + '7', r + 'maj7']); // ii = two fifths up, V = one fifth up
  } else list = shuffle(CIRCLE).map((r) => withRoot(l.sym, r));
  return { lesson: l, all12: true, title: L(l.title), sub: tr('allKeysOf'), list, back: '#/chords/l/' + l.id };
}

export function renderPractice(root, { setId, data }) {
  const set = practiceSet(setId, data);
  if (!set) return null;
  const st = { i: 0, ok: 0, hints: store.get('chordHints', true), reveal: false, won: false, stale: new Set() };
  const held = new Set(), taps = new Set();
  let ch = null, nextT = 0;

  const symEl = h('span.psymbig'), nameEl = h('span.meta');
  const pills = h('div.ppills');
  const fb = h('div.kfb', { 'aria-live': 'polite' });
  const countEl = h('span.meta');
  const hintsBtn = h('button.btn', { type: 'button', onclick: () => { st.hints = !st.hints; store.set('chordHints', st.hints); paint(); } });
  const tools = h('div.row.ptools', null, hintsBtn,
    h('button.btn', { type: 'button', html: ICON.speaker + `<span>${tr('listen')}</span>`, onclick: () => playNotes(voicing(ch).map((x) => x.midi)) }),
    h('button.btn', { type: 'button', onclick: () => { st.reveal = true; paint(); } }, tr('show')),
    h('div.grow'), countEl,
    h('button.btn', { type: 'button', onclick: () => go(st.i + 1) }, tr('skip')));
  const kbEl = h('div');
  const body = h('div.pbody', null,
    h('div.pq', null, h('div.pask', null, h('span.meta', null, tr('play')), symEl, nameEl), h('div.pmid', null, pills, h('span.meta', null, tr('anyVoicing'))), fb),
    tools);
  const doneBox = h('section.panel.pdone', null);
  const tabs = set.lesson ? lessonTabs(set.lesson, set.all12 ? 'all' : 'find') : null;
  const screen = h('div.cscreen', null,
    header({ back: set.back, kicker: `${tr('chordsUpper')}${set.lesson ? ` · ${t('stepUpper')} ${set.lesson.n}` : ''} · ${tr('playTitle').toUpperCase()}`, title: `${set.title} · ${set.sub}`, mid: tabs }),
    h('main.practice', null, body, doneBox, h('section.panel.kbpanel.bigkb', null, kbEl)));
  root.replaceChildren(screen);
  const kb = createKeyboard(kbEl, [48, 72], { names: 'off', onPress: (m) => {
    if (st.won) return;
    if (taps.has(m)) taps.delete(m); else { taps.add(m); playNotes([m], { dur: 0.9 }); }
    evaluate();
  } });

  function notes() { return [...held].filter((m) => !st.stale.has(m)).concat([...taps]); }
  function go(i) {
    clearTimeout(nextT);
    if (i >= set.list.length) { finish(); return; }
    st.i = i; st.reveal = false; st.won = false;
    st.stale = new Set(held); taps.clear();
    ch = parseChord(set.list[i]);
    symEl.replaceChildren(symSpan(ch));
    nameEl.textContent = chordName(ch, getLang());
    paint();
  }
  function finish() {
    if (set.lesson) setLesson(set.lesson.id, set.all12 ? { all12: true } : { found: true });
    body.hidden = true; doneBox.hidden = false;
    const nextHref = set.lesson ? (set.all12 ? '#/chords' : '#/chords/rhythm/' + set.lesson.id) : '#/chords';
    doneBox.replaceChildren(h('b', null, '✓ ' + tr('setDone')), h('p', null, tr('setDoneText')),
      h('div.row', null, h('button.btn', { type: 'button', onclick: () => { st.ok = 0; set.list = shuffle(set.list); body.hidden = false; doneBox.hidden = true; go(0); } }, tr('again')),
        h('a.btn.accent.xl', { href: nextHref, html: `<span>${set.lesson && !set.all12 ? tr('nextRhythm') : tr('back')}</span>` + ICON.next })));
    kb.mark({});
  }
  function evaluate() {
    if (!ch || st.won) { paintKb(); return; }
    const r = checkChord(ch, notes());
    if (r.ok) {
      st.won = true; st.ok++;
      markActive();
      nextT = setTimeout(() => go(st.i + 1), 1100);
    }
    paint(r);
  }
  function paintKb(r) {
    const map = {};
    const ns = notes();
    const { all } = (() => { const a = new Set(ch.tones.map((x) => x.pc)); if (ch.bass) a.add(ch.bass.pc); return { all: a }; })();
    ns.forEach((m) => { map[m] = { cls: all.has(m % 12) ? 'hit' : 'wrong', label: '' }; });
    if (r && (st.reveal || (st.hints && ns.length)) && !st.won) {
      // show each missing note in the octave closest to where the hand is
      const c = ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 62;
      r.missing.forEach((pc) => {
        let best = null;
        for (let m = 36; m <= 96; m++) if (m % 12 === pc && kb.has(m) && !map[m] && (best === null || Math.abs(m - c) < Math.abs(best - c))) best = m;
        if (best === null) return;
        const tone = ch.tones.find((x) => x.pc === pc);
        map[best] = st.reveal ? { cls: tone ? tone.kind : 'bass', label: tone ? tone.deg : '' } : { cls: 'miss', label: '' };
      });
    }
    if (st.reveal && !ns.length) markVoicing(kb, voicing(ch, { lo: 48 }).filter((x) => kb.has(x.midi)));
    else kb.mark(map);
  }
  function paint(r = ch ? checkChord(ch, notes()) : null) {
    if (!ch) return;
    hintsBtn.textContent = st.hints ? tr('hintsOn') : tr('hintsOff');
    countEl.textContent = tr('doneOf', { a: st.ok, b: set.list.length });
    const { req } = (() => ({ req: ch.tones.filter((x) => x.req) }))();
    const held = new Set(notes().map((m) => m % 12));
    const show = st.hints || st.reveal;
    pills.replaceChildren(...req.map((x) => h('span.tpill.k-' + x.kind + (held.has(x.pc) ? '.got' : ''), null, h('b', null, show ? x.name : '?'), h('small', null, x.deg), held.has(x.pc) ? h('small', null, '✓') : null)),
      ...(ch.bass ? [h('span.tpill.k-bass' + (r && r.bassOk && notes().length ? '.got' : ''), null, h('b', null, show ? ch.bass.name : '?'), h('small', null, 'bass'))] : []));
    const ns = notes();
    if (st.won) setFb('ok', tr('got', { s: ch.symbol }), '');
    else if (!ns.length) setFb('', tr('waitChord'), tr('waitChordText'));
    else if (show) setFb('meh', tr('almost'), [r.missing.length ? `${tr('missingW')}: ${r.missing.map((p) => nameInChord(ch, p)).join(', ')}.` : '',
      r.extra.length ? `${tr('extraW')}: ${[...new Set(r.extra.map((m) => PCN[m % 12]))].join(', ')}.` : '', !r.bassOk ? `${tr('bassLow')} ${ch.bass.name}.` : ''].filter(Boolean).join(' '));
    else setFb('meh', tr('almost'), tr('notesRight', { a: r.count, b: r.need }) + (r.extra.length ? ` · ${tr('extraW')}: ${r.extra.length}` : ''));
    paintKb(r);
  }
  function setFb(kind, title, text) { fb.className = 'kfb ' + kind; fb.replaceChildren(h('b', null, title), text ? h('span', null, text) : ''); }
  const off = onNote((e) => {
    if (e.type === 'on') held.add(e.note); else { held.delete(e.note); st.stale.delete(e.note); }
    kb.down(e.note, e.type === 'on');
    markActive(); evaluate();
  });
  doneBox.hidden = true;
  go(0);
  return () => { clearTimeout(nextT); off(); hushAll(); cleanupChips(screen); };
}
