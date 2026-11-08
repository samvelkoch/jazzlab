// "How to use" screen: content/help.json (format jazzlab-help/1), same layout as a Reference article.
//   #/help   intro, table of contents (buttons that scroll to a section), one section per topic
import { h, themeButton, langSwitch, midiChip, navTabs } from '../ui.js';
import { t, L } from '../i18n.js';
import { markTerms } from '../glossary.js';

const url = new URL('../../../content/help.json', import.meta.url);
let cache = null;

export async function helpData() {
  if (!cache) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`help.json: HTTP ${r.status}`);
    cache = await r.json();
  }
  return cache;
}

/** The first sentence of the intro, for the card in the Reference index. */
export const firstSentence = (s) => { const m = /^.*?[.!?](?=\s|$)/s.exec(String(s || '')); return m ? m[0] : String(s || ''); };

export function renderHelp(root, { help, rerender }) {
  const header = h('header.top', null,
    h('div.brand', { role: 'img', 'aria-label': 'Jazzlab' }, h('span.brandname', { 'aria-hidden': 'true' }, 'jazz', h('span.key'), 'lab')),
    navTabs(null), h('div.grow'), midiChip(), langSwitch(rerender), themeButton());
  const secId = (s) => `help-${s.id}`;
  const toc = h('nav.helptoc', { 'aria-label': t('helpContents') },
    ...help.sections.map((s) => h('button.chip', { type: 'button',
      onclick: () => { const el = document.getElementById(secId(s)); if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); } },
      h('span', null, L(s.title)))));
  root.replaceChildren(header,
    h('main.wikimain', null,
      h('article.wikiart.helpart', null,
        h('h1', null, L(help.title)),
        h('p.wikilead', null, markTerms(L(help.intro))),
        h('span.kicker', null, t('helpContents').toUpperCase()),
        toc,
        ...help.sections.map((s) => h('section.wikisec.helpsec', { id: secId(s) },
          h('h2', null, L(s.title)),
          ...s.body.map((p) => h('p', null, markTerms(L(p)))))))));
}
