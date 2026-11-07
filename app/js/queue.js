// Pure helper for the home screen's «Сегодня» queue (no DOM, no store: testable in node).

/** The fresh part of today's queue: the next unfinished items in track order, at most `max`.
 *  A performance and a check-up are never offered as fresh items. A tune track has many melody items, so at most one
 *  `melody` item and at most one `form` item with a `melody` are taken (the earliest of each in section order);
 *  the others wait for a later day.
 *  `skip(id)` = true for items that must not be offered (done, or already in the queue as a review). */
export function freshItems(order, items, skip, max) {
  const out = [];
  let mel = false, formMel = false;
  for (const id of order) {
    if (out.length >= max) break;
    const it = items[id];
    if (skip(id) || ['perform', 'diag'].includes(it.kind)) continue;
    if (it.kind === 'melody') { if (mel) continue; mel = true; }
    else if (it.kind === 'form' && it.melody) { if (formMel) continue; formMel = true; }
    out.push(id);
  }
  return out;
}
