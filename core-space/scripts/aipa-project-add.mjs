// project add
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureAgentsPointer, installShellFiles } from './lib/shell-sync.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root');
const localPath=arg('local-path');
const name=arg('name');
const goal=arg('goal')||'';
const industry=arg('industry')||'';
const terms=(arg('terms')||'').split(',').map(s=>s.trim()).filter(Boolean);
const id=arg('id')||basename(localPath||'');
if(!root||!localPath||!name){console.error("Missing --root / --local-path / --name");process.exit(1);}
if(!existsSync(localPath)){console.error("Project path does not exist: "+localPath);process.exit(1);}

const projDir=join(root,'user-space','projects',id);
mkdirSync(projDir,{recursive:true});
const yaml=`project_id: ${id}\nproject_name: ${name}\nindustry: ${industry}\ngoal: ${goal}\nterms: [${terms.join(', ')}]\nrelations:\n  reuse: []\npublic_interfaces: []\npattern_hits: []\n`;
writeFileSync(join(projDir,'project.yaml'),yaml,'utf8');
writeFileSync(join(projDir,'local_path'), localPath + '\n', 'utf8');

const linkFile=join(localPath,'AIPA-INSTANCE.md');
const linkContent=`<!-- AIPA integration (device-local configuration; ignored by Git, do not commit) -->
# AIPA
- Instance directory: \`${root}\`
- Before starting work, read the instance AGENTS.md, core-space/policy.md (boundaries), user-space/profile.yaml (profile), user-space/privacy.yaml (privacy) and user-space/memory/context.md (active context).
- The instance is authoritative for memory, skills and profile. Write reusable experience and skills back to user-space/memory/ and user-space/skills/ in the instance.
`;
writeFileSync(linkFile, linkContent, 'utf8');

ensureAgentsPointer(localPath);

installShellFiles({
  instanceRoot: root,
  projectRoot: localPath,
  manifestPath: join(dirname(fileURLToPath(import.meta.url)), 'aipa-shell-hosts.json'),
});

console.log(JSON.stringify({project_id:id,project_yaml:join(projDir,'project.yaml'),instance_linked:true}));
