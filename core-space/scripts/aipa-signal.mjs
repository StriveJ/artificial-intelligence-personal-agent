#!/usr/bin/env node
// signal
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';

// usage:

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { hostname } from 'node:os';
import { pickCmd } from './lib/argv.mjs';
import {dispatchAgenda} from './lib/agenda-provider.mjs';
import { join } from 'node:path';
import { hasAck, markAck } from './lib/ack.mjs';
import { readMergedSignal, readOwnSignal, signalStore, writeOwnSignal } from './lib/signal-store.mjs';
import {
  SCAN_DAYS,
  askKey,
  daysBetween,
  extractAsks,
  extractAssistantNotes,
  extractTodoItems,
  findStaleProjects,
  isMuted,
  quotaLeft,
  rankAsks,
  snoozeActive,
  staleKey,
} from './lib/signal-core.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
function tsLocal(d){return businessTimestamp(root,d);}

const root = arg('root') || '.';
const cmd = pickCmd(process.argv.slice(2), ['scan', 'repeat', 'ack', 'snooze', 'status', 'mute','agenda']);
if(cmd==='agenda'){
 try{
  if(!arg('root'))throw Error("Agenda provider requires explicit --root");
  const args=process.argv.slice(2);args.splice(args.indexOf('agenda'),1);const at=args.indexOf('--root');
  args.splice(at,2);process.exitCode=await dispatchAgenda(root,args);
 }catch(error){console.error(error.message);process.exitCode=1;}
 process.exit(process.exitCode||0);
}
const project = arg('project') || '';
const ts = arg('ts') || tsLocal(new Date());
const today = ts.slice(0, 10);
const host = hostname();

const store = signalStore(root);
const CHANNEL = 'signal';
const loadOwnState = () => readOwnSignal(root, today);
const loadMergedState = () => readMergedSignal(root, today);
const saveState = (s) => writeOwnSignal(root, s, ts);
function requireProject() {
  if (project) return;
  console.error("Missing --project. Resolve the project ID with aipa-project.mjs resolve --cwd <session-working-directory> --root <instance>. It defaults to the session directory name, or the product-line ID for the current branch when lines.yaml is registered.");
  process.exit(1);
}
function readText(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }
function dailyFiles() {
  const dir = join(root, 'user-space', 'logs', 'daily');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^DAILY-NOTE_\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .map((f) => ({ date: f.slice(11, 21), path: join(dir, f) }))
    .filter((x) => { const d = daysBetween(x.date, today); return d >= 0 && d <= SCAN_DAYS; });
}

