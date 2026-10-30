// init
import { cpSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuildSource, withBuildSource } from '../core-space/scripts/lib/build-source.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isFrameworkPath } from '../core-space/scripts/lib/origin-drift.mjs';

import { versionOf, VERSION_TOKEN } from '../core-space/scripts/lib/semver.mjs';

import { TELEMETRY_DISCLOSURE } from '../core-space/scripts/lib/telemetry-disclosure.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=resolve(arg('root')||'.');
const owner=arg('owner')||'me';
const industry=arg('industry')||'';
const tech=arg('tech')||'';
const role=arg('role')||"Professional";
const ownProject=arg('project')||basename(root);
if ((process.argv.includes('--project')&&!arg('project')) || !/^[\p{L}\p{N}_.-]+$/u.test(ownProject) || ['.','..'].includes(ownProject)) {
  console.error("Project ID must contain only letters, numbers, underscores, hyphens, or dots, and cannot equal '.' or '..'. Use --project <id> when the directory name is unsuitable.");
  process.exit(1);
}

const channel=arg('channel')==='beta'?'beta':'stable';
const telemetryArg=arg('telemetry');
if(process.argv.includes('--telemetry')&&telemetryArg!=='on'&&telemetryArg!=='off'){

  console.error("--telemetry accepts only on or off"); process.exit(1);
}
const telemetry=telemetryArg==='on'?'on':'off';
if(channel==='beta'&&telemetry!=='on'){
  console.error("Beta enrollment requires explicit consent to send redacted diagnostics. After consenting, rerun:");
  console.error("  aipa-init --root <directory> --channel beta --telemetry on");
  for(const l of TELEMETRY_DISCLOSURE) console.error(l);
  process.exit(1);
}

if(telemetry==='on'){
  console.log("Redacted diagnostic reporting enabled (required for beta enrollment). Content and purpose:");
  for(const l of TELEMETRY_DISCLOSURE) console.log(l);
}

try { execFileSync('git',['--version'],{stdio:'ignore'}); }
catch { console.error("Install Git first: https://git-scm.com/"); process.exit(1); }

const baseDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let buildSource=null;
let version, assistPrefix;
try {
  const source=readFileSync(join(baseDir,'ORIGIN-MANIFEST.yaml'),'utf8');
  version=versionOf(source);
  if(!version||!new RegExp('^  version:[ \\t]*'+VERSION_TOKEN+'[ \\t]*$','m').test(source))throw new Error('Missing or invalid source version');
  assistPrefix=source.match(/^\s*assist_prefix:\s*"([^"\r\n]+)"[ \t]*$/m)?.[1];
  if(!assistPrefix)throw new Error('Missing or invalid source assist_prefix');
  buildSource=readBuildSource(source);
}
catch(error){console.error("Invalid source manifest or build provenance; initialization cancelled: "+error.message);process.exit(1);}
mkdirSync(root,{recursive:true});
if(existsSync(join(root,'user-space'))){ console.error("This is already an instance (user-space exists). Update with pull-origin; do not initialize again."); process.exit(1); }
if(existsSync(join(root,'profile.yaml'))||existsSync(join(root,'memory'))){ console.error("Unrecognized existing instance layout. Back up and inspect the existing files before choosing a supported migration; initialization cancelled."); process.exit(1); }
const templatesDir=join(baseDir,'templates','personal');
if(!existsSync(templatesDir)){ console.error("Missing templates/personal template"); process.exit(1); }

for(const f of readdirSync(templatesDir)){
  const s=join(templatesDir,f);
  if(statSync(s).isFile()) cpSync(s, join(root,f));
}
if(existsSync(join(baseDir,'.gitignore'))) cpSync(join(baseDir,'.gitignore'), join(root,'.gitignore'));
if(existsSync(join(baseDir,'.claude'))) cpSync(join(baseDir,'.claude'), join(root,'.claude'), {recursive:true});

if(existsSync(join(baseDir,'.codebuddy'))) cpSync(join(baseDir,'.codebuddy'), join(root,'.codebuddy'), {recursive:true});
if(existsSync(join(baseDir,'.ide_activation'))) cpSync(join(baseDir,'.ide_activation'), join(root,'.ide_activation'), {recursive:true});
cpSync(join(baseDir,'core-space'), join(root,'core-space'), {recursive:true});
cpSync(join(baseDir,'user-space'), join(root,'user-space'), {recursive:true});

