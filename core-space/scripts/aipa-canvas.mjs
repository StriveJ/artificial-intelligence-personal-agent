#!/usr/bin/env node
// canvas
// usage:
//   aipa-canvas set  --root <r> --project <p> [--date <d>] --input '<JSON {goal?, steps:[{id,label,status}]}>'
//   aipa-canvas show --root <r> --project <p>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { resolveShardStore, storeReadPaths } from './lib/host-id.mjs';
import { MEMORY_WRITES, appendLocalLog } from './lib/local-log.mjs';
import { mergeSteps, parseCanvas, renderCanvas } from './lib/canvas.mjs';
import { todayKey, tsLocal } from './lib/day-clock.mjs';
import { auditRow } from './lib/distill-sandbox.mjs';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
const root = arg('root') || '.';
const KNOWN = new Set(['set', 'show']);
const cmd = process.argv.slice(2).find((a) => KNOWN.has(a)) || '';
const project = arg('project') || '';

const canvasRel = (p) => join('canvas', `${p}.mmd`);
const canvasLegacyRel = (p) => join('state', 'canvas', `${p}.mmd`);
const path = project ? resolveShardStore(root, canvasRel(project), canvasLegacyRel(project)).path : '';

const readCanvas = () => {
  if (!project) return '';
  const found = storeReadPaths(root, canvasRel(project), canvasLegacyRel(project)).find((p) => existsSync(p));
  return found ? readFileSync(found, 'utf8') : '';
};

if (cmd === 'set') {
  if (!project) { console.error("Missing --project"); process.exit(1); }
  let payload = arg('input');
  if (!payload) { try { payload = readFileSync(0, 'utf8'); } catch {  } }
  let parsed = null;
  try { parsed = JSON.parse(payload); } catch { /* fallthrough */ }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.steps)) {
    console.error("Missing or invalid --input (expected JSON: {goal?, steps:[{id,label,status}]})");
    process.exit(1);
  }
  const prev = parseCanvas(readCanvas());
  const steps = mergeSteps(prev.steps, parsed.steps);
  const goal = parsed.goal !== undefined ? String(parsed.goal) : (prev.goal || '');
  const date = arg('date') || todayKey(root);
  mkdirSync(dirname(path), { recursive: true });
  const md = renderCanvas({ project, updated: date, goal, steps });
  writeFileSync(path, md, 'utf8');

  try {
    appendLocalLog(root, MEMORY_WRITES, auditRow({ ts_local: tsLocal(new Date()), id: `canvas:${project}`, type: 'canvas', target: canvasLegacyRel(project), bytes: Buffer.byteLength(md, 'utf8') }));
  } catch (e) {
    console.error("Canvas written, but audit recording failed: " + e.message);
  }
  console.log(JSON.stringify({ status: 'ok', project, steps: steps.length, target: relative(root, path), updated: date }));
} else if (cmd === 'show') {
  if (!project) { console.error("Missing --project"); process.exit(1); }
  const text = readCanvas();
  console.log(text.trim() || "(no canvas)");
} else {
  console.error('usage: set --project <p> --input <json> | show --project <p>');
  process.exit(1);
}
