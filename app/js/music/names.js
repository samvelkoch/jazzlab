// Note-name mode (settings.names, chosen in the appearance popover): 'en' C D E · 'ru' До Ре Ми · 'both' C (До) · 'off'.
// Each place that shows a name asks for the form that fits it (pure, no DOM):
//   'text'  a sentence or a prompt that must name the note: 'off' → letters; 'both' as is («C (До)»).
//   'short' a narrow place that must name the note (a strip slot, a chip, a row label): 'off' and 'both' → letters.
//   'key'   a label that may be hidden (keyboard keys, the names under the staff): 'off' stays 'off'; 'both' → letters.
//   'opt'   a narrow optional name (the lick's note chips): null when 'off'; 'both' → letters.
// Chord symbols (C7, F7) are not note names and always stay letters. Unknown or missing values count as 'en'.
import { noteName } from './notes.js';

export const NAME_MODES = ['en', 'ru', 'both', 'off'];

/** The stored mode, 'en' when missing or unknown. */
export const storedMode = (settings) => (settings && NAME_MODES.includes(settings.names) ? settings.names : 'en');

/** The mode to use in a context: 'text' | 'short' | 'key' | 'opt' (see above). */
export function nameMode(settings, ctx = 'text') {
  const m = storedMode(settings);
  if (ctx === 'text') return m === 'off' ? 'en' : m;
  if (ctx === 'key') return m === 'both' ? 'en' : m;
  if (ctx === 'opt') return m === 'off' ? null : m === 'both' ? 'en' : m;
  return m === 'off' || m === 'both' ? 'en' : m; // 'short'
}

/** A note name inside a sentence (n = a spelled pitch with octave, 'Eb4'): Russian names in lower case in a Russian
 *  sentence («нужна ми♭»), 'both' as «E♭ (ми♭)»; mode null / 'off' → letters. */
export function nameInText(n, mode, lang = 'ru') {
  const ru = () => (lang === 'ru' ? noteName(n, 'ru').toLowerCase() : noteName(n, 'ru'));
  if (mode === 'ru') return ru();
  if (mode === 'both') return `${noteName(n, 'en')} (${ru()})`;
  return noteName(n, 'en');
}
