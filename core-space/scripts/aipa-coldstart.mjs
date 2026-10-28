// coldstart
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const root=arg('root')||'.';
const name=arg('name')||'me';
const industry=arg('industry')||'';
const tech=arg('tech')||'';
const goal=arg('goal')||'';
const workStyle=arg('work-style')||'';
const trait=arg('trait')||'';

mkdirSync(join(root,'user-space'),{recursive:true});

writeFileSync(join(root,'user-space','profile.yaml'),`identity:\n  name: ${name}\n  industry: ${industry}\n  tech_stack: [${tech.split(',').filter(Boolean).join(', ')}]\n`,'utf8');

const memDir=join(root,'user-space','memory');
mkdirSync(memDir,{recursive:true});
function appendIfAbsent(rel, header, line){
  const p=join(memDir,rel);
  let c=existsSync(p)?readFileSync(p,'utf8'):(header+'\n');
  if(!c.includes(line)) c=c.replace(/\s*$/,'')+'\n'+line+'\n';
  writeFileSync(p,c,'utf8');
}
if(tech) appendIfAbsent('preferences.md',"# Preferences",`- Technology stack: ${tech} (pending confirmation)`);
if(workStyle) appendIfAbsent('preferences.md',"# Preferences",`- Working style: ${workStyle} (pending confirmation)`);
if(goal) appendIfAbsent('context.md',"# Active Context",`- Project goals: ${goal} (pending confirmation)`);
if(trait) appendIfAbsent('traits.md',"# Traits Pending Confirmation",`- Improvement goals: ${trait} (pending confirmation)`);
console.log('coldstart');
