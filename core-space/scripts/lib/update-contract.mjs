// update contract
import { existsSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import {assertWithin} from './safe-path.mjs';
export const UPDATE_CONTRACT = {schema:1,min_node:18,capabilities:['memory-revocation-v1','memory-conflicts-v1','distill-operations-v1','durable-dedup-v1','confirmed-decision-v1','explicit-project-v1','external-budget-v1','offline-tasks-v1','session-binding-v1','memory-lifecycle-v1','context-projection-v1','context-completeness-v1','business-clock-v1','event-identity-v1','memory-usage-receipts-v1','agenda-provider-v1','memory-index-history-v1'],formats:{'user-space/memory/memory-meta.json':1,'state/session-context.json':1,'state/external-budget.json':1,'state/offline-tasks.json':1,'state/memory-usage-receipts.json':1}};
const contractDeclaration=text=>text.match(/^export const UPDATE_CONTRACT = ([^\r\n]+);\r?$/m)?.[1];

const COORDINATOR_DECLARATION=contractDeclaration(readFileSync(new URL(import.meta.url),'utf8'));

export function frameworkPreflight(root,target){
 const reasons=[],readPaths=[];
 for(const rel of ['core-space/scripts/lib/hub-agenda-capability.json','core-space/scripts/lib/agenda-interface.json']){
  const path=assertWithin(root,join(root,rel),{rejectLinks:true});if(!existsSync(path))continue;
  readPaths.push(rel);let value;try{value=JSON.parse(readFileSync(path,'utf8'));}catch{reasons.push(rel+" cannot be parsed");continue;}
  if(rel.includes('hub-agenda-capability'))reasons.push("Hub agenda overlay detected. Validate a synthetic combination or remove it through the integration restorer first; do not overwrite and relabel it as an upstream baseline.");
  else if(value.version!==1||!target?.capabilities?.includes('agenda-provider-v1'))reasons.push("Target does not support the installed native agenda-provider interface");
 }
 if(!target)reasons.push("Target lacks a compatibility declaration");
 return {compatible:reasons.length===0,reasons,readPaths,dataCompatibility:'not-checked',installationAllowed:false};
}

export function frameworkCompatibilityReport(root,target){
 const preflight=frameworkPreflight(root,target),reasons=[...preflight.reasons];
 const installedPath='core-space/scripts/lib/update-contract.mjs';let installedContract='not-installed';
 const current=assertWithin(root,join(root,installedPath),{rejectLinks:true});
 if(existsSync(current)){
  preflight.readPaths.push(installedPath);
  const installed=contractDeclaration(readFileSync(current,'utf8'));
  installedContract=installed&&installed===COORDINATOR_DECLARATION?'matching-coordinator':'unknown';
 }else if(existsSync(assertWithin(root,join(root,'core-space'),{rejectLinks:true})))installedContract='unknown';
 if(installedContract==='unknown')reasons.push("Installed Core contract generation cannot be verified by this coordinator. Framework-only mode refuses to guess newer formats or legacy capabilities.");
 if(target){
  if(Number(process.versions.node.split('.')[0])<target.min_node)reasons.push("Node version is below the target requirement");
  for(const capability of UPDATE_CONTRACT.capabilities)if(!target.capabilities?.includes(capability))reasons.push("Framework-only installation lacks behaviors: "+capability);
  for(const [path,version] of Object.entries(UPDATE_CONTRACT.formats))if(target.formats?.[path]!==version)reasons.push("Framework-only installation has incompatible formats: "+path);
 }
 return {compatible:reasons.length===0,reasons,readPaths:preflight.readPaths,installedContract,dataCompatibility:'contract-superset',personalDataInspected:false};
}
export function readUpdateContract(root){
 const p=join(root,'update-contract.json');if(!existsSync(p))return null;
 const v=JSON.parse(readFileSync(p,'utf8'));
 if(v.schema!==1||!Number.isInteger(v.min_node)||v.min_node<1||!Array.isArray(v.capabilities)||v.capabilities.some(x=>typeof x!=='string')||!v.formats||typeof v.formats!=='object'||Array.isArray(v.formats)||Object.values(v.formats).some(x=>!Number.isInteger(x)||x<1)||!Array.isArray(v.executables)||v.executables.some(x=>typeof x!=='string'))throw new Error("Invalid update compatibility declaration");
 return v;
}
export function compatibilityReport(root,target,{downgrade=false}={}){
 const reasons=frameworkPreflight(root,target).reasons;
 if(!target)return {compatible:false,reasons:["Target lacks a compatibility declaration; named isolated acceptance is required, with no automatic installation"]};
 if(Number(process.versions.node.split('.')[0])<target.min_node)reasons.push("Node version is below the target requirement");
 for(const [rel,version] of Object.entries(UPDATE_CONTRACT.formats)){
  const path=join(root,rel);if(!existsSync(path))continue;
  const data=JSON.parse(readFileSync(path,'utf8'));
  if(data.version!==version||target.formats[rel]!==version)reasons.push(rel+" format is incompatible or unknown");
  const needed=rel.includes('memory-meta')?['memory-revocation-v1','confirmed-decision-v1','explicit-project-v1']:rel.includes('session-context')?['session-binding-v1']:rel.includes('external-budget')?['external-budget-v1']:rel.includes('memory-usage-receipts')?['memory-usage-receipts-v1']:['offline-tasks-v1'];
  if(rel.includes('memory-meta')){
   if(Object.values(data.entries||{}).some(e=>e.confirmation?.status==='conflicted'))needed.push('memory-conflicts-v1');
   if(Object.values(data.entries||{}).some(e=>e.duplicate_of))needed.push('durable-dedup-v1');
   if(Object.values(data.entries||{}).some(e=>e.scope||e.valid_from||e.valid_until||e.supersedes?.length))needed.push('memory-lifecycle-v1');
  }
  for(const capability of needed)if(!target.capabilities.includes(capability))reasons.push(rel+" lacks behaviors: "+capability);
 }

 if(downgrade)for(const capability of UPDATE_CONTRACT.capabilities)if(!target.capabilities.includes(capability))reasons.push("Downgrade lacks behaviors: "+capability);
 return {compatible:reasons.length===0,reasons};
}
