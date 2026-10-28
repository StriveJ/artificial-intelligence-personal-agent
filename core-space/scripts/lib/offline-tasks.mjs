// offline tasks
import { existsSync,readFileSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { atomicWriteFile } from './atomic-write.mjs';
import { acquireFileLock } from './file-lock.mjs';
import { assertWithin } from './safe-path.mjs';
import { isOwnRepository,assertEmptyStaging } from './git-staging.mjs';
import { instanceCheckout } from './trunk.mjs';
import { platformNotify } from './notify.mjs';
import { appendError } from './error-sink.mjs';
import { assertNoActiveInstall } from './install-maintenance.mjs';
const kinds=new Set(['git-pull','notify','daily','index','dashboard']);
const pathOf=root=>assertWithin(root,join(root,'state','offline-tasks.json'),{rejectLinks:true});
export function readOfflineTasks(root){const p=pathOf(root);if(!existsSync(p))return {version:1,tasks:[]};const v=JSON.parse(readFileSync(p,'utf8'));if(v?.version!==1||!Array.isArray(v.tasks)||v.tasks.some(t=>!t||!kinds.has(t.kind)||!t.id||!Number.isInteger(t.attempts)||t.attempts<0||!Number.isFinite(Date.parse(t.expires))||!['pending','running','completed','failed','cancelled','expired','uncertain'].includes(t.status)))throw new Error("Deterministic task queue is corrupt; overwrite/execution refused");return v;}
function change(root,fn){assertNoActiveInstall(root);const p=pathOf(root),release=acquireFileLock(p+'.lock');try{const v=readOfflineTasks(root),r=fn(v);atomicWriteFile(p,JSON.stringify(v,null,2)+'\n');return r;}finally{release();}}
export function enqueueOfflineTask(root,{id,kind,expires,payload={}}){
 if(typeof id!=='string'||!id.trim()||id.length>200||!kinds.has(kind))throw new Error("Stable task id and allowlisted kind are required");
 if(!expires||!Number.isFinite(Date.parse(expires))||Date.parse(expires)<=Date.now())throw new Error("A future explicit expires value (ISO timestamp) is required");
 const allowed=kind==='notify'?['title','message']:kind==='daily'?['date']:[];
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(k=>!allowed.includes(k)))throw new Error("Task payload contains unsupported fields");
 if(kind==='notify'&&(![payload.title,payload.message].every(v=>typeof v==='string'&&v.trim()&&v.length<=2000)))throw new Error("Notification requires bounded title/message");
 if(payload.date&&!/^\d{4}-\d{2}-\d{2}$/.test(payload.date))throw new Error("Invalid daily report date");
 return change(root,v=>{const prior=v.tasks.find(t=>t.id===id);if(prior){if(prior.kind!==kind||JSON.stringify(prior.payload)!==JSON.stringify(payload))throw new Error("Conflicting content for the same task id");return prior;}const t={id,kind,expires,payload,status:'pending',attempts:0,created:new Date().toISOString()};v.tasks.push(t);return t;});
}
export function changeTaskState(root,id,status){if(!['cancelled','pending'].includes(status))throw new Error("Invalid state");return change(root,v=>{const t=v.tasks.find(t=>t.id===id);if(!t)throw new Error('task not found');if(['completed','running'].includes(t.status))throw new Error("Completed or running tasks cannot be cancelled/replayed");t.status=status;if(status==='pending')t.attempts=0;return t;});}
async function execute(root,t,notify){
 if(t.kind==='notify'){if(!await notify(t.payload))throw new Error("Notification command success is unconfirmed; review manually before retrying");return;}
 if(t.kind==='git-pull'){
  if(!isOwnRepository(root))throw new Error("git-pull requires the instance's own Git root");
  const guard=instanceCheckout(root);if(guard.code!=='ok')throw new Error("Git replay requires a known instance trunk checkout: "+guard.code);
  assertEmptyStaging(root);if(execFileSync('git',['-C',root,'status','--porcelain'],{encoding:'utf8',stdio:'pipe'}).trim())throw new Error("Instance contains uncommitted changes; automatic Git pull refused");
  execFileSync('git',['-C',root,'pull','--ff-only'],{stdio:'pipe',timeout:30000});return;
 }
 const scripts=dirname(dirname(fileURLToPath(import.meta.url)));
 const args=t.kind==='daily'?(t.payload.date?['--refresh',t.payload.date,'--mechanical']:['sync','--mechanical']):[];
 execFileSync(process.execPath,[join(scripts,'aipa-'+t.kind+'.mjs'),'--root',root,...args],{stdio:'pipe',timeout:30000,maxBuffer:1024*1024});
}
export async function replayOfflineTasks(root,{apply=false,limit=3,notify=platformNotify,executeTask=null,now=new Date()}={}){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error("Replay limit must be from 1 to 20");
 const current=readOfflineTasks(root);if(!apply)return {status:'preview',tasks:current.tasks};
 if(!current.tasks.length)return {status:'no_data',results:[]};
 const release=acquireFileLock(join(root,'state','offline-replay.lock')),results=[];
 try{

  change(root,v=>{for(const t of v.tasks)if(t.status==='running')t.status=t.kind==='notify'?'uncertain':'pending';});
  const ids=readOfflineTasks(root).tasks.filter(t=>t.status==='pending').slice(0,limit).map(t=>t.id);
  for(const id of ids){
   const t=change(root,v=>{const item=v.tasks.find(t=>t.id===id);if(item.status!=='pending')return {...item};if(Date.parse(item.expires)<=now.getTime()){item.status='expired';return {...item};}if(item.attempts>=3){item.status='failed';return {...item};}item.status='running';item.attempts++;return {...item};});
   if(t.status!=='running'){results.push({id,status:t.status});continue;}
   let status='completed',error='';
   try{await (executeTask?executeTask(t):execute(root,t,notify));}catch(e){error=e.message;status=t.kind==='notify'?'uncertain':t.attempts>=3?'failed':'pending';try{appendError(root,{scope:'offline:'+t.kind,ts:now.toISOString(),message:error});}catch{}}
   change(root,v=>{const item=v.tasks.find(t=>t.id===id);item.status=status;item.last_error=error;item.last_attempt=now.toISOString();});results.push({id,status,...(error?{error}:{})});
  }
  return {status:results.some(r=>r.status!=='completed')?'partial':'completed',results,remaining:readOfflineTasks(root).tasks.filter(t=>t.status==='pending').length};
 }finally{release();}
}