const techList=tech.split(',').map(s=>s.trim()).filter(Boolean);

writeFileSync(join(root,'AIPA-MANIFEST.yaml'),`aipa:\n  version: ${version}\n  channel: ${channel}\n  telemetry: ${telemetry}\n  owner: ${owner}\n  mode: consume\n  assist_prefix: "${assistPrefix}"\n  spaces:\n    - dir: core-space\n      owner: framework\n      overwrite: true\n    - dir: user-space\n      owner: personal\n      overwrite: false\n`,'utf8');
if(buildSource){const manifest=join(root,'AIPA-MANIFEST.yaml');writeFileSync(manifest,withBuildSource(readFileSync(manifest,'utf8'),buildSource),'utf8');}
writeFileSync(join(root,'user-space','profile.yaml'),`identity:\n  name: ${owner}\n  role: ${role}\n  industry: ${industry}\n  tech_stack: [${techList.join(', ')}]\n`,'utf8');
if(!existsSync(join(root,'user-space','privacy.yaml'))) writeFileSync(join(root,'user-space','privacy.yaml'),`upload_policy:\n  mode: ask\n  block_patterns:\n    - "password|secret|token|apikey"\n`,'utf8');

// Activation loads a project rule for every resolved project, including the instance's own
// project (user-space/projects/<project>/project.yaml). Scaffold it here so a fresh install
// can reach its first activation; without it aipa-load --context blocks with
// required_context_unavailable. Register overrides locally so aipa-project resolve
// returns the same identity instead of falling back to the directory basename.
{
  const q=(value)=>JSON.stringify(String(value));
  const ownProjectDir=join(root,'user-space','projects',ownProject);
  if(!existsSync(join(ownProjectDir,'project.yaml'))){
    mkdirSync(ownProjectDir,{recursive:true});
    writeFileSync(join(ownProjectDir,'project.yaml'),
`project_id: ${q(ownProject)}
project_name: ${q(`${owner} AIPA instance`)}
industry: ${q(industry||'personal agent')}
goal: ${q('Keep this personal AIPA instance maintained: events, daily notes, memory distillation, protocol and local integrations.')}
terms: [AIPA, personal agent, instance]
relations:
  reuse: []
public_interfaces: []
pattern_hits: []
`,'utf8');
  }
  if(ownProject!==basename(root))writeFileSync(join(ownProjectDir,'local_path'),root+'\n','utf8');
}

if(industry||techList.length){
  try{
    const out=execFileSync('node',[join(baseDir,'scripts','aipa-match-mentor.mjs'),'--industry',industry,'--tech',tech,'--role',role,'--mentors',join(baseDir,'core-space','mentors')],{encoding:'utf8'});
    const {top}=JSON.parse(out);
    console.log("Mentor match: "+(top.length?top.map(m=>`${m.name||m.mentor_id}(${m.score})`).join(', '):"No match; continue independent growth"));
  }catch(error){ console.error("Instance initialized, but mentor recommendation failed: "+error.message); }
}

try{
  const lines=[];
  const walkInst=(d,base=d)=>{
    for(const n of readdirSync(d)){
      if(n==='.git') continue;
      const p=join(d,n);
      if(statSync(p).isDirectory()) walkInst(p,base);
      else {
        const rel=relative(base,p).replace(/\\/g,'/');
        if(!isFrameworkPath(rel)) continue;
        lines.push(createHash('sha256').update(readFileSync(p)).digest('hex')+'  '+rel);
      }
    }
  };
  walkInst(root);
  mkdirSync(join(root,'state'),{recursive:true});
  writeFileSync(join(root,'state','origin-baseline.txt'), lines.sort().join('\n')+'\n', 'utf8');
}catch(e){ console.error("Baseline generation failed (skipped): " + e.message); }

try{
  execFileSync('git',['-C',root,'init'],{stdio:'ignore'});
  execFileSync('git',['-C',root,'add','-A'],{stdio:'ignore'});
  execFileSync('git',['-C',root,'-c','user.name=AIPA','-c','user.email=aipa@local','commit','-m','init '+version],{stdio:'ignore'});
  execFileSync('git',['-C',root,'tag','v'+version],{stdio:'ignore'});
}catch{ console.error("Baseline tag creation failed (skipped)"); }
console.log('init');
