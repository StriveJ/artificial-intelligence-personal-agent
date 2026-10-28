// memory retention
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertWithin } from './safe-path.mjs';
import { applyDecay, stateFor, DEFAULT_FACTOR } from './memory-decay.mjs';
import {memoryVisibility} from './memory-lifecycle.mjs';

export function activeProjectIds(root) {
  const out=new Set(),dir=join(root,'user-space','projects');
  if(existsSync(dir))for(const name of readdirSync(dir)){
    const path=assertWithin(root,join(dir,name,'project.yaml'),{rejectLinks:true});
    if(existsSync(path)&&/^status:\s*["']?active["']?\s*(?:#.*)?$/m.test(readFileSync(path,'utf8')))out.add(name);
  }
  const context=join(root,'user-space','memory','context.md');
  if(existsSync(context))for(const m of readFileSync(context,'utf8').matchAll(/^##\s+project:([^\s]+)\s*$/gm))out.add(m[1]);
  return out;
}
export function retentionReason(entry,active,{at=new Date().toISOString().slice(0,10)}={}) {
  if(memoryVisibility(entry,{project:entry.projects?.[0]||'',at}))return '';
  if(['revoked','conflicted'].includes(entry.confirmation?.status))return '';
  if(entry.metadata_verified&&entry.pinned===true)return 'pinned';
  if(entry.metadata_verified&&entry.type==='decision'&&entry.confirmation?.status==='user_confirmed'&&entry.decision_exempt!==false)return 'user-confirmed-decision';
  const project=(entry.projects||[]).find(id=>active.has(id));
  return project?'active-project:'+project:'';
}
export function applyRetentionDecay(map,entries,active,today,factor=DEFAULT_FACTOR) {
  const day=String(today).slice(0,10),out={},ordinary={};
  for(const entry of entries){
    const previous=map[entry.id]||{weight:1,since:day,state:'active',uses:0};
    const reason=retentionReason(entry,active,{at:day});
    if(reason){out[entry.id]={...previous,retained:reason,since:day,state:stateFor(previous.weight)};continue;}
    if(previous.retained){const {retained,...rest}=previous;ordinary[entry.id]={...rest,since:day};}
    else ordinary[entry.id]=previous;
  }
  const decayed=applyDecay(ordinary,day,factor);
  return {map:{...decayed.map,...out},keywordIds:decayed.keywordIds};
}
