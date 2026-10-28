// daily
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { dailyBackfillRange, addDays, fmtDate, dayKey } from './lib/time-boundary.mjs';
import { activityByProject, loadAliases } from './lib/sceneblock.mjs';
import { ledgerLines, renderLedger, writeSnapshot } from './lib/token-metrics.mjs';
import { readEventsByHost } from './lib/event-store.mjs';
import { findGaps, renderContinuityNote } from './lib/continuity.mjs';
import { LEGACY_HOST, readHostId } from './lib/host-id.mjs';
import { readOwnDistill } from './lib/distill-store.mjs';
import {
  compareFingerprint, fingerprintOf, lastSectionText, parseFingerprint, renderFingerprint,
  renderTimelineSections, sectionOf, timelineLine,
} from './lib/daily-note.mjs';
import { dayEndHour as llmDayEndHour, dayStartHour as llmDayStartHour, providerFor } from './lib/llm-provider.mjs';

function arg(n){ const i = process.argv.indexOf('--'+n); return i >= 0 ? process.argv[i+1] : ''; }
const root = arg('root') || '.';

const KNOWN_CMDS = new Set(['sync', 'backfill', 'refresh']);
const cmd = process.argv.slice(2).find(a => KNOWN_CMDS.has(a)) || '';
const date = arg('date') || '';

const eventsPath = join(root, 'state', 'session-events.jsonl');
const archiveDir = join(root, 'state', 'archive');
const dailyDir = join(root, 'user-space', 'logs', 'daily');

function dayEndHour() { return llmDayEndHour(root); }
function dayStartHour() { return llmDayStartHour(root); }

let _allHost = null;
function allEventsByHost() {
  if (_allHost) return _allHost;

  const rows = readEventsByHost(root).map(e => ({ host: e.host, event: e.row }));

  const read = p => { if (existsSync(p)) for (const l of readFileSync(p, 'utf8').split(/\r?\n/)) { if (!l.trim()) continue; try { rows.push({ host: LEGACY_HOST, event: JSON.parse(l) }); } catch {  } } };
  read(eventsPath);
  if (existsSync(archiveDir)) for (const f of readdirSync(archiveDir)) if (f.endsWith('.jsonl')) read(join(archiveDir, f));
  _allHost = rows;
  return rows;
}
function allEvents() { return allEventsByHost().map(e => e.event); }

function eventsOfDateByHost(d) {
  const byHost = new Map();
  for (const { host, event } of allEventsByHost()) {
    if (dayKey(event.ts_local || '', dayStartHour()) !== d) continue;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(event);
  }
  return [...byHost.entries()]
    .map(([h, evs]) => sectionOf(h, evs))
    .sort((a, b) => a.first.localeCompare(b.first) || a.host.localeCompare(b.host));
}
function eventsOfDate(d) { return eventsOfDateByHost(d).flatMap(s => s.events); }
function distillOfDate(d) {

  try { return readOwnDistill(root).entries.filter(e => dayKey(e.ts_local || '', dayStartHour()) === d); } catch { return []; }
}
function firstEventDate() {
  const ds = allEvents().map(e => dayKey(e.ts_local || '', dayStartHour())).filter(Boolean).sort();
  return ds[0] || fmtDate(new Date());
}
function lastDailyDate() {
  if (!existsSync(dailyDir)) return '';
  const ds = readdirSync(dailyDir).map(f => (f.match(/DAILY-NOTE_(\d{4}-\d{2}-\d{2})/) || [])[1]).filter(Boolean).sort();
  return ds[ds.length - 1] || '';
}

function renderTimeline(events) {
  return events.map(timelineLine).join('\n');
}
function loadProvider() { return providerFor(root, 'summarize').provider; }
function summarizeFor(events) {
  if (!events.length) return "(no session records for this day)";
  if(process.argv.includes('--mechanical'))return "(awaiting session summary; this run only recalculates mechanical data)";
  if (loadProvider() === 'host') return "(summary pending)";
  const llmPath = join(root, 'core-space', 'scripts', 'aipa-llm.mjs');
  try {
    const out = execFileSync(process.execPath, [llmPath, 'summarize', '--style', 'day', '--root', root, '--json'], {
      input: renderTimeline(events), encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 610000,
    });
    const result = JSON.parse(out);
    return result.status === 'completed' && typeof result.content === 'string' && result.content.trim() ? result.content.trim() : "(awaiting host summary)";
  } catch { return "(summary pending)"; }
}
function generateDaily(d) {
  const sections = eventsOfDateByHost(d);
  const events = sections.flatMap(s => s.events);
  const cands = distillOfDate(d);
  const out = notePathOf(d);
  if (existsSync(out)) return out;
  writeNote(d, out, summarizeFor(events), sections, bulletLines(cands));
  return out;
}

const SUMMARY_HEAD = "## Daily Summary (AI-generated; editable)";
function notePathOf(d) { return join(dailyDir, `DAILY-NOTE_${d}.md`); }

function writeNote(d, out, summaryText, sections, bullets) {
  const events = sections.flatMap(s => s.events);
  const body = sections.length ? renderTimelineSections(sections, readHostId(root) || '') : "- (no session records for this day)";
  const lines = [
    `# DAILY-NOTE ${d}`, '',

    renderFingerprint(fingerprintOf(d, dayStartHour(), sections)), '',
    "## Timeline (mechanical)", '',
    body, '',
    "## Key Points",
    bullets.length ? bullets.join('\n') : "- (none)", '',
    "## Related Projects",
    relatedProjects(events), '',
    renderContinuityNote(d, gapListFor(d), readAckFile(), { dayStartHour: dayStartHour() }), '',
    "## Token Savings Ledger (mechanical)",
    metricsLines(d).join('\n'), '',
    SUMMARY_HEAD,
    summaryText, '',
  ];
  mkdirSync(dailyDir, { recursive: true });
  writeFileSync(out, lines.join('\n') + '\n', 'utf8');
}

