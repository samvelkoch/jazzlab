// Appearance: palette ("scheme") + light / dark. Palettes live in app/css/app.css.
import { store } from './store.js';

// [page colour (also <meta name="theme-color">), accent, second swatch] per scheme and theme.
export const SCHEMES = {
  bossa: { light: ['#f3efe6', '#0f766e', '#1f5fbf'], dark: ['#0f1514', '#2dd4bf', '#7aa7f5'] },
  studio: { light: ['#eef0f4', '#ad4f08', '#2563c9'], dark: ['#12141a', '#f39a45', '#6aa0f5'] },
  club: { light: ['#f1ebdf', '#8a5a0a', '#b3261e'], dark: ['#131211', '#dca845', '#ff6a52'] },
  bluenote: { light: ['#f3eee0', '#b4460a', '#0f2a52'], dark: ['#0a1830', '#ff8b3d', '#86b4ff'] },
  vinyl: { light: ['#efe3c6', '#8e1c34', '#1a1411'], dark: ['#0e0c0b', '#e0627a', '#f3e8d0'] }
};
export function currentTheme() {
  const saved = store.get('theme', null);
  return saved === 'dark' ? 'dark' : 'light';
}
export function currentScheme() {
  const s = store.get('scheme', null);
  return SCHEMES[s] ? s : 'bossa';
}
export function applyTheme(th = currentTheme(), sc = currentScheme()) {
  document.documentElement.dataset.theme = th;
  document.documentElement.dataset.scheme = sc;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = SCHEMES[sc][th][0];
}
export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  store.set('theme', next);
  applyTheme(next);
  return next;
}
export function setScheme(sc) {
  if (!SCHEMES[sc]) return;
  store.set('scheme', sc);
  applyTheme();
}
