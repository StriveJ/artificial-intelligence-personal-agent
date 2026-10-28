// growth feedback
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { appendLocalLog,readLocalLog } from './local-log.mjs';
import { acquireFileLock } from './file-lock.mjs';
export const GROWTH_LOG={shard:'growth-events.jsonl',legacy:'state/growth-events.jsonl'};
const kinds=new Set(['retrieved','routed','executed','adopted','rejected','corrected','undo']);
export function recordGrowth(root,{kind,target,eventId='',reason='',byUser=false,project='',sid='',undoId=''}={}) {
  if(!kinds.has(kind)||!target)throw new Error("Invalid feedback type or target");
  if(['adopted','rejected','corrected','undo'].includes(kind)&&(!byUser||!reason))throw new Error("Benefit/correction feedback requires an explicit user reply and reason");
  const release=acquireFileLock(join(root,'state','growth-feedback.lock'));
  try{
    const rows=readLocalLog(root,GROWTH_LOG);
    if(kind==='undo'&&!rows.some(e=>e.event_id===undoId&&e.kind!=='undo'))throw new Error("Feedback to undo does not exist");
    const entry={event_id:eventId||randomUUID(),ts:new Date().toISOString(),kind,target,reason,project,sid,undo_id:undoId||undefined,actor:byUser?'user':['retrieved','routed'].includes(kind)?'mechanical':'host_report'};
    const previous=rows.find(e=>e.event_id===entry.event_id);
    if(previous){if(['kind','target','reason','undo_id'].some(k=>previous[k]!==entry[k]))throw new Error("Feedback event-id content conflict");return previous;}
    appendLocalLog(root,GROWTH_LOG,entry);return entry;
  }finally{release();}
}
export function growthSummary(root) {
  const rows=readLocalLog(root,GROWTH_LOG),undone=new Set(rows.filter(e=>e.kind==='undo').map(e=>e.undo_id));
  const active=rows.filter(e=>e.kind!=='undo'&&!undone.has(e.event_id));
  const counts=Object.fromEntries([...kinds].filter(k=>k!=='undo').map(k=>[k,active.filter(e=>e.kind===k).length]));
  return {status:rows.length?'observed':'no_data',counts,undone:undone.size,events:active,meaning:"Retrieval/routing is not execution or benefit. Execution is host-reported; adoption/rejection/correction is user feedback. None is converted into a growth score or monetary cost."};
}
