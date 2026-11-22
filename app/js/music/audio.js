// Web Audio synth: a soft piano-like voice + metronome click.
// iOS/iPadOS: audio must be unlocked inside a tap, and the ring/silent switch mutes Web Audio
// unless the session is "playback" and a silent <audio> element keeps playing.
import { latencyMs } from '../store.js';

let ac = null, master = null, bus = null, silentEl = null;

function silentWav() {
  const sr = 8000, n = 800, b = new Uint8Array(44 + n), dv = new DataView(b.buffer);
  const w = (o, s) => { for (let k = 0; k < s.length; k++) b[o + k] = s.charCodeAt(k); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr, true);
  dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); w(36, 'data'); dv.setUint32(40, n, true); b.fill(128, 44);
  let bin = ''; b.forEach((x) => { bin += String.fromCharCode(x); });
  return 'data:audio/wav;base64,' + btoa(bin);
}

/** Call from a user gesture. Returns false when the browser has no Web Audio. */
export function ensureAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
  try {
    if (!silentEl) {
      silentEl = document.createElement('audio');
      silentEl.src = silentWav(); silentEl.loop = true;
      silentEl.setAttribute('playsinline', ''); silentEl.setAttribute('webkit-playsinline', '');
    }
    if (silentEl.paused) { const p = silentEl.play(); if (p && p.catch) p.catch(() => {}); }
  } catch (e) { /* autoplay blocked: Web Audio may still work */ }
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    master = ac.createGain(); master.gain.value = 0.7; master.connect(comp); comp.connect(ac.destination);
    newBus();
    const sb = ac.createBufferSource(); sb.buffer = ac.createBuffer(1, 1, 22050); sb.connect(ac.destination); sb.start(0);
    if (wanted) preloadPiano(wanted[0], wanted[1]);
    if (saxWanted) preloadSax(saxWanted[0], saxWanted[1]);
    voiceWanted.forEach((name) => preloadVoice(name));
  }
  if (ac.state !== 'running') { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); }
  return true;
}

function newBus() { bus = ac.createGain(); bus.connect(master); }

/** Cut everything already scheduled. */
export function hush() { if (!ac) return; bus.gain.setTargetAtTime(0, ac.currentTime, 0.02); newBus(); }

export const now = () => (ac ? ac.currentTime : 0);
export const outputLatency = () => (ac && ac.outputLatency) || 0;
export const ready = () => !!ac;

// ---------- sampled grand piano (Salamander Grand Piano, Alexander Holm, CC-BY 3.0) ----------
// Samples every minor third (C, D#, F#, A) from C1 to C7; other notes are pitch-shifted from the nearest one.
const SAMPLE_NAMES = { 0: 'C', 3: 'Ds', 6: 'Fs', 9: 'A' };
const SAMPLE_DIR = new URL('../../samples/piano/', import.meta.url);
const buffers = new Map(); // midi -> AudioBuffer
const loading = new Map(); // midi -> Promise
const sampleFor = (m) => { const base = Math.round(m / 3) * 3; return Math.max(24, Math.min(96, base)); };

function loadSample(sm) {
  if (buffers.has(sm) || loading.has(sm) || !ac) return loading.get(sm);
  const name = SAMPLE_NAMES[sm % 12] + (Math.floor(sm / 12) - 1);
  const pr = fetch(new URL(name + '.mp3', SAMPLE_DIR))
    .then((r) => { if (!r.ok) throw new Error(name + ': HTTP ' + r.status); return r.arrayBuffer(); })
    .then((ab) => new Promise((res, rej) => ac.decodeAudioData(ab, res, rej)))
    .then((buf) => { buffers.set(sm, buf); })
    .catch((err) => { console.warn('piano sample', err); })
    .finally(() => loading.delete(sm));
  loading.set(sm, pr);
  return pr;
}
let wanted = null;
/** Load the samples needed for a pitch range (MIDI numbers). Safe to call before audio is unlocked. */
export function preloadPiano(lo, hi) {
  wanted = [lo, hi];
  if (!ac) return Promise.resolve();
  const jobs = [];
  for (let m = sampleFor(lo); m <= sampleFor(hi); m += 3) jobs.push(loadSample(m));
  return Promise.all(jobs);
}
export const pianoReady = (m) => buffers.has(sampleFor(m));

