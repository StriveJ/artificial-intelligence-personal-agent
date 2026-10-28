// route
import { recordGrowth } from './lib/growth-feedback.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverSkills } from './lib/skill-discovery.mjs';
function arg(name){ const i=process.argv.indexOf('--'+name); return i>=0 ? process.argv[i+1] : ''; }
function triggersFrom(skills){
  const out=[];
  for(const skill of skills){
    const p=join(skill.dir,'SKILL.md');
    const text=readFileSync(p,'utf8');
    let inSection=false;
    for(const line of text.split(/\r?\n/)){
      if(/^##\s*(?:Trigger phrases|\u89e6\u53d1\u53e3\u4ee4)\s*$/i.test(line)){ inSection=true; continue; }
      if(inSection && line.startsWith('## ')){ inSection=false; continue; }
      if(inSection){
        for(const part of line.replace(/^-\s*/,'').split('/')){
          const t=part.trim(); if(t) out.push(t);
        }
      }
    }
  }
  return out;
}
const query=arg('query');
const root=arg('root')||'.';
const personal=arg('personal-skills')||join(root,'user-space/skills');
const base=arg('base-skills')||join(root,'core-space/common/skills');

const personalSkills=discoverSkills(personal),overridden=new Set(personalSkills.map(s=>s.id));
const baseSkills=discoverSkills(base).filter(s=>!overridden.has(s.id));
if(triggersFrom(personalSkills).includes(query)) console.log('personal');
else if(triggersFrom(baseSkills).includes(query)) console.log('base');
else console.log('llm');
