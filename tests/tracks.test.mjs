// Track learning order (`path`) and today's queue over it. Run: node tests/tracks.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { freshItems, learningOrder, budgetLimits, BUDGETS } from '../app/js/queue.js';
import { itemDone } from '../app/js/store.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const files = readdirSync(join(root, 'content/tracks')).filter((f) => f.endsWith('.json'));
assert.ok(files.length >= 3);

for (const f of files) {
  const tr = read(`content/tracks/${f}`);
  const inSections = tr.sections.flatMap((s) => s.items);
  if (!tr.path) continue;
  const path = tr.path;
  path.forEach((id) => assert.ok(id in tr.items, `${tr.id}: path id ${id} exists in items`));
  assert.equal(new Set(path).size, path.length, `${tr.id}: no duplicates in path`);
  inSections.filter((id) => tr.items[id].kind !== 'diag').forEach((id) =>
    assert.equal(path.filter((x) => x === id).length, 1, `${tr.id}: ${id} appears in path exactly once`));
  path.forEach((id) => assert.ok(inSections.includes(id), `${tr.id}: path id ${id} is in some section`));
  assert.deepEqual(learningOrder(tr), path);
}
['blues', 'bossa', 'std'].forEach((id) => assert.ok(Array.isArray(read(`content/tracks/${id}.json`).path), id + ' has a path'));

// without a path the sections are the order
assert.deepEqual(learningOrder({ sections: [{ items: ['a', 'b'] }, { items: ['c'] }] }), ['a', 'b', 'c']);

// the blues: a fresh learner gets the first notes drill and the ear game, ear first (the check-up comes separately)
const blues = read('content/tracks/blues.json');
const none = () => false;
assert.deepEqual(freshItems(learningOrder(blues), blues.items, none, 2), ['d-white', 'ear-find']);
assert.deepEqual(freshItems(learningOrder(blues), blues.items, none, 3), ['d-white', 'ear-find', 'pat-p1']);
// the first whole form comes within the first four items of the path
assert.ok(learningOrder(blues).indexOf('form-p1') < 4);

// the performance: offered only once every path item before it is done; done once it has a recorded run
const prog = {};
const order = learningOrder(blues);
const before = order.slice(0, order.indexOf('perf-blues'));
const doneTo = (ids) => (id) => ids.includes(id) || itemDone(blues.items[id], prog[id]);
assert.ok(!freshItems(order, blues.items, doneTo(before.slice(0, -1)), 3).includes('perf-blues'), 'one item left before it: not yet');
assert.equal(freshItems(order, blues.items, doneTo(before), 1)[0], 'perf-blues', 'everything before it done: it is next');
assert.equal(itemDone({ kind: 'perform' }, undefined), false);
assert.equal(itemDone({ kind: 'perform' }, { runs: 0 }), false);
assert.equal(itemDone({ kind: 'perform' }, { runs: 1, bestPct: 40 }), true, 'one recorded run counts as done');
prog['perf-blues'] = { runs: 1 };
assert.equal(freshItems(order, blues.items, doneTo(before), 1)[0], 'imp-b4', 'recorded: the path goes on');

// the session budget
assert.deepEqual(budgetLimits(10), { reviews: 3, fresh: 1 });
assert.deepEqual(budgetLimits(20), { reviews: 4, fresh: 2 });
assert.deepEqual(budgetLimits(40), { reviews: 6, fresh: 3 });
assert.deepEqual(budgetLimits(undefined), BUDGETS[20], 'default 20 minutes');
assert.deepEqual(budgetLimits(15), BUDGETS[20]);

// the both-hands form items reuse existing material
const bossa = read('content/tracks/bossa.json'), std = read('content/tracks/std.json');
const both = { ...blues.items, ...bossa.items, ...std.items };
['form-2h-l1', 'form-2h-qa', 'form-2h-bossa', 'form-2h-std'].forEach((id) => {
  const it = both[id];
  assert.equal(it.kind, 'form'); assert.equal(it.hand, 'both');
  read(`content/forms/${it.form}.json`); read(`content/patterns/${it.pattern}.json`);
  if (it.lick) read(`content/licks/${it.lick}.json`);
  (it.licks || []).forEach((l) => read(`content/licks/${l}.json`));
  if (it.melody) read(`content/melodies/${it.melody}.json`);
});
assert.deepEqual([std.items['form-2h-std'].form, std.items['form-2h-std'].pattern, std.items['form-2h-std'].melody],
  [std.items['form-mel-std'].form, std.items['form-mel-std'].pattern, std.items['form-mel-std'].melody]);
console.log('ok: tracks (path, queue, budget, both hands)');