function sampledNote(m, t, dur, vel) {
  const sm = sampleFor(m), buf = buffers.get(sm);
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = buf;
  src.playbackRate.value = Math.pow(2, (m - sm) / 12);
  const peak = Math.min(1.2, vel * 1.9);
  g.gain.setValueAtTime(peak, t);
  g.gain.setTargetAtTime(0.0001, t + dur, 0.09); // key release
  src.connect(g); g.connect(bus);
  src.start(t); src.stop(t + dur + 1);
}

export function pianoNote(m, t, dur, vel) {
  if (!ac) return;
  if (buffers.has(sampleFor(m))) { sampledNote(m, t, dur, vel); return; }
  loadSample(sampleFor(m));
  const f = 440 * Math.pow(2, (m - 69) / 12);
  const g = ac.createGain(), lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 2.5), t + 0.35);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
  g.gain.exponentialRampToValueAtTime(Math.max(vel * 0.4, 0.0002), t + Math.min(0.15, dur));
  g.gain.setTargetAtTime(0.0001, t + dur, 0.035);
  [['triangle', 1, 1], ['sine', 2, 0.3], ['sine', 3, 0.1]].forEach(([type, mul, amp]) => {
    const o = ac.createOscillator(), og = ac.createGain();
    o.type = type; o.frequency.value = f * mul; og.gain.value = amp * 0.35;
    o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.4);
  });
  lp.connect(g); g.connect(bus);
}

// ---------- sampled tenor saxophone (MTG Solo Saxophones, tenor, f layer; CC BY 4.0, see app/samples/sax/CREDITS.md) ----------
// One sample per key, MIDI 44..76 (3 s, mono); map.json gives each key's tuning (cents) and level (dB). A note outside the
// range is moved by octaves into it. Until its sample (and the map) has loaded, a note falls back to the piano: never a synth sax.
export const SAX_LO = 44, SAX_HI = 76;
const SAX_DIR = new URL('../../samples/sax/', import.meta.url);
const saxBufs = new Map(); // midi -> AudioBuffer
const saxLoading = new Map(); // midi -> Promise
let saxMap = null, saxMapLoading = null, saxWanted = null;
const saxKey = (m) => { let x = Math.round(m); while (x < SAX_LO) x += 12; while (x > SAX_HI) x -= 12; return x; };
function loadSaxMap() {
  if (saxMap || saxMapLoading || !ac) return saxMapLoading;
  saxMapLoading = fetch(new URL('map.json', SAX_DIR))
    .then((r) => { if (!r.ok) throw new Error('sax map: HTTP ' + r.status); return r.json(); })
    .then((j) => { saxMap = j.keys || {}; })
    .catch((err) => { console.warn('sax map', err); })
    .finally(() => { saxMapLoading = null; });
  return saxMapLoading;
}
function loadSax(k) {
  if (saxBufs.has(k) || saxLoading.has(k) || !ac) return saxLoading.get(k);
  const pr = fetch(new URL(k + '.mp3', SAX_DIR))
    .then((r) => { if (!r.ok) throw new Error(k + ': HTTP ' + r.status); return r.arrayBuffer(); })
    .then((ab) => new Promise((res, rej) => ac.decodeAudioData(ab, res, rej)))
    .then((buf) => { saxBufs.set(k, buf); })
    .catch((err) => { console.warn('sax sample', err); })
    .finally(() => saxLoading.delete(k));
  saxLoading.set(k, pr);
  return pr;
}
/** Load the sax samples for a pitch range (MIDI numbers, moved into 44..76). Safe to call before audio is unlocked. */
export function preloadSax(lo = SAX_LO, hi = SAX_HI) {
  saxWanted = [lo, hi];
  if (!ac) return Promise.resolve();
  const jobs = [loadSaxMap()];
  const ks = new Set();
  for (let m = lo; m <= hi; m++) ks.add(saxKey(m));
  ks.forEach((k) => jobs.push(loadSax(k)));
  return Promise.all(jobs);
}
/** The sample for this pitch and the tuning map have arrived. */
export const saxReady = (m) => !!saxMap && saxBufs.has(saxKey(m));
/** A tenor sax note: vel 0..1, a 25 ms attack and an 80 ms release at t + dur; falls back to pianoNote until loaded. */
export function saxNote(m, t, dur, vel) {
  if (!ac) return;
  const k = saxKey(m);
  if (!saxReady(k)) { loadSaxMap(); loadSax(k); pianoNote(m, t, dur, vel); return; }
  const info = saxMap[String(k)] || {};
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = saxBufs.get(k);
  src.detune.value = info.tune || 0;
  const peak = Math.min(1.5, vel * Math.pow(10, (info.vol || 0) / 20));
  const end = t + Math.max(0.05, dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.025);
  g.gain.setValueAtTime(peak, end);
  g.gain.linearRampToValueAtTime(0.0001, end + 0.08);
  src.connect(g); g.connect(bus);
  src.start(t); src.stop(end + 0.1);
}

