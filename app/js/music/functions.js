// Harmonic function of the chords of a form: ii–V–I (major and minor), ii–V and V–I on their own, tritone substitution
// (bII7 -> I), a secondary dominant (X7 down a fifth onto a chord that is not the tonic), a diminished passing chord
// (dim7 a half step from its target) and the I / IV / V of a blues. Pure (no DOM). Conservative: only what is clear is labelled.
//
//   analyzeForm(bars) -> { tonic, labels: [{ bar, slot, chord, role, group, type, key }], groups: [{ id, type, key, from, to, bars }] }
//
// role: 'ii' | 'V' | 'I' | 'subV' | 'V/<degree>' | 'dim' | 'I7' | 'IV7' | 'V7'.
// type: 'ii-V-I' | 'ii-V' | 'V-I' | 'ii-subV-I' | 'subV-I' | 'secdom' | 'dim'. A group's `bars` are the bar indices it covers
// (they wrap round the end of the form when the group does: the form loops). A held chord is labelled once, on its first bar.
import { barChords, parseChord } from './forms.js';

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const DEGREE = { 2: 'ii', 4: 'iii', 5: 'IV', 7: 'V', 9: 'vi' }; // the diatonic targets of a secondary dominant; others stay unlabelled
const isDom = (c) => c.qual === '7' || c.qual === '9';
const isMajTarget = (c) => ['maj7', '6', ''].includes(c.qual);
const isMinTarget = (c) => ['m', 'm7'].includes(c.qual);
const down5 = (a, b) => (a.pc + 5) % 12 === b.pc; // b is a fifth below a (a = V, b = I)

/** Every chord sounding in the form: [{ bar, slot (0 or 4), chord, c (parsed) }]. */
function occurrences(bars) {
  const out = [];
  bars.forEach((name, bar) => barChords(name).forEach((chord, i, arr) => out.push({ bar, slot: arr.length > 1 ? i * 4 : 0, chord, c: parseChord(chord) })));
  return out;
}

