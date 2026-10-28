// checkpoint
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';
import { readSessionContext } from './lib/session-context.mjs';
import { atomicWriteFile } from './lib/atomic-write.mjs';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { dayKey } from './lib/time-boundary.mjs';
import { resolveProjectId } from './lib/project.mjs';
import { appendEvent,readEvents } from './lib/event-store.mjs';
import { dayStartHour as llmDayStartHour } from './lib/llm-provider.mjs';
import { hostname } from 'node:os';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
function tsLocal(d){return businessTimestamp(root,d);}
const root=arg('root')||'.';
const cmd=pickCmd(process.argv.slice(2), ['get', 'set']);
const stateDir=join(root,'state');
const ckPath=join(stateDir,'session-checkpoint.md');

const dayStartHour = () => llmDayStartHour(root);
if(cmd==='get'){
  if(arg('sid')||arg('host-session-id')){
    const context=readSessionContext(root,{hostSessionId:arg('host-session-id'),tool:arg('tool'),sid:arg('sid')});
    const latest=readEvents(root).filter(e=>e.type==='checkpoint'&&e.sid===(arg('sid')||context.sid)).slice(-1)[0];
    console.log(latest?.checkpoint_text||latest?.data||'');process.exit(0);
  }
  console.log(existsSync(ckPath)?readFileSync(ckPath,'utf8'):'');
  process.exit(0);
}
const text=arg('text')||'';
const intent=arg('intent')||'';
const progress=arg('progress')||'';
const next=arg('next')||'';
const now=new Date();
let body="# Session Checkpoint\n";
body+=`## Time: ${tsLocal(now)}\n`;
if(intent) body+=`## Current Intent: ${intent}\n`;
if(progress) body+=`## Progress
${progress.split(';').filter(Boolean).map(p=>`- [ ] ${p}`).join('\n')}\n`;
if(next) body+=`## Next Steps
${next.split(';').filter(Boolean).map(p=>`- ${p}`).join('\n')}\n`;
if(!intent&&!progress&&!next&&text) body+=`- ${text}\n`;
mkdirSync(stateDir,{recursive:true});

const data=intent||progress||next||text;
const project=arg('project')||resolveProjectId(arg('cwd')||process.cwd(),root);
const context=readSessionContext(root,{hostSessionId:arg('host-session-id'),tool:arg('tool'),sid:arg('sid')});
const sid=arg('sid')||context.sid||'';
const tool=arg('tool')||context.tool||'';
if(!sid) console.error("aipa-checkpoint: warning: missing SID; run resume or pass --sid first. Checkpoint will not invent a session association.");
body+=`## Session: ${sid||"(unknown)"}
## Project: ${project}
`;
if(tool) body+=`## Host: ${tool}
`;
atomicWriteFile(ckPath,body);
const rec={ts:now.toISOString(),ts_local:tsLocal(now),type:'checkpoint',data,checkpoint_text:body,project,host:hostname()};
if(sid) rec.sid=sid;
if(tool) rec.tool=tool;
appendEvent(root,rec);
console.log('checkpoint-set');
