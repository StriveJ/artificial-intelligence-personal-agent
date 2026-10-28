import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

function safe(device) { return String(device).replace(/[^A-Za-z0-9_.-]/g, '_'); }
export function ackPath(root, device) { return join(root, 'state', `reminder-ack-${safe(device)}.json`); }
export function loadAck(root, device) {
  const p = ackPath(root, device);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
}
export function markAck(root, device, id, channel, atISO = new Date().toISOString()) {
  const data = loadAck(root, device);
  const cur = data[id] || { channels: [], at: atISO };
  if (!cur.channels.includes(channel)) cur.channels.push(channel);
  cur.at = atISO;
  data[id] = cur;
  mkdirSync(join(root, 'state'), { recursive: true });
  writeFileSync(ackPath(root, device), JSON.stringify(data, null, 2), 'utf8');
}
export function hasAck(root, device, id, channel) {
  const cur = loadAck(root, device)[id];
  return Boolean(cur && cur.channels && cur.channels.includes(channel));
}
