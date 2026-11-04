// Web MIDI input (digital piano). On iPad Safari has no Web MIDI: open the site in the MIDIWeb app,
// which exposes the standard navigator.requestMIDIAccess (+ optional window.midiweb.openBluetoothMIDI()).
const listeners = new Set();
const stateListeners = new Set();
let access = null;
let outputs = [];
let state = { supported: !!navigator.requestMIDIAccess, connected: false, names: [], error: null, canPlay: false };
// notes we sent to the piano recently: ignore them if the piano echoes them back on its output
const sent = new Map();

export const midiState = () => state;
export function onNote(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onMidiState(fn) { stateListeners.add(fn); fn(state); return () => stateListeners.delete(fn); }
function setState(patch) { state = { ...state, ...patch }; stateListeners.forEach((f) => f(state)); }

function handle(e) {
  const d = e.data;
  if (!d || d.length < 3) return;
  const cmd = d[0] & 0xf0;
  if (cmd === 0x90 && d[2] > 0 && Math.abs((sent.get(d[1]) || -1e9) - e.timeStamp) < 40) return;
  if (cmd === 0x90 && d[2] > 0) listeners.forEach((f) => f({ type: 'on', note: d[1], vel: d[2], ts: e.timeStamp }));
  else if (cmd === 0x80 || (cmd === 0x90 && d[2] === 0)) listeners.forEach((f) => f({ type: 'off', note: d[1], ts: e.timeStamp }));
}

function bind() {
  const ins = typeof access.inputs === 'function' ? access.inputs() : access.inputs;
  const names = [];
  for (const inp of (ins.values ? ins.values() : ins)) {
    if (inp.state === 'disconnected') continue;
    inp.onmidimessage = handle;
    names.push(inp.name || 'MIDI');
  }
  const outs = typeof access.outputs === 'function' ? access.outputs() : access.outputs;
  outputs = [];
  if (outs) for (const o of (outs.values ? outs.values() : outs)) if (o.state !== 'disconnected') outputs.push(o);
  // prefer the output that belongs to the connected piano
  outputs.sort((a, b) => (names.includes(b.name) ? 1 : 0) - (names.includes(a.name) ? 1 : 0));
  setState({ connected: names.length > 0, names, error: null, canPlay: outputs.length > 0 });
}

/** Play a note on the connected piano. onMs/offMs are performance.now() times (may be in the future). */
export function sendNote(note, vel, onMs, offMs) {
  const o = outputs[0];
  if (!o) return false;
  try {
    o.send([0x90, note, Math.max(1, Math.min(127, Math.round(vel)))], onMs);
    o.send([0x80, note, 0], offMs);
    sent.set(note, onMs);
    return true;
  } catch (err) { console.warn('MIDI send failed', err); return false; }
}
/** Stop everything we scheduled on the piano. */
export function silence() {
  outputs.forEach((o) => {
    try { if (typeof o.clear === 'function') o.clear(); o.send([0xb0, 123, 0]); o.send([0xb0, 64, 0]); } catch (err) { /* ignore */ }
  });
}

const bt = () => window.midiweb && typeof window.midiweb.openBluetoothMIDI === 'function';

/** fromTap: called from a button press (may show a permission prompt / Bluetooth dialog). */
export async function connect(fromTap) {
  if (access) { if (!state.connected && fromTap && bt()) window.midiweb.openBluetoothMIDI(); return; }
  if (!navigator.requestMIDIAccess) { if (fromTap) setState({ error: 'unsupported' }); return; }
  try { access = await navigator.requestMIDIAccess({ sysex: false }); }
  catch (err) { setState({ error: 'denied' }); return; }
  access.onstatechange = bind;
  bind();
  if (!state.connected && fromTap && bt()) window.midiweb.openBluetoothMIDI();
}

/** Connect silently when no prompt will appear (MIDIWeb, or permission already granted). */
export function autoConnect() {
  if (!navigator.requestMIDIAccess) return;
  const q = navigator.permissions && navigator.permissions.query ? navigator.permissions.query({ name: 'midi' }) : Promise.reject(new Error('no permissions API'));
  q.then((p) => { if (p.state === 'granted') connect(false); }, () => connect(false));
}
