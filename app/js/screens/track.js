// Track screen (the home screen): "Today" with the one-tap session, the track's sections and items, stats.
import { h, ICON, themeButton, langSwitch, midiChip } from '../ui.js';
import { t, L } from '../i18n.js';
import { progress, isDone, practiceSeconds, reviews, dueReviews, longTerm, session, startSession, endSession, sessionNext } from '../store.js';

const fmtTime = (sec) => { const m = Math.round(sec / 60); return m < 60 ? `${m} ${t('min')}` : `${Math.floor(m / 60)}${t('h')} ${m % 60}${t('min')}`; };
const MAX_REVIEWS = 3, MAX_NEW = 2;

/** Today's queue: reviews due (oldest first), then the next unfinished items in track order. */
export function todayQueue(model) {
  const prog = progress();
  const order = model.track.sections.flatMap((s) => s.items);
  const due = dueReviews().filter((id) => model.items[id]).slice(0, MAX_REVIEWS);
  const fresh = order.filter((id) => !isDone(prog[id]) && !due.includes(id)).slice(0, MAX_NEW);
  return { due, fresh, ids: [...due, ...fresh] };
}

export async function renderTrack(root, { model, index, rerender }) {
  const { track, items } = model;
  const prog = progress(), rev = reviews();
  const q = todayQueue(model);
  const order = track.sections.flatMap((s) => s.items);
  const doneCount = order.filter((id) => isDone(prog[id])).length;
  const longCount = order.filter((id) => longTerm(rev[id])).length;
  let cur = session();
  // a session whose items are all passed (and none due again) is over
  const due = new Set(dueReviews());
  if (cur && cur.ids.every((id) => !items[id] || (isDone(prog[id]) && !due.has(id)))) { endSession(); cur = null; }
  const curNext = cur ? sessionNext(null) : null;

  const header = h('header.top', null,
    h('div.brand', { role: 'img', 'aria-label': 'Jazzlab' }, h('span.brandname', { 'aria-hidden': 'true' }, 'jazz', h('span.key'), 'lab')),
    h('div.grow'), midiChip(), langSwitch(rerender), themeButton());

  const tabs = h('div.seg.big', { role: 'tablist', 'aria-label': t('courses') },
    ...index.courses.map((c) => h(c.ready ? 'a' : 'button', {
      href: c.ready ? (c.id === track.id ? '#/' : c.kind === 'course' ? '#/riffs' : `#/track/${c.id}`) : null,
      type: c.ready ? null : 'button', role: 'tab', 'aria-selected': String(c.id === track.id), disabled: !c.ready, title: c.ready ? null : t('soon')
    }, L(c.title), c.ready ? null : h('small', null, ' · ' + t('soon')))));

  const kindLabel = (k) => t('kind_' + k);
  const status = (id) => {
    const p = prog[id];
    if (q.due.includes(id)) return 'review';
    if (isDone(p)) return 'done';
    if (q.fresh[0] === id) return 'now';
    return p ? 'meh' : 'none';
  };
  const meta = (id) => {
    const p = prog[id] || {}, it = items[id];
    if (it.kind === 'drill' && p.best) return `${Math.round(p.best.acc * 100)}% · ${(p.best.avgMs / 1000).toFixed(1)} ${t('sec')}`;
    if (it.kind === 'ear' && typeof p.best === 'number') return `${Math.round(p.best * 100)}%`;
    if (it.kind === 'form' && p.choruses) return `${p.cleanChoruses || 0} ${t('fCleanOf')} ${p.choruses} · ${t('bestStreak')} ${p.bestStreak || 0}`;
    if (it.kind === 'lick' && p.echo && !isDone(p)) { const v = Object.entries(p.echo).map(([c, n]) => `${c} ${Math.min(n, 3)}/3`).join(' · '); return v ? `${t('lk_echo')}: ${v}` : ''; }
    if (it.kind === 'pattern' && p.stages) { const n = ['rhythm', 'notes', 'tempo', 'memory'].filter((s) => p.stages[s]).length; return n ? `${t('stagesW')} ${n}/4` : ''; }
    return '';
  };
  const itemCard = (id) => {
    const it = items[id], s = status(id);
    const r = rev[id];
    const badge = { done: t('done'), now: t('now'), review: t('reviewW'), meh: t('inProgress'), none: '' }[s];
    return h('a.item', { href: it.href, 'data-status': s },
      h('span.kicker', null, kindLabel(it.kind)),
      h('span.itemtitle', null, it.title),
      h('span.itemmeta', null, meta(id) || (r && !q.due.includes(id) ? `${t('nextReview')} ${new Date(r.due).toLocaleDateString()}` : it.about || '')),
      badge ? h('span.badge.' + (s === 'review' ? 'now' : s), null, badge) : null);
  };
  const section = (sec) => h('section.tsection', null,
    h('div.row', null, h('h2', null, L(sec.title)), h('div.grow'), h('span.meta', null, `${sec.items.filter((id) => isDone(prog[id])).length}/${sec.items.length}`)),
    h('p.muted', null, L(sec.about)),
    h('div.items', null, ...sec.items.map(itemCard)));

  // ---- today ----
  const todayList = h('div.todaylist', null, ...q.ids.map((id, k) => h('a.todayitem', { href: items[id].href },
    h('b', null, String(k + 1)), h('span', null, items[id].title), h('small', null, q.due.includes(id) ? t('reviewW') : kindLabel(items[id].kind)))));
  const startBtn = q.ids.length ? h('a.btn.accent.xl', {
    href: (curNext && items[curNext.id] ? items[curNext.id].href : items[q.ids[0]].href),
    html: ICON.play + `<span>${cur && curNext ? t('continueSession') : t('startSession')}</span>`,
    onclick: () => { if (!(cur && curNext)) startSession(q.ids); }
  }) : null;
  const todayCard = h('section.hero', null,
    h('span.kicker', null, t('today')),
    q.ids.length ? todayList : h('span.herotitle', null, t('nothingToday')),
    startBtn,
    cur && curNext ? h('button.btn.ghost', { type: 'button', onclick: () => { endSession(); rerender(); } }, t('endSession')) : null);

  const stats = h('section.panel.stats', null,
    h('div', null, h('b', null, String(doneCount), h('small', null, '/' + order.length)), h('span', null, t('itemsDone'))),
    h('div', null, h('b', null, String(longCount)), h('span', null, t('longTermW'))),
    h('div', null, h('b', null, fmtTime(practiceSeconds())), h('span', null, t('practiceTime'))));
  const goal = h('section.panel.tip', null, h('b', null, t('trackGoal')), h('p', null, L(track.about)));

  root.replaceChildren(header,
    h('main.course', null,
      h('div.coursemain', null,
        h('div.row', null, h('h1', null, L(track.title)), h('div.grow'), tabs),
        ...track.sections.map(section)),
      h('aside.courseside', null, todayCard, stats, goal)));
}