function firstBullet(dailyText) {
  const m = String(dailyText || '').match(/##\s*(?:Key Points|\u8981\u70b9)[\s\S]*?(?:\n##|$)/);
  if (!m) return '';
  const line = m[0].split(/\r?\n/).map((s) => s.trim()).find((s) => s.startsWith('- ') && !s.includes("(none)") && !s.includes('\uff08\u65e0\uff09'));
  return line ? line.replace(/^-\s*/, '').slice(0, 120) : '';
}

function staleCandidates() {
  const index = [];
  for (const f of dailyFiles()) {
    for (const line of readText(f.path).split(/\r?\n/)) {

      //   `- [22:00] user_message: ✻ Baked for 2m 18s · done 21:20`

      const m = line.match(/^-\s*\[(\d{2}:\d{2})\]\s*([^·:]+)·/);
      if (m) index.push({ date: f.date, project: m[2].trim() });
    }
  }
  const out = findStaleProjects(index, { nowDate: today }).map((s) => ({
    id: staleKey(s.project, s.project),
    kind: 'stale',
    subject: `${s.project} has had no progress for ${s.days} days`,
    when: s.lastAt,
    conclusion: '',
    source: `DAILY-NOTE_${s.lastAt}`,
    weight: Number(Math.min(0.95, 0.5 + s.days / 60).toFixed(3)),
  }));

  const todoPath = join(root, 'user-space', 'todo.md');
  if (existsSync(todoPath)) {
    extractTodoItems(readText(todoPath)).forEach((it) => out.push({
      id: staleKey('todo', it), kind: 'stale', subject: it, when: '',
      conclusion: '', source: 'todo.md', weight: 0.4,
    }));
  }
  return out;
}

function repeatCandidates(query) {
  const asks = [];
  const byDate = new Map();
  const notesByDate = new Map();
  for (const f of dailyFiles()) {
    const text = readText(f.path);
    byDate.set(f.date, text);
    asks.push(...extractAsks(text, f.date));
    notesByDate.set(f.date, extractAssistantNotes(text, f.date));
  }
  return rankAsks(asks, query, 3).map((a) => {

    const answer = (notesByDate.get(a.date) || []).find((n) => n.time > a.time);
    return {
      id: askKey(a.date, a.line),
      kind: 'repeat',
      subject: a.text,
      when: a.date,
      conclusion: answer ? answer.text.slice(0, 200) : firstBullet(byDate.get(a.date)),
      source: `DAILY-NOTE_${a.date}`,
      weight: a.score,
    };
  });
}

function emit(scene, candidates) {
  const own = loadOwnState();
  const view = loadMergedState();
  const skipped = { muted: false, quota: false, acked: 0, snoozed: 0 };
  let list = [];
  if (isMuted(view)) {
    skipped.muted = true;
  } else {
    for (const c of candidates) {
      if (hasAck(root, host, c.id, CHANNEL)) { skipped.acked += 1; continue; }
      if (snoozeActive(view, c.id, today)) { skipped.snoozed += 1; continue; }
      list.push(c);
    }
    const left = quotaLeft(view, scene);
    if (left <= 0) { skipped.quota = true; list = []; }
    else list = list.sort((a, b) => b.weight - a.weight).slice(0, left);
  }
  saveState(own);
  console.log(JSON.stringify({
    status: 'ok', scene, project, actionable: list, quota_left: quotaLeft(view, scene), skipped,
  }));
  if (store.hint) console.error(store.hint);
}

if (cmd === 'scan' || cmd === 'repeat') {
  requireProject();
  emit(cmd === 'scan' ? 'session' : 'turn',
    cmd === 'scan' ? staleCandidates() : repeatCandidates(arg('text') || ''));
} else if (cmd === 'ack') {
  const id = arg('id');
  if (!id) { console.error('missing --id'); process.exit(1); }
  markAck(root, host, id, CHANNEL);
  const state = loadOwnState();
  state.count_today = (state.count_today || 0) + 1;
  saveState(state);
  console.log(JSON.stringify({ status: 'ok', acked: true, id, count_today: state.count_today }));
} else if (cmd === 'snooze') {
  const id = arg('id');
  if (!id) { console.error('missing --id'); process.exit(1); }
  const state = loadOwnState();
  if (process.argv.includes('--forever')) {
    markAck(root, host, id, CHANNEL);
    delete state.snooze[id];
    saveState(state);
    console.log(JSON.stringify({ status: 'ok', id, forever: true }));
  } else {
    const spec = arg('for') || '7d';
    const m = String(spec).match(/^(\d+)d$/);
    if (!m) { console.error('invalid --for: ' + spec); process.exit(1); }
    const base = Date.parse(`${today}T00:00:00Z`);
    const until = new Date(base + Number(m[1]) * 86400000).toISOString().slice(0, 10);
    state.snooze[id] = until;
    saveState(state);
    console.log(JSON.stringify({ status: 'ok', id, until }));
  }
} else if (cmd === 'mute') {

  const word = process.argv.slice(3).find((a) => a === 'on' || a === 'off');
  if (!word) { console.error('usage: mute on|off'); process.exit(1); }
  const on = word === 'on';
  const state = loadOwnState();
  state.muted = on;
  state.muted_at = ts;
  saveState(state);
  console.log(JSON.stringify({ status: 'ok', muted: on }));
} else if (cmd === 'status') {

  const state = loadMergedState();
  console.log(JSON.stringify({ status: 'ok', state, own: loadOwnState(), quota_left: quotaLeft(state, 'session') }, null, 2));
} else {
  console.error("usage: scan | repeat --text <input> | ack --id <id> | snooze --id <id> --for 1d|7d | mute on|off | status");
  process.exit(1);
}
