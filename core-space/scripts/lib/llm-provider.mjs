// Read the limited model-provider configuration and merge explicit shared clock settings. Host remains the safe fallback. External requests require configured limits and must not alter user data or authorization boundaries.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { storeReadPaths } from './host-id.mjs';

export const LLM_PROVIDER_SHARD_REL = 'llm-provider.yaml';
export const LLM_PROVIDER_LEGACY_REL = join('user-space', 'llm-provider.yaml');

export function llmProviderReadPaths(root) {
  return storeReadPaths(root, LLM_PROVIDER_SHARD_REL, LLM_PROVIDER_LEGACY_REL);
}

export function llmProviderTexts(root) {
  const out = [];
  for (const p of llmProviderReadPaths(root)) {
    try {
      if (existsSync(p)) out.push({ path: p, text: readFileSync(p, 'utf8') });
    } catch {  }
  }
  return out;
}

export function cleanScalar(v) {
  let s = String(v ?? '').trim();
  const hash = s.search(/\s#/);
  if (hash >= 0) s = s.slice(0, hash).trim();
  return s.replace(/^"|"$/g, '').trim();
}

const isComment = (t) => t === '' || t.startsWith('#');

function scalarKeyIn(raw, key) {
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (isComment(t)) continue;
    const colon = t.indexOf(':');
    if (colon <= 0) continue;
    if (t.slice(0, colon).trim() === key) return cleanScalar(t.slice(colon + 1));
  }
  return undefined;
}

function providerKeyIn(raw, provider, key) {
  let inBlock = false;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (t === provider + ':') { inBlock = true; continue; }
    if (!inBlock) continue;
    if (/^[A-Za-z][\w-]*:\s*$/.test(t)) break;
    if (isComment(t)) continue;
    const colon = line.indexOf(':');
    if (colon > 0 && line.slice(0, colon).trim() === key) return cleanScalar(line.slice(colon + 1));
  }
  return undefined;
}

function blockMapIn(raw, block) {
  const out = {};
  let inBlock = false, indent = -1;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!inBlock) {
      if (t === block + ':') { inBlock = true; indent = line.search(/\S/); }
      continue;
    }
    if (t === '') continue;
    if (line.search(/\S/) <= indent) break;
    if (isComment(t)) continue;
    const colon = t.indexOf(':');
    if (colon > 0) out[t.slice(0, colon).trim()] = cleanScalar(t.slice(colon + 1));
  }
  return out;
}

export function scalarKey(texts, key, fallback) {
  for (const { text } of texts) {
    const v = scalarKeyIn(text, key);
    if (v !== undefined && v !== '') return v;
  }
  return fallback;
}

export function providerKey(texts, provider, key, fallback) {
  for (const { text } of texts) {
    const v = providerKeyIn(text, provider, key);
    if (v !== undefined && v !== '') return v;
  }
  return fallback;
}

export function providerBlockMap(texts, block) {
  const out = {};
  for (let i = texts.length - 1; i >= 0; i -= 1) {
    Object.assign(out, blockMapIn(texts[i].text, block));
  }
  return out;
}

function intOr(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function dayStartHour(root, fallback = 6) {
  const path = join(root, LLM_PROVIDER_LEGACY_REL);
  if (!existsSync(path)) return fallback;
  const raw = scalarKeyIn(readFileSync(path, 'utf8'), 'day_start_hour');
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d{1,2}$/.test(raw) || !Number.isInteger(value) || value < 0 || value > 23) {
    throw new Error("day_start_hour must be an integer from 0 to 23 in shared configuration");
  }
  return value;
}

export function dayEndHour(root, fallback = 23) {
  return intOr(scalarKey(llmProviderTexts(root), 'day_end_hour', ''), fallback);
}

export function defaultProvider(root, fallback = 'host') {
  return scalarKey(llmProviderTexts(root), 'provider', fallback);
}

export function providerFor(root, command, override = '') {
  const texts = llmProviderTexts(root);
  return { provider: override || providerBlockMap(texts, 'providers')[command] || scalarKey(texts, 'provider', 'host'), texts };
}
