// Function labels in a bar grid (form and solo screens): a small muted «ii · V» line at the top of each cell, a coloured
// top edge over the bars of a ii–V–I (and its relatives) with the group's name and key («ii–V–I в Db») on its first bar.
// Every label is a glossary word: a tap opens the popover that says why (glossary.js handles the click).
//   decorateFunctions(cells, bars) -> the analysis (music/functions.js)
import { h } from './ui.js';
import { t } from './i18n.js';
import { analyzeForm, roleText, roleTerm, groupTitle, groupTerm } from './music/functions.js';

const COLS = 4; // the grid is four bars wide on every screen size

export function decorateFunctions(cells, bars) {
  let a;
  try { a = analyzeForm(bars); } catch (e) { console.warn(e); return null; }
  const byBar = new Map();
  a.labels.forEach((l) => { (byBar.get(l.bar) || byBar.set(l.bar, []).get(l.bar)).push(l); });
  const named = new Map(); // bar -> the group whose name sits on that bar
  a.groups.forEach((g) => {
    if (!groupTitle(g)) return;
    // the name sits on the first bar, or on the second when the first holds two chords (the name would run into them)
    const at = g.bars.length > 1 && /\s/.test(bars[g.bars[0]].trim()) ? g.bars[1] : g.bars[0];
    if (!named.has(at)) named.set(at, g);
    g.bars.forEach((b, j) => {
      const c = cells[b]; if (!c) return;
      c.classList.add('fg');
      if (j === g.bars.length - 1 || b % COLS === COLS - 1) c.classList.add('fg-end');
    });
  });
  cells.forEach((c, k) => {
    const ls = byBar.get(k) || [], g = named.get(k);
    if (!ls.length && !g) return;
    const row = h('span.ffn', { 'data-fn': '' });
    const roles = h('span.fnroles');
    // a two-chord bar keeps its slots apart: «– V» when only the second chord has a function
    const two = /\s/.test(bars[k].trim());
    const slots = two ? [0, 4] : [0];
    slots.forEach((s) => {
      const l = ls.find((x) => x.slot === s);
      roles.append(l
        ? h('button.term.fn', { type: 'button', 'data-term': roleTerm(l), title: l.key ? `${l.chord} · ${l.key}` : l.chord }, roleText(l))
        : h('span.fnnone', null, '–'));
    });
    if (ls.length) row.append(roles);
    if (g) {
      row.append(h('button.term.fngroup', { type: 'button', 'data-term': groupTerm(g) }, groupTitle(g), h('span.fnin', null, ` ${t('fnIn')} `), h('span', null, '\u00a0' + g.key)));
    }
    c.append(row);
    if (ls.length || g) c.setAttribute('data-fn-on', '');
  });
  return a;
}
