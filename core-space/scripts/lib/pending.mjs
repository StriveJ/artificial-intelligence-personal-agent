import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function safe(device) { return String(device).replace(/[^A-Za-z0-9_.-]/g, '_'); }
export function pendingPath(root, device) { return join(root, 'state', `notification-pending-${safe(device)}.json`); }
export function readPending(root, device) {
  const p = pendingPath(root, device);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : []; } catch { return []; }
}
export function appendPending(root, device, item) {
  const all = readPending(root, device);
  if (!all.some(x => x.id === item.id)) all.push({ ...item, created_at: new Date().toISOString() });
  mkdirSync(join(root, 'state'), { recursive: true });
  writeFileSync(pendingPath(root, device), JSON.stringify(all, null, 2), 'utf8');
}
export function clearPending(root, device, ids = null) {
  const all = readPending(root, device);
  const next = ids ? all.filter(x => !ids.includes(x.id)) : [];
  mkdirSync(join(root, 'state'), { recursive: true });
  writeFileSync(pendingPath(root, device), JSON.stringify(next, null, 2), 'utf8');
}
