#!/usr/bin/env python3
"""Export Week 1 / Exercise 2 to MusicXML + MIDI for Piano Marvel upload.

No dependencies. Usage: python3 scripts/export_ex2.py [out_dir]   (default: exports/)

Same note data as EXERCISES[0] in src/piano-guide.html (slot = one eighth, 8 slots per 4/4 bar).
Piano Marvel requires the XML and MIDI to match, so both are generated from one event list:
one part, two staves (RH = staff 1, LH = staff 2), straight eighths, same tempo, notated durations.
"""
import struct
import sys
from pathlib import Path

TITLE = "Week 1 - Exercise 2"
TEMPO = 90  # quarter = 90; the book prints no tempo
SLOTS = 8   # eighths per bar
DIV = 2     # MusicXML divisions per quarter (1 = eighth)
PPQ = 480

# ev = (slot, "notes", [fingers], length_in_eighths, accent)
def ev(t, notes, f, d=1, acc=False):
    return dict(t=t, notes=notes.split(), f=f, d=d, acc=acc)

BARS = [
    dict(rh=[ev(0, "E4 G4", [2, 4]), ev(1, "E4 G4", [2, 4]), ev(2, "E4 G4", [2, 4], 2),
             ev(4, "D#4 F#4", [2, 4], acc=True), ev(5, "E4 G4", [2, 4])],
         lh=[ev(0, "C3", [5], 2), ev(7, "C3", [5])]),
    dict(rh=[ev(0, "F4 A4", [2, 4]), ev(1, "F4 A4", [2, 4]), ev(2, "F4 A4", [2, 4], 2),
             ev(4, "E4 G#4", [2, 4], acc=True), ev(5, "F4 A4", [2, 4])],
         lh=[ev(0, "F3", [2], 2), ev(7, "F#3", [2])]),
    dict(rh=[ev(0, "G4 B4", [2, 4]), ev(1, "G4 B4", [2, 4]), ev(2, "G4 B4", [2, 4], 2),
             ev(4, "F#4 A#4", [2, 4], acc=True), ev(5, "G4 B4", [2, 4])],
         lh=[ev(0, "G3", [1], 2), ev(7, "D3", [4])]),
    dict(rh=[ev(0, "G4 C5", [2, 5]), ev(1, "G4 C5", [2, 5]), ev(2, "G4 C5", [2, 5], 2)],
         lh=[ev(0, "C3", [5], 2), ev(4, "D#3", [3], acc=True), ev(5, "E3", [2]), ev(7, "C3", [5])]),
]
# dynamics: bar index -> mark; crescendo wedge over bars 2-3; MIDI velocity per bar start/end
DYN = {0: "mp", 3: "f"}
CRESC = (1, 2)  # first bar, last bar (0-based)
VEL = [(60, 60), (62, 74), (76, 90), (96, 96)]  # (start, end) velocity per bar
ACCENT_BOOST = 14

PC = dict(C=0, D=2, E=4, F=5, G=7, A=9, B=11)


def parse(n):
    step, alt, octv = n[0], (1 if "#" in n else -1 if "b" in n[1:-1] else 0), int(n[-1])
    return step, alt, octv, 12 * (octv + 1) + PC[step] + alt


def slots_with_rests(evs):
    """Fill gaps with beat-aligned rests (half only when it fills beats 3-4 or 1-2)."""
    occ = {}
    for e in evs:
        occ[e["t"]] = e
    out, s = [], 0
    while s < SLOTS:
        if s in occ:
            out.append(occ[s]); s += occ[s]["d"]; continue
        end = s
        while end < SLOTS and end not in occ:
            end += 1
        while s < end:
            if s % 4 == 0 and end - s >= 4:
                d = 4
            elif s % 2 == 0 and end - s >= 2:
                d = 2
            else:
                d = 1
            out.append(dict(t=s, rest=True, d=d)); s += d
    return out


TYPE = {1: "eighth", 2: "quarter", 4: "half", 8: "whole"}


def note_xml(e, staff, voice, beam, dyn_before=""):
    x = []
    if e.get("rest"):
        x.append(f'<note><rest/><duration>{e["d"]}</duration>'
                 f'<voice>{voice}</voice><type>{TYPE[e["d"]]}</type><staff>{staff}</staff></note>')
        return "".join(x)
    for i, (n, f) in enumerate(zip(e["notes"], e["f"])):
        step, alt, octv, _ = parse(n)
        p = f"<step>{step}</step>" + (f"<alter>{alt}</alter>" if alt else "") + f"<octave>{octv}</octave>"
        acc = "<accidental>sharp</accidental>" if alt == 1 else "<accidental>flat</accidental>" if alt == -1 else ""
        bm = f'<beam number="1">{beam}</beam>' if beam and i == 0 else ""
        arts = "<staccato/>" + ("<accent/>" if e["acc"] else "")
        notations = (f"<notations><articulations>{arts}</articulations>"
                     f"<technical><fingering>{f}</fingering></technical></notations>")
        x.append(f'<note>{"<chord/>" if i else ""}<pitch>{p}</pitch><duration>{e["d"]}</duration>'
                 f'<voice>{voice}</voice><type>{TYPE[e["d"]]}</type>{acc}'
                 f'<stem>{"up" if staff == 1 else "down"}</stem><staff>{staff}</staff>{bm}{notations}</note>')
    return "".join(x)


