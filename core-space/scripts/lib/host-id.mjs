// host id
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeIgnoreStatus } from './runtime-state-policy.mjs';

export const HOST_ID_REL = 'state/host-id';

export function hostIdIgnoreStatus(root) {
  const {path,...status}=runtimeIgnoreStatus(root,HOST_ID_REL);return status;
}

export const LEGACY_HOST = 'legacy';

export const hostIdPath = (root) => join(root, HOST_ID_REL);
export const hostsRoot = (root) => join(root, 'state', 'hosts');
export const hostDir = (root, id) => join(hostsRoot(root), id);

export const normalizeHostId = (s) => String(s ?? '').trim().toLowerCase();

export function isValidHostId(s) {
  return /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(normalizeHostId(s));
}

export function readHostId(root) {
  const p = hostIdPath(root);
  if (!existsSync(p)) return null;
  return normalizeHostId(readFileSync(p, 'utf8')) || null;
}

export function hostIdHint(root) {
  return [
    `Machine identity is not configured: ${hostIdPath(root)} is missing or empty.`,
    "Multi-device sync uses it to identify the writer through state/hosts/<id>/ shards and ID prefixes in shared files.",
    "Create a one-line device ID: lowercase letters, digits and hyphens; start/end with a letter or digit; length 1-32, e.g. work-win or desktop-3fbemtl.",
    "Example: PowerShell -> Set-Content -Path \"<root>/state/host-id\" -Value \"work-win\" -NoNewline",
    '      bash        →  printf %s work-win > "<root>/state/host-id"',
  ].join('\n  ').replace(/<root>/g, root);
}

export function requireHostId(root) {
  const id = readHostId(root);
  if (id && isValidHostId(id)) return id;
  const why = id ? `Invalid content: ${JSON.stringify(id)}` : "file missing or empty";
  throw new Error(`${hostIdHint(root)}
  (current state: ${why})`);
}

export function ensureHostDirs(root, id) {
  const base = hostDir(root, id);
  const dirs = [base, join(base, 'events'), join(base, 'canvas')];
  for (const d of dirs) mkdirSync(d, { recursive: true });
  return dirs;
}

export function resolveShardStore(root, shardRel, legacyRel) {
  const id = readHostId(root);
  if (id && isValidHostId(id)) {
    return { hostId: id, path: join(hostDir(root, id), shardRel), hint: null };
  }
  return { hostId: null, path: join(root, legacyRel), hint: hostIdHint(root) };
}

export function storeReadPaths(root, shardRel, legacyRel) {
  const legacy = join(root, legacyRel);
  const { path } = resolveShardStore(root, shardRel, legacyRel);
  return path === legacy ? [legacy] : [path, legacy];
}

export function storeReadDirs(root, shardRel, legacyRel) {
  return storeReadPaths(root, shardRel, legacyRel);
}

export function listLocalFiles(root, shardRel, legacyRel, suffix = '') {
  const seen = new Map();
  for (const dir of storeReadDirs(root, shardRel, legacyRel)) {
    let names;
    try { names = readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (suffix && !n.endsWith(suffix)) continue;
      if (!seen.has(n)) seen.set(n, join(dir, n));
    }
  }
  return [...seen.entries()].map(([name, path]) => ({ name, path }));
}
