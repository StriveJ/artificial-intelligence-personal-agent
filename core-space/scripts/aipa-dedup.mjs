// dedup
import { readMemorySources,memoryRecords } from './lib/memory-source.mjs';
import { readMemoryMeta,projectMemoryMeta,updateMemoryMeta,patchMemoryMeta,bodyHash } from './lib/memory-meta.mjs';
import { duplicateGroups,duplicateSignature } from './lib/memory-dedup.mjs';
import {readMemoryProjection} from './lib/memory-projection.mjs';
function arg(name){const i=process.argv.indexOf('--'+name);return i>=0?process.argv[i+1]:'';}
const root=arg('root')||'.',apply=process.argv.includes('--apply'),reason=arg('reason')||'';
try{
  if(apply&&!reason.trim())throw Error("Applying deduplication requires --reason; default is preview only");
  if(arg('undo')){
    const id=arg('undo'),old=readMemoryMeta(root).entries[id];if(!old?.duplicate_of)throw Error("This memory has no deduplication decision to undo");
    if(apply)updateMemoryMeta(root,current=>{const row=current.entries[id];delete row.duplicate_of;delete row.duplicate_of_hash;delete row.duplicate_signature;row.history=[...(row.history||[]),{at:new Date().toISOString(),actor:'host_report',reason,action:'dedup-undone'}];});
    const result={status:apply?'applied':'preview',undo:id,applied:apply?1:0,index_rebuild_required:apply};console.log(process.argv.includes('--json')?JSON.stringify(result):result.status+' undo '+id);process.exit(0);
  }
  const meta=readMemoryMeta(root),records=readMemoryProjection(root,{meta}),groups=duplicateGroups(records);
  let applied=0;
  if(apply&&groups.exact.length)updateMemoryMeta(root,current=>{
    const fresh=duplicateGroups(readMemoryProjection(root,{meta:current}));
    if(JSON.stringify(fresh)!==JSON.stringify(groups))throw Error("Deduplication evidence changed; preview again");
    for(const group of groups.exact)for(const entry of group.duplicates){patchMemoryMeta(current,entry,{confirmation:entry.confirmation||{status:'unverified'},duplicate_of:group.keep.id,duplicate_of_hash:bodyHash(group.keep.body),duplicate_signature:duplicateSignature(entry)},{actor:'host_report',reason});applied++;}
  });
  const result={status:apply?'applied':'preview',exact:groups.exact.map(g=>({keep:g.keep.id,duplicates:g.duplicates.map(e=>e.id)})),possible:groups.possible,applied,index_rebuild_required:applied>0};
  console.log(process.argv.includes('--json')?JSON.stringify(result):result.status+' exact '+result.exact.length+' possible '+result.possible.length+' applied '+applied);
}catch(error){console.error(error.message);process.exitCode=1;}
