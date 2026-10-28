#!/usr/bin/env node
// errors
// usage:

import { circuitOpen, clearErrors, errorLine, readErrors, summarize } from './lib/error-sink.mjs';
import { appendFileSync, mkdirSync } from 'node:fs';
import { pickCmd } from './lib/argv.mjs';
import { join } from 'node:path';
import { errorsPath } from './lib/error-sink.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }

const root = arg('root') || '.';
const cmd = pickCmd(process.argv.slice(2), ['add', 'report', 'clear']);
const ts = arg('ts') || new Date().toISOString();

if (cmd === 'add') {
  const scope = arg('scope');
  const message = arg('message');
  if (!scope || !message) { console.error("usage: add --scope <script-name> --message <error-message>"); process.exit(1); }
  mkdirSync(join(root, 'state'), { recursive: true });
  appendFileSync(errorsPath(root), `${errorLine({ ts, scope, message })}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'ok', scope, message }));
} else if (cmd === 'report') {
  const hours = Number(arg('hours') || '24');
  const errors = readErrors(root);
  const summary = summarize(errors, { now: arg('now') || new Date().toISOString(), windowHours: Number.isFinite(hours) ? hours : 24 });
  const scopes = Object.keys(summary?.byScope || {});
  const circuits = scopes.filter((s) => circuitOpen(errors, { scope: s, now: arg('now') || new Date().toISOString() }));
  console.log(JSON.stringify({ status: 'ok', summary, circuits }));
} else if (cmd === 'clear') {
  console.log(JSON.stringify({ status: 'ok', cleared: clearErrors(root) }));
} else {
  console.error("usage: add --scope <script-name> --message <error-message> | report [--hours 24] | clear");
  process.exit(1);
}
