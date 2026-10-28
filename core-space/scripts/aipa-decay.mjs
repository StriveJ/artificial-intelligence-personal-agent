// decay
import { readDecayState,updateDecayState } from './lib/memory-decay-store.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { applyDecay, parseDecay, pruneState, serializeDecay } from './lib/memory-decay.mjs';
import { memoryIndexPath, readMemoryIndex, writeMemoryIndex } from './lib/memory-index-store.mjs';
import { todayKey } from './lib/day-clock.mjs';
import { activeProjectIds,applyRetentionDecay,retentionReason } from './lib/memory-retention.mjs';
import { readMemoryMeta,projectMemoryMeta } from './lib/memory-meta.mjs';
import { atomicWriteFile } from './lib/atomic-write.mjs';
function arg(name){ const i=process.argv.indexOf('--'+name); return i>=0 ? process.argv[i+1] : ''; }
const root=arg('root')||'.';

const today=arg('today')||todayKey(root);
if(existsSync(join(root,'state','sleep-mode.md'))){ console.log('sleeping'); process.exit(0); }

const index=readMemoryIndex(root,{strict:true}),meta=readMemoryMeta(root);
const all=(index.entries||[]).map(e=>projectMemoryMeta(e,meta));
const validIds=all.map(e=>e.id);
const statePath=join(root,'state','memory-decay.json');
let state=readDecayState(root);
state=pruneState(state, validIds);
for(const id of validIds) if(!state[id]) state[id]={ weight:1, since:today, state:'active', uses:0 };

const active=activeProjectIds(root);
let { map, keywordIds }=applyRetentionDecay(state, all, active, today);
if(process.argv.includes('--explain')){
  console.log(JSON.stringify({status:'preview',today,automatic_deletion:false,entries:all.map(e=>({id:e.id,title:e.title,weight:map[e.id].weight,state:map[e.id].state,last_used:map[e.id].last_used||e.last_used||null,retention:retentionReason(e,active)||null,reason:retentionReason(e,active)||("0.95 daily decay; "+map[e.id].state),requires_user_confirmation:map[e.id].state==='pending_delete'}))},null,2));process.exit(0);
}
mkdirSync(join(root,'state'),{recursive:true});
map=updateDecayState(root,current=>applyRetentionDecay(pruneState(current,validIds),all,active,today).map);

if(keywordIds.length){
  const byId=new Map(all.map(e=>[e.id,e]));
  const kw=keywordIds.map(id=>{ const e=byId.get(id)||{}; return `## [${id}] ${e.title||''}
- Keywords: ${(e.tags||[]).join(', ')}\n`; });
  writeFileSync(join(root,'user-space','memory','keywords.md'), kw.join('\n'), 'utf8');
}
console.log('decayed '+validIds.length);
