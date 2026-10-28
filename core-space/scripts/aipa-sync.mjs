#!/usr/bin/env node
// sync
// usage:

import { pickCmd } from './lib/argv.mjs';
import { readHostId } from './lib/host-id.mjs';
import { appendSyncRule, readSyncRules, syncRulesPath } from './lib/sync-rules.mjs';
import { tsLocal } from './lib/day-clock.mjs';
import { crashGuard } from './lib/error-sink.mjs';
import { privateRuntimePath } from './lib/runtime-state-policy.mjs';

function argAll(name) {
  const out = [];
  process.argv.forEach((a, i) => { if (a === '--' + name) out.push(process.argv[i + 1] || ''); });
  return out.filter(Boolean);
}
function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }

const root = arg('root') || '.';
crashGuard(root, 'aipa-sync');
const cmd = pickCmd(process.argv.slice(2), ['scan', 'classify', 'list']);

const norm = (p) => String(p || '').replace(/\\/g, '/');

const LEGACY_EXACT = new Set([
  'state/distill.json', 'state/memory-writes.jsonl', 'state/search-log.jsonl',
  'state/session-events.jsonl', 'state/session-summary.md',
  'state/signal.json', 'state/tick-last.json', 'state/warmup.json',
]);
const LEGACY_PREFIXES = ['state/archive/', 'state/canvas/', 'state/events/', 'state/sync-rules/'];

function staticClassOf(relPath) {
  const p = norm(relPath);
  if (!p) return '';
  if (privateRuntimePath(p)) return 'private';
  if (p.startsWith('state/hosts/')) return 'host';
  if (/^state\/[^/]+\.log$/.test(p) || p.startsWith('state/.origin-cache/')
      || p.startsWith('state/offload/') || p.startsWith('state/test/')) return 'private';
  if (/^state\/reminder-ack-.+\.json$/.test(p)) return 'legacy';
  if (LEGACY_EXACT.has(p) || LEGACY_PREFIXES.some((x) => p.startsWith(x))) return 'legacy';
  if (p.startsWith('core-space/')) return 'shared';
  if (p.startsWith('user-space/')) return 'shared';
  if (!p.includes('/')) return 'shared';
  return '';
}

const CLASS_HINT = "Classes: host (per-device directory) | shared (shared single writer) | private (device-local, excluded from Git)";

if (cmd === 'scan') {
  const changed = argAll('changed');
  const registered = readSyncRules(root);
  const out = [];
  for (const p of changed) {
    if (staticClassOf(p)) continue;
    if (registered.has(norm(p))) continue;
    out.push(norm(p));
  }
  if (out.length) {
    console.log(`Found ${out.length} unclassified files (other devices may also modify them, causing conflicts):`);
    for (const p of out) console.log(`  <${p}>`);
    console.log(CLASS_HINT);
    console.log(`Classify: node core-space/scripts/aipa-sync.mjs classify --pattern "<path>" --class <host|shared|private>`);
  }

} else if (cmd === 'classify') {
  const pattern = arg('pattern');
  const klass = arg('class');
  if (!pattern) { console.error('missing --pattern'); process.exit(1); }
  if (!['host', 'shared', 'private'].includes(klass)) { console.error('invalid --class: ' + klass + "(only host / shared / private allowed)"); process.exit(1); }
  const rule = {
    pattern: norm(pattern),
    class: klass,
    decidedBy: arg('decidedBy') || '',
    ts: arg('ts') || tsLocal(new Date()),
    reason: arg('reason') || '',
  };

  if (!rule.decidedBy) rule.decidedBy = readHostId(root) || '';
  appendSyncRule(root, rule);
  console.log(JSON.stringify({ status: 'ok', pattern: rule.pattern, class: rule.class, ts: rule.ts, path: syncRulesPath(root) }));
} else if (cmd === 'list') {
  const m = readSyncRules(root);
  if (!m.size) console.log("No classification records yet.");
  else {
    console.log(`Classified ${m.size} entries (union across devices; latest decision per pattern):`);
    for (const [pattern, r] of [...m.entries()].sort()) console.log(`  ${r.class.padEnd(8)} ${pattern}  ← ${r.decidedBy || '?'} @ ${r.ts || '?'}`);
  }
} else {
  console.error("usage: aipa-sync.mjs scan --changed <path>... | classify --pattern <path> --class host|shared|private | list");
  process.exit(1);
}
