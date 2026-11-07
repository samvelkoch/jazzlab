// Colour schemes: every scheme defines the same tokens in light and dark, swatches match the CSS,
// names exist in ru and en, text colours keep WCAG AA. Run: node tests/theme.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMES } from '../app/js/theme.js';

const css = readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../app/js/i18n.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// the token blocks: bossa lives on :root, the others on :root[data-scheme="x"]
function tokens(selector) {
  const i = css.indexOf(selector + ' {');
  assert.ok(i >= 0, 'missing block ' + selector);
  const body = css.slice(i, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const blocks = {};
for (const sc of Object.keys(SCHEMES)) {
  blocks[sc] = sc === 'bossa'
    ? { light: tokens(':root'), dark: tokens(':root[data-theme="dark"]') }
    : { light: tokens(`:root[data-scheme="${sc}"]:not([data-theme="dark"])`), dark: tokens(`:root[data-scheme="${sc}"][data-theme="dark"]`) };
}

const COLOURS = ['bg', 'panel', 'sub', 'fg', 'muted', 'line', 'accent', 'accent-fg', 'hero', 'hero-fg', 'cta', 'cta-fg', 'rh', 'rh-soft', 'lh', 'lh-soft',
  'ok', 'ok-soft', 'meh', 'meh-soft', 'bad', 'bad-soft', 'none', 'paper', 'staff', 'band', 'ivory', 'ivory-edge', 'ebony', 'ebony-top', 'lbl'];
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

assert.deepEqual(Object.keys(SCHEMES), ['bossa', 'studio', 'club', 'bluenote', 'vinyl']);
for (const sc of Object.keys(SCHEMES)) {
  assert.ok(new RegExp(`scheme_${sc}: '[^']+'`, 'g').test(i18n) && i18n.match(new RegExp(`scheme_${sc}:`, 'g')).length === 2, 'ru + en name for ' + sc);
  for (const th of ['light', 'dark']) {
    const tk = blocks[sc][th], id = `${sc}/${th}`;
    for (const k of COLOURS) assert.ok(tk[k], `${id}: token --${k}`);
    // swatches: [page colour, accent, second] and the theme-color meta come from the same palette
    assert.equal(SCHEMES[sc][th][0], tk.bg, id + ' swatch 0 = --bg');
    assert.equal(SCHEMES[sc][th][1], tk.accent, id + ' swatch 1 = --accent');
    // text on surfaces: body text 4.5, accent as text 4.5, buttons 4.5, status colours as text on the panel and on their soft fill
    for (const bgk of ['bg', 'panel', 'sub']) {
      assert.ok(ratio(tk.fg, tk[bgk]) >= 4.5, `${id}: fg on ${bgk}`);
      assert.ok(ratio(tk.muted, tk[bgk]) >= 4.5, `${id}: muted on ${bgk}`);
    }
    assert.ok(ratio(tk.accent, tk.bg) >= 4.5 && ratio(tk.accent, tk.panel) >= 4.5, `${id}: accent as text`);
    assert.ok(ratio(tk['accent-fg'], tk.accent) >= 4.5, `${id}: text on the accent button`);
    assert.ok(ratio(tk['hero-fg'], tk.hero) >= 4.5, `${id}: hero text`);
    assert.ok(ratio(tk['cta-fg'], tk.cta) >= 4.5 && ratio(tk.cta, tk.hero) >= 3, `${id}: hero button`);
    for (const k of ['ok', 'meh', 'bad']) {
      assert.ok(ratio(tk[k], tk.panel) >= 4.5 && ratio(tk[k], tk[k + '-soft']) >= 4.5, `${id}: ${k}`);
    }
    assert.ok(ratio(tk.lbl, tk.ivory) >= 4.5, `${id}: key labels`);
    for (const k of ['rh', 'lh']) assert.ok(ratio(tk[k], tk.panel) >= 4.5 && ratio(tk[k], tk.paper) >= 3, `${id}: ${k}`);
  }
}
// the pre-paint script must not hard-code the list of schemes
assert.ok(!/sc === 'studio'/.test(html), 'index.html: no scheme whitelist');
console.log('theme ok');
