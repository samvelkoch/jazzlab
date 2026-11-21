// Headings, captions, buttons and tabs are set in capitals (text-transform: uppercase, app.css), but a chord symbol or
// a roman numeral changes meaning in capitals: Dm7 is not DM7, Bb7 is not BB7, ii–V–I is not II–V–I. This keeps such
// tokens in their own case: inside any uppercase element each one is wrapped in <span class="nc"> (text-transform: none).
// Presentation only: the text itself (textContent) does not change.

// a chord symbol with a lowercase part (quality, flat as «b», extensions): Dm7, Bb7, Cmaj7, Dm7b5, Ebmaj7(#11), F/Ab;
// a roman numeral with a lowercase part: ii, iii, iv, vi, vii, iiø7, vii°
const CHORD = '[A-G](?:b|#|♭|♯)?(?:maj|min|dim|aug|sus|m|ø|°|\\+)?(?:[0-9]+|b[0-9]+|#[0-9]+|♭[0-9]+|♯[0-9]+|\\([^)]*\\))*(?:\\/[A-G](?:b|#|♭|♯)?)?';
const ROMAN = '(?:vii|iii|ii|iv|vi)(?:ø7?|°7?|7|maj7)?';
const TOKEN = new RegExp(`(?<![\\p{L}\\p{N}])(?:${CHORD}|${ROMAN})(?![\\p{L}\\p{N}])`, 'gu');

/** The [start, end) ranges of the tokens to keep in their own case (only those with a lowercase letter). */
export function protectedRanges(text) {
  const out = [];
  for (const m of text.matchAll(TOKEN)) if (/[a-zø°]/.test(m[0]) && m[0].length > 1) out.push([m.index, m.index + m[0].length]);
  return out;
}

function wrapText(node) {
  const text = node.nodeValue, rs = protectedRanges(text);
  if (!rs.length) return;
  const frag = document.createDocumentFragment();
  let at = 0;
  for (const [a, b] of rs) {
    if (a > at) frag.append(text.slice(at, a));
    const s = document.createElement('span');
    s.className = 'nc';
    s.textContent = text.slice(a, b);
    frag.append(s);
    at = b;
  }
  if (at < text.length) frag.append(text.slice(at));
  node.replaceWith(frag);
}

// a text node in capitals (any element whose computed text-transform is uppercase: headings, captions, buttons, tabs)
function consider(node) {
  const el = node.parentElement;
  if (!el || !node.nodeValue || el.closest('.nc') || !protectedRanges(node.nodeValue).length) return;
  if (getComputedStyle(el).textTransform === 'uppercase') wrapText(node);
}
function scan(node) {
  if (node.nodeType === 3) { consider(node); return; }
  if (node.nodeType !== 1) return;
  const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walk.nextNode()) nodes.push(walk.currentNode);
  nodes.forEach(consider);
}

/** Keep `root` protected: the whole tree once, then every node a screen adds or rewrites (only text that holds a
 *  token is looked at, and only its element's style is read). */
export function watchCaps(root) {
  new MutationObserver((records) => records.forEach((r) => (r.type === 'characterData' ? consider(r.target) : r.addedNodes.forEach(scan))))
    .observe(root, { childList: true, subtree: true, characterData: true });
  scan(root);
}
