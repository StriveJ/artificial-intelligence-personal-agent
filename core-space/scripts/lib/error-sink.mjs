// error sink
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_THRESHOLD = 3;
export const DEFAULT_WINDOW_MINUTES = 10;

export function errorsPath(root) {
  return join(root, 'state', 'errors.log');
}

export function errorLine(e) {
  return JSON.stringify({ ts: e?.ts || '', scope: e?.scope || '', message: e?.message || '' });
}

export function parseErrors(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try {
      const o = JSON.parse(s);
      if (o && o.scope) out.push({ ts: o.ts || '', scope: o.scope, message: o.message || '' });
    } catch {  }
  }
  return out;
}

export function countSince(errors, sinceISO, scope) {
  const since = Date.parse(sinceISO);
  return (errors || []).filter((e) => {
    if (scope && e.scope !== scope) return false;
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= since;
  }).length;
}

export function circuitOpen(errors, { scope, now, threshold = DEFAULT_THRESHOLD, windowMinutes = DEFAULT_WINDOW_MINUTES } = {}) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return false;
  const since = new Date(nowMs - windowMinutes * 60000).toISOString();
  return countSince(errors, since, scope) >= threshold;
}

export function summarize(errors, { now, windowHours = 24 } = {}) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return null;
  const since = nowMs - windowHours * 3600000;
  const recent = (errors || []).filter((e) => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= since;
  });
  if (!recent.length) return null;
  const byScope = {};
  for (const e of recent) byScope[e.scope] = (byScope[e.scope] || 0) + 1;
  return { count: recent.length, byScope, last: recent[recent.length - 1] };
}

export function appendError(root, e) {
  mkdirSync(join(root, 'state'), { recursive: true });
  appendFileSync(errorsPath(root), `${errorLine(e)}\n`, 'utf8');
}

export function readErrors(root) {
  try {
    return existsSync(errorsPath(root)) ? parseErrors(readFileSync(errorsPath(root), 'utf8')) : [];
  } catch { return []; }
}

export function clearErrors(root) {
  try {
    mkdirSync(join(root, 'state'), { recursive: true });
    writeFileSync(errorsPath(root), '', 'utf8');
    return true;
  } catch { return false; }
}

export function crashGuard(root, scope, { exit = (code) => process.exit(code) } = {}) {
  const record = (e) => {
    const message = String((e && (e.stack || e.message)) || e).slice(0, 500);
    try { appendError(root, { ts: new Date().toISOString(), scope, message }); } catch {  }
    try { console.error(`[${scope}] failure recorded in state/errors.log: ${message.split('\n')[0]}`); } catch {  }
  };
  process.on('uncaughtException', (e) => { record(e); exit(1); });
  process.on('unhandledRejection', (e) => { record(e); exit(1); });
}
