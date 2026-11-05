// Chord symbols: parse "B7sus", "Cmaj7", "C7(b9)", "Dm7(11)", "F/A" … into tones, spelling and a
// part-by-part explanation for beginners. Pure module (no DOM): used by the app and by tests/chords.test.mjs.

const LETTERS = 'CDEFGAB';
const NAT = [0, 2, 4, 5, 7, 9, 11];
const RU_LETTER = { C: 'До', D: 'Ре', E: 'Ми', F: 'Фа', G: 'Соль', A: 'Ля', B: 'Си' };

// semitones above the root → degree label and letter offset (for spelling)
const DEG = {
  0: ['1', 0], 2: ['2', 1], 3: ['♭3', 2], 4: ['3', 2], 5: ['4', 3], 6: ['♭5', 4], 7: ['5', 4], 8: ['♯5', 4],
  9: ['6', 5], 10: ['♭7', 6], 11: ['7', 6], 13: ['♭9', 1], 14: ['9', 1], 15: ['♯9', 1], 17: ['11', 3],
  18: ['♯11', 3], 20: ['♭13', 5], 21: ['13', 5]
};
const ALT = { 'b9': 13, '9': 14, '#9': 15, '11': 17, '#11': 18, 'b13': 20, '13': 21, 'b5': 6, '#5': 8 };

export class ChordError extends Error {
  constructor(code, part) { super(code + (part ? ': ' + part : '')); this.code = code; this.part = part || ''; }
}

const accStr = (a) => ({ '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' })[a];
const pcOf = (letter, alt) => (NAT[LETTERS.indexOf(letter)] + alt + 12) % 12;

/** Spell the note `semi` semitones above the root, using the right letter for the degree. */
function spell(rootLetter, rootPc, semi, off) {
  const li = (LETTERS.indexOf(rootLetter) + off) % 7;
  const target = (rootPc + semi) % 12;
  let a = (target - NAT[li] + 12) % 12; if (a > 6) a -= 12;
  return { letter: LETTERS[li], alt: a, name: LETTERS[li] + accStr(a), pc: target };
}

