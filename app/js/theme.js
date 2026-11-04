// Light / dark theme. The palette ("Босса": sand + sea green) lives in app/css/app.css.
import { store } from './store.js';

export function currentTheme() {
  const saved = store.get('theme', null);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'light';
}
export function applyTheme(th) {
  document.documentElement.dataset.theme = th;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = th === 'dark' ? '#0f1514' : '#f3efe6';
}
export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  store.set('theme', next);
  applyTheme(next);
  return next;
}
