// Synchronize the framework using the authoritative mapping and verified upstream checksums. Enforce channel consent, independent Git root, clean affected paths and empty staging before applying. Preserve personal data and ignore policy; diagnose migration needs without changing them. Generate a baseline and commit only scoped framework changes; incomplete operations must not claim success.
import { existsSync, cpSync, readFileSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { parseChecksums } from './lib/origin-drift.mjs';
import { SYNC_REFRESH_MAP, SYNC_DSTS, SYNC_DIR_DSTS, DERIVED_DSTS } from './lib/origin-sync-map.mjs';

import { compareVersions, versionOf, VERSION_TOKEN } from './lib/semver.mjs';

import { branchOfChannel, isChannel } from './lib/release-channel.mjs';

import { TELEMETRY_DISCLOSURE } from './lib/telemetry-disclosure.mjs';
import { verifyChecksums } from './lib/origin-checksums.mjs';
import { assertWithin } from './lib/safe-path.mjs';
import { isOwnRepository, assertEmptyStaging } from './lib/git-staging.mjs';
import { hostIdIgnoreStatus, HOST_ID_REL } from './lib/host-id.mjs';
import { atomicWriteFile } from './lib/atomic-write.mjs';
import { readBuildSource, withBuildSource } from './lib/build-source.mjs';
import { runtimeStateReport } from './lib/runtime-state-policy.mjs';
import { strictArgs,UPGRADE_ARGS,modernUpgradeArgs } from './lib/strict-args.mjs';
import { updatePreferences } from './lib/update-engine.mjs';
try{strictArgs(process.argv.slice(2),UPGRADE_ARGS);}
catch(error){console.error(error.message);process.exit(1);}
if(modernUpgradeArgs(process.argv.slice(2))){
  await import('./aipa-upgrade.mjs');
}else{
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root')||'.';
const ownRepository = isOwnRepository(root);
let preferences={channel:null,pin:null};
try{if(ownRepository)preferences=updatePreferences(root);}
catch(error){console.error("Cannot verify update preferences: "+error.message);process.exit(1);}
if(preferences.pin){console.log("Version pinned to "+preferences.pin.version+"; legacy entry point will not upgrade. Explicitly unpin with aipa-upgrade --unpin --apply.");process.exit(0);}
try { assertEmptyStaging(root); }
catch (error) { console.error("Pull refused: " + error.message); process.exit(1); }
try {
  const status = hostIdIgnoreStatus(root);
  if (status.status === 'tracked') console.error("Migration note: " + HOST_ID_REL + " is tracked by Git. Adding an ignore rule does not untrack it; review and untrack manually. This command does not modify personal .gitignore.");
  else if (status.status === 'unignored') console.error("Migration note: ignore " + HOST_ID_REL + " in personal .gitignore to avoid sharing machine identity across devices. This command diagnoses only and does not change ignore rules.");
} catch (error) { console.error("Cannot verify machine-identity ignore status: " + error.message); }
if(ownRepository)try{
  const pending=runtimeStateReport(root).rows.filter(row=>row.status!=='safe');
  if(pending.length)console.error("Runtime migration note (personal rules unchanged): "+pending.map(r=>r.path+':'+r.status).join(', ')+"; preview with aipa-runtime-migrate --root <instance>");
}catch(error){console.error("Cannot verify runtime ignore status: "+error.message);}
function git(args){
  if (!ownRepository) throw new Error("Directory is not an independent instance Git root; refusing to operate on the parent repository");
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function remoteUrlOf(dir){ try { return execFileSync('git',['-C',dir,'remote','get-url','origin'],{encoding:'utf8'}).trim(); } catch { return ''; } }

function readChannel(p){ return ((readFileSync(p,'utf8').match(/^[ \t]+channel:[ \t]*(\S+)/m)||[])[1])||''; }
const remote=arg('remote')||'https://github.com/StriveJ/artificial-intelligence-personal-agent.git';

const channelArg=arg('channel')||preferences.channel||'';
if(channelArg&&!isChannel(channelArg)){
  console.error("--channel accepts only stable or beta (received \""+channelArg+"\"); update cancelled"); process.exit(1);
}

const sync=SYNC_REFRESH_MAP;

const syncDsts=SYNC_DSTS;
const coverFiles=syncDsts.concat(DERIVED_DSTS);

const coverDirs=SYNC_DIR_DSTS.map(d=>d+'/');
const inCoverage=(p)=>coverFiles.includes(p)||coverDirs.some(pre=>p.startsWith(pre));

const cacheDir=join(root,'state','.origin-cache');
assertWithin(root, cacheDir, { rejectLinks: true });
const cacheRemote=existsSync(join(cacheDir,'.git'))?remoteUrlOf(cacheDir):'';

function cacheHead(){ try{ return execFileSync('git',['-C',cacheDir,'symbolic-ref','--short','HEAD'],{encoding:'utf8'}).trim(); }catch{ return ''; } }
function hasRemoteBranch(b){ try{ execFileSync('git',['-C',cacheDir,'rev-parse','--verify','--quiet','refs/remotes/origin/'+b],{stdio:'pipe'}); return true; }catch{ return false; } }
try{
  if(cacheRemote&&cacheRemote===remote) execFileSync('git',['-C',cacheDir,'fetch','--prune','origin'],{stdio:'inherit'});
  else { mkdirSync(dirname(cacheDir),{recursive:true}); rmSync(cacheDir,{recursive:true,force:true}); execFileSync('git',['clone',remote,cacheDir],{stdio:'inherit'}); }
}catch(e){ console.error("Cannot pull base: "+e.message); process.exit(1); }

const instManifest=join(root,'AIPA-MANIFEST.yaml');
const readChannelIf=(p)=>{ try{ return p&&existsSync(p)?readChannel(p):''; }catch{ return ''; } };
const targetBranch=branchOfChannel(channelArg||readChannelIf(instManifest)||readChannelIf(join(cacheDir,'ORIGIN-MANIFEST.yaml')));
if(hasRemoteBranch(targetBranch)){

  try{ execFileSync('git',['-C',cacheDir,'checkout','-B',targetBranch,'origin/'+targetBranch],{stdio:'pipe'}); }
  catch(e){ console.error("Cannot switch base branch ("+targetBranch+'): '+e.message); process.exit(1); }
}else{

  console.error("Warning: remote has no "+targetBranch+" branch; retaining the cached branch"+(cacheHead()?' ('+cacheHead()+')':''));
  try{ execFileSync('git',['-C',cacheDir,'pull'],{stdio:'pipe'}); }
  catch(e){ console.error("Cannot pull base: "+e.message); process.exit(1); }
}

{
  const raw = ownRepository ? git(['-c', 'core.quotepath=false', 'status', '--porcelain', '-z']) : '';
  const parts = raw.split('\0').filter(Boolean);
  const changed = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i], xy = e.slice(0, 2), p = e.slice(3);
    if (!p) continue;
    changed.push(p);
    if (xy[0] === 'R' || xy[1] === 'R') { i++; if (parts[i]) changed.push(parts[i]); }
  }
  const dirty = [...new Set(changed)].filter(inCoverage);
  if (dirty.length) {
    console.error("Pull refused: synchronization would overwrite paths with uncommitted changes. Run aipa-contribute-status to account for them first. Affected files:");
    for (const p of dirty) console.error('  ' + p);
    process.exit(1);
  }
}

const baseManifest=join(cacheDir,'ORIGIN-MANIFEST.yaml');
if(!existsSync(baseManifest)){ console.error("Base lacks ORIGIN-MANIFEST.yaml (no version); update cancelled"); process.exit(1); }
try { verifyChecksums(cacheDir); }
catch (error) { console.error("Upstream integrity verification failed; update not applied: " + error.message); process.exit(1); }

const baseVer=versionOf(readFileSync(baseManifest,'utf8'));
if(!baseVer){ console.error("Base ORIGIN-MANIFEST.yaml lacks version; update cancelled"); process.exit(1); }
const basePrefix=(readFileSync(baseManifest,'utf8').match(/^\s*assist_prefix:\s*"([^"]+)"/m)||[])[1]||'';
const instVer=existsSync(instManifest)?(versionOf(readFileSync(instManifest,'utf8'))||'0.0.0'):'0.0.0';

const normChannel=(v,where)=>{
  const s=String(v||'').trim();
  if(isChannel(s)) return s;
  if(s) console.error("Warning: "+where+" has an unrecognized release channel \""+s+"\" (only stable/beta supported); treating as stable");
  return 'stable';
};
const instChannel=normChannel(existsSync(instManifest)?readChannel(instManifest):'',"Instance AIPA-MANIFEST.yaml");
const baseChannel=channelArg||normChannel(readChannel(baseManifest),"Base ORIGIN-MANIFEST.yaml");
const crossChannel=baseChannel!==instChannel;
if(!crossChannel&&compareVersions(baseVer,instVer)<=0){
  console.log("Already current (instance v"+instVer+" >= base v"+baseVer+"); no update needed"); process.exit(0);
}
if(crossChannel) console.log("Switching channel: "+instChannel+' → '+baseChannel+" (this switches release channels rather than upgrading a version)");

if(crossChannel && baseChannel==='beta'){

  if(!existsSync(instManifest)){
    console.error("This directory is not an AIPA instance (missing "+instManifest+"); cannot enroll in beta.");
    console.error("Run aipa-init here first, or point --root to the instance root.");
    process.exit(1);
  }

  const tel=(((readFileSync(instManifest,'utf8').match(/^[ \t]+telemetry:[ \t]*(\S+)/m)||[])[1])||'off');
  if(tel!=='on'){
    console.error("Beta enrollment requires explicit consent to send redacted diagnostics. After consenting, run:");
    console.error("  aipa-channel --root <instance> --telemetry on");
    for(const l of TELEMETRY_DISCLOSURE) console.error(l);

    console.error("(After consent, rerun the same aipa-pull-origin --channel beta command.)");
    process.exit(1);
  }
}

let nextManifest = null;
let previousBaseline = new Map();
try {
  if (existsSync(instManifest)) {
    const m = readFileSync(instManifest, 'utf8');
    const hadPrefix = /^[ \t]+assist_prefix:/m.test(m);
    nextManifest = m.replace(new RegExp(String.raw`^([ \t]*)version:[ \t]*${VERSION_TOKEN}`, 'm'), '$1version: ' + baseVer)
      .replace(/^([ \t]*)assist_prefix:[ \t]*"[^"\r\n]*"/m, (_, indent) => indent + 'assist_prefix: "' + basePrefix + '"');
    if (!new RegExp(String.raw`^[ \t]+version:[ \t]*${VERSION_TOKEN}`, 'm').test(nextManifest) || (hadPrefix && !/^[ \t]+assist_prefix:/m.test(nextManifest))) {
      throw new Error("Invalid YAML structure after manifest synchronization (version/assist_prefix indentation missing)");
    }
    if (crossChannel) {
      const eol = m.includes('\r\n') ? '\r\n' : '\n';
      nextManifest = /^[ \t]+channel:/m.test(nextManifest)
        ? nextManifest.replace(/^([ \t]*)channel:[^\r\n]*/m, '$1channel: ' + baseChannel)
        : nextManifest.replace(/^([ \t]*)version:[^\r\n]*/m, (line, indent) => line + eol + indent + 'channel: ' + baseChannel);
    }
    nextManifest = withBuildSource(nextManifest, readBuildSource(readFileSync(baseManifest,'utf8')));
  }
  const baseline = join(root, 'state', 'origin-baseline.txt');
  assertWithin(root, baseline, { rejectLinks: true });
  if (existsSync(baseline)) previousBaseline = parseChecksums(readFileSync(baseline, 'utf8'));
} catch (error) { console.error("Sync-state preflight failed; update not applied: " + error.message); process.exit(1); }

const ALLOWED=[/^core-space(\/|$)/, /^AGENTS\.md$/, /^\.claude[\/\\]commands[\/\\]aipa\.md$/, /^\.claude[\/\\]settings\.json$/, /^\.claude[\/\\]hooks[\/\\]session-hook\.mjs$/, /^\.codebuddy[\/\\]commands[\/\\]aipa\.md$/];
try {
  for (const { dst } of sync) {
    if (!ALLOWED.some(re=>re.test(dst.replace(/\\/g,'/')))) throw new Error("Sync destination escapes allowed scope: " + dst);
    assertWithin(root, join(root, dst), { rejectLinks: true });
  }
  assertWithin(root, instManifest, { rejectLinks: true });
  assertWithin(root, join(root, '.ide_activation', 'aipa.md'), { rejectLinks: true });
  assertWithin(root, join(root, 'state', 'origin-baseline.txt'), { rejectLinks: true });
} catch (error) { console.error("Update destination preflight failed; update not applied: " + error.message); process.exit(1); }
for(const {src,dst} of sync){
  if(!ALLOWED.some(re=>re.test(dst.replace(/\\/g,'/')))){ console.error("Sync destination escapes allowed scope: "+dst); process.exit(1); }
  const s=join(cacheDir,src), d=join(root,dst);
  if(existsSync(s)){ rmSync(d,{recursive:true,force:true}); mkdirSync(dirname(d),{recursive:true}); cpSync(s,d,{recursive:true}); }
}

const upstreamShell=join(root,'.claude','commands','aipa.md');
if(existsSync(upstreamShell)){
  mkdirSync(join(root,'.ide_activation'),{recursive:true});
  cpSync(upstreamShell, join(root,'.ide_activation','aipa.md'));
}

if (nextManifest !== null) atomicWriteFile(instManifest, nextManifest);

try{
  const rel=(p)=>p.replace(/\\/g,'/');
  const collect=(abs,base,out)=>{
    if(!existsSync(abs)) return out;
    if(statSync(abs).isDirectory()) for(const n of readdirSync(abs)){
      if(n==='.git') continue;
      collect(join(abs,n),base,out);
    }
    else out.push(rel(relative(base,abs)));
    return out;
  };
  const surface=new Set();
  for(const {dst} of sync){ const r=rel(dst); const p=join(root,r);
    if(existsSync(p)&&statSync(p).isDirectory()) for(const f of collect(p,p,[])) surface.add(r+'/'+f);
    else surface.add(r);
  }
  for(const d of DERIVED_DSTS) surface.add(d);

  const merged=new Map(previousBaseline);
  for(const r of surface){
    const p=join(root,r);
    if(existsSync(p)) merged.set(r,createHash('sha256').update(readFileSync(p)).digest('hex'));
    else merged.delete(r);
  }
  mkdirSync(join(root,'state'),{recursive:true});
  atomicWriteFile(join(root,'state','origin-baseline.txt'),
    [...merged].sort((a,b)=>a[0]<b[0]?-1:1).map(([p,h])=>h+'  '+p).join('\n')+'\n','utf8');
}catch(e){ console.error("Files synchronized, but baseline generation failed; update incomplete: " + e.message); process.exit(1); }

if (ownRepository) try{
  const addTargets=[...new Set([...coverFiles, 'state/origin-baseline.txt', 'AIPA-MANIFEST.yaml'])]
    .filter(p=>existsSync(join(root,p)));
  if(addTargets.length) git(['add','-A','--',...addTargets]);
  const stagedPaths = git(['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean);
  if (stagedPaths.some(p => !inCoverage(p) && !['state/origin-baseline.txt', 'AIPA-MANIFEST.yaml'].includes(p))) throw new Error("Staging contains changes outside this synchronization scope; commit refused");
  if (stagedPaths.length) git(['-c','user.name=AIPA','-c','user.email=aipa@local','commit','-q','-m',`chore(sync): base v${instVer} → v${baseVer}`]);

  git(['tag', '-f', 'v'+baseVer]);
}catch(e){ console.error("Files synchronized, but sync commit failed; update incomplete: " + e.message); process.exit(1); }

if (!ownRepository) console.error("Note: destination is not an independent Git root. Files and baseline synchronized; no commit or tag created.");
console.log("Base updated");
}
