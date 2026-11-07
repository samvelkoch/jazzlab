// Glossary: plain-language explanations of professional terms, shown where the terms appear.
//   loadGlossary()                 fetches content/glossary.json once (cached; a failure just means no marks)
//   findTerms(text, terms, lang)   pure (glossary-match.js): [{ start, end, id }] for the first occurrence of each term, no overlaps
//   markTerms(text, lang)          DocumentFragment: the text with those words wrapped in <button class="term">
//   explainTerm(id, anchorEl)      a small popover under the word (one at a time)
import { t, getLang } from './i18n.js';
import { findTerms } from './glossary-match.js';

export { findTerms };
// ---- data ----
let glossary = null, glossaryLoad = null;
const byId = new Map();
const baseUrl = new URL('../../content/', import.meta.url);

export function loadGlossary() {
  if (!glossaryLoad) {
    glossaryLoad = fetch(new URL('glossary.json', baseUrl))
      .then((r) => { if (!r.ok) throw new Error(`glossary.json: HTTP ${r.status}`); return r.json(); })
      .catch((e) => { console.warn(e); return { terms: [] }; })
      .then((g) => { glossary = g; byId.clear(); (g.terms || []).forEach((x) => byId.set(x.id, x)); return g; });
  }
  return glossaryLoad;
}

const pick = (v, lang) => (v && typeof v === 'object' ? v[lang] || v.ru || v.en || '' : v || '');

/** The text with its first glossary terms wrapped in a clickable word. `tag`: 'button' (default) or 'span' inside a link. */
export function markTerms(text, lang = getLang(), tag = 'button') {
  const frag = document.createDocumentFragment();
  const src = String(text || '');
  const ranges = glossary ? findTerms(src, glossary.terms, lang) : [];
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) frag.append(src.slice(at, r.start));
    const el = document.createElement(tag);
    el.className = 'term';
    el.dataset.term = r.id;
    if (tag === 'button') el.type = 'button'; else el.setAttribute('role', 'button');
    el.textContent = src.slice(r.start, r.end);
    frag.append(el);
    at = r.end;
  }
  if (at < src.length) frag.append(src.slice(at));
  return frag;
}

// ---- wiki link: only when content/wiki/index.json exists and lists the page ----
let wikiIds = null;
function wikiHas(id) {
  if (!wikiIds) {
    wikiIds = fetch(new URL('wiki/index.json', baseUrl))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && Array.isArray(j.groups)) return new Set(j.groups.flatMap((g) => g.ids || [])); // jazzlab-wiki-index/1
        const list = Array.isArray(j) ? j : j && (j.pages || j.entries || j.items || j.articles) ? (j.pages || j.entries || j.items || j.articles) : j ? Object.keys(j) : [];
        return new Set((Array.isArray(list) ? list : Object.keys(list)).map((x) => (x && typeof x === 'object' ? x.id : x)));
      })
      .catch(() => new Set());
  }
  return wikiIds.then((s) => s.has(id));
}

// ---- popover ----
let pop = null, popAnchor = null;

export function closeTermPop() {
  if (pop) pop.remove();
  if (popAnchor && popAnchor.isConnected) popAnchor.setAttribute('aria-expanded', 'false');
  pop = null; popAnchor = null;
}

function place() {
  if (!pop || !popAnchor || !popAnchor.isConnected) return;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, gap = 8;
  const a = popAnchor.getBoundingClientRect();
  const w = pop.offsetWidth, ph = pop.offsetHeight;
  let left = a.left + a.width / 2 - w / 2;
  left = Math.max(gap, Math.min(left, vw - w - gap));
  let top = a.bottom + 6;
  if (top + ph > vh - gap && a.top - 6 - ph >= gap) top = a.top - 6 - ph; // no room below: above the word
  pop.style.left = `${left + window.scrollX}px`;
  pop.style.top = `${top + window.scrollY}px`;
  pop.style.setProperty('--arrow', `${Math.max(14, Math.min(a.left + a.width / 2 - left, w - 14))}px`);
}

export function explainTerm(id, anchorEl) {
  const term = byId.get(id);
  if (!term || !anchorEl) return;
  const same = popAnchor === anchorEl;
  closeTermPop();
  if (same) return; // a second tap on the same word closes it
  const lang = getLang();
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'term-x'; close.textContent = '×'; close.setAttribute('aria-label', t('termClose'));
  close.addEventListener('click', () => { const a = popAnchor; closeTermPop(); if (a && a.tagName === 'BUTTON') a.focus(); });
  const head = document.createElement('b');
  head.className = 'term-title'; head.textContent = pick(term.title, lang);
  const body = document.createElement('p');
  body.textContent = pick(term.short, lang);
  pop = document.createElement('div');
  pop.className = 'term-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', head.textContent); pop.tabIndex = -1;
  pop.append(close, head, body);
  document.body.append(pop);
  popAnchor = anchorEl;
  anchorEl.setAttribute('aria-expanded', 'true');
  place();
  if (anchorEl.tagName === 'BUTTON') pop.focus({ preventScroll: true });
  if (term.wiki) {
    const mine = pop;
    wikiHas(term.wiki).then((ok) => {
      if (!ok || pop !== mine) return;
      const a = document.createElement('a');
      a.className = 'term-more'; a.href = `#/wiki/${term.wiki}`; a.textContent = `${t('termMore')} →`;
      mine.append(a);
      place();
    });
  }
}

if (typeof document !== 'undefined') {
  // capture phase: a word inside a card link opens the popover instead of following the link
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.term');
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    explainTerm(el.dataset.term, el);
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest('.term'))) closeTermPop();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pop) { const a = popAnchor; closeTermPop(); if (a && a.isConnected && a.tagName === 'BUTTON') a.focus(); }
  });
  window.addEventListener('hashchange', closeTermPop);
  window.addEventListener('resize', place);
}