/** Pretty-print a symbol the way it is usually printed: b → ♭, # → ♯. */
export function prettySymbol(s) {
  return String(s).trim().replace(/^([A-Ga-g])#/, '$1♯').replace(/^([A-Ga-g])b/, '$1♭')
    .replace(/\/([A-G])#$/, '/$1♯').replace(/\/([A-G])b$/, '/$1♭')
    .replace(/(^|[^A-Za-z])b(5|9|13)/g, '$1♭$2').replace(/#(5|9|11|13)/g, '♯$1');
}

function normalizeInput(s) {
  return String(s).trim()
    .replace(/♯/g, '#').replace(/♭/g, 'b').replace(/[−–]/g, '-').replace(/\s+/g, '')
    .replace(/Δ(?!\d)/g, 'maj7').replace(/Δ/g, 'maj').replace(/[°º]/g, 'dim').replace(/ø/g, 'm7b5');
}

/**
 * Parse a chord symbol.
 * @returns {{ symbol, root:{letter,alt,name,pc}, bass:{…}|null, quality, tones:[{semi,deg,name,pc,req,kind}], parts:[{text,kind,key,arg}] }}
 * tone.kind: 'base' (1, 5), 'third' (3rd / sus note), 'seventh' (7th or 6th), 'tension' (9 11 13 + alterations), 'bass'.
 * tone.req: false = may be left out (the 5th, the 9 under an 11 or 13).
 * Throws ChordError('empty' | 'root' | 'unknown', part).
 */
export function parseChord(input) {
  const raw = normalizeInput(input);
  if (!raw) throw new ChordError('empty');
  const m = /^([A-Ga-g])(#|b)?/.exec(raw);
  if (!m) throw new ChordError('root', raw[0]);
  const letter = m[1].toUpperCase(), alt = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const root = { letter, alt, name: letter + accStr(alt), pc: pcOf(letter, alt) };
  const parts = [{ text: root.name, kind: 'root', key: 'root' }];
  let r = raw.slice(m[0].length);

  // slash bass (but 6/9 is a number)
  let bass = null;
  const sl = /\/([A-Ga-g])(#|b)?$/.exec(r);
  if (sl) {
    const bl = sl[1].toUpperCase(), ba = sl[2] === '#' ? 1 : sl[2] === 'b' ? -1 : 0;
    bass = { letter: bl, alt: ba, name: bl + accStr(ba), pc: pcOf(bl, ba) };
    r = r.slice(0, sl.index);
  }

  const q = { minor: false, dim: false, hdim: false, aug: false, maj7: false, num: 0, sus: 0, adds: [], alts: [], mmaj: false, alt: false, power: false };
  const push = (text, kind, key, arg) => parts.push({ text, kind, key, arg });
  const items = (str) => str.split(/[,;]/).filter(Boolean);
  const tension = (tok, where) => {
    const t = tok.replace(/^add/, '');
    if (/^maj7$/.test(t)) { q.maj7 = true; if (!q.num) q.num = 7; push(where === 'paren' ? '(maj7)' : 'maj7', 'seventh', 'paren_maj7'); return true; }
    if (!(t in ALT)) return false;
    q.alts.push(t); return true;
  };
  let guard = 0;
  while (r && guard++ < 20) {
    let mm;
    if ((mm = /^m7b5/.exec(r))) { q.hdim = true; q.num = 7; push('m7♭5', 'third', 'hdim'); }
    else if ((mm = /^(maj|Maj|MAJ|ma|M)(?=\d|$|\(|add|sus|#|b)/.exec(r))) {
      const nx = /^(13|11|9|7)/.exec(r.slice(mm[0].length));
      q.maj7 = true;
      if (nx) { q.num = +nx[1]; push(mm[0] + nx[1], 'seventh', 'maj', q.num); r = r.slice(mm[0].length + nx[0].length); continue; }
      if (r[0] === 'M' && mm[0] === 'M') { q.maj7 = false; push('M', 'third', 'majTriad'); }
      else { q.maj7 = false; push(mm[0], 'third', 'majTriad'); }
    }
    else if ((mm = /^(min|mi|m|-)(?!aj)/.exec(r))) {
      q.minor = true; push(mm[0], 'third', 'minor');
      const mx = /^(\(?maj7\)?|M7|Maj7)/.exec(r.slice(mm[0].length));
      if (mx) { q.mmaj = true; q.maj7 = true; q.num = 7; push(mx[0], 'seventh', 'maj', 7); r = r.slice(mm[0].length + mx[0].length); continue; }
    }
    else if ((mm = /^dim(7)?/.exec(r))) { q.dim = true; if (mm[1]) q.num = 7; push(mm[0], 'third', mm[1] ? 'dim7' : 'dim'); }
    else if ((mm = /^(aug|\+)/.exec(r))) { q.aug = true; push(mm[0], 'third', 'aug'); }
    else if ((mm = /^(6\/9|69)/.exec(r))) { q.num = 6; q.adds.push('9'); push(mm[0], 'seventh', 'six9'); }
    else if ((mm = /^(13|11|9|7|6|5)/.exec(r))) {
      const n = +mm[1];
      if (n === 5) { q.power = true; push('5', 'base', 'power'); }
      else { q.num = n; push(mm[0], n === 6 ? 'seventh' : n === 7 ? 'seventh' : 'tension', n === 6 ? 'six' : n === 7 ? (q.dim ? 'dim7num' : q.maj7 ? 'maj' : 'dom7') : 'ext', n); }
    }
    else if ((mm = /^sus(2|4)?/.exec(r))) { q.sus = mm[1] === '2' ? 2 : 4; push(mm[0], 'third', mm[1] ? 'sus' + mm[1] : 'sus'); }
    else if ((mm = /^add(b9|#9|#11|b13|9|11|13|2|4)/.exec(r))) {
      const v = mm[1] === '2' ? '2' : mm[1] === '4' ? '4' : mm[1];
      q.adds.push(v); push(mm[0], 'tension', 'add', v);
    }
    else if ((mm = /^alt/.exec(r))) { q.alt = true; if (!q.num) q.num = 7; push('alt', 'tension', 'alt'); }
    else if ((mm = /^(b5|#5|b9|#9|#11|b13)/.exec(r))) { tension(mm[1]); push(prettySymbol(mm[1]), 'tension', 'altn', mm[1]); }
    else if ((mm = /^\(([^)]*)\)/.exec(r))) {
      const its = items(mm[1]);
      if (!its.length) throw new ChordError('unknown', mm[0]);
      const before = q.alts.length, hadMaj = q.maj7;
      its.forEach((it) => { if (!tension(it, 'paren')) throw new ChordError('unknown', it); });
      const added = q.alts.slice(before);
      if (added.length) push('(' + added.map(prettySymbol).join(',') + ')', 'tension', 'paren', added);
      if (!hadMaj && q.maj7 && !added.length) { /* (maj7) handled in tension() */ }
    }
    else throw new ChordError('unknown', r);
    r = r.slice(mm[0].length);
  }

  // ---- intervals ----
  const tones = new Map(); // semi -> {kind, req}
  const add = (semi, kind, req = true) => { if (!tones.has(semi) || req) tones.set(semi, { kind, req: req || (tones.get(semi) || {}).req || false }); };
  add(0, 'base');
  const ext = q.num >= 9 ? q.num : 0;
  if (q.power) { add(7, 'base'); }
  else {
    if (q.sus === 4) add(5, 'third'); else if (q.sus === 2) add(2, 'third');
    else add(q.minor || q.dim || q.hdim ? 3 : 4, 'third');
    let fifth = q.dim || q.hdim ? 6 : q.aug ? 8 : 7;
    const altFifth = q.alts.find((a) => a === 'b5' || a === '#5');
    if (altFifth) fifth = ALT[altFifth];
    const has7 = q.num >= 7 || q.alt;
    const triad = !has7 && q.num !== 6;
    // 5th is optional in 7th chords and up, unless it is altered or the chord's colour (dim, aug, m7b5)
    const fifthReq = triad || !!altFifth || q.dim || q.hdim || q.aug;
    if (!(q.alt && !altFifth)) add(fifth, 'base', fifthReq);
    if (q.num === 6) add(9, 'seventh');
    if (has7) add(q.dim && !q.hdim ? 9 : q.maj7 ? 11 : 10, 'seventh');
    if (ext >= 9) add(14, 'tension', ext === 9);
    if (ext >= 11) add(17, 'tension', ext === 11);
    if (ext === 13) add(21, 'tension');
    if (q.alt) { add(13, 'tension'); add(15, 'tension'); add(20, 'tension'); }
    q.adds.forEach((a) => { if (a === '2') add(2, 'tension'); else if (a === '4') add(5, 'tension'); else add(ALT[a], 'tension'); });
    q.alts.filter((a) => a !== 'b5' && a !== '#5').forEach((a) => {
      const s = ALT[a];
      // an altered 9 replaces the natural 9 implied by 11 / 13
      if (s === 13 || s === 15) tones.delete(14);
      add(s, 'tension');
    });
  }
  const list = [...tones.entries()].sort((a, b) => a[0] - b[0]).map(([semi, v]) => {
    const dimSeventh = semi === 9 && q.dim && q.num === 7 && !q.hdim;
    const [deg, off] = dimSeventh ? ['𝄫7', 6] : semi === 2 && q.sus === 2 ? ['2', 1] : DEG[semi];
    const sp = spell(root.letter, root.pc, semi, off);
    return { semi, deg, off, name: sp.name, letter: sp.letter, alt: sp.alt, pc: sp.pc, req: v.req, kind: v.kind };
  });
  if (bass && !list.some((x) => x.pc === bass.pc)) { /* bass outside the chord: fine (C/D) */ }
  // nothing says minor / sus / dim … → the third is major by default: say so, beginners don't know it
  if (!q.power && !q.sus && !parts.some((p) => p.kind === 'third')) parts.splice(1, 0, { text: '', kind: 'third', key: 'impliedMajor', implied: true });
  return {
    symbol: prettySymbol(String(input).trim()), root, bass, quality: q, tones: list,
    parts: parts.concat(bass ? [{ text: '/' + bass.name, kind: 'bass', key: 'slash', arg: bass.name }] : [])
  };
}

/** Pitch classes that must sound / may sound. */
export function chordSets(ch) {
  const req = new Set(ch.tones.filter((x) => x.req).map((x) => x.pc));
  const all = new Set(ch.tones.map((x) => x.pc));
  if (ch.bass) { req.add(ch.bass.pc); all.add(ch.bass.pc); }
  return { req, all };
}

/**
 * Check what is held against a chord. notes: MIDI numbers. Octave and order don't matter;
 * for a slash chord the lowest note must be the bass.
 * @returns {{ ok, missing:[pc], extra:[midi], bassOk, count, need }}
 */
export function checkChord(ch, notes) {
  const { req, all } = chordSets(ch);
  const held = new Set(notes.map((m) => ((m % 12) + 12) % 12));
  const missing = [...req].filter((p) => !held.has(p));
  const extra = notes.filter((m) => !all.has(((m % 12) + 12) % 12));
  const low = notes.length ? Math.min(...notes) : null;
  const bassOk = !ch.bass || (low !== null && low % 12 === ch.bass.pc);
  const count = [...req].filter((p) => held.has(p)).length;
  return { ok: notes.length > 0 && !missing.length && !extra.length && bassOk, missing, extra, bassOk, count, need: req.size };
}

/** Name of a pitch class as spelled in the chord (falls back to sharps). */
export function nameInChord(ch, pc) {
  const t = ch.tones.find((x) => x.pc === pc);
  if (t) return t.name;
  if (ch.bass && ch.bass.pc === pc) return ch.bass.name;
  return ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][pc];
}

/**
 * Close-position voicing to show and play: root between `lo` and lo+11, tones stacked above.
 * Slash chords: the bass an octave below the chord's root area.
 * @returns [{ midi, tone }] low → high (tone = null for a separate bass note)
 */
export function voicing(ch, { lo = 48, all = true } = {}) {
  const r = lo + ((ch.root.pc - lo % 12 + 12) % 12);
  const out = [];
  if (ch.bass) {
    out.push({ midi: lo + ((ch.bass.pc - lo % 12 + 12) % 12), tone: null });
    const rr = r + 12;
    ch.tones.filter((x) => all || x.req).forEach((x) => out.push({ midi: rr + x.semi, tone: x }));
    return out;
  }
  ch.tones.filter((x) => all || x.req).forEach((x) => out.push({ midi: r + x.semi, tone: x }));
  return out;
}

/** Note name in Russian solfège: "B♭" → "Си-бемоль". */
export function ruName(name) {
  const l = name[0], a = name.slice(1);
  const w = { '♯': '-диез', '♭': '-бемоль', '𝄪': '-дубль-диез', '𝄫': '-дубль-бемоль', '': '' }[a];
  return RU_LETTER[l] + (w === undefined ? a : w);
}

/** Transpose a symbol to a new root: ("C7sus", "F") → "F7sus". */
export function withRoot(sym, rootName) {
  return String(sym).trim().replace(/^[A-G](#|b|♯|♭)?/, rootName);
}

// ---------- explanations (RU / EN) ----------
const TXT = {
  ru: {
    root: (c) => `Нота ${c.root.name} (${ruName(c.root.name)}). От неё строим аккорд.` + (c.root.letter === 'B' && !c.root.alt ? ' В джазе B = Си (в русских нотах её пишут H).' : ''),
    majTriad: () => 'Мажор. Буквы maj/M без числа значат обычное мажорное трезвучие: 1 · 3 · 5.',
    minor: (c) => `m = минор: терция малая, 3 полутона вверх от корня → ${tn(c, 3)}. Звучит мягче, грустнее.`,
    dim: (c) => `dim = уменьшённый: малая терция ${tn(c, 3)} и пониженная квинта ${tn(c, 6)}. Звучит напряжённо.`,
    dim7: (c) => `dim7 = уменьшённый септаккорд: всё по 3 полутона, ${c.tones.map((x) => x.name).join(' · ')}.`,
    dim7num: () => 'С dim число 7 значит уменьшённую септиму: 9 полутонов от корня.',
    hdim: (c) => `m7♭5 (или ø) = полууменьшённый: минор, пониженная квинта ${tn(c, 6)} и малая септима ${tn(c, 10)}.`,
    aug: (c) => `aug или + = увеличенный: квинта поднята на полтона → ${tn(c, 8)}.`,
    six: (c) => `6 = добавь сексту: 9 полутонов от корня → ${tn(c, 9)}. Септимы нет.`,
    six9: (c) => `6/9 = секста ${tn(c, 9)} и нона ${tn(c, 14)} поверх трезвучия. Септимы нет.`,
    power: () => '5 = «пустой» аккорд: только корень и квинта, без терции.',
    dom7: (c) => `7 = малая септима: 10 полутонов вверх → ${tn(c, 10)}.` + (c.quality.minor ? '' : ' Без maj это «джазовая семёрка», звук блюза.'),
    impliedMajor: (c) => `Нет m — значит терция большая: 4 полутона вверх → ${tn(c, 4)}. Основа мажорная.`,
    maj: (c, n) => `maj${n} = большая септима: 11 полутонов вверх → ${tn(c, 11)}, на полтона ниже следующего ${c.root.name}.` + (n > 7 ? ` Плюс ${n}.` : '') + (c.quality.mmaj ? ' Вместе с m это минор с большой септимой.' : ''),
    ext: (c, n) => `${n} — число больше 7: септима ${tn(c, c.quality.maj7 ? 11 : 10)} уже включена.` + ({ 9: ` 9 = 2-я ступень через октаву → ${tn(c, 14)}.`, 11: ` 11 = 4-я ступень через октаву → ${tn(c, 17)}.`, 13: ` 13 = 6-я ступень через октаву → ${tn(c, 21)}. 9 и 11 можно не играть.` })[n],
    sus: (c) => `sus = sus4: терцию убираем, вместо неё кварта ${tn(c, 5)}. Звучит «подвешенно», хочет разрешиться.`,
    sus4: (c) => `sus4: вместо терции кварта ${tn(c, 5)}. Звучит «подвешенно».`,
    sus2: (c) => `sus2: вместо терции секунда ${tn(c, 2)}. Звучит открыто, воздушно.`,
    add: (c, v) => `add${v} = просто добавь ноту ${tn(c, v === '2' ? 2 : v === '4' ? 5 : ALT[v])}. Септимы при этом нет.`,
    alt: () => 'alt = «изменённый»: септаккорд с острыми красками ♭9, ♯9, ♭13. Квинту обычно не играют.',
    altn: (c, a) => altText(c, a, 'ru'),
    paren: (c, list) => 'Скобки = краска сверху, основу аккорда они не меняют. ' + list.map((a) => altText(c, a, 'ru')).join(' '),
    paren_maj7: (c) => `(maj7) = большая септима ${tn(c, 11)}.`,
    slash: (c, b) => `Дробь — не деление. Справа нота в басу: самая низкая нота ${b} (${ruName(b)}). Левая рука играет её.`,
    what: { root: 'Корень', third: 'Вид', base: 'Основа', seventh: 'Септима', tension: 'Краска', bass: 'Бас' }
  },
  en: {
    root: (c) => `The note ${c.root.name}. The chord is built up from it.`,
    majTriad: () => 'Major. maj/M without a number means a plain major triad: 1 · 3 · 5.',
    minor: (c) => `m = minor: a minor third, 3 semitones up → ${tn(c, 3)}. Softer, sadder.`,
    dim: (c) => `dim = diminished: minor third ${tn(c, 3)} and flat fifth ${tn(c, 6)}. Tense.`,
    dim7: (c) => `dim7 = diminished seventh: stacked minor thirds, ${c.tones.map((x) => x.name).join(' · ')}.`,
    dim7num: () => 'With dim, 7 means a diminished seventh: 9 semitones up.',
    hdim: (c) => `m7♭5 (or ø) = half-diminished: minor, flat fifth ${tn(c, 6)}, minor seventh ${tn(c, 10)}.`,
    aug: (c) => `aug or + = augmented: the fifth raised a semitone → ${tn(c, 8)}.`,
    six: (c) => `6 = add the sixth: 9 semitones up → ${tn(c, 9)}. No seventh.`,
    six9: (c) => `6/9 = sixth ${tn(c, 9)} and ninth ${tn(c, 14)} over the triad. No seventh.`,
    power: () => '5 = power chord: root and fifth only, no third.',
    dom7: (c) => `7 = minor seventh: 10 semitones up → ${tn(c, 10)}.` + (c.quality.minor ? '' : ' Without maj it is the bluesy “dominant” seventh.'),
    impliedMajor: (c) => `No m, so the third is major: 4 semitones up → ${tn(c, 4)}.`,
    maj: (c, n) => `maj${n} = major seventh: 11 semitones up → ${tn(c, 11)}, a semitone below the next ${c.root.name}.` + (n > 7 ? ` Plus the ${n}.` : '') + (c.quality.mmaj ? ' With m: minor-major seventh.' : ''),
    ext: (c, n) => `${n} is above 7, so the seventh ${tn(c, c.quality.maj7 ? 11 : 10)} is included.` + ({ 9: ` 9 = the 2nd an octave up → ${tn(c, 14)}.`, 11: ` 11 = the 4th an octave up → ${tn(c, 17)}.`, 13: ` 13 = the 6th an octave up → ${tn(c, 21)}. 9 and 11 are optional.` })[n],
    sus: (c) => `sus = sus4: drop the third, play the fourth ${tn(c, 5)} instead. Sounds “suspended”.`,
    sus4: (c) => `sus4: the fourth ${tn(c, 5)} instead of the third.`,
    sus2: (c) => `sus2: the second ${tn(c, 2)} instead of the third. Open, airy.`,
    add: (c, v) => `add${v} = just add ${tn(c, v === '2' ? 2 : v === '4' ? 5 : ALT[v])}. No seventh.`,
    alt: () => 'alt = altered: a 7th chord with sharp colours ♭9, ♯9, ♭13. The fifth is usually left out.',
    altn: (c, a) => altText(c, a, 'en'),
    paren: (c, list) => 'Parentheses = colour on top; they don’t change the chord underneath. ' + list.map((a) => altText(c, a, 'en')).join(' '),
    paren_maj7: (c) => `(maj7) = major seventh ${tn(c, 11)}.`,
    slash: (c, b) => `The slash is not a fraction: the note on the right is the bass, the lowest note, ${b}. The left hand plays it.`,
    what: { root: 'Root', third: 'Quality', base: 'Base', seventh: 'Seventh', tension: 'Colour', bass: 'Bass' }
  }
};
function tn(c, semi) { const t = c.tones.find((x) => x.semi === semi); return t ? t.name : spell(c.root.letter, c.root.pc, semi, (DEG[semi] || ['', 0])[1]).name; }
function altText(c, a, lang) {
  const s = ALT[a], n = tn(c, s);
  const ru = { b9: `♭9 = нона на полтона ниже → ${n}.`, '#9': `♯9 = нона на полтона выше → ${n} («блюзовая» краска).`, 9: `9 = 2-я ступень через октаву → ${n}.`,
    11: `11 = 4-я ступень через октаву → ${n}.`, '#11': `♯11 = 11 на полтона выше → ${n}. Яркая, «лидийская» краска.`, b13: `♭13 = 13 на полтона ниже → ${n}.`,
    13: `13 = 6-я ступень через октаву → ${n}.`, b5: `♭5 = квинта на полтона ниже → ${n}.`, '#5': `♯5 = квинта на полтона выше → ${n}.` };
  const en = { b9: `♭9 = the ninth a semitone lower → ${n}.`, '#9': `♯9 = the ninth a semitone higher → ${n} (bluesy).`, 9: `9 = the 2nd an octave up → ${n}.`,
    11: `11 = the 4th an octave up → ${n}.`, '#11': `♯11 = the 11th a semitone higher → ${n}. Bright, “Lydian”.`, b13: `♭13 = the 13th a semitone lower → ${n}.`,
    13: `13 = the 6th an octave up → ${n}.`, b5: `♭5 = the fifth a semitone lower → ${n}.`, '#5': `♯5 = the fifth a semitone higher → ${n}.` };
  return (lang === 'ru' ? ru : en)[a];
}

/** Explanation cards for the decoder: [{ text, kind, what, says }]. */
export function explain(ch, lang = 'ru') {
  const T = TXT[lang] || TXT.ru;
  return ch.parts.map((p) => ({ text: p.text, kind: p.kind, implied: !!p.implied, what: T.what[p.kind], says: T[p.key] ? T[p.key](ch, p.arg) : '' }));
}

/** Short full name: "Си, септаккорд, sus4" style. */
export function chordName(ch, lang = 'ru') {
  const q = ch.quality, ru = lang === 'ru';
  const rootN = ru ? ruName(ch.root.name) : ch.root.name;
  let kind;
  if (q.power) kind = ru ? 'квинта без терции' : 'power chord';
  else if (q.hdim) kind = ru ? 'полууменьшённый септаккорд' : 'half-diminished seventh';
  else if (q.dim) kind = q.num === 7 ? (ru ? 'уменьшённый септаккорд' : 'diminished seventh') : (ru ? 'уменьшённое трезвучие' : 'diminished triad');
  else if (q.mmaj) kind = ru ? 'минор с большой септимой' : 'minor-major seventh';
  else if (q.num >= 7 || q.alt) kind = q.maj7 ? (ru ? 'большой мажорный септаккорд' : 'major seventh') : q.minor ? (ru ? 'минорный септаккорд' : 'minor seventh') : (ru ? 'септаккорд (доминантовый)' : 'dominant seventh');
  else if (q.num === 6) kind = q.minor ? (ru ? 'минор с секстой' : 'minor sixth') : (ru ? 'мажор с секстой' : 'major sixth');
  else kind = q.aug ? (ru ? 'увеличенное трезвучие' : 'augmented triad') : q.minor ? (ru ? 'минорное трезвучие' : 'minor triad') : (ru ? 'мажорное трезвучие' : 'major triad');
  const mods = [];
  if (q.sus) mods.push('sus' + q.sus);
  if (q.num >= 9) mods.push(String(q.num));
  if (q.alt) mods.push('alt');
  q.adds.forEach((a) => mods.push('add' + a));
  q.alts.forEach((a) => mods.push(prettySymbol(a)));
  if (ch.bass) mods.push((ru ? 'бас ' : 'bass ') + ch.bass.name);
  return [rootN + ',', kind].join(' ') + (mods.length ? ' · ' + mods.join(' · ') : '');
}
