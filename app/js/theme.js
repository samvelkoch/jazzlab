// Appearance: palette ("scheme") + light / dark. Palettes live in app/css/app.css.
import { store } from './store.js';

export const SCHEMES = {
  bossa: { light: ['#f3efe6', '#0f766e', '#1f5fbf'], dark: ['#0f1514', '#2dd4bf', '#7aa7f5'] },
  studio: { light: ['#eef0f4', '#c25e0a', '#2563c9'], dark: ['#12141a', '#f39a45', '#6aa0f5'] },
  club: { light: ['#e9ecf2', '#1e3a6e', '#2f5fd0'], dark: ['#0a1120', '#e6b85c', '#7aa7ff'] }
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
