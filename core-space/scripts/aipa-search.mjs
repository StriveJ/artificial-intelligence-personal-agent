// search
import { updateDecayState } from './lib/memory-decay-store.mjs';
import { appendError } from './lib/error-sink.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { markUsed, parseDecay, serializeDecay } from './lib/memory-decay.mjs';
import { memoryIndexPath, readMemoryIndex, writeMemoryIndex } from './lib/memory-index-store.mjs';
import { mergeScores, parseExpand, scoreEntry } from './lib/search-score.mjs';
import { todayKey } from './lib/day-clock.mjs';
import { SEARCH_LOG, appendLocalLog } from './lib/local-log.mjs';
import { readMemorySources, memorySourceSnapshot } from './lib/memory-source.mjs';
import { readMemoryMeta, bodyHash } from './lib/memory-meta.mjs';
import { recordGrowth } from './lib/growth-feedback.mjs';
import { renderSearch } from './lib/search-output.mjs';
import {selectMemories,validMemoryDay} from './lib/memory-lifecycle.mjs';
import {recordMemoryUsage} from './lib/memory-usage.mjs';

function logSearch(root, q, hits, bytes, extra = {}) {
  try {
    const now = new Date();
    const p = (x) => String(x).padStart(2, '0');
    const ts = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;

    appendLocalLog(root, SEARCH_LOG, {
      v: 2, ts, q, hits, bytes: Number(bytes) || 0,
      topScore: Number(extra.topScore) || 0,
      expandCount: Number(extra.expandCount) || 0,
      via: String(extra.via || ''),
    });
  } catch {  }
}

function bumpUsed(root, hits) {
  try {
    const ids = (hits || []).filter(r => r.kind === 'memory').map(r => r.id);
    for(const hit of hits||[])recordGrowth(root,{kind:'retrieved',target:hit.id,project:arg('project')});
    if (!ids.length) return true;
    const today=todayKey(root);
    updateDecayState(root,state=>markUsed(state,ids,today));
    return true;
  } catch(error) {
    console.error("Search returned, but usage recording or reinforcement failed: "+error.message);
    try{appendError(root,{scope:'aipa-search:usage',message:error.message,ts:new Date().toISOString()});}catch{}
    return false;
  }
}

function arg(n){ const i=process.argv.indexOf('--'+n); return i>=0 ? process.argv[i+1] : ''; }

const root = arg('root') || '.';
const queryDay=arg('at')||todayKey(root);
if(!validMemoryDay(queryDay)){console.error("--at must be a valid YYYY-MM-DD");process.exit(1);}
const q = arg('q') || '';
const tag = arg('tag') || '';
const kind = arg('kind') || '';
const status = arg('status') || '';
const expand = parseExpand(arg('expand') || '');
const asJson = process.argv.includes('--json');
const list = process.argv.includes('--list');
const top = Math.max(1, parseInt(arg('top') || '5', 10) || 5);

const chars = arg('chars') === '' ? 2000 : Number(arg('chars'));
if(!Number.isInteger(chars)||chars<0){console.error("--chars must be a nonnegative integer");process.exit(1);}

const budgetRaw = arg('budget');

const budget = budgetRaw === '' ? 8000 : Number(budgetRaw);
if(!Number.isInteger(budget)||budget<0){console.error("--budget must be a nonnegative integer; 0 means unlimited");process.exit(1);}

if(arg('receipt')){
 try{if(!arg('used'))throw Error("Usage receipt requires --used");console.log(JSON.stringify(recordMemoryUsage(root,{receiptId:arg('receipt'),entries:JSON.parse(arg('used')),project:arg('project'),at:queryDay})));process.exit(0);}
 catch(error){console.error(error.message);process.exit(1);}
}
const results = [];

