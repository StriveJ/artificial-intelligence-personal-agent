// Transactional framework installation with explicit provenance and compatibility checks. Protect staged work, personal policy and modified managed files. Recovery uses authenticated snapshots and lock ownership; never seize a live writer or relabel local modifications as upstream. Framework-only mode rejects Git content filters and does not read personal content.
import { existsSync,readFileSync,writeFileSync,readdirSync,lstatSync,mkdirSync,unlinkSync,chmodSync } from 'node:fs';
import { join,dirname,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { assertInstanceRoot } from './runtime-migration.mjs';
import { runtimeIgnoreStatus,runtimeStateReport } from './runtime-state-policy.mjs';
import { assertWithin,safeRelativePath } from './safe-path.mjs';
import { SYNC_REFRESH_MAP,DERIVED } from './origin-sync-map.mjs';
import { atomicWriteFile } from './atomic-write.mjs';
import { acquireFileLock } from './file-lock.mjs';
import { artifactInfo } from './update-source.mjs';
import { compareVersions,versionOf,VERSION_TOKEN } from './semver.mjs';
import { isChannel } from './release-channel.mjs';
import { withBuildSource,readBuildSource } from './build-source.mjs';
import { parseChecksums,renderChecksums } from './origin-checksums.mjs';
import { compatibilityReport,frameworkCompatibilityReport } from './update-contract.mjs';
import { sha256 } from './release-package.mjs';
import { TELEMETRY_DISCLOSURE } from './telemetry-disclosure.mjs';

const STATE='state/upgrade',JOURNAL=STATE+'/transaction.json',PREFS=STATE+'/preferences.json',ADMIN_LOCK='state/aipa-admin.lock';
const normalized=p=>p.replace(/\\/g,'/');
const coverage=p=>SYNC_REFRESH_MAP.some(m=>p===normalized(m.dst)||(m.kind==='dir'&&p.startsWith(normalized(m.dst)+'/')))||DERIVED.some(m=>p===m.dst);
const managed=p=>coverage(p)||['AIPA-MANIFEST.yaml','state/origin-baseline.txt',PREFS].includes(p);

const git=(root,args)=>execFileSync('git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgSign=false','-C',root,'--literal-pathspecs',...(args[0]==='diff'?['diff','--no-renames','--no-ext-diff','--no-textconv',...args.slice(1)]:args)],{encoding:'utf8',stdio:'pipe',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}});
function checkedPath(root,rel){return assertWithin(root,join(root,safeRelativePath(rel)),{rejectLinks:true});}
function walk(root,rel){const path=checkedPath(root,rel);if(!existsSync(path))return [];const stat=lstatSync(path);if(stat.isFile())return [rel];if(!stat.isDirectory())throw new Error("Managed path contains a special file");return readdirSync(path).sort().flatMap(name=>walk(root,rel+'/'+name));}
function stateReady(root){assertInstanceRoot(root);for(const rel of [JOURNAL,PREFS,STATE+'/candidates/probe']){const row=runtimeIgnoreStatus(root,rel);if(row.tracked||!row.ignored)throw new Error("Update records must be device-private. Preview aipa-runtime-migrate and complete the required rules first.");}if(git(root,['ls-files','--',STATE+'/']).trim())throw new Error("Update records contain tracked files; explicitly untrack them first");checkedPath(root,JOURNAL);}
export function updatePreferences(root){
 const p=checkedPath(root,PREFS);if(!existsSync(p))return {schema:1,channel:null,pin:null};const v=JSON.parse(readFileSync(p,'utf8'));
 if(v.schema!==1||v.channel!==null&&!isChannel(v.channel)||v.pin!==null&&(!v.pin.version||!/^[a-f0-9]{64}$/.test(v.pin.identity)||v.pin.commit&&!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(v.pin.commit)))throw new Error("Invalid update preferences");return v;
}
export function setUpdatePreferences(root,{channel,pin,unpin=false}={}){
 stateReady(root);if(channel&&!isChannel(channel))throw new Error("Invalid channel");if(pin&&unpin)throw new Error("Pin and unpin conflict");
 const release=acquireFileLock(checkedPath(root,ADMIN_LOCK));
 try{const v=updatePreferences(root);if(channel)v.channel=channel;if(pin)v.pin=pin;if(unpin)v.pin=null;atomicWriteFile(checkedPath(root,PREFS),JSON.stringify(v,null,2)+'\n');return updatePreferences(root);}finally{release();}
}
function cleanCoverage(root,{frameworkOnly=false}={}){
 if(git(root,['diff','--cached','--name-only','-z']).trim())throw new Error("Existing staged content detected; commit or unstage it yourself first. Automatic commits must not include unrelated changes.");
 if(frameworkOnly){
  let filters='';try{filters=git(root,['config','--name-only','--get-regexp','^filter\\..*\\.(clean|process)$']);}catch(error){if(error.status!==1)throw error;}
  if(filters.trim())throw new Error("Git content filters prevent proving that installation avoids personal data; framework-only mode refuses execution");
 }
 const scope=[...SYNC_REFRESH_MAP,...DERIVED].map(m=>normalized(m.dst)).concat('AIPA-MANIFEST.yaml','state/origin-baseline.txt');
 const records=git(root,['status','--porcelain=v1','-z','--untracked-files=all','--no-renames',...(frameworkOnly?['--',...scope]:[])]).split('\0').filter(Boolean);
 for(let i=0;i<records.length;i++){const record=records[i],path=normalized(record.slice(3)),renamed=/[RC]/.test(record.slice(0,2))?normalized(records[++i]||''):'';if(coverage(path)||coverage(renamed)||['AIPA-MANIFEST.yaml','state/origin-baseline.txt'].includes(path))throw new Error("Managed files contain uncommitted changes: "+path+"; save or contribute them first. They will not be overwritten.");}
}
function manifestNext(old,info){
 if(!new RegExp('^[ \\t]+version:[ \\t]*'+VERSION_TOKEN+'[ \\t]*$','m').test(old))throw new Error("Invalid instance manifest version structure");
 const eol=old.includes('\r\n')?'\r\n':'\n';let text=old.replace(/^([ \t]+)version:[^\r\n]*/m,'$1version: '+info.version);
 text=/^  channel:/m.test(text)?text.replace(/^  channel:[^\r\n]*/m,'  channel: '+info.channel):text.replace(/^  version:[^\r\n]*/m,line=>line+eol+'  channel: '+info.channel);
 const prefix=(info.text.match(/^  assist_prefix:[ \t]*(.+)/m)||[])[1];if(prefix&&/^  assist_prefix:/m.test(text))text=text.replace(/^  assist_prefix:[^\r\n]*/m,'  assist_prefix: '+prefix);
 return withBuildSource(text,info.build_source);
}
export function planUpdate(root,artifact,{commit='',allowDowngrade=false,repairSource=false,frameworkOnly=false}={}){
 if(typeof frameworkOnly!=='boolean')throw new Error("Invalid installation data scope");
 assertInstanceRoot(root);cleanCoverage(root,{frameworkOnly});const info=artifactInfo(artifact);info.text=readFileSync(join(artifact,'ORIGIN-MANIFEST.yaml'),'utf8');
 const old=readFileSync(checkedPath(root,'AIPA-MANIFEST.yaml'),'utf8'),current=versionOf(old),comparison=compareVersions(info.version,current),prefs=updatePreferences(root);
 if(prefs.pin&&prefs.pin.identity!==info.identity)throw new Error("Instance is pinned to another artifact; explicitly unpin before selecting a new target");
 if(info.channel==='beta'&&(old.match(/^  channel:[ \t]*(\S+)/m)||[])[1]!=='beta'&&!/^  telemetry:[ \t]*on[ \t]*$/m.test(old))throw new Error("Beta enrollment requires explicit consent: "+TELEMETRY_DISCLOSURE.join(' '));
 if(comparison<0&&!allowDowngrade)throw new Error("A lower version requires explicit --allow-downgrade");
 if(comparison===0&&!repairSource)throw new Error("Same-version overwrite is refused; use --repair-source for missing provenance");
 if(repairSource&&comparison!==0)throw new Error("Source repair accepts only the same version");
 const compatibility=frameworkOnly?frameworkCompatibilityReport(root,info.contract):compatibilityReport(root,info.contract,{downgrade:comparison<0});if(!compatibility.compatible&&(!repairSource||frameworkOnly))throw new Error("Installation refused: "+compatibility.reasons.join('; '));
 const payload=new Map();
 for(const m of [...SYNC_REFRESH_MAP,...DERIVED.map(m=>({...m,kind:'file'}))]){
  const srcRoot=checkedPath(artifact,normalized(m.src)),dstRoot=checkedPath(root,normalized(m.dst));
  for(const p of [srcRoot,dstRoot])if(existsSync(p)){const stat=lstatSync(p);if(m.kind==='dir'?!stat.isDirectory():!stat.isFile())throw new Error("Sync mapping file/directory type mismatch: "+m.dst);}
  for(const src of walk(artifact,normalized(m.src))){const dst=normalized(m.dst)+src.slice(normalized(m.src).length);payload.set(dst,{data:readFileSync(checkedPath(artifact,src)),mode:info.contract?.executables.includes(src)?0o755:0o644});}
 }
 const oldPaths=new Set([...SYNC_REFRESH_MAP,...DERIVED].flatMap(m=>walk(root,normalized(m.dst))));
 const baselinePath=checkedPath(root,'state/origin-baseline.txt'),baseline=existsSync(baselinePath)?parseChecksums(readFileSync(baselinePath,'utf8')):new Map();
 if(!repairSource){

  for(const p of new Set([...oldPaths,...[...baseline.keys()].filter(coverage)])){
   const path=checkedPath(root,p),local=existsSync(path)?sha256(readFileSync(path)):null,base=baseline.get(p)||null,target=payload.has(p)?sha256(payload.get(p).data):null;
   if(local!==base&&local!==target)throw new Error("Managed content differs from upstream baseline (even if committed): "+p+"; contribute it or verify the legacy source first. Do not relabel current content as upstream.");
  }
 }
 if(repairSource){
  if(!info.build_source||info.build_source.dirty)throw new Error("Source must come from a verified clean build");
  for(const [p,v] of payload)if(!existsSync(checkedPath(root,p))||sha256(readFileSync(checkedPath(root,p)))!==sha256(v.data)||baseline.get(p)!==sha256(v.data))throw new Error("Same-version files or baseline cannot be bound to the target: "+p);
  if([...oldPaths].some(p=>!payload.has(p)))throw new Error("Same-version managed file set differs from target");
  const source=readBuildSource(old);if(source&&JSON.stringify(source)!==JSON.stringify(info.build_source))throw new Error("Existing source conflict; rewrite refused");
  payload.clear();payload.set('AIPA-MANIFEST.yaml',{data:Buffer.from(withBuildSource(old,info.build_source)),mode:0o644});
 }else{
  for(const p of [...baseline.keys()])if(coverage(p))baseline.delete(p);
  for(const [p,v] of payload)baseline.set(p,sha256(v.data));
  payload.set('state/origin-baseline.txt',{data:Buffer.from(renderChecksums(baseline)),mode:0o644});
  payload.set('AIPA-MANIFEST.yaml',{data:Buffer.from(manifestNext(old,info)),mode:0o644});

  if(!prefs.channel){const channel=(old.match(/^  channel:[ \t]*(\S+)/m)||[])[1]||'stable';if(!isChannel(channel))throw new Error("Invalid original follow channel");payload.set(PREFS,{data:Buffer.from(JSON.stringify({...prefs,channel},null,2)+'\n'),mode:0o600});}
 }
 const deletes=repairSource?[]:[...oldPaths].filter(p=>!payload.has(p));
 const entries=[...payload].map(([path,v])=>({path,sha256:sha256(v.data),mode:v.mode}));
 const access={mode:frameworkOnly?'framework-only':'inspect-required',framework:[...new Set([...SYNC_REFRESH_MAP,...DERIVED].map(m=>normalized(m.dst)))],installationMetadata:['AIPA-MANIFEST.yaml','state/origin-baseline.txt','state/upgrade/**','state/aipa-admin.lock','.git/** (Git metadata)','.gitignore','.gitattributes'],excluded:frameworkOnly?['user-space/**','state/** except listed installation metadata']:[]};
 const plan={schema:1,status:'preview',current,target:info.version,channel:info.channel,identity:info.identity,commit,repair_source:repairSource,data_access:access.mode,access,entries,deletes,compatibility,migration:frameworkOnly?{status:'not-inspected',personal_data:'not-read'}:runtimeStateReport(root),protocol_reload_required:true};
 plan.digest=sha256(Buffer.from(JSON.stringify(plan)));return {plan,payload,artifact:resolve(artifact),options:{commit,allowDowngrade,repairSource,frameworkOnly}};
}
function journal(root){
 const p=checkedPath(root,JOURNAL);if(!existsSync(p))return null;const v=JSON.parse(readFileSync(p,'utf8'));
 if(v.schema!==1||!['prepared','applying','applied','committing','completed','rolled-back','recovery-required'].includes(v.phase)||!Array.isArray(v.originals)||!Array.isArray(v.plan?.entries)||!Array.isArray(v.plan?.deletes)||v.plan.entries.some(e=>!managed(e.path)||!/^[a-f0-9]{64}$/.test(e.sha256))||v.plan.deletes.some(p=>!managed(p))||v.originals.some(e=>!managed(e.path)||!['absent','file'].includes(e.kind))||new Set(v.originals.map(e=>e.path)).size!==v.originals.length)throw new Error("Unknown recovery journal format or path; execution refused");
 if(sha256(Buffer.from(v.index||'','base64'))!==v.index_hash)throw new Error("Recovery index digest mismatch");
 for(const e of v.originals)if(e.kind==='file'&&(!Number.isInteger(e.mode)||e.mode<0||e.mode>0o777||sha256(Buffer.from(e.data||'','base64'))!==e.hash))throw new Error("Invalid recovery snapshot digest or permissions");
 return v;
}
function save(root,v){atomicWriteFile(checkedPath(root,JOURNAL),JSON.stringify(v,null,2)+'\n');}
function restoreFiles(root,v){for(const e of v.originals){const p=checkedPath(root,e.path);if(e.kind==='absent'){if(existsSync(p))unlinkSync(p);}else{const bytes=Buffer.from(e.data,'base64');if(sha256(bytes)!==e.hash)throw new Error("Recovery snapshot digest mismatch");mkdirSync(dirname(p),{recursive:true});atomicWriteFile(p,bytes);if(process.platform!=='win32')chmodSync(p,e.mode);}}}
function indexPath(root){return assertWithin(root,resolve(root,git(root,['rev-parse','--git-path','index']).trim()),{rejectLinks:true});}
function rollback(root,v){
 if(git(root,['rev-parse','HEAD']).trim()!==v.head)throw new Error("HEAD changed; refusing to restore an old index. Recovery material preserved.");
 const staged=git(root,['diff','--cached','--name-only','-z']).split('\0').filter(Boolean);if(staged.some(p=>!managed(p)||p===PREFS))throw new Error("Unrelated staged content detected; rollback refused");
 restoreFiles(root,v);const bytes=Buffer.from(v.index,'base64');if(sha256(bytes)!==v.index_hash)throw new Error("Recovery index digest mismatch");atomicWriteFile(indexPath(root),bytes);v.phase='rolled-back';save(root,v);
}
function verifyCommitted(root,v){
 const head=git(root,['rev-parse','HEAD']).trim();
 if(head===v.head||git(root,['rev-parse','HEAD^']).trim()!==v.head||git(root,['diff','--cached','--name-only']).trim())return false;
 const changed=git(root,['diff','--name-only',v.head,head]).trim().split('\n').filter(Boolean),expected=new Set([...v.plan.entries.map(e=>e.path),...v.plan.deletes]);
 if(changed.some(p=>!expected.has(p)))return false;
 for(const e of v.plan.entries)if(!existsSync(checkedPath(root,e.path))||sha256(readFileSync(checkedPath(root,e.path)))!==e.sha256)return false;
 if(v.plan.deletes.some(p=>existsSync(checkedPath(root,p))))return false;
 v.phase='completed';v.completed_head=head;save(root,v);return true;
}
export function applyUpdate(root,prepared,{fault=()=>{}}={}){
 stateReady(root);const lock=checkedPath(root,ADMIN_LOCK),release=acquireFileLock(lock);let v;
 try{
  const old=journal(root);if(old&&!['completed','rolled-back'].includes(old.phase))throw new Error("An installation is incomplete; run --recover first");
  const fresh=planUpdate(root,prepared.artifact,prepared.options);if(fresh.plan.digest!==prepared.plan.digest)throw new Error("Files, target or policy changed after preview; preview again");
  const paths=[...new Set([...fresh.plan.entries.map(e=>e.path),...fresh.plan.deletes])];
  const originals=paths.map(path=>{const p=checkedPath(root,path);if(!existsSync(p))return {path,kind:'absent'};const stat=lstatSync(p);if(!stat.isFile())throw new Error("Destination is not a regular file");const data=readFileSync(p);return {path,kind:'file',data:data.toString('base64'),hash:sha256(data),mode:stat.mode&0o777};});
  const index=readFileSync(indexPath(root));v={schema:1,id:randomUUID(),phase:'prepared',plan:fresh.plan,head:git(root,['rev-parse','HEAD']).trim(),originals,index:index.toString('base64'),index_hash:sha256(index)};save(root,v);fault('prepared');
  v.phase='applying';save(root,v);
  for(const path of fresh.plan.deletes){unlinkSync(checkedPath(root,path));fault('delete',path);}
  for(const [path,row] of fresh.payload){const p=checkedPath(root,path);mkdirSync(dirname(p),{recursive:true});atomicWriteFile(p,row.data);if(process.platform!=='win32')chmodSync(p,row.mode);fault('write',path);}
  v.phase='applied';save(root,v);fault('applied');
  for(const row of fresh.plan.entries)if(sha256(readFileSync(checkedPath(root,row.path)))!==row.sha256)throw new Error("Post-install byte verification failed: "+row.path);
  const commitPaths=paths.filter(p=>p!==PREFS);

  git(root,['add','-f','-A','--',...commitPaths]);const executable=fresh.plan.entries.filter(e=>e.path!==PREFS&&e.mode===0o755).map(e=>e.path),nonExec=fresh.plan.entries.filter(e=>e.path!==PREFS&&e.mode!==0o755).map(e=>e.path);if(executable.length)git(root,['update-index','--chmod=+x','--',...executable]);if(nonExec.length)git(root,['update-index','--chmod=-x','--',...nonExec]);
  if(git(root,['diff','--cached','--name-only','-z']).split('\0').filter(Boolean).some(p=>!paths.includes(p)))throw new Error("Installation staging contains unrelated paths");
  v.phase='committing';save(root,v);fault('committing');
  if(git(root,['diff','--cached','--name-only']).trim())git(root,['-c','user.name=AIPA','-c','user.email=aipa@local','commit','-qm','chore(sync): install '+fresh.plan.target]);
  fault('committed');
  v.phase='completed';v.completed_head=git(root,['rev-parse','HEAD']).trim();save(root,v);fault('receipt-written');
  return {status:'installed',version:fresh.plan.target,identity:fresh.plan.identity,commit:fresh.plan.commit,data_access:fresh.plan.data_access,protocol_reload_required:true,migration:fresh.plan.migration,personal_restore:false,tag_created:false};
 }catch(error){if(v){try{if(['committing','completed'].includes(v.phase)&&verifyCommitted(root,v))return {status:'installed-after-reconciliation',version:v.plan.target,data_access:v.plan.data_access||'inspect-required',protocol_reload_required:true,personal_restore:false};rollback(root,v);}catch(recovery){v.phase='recovery-required';v.error=error.message;v.recovery_error=recovery.message;save(root,v);throw new Error("Installation incomplete; recovery pending: "+recovery.message);}}throw error;}finally{release();}
}
export function recoverUpdate(root){
 stateReady(root);const v=journal(root);
 const lock=checkedPath(root,ADMIN_LOCK);
 if(existsSync(lock)){const before=readFileSync(lock,'utf8'),owner=JSON.parse(before);if(!Number.isInteger(owner.pid)||typeof owner.owner!=='string')throw new Error("Invalid lock identity");try{process.kill(owner.pid,0);throw new Error("Original updater is still running; takeover refused");}catch(error){if(error.code!=='ESRCH')throw error;}if(existsSync(indexPath(root)+'.lock'))throw new Error("Git index lock still exists. Review Git subprocesses first; do not steal the lock.");if(readFileSync(lock,'utf8')!==before)throw new Error("Lock ownership changed; takeover refused");unlinkSync(lock);}
 const release=acquireFileLock(lock);try{if(!v)return {status:'no-update-to-recover'};const data_access=v.plan.data_access||'inspect-required';if(['completed','rolled-back'].includes(v.phase))return {status:v.phase,data_access};if(['committing','recovery-required'].includes(v.phase)&&verifyCommitted(root,v))return {status:'completed-after-reconciliation',data_access,protocol_reload_required:true};rollback(root,v);return {status:'rolled-back',data_access,personal_restore:false};}finally{release();}
}
