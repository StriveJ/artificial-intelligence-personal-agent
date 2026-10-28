// memory decay
import { daysBetween } from './signal-core.mjs';

export const DEFAULT_FACTOR = 0.95;
export const THRESHOLDS = { pending_delete: 0.05, keyword: 0.15, archived: 0.3 };

export function stateFor(weight) {
  if (weight < THRESHOLDS.pending_delete) return 'pending_delete';
  if (weight < THRESHOLDS.keyword) return 'keyword';
  if (weight < THRESHOLDS.archived) return 'archived';
  return 'active';
}

export function effectiveWeight(entry, today, factor = DEFAULT_FACTOR) {
  const w = Number(entry?.weight ?? 1);
  if(entry?.retained)return w;
  const since = entry?.since || today;
  const days = Math.max(0, daysBetween(String(since).slice(0, 10), String(today).slice(0, 10)));
  return Math.round(w * Math.pow(factor, days) * 1000) / 1000;
}

export function applyDecay(map, today, factor = DEFAULT_FACTOR) {
  const out = {};
  const keywordIds = [];
  for (const [id, entry] of Object.entries(map || {})) {
    const weight = effectiveWeight(entry, today, factor);
    const state = stateFor(weight);
    out[id] = { ...entry, weight, since: String(today).slice(0, 10), state };
    if (state === 'keyword') keywordIds.push(id);
  }
  return { map: out, keywordIds };
}

export function markUsed(map, ids, today, factor = DEFAULT_FACTOR) {
  const out = { ...(map || {}) };
  const day = String(today).slice(0, 10);
  for (const id of new Set(ids || [])) {
    const prev = out[id];
    if (!prev) {
      out[id] = { weight: 1, since: day, state: 'active', uses: 1 };
      continue;
    }
    const weight = effectiveWeight(prev, day, factor), state = stateFor(weight);
    const restored = state === 'active' ? 1 : state === 'archived' ? 0.5 : null;
    out[id] = { ...prev, ...(restored === null ? {} : { weight: restored, since: day, state: 'active' }), last_used: day, uses: (prev.uses || 0) + 1 };
  }
  return out;
}

export function pruneState(map, validIds) {
  const keep = new Set(validIds || []);
  const out = {};
  for (const [id, entry] of Object.entries(map || {})) if (keep.has(id)) out[id] = entry;
  return out;
}

export function parseDecay(text,{strict=false}={}) {
  try {
    const o = JSON.parse(String(text ?? ''));
    const entries = o && typeof o === 'object' ? (o.entries || o) : {};
    if(!entries||typeof entries!=='object'||Array.isArray(entries)||Object.values(entries).some(e=>!e||!Number.isFinite(e.weight)||e.weight<0||e.weight>1||!/^\d{4}-\d{2}-\d{2}$/.test(e.since||'')))throw new Error("Invalid decay baseline structure");
    return entries;
  } catch(error) { if(strict)throw new Error("Corrupt decay baseline; original file preserved: "+error.message);return {}; }
}

export function serializeDecay(map) {
  return `${JSON.stringify({ version: '0.1', entries: map || {} }, null, 2)}\n`;
}
