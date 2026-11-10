// Harmonic function labels of a form. Run: node tests/functions.test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { analyzeForm, roleText, roleTerm, groupTitle } from '../app/js/music/functions.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const form = (id) => JSON.parse(readFileSync(join(root, 'content/forms', id + '.json'), 'utf8'));
const roles = (a) => a.labels.map((l) => `${l.bar}.${l.slot}:${l.chord}=${l.role}`);
const grp = (a) => a.groups.map((g) => `${g.type}@${g.key}:${g.bars.join(',')}`);

// synthetic
let a = analyzeForm(['Dm7 G7', 'Cmaj7', 'Cmaj7']);
assert.deepEqual(roles(a), ['0.0:Dm7=ii', '0.4:G7=V', '1.0:Cmaj7=I']);
assert.equal(a.labels[0].key, 'C');
a = analyzeForm(['Cmaj7', 'Am7', 'Dm7', 'G7']); // loops round to the I
assert.deepEqual(grp(a), ['ii-V-I@C:2,3,0']);
a = analyzeForm(['Cmaj7', 'Fmaj7', 'Dm7 G7', 'Em7']); // G7 -> Em7 is not a resolution
assert.deepEqual(grp(a), ['ii-V@C:2']);
assert.equal(analyzeForm(['Cmaj7', 'Fmaj7', 'Cmaj7', 'Fmaj7']).labels.length, 0, 'no dominant, nothing to label');
// a repeated chord is labelled once, on its first bar
a = analyzeForm(['Cmaj7', 'Dm7', 'G7', 'G7', 'Cmaj7']);
assert.deepEqual(roles(a), ['1.0:Dm7=ii', '2.0:G7=V', '4.0:Cmaj7=I']);
assert.deepEqual(a.groups.map((g) => g.bars), [[1, 2, 3, 4]], 'the bracket covers the held V');

// blue bossa: minor ii–V–i in Cm, major ii–V–I in Db
a = analyzeForm(form('blue-bossa').bars);
assert.equal(a.tonic, 'C');
assert.deepEqual(roles(a), ['0.0:Cm7=I', '4.0:Dm7b5=ii', '5.0:G7=V', '6.0:Cm7=I', '8.0:Ebm7=ii', '9.0:Ab7=V', '10.0:Dbmaj7=I', '12.0:Dm7b5=ii', '13.0:G7=V', '14.0:Cm7=I', '15.0:Dm7b5=ii', '15.4:G7=V']);
assert.deepEqual(grp(a), ['ii-V-I@Cm:4,5,6', 'ii-V-I@Db:8,9,10', 'ii-V-I@Cm:12,13,14', 'ii-V-I@Cm:15,0'], 'the last bar loops into bar 1');
assert.equal(roleText(a.labels[0]), 'i', 'minor tonic is written lower-case');
assert.equal(roleText(a.labels[6]), 'I');

// Girl from Ipanema: ii–subV–I
a = analyzeForm(form('ipanema-f').bars);
assert.equal(a.tonic, 'F');
assert.deepEqual(roles(a).slice(0, 5), ['0.0:Fmaj7=I', '4.0:Gm7=ii', '5.0:Gb7=subV', '6.0:Fmaj7=I', '7.0:Gb7=subV']);
assert.ok(grp(a).includes('ii-subV-I@F:4,5,6'));
assert.ok(grp(a).includes('subV-I@F:39,0'), 'Gb7 at the end resolves into bar 1');
assert.ok(grp(a).includes('ii-V-I@F:30,31,32'));
assert.equal(a.labels.find((l) => l.chord === 'G7'), undefined, 'G7 -> Gm7 is not a resolution: no label');
assert.equal(roleTerm(a.labels.find((l) => l.role === 'subV')), 'tritone-sub');

// std-f: many ii–V–I in F and Bb, ii–V in G with no resolution
a = analyzeForm(form('std-f').bars);
assert.equal(a.tonic, 'F');
const g = grp(a);
assert.equal(g.filter((x) => x.startsWith('ii-V-I@F')).length, 9);
assert.equal(g.filter((x) => x.startsWith('ii-V-I@Bb')).length, 2);
assert.ok(g.includes('ii-V-I@F:1,2') && g.includes('ii-V-I@F:22,23,24'), 'Gm7 | C7 over two bars');
assert.ok(g.includes('ii-V@G:6'), 'Am7 D7 | Gm7: only ii–V');
assert.ok(g.includes('ii-V@F:21'), 'Gm7 C7 | Gm7 does not close');

// corcovado: ii–V–I in F and C, a diminished passing chord
a = analyzeForm(form('corcovado-c').bars);
assert.equal(a.tonic, 'C');
assert.deepEqual(roles(a).slice(0, 4), ['2.0:Abdim7=dim', '4.0:Gm7=ii', '5.0:C7=V', '6.0:Fmaj7=I']);
assert.ok(grp(a).includes('ii-V-I@C:28,29,30'));
assert.equal(a.labels.find((l) => l.chord === 'D7'), undefined, 'D7 held over two bars goes to a dim7: no label');

// blues: I / IV / V
a = analyzeForm(form('blues-c').bars);
assert.equal(a.tonic, 'C');
assert.deepEqual(roles(a), ['0.0:C7=I7', '4.0:F7=IV7', '6.0:C7=I7', '8.0:G7=V7', '9.0:F7=IV7', '10.0:C7=I7', '11.0:G7=V7']);
assert.deepEqual(a.groups, []);
assert.deepEqual(a.labels.map(roleText), ['I', 'IV', 'I', 'V', 'IV', 'I', 'V']);
assert.equal(roleTerm(a.labels[0]), 'blues-fn');
// the blues with a turnaround: Dm7 G7 -> C7 is a ii–V into the I
a = analyzeForm(form('blues-c-ta').bars);
assert.ok(grp(a).includes('ii-V-I@C:11,0'));
assert.equal(a.labels.find((l) => l.chord === 'A7').role, 'V/ii');

// every form analyses; every label is a real chord position, its group exists
for (const f of readdirSync(join(root, 'content/forms'))) {
  const fm = JSON.parse(readFileSync(join(root, 'content/forms', f), 'utf8'));
  const r = analyzeForm(fm.bars);
  const ids = new Set(r.groups.map((x) => x.id));
  for (const l of r.labels) {
    assert.ok(l.bar >= 0 && l.bar < fm.bars.length, f);
    assert.equal(fm.bars[l.bar].split(/\s+/)[l.slot ? 1 : 0], l.chord, `${f}: ${l.bar}.${l.slot}`);
    assert.ok(!l.group || ids.has(l.group), f);
    assert.ok(roleText(l) && roleTerm(l), f);
  }
  r.groups.forEach((x) => { assert.ok(x.bars.length >= 1 && x.bars.length <= fm.bars.length, f); groupTitle(x); });
}
console.log('functions: ok');
