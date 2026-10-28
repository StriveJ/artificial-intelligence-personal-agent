// sceneblock
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';
import { dayStartHour as sharedDayStartHour } from './lib/day-clock.mjs';
import {selectMemories} from './lib/memory-lifecycle.mjs';
import {memoryDependencies,currentMemories} from './lib/memory-dependencies.mjs';

// usage:

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { assertInSandbox, auditRow } from './lib/distill-sandbox.mjs';
import { MEMORY_WRITES, appendLocalLog } from './lib/local-log.mjs';
import { SCENE_SECTIONS, activityByProject, extractManual, loadAliases, needsUpdate, normalizeProject, parseSceneFrontmatter, renderScene, sceneRelPath } from './lib/sceneblock.mjs';
import { dayKey } from './lib/time-boundary.mjs';
import { readEvents } from './lib/event-store.mjs';
import { readMemoryMeta,projectMemoryMeta,bodyHash } from './lib/memory-meta.mjs';
import { readMemoryIndex } from './lib/memory-index-store.mjs';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function arg(n) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : ''; }
function tsLocal(d){return businessTimestamp(root,d);}

const root = arg('root') || '.';
const cmd = pickCmd(process.argv.slice(2), ['plan', 'write', 'status']);
const nowTs = tsLocal(new Date());
const dayStartHour = sharedDayStartHour(root);
const date = arg('date') || dayKey(nowTs, dayStartHour);

function readText(p) { try { return readFileSync(p, 'utf8'); } catch { return ''; } }
function aliases() {
  const p = join(root, 'user-space', 'projects', 'aliases.yaml');
  return existsSync(p) ? loadAliases(readText(p)) : {};
}
function eventsOfDate(d) {

  return readEvents(root)
    .filter((o) => dayKey(String(o.ts_local || ''), dayStartHour) === d)
    .sort((a, b) => String(a.ts_local || '').localeCompare(String(b.ts_local || '')));
}
function memoryHits(project, terms) {
  const dir = join(root, 'user-space', 'memory');
  if (!existsSync(dir)) return [];
  const keys = [project, ...terms].filter(Boolean);
  const meta=readMemoryMeta(root),hits=[];
  for(const e of selectMemories(readMemoryIndex(root,{strict:true}).entries.map(e=>projectMemoryMeta(e,meta)),{project,at:date}).entries){if(keys.some(k=>e.body?.includes(k)||e.title?.includes(k)))hits.push('['+e.id+'; '+e.confirmation.status+'; '+e.file+'] '+String(e.body||'').slice(0,200));}
  return hits.slice(0,20);
}

if (cmd === 'plan') {
  if(existsSync(join(root,'user-space','memory')))execFileSync(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'aipa-index.mjs'),'--root',root],{stdio:'pipe'});
  const al = aliases();
  const events = eventsOfDate(date);
  const acts = activityByProject(events, al);
  const dueOnly = process.argv.includes('--due-only');
  const projects = acts.map(a => {
    const yamlPath = join(root, 'user-space', 'projects', a.project, 'project.yaml');
    const yaml = readText(yamlPath);
    const terms = (yaml.match(/terms:\s*\[([^\]]*)\]/) || [])[1]?.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) || [];
    const rel = sceneRelPath(a.project);
    const scenePath = join(root, rel);
    const existing = readText(scenePath);
    return {
      project: a.project,
      activity: a,
      sceneRelPath: rel,
      exists: existsSync(scenePath),
      needsUpdate: needsUpdate(existing, date),
      material: {
        dailyLines: events.filter(e => normalizeProject(e.project, al) === a.project)
          .map(e => `- [${String(e.ts_local).slice(11, 16)}] ${e.type}: ${String(e.data || '').slice(0, 200)}`),
        memoryHits: memoryHits(a.project, terms),
        projectYaml: yaml.trim().slice(0, 600),
        manual: extractManual(existing),
        sections: SCENE_SECTIONS,
      },
    };
  }).filter(p => !dueOnly || p.needsUpdate);
  console.log(JSON.stringify({ status: 'ok', date, projects }, null, 2));
} else if (cmd === 'write') {
  const project = normalizeProject(arg('project'), aliases());
  if (!project) { console.error("Missing or invalid --project (placeholder ? is not allowed)"); process.exit(1); }
  let payload = arg('input');
  if (!payload) { try { payload = readFileSync(0, 'utf8'); } catch { /* ignore */ } }
  let parsed = null;
  try { parsed = JSON.parse(payload); } catch { /* fallthrough */ }
  if (!parsed || typeof parsed !== 'object') { console.error("Missing or invalid --input (expected JSON)"); process.exit(1); }
  const meta=readMemoryMeta(root),allowed=new Set(currentMemories(root,{project,at:date}).map(e=>e.id));
  if(Object.values(meta.entries).some(e=>['revoked','conflicted'].includes(e.confirmation?.status))&&!Array.isArray(parsed.evidence_ids)){console.error("Some memories were withdrawn. Review the material and explicitly provide evidence_ids ([] is valid when no memory evidence applies).");process.exit(1);}
  if(parsed.evidence_ids!==undefined&&(!Array.isArray(parsed.evidence_ids)||parsed.evidence_ids.some(id=>!allowed.has(id)))){console.error("Scene-block evidence includes withdrawn or unknown memories");process.exit(1);}

  const rel = sceneRelPath(project);
  assertInSandbox(rel);
  const outPath = join(root, rel);
  const manual = parsed.manual !== undefined ? String(parsed.manual) : extractManual(readText(outPath));
  const md = renderScene({
    project,
    updated: date,
    lastActivity: String(parsed.lastActivity || date),
    sections: parsed.sections || {},
    manual,
  }).replace(/^---\n/,`---\nmemory_meta_hash: ${bodyHash(JSON.stringify(meta))}\nmemory_dependencies: ${JSON.stringify(memoryDependencies(root,parsed.evidence_ids,{project,at:date}))}\n`);
  mkdirSync(join(root, 'user-space', 'projects', project), { recursive: true });
  writeFileSync(outPath, md, 'utf8');
  try {
    appendLocalLog(root, MEMORY_WRITES, auditRow({ ts_local: nowTs, id: `scene:${project}`, type: 'scene', target: rel, bytes: Buffer.byteLength(md, 'utf8') }));
  } catch {  }
  console.log(JSON.stringify({ status: 'ok', project, target: rel, updated: date }));
} else if (cmd === 'status') {
  const dir = join(root, 'user-space', 'projects');
  const scenes = [];
  if (existsSync(dir)) {
    for (const p of readdirSync(dir)) {
      const f = join(dir, p, 'scene.md');
      if (!existsSync(f)) continue;
      const fm = parseSceneFrontmatter(readText(f));
      scenes.push({ project: p, updated: fm.updated || '', lastActivity: fm.last_activity || '' });
    }
  }
  console.log(JSON.stringify({ status: 'ok', scenes: scenes.sort((a, b) => a.project.localeCompare(b.project)) }, null, 2));
} else {
  console.error('usage: plan [--date <d>] | write --project <id> --date <d> --input <json> | status');
  process.exit(1);
}
