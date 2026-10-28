import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
function arg(name){ const i=process.argv.indexOf('--'+name); return i>=0 ? process.argv[i+1] : ''; }
const root=arg('root')||'.';
const dir=join(root,'user-space','projects');
const hits={};
if(existsSync(dir)){
  for(const id of readdirSync(dir)){
    const p=join(dir,id,'project.yaml');
    if(!existsSync(p)) continue;
    const text=readFileSync(p,'utf8');
    const m=text.match(/public_interfaces:\s*\[([^\]]*)\]/) || text.match(/public_interfaces:\s*\n([\s\S]*?)(?=\n\S|$)/);
    const items=[];
    if(m) items.push(...[...m[1].matchAll(/[\w-]+/g)].map(x=>x[0]));
    for(const item of new Set(items)) hits[item]=(hits[item]||0)+1;
  }
}
const suggest=Object.entries(hits).filter(([,n])=>n>=2).map(([name])=>name);
console.log(JSON.stringify({suggest}));
