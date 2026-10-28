#!/usr/bin/env node
// host check
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayStartHour as llmDayStartHour, defaultProvider, providerKey, llmProviderTexts } from './lib/llm-provider.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }

const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(arg('root') || resolve(HERE, '..', '..'));
const asJson = process.argv.includes('--json');
const declared = new Set(String(arg('declared') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));

const REQUIRED_SCRIPTS = [
  'aipa-session', 'aipa-event', 'aipa-checkpoint', 'aipa-llm', 'aipa-distill',
  'aipa-tick', 'aipa-signal', 'aipa-search', 'aipa-warmup',
];

const checks = [];
const add = (id, status, detail = '') => checks.push({ id, status, detail });

for (const f of ['AIPA-MANIFEST.yaml', 'core-space/policy.md', 'core-space/activation.md', 'core-space/host-protocol.md']) {
  const ok = existsSync(join(root, f));
  add(`structure:${f}`, ok ? 'pass' : 'fail', ok ? '' : "missing");
}
for (const d of ['user-space', 'state']) {
  const ok = existsSync(join(root, d));
  add(`structure:${d}/`, ok ? 'pass' : 'fail', ok ? '' : "missing directory");
}

for (const s of REQUIRED_SCRIPTS) {
  const p = join(HERE, `${s}.mjs`);
  if (!existsSync(p)) { add(`scripts:${s}`, 'fail', "missing script"); continue; }
  const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
  add(`scripts:${s}`, r.status === 0 ? 'pass' : 'fail', r.status === 0 ? '' : String(r.stderr || '').slice(0, 140));
}

try {
  mkdirSync(join(root, 'state'), { recursive: true });
  const probe = join(root, 'state', '.host-check-probe');
  writeFileSync(probe, 'ok', 'utf8');
  rmSync(probe, { force: true });
  add('state:writable', 'pass');
} catch (e) {
  add('state:writable', 'fail', String(e && e.message || e));
}

const llmTexts = llmProviderTexts(root);
if (!llmTexts.length) {
  add('seam:llm', 'warn', "llm-provider.yaml not found (using host)");
} else {
  const provider = defaultProvider(root);
  const endpoint = providerKey(llmTexts, provider, 'endpoint', '');
  if (provider === 'host') add('seam:llm', 'pass', "provider=host (semantic work is provided by the host; C3 required)");
  else if (endpoint) add('seam:llm', 'pass', `provider=${provider}, endpoint configured`);
  else add('seam:llm', 'fail', `provider=${provider} but endpoint is empty`);
}

const dayStart = llmDayStartHour(root);
add('boundary:day_start_hour', 'pass', `${String(dayStart).padStart(2, '0')}:00 (the host must not switch days at local midnight independently)`);

for (const [name, script, argv] of [
  ['warmup-status', 'aipa-warmup.mjs', ['status']],
  ['signal-status', 'aipa-signal.mjs', ['status']],
]) {
  const r = spawnSync(process.execPath, [join(HERE, script), ...argv, '--root', root], { encoding: 'utf8' });
  add(`actions:${name}`, r.status === 0 ? 'pass' : 'fail', r.status === 0 ? '' : String(r.stderr || '').slice(0, 140));
}

if (declared.size === 0) {
  add('host:capabilities', 'warn', "Not declared; use --declared c1,c2,c3,c4 to declare host capabilities");
} else {
  const missing = ['c1', 'c2', 'c3', 'c4'].filter((c) => !declared.has(c));
  add('host:capabilities', missing.length ? 'fail' : 'pass', missing.length ? `Missing ${missing.join(',')}` : "C1-C4 all declared");
}

const summary = {
  pass: checks.filter((c) => c.status === 'pass').length,
  warn: checks.filter((c) => c.status === 'warn').length,
  fail: checks.filter((c) => c.status === 'fail').length,
};
const status = summary.fail === 0 ? 'ok' : 'fail';

if (asJson) {
  console.log(JSON.stringify({ status, root, summary, checks }, null, 2));
} else {
  for (const c of checks) {
    const mark = c.status === 'pass' ? '✔' : c.status === 'warn' ? '!' : '✖';
    console.log(`${mark} ${c.id}${c.detail ? '  ' + c.detail : ''}`);
  }
  console.log(`\npass=${summary.pass} warn=${summary.warn} fail=${summary.fail}  →  ${status === 'ok' ? "Host protocol v0.1 minimum satisfied" : "Some requirements are unmet"}`);
}
process.exit(status === 'ok' ? 0 : 1);
