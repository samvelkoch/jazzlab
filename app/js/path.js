// Pure helpers for the home screen «Путь»: a track's steps, progress on them, the current step, soft locks.
// No DOM, no store: testable in node (like queue.js). `isDone(id)` is the caller's item done-ness (store.itemDone).
import { learningOrder } from './queue.js';

/** The track's steps ({ id, title, goal, items }); a track without `steps` gets one synthetic step over its learning
 *  order (id 'all', no title or goal: the screen falls back to the track's own). */
export function stepsOf(track) {
  if (Array.isArray(track.steps) && track.steps.length) return track.steps;
  return [{ id: 'all', title: track.title || null, goal: null, items: learningOrder(track).slice(), synthetic: true }];
}

/** { done, total } of one step. Items passed earlier count wherever they stand in the path. */
export const stepProgress = (step, isDone) => ({ done: step.items.filter((id) => isDone(id)).length, total: step.items.length });

/** A step is finished when every one of its items is done. */
export const stepDone = (step, isDone) => step.items.every((id) => isDone(id));

/** Index of the current step: the first with an undone item. All steps done: the last index. */
export function currentStepIndex(steps, isDone) {
  const k = steps.findIndex((s) => !stepDone(s, isDone));
  return k < 0 ? steps.length - 1 : k;
}

/** Everything done (the screen shows M/M and keeps offering reviews). */
export const pathComplete = (steps, isDone) => steps.every((s) => stepDone(s, isDone));

/** The concert of a step: its last item. */
export const concertOf = (step) => step.items[step.items.length - 1];

/** { done, total } over the whole path (every step's items). */
export function pathProgress(steps, isDone) {
  const all = steps.flatMap((s) => s.items);
  return { done: all.filter((id) => isDone(id)).length, total: all.length };
}

/** The ids the learner opened ahead of time for this track (`settings.unlocked[trackId]`), as an array. */
export function unlockedOf(settings, trackId) {
  const u = settings && settings.unlocked && settings.unlocked[trackId];
  return Array.isArray(u) ? u : [];
}

/** A new settings object with `stepId` added to `settings.unlocked[trackId]` (the input is not changed). */
export function withUnlocked(settings, trackId, stepId) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const all = s.unlocked && typeof s.unlocked === 'object' && !Array.isArray(s.unlocked) ? s.unlocked : {};
  const cur = unlockedOf(s, trackId);
  return { ...s, unlocked: { ...all, [trackId]: cur.includes(stepId) ? cur : [...cur, stepId] } };
}

/** A soft lock: a step after the current one that the learner has not opened. Nothing is ever hard-blocked. */
export const stepLocked = (steps, k, isDone, unlocked = []) => k > currentStepIndex(steps, isDone) && !unlocked.includes(steps[k].id);

// abbreviations whose dot does not end a sentence (St. Louis, т. е., e.g.)
const ABBR = /(?:^|[\s(«"])(?:St|Mr|Mrs|Dr|No|vs|etc|e\.g|i\.e|т|т\. е|т\.е|т\. д|т\.д|см|напр|др|ок)\.$/i;
/** The first sentence of a text (the line under an item's title when it has no `does`). A sentence ends at . ! ? …
 *  followed by a space and a capital / quote / digit, not after an abbreviation; without such an end, the whole text. */
export function firstSentence(text) {
  const s = String(text || '').trim();
  const re = /[.!?…]+(?=\s+["«(\d\p{Lu}])/gu;
  let m;
  while ((m = re.exec(s))) {
    const head = s.slice(0, m.index + m[0].length);
    if (m[0] === '.' && ABBR.test(head)) continue;
    return head;
  }
  return s;
}
