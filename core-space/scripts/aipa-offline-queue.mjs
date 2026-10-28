// offline queue
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { enqueueOfflineTask,readOfflineTasks,replayOfflineTasks,changeTaskState } from './lib/offline-tasks.mjs';
function arg(name){ const i=process.argv.indexOf('--'+name); return i>=0 ? process.argv[i+1] : ''; }
const root=arg('root')||'.';
const cmd=pickCmd(process.argv.slice(2), ['add', 'list','enqueue','tasks','replay','cancel','retry']);
const path=join(root,'state','pending-queue.md');
if(cmd==='add'){
  const text=arg('text')||'';
  if (!text.trim()) { console.error('missing --text'); process.exit(1); }
  mkdirSync(join(root,'state'),{recursive:true});
  appendFileSync(path, `- [Pending Answer] ${text}\n`, 'utf8');
  console.log("queued: question recorded for later handling in a session. It will not execute automatically or replay when connectivity returns.");
}else if(cmd==='list'){
  console.log(existsSync(path)?readFileSync(path,'utf8'):'');
}
else if(cmd==='enqueue'){
 try{const t=enqueueOfflineTask(root,{id:arg('id'),kind:arg('kind'),expires:arg('expires'),payload:arg('payload')?JSON.parse(arg('payload')):{}});console.log(JSON.stringify(t));}catch(error){console.error(error.message);process.exitCode=1;}
}else if(cmd==='tasks'){try{console.log(JSON.stringify(readOfflineTasks(root),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
else if(cmd==='cancel'||cmd==='retry'){try{console.log(JSON.stringify(changeTaskState(root,arg('id'),cmd==='cancel'?'cancelled':'pending')));}catch(error){console.error(error.message);process.exitCode=1;}}
else if(cmd==='replay'){try{console.log(JSON.stringify(await replayOfflineTasks(root,{apply:process.argv.includes('--apply'),limit:Number(arg('limit')||3)}),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
else { console.error("usage: add --text <question> | list | enqueue --id <id> --kind <kind> --expires <ISO> | tasks | replay [--apply] | cancel/retry --id <id>"); process.exit(1); }
