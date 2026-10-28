#!/usr/bin/env node
// tick
import { replayOfflineTasks } from './lib/offline-tasks.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { resolveShardStore } from './lib/host-id.mjs';
import { platform as osPlatform, homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runPlugins, dispatchActions } from './lib/tick-core.mjs';
import { platformNotify } from './lib/notify.mjs';
import { appendError } from './lib/error-sink.mjs';
import { acquireFileLock } from './lib/file-lock.mjs';
import { isOwnRepository } from './lib/git-staging.mjs';
import { atomicWriteFile } from './lib/atomic-write.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }

const root = arg('root') || '.';
const device = arg('device') || '';
const reason = arg('reason') || 'scheduled';
const only = arg('plugins') ? arg('plugins').split(',') : [];
const sleepFile = join(root, 'state', 'sleep-mode.md');
const lockFile = join(root, 'state', 'tick.lock');

const lastStore = resolveShardStore(root, 'tick-last.json', join('state', 'tick-last.json'));
const mode = pickCmd(process.argv.slice(2), ['install', 'status', 'uninstall']) || 'run';
const script = fileURLToPath(import.meta.url);
const node = process.execPath;

function fail(msg) { throw new Error(msg); }
function gitPull() {
  if (!isOwnRepository(root)) return;
  try { execFileSync('git', ['-C', root, 'pull', '--ff-only'], { encoding: 'utf8', stdio: 'pipe', timeout: 30000 }); }
  catch (error) { throw new Error("Instance Git pull failed: " + error.message); }
}

function installTick() {
  if (!device) fail("install/status/uninstall requires --device");
  const argLine = `"${script}" --root "${root}" --device "${device}" --reason scheduled`;
  if (osPlatform() === 'win32') {
    const task = 'AIPATick_' + device.replace(/[^A-Za-z0-9]/g, '_');
    if (mode === 'uninstall') { execFileSync('schtasks', ['/Delete', '/F', '/TN', task], { stdio: 'inherit' }); return; }
    if (mode === 'status') { execFileSync('schtasks', ['/Query', '/TN', task], { stdio: 'inherit' }); return; }
    execFileSync('schtasks', ['/Create', '/F', '/SC', 'HOURLY', '/TN', task, '/TR', `"${node}" ${argLine}`], { stdio: 'inherit' });
    return;
  }
  if (osPlatform() === 'linux') {
    const unitDir = join(homedir(), '.config', 'systemd', 'user');
    mkdirSync(unitDir, { recursive: true });
    const svc = join(unitDir, 'aipa-tick.service');
    const timer = join(unitDir, 'aipa-tick.timer');
    writeFileSync(svc, `[Unit]\nDescription=AIPA hourly tick\n[Service]\nType=oneshot\nExecStart=${node} ${argLine}\n`, 'utf8');
    writeFileSync(timer, `[Unit]\nDescription=AIPA hourly tick\n[Timer]\nOnCalendar=hourly\nPersistent=true\n[Install]\nWantedBy=timers.target\n`, 'utf8');
    execFileSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'inherit' });
    if (mode === 'install') execFileSync('systemctl', ['--user', 'enable', '--now', 'aipa-tick.timer'], { stdio: 'inherit' });
    if (mode === 'uninstall') execFileSync('systemctl', ['--user', 'disable', '--now', 'aipa-tick.timer'], { stdio: 'inherit' });
    if (mode === 'status') execFileSync('systemctl', ['--user', 'status', 'aipa-tick.timer'], { stdio: 'inherit' });
    return;
  }
  if (osPlatform() === 'darwin') {
    const plist = join(homedir(), 'Library', 'LaunchAgents', 'com.aipa.tick.plist');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.aipa.tick</string>
<key>ProgramArguments</key><array><string>${node}</string><string>${script}</string><string>--root</string><string>${root}</string><string>--device</string><string>${device}</string><string>--reason</string><string>scheduled</string></array>
<key>StartInterval</key><integer>3600</integer>
</dict></plist>`;
    writeFileSync(plist, xml, 'utf8');
    if (mode === 'install') execFileSync('launchctl', ['load', '-w', plist], { stdio: 'inherit' });
    if (mode === 'uninstall') execFileSync('launchctl', ['unload', plist], { stdio: 'inherit' });
    if (mode === 'status') execFileSync('launchctl', ['list', 'com.aipa.tick'], { stdio: 'inherit' });
    return;
  }
  fail(`unsupported platform: ${osPlatform()}`);
}

async function runTick() {
  if (existsSync(sleepFile)) { console.log('sleeping'); return; }
  let release;
  try { release = acquireFileLock(lockFile); }
  catch (error) { if (error.code === 'ELOCKED') { console.error(error.message); console.log('locked'); return; } throw error; }
  try {

    if (reason !== 'session') gitPull();
    const replay=await replayOfflineTasks(root,{apply:true});
    const now = new Date().toISOString();
    const { plugins, errors } = runPlugins({ root, nowISO: now, device, reason, only });
    if(replay.status==='partial')errors.push({name:'offline-replay',error:"Deterministic replay is partially incomplete; run offline-queue tasks to review results"});

    for (const e of errors) {
      try { appendError(root, { ts: now, scope: `tick:${e.name}`, message: String(e.error || 'plugin error') }); } catch {}
    }
    const actions = plugins.flatMap(p => p.actions);
    const summary = await dispatchActions({ root, device, actions, notify: platformNotify });
    for (const e of summary.errors) {
      errors.push({ name: 'dispatch', error: e.error });
      try { appendError(root, { ts: now, scope: 'tick:dispatch', message: e.error }); } catch {}
    }
    const sessionLines = summary.session.flatMap(a => a.lines || []);
    if (sessionLines.length) console.log("Upcoming reminders:\n" + sessionLines.map(l => '- ' + l).join('\n'));
    mkdirSync(dirname(lastStore.path), { recursive: true });
    atomicWriteFile(lastStore.path, JSON.stringify({ at: now, device, reason, plugins: plugins.map(p => ({ name: p.name, actions: p.actions.length })), errors }, null, 2));
    if (lastStore.hint) console.error(lastStore.hint);
    console.log(JSON.stringify({ status: errors.length ? 'degraded' : 'ok', replay, sent: summary.sent.length, queued: summary.queued.length, session: summary.session.length, errors }, null, 2));
  } finally {
    release();
  }
}

if (mode !== 'run') {
  try { installTick(); } catch (e) { console.error(e.message || e); process.exit(1); }
} else {
  runTick().catch(e => {
    try { appendError(root, { ts: new Date().toISOString(), scope: 'aipa-tick', message: String(e && e.message || e) }); } catch {}
    console.error(e.message || e);
    process.exit(1);
  });
}
