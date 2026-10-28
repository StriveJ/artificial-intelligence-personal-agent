// memory index store
// export/health/import/index/memory-diff/relations/search/trait-confirm），

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomicWriteFile } from './atomic-write.mjs';
import {readMemoryMeta,updateMemoryMeta,bodyHash} from './memory-meta.mjs';
import {readMemorySources,memoryRecords,migrateMemoryBindings} from './memory-source.mjs';
import {assertWithin} from './safe-path.mjs';
import { assertNoActiveInstall } from './install-maintenance.mjs';

import { resolveShardStore, storeReadPaths } from './host-id.mjs';

export const MEMORY_INDEX_SHARD_REL = 'memory-index.json';
export const MEMORY_INDEX_LEGACY_REL = join('user-space', 'memory', 'memory-index.json');

export const memoryIndexStore = (root) => resolveShardStore(root, MEMORY_INDEX_SHARD_REL, MEMORY_INDEX_LEGACY_REL);

function readMemoryIndexCache(root, { strict = false } = {}) {
  assertNoActiveInstall(root);
  const found = storeReadPaths(root, MEMORY_INDEX_SHARD_REL, MEMORY_INDEX_LEGACY_REL).map(p=>assertWithin(root,p,{rejectLinks:true})).find((p) => existsSync(p));
  if (!found) return { version: '0.1', entries: [] };
  try {
    const o = JSON.parse(readFileSync(found, 'utf8'));
    if (!o || typeof o !== 'object' || !Array.isArray(o.entries) || o.entries.some(e=>!e||typeof e!=='object'||Array.isArray(e))) {
      if(strict)throw new Error("Invalid entries");
      return {version:'0.1',entries:[]};
    }
    return o;
  } catch (error) {
    if(strict)throw new Error("Memory index is corrupt; original file preserved. Back up and repair it before retrying.", {cause:error});
    return { version: '0.1', entries: [] };
  }
}

const historyFields=['file','title','source','created','device_id','last_modified_by','relations','tags','sensitive','projects','scope','valid_from','valid_until','type','media','pinned','decision_exempt','local_override','conflicts','confirmation','supersedes','supersedes_hashes','provenance'];
function historyRows(root){
 const rows=[];
 for(const [id,metadata] of Object.entries(readMemoryMeta(root).entries)){
  const row=metadata.index_history;if(!row)continue;
  if(row.schema!==1||row.id!==id||typeof row.file!=='string'||typeof row.title!=='string'||!/^[a-f0-9]{64}$/.test(row.body_hash)||row.digest!==bodyHash(JSON.stringify(row.value))||!row.value||row.value.file!==row.file||row.value.title!==row.title)throw Error("Persistent index history is corrupt; source must not be guessed");
  rows.push({...row.value,id,body_hash:row.body_hash});
 }
 return rows;
}
function preserveGuards(cache,history){
 const projectScope=row=>row.scope==='project'||(row.projects||[]).length>0;
 const a=projectScope(cache),b=projectScope(history),projects=a&&b?(cache.projects||[]).filter(id=>(history.projects||[]).includes(id)):a?cache.projects:b?history.projects:[];
 if(a&&b&&!projects.length)throw Error("Cache project restrictions conflict with persistent history; existing state preserved");
 const from=[cache.valid_from,history.valid_from].filter(Boolean).sort().at(-1)||'',until=[cache.valid_until,history.valid_until].filter(Boolean).sort()[0]||'';
 const confirmation=[cache.confirmation,history.confirmation].find(value=>value?.status==='revoked')||[cache.confirmation,history.confirmation].find(value=>value?.status==='conflicted')||cache.confirmation;
 return {sensitive:cache.sensitive===true||history.sensitive===true,tags:[...new Set([...(cache.tags||[]),...(history.tags||[])])],scope:a||b?'project':'global',projects,valid_from:from,valid_until:until,...(confirmation?{confirmation}:{})};
}
export function readMemoryIndex(root,options={}){
 const index=readMemoryIndexCache(root,options);if(index.identity_version!==2)return index;
 const rows=historyRows(root),byId=new Map(rows.map(row=>[row.id,row]));
 return {...index,entries:index.entries.map(entry=>{
  const history=byId.get(entry.id);return history?{...entry,...history,...preserveGuards(entry,history),body:entry.body}:entry;
 })};
}
function recoverableHistory(root){
 const rows=historyRows(root),records=memoryRecords(readMemorySources(root));
 if(!rows.length)return null;
 const {bindings}=migrateMemoryBindings(records,rows);
 if(records.some(record=>!bindings.has(record.id)))return null;
 return rows;
}
export function readMemoryIndexForRebuild(root){
 let index;
 try{index=readMemoryIndex(root,{strict:true});}
 catch(error){const rows=recoverableHistory(root);if(!rows)throw error;return {version:'0.2',identity_version:2,entries:rows,recovered_from_history:true};}
 if(index.entries?.length&&index.identity_version!==2)return index;
 const rows=historyRows(root);
 const entries=[...(index.entries||[])];
 const cached=new Set(entries.map(e=>e.id));entries.push(...rows.filter(e=>!cached.has(e.id)));
 return {...index,...(!index.entries?.length&&rows.length?{identity_version:2}:{}),entries};
}
function persistHistory(root,entries){
 historyRows(root);
 updateMemoryMeta(root,metadata=>{
  for(const entry of entries){
   if(typeof entry.id!=='string'||!entry.id||['__proto__','constructor','prototype'].includes(entry.id)||typeof entry.file!=='string'||typeof entry.title!=='string'||typeof entry.body!=='string')continue;
   const value=Object.fromEntries(historyFields.filter(key=>key==='decision_exempt'||entry[key]!==undefined).map(key=>[key,key==='decision_exempt'?entry.decision_exempt!==false:entry[key]]));
   const history={schema:1,id:entry.id,file:entry.file,title:entry.title,body_hash:bodyHash(entry.body),value,digest:bodyHash(JSON.stringify(value))};
   if(!metadata.entries[entry.id]){
    metadata.entries[entry.id]={file:entry.file,body_hash:history.body_hash,index_history_only:true};
   }
   metadata.entries[entry.id].index_history=history;
  }
 });
}

export function writeMemoryIndex(root, index, {rebuild=false,fault=()=>{}}={}) {

  try{readMemoryIndexCache(root,{strict:true});}catch(error){
   if(!rebuild||!recoverableHistory(root))throw error;
   const found=storeReadPaths(root,MEMORY_INDEX_SHARD_REL,MEMORY_INDEX_LEGACY_REL).map(p=>assertWithin(root,p,{rejectLinks:true})).find(existsSync);
   const bytes=readFileSync(found),backup=found+'.corrupt-'+bodyHash(bytes.toString('base64'))+'.json';
   if(!existsSync(backup))atomicWriteFile(assertWithin(root,backup,{rejectLinks:true}),bytes);
  }
  persistHistory(root,index.entries||[]);
  fault('history-saved');
  if(index.metadata_hash!==undefined)index={...index,metadata_hash:bodyHash(JSON.stringify(readMemoryMeta(root)))};
  const path = assertWithin(root,memoryIndexStore(root).path,{rejectLinks:true});
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteFile(path, JSON.stringify(index, null, 2) + '\n');
  return path;
}

export const memoryIndexPath = (root) => memoryIndexStore(root).path;
