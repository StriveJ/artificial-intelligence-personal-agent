// memory projection
import {readMemorySources,memoryRecords,migrateMemoryBindings} from './memory-source.mjs';
import {readMemoryIndexForRebuild} from './memory-index-store.mjs';
import {readMemoryMeta,projectMemoryMeta} from './memory-meta.mjs';
export function readMemoryProjection(root,{meta=readMemoryMeta(root)}={}){
 const records=memoryRecords(readMemorySources(root)),{bindings}=migrateMemoryBindings(records,readMemoryIndexForRebuild(root).entries);
 return records.map(e=>projectMemoryMeta({...bindings.get(e.id),...e},meta));
}
