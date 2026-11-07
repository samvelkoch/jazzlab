// Boot + hash router.
//   #/              blues track (home)      #/track/<id>   another track
//   #/t/<track>/<item>  a track item: drill | pattern (as an exercise) | exercise | form | lick | melody | perform | diag
//   #/t/<track>/<item>/fingers/<chord>  a lick over one chord as an exercise (RH lick + LH pattern)
//   #/t/<track>/<item>/fingers/<key>    a key-relative lick (item.keys) in one key (RH lick + LH pattern over lick.prog)
//   #/t/<track>/<item>/fingers/<n|all>  a melody phrase (or the whole melody) as an exercise (RH melody + LH pattern)
//   #/riffs         the book course         #/ex/<id>, #/imp/<step>  its exercises and improvisation
import { applyTheme, currentTheme } from './theme.js';
import { t, L } from './i18n.js';
import { h, ICON, setItemLinks } from './ui.js';
import { autoConnect } from './music/midi.js';
import { loadExercise, normalize } from './music/exercise.js';
import { patternExercise, lickExercise, lickExerciseKey, melodyExercise, barChords } from './music/forms.js';
import { renderCourse } from './screens/course.js';
import { renderExercise } from './screens/exercise.js';
import { renderImprov } from './screens/improv.js';
import { renderTrack } from './screens/track.js';
import { renderDrill } from './screens/drill.js';
import { renderEar } from './screens/ear.js';
import { renderForm } from './screens/form.js';
import { renderLick } from './screens/lick.js';
import { renderMelody } from './screens/melody.js';
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

/** Load a track with its melodies, forms, patterns, licks and exercises (items of kind `exercise`, form endings);
 *  resolve every item to { kind, title, about, href, ... }. */
