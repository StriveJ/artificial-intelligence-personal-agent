// Read daily summaries and timelines with legacy-heading compatibility. Preserve existing human edits and summary content; mechanical regeneration does not invent semantic conclusions. Device-local and shared entries must remain distinguishable.
//   `- [HH:MM] <project> · <type>: <text>`

export function timelineSection(text) {
  const t = String(text || '');
  const m = /^##[ \t]*(?:Timeline|\u65f6\u95f4\u7ebf)[^\n]*$/m.exec(t);
  if (!m) return null;
  const rest = t.slice(m.index + m[0].length);
  const end = rest.search(/^##(?!#)/m);
  return end >= 0 ? rest.slice(0, end) : rest;
}

export function lastSectionText(text, headRe) {
  const t = String(text || '');

  const re = new RegExp(headRe.source, headRe.flags.replace(/[gm]/g, '') + 'gm');
  let last = -1, m;
  while ((m = re.exec(t)) !== null) last = m.index;
  if (last < 0) return null;
  const rest = t.slice(last).replace(/^[^\n]*\n/, '');
  const end = rest.search(/^##(?!#)/m);
  return end >= 0 ? rest.slice(0, end) : rest;
}

export function summarySection(text) {
  return lastSectionText(text, /^##[ \t]*(?:Daily Summary|\u4eca\u65e5\u603b\u7ed3)[^\n]*$/m);
}

export function isSummaryPending(text) {
  const sec = summarySection(text);
  return sec !== null && [SUMMARY_PLACEHOLDER, '\uff08\u5f85\u8865\u603b\u7ed3\uff09'].includes(sec.trim());
}

export const SUMMARY_PLACEHOLDER = "(summary pending)";

export function timelineTimes(section, day) {
  return [...String(section || '').matchAll(/^-\s*\[(\d{2}):(\d{2})\]/gm)].map((x) => `${day} ${x[1]}:${x[2]}`);
}

export function timelineLineCount(section) {
  return timelineTimes(section, 'x').length;
}

export function lastTimelineTs(text, day) {
  const sec = timelineSection(text);
  if (sec === null) return '';
  const ts = timelineTimes(sec, day);
  return ts.length ? ts.sort().pop() : '';
}

export function timelineLine(e) {
  const flat = (s) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ');
  const t = flat(e.ts_local).slice(11, 16);
  const raw = flat(e.data);
  const d = raw.length > 80 ? raw.slice(0, 80) + '…' : raw;
  const p = flat(e.project) || '?';
  return `- [${t}] ${p} · ${flat(e.type)}${d ? ': ' + d : ''}`;
}

export function sectionOf(host, events) {
  const evs = events.slice().sort((a, b) => String(a.ts_local || '').localeCompare(String(b.ts_local || '')));
  const times = evs.map((e) => String(e.ts_local || '').slice(11, 16)).filter(Boolean);
  return { host, n: evs.length, first: times[0] || '', last: times[times.length - 1] || '', events: evs };
}

export function renderHostSection(sec, ownHost = '') {
  const tag = ownHost && sec.host === ownHost ? "(this device)" : '';
  return `### ${sec.host}${tag}\n\n${sec.events.map(timelineLine).join('\n')}`;
}

export function renderTimelineSections(sections, ownHost = '') {
  return (sections || []).map((s) => renderHostSection(s, ownHost)).join('\n\n');
}

export const FP_TAG = 'aipa-daily-fp';

export function fingerprintOf(day, dsh, sections) {
  const hosts = {};
  for (const s of sections || []) hosts[s.host] = { n: s.n, first: s.first, last: s.last };
  return { v: 1, day, dsh, hosts };
}

export function renderFingerprint(fp) {
  const hosts = {};
  for (const h of Object.keys(fp.hosts || {}).sort()) hosts[h] = fp.hosts[h];
  return `<!-- ${FP_TAG}: ${JSON.stringify({ v: fp.v, day: fp.day, dsh: fp.dsh, hosts })} -->`;
}

export function parseFingerprint(text) {
  const m = /^<!--\s*aipa-daily-fp:\s*(\{.*\})\s*-->\s*$/m.exec(String(text || ''));
  if (!m) return null;
  try {
    const o = JSON.parse(m[1]);
    return o && o.hosts && o.v != null ? o : null;
  } catch {
    return null;
  }
}

export function compareFingerprint(cur, stored) {
  if (!cur || !stored) return { stale: false, reason: 'no-fingerprint' };
  if (String(cur.v) !== String(stored.v)) return { stale: false, reason: 'version' };
  if (cur.day && stored.day && String(cur.day) !== String(stored.day)) return { stale: false, reason: 'day' };

  if (Number(cur.dsh) !== Number(stored.dsh)) return { stale: false, reason: 'dsh-mismatch' };

  const c = cur.hosts || {};
  const s = stored.hosts || {};
  for (const [h, o] of Object.entries(s)) {
    const n = c[h];
    if (!n) return { stale: false, reason: 'view-behind-host' };
    if (Number(n.n) < Number(o.n)) return { stale: false, reason: 'view-behind-count' };
  }
  for (const [h, n] of Object.entries(c)) {
    const o = s[h];
    if (!o) return { stale: true, reason: 'host-added' };
    if (Number(n.n) !== Number(o.n)) return { stale: true, reason: 'count' };
    if (String(n.last) !== String(o.last)) return { stale: true, reason: 'last' };
  }
  return { stale: false, reason: 'equal' };
}
