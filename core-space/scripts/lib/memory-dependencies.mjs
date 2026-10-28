// memory dependencies
import {readMemoryMeta,bodyHash} from './memory-meta.mjs';
import {readMemoryProjection} from './memory-projection.mjs';
import {selectMemories} from './memory-lifecycle.mjs';
import {projectDuplicates} from './memory-dedup.mjs';
export function currentMemories(root,{project='',at}={}){
 const meta=readMemoryMeta(root);
 return selectMemories(projectDuplicates(readMemoryProjection(root,{meta}),meta).entries,{project,at}).entries;
}
function proof(e){return {id:e.id,body_hash:e.body_hash,semantic_hash:bodyHash(JSON.stringify([e.type||'text',e.confirmation,e.scope,e.projects,e.valid_from,e.valid_until,e.tags||[],e.sensitive===true,e.supersedes||[],e.supersedes_hashes||{}]))};}
export function memoryDependencies(root,ids,{project='',at}={}){
 if(ids===undefined)return {schema:1,complete:false,project,at,entries:[]};
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw Error("evidence_ids must be an array of memory IDs");
 const byId=new Map(currentMemories(root,{project,at}).map(e=>[e.id,e]));
 const entries=[...new Set(ids)].map(id=>{if(!byId.has(id))throw Error("Derived material cites invalidated or unknown memories");return proof(byId.get(id));});
 return {schema:1,complete:true,project,at,entries};
}
export function dependenciesCurrent(root,receipt,{project='',at}={}){
 if(receipt?.schema!==1||receipt.complete!==true||receipt.project!==project||!Array.isArray(receipt.entries))return false;
 try{return JSON.stringify(memoryDependencies(root,receipt.entries.map(e=>e.id),{project,at}).entries)===JSON.stringify(receipt.entries);}catch{return false;}
}
