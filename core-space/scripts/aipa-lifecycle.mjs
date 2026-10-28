// lifecycle
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendError } from './lib/error-sink.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const hook=arg('hook');
const root=arg('root')||'.';
const baseDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const scriptsDir=resolve(arg('scripts')||join(baseDir,'scripts'));
const hooksFile=arg('hooks')||join(root,'core-space','common','hooks.yaml');
const text=arg('text')||'';
const tool=arg('tool')||'';
const confirm=arg('confirm')||'';
const tags=arg('tags')||'';

const MAP={
  'privacy-filter':{'block':'block','ask':'ask','allow':'allow'},
  'value-check':{'conflict':'block','suspicious':'ask','ok':'allow'},
};

function failed(filter, error) {
  const message = "Registered filter failed: " + filter + ': ' + String(error.message || error);
  try { appendError(root, { ts: new Date().toISOString(), scope: 'aipa-lifecycle', message }); } catch {}
  console.error(message);
  console.log(JSON.stringify({ hook, decision: 'block', trace: [{ filter, decision: 'block', error: message }] }));
  process.exit(1);
}
let hooks={};
try{
  const lines=readFileSync(hooksFile,'utf8').split(/\r?\n/);
  let cur=null;
  for(const line of lines){
    const k=line.match(/^\s{2}([A-Za-z_-]+):/);
    if(k){cur=k[1];hooks[cur]=[];continue;}
    if(cur){
      const f=line.match(/^\s{4}-\s*([A-Za-z0-9._-]+)\s*$/);
      if(f)hooks[cur].push(f[1]);
    }
  }
}catch (error) { failed('hooks.yaml', error); }

let overlayHooks={};
try{

  const mentorsRoot=join(root,'core-space','mentors');
  if(existsSync(mentorsRoot)){
    for(const m of readdirSync(mentorsRoot)){
      const ov=join(mentorsRoot,m,'hooks.yaml');
      if(!existsSync(ov))continue;
      const lines=readFileSync(ov,'utf8').split(/\r?\n/);
      let cur=null;
      for(const line of lines){
        const k=line.match(/^\s{2}([A-Za-z_-]+):/);
        if(k){cur=k[1];if(!overlayHooks[cur])overlayHooks[cur]=[];continue;}
        if(cur){
          const f=line.match(/^\s{4}-\s*([A-Za-z0-9._-]+)\s*$/);
          if(f)overlayHooks[cur].push(f[1]);
        }
      }
    }
  }
}catch (error) { failed('mentor hooks.yaml', error); }

if(!hook){console.error("Missing --hook");process.exit(1);}
const filters=(hooks[hook]||[]).concat(overlayHooks[hook]||[]);
if(filters.length===0){
  console.log(JSON.stringify({hook,decision:'allow',trace:[]}));
  process.exit(0);
}

let decision='allow';
const trace=[];
for(const filter of filters){
  const script=join(scriptsDir,'aipa-'+filter+'.mjs');
  let raw='';
  try{
    raw=execFileSync(process.execPath,[script,'--root',root,'--text',text,'--tool',tool,'--confirm',confirm,'--tags',tags],{cwd:root,encoding:'utf8',timeout:30000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']}).trim();
    if (!(MAP[filter] && Object.hasOwn(MAP[filter], raw))) throw new Error("Unknown decision or undefined filter protocol");
  }catch (error) { failed(filter, error); }
  const d=MAP[filter][raw];
  trace.push({filter,raw,decision:d});
  if(d==='deny'||d==='block'){decision=d;break;}
  if(d==='ask'){decision='ask';}
  if(d==='defer'||d==='rewrite'){decision=d;}
}
console.log(JSON.stringify({hook,decision,trace}));
