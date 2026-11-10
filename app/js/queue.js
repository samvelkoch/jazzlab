// Pure helpers for the home screen's «Сегодня» queue (no DOM, no store: testable in node).

/** The session budget (minutes, `settings.budget`) -> how many reviews and new items today's queue takes. */
export const BUDGETS = { 10: { reviews: 3, fresh: 1 }, 20: { reviews: 4, fresh: 2 }, 40: { reviews: 6, fresh: 3 } };
export const DEFAULT_BUDGET = 20;
export const budgetLimits = (b) => BUDGETS[b] || BUDGETS[DEFAULT_BUDGET];

/** The learning order of a track: its `path` when present, else its sections flattened (the display order). */
export const learningOrder = (track) => (Array.isArray(track.path) && track.path.length ? track.path : track.sections.flatMap((s) => s.items));

/** The fresh part of today's queue: the next unfinished items in learning order (`order`), at most `max`.
 *  A check-up is never a fresh item. A performance is offered only once every item before it in `order` is done
 *  (`done(id)`; a check-up does not count). A tune track has many melody items, so at most one `melody` item and at
 *  most one `form` item with a `melody` are taken (the earliest of each); the others wait for a later day. At most one
 *  `solo` item (improvisation) is taken a day, like a melody.
 *  `skip(id)` = true for items that must not be offered (done, or already in the queue as a review);
 *  `done(id)` = item done-ness alone (defaults to `skip`). */
export function freshItems(order, items, skip, max, done = skip) {
  const out = [];
  let mel = false, formMel = false, solo = false, allBefore = true;
  for (const id of order) {
    if (out.length >= max) break;
    const it = items[id];
    if (!it || it.kind === 'diag') continue;
    const before = allBefore; // every item before this one is done
    if (!done(id)) allBefore = false;
    if (skip(id)) continue;
    if (it.kind === 'perform' && !before) continue;
    if (it.kind === 'melody') { if (mel) continue; mel = true; }
    else if (it.kind === 'solo') { if (solo) continue; solo = true; }
    else if (it.kind === 'form' && it.melody) { if (formMel) continue; formMel = true; }
    out.push(id);
  }
  return out;
}
