// Web MIDI input (digital piano). On iPad Safari has no Web MIDI: open the site in the MIDIWeb app,
// which exposes the standard navigator.requestMIDIAccess (+ optional window.midiweb.openBluetoothMIDI()).
const listeners = new Set();
const stateListeners = new Set();
let access = null;
let state = { supported: !!navigator.requestMIDIAccess, connected: false, names: [], error: null };

export const midiState = () => state;
export function onNote(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onMidiState(fn) { stateListeners.add(fn); fn(state); return () => stateListeners.delete(fn); }
function setState(patch) { state = { ...state, ...patch }; stateListeners.forEach((f) => f(state)); }

function handle(e) {
  const d = e.data;
  if (!d || d.length < 3) return;
  const cmd = d[0] & 0xf0;
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
  setState({ connected: names.length > 0, names, error: null });
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
