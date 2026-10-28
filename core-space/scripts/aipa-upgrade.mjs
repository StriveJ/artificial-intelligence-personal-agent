// upgrade
import { mkdirSync,readFileSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { strictArgs,UPGRADE_ARGS } from './lib/strict-args.mjs';
import { assertWithin,assertDisjointPaths } from './lib/safe-path.mjs';
import { assertInstanceRoot } from './lib/runtime-migration.mjs';
import { runtimeIgnoreStatus } from './lib/runtime-state-policy.mjs';
import { gitArtifact,releaseCatalog } from './lib/update-source.mjs';
import { unpackArtifact,PACKAGE_LIMITS } from './lib/release-package.mjs';
import { planUpdate,applyUpdate,recoverUpdate,updatePreferences,setUpdatePreferences } from './lib/update-engine.mjs';
import { upgradeReadiness } from './lib/upgrade-readiness.mjs';
async function main(){
 const a=strictArgs(process.argv.slice(2),UPGRADE_ARGS);
 if(!a.root)throw new Error("Explicit --root required");const root=resolve(a.root);assertInstanceRoot(root);
 const sourceCount=['artifact','package','url','remote'].filter(k=>a[k]).length;
 if(sourceCount>1||a.version&&a.commit||a.pin&&a.unpin||a.channel&&a.subscribe)throw new Error("Conflicting source, version or pin arguments");
 if(a.check){if(Object.keys(a).some(k=>!['root','check','sid'].includes(k)))throw new Error("--check accepts only --root and optional --sid");return upgradeReadiness(root,{sid:a.sid});}
 if(a.sid)throw new Error("--sid is only supported with --check");
 if(a.recover){if(Object.keys(a).some(k=>!['root','recover'].includes(k)))throw new Error("--recover cannot be combined with other actions");return recoverUpdate(root);}
 if(a.list){if(!a.remote||Object.keys(a).some(k=>!['root','remote','list'].includes(k)))throw new Error("--list accepts only --root and --remote");return {status:'catalog',releases:releaseCatalog(a.remote)};}
 if(a.unpin||a.subscribe){if(!a.apply||sourceCount||Object.keys(a).some(k=>!['root','apply','unpin','subscribe'].includes(k)))throw new Error("Preference changes require --apply and cannot include an installation source");return {status:'preference-updated',preferences:setUpdatePreferences(root,{channel:a.subscribe,unpin:a.unpin})};}
 if(sourceCount!==1)throw new Error("Requires one of --artifact, --package, --url or --remote");
 if((a.version||a.commit||a.channel)&&!a.remote)throw new Error("Version/commit/one-time channel arguments apply only to Git sources");
 if(a.pin&&!a.apply)throw new Error("Pinning is saved after successful installation and requires --apply");
 const prefs=updatePreferences(root);let artifact=a.artifact,commit='';
 if(artifact)assertDisjointPaths(root,artifact);
 else{
  const row=runtimeIgnoreStatus(root,'state/upgrade/candidates/probe');if(row.tracked||!row.ignored)throw new Error("Complete state/upgrade/ private-rule migration before preparing a candidate");
  const work=assertWithin(root,join(root,'state','upgrade','candidates',randomUUID()),{rejectLinks:true});mkdirSync(work,{recursive:true});artifact=join(work,'artifact');
  if(a.remote){
   const manifest=readFileSync(join(root,'AIPA-MANIFEST.yaml'),'utf8'),channel=a.channel||prefs.channel||(manifest.match(/^  channel:[ \t]*(\S+)/m)||[])[1]||'stable';
   const selectedCommit=a.commit||(!a.version?prefs.pin?.commit:'')||'',selectedVersion=a.version||(!selectedCommit?prefs.pin?.version:'')||'';
   const result=gitArtifact({remote:a.remote,cache:join(root,'state','upgrade','git'),dest:artifact,channel,version:selectedVersion,commit:selectedCommit});commit=result.commit;
  }else{
   let bytes;
   if(a.url){
    if(!/^https:\/\//.test(a.url)||!a.sha256||!/^[a-f0-9]{64}$/.test(a.sha256)||new URL(a.url).username)throw new Error("Online packages require HTTPS, a credential-free URL and a known SHA256");
    const response=await fetch(a.url,{signal:AbortSignal.timeout(120000),redirect:'error'});if(!response.ok||Number(response.headers.get('content-length')||0)>PACKAGE_LIMITS.compressed)throw new Error("Invalid package download response");
    const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;if(total>PACKAGE_LIMITS.compressed)throw new Error("Downloaded package exceeds size limit");chunks.push(chunk);}bytes=Buffer.concat(chunks);
   }else bytes=readFileSync(a.package);
   unpackArtifact(bytes,artifact,{expectedHash:a.sha256});
  }
 }
 const prepared=planUpdate(root,artifact,{commit,allowDowngrade:a['allow-downgrade'],repairSource:a['repair-source'],frameworkOnly:a['framework-only']===true});if(!a.apply)return prepared.plan;
 const result=applyUpdate(root,prepared);
 if(a.pin){try{result.preferences=setUpdatePreferences(root,{pin:{version:prepared.plan.target,identity:prepared.plan.identity,commit:commit||null}});}catch(error){throw new Error("Framework installed, but saving the pin policy failed: "+error.message);}}
 return result;
}
main().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
