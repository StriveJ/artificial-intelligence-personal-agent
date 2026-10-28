// update source
import { execFileSync } from 'node:child_process';
import { mkdirSync,existsSync,writeFileSync,chmodSync,readFileSync,lstatSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { safeRelativePath,assertWithin } from './safe-path.mjs';
import { verifyChecksums,verifyOriginShape } from './origin-checksums.mjs';
import { branchOfChannel,isChannel } from './release-channel.mjs';
import { VERSION_TOKEN,versionOf,compareVersions } from './semver.mjs';
import { readBuildSource } from './build-source.mjs';
import { readUpdateContract } from './update-contract.mjs';
import { acquireFileLock } from './file-lock.mjs';
import { sha256,portableArtifactPath } from './release-package.mjs';
export function artifactInfo(root){const hashes=verifyChecksums(root);verifyOriginShape(root,{strict:true});const text=readFileSync(join(root,'ORIGIN-MANIFEST.yaml'),'utf8'),version=versionOf(text);if(!new RegExp('^'+VERSION_TOKEN+'$').test(version))throw new Error("Invalid artifact version");if(existsSync(join(root,'VERSION'))&&readFileSync(join(root,'VERSION'),'utf8').trim()!==version)throw new Error("VERSION differs from manifest");const contract=readUpdateContract(root);const channel=(text.match(/^  channel:[ \t]*(\S+)/m)||[])[1]||(version.includes('-beta.')?'beta':'stable');if(!isChannel(channel))throw new Error("Invalid artifact channel");return {version,channel,build_source:readBuildSource(text),contract,identity:sha256(Buffer.from([...hashes].sort().map(([p,h])=>p+':'+h).join('\n'))),hashes};}
function validRemote(remote){
 if(typeof remote!=='string'||/[\x00-\x1f]/.test(remote))throw new Error("Invalid remote address");
 if(/^https:\/\//.test(remote)){const url=new URL(remote);if(url.username||url.password)throw new Error("Remote address must not contain credentials");}
 else if(!existsSync(remote)||!lstatSync(remote).isDirectory()||existsSync(join(remote,'AIPA-MANIFEST.yaml')))throw new Error("Git sources accept only HTTPS or a local public-artifact directory; personal instances and arbitrary protocols are refused");
 return remote;
}
const NETWORK_GIT={stdio:'pipe',timeout:120000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}};
export function gitArtifact({remote,cache,dest,channel='stable',version='',commit=''}={}){
 if(!remote||!isChannel(channel)||version&&!new RegExp('^'+VERSION_TOKEN+'$').test(version)||commit&&!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)||version&&commit)throw new Error("Invalid Git source arguments");
 validRemote(remote);
 const id=createHash('sha256').update(remote).digest('hex').slice(0,20),mirror=assertWithin(cache,join(cache,id+'.git'),{rejectLinks:true});mkdirSync(cache,{recursive:true});
 const release=acquireFileLock(mirror+'.lock');
 try{
  if(!existsSync(mirror))execFileSync('git',['clone','--bare','--',remote,mirror],NETWORK_GIT);
  else execFileSync('git',['-C',mirror,'fetch','--prune','origin','refs/heads/*:refs/heads/*','refs/tags/*:refs/tags/*'],NETWORK_GIT);
  const git=args=>execFileSync('git',['-C',mirror,...args],{maxBuffer:256*1024*1024,timeout:120000});
  const ref=commit|| (version?'refs/tags/v'+version:'refs/heads/'+branchOfChannel(channel)),resolved=git(['rev-parse','--verify',ref+'^{commit}']).toString().trim();
  if(existsSync(dest))throw new Error("Git candidate directory must not exist");
  const rows=git(['ls-tree','-rz','--full-tree',resolved]).toString().split('\0').filter(Boolean);
  if(rows.length>10000)throw new Error("Git artifact file count exceeds limit");mkdirSync(dest,{recursive:true});const names=new Set();let bytes=0;
  for(const row of rows){const m=row.match(/^(100644|100755) blob ([a-f0-9]+)\t(.+)$/);if(!m)throw new Error("Git artifact contains links, submodules or special entries");const path=portableArtifactPath(m[3]),key=path.toLowerCase();if(names.has(key))throw new Error("Git artifact paths have a case conflict");names.add(key);const data=git(['cat-file','blob',m[2]]);bytes+=data.length;if(bytes>256*1024*1024)throw new Error("Git artifact size exceeds limit");const out=assertWithin(dest,join(dest,path),{rejectLinks:true});mkdirSync(dirname(out),{recursive:true});writeFileSync(out,data);if(process.platform!=='win32')chmodSync(out,m[1]==='100755'?0o755:0o644);}
  const info=artifactInfo(dest);if(version&&info.version!==version||!version&&!commit&&info.channel!==channel)throw new Error("Target reference conflicts with artifact version/channel");
  if(info.contract){const actual=rows.filter(r=>r.startsWith('100755 ')).map(r=>r.slice(r.indexOf('\t')+1)).sort();if(JSON.stringify(actual)!==JSON.stringify([...info.contract.executables].sort()))throw new Error("Git executable modes differ from compatibility declaration");}
  return {root:dest,commit:resolved,info};
 }finally{release();}
}
export function releaseCatalog(remote){
 validRemote(remote);const rows=execFileSync('git',['ls-remote','--tags','--',remote],{...NETWORK_GIT,encoding:'utf8'}).trim().split('\n');const map=new Map();
 for(const row of rows){const m=row.match(/^([a-f0-9]+)\s+refs\/tags\/v(.+?)(\^\{\})?$/);if(m&&new RegExp('^'+VERSION_TOKEN+'$').test(m[2])){const old=map.get(m[2]);if(!old||m[3])map.set(m[2],{version:m[2],commit:m[1],compatibility:'not-yet-verified'});}}
 return [...map.values()].sort((a,b)=>compareVersions(b.version,a.version));
}
