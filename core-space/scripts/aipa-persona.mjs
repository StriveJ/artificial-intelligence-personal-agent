import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root')||'.';
const scene=arg('scene')||'work';
let mapped='';
const pp=join(root,'personas.yaml');
if(existsSync(pp)){
  const text=readFileSync(pp,'utf8');
  const m=text.match(new RegExp(`^\\s*${scene}:\\s*(\\S+)`,'m'));
  if(m) mapped=m[1];
}
if(!mapped){
  const dir=join(root,'core-space','mentors');
  if(existsSync(dir)){
    const first=readdirSync(dir)[0];
    if(first) mapped=first;
  }
}
console.log(mapped||'none');
