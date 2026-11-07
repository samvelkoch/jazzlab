// Boot + hash router.
//   #/              blues track (home)      #/track/<id>   another track
//   #/t/<track>/<item>  a track item: drill | pattern (as an exercise) | exercise | form | lick | perform | diag
//   #/t/<track>/<item>/fingers/<chord>  a lick over one chord as an exercise (RH lick + LH pattern)
//   #/riffs         the book course         #/ex/<id>, #/imp/<step>  its exercises and improvisation
import { applyTheme, currentTheme } from './theme.js';
import { t, L } from './i18n.js';
import { h, ICON, setItemLinks } from './ui.js';
import { autoConnect } from './music/midi.js';
import { loadExercise, normalize } from './music/exercise.js';
import { patternExercise, lickExercise } from './music/forms.js';
import { renderCourse } from './screens/course.js';
import { renderExercise } from './screens/exercise.js';
import { renderImprov } from './screens/improv.js';
import { renderTrack } from './screens/track.js';
import { renderDrill } from './screens/drill.js';
import { renderEar } from './screens/ear.js';
import { renderForm } from './screens/form.js';
import { renderLick } from './screens/lick.js';
import { renderPerform } from './screens/perform.js';
import { renderDiag } from './screens/diag.js';
import { renderChordsHub, renderDecoder, renderKeys, renderLesson, renderPractice } from './screens/chords.js';
import { compExercise } from './music/chord-ex.js';

applyTheme(currentTheme());
autoConnect();

const root = document.getElementById('app');
const base = new URL('../../content/', import.meta.url);
let cleanup = null;
let cache = null;
const models = {};

const get = async (p) => { const r = await fetch(new URL(p, base)); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); };
async function content() {
  if (cache) return cache;
  const [index, course, improv] = await Promise.all([get('index.json'), get('courses/jazz-rhythms.json'), get('improv.json')]);
  cache = { index, course, improv };
  return cache;
}
let chordsCache = null;
async function chordsData() {
  if (chordsCache) return chordsCache;
  const r = await fetch(new URL('chords/lessons.json', base));
  if (!r.ok) throw new Error(`chords/lessons.json: HTTP ${r.status}`);
  chordsCache = await r.json();
  return chordsCache;
}

/** Load a track with its forms, patterns, licks and exercises (items of kind `exercise`, form endings);
 *  resolve every item to { kind, title, about, href, ... }. */
async function trackModel(id) {
  if (models[id]) return models[id];
  const track = await get(`tracks/${id}.json`);
  const formIds = new Set(), patIds = new Set(), lickIds = new Set();
  Object.values(track.items).forEach((it) => { if (it.form) formIds.add(it.form); if (it.pattern) patIds.add(it.pattern); if (it.lick) lickIds.add(it.lick); if (Array.isArray(it.licks)) it.licks.forEach((l) => lickIds.add(l)); });
  const forms = {}, patterns = {}, licks = {};
  await Promise.all([
    ...[...formIds].map(async (f) => { forms[f] = await get(`forms/${f}.json`); }),
    ...[...patIds].map(async (p) => { patterns[p] = await get(`patterns/${p}.json`); }),
    ...[...lickIds].map(async (l) => { licks[l] = await get(`licks/${l}.json`); })
  ]);
  const exIds = new Set();
  Object.values(track.items).forEach((it) => { if (it.kind === 'exercise' && it.ex) exIds.add(it.ex); });
  Object.values(forms).forEach((f) => { if (f.ending) exIds.add(f.ending); });
  const exercises = {};
  await Promise.all([...exIds].map(async (e) => { exercises[e] = await loadExercise(e); }));
  const items = {};
  Object.entries(track.items).forEach(([iid, it]) => {
    const src = it.kind === 'pattern' ? patterns[it.pattern] : it.kind === 'lick' ? licks[it.lick] : it.kind === 'form' ? forms[it.form] : it.kind === 'exercise' ? exercises[it.ex] : null;
    const title = it.title ? L(it.title) : src ? L(src.title) : iid;
    const about = it.about ? L(it.about) : it.kind === 'form' && it.lick ? L(licks[it.lick].about) : src ? L(src.about) : '';
    items[iid] = { ...it, id: iid, title, about, href: `#/t/${id}/${iid}` };
  });
  models[id] = { track, forms, patterns, licks, exercises, items };
  return models[id];
}

