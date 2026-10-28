#!/usr/bin/env node
// warmup
import {clockTimestamp as businessTimestamp} from './lib/day-clock.mjs';

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pickCmd } from './lib/argv.mjs';
import { resolveShardStore, storeReadPaths } from './lib/host-id.mjs';
import { DEFAULT_MAX_THRESHOLD, checkWarmup, doneWarmup, emptyState, statusOf } from './lib/warmup.mjs';

function arg(n){const i=process.argv.indexOf('--'+n);return i>=0?process.argv[i+1]:'';}
function tsLocal(d){return businessTimestamp(root,d);}

const root=arg('root')||'.';
const cmd=pickCmd(process.argv.slice(2), ['check', 'done', 'status']);
const project=arg('project')||'';

const warmupRel='warmup.json', warmupLegacy=join('state','warmup.json');
const warmupStore=resolveShardStore(root,warmupRel,warmupLegacy);
const statePath=warmupStore.path;

function load(){
  try{

    const found=storeReadPaths(root,warmupRel,warmupLegacy).find(p=>existsSync(p));
    if(!found) return emptyState();
    const d=JSON.parse(readFileSync(found,'utf8'));
    if(!d.projects) d.projects={};
    return d;
  }catch{ return emptyState(); }
}
function save(d){
  mkdirSync(dirname(statePath),{recursive:true});
  writeFileSync(statePath,JSON.stringify(d,null,2),'utf8');
}
function maxThreshold(){
  const n=parseInt(arg('max'),10);
  return Number.isInteger(n)&&n>0?n:DEFAULT_MAX_THRESHOLD;
}
function now(){ return arg('ts')||tsLocal(new Date()); }
function requireProject(){
  if(project) return;
  console.error("Missing --project. Resolve the project ID with aipa-project.mjs resolve --cwd <session-working-directory> --root <instance>. It defaults to the session directory name, or the product-line ID for the current branch when lines.yaml is registered.");
  process.exit(1);
}

if(cmd==='check'||cmd==='done'){
  requireProject();
  const state=load();
  const r=cmd==='check'
    ? checkWarmup(state,project,now(),maxThreshold())
    : doneWarmup(state,project,now(),maxThreshold());
  save(state);
  console.log(JSON.stringify(r));
}
else if(cmd==='status'){
  const state=load();
  if(project){
    console.log(JSON.stringify(statusOf(state,project)||{project,status:'none'}));
  }else{
    const list=Object.keys(state.projects||{}).map(p=>statusOf(state,p));
    console.log(JSON.stringify({projects:list},null,2));
  }
}
else{
  console.error("usage: check | done | status [--root <instance>] [--project <project>] [--max <n>] [--ts \"<time>\"]");
  process.exit(1);
}
