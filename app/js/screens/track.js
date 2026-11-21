// Track screen (the home screen) «Путь»: a yellow poster (where you are on the path + today's lesson with one button)
// and, beside it, three tabs: the path cut into steps, every exercise by section, progress panels.
import { h, ICON, themeButton, langSwitch, midiChip, navTabs } from '../ui.js';
import { diagFmt } from './diag.js';
import { freshItems, learningOrder, budgetLimits, BUDGETS, DEFAULT_BUDGET } from '../queue.js';
import { stepsOf, stepProgress, stepDone, stepLocked, currentStepIndex, pathComplete, pathProgress, concertOf, unlockedOf, withUnlocked, firstSentence } from '../path.js';
import { t, L, plural } from '../i18n.js';
import { wikiIndex, factOfDay } from './wiki.js';
import { markTerms } from '../glossary.js';
import { historyPanel, dataPanel, todayLine } from './history.js';
import { store, progress, itemDone, practiceSeconds, reviews, dueReviews, longTerm, session, startSession, endSession, sessionNext } from '../store.js';

const fmtTime = (sec) => { const m = Math.round(sec / 60); return m < 60 ? `${m} ${t('min')}` : `${Math.floor(m / 60)}${t('h')} ${m % 60}${t('min')}`; };
const budgetOf = () => { const b = store.get('settings', {}).budget; return BUDGETS[b] ? b : DEFAULT_BUDGET; };
const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.split(`{${k}}`).join(String(x)), s);
const p2 = (n) => String(n).padStart(2, '0');
// the chosen right-column tab, per browser session
const TABS = ['path', 'all', 'prog'];
const tabOf = () => { try { const v = sessionStorage.getItem('homeTab'); return TABS.includes(v) ? v : 'path'; } catch (e) { return 'path'; } };
const setTabOf = (v) => { try { sessionStorage.setItem('homeTab', v); } catch (e) { /* no storage: the default next time */ } };
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
  const prog = progress(), rev = reviews();
  // a melody item's phrases with 3+ clean echo repeats: [learned, total]
  const melPhrases = (id) => { const m = melodies[items[id].melody], echo = (prog[id] && prog[id].echo) || {}; const n = m ? m.phrases.length : 0; return [m ? m.phrases.filter((_, i) => (echo[i] || 0) >= 3).length : 0, n]; };
  const done = (id) => !!items[id] && itemDone(items[id], prog[id]); // a pattern needs «by heart» (see store.js)
  const budget = budgetOf();
  const q = todayQueue(model, budgetLimits(budget));
  const order = track.sections.flatMap((s) => s.items);
  const doneCount = order.filter(done).length;
  const longCount = order.filter((id) => longTerm(rev[id])).length;
  const diagList = store.get('diag', []), lastDiag = diagList[0] || null;
  const diagId = order.find((id) => items[id].kind === 'diag');
  let cur = session(track.id);
  // a session whose items are all passed (and none due again) is over
  const dueSet = new Set(dueReviews());
  if (cur && cur.ids.every((id) => !items[id] || (done(id) && !dueSet.has(id) && !q.diag.includes(id)))) { endSession(track.id); cur = null; }
  const curNext = cur ? sessionNext(null, track.id) : null;
  const running = !!(cur && curNext && items[curNext.id]);

  // ---- the path: steps, the current one, the soft locks ----
  const steps = stepsOf(track).map((s) => ({ ...s, items: s.items.filter((id) => items[id]) }));
  const curK = currentStepIndex(steps, done);
  const complete = pathComplete(steps, done);
  const total = pathProgress(steps, done);
  const settings = store.get('settings', {});
  const unlocked = new Set(unlockedOf(settings, track.id));
  const stepTitle = (s) => L(s.title) || L(track.title);
  // the one item the primary button opens; the yellow «сейчас» row is that item when the path shows it open
  // (the current step or one opened ahead), else the first new item of today (a review in a finished step or the
  // check-up are not drawn on the path's open steps)
  const nextId = running ? curNext.id : q.ids[0] || null;
  const stepOfId = {}; steps.forEach((s, k) => s.items.forEach((id) => { stepOfId[id] = k; }));
  const openByDefault = (k) => k === curK || (k > curK && unlocked.has(steps[k].id));
  const shownOpen = (id) => id in stepOfId && openByDefault(stepOfId[id]);
  const nowId = nextId && shownOpen(nextId) ? nextId : q.fresh.find(shownOpen) || null;

  const header = h('header.top', null,
    h('div.brand', { role: 'img', 'aria-label': 'Jazzlab' }, h('span.brandname', { 'aria-hidden': 'true' }, 'jazz', h('span.key'), 'lab')),
    navTabs('course'),
    h('div.grow'), midiChip(), langSwitch(rerender),
    h('a.iconbtn.helpbtn', { href: '#/help', 'aria-label': t('helpTitle'), title: t('helpTitle'), html: ICON.help }), themeButton());

  const courseTabs = h('div.seg.big.coursetabs', { role: 'tablist', 'aria-label': t('courses') },
    ...index.courses.map((c) => h(c.ready ? 'a' : 'button', {
      href: c.ready ? (c.id === 'blues' ? '#/' : c.kind === 'course' ? '#/riffs' : `#/track/${c.id}`) : null,
      type: c.ready ? null : 'button', role: 'tab', 'aria-selected': String(c.id === track.id), disabled: !c.ready, title: c.ready ? null : t('soon')
    }, L(c.title), c.ready ? null : h('small', null, ' · ' + t('soon')))));

  // ---- item state (one word) and the details line of the old cards ----
  const status = (id) => {
    if (id === nowId || q.diag.includes(id)) return 'now'; // a due check-up is only listed in «Все упражнения»
    if (q.due.includes(id)) return 'review';
    if (done(id)) return 'done';
    return prog[id] || (items[id].kind === 'exercise' && prog[items[id].ex]) ? 'meh' : 'none';
  };
  const stateWord = (id, s) => ({ done: items[id].kind === 'perform' ? t('recordedW') : t('pPassed'), now: t('now'), review: t('pReview'), meh: t('inProgress'), none: '' }[s]);
  const meta = (id) => {
    const p = prog[id] || {}, it = items[id];
    if (it.kind === 'drill' && p.best) return `${Math.round(p.best.acc * 100)}% · ${(p.best.avgMs / 1000).toFixed(1)} ${t('sec')}`;
    if (it.kind === 'ear' && typeof p.best === 'number') return `${Math.round(p.best * 100)}%`;
    if (it.kind === 'form' && p.choruses) return `${p.cleanChoruses || 0} ${t('fCleanOf')} ${p.choruses} · ${t('bestStreak')} ${p.bestStreak || 0}`;
    if (it.kind === 'form' && !done(id) && p.stages && p.stages.notes) return `${t('stagesW')} 1/2`; // stage «Ноты» passed, no chorus in tempo yet
    if (it.kind === 'lick' && !done(id) && p.stages) { const n = ['rhythm', 'notes'].filter((s) => p.stages[s]).length; return n ? `${t('stagesW')} ${n}/3` : ''; }
    if (it.kind === 'melody' && !done(id)) { const [n, all] = melPhrases(id); return p.echo ? t('melEchoMeta').replace('{n}', n).replace('{m}', all) : ''; }
    if (it.kind === 'perform' && p.runs) return `${p.runs} ${plural(p.runs, 'perfRecs')} · ${t('perfBest')} ${p.bestPct || 0}%`;
    if (it.kind === 'diag' && lastDiag) return `${t('dgLastW')}: ${new Date(lastDiag.date).toLocaleDateString()}`;
    if (it.kind === 'pattern' && p.stages) { const n = ['rhythm', 'notes', 'tempo', 'memory'].filter((s) => p.stages[s]).length; return n ? `${t('stagesW')} ${n}/4` : ''; }
    // an exercise item keeps its stages under the exercise id (the item only gets `done`); no rhythm stage here
    if (it.kind === 'exercise' && !done(id)) { const e = prog[it.ex]; const n = e && e.stages ? ['notes', 'tempo', 'memory'].filter((s) => e.stages[s]).length : 0; return n ? `${t('stagesW')} ${n}/3` : ''; }
    return '';
  };
  const wiki = await wikiIndex().catch(() => null);
  const wikiOf = (it) => (it.kind === 'melody' && wiki && wiki.tunes && wiki.tunes[it.melody]) || null;

  // ---- one item row on the path: [number · title + one line] is the link; the state and «Зачем» sit beside it ----
  let uid = 0;
  const itemRow = (id, n, concert) => {
    const it = items[id], s = status(id);
    const line = it.does || firstSentence(it.about);
    const rest = it.does ? it.about : it.about.slice(firstSentence(it.about).length).trim();
    const r = rev[id];
    const metaLine = [meta(id), r && !q.due.includes(id) && r.due ? `${t('nextReview')} ${new Date(r.due).toLocaleDateString()}` : ''].filter(Boolean).join(' · ');
    const art = wikiOf(it);
    const word = stateWord(id, s);
    const link = h('a.plink', { href: it.href },
      h('span.pn', { 'aria-hidden': 'true' }, concert ? '★' : String(n)),
      h('span.pitembody', null,
        h('span.ptitle', null, concert ? `${t('pConcert')}: ` : null, markTerms(it.title, undefined, 'span')),
        line ? h('span.pline', null, markTerms(line, undefined, 'span')) : null));
    const side = h('div.pside', null, word ? h('span.pstate', null, word) : null);
    const kids = [link, side];
    if (rest || metaLine || art) {
      const bid = `why-${track.id}-${++uid}`;
      const body = h('div.pwhybody', { id: bid, hidden: true });
      let built = false;
      const btn = h('button.pwhy', { type: 'button', 'aria-expanded': 'false', 'aria-controls': bid, onclick: () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        if (open && !built) {
          built = true;
          body.append(...[rest ? h('p', null, markTerms(rest)) : null, metaLine ? h('p.pmeta', null, metaLine) : null,
            art ? h('a.sklink', { href: `#/wiki/${art}` }, t('aboutTune')) : null].filter(Boolean));
        }
        btn.setAttribute('aria-expanded', String(open)); body.hidden = !open;
      } }, t('pWhy'));
      side.append(btn); kids.push(body);
    }
    return h('li.pitem' + (concert ? '.concert' : ''), { 'data-status': s }, ...kids);
  };

  // ---- one step: a heading whose button opens / closes it; rows are built on first open ----
  const stepNode = (s, k) => {
    const sd = stepDone(s, done), pr = stepProgress(s, done);
    const locked = !sd && stepLocked(steps, k, done, [...unlocked]);
    const kind = sd ? 'done' : k === curK ? 'cur' : locked ? 'lock' : 'open';
    const bid = `step-${track.id}-${s.id}`;
    const body = h('div.pstepbody', { id: bid });
    const m = sd ? `✓ ${fill(t('pOf'), { k: pr.total, n: pr.total })}` : kind === 'lock' ? `${pr.total} ${plural(pr.total, 'pExW')}` : fill(t('pOf'), { k: pr.done, n: pr.total });
    const btn = h('button.pstephead', { type: 'button', 'aria-controls': bid },
      h('span.pstepnum', null, p2(k + 1)), h('span.ptitle2', null, stepTitle(s)), h('span.pmeta2', null, m));
    const node = h('section.pstep', { 'data-kind': kind, 'aria-labelledby': bid + '-h' }, h('h2', { id: bid + '-h' }, btn), body);
    let built = false;
    const build = () => {
      if (built) return; built = true;
      if (kind === 'lock') {
        body.append(h('p.popen', null, L(s.goal) ? markTerms(L(s.goal)) : null, ' ',
          h('button.plinkbtn', { type: 'button', onclick: () => {
            store.set('settings', withUnlocked(store.get('settings', {}), track.id, s.id));
            unlocked.add(s.id);
            const fresh = stepNode(s, k); node.replaceWith(fresh);
            const b = fresh.querySelector('.pstephead'); if (b) b.focus();
          } }, t('pOpenAnyway'))));
        return;
      }
      const goal = kind === 'open' ? L(s.goal) : ''; // the current step's goal is on the poster
      if (goal) body.append(h('p.pgoal', null, markTerms(goal)));
      body.append(h('ol.pitems', null, ...s.items.map((id, i) => itemRow(id, i + 1, i === s.items.length - 1 && !s.synthetic && id === concertOf(s)))));
    };
    const set = (open) => { if (open) build(); btn.setAttribute('aria-expanded', String(open)); body.hidden = !open; };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    set(kind === 'cur' || kind === 'open');
    return node;
  };

  // accompaniment: free play over the track's first form (the screen's back button returns here)
  const jamForm = Object.values(track.items).map((it) => it.form || (it.solo && model.solos[it.solo] && model.solos[it.solo].form) || (it.melody && model.melodies[it.melody] && model.melodies[it.melody].form)).find(Boolean);
  const jamRow = h('a.pjam', { href: jamForm ? `#/jam/${jamForm}` : '#/jam', onclick: () => { try { sessionStorage.setItem('jamBack', location.hash || '#/'); } catch (e) { /* no storage: back goes home */ } } }, `${t('pJam')} →`);

  const pathTab = () => h('div.ppath', null, ...steps.map(stepNode), jamRow);

  // ---- every exercise by section: compact ruled rows, title + state ----
  const allTab = () => h('div.pall', null, ...track.sections.map((sec) => h('section.psec', null,
    h('h2.psechead', null, h('span', null, L(sec.title)), h('span.pmeta2', null, `${sec.items.filter(done).length}/${sec.items.length}`)),
    h('ul.pcrows', null, ...sec.items.map((id) => {
      const s = status(id), word = stateWord(id, s);
      return h('li', { 'data-status': s }, h('a.pcrow', { href: items[id].href }, h('span.pctitle', null, markTerms(items[id].title, undefined, 'span')), word ? h('span.pstate', null, word) : null));
    })))));

  // ---- progress: skills, stats, history, goal, fact, data (ruled sections) ----
  const progTab = () => {
    const stats = h('section.panel.stats.two', null,
      h('div', null, h('b', null, String(doneCount), h('small', null, '/' + order.length)), h('span', null, t('itemsDone'))),
      h('div', null, h('b', null, fmtTime(practiceSeconds())), h('span', null, t('practiceTime'))));
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
    const goal = h('section.panel.tip', null, h('b.skhead', null, t('trackGoal')), h('p', null, markTerms(L(track.about))));
    // fact of the day: filled in when its article arrives; stays hidden if the reference cannot load
    const fact = h('section.panel.tip.factcard', { hidden: true });
    factOfDay().then((f) => {
      if (!f) return;
      fact.replaceChildren(h('b.skhead', null, t('factOfDay')), h('p', null, L(f.fact)),
        h('a.sklink', { href: `#/wiki/${f.article.id}` }, `${L(f.article.title)} →`));
      fact.hidden = false;
    }).catch(() => {});
    return h('div.pprog', null, skills, stats, historyPanel(), goal, fact, dataPanel());
  };

  // ---- the right column: text tabs, the chosen panel built on demand (built ones are kept) ----
  const panels = {}, builders = { path: pathTab, all: allTab, prog: progTab };
  const panelBox = h('div.ptabpanel', { role: 'tabpanel', id: `ptab-${track.id}` });
  let curTab = tabOf();
  const tabBtns = TABS.map((k) => h('button', { type: 'button', role: 'tab', id: `ptab-${track.id}-${k}`, 'aria-controls': `ptab-${track.id}`,
    onclick: () => { if (k !== curTab) { curTab = k; setTabOf(k); showTab(); } } }, t('pTab_' + k)));
  const showTab = () => {
    tabBtns.forEach((b, i) => { const on = TABS[i] === curTab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    panelBox.setAttribute('aria-labelledby', `ptab-${track.id}-${curTab}`);
    panels[curTab] = panels[curTab] || builders[curTab]();
    panelBox.replaceChildren(panels[curTab]);
  };
  const tabs = h('div.seg.big.ptabs', { role: 'tablist', 'aria-label': t('pTabsAria'), onkeydown: (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const k = (TABS.indexOf(curTab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    curTab = TABS[k]; setTabOf(curTab); showTab(); tabBtns[k].focus();
  } }, ...tabBtns);
  showTab();

  // ---- the poster: where you are, today's lesson, the one button ----
  const st = steps[curK];
  const segs = h('div.psegs', { 'aria-hidden': 'true', style: `--n: ${steps.length}` }, ...steps.map((s, k) => {
    const pr = stepProgress(s, done);
    const f = stepDone(s, done) ? 100 : k === curK ? Math.round((pr.done / Math.max(1, pr.total)) * 100) : 0;
    return h('i', { style: `--fill: ${f}%` });
  }));
  // the session budget: 10 / 20 / 40 minutes sets how many reviews and new items the list takes (a running session keeps its queue)
  const budgetSeg = h('div.seg.budget', { role: 'group', 'aria-label': t('budgetW') },
    ...Object.keys(BUDGETS).map((b) => h('button', { type: 'button', 'aria-pressed': String(+b === budget), onclick: () => {
      if (+b === budget) return;
      store.set('settings', { ...store.get('settings', {}), budget: +b }); rerender();
    } }, `${b} ${t('min')}`)));
  const fresh = !Object.keys(prog).length && !cur;
  const startBtn = q.ids.length || running ? h('a.btn.pgo', {
    href: running ? items[curNext.id].href : items[q.ids[0]].href,
    onclick: () => { if (!running) startSession(q.ids, track.id); }
  }, h('span', null, fresh ? t('pStart') : t('pContinue')), h('span', { 'aria-hidden': 'true' }, '→')) : null;
  const nextLine = nextId && items[nextId] ? fill(t(q.diag.includes(nextId) ? 'pFirstDiag' : q.due.includes(nextId) ? 'pFirstReview' : 'pNext'), { t: items[nextId].title }) : '';
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
  const mixN = (n, label) => h('span', null, h('b', null, String(n)), label);
  const lesson = h('div.ptoday', null,
    h('div.row.ptodayhead', null, h('span.cap', null, t('pToday')), h('div.grow'), budgetSeg),
    h('div.pmix', null, mixN(q.due.length, t('pMixReview')), mixN(q.fresh.length, t('pMixNew')), mixN(budget, plural(budget, 'pMinW'))),
    startBtn,
    startBtn && nextLine ? h('p.pnextline', null, nextLine) : null,
    startBtn ? null : h('p.pnothing', null, t('nothingToday')),
    startBtn ? null : (() => { const line = todayLine(); return line ? h('p.pnextline', null, line) : null; })(),
    running ? h('button.ptextbtn', { type: 'button', onclick: () => { endSession(track.id); rerender(); } }, t('endSession')) : null,
    others);
  const poster = h('section.hot.pposter', { 'aria-label': t('pToday') },
    h('div.cap', null, L(track.title)),
    h('div.pbig', { 'aria-label': fill(t('pStepAria'), { k: curK + 1, n: steps.length }) }, p2(curK + 1), h('small', null, '/' + p2(steps.length))),
    h('h1.pstitle', null, stepTitle(st)),
    st.goal ? h('p.pgoalbig', null, markTerms(L(st.goal))) : null,
    segs,
    h('div.cap', null, fill(t('pDoneOf'), { x: total.done, y: total.total }) + (complete ? ' · ' + t('pAllDone') : '')),
    lesson);

  root.replaceChildren(header,
    h('main.home', null, poster,
      h('div.plist', null, courseTabs, tabs, panelBox)));
}
