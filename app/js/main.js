// Boot + hash router: #/ (course) and #/ex/<id> (exercise).
import { applyTheme, currentTheme } from './theme.js';
import { t, L } from './i18n.js';
import { h, ICON } from './ui.js';
import { autoConnect } from './music/midi.js';
import { loadExercise } from './music/exercise.js';
import { renderCourse } from './screens/course.js';
import { renderExercise } from './screens/exercise.js';
import { renderImprov } from './screens/improv.js';

applyTheme(currentTheme());
autoConnect();

const root = document.getElementById('app');
const base = new URL('../../content/', import.meta.url);
let cleanup = null;
let cache = null;

async function content() {
  if (cache) return cache;
  const get = async (p) => { const r = await fetch(new URL(p, base)); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); };
  const index = await get('index.json');
  const course = await get('courses/jazz-rhythms.json');
  const improv = await get('improv.json');
  cache = { index, course, improv };
  return cache;
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
    const mi = /^\/imp\/(s\d+)$/.exec(hash);
    const m = /^\/ex\/([a-z0-9-]+)$/.exec(hash);
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
      document.title = `${L(ex.title)} · Jazzlab`;
      cleanup = renderExercise(root, { ex, rerender });
    } else {
      const { index, course } = await content();
      document.title = 'Jazzlab';
      await renderCourse(root, { index, course, rerender });
    }
    window.scrollTo(0, 0);
  } catch (err) {
    message(t('loadError'), err);
  }
}

window.addEventListener('hashchange', route);
route();
