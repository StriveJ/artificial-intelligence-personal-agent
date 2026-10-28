// prune
import { resolve } from 'node:path';
import { fmtDate, addDays } from './lib/time-boundary.mjs';
import { pruneEvents, restoreArchivedEvents } from './lib/event-archive.mjs';
import {todayKey} from './lib/day-clock.mjs';
function arg(name) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : ''; }
try {
  const values = new Set(['--root', '--days', '--restore']), flags = new Set(['--apply', '--force', '--json']), seen = new Set();
  for (let i = 2; i < process.argv.length; i++) {
    const option = process.argv[i];
    if (seen.has(option) || (!values.has(option) && !flags.has(option))) throw new Error("Unknown or duplicate argument: " + option);
    seen.add(option);
    if (values.has(option) && (!process.argv[++i] || process.argv[i].startsWith('--'))) throw new Error("Argument missing a value: " + option);
  }
  if (!arg('root')) throw new Error("Explicit --root required; default is preview, --apply performs changes");
  const root = resolve(arg('root')), apply = process.argv.includes('--apply'), days = Number(arg('days') || 7);
  if (!Number.isInteger(days) || days < 0) throw new Error("--days must be a nonnegative integer");
  const result = arg('restore') ? restoreArchivedEvents(root, arg('restore'), { apply })
    : pruneEvents(root, { cutoff: addDays(todayKey(root), -days), apply, force: process.argv.includes('--force') });
  if (process.argv.includes('--json')) console.log(JSON.stringify(result));
  else if (arg('restore')) console.log(result.mode + ' ' + result.identity);
  else console.log(`${result.mode} pruned ${result.pruned} eligible ${result.eligible} kept ${result.kept.length}` + (result.kept.length ? ' (' + result.kept.map(r => r.day + ': ' + r.reason).join('; ') + ')' : ''));
  if (result.status === 'partial') process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