export function analyzeForm(bars) {
  const occ = occurrences(bars);
  // runs: the same chord held over several slots / bars is one event; the label sits on its first occurrence
  const runs = [];
  occ.forEach((o) => { const r = runs[runs.length - 1]; if (r && r.chord === o.chord) r.occs.push(o); else runs.push({ chord: o.chord, c: o.c, occs: [o] }); });
  const N = runs.length;
  const out = { tonic: null, labels: [], groups: [] };
  if (N < 3) return out;
  const flats = occ.some((o) => o.c.root.length > 1 && o.c.root[1] === 'b') || occ.some((o) => o.c.root === 'F');
  const nameOf = (pc) => (flats ? FLAT : SHARP)[((pc % 12) + 12) % 12];
  const at = (i) => runs[((i % N) + N) % N];

  // tonic: the chord the form ends on (the first one when it ends on a dominant or a diminished chord)
  const first = at(0), last = at(N - 1);
  const endsOpen = isDom(last.c) || last.c.qual === 'dim7';
  // an (almost) all-dominant form with its IV and V present is a blues: its tonic is the first chord, a 7th
  const share = occ.filter((o) => isDom(o.c)).length / occ.length;
  const has = (iv) => occ.some((o) => o.c.pc === (first.c.pc + iv) % 12);
  const blues = share >= 0.75 && isDom(first.c) && has(5) && has(7);
  const tonic = blues || endsOpen ? first.c : last.c;
  out.tonic = tonic.root;
  const isTonic = (c) => c.pc === tonic.pc;

  const used = new Set(); // "bar:slot" already labelled (the first role wins: ii / V / subV are given before I)
  let gid = 0;
  const addGroup = (type, key, fromRun, toRun, toHead) => {
    const from = fromRun.occs[0], to = toHead ? toRun.occs[0] : toRun.occs[toRun.occs.length - 1];
    const bs = [from.bar];
    for (let b = from.bar; b !== to.bar;) { b = (b + 1) % bars.length; bs.push(b); }
    const g = { id: 'g' + (++gid), type, key, from: { bar: from.bar, slot: from.slot }, to: { bar: to.bar, slot: to.slot }, bars: bs };
    out.groups.push(g);
    return g;
  };
  const give = (run, role, g) => {
    const o = run.occs[0], k = `${o.bar}:${o.slot}`;
    if (used.has(k)) return;
    used.add(k);
    out.labels.push({ bar: o.bar, slot: o.slot, chord: o.chord, role, group: g ? g.id : null, type: g ? g.type : null, key: g ? g.key : tonic.root });
  };
  const keyName = (c, minor) => c.root + (minor ? 'm' : '');

  // the dominants, and what leads into / out of each
  for (let i = 0; i < N; i++) {
    const v = runs[i];
    if (!isDom(v.c)) continue;
    const p = at(i - 1), n = at(i + 1);
    const pIsII = p !== v && (p.c.qual === 'm7' || p.c.qual === 'm7b5') && down5(p.c, v.c);
    // a blues may resolve a dominant onto its own tonic 7th (G7 -> C7)
    const nMaj = n !== v && (isMajTarget(n.c) || (blues && isDom(n.c) && isTonic(n.c)));
    const nMin = n !== v && isMinTarget(n.c);
    // ii–V–I: major (m7 7 maj7) and minor (m7b5 7 m7)
    if (pIsII && down5(v.c, n.c) && ((p.c.qual === 'm7' && nMaj) || (p.c.qual === 'm7b5' && nMin))) {
      const g = addGroup('ii-V-I', keyName(n.c, p.c.qual === 'm7b5'), p, n, true);
      give(p, 'ii', g); give(v, 'V', g); give(n, 'I', g);
      continue;
    }
    // tritone substitution: bII7 -> I (Gb7 -> Fmaj7), with its ii in front when there is one (Gm7 Gb7 Fmaj7)
    if ((nMaj || nMin) && !isDom(n.c) && (v.c.pc + 11) % 12 === n.c.pc) {
      const key = keyName(n.c, nMin);
      if (pIsSub(p, v, n)) {
        const g = addGroup('ii-subV-I', key, p, n, true);
        give(p, 'ii', g); give(v, 'subV', g); give(n, 'I', g);
      } else {
        const g = addGroup('subV-I', key, v, n, true);
        give(v, 'subV', g); give(n, 'I', g);
      }
      continue;
    }
    // ii–V that does not close (Gm7 C7 | Gm7): the ii is a fourth below the V
    if (pIsII) {
      const minor = p.c.qual === 'm7b5', key = nameOf(v.c.pc + 5) + (minor ? 'm' : '');
      const g = addGroup('ii-V', key, p, v, false);
      give(p, 'ii', g); give(v, 'V', g);
      continue;
    }
    // V7 -> I on its own, or a secondary dominant (down a fifth onto a chord that is not the tonic)
    if (n !== v && down5(v.c, n.c) && !isDom(n.c) && (isMajTarget(n.c) || isMinTarget(n.c))) {
      const key = keyName(n.c, isMinTarget(n.c));
      if (isTonic(n.c)) {
        const g = addGroup('V-I', key, v, n, true);
        give(v, 'V', g); give(n, 'I', g);
      } else {
        const deg = DEGREE[(n.c.pc - tonic.pc + 12) % 12];
        if (!deg) continue;
        give(v, 'V/' + deg, addGroup('secdom', key, v, n, true));
      }
    }
  }
  function pIsSub(p, v, n) { return p !== v && p.c.qual === 'm7' && p.c.pc === (n.c.pc + 2) % 12; }

  // diminished passing chord: its root a half step above or below the next chord's root
  for (let i = 0; i < N; i++) {
    const d = runs[i], n = at(i + 1);
    if (d.c.qual !== 'dim7' || n === d || n.c.qual === 'dim7' || isDom(n.c)) continue;
    const dist = (d.c.pc - n.c.pc + 12) % 12;
    if ((dist !== 1 && dist !== 11) || !(isMajTarget(n.c) || isMinTarget(n.c))) continue;
    give(d, 'dim', addGroup('dim', keyName(n.c, isMinTarget(n.c)), d, n, true));
  }

  // blues: I7 / IV7 / V7 of the tonic on the dominant chords nothing else labelled
  if (blues) {
    for (const r of runs) {
      if (!isDom(r.c)) continue;
      const iv = (r.c.pc - tonic.pc + 12) % 12, role = iv === 0 ? 'I7' : iv === 5 ? 'IV7' : iv === 7 ? 'V7' : null;
      if (role) give(r, role, null);
    }
  }
  out.labels.sort((a, b) => a.bar - b.bar || a.slot - b.slot);
  return out;
}

/** The label as printed in the grid: 'I7' -> 'I', a minor tonic is written lower-case ('i'). */
export function roleText(l) {
  if (l.role === 'I' && /m$/.test(l.key || '')) return 'i';
  return l.role.replace(/^(I|IV|V)7$/, '$1');
}
/** The glossary term that explains a label. */
export function roleTerm(l) {
  const r = l.role;
  if (r === 'subV') return 'tritone-sub';
  if (r === 'dim') return 'passing-dim';
  if (r.startsWith('V/')) return 'sec-dom';
  if (/^(I|IV|V)7$/.test(r)) return 'blues-fn';
  if (r === 'V' && l.type === 'V-I') return 'dominant';
  return 'ii-v-i';
}
/** Title of a group that gets a bracket and a name in the grid (secondary dominants and diminished chords have none). */
export const groupTitle = (g) => ({ 'ii-V-I': 'ii–V–I', 'ii-V': 'ii–V', 'V-I': 'V–I', 'ii-subV-I': 'ii–subV–I', 'subV-I': 'subV–I' }[g.type] || null);
/** The glossary term that explains a group. */
export const groupTerm = (g) => (g.type === 'V-I' ? 'dominant' : g.type === 'subV-I' ? 'tritone-sub' : 'ii-v-i');
