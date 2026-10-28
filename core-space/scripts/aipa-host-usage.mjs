#!/usr/bin/env node
// host usage
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';

// usage:

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { collectHostUsage, hostUsageLines, readOwnUsageRows, readUsageRows, resolveUsageStore, upsertUsageRow, writeUsageRows } from './lib/host-usage.mjs';
import { collectRegisteredProjects } from './lib/shell-sync.mjs';
import { dayKey } from './lib/time-boundary.mjs';
import { dayStartHour as llmDayStartHour } from './lib/llm-provider.mjs';
import { crashGuard } from './lib/error-sink.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
const has = (n) => process.argv.includes('--' + n);
function tsLocal(d){return businessTimestamp(root,d);}
const KNOWN = new Set(['snapshot', 'show']);

const root = resolve(arg('root') || '.');
crashGuard(root, 'aipa-host-usage');
const cmd = process.argv.slice(2).find((a) => KNOWN.has(a)) || '';

const dayStartHour = llmDayStartHour(root);
const today = dayKey(tsLocal(new Date()), dayStartHour);

if (cmd === 'snapshot') {
  const day = arg('day') || today;
  const store = resolveUsageStore(root);

  const scopePaths = has('all') ? [] : [root, ...collectRegisteredProjects(root)];
  const rows = collectHostUsage({ day, dayStartHour, home: arg('home') || homedir(), scopePaths });

  const prev = readOwnUsageRows(root);
  let merged = prev;
  for (const r of rows) merged = upsertUsageRow(merged, r);
  const path = rows.length ? writeUsageRows(root, merged) : store.path;
  console.log(JSON.stringify({
    status: 'ok',
    day,
    scope: scopePaths.length ? scopePaths : 'all',
    hosts: rows.map((r) => r.host),
    path,
    ...(store.hint ? { hint: store.hint } : {}),
    lines: hostUsageLines(rows, day),
  }, null, 2));
  if (store.hint) console.error(store.hint);
} else if (cmd === 'show') {
  const days = Number(arg('days') || 14);
  const store = resolveUsageStore(root);
  const rows = readUsageRows(root);
  const dates = [...new Set(rows.map((r) => r.date))].sort().slice(-days);
  const picked = rows.filter((r) => dates.includes(r.date));
  if (has('json')) console.log(JSON.stringify({ status: 'ok', store: store.path, rows: picked, ...(store.hint ? { hint: store.hint } : {}) }, null, 2));
  else if (!picked.length) console.log(`No host-usage snapshot yet (${store.path}). Collect: node core-space/scripts/aipa-host-usage.mjs snapshot --root <instance>`);
  else {
    console.log(`Actual host usage (last ${dates.length} days, source ${store.path})`);
    for (const d of dates) console.log(`${d}  ${hostUsageLines(rows, d).join(' | ')}`);
  }
  if (store.hint) console.error(store.hint);
} else {
  console.error('usage: aipa-host-usage.mjs snapshot [--day <YYYY-MM-DD>] [--home <dir>] [--all] | show [--days <N>] [--json]');
  process.exit(1);
}
