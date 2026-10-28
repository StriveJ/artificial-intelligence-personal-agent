// signal store
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { shardSources } from './host-merge.mjs';
import { resolveShardStore } from './host-id.mjs';
import { emptyState, mergeStates, rollDay } from './signal-core.mjs';

export const SIGNAL_SHARD_REL = 'signal.json';
export const SIGNAL_LEGACY_REL = join('state', 'signal.json');

export const signalStore = (root) => resolveShardStore(root, SIGNAL_SHARD_REL, SIGNAL_LEGACY_REL);

export function readOwnSignal(root, day) {
  try {
    const p = signalStore(root).path;
    if (!existsSync(p)) return emptyState(day);
    const s = JSON.parse(readFileSync(p, 'utf8'));
    if (!s.snooze) s.snooze = {};
    return rollDay(s, day);
  } catch { return emptyState(day); }
}

export function readMergedSignal(root, day) {
  const states = [];
  for (const src of shardSources(root, SIGNAL_SHARD_REL, SIGNAL_LEGACY_REL)) {
    try { states.push(JSON.parse(src.text)); } catch {  }
  }
  return mergeStates(states, day);
}

export function writeOwnSignal(root, state, ts = '') {
  const { path } = signalStore(root);
  mkdirSync(dirname(path), { recursive: true });
  if (ts) state.last_scan_at = ts;
  writeFileSync(path, JSON.stringify(state, null, 2), 'utf8');
  return path;
}
