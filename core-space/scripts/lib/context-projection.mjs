// context projection
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {assertWithin,safeRelativePath} from './safe-path.mjs';
import {readMemoryMeta} from './memory-meta.mjs';
import {readMemoryProjection} from './memory-projection.mjs';
import {selectMemories,validMemoryDay} from './memory-lifecycle.mjs';
import {projectDuplicates} from './memory-dedup.mjs';
import {loadPrivacyPolicy,privacyDecision} from './privacy-policy.mjs';
import {todayKey,clockSettings} from './day-clock.mjs';
import {responseLanguageInstruction} from './language.mjs';
import {readResponseLanguage} from './language-preference.mjs';
export const CONTEXT_PROJECTION_SCHEMA=1;
export const CONTEXT_COMPLETENESS_SCHEMA=1;
export const DEFAULT_CONTEXT_BUDGETS={ide:32000,hub:16000};
export const SOURCE_ATTRIBUTION_INSTRUCTION='Instructions constrain behavior; their file or protocol identifiers are not automatically citable factual evidence. When a structured output contract supplies an allowed sources list, citation fields may use only identifiers and exact quotes from that list. Do not cite policy, profile, history, or instruction section IDs unless that list includes them. If a required fact is missing, abstain and omit unsupported citations; related background does not establish the missing fact.';
const hash=text=>createHash('sha256').update(text).digest('hex');
export function projectContext(root,{host='ide',project='',at=todayKey(root),budget}={}){
 if(budget===undefined)budget=DEFAULT_CONTEXT_BUDGETS[host];
 if(!['ide','hub'].includes(host)||!Number.isInteger(budget)||budget<1)throw Error("Invalid context host or budget");
 if(!validMemoryDay(at))throw Error("Invalid context date");
 if(project&&(!/^[\p{L}\p{N}_.-]+$/u.test(project)||['.','..'].includes(project)))throw Error("Invalid project identity");
 const sections=[],omitted=[],issues=[];
 const blocked=(code,extra={})=>({schema:1,status:'blocked',code,host,project,at,sections:[],...extra});
 let policy;try{policy=loadPrivacyPolicy(root);}catch{return blocked('context_privacy_unavailable',{issues:[{id:'file:user-space/privacy.yaml',reason:'unreadable'}]});}
 const include=(section,privateCheck=true)=>{if(privateCheck&&privacyDecision(policy,section)==='block'){omitted.push({id:section.id,reason:'privacy'});return;}sections.push(section);};
 function file(rel,kind,{mustExist=false,privacyMayOmit=false}={}){
  const id='file:'+rel;let body;
  try{const path=assertWithin(root,join(root,safeRelativePath(rel)),{rejectLinks:true});body=readFileSync(path,'utf8').trim();}
  catch(error){if(error.code==='ENOENT'&&!mustExist)omitted.push({id,reason:'not-configured'});else issues.push({id,reason:error.code==='ENOENT'?'missing':'unreadable'});return;}
  if(!body){if(mustExist)issues.push({id,reason:'empty'});else omitted.push({id,reason:'not-configured'});return;}
  const section={id,kind,required:true,body,source:{path:rel,sha256:hash(body)}};
  if(!['core-policy','host-protocol'].includes(kind)&&privacyDecision(policy,section)==='block'){
   if(privacyMayOmit)omitted.push({id,reason:'privacy'});else issues.push({id,reason:'privacy'});return;
  }
  sections.push(section);
 }
 file('core-space/policy.md','core-policy',{mustExist:true});file('user-space/values.yaml','personal-rule');
 file('user-space/profile.yaml','profile',{privacyMayOmit:true});
 if(project)file('user-space/projects/'+project+'/project.yaml','project-rule',{mustExist:true});
 if(host==='ide')file('core-space/host-protocol.md','host-protocol',{mustExist:true});
 if(issues.length)return blocked(issues.some(r=>r.reason==='privacy')?'required_context_private':'required_context_unavailable',{issues});
 let responseLanguage;
 try { responseLanguage=readResponseLanguage(root); }
 catch { return blocked('response_language_unavailable',{issues:[{id:'file:user-space/overrides.yaml',reason:'unreadable-or-invalid'}]}); }
 if(existsSync(join(root,'user-space/overrides.yaml'))&&privacyDecision(policy,{id:'file:user-space/overrides.yaml',kind:'response-language',source:{path:'user-space/overrides.yaml'},language:responseLanguage})==='block')return blocked('required_context_private',{issues:[{id:'file:user-space/overrides.yaml',reason:'privacy'}]});
 sections.push({id:'protocol:source-attribution',kind:'evidence-protocol',required:true,body:SOURCE_ATTRIBUTION_INSTRUCTION,source:{path:'core-space/scripts/lib/context-projection.mjs',kind:'builtin',sha256:hash(SOURCE_ATTRIBUTION_INSTRUCTION)}});
 const meta=readMemoryMeta(root);
 const projected=projectDuplicates(readMemoryProjection(root,{meta}),meta).entries;
 const selected=selectMemories(projected,{project,at});omitted.push(...selected.omitted);
 for(const e of selected.entries){
  const required=['preference','instruction'].includes(e.type)||/\/(?:preferences|instructions)\.md$/.test(e.file);
  if(!required)continue;
  include({id:e.id,kind:'memory-rule',required:true,title:e.title,body:e.body,body_hash:e.body_hash,confirmation:e.confirmation,scope:e.scope,projects:e.projects,source:{path:e.file,sha256:e.body_hash},tags:e.tags||[],sensitive:e.sensitive===true});
 }
 const result={schema:1,status:'ready',host,project,at,clock:clockSettings(root),responseLanguage,responseLanguageInstruction:responseLanguageInstruction(responseLanguage),capabilities:{conversation:true,execution:host==='ide'?'host-mediated':'disabled',contextCompleteness:1,responseLanguage:1},sections:sections.filter(s=>s.required),omitted:[],omittedCount:0};
 const size=()=>Buffer.byteLength(JSON.stringify(result)+'\n');
 if(size()>budget)return blocked('required_context_exceeds_budget',{requiredBytes:size(),budget});
 for(const section of sections.filter(s=>!s.required)){result.sections.push(section);if(size()>budget){result.sections.pop();omitted.push({id:section.id,reason:'budget'});}}
 for(const row of omitted){result.omitted.push(row);if(size()>budget){result.omitted.pop();break;}}
 result.omittedCount=omitted.length;

 while(size()>budget&&result.omitted.length)result.omitted.pop();
 if(size()>budget)return blocked('required_context_exceeds_budget',{requiredBytes:size(),budget});
 return result;
}