// ---------- sparse sampled voices: double bass and clarinet ----------
// Double bass, pizzicato: Meatbass (Karoryfer Samples), CC0, a sample every minor third. Clarinet: VSCO 2 Community Edition
// (Versilian Studios), CC0, ten notes. A note takes the nearest sampled key, pitch-shifted; map.json gives each key its
// tuning (cents) and level (dB). Until the map and the samples have loaded a note falls back to the piano: never a synth.
const VOICES = {
  bass: { dir: 'bass', attack: 0.004, release: 0.12, gain: 1.5 },
  clarinet: { dir: 'clarinet', attack: 0.03, release: 0.09, gain: 1 }
};
const voiceState = {}; // name -> { map, keys: [midi], bufs: Map, loading: Promise | null }
const voiceWanted = new Set();
/** Load a voice (its map and every sample: there are few). Safe to call before audio is unlocked. */
export function preloadVoice(name) {
  const def = VOICES[name];
  if (!def) return Promise.resolve();
  voiceWanted.add(name);
  if (!ac) return Promise.resolve();
  const vs = voiceState[name] || (voiceState[name] = { map: null, keys: [], bufs: new Map(), loading: null });
  if (vs.map || vs.loading) return vs.loading || Promise.resolve();
  const dir = new URL(`../../samples/${def.dir}/`, import.meta.url);
  vs.loading = fetch(new URL('map.json', dir))
    .then((r) => { if (!r.ok) throw new Error(name + ' map: HTTP ' + r.status); return r.json(); })
    .then((j) => {
      const keys = Object.keys(j.keys || {}).map(Number).sort((x, y) => x - y);
      return Promise.all(keys.map((k) => fetch(new URL(k + '.mp3', dir))
        .then((r) => { if (!r.ok) throw new Error(name + ' ' + k + ': HTTP ' + r.status); return r.arrayBuffer(); })
        .then((ab) => new Promise((res, rej) => ac.decodeAudioData(ab, res, rej)))
        .then((buf) => { vs.bufs.set(k, buf); })))
        .then(() => { vs.keys = keys; vs.map = j.keys; });
    })
    .catch((err) => { console.warn(name + ' samples', err); })
    .finally(() => { vs.loading = null; });
  return vs.loading;
}
export const voiceReady = (name) => !!(voiceState[name] && voiceState[name].map);
/** A note of a sampled voice: vel 0..1; falls back to pianoNote until the voice has loaded. */
export function voiceNote(name, m, t, dur, vel) {
  if (!ac) return;
  const def = VOICES[name], vs = voiceState[name];
  if (!def || !vs || !vs.map) { preloadVoice(name); pianoNote(m, t, dur, vel); return; }
  const k = vs.keys.reduce((best, x) => (Math.abs(x - m) < Math.abs(best - m) ? x : best), vs.keys[0]);
  const info = vs.map[String(k)] || {};
  const src = ac.createBufferSource(), g = ac.createGain();
  src.buffer = vs.bufs.get(k);
  src.playbackRate.value = Math.pow(2, (m - k) / 12);
  src.detune.value = info.tune || 0;
  const peak = Math.min(4, vel * def.gain * Math.pow(10, (info.vol || 0) / 20)); // quiet samples take up to +12 dB
  const end = t + Math.max(0.05, dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + def.attack);
  g.gain.setValueAtTime(peak, end);
  g.gain.linearRampToValueAtTime(0.0001, end + def.release);
  src.connect(g); g.connect(bus);
  src.start(t); src.stop(end + def.release + 0.05);
}
export const bassNote = (m, t, dur, vel) => voiceNote('bass', m, t, dur, vel);
export const clarinetNote = (m, t, dur, vel) => voiceNote('clarinet', m, t, dur, vel);

