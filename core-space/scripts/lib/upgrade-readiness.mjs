import { existsSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertInstanceRoot } from './runtime-migration.mjs';
import { runtimeStateReport } from './runtime-state-policy.mjs';
import { readMemorySources,memorySourceSnapshot,memoryRecords } from './memory-source.mjs';
import { readMemoryMeta,projectMemoryMeta,bodyHash } from './memory-meta.mjs';
import { readMemoryIndex } from './memory-index-store.mjs';
import { readLocalLog } from './local-log.mjs';
import { readSessionContext } from './session-context.mjs';
import { DERIVED } from './origin-sync-map.mjs';
import { sha256 } from './release-package.mjs';
import { activeProjectIds,retentionReason } from './memory-retention.mjs';
import { verifyChecksums } from './origin-checksums.mjs';
export function upgradeReadiness(root,{sid=''}={}){
 assertInstanceRoot(root);const sources=readMemorySources(root),meta=readMemoryMeta(root),index=readMemoryIndex(root,{strict:true});
 const records=memoryRecords(sources).map(e=>projectMemoryMeta(e,meta));
 const active=activeProjectIds(root);
 const fresh=index.identity_version===2&&JSON.stringify(index.source_snapshot)===JSON.stringify(memorySourceSnapshot(sources))&&index.metadata_hash===bodyHash(JSON.stringify(meta));
 const loads=readLocalLog(root,{shard:'file-loads.jsonl',legacy:'state/file-loads.jsonl'}).filter(e=>!sid||e.sid===sid);
 readSessionContext(root,{sid});const sessionFile=join(root,'state/session-context.json'),sessions=existsSync(sessionFile)?JSON.parse(readFileSync(sessionFile,'utf8')).sessions:{};
 const shell=DERIVED.map(m=>({path:m.dst,ready:existsSync(join(root,m.src))&&existsSync(join(root,m.dst))&&sha256(readFileSync(join(root,m.src)))===sha256(readFileSync(join(root,m.dst)))}));
 let cache={status:'absent'};const cacheRoot=join(root,'state','.origin-cache');
 if(existsSync(cacheRoot)){try{cache={status:'working-copy-valid',files:verifyChecksums(cacheRoot).size};}catch(error){cache={status:'untrusted-working-copy',stray_state:existsSync(join(cacheRoot,'state')),reason:error.message,attribution:'verify fixed Git objects before blaming release'};}}
 return {status:'checked-read-only',cache,runtime:runtimeStateReport(root),index:{fresh,entries:index.entries.length,current_records:records.length,rebuild_needed:!fresh},metadata:{verified:records.filter(e=>e.metadata_verified).length,unverified:records.filter(e=>!e.metadata_verified).length,pinned:records.filter(e=>e.metadata_verified&&e.pinned&&e.confirmation?.status!=='revoked').length,confirmed_decisions:records.filter(e=>e.metadata_verified&&e.type==='decision'&&e.confirmation?.status==='user_confirmed'&&e.decision_exempt!==false).length,project_annotated:records.filter(e=>e.metadata_verified&&e.projects?.length).length,active_project_retained:records.filter(e=>retentionReason(e,active).startsWith('active-project:')).length},session:{explicit_sid:Boolean(sid),registered:Boolean(sid&&Object.values(sessions).some(e=>e.sid===sid))},loads:{records:loads.length,observed_read_bytes:loads.reduce((n,e)=>n+(Number(e.read_bytes)||0),0),recorded_output_bytes:loads.reduce((n,e)=>n+(Number(e.bytes)||0),0),scope:'aipa-load only; other host reads unknown',host_total_reads:null,host_tokens:null},derived_shells:shell,protocol_execution:'requires actual host observation',automatic_personal_migration:false};
}
