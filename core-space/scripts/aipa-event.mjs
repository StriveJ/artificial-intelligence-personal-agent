// event
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';
import { readSessionContext } from './lib/session-context.mjs';
import { appendFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { dayKey } from './lib/time-boundary.mjs';
import { resolveProjectId } from './lib/project.mjs';
import { newDayMark } from './lib/day-boundary.mjs';
import { listEventFiles, appendEvent } from './lib/event-store.mjs';
import { dayStartHour as llmDayStartHour } from './lib/llm-provider.mjs';
import { hostname } from 'node:os';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
function tsLocal(d){return businessTimestamp(root,d);}
const TYPES = new Set(['session_start','user_message','assistant_message','tool_call','tool_result','memory_write','checkpoint','session_end']);
const root=arg('root')||'.';
const cmd=pickCmd(process.argv.slice(2), ['add', 'list', 'tail']);

const dayStartHour = () => llmDayStartHour(root);

function newDayLine(){
  try{
    const p=join(root,'state','last-active-day');
    const prev=existsSync(p)?readFileSync(p,'utf8').trim():'';
    const mark=newDayMark(prev,dayKey(tsLocal(new Date()),dayStartHour()));
    return mark?JSON.stringify({newDay:mark}):'';
  }catch{return '';}
}
if(cmd==='add'){
  const type=arg('type')||'event';
  if(!TYPES.has(type)){console.error('unknown type');process.exit(1);}

  let data=arg('data')||arg('text')||'';
  if(!data){try{data=readFileSync(0,'utf8');}catch{}}
  const MAX=2000;
  if(data.length>MAX){data=data.slice(0,MAX)+` ...[truncated ${data.length} characters]`;}

  if(!data && (type==='user_message'||type==='assistant_message')) console.error(`aipa-event: warning: ${type} has empty data; pass text via --data "<text>" (or --text alias or stdin)`);
  const context=readSessionContext(root,{hostSessionId:arg('host-session-id'),tool:arg('tool'),sid:arg('sid')});
  const sid=arg('sid')||context.sid||'';
  const project=arg('project')||resolveProjectId(arg('cwd')||process.cwd(),root);
  const tool=arg('tool')||context.tool||'';
  const writer=arg('writer')||'protocol';
  if(!['hook','protocol'].includes(writer)){console.error("--writer accepts only hook|protocol");process.exit(1);}
  if(type==='user_message' && writer==='protocol' && context.input_writer==='hook'){
    console.log('owned-by-hook');
    const l=newDayLine();if(l)console.log(l);
    process.exit(0);
  }
  if(!sid) console.error("aipa-event: warning: missing SID; run aipa-session resume or explicitly pass --sid first");
  const now=new Date();
  const rec={ts:now.toISOString(),ts_local:tsLocal(now),type,data};
  if(sid) rec.sid=sid;
  rec.project=project;
  rec.host=hostname();
  if(tool) rec.tool=tool;
  rec.writer=writer;
  if(arg('event-id')) rec.event_id=arg('event-id');
  console.log(appendEvent(root,rec)?'event-added':'dedup-skipped');
  const l=newDayLine(); if(l) console.log(l);
}else if(cmd==='list'||cmd==='tail'){

  const date=arg('date')||dayKey(tsLocal(new Date()),dayStartHour());
  const lines=[];
  for(const f of listEventFiles(root)){
    if(f.day!==date) continue;
    try{lines.push(...readFileSync(f.path,'utf8').trim().split(/\r?\n/).filter(Boolean));}catch{}
  }
  if(cmd==='list') console.log(lines.length?lines.join('\n')+'\n':'');
  else console.log(lines.slice(-Number(arg('n')||'10')).join('\n'));
}
