// import
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { importPlan, normalizeMemoryPack } from './lib/memory-pack.mjs';
import { memoryIndexPath, readMemoryIndex, writeMemoryIndex } from './lib/memory-index-store.mjs';
import { assertWithin } from './lib/safe-path.mjs';
import { atomicWriteFile } from './lib/atomic-write.mjs';
import { readMemoryMeta,bindMemoryMeta,bodyHash } from './lib/memory-meta.mjs';
function arg(name) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : ''; }
const applied = [];
try {
  const root = resolve(arg('root') || '.');
  const pack = normalizeMemoryPack(JSON.parse(readFileSync(arg('pack') || 'profile-pack.json', 'utf8')));
  const plan = importPlan(root, pack, { replaceProfile: process.argv.includes('--replace-profile') });
  assertWithin(root, memoryIndexPath(root), { rejectLinks: true });
  const oldIndex = readMemoryIndex(root,{strict:true});
  const ownMetadata=readMemoryMeta(root);
  const pendingPath = assertWithin(root, join(root, '.import-pending.md'));
  const conflicts = plan.filter(f => f.conflict).map(f => f.rel);
  const report = { status: 'preview', legacy: pack.legacy, files: plan.map(f => ({ path: f.rel, action: f.same ? 'unchanged' : f.conflict ? 'conflict' : f.old ? 'replace' : 'create' })), conflicts };
  if (!process.argv.includes('--apply')) console.log(JSON.stringify(report, null, 2));
  else {
    if (conflicts.length) throw new Error("Import conflict: " + conflicts.join(', ') + "; profile replacement additionally requires --replace-profile. Resolve memory/skill conflicts manually first.");

    for (const f of plan) {
      assertWithin(root, f.path, { rejectLinks: true });
      const now = existsSync(f.path) ? readFileSync(f.path) : null;
      if (f.old ? !now?.equals(f.old) : now !== null) throw new Error("Import destination changed after preflight; preview again");
      if (f.same) continue;
      mkdirSync(dirname(f.path), { recursive: true });
      if (f.old) atomicWriteFile(f.path, f.bytes);
      else {
        const fd = openSync(f.path, 'wx', 0o600);
        try { writeFileSync(fd, f.bytes); } finally { closeSync(fd); }
      }
      applied.push(f.rel);
    }
    const memoryDir = assertWithin(root, join(root, 'user-space', 'memory'));
    mkdirSync(memoryDir, { recursive: true });
    const metadata = new Map(oldIndex.entries.map(e => [e.id, e]));
    for (const e of pack.entries) if (!metadata.has(e.id)) metadata.set(e.id, e);
    writeMemoryIndex(root, { ...oldIndex, entries: [...metadata.values()] });
    execFileSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'aipa-index.mjs'), '--root', root], { encoding: 'utf8' });
    const rebuilt = readMemoryIndex(root), sourceByFile = new Map(pack.memories.map(m => [m.path, m.source || 'import:legacy-pack']));
    for (const e of rebuilt.entries) if (sourceByFile.has(e.file)&&!ownMetadata.entries[e.id]&&!oldIndex.entries.some(p=>p.id===e.id||(p.file===e.file&&p.title===e.title&&p.body===e.body))) {
      const origin=pack.entries.find(p=>p.id===e.id)||pack.entries.find(p=>p.file===e.file&&p.title===e.title&&p.body===e.body)||{};

      bindMemoryMeta(root,e,{type:origin.type||e.type,tags:origin.tags||e.tags,projects:[],pinned:false,decision_exempt:false,
        provenance:[{ref:'import:'+e.file,kind:'external_material',hash:bodyHash(e.body)}],
        imported_confirmation:origin.confirmation||null,imported_provenance:origin.provenance||[],
        confirmation:['revoked','conflicted'].includes(origin.confirmation?.status)?{status:origin.confirmation.status,actor:'import',reason:"Import preserves source withdrawal or pending-review state"}:{status:'observed',actor:'import',reason:"Imported source attribution awaits user review; confirmation authority is not inherited automatically"},
      },{actor:'import',reason:"Content and source attribution restored; permissions require renewed verification"});
      if (!metadata.has(e.id)) e.source = sourceByFile.get(e.file);
    }
    writeMemoryIndex(root, rebuilt);
    execFileSync(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'aipa-index.mjs'),'--root',root],{stdio:'pipe'});
    atomicWriteFile(pendingPath, "# Import Review\n\nContent restored and index rebuilt. Import does not replace the user's confirmation of personal traits.\n");
    console.log(JSON.stringify({ ...report, status: 'imported', applied }, null, 2));
  }
} catch (error) {
  console.error("Import failed: " + error.message + (applied.length ? "; some files were restored. Preview again before continuing (not marked complete)." : ''));
  process.exitCode = 1;
}
