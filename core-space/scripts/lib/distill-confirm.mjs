// distill confirm
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { confirmationFor, patchMemoryMeta, readMemoryMeta, withMemoryMetaLock,bodyHash } from './memory-meta.mjs';
import { parseMemorySections } from './memory-sections.mjs';
import { memoryId } from './memory-source.mjs';
import { todayKey } from './day-clock.mjs';
import { updateOwnDistill } from './distill-store.mjs';
import { assertInSandbox } from './distill-sandbox.mjs';
import { commitMemoryFiles } from './memory-transaction.mjs';
import { normalizeCandidate } from './candidates.mjs';
import { MEMORY_WRITES, appendLocalLog } from './local-log.mjs';
import { auditRow } from './distill-sandbox.mjs';
const LAND={decision:'decisions',lesson:'patterns',method:'patterns',preference:'preferences',term:'terms',trait:'traits',instruction:'instructions'};
export function confirmDistill(root,{id,auto=false,byUser=false,reason='',fault}={}) {
  return withMemoryMetaLock(root,()=>{
    const meta=readMemoryMeta(root),files=new Map(),audits=[];
    const read=path=>files.has(path)?files.get(path).toString('utf8'):existsSync(path)?readFileSync(path,'utf8'):'';
    return updateOwnDistill(root,data=>{
      const selected=auto?data.entries.filter(e=>e.tier==='auto'):data.entries.filter(e=>e.id===id);
      if(!selected.length){if(auto)return 'nothing-to-auto';throw Error('not found');}
      for(const e of selected){
        if(!normalizeCandidate(e))throw Error("Invalid candidate fields; nothing written");
        const evidence=e.provenance||[],confirmation=confirmationFor(evidence,{byUser,reason:reason||e.reason||'',day:todayKey(root)});
        if(e.type==='skill'){
          const rel=`user-space/skills/${e.scope}/${e.name}/SKILL.md`;assertInSandbox(rel);
          const content=`---\nname: ${e.name}\ndescription: ${e.desc}\nscope: ${e.scope}\nversion: 1.0.0\n---\n\n${e.text}\n`;
          files.set(join(root,rel),Buffer.from(content));audits.push(auditRow({ts_local:e.ts_local,id:e.id,type:e.type,target:rel,bytes:Buffer.byteLength(content)}));
        }else{
          if(!LAND[e.type]||typeof e.text!=='string'||!e.text.trim())throw Error("Invalid candidate type or content");
          const rel=`user-space/memory/${LAND[e.type]}.md`;assertInSandbox(rel);const path=join(root,rel),previous=read(path).replace(/\r\n/g,'\n');
          const line=`- [${['lesson','method'].includes(e.type)?e.type:e.ts_local}] ${e.text}\n`;
          const expected=parseMemorySections(line);
          if(expected.length!==1)throw Error("Candidate spans multiple memory sections; split it before confirmation. Nothing written.");
          const previousMatches=parseMemorySections(previous,{withIdentity:true}).filter(s=>s.body===expected[0].body);
          const projects=JSON.stringify([...(e.projects||[])].sort());
          const matching=previousMatches.filter(s=>{const m=meta.entries[memoryId(rel,s)];return m&&m.body_hash===bodyHash(s.body)&&JSON.stringify([...(m.projects||[])].sort())===projects||!m&&!e.projects?.length;});
          if(matching.length>1)throw Error("Memory identity cannot be uniquely bound; nothing written");
          if(!byUser&&previousMatches.some(s=>{const m=meta.entries[memoryId(rel,s)];return m?.confirmation?.status==='revoked'&&(!(m.projects||[]).length||(e.projects||[]).some(p=>m.projects.includes(p)));}))throw Error("The same conclusion was withdrawn and requires explicit user action; nothing written");
          const next=matching.length?previous:previous+(previous&&!previous.endsWith('\n')?'\n':'')+line;
          const section=matching[0]||parseMemorySections(next,{withIdentity:true}).filter(s=>s.body===expected[0].body).at(-1);
          if(!section)throw Error("Memory identity cannot be uniquely bound; nothing written");
          const entry={id:memoryId(rel,section),file:rel,body:section.body};
          patchMemoryMeta(meta,entry,{type:e.type,projects:e.projects||[],tags:e.tags||[],provenance:evidence,confirmation},{actor:byUser?'user':'model',reason:confirmation.reason});
          files.set(path,Buffer.from(next));files.set(join(root,'user-space/memory/memory-meta.json'),Buffer.from(JSON.stringify(meta,null,2)+'\n'));
          audits.push(auditRow({ts_local:e.ts_local,id:e.id,type:e.type,target:rel,bytes:Buffer.byteLength(line)}));
        }
        for(const operation of Object.values(data.operations||{}))if(operation.id===e.id)operation.status='landed';
      }
      data.entries=data.entries.filter(e=>!selected.includes(e));
      return auto?'auto-confirmed '+selected.length:'confirmed';
    },{commit:(queue,bytes)=>{files.set(queue,bytes);commitMemoryFiles(root,files,{fault});for(const row of audits)try{appendLocalLog(root,MEMORY_WRITES,row);}catch{  }}});
  });
}
