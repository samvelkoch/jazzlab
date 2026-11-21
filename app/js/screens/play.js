// «Играть» (#/play): free play, apart from the course. No passing, no order: four large ruled rows, each a link —
// accompaniment (#/jam), riffs (#/riffs), chords (#/chords), reference (#/wiki). Their screens show «Играть» in the nav
// and their top-level back returns here.
import { h, ICON, themeButton, langSwitch, midiChip, navTabs } from '../ui.js';
import { t, plural } from '../i18n.js';

const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.split(`{${k}}`).join(String(x)), s);

/** `course` = the riffs course (content/courses/jazz-rhythms.json); `jamForm` = the first form of the current chapter. */
export function renderPlay(root, { course, jamForm, rerender }) {
  const header = h('header.top', null,
    h('div.brand', { role: 'img', 'aria-label': 'Jazzlab' }, h('span.brandname', { 'aria-hidden': 'true' }, 'jazz', h('span.key'), 'lab')),
    navTabs('play'),
    h('div.grow'), midiChip(), langSwitch(rerender),
    h('a.iconbtn.helpbtn', { href: '#/help', 'aria-label': t('helpTitle'), title: t('helpTitle'), html: ICON.help }), themeButton());

  // the riffs: every written rhythm of the course (s1-e1 … s10-e25), not the improvisations or the theory
  const nRiffs = ((course && course.available) || []).filter((id) => /-e\d+$/.test(id)).length;
  const row = (href, title, line, onclick) => h('li', null,
    h('a.playrow', { href, onclick },
      h('span.playbody', null, h('h2.playt', null, title), h('span.playline', null, line)),
      h('span.playgo', { 'aria-hidden': 'true' }, '→')));

  root.replaceChildren(header,
    h('main.playmain', null,
      h('h1.cap', null, t('playCap')),
      h('p.playlead', null, t('playLead')),
      h('ul.playlist', null,
        row(jamForm ? `#/jam/${jamForm}` : '#/jam', t('playJam'), t('playJamLine'),
          () => { try { sessionStorage.setItem('jamBack', '#/play'); } catch (e) { /* no storage: jam's back defaults to #/play */ } }),
        row('#/riffs', t('riffs'), fill(t('playRiffsLine'), { n: nRiffs, w: plural(nRiffs, 'playRhythmW') })),
        row('#/chords', t('navChords'), t('playChordsLine')),
        row('#/wiki', t('wikiTab'), t('playWikiLine')))));
}
