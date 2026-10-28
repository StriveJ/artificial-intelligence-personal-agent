#!/usr/bin/env node
// refresh
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crashGuard } from './lib/error-sink.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
const has = (n) => process.argv.includes('--' + n);
const HERE = dirname(fileURLToPath(import.meta.url));
const root = arg('root') || '.';
crashGuard(root, 'aipa-refresh');
const project = arg('project') || '';

function run(name, script, argv) {
  try {
    const out = execFileSync(process.execPath, [join(HERE, script), ...argv, '--root', root], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    return { status: 'ok', out: String(out).trim() };
  } catch (e) {
    return { status: 'error', message: String((e && e.message) || e).slice(0, 300) };
  }
}

const steps = {};
const details = {};

const dash = run('dashboard', 'aipa-dashboard.mjs', project ? ['--project', project] : []);
steps.dashboard = dash.status;
if (dash.status === 'ok') { try { details.dashboard = JSON.parse(dash.out); } catch {  } }

const usageArgv = ['snapshot'];
if (arg('home')) usageArgv.push('--home', arg('home'));
if (has('all')) usageArgv.push('--all');
const usage = run('hostUsage', 'aipa-host-usage.mjs', usageArgv);
steps.hostUsage = usage.status;
if (usage.status === 'ok') {
  try {
    const o = JSON.parse(usage.out);
    details.hostUsage = { day: o.day, hosts: o.hosts, lines: o.lines };
  } catch {  }
}

if (has('ledger')) {
  const ledger = run('ledger', 'aipa-metrics.mjs', ['snapshot']);
  steps.ledger = ledger.status;
  if (ledger.status === 'ok') { try { details.ledger = { day: JSON.parse(ledger.out).day }; } catch {  } }
}

const ok = Object.values(steps).every((s) => s === 'ok');
console.log(JSON.stringify({ status: ok ? 'ok' : 'partial', steps, details }, null, 2));
process.exit(ok ? 0 : 1);
