#!/usr/bin/env node
// day start
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendError } from './lib/error-sink.mjs';
import { isSummaryPending } from './lib/daily-note.mjs';
import { addDays, dayKey } from './lib/time-boundary.mjs';
import { dayStartHour as llmDayStartHour } from './lib/llm-provider.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
function tsLocal(d){return businessTimestamp(root,d);}

const HERE = dirname(fileURLToPath(import.meta.url));
const root = arg('root') || '.';
const project = arg('project') || '';
const device = arg('device') || hostname();
const ts = arg('ts') || tsLocal(new Date());

const dayStartHour = llmDayStartHour(root);
const today = dayKey(ts, dayStartHour);
const yesterday = addDays(today, -1);

function step(name, script, argv) {
  try {
    const out = execFileSync(process.execPath, [join(HERE, script), ...argv, '--root', root], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    return { status: 'ok', out: String(out).trim() };
  } catch (e) {
    const message = String((e && e.message) || e).slice(0, 300);
    try { appendError(root, { ts: new Date().toISOString(), scope: `day-start:${name}`, message }); } catch {}
    return { status: 'error', out: '', message };
  }
}
function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

const steps = {};
const notices = [];
const pending = { distill: [], scene: [], reviews: { months: [], years: [] } };

const tick = step('tick', 'aipa-tick.mjs', ['--device', device, '--reason', 'session']);
steps.tick = tick.status;
for (const line of String(tick.out || '').split(/\r?\n/)) {
  if (line.trim().startsWith('- ')) notices.push(line.trim());
}

const dailyStep = step('daily', 'aipa-daily.mjs', ['sync']);
steps.daily = dailyStep.status;
const dailyJson = safeJson(dailyStep.out);
const touched = [...(dailyJson?.generated || []), ...(dailyJson?.refreshed || [])];

const recall = step('recall', 'aipa-recall.mjs', ['check']);
steps.recall = recall.status;
const recallJson = safeJson(recall.out);
if (recallJson) pending.reviews = { months: recallJson.months || [], years: recallJson.years || [] };

steps.index = step('index', 'aipa-index.mjs', []).status;

if (project) {
  const signal = step('signal', 'aipa-signal.mjs', ['scan', '--project', project]);
  steps.signal = signal.status;
  const signalJson = safeJson(signal.out);
  if (signalJson && Array.isArray(signalJson.actionable)) {
    for (const c of signalJson.actionable) notices.push({ kind: c.kind, subject: c.subject, when: c.when, source: c.source, id: c.id });
  }
} else {
  steps.signal = 'skipped';
}

const errors = step('errors', 'aipa-errors.mjs', ['report']);
steps.errors = errors.status;
const errorsJson = safeJson(errors.out);
if (errorsJson && errorsJson.summary) notices.push({ kind: 'errors', summary: errorsJson.summary, circuits: errorsJson.circuits || [] });

const sceneStep = step('scene', 'aipa-sceneblock.mjs', ['plan', '--date', yesterday, '--due-only']);
steps.scene = sceneStep.status;
const sceneJson = safeJson(sceneStep.out);
pending.scene = (sceneJson?.projects || []).map(p => p.project);

steps.metrics = step('metrics', 'aipa-metrics.mjs', ['snapshot']).status;
const usageStep = step('hostUsage', 'aipa-host-usage.mjs', ['snapshot']);
steps.hostUsage = usageStep.status;
{
  const usageJson = safeJson(usageStep.out);
  if (usageJson && Array.isArray(usageJson.lines)) for (const line of usageJson.lines) notices.push({ kind: 'host-usage', line });
}

const dailyDir = join(root, 'user-space', 'logs', 'daily');
if (existsSync(dailyDir)) {
  let files = [];
  try { files = readdirSync(dailyDir); } catch { files = []; }
  for (const f of files) {
    const m = f.match(/^DAILY-NOTE_(\d{4}-\d{2}-\d{2})\.md$/);
    if (!m || m[1] >= today) continue;
    let text = '';
    try { text = readFileSync(join(dailyDir, f), 'utf8'); } catch { continue; }
    if (isSummaryPending(text)) pending.distill.push(m[1]);
  }
}

for (const d of touched) if (!pending.distill.includes(d)) pending.distill.push(d);
pending.distill.sort();
pending.summary = touched.slice().sort();

console.log(JSON.stringify({ status: 'ok', day: today, steps, notices, pending }, null, 2));