async function trackModel(id) {
  if (models[id]) return models[id];
  const track = await get(`tracks/${id}.json`);
  const formIds = new Set(), patIds = new Set(), lickIds = new Set(), melIds = new Set();
  Object.values(track.items).forEach((it) => { if (it.melody) melIds.add(it.melody); });
  const melodies = {};
  await Promise.all([...melIds].map(async (m) => { melodies[m] = await get(`melodies/${m}.json`); }));
  Object.values(melodies).forEach((m) => { if (m.form) formIds.add(m.form); }); // a melody item has no form of its own
  Object.values(track.items).forEach((it) => { if (it.form) formIds.add(it.form); if (it.pattern) patIds.add(it.pattern); if (it.lick) lickIds.add(it.lick); if (it.lickKey) lickIds.add(it.lickKey); [it.licks, it.licksKey].forEach((ls) => { if (Array.isArray(ls)) ls.forEach((l) => lickIds.add(l)); }); });
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
    const src = it.kind === 'pattern' ? patterns[it.pattern] : it.kind === 'lick' ? licks[it.lick] : it.kind === 'melody' ? melodies[it.melody] : it.kind === 'form' ? forms[it.form] : it.kind === 'exercise' ? exercises[it.ex] : null;
    const title = it.title ? L(it.title) : src ? L(src.title) : iid;
    const about = it.about ? L(it.about) : it.kind === 'form' && it.lick && !it.licks ? L(licks[it.lick].about) : it.kind === 'form' && it.lickKey ? L(licks[it.lickKey].about) : src ? L(src.about) : '';
    items[iid] = { ...it, id: iid, title, about, href: `#/t/${id}/${iid}` };
  });
  models[id] = { track, forms, patterns, licks, melodies, exercises, items };
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
    const mtf = /^\/t\/([a-z0-9-]+)\/([a-z0-9-]+)\/fingers\/([A-G]b?[a-z0-9]*|\d+|all)$/.exec(hash);
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
    } else if (mtf && /^(\d+|all)$/.test(mtf[3])) {
      // a melody phrase (or the whole melody) as a normal exercise; only the whole one passes the melody item
      const model = await trackModel(mtf[1]);
      const item = model.items[mtf[2]];
      const melody = item && item.kind === 'melody' ? model.melodies[item.melody] : null;
      const form = melody && model.forms[melody.form];
      const all = mtf[3] === 'all', pi = all ? -1 : +mtf[3];
      if (!melody || !form || (!all && !melody.phrases[pi])) { message(t('notFound')); return; }
      setItemLinks((id) => model.items[id] ? { href: model.items[id].href, title: model.items[id].title } : null, mtf[1]);
      const range = all ? [0, melody.bars.length - 1] : melody.phrases[pi];
      const label = all ? t('mlAll') : `${t('mlBars')} ${range[0] + 1}–${range[1] + 1}`;
      const ex = normalize(melodyExercise(melody, range, model.patterns[item.pattern], {
        id: all ? `${item.id}-all` : `${item.id}-p${pi}`, course: mtf[1], doneId: all ? item.id : null, back: item.href, flats: true,
        title: `${item.title} · ${label}`,
        kicker: `${L(model.track.title).toUpperCase()} · ${t('melUpper')} · ${label}`
      }));
      document.title = `${item.title} · ${label} · Jazzlab`;
      cleanup = renderExercise(root, { ex, rerender });
    } else if (mtf) {
      // a lick over one chord as a normal exercise: Notes → In tempo → By heart; "by heart" passes the lick item
      const model = await trackModel(mtf[1]);
      const item = model.items[mtf[2]], chord = mtf[3];
      const klick = item && item.kind === 'lick' && Array.isArray(item.keys) ? model.licks[item.lick] : null;
      if (klick && klick.prog) {
        // a key-relative lick in one key (chord = the key: F, Bb)
        if (!item.keys.includes(chord)) { message(t('notFound')); return; }
        setItemLinks((id) => model.items[id] ? { href: model.items[id].href, title: model.items[id].title } : null, mtf[1]);
        const ex = normalize(lickExerciseKey(klick, chord, model.patterns[item.pattern], {
          id: `${item.id}-${chord.toLowerCase()}`, course: mtf[1], doneId: item.id, back: item.href,
          kicker: `${L(model.track.title).toUpperCase()} · ${t('lickUpper')} · ${chord}`
        }));
        document.title = `${item.title} · ${chord} · Jazzlab`;
        cleanup = renderExercise(root, { ex, rerender });
        window.scrollTo(0, 0);
        return;
      }
      const form = item && model.forms[item.form];
      // the chords a lick is practised over: the item's own set (item.chords) or every chord of the form
      const lickChords = item && Array.isArray(item.chords) && item.chords.length ? item.chords : form ? form.bars.flatMap(barChords) : [];
      if (!item || item.kind !== 'lick' || !form || !lickChords.includes(chord)) { message(t('notFound')); return; }
      setItemLinks((id) => model.items[id] ? { href: model.items[id].href, title: model.items[id].title } : null, mtf[1]);
      const ex = normalize(lickExercise(model.licks[item.lick], chord, model.patterns[item.pattern], {
        id: `${item.id}-${chord.toLowerCase()}`, course: mtf[1], doneId: item.id, back: item.href, flats: !!form.flats,
        kicker: `${L(model.track.title).toUpperCase()} · ${t('lickUpper')} · ${chord}`
      }));
      document.title = `${item.title} · ${chord} · Jazzlab`;
      cleanup = renderExercise(root, { ex, rerender });
    } else if (mti) {
      const model = await trackModel(mti[1]);
      const item = model.items[mti[2]];
      if (!item) { message(t('notFound')); return; }
      setItemLinks((id) => model.items[id] ? { href: model.items[id].href, title: model.items[id].title } : null, mti[1]);
      const back = mti[1] === 'blues' ? '#/' : `#/track/${mti[1]}`;
      document.title = `${item.title} · Jazzlab`;
      if (item.kind === 'drill') cleanup = renderDrill(root, { track: model.track, itemId: item.id, item, back });
      else if (item.kind === 'ear') cleanup = renderEar(root, { track: model.track, itemId: item.id, item, back });
      else if (item.kind === 'form') cleanup = renderForm(root, { track: model.track, itemId: item.id, item, form: model.forms[item.form], pattern: model.patterns[item.pattern], lick: item.lick ? model.licks[item.lick] : null, licks: Array.isArray(item.licks) ? item.licks.map((l) => model.licks[l]).filter(Boolean) : null, keyLicks: item.lickKey ? [model.licks[item.lickKey]].filter(Boolean) : Array.isArray(item.licksKey) ? item.licksKey.map((l) => model.licks[l]).filter(Boolean) : null, melody: item.melody ? model.melodies[item.melody] || null : null, back });
      else if (item.kind === 'melody') {
        const melody = model.melodies[item.melody];
        if (!melody || !model.forms[melody.form]) { message(t('notFound')); return; }
        cleanup = renderMelody(root, { track: model.track, itemId: item.id, item, melody, pattern: model.patterns[item.pattern], form: model.forms[melody.form], back });
      }
      else if (item.kind === 'lick') cleanup = renderLick(root, { track: model.track, itemId: item.id, item, lick: model.licks[item.lick], pattern: model.patterns[item.pattern], form: model.forms[item.form], back });
      else if (item.kind === 'perform') {
        // the form's ending (an exercise): its bar count sets the ending length, its item is linked from the reminders
        const form = model.forms[item.form];
        const ending = form.ending ? model.exercises[form.ending] || null : null;
        const endItem = ending ? Object.values(model.items).find((i) => i.kind === 'exercise' && i.ex === form.ending) || null : null;
        // the tune to play: a reminder line linking to the track's melody item
        const melody = item.melody ? model.melodies[item.melody] || null : null;
        const melItem = melody ? Object.values(model.items).find((i) => i.kind === 'melody' && i.melody === item.melody) || null : null;
        cleanup = renderPerform(root, { track: model.track, itemId: item.id, item, form, pattern: model.patterns[item.pattern], licks: (item.licks || []).map((l) => model.licks[l]).filter(Boolean), ending, endItem, melody, melItem, back });
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
        // over: "bars" = the pattern over the whole form; default = over the form's short practice sequence
        const seq = item.over === 'bars' ? form.bars : form.practice || form.bars;
        const ex = normalize(patternExercise(pattern, seq, {
          id: item.id, course: mti[1], swing: form.style === 'bossa' ? false : form.swing, flats: !!form.flats, back, title: item.title, about: item.about || null,
          kicker: `${L(model.track.title).toUpperCase()} · ${t('kind_pattern').toUpperCase()} · ${item.over === 'bars' ? L(form.title) : seq.join(' ')}`
        }));
        cleanup = renderExercise(root, { ex, rerender });
      } else message(t('notFound'));
    } else {
      const id = mt ? mt[1] : 'blues';
      const [{ index }, model] = await Promise.all([content(), trackModel(id)]);
      setItemLinks((iid) => model.items[iid] ? { href: model.items[iid].href, title: model.items[iid].title } : null, id);
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
