// gate
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const tool=arg('tool');
const confirm=arg('confirm');
const text=arg('text')||'';
const root=arg('root')||'.';
const registry=arg('registry')||join(root,'core-space','tools.yaml');
const policy=arg('policy')||join(root,'core-space/policy.md');
function audit(msg){
  mkdirSync(join(root,'state'),{recursive:true});
  appendFileSync(join(root,'state','audit.log'),`[${new Date().toISOString()}] gate ${msg} ${tool||''}\n`,'utf8');
}
function deny(msg){console.error(msg);audit(msg);process.exit(1);}

const lines=readFileSync(registry,'utf8').split(/\r?\n/);
const tools={};let cur=null;
for(const line of lines){
  const m=line.match(/^\s{2}([A-Za-z0-9._-]+):\s*$/);
  if(m){cur=m[1];tools[cur]={write:'local',destructive:false};continue;}
  if(cur){
    const w=line.match(/^\s{4}write:\s*(\S+)/); if(w)tools[cur].write=w[1];
    const d=line.match(/^\s{4}destructive:\s*(true|false)/); if(d)tools[cur].destructive=d[1]==='true';
  }
}
if(!tools[tool]) deny('deny');

if(/password|secret|token|apikey/i.test(text)) deny('block');

const src=readFileSync(policy,'utf8');
const forbidden=[...src.matchAll(/(?:Forbidden|\u7981\u6b62)[:\uFF1A]\s*([^\n]+)/gi)].map(m=>m[1].trim());
if(forbidden.some(x=>text.includes(x))) deny('block');

if(tools[tool].destructive && confirm!=='yes') deny('confirm');
audit('allow');
console.log('allow');
