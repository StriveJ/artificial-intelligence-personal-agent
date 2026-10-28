#!/usr/bin/env node
// remind
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { remindersDir, newReminder, writeReminder, listOpenReminders, cancelReminder, listDueReminders } from './lib/reminders.mjs';
import { loadAck } from './lib/ack.mjs';

function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'AIPA-MANIFEST.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirname(dirname(start));
}

const argv = process.argv.slice(2);
const cmd = argv[0];
const arg = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : ''; };

const ROOT = arg('root') || findRoot(dirname(fileURLToPath(import.meta.url)));
const STATE = join(ROOT, 'state');
const SCRIPT = fileURLToPath(import.meta.url);
const NODE = process.execPath;
const platform = os.platform();                // win32 | linux | darwin

const pad = (n) => String(n).padStart(2, '0');

function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', ...opts });
  return {
    ok: r.status === 0,
    status: r.status,
    out: (r.stdout || '').trim(),
    err: (r.stderr || '').trim(),
    errno: r.error ? r.error.code : null,
  };
}
function fail(msg) { throw new Error(msg); }

function psStr(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

function shStr(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

// ---------- notify ----------
function notifyWindows(title, message) {
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms',
    `[System.Windows.Forms.MessageBox]::Show(${psStr(message)}, ${psStr(title)}, 'OK', 'Information') | Out-Null`,
  ].join('\n');
  const f = join(os.tmpdir(), 'aipa-notify.ps1');
  writeFileSync(f, '﻿' + ps, 'utf8');
  const r = run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', f]);
  try { rmSync(f, { force: true }); } catch {}
  return r;
}

function notifyUnix(title, message) {
  if (platform === 'darwin') {
    return run('osascript', ['-e', `display notification ${shStr(message)} with title ${shStr(title)} sound name "Glass"`]);
  }
  const r = run('notify-send', ['-u', 'critical', '-t', '0', title, message]);
  if (r.ok) return r;
  const z = run('zenity', ['--info', '--title', title, '--text', message]);
  return z.ok ? z : r;
}

function notify(payload) {
  const r = platform === 'win32'
    ? notifyWindows(payload.title, payload.message)
    : notifyUnix(payload.title, payload.message);
  if (r.ok) { console.log('notify-ok'); return true; }
  console.log('notify-failed');
  console.error(r.err || r.out);
  return false;
}

// ---------- schedule ----------
function parseAt(at) {
  const m = String(at).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) fail("Invalid --at; expected \"YYYY-MM-DD HH:MM\"");
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
}

function scheduleWin(id, jsonPath, t) {
  const taskName = `AIPARemind_${id}`;
  const argLine = `"${SCRIPT}" notify --file "${jsonPath}"`;
  const ps = [
    `$action = New-ScheduledTaskAction -Execute '${NODE.replace(/'/g, "''")}' -Argument '${argLine.replace(/'/g, "''")}'`,
    `$trigger = New-ScheduledTaskTrigger -Once -At (New-Object System.DateTime(${t.y},${t.mo},${t.d},${t.h},${t.mi},0))`,
    `$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive`,
    `Register-ScheduledTask -TaskName '${taskName}' -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null`,
  ].join('\n');
  const f = join(os.tmpdir(), 'aipa-schedule.ps1');
  writeFileSync(f, '﻿' + ps, 'utf8');
  const r = run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f]);
  try { rmSync(f, { force: true }); } catch {}
  if (!r.ok) { console.error(r.err || r.out); fail("schedule failed (Windows task registration failed)"); }
  return taskName;
}

function scheduleSystemd(id, jsonPath, t) {
  const cal = `${t.y}-${pad(t.mo)}-${pad(t.d)} ${pad(t.h)}:${pad(t.mi)}:00`;
  const unit = `aipa-remind-${id}`;
  const args = ['--user', `--on-calendar=${cal}`, `--unit=${unit}`];

  for (const k of ['DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS', 'XAUTHORITY']) {
    if (process.env[k]) args.push(`--setenv=${k}=${process.env[k]}`);
  }
  args.push(NODE, SCRIPT, 'notify', '--file', jsonPath);
  const r = run('systemd-run', args);
  return r.ok ? { backend: 'systemd', handle: unit } : null;
}

function scheduleAt(id, jsonPath, t) {
  const tspec = `${String(t.y).padStart(4, '0')}${pad(t.mo)}${pad(t.d)}${pad(t.h)}${pad(t.mi)}`;
  const jobFile = join(os.tmpdir(), `aipa-at-${id}.txt`);
  writeFileSync(jobFile, `${NODE} "${SCRIPT}" notify --file "${jsonPath}"\n`, 'utf8');
  const r = run('at', ['-f', jobFile, '-t', tspec]);
  try { rmSync(jobFile, { force: true }); } catch {}
  if (!r.ok) return null;
  const jm = r.out.match(/job (\d+)/i);
  return { backend: 'at', handle: jm ? jm[1] : '' };
}

