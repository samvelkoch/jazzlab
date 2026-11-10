// Track screen (the home screen): "Today" with the one-tap session, the track's sections and items, stats.
import { h, ICON, themeButton, langSwitch, midiChip, navTabs } from '../ui.js';
import { diagFmt } from './diag.js';
import { freshItems, learningOrder, budgetLimits, BUDGETS, DEFAULT_BUDGET } from '../queue.js';
import { t, L, plural } from '../i18n.js';
import { wikiIndex, factOfDay } from './wiki.js';
import { markTerms } from '../glossary.js';
import { historyPanel, dataPanel, todayLine } from './history.js';
import { store, progress, itemDone, practiceSeconds, reviews, dueReviews, longTerm, session, startSession, endSession, sessionNext } from '../store.js';

const fmtTime = (sec) => { const m = Math.round(sec / 60); return m < 60 ? `${m} ${t('min')}` : `${Math.floor(m / 60)}${t('h')} ${m % 60}${t('min')}`; };
const budgetOf = () => { const b = store.get('settings', {}).budget; return BUDGETS[b] ? b : DEFAULT_BUDGET; };
// the other tracks' raw JSON (item ids only), fetched once for the «due in other tracks» lines
const tracksBase = new URL('../../../content/tracks/', import.meta.url);
const otherTracks = {};
const trackJson = (id) => (otherTracks[id] = otherTracks[id] || fetch(new URL(`${id}.json`, tracksBase)).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));

/** A check-up is due when there is none yet or the newest one is older than `item.every` days (default 30). */
export function diagDue(item, now = new Date()) {
  const last = store.get('diag', [])[0];
  if (!last) return true;
  return (now - new Date(last.date)) / 86400000 >= ((item && item.every) || 30);
}

/** Today's queue: a check-up when due, reviews due (oldest first), then the next unfinished items in learning order
 *  (the track's `path`, else its sections). `limits` = { reviews, fresh } from the session budget (default 20 min).
 *  A performance is offered only once everything before it in the path is done (see freshItems). */
export function todayQueue(model, limits = budgetLimits(DEFAULT_BUDGET)) {
  const prog = progress();
  const order = learningOrder(model.track);
  const diag = model.track.sections.flatMap((s) => s.items).filter((id) => model.items[id].kind === 'diag' && diagDue(model.items[id])).slice(0, 1);
  const due = dueReviews().filter((id) => model.items[id]).slice(0, limits.reviews);
  const done = (id) => itemDone(model.items[id], prog[id]);
  // at most one melody and one form-with-melody (the earliest in order): a track of many tunes must not stack them in one session
  const fresh = freshItems(order, model.items, (id) => done(id) || due.includes(id), limits.fresh, done);
  return { diag, due, fresh, ids: [...diag, ...due, ...fresh] };
}

