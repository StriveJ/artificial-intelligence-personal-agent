// candidates
export const VALID_TYPES = ['preference','decision','method','term','trait','lesson','skill','instruction'];
export const SKILL_SCOPES = ['work','life','study'];

export function parseJudgeOutput(raw, { strict = false } = {}) {
  let s = String(raw || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('['), end = s.lastIndexOf(']');
  if (strict) {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) throw new Error("judge output must be a JSON array");
    return arr;
  }
  if (start < 0 || end < start) return [];
  try { const arr = JSON.parse(s.slice(start, end + 1)); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

export function normalizeCandidate(c) {
  if (!c || typeof c !== 'object') return null;
  const type = c.type;
  if (!VALID_TYPES.includes(type)) return null;
  if (typeof c.text !== 'string') return null;
  const text = c.text.trim();
  if (!text) return null;
  const out = { type, text };

  const pr = c.priority;
  if (pr !== undefined && pr !== null && pr !== '') {
    const n = Number(pr);
    if (Number.isFinite(n)) out.priority = Math.min(100, Math.max(0, Math.round(n)));
  }
  if (type === 'skill') {
    if (![c.name, c.scope, c.desc].every(v => typeof v === 'string')) return null;
    const name = c.name.trim(), scope = c.scope.trim(), desc = c.desc.trim();
    if (!name || !SKILL_SCOPES.includes(scope) || !desc) return null;
    if (!/^[a-z0-9-]+$/.test(name)) return null;
    out.name = name; out.scope = scope; out.desc = desc;
  }
  return out;
}

export function dedupCandidates(list, existing) {
  const seen = new Set((existing || []).map(e => (e.text || '').trim().toLowerCase()));
  const out = [];
  for (const c of list) {
    const key = (c.text || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(c);
  }
  return out;
}
