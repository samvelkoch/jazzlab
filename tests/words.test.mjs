// «Новое слово» cards and the texts of the path: a glossary term shows up in a card's title, line (`does`) or «Зачем»
// (`about`) only once its word card has come. Run: node tests/words.test.mjs
// Walk: chapters blues → bossa → standards, steps and items in order; a step's cards add their `term` and `covers` to
// the known words right before their `before` item; known words carry over to the next chapters.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { findTerms } from '../app/js/glossary-match.js';
import { chaptersOf } from '../app/js/path.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const glossary = read('content/glossary.json');
const termIds = new Set(glossary.terms.map((x) => x.id));
const chapters = chaptersOf(read('content/index.json'));
assert.deepEqual(chapters.map((c) => c.id), ['blues', 'bossa', 'std'], 'the chapter order');

// Everyday words that a glossary stem also matches (each with its reason). Keep this short.
const ALLOW = new Set([
  // «фраза» is the word the whole course uses for a lick; it is the `lick` term itself, so nothing to allow yet
]);

// ---- the source file of an item, the way trackModel (app/js/main.js) resolves `about` ----
const cache = {};
const src = (dir, id) => {
  const p = `content/${dir}/${id}.json`;
  if (!(p in cache)) cache[p] = existsSync(join(root, p)) ? read(p) : null;
  return cache[p];
};
const ru = (v) => (v && typeof v === 'object' ? v.ru || '' : v || '');
function resolvedAbout(it) {
  if (it.about) return ru(it.about);
  if (it.kind === 'form' && it.lick && !it.licks) return ru(src('licks', it.lick).about);
  if (it.kind === 'form' && it.lickKey) return ru(src('licks', it.lickKey).about);
  const s = it.kind === 'pattern' ? src('patterns', it.pattern) : it.kind === 'lick' ? src('licks', it.lick) : it.kind === 'melody' ? src('melodies', it.melody)
    : it.kind === 'solo' ? src('solos', it.solo) : it.kind === 'form' ? src('forms', it.form) : it.kind === 'exercise' ? src('exercises', it.ex) : null;
  return s ? ru(s.about) : '';
}

const fails = [];
const check = (where, text, known) => {
  for (const r of findTerms(text, glossary.terms, 'ru', 999)) {
    if (!known.has(r.id) && !ALLOW.has(r.id)) fails.push(`${where}: «${text.slice(r.start, r.end)}» is ${r.id} before its card · ${text}`);
  }
};

const known = new Set();
const introduced = new Map();
let cards = 0;
for (const c of chapters) {
  const tr = read(`content/tracks/${c.id}.json`);
  for (const s of tr.steps) {
    const words = s.words || [];
    assert.ok(Array.isArray(words), `${tr.id}/${s.id}: words is a list`);
    for (const w of words) {
      const at = `${tr.id}/${s.id}/${w.term}`;
      assert.ok(termIds.has(w.term), `${at}: the term is in the glossary`);
      assert.ok(s.items.includes(w.before), `${at}: before ${w.before} is an item of the step`);
      for (const k of ['word', 'text']) assert.ok(w[k] && w[k].ru && w[k].en, `${at}: ${k} in ru and en`);
      assert.ok(Array.isArray(w.keys) && w.keys.every((g) => Array.isArray(g) && g.length && g.every((n) => /^[A-G][b#]?\d$/.test(n))), `${at}: keys are groups of note names`);
      (w.covers || []).forEach((id) => assert.ok(termIds.has(id), `${at}: covers ${id} is in the glossary`));
      for (const id of [w.term, ...(w.covers || [])]) {
        assert.ok(!introduced.has(id), `${at}: ${id} is introduced once (already at ${introduced.get(id)})`);
        introduced.set(id, at);
      }
      cards++;
    }
    // the step's title and goal may use the step's own words
    const stepKnown = new Set([...known, ...words.flatMap((w) => [w.term, ...(w.covers || [])])]);
    check(`${tr.id}/${s.id} title`, ru(s.title), stepKnown);
    check(`${tr.id}/${s.id} goal`, ru(s.goal), stepKnown);
    for (const id of s.items) {
      for (const w of words.filter((x) => x.before === id)) {
        known.add(w.term); (w.covers || []).forEach((x) => known.add(x));
        check(`${tr.id}/${s.id} card ${w.term}`, w.text.ru, known);
      }
      const it = tr.items[id];
      for (const lang of ['ru', 'en']) {
        assert.ok(it.title && it.title[lang], `${tr.id}/${id}: title.${lang} on the item`);
        assert.ok(it.does && it.does[lang], `${tr.id}/${id}: does.${lang} on the item`);
      }
      assert.ok(it.does.ru.length <= 75, `${tr.id}/${id}: does.ru is ${it.does.ru.length} chars (≤ 75): ${it.does.ru}`);
      check(`${tr.id}/${id} title`, ru(it.title), known);
      check(`${tr.id}/${id} does`, ru(it.does), known);
      check(`${tr.id}/${id} about`, resolvedAbout(it), known);
    }
  }
}
assert.ok(cards >= 20, `word cards: ${cards}`);
assert.ok(fails.length === 0, `${fails.length} term(s) before their card:\n` + fails.join('\n'));

console.log(`words: ${cards} cards, ${introduced.size} terms introduced, every path text uses only known terms`);
