// profile
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';
import { dayStartHour as sharedDayStartHour } from './lib/day-clock.mjs';

// usage:

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { assertInSandbox, auditRow } from './lib/distill-sandbox.mjs';
import { MEMORY_WRITES, appendLocalLog } from './lib/local-log.mjs';
import { DRAFT_PATH, PROFILE_PATH, needsRegenerate, parseProfile, renderDraft } from './lib/profile-draft.mjs';
import {memoryDependencies,dependenciesCurrent,currentMemories} from './lib/memory-dependencies.mjs';
import { SCENE_SECTIONS, parseSceneFrontmatter } from './lib/sceneblock.mjs';
import { dayKey } from './lib/time-boundary.mjs';
import { readMemoryIndex } from './lib/memory-index-store.mjs';
import { readMemoryMeta,projectMemoryMeta } from './lib/memory-meta.mjs';
import { bodyHash } from './lib/memory-meta.mjs';
import {selectMemories} from './lib/memory-lifecycle.mjs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
function tsLocal(d){return businessTimestamp(root,d);}
function readText(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }

const root = arg('root') || '.';
const cmd = pickCmd(process.argv.slice(2), ['plan', 'draft', 'status']);
const nowTs = tsLocal(new Date());
const dayStartHour = sharedDayStartHour(root);
const date = arg('date') || dayKey(nowTs, dayStartHour);

function sceneSections(text) {
  const out = {};
  for (const s of SCENE_SECTIONS) {
    const m = String(text ?? '').match(new RegExp(`##\\s*${s}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`));
    if (m) out[s] = m[1].trim();
  }
  return out;
}
function collectScenes() {
  const dir = join(root, 'user-space', 'projects');
  const out = [];
  if (!existsSync(dir)) return out;
  for (const p of readdirSync(dir)) {
    const f = join(dir, p, 'scene.md');
    if (!existsSync(f)) continue;
    const text = readText(f);
    const fm = parseSceneFrontmatter(text);
    let receipt;try{receipt=JSON.parse(fm.memory_dependencies);}catch{}
    const stale=!dependenciesCurrent(root,receipt,{project:p,at:date});
    out.push({ project: p, updated: fm.updated || '', lastActivity: fm.last_activity || '', stale, sections: stale?{}:sceneSections(text) });
  }
  return out.sort((a, b) => a.project.localeCompare(b.project));
}
function memoryLines(file, limit = 50) {
  return memoryEvidence().filter(e=>e.file==='user-space/memory/'+file).map(e=>e.text).slice(-limit);
}
function memoryEvidence(){
  return currentMemories(root,{at:date}).map(e=>({id:e.id,file:e.file,text:e.body,type:e.type,confirmation:e.confirmation,provenance:e.provenance||[]}));
}

if (cmd === 'plan') {
  if(existsSync(join(root,'user-space','memory')))execFileSync(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'aipa-index.mjs'),'--root',root],{stdio:'pipe'});
  const raw = readText(join(root, PROFILE_PATH));
  console.log(JSON.stringify({
    status: 'ok',
    date,
    draftPath: DRAFT_PATH,
    profile: { relPath: PROFILE_PATH, exists: Boolean(raw), raw: raw.trim(), parsed: parseProfile(raw) },
    scenes: collectScenes(),
    memoryEvidence: memoryEvidence(),
    memory: {
      traits: memoryEvidence().filter(e=>e.type==='trait'&&['user_confirmed','model_confirmed'].includes(e.confirmation.status)),
      preferences: memoryLines('preferences.md'),
      instructions: memoryLines('instructions.md'),
      decisions: memoryLines('decisions.md', 15),
    },
  }, null, 2));
} else if (cmd === 'draft') {
  let payload = arg('input');
  if (!payload) { try { payload = readFileSync(0, 'utf8'); } catch { /* ignore */ } }
  let parsed = null;
  try { parsed = JSON.parse(payload); } catch { /* fallthrough */ }
  if (!parsed || typeof parsed !== 'object') { console.error("Missing or invalid --input (expected JSON: {sections:{...}})"); process.exit(1); }
  const allowed=new Set(memoryEvidence().map(e=>e.id));
  if(parsed.evidence_ids!==undefined&&(!Array.isArray(parsed.evidence_ids)||parsed.evidence_ids.some(id=>!allowed.has(id)))){console.error("Profile evidence includes unknown or withdrawn memories; write refused");process.exit(1);}

  assertInSandbox(DRAFT_PATH);
  const outPath = join(root, DRAFT_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  const watermark=bodyHash(JSON.stringify(readMemoryMeta(root)));
  const receipt=memoryDependencies(root,parsed.evidence_ids,{at:date});
  const draftMd = renderDraft({ date, sections: parsed.sections || {} })+`\n<!-- memory-meta: ${watermark} -->\n<!-- memory-dependencies: ${JSON.stringify(receipt)} -->\n`;
  writeFileSync(outPath, draftMd, 'utf8');
  try {
    appendLocalLog(root, MEMORY_WRITES, auditRow({ ts_local: nowTs, id: 'profile-draft', type: 'profile-draft', target: DRAFT_PATH, bytes: Buffer.byteLength(draftMd, 'utf8') }));
  } catch {  }
  console.log(JSON.stringify({ status: 'ok', target: DRAFT_PATH, date }));
} else if (cmd === 'status') {
  const draftText = readText(join(root, DRAFT_PATH));
  const draftDate = (draftText.match(/^# (?:Profile Draft \(|\u753b\u50cf\u8349\u6848\uff08)(\d{4}-\d{2}-\d{2})(?: generated\)| \u751f\u6210\uff09)/m) || [])[1] || '';
  const marker=(draftText.match(/<!-- memory-meta: ([a-f0-9]+) -->/)||[])[1];
  let receipt;try{receipt=JSON.parse((draftText.match(/<!-- memory-dependencies: (.+) -->/)||[])[1]);}catch{}
  const stale=Boolean(draftText)&&!dependenciesCurrent(root,receipt,{at:date});
  const profileText = readText(join(root, PROFILE_PATH));
  console.log(JSON.stringify({
    status: 'ok',
    date,
    profile: { relPath: PROFILE_PATH, exists: Boolean(profileText) },
    draft: { relPath: DRAFT_PATH, exists: Boolean(draftText), date: draftDate, stale },
    needsRegenerate: stale || needsRegenerate({ draftDate, nowDate: date }),
  }, null, 2));
} else {
  console.error('usage: plan | draft --date <d> --input <json> | status [--date <d>]');
  process.exit(1);
}
