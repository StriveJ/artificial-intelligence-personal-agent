// memory meta
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { atomicWriteFile } from './atomic-write.mjs';
import { acquireFileLock } from './file-lock.mjs';
import { assertNoActiveInstall } from './install-maintenance.mjs';
import { assertWithin, safeRelativePath } from './safe-path.mjs';
import { readEventSet } from './event-store.mjs';
import { todayKey } from './day-clock.mjs';
import {validateLifecycle,assertAcyclicSupersession} from './memory-lifecycle.mjs';

export const MEMORY_META_REL = 'user-space/memory/memory-meta.json';
export const bodyHash = text => createHash('sha256').update(String(text).replace(/\r\n/g,'\n')).digest('hex');
const pathOf = root => assertWithin(root,join(root,MEMORY_META_REL),{rejectLinks:true});
export function readMemoryMeta(root) {
  assertNoActiveInstall(root);
  const path=pathOf(root);
  if(!existsSync(path)) return {version:1,entries:{}};
  const v=JSON.parse(readFileSync(path,'utf8'));
  if(v?.version!==1||!v.entries||typeof v.entries!=='object'||Array.isArray(v.entries))throw new Error("Memory metadata is corrupt; overwrite refused");
  for(const [id,e] of Object.entries(v.entries))if(!id||!e||typeof e!=='object'||Array.isArray(e)||typeof e.body_hash!=='string')throw new Error("Invalid memory metadata entry");
  for(const row of Object.values(v.entries))validateLifecycle(row);
  return v;
}
export function updateMemoryMeta(root,update) {
  const path=pathOf(root),release=acquireFileLock(path+'.lock');
  try{const v=readMemoryMeta(root),result=update(v);atomicWriteFile(path,JSON.stringify(v,null,2)+'\n');return result;}finally{release();}
}

export function resolveEvidence(root,refs) {
  if(!Array.isArray(refs))throw new Error("evidence must be an array of references; numbers are not evidence");
  const events=readEventSet(root).entries.map(({row,host})=>({...row,host})).filter(e=>e.event_id);
  const out=[],seen=new Set();
  for(const ref of refs){
    let e;
    if(ref?.event_id){
      const found=events.filter(e=>e.event_id===ref.event_id&&(!ref.host||e.host===ref.host)&&(!ref.sid||e.sid===ref.sid));
      if(found.length!==1)throw new Error(found.length?"Evidence event identity is ambiguous; specify host/sid":"Evidence event does not exist or is pending review: "+ref.event_id);
      const row=found[0];
      e={ref:'event:'+JSON.stringify([row.host,row.sid||'',row.event_id]),event_id:row.event_id,host:row.host,kind:row.type==='user_message'?'user_statement':'model_observation',sid:row.sid||'',ts:row.ts,hash:bodyHash(row.data||''),quote:String(row.data||'')};
    }else if(ref?.file){
      const rel=safeRelativePath(ref.file),path=assertWithin(root,join(root,rel),{rejectLinks:true});
      e={ref:'file:'+rel,kind:'external_material',hash:bodyHash(readFileSync(path,'utf8'))};
    }else throw new Error("Evidence references accept only event_id or an instance-relative file");
    if(!seen.has(e.ref)){seen.add(e.ref);out.push(e);}
  }
  return out;
}
export function confirmationFor(evidence,{byUser=false,reason='',day=''}={}) {
  if(byUser&&!reason.trim())throw new Error("User confirmation requires --reason (the explicit reply or action supporting confirmation)");
  if(byUser)return {status:'user_confirmed',actor:'user',date:day,reason};
  const count=new Set((evidence||[]).filter(e=>e.kind==='user_statement').map(e=>e.ref)).size;
  return count>=3&&reason.trim()?{status:'model_confirmed',actor:'model',date:day,reason}:{status:'observed',actor:'model',date:day,reason:reason||"Insufficient evidence; retain as observation"};
}
export function bindMemoryMeta(root,entry,patch,{reason='',actor='model'}={}) {
  return updateMemoryMeta(root,v=>patchMemoryMeta(v,entry,patch,{reason,actor}));
}

export function patchMemoryMeta(v,entry,patch,{reason='',actor='model'}={}) {
    const previous=v.entries[entry.id]||{},old=previous.index_history_only?{index_history:previous.index_history}:previous;
    const inherited={projects:entry.projects||[],scope:entry.scope||((entry.projects||[]).length?'project':'global'),valid_from:entry.valid_from||'',valid_until:entry.valid_until||'',tags:entry.tags||[],sensitive:entry.sensitive===true};
    const changed=old.body_hash!==bodyHash(entry.body)||old.file!==entry.file;
    const previousConfirmation=old.confirmation||entry.confirmation;
    if(actor!=='user'&&patch.confirmation&&(['revoked','conflicted'].includes(previousConfirmation?.status)||(old.confirmation?.status==='user_confirmed'&&!changed)))patch={...patch,confirmation:previousConfirmation};

    const invalidated=changed?{confirmation:['revoked','conflicted'].includes(previousConfirmation?.status)?previousConfirmation:{status:'unverified',reason:"Content changed; review again"},supersedes:[],supersedes_hashes:{}}:{};
    const row={...inherited,...old,...invalidated,file:entry.file,body_hash:bodyHash(entry.body),...patch};
    validateLifecycle(row);assertAcyclicSupersession(v.entries,entry.id,row);
    row.history=[...(old.history||[]),{at:new Date().toISOString(),actor,reason,action:patch.confirmation?.status||'annotate'}];
    v.entries[entry.id]=row;return row;
}
export function withMemoryMetaLock(root, operation) {
  const release = acquireFileLock(pathOf(root) + '.lock');
  try { return operation(); } finally { release(); }
}
export function projectMemoryMeta(entry,meta) {
  const raw=meta.entries[entry.id],m=raw?.index_history_only?undefined:raw;
  const matched=m&&m.file===entry.file&&m.body_hash===bodyHash(entry.body);
  const confirmation=['revoked','conflicted'].includes(m?.confirmation?.status)?m.confirmation:matched?(m.confirmation||{status:'observed'}):['revoked','conflicted'].includes(entry.confirmation?.status)?entry.confirmation:{status:'unverified',reason:m?"Content changed; review again":"Historical record has no confirmation source"};

  const restrictions=m&&m.file===entry.file?m:entry;
  const guard={projects:restrictions.projects||[],scope:restrictions.scope||((restrictions.projects||[]).length?'project':'global'),valid_from:restrictions.valid_from||'',valid_until:restrictions.valid_until||'',tags:restrictions.tags||entry.tags||[],sensitive:restrictions.sensitive??entry.sensitive??false};
  return {...entry,...guard,body_hash:bodyHash(entry.body),...(matched?{type:m.type||entry.type,tags:m.tags||entry.tags,pinned:m.pinned===true,decision_exempt:m.decision_exempt!==false,provenance:m.provenance||[],supersedes:m.supersedes||[],supersedes_hashes:m.supersedes_hashes||{},metadata_verified:true}: {provenance:[],supersedes:[],supersedes_hashes:{},metadata_verified:false}),confirmation,confidence:matched?(confirmation.status==='user_confirmed'?1:confirmation.status==='model_confirmed'?0.8:0.3):0.3};
}