export async function renderTrack(root, { model, index, rerender }) {
  const { track, items } = model;
  const melodies = model.melodies || {};
  // a melody item's phrases with 3+ clean echo repeats: [learned, total]
  const melPhrases = (id) => { const m = melodies[items[id].melody], echo = (prog[id] && prog[id].echo) || {}; const n = m ? m.phrases.length : 0; return [m ? m.phrases.filter((_, i) => (echo[i] || 0) >= 3).length : 0, n]; };
  const prog = progress(), rev = reviews();
  const done = (id) => itemDone(items[id], prog[id]); // a pattern needs «by heart» (see store.js)
  const budget = budgetOf();
  const q = todayQueue(model, budgetLimits(budget));
  const order = track.sections.flatMap((s) => s.items);
  const doneCount = order.filter(done).length;
  const longCount = order.filter((id) => longTerm(rev[id])).length;
  const diagList = store.get('diag', []), lastDiag = diagList[0] || null;
  const diagId = order.find((id) => items[id].kind === 'diag');
  let cur = session(track.id);
  // a session whose items are all passed (and none due again) is over
  const due = new Set(dueReviews());
  if (cur && cur.ids.every((id) => !items[id] || (done(id) && !due.has(id) && !q.diag.includes(id)))) { endSession(track.id); cur = null; }
  const curNext = cur ? sessionNext(null, track.id) : null;

  const header = h('header.top', null,
    h('div.brand', { role: 'img', 'aria-label': 'Jazzlab' }, h('span.brandname', { 'aria-hidden': 'true' }, 'jazz', h('span.key'), 'lab')),
    navTabs('course'),
    h('div.grow'), midiChip(), langSwitch(rerender),
    h('a.iconbtn.helpbtn', { href: '#/help', 'aria-label': t('helpTitle'), title: t('helpTitle'), html: ICON.help }), themeButton());

  const tabs = h('div.seg.big', { role: 'tablist', 'aria-label': t('courses') },
    ...index.courses.map((c) => h(c.ready ? 'a' : 'button', {
      href: c.ready ? (c.id === 'blues' ? '#/' : c.kind === 'course' ? '#/riffs' : `#/track/${c.id}`) : null,
      type: c.ready ? null : 'button', role: 'tab', 'aria-selected': String(c.id === track.id), disabled: !c.ready, title: c.ready ? null : t('soon')
    }, L(c.title), c.ready ? null : h('small', null, ' · ' + t('soon')))));

  const kindLabel = (k) => t('kind_' + k);
  const status = (id) => {
    const p = prog[id];
    if (q.due.includes(id)) return 'review';
    if (q.diag.includes(id)) return 'now';
    if (done(id)) return 'done';
    if (q.fresh[0] === id) return 'now';
    return p || (items[id].kind === 'exercise' && prog[items[id].ex]) ? 'meh' : 'none';
  };
  const meta = (id) => {
    const p = prog[id] || {}, it = items[id];
    if (it.kind === 'drill' && p.best) return `${Math.round(p.best.acc * 100)}% · ${(p.best.avgMs / 1000).toFixed(1)} ${t('sec')}`;
    if (it.kind === 'ear' && typeof p.best === 'number') return `${Math.round(p.best * 100)}%`;
    if (it.kind === 'form' && p.choruses) return `${p.cleanChoruses || 0} ${t('fCleanOf')} ${p.choruses} · ${t('bestStreak')} ${p.bestStreak || 0}`;
    if (it.kind === 'lick' && p.echo && !done(id)) { const v = Object.entries(p.echo).map(([c, n]) => `${c} ${Math.min(n, 3)}/3`).join(' · '); return v ? `${t('lk_echo')}: ${v}` : ''; }
    if (it.kind === 'melody' && !done(id)) { const [n, total] = melPhrases(id); return p.echo ? t('melEchoMeta').replace('{n}', n).replace('{m}', total) : ''; }
    if (it.kind === 'perform' && p.runs) return `${p.runs} ${plural(p.runs, 'perfRecs')} · ${t('perfBest')} ${p.bestPct || 0}%`;
    if (it.kind === 'diag' && lastDiag) return `${t('dgLastW')}: ${new Date(lastDiag.date).toLocaleDateString()}`;
    if (it.kind === 'pattern' && p.stages) { const n = ['rhythm', 'notes', 'tempo', 'memory'].filter((s) => p.stages[s]).length; return n ? `${t('stagesW')} ${n}/4` : ''; }
    // an exercise item keeps its stages under the exercise id (the item only gets `done`); no rhythm stage here
    if (it.kind === 'exercise' && !done(id)) { const e = prog[it.ex]; const n = e && e.stages ? ['notes', 'tempo', 'memory'].filter((s) => e.stages[s]).length : 0; return n ? `${t('stagesW')} ${n}/3` : ''; }
    return '';
  };
  // a melody item links to its tune's article in the reference (a sibling link: anchors cannot nest)
  const wiki = await wikiIndex().catch(() => null);
  const wikiOf = (it) => (it.kind === 'melody' && wiki && wiki.tunes && wiki.tunes[it.melody]) || null;
  const itemCard = (id) => {
    const it = items[id], s = status(id);
    const r = rev[id];
    const badge = { done: it.kind === 'perform' ? t('recordedW') : t('done'), now: t('now'), review: t('reviewW'), meh: t('inProgress'), none: '' }[s];
    const art = wikiOf(it);
    const card = h('a.item' + (art ? '.haswiki' : ''), { href: it.href, 'data-status': s },
      h('span.kicker', null, kindLabel(it.labelKind || it.kind)),
      h('span.itemtitle', null, markTerms(it.title, undefined, 'span')),
      h('span.itemmeta', null, meta(id) || (r && !q.due.includes(id) ? `${t('nextReview')} ${new Date(r.due).toLocaleDateString()}` : markTerms(it.about || '', undefined, 'span'))),
      badge ? h('span.badge.' + (s === 'review' ? 'now' : s), null, badge) : null);
    return art ? h('div.itemwrap', null, card, h('a.wikilink', { href: `#/wiki/${art}` }, t('aboutTune'))) : card;
  };
  const section = (sec) => h('section.tsection', null,
    h('div.row', null, h('h2', null, markTerms(L(sec.title))), h('div.grow'), h('span.meta', null, `${sec.items.filter(done).length}/${sec.items.length}`)),
    h('p.muted', null, markTerms(L(sec.about))),
    h('div.items', null, ...sec.items.map(itemCard)));

  // ---- today ----
  const todayList = h('div.todaylist', null, ...q.ids.map((id, k) => h('a.todayitem', { href: items[id].href },
    h('b', null, String(k + 1)), h('span', null, items[id].title), h('small', null, q.due.includes(id) ? t('reviewW') : kindLabel(items[id].labelKind || items[id].kind)))));
  const startBtn = q.ids.length ? h('a.btn.accent.xl', {
    href: (curNext && items[curNext.id] ? items[curNext.id].href : items[q.ids[0]].href),
    html: ICON.play + `<span>${cur && curNext ? t('continueSession') : t('startSession')}</span>`,
    onclick: () => { if (!(cur && curNext)) startSession(q.ids, track.id); }
  }) : null;
  // the session budget: 10 / 20 / 40 minutes sets how many reviews and new items the list takes (a running session keeps its queue)
  const budgetSeg = h('div.seg.budget', { role: 'group', 'aria-label': t('budgetW') },
    ...Object.keys(BUDGETS).map((b) => h('button', { type: 'button', 'aria-pressed': String(+b === budget), onclick: () => {
      if (+b === budget) return;
      store.set('settings', { ...store.get('settings', {}), budget: +b }); rerender();
    } }, `${b} ${t('min')}`)));
  // reviews due in the other ready tracks: one line each, filled in when their track files arrive (silent on failure)
  const others = h('div.todayothers', { hidden: true });
  const dueAll = dueReviews();
  const otherIds = dueAll.length ? index.courses.filter((c) => c.kind === 'track' && c.ready && c.id !== track.id) : [];
  Promise.all(otherIds.map((c) => trackJson(c.id).then((tj) => ({ c, n: dueAll.filter((id) => tj.items && tj.items[id]).length })).catch(() => null))).then((rows) => {
    const lines = rows.filter((r) => r && r.n > 0).map(({ c, n }) => h('a.todayother', { href: c.id === 'blues' ? '#/' : `#/track/${c.id}` },
      `${t('dueElsewhere')}: ${L(c.title)} · ${n} →`));
    if (!lines.length || !others.isConnected) return;
    others.replaceChildren(...lines); others.hidden = false;
  }).catch(() => {});
  const todayCard = h('section.hero', null,
    h('div.row.herohead', null, h('span.kicker', null, t('today')), h('div.grow'), budgetSeg),
    q.ids.length ? todayList : h('span.herotitle', null, t('nothingToday')),
    q.ids.length ? null : (() => { const line = todayLine(); return line ? h('span.herotoday', null, line) : null; })(),
    others,
    startBtn,
    cur && curNext ? h('button.btn.ghost', { type: 'button', onclick: () => { endSession(track.id); rerender(); } }, t('endSession')) : null);

  const stats = h('section.panel.stats.two', null,
    h('div', null, h('b', null, String(doneCount), h('small', null, '/' + order.length)), h('span', null, t('itemsDone'))),
    h('div', null, h('b', null, fmtTime(practiceSeconds())), h('span', null, t('practiceTime'))));

  // ---- skills: the latest check-up plus what the track already counts ----
  const lickIds = order.filter((id) => items[id].kind === 'lick');
  const lickDone = lickIds.filter(done).length;
  const melIds = order.filter((id) => items[id].kind === 'melody');
  const melSum = melIds.map(melPhrases).reduce((a, [n, m]) => [a[0] + n, a[1] + m], [0, 0]);
  const cleanRounds = order.filter((id) => items[id].kind === 'form').reduce((a, id) => a + ((prog[id] && prog[id].cleanChoruses) || 0), 0);
  const num = (v) => typeof v === 'number';
  const rhythmTxt = lastDiag && num(lastDiag.rhythmMs) ? [diagFmt.rhythm(lastDiag.rhythmMs), num(lastDiag.rhythmBias) ? diagFmt.bias(lastDiag.rhythmBias) : ''].filter(Boolean).join(' · ') : '—';
  const row = (label, value) => h('div.skrow', null, h('span', null, label), h('b', null, value));
  const skills = h('section.panel.skills', null,
    h('div.row', null, h('b.skhead', null, t('skillsTitle')), h('div.grow'), lastDiag ? h('small.muted', null, `${t('skMeasured')} ${new Date(lastDiag.date).toLocaleDateString()}`) : null),
    row(t('skRhythm'), rhythmTxt),
    row(t('skNames'), lastDiag && num(lastDiag.nameMs) ? diagFmt.names(lastDiag.nameMs) : '—'),
    row(t('skEar'), lastDiag && num(lastDiag.earAcc) ? diagFmt.pct(lastDiag.earAcc) : '—'),
    row(t('skChords'), lastDiag && num(lastDiag.chordAcc) ? diagFmt.pct(lastDiag.chordAcc) : '—'),
    !lastDiag && diagId ? h('a.sklink', { href: items[diagId].href }, t('skDoCheck') + ' →') : null,
    lickIds.length ? row(t('skLicks'), `${lickDone}/${lickIds.length}`) : null,
    melIds.length ? row(t('skMelody'), `${melSum[0]}/${melSum[1]}`) : null,
    row(t('skChoruses'), String(cleanRounds)),
    row(t('skRecs'), String(store.get('recordings', []).length)),
    row(t('longTermW'), String(longCount)));
  const goal = h('section.panel.tip', null, h('b', null, t('trackGoal')), h('p', null, markTerms(L(track.about))));
  // fact of the day: filled in when its article arrives; stays hidden if the reference cannot load
  const fact = h('section.panel.tip.factcard', { hidden: true });
  factOfDay().then((f) => {
    if (!f) return;
    fact.replaceChildren(h('b', null, t('factOfDay')), h('p', null, L(f.fact)),
      h('a.sklink', { href: `#/wiki/${f.article.id}` }, `${L(f.article.title)} →`));
    fact.hidden = false;
  }).catch(() => {});

  root.replaceChildren(header,
    h('main.course', null,
      h('div.coursemain', null,
        h('div.row', null, h('h1', null, L(track.title)), h('div.grow'), tabs),
        ...track.sections.map(section)),
      h('aside.courseside', null, todayCard, skills, stats, historyPanel(), goal, fact, dataPanel())));
}
