#!/usr/bin/env node
// day check
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newDayMark } from './lib/day-boundary.mjs';
import { dayKey } from './lib/time-boundary.mjs';
import { dayStartHour as llmDayStartHour } from './lib/llm-provider.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
function tsLocal(d){return businessTimestamp(root,d);}

const root = arg('root') || '.';
const ts = arg('ts') || tsLocal(new Date());
const statePath = join(root, 'state', 'last-active-day');

const dayStartHour = llmDayStartHour(root);

const day = dayKey(ts, dayStartHour);
const prev = existsSync(statePath) ? readFileSync(statePath, 'utf8').trim() : '';
const mark = newDayMark(prev, day);

if (mark) {
  mkdirSync(join(root, 'state'), { recursive: true });
  writeFileSync(statePath, `${day}\n`, 'utf8');
}

console.log(JSON.stringify({ status: 'ok', day, newDay: Boolean(mark), from: mark ? mark.from : prev, to: day }));
