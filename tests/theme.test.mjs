// The palette «cover»: the same tokens in light and dark, swatches match the CSS, the name exists in ru and en,
// text colours keep WCAG AA (also on the yellow «now» / primary block and on the light keys). Run: node tests/theme.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMES } from '../app/js/theme.js';

const css = readFileSync(new URL('../app/css/app.css', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../app/js/i18n.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// the token blocks: light on :root, dark on :root[data-theme="dark"]
function tokens(selector) {
  const i = css.indexOf(selector + ' {');
  assert.ok(i >= 0, 'missing block ' + selector);
  const body = css.slice(i, css.indexOf('}', i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const blocks = {};
for (const sc of Object.keys(SCHEMES)) {
  blocks[sc] = { light: tokens(':root'), dark: tokens(':root[data-theme="dark"]') };
}

const COLOURS = ['hot', 'hot-fg', 'rh-key', 'lh-key', 'key-ink', 'bg', 'panel', 'sub', 'fg', 'muted', 'line', 'accent', 'accent-fg', 'hero', 'hero-fg', 'cta', 'cta-fg', 'rh', 'rh-soft', 'lh', 'lh-soft',
  'ok', 'ok-soft', 'meh', 'meh-soft', 'bad', 'bad-soft', 'none', 'paper', 'staff', 'band', 'ivory', 'ivory-edge', 'ebony', 'ebony-top', 'lbl'];
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

assert.deepEqual(Object.keys(SCHEMES), ['cover']);
for (const sc of Object.keys(SCHEMES)) {
  assert.ok(new RegExp(`scheme_${sc}: '[^']+'`, 'g').test(i18n) && i18n.match(new RegExp(`scheme_${sc}:`, 'g')).length === 2, 'ru + en name for ' + sc);
  for (const th of ['light', 'dark']) {
    const tk = blocks[sc][th], id = `${sc}/${th}`;
    for (const k of COLOURS) assert.ok(tk[k], `${id}: token --${k}`);
    // swatches: [page colour, accent, second] and the theme-color meta come from the same palette
    assert.equal(SCHEMES[sc][th][0], tk.bg, id + ' swatch 0 = --bg');
    assert.equal(SCHEMES[sc][th][1], tk.accent, id + ' swatch 1 = --accent');
    assert.equal(SCHEMES[sc][th][2], tk.hot, id + ' swatch 2 = --hot');
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
    // yellow: ink on it (the «now» strip, the current cell, the primary block), and the ink button on it
    assert.ok(ratio(tk['hot-fg'], tk.hot) >= 4.5, `${id}: text on --hot`);
    assert.ok(ratio(tk['key-ink'], tk.hot) >= 4.5, `${id}: ink button on --hot`);
    // the keys are light in both themes: the hand fills keep 3:1 against the key, white finger squares / labels on them 4.5,
    // and the two hands stay apart from each other
    for (const k of ['rh-key', 'lh-key']) {
      assert.ok(ratio(tk[k], tk.ivory) >= 3, `${id}: ${k} on the key`);
      assert.ok(ratio('#ffffff', tk[k]) >= 4.5, `${id}: white on ${k}`);
    }
    assert.notEqual(tk['rh-key'], tk['lh-key'], `${id}: hands differ on the keys`);
    assert.ok(ratio('#ffffff', tk['key-ink']) >= 4.5, `${id}: white on --key-ink`);
  }
}
// the pre-paint script must not hard-code the list of schemes; the old schemes and the vignette are gone
assert.ok(!/sc === 'studio'/.test(html), 'index.html: no scheme whitelist');
assert.ok(!/data-scheme="/.test(css) && !/--vignette/.test(css), 'app.css: no per-scheme blocks, no vignette');
assert.ok(/Sofia\+Sans\+Extra\+Condensed/.test(html) && !/Unbounded|Manrope/.test(html), 'index.html: the cover fonts');
console.log('theme ok');
