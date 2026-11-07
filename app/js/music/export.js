// MusicXML + Standard MIDI export, generated from the same exercise model so they always match
// (Piano Marvel requires XML and MIDI to agree): one part, two staves (RH = 1, LH = 2),
// straight eighths, notated durations, one tempo.
import { parse } from './notes.js';

const TYPE = { 1: 'eighth', 2: 'quarter', 3: 'quarter', 4: 'half', 6: 'half', 8: 'whole' };
const DOTTED = { 3: true, 6: true };

function withRests(evs, per) {
  const at = new Map(evs.map((e) => [e.t, e]));
  const out = [];
  let s = 0;
  while (s < per) {
    if (at.has(s)) { const e = at.get(s); out.push(e); s += e.d; continue; }
    let end = s;
    while (end < per && !at.has(end)) end++;
    while (s < end) {
      const d = s % 4 === 0 && end - s >= 4 ? 4 : s % 2 === 0 && end - s >= 2 ? 2 : 1;
      out.push({ t: s, rest: true, d }); s += d;
    }
  }
  return out;
}

function beams(seq) {
  const b = new Array(seq.length).fill(null);
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i], c = seq[i + 1];
    if (!a.rest && !c.rest && a.d === 1 && c.d === 1 && a.t % 2 === 0 && c.t === a.t + 1) { b[i] = 'begin'; b[i + 1] = 'end'; }
  }
  return b;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function graceXml(g, staff, voice) {
  const p = parse(g);
  const pitch = `<pitch><step>${p.step}</step>` + (p.alt ? `<alter>${p.alt}</alter>` : '') + `<octave>${p.oct}</octave></pitch>`;
  const acc = p.alt === 1 ? '<accidental>sharp</accidental>' : p.alt === -1 ? '<accidental>flat</accidental>' : '';
  return `<note><grace slash="yes"/>${pitch}<voice>${voice}</voice><type>eighth</type>${acc}<stem>up</stem><staff>${staff}</staff></note>`;
}

function noteXml(e, staff, voice, beam) {
  // 5 eighths (the bossa bass cell) has no single note value: a dotted quarter tied to a quarter
  if (e.d === 5 && !e.rest) return noteXml({ ...e, d: 3, tie: 'start' }, staff, voice, beam) + noteXml({ ...e, t: e.t + 3, d: 2, tie: 'stop', grace: null, acc: false, stac: false, f: [] }, staff, voice, null);
  const dot = DOTTED[e.d] ? '<dot/>' : '';
  if (e.rest) return `<note><rest/><duration>${e.d}</duration><voice>${voice}</voice><type>${TYPE[e.d]}</type>${dot}<staff>${staff}</staff></note>`;
  return (e.grace ? graceXml(e.grace, staff, voice) : '') + e.notes.map((n, i) => {
    const p = parse(n);
    const pitch = `<step>${p.step}</step>` + (p.alt ? `<alter>${p.alt}</alter>` : '') + `<octave>${p.oct}</octave>`;
    const acc = p.alt === 1 ? '<accidental>sharp</accidental>' : p.alt === -1 ? '<accidental>flat</accidental>' : '';
    const bm = beam && i === 0 ? `<beam number="1">${beam}</beam>` : '';
    const arts = (e.stac ? '<staccato/>' : '') + (e.acc ? '<accent/>' : '');
    const f = e.f[i];
    const tie = e.tie ? `<tie type="${e.tie}"/>` : '', tied = e.tie ? `<tied type="${e.tie}"/>` : '';
    const notations = (arts || f !== undefined || tied)
      ? '<notations>' + tied + (arts ? `<articulations>${arts}</articulations>` : '') + (f !== undefined ? `<technical><fingering>${f}</fingering></technical>` : '') + '</notations>'
      : '';
    return `<note>${i ? '<chord/>' : ''}<pitch>${pitch}</pitch><duration>${e.d}</duration>${tie}<voice>${voice}</voice><type>${TYPE[e.d]}</type>${dot}${acc}<stem>${staff === 1 ? 'up' : 'down'}</stem><staff>${staff}</staff>${bm}${notations}</note>`;
  }).join('');
}

const dir = (staff, inner, placement = 'below') =>
  `<direction placement="${placement}"><direction-type>${inner}</direction-type><staff>${staff}</staff></direction>`;

export function exportTempo(ex) { return ex.export.tempo || ex.tempo.target; }

