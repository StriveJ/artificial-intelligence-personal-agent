// install maintenance
import { existsSync,readFileSync } from 'node:fs';
import { join } from 'node:path';

export function assertNoActiveInstall(root){
 const memory=join(root,'state','memory-transaction.json');
 if(existsSync(memory)){
  const transaction=JSON.parse(readFileSync(memory,'utf8'));
  if(transaction.schema!==1||!['prepared','applying','completed','rolled-back','recovery-required'].includes(transaction.phase)||transaction.phase==='recovery-required'||(!['completed','rolled-back'].includes(transaction.phase)&&transaction.pid!==process.pid))throw new Error("Memory write/recovery is incomplete. Run aipa-distill confirm --recover first; partially written material must not be used.");
 }
 const path=join(root,'state','upgrade','transaction.json');if(!existsSync(path))return;
 const journal=JSON.parse(readFileSync(path,'utf8'));
 if(journal.schema!==1||!['completed','rolled-back'].includes(journal.phase))throw new Error("Framework update/recovery is incomplete. Run aipa-upgrade --recover first; sessions, models and derived writes are blocked.");
}