export function click(t, strong) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square'; o.frequency.value = strong ? 1600 : 1050;
  g.gain.setValueAtTime(strong ? 0.18 : 0.1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.05);
}

// ---------- drums (synthesised, no samples): ride, hi-hat foot "chick", soft kick, rim, shaker ----------
let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
function noiseHit(t, { type, freq, q = 1, gain, decay, len }) {
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = noise(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(f); f.connect(g); g.connect(bus); src.start(t, Math.random()); src.stop(t + len);
}
/** kind: 'ride' | 'hat' | 'kick' | 'rim' | 'shaker'; vel 0..1 */
export function drum(kind, t, vel = 0.7) {
  if (!ac) return;
  if (kind === 'ride') {
    noiseHit(t, { type: 'highpass', freq: 6500, gain: 0.11 * vel, decay: 0.9, len: 1 });
    const o = ac.createOscillator(), g = ac.createGain(); // bell "ping"
    o.type = 'sine'; o.frequency.value = 3350;
    g.gain.setValueAtTime(0.025 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.55);
  } else if (kind === 'hat') {
    noiseHit(t, { type: 'bandpass', freq: 8000, q: 0.8, gain: 0.16 * vel, decay: 0.06, len: 0.1 });
  } else if (kind === 'kick') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.32);
  } else if (kind === 'shaker') { // soft, short, brighter than the hat foot
    noiseHit(t, { type: 'highpass', freq: 7000, q: 0.7, gain: 0.07 * vel, decay: 0.045, len: 0.08 });
  } else if (kind === 'rim') {
    noiseHit(t, { type: 'bandpass', freq: 1800, q: 4, gain: 0.25 * vel, decay: 0.05, len: 0.08 });
  }
}

/** Convert a DOM/MIDI event timestamp (performance.now() ms) to the audio clock. Every scored input goes through here:
 *  the output latency (we hear the band late) and the user's timing offset (settings.latencyMs: the notes arrive late,
 *  e.g. over Bluetooth MIDI) are both taken off. */
export function toAudioTime(ts) {
  const nowMs = performance.now();
  if (!(ts > 0) || ts > nowMs + 50 || ts < nowMs - 2000) ts = nowMs;
  return now() - (nowMs - ts) / 1000 - outputLatency() - latencyMs() / 1000;
}

// Keep the context alive across taps and tab switches.
['touchend', 'click', 'keydown'].forEach((t) => document.addEventListener(t, () => { if (ac) ensureAudio(); }, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ac && ac.state !== 'running') ac.resume().catch(() => {});
});
