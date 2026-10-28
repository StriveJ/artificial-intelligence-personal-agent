// memory diff
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readMemoryIndex } from './lib/memory-index-store.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root')||'.';
const id=arg('id');
const indexDir=join(root,'user-space','memory');

let file=null, currentTitle=null;
{
  const index=readMemoryIndex(root);
  const e=(index.entries||[]).find(x=>x.id===id);
  if(e){file=e.file||null; currentTitle=e.title||null;}
}
if(!file){console.error("not found: <id> must be a derived ID from memory-index.json (location uses the index file field)");process.exit(1);}

let commits=null;
try{
  const log=execFileSync('git',['-C',root,'log','--reverse','--date=short','--format=%h%x09%ad','--',file],{encoding:'utf8'}).trim();
  if(log) commits=log.split(/\r?\n/).map(line=>{const k=line.indexOf('\t');return {hash:line.slice(0,k),date:line.slice(k+1)};});
}catch{}

if(!commits||commits.length===0){
  console.log(`${id}${currentTitle?(' "'+currentTitle+'"'):''}(no Git history)`);
  process.exit(0);
}

const lines=[];
for(const c of commits){
  let titles=[];
  try{
    const content=execFileSync('git',['-C',root,'show',c.hash+':'+file],{encoding:'utf8'});
    titles=[...content.matchAll(/^##\s+(.*)$/gm)].map(m=>m[1].trim()).filter(Boolean);
  }catch{}
  lines.push(`  ${c.date} (${c.hash}) ${titles.length?('"'+titles.join(' / ')+'"'):"(title unavailable)"}`);
}
console.log(`${id}${currentTitle?(' "'+currentTitle+'"'):''} evolution: `);
console.log(lines.join('\n'));