def beams(seq):
    """Beam two consecutive eighth notes inside the same beat."""
    b = [None] * len(seq)
    for i in range(len(seq) - 1):
        a, c = seq[i], seq[i + 1]
        if (not a.get("rest") and not c.get("rest") and a["d"] == 1 and c["d"] == 1
                and a["t"] % 2 == 0 and c["t"] == a["t"] + 1):
            b[i], b[i + 1] = "begin", "end"
    return b


def direction(staff, inner, placement="below"):
    return (f'<direction placement="{placement}"><direction-type>{inner}</direction-type>'
            f"<staff>{staff}</staff></direction>")


def build_xml():
    m_xml = []
    for bi, bar in enumerate(BARS):
        m = [f'<measure number="{bi + 1}">']
        if bi == 0:
            m.append(f"<attributes><divisions>{DIV}</divisions><key><fifths>0</fifths></key>"
                     "<time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves>"
                     '<clef number="1"><sign>G</sign><line>2</line></clef>'
                     '<clef number="2"><sign>F</sign><line>4</line></clef></attributes>')
            m.append(f'<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>'
                     f"<per-minute>{TEMPO}</per-minute></metronome></direction-type><staff>1</staff>"
                     f'<sound tempo="{TEMPO}"/></direction>')
        if bi in DYN:
            m.append(direction(1, f"<dynamics><{DYN[bi]}/></dynamics>"))
        if bi == CRESC[0]:
            m.append(direction(1, '<wedge type="crescendo" number="1"/>'))
        for staff, key, voice in ((1, "rh", 1), (2, "lh", 5)):
            seq = slots_with_rests(BARS[bi][key])
            for e, bm in zip(seq, beams(seq)):
                m.append(note_xml(e, staff, voice, bm))
            if staff == 1:
                if bi == CRESC[1]:
                    m.append(direction(1, '<wedge type="stop" number="1"/>'))
                m.append(f"<backup><duration>{SLOTS}</duration></backup>")
        if bi == len(BARS) - 1:
            m.append('<barline location="right"><bar-style>light-heavy</bar-style></barline>')
        m.append("</measure>")
        m_xml.append("".join(m))
    return ('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n'
            '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" '
            '"http://www.musicxml.org/dtds/partwise.dtd">\n'
            '<score-partwise version="3.1">'
            f"<work><work-title>{TITLE}</work-title></work>"
            "<identification><encoding><software>jazzlab export_ex2.py</software></encoding></identification>"
            '<part-list><score-part id="P1"><part-name>Piano</part-name>'
            '<score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument>'
            '<midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument>'
            '</score-part></part-list><part id="P1">' + "\n".join(m_xml) + "</part></score-partwise>\n")


# ---------------- MIDI (type 1: conductor + RH track + LH track) ----------------
def vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append(0x80 | (n & 0x7F)); n >>= 7
    return bytes(reversed(out))


def track(events):
    """events: list of (abs_tick, order, bytes). order: note-offs (0) before note-ons (1) at same tick."""
    data, last = b"", 0
    for t, _, msg in sorted(events, key=lambda x: (x[0], x[1])):
        data += vlq(t - last) + msg; last = t
    data += vlq(0) + b"\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(data)) + data


def meta_name(name):
    b = name.encode()
    return b"\xff\x03" + vlq(len(b)) + b


def build_midi():
    eighth = PPQ // 2
    bar_ticks = SLOTS * eighth
    us = round(60_000_000 / TEMPO)
    conductor = [(0, 0, meta_name(TITLE)),
                 (0, 0, b"\xff\x58\x04\x04\x02\x18\x08"),
                 (0, 0, b"\xff\x59\x02\x00\x00"),
                 (0, 0, b"\xff\x51\x03" + us.to_bytes(3, "big"))]
    tracks = [track(conductor)]
    for key, name in (("rh", "Piano RH"), ("lh", "Piano LH")):
        evs = [(0, 0, meta_name(name)), (0, 0, bytes([0xC0, 0]))]
        for bi, bar in enumerate(BARS):
            v0, v1 = VEL[bi]
            for e in bar[key]:
                vel = round(v0 + (v1 - v0) * e["t"] / SLOTS) + (ACCENT_BOOST if e["acc"] else 0)
                vel = max(1, min(127, vel))
                on = bi * bar_ticks + e["t"] * eighth
                off = on + e["d"] * eighth
                for n in e["notes"]:
                    p = parse(n)[3]
                    evs.append((on, 1, bytes([0x90, p, vel])))
                    evs.append((off, 0, bytes([0x80, p, 0])))
        tracks.append(track(evs))
    return b"MThd" + struct.pack(">IHHH", 6, 1, len(tracks), PPQ) + b"".join(tracks)


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "exports")
    out.mkdir(parents=True, exist_ok=True)
    (out / "week1-ex2.musicxml").write_text(build_xml(), encoding="utf-8")
    (out / "week1-ex2.mid").write_bytes(build_midi())
    print("wrote", out / "week1-ex2.musicxml", out / "week1-ex2.mid")
