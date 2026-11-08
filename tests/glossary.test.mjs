// Glossary: the content file validates, findTerms marks the right words. Run: node tests/glossary.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findTerms } from '../app/js/glossary-match.js';

const g = JSON.parse(readFileSync(new URL('../content/glossary.json', import.meta.url), 'utf8'));
const course = JSON.parse(readFileSync(new URL('../content/courses/jazz-rhythms.json', import.meta.url), 'utf8'));
const terms = g.terms;

// ---- the file ----
assert.equal(g.$format, 'jazzlab-glossary/1');
assert.ok(terms.length >= 30, 'about thirty terms or more');
assert.equal(new Set(terms.map((x) => x.id)).size, terms.length, 'ids are unique');
for (const x of terms) {
  assert.match(x.id, /^[a-z0-9-]+$/, x.id);
  assert.ok(Array.isArray(x.match) && x.match.length > 0, `${x.id}: match`);
  x.match.forEach((m) => assert.equal(m, m.toLowerCase(), `${x.id}: match stems are lower-case (${m})`));
  for (const lang of ['ru', 'en']) {
    assert.ok(x.title && x.title[lang], `${x.id}: title.${lang}`);
    assert.ok(x.short && x.short[lang], `${x.id}: short.${lang}`);
  }
  assert.ok(x.short.ru.length <= 220, `${x.id}: short.ru is ${x.short.ru.length} chars`);
  assert.ok(x.short.en.length <= 240, `${x.id}: short.en is ${x.short.en.length} chars`);
}

// ---- findTerms ----
const ids = (text, lang = 'ru') => findTerms(text, terms, lang).map((r) => r.id);
const words = (text, lang = 'ru') => findTerms(text, terms, lang).map((r) => text.slice(r.start, r.end));

assert.deepEqual(words('Свинг и хроматика'), ['Свинг', 'хроматика']);
assert.deepEqual(ids('Свинг и хроматика'), ['swing', 'chromatic']);
assert.deepEqual(words('Форшлаги и акценты'), ['Форшлаги', 'акценты']);
assert.deepEqual(ids('Форшлаги и акценты'), ['grace', 'accent']);
assert.deepEqual(ids('Swing and chromatics', 'en'), ['swing', 'chromatic']);
assert.deepEqual(words('Grace notes and accents', 'en'), ['Grace notes', 'accents']);

// every Russian word form of a stem is found, with the original spelling
assert.deepEqual(words('в хроматическом спуске и по хроматике'), ['хроматическом']);
assert.deepEqual(words('Хроматический спуск'), ['Хроматический']);

// the same term twice: one range, the first
const twice = findTerms('Акцент на «раз», потом ещё акцент на «три»', terms, 'ru');
assert.equal(twice.length, 1);
assert.equal(twice[0].start, 0);

// no overlap, sorted, at most four, never inside a word
const texts = ['Свинг и хроматика', 'Форшлаги и акценты', 'Четверть с точкой, синкопа, форшлаг, акцент, пауза и свинг',
  'Три чистых круга подряд над шеллом в блюзовой гамме', ...Object.values(course.steps).map((s) => s.title.ru + '. ' + s.what.ru)];
for (const text of texts) {
  const r = findTerms(text, terms, 'ru');
  assert.ok(r.length <= 4, text);
  for (let i = 0; i < r.length; i++) {
    assert.ok(r[i].end > r[i].start, text);
    if (i) assert.ok(r[i].start >= r[i - 1].end, `overlap in: ${text}`);
  }
  assert.equal(new Set(r.map((x) => x.id)).size, r.length, `one range per term: ${text}`);
}
assert.equal(findTerms('Четверть с точкой, синкопа, форшлаг, акцент, пауза и свинг', terms, 'ru').length, 4);

// a longer match at the same place wins: «четверть с точкой» is one term, not «четверть» plus something
assert.deepEqual(ids('Четверть с точкой'), ['dotted-quarter']);
assert.deepEqual(ids('Четверти и восьмые'), ['quarter', 'eighth']);
// a stem has to start a word: «затакт» is not «такт», «подводка» is not «подход»
assert.deepEqual(ids('Затакт с восьмой паузы'), ['pickup', 'eighth', 'rest']);
// whole words only for Latin stems: «restart» is not «rest», but «rests» is
assert.deepEqual(ids('restart', 'en'), []);
assert.deepEqual(ids('two rests', 'en'), ['rest']);
// Russian stems are not used for the English UI, and plain text finds nothing
assert.deepEqual(ids('Свинг', 'en'), []);
assert.deepEqual(ids('Стандарт'), ['standard']);
assert.deepEqual(ids('Jazz standards', 'en'), ['standard']);
assert.deepEqual(ids('Привет, мир'), []);
assert.deepEqual(findTerms('', terms, 'ru'), []);
assert.deepEqual(findTerms(null, terms, 'ru'), []);
// chord names
assert.deepEqual(words('C7 · F7 · G7 · C7'), ['C7']);
assert.deepEqual(ids('II–V–I'), ['ii-v-i']);

// every course step has a "what" line in both languages, and it explains its own terms
assert.equal(course.steps.length, 11);
for (const s of course.steps) {
  assert.ok(s.what && s.what.ru && s.what.en, `${s.id}: what`);
}
const s3 = course.steps.find((s) => s.id === 's3');
assert.deepEqual(ids(s3.what.ru), ['eighth', 'swing', 'chromatic']);

console.log(`glossary: ${terms.length} terms, all checks passed`);
