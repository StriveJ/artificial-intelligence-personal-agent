// local log
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { resolveShardStore, storeReadPaths } from './host-id.mjs';
import { assertNoActiveInstall } from './install-maintenance.mjs';

export const MEMORY_WRITES = { shard: 'memory-writes.jsonl', legacy: 'state/memory-writes.jsonl' };
export const OFFLOAD_LEDGER = { shard: 'offload-ledger.jsonl', legacy: 'user-space/logs/metrics/offload-ledger.jsonl' };
export const SEARCH_LOG = { shard: 'search-log.jsonl', legacy: 'state/search-log.jsonl' };

export const localLogStore = (root, spec) => resolveShardStore(root, spec.shard, spec.legacy);

export function appendLocalLog(root, spec, obj) {
  assertNoActiveInstall(root);
  const { path } = localLogStore(root, spec);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(obj) + '\n', 'utf8');
  return path;
}

export function readLocalLog(root, spec, { tsKey = 'ts' } = {}) {
  assertNoActiveInstall(root);
  const rows = [];
  const seen = new Map();
  for (const p of storeReadPaths(root, spec.shard, spec.legacy)) {
    let text = '';
    try { text = readFileSync(p, 'utf8'); } catch { continue; }
    const inFile = new Map();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        if (o && typeof o === 'object') {
          const key = o.event_id ? 'id:' + o.event_id : 'row:' + JSON.stringify(o);
          const count = (inFile.get(key) || 0) + 1; inFile.set(key, count);

          if (count > (seen.get(key) || 0)) rows.push(o);
        }
      } catch {  }
    }
    for (const [key, count] of inFile) seen.set(key, Math.max(count, seen.get(key) || 0));
  }
  if (!tsKey) return rows;
  return rows.sort((a, b) => String(a[tsKey] || '').localeCompare(String(b[tsKey] || '')));
}
