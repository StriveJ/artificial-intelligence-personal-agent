// event archive
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { atomicWriteFile } from './atomic-write.mjs';
import { assertWithin } from './safe-path.mjs';
import {archiveHash as hash,archiveRows as rowsOf,archivePaths,archiveSourcePath as sourcePath,readArchive} from './event-archive-store.mjs';
import { acquireFileLock } from './file-lock.mjs';
import { assertNoActiveInstall } from './install-maintenance.mjs';
import { listEventFiles } from './event-store.mjs';
import { timelineLine, timelineSection } from './daily-note.mjs';

const checked = (root, path) => assertWithin(root, path, { rejectLinks: true });
function covered(root, file) {
  const note = checked(root, join(root, 'user-space/logs/daily', `DAILY-NOTE_${file.day}.md`));
  if (!existsSync(note)) return false;
  const section = timelineSection(readFileSync(note, 'utf8')); if (section === null) return false;
  const lines = new Map();
  for (const line of section.split(/\r?\n/)) if (line.startsWith('- [')) lines.set(line, (lines.get(line) || 0) + 1);

  for (const source of listEventFiles(root).filter(f => f.day === file.day)) {
    for (const { row } of rowsOf(readFileSync(checked(root, source.path)))) {
      const line = timelineLine(row), count = lines.get(line) || 0;
      if (!count) return false; lines.set(line, count - 1);
    }
  }
  return true;
}
export function pruneEvents(root, { cutoff, apply = false, force = false, fault = () => {} } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff || '')) throw new Error("Invalid cleanup date");
  assertNoActiveInstall(root);
  const release = apply ? acquireFileLock(checked(root, join(root, 'state/event-write.lock'))) : () => {};
  const result = { status: 'success', mode: apply ? 'apply' : 'preview', pruned: 0, eligible: 0, kept: [], archives: [] };
  try {
    for (const file of listEventFiles(root).filter(f => f.day < cutoff)) {
      try {
        const source = checked(root, file.path), bytes = readFileSync(source), rows = rowsOf(bytes);
        if (!rows.length || (!force && !covered(root, file))) { result.kept.push({ day: file.day, reason: "Daily report coverage is incomplete; original events preserved" }); continue; }
        result.eligible++;
        if (!apply) continue;
        const identity = hash(bytes), paths = archivePaths(root, identity), rel = relative(root, source).replace(/\\/g, '/');
        sourcePath(root, rel);
        if (existsSync(paths.data)) { if (!readFileSync(paths.data).equals(bytes)) throw new Error("Existing archive digest mismatch"); }
        else atomicWriteFile(paths.data, bytes);
        fault('archive-data', file);
        const manifest = { schema: 1, source: rel, sha256: identity, bytes: bytes.length, day: file.day, host: file.host, events: rows.map(({ row, digest }) => ({ id: row.event_id || 'legacy:' + digest, sha256: digest })) };
        if (existsSync(paths.manifest)) {
          const previous = readArchive(root, identity).manifest;
          if (previous.source !== rel) throw new Error("Identical bytes came from different sources; source preserved for review");
        } else atomicWriteFile(paths.manifest, JSON.stringify(manifest, null, 2) + '\n');
        readArchive(root, identity); fault('archive-verified', file);
        if (!readFileSync(source).equals(bytes)) throw new Error("Source events changed during archival; new original content preserved");
        unlinkSync(source); result.pruned++; result.archives.push(identity);
      } catch (error) { result.status = 'partial'; result.kept.push({ day: file.day, reason: error.message }); }
    }
    return result;
  } finally { release(); }
}
export function restoreArchivedEvents(root, identity, { apply = false } = {}) {
  assertNoActiveInstall(root);
  const release = apply ? acquireFileLock(checked(root, join(root, 'state/event-write.lock'))) : () => {};
  try {
    const archive = readArchive(root, identity), target = sourcePath(root, archive.manifest.source);
    if (existsSync(target) && !readFileSync(target).equals(archive.data)) throw new Error("Source path already contains new events; overwrite refused");
    if (apply && !existsSync(target)) atomicWriteFile(target, archive.data);
    return { status: 'success', mode: apply ? 'restored' : 'preview', identity, source: archive.manifest.source };
  } finally { release(); }
}