function message(text, err) {
  if (err) console.error(err);
  root.replaceChildren(h('div.msg', null, h('h1', null, text), err ? h('p.muted', null, String(err.message || err)) : null,
    h('a.btn.accent', { href: '#/', html: ICON.back + `<span>${t('back')}</span>` })));
}

async function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const hash = location.hash.replace(/^#/, '') || '/';
  const rerender = () => route();
  try {
    const mc = /^\/chords(?:\/(what|keys|l|play|rhythm)(?:\/(.*))?)?$/.exec(hash);
    if (mc) { await routeChords(mc[1], mc[2] ? decodeURIComponent(mc[2]) : '', rerender); window.scrollTo(0, 0); return; }
    const mi = /^\/imp\/(s\d+)$/.exec(hash);
    const m = /^\/ex\/([a-z0-9-]+)$/.exec(hash);
    const mt = /^\/track\/([a-z0-9-]+)$/.exec(hash);
    const mti = /^\/t\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(hash);
    const mtf = /^\/t\/([a-z0-9-]+)\/([a-z0-9-]+)\/fingers\/([A-G]b?[a-z0-9]*)$/.exec(hash);
    if (mi) {
      const { course, improv } = await content();
      const step = course.steps.find((s) => s.id === mi[1]);
      const imp = improv.steps[mi[1]];
      if (!step || !imp) { message(t('notFound')); return; }
      const exs = await Promise.all(step.items.filter((x) => !x.endsWith('-imp')).map(loadExercise));
      document.title = `${t('improv')} · ${t('step')} ${step.n} · Jazzlab`;
      cleanup = renderImprov(root, { step, imp, rhythms: exs.map((e) => ({ id: e.id, number: e.number, rhythm: e.rhythm })) });
    } else if (m) {
      const { course } = await content();
      if (!course.available.includes(m[1])) { message(t('notFound')); return; }
      const ex = await loadExercise(m[1]);
      ex.back = '#/riffs';
      document.title = `${L(ex.title)} · Jazzlab`;
      cleanup = renderExercise(root, { ex, rerender });
    } else if (hash === '/riffs') {
      const { index, course } = await content();
      document.title = `${t('riffs')} · Jazzlab`;
      await renderCourse(root, { index, course, rerender });
    } else if (mtf) {
      // a lick over one chord as a normal exercise: Notes → In tempo → By heart; "by heart" passes the lick item
      const model = await trackModel(mtf[1]);
      const item = model.items[mtf[2]], chord = mtf[3];
      const form = item && model.forms[item.form];
      if (!item || item.kind !== 'lick' || !form || !form.bars.includes(chord)) { message(t('notFound')); return; }
      setItemLinks((id) => model.items[id] ? { href: model.items[id].href, title: model.items[id].title } : null);
      const ex = normalize(lickExercise(model.licks[item.lick], chord, model.patterns[item.pattern], {
        id: `${item.id}-${chord.toLowerCase()}`, course: mtf[1], doneId: item.id, back: item.href,
        kicker: `${L(model.track.title).toUpperCase()} · ${t('lickUpper')} · ${chord}`
      }));
      document.title = `${item.title} · ${chord} · Jazzlab`;
      cleanup = renderExercise(root, { ex, rerender });
    } else if (mti) {
      const model = await trackModel(mti[1]);
      const item = model.items[mti[2]];
      if (!item) { message(t('notFound')); return; }
      setItemLinks((id) => model.items[id] ? { href: model.items[id].href, title: model.items[id].title } : null);
      const back = mti[1] === 'blues' ? '#/' : `#/track/${mti[1]}`;
      document.title = `${item.title} · Jazzlab`;
      if (item.kind === 'drill') cleanup = renderDrill(root, { track: model.track, itemId: item.id, item, back });
      else if (item.kind === 'ear') cleanup = renderEar(root, { track: model.track, itemId: item.id, item, back });
      else if (item.kind === 'form') cleanup = renderForm(root, { track: model.track, itemId: item.id, item, form: model.forms[item.form], pattern: model.patterns[item.pattern], lick: item.lick ? model.licks[item.lick] : null, back });
      else if (item.kind === 'lick') cleanup = renderLick(root, { track: model.track, itemId: item.id, item, lick: model.licks[item.lick], pattern: model.patterns[item.pattern], form: model.forms[item.form], back });
      else if (item.kind === 'perform') {
        // the form's ending (an exercise): its bar count sets the ending length, its item is linked from the reminders
        const form = model.forms[item.form];
        const ending = form.ending ? model.exercises[form.ending] || null : null;
        const endItem = ending ? Object.values(model.items).find((i) => i.kind === 'exercise' && i.ex === form.ending) || null : null;
        cleanup = renderPerform(root, { track: model.track, itemId: item.id, item, form, pattern: model.patterns[item.pattern], licks: (item.licks || []).map((l) => model.licks[l]).filter(Boolean), ending, endItem, back });
      }
      else if (item.kind === 'diag') cleanup = renderDiag(root, { track: model.track, itemId: item.id, item, back });
      else if (item.kind === 'exercise') {
        // a written exercise as a track item: "by heart" marks the item done and schedules its review
        const src = model.exercises[item.ex];
        if (!src) { message(t('notFound')); return; }
        const ex = { ...src, back, doneId: item.id, kicker: `${L(model.track.title).toUpperCase()} · ${t('kind_exercise').toUpperCase()}` };
        cleanup = renderExercise(root, { ex, rerender });
      } else if (item.kind === 'pattern') {
        const form = model.forms[item.form], pattern = model.patterns[item.pattern];
        const ex = normalize(patternExercise(pattern, form.practice || form.bars, {
          id: item.id, course: mti[1], swing: form.swing, back,
          kicker: `${L(model.track.title).toUpperCase()} · ${t('kind_pattern').toUpperCase()} · ${(form.practice || form.bars).join(' ')}`
        }));
        cleanup = renderExercise(root, { ex, rerender });
      } else message(t('notFound'));
    } else {
      const id = mt ? mt[1] : 'blues';
      const [{ index }, model] = await Promise.all([content(), trackModel(id)]);
      setItemLinks((iid) => model.items[iid] ? { href: model.items[iid].href, title: model.items[iid].title } : null);
      document.title = 'Jazzlab';
      await renderTrack(root, { model, index, rerender });
    }
    window.scrollTo(0, 0);
  } catch (err) {
    message(t('loadError'), err);
  }
}

async function routeChords(kind, arg, rerender) {
  const data = await chordsData();
  const lesson = (id) => data.lessons.find((l) => l.id === id && l.kind !== 'keys');
  document.title = `${t('navChords')} · Jazzlab`;
  let c = null;
  if (!kind) c = renderChordsHub(root, { data, rerender });
  else if (kind === 'what') c = renderDecoder(root, { sym: arg || 'B7sus', data });
  else if (kind === 'keys') c = renderKeys(root);
  else if (kind === 'l' && lesson(arg)) c = renderLesson(root, { lesson: lesson(arg) });
  else if (kind === 'play') c = renderPractice(root, { setId: arg || 'mix', data });
  else if (kind === 'rhythm' && lesson(arg)) {
    const ex = normalize(compExercise(lesson(arg)));
    document.title = `${L(ex.title)} · Jazzlab`;
    c = renderExercise(root, { ex, rerender });
  }
  if (c === null || c === undefined) { if (kind) message(t('notFound')); return; }
  cleanup = c;
}

window.addEventListener('hashchange', route);
route();
