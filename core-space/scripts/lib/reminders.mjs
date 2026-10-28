// reminders
import {normalized,timing} from './agenda-records.mjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function remindersDir(root) {
  return join(root, 'user-space', 'reminders');
}
export function reminderPath(root, id) {
  return join(remindersDir(root), `${id}.json`);
}
export function readReminder(root, id) {
  const p = reminderPath(root, id);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
export function listReminders(root) {
  const dir = remindersDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; }
  }).filter(Boolean);
}
export function listOpenReminders(root) {
  return listReminders(root).filter(r => r && r.status === 'open');
}
export function writeReminder(root, reminder) {
  mkdirSync(remindersDir(root), { recursive: true });
  writeFileSync(reminderPath(root, reminder.id), JSON.stringify(reminder, null, 2), 'utf8');
}
export function cancelReminder(root, id, updatedBy) {
  const r = readReminder(root, id);
  if (!r) throw new Error(`reminder not found: ${id}`);
  r.status = 'cancelled';
  r.updatedBy = updatedBy;
  r.updatedAt = new Date().toISOString();
  writeReminder(root, r);
  return r;
}
export function newReminder({ id, title, eventAt, remindAt, leadMinutes = 0, createdBy = '' }) {
  if (!id || !title || !eventAt || !remindAt) throw new Error("id/title/eventAt/remindAt are required");
  if (Date.parse(remindAt) > Date.parse(eventAt)) throw new Error("remindAt must not be later than eventAt");
  return {
    schema: 1, id, title,
    event_at: eventAt, remind_at: remindAt,
    lead_minutes: leadMinutes, status: 'open',
    created_by: createdBy, created_at: new Date().toISOString(),
    updated_by: '', updated_at: '',
  };
}
export function isExpired(reminder, nowMs) {
  if(reminder.schema===2){try{return nowMs>=timing(normalized(reminder),nowMs).end+86400000;}catch{return true;}}
  if(reminder.schema!==undefined&&reminder.schema!==1)return true;
  return nowMs >= Date.parse(reminder.event_at) + 24 * 60 * 60 * 1000;
}
export function listDueReminders(root, nowISO) {
  const now = Date.parse(nowISO);
  return listOpenReminders(root)
    .filter(r => !isExpired(r, now) && now >= Date.parse(r.remind_at))
    .sort((a, b) => Date.parse(a.remind_at) - Date.parse(b.remind_at));
}
