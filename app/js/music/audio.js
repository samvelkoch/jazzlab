// Web Audio synth: a soft piano-like voice + metronome click.
// iOS/iPadOS: audio must be unlocked inside a tap, and the ring/silent switch mutes Web Audio
// unless the session is "playback" and a silent <audio> element keeps playing.
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

export function pianoNote(m, t, dur, vel) {
  if (!ac) return;
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

export function click(t, strong) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square'; o.frequency.value = strong ? 1600 : 1050;
  g.gain.setValueAtTime(strong ? 0.18 : 0.1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.05);
}

/** Convert a DOM/MIDI event timestamp (performance.now() ms) to the audio clock. */
export function toAudioTime(ts) {
  const nowMs = performance.now();
  if (!(ts > 0) || ts > nowMs + 50 || ts < nowMs - 2000) ts = nowMs;
  return now() - (nowMs - ts) / 1000 - outputLatency();
}

// Keep the context alive across taps and tab switches.
['touchend', 'click', 'keydown'].forEach((t) => document.addEventListener(t, () => { if (ac) ensureAudio(); }, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ac && ac.state !== 'running') ac.resume().catch(() => {});
});
