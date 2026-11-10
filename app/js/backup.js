// Backup of all learner state: every `jazzlab:*` key of localStorage in one JSON file (format jazzlab-backup/1).
//   { "$format": "jazzlab-backup/1", "exported": ISO, "data": { <key without prefix>: <parsed value>, … } }
// Pure functions over a storage-like object ({ length, key(i), getItem, setItem, removeItem }), so node can test them.
export const BACKUP_FORMAT = 'jazzlab-backup/1';
const PREFIX = 'jazzlab:';

const ownKeys = (storage) => {
  const out = [];
  for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(PREFIX)) out.push(k); }
  return out;
};
const parse = (raw) => { try { return JSON.parse(raw); } catch (e) { return raw; } };

/** Every jazzlab:* key, the prefix stripped (only the leading one: keys like 'tempo:x' keep their colons). */
export function collectBackup(storage, now = new Date()) {
  const data = {};
  ownKeys(storage).sort().forEach((k) => { data[k.slice(PREFIX.length)] = parse(storage.getItem(k)); });
  return { $format: BACKUP_FORMAT, exported: now.toISOString(), data };
}

/** { ok: true, backup } or { ok: false, error: 'json' | 'format' | 'data' }. Accepts text or an already parsed object. */
export function validateBackup(input) {
  let obj = input;
  if (typeof input === 'string') { try { obj = JSON.parse(input); } catch (e) { return { ok: false, error: 'json' }; } }
  if (!obj || typeof obj !== 'object' || obj.$format !== BACKUP_FORMAT) return { ok: false, error: 'format' };
  const d = obj.data;
  if (!d || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).some((k) => !k)) return { ok: false, error: 'data' };
  return { ok: true, backup: obj };
}

const count = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).length : 0);
/** What the confirm shows: progress entries, reviews, days of history. */
export const backupCounts = (data) => ({ progress: count(data && data.progress), reviews: count(data && data.review), days: count(data && data.days) });

/** Replace every jazzlab:* key with the backup's (keys missing from it are removed). On a storage error the previous
 *  state is put back and the error rethrown, so a failed import changes nothing. */
export function applyBackup(storage, backup) {
  const before = ownKeys(storage).map((k) => [k, storage.getItem(k)]);
  const next = Object.entries(backup.data).map(([k, v]) => [PREFIX + k, JSON.stringify(v)]);
  const keep = new Set(next.map(([k]) => k));
  try {
    next.forEach(([k, v]) => storage.setItem(k, v));
    before.forEach(([k]) => { if (!keep.has(k)) storage.removeItem(k); });
  } catch (err) {
    ownKeys(storage).forEach((k) => storage.removeItem(k));
    before.forEach(([k, v]) => { try { storage.setItem(k, v); } catch (e) { /* nothing more to do */ } });
    throw err;
  }
}

/** File name for a backup made on `now` (local date). */
export const backupName = (now = new Date()) =>
  `jazzlab-progress-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;
