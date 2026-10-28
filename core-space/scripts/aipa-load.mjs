// load
import { readFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { assertWithin,safeRelativePath } from './lib/safe-path.mjs';
import { appendLocalLog } from './lib/local-log.mjs';
import { todayKey } from './lib/day-clock.mjs';
import { readSessionContext } from './lib/session-context.mjs';
import {projectContext} from './lib/context-projection.mjs';
import {coreDiagnostics} from './lib/support-contract.mjs';
import {strictArgs} from './lib/strict-args.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
try{
 if(process.argv.includes('--diagnostics')){
  const options=strictArgs(process.argv.slice(2),{flags:['diagnostics'],values:['root']});
  if(!options.root)throw Error("Metadata diagnostics require explicit --root");
  const result=coreDiagnostics(resolve(options.root));console.log(JSON.stringify(result));process.exitCode=result.status==='blocked'?2:0;process.exit();
 }
 if(process.argv.includes('--context')){
  if(!arg('root'))throw Error("Structured context requires explicit --root");
  const result=projectContext(resolve(arg('root')),{host:arg('host')||'ide',project:arg('project'),...(arg('at')?{at:arg('at')}:{}),...(arg('budget')?{budget:Number(arg('budget'))}:{})});
  console.log(JSON.stringify(result));if(result.status==='blocked')process.exitCode=2;else process.exitCode=0;process.exit();
 }
 const root=resolve(arg('root')||'.'),file=safeRelativePath(arg('file'));
 const path=assertWithin(root,join(root,file),{rejectLinks:true}),bytes=readFileSync(path);
 const context=readSessionContext(root,{sid:arg('sid'),hostSessionId:arg('host-session-id'),tool:arg('tool')});
 const from=arg('from-line')?Number(arg('from-line')):1,to=arg('to-line')?Number(arg('to-line')):null;
 if(!Number.isInteger(from)||from<1||(to!==null&&(!Number.isInteger(to)||to<from)))throw new Error("Line bounds must be positive integers, with to-line >= from-line");
 const shown=(from!==1||to!==null)?Buffer.from(bytes.toString('utf8').split(/(?<=\n)/).slice(from-1,to??undefined).join('')):bytes;
 appendLocalLog(root,{shard:'file-loads.jsonl',legacy:'state/file-loads.jsonl'},{event_id:randomUUID(),ts:new Date().toISOString(),day:todayKey(root),sid:context.sid||'',project:arg('project'),file,from_line:from,to_line:to,bytes:shown.length,read_bytes:bytes.length,sha256:createHash('sha256').update(shown).digest('hex'),observed:'read_completed',source:'aipa-load'});
 process.stdout.write(shown);
}catch(error){console.error("File load failed: "+error.message);process.exitCode=1;}
