// The learner path: `steps` in every track and the pure helpers of app/js/path.js. Run: node tests/path.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { stepsOf, stepProgress, stepDone, currentStepIndex, pathComplete, concertOf, pathProgress, unlockedOf, withUnlocked, stepLocked, firstSentence, chaptersOf, chapterOpen, unlockedChaptersOf, withUnlockedChapter, homeChapter } from '../app/js/path.js';
import { learningOrder } from '../app/js/queue.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const files = readdirSync(join(root, 'content/tracks')).filter((f) => f.endsWith('.json'));
const CONCERT_KINDS = ['form', 'solo', 'perform', 'exercise'];

for (const f of files) {
  const tr = read(`content/tracks/${f}`);
  assert.ok(Array.isArray(tr.steps) && tr.steps.length, `${tr.id}: has steps`);
  const ids = tr.steps.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `${tr.id}: step ids unique`);
  // path = the steps' items glued in order; every path id in exactly one step
  assert.deepEqual(tr.steps.flatMap((s) => s.items), tr.path, `${tr.id}: steps glued = path`);
  tr.path.forEach((id) => assert.equal(tr.steps.filter((s) => s.items.includes(id)).length, 1, `${tr.id}: ${id} in exactly one step`));
  for (const s of tr.steps) {
    assert.ok(s.items.length >= 6 && s.items.length <= 9, `${tr.id}/${s.id}: 6–9 items (${s.items.length})`);
    s.items.forEach((id) => assert.ok(id in tr.items, `${tr.id}/${s.id}: ${id} exists`));
    s.items.forEach((id) => assert.notEqual(tr.items[id].kind, 'diag', `${tr.id}/${s.id}: no check-up in a step`));
    assert.ok(CONCERT_KINDS.includes(tr.items[concertOf(s)].kind), `${tr.id}/${s.id}: the concert ${concertOf(s)} is a form / solo / performance / exercise`);
    for (const k of ['title', 'goal']) assert.ok(s[k] && s[k].ru && s[k].en, `${tr.id}/${s.id}: ${k} in ru and en`);
  }
  assert.deepEqual(stepsOf(tr), tr.steps);
}

// ---- helpers ----
const steps = [{ id: 's1', items: ['a', 'b', 'c'] }, { id: 's2', items: ['d', 'e'] }, { id: 's3', items: ['f', 'g'] }];
const doneOf = (...ids) => (id) => ids.includes(id);

// a fresh learner: step 1, nothing done
assert.equal(currentStepIndex(steps, doneOf()), 0);
assert.deepEqual(stepProgress(steps[0], doneOf()), { done: 0, total: 3 });
assert.deepEqual(pathProgress(steps, doneOf()), { done: 0, total: 7 });
assert.equal(concertOf(steps[0]), 'c');

// items done out of order count where they stand, but the current step is the first unfinished one
const mid = doneOf('a', 'b', 'c', 'd', 'f');
assert.equal(currentStepIndex(steps, mid), 1);
assert.ok(stepDone(steps[0], mid) && !stepDone(steps[1], mid));
assert.deepEqual(stepProgress(steps[2], mid), { done: 1, total: 2 });
assert.deepEqual(pathProgress(steps, mid), { done: 5, total: 7 });
// a later step finished first does not move the current step past an unfinished earlier one
assert.equal(currentStepIndex(steps, doneOf('a', 'b', 'f', 'g')), 0);

// all done: the last step, flagged complete
const all = doneOf('a', 'b', 'c', 'd', 'e', 'f', 'g');
assert.equal(currentStepIndex(steps, all), 2);
assert.ok(pathComplete(steps, all) && !pathComplete(steps, mid));

// soft locks: steps after the current one, unless the learner opened them
assert.equal(stepLocked(steps, 0, doneOf()), false, 'the current step is never locked');
assert.equal(stepLocked(steps, 1, doneOf()), true);
assert.equal(stepLocked(steps, 2, doneOf(), ['s3']), false, 'opened ahead of time');
assert.equal(stepLocked(steps, 0, mid), false, 'a finished step is not locked');
assert.equal(stepLocked(steps, 2, all), false);

// settings.unlocked: per track, added without changing the input or the other settings
assert.deepEqual(unlockedOf({}, 'blues'), []);
assert.deepEqual(unlockedOf({ unlocked: { blues: 'bad' } }, 'blues'), []);
const s0 = { budget: 10, unlocked: { bossa: ['s2'] } };
const s1 = withUnlocked(s0, 'blues', 's3');
assert.deepEqual(s1, { budget: 10, unlocked: { bossa: ['s2'], blues: ['s3'] } });
assert.deepEqual(s0, { budget: 10, unlocked: { bossa: ['s2'] } }, 'input unchanged');
assert.deepEqual(withUnlocked(s1, 'blues', 's3'), s1, 'adding twice keeps one');
assert.deepEqual(withUnlocked(undefined, 'std', 's2'), { unlocked: { std: ['s2'] } });

