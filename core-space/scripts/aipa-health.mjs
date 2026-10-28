// health
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { memoryIndexPath, readMemoryIndex, writeMemoryIndex } from './lib/memory-index-store.mjs';
import { todayKey } from './lib/day-clock.mjs';
import { growthSummary } from './lib/growth-feedback.mjs';
function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
const cmd=pickCmd(process.argv.slice(2), ['rollover']);
const root=arg('root')||'.';
const today=arg('today')||todayKey(root);
const month=arg('month')||today.slice(0,7);

function readJson(p){try{return JSON.parse(readFileSync(p,'utf8'));}catch{return null;}}
function walk(d){const out=[];if(!existsSync(d))return out;for(const n of readdirSync(d)){const p=join(d,n);if(statSync(p).isDirectory())out.push(...walk(p));else out.push(p);}return out;}

const index=readMemoryIndex(root);
const entries=index.entries||[];
const total=entries.length;
const active=entries.filter(e=>e.state==='active').length;
const archivedOrKeyword=entries.filter(e=>e.state==='archived'||e.state==='keyword').length;
const active_rate=total?Math.round(active/total*100)/100:0;
const archive_rate=total?Math.round(archivedOrKeyword/total*100)/100:0;

const usage=readJson(join(root,'state','usage-stats.json'));
const retrieval_hit_rate = usage&&usage.retrieval_total ? Math.round(usage.retrieval_hits/usage.retrieval_total*100)/100 : null;
const mentor_dependency_rate = usage&&usage.total_calls ? Math.round((usage.layer2_calls||0)/usage.total_calls*100)/100 : null;
const llm_fallback_rate = usage&&usage.total_calls ? Math.round((usage.layer3_calls||0)/usage.total_calls*100)/100 : null;

const skills=walk(join(root,'user-space','skills')).filter(f=>f.endsWith('SKILL.md'));
function reuseNames(){
  const projDir=join(root,'user-space','projects');
  const m=new Map();
  if(existsSync(projDir)){
    for(const p of readdirSync(projDir)){
      const yaml=join(projDir,p,'project.yaml');
      if(!existsSync(yaml))continue;
      const lines=readFileSync(yaml,'utf8').split(/\r?\n/);
      let inReuse=false;
      const names=new Set();
      for(const l of lines){
        if(/^\s*reuse:/.test(l)){inReuse=true;continue;}
        if(inReuse){
          const mm=l.match(/^\s*-\s*(\S+)/);
          if(mm){names.add(mm[1]);continue;}
          if(/^\S/.test(l)){inReuse=false;}
        }
      }
      for(const n of names)m.set(n,(m.get(n)||0)+1);
    }
  }
  return m;
}
const reuseMap=reuseNames();
const reused=[...reuseMap.values()].filter(c=>c>=2).length;
const cross_project_reuse_rate = skills.length?Math.round(reused/skills.length*100)/100:0;

let skill_evolution_rate=0;
for(const f of skills){
  const content=readFileSync(f,'utf8');
  const m=content.match(/created:\s*([^\s]+)/);
  if(m&&m[1].startsWith(month))skill_evolution_rate++;
}

function stat(value,threshold,okTest){
  if(value===null)return {value,status:'no_data',threshold};
  return {value,status:okTest(value)?'ok':'warn',threshold};
}
const metrics={
  active_rate: stat(active_rate,'>0.4',v=>v>0.4),
  archive_rate: stat(archive_rate,'<0.5',v=>v<0.5),
  retrieval_hit_rate: stat(retrieval_hit_rate,'>0.6',v=>v>0.6),
  mentor_dependency_rate: stat(mentor_dependency_rate,null,()=>true),
  llm_fallback_rate: stat(llm_fallback_rate,null,()=>true),
  cross_project_reuse_rate: stat(cross_project_reuse_rate,null,()=>true),
  skill_evolution_rate: stat(skill_evolution_rate,null,()=>true),
};

if(cmd==='rollover'){
  const date=arg('date')||today;
  const [y,m,d]=date.split('-');
  const logsDir=join(root,'user-space','logs');
  const timelinePath=join(logsDir,'growth-timeline.md');
  if(m!=='01'||d!=='01'||!existsSync(timelinePath)){console.log('skip');process.exit(0);}
  const content=readFileSync(timelinePath,'utf8');
  const year=String(Number(y)-1);
  const sections=content.split(/(?=^## \d{4})/m);
  const lastYear=sections.filter(s=>s.trimStart().startsWith(`## ${year}`)).join('');
  const current=sections.filter(s=>!s.trimStart().startsWith(`## ${year}`)).join('');
  if(!lastYear.trim()){console.log('skip');process.exit(0);}
  mkdirSync(logsDir,{recursive:true});
  writeFileSync(join(logsDir,`growth-timeline-${year}.md`),lastYear.trim()+'\n','utf8');
  writeFileSync(timelinePath,current.trim()+'\n','utf8');
  console.log('rolled');
  process.exit(0);
}

const report=arg('report');
if(report){
  const p=report||join(root,'user-space','logs','health-report.md');
  mkdirSync(join(p,'..'),{recursive:true});
  const lines=["# Knowledge Health Report",''];
  for(const [k,v] of Object.entries(metrics)) lines.push(`- ${k}: ${v.value===null?"no data":v.value} (${v.status}${v.threshold?(", threshold "+v.threshold):''})`);
  lines.push('',"## Narrative Analysis (filled by the agent)",'');
  writeFileSync(p,lines.join('\n'),'utf8');
}

console.log(JSON.stringify({
  total, active, active_rate, archive_rate,
  retrieval_hit_rate, mentor_dependency_rate, llm_fallback_rate,
  cross_project_reuse_rate, skill_evolution_rate,
  metrics,
  observed_growth:growthSummary(root),
}));
