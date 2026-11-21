// Display headings are set in capitals (text-transform: uppercase, app.css), but a chord symbol or a roman numeral
// changes meaning in capitals: Dm7 is not DM7, Bb7 is not BB7, ii–V–I is not II–V–I. This keeps such tokens in
// their own case: inside the uppercase headings (CAPS) each one is wrapped in <span class="nc"> (text-transform: none).
// Presentation only: the text itself (textContent) does not change.

// a chord symbol with a lowercase part (quality, flat as «b», extensions): Dm7, Bb7, Cmaj7, Dm7b5, Ebmaj7(#11), F/Ab;
// a roman numeral with a lowercase part: ii, iii, iv, vi, vii, iiø7, viio
const CHORD = '[A-G](?:b|#|♭|♯)?(?:maj|min|dim|aug|sus|m|ø|°|o|\\+)?(?:[0-9]+|b[0-9]+|#[0-9]+|♭[0-9]+|♯[0-9]+|\\([^)]*\\))*(?:\\/[A-G](?:b|#|♭|♯)?)?';
const ROMAN = '(?:vii|iii|ii|iv|vi)(?:ø7?|°7?|7|maj7)?';
const TOKEN = new RegExp(`(?<![\\p{L}\\p{N}])(?:${CHORD}|${ROMAN})(?![\\p{L}\\p{N}])`, 'gu');

/** The [start, end) ranges of the tokens to keep in their own case (only those with a lowercase letter). */
export function protectedRanges(text) {
  const out = [];
  for (const m of text.matchAll(TOKEN)) if (/[a-zø°]/.test(m[0]) && m[0].length > 1) out.push([m.index, m.index + m[0].length]);
  return out;
}

// the headings that are set in capitals and can carry content text (titles, goals, prompts)
export const CAPS = ['h1', 'h2', 'h3', '.titles .title', '.itemtitle', '.steptitle', '.herotitle', '.ertitle', '.lqturn', '.qaask b',
  '.wikicardtext b', '.ctile b', '.term-title', '.dname b', '.lm b', '.kfb b', '.padtext b', '.cyc b', '.lqcell b', '.qapair b'].join(', ');

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

/** Wrap the tokens in every uppercase heading under `root` (idempotent: text already inside .nc is skipped). */
export function protectCaps(root) {
  root.querySelectorAll(CAPS).forEach((el) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest('.nc') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    nodes.forEach(wrapText);
  });
}

/** Keep `root` protected as screens render and update: one pass per batch of DOM changes (a microtask, so also in a
 *  background tab; the pass's own wrapping triggers one more, empty, pass). */
export function watchCaps(root) {
  new MutationObserver(() => protectCaps(root)).observe(root, { childList: true, subtree: true, characterData: true });
  protectCaps(root);
}
