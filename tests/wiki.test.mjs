// Reference articles (content/wiki): shape, both languages, ids, images. Run: node tests/wiki.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'content/wiki');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const KINDS = new Set(['style', 'tune', 'person', 'concept']);

const index = read(join(dir, 'index.json'));
const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');
const arts = Object.fromEntries(files.map((f) => [f.replace(/\.json$/, ''), read(join(dir, f))]));

const both = (v, what) => {
  assert.ok(v && typeof v === 'object', `${what}: {ru, en}`);
  for (const l of ['ru', 'en']) assert.ok(typeof v[l] === 'string' && v[l].trim(), `${what}.${l} non-empty`);
};
const url = (u, what) => assert.ok(typeof u === 'string' && /^https:\/\/[^\s]+$/.test(u), `${what}: https URL (${u})`);

for (const [id, a] of Object.entries(arts)) {
  const w = `wiki/${id}`;
  assert.equal(a.$format, 'jazzlab-wiki/1', `${w}: $format`);
  assert.equal(a.id, id, `${w}: id matches file name`);
  assert.ok(KINDS.has(a.kind), `${w}: kind ${a.kind}`);
  both(a.title, `${w}.title`); both(a.lead, `${w}.lead`);
  for (const l of ['ru', 'en']) {
    assert.ok(Array.isArray(a.body[l]) && a.body[l].length >= 2 && a.body[l].length <= 6, `${w}.body.${l}: 2–6 paragraphs`);
    a.body[l].forEach((p, i) => assert.ok(typeof p === 'string' && p.trim() && !/\*\*|`|\]\(|^#/.test(p), `${w}.body.${l}[${i}]: plain text`));
  }
  assert.equal(a.body.ru.length, a.body.en.length, `${w}: same paragraph count ru/en`);
  assert.ok(Array.isArray(a.facts) && a.facts.length >= 2 && a.facts.length <= 4, `${w}: 2–4 facts`);
  a.facts.forEach((f, i) => both(f, `${w}.facts[${i}]`));
  if (a.image) {
    assert.match(a.image.url, /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/[^\s?]+\?width=\d+$/, `${w}.image.url: Commons FilePath`);
    assert.match(a.image.source, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:\S+$/, `${w}.image.source: Commons file page`);
    both(a.image.alt, `${w}.image.alt`);
    assert.ok(a.image.credit && a.image.license, `${w}.image: credit + license`);
    assert.match(a.image.license, /public domain|CC/i, `${w}.image.license: free`);
  }
  assert.ok(Array.isArray(a.links) && a.links.length >= 1, `${w}: links`);
  a.links.forEach((l, i) => { both(l.title, `${w}.links[${i}].title`); url(l.url, `${w}.links[${i}].url`); });
  assert.ok(Array.isArray(a.sources) && a.sources.length >= 1, `${w}: sources non-empty`);
  a.sources.forEach((s, i) => url(s, `${w}.sources[${i}]`));
  (a.related || []).forEach((r) => { assert.ok(arts[r], `${w}: related ${r} exists`); assert.notEqual(r, id, `${w}: not related to itself`); });
}

// the index: every listed id exists, sits in the group of its kind, appears once; every article is listed
const listed = index.groups.flatMap((g) => g.ids);
assert.equal(new Set(listed).size, listed.length, 'index: no duplicate ids');
index.groups.forEach((g) => {
  assert.ok(KINDS.has(g.kind), `index group kind ${g.kind}`); both(g.title, `index group ${g.kind}`);
  g.ids.forEach((id) => { assert.ok(arts[id], `index: ${id} exists`); assert.equal(arts[id].kind, g.kind, `index: ${id} in group ${g.kind}`); });
});
Object.keys(arts).forEach((id) => assert.ok(listed.includes(id), `index lists ${id}`));

// tunes: melody id -> tune article
const melodies = new Set(readdirSync(join(root, 'content/melodies')).map((f) => f.replace(/\.json$/, '')));
for (const [mel, id] of Object.entries(index.tunes || {})) {
  assert.ok(melodies.has(mel), `tunes: melody ${mel} exists`);
  assert.ok(arts[id] && arts[id].kind === 'tune', `tunes: ${mel} -> tune article ${id}`);
}

const imgs = Object.values(arts).filter((a) => a.image).length;
console.log(`wiki: ok ${files.length} articles (${imgs} with images), ${Object.keys(index.tunes || {}).length} tunes mapped`);
