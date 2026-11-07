// Course screen: steps of the course, today's card, progress.
import { h, ICON, themeButton, langSwitch, midiChip, navTabs } from '../ui.js';
import { t, L } from '../i18n.js';
import { store, progress, isDone, practiceSeconds } from '../store.js';

const fmtTime = (sec) => {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} ${t('min')}` : `${Math.floor(m / 60)}${t('h')} ${m % 60}${t('min')}`;
};

export async function renderCourse(root, { course, index, rerender }) {
  const prog = progress();
  const avail = new Set(course.available);
  const exDone = (id) => isDone(prog[id]);
  const href = (id) => (id.endsWith('-imp') ? `#/imp/${id.slice(0, -4)}` : `#/ex/${id}`);

  // first available, not finished exercise = "today"
  const ordered = course.steps.flatMap((s) => s.items.map((id) => ({ id, step: s })));
  const last = store.get('lastExercise', null);
  const todo = ordered.find((x) => avail.has(x.id) && !exDone(x.id));
  const today = (last && avail.has(last) && !exDone(last)) ? ordered.find((x) => x.id === last) : todo || ordered.find((x) => avail.has(x.id));
  const doneCount = ordered.filter((x) => exDone(x.id)).length;
  const best = Math.max(0, ...Object.values(prog).map((p) => p.bestTempo || 0));

  const header = h('header.top', null,
    h('div.brand', { role: 'img', 'aria-label': 'Jazzlab' },
      h('span.brandname', { 'aria-hidden': 'true' }, 'jazz', h('span.key'), 'lab')),
    navTabs('course'),
    h('div.grow'),
    midiChip(), langSwitch(rerender), themeButton());

  const tabs = h('div.seg.big', { role: 'tablist', 'aria-label': t('courses') },
    ...index.courses.map((c) => h(c.ready ? 'a' : 'button', {
      href: c.ready ? (c.id === course.id ? '#/riffs' : c.kind === 'course' ? '#/riffs' : c.id === 'blues' ? '#/' : `#/track/${c.id}`) : null,
      type: c.ready ? null : 'button', role: 'tab', 'aria-selected': String(c.id === course.id), disabled: !c.ready,
      title: c.ready ? null : t('soon')
    }, L(c.title), c.ready ? null : h('small', null, ' · ' + t('soon')))));

  const card = (s) => {
    const items = s.items.map((id) => (exDone(id) ? 'ok' : prog[id] ? 'meh' : 'none'));
    const anyAvail = s.items.some((id) => avail.has(id));
    const allDone = items.every((x) => x === 'ok');
    const isNow = today && today.step.id === s.id;
    const kind = allDone ? 'done' : isNow ? 'now' : anyAvail ? 'open' : 'lock';
    const kicker = s.kind === 'theory' ? t('theory').toUpperCase() : `${t('stepUpper')} ${s.n}`;
    const badge = { done: t('done'), now: t('now'), open: t('next'), lock: t('soon') }[kind];
    const target = s.items.find((id) => avail.has(id) && !exDone(id)) || s.items.find((id) => avail.has(id));
    const imp = s.items.find((id) => id.endsWith('-imp') && avail.has(id));
    const el = h('div.stepcard', { 'data-kind': kind, 'aria-disabled': target ? null : 'true' },
      target ? h('a.stretch', { href: href(target), 'aria-label': `${kicker}: ${L(s.title)}` }) : null,
      h('div.row', null, h('span.kicker', null, kicker), h('span.badge.' + kind, null, badge)),
      h('span.steptitle', null, L(s.title)),
      h('div.grow'),
      h('div.bars', { 'aria-hidden': 'true' }, ...items.map((c) => h('span.' + c))),
      h('div.row', null,
        h('span.meta', null, s.kind === 'theory' ? `${s.items.length} × ${t('lesson')}` : `${s.items.filter((x) => !x.endsWith('imp')).length} × ${t('exercise')} + ${t('improv').toLowerCase()}`),
        imp ? h('a.impchip' + (exDone(imp) ? '.done' : ''), { href: href(imp) }, (exDone(imp) ? '✓ ' : '♪ ') + t('improv')) : null));
    return el;
  };

  const todayCard = h('section.hero', null,
    h('span.kicker', null, t('today')),
    today ? h('span.herotitle', null, today.step.kind === 'theory' ? L(today.step.title) : (today.id.endsWith('-imp') ? `${t('step')} ${today.step.n}, ${t('improv').toLowerCase()}` : `${t('step')} ${today.step.n}, ${t('exercise')} ${today.id.split('-e')[1] || ''}`)) : null,
    today ? h('a.btn.accent.xl', { href: href(today.id), html: ICON.play + `<span>${prog[today.id] ? t('continue') : t('start')}</span>` }) : null);

  const stats = h('section.panel.stats', null,
    h('div', null, h('b', null, String(doneCount), h('small', null, '/' + ordered.filter((x) => !x.id.startsWith('th')).length)), h('span', null, t('exercisesDone'))),
    h('div', null, h('b', null, fmtTime(practiceSeconds())), h('span', null, t('practiceTime'))),
    h('div', null, h('b', null, best ? String(best) : '–'), h('span', null, t('bestTempo'))));

  const tip = h('section.panel.tip', null, h('b', null, t('tip')), h('p', null, t('tipText')));

  root.replaceChildren(
    header,
    h('main.course', null,
      h('div.coursemain', null,
        h('div.row', null, h('h1', null, t('courses')), h('div.grow'), tabs),
        h('p.muted', null, L(course.about)),
        h('div.stepgrid', null, ...course.steps.map(card))),
      h('aside.courseside', null, todayCard, stats, tip)));
}
