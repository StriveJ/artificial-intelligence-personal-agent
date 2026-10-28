// time boundary
const pad = n => String(n).padStart(2, '0');
export const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
export const parseDate = s => { const [y,m,dd] = s.split('-').map(Number); return new Date(y, m-1, dd); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate()+n); return fmtDate(d); };

export function dayKey(tsLocal, dayStartHour = 6) {
  const m = (tsLocal || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):/);
  if (!m) return (tsLocal || '').slice(0, 10);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), 0, 0));
  d.setUTCHours(d.getUTCHours() - dayStartHour);
  return d.toISOString().slice(0,10);
}

export function dailyBackfillRange(last, now, dayEndHour = 23, dayStartHour = 6) {
  const cur = new Date(now.getTime() - dayStartHour * 3600 * 1000);
  const today = fmtDate(cur);
  const end = now.getHours() >= dayEndHour ? today : addDays(today, -1);
  const out = [];
  for (let d = addDays(last, 1); d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