function metricsLines(d) {
  const nowTs = (() => { const n = new Date(); const p = (x) => String(x).padStart(2, '0'); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}:${p(n.getSeconds())}`; })();
  const L = renderLedger(root, d, { project: arg('project') || '' });
  if (L.source === 'empty') return ["(no snapshot for this day)"];

  if (d === dayKey(nowTs, dayStartHour())) {
    writeSnapshot(root, d, L);
  }
  const lines = ledgerLines(L);

  if (Array.isArray(L.fallbacks) && L.fallbacks.length) {
    lines.push(` (${L.fallbacks.join(', ')}no same-day audit record; using the daily snapshot value${L.capturedAt ? ', ' + L.capturedAt.slice(11, 16) + " sampled" : ''})`);
  }
  return lines;
}

function relatedProjects(events) {
  const alPath = join(root, 'user-space', 'projects', 'aliases.yaml');
  const al = existsSync(alPath) ? loadAliases(readFileSync(alPath, 'utf8')) : {};
  const acts = activityByProject(events, al);
  if (!acts.length) return "- (none)";
  return acts.map(a => {
    const rel = `user-space/projects/${a.project}/scene.md`;
    return existsSync(join(root, rel)) ? `- ${a.project} → ${rel}` : `- ${a.project}(no scene blocks yet)`;
  }).join('\n');
}
function bulletLines(cands) { return (cands || []).map(c => `- ${c.type}: ${c.text}`); }

function gapListFor(d) {
  const now = new Date(`${d}T23:59:59`);
  return findGaps(readEventsByHost(root), { dayStartHour: dayStartHour(), now });
}
function readAckFile() {
  try {
    const v = JSON.parse(readFileSync(join(root, 'state', 'continuity-ack.json'), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

const lastSection = lastSectionText;

function existingBullets(d) {
  const out = notePathOf(d);
  if (!existsSync(out)) return [];
  const sec = lastSection(readFileSync(out, 'utf8'), /^##\s*(?:Key Points|\u8981\u70b9)\s*$/m);
  if (!sec) return [];
  return sec.split(/\r?\n/).map(s => s.trim()).filter(s => s.startsWith('- ') && !s.includes("(none)") && !s.includes('\uff08\u65e0\uff09'));
}
function mergedBullets(d, cands) {
  const seen = new Set();
  const out = [];
  for (const l of [...existingBullets(d), ...bulletLines(cands)]) {
    if (seen.has(l)) continue;
    seen.add(l);
    out.push(l);
  }
  return out;
}

function existingSummary(d) {
  const out = notePathOf(d);
  if (!existsSync(out)) return null;
  const sec = lastSection(readFileSync(out, 'utf8'), /^##\s*(?:Daily Summary|\u4eca\u65e5\u603b\u7ed3)[^\n]*$/m);
  return sec ? sec.replace(/^\s*\n/, '').trimEnd() : null;
}

function refreshDaily(d) {
  const sections = eventsOfDateByHost(d);
  const events = sections.flatMap(s => s.events);
  const cands = distillOfDate(d);
  const kept = existingSummary(d);
  writeNote(d, notePathOf(d), kept && kept.trim() ? kept : summarizeFor(events), sections, mergedBullets(d, cands));
  return notePathOf(d);
}

function staleOf(d) {
  const out = notePathOf(d);
  if (!existsSync(out)) return { stale: false, reason: 'no-note' };
  const sections = eventsOfDateByHost(d);
  if (!sections.length) return { stale: false, reason: 'no-events' };
  const stored = parseFingerprint(readFileSync(out, 'utf8'));
  if (!stored) return { stale: true, reason: 'legacy-format' };
  return compareFingerprint(fingerprintOf(d, dayStartHour(), sections), stored);
}

function syncAll() {
  const now = new Date();
  const nowTs = (() => { const p = x => String(x).padStart(2, '0'); return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`; })();
  const today = dayKey(nowTs, dayStartHour());
  const y = addDays(today, -1);
  const dry = process.argv.includes('--dry-run');
  const generated = [];
  const refreshed = [];
  const skipped = [];
  const reasons = {};
  const hasEvents = eventsOfDate(y).length > 0;
  const hasNote = existsSync(notePathOf(y));
  if (hasEvents && !hasNote) {
    if (!dry) generateDaily(y);
    generated.push(y); reasons[y] = 'generated';
  } else if (!hasNote) {
    skipped.push(y); reasons[y] = 'no-events';
  } else {
    const s = staleOf(y);
    if (s.stale) { if (!dry) refreshDaily(y); refreshed.push(y); }
    else skipped.push(y);
    reasons[y] = s.reason;
  }
  return { generated, refreshed, skipped, reasons, dry, scope: y };
}

if (cmd === 'sync') {
  console.log(JSON.stringify(syncAll()));
} else if (cmd === 'backfill') {
  const now = new Date();
  const last = lastDailyDate() || addDays(firstEventDate(), -1);
  const range = dailyBackfillRange(last, now, dayEndHour(), dayStartHour());
  for (const d of range) generateDaily(d);
  console.log('backfilled ' + range.length);
} else if (arg('refresh')) {
  console.log(JSON.stringify({ refreshed: refreshDaily(arg('refresh')) }));
} else if (date) {
  console.log(generateDaily(date));
} else {
  console.error('usage: aipa-daily.mjs backfill | sync [--dry-run] | --date <YYYY-MM-DD> | --refresh <YYYY-MM-DD>'); process.exit(1);
}
