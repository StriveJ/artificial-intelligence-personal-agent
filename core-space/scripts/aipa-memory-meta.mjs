// memory meta
import { execFileSync } from 'node:child_process';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMemoryIndex } from './lib/memory-index-store.mjs';
import { bindMemoryMeta,readMemoryMeta,resolveEvidence,confirmationFor,bodyHash } from './lib/memory-meta.mjs';
import { todayKey } from './lib/day-clock.mjs';
import { VALID_TYPES } from './lib/candidates.mjs';
import { recordGrowth } from './lib/growth-feedback.mjs';
import { updateDecayState } from './lib/memory-decay-store.mjs';
import { readMemorySources,memoryRecords } from './lib/memory-source.mjs';
import {loadPrivacyPolicy} from './lib/privacy-policy.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root')||'.',id=arg('id'),reason=arg('reason'),byUser=process.argv.includes('--by-user');
try{
  if(arg('feedback')){
    const result=recordGrowth(root,{kind:arg('feedback'),target:id||arg('target'),eventId:arg('event-id'),reason,byUser,project:arg('project'),sid:arg('sid'),undoId:arg('undo-id')});
    console.log(JSON.stringify({status:'recorded',event:result}));process.exit(0);
  }
  const index=readMemoryIndex(root,{strict:true}),e=index.entries.find(e=>e.id===id);
  if(!e)throw new Error("entry not found; rebuild the index and choose a real ID first");
  const source=memoryRecords(readMemorySources(root)).find(row=>row.id===id);
  if(!source||source.body!==e.body)throw new Error("Indexed content is stale; rebuild the index and select a real ID before confirming. Do not confirm stale content.");
  if(process.argv.includes('--preview')){
    if(['--pin','--confirm','--revoke','--revive','--type','--projects','--tags','--decision-exempt','--scope','--valid-from','--valid-until','--supersedes','--clear-supersedes'].some(flag=>process.argv.includes(flag)))throw new Error("Metadata preview cannot include mutation actions");
    console.log(JSON.stringify({status:'preview',id,file:e.file,metadata:readMemoryMeta(root).entries[id]||null,body_current:true}));process.exit(0);
  }
  const old=readMemoryMeta(root).entries[id]||{},patch={};
  const refs=arg('evidence')?JSON.parse(arg('evidence')):null;
  const evidence=refs?resolveEvidence(root,refs):(old.provenance||[]);
  if(refs)patch.provenance=evidence;
  if(arg('type')){if(!VALID_TYPES.includes(arg('type'))&&!['text'].includes(arg('type')))throw new Error('invalid type');patch.type=arg('type');}
  if(arg('projects')){if(!byUser||!reason.trim())throw Error("Changing project membership requires explicit user action and --reason");patch.projects=arg('projects').split(',').filter(Boolean);if(patch.projects.some(p=>!/^[\p{L}\p{N}_.-]+$/u.test(p)))throw new Error("Invalid project ID");}
  if(arg('tags'))patch.tags=arg('tags').split(',').filter(Boolean);
  if(patch.tags){const protectedTags=loadPrivacyPolicy(root).tags,previous=old.tags||e.tags||[];if(previous.some(tag=>protectedTags.includes(tag)&&!patch.tags.includes(tag))&&(!byUser||!reason.trim()))throw Error("Removing privacy tags requires explicit user action and --reason");}
  if(['scope','valid-from','valid-until','supersedes','clear-supersedes'].some(key=>process.argv.includes('--'+key))){
    if(!byUser||!reason.trim())throw Error("Lifecycle changes require explicit user action and --reason");
    patch.lifecycle_schema=1;
    if(arg('scope'))patch.scope=arg('scope');
    for(const [option,key] of [['valid-from','valid_from'],['valid-until','valid_until']])if(process.argv.includes('--'+option))patch[key]=arg(option)==='none'?'':arg(option);
    if(arg('supersedes')){
      if(!process.argv.includes('--confirm')&&old.confirmation?.status!=='user_confirmed')throw Error("Supersession requires confirming the new fact first, or also passing --confirm");
      const all=memoryRecords(readMemorySources(root));patch.supersedes=[...new Set(arg('supersedes').split(','))];patch.supersedes_hashes={};
      for(const target of patch.supersedes){const found=all.find(row=>row.id===target);if(!found)throw Error("Superseded target does not exist");patch.supersedes_hashes[target]=bodyHash(found.body);}
    }
    if(process.argv.includes('--clear-supersedes')){patch.supersedes=[];patch.supersedes_hashes={};}
  }
  if(process.argv.includes('--pin')){if(!byUser||!reason)throw new Error("Changing pin requires explicit user action and --reason");if(!['true','false'].includes(arg('pin')))throw new Error("--pin accepts true|false");patch.pinned=arg('pin')==='true';}
  if(process.argv.includes('--decision-exempt')){if(!byUser||!reason||!['true','false'].includes(arg('decision-exempt')))throw new Error("decision-exempt requires explicit user action, reason and true|false");patch.decision_exempt=arg('decision-exempt')==='true';}
  if(process.argv.includes('--confirm'))patch.confirmation=confirmationFor(evidence,{byUser,reason,day:todayKey(root)});
  if(process.argv.includes('--revoke')){if(!byUser||!reason)throw new Error("Withdrawal requires explicit user action and --reason");patch.confirmation={status:'revoked',actor:'user',date:todayKey(root),reason};patch.pinned=false;}
  if(process.argv.includes('--revive')){if(!byUser||!reason)throw new Error("Restoration requires explicit user action and reason");patch.confirmation=confirmationFor(evidence,{byUser,reason,day:todayKey(root)});}
  if(!Object.keys(patch).length)throw new Error("No metadata action specified");
  const result=bindMemoryMeta(root,e,patch,{actor:byUser?'user':'model',reason});
  if(process.argv.includes('--revive'))updateDecayState(root,map=>({...map,[id]:{...(map[id]||{}),weight:1,since:todayKey(root),state:'active'}}));
  if(process.argv.includes('--revoke'))recordGrowth(root,{kind:'corrected',target:id,eventId:arg('event-id'),reason,byUser});
  execFileSync(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'aipa-index.mjs'),'--root',root],{stdio:'pipe'});
  console.log(JSON.stringify({id,status:'updated',confirmation:result.confirmation||{status:'observed'}}));
}catch(error){console.error(error.message);process.exitCode=1;}
