// origin checksums
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { safeRelativePath, resolveWithin } from './safe-path.mjs';
import { atomicWriteFile } from './atomic-write.mjs';
import { SYNC_MAP } from './origin-sync-map.mjs';
export const REQUIRED_ORIGIN_FILES=['ORIGIN-MANIFEST.yaml','core-space/CONSTRAINTS.md','core-space/policy.md','AGENTS.md'];
export function verifyOriginShape(root,{strict=false}={}){
  for(const rel of REQUIRED_ORIGIN_FILES){const p=resolveWithin(root,rel);if(!existsSync(p)||!lstatSync(p).isFile()||lstatSync(p).isSymbolicLink())throw new Error('missing or invalid '+rel);}
  if(strict)for(const m of SYNC_MAP){const p=resolveWithin(root,m.src);if(!existsSync(p)||lstatSync(p).isSymbolicLink()||(m.kind==='dir'?!lstatSync(p).isDirectory():!lstatSync(p).isFile()))throw new Error('missing or invalid sync source: '+m.src);}
}

export const CHECKSUM_FILE = 'origin-checksums.txt';

export const ARTIFACT_GIT_ATTRIBUTES = '# Preserve the assembled bytes used by origin-checksums.txt.\n* -text\n';
export const fileHash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export function parseChecksums(text) {
  const map = new Map();
  for (const line of String(text ?? '').split(/\r?\n/).filter(l => l.trim())) {
    const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/);
    if (!match) throw new Error("checksum mismatch: invalid checksum inventory line");
    const rel = safeRelativePath(match[2]);
    if (map.has(rel)) throw new Error("Checksum inventory contains duplicate paths");
    map.set(rel, match[1]);
  }
  return map;
}
export function artifactFiles(root) {
  const files = [];
  function walk(dir, prefix = '') {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!prefix && (item.name === '.git' || item.name === CHECKSUM_FILE)) continue;
      const rel = safeRelativePath(prefix + item.name), path = resolveWithin(root, rel);
      if (lstatSync(path).isSymbolicLink()) throw new Error("Artifacts cannot contain directory or file links");
      if (item.isDirectory()) walk(path, rel + '/');
      else if (item.isFile()) files.push(rel);
      else throw new Error("Artifact contains a special file");
    }
  }
  walk(root); return files;
}
export function renderChecksums(map) {
  return [...map].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([rel, hash]) => `${hash}  ${rel}`).join('\n') + '\n';
}
export function writeChecksums(root) {
  atomicWriteFile(join(root, '.gitattributes'), ARTIFACT_GIT_ATTRIBUTES);
  const map = new Map(artifactFiles(root).map(rel => [rel, fileHash(resolveWithin(root, rel))]));
  if (!map.size) throw new Error("Empty artifact; checksum inventory generation refused");
  atomicWriteFile(join(root, CHECKSUM_FILE), renderChecksums(map));
  return map;
}
export function verifyChecksums(root) {
  const path = resolveWithin(root, CHECKSUM_FILE);
  if (!existsSync(path)) throw new Error("Missing checksum inventory; reassemble and publish a compliant artifact");
  const map = parseChecksums(readFileSync(path, 'utf8'));
  if (!map.size || map.has(CHECKSUM_FILE)) throw new Error("Checksum inventory is empty or includes itself");
  const files = artifactFiles(root);
  if (files.length !== map.size || files.some(rel => !map.has(rel))) throw new Error("Artifact file set differs from checksum inventory");
  for (const [rel, hash] of map) if (fileHash(resolveWithin(root, rel)) !== hash) throw new Error(`checksum mismatch ${rel}`);
  return map;
}
