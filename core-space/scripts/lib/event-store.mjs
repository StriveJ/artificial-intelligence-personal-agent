// Read and append sharded event streams with stable identities. Preserve ambiguous or conflicting content for review; never overwrite it. Verify sources remain unchanged throughout scanning and reject partial results when integrity cannot be established.
import { existsSync, readdirSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { acquireFileLock } from './file-lock.mjs';
import { assertNoActiveInstall } from './install-maintenance.mjs';
import {assertWithin} from './safe-path.mjs';
import { dayKey } from './time-boundary.mjs';
import { dayStartHour,createBusinessClock } from './day-clock.mjs';
import {archiveWitnessSteps,archiveWitnessIdentities} from './event-archive-store.mjs';

import { LEGACY_HOST, hostDir, isValidHostId, normalizeHostId, resolveShardStore } from './host-id.mjs';

const DAY_RE = /^(\d{4}-\d{2}-\d{2})$/;
const LEGACY_FILE_RE = /^(\d{4}-\d{2}-\d{2})(?:@(.+))?\.jsonl$/;

export const legacyEventsDir = (root) => join(root, 'state', 'events');

export const eventsDirFor = (root, hostId) => join(hostDir(root, hostId), 'events');

export const legacyEventFileName = (day, host) => `${day}@${host}.jsonl`;

export const newEventFileName = (day) => `${day}.jsonl`;

export function eventWritePath(root, day) {
  const store = resolveShardStore(root, 'events', join('state', 'events'));
  if (store.hostId) {
    return { path: join(store.path, newEventFileName(day)), hostId: store.hostId, hint: null };
  }
  return { path: join(store.path, legacyEventFileName(day, hostname())), hostId: null, hint: store.hint };
}

export function parseLegacyEventFile(name) {
  const m = LEGACY_FILE_RE.exec(String(name || ''));
  if (!m) return null;
  return { day: m[1], host: m[2] || LEGACY_HOST };
}

export function listEventFiles(root) {
  const out = [];

  const hostsDirPath = join(root, 'state', 'hosts');
  if (existsSync(hostsDirPath)) {
    for (const ent of readdirSync(hostsDirPath, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const dir = eventsDirFor(root, ent.name);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        const m = DAY_RE.exec(f.replace(/\.jsonl$/, ''));
        if (!f.endsWith('.jsonl') || !m) continue;
        out.push({ path: join(dir, f), day: m[1], host: ent.name, legacy: false });
      }
    }
  }

  const legacyDir = legacyEventsDir(root);
  if (existsSync(legacyDir)) {
    for (const f of readdirSync(legacyDir)) {
      const p = parseLegacyEventFile(f);
      if (p) out.push({ path: join(legacyDir, f), day: p.day, host: p.host, legacy: true });
    }
  }

  return out.sort((a, b) => a.day.localeCompare(b.day) || a.host.localeCompare(b.host));
}

export function attributeHost(row, fileHost = '', { shard = false } = {}) {
  if (shard) {
    const d = normalizeHostId(fileHost);
    if (isValidHostId(d)) return d;
  }
  const own = normalizeHostId(row && row.host);
  if (isValidHostId(own)) return own;
  const fromName = normalizeHostId(fileHost);
  if (isValidHostId(fromName)) return fromName;
  return LEGACY_HOST;
}

export const EVENT_IDENTITY_SCHEMA = 1;
export const EVENT_SCAN_SCHEMA = 1;
export function eventIdentity(row,fileHost='',options={}) {
  return row?.event_id ? JSON.stringify([attributeHost(row,fileHost,options),row.sid||'',row.event_id]) : '';
}
const stableEvent = value => Array.isArray(value)?value.map(stableEvent):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stableEvent(value[k])])):value;
const hasInstant = row => typeof row.ts==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row.ts)&&Number.isFinite(Date.parse(row.ts));
export const eventContentHash = row => createHash('sha256').update(JSON.stringify(stableEvent([row.type||'',row.data??'',row.project||'',hasInstant(row)?new Date(row.ts).toISOString():'',hasInstant(row)?'':row.ts_local||'']))).digest('hex');
function* eventSetSteps(root,proof) {
  assertNoActiveInstall(root);
  const clock=createBusinessClock(root);
  const files=listEventFiles(root),identities=archiveWitnessIdentities(root);
  if(proof){proof.clock=JSON.stringify(clock.settings);proof.files=files.map(f=>f.path);proof.archives=identities;}
  const observe=proof?(path,bytes)=>proof.reads.set(path,createHash('sha256').update(bytes).digest('hex')):undefined;
  const out = [];
  const seen = new Map(), conflicts = new Map(), activeSeen=new Set(), archived=[];
  function witness(row,fileHost,shard,source){
    const id=eventIdentity(row,fileHost,{shard});if(!id)return;
    const digest=eventContentHash(row),previous=seen.get(id);
    if(previous&&(previous.digest!==digest||conflicts.has(id))){
      const evidence=conflicts.get(id)||{identity:id,event_id:row.event_id,sources:[previous.source],hashes:[previous.digest]};
      evidence.sources=[...new Set([...evidence.sources,source])];evidence.hashes=[...new Set([...evidence.hashes,digest])];conflicts.set(id,evidence);
    }
    if(!previous)seen.set(id,{digest,source});
  }
  let processed=0;
  for(const archive of yield* archiveWitnessSteps(root,{observe,identities})){
    const source=archive.manifest.source,shard=/^state\/hosts\//.test(source);
    const host=shard?source.split('/')[2]:parseLegacyEventFile(source.split('/').pop())?.host||LEGACY_HOST;
    for(const {row} of archive.rows){if(row.event_id){witness(row,host,shard,source);archived.push({identity:eventIdentity(row,host,{shard}),digest:eventContentHash(row),source});}if(++processed%128===0)yield;}
  }
  for (const f of files) {
    let text = '';
    try {
      const bytes=readFileSync(assertWithin(root,f.path,{rejectLinks:true}));observe?.(f.path,bytes);text=bytes.toString('utf8');
    } catch {
      if(proof)throw sourceChanged();
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      if(++processed%128===0)yield;
      const t = line.trim();
      if (!t) continue;
      try {
        const row = JSON.parse(t);
        if(!row||typeof row!=='object'||Array.isArray(row))continue;
        if (row.event_id) {
          const id=eventIdentity(row,f.host,{shard:!f.legacy}),source=relative(root,f.path).replace(/\\/g,'/');
          witness(row,f.host,!f.legacy,source);
          if(activeSeen.has(id))continue;
          activeSeen.add(id);
        }
        out.push({ host: attributeHost(row, f.host, { shard: !f.legacy }), legacy: f.legacy, row:hasInstant(row)?{...row,ts_local:clock.timestamp(row.ts)}:row });
      } catch {

      }
    }
  }
  const entries=[];
  for(const entry of out){if(!conflicts.has(eventIdentity(entry.row,entry.host,{shard:!entry.legacy})))entries.push(entry);if(++processed%128===0)yield;}
  return {entries,conflicts:[...conflicts.values()],archived};
}
export function readEventSet(root){const steps=eventSetSteps(root);let step;do{step=steps.next();}while(!step.done);return step.value;}
const sourceChanged=()=>Object.assign(Error("Event source changed during scanning or cannot be verified. Retry; no partial scan delivered."),{code:'event_source_changed'});
export async function readEventSetAsync(root){
 const proof={reads:new Map()},steps=eventSetSteps(root,proof);let step=steps.next();
 while(!step.done){await new Promise(resolve=>setImmediate(resolve));step=steps.next();}

 try{
  const sameSet=()=>JSON.stringify(listEventFiles(root).map(f=>f.path))===JSON.stringify(proof.files)&&JSON.stringify(archiveWitnessIdentities(root))===JSON.stringify(proof.archives);
  if(!sameSet())throw sourceChanged();

  for(const [path,digest] of proof.reads)if(createHash('sha256').update(readFileSync(assertWithin(root,path,{rejectLinks:true}))).digest('hex')!==digest)throw sourceChanged();
  if(!sameSet()||JSON.stringify(createBusinessClock(root).settings)!==proof.clock)throw sourceChanged();
 }catch{throw sourceChanged();}
 assertNoActiveInstall(root);return step.value;
}
export function readEventsByHost(root) { return readEventSet(root).entries; }

