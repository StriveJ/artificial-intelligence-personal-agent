// diag payload
import { createHash } from 'node:crypto';

const KV_PATTERNS = [
  /(?:["']|\b)(?:token|password|passwd|secret|api[_-]?key|authorization|access[_-]?token)["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|Bearer\s+[^\s,;}]+|[^\s,;}]+)/gi,
  /\bBearer\s+[^\s,"'};]+/gi,
  /\b[A-Za-z]:\\[^\s"']+/g,
  /(?:^|\s)\/(?:home|Users|root)\/[^\s"']+/g,
];

export function redact(text) {
  let s = String(text ?? '');
  for (const re of KV_PATTERNS) s = s.replace(re, "[redacted]");
  return s;
}

const PATH_PATTERN = /[A-Za-z]:\\[^\s"']+|\/[^\s"']+/g;

const FIELD_MAX = 64;
const MESSAGE_MAX = 200;

function sanitizeField(value, max = FIELD_MAX) {
  return redact(String(value ?? '')).replace(PATH_PATTERN, "[path]").slice(0, max);
}

function normalizeLine(line) {

  try {
    const o = JSON.parse(line);
    const msg = String(o.message ?? '');
    return {
      ts: sanitizeField(o.ts),
      scope: sanitizeField(o.scope),
      kind: /Error/.test(msg) ? 'error' : 'other',
      message: sanitizeField(msg, MESSAGE_MAX),
    };
  } catch {
    return { ts: '', scope: '', kind: /Error/.test(line) ? 'error' : 'other', message: "[unstructured line]" };
  }
}

export function buildPayload({ version, channel, deviceId, errorLines }) {
  const rows = String(errorLines ?? '').split(/\r?\n/).filter(Boolean).map(normalizeLine);
  const byKey = new Map();
  for (const r of rows) {

    const k = JSON.stringify([r.scope, r.kind, r.message]);
    const prev = byKey.get(k);
    if (prev) prev.count += 1;
    else byKey.set(k, { ...r, count: 1 });
  }
  return { version: sanitizeField(version), channel: sanitizeField(channel), deviceId: sanitizeField(deviceId), errors: [...byKey.values()] };
}

export function fingerprint(payload) {

  const keys = (payload?.errors ?? []).map((e) => JSON.stringify([e.scope, e.kind, e.message])).sort();
  return createHash('sha256').update(JSON.stringify(keys)).digest('hex').slice(0, 16);
}
