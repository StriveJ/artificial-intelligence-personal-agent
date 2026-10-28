// Read authoritative Markdown memory sources and derive stable content identities. Migrate old metadata only when identity/content matches are unique. Ambiguous duplicate sections must not inherit guessed relations or decay ownership.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertWithin } from './safe-path.mjs';
import { parseMemorySections } from './memory-sections.mjs';

export function readMemorySources(root) {
  const dir = join(root, 'user-space', 'memory');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(name => {
    const path = join(dir, name); assertWithin(root, path, { rejectLinks: true });
    const stat = statSync(path);
    if (!stat.isFile()) throw new Error("Memory source is not a regular file: " + name);
    const bytes = readFileSync(path);
    return { name, file: 'user-space/memory/' + name, text: bytes.toString('utf8'), hash: createHash('sha256').update(bytes).digest('hex'), mtimeMs: stat.mtimeMs };
  });
}
export const memorySourceSnapshot = sources => sources.map(({file, hash}) => ({file, hash}));

export const memoryId = (file, section) => 'mem-' + createHash('sha256').update(JSON.stringify([file, section.identity])).digest('hex').slice(0, 32);
export function memoryRecords(sources){
 return sources.flatMap(source=>{
  const sections=parseMemorySections(source.text,{withIdentity:true});
  if(!sections.length&&source.text.trim()){const title=(source.text.trim().split(/\r?\n/)[0]||'').replace(/^#+\s*/,'')||source.name;sections.push({title:title.slice(0,60),body:source.text.trim(),identity:['file:'+title,1]});}
  return sections.map(section=>({...section,id:memoryId(source.file,section),file:source.file}));
 });
}

export function migrateMemoryBindings(records, previous) {
  const bindings = new Map(), aliases = new Map(), warnings = [];
  const group = (rows, keyOf) => {
    const map = new Map();
    for (const row of rows) { const key=keyOf(row); if(!map.has(key))map.set(key,[]);map.get(key).push(row); }
    return map;
  };
  const contentHash=r=>r.body_hash||createHash('sha256').update(String(r.body).replace(/\r\n/g,'\n')).digest('hex');
  const titleKey = r => JSON.stringify([r.file,r.title]), bodyKey = r => JSON.stringify([r.file,r.title,contentHash(r)]);
  const oldId=group(previous,r=>r.id), oldTitle=group(previous,titleKey), oldBody=group(previous,bodyKey);
  const newTitle=group(records,titleKey), newBody=group(records,bodyKey), boundIds=new Map();
  for (const record of records) {
    let choices = oldId.get(record.id) || [];

    if (choices.length === 1 && contentHash(choices[0]) !== contentHash(record) && (newTitle.get(titleKey(record)) || []).length > 1) choices = [];
    if (!choices.length) {
      const exact = oldBody.get(bodyKey(record)) || [];
      choices = exact.length ? exact : oldTitle.get(titleKey(record)) || [];
      const peers = (exact.length ? newBody.get(bodyKey(record)) : newTitle.get(titleKey(record))) || [];
      if (peers.length !== 1) choices = [];
    }
    if (choices.length === 1) {
      bindings.set(record.id, choices[0]);
      const id=choices[0].id; if(!boundIds.has(id))boundIds.set(id,[]);boundIds.get(id).push(record.id);
    }
  }
  for (const prev of previous) {
    const bound = boundIds.get(prev.id) || [];
    if (oldId.get(prev.id).length === 1 && bound.length === 1) aliases.set(prev.id, bound[0]);
    else if (bound.length || newTitle.has(titleKey(prev))) warnings.push(prev.id);
  }
  return { bindings, aliases, warnings: [...new Set(warnings)] };
}
