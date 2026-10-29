// offload
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';
import { dayStartHour as sharedDayStartHour } from './lib/day-clock.mjs';

// usage:

//   aipa-offload get  --root <r> --id <id>
//   aipa-offload list --root <r> [--project <p>]
//   aipa-offload gc   --root <r> [--days 7]
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addEntry, formatPointer, gcIndex, parseIndex, serializeIndex } from './lib/offload.mjs';
import { appendOffloadLedger } from './lib/token-metrics.mjs';
import { dayKey } from './lib/time-boundary.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
function tsLocal(d){return businessTimestamp(root,d);}
const root = arg('root') || '.';

const KNOWN = new Set(['put', 'get', 'list', 'gc']);
const cmd = process.argv.slice(2).find((a) => KNOWN.has(a)) || '';

const dayStartHour = sharedDayStartHour(root);
const nowTsLocal = arg('ts') || tsLocal(new Date());
const today = dayKey(nowTsLocal, dayStartHour);
const indexPath = join(root, 'state', 'offload', 'index.json');
const loadIndex = () => (existsSync(indexPath) ? parseIndex(readFileSync(indexPath, 'utf8')) : { version: '0.1', entries: [] });
const saveIndex = (i) => { mkdirSync(join(root, 'state', 'offload'), { recursive: true }); writeFileSync(indexPath, serializeIndex(i), 'utf8'); };

if (cmd === 'put') {
  const project = arg('project') || '';
  if (!project) { console.error("Missing --project"); process.exit(1); }
  let content = '';
  const f = arg('input');
  if (f) content = readFileSync(f, 'utf8');
  else { try { content = readFileSync(0, 'utf8'); } catch {  } }
  if (!content.trim()) { console.error("Missing content (--input <file> or stdin)"); process.exit(1); }
  const rand = Math.random().toString(36).slice(2, 6);
  const id = `off-${tsLocal(new Date()).replace(/[-: ]/g, '').slice(0, 14)}-${rand}`;
  const rel = `state/offload/${project}/${id}.txt`;
  mkdirSync(join(root, 'state', 'offload', project), { recursive: true });
  writeFileSync(join(root, rel), content, 'utf8');
  const entry = { id, project, at: today, bytes: Buffer.byteLength(content, 'utf8'), summary: arg('summary') || "(no summary)", path: rel };
  saveIndex(addEntry(loadIndex(), entry));

  try { appendOffloadLedger(root, entry); } catch {  }
  console.log(JSON.stringify({ status: 'ok', id, bytes: entry.bytes, pointer: formatPointer(entry) }, null, 2));
} else if (cmd === 'get') {
  const id = arg('id');
  const entry = loadIndex().entries.find((e) => e.id === id);
  if (!entry) { console.error('not found: ' + id); process.exit(1); }
  process.stdout.write(readFileSync(join(root, entry.path), 'utf8'));
} else if (cmd === 'list') {
  const project = arg('project') || '';
  const entries = loadIndex().entries.filter((e) => !project || e.project === project);
  console.log(JSON.stringify({ status: 'ok', count: entries.length, totalBytes: entries.reduce((a, e) => a + (e.bytes || 0), 0), entries }, null, 2));
} else if (cmd === 'gc') {
  const days = Number(arg('days') || '7');

  const cutoffDate = new Date(Date.now() - days * 86400000);
  const cutoff = dayKey(tsLocal(cutoffDate), dayStartHour);
  const before = loadIndex();
  const { index, removed } = gcIndex(before, cutoff);
  let removedBytes = 0;
  for (const id of removed) {
    const e = before.entries.find((x) => x.id === id);
    if (e) {
      removedBytes += Number(e.bytes) || 0;
      try { rmSync(join(root, e.path), { force: true }); } catch {  }
    }
  }
  saveIndex(index);

  if (removed.length) {
    try {
      appendOffloadLedger(root, {
        at: today,
        id: `gc-${nowTsLocal.replace(/[-: ]/g, '')}`,
        bytes: removedBytes,
        summary: `gc ${removed.length} entries`,
        type: 'gc',
        entries: removed.length,
      });
    } catch (e) {
      console.error("gc completed, but audit recording failed: " + e.message);
    }
  }
  console.log(JSON.stringify({ status: 'ok', removed: removed.length, cutoff }));
} else {
  console.error('usage: put --project <p> --summary <s> | get --id <id> | list [--project <p>] | gc [--days 7]');
  process.exit(1);
}
