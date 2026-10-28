// notify
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, platform } from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

function psFile(name, body) {
  const p = join(tmpdir(), name);
  writeFileSync(p, '\ufeff' + body, 'utf8');
  return p;
}

export function notificationCommand(cmd, args, { spawnProcess = spawn, timeoutMs = 20000 } = {}) {
  return new Promise(resolve => {
    let child, settled = false;
    const done = ok => { if (!settled) { settled = true; clearTimeout(timer); resolve(ok); } };
    const timer = setTimeout(() => { try { child?.kill(); } catch {} done(false); }, timeoutMs);
    try {
      child = spawnProcess(cmd, args, { stdio: 'ignore', windowsHide: true });
      child.once('error', () => done(false));
      child.once('close', (code, signal) => done(code === 0 && !signal));
    } catch { done(false); }
  });
}
export async function platformNotify({ title, message }) {
  if (platform() === 'win32') {
    const esc = s => String(s).replace(/'/g, "''");
    const ps = [
      '$ErrorActionPreference = "Stop"',
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      `$n = New-Object System.Windows.Forms.NotifyIcon`,
      `$n.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon((Join-Path $env:WINDIR 'System32\\notepad.exe'))`,
      `$n.Visible = $true`,
      `$n.BalloonTipTitle = '${esc(title)}'`,
      `$n.BalloonTipText = '${esc(message)}'`,
      `$n.ShowBalloonTip(10000)`,
      `Start-Sleep -Seconds 12`,
      `$n.Dispose()`,
    ].join('\n');
    const f = psFile('aipa-notify-' + randomUUID() + '.ps1', ps);
    try { return await notificationCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', f]); }
    finally { rmSync(f, { force: true }); }
  }
  if (platform() === 'darwin') {
    const esc = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return notificationCommand('osascript', ['-e', `display notification "${esc(message)}" with title "${esc(title)}" sound name "Glass"`]);
  }
  if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) {
    return notificationCommand('notify-send', ['-u', 'normal', '-t', '10000', title, message]);
  }
  return false;
}
