import {clockTimestamp} from './day-clock.mjs';
import { listDueReminders } from './reminders.mjs';
import { hasAck } from './ack.mjs';
import { readPending } from './pending.mjs';

function displayAt(iso,root) { return clockTimestamp(root,new Date(iso)).slice(0,16); }
export function collectReminderActions({ root, nowISO, device, reason }) {
  const channel = reason === 'session' ? 'session' : 'system';
  const due = listDueReminders(root, nowISO).filter(r => !hasAck(root, device, r.id, channel));
  const actions = [];
  for (const r of due) {
    if (channel === 'system') {
      actions.push({
        channel: 'system',
        title: "AIPA Reminder",
        message: `${r.title} starts at ${(r.all_day ? r.start_date+" all day" : displayAt(r.event_at,root))}`,
        reminder_id: r.id,
      });
    } else {
      actions.push({
        channel: 'session',
        lines: [`[Reminder] ${r.title} · ${(r.all_day ? r.start_date+" all day" : displayAt(r.event_at,root))}`],
        reminder_id: r.id,
      });
    }
  }
  if (channel === 'session') {
    const shown = new Set(due.map(r => r.id));
    for (const p of readPending(root, device)) {
      if (shown.has(p.id)) continue;
      actions.push({ channel: 'session', lines: [`[Reminder] ${p.message}`], reminder_id: p.id, from_pending: true });
    }
  }
  return { status: 'ok', actions };
}
