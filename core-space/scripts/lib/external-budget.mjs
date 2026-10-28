// external budget
import { existsSync,readFileSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWriteFile } from './atomic-write.mjs';
import { acquireFileLock } from './file-lock.mjs';
import { todayKey } from './day-clock.mjs';
import { assertWithin } from './safe-path.mjs';
import { appendError } from './error-sink.mjs';
import { BUDGET_PRIVATE_PATHS,runtimeIgnoreStatuses } from './runtime-state-policy.mjs';
import { assertNoActiveInstall } from './install-maintenance.mjs';
export const EXTERNAL_LIMITS={judge:0,summarize:20,expand:40,global:50,background:10,inflight:1,max_attempts:2,timeout_ms:120000};
function privateBudget(root){
 assertNoActiveInstall(root);
 for(const row of runtimeIgnoreStatuses(root,BUDGET_PRIVATE_PATHS)){
  if(row.status!=='unknown'&&(row.tracked||!row.ignored))throw new Error("External private metering file is tracked or not ignored: "+row.path+"; review .gitignore and untrack it first. Metering state must not be copied across devices.");
 }
}
const pathOf=root=>{privateBudget(root);return assertWithin(root,join(root,'state','external-budget.json'),{rejectLinks:true});},cancelOf=root=>assertWithin(root,join(root,'state','external-cancel.json'),{rejectLinks:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function read(root){
 const path=pathOf(root);if(!existsSync(path))return {version:1,days:{},inflight:null};
 const v=JSON.parse(readFileSync(path,'utf8'));
 if(v?.version!==1||!v.days||typeof v.days!=='object'||Array.isArray(v.days))throw new Error("External metering state is corrupt; new requests refused");
 for(const day of Object.values(v.days))if(!day||['total','background','judge','summarize','expand'].some(k=>!Number.isInteger(day[k])||day[k]<0))throw new Error("External usage is missing or invalid; new requests refused");
 if(v.inflight&&(!v.inflight.id||!Number.isInteger(v.inflight.pid)))throw new Error("Invalid external in-flight record");
 return v;
}
function change(root,fn){const release=acquireFileLock(pathOf(root)+'.lock');try{const v=read(root),result=fn(v);atomicWriteFile(pathOf(root),JSON.stringify(v,null,2)+'\n');return result;}finally{release();}}
function alive(pid){try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
export function budgetStatus(root){const v=read(root),day=todayKey(root);return {scope:'per-device-instance',cross_device_guarantee:false,unit:'external-request-attempts',day,limits:EXTERNAL_LIMITS,used:v.days[day]||{total:0,background:0,judge:0,summarize:0,expand:0},inflight:v.inflight};}

async function reserve(root,cmd,background){
 if(!(cmd in EXTERNAL_LIMITS)||!['judge','summarize','expand'].includes(cmd))throw new Error("Unsupported model command family");
 if(EXTERNAL_LIMITS[cmd]===0)throw new Error(cmd+" has an external daily budget of 0; retain host");
 const until=Date.now()+3000;
 while(true){
  let result;
  try{result=change(root,v=>{
   if(v.inflight&&!alive(v.inflight.pid)){v.inflight=null;appendError(root,{scope:'external-budget',ts:new Date().toISOString(),message:"Original request process exited; call remains counted. Residual in-flight record released."});}
   if(v.inflight){
    if(!background&&v.inflight.background){atomicWriteFile(cancelOf(root),JSON.stringify({id:v.inflight.id}));return null;}
    throw new Error("An external request is already in flight; new request refused (in-flight limit: 1)");
   }
   const day=todayKey(root),used=v.days[day]||{total:0,background:0,judge:0,summarize:0,expand:0};
   if(used.total>=EXTERNAL_LIMITS.global||used[cmd]>=EXTERNAL_LIMITS[cmd]||(background&&used.background>=EXTERNAL_LIMITS.background))throw new Error("External daily budget exhausted: "+cmd);
   used.total++;used[cmd]++;if(background)used.background++;v.days[day]=used;
   const ticket={id:randomUUID(),pid:process.pid,cmd,day,background,at:new Date().toISOString()};v.inflight=ticket;return ticket;
  });}catch(error){if(error.code==='ELOCKED'&&Date.now()<until){await sleep(75);continue;}throw error;}
  if(result)return result;
  if(Date.now()>=until)throw new Error("Background request has not released its slot; foreground falls back to host without stealing it");
  await sleep(75);
 }
}
export async function externalAttempt(root,{cmd,background=false,timeoutMs=EXTERNAL_LIMITS.timeout_ms},call){
 const ticket=await reserve(root,cmd,background),controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(new Error("External request timed out")),timeoutMs);
 const monitor=background?setInterval(()=>{try{if(JSON.parse(readFileSync(cancelOf(root),'utf8')).id===ticket.id)controller.abort(new Error("Foreground cancelled background request"));}catch(error){if(error.code!=='ENOENT')controller.abort(new Error("Cannot read cancellation state"));}},75):null;
 let outcome='failed';
 try{const result=await call(controller.signal);outcome='completed';return result;}
 catch(error){error.externalIssued=true;try{appendError(root,{scope:'external-budget:attempt',ts:new Date().toISOString(),message:cmd+" attempt failed; one call counted: "+error.message});}catch{}throw error;}
 finally{
  clearTimeout(timer);if(monitor)clearInterval(monitor);

  let released=false;
  for(let i=0;i<40&&!released;i++){
   try{change(root,v=>{if(v.inflight?.id!==ticket.id)throw new Error("External in-flight owner mismatch; release refused");v.inflight=null;v.days[ticket.day].last_attempt={id:ticket.id,cmd,outcome,at:new Date().toISOString()};if(existsSync(cancelOf(root))&&JSON.parse(readFileSync(cancelOf(root),'utf8')).id===ticket.id)unlinkSync(cancelOf(root));});released=true;}
   catch(error){if(error.code==='ELOCKED'){await sleep(75);continue;}appendError(root,{scope:'external-budget',ts:new Date().toISOString(),message:"Metering-state release failed; one call counted: "+error.message});throw error;}
  }
  if(!released)throw new Error("External slot release failed; one call was counted. Review the metering lock.");
 }
}
