// session
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';
import { resumeSession,readSessionContext,markSessionStartRecorded } from './lib/session-context.mjs';
import { dayStartHour as sharedDayStartHour } from './lib/day-clock.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { dayKey } from './lib/time-boundary.mjs';
import { crossDayNotice } from './lib/day-boundary.mjs';
import { resolveProjectId } from './lib/project.mjs';
import { readEvents, readEventsByHost, appendEvent } from './lib/event-store.mjs';
import { dueVerdict, findGaps, applyAck, recordAnswer } from './lib/continuity.mjs';
import { hostname } from 'node:os';
import { detectTool } from './lib/tool-detect.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
function tsLocal(d){return businessTimestamp(root,d);}
const root=arg('root')||'.';
const cmd=pickCmd(process.argv.slice(2), ['resume','due','gaps','gap-answer']);
const stateDir=join(root,'state');
const ackPath=join(stateDir,'continuity-ack.json');
function readAck(){try{const v=JSON.parse(readFileSync(ackPath,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
function writeAck(v){mkdirSync(stateDir,{recursive:true});writeFileSync(ackPath,JSON.stringify(v,null,2)+'\n','utf8');}
const checkpointPath=join(stateDir,'session-checkpoint.md');
const resumePath=join(stateDir,'resume-prompt.md');
const currentSidPath=join(stateDir,'current-sid');
const currentToolPath=join(stateDir,'current-tool');

const dayStartHour = () => sharedDayStartHour(root);

function allEvents(){
  return readEvents(root);
}

if(cmd==='resume'){
  const now=new Date();

  const project=arg('project')||resolveProjectId(arg('cwd')||process.cwd(),root);
  let tool=arg('tool')||'';
  if(!tool){
    const detection=detectTool();
    if(detection.status==='ok') tool=detection.tool;
  }
  const context=resumeSession(root,{hostSessionId:arg('host-session-id'),sid:arg('sid'),tool,project,newSession:process.argv.includes('--new'),inputWriter:arg('input-writer')||'protocol'});
  const sid=context.sid;
  if(!context.start_recorded){
    const started=new Date(context.started);
    const rec={ts:started.toISOString(),ts_local:tsLocal(started),sid,project:context.started_project,host:hostname(),type:'session_start',data:'resume',event_id:'session-start:'+sid};
    if(context.tool) rec.tool=context.tool;
    appendEvent(root,rec);
    markSessionStartRecorded(root,sid);
  }

  const projEvents=allEvents().filter(e=>e.project===project && !(e.sid===sid&&e.type==='session_start'));

  const myHost=hostname();
  const hasLocal=projEvents.some(e=>e.host===myHost && !(e.sid===sid&&e.type==='session_start'));
  const ownEvents=projEvents.filter(e=>e.sid===sid);
  const chosen=ownEvents.length?ownEvents:hasLocal?projEvents.filter(e=>e.host===myHost):projEvents;
  const tail=chosen.slice(-20);
  const lastCk=chosen.filter(e=>e.type==='checkpoint').slice(-1)[0];
  let prompt='';
  if(lastCk||tail.length){
    prompt+=`Previous session recovery hint (project: ${project}, source: ${hasLocal?`this device ${myHost}${tool?` · ${tool}`:''}`:"other device/history"}): \n`;
    if(lastCk)prompt+=`- Previous checkpoint [${lastCk.ts_local||lastCk.ts}]: ${lastCk.checkpoint_text||lastCk.data||''}\n`;
    if(tail.length){
      prompt+="\nRecent events:\n";
      for(const e of tail){if(e.type==='session_start'&&e.sid===sid)continue;prompt+=`- [${e.ts_local||e.ts}] ${e.type}${e.data?': '+e.data:''}\n`;}
    }
  }else{
    prompt="(no historical sessions for this project)";
  }

  const lastActiveDay=existsSync(join(stateDir,'last-active-day'))?readFileSync(join(stateDir,'last-active-day'),'utf8').trim():'';
  const notice=crossDayNotice(lastActiveDay,dayKey(tsLocal(now),dayStartHour()));
  if(notice) prompt=`${notice}\n\n${prompt}`;
  writeFileSync(resumePath,prompt,'utf8');
  console.log(process.argv.includes('--json')?JSON.stringify({sid,project,tool:context.tool,input_writer:context.input_writer,prompt}):prompt);
}
else if(cmd==='due'){
  const sid=arg('sid')||readSessionContext(root,{hostSessionId:arg('host-session-id'),tool:arg('tool')}).sid||'';
  const threshold=Number(arg('threshold')||300);
  console.log(JSON.stringify(dueVerdict(allEvents(),sid,threshold)));
}
else if(cmd==='gaps'){
  const minMinutes=Number(arg('min-minutes')||30);
  const days=Number(arg('days')||2);
  const found=findGaps(readEventsByHost(root),{dayStartHour:dayStartHour(),minMinutes,days});
  console.log(JSON.stringify({items:applyAck(found,readAck())}));
}
else if(cmd==='gap-answer'){
  const id=arg('id');
  if(!id){console.error("Missing --id");process.exit(1);}
  const answer=arg('answer')||null;
  if(answer&&answer!=='alive'&&answer!=='dead'){console.error("--answer accepts only alive|dead");process.exit(1);}
  writeAck(recordAnswer(readAck(),id,answer));
  console.log(JSON.stringify({ok:true,id,answer:answer||'unanswered'}));
}
else{console.error('usage: resume | due | gaps | gap-answer');process.exit(1);}
