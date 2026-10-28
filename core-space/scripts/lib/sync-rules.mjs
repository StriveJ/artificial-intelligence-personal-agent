// sync rules
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hostname } from 'node:os';

import { shardSources } from './host-merge.mjs';
import { readHostId, resolveShardStore } from './host-id.mjs';

export const SYNC_RULES_SHARD_REL = 'sync-rules.jsonl';

const legacyRelFor = (root) => join('state', 'sync-rules', `${readHostId(root) || hostname()}.jsonl`);

export const syncRulesPath = (root) =>
  resolveShardStore(root, SYNC_RULES_SHARD_REL, legacyRelFor(root)).path;

export function readSyncRules(root) {
  const byPattern = new Map();
  for (const src of shardSources(root, SYNC_RULES_SHARD_REL, legacyRelFor(root))) {
    for (const line of String(src.text || '').split(/\r?\n/)) {
      if (!line.trim()) continue;
      let rule;
      try { rule = JSON.parse(line); } catch { continue; }
      const pattern = String((rule && rule.pattern) || '');
      if (!pattern) continue;
      const cur = byPattern.get(pattern);
      if (!cur || String(rule.ts || '') > String(cur.ts || '')) byPattern.set(pattern, rule);
    }
  }
  return byPattern;
}

export function appendSyncRule(root, rule) {
  const path = syncRulesPath(root);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(rule) + '\n', 'utf8');
  return path;
}

export const classifiedPatterns = (root) => new Set(readSyncRules(root).keys());
