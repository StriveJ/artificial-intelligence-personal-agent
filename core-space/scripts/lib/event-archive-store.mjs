// event archive store
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {assertWithin,safeRelativePath} from './safe-path.mjs';
export const archiveHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const checked=(root,path)=>assertWithin(root,path,{rejectLinks:true});
export function* archiveRowSteps(bytes){
 const rows=[];let processed=0;
 for(const line of bytes.toString('utf8').split(/\r?\n/).filter(s=>s.trim())){
  let row;try{row=JSON.parse(line);}catch{throw Error("Corrupt event JSON; original content preserved");}
  if(!row||Array.isArray(row)||typeof row!=='object'||typeof row.type!=='string'||typeof row.ts_local!=='string')throw Error("Unverifiable event structure; original content preserved");
  rows.push({row,digest:archiveHash(Buffer.from(line))});if(++processed%128===0)yield;
 }
 return rows;
}
function finish(iterator){let step;do{step=iterator.next();}while(!step.done);return step.value;}
export function archiveRows(bytes){return finish(archiveRowSteps(bytes));}
export function archivePaths(root,identity){
 if(!/^[a-f0-9]{64}$/.test(identity))throw Error("Invalid archive identity");
 return {data:checked(root,join(root,'state/event-archive',identity+'.jsonl')),manifest:checked(root,join(root,'state/event-archive',identity+'.json'))};
}
export function archiveSourcePath(root,rel){
 const normalized=safeRelativePath(rel);
 if(!/^state\/(?:events\/[^/]+\.jsonl|hosts\/[a-z0-9-]+\/events\/\d{4}-\d{2}-\d{2}\.jsonl)$/.test(normalized))throw Error("Archive source path is outside the event area");
 return checked(root,join(root,normalized));
}
export function* archiveReadSteps(root,identity,{observe=()=>{}}={}){
 const paths=archivePaths(root,identity),data=readFileSync(paths.data),manifestBytes=readFileSync(paths.manifest),manifest=JSON.parse(manifestBytes.toString('utf8'));
 if(manifest.schema!==1||manifest.sha256!==identity||archiveHash(data)!==identity||manifest.bytes!==data.length)throw Error("Archive digest mismatch; source preserved");
 observe(paths.data,data);observe(paths.manifest,manifestBytes);
 const rows=yield* archiveRowSteps(data),events=rows.map(({row,digest})=>({id:row.event_id||'legacy:'+digest,sha256:digest}));
 if(JSON.stringify(events)!==JSON.stringify(manifest.events))throw Error("Archive identity inventory mismatch");
 archiveSourcePath(root,manifest.source);return {...paths,data,manifest,rows};
}
export function readArchive(root,identity){return finish(archiveReadSteps(root,identity));}
export function archiveWitnessIdentities(root){
 const dir=checked(root,join(root,'state/event-archive'));
 if(!existsSync(dir))return [];

 return readdirSync(dir).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).sort().map(n=>n.slice(0,-5));
}
export function* archiveWitnessSteps(root,{observe,identities=archiveWitnessIdentities(root)}={}){const archives=[];for(const identity of identities){archives.push(yield* archiveReadSteps(root,identity,{observe}));yield;}return archives;}
export function readArchiveWitnesses(root){return finish(archiveWitnessSteps(root));}
