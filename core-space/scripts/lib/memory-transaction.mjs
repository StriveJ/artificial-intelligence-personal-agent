// memory transaction
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertWithin, safeRelativePath } from './safe-path.mjs';
import { atomicWriteFile } from './atomic-write.mjs';
import { assertNoActiveInstall } from './install-maintenance.mjs';
import { runtimeIgnoreStatus } from './runtime-state-policy.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = rel => /^user-space\/(?:memory\/[^/]+\.(?:md|json)|skills\/(?:work|life|study)\/[a-z0-9-]+\/SKILL\.md)$/.test(rel) || /^state\/(?:hosts\/[a-z0-9-]+\/)?(?:distill\.json|growth-events\.jsonl)$/.test(rel)||/^state\/(?:memory-decay|memory-usage-receipts)\.json$/.test(rel);
function checked(root, rel) { rel=safeRelativePath(rel); if(!allowed(rel))throw Error("Memory transaction path is outside the allowed scope"); return assertWithin(root,join(root,rel),{rejectLinks:true}); }
const journalPath = root => assertWithin(root,join(root,'state/memory-transaction.json'),{rejectLinks:true});
const checkedLock=(root,rel)=>rel==='state/growth-feedback.lock'?assertWithin(root,join(root,rel),{rejectLinks:true}):checked(root,rel.slice(0,-5))+'.lock';
function validate(root,v) {
  if(v.schema!==1||!Number.isSafeInteger(v.pid)||v.pid<1||!Array.isArray(v.entries)||!Array.isArray(v.locks)||!['prepared','applying','completed','rolled-back','recovery-required'].includes(v.phase))throw Error("Invalid memory recovery journal");
  for(const e of v.entries){checked(root,e.path);if(hash(Buffer.from(e.after,'base64'))!==e.afterHash||e.before!==null&&hash(Buffer.from(e.before,'base64'))!==e.beforeHash)throw Error("Memory recovery digest mismatch");}
  for(const lock of v.locks){if(!lock.path.endsWith('.lock'))throw Error("Invalid recovery lock path");checkedLock(root,lock.path);if(lock.pid!==v.pid||typeof lock.owner!=='string')throw Error("Invalid recovery lock identity");}
}
function rollback(root,v,{retainLocks=false}={}) {
  validate(root,v);

  for(const e of v.entries){const p=checked(root,e.path),current=existsSync(p)?hash(readFileSync(p)):null;if(current!==e.beforeHash&&current!==e.afterHash)throw Error("Destination changed unexpectedly after the transaction; recovery stopped");}
  for(const e of v.entries){const p=checked(root,e.path);if(e.before===null){if(existsSync(p))unlinkSync(p);}else atomicWriteFile(p,Buffer.from(e.before,'base64'));}
  atomicWriteFile(journalPath(root),JSON.stringify({...v,phase:'rolled-back',entries:[],locks:retainLocks?v.locks:[]}));
}
export function commitMemoryFiles(root, files, { fault=()=>{},additionalLocks=[] }={}) {
  assertNoActiveInstall(root);
  const privacy=runtimeIgnoreStatus(root,'state/memory-transaction.json');
  if(['tracked','unignored'].includes(privacy.status))throw Error("Memory recovery journals must be device-private. Preview aipa-runtime-migrate first; personal ignore rules will not be overwritten.");
  const journal=journalPath(root),entries=[...files].map(([path,after])=>{
    const rel=relative(root,path).replace(/\\/g,'/'),p=checked(root,rel),before=existsSync(p)?readFileSync(p):null,bytes=Buffer.from(after);
    return {path:rel,before:before?.toString('base64')??null,beforeHash:before?hash(before):null,after:bytes.toString('base64'),afterHash:hash(bytes)};
  });
  const locks=[...new Set([...entries.map(e=>e.path+'.lock'),'user-space/memory/memory-meta.json.lock',...additionalLocks])].filter(rel=>existsSync(checkedLock(root,rel))).map(path=>({path,...JSON.parse(readFileSync(checkedLock(root,path),'utf8'))}));
  const v={schema:1,id:randomUUID(),pid:process.pid,phase:'prepared',entries,locks};validate(root,v);atomicWriteFile(journal,JSON.stringify(v));
  try {
    fault('prepared');v.phase='applying';atomicWriteFile(journal,JSON.stringify(v));
    for(const e of entries){atomicWriteFile(checked(root,e.path),Buffer.from(e.after,'base64'));fault('written',e.path);}
    fault('before-completion');
    atomicWriteFile(journal,JSON.stringify({...v,phase:'completed',entries:[],locks:[]}));
  }catch(error){try{rollback(root,v);}catch(recovery){v.phase='recovery-required';atomicWriteFile(journal,JSON.stringify(v));throw Error("Memory recovery pending: "+recovery.message);}throw error;}
}
export function recoverMemoryFiles(root) {
  const path=journalPath(root);if(!existsSync(path))return {status:'nothing-to-recover'};
  const v=JSON.parse(readFileSync(path,'utf8'));validate(root,v);
  if(v.phase==='completed'||v.phase==='rolled-back'&&!v.locks.length)return {status:v.phase};
  let alive=true;try{process.kill(v.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
  if(alive)throw Error("Original memory writer is still alive; takeover refused");
  const locks=v.locks.map(lock=>{const path=checkedLock(root,lock.path);if(existsSync(path)){const actual=JSON.parse(readFileSync(path,'utf8'));if(actual.owner!==lock.owner||actual.pid!==v.pid)throw Error("Recovery lock ownership changed; stopped");}return path;});
  rollback(root,v,{retainLocks:true});for(const lock of locks)if(existsSync(lock))unlinkSync(lock);
  atomicWriteFile(path,JSON.stringify({...v,phase:'rolled-back',entries:[],locks:[]}));
  return {status:'rolled-back'};
}
