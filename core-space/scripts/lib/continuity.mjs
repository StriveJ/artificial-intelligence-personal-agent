// continuity
import { dayKey } from './time-boundary.mjs';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

function fmtLocal(d) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function tsMs(row) {
  const s = row && (row.ts_local || row.ts);
  if (!s) return null;
  const t = Date.parse(String(s).replace(' ', 'T'));
  return Number.isNaN(t) ? null : t;
}

// —— A ——
export function dueVerdict(rows, sid, threshold = 300) {
  const n = !sid ? 0 : (rows || []).filter((r) => r && r.sid === sid).length;
  return { due: n > threshold, events: n, threshold, sid: sid || '', reason: n > threshold ? 'sid-events-over-threshold' : 'ok' };
}

// —— D ——
export function gapIdOf(host, sid, fromTsLocal) {
  return `gap:${host}:${sid}:${fromTsLocal}`;
}

export function findGaps(hostRows, { dayStartHour = 6, minMinutes = 30, days = 2, now = new Date() } = {}) {
  const floorMs = now.getTime() - days * DAY;
  const groups = new Map();
  for (const { host, row } of hostRows || []) {
    if (!row || !row.sid) continue;
    const ms = tsMs(row);
    if (ms == null || ms < floorMs) continue;
    const k = `${host}\u0000${row.sid}`;
    if (!groups.has(k)) groups.set(k, { host, sid: row.sid, rows: [] });
    groups.get(k).rows.push({ row, ms });
  }
  const out = [];
  for (const g of groups.values()) {
    const rs = g.rows.sort((a, b) => a.ms - b.ms);
    for (let i = 1; i < rs.length; i++) {
      const prev = rs[i - 1], cur = rs[i];
      if (prev.row.type === 'session_end') continue;
      if (dayKey(fmtLocal(new Date(prev.ms)), dayStartHour) !==
          dayKey(fmtLocal(new Date(cur.ms)), dayStartHour)) continue;
      const minutes = Math.round((cur.ms - prev.ms) / MIN);
      if (minutes <= minMinutes) continue;
      const from = prev.row.ts_local || prev.row.ts;
      const to = cur.row.ts_local || cur.row.ts;
      out.push({ id: gapIdOf(g.host, g.sid, from), host: g.host, sid: g.sid, from, to, minutes });
    }
  }
  return out.sort((a, b) => Date.parse(a.from.replace(' ', 'T')) - Date.parse(b.from.replace(' ', 'T')));
}

export function applyAck(gaps, ack = {}) {
  const out = [];
  for (const g of gaps || []) {
    const a = ack[g.id] || {};
    if (a.answer) continue;
    if ((a.asked || 0) >= 2) continue;
    out.push({ ...g, asked: a.asked || 0 });
  }
  return out;
}

export function recordAnswer(ack = {}, id, answer, now = new Date()) {
  const cur = ack[id] || {};
  const rec = { ...cur, asked: (cur.asked || 0) + 1 };
  if (!rec.firstAskedAt) rec.firstAskedAt = now.toISOString();
  if (answer) { rec.answer = answer; rec.answeredAt = now.toISOString(); }
  return { ...ack, [id]: rec };
}

export function renderContinuityNote(day, gaps, ack = {}, { dayStartHour = 6 } = {}) {
  const lines = [`## Session Continuity Notes (mechanical)`];

  const onDay = (gaps || []).filter((g) => dayKey(String(g.from), dayStartHour) === day);
  if (!onDay.length) { lines.push("- No gaps"); return lines.join('\n'); }
  for (const g of onDay) {
    const a = ack[g.id] || {};
    const verdict = a.answer === 'alive' ? "Long task/missing record (session alive)"
      : a.answer === 'dead' ? "Session ended"
      : `Asked ${a.asked || 0} times without an answer`;
    lines.push(`- ${g.host} · ${String(g.from).slice(11)}–${String(g.to).slice(11)} (${g.minutes} minutes) without records -> ${verdict}`);
  }
  return lines.join('\n');
}