export function readEvents(root) {
  return readEventsByHost(root).map((e) => e.row);
}

export function appendEvent(root, row) {
  assertNoActiveInstall(root);
  const release = acquireFileLock(join(root, 'state', 'event-write.lock'));
  try {
    const rec = { ...row, event_id: row.event_id || randomUUID() };
    if(hasInstant(rec))rec.ts_local=createBusinessClock(root).timestamp(rec.ts);
    if (typeof rec.event_id !== 'string' || !rec.event_id || rec.event_id.length > 512 || /[\r\n\0]/.test(rec.event_id)) throw new Error("Invalid event-id");
    const destination=eventWritePath(root,dayKey(rec.ts_local,dayStartHour(root))),set=readEventSet(root),identity=eventIdentity(rec,destination.hostId||hostname(),{shard:!!destination.hostId});
    if(set.conflicts.some(c=>c.identity===identity))throw new Error("Same event-id has a pending conflicting variant; append/overwrite refused");
    const archived=set.archived.find(e=>e.identity===identity);
    if(archived){if(archived.digest!==eventContentHash(rec))throw Error("Same event-id conflicts with archived events; append refused");return false;}
    const previous = row.event_id ? set.entries.find(e=>eventIdentity(e.row,e.host,{shard:!e.legacy})===identity)?.row : null;
    if (previous) {
      if (['type', 'data', 'project'].some(k => previous[k] !== rec[k])) throw new Error("Same event-id has conflicting content; overwrite refused");
      return false;
    }
    const { path } = destination;
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(rec) + '\n', 'utf8');
    return true;
  } finally { release(); }
}