export function toMusicXML(ex, title) {
  const tempo = exportTempo(ex);
  const per = ex.per;
  const marks = new Map(ex.dyn.filter((d) => !d.cresc).map((d) => [d.bar, d.mark]));
  const wedges = ex.dyn.filter((d) => d.cresc).map((d) => {
    const nx = ex.dyn.find((x) => x.bar > d.bar);
    return { start: d.bar, stop: (nx ? nx.bar : ex.bars.length) - 1 };
  });
  const measures = ex.bars.map((bar, bi) => {
    const m = [`<measure number="${bi + 1}">`];
    if (bi === 0) {
      m.push(`<attributes><divisions>2</divisions><key><fifths>0</fifths></key><time><beats>${ex.beats}</beats><beat-type>4</beat-type></time><staves>2</staves>` +
        '<clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes>');
      m.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempo}</per-minute></metronome></direction-type><staff>1</staff><sound tempo="${tempo}"/></direction>`);
    }
    if (marks.has(bi)) m.push(dir(1, `<dynamics><${marks.get(bi)}/></dynamics>`));
    wedges.filter((w) => w.start === bi).forEach(() => m.push(dir(1, '<wedge type="crescendo" number="1"/>')));
    [[1, 'rh', 1], [2, 'lh', 5]].forEach(([staff, key, voice]) => {
      const seq = withRests(bar[key], per);
      const bm = beams(seq);
      seq.forEach((e, k) => m.push(noteXml(e, staff, voice, bm[k])));
      if (staff === 1) {
        wedges.filter((w) => w.stop === bi).forEach(() => m.push(dir(1, '<wedge type="stop" number="1"/>')));
        m.push(`<backup><duration>${per}</duration></backup>`);
      }
    });
    if (bi === ex.bars.length - 1) m.push('<barline location="right"><bar-style>light-heavy</bar-style></barline>');
    m.push('</measure>');
    return m.join('');
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
    '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
    '<score-partwise version="3.1">' +
    `<work><work-title>${esc(title)}</work-title></work>` +
    '<identification><encoding><software>jazzlab</software></encoding></identification>' +
    '<part-list><score-part id="P1"><part-name>Piano</part-name>' +
    '<score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument>' +
    '<midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>' +
    '</score-part></part-list><part id="P1">' + measures.join('\n') + '</part></score-partwise>\n';
}

// ---------- MIDI: type 1, conductor + RH + LH ----------
const PPQ = 480;
function vlq(n) { const out = [n & 0x7f]; n >>= 7; while (n) { out.push(0x80 | (n & 0x7f)); n >>= 7; } return out.reverse(); }
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const utf8 = (s) => Array.from(new TextEncoder().encode(s));
const metaName = (name) => { const b = utf8(name); return [0xff, 0x03, ...vlq(b.length), ...b]; };

function track(events) {
  const data = [];
  let last = 0;
  events.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).forEach(([t, , msg]) => { data.push(...vlq(t - last), ...msg); last = t; });
  data.push(0, 0xff, 0x2f, 0x00);
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(data.length), ...data];
}

/** Velocity per bar as [start, end]; from ex.export.vel if given, else from dyn levels. */
function barVelocities(ex) {
  if (ex.export.vel) return ex.export.vel;
  const v = (lvl) => Math.round(30 + 66 * lvl);
  return ex.bars.map((_, bi) => {
    const a = levelAt(ex, bi), b = levelAt(ex, bi + 1 - 1e-6);
    return [v(a), v(b)];
  });
}
function levelAt(ex, pos) {
  let cur = ex.dyn[0];
  for (const d of ex.dyn) if (d.bar <= pos) cur = d;
  if (cur.cresc) { const nx = ex.dyn.find((d) => d.bar > cur.bar); if (nx) return cur.level + (nx.level - cur.level) * (pos - cur.bar) / (nx.bar - cur.bar); }
  return cur.level;
}

export function toMidiFile(ex, title) {
  const tempo = exportTempo(ex);
  const eighth = PPQ / 2, barTicks = ex.per * eighth;
  const us = Math.round(60000000 / tempo);
  const conductor = [[0, 0, metaName(title)], [0, 0, [0xff, 0x58, 0x04, ex.beats, 0x02, 0x18, 0x08]], [0, 0, [0xff, 0x59, 0x02, 0x00, 0x00]],
    [0, 0, [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255]]];
  const tracks = [track(conductor)];
  const vel = barVelocities(ex);
  [['rh', 'Piano RH'], ['lh', 'Piano LH']].forEach(([key, name]) => {
    const evs = [[0, 0, metaName(name)], [0, 0, [0xc0, 0]]];
    ex.bars.forEach((bar, bi) => {
      const [v0, v1] = vel[bi];
      bar[key].forEach((e) => {
        let v = Math.round(v0 + (v1 - v0) * e.t / ex.per) + (e.acc ? 14 : 0);
        v = Math.max(1, Math.min(127, v));
        const on = bi * barTicks + e.t * eighth, off = on + e.d * eighth;
        if (e.grace) { // grace note: a short note just before the beat
          const g = parse(e.grace).midi, gOn = Math.max(0, on - 40);
          evs.push([gOn, 1, [0x90, g, Math.max(1, v - 20)]]); evs.push([on === gOn ? on + 30 : on, 0, [0x80, g, 0]]);
        }
        e.notes.forEach((n) => { const p = parse(n).midi; evs.push([on, 1, [0x90, p, v]]); evs.push([off, 0, [0x80, p, 0]]); });
      });
    });
    tracks.push(track(evs));
  });
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(PPQ), ...tracks.flat()]);
}

/**
 * A performance recording as a Standard MIDI file (type 1: conductor + one piano track).
 * rec = { bpm, notes: [{ t, d, m, v }] } with t (onset) and d (duration) in SECONDS from the first beat of
 * chorus 1 and v = velocity 0..1. Seconds become ticks at rec.bpm, so the file lines up with the bar grid;
 * swing is already in the real timing and needs no handling. Notes with t < 0 are clamped to 0.
 */
export function recordingToMidi(rec, title) {
  const bpm = rec.bpm || 120, us = Math.round(60000000 / bpm);
  const tick = (sec) => Math.max(0, Math.round(sec * bpm / 60 * PPQ));
  const conductor = [[0, 0, metaName(title)], [0, 0, [0xff, 0x58, 0x04, 4, 0x02, 0x18, 0x08]], [0, 0, [0xff, 0x59, 0x02, 0x00, 0x00]],
    [0, 0, [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255]]];
  const evs = [[0, 0, metaName('Piano')], [0, 0, [0xc0, 0]]];
  (rec.notes || []).forEach((n) => {
    const m = Math.max(0, Math.min(127, Math.round(n.m)));
    const v = Math.max(1, Math.min(127, Math.round((n.v ?? 0.6) * 127)));
    const on = tick(n.t), off = Math.max(on + 1, tick(n.t + (n.d || 0)));
    evs.push([on, 1, [0x90, m, v]]); evs.push([off, 0, [0x80, m, 0]]);
  });
  const tracks = [track(conductor), track(evs)];
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(PPQ), ...tracks.flat()]);
}
