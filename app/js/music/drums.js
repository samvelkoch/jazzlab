// Drummer for a 4/4 bar, one call per eighth slot (0..7).
// swing = ride "ding ding-a ding ding-a" + hi-hat foot on 2 and 4 + feathered kick;
// straight = ride eighths, hat on 2 and 4, kick on 1 and 3.
import * as audio from './audio.js';

export function groove(slot, time, swing) {
  const beatN = slot >> 1, off = slot % 2 === 1;
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
