// Send explicitly requested, consent-gated beta diagnostics. Stable never reports proactively. Redact structured error snippets, keep credentials memory-only, and enforce fingerprint rate limits. Dry runs neither create device identity nor write state. Manual device-ID reset takes precedence over dry-run payload generation.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildPayload, fingerprint } from './lib/diag-payload.mjs';

import { isChannel } from './lib/release-channel.mjs';

import { TELEMETRY_DISCLOSURE } from './lib/telemetry-disclosure.mjs';

import { versionOf } from './lib/semver.mjs';

const OWNER = 'StriveJ';
const REPO = 'artificial-intelligence-origin-agent';

const DEFAULT_API_BASE = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const RATE_WINDOW_MS = 24 * 3600 * 1000;
const MAX_ISSUE_PAGES = 100;

const DEFAULT_TIMEOUT_MS = 10000;

const has = (n) => process.argv.includes('--' + n);
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? String(process.argv[i + 1] ?? '') : ''; };

const root = resolve(arg('root') || '.');
const dryRun = has('dry-run');
const apiBase = (arg('api-base') || process.env.AIPA_GITHUB_API || DEFAULT_API_BASE).replace(/\/+$/, '');
const token = arg('token') || process.env.AIPA_GITHUB_TOKEN || '';

const TIMEOUT_MS = Number(arg('timeout-ms') || process.env.AIPA_GITHUB_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
const stateDir = join(root, 'state');
const deviceIdPath = join(stateDir, 'device-id');
const sentPath = join(stateDir, 'telemetry-sent.json');
const manifestPath = join(root, 'AIPA-MANIFEST.yaml');

function mask(s) {
  let t = String(s ?? '');

  if (token) t = t.split(token).join("[redacted]");
  return t;
}

function degrade(e) {
  console.error("Reporting failed (silently degraded; main workflow unaffected): " + mask(e?.message || String(e)));
  process.exitCode = 0;
}

if (has('reset-device-id')) {
  if (has('dry-run')) console.log("(--dry-run was also given: resetting the device ID takes precedence; no payload printed or files written.)");
  if (existsSync(deviceIdPath)) {
    rmSync(deviceIdPath);
    console.log("Local device ID reset (deleted " + deviceIdPath + "); the next report will generate a new anonymous ID.");
  } else {
    console.log("Local device ID does not exist (" + deviceIdPath + "); no reset needed. The next report will generate one.");
  }
  process.exit(0);
}

if (!existsSync(manifestPath)) {
  console.error("This directory is not an AIPA instance (missing " + manifestPath + "); cannot report.");
  console.error("Point --root to the instance root.");
  process.exit(1);
}
const m = readFileSync(manifestPath, 'utf8');

const field = (name) => ((m.match(new RegExp('^[ \\t]+' + name + ':[ \\t]*(\\S+)', 'm')) || [])[1]) || '';

const rawChannel = field('channel');
const channel = isChannel(rawChannel) ? rawChannel.trim() : 'stable';
if (rawChannel && !isChannel(rawChannel)) console.error("Warning: manifest release channel \"" + rawChannel + "\" is unrecognized (only stable/beta supported); treating as stable");
const telemetry = field('telemetry') || 'off';

if (channel !== 'beta' || telemetry !== 'on') {
  if (channel !== 'beta') {

    console.error("Reporting refused: current channel is not beta (channel: " + channel + "). Only beta reports diagnostics; stable never reports proactively.");
    console.error("To enroll in beta, run in order:");
    console.error("  aipa-channel --root <instance> --telemetry on    # explicit consent to redacted diagnostics");
    console.error("  aipa-channel --root <instance> --set beta       # switch to beta");
  } else {
    console.error("Reporting refused: beta is enabled, but consent to redacted diagnostic reporting is missing (telemetry: " + telemetry + ').');
    console.error("After consenting, run:");
    console.error("  aipa-channel --root <instance> --telemetry on");
    for (const l of TELEMETRY_DISCLOSURE) console.error(l);
  }
  process.exit(1);
}

const errPath = join(stateDir, 'errors.log');
const errorLines = existsSync(errPath) ? readFileSync(errPath, 'utf8') : '';

function deviceId() {
  if (existsSync(deviceIdPath)) {
    const v = readFileSync(deviceIdPath, 'utf8').trim();
    if (v) return { id: v, fresh: false };
  }
  return { id: randomUUID(), fresh: true };
}

function persistDeviceId(dev) {
  if (!dev.fresh) return;
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(deviceIdPath, dev.id + '\n', 'utf8');
}

const dev = deviceId();
if (dryRun && dev.fresh) {

  console.error("Note: --dry-run writes no files. Actual reporting generates and saves state/device-id (a device-local anonymous identifier).");
}
const payload = buildPayload({ version: versionOf(m), channel, deviceId: dev.id, errorLines });

if (dryRun) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const fp = fingerprint(payload);
let sent = {};
try { sent = JSON.parse(readFileSync(sentPath, 'utf8')) || {}; } catch {  }
const last = sent[fp] ? Date.parse(sent[fp]) : 0;
if (last && Date.now() - last < RATE_WINDOW_MS) {
  console.log("Same fingerprint reported within 24 hours; skipped (no requests sent)");
  process.exit(0);
}

if (!payload.errors.length) {
  console.log("No reportable errors (state/errors.log is empty or has no groupable errors); no requests sent");
  process.exit(0);
}

if (!token) {
  console.error("Missing GitHub token: supply --token or AIPA_GITHUB_TOKEN (a fine-grained token needs Issues read/write permission for the Origin repository).");
  console.error("Token stays in memory; this tool neither saves nor echoes it.");
  process.exit(1);
}

async function report() {
let issuesUrl;
let signal;
try {
  const base = new URL(apiBase);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash || !(base.protocol === 'https:' || base.protocol === 'http:' && loopback)) {
    throw new Error('GitHub API base must use HTTPS (HTTP is allowed only for loopback testing), without credentials, query, or fragment');
  }
  if (!Number.isInteger(TIMEOUT_MS) || TIMEOUT_MS < 1 || TIMEOUT_MS > 120000) throw new Error('Reporting timeout must be an integer from 1 to 120000 milliseconds');
  issuesUrl = new URL(apiBase + '/repos/' + OWNER + '/' + REPO + '/issues');
  signal = AbortSignal.timeout(TIMEOUT_MS);
} catch (e) {
  return degrade(e);
}

persistDeviceId(dev);

const headers = {
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json;charset=UTF-8',
  Authorization: 'Bearer ' + token,
  'X-GitHub-Api-Version': API_VERSION,
  'User-Agent': 'AIPA-Diagnostics',
};

// A single deadline covers the whole scan and send. Never retry a POST: a lost
// response may already have created content. Redirects cannot forward credentials.
const request = (url, options = {}) => fetch(url, { ...options, headers, signal, redirect: 'error' });

function nextPage(link, page) {
  const next = String(link || '').split(',').find((part) => /;\s*rel="next"(?:\s*;|\s*$)/.test(part));
  if (!next) return null;
  const match = next.match(/^\s*<([^>]+)>/);
  if (!match) throw new Error('Malformed issue pagination link');
  const target = new URL(match[1], issuesUrl);
  const number = Number(target.searchParams.get('page'));
  const repositoryPath = issuesUrl.pathname.replace(/\/repos\/[^/]+\/[^/]+\/issues$/, '/repositories/');
  const sameIssues = target.pathname === issuesUrl.pathname || target.pathname.startsWith(repositoryPath) && /^\d+\/issues$/.test(target.pathname.slice(repositoryPath.length));
  if (target.origin !== issuesUrl.origin || target.username || target.password || target.hash || !sameIssues || !Number.isSafeInteger(number) || number !== page + 1) {
    throw new Error('Unsafe or nonsequential issue pagination link');
  }
  // Rebuild the query locally, retaining the requested all-state scan. Never
  // forward authorization to a destination supplied by a response header.
  return number;
}

const title = "[Diagnostics] " + payload.channel + ' ' + payload.version + ' (' + fp + ')';
const bodyText = '```json\n' + JSON.stringify(payload, null, 2) + '\n```';

let hit = null;
try {
  let page = 1;
  while (page) {
    const url = new URL(issuesUrl);
    url.search = new URLSearchParams({ state: 'all', sort: 'updated', direction: 'desc', per_page: '100', page: String(page) }).toString();
    const res = await request(url);
    if (res.status !== 200) throw new Error('HTTP ' + res.status);
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error('Issue list response is not an array');
    // GitHub returns pull requests through this endpoint too; never append a
    // diagnostic comment to one merely because its title shares a fingerprint.
    hit = list.find((it) => !it?.pull_request && typeof it?.title === 'string' && it.title.startsWith('[Diagnostics] ') && it.title.endsWith('(' + fp + ')')) || null;
    if (hit) {
      if (!Number.isSafeInteger(hit.number) || hit.number <= 0) throw new Error('Issue list entry lacks a valid number');
      break;
    }
    page = nextPage(res.headers.get('link'), page);
    if (page && page > MAX_ISSUE_PAGES) throw new Error('Issue search limit reached; no new issue created because deduplication is incomplete');
  }
} catch (e) {
  return degrade(e);
}

try {
  const res = hit
    ? await request(issuesUrl + '/' + hit.number + '/comments', {
        method: 'POST', body: JSON.stringify({ body: bodyText }),
      })
    : await request(issuesUrl, { method: 'POST', body: JSON.stringify({ title, body: bodyText }) });
  if (res.status !== 201) throw new Error('HTTP ' + res.status);
} catch (e) {

  return degrade(e);
}

mkdirSync(stateDir, { recursive: true });
sent[fp] = new Date().toISOString();
writeFileSync(sentPath, JSON.stringify(sent, null, 2) + '\n', 'utf8');
console.log(hit ? "Reported (comment appended to existing issue #" + hit.number + ')' : "Reported (new issue created)");
}

await report();