function ensureIndexFresh(root) {
  const memIdx = memoryIndexPath(root);
  const memDir = join(root, 'user-space', 'memory');
  if (!existsSync(memDir)) return false;
  let need = !existsSync(memIdx);
  if (!need) {
    try {
      const idx = JSON.parse(readFileSync(memIdx, 'utf8'));
      need = idx.identity_version !== 2 || JSON.stringify(idx.source_snapshot) !== JSON.stringify(memorySourceSnapshot(readMemorySources(root))) || idx.metadata_hash !== bodyHash(JSON.stringify(readMemoryMeta(root)));
    } catch { need = true; }
  }
  if (!need) return true;
  const self = dirname(fileURLToPath(import.meta.url));
  try { execFileSync(process.execPath, [join(self, 'aipa-index.mjs'), '--root', root], { stdio: ['ignore', 'pipe', 'inherit'] }); }
  catch (error) { console.error("Memory index rebuild failed; refusing stale cached results: " + error.message); process.exit(1); }
  return true;
}
const memoryAvailable = ensureIndexFresh(root);

const kbIdx = join(root, 'user-space', 'knowledge-base', '_index', 'knowledge-index.json');
if(existsSync(kbIdx)){
  const idx = JSON.parse(readFileSync(kbIdx, 'utf8'));
  for(const e of selectMemories(idx.entries||[],{project:arg('project'),at:queryDay}).entries){
    results.push({ id: e.id, kind: 'kb', title: e.title || '', tags: e.tags || [], body: e.summary || '', location: e.original_path || '', status: e.status || '', confirmed:e.confirmed===true, source:e.source||'', confirmation:{status:e.confirmed===true?'card_confirmed':'unverified'} });
  }
}

{

  const idx = memoryAvailable ? readMemoryIndex(root) : { entries: [] };
  for(const e of selectMemories(idx.entries||[],{project:arg('project'),at:queryDay}).entries){
    if(['revoked','conflicted'].includes(e.confirmation?.status)) continue;
    const body = e.body || e.section || '';
    results.push({ id: e.id, kind: 'memory', title: e.title || '', tags: e.tags || [], sensitive:e.sensitive===true, body,body_hash:e.body_hash,scope:e.scope,valid_from:e.valid_from,valid_until:e.valid_until, location: e.file || '', status: e.state || '', source:e.source||'', provenance:e.provenance||[], confirmation:e.confirmation||{status:'unverified'}, projects:e.projects||[], type:e.type||'text' });
  }
}

if(arg('used')){
 try {
  const ids=JSON.parse(arg('used'));
  if(!Array.isArray(ids)||ids.length>100||ids.some(id=>typeof id!=='string'))throw Error("Usage receipt must be a bounded array of IDs");
  const selected=results.filter(r=>r.kind==='memory'&&ids.includes(r.id));
  if(selected.length!==new Set(ids).size)throw Error("Usage receipt includes invalid, withdrawn or pending-review memories");
  if(!bumpUsed(root,selected))throw Error("Usage receipt was not fully recorded; review the error log");
  console.log(JSON.stringify({status:'recorded',count:selected.length}));process.exit(0);
 } catch(error){console.error(error.message);process.exit(1);}
}
if(!q&&!tag&&!list){console.error("Requires --q, --tag or --list");process.exit(1);}
const eligible=results.filter(r=>(!kind||r.kind===kind)&&(!status||r.status===status)&&(!tag||r.tags.includes(tag)));
const terms=q.split(/\s+/).filter(Boolean);
let out=eligible.map(r=>{
  const base=q?scoreEntry(r,terms):tag?scoreEntry(r,[tag]):0;
  const exp=q&&expand.length?scoreEntry(r,expand):0;
  return {...r,...mergeScores({base,expand:exp})};
});
if(!list&&q)out=out.filter(r=>r.score>0);
out.sort((a,b)=>b.score-a.score);
out=out.slice(0,list&&!arg('top')?out.length:top);
try{
  const rendered=renderSearch(out,{json:asJson,list,q,expand,chars,budget});
  process.stdout.write(rendered.text);
  if(!process.argv.includes('--defer-usage')&&!list)bumpUsed(root,rendered.shown);
  logSearch(root,q||tag,rendered.shown.length,rendered.bytes,{topScore:rendered.shown[0]?.score,expandCount:expand.length,via:rendered.shown[0]?.via});
}catch(error){console.error(error.message);process.exitCode=1;}