// a track without steps: one synthetic step over its learning order
const bare = { title: { ru: 'X', en: 'X' }, sections: [{ items: ['a', 'b'] }, { items: ['c'] }] };
assert.equal(stepsOf(bare).length, 1);
assert.deepEqual(stepsOf(bare)[0].items, learningOrder(bare));
assert.deepEqual(stepsOf({ ...bare, path: ['c', 'a'] })[0].items, ['c', 'a']);
// the line under an item title: the first sentence of `about`, abbreviations kept
assert.equal(firstSentence('Две ноты. Какая выше?'), 'Две ноты.');
assert.equal(firstSentence('Play St. Louis Blues slowly. Then faster.'), 'Play St. Louis Blues slowly.');
assert.equal(firstSentence('Звучит II–V–I. Угадай.'), 'Звучит II–V–I.');
assert.equal(firstSentence('One sentence only'), 'One sentence only');
assert.equal(firstSentence('Ноты: C, E, G. А потом? Нет.'), 'Ноты: C, E, G.');
assert.equal(firstSentence('Готово! «Ещё» раз.'), 'Готово!');
assert.equal(firstSentence(''), '');
console.log('ok: path (steps in every track, helpers)');

// ---- chapters: content/index.json `chapter` 1..N unique, `opensAfter` names a chapter track with enough steps ----
const index = read('content/index.json');
const chaps = chaptersOf(index);
assert.deepEqual(chaps.map((c) => c.chapter), chaps.map((_, i) => i + 1), 'chapters are 1..N, unique');
assert.deepEqual(chaps.map((c) => c.id), ['blues', 'bossa', 'std'], 'blues → bossa → standards');
for (const c of chaps) {
  assert.equal(c.kind, 'track', `${c.id}: a chapter is a track`);
  if (!c.opensAfter) { assert.equal(c.chapter, 1, `${c.id}: only the first chapter has no rule`); continue; }
  const prev = chaps.find((x) => x.id === c.opensAfter.track);
  assert.ok(prev, `${c.id}: opensAfter.track ${c.opensAfter.track} is a chapter`);
  assert.equal(prev.chapter, c.chapter - 1, `${c.id}: opens after the previous chapter`);
  assert.ok(Number.isInteger(c.opensAfter.step) && c.opensAfter.step >= 1, `${c.id}: opensAfter.step is a step number`);
  assert.ok(read(`content/tracks/${prev.id}.json`).steps.length >= c.opensAfter.step, `${c.id}: ${prev.id} has ${c.opensAfter.step}+ steps`);
}
assert.ok(!index.courses.find((c) => c.id === 'jazz-rhythms').chapter, 'the riffs course is not a chapter');

// chapterOpen: the rule (steps 1..N of the previous chapter done), progress in it, opened anyway
const rule = { track: 'x', step: 2 };
assert.equal(chapterOpen(null, null, doneOf()), true, 'no rule: open');
assert.equal(chapterOpen(rule, steps, doneOf()), false, 'fresh: closed');
assert.equal(chapterOpen(rule, steps, doneOf('a', 'b', 'c', 'd')), false, 'step 2 not finished');
assert.equal(chapterOpen(rule, steps, doneOf('a', 'b', 'c', 'd', 'e')), true, 'steps 1..2 done');
assert.equal(chapterOpen(rule, steps, doneOf('d', 'e')), false, 'step 2 alone is not enough');
assert.equal(chapterOpen(rule, steps, doneOf(), true), true, 'progress in the chapter keeps it open');
assert.equal(chapterOpen(rule, steps, doneOf(), false, true), true, 'opened anyway');
assert.equal(chapterOpen(rule, undefined, doneOf()), true, 'previous steps unknown: never lock');
assert.equal(chapterOpen({ track: 'x', step: 5 }, steps, doneOf('a', 'b', 'c', 'd', 'e', 'f', 'g')), false, 'fewer steps than the rule: closed');

// settings.unlockedChapters and settings.chapter
assert.deepEqual(unlockedChaptersOf({}), []);
assert.deepEqual(unlockedChaptersOf({ unlockedChapters: 'bossa' }), []);
const c0 = { budget: 20, chapter: 'blues' };
const c1 = withUnlockedChapter(c0, 'bossa');
assert.deepEqual(c1, { budget: 20, chapter: 'blues', unlockedChapters: ['bossa'] });
assert.deepEqual(c0, { budget: 20, chapter: 'blues' }, 'input unchanged');
assert.deepEqual(withUnlockedChapter(c1, 'bossa'), c1, 'adding twice keeps one');
assert.equal(homeChapter({}, chaps), 'blues');
assert.equal(homeChapter({ chapter: 'bossa' }, chaps), 'bossa');
assert.equal(homeChapter({ chapter: 'jazz-rhythms' }, chaps), 'blues', 'not a chapter: the first one');
assert.equal(homeChapter(null, chaps), 'blues');
console.log('ok: chapters');
