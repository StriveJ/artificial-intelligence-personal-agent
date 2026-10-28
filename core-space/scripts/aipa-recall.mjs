// recall
import { dayStartHour as sharedDayStartHour } from './lib/day-clock.mjs';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { dayKey } from './lib/time-boundary.mjs';
import { readEvents } from './lib/event-store.mjs';

function arg(n){ const i = process.argv.indexOf('--'+n); return i >= 0 ? process.argv[i+1] : ''; }
const root = arg('root') || '.';
const cmd = pickCmd(process.argv.slice(2), ['check', 'query']);
const range = arg('range') || '';
const value = arg('value') || '';
const project = arg('project') || '';

const dailyDir = join(root, 'user-space', 'logs', 'daily');
const monthlyDir = join(root, 'user-space', 'logs', 'monthly');
const yearlyDir = join(root, 'user-space', 'logs', 'yearly');

function listMonths(dir, re) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map(f => (f.match(re) || [])[1]).filter(Boolean);
}

const dayStartHour = () => sharedDayStartHour(root);

function eventsOfDay(date, project) {
  return readEvents(root).filter(e =>
    dayKey(e.ts_local || '', dayStartHour()) === date
    && (!project || e.project === project));
}

function renderTimeline(events) {
  return events.map(e => {
    const t = (e.ts_local || '').slice(11, 16);
    const d = (e.data || '').length > 120 ? (e.data || '').slice(0, 120) + '…' : (e.data || '');
    return `- [${t}] ${e.type}${d ? ': ' + d : ''}`;
  }).join('\n');
}

if (cmd === 'check') {
  const now = new Date();

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const lastYearStr = String(now.getFullYear() - 1);

  const dailyMonths = new Set(listMonths(dailyDir, /DAILY-NOTE_(\d{4}-\d{2})/));
  const haveMonths = new Set(listMonths(monthlyDir, /MONTHLY-REVIEW_(\d{4}-\d{2})/));
  const months = [...dailyMonths].filter(m => !haveMonths.has(m) && m <= lastMonthStr).sort();

  const haveYears = new Set(listMonths(yearlyDir, /YEARLY-REVIEW_(\d{4})/));
  const dailyYears = new Set([...dailyMonths].map(m => m.slice(0, 4)));
  const years = [...dailyYears].filter(y => !haveYears.has(y) && y <= lastYearStr).sort();
  console.log(JSON.stringify({ months, years }));
} else if (cmd === 'query') {
  if (range === 'day' && project) {
    const events = eventsOfDay(value, project);
    if (!events.length) { console.log(` (${value} has no session records for project ${project})`); process.exit(0); }
    console.log(`# ${project} · ${value} Timeline
` + renderTimeline(events));
    process.exit(0);
  }
  let file = '';
  if (range === 'day') file = join(dailyDir, `DAILY-NOTE_${value}.md`);
  else if (range === 'month') file = join(monthlyDir, `MONTHLY-REVIEW_${value}.md`);
  else if (range === 'year') file = join(yearlyDir, `YEARLY-REVIEW_${value}.md`);
  else { console.error('usage: query --range day|month|year --value <X> [--project <id>]'); process.exit(1); }
  if (!existsSync(file)) { console.log('missing'); process.exit(0); }
  console.log(readFileSync(file, 'utf8'));
} else { console.error('usage: aipa-recall.mjs check | query --range day|month|year --value <X> [--project <id>]'); process.exit(1); }