function schedule() {
  const at = arg('at'); const title = arg('title'); const message = arg('message');
  if (!at || !title || !message) fail("schedule requires --at --title --message");
  const t = parseAt(at);
  const target = new Date(t.y, t.mo - 1, t.d, t.h, t.mi, 0);
  if (target <= new Date()) fail("--at must be in the future");
  const id = String(Date.now()).slice(-8);
  const jsonPath = join(STATE, `remind-${id}.json`);
  mkdirSync(STATE, { recursive: true });
  writeFileSync(jsonPath, JSON.stringify({ title, message, at }), 'utf8');

  let result;
  try {
    result = platform === 'win32'
      ? { backend: 'schtasks', handle: scheduleWin(id, jsonPath, t) }
      : (scheduleSystemd(id, jsonPath, t) || scheduleAt(id, jsonPath, t));
  } catch (e) {
    try { rmSync(jsonPath, { force: true }); } catch {}
    throw e;
  }
  if (!result) {
    try { rmSync(jsonPath, { force: true }); } catch {}
    fail("Linux scheduling failed: systemd-run and at are unavailable (install and enable at when the systemd user instance is not running)");
  }

  writeFileSync(jsonPath, JSON.stringify({ title, message, at, handle: result.handle, backend: result.backend, platform }), 'utf8');
  console.log(JSON.stringify({ id, handle: result.handle, backend: result.backend, at, json: jsonPath }));
}

// ---------- cancel-schedule ----------
function cancelSchedule() {
  const id = arg('id');
  if (!id) fail("cancel-schedule requires --id");
  const jsonPath = join(STATE, `remind-${id}.json`);
  if (!existsSync(jsonPath)) fail(`Reminder not found: ${id} (possibly already executed or deleted)`);
  const p = JSON.parse(readFileSync(jsonPath, 'utf8'));
  let r;
  if (platform === 'win32') {
    r = run('schtasks', ['/Delete', '/F', '/TN', p.handle]);
  } else if (p.backend === 'systemd') {

    run('systemctl', ['--user', 'stop', `${p.handle}.timer`, `${p.handle}.service`]);
    const remain = run('systemctl', ['--user', 'list-timers', '--all', '--no-legend', `${p.handle}.timer`]);
    r = remain.out ? { ok: false, err: "timer still exists; cancellation failed" } : { ok: true };
  } else {
    r = run('at', ['-r', p.handle]);
  }
  if (r.ok) {
    console.log('cancelled');
  } else {
    console.log('cancel-failed');
    console.error(r.err || r.errno || r.out);
    try { rmSync(jsonPath, { force: true }); } catch {}
    process.exit(1);
  }
  try { rmSync(jsonPath, { force: true }); } catch {}
}

function runGit(root, args) {
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
function commitAndPush(root) {
  const st = runGit(root, ['status', '--porcelain', 'user-space/reminders']);
  if (!st.ok) return { ok: false, err: st.err };
  if (!st.out.trim()) return { ok: true, skipped: 'no-change' };
  const add = runGit(root, ['add', 'user-space/reminders']);
  if (!add.ok) return add;
  const c = runGit(root, ['commit', '-m', "chore(reminders): add/cancel reminders"]);
  if (!c.ok) return c;
  const p = runGit(root, ['push']);
  return p.ok ? { ok: true } : { ok: false, err: `commit ok, push failed: ${p.err}` };
}

// ---------- dispatch ----------
try {
  if (cmd === 'add') {
    const rem = newReminder({
      id: arg('id'), title: arg('title'),
      eventAt: arg('event-at'), remindAt: arg('remind-at'),
      leadMinutes: Number(arg('lead-minutes') || 0), createdBy: arg('created-by') || os.hostname(),
    });
    writeReminder(ROOT, rem);
    if (argv.includes('--commit')) console.log(JSON.stringify({ ok: true, ...commitAndPush(ROOT) }));
    else console.log(JSON.stringify({ ok: true, id: rem.id, path: remindersDir(ROOT) }));
  } else if (cmd === 'list') {
    console.log(JSON.stringify(listOpenReminders(ROOT), null, 2));
  } else if (cmd === 'cancel' || cmd === 'cancel-reminder') {
    const r = cancelReminder(ROOT, arg('id'), arg('by') || os.hostname());
    if (argv.includes('--commit')) console.log(JSON.stringify({ ok: true, ...commitAndPush(ROOT) }));
    else console.log(JSON.stringify({ ok: true, id: r.id, status: r.status }));
  } else if (cmd === 'due') {
    const now = arg('now') || new Date().toISOString();
    const device = arg('device') || os.hostname();
    const channel = arg('channel') || (argv.includes('--session') ? 'session' : 'system');
    const ack = loadAck(ROOT, device);
    const items = listDueReminders(ROOT, now).filter(r => !((ack[r.id] || {}).channels || []).includes(channel));
    console.log(JSON.stringify({ items }));
  } else if (cmd === 'notify') {
    const file = arg('file');
    const payload = file
      ? JSON.parse(readFileSync(file, 'utf8'))
      : { title: arg('title') || "Reminder", message: arg('message') || '' };
    if (!notify(payload)) process.exit(1);
  } else if (cmd === 'schedule') {
    schedule();
  } else if (cmd === 'cancel-schedule') {
    cancelSchedule();
  } else {
    fail("Usage: aipa-remind.mjs <add|list|cancel|cancel-reminder|due|notify|schedule|cancel-schedule> ...");
  }
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
