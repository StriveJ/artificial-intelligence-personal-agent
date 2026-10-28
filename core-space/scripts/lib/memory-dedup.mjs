// memory dedup
import { bodyHash } from './memory-meta.mjs';
export const duplicateSignature = entry => {
 const parts=[entry.file,entry.type||'text',[...(entry.projects||[])].sort(),entry.scope||'global',entry.valid_from||'',entry.valid_until||'',entry.confirmation?.status||'unverified',(entry.provenance||[]).map(p=>JSON.stringify([p.ref,p.kind,p.hash])).sort()];
 if(entry.supersedes?.length)parts.push([...entry.supersedes].sort().map(id=>[id,entry.supersedes_hashes?.[id]||'']));
 return bodyHash(JSON.stringify(parts));
};
function signatureMatches(entry,metadata,signature){
 if(signature===duplicateSignature(entry))return true;
 return !metadata?.lifecycle_schema&&!metadata?.scope&&!metadata?.valid_from&&!metadata?.valid_until&&!entry.supersedes?.length&&signature===duplicateSignature({...entry,scope:'global'});
}
const privacySignature=entry=>JSON.stringify([entry.sensitive===true,[...new Set(entry.tags||[])].sort()]);
export function duplicateGroups(entries) {
  const groups=new Map(),titles=new Map();
  for(const entry of entries){
    if(['revoked','conflicted'].includes(entry.confirmation?.status))continue;
    const key=JSON.stringify([bodyHash(entry.body||''),duplicateSignature(entry),privacySignature(entry)]);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(entry);
    const title=String(entry.title||'').trim().toLowerCase();if(!titles.has(title))titles.set(title,[]);titles.get(title).push(entry);
  }
  return {exact:[...groups.values()].filter(g=>g.length>1).map(g=>{const sorted=g.slice().sort((a,b)=>a.id.localeCompare(b.id));return{keep:sorted[0],duplicates:sorted.slice(1)};}),possible:[...titles.values()].filter(g=>g.length>1&&new Set(g.map(e=>bodyHash(e.body||''))).size>1).map(g=>g.map(e=>e.id))};
}
export function projectDuplicates(entries,meta) {
  const byId=new Map(entries.map(e=>[e.id,e])),aliases=new Map();
  for(const entry of entries){
    const m=meta.entries[entry.id],target=byId.get(m?.duplicate_of);
    if(!target||target.id===entry.id||['revoked','conflicted'].includes(target.confirmation?.status))continue;
    if(privacySignature(entry)!==privacySignature(target))continue;
    if(m.file!==entry.file||m.body_hash!==bodyHash(entry.body)||m.duplicate_of_hash!==bodyHash(target.body))continue;
    if(!signatureMatches(entry,m,m.duplicate_signature)||!signatureMatches(target,meta.entries[target.id],m.duplicate_signature))continue;
    aliases.set(entry.id,target.id);
  }

  const proposed=new Map(aliases);aliases.clear();
  for(const [id,target] of proposed){const seen=new Set([id]);let current=target;while(proposed.has(current)&&!seen.has(current)){seen.add(current);current=proposed.get(current);}if(!seen.has(current))aliases.set(id,current);}
  return {aliases,entries:entries.filter(e=>!aliases.has(e.id)).map(e=>({...e,relations:(e.relations||[]).map(r=>({...r,target_id:aliases.get(r.target_id)||r.target_id})).filter(r=>r.target_id!==e.id)}))};
}
