import { existsSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDecay,serializeDecay } from './memory-decay.mjs';
import { atomicWriteFile } from './atomic-write.mjs';
import { acquireFileLock } from './file-lock.mjs';
import { assertWithin } from './safe-path.mjs';
const pathOf=root=>assertWithin(root,join(root,'state','memory-decay.json'),{rejectLinks:true});
export function readDecayState(root){const path=pathOf(root);return existsSync(path)?parseDecay(readFileSync(path,'utf8'),{strict:true}):{};}
export function updateDecayState(root,update){const path=pathOf(root),release=acquireFileLock(path+'.lock');try{const next=update(readDecayState(root));atomicWriteFile(path,serializeDecay(next));return next;}finally{release();}}
