// metrics
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';
import { dayStartHour as sharedDayStartHour } from './lib/day-clock.mjs';

// usage:

import { readFileSync } from 'node:fs';
import { ledgerFromSnapshot, ledgerLines, periodSummary, readMergedSnapshots, readSnapshots, renderLedger, resolveMetricStore, searchInsightLines, searchInsights, writeSnapshot } from './lib/token-metrics.mjs';
import { dayKey } from './lib/time-boundary.mjs';
import { crashGuard } from './lib/error-sink.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
const has = (n) => process.argv.includes('--' + n);
function tsLocal(d){return businessTimestamp(root,d);}

const root = arg('root') || '.';
crashGuard(root, 'aipa-metrics');
const cmd = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== arg('root') && a !== arg('date') && a !== arg('days') && a !== arg('project') && a !== arg('month') && a !== arg('year')) || '';
const dayStartHour = sharedDayStartHour(root);
const today = dayKey(tsLocal(new Date()), dayStartHour);

if (cmd === 'snapshot') {
  const date = arg('date') || today;
  if (date !== today && !has('force')) {
    console.error(`Refusing to write ${date}: snapshot keys must use the collection day (${today}). To write a historical date, explicitly pass --force and explain this in the report.`);
    process.exit(1);
  }

  const metrics = renderLedger(root, date, { project: arg('project') || '' });
  const { path, snapshots } = writeSnapshot(root, date, metrics);
  const store = resolveMetricStore(root);
  console.log(JSON.stringify({ status: 'ok', date, path, days: snapshots.length, lines: ledgerLines(metrics) }, null, 2));
  if (store.hint) console.error(store.hint);
} else if (cmd === 'show') {
  const days = Number(arg('days') || 14);
  const store = resolveMetricStore(root);
  const list = readMergedSnapshots(root).slice(-days);
  if (has('json')) {
    console.log(JSON.stringify({ status: 'ok', store: store.path, snapshots: list, ...(store.hint ? { hint: store.hint } : {}) }, null, 2));
  } else if (!list.length) {
    console.log(`No snapshot yet (${store.path} does not exist). Collect: node core-space/scripts/aipa-metrics.mjs snapshot --root <instance>`);
  } else {
    console.log(`Token savings snapshot (last ${list.length} days, source ${store.path})`);
    for (const s of list) console.log(`${s.date}  ${ledgerLines(ledgerFromSnapshot(s)).slice(0, 3).join('|')}`);
  }
  if (store.hint) console.error(store.hint);
} else if (cmd === 'merge') {

  const date = arg('date') || today;
  const merged = readMergedSnapshots(root);
  const hit = merged.find((x) => String(x.date) === date);
  if (has('json')) console.log(JSON.stringify({ status: 'ok', date, days: merged.length, sources: hit ? Object.keys(hit.sources || {}) : [], merged: hit || null }, null, 2));
  else if (!hit) console.log(`Merged ledger: ${date} has no device snapshots yet`);
  else {
    console.log(`Merged ledger ${date} (source ${Object.keys(hit.sources || {}).join(' + ') || "none"})`);
    for (const line of ledgerLines(ledgerFromSnapshot(hit)).slice(0, 4)) console.log(line);
  }
} else if (cmd === 'summary') {

  const month = arg('month');
  const year = arg('year');
  const days = month || year ? 0 : Number(arg('days') || 7);
  const s = periodSummary(readMergedSnapshots(root), { days, month, year });
  if (has('json')) console.log(JSON.stringify({ status: 'ok', ...s }, null, 2));
  else for (const line of s.lines) console.log(line);
} else if (cmd === 'insights') {

  const ins = searchInsights(root, { days: Number(arg('days') || 7), today });
  const lines = searchInsightLines(ins);
  if (has('json')) console.log(JSON.stringify({ status: 'ok', ...ins }, null, 2));
  else for (const line of lines) console.log(line);
} else {
  console.error("usage: aipa-metrics.mjs snapshot [--project <project>] [--date <YYYY-MM-DD>] [--force] | show [--days <N>] [--json] | summary [--days <N>|--month <YYYY-MM>|--year <YYYY>] | insights [--days <N>]");
  process.exit(1);
}
