// memory lifecycle
export const MEMORY_LIFECYCLE_SCHEMA=1;
export function validMemoryDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;}
export function validateLifecycle(row){
 if(row.scope!==undefined&&!['global','project'].includes(row.scope))throw Error("Memory scope accepts global/project");
 for(const key of ['valid_from','valid_until'])if(row[key]&&!validMemoryDay(row[key]))throw Error(key+" must be a valid YYYY-MM-DD");
 if(row.valid_from&&row.valid_until&&row.valid_from>=row.valid_until)throw Error("Validity must satisfy valid_from < valid_until (end date excluded)");
 if(row.supersedes!==undefined&&(!Array.isArray(row.supersedes)||row.supersedes.length>100||row.supersedes.some(id=>typeof id!=='string'||!id)))throw Error("supersedes must be a bounded array of memory IDs");
 if(row.scope==='project'&&(!Array.isArray(row.projects)||!row.projects.length))throw Error("Project scope requires projects");
}
export function assertAcyclicSupersession(entries,id,row){
 const pending=[...(row.supersedes||[])],seen=new Set();
 while(pending.length){const current=pending.pop();if(current===id)throw Error("Memory supersession cannot form a cycle");if(seen.has(current))continue;seen.add(current);pending.push(...(entries[current]?.supersedes||[]));}
}
export function memoryVisibility(entry,{project='',at=new Date().toISOString().slice(0,10)}={}){
 if(!validMemoryDay(at))throw Error("Memory query date must be a valid YYYY-MM-DD");
 if(['revoked','conflicted'].includes(entry.confirmation?.status))return entry.confirmation.status;
 const scope=entry.scope||((entry.projects||[]).length?'project':'global');
 if(scope==='project'&&(!project||!(entry.projects||[]).includes(project)))return 'project-mismatch';
 if(scope!=='global'&&scope!=='project')return 'unknown-scope';
 if(entry.valid_from&&(!validMemoryDay(entry.valid_from)||at<entry.valid_from))return 'not-yet-valid';
 if(entry.valid_until&&(!validMemoryDay(entry.valid_until)||at>=entry.valid_until))return 'expired';
 return '';
}
export function selectMemories(entries,options={}){
 const byId=new Map(entries.map(e=>[e.id,e])),graph=Object.fromEntries(entries.map(e=>[e.id,e])),base=new Map(entries.map(e=>[e.id,memoryVisibility(e,options)])),reasons=new Map(base);
 for(const entry of entries){

  if(base.get(entry.id)||entry.metadata_verified===false||entry.confirmation?.status!=='user_confirmed')continue;
  try{assertAcyclicSupersession(graph,entry.id,entry);}catch{reasons.set(entry.id,'supersession-conflict');continue;}
  for(const id of entry.supersedes||[]){const old=byId.get(id);if(old&&entry.supersedes_hashes?.[id]===old.body_hash&&!reasons.get(id))reasons.set(id,'superseded');}
 }
 return {entries:entries.filter(e=>!reasons.get(e.id)),omitted:entries.filter(e=>reasons.get(e.id)).map(e=>({id:e.id,reason:reasons.get(e.id)}))};
}
