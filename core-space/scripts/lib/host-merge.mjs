// host merge
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { LEGACY_HOST, hostsRoot } from './host-id.mjs';

export { LEGACY_HOST };

export function listHosts(root) {
  const base = hostsRoot(root);
  let names;
  try {
    names = readdirSync(base);
  } catch {
    return [];
  }
  return names
    .filter((n) => {
      try { return statSync(join(base, n)).isDirectory(); } catch { return false; }
    })
    .sort();
}

export const shardPath = (root, host, rel) => join(hostsRoot(root), host, rel);

export function readShard(root, host, rel) {
  try {
    return readFileSync(shardPath(root, host, rel), 'utf8');
  } catch {
    return null;
  }
}

export function shardSources(root, rel, legacyRel) {
  const out = [];
  for (const host of listHosts(root)) {
    const text = readShard(root, host, rel);
    if (text !== null) out.push({ host, path: shardPath(root, host, rel), text });
  }
  if (legacyRel) {
    const p = join(root, legacyRel);
    try {
      out.push({ host: LEGACY_HOST, path: p, text: readFileSync(p, 'utf8') });
    } catch {  }
  }
  return out;
}
