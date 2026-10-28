// runtime state policy
import { execFileSync } from 'node:child_process';
import { isOwnRepository } from './git-staging.mjs';
export const PRIVATE_RUNTIME_EXACT = [
  'state/base-dir','state/current-sid','state/current-tool','state/last-active-day',
  'state/memory-decay.json','state/resume-prompt.md','state/search-log.jsonl',
  'state/session-checkpoint.md','state/device-id','state/host-id','state/session-context.json',
  'state/file-loads.jsonl','state/growth-events.jsonl','state/external-budget.json',
  'state/external-cancel.json','state/offline-tasks.json','state/restore-report.json',
  'state/sleep-mode.md','state/memory-transaction.json','state/memory-usage-receipts.json','user-space/memory/memory-meta.json.lock',
];
export const PRIVATE_RUNTIME_PATTERNS = [...PRIVATE_RUNTIME_EXACT,
  'state/*.lock','state/*.log','state/.origin-cache/','state/offload/','state/test/',
  'state/upgrade/'];
export const BUDGET_PRIVATE_PATHS = ['state/external-budget.json','state/external-cancel.json','state/external-budget.json.lock'];
export function privateRuntimePath(path) {
  const p=String(path).replace(/\\/g,'/');
  return PRIVATE_RUNTIME_EXACT.includes(p)||/^state\/[^/]+\.(?:lock|log)$/.test(p)||
    ['state/.origin-cache/','state/offload/','state/test/','state/upgrade/'].some(prefix=>p.startsWith(prefix));
}
export function runtimeIgnoreStatuses(root, paths) {
  if(!isOwnRepository(root))return paths.map(path=>({path,status:'unknown',tracked:null,ignored:null}));
  const files=execFileSync('git',['-C',root,'ls-files','-z','--',...paths],{encoding:'utf8',stdio:'pipe'}).split('\0').filter(Boolean);
  let output='';
  try{output=execFileSync('git',['-C',root,'check-ignore','--no-index','-z','--stdin'],{input:paths.join('\0')+'\0',encoding:'utf8',stdio:'pipe'});}
  catch(error){if(error.status!==1)throw error;}
  const ignoredPaths=new Set(output.split('\0').filter(Boolean));
  return paths.map(path=>{const tracked=files.some(p=>p===path||p.startsWith(path+'/')),ignored=ignoredPaths.has(path);return {path,status:tracked?'tracked':ignored?'safe':'unignored',tracked,ignored};});
}
export const runtimeIgnoreStatus=(root,path)=>runtimeIgnoreStatuses(root,[path])[0];
export function runtimeStateReport(root) {
  const tracked=isOwnRepository(root)?execFileSync('git',['-C',root,'ls-files','-z'],{encoding:'utf8',stdio:'pipe'}).split('\0').filter(privateRuntimePath):[];
  const rows=runtimeIgnoreStatuses(root,[...new Set([...PRIVATE_RUNTIME_EXACT,...BUDGET_PRIVATE_PATHS,...tracked])]);
  return {status:rows.every(r=>r.status==='safe')?'ready':'migration-required',rows,host_logs:'shared-host-shards'};
}
