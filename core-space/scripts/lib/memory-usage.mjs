// memory usage
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {assertWithin} from './safe-path.mjs';
import {withMemoryMetaLock} from './memory-meta.mjs';
import {validMemoryDay} from './memory-lifecycle.mjs';
import {currentMemories} from './memory-dependencies.mjs';
import {readDecayState} from './memory-decay-store.mjs';
import {markUsed,serializeDecay} from './memory-decay.mjs';
import {localLogStore,readLocalLog} from './local-log.mjs';
import {GROWTH_LOG} from './growth-feedback.mjs';
import {acquireFileLock} from './file-lock.mjs';
import {commitMemoryFiles} from './memory-transaction.mjs';
import {runtimeIgnoreStatus} from './runtime-state-policy.mjs';
import {todayKey} from './day-clock.mjs';
export const MEMORY_USAGE_SCHEMA=1;
export function recordMemoryUsage(root,{receiptId,entries,project='',at=todayKey(root),fault}={}){
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(receiptId||'')||['__proto__','constructor','prototype'].includes(receiptId))throw Error("Invalid usage receipt identity");
 if(!Array.isArray(entries)||entries.length>100||entries.some(e=>!e||typeof e.id!=='string'||!/^[a-f0-9]{64}$/.test(e.body_hash||''))||new Set(entries.map(e=>e.id)).size!==entries.length||!validMemoryDay(at))throw Error("Usage receipt requires a unique ID, content SHA256 and valid date");
 const path=assertWithin(root,join(root,'state/memory-usage-receipts.json'),{rejectLinks:true}),privacy=runtimeIgnoreStatus(root,'state/memory-usage-receipts.json');
 if(['tracked','unignored'].includes(privacy.status))throw Error("Usage receipts must be device-private; preview runtime migration first");
 return withMemoryMetaLock(root,()=>{
  const releases=[];
  try{
   for(const lock of [path+'.lock',join(root,'state/memory-decay.json.lock'),join(root,'state/growth-feedback.lock')])releases.push(acquireFileLock(lock));
   const state=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{version:1,receipts:{}};
   if(state.version!==1||!state.receipts||typeof state.receipts!=='object'||Array.isArray(state.receipts))throw Error("Usage receipt store is corrupt; overwrite refused");
   const normalized=entries.map(({id,body_hash})=>({id,body_hash})).sort((a,b)=>a.id.localeCompare(b.id)),fingerprint=createHash('sha256').update(JSON.stringify([project,at,normalized])).digest('hex');
   const old=state.receipts[receiptId];if(old){if(old.fingerprint!==fingerprint)throw Error("Conflicting content for the same usage receipt identity");return {...old,replayed:true};}
   const current=currentMemories(root,{project,at});
   for(const e of entries){const found=current.find(row=>row.id===e.id);if(!found||found.body_hash!==e.body_hash)throw Error("Usage receipt content changed, expired or became invisible; accounting refused");}
   const previous=readLocalLog(root,GROWTH_LOG),events=entries.map(e=>({event_id:'usage-'+receiptId+'-'+e.id,ts:new Date().toISOString(),kind:'retrieved',target:e.id,reason:'context-delivered',project,actor:'host_report',observed:'delivered-to-model',body_hash:e.body_hash,receipt_id:receiptId}));
   if(events.some(e=>previous.some(p=>p.event_id===e.event_id)))throw Error("Usage event differs from authoritative receipt; recover first");
   const growthPath=assertWithin(root,localLogStore(root,GROWTH_LOG).path,{rejectLinks:true}),bytes=existsSync(growthPath)?readFileSync(growthPath,'utf8'):'';
   const result={status:'recorded',count:entries.length,fingerprint,at};state.receipts[receiptId]=result;
   const files=new Map([[join(root,'state/memory-decay.json'),serializeDecay(markUsed(readDecayState(root),entries.map(e=>e.id),at))],[growthPath,bytes+(bytes&&!bytes.endsWith('\n')?'\n':'')+events.map(e=>JSON.stringify(e)+'\n').join('')],[path,JSON.stringify(state,null,2)+'\n']]);
   commitMemoryFiles(root,files,{fault,additionalLocks:['state/growth-feedback.lock']});return result;
  }finally{for(const release of releases.reverse())release();}
 });
}
