// Home-screen side panels: practice history (the last 14 days as a bar chart, the last 7 as numbers), today's numbers
// for the Today card, and the Data block (export / import a backup of all progress; app/js/backup.js does the work).
import { h, ICON } from '../ui.js';
import { t, getLang } from '../i18n.js';
import { days, pendingSeconds } from '../store.js';
import { dayKey, lastDays, sumDays } from '../days.js';
import { collectBackup, validateBackup, applyBackup, backupCounts, backupName } from '../backup.js';

const fill = (s, v) => Object.entries(v).reduce((a, [k, x]) => a.split(`{${k}}`).join(String(x)), s);
const locale = () => (getLang() === 'en' ? 'en-GB' : 'ru-RU');
/** The log with the seconds not yet flushed added to today. */
function daysNow(today) {
  const all = { ...days() }, p = pendingSeconds();
  if (p > 0) all[today] = { ...(all[today] || {}), sec: ((all[today] && all[today].sec) || 0) + p };
  return all;
}

/** Today's numbers for the Today card when nothing is left: null on a day without practice. */
export function todayLine(now = new Date()) {
  const key = dayKey(now), s = sumDays(lastDays(daysNow(key), 1, key));
  if (!s.active) return null;
  return fill(t('histToday'), { min: s.min, p: s.passed, ok: s.reviewsOk, fail: s.reviewsFail });
}

const N = 14, W = 20, CH = 64, TOP = 4; // slots, slot width, chart height, top margin (viewBox units)
export function historyPanel(now = new Date()) {
  const today = dayKey(now);
  const rows = lastDays(daysNow(today), N, today);
  const week = sumDays(rows.slice(-7)), two = sumDays(rows);
  const max = Math.max(15, ...rows.map((r) => r.sec / 60)); // the scale: at least 15 minutes high
  const dateOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const bars = rows.map((r, i) => {
    const x = i * W, min = r.sec / 60, isToday = r.key === today, d = dateOf(r.key);
    const hgt = r.sec > 0 ? Math.max(2, (min / max) * CH) : 0;
    const tip = `${d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' })}: ${Math.round(min)} ${t('min')}`;
    return `<g><title>${esc(tip)}</title><rect class="hslot" x="${x + 2}" y="${TOP}" width="${W - 4}" height="${CH}" rx="3"/>`
      + (hgt ? `<rect class="hbar${isToday ? ' today' : ''}" x="${x + 2}" y="${TOP + CH - hgt}" width="${W - 4}" height="${hgt}" rx="3"/>` : '')
      + `<text class="hlbl${isToday ? ' today' : ''}" x="${x + W / 2}" y="${TOP + CH + 13}" text-anchor="middle">${esc(d.toLocaleDateString(locale(), { weekday: 'narrow' }))}</text></g>`;
  }).join('');
  const label = fill(t('histAria'), { min: two.min, days: two.active, today: Math.round(rows[N - 1].sec / 60) });
  const chart = h('div.histchart', { role: 'img', 'aria-label': label,
    html: `<svg viewBox="0 0 ${N * W} ${TOP + CH + 18}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${bars}</svg>` });
  return h('section.panel.history', null,
    h('div.row', null, h('b.skhead', null, t('histTitle')), h('div.grow'), h('small.muted', null, fill(t('histMax'), { n: Math.round(max) }))),
    chart,
    h('p.histweek', null, fill(t('hist7'), { min: week.min, days: week.active, p: week.passed, ok: week.reviewsOk, fail: week.reviewsFail })));
}

// ---------- Data: export / import ----------
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function dataPanel() {
  const msg = h('p.datamsg', { role: 'status' });
  const confirmBox = h('div.dataconfirm', { hidden: true });
  const say = (text, cls = '') => { msg.className = 'datamsg' + (cls ? ' ' + cls : ''); msg.textContent = text; };

  function exportNow() {
    let text;
    try { text = JSON.stringify(collectBackup(localStorage)); } catch (e) { say(t('dataNoStorage'), 'bad'); return; }
    const name = backupName(), blob = new Blob([text], { type: 'application/json' });
    const done = () => say(fill(t('dataSaved'), { f: name }), 'ok');
    // iPad / phone web views may not download a file: offer the share sheet («Save to Files») when it can take files
    let file = null;
    try { file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null; } catch (e) { file = null; }
    if (file && coarse() && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).then(done, (e) => { if (!e || e.name !== 'AbortError') { download(blob, name); done(); } });
      return;
    }
    download(blob, name); done();
  }

  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  async function importFile(file) {
    confirmBox.hidden = true; say('');
    let text = '';
    try { text = typeof file === 'string' ? file : await file.text(); } catch (e) { say(t('dataBad_json'), 'bad'); return; }
    const v = validateBackup(text);
    if (!v.ok) { say(t('dataBad_' + v.error), 'bad'); return; }
    let current;
    try { current = collectBackup(localStorage).data; } catch (e) { say(t('dataNoStorage'), 'bad'); return; }
    const a = backupCounts(v.backup.data), b = backupCounts(current);
    const when = new Date(v.backup.exported);
    const date = isNaN(when) ? '—' : when.toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
    confirmBox.replaceChildren(
      h('p', null, fill(t('dataFileW'), { d: date, p: a.progress, r: a.reviews, n: a.days })),
      h('p', null, fill(t('dataNowW'), { p: b.progress, r: b.reviews, n: b.days })),
      h('p', null, h('b', null, t('dataReplaceQ'))),
      h('div.row', null,
        h('button.btn.accent', { type: 'button', onclick: () => {
          try { applyBackup(localStorage, v.backup); } catch (e) { confirmBox.hidden = true; say(t('dataFail'), 'bad'); return; }
          location.reload();
        } }, t('dataReplace')),
        h('button.btn', { type: 'button', onclick: () => { confirmBox.hidden = true; say(''); } }, t('dataCancel'))));
    confirmBox.hidden = false;
  }
  fileIn.addEventListener('change', () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (f) importFile(f); });

  return h('section.panel.datapanel', null,
    h('b.skhead', null, t('dataTitle')),
    h('p.muted', null, t('dataAbout')),
    h('div.row.databtns', null,
      h('button.btn', { type: 'button', onclick: exportNow, html: ICON.download + `<span>${t('dataExport')}</span>` }),
      h('button.btn', { type: 'button', onclick: () => fileIn.click() }, t('dataImport')), fileIn),
    confirmBox, msg);
}
