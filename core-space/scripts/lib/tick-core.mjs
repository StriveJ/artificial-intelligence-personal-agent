import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { markAck, hasAck } from './ack.mjs';
import { appendPending, clearPending } from './pending.mjs';

export function validAction(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return false;
  if (a.reminder_id !== undefined && (typeof a.reminder_id !== 'string' || !a.reminder_id)) return false;
  if (a.channel === 'system') return typeof a.title === 'string' && typeof a.message === 'string';
  if (a.channel === 'session') return Array.isArray(a.lines) && a.lines.every(s => typeof s === 'string');
  return false;
}

export function listPluginFiles(root) {
  const dir = join(root, 'user-space', 'tasks');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.mjs')).sort();
}
export function runPlugins({ root, nowISO, device, reason, only = [], timeoutMs = 30000 }) {
  const files = listPluginFiles(root);
  const plugins = [];
  const errors = [];
  for (const f of files) {
    const name = f.replace(/\.mjs$/, '');
    if (only.length && !only.includes(name)) continue;
    const r = spawnSync(process.execPath, [join(root, 'user-space', 'tasks', f), '--root', root, '--now', nowISO, '--device', device, '--reason', reason], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 1024 * 1024 });
    try {
      if (r.error || r.signal || r.status !== 0) throw new Error('plugin process failed: ' + (r.error?.message || r.signal || 'exit ' + r.status));
      const out = JSON.parse(r.stdout || '{}');
      if (out.status !== 'ok' || !Array.isArray(out.actions)) throw new Error('bad plugin output');
      if (out.actions.some(a => !validAction(a))) throw new Error('bad plugin action');
      plugins.push({ name, actions: out.actions });
    } catch (e) {
      errors.push({ name, error: String(e && e.message || e), stderr: r.stderr });
    }
  }
  return { plugins, errors };
}
export async function dispatchActions({ root, device, actions, notify }) {
  const sent = [], queued = [], session = [], errors = [];
  for (const a of actions) {
    if (!validAction(a)) { errors.push({ action: a, error: 'invalid action' }); continue; }
    try {
    if (a.channel === 'system') {
      let ok = false;
      try { ok = await notify({ title: a.title, message: a.message }); }
      catch (error) { errors.push({ action: a, error: 'notify failed: ' + error.message }); }
      if (ok) { sent.push(a); }
      else { appendPending(root, device, { id: a.reminder_id || String(Date.now()), title: a.title, message: a.message }); queued.push(a); }
      if (a.reminder_id && !hasAck(root, device, a.reminder_id, 'system')) markAck(root, device, a.reminder_id, 'system');
    } else if (a.channel === 'session') {
      session.push(a);
      if (a.reminder_id && !hasAck(root, device, a.reminder_id, 'session')) markAck(root, device, a.reminder_id, 'session');
      if (a.from_pending && a.reminder_id) clearPending(root, device, [a.reminder_id]);
    } else {
      errors.push({ action: a, error: 'unknown channel' });
    }
    } catch (error) { errors.push({ action: a, error: error.message }); }
  }
  return { sent, queued, session, errors };
}
