// Reference ("Справочник"): short articles about styles, ideas, tunes and people, with links outward.
//   #/wiki         index: articles grouped by kind
//   #/wiki/<id>    one article
// Content: content/wiki/index.json (groups, tunes map) + content/wiki/<id>.json, loaded on demand and cached.
import { h, themeButton, langSwitch, midiChip, navTabs } from '../ui.js';
import { t, L } from '../i18n.js';
import { helpData, firstSentence } from './help.js';

const base = new URL('../../../content/wiki/', import.meta.url);
let indexCache = null;
const articles = {};

async function getJSON(p) {
  const r = await fetch(new URL(p, base));
  if (!r.ok) throw new Error(`wiki/${p}: HTTP ${r.status}`);
  return r.json();
}
export async function wikiIndex() {
  if (!indexCache) indexCache = await getJSON('index.json');
  return indexCache;
}
export async function wikiArticle(id) {
  if (!articles[id]) articles[id] = await getJSON(`${id}.json`);
  return articles[id];
}
const pretty = (u) => { const s = u.replace(/^https?:\/\/(www\.)?/, ''); try { return decodeURIComponent(s); } catch { return s; } };
export const wikiIds = (index) => index.groups.flatMap((g) => g.ids);

/** The fact of the day: day n picks article n mod N, then cycles through that article's facts on later rounds. */
export async function factOfDay(now = new Date()) {
  const index = await wikiIndex();
  const ids = wikiIds(index);
  if (!ids.length) return null;
  const day = Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
  const art = await wikiArticle(ids[day % ids.length]);
  if (!art.facts || !art.facts.length) return null;
  return { article: art, fact: art.facts[Math.floor(day / ids.length) % art.facts.length] };
}

/** An image with a credit line; the whole figure hides itself if the image fails to load. */
function figure(img, cls) {
  if (!img) return null;
  const credit = t('imageCredit').replace('{credit}', img.credit).replace('{license}', img.license);
  const fig = h('figure.' + cls, null,
    h('img', { src: img.url, alt: L(img.alt), loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
      onerror: () => { fig.hidden = true; } }),
    cls === 'wikifig' ? h('figcaption', null, h('a', { href: img.source, target: '_blank', rel: 'noopener' }, credit)) : null);
  return fig;
}

function header(rerender) {
  return h('header.top', null,
    h('div.brand', { role: 'img', 'aria-label': 'Jazzlab' }, h('span.brandname', { 'aria-hidden': 'true' }, 'jazz', h('span.key'), 'lab')),
    navTabs('wiki'), h('div.grow'), midiChip(), langSwitch(rerender), themeButton());
}

export async function renderWikiIndex(root, { rerender }) {
  const index = await wikiIndex();
  const all = await Promise.all(wikiIds(index).map((id) => wikiArticle(id).catch(() => null)));
  const byId = Object.fromEntries(all.filter(Boolean).map((a) => [a.id, a]));
  const card = (a) => h('a.wikicard', { href: `#/wiki/${a.id}` },
    a.image ? figure(a.image, 'wikithumb') : null,
    h('span.wikicardtext', null, h('b', null, L(a.title)), h('span', null, L(a.lead))));
  const help = await helpData().catch(() => null); // the card is optional: no help.json, no card
  const helpCard = help ? h('a.helpcard', { href: '#/help' },
    h('span.helpq', { 'aria-hidden': 'true' }, '?'),
    h('span.wikicardtext', null, h('b', null, t('helpTitle')), h('span', null, firstSentence(L(help.intro))))) : null;
  root.replaceChildren(header(rerender),
    h('main.wikimain', null,
      h('div.wikihead', null, h('span.kicker', null, t('wikiUpper')), h('h1', null, t('wikiTab')), h('p.muted', null, t('wikiIntro'))),
      helpCard,
      ...index.groups.map((g) => h('section.wikigroup', null,
        h('h2', null, L(g.title)),
        h('div.wiki', null, ...g.ids.filter((id) => byId[id]).map((id) => card(byId[id])))))));
}

export async function renderWikiArticle(root, { id, rerender }) {
  const index = await wikiIndex();
  if (!wikiIds(index).includes(id)) return false;
  const a = await wikiArticle(id);
  const group = index.groups.find((g) => g.ids.includes(id));
  const related = await Promise.all((a.related || []).map((r) => wikiArticle(r).catch(() => null)));
  const sec = (title, ...kids) => h('section.wikisec', null, h('h2', null, title), ...kids);
  root.replaceChildren(header(rerender),
    h('main.wikimain', null,
      h('article.wikiart', null,
        h('a.wikiback', { href: '#/wiki' }, '← ' + t('wikiBack')),
        h('span.kicker', null, group ? L(group.title).toUpperCase() : t('wikiUpper')),
        h('h1', null, L(a.title)),
        h('p.wikilead', null, L(a.lead)),
        figure(a.image, 'wikifig'),
        ...L(a.body).map((p) => h('p', null, p)),
        a.facts && a.facts.length ? h('aside.panel.wikifacts', null, h('b', null, t('factsW')), h('ul', null, ...a.facts.map((f) => h('li', null, L(f))))) : null,
        a.links && a.links.length ? sec(t('linksW'), h('ul.wikilinks', null, ...a.links.map((l) => h('li', null, h('a', { href: l.url, target: '_blank', rel: 'noopener' }, L(l.title), ' ↗'))))) : null,
        related.some(Boolean) ? sec(t('relatedW'), h('div.wikichips', null, ...related.filter(Boolean).map((r) => h('a.chip', { href: `#/wiki/${r.id}` }, h('span', null, L(r.title)))))) : null,
        a.sources && a.sources.length ? h('div.wikisources', null, h('b', null, t('sourcesW') + ': '),
          ...a.sources.flatMap((s, i) => [i ? ' · ' : null, h('a', { href: s, target: '_blank', rel: 'noopener' }, pretty(s))])) : null)));
  return true;
}
