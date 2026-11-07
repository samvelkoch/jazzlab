// Drummer for a 4/4 bar, one call per eighth slot (0..7).
// swing = ride "ding ding-a ding ding-a" + hi-hat foot on 2 and 4 + feathered kick;
// straight = ride eighths, hat on 2 and 4, kick on 1 and 3;
// style 'bossa' = a 2-bar bossa nova groove (straight eighths, `swing` is ignored):
//   shaker on every eighth (light, the off-beats a little softer),
//   bass drum on 1, the "and" of 2, 3 and the "and" of 4 (slots 0, 3, 4, 7: the dotted-quarter + eighth "heartbeat"),
//   rim click on the bossa clave over two bars (3-2): bar A slots 0, 3, 6; bar B slots 2, 5
//   (= 16th-grid positions 1, 4, 7 | 11, 14 of the clave written in 2/4; the son clave would put the last stroke on slot 4).
// bar = the 0-based bar index from the start of the run; its parity picks bar A (even) or bar B (odd) of the clave.
import * as audio from './audio.js';

export const BOSSA_KICK = [0, 3, 4, 7];
export const BOSSA_CLAVE = [[0, 3, 6], [2, 5]];

export function groove(slot, time, { swing = false, style = null, bar = 0 } = {}) {
  const beatN = slot >> 1, off = slot % 2 === 1;
  if (style === 'bossa') {
    audio.drum('shaker', time, off ? 0.4 : 0.55);
    if (BOSSA_KICK.includes(slot)) audio.drum('kick', time, slot === 0 || slot === 4 ? 0.5 : 0.35);
    if (BOSSA_CLAVE[((bar % 2) + 2) % 2].includes(slot)) audio.drum('rim', time, 0.6);
    return;
  }
  if (swing) {
    if (!off || beatN % 2 === 1) audio.drum('ride', time, off ? 0.55 : beatN % 2 ? 0.9 : 0.75);
    if (!off && beatN % 2 === 1) audio.drum('hat', time, 0.9);
    if (!off) audio.drum('kick', time, 0.25);
  } else {
    audio.drum('ride', time, off ? 0.5 : 0.8);
    if (!off && beatN % 2 === 1) audio.drum('hat', time, 0.9);
    if (!off && beatN % 2 === 0) audio.drum('kick', time, beatN === 0 ? 0.6 : 0.45);
  }
}
