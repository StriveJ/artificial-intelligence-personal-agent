// distill store
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWriteFile } from './atomic-write.mjs';
import { acquireFileLock } from './file-lock.mjs';
import { assertWithin } from './safe-path.mjs';
import { assertNoActiveInstall } from './install-maintenance.mjs';

import { LEGACY_HOST, isValidHostId, readHostId, resolveShardStore, storeReadPaths } from './host-id.mjs';

export const DISTILL_SHARD_REL = 'distill.json';
export const DISTILL_OPERATION_SCHEMA = 1;
export const DISTILL_LEGACY_REL = join('state', 'distill.json');

export const distillStore = (root) => resolveShardStore(root, DISTILL_SHARD_REL, DISTILL_LEGACY_REL);

const snapshots = new WeakMap();
function validateQueue(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.entries) || data.entries.some(e => !e || typeof e !== 'object' || Array.isArray(e))) {
    throw new Error("Invalid candidate queue structure. Original file preserved; repair it before retrying.");
  }
  return data;
}
function readState(root) {
  const rows = storeReadPaths(root, DISTILL_SHARD_REL, DISTILL_LEGACY_REL).map(path => {
    assertWithin(root, path);
    try { return { path, bytes: readFileSync(path) }; }
    catch (e) { if (e.code === 'ENOENT') return { path, bytes: null }; throw e; }
  });
  const signature = JSON.stringify(rows.map(r => [r.path, r.bytes ? createHash('sha256').update(r.bytes).digest('hex') : null]));
  const found = rows.find(r => r.bytes !== null);
  if (!found) return { data: { version: '0.1', entries: [] }, signature };
  let data;
  try { data = JSON.parse(found.bytes.toString('utf8')); }
  catch { throw new Error("Invalid candidate queue JSON. Original file preserved; repair it before retrying."); }
  return { data: validateQueue(data), signature };
}
export function readOwnDistill(root) {
  assertNoActiveInstall(root);
  const { data, signature } = readState(root);
  snapshots.set(data, signature);
  return data;
}

function persistOwnDistill(root, data) {
  const { path } = distillStore(root);
  assertWithin(root, path);
  validateQueue(data);
  try {
    const state = readState(root), expected = snapshots.get(data);
    if (expected !== undefined && expected !== state.signature) throw new Error("Candidate queue changed concurrently; reread before retrying");
    atomicWriteFile(path, JSON.stringify(data, null, 2));
    snapshots.set(data, readState(root).signature);
  } catch (error) {
    throw new Error("Candidate queue write failed: " + error.message, { cause: error });
  }
  return path;
}

export function writeOwnDistill(root, data) {
  const { path }=distillStore(root),release=acquireFileLock(assertWithin(root,path+'.lock'));
  try{return persistOwnDistill(root,data);}finally{release();}
}

export function updateOwnDistill(root, update, { commit } = {}) {
  const {path}=distillStore(root),release=acquireFileLock(assertWithin(root,path+'.lock'));
  try{
    const data=readOwnDistill(root),result=update(data);
    if (commit) {
      validateQueue(data);
      if (snapshots.get(data)!==readState(root).signature) throw new Error("Candidate queue changed concurrently");
      commit(path, Buffer.from(JSON.stringify(data,null,2)+'\n'));
    } else persistOwnDistill(root,data);
    return result;
  }finally{release();}
}

const NEW_ID_RE = /^distill-(.+)-(\d{4})$/;
const OLD_ID_RE = /^distill-(\d{4})$/;

export function nextDistillId(entries, hostId) {
  const prefix = hostId ? `distill-${hostId}-` : 'distill-';
  let max = 0;
  for (const e of entries || []) {
    const id = String((e && e.id) || '');
    if (!id.startsWith(prefix)) continue;
    const rest = id.slice(prefix.length);
    if (!/^\d+$/.test(rest)) continue;
    if (!hostId && !/^\d{4}$/.test(rest)) continue;
    max = Math.max(max, Number(rest));
  }
  return prefix + String(max + 1).padStart(4, '0');
}

export function nextDistillIdFor(root, entries) {
  const id = readHostId(root);
  return nextDistillId(entries, id && isValidHostId(id) ? id : null);
}
export function parseDistillId(id) {
  const s = String(id || '');
  const n = NEW_ID_RE.exec(s);
  if (n) return { hostId: n[1], n: Number(n[2]) };
  const o = OLD_ID_RE.exec(s);
  if (o) return { hostId: LEGACY_HOST, n: Number(o[1]) };
  return null;
}
