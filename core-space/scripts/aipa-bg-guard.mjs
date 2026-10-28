// bg guard
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { todayKey } from './lib/day-clock.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const task=arg('task');
const root=arg('root')||'.';
const daily=parseInt(arg('daily')||'1',10);
const consecutive=parseInt(arg('consecutive')||'7',10);
const date=arg('date')||todayKey(root);
const reset=process.argv.includes('--reset');
if(!task){console.error("Missing --task");process.exit(1);}

const p=join(root,'state','bg-counts.json');
let state={};
try{state=JSON.parse(readFileSync(p,'utf8'));}catch{}
const prev=state[task]||{date:'',runs:0,streak:0};

if(reset){
  state[task]={date:'',runs:0,streak:0};
  mkdirSync(join(root,'state'),{recursive:true});
  writeFileSync(p,JSON.stringify(state,null,2),'utf8');
  console.log(JSON.stringify({decision:'reset'}));
  process.exit(0);
}

if(prev.date===date && prev.runs>=daily){
  console.log(JSON.stringify({decision:'skip',reason:'daily'}));
  process.exit(0);
}
if(prev.streak>=consecutive){
  console.log(JSON.stringify({decision:'skip',reason:'consecutive'}));
  process.exit(0);
}

const next={date,runs:(prev.date===date?prev.runs+1:1),streak:prev.streak+1};
state[task]=next;
mkdirSync(join(root,'state'),{recursive:true});
writeFileSync(p,JSON.stringify(state,null,2),'utf8');
console.log(JSON.stringify({decision:'allow',streak:next.streak,runs:next.runs}));
