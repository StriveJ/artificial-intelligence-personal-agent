// distill
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';
import { createHash } from 'node:crypto';
import { resolveEvidence } from './lib/memory-meta.mjs';
import { pickCmd, pickPositional } from './lib/argv.mjs';
import { VALID_TYPES, SKILL_SCOPES } from './lib/candidates.mjs';
import { nextDistillIdFor, readOwnDistill, updateOwnDistill } from './lib/distill-store.mjs';
import { confirmDistill } from './lib/distill-confirm.mjs';
import { recoverMemoryFiles } from './lib/memory-transaction.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
function tsLocal(d){return businessTimestamp(root,d);}
const root=arg('root')||'.',cmd=pickCmd(process.argv.slice(2),['add','list','confirm','discard','status']);
const json=process.argv.includes('--json'),operationId=arg('operation')||'';
function output(value,legacy){console.log(json?JSON.stringify(value):legacy);}
try{
  if(operationId&&(!/^[a-zA-Z0-9_-]{1,128}$/.test(operationId)||['__proto__','constructor','prototype'].includes(operationId)))throw Error("Invalid operation-id");
  if(cmd==='add'){
    const type=arg('type'),text=(arg('text')||'').trim();
    if(!VALID_TYPES.includes(type))throw Error('invalid type');
    if(!text)throw Error('missing --text');
    const entry={ts_local:tsLocal(new Date()),type,tier:['skill','decision','instruction'].includes(type)?'confirm':'auto',text};
    if(arg('priority')!==''){const n=Number(arg('priority'));if(!Number.isFinite(n))throw Error('invalid priority');entry.priority=Math.min(100,Math.max(0,Math.round(n)));}
    entry.provenance=arg('evidence')?resolveEvidence(root,JSON.parse(arg('evidence'))):[];
    entry.reason=arg('reason')||'';entry.projects=arg('project')?[arg('project')]:[];entry.tags=arg('tags')?arg('tags').split(',').filter(Boolean):[];
    if(type==='skill'){
      const name=arg('name'),scope=arg('scope'),desc=arg('desc');
      if(!name||!scope||!desc)throw Error("skill requires --name --scope --desc");
      if(!SKILL_SCOPES.includes(scope)||!/^[a-z0-9-]+$/.test(name))throw Error('invalid scope/name');
      Object.assign(entry,{name,scope,desc});
    }
    const fingerprint=createHash('sha256').update(JSON.stringify([type,text,entry.projects,entry.tags,entry.provenance,entry.scope,entry.name,entry.desc])).digest('hex');
    const result=updateOwnDistill(root,data=>{
      data.operations||={};
      const previous=operationId?data.operations[operationId]:null;
      if(previous){if(previous.fingerprint!==fingerprint)throw Error("Conflicting content for the same operation-id");return {...previous,replayed:true};}
      const duplicate=data.entries.find(e=>e.type===type&&(e.text||'').trim().toLowerCase()===text.toLowerCase()&&JSON.stringify(e.projects||[])===JSON.stringify(entry.projects));
      const id=duplicate?.id||nextDistillIdFor(root,[...data.entries,{id:data.lastIssued||''},...Object.values(data.operations)]);
      if(!duplicate){entry.id=id;data.entries.push(entry);data.lastIssued=id;}
      const receipt={id,status:'queued',fingerprint,...(duplicate?{duplicate:true}:{})};
      if(operationId)data.operations[operationId]=receipt;
      return receipt;
    });
    output(result,result.duplicate||result.replayed?'duplicate':result.id);
  }else if(cmd==='status'){
    if(!operationId)throw Error("status requires --operation");
    const data=readOwnDistill(root),receipt=data.operations?.[operationId];
    const result=receipt?{...receipt,status:receipt.status==='queued'&&!data.entries.some(e=>e.id===receipt.id)?'unknown':receipt.status}:{status:'not-found'};
    output(result,result.id||result.status);
  }else if(cmd==='list'){
    const data=readOwnDistill(root),entries=data.entries.slice().sort((a,b)=>(b.priority??-1)-(a.priority??-1));
    if(json)console.log(JSON.stringify({entries}));else for(const e of entries)console.log(e.id+' ['+e.tier+'] '+e.type+(e.priority!=null?' ('+e.priority+')':'')+': '+e.text);
  }else if(cmd==='confirm'){
    if(process.argv.includes('--recover')){const result=recoverMemoryFiles(root);output(result,result.status);}
    else{
      const auto=process.argv.includes('--auto'),id=arg('id')||pickPositional(process.argv.slice(2),{skipFirst:cmd});
      if(!auto&&!id)throw Error('missing --id');
      const message=confirmDistill(root,{id,auto,byUser:process.argv.includes('--by-user'),reason:arg('reason')||''});
      output({status:message},message);
    }
  }else if(cmd==='discard'){
    const id=arg('id')||pickPositional(process.argv.slice(2),{skipFirst:cmd});if(!id)throw Error('missing --id');
    updateOwnDistill(root,data=>{const index=data.entries.findIndex(e=>e.id===id);if(index<0)throw Error('not found');data.entries.splice(index,1);for(const operation of Object.values(data.operations||{}))if(operation.id===id)operation.status='discarded';});
    output({status:'discarded'},'discarded');
  }else throw Error('usage: add | list | confirm | discard | status');
}catch(error){console.error(error.message);process.exitCode=1;}
