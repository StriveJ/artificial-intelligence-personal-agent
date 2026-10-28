// mentor
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, cpSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const id=arg('mentor');
const root=arg('root')||'.';
const baseDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const mentorsDir=arg('mentors')||join(baseDir,'mentors');
if(!id){console.error("Missing --mentor");process.exit(1);}

const mentorDir=join(mentorsDir,id);
const yaml=join(mentorDir,'mentor.yaml');
if(!existsSync(yaml)){console.error("Mentor not found: "+id);process.exit(1);}

const meta={hooks:{},scripts:[]};
let section=null, curHook=null;
for(const line of readFileSync(yaml,'utf8').split(/\r?\n/)){
  const kv=line.match(/^([A-Za-z_]+):\s*(.*)$/);
  if(kv){
    const k=kv[1], v=kv[2].trim();
    if(k==='scripts'){section=k;curHook=null;continue;}
    if(k==='hooks'){section='hooks';curHook=null;continue;}
    meta[k]=v; section=null; curHook=null; continue;
  }
  if(section==='hooks'){
    const hk=line.match(/^\s{2}([A-Za-z_-]+):\s*$/);
    if(hk){curHook=hk[1];meta.hooks[curHook]=[];continue;}
  }
  const item=line.match(/^\s*-\s*([A-Za-z0-9._-]+)\s*$/);
  if(item&&section){
    if(section==='scripts')meta.scripts.push(item[1]);
    else if(section==='hooks'&&curHook)meta.hooks[curHook].push(item[1]);
  }
}

const destDir=join(root,'core-space','mentors',id);
const selfCopy=resolve(mentorDir)===resolve(destDir);
const skillsSrc=join(mentorDir,'skills');
const skillIds=[];
if(existsSync(skillsSrc)){
  for(const n of readdirSync(skillsSrc))if(statSync(join(skillsSrc,n)).isDirectory())skillIds.push(n);
}
if(!selfCopy){
  mkdirSync(destDir,{recursive:true});

  // persona
  if(meta.persona){
    const p=join(mentorDir,meta.persona);
    if(existsSync(p))copyFileSync(p,join(destDir,'persona.md'));
  }

  // scripts
  const scriptsSrc=join(mentorDir,'scripts');
  if(meta.scripts.length&&existsSync(scriptsSrc)){
    mkdirSync(join(destDir,'scripts'),{recursive:true});
    for(const f of meta.scripts)if(existsSync(join(scriptsSrc,f)))copyFileSync(join(scriptsSrc,f),join(destDir,'scripts',f));
  }

  if(existsSync(skillsSrc)){
    cpSync(skillsSrc,join(destDir,'skills'),{recursive:true});
  }

  if(Object.keys(meta.hooks).length){
    let y='hooks:\n';
    for(const pt of Object.keys(meta.hooks)){
      y+=`  ${pt}:\n`;
      for(const f of meta.hooks[pt])y+=`    - ${f}\n`;
    }
    writeFileSync(join(root,'core-space','mentors',id,'hooks.yaml'),y,'utf8');
  }
}

console.log(JSON.stringify({mentor_id:meta.mentor_id||id,name:meta.name||id,persona:meta.persona||'',skills:skillIds,scripts:meta.scripts,hooks:meta.hooks}));
