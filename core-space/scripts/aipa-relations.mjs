// relations
import { join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { readMemoryIndex, writeMemoryIndex } from './lib/memory-index-store.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const cmd=pickCmd(process.argv.slice(2), ['gc']);
const root=arg('root')||'.';
const index=readMemoryIndex(root);
const entries=index.entries||[];

if(cmd==='gc'){
  const byId=new Map(entries.map(e=>[e.id,e]));
  let removed=0;
  for(const e of entries){
    if(!e.relations){continue;}
    e.relations=e.relations.filter(r=>{
      const t=byId.get(r.target_id);
      if(!t){removed++;return false;}
      if(t.state==='pending_delete'){removed++;return false;}
      return true;
    });
    if(e.state==='pending_delete'&&e.relations.length>0){
      removed+=e.relations.length;
      e.relations=[];
    }
  }
  writeMemoryIndex(root,index);
  console.log('gc:'+removed);
  process.exit(0);
}

const from=arg('from');
const to=arg('to');
const type=arg('type')||'related_to';
if(from===to){console.error('self-reference');process.exit(1);}
const e=entries.find(x=>x.id===from);
if(!e){console.error('not found');process.exit(1);}
if(!entries.some(x=>x.id===to)){console.error('target not found');process.exit(1);}
e.relations=e.relations||[];
if(e.relations.some(r=>r.target_id===to&&r.type===type)){
  console.log('related');
  process.exit(0);
}
e.relations.push({target_id:to,type});
writeMemoryIndex(root,index);
console.log('related');
