// index
import { readDecayState,updateDecayState } from './lib/memory-decay-store.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { effectiveWeight, parseDecay, stateFor } from './lib/memory-decay.mjs';
import { todayKey } from './lib/day-clock.mjs';
import { isValidHostId, readHostId } from './lib/host-id.mjs';
import { readMemoryIndexForRebuild, writeMemoryIndex, memoryIndexPath } from './lib/memory-index-store.mjs';
import { readMemorySources, memorySourceSnapshot, memoryRecords, migrateMemoryBindings } from './lib/memory-source.mjs';
import { atomicWriteFile } from './lib/atomic-write.mjs';
import { readMemoryMeta, projectMemoryMeta, bodyHash, updateMemoryMeta } from './lib/memory-meta.mjs';
import { projectDuplicates } from './lib/memory-dedup.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root')||'.';

const today=arg('today')||todayKey(root);
const dir=join(root,'user-space','memory');
if(!existsSync(dir)){console.error('no memory dir');process.exit(1);}

const oldIndex=readMemoryIndexForRebuild(root);
const sources = readMemorySources(root), records = memoryRecords(sources);
const { bindings, aliases, warnings } = migrateMemoryBindings(records, oldIndex.entries || []);
let metadata=readMemoryMeta(root);
const metaMoves=[...aliases].filter(([from,to])=>from!==to&&metadata.entries[from]&&!metadata.entries[to]);
if(metaMoves.length){updateMemoryMeta(root,m=>{for(const [from,to] of metaMoves){const old=m.entries[from];m.entries[to]={...old,...(old.index_history?{index_history:{...old.index_history,id:to}}:{})};}});metadata=readMemoryMeta(root);}
if (oldIndex.identity_version !== 2 && (oldIndex.entries || []).length) {
  const backup = memoryIndexPath(root) + '.v1-backup.json';
  if (!existsSync(backup)) atomicWriteFile(backup, JSON.stringify(oldIndex, null, 2) + '\n');
}
if (warnings.length) console.error("Legacy memory identity is ambiguous; relations/decay ownership were not guessed. Review index migration_warnings and .v1-backup.json: " + warnings.join(', '));

const me=(()=>{ const id=readHostId(root); return id&&isValidHostId(id)?id:hostname(); })();

let decay=readDecayState(root);
let decayMigrated = false;
const previousDecay = { ...decay };
for (const [from, to] of aliases) if (from !== to && previousDecay[from]) { decay[to] = previousDecay[from]; decayMigrated = true; }
if (decayMigrated) decay=updateDecayState(root,current=>{const prior={...current};for(const [from,to] of aliases)if(from!==to&&prior[from])current[to]=prior[from];return current;});
const entries=[];
const newestMtime=Math.max(0,...sources.map(s => s.mtimeMs));
for(const s of records){
    const id=s.id;
    const d=decay[id];
    const weight=d?effectiveWeight(d,today):1.0;

    const prev=bindings.get(id);

    const changed=!prev||(prev.body_hash||bodyHash(prev.body))!==bodyHash(s.body);
    entries.push({
      ...(prev || {}), id, file:s.file, title:s.title, body:s.body,
      tags:prev?.tags || [], sensitive:prev?.sensitive || false,
      source: prev? (prev.source || 'unknown:legacy') : `consume:${today}`,
      device_id: prev? prev.device_id : me,
      created: prev?.created || today,
      last_used: d?.last_used || prev?.last_used || null,
      last_modified_by: prev ? (changed ? me : (prev.last_modified_by || prev.device_id || me)) : me,
      weight, confidence: prev&&!changed&&prev.confidence!=null ? prev.confidence : 0.3,
      type:prev?.type || 'text', media:prev?.media || [], state:d?stateFor(weight):'active', pinned:prev?.pinned || false,
      local_override:prev?.local_override || false, conflicts:prev?.conflicts || [],
      relations: (prev?.relations || []).map(r => ({...r,target_id:aliases.get(r.target_id) || r.target_id})), keywords:d&&d.keywords?d.keywords:null,
    });
}
const index={
  version:'0.2', identity_version:2, source_snapshot:memorySourceSnapshot(sources), metadata_hash:bodyHash(JSON.stringify(metadata)), migration_warnings:warnings, last_updated:newestMtime?new Date(newestMtime).toISOString():new Date().toISOString(), entries:projectDuplicates(entries.map(e=>projectMemoryMeta(e,metadata)),metadata).entries,
  relation_types:{basis_of:"A is evidence for B",derived_from:"A derives from B",contradicts:"A contradicts B",supersedes:"A supersedes B",related_to:"A is related to B"},
};
writeMemoryIndex(root,index,{rebuild:true});
console.log('indexed');
