// runtime migration
import { existsSync, readFileSync,unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PRIVATE_RUNTIME_PATTERNS,PRIVATE_RUNTIME_EXACT,BUDGET_PRIVATE_PATHS,privateRuntimePath,runtimeStateReport } from './runtime-state-policy.mjs';
import { assertEmptyStaging,isOwnRepository } from './git-staging.mjs';
import { assertWithin,safeRelativePath } from './safe-path.mjs';
import { atomicWriteFile } from './atomic-write.mjs';
import { acquireFileLock } from './file-lock.mjs';
export function assertInstanceRoot(root) {
  if(!isOwnRepository(root)||!existsSync(join(root,'AIPA-MANIFEST.yaml'))||existsSync(join(root,'ORIGIN-MANIFEST.yaml')))throw new Error("Requires an independent Personal instance root; Origin, artifact caches and parent repositories are refused");
  assertWithin(root,join(root,'AIPA-MANIFEST.yaml'),{rejectLinks:true});
}
export function migrationPreview(root) {
  assertInstanceRoot(root);
  const path=assertWithin(root,join(root,'.gitignore'),{rejectLinks:true});
  const text=existsSync(path)?readFileSync(path,'utf8'):'';
  const existing=new Set(text.split(/\r?\n/).map(x=>x.trim()));
  const report=runtimeStateReport(root),negations=text.split(/\r?\n/).filter(x=>x.trim().startsWith('!'));
  const probes=[...new Set([...PRIVATE_RUNTIME_EXACT,...BUDGET_PRIVATE_PATHS,...report.rows.map(r=>r.path),'state/policy-probe.lock','state/policy-probe.log','state/upgrade/probe/file','state/.origin-cache/probe','state/offload/probe','state/test/probe'])];
  let verbose='';try{verbose=execFileSync('git',['-C',root,'check-ignore','--no-index','-v','-z','--stdin'],{input:probes.join('\0')+'\0',encoding:'utf8',stdio:'pipe'});}catch(error){if(error.status!==1)throw error;verbose=String(error.stdout||'');}
  const fields=verbose.split('\0'),conflicts=new Set(negations.filter(line=>privateRuntimePath(line.trim().slice(1))));
  for(let i=0;i+3<fields.length;i+=4)if(fields[i+2].startsWith('!'))conflicts.add(fields[i+2]);
  return {...report,mode:'preview',add_patterns:PRIVATE_RUNTIME_PATTERNS.filter(p=>!existing.has(p)),
    conflicts:[...conflicts],negations,untrack_candidates:report.rows.filter(r=>r.tracked).map(r=>r.path)};
}
export function applyRuntimeMigration(root,{untrack=[]}={}) {
  assertInstanceRoot(root);assertEmptyStaging(root,{requireRepository:true});
  const lock=assertWithin(root,join(root,'state','aipa-admin.lock'),{rejectLinks:true});
  const release=acquireFileLock(lock);
  try{
    const preview=migrationPreview(root);
    if(preview.conflicts.length)throw new Error("Personal negation rules conflict with private paths. Review the preview and resolve manually; migration does not overwrite personal policy.");
    const selected=[...new Set(untrack.map(safeRelativePath))];
    for(const path of selected){if(!privateRuntimePath(path)||!preview.untrack_candidates.includes(path))throw new Error("Untracking accepts only private files listed in the preview: "+path);assertWithin(root,join(root,path),{rejectLinks:true});}
    const ignore=join(root,'.gitignore'),old=existsSync(ignore)?readFileSync(ignore):null;
    const index=assertWithin(root,resolve(root,execFileSync('git',['-C',root,'rev-parse','--git-path','index'],{encoding:'utf8'}).trim()),{rejectLinks:true});
    const oldIndex=readFileSync(index);
    try{
      if(preview.add_patterns.length){const prefix=old?.toString('utf8')||'',eol=prefix.includes('\r\n')?'\r\n':'\n';atomicWriteFile(ignore,Buffer.concat([old||Buffer.alloc(0),Buffer.from((prefix&&!prefix.endsWith('\n')?eol:'')+'# AIPA local runtime policy'+eol+preview.add_patterns.join(eol)+eol)]));}
      if(selected.length)execFileSync('git',['-C',root,'--literal-pathspecs','rm','--cached','--',...selected],{stdio:'pipe'});
    }catch(error){atomicWriteFile(index,oldIndex);if(old)atomicWriteFile(ignore,old);else if(existsSync(ignore))unlinkSync(ignore);throw error;}
    return {status:'applied',selected,report:runtimeStateReport(root),history_removed:false,commit_performed:false};
  }finally{release();}
}
