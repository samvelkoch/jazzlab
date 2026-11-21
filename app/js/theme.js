// Appearance: light / dark of the one palette «cover» (app/css/app.css). SCHEMES keeps its shape for a later palette.
import { store } from './store.js';

// [page colour (also <meta name="theme-color">), accent, hot] per theme.
export const SCHEMES = {
  cover: { light: ['#ffffff', '#111111', '#ffd400'], dark: ['#0e0e0f', '#f3f2ed', '#ffd400'] }
};
export function currentTheme() {
  const saved = store.get('theme', null);
  return saved === 'dark' ? 'dark' : 'light';
}
export function currentScheme() {
  const s = store.get('scheme', null);
  return SCHEMES[s] ? s : 'cover'; // a saved scheme that no longer exists is ignored
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
