// restore
import { execFileSync } from 'node:child_process';
import { existsSync,readFileSync,readdirSync,mkdirSync,writeFileSync,copyFileSync } from 'node:fs';
import { join,resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDisjointPaths,assertWithin } from '../core-space/scripts/lib/safe-path.mjs';
import { isOwnRepository } from '../core-space/scripts/lib/git-staging.mjs';
import { isValidHostId,normalizeHostId,readHostId,ensureHostDirs } from '../core-space/scripts/lib/host-id.mjs';
import { readDecayState } from '../core-space/scripts/lib/memory-decay-store.mjs';
import { readMemoryMeta } from '../core-space/scripts/lib/memory-meta.mjs';
import { atomicWriteFile } from '../core-space/scripts/lib/atomic-write.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
let cloned=false,target='';
try{
 if(!arg('from')||!arg('root')||!arg('host-id'))throw new Error("Requires --from <local-personal-repository> --root <new-directory> --host-id <new-device-id> [--with-decay] [--apply]");
 const source=resolve(arg('from'));target=resolve(arg('root'));const host=normalizeHostId(arg('host-id'));
 assertDisjointPaths(source,target);assertWithin(dirname(target),target,{rejectLinks:true});
 if(!isOwnRepository(source)||!existsSync(join(source,'AIPA-MANIFEST.yaml'))||!existsSync(join(source,'user-space','profile.yaml')))throw new Error("Source must be a Personal instance with its own Git root, AIPA-MANIFEST.yaml and user-space/profile.yaml");
 if(!isValidHostId(host)||host===readHostId(source))throw new Error("New host-id must be valid and different from the source device");
 if(existsSync(target)&&readdirSync(target).length)throw new Error("Destination is not empty; refusing to overwrite existing user-space or other files");
 const git=args=>execFileSync('git',['-C',source,...args],{encoding:'utf8',stdio:'pipe'});
 if(git(['status','--porcelain']).trim())throw new Error("Source contains uncommitted changes. Commit personal files to restore first; Git clone does not copy ignored files.");
 const tracked=git(['ls-files','-z']).split('\0').filter(Boolean);
 if(!tracked.includes('user-space/profile.yaml'))throw new Error("Profile is untracked and cannot be restored by clone");
 const privateFiles=['state/host-id','state/current-sid','state/current-tool','state/session-context.json','state/session-checkpoint.md','state/resume-prompt.md','state/external-budget.json','state/external-cancel.json'];
 if(tracked.some(p=>privateFiles.includes(p)||p.startsWith('state/offload/')))throw new Error("Source tracks device-private session, identity or uninstall state. Review ignore/tracking boundaries before restoring.");
 for(const rel of tracked)assertWithin(source,join(source,rel),{rejectLinks:true});
 readMemoryMeta(source);
 const withDecay=process.argv.includes('--with-decay'),decay=withDecay?readDecayState(source):null;
 const report={status:'preview',source_commit:git(['rev-parse','HEAD']).trim(),target,host_id:host,decay:withDecay?'copy-validated-baseline':'not-copied',excluded:["offloaded original content","device-local session state","uncommitted or ignored personal files"],steps:[]};
 if(!process.argv.includes('--apply')){console.log(JSON.stringify(report,null,2));process.exit(0);}
 execFileSync('git',['clone','--no-hardlinks','--',source,target],{stdio:'pipe'});cloned=true;

  for(const rel of tracked){const from=assertWithin(source,join(source,rel),{rejectLinks:true}),to=assertWithin(target,join(target,rel),{rejectLinks:true});copyFileSync(from,to);}
  if(git(['rev-parse','HEAD']).trim()!==report.source_commit||git(['status','--porcelain']).trim())throw new Error("Source changed during restoration. Review the destination before retrying.");
 const localGit=args=>execFileSync('git',['-C',target,...args],{encoding:'utf8',stdio:'pipe'});

 try{const remote=git(['remote','get-url','origin']).trim();if(remote)localGit(['remote','set-url','origin',remote]);}catch{}
 mkdirSync(join(target,'state'),{recursive:true});atomicWriteFile(join(target,'state','host-id'),host+'\n');ensureHostDirs(target,host);
 const ignore=join(target,'.gitignore'),existing=existsSync(ignore)?readFileSync(ignore,'utf8'):'';
 const rules=[...privateFiles,'state/memory-decay.json','state/*.lock','state/restore-report.json'];
 atomicWriteFile(ignore,existing+(existing.endsWith('\n')?'':'\n')+rules.filter(r=>!existing.split(/\r?\n/).includes(r)).join('\n')+'\n');
 if(withDecay)atomicWriteFile(join(target,'state','memory-decay.json'),JSON.stringify({version:'0.1',entries:decay},null,2)+'\n');
 const scripts=resolve(dirname(fileURLToPath(import.meta.url)),'..','core-space','scripts');
 for(const [name,args] of [['aipa-shell-sync.mjs',['--self']],['aipa-index.mjs',[]],['aipa-daily.mjs',['sync','--mechanical']],['aipa-dashboard.mjs',[]]]){
   execFileSync(process.execPath,[join(scripts,name),'--root',target,...args],{stdio:'pipe'});report.steps.push({script:name,status:'completed'});
 }
 report.status='restored';atomicWriteFile(join(target,'state','restore-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error("Restore failed: "+error.message+(cloned?"; destination was partially restored. Original instance is unchanged; review before continuing.":"; no restored instance created"));process.exitCode=1;}
