// photosynthesis
import { readFileSync,existsSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { pickCmd,pickPositional } from './lib/argv.mjs';
import { todayKey } from './lib/day-clock.mjs';
import { atomicWriteFile } from './lib/atomic-write.mjs';
import { acquireFileLock } from './lib/file-lock.mjs';
import { readOwnDistill } from './lib/distill-store.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const cmd=pickCmd(process.argv.slice(2),['add','ignore','confirm'])||'add',root=arg('root')||'.',path=join(root,'state','photosynthesis.json');
const release=acquireFileLock(path+'.lock');
try{
 const data=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{candidates:[]};if(!Array.isArray(data.candidates))throw new Error("Invalid photosynthesis candidate format");
 if(cmd==='add'){
  const text=(arg('text')||'').trim();if(!text)throw new Error('missing --text');
  if(data.candidates.some(c=>c.text.trim().toLowerCase()===text.toLowerCase()))console.log('duplicate');
  else{const id='photo-'+String(data.candidates.length+1).padStart(4,'0');data.candidates.push({id,text,state:'pending',created:arg('today')||todayKey(root)});atomicWriteFile(path,JSON.stringify(data,null,2)+'\n');console.log(id);}
 }else if(cmd==='ignore'||cmd==='confirm'){
  const id=arg('id')||pickPositional(process.argv.slice(2),{skipFirst:cmd}),c=data.candidates.find(c=>c.id===id);if(!c)throw new Error('not found');
  if(cmd==='ignore'){c.state='ignored';atomicWriteFile(path,JSON.stringify(data,null,2)+'\n');console.log('ignored');}
  else{
   if(!process.argv.includes('--by-user')||!arg('reason'))throw new Error("Confirmation requires an explicit user reply: --by-user --reason");
   if(c.state!=='confirmed'){
    const scripts=dirname(fileURLToPath(import.meta.url)),args=['add','--root',root,'--type','method','--text',c.text,'--reason',arg('reason')];
    const output=execFileSync(process.execPath,[join(scripts,'aipa-distill.mjs'),...args],{encoding:'utf8',stdio:'pipe'}).trim();
    const candidate=output==='duplicate'?readOwnDistill(root).entries.find(e=>e.text.trim().toLowerCase()===c.text.toLowerCase())?.id:output;
    if(!candidate)throw new Error("Candidate identity not found; not marked confirmed");
    execFileSync(process.execPath,[join(scripts,'aipa-distill.mjs'),'confirm','--root',root,'--id',candidate,'--by-user','--reason',arg('reason')],{stdio:'pipe'});
    execFileSync(process.execPath,[join(scripts,'aipa-index.mjs'),'--root',root],{stdio:'pipe'});
    c.state='confirmed';c.confirmed_date=todayKey(root);atomicWriteFile(path,JSON.stringify(data,null,2)+'\n');
   }
   console.log(JSON.stringify({id:c.id,text:c.text,status:'landed',confirmation:'user_confirmed'}));
  }
 }else throw new Error('unknown command: '+cmd);
}catch(error){console.error(error.message);process.exitCode=1;}finally{release();}
